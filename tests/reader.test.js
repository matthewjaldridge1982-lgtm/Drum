/*
 * Acceptance tests for js/reader.js, runnable in the browser via
 * tests.html (or under Node for CI -- reader.js exports via
 * module.exports when require()'d, see its UMD wrapper).
 *
 * These build idealized 9-track sample sequences by hand (rise/fall
 * pairs per pulse) rather than going through card.js's millimetre
 * geometry, on purpose: this suite is testing the reader STATE MACHINE
 * in isolation, exactly as the brief asks ("actual runnable tests
 * against the reader module"). The geometry/position-driven path
 * (card.js + swipe.js) is exercised by the interactive app itself.
 */
(function (global) {
  'use strict';

  var CardReader = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('../js/reader.js')
    : global.EKO.CardReader;

  var ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];

  function blankData() { return [false, false, false, false, false, false]; }
  function emptyDataMap() {
    var d = {};
    ROWS.forEach(function (r) { d[r] = new Array(16).fill(false); });
    return d;
  }

  // spec = { start: bool, steps: [16 bool], stop: bool, data: {A..F: [16 bool]} }
  // Returns { seq, columnFallIndex } where columnFallIndex[c] is the index
  // in `seq` of column c's step-falling-edge sample (or -1 if that
  // column's STEP hole wasn't punched in this spec).
  function buildSequence(spec) {
    var seq = [];
    var columnFallIndex = new Array(16).fill(-1);
    var blank = blankData();

    if (spec.start) {
      seq.push({ start: true, step: false, stop: false, data: blank });
      seq.push({ start: false, step: false, stop: false, data: blank });
    }
    for (var c = 0; c < 16; c++) {
      if (spec.steps[c]) {
        var colData = ROWS.map(function (row) { return !!(spec.data[row] && spec.data[row][c]); });
        seq.push({ start: false, step: true, stop: false, data: colData });
        seq.push({ start: false, step: false, stop: false, data: colData });
        columnFallIndex[c] = seq.length - 1;
      }
    }
    if (spec.stop) {
      seq.push({ start: false, step: false, stop: true, data: blank });
      seq.push({ start: false, step: false, stop: false, data: blank });
    }
    return { seq: seq, columnFallIndex: columnFallIndex };
  }

  function feedAll(reader, seq) {
    seq.forEach(function (s) { reader.feed(s); });
  }

  function flattenSum(pattern) {
    var sum = 0;
    pattern.forEach(function (row) { row.forEach(function (v) { sum += v; }); });
    return sum;
  }

  function snapshot(reader) {
    return JSON.parse(JSON.stringify(reader.state));
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  }
  function assertEqual(actual, expected, msg) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a !== e) throw new Error((msg ? msg + ' -- ' : '') + 'expected ' + e + ' but got ' + a);
  }

  var cases = [];
  function test(name, fn) { cases.push({ name: name, fn: fn }); }

  // ---- 1. Clock card ----
  test('1. Clock card (START, 16 STEP, STOP, no data) -> column reaches 16, pattern all zero', function () {
    var built = buildSequence({ start: true, steps: new Array(16).fill(true), stop: true, data: emptyDataMap() });
    var reader = new CardReader();
    feedAll(reader, built.seq);
    assertEqual(reader.state.column, 16, 'column counter');
    assertEqual(flattenSum(reader.state.pattern), 0, 'pattern should be all zero');
    assertEqual(reader.state.loading, false, 'STOP should end loading');
  });

  // ---- 2. All-on card ----
  test('2. All-on card -> all 96 bits set', function () {
    var data = emptyDataMap();
    ROWS.forEach(function (row) { data[row] = new Array(16).fill(true); });
    var built = buildSequence({ start: true, steps: new Array(16).fill(true), stop: true, data: data });
    var reader = new CardReader();
    feedAll(reader, built.seq);
    assertEqual(flattenSum(reader.state.pattern), 96, 'all 96 bits should be set');
  });

  // ---- 3. Diagonal card ----
  function diagonalSpec() {
    var data = emptyDataMap();
    data.A[0] = true; // A1
    data.B[1] = true; // B2
    data.C[2] = true; // C3
    data.D[3] = true; // D4
    data.E[4] = true; // E5
    data.F[5] = true; // F6
    return { start: true, steps: new Array(16).fill(true), stop: true, data: data };
  }
  test('3. Diagonal card (A1,B2,C3,D4,E5,F6) -> exactly those six bits set', function () {
    var built = buildSequence(diagonalSpec());
    var reader = new CardReader();
    feedAll(reader, built.seq);
    assertEqual(flattenSum(reader.state.pattern), 6, 'exactly six bits set');
    ROWS.forEach(function (row, r) {
      for (var c = 0; c < 16; c++) {
        var expected = (r === c) ? 1 : 0;
        assert(reader.state.pattern[r][c] === expected, 'mismatch at row ' + row + ' col ' + (c + 1));
      }
    });
  });

  // ---- 4. Speed independence ----
  test('4. Same card fed at 10 speeds spanning two orders of magnitude -> byte-identical result', function () {
    var built = buildSequence(diagonalSpec());
    var repeatsList = [1, 2, 3, 5, 8, 13, 21, 34, 55, 100]; // ~100x range
    var snapshots = repeatsList.map(function (repeats) {
      var padded = [];
      built.seq.forEach(function (s) {
        for (var i = 0; i < repeats; i++) padded.push(s);
      });
      var reader = new CardReader();
      feedAll(reader, padded);
      return snapshot(reader);
    });
    var baseline = JSON.stringify(snapshots[0]);
    snapshots.forEach(function (s, i) {
      assertEqual(s, snapshots[0], 'speed variant #' + i + ' (repeats=' + repeatsList[i] + ') diverged from baseline');
    });
  });

  // ---- 5. Partial swipe then full swipe ----
  test('5. Partial swipe abandoned at column 8, then a full swipe -> matches a full swipe alone', function () {
    var built = buildSequence(diagonalSpec());
    var readerA = new CardReader();
    feedAll(readerA, built.seq);
    var expected = snapshot(readerA);

    var abandonAt = built.columnFallIndex[7] + 1; // right after column 8 (1-based) is captured
    var partial = built.seq.slice(0, abandonAt);
    var readerB = new CardReader();
    feedAll(readerB, partial);
    assertEqual(readerB.state.column, 8, 'sanity check: partial swipe should have captured 8 columns');

    feedAll(readerB, built.seq); // a full, fresh swipe from the top
    assertEqual(snapshot(readerB), expected, 'result after abandon+full-swipe should match a clean full swipe');
  });

  // ---- 6. Missing STEP hole ----
  test('6. Missing STEP hole at column 7 -> columns shift, failure is visible', function () {
    var data = emptyDataMap();
    data.B[8] = true; // marker at physical column 9 (0-based index 8), row B
    var steps = new Array(16).fill(true);
    steps[6] = false; // column 7 (0-based index 6) has no STEP hole
    var built = buildSequence({ start: true, steps: steps, stop: true, data: data });
    var reader = new CardReader();
    feedAll(reader, built.seq);

    assertEqual(reader.state.column, 15, 'only 15 STEP pulses exist on this card');
    assert(reader.state.pattern[1][7] === 1, 'column 9 data should have shifted into slot 8 (index 7)');
    assert(reader.state.pattern[1][8] === 0, 'slot 9 (index 8) should NOT hold the marker -- that is the visible garbling');
    for (var r = 0; r < 6; r++) {
      assert(reader.state.pattern[r][15] === 0, 'the last slot should never have been reached');
    }
  });

  // ---- 7. Card fed backwards ----
  test('7. Card fed backwards -> defined behaviour: clean reset, nothing captured', function () {
    var built = buildSequence(diagonalSpec());
    var reversed = built.seq.slice().reverse();
    var reader = new CardReader();
    feedAll(reader, reversed);

    // Documented behaviour: every STEP/STOP pulse is encountered while
    // `loading` is still false (START -- originally first -- is now
    // last), so none of them do anything. The final sample is START's
    // rising edge, which arms loading and clears the buffer. Net
    // result: a clean, freshly-reset reader with nothing captured.
    assertEqual(flattenSum(reader.state.pattern), 0, 'nothing should be captured from a reversed feed');
    assertEqual(reader.state.column, 0, 'column counter should not have advanced');
    assertEqual(reader.state.loading, true, 'the reversed START pulse (encountered last) arms loading');
  });

  var api = { cases: cases, buildSequence: buildSequence, diagonalSpec: diagonalSpec };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ReaderTests = api;
  }
})(typeof window !== 'undefined' ? window : global);
