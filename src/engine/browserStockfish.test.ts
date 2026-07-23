import { describe, expect, it, vi } from 'vitest'
import {
  BrowserStockfishEngine,
  parseBrowserAnalysisInfo,
  resolveBrowserPlayOptions,
  type StockfishWorker,
} from './browserStockfish'
import { DEFAULT_ENGINE_SETTINGS } from './engineSettings'

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

class FakeStockfishWorker implements StockfishWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: string[] = []
  autoCompleteSearch = true
  autoReady = true
  terminated = false
  private queuedReadyReplies = 0

  postMessage(message: unknown): void {
    const command = String(message)
    this.messages.push(command)
    if (command === 'uci') {
      queueMicrotask(() => this.emit('id name Stockfish 18 Lite WASM\nuciok'))
    } else if (command === 'isready') {
      if (this.autoReady) queueMicrotask(() => this.emit('readyok'))
      else this.queuedReadyReplies += 1
    } else if (command.startsWith('go ') && this.autoCompleteSearch) {
      queueMicrotask(() => this.emit([
        'info depth 14 seldepth 20 multipv 1 score cp 31 wdl 120 820 60 nodes 250000 nps 600000 hashfull 42 tbhits 0 time 400 pv e2e4 e7e5 g1f3',
        'info depth 14 seldepth 19 multipv 2 score cp 18 wdl 100 830 70 nodes 250000 nps 600000 hashfull 42 tbhits 0 time 400 pv d2d4 d7d5 c2c4',
        'info depth 14 seldepth 18 multipv 3 score cp 11 wdl 90 840 70 nodes 250000 nps 600000 hashfull 42 tbhits 0 time 400 pv c2c4 e7e5',
        'bestmove e2e4 ponder e7e5',
      ].join('\n')))
    } else if (command === 'stop') {
      queueMicrotask(() => this.emit('bestmove 0000'))
    }
  }

  terminate(): void {
    this.terminated = true
  }

  releaseReady(): void {
    if (this.queuedReadyReplies < 1) throw new Error('No ready response is queued.')
    this.queuedReadyReplies -= 1
    this.emit('readyok')
  }

  private emit(data: string): void {
    this.onmessage?.({ data } as MessageEvent<unknown>)
  }
}

describe('browser Stockfish UCI parsing', () => {
  it('parses a complete MultiPV info line and rejects unsafe PV moves', () => {
    expect(parseBrowserAnalysisInfo(
      'info depth 18 seldepth 27 multipv 2 score cp -42 upperbound wdl 60 800 140 nodes 12000 nps 500000 hashfull 12 tbhits 0 time 24 pv e2e4 e7e5',
    )).toEqual({
      multiPv: 2,
      depth: 18,
      seldepth: 27,
      score: { kind: 'cp', value: -42, bound: 'upper' },
      wdl: [60, 800, 140],
      nodes: 12000,
      nps: 500000,
      hashfull: 12,
      tbHits: 0,
      timeMs: 24,
      pv: ['e2e4', 'e7e5'],
    })
    expect(parseBrowserAnalysisInfo('info depth 2 score cp 1 pv e2e9')).toBeNull()
  })

  it('matches desktop strength profiles while capping browser memory', () => {
    expect(resolveBrowserPlayOptions('easy')).toMatchObject({ elo: 1320, skillLevel: 2, moveTimeMs: 50, nodes: 1_000, hashMb: 16 })
    expect(resolveBrowserPlayOptions('strong')).toMatchObject({ elo: 2200, skillLevel: 14, moveTimeMs: 90, nodes: 7_000, hashMb: 16 })
    expect(resolveBrowserPlayOptions('balanced', {
      ...DEFAULT_ENGINE_SETTINGS,
      profile: 'custom',
      moveTimeMs: 30_000,
      nodes: 100_000_000,
      hashMb: 4096,
      threads: 32,
      multiPv: 4,
      depth: 40,
    })).toMatchObject({
      moveTimeMs: 60,
      nodes: 3_000,
      hashMb: 16,
      multiPv: 1,
      depth: null,
    })
    expect(resolveBrowserPlayOptions('balanced', DEFAULT_ENGINE_SETTINGS, 2)).toMatchObject({
      moveTimeMs: 60,
      nodes: 3_000,
      hashMb: 16,
      multiPv: 2,
    })
    expect(resolveBrowserPlayOptions('balanced', {
      ...DEFAULT_ENGINE_SETTINGS,
      profile: 'custom',
      moveTimeMs: 99_999,
      nodes: 100_000_001,
      multiPv: 6,
      hashMb: 4097,
    } as typeof DEFAULT_ENGINE_SETTINGS)).toMatchObject({
      moveTimeMs: 60,
      nodes: 3_000,
      multiPv: 1,
      hashMb: 16,
    })
    expect(resolveBrowserPlayOptions('balanced', DEFAULT_ENGINE_SETTINGS, Number.NaN as 1))
      .toMatchObject({ multiPv: 1 })
  })
})

