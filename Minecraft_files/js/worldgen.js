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
    // Bei 100 % waren die Gänge so weit, dass sich alles zu Sälen öffnete.
    // 50 % trifft es: enge, begehbare Röhren. Der alte Wert bleibt für alte
    // Spielstände gültig, sonst stünde jedes gebaute Haus über anderen Höhlen.
    { key: 'caves', title: 'Höhlen', kind: 'range', def: 0.5, defAlt: 1, min: 0, max: 2, step: 0.1 },
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
  //   3 = Biome im Nether und im Aether
  //   4 = Hochgebirgsgegenden, Erdrisse, Wüstenkanten geglättet
  //   5 = große Bastionen, Meeresgrund und Strände
  //   6 = tiefe Meeresbecken, Wracks als Schiffe, Riffe tiefer
  //   7 = Höhlen als getrennte Röhrensysteme statt einem Weltgerüst
  //   8 = Höhlen enger als Vorgabe (50 %), dazu Wurmlöcher als Struktur
  MC.GEN_VERSION = 8;

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
    // Wo ein Standardwert mit der Generatorversion gewechselt hat, gilt für
    // ältere Welten weiter der alte – aber nur, wenn die Welt den Wert nicht
    // selbst nennt.
    MC.WORLD_OPTS.forEach(function (s2) {
      if (s2.defAlt === undefined) return;
      if (o[s2.key] !== undefined && o[s2.key] !== null) return;
      if (out.gen < 8) out[s2.key] = s2.defAlt;
    });
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
    this.nHoch = new U.Noise(s + 15);   // wo die Welt überhaupt Gebirge macht
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
    if (this.genV >= 4) {
      // Vierte Achse, absichtlich noch gröber als alles andere: sie sagt
      // nicht, ob hier ein Berg steht, sondern ob diese Gegend überhaupt
      // eine Gebirgsgegend ist. Damit gibt es weite Ebenen UND Landstriche,
      // die sich wie doppelte Bergigkeit anfühlen, ohne dass man am Regler
      // dreht – vorher war die Welt überall gleich bergig.
      cl.hoch = U.clamp(this.nHoch.fbm2(x / 2600 - 900, z / 2600 + 900, 2) * 2.2 + 0.48, 0, 1);
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
      // In einer Hochgebirgsgegend wird derselbe Kamm gut doppelt so hoch
      // quadratisch, damit der Unterschied zwischen Hügelland und
      // Hochgebirge wirklich auffällt statt nur messbar zu sein
      var wucht = (this.genV >= 4) ? (0.60 + 1.85 * cl.hoch * cl.hoch) : 1;
      mount = Math.pow(kamm, 1.6) * 78 * cl.mask * cl.mask * this.o.mountains * wucht;
    }
    var h = base + (detail + mount) * this.relief;

    // Wüstenbecken: flach, aber mit langgezogenen Dünenzügen quer dazu.
    //
    // Die Trockenheit wirkt als weicher Faktor, nicht als Schalter. Als Schalter
    // sprang die Höhe an der Biomgrenze um bis zu vierzehn Blöcke auf einmal –
    // das war die Felsmauer, die jede Wüste umgab. Und weil die Formel zum
    // Meeresspiegel hin zusammendrückt, hob sie Meeresboden über Wasser: daher
    // die Sandinseln mitten im Ozean. Der zweite Faktor blendet den Effekt
    // darum über der Küste ein, statt ihn überall anzuwenden.
    var trocken = U.clamp((cl.temp - 0.08) * 4.5, 0, 1) * U.clamp((0.09 - cl.humid) * 4.5, 0, 1);
    if (trocken > 0) {
      var anLand = U.clamp((h - SEA) / 7, 0, 1);
      var duene = this.nDune.fbm2(x / 38, z / 210, 2) + this.nDune.fbm2(z / 45 + 90, x / 240, 2);
      var flach = SEA + (h - SEA) * 0.5 + (duene * 0.5 + 0.5) * 6.5 * (1 - cl.mask);
      h += (flach - h) * trocken * anLand;
    }
    // Das Meer war zu flach, weil der Ozeanboden zum Meeresspiegel hin
    // zusammengedrückt wurde. Jetzt umgekehrt: je weiter draußen, desto tiefer,
    // mit einer eigenen Beckenachse für richtige Tiefseegräben.
    if (cl.cont < -0.15 && this.genV >= 6) {
      // Der Kontinentalwert bleibt meist zwischen -0,3 und 0,3 – mit einer
      // sanften Rampe wurde das Becken darum nie tief. Jetzt greift sie früh
      // und voll, sonst bleibt jedes Meer eine Pfütze.
      var weite = U.clamp((-0.08 - cl.cont) * 5.0, 0, 1);
      var becken = U.clamp(this.nHoch.fbm2(x / 900 + 4000, z / 900 - 4000, 3) * 2.6 + 0.45, 0, 1);
      var tief = 10 + becken * 34;                       // bis 44 Blöcke unter dem Spiegel
      h = h + (SEA - tief - h) * weite * (0.35 + 0.65 * becken);
    } else if (cl.cont < -0.2) {
      h = SEA + (h - SEA) * 0.75;
    }

    // Weiche Deckelung: über y=96 wird jeder weitere Meter teurer. Ohne das
    // schneidet die Weltdecke die Gipfel zu Tafelbergen ab.
    if (h > 96) h = 96 + (h - 96) * (this.genV >= 4 ? 0.30 : 0.36);
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

  // ============================================================
  //  Meeresgrund
  // ============================================================
  // Der Ozean war bis auf etwas Zuckerrohr am Ufer leer. Drei Grundarten, auf
  // einer eigenen, feineren Skala als die Landbiome – ein Riff soll ein Fleck
  // sein, kein halber Kontinent.
  MC.MEER = { SAND: 0, KELP: 1, RIFF: 2, TIEFE: 3 };
  MC.MEER_NAME = ['Sandgrund', 'Seetangwald', 'Korallenriff', 'Kalte Tiefsee'];

  Gen.prototype.meerBiom = function (x, z) {
    if (this.genV < 5) return MC.MEER.SAND;
    // Unsere Ozeane sind flacher als die im Original – der Grenzwert für die
    // Tiefsee muss dazu passen, sonst gibt es sie nie.
    var tiefe = this.sea - this.heightAt(x, z);
    if (tiefe > (this.genV >= 6 ? 18 : 10)) return MC.MEER.TIEFE;
    var w = this.nGlade.fbm2(x / 150 + 6000, z / 150 - 6000, 3);
    var warm = this.climate(x, z).temp;
    // Ein Riff braucht Wasser über sich. Vorher lag es zu 64 % in unter vier
    // Blöcken Tiefe und ragte aus dem Meer – die Tiefe gehört darum in die
    // Biomdefinition und nicht als Sperre in die Dekoration. Der Rauschwert
    // darf dafür etwas großzügiger sein, sonst gäbe es kaum noch Riffe.
    if (w > (this.genV >= 6 ? 0.04 : 0.10) && warm > -0.05
        && (this.genV < 6 || tiefe >= 5)) return MC.MEER.RIFF;
    if (w < -0.14) return MC.MEER.KELP;
    return MC.MEER.SAND;
  };

  // Grund, Bewuchs und Lehmnester. Läuft nach der Dekoration, weil sie den
  // Meeresboden nicht anfasst.
  Gen.prototype.meerDeko = function (cx, cz, blocks) {
    if (this.genV < 5) return;
    var SEA = this.sea, wx0 = cx * CS, wz0 = cz * CS;
    var M = MC.MEER;
    var sandId = ID.sand, gravelId = ID.gravel, clayId = ID.clay;
    var kelpId = B.id('kelp'), grasId = B.id('seagrass');
    var korallen = B.CORAL_COLORS.map(function (c) { return B.id('coral_' + c[0]); });
    var faecher = B.CORAL_COLORS.map(function (c) { return B.id('coral_fan_' + c[0]); });
    var schwamm = B.id('sponge');

    function set(lx, ly, lz, id) {
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || ly < 1 || ly >= WH) return;
      blocks[lx | (lz << 4) | (ly << 8)] = id;
    }
    function hole(lx, ly, lz) {
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || ly < 0 || ly >= WH) return -1;
      return blocks[lx | (lz << 4) | (ly << 8)];
    }

    for (var z = 0; z < CS; z++) {
      for (var x = 0; x < CS; x++) {
        var wx = wx0 + x, wz = wz0 + z;
        var info = this.columnInfo(wx, wz);
        var h = Math.floor(info.h);
        var unterWasser = h < SEA;
        var amUfer = h >= SEA && h <= SEA + 2;

        // ---- Strand: Lehm- und Kiesnester statt reinem Sand ----
        // Die Schwellen lagen zu niedrig – aus „Nestern" wurden durchgehende
        // Lehmufer. Ab Version 7 sind sie deutlich enger gefasst.
        var obenLehm = this.genV >= 7 ? 0.42 : 0.30;
        var obenKies = this.genV >= 7 ? -0.44 : -0.32;
        if (amUfer || (unterWasser && SEA - h < 5)) {
          var nest = this.nDune.fbm2(wx / 26 + 1200, wz / 26 - 1200, 2);
          var nestId = nest > obenLehm ? clayId : (nest < obenKies ? gravelId : 0);
          if (nestId) {
            for (var d = 0; d < (nestId === clayId ? 3 : 2); d++) set(x, h - d, z, nestId);
            // Diese Schleife läuft nach dem Bewuchs. Vorher blieb das Gras oder
            // die Blume, die auf dem alten Boden stand, einfach auf dem Lehm
            // stehen – dort wächst nichts.
            if (this.genV >= 7) {
              var drauf = hole(x, h + 1, z);
              var db = B.byId[drauf];
              if (db && db.shape === B.SHAPE_CROSS) set(x, h + 1, z, unterWasser ? ID.water : 0);
            }
          }
        }
        if (!unterWasser) continue;

        var biom = this.meerBiom(wx, wz);
        var r = U.hash3(wx, 2929, wz);

        // ---- Grund je Biom ----
        // Der Grundgenerator legt auf den Meeresboden Kies. Sand gehört unter
        // Tang und Korallen, Kies bleibt der Tiefsee.
        if (biom === M.TIEFE) {
          if (r < 0.4) set(x, h, z, gravelId);
        } else if (r < 0.75) {
          set(x, h, z, sandId);
        }

        // ---- Bewuchs ----
        if (hole(x, h + 1, z) !== ID.water) continue;
        if (biom === M.KELP) {
          if (r < 0.34) {
            // Seetang wächst in Säulen bis fast zur Oberfläche
            var hoehe = Math.min(SEA - h - 1, 3 + ((U.hash3(wx, 31, wz) * 12) | 0));
            for (var k = 0; k < hoehe; k++) {
              if (hole(x, h + 1 + k, z) !== ID.water) break;
              set(x, h + 1 + k, z, kelpId);
            }
          } else if (r < 0.62) set(x, h + 1, z, grasId);
        } else if (biom === M.RIFF) {
          if (r < 0.055) {
            // Korallenstöcke: ein Block Koralle, gelegentlich ein Fächer darauf.
            // Der Stock endet zwei Blöcke unter der Oberfläche – Korallen, die
            // aus dem Wasser schauen, sahen aus wie ein Fehler.
            var art = (U.hash3(wx, 7, wz) * korallen.length) | 0;
            var platz = Math.max(0, SEA - 2 - h);
            var stock = Math.min(platz, 1 + ((U.hash3(wx, 8, wz) * 3) | 0));
            for (var s = 0; s < stock; s++) {
              if (hole(x, h + 1 + s, z) !== ID.water) break;
              set(x, h + 1 + s, z, korallen[art]);
            }
            if (stock < platz && hole(x, h + 1 + stock, z) === ID.water
                && U.hash3(wx, 9, wz) < 0.5) {
              set(x, h + 1 + stock, z, faecher[art]);
            }
          } else if (r < 0.16) set(x, h + 1, z, grasId);
          // Schwämme wachsen im Riff, aber selten – sonst ist der Reiz weg
          else if (r > 0.9975) set(x, h + 1, z, schwamm);
        } else if (biom === M.TIEFE) {
          if (r < 0.05) set(x, h + 1, z, grasId);
        } else {
          if (r < 0.14) set(x, h + 1, z, grasId);
        }
      }
    }
  };

  // ============================================================
  //  Erdrisse
  // ============================================================
  // Eine lange, schmale Kluft, die von der Oberfläche fast bis zum
  // Grundgestein reicht. Unten läuft sie spitz zu und endet in Lava – wer
  // hineinfällt, hat ein Problem, und genau das ist der Reiz.
  //
  // Gerechnet wird als Abstand jeder Spalte zur Mittellinie: den Riss Block für
  // Block auszuschneiden hieße, ihn in jedem berührten Chunk komplett
  // durchzulaufen. So kostet er nur dort etwas, wo er wirklich liegt.
  var RISS_REGION = 12;                       // Chunks je Region
  var RISS_SPAN = RISS_REGION * CS;           // 192 Blöcke
  // Seltener als beim ersten Anlauf: einer alle rund 340 Blöcke lag so dicht,
  // dass man ständig über einen stolperte.
  var RISS_CHANCE = 0.17;

  Gen.prototype.rissAt = function (rx, rz) {
    if (this.genV < 4) return null;
    if (!this._risse) this._risse = {};
    var key = rx + ',' + rz;
    if (key in this._risse) return this._risse[key];
    var r = null;
    var rnd = U.rng(U.hashString('riss:' + this.seed + ':' + rx + ':' + rz));
    if (rnd() <= RISS_CHANCE) {
      var x = rx * RISS_SPAN + 30 + Math.floor(rnd() * (RISS_SPAN - 60));
      var z = rz * RISS_SPAN + 30 + Math.floor(rnd() * (RISS_SPAN - 60));
      var winkel = rnd() * Math.PI * 2;
      // Größe, Länge und Schlängelung streuen deutlich: von der kurzen Kluft
      // bis zur langen Schlucht, die einen halben Kilometer weit zieht.
      var wuchs = rnd();                       // 0 = klein, 1 = gewaltig
      var punkte = [[x, z]];
      var n = 2 + ((rnd() * (3 + wuchs * 7)) | 0);
      var kurvig = 0.5 + rnd() * 1.4;
      for (var i = 0; i < n; i++) {
        winkel += (rnd() - 0.5) * kurvig;
        var len = 14 + rnd() * (18 + wuchs * 40);
        x += Math.cos(winkel) * len;
        z += Math.sin(winkel) * len;
        punkte.push([Math.round(x), Math.round(z)]);
      }
      var minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      punkte.forEach(function (p) {
        if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
        if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
      });
      r = {
        punkte: punkte, breite: 2.2 + rnd() * 3 + wuchs * 4, tiefe: 9 + ((rnd() * (10 + wuchs * 16)) | 0),
        minX: minX - 10, maxX: maxX + 10, minZ: minZ - 10, maxZ: maxZ + 10
      };
    }
    this._risse[key] = r;
    return r;
  };

  // Abstand eines Punktes zur Mittellinie
  function rissAbstand(riss, px, pz) {
    var best = 1e9, p = riss.punkte;
    for (var i = 0; i < p.length - 1; i++) {
      var ax = p[i][0], az = p[i][1], bx = p[i + 1][0], bz = p[i + 1][1];
      var dx = bx - ax, dz = bz - az;
      var l2 = dx * dx + dz * dz;
      var t = l2 > 0 ? U.clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
      var qx = ax + dx * t - px, qz = az + dz * t - pz;
      var d = qx * qx + qz * qz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  Gen.prototype.risseNah = function (wx, wz) {
    var rx = Math.floor(wx / RISS_SPAN), rz = Math.floor(wz / RISS_SPAN);
    var list = null;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        var r = this.rissAt(rx + dx, rz + dz);
        if (!r) continue;
        if (wx < r.minX - CS || wx > r.maxX + CS || wz < r.minZ - CS || wz > r.maxZ + CS) continue;
        (list || (list = [])).push(r);
      }
    }
    return list;
  };

  Gen.prototype.schneideRisse = function (cx, cz, blocks) {
    var liste = this.risseNah(cx * CS + 8, cz * CS + 8);
    if (!liste) return;
    var wx0 = cx * CS, wz0 = cz * CS;
    var lavaId = ID.lava, bedrock = ID.bedrock, waterId = ID.water;
    for (var i = 0; i < liste.length; i++) {
      var riss = liste[i];
      for (var z = 0; z < CS; z++) {
        for (var x = 0; x < CS; x++) {
          var wx = wx0 + x, wz = wz0 + z;
          if (wx < riss.minX || wx > riss.maxX || wz < riss.minZ || wz > riss.maxZ) continue;
          var d = rissAbstand(riss, wx, wz);
          if (d > riss.breite) continue;
          var info = this.columnInfo(wx, wz);
          var oben = Math.floor(info.h);
          // Unter Wasser bleibt der Riss zu – sonst läuft der halbe Ozean hinein
          if (oben <= this.sea) continue;
          for (var y = oben; y >= riss.tiefe; y--) {
            // Nach unten verjüngt sich der Spalt, oben franst er aus
            var t = (y - riss.tiefe) / Math.max(1, oben - riss.tiefe);
            var rad = riss.breite * (0.25 + 0.75 * t * t);
            if (d > rad) continue;
            var k = x | (z << 4) | (y << 8);
            if (blocks[k] === bedrock || blocks[k] === waterId) continue;
            var lava = (y <= riss.tiefe + 1);
            // Lava braucht einen Boden. Schneidet der Riss unten eine Höhle an,
            // stand sie vorher frei in der Luft – dann lieber gar keine.
            if (lava && this.genV >= 7) {
              var unten = (y > 0) ? blocks[x | (z << 4) | ((y - 1) << 8)] : bedrock;
              var ub = B.byId[unten];
              if (!ub || !ub.opaque) lava = false;
            }
            blocks[k] = lava ? lavaId : 0;
          }
        }
      }
    }
  };

  // ---------- Wurmlöcher ----------
  // Kein Höhlensystem, sondern eine eigene Struktur – so selten wie eine
  // verlassene Mine und genauso wiedererkennbar. Ein Wurmloch windet sich ein
  // paar hundert Blöcke durch den Fels, und was es unheimlich macht, ist seine
  // Gleichförmigkeit: der Querschnitt bleibt über die ganze Strecke derselbe,
  // als hätte etwas es gebohrt. Es endet entweder oben an der Oberfläche –
  // dann findet man den Eingang als Loch im Boden – oder unten am
  // Grundgestein, wo es einfach aufhört.
  var WURM_REGION = 16;                      // Chunks je Seite = 256 Blöcke
  var WURM_SPAN = WURM_REGION * CS;
  var WURM_CHANCE = 0.30;
  var WURM_RAND = 200;                       // so weit greift eines über seine Mitte hinaus

  Gen.prototype.wurmAt = function (rx, rz) {
    if (this.genV < 8) return null;
    if (!this._wuermer) this._wuermer = {};
    var key = rx + ',' + rz;
    if (key in this._wuermer) return this._wuermer[key];
    var w = null;
    try { w = wurmLayout(this, rx, rz); } catch (e) { w = null; }
    this._wuermer[key] = w;
    return w;
  };

  function wurmLayout(gen, rx, rz) {
    var rnd = U.rng(U.hashString('wurmloch:' + gen.seed + ':' + rx + ':' + rz));
    if (rnd() > WURM_CHANCE) return null;
    var x = rx * WURM_SPAN + 40 + rnd() * (WURM_SPAN - 80);
    var z = rz * WURM_SPAN + 40 + rnd() * (WURM_SPAN - 80);

    // Der Radius wird einmal gewürfelt und bleibt dann. Genau das ist der Reiz.
    var r = 1.8 + rnd() * 1.4;
    // Wohin es endet: nach oben durch die Oberfläche oder nach unten aufs
    // Grundgestein. Beides zu haben macht den Fund erst interessant.
    var nachOben = rnd() < 0.45;
    var y = nachOben ? 10 + rnd() * 10 : 40 + rnd() * 14;
    var gier = rnd() * Math.PI * 2;
    var neig = (rnd() - 0.5) * 0.06;

    var glieder = [];
    var minX = x, maxX = x, minZ = z, maxZ = z;
    // Ein paar hundert Blöcke: bei gut zwei Blöcken je Schritt sind das
    // zweihundert bis fuenfhundert Schritte.
    var schritte = 200 + ((rnd() * 300) | 0);
    for (var i = 0; i < schritte; i++) {
      // Nur die Richtung wandert, nicht der Querschnitt
      gier += (rnd() - 0.5) * 0.30;
      // Senkrecht bleibt es flach: ein Wurmloch läuft im Wesentlichen waagerecht
      // und zieht nur ganz langsam zu seinem Ende. Mit stärkerer Neigung war es
      // nach siebzig Schritten unten und damit viel zu kurz.
      neig += (rnd() - 0.5) * 0.02;
      neig += nachOben ? 0.0012 : -0.0012;
      if (neig > 0.16) neig = 0.16;
      if (neig < -0.16) neig = -0.16;

      var schritt = 1.7 + rnd() * 0.8;
      var nx = x + Math.cos(gier) * Math.cos(neig) * schritt;
      var ny = y + Math.sin(neig) * schritt;
      var nz = z + Math.sin(gier) * Math.cos(neig) * schritt;

      glieder.push({ ax: x, ay: y, az: z, bx: nx, by: ny, bz: nz });
      x = nx; y = ny; z = nz;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;

      // Ende: oben bricht es durch, unten steht es auf dem Grundgestein
      if (nachOben && y > gen.heightAt(Math.round(x), Math.round(z)) - 1) break;
      if (!nachOben && y < 7) break;
    }
    if (glieder.length < 20) return null;
    return {
      glieder: glieder, r: r, nachOben: nachOben,
      minX: minX - r - 2, maxX: maxX + r + 2,
      minZ: minZ - r - 2, maxZ: maxZ + r + 2
    };
  }

  Gen.prototype.wuermerNah = function (wx0, wz0) {
    var rx = Math.floor(wx0 / WURM_SPAN), rz = Math.floor(wz0 / WURM_SPAN);
    var spanne = Math.ceil(WURM_RAND / WURM_SPAN) + 1;
    var liste = null;
    for (var dx = -spanne; dx <= spanne; dx++) {
      for (var dz = -spanne; dz <= spanne; dz++) {
        var w = this.wurmAt(rx + dx, rz + dz);
        if (!w) continue;
        if (w.maxX < wx0 || w.minX > wx0 + CS - 1) continue;
        if (w.maxZ < wz0 || w.minZ > wz0 + CS - 1) continue;
        (liste || (liste = [])).push(w);
      }
    }
    return liste;
  };

  Gen.prototype.imWurm = function (px, py, pz) {
    var liste = this.wuermerNah(Math.floor(px / CS) * CS, Math.floor(pz / CS) * CS);
    if (!liste) return false;
    for (var i = 0; i < liste.length; i++) {
      var g = liste[i].glieder;
      // Der Querschnitt gehört dem Wurm, nicht dem einzelnen Glied – und er
      // hängt nicht am Höhlenregler, denn ein Wurmloch ist keine Höhle.
      var r = liste[i].r;
      for (var j = 0; j < g.length; j++) {
        var s = g[j];
        if (px < Math.min(s.ax, s.bx) - r || px > Math.max(s.ax, s.bx) + r) continue;
        if (pz < Math.min(s.az, s.bz) - r || pz > Math.max(s.az, s.bz) + r) continue;
        if (py < Math.min(s.ay, s.by) - r || py > Math.max(s.ay, s.by) + r) continue;
        var dx = s.bx - s.ax, dy = s.by - s.ay, dz = s.bz - s.az;
        var l2 = dx * dx + dy * dy + dz * dz;
        var t = l2 > 0 ? ((px - s.ax) * dx + (py - s.ay) * dy + (pz - s.az) * dz) / l2 : 0;
        if (t < 0) t = 0; else if (t > 1) t = 1;
        var qx = s.ax + dx * t - px, qy = s.ay + dy * t - py, qz = s.az + dz * t - pz;
        if (qx * qx + qy * qy + qz * qz <= r * r) return true;
      }
    }
    return false;
  };

  // Trägt die Würmer aus dem Chunk aus. Gerechnet wird je Glied nur in seinem
  // eigenen Kasten – ein Wurm von zweihundert Gliedern berührt einen Chunk
  // meist mit einer Handvoll davon.
  Gen.prototype.grabeWuermer = function (cx, cz, blocks) {
    if (this.genV < 8) return;
    var wx0 = cx * CS, wz0 = cz * CS;
    var liste = this.wuermerNah(wx0, wz0);
    if (!liste) return;
    var bedrock = ID.bedrock, waterId = ID.water, lavaId = ID.lava;

    for (var i = 0; i < liste.length; i++) {
      var g = liste[i].glieder;
      var r = liste[i].r;
      for (var j = 0; j < g.length; j++) {
        var s = g[j];
        var lo_x = Math.floor(Math.min(s.ax, s.bx) - r) - wx0;
        var hi_x = Math.ceil(Math.max(s.ax, s.bx) + r) - wx0;
        if (hi_x < 0 || lo_x >= CS) continue;
        var lo_z = Math.floor(Math.min(s.az, s.bz) - r) - wz0;
        var hi_z = Math.ceil(Math.max(s.az, s.bz) + r) - wz0;
        if (hi_z < 0 || lo_z >= CS) continue;
        var lo_y = Math.floor(Math.min(s.ay, s.by) - r);
        var hi_y = Math.ceil(Math.max(s.ay, s.by) + r);
        if (lo_x < 0) lo_x = 0; if (hi_x > CS - 1) hi_x = CS - 1;
        if (lo_z < 0) lo_z = 0; if (hi_z > CS - 1) hi_z = CS - 1;
        if (lo_y < 5) lo_y = 5; if (hi_y > WH - 2) hi_y = WH - 2;

        var dx = s.bx - s.ax, dy = s.by - s.ay, dz = s.bz - s.az;
        var l2 = dx * dx + dy * dy + dz * dz;
        var r2 = r * r;
        for (var y = lo_y; y <= hi_y; y++) {
          for (var z = lo_z; z <= hi_z; z++) {
            for (var x = lo_x; x <= hi_x; x++) {
              var px = wx0 + x + 0.5, py = y + 0.5, pz = wz0 + z + 0.5;
              var t = l2 > 0
                ? ((px - s.ax) * dx + (py - s.ay) * dy + (pz - s.az) * dz) / l2 : 0;
              if (t < 0) t = 0; else if (t > 1) t = 1;
              var qx = s.ax + dx * t - px, qy = s.ay + dy * t - py, qz = s.az + dz * t - pz;
              if (qx * qx + qy * qy + qz * qz > r2) continue;
              var k = x | (z << 4) | (y << 8);
              var alt = blocks[k];
              if (alt === bedrock || alt === waterId || alt === lavaId) continue;
              blocks[k] = 0;
            }
          }
        }
      }
    }
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
    // Die Gebietsmaske ist flach: sie entscheidet, WO es überhaupt Höhlen gibt,
    // und zwar für die ganze Säule. Eine ebene Niveaumenge hängt erst ab der
    // Hälfte der Fläche zusammen – deshalb trennt sie zuverlässig, während
    // dieselbe Maske in drei Dimensionen längst durchgehend wäre.
    // Vierte Ebene: wie weit der Gang an dieser Stelle ist. Ohne sie hat jede
    // Röhre überall denselben Querschnitt – das sah aus wie gebohrt, nicht wie
    // ausgewaschen.
    var d = new Float32Array(GN * GN * GYN);
    var m = new Float32Array(GN * GN);
    for (var mz = 0; mz < GN; mz++) {
      for (var mx = 0; mx < GN; mx++) {
        m[mz * GN + mx] = this.nCave.fbm2((wx0 + mx * 4) / 40 - 3000,
                                          (wz0 + mz * 4) / 40 + 3000, 3);
      }
    }
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
          d[k] = this.nCave.fbm3(x / 62 + 800, y / 30 + 800, z / 62 - 800, 2);
        }
      }
    }
    return { a: a, b: b, c: c, d: d, m: m };
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

  function sampleFlach(g, lx, lz) {
    var fx = lx * 0.25, fz = lz * 0.25;
    var ix = fx | 0, iz = fz | 0;
    if (ix > GN - 2) ix = GN - 2;
    if (iz > GN - 2) iz = GN - 2;
    var tx = fx - ix, tz = fz - iz;
    var b0 = iz * GN + ix;
    var x0 = g[b0] + (g[b0 + 1] - g[b0]) * tx;
    var x1 = g[b0 + GN] + (g[b0 + GN + 1] - g[b0 + GN]) * tx;
    return x0 + (x1 - x0) * tz;
  }

  // Alle vier Werte sind an der gemessenen Verteilung der Rauschfelder selbst
  // festgemacht, über fünf Seeds und ein weites Gebiet. Entscheidend ist, dass
  // GEBIET über dem Median (0,000) liegt: eine ebene Niveaumenge hängt genau ab
  // der halben Fläche zusammen, darüber zerfällt sie in getrennte Inseln. Bei
  // 0,066 bleiben rund 35 % der Karte Höhlengebiet.
  var TUN_A = 0.24, TUN_B = 0.25, HALLE = 0.52, GEBIET = 0.066;
  var GEBIET_RAND = 0.09;             // so weit läuft ein Gang am Gebietsrand aus
  var WEIT_MIN = 0.4, WEIT_MAX = 1.35;

  // Aus dem Weitenrauschen wird ein Faktor auf die Gangschwelle. Unter WEIT_MIN
  // zieht sich der Gang auf einen Kriechgang zusammen, bei WEIT_MAX öffnet er
  // sich zu einer kleinen Kammer – und weil das Rauschen entlang des Gangs
  // langsam wandert, wechselt beides einander ab, statt überall gleich zu sein.
  function weitenFaktor(n) {
    var t = n * 1.9 + 0.5;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return WEIT_MIN + (WEIT_MAX - WEIT_MIN) * t * t;
  }

  // Der Regler skaliert die Schwellen: 0 = keine Höhlen, 2 = doppelt so weite Gänge
  Gen.prototype.isCaveAt = function (grid, lx, y, lz) {
    var c = this.o.caves;
    if (c <= 0 || y < 4 || y > 118) return false;

    // Ab Version 7: Röhren statt Gerüst. Vorher wurden drei Rauschfelder
    // vereinigt – die Nullfläche eines 3D-Rauschens ist aber zusammenhängend,
    // also ergab die Vereinigung ein einziges, weltumspannendes Höhlensystem:
    // gemessen lagen 99,8 % aller Höhlenluft in einer Komponente, bei 24,5 %
    // Hohlraum unter Tage. Jetzt werden zwei Felder geSCHNITTEN – zwei Flächen
    // schneiden sich in einer Kurve, daraus werden Gänge – und eine flache
    // Gebietsmaske trennt die Systeme voneinander. Ergebnis: 3,6 % Hohlraum,
    // die größte Komponente hält noch 42 % statt 99,8 %.
    if (this.genV >= 7) {
      var maske = sampleFlach(grid.m, lx, lz);
      if (maske < GEBIET) return false;
      var rand = (maske - GEBIET) / GEBIET_RAND;
      if (rand > 1) rand = 1;
      var f = weitenFaktor(sampleGrid(grid.d, lx, y, lz)) * rand * c;
      if (Math.abs(sampleGrid(grid.a, lx, y, lz)) < TUN_A * f &&
          Math.abs(sampleGrid(grid.b, lx, y, lz)) < TUN_B * f) return true;
      // Einzelne Hallen tief unten, aber nur im Kern eines Gebiets
      if (y < 44 && rand > 0.7 && sampleGrid(grid.c, lx, y, lz) > HALLE / c) return true;
      return false;
    }

    if (Math.abs(sampleGrid(grid.a, lx, y, lz)) < 0.045 * c) return true;
    if (Math.abs(sampleGrid(grid.b, lx, y, lz)) < 0.036 * c) return true;
    if (y < 40 && sampleGrid(grid.c, lx, y, lz) > 0.45 / c) return true;
    return false;
  };

  // Einzelabfrage (für Werkzeuge außerhalb der Chunk-Generierung).
  // Ab Version 8 heißt das: liegt der Punkt in einem Wurm?
  Gen.prototype.isCave = function (x, y, z) {
    var c = this.o.caves;
    if (c <= 0 || y < 4 || y > 118) return false;
    if (this.genV >= 8 && this.imWurm(x, y, z)) return true;
    if (this.genV >= 7) {
      var maske = this.nCave.fbm2(x / 40 - 3000, z / 40 + 3000, 3);
      if (maske < GEBIET) return false;
      var rand = Math.min(1, (maske - GEBIET) / GEBIET_RAND);
      var f = weitenFaktor(this.nCave.fbm3(x / 62 + 800, y / 30 + 800, z / 62 - 800, 2)) * rand * c;
      if (Math.abs(this.nCave.fbm3(x / 44, y / 26, z / 44, 3)) < TUN_A * f &&
          Math.abs(this.nCave2.fbm3(x / 70 + 200, y / 34, z / 70 - 100, 3)) < TUN_B * f) return true;
      if (y < 44 && rand > 0.7 &&
          this.nCave2.fbm3(x / 90 - 500, y / 40, z / 90 + 500, 2) > HALLE / c) return true;
      return false;
    }
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
    // Der Riss schneidet vor dem Bewuchs, sonst stünden Bäume in der Luft
    // Die Würmer graben in das fertige Gelände, vor den Erdspalten – so kann
    // eine Spalte einen Gang anschneiden und nicht umgekehrt.
    if (this.genV >= 8) this.grabeWuermer(cx, cz, blocks);
    if (this.genV >= 4) this.schneideRisse(cx, cz, blocks);
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
            // 4,5 % Kaktus je Grasblock war ein Kaktusfeld, keine Wüste – auf
            // sechzehn Blöcken standen drei. Jetzt einer alle rund achtzig.
            var feld = this.nGlade.fbm2(wxx / 60 + 400, wzz / 60 - 400, 2);
            kaktusP = feld > 0.22 ? 0.013 : 0.0015;
            buschP = kaktusP + 0.028;
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

    // Meeresgrund und Strand
    if (this.genV >= 5) this.meerDeko(cx, cz, blocks);
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
  BAUM_DICHTE[BIOME.DESERT] = { p: 0.035, gross: 0, tot: true };

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
