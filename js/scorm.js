/*
 * Minimal SCORM runtime wrapper -- dependency-free, and a deliberate
 * no-op when there's no LMS around it. This is what makes the SAME
 * index.html work both standalone (open the file directly, or the
 * existing dev workflow) and hosted inside an LMS's SCORM player frame.
 *
 * Supports both SCORM 1.2 (window.API) and SCORM 2004 (window.API_1484_11),
 * auto-detected by walking up the window.parent chain (the standard
 * "find the API" algorithm every SCORM course uses, since the LMS injects
 * the API object into some ancestor frame, not the SCO's own window).
 *
 * What this course reports: there's no quiz or score here -- it's a
 * hands-on simulator -- so "completion" is reported the first time the
 * learner does anything on the page (see app.js's existing first-
 * interaction hook), and session time is committed on unload. That's the
 * full extent of the tracking; nothing else about the app's behaviour
 * changes when it's running inside an LMS.
 */
(function (global) {
  'use strict';

  var MAX_FRAME_SEARCH_DEPTH = 500;
  var version = null; // '1.2' | '2004' | null
  var api = null;
  var initialized = false;
  var startTime = null;

  function findAPI(win) {
    var depth = 0;
    while (win && depth < MAX_FRAME_SEARCH_DEPTH) {
      if (win.API_1484_11) return { api: win.API_1484_11, version: '2004' };
      if (win.API) return { api: win.API, version: '1.2' };
      if (win.parent && win.parent !== win) {
        win = win.parent;
      } else {
        break;
      }
      depth++;
    }
    return null;
  }

  function locateAPI() {
    var found = findAPI(global);
    if (!found && global.opener) found = findAPI(global.opener);
    return found;
  }

  function call(fn) {
    // Swallow errors from a misbehaving/absent LMS API rather than ever
    // let SCORM plumbing break the actual application.
    try { return fn(); } catch (e) { return null; }
  }

  function formatSessionTimeSCORM12(ms) {
    var totalSeconds = Math.max(0, Math.round(ms / 1000));
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    function pad(n, len) { var s = String(n); while (s.length < len) s = '0' + s; return s; }
    // CMITimespan: HHHH:MM:SS(.SS) -- capped at 9999 hours per the spec's field width
    return pad(Math.min(hours, 9999), 4) + ':' + pad(minutes, 2) + ':' + pad(seconds, 2);
  }

  function formatSessionTimeISO8601(ms) {
    var totalSeconds = Math.max(0, Math.round(ms / 1000));
    var hours = Math.floor(totalSeconds / 3600);
    var minutes = Math.floor((totalSeconds % 3600) / 60);
    var seconds = totalSeconds % 60;
    return 'PT' + hours + 'H' + minutes + 'M' + seconds + 'S';
  }

  function init() {
    if (initialized) return;
    var found = locateAPI();
    if (!found) return; // standalone / no LMS -- everything below stays a no-op
    api = found.api;
    version = found.version;
    startTime = Date.now();

    var ok = version === '1.2'
      ? call(function () { return api.LMSInitialize(''); })
      : call(function () { return api.Initialize(''); });
    if (!ok) { api = null; return; }
    initialized = true;

    // Only seed an initial status if the LMS doesn't already have one for
    // this learner (a returning visit shouldn't be stomped back to incomplete).
    var statusKey = version === '1.2' ? 'cmi.core.lesson_status' : 'cmi.completion_status';
    var current = version === '1.2'
      ? call(function () { return api.LMSGetValue(statusKey); })
      : call(function () { return api.GetValue(statusKey); });
    if (!current) {
      setValue(statusKey, 'incomplete');
      commit();
    }
  }

  function setValue(key, value) {
    if (!initialized) return;
    if (version === '1.2') call(function () { return api.LMSSetValue(key, value); });
    else call(function () { return api.SetValue(key, value); });
  }

  function commit() {
    if (!initialized) return;
    if (version === '1.2') call(function () { return api.LMSCommit(''); });
    else call(function () { return api.Commit(''); });
  }

  var completed = false;
  function setComplete() {
    if (!initialized || completed) return;
    completed = true;
    if (version === '1.2') {
      setValue('cmi.core.lesson_status', 'completed');
    } else {
      setValue('cmi.completion_status', 'completed');
      setValue('cmi.success_status', 'unknown'); // no pass/fail criteria in this content
    }
    commit();
  }

  function terminate() {
    if (!initialized) return;
    var elapsed = Date.now() - startTime;
    if (version === '1.2') {
      setValue('cmi.core.session_time', formatSessionTimeSCORM12(elapsed));
    } else {
      setValue('cmi.session_time', formatSessionTimeISO8601(elapsed));
    }
    commit();
    if (version === '1.2') call(function () { return api.LMSFinish(''); });
    else call(function () { return api.Terminate(''); });
    initialized = false;
  }

  global.EKO = global.EKO || {};
  global.EKO.scorm = {
    init: init,
    setComplete: setComplete,
    terminate: terminate,
    isActive: function () { return initialized; },
    getVersion: function () { return version; }
  };
})(window);
