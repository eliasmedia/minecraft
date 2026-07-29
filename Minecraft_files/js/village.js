/* ============================================================
   village.js  -  Dörfer: Rasterlayout, Gebäude, Wege
   Alles rein deterministisch aus Seed + Regionskoordinate, damit ein Chunk
   auch dann korrekt entsteht, wenn seine Nachbarn nie geladen wurden.
   ============================================================ */
(function () {
  'use strict';

  var B = MC.Blocks, U = MC.U;
  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT;

  var V = {};
  MC.Village = V;

  V.REGION = 20;                    // Chunks je Region
  V.SPACING = V.REGION * CS;        // 320 Blöcke Raster
  V.CHANCE = 0.62;                  // Anteil der Regionen mit Dorf
  var CELL = 10;                    // Kantenlänge einer Bauparzelle
  var GRID = 2;                     // Parzellen je Richtung ab der Mitte

  // ---------- Materialsätze ----------
  function matsFor(biome) {
    var BM = MC.WorldGen.BIOME;
    if (biome === BM.DESERT) {
      return { wall: 'sandstone', trim: 'sandstone', floor: 'sandstone',
               roof: 'slab_sandstone', fence: 'fence_oak', path: 'sandstone', glass: 'glass' };
    }
    if (biome === BM.TAIGA || biome === BM.SNOW) {
      return { wall: 'planks_spruce', trim: 'log_spruce', floor: 'planks_spruce',
               roof: 'slab_planks_spruce', fence: 'fence_spruce', path: 'gravel', glass: 'glass' };
    }
    return { wall: 'planks_oak', trim: 'log_oak', floor: 'planks_oak',
             roof: 'slab_planks_oak', fence: 'fence_oak', path: 'gravel', glass: 'glass' };
  }

  // Zum Zaun passendes Tor
  function gateFor(fenceName) {
    return 'gate_' + fenceName.replace('fence_', '');
  }

  function resolve(m) {
    var out = {};
    for (var k in m) out[k] = B.id(m[k]);
    out.gate = B.id(gateFor(m.fence));
    out.cobble = B.id('cobblestone');
    out.dirt = B.id('dirt');
    out.torch = B.id('torch');
    out.door = B.id('door_oak');
    out.bed = B.id('bed');
    out.chest = B.id('chest');
    out.bench = B.id('crafting_table');
    out.furnace = B.id('furnace');
    out.shelf = B.id('bookshelf');
    out.water = B.id('water');
    out.farmland = B.id('farmland');
    out.wheat = B.id('wheat');
    return out;
  }

  // Gebäudetypen: Grundfläche und Zeichenfunktion
  var TYPES = {
    haus_klein: { w: 5, d: 5, weight: 4 },
    haus_gross: { w: 7, d: 6, weight: 3 },
    feld:       { w: 7, d: 7, weight: 3 },
    schmiede:   { w: 6, d: 6, weight: 2 },
    bibliothek: { w: 6, d: 6, weight: 2 }
  };
  var TYPE_BAG = [];
  Object.keys(TYPES).forEach(function (k) {
    for (var i = 0; i < TYPES[k].weight; i++) TYPE_BAG.push(k);
  });

  // ============================================================
  //  Layout
  // ============================================================
  function layout(gen, rx, rz) {
    var rnd = U.rng(U.hashString('dorf:' + gen.seed + ':' + rx + ':' + rz));
    if (rnd() > V.CHANCE) return null;

    var span = V.SPACING;
    var cx = rx * span + 60 + Math.floor(rnd() * (span - 120));
    var cz = rz * span + 60 + Math.floor(rnd() * (span - 120));

    var BM = MC.WorldGen.BIOME;
    var info = gen.columnInfo(cx, cz);
    if (info.biome === BM.OCEAN || info.biome === BM.BEACH ||
        info.biome === BM.SWAMP || info.biome === BM.MOUNTAINS) return null;

    var y = Math.floor(info.h);
    if (y <= gen.sea + 1 || y > WH - 12) return null;

    // Nur halbwegs ebenes Gelände bebauen, sonst steht das Dorf auf Stelzen
    var lo = y, hi = y;
    for (var s = 0; s < 20; s++) {
      var a = (s / 20) * Math.PI * 2, r = 10 + (s % 4) * 7;
      var hh = Math.floor(gen.heightAt(cx + Math.round(Math.cos(a) * r), cz + Math.round(Math.sin(a) * r)));
      if (hh < lo) lo = hh;
      if (hh > hi) hi = hh;
    }
    if (hi - lo > 7) return null;

    var mat = resolve(matsFor(info.biome));
    var builds = [{ type: 'brunnen', x: cx - 1, z: cz - 1, w: 4, d: 4, face: 0 }];

    for (var i = -GRID; i <= GRID; i++) {
      for (var j = -GRID; j <= GRID; j++) {
        if (i === 0 || j === 0) continue;              // Wegkreuz bleibt frei
        if (rnd() > 0.62) continue;
        var t = TYPE_BAG[(rnd() * TYPE_BAG.length) | 0];
        var spec = TYPES[t];
        var ccx = cx + i * CELL, ccz = cz + j * CELL;
        var jx = (rnd() * 3 | 0) - 1, jz = (rnd() * 3 | 0) - 1;
        // Tür zeigt zur näheren Wegachse
        var face;
        if (Math.abs(i) < Math.abs(j)) face = j < 0 ? 2 : 0;
        else if (Math.abs(j) < Math.abs(i)) face = i < 0 ? 1 : 3;
        else face = rnd() < 0.5 ? (j < 0 ? 2 : 0) : (i < 0 ? 1 : 3);
        builds.push({
          type: t, w: spec.w, d: spec.d, face: face,
          x: ccx - (spec.w >> 1) + jx, z: ccz - (spec.d >> 1) + jz
        });
      }
    }

    // Laternen entlang der Wege
    for (var k = -GRID; k <= GRID; k++) {
      if (k === 0) continue;
      builds.push({ type: 'lampe', x: cx + k * CELL + 3, z: cz + 2, w: 1, d: 1, face: 0 });
      builds.push({ type: 'lampe', x: cx + 2, z: cz + k * CELL + 3, w: 1, d: 1, face: 0 });
    }

    // Das Dorf steht auf einem eingeebneten Plateau. Der äußere Ring wird zum
    // Gelände hin ausgeschliffen, sonst sitzt der Ort in einer Grube.
    var core = GRID * CELL + 4;
    var reach = GRID * CELL + 9;
    var v = {
      id: rx + ':' + rz, x: cx, z: cz, y: y, biome: info.biome, mat: mat, builds: builds,
      core: core, reach: reach,
      minX: cx - reach, maxX: cx + reach, minZ: cz - reach, maxZ: cz + reach
    };
    v.mw = v.maxX - v.minX + 1;
    v.mh = v.maxZ - v.minZ + 1;
    v.roadX = [cx - 1, cx + 1];
    v.roadZ = [cz - 1, cz + 1];

    // built = Häuser und Wege (dort kommt kein Bewuchs hin)
    v.built = new Uint8Array(v.mw * v.mh);
    function mark(x0, z0, x1, z1) {
      for (var mz = Math.max(z0, v.minZ); mz <= Math.min(z1, v.maxZ); mz++)
        for (var mx = Math.max(x0, v.minX); mx <= Math.min(x1, v.maxX); mx++)
          v.built[(mz - v.minZ) * v.mw + (mx - v.minX)] = 1;
    }
    builds.forEach(function (b) { mark(b.x - 1, b.z - 1, b.x + b.w, b.z + b.d); });
    mark(cx - 1, cz - core, cx + 1, cz + core);      // Weg in Z
    mark(cx - core, cz - 1, cx + core, cz + 1);      // Weg in X
    return v;
  }

  // Zielhöhe einer Spalte: innen glatt, außen zum Gelände hin verlaufend
  function levelAt(gen, v, wx, wz) {
    var d = Math.max(Math.abs(wx - v.x), Math.abs(wz - v.z));
    if (d > v.reach) return null;
    if (d <= v.core) return v.y;
    var t = (v.reach - d) / (v.reach - v.core);
    t = t * t * (3 - 2 * t);
    return Math.round(gen.columnInfo(wx, wz).h + (v.y - gen.columnInfo(wx, wz).h) * t);
  }

  // ============================================================
  //  Nachschlagen
  // ============================================================
  V.at = function (gen, rx, rz) {
    if (!gen._vil) gen._vil = {};
    var k = rx + ',' + rz;
    if (k in gen._vil) return gen._vil[k];
    var v = null;
    try { v = layout(gen, rx, rz); } catch (e) { v = null; }
    gen._vil[k] = v;
    return v;
  };

  // Alle Dörfer, die in die Nähe dieser Weltposition reichen (oder null)
  V.near = function (gen, wx, wz) {
    var rx = Math.floor(wx / V.SPACING), rz = Math.floor(wz / V.SPACING);
    var list = null;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        var v = V.at(gen, rx + dx, rz + dz);
        if (!v) continue;
        if (wx < v.minX - 24 || wx > v.maxX + 24 || wz < v.minZ - 24 || wz > v.maxZ + 24) continue;
        (list || (list = [])).push(v);
      }
    }
    return list;
  };

  // Nächstes Dorf innerhalb von maxDist um (wx,wz) – für das Spawnen der Bewohner
  V.nearest = function (gen, wx, wz, maxDist) {
    var rx = Math.floor(wx / V.SPACING), rz = Math.floor(wz / V.SPACING);
    var best = null, bestD = maxDist * maxDist;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        var v = V.at(gen, rx + dx, rz + dz);
        if (!v) continue;
        var ddx = v.x - wx, ddz = v.z - wz;
        var d2 = ddx * ddx + ddz * ddz;
        if (d2 < bestD) { bestD = d2; best = v; }
      }
    }
    return best;
  };

  // Das ganze Plateau ist tabu für die normale Dekoration – Bäume und Blumen
  // würden sonst auf der alten Geländehöhe stehenbleiben und schweben.
  V.occupies = function (list, wx, wz) {
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (Math.max(Math.abs(wx - v.x), Math.abs(wz - v.z)) <= v.reach) return true;
    }
    return false;
  };

  function isBuilt(v, wx, wz) {
    if (wx < v.minX || wx > v.maxX || wz < v.minZ || wz > v.maxZ) return false;
    return !!v.built[(wz - v.minZ) * v.mw + (wx - v.minX)];
  }

  // ============================================================
  //  Bauen
  // ============================================================
  V.generate = function (gen, cx, cz, blocks, meta) {
    var list = V.near(gen, cx * CS + 8, cz * CS + 8);
    if (!list) return;
    var wx0 = cx * CS, wz0 = cz * CS;

    function set(wx, wy, wz, id, m) {
      var lx = wx - wx0, lz = wz - wz0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 0 || wy >= WH) return;
      var i = lx | (lz << 4) | (wy << 8);
      blocks[i] = id;
      meta[i] = m || 0;
    }

    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.maxX < wx0 || v.minX > wx0 + CS - 1 || v.maxZ < wz0 || v.minZ > wz0 + CS - 1) continue;
      plateau(gen, v, set, wx0, wz0);
      roads(gen, v, set, wx0, wz0);
      for (var b = 0; b < v.builds.length; b++) {
        var bd = v.builds[b];
        if (bd.x + bd.w < wx0 - 1 || bd.x > wx0 + CS || bd.z + bd.d < wz0 - 1 || bd.z > wz0 + CS) continue;
        draw(gen, v, bd, set);
      }
    }
  };

  // Plateau einebnen, Rand ausschleifen und etwas Gras stehen lassen
  function plateau(gen, v, set, wx0, wz0) {
    var BM = MC.WorldGen.BIOME;
    var topId = v.biome === BM.DESERT ? B.id('sand') : B.id('grass');
    var fillId = v.biome === BM.DESERT ? B.id('sand') : B.id('dirt');
    var grassId = B.id('tall_grass');
    var flowers = [B.id('flower_red'), B.id('flower_yellow'), B.id('flower_blue')];
    var x0 = Math.max(v.minX, wx0), x1 = Math.min(v.maxX, wx0 + CS - 1);
    var z0 = Math.max(v.minZ, wz0), z1 = Math.min(v.maxZ, wz0 + CS - 1);
    for (var z = z0; z <= z1; z++) {
      for (var x = x0; x <= x1; x++) {
        var ty = levelAt(gen, v, x, z);
        if (ty === null) continue;
        var th = Math.floor(gen.columnInfo(x, z).h);
        for (var ay = ty + 1; ay <= Math.max(ty + 9, th + 3); ay++) set(x, ay, z, 0, 0);
        set(x, ty, z, topId, 0);
        for (var fy = ty - 1; fy > th && fy > 1; fy--) set(x, fy, z, fillId, 0);
        if (isBuilt(v, x, z)) continue;
        var r = U.hash3(x, 3131, z);
        if (r < 0.02) set(x, ty + 1, z, flowers[(U.hash3(x, 55, z) * 3) | 0], 0);
        else if (r < 0.28) set(x, ty + 1, z, grassId, 0);
      }
    }
  }

  // Baugrund: Fläche freiräumen und auf Dorfhöhe legen.
  // groundId === null heißt: Boden so lassen, wie das Plateau ihn gelegt hat.
  function flatten(gen, v, x0, z0, w, d, set, groundId, clearHeight) {
    for (var z = z0; z < z0 + d; z++) {
      for (var x = x0; x < x0 + w; x++) {
        if (groundId !== null) set(x, v.y, z, groundId, 0);
        var th = Math.floor(gen.columnInfo(x, z).h);
        for (var yy = v.y - 1; yy > th && yy > 1; yy--) set(x, yy, z, v.mat.dirt, 0);
        var top = Math.max(v.y + clearHeight, th + 2);
        for (var ay = v.y + 1; ay <= top; ay++) set(x, ay, z, 0, 0);
      }
    }
  }

  // Nur die Wegfelder zeichnen, die wirklich in diesem Chunk liegen – sonst
  // kostet jedes Dorf pro Nachbarchunk hunderte Höhenabfragen für nichts.
  function roads(gen, v, set, wx0, wz0) {
    var m = v.mat;
    var x, z;
    var cx0 = wx0, cx1 = wx0 + CS - 1, cz0 = wz0, cz1 = wz0 + CS - 1;
    // Weg in Z-Richtung
    var ax0 = Math.max(v.roadX[0], cx0), ax1 = Math.min(v.roadX[1], cx1);
    var az0 = Math.max(v.z - v.core, cz0), az1 = Math.min(v.z + v.core, cz1);
    for (z = az0; z <= az1; z++) for (x = ax0; x <= ax1; x++) laneCell(v, set, x, z, m.path);
    // Weg in X-Richtung
    var bx0 = Math.max(v.x - v.core, cx0), bx1 = Math.min(v.x + v.core, cx1);
    var bz0 = Math.max(v.roadZ[0], cz0), bz1 = Math.min(v.roadZ[1], cz1);
    for (x = bx0; x <= bx1; x++) for (z = bz0; z <= bz1; z++) laneCell(v, set, x, z, m.path);
  }

  // Das Plateau liegt schon auf v.y – hier nur noch den Belag legen
  function laneCell(v, set, x, z, pathId) {
    set(x, v.y, z, pathId, 0);
    set(x, v.y + 1, z, 0, 0);
  }

  var SIDE = B.SIDE_DIRS;   // 0=-Z 1=+X 2=+Z 3=-X

  function draw(gen, v, b, set) {
    switch (b.type) {
      case 'brunnen': return well(gen, v, b, set);
      case 'lampe': return lamp(gen, v, b, set);
      case 'feld': return farm(gen, v, b, set);
      default: return house(gen, v, b, set);
    }
  }

  // ---------- Brunnen ----------
  function well(gen, v, b, set) {
    var m = v.mat;
    flatten(gen, v, b.x - 1, b.z - 1, b.w + 2, b.d + 2, set, null, 6);
    var x, z;
    for (z = b.z; z < b.z + 4; z++) {
      for (x = b.x; x < b.x + 4; x++) {
        var rand = (x === b.x || x === b.x + 3 || z === b.z || z === b.z + 3);
        set(x, v.y, z, m.cobble, 0);
        set(x, v.y + 1, z, rand ? m.cobble : m.water, 0);
        if (!rand) set(x, v.y, z, m.cobble, 0);
      }
    }
    // Ecksäulen und Dach
    var corners = [[b.x, b.z], [b.x + 3, b.z], [b.x, b.z + 3], [b.x + 3, b.z + 3]];
    for (var c = 0; c < corners.length; c++) {
      set(corners[c][0], v.y + 2, corners[c][1], m.fence, 0);
      set(corners[c][0], v.y + 3, corners[c][1], m.fence, 0);
    }
    for (z = b.z; z < b.z + 4; z++)
      for (x = b.x; x < b.x + 4; x++) set(x, v.y + 4, z, m.cobble, 0);
  }

  // ---------- Laterne ----------
  function lamp(gen, v, b, set) {
    var m = v.mat;
    flatten(gen, v, b.x, b.z, 1, 1, set, null, 5);
    set(b.x, v.y + 1, b.z, m.fence, 0);
    set(b.x, v.y + 2, b.z, m.fence, 0);
    set(b.x, v.y + 3, b.z, m.fence, 0);
    set(b.x, v.y + 4, b.z, m.torch, 0);
  }

  // ---------- Feld ----------
  function farm(gen, v, b, set) {
    var m = v.mat;
    flatten(gen, v, b.x, b.z, b.w, b.d, set, null, 5);
    var x, z;
    // Zauntor in der Mitte der Seite, die zum Weg zeigt
    var gd = SIDE[b.face];
    var gx = gd[0] === 0 ? b.x + (b.w >> 1) : (gd[0] > 0 ? b.x + b.w - 1 : b.x);
    var gz = gd[1] === 0 ? b.z + (b.d >> 1) : (gd[1] > 0 ? b.z + b.d - 1 : b.z);
    for (z = b.z; z < b.z + b.d; z++) {
      for (x = b.x; x < b.x + b.w; x++) {
        var edge = (x === b.x || x === b.x + b.w - 1 || z === b.z || z === b.z + b.d - 1);
        if (edge) {
          set(x, v.y, z, m.dirt, 0);
          if (x === gx && z === gz) set(x, v.y + 1, z, m.gate, b.face);
          else set(x, v.y + 1, z, m.fence, 0);
          continue;
        }
        // Mittelrinne mit Wasser, links und rechts Ackerboden
        var mid = (z - b.z) === (b.d >> 1);
        if (mid) {
          set(x, v.y, z, m.water, 0);
        } else {
          set(x, v.y, z, m.farmland, 7);
          var grow = U.hash3(x, 909, z);
          set(x, v.y + 1, z, m.wheat, grow < 0.55 ? 7 : (grow * 7) | 0);
        }
      }
    }
  }

  // ---------- Haus ----------
  function house(gen, v, b, set) {
    var m = v.mat;
    var w = b.w, d = b.d, y = v.y;
    var x1 = b.x + w - 1, z1 = b.z + d - 1;
    var wallTop = y + 3;
    flatten(gen, v, b.x - 1, b.z - 1, w + 2, d + 2, set, null, 8);

    var x, z, yy;
    // Boden
    for (z = b.z; z <= z1; z++) for (x = b.x; x <= x1; x++) set(x, y, z, m.floor, 0);

    // Wände mit Ecksäulen
    for (yy = y + 1; yy <= wallTop; yy++) {
      for (z = b.z; z <= z1; z++) {
        for (x = b.x; x <= x1; x++) {
          var onEdge = (x === b.x || x === x1 || z === b.z || z === z1);
          if (!onEdge) { set(x, yy, z, 0, 0); continue; }
          var corner = (x === b.x || x === x1) && (z === b.z || z === z1);
          set(x, yy, z, corner ? m.trim : m.wall, 0);
        }
      }
    }

    // Fenster auf Augenhöhe, jede zweite Wandposition
    for (x = b.x + 1; x < x1; x += 2) {
      set(x, y + 2, b.z, m.glass, 0);
      set(x, y + 2, z1, m.glass, 0);
    }
    for (z = b.z + 1; z < z1; z += 2) {
      set(b.x, y + 2, z, m.glass, 0);
      set(x1, y + 2, z, m.glass, 0);
    }

    // Dach: eine Lage Stufen mit Überstand
    for (z = b.z - 1; z <= z1 + 1; z++)
      for (x = b.x - 1; x <= x1 + 1; x++) set(x, y + 4, z, m.roof, 0);

    // Tür in der Wandmitte
    var dir = SIDE[b.face];
    var dx = dir[0] === 0 ? b.x + (w >> 1) : (dir[0] > 0 ? x1 : b.x);
    var dz = dir[1] === 0 ? b.z + (d >> 1) : (dir[1] > 0 ? z1 : b.z);
    set(dx, y + 1, dz, m.door, (b.face << 1));
    set(dx, y + 2, dz, m.door, (b.face << 1) | 1);
    // Schwelle davor
    set(dx + dir[0], y, dz + dir[1], m.path, 0);

    // Innenlicht: Wandfackel gegenüber der Tür
    var opp = (b.face + 2) & 3, od = SIDE[opp];
    var tx = od[0] === 0 ? b.x + (w >> 1) : (od[0] > 0 ? x1 - 1 : b.x + 1);
    var tz = od[1] === 0 ? b.z + (d >> 1) : (od[1] > 0 ? z1 - 1 : b.z + 1);
    set(tx, y + 3, tz, m.torch, opp + 1);

    // ---- Einrichtung ----
    // Der Flur vor der Tür bleibt frei, sonst kommt man nicht ins Haus.
    var inX0 = b.x + 1, inX1 = x1 - 1, inZ0 = b.z + 1, inZ1 = z1 - 1;
    var sperre = {};
    for (var s = 1; s <= 2; s++) sperre[(dx - dir[0] * s) + ',' + (dz - dir[1] * s)] = true;
    function frei(px, pz) {
      return px >= inX0 && px <= inX1 && pz >= inZ0 && pz <= inZ1 && !sperre[px + ',' + pz];
    }
    // Innenecken in fester Reihenfolge, nur die freien
    var ecken = [[inX0, inZ0], [inX1, inZ0], [inX1, inZ1], [inX0, inZ1]].filter(function (c) {
      return frei(c[0], c[1]);
    });
    function naechsteEcke() { return ecken.shift() || null; }

    if (b.type === 'schmiede') {
      [m.furnace, m.chest, m.bench].forEach(function (id) {
        var c = naechsteEcke();
        if (c) set(c[0], y + 1, c[1], id, 0);
      });
    } else if (b.type === 'bibliothek') {
      // Regale an die Wand gegenüber der Tür, Türfeld ausgespart
      var wall = SIDE[(b.face + 2) & 3];
      for (z = inZ0; z <= inZ1; z++) {
        for (x = inX0; x <= inX1; x++) {
          var anWand = wall[0] !== 0 ? (x === (wall[0] > 0 ? inX1 : inX0))
                                     : (z === (wall[1] > 0 ? inZ1 : inZ0));
          if (!anWand || !frei(x, z)) continue;
          set(x, y + 1, z, m.shelf, 0);
          set(x, y + 2, z, m.shelf, 0);
        }
      }
      // Werkbank in eine Ecke, die kein Regal bekommen hat
      var wandDir = SIDE[(b.face + 2) & 3];
      for (var ei = 0; ei < ecken.length; ei++) {
        var c = ecken[ei];
        var amRegal = wandDir[0] !== 0 ? (c[0] === (wandDir[0] > 0 ? inX1 : inX0))
                                       : (c[1] === (wandDir[1] > 0 ? inZ1 : inZ0));
        if (amRegal) continue;
        set(c[0], y + 1, c[1], m.bench, 0);
        break;
      }
    } else {
      // Bett: Fußende in eine freie Ecke, Kopfteil daneben – beides muss frei sein
      var gelegt = false;
      for (var f = 0; f < 4 && !gelegt; f++) {
        var bedFace = (b.face + 1 + f) & 3, bd = SIDE[bedFace];
        for (var e = 0; e < ecken.length && !gelegt; e++) {
          var bx = ecken[e][0], bz = ecken[e][1];
          var hx = bx + bd[0], hz = bz + bd[1];
          if (!frei(hx, hz)) continue;
          set(bx, y + 1, bz, m.bed, (bedFace << 1));
          set(hx, y + 1, hz, m.bed, (bedFace << 1) | 1);
          sperre[bx + ',' + bz] = true;
          sperre[hx + ',' + hz] = true;
          gelegt = true;
        }
      }
      var rest = [[inX0, inZ0], [inX1, inZ0], [inX1, inZ1], [inX0, inZ1]].filter(function (c) {
        return frei(c[0], c[1]);
      });
      if (rest.length) set(rest[0][0], y + 1, rest[0][1], b.type === 'haus_gross' ? m.chest : m.bench, 0);
    }
  }

  // ============================================================
  //  Truheninhalt
  // ============================================================
  // [Item, Wahrscheinlichkeit, min, max]
  var LOOT = {
    schmiede: [
      ['iron_ingot', 0.85, 1, 4], ['coal', 0.8, 2, 6], ['iron_pickaxe', 0.3, 1, 1],
      ['iron_sword', 0.22, 1, 1], ['iron_helmet', 0.2, 1, 1], ['emerald', 0.35, 1, 2],
      ['apple', 0.4, 1, 3], ['stick', 0.5, 2, 5], ['diamond', 0.06, 1, 1]
    ],
    haus_gross: [
      ['bread', 0.7, 1, 3], ['wheat_item', 0.6, 1, 5], ['seeds', 0.6, 1, 4],
      ['apple', 0.4, 1, 2], ['stick', 0.5, 1, 4], ['wood_hoe', 0.2, 1, 1],
      ['emerald', 0.15, 1, 1], ['bowl', 0.25, 1, 2]
    ],
    haus_klein: [
      ['bread', 0.6, 1, 2], ['seeds', 0.5, 1, 3], ['stick', 0.5, 1, 3],
      ['apple', 0.3, 1, 2], ['coal', 0.3, 1, 3], ['emerald', 0.1, 1, 1]
    ],
    bibliothek: [
      ['book', 0.7, 1, 3], ['paper', 0.8, 2, 6], ['emerald', 0.2, 1, 2],
      ['bookshelf', 0.25, 1, 2], ['glowstone_dust', 0.15, 1, 2]
    ]
  };

  // Inhalt einer Dorftruhe. Rein aus Dorf-Id und Position gewürfelt – die Truhe
  // bekommt also immer denselben Inhalt, egal wann sie zuerst geöffnet wird.
  V.chestLoot = function (gen, wx, wy, wz) {
    var list = V.near(gen, wx, wz);
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      for (var b = 0; b < v.builds.length; b++) {
        var bd = v.builds[b];
        if (wx < bd.x || wx >= bd.x + bd.w || wz < bd.z || wz >= bd.z + bd.d) continue;
        var table = LOOT[bd.type];
        if (!table) return null;
        return roll(table, U.rng(U.hashString('truhe:' + v.id + ':' + wx + ':' + wy + ':' + wz)));
      }
    }
    return null;
  };

  function roll(table, rnd) {
    var items = new Array(27);
    var frei = [];
    for (var s = 0; s < 27; s++) frei.push(s);
    var n = 0;
    for (var i = 0; i < table.length; i++) {
      var e = table[i];
      if (rnd() > e[1]) continue;
      if (!MC.Items.get(e[0])) continue;
      var count = e[2] + ((rnd() * (e[3] - e[2] + 1)) | 0);
      if (count <= 0) continue;
      var k = (rnd() * frei.length) | 0;
      var slot = frei.splice(k, 1)[0];
      items[slot] = MC.Items.newStack(e[0], count);
      n++;
    }
    return n ? items : null;
  }

  // ============================================================
  //  Berufe und Handelsangebote
  // ============================================================
  // give: Liste von [item, anzahl] (max. 2), get: [item, anzahl]
  V.PROFESSIONS = [
    { key: 'bauer', title: 'Bauer', robe: 'mob_villager_bauer', trades: [
      { give: [['wheat_item', 18]], get: ['emerald', 1], max: 16 },
      { give: [['pumpkin', 5]], get: ['emerald', 1], max: 10 },
      { give: [['seeds', 32]], get: ['emerald', 1], max: 10 },
      { give: [['emerald', 1]], get: ['bread', 5], max: 16 },
      { give: [['emerald', 1]], get: ['apple', 4], max: 12 },
      { give: [['emerald', 3]], get: ['golden_apple', 1], max: 3 }
    ] },
    { key: 'bibliothekar', title: 'Bibliothekar', robe: 'mob_villager_bibliothekar', trades: [
      { give: [['paper', 24]], get: ['emerald', 1], max: 12 },
      { give: [['book', 4]], get: ['emerald', 1], max: 10 },
      { give: [['emerald', 1]], get: ['glass', 4], max: 12 },
      { give: [['emerald', 3]], get: ['bookshelf', 1], max: 8 },
      { give: [['emerald', 5]], get: ['glowstone', 1], max: 4 }
    ] },
    { key: 'schmied', title: 'Schmied', robe: 'mob_villager_schmied', trades: [
      { give: [['coal', 16]], get: ['emerald', 1], max: 14 },
      { give: [['iron_ingot', 4]], get: ['emerald', 1], max: 12 },
      { give: [['emerald', 5]], get: ['iron_pickaxe', 1], max: 4 },
      { give: [['emerald', 6]], get: ['iron_chestplate', 1], max: 3 },
      { give: [['emerald', 4]], get: ['iron_sword', 1], max: 4 },
      { give: [['emerald', 16], ['iron_ingot', 4]], get: ['diamond_pickaxe', 1], max: 1 }
    ] },
    { key: 'metzger', title: 'Metzger', robe: 'mob_villager_metzger', trades: [
      { give: [['porkchop_raw', 12]], get: ['emerald', 1], max: 12 },
      { give: [['chicken_raw', 12]], get: ['emerald', 1], max: 12 },
      { give: [['beef_raw', 12]], get: ['emerald', 1], max: 12 },
      { give: [['emerald', 1]], get: ['porkchop_cooked', 3], max: 14 },
      { give: [['emerald', 1]], get: ['beef_cooked', 3], max: 14 }
    ] },
    { key: 'steinmetz', title: 'Steinmetz', robe: 'mob_villager_steinmetz', trades: [
      { give: [['clay_ball', 12]], get: ['emerald', 1], max: 12 },
      { give: [['cobblestone', 40]], get: ['emerald', 1], max: 12 },
      { give: [['emerald', 1]], get: ['stone_bricks', 6], max: 14 },
      { give: [['emerald', 1]], get: ['brick_block', 4], max: 14 },
      { give: [['emerald', 2]], get: ['obsidian', 1], max: 5 }
    ] }
  ];

  // Beruf und Angebotsauswahl hängen nur an Dorf-Id und Platznummer. Ein Bewohner,
  // der nach dem Entladen neu erscheint, hat darum wieder dieselben Angebote.
  V.villagerData = function (villageId, slot) {
    var rnd = U.rng(U.hashString('beruf:' + villageId + ':' + slot));
    var prof = V.PROFESSIONS[(rnd() * V.PROFESSIONS.length) | 0];
    var pool = prof.trades.slice();
    var n = 3 + ((rnd() * 2) | 0);
    var offers = [];
    for (var i = 0; i < n && pool.length; i++) {
      var k = (rnd() * pool.length) | 0;
      var t = pool.splice(k, 1)[0];
      offers.push({ give: t.give, get: t.get, uses: 0, max: t.max });
    }
    return { profession: prof.key, title: prof.title, robe: prof.robe, offers: offers };
  };

  // Ein zufälliger, freier Standort im Dorf – dort erscheinen die Bewohner
  // Das Haus, das zu einer Platznummer gehört: Türfeld, Blickrichtung nach
  // draußen, ein Punkt drinnen und einer davor.
  V.homeFor = function (v, index) {
    var houses = v.builds.filter(function (b) {
      return b.type !== 'lampe' && b.type !== 'brunnen' && b.type !== 'feld';
    });
    if (!houses.length) return null;
    var b = houses[index % houses.length];
    var dir = SIDE[b.face];
    var dx = dir[0] === 0 ? b.x + (b.w >> 1) : (dir[0] > 0 ? b.x + b.w - 1 : b.x);
    var dz = dir[1] === 0 ? b.z + (b.d >> 1) : (dir[1] > 0 ? b.z + b.d - 1 : b.z);
    return {
      y: v.y + 1,
      doorX: dx, doorZ: dz, dir: dir,
      // Raummitte als Ziel und das Innenrechteck zum Prüfen, ob jemand drin ist
      inX: b.x + b.w / 2, inZ: b.z + b.d / 2,
      x0: b.x + 1, x1: b.x + b.w - 1, z0: b.z + 1, z1: b.z + b.d - 1,
      outX: dx + dir[0] * 2 + 0.5,
      outZ: dz + dir[1] * 2 + 0.5
    };
  };

  V.spawnSpot = function (v, index) {
    var h = V.homeFor(v, index);
    if (!h) return { x: v.x + 0.5, y: v.y + 1.05, z: v.z + 3.5 };
    return { x: h.outX, y: v.y + 1.05, z: h.outZ };
  };

})();
