import type { Game } from '../src/db/schema.ts'

/** Синтетическая партия с разумными значениями по умолчанию. */
export function makeGame(patch: Partial<Game> & { id: string }): Game {
  return {
    url: null,
    date: '2026-01-01T00:00:00Z',
    white: 'petrov77',
    black: 'opponent',
    whiteElo: 1900,
    blackElo: 1900,
    userColor: 'white',
    userResult: 'win',
    userRating: 1900,
    opponentRating: 1900,
    ratingDiff: null,
    speed: 'blitz',
    timeControl: '300+0',
    eco: 'C50',
    openingFamily: 'Italian Game',
    openingVariation: null,
    termination: 'Normal',
    moves: ['e4', 'e5'],
    plyCount: 2,
    pgn: '',
    evalsFromLichess: false,
    analysis: null,
    ...patch,
  }
}
