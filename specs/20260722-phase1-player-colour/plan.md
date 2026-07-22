# Player-side selection implementation plan

## State model

```text
White / Black / Random preference
              ↓ resolve once for a fresh bot game
humanColor (w | b) ── opposite ── botColor
       ↓                           ↓
board orientation              Stockfish search turn
clock owner                    bot draw decision
resignation/draw actor         paired undo
       ↓
ActiveSession + StoredGame (backward-compatible optional fields)
```

## Correctness rules

- `humanColor` is the game role; `orientation` is only how the board is drawn.
- A random choice stores both the request (`random`) and the resolved colour, so restore never performs another draw.
- The bot engine starts whenever the side to move equals `oppositeColor(humanColor)`, including the opening position when the user plays Black.
- Human input is locked whenever it is the bot's turn. Engine cancellation uses the existing request version/FEN guards and is also triggered when a decision dialog pauses play.
- Whole-turn undo removes the bot reply only when undoing the first ply leaves the bot to move. A bot-only opening cannot be undone/replayed before the human move.
- Legacy sessions and saved games omit the new side fields; they restore as the previous White-player behaviour.

## Test strategy

- Pure tests resolve fixed/random choices deterministically and cover human/bot turn and paired-undo predicates for both colours.
- Browser-storage and native-client tests accept legacy records, preserve valid side fields and reject malformed fields before UI state or database writes.
- Manual checks cover an opening bot White move, timed Black-side play, cancel/confirm during engine thinking, reload persistence and Library display.
