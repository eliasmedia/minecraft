/* ============================================================
   schilder.js  -  Schild, Bilderrahmen und Gemälde

   Was diese drei verbindet: ihr Holz steht im Chunkmesh wie jeder andere
   Block, ihr *Inhalt* aber nicht. Text und Karte entstehen erst im Spiel,
   also kommen sie aus dem Atlas in dyntex.js und werden als einzelne Vierecke
   davorgelegt — eine Ebene, die der Mesher gar nicht kennen muss.

   Der Inhalt selbst liegt in der Blockentität an der Stelle. Die wandert
   ohnehin schon in den Spielstand, es kommt also kein neues Speicherformat
   dazu.
   ============================================================ */
(function () {
  'use strict';

  var S = {};
  MC.Schilder = S;
  var B = MC.Blocks, D = MC.DynTex;

  S.ZEILEN = 4;
  S.MAXLAENGE = 15;

  // Ein Schild ohne Text und ein leerer Rahmen brauchen keine Blockentität —
  // erst der Inhalt legt eine an.
  S.daten = function (game, x, y, z, anlegen) {
    var art = S.artAn(game.world, x, y, z);
    if (!art) return null;
    return game.world.tileEntity(x, y, z, anlegen ? function () {
      return art === 'schild' ? { art: 'schild', text: ['', '', '', ''] }
                              : { art: 'rahmen', stack: null };
    } : null);
  };

  S.artAn = function (world, x, y, z) {
    var b = B.byId[world.getBlock(x, y, z)];
    if (!b) return null;
    if (b.shape === B.SHAPE_SIGN || b.shape === B.SHAPE_SIGN_WALL) return 'schild';
    if (b.shape === B.SHAPE_FRAME) return 'rahmen';
    return null;
  };

  // Der Schlüssel im Atlas hängt am *Inhalt*, nicht am Ort: hundert Schilder
  // mit demselben Text teilen sich eine Kachel.
  function schluessel(te) {
    if (te.art === 'schild') return 's|' + te.text.join('');
    if (!te.stack) return null;
    // Eine Karte ändert sich beim Erkunden, darum kommt ihr Stand mit hinein
    if (te.stack.karte) return 'k|' + te.stack.karte.x + ',' + te.stack.karte.z + '|' + (te.stack.karte.stand || 0);
    return 'i|' + te.stack.id;
  }
  S.schluessel = schluessel;

  // ============================================================
  //  Zeichnen in den Atlas
  // ============================================================
  var mapCanvas = null;

  function malen(te, game) {
    return function (ctx, size) {
      if (te.art === 'schild') {
        // Die Fläche eines Schilds ist breit und flach. Gezeichnet wird darum
        // nur das obere Band der Kachel — genau in dem Seitenverhältnis, in
        // dem es später an der Wand hängt, sonst zöge es den Text lang.
        var bandH = size * BAND;
        var zh = bandH / S.ZEILEN;
        D.schrift(ctx, Math.floor(zh * 0.82));
        // Kein Schlagschatten. Eine Zeile ist hier siebzehn Bildpunkte hoch,
        // ein Buchstabe also gut acht breit — ein Schatten von zwei Punkten ist
        // dann ein Viertel des Buchstabens, und der Text las sich doppelt.
        // Dunkle Schrift auf hellem Holz braucht ihn ohnehin nicht.
        ctx.fillStyle = '#2a1d10';
        for (var i = 0; i < S.ZEILEN; i++) {
          var t = te.text[i] || '';
          if (!t) continue;
          ctx.fillText(t, size / 2, zh * (i + 0.5));
        }
        return;
      }
      if (!te.stack) return;
      if (te.stack.karte) {
        if (!mapCanvas) mapCanvas = document.createElement('canvas');
        MC.Karte.zeichnen(game.world, te.stack.karte, mapCanvas);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(mapCanvas, 0, 0, size, size);
        return;
      }
      var ic = MC.Icons.canvas(te.stack.id);
      if (!ic) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(ic, size * 0.08, size * 0.08, size * 0.84, size * 0.84);
    };
  }

  // Anteil der Kachel, den ein Schildtext benutzt: dasselbe Seitenverhältnis
  // wie das Brett (0,86 breit zu 0,46 hoch).
  var BAND = 0.46 / 0.86;

  // ============================================================
  //  Zeichnen in der Welt
  // ============================================================
  // Ein Durchgang über die Blockentitäten in der Nähe. Sie stehen ohnehin in
  // einer flachen Tabelle; ein eigenes Verzeichnis müsste beim Laden und
  // Entladen gepflegt werden und wäre nur eine zweite Wahrheit.
  S.zeichnen = function (r, game) {
    var w = game.world, p = game.player, gl = r.gl, mp = r.progMain;
    var tes = w.tileEntities;
    var d, n = 0;
    var reichweite = 48 * 48;

    for (var k in tes) {
      var te = tes[k];
      if (!te || (te.art !== 'schild' && te.art !== 'rahmen')) continue;
      var dx = te.x + 0.5 - p.x, dz = te.z + 0.5 - p.z;
      if (dx * dx + dz * dz > reichweite) continue;
      var id = w.getBlock(te.x, te.y, te.z);
      var b = B.byId[id];
      if (!b) continue;
      if (b.shape !== B.SHAPE_SIGN && b.shape !== B.SHAPE_SIGN_WALL && b.shape !== B.SHAPE_FRAME) continue;
      var key = schluessel(te);
      if (!key) continue;

      var platz = D.platz(key, malen(te, game));
      var f = B.schildFlaeche(b.shape, w.getMeta(te.x, te.y, te.z));
      var uv = D.uv(platz);
      // Der Text sitzt im oberen Band der Kachel, das Bild im Rahmen füllt sie
      var v1 = te.art === 'schild' ? uv[1] + (uv[3] - uv[1]) * BAND : uv[3];

      var lr = w.getLightRaw(te.x, te.y, te.z);
      var bl = (lr & 15) / 15, sl = ((lr >> 4) & 15) / 15;

      r.ensureDyn(n + 4 * 9 + 64);
      d = r.dynData;
      var ox = te.x + f.o[0], oy = te.y + f.o[1], oz = te.z + f.o[2];
      // Reihenfolge wie MC.Mesher.UVS: unten links, unten rechts, oben rechts, oben links
      var ecken = [[0, 1], [1, 1], [1, 0], [0, 0]];
      for (var i = 0; i < 4; i++) {
        var cu = ecken[i][0], cv = ecken[i][1];
        d[n++] = ox + f.u[0] * cu + f.v[0] * cv;
        d[n++] = oy + f.u[1] * cu + f.v[1] * cv;
        d[n++] = oz + f.u[2] * cu + f.v[2] * cv;
        d[n++] = uv[0] + (uv[2] - uv[0]) * cu;
        d[n++] = uv[1] + (v1 - uv[1]) * cv;
        d[n++] = 0;
        d[n++] = bl; d[n++] = sl; d[n++] = 1;
      }
    }
    if (!n) return;
    gl.uniform1f(mp.u.uUseDyn, 1);
    gl.uniform1f(mp.u.uAlphaTest, 0.06);
    gl.disable(gl.CULL_FACE);
    r.drawDyn(n);
    gl.enable(gl.CULL_FACE);
    gl.uniform1f(mp.u.uUseDyn, 0);
    gl.uniform1f(mp.u.uAlphaTest, 0.5);
  };

  // ============================================================
  //  Das Fenster zum Beschriften
  // ============================================================
  S.oeffnen = function (game, x, y, z) {
    var te = S.daten(game, x, y, z, true);
    if (!te || te.art !== 'schild') return;
    var alt = document.getElementById('schildfenster');
    if (alt) alt.remove();

    var f = document.createElement('div');
    f.id = 'schildfenster';
    var zeilen = '';
    for (var i = 0; i < S.ZEILEN; i++) {
      zeilen += '<input class="schildzeile" data-i="' + i + '" autocomplete="off" spellcheck="false" ' +
                'maxlength="' + S.MAXLAENGE + '" value="' + escapeHtml(te.text[i] || '') + '">';
    }
    f.innerHTML =
      '<div class="schildkopf">Schild &nbsp;·&nbsp; ' + x + ' ' + y + ' ' + z + '</div>' +
      zeilen +
      '<div class="schildreihe"><button id="schildok">Fertig</button></div>' +
      '<div class="schildhilfe">Enter springt zur nächsten Zeile · Esc schließt</div>';
    (document.getElementById('ui') || document.body).appendChild(f);

    var felder = f.querySelectorAll('.schildzeile');
    function uebernehmen() {
      var vorher = te.text.join('');
      for (var i = 0; i < felder.length; i++) te.text[i] = felder[i].value;
      // Der alte Atlasplatz gehört zum alten Text und muss weg, sonst bliebe
      // die alte Beschriftung stehen.
      if (te.text.join('') !== vorher) D.vergiss('s|' + vorher);
    }
    function schliessen() {
      uebernehmen();
      f.remove();
      game.schildOffen = false;
      game.suppressPauseUntil = performance.now() + 400;
      game.requestPointerLock();
    }
    for (var j = 0; j < felder.length; j++) {
      (function (feld, idx) {
        feld.addEventListener('keydown', function (ev) {
          ev.stopPropagation();
          if (ev.key === 'Escape') { schliessen(); ev.preventDefault(); }
          else if (ev.key === 'Enter') {
            uebernehmen();
            if (idx + 1 < felder.length) felder[idx + 1].focus();
            else schliessen();
            ev.preventDefault();
          }
        });
        feld.addEventListener('keyup', function (ev) { ev.stopPropagation(); uebernehmen(); });
        feld.addEventListener('input', function (ev) { ev.stopPropagation(); uebernehmen(); });
      })(felder[j], j);
    }
    f.querySelector('#schildok').addEventListener('click', schliessen);

    game.schildOffen = true;
    if (document.exitPointerLock) document.exitPointerLock();
    felder[0].focus();
  };

  function escapeHtml(t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ============================================================
  //  Rahmen benutzen
  // ============================================================
  // Rechtsklick mit etwas in der Hand hängt es hinein, mit leerer Hand nimmt
  // es wieder heraus. Ein Gemälde wechselt beim Rechtsklick sein Motiv.
  S.benutzen = function (game, x, y, z) {
    var w = game.world, p = game.player;
    var b = B.byId[w.getBlock(x, y, z)];
    if (!b) return false;

    if (b.shape === B.SHAPE_PAINTING) {
      var m = w.getMeta(x, y, z);
      var motiv = ((m >> 2) + 1) % MC.Textures.GEMAELDE.length;
      w.setBlock(x, y, z, b.id, (m & 3) | (motiv << 2));
      game.ui.toast(MC.Textures.GEMAELDE[motiv].name);
      game.audio.play('click');
      return true;
    }
    if (b.shape === B.SHAPE_SIGN || b.shape === B.SHAPE_SIGN_WALL) {
      S.oeffnen(game, x, y, z);
      return true;
    }
    if (b.shape !== B.SHAPE_FRAME) return false;

    var te = S.daten(game, x, y, z, true);
    var hand = p.inventory.selectedStack();
    if (te.stack) {
      // Heraus damit — und der Atlasplatz gehört jetzt niemandem mehr
      var alt = schluessel(te);
      if (alt) D.vergiss(alt);
      if (game.mode !== 'creative') game.spawnItem(x + 0.5, y + 0.5, z + 0.5, te.stack);
      te.stack = null;
      game.audio.play('pop');
      return true;
    }
    if (!hand) return false;
    te.stack = MC.Items.copyStack(hand);
    te.stack.count = 1;
    if (game.mode !== 'creative') p.inventory.consumeSelected(1);
    game.audio.play('pop');
    return true;
  };

  // Beim Abbauen fällt heraus, was drin hing.
  S.abgebaut = function (game, x, y, z) {
    var te = game.world.tileEntities[x + ',' + y + ',' + z];
    if (!te) return;
    if (te.art === 'rahmen' && te.stack && game.mode !== 'creative') {
      game.spawnItem(x + 0.5, y + 0.5, z + 0.5, te.stack);
    }
    var k = schluessel(te);
    if (k) D.vergiss(k);
  };

})();
