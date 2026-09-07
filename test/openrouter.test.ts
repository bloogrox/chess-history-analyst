import { afterEach, expect, test } from 'bun:test'
import { chatStream, listModels } from '../src/agent/openrouter.ts'

const realFetch = globalThis.fetch
const stubFetch = (respond: () => Promise<Response>) => {
  globalThis.fetch = respond as unknown as typeof fetch
}
afterEach(() => {
  globalThis.fetch = realFetch
})

// в тестовой среде нет location — клиент кладёт origin в HTTP-Referer
Object.defineProperty(globalThis, 'location', { value: { origin: 'http://localhost' }, writable: true })

const sse = (...lines: string[]) =>
  new Response(new Blob([lines.map((l) => `data: ${l}\n\n`).join('')]).stream(), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })

const chunk = (delta: unknown, finish: string | null = null) =>
  JSON.stringify({ choices: [{ delta, finish_reason: finish }] })

const collect = async (response: Response) => {
  stubFetch(async () => response)
  const out = []
  for await (const event of chatStream({ key: 'k', model: 'm', messages: [] })) out.push(event)
  return out
}

test('текст приходит кусками', async () => {
  const events = await collect(
    sse(chunk({ content: 'При' }), chunk({ content: 'вет' }), chunk({}, 'stop'), '[DONE]'),
  )
  expect(events).toEqual([
    { type: 'text', delta: 'При' },
    { type: 'text', delta: 'вет' },
    { type: 'done', finishReason: 'stop' },
  ])
})

test('вызов инструмента собирается из дельт по index', async () => {
  const events = await collect(
    sse(
      chunk({ tool_calls: [{ index: 0, id: 'call_1', function: { name: 'opening_stats', arguments: '' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: '{"group' } }] }),
      chunk({ tool_calls: [{ index: 0, function: { arguments: 'By":"family"}' } }] }),
      chunk({}, 'tool_calls'),
      '[DONE]',
    ),
  )
  expect(events).toEqual([
    { type: 'tool_call', call: { id: 'call_1', name: 'opening_stats', args: { groupBy: 'family' } } },
    { type: 'done', finishReason: 'tool_calls' },
  ])
})

test('несколько вызовов подряд не путаются', async () => {
  const events = await collect(
    sse(
      chunk({
        tool_calls: [
          { index: 0, id: 'a', function: { name: 'query_games', arguments: '{"limit":' } },
          { index: 1, id: 'b', function: { name: 'trend', arguments: '{"metric":' } },
        ],
      }),
      chunk({
        tool_calls: [
          { index: 1, function: { arguments: '"score"}' } },
          { index: 0, function: { arguments: '3}' } },
        ],
      }),
      chunk({}, 'tool_calls'),
      '[DONE]',
    ),
  )
  expect(events.slice(0, 2)).toEqual([
    { type: 'tool_call', call: { id: 'a', name: 'query_games', args: { limit: 3 } } },
    { type: 'tool_call', call: { id: 'b', name: 'trend', args: { metric: 'score' } } },
  ])
})

test('битый JSON в аргументах не роняет поток — станет ошибкой валидации', async () => {
  const events = await collect(
    sse(chunk({ tool_calls: [{ index: 0, id: 'a', function: { name: 'trend', arguments: '{oops' } }] }), '[DONE]'),
  )
  expect(events[0]).toEqual({ type: 'tool_call', call: { id: 'a', name: 'trend', args: null } })
})

test('коды ошибок переводятся в понятные сообщения', async () => {
  for (const [status, text] of [
    [401, 'проверьте его в настройках'],
    [402, 'кредитов'],
    [429, 'частоту запросов'],
  ] as const) {
    stubFetch(async () => new Response('{}', { status }))
    const iterator = chatStream({ key: 'k', model: 'm', messages: [] })
    expect(iterator.next()).rejects.toThrow(text)
  }
})

test('ошибка внутри потока прерывает его', async () => {
  stubFetch(async () => sse(JSON.stringify({ error: { message: 'модель перегружена' } })))
  const iterator = chatStream({ key: 'k', model: 'm', messages: [] })
  expect(iterator.next()).rejects.toThrow('модель перегружена')
})

test('в списке моделей только умеющие инструменты', async () => {
  stubFetch(async () =>
    Response.json({
      data: [
        { id: 'a/one', name: 'One', supported_parameters: ['tools', 'temperature'] },
        { id: 'b/two', name: 'Two', supported_parameters: ['temperature'] },
        { id: 'c/three', name: 'Three' },
      ],
    }),
  )
  expect(await listModels('k')).toEqual([{ id: 'a/one', name: 'One' }])
})

test('сетевой сбой объясняется по-человечески', async () => {
  stubFetch(async () => {
    throw new TypeError('Failed to fetch')
  })
  expect(chatStream({ key: 'k', model: 'm', messages: [] }).next()).rejects.toThrow('Нет связи с OpenRouter')
})

test('отмена обрывает чтение потока, не дожидаясь сети', async () => {
  const controller = new AbortController()
  stubFetch(
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          // поток, которому всё равно на abort
          start(c) {
            const encoder = new TextEncoder()
            for (let i = 0; i < 50; i++) c.enqueue(encoder.encode(`data: ${chunk({ content: 'x' })}\n\n`))
            c.close()
          },
        }),
      ),
  )
  const events = []
  try {
    for await (const event of chatStream({ key: 'k', model: 'm', messages: [], signal: controller.signal })) {
      events.push(event)
      controller.abort()
    }
    throw new Error('поток должен был оборваться')
  } catch (err) {
    expect((err as DOMException).name).toBe('AbortError')
  }
  expect(events).toHaveLength(1)
})
