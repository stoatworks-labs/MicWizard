# AGENTS.md — bringing an LLM up to speed on MicWizard

Orientation for an AI assistant (or a new human) picking this project up cold. `CLAUDE.md`
holds the short command reference; this file explains the model and the traps.

---

## 1. Read this before doing anything else

**MicWizard has a successor. Check whether your work belongs here at all.**

`RFutils` is a unified suite that merged MicWizard, `wsm-wwb-bridge` and `pmse-to-wwb` into
one package — MicWizard's functionality lives there as the **Monitor** tab. Logic and parsers
were folded into it.

So before adding a feature here, answer: **is this repo still canonical for the thing I'm
changing?** Often the answer is no, and the change belongs in RFutils. Duplicating a fix
across both is how the two silently diverge.

This file exists partly to stop an assistant cheerfully extending a superseded app.

## 2. What this is

An **Electron app that discovers Shure and Sennheiser wireless mic receivers** on the local
network, monitors their audio levels (via AES67) and battery/RF status.

TypeScript, electron-vite. Public repo.

## 3. Protocol honesty requirement

The adapters are built from **a mix of publicly documented specs and best-effort reverse
engineering**, and **each adapter's module doc comment states which it is**. None of it has
been validated against real hardware.

Two rules follow:
- **Preserve the per-adapter provenance comments.** They are what makes the difference between
  "documented" and "guessed" visible to the next reader.
- Don't upgrade the confidence of the README's Protocol status table without real hardware
  evidence.

## 4. Commands

```bash
npm run dev          # electron-vite dev
npm run typecheck    # node + web
npm run lint
npm test             # node --test over test/**/*.test.mts
npm run build
```

Note the test runner is **node's built-in test runner over `.mts` files**, not vitest —
different from most of the sibling projects.

## 5. Layout notes

Split main/preload vs renderer tsconfigs, so `npm run typecheck` covers both. `global.d.ts`
in the renderer is an ambient declaration file — it isn't imported anywhere by design, so
don't remove it as "unreferenced".

## 6. Conventions

- "Commit" means commit **and** push.

## Diagnostics

Log via `say`/`log` from `src/main/diag/`, never `console`. `installElectronDiagnostics()`
hooks `render-process-gone` and `child-process-gone` — a dead renderer raises nothing the
main process's `uncaughtException` handler can see. `diag:collect` and `diag:openLogFolder`
are registered over IPC but **no UI calls them yet**; wiring a button is outstanding.
See [docs/diagnostics.md](docs/diagnostics.md).
