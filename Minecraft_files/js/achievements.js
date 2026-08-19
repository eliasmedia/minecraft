/* ============================================================
   achievements.js  -  Erfolge als Baum

   Aufgebaut wie im Original: eine Wurzel, von der aus sich Zweige öffnen, und
   jeder Erfolg hängt an einem Elternteil. Die Kette der Oberwelt ist die aus
   Minecraft; ab dem Nether folgt der Baum unserer eigenen Weltenfolge —
   Glowstone öffnet den Aether, Gravitit führt zum Kompass, der Kompass zur
   Festung, und von dort geht es ins Ende.
   ============================================================ */
(function () {
  'use strict';

  var A = {};
  MC.Achievements = A;

  // id, Titel, Beschreibung, Elternteil (null = Wurzel), Symbol-Item
  A.LIST = [
    ['start', 'Ein Anfang', 'Schlag dein erstes Holz aus einem Baum.', null, 'log_oak'],
    ['bretter', 'Vier aus eins', 'Mach aus einem Stamm Bretter.', 'start', 'planks_oak'],
    ['werkbank', 'Zeit für Ordnung', 'Baue eine Werkbank.', 'bretter', 'crafting_table'],
    ['werkzeug', 'Erstes Werkzeug', 'Stelle eine Spitzhacke her.', 'werkbank', 'wood_pickaxe'],
    ['stein', 'Unter der Grasnarbe', 'Baue Stein ab.', 'werkzeug', 'cobblestone'],
    ['ofen', 'Warm ums Herz', 'Baue einen Ofen.', 'stein', 'furnace'],
    ['brot', 'Nicht nur rohes Fleisch', 'Backe oder brate etwas Essbares.', 'ofen', 'bread'],
    ['eisen', 'Härter als Stein', 'Schmelze einen Eisenbarren.', 'ofen', 'iron_ingot'],
    ['ruestung_eisen', 'Blech am Leib', 'Trage ein Rüstungsteil aus Eisen.', 'eisen', 'iron_chestplate'],
    ['diamant', 'Diamanten!', 'Finde einen Diamanten.', 'eisen', 'diamond'],
    ['bett', 'Gute Nacht', 'Schlafe in einem Bett.', 'stein', 'bed'],
    ['dorf', 'Nicht allein', 'Handle mit einem Dorfbewohner.', 'stein', 'emerald'],
    ['redstone', 'Es leuchtet', 'Schalte eine Redstonelampe.', 'eisen', 'redstone_lamp'],

    ['nether', 'Ab nach unten', 'Betritt den Nether.', 'diamant', 'obsidian'],
    ['glowstone', 'Licht aus der Tiefe', 'Brich Glowstone in einer Bastion.', 'nether', 'glowstone'],
    ['zanite', 'Hitzefest', 'Trage ein Rüstungsteil aus Zanit.', 'nether', 'zanite_gemstone'],
    ['lohe', 'Ausgeblasen', 'Erlege eine Lohe.', 'glowstone', 'blaze_rod'],

    ['aether', 'Ab nach oben', 'Betritt den Aether.', 'glowstone', 'aercloud'],
    ['gravitit', 'Gegen die Schwerkraft', 'Grabe Gravitit aus einer Insel.', 'aether', 'gravitite'],
    ['gravhelm', 'Sicht auf alles', 'Trage den Gravitithelm.', 'gravitit', 'gravitite_helmet'],

    ['perle', 'Kurze Wege', 'Bring eine Enderperle an dich.', 'lohe', 'ender_pearl'],
    ['auge', 'Der Blick nach unten', 'Stelle ein Enderauge her.', 'perle', 'ender_eye'],
    ['festung', 'Tief vergraben', 'Finde die Festung.', 'gravhelm', 'stone_bricks'],
    ['endportal', 'Zwölf Augen', 'Öffne das Endportal.', 'auge', 'end_portal_frame'],
    ['ende', 'Das Ende', 'Betritt das Ende.', 'endportal', 'end_stone'],
    ['kristall', 'Erst die Türme', 'Zerstöre einen Enderkristall.', 'ende', 'obsidian'],
    ['drache', 'Freies Ende', 'Besiege den Enderdrachen.', 'kristall', 'dragon_egg']
  ];

  A.byId = {};
  A.LIST.forEach(function (e) {
    A.byId[e[0]] = { id: e[0], title: e[1], desc: e[2], parent: e[3], icon: e[4] };
  });

  // Kinder je Knoten, in der Reihenfolge der Liste
  A.children = function (id) {
    var out = [];
    for (var i = 0; i < A.LIST.length; i++) {
      if (A.LIST[i][3] === id) out.push(A.byId[A.LIST[i][0]]);
    }
    return out;
  };

  // ============================================================
  //  Baumlayout
  // ============================================================
  // Die Tiefe bestimmt die Spalte, die Zeile ergibt sich aus den Blaettern:
  // jedes Blatt bekommt die naechste freie Zeile, jeder Elternknoten die Mitte
  // zwischen seinem ersten und letzten Kind. Das ist das uebliche Verfahren
  // fuer aufgeraeumte Baeume und braucht genau einen Durchgang.
  //
  // Vorher rueckte die Anzeige jede Stufe um einen festen Betrag ein. Bei einer
  // Kette, die bis zum Drachen sechzehn Stufen tief geht, blieb hinten keine
  // Zeilenbreite mehr uebrig — und die Verzweigungen sah man ueberhaupt nicht.
  A.layout = function () {
    if (A._layout) return A._layout;
    var pos = {}, zeile = 0;
    function gehe(knoten, tiefe) {
      var kinder = A.children(knoten.id);
      if (!kinder.length) {
        pos[knoten.id] = { t: tiefe, z: zeile++ };
        return pos[knoten.id].z;
      }
      var erste = null, letzte = 0;
      for (var i = 0; i < kinder.length; i++) {
        var z = gehe(kinder[i], tiefe + 1);
        if (erste === null) erste = z;
        letzte = z;
      }
      pos[knoten.id] = { t: tiefe, z: (erste + letzte) / 2 };
      return pos[knoten.id].z;
    }
    A.children(null).forEach(function (w) { gehe(w, 0); });
    var maxT = 0, maxZ = 0;
    for (var k in pos) { if (pos[k].t > maxT) maxT = pos[k].t; if (pos[k].z > maxZ) maxZ = pos[k].z; }
    A._layout = { pos: pos, spalten: maxT + 1, zeilen: maxZ + 1 };
    return A._layout;
  };

  A.state = function (game) {
    if (!game.achievements) game.achievements = {};
    return game.achievements;
  };

  A.has = function (game, id) { return !!A.state(game)[id]; };

  A.grant = function (game, id) {
    var e = A.byId[id];
    if (!e) return;
    var st = A.state(game);
    if (st[id]) return;
    st[id] = true;
    game.ui.achievementToast(e);
    game.audio.play('levelup');
    // Ein Erfolg setzt seine Vorgeschichte voraus – die zählt rückwirkend mit
    var p = e.parent;
    while (p && !st[p]) { st[p] = true; p = A.byId[p] ? A.byId[p].parent : null; }
  };

  // ============================================================
  //  Auslöser
  // ============================================================
  // Ein Item wandert ins Inventar – aufgesammelt, gecraftet oder geschmolzen
  var BEI_ITEM = {
    log_oak: 'start', log_birch: 'start', log_spruce: 'start',
    log_skyroot: 'start', log_golden_oak: 'start',
    planks_oak: 'bretter', planks_birch: 'bretter', planks_spruce: 'bretter',
    planks_skyroot: 'bretter',
    crafting_table: 'werkbank', furnace: 'ofen',
    cobblestone: 'stein', iron_ingot: 'eisen', diamond: 'diamant',
    bread: 'brot', emerald: 'dorf',
    glowstone_dust: 'glowstone', glowstone: 'glowstone',
    zanite_gemstone: 'zanite', gravitite: 'gravitit',
    aercloud: 'aether', blaze_rod: 'lohe', ender_pearl: 'perle',
    ender_eye: 'auge', redstone_lamp: 'redstone', dragon_egg: 'drache'
  };

  A.onItem = function (game, id) {
    if (!id) return;
    if (BEI_ITEM[id]) A.grant(game, BEI_ITEM[id]);
    if (id.indexOf('_pickaxe') > 0) A.grant(game, 'werkzeug');
    // Gebratenes zählt als Essen
    if (id.indexOf('_cooked') > 0) A.grant(game, 'brot');
  };

  A.onDim = function (game, dim) {
    if (dim === 'nether') A.grant(game, 'nether');
    else if (dim === 'aether') A.grant(game, 'aether');
    else if (dim === 'the_end') A.grant(game, 'ende');
  };

  // Rüstung am Körper prüfen – billig genug für einen Aufruf pro Sekunde
  A.checkArmor = function (game) {
    var inv = game.player.inventory;
    for (var i = 0; i < 4; i++) {
      var a = inv.armor[i];
      if (!a) continue;
      if (a.id.indexOf('iron_') === 0) A.grant(game, 'ruestung_eisen');
      if (a.id.indexOf('zanite_') === 0) A.grant(game, 'zanite');
      if (a.id === 'gravitite_helmet') A.grant(game, 'gravhelm');
    }
  };

})();
