/* ============================================================
   dyntex.js  -  Texturen, die sich zur Laufzeit ändern

   Alle 365 Blocktexturen liegen in einem Texturarray aus 16x16-Kacheln.
   Das ist genau richtig für einen Block, der sich nie ändert, und genau
   falsch für alles, was zur Laufzeit entsteht: eine Karte hat 128x128
   Bildpunkte, und ein Schild trägt Text, den es beim Erzeugen der Texturen
   noch gar nicht gab.

   Darum hier ein zweiter Weg: ein Atlas von 8x8 Kacheln zu je 128x128
   Bildpunkten, der als eigene 2D-Textur neben dem Array liegt. Gezeichnet
   wird mit dem gewöhnlichen Canvas-Werkzeugkasten, hochgeladen wird immer
   nur die eine geänderte Kachel.

   Vergeben werden die 64 Plätze über einen Schlüssel und nach dem Prinzip
   "am längsten nicht gebraucht". Das ist der Grund, warum die Zahl reicht:
   ein Platz gehört keinem Schild, sondern einem *Inhalt*. Hundert Schilder
   mit demselben Text teilen sich eine Kachel, und ein Schild am anderen Ende
   der Welt hält keine besetzt.
   ============================================================ */
(function () {
  'use strict';

  var D = {};
  MC.DynTex = D;

  D.SIZE = 1024;
  D.TILE = 128;
  var COLS = D.SIZE / D.TILE;      // 8
  D.COLS = COLS;
  D.SLOTS = COLS * COLS;           // 64

  var scratch = null, sctx = null;
  var belegung = [];               // Platz -> { key, zeit }
  var platzVon = {};               // Schlüssel -> Platz
  var uhr = 0;

  // Der Renderer hängt sich hier ein: hoch(platz, canvas) lädt die Kachel.
  D.hoch = null;

  function scratchHolen() {
    if (scratch) return scratch;
    scratch = document.createElement('canvas');
    scratch.width = D.TILE; scratch.height = D.TILE;
    sctx = scratch.getContext('2d', { willReadFrequently: false });
    sctx.imageSmoothingEnabled = false;
    return scratch;
  }

  // Einen Platz für diesen Inhalt besorgen. Gibt es ihn schon, wird nur die
  // Uhr aufgefrischt; sonst verdrängt er den am längsten unbenutzten.
  D.platz = function (key, zeichner) {
    uhr++;
    var s = platzVon[key];
    if (s !== undefined) { belegung[s].zeit = uhr; return s; }

    var best = -1, bestZeit = Infinity;
    for (var i = 0; i < D.SLOTS; i++) {
      if (!belegung[i]) { best = i; break; }
      if (belegung[i].zeit < bestZeit) { bestZeit = belegung[i].zeit; best = i; }
    }
    if (belegung[best]) delete platzVon[belegung[best].key];
    belegung[best] = { key: key, zeit: uhr };
    platzVon[key] = best;
    D.zeichne(best, zeichner);
    return best;
  };

  // Inhalt hat sich geändert (neuer Schildtext, neue Karte): Platz freigeben,
  // damit er beim nächsten Mal neu gezeichnet wird.
  D.vergiss = function (key) {
    var s = platzVon[key];
    if (s === undefined) return;
    delete platzVon[key];
    belegung[s] = null;
  };

  D.zeichne = function (platz, zeichner) {
    scratchHolen();
    sctx.clearRect(0, 0, D.TILE, D.TILE);
    sctx.save();
    zeichner(sctx, D.TILE);
    sctx.restore();
    if (D.hoch) D.hoch(platz, scratch);
  };

  // Texturkoordinaten der Kachel. v läuft von oben nach unten, genau wie das
  // Canvas darunter — dann steht der Text auch im Spiel richtig herum.
  D.uv = function (platz) {
    var c = platz % COLS, r = (platz / COLS) | 0, t = 1 / COLS;
    return [c * t, r * t, c * t + t, r * t + t];
  };

  D.pos = function (platz) {
    return [(platz % COLS) * D.TILE, ((platz / COLS) | 0) * D.TILE];
  };

  // Beim Weltwechsel: alles vergessen, sonst zeigt ein Rahmen die Karte der
  // alten Welt.
  D.leeren = function () {
    belegung = []; platzVon = {}; uhr = 0;
  };

  // ============================================================
  //  Schrift
  // ============================================================
  // Die Schrift des Spiels ist eine Pixelschrift ohne Datei — im Browser gibt
  // es sie nur als monospace. Für ein Schild reicht das: entscheidend ist,
  // dass die Kantenglättung aus bleibt, sonst franst der Text im Pixelbild aus.
  D.schrift = function (ctx, groesse) {
    ctx.font = 'bold ' + groesse + 'px "DejaVu Sans Mono", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
  };

  // Text mit dunklem Schlagschatten, wie im Original.
  D.textMitSchatten = function (ctx, text, x, y, farbe) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(text, x + 2, y + 2);
    ctx.fillStyle = farbe || '#f2f2f2';
    ctx.fillText(text, x, y);
  };

})();
