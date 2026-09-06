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

  function render(container) {
    container.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'matrix-grid';

    ROWS.forEach(function (row) {
      var rowEl = document.createElement('div');
      rowEl.className = 'matrix-row';

      var label = document.createElement('div');
      label.className = 'row-label';
      label.textContent = row;
      rowEl.appendChild(label);

      var instA = global.EKO.instrumentForRowSlot(row, 'A');
      var instB = global.EKO.instrumentForRowSlot(row, 'B');
      var selectEl = document.createElement('div');
      selectEl.className = 'row-select';
      selectEl.title = instA.name + ' / ' + instB.name;
      ['A', 'B'].forEach(function (slot) {
        var btn = document.createElement('button');
        btn.className = 'row-select-btn' + (rowSelect[row] === slot ? ' active' : '');
        btn.dataset.slot = slot;
        btn.textContent = (slot === 'A' ? instA : instB).name;
        btn.addEventListener('click', function () { setRowSelect(row, slot); });
        selectEl.appendChild(btn);
      });
      selectEls[row] = selectEl;
      rowEl.appendChild(selectEl);

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
      grid.appendChild(rowEl);
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
