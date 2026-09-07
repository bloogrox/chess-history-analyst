import { lexer, type MarkedToken, type Token } from 'marked'
import type { ComponentChildren } from 'preact'
import { TableBlock } from '../genui/blocks/table.tsx'

/** Кусок ответа модели: обычный markdown или ```ui-блок (`done: false` — ещё дописывается). */
export type Segment = { kind: 'text'; text: string } | { kind: 'ui'; json: string; done: boolean }

const FENCE = '```ui'

/** Block types the renderer knows — a bare JSON paragraph with one of these is a dropped fence, not prose. */
const BLOCK_TYPES = new Set([
  'stat',
  'result_bar',
  'table',
  'board',
  'line_chart',
  'bar_chart',
  'games',
  'suggestions',
])

const isBlockJson = (s: string): boolean => {
  try {
    const o = JSON.parse(s) as { type?: unknown }
    return typeof o.type === 'string' && BLOCK_TYPES.has(o.type)
  } catch {
    return false
  }
}

/** Brace scan that skips string contents. Returns the index closing the outermost object, or -1. */
function scanBalance(s: string, st: { depth: number; inStr: boolean; esc: boolean }): number {
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (st.inStr) {
      if (st.esc) st.esc = false
      else if (ch === '\\') st.esc = true
      else if (ch === '"') st.inStr = false
      continue
    }
    if (ch === '"') st.inStr = true
    else if (ch === '{') st.depth++
    else if (ch === '}') {
      st.depth--
      if (st.depth === 0) return i
    }
  }
  return -1
}

/**
 * Several top-level JSON objects glued in one fence → each its own chunk.
 * Returns null unless the whole string is exactly ≥2 parseable objects
 * separated by whitespace (single objects pass through untouched).
 */
function splitTopObjects(raw: string): string[] | null {
  const chunks: string[] = []
  const st = { depth: 0, inStr: false, esc: false }
  let start = -1
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!
    if (st.inStr) {
      if (st.esc) st.esc = false
      else if (ch === '\\') st.esc = true
      else if (ch === '"') st.inStr = false
      continue
    }
    if (ch === '"') st.inStr = true
    else if (ch === '{') {
      if (st.depth === 0) start = i
      st.depth++
    } else if (ch === '}') {
      st.depth--
      if (st.depth === 0 && start >= 0) {
        chunks.push(raw.slice(start, i + 1))
        start = -1
      }
    }
  }
  if (chunks.length < 2 || st.depth !== 0 || start !== -1) return null
  // in-between must be whitespace only — otherwise it is prose with JSON inside, not blocks
  let pos = 0
  for (const c of chunks) {
    const at = raw.indexOf(c, pos)
    if (at < 0 || raw.slice(pos, at).trim()) return null
    pos = at + c.length
  }
  if (raw.slice(pos).trim()) return null
  // every chunk must at least parse — validation itself happens downstream in parseBlock
  try {
    for (const c of chunks) JSON.parse(c)
  } catch {
    return null
  }
  return chunks
}

/**
 * Bare block JSON (model dropped the ```ui fence) → ui segments.
 * Only a JSON object starting the line with a known "type" qualifies;
 * everything else stays text, so prose mentioning JSON never turns into widgets.
 */
