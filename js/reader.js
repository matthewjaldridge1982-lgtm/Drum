/*
 * EKO ComputeRhythm -- card reader state machine.
 *
 * STANDALONE / DEPENDENCY-FREE. No DOM, no Web Audio, no reference to
 * anything else in this app. This file is intended to be ported near
 * verbatim to MicroPython for the real RP2040 hardware reader: the whole
 * public surface is three members --
 *
 *   feed(sample) -> event | null   // sample = {start, step, stop, data:[a,b,c,d,e,f]}
 *   reset()
 *   state                          // { loading, column, pattern } -- pattern is 6x16 of 0/1
 *
 * Track order matches the 9 physical tracks on the card (see NOTES.md /
 * card.js for the geometry): START, STEP, STOP, A, B, C, D, E, F, all on
 * a uniform 6.95mm pitch across the card, with 16 data columns at
 * 10.00mm pitch along it.
 *
 * ---- Edge policy (deliberate, not incidental) ----
 *
 *   START capture fires on the RISING edge (0 -> 1) of the start line.
 *   STOP  capture fires on the RISING edge (0 -> 1) of the stop line.
 *   STEP  capture fires on the FALLING edge (1 -> 0) of the step line.
 *
 * STEP is the odd one out, and it's odd on purpose. The STEP hole for a
 * column is punched 2.35mm *ahead* of that column's data holes (it
 * leads them, in the card-travel direction). If you strobed on STEP's
 * leading edge, you'd be reading the data track before that column's
 * holes have even reached their sensors -- you'd capture stale or
 * half-open data. Strobing on STEP's *trailing* edge instead means: by
 * the time the STEP hole has finished passing the head, the head has
 * also advanced 2.35mm further along, which (given the hole geometry
 * card.js uses) lands solidly inside the data holes' own open window.
 * That's the whole trick behind "data is settled before the strobe" --
 * it falls out of which edge you pick, not out of any special-casing
 * here. This is the same technique classic paper-tape/punch-card
 * hardware used: offset the clock track ahead of the data so its
 * trailing edge -- not leading -- is the reliable strobe.
 *
 * START/STOP don't gate any other track, so there's no settling concern
 * for them and the simple, conventional leading edge is used.
 *
 * ---- Why this module has no idea about "backwards" or "position" ----
 *
 * This module only ever looks at the boolean transition between the
 * sample it was just handed and the one before it. It has no notion of
 * physical position, so it fundamentally cannot tell "the head backed up
 * over a hole it already read" apart from "the head reached a new hole"
 * -- both look like an ordinary rising/falling edge pair on some track.
 * That ambiguity is resolved one layer up, in the position-aware feeder
 * (card.js's swipe driver in this repo), which simply never re-feeds a
 * position the head has already advanced past. This module stays a
 * pure, dependency-free latch -- exactly what should be portable to the
 * RP2040 -- and the "don't re-read what you've backed over" policy is a
 * software convenience specific to a human dragging a mouse, not
 * something the physical reader needs to know about either.
 *
 * A card fed with its sample stream in reverse is a defined case this
 * module handles for free, with no special code: STEP and STOP only do
 * anything while `loading` is true, and `loading` only becomes true on
 * START's rising edge. Reverse the samples of a normal card and the
 * START hole -- which was first -- is now last, so every STEP/STOP edge
 * along the way is ignored (loading is still false) right up until the
 * final sample, which arms `loading` and clears the buffer. Net result:
 * a fully-reversed feed ends in a clean, freshly-reset state with
 * nothing captured -- see tests/reader.test.js, test 7.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.EKO = root.EKO || {};
    root.EKO.CardReader = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ROW_COUNT = 6; // A..F
  var COL_COUNT = 16;

  function makePattern() {
    var p = new Array(ROW_COUNT);
    for (var r = 0; r < ROW_COUNT; r++) p[r] = new Array(COL_COUNT).fill(0);
    return p;
  }

  function clearPattern(p) {
    for (var r = 0; r < ROW_COUNT; r++) {
      for (var c = 0; c < COL_COUNT; c++) p[r][c] = 0;
    }
  }

  // Normalise whatever was handed in to plain booleans so a caller
  // passing 0/1 or undefined data still behaves predictably.
  function normalize(sample) {
    var d = (sample && sample.data) || [];
    return {
      start: !!(sample && sample.start),
      step: !!(sample && sample.step),
      stop: !!(sample && sample.stop),
      data: [!!d[0], !!d[1], !!d[2], !!d[3], !!d[4], !!d[5]]
    };
  }

  function CardReader() {
    this.state = { loading: false, column: 0, pattern: makePattern() };
    this._prev = null;
  }

  CardReader.prototype.reset = function () {
    this.state.loading = false;
    this.state.column = 0;
    clearPattern(this.state.pattern);
    this._prev = null;
  };

  CardReader.prototype.feed = function (rawSample) {
    var sample = normalize(rawSample);
    var prev = this._prev;

    function rose(key) { return sample[key] && !(prev && prev[key]); }
    function fell(key) { return !sample[key] && !!(prev && prev[key]); }

    var event = null;
    var state = this.state;

    if (rose('start')) {
      state.loading = true;
      state.column = 0;
      clearPattern(state.pattern);
      event = { type: 'start' };
    } else if (state.loading && rose('stop')) {
      state.loading = false;
      event = { type: 'stop', column: state.column };
    } else if (state.loading && fell('step') && state.column < COL_COUNT) {
      var col = state.column;
      for (var r = 0; r < ROW_COUNT; r++) state.pattern[r][col] = sample.data[r] ? 1 : 0;
      state.column = col + 1;
      event = { type: 'column', index: col, data: sample.data.slice() };
    }

    this._prev = sample;
    return event;
  };

  CardReader.ROW_COUNT = ROW_COUNT;
  CardReader.COL_COUNT = COL_COUNT;

  return CardReader;
});
