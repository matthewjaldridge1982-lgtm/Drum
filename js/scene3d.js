/*
 * 3D panel redesign, built on Babylon.js (vendored at vendor/babylonjs/babylon.js).
 *
 * This file is the ONLY new thing here -- every control drives the exact
 * same logic modules from the 2D build (instruments.js, audio.js,
 * matrix.js, transport.js, reader.js, card.js, swipe.js, pdf.js), all
 * loaded unchanged. This is a new rendering + input layer, not a rewrite
 * of the machine.
 *
 * Physical layout is read off the reference photos of a real
 * ComputeRhythm (see NOTES.md "3D redesign" section): rows run, top to
 * bottom, F/E/D/C/B/A -- the opposite of this app's internal A-F order
 * (which comes from the schematic's switch numbering, SW910 = row A).
 * That's a display-order choice only; row keys are unchanged.
 *
 * Control mapping is an interpretation, not a confirmed schematic fact,
 * and is documented as such in NOTES.md: the six sliders drive a row's
 * shared level, the twelve knobs are each instrument's own trim, and a
 * small toggle per row is the A/B instrument select (whose real physical
 * form on the hardware is one of the details the photos don't resolve).
 */
(function (global) {
  'use strict';

  var EKO = global.EKO;
  var DISPLAY_ROWS = ['F', 'E', 'D', 'C', 'B', 'A']; // top-to-bottom on the real panel

  // ---------- small helpers ----------

  function color(hex) { return BABYLON.Color3.FromHexString(hex); }

  function makeStandardMat(scene, name, hex, opts) {
    opts = opts || {};
    var m = new BABYLON.StandardMaterial(name, scene);
    m.diffuseColor = color(hex);
    m.specularColor = opts.specular ? color(opts.specular) : new BABYLON.Color3(0.15, 0.15, 0.15);
    if (opts.emissive) m.emissiveColor = color(opts.emissive);
    return m;
  }

  function textPlateTexture(scene, text, sub) {
    var tex = new BABYLON.DynamicTexture('plate-' + text, { width: 512, height: 512 }, scene, true);
    var ctx = tex.getContext();
    ctx.fillStyle = '#ece6df';
    ctx.fillRect(0, 0, 512, 512);
    ctx.translate(256, 256);
    ctx.fillStyle = '#141210';
    ctx.font = 'bold 54px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // simple circular wordmark
    var chars = text.split('');
    var radius = 150;
    ctx.font = 'bold 40px Georgia, serif';
    for (var i = 0; i < chars.length; i++) {
      var angle = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.rotate(angle + Math.PI / 2);
      ctx.translate(0, -radius);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
    }
    if (sub) {
      ctx.font = '22px Georgia, serif';
      ctx.fillText(sub, 0, 0);
    }
    tex.update();
    return tex;
  }

  // ---------- card texture (mirrors card.js geometry onto a canvas) ----------

  function CardTexture(scene, card) {
    var geo = EKO.CardGeometry;
    var pxPerMm = 6;
    var w = Math.ceil(geo.CARD_WIDTH_MM * pxPerMm);
    var h = Math.ceil(geo.CARD_HEIGHT_MM * pxPerMm);
    var tex = new BABYLON.DynamicTexture('card-tex', { width: w, height: h }, scene, false);
    var ctx = tex.getContext();

    function redraw() {
      ctx.fillStyle = '#cbb98d';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#6b5f45';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);

      function hole(xMm, yMm, punched) {
        var x = xMm * pxPerMm, y = yMm * pxPerMm, r = geo.HOLE_RADIUS_MM * pxPerMm;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = punched ? '#16130f' : '#cbb98d';
        ctx.fill();
        ctx.strokeStyle = '#6b5f45';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      geo.TRACKS.forEach(function (track, ti) {
        var yMm = geo.trackY(ti);
        if (track === 'start') {
          hole(geo.START_X, yMm, card.start);
        } else if (track === 'stop') {
          hole(geo.STOP_X, yMm, card.stop);
        } else if (track === 'step') {
          for (var c = 0; c < geo.COLS; c++) hole(geo.stepX(c), yMm, card.step[c]);
        } else {
          for (var c2 = 0; c2 < geo.COLS; c2++) hole(geo.dataX(c2), yMm, card.data[track][c2]);
        }
      });
      tex.update();
    }

    redraw();
    return { texture: tex, redraw: redraw, pxPerMm: pxPerMm, width: w, height: h };
  }

  // ---------- main scene builder ----------

  function buildScene(canvas, ui) {
    var engine = new BABYLON.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });
    var scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.04, 0.035, 0.03, 1);

    var camera = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2.35, Math.PI / 3.1, 26, new BABYLON.Vector3(0, 0.6, 0), scene);
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit = 14;
    camera.upperRadiusLimit = 40;
    camera.lowerBetaLimit = 0.35;
    camera.upperBetaLimit = Math.PI / 2.05;
    camera.wheelPrecision = 30;
    camera.panningSensibility = 0; // no panning -- keep the machine centred

    scene.createDefaultLight = null;
    var hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0.2), scene);
    hemi.intensity = 0.55;
    hemi.groundColor = new BABYLON.Color3(0.08, 0.08, 0.09);
    var key = new BABYLON.DirectionalLight('key', new BABYLON.Vector3(-0.5, -1, 0.6), scene);
    key.intensity = 0.85;
    var fill = new BABYLON.DirectionalLight('fill', new BABYLON.Vector3(0.6, -0.4, -0.8), scene);
    fill.intensity = 0.35;

    // ---- materials ----
    var matChassis = makeStandardMat(scene, 'chassis', '#141210', { specular: '#333' });
    var matCheek = makeStandardMat(scene, 'cheek', '#cbb583', { specular: '#555' });
    var matPanel = makeStandardMat(scene, 'panel', '#221f1b', { specular: '#333' });
    var matChrome = makeStandardMat(scene, 'chrome', '#c9c9cf', { specular: '#fff' });
    matChrome.specularPower = 128;
    var matLampOff = makeStandardMat(scene, 'lampOff', '#3a2418', { emissive: '#180d06' });
    var matLampOn = makeStandardMat(scene, 'lampOn', '#3a1f0a', { emissive: '#ff8420' });
    matLampOn.specularColor = new BABYLON.Color3(0, 0, 0);
    var matAccentRed = makeStandardMat(scene, 'accentRed', '#b8291c', { emissive: '#4a0f08' });
    var matAccentRedOn = makeStandardMat(scene, 'accentRedOn', '#ff3a26', { emissive: '#ff2a1a' });
    var matKnob = makeStandardMat(scene, 'knob', '#403a34', { specular: '#999' });
    var matChromeKnob = makeStandardMat(scene, 'chromeKnob', '#b7b3aa', { specular: '#fff' });
    var matCardStock = makeStandardMat(scene, 'cardstock', '#cbb98d', { specular: '#222' });

    // ---- chassis ----
    var PANEL_W = 24, PANEL_D = 12;
    var body = BABYLON.MeshBuilder.CreateBox('body', { width: PANEL_W + 2, depth: PANEL_D + 1, height: 2.2 }, scene);
    body.position.y = -1.1;
    body.material = matChassis;

    var panelTop = BABYLON.MeshBuilder.CreateBox('panelTop', { width: PANEL_W, depth: PANEL_D, height: 0.3 }, scene);
    panelTop.position.y = 0.15;
    panelTop.material = matPanel;

    [-1, 1].forEach(function (side) {
      var cheek = BABYLON.MeshBuilder.CreateBox('cheek' + side, { width: 1.4, depth: PANEL_D + 1, height: 3.4 }, scene);
      cheek.position.set(side * (PANEL_W / 2 + 1.3), -0.7, 0);
      cheek.scaling.z = 1;
      cheek.rotation.z = side * 0.03;
      cheek.material = matCheek;
    });

    var handle = BABYLON.MeshBuilder.CreateTorus('handle', { diameter: 3.2, thickness: 0.22, tessellation: 24 }, scene);
    handle.rotation.x = Math.PI / 2;
    handle.rotation.z = Math.PI / 2;
    handle.position.set(-2, 1.35, -PANEL_D / 2 + 0.3);
    handle.material = matKnob;

    // branding plate -- on the front face of the chassis, clear of the
    // card's long travel range (that ties up most of the top surface's depth)
    var plate = BABYLON.MeshBuilder.CreatePlane('plate', { width: 2.6, height: 2.6 }, scene);
    plate.position.set(PANEL_W / 2 - 3, -1.0, -(PANEL_D / 2 + 0.51));
    var plateMat = new BABYLON.StandardMaterial('plateMat', scene);
    plateMat.diffuseTexture = textPlateTexture(scene, 'COMPUTERHYTHM', 'EKO');
    plateMat.specularColor = new BABYLON.Color3(0.1, 0.1, 0.1);
    plateMat.backFaceCulling = false;
    plate.material = plateMat;

    // ---------- interaction bookkeeping ----------
    var draggable = []; // { mesh, onDragStart(pick), onDrag(dxPx, dyPx), onDragEnd }
    var clickable = []; // { mesh, onClick }

    function registerClickable(mesh, onClick) { clickable.push({ mesh: mesh, onClick: onClick }); }
    function registerDraggable(mesh, handlers) { draggable.push(Object.assign({ mesh: mesh }, handlers)); }

    // ---------- lamp matrix ----------
    var COLS = 16;
    var cellSize = 0.92;
    var matrixW = COLS * cellSize;
    var matrixOriginX = -1.5; // shifted left of centre to leave room for the cancel column
    var matrixOriginZ = -2.6;
    var lampMeshes = {}; // "row-col" -> mesh

    // Plain (non-instanced) meshes on purpose: Babylon InstancedMesh shares
    // its source's material, so per-lamp on/off colour needs real meshes.
    // 96 low-poly cylinders is trivial for a WebGL/WebGPU scene either way.
    DISPLAY_ROWS.forEach(function (row, rIdx) {
      for (var c = 0; c < COLS; c++) {
        var lamp = BABYLON.MeshBuilder.CreateCylinder('lamp-' + row + '-' + c, { diameter: 0.58, height: 0.22, tessellation: 16 }, scene);
        lamp.position.set(matrixOriginX + c * cellSize - matrixW / 2, 0.4, matrixOriginZ + rIdx * cellSize);
        lamp.material = matLampOff;
        lampMeshes[row + '-' + c] = lamp;
        (function (row, c, lamp) {
          registerClickable(lamp, function () {
            EKO.matrix.toggleCell(row, c);
          });
        })(row, c, lamp);
      }
    });

    function paintMatrix() {
      DISPLAY_ROWS.forEach(function (row) {
        var latches = EKO.matrix.getRowLatches(row);
        for (var c = 0; c < COLS; c++) {
          var lamp = lampMeshes[row + '-' + c];
          lamp.material = latches[c] ? matLampOn : matLampOff;
        }
      });
    }

    EKO.matrix.onChange(function () { paintMatrix(); });

    // playhead marker
    var playhead = BABYLON.MeshBuilder.CreateBox('playhead', { width: cellSize * 0.95, depth: DISPLAY_ROWS.length * cellSize + 0.3, height: 0.02 }, scene);
    var matPlayhead = makeStandardMat(scene, 'playheadMat', '#4fa3d9', { emissive: '#2a5f7a' });
    matPlayhead.alpha = 0.35;
    playhead.material = matPlayhead;
    playhead.position.y = 0.32;
    playhead.isVisible = false;

    EKO.transport.onChange(function (evt) {
      if (evt.type === 'step') {
        playhead.isVisible = true;
        playhead.position.x = matrixOriginX + evt.step * cellSize - matrixW / 2;
        playhead.position.z = matrixOriginZ + (DISPLAY_ROWS.length - 1) * cellSize / 2;
      } else if (evt.type === 'stop') {
        playhead.isVisible = false;
      }
    });

    // ---------- per-row sliders + per-instrument knobs + A/B toggle ----------
    var sliderMeshes = {}; // row -> {track, cap, value}
    var knobMeshes = {}; // instId -> mesh
    var toggleMeshes = {}; // row -> mesh

    var railX = matrixOriginX - matrixW / 2 - 2.1;
    var SLIDER_TRAVEL = 1.6;

    DISPLAY_ROWS.forEach(function (row, rIdx) {
      var z = matrixOriginZ + rIdx * cellSize;
      var instA = EKO.instrumentForRowSlot(row, 'A');
      var instB = EKO.instrumentForRowSlot(row, 'B');

      // slider track
      var track = BABYLON.MeshBuilder.CreateBox('track-' + row, { width: 0.12, depth: SLIDER_TRAVEL + 0.3, height: 0.06 }, scene);
      track.position.set(railX, 0.31, z);
      track.material = matKnob;

      var cap = BABYLON.MeshBuilder.CreateBox('cap-' + row, { width: 0.5, depth: 0.34, height: 0.22 }, scene);
      cap.material = makeStandardMat(scene, 'capMat-' + row, '#e8853a');
      var initialLevel = 0.8;
      cap.position.set(railX, 0.42, z - SLIDER_TRAVEL / 2 + initialLevel * SLIDER_TRAVEL);
      sliderMeshes[row] = { cap: cap, z: z, value: initialLevel };

      registerDraggable(cap, {
        onDrag: function (dxPx, dyPx) {
          var s = sliderMeshes[row];
          s.value = Math.max(0, Math.min(1, s.value - dyPx / 160));
          cap.position.z = s.z - SLIDER_TRAVEL / 2 + s.value * SLIDER_TRAVEL;
          applyRowLevel(row);
        }
      });

      // two trim knobs (instrument A further out, instrument B nearer the slider)
      [{ inst: instA, dx: -1.1 }, { inst: instB, dx: -0.6 }].forEach(function (spec) {
        var knob = BABYLON.MeshBuilder.CreateCylinder('knob-' + spec.inst.id, { diameter: 0.42, height: 0.32, tessellation: 24 }, scene);
        knob.position.set(railX + spec.dx, 0.42, z);
        knob.material = matKnob;
        var pointer = BABYLON.MeshBuilder.CreateBox('knobPointer-' + spec.inst.id, { width: 0.05, depth: 0.18, height: 0.05 }, scene);
        pointer.parent = knob;
        pointer.position.set(0, 0.17, 0.1);
        pointer.material = matChrome;
        knobMeshes[spec.inst.id] = { mesh: knob, trim: spec.inst.level != null ? spec.inst.level : 0.8 };
        applyKnobRotation(spec.inst.id);
        registerDraggable(knob, {
          onDrag: (function (instId) {
            return function (dxPx, dyPx) {
              var k = knobMeshes[instId];
              k.trim = Math.max(0, Math.min(1, k.trim - dyPx / 160));
              applyKnobRotation(instId);
              applyRowLevel(row);
            };
          })(spec.inst.id)
        });
      });

      // A/B select toggle -- small lever outboard of both knobs
      var toggle = BABYLON.MeshBuilder.CreateBox('toggle-' + row, { width: 0.18, depth: 0.5, height: 0.12 }, scene);
      toggle.position.set(railX - 1.6, 0.38, z);
      toggle.material = matChrome;
      toggleMeshes[row] = toggle;
      paintToggle(row);
      registerClickable(toggle, function () {
        var current = EKO.matrix.rowSelect[row];
        EKO.matrix.setRowSelect(row, current === 'A' ? 'B' : 'A');
        paintToggle(row);
        applyRowLevel(row);
      });

      // row label: both instrument names, lying flat like the card, offset
      // forward of the knobs/toggle/slider so it isn't hidden beneath them
      var label = BABYLON.MeshBuilder.CreatePlane('label-' + row, { width: 2.6, height: 0.4 }, scene);
      label.rotation.x = Math.PI / 2;
      label.position.set(railX - 0.55, 0.32, z + 0.4);
      var labelTex = new BABYLON.DynamicTexture('labelTex-' + row, { width: 512, height: 84 }, scene, true);
      var lctx = labelTex.getContext();
      lctx.fillStyle = '#221f1b'; lctx.fillRect(0, 0, 512, 84);
      lctx.fillStyle = '#cfc7ba'; lctx.font = '28px Georgia, serif'; lctx.textBaseline = 'middle';
      lctx.fillText(instA.name.toUpperCase(), 10, 42);
      lctx.textAlign = 'right';
      lctx.fillText(instB.name.toUpperCase(), 502, 42);
      labelTex.update();
      var labelMat = new BABYLON.StandardMaterial('labelMat-' + row, scene);
      labelMat.diffuseTexture = labelTex;
      labelMat.emissiveColor = new BABYLON.Color3(0.3, 0.3, 0.3);
      labelMat.specularColor = new BABYLON.Color3(0, 0, 0);
      label.material = labelMat;
    });

    function paintToggle(row) {
      var toggle = toggleMeshes[row];
      var slot = EKO.matrix.rowSelect[row];
      toggle.rotation.x = slot === 'A' ? -0.35 : 0.35;
    }

    function applyKnobRotation(instId) {
      var k = knobMeshes[instId];
      k.mesh.rotation.y = (k.trim - 0.5) * Math.PI * 1.4;
    }

    function applyRowLevel(row) {
      var slot = EKO.matrix.rowSelect[row];
      var inst = EKO.instrumentForRowSlot(row, slot);
      var rowLevel = sliderMeshes[row].value;
      var trim = knobMeshes[inst.id].trim;
      EKO.audio.setLevel(inst.id, rowLevel * trim);
    }
    DISPLAY_ROWS.forEach(applyRowLevel);

    // ---------- general cancel + per-row cancel knobs ----------
    var cancelX = matrixOriginX + matrixW / 2 + 1.3;
    var generalCancel = BABYLON.MeshBuilder.CreateCylinder('generalCancel', { diameter: 0.6, height: 0.28, tessellation: 24 }, scene);
    generalCancel.position.set(cancelX, 0.42, matrixOriginZ - cellSize);
    generalCancel.material = matAccentRed;
    registerClickable(generalCancel, function () { EKO.transport.generalCancel(); });

    DISPLAY_ROWS.forEach(function (row, rIdx) {
      var knob = BABYLON.MeshBuilder.CreateCylinder('rowCancel-' + row, { diameter: 0.4, height: 0.24, tessellation: 20 }, scene);
      knob.position.set(cancelX, 0.4, matrixOriginZ + rIdx * cellSize);
      knob.material = matChromeKnob;
      registerClickable(knob, function () {
        for (var c = 0; c < COLS; c++) EKO.matrix.setCell(row, c, false);
      });
    });

    // ---------- transport strip (front edge) ----------
    var frontZ = PANEL_D / 2 - 1;
    function makeButton(name, x, w, matOff) {
      var b = BABYLON.MeshBuilder.CreateBox(name, { width: w, depth: 0.6, height: 0.22 }, scene);
      b.position.set(x, 0.31, frontZ);
      b.material = matOff;
      return b;
    }

    var powerSwitch = makeButton('power', -PANEL_W / 2 + 1.5, 0.5, matAccentRed);
    var powerOn = false;
    registerClickable(powerSwitch, function () {
      powerOn = !powerOn;
      powerSwitch.material = powerOn ? matAccentRedOn : matAccentRed;
      EKO.audio.resume();
    });

    var startStop = makeButton('startStop', -PANEL_W / 2 + 4.5, 1.6, matLampOff);
    registerClickable(startStop, function () {
      if (EKO.transport.isPlaying()) {
        EKO.transport.stop();
        startStop.material = matLampOff;
      } else {
        EKO.transport.start();
        startStop.material = matLampOn;
      }
    });

    var hold = makeButton('hold', -PANEL_W / 2 + 6.6, 1.1, matLampOff);
    registerClickable(hold, function () {
      var on = !EKO.transport.isHeld();
      EKO.transport.setHold(on);
      hold.material = on ? matLampOn : matLampOff;
    });

    var speedKnob = BABYLON.MeshBuilder.CreateCylinder('speedKnob', { diameter: 0.6, height: 0.32, tessellation: 24 }, scene);
    speedKnob.position.set(-PANEL_W / 2 + 8.6, 0.42, frontZ);
    speedKnob.material = matKnob;
    var speedPointer = BABYLON.MeshBuilder.CreateBox('speedPointer', { width: 0.05, depth: 0.24, height: 0.05 }, scene);
    speedPointer.parent = speedKnob;
    speedPointer.position.set(0, 0.17, 0.12);
    speedPointer.material = matChrome;
    var speedValue = 0.55; // 0..1, mapped to ms/step range
    function applySpeed() {
      var ms = 80 + speedValue * (600 - 80);
      EKO.transport.setStepInterval(ms / 1000);
      speedKnob.rotation.y = (speedValue - 0.5) * Math.PI * 1.4;
    }
    applySpeed();
    registerDraggable(speedKnob, {
      onDrag: function (dxPx, dyPx) {
        speedValue = Math.max(0, Math.min(1, speedValue - dyPx / 160));
        applySpeed();
      }
    });

    var lengths = EKO.transport.LENGTHS.slice().reverse(); // photo shows ascending x5..x16 left to right
    lengths.forEach(function (len, i) {
      var b = makeButton('len' + len, -PANEL_W / 2 + 11 + i * 0.85, 0.7, matLampOff);
      if (len === EKO.transport.getLength()) b.material = matLampOn;
      registerClickable(b, function () {
        EKO.transport.setLength(len);
        lengths.forEach(function (l, j) {
          scene.getMeshByName('len' + l).material = (l === len) ? matLampOn : matLampOff;
        });
      });
    });

    // ---------- card + slot ----------
    var card = EKO.createBlankCard();
    var reader = new EKO.CardReader();
    var swipe = EKO.createSwipe(card, reader);
    var geo = EKO.CardGeometry;
    var cardScale = 0.045; // world units per mm
    var cardW = geo.CARD_WIDTH_MM * cardScale;
    var cardH = geo.CARD_HEIGHT_MM * cardScale;

    var slotX = PANEL_W / 2 - 2.2;
    var slotZ = -PANEL_D / 2 + 1.7;
    var slot = BABYLON.MeshBuilder.CreateBox('slot', { width: cardH + 0.3, depth: 0.15, height: 0.06 }, scene);
    slot.position.set(slotX, 0.31, slotZ);
    slot.material = matKnob;

    var cardMesh = BABYLON.MeshBuilder.CreatePlane('card', { width: cardH, height: cardW }, scene);
    cardMesh.rotation.x = Math.PI / 2; // lay flat: local X -> world X (tracks), local Y -> world Z (length)
    var cardTex = new CardTexture(scene, card);
    var cardMat = new BABYLON.StandardMaterial('cardMat', scene);
    cardMat.diffuseTexture = cardTex.texture;
    cardMat.backFaceCulling = false;
    cardMesh.material = cardMat;

    var withdrawnMm = swipe.withdrawnPosition();
    var headMm = withdrawnMm;
    function cardWorldZFromHeadMm(mm) {
      // as headMm grows, more of the card has been fed in -> card moves further past the slot
      return slotZ - (mm * cardScale) + (geo.CARD_WIDTH_MM * cardScale) / 2;
    }
    function updateCardPosition() {
      cardMesh.position.set(slotX, 0.34, cardWorldZFromHeadMm(headMm));
    }
    updateCardPosition();

    function applyReaderEvents(events) {
      var changed = false;
      events.forEach(function (ev) {
        if (ev.type === 'start') { EKO.matrix.clearAll(); changed = true; }
        else if (ev.type === 'column') {
          EKO.matrix.ROWS.forEach(function (row, r) { EKO.matrix.setCell(row, ev.index, !!ev.data[r]); });
          changed = true;
        }
      });
      if (changed && ui && ui.onReaderChange) ui.onReaderChange(reader.state);
    }

    function moveHeadTo(mm) {
      headMm = mm;
      var result = swipe.moveTo(mm);
      updateCardPosition();
      applyReaderEvents(result.events);
      if (ui && ui.onReaderStatus) ui.onReaderStatus({ loading: reader.state.loading, column: reader.state.column });
    }

    registerDraggable(cardMesh, {
      // The card travels along the scene's depth (Z) axis, which at this
      // camera angle projects mostly onto vertical screen movement -- so
      // this reads dyPx, not dxPx. Dragging up (screen-up = further back
      // in the scene = -Z = higher headMm) feeds more of the card through.
      onDrag: function (dxPx, dyPx) {
        var minMm = withdrawnMm - 10, maxMm = geo.CARD_WIDTH_MM + 20;
        moveHeadTo(Math.max(minMm, Math.min(maxMm, headMm - dyPx / (cardScale * 90))));
      }
    });

    function toggleCardHoleFromPick(pickInfo) {
      if (!pickInfo.getTextureCoordinates) return;
      var uv = pickInfo.getTextureCoordinates();
      if (!uv) return;
      // plane width maps to card height (mm) and plane height maps to card width (mm) -- see rotation above
      var mmAlongLength = uv.y * geo.CARD_WIDTH_MM;
      var mmAcrossTracks = (1 - uv.x) * geo.CARD_HEIGHT_MM;

      var bestTrack = null, bestCol = null, bestDist = Infinity;
      geo.TRACKS.forEach(function (track, ti) {
        var y = geo.trackY(ti);
        if (track === 'start') {
          var d = Math.hypot(mmAlongLength - geo.START_X, mmAcrossTracks - y);
          if (d < bestDist) { bestDist = d; bestTrack = 'start'; bestCol = null; }
        } else if (track === 'stop') {
          var d2 = Math.hypot(mmAlongLength - geo.STOP_X, mmAcrossTracks - y);
          if (d2 < bestDist) { bestDist = d2; bestTrack = 'stop'; bestCol = null; }
        } else if (track === 'step') {
          for (var c = 0; c < geo.COLS; c++) {
            var d3 = Math.hypot(mmAlongLength - geo.stepX(c), mmAcrossTracks - y);
            if (d3 < bestDist) { bestDist = d3; bestTrack = 'step'; bestCol = c; }
          }
        } else {
          for (var c2 = 0; c2 < geo.COLS; c2++) {
            var d4 = Math.hypot(mmAlongLength - geo.dataX(c2), mmAcrossTracks - y);
            if (d4 < bestDist) { bestDist = d4; bestTrack = track; bestCol = c2; }
          }
        }
      });

      if (bestDist > geo.HOLE_RADIUS_MM * 1.6) return; // missed -- no hole there
      if (bestTrack === 'start') card.start = !card.start;
      else if (bestTrack === 'stop') card.stop = !card.stop;
      else if (bestTrack === 'step') card.step[bestCol] = !card.step[bestCol];
      else card.data[bestTrack][bestCol] = !card.data[bestTrack][bestCol];
      cardTex.redraw();
    }

    registerClickable(cardMesh, function (pickInfo) { toggleCardHoleFromPick(pickInfo); });

    // expose for the toolbar (index.html) and for tests
    EKO.scene3d = {
      scene: scene, engine: engine, camera: camera,
      getCard: function () { return card; },
      loadCard: function (newCard) {
        card = newCard;
        reader.reset();
        swipe = EKO.createSwipe(card, reader);
        withdrawnMm = swipe.withdrawnPosition();
        headMm = withdrawnMm;
        cardTex = new CardTexture(scene, card);
        cardMat.diffuseTexture = cardTex.texture;
        updateCardPosition();
        if (ui && ui.onReaderStatus) ui.onReaderStatus({ loading: reader.state.loading, column: reader.state.column });
      },
      newCard: function () { EKO.scene3d.loadCard(EKO.createBlankCard()); },
      getReaderState: function () { return reader.state; },
      moveHeadTo: moveHeadTo
    };

    // ---------- pointer interaction: click vs drag, camera vs control ----------
    var DRAG_THRESHOLD_PX = 4;
    var activeDrag = null; // { entry, startX, startY, lastX, lastY }
    var downInfo = null;

    scene.onPointerObservable.add(function (pointerInfo) {
      if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
        var pick = pointerInfo.pickInfo;
        if (!pick || !pick.hit) return;
        var dragEntry = draggable.filter(function (d) { return d.mesh === pick.pickedMesh; })[0];
        var clickEntry = clickable.filter(function (c) { return c.mesh === pick.pickedMesh; })[0];
        if (dragEntry || clickEntry) {
          downInfo = { x: pointerInfo.event.clientX, y: pointerInfo.event.clientY, dragEntry: dragEntry, clickEntry: clickEntry, pick: pick, moved: false };
          if (dragEntry) camera.detachControl();
        }
      } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
        if (!downInfo) return;
        var dx = pointerInfo.event.clientX - downInfo.x;
        var dy = pointerInfo.event.clientY - downInfo.y;
        if (!downInfo.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        downInfo.moved = true;
        if (downInfo.dragEntry) {
          downInfo.dragEntry.onDrag(dx, dy, pointerInfo.event);
          downInfo.x = pointerInfo.event.clientX;
          downInfo.y = pointerInfo.event.clientY;
        }
      } else if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERUP) {
        if (!downInfo) return;
        if (!downInfo.moved && downInfo.clickEntry) downInfo.clickEntry.onClick(downInfo.pick);
        if (downInfo.dragEntry) camera.attachControl(canvas, true);
        downInfo = null;
      }
    });

    paintMatrix();

    engine.runRenderLoop(function () { scene.render(); });
    window.addEventListener('resize', function () { engine.resize(); });

    return { scene: scene, engine: engine };
  }

  global.EKO = global.EKO || {};
  global.EKO.buildScene3D = buildScene;
})(window);
