# Blaze — UI/UX Design System

- Status: Initial design baseline
- Version: 0.1
- Updated: 2026-10-28

## Design intent

Focused, calm, dependable, modern. Use a dark-indigo brand identity with readable neutral surfaces and restrained semantic colors. Mobile requester experience comes first; web agent/admin screens optimize information density without clutter.

## Typography

- Primary: **Plus Jakarta Sans**.
- Fallback: `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif.
- Use weights 400, 500, 600 and 700/800 when available.
- Typical body: 14–16 px web / 14–16 sp mobile.
- Use short screen titles; avoid oversized marketing typography in operational screens.
- Load fonts using supported platform mechanisms and provide a system fallback.

## Color tokens (initial; test contrast before release)

### Brand/surfaces

- `brand-950`: `#171633`
- `brand-900`: `#211F4B`
- `brand-800`: `#302D69`
- `brand-700`: `#433F8F`
- `brand-600`: `#5753B8`
- `brand-100`: `#E9E8FF`
- `brand-50`: `#F5F4FF`
- `background`: `#F6F7FB`
- `surface`: `#FFFFFF`
- `surface-muted`: `#EEF0F6`
- `text-primary`: `#17182B`
- `text-secondary`: `#5F6478`
- `text-inverse`: `#FFFFFF`
- `border`: `#E0E3ED`
- `focus`: `#7772E5`

### Semantic

- `success`: `#16794B`; `success-bg`: `#E7F6EE`
- `warning`: `#9A5B00`; `warning-bg`: `#FFF3D8`
- `danger`: `#B42335`; `danger-bg`: `#FDEBED`
- `info`: `#245BC7`; `info-bg`: `#EAF1FF`

Never convey status by color alone. Include a label and accessible text. Check WCAG contrast for text and interactive states.

## Theme behavior

Use a light operational canvas with dark-indigo navigation/header areas initially. Token names must be semantic so dark theme support can be added deliberately later. Do not ship a half-supported automatic theme.

## Spacing scale (4-unit base)

`space-1=4`, `space-2=8`, `space-3=12`, `space-4=16`, `space-5=20`, `space-6=24`, `space-8=32`, `space-10=40`, `space-12=48`, `space-16=64`.

- Mobile horizontal padding: 20–24.
- Card padding: 16–20.
- Form field gap: 12–16.
- Section gap: 24–32.
- Web content max width: 1200 px unless a table needs more.
- Target touch areas around 44×44 pt where practical.

## Shape and elevation

- Small controls: 8 px radius.
- Standard cards/inputs: 12 px.
- Large panels/sheets: 16–20 px.
- Prefer spacing and borders over heavy shadows.
- Destructive actions must not look like primary actions.

## Shared components

`AppButton` (primary/secondary/outline/destructive/loading/disabled), `AppTextField`, `AppTextArea`, category picker, `StatusBadge`, `PriorityBadge`, `TicketCard`, `EmptyState`, `ErrorState`, `LoadingState`, `ConfirmDialog`, `ScreenHeader`, `SectionHeader`, `Avatar`, `TimelineItem`, `FilterChips`, `OfflineBanner`, and accessible toast/inline feedback.

Use typed, small APIs and avoid repeating styles in every screen.

## Status and priority

Statuses: `new`, `acknowledged`, `in_progress`, `resolved`, `reopened`, optional `closed`.
Priorities: `low`, `normal`, `high`, `urgent`.
Status and priority are separate dimensions. Show labels and do not rely on color alone.

## Navigation

### Mobile (Expo Router)

- `(auth)/sign-in`
- `(tabs)/home`
- `(tabs)/tickets`
- `tickets/new`
- `tickets/[id]`
- `profile`

Use bottom tabs for primary destinations. Ticket creation should be prominent but should not confuse the tab hierarchy.

### Web agent/admin

Persistent desktop sidebar and responsive mobile navigation:

- Overview
- Ticket queue
- Ticket detail
- Categories (admin)
- Users and roles (admin)
- Reports (later)
- Settings/profile

Queue columns should prioritize reference, title, category, priority, status, assignee and updated/age time.

## Screen rules

Every data-driven screen defines loading, empty, error/retry, permission-denied, offline/stale, and success states. Confirm destructive actions. Keep forms accessible and preserve input after recoverable errors. Disable duplicate submission while pending. Never show mutation success before server confirmation. Distinguish local draft from submitted ticket. Requester-facing views must never show internal notes.

## Responsive behavior

- Mobile: one-column layouts, touch-friendly controls, concise ticket cards.
- Tablet: use width without stretching reading content.
- Desktop: data-dense views, keyboard access, persistent navigation.
- Never hide essential actions behind hover.
- Tables need a deliberate narrow-screen strategy.

## Motion

Use subtle 120–220 ms transitions only where useful. Respect reduced motion where supported. Avoid decorative animation that delays task completion.

## Design acceptance

- [ ] Centralized tokens; no scattered magic values.
- [ ] Font fallback works.
- [ ] Contrast and focus states checked.
- [ ] Controls include pressed/disabled/error states.
- [ ] Loading/empty/error/offline/permission states exist.
- [ ] Status works without color alone.
- [ ] Mobile touch/keyboard and web keyboard/responsive behavior checked.
