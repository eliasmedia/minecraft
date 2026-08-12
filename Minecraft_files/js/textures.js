/* ============================================================
   textures.js  -  Prozedurale 16x16 Pixel-Texturen (keine externen Dateien!)
                   -> WebGL2 TEXTURE_2D_ARRAY + Icon-Canvas fuers UI

   Regelwerk: docs/ART-DIRECTION.md

   Die drei Regeln, auf denen alles hier beruht (am Vanilla-Pack
   gemessen, siehe docs/ART-REDESIGN-PLAN.md):

     1. Rauschen je Pixel ist richtig - aber HART auf 4-8 feste Toene
        quantisiert, nicht stufenlos. Stufenloses Rauschen erzeugt
        Dutzende dicht beieinander liegender Toene, die sich auf
        Entfernung gegenseitig wegmitteln.

     2. Rampen sind multiplikativ bei KONSTANTEM Farbton. Die
        Steinfamilie ist neutralgrau, ohne Blaustich.

     3. Kontrast ist materialabhaengig: Sand 21 und Stein 27 bleiben
        flach, Erde 76 und Laub 87 werden kraeftig. Es gibt keinen
        globalen Wert.

   Bewuchs wird als Graustufe gezeichnet und dann getoent - so
   beziehen Grasblock, hohes Gras und Setzling ihr Gruen aus einer
   einzigen Quelle und koennen nicht auseinanderlaufen.
   ============================================================ */
