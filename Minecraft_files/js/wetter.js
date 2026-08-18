/* ============================================================
   wetter.js  -  Regen, Gewitter, Sandsturm, Schneesturm

   Die Regel für alles hier: Wetter ändert **Zustände**, es platziert nichts.
   Regen füllt einen Kessel, aber legt keinen Wasserblock. Ein Blitz zündet ein
   Feuer und lädt ganz selten einen Creeper auf, aber reißt kein Loch. Ein
   Sandsturm nimmt die Sicht, aber verweht keine Düne. Ein Schneesturm macht aus
   Gras beschneites Gras, aber stapelt keine Schneeblöcke.

   Das ist keine Bequemlichkeit, sondern Absicht: was das Wetter setzt, landet
   im Spielstand und bleibt für immer. Eine Nacht Regen darf nicht die halbe
   Landschaft umschreiben, und ein Haus darf nicht versanden, während man
   woanders ist.

   Welches Wetter kommt, entscheidet das Biom, in dem der Spieler steht — nicht
   die ganze Welt auf einmal. In der Wüste stürmt der Sand, in der Tundra
   schneit es, sonst regnet es.
   ============================================================ */
(function () {
  'use strict';

  var W = {};
  MC.Wetter = W;
  var B = MC.Blocks, U = MC.U;

  W.ARTEN = ['klar', 'regen', 'gewitter', 'sandsturm', 'schneesturm'];

  // Wie lange etwas anhält (Sekunden) und wie lange es danach klar bleibt
  var DAUER = [180, 420];
  var PAUSE = [420, 1200];

  function zufall(a) { return a[0] + Math.random() * (a[1] - a[0]); }

  W.zustand = function (world) {
    if (!world.wetter) {
      world.wetter = { art: 'klar', rest: zufall(PAUSE), staerke: 0, ziel: 0, blitzCd: 8 };
    }
    return world.wetter;
  };

  // Trocken? Dann fällt nichts vom Himmel, und die Sicht bleibt.
  W.faellt = function (world) {
    var z = W.zustand(world);
    return z.art !== 'klar' && z.staerke > 0.01;
  };

  W.istRegen = function (world) {
    var z = W.zustand(world);
    return (z.art === 'regen' || z.art === 'gewitter') && z.staerke > 0.2;
  };

  // Der Nebel rückt näher und der Himmel wird dunkler, je stärker es zieht.
  W.sicht = function (world) {
    var z = W.zustand(world);
    if (z.art === 'sandsturm') return 1 - z.staerke * 0.72;
    if (z.art === 'schneesturm') return 1 - z.staerke * 0.6;
    if (z.art === 'gewitter') return 1 - z.staerke * 0.42;
    if (z.art === 'regen') return 1 - z.staerke * 0.3;
    return 1;
  };

  W.dunkel = function (world) {
    var z = W.zustand(world);
    if (z.art === 'klar') return 0;
    return z.staerke * (z.art === 'gewitter' ? 0.55 : 0.32);
  };

  // ============================================================
  //  Takt
  // ============================================================
  W.tick = function (game, dt) {
    var world = game.world;
    // Wetter gibt es nur unter freiem Himmel — im Nether und im Ende nicht,
    // und im Aether stünde man über den Wolken.
    if (world.dim !== 'overworld') { world.wetter = null; return; }
    var z = W.zustand(world);

    z.rest -= dt;
    if (z.rest <= 0) {
      if (z.art === 'klar') {
        z.art = W.wuerfeln(game);
        z.rest = zufall(DAUER);
        z.ziel = 0.6 + Math.random() * 0.4;
      } else {
        z.art = 'klar';
        z.rest = zufall(PAUSE);
        z.ziel = 0;
      }
    }
    // Ein- und Ausblenden über eine halbe Minute, damit es nicht springt
    var d = z.ziel - z.staerke;
    z.staerke += Math.max(-dt / 25, Math.min(dt / 25, d));

    if (z.art === 'gewitter' && z.staerke > 0.5) W.blitzTick(game, dt, z);
    if (z.staerke > 0.35) W.bodenTick(game, dt, z);
    W.klang(game, dt, z);
  };

  // Welches Wetter zum Ort passt. Das Biom des Spielers entscheidet.
  W.wuerfeln = function (game) {
    var p = game.player, world = game.world;
    var BIOME = MC.WorldGen.BIOME;
    var biom = (world.gen && world.gen.biomeAt)
      ? world.gen.biomeAt(Math.floor(p.x), Math.floor(p.z)) : BIOME.PLAINS;
    if (biom === BIOME.DESERT) return 'sandsturm';
    if (biom === BIOME.SNOW || biom === BIOME.TAIGA || biom === BIOME.MOUNTAINS) {
      return Math.random() < 0.7 ? 'schneesturm' : 'regen';
    }
    return Math.random() < 0.28 ? 'gewitter' : 'regen';
  };

  // ============================================================
  //  Blitz
  // ============================================================
  // Er schlägt in der Nähe des Spielers ein, aber nicht auf ihn. Was er
  // anrichtet, ist mit Absicht klein: ein Feuer, wo etwas brennen kann, und
  // sehr selten ein aufgeladener Creeper. Ein Krater wäre eine Landschaft, die
  // sich hinter dem Rücken des Spielers verändert.
  W.blitzTick = function (game, dt, z) {
    z.blitzCd -= dt;
    if (z.blitzCd > 0) return;
    z.blitzCd = 20 + Math.random() * 55;

    var world = game.world, p = game.player;
    var wink = Math.random() * 6.283, weite = 12 + Math.random() * 34;
    var bx = Math.floor(p.x + Math.sin(wink) * weite);
    var bz = Math.floor(p.z + Math.cos(wink) * weite);
    var by = W.himmelHoehe(world, bx, bz);
    if (by < 0) return;

    game.blitzFlash = 1;
    game.camShake = Math.max(game.camShake || 0, 0.25);
    game.audio.play('explode', 0.5);

    // Feuer nur, wenn die Spielregel es zulässt, der Platz frei ist — und
    // längst nicht bei jedem Einschlag. Bei jedem zweiten brennt nach einer
    // Nacht Gewitter der halbe Wald; ein Fünftel ist selten genug, dass es
    // eine Geschichte bleibt.
    if (Math.random() < 0.2 && (!MC.Cmd || MC.Cmd.regel(game, 'doFireTick'))) {
      if (world.getBlock(bx, by, bz) === 0 && B.isSolid(world.getBlock(bx, by - 1, bz))) {
        world.setBlock(bx, by, bz, B.id('fire'), 0);
      }
    }

    // Ein Creeper im Umkreis wird aufgeladen — die Seltenheit ist der Reiz
    var ents = world.entities;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.dead || e.mobType !== 'creeper' || e.geladen) continue;
      var dx = e.x - bx, dz = e.z - bz;
      if (dx * dx + dz * dz > 9) continue;
      e.geladen = true;
      e.maxHp = e.hp = Math.max(e.hp, 20);
      game.particles.funken(e.x, e.y + 1, e.z, 24);
      game.ui.toast('Ein Blitz hat einen Creeper aufgeladen');
    }
    game.particles.funken(bx + 0.5, by + 0.3, bz + 0.5, 30);
  };

  // Die oberste freie Stelle über festem Grund, oder -1 unter freiem Himmel
  W.himmelHoehe = function (world, x, z) {
    for (var y = MC.WORLD_HEIGHT - 1; y > 1; y--) {
      var id = world.getBlock(x, y, z);
      if (id === 0) continue;
      var b = B.byId[id];
      if (!b || !b.collide) continue;
      return y + 1 < MC.WORLD_HEIGHT ? y + 1 : -1;
    }
    return -1;
  };

  // ============================================================
  //  Was das Wetter am Boden tut
  // ============================================================
  // Ein kleiner Kasten um den Spieler, ein paar Felder je Takt. Alles, was
  // hier passiert, ist eine Zustandsänderung: Kessel füllen, Gras beschneien.
  W.bodenTick = function (game, dt, z) {
    game.wetterTimer = (game.wetterTimer || 0) + dt;
    if (game.wetterTimer < 0.5) return;
    game.wetterTimer = 0;

    var world = game.world, p = game.player;
    var regen = (z.art === 'regen' || z.art === 'gewitter');
    var schnee = (z.art === 'schneesturm');
    if (!regen && !schnee) return;

    var grasId = B.id('grass'), schneeGrasId = B.id('grass_snow'), kesselId = B.id('cauldron');
    for (var n = 0; n < 12; n++) {
      var x = Math.floor(p.x) + ((Math.random() * 33) | 0) - 16;
      var zz = Math.floor(p.z) + ((Math.random() * 33) | 0) - 16;
      var y = W.himmelHoehe(world, x, zz);
      if (y < 1) continue;
      // Nur, wo der Himmel wirklich offen ist — unter einem Dach regnet es nicht
      if (world.getSky(x, y, zz) < 14) continue;

      var unten = world.getBlock(x, y - 1, zz);
      if (regen && unten === kesselId) {
        var m = world.getMeta(x, y - 1, zz) & 3;
        // Ein Kessel ist selten; wird er getroffen, steigt der Stand auch. Mit
        // einer zusätzlichen Wahrscheinlichkeit dauerte das Füllen zehn Minuten.
        if (m < 3) world.setMetaOnly(x, y - 1, zz, m + 1);
        continue;
      }
      if (schnee && unten === grasId && Math.random() < 0.3) {
        world.setBlock(x, y - 1, zz, schneeGrasId, 0);
      }
    }
  };

  // Regen und Sturm als Klang: kurze Rauschstöße statt einer Schleife — das
  // Spiel synthetisiert ohnehin alles, und eine Schleife bräuchte eine Datei.
  W.klang = function (game, dt, z) {
    if (z.staerke < 0.15 || !game.audio || !game.audio.ctx) return;
    game.wetterKlang = (game.wetterKlang || 0) - dt;
    if (game.wetterKlang > 0) return;
    game.wetterKlang = 0.28 + Math.random() * 0.2;
    var t = game.audio.now();
    var g = 0.05 * z.staerke;
    if (z.art === 'sandsturm') game.audio.noise(t, 0.6, g, 'bandpass', 700, 0.8, 400);
    else if (z.art === 'schneesturm') game.audio.noise(t, 0.6, g * 0.8, 'lowpass', 500, 0.7, 300);
    else game.audio.noise(t, 0.4, g, 'highpass', 2200, 0.7, 3200);
  };

  // ============================================================
  //  Der Kessel
  // ============================================================
  // Rechtsklick mit einer leeren Flasche nimmt eine Füllung heraus, mit einem
  // Wassereimer füllt er ihn ganz. Damit ist Wasser oben ohne See zu haben —
  // der einzige spürbare Nutzen des Regens, und ein guter.
  W.kesselBenutzen = function (game, x, y, z) {
    var world = game.world, p = game.player;
    if (world.getBlock(x, y, z) !== B.id('cauldron')) return false;
    var stand = world.getMeta(x, y, z) & 3;
    var st = p.inventory.selectedStack();
    var id = st ? st.id : null;

    if (id === 'water_bucket') {
      if (stand === 3) return false;
      world.setMetaOnly(x, y, z, 3);
      if (game.mode !== 'creative') p.inventory.slots[p.inventory.selected] = MC.Items.newStack('bucket', 1);
      game.audio.play('splash');
      return true;
    }
    if (id === 'bucket' && stand === 3) {
      world.setMetaOnly(x, y, z, 0);
      if (game.mode !== 'creative') p.inventory.slots[p.inventory.selected] = MC.Items.newStack('water_bucket', 1);
      game.audio.play('splash');
      return true;
    }
    if (id === 'glass_bottle' && stand > 0) {
      world.setMetaOnly(x, y, z, stand - 1);
      if (game.mode !== 'creative') {
        p.inventory.consumeSelected(1);
        if (p.inventory.add(MC.Items.newStack('water_bottle', 1)) > 0) {
          game.spawnItem(p.x, p.y + 1, p.z, MC.Items.newStack('water_bottle', 1));
        }
      }
      game.audio.play('splash');
      return true;
    }
    return false;
  };

})();
