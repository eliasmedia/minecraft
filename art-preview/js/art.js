/* ============================================================
   art.js  -  Texturkern, Fassung 2
   ------------------------------------------------------------
   Fassung 1 lag falsch. Sie ersetzte das Pixelrauschen durch
   grossflaechige Klumpen ("Detail nur bei 2-5 px") und verschob
   Schatten im Farbton ins Kuehle. Beides ist nicht das, was gute
   Voxel-Texturen tun, und das Ergebnis sah flauer aus als der
   Bestand.

   Diese Fassung beruht auf Messungen am Vanilla-Resource-Pack
   (Bedrock, ZtechNetwork/MCBVanillaResourcePack). Gemessen wurden
   Farbanzahl, Kontrastumfang, Saettigung und Tonverteilung je
   Kachel. Die Messwerte stehen in MESS unten und werden auf dem
   Stilblatt angezeigt.

   Was die Messung ergeben hat:

     1. Vanilla benutzt sehr wohl Rauschen je Pixel.
        ABER hart quantisiert auf 4-7 Stufen, nicht stufenlos.
        Der Bestand rauscht stufenlos -> hunderte Toene -> Matsch.
        Das ist der eigentliche Fehler, nicht die Frequenz.

     2. Die Steinfamilie ist NEUTRALGRAU. Kein Blaustich.
        stone.png = exakt vier Graustufen: 104, 116, 127, 143.

     3. Rampen sind multiplikativ bei KONSTANTEM Farbton.
        dirt.png = 89,61,41 / 121,85,58 / 150,108,74 / 185,133,92
        Farbton bleibt bei 25 Grad, Saettigung bleibt gleich.
        Keine Farbtonverschiebung im Schatten.

     4. Kontrast ist materialabhaengig, nicht global:
        Sand 21, Stein 27  -> bewusst flach
        Bruchstein 69, Erde 76, Bretter 78, Laub 87 -> kraeftig
        Gegenstaende 128-231 -> sehr kraeftig, bis Weiss 255

     5. Gras und Laub sind GRAUSTUFEN und werden zur Laufzeit
        eingefaerbt. Deshalb wirken sie satt und trotzdem ruhig.

     6. Struktur nur dort, wo das Material Struktur hat:
        Brettfugen, Ziegelfugen, Erznester. Sand und Stein haben
        keine - dort ist reines quantisiertes Rauschen richtig.

   Die Anordnung der Pixel wird hier prozedural neu erzeugt,
   nicht uebernommen. Uebernommen sind Regeln und Messwerte.
   ============================================================ */
