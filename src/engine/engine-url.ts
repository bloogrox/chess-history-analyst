/**
 * Stockfish 18 lite single-thread (~7 МБ wasm, без SharedArrayBuffer — обычные
 * статические заголовки, без COOP/COEP).
 * Первично файлы лежат рядом с приложением (`/stockfish/…`: dev.ts отдаёт из
 * node_modules, build.ts копирует в dist). CDN — только запасной вариант,
 * если локальных файлов нет (старая сборка).
 */
export const ENGINE_URL = '/stockfish/stockfish-18-lite-single.js'

export const ENGINE_CDN_FALLBACK =
  'https://unpkg.com/stockfish@18.0.8/bin/stockfish-18-lite-single.js'
