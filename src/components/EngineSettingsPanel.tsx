import {
  CheckCircle2,
  ChevronDown,
  Cpu,
  FolderOpen,
  Gauge,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import type { FocusEvent, KeyboardEvent } from 'react'
import type { EngineSettings } from '../engine/engineSettings'

export type EngineStatus =
  | { kind: 'idle'; message?: string }
  | { kind: 'checking'; message?: string }
  | { kind: 'ready'; engineName: string; enginePath: string }
  | { kind: 'error'; message: string }

interface EngineSettingsPanelProps {
  settings: EngineSettings
  desktop: boolean
  status: EngineStatus
  onChange: (settings: EngineSettings) => void
  onChooseExecutable: () => void
  onUseAutomatic: () => void
  onVerify: () => void
}

function numeric(value: string): number {
  return Number(value)
}

function commitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.currentTarget.blur()
}

export function EngineSettingsPanel({
  settings,
  desktop,
  status,
  onChange,
  onChooseExecutable,
  onUseAutomatic,
  onVerify,
}: EngineSettingsPanelProps) {
  const update = <Key extends keyof EngineSettings>(key: Key, value: EngineSettings[Key]) => {
    onChange({ ...settings, [key]: value })
  }
  return (
    <details className="engine-settings">
      <summary>
        <span><Cpu size={15} /><strong>Engine settings</strong></span>
        <span className={`engine-settings__summary engine-settings__summary--${status.kind}`}>
          {status.kind === 'ready' ? 'Ready' : status.kind === 'checking' ? 'Checking…' : desktop ? 'Configure' : 'Web engine'}
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className="engine-settings__body">
        <label className="engine-field">
          <span>Engine profile</span>
          <select
            aria-label="Engine profile"
            value={settings.profile}
            onChange={(event) => update('profile', event.target.value as EngineSettings['profile'])}
          >
            <option value="preset">Strength preset</option>
            <option value="elo">Target Elo</option>
            <option value="custom">Custom UCI limits</option>
          </select>
        </label>

        {settings.profile === 'preset' ? (
          <p className="engine-settings__hint">Easy, Balanced and Strong use single-threaded, node-bounded combinations of Elo, skill, time and memory.</p>
        ) : (
          <div className="engine-settings__grid">
            <label><span>Target Elo</span><input key={`elo-${settings.elo}`} aria-label="Target Elo" type="number" min="1320" max="3190" step="10" defaultValue={settings.elo} onFocus={(event) => event.currentTarget.select()} onKeyDown={commitOnEnter} onBlur={(event: FocusEvent<HTMLInputElement>) => update('elo', numeric(event.target.value))} /></label>
            {settings.profile === 'custom' && <label><span>Skill level</span><input key={`skill-${settings.skillLevel}`} aria-label="Skill level" type="number" min="0" max="20" defaultValue={settings.skillLevel} onFocus={(event) => event.currentTarget.select()} onKeyDown={commitOnEnter} onBlur={(event) => update('skillLevel', numeric(event.target.value))} /></label>}
            <label><span>Move time (ms)</span><input key={`time-${settings.moveTimeMs}`} aria-label="Move time in milliseconds" type="number" min="50" max="30000" step="50" defaultValue={settings.moveTimeMs} onFocus={(event) => event.currentTarget.select()} onKeyDown={commitOnEnter} onBlur={(event) => update('moveTimeMs', numeric(event.target.value))} /></label>
            <label><span>Threads</span><input key={`threads-${settings.threads}-${desktop}`} aria-label="Threads" type="number" min="1" max="32" defaultValue={desktop ? settings.threads : 1} disabled={!desktop} title={desktop ? undefined : 'The browser engine uses one isolated worker thread.'} onFocus={(event) => event.currentTarget.select()} onKeyDown={commitOnEnter} onBlur={(event) => update('threads', numeric(event.target.value))} /></label>
            <label><span>Hash memory (MB)</span><input key={`hash-${settings.hashMb}`} aria-label="Hash memory" type="number" min="16" max={desktop ? 4096 : 128} step="16" defaultValue={Math.min(settings.hashMb, desktop ? 4096 : 128)} onFocus={(event) => event.currentTarget.select()} onKeyDown={commitOnEnter} onBlur={(event) => update('hashMb', numeric(event.target.value))} /></label>
            <label><span>MultiPV lines</span><input key={`multipv-${settings.multiPv}`} aria-label="MultiPV lines" type="number" min="1" max="5" defaultValue={settings.multiPv} onFocus={(event) => event.currentTarget.select()} onKeyDown={commitOnEnter} onBlur={(event) => update('multiPv', numeric(event.target.value))} /></label>
            <label><span>Search depth</span><input key={`depth-${settings.depth ?? 'none'}`} aria-label="Search depth" type="number" min="1" max="40" placeholder="No limit" defaultValue={settings.depth ?? ''} onKeyDown={commitOnEnter} onBlur={(event) => update('depth', event.target.value ? numeric(event.target.value) : null)} /></label>
            <label><span>Node limit</span><input key={`nodes-${settings.nodes ?? 'none'}`} aria-label="Node limit" type="number" min="1000" max="100000000" step="1000" placeholder="No limit" defaultValue={settings.nodes ?? ''} onKeyDown={commitOnEnter} onBlur={(event) => update('nodes', event.target.value ? numeric(event.target.value) : null)} /></label>
          </div>
        )}

        {settings.profile === 'custom' && (
          <label className="engine-checkbox">
            <input type="checkbox" checked={settings.limitStrength} onChange={(event) => update('limitStrength', event.target.checked)} />
            <span>Limit strength with UCI Elo</span>
          </label>
        )}

        <div className="engine-path">
          <span>{desktop ? 'Stockfish executable' : 'Browser engine'}</span>
          <code title={desktop ? settings.enginePath ?? 'Automatic discovery' : 'Stockfish 18 Lite WebAssembly'}>{desktop ? settings.enginePath ?? 'Automatic discovery' : 'Stockfish 18 Lite · WebAssembly'}</code>
          <div className={desktop ? undefined : 'engine-path__actions--browser'}>
            {desktop && <button type="button" onClick={onChooseExecutable} disabled={status.kind === 'checking'}><FolderOpen size={14} />Choose executable</button>}
            {desktop && <button type="button" onClick={onUseAutomatic} disabled={status.kind === 'checking' || !settings.enginePath}><RefreshCw size={14} />Automatic</button>}
            <button type="button" onClick={onVerify} disabled={status.kind === 'checking'}><Gauge size={14} />Verify engine</button>
          </div>
        </div>

        <div className={`engine-status engine-status--${status.kind}`} role="status" aria-live="polite">
          {status.kind === 'ready' ? <CheckCircle2 size={15} /> : status.kind === 'error' ? <TriangleAlert size={15} /> : <Cpu size={15} />}
          <span>
            <strong>{status.kind === 'ready' ? status.engineName : status.kind === 'checking' ? 'Checking Stockfish…' : status.kind === 'error' ? 'Engine unavailable' : desktop ? 'Not checked yet' : 'Browser Stockfish'}</strong>
            <small>{status.kind === 'ready' ? (desktop ? status.enginePath : 'Runs locally in an isolated Web Worker.') : status.message ?? (desktop ? 'Verify the engine before your next game.' : 'Loads on demand and remains available offline after caching.')}</small>
          </span>
        </div>
        {!desktop && (
          <p className="engine-settings__hint">
            Engine distribution: <a href={`${import.meta.env.BASE_URL}stockfish/COPYING.txt`} target="_blank" rel="noreferrer">GPLv3 licence</a>
            {' · '}
            <a href={`${import.meta.env.BASE_URL}stockfish/SOURCE.txt`} target="_blank" rel="noreferrer">source and checksums</a>
          </p>
        )}
        <p className="engine-settings__hint">{desktop ? 'Higher threads and Hash can use more CPU and memory.' : 'The web engine uses one worker thread and up to 128 MB of Hash memory.'} Changes are saved locally and apply to the next bot move.</p>
      </div>
    </details>
  )
}
