import { render } from 'preact'
import { App } from './app.tsx'
import { loadChats } from './db/chats.ts'
import { loadGames } from './db/games.ts'
import './engine/background.ts' // фоновый разбор просыпается сам, как только библиотека в памяти

const root = document.getElementById('root')
if (!root) throw new Error('#root не найден')

// Библиотека и разговоры нужны до первой отрисовки, иначе welcome мигнёт поверх чата
Promise.all([loadGames(), loadChats()])
  .catch((e: unknown) => console.error('Не удалось прочитать локальные данные', e))
  .finally(() => render(<App />, root))
