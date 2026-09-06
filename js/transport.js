/*
 * Transport: Start / Stop / Hold / General Cancel, tempo and the seven
 * time-signature lengths (X16 X15 X12 X10 X9 X6 X5), read directly off
 * the Time Signature Change schematic (p3).
 *
 * Uses a standard lookahead scheduler against the AudioContext clock so
 * timing doesn't drift with setInterval jitter (Chris Wilson's "A Tale of
 * Two Clocks" pattern) -- a UI nicety, not something claimed to be
 * schematic-accurate.
 *
 * HOLD behaviour is an assumption -- see NOTES.md. Implemented here as:
 * freeze the step counter on the current column and keep re-triggering
 * that column every clock while held.
 */
(function (global) {
  'use strict';

  var LENGTHS = [16, 15, 12, 10, 9, 6, 5];
  var SCHEDULE_AHEAD = 0.1; // seconds
  var TICK_MS = 25;

  var isPlaying = false;
  var isHeld = false;
  var currentStep = 0;
  var patternLength = 16;
  var stepIntervalSec = 0.2; // seconds per step, driven by tempo slider
  var nextStepTime = 0;
  var timerId = null;
  var listeners = [];

  function notify(evt) { listeners.forEach(function (fn) { fn(evt); }); }

  function fireStep(step) {
    var matrix = global.EKO.matrix;
    matrix.ROWS.forEach(function (row) {
      if (matrix.getRowLatches(row)[step]) {
        var slot = matrix.rowSelect[row];
        var inst = global.EKO.instrumentForRowSlot(row, slot);
        global.EKO.audio.trigger(inst.id, 1);
      }
    });
    notify({ type: 'step', step: step });
  }

  function advance() {
    fireStep(currentStep);
    global.EKO.matrix.markPlayhead(currentStep, patternLength);
    if (!isHeld) {
      currentStep = (currentStep + 1) % patternLength;
    }
  }

  function scheduler() {
    var ctx = global.EKO.audio.ensureContext();
    while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
      advance();
      nextStepTime += stepIntervalSec;
    }
  }

  function start() {
    if (isPlaying) return;
    global.EKO.audio.resume();
    isPlaying = true;
    currentStep = 0;
    nextStepTime = global.EKO.audio.ensureContext().currentTime;
    timerId = setInterval(scheduler, TICK_MS);
    notify({ type: 'start' });
  }

  function stop() {
    isPlaying = false;
    isHeld = false;
    if (timerId) { clearInterval(timerId); timerId = null; }
    currentStep = 0;
    global.EKO.matrix.markPlayhead(null);
    notify({ type: 'stop' });
  }

  function setHold(on) {
    isHeld = !!on;
    notify({ type: 'hold', on: isHeld });
  }

  function setLength(len) {
    if (LENGTHS.indexOf(len) === -1) return;
    patternLength = len;
    if (currentStep >= patternLength) currentStep = 0;
    notify({ type: 'length', length: len });
  }

  function setStepInterval(seconds) {
    stepIntervalSec = seconds;
    notify({ type: 'tempo', seconds: seconds });
  }

  function generalCancel() {
    global.EKO.matrix.clearAll();
    notify({ type: 'cancel' });
  }

  global.EKO.transport = {
    LENGTHS: LENGTHS,
    start: start,
    stop: stop,
    setHold: setHold,
    setLength: setLength,
    setStepInterval: setStepInterval,
    generalCancel: generalCancel,
    isPlaying: function () { return isPlaying; },
    isHeld: function () { return isHeld; },
    getLength: function () { return patternLength; },
    getStepInterval: function () { return stepIntervalSec; },
    onChange: function (fn) { listeners.push(fn); }
  };
})(window);