function splitBare(text: string): Segment[] {
  const segs: Segment[] = []
  let textBuf: string[] = []
  const flushText = () => {
    const t = textBuf.join('\n')
    if (t.trim()) segs.push({ kind: 'text', text: t })
    textBuf = []
  }
  const lines = text.split('\n')
  let cand: string[] = []
  let active = false
  const settle = (): boolean => {
    const joined = cand.join('\n')
    const close = scanBalance(joined, { depth: 0, inStr: false, esc: false })
    if (close >= 0) {
      const head = joined.slice(0, close + 1)
      const tail = joined.slice(close + 1)
      if (!tail.trim() && isBlockJson(head.trim())) {
        flushText()
        segs.push({ kind: 'ui', json: head.trim(), done: true })
        active = false
        cand = []
        return true
      }
    }
    return false
  }
  for (const line of lines) {
    if (!active) {
      if (/^\s*\{\s*"type"\s*:/.test(line)) {
        active = true
        cand = [line]
        if (settle()) continue
      } else {
        textBuf.push(line)
      }
    } else {
      cand.push(line)
      if (settle()) continue
      if (cand.length > 40) {
        // not a block after all — give up, keep as prose
        textBuf.push(...cand)
        active = false
        cand = []
      }
    }
  }
  if (active) textBuf.push(...cand)
  flushText()
  return segs
}

/**
 * Ответ модели → сегменты. Во время стрима последний ```ui-блок закрыт ещё не бывает —
 * он приходит с `done: false`, и сообщение показывает заглушку вместо мусора.
 */
export function splitSegments(content: string): Segment[] {
  const out: Segment[] = []
  // ponytail: bare-JSON fallback lives in splitBare (models drop fences); fenced path below stays primary
  const push = (text: string) => {
    for (const seg of splitBare(text)) out.push(seg)
  }
  let i = 0
  let at = 0

  while (at < content.length) {
    const open = content.indexOf(FENCE, at)
    if (open < 0) break

    const eol = content.indexOf('\n', open)
    // ```uikit и прочие соседи по алфавиту — обычный код, не наш блок
    if (eol >= 0 && content.slice(open + FENCE.length, eol).trim()) {
      at = open + FENCE.length
      continue
    }

    push(content.slice(i, open))
    if (eol < 0) {
      out.push({ kind: 'ui', json: '', done: false })
      return out
    }

    const close = content.indexOf('\n```', eol)
    if (close < 0) {
      out.push({ kind: 'ui', json: content.slice(eol + 1), done: false })
      return out
    }

    // ponytail: one fence sometimes carries two glued objects — split, else parseBlock dies on the pair
    const raw = content.slice(eol + 1, close)
    const glued = splitTopObjects(raw)
    if (glued) for (const json of glued) out.push({ kind: 'ui', json, done: true })
    else out.push({ kind: 'ui', json: raw, done: true })
    const after = content.indexOf('\n', close + 1)
    i = at = after < 0 ? content.length : after + 1
  }

  push(content.slice(i))
  return out
}

/** Ссылки наружу — только на партии Lichess: текст модели недоверенный. */
const safeHref = (href: string) => /^https:\/\/lichess\.org\/[\w/?=&.-]*$/.test(href)

/**
 * Markdown модели → VNode. HTML-токены превращаются в текст, никакого innerHTML:
 * ответ LLM — граница доверия.
 */
export function Markdown({ text }: { text: string }) {
  return <div class="flex max-w-[720px] flex-col gap-2.5 text-[15px] leading-[1.55] text-pretty">{blocks(lexer(text))}</div>
}

function blocks(tokens: Token[]): ComponentChildren {
  return tokens.map((token, i) => {
    const t = token as MarkedToken
    switch (t.type) {
      case 'space':
        return null
      case 'paragraph':
        return <p key={i}>{inline(t.tokens)}</p>
      case 'heading':
        // любой уровень — h3: заголовок внутри ответа не конкурирует с заголовком чата
        return (
          <h3 key={i} class="font-serif text-[17px] font-bold">
            {inline(t.tokens)}
          </h3>
        )
      case 'list':
        return (
          <Bullets key={i} ordered={t.ordered}>
            {t.items.map((item, j) => (
              <li key={j}>{item.tokens ? blocks(item.tokens) : item.text}</li>
            ))}
          </Bullets>
        )
      case 'list_item':
      case 'text':
        return <p key={i}>{t.tokens ? inline(t.tokens) : t.text}</p>
      case 'blockquote':
        return (
          <blockquote key={i} class="border-l-2 border-line pl-3 text-ink-2">
            {blocks(t.tokens)}
          </blockquote>
        )
      case 'code':
        return (
          <pre key={i} class="overflow-x-auto rounded border border-line bg-card p-3 font-mono text-xs">
            {t.text}
          </pre>
        )
      case 'table':
        return (
          <TableBlock
            key={i}
            columns={t.header.map((h, c) => ({ key: String(c), label: h.text, align: align(t.align[c]) }))}
            rows={t.rows.map((row) => Object.fromEntries(row.map((c, ci) => [String(ci), c.text])))}
          />
        )
      case 'hr':
        return <hr key={i} class="border-line" />
      default:
        // html и всё незнакомое — текстом
        return <p key={i}>{plain(token)}</p>
    }
  })
}

const align = (a: 'center' | 'left' | 'right' | null | undefined) => (a === 'right' ? 'right' : 'left')

function Bullets({ ordered, children }: { ordered: boolean; children: ComponentChildren }) {
  const cls = `flex flex-col gap-1 pl-5 ${ordered ? 'list-decimal' : 'list-disc'}`
  return ordered ? <ol class={cls}>{children}</ol> : <ul class={cls}>{children}</ul>
}

/** Незнакомый или опасный токен — только его собственный текст, без разметки. */
const plain = (token: Token) => (token as { text?: string }).text ?? token.raw

function inline(tokens: Token[] | undefined): ComponentChildren {
  return tokens?.map((token, i) => {
    const t = token as MarkedToken
    switch (t.type) {
      case 'strong':
        return (
          <strong key={i} class="font-semibold">
            {inline(t.tokens)}
          </strong>
        )
      case 'em':
        return <em key={i}>{inline(t.tokens)}</em>
      case 'del':
        return <del key={i}>{inline(t.tokens)}</del>
      case 'codespan':
        return (
          <code key={i} class="font-mono text-[13px]">
            {t.text}
          </code>
        )
      case 'link':
        return safeHref(t.href) ? (
          <a key={i} href={t.href} target="_blank" rel="noreferrer noopener">
            {inline(t.tokens)}
          </a>
        ) : (
          <span key={i}>{t.text}</span>
        )
      case 'br':
        return <br key={i} />
      case 'text':
        return t.tokens ? inline(t.tokens) : t.text
      default:
        // html, image и прочее — только текстом
        return plain(token)
    }
  })
}
