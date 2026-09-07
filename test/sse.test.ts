import { expect, test } from 'bun:test'
import { sseJson } from '../src/lib/sse.ts'

const encoder = new TextEncoder()
const streamOf = (...chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })

const collect = async (...chunks: string[]) => {
  const out: unknown[] = []
  for await (const event of sseJson(streamOf(...chunks))) out.push(event)
  return out
}

test('обычный поток событий', async () => {
  expect(await collect('data: {"a":1}\n\ndata: {"a":2}\n\ndata: [DONE]\n\n')).toEqual([
    { a: 1 },
    { a: 2 },
  ])
})

test('JSON, разорванный между чанками, склеивается', async () => {
  expect(await collect('data: {"choi', 'ces":[{"delta":{"content":"при', 'вет"}}]}\n\n')).toEqual([
    { choices: [{ delta: { content: 'привет' } }] },
  ])
})

test('разрыв внутри многобайтового символа', async () => {
  const bytes = encoder.encode('data: {"t":"ё"}\n\n')
  const split = 12 // ровно посередине «ё»
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(bytes.slice(0, split))
      c.enqueue(bytes.slice(split))
      c.close()
    },
  })
  const out: unknown[] = []
  for await (const event of sseJson(stream)) out.push(event)
  expect(out).toEqual([{ t: 'ё' }])
})

test('комментарии и пустые строки пропускаются', async () => {
  expect(await collect(': OPENROUTER PROCESSING\n\n', 'data: {"a":1}\n\n', ': keep-alive\n')).toEqual([
    { a: 1 },
  ])
})

test('[DONE] завершает, всё после него игнорируется', async () => {
  expect(await collect('data: {"a":1}\n\ndata: [DONE]\n\ndata: {"a":2}\n\n')).toEqual([{ a: 1 }])
})

test('поток без завершающего перевода строки', async () => {
  expect(await collect('data: {"a":1}')).toEqual([]) // недописанная строка не событие
})
