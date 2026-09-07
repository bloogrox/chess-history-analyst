import { afterAll, expect, test } from 'bun:test'
import { fetchLichessGames } from '../src/pgn/lichess-fetch.ts'

const realFetch = globalThis.fetch
afterAll(() => {
  globalThis.fetch = realFetch
})

const game = (n: number) => `[Event "Rated blitz game"]\n[Site "https://lichess.org/g${n}"]\n\n1. e4 e5 1-0\n\n`

/** Ответ выдаётся кусками, чтобы граница партии попадала внутрь куска. */
function serve(text: string, status = 200, chunk = 17) {
  let url = ''
  globalThis.fetch = (async (input: string | URL) => {
    url = String(input)
    if (status !== 200) return new Response('нет', { status })
    const bytes = new TextEncoder().encode(text)
    return new Response(
      new ReadableStream({
        start(controller) {
          for (let i = 0; i < bytes.length; i += chunk) controller.enqueue(bytes.slice(i, i + chunk))
          controller.close()
        },
      }),
      { status: 200 },
    )
  }) as unknown as typeof fetch
  return () => url
}

test('весь архив собирается из кусков, прогресс считает завершённые партии', async () => {
  const archive = [1, 2, 3].map(game).join('')
  serve(archive)
  const progress: number[] = []
  const text = await fetchLichessGames({ userName: 'вася', onProgress: (n) => progress.push(n) })
  expect(text).toBe(archive)
  // третья партия дочитывается последней: `\n[Event ` перед ней — второе и последнее вхождение
  expect(progress.at(-1)).toBe(2)
  expect(progress).toEqual([...progress].sort((a, b) => a - b))
})

test('ник и параметры уходят в адрес, since и max добавляются только при необходимости', async () => {
  const url = serve(game(1))
  await fetchLichessGames({ userName: 'Ня Ня', since: 1700000000000, max: 200 })
  expect(url()).toContain('/api/games/user/%D0%9D%D1%8F%20%D0%9D%D1%8F')
  expect(url()).toContain('evals=true')
  expect(url()).toContain('opening=true')
  expect(url()).toContain('since=1700000000000')
  expect(url()).toContain('max=200')

  const plain = serve(game(1))
  await fetchLichessGames({ userName: 'вася' })
  expect(plain()).not.toContain('since=')
  expect(plain()).not.toContain('max=')
})

test('коды ответа превращаются в понятные сообщения', async () => {
  serve('', 404)
  expect(fetchLichessGames({ userName: 'неттакого' })).rejects.toThrow('не найден')
  serve('', 429)
  expect(fetchLichessGames({ userName: 'вася' })).rejects.toThrow('ограничил скорость')
  serve('', 500)
  expect(fetchLichessGames({ userName: 'вася' })).rejects.toThrow('500')
})

test('сетевой сбой не выпускает наружу голый TypeError', async () => {
  globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch
  expect(fetchLichessGames({ userName: 'вася' })).rejects.toThrow('Нет связи с Lichess')
})

test('отмена пробрасывается как AbortError, а не как ошибка загрузки', async () => {
  globalThis.fetch = (() =>
    Promise.reject(new DOMException('отменено', 'AbortError'))) as unknown as typeof fetch
  expect(fetchLichessGames({ userName: 'вася' })).rejects.toThrow('отменено')
})
