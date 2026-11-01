# Design tokens and components (note for the dashboard agent)

Source of truth: `diseno/ui-design.md`. Tokens in `tokens.css`, rules in `components.css`, React in `../ui/index.tsx`. Existing class names and exports are unchanged.

## Tokens (CSS variables on `:root`; one light theme, no dark mode)
- Existing: `--bg --surface --surface-2 --text --text-2 --separator --accent --accent-fill --success/warning/error-text/-bg --camera-chrome --scrim --shadow-float --s-1..7 --r-control --r-group --r-sheet --r-thumb --font --mono --base-size --ease`.
- New: `--accent-soft`, `--accent-soft-text` (tinted chip, AA), `--card-line` (1 px card outline), `--shadow-card`, `--shadow-frame`, `--frame-bg` (page behind the phone column), `--skeleton-a/-b`, `--app-width` (430 px worker column).

## New components (`../ui/index.tsx`)
- `Wordmark`, `ConnectionStatus` (live / reconnecting), `Skeleton`, `Icon` (new names: copy, clock, close, user, shelf; optional `size`).
- CSS only: `.chip`, `.icon-button`, `.hero-card`, `.stat-row/.stat`, `.inline-error`, `.spinner`, `.task-card` (worker feed).

## Changed shared looks (dashboard inherits)
- `.empty-state` is now a white card; `.banner` has radius and bottom margin; `.button` is 54 px high with a pressed scale; `.screen` padding respects left/right safe areas.
- Worker-only: `.worker-stage`, `.app-worker`, `.app-header`, `.code-card`, `.result*`, `.camera*`, `.shutter`.
