import { describe, expect, it, vi } from 'vitest'
import { copyText, downloadText } from './textTransfer'

function fallbackDocument(copied: boolean) {
  const field = {
    value: '',
    style: {},
    setAttribute: vi.fn(),
    select: vi.fn(),
    remove: vi.fn(),
  }
  return {
    field,
    document: {
      createElement: vi.fn(() => field),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: vi.fn(() => copied),
    } as unknown as Document,
  }
}

describe('local text transfer', () => {
  it('uses the Clipboard API when it succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)

    await expect(copyText('1. e4 e5', { clipboard: { writeText } })).resolves.toEqual({ ok: true, method: 'clipboard' })
    expect(writeText).toHaveBeenCalledWith('1. e4 e5')
  })

  it('falls back to a selected temporary textarea after clipboard permission is rejected', async () => {
    const { document, field } = fallbackDocument(true)
    const writeText = vi.fn().mockRejectedValue(new Error('Denied'))

    await expect(copyText('8/8/8/8/8/8/8/K6k w - - 0 1', { clipboard: { writeText }, document })).resolves.toEqual({ ok: true, method: 'fallback' })
    expect(field.value).toContain('K6k')
    expect(field.select).toHaveBeenCalledTimes(1)
    expect(field.remove).toHaveBeenCalledTimes(1)
  })

  it('returns a readable error when neither copy route is available', async () => {
    const { document } = fallbackDocument(false)

    await expect(copyText('PGN', { document })).resolves.toEqual({ ok: false, error: 'Clipboard permission was denied.' })
    await expect(copyText('   ', { document })).resolves.toEqual({ ok: false, error: 'There is no text to copy.' })
  })

  it('starts a plaintext download and revokes its object URL after scheduling the click hand-off', () => {
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    const createObjectURL = vi.fn(() => 'blob:knightclub-pgn')
    const revokeObjectURL = vi.fn()
    const scheduled: Array<() => void> = []
    const result = downloadText('game.pgn', '1. e4 e5 *', {
      Blob,
      document: { createElement: vi.fn(() => link), body: { appendChild: vi.fn(), removeChild: vi.fn() } } as unknown as Document,
      url: { createObjectURL, revokeObjectURL },
      schedule: (callback) => { scheduled.push(callback) },
    })

    expect(result).toEqual({ ok: true, method: 'download' })
    expect(link).toMatchObject({ href: 'blob:knightclub-pgn', download: 'game.pgn' })
    expect(link.click).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).not.toHaveBeenCalled()
    scheduled.forEach((callback) => callback())
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:knightclub-pgn')
  })

  it('reports unavailable download APIs rather than throwing', () => {
    expect(downloadText('game.pgn', '1. e4', { document: null, url: null, Blob: null })).toEqual({
      ok: false,
      error: 'Downloads are unavailable in this environment.',
    })
  })
})
