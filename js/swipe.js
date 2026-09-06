/*
 * Position-driven feeder: turns a scalar "head position in mm" into a
 * stream of feed() calls against a CardReader, using card.js's pure
 * sampleAtPosition(). This is where the "fed by position, not a timer"
 * requirement actually lives -- there is no clock in this file, only a
 * head-position input that the UI (or a test) drives however it likes.
 *
 * Two things live here on purpose, both explained in reader.js's header:
 *  - fine-step interpolation between the last position and the new one,
 *    so a large single jump (a fast drag producing few pointermove
 *    events) still can't skip over a hole entirely;
 *  - a monotonic "don't re-feed positions already fed" gate, which is
 *    what makes a hesitant or reversing drag land on the same result as
 *    a smooth one: backing up just moves the cosmetic head display, it
 *    doesn't re-trigger the reader. The gate re-arms once the card is
 *    withdrawn back past the START hole, which is how you deliberately
 *    start a fresh read.
 */
(function (global) {
  'use strict';

  var STEP_MM = 0.4; // well under the 3.0mm hole diameter -- see card.js

  function createSwipe(card, reader) {
    var geo = global.EKO.CardGeometry;
    var withdrawnMm = geo.START_X - geo.HOLE_RADIUS_MM - 1;
    var maxFedMm = withdrawnMm;

    function feedThrough(fromMm, toMm) {
      var events = [];
      var x = fromMm;
      while (x < toMm) {
        x = Math.min(x + STEP_MM, toMm);
        var sample = global.EKO.sampleCardAt(card, x);
        var ev = reader.feed(sample);
        if (ev) events.push(ev);
      }
      return events;
    }

    return {
      moveTo: function (headMm) {
        if (headMm <= withdrawnMm) {
          maxFedMm = withdrawnMm; // card fully withdrawn -- re-arm for a fresh read
        }
        var events = [];
        if (headMm > maxFedMm) {
          events = feedThrough(maxFedMm, headMm);
          maxFedMm = headMm;
        }
        var liveSample = global.EKO.sampleCardAt(card, headMm);
        return { events: events, sample: liveSample };
      },
      withdrawnPosition: function () { return withdrawnMm; },
      maxFed: function () { return maxFedMm; }
    };
  }

  global.EKO = global.EKO || {};
  global.EKO.createSwipe = createSwipe;
})(window);
