import { expect, test } from 'bun:test'
import { hashPgn, idFromSite, openingSplit, speedFromTimeControl, userResult } from '../src/pgn/lichess.ts'

test('контроль времени → категория (base + 40·inc)', () => {
  expect(speedFromTimeControl('15+0')).toBe('ultrabullet')
  expect(speedFromTimeControl('60+0')).toBe('bullet')
  expect(speedFromTimeControl('0+1')).toBe('bullet') // 40 с
  expect(speedFromTimeControl('300+3')).toBe('blitz') // 420 с
  expect(speedFromTimeControl('600+0')).toBe('rapid')
  expect(speedFromTimeControl('1800+0')).toBe('classical')
  expect(speedFromTimeControl('-')).toBe('correspondence')
  expect(speedFromTimeControl(undefined)).toBe('correspondence')
  expect(speedFromTimeControl('мусор')).toBe('correspondence')
})

test('id партии из Site', () => {
  expect(idFromSite('https://lichess.org/aBcD1234')).toBe('aBcD1234')
  expect(idFromSite('https://lichess.org/aBcD1234/black#42')).toBe('aBcD1234')
  expect(idFromSite('https://chess.com/game/1')).toBeNull()
  expect(idFromSite(undefined)).toBeNull()
})

test('дебют делится на семейство и вариант', () => {
  expect(openingSplit('Sicilian Defense: Dragon Variation, Yugoslav Attack')).toEqual({
    family: 'Sicilian Defense',
    variation: 'Dragon Variation, Yugoslav Attack',
  })
  expect(openingSplit("Van't Kruijs Opening")).toEqual({ family: "Van't Kruijs Opening", variation: null })
  expect(openingSplit('?')).toEqual({ family: null, variation: null })
})

test('результат с точки зрения пользователя', () => {
  expect(userResult('1-0', 'white')).toBe('win')
  expect(userResult('1-0', 'black')).toBe('loss')
  expect(userResult('0-1', 'black')).toBe('win')
  expect(userResult('1/2-1/2', 'white')).toBe('draw')
  expect(userResult('*', 'white')).toBeNull()
})

test('запасной id стабилен и различает партии', () => {
  expect(hashPgn('1. e4 e5')).toBe(hashPgn('1. e4 e5'))
  expect(hashPgn('1. e4 e5')).not.toBe(hashPgn('1. d4 d5'))
  expect(hashPgn('')).toHaveLength(8)
})
