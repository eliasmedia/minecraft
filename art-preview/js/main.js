/* ============================================================
   main.js  -  füllt das Stilblatt
   ============================================================ */
(function () {
  'use strict';

  var A = window.ART;
  var B = window.Board;
  var el = B.el;

  // Bestandsatlas als lesende Quelle für den Vergleich
  var ALT = window.MC && MC.Textures ? {
    data: function (n) { return MC.Textures.has(n) ? MC.Textures.data(n) : null; },
    layer: function (n) { return MC.Textures.layer(n); },
    count: MC.Textures.count,
    buildBuffer: MC.Textures.buildBuffer,
    meta: function () { return {}; }
  } : null;

  // ============================================================
  //  Testszene
  // ============================================================
  (function () {
    var cv = document.getElementById('scene');
    var fail = document.getElementById('scenefail');
    var atlases = { neu: A };
    if (ALT) atlases.alt = ALT;

    var sc;
    try {
      sc = window.Scene.create(cv, atlases, { msaa: true });
    } catch (e) {
      fail.hidden = false;
      fail.textContent = 'Die Testszene braucht WebGL2: ' + e.message;
      return;
    }
    sc.set('capLod', false);

    document.querySelectorAll('[data-atlas]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!atlases[b.dataset.atlas]) return;
        document.querySelectorAll('[data-atlas]').forEach(function (o) { o.classList.remove('on'); });
        b.classList.add('on');
        sc.set('atlas', b.dataset.atlas);
      });
      if (!atlases[b.dataset.atlas]) { b.disabled = true; b.title = 'Bestandstexturen nicht geladen'; }
    });

    function chk(id, key) {
      var e = document.getElementById(id);
      e.addEventListener('change', function () { sc.set(key, e.checked); });
    }
    chk('c-mipmap', 'mipmap');
    chk('c-caplod', 'capLod');
    chk('c-srgb', 'srgb');
    chk('c-dir', 'dirShade');
    chk('c-rot', 'autoRotate');

    var lod = document.getElementById('c-lod'), lodV = document.getElementById('v-lod');
    lod.addEventListener('input', function () {
      sc.set('lodBias', parseFloat(lod.value));
      lodV.textContent = parseFloat(lod.value).toFixed(2).replace('.', ',');
    });
    var an = document.getElementById('c-aniso'), anV = document.getElementById('v-aniso');
    an.addEventListener('input', function () {
      sc.set('aniso', parseInt(an.value, 10));
      anV.textContent = an.value;
    });
    document.getElementById('c-reset').addEventListener('click', function () {
      sc.state.yaw = 0.72; sc.state.pitch = 0.52; sc.state.dist = 26;
    });
  })();

  // ============================================================
  //  Mipmap-Demo
  // ============================================================
  (function () {
    var host = document.getElementById('mipdemo');
    function reihe(atlas, name, label) {
      var w = el('div', 'miprow');
      w.appendChild(el('span', 'miplabel', label));
      w.appendChild(B.mipStrip(atlas, name));
      return w;
    }
    if (ALT && ALT.data('grass_top')) host.appendChild(reihe(ALT, 'grass_top', 'jetzt · Gras oben'));
    host.appendChild(reihe(A, 'grass_top', 'Vorschlag · Gras oben'));
    if (ALT && ALT.data('cobblestone')) host.appendChild(reihe(ALT, 'cobblestone', 'jetzt · Bruchstein'));
    host.appendChild(reihe(A, 'cobblestone', 'Vorschlag · Bruchstein'));
  })();

  // ============================================================
  //  Messtabelle: Vanilla (gemessen) | Bestand | Vorschlag
  // ============================================================
  (function () {
    var host = document.getElementById('messtabelle');
    var zeilen = [
      ['stone', 'Stein'], ['dirt', 'Erde'], ['grass_top', 'Gras oben'],
      ['cobblestone', 'Bruchstein'], ['stone_bricks', 'Steinziegel'], ['sand', 'Sand'],
      ['gravel', 'Kies'], ['planks_oak', 'Bretter'], ['log_oak', 'Stamm'],
      ['log_oak_top', 'Stamm oben'], ['leaves_oak', 'Laub'], ['coal_ore', 'Kohleerz'],
      ['iron_ore', 'Eisenerz'], ['gold_ore', 'Golderz'], ['diamond_ore', 'Diamanterz'],
      ['bedrock', 'Grundgestein'], ['netherrack', 'Netherrack'], ['obsidian', 'Obsidian'],
      ['snow_block', 'Schnee'], ['ice', 'Eis'], ['clay', 'Ton'],
      ['iron_pickaxe', 'Eisenspitzhacke'], ['diamond', 'Diamant'], ['stick', 'Stock'],
      ['coal', 'Kohle'], ['bread', 'Brot'], ['bone', 'Knochen']
    ];

    var kopf = el('div', 'mzeile kopf');
    kopf.appendChild(el('span', 'mname', ''));
    [['Vanilla (gemessen)', 'van'], ['Bestand', 'alt'], ['Vorschlag', 'neu']].forEach(function (g) {
      var b = el('span', 'mgrp ' + g[1]);
      b.appendChild(el('b', null, g[0]));
      var sub = el('span', 'msub');
      sub.appendChild(el('i', null, 'Farben'));
      sub.appendChild(el('i', null, 'Kontr.'));
      sub.appendChild(el('i', null, 'Sätt.'));
      b.appendChild(sub);
      kopf.appendChild(b);
    });
    host.appendChild(kopf);

    function zelle(wrap, k, ziel) {
      var g = el('span', 'mgrp');
      if (!k) { g.appendChild(el('span', 'mleer', '–')); wrap.appendChild(g); return; }
      var vals = [k.farben, k.kontrast, k.saettigung.toFixed(2).replace('.', ',')];
      var sub = el('span', 'msub');
      vals.forEach(function (v, i) {
        var e = el('i', null, v);
        if (ziel && i < 2) {
          var soll = i === 0 ? ziel.farben : ziel.kontrast;
          var ist = i === 0 ? k.farben : k.kontrast;
          // Farben: Faktor; Kontrast: absolute Abweichung
          var ok = i === 0
            ? (ist <= Math.max(12, soll * 2.2))
            : (Math.abs(ist - soll) <= Math.max(18, soll * 0.35));
          e.className = ok ? 'gut' : 'schlecht';
        }
        sub.appendChild(e);
      });
      g.appendChild(sub);
      wrap.appendChild(g);
    }

    zeilen.forEach(function (z) {
      var name = z[0];
      var van = A.MESS[name];
      var row = el('div', 'mzeile');
      row.appendChild(el('span', 'mname', z[1]));
      zelle(row, van || null, null);
      zelle(row, ALT ? A.kennzahlen(ALT, name) : null, van);
      zelle(row, A.kennzahlen(A, name), van);
      host.appendChild(row);
    });

    var legende = el('p', 'mlegende');
    legende.innerHTML = 'Grün = nahe am gemessenen Vanilla-Wert. Rot = weit daneben. ' +
      'Die Spalte <b>Bestand</b> zeigt, warum die heutigen Kacheln flach wirken: ' +
      'oft ein Vielfaches der Tonanzahl bei zu geringem Kontrast.';
    host.appendChild(legende);
  })();

  // ============================================================
  //  Palette
  // ============================================================
  (function () {
    var host = document.getElementById('palgrid');
    var namen = [
      ['stone', 'Stein · neutralgrau', '4 Töne, Kontrast 27'],
      ['cobble', 'Bruchstein', '6 Töne, Kontrast 69'],
      ['bricks', 'Steinziegel', '5 Töne'],
      ['bedrock', 'Grundgestein', '5 Töne, Kontrast 100'],
      ['gravel', 'Kies · leicht warm', '6 Töne'],
      ['dirt', 'Erde · Farbton 25° konstant', '4 Töne, Kontrast 76'],
      ['planks', 'Bretter', '6 Töne, Kontrast 78'],
      ['bark', 'Rinde', '6 Töne'],
      ['sand', 'Sand · bewusst flach', '5 Töne, Kontrast 21'],
      ['sandstone', 'Sandstein', '4 Töne'],
      ['grassGrey', 'Gras · Graustufe vor Tönung', '8 Stufen'],
      ['leafGrey', 'Laub · Graustufe vor Tönung', '4 Stufen'],
      ['netherrack', 'Netherrack', '5 Töne, Kontrast 30'],
      ['obsidian', 'Obsidian', '5 Töne, sehr dunkel'],
      ['ice', 'Eis', '4 Töne'],
      ['clay', 'Ton', '4 Töne, Kontrast 14'],
      ['glow', 'Leuchtstein', '5 Töne']
    ];
    namen.forEach(function (p) {
      var liste = A.P[p[0]];
      if (!liste) return;
      var c = el('div', 'palcard');
      var bar = el('div', 'palbar');
      liste.forEach(function (col) {
        var s = el('i');
        s.style.background = 'rgb(' + col.join(',') + ')';
        s.title = 'rgb(' + col.join(', ') + ')';
        bar.appendChild(s);
      });
      c.appendChild(bar);
      c.appendChild(el('h4', null, p[1]));
      c.appendChild(el('code', null, p[2]));
      host.appendChild(c);
    });

    // Tönungen extra zeigen
    var t = el('div', 'palcard');
    var tb = el('div', 'palbar');
    [['tintGrass', 'Gras'], ['tintLeaf', 'Laub'], ['tintPlant', 'Pflanze']].forEach(function (k) {
      var s = el('i');
      s.style.background = 'rgb(' + A.P[k[0]].join(',') + ')';
      s.appendChild(el('b', null, k[1]));
      tb.appendChild(s);
    });
    t.appendChild(tb);
    t.appendChild(el('h4', null, 'Tönungen'));
    t.appendChild(el('code', null, 'aus den Vanilla-Colormaps'));
    host.appendChild(t);

    // Rampenvergleich: zu viele Stufen gegen die gemessenen wenigen
    var cmp = document.getElementById('rampcmp');
    [[A.P.dirt, 'Erde'], [A.P.planks, 'Bretter'], [A.P.stone, 'Stein'], [A.P.sand, 'Sand']]
      .forEach(function (p) {
        var liste = p[0];
        var row = el('div', 'cmprow');
        row.appendChild(el('span', 'cmpname', p[1]));

        // Bestand: stufenloses Rauschen um den Grundton
        var basis = liste[Math.floor(liste.length / 2)];
        var alt = el('div', 'cmpbar');
        for (var i = 0; i < 24; i++) {
          var f = 0.87 + (i / 23) * 0.26;
          var s = el('i');
          s.style.background = 'rgb(' + basis.map(function (v) {
            return Math.min(255, Math.round(v * f));
          }).join(',') + ')';
          alt.appendChild(s);
        }
        var altw = el('div', 'cmpcol');
        altw.appendChild(el('span', 'cmptag bad', 'Bestand: stufenlos, ±13 %'));
        altw.appendChild(alt);

        var neu = el('div', 'cmpbar');
        liste.forEach(function (col) {
          var s2 = el('i');
          s2.style.background = 'rgb(' + col.join(',') + ')';
          neu.appendChild(s2);
        });
        var neuw = el('div', 'cmpcol');
        neuw.appendChild(el('span', 'cmptag good', 'Vorschlag: ' + liste.length + ' feste Töne'));
        neuw.appendChild(neu);

        row.appendChild(altw); row.appendChild(neuw);
        cmp.appendChild(row);
      });
  })();

  // ============================================================
  //  Blöcke
  // ============================================================
  var BLOECKE = [
    { name: 'Grasblock', top: 'grass_top', side: 'grass_side' },
    { name: 'Erde', top: 'dirt', side: 'dirt' },
    { name: 'Stein', top: 'stone', side: 'stone' },
    { name: 'Bruchstein', top: 'cobblestone', side: 'cobblestone' },
    { name: 'Steinziegel', top: 'stone_bricks', side: 'stone_bricks' },
    { name: 'Sand', top: 'sand', side: 'sand' },
    { name: 'Sandstein', top: 'sandstone', side: 'sandstone' },
    { name: 'Kies', top: 'gravel', side: 'gravel' },
    { name: 'Eichenstamm', top: 'log_oak_top', side: 'log_oak' },
    { name: 'Eichenbretter', top: 'planks_oak', side: 'planks_oak' },
    { name: 'Eichenlaub', top: 'leaves_oak', side: 'leaves_oak', tag: 'Alphatest' },
    { name: 'Kohleerz', top: 'coal_ore', side: 'coal_ore' },
    { name: 'Eisenerz', top: 'iron_ore', side: 'iron_ore' },
    { name: 'Golderz', top: 'gold_ore', side: 'gold_ore' },
    { name: 'Diamanterz', top: 'diamond_ore', side: 'diamond_ore' },
    { name: 'Redstoneerz', top: 'redstone_ore', side: 'redstone_ore' },
    { name: 'Lapiserz', top: 'lapis_ore', side: 'lapis_ore' },
    { name: 'Smaragderz', top: 'emerald_ore', side: 'emerald_ore' },
    { name: 'Schnee', top: 'snow_block', side: 'snow_block' },
    { name: 'Eis', top: 'ice', side: 'ice', tag: 'transparent' },
    { name: 'Obsidian', top: 'obsidian', side: 'obsidian' },
    { name: 'Ton', top: 'clay', side: 'clay' },
    { name: 'Grundgestein', top: 'bedrock', side: 'bedrock' },
    { name: 'Leuchtstein', top: 'glowstone', side: 'glowstone', tag: 'leuchtet' },
    { name: 'Netherrack', top: 'netherrack', side: 'netherrack' },
    { name: 'Wasser', top: 'water', side: 'water', tag: 'transparent' },
    { name: 'Lava', top: 'lava', side: 'lava', tag: 'leuchtet' }
  ];
  (function () {
    var host = document.getElementById('blockgrid');
    BLOECKE.forEach(function (b) { host.appendChild(B.blockCard(A, b)); });

    var t = document.getElementById('tilegrid');
    ['grass_top', 'stone', 'cobblestone', 'sand', 'planks_oak', 'dirt', 'gravel', 'leaves_oak'].forEach(function (n) {
      var box = el('div', 'tilebox');
      box.appendChild(B.tiled(A, n, 4, 3));
      box.appendChild(el('label', null, n));
      t.appendChild(box);
    });
  })();

  // ============================================================
  //  Natur
  // ============================================================
  (function () {
    var host = document.getElementById('naturgrid');
    [['tall_grass', 'Grasbüschel', '5 Halme mit Fuß, Mitte, Spitze'],
     ['flower_red', 'Mohn', 'Blüte 5×5 mit Kontur, 2 Blätter'],
     ['flower_yellow', 'Löwenzahn', 'gleiche Vorlage, andere Rampe'],
     ['flower_blue', 'Kornblume', 'gleiche Vorlage, andere Rampe'],
     ['mushroom_red', 'Fliegenpilz', 'Hut mit Punkten, Stiel mit Ring'],
     ['mushroom_brown', 'Brauner Pilz', 'flacher Hut, dicker Stiel'],
     ['sapling_oak', 'Eichensetzling', 'Krone und Stamm, klare Silhouette'],
     ['dead_bush', 'Dürrer Busch', '3 Äste, kahl'],
     ['leaves_oak', 'Laub', 'Büschel mit gestalteten Lücken']
    ].forEach(function (p) { host.appendChild(B.tileCard(A, p[0], p[1], p[2], 6)); });
  })();

  // ============================================================
  //  Gegenstände
  // ============================================================
  (function () {
    var host = document.getElementById('toolgrid');
    var tiers = [['wood', 'Holz'], ['stone', 'Stein'], ['iron', 'Eisen'], ['gold', 'Gold'], ['diamond', 'Diamant']];
    var typen = [['pickaxe', 'Spitzhacke'], ['axe', 'Axt'], ['shovel', 'Schaufel'], ['sword', 'Schwert'], ['hoe', 'Hacke']];

    var head = el('div', 'toolrow head');
    head.appendChild(el('span', 'toolname', ''));
    typen.forEach(function (t) { head.appendChild(el('span', 'toolcol', t[1])); });
    host.appendChild(head);

    tiers.forEach(function (tier) {
      var row = el('div', 'toolrow');
      row.appendChild(el('span', 'toolname', tier[1]));
      typen.forEach(function (t) {
        var cell = el('span', 'toolcell');
        cell.appendChild(B.flat(A, tier[0] + '_' + t[0], 4));
        row.appendChild(cell);
      });
      host.appendChild(row);
    });

    var g = document.getElementById('itemgrid');
    [['stick', 'Stock', 'Diagonale, 3 Holztöne'],
     ['coal', 'Kohle', 'Bruchstück mit Kanten — kein runder Klumpen'],
     ['iron_ingot', 'Eisenbarren', 'Vorlage, nur Rampe getauscht'],
     ['gold_ingot', 'Goldbarren', 'dieselbe Vorlage'],
     ['diamond', 'Diamant', 'Facetten aus 3 Tönen'],
     ['emerald', 'Smaragd', 'dieselbe Vorlage'],
     ['apple', 'Apfel', 'Stiel und Blatt geben die Silhouette'],
     ['bread', 'Brot', 'Kruste als eigener Ton'],
     ['bone', 'Knochen', 'symmetrisch, sofort erkennbar'],
     ['arrow', 'Pfeil', 'Spitze, Schaft, Feder klar getrennt'],
     ['bucket', 'Eimer', 'Henkel als eigene Silhouette'],
     ['torch_item', 'Fackel', 'Flamme mit Kern und Saum']
    ].forEach(function (p) { g.appendChild(B.tileCard(A, p[0], p[1], p[2], 6)); });
  })();

  // ============================================================
  //  Kreaturen
  // ============================================================
  (function () {
    var host = document.getElementById('mobgrid');
    [['player_face', 'Spieler · Gesicht', 'Augengrammatik: 3×3, Glanz oben rechts'],
     ['player_body', 'Spieler · Rumpf', 'Stoffrichtung statt Einfarbigkeit'],
     ['zombie_face', 'Zombie · Gesicht', 'feste Wunde, Zähne als 1-px-Reihe'],
     ['zombie_body', 'Zombie · Haut', 'Fleckenstruktur bei 4 px'],
     ['skeleton_face', 'Skelett · Schädel', 'tiefe Augenhöhlen, Nasenöffnung'],
     ['skeleton_body', 'Skelett · Knochen', 'Rippenrichtung'],
     ['creeper_face', 'Creeper · Gesicht', 'unverwechselbare Silhouette'],
     ['creeper_body', 'Creeper · Haut', 'Tarnmuster in Klumpen'],
     ['pig_face', 'Schwein · Gesicht', 'Rüssel als eigene Form'],
     ['cow_face', 'Kuh · Gesicht', 'Blesse trennt Kopf vom Rumpf'],
     ['cow_body', 'Kuh · Fell', 'Fellrichtung waagerecht'],
     ['player_arm', 'Arm', 'Bodenschatten an der Unterkante']
    ].forEach(function (p) { host.appendChild(B.tileCard(A, p[0], p[1], p[2], 6)); });
  })();

  // ============================================================
  //  Effekte
  // ============================================================
  (function () {
    var host = document.getElementById('crackgrid');
    for (var i = 0; i < 10; i++) {
      var box = el('div', 'crackbox');
      var stack = el('div', 'stack');
      stack.appendChild(B.flat(A, 'stone', 4));
      var ov = B.flat(A, 'crack_' + i, 4);
      ov.classList.add('overlay');
      stack.appendChild(ov);
      box.appendChild(stack);
      box.appendChild(el('label', null, 'Stufe ' + i));
      host.appendChild(box);
    }

    var g = document.getElementById('fxgrid');
    [['p_smoke', 'Rauch', 'Kern und Saum, damit er beim Schrumpfen weich bleibt'],
     ['p_flame', 'Flamme', 'gleiche Form, andere Rampe'],
     ['p_water', 'Spritzer', 'gleiche Form, andere Rampe'],
     ['p_blood', 'Treffer', 'gleiche Form, andere Rampe'],
     ['fx_spark', 'Trefferfunke', 'Sternform — liest vor jedem Untergrund'],
     ['fx_pickup', 'Aufsammeln', 'Ring, der nach außen läuft']
    ].forEach(function (p) { g.appendChild(B.tileCard(A, p[0], p[1], p[2], 6)); });
  })();

  // ============================================================
  //  Vorher / Nachher
  // ============================================================
  (function () {
    var host = document.getElementById('vsgrid');
    if (!ALT) { host.appendChild(el('p', 'dim', 'Bestandstexturen konnten nicht geladen werden.')); return; }
    [
      ['stone', 'stone', 'Stein',
       'Bestand: stufenloses Rauschen um ein Grundgrau, dazu 14 dunkle Einzelpixel — hunderte Töne, die sich zu einer Fläche mitteln. Vorschlag: exakt vier Graustufen mit der gemessenen Verteilung 7/28/46/20 und kurzen waagerechten Läufen. Gleicher Kontrast wie Vanilla (27), aber er bleibt erhalten.'],
      ['dirt', 'dirt', 'Erde',
       'Bestand: Grundbraun, ±13 % Zufallshelligkeit, 20 dunkle Sprenkel. Vorschlag: vier Brauntöne bei konstantem Farbton 25°, Kontrast 76 statt 30. Erde darf kräftig sein — das ist gemessen, nicht geschmacklich.'],
      ['grass_top', 'grass_top', 'Gras, Deckfläche',
       'Bestand: Grün plus Sprenkel, alles direkt in Farbe gezeichnet. Vorschlag: acht Graustufen, dann Tönung mit dem Farbwert aus der Vanilla-Colormap (146,188,88). Dieselbe Technik wie im Original — deshalb wirkt es satt und trotzdem ruhig.'],
      ['cobblestone', 'cobblestone', 'Bruchstein',
       'Bestand: acht Rechtecke in Zufallsgrau. Vorschlag: sechs Graustufen mit Ballungen und unregelmäßigen dunklen Adern. Vanilla zeichnet hier keine sauberen Steine mit Fase — die Zellen entstehen aus der Tonverteilung.'],
      ['sand', 'sand', 'Sand',
       'Bestand ist bereits nah dran. Vorschlag: fünf Töne mit Kontrast 21 statt stufenloser Körnung. Sand ist gemessen der flachste Block überhaupt — Muster oder Kräusel wären falsch.'],
      ['planks_oak', 'planks_oak', 'Bretter',
       'Bestand: Grundton plus Fuge alle 4 px plus verstreute Pixel. Vorschlag: je Brett drei Helligkeitsbänder mit eigener Tonliste, dazu die dunkle Fuge. Der Kontrast von 78 kommt aus der Struktur, nicht aus der Streuung.'],
      ['leaves_oak', 'leaves_oak', 'Laub',
       'Bestand: Grün mit Aufhellung/Abdunklung je Pixel und 8,5 % Löchern. Vorschlag: nur vier Graustufen bei Kontrast 87, dann Tönung. Die geringe Tonanzahl bei hohem Kontrast ist das, was Laub lesbar macht.'],
      ['log_oak', 'log_oak', 'Stamm',
       'Bestand: Grundton plus zufällige senkrechte Striche. Vorschlag: drei Helligkeitsbänder im 3-px-Takt plus durchgehende Furchen mit Lichtkante rechts.'],
      ['diamond_ore', 'diamond_ore', 'Diamanterz',
       'Bestand: fünf 1–2 px große Tupfen, ab acht Blöcken unsichtbar. Vorschlag: vier unregelmäßige Nester mit dunklem Saum und Glanz auf der Lichtseite, zusammen etwa 13 % der Fläche — der gemessene Anteil im Original.'],
      ['iron_pickaxe', 'iron_pickaxe', 'Eisenspitzhacke',
       'Der Vorlagenansatz war schon richtig. Korrigiert wurde der Kontrast: Vanilla-Werkzeuge messen 192, der Bestand liegt weit darunter. Glanz geht jetzt bis fast Weiß, die Kontur auf 24 herunter.'],
      ['coal', 'coal', 'Kohle',
       'Bestand: ein blob()-Klumpen mit Zufallsrand, die Silhouette wabert. Vorschlag: gezeichnetes Bruchstück mit Kanten und geschlossener Kontur.'],
      ['bone', 'bone', 'Knochen',
       'Vanilla misst hier Kontrast 131 bei nur fünf Tönen. Der Vorschlag übernimmt beides: wenige Töne, Glanz bis fast Weiß, symmetrische Form.'],
      ['mob_creeper_face', 'creeper_face', 'Creeper, Gesicht',
       'Bestand: Grundgrün plus 26 Zufallspixel. Vorschlag: quantisiertes Rauschen wie bei den Blöcken, damit die Haut zur Welt gehört, plus Gesichtsöffnungen mit Lichtkante oben.'],
      ['crack_5', 'crack_5', 'Bruchstadium 5',
       'Bestand: zufällig gestreute Diagonalstriche, der Fortschritt ist nicht ablesbar. Vorschlag: Sternfraktur, die aus der Blockmitte wächst.'],
      ['tall_grass', 'tall_grass', 'Grasbüschel',
       'Bestand: Halme mit zufälliger Höhe und Zufallsversatz. Vorschlag: gezeichnete Halme als Graustufe, dann dieselbe Tönung wie beim Grasblock — Bewuchs und Boden passen dadurch zwangsläufig zusammen.']
    ].forEach(function (v) {
      host.appendChild(B.versus(ALT, A, v[0], v[1], v[2], v[3]));
    });
  })();

  // ---- Sanftes Scrollen der Sprungmarken ----
  document.querySelectorAll('nav a').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var t = document.querySelector(a.getAttribute('href'));
      if (!t) return;
      e.preventDefault();
      t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

})();
