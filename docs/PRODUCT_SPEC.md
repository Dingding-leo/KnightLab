# KnightClub product specification

## Mission

Build the strongest practical local-first chess improvement application that a player can own and use indefinitely without a subscription. KnightClub should cover nearly every valuable single-player, analysis, training, library and personal-data capability found in modern premium chess platforms while remaining original, private and offline-capable.

## Competitive feature inventory

This inventory was compiled from Chess.com's current help collections and feature documentation in July 2026. It records product categories, not proprietary implementations or content.

### Included product domains

| Domain | KnightClub target |
| --- | --- |
| Computer play | Configurable Stockfish opponents, approximate ratings, styles, odds, time controls, custom positions and opening starts |
| Local play | Hot-seat games, configurable clocks, chess clock mode, autosave and crash recovery |
| Game review | Accuracy, move classes, key moments, retry mistakes, game summary and evidence-backed explanations |
| Self analysis | Evaluation, MultiPV, depth, lines, arrows, comments, variations, FEN/PGN and position editor |
| Endgame truth | Optional local Syzygy tablebases and clearly labelled online-optional fallback |
| Puzzles | Rated puzzles, adaptive difficulty, themes, custom sets, missed puzzles, daily queue and personal-game puzzles |
| Timed tactics | Three-minute, five-minute and survival Puzzle Rush equivalents |
| Lessons | Original interactive learning path, lesson library, explanations and board challenges |
| Practice | Openings, endgames, master games, themes, drills and arbitrary custom positions |
| Openings | ECO naming, explorer, master/personal statistics, repertoire builder and spaced repetition |
| Game library | Local archive, collections, search, filters, tags, comments, import/export and duplicate detection |
| Insights | Win/loss/draw, colour, phase, time control, opening, accuracy, mistake, motif and time-management analysis |
| Vision | Coordinate recognition and progressively harder board-vision exercises |
| Solo modes | Original single-player capture puzzles and chess variants that do not require a server |
| Progress | Goals, streaks, study plan, learning level and achievements stored locally |
| Customisation | Original themes, pieces, sounds, board coordinates, animation and accessibility settings |

### Explicitly excluded

KnightClub will not build online matchmaking, rating pools, online daily chess, leagues, live multiplayer tournaments, clubs, chat, messaging, social feeds, public leaderboards, live classrooms or puzzle battles. Local hot-seat, offline tournaments and solo challenges remain valid.

## Legal and content boundaries

- Never copy Chess.com code, text, lesson content, videos, artwork, bots, names, coach scripts, proprietary puzzle data or visual trade dress.
- Product concepts and chess functionality must be implemented independently.
- Original educational content must be written for KnightClub or imported only under compatible terms.
- Public game and puzzle datasets must have documented licences and reproducible import scripts.
- Stockfish must remain under GPLv3 with exact source and licence obligations preserved.

## Data sources approved in principle

- Lichess database exports: CC0, suitable for puzzles, games and evaluations after local filtering and validation.
- `lichess-org/chess-openings`: CC0 ECO/opening-name dataset.
- User-provided PGN/FEN files.
- User games created in KnightClub.
- Curated original lesson, opening and endgame content.

No large dataset should be committed to the main Git repository. Use resumable import tooling, checksums, version metadata and local indexes.

## Current delivery

KnightClub currently supports White, Black and resolved-random local bot games against three original named opponents, a single safe non-persisted premove while the bot thinks, confirmed resignation, hot-seat draw response, deterministic bot draw decisions, typed completion persistence, result-aware PGN, optional original synthesized game sounds and Stockfish play/review with preset, Elo and custom resource/search settings. Each opponent has a legal, exact-history local opening cue plus a bounded existing Stockfish target; the cue is used only in a standard-start route and otherwise the engine decides the move. The website runs a checksum-pinned Stockfish 18 Lite WebAssembly Worker and keeps KnightBot only for failure recovery; desktop uses a separately installed native Stockfish executable. Desktop sessions, preferences and completed games use versioned SQLite with transactional legacy import and corruption backup; the browser uses bounded localStorage.

## Quality bar

A feature is not complete until it has:

1. A user-visible end-to-end path.
2. Correct domain behaviour and edge-case handling.
3. Unit tests plus integration or end-to-end coverage where relevant.
4. Accessible keyboard and focus behaviour.
5. Error, cancellation and empty states.
6. Documentation and migration notes.
7. Successful lint, typecheck, tests and production build.

## Sources used for feature research

- https://support.chess.com/en/collections/13175593-features
- https://support.chess.com/en/collections/13175943-analysis-game-review
- https://support.chess.com/en/articles/8724749-what-is-practice-on-chess-com
- https://support.chess.com/en/articles/8708925-what-is-insights-on-chess-com
- https://www.chess.com/article/view/chesscom-features
- https://github.com/official-stockfish/Stockfish
- https://database.lichess.org/
- https://github.com/lichess-org/chess-openings
