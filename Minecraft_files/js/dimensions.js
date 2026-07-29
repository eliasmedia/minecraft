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
      magma: B.id('magma_block'), gravel: B.id('gravel')
    };
  }

  D.generateNether = function (gen, cx, cz, blocks, meta) {
    var ID = gen._netherIds || (gen._netherIds = netherIds());
    var wx0 = cx * CS, wz0 = cz * CS;

    for (var z = 0; z < CS; z++) {
      for (var x = 0; x < CS; x++) {
        var wx = wx0 + x, wz = wz0 + z;
        // Zwei Höhenprofile: Boden steigt an, Decke hängt herunter
        var floor = 26 + gen.nDetail.fbm2(wx / 70, wz / 70, 4) * 22;
        var roof = NETHER_ROOF - 18 - gen.nMount.fbm2(wx / 60 + 500, wz / 60 - 500, 4) * 20;
        var soulPatch = gen.nHumid.fbm2(wx / 40 + 900, wz / 40, 2);

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

          // Schwebende Netherrackbrocken in der Halle
          if (id === 0 && y > floor && y < roof) {
            var blob = gen.nCave.fbm3(wx / 26, y / 20, wz / 26, 3);
            if (Math.abs(blob) < 0.055) id = ID.rock;
          }

          if (id === ID.rock) {
            // Seelensand in Nestern nahe der Oberfläche
            if (soulPatch > 0.28 && y >= floor - 3 && y < floor) id = ID.soul;
            else if (y < NETHER_LAVA + 3 && U.hash3(wx, y + 33, wz) < 0.04) id = ID.magma;
          }
          if (id !== 0) blocks[i] = id;
        }

        // Glowstone hängt an der Decke
        if (U.hash3(wx, 4711, wz) < 0.008) {
          var ry = Math.floor(roof);
          for (var g = 0; g < 3 && ry - g > floor; g++) {
            var gi = x | (z << 4) | ((ry - g) << 8);
            if (blocks[gi] === 0 || blocks[gi] === ID.rock) blocks[gi] = ID.glow;
          }
        }
      }
    }

    // Quarzadern
    var rnd = U.rng((gen.seed ^ 0x9e37 ^ (cx * 341873128) ^ (cz * 132897987)) >>> 0);
    for (var t = 0; t < 14; t++) {
      var qx = (rnd() * CS) | 0, qz = (rnd() * CS) | 0;
      var qy = 6 + ((rnd() * (NETHER_ROOF - 12)) | 0);
      var n = 3 + ((rnd() * 8) | 0);
      for (var k = 0; k < n; k++) {
        if (qx < 0 || qx >= CS || qz < 0 || qz >= CS || qy < 1 || qy >= WH) break;
        var qi = qx | (qz << 4) | (qy << 8);
        if (blocks[qi] === ID.rock) blocks[qi] = ID.quartz;
        var d = (rnd() * 6) | 0;
        if (d === 0) qx++; else if (d === 1) qx--; else if (d === 2) qy++;
        else if (d === 3) qy--; else if (d === 4) qz++; else qz--;
      }
    }
  };

  // ============================================================
  //  Aether
  // ============================================================
  function aetherIds() {
    return {
      grass: B.id('aether_grass'), dirt: B.id('aether_dirt'), holy: B.id('holystone'),
      mossy: B.id('mossy_holystone'), quick: B.id('quicksoil'), ice: B.id('icestone'),
      ambro: B.id('ambrosium_ore'), zanite: B.id('zanite_ore'), grav: B.id('gravitite_ore'),
      logS: B.id('log_skyroot'), leafS: B.id('leaves_skyroot'),
      logG: B.id('log_golden_oak'), leafG: B.id('leaves_golden_oak'),
      cloud: B.id('aercloud'), cloudB: B.id('aercloud_blue'), cloudG: B.id('aercloud_golden'),
      flower: B.id('aether_flower'), berry: B.id('blueberry_bush')
    };
  }

  var AETHER_BASE = 72;   // mittlere Inselhöhe

  // Dichtefeld der Inseln: positiv = Fels. Oben und unten fällt es ab, darum
  // entstehen linsenförmige Brocken statt durchgehender Schichten.
  function islandDensity(gen, wx, y, wz) {
    var shape = gen.nCont.fbm2(wx / 190, wz / 190, 4);           // Grundriss
    var detail = gen.nDetail.fbm3(wx / 42, y / 30, wz / 42, 3);  // Rand aufbrechen
    var top = AETHER_BASE + 10 + shape * 26;
    var bottom = AETHER_BASE - 14 + shape * 22;
    if (y > top || y < bottom - 18) return -1;
    var mid = (top + bottom) * 0.5;
    var half = Math.max(3, (top - bottom) * 0.5);
    var vertical = 1 - Math.abs(y - mid) / half;                 // 1 in der Mitte
    // Unterseite spitzer zulaufen lassen
    if (y < mid) vertical = 1 - Math.pow(Math.abs(y - mid) / half, 0.65);
    var d = shape * 1.05 + vertical * 0.72 + detail * 0.5 - 0.56;
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

    for (z = 0; z < CS; z++) {
      for (x = 0; x < CS; x++) {
        var wx = wx0 + x, wz = wz0 + z;
        var top = -1;
        for (y = 20; y < WH - 8; y++) {
          if (islandDensity(gen, wx, y, wz) <= 0) continue;
          i = x | (z << 4) | (y << 8);
          blocks[i] = ID.holy;
          if (y > top) top = y;
        }
        surface[x | (z << 4)] = top;

        if (top < 0) continue;
        // Deckschicht: Gras auf Erde, an manchen Stellen Flugsand
        var quickN = gen.nHumid.fbm2(wx / 55 + 300, wz / 55 - 300, 2);
        var depth = 3 + ((U.hash3(wx, 12, wz) * 2) | 0);
        for (var d = 0; d < depth; d++) {
          var yy = top - d;
          if (yy < 0) break;
          var si = x | (z << 4) | (yy << 8);
          if (blocks[si] !== ID.holy) break;
          if (d === 0) blocks[si] = quickN > 0.34 ? ID.quick : ID.grass;
          else blocks[si] = quickN > 0.34 ? ID.quick : ID.dirt;
        }
      }
    }

    // Erze und Eisstein im Fels
    var rnd = U.rng((gen.seed ^ 0x5eed ^ (cx * 341873128) ^ (cz * 132897987)) >>> 0);
    var veins = [
      { id: ID.ambro, tries: 12, size: 6 },
      { id: ID.zanite, tries: 8, size: 5 },
      { id: ID.grav, tries: 3, size: 4 },
      { id: ID.ice, tries: 6, size: 8 },
      { id: ID.mossy, tries: 5, size: 10 }
    ];
    for (var v = 0; v < veins.length; v++) {
      for (var t = 0; t < veins[v].tries; t++) {
        var ox = (rnd() * CS) | 0, oz = (rnd() * CS) | 0;
        var oy = 24 + ((rnd() * (WH - 40)) | 0);
        var n = 2 + ((rnd() * veins[v].size) | 0);
        for (var k = 0; k < n; k++) {
          if (ox < 0 || ox >= CS || oz < 0 || oz >= CS || oy < 1 || oy >= WH) break;
          var oi = ox | (oz << 4) | (oy << 8);
          if (blocks[oi] === ID.holy) blocks[oi] = veins[v].id;
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
        if (cn < 0.30) continue;
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
        if (U.hash3(wx, 8123, wz) > 0.022 * gen.o.vegetation) continue;
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
        aetherTree(dx, top + 1, dz, golden, set, wx, wz, gen, ID);
      }
    }

    // Blumen, Beeren, Gras
    for (var z = 0; z < CS; z++) {
      for (var x = 0; x < CS; x++) {
        var top2 = surface[x | (z << 4)];
        if (top2 < 24 || top2 >= WH - 2) continue;
        var gi = x | (z << 4) | (top2 << 8);
        if (blocks[gi] !== ID.grass) continue;
        if (blocks[x | (z << 4) | ((top2 + 1) << 8)] !== 0) continue;
        var r = U.hash3(wx0 + x, 555, wz0 + z) / Math.max(0.001, gen.o.vegetation);
        if (r < 0.020) set(x, top2 + 1, z, ID.flower, true);
        else if (r < 0.032) set(x, top2 + 1, z, ID.berry, true);
      }
    }
  };

  function aetherTree(lx, ly, lz, golden, set, wx, wz, gen, ID) {
    var rnd = U.rng(U.hashString(wx + ':' + wz + ':' + gen.seed + ':ae'));
    var logId = golden ? ID.logG : ID.logS;
    var leafId = golden ? ID.leafG : ID.leafS;
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

  // Sicherer Landeplatz beim Ankommen: erste feste Oberfläche mit Luft darüber
  D.findGround = function (world, x, z, preferY) {
    // Im Nether liegt über allem eine Grundgesteinsdecke – von dort aus nach
    // unten zu suchen würde den Spieler oben drauf setzen.
    var ceil = world.dim === 'nether' ? NETHER_ROOF - 12 : WH - 4;
    var start = preferY === undefined ? ceil : Math.min(ceil, preferY + 12);
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
