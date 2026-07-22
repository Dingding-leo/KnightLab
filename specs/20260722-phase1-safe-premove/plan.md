# Phase 1 safe bot-turn premove plan

```text
Human queues a plausible move while bot searches
                     ↓
ephemeral queued move + source/destination feedback
                     ↓
accepted bot move → clone actual position → chess.js final legality check
                     ↓
bot clock completion → optional zero-time human completion → next turn
```

## Design decisions

- The queue stores `from`, `to`, optional promotion and the bot-turn base FEN only in React/ref memory.
- Preview accepts plausible movement geometry rather than the current legal-move set. This intentionally preserves en-passant, line-opening and check-resolution cases created by the pending bot reply.
- The bot-result callback consumes the queue before mutating UI state. It validates against the exact returned position with a cloned `Chess` instance, so the displayed game cannot be partially changed by a rejected queue.
- Premove state is excluded from the bot-search effect dependencies; queueing must not cancel or restart Stockfish.
- For a successful reply, the clock history receives a settled snapshot for both the bot move and the instant human premove, preserving normal increment and undo semantics.
- Every interruption boundary clears the ephemeral queue and invalidates any active bot request where appropriate.

## Test strategy

- Pure tests cover ownership/shape rejection, en-passant becoming legal after the reply, failed final legality without input mutation, promotion shape and turn ownership.
- Static board/UI tests cover human-side drag affordance plus readable premove source/destination state.
- Release gates run the full frontend suite, typecheck, lint and production build. Browser/native manual checks cover timing, cancellation and Black-side opening flow.
