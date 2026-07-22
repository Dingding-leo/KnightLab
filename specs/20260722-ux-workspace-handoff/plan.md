# UX workspace handoff plan

```text
Primary tab activation
        |
        +-- same current workspace --> no scroll / no focus change
        |
        +-- different workspace --> render destination
                                      |
                                      v
                              scroll viewport to top
                                      |
                                      v
                 focus #workspace-title without a second scroll
                                      |
                                      v
                   <main aria-labelledby="workspace-title">
```

## Design decisions

- A small pure handoff contract receives the previous and next workspace names plus browser-facing scroll/focus operations. It makes the same-workspace no-op explicit and directly testable.
- The React workspace effect waits until the new content is rendered before issuing the handoff, so focus lands on the destination's visible title rather than a stale heading.
- One stable `h1` target serves visual, keyboard and screen-reader context. `tabIndex={-1}` permits programmatic focus without creating an extra ordinary Tab stop.
- `focus({ preventScroll: true })` lets the explicit top-scroll remain the sole viewport movement for a real transition.
- Repeated active-tab activation deliberately preserves both reading context and focus rather than treating it as a navigation request.

## Test strategy and recorded evidence

- Unit tests prove a different workspace calls top-scroll and focus once, while a repeated workspace calls neither.
- UI markup coverage verifies the focusable `#workspace-title` and `<main aria-labelledby="workspace-title">` relationship.
- In-app browser verification measures a Play-to-Review handoff from `scrollY = 550` and a repeated Review activation at `scrollY = 300`.
- The focused suite passed with 5 files / 27 tests. The full frontend suite passed with 35 files / 155 tests, alongside lint, typecheck, web build, 23 Rust tests and the macOS Tauri bundle. Desktop interaction validation remains pending.
