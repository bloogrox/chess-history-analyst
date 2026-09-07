import { expect, test } from 'bun:test'
import { App } from '../src/app.tsx'
import { games } from '../src/db/games.ts'
import { Chat } from '../src/ui/chat.tsx'
import { Welcome } from '../src/ui/welcome.tsx'
import { makeGame } from './factory.ts'

test('пустая библиотека → welcome, непустая → чат', () => {
  games.value = []
  expect(App().type).toBe(Welcome)

  games.value = [makeGame({ id: 'a' })]
  expect(App().type).toBe(Chat)
})
