# Desktop board-clarity implementation plan

```text
Wide desktop (> 920 px)
  viewport height - 180 px reserve
              ↓
        larger board stage
              ↓
  larger squares + existing ~96.5% pieces
              ↓
       clearer piece recognition

Compact desktop/tablet (≤ 920 px): viewport height - 260 px reserve
Mobile (≤ 700 px): width: 100%
```

## Design decisions

- The piece treatment was already large—about 96.5% of each square—so the fix expands the square budget rather than making artwork larger or introducing a different piece set.
- Only the wide-desktop `.board-stage` viewport-height reserve changes, from 260 px to 180 px. The existing 920 px and 700 px responsive behaviour is deliberately preserved.
- This is presentation-only. It leaves board semantics, inputs, controls and application state unchanged.

## Verification strategy

- Compare the wide-layout height cap at a 1470 × 801 viewport: the expected board target rises from roughly 541 px to roughly 621 px.
- Retain a manual responsive check for the 920 px and 700 px breakpoints and for the packaged desktop app.
- Record the already completed full frontend suite (35 files / 155 tests), typecheck, lint, web build and macOS Tauri bundle. Do not treat a successful bundle as proof of an unperformed packaged-app interaction walkthrough.
