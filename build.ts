import tailwind from 'bun-plugin-tailwind'
import { rm, readdir } from 'node:fs/promises'

const DIST = 'dist'

// Clean dist
await rm(DIST, { recursive: true, force: true })

// 1. Generate Tailwind CSS via Bun.build + plugin
const cssResult = await Bun.build({
  entrypoints: ['src/styles.css'],
  outdir: DIST,
  naming: '[dir]/styles.css',
  plugins: [tailwind],
  minify: true,
  sourcemap: 'none',
})

if (!cssResult.success) {
  for (const log of cssResult.logs) console.error(log)
  process.exit(1)
}

// 2. Bundle Preact app
const appResult = await Bun.build({
  entrypoints: ['src/main.tsx'],
  outdir: DIST,
  naming: '[dir]/app.js',
  format: 'esm',
  target: 'browser',
  minify: true,
  sourcemap: 'none',
})

if (!appResult.success) {
  for (const log of appResult.logs) console.error(log)
  process.exit(1)
}

// 3. Read generated files
const css = await Bun.file(`${DIST}/styles.css`).text()
const js = await Bun.file(`${DIST}/app.js`).text()

// 4. Read template and inline
let html = await Bun.file('index.html').text()
html = html.split('__BUILD:inline-css__').join(css)
html = html.split('__BUILD:inline-js__').join(js)

// 5. Write final index.html
await Bun.write(`${DIST}/index.html`, html)

// 6. Vendor the engine next to the app (same paths dev.ts serves from node_modules).
// Repo stays clean: 7 MB wasm lives in node_modules, only dist/ carries it.
// License: engine is GPLv3 — see node_modules/stockfish/Copying.txt.
await Bun.write(`${DIST}/stockfish/stockfish-18-lite-single.js`, Bun.file('node_modules/stockfish/bin/stockfish-18-lite-single.js'))
await Bun.write(`${DIST}/stockfish/stockfish-18-lite-single.wasm`, Bun.file('node_modules/stockfish/bin/stockfish-18-lite-single.wasm'))
await Bun.write(`${DIST}/stockfish/Copying.txt`, Bun.file('node_modules/stockfish/Copying.txt'))

// 7. Clean up temp files (keep index.html + vendored engine)
const files = await readdir(DIST)
for (const file of files) {
  if (file !== 'index.html' && file !== 'stockfish') {
    await rm(`${DIST}/${file}`)
  }
}

console.log('✓ Build complete: dist/index.html')
