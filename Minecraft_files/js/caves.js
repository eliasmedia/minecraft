/* ============================================================
   caves.js  -  Was in den Höhlen steht: Monsterräume und verlassene Minen

   Unsere Höhlen waren groß und komplett leer – außer Erz gab es keinen Grund
   hinabzusteigen. Beides hier ist rein aus Seed und Position berechnet, damit
   ein Chunk auch dann richtig entsteht, wenn seine Nachbarn nie geladen wurden.
   ============================================================ */
(function () {
  'use strict';

  var C = {};
  MC.Caves = C;

  var B = MC.Blocks, U = MC.U;
  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT;

  // ============================================================
  //  Truheninhalt
  // ============================================================
  // [Item, Wahrscheinlichkeit, min, max]
  var LOOT_DUNGEON = [
    ['bread', 0.7, 1, 3], ['iron_ingot', 0.55, 1, 4], ['gold_ingot', 0.3, 1, 3],
    ['redstone', 0.4, 2, 6], ['coal', 0.5, 2, 6], ['bone', 0.5, 1, 4],
    ['gunpowder', 0.3, 1, 3], ['string', 0.35, 1, 4], ['bucket', 0.15, 1, 1],
    ['golden_apple', 0.1, 1, 1], ['diamond', 0.08, 1, 1],
    ['enchanted_book', 0.32, 1, 1]
  ];
  var LOOT_MINE = [
    ['coal', 0.6, 2, 8], ['iron_ingot', 0.4, 1, 3], ['bread', 0.4, 1, 2],
    ['torch', 0.5, 2, 6], ['stick', 0.5, 2, 6], ['gold_ingot', 0.15, 1, 2],
    ['lapis', 0.2, 1, 3], ['redstone', 0.25, 1, 4], ['diamond', 0.04, 1, 1],
    ['enchanted_book', 0.12, 1, 1]
  ];

  function wuerfeln(tabelle, rnd) {
    var items = new Array(27);
    var frei = [];
    for (var s = 0; s < 27; s++) frei.push(s);
    var n = 0;
    for (var i = 0; i < tabelle.length; i++) {
      var e = tabelle[i];
      if (rnd() > e[1]) continue;
      if (!MC.Items.get(e[0])) continue;
      var count = e[2] + ((rnd() * (e[3] - e[2] + 1)) | 0);
      if (count <= 0) continue;
      var k = (rnd() * frei.length) | 0;
      var slot = frei.splice(k, 1)[0];
      var stack = MC.Items.newStack(e[0], count);
      // Ein Buch ohne Verzauberung wäre ein leeres Versprechen
      if (e[0] === 'enchanted_book' && MC.Ench) {
        stack.count = 1;
        stack.ench = MC.Ench.wuerfeln('enchanted_book', 6 + ((rnd() * 24) | 0), rnd);
        if (!Object.keys(stack.ench).length) stack.ench = { unbreaking: 1 };
      }
      items[slot] = stack;
      n++;
    }
    return n ? items : null;
  }

  // ============================================================
  //  Monsterräume
  // ============================================================
  // Höchstens einer je Chunk, und nur dort, wo der Raum eine Höhle anschneidet –
  // ein Verlies, das man nur durch Zufall angräbt, ist keins.
  var RAUM_CHANCE = 0.055;
  var MOBS = ['zombie', 'skeleton'];

  C.raumAt = function (gen, cx, cz) {
    var rnd = U.rng(U.hashString('verlies:' + gen.seed + ':' + cx + ':' + cz));
    if (rnd() > RAUM_CHANCE) return null;
    var w = 7, d = 7, h = 4;
    var x = cx * CS + 2 + ((rnd() * (CS - w - 3)) | 0);
    var z = cz * CS + 2 + ((rnd() * (CS - d - 3)) | 0);
    var y = 9 + ((rnd() * 36) | 0);
    var mob = MOBS[(rnd() * MOBS.length) | 0];
    return { x: x, y: y, z: z, w: w, d: d, h: h, mob: mob,
             truhen: 1 + ((rnd() < 0.45) ? 1 : 0), saat: (rnd() * 4294967295) >>> 0 };
  };

  // Der Raum wird in alle Chunks gezeichnet, die er berührt.
  function zeichneRaum(gen, r, set, hole, wx0, wz0) {
    var cobble = B.id('cobblestone'), moos = B.id('mossy_cobblestone');
    var luft = 0, truhe = B.id('chest'), spawner = B.id('spawner');
    var rnd = U.rng(r.saat);

    // Erst prüfen, ob der Raum überhaupt an eine Höhle stößt. Sonst liegt das
    // Verlies unerreichbar im Fels und ist reine Verschwendung.
    // Geprüft wird an der Hülle, nicht im Inneren – innen ist per Bau alles Fels.
    var offen = 0, geprueft = 0;
    for (var pz = -1; pz <= r.d; pz++) {
      for (var px = -1; px <= r.w; px++) {
        if (px > -1 && px < r.w && pz > -1 && pz < r.d) continue;
        for (var py = 0; py < r.h; py++) {
          geprueft++;
          if (hole(r.x + px, r.y + py, r.z + pz) === 0) offen++;
        }
      }
    }
    if (geprueft === 0 || offen / geprueft < 0.12) return false;

    for (var z = -1; z <= r.d; z++) {
      for (var x = -1; x <= r.w; x++) {
        var rand = (x === -1 || x === r.w || z === -1 || z === r.d);
        for (var y = -1; y <= r.h; y++) {
          var wx = r.x + x, wy = r.y + y, wz = r.z + z;
          if (wy < 2 || wy >= WH - 1) continue;
          if (rand || y === -1 || y === r.h) {
            // Boden, Decke und Wände: Bruchstein, teils bemoost
            set(wx, wy, wz, U.hash3(wx, wy * 7, wz) < 0.32 ? moos : cobble);
          } else {
            set(wx, wy, wz, luft);
          }
        }
      }
    }
    // Spawner in die Mitte, direkt auf den Boden
    set(r.x + (r.w >> 1), r.y, r.z + (r.d >> 1), spawner);
    // Truhen an die Wand, nie in die Ecke
    var plaetze = [[0, 2], [r.w - 1, r.d - 3], [2, 0], [r.w - 3, r.d - 1]];
    for (var t = 0; t < r.truhen; t++) {
      var pl = plaetze[(rnd() * plaetze.length) | 0];
      set(r.x + pl[0], r.y, r.z + pl[1], truhe);
    }
    return true;
  }

  // ============================================================
  //  Verlassene Minen
  // ============================================================
  // Ein Gangnetz je Minenregion, als Irrfahrt aus geraden Stücken. Erzeugt wird
  // es einmal je Region und gecacht – gezeichnet wird nur, was im Chunk liegt.
  var MINE_REGION = 8;                    // Chunks je Seite
  var MINE_SPAN = MINE_REGION * CS;
  var MINE_CHANCE = 0.5;

  C.mineAt = function (gen, rx, rz) {
    if (!gen._minen) gen._minen = {};
    var k = rx + ',' + rz;
    if (k in gen._minen) return gen._minen[k];
    var m = null;
    try { m = mineLayout(gen, rx, rz); } catch (e) { m = null; }
    gen._minen[k] = m;
    return m;
  };

  function mineLayout(gen, rx, rz) {
    var rnd = U.rng(U.hashString('mine:' + gen.seed + ':' + rx + ':' + rz));
    if (rnd() > MINE_CHANCE) return null;
    var x = rx * MINE_SPAN + 20 + ((rnd() * (MINE_SPAN - 40)) | 0);
    var z = rz * MINE_SPAN + 20 + ((rnd() * (MINE_SPAN - 40)) | 0);
    var y = 14 + ((rnd() * 22) | 0);

    // Irrfahrt: gerade Stücke, gelegentlich eine Abzweigung und eine Stufe
    var gaenge = [];
    var offen = [{ x: x, z: z, y: y, dir: (rnd() * 4) | 0, tiefe: 0 }];
    var minX = x, maxX = x, minZ = z, maxZ = z, minY = y, maxY = y;
    var DIR = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    while (offen.length && gaenge.length < 26) {
      var k = offen.shift();
      var laenge = 8 + ((rnd() * 14) | 0);
      var d = DIR[k.dir];
      var ex = k.x + d[0] * laenge, ez = k.z + d[1] * laenge;
      var ey = k.y + (rnd() < 0.3 ? (rnd() < 0.5 ? 2 : -2) : 0);
      ey = U.clamp(ey, 9, 46);
      gaenge.push({ x0: k.x, z0: k.z, x1: ex, z1: ez, y0: k.y, y1: ey });
      minX = Math.min(minX, k.x, ex); maxX = Math.max(maxX, k.x, ex);
      minZ = Math.min(minZ, k.z, ez); maxZ = Math.max(maxZ, k.z, ez);
      minY = Math.min(minY, k.y, ey); maxY = Math.max(maxY, k.y, ey);
      if (k.tiefe > 3) continue;
      var abzweige = rnd() < 0.55 ? 2 : 1;
      for (var a = 0; a < abzweige; a++) {
        if (rnd() > 0.7) continue;
        var nd = (k.dir + (rnd() < 0.5 ? 1 : 3)) & 3;
        offen.push({ x: ex, z: ez, y: ey, dir: nd, tiefe: k.tiefe + 1 });
      }
      if (rnd() < 0.7) offen.push({ x: ex, z: ez, y: ey, dir: k.dir, tiefe: k.tiefe + 1 });
    }
    return { id: rx + ':' + rz, gaenge: gaenge,
             minX: minX - 3, maxX: maxX + 3, minZ: minZ - 3, maxZ: maxZ + 3,
             minY: minY - 2, maxY: maxY + 4 };
  }

  // Alle Minen, die in diesen Chunk hineinreichen
  function minenNah(gen, wx, wz) {
    var rx = Math.floor(wx / MINE_SPAN), rz = Math.floor(wz / MINE_SPAN);
    var list = null;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        var m = C.mineAt(gen, rx + dx, rz + dz);
        if (!m) continue;
        if (wx < m.minX - CS || wx > m.maxX + CS || wz < m.minZ - CS || wz > m.maxZ + CS) continue;
        (list || (list = [])).push(m);
      }
    }
    return list;
  }

  // Ein Gang: drei breit, drei hoch, mit Stützgerüst und Streugut
  function zeichneGang(g, set, hole, wx0, wz0, seed) {
    var planke = B.id('planks_oak'), zaun = B.id('fence_oak');
    var fackel = B.id('torch'), webe = B.id('cobweb'), truhe = B.id('chest');
    var schiene = B.id('gravel');
    var dx = Math.sign(g.x1 - g.x0), dz = Math.sign(g.z1 - g.z0);
    var laenge = Math.max(Math.abs(g.x1 - g.x0), Math.abs(g.z1 - g.z0));
    if (laenge === 0) return;
    // quer zur Laufrichtung
    var qx = dz, qz = dx;

    for (var s = 0; s <= laenge; s++) {
      var wx = g.x0 + dx * s, wz = g.z0 + dz * s;
      var wy = Math.round(g.y0 + (g.y1 - g.y0) * (s / laenge));
      // Wird dieser Schnitt in diesem Chunk überhaupt gebraucht?
      if (wx + 2 < wx0 || wx - 2 > wx0 + CS || wz + 2 < wz0 || wz - 2 > wz0 + CS) continue;
      var r = U.rng(U.hashString(seed + ':' + wx + ':' + wz));

      for (var q = -1; q <= 1; q++) {
        var bx = wx + qx * q, bz = wz + qz * q;
        // Boden schließen, damit der Gang nicht ins Nichts hängt
        if (hole(bx, wy - 1, bz) === 0) set(bx, wy - 1, bz, planke);
        for (var h = 0; h < 3; h++) set(bx, wy + h, bz, 0);
      }
      // Stützgerüst alle vier bis fünf Schritte
      if (s % 5 === 0 && s > 0 && s < laenge) {
        for (var p = -1; p <= 1; p += 2) {
          set(wx + qx * p, wy, wz + qz * p, zaun);
          set(wx + qx * p, wy + 1, wz + qz * p, zaun);
        }
        for (var b = -1; b <= 1; b++) set(wx + qx * b, wy + 2, wz + qz * b, planke);
        if (r() < 0.28) set(wx, wy + 1, wz, fackel);
      } else {
        if (r() < 0.05) set(wx, wy + 1, wz, webe);
        if (r() < 0.03) set(wx + qx, wy, wz + qz, truhe);
        if (r() < 0.12) set(wx, wy - 1, wz, schiene);
      }
    }
  }

  // ============================================================
  //  Schiffswracks und Unterwassertempel
  // ============================================================
  var WRACK_REGION = 10, WRACK_SPAN = WRACK_REGION * CS, WRACK_CHANCE = 0.55;
  var TEMPEL_REGION = 40, TEMPEL_SPAN = TEMPEL_REGION * CS, TEMPEL_CHANCE = 0.7;

  var LOOT_WRACK = [
    ['iron_ingot', 0.5, 1, 4], ['gold_ingot', 0.3, 1, 3], ['bread', 0.5, 1, 3],
    ['paper', 0.5, 2, 6], ['wheat_item', 0.4, 2, 6], ['coal', 0.4, 2, 6],
    ['emerald', 0.2, 1, 2], ['diamond', 0.06, 1, 1], ['map', 0.25, 1, 1],
    ['enchanted_book', 0.18, 1, 1]
  ];
  var LOOT_TEMPEL = [
    ['prismarine_shard', 0.9, 4, 12], ['prismarine_crystals', 0.7, 2, 6],
    ['gold_ingot', 0.5, 2, 6], ['diamond', 0.25, 1, 2], ['emerald', 0.4, 1, 4],
    ['sponge', 0.4, 1, 3], ['golden_apple', 0.2, 1, 1], ['enchanted_book', 0.4, 1, 1]
  ];

  // Ein Wrack liegt auf dem Meeresgrund, gekippt und halb im Sand
  C.wrackAt = function (gen, rx, rz) {
    if (gen.genV < 5) return null;
    if (!gen._wracks) gen._wracks = {};
    var k = rx + ',' + rz;
    if (k in gen._wracks) return gen._wracks[k];
    var w = null;
    var rnd = U.rng(U.hashString('wrack:' + gen.seed + ':' + rx + ':' + rz));
    if (rnd() <= WRACK_CHANCE) {
      var x = rx * WRACK_SPAN + 20 + ((rnd() * (WRACK_SPAN - 40)) | 0);
      var z = rz * WRACK_SPAN + 20 + ((rnd() * (WRACK_SPAN - 40)) | 0);
      var h = Math.floor(gen.heightAt(x, z));
      // Nur im Wasser, und nur wo genug Tiefe ist
      if (h < gen.sea - 3) {
        w = { x: x, z: z, y: h + 1, laenge: 9 + ((rnd() * 8) | 0),
              breite: 4 + ((rnd() * 2) | 0), quer: rnd() < 0.5, saat: (rnd() * 4294967295) >>> 0 };
        w.minX = x - 12; w.maxX = x + 12; w.minZ = z - 12; w.maxZ = z + 12;
      }
    }
    gen._wracks[k] = w;
    return w;
  };

  C.tempelAt = function (gen, rx, rz) {
    if (gen.genV < 5) return null;
    if (!gen._tempel) gen._tempel = {};
    var k = rx + ',' + rz;
    if (k in gen._tempel) return gen._tempel[k];
    var t = null;
    var rnd = U.rng(U.hashString('tempel:' + gen.seed + ':' + rx + ':' + rz));
    if (rnd() <= TEMPEL_CHANCE) {
      var x = rx * TEMPEL_SPAN + 60 + ((rnd() * (TEMPEL_SPAN - 120)) | 0);
      var z = rz * TEMPEL_SPAN + 60 + ((rnd() * (TEMPEL_SPAN - 120)) | 0);
      // Nur in tiefem, offenem Wasser – ein Tempel im Uferschlick wäre albern
      var tief = true, lo = 999;
      for (var s = 0; s < 9; s++) {
        var hh = Math.floor(gen.heightAt(x + ((s % 3) - 1) * 12, z + (((s / 3) | 0) - 1) * 12));
        if (hh > gen.sea - 6) tief = false;
        if (hh < lo) lo = hh;
      }
      if (tief) {
        t = { x: x, z: z, y: lo + 1, r: 12,
              minX: x - 14, maxX: x + 14, minZ: z - 14, maxZ: z + 14 };
      }
    }
    gen._tempel[k] = t;
    return t;
  };

  function nahAt(gen, wx, wz, span, fn) {
    var rx = Math.floor(wx / span), rz = Math.floor(wz / span);
    var list = null;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        var o = fn(gen, rx + dx, rz + dz);
        if (!o) continue;
        if (wx < o.minX - CS || wx > o.maxX + CS || wz < o.minZ - CS || wz > o.maxZ + CS) continue;
        (list || (list = [])).push(o);
      }
    }
    return list;
  }

  function zeichneWrack(gen, w, set, hole) {
    var planke = B.id('planks_oak'), zaun = B.id('fence_oak'), truhe = B.id('chest');
    var stamm = B.id('log_oak'), leiter = B.id('ladder');
    var rnd = U.rng(w.saat);
    var L = w.laenge, Bb = w.breite;
    // Rumpf: ein Kasten, dessen Boden gerundet ist. Um `quer` gedreht.
    for (var i = 0; i < L; i++) {
      for (var j = -Bb; j <= Bb; j++) {
        var rand = Math.abs(j) === Bb || i === 0 || i === L - 1;
        var tiefe = Math.abs(j) >= Bb - 1 ? 0 : -1;
        for (var k = tiefe; k <= 2; k++) {
          var px = w.quer ? w.x + j : w.x + i - (L >> 1);
          var pz = w.quer ? w.z + i - (L >> 1) : w.z + j;
          var py = w.y + k;
          if (k === tiefe || rand) set(px, py, pz, planke);
          else if (k > tiefe) set(px, py, pz, 0);
        }
      }
    }
    // Mast und Reling
    var mx = w.quer ? w.x : w.x + 1, mz = w.quer ? w.z + 1 : w.z;
    for (var m = 3; m < 8; m++) set(mx, w.y + m, mz, stamm);
    // Truhe im Rumpf
    set(w.x, w.y + 1, w.z, truhe);
    if (rnd() < 0.6) {
      var ox = w.quer ? w.x + 2 : w.x - 2;
      set(ox, w.y + 1, w.z, truhe);
    }
  }

  function zeichneTempel(gen, t, set, hole) {
    var pris = B.id('prismarine'), zieg = B.id('prismarine_bricks');
    var dunkel = B.id('dark_prismarine'), lampe = B.id('sea_lantern');
    var truhe = B.id('chest'), schwamm = B.id('sponge');
    var R = t.r, y = t.y, x, z, k;
    // Grundkörper: ein Stufenbau aus drei Ebenen
    for (var e = 0; e < 3; e++) {
      var r = R - e * 3;
      var hoehe = 5;
      for (x = -r; x <= r; x++) {
        for (z = -r; z <= r; z++) {
          var rand = (Math.abs(x) === r || Math.abs(z) === r);
          for (k = 0; k < hoehe; k++) {
            var py = y + e * 5 + k;
            if (rand || k === 0) {
              // Wandmuster: Ziegel mit dunklen Feldern
              var id = ((x + z + k) % 7 === 0) ? dunkel : (((x * z + k) % 5 === 0) ? pris : zieg);
              set(t.x + x, py, t.z + z, id);
            } else {
              set(t.x + x, py, t.z + z, 0);      // Innenraum leerpumpen
            }
          }
          // Decke der Ebene
          if (!rand) set(t.x + x, y + e * 5 + hoehe, t.z + z, e === 2 ? zieg : 0);
        }
      }
      // Eingänge in jeder Ebene
      for (k = 1; k <= 3; k++) {
        set(t.x - r, y + e * 5 + k, t.z, 0);
        set(t.x + r, y + e * 5 + k, t.z, 0);
        set(t.x, y + e * 5 + k, t.z - r, 0);
        set(t.x, y + e * 5 + k, t.z + r, 0);
      }
      // Seelaternen an den Ecken
      [[-r + 1, -r + 1], [r - 1, -r + 1], [-r + 1, r - 1], [r - 1, r - 1]].forEach(function (p) {
        set(t.x + p[0], y + e * 5 + 3, t.z + p[1], lampe);
      });
    }
    // Schatzkammer ganz oben: acht Schwammblöcke und zwei Truhen
    var oy = y + 11;
    for (k = 0; k < 8; k++) {
      set(t.x - 2 + (k % 4), oy, t.z - 1 + ((k / 4) | 0), schwamm);
    }
    set(t.x - 1, oy + 1, t.z, truhe);
    set(t.x + 1, oy + 1, t.z, truhe);
  }

  // ============================================================
  //  Einhängen in die Chunkerzeugung
  // ============================================================
  C.decorate = function (gen, cx, cz, blocks, meta) {
    var wx0 = cx * CS, wz0 = cz * CS;
    function set(wx, wy, wz, id) {
      var lx = wx - wx0, lz = wz - wz0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 1 || wy >= WH) return;
      var i = lx | (lz << 4) | (wy << 8);
      blocks[i] = id;
      meta[i] = 0;
    }
    // Was steht hier schon? Außerhalb des Chunks wissen wir es nicht – dann
    // antworten wir mit Fels, damit keine Entscheidung daran hängt.
    function hole(wx, wy, wz) {
      var lx = wx - wx0, lz = wz - wz0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 0 || wy >= WH) return B.id('stone');
      return blocks[lx | (lz << 4) | (wy << 8)];
    }

    // Minen zuerst, Verliese danach – ein Verlies gewinnt gegen einen Gang
    var minen = minenNah(gen, wx0 + 8, wz0 + 8);
    if (minen) {
      for (var m = 0; m < minen.length; m++) {
        for (var g = 0; g < minen[m].gaenge.length; g++) {
          zeichneGang(minen[m].gaenge[g], set, hole, wx0, wz0, 'mine:' + minen[m].id);
        }
      }
    }

    // Schiffswracks und Tempel auf dem Meeresgrund
    if (gen.genV >= 5 && gen.dim === 'overworld') {
      var wracks = nahAt(gen, wx0 + 8, wz0 + 8, WRACK_SPAN, C.wrackAt);
      if (wracks) for (var wi = 0; wi < wracks.length; wi++) zeichneWrack(gen, wracks[wi], set, hole);
      var tempel = nahAt(gen, wx0 + 8, wz0 + 8, TEMPEL_SPAN, C.tempelAt);
      if (tempel) for (var ti = 0; ti < tempel.length; ti++) zeichneTempel(gen, tempel[ti], set, hole);
    }

    // Verliese aus diesem und den acht Nachbarchunks, damit ein Raum an der
    // Chunkgrenze nicht in der Mitte aufhört
    for (var dz = -1; dz <= 1; dz++) {
      for (var dx = -1; dx <= 1; dx++) {
        var r = C.raumAt(gen, cx + dx, cz + dz);
        if (!r) continue;
        if (r.x + r.w < wx0 - 1 || r.x > wx0 + CS || r.z + r.d < wz0 - 1 || r.z > wz0 + CS) continue;
        zeichneRaum(gen, r, set, hole, wx0, wz0);
      }
    }
  };

  // ============================================================
  //  Truheninhalt beim Öffnen
  // ============================================================
  // Wie bei den Dorftruhen: der Inhalt wird erst beim ersten Öffnen gewürfelt,
  // hängt aber nur an Position und Seed – er ist also von Anfang an festgelegt.
  C.chestLoot = function (gen, wx, wy, wz) {
    // Liegt die Truhe in einem Verlies?
    var cx = Math.floor(wx / CS), cz = Math.floor(wz / CS);
    for (var dz = -1; dz <= 1; dz++) {
      for (var dx = -1; dx <= 1; dx++) {
        var r = C.raumAt(gen, cx + dx, cz + dz);
        if (!r) continue;
        if (wx < r.x - 1 || wx > r.x + r.w || wz < r.z - 1 || wz > r.z + r.d) continue;
        if (wy < r.y - 1 || wy > r.y + r.h) continue;
        return wuerfeln(LOOT_DUNGEON, U.rng(U.hashString('vtruhe:' + gen.seed + ':' + wx + ':' + wy + ':' + wz)));
      }
    }
    // Schiffswrack?
    var wr = nahAt(gen, wx, wz, WRACK_SPAN, C.wrackAt);
    if (wr) {
      for (var wq = 0; wq < wr.length; wq++) {
        var wv = wr[wq];
        if (Math.abs(wx - wv.x) > 12 || Math.abs(wz - wv.z) > 12) continue;
        if (Math.abs(wy - wv.y) > 4) continue;
        return wuerfeln(LOOT_WRACK, U.rng(U.hashString('wtruhe:' + gen.seed + ':' + wx + ':' + wy + ':' + wz)));
      }
    }
    // Unterwassertempel?
    var tp = nahAt(gen, wx, wz, TEMPEL_SPAN, C.tempelAt);
    if (tp) {
      for (var tq = 0; tq < tp.length; tq++) {
        var tv = tp[tq];
        if (Math.abs(wx - tv.x) > 14 || Math.abs(wz - tv.z) > 14) continue;
        return wuerfeln(LOOT_TEMPEL, U.rng(U.hashString('ttruhe:' + gen.seed + ':' + wx + ':' + wy + ':' + wz)));
      }
    }
    // Oder in einer Mine?
    var minen = minenNah(gen, wx, wz);
    if (minen) {
      for (var m = 0; m < minen.length; m++) {
        var mi = minen[m];
        if (wx < mi.minX || wx > mi.maxX || wz < mi.minZ || wz > mi.maxZ) continue;
        if (wy < mi.minY || wy > mi.maxY) continue;
        return wuerfeln(LOOT_MINE, U.rng(U.hashString('mtruhe:' + gen.seed + ':' + wx + ':' + wy + ':' + wz)));
      }
    }
    return null;
  };

  // ============================================================
  //  Spawner
  // ============================================================
  // Welcher Mob aus einem Spawner kommt, steckt nicht in einem Blockzustand,
  // sondern in seiner Position – so übersteht er jedes Speichern von selbst.
  // meta 1 = Lohenspawner (Bastionen), sonst entscheidet die Position
  C.spawnerMob = function (seed, x, y, z, meta) {
    if (meta === 1) return 'blaze';
    var rnd = U.rng(U.hashString('spawner:' + seed + ':' + x + ':' + y + ':' + z));
    return MOBS[(rnd() * MOBS.length) | 0];
  };

  // Wächter erscheinen nur in der Nähe eines Tempels, damit sie ein Fund bleiben
  C.waechter = function (game, dt) {
    var w = game.world;
    if (w.dim !== 'overworld' || game.mode === 'creative' || w.gen.genV < 5) return;
    C.wTimer = (C.wTimer || 0) + dt;
    if (C.wTimer < 3) return;
    C.wTimer = 0;
    var p = game.player;
    if (!p || p.dead) return;
    var tp = nahAt(w.gen, Math.floor(p.x), Math.floor(p.z), TEMPEL_SPAN, C.tempelAt);
    if (!tp || !tp.length) return;
    var t = tp[0];
    if (Math.abs(p.x - t.x) > 34 || Math.abs(p.z - t.z) > 34) return;
    var n = 0;
    for (var i = 0; i < w.entities.length; i++) {
      if (w.entities[i].mobType === 'guardian' && !w.entities[i].dead) n++;
    }
    if (n >= 6) return;
    for (var k = 0; k < 6; k++) {
      var sx = t.x + ((Math.random() * 30) | 0) - 15;
      var sz = t.z + ((Math.random() * 30) | 0) - 15;
      var sy = t.y + 2 + ((Math.random() * 12) | 0);
      if (w.getBlock(sx, sy, sz) !== B.id('water')) continue;
      var m = new MC.Mob(w, 'guardian', sx + 0.5, sy + 0.2, sz + 0.5);
      if (m.distTo(p) < 8) continue;
      w.entities.push(m);
      return;
    }
  };

  var SPAWNER_R = 8;          // so weit vom Käfig erscheinen sie
  var SPAWNER_TAKT = 2.2;     // Sekunden zwischen zwei Versuchen
  var SPAWNER_MAX = 6;        // mehr als das erzeugt ein Käfig nicht

  C.tick = function (game, dt) {
    var w = game.world;
    // Bastionen haben seit Version 5 eigene Lohenspawner – der Nether gehört
    // deshalb dazu, nicht mehr nur die Oberwelt.
    if ((w.dim !== 'overworld' && w.dim !== 'nether') || game.mode === 'creative') return;
    C.timer = (C.timer || 0) + dt;
    if (C.timer < SPAWNER_TAKT) return;
    C.timer = 0;
    var p = game.player;
    if (!p || p.dead) return;
    var spawnerId = B.id('spawner');
    var px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    // Nur ein Kasten um den Spieler wird abgesucht – ein Käfig weiter weg
    // interessiert niemanden, und der Kasten ist billiger als eine Liste,
    // die beim Laden und Abbauen gepflegt werden müsste.
    for (var dy = -6; dy <= 6; dy++) {
      var y = py + dy;
      if (y < 1 || y >= WH) continue;
      for (var dz = -9; dz <= 9; dz++) {
        for (var dx = -9; dx <= 9; dx++) {
          if (w.getBlock(px + dx, y, pz + dz) !== spawnerId) continue;
          C.speien(game, px + dx, y, pz + dz);
        }
      }
    }
  };

  function speien(game, x, y, z) {
    var w = game.world;
    // Licht bremst ihn, wie im Original – mit Fackeln legt man ihn still
    if (w.getBlockLight(x, y + 1, z) >= 12) return;
    var nah = 0;
    for (var i = 0; i < w.entities.length; i++) {
      var e = w.entities[i];
      if (e.type !== 'mob' || e.dead || !e.hostile) continue;
      if (Math.abs(e.x - x) < 12 && Math.abs(e.z - z) < 12 && Math.abs(e.y - y) < 8) nah++;
    }
    if (nah >= SPAWNER_MAX) return;
    var art = C.spawnerMob(game.seed, x, y, z, w.getMeta(x, y, z));
    for (var t = 0; t < 6; t++) {
      var sx = x + ((Math.random() * (SPAWNER_R * 2 + 1)) | 0) - SPAWNER_R;
      var sz = z + ((Math.random() * (SPAWNER_R * 2 + 1)) | 0) - SPAWNER_R;
      var sy = y + ((Math.random() * 3) | 0) - 1;
      if (w.getBlock(sx, sy, sz) !== 0 || w.getBlock(sx, sy + 1, sz) !== 0) continue;
      var unten = w.getBlock(sx, sy - 1, sz);
      if (unten === 0) continue;
      var ub = B.byId[unten];
      if (!ub || ub.solid === false) continue;
      var mob = new MC.Mob(w, art, sx + 0.5, sy + 0.05, sz + 0.5);
      w.entities.push(mob);
      game.particles.smoke(sx + 0.5, sy + 0.5, sz + 0.5, 2);
      return;
    }
  }
  C.speien = speien;

})();
