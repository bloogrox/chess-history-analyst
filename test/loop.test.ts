import 'fake-indexeddb/auto'
import { afterAll, beforeEach, expect, test } from 'bun:test'

// в bun test нет ни location, ни localStorage — подставляем минимум, нужный клиенту и настройкам
Object.defineProperty(globalThis, 'location', { value: { origin: 'http://localhost', hash: '' }, writable: true })
const store = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
  writable: true,
})

const { chatError, currentChat, messages, sendMessage, startNewChat, streaming, toolHandles } =
  await import('../src/agent/loop.ts')
const { chats, loadChats } = await import('../src/db/chats.ts')
const { games } = await import('../src/db/games.ts')
const { library } = await import('./library.ts')
const { parseBlock } = await import('../src/genui/schema.ts')
const { splitSegments } = await import('../src/lib/markdown.tsx')

games.value = library

/** Модель подменяется на уровне сети: цикл и клиент OpenRouter работают настоящие. */
interface Request {
  tools?: unknown[]
  messages: { role: string; content: string }[]
}
let rounds: string[][] = []
let requests: Request[] = []
let failWith: Error | null = null

const realFetch = globalThis.fetch
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  requests.push(JSON.parse(String(init?.body)) as Request)
  if (failWith) throw failWith
  const lines = rounds.shift() ?? [JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })]
  const body = [...lines, '[DONE]'].map((l) => `data: ${l}\n\n`).join('')
  return new Response(new Blob([body]).stream(), { status: 200 })
}) as unknown as typeof fetch
afterAll(() => {
  globalThis.fetch = realFetch
})

const text = (delta: string) => JSON.stringify({ choices: [{ delta: { content: delta } }] })
const call = (id: string, name: string, args: unknown) =>
  JSON.stringify({
    choices: [
      { delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] } },
    ],
  })
const finish = (reason: string) => JSON.stringify({ choices: [{ delta: {}, finish_reason: reason }] })

beforeEach(() => {
  store.set('openrouterKey', 'k')
  store.set('model', 'test/model')
  rounds = []
  requests = []
  failWith = null
  startNewChat()
})

test('без ключа и без модели — понятная подсказка, запроса нет', async () => {
  store.delete('openrouterKey')
  await sendMessage('привет')
  expect(chatError.value).toInclude('ключ OpenRouter')
  expect(requests).toHaveLength(0)

  store.set('openrouterKey', 'k')
  store.delete('model')
  await sendMessage('привет')
  expect(chatError.value).toInclude('модель')
  expect(requests).toHaveLength(0)
})

