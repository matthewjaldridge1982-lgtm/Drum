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

## Phase 2 — the card system

### Card geometry: given vs. invented

The pitches and the STEP lead are treated as spec, exactly as given:
9 tracks (START, STEP, STOP, A-F) on a uniform **6.95mm** pitch; 16 data
columns at **10.00mm** pitch; each column's STEP hole punched **2.35mm**
ahead of that column's data holes.

Everything else about the physical card had to be invented, since neither
document specifies it, and is called out in `js/card.js`'s header rather
than presented as read from anything:
- **Hole diameter: 3.0mm.** Chosen, not measured — but not arbitrary:
  it has to be bigger than the 2.35mm STEP lead for the reader's edge
  policy below to work at all, and 3.0mm gives comfortable margin.
- Margins/gaps around the hole grid (15mm side margins, 8mm top/bottom,
  10mm gap from START to column 1) are plain invented layout choices.
- These add up to a card roughly 200mm x 71.6mm, which happens to land
  close to a real IBM punch card's 187mm x 82.5mm — a reassuring
  plausibility check on the invented numbers, not a claim that this
  matches the real EKO card's actual outer dimensions (unknown).

### The reader's edge policy (this is the part that matters)

`js/reader.js` captures data on STEP's **falling** edge, not its rising
edge, and this is deliberate, not incidental. The brief states the STEP
hole "leads" (is punched ahead of) its data column by 2.35mm. Take that
literally — STEP hole positioned at lower X, encountered first — and the
only way "data is settled before the strobe" can be true is if the
strobe is the *trailing* edge of the STEP pulse: by the time the STEP
hole has finished passing the head, the head has advanced far enough
that it's now sitting inside the data holes' own open window (with the
3.0mm hole diameter chosen above, comfortably so). Sampling on STEP's
leading edge instead would read stale data. This mirrors a real
technique from vintage paper-tape/punch-card hardware (offsetting a
clock track ahead of the data it clocks, then using the clock pulse's
trailing edge as the reliable strobe) — I did not find this stated
anywhere in the manual; it's how the stated geometry and the stated
consequence resolve to a single, non-arbitrary answer.

START and STOP fire on their own rising edge — they don't gate any other
track, so there's no settling concern for them.

### Handling reversal without special-casing the reader

reader.js only ever compares the current sample to the previous one — it
has no notion of position, so a full backward feed and a forward feed
that happens to revisit a hole look identical to it (both are just
edges). Test 7 (`tests/reader.test.js`) exploits this directly: since
STEP/STOP are gated behind `loading`, and `loading` only becomes true on
START's rising edge, a fully-reversed sample stream ends in a clean,
freshly-reset reader with nothing captured — START, having been first,
is now last, so every STEP/STOP pulse along the way is ignored before it
ever fires.

That gate alone isn't enough for the *interactive* UI, though: a human
dragging the head back over ground already read would, without more,
re-trigger a second falling edge on a hole it already captured (backing
up and coming forward again would double-count). That policy lives one
layer up, in `js/swipe.js`: it tracks the furthest position fed so far
and simply never re-feeds a position at or behind that mark. Backing up
still moves the head visually (and lights the head lamps live), it just
doesn't call `reader.feed()` again until the drag passes the old
high-water mark. The gate re-arms once the card is withdrawn back past
the START hole — "pull it out and feed it in again" is the deliberate,
documented way to force a fresh read, mirroring how you'd actually
restart a real card in a slot.

### One deliberate framing deviation

The brief describes dragging the *card* under a fixed head. The
implementation instead drags a fixed card's read-head marker with the
pointer. Physically identical relative motion, still entirely
position-driven (there is no timer anywhere in `card.js`/`swipe.js`), but
much simpler to render correctly (nothing needs to translate/clip on
screen). Flagging the substitution rather than letting it pass silently.

### Acceptance tests

