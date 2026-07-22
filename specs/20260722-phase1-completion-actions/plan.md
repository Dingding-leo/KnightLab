# Completion-actions implementation plan

## Architecture

```text
Pure GameTermination domain
  ├── timeout
  ├── resignation
  └── draw agreement / bot draw policy
          ↓
React game orchestrator
  ├── pause/resume clock around decisions
  ├── cancel/restart engine through existing effect lifecycle
  ├── lock board and save completed game
  └── accessible confirmation / response dialog
          ↓
Result-aware PGN + ActiveSession / StoredGame

Pure sound patterns → lazy Web Audio synthesizer → local preference
```

## Correctness rules

- A completion action is idempotent once a termination exists.
- Dialog opening settles and pauses the clock; cancel/decline resumes without restoring elapsed time or delay.
- Bot draw decisions are deterministic and strength-sensitive.
- Non-board endings are exported with standards-compatible PGN headers.
- Audio failures are non-fatal and never affect game state.

## Testing

- Domain: resignation/draw results, termination validation and bot draw policy boundaries.
- PGN: Result/Termination and custom FEN headers.
- Audio: distinct bounded synthesized patterns.
- Browser: decline draw, accept draw, resign, sound toggle persistence and bot draw response.