(function (root) {
  'use strict';

  var ART = {};
  root.ART = ART;

  var TILE = 16;
  ART.TILE = TILE;

  // ============================================================
  //  Messwerte aus dem Vanilla-Pack (Recherche, siehe Kopf)
  // ============================================================
  ART.MESS = {
    'stone':        { farben: 4,  kontrast: 27,  saettigung: 0.00 },
    'dirt':         { farben: 7,  kontrast: 76,  saettigung: 0.35 },
    'cobblestone':  { farben: 6,  kontrast: 69,  saettigung: 0.00 },
    'sand':         { farben: 6,  kontrast: 21,  saettigung: 0.44 },
    'gravel':       { farben: 8,  kontrast: 43,  saettigung: 0.02 },
    'planks_oak':   { farben: 7,  kontrast: 78,  saettigung: 0.39 },
    'log_oak':      { farben: 6,  kontrast: 54,  saettigung: 0.37 },
    'log_oak_top':  { farben: 9,  kontrast: 76,  saettigung: 0.37 },
    'leaves_oak':   { farben: 4,  kontrast: 87,  saettigung: 0.02, hinweis: 'Graustufen + Tönung' },
    'grass_top':    { farben: 66, kontrast: 45,  saettigung: 0.00, hinweis: 'Graustufen + Tönung' },
    'stone_bricks': { farben: 7,  kontrast: 55,  saettigung: 0.01 },
    'coal_ore':     { farben: 10, kontrast: 89,  saettigung: 0.00 },
    'iron_ore':     { farben: 9,  kontrast: 43,  saettigung: 0.07 },
    'gold_ore':     { farben: 10, kontrast: 59,  saettigung: 0.19 },
    'diamond_ore':  { farben: 10, kontrast: 68,  saettigung: 0.12 },
    'bedrock':      { farben: 5,  kontrast: 100, saettigung: 0.00 },
    'netherrack':   { farben: 7,  kontrast: 30,  saettigung: 0.45 },
    'obsidian':     { farben: 5,  kontrast: 34,  saettigung: 0.59 },
    'snow_block':   { farben: 3,  kontrast: 5,   saettigung: 0.42 },
    'ice':          { farben: 6,  kontrast: 21,  saettigung: 0.98 },
    'clay':         { farben: 6,  kontrast: 14,  saettigung: 0.11 },
    'iron_pickaxe': { farben: 9,  kontrast: 192, saettigung: 0.26 },
    'diamond':      { farben: 10, kontrast: 178, saettigung: 0.69 },
    'stick':        { farben: 4,  kontrast: 75,  saettigung: 0.56 },
    'coal':         { farben: 9,  kontrast: 34,  saettigung: 0.06 },
    'bread':        { farben: 7,  kontrast: 94,  saettigung: 0.64 },
    'bone':         { farben: 5,  kontrast: 131, saettigung: 0.41 }
  };

  // ============================================================
  //  1. FARBE
  // ============================================================
  function clamp255(v) { return v < 0 ? 0 : (v > 255 ? 255 : Math.round(v)); }
  function mul(c, f) { return [clamp255(c[0] * f), clamp255(c[1] * f), clamp255(c[2] * f)]; }
  function mix(a, b, t) {
    return [clamp255(a[0] + (b[0] - a[0]) * t),
            clamp255(a[1] + (b[1] - a[1]) * t),
            clamp255(a[2] + (b[2] - a[2]) * t)];
  }
  ART.mul = mul; ART.mix = mix;

  /* Rampe wie im Vanilla-Pack: multiplikativ bei konstantem Farbton.
     Die Faktoren stammen aus dirt.png (89/121/150/185 gegen 150):
     0,59  0,80  1,00  1,23  -  also etwa Schritt 1,24. */
  function ramp(base, spread) {
    var s = spread === undefined ? 1 : spread;      // 1 = wie Vanilla
    function f(x) { return mul(base, 1 + (x - 1) * s); }
    return {
      sh: f(0.48), dk: f(0.72), bs: f(1.00), lt: f(1.20), hi: f(1.42),
      base: base,
      // als Liste, dunkel -> hell (fuer quantisiertes Rauschen)
      list: [f(0.48), f(0.72), f(1.00), f(1.20), f(1.42)]
    };
  }
  ART.ramp = ramp;

  function greys(vals) { return vals.map(function (v) { return [v, v, v]; }); }
  ART.greys = greys;

  /* ---- Materialpaletten ----
     Werte aus der Messung als Anker, dann leicht auf eine eigene
     Kennung verschoben: etwas waermeres Holz, etwas kuehlerer Sand,
     kraeftigeres Laub. Steinfamilie bleibt strikt neutral. */
  var P = {};
  ART.P = P;

  // -- Steinfamilie: neutralgrau, das ist gemessen und nicht verhandelbar
  P.stone      = greys([102, 114, 127, 142]);
  P.cobble     = greys([80, 96, 110, 136, 165, 182]);
  P.bricks     = greys([88, 106, 120, 136, 156]);
  P.bedrock    = greys([32, 50, 86, 100, 152]);
  P.gravel     = [[98, 92, 90], [113, 106, 104], [128, 126, 126], [138, 130, 127], [150, 143, 142], [152, 152, 152]];

  // -- Erde und Holz: konstanter Farbton, multiplikative Stufen
  P.dirt       = [[86, 60, 40], [118, 84, 57], [148, 107, 73], [182, 132, 92]];
  P.planks     = [[100, 78, 43], [124, 97, 54], [157, 130, 76], [174, 142, 84], [186, 150, 96], [198, 160, 100]];
  P.bark       = [[54, 42, 23], [74, 60, 37], [94, 73, 42], [115, 89, 53], [144, 112, 65], [154, 122, 74]];

  // -- Sand: sehr flach, das ist gemessen (Kontrast 21)
  P.sand       = [[206, 184, 137], [211, 194, 148], [217, 205, 162], [226, 218, 175], [232, 228, 188]];
  P.sandstone  = [[198, 176, 130], [214, 198, 152], [224, 212, 168], [234, 226, 186]];

  // -- Graustufen fuer alles, was getoent wird
  P.grassGrey  = greys([112, 124, 134, 143, 152, 162, 176, 194]);
  /* Laub: die 87 Kontrast des Originals werden AM GRAUSTUFENBILD gemessen.
     Die Tönung senkt die Leuchtdichte danach auf etwa 60 %. Damit die
     getönte Kachel im Spiel wieder bei 87 landet, muss die Graustufe
     entsprechend weiter gespreizt sein. */
  P.leafGrey   = greys([84, 108, 168, 216]);

  // -- Toenungen: aus den Vanilla-Colormaps abgelesen (Ebene/Wald)
  P.tintGrass  = [146, 188, 88];
  P.tintLeaf   = [104, 178, 52];
  P.tintPlant  = [124, 184, 74];

  P.netherrack = [[64, 22, 22], [80, 27, 27], [88, 34, 34], [102, 41, 41], [116, 51, 51]];
  P.obsidian   = [[0, 0, 2], [7, 4, 12], [17, 13, 29], [40, 31, 62], [60, 40, 86]];
  P.snow       = greys([246, 251, 255]);
  P.ice        = [[158, 198, 236], [168, 206, 241], [178, 214, 246], [188, 222, 250]];
  P.clay       = [[154, 160, 172], [162, 168, 180], [170, 176, 188], [178, 184, 196]];
  P.glow       = [[132, 100, 56], [162, 124, 66], [196, 156, 84], [232, 196, 116], [252, 232, 168]];

  // -- Erzfarben: Mittelton und Glanzton, wie gemessen etwa 13 % Flaeche
  P.ore = {
    coal:     [[28, 28, 30], [46, 46, 50], [16, 16, 18]],
    iron:     [[136, 116, 85], [176, 143, 120], [110, 92, 68]],
    gold:     [[156, 112, 32], [252, 220, 90], [120, 86, 24]],
    diamond:  [[110, 190, 190], [126, 236, 214], [78, 150, 156]],
    redstone: [[150, 24, 24], [220, 46, 46], [104, 16, 16]],
    lapis:    [[38, 66, 156], [70, 106, 214], [26, 46, 116]],
    emerald:  [[36, 152, 68], [72, 226, 108], [24, 108, 50]]
  };

  // -- Gegenstaende: Kontrast bis Weiss, Kontur fast schwarz (gemessen 24..255)
  P.tier = {
    wood:    [148, 110, 62],
    stone:   [124, 124, 124],
    iron:    [200, 200, 202],
    gold:    [232, 186, 48],
    diamond: [92, 218, 214]
  };
  P.kontur = [24, 22, 28];

  // ============================================================
  //  2. ZEICHNEN
  // ============================================================
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  ART.rng = rng;

  function G(seed) {
    this.d = new Uint8ClampedArray(TILE * TILE * 4);
    this.r = rng(seed);
  }
  G.prototype.set = function (x, y, c, a) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return this;
    var i = (y * TILE + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
    this.d[i + 3] = a === undefined ? 255 : a;
    return this;
  };
  G.prototype.wset = function (x, y, c, a) {
    return this.set(((x % 16) + 16) % 16, ((y % 16) + 16) % 16, c, a);
  };
  G.prototype.get = function (x, y) {
    var i = ((((y % 16) + 16) % 16) * TILE + (((x % 16) + 16) % 16)) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  };
  G.prototype.alpha = function (x, y) {
    if (x < 0 || y < 0 || x > 15 || y > 15) return 0;
    return this.d[(y * TILE + x) * 4 + 3];
  };
  G.prototype.fill = function (c, a) {
    for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) this.set(x, y, c, a);
    return this;
  };
  G.prototype.rect = function (x0, y0, w, h, c, a) {
    for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) this.set(x, y, c, a);
    return this;
  };
  G.prototype.wrect = function (x0, y0, w, h, c, a) {
    for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) this.wset(x, y, c, a);
    return this;
  };
  G.prototype.frame = function (x0, y0, w, h, c, a) {
    for (var x = x0; x < x0 + w; x++) { this.set(x, y0, c, a); this.set(x, y0 + h - 1, c, a); }
    for (var y = y0; y < y0 + h; y++) { this.set(x0, y, c, a); this.set(x0 + w - 1, y, c, a); }
    return this;
  };
  G.prototype.copyFrom = function (data) { this.d.set(data); return this; };

  /* ---- Das Arbeitspferd: quantisiertes Rauschen je Pixel ----
     Genau das, was Vanilla tut. Der Unterschied zum Bestand ist,
     dass das Ergebnis auf wenige feste Stufen faellt statt auf
     einen stufenlosen Helligkeitsfaktor.

     tones   Liste von Farben, dunkel -> hell
     w       Gewichte je Stufe (Summe beliebig). Steuert, wie oft
             eine Stufe vorkommt - bei Vanilla ist die Verteilung
             deutlich unsymmetrisch (stone: 7/28/46/20). */
  G.prototype.qnoise = function (tones, w) {
    var n = tones.length;
    if (!w) { w = []; for (var k = 0; k < n; k++) w.push(1); }
    var sum = 0, cum = [];
    for (var i = 0; i < n; i++) { sum += w[i]; cum.push(sum); }
    for (var y = 0; y < TILE; y++) {
      for (var x = 0; x < TILE; x++) {
        var v = this.r() * sum, j = 0;
        while (j < n - 1 && v > cum[j]) j++;
        this.set(x, y, tones[j]);
      }
    }
    return this;
  };

  /* Wie qnoise, aber mit waagerechten Laeufen von 1-3 Pixeln.
     Vanilla-Stein zeigt genau das: kurze gleiche Strecken statt
     reinem Salz-und-Pfeffer. Gibt der Flaeche etwas Fluss, ohne
     die Frequenz wirklich zu senken. */
  G.prototype.qnoiseRun = function (tones, w, maxRun) {
    var n = tones.length;
    if (!w) { w = []; for (var k = 0; k < n; k++) w.push(1); }
    var sum = 0, cum = [];
    for (var i = 0; i < n; i++) { sum += w[i]; cum.push(sum); }
    var mr = maxRun || 3;
    for (var y = 0; y < TILE; y++) {
      var x = 0;
      while (x < TILE) {
        var v = this.r() * sum, j = 0;
        while (j < n - 1 && v > cum[j]) j++;
        var run = 1 + Math.floor(this.r() * mr);
        for (var q = 0; q < run && x < TILE; q++, x++) this.set(x, y, tones[j]);
      }
    }
    return this;
  };

  /* Nur einen Teil der Flaeche neu wuerfeln - fuer Sprenkel, die
     ueber eine bestehende Struktur gelegt werden. */
  G.prototype.sprinkle = function (tones, dichte) {
    var n = tones.length;
    for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) {
      if (this.r() < dichte) this.set(x, y, tones[Math.floor(this.r() * n)]);
    }
    return this;
  };

  /* Toenung: Graustufe mal Farbe, wie die Biomfaerbung im Original. */
  G.prototype.tint = function (col) {
    for (var i = 0; i < this.d.length; i += 4) {
      if (this.d[i + 3] === 0) continue;
      this.d[i] = clamp255(this.d[i] * col[0] / 255);
      this.d[i + 1] = clamp255(this.d[i + 1] * col[1] / 255);
      this.d[i + 2] = clamp255(this.d[i + 2] * col[2] / 255);
    }
    return this;
  };

  /* Unregelmaessiges Nest, wie bei den Vanilla-Erzen: ein Kern aus
     Mittelton, ein paar Glanzpixel, ein Saum aus dunklem Ton. */
  G.prototype.nest = function (cx, cy, rad, cols) {
    var mid = cols[0], hi = cols[1], lo = cols[2];
    var pts = [];
    for (var y = -rad - 1; y <= rad + 1; y++) {
      for (var x = -rad - 1; x <= rad + 1; x++) {
        var d = Math.sqrt(x * x + y * y * 1.15);
        if (d <= rad - 0.25 + this.r() * 0.8) pts.push([cx + x, cy + y]);
      }
    }
    // Saum zuerst, damit der Kern ihn ueberdeckt
    for (var i = 0; i < pts.length; i++) {
      this.wset(pts[i][0], pts[i][1] + 1, lo);
      this.wset(pts[i][0] + 1, pts[i][1], lo);
    }
    for (var k = 0; k < pts.length; k++) this.wset(pts[k][0], pts[k][1], mid);
    // Glanz auf die obere linke Haelfte
    for (var m = 0; m < pts.length; m++) {
      var p = pts[m];
      if (p[0] - cx + (p[1] - cy) < -rad * 0.35 && this.r() < 0.75) this.wset(p[0], p[1], hi);
    }
    return this;
  };

  /* Pixelbild aus Textzeilen - fuer alles mit Silhouette. */
  G.prototype.art = function (rows, pal) {
    for (var y = 0; y < TILE && y < rows.length; y++) {
      var row = rows[y];
      for (var x = 0; x < TILE && x < row.length; x++) {
        var c = pal[row.charAt(x)];
        if (c) this.set(x, y, c);
      }
    }
    return this;
  };

  /* Gegenstandspalette. Der Kontrast ist materialabhaengig und wurde
     je Gegenstand gemessen - Metall liegt weit oben, Organisches weit
     unten. Eine Palette fuer alle waere falsch:
       iron_pickaxe 192 | diamond 178 | bone 131 | bread 94
       stick 75 | coal 34
     spread = 1 trifft Metall, kleinere Werte das Organische. */
  function itemPal(base, spread) {
    var s = spread === undefined ? 1 : spread;
    var w = P.planks;
    return {
      /* Die Kontur ist NICHT immer fast schwarz. Gemessen:
         iron_pickaxe geht bis 24 herunter, bone nur bis 124,
         stick bis 31 bei einem insgesamt dunklen Bild, bread bis 47.
         Organisches umrandet sich also mit einem dunklen Ton des
         eigenen Materials, nicht mit Neutralschwarz. Nur Metall und
         Kristall bekommen die harte Kontur. */
      O: s >= 0.9 ? P.kontur : mul(base, 0.50),
      H: mix(base, [255, 255, 255], 0.62 * s),
      L: mix(base, [255, 255, 255], 0.30 * s),
      M: base,
      h: mul(base, 1 - 0.30 * s),
      S: mul(base, 1 - 0.54 * s),
      W: w[4], w: w[2], v: w[0],
      N: [244, 244, 248], K: [58, 54, 60],
      R: [206, 44, 40], Y: [252, 208, 76]
    };
  }
  ART.itemPal = itemPal;

  // ============================================================
  //  3. REGISTRIERUNG (spiegelt MC.Textures)
  // ============================================================
  var names = [], index = {}, datas = [], meta = {};
  var seedCounter = 7000;

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function tex(name, info, fn) {
    if (typeof info === 'function') { fn = info; info = {}; }
    var g = new G(hashString(name) ^ (seedCounter++));
    fn(g);
    if (index[name] === undefined) { index[name] = names.length; names.push(name); datas.push(g.d); }
    else datas[index[name]] = g.d;
    meta[name] = info || {};
    return g;
  }
  ART.tex = tex;
  ART.names = names;
  ART.meta = function (n) { return meta[n] || {}; };
  ART.has = function (n) { return index[n] !== undefined; };
  ART.data = function (n) { return datas[index[n]]; };
  ART.layer = function (n) { var i = index[n]; return i === undefined ? 0 : i; };
  ART.count = function () { return names.length; };
  ART.buildBuffer = function () {
    var buf = new Uint8Array(TILE * TILE * 4 * names.length);
    for (var i = 0; i < names.length; i++) buf.set(datas[i], i * TILE * TILE * 4);
    return buf;
  };

  // ============================================================
  //  4. BLÖCKE
  // ============================================================

  // ---- STEIN: vier Graustufen, kurze waagerechte Laeufe, Kontrast 27
  tex('stone', { res: 16, motif: '4 Graustufen, kurze Läufe', ziel: 'stone' }, function (g) {
    g.qnoiseRun(P.stone, [7, 28, 46, 20], 3);
  });

  // ---- ERDE: vier Brauntoene, reines Rauschen, Kontrast 76
  tex('dirt', { res: 16, motif: '4 Brauntöne, Rauschen je Pixel', ziel: 'dirt' }, function (g) {
    g.qnoise(P.dirt, [13, 42, 27, 15]);
    // ein paar helle Steinchen, wie im Original
    g.sprinkle([P.stone[1], P.stone[2]], 0.03);
  });

  // ---- GRAS OBEN: Graustufen, dann Toenung. Kontrast 45.
  tex('grass_top', { res: 16, motif: 'Graustufen-Rauschen × Tönung', ziel: 'grass_top' }, function (g) {
    g.qnoise(P.grassGrey, [4, 9, 14, 18, 18, 14, 9, 4]);
    g.tint(P.tintGrass);
  });

  // ---- GRAS SEITE: Erde plus getoente Narbe mit fester Zackenkante
  tex('grass_side', { res: 16, motif: 'Erde + getönte Narbe', ziel: 'grass_top' }, function (g) {
    g.copyFrom(ART.data('dirt'));
    var kante = [4, 5, 3, 4, 6, 5, 3, 4, 5, 3, 4, 6, 4, 3, 5, 4];
    var gt = P.grassGrey;
    for (var x = 0; x < 16; x++) {
      var h = kante[x];
      for (var y = 0; y < h; y++) {
        var lvl = 3 + Math.floor(g.r() * 4);
        var c = gt[Math.min(gt.length - 1, lvl)];
        g.set(x, y, [clamp255(c[0] * P.tintGrass[0] / 255),
                     clamp255(c[1] * P.tintGrass[1] / 255),
                     clamp255(c[2] * P.tintGrass[2] / 255)]);
      }
    }
  });

  // ---- BRUCHSTEIN: sechs Graustufen, Kontrast 69.
  // Vanilla erzeugt die Zellen nicht durch harte Fasen, sondern durch
  // Ballungen heller und dunkler Toene. Genau das wird hier gemacht.
  tex('cobblestone', { res: 16, motif: '6 Graustufen, Ballungen', ziel: 'cobblestone' }, function (g) {
    g.qnoise(P.cobble, [4, 24, 19, 29, 14, 9]);
    // Fugenlinien: unregelmaessige dunkle Adern, kachelnd
    var adern = [
      [[0, 4], [4, 4], [6, 6], [10, 5], [15, 6]],
      [[5, 15], [5, 12], [7, 10], [7, 7]],
      [[12, 0], [12, 3], [10, 5]],
      [[0, 11], [3, 12], [7, 11], [11, 13], [15, 12]]
    ];
    adern.forEach(function (a) {
      for (var i = 0; i < a.length - 1; i++) {
        var p = a[i], q = a[i + 1];
        var steps = Math.max(Math.abs(q[0] - p[0]), Math.abs(q[1] - p[1]));
        for (var s = 0; s <= steps; s++) {
          var x = Math.round(p[0] + (q[0] - p[0]) * s / steps);
          var y = Math.round(p[1] + (q[1] - p[1]) * s / steps);
          g.wset(x, y, P.cobble[0]);
          if (g.r() < 0.55) g.wset(x, y - 1, P.cobble[4]);
        }
      }
    });
  });

  // ---- STEINZIEGEL: Verband, Fugen dunkel, Kontrast 55
  tex('stone_bricks', { res: 16, motif: 'Verband 8×8, dunkle Fuge', ziel: 'stone_bricks' }, function (g) {
    g.qnoise(P.bricks, [10, 18, 34, 24, 14]);
    var fuge = P.bricks[0];
    for (var x = 0; x < 16; x++) { g.set(x, 7, fuge); g.set(x, 15, fuge); }
    for (var y = 0; y < 8; y++) g.set(7, y, fuge);
    for (var y2 = 8; y2 < 16; y2++) g.set(15, y2, fuge);
    // Lichtkante unter jeder waagerechten Fuge
    for (var x2 = 0; x2 < 16; x2++) {
      if (g.r() < 0.7) g.set(x2, 0, P.bricks[4]);
      if (g.r() < 0.7) g.set(x2, 8, P.bricks[4]);
    }
  });

  // ---- SAND: sehr flach. Kontrast 21. Keine Duenen, kein Muster.
  tex('sand', { res: 16, motif: 'flaches Rauschen, 5 Töne', ziel: 'sand' }, function (g) {
    g.qnoise(P.sand, [4, 26, 42, 23, 5]);
  });

  tex('sandstone', { res: 16, motif: 'Sedimentbänder, ruhig' }, function (g) {
    g.qnoise(P.sandstone, [12, 30, 38, 20]);
    for (var y = 0; y < 16; y++) {
      if (y % 5 === 0) for (var x = 0; x < 16; x++) g.set(x, y, P.sandstone[0]);
      if (y % 5 === 1) for (var x2 = 0; x2 < 16; x2++) if (g.r() < 0.8) g.set(x2, y, P.sandstone[3]);
    }
  });

  // ---- KIES: acht Toene, leicht warm, Kontrast 43
  tex('gravel', { res: 16, motif: '6 Töne, runde Ballungen', ziel: 'gravel' }, function (g) {
    g.qnoise(P.gravel, [5, 19, 34, 19, 3, 16]);
    // ein paar groessere Kiesel mit dunklem Fuss
    [[2, 3], [8, 2], [13, 6], [4, 8], [10, 10], [1, 13], [7, 13], [14, 12]].forEach(function (p) {
      var w = 2 + Math.floor(g.r() * 2);
      g.wrect(p[0], p[1], w, w - 1, P.gravel[5]);
      for (var x = p[0]; x < p[0] + w; x++) g.wset(x, p[1] + w - 1, P.gravel[0]);
    });
  });

  // ---- BRETTER: der eine Block, der wirklich Struktur hat.
  // Drei Helligkeitsbaender je Brett, dazwischen dunkle Fuge. Kontrast 78.
  tex('planks_oak', { res: 16, motif: '4 Bahnen, 3 Bänder, dunkle Fuge', ziel: 'planks_oak' }, function (g) {
    var W = P.planks;
    for (var y = 0; y < 16; y++) {
      var b = y % 4;
      var tones, w;
      if (b === 3) { tones = [W[0], W[1]]; w = [70, 30]; }          // Fuge
      else if (b === 0) { tones = [W[3], W[4], W[5]]; w = [26, 42, 32]; }  // hell
      else if (b === 1) { tones = [W[2], W[3], W[4]]; w = [30, 44, 26]; }  // mittel
      else { tones = [W[1], W[2], W[3]]; w = [24, 46, 30]; }               // dunkel
      var sum = 0, cum = [];
      for (var i = 0; i < tones.length; i++) { sum += w[i]; cum.push(sum); }
      for (var x = 0; x < 16; x++) {
        var v = g.r() * sum, j = 0;
        while (j < tones.length - 1 && v > cum[j]) j++;
        g.set(x, y, tones[j]);
      }
    }
    // zwei Astloecher, fest gesetzt
    g.wrect(5, 1, 2, 2, W[1]); g.wset(5, 1, W[0]);
    g.wrect(12, 9, 2, 2, W[1]); g.wset(12, 9, W[0]);
  });

  // ---- STAMM: senkrechte Furchen, Kontrast 54
  tex('log_oak', { res: 16, motif: 'senkrechte Furchen, 6 Töne', ziel: 'log_oak' }, function (g) {
    var B = P.bark;
    for (var x = 0; x < 16; x++) {
      var band = x % 3;
      var tones = band === 0 ? [B[0], B[1], B[2]] : (band === 1 ? [B[2], B[3], B[4]] : [B[3], B[4], B[5]]);
      for (var y = 0; y < 16; y++) {
        g.set(x, y, tones[Math.floor(g.r() * tones.length)]);
      }
    }
    // durchgehende dunkle Furchen an festen Spalten
    [1, 6, 11].forEach(function (x) {
      for (var y = 0; y < 16; y++) {
        var xx = x + ((y + x) % 6 === 0 ? 1 : 0);
        g.wset(xx, y, B[0]);
        g.wset(xx + 1, y, B[4]);
      }
    });
  });

  tex('log_oak_top', { res: 16, motif: 'Jahresringe + Rinde', ziel: 'log_oak_top' }, function (g) {
    var W = P.planks, B = P.bark;
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var d = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5));
      // Rinde am Rand bleibt bewusst hell genug — mit den dunkelsten
      // Rindentönen läge der Kontrast bei 120 statt der gemessenen 76.
      if (d > 7.3) { g.set(x, y, B[1 + Math.floor(g.r() * 2)]); continue; }
      if (d > 6.3) { g.set(x, y, B[3 + Math.floor(g.r() * 2)]); continue; }
      var ring = Math.abs((d % 2.4) - 1.2);
      if (ring < 0.45) g.set(x, y, W[2 + Math.floor(g.r() * 2)]);
      else g.set(x, y, W[3 + Math.floor(g.r() * 3)]);
    }
    g.set(7, 7, W[5]); g.set(8, 7, W[4]);
  });

  // ---- LAUB: nur vier Graustufen, hoher Kontrast 87, dann Toenung.
  tex('leaves_oak', { res: 16, motif: '4 Graustufen × Tönung, 12 % Lücken', ziel: 'leaves_oak' }, function (g) {
    g.qnoise(P.leafGrey, [46, 14, 22, 18]);
    // Luecken: etwa 12 %, aber in kleinen Gruppen statt gleichverteilt
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      if (g.r() < 0.055) {
        g.set(x, y, [0, 0, 0], 0);
        if (g.r() < 0.5) g.set(x + 1, y, [0, 0, 0], 0);
        if (g.r() < 0.35) g.set(x, y + 1, [0, 0, 0], 0);
      }
    }
    g.tint(P.tintLeaf);
  });

  // ---- ERZE: Steingrund plus Nester, etwa 13 % der Flaeche
  function ore(name, cols, titel) {
    tex(name, { res: 16, motif: '4 Nester im Steingrund', ore: titel, ziel: name }, function (g) {
      g.copyFrom(ART.data('stone'));
      g.r = rng(hashString(name) ^ 0x51ed);
      var plaetze = [[4, 4], [11, 3], [10, 11], [3, 11], [7, 7]];
      for (var i = 0; i < 4; i++) {
        var p = plaetze[i];
        g.nest(p[0], p[1], 1.9 + g.r() * 0.9, cols);
      }
      // ein einzelner Splitter, damit die Anordnung nicht schematisch wirkt
      g.wset(plaetze[4][0], plaetze[4][1], cols[0]);
      g.wset(plaetze[4][0] + 1, plaetze[4][1], cols[2]);
    });
  }
  ore('coal_ore', P.ore.coal, 'Kohle');
  ore('iron_ore', P.ore.iron, 'Eisen');
  ore('gold_ore', P.ore.gold, 'Gold');
  ore('diamond_ore', P.ore.diamond, 'Diamant');
  ore('redstone_ore', P.ore.redstone, 'Redstone');
  ore('lapis_ore', P.ore.lapis, 'Lapis');
  ore('emerald_ore', P.ore.emerald, 'Smaragd');

  // ---- WEITERE BLÖCKE ----
  tex('bedrock', { res: 16, motif: '5 Graustufen, sehr hoher Kontrast', ziel: 'bedrock' }, function (g) {
    g.qnoiseRun(P.bedrock, [7, 34, 23, 16, 19], 2);
  });

  tex('snow_block', { res: 16, motif: '3 Töne, fast flach', ziel: 'snow_block' }, function (g) {
    g.qnoise(P.snow, [18, 52, 30]);
  });

  tex('ice', { res: 16, motif: '4 Töne, halbtransparent, Sprungrisse', ziel: 'ice' }, function (g) {
    g.qnoise(P.ice, [16, 34, 32, 18]);
    for (var i = 0; i < g.d.length; i += 4) g.d[i + 3] = 200;
    [[2, 3, 7, 6], [10, 1, 13, 7], [4, 10, 12, 13]].forEach(function (l) {
      var steps = Math.max(Math.abs(l[2] - l[0]), Math.abs(l[3] - l[1]));
      for (var s = 0; s <= steps; s++) {
        var x = Math.round(l[0] + (l[2] - l[0]) * s / steps);
        var y = Math.round(l[1] + (l[3] - l[1]) * s / steps);
        // Sprungriss nur eine Stufe über dem Grundton — Eis misst
        // Kontrast 21, ein greller Riss würde das sofort sprengen.
        g.set(x, y, P.ice[2], 225);
      }
    });
  });

  tex('clay', { res: 16, motif: '4 Töne, sehr flach', ziel: 'clay' }, function (g) {
    g.qnoise(P.clay, [16, 34, 32, 18]);
  });

  tex('obsidian', { res: 16, motif: '5 Töne, violetter Glanz', ziel: 'obsidian' }, function (g) {
    g.qnoise(P.obsidian, [25, 29, 26, 12, 8]);
    [[3, 2, 8, 6], [11, 8, 14, 13], [2, 11, 6, 15]].forEach(function (l) {
      var steps = Math.max(Math.abs(l[2] - l[0]), Math.abs(l[3] - l[1]));
      for (var s = 0; s <= steps; s++) {
        var x = Math.round(l[0] + (l[2] - l[0]) * s / steps);
        var y = Math.round(l[1] + (l[3] - l[1]) * s / steps);
        g.set(x, y, P.obsidian[3]);
      }
    });
    g.set(6, 4, P.obsidian[4]); g.set(12, 10, P.obsidian[4]);
  });

  tex('netherrack', { res: 16, motif: '5 Rottöne, flach, Fasern', ziel: 'netherrack' }, function (g) {
    g.qnoise(P.netherrack, [5, 18, 7, 28, 27]);
    for (var x = 0; x < 16; x += 3) for (var y = 0; y < 16; y++) {
      if ((y + x) % 5 !== 0) g.wset(x, y, P.netherrack[0]);
    }
  });

  tex('glowstone', { res: 16, motif: 'Leuchtnester mit Hof' }, function (g) {
    g.qnoise(P.glow.slice(0, 3), [30, 42, 28]);
    [[3, 3], [11, 4], [7, 9], [13, 12], [2, 12]].forEach(function (p) {
      g.nest(p[0], p[1], 2.1, [P.glow[3], P.glow[4], P.glow[2]]);
    });
  });

  tex('water', { res: 16, motif: '4 Töne, flache Wellenbänder' }, function (g) {
    var W = [[52, 96, 168], [58, 108, 186], [66, 122, 202], [82, 142, 218]];
    g.qnoise(W, [18, 36, 30, 16]);
    for (var i = 0; i < g.d.length; i += 4) g.d[i + 3] = 190;
    for (var k = 0; k < 4; k++) for (var x = 0; x < 16; x++) {
      var y = 2 + k * 4 + Math.round(Math.sin((x + k * 4) * 0.6) * 1.3);
      g.wset(x, y, W[3], 200);
    }
  });

  tex('lava', { res: 16, motif: 'Krustenzellen mit Glut' }, function (g) {
    var L = [[78, 26, 10], [122, 44, 12], [176, 70, 16], [220, 108, 24], [248, 168, 48]];
    g.qnoise(L.slice(0, 3), [30, 40, 30]);
    [[3, 4], [10, 2], [6, 10], [13, 9], [1, 12]].forEach(function (p) {
      g.nest(p[0], p[1], 1.9, [L[3], L[4], L[1]]);
    });
  });

  tex('white', { res: 16 }, function (g) { g.fill([255, 255, 255]); });

  // ============================================================
  //  5. PFLANZEN
  //  Gemessen: tallgrass ist Graustufe (34 Töne) + Tönung,
  //  Blumen sind farbig mit 7-10 Tönen und hohem Kontrast.
  // ============================================================
  function plant(name, info, rows, pal, tintCol) {
    tex(name, info, function (g) {
      g.fill([0, 0, 0], 0);
      g.art(rows, pal);
      if (tintCol) g.tint(tintCol);
    });
  }

  var GG = P.grassGrey;
  plant('tall_grass', { res: 16, motif: 'Graustufen-Halme × Tönung', ziel: 'tall_grass' }, [
    '................', '................', '.....d.......d..', '....dm......dm..',
    '..d.dm..m....m..', '..dm.m.dm...dm..', '.dm..m.dm..dm...', '.dm.dm.lm..dm...',
    'dm..dm.lm.dm....', 'dm..lm.lm.lm..d.', 'lm..lm.lm.lm.dm.', 'lm.dlm.lm.lm.lm.',
    'lm.llm.lm.lm.lm.', 'll.lll.ll.ll.ll.', '.l..ll.l..l..l..', '................'
  ], { d: GG[2], m: GG[4], l: GG[6] }, P.tintPlant);

  function flower(name, petal, center, titel) {
    var p = ramp(petal, 1.15);
    plant(name, { res: 16, motif: 'Blüte mit Kontur, 8 Töne', titel: titel }, [
      '................', '................', '.....OOOO.......', '....OHHHLO......',
      '...OHHMMMLO.....', '...OHMCCMMLO....', '...OHMCCMMLO....', '...OhMMMMMLO....',
      '....OhhhhMO.....', '.....OhhO.......', '.......s........', '....l..s........',
      '...lm..s..l.....', '....d..s.dm.....', '.......s.d......', '.......s........'
    ], {
      O: P.kontur, H: p.hi, L: p.lt, M: p.bs, C: center, h: p.dk,
      s: [72, 118, 46], l: [122, 176, 74], m: [96, 148, 58], d: [64, 104, 40]
    });
  }
  flower('flower_red', [200, 40, 38], [248, 216, 92], 'Mohn');
  flower('flower_yellow', [236, 196, 44], [252, 248, 208], 'Löwenzahn');
  flower('flower_blue', [74, 104, 216], [214, 226, 252], 'Kornblume');

  plant('mushroom_red', { res: 16, motif: 'Hut mit Punkten, Kontrast 131', ziel: 'mushroom_red' }, [
    '................', '................', '.....OOOOOO.....', '...OOHHHHHHOO...',
    '..OHHMwMMwMHHO..', '..OHMMMMMMMMHO..', '.OHMMwMMMMwMMHO.', '.OHMMMMMMMMMMHO.',
    '.OhhhhhhhhhhhhO.', '...OsSSSSsO.....', '....OsSSsO......', '....OsSSsO......',
    '....OsSSsO......', '....OsSSsO......', '...OSSSSSSO.....', '....OOOOOO......'
  ], (function () {
    var m = ramp([198, 46, 42], 1.2), st = ramp([226, 218, 202], 1.1);
    return { O: P.kontur, H: m.hi, M: m.bs, h: m.dk, w: [252, 250, 244], s: st.dk, S: st.bs };
  })());

  plant('mushroom_brown', { res: 16, motif: 'flacher Hut, dicker Stiel', ziel: 'mushroom_brown' }, [
    '................', '................', '................', '.....OOOOOO.....',
    '...OOHHHHHHOO...', '..OHMMMMMMMMHO..', '.OHMMMMMMMMMMHO.', '.OhhhhhhhhhhhhO.',
    '...OsSSSSSsO....', '....OsSSSsO.....', '....OsSSSsO.....', '....OsSSSsO.....',
    '....OsSSSsO.....', '....OsSSSsO.....', '...OSSSSSSSO....', '....OOOOOOO.....'
  ], (function () {
    var m = ramp([154, 112, 74], 1.2), st = ramp([214, 202, 182], 1.1);
    return { O: P.kontur, H: m.hi, M: m.bs, h: m.dk, s: st.dk, S: st.bs };
  })());

  plant('sapling_oak', { res: 16, motif: 'Krone + Stamm', ziel: 'sapling_oak' }, [
    '................', '.......OO.......', '.....OOllOO.....', '....OlmmmmlO....',
    '...OlmmMmmmlO...', '...OmmMMMmmdO...', '..OlmMMMMMmdO...', '..OmmMMMMMddO...',
    '...OdMMMMMdO....', '....OdddddO.....', '......OWO.......', '......OWO.......',
    '......OWO.......', '.....OvWO.......', '.....OvvO.......', '......OO........'
  ], (function () {
    var l = ramp([96, 156, 54], 1.15);
    return { O: P.kontur, l: l.lt, m: l.bs, M: l.dk, d: l.sh, W: P.bark[4], v: P.bark[1] };
  })());

  plant('dead_bush', { res: 16, motif: '3 Äste, kahl', ziel: 'dead_bush' }, [
    '................', '................', '.......d........', '....d..d....d...',
    '.....d.d...d....', '.....dbd..d.....', '......bd.d......', '......bbd.......',
    '.....d.bb.......', '....d..b..d.....', '.......bd.d.....', '.......b.d......',
    '.......b........', '.......b........', '......dbd.......', '................'
  ], { b: [126, 96, 52], d: [88, 66, 36] });

  // ============================================================
  //  6. GEGENSTÄNDE
  //  Gemessen: 4-11 Töne, Kontrast 128-231, Glanz bis 255,
  //  Kontur bei etwa 24. Deckung 14-57 % der Kachel.
  // ============================================================
  /* ---- Der Stiel ----
     Am Vanilla-Pack gemessen: 3 px breit, exakt 45 Grad — je Zeile
     genau EINE Spalte nach links. Aufbau von links nach rechts:
        dunkles Holz (49) | Holz (70/93 im Wechsel) | Kontur (27)
     Also Kontur nur auf der Schattenseite rechts, links reicht der
     dunkle Holzton als Kante. Das Wechseln des mittleren Tons je
     Zeile ist die Maserung.

     Der Bestand macht hier zwei Fehler: der Stiel ist 4 px breit mit
     Kontur auf BEIDEN Seiten, und er versetzt sich nur jede ZWEITE
     Zeile um ein Pixel — also 2:1 statt 45 Grad. Genau das liest sich
     als schiefer, klobiger Stock.

     Alle fünf Werkzeuge benutzen denselben Stiel und enden an
     derselben Stelle (Knauf bei x2/x3, Zeile 14). Diese Gleichheit
     ist der Grund, warum ein Werkzeugsatz wie ein Satz aussieht. */
  var STIEL = {
    O: [30, 24, 20],     // Kontur rechts
    W: [116, 90, 54],    // Holz hell
    w: [92, 71, 42],     // Holz mittel
    v: [62, 48, 28]      // dunkles Holz links
  };

  function stiel(g, r0, x0) {
    for (var r = r0; r <= 13; r++) {
      var x = x0 - (r - r0);
      g.set(x, r, STIEL.v);
      g.set(x + 1, r, (r & 1) ? STIEL.w : STIEL.W);
      g.set(x + 2, r, STIEL.O);
    }
    var xe = x0 - (13 - r0);           // Knauf unter der letzten Zeile
    g.set(xe, 14, STIEL.O);
    g.set(xe + 1, 14, STIEL.O);
  }

  /* Die Köpfe. Nur der Kopf steht als Pixelbild da, der Stiel wird
     gezeichnet — so kann er gar nicht mehr krumm werden.
     Gezeichnet wird Stiel zuerst, Kopf darüber: der Kopf sitzt also
     vorne auf dem Schaft, wie es sein soll. */
  var TOOL_ART = {
    /* Spitzhacke: Bogen mit HOHLRAUM darunter, links eine nach unten
       gezogene Spitze, rechts läuft der Bogen in den Schaft.
       Der Hohlraum ist das Erkennungsmerkmal — ohne ihn liest sich der
       Kopf als Hammer. Er muss aber schmal bleiben (4 px): wird er
       breiter, kippt die Silhouette in eine Schale. */
    pickaxe: {
      stiel: [5, 10],
      kopf: [
        '................',
        '...OOOOOOOOO....',
        '..OHHLMMMMMMhO..',
        '..OHLOOOOMMMMhO.',
        '..OOO....OOMMhO.'
      ]
    },
    /* Axt: Keil, nicht Herz. Die Schneide links ist fast senkrecht und
       trägt die Lichtkante, nach rechts unten verjüngt sich das Blatt
       zum Auge. Die breiteste Stelle liegt oberhalb der Mitte —
       sitzt sie mittig, wirkt der Kopf rund statt geschliffen. */
    axe: {
      stiel: [4, 11],
      kopf: [
        '................',
        '..OOOO..........',
        '.OHHLMO.........',
        '.OHLMMMO........',
        '.OHLMMMMO.......',
        '.OHLMMMMO.......',
        '.OLMMMMhO.......',
        '..OLMMhO........',
        '...OMhO.........',
        '....OO..........'
      ]
    },
    // Kompaktes Blatt oben, kurzer Hals
    shovel: {
      stiel: [6, 9],
      kopf: [
        '................',
        '........OOOOO...',
        '.......OHHLLMO..',
        '.......OHLMMMO..',
        '.......OHLMMMO..',
        '.......OLMMMhO..',
        '........OMMhO...'
      ]
    },
    // Klinge diagonal, Parierstange quer, dann derselbe Stiel als Griff
    sword: {
      stiel: [10, 5],
      kopf: [
        '.............OOO',
        '............OHLO',
        '...........OHLMO',
        '..........OHLMO.',
        '.........OHLMO..',
        '........OHLMO...',
        '.......OHLMO....',
        '......OHLMO.....',
        '.....OHLMO......',
        '...OOHMMhOO.....'
      ]
    },
    // Schmales Blatt oben links, Hals nach rechts zum Stiel
    hoe: {
      stiel: [4, 11],
      kopf: [
        '................',
        '....OOOOOOO.....',
        '...OHHLLLMMO....',
        '...OOOOOOMMhO...'
      ]
    }
  };
  ART.TOOL_ART = TOOL_ART;
  ART.STIEL = STIEL;

  Object.keys(P.tier).forEach(function (t) {
    var pal = itemPal(P.tier[t]);
    Object.keys(TOOL_ART).forEach(function (typ) {
      var def = TOOL_ART[typ];
      tex(t + '_' + typ, { res: 16, kind: 'werkzeug', tier: t, ziel: 'iron_pickaxe' },
        function (g) {
          g.fill([0, 0, 0], 0);
          stiel(g, def.stiel[0], def.stiel[1]);
          g.art(def.kopf, pal);
        });
    });
  });

  function itemArt(name, info, rows, pal) {
    tex(name, info, function (g) { g.fill([0, 0, 0], 0); g.art(rows, pal); });
  }

  itemArt('stick', { res: 16, kind: 'material', ziel: 'stick' }, [
    '................', '...........OO...', '..........OWLO..', '.........OWLO...',
    '........OWLO....', '.......OWLO.....', '......OWwO......', '.....OWwO.......',
    '....OWwO........', '...OWwO.........', '..OWvO..........', '..OvvO..........',
    '...OO...........', '................', '................', '................'
  ], (function () {
    /* Vanilla-Stock liegt komplett im Band 31–106 bei 4 Tönen. Er ist
       also nicht nur kontrastarm, sondern insgesamt dunkel — ein heller
       Stiel würde im Inventar mit Knochen und Pfeil kollidieren. */
    return {
      O: [42, 33, 19], W: [116, 90, 54], L: [134, 106, 66],
      w: [92, 71, 42], v: [68, 52, 30]
    };
  })());

  var INGOT = [
    '................', '................', '................', '....OOOOOOOO....',
    '...OHHHHHHHHO...', '..OHLLLLLLLLHO..', '..OLMMMMMMMMLO..', '..OLMMMMMMMMLO..',
    '..OMMMMMMMMMMO..', '..OhhMMMMMMhhO..', '...OhhhhhhhhO...', '....OOOOOOOO....',
    '................', '................', '................', '................'
  ];
  itemArt('iron_ingot', { res: 16, kind: 'material' }, INGOT, itemPal(P.tier.iron));
  itemArt('gold_ingot', { res: 16, kind: 'material' }, INGOT, itemPal(P.tier.gold));

  var GEM = [
    '................', '................', '......OOOO......', '.....OHHHHO.....',
    '....OHLLLLHO....', '...OHLMMMMLHO...', '..OHLMMMMMMLHO..', '.OHLMMMMMMMMLO..',
    '.OLMMMMMMMMMMO..', '..OhMMMMMMMMhO..', '...OhMMMMMMhO...', '....OhMMMMhO....',
    '.....OhhhhO.....', '......OOOO......', '................', '................'
  ];
  itemArt('diamond', { res: 16, kind: 'material', ziel: 'diamond' }, GEM, itemPal(P.tier.diamond));
  itemArt('emerald', { res: 16, kind: 'material' }, GEM, itemPal([50, 196, 100]));

  itemArt('coal', { res: 16, kind: 'material', ziel: 'coal' }, [
    '................', '................', '......OOO.......', '.....OHLMO......',
    '....OHLMMMOO....', '...OLMMMMMMhO...', '..OLMMMMMMMMhO..', '..OMMMMMMMMMhO..',
    '..OMMMMMMMMMhO..', '...OhMMMMMMhO...', '...OhhMMMMhO....', '....OhhhhhO.....',
    '.....OOOOO......', '................', '................', '................'
  ], itemPal([62, 60, 66]));

  itemArt('apple', { res: 16, kind: 'nahrung' }, [
    '................', '.........OO.....', '........Ogg.....', '.......OggO.....',
    '....OOOOsOO.....', '...OHHLMsMLO....', '..OHLMMMMMMLO...', '..OLMMMMMMMMO...',
    '..OLMMMMMMMMO...', '..OMMMMMMMMhO...', '..OMMMMMMMMhO...', '...OMMMMMMhO....',
    '...OhMMMMhhO....', '....OhhhhhO.....', '.....OOOOO......', '................'
  ], (function () {
    var p = itemPal([198, 44, 40], 0.7); p.g = [104, 168, 56]; p.s = P.bark[2]; return p;
  })());

  itemArt('bread', { res: 16, kind: 'nahrung', ziel: 'bread' }, [
    '................', '................', '...OOOOOOOOO....', '..OHHLLLLLLHO...',
    '.OHLMMMMMMMMLO..', '.OLMhMMMhMMMMO..', '.OMMMMMMMMMhMO..', '.OMMhMMMMMMMMO..',
    '.OMMMMMMhMMMMO..', '.OhMMMMMMMMMhO..', '..OhhMMMMMhhO...', '...OOhhhhhOO....',
    '.....OOOOO......', '................', '................', '................'
  ], itemPal([150, 110, 58], 0.55));      // Vanilla-Brot misst 94 bei Leuchtdichte 47–141

  itemArt('bone', { res: 16, kind: 'material', ziel: 'bone' }, [
    '................', '..OO........OO..', '.OHHO......OHHO.', '.OHMOOOOOOOOMHO.',
    '.OMMMMMMMMMMMMO.', '.OMhhhhhhhhhhMO.', '.OMOOOOOOOOOOMO.', '..OO........OO..',
    '..OO........OO..', '.OMOOOOOOOOOOMO.', '.OMhhhhhhhhhhMO.', '.OMMMMMMMMMMMMO.',
    '.OHMOOOOOOOOMHO.', '.OHHO......OHHO.', '..OO........OO..', '................'
  ], itemPal([232, 228, 210], 0.55));     // Vanilla-Knochen misst 131

  itemArt('arrow', { res: 16, kind: 'waffe' }, [
    '................', '.............OO.', '............OHO.', '...........OMO..',
    '..........OMO...', '.........OMO....', '........OwO.....', '.......OwO......',
    '......OwO.......', '.....OwO........', '..O.OwO.........', '.ONOwO..........',
    '.OONwO..........', 'ONNNO...........', '.ONO............', '..O.............'
  ], itemPal(P.tier.iron));

  itemArt('bucket', { res: 16, kind: 'werkzeug' }, [
    '................', '................', '..O..........O..', '..OO........OO..',
    '...OOOOOOOOOO...', '..OHHHHHHHHHHO..', '..OLMMMMMMMMLO..', '..OLMMMMMMMMLO..',
    '...OMMMMMMMMO...', '...OMMMMMMMMO...', '...OMMMMMMMMO...', '....OhMMMMhO....',
    '....OhhhhhhO....', '....OOOOOOOO....', '................', '................'
  ], itemPal([186, 188, 196]));

  itemArt('torch_item', { res: 16, kind: 'block' }, [
    '................', '................', '................', '......OYO.......',
    '.....OYFYO......', '.....OYFYO......', '......OFO.......', '......OWO.......',
    '......OWwO......', '......OWwO......', '......OWwO......', '......OWwO......',
    '......OWwO......', '......OWvO......', '......OvvO......', '.......OO.......'
  ], (function () {
    var p = itemPal(P.planks[4]);
    p.Y = [252, 208, 92]; p.F = [255, 248, 208];
    return p;
  })());

  // ============================================================
  //  7. KREATUREN
  //  Regel bleibt: kein Teil einfarbig, gleiche Augengrammatik.
  //  Neu: Struktur ebenfalls als quantisiertes Rauschen, damit die
  //  Haut zur Welt passt statt eigenem Stil zu folgen.
  // ============================================================
  function auge(g, x, y, weiss, iris, pupille) {
    g.rect(x, y, 3, 3, weiss);
    g.rect(x + 1, y + 1, 2, 2, iris);
    g.set(x + 1, y + 1, pupille);
    g.set(x + 2, y + 1, [255, 255, 255]);
  }
  ART.auge = auge;

  function haut(g, base, richtung) {
    var r = ramp(base, 0.8);
    g.qnoise([r.dk, r.bs, r.bs, r.lt], [22, 30, 30, 18]);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var k = richtung === 'v' ? (x + (y >> 2)) : (y + (x >> 2));
      if (k % 5 === 0) g.set(x, y, r.dk);
      if (k % 7 === 3) g.set(x, y, r.lt);
    }
    for (var x2 = 0; x2 < 16; x2++) { g.set(x2, 15, r.sh); g.set(x2, 14, r.dk); }
    return r;
  }

  function mob(name, base, richtung) {
    tex(name, { res: 16, kind: 'kreatur' }, function (g) { haut(g, base, richtung); });
  }
  function mobFace(name, base, fn) {
    tex(name, { res: 16, kind: 'kreatur' }, function (g) { var r = haut(g, base, 'v'); fn(g, r); });
  }

  mob('player_body', [58, 104, 178], 'v');
  mobFace('player_face', [228, 182, 146], function (g, r) {
    g.rect(0, 0, 16, 4, [82, 54, 32]);
    g.rect(0, 3, 16, 1, [58, 38, 22]);
    auge(g, 3, 6, [248, 248, 252], [56, 92, 170], [18, 22, 38]);
    auge(g, 10, 6, [248, 248, 252], [56, 92, 170], [18, 22, 38]);
    g.rect(6, 11, 4, 1, r.dk); g.set(7, 12, r.sh);
  });
  mob('player_arm', [228, 182, 146], 'v');

  mob('zombie_body', [66, 102, 62], 'v');
  mob('zombie_shirt', [62, 88, 148], 'v');
  mobFace('zombie_face', [82, 126, 70], function (g, r) {
    g.rect(0, 0, 16, 3, [40, 66, 38]);
    auge(g, 3, 5, [26, 42, 26], [14, 24, 16], [8, 14, 10]);
    auge(g, 10, 5, [26, 42, 26], [14, 24, 16], [8, 14, 10]);
    g.rect(5, 11, 6, 1, r.sh);
    for (var i = 0; i < 3; i++) g.set(5 + i * 2, 12, r.sh);
    g.rect(12, 8, 2, 3, r.dk); g.set(12, 8, r.sh);
  });

  mob('skeleton_body', [204, 202, 196], 'v');
  mobFace('skeleton_face', [212, 210, 204], function (g, r) {
    g.rect(2, 4, 4, 4, [22, 22, 26]); g.rect(10, 4, 4, 4, [22, 22, 26]);
    g.set(3, 5, [66, 66, 74]); g.set(11, 5, [66, 66, 74]);
    g.rect(4, 11, 8, 1, r.sh);
    for (var i = 0; i < 4; i++) g.set(5 + i * 2, 12, r.sh);
    g.rect(6, 8, 4, 2, r.dk);
  });

  mob('creeper_body', [72, 172, 76], 'v');
  mobFace('creeper_face', [72, 172, 76], function (g) {
    g.rect(3, 4, 4, 4, [18, 20, 22]); g.rect(9, 4, 4, 4, [18, 20, 22]);
    g.rect(6, 8, 4, 5, [18, 20, 22]);
    g.rect(5, 10, 2, 3, [18, 20, 22]); g.rect(9, 10, 2, 3, [18, 20, 22]);
    g.rect(3, 3, 4, 1, [34, 92, 40]); g.rect(9, 3, 4, 1, [34, 92, 40]);
  });

  mob('pig_body', [232, 148, 152], 'h');
  mobFace('pig_face', [232, 148, 152], function (g, r) {
    auge(g, 3, 4, [248, 248, 252], [40, 30, 36], [14, 12, 18]);
    auge(g, 10, 4, [248, 248, 252], [40, 30, 36], [14, 12, 18]);
    g.rect(4, 9, 8, 5, r.dk); g.rect(4, 9, 8, 1, r.bs);
    g.rect(6, 11, 2, 2, r.sh); g.rect(9, 11, 2, 2, r.sh);
  });

  mob('cow_body', [76, 54, 40], 'h');
  mobFace('cow_face', [76, 54, 40], function (g, r) {
    g.rect(2, 2, 12, 7, [234, 230, 222]);
    g.rect(2, 2, 12, 1, [250, 248, 242]);
    auge(g, 3, 4, [248, 248, 252], [44, 30, 22], [14, 10, 8]);
    auge(g, 10, 4, [248, 248, 252], [44, 30, 22], [14, 10, 8]);
    g.rect(5, 10, 6, 4, [194, 152, 152]);
    g.rect(5, 10, 6, 1, [216, 176, 176]);
    g.set(6, 12, r.sh); g.set(9, 12, r.sh);
  });
  mob('cow_spot', [238, 234, 226], 'h');

  // ============================================================
  //  8. EFFEKTE
  // ============================================================
  var ARME = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  for (var cs = 0; cs < 10; cs++) {
    (function (s) {
      tex('crack_' + s, { res: 16, kind: 'effekt' }, function (g) {
        g.fill([0, 0, 0], 0);
        var len = 1 + s * 0.78, a = 210;
        ARME.forEach(function (d, i) {
          var l = Math.round(len * (i % 2 ? 0.72 : 1));
          for (var k = 1; k <= l; k++) {
            var x = 8 + d[0] * k + ((i * 3 + k) % 3 === 0 ? d[1] : 0);
            var y = 8 + d[1] * k + ((i * 5 + k) % 4 === 0 ? d[0] : 0);
            g.set(x, y, [8, 6, 12], a);
            if (k <= l - 1) g.set(x + (d[1] ? 1 : 0), y + (d[0] ? 1 : 0), [210, 210, 220], 70);
          }
        });
        if (s >= 5) g.rect(7, 7, 2, 2, [8, 6, 12], a);
        if (s >= 8) [[3, 3], [12, 4], [4, 12], [12, 11]].forEach(function (p) {
          g.rect(p[0], p[1], 2, 1, [8, 6, 12], a - 40);
        });
      });
    })(cs);
  }

  function partikel(name, base) {
    tex(name, { res: 16, kind: 'effekt' }, function (g) {
      var r = ramp(base, 1.1);
      g.fill([0, 0, 0], 0);
      g.rect(3, 3, 10, 10, r.dk);
      g.rect(4, 4, 8, 8, r.bs);
      g.rect(5, 5, 5, 5, r.lt);
      g.rect(5, 5, 2, 2, r.hi);
    });
  }
  partikel('p_smoke', [128, 124, 130]);
  partikel('p_flame', [240, 150, 44]);
  partikel('p_water', [68, 124, 202]);
  partikel('p_blood', [166, 38, 36]);
  partikel('p_soul', [228, 226, 232]);

  tex('fx_spark', { res: 16, kind: 'effekt' }, function (g) {
    g.fill([0, 0, 0], 0);
    var c = [255, 250, 214], m = [252, 200, 84], o = [222, 116, 28];
    for (var k = 1; k <= 6; k++) {
      var col = k < 3 ? c : (k < 5 ? m : o);
      g.set(8 + k, 8, col); g.set(8 - k, 8, col);
      g.set(8, 8 + k, col); g.set(8, 8 - k, col);
      if (k < 4) { g.set(8 + k, 8 + k, col); g.set(8 - k, 8 - k, col); g.set(8 + k, 8 - k, col); g.set(8 - k, 8 + k, col); }
    }
    g.rect(7, 7, 3, 3, [255, 255, 246]);
  });

  tex('fx_pickup', { res: 16, kind: 'effekt' }, function (g) {
    g.fill([0, 0, 0], 0);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var d = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5));
      if (d > 4.6 && d < 6.4) g.set(x, y, [216, 246, 255], 220);
      else if (d >= 6.4 && d < 7.2) g.set(x, y, [140, 200, 240], 110);
    }
  });

  // ============================================================
  //  9. Hilfen für die Vorschau
  // ============================================================
  ART.toCanvas = function (name, scale) {
    scale = scale || 1;
    var c = document.createElement('canvas');
    c.width = TILE * scale; c.height = TILE * scale;
    var ctx = c.getContext('2d');
    var src = ART.data(name);
    if (!src) return c;
    var small = document.createElement('canvas');
    small.width = TILE; small.height = TILE;
    var sctx = small.getContext('2d');
    var img = sctx.createImageData(TILE, TILE);
    img.data.set(src);
    sctx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, TILE, TILE, 0, 0, c.width, c.height);
    return c;
  };

  ART.paletteOf = function (name) {
    var src = ART.data(name); if (!src) return [];
    var m = {};
    for (var i = 0; i < src.length; i += 4) {
      if (src[i + 3] < 128) continue;
      var k = src[i] + ',' + src[i + 1] + ',' + src[i + 2];
      m[k] = (m[k] || 0) + 1;
    }
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })
      .map(function (k) { return { rgb: k.split(',').map(Number), n: m[k] }; });
  };

  /* Dieselben Kennzahlen, die für das Vanilla-Pack gemessen wurden —
     damit sich Vorschlag und Messwert direkt vergleichen lassen. */
  ART.kennzahlen = function (atlas, name) {
    var src = atlas.data ? atlas.data(name) : null;
    if (!src) return null;
    var m = {}, lum = [], sat = [], n = 0;
    for (var i = 0; i < src.length; i += 4) {
      if (src[i + 3] < 128) continue;
      var r = src[i], gg = src[i + 1], b = src[i + 2];
      m[r + ',' + gg + ',' + b] = 1;
      lum.push(0.2126 * r + 0.7152 * gg + 0.0722 * b);
      var mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      var l = (mx + mn) / 2 / 255;
      sat.push(mx === mn ? 0 : (l > 0.5 ? (mx - mn) / (510 - mx - mn) : (mx - mn) / (mx + mn)));
      n++;
    }
    if (!n) return null;
    lum.sort(function (a, b2) { return a - b2; });
    return {
      farben: Object.keys(m).length,
      kontrast: Math.round(lum[Math.floor(n * 0.9)] - lum[Math.floor(n * 0.1)]),
      saettigung: Math.round(sat.reduce(function (a, b3) { return a + b3; }, 0) / n * 100) / 100,
      deckend: Math.round(100 * n / (TILE * TILE))
    };
  };

})(window);
