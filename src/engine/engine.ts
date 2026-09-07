import type { Eval } from '../db/schema.ts'
import { ENGINE_CDN_FALLBACK, ENGINE_URL } from './engine-url.ts'
import { blackToMove, parseBestMove, parseInfo, toWhite } from './uci.ts'

export interface Evaluation {
  eval: Eval
  /** Лучший ход в UCI («g1f3»), null — ходов нет. */
  bestMove: string | null
}

const BOOT_TIMEOUT_MS = 60_000
type Listener = (line: string) => void

/**
 * Stockfish в отдельном воркере. Один запрос за раз — очередь внутри,
 * вызывающему достаточно ждать промис.
 */
export class Engine {
  private worker: Worker | null = null
  private booted: Promise<void> | null = null
  private listeners = new Set<Listener>()
  private queue: Promise<unknown> = Promise.resolve()

  private waitFor(done: (line: string) => boolean, onLine?: Listener): Promise<void> {
    return new Promise((resolve) => {
      const listener: Listener = (line) => {
        onLine?.(line)
        if (done(line)) {
          this.listeners.delete(listener)
          resolve()
        }
      }
      this.listeners.add(listener)
    })
  }

  private send(command: string) {
    this.worker?.postMessage(command)
  }

  /** Старт одного воркера с handshake. Бросает с actionable-текстом — модель и UI его показывают. */
  private async bootFrom(url: string): Promise<void> {
    let worker: Worker
    try {
      worker = new Worker(url)
    } catch (err) {
      throw new Error(
        `Stockfish worker failed to start from ${url} (open the app over http(s) — file:// and sandboxed previews block workers): ${err instanceof Error ? err.message : String(err)}`,
      )
    }
    this.worker = worker
    worker.onmessage = (e: MessageEvent) => {
      const line = String(e.data)
      for (const listener of [...this.listeners]) listener(line)
    }
    const failed = new Promise<never>((_, reject) => {
      worker.onerror = (e: ErrorEvent) =>
        reject(
          new Error(
            `Stockfish failed to boot from ${url} (engine file missing or blocked): ${(e as ErrorEvent).message || 'worker error'}`,
          ),
        )
      setTimeout(() => reject(new Error('Stockfish did not respond within a minute')), BOOT_TIMEOUT_MS)
    })
    const handshake = (async () => {
      const uciok = this.waitFor((l) => l === 'uciok')
      this.send('uci')
      await uciok
      const readyok = this.waitFor((l) => l === 'readyok')
      this.send('isready')
      await readyok
    })()
    try {
      await Promise.race([handshake, failed])
    } catch (err) {
      worker.terminate()
      if (this.worker === worker) this.worker = null
      throw err
    }
  }

  init(): Promise<void> {
    this.booted ??= (async () => {
      // file://: воркеры и fetch заблокированы браузером — сразу говорим как запустить, а не висим минуту
      if (typeof location !== 'undefined' && location.protocol === 'file:') {
        throw new Error(
          'Stockfish cannot run from file:// — browsers block workers on local files. ' +
            'Serve the app over http(s): `bun run dev.ts` → http://localhost:3210, or deploy dist/ to Vercel. ' +
            'Library, stats and chat work on file://, only the engine needs http(s).',
        )
      }
      // локальный движок первичен, CDN — запасной
      let lastErr: unknown = null
      for (const url of [ENGINE_URL, ENGINE_CDN_FALLBACK]) {
        try {
          await this.bootFrom(url)
          return
        } catch (err) {
          lastErr = err
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
    })().catch((err: unknown) => {
      this.booted = null // дать шанс следующей попытке
      this.listeners.clear()
      throw err
    })
    return this.booted
  }

  evaluate(fen: string, { depth = 12 }: { depth?: number } = {}): Promise<Evaluation> {
    const run = this.queue.then(async (): Promise<Evaluation> => {
      await this.init()
      const isBlack = blackToMove(fen)
      let best: Eval | null = null
      let bestDepth = -1
      let bestMove: string | null = null

      const finished = this.waitFor(
        (line) => line.startsWith('bestmove'),
        (line) => {
          if (line.startsWith('info ')) {
            const info = parseInfo(line)
            // берём последнюю строку с максимальной глубиной
            if (info && info.depth >= bestDepth) {
              bestDepth = info.depth
              best = info.score
            }
          } else if (line.startsWith('bestmove')) {
            bestMove = parseBestMove(line)
          }
        },
      )
      this.send(`position fen ${fen}`)
      this.send(`go depth ${depth}`)
      await finished

      // без единой оценки остаётся только терминальная позиция — её и записываем матом
      const score: Eval = best ?? { mate: 0 }
      return { eval: toWhite(score, isBlack), bestMove }
    })
    this.queue = run.catch(() => {})
    return run
  }

  /** Досрочно оборвать текущий расчёт: движок сразу отдаст bestmove. */
  stop() {
    this.send('stop')
  }

  dispose() {
    this.worker?.terminate()
    this.worker = null
    this.booted = null
    this.listeners.clear()
  }
}
