# ADR 0002: Design tokens live in each app (for now)

- Status: accepted (2026-10-28)
- Context: design.md requires centralized tokens. Expo/Metro does not reliably resolve imports from `packages/shared` without monorepo configuration (ADR 0001 keeps apps independent).
- Decision: `apps/mobile/src/theme/tokens.ts` and `apps/web/src/theme/tokens.ts` each hold the token values from design.md. Each app has a contrast test (WCAG AA 4.5:1) over its text/background pairs.
- Consequence: token values are duplicated. When changing a color, change both files. Revisit by sharing via `packages/shared` once Metro monorepo resolution is verified on the owner's machine.
- Status labels/types are likewise duplicated in each app's `features/tickets/labels.ts`; canonical definitions are in `packages/shared`.
