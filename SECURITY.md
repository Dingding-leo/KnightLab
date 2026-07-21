# Security policy

KnightLab is local-first and must not enable telemetry or network access by default.

Report vulnerabilities privately to the repository owner rather than publishing exploit details in a public issue.

Security-sensitive areas include:

- PGN/FEN and dataset parsing
- Stockfish process paths and UCI output
- Tauri command allowlists
- Database migrations and backup restore
- Release downloads, checksums and update channels

Never construct shell commands from user-controlled strings. Use bounded parsers, explicit process arguments and checksum-verified downloads.
