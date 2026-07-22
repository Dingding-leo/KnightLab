import {
  BOT_PROFILES,
  botProfileForId,
  type BotProfileId,
} from '../bots/profiles'

interface BotProfilePickerProps {
  selectedId: BotProfileId
  customEngine: boolean
  onSelect: (id: BotProfileId) => void
}

/** A compact, keyboard-accessible opponent roster for Play. */
export function BotProfilePicker({ selectedId, customEngine, onSelect }: BotProfilePickerProps) {
  const selected = botProfileForId(selectedId)
  return (
    <section className="bot-profile-picker" aria-labelledby="bot-profile-heading">
      <div className="bot-profile-picker__heading">
        <span id="bot-profile-heading">Choose opponent</span>
        <small>Local only</small>
      </div>
      <div className="bot-profile-picker__options" role="group" aria-label="Choose a local opponent">
        {BOT_PROFILES.map((profile) => {
          const active = profile.id === selectedId
          return (
            <button
              key={profile.id}
              type="button"
              aria-pressed={active}
              className={`bot-profile-card bot-profile-card--${profile.tone}${active ? ' is-active' : ''}`}
              onClick={() => onSelect(profile.id)}
            >
              <span className="bot-profile-card__avatar" aria-hidden="true">{profile.initials}</span>
              <span className="bot-profile-card__copy">
                <strong>{profile.name}</strong>
                <small>Stockfish target {profile.targetElo}</small>
                <em>{profile.openingCueLabel}</em>
              </span>
            </button>
          )
        })}
      </div>
      <p className="bot-profile-picker__hint" aria-live="polite">
        <strong>{selected.name}:</strong> {selected.intro}
        {customEngine && ' Custom UCI limits override this opponent’s default strength; the local opening cue remains active.'}
      </p>
    </section>
  )
}
