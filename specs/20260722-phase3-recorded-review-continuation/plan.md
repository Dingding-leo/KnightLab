# Phase 3 recorded-review continuation plan

```text
Completed local Stockfish review
        |
        | snapshot valid bounded best-line PV as solutionLineSan
        | (not the original PGN continuation)
        v
Saved retry item
        |
        | local chess.js reconstruction of every saved SAN ply
        +-- empty legacy field --> verified one-move fallback
        |
        +-- malformed non-empty field --> unavailable / fail closed
        v
Train session (transient)
        |
player exact PV move --> auto-play saved opponent reply --> next player prompt
        |
        +-- whole line, unassisted --> persist one schedule advance
        +-- alternate / assisted completion / reveal / skip --> persist reset
```

## Design decisions

- `solutionLineSan` is treated as a compact snapshot of the completed review's Stockfish PV. The canonical original PGN is still used only to validate the reviewed source position and player move; its later moves are not substituted into the exercise.
- A retry-line adapter makes replay validation a pure boundary. It derives canonical UCI/SAN moves and every displayed position from `chess.js`, so stored strings never become board state without legal reconstruction.
- An empty stored field has a deliberately narrow backwards-compatible meaning: use the already validated first recorded move. A non-empty field has a stronger contract and must replay in full; accepting a prefix would turn corrupt data into a misleading lesson.
- Train accepts input only for the reviewed player's plies. The recorded opposing PV move is deterministic presentation, not a new engine choice. Future moves stay hidden until reached or deliberately revealed.
- The repetition scheduler remains item-level and durable. A live session tracks only the temporary line cursor and assistance; it writes once when an outcome is final, avoiding streak advances for partial lines.
- Hint use marks the current attempt assisted. It resets scheduling if that line is then completed; reveal, alternate and skip finalize an immediate reset themselves.
- No Train route obtains an analysis client. All engine work remains part of the completed Review that supplied the durable evidence.

## Test strategy

- Exercise the pure replay adapter with White and Black source positions, odd and even PV lengths, castling, en passant, promotion and terminal lines.
- Prove a legal alternative is described narrowly and resets the live line without evaluating it; prove a malformed non-empty stored PV is rejected rather than truncated.
- Cover first-move fallback only for an explicitly empty legacy PV, and prove the saved first UCI/SAN facts still match.
- Cover multi-move UI progress, hidden future SAN, the recorded opponent-reply transition, explicit promotion, reveal/reset controls and no-spoiler initial markup.
- Cover durable scheduling/persistence separately from transient cursor state: one complete unassisted line advances once; an assisted completion, reveal, alternate or skip resets; reload begins from the stored pre-move FEN.
