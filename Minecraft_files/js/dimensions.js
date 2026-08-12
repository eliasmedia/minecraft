/* ============================================================
   dimensions.js  -  Nether und Aether: Generierung und Portale

   Nether: geschlossene Höhlenwelt zwischen zwei Grundgesteinsdecken, Lavaseen
           unten, Glowstone an den Decken. Portal aus Obsidian, mit Feuerzeug
           gezündet.
   Aether: schwebende Inseln über der Leere. Wer durchfällt, landet wieder in
           der Oberwelt. Portal aus Glowstone, mit einem Eimer Wasser geflutet.
   ============================================================ */
(function () {
  'use strict';

  var B = MC.Blocks, U = MC.U;
  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT;

  var D = {};
  MC.Dim = D;

  D.LIST = ['overworld', 'nether', 'aether'];
  D.TITLE = { overworld: 'Oberwelt', nether: 'Nether', aether: 'Aether' };

  // Der Nether ist acht mal dichter: ein Block dort sind acht hier
  D.SCALE = { overworld: 1, nether: 8, aether: 1 };

  // Deckenhöhe des Nether – darüber nur Grundgestein
  var NETHER_ROOF = 116;
  var NETHER_LAVA = 30;

  // ============================================================
  //  Nether
  // ============================================================
  function netherIds() {
    return {
      rock: B.id('netherrack'), soul: B.id('soul_sand'), lava: B.id('lava'),
      glow: B.id('glowstone'), quartz: B.id('quartz_ore'), bedrock: B.id('bedrock'),
      magma: B.id('magma_block'), gravel: B.id('gravel'), zanite: B.id('zanite_ore'),
      bricks: B.id('nether_bricks'), fence: B.id('fence_oak'), chest: B.id('chest'),
      soilB: B.id('soul_soil'), bone: B.id('bone_block'),
      basalt: B.id('basalt'), black: B.id('blackstone'),
      cNyl: B.id('crimson_nylium'), wNyl: B.id('warped_nylium'),
      cStem: B.id('crimson_stem'), wStem: B.id('warped_stem'),
      cWart: B.id('nether_wart_block'), wWart: B.id('warped_wart_block'),
      shroom: B.id('shroomlight'), cRoot: B.id('crimson_roots'), wRoot: B.id('warped_roots'),
      wart: B.id('nether_wart'), spawner: B.id('spawner')
    };
  }

  // Bodenhöhe der Netherhalle – auch von der Festungsplanung gebraucht
  D.netherFloor = function (gen, wx, wz) {
    return 26 + gen.nDetail.fbm2(wx / 70, wz / 70, 4) * 22;
  };

  // ============================================================
  //  Netherbiome
  // ============================================================
  // Ein Block im Nether sind acht in der Oberwelt – die Biome laufen darum auf
  // einer viel kürzeren Skala als oben, sonst liefe man eine halbe Stunde durch
  // dasselbe. Zwei Rauschfelder reichen: eines für die Achse Ödland–Wald,
  // eines für die Achse trocken–feucht.
  D.NETHER_BIOME = { WASTE: 0, SOUL: 1, CRIMSON: 2, WARPED: 3, DELTA: 4 };
  D.NETHER_BIOME_NAME = ['Netherödland', 'Seelensandtal', 'Karmesinwald', 'Wirrwald', 'Basaltdelta'];

  D.netherBiome = function (gen, wx, wz) {
    if (gen.genV < 3) return D.NETHER_BIOME.WASTE;
    var key = (wx >> 2) + ',' + (wz >> 2);
    if (!gen._nbC) { gen._nbC = {}; gen._nbN = 0; }
    var c = gen._nbC[key];
    if (c !== undefined) return c;
    var a = gen.nTemp.fbm2(wx / 210 + 4000, wz / 210 - 4000, 3);
    var b2 = gen.nHumid.fbm2(wx / 170 - 2500, wz / 170 + 2500, 3);
    var NB = D.NETHER_BIOME;
    var r;
    if (a < -0.24) r = NB.SOUL;                       // ausgewaschene Senken
    else if (a > 0.26) r = NB.DELTA;                  // frisch, vulkanisch
    else if (b2 > 0.20) r = NB.CRIMSON;
    else if (b2 < -0.20) r = NB.WARPED;
    else r = NB.WASTE;
    if (++gen._nbN > 60000) { gen._nbC = {}; gen._nbN = 0; }
    gen._nbC[key] = r;
    return r;
  };

  // Welcher Belag liegt in diesem Biom auf der Sohle?
  //
  // Wichtig ist das WO: gelegt wird auf die begehbare Oberfläche, nicht auf die
  // nominale Bodenhöhe. Die Netherrackbänke wachsen über den Boden hinaus – ein
  // Belag an der Bodenhöhe verschwindet darum unter ihnen, und man läuft weiter
  // über Netherrack. Genau das war der erste Anlauf.
  //   tiefe = 0 ist die Oberfläche, 1..3 darunter.
  function netherBelag(gen, ID, biom, wx, y, wz, tiefe, alt) {
    var NB = D.NETHER_BIOME;
    switch (biom) {
      case NB.SOUL:
        // Seelensandtal: Seelenerde mit Seelensandadern
        return U.hash3(wx, y + 7, wz) < 0.28 ? ID.soul : ID.soilB;
      case NB.CRIMSON:
        return tiefe === 0 ? ID.cNyl : alt;
      case NB.WARPED:
        return tiefe === 0 ? ID.wNyl : alt;
      case NB.DELTA: {
        // Basalt in Bänken, dazwischen Schwarzstein und etwas Magma
        var n = gen.nDetail.fbm3(wx / 12, y / 9, wz / 12, 2);
        if (n > 0.18) return ID.basalt;
        if (tiefe > 0 && U.hash3(wx, y + 51, wz) < 0.12) return ID.magma;
        return ID.black;
      }
    }
    return alt;
  }

  // Pilzbaum: dicker Stamm, breite Kappe aus Warzenblock, darin Leuchtpilze.
  // Sie sind die einzige Lichtquelle in den beiden Wäldern – ohne sie wäre ein
  // Pilzwald ein dunkler Netherrackgang mit anderer Bodenfarbe.
  function pilzbaum(set, hole, ID, karmesin, lx, ly, lz, wx, wz, seed) {
    var rnd = U.rng(U.hashString('pilz:' + seed + ':' + wx + ':' + wz));
    var stamm = karmesin ? ID.cStem : ID.wStem;
    var kappe = karmesin ? ID.cWart : ID.wWart;
    var h = 5 + ((rnd() * 8) | 0);
    var dick = h > 9 && rnd() < 0.5;
    var s = dick ? 2 : 1;
    var x, y, z;
    for (y = 0; y < h; y++) {
      for (z = 0; z < s; z++) for (x = 0; x < s; x++) set(lx + x, ly + y, lz + z, stamm, true);
    }
    // Kappe: zwei bis drei Lagen, oben schmaler
    var top = ly + h;
    for (y = 0; y < 3; y++) {
      var r = (y === 2) ? 1 : (dick ? 3 : 2);
      for (z = -r; z <= r + s - 1; z++) {
        for (x = -r; x <= r + s - 1; x++) {
          var dx = x < 0 ? -x : (x > s - 1 ? x - s + 1 : 0);
          var dz = z < 0 ? -z : (z > s - 1 ? z - s + 1 : 0);
          if (dx * dx + dz * dz > r * r + 1) continue;
          var id = kappe;
          if (rnd() < 0.09) id = ID.shroom;
          set(lx + x, top + y, lz + z, id, false);
        }
      }
    }
    // ein paar Leuchtpilze hängen unter der Kappe
    for (var k = 0; k < 3; k++) {
      if (rnd() < 0.5) continue;
      set(lx + ((rnd() * 3) | 0) - 1, top - 1, lz + ((rnd() * 3) | 0) - 1, ID.shroom, false);
    }
  }

  D.generateNether = function (gen, cx, cz, blocks, meta) {
    var ID = gen._netherIds || (gen._netherIds = netherIds());
    var wx0 = cx * CS, wz0 = cz * CS;

    for (var z = 0; z < CS; z++) {
      for (var x = 0; x < CS; x++) {
        var wx = wx0 + x, wz = wz0 + z;
        // Zwei Höhenprofile: Boden steigt an, Decke hängt herunter
        var floor = D.netherFloor(gen, wx, wz);
        var roof = NETHER_ROOF - 18 - gen.nMount.fbm2(wx / 60 + 500, wz / 60 - 500, 4) * 20;
        var soulPatch = gen.nHumid.fbm2(wx / 40 + 900, wz / 40, 2);
        var biom = D.netherBiome(gen, wx, wz);

        for (var y = 0; y < NETHER_ROOF + 5; y++) {
          var i = x | (z << 4) | (y << 8);
          var id = 0;

          if (y <= 2 || y >= NETHER_ROOF + 2 || (y <= 4 && U.hash3(wx, y, wz) < 0.5) ||
              (y >= NETHER_ROOF && U.hash3(wx, y + 90, wz) < 0.5)) {
            id = ID.bedrock;
          } else if (y < floor) {
            id = ID.rock;
          } else if (y > roof) {
            id = ID.rock;
          } else if (y <= NETHER_LAVA) {
            id = ID.lava;
          }

          // Netherrackbänke und -pfeiler in der Halle. Entscheidend ist, dass hier
          // ein Volumen genommen wird und nicht ein schmaler Schnitt durchs
          // Rauschfeld: eine Isofläche ergibt immer nur eine Schale von ein, zwei
          // Blöcken, und genau darum waren die Wände hauchdünn und die Böden, auf
          // denen man steht, brachen beim Darüberlaufen durch.
          if (id === 0 && y > floor && y < roof) {
            var blob = gen.nCave.fbm3(wx / 34, y / 26, wz / 34, 3);
            if (blob > 0.15) id = ID.rock;
          }

          if (id === ID.rock) {
            // Seelensand in Nestern nahe der Oberfläche
            if (soulPatch > 0.28 && y >= floor - 3 && y < floor) id = ID.soul;
            else if (y < NETHER_LAVA + 3 && U.hash3(wx, y + 33, wz) < 0.04) id = ID.magma;
          }
          if (id !== 0) blocks[i] = id;
        }

      }
    }

    // Nethergewächs auf den Seelensandnestern – ohne das gäbe es kein Brauen
    for (var wz2 = 0; wz2 < CS; wz2++) {
      for (var wx2 = 0; wx2 < CS; wx2++) {
        for (var wy2 = 1; wy2 < WH - 1; wy2++) {
          var si = wx2 | (wz2 << 4) | (wy2 << 8);
          if (blocks[si] !== ID.soul && blocks[si] !== ID.soilB) continue;
          if (blocks[wx2 | (wz2 << 4) | ((wy2 + 1) << 8)] !== 0) continue;
          if (U.hash3(cx * CS + wx2, 4711, cz * CS + wz2) > 0.09) continue;
          blocks[wx2 | (wz2 << 4) | ((wy2 + 1) << 8)] = ID.wart;
          meta[wx2 | (wz2 << 4) | ((wy2 + 1) << 8)] = 1 + ((U.hash3(cx * CS + wx2, 99, cz * CS + wz2) * 3) | 0);
        }
      }
    }

    if (gen.genV >= 3) D.netherPlants(gen, cx, cz, blocks, meta, ID);

    // Erzadern: Quarz häufig, Zanit deutlich seltener und tiefer
    var rnd = U.rng((gen.seed ^ 0x9e37 ^ (cx * 341873128) ^ (cz * 132897987)) >>> 0);
    var adern = [
      { id: ID.quartz, tries: 14, size: 8, min: 6, max: NETHER_ROOF - 6 },
      { id: ID.zanite, tries: 5, size: 5, min: 6, max: 62 }
    ];
    for (var a = 0; a < adern.length; a++) {
      var spec = adern[a];
      for (var t = 0; t < spec.tries; t++) {
        var qx = (rnd() * CS) | 0, qz = (rnd() * CS) | 0;
        var qy = spec.min + ((rnd() * (spec.max - spec.min)) | 0);
        var n = 3 + ((rnd() * spec.size) | 0);
        for (var k = 0; k < n; k++) {
          if (qx < 0 || qx >= CS || qz < 0 || qz >= CS || qy < 1 || qy >= WH) break;
          var qi = qx | (qz << 4) | (qy << 8);
          if (blocks[qi] === ID.rock) blocks[qi] = spec.id;
          var d = (rnd() * 6) | 0;
          if (d === 0) qx++; else if (d === 1) qx--; else if (d === 2) qy++;
          else if (d === 3) qy--; else if (d === 4) qz++; else qz--;
        }
      }
    }

    // Glowstone gibt es nur in den Festungen
    D.drawFortress(gen, cx, cz, blocks, meta, ID);
  };

  // ============================================================
  //  Bewuchs der Netherbiome
  // ============================================================
  // Pilzwälder bekommen Bäume und Wurzeln, das Seelensandtal Knochenrippen,
  // das Delta Basaltsäulen. Wie oben gilt: alles rein aus Seed und Position,
  // und der Rand ist weit genug, damit Kappen über die Chunkgrenze reichen.
  D.netherPlants = function (gen, cx, cz, blocks, meta, ID) {
    var wx0 = cx * CS, wz0 = cz * CS;
    var NB = D.NETHER_BIOME;

    function set(lx, ly, lz, id, over) {
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || ly < 1 || ly >= WH) return;
      var i = lx | (lz << 4) | (ly << 8);
      if (!over && blocks[i] !== 0) return;
      blocks[i] = id; meta[i] = 0;
    }
    function hole(lx, ly, lz) {
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || ly < 0 || ly >= WH) return -1;
      return blocks[lx | (lz << 4) | (ly << 8)];
    }
    // Oberste begehbare Fläche je Spalte – einmal für den ganzen Chunk, nicht
    // bei jedem Aufruf neu. Der Nether ist 116 Blöcke hoch; die Suche 256-mal
    // doppelt zu machen kostete mehr als der ganze Rest der Biome zusammen.
    var sohlen = new Int16Array(CS * CS);
    for (var sz = 0; sz < CS; sz++) {
      for (var sx = 0; sx < CS; sx++) {
        var gef = -1;
        for (var sy = NETHER_ROOF - 6; sy > 4; sy--) {
          if (blocks[sx | (sz << 4) | (sy << 8)] <= 0) continue;
          if (blocks[sx | (sz << 4) | ((sy + 1) << 8)] !== 0) continue;
          if (blocks[sx | (sz << 4) | ((sy + 2) << 8)] !== 0) continue;
          gef = sy; break;
        }
        sohlen[sx | (sz << 4)] = gef;
      }
    }
    function sohle(lx, lz) {
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS) return -1;
      return sohlen[lx | (lz << 4)];
    }

    // ---- Belag: die obersten vier Schichten der begehbaren Oberfläche ----
    var NBb = D.NETHER_BIOME;
    for (var bz2 = 0; bz2 < CS; bz2++) {
      for (var bx2 = 0; bx2 < CS; bx2++) {
        var by = sohle(bx2, bz2);
        if (by < 5) continue;
        var bwx = wx0 + bx2, bwz = wz0 + bz2;
        var bb = D.netherBiome(gen, bwx, bwz);
        if (bb === NBb.WASTE) continue;
        for (var td = 0; td < 4; td++) {
          var ty = by - td;
          if (ty < 3) break;
          var ti = bx2 | (bz2 << 4) | (ty << 8);
          var cur = blocks[ti];
          // Fels, Magma, Kies und die Seelensandnester dürfen umgefärbt werden.
          // Ohne den Seelensand blieb rund ein Drittel jedes Pilzwaldes nackter
          // Netherrack – die Nester liegen quer über alle Biome.
          if (cur !== ID.rock && cur !== ID.magma && cur !== ID.gravel &&
              cur !== ID.soul && cur !== ID.soilB) break;
          blocks[ti] = netherBelag(gen, ID, bb, bwx, ty, bwz, td, cur);
        }
      }
    }

    // ---- Pilzwälder: Bäume auf einem 5er-Raster, wie oben in der Oberwelt ----
    var ZELLE = 5, RAND = 6;
    for (var gz = Math.floor((wz0 - RAND) / ZELLE); gz <= Math.floor((wz0 + CS + RAND) / ZELLE); gz++) {
      for (var gx = Math.floor((wx0 - RAND) / ZELLE); gx <= Math.floor((wx0 + CS + RAND) / ZELLE); gx++) {
        var rnd = U.rng(U.hashString('npilz:' + gen.seed + ':' + gx + ':' + gz));
        var px = gx * ZELLE + ((rnd() * ZELLE) | 0);
        var pz = gz * ZELLE + ((rnd() * ZELLE) | 0);
        var biom = D.netherBiome(gen, px, pz);
        if (biom !== NB.CRIMSON && biom !== NB.WARPED) continue;
        if (rnd() > 0.55 * gen.o.vegetation) continue;
        var lx = px - wx0, lz = pz - wz0;
        // Die Spalte liegt vielleicht im Nachbarchunk – dann nur zeichnen, was
        // hereinragt, und die Höhe über die eigene Sohle schätzen.
        var basis = -1;
        if (lx >= 0 && lx < CS && lz >= 0 && lz < CS) basis = sohle(lx, lz);
        else {
          var qx = Math.min(CS - 1, Math.max(0, lx)), qz = Math.min(CS - 1, Math.max(0, lz));
          basis = sohle(qx, qz);
        }
        if (basis < 6) continue;
        pilzbaum(set, hole, ID, biom === NB.CRIMSON, lx, basis + 1, lz, px, pz, gen.seed);
      }
    }

    // ---- Bodenbewuchs und Streugut ----
    for (var z = 0; z < CS; z++) {
      for (var x = 0; x < CS; x++) {
        var wx = wx0 + x, wz = wz0 + z;
        var b2 = D.netherBiome(gen, wx, wz);
        var y = sohle(x, z);
        if (y < 5) continue;
        var boden = hole(x, y, z);
        var r = U.hash3(wx, 1717, wz);

        if (b2 === NB.CRIMSON && boden === ID.cNyl) {
          if (r < 0.22) set(x, y + 1, z, ID.cRoot, false);
        } else if (b2 === NB.WARPED && boden === ID.wNyl) {
          if (r < 0.22) set(x, y + 1, z, ID.wRoot, false);
          // vereinzelte Leuchtpilze direkt am Boden – der Wirrwald glimmt
          else if (r < 0.235) set(x, y + 1, z, ID.shroom, false);
        } else if (b2 === NB.SOUL) {
          // Nethergewächs wächst hier von selbst – im Tal ist es zu Hause
          if (r > 0.90 && (boden === ID.soilB || boden === ID.soul)) {
            set(x, y + 1, z, ID.wart, false);
            var wi = x | (z << 4) | ((y + 1) << 8);
            if (blocks[wi] === ID.wart) meta[wi] = 1 + ((U.hash3(wx, 99, wz) * 3) | 0);
          }
          // Knochenrippen: senkrechte Bögen aus Knochenblock
          if (r < 0.006) {
            var hoch = 4 + ((U.hash3(wx, 3, wz) * 5) | 0);
            for (var k = 0; k < hoch; k++) set(x, y + 1 + k, z, ID.bone, true);
            var neig = U.hash3(wx, 4, wz) < 0.5 ? 1 : -1;
            for (var a2 = 1; a2 <= 2; a2++) set(x + neig * a2, y + hoch, z, ID.bone, false);
          }
        } else if (b2 === NB.DELTA) {
          // Basaltsäulen, wie sie im Original aus dem Boden stehen
          if (r < 0.012) {
            var sh = 2 + ((U.hash3(wx, 6, wz) * 7) | 0);
            for (var k2 = 0; k2 < sh; k2++) set(x, y + 1 + k2, z, ID.basalt, true);
          }
        }
      }
    }
  };

  // ============================================================
  //  Netherfestungen
  // ============================================================
  // Kleine Bastionen aus Netherziegeln. Sie sind die einzige Glowstonequelle –
  // und Glowstone ist das Tor zum Aether, darum sollen sie gesucht werden wollen.
  var FORT_REGION = 8;                       // Chunks je Region
  var FORT_SPACING = FORT_REGION * CS;       // 128 Blöcke
  var FORT_CHANCE = 0.62;
  var FORT_R = 6;                            // halbe Kantenlänge der Plattform (alt)
  var FORT_R5 = 13;                          // ab Version 5: deutlich größer

  D.fortressAt = function (gen, rx, rz) {
    if (!gen._forts) gen._forts = {};
    var key = rx + ',' + rz;
    if (key in gen._forts) return gen._forts[key];
    var f = null;
    var rnd = U.rng(U.hashString('festung:' + gen.seed + ':' + rx + ':' + rz));
    if (rnd() <= FORT_CHANCE) {
      var R = (gen.genV >= 5) ? FORT_R5 : FORT_R;
      var cx = rx * FORT_SPACING + 30 + Math.floor(rnd() * (FORT_SPACING - 60));
      var cz = rz * FORT_SPACING + 30 + Math.floor(rnd() * (FORT_SPACING - 60));
      // Nur auf halbwegs ebenem Grund über dem Lavaspiegel bauen
      var lo = 999, hi = -999;
      for (var s = 0; s < 9; s++) {
        var sx = cx + ((s % 3) - 1) * R, sz = cz + (((s / 3) | 0) - 1) * R;
        var h = D.netherFloor(gen, sx, sz);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
      // Über einem Lavasee wird eben aufgestockt – eine Bastion auf Pfeilern
      // sieht ohnehin besser aus als eine, die es gar nicht gibt.
      var y = Math.max(Math.round(hi), NETHER_LAVA + 4);
      if (hi - lo <= 12 && y < NETHER_ROOF - 22) {
        f = { id: rx + ':' + rz, x: cx, z: cz, y: y, r: R,
              minX: cx - R, maxX: cx + R, minZ: cz - R, maxZ: cz + R };
      }
    }
    gen._forts[key] = f;
    return f;
  };

  D.fortressNear = function (gen, wx, wz) {
    var rx = Math.floor(wx / FORT_SPACING), rz = Math.floor(wz / FORT_SPACING);
    var list = null;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        var f = D.fortressAt(gen, rx + dx, rz + dz);
        if (!f) continue;
        if (wx < f.minX - 20 || wx > f.maxX + 20 || wz < f.minZ - 20 || wz > f.maxZ + 20) continue;
        (list || (list = [])).push(f);
      }
    }
    return list;
  };

  D.drawFortress = function (gen, cx, cz, blocks, meta, ID) {
    var list = D.fortressNear(gen, cx * CS + 8, cz * CS + 8);
    if (!list) return;
    var wx0 = cx * CS, wz0 = cz * CS;

    function set(wx, wy, wz, id, m) {
      var lx = wx - wx0, lz = wz - wz0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 0 || wy >= WH) return;
      var i = lx | (lz << 4) | (wy << 8);
      blocks[i] = id;
      meta[i] = m || 0;
    }

    for (var n = 0; n < list.length; n++) {
      var f = list[n];
      // Randbereich mitprüfen, die Bastion räumt einige Blöcke ringsum frei
      var rand = (gen.genV >= 5) ? 5 : 3;
      if (f.maxX + rand < wx0 || f.minX - rand > wx0 + CS - 1) continue;
      if (f.maxZ + rand < wz0 || f.minZ - rand > wz0 + CS - 1) continue;
      buildFortress(f, set, ID, gen);
    }
  };

  function buildFortress(f, set, ID, gen) {
    if (gen && gen.genV >= 5) return buildBastion(f, set, ID, gen);
    var y = f.y, x, z, k;
    var R = FORT_R;

    // Ringsum freiräumen, sonst verschwindet die Bastion in einem Netherrackhügel
    for (x = f.minX - 3; x <= f.maxX + 3; x++) {
      for (z = f.minZ - 3; z <= f.maxZ + 3; z++) {
        for (k = 1; k <= 10; k++) set(x, y + k, z, 0, 0);
      }
    }

    // Sockel und Freiraum darüber. Der Unterbau reicht bis auf den Grund,
    // damit die Bastion auch über einem Lavasee sicher steht.
    for (x = f.minX; x <= f.maxX; x++) {
      for (z = f.minZ; z <= f.maxZ; z++) {
        for (k = 1; k <= 12; k++) set(x, y + k, z, 0, 0);
        set(x, y, z, ID.bricks, 0);
        var rand = (x === f.minX || x === f.maxX || z === f.minZ || z === f.maxZ);
        var tief = rand ? 10 : 3;
        for (k = 1; k <= tief; k++) set(x, y - k, z, ID.bricks, 0);
      }
    }
    // Brüstung am Rand
    for (x = f.minX; x <= f.maxX; x++) {
      set(x, y + 1, f.minZ, ID.fence, 0);
      set(x, y + 1, f.maxZ, ID.fence, 0);
    }
    for (z = f.minZ; z <= f.maxZ; z++) {
      set(f.minX, y + 1, z, ID.fence, 0);
      set(f.maxX, y + 1, z, ID.fence, 0);
    }

    // Innenraum 7x7, Wände 4 hoch, zwei Durchgänge
    var i0 = -3, i1 = 3;
    for (x = i0; x <= i1; x++) {
      for (z = i0; z <= i1; z++) {
        var rand = (x === i0 || x === i1 || z === i0 || z === i1);
        for (k = 1; k <= 4; k++) {
          if (!rand) { set(f.x + x, y + k, f.z + z, 0, 0); continue; }
          // Durchgang in der Mitte der Nord- und Südwand
          var tuer = (Math.abs(x) <= 1 && (z === i0 || z === i1)) && k <= 3;
          set(f.x + x, y + k, f.z + z, tuer ? 0 : ID.bricks, 0);
        }
        // Dach
        set(f.x + x, y + 5, f.z + z, ID.bricks, 0);
      }
    }

    // Glowstone: vier Leuchten in der Decke, vier auf Ecksäulen, vier im Sockel
    var deckenLampen = [[-2, -2], [2, -2], [-2, 2], [2, 2]];
    for (k = 0; k < deckenLampen.length; k++) {
      set(f.x + deckenLampen[k][0], y + 4, f.z + deckenLampen[k][1], ID.glow, 0);
    }
    var saeulen = [[i0 + 1, i0 + 1], [i1 - 1, i0 + 1], [i0 + 1, i1 - 1], [i1 - 1, i1 - 1]];
    for (k = 0; k < saeulen.length; k++) {
      set(f.x + saeulen[k][0], y + 1, f.z + saeulen[k][1], ID.bricks, 0);
      set(f.x + saeulen[k][0], y + 2, f.z + saeulen[k][1], ID.bricks, 0);
      set(f.x + saeulen[k][0], y + 3, f.z + saeulen[k][1], ID.glow, 0);
    }
    // Leuchtfeuer an den vier Ecken der Plattform, damit man sie von weit sieht
    var ecken = [[f.minX + 1, f.minZ + 1], [f.maxX - 1, f.minZ + 1],
                 [f.minX + 1, f.maxZ - 1], [f.maxX - 1, f.maxZ - 1]];
    for (k = 0; k < ecken.length; k++) {
      set(ecken[k][0], y + 1, ecken[k][1], ID.bricks, 0);
      set(ecken[k][0], y + 2, ecken[k][1], ID.bricks, 0);
      set(ecken[k][0], y + 3, ecken[k][1], ID.glow, 0);
    }

    // Zwei Leuchten über dem Eingang. Zusammen ergibt eine Festung genug
    // Glowstonestaub für genau einen Aetherrahmen – die Truhe ist der Puffer.
    set(f.x, y + 4, f.z + i0 + 1, ID.glow, 0);
    set(f.x, y + 4, f.z + i1 - 1, ID.glow, 0);

    // Truhe in der Mitte
    set(f.x, y + 1, f.z, ID.chest, 0);
  }

  // ============================================================
  //  Bastion ab Version 5
  // ============================================================
  // Die alte Festung war eine Plattform mit einer Stube darauf: in zwanzig
  // Sekunden ausgeräumt. Diese hier hat einen Bergfried über drei Ebenen, vier
  // Ecktürme, ein Kellergewölbe und zwei Lohenspawner – man muss sie einnehmen.
  function buildBastion(f, set, ID, gen) {
    var y = f.y, R = f.r || FORT_R5;
    var x, z, k;
    var rnd = U.rng(U.hashString('bastion:' + gen.seed + ':' + f.id));

    // Ringsum freiräumen und den Unterbau bis auf den Grund ziehen
    for (x = f.minX - 4; x <= f.maxX + 4; x++) {
      for (z = f.minZ - 4; z <= f.maxZ + 4; z++) {
        for (k = 1; k <= 24; k++) set(x, y + k, z, 0, 0);
      }
    }
    for (x = f.minX; x <= f.maxX; x++) {
      for (z = f.minZ; z <= f.maxZ; z++) {
        set(x, y, z, ID.bricks, 0);
        var amRand = (x === f.minX || x === f.maxX || z === f.minZ || z === f.maxZ);
        var tief = amRand ? 22 : 8;
        for (k = 1; k <= tief; k++) set(x, y - k, z, ID.bricks, 0);
      }
    }
    // Brüstung ringsum, mit Zinnen
    for (x = f.minX; x <= f.maxX; x++) {
      for (z = f.minZ; z <= f.maxZ; z++) {
        if (x !== f.minX && x !== f.maxX && z !== f.minZ && z !== f.maxZ) continue;
        set(x, y + 1, z, ID.bricks, 0);
        if (((x + z) & 1) === 0) set(x, y + 2, z, ID.bricks, 0);
      }
    }

    // ---- Kellergewölbe unter dem Hof ----
    var kw = 5;
    for (x = -kw; x <= kw; x++) {
      for (z = -kw; z <= kw; z++) {
        for (k = 1; k <= 4; k++) set(f.x + x, y - k, f.z + z, 0, 0);
        set(f.x + x, y - 5, f.z + z, ID.bricks, 0);
      }
    }
    // Treppenschacht vom Hof hinunter
    for (k = 0; k <= 4; k++) {
      set(f.x + kw, y - k, f.z, 0, 0);
      set(f.x + kw, y - k, f.z + 1, 0, 0);
    }
    set(f.x - kw + 1, y - 4, f.z - kw + 1, ID.chest, 0);
    set(f.x + kw - 1, y - 4, f.z + kw - 1, ID.chest, 0);
    // Der eine Lohenspawner steht im Keller, der andere oben im Bergfried.
    // Meta 1 sagt dem Spawner, dass hier Lohen herauskommen.
    set(f.x, y - 4, f.z, ID.spawner, 1);

    // ---- Bergfried: 11x11, drei Geschosse ----
    var b = 5;
    for (var etage = 0; etage < 3; etage++) {
      var by = y + 1 + etage * 5;
      for (x = -b; x <= b; x++) {
        for (z = -b; z <= b; z++) {
          var wand = (x === -b || x === b || z === -b || z === b);
          for (k = 0; k < 5; k++) {
            if (!wand) { set(f.x + x, by + k, f.z + z, 0, 0); continue; }
            // Fenster in Augenhöhe, Durchgang im Erdgeschoss
            var fenster = (k === 2 && ((x + z) & 3) === 0);
            var tor = (etage === 0 && Math.abs(x) <= 1 && z === b && k <= 2);
            set(f.x + x, by + k, f.z + z, (fenster || tor) ? 0 : ID.bricks, 0);
          }
          // Zwischendecke, in der Mitte offen für die Leiter
          if (!wand) {
            var loch = (Math.abs(x) <= 1 && Math.abs(z) <= 1);
            set(f.x + x, by + 5, f.z + z, loch && etage < 2 ? 0 : ID.bricks, 0);
          }
        }
      }
      // Leiter durch alle Geschosse
      if (etage < 2) for (k = 0; k <= 5; k++) set(f.x, by + k, f.z + 1, ID.fence, 0);
      // Licht je Geschoss
      [[-3, -3], [3, -3], [-3, 3], [3, 3]].forEach(function (p2) {
        set(f.x + p2[0], by + 4, f.z + p2[1], ID.glow, 0);
      });
    }
    // Truhen und der zweite Spawner im Bergfried
    set(f.x - 3, y + 2, f.z - 3, ID.chest, 0);
    set(f.x + 3, y + 7, f.z + 3, ID.chest, 0);
    set(f.x + 3, y + 12, f.z - 3, ID.chest, 0);
    set(f.x, y + 12, f.z, ID.spawner, 1);

    // ---- Vier Ecktürme, 5x5 und höher als der Bergfried ----
    var t = R - 3;
    [[-t, -t], [t, -t], [-t, t], [t, t]].forEach(function (p2) {
      var tx = f.x + p2[0], tz = f.z + p2[1];
      var hoehe = 14 + ((rnd() * 5) | 0);
      for (var ax = -2; ax <= 2; ax++) {
        for (var az = -2; az <= 2; az++) {
          var w = (Math.abs(ax) === 2 || Math.abs(az) === 2);
          for (var ay = 1; ay <= hoehe; ay++) {
            set(tx + ax, y + ay, tz + az, w ? ID.bricks : 0, 0);
          }
          // Zinnen und Plattform oben
          set(tx + ax, y + hoehe + 1, tz + az, w ? ID.bricks : ID.bricks, 0);
          if (w && ((ax + az) & 1) === 0) set(tx + ax, y + hoehe + 2, tz + az, ID.bricks, 0);
        }
      }
      // Leuchtfeuer auf jedem Turm – daran erkennt man die Bastion von weitem
      set(tx, y + hoehe + 2, tz, ID.glow, 0);
      set(tx, y + hoehe + 3, tz, ID.glow, 0);
      // Innenschacht mit Aufstieg
      for (var ly = 1; ly <= hoehe; ly++) set(tx, y + ly, tz + 1, ID.fence, 0);
    });

    // ---- Glowstone im Hof, damit es sich lohnt hinzugehen ----
    for (k = 0; k < 8; k++) {
      var gx = f.minX + 2 + ((rnd() * (R * 2 - 4)) | 0);
      var gz = f.minZ + 2 + ((rnd() * (R * 2 - 4)) | 0);
      if (Math.abs(gx - f.x) <= b + 1 && Math.abs(gz - f.z) <= b + 1) continue;
      set(gx, y + 1, gz, ID.glow, 0);
    }
  }

  // Beute einer Festungstruhe (wie bei den Dorftruhen aus der Position gewürfelt)
  var FORT_LOOT = [
    ['glowstone_dust', 0.9, 3, 8], ['quartz', 0.8, 4, 10], ['gold_ingot', 0.6, 1, 4],
    ['zanite_gemstone', 0.5, 1, 3], ['iron_ingot', 0.5, 2, 5], ['flint_and_steel', 0.35, 1, 1],
    ['obsidian', 0.3, 1, 4], ['golden_apple', 0.12, 1, 1]
  ];

  D.fortressLoot = function (gen, wx, wy, wz) {
    var list = D.fortressNear(gen, wx, wz);
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      if (wx !== f.x || wz !== f.z) continue;
      return rollLoot(FORT_LOOT, U.rng(U.hashString('fortkiste:' + f.id + ':' + wy)));
    }
    return null;
  };

  function rollLoot(table, rnd) {
    var items = new Array(27), frei = [], n = 0;
    for (var s = 0; s < 27; s++) frei.push(s);
    for (var i = 0; i < table.length; i++) {
      var e = table[i];
      if (rnd() > e[1]) continue;
      if (!MC.Items.get(e[0])) continue;
      var count = e[2] + ((rnd() * (e[3] - e[2] + 1)) | 0);
      var slot = frei.splice((rnd() * frei.length) | 0, 1)[0];
      items[slot] = MC.Items.newStack(e[0], count);
      n++;
    }
    return n ? items : null;
  }

  // ============================================================
  //  Aether
  // ============================================================
  function aetherIds() {
    return {
      grass: B.id('aether_grass'), dirt: B.id('aether_dirt'), holy: B.id('holystone'),
      mossy: B.id('mossy_holystone'), quick: B.id('quicksoil'), ice: B.id('icestone'),
      ambro: B.id('ambrosium_ore'), grav: B.id('gravitite_ore'),
      logS: B.id('log_skyroot'), leafS: B.id('leaves_skyroot'),
      logG: B.id('log_golden_oak'), leafG: B.id('leaves_golden_oak'),
      cloud: B.id('aercloud'), cloudB: B.id('aercloud_blue'), cloudG: B.id('aercloud_golden'),
      flower: B.id('aether_flower'), berry: B.id('blueberry_bush'),
      frost: B.id('frosted_grass'), leafC: B.id('leaves_crystal')
    };
  }

  var AETHER_BASE = 72;   // mittlere Inselhöhe

  // ============================================================
  //  Aetherbiome
  // ============================================================
  // Der Aether ist keine Fläche, sondern ein Archipel – die Biome laufen darum
  // auf einer Skala, die etwa einer Insel entspricht. Wer von einer Insel zur
  // nächsten springt, soll den Wechsel merken.
  D.AETHER_BIOME = { WIESEN: 0, HAIN: 1, FROST: 2, FLUGSAND: 3, WOLKEN: 4 };
  D.AETHER_BIOME_NAME = ['Aetherwiesen', 'Goldener Hain', 'Frostspitzen', 'Flugsandwüste', 'Wolkenmeer'];

  D.aetherBiome = function (gen, wx, wz) {
    if (gen.genV < 3) return D.AETHER_BIOME.WIESEN;
    var key = (wx >> 2) + ',' + (wz >> 2);
    if (!gen._abC) { gen._abC = {}; gen._abN = 0; }
    var c = gen._abC[key];
    if (c !== undefined) return c;
    var waerme = gen.nTemp.fbm2(wx / 320 + 8000, wz / 320 - 8000, 3);
    var art = gen.nHumid.fbm2(wx / 260 - 6000, wz / 260 + 6000, 3);
    var AB = D.AETHER_BIOME;
    var r;
    // Die Fenster sind bewusst weit: mit engeren Schwellen waren vier Fünftel
    // aller Inseln Wiesen, und die anderen vier Biome fand man kaum.
    if (waerme < -0.16) r = AB.FROST;
    else if (waerme > 0.15 && art > -0.02) r = AB.HAIN;
    else if (art < -0.18) r = AB.FLUGSAND;
    else if (art > 0.22) r = AB.WOLKEN;
    else r = AB.WIESEN;
    if (++gen._abN > 60000) { gen._abC = {}; gen._abN = 0; }
    gen._abC[key] = r;
    return r;
  };

  // Dichtefeld der Inseln: positiv = Fels. Oben und unten fällt es ab, darum
  // entstehen linsenförmige Brocken statt durchgehender Schichten.
  function islandDensity(gen, wx, y, wz) {
    var shape = gen.nCont.fbm2(wx / 190, wz / 190, 4);           // Grundriss
    var detail = gen.nDetail.fbm3(wx / 42, y / 30, wz / 42, 3);  // Rand aufbrechen
    // Die Inseln sind bewusst mächtig: Gravitit sitzt tief drin und soll
    // erarbeitet werden, nicht von unten abgelesen.
    var top = AETHER_BASE + 10 + shape * 26;
    var bottom = AETHER_BASE - 34 + shape * 22;
    if (y > top || y < bottom - 20) return -1;
    var mid = (top + bottom) * 0.5;
    var half = Math.max(3, (top - bottom) * 0.5);
    var vertical = 1 - Math.abs(y - mid) / half;                 // 1 in der Mitte
    // Unterseite spitzer zulaufen lassen
    if (y < mid) vertical = 1 - Math.pow(Math.abs(y - mid) / half, 0.65);
    var d = shape * 1.05 + vertical * 0.92 + detail * 0.42 - 0.50;
    // Zusätzliche Schlünde: ein zweites, grobes Rauschen stanzt Löcher durch die
    // Inseln, damit man beim Herumlaufen wirklich abstürzen kann.
    var schacht = gen.nMount.fbm2(wx / 58 + 700, wz / 58 - 700, 3);
    if (schacht > 0.16) d -= (schacht - 0.16) * 5.0;
    // ein zweites, feineres Feld reißt kleine Löcher mitten in die Flächen
    var riss = gen.nMountMask.fbm2(wx / 23 - 400, wz / 23 + 400, 2);
    if (riss > 0.38) d -= (riss - 0.38) * 4.2;
    return d;
  }

  D.generateAether = function (gen, cx, cz, blocks, meta) {
    var ID = gen._aetherIds || (gen._aetherIds = aetherIds());
    var wx0 = cx * CS, wz0 = cz * CS;
    var x, y, z, i;
    var surface = new Int16Array(CS * CS);
    var underside = new Int16Array(CS * CS);

    for (z = 0; z < CS; z++) {
      for (x = 0; x < CS; x++) {
        var wx = wx0 + x, wz = wz0 + z;
        var top = -1, unten = -1;
        for (y = 20; y < WH - 8; y++) {
          if (islandDensity(gen, wx, y, wz) <= 0) continue;
          i = x | (z << 4) | (y << 8);
          blocks[i] = ID.holy;
          if (unten < 0) unten = y;
          if (y > top) top = y;
        }
        surface[x | (z << 4)] = top;
        underside[x | (z << 4)] = unten;

        if (top < 0) continue;
        // Deckschicht: Gras auf Erde, an manchen Stellen Flugsand. Ab Version 3
        // entscheidet zuerst das Biom, was oben liegt.
        var quickN = gen.nHumid.fbm2(wx / 55 + 300, wz / 55 - 300, 2);
        var biomA = D.aetherBiome(gen, wx, wz);
        var AB = D.AETHER_BIOME;
        var obenId = ID.grass, fuellId = ID.dirt;
        if (quickN > 0.34) { obenId = ID.quick; fuellId = ID.quick; }
        if (gen.genV >= 3) {
          if (biomA === AB.FROST) { obenId = ID.frost; fuellId = ID.dirt; }
          else if (biomA === AB.FLUGSAND) { obenId = ID.quick; fuellId = ID.quick; }
          else if (biomA === AB.HAIN && quickN <= 0.34) { obenId = ID.grass; fuellId = ID.dirt; }
        }
        var depth = 3 + ((U.hash3(wx, 12, wz) * 2) | 0);
        for (var d = 0; d < depth; d++) {
          var yy = top - d;
          if (yy < 0) break;
          var si = x | (z << 4) | (yy << 8);
          if (blocks[si] !== ID.holy) break;
          blocks[si] = (d === 0) ? obenId : fuellId;
        }
        // In den Frostspitzen sitzt Eisstein bis dicht unter die Grasnarbe
        if (gen.genV >= 3 && biomA === AB.FROST) {
          for (var fy = top - depth; fy > top - depth - 4 && fy > 0; fy--) {
            var fi = x | (z << 4) | (fy << 8);
            if (blocks[fi] === ID.holy && U.hash3(wx, fy + 5, wz) < 0.45) blocks[fi] = ID.ice;
          }
        }
      }
    }

    // Erze und Eisstein im Fels.
    // Alle Adern halten Abstand zur Ober- und zur Unterseite der Insel – sonst
    // könnte man von unten dagegenfliegen und die Vorkommen einfach ablesen.
    // Gravitit sitzt zusätzlich nur in der unteren Hälfte, also möglichst tief.
    var rnd = U.rng((gen.seed ^ 0x5eed ^ (cx * 341873128) ^ (cz * 132897987)) >>> 0);
    var RAND_UNTEN = 6, RAND_OBEN = 4;
    // Was eine Insel hergibt, hängt am Biom: im Hain leuchtet mehr Ambrosium,
    // in den Frostspitzen steckt der Eisstein.
    var biomV = D.aetherBiome(gen, wx0 + 8, wz0 + 8);
    var ABv = D.AETHER_BIOME;
    var mAmbro = 14, mIce = 6;
    if (gen.genV >= 3) {
      if (biomV === ABv.HAIN) mAmbro = 26;
      else if (biomV === ABv.FROST) { mIce = 22; mAmbro = 8; }
      else if (biomV === ABv.FLUGSAND) { mAmbro = 8; mIce = 3; }
    }
    var veins = [
      { id: ID.ambro, tries: mAmbro, size: 6, tief: 0.0 },
      { id: ID.grav, tries: 5, size: 4, tief: 0.55 },
      { id: ID.ice, tries: mIce, size: 8, tief: 0.0 },
      { id: ID.mossy, tries: 5, size: 10, tief: 0.0 }
    ];
    for (var v = 0; v < veins.length; v++) {
      var spec = veins[v];
      for (var t = 0; t < spec.tries; t++) {
        var ox = (rnd() * CS) | 0, oz = (rnd() * CS) | 0;
        var col = ox | (oz << 4);
        var unten = underside[col], oben = surface[col];
        if (unten < 0 || oben - unten < RAND_UNTEN + RAND_OBEN + 2) continue;
        var lo = unten + RAND_UNTEN, hi = oben - RAND_OBEN;
        if (spec.tief > 0) hi = Math.max(lo + 1, Math.round(lo + (hi - lo) * (1 - spec.tief)));
        var oy = lo + ((rnd() * (hi - lo + 1)) | 0);
        var n = 2 + ((rnd() * spec.size) | 0);
        for (var k = 0; k < n; k++) {
          if (ox < 0 || ox >= CS || oz < 0 || oz >= CS || oy < 1 || oy >= WH) break;
          // nie in die äußerste Schale schreiben
          var kolonne = ox | (oz << 4);
          if (underside[kolonne] >= 0 &&
              (oy < underside[kolonne] + RAND_UNTEN || oy > surface[kolonne] - RAND_OBEN)) break;
          var oi = kolonne | (oy << 8);
          if (blocks[oi] === ID.holy) blocks[oi] = spec.id;
          var dd = (rnd() * 6) | 0;
          if (dd === 0) ox++; else if (dd === 1) ox--; else if (dd === 2) oy++;
          else if (dd === 3) oy--; else if (dd === 4) oz++; else oz--;
        }
      }
    }

    // Schwebende Wolkenbänke
    for (z = 0; z < CS; z++) {
      for (x = 0; x < CS; x++) {
        var cwx = wx0 + x, cwz = wz0 + z;
        var cn = gen.nMountMask.fbm3(cwx / 34, 0, cwz / 34, 2);
        // Im Wolkenmeer hängen die Bänke dicht an dicht – dort kommt man kaum
        // ohne sie von Insel zu Insel, und genau das ist der Reiz.
        var schwelle = (gen.genV >= 3 && D.aetherBiome(gen, cwx, cwz) === D.AETHER_BIOME.WOLKEN) ? 0.02 : 0.30;
        if (cn < schwelle) continue;
        var cy = AETHER_BASE + 22 + Math.round(gen.nTemp.fbm2(cwx / 90, cwz / 90, 2) * 26);
        if (cy < 30 || cy > WH - 4) continue;
        var kind = U.hash3(cwx >> 4, 7, cwz >> 4);
        var cid = kind < 0.14 ? ID.cloudB : (kind < 0.26 ? ID.cloudG : ID.cloud);
        for (var ch = 0; ch < 2; ch++) {
          var ci = x | (z << 4) | ((cy + ch) << 8);
          if (blocks[ci] === 0) blocks[ci] = cid;
        }
      }
    }

    // Bewuchs auf den Inseln
    D.aetherPlants(gen, cx, cz, blocks, surface, ID);
  };

  D.aetherPlants = function (gen, cx, cz, blocks, surface, ID) {
    var wx0 = cx * CS, wz0 = cz * CS;

    function set(lx, ly, lz, id, over) {
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || ly < 0 || ly >= WH) return;
      var i = lx | (lz << 4) | (ly << 8);
      if (!over && blocks[i] !== 0) return;
      blocks[i] = id;
    }

    // Bäume – auch über die Chunkgrenze hinaus, damit Kronen zusammenpassen
    for (var dz = -3; dz < CS + 3; dz++) {
      for (var dx = -3; dx < CS + 3; dx++) {
        var wx = wx0 + dx, wz = wz0 + dz;
        var biomT = D.aetherBiome(gen, wx, wz);
        var ABt = D.AETHER_BIOME;
        // Dichte je Biom: der Hain ist ein Wald, die Flugsandwüste fast leer
        var dichte = 0.022;
        if (gen.genV >= 3) {
          if (biomT === ABt.HAIN) dichte = 0.055;
          else if (biomT === ABt.FROST) dichte = 0.020;
          else if (biomT === ABt.FLUGSAND) dichte = 0.003;
          else if (biomT === ABt.WOLKEN) dichte = 0.012;
        }
        if (U.hash3(wx, 8123, wz) > dichte * gen.o.vegetation) continue;
        // Oberfläche für Nachbarspalten neu bestimmen
        var top = -1;
        if (dx >= 0 && dx < CS && dz >= 0 && dz < CS) top = surface[dx | (dz << 4)];
        else {
          for (var sy = WH - 10; sy > 20; sy--) {
            if (islandDensity(gen, wx, sy, wz) > 0) { top = sy; break; }
          }
        }
        if (top < 24) continue;
        var golden = U.hash3(wx, 31, wz) < 0.12;
        var frostBaum = false;
        if (gen.genV >= 3) {
          if (biomT === ABt.HAIN) golden = U.hash3(wx, 31, wz) < 0.72;
          else if (biomT === ABt.FROST) { golden = false; frostBaum = true; }
        }
        aetherTree(dx, top + 1, dz, golden, set, wx, wz, gen, ID, frostBaum);
      }
    }

    // Blumen, Beeren, Gras
    for (var z = 0; z < CS; z++) {
      for (var x = 0; x < CS; x++) {
        var top2 = surface[x | (z << 4)];
        if (top2 < 24 || top2 >= WH - 2) continue;
        var gi = x | (z << 4) | (top2 << 8);
        var boden = blocks[gi];
        if (boden !== ID.grass && boden !== ID.frost) continue;
        if (blocks[x | (z << 4) | ((top2 + 1) << 8)] !== 0) continue;
        var r = U.hash3(wx0 + x, 555, wz0 + z) / Math.max(0.001, gen.o.vegetation);
        var biomB = D.aetherBiome(gen, wx0 + x, wz0 + z);
        // Im Hain blüht es, in den Frostspitzen wächst nur Beerengestrüpp
        if (gen.genV >= 3 && biomB === D.AETHER_BIOME.HAIN) {
          if (r < 0.075) set(x, top2 + 1, z, ID.flower, true);
          else if (r < 0.095) set(x, top2 + 1, z, ID.berry, true);
        } else if (gen.genV >= 3 && boden === ID.frost) {
          if (r < 0.030) set(x, top2 + 1, z, ID.berry, true);
        } else if (r < 0.020) set(x, top2 + 1, z, ID.flower, true);
        else if (r < 0.032) set(x, top2 + 1, z, ID.berry, true);
      }
    }
  };

  function aetherTree(lx, ly, lz, golden, set, wx, wz, gen, ID, frost) {
    var rnd = U.rng(U.hashString(wx + ':' + wz + ':' + gen.seed + ':ae'));
    var logId = golden ? ID.logG : ID.logS;
    var leafId = frost ? ID.leafC : (golden ? ID.leafG : ID.leafS);
    var h = (golden ? 5 : 6) + ((rnd() * 4) | 0);
    for (var y = 0; y < h; y++) set(lx, ly + y, lz, logId, true);
    var ct = ly + h;
    for (var yy = ct - 3; yy <= ct; yy++) {
      var r = (yy >= ct - 1) ? 1 : 2;
      for (var ax = -r; ax <= r; ax++) {
        for (var az = -r; az <= r; az++) {
          if (ax === 0 && az === 0 && yy < ct) continue;
          if (Math.abs(ax) === r && Math.abs(az) === r && r === 2 && rnd() < 0.55) continue;
          set(lx + ax, yy, lz + az, leafId, false);
        }
      }
    }
  }

  // ============================================================
  //  Stimmung: Name und Dunstfarbe je Biom
  // ============================================================
  // Eine Farbe pro Biom ist der billigste und wirksamste Hebel für „lebendig":
  // man merkt den Wechsel, bevor man den ersten neuen Block sieht.
  var NETHER_DUNST = [
    [0.36, 0.11, 0.07],   // Ödland: das bisherige Rot
    [0.14, 0.16, 0.22],   // Seelensandtal: kaltes Blaugrau
    [0.32, 0.05, 0.09],   // Karmesinwald: satter, dunkler
    [0.06, 0.20, 0.22],   // Wirrwald: türkis
    [0.20, 0.18, 0.19]    // Basaltdelta: Asche
  ];
  var AETHER_DUNST = [
    [0.78, 0.90, 1.00],   // Wiesen
    [0.94, 0.90, 0.72],   // Goldener Hain: warmes Licht
    [0.84, 0.94, 1.00],   // Frostspitzen: bleich
    [0.92, 0.88, 0.74],   // Flugsandwüste: sandig
    [0.88, 0.93, 0.98]    // Wolkenmeer: milchig
  ];

  // Welches Biom, wie heißt es, welche Farbe hat der Dunst dort?
  D.stimmung = function (world, x, z) {
    var gen = world.gen;
    if (world.dim === 'nether') {
      var nb = D.netherBiome(gen, x, z);
      return { key: nb, name: D.NETHER_BIOME_NAME[nb], dunst: NETHER_DUNST[nb] };
    }
    if (world.dim === 'aether') {
      var ab = D.aetherBiome(gen, x, z);
      return { key: ab, name: D.AETHER_BIOME_NAME[ab], dunst: AETHER_DUNST[ab] };
    }
    return null;
  };

  // Sicherer Landeplatz beim Ankommen: erste feste Oberfläche mit Luft darüber
  D.findGround = function (world, x, z, preferY) {
    // Im Nether liegt über allem eine Grundgesteinsdecke – von dort aus nach
    // unten zu suchen würde den Spieler oben drauf setzen.
    var ceil = world.dim === 'nether' ? NETHER_ROOF - 12 : WH - 4;
    // Im Aether von ganz oben suchen. Die Inseln sind mächtig; wer bei der
    // mitgebrachten Höhe anfängt, startet mitten im Fels und findet als erste
    // "Oberfläche" ein Loch im Inselinneren – daher stand das Portal im Boden.
    var start = (world.dim === 'aether' || preferY === undefined)
      ? ceil : Math.min(ceil, preferY + 12);
    for (var y = start; y > 2; y--) {
      if (!B.isSolid(world.getBlock(x, y, z))) continue;
      var id = world.getBlock(x, y, z);
      if (B.byId[id] && B.byId[id].damage) continue;      // nicht auf Magma landen
      if (world.getBlock(x, y + 1, z) === 0 && world.getBlock(x, y + 2, z) === 0) return y + 1;
    }
    return -1;
  };

  // ============================================================
  //  Portale
  // ============================================================
  var P = {};
  D.Portal = P;

  // Bauart je Dimension: Rahmenblock + Zündmittel
  P.KINDS = {
    nether: { frame: 'obsidian', portal: 'portal_nether', igniter: 'flint_and_steel', target: 'nether' },
    aether: { frame: 'glowstone', portal: 'portal_aether', igniter: 'water_bucket', target: 'aether' }
  };

  // Sucht ausgehend vom angeklickten Feld eine freie, von Rahmenblöcken
  // umschlossene Fläche und füllt sie. Gibt die Zahl der Portalblöcke zurück.
  P.ignite = function (world, x, y, z, kind) {
    var spec = P.KINDS[kind];
    if (!spec) return 0;
    var frameId = B.id(spec.frame);
    var portalId = B.id(spec.portal);

    // Beide Achsen probieren: Rahmen kann über X oder über Z gespannt sein
    var res = fill(world, x, y, z, frameId, portalId, 0) || fill(world, x, y, z, frameId, portalId, 1);
    return res || 0;
  };

  function fill(world, sx, sy, sz, frameId, portalId, axis) {
    // axis 0: Fläche liegt in der XY-Ebene (z fest), axis 1: ZY-Ebene (x fest)
    var cells = [];
    var seen = {};
    var stack = [[sx, sy, sz]];
    var minY = sy, maxY = sy;
    var limit = 23 * 23;

    while (stack.length) {
      var c = stack.pop();
      var cx = c[0], cy = c[1], cz = c[2];
      var key = cx + ',' + cy + ',' + cz;
      if (seen[key]) continue;
      var id = world.getBlock(cx, cy, cz);
      if (id === frameId) continue;               // Rand erreicht
      if (id !== 0 && !B.isReplaceable(id)) return 0;   // Fremdblock -> ungültig
      if (cy < 1 || cy >= WH - 1) return 0;
      seen[key] = true;
      cells.push([cx, cy, cz]);
      if (cells.length > limit) return 0;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;
      stack.push([cx, cy + 1, cz]);
      stack.push([cx, cy - 1, cz]);
      if (axis === 0) { stack.push([cx + 1, cy, cz]); stack.push([cx - 1, cy, cz]); }
      else { stack.push([cx, cy, cz + 1]); stack.push([cx, cy, cz - 1]); }
    }

    if (cells.length < 2 || maxY - minY < 1) return 0;

    // Jede Zelle muss ringsum entweder Portalfläche oder Rahmen haben
    for (var i = 0; i < cells.length; i++) {
      var p = cells[i];
      var nb = axis === 0
        ? [[p[0] + 1, p[1], p[2]], [p[0] - 1, p[1], p[2]], [p[0], p[1] + 1, p[2]], [p[0], p[1] - 1, p[2]]]
        : [[p[0], p[1], p[2] + 1], [p[0], p[1], p[2] - 1], [p[0], p[1] + 1, p[2]], [p[0], p[1] - 1, p[2]]];
      for (var k = 0; k < 4; k++) {
        var n = nb[k];
        if (seen[n[0] + ',' + n[1] + ',' + n[2]]) continue;
        if (world.getBlock(n[0], n[1], n[2]) !== frameId) return 0;
      }
    }

    for (var j = 0; j < cells.length; j++) {
      world.setBlock(cells[j][0], cells[j][1], cells[j][2], portalId, axis);
    }
    return cells.length;
  }

  // Zerbricht ein Portal, wenn der Rahmen fehlt
  P.breakLinked = function (world, x, y, z) {
    var id = world.getBlock(x, y, z);
    var b = B.byId[id];
    if (!b || b.shape !== B.SHAPE_PORTAL) return;
    var seen = {}, stack = [[x, y, z]], out = [];
    while (stack.length && out.length < 600) {
      var c = stack.pop();
      var k = c[0] + ',' + c[1] + ',' + c[2];
      if (seen[k]) continue;
      if (world.getBlock(c[0], c[1], c[2]) !== id) continue;
      seen[k] = true;
      out.push(c);
      for (var d = 0; d < 6; d++) {
        var n = MC.NEI[d];
        stack.push([c[0] + n[0], c[1] + n[1], c[2] + n[2]]);
      }
    }
    for (var i = 0; i < out.length; i++) world.setBlock(out[i][0], out[i][1], out[i][2], 0, 0);
  };

  // Sucht in der Zielwelt ein vorhandenes Portal in der Nähe
  P.findNear = function (world, x, y, z, portalId, radius) {
    var best = null, bestD = Infinity;
    for (var dx = -radius; dx <= radius; dx++) {
      for (var dz = -radius; dz <= radius; dz++) {
        for (var dy = -32; dy <= 32; dy++) {
          var px = x + dx, py = y + dy, pz = z + dz;
          if (py < 2 || py >= WH - 2) continue;
          if (world.getBlock(px, py, pz) !== portalId) continue;
          var d = dx * dx + dz * dz + dy * dy * 4;
          if (d < bestD) { bestD = d; best = [px, py, pz]; }
        }
      }
    }
    return best;
  };

  // Baut am Zielort einen Rahmen und zündet ihn
  P.build = function (world, x, y, z, kind) {
    var spec = P.KINDS[kind];
    var frameId = B.id(spec.frame);
    var portalId = B.id(spec.portal);

    // Ebene Stelle suchen: von oben nach unten den ersten festen Boden nehmen
    var gy = D.findGround(world, x, z, y);
    if (gy < 0) gy = Math.max(6, Math.min(WH - 12, y));

    // Plattform und Rahmen (4 breit, 5 hoch, Fläche 2x3)
    var bx, by, bz;
    for (bx = -2; bx <= 2; bx++) {
      for (bz = -1; bz <= 1; bz++) {
        world.setBlock(x + bx, gy - 1, z + bz, frameId, 0, { noUpdate: true });
        for (by = 0; by < 6; by++) world.setBlock(x + bx, gy + by, z + bz, 0, 0, { noUpdate: true });
      }
    }
    for (by = 0; by < 5; by++) {
      world.setBlock(x - 1, gy + by, z, frameId, 0, { noUpdate: true });
      world.setBlock(x + 2, gy + by, z, frameId, 0, { noUpdate: true });
    }
    for (bx = 0; bx <= 1; bx++) {
      world.setBlock(x + bx, gy - 1, z, frameId, 0, { noUpdate: true });
      world.setBlock(x + bx, gy + 4, z, frameId, 0, { noUpdate: true });
    }
    // Innenfläche freiräumen und füllen
    for (bx = 0; bx <= 1; bx++) {
      for (by = 0; by < 4; by++) world.setBlock(x + bx, gy + by, z, 0, 0, { noUpdate: true });
    }
    var n = P.ignite(world, x, gy + 1, z, kind);
    if (!n) {
      // Notnagel: Fläche direkt setzen, falls die Prüfung scheitert
      for (bx = 0; bx <= 1; bx++) {
        for (by = 0; by < 4; by++) world.setBlock(x + bx, gy + by, z, portalId, 0);
      }
    }
    return { x: x + 0.5, y: gy + 0.05, z: z + 0.5 };
  };

})();
