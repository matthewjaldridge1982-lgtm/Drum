/*
 * 6x16 button matrix: latch state + DOM rendering.
 *
 * This is the "96 illuminated pushbuttons" -- clicking toggles a latch,
 * the lamp reflects latch state directly. Also owns the six row
 * instrument-select switches (slot A/B per row), since those are
 * physically part of the same panel section.
 */
(function (global) {
  'use strict';

  var ROWS = global.EKO.ROWS;
  var COLS = 16;

  var state = ROWS.reduce(function (acc, row) {
    acc[row] = new Array(COLS).fill(false);
    return acc;
  }, {});

  var rowSelect = ROWS.reduce(function (acc, row) {
    acc[row] = 'A';
    return acc;
  }, {});

  var listeners = [];

  function notify(evt) {
    listeners.forEach(function (fn) { fn(evt); });
  }

  var cellEls = {}; // "row-col" -> element
  var selectEls = {}; // row -> element

  function cellKey(row, col) { return row + '-' + col; }

  function setCell(row, col, value, opts) {
    opts = opts || {};
    state[row][col] = !!value;
    var el = cellEls[cellKey(row, col)];
    if (el) el.classList.toggle('lit', !!value);
    if (!opts.silent) notify({ type: 'cell', row: row, col: col, value: !!value });
  }

  function toggleCell(row, col) {
    setCell(row, col, !state[row][col]);
  }

  function setRowSelect(row, slot) {
    rowSelect[row] = slot;
    var el = selectEls[row];
    if (el) {
      el.querySelectorAll('.row-select-btn').forEach(function (b) {
        b.classList.toggle('active', b.dataset.slot === slot);
      });
    }
    notify({ type: 'rowSelect', row: row, slot: slot });
  }

  // Real-panel display order (confirmed from reference photos): rows run
  // F..A top-to-bottom, the reverse of this module's internal A-F keys
  // (which follow the schematic's own SW910=row-A numbering). Display
  // order only -- state stays keyed A-F throughout.
  var DISPLAY_ROWS = ['F', 'E', 'D', 'C', 'B', 'A'];

  var rowLevels = ROWS.reduce(function (acc, row) { acc[row] = 0.85; return acc; }, {});
  var trimLevels = {}; // instrument id -> 0..1

  function applyRowAudioLevel(row) {
    var EKO = global.EKO;
    if (!EKO.audio) return;
    var inst = EKO.instrumentForRowSlot(row, rowSelect[row]);
    var trim = trimLevels[inst.id] != null ? trimLevels[inst.id] : 0.85;
    EKO.audio.setLevel(inst.id, rowLevels[row] * trim);
  }

  function render(container) {
    var EKO = global.EKO;
    container.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'matrix-grid';

    DISPLAY_ROWS.forEach(function (row) {
      var rowEl = document.createElement('div');
      rowEl.className = 'matrix-row';

      var instA = EKO.instrumentForRowSlot(row, 'A');
      var instB = EKO.instrumentForRowSlot(row, 'B');
      if (trimLevels[instA.id] == null) trimLevels[instA.id] = instA.level != null ? instA.level : 0.85;
      if (trimLevels[instB.id] == null) trimLevels[instB.id] = instB.level != null ? instB.level : 0.85;

      // slider: this row's shared output trim
      var sliderWrap = document.createElement('div');
      sliderWrap.className = 'row-slider';
      var fader = EKO.makeFader({
        value: rowLevels[row],
        title: 'Row ' + row + ' level',
        onChange: function (v) {
          rowLevels[row] = v;
          applyRowAudioLevel(row);
        }
      });
      sliderWrap.appendChild(fader.el);
      rowEl.appendChild(sliderWrap);

      // instrument-pair name plate + level knobs
      var namesEl = document.createElement('div');
      namesEl.className = 'row-names';

      var knobsEl = document.createElement('div');
      knobsEl.className = 'row-knobs';

      [instA, instB].forEach(function (inst) {
        var nameSpan = document.createElement('span');
        nameSpan.className = 'row-name';
        nameSpan.textContent = inst.name;
        namesEl.appendChild(nameSpan);

        var knob = EKO.makeKnob({
          value: trimLevels[inst.id],
          title: inst.name + ' level',
          onChange: function (v) {
            trimLevels[inst.id] = v;
            applyRowAudioLevel(row);
          }
        });
        knobsEl.appendChild(knob.el);
      });
      rowEl.appendChild(namesEl);
      rowEl.appendChild(knobsEl);

      // A/B select toggle
      var selectEl = document.createElement('div');
      selectEl.className = 'row-select';
      selectEl.title = instA.name + ' / ' + instB.name;
      ['A', 'B'].forEach(function (slot) {
        var btn = document.createElement('button');
        btn.className = 'row-select-btn' + (rowSelect[row] === slot ? ' active' : '');
        btn.dataset.slot = slot;
        btn.textContent = slot;
        btn.addEventListener('click', function () {
          setRowSelect(row, slot);
          applyRowAudioLevel(row);
        });
        selectEl.appendChild(btn);
      });
      selectEls[row] = selectEl;
      rowEl.appendChild(selectEl);

      var label = document.createElement('div');
      label.className = 'row-label';
      label.textContent = row;
      rowEl.appendChild(label);

      var stepsEl = document.createElement('div');
      stepsEl.className = 'row-steps';
      for (var col = 0; col < COLS; col++) {
        (function (col) {
          var btn = document.createElement('button');
          btn.className = 'lamp-btn' + (state[row][col] ? ' lit' : '');
          if ((col) % 4 === 0) btn.classList.add('beat-start');
          btn.setAttribute('aria-label', row + (col + 1));
          btn.addEventListener('click', function () { toggleCell(row, col); });
          cellEls[cellKey(row, col)] = btn;
          stepsEl.appendChild(btn);
        })(col);
      }
      rowEl.appendChild(stepsEl);

      // per-row cancel knob (clears just this row's 16 latches)
      var cancelBtn = document.createElement('button');
      cancelBtn.className = 'row-cancel-btn';
      cancelBtn.title = 'Clear row ' + row;
      cancelBtn.addEventListener('click', function () {
        for (var c = 0; c < COLS; c++) setCell(row, c, false);
      });
      rowEl.appendChild(cancelBtn);

      grid.appendChild(rowEl);
      applyRowAudioLevel(row);
    });

    container.appendChild(grid);
  }

  function markPlayhead(col, length) {
    document.querySelectorAll('.lamp-btn.playhead').forEach(function (el) {
      el.classList.remove('playhead');
    });
    if (col == null) return;
    ROWS.forEach(function (row) {
      var el = cellEls[cellKey(row, col)];
      if (el) el.classList.add('playhead');
    });
  }

  global.EKO.matrix = {
    ROWS: ROWS,
    COLS: COLS,
    state: state,
    rowSelect: rowSelect,
    render: render,
    setCell: setCell,
    toggleCell: toggleCell,
    setRowSelect: setRowSelect,
    getRowLatches: function (row) { return state[row].slice(); },
    markPlayhead: markPlayhead,
    clearAll: function () {
      ROWS.forEach(function (row) {
        for (var c = 0; c < COLS; c++) setCell(row, c, false, { silent: true });
      });
      notify({ type: 'clear' });
    },
    loadPattern: function (pattern) {
      // pattern: 6x16 array of 0/1 in ROWS order -- used by the Phase 2 card reader.
      ROWS.forEach(function (row, r) {
        for (var c = 0; c < COLS; c++) setCell(row, c, !!pattern[r][c], { silent: true });
      });
      notify({ type: 'load' });
    },
    onChange: function (fn) { listeners.push(fn); }
  };
})(window);
