/**
 * Архив → тексты отдельных партий. Устойчиво к CRLF, BOM и мусору между партиями:
 * границей считается начало строки `[Event `, всё до первой такой строки отбрасывается.
 */
export function splitPgn(text: string): string[] {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split(/(?=^\[Event\s)/m)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('[Event'))
}
