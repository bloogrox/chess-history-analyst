import { signal } from '@preact/signals'

/** Настройки — в localStorage: маленькие, синхронные, переживают перезагрузку. */
const keys = ['openrouterKey', 'model', 'userName', 'depth', 'analyzeCount', 'backgroundAnalysis'] as const
type Key = (typeof keys)[number]

export function getSetting(key: Key): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // приватный режим / отключённое хранилище
  }
}

/** Единственная настройка, которую видно снаружи модалки: чип в шапке чата. */
export const model = signal(getSetting('model') ?? '')

export function setSetting(key: Key, value: string | null) {
  if (key === 'model') model.value = value ?? ''
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* игнорируем: настройка просто не переживёт перезагрузку */
  }
}
