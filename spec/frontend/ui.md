# Frontend UI Specification

## 1. Purpose

This document defines the UI architecture and implementation rules for Banko.
It is intended for humans and LLM agents to continue UI work without breaking behavior, mobile UX, or visual consistency.

## 2. Technology Baseline

- Framework: Next.js App Router (client-heavy pages).
- UI library: Material UI (MUI) + Emotion.
- Styling strategy:
	- MUI theme tokens for component-level colors/contrast.
	- Global CSS only for app shell primitives (safe-area, viewport sizing, fallback variables, touch behavior).
- Existing utility CSS: Tailwind remains available in the project, but new core UI should prefer MUI components.

Current UI dependencies:

- `@mui/material`
- `@mui/icons-material`
- `@emotion/react`
- `@emotion/styled`

## 3. UI Shell Structure

### 3.1 Root layout

Defined in `app/layout.tsx`.

- Wrap all page content in `AppThemeProvider`.
- Keep a persistent bottom navigation (`BottomNav`) mounted at shell level.
- Viewport metadata must include:
	- `width=device-width`
	- `initialScale=1`
	- `viewportFit='cover'`
- Theme-color metadata must provide light and dark colors for browser UI integration.

### 3.2 Global CSS responsibilities

Defined in `app/globals.css`.

Allowed responsibilities:

- Safe-area-aware bottom spacing for app content.
- Dynamic viewport sizing (`100dvh`) for mobile browser chrome changes.
- Fallback CSS variables (`--background`, `--foreground`, etc.).
- Generic touch tuning (`touch-action: manipulation`).

Avoid placing page-specific visual logic in global CSS.

## 4. Theme System

### 4.1 Provider

Defined in `app/components/AppThemeProvider.tsx`.

- Uses MUI `ThemeProvider` + `CssBaseline`.
- Sets palette mode (`light` or `dark`) and stores preference in `localStorage` key: `theme-mode`.
- On first load, mode selection rule:
	1. Use saved mode if present.
	2. Otherwise use `prefers-color-scheme` media query.
- Updates `document.documentElement.style.colorScheme` to match selected mode.

### 4.2 Theme contract

Theme must always define:

- `palette.mode`
- `palette.background.default`
- `palette.background.paper`
- `shape.borderRadius`
- `typography.fontFamily`

Text/foreground color should rely on MUI semantic tokens (`text.primary`, `text.secondary`) whenever possible.

### 4.3 Mode toggle API

`AppThemeProvider` exposes `useAppColorMode()` hook with:

- `mode: 'light' | 'dark'`
- `toggleMode(): void`

Components should use this hook (not direct localStorage reads) to switch theme.

## 5. Navigation

Defined in `app/components/BottomNav.tsx`.

- Use MUI `Paper` fixed at bottom + `BottomNavigation` and `BottomNavigationAction`.
- Include safe-area bottom padding via `env(safe-area-inset-bottom)`.
- Route selection logic:
	- `/` exact for Home.
	- Prefix match for nested sections (`/transactions`, `/entities`, `/group-expenses`).
- Include explicit theme mode toggle button in nav.

Design requirements:

- Minimum reliable tap target around 44px+.
- Nav must not float or shift based on browser UI overlays.
- Content must remain readable and not be hidden behind nav.

## 6. Page-Level UI Composition

### 6.1 Group Expenses page

Defined in `app/group-expenses/page.tsx`.

List mode:

- Expense rows are rendered as MUI `Card` + `CardActionArea` (full row clickable).
- Summary text uses `Typography` with semantic color tokens.

Edit mode:

- Header actions via MUI `Button`.
- Numeric input via `TextField`.
- Participant list via `List`, `ListItem`, `ListItemText`, `Divider`.
- Add-participant flow via MUI `Dialog`.
- Informational empty-state via MUI `Alert`.

Business logic constraints:

- UI migration must not change calculation logic or persistence behavior.
- Existing routes/query behavior must remain compatible.

## 7. Mobile-First and PWA Constraints

Required behaviors:

- All core interactions must be touch-friendly first.
- Bottom navigation remains stable in:
	- iOS Safari with expanding/collapsing browser chrome.
	- Android Chrome with dynamic toolbar.
	- Installed PWA mode.
- No interactive element should be partially obscured by fixed nav.

Required implementation patterns:

- Reserve bottom layout space globally.
- Use safe-area insets for bottom-fixed surfaces.
- Prefer MUI surfaces (`Paper`, `Card`, `Dialog`) over ad-hoc overlays.

## 8. Component and Style Rules for Future Work

### 8.1 Preferred components

Use MUI equivalents first:

- Buttons: `Button`, `IconButton`.
- Inputs: `TextField`.
- Lists: `List` ecosystem.
- Feedback: `Alert`, `Snackbar` (if needed).
- Layout: `Box`, `Stack`, `Paper`, `Card`.
- Navigation: `BottomNavigation`.

### 8.2 Styling rules

- Prefer `sx` prop and theme tokens over raw hardcoded colors.
- Keep hardcoded color literals limited to theme definition only.
- Keep spacing scale consistent via MUI spacing conventions.
- Avoid introducing parallel style systems for the same component tree.

### 8.3 Accessibility rules

- All icon-only controls require `aria-label`.
- Interactive rows should use semantic clickable containers (`CardActionArea`, `ListItemButton`).
- Maintain visible selected/pressed states from MUI defaults.

## 9. File Ownership Map

- App shell and metadata: `app/layout.tsx`
- Theme provider and mode context: `app/components/AppThemeProvider.tsx`
- Bottom navigation: `app/components/BottomNav.tsx`
- Global shell/mobile CSS: `app/globals.css`
- Group Expenses UI: `app/group-expenses/page.tsx`

## 10. LLM Handoff Instructions

When an LLM extends UI features:

1. Preserve existing business logic and route behavior.
2. Use MUI components by default.
3. Keep safe-area + fixed-nav constraints intact.
4. Ensure dark/light mode compatibility via theme tokens.
5. Validate touch usability on mobile-sized viewports.
6. Avoid regressions in click/tap hit areas.

If a new page is introduced, it should follow this document before introducing custom patterns.
