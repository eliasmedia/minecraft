/* ============================================================
   worldgen.js  -  Prozedurale Weltgenerierung (Biome, Höhlen, Erze, Bäume)
   ============================================================ */
(function () {
  'use strict';

  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT, SEA = MC.SEA_LEVEL;
  var B = MC.Blocks;
  var U = MC.U;

  var ID = {};
  function ids() {
    ['air', 'stone', 'grass', 'dirt', 'sand', 'sandstone', 'gravel', 'water', 'lava', 'bedrock',
     'snow_block', 'clay', 'ice', 'cactus', 'sugar_cane', 'pumpkin', 'tall_grass', 'dead_bush',
     'flower_red', 'flower_yellow', 'flower_blue', 'mushroom_red', 'mushroom_brown',
     'log_oak', 'log_birch', 'log_spruce', 'leaves_oak', 'leaves_birch', 'leaves_spruce',
     'coal_ore', 'iron_ore', 'gold_ore', 'diamond_ore', 'redstone_ore', 'lapis_ore', 'emerald_ore'
    ].forEach(function (n) { ID[n] = B.id(n); });
  }

  // Biome-Konstanten
  var BIOME = {
    OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4,
    MOUNTAINS: 5, TAIGA: 6, SWAMP: 7, SNOW: 8
  };
  var BIOME_NAME = ['Ozean', 'Strand', 'Ebene', 'Wald', 'Wüste', 'Berge', 'Taiga', 'Sumpf', 'Verschneite Tundra'];

  function Gen(seed) {
    ids();
    this.seed = seed >>> 0;
    var s = this.seed;
    this.nCont = new U.Noise(s + 1);
    this.nDetail = new U.Noise(s + 2);
    this.nMount = new U.Noise(s + 3);
    this.nMountMask = new U.Noise(s + 4);
    this.nTemp = new U.Noise(s + 5);
    this.nHumid = new U.Noise(s + 6);
    this.nCave = new U.Noise(s + 7);
    this.nCave2 = new U.Noise(s + 8);
    this.nDirt = new U.Noise(s + 9);
    this.nTree = new U.Noise(s + 10);
    this.hCache = {};
    this.hCacheCount = 0;
  }
  MC.WorldGen = Gen;
  Gen.BIOME = BIOME;
  Gen.BIOME_NAME = BIOME_NAME;

  Gen.prototype.climate = function (x, z) {
    var cont = this.nCont.fbm2(x / 900, z / 900, 3);
    var temp = this.nTemp.fbm2(x / 620 + 100, z / 620 - 40, 3);
    var humid = this.nHumid.fbm2(x / 520 - 300, z / 520 + 220, 3);
    return { cont: cont, temp: temp, humid: humid };
  };

  Gen.prototype.heightAt = function (x, z, cl) {
    cl = cl || this.climate(x, z);
    var base = SEA + cl.cont * 30;
    var detail = this.nDetail.fbm2(x / 130, z / 130, 5) * 11;
    var mask = U.clamp(this.nMountMask.fbm2(x / 340 + 50, z / 340, 2) * 2.2 + 0.15, 0, 1);
    var mount = Math.abs(this.nMount.fbm2(x / 95, z / 95, 5)) * 62 * mask * mask;
    var h = base + detail + mount;
    // Wüsten & Ebenen etwas flacher
    if (cl.temp > 0.3 && cl.humid < -0.05) h = SEA + (h - SEA) * 0.6 + 2;
    if (cl.cont < -0.2) h = SEA + (h - SEA) * 0.75;
    return h;
  };

  Gen.prototype.biomeAt = function (x, z, h, cl) {
    cl = cl || this.climate(x, z);
    if (h === undefined) h = this.heightAt(x, z, cl);
    if (h < SEA - 1.5) return BIOME.OCEAN;
    if (h < SEA + 1.5) return BIOME.BEACH;
    if (h > SEA + 32) return cl.temp < -0.15 ? BIOME.SNOW : BIOME.MOUNTAINS;
    if (cl.temp < -0.32) return BIOME.SNOW;
    if (cl.temp < -0.12) return BIOME.TAIGA;
    if (cl.temp > 0.28 && cl.humid < -0.02) return BIOME.DESERT;
    if (cl.humid > 0.34 && cl.temp > 0 && h < SEA + 6) return BIOME.SWAMP;
    if (cl.humid > 0.12) return BIOME.FOREST;
    return BIOME.PLAINS;
  };

  Gen.prototype.columnInfo = function (x, z) {
    var key = x + ',' + z;
    var c = this.hCache[key];
    if (c) return c;
    var cl = this.climate(x, z);
    var h = this.heightAt(x, z, cl);
    var b = this.biomeAt(x, z, h, cl);
    c = { h: h, biome: b, cl: cl };
    // Cache begrenzen (Zähler statt Object.keys – das wäre O(n) pro Aufruf)
    if (++this.hCacheCount > 80000) { this.hCache = {}; this.hCacheCount = 0; }
    this.hCache[key] = c;
    return c;
  };

  // ---------- Höhlen ----------
  // Das 3D-Rauschen wird auf einem groben Gitter (4 Blöcke Kantenlänge) gesampelt
  // und trilinear interpoliert. Das ist ~60x schneller als pro Block und sieht
  // sogar etwas weicher aus.
  var GN = 5;        // Stützstellen in x/z  (0,4,8,12,16)
  var GYN = (WH / 4) + 1;  // Stützstellen in y

  Gen.prototype.buildCaveGrid = function (wx0, wz0) {
    var a = new Float32Array(GN * GN * GYN);
    var b = new Float32Array(GN * GN * GYN);
    var c = new Float32Array(GN * GN * GYN);
    for (var iy = 0; iy < GYN; iy++) {
      var y = iy * 4;
      for (var iz = 0; iz < GN; iz++) {
        var z = wz0 + iz * 4;
        for (var ix = 0; ix < GN; ix++) {
          var x = wx0 + ix * 4;
          var k = (iy * GN + iz) * GN + ix;
          a[k] = this.nCave.fbm3(x / 44, y / 26, z / 44, 3);
          b[k] = this.nCave2.fbm3(x / 70 + 200, y / 34, z / 70 - 100, 3);
          c[k] = (y < 48) ? this.nCave2.fbm3(x / 90 - 500, y / 40, z / 90 + 500, 2) : -1;
        }
      }
    }
    return { a: a, b: b, c: c };
  };

  function sampleGrid(g, lx, y, lz) {
    var fx = lx * 0.25, fy = y * 0.25, fz = lz * 0.25;
    var ix = fx | 0, iy = fy | 0, iz = fz | 0;
    if (ix > GN - 2) ix = GN - 2;
    if (iz > GN - 2) iz = GN - 2;
    if (iy > GYN - 2) iy = GYN - 2;
    var tx = fx - ix, ty = fy - iy, tz = fz - iz;
    var b0 = (iy * GN + iz) * GN + ix;
    var b1 = ((iy + 1) * GN + iz) * GN + ix;
    var c000 = g[b0], c100 = g[b0 + 1], c010 = g[b0 + GN], c110 = g[b0 + GN + 1];
    var c001 = g[b1], c101 = g[b1 + 1], c011 = g[b1 + GN], c111 = g[b1 + GN + 1];
    var x00 = c000 + (c100 - c000) * tx, x10 = c010 + (c110 - c010) * tx;
    var x01 = c001 + (c101 - c001) * tx, x11 = c011 + (c111 - c011) * tx;
    var z0 = x00 + (x10 - x00) * tz, z1 = x01 + (x11 - x01) * tz;
    return z0 + (z1 - z0) * ty;
  }

  Gen.prototype.isCaveAt = function (grid, lx, y, lz) {
    if (y < 4 || y > 118) return false;
    if (Math.abs(sampleGrid(grid.a, lx, y, lz)) < 0.045) return true;
    if (Math.abs(sampleGrid(grid.b, lx, y, lz)) < 0.036) return true;
    if (y < 40 && sampleGrid(grid.c, lx, y, lz) > 0.45) return true;
    return false;
  };

  // Einzelabfrage (für Werkzeuge außerhalb der Chunk-Generierung)
  Gen.prototype.isCave = function (x, y, z) {
    if (y < 4 || y > 118) return false;
    if (Math.abs(this.nCave.fbm3(x / 44, y / 26, z / 44, 3)) < 0.055) return true;
    if (Math.abs(this.nCave2.fbm3(x / 70 + 200, y / 34, z / 70 - 100, 3)) < 0.045) return true;
    if (y < 40 && this.nCave2.fbm3(x / 90 - 500, y / 40, z / 90 + 500, 2) > 0.42) return true;
    return false;
  };

  // ---------- Chunk generieren ----------
  Gen.prototype.generate = function (cx, cz, blocks, meta) {
    var wx0 = cx * CS, wz0 = cz * CS;
    var x, y, z, i;
    var caveGrid = this.buildCaveGrid(wx0, wz0);

    for (z = 0; z < CS; z++) {
      for (x = 0; x < CS; x++) {
        var wx = wx0 + x, wz = wz0 + z;
        var info = this.columnInfo(wx, wz);
        var h = Math.floor(info.h);
        var biome = info.biome;
        var dirtDepth = 3 + ((this.nDirt.n2(wx / 12, wz / 12) * 2) | 0);

        var topBlock = ID.grass, fillBlock = ID.dirt;
        switch (biome) {
          case BIOME.DESERT: topBlock = ID.sand; fillBlock = ID.sand; dirtDepth = 4; break;
          case BIOME.BEACH: topBlock = ID.sand; fillBlock = ID.sand; break;
          case BIOME.OCEAN: topBlock = ID.gravel; fillBlock = ID.dirt; break;
          case BIOME.SNOW: topBlock = ID.snow_block; fillBlock = ID.dirt; break;
          case BIOME.MOUNTAINS: if (h > SEA + 48) { topBlock = ID.stone; fillBlock = ID.stone; } break;
          case BIOME.SWAMP: topBlock = ID.grass; fillBlock = ID.dirt; break;
        }
        if (biome === BIOME.OCEAN && h > SEA - 6) topBlock = ID.sand;

        for (y = 0; y <= Math.max(h, SEA); y++) {
          i = x | (z << 4) | (y << 8);
          var id = ID.air;
          if (y <= 1 || (y <= 4 && U.hash3(wx, y, wz) < 0.5)) {
            id = ID.bedrock;
          } else if (y > h) {
            id = (y <= SEA) ? ID.water : ID.air;
          } else if (y === h) {
            id = topBlock;
          } else if (y > h - dirtDepth) {
            id = fillBlock;
          } else {
            id = ID.stone;
          }
          // Höhlen ausstanzen. Die obersten Schichten bleiben stehen, damit die
          // Oberfläche nicht durchlöchert wird und keine Bäume in der Luft hängen.
          // Nur an wenigen Stellen darf eine Höhle bis nach oben durchbrechen.
          var deepEnough = (y < h - 4) || (y < h && U.hash3(wx, 555, wz) < 0.05);
          if (id !== ID.bedrock && id !== ID.water && id !== ID.air && y > 4 && deepEnough) {
            if (this.isCaveAt(caveGrid, x, y, z)) {
              id = (y <= 8) ? ID.lava : ID.air;
              if (y >= h - 1 && h <= SEA) id = ID.water;
            }
          }
          if (id !== ID.air) blocks[i] = id;
        }

        // Sandstein unter Sand in Wüsten
        if (biome === BIOME.DESERT) {
          for (y = h - 1; y > h - 6 && y > 0; y--) {
            i = x | (z << 4) | (y << 8);
            if (blocks[i] === ID.sand) blocks[i] = B.id('sandstone');
          }
        }
        // Eis auf Wasser in kalten Biomen
        if (biome === BIOME.SNOW && h < SEA) {
          i = x | (z << 4) | (SEA << 8);
          if (blocks[i] === ID.water) blocks[i] = ID.ice;
        }
      }
    }

    this.genOres(cx, cz, blocks);
    this.decorate(cx, cz, blocks, meta);
  };

  // ---------- Erze ----------
  var ORES = [
    { id: 'coal_ore', tries: 22, size: 9, min: 6, max: 96 },
    { id: 'iron_ore', tries: 16, size: 7, min: 6, max: 68 },
    { id: 'gold_ore', tries: 3, size: 6, min: 6, max: 34 },
    { id: 'redstone_ore', tries: 5, size: 7, min: 5, max: 18 },
    { id: 'lapis_ore', tries: 2, size: 6, min: 12, max: 36 },
    { id: 'diamond_ore', tries: 2, size: 5, min: 5, max: 16 },
    { id: 'emerald_ore', tries: 1, size: 2, min: 6, max: 30 },
    { id: 'gravel', tries: 6, size: 24, min: 20, max: 90 },
    { id: 'dirt', tries: 8, size: 26, min: 20, max: 100 }
  ];

  Gen.prototype.genOres = function (cx, cz, blocks) {
    var rnd = U.rng((this.seed ^ (cx * 341873128) ^ (cz * 132897987)) >>> 0);
    for (var o = 0; o < ORES.length; o++) {
      var spec = ORES[o];
      var oid = B.id(spec.id);
      for (var t = 0; t < spec.tries; t++) {
        if (spec.tries < 3 && rnd() > 0.5) continue;
        var x = (rnd() * CS) | 0, z = (rnd() * CS) | 0;
        var y = spec.min + ((rnd() * (spec.max - spec.min)) | 0);
        var n = 2 + ((rnd() * spec.size) | 0);
        for (var k = 0; k < n; k++) {
          if (x < 0 || x >= CS || z < 0 || z >= CS || y < 1 || y >= WH) break;
          var i = x | (z << 4) | (y << 8);
          if (blocks[i] === ID.stone) blocks[i] = oid;
          var d = (rnd() * 6) | 0;
          if (d === 0) x++; else if (d === 1) x--; else if (d === 2) y++;
          else if (d === 3) y--; else if (d === 4) z++; else z--;
        }
      }
    }
  };

  // ---------- Dekoration (Bäume, Pflanzen) ----------
  Gen.prototype.decorate = function (cx, cz, blocks, meta) {
    var wx0 = cx * CS, wz0 = cz * CS;
    var self = this;

    function setBlock(lx, ly, lz, id, overwrite) {
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || ly < 0 || ly >= WH) return;
      var i = lx | (lz << 4) | (ly << 8);
      var cur = blocks[i];
      if (!overwrite && cur !== 0 && cur !== ID.leaves_oak && cur !== ID.leaves_birch && cur !== ID.leaves_spruce) return;
      blocks[i] = id;
    }

    // Bäume: erweiterter Bereich, damit Kronen über Chunkgrenzen reichen
    for (var dz = -4; dz < CS + 4; dz++) {
      for (var dx = -4; dx < CS + 4; dx++) {
        var wx = wx0 + dx, wz = wz0 + dz;
        var r = U.hash3(wx, 7777, wz);
        var info = this.columnInfo(wx, wz);
        var biome = info.biome;
        var h = Math.floor(info.h);
        if (h < SEA) continue;

        var density = 0;
        var type = 'oak';
        switch (biome) {
          case BIOME.FOREST: density = 0.085; type = (U.hash3(wx, 31, wz) < 0.28) ? 'birch' : 'oak'; break;
          case BIOME.PLAINS: density = 0.006; break;
          case BIOME.TAIGA: density = 0.075; type = 'spruce'; break;
          case BIOME.SNOW: density = 0.02; type = 'spruce'; break;
          case BIOME.SWAMP: density = 0.03; break;
          case BIOME.MOUNTAINS: density = 0.012; type = (U.hash3(wx, 33, wz) < 0.5) ? 'spruce' : 'oak'; break;
        }
        if (density === 0 || r > density) continue;
        this.tree(dx, h + 1, dz, type, setBlock, wx, wz);
      }
    }

    // Bodenpflanzen
    for (var z = 0; z < CS; z++) {
      for (var x = 0; x < CS; x++) {
        var wxx = wx0 + x, wzz = wz0 + z;
        var inf = this.columnInfo(wxx, wzz);
        var hh = Math.floor(inf.h);
        if (hh < SEA || hh >= WH - 2) continue;
        var gi = x | (z << 4) | (hh << 8);
        var ground = blocks[gi];
        var ai = x | (z << 4) | ((hh + 1) << 8);
        if (blocks[ai] !== 0) continue;
        var rr = U.hash3(wxx, 1234, wzz);
        var bm = inf.biome;

        if (bm === BIOME.DESERT) {
          if (rr < 0.010 && ground === B.id('sand')) {
            // Kaktus
            var ch = 1 + ((U.hash3(wxx, 5, wzz) * 3) | 0);
            for (var k = 0; k < ch; k++) setBlock(x, hh + 1 + k, z, B.id('cactus'), true);
          } else if (rr < 0.03) {
            setBlock(x, hh + 1, z, ID.dead_bush, true);
          }
          continue;
        }
        if (ground !== ID.grass) {
          // Zuckerrohr am Wasser
          if ((ground === B.id('sand') || ground === ID.grass) && rr < 0.08 && nearWater(blocks, x, hh, z)) {
            var sh = 1 + ((U.hash3(wxx, 9, wzz) * 3) | 0);
            for (var s = 0; s < sh; s++) setBlock(x, hh + 1 + s, z, B.id('sugar_cane'), true);
          }
          continue;
        }

        if (rr < 0.006 && nearWater(blocks, x, hh, z)) {
          var sh2 = 1 + ((U.hash3(wxx, 9, wzz) * 3) | 0);
          for (var s2 = 0; s2 < sh2; s2++) setBlock(x, hh + 1 + s2, z, B.id('sugar_cane'), true);
        } else if (rr < 0.006) {
          setBlock(x, hh + 1, z, B.id('pumpkin'), true);
        } else if (rr < 0.024) {
          var fr = U.hash3(wxx, 77, wzz);
          setBlock(x, hh + 1, z, fr < 0.4 ? ID.flower_red : (fr < 0.75 ? ID.flower_yellow : ID.flower_blue), true);
        } else if (rr < 0.028) {
          setBlock(x, hh + 1, z, U.hash3(wxx, 88, wzz) < 0.5 ? ID.mushroom_red : ID.mushroom_brown, true);
        } else if (rr < 0.30) {
          setBlock(x, hh + 1, z, ID.tall_grass, true);
        }
      }
    }
  };

  function nearWater(blocks, x, y, z) {
    var dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var i = 0; i < 4; i++) {
      var nx = x + dirs[i][0], nz = z + dirs[i][1];
      if (nx < 0 || nx >= CS || nz < 0 || nz >= CS) continue;
      var idx = nx | (nz << 4) | (y << 8);
      if (blocks[idx] === ID.water) return true;
    }
    return false;
  }

  Gen.prototype.tree = function (lx, ly, lz, type, setBlock, wx, wz) {
    var rnd = U.rng(U.hashString(wx + ':' + wz + ':' + this.seed));
    var logId, leafId, height;
    if (type === 'birch') { logId = ID.log_birch; leafId = ID.leaves_birch; height = 5 + ((rnd() * 3) | 0); }
    else if (type === 'spruce') { logId = ID.log_spruce; leafId = ID.leaves_spruce; height = 7 + ((rnd() * 5) | 0); }
    else { logId = ID.log_oak; leafId = ID.leaves_oak; height = 4 + ((rnd() * 3) | 0); }

    var y;
    for (y = 0; y < height; y++) setBlock(lx, ly + y, lz, logId, true);

    if (type === 'spruce') {
      var top = ly + height;
      var layer = 0;
      for (y = ly + 2; y < top + 1; y++) {
        var rad = ((top - y) % 4 === 0 || (top - y) % 4 === 1) ? 2 : 1;
        if (y >= top - 1) rad = 1;
        if (y === top) rad = 0;
        for (var dx = -rad; dx <= rad; dx++)
          for (var dz = -rad; dz <= rad; dz++) {
            if (dx === 0 && dz === 0 && y < top) continue;
            if (Math.abs(dx) === rad && Math.abs(dz) === rad && rad > 1) continue;
            setBlock(lx + dx, y, lz + dz, leafId, false);
          }
        setBlock(lx, top, lz, leafId, false);
        layer++;
      }
    } else {
      var ct = ly + height;
      for (y = ct - 3; y <= ct; y++) {
        var r = (y >= ct - 1) ? 1 : 2;
        for (var ax = -r; ax <= r; ax++)
          for (var az = -r; az <= r; az++) {
            if (ax === 0 && az === 0 && y < ct) continue;
            if (Math.abs(ax) === r && Math.abs(az) === r && r === 2 && rnd() < 0.6) continue;
            setBlock(lx + ax, y, lz + az, leafId, false);
          }
      }
    }
  };

  // Spawnpunkt suchen
  Gen.prototype.findSpawn = function () {
    for (var r = 0; r < 4000; r += 8) {
      for (var a = 0; a < 12; a++) {
        var ang = (a / 12) * Math.PI * 2;
        var x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
        var info = this.columnInfo(x, z);
        if (info.biome !== BIOME.OCEAN && info.h > MC.SEA_LEVEL + 1 && info.h < MC.SEA_LEVEL + 30) {
          return { x: x + 0.5, y: Math.floor(info.h) + 2.2, z: z + 0.5 };
        }
      }
    }
    return { x: 0.5, y: 80, z: 0.5 };
  };

})();
