# MicWizard — Interfaces

> **Check first: is this repo still canonical?** MicWizard's functionality lives on in
> **[RFutils](https://github.com/stoatworks-labs/RFutils)** as the **Monitor** tab, which merged
> this app with `wsm-wwb-bridge` and `pmse-to-wwb`. Before extending anything here, confirm the
> change belongs here rather than there — duplicating a fix across both is how the two silently
> diverge.

| § | Interface | Source |
|---|---|---|
| [1](#1-shure--command-strings-tcp-2202) | Shure — Command Strings, TCP 2202 | `src/main/discovery/shure.ts`, `shureProtocol.ts` |
| [2](#2-sennheiser--ssc-tcp-45) | Sennheiser — SSC, TCP 45 | `src/main/discovery/sennheiser.ts` |
| [3](#3-aes67--sap-discovery-and-rtp) | AES67 — SAP discovery and RTP | `src/main/audio/{sap,aes67,levels}.ts` |
| [4](#4-companion-routes-config) | Companion routes config | `companion-routes.example.json`, `src/main/companion/` |
| [5](#5-ipc-channels) | IPC channels | `src/preload/index.ts` |

**Confidence per transport is in the README's [Protocol status](../README.md#protocol-status)
table** — that table is the authority and is not restated here. The short version: **none of
this has been validated against real Shure or Sennheiser hardware.**

Each adapter's module doc comment states whether it came from a published spec or from
best-effort reverse engineering. **Preserve those comments** — they are what makes the difference
between "documented" and "guessed" visible to the next reader.

---

## 1. Shure — Command Strings, TCP 2202

ULX-D / QLX-D / Axient Digital. **The protocol is documented** (Shure publish the Command Strings
PDFs); **it has not been tested against real receivers.**

**Discovery is a TCP subnet scan**, not mDNS — MicWizard connects to port 2202 across the subnet
and a host only counts as a receiver once **a real protocol handshake succeeds: `GET ALL` must
get a `REP` back.** An open port alone isn't accepted.

On connect it sends:

```
< GET 1 ALL >
< SET 1 METER_RATE 00500 >
```

so metering arrives at a 500 ms cadence without being polled.

### Framing

Messages are `< … >`-delimited over a stream, so `extractFramedMessages()` reassembles them from
a growing buffer. Two behaviours in there are deliberate and both come from real bugs:

- **The closing `>` is searched for starting from the found `<`, not from the top of the
  buffer.** A stray `>` earlier than the first `<` would otherwise put the closing index *before*
  the opening one and **stall parsing forever** on that leftover byte. This project shipped that
  bug once and fixed it.
- **If no `<` is pending, stray leading bytes are dropped** rather than left to grow the buffer
  unbounded.

The parsing is split out from the socket class specifically so it's unit-testable without a TCP
connection.

---

## 2. Sennheiser — SSC, TCP 45

> **This adapter is explicitly labelled an UNVERIFIED SKELETON, and is more uncertain than the
> Shure one. Treat it as a starting point to correct against a real device's traffic, not as
> working code.**

EW-DX and Digital 6000/9000 expose **SSC (Sennheiser Control Protocol): newline-delimited JSON
over TCP port 45**, where the JSON's own nested keys act as an address path:

```json
{"osc":{"rx":{"1":{"audio":{"out1":{"level":null}}}}}}
```

**A `null` value reads that path; a non-null value sets it.**

Discovery is real: the mDNS module browses **`_ssc._tcp`**.

What is genuinely unverified:

- **The exact path names for battery / RF / audio metering per product line.** They **differ
  between EW-DX and Digital 6000**, and Sennheiser's public SSC docs require a developer-portal
  registration this project hasn't done. The paths in the code are **best-effort guesses from
  public SSC examples.**
- **Whether metering needs an explicit subscribe message**, or streams once a path is read.

Correcting it means a packet capture against a real receiver — see
[`data-captures.md`](data-captures.md), which explains exactly what capture would help and how to
take one.

---

## 3. AES67 — SAP discovery and RTP

Vendor-independent: any Dante or AES67 sender.

- **SAP announcements on UDP 9875** (`sap.ts`) carry the SDP, from which the RTP multicast
  address and port are read.
- **RTP/L16 decode plus level maths** in `aes67.ts` / `levels.ts`.

**Verified end-to-end against a *synthetic* sender** — a hand-crafted SAP announcement and RTP
packets, with the decoded sample amplitude checked to match exactly. mDNS discovery itself is
verified against **real** Dante gear (in Dante-BabelBox).

> **Synthetic traffic can't catch every real-world quirk** — L24, odd frame sizes, jitter, real
> SDP variation. The decode is proven correct against what it was given, not against a real
> hardware sender.

The **full Dante API** is blocked on Audinate Developer Program approval; this is the AES67 path
instead, which is why it works with any vendor.

---

## 4. Companion routes config

**MicWizard does no Dante routing itself, on purpose.** It presses buttons in *your* Bitfocus
Companion instance instead, so the routing logic stays in the tool you already trust with it.

`companion-routes.example.json`:

```json
{ "companion": { "host": "127.0.0.1", "port": 8000 },
  "variablePrefix": "dante",
  "makeCrosspointButton":  { "page": 1, "row": 0, "column": 0 },
  "clearCrosspointButton": { "page": 1, "row": 0, "column": 1 } }
```

The model is: MicWizard sets Companion **variables** (prefixed by `variablePrefix`) describing the
crosspoint it wants, then **presses one of two configured buttons** — make or clear. Your
Companion buttons read those variables and do the actual routing.

Consequences worth knowing:

- **The two buttons must exist and must be wired up on your side.** MicWizard pressing a button
  that does nothing looks identical to a successful route.
- **The variable prefix must match** what your Companion buttons read.
- Companion's HTTP API must be enabled; default port here is **8000**.

`validateCompanionConfig.ts` checks the file shape before use.

---

## 5. IPC channels

`window.api`, from `src/preload/index.ts`:

| Channel | Purpose |
|---|---|
| `mic-monitor:list-devices` | discovered devices and channels |
| `mic-monitor:event` *(push)* | device/channel updates |
| `mic-monitor:companion-status` | Companion connection state |
| `mic-monitor:make-crosspoint` | request a route (§4) |
| `mic-monitor:clear-crosspoint` | clear a route |
| `mic-monitor:start-audio-monitor` | begin local headphone cue for a channel |
| `mic-monitor:stop-audio-monitor` | stop it |

**Local monitoring is entirely separate from the Companion routing feature.** `start-audio-monitor`
plays a channel out of the operator's chosen output device; it does not touch the network audio
matrix.

---

## See also

- [USER-GUIDE.md](USER-GUIDE.md) — running it, and what's trustworthy
- [DEVELOPING.md](DEVELOPING.md) — build, tests, and the provenance rule
- [data-captures.md](data-captures.md) — what packet capture would help, and how to take one
- [README Protocol status](../README.md#protocol-status) — the confidence table
