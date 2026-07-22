import type { AnalysisMove, AnalysisPosition, AnalysisTimeline } from './analysisModel'
import { createFenTimeline, createPgnTimeline } from './analysisModel'

/** The largest local text file the analysis importer will consider. */
export const MAX_ANALYSIS_IMPORT_BYTES = 512 * 1024
/** FEN is a single position, so accepting a game-sized file is never useful. */
export const MAX_ANALYSIS_FEN_IMPORT_BYTES = 1024

export type AnalysisFileFormat = 'pgn' | 'fen'

export type ImmutableAnalysisPosition = Readonly<Omit<AnalysisPosition, 'lastMove'>> & {
  readonly lastMove: Readonly<NonNullable<AnalysisPosition['lastMove']>> | null
}

export type ImmutableAnalysisTimeline = Readonly<Omit<AnalysisTimeline, 'positions' | 'moves'>> & {
  readonly positions: readonly ImmutableAnalysisPosition[]
  readonly moves: readonly Readonly<AnalysisMove>[]
}

export interface AnalysisFileImportInput {
  readonly filename: string
  readonly text: string
  /** The file's byte count, supplied by the file picker rather than inferred from its name. */
  readonly size: number
}

/** The small browser `File` surface needed before text is read into memory. */
export interface AnalysisFileReader {
  readonly name: string
  readonly size: number
  text: () => Promise<string>
}

export interface AnalysisFileImportSuccess {
  readonly ok: true
  readonly filename: string
  readonly format: AnalysisFileFormat
  readonly timeline: ImmutableAnalysisTimeline
}

export type AnalysisFileImportErrorCode =
  | 'empty-file'
  | 'invalid-file-size'
  | 'file-too-large'
  | 'fen-too-large'
  | 'file-read-failed'
  | 'invalid-notation'

export interface AnalysisFileImportError {
  readonly ok: false
  readonly filename: string
  readonly format: AnalysisFileFormat | null
  readonly code: AnalysisFileImportErrorCode
  readonly error: string
}

export type AnalysisFileImportResult = AnalysisFileImportSuccess | AnalysisFileImportError

export type AnalysisFileReadResult = AnalysisFileImportError | (AnalysisFileImportSuccess & {
  /** The one bounded read that produced this validated timeline. */
  readonly text: string
})

function filenameFor(input: AnalysisFileImportInput): string {
  return typeof input.filename === 'string' && input.filename.trim() ? input.filename.trim() : 'unnamed file'
}

function errorResult(
  filename: string,
  code: AnalysisFileImportErrorCode,
  error: string,
  format: AnalysisFileFormat | null = null,
): AnalysisFileImportError {
  return Object.freeze({ ok: false, filename, format, code, error })
}

function extensionFormat(filename: string): AnalysisFileFormat | null {
  const normalized = filename.trim().toLowerCase()
  if (normalized.endsWith('.pgn')) return 'pgn'
  if (normalized.endsWith('.fen')) return 'fen'
  return null
}

/**
 * This is intentionally only a format hint. `createFenTimeline` remains the
 * final FEN validator, so malformed FEN-shaped text still receives its normal
 * validation error rather than being accepted by this heuristic.
 */
function looksLikeFen(text: string): boolean {
  const fields = text.trim().split(/\s+/)
  if (fields.length !== 6) return false
  return /^[prnbqkPRNBQK1-8/]+$/.test(fields[0])
    && /^[wb]$/.test(fields[1])
    && /^[-KQkq]+$/.test(fields[2])
    && /^(?:-|[a-h][36])$/.test(fields[3])
    && /^\d+$/.test(fields[4])
    && /^\d+$/.test(fields[5])
}

/**
 * Determine the preferred parser without treating a filename as authority.
 * A strongly FEN-shaped body wins over an accidental `.pgn` extension; other
 * files use the conventional extension and finally default to PGN.
 */
export function inferAnalysisFileFormat(filename: string, text: string): AnalysisFileFormat {
  if (looksLikeFen(text)) return 'fen'
  return extensionFormat(filename) ?? 'pgn'
}

