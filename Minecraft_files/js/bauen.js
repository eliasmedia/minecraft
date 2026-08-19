/* ============================================================
   bauen.js  -  Bauwerkzeuge für den Kreativmodus

   `fill` und `clone` gibt es längst, samt Deckel bei 32768 Blöcken. Was
   fehlte, war die Bedienung: zwei Ecken mit der Hand setzen, statt sechs
   Koordinaten abzutippen.

   Der Auswahlstab macht genau das. Alles Weitere sind Befehle, die auf
   derselben Auswahl arbeiten — und jeder von ihnen legt vorher den alten
   Zustand ab, damit `/rueckgaengig` ihn zurückholen kann.
   ============================================================ */
(function () {
  'use strict';

  var A = {};
  MC.Bauen = A;
  var B = MC.Blocks;

  A.DECKEL = 32768;        // wie bei /fill
  A.VERLAUF_MAX = 8;

  A.ecke1 = null;
  A.ecke2 = null;
  A.ablage = null;         // { w, h, d, blocks: [], metas: [] }
  A.verlauf = [];

  A.hatAuswahl = function () { return !!(A.ecke1 && A.ecke2); };

  A.kasten = function () {
    if (!A.hatAuswahl()) return null;
    return {
      x0: Math.min(A.ecke1.x, A.ecke2.x), x1: Math.max(A.ecke1.x, A.ecke2.x),
      y0: Math.min(A.ecke1.y, A.ecke2.y), y1: Math.max(A.ecke1.y, A.ecke2.y),
      z0: Math.min(A.ecke1.z, A.ecke2.z), z1: Math.max(A.ecke1.z, A.ecke2.z)
    };
  };

  A.anzahl = function () {
    var k = A.kasten();
    if (!k) return 0;
    return (k.x1 - k.x0 + 1) * (k.y1 - k.y0 + 1) * (k.z1 - k.z0 + 1);
  };

  A.setzeEcke = function (game, welche, x, y, z) {
    var e = { x: x, y: y, z: z };
    if (welche === 1) A.ecke1 = e; else A.ecke2 = e;
    var n = A.anzahl();
    game.ui.toast('Ecke ' + welche + ': ' + x + ' ' + y + ' ' + z +
                  (n ? ' · ' + n + ' Blöcke' : ''));
    game.audio.play('click');
  };

  // ============================================================
  //  Rückgängig
  // ============================================================
  // Abgelegt wird der Zustand VOR der Änderung, und zwar nur die Blöcke im
  // betroffenen Kasten. Acht Schritte reichen; mehr wäre Speicher für einen
  // Fall, den es selten gibt.
  function merken(world, k) {
    var n = (k.x1 - k.x0 + 1) * (k.y1 - k.y0 + 1) * (k.z1 - k.z0 + 1);
    if (n > A.DECKEL) return null;
    var eintrag = { k: k, blocks: new Uint16Array(n), metas: new Uint8Array(n) };
    var i = 0;
    for (var y = k.y0; y <= k.y1; y++)
      for (var z = k.z0; z <= k.z1; z++)
        for (var x = k.x0; x <= k.x1; x++) {
          eintrag.blocks[i] = world.getBlock(x, y, z);
          eintrag.metas[i] = world.getMeta(x, y, z);
          i++;
        }
    A.verlauf.push(eintrag);
    if (A.verlauf.length > A.VERLAUF_MAX) A.verlauf.shift();
    return eintrag;
  }

  A.rueckgaengig = function (game) {
    var e = A.verlauf.pop();
    if (!e) return 'Nichts zum Zurücknehmen';
    var w = game.world, k = e.k, i = 0;
    for (var y = k.y0; y <= k.y1; y++)
      for (var z = k.z0; z <= k.z1; z++)
        for (var x = k.x0; x <= k.x1; x++) {
          w.setBlock(x, y, z, e.blocks[i], e.metas[i]);
          i++;
        }
    return 'Zurückgenommen: ' + i + ' Blöcke';
  };

  // ============================================================
  //  Die Werkzeuge
  // ============================================================
  A.fuellen = function (game, blockName, nurLuft) {
    var k = A.kasten();
    if (!k) return 'Erst zwei Ecken setzen';
    var b = B.byName[blockName];
    if (!b) return '"' + blockName + '" ist kein Block';
    var n = A.anzahl();
    if (n > A.DECKEL) return 'Zu groß: ' + n + ' Blöcke (Deckel ' + A.DECKEL + ')';
    merken(game.world, k);
    var w = game.world, gesetzt = 0;
    for (var y = k.y0; y <= k.y1; y++)
      for (var z = k.z0; z <= k.z1; z++)
        for (var x = k.x0; x <= k.x1; x++) {
          if (nurLuft && w.getBlock(x, y, z) !== 0) continue;
          w.setBlock(x, y, z, b.id, 0);
          gesetzt++;
        }
    return gesetzt + ' Blöcke gesetzt';
  };

  // Nur die Außenhaut: für Räume und Kästen der häufigste Wunsch
  A.huelle = function (game, blockName) {
    var k = A.kasten();
    if (!k) return 'Erst zwei Ecken setzen';
    var b = B.byName[blockName];
    if (!b) return '"' + blockName + '" ist kein Block';
    if (A.anzahl() > A.DECKEL) return 'Zu groß';
    merken(game.world, k);
    var w = game.world, gesetzt = 0;
    for (var y = k.y0; y <= k.y1; y++)
      for (var z = k.z0; z <= k.z1; z++)
        for (var x = k.x0; x <= k.x1; x++) {
          var rand = (x === k.x0 || x === k.x1 || y === k.y0 || y === k.y1 || z === k.z0 || z === k.z1);
          if (!rand) continue;
          w.setBlock(x, y, z, b.id, 0);
          gesetzt++;
        }
    return gesetzt + ' Blöcke gesetzt';
  };

  A.kopieren = function (game) {
    var k = A.kasten();
    if (!k) return 'Erst zwei Ecken setzen';
    var n = A.anzahl();
    if (n > A.DECKEL) return 'Zu groß: ' + n + ' Blöcke';
    var w = game.world;
    var breite = k.x1 - k.x0 + 1, hoch = k.y1 - k.y0 + 1, tiefe = k.z1 - k.z0 + 1;
    var ab = { w: breite, h: hoch, d: tiefe, blocks: new Uint16Array(n), metas: new Uint8Array(n) };
    var i = 0;
    for (var y = 0; y < hoch; y++)
      for (var z = 0; z < tiefe; z++)
        for (var x = 0; x < breite; x++) {
          ab.blocks[i] = w.getBlock(k.x0 + x, k.y0 + y, k.z0 + z);
          ab.metas[i] = w.getMeta(k.x0 + x, k.y0 + y, k.z0 + z);
          i++;
        }
    A.ablage = ab;
    return 'Kopiert: ' + breite + '×' + hoch + '×' + tiefe;
  };

  // Eingefügt wird an der Stelle, an der man steht — die untere Ecke landet
  // dort, sonst müsste man rechnen, wo etwas hinkommt.
  A.einfuegen = function (game) {
    var ab = A.ablage;
    if (!ab) return 'Nichts in der Ablage';
    var w = game.world, p = game.player;
    var ox = Math.floor(p.x), oy = Math.floor(p.y), oz = Math.floor(p.z);
    merken(w, { x0: ox, y0: oy, z0: oz, x1: ox + ab.w - 1, y1: oy + ab.h - 1, z1: oz + ab.d - 1 });
    var i = 0, gesetzt = 0;
    for (var y = 0; y < ab.h; y++)
      for (var z = 0; z < ab.d; z++)
        for (var x = 0; x < ab.w; x++) {
          w.setBlock(ox + x, oy + y, oz + z, ab.blocks[i], ab.metas[i]);
          i++; gesetzt++;
        }
    return gesetzt + ' Blöcke eingefügt';
  };

  // Spiegeln und Drehen arbeiten auf der Ablage, nicht in der Welt: so sieht
  // man das Ergebnis erst beim Einfügen und kann es vorher noch zweimal drehen.
  A.spiegeln = function (game, achse) {
    var ab = A.ablage;
    if (!ab) return 'Nichts in der Ablage';
    var neu = { w: ab.w, h: ab.h, d: ab.d, blocks: new Uint16Array(ab.blocks.length), metas: new Uint8Array(ab.metas.length) };
    for (var y = 0; y < ab.h; y++)
      for (var z = 0; z < ab.d; z++)
        for (var x = 0; x < ab.w; x++) {
          var sx = achse === 'x' ? ab.w - 1 - x : x;
          var sz = achse === 'z' ? ab.d - 1 - z : z;
          var von = (y * ab.d + z) * ab.w + x;
          var nach = (y * ab.d + sz) * ab.w + sx;
          neu.blocks[nach] = ab.blocks[von];
          neu.metas[nach] = ab.metas[von];
        }
    A.ablage = neu;
    return 'Gespiegelt an ' + achse;
  };

  A.drehen = function (game) {
    var ab = A.ablage;
    if (!ab) return 'Nichts in der Ablage';
    // Vierteldrehung um die senkrechte Achse: aus Breite wird Tiefe
    var neu = { w: ab.d, h: ab.h, d: ab.w, blocks: new Uint16Array(ab.blocks.length), metas: new Uint8Array(ab.metas.length) };
    for (var y = 0; y < ab.h; y++)
      for (var z = 0; z < ab.d; z++)
        for (var x = 0; x < ab.w; x++) {
          var nx = ab.d - 1 - z, nz = x;
          var von = (y * ab.d + z) * ab.w + x;
          var nach = (y * neu.d + nz) * neu.w + nx;
          neu.blocks[nach] = ab.blocks[von];
          neu.metas[nach] = ab.metas[von];
        }
    A.ablage = neu;
    return 'Gedreht — jetzt ' + neu.w + '×' + neu.h + '×' + neu.d;
  };

  A.leeren = function () { A.ecke1 = null; A.ecke2 = null; };

})();