All 7 run against `js/reader.js` directly (`tests/reader.test.js`,
viewable at `tests.html`), using hand-built idealised rise/fall sample
sequences rather than the mm geometry — that's what makes them tests of
the *reader module*, per the brief, rather than of the whole pipeline.
Test 4 (speed independence) pads each sample with a variable number of
identical repeats spanning ~100x to stand in for "sampled slower/faster";
test 5 truncates and resumes a sequence; test 6 omits one STEP pulse from
an otherwise-normal sequence and checks the resulting shift explicitly,
including that the last column is left empty rather than silently
patched. All 7 currently pass. The full geometry-driven pipeline
(`card.js` + `swipe.js` + a real mouse drag) was additionally exercised
by hand against the app itself, including the deliberately-broken
"missing STEP at column 7" card, which visibly produces the same shifted
pattern live on the matrix.

### Open item

Real punch-card readers commonly space tracks across the *width* and
columns along the *length*, which is what's implemented, matching the
card diagram in the manual (p12) as best I could tell from a low-
resolution render — but I could not find an explicit statement of which
physical edge of the real card is "up" or which end feeds first, so
START-on-the-left/STOP-on-the-right is my choice, not a confirmed fact
about the original.

(Phase 3 notes to be appended below at its check-in.)

## 3D panel redesign (branch: claude/eko-3d-panel-redesign)

Triggered by four reference photos of a real ComputeRhythm unit (not part
of the original service manual). Built on its own branch so the working,
tested 2D build (Phases 1-2, on `claude/eko-computerythm-build-cy6zmw`)
stays untouched and comparable.

### What the photos confirmed or corrected

- **Instrument pairing, independently confirmed.** The panel photo's row
  labels (top to bottom: Rolling Drum/Cymbal1, Cymbal2/Snare, Timbal2/
  Charleston, Triangle/Clave, Block2/Timbal1, Block1/Bass Drum) match the
  Phase-1 pairing read off the schematic switches exactly. That pairing
  was already high-confidence from a direct schematic read; this is
  independent visual confirmation from real hardware, not new evidence
  changing the answer.
