import { describe, expect, test } from 'bun:test'
import { parseBlock } from '../src/genui/schema.ts'

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('parseBlock', () => {
  test('валидный блок без source', () => {
    const block = parseBlock('{"type":"stat","label":"Счёт","value":45.5,"sub":"было 52"}')
    expect(block).toEqual({ type: 'stat', label: 'Счёт', value: '45,5', sub: 'было 52' })
  })

  test('невалидный JSON не бросает, а возвращает ошибку', () => {
    const block = parseBlock('{"type":"stat",')
    expect(block).toHaveProperty('error')
    expect(block).toHaveProperty('json', '{"type":"stat",')
  })

  test('неизвестный тип — ошибка', () => {
    expect(parseBlock('{"type":"pie_chart","items":[]}')).toHaveProperty('error')
  })

  test('source подставляет данные инструмента, поля блока их переопределяют', () => {
    const results = new Map<string, unknown>([
      [
        'call_1',
        {
          coverage: { analyzed: 3, total: 10 },
          columns: [{ key: 'name', label: 'Дебют' }, { key: 'games', label: 'Партий', align: 'right' }],
          rows: [{ name: 'Sicilian Defense', games: 71 }],
        },
      ],
    ])
    const block = parseBlock('{"type":"table","source":"call_1","title":"Дебюты","highlight":0}', results)
    expect(block).toEqual({
      type: 'table',
      source: 'call_1',
      title: 'Дебюты',
      highlight: 0,
      columns: [{ key: 'name', label: 'Дебют' }, { key: 'games', label: 'Партий', align: 'right' }],
      rows: [{ name: 'Sicilian Defense', games: 71 }],
    })
  })

  test('source без результата — ошибка, а не пустая таблица', () => {
    expect(parseBlock('{"type":"table","source":"call_x"}', new Map())).toHaveProperty('error')
  })

  test('инструмент вернул ошибку — она и показывается', () => {
    const results = new Map<string, unknown>([['call_1', { error: 'Партия не найдена' }]])
    expect(parseBlock('{"type":"board","source":"call_1"}', results)).toMatchObject({
      error: 'Партия не найдена',
    })
  })

  test('board берёт fen из moves_from_sequence, table — те же данные строками', () => {
    const results = new Map<string, unknown>([
      [
        'call_2',
        {
          games: 44,
          fen: START,
          move: '12…',
          columns: [{ key: 'move', label: 'Ход' }],
          rows: [{ move: '12…a6', games: 44 }],
        },
      ],
    ])
    expect(parseBlock('{"type":"board","source":"call_2","caption":"Ход чёрных"}', results)).toMatchObject({
      type: 'board',
      fen: START,
      caption: 'Ход чёрных',
    })
    expect(parseBlock('{"type":"table","source":"call_2"}', results)).toMatchObject({
      rows: [{ move: '12…a6', games: 44 }],
    })
  })

  test('мусор вместо FEN не проходит схему', () => {
    expect(parseBlock('{"type":"board","fen":"<img onerror=alert(1)>"}')).toHaveProperty('error')
  })

  test('клетки подсветки и стрелок проверяются', () => {
    expect(parseBlock(`{"type":"board","fen":"${START}","highlights":["g7"],"arrows":[["d8","c8"]]}`)).toMatchObject({
      highlights: ['g7'],
      arrows: [['d8', 'c8']],
    })
    expect(parseBlock(`{"type":"board","fen":"${START}","highlights":["z9"]}`)).toHaveProperty('error')
  })

  test('таблица длиннее 50 строк не проходит', () => {
    const rows = JSON.stringify(Array.from({ length: 51 }, (_, i) => ({ name: String(i) })))
    expect(
      parseBlock(`{"type":"table","columns":[{"key":"name","label":"Дебют"}],"rows":${rows}}`),
    ).toHaveProperty('error')
  })

  test('suggestions — от одной до четырёх', () => {
    expect(parseBlock('{"type":"suggestions","items":["а","б"]}')).toMatchObject({ items: ['а', 'б'] })
    expect(parseBlock('{"type":"suggestions","items":["а","б","в","г","д"]}')).toHaveProperty('error')
  })
})