function formatsToTry(filename: string, text: string): readonly AnalysisFileFormat[] {
  const preferred = inferAnalysisFileFormat(filename, text)
  const extension = extensionFormat(filename)
  // `.fen` is only a hint. A player may receive or rename a normal PGN with
  // that suffix, so try its conventional parser only after the FEN attempt.
  if (extension === 'fen' && preferred === 'fen' && !looksLikeFen(text)) return ['fen', 'pgn']
  if (extension === null || extension === preferred) return [preferred]
  return [preferred, extension]
}

function immutableTimeline(timeline: AnalysisTimeline): ImmutableAnalysisTimeline {
  const positions = Object.freeze(timeline.positions.map((entry) => Object.freeze({
    ...entry,
    lastMove: entry.lastMove ? Object.freeze({ ...entry.lastMove }) : null,
  })))
  const moves = Object.freeze(timeline.moves.map((entry) => Object.freeze({ ...entry })))
  return Object.freeze({
    source: timeline.source,
    startFen: timeline.startFen,
    sourcePgn: timeline.sourcePgn,
    positions,
    moves,
  }) as ImmutableAnalysisTimeline
}

function parseTimeline(format: AnalysisFileFormat, text: string): ImmutableAnalysisTimeline {
  return immutableTimeline(format === 'pgn' ? createPgnTimeline(text) : createFenTimeline(text))
}

/**
 * Purely validates and parses the selected file. It never writes application
 * state; callers can apply a successful timeline only after inspecting `ok`.
 */
export function importAnalysisFile(input: AnalysisFileImportInput): AnalysisFileImportResult {
  const filename = filenameFor(input)
  if (typeof input.text !== 'string' || !input.text.trim()) {
    return errorResult(filename, 'empty-file', 'Choose a non-empty PGN or FEN file.')
  }
  if (!Number.isSafeInteger(input.size) || input.size < 0) {
    return errorResult(filename, 'invalid-file-size', 'The selected file reported an invalid size.')
  }

  // Trust neither source alone: a browser `File.size` is authoritative for a
  // picker flow, while the actual UTF-8 text prevents callers from understating
  // a direct-string import.
  const byteSize = Math.max(input.size, new TextEncoder().encode(input.text).byteLength)
  if (byteSize > MAX_ANALYSIS_IMPORT_BYTES) {
    return errorResult(
      filename,
      'file-too-large',
      'PGN and FEN imports must be 512 KiB or smaller.',
    )
  }

  const formats = formatsToTry(filename, input.text)
  let firstError: AnalysisFileImportError | null = null
  for (const format of formats) {
    if (format === 'fen' && byteSize > MAX_ANALYSIS_FEN_IMPORT_BYTES) {
      const tooLarge = errorResult(
        filename,
        'fen-too-large',
        'FEN imports must be 1 KiB or smaller.',
        format,
      )
      firstError ??= tooLarge
      continue
    }
    try {
      return Object.freeze({
        ok: true,
        filename,
        format,
        timeline: parseTimeline(format, input.text),
      }) as AnalysisFileImportSuccess
    } catch (error) {
      firstError ??= errorResult(
        filename,
        'invalid-notation',
        error instanceof Error ? error.message : 'The file does not contain valid PGN or FEN.',
        format,
      )
    }
  }

  return firstError ?? errorResult(filename, 'invalid-notation', 'The file does not contain valid PGN or FEN.')
}

/**
 * Reject an obviously oversized picker selection before asking the browser to
 * allocate/read its text. `importAnalysisFile` repeats the byte check after
 * reading because a reported size must never be trusted on its own.
 */
export async function readAnalysisFile(file: AnalysisFileReader): Promise<AnalysisFileReadResult> {
  const filename = filenameFor({ filename: file.name, text: '', size: file.size })
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    return errorResult(filename, 'invalid-file-size', 'The selected file reported an invalid size.')
  }
  if (file.size > MAX_ANALYSIS_IMPORT_BYTES) {
    return errorResult(filename, 'file-too-large', 'PGN and FEN imports must be 512 KiB or smaller.')
  }
  try {
    const text = await file.text()
    const imported = importAnalysisFile({ filename: file.name, text, size: file.size })
    return imported.ok ? Object.freeze({ ...imported, text }) : imported
  } catch {
    return errorResult(filename, 'file-read-failed', `Couldn’t read ${filename}.`)
  }
}
