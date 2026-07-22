# Phase 2 coach-evidence specification

## User outcome

When a player selects a meaningful error in a completed local Stockfish review, KnightClub explains the position with evidence they can check on the board. The player sees the played move, the stronger move, a concrete continuation, and only those tactical or positional facts that the local rules layer can substantiate. The feature remains useful after a saved review is restored and never fabricates a motif from a score alone.

## Functional requirements

1. For a selected reviewed `inaccuracy`, `mistake`, `miss`, or `blunder`, derive coach guidance from the exact position before and after the move, the recorded best move and the recorded principal variation.
2. Every rendered guidance card must name the played move and, when available, the recommended move and a legal continuation in SAN.
3. The system must surface only conservative, verifiable evidence. Version one may identify a missed mating line, a concrete check/forced king response, an attacked unsupported moved piece, a direct double attack, or an absolute king pin when the board position proves it.
4. If the evidence is insufficient, the system must fall back to an honest comparison of the played move and the recorded principal variation. It must not claim that material is forced won, that a tactic is unique, or that an opening is book without proof.
5. Guidance must include a concise next-focus instruction that tells the player what to inspect before committing a move, such as king safety, unsupported pieces, or a second target.
6. Good, best, forced, book, and start-position moves must not receive a misleading error-coach card.
7. Existing saved reports must gain the guidance when reopened; the feature must not require a report migration or another engine run.
8. Invalid FENs, absent/illegal best moves, low-confidence reports, and malformed variations must fail closed to a neutral, non-tactical explanation without breaking replay.

## Non-goals

- This slice does not claim a full tactical proof, static-exchange evaluation, opening-book classification, sacrifice soundness, or a generic online coach.
- It does not add a new engine search, alter review scores/classes, or mutate completed reports.
- It does not yet create a training queue; that follows as the next vertical slice using these concrete review moments.

## Acceptance evidence

- Fixed legal positions prove the missed-mate, check, unsupported-piece, double-attack, and absolute-pin detectors only when their board evidence exists.
- Every detected explanation includes concrete piece and square references plus the recorded better continuation.
- A no-evidence, low-confidence, invalid-input, or non-error case returns a safe comparison rather than a tactical assertion.
- The Review UI renders the coach-evidence card for a selected adverse move and hides it for a non-error move.
- A restored saved report receives the same guidance without launching Stockfish.
