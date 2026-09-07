import { expect, test } from 'bun:test'
import { inferUser } from '../src/pgn/infer-user.ts'

test('ник пользователя — самый частый среди White/Black', async () => {
  const u = inferUser(await Bun.file('test/fixtures/plain.pgn').text())!
  expect(u.name).toBe('petrov77')
  expect(u.share).toBe(1)
  expect(u.top.map((t) => t.name)).toEqual(['petrov77', 'carlsen', 'nakamura'])
})

test('низкая доля — повод переспросить', () => {
  const archive = [
    '[White "a"]\n[Black "b"]',
    '[White "c"]\n[Black "d"]',
    '[White "a"]\n[Black "e"]',
  ].join('\n\n')
  const u = inferUser(archive)!
  expect(u.name).toBe('a')
  expect(u.share).toBeLessThan(0.9) // 2 из 3 партий
})

test('архив без игроков', () => {
  expect(inferUser('')).toBeNull()
  expect(inferUser('[White "?"]\n[Black "?"]')).toBeNull()
})
