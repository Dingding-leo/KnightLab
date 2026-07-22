export function isTauriRuntime(scope: unknown = globalThis): boolean {
  return typeof scope === 'object' && scope !== null && '__TAURI_INTERNALS__' in scope
}
