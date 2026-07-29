# MicWizard — Developing

Electron + TypeScript via electron-vite.

---

## 1. Read this before doing anything else

> **MicWizard has a successor. Check whether your work belongs here at all.**

**[RFutils](https://github.com/stoatworks-labs/RFutils)** is a unified suite that merged MicWizard,
`wsm-wwb-bridge` and `pmse-to-wwb` into one package — MicWizard's functionality lives there as the
**Monitor** tab, and logic and parsers were folded into it.

So before adding a feature here, answer: **is this repo still canonical for the thing I'm
changing?** Often the answer is no, and the change belongs in RFutils. **Duplicating a fix across
both is how the two silently diverge.**

---

## 2. The protocol honesty requirement

The adapters are built from **a mix of publicly documented specs and best-effort reverse
engineering**, and **each adapter's module doc comment states which it is.** None of it has been
validated against real hardware.

Two rules follow, and they are the most important rules in this repo:

1. **Preserve the per-adapter provenance comments.** They are what makes the difference between
   "documented" and "guessed" visible to the next reader. A tidy-up that strips them destroys
   the only signal a future maintainer has.
2. **Don't upgrade the confidence of the README's Protocol status table without real hardware
   evidence.** Not from a passing test, not from a synthetic sender, not from "it looks right".

The Sennheiser adapter carries an explicit `UNVERIFIED SKELETON` banner. Leave it there until a
real capture corrects the paths.

[`data-captures.md`](data-captures.md) documents what capture would help and how to take one —
point people at it rather than guessing harder.

---

## 3. Commands

```bash
npm run dev          # electron-vite dev
npm run typecheck    # node + web
npm run lint
npm test             # node --test over test/**/*.test.mts
npm run build
```

> **The test runner is node's built-in test runner over `.mts` files, not vitest** — different
> from most of the sibling projects. `npm test` is the entry point; don't reach for `vitest`.

Split main/preload vs renderer tsconfigs, so **`npm run typecheck` covers both** — a bare `tsc`
proves one and not the other.

**`global.d.ts` in the renderer is an ambient declaration file. It isn't imported anywhere by
design — don't remove it as "unreferenced".**

CI: `.github/workflows/ci.yml` and `release.yml`.

---

## 4. Layout

```
src/main/
  discovery/shure.ts           TCP 2202 scan + socket handling
  discovery/shureProtocol.ts   PURE parsing — unit-tested without a socket
  discovery/sennheiser.ts      SSC skeleton (UNVERIFIED)
  discovery/mdns.ts            _ssc._tcp and friends
  audio/sap.ts                 SAP announcements, UDP 9875
  audio/aes67.ts, levels.ts    RTP/L16 decode and level maths
  audio/danteApi.ts            blocked on Audinate Developer Program approval
  companion/                   client, routes config, validation
  deviceRegistry.ts
src/renderer/src/audio/        monitorEngine, usbAudio, usbChannelMap
```

**`shureProtocol.ts` is split out from `shure.ts` on purpose** — the framing logic is pure and
directly unit-testable without spinning up a TCP connection. Keep new parsing on that side of the
line.

### The framing bug worth not reintroducing

`extractFramedMessages()` searches for the closing `>` **starting from the found `<`**, not from
the top of the buffer. A stray `>` earlier than the first `<` would otherwise put the closing
index before the opening one and **stall parsing forever** on that leftover byte.

**This project shipped that bug and fixed it.** The comment in the source says so; keep it, and
keep the test.

---

## 5. What "verified" means here, per path

Be precise about this in commit messages — the three paths have genuinely different evidence:

| Path | Evidence |
|---|---|
| mDNS discovery | verified against **real** Dante gear (in Dante-BabelBox) |
| SAP + RTP/L16 decode + level maths | verified **end-to-end against a synthetic sender** — hand-crafted SAP announcement and RTP packets, decoded amplitude checked to match exactly |
| Shure Command Strings | **documented** by the vendor, **never run against a receiver** |
| Sennheiser SSC | **speculative** — paths are guesses from public examples |
| Full Dante API | **blocked** on Audinate Developer Program approval |

Synthetic traffic can't catch every real-world quirk: L24, odd frame sizes, jitter, real SDP
variation. Saying "AES67 is verified" without that qualifier overstates it.

---

## 6. Design boundaries to preserve

- **Local monitoring and Companion routing are unrelated features.** The 🎧 button is a purely
  local cue and must never touch the network matrix. Don't merge their code paths for
  convenience.
- **MicWizard does no Dante routing itself, on purpose.** It sets Companion variables and presses
  two configured buttons; the routing logic stays in the operator's own Companion. Resist
  implementing routing here — that decision is what keeps this app out of the signal path.

---

## 7. Conventions

- Public repo. "Commit" means commit **and** push.
- Keep the README's "early scaffold, not yet tested against real hardware" posture in any new
  user-facing text.

---

## See also

- [API.md](API.md) — the vendor protocols, AES67 path, Companion config, IPC
- [USER-GUIDE.md](USER-GUIDE.md) — the operator view
- [data-captures.md](data-captures.md) — what capture would help
- [`AGENTS.md`](../AGENTS.md) — LLM onboarding
