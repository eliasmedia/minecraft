/* ============================================================
   lod.js  -  Fernsicht: das Gelände jenseits der geladenen Chunks

   Die Berge gehen bis y 110, und man sah sie nie: hinter der Sichtweite hört
   die Welt in einer Nebelwand auf. Sichtweite hochdrehen hilft, kostet aber
   das volle Programm — jeder Chunk will erzeugt, belichtet und mit rund 1500
   Vierecken vermascht werden.

   Hier steht das Gegenteil: ein grobes Höhengitter, das gar keine Blöcke
   braucht. Es kommt direkt aus dem Generator (`columnInfo` liefert Höhe und
   Biom zu einer Spalte), besteht aus 16 Vierecken je Chunk statt 1500 und
   kennt weder Licht noch Höhlen noch Bäume. Für etwas, das dreihundert Blöcke
   entfernt ist, ist genau das die richtige Menge Information.

   Abschaltbar im Pausenmenü — wer eine schwache Maschine hat, dreht es aus und
   hat exakt das Spiel von vorher.
   ============================================================ */
(function () {
  'use strict';

  var L = {};
  MC.LOD = L;
  var B = MC.Blocks, U = MC.U;
  var CS = MC.CHUNK_SIZE;

  L.aktiv = true;
  L.FAKTOR = 2.4;        // so viel weiter als die gemeshte Sichtweite
  L.STEP = 4;            // Kantenlänge einer LOD-Zelle in Blöcken
  L.PRO_BILD = 3;        // wie viele Chunks je Bild gebaut werden

  L.meshes = {};         // "cx,cz" -> Float32Array
  L.warteschlange = [];

  // Welche Textur bekommt eine Spalte? Nur die Deckfläche zählt — aus der
  // Ferne ist ein Hang eine Farbe, kein Material.
  function deckTextur(gen, info) {
    var BIOME = MC.WorldGen.BIOME;
    if (info.h < gen.sea) return 'water';
    switch (info.biome) {
      case BIOME.DESERT: case BIOME.BEACH: return 'sand';
      case BIOME.SNOW: return 'snow_block';
      case BIOME.MOUNTAINS: return info.h > 96 ? 'snow_block' : 'stone';
      case BIOME.TAIGA: case BIOME.FOREST: return 'grass_top';
      case BIOME.SWAMP: return 'grass_top';
      default: return 'grass_top';
    }
  }

  // Ein Chunk als Höhengitter. Die vier Ecken einer Zelle bekommen ihre echte
  // Höhe — dadurch ist ein Hang wirklich schräg und nicht getreppt.
  L.baue = function (world, cx, cz) {
    var gen = world.gen;
    var T = MC.Textures;
    var schritt = L.STEP, zellen = CS / schritt;
    var out = new Float32Array(zellen * zellen * 4 * 9);
    var n = 0;
    var x0 = cx * CS, z0 = cz * CS;

    for (var cz2 = 0; cz2 < zellen; cz2++) {
      for (var cx2 = 0; cx2 < zellen; cx2++) {
        var ax = x0 + cx2 * schritt, az = z0 + cz2 * schritt;
        var i00 = gen.columnInfo(ax, az);
        var i10 = gen.columnInfo(ax + schritt, az);
        var i11 = gen.columnInfo(ax + schritt, az + schritt);
        var i01 = gen.columnInfo(ax, az + schritt);
        var lay = T.layer(deckTextur(gen, i00));
        // Wasser wird auf Meereshöhe gelegt, sonst sackt der Ozean ins Becken
        function hoehe(inf) { return inf.h < gen.sea ? gen.sea : inf.h + 1; }
        var ecken = [
          [ax, hoehe(i01), az + schritt, 0, 1],
          [ax + schritt, hoehe(i11), az + schritt, 1, 1],
          [ax + schritt, hoehe(i10), az, 1, 0],
          [ax, hoehe(i00), az, 0, 0]
        ];
        for (var k = 0; k < 4; k++) {
          var e = ecken[k];
          out[n++] = e[0]; out[n++] = e[1]; out[n++] = e[2];
          out[n++] = e[3]; out[n++] = e[4]; out[n++] = lay;
          // Volles Himmelslicht, kein Blocklicht: das Gitter kennt keine Höhlen
          out[n++] = 0; out[n++] = 1; out[n++] = 1;
        }
      }
    }
    return out;
  };

  // Welche Chunks brauchen ein Gitter? Alles im Fernkreis, was NICHT ohnehin
  // als echter Chunk gezeichnet wird — sonst läge das grobe Gitter über dem
  // feinen und würde mit ihm um dieselben Bildpunkte streiten.
  L.tick = function (game) {
    if (!L.aktiv || game.world.dim !== 'overworld') return;
    var w = game.world, p = game.player;
    var nah = game.renderer.renderDistance;
    var fern = Math.round(nah * L.FAKTOR);
    var pcx = Math.floor(p.x / CS), pcz = Math.floor(p.z / CS);

    // Zu weit Entferntes vergessen
    for (var k in L.meshes) {
      var t = k.split(',');
      if (Math.abs(+t[0] - pcx) > fern + 2 || Math.abs(+t[1] - pcz) > fern + 2) {
        game.renderer.dropLOD(k);
        delete L.meshes[k];
      }
    }

    var gebaut = 0;
    for (var r = nah; r <= fern && gebaut < L.PRO_BILD; r++) {
      for (var dz = -r; dz <= r && gebaut < L.PRO_BILD; dz++) {
        for (var dx = -r; dx <= r && gebaut < L.PRO_BILD; dx++) {
          // Nur der Rand des Quadrats — das Innere kam in kleineren Ringen dran
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          var cx = pcx + dx, cz = pcz + dz;
          var key = cx + ',' + cz;
          if (L.meshes[key]) continue;
          // Ein geladener Chunk zeichnet sich selbst
          if (w.getChunk(cx, cz)) continue;
          L.meshes[key] = L.baue(w, cx, cz);
          game.renderer.uploadLOD(key, L.meshes[key]);
          gebaut++;
        }
      }
    }
  };

  // Beim Weltwechsel und beim Abschalten: alles weg
  L.leeren = function (game) {
    for (var k in L.meshes) if (game && game.renderer) game.renderer.dropLOD(k);
    L.meshes = {};
  };

})();
