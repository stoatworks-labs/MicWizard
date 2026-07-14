# Data captures this project needs

Every adapter in this app was built from public documentation or best-effort
reconstruction, not from watching real hardware talk (see the confidence
table in the [README](../README.md#protocol-status)). The captures below are
what would let someone correct the adapters against reality. If you have any
of this gear and can send a `.pcapng`, that's the single most useful
contribution to this project right now.

## What's needed, per adapter

| Adapter | What to capture | Why |
|---|---|---|
| [Shure Command Strings](../src/main/discovery/shure.ts) | A `.pcapng` of Shure Wireless Workbench (or ShurePlus Channels) talking to a real ULX-D/QLX-D/Axient Digital receiver over TCP port 2202, covering connect, a `GET 1 ALL`-style full state read, and a battery/RF change happening live | Confirms the exact `REP`/`SAMPLE` field names and framing this app assumes from Shure's published Command Strings PDFs actually match a real receiver's wire behavior |
| [Sennheiser SSC](../src/main/discovery/sennheiser.ts) | A `.pcapng` of Sennheiser Control Cockpit or WSM talking to a real EW-DX or Digital 6000/9000 receiver over TCP port 45 | This adapter is the least certain in the app - the JSON path names for battery/RF/audio (`rx.1.battery.gauge` etc.) are best-effort guesses from public SSC examples, not confirmed against real traffic |
| [AES67 audio](../src/main/audio/aes67.ts) + [SAP](../src/main/audio/sap.ts) | A `.pcapng` covering a real Dante device's SAP announcement (multicast to `224.2.127.254:9875`) and a few seconds of the RTP stream it announces, with AES67 mode enabled in Dante Controller | Confirms the SDP field layout and L16/L24 payload framing this app assumes match a real Dante sender, not just the spec |
| [Bitfocus Companion crosspoint fields](../README.md#dante-routing-this-app-has-none-on-purpose---it-presses-buttons-in-your-companion-instead) | Not a packet capture - just confirmation that `Make Crosspoint`'s fields still accept `$(custom:...)` variables in whatever Companion version you're running | This one was verified by reading the module's source directly (`useVariables: true` on all four fields), not guessed - only worth re-checking if Bitfocus changes that module |

## How to capture these (simpler than it sounds)

This author's [Dante-BabelBox](https://github.com/allansargeant/Dante-BabelBox)
project has [OS-specific capture guides](https://github.com/allansargeant/Dante-BabelBox/tree/main/docs)
for a much harder problem: recording traffic between *two other devices* that
don't know your laptop exists, which needs physically bridging your laptop
inline between them with two network ports. **None of the captures above need
that.** In every case here, you're either one of the two parties in the
conversation yourself, or the traffic is multicast to everyone on the
segment:

- **Shure / Sennheiser captures**: you're running the control software
  (Wireless Workbench, Control Cockpit, WSM) on your own laptop, talking
  directly to the receiver. Just run Wireshark on that same laptop, on the
  network interface connected to the receiver's network - no bridging, no
  mirror port, no second device to be invisible to.
- **AES67 capture**: SAP announcements and Dante's own mDNS are multicast,
  so any device on the same LAN segment (same switch, no VLAN boundary in
  the way) receives them automatically - just run Wireshark on a laptop
  plugged into the same network as the Dante gear.

### Wireshark setup (once per machine)

- **macOS**: install from [wireshark.org](https://www.wireshark.org) and say
  yes to the ChmodBPF helper when the installer asks, or every capture will
  need `sudo`.
- **Windows**: install from [wireshark.org](https://www.wireshark.org) -
  Npcap, its packet driver, installs automatically alongside it.
- **Linux**: `sudo apt install wireshark` (or your distro's equivalent), say
  yes when asked to let non-root users capture, then
  `sudo usermod -aG wireshark $USER` and log out and back in.

### Capture filters

Point Wireshark at the interface on the relevant network, apply one of these
as a capture filter (not a display filter) before hitting Start, and let it
run through a full connect → read state → change something → observe cycle:

```
tcp port 2202                                    # Shure
tcp port 45                                       # Sennheiser SSC
udp port 9875 or (udp portrange 5004-5010)        # AES67 SAP + RTP (adjust the RTP range if your sender uses different ports - check the SAP announcement's own m=audio line for the real port)
```

Save as `.pcapng` (File → Save As) and that's it - no trimming or exporting
needed, the whole file is useful.

> **Heads up on what's in a capture.** These captures can contain device
> names, IP addresses, and (for the Companion piece) whatever your own
> config looks like. None of that is expected to be sensitive for typical
> gear, but it's worth a glance before sharing publicly - same caution
> Dante-BabelBox's guides call out for its own captures.
