import { signal } from '@preact/signals'
import { chats, newChat, putChat } from '../db/chats.ts'
import { getSetting } from '../db/settings.ts'
import type { Chat, Message, ToolCall } from '../db/schema.ts'
import { chatStream, type ApiMessage } from './openrouter.ts'
import { systemPrompt } from './prompt.ts'
import { runTool, toolSpecs } from './registry.ts'

const MAX_ITERATIONS = 8
const SAVE_EVERY_MS = 1000
const TITLE_LENGTH = 60

export const currentChat = signal<Chat>(newChat())
/** Сообщения текущего разговора, включая то, что прямо сейчас стримится. */
export const messages = signal<Message[]>([])
export const streaming = signal(false)
export const chatError = signal<string | null>(null)

let controller: AbortController | null = null

export function stopStreaming() {
  controller?.abort()
}

export function chatTitle(text: string) {
  return text.trim().slice(0, TITLE_LENGTH) || 'Новый разговор'
}

export function openChat(chat: Chat) {
  currentChat.value = chat
  messages.value = chat.messages
  chatError.value = null
  if (location.hash.slice(1) !== chat.id) location.hash = chat.id
}

export function startNewChat() {
  openChat(newChat())
}

/** Разговор выбирается адресом: id в location.hash, роутер не нужен. */
export function openFromHash() {
  const id = location.hash.slice(1)
  if (id === currentChat.value.id) return
  const found = chats.value.find((c) => c.id === id)
  if (found) openChat(found)
  else startNewChat()
}

const UNANSWERED = { error: 'вызов не был выполнен' }

const toolReply = (id: string, payload: unknown): ApiMessage => ({
  role: 'tool',
  tool_call_id: id,
  content: JSON.stringify(payload),
})

/**
 * Короткая ручка вызова («opening_stats#1») — то, чем GenUI-блок ссылается на результат.
 * Настоящий tool_call_id для этого не годится: он непрозрачный, лежит в прошлых сообщениях,
 * и все проверенные модели вместо него сочиняли похожий. Ручку модель копирует из результата
 * инструмента, который читает прямо перед тем, как писать блок.
 * Считается по всей истории, чтобы цикл и рендер получали одни и те же имена.
 */
export function toolHandles(history: Message[]): Map<string, string> {
  const seen = new Map<string, number>()
  const handles = new Map<string, string>()
  for (const m of history) {
    for (const call of m.role === 'assistant' ? (m.toolCalls ?? []) : []) {
      const n = (seen.get(call.name) ?? 0) + 1
      seen.set(call.name, n)
      handles.set(call.id, `${call.name}#${n}`)
    }
  }
  return handles
}

/** Ответ инструмента для модели: сначала ручка, потом сами данные. */
const withHandle = (handle: string | undefined, payload: unknown) =>
  handle && payload && typeof payload === 'object' ? { source: handle, ...payload } : payload

/**
 * История для API: наши сообщения → формат OpenAI.
 * За каждым assistant с `tool_calls` обязаны идти ответы на все вызовы, иначе запрос
 * отклонят целиком. Оборванный разбор такой ответ теряет — подставляем синтетический,
 * чтобы битая история никогда не уходила наружу.
 */
function toApi(history: Message[]): ApiMessage[] {
  const out: ApiMessage[] = [{ role: 'system', content: systemPrompt() }]
  const handles = toolHandles(history)
  // осиротевшие tool-сообщения (вызов потерялся) не попадут в out — они ломают запрос так же
  const answers = new Map(
    history.flatMap((m) => (m.role === 'tool' ? [[m.toolCallId, m] as const] : [])),
  )

  for (const m of history) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content })
      continue
    }
    if (m.role === 'tool') continue // ответы идут сразу за своим вызовом, ниже

    const calls = m.toolCalls ?? []
    out.push({
      role: 'assistant',
      content: m.content,
      ...(calls.length
        ? {
            tool_calls: calls.map((c) => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) },
            })),
          }
        : {}),
    })
    for (const call of calls) {
      const answer = answers.get(call.id)
      const payload = answer ? (answer.error ? { error: answer.error } : answer.result) : UNANSWERED
      out.push(toolReply(call.id, withHandle(handles.get(call.id), payload)))
    }
  }

  return out
}

/**
 * Один ход диалога: стрим ответа, выполнение инструментов, снова стрим — до 8 кругов.
 * Каждое сообщение переживает перезагрузку: пишем в IndexedDB не чаще раза в секунду
 * и обязательно в конце.
 */
export async function sendMessage(text: string): Promise<void> {
  const key = getSetting('openrouterKey')
  const model = getSetting('model')
  if (!key) return void (chatError.value = 'Добавьте ключ OpenRouter в настройках')
  if (!model) return void (chatError.value = 'Выберите модель в настройках')

  const chat = currentChat.value
  chatError.value = null
  controller = new AbortController()
  streaming.value = true

  let lastSave = 0
  const save = async (force = false) => {
    if (!force && Date.now() - lastSave < SAVE_EVERY_MS) return
    lastSave = Date.now()
    const saved = {
      ...chat,
      title: chat.title || chatTitle(text),
      updatedAt: new Date().toISOString(),
      messages: messages.value,
    }
    currentChat.value = saved
    await putChat(saved)
  }

  messages.value = [...messages.value, { role: 'user', content: text }]
  await save(true)

  try {
    for (let round = 0; round < MAX_ITERATIONS; round++) {
      const last = round === MAX_ITERATIONS - 1
      const reply: Message = { role: 'assistant', content: '' }
      messages.value = [...messages.value, reply]

      const calls: ToolCall[] = []

      for await (const event of chatStream({
        key,
        model,
        messages: toApi(messages.value.slice(0, -1)),
        // на последнем круге инструменты убираем — модель обязана ответить словами
        tools: last ? undefined : toolSpecs(),
        signal: controller.signal,
      })) {
        if (event.type === 'text') {
          reply.content += event.delta
          messages.value = [...messages.value]
          await save()
        } else if (event.type === 'tool_call') {
          calls.push(event.call)
        }
      }

      if (calls.length) reply.toolCalls = calls
      messages.value = [...messages.value]
      await save(true)

      // finish_reason у некоторых моделей приходит 'stop' даже с вызовами — верим вызовам
      if (!calls.length) return

      for (const call of calls) {
        const startedAt = Date.now()
        const result = await runTool(call.name, call.args)
        messages.value = [
          ...messages.value,
          { role: 'tool', toolCallId: call.id, name: call.name, result, ms: Date.now() - startedAt },
        ]
        await save(true)
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    chatError.value = err instanceof Error ? err.message : String(err)
  } finally {
    streaming.value = false
    controller = null
    await save(true)
  }
}
