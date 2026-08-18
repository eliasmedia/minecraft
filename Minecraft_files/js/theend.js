/* ============================================================
   theend.js  -  Festung, Endportal, Das Ende und der Enderdrache

   Festung: eine einzige, tief vergrabene Ruine je Welt. Im Portalsaal liegt
            der Endportalrahmen — zwölf Blöcke im 5x5-Quadrat ohne Ecken, wie
            im Original. Gefunden wird sie nicht mit Enderaugen, sondern über
            den Kompass im HUD des Gravitithelms.
   Geöffnet: zwölf Enderaugen, eines je Rahmenblock. Ein Auge entsteht aus
            Lohenstaub (Lohe an einer Netherbastion) und einer Enderperle
            (Enderman) – derselbe Weg wie im Original.
   Das Ende: eine Insel aus Endstein in der Leere, zehn Obsidiantürme mit
            Enderkristallen, in der Mitte das erloschene Ausgangsportal. Wer
            den Drachen besiegt, zündet es und sieht den Abspann.
   ============================================================ */
(function () {
  'use strict';

  var B = MC.Blocks, I = MC.Items, U = MC.U, D = MC.Dim;
  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT;

  // ---- Dimension anmelden ----
  D.LIST.push('the_end');
  D.TITLE.the_end = 'Das Ende';
  D.SCALE.the_end = 1;

  // ============================================================
  //  Festung mit dem Endportal (Oberwelt, genau einmal je Welt)
  // ============================================================
  var S = {};
  MC.Stronghold = S;

  // Abmessungen relativ zum Portalsaal-Mittelpunkt
  var HALL = 6;          // halbe Innenbreite des Portalsaals
  var HALL_H = 6;        // lichte Höhe
  var LIB_X0 = -21, LIB_X1 = -14, LIB_Z = 4;   // Bibliothek westlich
  var SHAFT_X = 5, SHAFT_Z = -5;               // Leiterschacht nach oben
  var BOX = { minX: LIB_X0 - 2, maxX: HALL + 2, minZ: -HALL - 2, maxZ: HALL + 2 };

  // Lage der Festung: eindeutig aus dem Seed, ein paar hundert Blöcke vom
  // Ursprung entfernt und so tief, dass man sie nur mit dem Kompass findet.
  S.locate = function (gen) {
    if (gen._stronghold) return gen._stronghold;
    var rnd = U.rng(U.hashString('festung:' + gen.seed + ':ende'));
    var ang = rnd() * Math.PI * 2;
    var dist = 380 + rnd() * 520;
    var x = Math.round(Math.cos(ang) * dist);
    var z = Math.round(Math.sin(ang) * dist);
    var h = Math.floor(gen.heightAt(x, z));
    gen._stronghold = { x: x, z: z, y: U.clamp(h - 32, 9, 44), surface: h };
    return gen._stronghold;
  };

  // Weltkoordinate des Portals selbst – Ziel des Kompasses
  S.portalPos = function (gen) {
    var s = S.locate(gen);
    return { x: s.x, y: s.y + 1, z: s.z };
  };

  S.draw = function (gen, cx, cz, blocks, meta) {
    var s = S.locate(gen);
    var wx0 = cx * CS, wz0 = cz * CS;
    var inHall = !(s.x + BOX.maxX < wx0 || s.x + BOX.minX > wx0 + CS - 1 ||
                   s.z + BOX.maxZ < wz0 || s.z + BOX.minZ > wz0 + CS - 1);
    var inShaft = (s.x + SHAFT_X >= wx0 - 1 && s.x + SHAFT_X <= wx0 + CS &&
                   s.z + SHAFT_Z >= wz0 - 1 && s.z + SHAFT_Z <= wz0 + CS);
    if (!inHall && !inShaft) return;

    function set(wx, wy, wz, id, m) {
      var lx = wx - wx0, lz = wz - wz0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 1 || wy >= WH) return;
      var i = lx | (lz << 4) | (wy << 8);
      blocks[i] = id;
      meta[i] = m || 0;
    }
    function get(wx, wy, wz) {
      var lx = wx - wx0, lz = wz - wz0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 0 || wy >= WH) return -1;
      return blocks[lx | (lz << 4) | (wy << 8)];
    }

    if (inHall) build(gen, s, set);
    if (inShaft) buildShaft(gen, s, set, get);
  };

  var ID = null;
  function ids() {
    return ID || (ID = {
      bricks: B.id('stone_bricks'), mossy: B.id('mossy_cobblestone'), cobble: B.id('cobblestone'),
      frame: B.id('end_portal_frame'), lava: B.id('lava'), torch: B.id('torch'),
      chest: B.id('chest'), shelf: B.id('bookshelf'), ladder: B.id('ladder'),
      planks: B.id('planks_oak'), air: 0
    });
  }

  // Verwitterter Mauerstein: meist Steinziegel, hier und da moosig oder zerfallen
  function wall(x, y, z) {
    var r = U.hash3(x, y + 400, z);
    var d = ids();
    return r < 0.14 ? d.mossy : (r < 0.20 ? d.cobble : d.bricks);
  }

  function build(gen, s, set) {
    var d = ids();
    var y = s.y, x, z, k;

    // ---- Portalsaal: Hülle, Boden, Decke ----
    for (x = -HALL - 1; x <= HALL + 1; x++) {
      for (z = -HALL - 1; z <= HALL + 1; z++) {
        var randX = Math.abs(x) >= HALL, randZ = Math.abs(z) >= HALL;
        for (k = 0; k <= HALL_H + 1; k++) {
          var wy = y + k;
          if (k === 0) set(s.x + x, wy, s.z + z, wall(s.x + x, wy, s.z + z));
          else if (k === HALL_H + 1) set(s.x + x, wy, s.z + z, wall(s.x + x, wy, s.z + z));
          else if (randX || randZ) set(s.x + x, wy, s.z + z, wall(s.x + x, wy, s.z + z));
          else set(s.x + x, wy, s.z + z, 0);
        }
      }
    }

    // ---- Endportalrahmen: 5x5 ohne Ecken = zwölf Blöcke ----
    // Wie im Original steckt in jedem zehnten Rahmen schon ein Enderauge
    for (x = -2; x <= 2; x++) {
      for (z = -2; z <= 2; z++) {
        var ring = Math.max(Math.abs(x), Math.abs(z)) === 2;
        var ecke = Math.abs(x) === 2 && Math.abs(z) === 2;
        if (!ring || ecke) continue;
        var auge = U.hash3(s.x + x, 77, s.z + z) < 0.1 ? 1 : 0;
        set(s.x + x, y + 1, s.z + z, d.frame, auge);
      }
    }
    // Der Sockel unter der Portalfläche bleibt fest – anders als im Original
    // steht man hier auf dem Portal, statt in die Lava darunter zu fallen.
    for (x = -1; x <= 1; x++) for (z = -1; z <= 1; z++) set(s.x + x, y, s.z + z, d.bricks);

    // ---- Zwei Lavabecken, wie die Pfützen vor dem Portal im Original ----
    var becken = [[-5, -5], [4, -5]];
    for (k = 0; k < becken.length; k++) {
      for (x = 0; x < 2; x++) {
        for (z = 0; z < 2; z++) {
          set(s.x + becken[k][0] + x, y, s.z + becken[k][1] + z, d.lava);
        }
      }
    }

    // ---- Fackeln an den Wänden ----
    // Meta 1..4 = Wandrichtung nach B.SIDE_DIRS: 1 = -Z, 2 = +X, 3 = +Z, 4 = -X
    var fackeln = [[-HALL + 1, -HALL + 1, 1], [HALL - 1, -HALL + 1, 1],
                   [-HALL + 1, HALL - 1, 3], [HALL - 1, HALL - 1, 3]];
    for (k = 0; k < fackeln.length; k++) {
      set(s.x + fackeln[k][0], y + 3, s.z + fackeln[k][1], d.torch, fackeln[k][2]);
    }

    // ---- Truhen an der Südwand ----
    set(s.x - 4, y + 1, s.z + HALL - 1, d.chest, 0);
    set(s.x + 4, y + 1, s.z + HALL - 1, d.chest, 0);

    // ---- Bibliothek ----
    for (x = LIB_X0 - 1; x <= LIB_X1; x++) {
      for (z = -LIB_Z - 1; z <= LIB_Z + 1; z++) {
        var rx = (x <= LIB_X0 || x >= LIB_X1), rz = Math.abs(z) >= LIB_Z;
        for (k = 0; k <= 5; k++) {
          var by = y + k;
          if (k === 0 || k === 5 || rx || rz) set(s.x + x, by, s.z + z, wall(s.x + x, by, s.z + z));
          else set(s.x + x, by, s.z + z, 0);
        }
      }
    }
    // Regale an den Längswänden, ein Tisch und eine Truhe in der Mitte
    for (x = LIB_X0 + 1; x < LIB_X1; x++) {
      if (U.hash3(s.x + x, 9, s.z) < 0.22) continue;
      set(s.x + x, y + 1, s.z - LIB_Z + 1, d.shelf);
      set(s.x + x, y + 2, s.z - LIB_Z + 1, d.shelf);
      set(s.x + x, y + 1, s.z + LIB_Z - 1, d.shelf);
      set(s.x + x, y + 2, s.z + LIB_Z - 1, d.shelf);
    }
    set(s.x + LIB_X0 + 3, y + 1, s.z, B.id('crafting_table'));
    set(s.x + LIB_X0 + 2, y + 1, s.z, d.chest, 0);
    set(s.x + LIB_X0 + 4, y + 3, s.z - LIB_Z + 1, d.torch, 1);
    set(s.x + LIB_X1 - 2, y + 3, s.z + LIB_Z - 1, d.torch, 3);

    // ---- Gang zwischen Bibliothek und Saal ----
    // Zuletzt, damit er beide Wände wieder durchstößt
    for (x = LIB_X1; x <= -HALL; x++) {
      for (z = -2; z <= 2; z++) {
        for (k = 0; k <= 4; k++) {
          var gy = y + k;
          var frei = Math.abs(z) <= 1 && k >= 1 && k <= 3;
          set(s.x + x, gy, s.z + z, frei ? 0 : wall(s.x + x, gy, s.z + z));
        }
      }
    }
    set(s.x + LIB_X1 + 2, y + 3, s.z - 2, d.torch, 1);
    set(s.x - HALL - 3, y + 3, s.z + 2, d.torch, 3);
  }

  // Leiterschacht vom Saal bis knapp unter die Oberfläche. Die letzten Blöcke
  // muss man selbst durchschlagen – von oben ist nichts zu sehen.
  function buildShaft(gen, s, set, get) {
    var d = ids();
    var wx = s.x + SHAFT_X, wz = s.z + SHAFT_Z;
    var top = Math.floor(gen.columnInfo(wx, wz).h) - 3;
    if (top <= s.y + 2) return;
    for (var y = s.y + 1; y <= top; y++) {
      // Schacht auskleiden, damit die Leiter überall Halt hat
      set(wx + 1, y, wz, wall(wx + 1, y, wz));
      set(wx - 1, y, wz, wall(wx - 1, y, wz));
      set(wx, y, wz + 1, wall(wx, y, wz + 1));
      set(wx, y, wz - 1, wall(wx, y, wz - 1));
      set(wx, y, wz, d.ladder, 1);   // hängt an der Wand nach +X
    }
    set(wx, top + 1, wz, wall(wx, top + 1, wz));
  }

  // ---- Beute der beiden Festungstruhen ----
  var LOOT = [
    ['iron_ingot', 0.9, 2, 6], ['bread', 0.8, 2, 4], ['gold_ingot', 0.7, 1, 4],
    ['book', 0.7, 1, 3], ['diamond', 0.5, 1, 3], ['emerald', 0.45, 1, 3],
    ['redstone', 0.5, 3, 8], ['iron_pickaxe', 0.35, 1, 1], ['golden_apple', 0.2, 1, 1],
    ['obsidian', 0.3, 2, 5]
  ];

  S.chestLoot = function (gen, wx, wy, wz) {
    var s = S.locate(gen);
    if (wy !== s.y + 1) return null;
    var saal = (wz === s.z + HALL - 1) && (wx === s.x - 4 || wx === s.x + 4);
    var biblio = (wz === s.z) && (wx === s.x + LIB_X0 + 2);
    if (!saal && !biblio) return null;
    return rollLoot(LOOT, U.rng(U.hashString('festungskiste:' + gen.seed + ':' + wx + ':' + wz)));
  };

  function rollLoot(table, rnd) {
    var items = new Array(27), frei = [], n = 0;
    for (var i = 0; i < 27; i++) frei.push(i);
    for (var t = 0; t < table.length; t++) {
      var e = table[t];
      if (rnd() > e[1]) continue;
      if (!I.get(e[0])) continue;
      var count = e[2] + ((rnd() * (e[3] - e[2] + 1)) | 0);
      items[frei.splice((rnd() * frei.length) | 0, 1)[0]] = I.newStack(e[0], count);
      n++;
    }
    return n ? items : null;
  }

  // ============================================================
  //  Das Ende: Generierung
  // ============================================================
  var E = {};
  MC.End = E;

  E.TOP = 62;              // mittlere Höhe der Inseloberfläche
  var END_R = 58;          // Grundradius der Insel
  var PILLARS = 10;        // wie im Original: zehn Obsidiantürme
  var PILLAR_R = 42;       // Abstand der Türme zur Mitte
  E.ARRIVE_X = 50;         // Ankunftsplattform aus Obsidian

  E.pillar = function (i) {
    var a = (i / PILLARS) * Math.PI * 2;
    return {
      x: Math.round(Math.cos(a) * PILLAR_R),
      z: Math.round(Math.sin(a) * PILLAR_R),
      h: 18 + ((i * 7) % 13),
      r: 2 + (i % 3)
    };
  };

  // Höhenprofil einer Inselsäule; null = Leere
  function column(gen, wx, wz) {
    var d = Math.sqrt(wx * wx + wz * wz);
    var r = END_R * (1 + gen.nCont.fbm2(wx / 78, wz / 78, 3) * 0.18);
    if (d > r) return null;
    var t = 1 - d / r;
    var top = Math.round(E.TOP + gen.nDetail.fbm2(wx / 26, wz / 26, 3) * 3.5 - (1 - t) * 3);
    // Zur Mitte hin wird die Insel dick, zum Rand läuft sie spitz aus
    var thick = 3 + 26 * Math.pow(t, 0.6);
    // Der Portalsockel steht auf einer ebenen Fläche
    if (d < 9) top = E.TOP;
    return { top: top, bottom: Math.round(top - thick) };
  }
  E.column = column;

  D.generateEnd = function (gen, cx, cz, blocks, meta) {
    var endstone = B.id('end_stone'), obsidian = B.id('obsidian'), bedrock = B.id('bedrock');
    var wx0 = cx * CS, wz0 = cz * CS;
    var x, y, z, i;

    for (z = 0; z < CS; z++) {
      for (x = 0; x < CS; x++) {
        var wx = wx0 + x, wz = wz0 + z;
        var col = column(gen, wx, wz);
        if (!col) continue;
        for (y = Math.max(1, col.bottom); y <= col.top; y++) {
          blocks[x | (z << 4) | (y << 8)] = endstone;
        }
      }
    }

    function set(wx, wy, wz, id) {
      var lx = wx - wx0, lz = wz - wz0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 0 || wy >= WH) return;
      blocks[lx | (lz << 4) | (wy << 8)] = id;
    }

    // ---- Obsidiantürme mit Grundgestein als Kristallsockel ----
    for (i = 0; i < PILLARS; i++) {
      var p = E.pillar(i);
      if (p.x + p.r + 1 < wx0 || p.x - p.r - 1 > wx0 + CS - 1) continue;
      if (p.z + p.r + 1 < wz0 || p.z - p.r - 1 > wz0 + CS - 1) continue;
      var base = column(gen, p.x, p.z);
      if (!base) continue;
      for (var dx = -p.r; dx <= p.r; dx++) {
        for (var dz = -p.r; dz <= p.r; dz++) {
          if (dx * dx + dz * dz > p.r * p.r + 0.5) continue;
          var pTop = base.top + p.h;
          for (y = base.top - 4; y <= pTop; y++) set(p.x + dx, y, p.z + dz, obsidian);
          for (y = pTop + 1; y <= pTop + 4; y++) set(p.x + dx, y, p.z + dz, 0);
        }
      }
      set(p.x, base.top + p.h + 1, p.z, bedrock);   // Sockel für den Kristall
    }

    // ---- Ausgangsportal in der Mitte ----
    if (Math.abs(wx0 + 8) < 16 && Math.abs(wz0 + 8) < 16) drawExitPortal(set);

    // ---- Ankunftsplattform aus Obsidian ----
    var ax = E.ARRIVE_X;
    if (Math.abs(ax - (wx0 + 8)) < 16 && Math.abs(wz0 + 8) < 16) {
      var ac = column(gen, ax, 0);
      if (ac) {
        for (var px = -2; px <= 2; px++) {
          for (var pz = -2; pz <= 2; pz++) {
            set(ax + px, ac.top, 0 + pz, obsidian);
            for (var ph = 1; ph <= 4; ph++) set(ax + px, ac.top + ph, 0 + pz, 0);
          }
        }
      }
    }
  };

  // Der Sockel wie im Original: eine Schale aus Grundgestein, in der Mitte ein
  // Pfeiler mit vier Fackeln. Die Portalfläche entsteht erst, wenn der Drache
  // gefallen ist – vorher ist die Mulde leer.
  var EXIT_R2 = 7;   // Radius² der Portalfläche: 5x5 ohne Ecken = 21 Blöcke

  // Alle Felder der Portalfläche, ohne den Mittelpfeiler
  E.exitField = function () {
    var out = [];
    for (var x = -3; x <= 3; x++) {
      for (var z = -3; z <= 3; z++) {
        if (x * x + z * z > EXIT_R2) continue;
        if (x === 0 && z === 0) continue;
        out.push([x, z]);
      }
    }
    return out;
  };

  function drawExitPortal(set) {
    var bedrock = B.id('bedrock'), torch = B.id('torch');
    var y = E.TOP;
    for (var x = -6; x <= 6; x++) {
      for (var z = -6; z <= 6; z++) {
        var d2 = x * x + z * z;
        if (d2 > 40) continue;
        set(x, y, z, bedrock);
        for (var k = 1; k <= 8; k++) set(x, y + k, z, 0);
        // Die Schale steigt nach außen in zwei Stufen an
        if (d2 >= 17) set(x, y + 1, z, bedrock);
        if (d2 >= 30) set(x, y + 2, z, bedrock);
      }
    }
    // Mittelpfeiler, oben rundum eine Fackel; das Drachenei kommt später darauf
    set(0, y + 1, 0, bedrock);
    set(0, y + 2, 0, bedrock);
    set(1, y + 2, 0, torch, 4);
    set(-1, y + 2, 0, torch, 2);
    set(0, y + 2, 1, torch, 1);
    set(0, y + 2, -1, torch, 3);
  }

  // ============================================================
  //  Enderaugen einsetzen
  // ============================================================
  // Die zwölf Rahmenblöcke eines Rings. Meta-Bit 0 sagt, ob ein Auge drinsteckt.
  E.RING = (function () {
    var out = [];
    for (var dx = -2; dx <= 2; dx++) {
      for (var dz = -2; dz <= 2; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
        if (Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
        out.push([dx, dz]);
      }
    }
    return out;
  })();

  // Vom angeklickten Rahmen aus die Mitte suchen
  E.ringCenter = function (world, x, y, z) {
    var frame = B.id('end_portal_frame');
    for (var dx = -2; dx <= 2; dx++) {
      for (var dz = -2; dz <= 2; dz++) {
        if (ringComplete(world, x + dx, y, z + dz, frame)) return { x: x + dx, y: y, z: z + dz };
      }
    }
    return null;
  };

  function ringComplete(world, cx, cy, cz, frame) {
    for (var i = 0; i < E.RING.length; i++) {
      if (world.getBlock(cx + E.RING[i][0], cy, cz + E.RING[i][1]) !== frame) return false;
    }
    return true;
  }

  // Wie viele der zwölf Rahmen haben schon ein Auge?
  E.eyesSet = function (world, c) {
    var n = 0;
    for (var i = 0; i < E.RING.length; i++) {
      if (world.getMeta(c.x + E.RING[i][0], c.y, c.z + E.RING[i][1]) & 1) n++;
    }
    return n;
  };

  // Rechtsklick mit einem Enderauge auf einen Rahmenblock
  E.placeEye = function (game) {
    var w = game.world, t = game.target;
    if (!t || w.getBlock(t.x, t.y, t.z) !== B.id('end_portal_frame')) return false;
    if (w.getMeta(t.x, t.y, t.z) & 1) { game.ui.toast('In diesem Rahmen steckt schon ein Auge.'); return true; }

    w.setMetaOnly(t.x, t.y, t.z, w.getMeta(t.x, t.y, t.z) | 1);
    game.particles.portal(t.x + 0.5, t.y + 1.1, t.z + 0.5, 14);
    game.audio.play('levelup');
    game.player.swingTime = 1;
    if (game.mode !== 'creative') game.player.inventory.consumeSelected(1);

    var c = E.ringCenter(w, t.x, t.y, t.z);
    if (!c) { game.ui.toast('Der Rahmen ist nicht vollständig.'); return true; }
    var n = E.eyesSet(w, c);
    if (n < E.RING.length) {
      game.ui.toast('Enderauge eingesetzt — ' + n + ' von ' + E.RING.length + '.');
      return true;
    }
    E.ignite(game, c);
    return true;
  };

  E.ignite = function (game, c) {
    var w = game.world;
    var portal = B.id('portal_end');
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) w.setBlock(c.x + dx, c.y, c.z + dz, portal, 0);
    }
    for (var k = 0; k < 12; k++) {
      game.particles.crit(c.x + 0.5 + (Math.random() - 0.5) * 4, c.y + 1.2, c.z + 0.5 + (Math.random() - 0.5) * 4);
    }
    game.audio.play('levelup');
    MC.Achievements.grant(game, 'endportal');
    game.ui.toast('Alle zwölf Augen sitzen. Das Endportal öffnet sich.');
  };

  // ============================================================
  //  Enderkristall
  // ============================================================
  function EndCrystal(world, x, y, z, index) {
    MC.Entity.call(this, world, x, y, z);
    this.type = 'mob';
    this.isMob = true;
    this.mobType = 'end_crystal';
    this.model = MC.MODELS.end_crystal;
    this.spec = { sound: 'glass', xp: 0 };
    this.width = 1.0; this.height = 1.4;
    this.hp = 1; this.maxHp = 1;
    this.noHealthBar = true;
    this.hostile = false;
    this.gravity = 0;
    this.crystalIndex = index;
    this.baseY = y;
    this.walkTime = 0;
    this.moving = false;
    this.hurtTime = 0;
  }
  EndCrystal.prototype = Object.create(MC.Entity.prototype);
  EndCrystal.prototype.constructor = EndCrystal;
  MC.EndCrystal = EndCrystal;

  EndCrystal.prototype.update = function (dt, game) {
    this.age += dt;
    this.y = this.baseY + Math.sin(this.age * 1.1) * 0.22;
    this.yaw = this.age * 0.6;
  };

  EndCrystal.prototype.hurt = function (amount, source, game) {
    if (this.dead) return;
    this.dead = true;
    E.state(game).crystals[this.crystalIndex] = true;
    MC.explode(game, this.x, this.y + 0.5, this.z, 2.6);
    MC.Achievements.grant(game, 'kristall');
    game.ui.toast('Ein Enderkristall zerspringt.');
  };

  // ============================================================
  //  Enderdrache
  // ============================================================
  var DRAGON_HP = 200;

  function EnderDragon(world, x, y, z) {
    MC.Entity.call(this, world, x, y, z);
    this.type = 'mob';
    this.isMob = true;
    this.mobType = 'ender_dragon';
    this.model = MC.MODELS.ender_dragon;
    this.spec = { sound: 'ghast', xp: 0 };
    this.width = 5; this.height = 2.6;
    this.cullRadius = 9;
    this.noHealthBar = true;      // der Drache hat seine eigene Leiste oben
    this.hostile = true;
    this.gravity = 0;
    this.hp = DRAGON_HP; this.maxHp = DRAGON_HP;
    this.hurtTime = 0;
    this.walkTime = 0;
    this.moving = true;
    this.angle = Math.random() * Math.PI * 2;
    this.phase = 'kreis';
    this.phaseCd = 6;
    this.attackCd = 2;
    this.meleeCd = 0;
    this.healCd = 0;
    this.mouthOpen = 0;
    this.dying = 0;
  }
  EnderDragon.prototype = Object.create(MC.Entity.prototype);
  EnderDragon.prototype.constructor = EnderDragon;
  MC.EnderDragon = EnderDragon;

  EnderDragon.prototype.update = function (dt, game) {
    this.age += dt;
    this.walkTime += dt * 2.6;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.mouthOpen > 0) this.mouthOpen -= dt * 2;

    if (this.dying > 0) { this.deathTick(dt, game); return; }

    var p = game.player;
    var alive = E.crystalsAlive(this.world);

    // ---- Kristalle heilen den Drachen, solange sie stehen ----
    this.healCd -= dt;
    if (alive.length && this.healCd <= 0) {
      this.healCd = 0.5;
      this.hp = Math.min(this.maxHp, this.hp + 1);
      E.state(game).dragonHp = this.hp;
      var c = nearest(this, alive);
      if (c) beam(game, this, c);
    }

    // ---- Phasenwechsel ----
    this.phaseCd -= dt;
    if (this.phaseCd <= 0) {
      // Ohne Kristalle greift er deutlich häufiger an
      var angriff = Math.random() < (alive.length ? 0.35 : 0.7);
      this.phase = angriff && p && !p.dead ? 'sturz' : 'kreis';
      this.phaseCd = this.phase === 'sturz' ? 5 : 6 + Math.random() * 4;
      if (this.phase === 'sturz') this.mouthOpen = 1;
    }

    // ---- Zielpunkt bestimmen ----
    var tx, ty, tz;
    if (this.phase === 'sturz' && p && !p.dead) {
      tx = p.x; ty = p.y + 2.5; tz = p.z;
    } else {
      this.angle += dt * 0.36;
      var rad = 40 + Math.sin(this.age * 0.23) * 8;
      tx = Math.cos(this.angle) * rad;
      tz = Math.sin(this.angle) * rad;
      ty = E.TOP + 24 + Math.sin(this.age * 0.4) * 6;
    }

    var dx = tx - this.x, dy = ty - this.y, dz = tz - this.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var speed = this.phase === 'sturz' ? 16 : 10;
    var acc = dt * 2.4;
    this.vx += (dx / d * speed - this.vx) * acc;
    this.vy += (dy / d * speed - this.vy) * acc;
    this.vz += (dz / d * speed - this.vz) * acc;
    this.x += this.vx * dt; this.y += this.vy * dt; this.z += this.vz * dt;
    if (this.y < E.TOP + 3) { this.y = E.TOP + 3; this.vy = Math.max(0, this.vy); }
    this.yaw = Math.atan2(this.vx, this.vz);

    // ---- Nahkampf: der Flügelschlag wirft einen weg ----
    if (this.meleeCd > 0) this.meleeCd -= dt;
    if (p && !p.dead && this.meleeCd <= 0) {
      var pd = this.distTo(p);
      if (pd < 5.5) {
        this.meleeCd = 1.4;
        p.hurt(7, this, game);
        var kx = p.x - this.x, kz = p.z - this.z;
        var kl = Math.sqrt(kx * kx + kz * kz) || 1;
        p.vx += kx / kl * 16; p.vz += kz / kl * 16; p.vy = Math.max(p.vy, 9);
        game.audio.play('hit');
      }
    }

    // ---- Drachenatem: ein Feuerball aus dem Rachen ----
    if (this.attackCd > 0) this.attackCd -= dt;
    if (p && !p.dead && this.attackCd <= 0 && this.distTo(p) < 34) {
      this.attackCd = alive.length ? 4.5 : 3.0;
      this.mouthOpen = 1;
      this.spit(game, p);
    }

    if (Math.random() < dt * 6) game.particles.smoke(this.x, this.y + 1, this.z, 1);
  };

  EnderDragon.prototype.spit = function (game, target) {
    var hx = this.x - Math.sin(this.yaw) * 4.2;
    var hy = this.y + 1.6;
    var hz = this.z - Math.cos(this.yaw) * 4.2;
    var dx = target.x - hx, dy = (target.y + 1) - hy, dz = target.z - hz;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var v = 18;
    game.world.entities.push(new MC.Projectile(game.world, hx, hy, hz,
      dx / d * v, dy / d * v, dz / d * v, this, true));
    game.audio.play3d('ghast', this.x, this.y, this.z, game.player);
  };

  EnderDragon.prototype.hurt = function (amount, source, game) {
    if (this.dead || this.dying > 0) return;
    if (this.hurtTime > 0.2) return;
    this.hp -= amount;
    this.hurtTime = 0.45;
    E.state(game).dragonHp = this.hp;
    game.particles.blood(this.x, this.y + 1.2, this.z);
    game.audio.play3d('ghast', this.x, this.y, this.z, game.player);
    if (this.hp <= 0) { this.hp = 0; this.die(game); }
  };

  EnderDragon.prototype.die = function (game) {
    this.dying = 6;
    this.vx = this.vz = 0;
    this.phase = 'tod';
    game.audio.play('death');
    game.ui.toast('Der Enderdrache stürzt!');
  };

  // Sterbeflug: der Drache steigt langsam auf und zerplatzt dabei
  EnderDragon.prototype.deathTick = function (dt, game) {
    this.dying -= dt;
    this.y += dt * 1.6;
    this.yaw += dt * 0.6;
    this.mouthOpen = 1;
    if (Math.random() < dt * 12) {
      game.particles.explosion(this.x + (Math.random() - 0.5) * 7,
        this.y + Math.random() * 3, this.z + (Math.random() - 0.5) * 7, 1.4);
    }
    game.camShake = Math.max(game.camShake, 0.3);
    if (this.dying <= 0) {
      this.dead = true;
      for (var i = 0; i < 24; i++) {
        game.world.entities.push(new MC.XPOrb(this.world,
          this.x + (Math.random() - 0.5) * 4, this.y, this.z + (Math.random() - 0.5) * 4, 20));
      }
      E.onDragonDead(game);
    }
  };

  function nearest(e, list) {
    var best = null, bd = 1e9;
    for (var i = 0; i < list.length; i++) {
      var d = e.distTo(list[i]);
      if (d < bd) { bd = d; best = list[i]; }
    }
    return best;
  }

  // Heilstrahl als Partikelkette zwischen Kristall und Drache. Einzelne,
  // stehende Partikel statt crit() – das ergibt eine Linie statt einer Wolke
  // und kostet ein Zehntel der Partikel.
  function beam(game, dragon, crystal) {
    var layer = MC.Textures.layer('p_yellow');
    var y0 = crystal.y + 0.6, y1 = dragon.y + 1.2;
    for (var t = 0; t <= 1.001; t += 0.08) {
      game.particles.spawn(
        crystal.x + (dragon.x - crystal.x) * t,
        y0 + (y1 - y0) * t,
        crystal.z + (dragon.z - crystal.z) * t,
        0, 0, 0, layer, 0.13, 0.45, 0);
    }
  }

  // ============================================================
  //  Ablauf im Ende
  // ============================================================
  // Was den Spielstand überleben muss. Entities werden nicht gespeichert, also
  // merkt sich der Zustand, welche Kristalle schon hin sind und wie weit der
  // Drache ist – sonst stünde nach dem Laden wieder alles unversehrt da.
  E.state = function (game) {
    if (!game.endState) game.endState = { dragonDead: false };
    if (!game.endState.crystals) game.endState.crystals = {};
    return game.endState;
  };

  E.crystalsAlive = function (world) {
    var out = [];
    for (var i = 0; i < world.entities.length; i++) {
      var e = world.entities[i];
      if (!e.dead && e.mobType === 'end_crystal') out.push(e);
    }
    return out;
  };

  E.dragon = function (world) {
    for (var i = 0; i < world.entities.length; i++) {
      var e = world.entities[i];
      if (!e.dead && e.mobType === 'ender_dragon') return e;
    }
    return null;
  };

  // Sorgt dafür, dass Kristalle und Drache da sind, sobald die Chunks stehen
  E.tick = function (game) {
    var w = game.world;
    if (w.dim !== 'the_end') return;
    var st = E.state(game);
    if (st.dragonDead) return;

    var haveCrystal = {};
    for (var i = 0; i < w.entities.length; i++) {
      var e = w.entities[i];
      if (!e.dead && e.mobType === 'end_crystal') haveCrystal[e.crystalIndex] = true;
    }
    for (var k = 0; k < PILLARS; k++) {
      if (haveCrystal[k] || st.crystals[k]) continue;
      var p = E.pillar(k);
      if (!w.isLoaded(p.x, E.TOP, p.z)) continue;
      var top = w.heightAtWorld(p.x, p.z);
      if (top <= 0) continue;
      w.entities.push(new EndCrystal(w, p.x + 0.5, top + 0.5, p.z + 0.5, k));
    }

    if (!E.dragon(w) && w.isLoaded(0, E.TOP, 0)) {
      var dragon = new EnderDragon(w, 0, E.TOP + 28, -30);
      if (st.dragonHp > 0) dragon.hp = Math.min(dragon.maxHp, st.dragonHp);
      w.entities.push(dragon);
      game.ui.toast('Etwas Großes kreist über der Insel.');
    }
  };

  // Der Drache ist gefallen: das Ausgangsportal zündet, das Drachenei erscheint
  E.onDragonDead = function (game) {
    var w = game.world;
    E.state(game).dragonDead = true;
    MC.Achievements.grant(game, 'drache');
    var portal = B.id('portal_end'), egg = B.id('dragon_egg');
    var field = E.exitField();
    for (var i = 0; i < field.length; i++) {
      w.setBlock(field[i][0], E.TOP, field[i][1], portal, 0);
    }
    // Das Ei thront auf dem Pfeiler in der Mitte
    w.setBlock(0, E.TOP + 3, 0, egg, 0);
    game.audio.play('levelup');
    game.ui.toast('Das Portal zurück in die Oberwelt hat sich geöffnet.');
    game.saveWorld();
  };

  // Ein Endportal betreten
  E.usePortal = function (game) {
    if (game.dim === 'the_end') {
      if (E.state(game).dragonDead) game.finishGame();
      return;
    }
    var target = game.dimWorld('the_end');
    game.generateAround(target, E.ARRIVE_X, 0, 2);
    var gy = D.findGround(target, E.ARRIVE_X, 0);
    if (gy < 0) gy = E.TOP + 1;
    game.travelTo('the_end', { x: E.ARRIVE_X + 0.5, y: gy + 0.05, z: 0.5 });
    E.tick(game);
  };

})();
