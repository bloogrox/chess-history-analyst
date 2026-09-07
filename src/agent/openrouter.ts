import type { ToolCall } from '../db/schema.ts'
import { sseJson } from '../lib/sse.ts'

const API = 'https://openrouter.ai/api/v1'

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[]
  tool_call_id?: string
}

export interface ToolSpec {
  type: 'function'
  function: { name: string; description: string; parameters: unknown }
}

export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; finishReason: string | null }

export interface Model {
  id: string
  name: string
}

interface Delta {
  content?: string | null
  tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[]
}

interface Chunk {
  choices?: { delta?: Delta; finish_reason?: string | null }[]
  error?: { message?: string }
}

function headers(key: string) {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': location.origin,
    'X-Title': 'Chess Agent',
  }
}

/** fetch кидает голый TypeError на любой сетевой сбой — переводим на человеческий. */
async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new Error('Нет связи с OpenRouter — проверьте интернет и попробуйте ещё раз')
  }
}

async function failure(response: Response): Promise<Error> {
  const body = await response.text().catch(() => '')
  const detail = (() => {
    try {
      return String(JSON.parse(body)?.error?.message ?? '')
    } catch {
      return body.slice(0, 200)
    }
  })()
  if (response.status === 401) return new Error('OpenRouter не принял ключ — проверьте его в настройках')
  if (response.status === 402) return new Error('На счёте OpenRouter не осталось кредитов')
  if (response.status === 429) return new Error('OpenRouter ограничил частоту запросов, попробуйте ещё раз')
  // модель без поддержки инструментов агенту не годится, а список моделей такие прячет
  if (/tool|function.?call/i.test(detail))
    return new Error('Эта модель не умеет вызывать инструменты — выберите другую в настройках')
  return new Error(detail || `OpenRouter ответил ${response.status}`)
}

/** Модели, умеющие вызывать инструменты, — остальные агенту не годятся. */
export async function listModels(key: string): Promise<Model[]> {
  const response = await request(`${API}/models`, { headers: headers(key) })
  if (!response.ok) throw await failure(response)
  const data = (await response.json()) as {
    data?: { id: string; name?: string; supported_parameters?: string[] }[]
  }
  return (data.data ?? [])
    .filter((m) => m.supported_parameters?.includes('tools'))
    .map((m) => ({ id: m.id, name: m.name ?? m.id }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Стриминг ответа модели. Текст отдаётся кусками, вызовы инструментов — целиком:
 * их аргументы приходят по частям и до конца потока не разобрать.
 */
export async function* chatStream({
  key,
  model,
  messages,
  tools,
  signal,
}: {
  key: string
  model: string
  messages: ApiMessage[]
  tools?: ToolSpec[]
  signal?: AbortSignal
}): AsyncGenerator<StreamEvent> {
  const response = await request(`${API}/chat/completions`, {
    method: 'POST',
    headers: headers(key),
    signal,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
    }),
  })
  if (!response.ok) throw await failure(response)
  if (!response.body) throw new Error('OpenRouter вернул пустой ответ')

  // аргументы вызова приходят кусками, собираем их по index
  const pending = new Map<number, { id: string; name: string; args: string }>()
  let finishReason: string | null = null

  for await (const chunk of sseJson<Chunk>(response.body)) {
    // не ждём, пока об отмене узнает сеть: кнопка «Стоп» должна срабатывать сразу
    if (signal?.aborted) throw new DOMException('Ответ остановлен', 'AbortError')
    if (chunk.error?.message) throw new Error(chunk.error.message)
    const choice = chunk.choices?.[0]
    if (!choice) continue
    if (choice.finish_reason) finishReason = choice.finish_reason

    const delta = choice.delta
    if (delta?.content) yield { type: 'text', delta: delta.content }

    for (const part of delta?.tool_calls ?? []) {
      const call = pending.get(part.index) ?? { id: '', name: '', args: '' }
      if (part.id) call.id = part.id
      if (part.function?.name) call.name = part.function.name
      if (part.function?.arguments) call.args += part.function.arguments
      pending.set(part.index, call)
    }
  }

  for (const [index, call] of [...pending].sort(([a], [b]) => a - b)) {
    yield {
      type: 'tool_call',
      call: { id: call.id || `call_${index}`, name: call.name, args: parseArgs(call.args) },
    }
  }
  yield { type: 'done', finishReason }
}

/** Модель иногда шлёт битый JSON — пусть это станет ошибкой валидации, а не падением цикла. */
function parseArgs(raw: string): unknown {
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
