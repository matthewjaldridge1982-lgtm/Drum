/*
 * Card model + geometry.
 *
 * This is the ONLY place that knows about millimetres. It turns a punch
 * pattern into physical hole positions, and answers "what does the head
 * see right now" for a given position -- i.e. it's what produces the
 * `sample` objects that get handed to reader.js's feed(). reader.js
 * itself never sees a millimetre.
 *
 * Measured / given geometry (treated as spec, per the brief):
 *   - 9 tracks (START, STEP, STOP, A-F) on a uniform 6.95mm pitch.
 *   - 16 data columns at 10.00mm pitch.
 *   - Each column's STEP hole leads (is punched 2.35mm ahead of, in the
 *     card-travel direction) that column's data holes.
 *
 * Everything else below (hole diameter, margins, the gap between START
 * and column 1, the gap from column 16 to STOP) is NOT given anywhere in
 * the source material -- it's invented so the geometry above has
 * somewhere to live. Flagged clearly here and in NOTES.md rather than
 * presented as read off anything. The one deliberate choice among these
 * invented numbers is the hole diameter (3.0mm): it's chosen large
 * enough relative to the 2.35mm STEP lead that STEP's trailing edge
 * reliably lands inside the data hole's open window (see reader.js's
 * header for why that matters), with comfortable margin.
 */
(function (global) {
  'use strict';

  var TRACK_PITCH_MM = 6.95;   // measured/given
  var COL_PITCH_MM = 10.00;    // measured/given
  var STEP_LEAD_MM = 2.35;     // measured/given

  var HOLE_DIAMETER_MM = 3.0;  // invented -- see header comment
  var HOLE_RADIUS_MM = HOLE_DIAMETER_MM / 2;
  var MARGIN_X_MM = 15;        // invented -- hand-grip leader/trailer
  var MARGIN_Y_MM = 8;         // invented -- top/bottom border
  var LEADER_GAP_MM = 10;      // invented -- START hole to column 1's STEP hole

  var ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];
  var COLS = 16;

  // Track order top-to-bottom on the card, matches reader.js's sample
  // shape: start, step, stop, then A..F.
  var TRACKS = ['start', 'step', 'stop'].concat(ROWS);

  function stepX(col) { return MARGIN_X_MM + LEADER_GAP_MM + col * COL_PITCH_MM; }
  function dataX(col) { return stepX(col) + STEP_LEAD_MM; }
  var START_X = MARGIN_X_MM;
  var STOP_X = stepX(COLS - 1) + COL_PITCH_MM;

  var CARD_WIDTH_MM = STOP_X + MARGIN_X_MM;
  var CARD_HEIGHT_MM = (TRACKS.length - 1) * TRACK_PITCH_MM + 2 * MARGIN_Y_MM;

  function trackY(trackIndex) { return MARGIN_Y_MM + trackIndex * TRACK_PITCH_MM; }

  var GEOMETRY = {
    TRACK_PITCH_MM: TRACK_PITCH_MM,
    COL_PITCH_MM: COL_PITCH_MM,
    STEP_LEAD_MM: STEP_LEAD_MM,
    HOLE_DIAMETER_MM: HOLE_DIAMETER_MM,
    HOLE_RADIUS_MM: HOLE_RADIUS_MM,
    MARGIN_X_MM: MARGIN_X_MM,
    MARGIN_Y_MM: MARGIN_Y_MM,
    LEADER_GAP_MM: LEADER_GAP_MM,
    CARD_WIDTH_MM: CARD_WIDTH_MM,
    CARD_HEIGHT_MM: CARD_HEIGHT_MM,
    TRACKS: TRACKS,
    ROWS: ROWS,
    COLS: COLS,
    START_X: START_X,
    STOP_X: STOP_X,
    stepX: stepX,
    dataX: dataX,
    trackY: trackY
  };

  function createBlankCard() {
    var data = {};
    ROWS.forEach(function (row) { data[row] = new Array(COLS).fill(false); });
    return {
      start: true,
      step: new Array(COLS).fill(true),
      stop: true,
      data: data
    };
  }

  function clonePunch(card) {
    var data = {};
    ROWS.forEach(function (row) { data[row] = card.data[row].slice(); });
    return { start: card.start, step: card.step.slice(), stop: card.stop, data: data };
  }

  function toJSON(card) {
    return JSON.stringify({
      format: 'eko-computerhythm-card',
      version: 1,
      start: card.start,
      step: card.step,
      stop: card.stop,
      data: card.data
    }, null, 2);
  }

  function fromJSON(json) {
    var obj = JSON.parse(json);
    var card = createBlankCard();
    card.start = !!obj.start;
    card.stop = !!obj.stop;
    for (var c = 0; c < COLS; c++) card.step[c] = !!(obj.step && obj.step[c]);
    ROWS.forEach(function (row) {
      for (var c = 0; c < COLS; c++) {
        card.data[row][c] = !!(obj.data && obj.data[row] && obj.data[row][c]);
      }
    });
    return card;
  }

  // What does the head see if it is sitting at position x (mm) along
  // the card right now? Pure function of (card, x) -- no state.
  function sampleAtPosition(card, x) {
    function within(center) { return Math.abs(x - center) <= HOLE_RADIUS_MM; }

    var data = [];
    for (var i = 0; i < ROWS.length; i++) {
      var row = ROWS[i];
      var hit = false;
      for (var c = 0; c < COLS; c++) {
        if (card.data[row][c] && within(dataX(c))) { hit = true; break; }
      }
      data.push(hit);
    }

    var stepHit = false;
    for (var c2 = 0; c2 < COLS; c2++) {
      if (card.step[c2] && within(stepX(c2))) { stepHit = true; break; }
    }

    return {
      start: card.start && within(START_X),
      step: stepHit,
      stop: card.stop && within(STOP_X),
      data: data
    };
  }

  global.EKO = global.EKO || {};
  global.EKO.CardGeometry = GEOMETRY;
  global.EKO.createBlankCard = createBlankCard;
  global.EKO.cloneCard = clonePunch;
  global.EKO.cardToJSON = toJSON;
  global.EKO.cardFromJSON = fromJSON;
  global.EKO.sampleCardAt = sampleAtPosition;
})(window);
