/*
 * Instrument configuration for the EKO ComputeRhythm recreation.
 *
 * Row/pairing is read directly off the factory schematic (p2, block
 * 600-700): six switches SW910-SW915 each straddle one top-row and one
 * bottom-row instrument. See NOTES.md for the source citation.
 *
 * Every synthesis-relevant number lives here so Phase 3 tuning is a
 * one-file edit. `freq` values marked with a source of "schematic" were
 * computed from f = 1/(2*pi*sqrt(L*C)) using L/C read directly off the
 * traced schematic (see NOTES.md); others are placeholders pending
 * Phase 3.
 */
(function (global) {
  'use strict';

  var ROWS = ['A', 'B', 'C', 'D', 'E', 'F'];

  // prettier-ignore
  var INSTRUMENTS = [
    { id: 'bass_drum',    name: 'Bass Drum',   row: 'A', slot: 'A', synth: 'kick',     level: 0.9 },
    { id: 'block1',       name: 'Block 1',     row: 'A', slot: 'B', synth: 'block',    level: 0.8 },
    { id: 'timbale1',     name: 'Timbale 1',   row: 'B', slot: 'A', synth: 'tom',      level: 0.8, freq: 220 },
    { id: 'block2',       name: 'Block 2',     row: 'B', slot: 'B', synth: 'block',    level: 0.8, freq: 900 },
    { id: 'clave',        name: 'Clave',       row: 'C', slot: 'A', synth: 'click',    level: 0.8, freq: 2200 },
    { id: 'triangle',     name: 'Triangle',    row: 'C', slot: 'B', synth: 'ring',     level: 0.7, freq: 6787, freqSource: 'schematic (L604 25mH / C656 22nF)' },
    { id: 'charleston',   name: 'Charleston',  row: 'D', slot: 'A', synth: 'hat',      level: 0.8, freq: 17518, freqSource: 'schematic (L601 25mH / C621 3.3nF)' },
    { id: 'timbale2',     name: 'Timbale 2',   row: 'D', slot: 'B', synth: 'tom',      level: 0.8, freq: 160 },
    { id: 'snare',        name: 'Snare',       row: 'E', slot: 'A', synth: 'snare',    level: 0.85, freq: 14338, freqSource: 'schematic (L602 56mH / C626 2.2nF, see NOTES.md discrepancy)' },
    { id: 'cymbal2',      name: 'Cymbal 2',    row: 'E', slot: 'B', synth: 'cymbal',   level: 0.7, freq: 6787, freqSource: 'schematic (L605 250mH / C672 2.2nF)' },
    { id: 'cymbal1',      name: 'Cymbal 1',    row: 'F', slot: 'A', synth: 'cymbal',   level: 0.7, freq: 14338, freqSource: 'schematic (L603 56mH / C636 2.2nF)' },
    { id: 'rolling_drum', name: 'Rolling Drum',row: 'F', slot: 'B', synth: 'roll',     level: 0.85, freq: 150 }
  ];

  var byId = {};
  var byRowSlot = {};
  INSTRUMENTS.forEach(function (inst) {
    byId[inst.id] = inst;
    byRowSlot[inst.row + inst.slot] = inst;
  });

  global.EKO = global.EKO || {};
  global.EKO.ROWS = ROWS;
  global.EKO.INSTRUMENTS = INSTRUMENTS;
  global.EKO.instrumentById = function (id) { return byId[id]; };
  global.EKO.instrumentForRowSlot = function (row, slot) { return byRowSlot[row + slot]; };
})(window);
