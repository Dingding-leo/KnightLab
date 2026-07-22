type RuntimeScope = Record<string, unknown>

interface ServiceWorkerRuntime {
  isProduction: boolean
  isServiceWorkerAvailable: boolean
}

function browserServiceWorkerRuntime(): ServiceWorkerRuntime {
  return {
    isProduction: import.meta.env.PROD,
    isServiceWorkerAvailable: typeof navigator !== 'undefined'
      && 'serviceWorker' in navigator,
  }
}

export function shouldRegisterServiceWorker(
  scope: RuntimeScope,
  runtime: ServiceWorkerRuntime = browserServiceWorkerRuntime(),
): boolean {
  return runtime.isProduction
    && !('__TAURI_INTERNALS__' in scope)
    && runtime.isServiceWorkerAvailable
}

export function registerBrowserServiceWorker(scope: RuntimeScope = window as unknown as RuntimeScope): void {
  if (!shouldRegisterServiceWorker(scope)) return
  window.addEventListener('load', () => {
    try {
      void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      }).catch((error: unknown) => {
        console.warn('KnightClub could not register its service worker.', error)
      })
    } catch (error) {
      console.warn('KnightClub could not register its service worker.', error)
    }
  }, { once: true })
}
