/* ============================================================
   textures.js  -  Prozedurale 16x16 Pixel-Texturen (keine externen Dateien!)
                   -> WebGL2 TEXTURE_2D_ARRAY + Icon-Canvas fürs UI
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

  var _rnd = MC.U.rng(1);

  // ---------- Zeichen-Helfer ----------
  function G(seed) {
    this.d = new Uint8ClampedArray(TILE * TILE * 4);
    this.r = MC.U.rng(seed);
  }
  G.prototype.set = function (x, y, c, a) {
    // blob() läuft mit halben Schritten – ohne das Abrunden landet der
    // Byte-Index zwischen zwei Pixeln und die Farbkanäle verrutschen.
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    var i = (y * TILE + x) * 4;
    this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
    this.d[i + 3] = a === undefined ? 255 : a;
  };
  G.prototype.get = function (x, y) {
    var i = ((y & 15) * TILE + (x & 15)) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  };
  G.prototype.fill = function (c, a) {
    for (var y = 0; y < TILE; y++) for (var x = 0; x < TILE; x++) this.set(x, y, c, a);
    return this;
  };
  G.prototype.rect = function (x0, y0, w, h, c, a) {
    for (var y = y0; y < y0 + h; y++) for (var x = x0; x < x0 + w; x++) this.set(x, y, c, a);
    return this;
  };
  G.prototype.frame = function (x0, y0, w, h, c, a) {
    for (var x = x0; x < x0 + w; x++) { this.set(x, y0, c, a); this.set(x, y0 + h - 1, c, a); }
    for (var y = y0; y < y0 + h; y++) { this.set(x0, y, c, a); this.set(x0 + w - 1, y, c, a); }
    return this;
  };
  // Zufälliges Helligkeitsrauschen auf allen deckenden Pixeln
  G.prototype.noise = function (amt) {
    for (var i = 0; i < this.d.length; i += 4) {
      if (this.d[i + 3] === 0) continue;
      var f = 1 + (this.r() * 2 - 1) * amt;
      this.d[i] *= f; this.d[i + 1] *= f; this.d[i + 2] *= f;
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
  G.prototype.shade = function (f) {
    for (var i = 0; i < this.d.length; i += 4) {
      this.d[i] *= f; this.d[i + 1] *= f; this.d[i + 2] *= f;
    }
    return this;
  };
  G.prototype.copy = function (other) {
    this.d.set(other.d);
    return this;
  };

  var seedCounter = 1000;
  function tex(name, fn) {
    var g = new G(MC.U.hashString(name) ^ (seedCounter++));
    fn(g);
    index[name] = names.length;
    names.push(name);
    datas.push(g.d);
    return g;
  }
  T.add = tex;

  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function dark(c, f) { return [c[0] * f, c[1] * f, c[2] * f]; }

  // ============================================================
  //  BLOCK-TEXTUREN
  // ============================================================
  var C = {
    stone: [128, 128, 128], dirt: [134, 96, 67], grass: [116, 168, 74],
    cobble: [122, 122, 122], sand: [219, 207, 163], gravel: [130, 125, 124],
    plank: [162, 130, 78], logSide: [104, 83, 50], logTop: [156, 126, 74],
    leaf: [56, 118, 39], water: [58, 106, 200], lava: [214, 94, 18],
    snow: [246, 250, 250], ice: [140, 180, 245], clay: [160, 166, 179],
    obsidian: [22, 18, 32], brick: [150, 84, 68], bedrock: [85, 85, 85]
  };

  function stoneBase(g, col) {
    g.fill(col); g.noise(0.10);
    for (var i = 0; i < 14; i++) {
      var x = (g.r() * 16) | 0, y = (g.r() * 16) | 0;
      g.set(x, y, dark(col, 0.86));
    }
  }

  tex('stone', function (g) { stoneBase(g, C.stone); });
  tex('bedrock', function (g) {
    g.fill(C.bedrock); g.noise(0.28);
    for (var i = 0; i < 26; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [40, 40, 40]);
  });
  tex('dirt', function (g) { g.fill(C.dirt); g.noise(0.13); g.speck(20, dark(C.dirt, 0.8)); });
  tex('grass_top', function (g) { g.fill(C.grass); g.noise(0.13); g.speck(22, dark(C.grass, 0.85)); g.speck(10, mix(C.grass, [255, 255, 255], 0.15)); });
  tex('grass_side', function (g) {
    g.fill(C.dirt); g.noise(0.13); g.speck(16, dark(C.dirt, 0.8));
    for (var x = 0; x < 16; x++) {
      var h = 2 + ((g.r() * 3) | 0);
      for (var y = 0; y < h; y++) {
        var c = mix(C.grass, dark(C.grass, 0.75), g.r() * 0.6);
        g.set(x, y, c);
      }
    }
  });
  tex('cobblestone', function (g) {
    g.fill(dark(C.cobble, 0.72));
    var cells = [[0, 0, 7, 5], [8, 0, 8, 7], [0, 6, 5, 5], [6, 8, 5, 4], [12, 8, 4, 5], [0, 12, 6, 4], [6, 13, 10, 3], [12, 4, 4, 3]];
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i];
      var col = mix(C.cobble, [160, 160, 160], g.r() * 0.5);
      for (var y = c[1]; y < c[1] + c[3] - 1; y++)
        for (var x = c[0]; x < c[0] + c[2] - 1; x++)
          g.set(x, y, col);
    }
    g.noise(0.09);
  });
  tex('mossy_cobblestone', function (g) {
    var src = datas[index['cobblestone']];
    for (var i = 0; i < g.d.length; i += 4) { g.d[i] = src[i]; g.d[i + 1] = src[i + 1]; g.d[i + 2] = src[i + 2]; g.d[i + 3] = 255; }
    for (var k = 0; k < 70; k++) {
      var x = (g.r() * 16) | 0, y = (g.r() * 16) | 0;
      g.set(x, y, mix([70, 110, 55], [110, 150, 70], g.r()));
    }
    g.noise(0.08);
  });
  tex('stone_bricks', function (g) {
    g.fill([120, 120, 120]);
    var mortar = [98, 98, 98];
    for (var x = 0; x < 16; x++) { g.set(x, 7, mortar); g.set(x, 15, mortar); }
    for (var y = 0; y < 8; y++) g.set(7, y, mortar);
    for (var y2 = 8; y2 < 16; y2++) g.set(15, y2, mortar);
    g.noise(0.08);
  });
  tex('brick_block', function (g) {
    g.fill([172, 172, 172]);
    var rows = [[0, 3, 0], [4, 7, 4], [8, 11, 0], [12, 15, 4]];
    for (var r = 0; r < rows.length; r++) {
      for (var y = rows[r][0]; y <= rows[r][1] - 1; y++) {
        for (var x = 0; x < 16; x++) {
          var seg = ((x + rows[r][2]) % 8);
          if (seg === 7) g.set(x, y, [172, 172, 172]);
          else g.set(x, y, mix(C.brick, dark(C.brick, 0.85), g.r() * 0.5));
        }
      }
    }
    g.noise(0.05);
  });
  tex('sand', function (g) { g.fill(C.sand); g.noise(0.07); g.speck(24, dark(C.sand, 0.92)); });
  tex('sandstone', function (g) {
    g.fill(mix(C.sand, [230, 220, 175], 0.4)); g.noise(0.05);
    for (var y = 0; y < 16; y++) if (y % 5 === 0) for (var x = 0; x < 16; x++) g.set(x, y, dark(C.sand, 0.88));
  });
  tex('sandstone_top', function (g) { g.fill(mix(C.sand, [235, 225, 180], 0.5)); g.noise(0.06); g.speck(18, dark(C.sand, 0.9)); });
  tex('sandstone_bottom', function (g) { g.fill(dark(C.sand, 0.9)); g.noise(0.08); });
  tex('gravel', function (g) {
    g.fill(C.gravel); g.noise(0.16);
    for (var i = 0; i < 22; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1, mix(C.gravel, g.r() > 0.5 ? [90, 88, 88] : [170, 165, 160], 0.6));
  });
  tex('clay', function (g) { g.fill(C.clay); g.noise(0.07); g.speck(16, dark(C.clay, 0.92)); });
  tex('snow_block', function (g) { g.fill(C.snow); g.noise(0.04); g.speck(12, [225, 235, 240]); });
  tex('ice', function (g) {
    g.fill(C.ice, 190); g.noise(0.07);
    for (var i = 0; i < 8; i++) {
      var x = (g.r() * 16) | 0, y = (g.r() * 16) | 0, l = 3 + ((g.r() * 5) | 0);
      for (var k = 0; k < l; k++) g.set(x + k, y + ((k * 0.5) | 0), mix(C.ice, [255, 255, 255], 0.45), 210);
    }
  });
  tex('obsidian', function (g) {
    g.fill(C.obsidian); g.noise(0.25);
    for (var i = 0; i < 10; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [80, 50, 130]);
  });

  // ---- Erze ----
  function ore(name, col, n) {
    tex(name, function (g) {
      stoneBase(g, C.stone);
      for (var i = 0; i < n; i++) {
        var x = 1 + ((g.r() * 13) | 0), y = 1 + ((g.r() * 13) | 0);
        var sz = g.r() > 0.5 ? 2 : 1;
        for (var a = 0; a < sz; a++) for (var b = 0; b < sz; b++)
          g.set(x + a, y + b, mix(col, [255, 255, 255], g.r() * 0.35));
      }
    });
  }
  ore('coal_ore', [30, 30, 30], 5);
  ore('iron_ore', [205, 160, 120], 5);
  ore('gold_ore', [250, 205, 60], 5);
  ore('diamond_ore', [95, 235, 230], 5);
  ore('redstone_ore', [220, 40, 40], 5);
  ore('lapis_ore', [45, 70, 190], 5);
  ore('emerald_ore', [40, 215, 100], 4);

  // ---- Metallblöcke ----
  function metalBlock(name, col) {
    tex(name, function (g) {
      g.fill(col); g.noise(0.06);
      g.frame(0, 0, 16, 16, dark(col, 0.82));
      g.frame(1, 1, 14, 14, mix(col, [255, 255, 255], 0.18));
      g.rect(3, 3, 10, 10, col);
      g.noise(0.05);
    });
  }
  metalBlock('iron_block', [220, 220, 220]);
  metalBlock('gold_block', [249, 215, 66]);
  metalBlock('diamond_block', [110, 235, 225]);
  metalBlock('lapis_block', [45, 80, 190]);
  metalBlock('emerald_block', [45, 210, 105]);
  tex('coal_block', function (g) { g.fill([28, 28, 28]); g.noise(0.22); g.speck(24, [55, 55, 55]); });

  // ---- Holz ----
  function planks(name, col) {
    tex(name, function (g) {
      g.fill(col); g.noise(0.06);
      for (var y = 0; y < 16; y++) {
        if (y % 4 === 3) for (var x = 0; x < 16; x++) g.set(x, y, dark(col, 0.75));
      }
      for (var i = 0; i < 20; i++) {
        var x2 = (g.r() * 16) | 0, y2 = (g.r() * 16) | 0;
        if (y2 % 4 !== 3) g.set(x2, y2, dark(col, 0.9));
      }
      g.set(3, 1, dark(col, 0.8)); g.set(11, 5, dark(col, 0.8)); g.set(6, 9, dark(col, 0.8));
    });
  }
  planks('planks_oak', C.plank);
  planks('planks_birch', [196, 178, 123]);
  planks('planks_spruce', [114, 84, 48]);

  function logTex(name, side, top) {
    tex(name, function (g) {
      g.fill(side); g.noise(0.09);
      for (var x = 0; x < 16; x++) {
        if (g.r() < 0.35) {
          var h = 4 + ((g.r() * 9) | 0), y0 = (g.r() * 8) | 0;
          for (var y = y0; y < y0 + h && y < 16; y++) g.set(x, y, dark(side, 0.8));
        }
      }
    });
    tex(name + '_top', function (g) {
      g.fill(top); g.noise(0.07);
      for (var ry = 0; ry < 16; ry++) for (var rx = 0; rx < 16; rx++) {
        var d = Math.sqrt((rx - 7.5) * (rx - 7.5) + (ry - 7.5) * (ry - 7.5));
        if (Math.abs((d % 3) - 1.5) < 0.5) g.set(rx, ry, dark(top, 0.82));
        if (d > 7.2) g.set(rx, ry, dark(side, 1.0));
      }
    });
  }
  logTex('log_oak', C.logSide, C.logTop);
  logTex('log_birch', [216, 214, 208], [196, 178, 123]);
  logTex('log_spruce', [58, 40, 22], [114, 84, 48]);

  function leaves(name, col) {
    tex(name, function (g) {
      g.fill(col);
      for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
        var v = g.r();
        if (v < 0.085) { g.set(x, y, [0, 0, 0], 0); continue; }
        // ruhigere Blattstruktur: leichte Aufhellung/Abdunklung statt harter Sprenkel
        var t = (v - 0.5) * 0.34;
        g.set(x, y, mix(col, t > 0 ? [190, 225, 150] : [10, 34, 8], Math.abs(t)));
      }
    });
  }
  leaves('leaves_oak', C.leaf);
  leaves('leaves_birch', [78, 138, 52]);
  leaves('leaves_spruce', [38, 92, 46]);

  // ---- Glas / Wasser / Lava ----
  tex('glass', function (g) {
    g.fill([255, 255, 255], 0);
    g.frame(0, 0, 16, 16, [214, 240, 245], 170);
    g.frame(1, 1, 14, 14, [190, 225, 235], 70);
    for (var i = 0; i < 6; i++) {
      var x = 3 + ((g.r() * 10) | 0), y = 3 + ((g.r() * 10) | 0);
      g.set(x, y, [255, 255, 255], 120); g.set(x + 1, y, [255, 255, 255], 90);
    }
  });
  tex('water', function (g) {
    g.fill(C.water, 185); g.noise(0.05);
    for (var i = 0; i < 20; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, mix(C.water, [255, 255, 255], 0.22), 195);
  });
  tex('lava', function (g) {
    g.fill(C.lava); g.noise(0.12);
    for (var i = 0; i < 16; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1, mix(C.lava, [255, 230, 90], 0.55 + g.r() * 0.4));
    for (var k = 0; k < 10; k++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [130, 40, 10]);
  });

  // ---- Wolle ----
  var woolCols = {
    white: [234, 236, 236], orange: [240, 118, 19], magenta: [189, 68, 179], light_blue: [58, 175, 217],
    yellow: [248, 198, 39], lime: [112, 185, 25], pink: [237, 141, 172], gray: [62, 68, 71],
    light_gray: [142, 142, 134], cyan: [21, 137, 145], purple: [121, 42, 172], blue: [53, 57, 157],
    brown: [114, 71, 40], green: [84, 109, 27], red: [160, 39, 34], black: [20, 21, 25]
  };
  Object.keys(woolCols).forEach(function (k) {
    tex('wool_' + k, function (g) {
      var col = woolCols[k];
      g.fill(col); g.noise(0.09);
      for (var i = 0; i < 30; i++) {
        var x = (g.r() * 16) | 0, y = (g.r() * 16) | 0;
        g.set(x, y, mix(col, [255, 255, 255], 0.18));
        g.set(x + 1, y + 1, dark(col, 0.86));
      }
    });
  });

  // ---- Funktionsblöcke ----
  // Fackel: Stiel liegt exakt in den Spalten 7..8, Flamme in den Zeilen 6..7.
  // Der Mesher bildet genau diesen Ausschnitt auf den 2x10x2-Pixel-Quader ab.
  tex('torch', function (g) {
    g.fill([0, 0, 0], 0);
    for (var y = 8; y < 16; y++) { g.set(7, y, [152, 114, 67]); g.set(8, y, [118, 87, 50]); }
    g.set(7, 10, [128, 95, 55]); g.set(8, 13, [102, 75, 43]);
    g.set(7, 7, [255, 168, 38]); g.set(8, 7, [255, 138, 24]);
    g.set(7, 6, [255, 242, 176]); g.set(8, 6, [255, 214, 108]);
  });
  tex('crafting_table_top', function (g) {
    g.fill(C.plank); g.noise(0.06);
    g.frame(0, 0, 16, 16, dark(C.plank, 0.7));
    for (var y = 2; y < 15; y += 4) for (var x = 0; x < 16; x++) g.set(x, y, dark(C.plank, 0.78));
    for (var x2 = 4; x2 < 16; x2 += 5) for (var y2 = 1; y2 < 15; y2++) g.set(x2, y2, dark(C.plank, 0.8));
  });
  tex('crafting_table_side', function (g) {
    var src = datas[index['planks_oak']];
    g.d.set(src);
    g.rect(1, 3, 6, 5, dark(C.plank, 0.72));
    g.rect(9, 3, 6, 5, dark(C.plank, 0.72));
    g.rect(2, 10, 12, 4, [128, 100, 60]);
  });
  tex('crafting_table_front', function (g) {
    var src = datas[index['planks_oak']];
    g.d.set(src);
    g.rect(2, 2, 12, 5, [120, 94, 56]);
    g.rect(3, 3, 4, 3, [90, 70, 42]);
    g.rect(9, 3, 4, 3, [90, 70, 42]);
    g.rect(2, 9, 12, 5, [140, 112, 66]);
  });
  tex('furnace_top', function (g) { stoneBase(g, [110, 110, 110]); g.frame(0, 0, 16, 16, [88, 88, 88]); });
  tex('furnace_side', function (g) { stoneBase(g, [110, 110, 110]); });
  tex('furnace_front', function (g) {
    stoneBase(g, [110, 110, 110]);
    g.rect(3, 5, 10, 8, [60, 60, 60]);
    g.rect(4, 6, 8, 6, [38, 38, 38]);
    g.rect(3, 3, 10, 2, [88, 88, 88]);
  });
  tex('furnace_front_lit', function (g) {
    stoneBase(g, [110, 110, 110]);
    g.rect(3, 5, 10, 8, [60, 60, 60]);
    g.rect(4, 6, 8, 6, [30, 20, 12]);
    for (var i = 0; i < 26; i++) {
      var x = 4 + ((g.r() * 8) | 0), y = 8 + ((g.r() * 4) | 0);
      g.set(x, y, mix([255, 160, 30], [255, 240, 130], g.r()));
    }
    g.rect(3, 3, 10, 2, [88, 88, 88]);
  });
  tex('chest_top', function (g) {
    g.fill([150, 110, 60]); g.noise(0.06);
    g.frame(0, 0, 16, 16, [92, 66, 34]);
    g.rect(1, 1, 14, 3, [122, 90, 48]);
  });
  tex('chest_side', function (g) {
    g.fill([150, 110, 60]); g.noise(0.06);
    g.frame(0, 0, 16, 16, [92, 66, 34]);
    for (var x = 0; x < 16; x++) { g.set(x, 5, [92, 66, 34]); g.set(x, 6, [110, 80, 42]); }
  });
  tex('chest_front', function (g) {
    g.fill([150, 110, 60]); g.noise(0.05);
    g.frame(0, 0, 16, 16, [92, 66, 34]);
    for (var x = 0; x < 16; x++) { g.set(x, 5, [92, 66, 34]); g.set(x, 6, [110, 80, 42]); }
    g.rect(7, 4, 3, 4, [70, 60, 40]);
    g.rect(7, 5, 3, 2, [225, 200, 90]);
    g.set(8, 6, [90, 78, 30]);
  });
  tex('tnt_side', function (g) {
    g.fill([190, 60, 50]); g.noise(0.05);
    g.rect(0, 4, 16, 5, [235, 235, 235]);
    for (var x = 2; x < 14; x++) g.set(x, 6, [40, 40, 40]);
    g.rect(4, 5, 2, 3, [40, 40, 40]); g.rect(10, 5, 2, 3, [40, 40, 40]);
    g.rect(0, 0, 16, 2, [150, 45, 38]); g.rect(0, 14, 16, 2, [150, 45, 38]);
  });
  tex('tnt_top', function (g) { g.fill([210, 70, 58]); g.noise(0.06); g.rect(5, 5, 6, 6, [235, 235, 235]); g.frame(5, 5, 6, 6, [60, 60, 60]); });
  tex('tnt_bottom', function (g) { g.fill([150, 45, 38]); g.noise(0.08); });
  tex('bookshelf', function (g) {
    var src = datas[index['planks_oak']];
    g.d.set(src);
    var bookCols = [[160, 60, 55], [70, 100, 165], [190, 165, 80], [80, 140, 80], [150, 90, 160], [180, 120, 60]];
    [1, 9].forEach(function (row) {
      var x = 1;
      while (x < 15) {
        var w = 1 + ((g.r() * 2) | 0);
        var c = bookCols[(g.r() * bookCols.length) | 0];
        for (var xx = x; xx < x + w && xx < 15; xx++) for (var y = row; y < row + 6; y++) g.set(xx, y, y === row ? dark(c, 0.7) : c);
        x += w + 1;
      }
    });
  });
  tex('glowstone', function (g) {
    g.fill([160, 125, 65]); g.noise(0.1);
    for (var i = 0; i < 22; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1, mix([255, 230, 140], [255, 255, 200], g.r()));
  });

  // ---- Pflanzen / Natur ----
  tex('cactus_side', function (g) {
    g.fill([48, 116, 48]); g.noise(0.07);
    g.rect(0, 0, 1, 16, [30, 82, 32]); g.rect(15, 0, 1, 16, [30, 82, 32]);
    for (var i = 0; i < 12; i++) g.set(2 + ((g.r() * 12) | 0), (g.r() * 16) | 0, [180, 200, 150]);
  });
  tex('cactus_top', function (g) { g.fill([60, 130, 55]); g.noise(0.08); g.blob(8, 8, 4, [80, 150, 70]); });
  tex('cactus_bottom', function (g) { g.fill([40, 96, 40]); g.noise(0.08); });
  tex('pumpkin_top', function (g) {
    g.fill([200, 128, 30]); g.noise(0.06);
    g.rect(6, 6, 4, 4, [110, 140, 60]);
  });
  tex('pumpkin_side', function (g) {
    g.fill([205, 130, 30]); g.noise(0.05);
    for (var x = 0; x < 16; x += 3) for (var y = 0; y < 16; y++) g.set(x, y, [170, 100, 22]);
    g.rect(0, 0, 16, 2, [140, 88, 20]);
  });
  tex('pumpkin_face', function (g) {
    var src = datas[index['pumpkin_side']];
    g.d.set(src);
    var dk = [60, 34, 8];
    g.rect(3, 5, 3, 3, dk); g.rect(10, 5, 3, 3, dk);
    g.set(4, 8, dk); g.set(11, 8, dk);
    g.rect(4, 10, 8, 2, dk);
    g.set(5, 12, dk); g.set(8, 12, dk); g.set(10, 12, dk);
  });

  function crossPlant(name, fn) { tex(name, function (g) { g.fill([0, 0, 0], 0); fn(g); }); }
  crossPlant('tall_grass', function (g) {
    for (var x = 1; x < 15; x++) {
      if (g.r() < 0.55) continue;
      var h = 5 + ((g.r() * 8) | 0);
      for (var y = 15; y > 15 - h; y--) g.set(x + (((15 - y) * 0.15 * (g.r() > 0.5 ? 1 : -1)) | 0), y, mix([90, 150, 60], [130, 190, 80], g.r()));
    }
  });
  crossPlant('dead_bush', function (g) {
    for (var i = 0; i < 6; i++) {
      var x = 3 + ((g.r() * 10) | 0), y = 15;
      var h = 5 + ((g.r() * 7) | 0);
      for (var k = 0; k < h; k++) { g.set(x, y - k, [124, 92, 42]); if (g.r() < 0.3) x += g.r() > 0.5 ? 1 : -1; }
    }
  });
  function flower(name, petal, center) {
    crossPlant(name, function (g) {
      for (var y = 8; y < 16; y++) g.set(7, y, [70, 130, 50]);
      g.set(5, 11, [70, 130, 50]); g.set(4, 10, [80, 145, 55]);
      g.set(10, 12, [70, 130, 50]); g.set(11, 11, [80, 145, 55]);
      g.blob(7, 5, 3, petal);
      g.set(7, 5, center); g.set(8, 5, center); g.set(7, 4, center);
    });
  }
  flower('flower_red', [200, 45, 45], [230, 210, 80]);
  flower('flower_yellow', [240, 210, 50], [255, 245, 190]);
  flower('flower_blue', [80, 110, 220], [200, 210, 250]);
  crossPlant('mushroom_red', function (g) {
    g.rect(6, 9, 4, 6, [225, 220, 210]);
    g.blob(8, 7, 5, [200, 45, 45]);
    g.set(5, 6, [240, 240, 240]); g.set(10, 5, [240, 240, 240]); g.set(8, 4, [240, 240, 240]);
  });
  crossPlant('mushroom_brown', function (g) {
    g.rect(6, 10, 4, 5, [215, 200, 180]);
    g.blob(8, 8, 4, [150, 110, 78]);
  });
  function sapling(name, leafCol, trunkCol) {
    crossPlant(name, function (g) {
      for (var y = 10; y < 16; y++) g.set(8, y, trunkCol);
      g.blob(8, 7, 4, leafCol);
      g.blob(5, 9, 2, leafCol); g.blob(11, 9, 2, leafCol);
      g.noise(0.12);
    });
  }
  sapling('sapling_oak', [70, 130, 45], [110, 82, 48]);
  sapling('sapling_birch', [95, 155, 60], [200, 198, 190]);
  sapling('sapling_spruce', [42, 96, 50], [70, 52, 30]);
  crossPlant('sugar_cane', function (g) {
    for (var x = 6; x < 10; x++) for (var y = 0; y < 16; y++) g.set(x, y, mix([148, 200, 110], [110, 170, 80], (x - 6) / 3));
    for (var y2 = 0; y2 < 16; y2 += 5) for (var x2 = 6; x2 < 10; x2++) g.set(x2, y2, [95, 150, 70]);
  });

  tex('farmland', function (g) {
    g.fill(dark(C.dirt, 0.86)); g.noise(0.09);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) if (x % 5 === 0) g.set(x, y, dark(C.dirt, 0.66));
  });
  for (var ws = 0; ws < 4; ws++) {
    (function (s) {
      crossPlant('wheat_stage' + s, function (g) {
        var col = s < 2 ? [90, 160, 60] : (s === 2 ? [160, 180, 70] : [214, 190, 90]);
        var h = 5 + s * 3;
        for (var x = 2; x < 15; x += 4) {
          for (var y = 15; y > 15 - h; y--) g.set(x, y, col);
          if (s >= 2) { g.set(x - 1, 15 - h + 1, col); g.set(x + 1, 15 - h + 2, col); }
        }
      });
    })(ws);
  }
  tex('bed_top', function (g) {
    g.fill([170, 40, 40]); g.noise(0.05);
    g.rect(2, 1, 12, 5, [235, 235, 235]);
    g.frame(0, 0, 16, 16, [140, 32, 32]);
  });
  tex('bed_side', function (g) {
    g.fill([170, 40, 40]); g.noise(0.05);
    g.rect(0, 10, 16, 6, [150, 118, 70]);
    g.rect(0, 0, 16, 3, [225, 225, 225]);
  });

  // ---- Zerstörungs-Stadien ----
  for (var cs = 0; cs < 10; cs++) {
    (function (s) {
      tex('crack_' + s, function (g) {
        g.fill([0, 0, 0], 0);
        var n = 2 + s * 3;
        var rr = MC.U.rng(4242);
        for (var i = 0; i < n; i++) {
          var x = (rr() * 16) | 0, y = (rr() * 16) | 0;
          var len = 2 + ((rr() * 6) | 0);
          var dx = rr() > 0.5 ? 1 : 0, dy = dx ? (rr() > 0.5 ? 1 : 0) : 1;
          for (var k = 0; k < len; k++) g.set(x + dx * k, y + dy * k, [0, 0, 0], 130 + s * 10);
        }
      });
    })(cs);
  }

  // ---- Himmel / Effekte ----
  tex('sun', function (g) { g.fill([255, 245, 200]); });
  tex('moon', function (g) {
    g.fill([225, 228, 235]);
    g.blob(5, 6, 2, [195, 198, 210]); g.blob(11, 10, 2, [200, 203, 215]); g.blob(9, 4, 1, [205, 208, 218]);
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
    g.fill([146, 58, 56]); g.noise(0.16);
    for (var i = 0; i < 26; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1, [108, 38, 36]);
    g.speck(20, [178, 78, 72]);
  });
  tex('soul_sand', function (g) {
    g.fill([84, 64, 52]); g.noise(0.12);
    // angedeutete Gesichter
    for (var i = 0; i < 3; i++) {
      var cx = 3 + ((g.r() * 10) | 0), cy = 3 + ((g.r() * 10) | 0);
      g.blob(cx, cy, 2, [62, 46, 36]);
      g.set(cx - 1, cy - 1, [44, 32, 26]); g.set(cx + 1, cy - 1, [44, 32, 26]);
      g.set(cx, cy + 1, [44, 32, 26]);
    }
  });
  tex('quartz_ore', function (g) {
    g.fill([146, 58, 56]); g.noise(0.14);
    [[3, 3, 4, 4], [10, 2, 3, 3], [9, 9, 4, 4], [2, 10, 3, 3]].forEach(function (k) {
      g.rect(k[0] - 1, k[1] - 1, k[2] + 2, k[3] + 2, [88, 28, 28]);
      g.rect(k[0], k[1], k[2], k[3], [238, 233, 226]);
      g.rect(k[0], k[1], k[2] - 1, 1, [255, 255, 255]);
      g.rect(k[0] + 1, k[1] + k[3] - 1, k[2] - 1, 1, [186, 180, 172]);
    });
  });
  tex('quartz_block', function (g) { g.fill([236, 231, 222]); g.noise(0.05); g.speck(14, [214, 208, 198]); });
  tex('nether_bricks', function (g) {
    g.fill([120, 66, 72]); g.noise(0.09);
    for (var y = 0; y < 16; y += 4) {
      for (var x = 0; x < 16; x++) g.set(x, y, [74, 36, 42]);
      var off = (y % 8 === 0) ? 0 : 8;
      for (var k = 0; k < 16; k += 8) g.rect(((k + off) % 16), y + 1, 1, 3, [74, 36, 42]);
    }
    g.speck(16, [150, 92, 96]);
  });
  tex('magma_block', function (g) {
    g.fill([64, 26, 18]); g.noise(0.14);
    for (var i = 0; i < 22; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1.4, mix([255, 150, 40], [220, 70, 20], g.r()));
  });
  tex('portal_nether', function (g) {
    g.fill([48, 12, 78]); g.noise(0.22);
    for (var i = 0; i < 40; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, mix([150, 70, 230], [225, 190, 255], g.r()));
  });

  // ============================================================
  //  AETHER
  // ============================================================
  var AE_GRASS = [138, 216, 190], AE_DIRT = [150, 128, 106];
  tex('aether_grass_top', function (g) {
    g.fill(AE_GRASS); g.noise(0.10);
    g.speck(24, mix(AE_GRASS, [255, 255, 255], 0.35));
    g.speck(14, dark(AE_GRASS, 0.86));
  });
  tex('aether_dirt', function (g) { g.fill(AE_DIRT); g.noise(0.12); g.speck(18, dark(AE_DIRT, 0.85)); });
  tex('aether_grass_side', function (g) {
    g.fill(AE_DIRT); g.noise(0.12);
    for (var x = 0; x < 16; x++) {
      var h = 3 + ((g.r() * 3) | 0);
      for (var y = 0; y < h; y++) g.set(x, y, AE_GRASS);
    }
    g.noise(0.06);
  });
  tex('holystone', function (g) {
    g.fill([206, 202, 190]); g.noise(0.09);
    g.speck(22, [182, 178, 166]); g.speck(10, [226, 224, 214]);
  });
  tex('mossy_holystone', function (g) {
    g.fill([196, 200, 178]); g.noise(0.10);
    for (var i = 0; i < 26; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1.3, [138, 176, 118]);
  });
  tex('holystone_bricks', function (g) {
    g.fill([202, 198, 186]); g.noise(0.06);
    for (var y = 0; y < 16; y += 8) {
      for (var x = 0; x < 16; x++) { g.set(x, y, [168, 164, 152]); g.set(x, y + 7, [168, 164, 152]); }
      var off = y === 0 ? 0 : 8;
      g.rect(off, y, 1, 8, [168, 164, 152]);
      g.rect((off + 8) % 16, y, 1, 8, [168, 164, 152]);
    }
  });
  tex('quicksoil', function (g) {
    g.fill([238, 226, 158]); g.noise(0.05);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) if (((x + y) & 3) === 0) g.set(x, y, [250, 242, 196]);
  });
  tex('icestone', function (g) {
    g.fill([180, 214, 236]); g.noise(0.07);
    for (var i = 0; i < 8; i++) g.blob(2 + ((g.r() * 12) | 0), 2 + ((g.r() * 12) | 0), 1.7, [226, 244, 255]);
  });
  // Erzadern im hellen Heiligstein gehen leicht unter. Darum große Kristalle
  // mit dunklem Rand, hellem Glanzpunkt und einem Hof aus Splittern.
  // Kompakter Kristall mit dunklem Rand und Glanzecke – so wie bei den
  // Oberweltserzen, nur kräftiger, weil Heiligstein sehr hell ist.
  function kristall(g, x, y, w, h, col) {
    g.rect(x - 1, y - 1, w + 2, h + 2, dark(col, 0.42));
    g.rect(x, y, w, h, col);
    g.rect(x, y, w - 1, 1, mix(col, [255, 255, 255], 0.55));
    g.set(x, y + 1, mix(col, [255, 255, 255], 0.35));
    g.rect(x + 1, y + h - 1, w - 1, 1, dark(col, 0.72));
  }

  function aetherOre(name, col) {
    tex(name, function (g) {
      g.fill([206, 202, 190]); g.noise(0.08); g.speck(14, [182, 178, 166]);
      kristall(g, 3, 3, 4, 4, col);
      kristall(g, 10, 2, 3, 3, col);
      kristall(g, 9, 9, 4, 4, col);
      kristall(g, 2, 10, 3, 3, col);
      g.set(7, 7, mix(col, [255, 255, 255], 0.4));
      g.set(8, 12, col);
    });
  }
  aetherOre('ambrosium_ore', [252, 178, 44]);
  aetherOre('gravitite_ore', [72, 226, 186]);
  // Zanit liegt im Nether, also im Netherrack statt im Heiligstein
  tex('zanite_ore', function (g) {
    g.fill([146, 58, 56]); g.noise(0.14);
    var col = [166, 104, 240];
    kristall(g, 3, 3, 4, 4, col);
    kristall(g, 10, 2, 3, 3, col);
    kristall(g, 9, 9, 4, 4, col);
    kristall(g, 2, 10, 3, 3, col);
  });

  tex('log_skyroot', function (g) {
    g.fill([120, 108, 96]); g.noise(0.10);
    for (var x = 0; x < 16; x += 3) for (var y = 0; y < 16; y++) g.set(x, y, [98, 88, 78]);
  });
  tex('log_skyroot_top', function (g) {
    g.fill([154, 142, 126]); g.noise(0.07);
    for (var r = 2; r < 8; r += 2) g.frame(8 - r, 8 - r, r * 2, r * 2, [122, 112, 100]);
  });
  tex('planks_skyroot', function (g) {
    g.fill([166, 154, 138]); g.noise(0.06);
    for (var y = 0; y < 16; y += 4) for (var x = 0; x < 16; x++) g.set(x, y, [134, 124, 110]);
  });
  tex('leaves_skyroot', function (g) {
    g.fill([0, 0, 0], 0);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      if (g.r() < 0.16) continue;
      g.set(x, y, mix([96, 186, 150], [58, 140, 108], g.r()));
    }
  });
  tex('log_golden_oak', function (g) {
    g.fill([176, 142, 74]); g.noise(0.10);
    for (var x = 0; x < 16; x += 4) for (var y = 0; y < 16; y++) g.set(x, y, [140, 110, 54]);
  });
  tex('log_golden_oak_top', function (g) {
    g.fill([206, 172, 96]); g.noise(0.07);
    for (var r = 2; r < 8; r += 2) g.frame(8 - r, 8 - r, r * 2, r * 2, [166, 134, 68]);
  });
  tex('leaves_golden_oak', function (g) {
    g.fill([0, 0, 0], 0);
    for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
      if (g.r() < 0.16) continue;
      g.set(x, y, mix([238, 206, 96], [196, 158, 52], g.r()));
    }
  });
  function cloudTex(name, col) {
    tex(name, function (g) {
      g.fill(col, 205); g.noise(0.05);
      for (var i = 0; i < 20; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 2, mix(col, [255, 255, 255], 0.5), 190);
    });
  }
  cloudTex('aercloud', [238, 246, 252]);
  cloudTex('aercloud_blue', [150, 196, 250]);
  cloudTex('aercloud_golden', [250, 228, 150]);

  tex('aether_flower', function (g) {
    g.fill([0, 0, 0], 0);
    for (var y = 9; y < 16; y++) g.set(8, y, [88, 156, 122]);
    g.blob(8, 6, 2.4, [226, 156, 236]);
    g.blob(8, 6, 1, [255, 236, 150]);
  });
  tex('blueberry_bush', function (g) {
    g.fill([0, 0, 0], 0);
    for (var i = 0; i < 60; i++) g.set(3 + ((g.r() * 10) | 0), 5 + ((g.r() * 10) | 0), [72, 132, 96]);
    for (var k = 0; k < 6; k++) g.blob(4 + ((g.r() * 9) | 0), 7 + ((g.r() * 7) | 0), 1.1, [72, 86, 190]);
  });
  tex('portal_aether', function (g) {
    g.fill([120, 186, 236]); g.noise(0.16);
    for (var i = 0; i < 44; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, mix([190, 232, 255], [255, 255, 255], g.r()));
  });

  // ============================================================
  //  MOB-TEXTUREN
  // ============================================================
  function mobTex(name, base, fn) {
    tex(name, function (g) { g.fill(base); g.noise(0.05); if (fn) fn(g); });
  }
  mobTex('mob_pig', [240, 150, 150]);
  mobTex('mob_pig_face', [240, 150, 150], function (g) {
    g.rect(3, 4, 3, 3, [20, 20, 25]); g.rect(10, 4, 3, 3, [20, 20, 25]);
    g.rect(4, 9, 8, 5, [225, 120, 130]);
    g.rect(6, 11, 1, 2, [150, 70, 80]); g.rect(9, 11, 1, 2, [150, 70, 80]);
  });
  mobTex('mob_cow', [70, 52, 40]);
  mobTex('mob_cow_face', [70, 52, 40], function (g) {
    g.rect(2, 2, 12, 8, [235, 235, 235]);
    g.rect(3, 4, 3, 3, [20, 20, 25]); g.rect(10, 4, 3, 3, [20, 20, 25]);
    g.rect(5, 10, 6, 4, [190, 150, 150]);
  });
  mobTex('mob_cow_spot', [235, 235, 235]);
  mobTex('mob_sheep', [235, 235, 235], function (g) {
    for (var i = 0; i < 40; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [212, 212, 212]);
  });
  mobTex('mob_sheep_face', [225, 212, 200], function (g) {
    g.rect(3, 5, 3, 3, [20, 20, 25]); g.rect(10, 5, 3, 3, [20, 20, 25]);
    g.rect(5, 11, 6, 2, [160, 145, 135]);
  });
  mobTex('mob_chicken', [235, 235, 235]);
  mobTex('mob_chicken_face', [235, 235, 235], function (g) {
    g.rect(3, 5, 2, 2, [25, 25, 25]); g.rect(11, 5, 2, 2, [25, 25, 25]);
    g.rect(6, 8, 4, 3, [240, 170, 40]);
    g.rect(6, 1, 4, 3, [200, 50, 45]);
  });
  mobTex('mob_zombie', [60, 100, 60]);
  mobTex('mob_zombie_face', [80, 125, 70], function (g) {
    g.rect(3, 5, 3, 3, [20, 30, 25]); g.rect(10, 5, 3, 3, [20, 30, 25]);
    g.rect(5, 11, 6, 1, [35, 55, 35]);
    g.speck(20, [64, 100, 58]);
  });
  mobTex('mob_zombie_shirt', [70, 90, 150]);
  mobTex('mob_skeleton', [200, 200, 198]);
  mobTex('mob_skeleton_face', [205, 205, 202], function (g) {
    g.rect(3, 5, 3, 3, [25, 25, 25]); g.rect(10, 5, 3, 3, [25, 25, 25]);
    g.rect(5, 11, 6, 1, [70, 70, 70]);
    g.set(6, 12, [70, 70, 70]); g.set(9, 12, [70, 70, 70]);
  });
  mobTex('mob_creeper', [70, 175, 70], function (g) {
    for (var i = 0; i < 34; i++) {
      var x = (g.r() * 16) | 0, y = (g.r() * 16) | 0;
      g.set(x, y, mix([70, 175, 70], [40, 120, 45], g.r() * 0.9));
    }
  });
  mobTex('mob_creeper_face', [70, 175, 70], function (g) {
    for (var i = 0; i < 26; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [45, 130, 50]);
    g.rect(3, 4, 4, 4, [20, 20, 20]); g.rect(9, 4, 4, 4, [20, 20, 20]);
    g.rect(6, 8, 4, 5, [20, 20, 20]);
    g.rect(5, 10, 2, 3, [20, 20, 20]); g.rect(9, 10, 2, 3, [20, 20, 20]);
  });
  mobTex('mob_creeper_flash', [255, 240, 240]);

  // ---------- Dorfbewohner ----------
  var VILL_SKIN = [200, 156, 126];
  mobTex('mob_villager', VILL_SKIN);
  mobTex('mob_villager_nose', dark(VILL_SKIN, 0.74));
  mobTex('mob_villager_face', VILL_SKIN, function (g) {
    g.rect(0, 0, 16, 3, [86, 62, 46]);                       // Haarkranz
    g.rect(2, 4, 12, 1, [92, 68, 50]);                       // Augenbrauen
    g.rect(3, 5, 3, 2, [245, 245, 250]); g.rect(10, 5, 3, 2, [245, 245, 250]);
    g.rect(4, 5, 1, 2, [60, 90, 160]); g.rect(11, 5, 1, 2, [60, 90, 160]);
    g.rect(6, 12, 4, 1, [140, 100, 80]);                     // Mund
  });
  // Ein Robenmuster je Beruf: Grundton plus Schürze und Gürtel
  [['bauer', [140, 108, 66], [190, 175, 140]],
   ['bibliothekar', [200, 200, 205], [110, 78, 150]],
   ['schmied', [70, 70, 78], [60, 52, 44]],
   ['metzger', [225, 225, 225], [190, 70, 60]],
   ['steinmetz', [150, 150, 155], [120, 96, 60]]
  ].forEach(function (p) {
    mobTex('mob_villager_' + p[0], [122, 88, 62], function (g) {
      g.rect(0, 0, 16, 5, [122, 88, 62]);                    // Kragen
      g.rect(0, 5, 16, 11, p[1]);
      g.rect(0, 9, 16, 2, p[2]);                             // Gürtel
      g.rect(6, 5, 4, 11, dark(p[1], 0.86));                 // Mittelnaht
      g.noise(0.05);
    });
  });
  mobTex('player_skin', [80, 130, 200]);
  mobTex('player_face', [222, 175, 138], function (g) {
    g.rect(0, 0, 16, 4, [90, 62, 38]);
    g.rect(3, 6, 3, 2, [70, 90, 160]); g.rect(10, 6, 3, 2, [70, 90, 160]);
    g.rect(6, 11, 4, 1, [140, 96, 80]);
  });
  mobTex('item_shadow', [0, 0, 0]);

  // ============================================================
  //  ITEM-TEXTUREN
  // ============================================================
  function itemTex(name, fn) { tex(name, function (g) { g.fill([0, 0, 0], 0); fn(g); }); }

  itemTex('stick', function (g) {
    for (var i = 0; i < 9; i++) { g.set(4 + i, 12 - i, [140, 104, 60]); g.set(5 + i, 12 - i, [116, 84, 46]); g.set(4 + i, 13 - i, [116, 84, 46]); }
  });
  function nugget(name, col) {
    itemTex(name, function (g) {
      g.blob(8, 8, 4, col);
      g.blob(7, 7, 2, mix(col, [255, 255, 255], 0.4));
      g.blob(10, 11, 1, dark(col, 0.7));
    });
  }
  nugget('coal', [40, 40, 40]);
  nugget('charcoal', [58, 50, 44]);
  nugget('clay_ball', [160, 166, 179]);
  nugget('flint', [60, 55, 55]);
  nugget('gunpowder', [90, 90, 90]);
  nugget('sugar', [242, 242, 245]);
  nugget('redstone', [200, 30, 30]);
  nugget('lapis', [45, 70, 190]);
  nugget('glowstone_dust', [250, 235, 160]);

  function ingot(name, col) {
    itemTex(name, function (g) {
      for (var y = 6; y < 11; y++) {
        var pad = y === 6 ? 4 : (y === 10 ? 4 : 3);
        for (var x = pad; x < 16 - pad; x++) g.set(x, y, y < 8 ? mix(col, [255, 255, 255], 0.25) : col);
      }
      for (var x2 = 4; x2 < 12; x2++) g.set(x2, 11, dark(col, 0.7));
    });
  }
  ingot('iron_ingot', [216, 216, 216]);
  ingot('gold_ingot', [250, 210, 60]);
  ingot('brick', [150, 84, 68]);

  function gem(name, col) {
    itemTex(name, function (g) {
      var pts = [[7, 3], [8, 3], [5, 5], [10, 5], [4, 7], [11, 7], [5, 10], [10, 10], [7, 12], [8, 12]];
      for (var y = 4; y < 12; y++) for (var x = 4; x < 12; x++) {
        var d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
        if (d < 4.5) g.set(x, y, d < 2 ? mix(col, [255, 255, 255], 0.45) : col);
      }
      for (var i = 0; i < pts.length; i++) g.set(pts[i][0], pts[i][1], dark(col, 0.75));
    });
  }
  gem('diamond', [110, 235, 225]);
  gem('emerald', [45, 210, 105]);
  gem('zanite_gemstone', [126, 86, 190]);
  gem('gravitite', [96, 190, 168]);
  nugget('quartz', [232, 226, 218]);
  nugget('blueberries', [82, 96, 200]);
  ingot('nether_brick', [96, 46, 52]);
  // Ambrosium: leuchtender Scherben
  itemTex('ambrosium_shard', function (g) {
    var pts = [[8, 3], [11, 6], [12, 10], [9, 13], [5, 12], [3, 8], [5, 5]];
    for (var y = 3; y < 14; y++) for (var x = 3; x < 14; x++) {
      if (Math.abs(x - 8) + Math.abs(y - 8) < 5) g.set(x, y, [246, 176, 60]);
    }
    for (var i = 0; i < pts.length; i++) g.set(pts[i][0], pts[i][1], [255, 226, 140]);
    g.blob(7, 7, 1.4, [255, 240, 190]);
  });

  itemTex('feather', function (g) {
    for (var i = 0; i < 10; i++) g.set(5 + ((i * 0.4) | 0), 13 - i, [220, 220, 225]);
    g.blob(8, 6, 3, [245, 245, 250]);
    g.blob(9, 5, 1, [255, 255, 255]);
  });
  itemTex('leather', function (g) { g.blob(8, 8, 5, [150, 105, 65]); g.noise(0.12); });
  itemTex('bone', function (g) {
    for (var y = 4; y < 13; y++) { g.set(7, y, [235, 235, 225]); g.set(8, y, [210, 210, 200]); }
    g.blob(6, 3, 1, [240, 240, 230]); g.blob(9, 3, 1, [240, 240, 230]);
    g.blob(6, 13, 1, [240, 240, 230]); g.blob(9, 13, 1, [240, 240, 230]);
  });
  itemTex('string', function (g) {
    for (var i = 0; i < 12; i++) g.set(4 + ((Math.sin(i * 0.8) * 3 + 3) | 0), 3 + i, [230, 230, 230]);
  });
  itemTex('wheat_item', function (g) {
    for (var x = 5; x < 11; x += 2) for (var y = 3; y < 14; y++) g.set(x, y, [222, 196, 90]);
    for (var i = 0; i < 12; i++) g.set(4 + ((g.r() * 8) | 0), 3 + ((g.r() * 6) | 0), [245, 225, 130]);
  });
  itemTex('seeds', function (g) {
    for (var i = 0; i < 8; i++) g.blob(4 + ((g.r() * 8) | 0), 5 + ((g.r() * 7) | 0), 1, [120, 165, 70]);
  });
  itemTex('sugar_cane_item', function (g) {
    for (var x = 6; x < 10; x++) for (var y = 2; y < 15; y++) g.set(x, y, [148, 200, 110]);
    for (var y2 = 3; y2 < 15; y2 += 4) for (var x2 = 6; x2 < 10; x2++) g.set(x2, y2, [110, 160, 80]);
  });
  itemTex('paper', function (g) { g.rect(3, 3, 10, 11, [248, 248, 245]); g.rect(4, 5, 8, 1, [200, 200, 200]); g.rect(4, 8, 8, 1, [200, 200, 200]); g.rect(4, 11, 6, 1, [200, 200, 200]); });
  itemTex('book', function (g) { g.rect(3, 2, 11, 12, [150, 60, 55]); g.rect(4, 3, 9, 10, [235, 230, 215]); g.rect(3, 2, 2, 12, [110, 44, 40]); });
  itemTex('bowl', function (g) { for (var y = 8; y < 13; y++) { var pad = y === 12 ? 5 : 3; for (var x = pad; x < 16 - pad; x++) g.set(x, y, y === 8 ? [150, 110, 65] : [122, 88, 50]); } });
  itemTex('arrow', function (g) {
    for (var i = 0; i < 11; i++) g.set(4 + i, 11 - i, [160, 160, 160]);
    g.set(13, 2, [225, 225, 225]); g.set(14, 2, [225, 225, 225]); g.set(14, 3, [225, 225, 225]);
    g.set(3, 12, [200, 200, 205]); g.set(2, 13, [200, 200, 205]); g.set(4, 13, [200, 200, 205]);
  });

  // Nahrung
  itemTex('apple', function (g) {
    g.blob(8, 9, 5, [200, 40, 40]);
    g.blob(6, 7, 2, [230, 90, 80]);
    g.set(8, 3, [110, 80, 40]); g.set(8, 4, [110, 80, 40]);
    g.set(10, 3, [90, 160, 60]); g.set(11, 3, [90, 160, 60]);
  });
  itemTex('golden_apple', function (g) {
    g.blob(8, 9, 5, [245, 210, 70]);
    g.blob(6, 7, 2, [255, 240, 150]);
    g.set(8, 3, [140, 105, 40]); g.set(8, 4, [140, 105, 40]);
    g.set(10, 3, [200, 230, 120]);
  });
  itemTex('bread', function (g) {
    for (var y = 5; y < 12; y++) for (var x = 2; x < 14; x++) {
      var e = (x === 2 || x === 13 || y === 5 || y === 11);
      g.set(x, y, e ? [150, 100, 50] : [200, 150, 80]);
    }
    g.set(5, 7, [160, 110, 55]); g.set(9, 8, [160, 110, 55]);
  });
  function meat(name, col, cooked) {
    itemTex(name, function (g) {
      g.blob(8, 8, 5, col);
      if (cooked) { g.blob(6, 6, 2, mix(col, [90, 50, 30], 0.4)); g.blob(10, 10, 1, mix(col, [90, 50, 30], 0.4)); }
      else { g.blob(7, 7, 2, mix(col, [255, 255, 255], 0.3)); }
      g.noise(0.08);
    });
  }
  meat('porkchop_raw', [240, 160, 160], false);
  meat('porkchop_cooked', [200, 140, 80], true);
  meat('beef_raw', [190, 70, 70], false);
  meat('beef_cooked', [150, 95, 55], true);
  meat('chicken_raw', [235, 195, 165], false);
  meat('chicken_cooked', [195, 145, 80], true);
  meat('mutton_raw', [215, 110, 110], false);
  meat('mutton_cooked', [175, 120, 70], true);

  // Werkzeuge (Vorlagen + Farbtönung pro Material)
  var tierCol = {
    wood: [150, 112, 62], stone: [125, 125, 125], iron: [216, 216, 216],
    gold: [250, 210, 60], diamond: [110, 235, 225],
    holystone: [206, 202, 190], zanite: [138, 96, 206], gravitite: [104, 206, 182]
  };
  // Werkzeuge als Pixel-Vorlagen (16x16). H = Kopf, h = Kopfschatten,
  // S/s = Stiel, G/g = Griff. Kopf oben, Stiel diagonal nach unten links.
  var TOOL_ART = {
    pickaxe: [
      '................',
      '....hhh...hhh...',
      '...hHHHhhhHHHh..',
      '...hHHHHHHHHHh..',
      '....hhHHHHHhh...',
      '......SSSS......',
      '.....SSSs.......',
      '....SSSs........',
      '...SSSs.........',
      '..SSSs..........',
      '..SSs...........',
      '.SSs............',
      '.Ss.............',
      '................',
      '................',
      '................'
    ],
    axe: [
      '................',
      '....hhhh........',
      '...hHHHHh.......',
      '..hHHHHHHh......',
      '..hHHHHHHHh.....',
      '..hHHHHHSSS.....',
      '..hHHHHSSSs.....',
      '...hHHSSSs......',
      '....hhSSs.......',
      '.....SSs........',
      '....SSs.........',
      '...SSs..........',
      '..SSs...........',
      '..Ss............',
      '................',
      '................'
    ],
    shovel: [
      '................',
      '........hhhh....',
      '.......hHHHHh...',
      '.......hHHHHh...',
      '.......hHHHHh...',
      '........hHHh....',
      '.........SS.....',
      '........SSs.....',
      '.......SSs......',
      '......SSs.......',
      '.....SSs........',
      '....SSs.........',
      '...SSs..........',
      '..SSs...........',
      '..Ss............',
      '................'
    ],
    sword: [
      '................',
      '............hHh.',
      '...........hHHh.',
      '..........hHHHh.',
      '.........hHHHh..',
      '........hHHHh...',
      '.......hHHHh....',
      '......hHHHh.....',
      '.....hHHHh......',
      '....gHHHg.......',
      '...ggGgg........',
      '....gGg.........',
      '...gGg..........',
      '..gGg...........',
      '..gg............',
      '................'
    ],
    hoe: [
      '................',
      '.......hhhhhh...',
      '......hHHHHHHh..',
      '......hHHhhhh...',
      '......hHHh......',
      '......SSS.......',
      '.....SSs........',
      '....SSs.........',
      '...SSs..........',
      '..SSs...........',
      '..Ss............',
      '................',
      '................',
      '................',
      '................',
      '................'
    ]
  };

  function drawArt(g, art, pal) {
    for (var y = 0; y < 16; y++) {
      var row = art[y];
      if (!row) continue;
      for (var x = 0; x < 16; x++) {
        var c = pal[row.charAt(x)];
        if (c) g.set(x, y, c);
      }
    }
  }

  Object.keys(tierCol).forEach(function (t) {
    var col = tierCol[t];
    var pal = {
      H: col, h: dark(col, 0.62),
      S: [154, 116, 68], s: [110, 80, 44],
      G: [146, 110, 62], g: [88, 63, 34]
    };
    Object.keys(TOOL_ART).forEach(function (tp) {
      itemTex(t + '_' + tp, function (g) {
        drawArt(g, TOOL_ART[tp], pal);
        // dezenter Glanz auf dem Kopf
        for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
          if (TOOL_ART[tp][y] && TOOL_ART[tp][y].charAt(x) === 'H' &&
              TOOL_ART[tp][y - 1] && TOOL_ART[tp][y - 1].charAt(x) !== 'H') {
            g.set(x, y, mix(col, [255, 255, 255], 0.32));
          }
        }
      });
    });
  });

  itemTex('shears', function (g) {
    g.rect(4, 3, 2, 6, [200, 200, 205]); g.rect(10, 3, 2, 6, [200, 200, 205]);
    g.rect(5, 9, 2, 4, [120, 120, 125]); g.rect(9, 9, 2, 4, [120, 120, 125]);
    g.set(7, 8, [80, 80, 85]); g.set(8, 8, [80, 80, 85]);
  });
  // Bogen: Bogenrücken rechts, Sehne links. pull = 0..3 (0 = entspannt)
  function bowTex(name, pull) {
    itemTex(name, function (g) {
      var bend = 8 - pull * 1.6;          // Bogen wird beim Spannen flacher
      var stringX = 3 + pull * 1.6;       // Sehne wandert nach hinten
      for (var i = 0; i <= 14; i++) {
        var a = (i / 14) * Math.PI;
        var x = Math.round(3 + Math.sin(a) * bend);
        var y = 1 + i;
        g.set(x, y, [138, 100, 52]);
        g.set(x + 1, y, [104, 74, 38]);
      }
      // Sehne
      for (var k = 1; k <= 15; k++) g.set(Math.round(stringX), k, [238, 238, 238]);
      if (pull > 0) {
        // eingelegter Pfeil
        for (var xx = 1; xx < 14; xx++) { g.set(xx, 8, [150, 112, 66]); }
        g.set(14, 8, [225, 225, 230]); g.set(13, 8, [200, 200, 205]);
        g.set(2, 7, [240, 240, 240]); g.set(2, 9, [240, 240, 240]); g.set(3, 8, [240, 240, 240]);
      }
    });
  }
  bowTex('bow', 0);
  bowTex('bow_pull_0', 1);
  bowTex('bow_pull_1', 2);
  bowTex('bow_pull_2', 3);
  itemTex('bucket', function (g) {
    for (var y = 5; y < 14; y++) { var pad = 3 + ((y - 5) * 0.15) | 0; for (var x = pad; x < 16 - pad; x++) g.set(x, y, [190, 190, 195]); }
    g.rect(3, 5, 10, 1, [225, 225, 230]);
    g.rect(5, 7, 6, 5, [160, 160, 165]);
  });
  itemTex('water_bucket', function (g) {
    var src = datas[index['bucket']]; g.d.set(src);
    g.rect(5, 7, 6, 5, [58, 106, 200]);
  });
  itemTex('lava_bucket', function (g) {
    var src = datas[index['bucket']]; g.d.set(src);
    g.rect(5, 7, 6, 5, [214, 94, 18]);
  });
  itemTex('flint_and_steel', function (g) {
    g.rect(3, 6, 6, 5, [190, 190, 195]);
    g.blob(11, 9, 3, [60, 55, 55]);
  });

  // Rüstung
  var armorCol = {
    leather: [140, 96, 62], gold: [250, 210, 60], iron: [216, 216, 216], diamond: [110, 235, 225],
    zanite: [138, 96, 206], gravitite: [104, 206, 182]
  };
  Object.keys(armorCol).forEach(function (m) {
    var c = armorCol[m];
    itemTex(m + '_helmet', function (g) {
      g.rect(3, 3, 10, 7, c); g.rect(3, 10, 3, 3, c); g.rect(10, 10, 3, 3, c);
      g.rect(5, 6, 6, 3, [0, 0, 0], 0);
      g.rect(4, 4, 8, 1, mix(c, [255, 255, 255], 0.3));
    });
    itemTex(m + '_chestplate', function (g) {
      g.rect(3, 3, 10, 3, c); g.rect(2, 4, 2, 6, c); g.rect(12, 4, 2, 6, c);
      g.rect(4, 5, 8, 8, c); g.rect(6, 6, 4, 4, mix(c, [255, 255, 255], 0.22));
    });
    itemTex(m + '_leggings', function (g) {
      g.rect(3, 2, 10, 4, c); g.rect(3, 6, 4, 8, c); g.rect(9, 6, 4, 8, c);
      g.rect(4, 3, 8, 1, mix(c, [255, 255, 255], 0.25));
    });
    itemTex(m + '_boots', function (g) {
      g.rect(3, 6, 4, 6, c); g.rect(9, 6, 4, 6, c);
      g.rect(2, 11, 6, 3, c); g.rect(8, 11, 6, 3, c);
      g.rect(3, 7, 3, 1, mix(c, [255, 255, 255], 0.25));
    });
  });

  // ============================================================
  //  Nachträge: Mob-Körperteile ohne Gesicht, Entities, neue Blöcke
  // ============================================================
  // ---------- Nether-Mobs ----------
  mobTex('mob_piglin', [226, 152, 148]);
  mobTex('mob_piglin_shirt', [188, 148, 62]);
  mobTex('mob_piglin_face', [226, 152, 148], function (g) {
    g.rect(3, 5, 3, 2, [30, 26, 24]); g.rect(10, 5, 3, 2, [30, 26, 24]);
    g.rect(4, 9, 8, 5, [206, 118, 124]);
    g.rect(6, 11, 1, 2, [140, 66, 74]); g.rect(9, 11, 1, 2, [140, 66, 74]);
    g.rect(1, 4, 2, 4, [206, 130, 130]); g.rect(13, 4, 2, 4, [206, 130, 130]);
  });
  mobTex('mob_ghast', [232, 230, 232]);
  mobTex('mob_ghast_face', [232, 230, 232], function (g) {
    g.rect(3, 5, 3, 3, [20, 20, 24]); g.rect(10, 5, 3, 3, [20, 20, 24]);
    g.rect(4, 10, 8, 3, [20, 20, 24]);
  });
  mobTex('mob_magma', [58, 24, 18], function (g) {
    for (var i = 0; i < 26; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1.4, [86, 34, 24]);
  });
  mobTex('mob_magma_core', [252, 170, 50], function (g) {
    for (var i = 0; i < 22; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1.6, [255, 220, 110]);
  });
  mobTex('mob_magma_face', [58, 24, 18], function (g) {
    g.rect(3, 5, 3, 3, [255, 190, 60]); g.rect(10, 5, 3, 3, [255, 190, 60]);
    g.rect(5, 11, 6, 2, [255, 150, 40]);
  });

  // ---------- Aether-Mobs ----------
  // Moas gibt es in drei Farben – die Textur wählt der Renderer über mob.moaColor
  [['moa_blue', [124, 158, 226]], ['moa_white', [238, 238, 240]], ['moa_black', [72, 72, 82]]]
    .forEach(function (m) { mobTex('mob_' + m[0], m[1]); });
  mobTex('mob_moa_face', [226, 226, 230], function (g) {
    g.rect(3, 5, 2, 2, [25, 25, 30]); g.rect(11, 5, 2, 2, [25, 25, 30]);
    g.rect(6, 9, 4, 4, [240, 176, 60]);
  });
  mobTex('mob_phyg', [244, 186, 196]);
  mobTex('mob_phyg_wing', [252, 250, 248]);
  mobTex('mob_phyg_face', [244, 186, 196], function (g) {
    g.rect(3, 4, 3, 3, [20, 20, 25]); g.rect(10, 4, 3, 3, [20, 20, 25]);
    g.rect(4, 9, 8, 5, [226, 148, 164]);
    g.rect(6, 11, 1, 2, [156, 84, 100]); g.rect(9, 11, 1, 2, [156, 84, 100]);
  });
  mobTex('mob_sheepuff', [242, 246, 250], function (g) {
    for (var i = 0; i < 44; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1.6, [222, 232, 244]);
  });
  mobTex('mob_sheepuff_face', [232, 226, 220], function (g) {
    g.rect(3, 5, 3, 3, [20, 20, 25]); g.rect(10, 5, 3, 3, [20, 20, 25]);
    g.rect(5, 11, 6, 2, [176, 166, 158]);
  });
  mobTex('mob_zephyr', [222, 238, 252]);
  mobTex('mob_zephyr_face', [222, 238, 252], function (g) {
    g.rect(3, 5, 3, 3, [96, 140, 196]); g.rect(10, 5, 3, 3, [96, 140, 196]);
    g.rect(6, 10, 4, 2, [96, 140, 196]);
  });
  mobTex('mob_cockatrice', [92, 176, 132], function (g) {
    for (var i = 0; i < 30; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1.3, [70, 148, 108]);
  });
  mobTex('mob_cockatrice_face', [92, 176, 132], function (g) {
    g.rect(3, 5, 2, 2, [210, 60, 60]); g.rect(11, 5, 2, 2, [210, 60, 60]);
    g.rect(6, 9, 4, 4, [232, 176, 60]);
    g.rect(6, 1, 4, 3, [200, 60, 70]);
  });

  mobTex('mob_sheep_skin', [222, 210, 198]);
  mobTex('mob_chicken_leg', [238, 170, 48]);
  mobTex('mob_player_arm', [222, 175, 138]);
  mobTex('mob_cow_horn', [226, 222, 205]);

  // Pfeil als Entity: Schaft mit Spitze und Federn, längs der Flugrichtung
  tex('arrow_entity', function (g) {
    g.fill([0, 0, 0], 0);
    for (var x = 3; x < 13; x++) { g.set(x, 7, [150, 112, 66]); g.set(x, 8, [116, 86, 50]); }
    // Spitze
    g.set(13, 7, [200, 200, 205]); g.set(13, 8, [200, 200, 205]);
    g.set(14, 7, [225, 225, 230]); g.set(14, 8, [180, 180, 185]);
    g.set(15, 7, [235, 235, 240]);
    // Federn
    for (var i = 0; i < 3; i++) {
      g.set(3 + i, 5 + i, [238, 238, 240]); g.set(3 + i, 10 - i, [212, 212, 216]);
      g.set(2 + i, 6 + i, [222, 222, 226]);
    }
  });

  // Feuer (zwei Animationsstufen)
  for (var fi = 0; fi < 2; fi++) {
    (function (s) {
      tex('fire_' + s, function (g) {
        g.fill([0, 0, 0], 0);
        var rr = MC.U.rng(4711 + s * 97);
        for (var x = 0; x < 16; x++) {
          var hgt = 7 + ((rr() * 8) | 0) - Math.abs(x - 7.5) * 0.55;
          for (var y = 15; y > 15 - hgt; y--) {
            var t = (15 - y) / Math.max(1, hgt);
            var c = t < 0.35 ? [255, 232, 150] : (t < 0.7 ? [255, 168, 40] : [214, 78, 18]);
            if (rr() < 0.14 && t > 0.5) continue;
            g.set(x, y, c);
          }
        }
      });
    })(fi);
  }

  // Türen
  function doorTex(name, base, iron) {
    tex(name + '_upper', function (g) {
      g.fill(base); g.noise(0.05);
      g.frame(0, 0, 16, 16, dark(base, 0.7));
      g.rect(3, 3, 10, 8, dark(base, 0.86));
      g.frame(3, 3, 10, 8, dark(base, 0.62));
      if (iron) { g.rect(4, 4, 8, 6, mix(base, [255, 255, 255], 0.22)); }
      g.rect(1, 13, 14, 2, dark(base, 0.72));
      g.rect(12, 12, 2, 2, [232, 202, 90]);          // Knauf
    });
    tex(name + '_lower', function (g) {
      g.fill(base); g.noise(0.05);
      g.frame(0, 0, 16, 16, dark(base, 0.7));
      g.rect(3, 4, 10, 9, dark(base, 0.86));
      g.frame(3, 4, 10, 9, dark(base, 0.62));
      g.rect(1, 1, 14, 2, dark(base, 0.72));
      g.rect(12, 2, 2, 2, [232, 202, 90]);
    });
  }
  doorTex('door_oak', [156, 124, 74], false);
  doorTex('door_iron', [196, 196, 200], true);

  // Leiter
  tex('ladder', function (g) {
    g.fill([0, 0, 0], 0);
    for (var y = 0; y < 16; y++) { g.set(2, y, [138, 104, 60]); g.set(3, y, [110, 82, 47]); g.set(12, y, [138, 104, 60]); g.set(13, y, [110, 82, 47]); }
    for (var r = 1; r < 16; r += 5) for (var x = 3; x < 13; x++) { g.set(x, r, [150, 114, 66]); g.set(x, r + 1, [116, 86, 50]); }
  });

  // ============================================================
  //  DAS ENDE
  // ============================================================
  var END_STONE = [222, 224, 168];
  tex('end_stone', function (g) {
    g.fill(END_STONE); g.noise(0.07);
    g.speck(26, dark(END_STONE, 0.88)); g.speck(12, mix(END_STONE, [255, 255, 235], 0.5));
  });
  tex('end_stone_bricks', function (g) {
    g.fill(mix(END_STONE, [255, 255, 230], 0.15)); g.noise(0.05);
    var mortar = dark(END_STONE, 0.78);
    for (var y = 0; y < 16; y += 8) {
      for (var x = 0; x < 16; x++) { g.set(x, y, mortar); g.set(x, y + 7, mortar); }
      var off = y === 0 ? 0 : 8;
      g.rect(off, y, 1, 8, mortar);
      g.rect((off + 8) % 16, y, 1, 8, mortar);
    }
  });
  // Rahmen: heller Sockel, oben die eingelassene, grün leuchtende Platte
  tex('end_portal_frame_side', function (g) {
    g.fill(dark(END_STONE, 0.82)); g.noise(0.06);
    g.rect(0, 0, 16, 4, mix(END_STONE, [120, 176, 140], 0.45));
    for (var x = 0; x < 16; x++) g.set(x, 4, dark(END_STONE, 0.6));
  });
  tex('end_portal_frame_top', function (g) {
    g.fill(mix(END_STONE, [140, 190, 156], 0.4)); g.noise(0.05);
    g.frame(2, 2, 12, 12, dark(END_STONE, 0.55));
    g.rect(3, 3, 10, 10, [46, 120, 96]);
    g.blob(8, 8, 3.2, [92, 210, 160]);
    g.blob(7, 7, 1.4, [190, 250, 220]);
  });
  // Derselbe Rahmen mit eingesetztem Enderauge
  tex('end_portal_frame_eye', function (g) {
    g.fill(mix(END_STONE, [140, 190, 156], 0.4)); g.noise(0.05);
    g.frame(2, 2, 12, 12, dark(END_STONE, 0.55));
    g.rect(3, 3, 10, 10, [20, 54, 46]);
    // Auge: querovale Iris mit dunkler Pupille und einem Glanzpunkt
    g.rect(4, 5, 8, 6, [58, 186, 150]);
    g.rect(5, 4, 6, 8, [58, 186, 150]);
    g.rect(6, 6, 4, 4, [14, 20, 28]);
    g.rect(6, 6, 2, 2, [190, 250, 232]);
  });
  // Portalfläche: Blick in einen Sternenhimmel
  tex('portal_end', function (g) {
    g.fill([6, 4, 14]);
    for (var i = 0; i < 46; i++) {
      var b = 0.35 + g.r() * 0.65;
      g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [200 * b, 220 * b, 255 * b]);
    }
    for (var k = 0; k < 8; k++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [190, 150, 255]);
  });
  tex('dragon_egg', function (g) {
    g.fill([16, 12, 24]); g.noise(0.2);
    for (var i = 0; i < 20; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1.5, [40, 26, 58]);
    for (var k = 0; k < 14; k++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [170, 120, 235]);
  });
  tex('end_crystal', function (g) {
    g.fill([0, 0, 0], 0);
    for (var y = 0; y < 16; y++) {
      for (var x = 0; x < 16; x++) {
        var d = Math.abs(x - 7.5) + Math.abs(y - 7.5);
        if (d > 8) continue;
        g.set(x, y, mix([232, 210, 140], [140, 96, 200], d / 8), 235);
      }
    }
    g.blob(7, 6, 2, [255, 248, 210], 250);
  });

  // Lebensbalken über Kreaturen (nur mit dem Gravitithelm sichtbar)
  tex('hpbar_bg', function (g) { g.fill([16, 16, 20], 210); g.frame(0, 0, 16, 16, [0, 0, 0]); });
  tex('hpbar_fill', function (g) {
    g.fill([214, 44, 44]);
    for (var x = 0; x < 16; x++) { g.set(x, 0, [255, 120, 120]); g.set(x, 15, [140, 20, 20]); }
  });

  // ---------- Enderdrache ----------
  var DRAGON = [30, 26, 40];
  mobTex('mob_dragon', DRAGON, function (g) {
    for (var i = 0; i < 26; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1.4, [46, 40, 62]);
  });
  mobTex('mob_dragon_wing', [22, 19, 32], function (g) {
    for (var y = 0; y < 16; y += 4) for (var x = 0; x < 16; x++) g.set(x, y, [44, 38, 60]);
  });
  mobTex('mob_dragon_face', DRAGON, function (g) {
    g.rect(2, 5, 4, 3, [214, 66, 226]); g.rect(10, 5, 4, 3, [214, 66, 226]);
    g.rect(3, 6, 2, 1, [255, 190, 255]); g.rect(11, 6, 2, 1, [255, 190, 255]);
    g.rect(4, 12, 8, 2, [16, 14, 22]);
  });

  // ---------- Lohe ----------
  mobTex('mob_blaze', [246, 178, 34], function (g) {
    for (var i = 0; i < 26; i++) g.blob((g.r() * 16) | 0, (g.r() * 16) | 0, 1.5, [252, 216, 96]);
  });
  mobTex('mob_blaze_face', [246, 178, 34], function (g) {
    g.rect(3, 5, 3, 3, [72, 30, 6]); g.rect(10, 5, 3, 3, [72, 30, 6]);
    g.rect(4, 11, 8, 2, [128, 52, 10]);
  });
  mobTex('mob_blaze_rod', [252, 214, 84], function (g) {
    for (var y = 0; y < 16; y += 3) for (var x = 0; x < 16; x++) g.set(x, y, [232, 150, 26]);
  });

  // ---------- Enderman ----------
  mobTex('mob_enderman', [18, 16, 22], function (g) {
    for (var i = 0; i < 16; i++) g.set((g.r() * 16) | 0, (g.r() * 16) | 0, [34, 30, 42]);
  });
  mobTex('mob_enderman_face', [18, 16, 22], function (g) {
    g.rect(1, 6, 6, 3, [206, 160, 255]);
    g.rect(9, 6, 6, 3, [206, 160, 255]);
    g.rect(2, 7, 4, 1, [255, 240, 255]);
    g.rect(10, 7, 4, 1, [255, 240, 255]);
  });

  // ---------- Items rund um das Enderauge ----------
  itemTex('blaze_rod', function (g) {
    for (var y = 1; y < 15; y++) { g.set(7, y, [252, 214, 84]); g.set(8, y, [226, 158, 30]); }
    g.set(7, 0, [255, 244, 180]); g.set(8, 0, [255, 224, 120]);
    g.set(7, 15, [180, 110, 20]); g.set(8, 15, [180, 110, 20]);
  });
  itemTex('blaze_powder', function (g) {
    for (var i = 0; i < 46; i++) {
      var x = 3 + ((g.r() * 10) | 0), y = 4 + ((g.r() * 9) | 0);
      g.set(x, y, mix([255, 226, 120], [226, 132, 24], g.r()));
    }
  });
  itemTex('ender_pearl', function (g) {
    g.blob(8, 8, 5.4, [24, 78, 70]);
    g.blob(8, 8, 4.2, [58, 168, 146]);
    g.blob(7, 6, 2.2, [140, 226, 206]);
    g.blob(6, 5, 1, [230, 255, 246]);
  });
  itemTex('ender_eye', function (g) {
    g.blob(8, 8, 5.4, [22, 62, 52]);
    g.blob(8, 8, 4.4, [52, 176, 140]);
    g.blob(8, 8, 2.2, [16, 20, 28]);
    g.blob(7, 7, 1, [200, 255, 236]);
  });

  // ---------- Kompass ----------
  itemTex('compass', function (g) {
    g.blob(8, 8, 6.6, [78, 78, 86]);
    g.blob(8, 8, 5.4, [188, 190, 198]);
    g.blob(8, 8, 4.2, [24, 26, 38]);
    for (var y = 4; y <= 7; y++) g.rect(7, y, 2, 1, [226, 58, 58]);
    for (var y2 = 9; y2 <= 12; y2++) g.rect(7, y2, 2, 1, [232, 232, 238]);
    g.rect(7, 7, 2, 2, [250, 250, 255]);
  });

  // ============================================================
  //  Zugriff
  // ============================================================
  T.names = names;
  T.count = function () { return names.length; };
  T.layer = function (name) {
    var i = index[name];
    return i === undefined ? index['white'] : i;
  };
  T.has = function (name) { return index[name] !== undefined; };
  T.data = function (name) { return datas[index[name]]; };

  // Kombinierter Puffer für gl.texImage3D
  T.buildBuffer = function () {
    var n = names.length;
    var buf = new Uint8Array(TILE * TILE * 4 * n);
    for (var i = 0; i < n; i++) buf.set(datas[i], i * TILE * TILE * 4);
    return buf;
  };

  // ---- Canvas-Kachel (für UI-Icons) ----
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
