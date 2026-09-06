/*
 * Small reusable rotary-knob widget (DOM/CSS only, no dependencies).
 * Vertical drag changes the value, matching how every real synth/drum
 * machine knob works even though there's no physical rotation involved.
 * Used for the per-instrument level knobs, VOLUME and SPEED.
 */
(function (global) {
  'use strict';

  var SWEEP_DEG = 270; // -135deg .. +135deg, typical hardware knob travel
  var DRAG_PX_FOR_FULL_SWEEP = 160;

  function makeKnob(opts) {
    opts = opts || {};
    var min = opts.min != null ? opts.min : 0;
    var max = opts.max != null ? opts.max : 1;
    var value = opts.value != null ? opts.value : (min + max) / 2;

    var el = document.createElement('div');
    el.className = 'knob';
    if (opts.className) opts.className.split(/\s+/).forEach(function (c) { el.classList.add(c); });
    var body = document.createElement('div');
    body.className = 'knob-body';
    var pointer = document.createElement('div');
    pointer.className = 'knob-pointer';
    body.appendChild(pointer);
    el.appendChild(body);
    if (opts.title) el.title = opts.title;

    function fraction() { return (value - min) / (max - min); }

    function paint() {
      var deg = -SWEEP_DEG / 2 + fraction() * SWEEP_DEG;
      pointer.style.transform = 'rotate(' + deg + 'deg)';
    }

    function setValue(v, silent) {
      value = Math.max(min, Math.min(max, v));
      paint();
      if (!silent && opts.onChange) opts.onChange(value);
    }

    var dragging = false, startY = 0, startValue = 0;
    body.addEventListener('pointerdown', function (e) {
      dragging = true;
      startY = e.clientY;
      startValue = value;
      try { body.setPointerCapture(e.pointerId); } catch (err) { /* no-op: some synthetic/edge-case pointers can't be captured */ }
      el.classList.add('dragging');
    });
    body.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dy = startY - e.clientY;
      var range = max - min;
      setValue(startValue + (dy / DRAG_PX_FOR_FULL_SWEEP) * range);
    });
    function endDrag() { dragging = false; el.classList.remove('dragging'); }
    body.addEventListener('pointerup', endDrag);
    body.addEventListener('pointercancel', endDrag);

    paint();

    return { el: el, setValue: setValue, getValue: function () { return value; } };
  }

  var FADER_TRAVEL_PX = 24;

  function makeFader(opts) {
    opts = opts || {};
    var min = opts.min != null ? opts.min : 0;
    var max = opts.max != null ? opts.max : 1;
    var value = opts.value != null ? opts.value : (min + max) / 2;

    var el = document.createElement('div');
    el.className = 'fader';
    if (opts.title) el.title = opts.title;
    var track = document.createElement('div');
    track.className = 'fader-track';
    var cap = document.createElement('div');
    cap.className = 'fader-cap';
    track.appendChild(cap);
    el.appendChild(track);

    function fraction() { return (value - min) / (max - min); }

    function paint() {
      // 0 = bottom of travel, 1 = top
      cap.style.bottom = (fraction() * FADER_TRAVEL_PX) + 'px';
    }

    function setValue(v, silent) {
      value = Math.max(min, Math.min(max, v));
      paint();
      if (!silent && opts.onChange) opts.onChange(value);
    }

    var dragging = false, startY = 0, startValue = 0;
    track.addEventListener('pointerdown', function (e) {
      dragging = true;
      startY = e.clientY;
      startValue = value;
      try { track.setPointerCapture(e.pointerId); } catch (err) { /* no-op */ }
      el.classList.add('dragging');
    });
    track.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dy = startY - e.clientY;
      var range = max - min;
      setValue(startValue + (dy / FADER_TRAVEL_PX) * range);
    });
    function endDrag() { dragging = false; el.classList.remove('dragging'); }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    paint();

    return { el: el, setValue: setValue, getValue: function () { return value; } };
  }

  global.EKO = global.EKO || {};
  global.EKO.makeKnob = makeKnob;
  global.EKO.makeFader = makeFader;
})(window);
