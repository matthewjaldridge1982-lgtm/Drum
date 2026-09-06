/*
 * Wiring: builds the transport bar and instrument strip DOM, hooks them
 * to EKO.transport / EKO.audio / EKO.matrix. No logic of consequence
 * lives here -- it's glue.
 */
(function (global) {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    var EKO = global.EKO;

    EKO.matrix.render(document.getElementById('matrix-container'));
    buildTransport();
    buildInstrumentStrip();
    buildCardSystem();

    // Most browsers require a user gesture before audio starts.
    document.body.addEventListener('pointerdown', function once() {
      EKO.audio.resume();
      document.body.removeEventListener('pointerdown', once);
    });
  });

  function buildTransport() {
    var EKO = window.EKO;
    var startBtn = document.getElementById('btn-start');
    var holdBtn = document.getElementById('btn-hold');
    var cancelBtn = document.getElementById('btn-cancel');
    var lengthContainer = document.getElementById('length-buttons');
    var led = document.getElementById('start-led');
    var powerSwitch = document.getElementById('power-switch');

    // Real hardware has a single START-STOP toggle, not separate buttons
    // (confirmed from reference photos) -- see NOTES.md.
    startBtn.addEventListener('click', function () {
      if (EKO.transport.isPlaying()) {
        EKO.transport.stop();
      } else {
        EKO.audio.resume();
        EKO.transport.start();
      }
    });
    EKO.transport.onChange(function (evt) {
      if (evt.type === 'start') { startBtn.classList.add('active'); led.classList.add('on'); }
      else if (evt.type === 'stop') { startBtn.classList.remove('active'); led.classList.remove('on'); }
    });

    holdBtn.addEventListener('click', function () {
      var on = !EKO.transport.isHeld();
      EKO.transport.setHold(on);
      holdBtn.classList.toggle('active', on);
    });
    cancelBtn.addEventListener('click', function () {
      EKO.transport.generalCancel();
    });

    var powerOn = true;
    powerSwitch.classList.add('on');
    powerSwitch.addEventListener('click', function () {
      powerOn = !powerOn;
      powerSwitch.classList.toggle('on', powerOn);
      if (!powerOn && EKO.transport.isPlaying()) EKO.transport.stop();
    });

    // photo shows the seven lengths running ascending, x5..x16, left to right
    EKO.transport.LENGTHS.slice().reverse().forEach(function (len) {
      var btn = document.createElement('button');
      btn.className = 'length-btn' + (len === EKO.transport.getLength() ? ' active' : '');
      btn.textContent = 'x' + len;
      btn.addEventListener('click', function () {
        EKO.transport.setLength(len);
        lengthContainer.querySelectorAll('.length-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
      lengthContainer.appendChild(btn);
    });

    // SPEED knob replaces the old linear slider -- same underlying
    // EKO.transport.setStepInterval, just a rotary control to match the panel.
    var speedKnob = EKO.makeKnob({
      className: 'large chrome',
      value: 0.55,
      title: 'Speed',
      onChange: function (v) {
        var ms = 80 + v * (600 - 80);
        EKO.transport.setStepInterval(ms / 1000);
      }
    });
    speedKnob.setValue(0.55);
    document.getElementById('speed-knob-slot').appendChild(speedKnob.el);

    var volumeKnob = EKO.makeKnob({
      className: 'large chrome',
      value: 0.9,
      title: 'Volume',
      onChange: function (v) { EKO.audio.setMasterLevel(v); }
    });
    document.getElementById('volume-knob-slot').appendChild(volumeKnob.el);
  }

  function buildInstrumentStrip() {
    // Per-instrument level now lives on the machine itself (the row knobs
    // built by matrix.js) and master level is the panel's VOLUME knob --
    // this strip is solo-monitoring only, a browser convenience with no
    // hardware equivalent.
    var EKO = window.EKO;
    var strip = document.getElementById('instrument-strip');

    EKO.INSTRUMENTS.forEach(function (inst) {
      var ch = document.createElement('div');
      ch.className = 'channel';

      var name = document.createElement('div');
      name.className = 'name';
      name.textContent = inst.name;
      ch.appendChild(name);

      var soloBtn = document.createElement('button');
      soloBtn.className = 'solo-btn';
      soloBtn.textContent = 'SOLO';
      soloBtn.addEventListener('click', function () {
        var on = !soloBtn.classList.contains('active');
        soloBtn.classList.toggle('active', on);
        EKO.audio.setSolo(inst.id, on);
      });
      ch.appendChild(soloBtn);

      strip.appendChild(ch);
    });
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function buildCardSystem() {
    var EKO = window.EKO;
    var geo = EKO.CardGeometry;
    var statusEl = document.getElementById('reader-status');
    var slider = document.getElementById('head-slider');

    var card = EKO.createBlankCard();
    var view = new EKO.CardView(document.getElementById('card-editor-container'), card);
    EKO.activeCardView = view; // exposed for debugging/testing

    function paintStatus(s) {
      statusEl.innerHTML = (s.loading ? '<span class="loading">LOADING</span>' : '<span class="idle">IDLE</span>') +
        ' &middot; column ' + s.column + ' / 16';
    }
    view.onStatus = paintStatus;

    function configureSlider() {
      slider.min = String(view.swipe.withdrawnPosition() - 10);
      slider.max = String(geo.CARD_WIDTH_MM + 20);
      slider.step = '0.1';
      slider.value = String(view.headMm);
    }
    configureSlider();
    paintStatus({ loading: view.reader.state.loading, column: view.reader.state.column });

    var originalMoveHeadTo = view.moveHeadTo.bind(view);
    view.moveHeadTo = function (mm) {
      var events = originalMoveHeadTo(mm);
      slider.value = String(view.headMm);
      return events;
    };

    slider.addEventListener('input', function () {
      view.moveHeadTo(Number(slider.value));
    });

    document.getElementById('card-new').addEventListener('click', function () {
      view.loadCard(EKO.createBlankCard());
      configureSlider();
    });

    document.getElementById('card-export-json').addEventListener('click', function () {
      var blob = new Blob([EKO.cardToJSON(view.card)], { type: 'application/json' });
      downloadBlob(blob, 'eko-card.json');
    });

    var importInput = document.getElementById('card-import-input');
    document.getElementById('card-import-json').addEventListener('click', function () {
      importInput.click();
    });
    importInput.addEventListener('change', function () {
      var file = importInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var card = EKO.cardFromJSON(reader.result);
          view.loadCard(card);
          configureSlider();
        } catch (e) {
          alert('Could not read that card file: ' + e.message);
        }
      };
      reader.readAsText(file);
      importInput.value = '';
    });

    document.getElementById('card-export-pdf').addEventListener('click', function () {
      EKO.downloadCardPdf(view.card, 'eko-card.pdf');
    });
  }
})(window);
