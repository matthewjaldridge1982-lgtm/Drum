/*
 * Web Audio engine — Phase 1 placeholder synthesis.
 *
 * Structural note: this is intentionally simple for Phase 1 (just enough
 * that the transport is audible and testable). Phase 3 replaces the voice
 * bodies with the bridged-T-informed models; the per-instrument routing,
 * level and solo/mute infrastructure built here stays as-is.
 *
 * Each instrument gets its own GainNode (its "individual out") which
 * feeds the master bus. Those per-instrument nodes are also reachable at
 * EKO.audio.outputNode(id) for anyone who wants to patch them elsewhere
 * (e.g. into a ChannelSplitter for a multi-output audio interface) --
 * that's as far as "separately routable" can go for a page that only has
 * one <audio> sink to work with in a plain browser tab.
 */
(function (global) {
  'use strict';

  var ctx = null;
  var masterGain = null;
  var channels = {}; // id -> { gain, muted, soloed, baseLevel }
  var soloActive = false;

  function ensureContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.9;
      masterGain.connect(ctx.destination);

      global.EKO.INSTRUMENTS.forEach(function (inst) {
        var gain = ctx.createGain();
        gain.gain.value = inst.level != null ? inst.level : 0.8;
        gain.connect(masterGain);
        channels[inst.id] = { gain: gain, muted: false, soloed: false, baseLevel: gain.gain.value };
      });
    }
    return ctx;
  }

  function applyMuteState() {
    soloActive = Object.keys(channels).some(function (id) { return channels[id].soloed; });
    Object.keys(channels).forEach(function (id) {
      var ch = channels[id];
      var audible = soloActive ? ch.soloed : !ch.muted;
      ch.gain.gain.setTargetAtTime(audible ? ch.baseLevel : 0, ctx.currentTime, 0.005);
    });
  }

  function noiseBuffer(duration) {
    var c = ensureContext();
    var length = Math.max(1, Math.round(c.sampleRate * duration));
    var buf = c.createBuffer(1, length, c.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function env(gainNode, t0, peak, attack, decay) {
    var g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(peak, t0 + attack);
    g.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  function tone(dest, t0, freq, peak, attack, decay, type) {
    var c = ensureContext();
    var osc = c.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    var g = c.createGain();
    env(g, t0, peak, attack, decay);
    osc.connect(g).connect(dest);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.05);
  }

  function noiseHit(dest, t0, peak, attack, decay, filterType, filterFreq, q) {
    var c = ensureContext();
    var src = c.createBufferSource();
    src.buffer = noiseBuffer(attack + decay + 0.05);
    var filt = c.createBiquadFilter();
    filt.type = filterType || 'bandpass';
    filt.frequency.value = filterFreq || 4000;
    if (q) filt.Q.value = q;
    var g = c.createGain();
    env(g, t0, peak, attack, decay);
    src.connect(filt).connect(g).connect(dest);
    src.start(t0);
    src.stop(t0 + attack + decay + 0.05);
  }

  var VOICES = {
    kick: function (dest, t0, inst, vel) {
      var c = ensureContext();
      var osc = c.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150, t0);
      osc.frequency.exponentialRampToValueAtTime(45, t0 + 0.18);
      var g = c.createGain();
      env(g, t0, vel, 0.002, 0.22);
      osc.connect(g).connect(dest);
      osc.start(t0);
      osc.stop(t0 + 0.3);
    },
    tom: function (dest, t0, inst, vel) {
      var c = ensureContext();
      var osc = c.createOscillator();
      osc.type = 'sine';
      var f = inst.freq || 200;
      osc.frequency.setValueAtTime(f * 1.6, t0);
      osc.frequency.exponentialRampToValueAtTime(f, t0 + 0.12);
      var g = c.createGain();
      env(g, t0, vel, 0.002, 0.18);
      osc.connect(g).connect(dest);
      osc.start(t0);
      osc.stop(t0 + 0.25);
    },
    click: function (dest, t0, inst, vel) {
      tone(dest, t0, inst.freq || 2000, vel, 0.001, 0.03, 'square');
    },
    block: function (dest, t0, inst, vel) {
      tone(dest, t0, inst.freq || 900, vel, 0.001, 0.06, 'triangle');
    },
    ring: function (dest, t0, inst, vel) {
      tone(dest, t0, inst.freq || 3000, vel, 0.001, 0.9, 'sine');
    },
    hat: function (dest, t0, inst, vel) {
      noiseHit(dest, t0, vel * 0.8, 0.001, 0.06, 'highpass', inst.freq || 8000, 0.7);
    },
    snare: function (dest, t0, inst, vel) {
      noiseHit(dest, t0, vel, 0.001, 0.14, 'bandpass', inst.freq || 3000, 1.2);
      tone(dest, t0, 180, vel * 0.5, 0.001, 0.08, 'triangle');
    },
    cymbal: function (dest, t0, inst, vel) {
      noiseHit(dest, t0, vel * 0.7, 0.002, 0.6, 'highpass', inst.freq || 6000, 0.5);
    },
    roll: function (dest, t0, inst, vel) {
      // Placeholder for Phase 3's retriggering-roll circuit: a fast burst
      // of decaying tom hits standing in for the real auto-retrigger osc.
      var c = ensureContext();
      var hits = 4;
      for (var i = 0; i < hits; i++) {
        (function (i) {
          var ht = t0 + i * 0.045;
          var osc = c.createOscillator();
          osc.type = 'sine';
          var f = inst.freq || 150;
          osc.frequency.setValueAtTime(f * 1.4, ht);
          osc.frequency.exponentialRampToValueAtTime(f, ht + 0.05);
          var g = c.createGain();
          env(g, ht, vel * (1 - i * 0.15), 0.001, 0.06);
          osc.connect(g).connect(dest);
          osc.start(ht);
          osc.stop(ht + 0.1);
        })(i);
      }
    }
  };

  var EKO_audio = {
    ensureContext: ensureContext,
    resume: function () {
      var c = ensureContext();
      if (c.state === 'suspended') c.resume();
    },
    trigger: function (instId, velocity) {
      var inst = global.EKO.instrumentById(instId);
      if (!inst) return;
      var c = ensureContext();
      var ch = channels[instId];
      var voice = VOICES[inst.synth] || VOICES.click;
      voice(ch.gain, c.currentTime, inst, velocity == null ? 1 : velocity);
    },
    setLevel: function (instId, value) {
      var ch = channels[instId];
      if (!ch) return;
      ch.baseLevel = value;
      if (!ch.muted && (!soloActive || ch.soloed)) {
        ch.gain.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
      }
    },
    setSolo: function (instId, on) {
      var ch = channels[instId];
      if (!ch) return;
      ch.soloed = on;
      applyMuteState();
    },
    setMute: function (instId, on) {
      var ch = channels[instId];
      if (!ch) return;
      ch.muted = on;
      applyMuteState();
    },
    setMasterLevel: function (value) {
      ensureContext();
      masterGain.gain.setTargetAtTime(value, ctx.currentTime, 0.01);
    },
    outputNode: function (instId) {
      ensureContext();
      return channels[instId] && channels[instId].gain;
    },
    now: function () { return ensureContext().currentTime; }
  };

  global.EKO = global.EKO || {};
  global.EKO.audio = EKO_audio;
})(window);
