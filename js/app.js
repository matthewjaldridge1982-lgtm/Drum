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

    // No-op outside an LMS (see scorm.js) -- safe to always call.
    EKO.scorm.init();
    global.addEventListener('beforeunload', function () { EKO.scorm.terminate(); });

    // Most browsers require a user gesture before audio starts. Also the
    // simplest honest "completion" signal for a hands-on simulator with
    // no quiz: the learner actually touched the machine.
    document.body.addEventListener('pointerdown', function once() {
      EKO.audio.resume();
      EKO.scorm.setComplete();
      document.body.removeEventListener('pointerdown', once);
    });
  });

  function buildTransport() {
    var EKO = window.EKO;
    var startBtn = document.getElementById('btn-start');
    var stopBtn = document.getElementById('btn-stop');
    var holdBtn = document.getElementById('btn-hold');
    var cancelBtn = document.getElementById('btn-cancel');
    var tempoSlider = document.getElementById('tempo-slider');
    var tempoReadout = document.getElementById('tempo-readout');
    var lengthContainer = document.getElementById('length-buttons');

    startBtn.addEventListener('click', function () {
      EKO.transport.start();
      startBtn.classList.add('active');
      stopBtn.classList.remove('active');
    });
    stopBtn.addEventListener('click', function () {
      EKO.transport.stop();
      stopBtn.classList.add('active');
      startBtn.classList.remove('active');
      setTimeout(function () { stopBtn.classList.remove('active'); }, 150);
    });
    holdBtn.addEventListener('click', function () {
      var on = !EKO.transport.isHeld();
      EKO.transport.setHold(on);
      holdBtn.classList.toggle('active', on);
    });
    cancelBtn.addEventListener('click', function () {
      EKO.transport.generalCancel();
    });

    function msToLabel(ms) {
      var bpm = Math.round(60000 / ms);
      return ms + ' ms/step (~' + bpm + ' bpm)';
    }
    tempoSlider.addEventListener('input', function () {
      var ms = Number(tempoSlider.value);
      EKO.transport.setStepInterval(ms / 1000);
      tempoReadout.textContent = msToLabel(ms);
    });
    tempoReadout.textContent = msToLabel(Number(tempoSlider.value));
    EKO.transport.setStepInterval(Number(tempoSlider.value) / 1000);

    EKO.transport.LENGTHS.forEach(function (len) {
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
  }

  function buildInstrumentStrip() {
    var EKO = window.EKO;
    var strip = document.getElementById('instrument-strip');

    EKO.INSTRUMENTS.forEach(function (inst) {
      var ch = document.createElement('div');
      ch.className = 'channel';

      var rowTag = document.createElement('div');
      rowTag.className = 'row-tag';
      rowTag.textContent = 'ROW ' + inst.row;
      ch.appendChild(rowTag);

      var name = document.createElement('div');
      name.className = 'name';
      name.textContent = inst.name;
      ch.appendChild(name);

      var slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '1';
      slider.step = '0.01';
      slider.value = String(inst.level != null ? inst.level : 0.8);
      slider.addEventListener('input', function () {
        EKO.audio.setLevel(inst.id, Number(slider.value));
      });
      ch.appendChild(slider);

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

    var master = document.createElement('div');
    master.className = 'channel master-channel';
    master.innerHTML = '<div class="row-tag">MASTER</div><div class="name">Mix</div>';
    var masterSlider = document.createElement('input');
    masterSlider.type = 'range';
    masterSlider.min = '0';
    masterSlider.max = '1';
    masterSlider.step = '0.01';
    masterSlider.value = '0.9';
    masterSlider.addEventListener('input', function () {
      EKO.audio.setMasterLevel(Number(masterSlider.value));
    });
    master.appendChild(masterSlider);
    strip.appendChild(master);
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
