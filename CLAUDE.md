# MicWizard

Electron wireless-mic coordination tool. TypeScript, electron-vite. (Parsers/logic also folded into RFutils — check which is canonical before extending here.)

## Commands (npm)
- Dev: `npm run dev` (electron-vite dev)
- Typecheck: `npm run typecheck` (node + web)
- Lint: `npm run lint`
- Test: `npm test` (node --test over `test/**/*.test.mts`)
- Build: `npm run build` (electron-vite build)

## Notes
- Overlaps with RFutils (unified successor app) — before adding features, confirm whether the work belongs here or in RFutils.
- "Commit" = commit **and** push.

## Diagnostics

Log via `say`/`log` from `src/main/diag/`, never `console`. `installElectronDiagnostics()`
hooks `render-process-gone` and `child-process-gone` — a dead renderer raises nothing the
main process's `uncaughtException` handler can see. `diag:collect` and `diag:openLogFolder`
are registered over IPC but **no UI calls them yet**; wiring a button is outstanding.
See [docs/diagnostics.md](docs/diagnostics.md).
