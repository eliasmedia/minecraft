/* ============================================================
   logistik.js  -  Trichter und Werfer

   Redstone konnte bisher schalten, aber nichts bewegen. Ohne einen Trichter
   bleibt jede Farm Handarbeit, und der Beobachter hat gar keinen Abnehmer:
   er meldet eine Änderung, und niemand tut etwas damit.

   Beides sind Behälter mit Zeitgeber, keine Redstoneleitungen. Sie hängen an
   derselben Blockentität wie die Truhe — `{ items: [...] }` —, und genau darum
   funktionieren sie mit allem zusammen, was es schon gibt: Truhe, Ofen,
   Braustand, ein zweiter Trichter.
   ============================================================ */
(function () {
  'use strict';

  var L = {};
  MC.Logistik = L;
  var B = MC.Blocks, I = MC.Items;

  L.TAKT = 0.4;          // Sekunden zwischen zwei Bewegungen
  L.HOPPER_SLOTS = 5;
  L.DROPPER_SLOTS = 9;

  // ============================================================
  //  Behälter
  // ============================================================
  // Alles, was `items` hat, ist ein Behälter. Der Ofen bekommt eine Sonderrolle,
  // weil seine drei Fächer verschiedene Aufgaben haben: von oben kommt das
  // Rohmaterial hinein, von unten wird das Ergebnis herausgezogen.
  L.behaelter = function (world, x, y, z) {
    var id = world.getBlock(x, y, z);
    if (!id) return null;
    var b = B.byId[id];
    if (!b) return null;
    if (b.name === 'chest') return MC.game && MC.game.chestTile ? MC.game.chestTile(x, y, z) : null;
    var te = world.tileEntities[x + ',' + y + ',' + z];
    if (!te) return null;
    if (te.items) return te;
    if (te.type === 'furnace') return te;
    return null;
  };

  // Ein Fach hineinlegen. Liefert true, wenn wenigstens eines untergekommen ist.
  L.einlegen = function (te, stack, vonOben) {
    if (!stack || stack.count <= 0) return false;
    if (te.type === 'furnace') {
      // Von oben das Rohmaterial, von der Seite der Brennstoff — dieselbe
      // Aufteilung wie im Original, und sie ergibt sich aus dem Aufbau des Ofens.
      var feld = vonOben ? 'input' : 'fuel';
      if (te[feld] && te[feld].id !== stack.id) return false;
      if (te[feld]) {
        var max = I.get(te[feld].id).stack || 64;
        if (te[feld].count >= max) return false;
        te[feld].count++;
      } else {
        te[feld] = I.newStack(stack.id, 1);
        if (stack.ench) te[feld].ench = stack.ench;
      }
      stack.count--;
      return true;
    }
    var items = te.items;
    if (!items) return false;
    var maxStack = I.get(stack.id) ? (I.get(stack.id).stack || 64) : 64;
    // Erst auf einen angefangenen Stapel, dann auf ein leeres Fach
    for (var i = 0; i < items.length; i++) {
      var s = items[i];
      if (s && s.id === stack.id && !s.ench && !stack.ench && s.count < maxStack) {
        s.count++; stack.count--; return true;
      }
    }
    for (var k = 0; k < items.length; k++) {
      if (!items[k]) {
        items[k] = I.newStack(stack.id, 1);
        if (stack.ench) items[k].ench = stack.ench;
        stack.count--;
        return true;
      }
    }
    return false;
  };

  // Ein Fach herausnehmen. Liefert den entnommenen Einzelstapel oder null.
  L.entnehmen = function (te, vonUnten) {
    if (te.type === 'furnace') {
      // Aus einem Ofen wird nur das Ergebnis gezogen, nie das, was noch brennt
      if (!vonUnten || !te.output) return null;
      var eins = I.newStack(te.output.id, 1);
      if (te.output.ench) eins.ench = te.output.ench;
      te.output.count--;
      if (te.output.count <= 0) te.output = null;
      return eins;
    }
    var items = te.items;
    if (!items) return null;
    for (var i = 0; i < items.length; i++) {
      var s = items[i];
      if (!s || s.count <= 0) continue;
      var raus = I.newStack(s.id, 1);
      if (s.ench) raus.ench = s.ench;
      s.count--;
      if (s.count <= 0) items[i] = null;
      return raus;
    }
    return null;
  };

  // ============================================================
  //  Trichter
  // ============================================================
  L.trichterDaten = function (world, x, y, z) {
    return world.tileEntity(x, y, z, function () {
      return { type: 'hopper', items: new Array(L.HOPPER_SLOTS), cd: 0 };
    });
  };

  L.werferDaten = function (world, x, y, z) {
    return world.tileEntity(x, y, z, function () {
      return { type: 'dropper', items: new Array(L.DROPPER_SLOTS), an: false };
    });
  };

  // Ein Trichter arbeitet in drei Schritten, und die Reihenfolge ist wichtig:
  // erst hinausgeben, dann von oben ziehen, dann liegengebliebene Gegenstände
  // aufsammeln. Andersherum ginge ein Stück in einem Takt durch — der Trichter
  // wäre dann kein Zwischenlager mehr, sondern ein Rohr.
  function trichterTakt(game, x, y, z, te, dt) {
    var world = game.world;
    te.cd -= dt;
    if (te.cd > 0) return;
    te.cd = L.TAKT;

    // Redstone hält ihn an, wie im Original
    if (MC.Redstone && MC.Redstone.powered(world, x, y, z)) return;

    var meta = world.getMeta(x, y, z);
    var d = B.hopperDir(meta);

    // 1) hinausgeben
    var ziel = L.behaelter(world, x + d[0], y + d[1], z + d[2]);
    if (ziel) {
      var raus = L.entnehmen(te, false);
      if (raus) {
        if (!L.einlegen(ziel, raus, d[1] < 0)) {
          // Passte nicht — zurücklegen, sonst verschwindet es
          L.einlegen(te, raus, true);
        }
      }
    }

    // 2) von oben ziehen
    var oben = L.behaelter(world, x, y + 1, z);
    if (oben) {
      var rein = L.entnehmen(oben, true);
      if (rein && !L.einlegen(te, rein, true)) L.einlegen(oben, rein, true);
    }

    // 3) aufsammeln, was über dem Rand liegt
    var ents = world.entities;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.dead || e.type !== 'item' || e.pickupDelay > 0) continue;
      if (e.x < x - 0.2 || e.x > x + 1.2 || e.z < z - 0.2 || e.z > z + 1.2) continue;
      if (e.y < y + 0.5 || e.y > y + 1.9) continue;
      while (e.stack.count > 0 && L.einlegen(te, e.stack, true)) { /* Stück für Stück */ }
      if (e.stack.count <= 0) e.dead = true;
      break;
    }
  }

  // Der Werfer wirft auf die steigende Flanke, nicht solange Strom anliegt —
  // sonst leert er sich in einem Takt komplett.
  function werferTakt(game, x, y, z, te) {
    var world = game.world;
    var an = MC.Redstone ? MC.Redstone.powered(world, x, y, z) : false;
    if (an === te.an) return;
    te.an = an;
    if (!an) return;

    var voll = [];
    for (var i = 0; i < te.items.length; i++) if (te.items[i] && te.items[i].count > 0) voll.push(i);
    if (!voll.length) { game.audio.play('nope'); return; }

    var k = voll[(Math.random() * voll.length) | 0];
    var s = te.items[k];
    var raus = I.newStack(s.id, 1);
    if (s.ench) raus.ench = s.ench;
    s.count--;
    if (s.count <= 0) te.items[k] = null;

    var meta = world.getMeta(x, y, z);
    var d = B.DIR6[meta & 7] || B.DIR6[0];
    var e = new MC.ItemEntity(world, x + 0.5 + d[0] * 0.7, y + 0.5 + d[1] * 0.7, z + 0.5 + d[2] * 0.7, raus);
    e.vx = d[0] * 6 + (Math.random() - 0.5) * 0.6;
    e.vy = d[1] * 6 + 1.2;
    e.vz = d[2] * 6 + (Math.random() - 0.5) * 0.6;
    e.pickupDelay = 0.4;
    world.entities.push(e);
    game.audio.play('click');
  }

  // ============================================================
  //  Takt
  // ============================================================
  // Abgesucht wird ein Kasten um den Spieler — dieselbe Lösung wie beim
  // Befehlsblock. Ein Verzeichnis aller Trichter der Welt müsste beim Laden und
  // Entladen gepflegt werden und wäre eine zweite Wahrheit neben den
  // Blockentitäten.
  L.tick = function (game, dt) {
    if (!game.started || game.paused) return;
    var world = game.world, p = game.player;
    var tes = world.tileEntities;
    for (var k in tes) {
      var te = tes[k];
      if (!te || (te.type !== 'hopper' && te.type !== 'dropper')) continue;
      var dx = te.x + 0.5 - p.x, dz = te.z + 0.5 - p.z;
      if (dx * dx + dz * dz > 64 * 64) continue;
      var id = world.getBlock(te.x, te.y, te.z);
      if (te.type === 'hopper') {
        if (id !== B.id('hopper')) continue;
        trichterTakt(game, te.x, te.y, te.z, te, dt);
      } else {
        if (id !== B.id('dropper')) continue;
        werferTakt(game, te.x, te.y, te.z, te);
      }
    }
  };

  // Beim Abbauen fällt der Inhalt heraus — das erledigt breakBlock über
  // `te.items` bereits; hier steht nur, was darüber hinaus nötig ist.
  L.abgebaut = function (game, x, y, z) { /* nichts Eigenes */ };

})();
