import { games } from './db/games.ts'
import { Chat } from './ui/chat.tsx'
import { Welcome } from './ui/welcome.tsx'

export function App() {
  return games.value.length === 0 ? <Welcome /> : <Chat />
}
