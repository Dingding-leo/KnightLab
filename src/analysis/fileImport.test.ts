import { describe, expect, it, vi } from 'vitest'
import {
  importAnalysisFile,
  inferAnalysisFileFormat,
  MAX_ANALYSIS_FEN_IMPORT_BYTES,
  MAX_ANALYSIS_IMPORT_BYTES,
  readAnalysisFile,
} from './fileImport'

const fen = '8/8/8/8/8/8/4k3/6K1 w - - 0 1'

describe('analysis file import', () => {
  it('uses the extension for normal PGN files and returns an immutable timeline', () => {
    const text = '1. e4 e5 2. Nf3 *'
    const result = importAnalysisFile({ filename: 'evening-game.pgn', text, size: text.length })

    expect(result).toMatchObject({ ok: true, filename: 'evening-game.pgn', format: 'pgn' })
    if (!result.ok) throw new Error(result.error)
    expect(result.timeline.moves.map((move) => move.san)).toEqual(['e4', 'e5', 'Nf3'])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.timeline)).toBe(true)
    expect(Object.isFrozen(result.timeline.positions)).toBe(true)
    expect(Object.isFrozen(result.timeline.positions[0])).toBe(true)
  })

  it('uses a FEN extension and delegates canonicalization to the timeline factory', () => {
    const result = importAnalysisFile({ filename: 'study.fen', text: fen, size: fen.length })

    expect(result).toMatchObject({ ok: true, format: 'fen' })
    if (!result.ok) throw new Error(result.error)
    expect(result.timeline).toMatchObject({ source: 'fen', positions: [{ turn: 'w' }] })
  })

  it('falls back to a FEN-shaped body when the filename has no supported extension', () => {
    const result = importAnalysisFile({ filename: 'position.txt', text: fen, size: fen.length })

    expect(inferAnalysisFileFormat('position.txt', fen)).toBe('fen')
    expect(result).toMatchObject({ ok: true, format: 'fen' })
  })

  it('prioritizes a strongly FEN-shaped body over an accidental PGN extension', () => {
    const result = importAnalysisFile({ filename: 'position.pgn', text: fen, size: fen.length })

    expect(result).toMatchObject({ ok: true, format: 'fen' })
  })

  it('accepts a valid PGN that was accidentally named as a FEN, even above the FEN ceiling', () => {
    const text = `[Event "${'local game '.repeat(110)}"]\n\n1. e4 e5 2. Nf3 *`
    const result = importAnalysisFile({ filename: 'misnamed-game.fen', text, size: new TextEncoder().encode(text).byteLength })

    expect(text.length).toBeGreaterThan(MAX_ANALYSIS_FEN_IMPORT_BYTES)
    expect(result).toMatchObject({ ok: true, format: 'pgn' })
  })

  it('returns a typed error instead of throwing for invalid notation', () => {
    const result = importAnalysisFile({ filename: 'broken.pgn', text: '1. e4 impossibleMove', size: 20 })

    expect(result).toMatchObject({ ok: false, code: 'invalid-notation', format: 'pgn' })
    expect(Object.isFrozen(result)).toBe(true)
  })

  it('enforces the overall 512 KiB limit using both explicit and actual byte sizes', () => {
    const text = '1. e4 *'
    const declaredOversize = importAnalysisFile({
      filename: 'large.pgn',
      text,
      size: MAX_ANALYSIS_IMPORT_BYTES + 1,
    })
    const actualOversize = importAnalysisFile({
      filename: 'large.pgn',
      text: `${text}${'x'.repeat(MAX_ANALYSIS_IMPORT_BYTES)}`,
      size: text.length,
    })

    expect(declaredOversize).toMatchObject({ ok: false, code: 'file-too-large' })
    expect(actualOversize).toMatchObject({ ok: false, code: 'file-too-large' })
  })

  it('enforces the tighter 1 KiB FEN limit before final FEN validation', () => {
    const result = importAnalysisFile({
      filename: 'too-large.fen',
      text: fen,
      size: MAX_ANALYSIS_FEN_IMPORT_BYTES + 1,
    })

    expect(result).toMatchObject({ ok: false, code: 'fen-too-large', format: 'fen' })
  })

  it('rejects impossible explicit file sizes without touching parsing', () => {
    const result = importAnalysisFile({ filename: 'game.pgn', text: '1. e4 *', size: -1 })

    expect(result).toMatchObject({ ok: false, code: 'invalid-file-size' })
  })

  it('rejects an oversized picker selection before reading its text into the UI process', async () => {
    const text = vi.fn(async () => '1. e4 *')

    await expect(readAnalysisFile({
      name: 'too-big.pgn',
      size: MAX_ANALYSIS_IMPORT_BYTES + 1,
      text,
    })).resolves.toMatchObject({ ok: false, code: 'file-too-large' })
    expect(text).not.toHaveBeenCalled()
  })

  it('returns the one bounded file read with its validated timeline', async () => {
    const text = vi.fn(async () => '1. e4 e5 *')
    const result = await readAnalysisFile({ name: 'one-read.pgn', size: 10, text })

    expect(result).toMatchObject({ ok: true, format: 'pgn', text: '1. e4 e5 *' })
    expect(text).toHaveBeenCalledTimes(1)
  })

  it('converts a local file-read failure into a visible import result', async () => {
    await expect(readAnalysisFile({
      name: 'locked.pgn',
      size: 20,
      text: async () => { throw new Error('denied') },
    })).resolves.toMatchObject({ ok: false, code: 'file-read-failed', error: 'Couldn’t read locked.pgn.' })
  })
})
