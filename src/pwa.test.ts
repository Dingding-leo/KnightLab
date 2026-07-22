import { describe, expect, it } from 'vitest'
import { shouldRegisterServiceWorker } from './pwa'

describe('PWA runtime boundary', () => {
  it('never registers a browser service worker inside Tauri', () => {
    expect(shouldRegisterServiceWorker(
      { __TAURI_INTERNALS__: {} },
      { isProduction: true, isServiceWorkerAvailable: true },
    )).toBe(false)
  })

  it('does not register a service worker during Vite development', () => {
    expect(shouldRegisterServiceWorker(
      {},
      { isProduction: false, isServiceWorkerAvailable: true },
    )).toBe(false)
  })

  it('keeps production browser PWA registration enabled', () => {
    expect(shouldRegisterServiceWorker(
      {},
      { isProduction: true, isServiceWorkerAvailable: true },
    )).toBe(true)
  })
})
