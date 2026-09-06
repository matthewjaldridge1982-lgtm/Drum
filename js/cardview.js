/*
 * Card editor + swipe UI. This is the only place that touches the DOM
 * for the card system -- reader.js, card.js and swipe.js stay clean.
 *
 * One SVG serves both jobs: a plain click on a hole toggles it (the
 * editor), a press-and-drag scrubs the read head across the card (the
 * swipe). They're disambiguated by movement distance, the same way a
 * slider vs. a click is normally told apart.
 *
 * Framing note: the brief describes dragging the *card* under a fixed
 * head. This drags the *head* across a fixed card instead -- physically
 * the same relative motion and just as position-driven (no timer
 * anywhere in this file), but far simpler to render robustly since
 * nothing needs to translate/clip. Said plainly rather than silently.
 */
(function (global) {
  'use strict';

  var DRAG_THRESHOLD_PX = 4;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function el(name, attrs) {
    var e = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function CardView(container, card) {
    this.container = container;
    this.card = card;
    this.reader = new global.EKO.CardReader();
    this.swipe = global.EKO.createSwipe(card, this.reader);
    this.headMm = this.swipe.withdrawnPosition();
    this._holeEls = []; // { el, track, col }
    this._lampEls = []; // per-track lamp circles, in geo.TRACKS order
    this._build();
    this._updateHeadVisual({ sample: global.EKO.sampleCardAt(card, this.headMm) });
    this._updateStatus();
  }

  CardView.prototype._build = function () {
    var geo = global.EKO.CardGeometry;
    var PAD_L = 18, PAD_R = 10, PAD_T = 10, PAD_B = 6;
    var vbX = -PAD_L, vbY = -PAD_T;
    var vbW = geo.CARD_WIDTH_MM + PAD_L + PAD_R;
    var vbH = geo.CARD_HEIGHT_MM + PAD_T + PAD_B;

    this.container.innerHTML = '';
    var svg = el('svg', {
      viewBox: vbX + ' ' + vbY + ' ' + vbW + ' ' + vbH,
      class: 'card-svg',
      'touch-action': 'none'
    });
    this.svg = svg;

    // card stock background + outline
    svg.appendChild(el('rect', {
      x: 0, y: 0, width: geo.CARD_WIDTH_MM, height: geo.CARD_HEIGHT_MM,
      class: 'card-stock'
    }));

    var self = this;

    function addHole(track, col, xMm, yMm, punched) {
      var c = el('circle', {
        cx: xMm, cy: yMm, r: geo.HOLE_RADIUS_MM,
        class: 'punch-hole' + (punched ? ' punched' : '')
      });
      c.dataset.track = track;
      if (col != null) c.dataset.col = col;
      svg.appendChild(c);
      self._holeEls.push({ el: c, track: track, col: col });
    }

    geo.TRACKS.forEach(function (track, ti) {
      var yMm = geo.trackY(ti);
      var label = el('text', { x: -3, y: yMm + 1.6, class: 'track-label', 'text-anchor': 'end' });
      label.textContent = track.toUpperCase();
      svg.appendChild(label);

      if (track === 'start') {
        addHole('start', null, geo.START_X, yMm, self.card.start);
      } else if (track === 'stop') {
        addHole('stop', null, geo.STOP_X, yMm, self.card.stop);
      } else if (track === 'step') {
        for (var c = 0; c < geo.COLS; c++) addHole('step', c, geo.stepX(c), yMm, self.card.step[c]);
      } else {
        for (var c2 = 0; c2 < geo.COLS; c2++) addHole(track, c2, geo.dataX(c2), yMm, self.card.data[track][c2]);
      }
    });

    for (var c3 = 0; c3 < geo.COLS; c3++) {
      var num = el('text', { x: geo.dataX(c3), y: -3, class: 'col-label', 'text-anchor': 'middle' });
      num.textContent = String(c3 + 1);
      svg.appendChild(num);
    }

    // read head: vertical line + one lamp per track
    this.headLine = el('line', {
      x1: this.headMm, x2: this.headMm, y1: -PAD_T + 1, y2: geo.CARD_HEIGHT_MM + PAD_B - 1,
      class: 'head-line'
    });
    svg.appendChild(this.headLine);

    geo.TRACKS.forEach(function (track, ti) {
      var lamp = el('circle', { cx: 0, cy: geo.trackY(ti), r: 1.5, class: 'head-lamp' });
      svg.appendChild(lamp);
      self._lampEls.push(lamp);
    });

    this.container.appendChild(svg);
    this._wireInteraction();
  };

  CardView.prototype._toggleHole = function (target) {
    if (!target || !target.dataset || !target.dataset.track) return;
    var track = target.dataset.track;
    var card = this.card;
    if (track === 'start') {
      card.start = !card.start;
    } else if (track === 'stop') {
      card.stop = !card.stop;
    } else if (track === 'step') {
      var c = Number(target.dataset.col);
      card.step[c] = !card.step[c];
    } else {
      var c2 = Number(target.dataset.col);
      card.data[track][c2] = !card.data[track][c2];
    }
    target.classList.toggle('punched');
  };

  CardView.prototype._pxPerMm = function () {
    var rect = this.svg.getBoundingClientRect();
    var vb = this.svg.viewBox.baseVal;
    return rect.width / vb.width;
  };

  CardView.prototype._wireInteraction = function () {
    var self = this;
    var dragging = false;
    var startClientX = 0;
    var startHeadMm = 0;
    var downTarget = null;
    var geo = global.EKO.CardGeometry;
    var minMm = this.swipe.withdrawnPosition() - 10;
    var maxMm = geo.CARD_WIDTH_MM + 20;

    this.svg.addEventListener('pointerdown', function (e) {
      dragging = false;
      startClientX = e.clientX;
      startHeadMm = self.headMm;
      downTarget = e.target;
      try { self.svg.setPointerCapture(e.pointerId); } catch (err) { /* no-op: some synthetic/edge-case pointers can't be captured */ }
    });

    this.svg.addEventListener('pointermove', function (e) {
      if (downTarget == null) return;
      var dxPx = e.clientX - startClientX;
      if (!dragging && Math.abs(dxPx) < DRAG_THRESHOLD_PX) return;
      dragging = true;
      var mmPerPx = 1 / self._pxPerMm();
      var newHeadMm = Math.max(minMm, Math.min(maxMm, startHeadMm + dxPx * mmPerPx));
      self.moveHeadTo(newHeadMm);
    });

    function finish(e) {
      if (downTarget == null) return;
      if (!dragging) self._toggleHole(downTarget);
      downTarget = null;
      dragging = false;
    }
    this.svg.addEventListener('pointerup', finish);
    this.svg.addEventListener('pointercancel', finish);
  };

  CardView.prototype._updateHeadVisual = function (result) {
    this.headLine.setAttribute('x1', this.headMm);
    this.headLine.setAttribute('x2', this.headMm);
    var sample = result.sample;
    var flags = [sample.start, sample.step, sample.stop].concat(sample.data);
    for (var i = 0; i < this._lampEls.length; i++) {
      this._lampEls[i].setAttribute('cx', this.headMm + 3);
      this._lampEls[i].classList.toggle('lit', !!flags[i]);
    }
  };

  CardView.prototype.moveHeadTo = function (headMm) {
    this.headMm = headMm;
    var result = this.swipe.moveTo(headMm);
    this._updateHeadVisual(result);
    this._applyEvents(result.events);
    this._updateStatus();
    return result.events;
  };

  CardView.prototype._applyEvents = function (events) {
    var matrix = global.EKO.matrix;
    events.forEach(function (ev) {
      if (ev.type === 'start') {
        matrix.clearAll();
      } else if (ev.type === 'column') {
        matrix.ROWS.forEach(function (row, r) {
          matrix.setCell(row, ev.index, !!ev.data[r]);
        });
      }
      if (typeof global.EKO.onReaderEvent === 'function') global.EKO.onReaderEvent(ev);
    });
  };

  CardView.prototype._updateStatus = function () {
    if (typeof this.onStatus === 'function') {
      this.onStatus({ loading: this.reader.state.loading, column: this.reader.state.column });
    }
  };

  CardView.prototype.loadCard = function (card) {
    this.card = card;
    this.reader.reset();
    this.swipe = global.EKO.createSwipe(card, this.reader);
    this.headMm = this.swipe.withdrawnPosition();
    this._build();
    this._updateHeadVisual({ sample: global.EKO.sampleCardAt(card, this.headMm) });
    this._updateStatus();
  };

  global.EKO = global.EKO || {};
  global.EKO.CardView = CardView;
})(window);