(function () {
  'use strict';

  var T = {};
  MC.Textures = T;
  var TILE = 16;
  T.TILE = TILE;

  var names = [];
  var index = {};
  var datas = [];      // Uint8ClampedArray je Textur (RGBA)

  // ============================================================
  //  FARBE
  // ============================================================
  function c255(v) { return v < 0 ? 0 : (v > 255 ? 255 : Math.round(v)); }
  function mul(c, f) { return [c255(c[0] * f), c255(c[1] * f), c255(c[2] * f)]; }
  function mix(a, b, t) {
    return [c255(a[0] + (b[0] - a[0]) * t), c255(a[1] + (b[1] - a[1]) * t), c255(a[2] + (b[2] - a[2]) * t)];
  }
  function dark(c, f) { return mul(c, f); }
  function greys(v) { return v.map(function (x) { return [x, x, x]; }); }
  T.mul = mul; T.mix = mix;

  // Fuenfstufige Rampe, multiplikativ, konstanter Farbton.
  // Faktoren aus dirt.png abgeleitet (89/121/150/185 gegen 150).
  function ramp(base, spread) {
    var s = spread === undefined ? 1 : spread;
    function f(x) { return mul(base, 1 + (x - 1) * s); }
    var r = { sh: f(0.48), dk: f(0.72), bs: f(1.00), lt: f(1.20), hi: f(1.42), base: base };
    r.list = [r.sh, r.dk, r.bs, r.lt, r.hi];
    return r;
  }
  T.ramp = ramp;

  // ============================================================
  //  ZEICHNEN
  // ============================================================
  function G(seed) {
    this.d = new Uint8ClampedArray(TILE * TILE * 4);
    this.r = MC.U.rng(seed);
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
  G.prototype.alphaAt = function (x, y) {
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
  G.prototype.copy = function (other) { this.d.set(other.d); return this; };

  /* Nur noch fuer particles.js und renderer.js vorhanden. In neuen
     Texturen NICHT benutzen - stufenloses Rauschen ist genau der
     Fehler, den diese Fassung behebt. */
  G.prototype.noise = function (amt) {
    for (var i = 0; i < this.d.length; i += 4) {
      if (this.d[i + 3] === 0) continue;
      var f = 1 + (this.r() * 2 - 1) * amt;
      this.d[i] *= f; this.d[i + 1] *= f; this.d[i + 2] *= f;
    }
    return this;
  };

  /* Das Arbeitspferd: Rauschen je Pixel auf einer kurzen Tonliste.
     w = Gewichte je Stufe, steuert die Verteilung (Vanilla-Stein
     verteilt 7/28/46/20, also deutlich unsymmetrisch). */
  G.prototype.qn = function (tones, w) {
    var n = tones.length, i;
    if (!w) { w = []; for (i = 0; i < n; i++) w.push(1); }
    var sum = 0, cum = [];
    for (i = 0; i < n; i++) { sum += w[i]; cum.push(sum); }
    for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) {
      var v = this.r() * sum, j = 0;
      while (j < n - 1 && v > cum[j]) j++;
      this.set(x, y, tones[j]);
    }
    return this;
  };

  /* Wie qn, aber mit waagerechten Laeufen von 1..maxRun Pixeln.
     Vanilla-Stein zeigt genau das - gibt der Flaeche etwas Fluss. */
  G.prototype.qnRun = function (tones, w, maxRun) {
    var n = tones.length, i;
    if (!w) { w = []; for (i = 0; i < n; i++) w.push(1); }
    var sum = 0, cum = [];
    for (i = 0; i < n; i++) { sum += w[i]; cum.push(sum); }
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

  // Einzelne Pixel nachtraeglich ueberschreiben (Sprenkel, Einschluesse)
  G.prototype.sprinkle = function (tones, dichte) {
    for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) {
      if (this.r() < dichte) this.set(x, y, tones[Math.floor(this.r() * tones.length)]);
    }
    return this;
  };
  G.prototype.speck = function (n, c, a) {
    for (var i = 0; i < n; i++) this.set((this.r() * TILE) | 0, (this.r() * TILE) | 0, c, a);
    return this;
  };
  G.prototype.blob = function (cx, cy, rad, c, a) {
    for (var y = -rad; y <= rad; y++) for (var x = -rad; x <= rad; x++) {
      var d = Math.sqrt(x * x + y * y);
      if (d <= rad - 0.3 + this.r() * 0.7) this.set(cx + x, cy + y, c, a);
    }
    return this;
  };

  // Graustufe mal Farbe - die Biomfaerbung des Originals
  G.prototype.tint = function (col) {
    for (var i = 0; i < this.d.length; i += 4) {
      if (this.d[i + 3] === 0) continue;
      this.d[i] = c255(this.d[i] * col[0] / 255);
      this.d[i + 1] = c255(this.d[i + 1] * col[1] / 255);
      this.d[i + 2] = c255(this.d[i + 2] * col[2] / 255);
    }
    return this;
  };

  /* Unregelmaessiges Nest (Erze, Leuchtnester): Kern in Mittelton,
     Glanz auf der Lichtseite, dunkler Saum unten rechts. Gemessener
     Flaechenanteil aller Nester zusammen: etwa 13 %. */
  G.prototype.nest = function (cx, cy, rad, cols) {
    var mid = cols[0], hi = cols[1], lo = cols[2], pts = [];
    for (var y = -rad - 1; y <= rad + 1; y++) for (var x = -rad - 1; x <= rad + 1; x++) {
      var d = Math.sqrt(x * x + y * y * 1.15);
      if (d <= rad - 0.25 + this.r() * 0.8) pts.push([cx + x, cy + y]);
    }
    var i;
    for (i = 0; i < pts.length; i++) {
      this.wset(pts[i][0], pts[i][1] + 1, lo);
      this.wset(pts[i][0] + 1, pts[i][1], lo);
    }
    for (i = 0; i < pts.length; i++) this.wset(pts[i][0], pts[i][1], mid);
    for (i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (p[0] - cx + (p[1] - cy) < -rad * 0.35 && this.r() < 0.75) this.wset(p[0], p[1], hi);
    }
    return this;
  };

  // Pixelbild aus Textzeilen - alles mit Silhouette
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

  // ============================================================
  //  REGISTRIERUNG
  // ============================================================
  var seedCounter = 1000;
  function tex(name, fn) {
    var g = new G(MC.U.hashString(name) ^ (seedCounter++));
    fn(g);
    if (index[name] === undefined) { index[name] = names.length; names.push(name); datas.push(g.d); }
    else datas[index[name]] = g.d;
    return g;
  }
  T.add = tex;
  function data(n) { return datas[index[n]]; }

  // ============================================================
  //  PALETTEN
  // ============================================================
  var P = {};
  T.P = P;

  // Steinfamilie: strikt neutralgrau
  P.stone   = greys([102, 114, 127, 142]);
  P.cobble  = greys([80, 96, 110, 136, 165, 182]);
  P.bricks  = greys([88, 106, 120, 136, 156]);
  P.bedrock = greys([32, 50, 86, 100, 152]);
  P.gravel  = [[98, 92, 90], [113, 106, 104], [128, 126, 126], [138, 130, 127], [150, 143, 142], [152, 152, 152]];

  // Erde und Holz: konstanter Farbton
  P.dirt    = [[86, 60, 40], [118, 84, 57], [148, 107, 73], [182, 132, 92]];
  P.planks  = [[100, 78, 43], [124, 97, 54], [157, 130, 76], [174, 142, 84], [186, 150, 96], [198, 160, 100]];
  P.bark    = [[54, 42, 23], [74, 60, 37], [94, 73, 42], [115, 89, 53], [144, 112, 65], [154, 122, 74]];

  P.sand      = [[206, 184, 137], [211, 194, 148], [217, 205, 162], [226, 218, 175], [232, 228, 188]];
  P.sandstone = [[198, 176, 130], [214, 198, 152], [224, 212, 168], [234, 226, 186]];

  // Graustufen fuer alles Getoente
  P.grassGrey = greys([112, 124, 134, 143, 152, 162, 176, 194]);
  P.leafGrey  = greys([84, 108, 168, 216]);

  // Toenungen aus den Vanilla-Colormaps (Ebene / Wald)
  P.tintGrass = [146, 188, 88];
  P.tintLeaf  = [104, 178, 52];
  P.tintPlant = [124, 184, 74];

  P.netherrack = [[64, 22, 22], [80, 27, 27], [88, 34, 34], [102, 41, 41], [116, 51, 51]];
  P.obsidian   = [[0, 0, 2], [7, 4, 12], [17, 13, 29], [40, 31, 62], [60, 40, 86]];
  P.snow       = greys([246, 251, 255]);
  P.ice        = [[158, 198, 236], [168, 206, 241], [178, 214, 246], [188, 222, 250]];
  P.clay       = [[154, 160, 172], [162, 168, 180], [170, 176, 188], [178, 184, 196]];
  P.glow       = [[132, 100, 56], [162, 124, 66], [196, 156, 84], [232, 196, 116], [252, 232, 168]];
  P.quartz     = greys([206, 202, 194]).concat([[222, 218, 210], [236, 232, 224], [246, 243, 237]]);

  P.ore = {
    coal:      [[44, 44, 48], [62, 62, 66], [28, 28, 32]],
    iron:      [[136, 116, 85], [176, 143, 120], [110, 92, 68]],
    gold:      [[156, 112, 32], [252, 220, 90], [120, 86, 24]],
    diamond:   [[110, 190, 190], [126, 236, 214], [78, 150, 156]],
    redstone:  [[150, 24, 24], [220, 46, 46], [104, 16, 16]],
    lapis:     [[38, 66, 156], [70, 106, 214], [26, 46, 116]],
    emerald:   [[36, 152, 68], [72, 226, 108], [24, 108, 50]],
    quartz:    [[210, 204, 196], [246, 243, 237], [166, 160, 152]],
    ambrosium: [[214, 148, 38], [252, 206, 96], [162, 108, 24]],
    gravitite: [[62, 190, 158], [116, 238, 210], [40, 134, 112]],
    zanite:    [[132, 84, 196], [186, 140, 240], [92, 56, 142]]
  };

  P.tier = {
    wood:      [148, 110, 62],
    stone:     [124, 124, 124],
    iron:      [200, 200, 202],
    gold:      [232, 186, 48],
    diamond:   [92, 218, 214],
    holystone: [202, 198, 186],
    zanite:    [138, 96, 206],
    gravitite: [104, 206, 182]
  };
  P.kontur = [24, 22, 28];

  // ============================================================
  //  GEGENSTANDSPALETTE
  //  Kontrast ist materialabhaengig (gemessen): Werkzeug 192,
  //  Knochen 131, Brot 94, Stock 75, Kohle 34. Die Kontur ist nur
  //  bei Metall fast schwarz - Organisches umrandet sich mit einem
  //  dunklen Ton des eigenen Materials.
  // ============================================================
  function itemPal(base, spread) {
    var s = spread === undefined ? 1 : spread;
    var w = P.planks;
    return {
      O: s >= 0.9 ? P.kontur : mul(base, 0.50),
      H: mix(base, [255, 255, 255], 0.62 * s),
      L: mix(base, [255, 255, 255], 0.30 * s),
      M: base,
      h: mul(base, 1 - 0.30 * s),
      S: mul(base, 1 - 0.54 * s),
      W: w[4], w: w[2], v: w[0],
      N: [244, 244, 248], K: [58, 54, 60],
      R: [206, 44, 40], Y: [252, 208, 76], G: [104, 168, 56]
    };
  }
  T.itemPal = itemPal;

  // ============================================================
  //  DER STIEL
  //  3 px breit, exakt 45 Grad - je Zeile GENAU eine Spalte nach
  //  links. Aufbau: dunkles Holz | Holz (im Wechsel) | Kontur.
  //  Kontur nur auf der Schattenseite rechts.
  //  Alle Werkzeuge benutzen denselben Stiel und enden am selben
  //  Knauf. Diese Gleichheit macht aus fuenf Bildern einen Satz.
  // ============================================================
  var STIEL = { O: [30, 24, 20], W: [116, 90, 54], w: [92, 71, 42], v: [62, 48, 28] };
  function stiel(g, r0, x0) {
    for (var r = r0; r <= 13; r++) {
      var x = x0 - (r - r0);
      g.set(x, r, STIEL.v);
      g.set(x + 1, r, (r & 1) ? STIEL.w : STIEL.W);
      g.set(x + 2, r, STIEL.O);
    }
    var xe = x0 - (13 - r0);
    g.set(xe, 14, STIEL.O); g.set(xe + 1, 14, STIEL.O);
  }

  // ============================================================
  //  BLOECKE - OBERWELT
  // ============================================================
  tex('stone', function (g) { g.qnRun(P.stone, [7, 28, 46, 20], 3); });
  tex('dirt', function (g) { g.qn(P.dirt, [13, 42, 27, 15]); g.sprinkle([P.stone[1], P.stone[2]], 0.03); });

  tex('grass_top', function (g) {
    g.qn(P.grassGrey, [4, 9, 14, 18, 18, 14, 9, 4]); g.tint(P.tintGrass);
  });

  // Feste Zackenkante, damit die Narbe kachelt und nicht zufaellig wirkt
  var NARBE = [4, 5, 3, 4, 6, 5, 3, 4, 5, 3, 4, 6, 4, 3, 5, 4];
  function grasSeite(g, tint, erde) {
    g.copyFrom(data(erde || 'dirt'));
    for (var x = 0; x < 16; x++) {
      var h = NARBE[x];
      for (var y = 0; y < h; y++) {
        var c = P.grassGrey[Math.min(7, 3 + Math.floor(g.r() * 4))];
        g.set(x, y, [c255(c[0] * tint[0] / 255), c255(c[1] * tint[1] / 255), c255(c[2] * tint[2] / 255)]);
      }
    }
  }
  tex('grass_side', function (g) { grasSeite(g, P.tintGrass); });

  tex('cobblestone', function (g) {
    g.qn(P.cobble, [4, 24, 19, 29, 14, 9]);
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

  tex('mossy_cobblestone', function (g) {
    g.copyFrom(data('cobblestone'));
    var moos = [[52, 78, 42], [68, 100, 52], [86, 122, 62]];
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      if (g.r() < 0.32) g.set(x, y, moos[Math.floor(g.r() * 3)]);
    }
  });

  function ziegelVerband(g, pal, fugeIdx, lichtIdx) {
    var fuge = pal[fugeIdx === undefined ? 0 : fugeIdx];
    var licht = pal[lichtIdx === undefined ? pal.length - 1 : lichtIdx];
    for (var x = 0; x < 16; x++) { g.set(x, 7, fuge); g.set(x, 15, fuge); }
    for (var y = 0; y < 8; y++) g.set(7, y, fuge);
    for (var y2 = 8; y2 < 16; y2++) g.set(15, y2, fuge);
    for (var x2 = 0; x2 < 16; x2++) {
      if (g.r() < 0.7) g.set(x2, 0, licht);
      if (g.r() < 0.7) g.set(x2, 8, licht);
    }
  }
  tex('stone_bricks', function (g) { g.qn(P.bricks, [10, 18, 34, 24, 14]); ziegelVerband(g, P.bricks); });

  var ZIEGEL = [[122, 62, 48], [146, 78, 60], [168, 94, 74], [186, 110, 88]];
  tex('brick_block', function (g) {
    var moertel = [176, 172, 166];
    g.fill(moertel);
    for (var r = 0; r < 4; r++) {
      var y0 = r * 4, off = (r % 2) ? 4 : 0;
      for (var y = y0; y < y0 + 3; y++) {
        for (var x = 0; x < 16; x++) {
          if (((x + off) % 8) === 7) continue;
          g.set(x, y, ZIEGEL[1 + Math.floor(g.r() * 3)]);
        }
      }
    }
  });

  tex('sand', function (g) { g.qn(P.sand, [4, 26, 42, 23, 5]); });
  tex('sandstone', function (g) {
    g.qn(P.sandstone, [12, 30, 38, 20]);
    for (var y = 0; y < 16; y++) {
      if (y % 5 === 0) for (var x = 0; x < 16; x++) g.set(x, y, P.sandstone[0]);
      if (y % 5 === 1) for (var x2 = 0; x2 < 16; x2++) if (g.r() < 0.8) g.set(x2, y, P.sandstone[3]);
    }
  });
  tex('sandstone_top', function (g) { g.qn(P.sandstone, [8, 26, 40, 26]); });
  tex('sandstone_bottom', function (g) { g.qn(P.sandstone, [26, 38, 26, 10]); });

  tex('gravel', function (g) {
    g.qn(P.gravel, [5, 19, 34, 19, 3, 16]);
    [[2, 3], [8, 2], [13, 6], [4, 8], [10, 10], [1, 13], [7, 13], [14, 12]].forEach(function (p) {
      var w = 2 + Math.floor(g.r() * 2);
      g.wrect(p[0], p[1], w, w - 1, P.gravel[5]);
      for (var x = p[0]; x < p[0] + w; x++) g.wset(x, p[1] + w - 1, P.gravel[0]);
    });
  });

  tex('clay', function (g) { g.qn(P.clay, [16, 34, 32, 18]); });
  tex('snow_block', function (g) { g.qn(P.snow, [18, 52, 30]); });
  tex('bedrock', function (g) { g.qnRun(P.bedrock, [7, 34, 23, 16, 19], 2); });

  tex('ice', function (g) {
    g.qn(P.ice, [16, 34, 32, 18]);
    for (var i = 0; i < g.d.length; i += 4) g.d[i + 3] = 200;
    [[2, 3, 7, 6], [10, 1, 13, 7], [4, 10, 12, 13]].forEach(function (l) {
      var steps = Math.max(Math.abs(l[2] - l[0]), Math.abs(l[3] - l[1]));
      for (var s = 0; s <= steps; s++) {
        g.set(Math.round(l[0] + (l[2] - l[0]) * s / steps),
              Math.round(l[1] + (l[3] - l[1]) * s / steps), P.ice[2], 225);
      }
    });
  });

  tex('obsidian', function (g) {
    g.qn(P.obsidian, [25, 29, 26, 12, 8]);
    [[3, 2, 8, 6], [11, 8, 14, 13], [2, 11, 6, 15]].forEach(function (l) {
      var steps = Math.max(Math.abs(l[2] - l[0]), Math.abs(l[3] - l[1]));
      for (var s = 0; s <= steps; s++) {
        g.set(Math.round(l[0] + (l[2] - l[0]) * s / steps),
              Math.round(l[1] + (l[3] - l[1]) * s / steps), P.obsidian[3]);
      }
    });
    g.set(6, 4, P.obsidian[4]); g.set(12, 10, P.obsidian[4]);
  });

  tex('glowstone', function (g) {
    g.qn(P.glow.slice(0, 3), [30, 42, 28]);
    [[3, 3], [11, 4], [7, 9], [13, 12], [2, 12]].forEach(function (p) {
      g.nest(p[0], p[1], 2.1, [P.glow[3], P.glow[4], P.glow[2]]);
    });
  });

  // ---- Erze ----
  function ore(name, cols, grund) {
    tex(name, function (g) {
      g.copyFrom(data(grund || 'stone'));
      g.r = MC.U.rng(MC.U.hashString(name) ^ 0x51ed);
      var plaetze = [[4, 4], [11, 3], [10, 11], [3, 11]];
      for (var i = 0; i < 4; i++) g.nest(plaetze[i][0], plaetze[i][1], 1.9 + g.r() * 0.9, cols);
      g.wset(7, 7, cols[0]); g.wset(8, 7, cols[2]);
    });
  }
  ore('coal_ore', P.ore.coal);
  ore('iron_ore', P.ore.iron);
  ore('gold_ore', P.ore.gold);
  ore('diamond_ore', P.ore.diamond);
  ore('redstone_ore', P.ore.redstone);
  ore('lapis_ore', P.ore.lapis);
  ore('emerald_ore', P.ore.emerald);

  // ---- Metallbloecke: ruhige Flaeche mit 2px-Fase ----
  function metalBlock(name, base) {
    tex(name, function (g) {
      var r = ramp(base, 0.55);
      g.qn([r.dk, r.bs, r.bs, r.lt], [18, 32, 32, 18]);
      g.frame(0, 0, 16, 16, r.sh);
      g.frame(1, 1, 14, 14, r.hi);
      g.rect(2, 2, 12, 12, r.bs);
      g.qn([r.dk, r.bs, r.lt], [22, 56, 22]);
      g.frame(0, 0, 16, 16, r.sh);
      for (var x = 1; x < 15; x++) { g.set(x, 1, r.hi); g.set(x, 14, r.dk); }
      for (var y = 1; y < 15; y++) { g.set(1, y, r.hi); g.set(14, y, r.dk); }
    });
  }
  metalBlock('iron_block', [212, 212, 214]);
  metalBlock('gold_block', [240, 200, 60]);
  metalBlock('diamond_block', [104, 224, 218]);
  metalBlock('lapis_block', [48, 78, 186]);
  metalBlock('emerald_block', [48, 200, 100]);
  tex('coal_block', function (g) { g.qn(greys([22, 30, 38, 48]), [22, 38, 26, 14]); });

  // ---- Holz ----
  function holz(art, plankenBase, rindeBase, blattTint) {
    var pl = ramp(plankenBase, 0.42).list;
    var pk = [mul(plankenBase, 0.62), mul(plankenBase, 0.78), mul(plankenBase, 0.94),
              mul(plankenBase, 1.06), mul(plankenBase, 1.16), mul(plankenBase, 1.24)];
    var bk = [mul(rindeBase, 0.55), mul(rindeBase, 0.72), mul(rindeBase, 0.88),
              mul(rindeBase, 1.04), mul(rindeBase, 1.22), mul(rindeBase, 1.32)];
    void pl;

    tex('planks_' + art, function (g) {
      for (var y = 0; y < 16; y++) {
        var b = y % 4, tones, w;
        if (b === 3) { tones = [pk[0], pk[1]]; w = [70, 30]; }
        else if (b === 0) { tones = [pk[3], pk[4], pk[5]]; w = [26, 42, 32]; }
        else if (b === 1) { tones = [pk[2], pk[3], pk[4]]; w = [30, 44, 26]; }
        else { tones = [pk[1], pk[2], pk[3]]; w = [24, 46, 30]; }
        var sum = 0, cum = [];
        for (var i = 0; i < tones.length; i++) { sum += w[i]; cum.push(sum); }
        for (var x = 0; x < 16; x++) {
          var v = g.r() * sum, j = 0;
          while (j < tones.length - 1 && v > cum[j]) j++;
          g.set(x, y, tones[j]);
        }
      }
      g.wrect(5, 1, 2, 2, pk[1]); g.wset(5, 1, pk[0]);
      g.wrect(12, 9, 2, 2, pk[1]); g.wset(12, 9, pk[0]);
    });

    tex('log_' + art, function (g) {
      for (var x = 0; x < 16; x++) {
        var band = x % 3;
        var tones = band === 0 ? [bk[0], bk[1], bk[2]] : (band === 1 ? [bk[2], bk[3], bk[4]] : [bk[3], bk[4], bk[5]]);
        for (var y = 0; y < 16; y++) g.set(x, y, tones[Math.floor(g.r() * 3)]);
      }
      [1, 6, 11].forEach(function (x0) {
        for (var y = 0; y < 16; y++) {
          var xx = x0 + ((y + x0) % 6 === 0 ? 1 : 0);
          g.wset(xx, y, bk[0]); g.wset(xx + 1, y, bk[4]);
        }
      });
    });

    tex('log_' + art + '_top', function (g) {
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var d = Math.sqrt((x - 7.5) * (x - 7.5) + (y - 7.5) * (y - 7.5));
        if (d > 7.3) { g.set(x, y, bk[1 + Math.floor(g.r() * 2)]); continue; }
        if (d > 6.3) { g.set(x, y, bk[3 + Math.floor(g.r() * 2)]); continue; }
        var ring = Math.abs((d % 2.4) - 1.2);
        g.set(x, y, ring < 0.45 ? pk[2 + Math.floor(g.r() * 2)] : pk[3 + Math.floor(g.r() * 3)]);
      }
      g.set(7, 7, pk[5]); g.set(8, 7, pk[4]);
    });

    if (blattTint) {
      tex('leaves_' + art, function (g) {
        g.qn(P.leafGrey, [46, 14, 22, 18]);
        for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
          if (g.r() < 0.055) {
            g.set(x, y, [0, 0, 0], 0);
            if (g.r() < 0.5) g.set(x + 1, y, [0, 0, 0], 0);
            if (g.r() < 0.35) g.set(x, y + 1, [0, 0, 0], 0);
          }
        }
        g.tint(blattTint);
      });
    }
  }
  holz('oak', [168, 138, 82], [104, 82, 48], P.tintLeaf);
  holz('birch', [206, 190, 140], [206, 204, 198], [128, 190, 72]);
  holz('spruce', [118, 88, 50], [64, 46, 26], [72, 132, 62]);

  // ---- Wolle: ein Motiv, 16 Rampen ----
  var woolCols = {
    white: [234, 236, 236], orange: [232, 118, 28], magenta: [186, 74, 176], light_blue: [62, 172, 214],
    yellow: [242, 196, 48], lime: [116, 182, 36], pink: [232, 144, 172], gray: [62, 68, 71],
    light_gray: [142, 142, 134], cyan: [28, 136, 144], purple: [120, 48, 168], blue: [56, 62, 156],
    brown: [114, 74, 44], green: [86, 108, 34], red: [158, 44, 38], black: [22, 23, 27]
  };
  Object.keys(woolCols).forEach(function (k) {
    tex('wool_' + k, function (g) {
      var r = ramp(woolCols[k], 0.34);
      g.qn([r.dk, r.bs, r.bs, r.lt], [20, 30, 30, 20]);
    });
  });

  // ---- Glas / Fluessigkeiten ----
  tex('glass', function (g) {
    g.fill([255, 255, 255], 0);
    g.frame(0, 0, 16, 16, [214, 236, 242], 180);
    g.frame(1, 1, 14, 14, [188, 218, 228], 60);
    [[4, 3], [10, 5], [6, 11]].forEach(function (p) {
      g.set(p[0], p[1], [255, 255, 255], 130); g.set(p[0] + 1, p[1], [255, 255, 255], 90);
    });
  });

  tex('water', function (g) {
    var W = [[52, 96, 168], [58, 108, 186], [66, 122, 202], [82, 142, 218]];
    g.qn(W, [18, 36, 30, 16]);
    for (var i = 0; i < g.d.length; i += 4) g.d[i + 3] = 190;
    for (var k = 0; k < 4; k++) for (var x = 0; x < 16; x++) {
      g.wset(x, 2 + k * 4 + Math.round(Math.sin((x + k * 4) * 0.6) * 1.3), W[3], 200);
    }
  });

  var LAVA = [[78, 26, 10], [122, 44, 12], [176, 70, 16], [220, 108, 24], [248, 168, 48]];
  tex('lava', function (g) {
    g.qn(LAVA.slice(0, 3), [30, 40, 30]);
    [[3, 4], [10, 2], [6, 10], [13, 9], [1, 12]].forEach(function (p) {
      g.nest(p[0], p[1], 1.9, [LAVA[3], LAVA[4], LAVA[1]]);
    });
  });

  // ---- Funktionsbloecke ----
  // Fackel: Stiel exakt in Spalte 7..8, Flamme Zeile 6..7 - der Mesher
  // bildet genau diesen Ausschnitt auf den 2x10x2-Quader ab.
  tex('torch', function (g) {
    g.fill([0, 0, 0], 0);
    for (var y = 8; y < 16; y++) { g.set(7, y, P.planks[4]); g.set(8, y, P.planks[2]); }
    g.set(7, 10, P.planks[3]); g.set(8, 13, P.planks[1]);
    g.set(7, 7, [252, 172, 44]); g.set(8, 7, [244, 140, 28]);
    g.set(7, 6, [255, 246, 186]); g.set(8, 6, [255, 216, 112]);
  });

  tex('crafting_table_top', function (g) {
    g.copyFrom(data('planks_oak'));
    g.frame(0, 0, 16, 16, P.planks[0]);
    for (var y = 3; y < 15; y += 4) for (var x = 1; x < 15; x++) g.set(x, y, P.planks[1]);
    for (var x2 = 4; x2 < 15; x2 += 5) for (var y2 = 1; y2 < 15; y2++) g.set(x2, y2, P.planks[1]);
  });
  tex('crafting_table_side', function (g) {
    g.copyFrom(data('planks_oak'));
    g.rect(1, 3, 6, 5, P.planks[1]); g.frame(1, 3, 6, 5, P.planks[0]);
    g.rect(9, 3, 6, 5, P.planks[1]); g.frame(9, 3, 6, 5, P.planks[0]);
    g.rect(2, 10, 12, 4, P.planks[2]);
  });
  tex('crafting_table_front', function (g) {
    g.copyFrom(data('planks_oak'));
    g.rect(2, 2, 12, 5, P.planks[1]); g.frame(2, 2, 12, 5, P.planks[0]);
    g.rect(3, 3, 4, 3, P.planks[0]); g.rect(9, 3, 4, 3, P.planks[0]);
    g.rect(2, 9, 12, 5, P.planks[3]); g.frame(2, 9, 12, 5, P.planks[0]);
  });

  tex('furnace_top', function (g) { g.qnRun(P.stone, [7, 28, 46, 20], 3); g.frame(0, 0, 16, 16, P.cobble[1]); });
  tex('furnace_side', function (g) { g.qnRun(P.stone, [7, 28, 46, 20], 3); });
  function ofenFront(g, an) {
    g.qnRun(P.stone, [7, 28, 46, 20], 3);
    g.rect(3, 3, 10, 2, P.cobble[3]);
    g.rect(3, 5, 10, 8, P.cobble[1]);
    g.rect(4, 6, 8, 6, an ? [32, 20, 12] : [38, 38, 40]);
    if (an) {
      for (var i = 0; i < 26; i++) {
        g.set(4 + ((g.r() * 8) | 0), 8 + ((g.r() * 4) | 0), i % 3 ? LAVA[4] : [255, 232, 140]);
      }
    }
    for (var x = 4; x < 12; x++) g.set(x, 5, P.cobble[0]);
  }
  tex('furnace_front', function (g) { ofenFront(g, false); });
  tex('furnace_front_lit', function (g) { ofenFront(g, true); });

  var TRUHE = [[92, 62, 30], [122, 88, 44], [150, 112, 58], [172, 132, 72]];
  tex('chest_top', function (g) {
    g.qn(TRUHE.slice(1), [26, 44, 30]);
    g.frame(0, 0, 16, 16, TRUHE[0]); g.rect(1, 1, 14, 3, TRUHE[1]);
  });
  function truheSeite(g, front) {
    g.qn(TRUHE.slice(1), [26, 44, 30]);
    g.frame(0, 0, 16, 16, TRUHE[0]);
    for (var x = 0; x < 16; x++) { g.set(x, 5, TRUHE[0]); g.set(x, 6, TRUHE[1]); }
    if (front) {
      g.rect(7, 4, 3, 4, [58, 48, 30]);
      g.rect(7, 5, 3, 2, [226, 196, 92]);
      g.set(8, 6, [124, 100, 34]);
    }
  }
  tex('chest_side', function (g) { truheSeite(g, false); });
  tex('chest_front', function (g) { truheSeite(g, true); });

  var TNT = [[142, 40, 34], [168, 52, 44], [196, 66, 56]];
  tex('tnt_side', function (g) {
    g.qn(TNT, [24, 44, 32]);
    g.rect(0, 4, 16, 5, [230, 230, 232]);
    for (var x = 2; x < 14; x++) g.set(x, 6, [38, 38, 42]);
    g.rect(4, 5, 2, 3, [38, 38, 42]); g.rect(10, 5, 2, 3, [38, 38, 42]);
    g.rect(0, 0, 16, 2, TNT[0]); g.rect(0, 14, 16, 2, TNT[0]);
  });
  tex('tnt_top', function (g) {
    g.qn(TNT, [20, 42, 38]); g.rect(5, 5, 6, 6, [230, 230, 232]); g.frame(5, 5, 6, 6, [52, 52, 56]);
  });
  tex('tnt_bottom', function (g) { g.qn(TNT, [46, 38, 16]); });

  // ---- Brauen ----
  function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }

  // Eine Flasche, gefüllt mit der Farbe des Tranks. Alles aus einer Quelle,
  // damit die neun Tränke nicht auseinanderlaufen.
  function flasche(g, farbe) {
    g.fill([0, 0, 0], 0);
    var GLAS = [[196, 208, 214], [156, 170, 178], [116, 130, 140]];
    // Bauch
    for (var y = 7; y < 15; y++) {
      for (var x = 3; x < 13; x++) {
        var dx = x - 8, dy = y - 11;
        if (dx * dx * 1.1 + dy * dy > 22) continue;
        g.set(x, y, farbe ? (g.r() < 0.25 ? mul(farbe, 1.25) : farbe) : GLAS[1]);
      }
    }
    // Glasrand und Hals
    for (var y2 = 7; y2 < 15; y2++) {
      for (var x2 = 3; x2 < 13; x2++) {
        var ddx = x2 - 8, ddy = y2 - 11;
        var d = ddx * ddx * 1.1 + ddy * ddy;
        if (d > 22 || d < 15) continue;
        g.set(x2, y2, GLAS[2]);
      }
    }
    g.rect(6, 3, 4, 4, GLAS[1]);
    g.rect(6, 3, 1, 4, GLAS[2]); g.rect(9, 3, 1, 4, GLAS[2]);
    g.rect(5, 1, 6, 2, GLAS[0]);
    g.set(5, 9, GLAS[0]); g.set(5, 10, GLAS[0]);
  }
  tex('glass_bottle', function (g) { flasche(g, null); });
  tex('potion_water', function (g) { flasche(g, [56, 92, 180]); });
  Object.keys(MC.Effekte.TRAENKE).forEach(function (k) {
    tex('potion_' + k, function (g) { flasche(g, hex(MC.Effekte.TRAENKE[k].farbe)); });
  });

  tex('nether_wart_item', function (g) {
    g.fill([0, 0, 0], 0);
    var W = [[122, 24, 30], [156, 34, 40], [92, 18, 24]];
    for (var i = 0; i < 46; i++) {
      var x = 4 + ((g.r() * 8) | 0), y = 4 + ((g.r() * 9) | 0);
      g.set(x, y, W[(g.r() * 3) | 0]);
    }
    g.rect(7, 12, 2, 3, [70, 44, 30]);
  });
  tex('ghast_tear', function (g) {
    g.fill([0, 0, 0], 0);
    var T2 = [[196, 226, 220], [230, 246, 244], [150, 186, 184]];
    for (var y = 4; y < 14; y++) {
      var br = Math.round((y - 3) * 0.55);
      for (var x = 8 - br; x <= 8 + br; x++) g.set(x, y, T2[(g.r() * 3) | 0]);
    }
    g.set(7, 9, T2[1]); g.set(8, 3, T2[2]);
  });

  var STAND = [[112, 100, 88], [138, 124, 108], [92, 82, 72]];
  tex('brewing_stand_base', function (g) { g.qn(STAND, [26, 40, 30]); });
  tex('brewing_stand_side', function (g) {
    g.qn(STAND, [26, 40, 30]);
    g.rect(6, 0, 4, 16, [86, 86, 92]);
    g.rect(0, 12, 16, 4, STAND[2]);
  });
  tex('brewing_stand_top', function (g) {
    g.qn(STAND, [24, 42, 30]);
    g.rect(6, 6, 4, 4, [214, 168, 74]);
    g.frame(6, 6, 4, 4, [140, 106, 44]);
  });

  tex('map', function (g) {
    g.fill([0, 0, 0], 0);
    var PAP = [[226, 218, 194], [206, 196, 168], [184, 172, 142]];
    for (var y = 2; y < 14; y++) for (var x = 2; x < 14; x++) g.set(x, y, PAP[(g.r() * 3) | 0]);
    g.frame(2, 2, 12, 12, [138, 118, 88]);
    g.frame(3, 3, 10, 10, [166, 150, 118]);
    var K2 = [[92, 138, 66], [58, 92, 168]];
    for (var i = 0; i < 22; i++) {
      g.set(4 + ((g.r() * 8) | 0), 4 + ((g.r() * 8) | 0), K2[(g.r() * 2) | 0]);
    }
    g.set(8, 8, [176, 40, 40]);
  });

  tex('aechor_petal', function (g) {
    g.fill([0, 0, 0], 0);
    var r = ramp([196, 96, 176], 0.7);
    for (var y = 4; y < 13; y++) for (var x = 4; x < 13; x++) {
      var dx = x - 8, dy = y - 8;
      if (dx * dx + dy * dy > 18) continue;
      g.set(x, y, [r.dk, r.bs, r.lt][(g.r() * 3) | 0]);
    }
    g.rect(7, 7, 3, 3, [246, 228, 120]);
  });

  tex('slimeball', function (g) {
    g.fill([0, 0, 0], 0);
    var S = [[104, 168, 92], [130, 196, 114], [86, 142, 78], [160, 214, 140]];
    for (var y = 3; y < 13; y++) {
      for (var x = 3; x < 13; x++) {
        var dx = x - 8, dy = y - 8;
        if (dx * dx + dy * dy > 26) continue;
        g.set(x, y, S[(g.r() * 3) | 0]);
      }
    }
    g.set(6, 6, S[3]); g.set(7, 6, S[3]); g.set(6, 7, S[3]);
  });

  // Kolben: Fichtenholz mit Eisenbeschlag
  var KOLB = [[126, 106, 74], [148, 126, 90], [168, 146, 106], [188, 166, 124]];
  var EISEN = [[92, 92, 98], [116, 116, 124], [140, 140, 150]];
  tex('piston_side', function (g) {
    g.qn(KOLB, [20, 36, 30, 14]);
    for (var y = 0; y < 16; y++) { g.set(0, y, mul(KOLB[0], 0.8)); g.set(15, y, mul(KOLB[0], 0.8)); }
    g.rect(0, 0, 16, 3, EISEN[1]); g.rect(0, 13, 16, 3, EISEN[1]);
    for (var i = 0; i < 12; i++) g.set((g.r() * 16) | 0, (g.r() * 3) | 0, EISEN[0]);
  });
  tex('piston_back', function (g) { g.qn(KOLB, [24, 34, 28, 14]); g.frame(0, 0, 16, 16, mul(KOLB[0], 0.8)); });
  tex('piston_inner', function (g) { g.qn(KOLB.slice(0, 2), [40, 60]); g.frame(0, 0, 16, 16, [70, 58, 40]); });
  tex('piston_arm', function (g) {
    g.qn(KOLB.slice(1), [30, 40, 30]);
    g.rect(5, 0, 6, 16, EISEN[1]);
    g.rect(5, 0, 1, 16, EISEN[0]); g.rect(10, 0, 1, 16, EISEN[2]);
  });
  tex('piston_face', function (g) {
    g.qn(KOLB.slice(1), [28, 40, 32]);
    g.frame(0, 0, 16, 16, EISEN[0]);
    g.frame(1, 1, 14, 14, EISEN[1]);
    for (var i = 0; i < 4; i++) g.frame(3 + i, 3 + i, 10 - 2 * i, 10 - 2 * i, i % 2 ? KOLB[1] : KOLB[3]);
  });
  tex('piston_face_sticky', function (g) {
    g.copyFrom(data('piston_face'));
    // Klebefläche: grüner Schleim in der Mitte
    var S = [[104, 168, 92], [130, 196, 114], [86, 142, 78]];
    for (var y = 3; y < 13; y++) for (var x = 3; x < 13; x++) g.set(x, y, S[(g.r() * 3) | 0]);
    g.frame(3, 3, 10, 10, S[2]);
  });

  // Beobachter: dunkler Stein, vorne das Auge, hinten die Kontaktflaeche
  tex('observer_side', function (g) {
    g.qn([[58, 58, 64], [72, 72, 80], [88, 88, 96]], [26, 40, 30]);
    g.rect(0, 6, 16, 4, [46, 46, 52]);
  });
  tex('observer_face', function (g) {
    g.qn([[58, 58, 64], [72, 72, 80]], [40, 40]);
    g.rect(3, 3, 10, 10, [34, 34, 40]);
    g.rect(5, 6, 6, 4, [212, 212, 220]);
    g.rect(7, 7, 2, 2, [30, 30, 34]);
  });
  tex('observer_back', function (g) {
    g.qn([[58, 58, 64], [72, 72, 80]], [40, 40]);
    g.rect(6, 6, 4, 4, [120, 40, 40]);
    g.frame(6, 6, 4, 4, [70, 24, 24]);
  });
  tex('observer_back_lit', function (g) {
    g.copyFrom(data('observer_back'));
    g.rect(6, 6, 4, 4, [244, 72, 60]);
    g.frame(6, 6, 4, 4, [180, 40, 34]);
  });

  // Spinnwebe: ein Netz aus hellen Fäden auf durchsichtigem Grund
  tex('cobweb', function (g) {
    g.fill([0, 0, 0], 0);
    var F = [[214, 214, 220], [166, 166, 176]];
    var mitte = 8;
    for (var a = 0; a < 8; a++) {
      var w = a / 8 * Math.PI * 2;
      for (var r = 0; r < 9; r++) {
        g.set(mitte + Math.round(Math.cos(w) * r), mitte + Math.round(Math.sin(w) * r), F[r % 2]);
      }
    }
    // Querfäden als grobe Ringe
    [3, 6, 8].forEach(function (r) {
      for (var s = 0; s < 32; s++) {
        var w2 = s / 32 * Math.PI * 2;
        g.set(mitte + Math.round(Math.cos(w2) * r), mitte + Math.round(Math.sin(w2) * r), F[1]);
      }
    });
  });

  // Spawner: dunkles Gitter, dahinter Schwärze
  tex('spawner', function (g) {
    g.fill([16, 18, 20], 255);
    var S = [[52, 58, 62], [72, 80, 86], [38, 42, 46]];
    for (var i = 0; i < 16; i += 3) {
      for (var k = 0; k < 16; k++) {
        g.set(i, k, S[(g.r() * 2) | 0]);
        g.set(k, i, S[(g.r() * 2) | 0]);
      }
    }
    g.frame(0, 0, 16, 16, S[2]);
    // die Figur im Käfig, angedeutet
    g.rect(6, 6, 4, 3, [56, 96, 60]);
    g.rect(7, 9, 2, 3, [48, 72, 110]);
  });

  // Amboss: dunkles, unregelmäßig gehämmertes Eisen. Die Bahn oben ist heller
  // und bekommt mit jedem Zustand mehr Kerben.
  var AMB = [[36, 36, 40], [52, 52, 58], [68, 68, 76], [88, 88, 98]];
  tex('anvil_side', function (g) {
    g.qn(AMB, [22, 38, 28, 12]);
    for (var x = 0; x < 16; x++) { g.set(x, 0, AMB[0]); g.set(x, 15, mul(AMB[0], 0.8)); }
    for (var i = 0; i < 10; i++) g.set((g.r() * 16) | 0, 2 + ((g.r() * 12) | 0), AMB[0]);
  });
  [0, 1, 2].forEach(function (stufe) {
    tex('anvil_top' + (stufe ? '_' + stufe : ''), function (g) {
      g.qn(AMB.slice(1), [26, 42, 32]);
      g.frame(0, 0, 16, 16, AMB[0]);
      g.rect(3, 3, 10, 10, AMB[3]);
      // Kerben: je beschädigter, desto mehr
      var n = stufe * 9;
      for (var i = 0; i < n; i++) {
        var kx = 2 + ((g.r() * 12) | 0), ky = 2 + ((g.r() * 12) | 0);
        g.set(kx, ky, AMB[0]);
        if (g.r() < 0.6) g.set(kx + 1, ky, mul(AMB[0], 0.8));
      }
    });
  });

  // Zaubertisch: Obsidianblock, oben mit einer roten Buchdecke, an den Seiten
  // ein schmaler Streifen aus demselben Rot – so ist er von weitem zu erkennen.
  var BUCH = [[74, 16, 20], [110, 26, 30], [146, 40, 44], [178, 62, 62]];
  tex('enchanting_table_side', function (g) {
    g.copyFrom(data('obsidian'));
    for (var x = 0; x < 16; x++) {
      for (var y = 2; y < 5; y++) g.set(x, y, BUCH[1 + ((g.r() * 3) | 0)]);
      g.set(x, 1, mul(BUCH[0], 0.7));
      g.set(x, 5, mul(BUCH[0], 0.7));
    }
    for (var i = 0; i < 8; i++) g.set((g.r() * 16) | 0, 2 + ((g.r() * 3) | 0), [214, 190, 120]);
  });
  tex('enchanting_table_top', function (g) {
    g.copyFrom(data('obsidian'));
    // aufgeschlagenes Buch: zwei helle Seiten mit dunklem Bund
    g.rect(2, 4, 12, 8, BUCH[2]);
    g.frame(2, 4, 12, 8, BUCH[0]);
    g.rect(3, 5, 5, 6, [226, 214, 178]);
    g.rect(9, 5, 5, 6, [226, 214, 178]);
    g.rect(8, 4, 1, 8, BUCH[0]);
    for (var i = 0; i < 14; i++) {
      var sx = g.r() < 0.5 ? 4 : 10;
      g.set(sx + ((g.r() * 3) | 0), 6 + ((g.r() * 4) | 0), [150, 140, 118]);
    }
  });

  tex('bookshelf', function (g) {
    g.copyFrom(data('planks_oak'));
    var bookCols = [[154, 56, 50], [64, 96, 160], [186, 160, 74], [74, 136, 74], [144, 84, 156], [176, 116, 56]];
    [1, 9].forEach(function (row) {
      var x = 1;
      while (x < 15) {
        var w = 1 + ((g.r() * 2) | 0);
        var c = bookCols[(g.r() * bookCols.length) | 0];
        for (var xx = x; xx < x + w && xx < 15; xx++)
          for (var y = row; y < row + 6; y++) g.set(xx, y, y === row ? mul(c, 0.68) : c);
        x += w + 1;
      }
    });
  });

  // ---- Pflanzen und Natur ----
  tex('cactus_side', function (g) {
    var K = [[36, 88, 40], [46, 108, 48], [58, 128, 56], [72, 148, 66]];
    g.qn(K.slice(1), [28, 44, 28]);
    g.rect(0, 0, 1, 16, K[0]); g.rect(15, 0, 1, 16, K[0]);
    for (var i = 0; i < 10; i++) g.set(2 + ((g.r() * 12) | 0), (g.r() * 16) | 0, [196, 210, 170]);
  });
  tex('cactus_top', function (g) {
    var K = [[46, 108, 48], [58, 128, 56], [76, 152, 68]];
    g.qn(K, [26, 44, 30]); g.nest(8, 8, 3.4, [K[2], [96, 172, 82], K[0]]);
  });
  tex('cactus_bottom', function (g) { g.qn([[32, 78, 36], [42, 96, 44], [52, 114, 50]], [30, 44, 26]); });

  var KUERBIS = [[152, 92, 22], [178, 110, 26], [202, 128, 32], [220, 146, 40]];
  tex('pumpkin_top', function (g) {
    g.qn(KUERBIS.slice(1), [26, 44, 30]);
    g.rect(6, 6, 4, 4, [96, 128, 52]); g.frame(6, 6, 4, 4, [68, 96, 38]);
  });
  function kuerbisSeite(g, gesicht) {
    g.qn(KUERBIS.slice(1), [26, 44, 30]);
    for (var x = 0; x < 16; x += 3) for (var y = 0; y < 16; y++) g.set(x, y, KUERBIS[0]);
    g.rect(0, 0, 16, 2, mul(KUERBIS[0], 0.86));
    if (gesicht) {
      var dk = [52, 30, 8];
      g.rect(3, 5, 3, 3, dk); g.rect(10, 5, 3, 3, dk);
      g.set(4, 8, dk); g.set(11, 8, dk);
      g.rect(4, 10, 8, 2, dk);
      g.set(5, 12, dk); g.set(8, 12, dk); g.set(10, 12, dk);
    }
  }
  tex('pumpkin_side', function (g) { kuerbisSeite(g, false); });
  tex('pumpkin_face', function (g) { kuerbisSeite(g, true); });

  function crossPlant(name, fn) { tex(name, function (g) { g.fill([0, 0, 0], 0); fn(g); }); }

  var GG = P.grassGrey;
  var GRAS_ART = [
    '................', '................', '.....d.......d..', '....dm......dm..',
    '..d.dm..m....m..', '..dm.m.dm...dm..', '.dm..m.dm..dm...', '.dm.dm.lm..dm...',
    'dm..dm.lm.dm....', 'dm..lm.lm.lm..d.', 'lm..lm.lm.lm.dm.', 'lm.dlm.lm.lm.lm.',
    'lm.llm.lm.lm.lm.', 'll.lll.ll.ll.ll.', '.l..ll.l..l..l..', '................'
  ];
  crossPlant('tall_grass', function (g) {
    g.art(GRAS_ART, { d: GG[2], m: GG[4], l: GG[6] });
    g.tint(P.tintPlant);
  });

  crossPlant('dead_bush', function (g) {
    g.art([
      '................', '................', '.......d........', '....d..d....d...',
      '.....d.d...d....', '.....dbd..d.....', '......bd.d......', '......bbd.......',
      '.....d.bb.......', '....d..b..d.....', '.......bd.d.....', '.......b.d......',
      '.......b........', '.......b........', '......dbd.......', '................'
    ], { b: [126, 96, 52], d: [88, 66, 36] });
  });

  var BLUME_ART = [
    '................', '................', '.....OOOO.......', '....OHHHLO......',
    '...OHHMMMLO.....', '...OHMCCMMLO....', '...OHMCCMMLO....', '...OhMMMMMLO....',
    '....OhhhhMO.....', '.....OhhO.......', '.......s........', '....l..s........',
    '...lm..s..l.....', '....d..s.dm.....', '.......s.d......', '.......s........'
  ];
  function flower(name, petal, center) {
    crossPlant(name, function (g) {
      var p = ramp(petal, 1.15);
      g.art(BLUME_ART, {
        O: P.kontur, H: p.hi, L: p.lt, M: p.bs, C: center, h: p.dk,
        s: [72, 118, 46], l: [122, 176, 74], m: [96, 148, 58], d: [64, 104, 40]
      });
    });
  }
  flower('flower_red', [200, 40, 38], [248, 216, 92]);
  flower('flower_yellow', [236, 196, 44], [252, 248, 208]);
  flower('flower_blue', [74, 104, 216], [214, 226, 252]);

  crossPlant('mushroom_red', function (g) {
    var m = ramp([198, 46, 42], 1.2), st = ramp([226, 218, 202], 1.1);
    g.art([
      '................', '................', '.....OOOOOO.....', '...OOHHHHHHOO...',
      '..OHHMwMMwMHHO..', '..OHMMMMMMMMHO..', '.OHMMwMMMMwMMHO.', '.OHMMMMMMMMMMHO.',
      '.OhhhhhhhhhhhhO.', '...OsSSSSsO.....', '....OsSSsO......', '....OsSSsO......',
      '....OsSSsO......', '....OsSSsO......', '...OSSSSSSO.....', '....OOOOOO......'
    ], { O: P.kontur, H: m.hi, M: m.bs, h: m.dk, w: [252, 250, 244], s: st.dk, S: st.bs });
  });
  crossPlant('mushroom_brown', function (g) {
    var m = ramp([154, 112, 74], 1.2), st = ramp([214, 202, 182], 1.1);
    g.art([
      '................', '................', '................', '.....OOOOOO.....',
      '...OOHHHHHHOO...', '..OHMMMMMMMMHO..', '.OHMMMMMMMMMMHO.', '.OhhhhhhhhhhhhO.',
      '...OsSSSSSsO....', '....OsSSSsO.....', '....OsSSSsO.....', '....OsSSSsO.....',
      '....OsSSSsO.....', '....OsSSSsO.....', '...OSSSSSSSO....', '....OOOOOOO.....'
    ], { O: P.kontur, H: m.hi, M: m.bs, h: m.dk, s: st.dk, S: st.bs });
  });

  var SETZLING_ART = [
    '................', '.......OO.......', '.....OOllOO.....', '....OlmmmmlO....',
    '...OlmmMmmmlO...', '...OmmMMMmmdO...', '..OlmMMMMMmdO...', '..OmmMMMMMddO...',
    '...OdMMMMMdO....', '....OdddddO.....', '......OWO.......', '......OWO.......',
    '......OWO.......', '.....OvWO.......', '.....OvvO.......', '......OO........'
  ];
  function sapling(name, leafBase, stammHell, stammDunkel) {
    crossPlant(name, function (g) {
      var l = ramp(leafBase, 1.15);
      g.art(SETZLING_ART, {
        O: P.kontur, l: l.lt, m: l.bs, M: l.dk, d: l.sh, W: stammHell, v: stammDunkel
      });
    });
  }
  sapling('sapling_oak', [96, 156, 54], P.bark[4], P.bark[1]);
  sapling('sapling_birch', [128, 178, 66], [206, 204, 198], [138, 136, 130]);
  sapling('sapling_spruce', [64, 118, 58], [96, 70, 40], [58, 42, 24]);

  crossPlant('sugar_cane', function (g) {
    var S = [[108, 162, 78], [128, 182, 94], [148, 200, 110]];
    for (var x = 6; x < 10; x++) for (var y = 0; y < 16; y++) g.set(x, y, S[Math.min(2, x - 6)]);
    for (var y2 = 0; y2 < 16; y2 += 5) for (var x2 = 6; x2 < 10; x2++) g.set(x2, y2, [92, 142, 66]);
  });

  tex('farmland', function (g) {
    g.qn([mul(P.dirt[0], 0.9), mul(P.dirt[1], 0.9), mul(P.dirt[2], 0.9)], [22, 44, 34]);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) if (x % 5 === 0) g.set(x, y, mul(P.dirt[0], 0.72));
  });

  for (var ws = 0; ws < 4; ws++) {
    (function (s) {
      crossPlant('wheat_stage' + s, function (g) {
        var col = s < 2 ? [86, 152, 56] : (s === 2 ? [156, 176, 66] : [212, 188, 88]);
        var hell = mul(col, 1.18), dunkel = mul(col, 0.78);
        var h = 5 + s * 3;
        for (var x = 2; x < 15; x += 4) {
          for (var y = 15; y > 15 - h; y--) g.set(x, y, y % 2 ? col : hell);
          g.set(x, 15, dunkel);
          if (s >= 2) { g.set(x - 1, 15 - h + 1, col); g.set(x + 1, 15 - h + 2, col); }
        }
      });
    })(ws);
  }

  var BETT = [[152, 42, 40], [174, 52, 48], [192, 64, 58]];
  tex('bed_top', function (g) {
    g.qn(BETT, [24, 46, 30]);
    g.rect(2, 1, 12, 5, [232, 232, 234]);
    g.frame(0, 0, 16, 16, mul(BETT[0], 0.84));
  });
  tex('bed_side', function (g) {
    g.qn(BETT, [24, 46, 30]);
    g.rect(0, 10, 16, 6, P.planks[3]);
    g.rect(0, 0, 16, 3, [226, 226, 228]);
  });

  // ---- Zerstoerungsstadien: Sternfraktur aus der Blockmitte ----
  var ARME = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
  for (var cs = 0; cs < 10; cs++) {
    (function (s) {
      tex('crack_' + s, function (g) {
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

  // ---- Himmel ----
  tex('sun', function (g) { g.fill([255, 246, 206]); });
  tex('moon', function (g) {
    g.qn(greys([204, 214, 224, 232]), [12, 24, 40, 24]);
    g.nest(5, 6, 2, [greys([196])[0], greys([188])[0], greys([206])[0]]);
    g.nest(11, 10, 2, [greys([200])[0], greys([192])[0], greys([210])[0]]);
  });
  tex('cloud', function (g) {
    g.fill([255, 255, 255], 0);
    var rr = MC.U.rng(77);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var d = Math.sqrt((x - 8) * (x - 8) + (y - 8) * (y - 8));
      if (d < 6 + rr() * 2.5) g.set(x, y, [255, 255, 255], 205);
    }
  });
  tex('white', function (g) { g.fill([255, 255, 255]); });

  // ============================================================
  //  NETHER
  // ============================================================
  tex('netherrack', function (g) {
    g.qn(P.netherrack, [5, 18, 7, 28, 27]);
    for (var x = 0; x < 16; x += 3) for (var y = 0; y < 16; y++) {
      if ((y + x) % 5 !== 0) g.wset(x, y, P.netherrack[0]);
    }
  });
  tex('soul_sand', function (g) {
    var S = [[54, 40, 32], [68, 50, 40], [84, 64, 52], [96, 74, 60]];
    g.qn(S, [16, 30, 34, 20]);
    for (var i = 0; i < 3; i++) {
      var cx = 3 + ((g.r() * 10) | 0), cy = 3 + ((g.r() * 10) | 0);
      g.nest(cx, cy, 1.8, [S[0], S[1], [40, 28, 22]]);
      g.wset(cx - 1, cy - 1, [36, 26, 20]); g.wset(cx + 1, cy - 1, [36, 26, 20]);
      g.wset(cx, cy + 1, [36, 26, 20]);
    }
  });
  ore('quartz_ore', P.ore.quartz, 'netherrack');
  tex('quartz_block', function (g) { g.qn(P.quartz.slice(2), [22, 34, 30, 14]); });
  tex('nether_bricks', function (g) {
    var N = [[52, 26, 30], [70, 36, 42], [88, 48, 54], [106, 60, 66], [122, 72, 78]];
    g.qn(N.slice(1), [22, 34, 30, 14]);
    for (var y = 0; y < 16; y += 4) {
      for (var x = 0; x < 16; x++) g.set(x, y, N[0]);
      var off = (y % 8 === 0) ? 0 : 8;
      for (var k = 0; k < 16; k += 8) g.wrect(((k + off) % 16), y + 1, 1, 3, N[0]);
    }
  });
  tex('magma_block', function (g) {
    var M = [[48, 20, 14], [64, 26, 18], [82, 34, 22]];
    g.qn(M, [30, 40, 30]);
    [[3, 3], [10, 4], [6, 11], [13, 10]].forEach(function (p) {
      g.nest(p[0], p[1], 2.0, [LAVA[3], LAVA[4], LAVA[2]]);
    });
  });
  tex('portal_nether', function (g) {
    var V = [[48, 12, 78], [72, 26, 118], [104, 46, 168], [148, 84, 214], [196, 148, 244]];
    g.qn(V, [22, 26, 24, 18, 10]);
  });

  // ============================================================
  //  AETHER
  // ============================================================
  var AE_TINT = [150, 226, 200];
  tex('aether_grass_top', function (g) {
    g.qn(P.grassGrey, [4, 9, 14, 18, 18, 14, 9, 4]); g.tint(AE_TINT);
  });
  tex('aether_dirt', function (g) {
    g.qn([[112, 96, 80], [134, 116, 96], [156, 134, 112], [178, 154, 128]], [14, 40, 30, 16]);
  });
  tex('aether_grass_side', function (g) { grasSeite(g, AE_TINT, 'aether_dirt'); });

  var HOLY = greys([168, 184, 198, 212, 226]);
  tex('holystone', function (g) { g.qnRun(HOLY, [8, 24, 40, 20, 8], 3); });
  tex('mossy_holystone', function (g) {
    g.copyFrom(data('holystone'));
    var moos = [[118, 158, 108], [138, 176, 122], [158, 194, 138]];
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      if (g.r() < 0.34) g.set(x, y, moos[Math.floor(g.r() * 3)]);
    }
  });
  tex('holystone_bricks', function (g) { g.qn(HOLY, [10, 20, 36, 22, 12]); ziegelVerband(g, HOLY); });
  tex('quicksoil', function (g) {
    g.qn([[220, 206, 138], [232, 220, 156], [242, 232, 176], [250, 242, 198]], [14, 32, 34, 20]);
  });
  tex('icestone', function (g) {
    g.qn([[164, 200, 224], [180, 212, 234], [196, 224, 242], [212, 236, 250]], [16, 32, 32, 20]);
  });
  ore('ambrosium_ore', P.ore.ambrosium, 'holystone');
  ore('gravitite_ore', P.ore.gravitite, 'holystone');
  ore('zanite_ore', P.ore.zanite, 'netherrack');

  holz('skyroot', [166, 156, 140], [116, 106, 94], [92, 200, 164]);
  holz('golden_oak', [204, 172, 96], [154, 122, 60], [232, 204, 96]);

  // ---- Netherbiome ----
  // Alle sechs Bodenarten stammen aus derselben Rampenlogik wie der Rest: harte
  // Quantisierung auf wenige Toene, damit sie auf Entfernung nicht verwaschen.
  var SOUL2 = [[58, 44, 36], [72, 56, 44], [88, 68, 54], [46, 34, 28]];
  tex('soul_soil', function (g) {
    g.qn(SOUL2, [22, 36, 24, 18]);
    for (var i = 0; i < 14; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [34, 24, 20]);
  });
  var KNOCH = [[214, 210, 186], [188, 182, 156], [232, 228, 208], [160, 154, 130]];
  tex('bone_block', function (g) {
    g.qn(KNOCH.slice(0, 2), [40, 40]);
    for (var x = 0; x < 16; x++) { g.set(x, 0, KNOCH[3]); g.set(x, 15, KNOCH[3]); }
    for (var i = 0; i < 4; i++) { var bx = 2 + i * 4; for (var y = 1; y < 15; y++) g.set(bx, y, KNOCH[3]); }
  });
  tex('bone_block_top', function (g) {
    g.qn(KNOCH.slice(0, 2), [40, 40]);
    g.frame(3, 3, 10, 10, KNOCH[3]);
    g.rect(6, 6, 4, 4, KNOCH[2]);
  });
  var BAS = [[62, 60, 66], [78, 76, 84], [50, 48, 54], [94, 92, 100]];
  tex('basalt', function (g) {
    g.qn(BAS, [24, 34, 26, 16]);
    // senkrechte Riefen: Basalt bricht in Saeulen
    for (var x = 1; x < 16; x += 3) for (var y = 0; y < 16; y++) g.set(x, y, BAS[2]);
  });
  tex('basalt_top', function (g) {
    g.qn(BAS, [26, 34, 24, 16]);
    for (var i = 0; i < 5; i++) g.frame(2 + i, 2 + i, 12 - 2 * i, 12 - 2 * i, i % 2 ? BAS[2] : BAS[3]);
  });
  tex('blackstone', function (g) {
    g.qn([[34, 30, 36], [44, 40, 48], [26, 24, 30], [56, 52, 60]], [24, 34, 26, 16]);
    for (var i = 0; i < 10; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [20, 18, 24]);
  });
  // Nylium: Netherrack mit einem Belag obendrauf, wie Gras auf Erde
  function nylium(g, tone, punkte) {
    g.copyFrom(data('netherrack'));
    g.qn(tone, [26, 36, 24]);
    for (var i = 0; i < 18; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, punkte);
  }
  var KARM = [[122, 26, 30], [146, 34, 38], [96, 20, 24]];
  var WIRR = [[22, 108, 106], [30, 130, 126], [16, 84, 84]];
  tex('crimson_nylium', function (g) { nylium(g, KARM, [178, 58, 52]); });
  tex('warped_nylium', function (g) { nylium(g, WIRR, [66, 168, 158]); });
  function nyliumSide(g, tone) {
    g.copyFrom(data('netherrack'));
    for (var x = 0; x < 16; x++) {
      var h = 3 + ((g.r() * 3) | 0);
      for (var y = 0; y < h; y++) g.set(x, y, tone[(g.r() * tone.length) | 0]);
    }
  }
  tex('crimson_nylium_side', function (g) { nyliumSide(g, KARM); });
  tex('warped_nylium_side', function (g) { nyliumSide(g, WIRR); });

  function stamm(g, tone, ring) {
    g.qn(tone, [26, 36, 24]);
    for (var x = 0; x < 16; x += 5) for (var y = 0; y < 16; y++) if (g.r() < 0.75) g.set(x, y, ring);
  }
  tex('crimson_stem', function (g) { stamm(g, [[96, 34, 52], [116, 42, 62], [78, 26, 42]], [58, 20, 32]); });
  tex('warped_stem', function (g) { stamm(g, [[46, 84, 92], [56, 100, 108], [36, 66, 74]], [26, 48, 56]); });
  tex('crimson_stem_top', function (g) {
    g.qn([[142, 62, 60], [162, 74, 70]], [40, 40]);
    for (var i = 0; i < 4; i++) g.frame(3 + i, 3 + i, 10 - 2 * i, 10 - 2 * i, [96, 34, 52]);
  });
  tex('warped_stem_top', function (g) {
    g.qn([[56, 132, 130], [66, 150, 146]], [40, 40]);
    for (var i = 0; i < 4; i++) g.frame(3 + i, 3 + i, 10 - 2 * i, 10 - 2 * i, [36, 66, 74]);
  });
  tex('crimson_planks', function (g) { g.copyFrom(data('planks_oak')); g.tint([255, 108, 130]); });
  tex('warped_planks', function (g) { g.copyFrom(data('planks_oak')); g.tint([112, 246, 240]); });
  tex('nether_wart_block', function (g) {
    g.qn([[104, 14, 20], [126, 20, 26], [84, 10, 16], [148, 28, 32]], [24, 34, 26, 16]);
    for (var i = 0; i < 16; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [66, 8, 12]);
  });
  tex('warped_wart_block', function (g) {
    g.qn([[20, 120, 116], [28, 140, 134], [14, 96, 96], [46, 160, 150]], [24, 34, 26, 16]);
    for (var i = 0; i < 16; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [10, 74, 76]);
  });
  tex('shroomlight', function (g) {
    g.qn([[240, 160, 62], [252, 190, 90], [222, 132, 46]], [26, 38, 24]);
    for (var i = 0; i < 12; i++) {
      var sx = (g.r() * 16) | 0, sy = (g.r() * 16) | 0;
      g.set(sx, sy, [255, 226, 150]); g.set(sx + 1, sy, [255, 226, 150]);
    }
  });
  function wurzeln(g, tone) {
    g.fill([0, 0, 0], 0);
    for (var x = 2; x < 14; x++) {
      if (g.r() < 0.35) continue;
      var h = 3 + ((g.r() * 5) | 0);
      for (var y = 16 - h; y < 16; y++) g.set(x, y, tone[(g.r() * tone.length) | 0]);
    }
  }
  tex('crimson_roots', function (g) { wurzeln(g, [[152, 40, 62], [186, 54, 74]]); });
  tex('warped_roots', function (g) { wurzeln(g, [[36, 150, 142], [52, 178, 166]]); });

  // ---- Aetherbiome ----
  tex('frosted_grass_top', function (g) {
    g.copyFrom(data('aether_grass_top'));
    g.qn([[228, 240, 248], [206, 224, 238], [244, 250, 254]], [26, 34, 24]);
    for (var i = 0; i < 10; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [180, 206, 228]);
  });
  tex('frosted_grass_side', function (g) {
    g.copyFrom(data('aether_dirt'));
    for (var x = 0; x < 16; x++) {
      var h = 3 + ((g.r() * 3) | 0);
      for (var y = 0; y < h; y++) g.set(x, y, [[228, 240, 248], [206, 224, 238]][(g.r() * 2) | 0]);
    }
  });
  tex('leaves_crystal', function (g) {
    g.copyFrom(data('leaves_skyroot'));
    g.tint([160, 232, 255]);
    // ein paar Eiskristalle blitzen zwischen den Nadeln
    for (var i = 0; i < 14; i++) {
      var cx2 = (g.r() * 16) | 0, cy2 = (g.r() * 16) | 0;
      if (g.alphaAt(cx2, cy2) > 0) g.set(cx2, cy2, [236, 250, 255]);
    }
  });


  function cloudTex(name, base) {
    tex(name, function (g) {
      var r = ramp(base, 0.22);
      g.qn([r.dk, r.bs, r.lt], [26, 48, 26], 205);
      for (var i = 0; i < g.d.length; i += 4) g.d[i + 3] = 205;
    });
  }
  cloudTex('aercloud', [238, 246, 252]);
  cloudTex('aercloud_blue', [150, 196, 250]);
  cloudTex('aercloud_golden', [250, 228, 150]);

  crossPlant('aether_flower', function (g) {
    var p = ramp([224, 154, 234], 1.15);
    g.art(BLUME_ART, {
      O: P.kontur, H: p.hi, L: p.lt, M: p.bs, C: [255, 236, 150], h: p.dk,
      s: [88, 156, 122], l: [126, 196, 164], m: [104, 172, 140], d: [76, 132, 104]
    });
  });
  crossPlant('blueberry_bush', function (g) {
    var B = [[58, 112, 80], [72, 132, 96], [88, 152, 112]];
    for (var i = 0; i < 62; i++) g.set(3 + ((g.r() * 10) | 0), 5 + ((g.r() * 10) | 0), B[Math.floor(g.r() * 3)]);
    for (var k = 0; k < 6; k++) g.nest(4 + ((g.r() * 9) | 0), 7 + ((g.r() * 7) | 0), 1.2,
      [[72, 86, 190], [116, 132, 226], [46, 56, 138]]);
  });
  tex('portal_aether', function (g) {
    g.qn([[120, 186, 236], [156, 210, 246], [190, 232, 252], [226, 244, 255]], [18, 30, 30, 22]);
  });

  // ============================================================
  //  DAS ENDE
  // ============================================================
  var ENDS = [[190, 192, 140], [206, 208, 154], [222, 224, 168], [236, 238, 184]];
  tex('end_stone', function (g) { g.qnRun(ENDS, [12, 30, 38, 20], 3); });
  tex('end_stone_bricks', function (g) { g.qn(ENDS, [12, 28, 38, 22]); ziegelVerband(g, ENDS); });
  tex('end_portal_frame_side', function (g) {
    g.qn(ENDS.slice(0, 3), [26, 42, 32]);
    g.rect(0, 0, 16, 4, mix(ENDS[2], [120, 176, 140], 0.45));
    for (var x = 0; x < 16; x++) g.set(x, 4, mul(ENDS[0], 0.78));
  });
  function rahmenOben(g, auge) {
    g.qn([mix(ENDS[1], [140, 190, 156], 0.4), mix(ENDS[2], [140, 190, 156], 0.4)], [40, 60]);
    g.frame(2, 2, 12, 12, mul(ENDS[0], 0.7));
    if (auge) {
      g.rect(3, 3, 10, 10, [20, 54, 46]);
      g.rect(4, 5, 8, 6, [58, 186, 150]); g.rect(5, 4, 6, 8, [58, 186, 150]);
      g.rect(6, 6, 4, 4, [14, 20, 28]); g.rect(6, 6, 2, 2, [190, 250, 232]);
    } else {
      g.rect(3, 3, 10, 10, [46, 120, 96]);
      g.nest(8, 8, 3.2, [[92, 210, 160], [190, 250, 220], [40, 110, 88]]);
    }
  }
  tex('end_portal_frame_top', function (g) { rahmenOben(g, false); });
  tex('end_portal_frame_eye', function (g) { rahmenOben(g, true); });
  tex('portal_end', function (g) {
    g.fill([6, 4, 14]);
    for (var i = 0; i < 46; i++) {
      var b = 0.35 + g.r() * 0.65;
      g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [200 * b, 220 * b, 255 * b]);
    }
    for (var k = 0; k < 8; k++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [190, 150, 255]);
  });
  tex('dragon_egg', function (g) {
    g.qn([[12, 8, 20], [20, 14, 32], [30, 22, 46], [42, 30, 62]], [26, 32, 26, 16]);
    for (var k = 0; k < 12; k++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [170, 120, 235]);
  });
  tex('end_crystal', function (g) {
    g.fill([0, 0, 0], 0);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
      if (d > 8) continue;
      g.set(x, y, mix([232, 210, 140], [140, 96, 200], d / 8), 235);
    }
    g.blob(7, 6, 2, [255, 248, 210], 250);
  });

  tex('hpbar_bg', function (g) { g.fill([16, 16, 20], 210); g.frame(0, 0, 16, 16, [0, 0, 0]); });
  tex('hpbar_fill', function (g) {
    g.fill([206, 44, 40]);
    for (var x = 0; x < 16; x++) { g.set(x, 0, [246, 120, 116]); g.set(x, 15, [136, 20, 18]); }
  });

  // ============================================================
  //  KREATUREN
  //  Kein Koerperteil bleibt einfarbig. Gleiche Augengrammatik
  //  ueberall: Auge 3x3, Glanzpunkt fest oben rechts, Mund 1 px.
  //  Unterste Zeile jedes Teils traegt den Bodenschatten.
  // ============================================================
  function auge(g, x, y, weiss, iris, pupille) {
    g.rect(x, y, 3, 3, weiss);
    g.rect(x + 1, y + 1, 2, 2, iris);
    g.set(x + 1, y + 1, pupille);
    g.set(x + 2, y + 1, [255, 255, 255]);
  }
  function haut(g, base, richtung) {
    var r = ramp(base, 0.8);
    g.qn([r.dk, r.bs, r.bs, r.lt], [22, 30, 30, 18]);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      var k = richtung === 'h' ? (y + (x >> 2)) : (x + (y >> 2));
      if (k % 5 === 0) g.set(x, y, r.dk);
      if (k % 7 === 3) g.set(x, y, r.lt);
    }
    for (var x2 = 0; x2 < 16; x2++) { g.set(x2, 15, r.sh); g.set(x2, 14, r.dk); }
    return r;
  }
  function mob(name, base, richtung) { tex(name, function (g) { haut(g, base, richtung); }); }
  function mobFace(name, base, fn) {
    tex(name, function (g) { var r = haut(g, base, 'v'); fn(g, r); });
  }
  var AUGE_W = [248, 248, 252];

  // ---- Erste Runde neuer Kreaturen ----
  // Alle über dieselbe Hautfunktion wie die vorhandenen Mobs, damit sie im
  // selben Bild bleiben und nicht wie Fremdkörper wirken.
  function neuerMob(name, base, richtung, gesicht) {
    mob(name, base, richtung);
    if (gesicht) mobFace(name + '_face', base, gesicht);
  }
  neuerMob('mob_wither_skeleton', [58, 58, 56], 'v', function (g, r) {
    auge(g, 3, 5, [46, 46, 44], [16, 16, 16], [200, 60, 40]);
    auge(g, 10, 5, [46, 46, 44], [16, 16, 16], [200, 60, 40]);
    g.rect(5, 10, 6, 1, r.sh);
    for (var x = 5; x < 11; x += 2) g.set(x, 11, r.sh);
  });
  neuerMob('mob_hoglin', [138, 92, 78], 'h', function (g, r) {
    auge(g, 3, 5, AUGE_W, [60, 30, 20], [12, 8, 6]);
    auge(g, 10, 5, AUGE_W, [60, 30, 20], [12, 8, 6]);
    g.rect(6, 9, 4, 3, mul(r.base, 0.7));
    g.set(6, 10, [226, 220, 200]); g.set(9, 10, [226, 220, 200]);
    // Hauer
    g.rect(2, 8, 2, 2, [232, 228, 210]); g.rect(12, 8, 2, 2, [232, 228, 210]);
  });
  mob('mob_brute_shirt', [96, 66, 48], 'v');
  neuerMob('mob_ash_wight', [86, 82, 84], 'v', function (g, r) {
    auge(g, 3, 6, [30, 28, 30], [240, 140, 50], [255, 220, 150]);
    auge(g, 10, 6, [30, 28, 30], [240, 140, 50], [255, 220, 150]);
    for (var i = 0; i < 10; i++) g.set(2 + ((g.r() * 12) | 0), 10 + ((g.r() * 4) | 0), [220, 110, 40]);
  });
  neuerMob('mob_frost_wight', [176, 208, 232], 'v', function (g, r) {
    auge(g, 3, 6, [230, 244, 252], [60, 130, 200], [20, 40, 90]);
    auge(g, 10, 6, [230, 244, 252], [60, 130, 200], [20, 40, 90]);
    for (var i = 0; i < 12; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [242, 250, 255]);
  });
  mob('mob_aechor', [86, 150, 92], 'v');
  tex('mob_aechor_petal', function (g) {
    var r = ramp([196, 96, 176], 0.7);
    g.qn([r.dk, r.bs, r.lt], [26, 42, 26]);
    // Blütenblätter zeichnen: helle Keile vom Rand zur Mitte
    for (var a2 = 0; a2 < 8; a2++) {
      var w = a2 / 8 * Math.PI * 2;
      for (var t = 2; t < 8; t++) {
        g.set(8 + Math.round(Math.cos(w) * t), 8 + Math.round(Math.sin(w) * t), r.hi);
      }
    }
    g.rect(6, 6, 4, 4, [246, 228, 120]);
  });

  mob('mob_pig', [232, 148, 152], 'h');
  mobFace('mob_pig_face', [232, 148, 152], function (g, r) {
    auge(g, 3, 4, AUGE_W, [40, 30, 36], [14, 12, 18]);
    auge(g, 10, 4, AUGE_W, [40, 30, 36], [14, 12, 18]);
    g.rect(4, 9, 8, 5, r.dk); g.rect(4, 9, 8, 1, r.bs);
    g.rect(6, 11, 2, 2, r.sh); g.rect(9, 11, 2, 2, r.sh);
  });
  mob('mob_cow', [76, 54, 40], 'h');
  mobFace('mob_cow_face', [76, 54, 40], function (g, r) {
    g.rect(2, 2, 12, 7, [234, 230, 222]); g.rect(2, 2, 12, 1, [250, 248, 242]);
    auge(g, 3, 4, AUGE_W, [44, 30, 22], [14, 10, 8]);
    auge(g, 10, 4, AUGE_W, [44, 30, 22], [14, 10, 8]);
    g.rect(5, 10, 6, 4, [194, 152, 152]); g.rect(5, 10, 6, 1, [216, 176, 176]);
    g.set(6, 12, r.sh); g.set(9, 12, r.sh);
  });
  mob('mob_cow_spot', [238, 234, 226], 'h');
  mob('mob_cow_horn', [226, 222, 205], 'v');
  mob('mob_sheep', [236, 236, 234], 'h');
  mob('mob_sheep_skin', [222, 210, 198], 'v');
  mobFace('mob_sheep_face', [226, 214, 202], function (g, r) {
    auge(g, 3, 5, AUGE_W, [36, 30, 28], [14, 12, 12]);
    auge(g, 10, 5, AUGE_W, [36, 30, 28], [14, 12, 12]);
    g.rect(5, 11, 6, 2, r.dk); g.set(6, 12, r.sh); g.set(9, 12, r.sh);
  });
  mob('mob_chicken', [236, 236, 234], 'v');
  mob('mob_chicken_leg', [238, 170, 48], 'v');
  mobFace('mob_chicken_face', [236, 236, 234], function (g) {
    auge(g, 3, 5, AUGE_W, [28, 24, 24], [12, 10, 10]);
    auge(g, 10, 5, AUGE_W, [28, 24, 24], [12, 10, 10]);
    g.rect(6, 8, 4, 3, [240, 170, 40]); g.rect(6, 8, 4, 1, [252, 200, 80]);
    g.rect(6, 1, 4, 3, [196, 50, 44]); g.rect(6, 1, 4, 1, [226, 72, 62]);
  });
  mob('mob_zombie', [66, 102, 62], 'v');
  mob('mob_zombie_shirt', [62, 88, 148], 'v');
  mobFace('mob_zombie_face', [82, 126, 70], function (g, r) {
    g.rect(0, 0, 16, 3, [40, 66, 38]);
    auge(g, 3, 5, [26, 42, 26], [14, 24, 16], [8, 14, 10]);
    auge(g, 10, 5, [26, 42, 26], [14, 24, 16], [8, 14, 10]);
    g.rect(5, 11, 6, 1, r.sh);
    for (var i = 0; i < 3; i++) g.set(5 + i * 2, 12, r.sh);
    g.rect(12, 8, 2, 3, r.dk); g.set(12, 8, r.sh);
  });
  mob('mob_skeleton', [204, 202, 196], 'v');
  mobFace('mob_skeleton_face', [212, 210, 204], function (g, r) {
    g.rect(2, 4, 4, 4, [22, 22, 26]); g.rect(10, 4, 4, 4, [22, 22, 26]);
    g.set(3, 5, [66, 66, 74]); g.set(11, 5, [66, 66, 74]);
    g.rect(4, 11, 8, 1, r.sh);
    for (var i = 0; i < 4; i++) g.set(5 + i * 2, 12, r.sh);
    g.rect(6, 8, 4, 2, r.dk);
  });
  mob('mob_creeper', [72, 172, 76], 'v');
  mob('mob_creeper_flash', [252, 244, 244], 'v');
  mobFace('mob_creeper_face', [72, 172, 76], function (g) {
    g.rect(3, 4, 4, 4, [18, 20, 22]); g.rect(9, 4, 4, 4, [18, 20, 22]);
    g.rect(6, 8, 4, 5, [18, 20, 22]);
    g.rect(5, 10, 2, 3, [18, 20, 22]); g.rect(9, 10, 2, 3, [18, 20, 22]);
    g.rect(3, 3, 4, 1, [34, 92, 40]); g.rect(9, 3, 4, 1, [34, 92, 40]);
  });

  var VILL = [200, 156, 126];
  mob('mob_villager', VILL, 'v');
  mob('mob_villager_nose', mul(VILL, 0.78), 'v');
  mobFace('mob_villager_face', VILL, function (g, r) {
    g.rect(0, 0, 16, 3, [82, 58, 42]); g.rect(2, 4, 12, 1, [88, 64, 46]);
    auge(g, 3, 5, AUGE_W, [60, 90, 160], [18, 26, 48]);
    auge(g, 10, 5, AUGE_W, [60, 90, 160], [18, 26, 48]);
    g.rect(6, 12, 4, 1, r.dk);
  });
  [['bauer', [140, 108, 66], [190, 175, 140]],
   ['bibliothekar', [200, 200, 205], [110, 78, 150]],
   ['schmied', [70, 70, 78], [60, 52, 44]],
   ['metzger', [225, 225, 225], [190, 70, 60]],
   ['steinmetz', [150, 150, 155], [120, 96, 60]]
  ].forEach(function (p) {
    tex('mob_villager_' + p[0], function (g) {
      var r = ramp(p[1], 0.5);
      g.qn([r.dk, r.bs, r.bs, r.lt], [22, 30, 30, 18]);
      g.rect(0, 0, 16, 5, [122, 88, 62]);
      g.rect(0, 9, 16, 2, p[2]);
      g.rect(6, 5, 4, 11, r.dk);
      for (var x = 0; x < 16; x++) { g.set(x, 15, r.sh); g.set(x, 14, r.dk); }
    });
  });

  mob('player_skin', [58, 104, 178], 'v');
  mob('mob_player_arm', [228, 182, 146], 'v');
  mobFace('player_face', [228, 182, 146], function (g, r) {
    g.rect(0, 0, 16, 4, [82, 54, 32]); g.rect(0, 3, 16, 1, [58, 38, 22]);
    auge(g, 3, 6, AUGE_W, [56, 92, 170], [18, 22, 38]);
    auge(g, 10, 6, AUGE_W, [56, 92, 170], [18, 22, 38]);
    g.rect(6, 11, 4, 1, r.dk); g.set(7, 12, r.sh);
  });
  tex('item_shadow', function (g) { g.fill([0, 0, 0]); });

  // ---- Nether-Mobs ----
  mob('mob_piglin', [226, 152, 148], 'v');
  mob('mob_piglin_shirt', [188, 148, 62], 'v');
  mobFace('mob_piglin_face', [226, 152, 148], function (g, r) {
    auge(g, 3, 5, AUGE_W, [36, 28, 26], [14, 10, 10]);
    auge(g, 10, 5, AUGE_W, [36, 28, 26], [14, 10, 10]);
    g.rect(4, 9, 8, 5, r.dk); g.rect(4, 9, 8, 1, r.bs);
    g.rect(6, 11, 1, 2, r.sh); g.rect(9, 11, 1, 2, r.sh);
    g.rect(1, 4, 2, 4, r.lt); g.rect(13, 4, 2, 4, r.lt);
  });
  mob('mob_ghast', [232, 230, 232], 'v');
  mobFace('mob_ghast_face', [232, 230, 232], function (g) {
    g.rect(3, 5, 3, 3, [20, 20, 24]); g.rect(10, 5, 3, 3, [20, 20, 24]);
    g.rect(4, 10, 8, 3, [20, 20, 24]);
  });
  mob('mob_magma', [58, 24, 18], 'v');
  tex('mob_magma_core', function (g) { g.qn([LAVA[3], LAVA[4], [255, 214, 108]], [26, 44, 30]); });
  mobFace('mob_magma_face', [58, 24, 18], function (g) {
    g.rect(3, 5, 3, 3, [255, 190, 60]); g.rect(10, 5, 3, 3, [255, 190, 60]);
    g.rect(5, 11, 6, 2, [255, 150, 40]);
  });
  mob('mob_blaze', [246, 178, 34], 'v');
  mobFace('mob_blaze_face', [246, 178, 34], function (g) {
    g.rect(3, 5, 3, 3, [72, 30, 6]); g.rect(10, 5, 3, 3, [72, 30, 6]);
    g.rect(4, 11, 8, 2, [128, 52, 10]);
  });
  tex('mob_blaze_rod', function (g) {
    g.qn([[232, 150, 26], [246, 186, 44], [252, 214, 84]], [26, 42, 32]);
    for (var y = 0; y < 16; y += 3) for (var x = 0; x < 16; x++) g.set(x, y, [212, 128, 20]);
  });
  mob('mob_enderman', [18, 16, 22], 'v');
  mobFace('mob_enderman_face', [18, 16, 22], function (g) {
    g.rect(1, 6, 6, 3, [206, 160, 255]); g.rect(9, 6, 6, 3, [206, 160, 255]);
    g.rect(2, 7, 4, 1, [255, 240, 255]); g.rect(10, 7, 4, 1, [255, 240, 255]);
  });
  var DRACHE = [30, 26, 40];
  mob('mob_dragon', DRACHE, 'v');
  mob('mob_dragon_wing', [22, 19, 32], 'h');
  mobFace('mob_dragon_face', DRACHE, function (g) {
    g.rect(2, 5, 4, 3, [214, 66, 226]); g.rect(10, 5, 4, 3, [214, 66, 226]);
    g.rect(3, 6, 2, 1, [255, 190, 255]); g.rect(11, 6, 2, 1, [255, 190, 255]);
    g.rect(4, 12, 8, 2, [16, 14, 22]);
  });

  // ---- Aether-Mobs ----
  [['moa_blue', [124, 158, 226]], ['moa_white', [238, 238, 240]], ['moa_black', [72, 72, 82]]]
    .forEach(function (m) { mob('mob_' + m[0], m[1], 'v'); });
  mobFace('mob_moa_face', [226, 226, 230], function (g) {
    auge(g, 3, 5, AUGE_W, [28, 24, 28], [12, 10, 12]);
    auge(g, 10, 5, AUGE_W, [28, 24, 28], [12, 10, 12]);
    g.rect(6, 9, 4, 4, [240, 176, 60]); g.rect(6, 9, 4, 1, [252, 206, 96]);
  });
  mob('mob_phyg', [244, 186, 196], 'h');
  mob('mob_phyg_wing', [252, 250, 248], 'h');
  mobFace('mob_phyg_face', [244, 186, 196], function (g, r) {
    auge(g, 3, 4, AUGE_W, [40, 30, 34], [14, 12, 16]);
    auge(g, 10, 4, AUGE_W, [40, 30, 34], [14, 12, 16]);
    g.rect(4, 9, 8, 5, r.dk); g.rect(4, 9, 8, 1, r.bs);
    g.rect(6, 11, 1, 2, r.sh); g.rect(9, 11, 1, 2, r.sh);
  });
  mob('mob_sheepuff', [242, 246, 250], 'h');
  mobFace('mob_sheepuff_face', [232, 226, 220], function (g, r) {
    auge(g, 3, 5, AUGE_W, [34, 30, 30], [14, 12, 12]);
    auge(g, 10, 5, AUGE_W, [34, 30, 30], [14, 12, 12]);
    g.rect(5, 11, 6, 2, r.dk);
  });
  mob('mob_zephyr', [222, 238, 252], 'v');
  mobFace('mob_zephyr_face', [222, 238, 252], function (g) {
    g.rect(3, 5, 3, 3, [96, 140, 196]); g.rect(10, 5, 3, 3, [96, 140, 196]);
    g.rect(6, 10, 4, 2, [96, 140, 196]);
  });
  mob('mob_cockatrice', [92, 176, 132], 'v');
  mobFace('mob_cockatrice_face', [92, 176, 132], function (g) {
    g.rect(3, 5, 2, 2, [210, 60, 60]); g.rect(11, 5, 2, 2, [210, 60, 60]);
    g.rect(6, 9, 4, 4, [232, 176, 60]);
    g.rect(6, 1, 4, 3, [200, 60, 70]);
  });

  // ---- Entities ----
  tex('arrow_entity', function (g) {
    g.fill([0, 0, 0], 0);
    for (var x = 3; x < 13; x++) { g.set(x, 7, P.planks[4]); g.set(x, 8, P.planks[2]); }
    g.set(13, 7, [200, 200, 205]); g.set(13, 8, [200, 200, 205]);
    g.set(14, 7, [232, 232, 236]); g.set(14, 8, [176, 176, 182]);
    g.set(15, 7, [244, 244, 248]);
    for (var i = 0; i < 3; i++) {
      g.set(3 + i, 5 + i, [240, 240, 242]); g.set(3 + i, 10 - i, [212, 212, 216]);
      g.set(2 + i, 6 + i, [224, 224, 228]);
    }
  });

  for (var fi = 0; fi < 2; fi++) {
    (function (s) {
      tex('fire_' + s, function (g) {
        g.fill([0, 0, 0], 0);
        var rr = MC.U.rng(4711 + s * 97);
        for (var x = 0; x < 16; x++) {
          var hgt = 7 + ((rr() * 8) | 0) - Math.abs(x - 7.5) * 0.55;
          for (var y = 15; y > 15 - hgt; y--) {
            var t = (15 - y) / Math.max(1, hgt);
            var c = t < 0.35 ? [255, 236, 158] : (t < 0.7 ? LAVA[4] : LAVA[2]);
            if (rr() < 0.14 && t > 0.5) continue;
            g.set(x, y, c);
          }
        }
      });
    })(fi);
  }

  function doorTex(name, base, iron) {
    var r = ramp(base, 0.5);
    tex(name + '_upper', function (g) {
      g.qn([r.dk, r.bs, r.bs, r.lt], [20, 32, 30, 18]);
      g.frame(0, 0, 16, 16, r.sh);
      g.rect(3, 3, 10, 8, r.dk); g.frame(3, 3, 10, 8, r.sh);
      if (iron) g.rect(4, 4, 8, 6, r.lt);
      g.rect(1, 13, 14, 2, r.sh);
      g.rect(12, 12, 2, 2, [232, 202, 90]);
    });
    tex(name + '_lower', function (g) {
      g.qn([r.dk, r.bs, r.bs, r.lt], [20, 32, 30, 18]);
      g.frame(0, 0, 16, 16, r.sh);
      g.rect(3, 4, 10, 9, r.dk); g.frame(3, 4, 10, 9, r.sh);
      g.rect(1, 1, 14, 2, r.sh);
      g.rect(12, 2, 2, 2, [232, 202, 90]);
    });
  }
  doorTex('door_oak', [156, 124, 74], false);
  doorTex('door_iron', [186, 186, 190], true);

  tex('ladder', function (g) {
    g.fill([0, 0, 0], 0);
    for (var y = 0; y < 16; y++) {
      g.set(2, y, P.planks[4]); g.set(3, y, P.planks[2]);
      g.set(12, y, P.planks[4]); g.set(13, y, P.planks[2]);
    }
    for (var r = 1; r < 16; r += 5) for (var x = 3; x < 13; x++) {
      g.set(x, r, P.planks[4]); g.set(x, r + 1, P.planks[2]);
    }
  });

  // ============================================================
  //  REDSTONE
  // ============================================================
  tex('redstone_dust', function (g) {
    g.fill([0, 0, 0], 0);
    for (var i = 0; i < 16; i++) {
      g.set(i, 7, [206, 44, 40]); g.set(i, 8, [162, 26, 24]);
      g.set(7, i, [206, 44, 40]); g.set(8, i, [162, 26, 24]);
    }
    g.set(7, 7, [244, 112, 104]); g.set(8, 8, [126, 18, 16]);
  });
  tex('redstone_block', function (g) {
    g.qn([[128, 18, 16], [158, 24, 22], [186, 34, 30], [212, 50, 46]], [18, 32, 32, 18]);
  });
  function rsTorch(name, an) {
    tex(name, function (g) {
      g.fill([0, 0, 0], 0);
      var glut = an ? [252, 74, 60] : [100, 34, 30];
      g.set(7, 6, glut); g.set(8, 6, an ? [255, 150, 130] : [120, 44, 38]);
      g.set(7, 7, an ? [222, 48, 40] : [86, 26, 24]); g.set(8, 7, glut);
      for (var y = 8; y < 16; y++) { g.set(7, y, P.planks[3]); g.set(8, y, P.planks[1]); }
    });
  }
  rsTorch('redstone_torch', true);
  rsTorch('redstone_torch_off', false);
  tex('lever_handle', function (g) {
    g.qn([P.planks[1], P.planks[2], P.planks[3]], [26, 44, 30]);
    for (var y = 0; y < 16; y += 4) for (var x = 0; x < 16; x++) g.set(x, y, P.planks[0]);
  });
  tex('repeater_top', function (g) { g.qn(greys([134, 146, 158, 168]), [16, 30, 34, 20]); g.frame(0, 0, 16, 16, greys([116])[0]); });
  tex('repeater_side', function (g) {
    g.qn(greys([124, 136, 148]), [26, 44, 30]);
    g.rect(0, 0, 16, 4, greys([168])[0]); g.rect(0, 12, 16, 4, greys([108])[0]);
  });
  function lampTex(name, an) {
    tex(name, function (g) {
      var base = an ? [206, 154, 78] : [104, 74, 46];
      var r = ramp(base, 0.5);
      g.qn([r.dk, r.bs, r.bs, r.lt], [20, 32, 30, 18]);
      for (var i = 0; i < 5; i++) {
        g.nest(2 + ((g.r() * 12) | 0), 2 + ((g.r() * 12) | 0), 1.6,
          an ? [[255, 216, 130], [255, 244, 196], [200, 150, 74]] : [r.dk, r.bs, r.sh]);
      }
      g.frame(0, 0, 16, 16, r.sh);
    });
  }
  lampTex('redstone_lamp', false);
  lampTex('redstone_lamp_lit', true);

  // ============================================================
  //  GEGENSTAENDE
  // ============================================================
  function itemArt(name, rows, pal) {
    tex(name, function (g) { g.fill([0, 0, 0], 0); g.art(rows, pal); });
  }

  // ---- Werkzeuge: Kopf als Bild, Stiel gezeichnet ----
  var TOOL = {
    pickaxe: { stiel: [5, 10], kopf: [
      '................', '...OOOOOOOOO....', '..OHHLMMMMMMhO..',
      '..OHLOOOOMMMMhO.', '..OOO....OOMMhO.'] },
    axe: { stiel: [4, 11], kopf: [
      '................', '..OOOO..........', '.OHHLMO.........', '.OHLMMMO........',
      '.OHLMMMMO.......', '.OHLMMMMO.......', '.OLMMMMhO.......', '..OLMMhO........',
      '...OMhO.........', '....OO..........'] },
    shovel: { stiel: [6, 9], kopf: [
      '................', '........OOOOO...', '.......OHHLLMO..', '.......OHLMMMO..',
      '.......OHLMMMO..', '.......OLMMMhO..', '........OMMhO...'] },
    sword: { stiel: [10, 5], kopf: [
      '.............OOO', '............OHLO', '...........OHLMO', '..........OHLMO.',
      '.........OHLMO..', '........OHLMO...', '.......OHLMO....', '......OHLMO.....',
      '.....OHLMO......', '...OOHMMhOO.....'] },
    hoe: { stiel: [4, 11], kopf: [
      '................', '....OOOOOOO.....', '...OHHLLLMMO....', '...OOOOOOMMhO...'] }
  };
  T.TOOL = TOOL;
  Object.keys(P.tier).forEach(function (t) {
    var pal = itemPal(P.tier[t]);
    Object.keys(TOOL).forEach(function (typ) {
      var def = TOOL[typ];
      tex(t + '_' + typ, function (g) {
        g.fill([0, 0, 0], 0);
        stiel(g, def.stiel[0], def.stiel[1]);
        g.art(def.kopf, pal);
      });
    });
  });

  // ---- Ruestung ----
  var ARMOR = {
    helmet: [
      '................', '................', '...OOOOOOOOOO...', '..OHHHHHHHHHHO..',
      '..OLMMMMMMMMLO..', '..OLMMMMMMMMLO..', '..OMOOOOOOOOMO..', '..OMO......OMO..',
      '..OMO......OMO..', '..OMhO....OhMO..', '..OMhO....OhMO..', '..OMhO....OhMO..',
      '..OOOO....OOOO..', '................', '................', '................'],
    chestplate: [
      '................', '..OO........OO..', '.OHHO......OHHO.', '.OLMOOOOOOOOMLO.',
      '.OLMMMMMMMMMMLO.', '.OMMMMMMMMMMMMO.', '..OMMMMMMMMMMO..', '..OMMMMMMMMMMO..',
      '..OMMMMMMMMMMO..', '..OhMMMMMMMMhO..', '..OhMMMMMMMMhO..', '..OhhOOOOOOhhO..',
      '..OOO......OOO..', '................', '................', '................'],
    leggings: [
      '................', '..OOOOOOOOOOOO..', '.OHHHHHHHHHHHHO.', '.OLMMMMMMMMMMLO.',
      '.OMMMMMMMMMMMMO.', '.OMMMMOOOOMMMMO.', '.OMMhO....OhMMO.', '.OMMhO....OhMMO.',
      '.OMMhO....OhMMO.', '.OMMhO....OhMMO.', '.OMMhO....OhMMO.', '.OMhhO....OhhMO.',
      '.OOOOO....OOOOO.', '................', '................', '................'],
    boots: [
      '................', '................', '................', '..OOOO....OOOO..',
      '.OHHHHO..OHHHHO.', '.OLMMMO..OLMMMO.', '.OMMMMO..OMMMMO.', '.OMMMMO..OMMMMO.',
      '.OMMMMOOOMMMMMO.', 'OMMMMMMOOMMMMMMO', 'OMMMMMMOOMMMMMMO', 'OhhhhhhOOhhhhhhO',
      'OOOOOOO..OOOOOOO', '................', '................', '................']
  };
  var armorCol = {
    leather: [140, 96, 62], gold: P.tier.gold, iron: P.tier.iron, diamond: P.tier.diamond,
    zanite: P.tier.zanite, gravitite: P.tier.gravitite
  };
  Object.keys(armorCol).forEach(function (m) {
    var pal = itemPal(armorCol[m], m === 'leather' ? 0.7 : 1);
    Object.keys(ARMOR).forEach(function (teil) { itemArt(m + '_' + teil, ARMOR[teil], pal); });
  });
  tex('detector_helmet', function (g) {
    g.fill([0, 0, 0], 0);
    g.art(ARMOR.helmet, itemPal(P.tier.zanite));
    g.rect(6, 4, 4, 3, [86, 214, 208]);
    g.rect(7, 5, 2, 1, [186, 252, 248]);
    g.set(6, 4, [222, 255, 252]); g.set(9, 6, [46, 150, 148]);
  });

  // ---- Material ----
  itemArt('stick', [
    '................', '...........OO...', '..........OWLO..', '.........OWLO...',
    '........OWLO....', '.......OWLO.....', '......OWwO......', '.....OWwO.......',
    '....OWwO........', '...OWwO.........', '..OWvO..........', '..OvvO..........',
    '...OO...........', '................', '................', '................'
  ], { O: [42, 33, 19], W: [116, 90, 54], L: [134, 106, 66], w: [92, 71, 42], v: [68, 52, 30] });

  var INGOT = [
    '................', '................', '................', '....OOOOOOOO....',
    '...OHHHHHHHHO...', '..OHLLLLLLLLHO..', '..OLMMMMMMMMLO..', '..OLMMMMMMMMLO..',
    '..OMMMMMMMMMMO..', '..OhhMMMMMMhhO..', '...OhhhhhhhhO...', '....OOOOOOOO....',
    '................', '................', '................', '................'
  ];
  itemArt('iron_ingot', INGOT, itemPal(P.tier.iron));
  itemArt('gold_ingot', INGOT, itemPal(P.tier.gold));
  itemArt('brick', INGOT, itemPal([164, 92, 74], 0.65));
  itemArt('nether_brick', INGOT, itemPal([96, 46, 52], 0.7));

  var GEM = [
    '................', '................', '......OOOO......', '.....OHHHHO.....',
    '....OHLLLLHO....', '...OHLMMMMLHO...', '..OHLMMMMMMLHO..', '.OHLMMMMMMMMLO..',
    '.OLMMMMMMMMMMO..', '..OhMMMMMMMMhO..', '...OhMMMMMMhO...', '....OhMMMMhO....',
    '.....OhhhhO.....', '......OOOO......', '................', '................'
  ];
  itemArt('diamond', GEM, itemPal(P.tier.diamond));
  itemArt('emerald', GEM, itemPal([50, 196, 100]));
  itemArt('zanite_gemstone', GEM, itemPal([132, 90, 198]));
  itemArt('gravitite', GEM, itemPal([100, 200, 176]));
  itemArt('lapis', GEM, itemPal([58, 88, 196]));

  var KLUMPEN = [
    '................', '................', '......OOO.......', '.....OHLMO......',
    '....OHLMMMOO....', '...OLMMMMMMhO...', '..OLMMMMMMMMhO..', '..OMMMMMMMMMhO..',
    '..OMMMMMMMMMhO..', '...OhMMMMMMhO...', '...OhhMMMMhO....', '....OhhhhhO.....',
    '.....OOOOO......', '................', '................', '................'
  ];
  function klumpen(name, base, spread) { itemArt(name, KLUMPEN, itemPal(base, spread === undefined ? 0.6 : spread)); }
  klumpen('coal', [62, 60, 66], 0.5);
  klumpen('charcoal', [72, 62, 54], 0.5);
  klumpen('clay_ball', [162, 168, 180]);
  klumpen('flint', [70, 64, 64], 0.55);
  klumpen('quartz', [232, 226, 218]);
  klumpen('blueberries', [82, 96, 200]);
  klumpen('ambrosium_shard', [246, 176, 60]);

  // Pulver: lose Koerner statt Klumpen
  function pulver(name, cols) {
    tex(name, function (g) {
      g.fill([0, 0, 0], 0);
      for (var i = 0; i < 40; i++) {
        var x = 3 + ((g.r() * 10) | 0), y = 4 + ((g.r() * 9) | 0);
        g.set(x, y, cols[Math.floor(g.r() * cols.length)]);
      }
      for (var k = 0; k < 5; k++) {
        var bx = 4 + ((g.r() * 8) | 0), by = 5 + ((g.r() * 7) | 0);
        g.rect(bx, by, 2, 2, cols[1]); g.set(bx, by, cols[2]);
      }
    });
  }
  pulver('redstone', [[152, 22, 22], [206, 40, 38], [248, 92, 84]]);
  pulver('gunpowder', [[72, 72, 76], [104, 104, 108], [140, 140, 144]]);
  pulver('sugar', [[214, 214, 218], [236, 236, 240], [252, 252, 255]]);
  pulver('glowstone_dust', [[204, 178, 96], [236, 214, 132], [255, 244, 190]]);
  pulver('blaze_powder', [[196, 108, 20], [232, 154, 32], [255, 214, 108]]);
  pulver('seeds', [[92, 132, 54], [116, 162, 68], [146, 192, 88]]);

  itemArt('apple', [
    '................', '.........OO.....', '........OGG.....', '.......OGGO.....',
    '....OOOOsOO.....', '...OHHLMsMLO....', '..OHLMMMMMMLO...', '..OLMMMMMMMMO...',
    '..OLMMMMMMMMO...', '..OMMMMMMMMhO...', '..OMMMMMMMMhO...', '...OMMMMMMhO....',
    '...OhMMMMhhO....', '....OhhhhhO.....', '.....OOOOO......', '................'
  ], (function () { var p = itemPal([198, 44, 40], 0.7); p.s = P.bark[2]; return p; })());
  itemArt('golden_apple', [
    '................', '.........OO.....', '........OGG.....', '.......OGGO.....',
    '....OOOOsOO.....', '...OHHLMsMLO....', '..OHLMMMMMMLO...', '..OLMMMMMMMMO...',
    '..OLMMMMMMMMO...', '..OMMMMMMMMhO...', '..OMMMMMMMMhO...', '...OMMMMMMhO....',
    '...OhMMMMhhO....', '....OhhhhhO.....', '.....OOOOO......', '................'
  ], (function () { var p = itemPal([240, 206, 68], 0.7); p.s = P.bark[2]; return p; })());

  itemArt('bread', [
    '................', '................', '...OOOOOOOOO....', '..OHHLLLLLLHO...',
    '.OHLMMMMMMMMLO..', '.OLMhMMMhMMMMO..', '.OMMMMMMMMMhMO..', '.OMMhMMMMMMMMO..',
    '.OMMMMMMhMMMMO..', '.OhMMMMMMMMMhO..', '..OhhMMMMMhhO...', '...OOhhhhhOO....',
    '.....OOOOO......', '................', '................', '................'
  ], itemPal([150, 110, 58], 0.55));

  itemArt('bone', [
    '................', '..OO........OO..', '.OHHO......OHHO.', '.OHMOOOOOOOOMHO.',
    '.OMMMMMMMMMMMMO.', '.OMhhhhhhhhhhMO.', '.OMOOOOOOOOOOMO.', '..OO........OO..',
    '..OO........OO..', '.OMOOOOOOOOOOMO.', '.OMhhhhhhhhhhMO.', '.OMMMMMMMMMMMMO.',
    '.OHMOOOOOOOOMHO.', '.OHHO......OHHO.', '..OO........OO..', '................'
  ], itemPal([232, 228, 210], 0.55));

  itemArt('arrow', [
    '................', '.............OO.', '............OHO.', '...........OMO..',
    '..........OMO...', '.........OMO....', '........OwO.....', '.......OwO......',
    '......OwO.......', '.....OwO........', '..O.OwO.........', '.ONOwO..........',
    '.OONwO..........', 'ONNNO...........', '.ONO............', '..O.............'
  ], itemPal(P.tier.iron));

  itemArt('bucket', [
    '................', '................', '..O..........O..', '..OO........OO..',
    '...OOOOOOOOOO...', '..OHHHHHHHHHHO..', '..OLMMMMMMMMLO..', '..OLMMMMMMMMLO..',
    '...OMMMMMMMMO...', '...OMMMMMMMMO...', '...OMMMMMMMMO...', '....OhMMMMhO....',
    '....OhhhhhhO....', '....OOOOOOOO....', '................', '................'
  ], itemPal([186, 188, 196]));
  function filledBucket(name, col) {
    tex(name, function (g) {
      g.copyFrom(data('bucket'));
      g.rect(4, 7, 8, 5, col);
      g.rect(4, 7, 8, 1, mix(col, [255, 255, 255], 0.3));
    });
  }
  filledBucket('water_bucket', [58, 106, 200]);
  filledBucket('lava_bucket', [214, 94, 18]);

  itemArt('feather', [
    '................', '.........OO.....', '........OHHO....', '.......OHHLO....',
    '......OHHLLO....', '......OHLLMO....', '.....OHLLMO.....', '.....OLLMMO.....',
    '....OLMMMO......', '....OMMMO.......', '....OMMO........', '...OMMO.........',
    '...OMO..........', '..OMO...........', '..OO............', '................'
  ], itemPal([236, 238, 244], 0.5));

  itemArt('leather', [
    '................', '................', '..OOOOOOOOOO....', '.OHHLLLLLLLHO...',
    '.OLMMMMMMMMMO...', '.OLMMMMMMMMMO...', '.OMMMMMMMMMMO...', '.OMMMMMMMMMMO...',
    '.OMMMMMMMMMMO...', '.OhMMMMMMMMhO...', '.OhhMMMMMMhhO...', '..OhhhhhhhhO....',
    '..OOOOOOOOOO....', '................', '................', '................'
  ], itemPal([150, 105, 65], 0.55));

  tex('string', function (g) {
    g.fill([0, 0, 0], 0);
    for (var i = 0; i < 13; i++) {
      var x = 4 + ((Math.sin(i * 0.8) * 3 + 3) | 0);
      g.set(x, 2 + i, [236, 236, 240]); g.set(x + 1, 2 + i, [196, 196, 202]);
    }
  });

  itemArt('wheat_item', [
    '................', '.....O..O..O....', '....OYOOYOOYO...', '....OYOOYOOYO...',
    '...OYYOOYYOYYO..', '...OYMOOYMOYMO..', '...OYMOOYMOYMO..', '....OMOOMOOMO...',
    '.....OMOOMOOM...', '.....OMOOMOOM...', '......OMOMOM....', '......OMOMOM....',
    '.......OMMM.....', '.......OMM......', '........O.......', '................'
  ], (function () { var p = itemPal([214, 188, 88], 0.6); p.Y = [242, 220, 130]; return p; })());

  itemArt('sugar_cane_item', [
    '................', '......OOOO......', '......OMLO......', '......OMLO......',
    '......OhLO......', '......OMLO......', '......OMLO......', '......OhLO......',
    '......OMLO......', '......OMLO......', '......OhLO......', '......OMLO......',
    '......OMLO......', '......OhLO......', '......OOOO......', '................'
  ], itemPal([132, 186, 96], 0.55));

  itemArt('paper', [
    '................', '................', '..OOOOOOOOOO....', '.OHHHHHHHHHHO...',
    '.OHMMMMMMMMHO...', '.OHMhhhhhMMHO...', '.OHMMMMMMMMHO...', '.OHMhhhhhhMHO...',
    '.OHMMMMMMMMHO...', '.OHMhhhhMMMHO...', '.OHMMMMMMMMHO...', '.OHHHHHHHHHHO...',
    '..OOOOOOOOOO....', '................', '................', '................'
  ], itemPal([242, 242, 238], 0.4));

  itemArt('book', [
    '................', '..OOOOOOOOOO....', '.OHHLLLLLLLHO...', '.OHMMMMMMMMMO...',
    '.OHMLLLLLLLMO...', '.OHMLMMMMMLMO...', '.OHMLMMMMMLMO...', '.OHMLMMMMMLMO...',
    '.OHMLLLLLLLMO...', '.OHMMMMMMMMMO...', '.OHhhhhhhhhhO...', '..OOOOOOOOOO....',
    '................', '................', '................', '................'
  ], (function () { var p = itemPal([158, 62, 56], 0.6); p.L = [238, 234, 220]; p.M = [214, 208, 190]; return p; })());

  itemArt('bowl', [
    '................', '................', '................', '................',
    '................', '................', '..OOOOOOOOOOOO..', '.OHLLLLLLLLLLHO.',
    '.OMMMMMMMMMMMMO.', '.OhMMMMMMMMMMhO.', '..OhMMMMMMMMhO..', '...OhhMMMMhhO...',
    '....OOhhhhOO....', '......OOOO......', '................', '................'
  ], itemPal([146, 108, 62], 0.6));

  // Fleisch: gezeichnete Form statt Zufallsklumpen
  var FLEISCH = [
    '................', '................', '.....OOOOO......', '....OHLLLMO.....',
    '...OHLMMMMMO....', '..OHLMMMMMMMO...', '..OLMMMMMMMMO...', '..OMMMMMMMMMO...',
    '..OMMMMMMMMhO...', '...OMMMMMMMhO...', '...OhMMMMMhhO...', '....OhhMMhhO....',
    '.....OOhhOO.....', '.......OO.......', '................', '................'
  ];
  function meat(name, base, spread) { itemArt(name, FLEISCH, itemPal(base, spread)); }
  meat('porkchop_raw', [236, 158, 158], 0.6);
  meat('porkchop_cooked', [196, 138, 80], 0.6);
  meat('beef_raw', [186, 70, 68], 0.6);
  meat('beef_cooked', [148, 94, 54], 0.6);
  meat('chicken_raw', [232, 192, 162], 0.55);
  meat('chicken_cooked', [192, 142, 78], 0.6);
  meat('mutton_raw', [212, 108, 108], 0.6);
  meat('mutton_cooked', [172, 118, 68], 0.6);

  itemArt('shears', [
    '................', '..OO........OO..', '.OMMO......OMMO.', '.OMMO......OMMO.',
    '..OMMO....OMMO..', '..OMMO....OMMO..', '...OMMO..OMMO...', '....OMMOOMMO....',
    '.....OMMMMO.....', '......OKKO......', '.....OKOOKO.....', '....OKO..OKO....',
    '....OKO..OKO....', '....OKO..OKO....', '....OOO..OOO....', '................'
  ], itemPal([202, 202, 208]));

  itemArt('flint_and_steel', [
    '................', '................', '....OOO.........', '...OMMMO........',
    '...OMMMO....OO..', '...OMMMO...OKKO.', '....OMMMO.OKKKO.', '.....OMMMOKKKKO.',
    '......OMMMKKKO..', '.......OMMOKO...', '........OMMO....', '.........OMO....',
    '..........O.....', '................', '................', '................'
  ], itemPal([196, 196, 202]));

  itemArt('blaze_rod', [
    '................', '.......OO.......', '......OHLO......', '......OMLO......',
    '......OMLO......', '......OhLO......', '......OMLO......', '......OMLO......',
    '......OhLO......', '......OMLO......', '......OMLO......', '......OhLO......',
    '......OMLO......', '......OMLO......', '.......OO.......', '................'
  ], itemPal([246, 190, 52], 0.7));

  function kugel(name, cols) {
    tex(name, function (g) {
      g.fill([0, 0, 0], 0);
      g.nest(8, 8, 5.2, [cols[0], cols[1], cols[2]]);
      g.nest(7, 6, 2.0, [cols[1], cols[3] || cols[1], cols[0]]);
    });
  }
  kugel('ender_pearl', [[42, 138, 120], [110, 210, 186], [22, 74, 66], [214, 250, 240]]);
  kugel('ender_eye', [[46, 160, 132], [120, 224, 196], [20, 62, 54], [220, 252, 242]]);

  // Bogen: der Ruecken woelbt sich nach rechts, die Sehne laeuft links
  function bowArt(pull) {
    var bauch = [5, 4, 3, 2][pull], sehne = [1, 2, 3, 4][pull], rows = [];
    for (var y = 0; y < 16; y++) {
      var r = '................'.split('');
      var t = Math.abs(y - 7.5) / 7.5;
      var bx = 3 + Math.round(bauch * (1 - t * t));
      if (y === 0 || y === 15) { r[bx] = 'O'; r[bx + 1] = 'O'; r[bx + 2] = 'O'; }
      else { r[bx] = 'O'; r[bx + 1] = 'W'; r[bx + 2] = 'w'; r[bx + 3] = 'O'; }
      if (y > 0 && y < 15) r[sehne] = 'N';
      rows.push(r.join('').slice(0, 16));
    }
    if (pull > 0) {
      var mid = rows[8].split('');
      for (var x = 1; x < 14; x++) if (mid[x] === '.') mid[x] = 'w';
      mid[14] = 'M'; mid[13] = 'H';
      rows[8] = mid.join('').slice(0, 16);
    }
    return rows;
  }
  ['bow', 'bow_pull_0', 'bow_pull_1', 'bow_pull_2'].forEach(function (name, i) {
    itemArt(name, bowArt(i), itemPal([202, 202, 208]));
  });

  itemArt('lever', [
    '................', '................', '................', '................',
    '.........OOO....', '........OWWO....', '........OWWO....', '.......OWWO.....',
    '......OWWO......', '.....OOWO.......', '...OOOOOO.......', '..OHHHHHHhO.....',
    '..OMMMMMMMO.....', '..OMMMMMMMO.....', '..OhhhhhhhO.....', '..OOOOOOOOO.....'
  ], itemPal([128, 128, 132]));

  itemArt('compass', [
    '................', '.....OOOOOO.....', '...OOHHHHHHOO...', '..OHMMMMMMMMHO..',
    '.OHMMOOOOOOMMHO.', '.OHMOOKKKKOOMHO.', '.OMMOKKRKKKOMMO.', '.OMMOKKRKKKOMMO.',
    '.OMMOKKKRKKOMMO.', '.OMMOKKKRKKOMMO.', '.OHMOOKKKKOOMHO.', '.OHMMOOOOOOMMHO.',
    '..OHMMMMMMMMHO..', '...OOHHHHHHOO...', '.....OOOOOO.....', '................'
  ], itemPal([188, 190, 198]));

  // ============================================================
  //  ZUGRIFF
  // ============================================================
  T.names = names;
  T.count = function () { return names.length; };
  T.layer = function (name) {
    var i = index[name];
    return i === undefined ? index['white'] : i;
  };
  T.has = function (name) { return index[name] !== undefined; };
  T.data = function (name) { return datas[index[name]]; };

  T.buildBuffer = function () {
    var n = names.length;
    var buf = new Uint8Array(TILE * TILE * 4 * n);
    for (var i = 0; i < n; i++) buf.set(datas[i], i * TILE * TILE * 4);
    return buf;
  };

  // ---- Canvas-Kachel (fuer UI-Icons) ----
  var tileCache = {};
  T.tileCanvas = function (name, bright) {
    var key = name + '|' + bright;
    if (tileCache[key]) return tileCache[key];
    var c = document.createElement('canvas');
    c.width = TILE; c.height = TILE;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(TILE, TILE);
    var src = datas[index[name] === undefined ? index['white'] : index[name]];
    for (var i = 0; i < src.length; i += 4) {
      img.data[i] = src[i] * bright;
      img.data[i + 1] = src[i + 1] * bright;
      img.data[i + 2] = src[i + 2] * bright;
      img.data[i + 3] = src[i + 3];
    }
    ctx.putImageData(img, 0, 0);
    tileCache[key] = c;
    return c;
  };

})();