test('вызов инструмента, его результат и ответ по нему', async () => {
  rounds = [
    [call('c1', 'opening_stats', { groupBy: 'family' }), finish('tool_calls')],
    [text('Хуже всего '), text('Sicilian Defense.'), finish('stop')],
  ]
  await sendMessage('В каких дебютах я теряю больше всего очков?')

  expect(messages.value.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
  const toolMessage = messages.value[2]!
  expect(toolMessage.role === 'tool' && toolMessage.name).toBe('opening_stats')
  const result = toolMessage.role === 'tool' ? (toolMessage.result as { rows: { name: string }[] }) : null
  expect(result!.rows[0]!.name).toBe('Sicilian Defense')

  const answer = messages.value[3]!
  expect(answer.role === 'assistant' && answer.content).toBe('Хуже всего Sicilian Defense.')
  expect(streaming.value).toBe(false)
  expect(chatError.value).toBeNull()

  // результат инструмента уехал модели обратно
  const second = requests[1]!.messages
  expect(second.at(-1)!.role).toBe('tool')
  expect(second.at(-1)!.content).toInclude('Sicilian Defense')
})

test('вызовы выполняются, даже если модель прислала finish_reason stop', async () => {
  rounds = [
    // некоторые модели закрывают поток как 'stop', хотя вызов в нём есть
    [call('c1', 'library_summary', {}), finish('stop')],
    [text('В библиотеке 40 партий.'), finish('stop')],
  ]
  await sendMessage('сколько у меня партий?')
  expect(messages.value.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
  const toolMessage = messages.value[2]!
  expect(toolMessage.role === 'tool' && (toolMessage.result as { total: number }).total).toBe(40)
})

test('вызов без ответа заменяется синтетическим — битая история наружу не уходит', async () => {
  // так выглядит разговор, оборванный между вызовом инструмента и его выполнением
  messages.value = [
    { role: 'user', content: 'разбери партии' },
    {
      role: 'assistant',
      content: '',
      toolCalls: [
        { id: 'lost', name: 'analyze_games', args: { gameIds: ['sic-0'] } },
        { id: 'kept', name: 'library_summary', args: {} },
      ],
    },
    { role: 'tool', toolCallId: 'kept', name: 'library_summary', result: { total: 40 }, ms: 1 },
  ]
  rounds = [[text('Продолжаю.'), finish('stop')]]
  await sendMessage('и что там?')

  const sent = requests[0]!.messages as { role: string; content: string; tool_call_id?: string }[]
  const assistant = sent.findIndex((m) => m.role === 'assistant')
  // ответы идут сразу за своим вызовом и в том же порядке
  expect(sent.slice(assistant + 1, assistant + 3).map((m) => m.tool_call_id)).toEqual(['lost', 'kept'])
  // ручка стоит и у синтетического ответа: форма ответов инструментов одна на все случаи
  expect(JSON.parse(sent[assistant + 1]!.content)).toEqual({
    source: 'analyze_games#1',
    error: 'вызов не был выполнен',
  })
  expect(JSON.parse(sent[assistant + 2]!.content)).toEqual({ source: 'library_summary#1', total: 40 })
})

test('осиротевший ответ инструмента в API не уходит', async () => {
  messages.value = [
    { role: 'user', content: 'привет' },
    { role: 'tool', toolCallId: 'ничей', name: 'library_summary', result: { total: 40 }, ms: 1 },
  ]
  rounds = [[text('ок'), finish('stop')]]
  await sendMessage('ещё раз')
  const sent = requests[0]!.messages as { role: string; tool_call_id?: string }[]
  expect(sent.some((m) => m.tool_call_id === 'ничей')).toBe(false)
  expect(sent.map((m) => m.role)).toEqual(['system', 'user', 'user'])
})

test('вопрос вне данных — модель отвечает без инструментов', async () => {
  rounds = [[text('Чемпион мира — Гукеш.'), finish('stop')]]
  await sendMessage('кто чемпион мира?')
  expect(messages.value.map((m) => m.role)).toEqual(['user', 'assistant'])
  expect(requests).toHaveLength(1)
})

test('цикл обрывается на 8 итерациях, последний запрос — без инструментов', async () => {
  rounds = Array.from({ length: 12 }, () => [call('c', 'library_summary', {}), finish('tool_calls')])
  await sendMessage('крутись')
  expect(requests).toHaveLength(8)
  expect(requests.slice(0, 7).every((r) => Array.isArray(r.tools) && r.tools.length === 8)).toBe(true)
  expect(requests.at(-1)!.tools).toBeUndefined()
})

test('system prompt со сводкой библиотеки идёт первым сообщением', async () => {
  rounds = [[text('ок'), finish('stop')]]
  await sendMessage('привет')
  const system = requests[0]!.messages[0]!
  expect(system.role).toBe('system')
  expect(system.content).toInclude('personal chess coach')
  expect(system.content).toInclude('Games: 40')
  expect(system.content).toInclude('Sicilian Defense')
  expect(system.content).toInclude('No internal half-move numbers')
})

test('разговор с заголовком и сообщениями лежит в базе', async () => {
  rounds = [[text('ответ'), finish('stop')]]
  await sendMessage('Очень длинный вопрос, который заведомо длиннее шестидесяти символов и должен обрезаться')
  await loadChats()
  const stored = chats.value.find((c) => c.id === currentChat.value.id)!
  expect(stored.title).toHaveLength(60)
  expect(stored.title).toStartWith('Очень длинный вопрос')
  expect(stored.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
})

test('ошибка сети попадает в чат, вопрос пользователя не теряется', async () => {
  failWith = new TypeError('Failed to fetch')
  await sendMessage('привет')
  expect(chatError.value).toInclude('Нет связи с OpenRouter')
  expect(messages.value[0]!.role).toBe('user')
  expect(streaming.value).toBe(false)
})

test('невалидные аргументы возвращаются модели, а не роняют цикл', async () => {
  rounds = [
    [call('c1', 'opening_stats', { groupBy: 'ерунда' }), finish('tool_calls')],
    [text('Уточню запрос.'), finish('stop')],
  ]
  await sendMessage('дебюты')
  const toolMessage = messages.value[2]!
  expect(toolMessage.role === 'tool' && (toolMessage.result as { error: string }).error).toBe(
    'Аргументы не подошли',
  )
  expect(messages.value).toHaveLength(4)
})

test('ui-блок со source получает данные инструмента дословно', async () => {
  rounds = [
    [call('c1', 'opening_stats', { groupBy: 'family' }), finish('tool_calls')],
    [
      text('Хуже всего в сицилианской.\n\n```ui\n'),
      text('{"type":"table","source":"opening_stats#1","title":"Дебюты","highlight":0}'),
      text('\n```\n'),
      finish('stop'),
    ],
  ]
  await sendMessage('В каких дебютах я теряю больше всего очков?')

  const toolMessage = messages.value[2]!
  const result = toolMessage.role === 'tool' ? (toolMessage.result as Record<string, unknown>) : {}
  const answer = messages.value[3]!
  const content = answer.role === 'assistant' ? answer.content : ''

  const segments = splitSegments(content)
  expect(segments.map((s) => s.kind)).toEqual(['text', 'ui'])

  const ui = segments[1] as { kind: 'ui'; json: string; done: boolean }
  expect(ui.done).toBe(true)
  // блок ссылается ручкой, которую цикл положил в ответ инструмента
  const handle = toolHandles(messages.value).get('c1')!
  expect(handle).toBe('opening_stats#1')
  expect(JSON.parse(requests[1]!.messages.at(-1)!.content)).toMatchObject({ source: handle })

  const block = parseBlock(ui.json, new Map([[handle, result]]))
  expect(block).toMatchObject({
    type: 'table',
    title: 'Дебюты',
    columns: result.columns as unknown[],
    rows: result.rows as unknown[],
  })
})

test('в system prompt есть каталог блоков и правило про source', async () => {
  rounds = [[text('ок'), finish('stop')]]
  await sendMessage('привет')
  const system = requests[0]!.messages[0]!.content
  for (const type of ['stat', 'result_bar', 'table', 'board', 'line_chart', 'bar_chart', 'games', 'suggestions']) {
    expect(system).toInclude(`- ${type} —`)
  }
  expect(system).toInclude('opening_stats#1')
})
