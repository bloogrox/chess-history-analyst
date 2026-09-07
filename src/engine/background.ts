import { effect, signal } from '@preact/signals'
import { streaming } from '../agent/loop.ts'
import { games } from '../db/games.ts'
import { getSetting, setSetting } from '../db/settings.ts'
import type { Game } from '../db/schema.ts'
import { analysisProgress, analyzeGame } from './analyze.ts'

/**
 * Фоновый разбор последних N партий движком. Очередь не хранится: она каждый раз
 * пересчитывается из библиотеки, поэтому перезагрузка продолжает с того же места.
 * Фон всегда уступает: ответу агента, разбору по запросу из чата и кнопке паузы.
 */

/** Сколько последних партий держать разобранными. 0 — выключено. */
export const backgroundLimit = signal(Number(getSetting('backgroundAnalysis')) || 0)

/** Пауза кнопкой в карточке библиотеки. */
export const backgroundPaused = signal(false)

export function setBackgroundLimit(value: number) {
  backgroundLimit.value = value
  setSetting('backgroundAnalysis', String(value))
}

let controller: AbortController | null = null
let running = false

const analyzed = (game: Game) => game.analysis?.source === 'stockfish'

const recent = () =>
  [...games.value].sort((a, b) => b.date.localeCompare(a.date)).slice(0, backgroundLimit.value)

/** Строка «Фоновый разбор: 12 из 50» в карточке библиотеки. */
export function backgroundStatus(): { done: number; total: number } | null {
  if (!backgroundLimit.value) return null
  const list = recent()
  return { done: list.filter(analyzed).length, total: list.length }
}

const free = () =>
  backgroundLimit.value > 0 &&
  !backgroundPaused.value &&
  !streaming.value &&
  analysisProgress.value === null

async function run() {
  running = true
  try {
    while (free()) {
      const next = recent().find((game) => !analyzed(game))
      if (!next) break
      controller = new AbortController()
      try {
        await analyzeGame(next, { signal: controller.signal })
      } catch (err) {
        // отмена — штатный способ уступить движок; всё разобранное уже в базе
        if (!(err instanceof DOMException && err.name === 'AbortError')) throw err
      }
      await new Promise((resolve) => setTimeout(resolve)) // отдаём кадр интерфейсу
    }
  } finally {
    running = false
    controller = null
  }
}

// Запуск и остановка целиком реактивные: сигналы паузы, настройки и самой библиотеки
// (новая порция партий после импорта) сами будят цикл.
effect(() => {
  if (!free() || !games.value.length) controller?.abort()
  else if (!running) void run()
})
