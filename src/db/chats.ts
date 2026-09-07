import { signal } from '@preact/signals'
import { db, type Chat } from './schema.ts'

export const chats = signal<Chat[]>([])

export async function loadChats() {
  const all = await (await db()).getAll('chats')
  chats.value = all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function putChat(chat: Chat) {
  await (await db()).put('chats', chat)
  const rest = chats.value.filter((c) => c.id !== chat.id)
  chats.value = [chat, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function removeChat(id: string) {
  await (await db()).delete('chats', id)
  chats.value = chats.value.filter((c) => c.id !== id)
}

export async function clearChats() {
  await (await db()).clear('chats')
  chats.value = []
}

export function newChat(): Chat {
  const now = new Date().toISOString()
  return { id: crypto.randomUUID(), title: '', createdAt: now, updatedAt: now, messages: [] }
}
