# Clock implementation plan

## Architecture

```text
TimeControl presets/custom validation
          ↓
Pure ClockState machine (absolute epoch timestamps)
          ↓ snapshots
React game orchestration
  ├── legal human move → completeClockMove
  ├── accepted engine move → completeClockMove
  ├── undo → restore pre-move snapshot
  ├── pause/resume
  └── flag fall → local termination
          ↓
ActiveSession / StoredGame optional clock metadata
```

## Correctness rules

- Stored remaining time is the amount at `turnStartedAtMs`; display snapshots derive elapsed time without mutating state.
- Delay absorbs elapsed time before base time is charged.
- Fischer increment is credited only after a legal move is committed.
- Pause first settles the running side, then removes the active anchor.
- Reload derives elapsed wall time from the persisted anchor, preserving real clock behavior.
- A stale engine response cannot move after timeout because termination participates in effect cleanup and FEN/request guards remain intact.

## Testing

- Unit tests: presets, formatting, decrement, increment, delay, pause/resume, flag fall and invalid transitions.
- Domain tests: timeout result and basic mating-material handling.
- Browser test: timed hot-seat moves, pause/resume, shortcut undo, bot reply and visible flag fall.
