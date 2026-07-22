import { copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const serverDirectory = join(projectRoot, 'dist', 'server')
const workerConfiguration = {
  name: 'knightclub-chess-studio',
  compatibility_date: '2026-07-22',
  main: 'index.js',
  no_bundle: true,
  rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
  assets: { directory: '../client' },
  observability: { enabled: true },
}

await mkdir(serverDirectory, { recursive: true })
await copyFile(
  join(projectRoot, 'worker', 'static-site.js'),
  join(serverDirectory, 'index.js'),
)
await writeFile(
  join(serverDirectory, 'wrangler.json'),
  `${JSON.stringify(workerConfiguration)}\n`,
)