- **Row order is reversed from this app's internal order.** The real
  panel runs F-to-A top-to-bottom; this codebase's `EKO.ROWS` is A-to-F
  (matching the schematic's SW910=row-A numbering). The 3D build displays
  rows in the photographed F..A order via a display-only array in
  `scene3d.js` (`DISPLAY_ROWS`) -- no change to row keys or any logic
  module. The 2D build was not changed to match; that's a small,
  independent fix worth doing there too if wanted.
- **START/STOP is a single toggle button on the real panel**, not
  separate Start and Stop buttons as built in Phase 1. The 3D build
  matches the photo (one `startStop` button). Not backported to the 2D
  build here.
- **Time-signature buttons read left-to-right ascending** (x5..x16) in
  the photo; Phase 1 built them descending. The 3D build matches the
  photo's order.

### What the photos raised but did NOT resolve

The real panel has, per row, one long-throw slider plus two small round
knobs (one near each of the row's two instrument names), plus a separate
column of six small knobs beside the matrix under "GENERAL CANCEL" /
"CANCEL". Photos alone can't tell you what a control actually *does*
electrically -- there's no way to distinguish a continuous pot from a
detented rotary switch by looking at it. This build's control mapping is
therefore an interpretation, not a newly-confirmed fact:

- 6 sliders -> each row's shared output level.
- 12 knobs -> each instrument's own trim (satisfies "each of the twelve
  gets its own level fader" from the original brief, as a rotary rather
  than linear control, matching what the photo actually shows).
- A small toggle per row (its exact real-world form is unconfirmed) ->
  the A/B instrument select that Phase 1 built as a labelled button pair.
- The 6 knobs beside the matrix -> per-row clear, with the button above
  them -> general cancel (the general-cancel wiring is schematic-
  confirmed from Phase 1; the per-row knobs' function is inferred here,
  chosen because it's obviously useful and doesn't conflict with anything
  read from the schematic).

Flagging this rather than presenting six-sliders-plus-twelve-knobs as a
solved mystery -- it isn't one.

### Engine choice: Babylon.js 9.25.0 (vendored), not Three.js

Every JS 3D engine considered was checked against one hard constraint
carried over from Phase 1: `index.html` must still open and run with no
server, which rules out `type="module"` scripts (Chrome/Safari refuse to
load ES modules over `file://`).

- **Three.js** dropped its plain global-script (`build/three.min.js`)
  build around r150 -- current releases (checked: 0.169.0) ship ES
  modules only. The last version with a working global build is r149
  (Feb 2023, `npm pack three@0.149.0`), which would mean sitting on a
  ~3-year-old release to satisfy the file:// requirement.
- **Babylon.js**, checked at its actual current release (9.25.0, `npm
  pack babylonjs@9.25.0` -- confirmed via `npm view babylonjs versions`),
  still publishes a real UMD-style global build (`babylon.js`, sets
  `window.BABYLON`) alongside its modern scoped-package/ES-module
  distribution. That build already includes `WebGPUEngine` (confirmed:
  `grep WebGPUEngine` on the vendored file) with automatic fallback to
  WebGL2 -- genuinely current tech, not a compatibility-driven downgrade.

Babylon.js 9.25.0 is vendored at `vendor/babylonjs/babylon.js` (~8MB,
MIT-licensed) so the page works fully offline with no CDN dependency --
consistent with "open index.html and it works." This session's outbound
network access blocked jsdelivr/unpkg entirely but allowed
`registry.npmjs.org` directly, which is how both engines were actually
inspected above rather than assumed from memory.

The renderer still falls back to the standard WebGL2 `Engine` here (not
`WebGPUEngine`) for reliability -- WebGPU support is inconsistent enough
across browsers (and unverifiable in this sandbox's headless Chromium)
that defaulting to it would risk the page not rendering at all for some
users. Swapping in `WebGPUEngine` with a `WebGPUEngine.IsSupportedAsync()`
capability check is a small, isolated change in `scene3d.js` if you want
to chase that.

### What's genuinely 3D vs. what's still 2D-in-spirit

Every control is a real 3D mesh, picked and dragged via Babylon's
raycasting (`scene.onPointerObservable` + `scene.pick`), not a flat
texture standing in for controls: the 96-lamp matrix, all 6 sliders, all
12 trim knobs, the 6 row A/B toggles, general cancel, the 6 per-row
cancel knobs, the transport buttons and speed knob, and the card itself.
The card is a textured plane (its face is a `DynamicTexture` redrawn from
the exact same `card.js` geometry used for the 2D editor and the PDF
export) that slides bodily along the scene's depth axis as you drag it --
dragging it *is* moving the read head, through the same unmodified
`swipe.js`/`reader.js` used everywhere else in this project. Picking a
hole on the card resolves the click's UV coordinate back to a physical
(track, column) via `card.js`'s geometry, so click-to-punch works
directly on the 3D object, not through a 2D fallback.

What isn't attempted: photorealistic materials (no wood-grain or brushed-
metal textures, only flat PBR-ish colours), physically measured cabinet
dimensions (proportions are eyeballed from the photos, not measured), and
a fully free camera (the `ArcRotateCamera` is deliberately radius/beta-
limited so the panel stays operable rather than lettable to view from
useless angles).

### Known rough edges

- The camera-vs-control drag disambiguation (`ArcRotateCamera.detachControl()`
  while a control drag is in progress) works but hands are needed on real
  hardware to confirm touch behaves as well as the tested mouse/pointer
  path did.
- No keyboard/accessibility path exists for the 3D controls (a plain-DOM
  fallback would be needed for that; not attempted here).
- Label text (row instrument names, branding plate) is legible at
  moderate zoom but will alias at a distance -- `DynamicTexture` at a
  fixed resolution, not adaptive.
