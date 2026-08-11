/* ============================================================
   worldgen.js  -  Prozedurale Weltgenerierung (Biome, Höhlen, Erze, Bäume)
   ============================================================ */
(function () {
  'use strict';

  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT;
  var B = MC.Blocks;
  var U = MC.U;

  // ============================================================
  //  Welteinstellungen
  // ============================================================
  MC.WORLD_OPTS = [
    { key: 'type', title: 'Welttyp', kind: 'choice', def: 'default',
      options: [['default', 'Standard'], ['amplified', 'Verstärkt'], ['largebiomes', 'Große Biome'], ['flat', 'Flachland']] },
    { key: 'mountains', title: 'Bergigkeit', kind: 'range', def: 1, min: 0, max: 2, step: 0.1 },
    { key: 'caves', title: 'Höhlen', kind: 'range', def: 1, min: 0, max: 2, step: 0.1 },
    { key: 'seaLevel', title: 'Meeresspiegel', kind: 'range', def: 62, min: 32, max: 92, step: 1, unit: '' },
    { key: 'biomeSize', title: 'Biomgröße', kind: 'range', def: 1, min: 0.4, max: 3, step: 0.1 },
    { key: 'vegetation', title: 'Bewuchs', kind: 'range', def: 1, min: 0, max: 3, step: 0.1 },
    { key: 'ores', title: 'Erzhäufigkeit', kind: 'range', def: 1, min: 0, max: 3, step: 0.1 },
    { key: 'structures', title: 'Dörfer erzeugen', kind: 'bool', def: true }
  ];

  // Version des Geländemodells. Gespeichert wird nur der Unterschied zur
  // Generierung – ändert sich der Generator, stünde jedes gebaute Haus
  // plötzlich in einer anderen Landschaft. Darum trägt jede Welt die Version
  // mit, unter der sie entstanden ist, und behält sie für immer.
  //   1 = bis August 2026: abs()-Rauschen, Baumteppich, flache Wüste
  //   2 = Erosionsachse, Gebirgskämme, Dünen, große Bäume
  MC.GEN_VERSION = 2;

  MC.defaultWorldOpts = function () {
    var o = {};
    MC.WORLD_OPTS.forEach(function (s) { o[s.key] = s.def; });
    o.gen = MC.GEN_VERSION;
    return o;
  };

  // Fremde/fehlende Werte auf gültige Bereiche ziehen – ein alter Spielstand
  // ohne Einstellungen ergibt so exakt die Standardwelt von früher.
  MC.normalizeWorldOpts = function (o) {
    var out = MC.defaultWorldOpts();
    if (!o) return out;
    MC.WORLD_OPTS.forEach(function (s) {
      var v = o[s.key];
      if (v === undefined || v === null) return;
      if (s.kind === 'range') { v = +v; if (isFinite(v)) out[s.key] = U.clamp(v, s.min, s.max); }
      else if (s.kind === 'bool') out[s.key] = !!v;
      else if (s.options.some(function (p) { return p[0] === v; })) out[s.key] = v;
    });
    // Ein Spielstand, der von Einstellungen weiß, aber keine Generatorversion
    // nennt, stammt aus der Zeit davor – der bekommt den alten Generator.
    out.gen = (+o.gen > 0) ? Math.min(+o.gen, MC.GEN_VERSION) : 1;
    return out;
  };

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

  function Gen(seed, opts, dim) {
    ids();
    this.seed = seed >>> 0;
    this.dim = dim || 'overworld';
    this.o = MC.normalizeWorldOpts(opts);
    this.genV = this.o.gen;
    this.sea = Math.round(this.o.seaLevel);
    this.flat = this.o.type === 'flat';
    // Verstärkt überhöht das Relief, Große Biome zieht die Klimazonen auseinander
    this.relief = this.o.type === 'amplified' ? 1.9 : 1;
    this.biomeScale = this.o.biomeSize * (this.o.type === 'largebiomes' ? 3 : 1);
    // Version 2 zieht die Klimazonen generell weiter auseinander. Eine Wüste,
    // die nach 60 Blöcken im Wald endet, sieht nicht nach Wüste aus.
    if (this.genV >= 2) this.biomeScale *= 1.6;
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
    this.nEros = new U.Noise(s + 11);
    this.nRidge = new U.Noise(s + 12);
    this.nDune = new U.Noise(s + 13);
    this.nGlade = new U.Noise(s + 14);
    this.hCache = {};
    this.hCacheCount = 0;
  }
  MC.WorldGen = Gen;
  Gen.BIOME = BIOME;
  Gen.BIOME_NAME = BIOME_NAME;

  Gen.prototype.climate = function (x, z) {
    var bs = this.biomeScale;
    var cont = this.nCont.fbm2(x / (900 * bs), z / (900 * bs), 3);
    var temp = this.nTemp.fbm2(x / (620 * bs) + 100, z / (620 * bs) - 40, 3);
    var humid = this.nHumid.fbm2(x / (520 * bs) - 300, z / (520 * bs) + 220, 3);
    var cl = { cont: cont, temp: temp, humid: humid };
    if (this.genV >= 2) {
      // Erosion ist die dritte Klimaachse und entscheidet, ob eine Gegend alt
      // und abgetragen ist (flach) oder jung (schroff). Sie läuft auf einer
      // eigenen, gröberen Skala als Temperatur und Feuchte – deshalb zieht ein
      // Gebirge quer durch mehrere Biome, statt an ihrer Grenze aufzuhören.
      cl.eros = this.nEros.fbm2(x / 1500 + 700, z / 1500 - 500, 3);
      // Gebirgsmaske, absichtlich sehr grobkörnig: ein Massiv soll am Stück
      // hunderte Blöcke weit reichen und nicht überall aufploppen.
      cl.mask = U.clamp(this.nMountMask.fbm2(x / 900 + 50, z / 900, 2) * 2.4
                        + 0.02 - cl.eros * 1.6, 0, 1);
    }
    return cl;
  };

  // Trockenklima: das Fenster ist in Version 2 deutlich weiter, sonst gibt es
  // nie eine Wüste, die diesen Namen verdient.
  Gen.prototype.isDry = function (cl) {
    if (this.genV >= 2) return cl.temp > 0.14 && cl.humid < 0.03;
    return cl.temp > 0.28 && cl.humid < -0.02;
  };

  Gen.prototype.heightAt = function (x, z, cl) {
    var SEA = this.sea;
    if (this.flat) return SEA + 1;   // knapp über dem Meeresspiegel, damit nichts absäuft
    cl = cl || this.climate(x, z);
    if (this.genV >= 2) return this.heightV2(x, z, cl);
    var base = SEA + cl.cont * 30;
    var detail = this.nDetail.fbm2(x / 130, z / 130, 5) * 11;
    var mask = U.clamp(this.nMountMask.fbm2(x / 340 + 50, z / 340, 2) * 2.2 + 0.15, 0, 1);
    var mount = Math.abs(this.nMount.fbm2(x / 95, z / 95, 5)) * 62 * mask * mask * this.o.mountains;
    var h = base + (detail + mount) * this.relief;
    // Wüsten & Ebenen etwas flacher
    if (cl.temp > 0.3 && cl.humid < -0.05) h = SEA + (h - SEA) * 0.6 + 2;
    if (cl.cont < -0.2) h = SEA + (h - SEA) * 0.75;
    return U.clamp(h, 3, WH - 6);
  };

  // ---------- Geländemodell Version 2 ----------
  Gen.prototype.heightV2 = function (x, z, cl) {
    var SEA = this.sea;
    // rau = 1 bei junger, unerodierter Landschaft, 0 im abgetragenen Flachland
    var rau = U.clamp(0.5 - cl.eros * 1.5, 0, 1);
    var base = SEA + cl.cont * 30;

    // Das Feindetail hängt an der Erosion: eine Ebene bleibt eine Ebene, statt
    // wie bisher überall dieselbe Grundwelligkeit zu tragen.
    var detail = this.nDetail.fbm2(x / 150, z / 150, 4) * (2.5 + 19 * rau * rau);

    var mount = 0;
    if (cl.mask > 0) {
      var kamm = this.nRidge.ridge2(x / 300, z / 300, 4);
      mount = Math.pow(kamm, 1.6) * 78 * cl.mask * cl.mask * this.o.mountains;
    }
    var h = base + (detail + mount) * this.relief;

    if (this.isDry(cl)) {
      // Wüstenbecken: flach, aber mit langgezogenen Dünenzügen quer dazu
      h = SEA + (h - SEA) * 0.45 + 3;
      var duene = this.nDune.fbm2(x / 38, z / 210, 2) + this.nDune.fbm2(z / 45 + 90, x / 240, 2);
      h += (duene * 0.5 + 0.5) * 6.5 * (1 - cl.mask);
    }
    if (cl.cont < -0.2) h = SEA + (h - SEA) * 0.75;

    // Weiche Deckelung: über y=96 wird jeder weitere Meter teurer. Ohne das
    // schneidet die Weltdecke die Gipfel zu Tafelbergen ab.
    if (h > 96) h = 96 + (h - 96) * 0.36;
    return U.clamp(h, 3, WH - 6);
  };

  Gen.prototype.biomeAt = function (x, z, h, cl) {
    var SEA = this.sea;
    cl = cl || this.climate(x, z);
    if (h === undefined) h = this.heightAt(x, z, cl);
    if (this.flat) {
      if (cl.temp < -0.32) return BIOME.SNOW;
      if (this.isDry(cl)) return BIOME.DESERT;
      return cl.humid > 0.12 ? BIOME.FOREST : BIOME.PLAINS;
    }
    if (h < SEA - 1.5) return BIOME.OCEAN;
    // Der Strandsaum ist in Version 2 schmaler – sonst liegt hinter jeder Bucht
    // noch eine halbe Sandebene, bevor das Land anfängt.
    if (h < SEA + (this.genV >= 2 ? 1.0 : 1.5)) return BIOME.BEACH;
    if (this.genV >= 2) {
      // Das Gebirge beginnt am Fuß des Massivs, nicht auf halber Höhe – es
      // hängt an der Maske, nicht mehr allein an der Höhe über dem Meer.
      if ((cl.mask > 0.4 && h > SEA + 16) || h > SEA + 44) {
        return cl.temp < -0.08 ? BIOME.SNOW : BIOME.MOUNTAINS;
      }
      if (cl.temp < -0.34) return BIOME.SNOW;
      if (cl.temp < -0.14) return BIOME.TAIGA;
      if (this.isDry(cl)) return BIOME.DESERT;
      if (cl.humid > 0.3 && cl.temp > 0 && h < SEA + 6) return BIOME.SWAMP;
      if (cl.humid > 0.08) return BIOME.FOREST;
      return BIOME.PLAINS;
    }
    if (h > SEA + 32) return cl.temp < -0.15 ? BIOME.SNOW : BIOME.MOUNTAINS;
    if (cl.temp < -0.32) return BIOME.SNOW;
    if (cl.temp < -0.12) return BIOME.TAIGA;
    if (this.isDry(cl)) return BIOME.DESERT;
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

  // Der Regler skaliert die Schwellen: 0 = keine Höhlen, 2 = doppelt so weite Gänge
  Gen.prototype.isCaveAt = function (grid, lx, y, lz) {
    var c = this.o.caves;
    if (c <= 0 || y < 4 || y > 118) return false;
    if (Math.abs(sampleGrid(grid.a, lx, y, lz)) < 0.045 * c) return true;
    if (Math.abs(sampleGrid(grid.b, lx, y, lz)) < 0.036 * c) return true;
    if (y < 40 && sampleGrid(grid.c, lx, y, lz) > 0.45 / c) return true;
    return false;
  };

  // Einzelabfrage (für Werkzeuge außerhalb der Chunk-Generierung)
  Gen.prototype.isCave = function (x, y, z) {
    var c = this.o.caves;
    if (c <= 0 || y < 4 || y > 118) return false;
    if (Math.abs(this.nCave.fbm3(x / 44, y / 26, z / 44, 3)) < 0.055 * c) return true;
    if (Math.abs(this.nCave2.fbm3(x / 70 + 200, y / 34, z / 70 - 100, 3)) < 0.045 * c) return true;
    if (y < 40 && this.nCave2.fbm3(x / 90 - 500, y / 40, z / 90 + 500, 2) > 0.42 / c) return true;
    return false;
  };

  // ---------- Chunk generieren ----------
  Gen.prototype.generate = function (cx, cz, blocks, meta) {
    // Nether und Aether haben eigene Generatoren – hier nur die Oberwelt
    if (this.dim === 'nether') return MC.Dim.generateNether(this, cx, cz, blocks, meta);
    if (this.dim === 'aether') return MC.Dim.generateAether(this, cx, cz, blocks, meta);
    if (this.dim === 'the_end') return MC.Dim.generateEnd(this, cx, cz, blocks, meta);
    var SEA = this.sea;
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
          case BIOME.DESERT:
            topBlock = ID.sand; fillBlock = ID.sand;
            dirtDepth = this.genV >= 2 ? 4 + ((U.hash3(wx, 17, wz) * 3) | 0) : 4;
            break;
          case BIOME.BEACH: topBlock = ID.sand; fillBlock = ID.sand; break;
          case BIOME.OCEAN: topBlock = ID.gravel; fillBlock = ID.dirt; break;
          case BIOME.SNOW: topBlock = ID.snow_block; fillBlock = ID.dirt; break;
          case BIOME.MOUNTAINS: if (h > SEA + 48) { topBlock = ID.stone; fillBlock = ID.stone; } break;
          case BIOME.SWAMP: topBlock = ID.grass; fillBlock = ID.dirt; break;
        }
        if (biome === BIOME.OCEAN && h > SEA - 6) topBlock = ID.sand;

        // Version 2: die Oberfläche richtet sich nach der Hangneigung, nicht
        // nur nach dem Biom. An einer Steilwand hält kein Gras, und eine
        // Schneekappe fängt an ihrer Höhe an, nicht an einer Biomgrenze.
        if (this.genV >= 2 && biome !== BIOME.OCEAN) {
          var hx = this.columnInfo(wx + 1, wz).h, hz = this.columnInfo(wx, wz + 1).h;
          var steil = Math.max(Math.abs(info.h - hx), Math.abs(info.h - hz));
          if (steil > 1.7 && h > SEA + 3) {
            topBlock = ID.stone; fillBlock = ID.stone;
            // Geröll am Fuß der Wand, nicht auf der Wand selbst
            if (steil < 2.4 && U.hash3(wx, 61, wz) < 0.25) topBlock = ID.gravel;
          } else if (h > SEA + 52 + U.hash3(wx, 71, wz) * 6) {
            topBlock = ID.snow_block;
            if (fillBlock === ID.dirt) fillBlock = ID.stone;
          }
        }

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
          if (this.genV >= 2) {
            // Eine Sandauflage, darunter eine Sandsteinbank. An Dünenkanten und
            // Abbruchkanten liegt die Bank frei – das gibt der Wüste erst ihre
            // Schichtung, statt einer Sandhaut über blankem Stein.
            for (y = h - dirtDepth; y > h - dirtDepth - 6 && y > 0; y--) {
              i = x | (z << 4) | (y << 8);
              if (blocks[i] === ID.sand || blocks[i] === B.id('stone')) blocks[i] = B.id('sandstone');
            }
          } else {
            for (y = h - 1; y > h - 6 && y > 0; y--) {
              i = x | (z << 4) | (y << 8);
              if (blocks[i] === ID.sand) blocks[i] = B.id('sandstone');
            }
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
    { id: 'redstone_ore', tries: 12, size: 9, min: 5, max: 26 },
    { id: 'lapis_ore', tries: 2, size: 6, min: 12, max: 36 },
    { id: 'diamond_ore', tries: 2, size: 5, min: 5, max: 16 },
    { id: 'emerald_ore', tries: 1, size: 2, min: 6, max: 30 },
    { id: 'gravel', tries: 6, size: 24, min: 20, max: 90 },
    { id: 'dirt', tries: 8, size: 26, min: 20, max: 100 }
  ];

  Gen.prototype.genOres = function (cx, cz, blocks) {
    var rnd = U.rng((this.seed ^ (cx * 341873128) ^ (cz * 132897987)) >>> 0);
    var mult = this.o.ores;
    if (mult <= 0) return;
    for (var o = 0; o < ORES.length; o++) {
      var spec = ORES[o];
      var oid = B.id(spec.id);
      var tries = Math.max(1, Math.round(spec.tries * mult));
      for (var t = 0; t < tries; t++) {
        if (spec.tries < 3 && rnd() > 0.5 * mult) continue;
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
    var SEA = this.sea;
    var veg = this.o.vegetation;
    var wx0 = cx * CS, wz0 = cz * CS;
    var self = this;
    // Dörfer bekommen ihre Fläche freigeräumt – dort wächst nichts von selbst
    var village = MC.Village && this.o.structures ? MC.Village.near(this, wx0 + 8, wz0 + 8) : null;
    function builtOn(wx, wz) {
      return village ? MC.Village.occupies(village, wx, wz) : false;
    }

    function setBlock(lx, ly, lz, id, overwrite) {
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || ly < 0 || ly >= WH) return;
      var i = lx | (lz << 4) | (ly << 8);
      var cur = blocks[i];
      if (!overwrite && cur !== 0 && cur !== ID.leaves_oak && cur !== ID.leaves_birch && cur !== ID.leaves_spruce) return;
      blocks[i] = id;
    }

    // Bäume: erweiterter Bereich, damit Kronen über Chunkgrenzen reichen
    if (this.genV >= 2) {
      this.treesV2(cx, cz, setBlock, builtOn);
    } else {
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
          if (density === 0 || r > density * veg) continue;
          if (builtOn(wx, wz)) continue;
          this.tree(dx, h + 1, dz, type, setBlock, wx, wz);
        }
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
        if (builtOn(wxx, wzz)) continue;
        var rr = U.hash3(wxx, 1234, wzz) / Math.max(0.001, veg);
        var bm = inf.biome;

        if (bm === BIOME.DESERT) {
          // Version 2 stellt die Kakteen in Gruppen statt gleichmäßig verstreut
          // und lässt deutlich mehr Gestrüpp stehen – eine echte Wüste ist nicht
          // leer, sie ist trocken.
          var kaktusP = 0.010, buschP = 0.03;
          if (this.genV >= 2) {
            var feld = this.nGlade.fbm2(wxx / 60 + 400, wzz / 60 - 400, 2);
            kaktusP = feld > 0.15 ? 0.045 : 0.004;
            buschP = kaktusP + 0.07;
          }
          if (rr < kaktusP && ground === B.id('sand')) {
            var ch = 1 + ((U.hash3(wxx, 5, wzz) * 3) | 0);
            for (var k = 0; k < ch; k++) setBlock(x, hh + 1 + k, z, B.id('cactus'), true);
          } else if (rr < buschP) {
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
        } else if (U.hash3(wxx, 4242, wzz) < 0.0006 * veg) {
          // eigener Hash, sonst hängt die Kürbisdichte an der Zuckerrohrschwelle.
          // 0,06 % je Grasblock ≈ ein Kürbis alle sechs bis sieben Chunks.
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

    // Höhlenstrukturen liegen tief unten und stören den Bewuchs nicht
    if (this.genV >= 2 && MC.Caves) MC.Caves.decorate(this, cx, cz, blocks, meta);
    // Zuletzt das Dorf – es überschreibt Gelände und Bewuchs
    if (village) MC.Village.generate(this, cx, cz, blocks, meta);
    // Die Festung mit dem Endportal liegt tief darunter und gibt es genau
    // einmal je Welt – sie hängt bewusst nicht am Schalter für Dörfer.
    if (MC.Stronghold) MC.Stronghold.draw(this, cx, cz, blocks, meta);
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

  // ============================================================
  //  Bewuchs Version 2
  // ============================================================
  // Bäume werden nicht mehr pro Block gewürfelt – so entstanden zwangsläufig
  // Baumwände, weil zwei Nachbarblöcke nichts voneinander wissen. Stattdessen
  // trägt jede Zelle von 5×5 Blöcken höchstens einen Baum an einer aus der
  // Zellkoordinate gehashten Stelle. Der Mindestabstand kommt damit von selbst,
  // und alles bleibt rein aus dem Seed berechenbar.
  var ZELLE = 5;
  var GROSS_R = 4;      // halbe Kronenbreite eines großen Baums
  var RAND = 11;        // so weit reichen Kronen über die Chunkgrenze

  var BAUM_DICHTE = {};
  BAUM_DICHTE[BIOME.FOREST] = { p: 0.82, gross: 0.42 };
  BAUM_DICHTE[BIOME.PLAINS] = { p: 0.045, gross: 0.20 };
  BAUM_DICHTE[BIOME.TAIGA] = { p: 0.68, gross: 0.45 };
  BAUM_DICHTE[BIOME.SNOW] = { p: 0.20, gross: 0.18 };
  BAUM_DICHTE[BIOME.SWAMP] = { p: 0.30, gross: 0.10 };
  BAUM_DICHTE[BIOME.MOUNTAINS] = { p: 0.13, gross: 0.12 };
  // In der Wüste steht kein Baum mehr, sondern nur noch sein Gerippe
  BAUM_DICHTE[BIOME.DESERT] = { p: 0.11, gross: 0, tot: true };

  // Was in dieser Zelle steht – reine Funktion der Zellkoordinate
  Gen.prototype.zellBaum = function (gx, gz) {
    var key = gx + ':' + gz;
    if (!this._zc) { this._zc = {}; this._zcN = 0; }
    if (key in this._zc) return this._zc[key];
    var b = null;
    var rnd = U.rng(U.hashString('baum2:' + this.seed + ':' + gx + ':' + gz));
    var px = gx * ZELLE + ((rnd() * ZELLE) | 0);
    var pz = gz * ZELLE + ((rnd() * ZELLE) | 0);
    var info = this.columnInfo(px, pz);
    var d = BAUM_DICHTE[info.biome];
    if (d && info.h >= this.sea + 1) {
      // Lichtungen und Dickichte: ein sehr grobes Rauschen moduliert die
      // Dichte, damit ein Wald nicht gleichmäßig durchgekämmt aussieht.
      var licht = U.clamp(0.45 + this.nGlade.fbm2(px / 110, pz / 110, 2) * 2.0, 0, 1.3);
      if (rnd() < d.p * licht * this.o.vegetation) {
        var gross = rnd() < d.gross;
        var art = d.tot ? 'dead' : 'oak';
        if (d.tot) art = 'dead';
        else if (info.biome === BIOME.TAIGA || info.biome === BIOME.SNOW) art = 'spruce';
        else if (info.biome === BIOME.MOUNTAINS) art = rnd() < 0.5 ? 'spruce' : 'oak';
        else if (info.biome === BIOME.FOREST && rnd() < 0.26) art = 'birch';
        if (art === 'birch' || art === 'dead') gross = false;   // Birken bleiben schlank
        var fuss = info.h;
        if (gross) {
          // Ein 2×2-Stamm steht auf vier Spalten. Er wird auf die tiefste
          // gesetzt, sonst hängt eine Ecke am Hang in der Luft. Ist der Hang
          // zu steil, wächst dort eben ein kleiner Baum.
          var h10 = this.columnInfo(px + 1, pz).h;
          var h01 = this.columnInfo(px, pz + 1).h;
          var h11 = this.columnInfo(px + 1, pz + 1).h;
          var tief = Math.min(info.h, h10, h01, h11);
          if (Math.max(info.h, h10, h01, h11) - tief > 3) gross = false;
          else fuss = tief;
        }
        b = { x: px, z: pz, y: Math.floor(fuss) + 1, art: art, gross: gross };
      }
    }
    if (++this._zcN > 40000) { this._zc = {}; this._zcN = 0; }
    this._zc[key] = b;
    return b;
  };

  // Ein großer Baum verdrängt kleine in seiner Nachbarschaft. Wer gewinnt,
  // entscheidet die Zellreihenfolge – damit kommt jeder Chunk zum selben
  // Ergebnis, egal in welcher Reihenfolge er erzeugt wird.
  Gen.prototype.baumFrei = function (b, gx, gz) {
    for (var dz = -2; dz <= 2; dz++) {
      for (var dx = -2; dx <= 2; dx++) {
        if (dx === 0 && dz === 0) continue;
        var frueher = (dz < 0) || (dz === 0 && dx < 0);
        var o = this.zellBaum(gx + dx, gz + dz);
        if (!o || !o.gross) continue;
        var need = b.gross ? GROSS_R * 2 : GROSS_R + 1;
        var ddx = o.x - b.x, ddz = o.z - b.z;
        if (ddx * ddx + ddz * ddz >= need * need) continue;
        if (frueher || (!b.gross && o.gross)) return false;
      }
    }
    return true;
  };

  Gen.prototype.treesV2 = function (cx, cz, setBlock, builtOn) {
    var wx0 = cx * CS, wz0 = cz * CS;
    var g0x = Math.floor((wx0 - RAND) / ZELLE), g1x = Math.floor((wx0 + CS + RAND) / ZELLE);
    var g0z = Math.floor((wz0 - RAND) / ZELLE), g1z = Math.floor((wz0 + CS + RAND) / ZELLE);
    for (var gz = g0z; gz <= g1z; gz++) {
      for (var gx = g0x; gx <= g1x; gx++) {
        var b = this.zellBaum(gx, gz);
        if (!b) continue;
        if (builtOn(b.x, b.z)) continue;
        if (!this.baumFrei(b, gx, gz)) continue;
        var lx = b.x - wx0, lz = b.z - wz0;
        if (b.art === 'dead') this.deadTree(lx, b.y, lz, setBlock, b.x, b.z);
        else if (b.gross) this.treeBig(lx, b.y, lz, b.art, setBlock, b.x, b.z);
        else this.tree(lx, b.y, lz, b.art, setBlock, b.x, b.z);
      }
    }
  };

  // Kugeliger Laubballen. Der Rand wird ausgedünnt, sonst sieht die Krone aus
  // wie ein gedrechselter Holzball.
  function ballen(setBlock, cx, cy, cz, rx, ry, leafId, rnd) {
    for (var dy = -ry; dy <= ry; dy++) {
      for (var dz = -rx; dz <= rx; dz++) {
        for (var dx = -rx; dx <= rx; dx++) {
          var d = (dx * dx + dz * dz) / (rx * rx) + (dy * dy) / (ry * ry);
          if (d > 1.08) continue;
          if (d > 0.55 && rnd() < 0.38) continue;
          setBlock(cx + dx, cy + dy, cz + dz, leafId, false);
        }
      }
    }
  }

  var ACHT = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  // Großer Baum: 2×2-Stamm, Äste, Krone aus mehreren Ballen
  Gen.prototype.treeBig = function (lx, ly, lz, type, setBlock, wx, wz) {
    var rnd = U.rng(U.hashString('gross:' + wx + ':' + wz + ':' + this.seed));
    var fichte = type === 'spruce';
    var logId = fichte ? ID.log_spruce : ID.log_oak;
    var leafId = fichte ? ID.leaves_spruce : ID.leaves_oak;
    var hoehe = fichte ? 15 + ((rnd() * 8) | 0) : 11 + ((rnd() * 6) | 0);
    var x, y, z;

    // Stamm, 2×2. Der Fuß bekommt einen Kranz, damit er nicht wie ein
    // eingerammter Pfahl aussieht.
    for (y = 0; y < hoehe; y++) {
      for (z = 0; z < 2; z++) for (x = 0; x < 2; x++) setBlock(lx + x, ly + y, lz + z, logId, true);
    }
    for (var a = 0; a < ACHT.length; a++) {
      if (rnd() < 0.5) continue;
      setBlock(lx + (ACHT[a][0] > 0 ? 1 : 0) + ACHT[a][0], ly, lz + (ACHT[a][1] > 0 ? 1 : 0) + ACHT[a][1], logId, true);
    }

    if (fichte) {
      // Kegel aus Ringen, oben schmal, unten breit – aber mit Aussetzern
      var top = ly + hoehe + 1;
      for (y = ly + Math.floor(hoehe * 0.32); y <= top; y++) {
        var vonOben = top - y;
        var rad = 1 + ((vonOben % 5 < 2) ? 2 : 1) + (vonOben > 8 ? 1 : 0);
        if (vonOben <= 1) rad = 1;
        if (vonOben === 0) rad = 0;
        for (var dz = -rad; dz <= rad + 1; dz++) {
          for (var dx = -rad; dx <= rad + 1; dx++) {
            var ddx = dx < 0 ? -dx : (dx > 1 ? dx - 1 : 0);
            var ddz = dz < 0 ? -dz : (dz > 1 ? dz - 1 : 0);
            if (ddx * ddx + ddz * ddz > rad * rad + 1) continue;
            if (ddx === rad && ddz === rad) continue;
            setBlock(lx + dx, y, lz + dz, leafId, false);
          }
        }
      }
      return;
    }

    // Eiche: Äste aus dem oberen Drittel, jeder endet in einem Laubballen
    var aeste = 3 + ((rnd() * 3) | 0);
    for (var i = 0; i < aeste; i++) {
      var d = ACHT[(rnd() * ACHT.length) | 0];
      var by = ly + Math.floor(hoehe * (0.55 + rnd() * 0.35));
      var len = 2 + ((rnd() * 3) | 0);
      var ax = lx + (d[0] > 0 ? 1 : 0), az = lz + (d[1] > 0 ? 1 : 0);
      var ey = by;
      for (var k = 1; k <= len; k++) {
        ey = by + ((k * 2 / len) | 0);
        setBlock(ax + d[0] * k, ey, az + d[1] * k, logId, true);
      }
      ballen(setBlock, ax + d[0] * len, ey + 1, az + d[1] * len, 2 + ((rnd() * 2) | 0), 2, leafId, rnd);
    }
    // Hauptkrone
    ballen(setBlock, lx, ly + hoehe, lz, 3 + ((rnd() * 2) | 0), 3, leafId, rnd);
    ballen(setBlock, lx + 1, ly + hoehe + 2, lz + 1, 2, 2, leafId, rnd);
  };

  // Vertrockneter Baum: nackter Stamm mit ein paar abstehenden Ästen
  Gen.prototype.deadTree = function (lx, ly, lz, setBlock, wx, wz) {
    var rnd = U.rng(U.hashString('tot:' + wx + ':' + wz + ':' + this.seed));
    var hoehe = 4 + ((rnd() * 4) | 0);
    for (var y = 0; y < hoehe; y++) setBlock(lx, ly + y, lz, ID.log_oak, true);
    var n = 2 + ((rnd() * 3) | 0);
    for (var i = 0; i < n; i++) {
      var d = ACHT[(rnd() * ACHT.length) | 0];
      var by = ly + 2 + ((rnd() * (hoehe - 2)) | 0);
      var len = 1 + ((rnd() * 2) | 0);
      for (var k = 1; k <= len; k++) {
        setBlock(lx + d[0] * k, by + (k > 1 ? 1 : 0), lz + d[1] * k, ID.log_oak, false);
      }
    }
  };

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
    var SEA = this.sea;
    for (var r = 0; r < 4000; r += 8) {
      for (var a = 0; a < 12; a++) {
        var ang = (a / 12) * Math.PI * 2;
        var x = Math.round(Math.cos(ang) * r), z = Math.round(Math.sin(ang) * r);
        var info = this.columnInfo(x, z);
        if (info.biome !== BIOME.OCEAN && info.h > SEA + 1 && info.h < SEA + 30) {
          return { x: x + 0.5, y: Math.floor(info.h) + 2.2, z: z + 0.5 };
        }
      }
    }
    return { x: 0.5, y: SEA + 18, z: 0.5 };
  };

})();
