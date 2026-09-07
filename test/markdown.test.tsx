import { describe, expect, test } from 'bun:test'
import { render } from 'preact-render-to-string'
import { Markdown, splitSegments } from '../src/lib/markdown.tsx'

const html = (text: string) => render(<Markdown text={text} />)

describe('splitSegments', () => {
  test('текст без блоков — один сегмент', () => {
    expect(splitSegments('Просто ответ')).toEqual([{ kind: 'text', text: 'Просто ответ' }])
  })

  test('текст, блок, текст', () => {
    const out = splitSegments('До\n\n```ui\n{"type":"stat"}\n```\n\nПосле')
    expect(out).toEqual([
      { kind: 'text', text: 'До\n\n' },
      { kind: 'ui', json: '{"type":"stat"}', done: true },
      { kind: 'text', text: '\nПосле' },
    ])
  })

  test('два блока подряд', () => {
    const out = splitSegments('```ui\n{"a":1}\n```\n```ui\n{"b":2}\n```')
    expect(out).toEqual([
      { kind: 'ui', json: '{"a":1}', done: true },
      { kind: 'ui', json: '{"b":2}', done: true },
    ])
  })

  test('незакрытый блок в стриме помечается недописанным', () => {
    expect(splitSegments('Текст\n```ui\n{"type":"tab')).toEqual([
      { kind: 'text', text: 'Текст\n' },
      { kind: 'ui', json: '{"type":"tab', done: false },
    ])
    expect(splitSegments('Текст\n```ui')).toEqual([
      { kind: 'text', text: 'Текст\n' },
      { kind: 'ui', json: '', done: false },
    ])
  })

  test('чужой язык забора остаётся текстом', () => {
    const src = 'Смотри\n```uikit\nне наш блок\n```\n'
    expect(splitSegments(src)).toEqual([{ kind: 'text', text: src }])
  })

  test('голый блочный JSON без забора подхватывается как ui (упавший fence)', () => {
    const out = splitSegments('До\n{"type":"stat","label":"Score"}\nПосле')
    expect(out).toEqual([
      { kind: 'text', text: 'До' },
      { kind: 'ui', json: '{"type":"stat","label":"Score"}', done: true },
      { kind: 'text', text: 'После' },
    ])
  })

  test('голый JSON неизвестного типа остаётся текстом', () => {
    const src = 'Смотри\n{"type":"hack","x":1}\nКонец'
    expect(splitSegments(src)).toEqual([{ kind: 'text', text: src }])
  })

  test('битый голый JSON остаётся текстом, а не виджетом', () => {
    const src = 'До\n{"type":"stat",\nПосле'
    expect(splitSegments(src)).toEqual([{ kind: 'text', text: src }])
  })

  test('два склеенных объекта в одном заборе режутся на два ui-сегмента', () => {
    const a = '{"type":"stat","label":"A"}'
    const b = '{"type":"stat","label":"B"}'
    expect(splitSegments(`До\n\`\`\`ui\n${a}\n${b}\n\`\`\`\nПосле`)).toEqual([
      { kind: 'text', text: 'До\n' },
      { kind: 'ui', json: a, done: true },
      { kind: 'ui', json: b, done: true },
      { kind: 'text', text: 'После' },
    ])
  })

  test('один объект с вложенностью в заборе не режется', () => {
    const one = '{"type":"table","rows":[{"a":1}]}'
    expect(splitSegments(`\`\`\`ui\n${one}\n\`\`\``)).toEqual([
      { kind: 'ui', json: one, done: true },
    ])
  })
})

describe('Markdown', () => {
  test('HTML от модели рендерится текстом, а не разметкой', () => {
    const out = html('<img src=x onerror="alert(1)"> и <b>жирный</b>')
    expect(out).not.toContain('<img')
    expect(out).not.toContain('<b>')
    expect(out).toContain('&lt;img')
  })

  test('блок кода не исполняется и не превращается в разметку', () => {
    const out = html('```html\n<script>alert(1)</script>\n```')
    expect(out).not.toContain('<script>')
    expect(out).toContain('&lt;script')
  })

  test('ссылка только на lichess, остальные — текстом', () => {
    expect(html('[партия](https://lichess.org/abc123)')).toContain('href="https://lichess.org/abc123"')
    const evil = html('[клик](javascript:alert(1)) и [левый сайт](https://example.com/x)')
    expect(evil).not.toContain('href')
    expect(evil).toContain('клик')
  })

  test('заголовок любого уровня понижается до h3', () => {
    expect(html('# Крупный')).toContain('<h3')
    expect(html('##### Мелкий')).toContain('<h3')
  })

  test('абзацы, списки и выделение', () => {
    const out = html('Первый **важный** абзац\n\n- один\n- два')
    expect(out).toContain('<strong')
    expect(out).toContain('<ul')
    expect(out).toContain('два')
  })
})
