import { expect, test } from 'bun:test'
import { splitPgn } from '../src/pgn/split.ts'

const game = (id: string) => `[Event "Rated blitz game"]\n[Site "https://lichess.org/${id}"]\n[Result "1-0"]\n\n1. e4 e5 1-0`

test('три партии → три текста', () => {
  const archive = [game('aaaaaaaa'), game('bbbbbbbb'), game('cccccccc')].join('\n\n')
  expect(splitPgn(archive)).toHaveLength(3)
})

test('CRLF, BOM и мусор между партиями не мешают', () => {
  const archive =
    '﻿сюда попал случайный текст\r\n\r\n' +
    game('aaaaaaaa').replace(/\n/g, '\r\n') +
    '\r\n\r\n' +
    game('bbbbbbbb').replace(/\n/g, '\r\n')
  const parts = splitPgn(archive)
  expect(parts).toHaveLength(2)
  expect(parts[0]).toStartWith('[Event')
  expect(parts[0]).not.toInclude('\r')
})

test('пустой файл и файл без заголовков → 0', () => {
  expect(splitPgn('')).toHaveLength(0)
  expect(splitPgn('   \n\n  ')).toHaveLength(0)
  expect(splitPgn('1. e4 e5 2. Nf3 Nc6 *')).toHaveLength(0)
})

test('фикстура архива', async () => {
  expect(splitPgn(await Bun.file('test/fixtures/plain.pgn').text())).toHaveLength(4)
})
