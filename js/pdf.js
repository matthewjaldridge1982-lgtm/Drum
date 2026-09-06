/*
 * Minimal, dependency-free PDF writer for the 1:1 print-ready card.
 *
 * No external library (jsPDF etc.) -- this hand-emits a valid, plain-
 * ASCII PDF (uncompressed content stream, a standard Type1 Helvetica
 * reference, no embedded fonts) because that's all a punch template
 * needs, and it keeps the "no build step, no dependency" story intact
 * for this file too. The page is sized to the card's true physical
 * dimensions (from card.js's geometry) plus a small print-safe margin,
 * so printing at 100% / actual size reproduces the card at exact scale
 * for the physical reader build.
 */
(function (global) {
  'use strict';

  var PRINT_MARGIN_MM = 6; // invented -- keeps card outline off the paper's unprintable edge
  var MM_TO_PT = 72 / 25.4;

  function mm2pt(mm) { return mm * MM_TO_PT; }
  function fmt(n) { return (Math.round(n * 1000) / 1000).toString(); }
  function escapeText(s) { return String(s).replace(/([()\\])/g, '\\$1'); }

  function circlePath(cx, cy, r) {
    var k = 0.5522847498;
    return [
      fmt(cx + r) + ' ' + fmt(cy) + ' m',
      [fmt(cx + r), fmt(cy + k * r), fmt(cx + k * r), fmt(cy + r), fmt(cx), fmt(cy + r)].join(' ') + ' c',
      [fmt(cx - k * r), fmt(cy + r), fmt(cx - r), fmt(cy + k * r), fmt(cx - r), fmt(cy)].join(' ') + ' c',
      [fmt(cx - r), fmt(cy - k * r), fmt(cx - k * r), fmt(cy - r), fmt(cx), fmt(cy - r)].join(' ') + ' c',
      [fmt(cx + k * r), fmt(cy - r), fmt(cx + r), fmt(cy - k * r), fmt(cx + r), fmt(cy)].join(' ') + ' c',
      'h'
    ].join('\n');
  }

  function textOp(xPt, yPt, sizePt, str) {
    return 'BT /F1 ' + sizePt + ' Tf 1 0 0 1 ' + fmt(xPt) + ' ' + fmt(yPt) + ' Tm (' + escapeText(str) + ') Tj ET';
  }

  function buildContent(card, pageWpt, pageHpt) {
    var geo = global.EKO.CardGeometry;
    var ox = PRINT_MARGIN_MM, oy = PRINT_MARGIN_MM;
    var ops = [];

    function toPt(xMm, yMm) {
      return { x: mm2pt(xMm + ox), y: pageHpt - mm2pt(yMm + oy) };
    }

    // card outline
    ops.push('0.4 w 0 0 0 RG');
    var tl = toPt(0, 0), br = toPt(geo.CARD_WIDTH_MM, geo.CARD_HEIGHT_MM);
    ops.push([fmt(tl.x), fmt(br.y), fmt(br.x - tl.x), fmt(tl.y - br.y), 're', 'S'].join(' '));

    function hole(xMm, yMm, punched) {
      var p = toPt(xMm, yMm);
      var r = mm2pt(geo.HOLE_RADIUS_MM);
      ops.push('0.55 0.55 0.55 RG 0.3 w');
      ops.push(circlePath(p.x, p.y, r) + ' S');
      if (punched) {
        ops.push('0 0 0 rg');
        ops.push(circlePath(p.x, p.y, r) + ' f');
      }
    }

    geo.TRACKS.forEach(function (track, ti) {
      var yMm = geo.trackY(ti);
      var labelP = toPt(-9, yMm);
      ops.push(textOp(labelP.x, labelP.y - mm2pt(1.4), 6, track.toUpperCase().slice(0, 5)));

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

    // column numbers, above the START row
    for (var c3 = 0; c3 < geo.COLS; c3++) {
      var p = toPt(geo.dataX(c3), -3);
      ops.push(textOp(p.x - mm2pt(1.5), p.y, 6, String(c3 + 1)));
    }

    // title + print-scale warning
    var titleP = toPt(0, geo.CARD_HEIGHT_MM + 6);
    ops.push(textOp(titleP.x, titleP.y, 9, 'EKO ComputeRhythm -- punch card (1:1)'));
    ops.push(textOp(titleP.x, titleP.y - mm2pt(4.5), 6, 'Print at 100% / Actual Size -- do not "fit to page". Verify the 50mm bar below with a ruler before punching.'));

    // 50mm calibration bar
    var barY = geo.CARD_HEIGHT_MM + 12;
    var barStart = toPt(0, barY);
    var barEnd = toPt(50, barY);
    ops.push('0.6 w 0 0 0 RG');
    ops.push([fmt(barStart.x), fmt(barStart.y), 'm', fmt(barEnd.x), fmt(barEnd.y), 'l', 'S'].join(' '));
    [0, 10, 20, 30, 40, 50].forEach(function (mm) {
      var t = toPt(mm, barY);
      ops.push([fmt(t.x), fmt(t.y - mm2pt(1)), 'm', fmt(t.x), fmt(t.y + mm2pt(1)), 'l', 'S'].join(' '));
    });
    ops.push(textOp(barEnd.x + mm2pt(2), barEnd.y - mm2pt(1), 6, '50mm reference'));

    return ops.join('\n');
  }

  function buildPdfBytes(card) {
    var geo = global.EKO.CardGeometry;
    var pageW = mm2pt(geo.CARD_WIDTH_MM + 2 * PRINT_MARGIN_MM);
    var pageH = mm2pt(geo.CARD_HEIGHT_MM + 2 * PRINT_MARGIN_MM + 16); // extra headroom for title/bar

    var content = buildContent(card, pageW, pageH);

    var header = '%PDF-1.4\n';
    var body = '';
    var offsets = {};

    function addObject(num, str) {
      offsets[num] = header.length + body.length;
      body += num + ' 0 obj\n' + str + '\nendobj\n';
    }

    addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
    addObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    addObject(3, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + fmt(pageW) + ' ' + fmt(pageH) + '] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>');
    addObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    addObject(5, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');

    var xrefOffset = header.length + body.length;
    function pad10(n) { var s = String(n); while (s.length < 10) s = '0' + s; return s; }
    var xref = 'xref\n0 6\n0000000000 65535 f \n';
    for (var i = 1; i <= 5; i++) xref += pad10(offsets[i]) + ' 00000 n \n';
    var trailer = 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + xrefOffset + '\n%%EOF';

    var pdfString = header + body + xref + trailer;
    var bytes = new Uint8Array(pdfString.length);
    for (var j = 0; j < pdfString.length; j++) bytes[j] = pdfString.charCodeAt(j) & 0xff;
    return bytes;
  }

  function downloadCardPdf(card, filename) {
    var bytes = buildPdfBytes(card);
    var blob = new Blob([bytes], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || 'eko-card.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  global.EKO = global.EKO || {};
  global.EKO.buildCardPdfBytes = buildPdfBytes;
  global.EKO.downloadCardPdf = downloadCardPdf;
})(window);
