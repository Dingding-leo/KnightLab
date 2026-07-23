import {
  CheckCircle2,
  ChevronDown,
  Cpu,
  FolderOpen,
  Gauge,
  RefreshCw,
  TriangleAlert,
} from 'lucide-react'
import { useState, type FocusEvent, type KeyboardEvent } from 'react'
import {
  validateEngineSettingsPatch,
  type EngineSettings,
  type EngineSettingsField,
} from '../engine/engineSettings'

export type EngineStatus =
  | { kind: 'idle'; message?: string }
  | { kind: 'checking'; message?: string }
  | { kind: 'ready'; engineName: string; enginePath: string }
  | { kind: 'error'; message: string }

interface EngineSettingsPanelProps {
  settings: EngineSettings
  desktop: boolean
  status: EngineStatus
  /** Another local engine task has priority over configuration controls. */
  engineBusy?: boolean
  engineBusyMessage?: string
  onChange: (settings: EngineSettings) => void
  onChooseExecutable: () => void
  onUseAutomatic: () => void
  onVerify: () => void
}

interface FieldError {
  field: EngineSettingsField
  message: string
}

function commitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === 'Enter') event.currentTarget.blur()
}

export function EngineSettingsPanel({
  settings,
  desktop,
  status,
  engineBusy = false,
  engineBusyMessage,
  onChange,
  onChooseExecutable,
  onUseAutomatic,
  onVerify,
}: EngineSettingsPanelProps) {
  const controlsDisabled = engineBusy || status.kind === 'checking'
  const [fieldError, setFieldError] = useState<FieldError | null>(null)
  const update = (key: EngineSettingsField, value: unknown) => {
    if (controlsDisabled) return
    const result = validateEngineSettingsPatch(settings, { [key]: value }, {
      maximumHashMb: desktop ? undefined : 128,
    })
    if (!result.valid) {
      setFieldError({ field: result.field ?? key, message: result.message })
      return
    }
    setFieldError(null)
    onChange(result.settings)
  }
  const commitNumericDraft = (key: EngineSettingsField, event: FocusEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    update(key, input.validity.badInput ? Number.NaN : input.value)
  }
  const clearFieldError = (key: EngineSettingsField) => {
    setFieldError((current) => current?.field === key ? null : current)
  }
  const invalidInputProps = (key: EngineSettingsField) => {
    const error = fieldError?.field === key ? fieldError : null
    return {
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `engine-settings-${key}-error` : undefined,
    }
  }
  const inputError = (key: EngineSettingsField) => {
    const error = fieldError?.field === key ? fieldError : null
    return error
      ? <small className="engine-field__error" id={`engine-settings-${key}-error`} role="alert">Not saved. {error.message}</small>
      : null
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
            disabled={controlsDisabled}
            onChange={(event) => update('profile', event.target.value)}
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
            <label><span>Target Elo</span><input key={`elo-${settings.elo}`} aria-label="Target Elo" type="number" min="1320" max="3190" step="10" defaultValue={settings.elo} disabled={controlsDisabled} onFocus={(event) => event.currentTarget.select()} onInput={() => clearFieldError('elo')} onKeyDown={commitOnEnter} onBlur={(event) => commitNumericDraft('elo', event)} {...invalidInputProps('elo')} />{inputError('elo')}</label>
            {settings.profile === 'custom' && <label><span>Skill level</span><input key={`skill-${settings.skillLevel}`} aria-label="Skill level" type="number" min="0" max="20" defaultValue={settings.skillLevel} disabled={controlsDisabled} onFocus={(event) => event.currentTarget.select()} onInput={() => clearFieldError('skillLevel')} onKeyDown={commitOnEnter} onBlur={(event) => commitNumericDraft('skillLevel', event)} {...invalidInputProps('skillLevel')} />{inputError('skillLevel')}</label>}
            <label><span>Move time (ms)</span><input key={`time-${settings.moveTimeMs}`} aria-label="Move time in milliseconds" type="number" min="50" max="30000" step="50" defaultValue={settings.moveTimeMs} disabled={controlsDisabled} onFocus={(event) => event.currentTarget.select()} onInput={() => clearFieldError('moveTimeMs')} onKeyDown={commitOnEnter} onBlur={(event) => commitNumericDraft('moveTimeMs', event)} {...invalidInputProps('moveTimeMs')} />{inputError('moveTimeMs')}</label>
            <label><span>Threads</span><input key={`threads-${settings.threads}-${desktop}`} aria-label="Threads" type="number" min="1" max="32" defaultValue={desktop ? settings.threads : 1} disabled={controlsDisabled || !desktop} title={desktop ? undefined : 'The browser engine uses one isolated worker thread.'} onFocus={(event) => event.currentTarget.select()} onInput={() => clearFieldError('threads')} onKeyDown={commitOnEnter} onBlur={(event) => commitNumericDraft('threads', event)} {...invalidInputProps('threads')} />{inputError('threads')}</label>
            <label><span>Hash memory (MB)</span><input key={`hash-${settings.hashMb}-${desktop}`} aria-label="Hash memory" type="number" min="16" max={desktop ? 4096 : 128} step="16" defaultValue={Math.min(settings.hashMb, desktop ? 4096 : 128)} disabled={controlsDisabled} onFocus={(event) => event.currentTarget.select()} onInput={() => clearFieldError('hashMb')} onKeyDown={commitOnEnter} onBlur={(event) => commitNumericDraft('hashMb', event)} {...invalidInputProps('hashMb')} />{inputError('hashMb')}</label>
            <label><span>MultiPV lines</span><input key={`multipv-${settings.multiPv}`} aria-label="MultiPV lines" type="number" min="1" max="5" defaultValue={settings.multiPv} disabled={controlsDisabled} onFocus={(event) => event.currentTarget.select()} onInput={() => clearFieldError('multiPv')} onKeyDown={commitOnEnter} onBlur={(event) => commitNumericDraft('multiPv', event)} {...invalidInputProps('multiPv')} />{inputError('multiPv')}</label>
            <label><span>Search depth</span><input key={`depth-${settings.depth ?? 'none'}`} aria-label="Search depth" type="number" min="1" max="40" placeholder="No limit" defaultValue={settings.depth ?? ''} disabled={controlsDisabled} onInput={() => clearFieldError('depth')} onKeyDown={commitOnEnter} onBlur={(event) => commitNumericDraft('depth', event)} {...invalidInputProps('depth')} />{inputError('depth')}</label>
            <label><span>Node limit</span><input key={`nodes-${settings.nodes ?? 'none'}`} aria-label="Node limit" type="number" min="1000" max="100000000" step="1000" placeholder="No limit" defaultValue={settings.nodes ?? ''} disabled={controlsDisabled} onInput={() => clearFieldError('nodes')} onKeyDown={commitOnEnter} onBlur={(event) => commitNumericDraft('nodes', event)} {...invalidInputProps('nodes')} />{inputError('nodes')}</label>
          </div>
        )}

        {settings.profile === 'custom' && (
          <label className="engine-checkbox">
            <input type="checkbox" checked={settings.limitStrength} disabled={controlsDisabled} onChange={(event) => update('limitStrength', event.target.checked)} />
            <span>Limit strength with UCI Elo</span>
          </label>
        )}

        <div className="engine-path">
          <span>{desktop ? 'Stockfish executable' : 'Browser engine'}</span>
          <code title={desktop ? settings.enginePath ?? 'Automatic discovery' : 'Stockfish 18 Lite WebAssembly'}>{desktop ? settings.enginePath ?? 'Automatic discovery' : 'Stockfish 18 Lite · WebAssembly'}</code>
          <div className={desktop ? undefined : 'engine-path__actions--browser'}>
            {desktop && <button type="button" onClick={onChooseExecutable} disabled={controlsDisabled}><FolderOpen size={14} />Choose executable</button>}
            {desktop && <button type="button" onClick={onUseAutomatic} disabled={controlsDisabled || !settings.enginePath}><RefreshCw size={14} />Automatic</button>}
            <button type="button" onClick={onVerify} disabled={controlsDisabled}><Gauge size={14} />Verify engine</button>
          </div>
        </div>

        <div className={`engine-status engine-status--${status.kind}`} role="status" aria-live="polite">
          {status.kind === 'ready' ? <CheckCircle2 size={15} /> : status.kind === 'error' ? <TriangleAlert size={15} /> : <Cpu size={15} />}
          <span>
            <strong>{status.kind === 'ready' ? status.engineName : status.kind === 'checking' ? 'Checking Stockfish…' : status.kind === 'error' ? 'Engine unavailable' : desktop ? 'Not checked yet' : 'Browser Stockfish'}</strong>
            <small>{status.kind === 'ready' ? (desktop ? status.enginePath : 'Runs locally in an isolated Web Worker.') : status.message ?? (desktop ? 'Verify the engine before your next game.' : 'Loads on demand and remains available offline after caching.')}</small>
          </span>
        </div>
        {engineBusy && <p className="engine-settings__busy" role="status">{engineBusyMessage ?? 'Another local engine task has priority. Settings will be available when it finishes.'}</p>}
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
