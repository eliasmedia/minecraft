/* ============================================================
   potions.js  -  Statuseffekte, Nethergewächs, Braustand, Tränke

   Das Effektsystem steht bewusst vor dem Brauen: es trägt auch den goldenen
   Apfel, die Verbrennungsklinge und alles, was später an Wirkungen dazukommt.
   ============================================================ */
(function () {
  'use strict';

  var P = {};
  MC.Effekte = P;

  // MC.Items wird bewusst nicht hier festgehalten: items.js baut seine
  // Trankeintraege aus P.TRAENKE und laedt darum erst nach dieser Datei.
  var B = MC.Blocks, U = MC.U;

  // ============================================================
  //  Die Effekte
  // ============================================================
  // sofort = wirkt einmal und ist dann vorbei
  P.LISTE = {
    regeneration:   { titel: 'Regeneration', farbe: '#cd5cab' },
    staerke:        { titel: 'Stärke', farbe: '#932423' },
    schnelligkeit:  { titel: 'Schnelligkeit', farbe: '#7cafc6' },
    feuerresistenz: { titel: 'Feuerresistenz', farbe: '#e49a3a' },
    nachtsicht:     { titel: 'Nachtsicht', farbe: '#1f1fa1' },
    sprungkraft:    { titel: 'Sprungkraft', farbe: '#22ff4c' },
    heilung:        { titel: 'Heilung', farbe: '#f82423', sofort: true },
    schaden:        { titel: 'Schaden', farbe: '#430a09', sofort: true }
  };

  P.gib = function (spieler, key, stufe, sekunden) {
    var e = P.LISTE[key];
    if (!e) return;
    if (!spieler.effekte) spieler.effekte = [];
    if (e.sofort) {
      if (key === 'heilung') spieler.heal(4 * stufe);
      else if (key === 'schaden' && MC.game) spieler.hurt(3 * stufe, null, MC.game);
      return;
    }
    for (var i = 0; i < spieler.effekte.length; i++) {
      var a = spieler.effekte[i];
      if (a.key !== key) continue;
      // Das stärkere gewinnt, bei gleicher Stufe die längere Restzeit
      if (stufe > a.stufe || (stufe === a.stufe && sekunden > a.rest)) {
        a.stufe = stufe; a.rest = sekunden;
      }
      return;
    }
    spieler.effekte.push({ key: key, stufe: stufe, rest: sekunden });
  };

  P.stufe = function (spieler, key) {
    if (!spieler || !spieler.effekte) return 0;
    for (var i = 0; i < spieler.effekte.length; i++) {
      if (spieler.effekte[i].key === key) return spieler.effekte[i].stufe;
    }
    return 0;
  };

  P.tick = function (spieler, game, dt) {
    if (!spieler.effekte || !spieler.effekte.length) return;
    for (var i = spieler.effekte.length - 1; i >= 0; i--) {
      var e = spieler.effekte[i];
      e.rest -= dt;
      if (e.rest <= 0) { spieler.effekte.splice(i, 1); continue; }
      if (e.key === 'regeneration') {
        e.t = (e.t || 0) + dt;
        var takt = 2.5 / e.stufe;
        if (e.t >= takt) { e.t = 0; spieler.heal(1); }
      }
    }
  };

  // ============================================================
  //  Tränke
  // ============================================================
  // [Schlüssel, Titel, Effekt, Grundstufe, Sekunden, Farbe]
  var TRAENKE = [
    ['awkward', 'Seltsamer Trank', null, 0, 0, '#4d4d8c'],
    ['healing', 'Trank der Heilung', 'heilung', 1, 0, '#f82423'],
    ['harming', 'Trank des Schadens', 'schaden', 1, 0, '#430a09'],
    ['regeneration', 'Trank der Regeneration', 'regeneration', 1, 45, '#cd5cab'],
    ['strength', 'Trank der Stärke', 'staerke', 1, 180, '#932423'],
    ['swiftness', 'Trank der Schnelligkeit', 'schnelligkeit', 1, 180, '#7cafc6'],
    ['fire_resistance', 'Trank der Feuerresistenz', 'feuerresistenz', 1, 180, '#e49a3a'],
    ['night_vision', 'Trank der Nachtsicht', 'nachtsicht', 1, 180, '#1f1fa1'],
    ['leaping', 'Trank der Sprungkraft', 'sprungkraft', 1, 180, '#22ff4c']
  ];
  P.TRAENKE = {};
  TRAENKE.forEach(function (t) {
    P.TRAENKE[t[0]] = { key: t[0], titel: t[1], effekt: t[2], stufe: t[3], dauer: t[4], farbe: t[5] };
  });

  // Was aus einer Zutat wird. Basis -> Zutat -> Ergebnis.
  // Die Zutaten weichen an drei Stellen vom Original ab, weil es Glitzermelone,
  // Magmacreme und goldene Karotte bei uns nicht gibt – dafür haben wir
  // Ambrosium, Magmablöcke und Blaubeeren, die dasselbe erzählen.
  P.BRAUEN = {
    water: { nether_wart_item: 'awkward' },
    awkward: {
      ambrosium_shard: 'healing',
      blaze_powder: 'strength',
      sugar: 'swiftness',
      magma_block: 'fire_resistance',
      blueberries: 'night_vision',
      feather: 'leaping',
      ghast_tear: 'regeneration'
    },
    healing: { bone: 'harming' }
  };

  // Verlängern und verstärken, wie im Original mit Redstone und Glowstone
  P.MODIFIKATOR = { redstone: 'lang', glowstone_dust: 'stark' };

  P.zerlegen = function (id) {
    if (id === 'water_bottle') return { art: 'water', mod: null };
    if (id.indexOf('potion_') !== 0) return null;
    var rest = id.slice(7);
    var mod = null;
    if (rest.slice(-5) === '_lang') { mod = 'lang'; rest = rest.slice(0, -5); }
    else if (rest.slice(-6) === '_stark') { mod = 'stark'; rest = rest.slice(0, -6); }
    return P.TRAENKE[rest] ? { art: rest, mod: mod } : null;
  };

  P.bauen = function (art, mod) {
    if (art === 'water') return 'water_bottle';
    return 'potion_' + art + (mod ? '_' + mod : '');
  };

  // Ein Braugang: was wird aus diesem Glas mit dieser Zutat?
  P.ergebnis = function (flasche, zutat) {
    var z = P.zerlegen(flasche);
    if (!z) return null;
    var m = P.MODIFIKATOR[zutat];
    if (m) {
      // Verlängern und verstärken schließen sich aus, und ein seltsamer Trank
      // lässt sich weder strecken noch verstärken – da ist noch nichts drin.
      var t = P.TRAENKE[z.art];
      if (!t || !t.effekt) return null;
      if (m === 'lang' && !t.dauer) return null;      // Sofortwirkung hat keine Dauer
      if (z.mod === m) return null;
      return P.bauen(z.art, m);
    }
    var tabelle = P.BRAUEN[z.art];
    if (!tabelle || !tabelle[zutat]) return null;
    return P.bauen(tabelle[zutat], null);
  };

  // Trinken
  P.trinken = function (game, stack) {
    var z = P.zerlegen(stack.id);
    if (!z) return false;
    var t = P.TRAENKE[z.art];
    if (t && t.effekt) {
      var stufe = t.stufe + (z.mod === 'stark' ? 1 : 0);
      var dauer = t.dauer * (z.mod === 'lang' ? 2 : (z.mod === 'stark' ? 0.5 : 1));
      P.gib(game.player, t.effekt, stufe, dauer || 1);
    }
    game.player.inventory.consumeSelected(1);
    var rest = game.player.inventory.add(MC.Items.newStack('glass_bottle', 1));
    if (rest > 0) game.throwStack(MC.Items.newStack('glass_bottle', rest));
    game.audio.play('eat');
    return true;
  };

  // ============================================================
  //  Braustand
  // ============================================================
  P.BRAUZEIT = 400;      // Ticks je Gang, wie im Original

  P.tickStand = function (game) {
    var w = game.world;
    var standId = B.id('brewing_stand');
    for (var k in w.tileEntities) {
      var te = w.tileEntities[k];
      if (!te || te.type !== 'brew') continue;
      var p = k.split(',');
      if (w.getBlock(+p[0], +p[1], +p[2]) !== standId) continue;

      // Was ließe sich mit der Zutat überhaupt anfangen?
      var machbar = [];
      if (te.zutat) {
        for (var s = 0; s < 3; s++) {
          if (!te.glas[s]) continue;
          var erg = P.ergebnis(te.glas[s].id, te.zutat.id);
          if (erg) machbar.push({ slot: s, erg: erg });
        }
      }
      if (!machbar.length) { te.fortschritt = 0; continue; }

      if (te.brennstoff <= 0) {
        if (te.fuel && te.fuel.id === 'blaze_powder') {
          te.fuel.count--;
          if (te.fuel.count <= 0) te.fuel = null;
          te.brennstoff = 20;
        } else { te.fortschritt = 0; continue; }
      }

      te.fortschritt++;
      if (te.fortschritt < P.BRAUZEIT) continue;
      te.fortschritt = 0;
      te.brennstoff--;
      for (var m = 0; m < machbar.length; m++) {
        te.glas[machbar[m].slot] = MC.Items.newStack(machbar[m].erg, 1);
      }
      te.zutat.count--;
      if (te.zutat.count <= 0) te.zutat = null;
      game.audio.play('fizz');
    }
  };

  // ============================================================
  //  Nethergewächs
  // ============================================================
  // Wächst nur auf Seelensand, dafür überall – Licht spielt keine Rolle.
  P.tickWart = function (game, x, y, z) {
    var w = game.world;
    if (w.getBlock(x, y, z) !== B.id('nether_wart')) return;
    var m = w.getMeta(x, y, z);
    if (m >= 3) return;
    if (Math.random() > 0.09) return;
    w.setMetaOnly(x, y, z, m + 1);
  };

})();
