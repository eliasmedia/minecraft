/* ============================================================
   map.js  -  Karte: zeichnet das erkundete Gelände von oben

   Der Ausschnitt wird beim Erstellen festgelegt und wandert danach nicht mehr
   mit – wie im Original. Erkundet wird, worüber man gelaufen ist; der Rest
   bleibt leer. Gespeichert wird das als Bitfeld auf einem groben Raster,
   damit eine Karte den Spielstand nicht aufbläht.
   ============================================================ */
(function () {
  'use strict';

  var K = {};
  MC.Karte = K;

  var B = MC.Blocks;

  K.SEITE = 128;          // Kantenlänge in Blöcken
  K.RASTER = 2;           // Blöcke je Erkundungszelle
  var ZELLEN = K.SEITE / K.RASTER;                 // 64
  var WORTE = (ZELLEN * ZELLEN) / 32;              // 128 Int32-Worte

  // Farbtafel. Absichtlich von Hand statt aus den Texturen gemittelt: eine
  // Karte soll lesbar sein, nicht fotografisch. Wasser muss sich von Gras
  // unterscheiden lassen, auch wenn beide gerade im Schatten liegen.
  var FARBEN = {
    water: [58, 92, 168], ice: [150, 190, 226],
    grass: [92, 138, 66], dirt: [122, 92, 62], farmland: [104, 76, 50],
    sand: [214, 200, 148], sandstone: [204, 188, 136], gravel: [136, 132, 128],
    stone: [124, 124, 124], cobblestone: [116, 116, 116], mossy_cobblestone: [104, 120, 96],
    snow_block: [238, 242, 246], clay: [154, 158, 170],
    leaves_oak: [64, 108, 48], leaves_birch: [86, 124, 56], leaves_spruce: [50, 84, 54],
    log_oak: [96, 74, 46], log_birch: [186, 176, 152], log_spruce: [70, 54, 38],
    planks_oak: [162, 130, 86], planks_birch: [196, 178, 130], planks_spruce: [114, 84, 54],
    cactus: [58, 122, 58], tall_grass: [98, 142, 70], dead_bush: [130, 106, 62],
    lava: [214, 106, 30], netherrack: [124, 52, 52], soul_sand: [82, 62, 50],
    end_stone: [220, 222, 164], obsidian: [26, 20, 40], bedrock: [66, 66, 66],
    glass: [200, 224, 232], wheat: [190, 178, 82]
  };
  var GRUND = [110, 110, 110];

  function farbe(name) { return FARBEN[name] || GRUND; }

  // ---------- Karte am Stack ----------
  K.neu = function (x, z) {
    // Auf ein Vielfaches der Seitenlänge einrasten, wie im Original: zwei
    // Karten aus derselben Gegend zeigen dann denselben Ausschnitt.
    var s = K.SEITE;
    var mx = Math.floor(x / s) * s, mz = Math.floor(z / s) * s;
    var g = new Array(WORTE);
    for (var i = 0; i < WORTE; i++) g[i] = 0;
    return { x: mx, z: mz, gesehen: g };
  };

  function gesehenAt(karte, cx, cz) {
    var i = cz * ZELLEN + cx;
    return (karte.gesehen[i >> 5] >>> (i & 31)) & 1;
  }
  function setzeGesehen(karte, cx, cz) {
    var i = cz * ZELLEN + cx;
    karte.gesehen[i >> 5] |= (1 << (i & 31));
  }

  // Beim Tragen wird die Umgebung aufgedeckt
  K.erkunden = function (karte, px, pz, radius) {
    if (!karte || !karte.gesehen) return false;
    var r = Math.ceil(radius / K.RASTER);
    var mx = Math.floor((px - karte.x) / K.RASTER);
    var mz = Math.floor((pz - karte.z) / K.RASTER);
    var neu = false;
    for (var dz = -r; dz <= r; dz++) {
      for (var dx = -r; dx <= r; dx++) {
        if (dx * dx + dz * dz > r * r) continue;
        var cx = mx + dx, cz = mz + dz;
        if (cx < 0 || cx >= ZELLEN || cz < 0 || cz >= ZELLEN) continue;
        if (gesehenAt(karte, cx, cz)) continue;
        setzeGesehen(karte, cx, cz); neu = true;
      }
    }
    return neu;
  };

  // ---------- Zeichnen ----------
  // Die Höhe der Nachbarspalte gibt die Schattierung: so bekommt das Gelände
  // Relief, ohne dass man Höhenlinien zeichnen müsste.
  K.zeichnen = function (world, karte, canvas) {
    var s = K.SEITE;
    if (canvas.width !== s) { canvas.width = s; canvas.height = s; }
    var ctx = canvas.getContext('2d');
    var bild = ctx.createImageData(s, s);
    var d = bild.data;
    var gen = world.gen;

    for (var z = 0; z < s; z++) {
      for (var x = 0; x < s; x++) {
        var i = (z * s + x) * 4;
        if (!gesehenAt(karte, (x / K.RASTER) | 0, (z / K.RASTER) | 0)) {
          d[i] = 22; d[i + 1] = 20; d[i + 2] = 26; d[i + 3] = 255;
          continue;
        }
        var wx = karte.x + x, wz = karte.z + z;
        var oben = oberflaeche(world, gen, wx, wz);
        var links = oberflaeche(world, gen, wx, wz - 1);
        var c = farbe(oben.name);
        // Nordkante heller, Südkante dunkler
        var stufe = oben.y - links.y;
        var f = stufe > 0 ? 1.18 : (stufe < 0 ? 0.82 : 1);
        d[i] = Math.min(255, c[0] * f);
        d[i + 1] = Math.min(255, c[1] * f);
        d[i + 2] = Math.min(255, c[2] * f);
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(bild, 0, 0);
    return canvas;
  };

  // Oberster sichtbarer Block einer Spalte. Ist der Chunk geladen, wird er
  // gelesen – so tauchen gebaute Häuser auf. Sonst rechnet der Generator.
  function oberflaeche(world, gen, wx, wz) {
    if (world.isLoaded(wx, 60, wz)) {
      var c = world.chunkAt(wx, wz);
      var h = c ? c.hmap[(wx & 15) | ((wz & 15) << 4)] : 0;
      for (var y = h; y > 0; y--) {
        var id = world.getBlock(wx, y, wz);
        if (!id) continue;
        var b = B.byId[id];
        if (!b || b.shape === B.SHAPE_NONE) continue;
        return { name: b.name, y: y };
      }
    }
    var info = gen.columnInfo(wx, wz);
    var hy = Math.floor(info.h);
    if (hy < gen.sea) return { name: 'water', y: gen.sea };
    var BM = MC.WorldGen.BIOME;
    var n = 'grass';
    if (info.biome === BM.DESERT || info.biome === BM.BEACH) n = 'sand';
    else if (info.biome === BM.SNOW) n = 'snow_block';
    else if (info.biome === BM.MOUNTAINS && hy > gen.sea + 40) n = 'stone';
    else if (info.biome === BM.FOREST || info.biome === BM.TAIGA) n = 'leaves_oak';
    return { name: n, y: hy };
  }

  // Wo steht der Spieler auf dieser Karte? null, wenn außerhalb.
  K.zeiger = function (karte, px, pz) {
    var lx = px - karte.x, lz = pz - karte.z;
    if (lx < 0 || lx >= K.SEITE || lz < 0 || lz >= K.SEITE) return null;
    return { x: lx / K.SEITE, z: lz / K.SEITE };
  };

})();
