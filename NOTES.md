# NOTES — EKO ComputeRhythm virtual build

Running log of what came from the service manual (Molendi remaster, 12-page
scanned PDF — the "build guide" text in the project brief already contained
the measured card geometry inline, so that geometry is used verbatim as
given rather than re-derived from a separate document) versus what was
inferred or chosen. Updated at each phase boundary.

## Source material

The attached PDF is 12 pages, no text layer (scanned/redrawn), consisting of:
p1 cover, p2 instrumental section electrical schematic (block 600-700),
p3 time signature change schematic, p4 impulse selectors block 400 (PCB +
logic ref sheet), p5 time-signature PCB photo/artwork, p6 power supply PCB,
p7 card decoder schematic, p8 card reader small PCBs, p9 buttons programmer
schematic, p10 main controller schematic, p11 instrument filters (PCB
artwork with hand-added red-circle inductor call-outs), p12 card-for-
programming 1:1 template + card-reader connector diagram.

## Instrument pairing (Phase 1) — HIGH confidence, directly read

Not inferred — the electrical schematic (p2, "INSTRUMENTAL SECTION BLOCK
600-700") literally draws six two-position switches SW910–SW915, each
straddling one top-row and one bottom-row instrument column, with both
instrument names silkscreened directly above/below each switch. Read
verbatim:

| Row | Slot A (top row / switch up) | Slot B (bottom row / switch down) |
|-----|-------------------------------|-------------------------------------|
| A   | Bass Drum                     | Block 1                             |
| B   | Timbale 1                     | Block 2                             |
| C   | Clave                         | Triangle                            |
| D   | Charleston                    | Timbale 2                           |
| E   | Snare                         | Cymbal 2                            |
| F   | Cymbal 1                      | Rolling Drum                        |

This is a direct read, not a guess from PCB layout proximity — confidence
is high.

## Time signature lengths — HIGH confidence, directly read

p3 ("TIME SIGNATURE CHANGE") shows exactly seven push-buttons wired into
the counter-reset comparator, labelled X16, X15, X12, X10, X9, X6, X5 —
matches the brief's list exactly. Implemented as a live comparator (the
step counter wraps to 0 whenever it reaches the selected length), which is
how the schematic wires it (buttons feed a reset line, not a one-shot load).

## Panel lamp colour — not resolvable from this document

The manual contains no photograph of the illuminated panel, only
schematics and bare PCB artwork — there's nothing to read a colour off of.
Per the fallback instruction, lamp colour is a single CSS variable
(`--lamp-lit`) defaulting to a warm incandescent orange (`#ff9736`).

## Transport / HOLD — MEDIUM confidence, flagged for your call

START, STOP, GENERAL CANCEL (SW909, wired straight across all 96
button-latch flip-flops) and SPEED (R105, a pot on the impulse-generator/
main-controller board) are unambiguous. HOLD is a switch that the main
controller schematic (p10) routes in near the impulse generator / preamp
stage rather than obviously into the step-counter logic, and I did not
fully trace its downstream gating through the 7474/7493 counter chain.
I implemented the common vintage-step-sequencer reading — HOLD freezes the
step counter on the current column and keeps re-triggering that column's
active row instruments on every clock — but this is an assumption, not a
traced fact. Flagging it rather than presenting it as read.

## Implementation note: ES modules vs. file://

The brief asks for ES modules, but Chrome (and Safari) refuse to load
`type="module"` scripts over a bare `file://` URL (no dev server) — it's a
CORS-style restriction on the module fetch, not a bug in this app. Since
"open index.html and have it work, no build step" was the harder
requirement, Phase 1 uses classic `<script>` files with one namespaced
global (`window.EKO`) per file instead of `import`/`export`. Each file is
still a single-responsibility module; only the wiring mechanism differs.
The Phase 2 card-reader module in particular has zero dependencies either
way. Flagging this in case you'd rather force real ES modules and just
require a local server.

(Phase 2 and Phase 3 notes to be appended below at their respective
check-ins.)
