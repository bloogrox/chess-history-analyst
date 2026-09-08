# Chess History Analyst


Personal chess analysis agent. Import your Lichess game archive, and the agent finds patterns, digs into the causes of mistakes, and shows them on charts — no manual engine-graph spelunking.


## What it does

- **Import your history**
- **On-device engine analysis** — Stockfish (WASM) evaluates games locally.
- **Ask in plain language** — "Analyze my level of play", "What should I focus on?". The agent answers only from your archive and shows what each conclusion is based on.
- **Visual answers** — stats, result bars, tables, line/bar charts, game lists, and board diagrams are rendered inline next to the text.
- **Private by default** — games, evals, chats, and the API key live in the browser (IndexedDB / local storage). Requests go straight from your browser to OpenRouter — no intermediary backend.


## Quickstart

```bash
bun install
bun run build   # → dist/index.html
```

open `dist/index.html`


## Tech stack

- Preact, Tailwind CSS 4
- chess.js
- Stockfish 18 Lite
- OpenRouter


## License

MIT — see [LICENSE](LICENSE).