describe('BrowserStockfishEngine', () => {
  it('handshakes, configures and searches in an isolated worker', async () => {
    const worker = new FakeStockfishWorker()
    const engine = new BrowserStockfishEngine(() => worker)

    await expect(engine.probe()).resolves.toEqual({
      engineName: 'Stockfish 18 Lite WASM',
      enginePath: 'wasm://stockfish-18-lite-single',
    })
    await expect(engine.searchMove(fen, 'balanced')).resolves.toMatchObject({
      bestMove: 'e2e4',
      ponder: 'e7e5',
      depth: 14,
      nodes: 250000,
      lines: [{ multiPv: 1, pv: ['e2e4', 'e7e5', 'g1f3'] }],
    })
    expect(worker.messages).toContain('setoption name Threads value 1')
    expect(worker.messages).toContain('setoption name UCI_Elo value 1700')
    expect(worker.messages).toContain(`position fen ${fen}`)
    expect(worker.messages).toContain('go movetime 60 nodes 3000')

    engine.dispose()
    expect(worker.terminated).toBe(true)
  })

  it('requests two play candidates in one equally bounded search', async () => {
    const worker = new FakeStockfishWorker()
    const engine = new BrowserStockfishEngine(() => worker)

    await expect(engine.searchMove(fen, 'balanced', DEFAULT_ENGINE_SETTINGS, 2)).resolves.toMatchObject({
      bestMove: 'e2e4',
      lines: [
        { multiPv: 1, pv: ['e2e4', 'e7e5', 'g1f3'] },
        { multiPv: 2, pv: ['d2d4', 'd7d5', 'c2c4'] },
      ],
    })
    expect(worker.messages).toContain('setoption name Threads value 1')
    expect(worker.messages).toContain('setoption name MultiPV value 2')
    expect(worker.messages.filter((message) => message.startsWith('go '))).toEqual([
      'go movetime 60 nodes 3000',
    ])

    engine.dispose()
  })

  it('reuses acknowledged UCI options while retaining a ready fence between searches', async () => {
    const worker = new FakeStockfishWorker()
    const engine = new BrowserStockfishEngine(() => worker)

    await engine.analyze(fen, { moveTimeMs: 120, depth: 10, nodes: 10_000, multiPv: 1, hashMb: 16 })
    await engine.analyze(fen, { moveTimeMs: 200, depth: 12, nodes: 20_000, multiPv: 1, hashMb: 16 })
    await engine.analyze(fen, { moveTimeMs: 200, depth: 12, nodes: 20_000, multiPv: 2, hashMb: 16 })

    const optionMessages = worker.messages.filter((message) => message.startsWith('setoption name '))
    expect(optionMessages).toHaveLength(14)
    expect(optionMessages.filter((message) => message === 'setoption name MultiPV value 1')).toHaveLength(1)
    expect(optionMessages.filter((message) => message === 'setoption name MultiPV value 2')).toHaveLength(1)
    expect(worker.messages.filter((message) => message === 'isready')).toHaveLength(4)
    expect(worker.messages.filter((message) => message.startsWith('go '))).toEqual([
      'go movetime 120 depth 10 nodes 10000',
      'go movetime 200 depth 12 nodes 20000',
      'go movetime 200 depth 12 nodes 20000',
    ])

    engine.dispose()
  })

  it('keeps malformed direct analysis options low-cost and never emits NaN UCI commands', async () => {
    const worker = new FakeStockfishWorker()
    const engine = new BrowserStockfishEngine(() => worker)

    await engine.analyze(fen, {
      moveTimeMs: 10_001,
      depth: 41,
      nodes: 100_000_001,
      multiPv: 6,
      hashMb: 4097,
    } as Parameters<BrowserStockfishEngine['analyze']>[1])

    expect(worker.messages).toContain('setoption name Hash value 64')
    expect(worker.messages).toContain('setoption name MultiPV value 3')
    expect(worker.messages.filter((message) => message.startsWith('go '))).toEqual(['go movetime 800 depth 18 nodes 1000'])
    expect(worker.messages.join('\n')).not.toContain('NaN')
    engine.dispose()
  })

  it('stops an active search and rejects it as an abort', async () => {
    const worker = new FakeStockfishWorker()
    worker.autoCompleteSearch = false
    const engine = new BrowserStockfishEngine(() => worker)
    const pending = engine.searchMove(fen, 'easy')

    await vi.waitFor(() => expect(worker.messages.some((message) => message.startsWith('go '))).toBe(true))
    engine.cancel()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(worker.messages).toContain('stop')
    engine.dispose()
  })

  it('drains a cancelled configuration before issuing replacement options', async () => {
    const worker = new FakeStockfishWorker()
    const engine = new BrowserStockfishEngine(() => worker)
    await engine.probe()
    worker.autoReady = false

    const first = engine.searchMove(fen, 'easy')
    await vi.waitFor(() => expect(worker.messages).toContain('setoption name Hash value 16'))
    const readyCommandsAfterFirstConfiguration = worker.messages.filter((message) => message === 'isready').length

    engine.cancel()
    const second = engine.searchMove(fen, 'strong')
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(worker.messages).not.toContain('setoption name UCI_Elo value 2200')
    expect(worker.messages.filter((message) => message === 'isready')).toHaveLength(readyCommandsAfterFirstConfiguration)

    worker.releaseReady()
    await vi.waitFor(() => expect(worker.messages.filter((message) => message === 'isready')).toHaveLength(readyCommandsAfterFirstConfiguration + 1))
    expect(worker.messages).not.toContain('setoption name UCI_Elo value 2200')

    worker.releaseReady()
    await vi.waitFor(() => expect(worker.messages).toContain('setoption name UCI_Elo value 2200'))
    await vi.waitFor(() => expect(worker.messages.filter((message) => message === 'isready')).toHaveLength(readyCommandsAfterFirstConfiguration + 2))

    worker.releaseReady()
    await expect(second).resolves.toMatchObject({ bestMove: 'e2e4' })
    engine.dispose()
  })
})
