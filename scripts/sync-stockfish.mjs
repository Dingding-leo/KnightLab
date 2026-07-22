import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const packageRoot = join(projectRoot, 'node_modules', 'stockfish')
const packageMetadata = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
const expectedVersion = '18.0.8'

if (packageMetadata.version !== expectedVersion) {
  throw new Error(`Expected stockfish ${expectedVersion}, found ${packageMetadata.version ?? 'an unknown version'}.`)
}

const outputDirectory = join(projectRoot, 'public', 'stockfish')
await mkdir(outputDirectory, { recursive: true })

const engineAssets = [
  ['stockfish-18-lite-single.js', '5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391'],
  ['stockfish-18-lite-single.wasm', 'a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1'],
]

for (const [filename, expectedSha256] of engineAssets) {
  const sourcePath = join(packageRoot, 'bin', filename)
  const contents = await readFile(sourcePath)
  const sha256 = createHash('sha256').update(contents).digest('hex')
  if (sha256 !== expectedSha256) {
    throw new Error(`Stockfish asset checksum mismatch for ${filename}.`)
  }
  await copyFile(sourcePath, join(outputDirectory, filename))
}
await copyFile(join(packageRoot, 'Copying.txt'), join(outputDirectory, 'COPYING.txt'))

await writeFile(
  join(outputDirectory, 'SOURCE.txt'),
  [
    'KnightClub browser engine: Stockfish.js 18.0.8 (Stockfish 18 Lite, single-threaded)',
    'Licence: GNU General Public License version 3',
    'Exact corresponding source:',
    'https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918',
    'JavaScript SHA-256: 5243fd9b276cab7dfe3ad1d43ab9ead73568fac76468c614242977a210c4a391',
    'WebAssembly SHA-256: a8fbc05ec6920b56d7485826dcb02c5ffd2826bcbf751cf973046f237a9096f1',
    '',
    'The generated browser assets in this directory come from the pinned stockfish npm package.',
  ].join('\n'),
  'utf8',
)
