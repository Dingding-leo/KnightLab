export type TextTransferResult =
  | { ok: true; method: 'clipboard' | 'fallback' | 'download' }
  | { ok: false; error: string }

interface ClipboardPort {
  writeText: (text: string) => Promise<void>
}

interface UrlPort {
  createObjectURL: (blob: Blob) => string
  revokeObjectURL: (url: string) => void
}

export interface TextTransferEnvironment {
  clipboard?: ClipboardPort | null
  document?: Document | null
  url?: UrlPort | null
  Blob?: typeof Blob | null
  schedule?: (callback: () => void) => unknown
}

function browserEnvironment(): TextTransferEnvironment {
  return {
    clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : null,
    document: typeof document !== 'undefined' ? document : null,
    url: typeof URL !== 'undefined' ? URL : null,
    Blob: typeof Blob !== 'undefined' ? Blob : null,
  }
}

function fallbackCopy(text: string, documentPort: Document | null | undefined): TextTransferResult {
  if (!documentPort?.execCommand) {
    return { ok: false, error: 'Clipboard access is unavailable in this environment.' }
  }

  let field: HTMLTextAreaElement | null = null
  try {
    field = documentPort.createElement('textarea')
    field.value = text
    field.setAttribute?.('readonly', '')
    if (field.style) field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;'
    documentPort.body?.appendChild(field)
    field.select()
    if (!documentPort.execCommand('copy')) {
      return { ok: false, error: 'Clipboard permission was denied.' }
    }
    return { ok: true, method: 'fallback' }
  } catch {
    return { ok: false, error: 'Clipboard access is unavailable in this environment.' }
  } finally {
    if (field) {
      try {
        field.remove()
      } catch {
        // The attempted copy already returned its user-facing result.
      }
    }
  }
}

/**
 * Copies plain text with a compatible fallback for Tauri WebViews and browsers
 * that expose Clipboard API but reject it due to a permission policy.
 */
export async function copyText(
  text: string,
  environment: TextTransferEnvironment = browserEnvironment(),
): Promise<TextTransferResult> {
  if (!text.trim()) return { ok: false, error: 'There is no text to copy.' }

  try {
    if (environment.clipboard?.writeText) {
      await environment.clipboard.writeText(text)
      return { ok: true, method: 'clipboard' }
    }
  } catch {
    // A synchronous document fallback remains useful after a permissions error.
  }

  return fallbackCopy(text, environment.document)
}

/**
 * Starts a local plaintext download and revokes its object URL after the click
 * has been handed to the browser. No download is attempted when browser APIs
 * are unavailable, so callers can give a concrete fallback message.
 */
export function downloadText(
  filename: string,
  content: string,
  environment: TextTransferEnvironment = browserEnvironment(),
): TextTransferResult {
  if (!filename.trim()) return { ok: false, error: 'A download filename is required.' }
  if (!content.trim()) return { ok: false, error: 'There is no text to download.' }
  if (!environment.document || !environment.url || !environment.Blob) {
    return { ok: false, error: 'Downloads are unavailable in this environment.' }
  }

  let objectUrl: string | null = null
  let link: HTMLAnchorElement | null = null
  try {
    const blob = new environment.Blob([content], { type: 'text/plain;charset=utf-8' })
    objectUrl = environment.url.createObjectURL(blob)
    link = environment.document.createElement('a')
    link.href = objectUrl
    link.download = filename
    environment.document.body?.appendChild(link)
    link.click()
    const revoke = () => { if (objectUrl) environment.url?.revokeObjectURL(objectUrl) }
    if (environment.schedule) environment.schedule(revoke)
    else setTimeout(revoke, 0)
    return { ok: true, method: 'download' }
  } catch {
    if (objectUrl) environment.url.revokeObjectURL(objectUrl)
    return { ok: false, error: 'The download could not be started.' }
  } finally {
    if (link) {
      try {
        link.remove()
      } catch {
        // A successful click must not be downgraded because cleanup failed.
      }
    }
  }
}
