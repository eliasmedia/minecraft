/* ============================================================
   blocks.js  -  Block-Registry
   ============================================================ */
(function () {
  'use strict';

  var B = {};
  MC.Blocks = B;

  // Formen
  B.SHAPE_NONE = 0;    // Luft
  B.SHAPE_CUBE = 1;
  B.SHAPE_CROSS = 2;   // Pflanzen (X-Form)
  B.SHAPE_SLAB = 3;    // halbe Höhe
  B.SHAPE_TORCH = 4;
  B.SHAPE_LIQUID = 5;
  B.SHAPE_BED = 6;
  B.SHAPE_FARMLAND = 7;
  B.SHAPE_CROP = 8;
  B.SHAPE_STAIRS = 9;
  B.SHAPE_FENCE = 10;
  B.SHAPE_LADDER = 11;
  B.SHAPE_DOOR = 12;
  B.SHAPE_FIRE = 13;
  B.SHAPE_GATE = 14;   // Zauntor
  B.SHAPE_PORTAL = 15; // Portalfläche (dünne Ebene, Achse in Meta-Bit 0)
  B.SHAPE_PORTAL_FLAT = 16; // liegende Portalfläche (Endportal)
  B.SHAPE_EGG = 17;    // gestapelte Quader in Eiform (Drachenei)
  B.SHAPE_WIRE = 18;   // Redstoneleitung: flach auf dem Boden, Meta = Stärke 0..15
  B.SHAPE_PLATE = 19;  // Druckplatte
  B.SHAPE_BUTTON = 20; // Knopf an Wand oder Boden
  B.SHAPE_LEVER = 21;  // Hebel
  B.SHAPE_REPEATER = 22; // Verstärker
  B.SHAPE_ANVIL = 23;    // gestapelte Quader: Fuß, Taille, Hals, Bahn
  B.SHAPE_PISTON_HEAD = 25;  // Schubplatte plus Stange, gedreht nach Blickrichtung
  B.SHAPE_SIGN = 26;         // stehendes Schild: Pfosten und Brett
  B.SHAPE_SIGN_WALL = 27;    // Schild an der Wand
  B.SHAPE_FRAME = 28;        // Bilderrahmen an der Wand
  B.SHAPE_PAINTING = 29;     // Gemälde an der Wand
  B.SHAPE_CAULDRON = 30;     // Kessel: Wanne mit Wasserstand in Meta 0..3
  B.SHAPE_HOPPER = 31;       // Trichter: Rand, Trog und Auslauf
  B.SHAPE_RAIL = 32;         // Schiene: flach auf dem Boden, Meta = Verlauf

  // Kolbenkopf je Richtung: [Platte, Stange]. Die Platte sitzt am vorderen Ende
  // der Zelle, die Stange laeuft von dort zurueck zum Kolbenkoerper. Explizit
  // ausgeschrieben statt gedreht gerechnet - sechs Zeilen liest man nach, eine
  // Rotationsmatrix nicht.
  var P4 = 0.25, R0 = 0.375, R1 = 0.625;
  B.PISTON_HEAD_BOXES = [
    /* 0 = -Z */ [[0, 0, 0, 1, 1, P4], [R0, R0, P4, R1, R1, 1]],
    /* 1 = +X */ [[1 - P4, 0, 0, 1, 1, 1], [0, R0, R0, 1 - P4, R1, R1]],
    /* 2 = +Z */ [[0, 0, 1 - P4, 1, 1, 1], [R0, R0, 0, R1, R1, 1 - P4]],
    /* 3 = -X */ [[0, 0, 0, P4, 1, 1], [P4, R0, R0, 1, R1, R1]],
    /* 4 = +Y */ [[0, 1 - P4, 0, 1, 1, 1], [R0, 0, R0, R1, 1 - P4, R1]],
    /* 5 = -Y */ [[0, 0, 0, 1, P4, 1], [R0, P4, R0, R1, 1, R1]]
  ];

  // Silhouette des Ambosses in Sechzehnteln: x0,y0,z0,x1,y1,z1
  B.ANVIL_LAYERS = [
    [2, 0, 2, 14, 4, 14],      // Fuß
    [4, 4, 3, 12, 5, 13],      // Absatz
    [6, 5, 4, 10, 10, 12],     // Hals
    [3, 10, 0, 13, 16, 16]     // Bahn
  ].map(function (b) { return b.map(function (v) { return v / 16; }); });

  // Silhouette des Dracheneis in Sechzehnteln, von unten nach oben
  B.EGG_LAYERS = [
    [3, 0, 3, 13, 1, 13],
    [2, 1, 2, 14, 4, 14],
    [1, 4, 1, 15, 8, 15],
    [2, 8, 2, 14, 12, 14],
    [3, 12, 3, 13, 14, 13],
    [5, 14, 5, 11, 15, 11],
    [6, 15, 6, 10, 16, 10]
  ].map(function (b) { return b.map(function (v) { return v / 16; }); });

  B.byId = [];
  B.byName = {};
  B.list = [];

  var nextId = 1;

  function define(name, o) {
    o = o || {};
    var b = {
      id: o.id !== undefined ? o.id : nextId++,
      name: name,
      title: o.title || name,
      shape: o.shape === undefined ? B.SHAPE_CUBE : o.shape,
      solid: o.solid === undefined ? true : o.solid,
      opaque: o.opaque === undefined ? true : o.opaque,
      opacity: o.opacity,
      light: o.light || 0,
      hardness: o.hardness === undefined ? 1 : o.hardness,
      tool: o.tool || null,
      level: o.level || 0,
      drop: o.drop === undefined ? name : o.drop,
      dropCount: o.dropCount || 1,
      liquid: !!o.liquid,
      gravity: !!o.gravity,
      replaceable: !!o.replaceable,
      flammable: !!o.flammable,
      sound: o.sound || 'stone',
      alphaPass: !!o.alphaPass,   // im transparenten Pass rendern (Wasser/Glas/Eis)
      cutout: !!o.cutout,         // Alpha-Test im Opaque-Pass (Blätter, Pflanzen)
      tex: o.tex || name,
      collide: o.collide === undefined ? undefined : o.collide,
      item: o.item === undefined ? true : o.item,   // als Item im Inventar verfügbar
      stack: o.stack || 64,
      onUse: o.onUse || null,
      climbable: !!o.climbable,
      damage: o.damage || 0,
      slippery: o.slippery || 0,
      slow: o.slow || 0,           // bremst beim Darüberlaufen (Seelensand)
      bounce: o.bounce || 0,       // schleudert beim Landen nach oben (blaue Wolke)
      soft: !!o.soft,              // dämpft den Fallschaden (goldene Wolke)
      gravityUp: !!o.gravityUp,    // steigt auf statt zu fallen (Gravitit)
      portal: o.portal || null,    // Zieldimension einer Portalfläche
      stufen: o.stufen || 0,       // Wuchsstufen einer Pflanze (0 = wie Weizen)
      nass: !!o.nass,              // steht im Wasser: zählt fürs Rendern und
                                   // fürs Schwimmen als Wasser

      piston6: !!o.piston6,        // Kolbenfamilie: Blickrichtung in Meta-Bit 0..2
      // Dasselbe Meta, aber KEIN Kolben: Redstone erkennt einen Kolben an
      // piston6 und fuhr den Werfer darum aus, sobald Strom anlag.
      dir6: !!o.dir6,
      sticky: !!o.sticky,          // Klebkolben: zieht beim Einfahren mit
      group: o.group || 'natur'
    };
    if (b.opacity === undefined) b.opacity = b.opaque ? 15 : (b.liquid ? 2 : (b.shape === B.SHAPE_CROSS ? 0 : 1));
    if (b.collide === undefined) b.collide = b.solid;
    B.byId[b.id] = b;
    B.byName[name] = b;
    B.list.push(b);
    return b;
  }
  B.define = define;

  // ---------- LUFT ----------
  define('air', {
    id: 0, title: 'Luft', shape: B.SHAPE_NONE, solid: false, opaque: false,
    hardness: 0, drop: null, replaceable: true, item: false, opacity: 0
  });

  // ---------- Grundgestein / Erde ----------
  define('stone', { title: 'Stein', hardness: 1.5, tool: 'pickaxe', level: 1, drop: 'cobblestone', sound: 'stone', group: 'bau' });
  define('grass', { title: 'Grasblock', tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.6, tool: 'shovel', drop: 'dirt', sound: 'grass' });
  define('dirt', { title: 'Erde', hardness: 0.5, tool: 'shovel', sound: 'grass' });
  define('cobblestone', { title: 'Bruchstein', hardness: 2, tool: 'pickaxe', level: 1, sound: 'stone', group: 'bau' });
  define('bedrock', { title: 'Grundgestein', hardness: -1, drop: null, sound: 'stone', item: false });
  define('sand', { title: 'Sand', hardness: 0.5, tool: 'shovel', gravity: true, sound: 'sand' });
  define('gravel', { title: 'Kies', hardness: 0.6, tool: 'shovel', gravity: true, sound: 'gravel' });
  define('clay', { title: 'Ton', hardness: 0.6, tool: 'shovel', drop: 'clay_ball', dropCount: 4, sound: 'gravel' });
  define('snow_block', { title: 'Schneeblock', hardness: 0.2, tool: 'shovel', sound: 'sand' });
  define('ice', { title: 'Eis', hardness: 0.5, tool: 'pickaxe', opaque: false, alphaPass: true, drop: null, sound: 'glass', slippery: 0.98 });

  // ---------- Erze ----------
  define('coal_ore', { title: 'Kohleerz', hardness: 3, tool: 'pickaxe', level: 1, drop: 'coal', group: 'natur' });
  define('iron_ore', { title: 'Eisenerz', hardness: 3, tool: 'pickaxe', level: 2 });
  define('gold_ore', { title: 'Golderz', hardness: 3, tool: 'pickaxe', level: 3 });
  define('diamond_ore', { title: 'Diamanterz', hardness: 3, tool: 'pickaxe', level: 3, drop: 'diamond' });
  define('redstone_ore', { title: 'Redstone-Erz', hardness: 3, tool: 'pickaxe', level: 3, drop: 'redstone', dropCount: 4, light: 0 });
  define('lapis_ore', { title: 'Lapislazuli-Erz', hardness: 3, tool: 'pickaxe', level: 2, drop: 'lapis', dropCount: 4 });
  define('emerald_ore', { title: 'Smaragderz', hardness: 3, tool: 'pickaxe', level: 3, drop: 'emerald' });

  // ---------- Flüssigkeiten ----------
  define('water', {
    title: 'Wasser', shape: B.SHAPE_LIQUID, solid: false, opaque: false, liquid: true,
    hardness: -1, drop: null, replaceable: true, alphaPass: true, item: false, opacity: 2, sound: 'grass'
  });
  define('lava', {
    title: 'Lava', shape: B.SHAPE_LIQUID, solid: false, opaque: false, liquid: true, light: 15,
    hardness: -1, drop: null, replaceable: true, alphaPass: false, item: false, opacity: 1, damage: 4, sound: 'grass'
  });

  // ---------- Holz ----------
  define('log_oak', { title: 'Eichenstamm', tex: { top: 'log_oak_top', bottom: 'log_oak_top', side: 'log_oak' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
  define('log_birch', { title: 'Birkenstamm', tex: { top: 'log_birch_top', bottom: 'log_birch_top', side: 'log_birch' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
  define('log_spruce', { title: 'Fichtenstamm', tex: { top: 'log_spruce_top', bottom: 'log_spruce_top', side: 'log_spruce' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
  define('planks_oak', { title: 'Eichenbretter', hardness: 2, tool: 'axe', sound: 'wood', flammable: true, group: 'bau' });
  define('planks_birch', { title: 'Birkenbretter', hardness: 2, tool: 'axe', sound: 'wood', flammable: true, group: 'bau' });
  define('planks_spruce', { title: 'Fichtenbretter', hardness: 2, tool: 'axe', sound: 'wood', flammable: true, group: 'bau' });
  define('leaves_oak', { title: 'Eichenlaub', hardness: 0.2, tool: 'shears', opaque: false, cutout: true, sound: 'grass', drop: 'special_leaves_oak', flammable: true });
  define('leaves_birch', { title: 'Birkenlaub', hardness: 0.2, tool: 'shears', opaque: false, cutout: true, sound: 'grass', drop: 'special_leaves_birch', flammable: true });
  define('leaves_spruce', { title: 'Fichtenlaub', hardness: 0.2, tool: 'shears', opaque: false, cutout: true, sound: 'grass', drop: 'special_leaves_spruce', flammable: true });

  // ---------- Bau ----------
  define('glass', { title: 'Glas', hardness: 0.3, tool: 'pickaxe', opaque: false, alphaPass: true, drop: null, sound: 'glass', group: 'bau' });
  define('sandstone', { title: 'Sandstein', tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone' }, hardness: 0.8, tool: 'pickaxe', level: 1, group: 'bau' });
  define('brick_block', { title: 'Ziegel', hardness: 2, tool: 'pickaxe', level: 1, group: 'bau' });
  define('stone_bricks', { title: 'Steinziegel', hardness: 1.5, tool: 'pickaxe', level: 1, group: 'bau' });
  define('mossy_cobblestone', { title: 'Moosiger Bruchstein', hardness: 2, tool: 'pickaxe', level: 1, group: 'bau' });
  define('obsidian', { title: 'Obsidian', hardness: 50, tool: 'pickaxe', level: 4, group: 'bau' });
  define('glowstone', { title: 'Glowstone', hardness: 0.3, light: 15, drop: 'glowstone_dust', dropCount: 3, sound: 'glass', group: 'bau' });
  define('bookshelf', { title: 'Bücherregal', tex: { top: 'planks_oak', bottom: 'planks_oak', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood', drop: 'book', dropCount: 3, group: 'bau' });
  define('iron_block', { title: 'Eisenblock', hardness: 5, tool: 'pickaxe', level: 2, group: 'bau' });
  define('gold_block', { title: 'Goldblock', hardness: 3, tool: 'pickaxe', level: 3, group: 'bau' });
  define('diamond_block', { title: 'Diamantblock', hardness: 5, tool: 'pickaxe', level: 3, group: 'bau' });
  define('coal_block', { title: 'Kohleblock', hardness: 5, tool: 'pickaxe', level: 1, group: 'bau' });
  define('lapis_block', { title: 'Lapisblock', hardness: 3, tool: 'pickaxe', level: 2, group: 'bau' });
  define('emerald_block', { title: 'Smaragdblock', hardness: 5, tool: 'pickaxe', level: 3, group: 'bau' });

  // ---------- Wolle (16 Farben) ----------
  B.WOOL_COLORS = [
    ['white', 'Weiß'], ['orange', 'Orange'], ['magenta', 'Magenta'], ['light_blue', 'Hellblau'],
    ['yellow', 'Gelb'], ['lime', 'Hellgrün'], ['pink', 'Rosa'], ['gray', 'Grau'],
    ['light_gray', 'Hellgrau'], ['cyan', 'Türkis'], ['purple', 'Violett'], ['blue', 'Blau'],
    ['brown', 'Braun'], ['green', 'Grün'], ['red', 'Rot'], ['black', 'Schwarz']
  ];
  B.WOOL_COLORS.forEach(function (c) {
    define('wool_' + c[0], { title: 'Wolle (' + c[1] + ')', hardness: 0.8, tool: 'shears', sound: 'cloth', flammable: true, group: 'bau' });
  });

  // ---------- Funktionsblöcke ----------
  define('torch', {
    title: 'Fackel', shape: B.SHAPE_TORCH, solid: false, opaque: false, light: 14, hardness: 0,
    cutout: true, sound: 'wood', group: 'werkzeug', opacity: 0
  });
  define('crafting_table', {
    title: 'Werkbank', tex: { top: 'crafting_table_top', bottom: 'planks_oak', side: 'crafting_table_side', front: 'crafting_table_front' },
    hardness: 2.5, tool: 'axe', sound: 'wood', group: 'werkzeug'
  });
  define('furnace', {
    title: 'Ofen', tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' },
    hardness: 3.5, tool: 'pickaxe', level: 1, group: 'werkzeug'
  });
  define('furnace_lit', {
    title: 'Ofen (an)', tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit' },
    hardness: 3.5, tool: 'pickaxe', level: 1, light: 13, drop: 'furnace', item: false
  });
  define('chest', {
    title: 'Truhe', tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front' },
    hardness: 2.5, tool: 'axe', sound: 'wood', group: 'werkzeug'
  });
  define('tnt', {
    title: 'TNT', tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' },
    hardness: 0, sound: 'grass', group: 'werkzeug'
  });
  // Amboss. Wie im Original fällt er, wenn ihm der Boden abhandenkommt, und
  // nutzt sich beim Arbeiten ab – drei Zustände, alle lassen einen Amboss fallen.
  ['', '_chipped', '_damaged'].forEach(function (suf, i) {
    define('anvil' + suf, {
      title: 'Amboss' + ['', ' (angeschlagen)', ' (beschädigt)'][i],
      shape: B.SHAPE_ANVIL, opaque: false,
      tex: { top: 'anvil_top' + (i ? '_' + i : ''), bottom: 'anvil_side', side: 'anvil_side' },
      hardness: 5, tool: 'pickaxe', level: 1, gravity: true, sound: 'stone',
      drop: 'anvil', item: i === 0, group: 'werkzeug'
    });
  });
  // ---------- Kolben ----------
  // Sechs Richtungen statt vier, darum ein eigenes Kennzeichen: die
  // Texturauswahl im Mesher liest die Blickrichtung dann aus Meta-Bit 0..2.
  B.DIR6 = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
  B.FACE6 = [5, 0, 4, 1, 2, 3];     // Richtung -> Flächennummer im Mesher

  define('piston', {
    title: 'Kolben', piston6: true, sticky: false,
    tex: { front: 'piston_face', back: 'piston_back', side: 'piston_side', top: 'piston_side' },
    hardness: 1.5, sound: 'stone', group: 'redstone'
  });
  define('sticky_piston', {
    title: 'Klebkolben', piston6: true, sticky: true,
    tex: { front: 'piston_face_sticky', back: 'piston_back', side: 'piston_side', top: 'piston_side' },
    hardness: 1.5, sound: 'stone', group: 'redstone'
  });
  // Der ausgefahrene Körper: sieht vorne offen aus, weil der Kopf davorsitzt
  define('piston_ext', {
    title: 'Kolben (ausgefahren)', piston6: true,
    tex: { front: 'piston_inner', back: 'piston_back', side: 'piston_side', top: 'piston_side' },
    hardness: 1.5, sound: 'stone', drop: 'piston', item: false
  });
  define('sticky_piston_ext', {
    title: 'Klebkolben (ausgefahren)', piston6: true, sticky: true,
    tex: { front: 'piston_inner', back: 'piston_back', side: 'piston_side', top: 'piston_side' },
    hardness: 1.5, sound: 'stone', drop: 'sticky_piston', item: false
  });
  // Der Kopf: vorne die Schubplatte, dahinter die Stange zum Koerper.
  ['piston_head', 'piston_head_sticky'].forEach(function (n) {
    define(n, {
      title: 'Kolbenkopf', shape: B.SHAPE_PISTON_HEAD, piston6: true, opaque: false,
      tex: { front: n === 'piston_head' ? 'piston_face' : 'piston_face_sticky',
             back: 'piston_arm', side: 'piston_arm', top: 'piston_arm' },
      hardness: 1.5, sound: 'stone', drop: null, item: false
    });
  });

  // Braustand. Wie der Amboss aus gestapelten Quadern: Fuß, Stange, Ausleger.
  B.SHAPE_STAND = 24;
  B.STAND_LAYERS = [
    [2, 0, 2, 14, 2, 14],
    [7, 2, 7, 9, 14, 9],
    [3, 5, 6, 13, 7, 10],
    [6, 5, 3, 10, 7, 13]
  ].map(function (b) { return b.map(function (v) { return v / 16; }); });
  define('brewing_stand', {
    title: 'Braustand', shape: B.SHAPE_STAND, opaque: false, light: 1,
    tex: { top: 'brewing_stand_top', bottom: 'brewing_stand_base', side: 'brewing_stand_side' },
    hardness: 0.5, tool: 'pickaxe', sound: 'stone', group: 'werkzeug'
  });
  // Nethergewächs wächst nur auf Seelensand, dafür ohne Licht
  define('nether_wart', {
    title: 'Nethergewächs', shape: B.SHAPE_CROP, tex: { stage: 'nether_wart_stage' }, stufen: 4,
    solid: false, opaque: false, cutout: true, collide: false,
    hardness: 0, sound: 'grass', drop: 'special_wart', item: false, group: 'natur'
  });

  // Beobachter: merkt sich, was vor ihm liegt, und gibt einen kurzen Impuls
  // nach hinten ab, sobald sich das ändert. Damit lässt sich automatisieren,
  // ohne einen Fackeltaktgeber danebenzustellen.
  define('observer', {
    title: 'Beobachter', piston6: true,
    tex: { front: 'observer_face', back: 'observer_back', side: 'observer_side', top: 'observer_side' },
    hardness: 3, tool: 'pickaxe', sound: 'stone', group: 'redstone'
  });
  define('observer_lit', {
    title: 'Beobachter (an)', piston6: true,
    tex: { front: 'observer_face', back: 'observer_back_lit', side: 'observer_side', top: 'observer_side' },
    hardness: 3, tool: 'pickaxe', sound: 'stone', drop: 'observer', item: false
  });

  define('enchanting_table', {
    title: 'Zaubertisch',
    tex: { top: 'enchanting_table_top', bottom: 'obsidian', side: 'enchanting_table_side' },
    hardness: 5, tool: 'pickaxe', level: 1, light: 7, group: 'werkzeug'
  });

  // ---------- Pflanzen ----------
  define('cactus', {
    title: 'Kaktus', tex: { top: 'cactus_top', bottom: 'cactus_bottom', side: 'cactus_side' },
    hardness: 0.4, opaque: false, cutout: true, sound: 'cloth', damage: 1
  });
  define('pumpkin', {
    title: 'Kürbis', tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_face' },
    hardness: 1, tool: 'axe', sound: 'wood'
  });
  ['flower_red', 'flower_yellow', 'flower_blue', 'tall_grass', 'dead_bush', 'mushroom_red', 'mushroom_brown',
   'sapling_oak', 'sapling_birch', 'sapling_spruce'].forEach(function (n) {
    var titles = {
      flower_red: 'Mohn', flower_yellow: 'Löwenzahn', flower_blue: 'Kornblume', tall_grass: 'Hohes Gras',
      dead_bush: 'Toter Busch', mushroom_red: 'Roter Pilz', mushroom_brown: 'Brauner Pilz',
      sapling_oak: 'Eichensetzling', sapling_birch: 'Birkensetzling', sapling_spruce: 'Fichtensetzling'
    };
    define(n, {
      title: titles[n], shape: B.SHAPE_CROSS, solid: false, opaque: false, cutout: true, collide: false,
      hardness: 0, sound: 'grass', replaceable: (n === 'tall_grass'), flammable: true,
      drop: n === 'tall_grass' ? 'special_grass' : n, group: 'natur'
    });
  });
  // ---------- Meer ----------
  // Alles, was den Meeresgrund ausmacht. Die Pflanzen stehen im Wasser, sind
  // also durchsichtig und ohne Kollision – wie Gras, nur nass.
  ['kelp', 'seagrass'].forEach(function (n) {
    define(n, {
      title: n === 'kelp' ? 'Seetang' : 'Seegras',
      shape: B.SHAPE_CROSS, solid: false, opaque: false, cutout: true, collide: false,
      nass: true, hardness: 0, sound: 'grass', drop: n, group: 'natur'
      // replaceable bleibt aus: Wasser reißt sie nicht weg, es füllt sie auf
    });
  });
  B.CORAL_COLORS = [['tube', 'Röhren', [58, 84, 208]], ['brain', 'Hirn', [206, 84, 154]],
                    ['bubble', 'Blasen', [166, 42, 176]], ['fire', 'Feuer', [204, 48, 56]],
                    ['horn', 'Horn', [218, 196, 60]]];
  B.CORAL_COLORS.forEach(function (c) {
    define('coral_' + c[0], { title: c[1] + 'koralle', hardness: 1.5, tool: 'pickaxe', sound: 'stone', group: 'natur' });
    define('coral_fan_' + c[0], {
      title: c[1] + 'korallenfächer', shape: B.SHAPE_CROSS, solid: false, opaque: false,
      cutout: true, collide: false, nass: true, hardness: 0, sound: 'grass', group: 'natur'
    });
  });
  // Der Schwamm saugt beim Setzen das Wasser um sich herum weg
  define('sponge', { title: 'Schwamm', hardness: 0.6, sound: 'grass', group: 'natur' });
  define('sponge_wet', { title: 'Nasser Schwamm', hardness: 0.6, sound: 'grass', drop: 'sponge_wet', group: 'natur' });
  define('prismarine', { title: 'Prismarin', hardness: 1.5, tool: 'pickaxe', level: 1, sound: 'stone', group: 'bau' });
  define('prismarine_bricks', { title: 'Prismarinziegel', hardness: 1.5, tool: 'pickaxe', level: 1, sound: 'stone', group: 'bau' });
  define('dark_prismarine', { title: 'Dunkler Prismarin', hardness: 1.5, tool: 'pickaxe', level: 1, sound: 'stone', group: 'bau' });
  define('sea_lantern', { title: 'Seelaterne', hardness: 0.3, light: 15, sound: 'glass', drop: 'prismarine_crystals', dropCount: 3, group: 'bau' });

  define('sugar_cane', {
    title: 'Zuckerrohr', shape: B.SHAPE_CROSS, solid: false, opaque: false, cutout: true, collide: false,
    hardness: 0, sound: 'grass', drop: 'sugar_cane_item', group: 'natur'
  });
  // Spinnwebe: bremst, wer hindurchgeht, und gibt Faden. Nur in verlassenen Minen.
  define('cobweb', {
    title: 'Spinnwebe', shape: B.SHAPE_CROSS, solid: false, opaque: false, cutout: true, collide: false,
    hardness: 4, tool: 'shears', drop: 'string', sound: 'grass', group: 'natur'
  });
  // Befehlsblöcke. Drei Sorten wie im Original, unterscheidbar an der Farbe:
  // Impuls führt einmal aus, Wiederholend in jedem Takt, Kette hängt am
  // Vorgänger. Unzerstörbar wie Grundgestein und nur im Kreativmenü zu haben.
  B.BEFEHLSBLOCK = ['command_block', 'command_block_repeat', 'command_block_chain'];
  [['command_block', 'Befehlsblock'],
   ['command_block_repeat', 'Wiederholender Befehlsblock'],
   ['command_block_chain', 'Ketten-Befehlsblock']].forEach(function (c) {
    define(c[0], {
      title: c[1], hardness: -1, drop: null, sound: 'stone', group: 'werkzeug'
    });
  });

  // Monsterspawner: Gitterkäfig, in dem eine kleine Figur kreist. Er lässt sich
  // abbauen, gibt aber nichts her – wie im Original.
  define('spawner', {
    title: 'Monsterspawner', opaque: false, cutout: true,
    hardness: 5, tool: 'pickaxe', level: 1, drop: null, sound: 'stone', item: false
  });

  // ---------- Ackerbau ----------
  define('farmland', {
    title: 'Ackerboden', shape: B.SHAPE_FARMLAND, tex: { top: 'farmland', bottom: 'dirt', side: 'dirt' },
    hardness: 0.6, tool: 'shovel', drop: 'dirt', sound: 'grass', item: false, opaque: false
  });
  define('wheat', {
    title: 'Weizen', shape: B.SHAPE_CROP, solid: false, opaque: false, cutout: true, collide: false,
    hardness: 0, sound: 'grass', drop: 'special_wheat', item: false
  });

  // ---------- Stufen ----------
  [['slab_stone', 'Steinstufe', 'stone'], ['slab_cobblestone', 'Bruchsteinstufe', 'cobblestone'],
   ['slab_planks_oak', 'Eichenholzstufe', 'planks_oak'],
   ['slab_planks_birch', 'Birkenholzstufe', 'planks_birch'],
   ['slab_planks_spruce', 'Fichtenholzstufe', 'planks_spruce'],
   ['slab_sandstone', 'Sandsteinstufe', 'sandstone'],
   ['slab_brick', 'Ziegelstufe', 'brick_block'], ['slab_stone_bricks', 'Steinziegelstufe', 'stone_bricks']
  ].forEach(function (s) {
    var src = B.byName[s[2]];
    define(s[0], {
      title: s[1], shape: B.SHAPE_SLAB, opaque: false, hardness: src.hardness, tool: src.tool,
      level: src.level, sound: src.sound, tex: src.tex, group: 'bau'
    });
  });

  // ---------- Treppen ----------
  [['stairs_oak', 'Eichenholztreppe', 'planks_oak'], ['stairs_birch', 'Birkenholztreppe', 'planks_birch'],
   ['stairs_spruce', 'Fichtenholztreppe', 'planks_spruce'], ['stairs_cobblestone', 'Bruchsteintreppe', 'cobblestone'],
   ['stairs_stone_bricks', 'Steinziegeltreppe', 'stone_bricks'], ['stairs_sandstone', 'Sandsteintreppe', 'sandstone'],
   ['stairs_brick', 'Ziegeltreppe', 'brick_block']
  ].forEach(function (s) {
    var src = B.byName[s[2]];
    define(s[0], {
      title: s[1], shape: B.SHAPE_STAIRS, opaque: false, hardness: src.hardness, tool: src.tool,
      level: src.level, sound: src.sound, tex: src.tex, flammable: src.flammable, group: 'bau'
    });
  });

  // ---------- Zäune ----------
  [['fence_oak', 'Eichenzaun', 'planks_oak'], ['fence_birch', 'Birkenzaun', 'planks_birch'],
   ['fence_spruce', 'Fichtenzaun', 'planks_spruce']
  ].forEach(function (s) {
    var src = B.byName[s[2]];
    define(s[0], {
      title: s[1], shape: B.SHAPE_FENCE, opaque: false, hardness: 2, tool: 'axe',
      sound: 'wood', tex: src.tex, flammable: true, group: 'bau'
    });
  });

  // ---------- Zauntore ----------
  // Meta: Bits 0-1 = Richtung, in die die geschlossene Flanke zeigt, Bit 2 = offen
  [['gate_oak', 'Eichenzauntor', 'planks_oak'], ['gate_birch', 'Birkenzauntor', 'planks_birch'],
   ['gate_spruce', 'Fichtenzauntor', 'planks_spruce']
  ].forEach(function (s) {
    var src = B.byName[s[2]];
    define(s[0], {
      title: s[1], shape: B.SHAPE_GATE, opaque: false, hardness: 2, tool: 'axe',
      sound: 'wood', tex: src.tex, flammable: true, opacity: 0, group: 'bau'
    });
  });

  // ---------- Leiter ----------
  define('ladder', {
    title: 'Leiter', shape: B.SHAPE_LADDER, opaque: false, cutout: true, solid: false, collide: false,
    hardness: 0.4, tool: 'axe', sound: 'wood', climbable: true, opacity: 0, group: 'bau'
  });

  // ---------- Türen ----------
  define('door_oak', {
    title: 'Holztür', shape: B.SHAPE_DOOR, opaque: false, cutout: true, hardness: 3, tool: 'axe',
    sound: 'wood', tex: { top: 'door_oak_upper', bottom: 'door_oak_lower', side: 'door_oak_lower' },
    item: false, opacity: 0, group: 'bau'
  });
  define('door_iron', {
    title: 'Eisentür', shape: B.SHAPE_DOOR, opaque: false, cutout: true, hardness: 5, tool: 'pickaxe', level: 1,
    sound: 'stone', tex: { top: 'door_iron_upper', bottom: 'door_iron_lower', side: 'door_iron_lower' },
    item: false, opacity: 0, group: 'bau'
  });

  // ---------- Feuer ----------
  define('fire', {
    title: 'Feuer', shape: B.SHAPE_FIRE, solid: false, collide: false, opaque: false, cutout: true,
    light: 15, hardness: 0, drop: null, replaceable: true, item: false, opacity: 0, damage: 2,
    tex: 'fire_0'
  });

  // ============================================================
  //  NETHER
  // ============================================================
  define('netherrack', { title: 'Netherrack', hardness: 0.4, tool: 'pickaxe', sound: 'stone', flammable: true, group: 'natur' });
  define('soul_sand', { title: 'Seelensand', hardness: 0.5, tool: 'shovel', sound: 'sand', slow: 0.42, group: 'natur' });
  define('quartz_ore', { title: 'Netherquarzerz', hardness: 3, tool: 'pickaxe', level: 1, drop: 'quartz', sound: 'stone', group: 'natur' });
  define('nether_bricks', { title: 'Netherziegel', hardness: 2, tool: 'pickaxe', level: 1, sound: 'stone', group: 'bau' });

  // ---------- Netherbiome ----------
  // Seelenboden traegt die Talsohle, Nylium die beiden Pilzwaelder, Basalt und
  // Schwarzstein das Deltagebiet. Alles bewusst als eigene Bloecke: ein Biom,
  // das nur andere Streugroessen hat, sieht man nicht.
  define('soul_soil', { title: 'Seelenerde', hardness: 0.5, tool: 'shovel', sound: 'sand', slow: 0.3, group: 'natur' });
  define('bone_block', { title: 'Knochenblock', tex: { top: 'bone_block_top', bottom: 'bone_block_top', side: 'bone_block' }, hardness: 2, tool: 'pickaxe', sound: 'stone', group: 'bau' });
  define('basalt', { title: 'Basalt', tex: { top: 'basalt_top', bottom: 'basalt_top', side: 'basalt' }, hardness: 1.25, tool: 'pickaxe', level: 1, sound: 'stone', group: 'bau' });
  define('blackstone', { title: 'Schwarzstein', hardness: 1.5, tool: 'pickaxe', level: 1, drop: 'blackstone', sound: 'stone', group: 'bau' });
  define('crimson_nylium', { title: 'Karmesinnylium', tex: { top: 'crimson_nylium', bottom: 'netherrack', side: 'crimson_nylium_side' }, hardness: 0.4, tool: 'pickaxe', drop: 'netherrack', sound: 'stone', group: 'natur' });
  define('warped_nylium', { title: 'Wirrnylium', tex: { top: 'warped_nylium', bottom: 'netherrack', side: 'warped_nylium_side' }, hardness: 0.4, tool: 'pickaxe', drop: 'netherrack', sound: 'stone', group: 'natur' });
  define('crimson_stem', { title: 'Karmesinstamm', tex: { top: 'crimson_stem_top', bottom: 'crimson_stem_top', side: 'crimson_stem' }, hardness: 2, tool: 'axe', sound: 'wood', group: 'natur' });
  define('warped_stem', { title: 'Wirrstamm', tex: { top: 'warped_stem_top', bottom: 'warped_stem_top', side: 'warped_stem' }, hardness: 2, tool: 'axe', sound: 'wood', group: 'natur' });
  define('crimson_planks', { title: 'Karmesinbretter', hardness: 2, tool: 'axe', sound: 'wood', group: 'bau' });
  define('warped_planks', { title: 'Wirrbretter', hardness: 2, tool: 'axe', sound: 'wood', group: 'bau' });
  define('nether_wart_block', { title: 'Netherwarzenblock', hardness: 1, sound: 'grass', group: 'natur' });
  define('warped_wart_block', { title: 'Wirrwarzenblock', hardness: 1, sound: 'grass', group: 'natur' });
  // Leuchtpilz: die einzige Lichtquelle in den Pilzwaeldern, und die macht sie
  define('shroomlight', { title: 'Leuchtpilz', hardness: 1, light: 15, sound: 'grass', group: 'natur' });
  ['crimson_roots', 'warped_roots'].forEach(function (n) {
    define(n, {
      title: n === 'crimson_roots' ? 'Karmesinwurzeln' : 'Wirrwurzeln',
      shape: B.SHAPE_CROSS, solid: false, opaque: false, cutout: true, collide: false,
      hardness: 0, sound: 'grass', group: 'natur'
    });
  });
  define('magma_block', { title: 'Magmablock', hardness: 0.5, tool: 'pickaxe', light: 3, damage: 1, sound: 'stone', group: 'natur' });
  define('quartz_block', { title: 'Quarzblock', hardness: 0.8, tool: 'pickaxe', sound: 'stone', group: 'bau' });

  // ============================================================
  //  AETHER
  // ============================================================
  define('aether_grass', {
    title: 'Aethergras', tex: { top: 'aether_grass_top', bottom: 'aether_dirt', side: 'aether_grass_side' },
    hardness: 0.6, tool: 'shovel', drop: 'aether_dirt', sound: 'grass', group: 'natur'
  });
  define('aether_dirt', { title: 'Aethererde', hardness: 0.5, tool: 'shovel', sound: 'grass', group: 'natur' });
  define('holystone', { title: 'Heiligstein', hardness: 1.2, tool: 'pickaxe', sound: 'stone', group: 'bau' });
  define('mossy_holystone', { title: 'Moosiger Heiligstein', hardness: 1.2, tool: 'pickaxe', sound: 'stone', group: 'bau' });
  define('holystone_bricks', { title: 'Heiligsteinziegel', hardness: 1.5, tool: 'pickaxe', sound: 'stone', group: 'bau' });
  // Quicksoil ist spiegelglatt – man rutscht darüber hinweg
  define('quicksoil', { title: 'Flugsand', hardness: 0.5, tool: 'shovel', sound: 'sand', slippery: 0.995, group: 'natur' });
  define('icestone', { title: 'Eisstein', hardness: 1.5, tool: 'pickaxe', level: 1, sound: 'stone', group: 'natur' });
  // ---------- Aetherbiome ----------
  define('frosted_grass', {
    title: 'Frostgras', tex: { top: 'frosted_grass_top', bottom: 'aether_dirt', side: 'frosted_grass_side' },
    hardness: 0.6, tool: 'shovel', drop: 'aether_dirt', sound: 'grass', group: 'natur'
  });
  define('leaves_crystal', {
    title: 'Kristalllaub', hardness: 0.2, opaque: false, cutout: true, alphaPass: false,
    drop: null, sound: 'grass', group: 'natur'
  });
  define('ambrosium_ore', { title: 'Ambrosiumerz', hardness: 2, tool: 'pickaxe', light: 4, drop: 'ambrosium_shard', dropCount: 2, sound: 'stone', group: 'natur' });
  // Zanit gehört zum Nether – dort ist es die einzige Rüstungsstufe
  define('zanite_ore', { title: 'Zaniterz', hardness: 3, tool: 'pickaxe', level: 2, drop: 'zanite_gemstone', dropCount: 2, sound: 'stone', group: 'natur' });
  // Gravitit fällt nicht, es steigt auf
  define('gravitite_ore', { title: 'Gravititerz', hardness: 3, tool: 'pickaxe', level: 3, drop: 'gravitite', gravityUp: true, sound: 'stone', group: 'natur' });

  define('log_skyroot', { title: 'Himmelswurzelstamm', tex: { top: 'log_skyroot_top', bottom: 'log_skyroot_top', side: 'log_skyroot' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
  define('planks_skyroot', { title: 'Himmelswurzelbretter', hardness: 2, tool: 'axe', sound: 'wood', flammable: true, group: 'bau' });
  define('leaves_skyroot', { title: 'Himmelswurzellaub', hardness: 0.2, tool: 'shears', opaque: false, cutout: true, sound: 'grass', drop: 'special_leaves_skyroot', flammable: true });
  define('log_golden_oak', { title: 'Goldeichenstamm', tex: { top: 'log_golden_oak_top', bottom: 'log_golden_oak_top', side: 'log_golden_oak' }, hardness: 2, tool: 'axe', sound: 'wood', flammable: true });
  define('leaves_golden_oak', { title: 'Goldeichenlaub', hardness: 0.2, tool: 'shears', opaque: false, cutout: true, sound: 'grass', drop: 'special_leaves_golden_oak', flammable: true });

  // Aerclouds: begehbare Wolken. Blau schleudert nach oben, Gold dämpft den Fall.
  define('aercloud', { title: 'Wolkenblock', hardness: 0.2, opaque: false, alphaPass: true, sound: 'cloth', group: 'bau' });
  define('aercloud_blue', { title: 'Blauer Wolkenblock', hardness: 0.2, opaque: false, alphaPass: true, sound: 'cloth', bounce: 16, group: 'bau' });
  define('aercloud_golden', { title: 'Goldener Wolkenblock', hardness: 0.2, opaque: false, alphaPass: true, sound: 'cloth', soft: true, group: 'bau' });

  define('aether_flower', {
    title: 'Aetherblume', shape: B.SHAPE_CROSS, solid: false, opaque: false, cutout: true, collide: false,
    hardness: 0, sound: 'grass', group: 'natur'
  });
  define('blueberry_bush', {
    title: 'Blaubeerstrauch', shape: B.SHAPE_CROSS, solid: false, opaque: false, cutout: true, collide: false,
    hardness: 0, sound: 'grass', drop: 'blueberries', dropCount: 2, group: 'natur'
  });

  // Stufen, Treppen, Zäune und Tore für die neuen Baustoffe. Die Listen weiter
  // oben liefen, bevor es diese Blöcke gab – darum hier nachgezogen.
  [['slab_planks_skyroot', 'Himmelswurzelstufe', 'planks_skyroot'],
   ['slab_holystone', 'Heiligsteinstufe', 'holystone'],
   ['slab_nether_bricks', 'Netherziegelstufe', 'nether_bricks'],
   ['slab_blackstone', 'Schwarzsteinstufe', 'blackstone'],
   ['slab_basalt', 'Basaltstufe', 'basalt']
  ].forEach(function (s) {
    var src = B.byName[s[2]];
    define(s[0], {
      title: s[1], shape: B.SHAPE_SLAB, opaque: false, hardness: src.hardness, tool: src.tool,
      level: src.level, sound: src.sound, tex: src.tex, flammable: src.flammable, group: 'bau'
    });
  });
  [['stairs_skyroot', 'Himmelswurzeltreppe', 'planks_skyroot'],
   ['stairs_holystone', 'Heiligsteintreppe', 'holystone'],
   ['stairs_nether_bricks', 'Netherziegeltreppe', 'nether_bricks'],
   ['stairs_blackstone', 'Schwarzsteintreppe', 'blackstone']
  ].forEach(function (s) {
    var src = B.byName[s[2]];
    define(s[0], {
      title: s[1], shape: B.SHAPE_STAIRS, opaque: false, hardness: src.hardness, tool: src.tool,
      level: src.level, sound: src.sound, tex: src.tex, flammable: src.flammable, group: 'bau'
    });
  });
  define('fence_skyroot', {
    title: 'Himmelswurzelzaun', shape: B.SHAPE_FENCE, opaque: false, hardness: 2, tool: 'axe',
    sound: 'wood', tex: B.byName['planks_skyroot'].tex, flammable: true, group: 'bau'
  });
  define('gate_skyroot', {
    title: 'Himmelswurzelzauntor', shape: B.SHAPE_GATE, opaque: false, hardness: 2, tool: 'axe',
    sound: 'wood', tex: B.byName['planks_skyroot'].tex, flammable: true, opacity: 0, group: 'bau'
  });

  // ---------- Portale ----------
  define('portal_nether', {
    title: 'Netherportal', shape: B.SHAPE_PORTAL, solid: false, collide: false, opaque: false,
    alphaPass: true, light: 11, hardness: -1, drop: null, item: false, opacity: 0, portal: 'nether'
  });
  define('portal_aether', {
    title: 'Aetherportal', shape: B.SHAPE_PORTAL, solid: false, collide: false, opaque: false,
    alphaPass: true, light: 11, hardness: -1, drop: null, item: false, opacity: 0, portal: 'aether'
  });

  // ============================================================
  //  DAS ENDE
  // ============================================================
  define('end_stone', { title: 'Endstein', hardness: 3, tool: 'pickaxe', level: 1, sound: 'stone', group: 'bau' });
  define('end_stone_bricks', { title: 'Endsteinziegel', hardness: 3, tool: 'pickaxe', level: 1, sound: 'stone', group: 'bau' });
  // Der Rahmen ist so unzerstörbar wie im Original – wer ihn abbauen könnte,
  // könnte das einzige Endportal der Welt versehentlich zerlegen. Im
  // Kreativmenü liegt er trotzdem, damit man sich ein eigenes Portal bauen kann.
  define('end_portal_frame', {
    title: 'Endportalrahmen', hardness: -1, drop: null, light: 1, sound: 'stone', group: 'bau',
    tex: { top: 'end_portal_frame_top', bottom: 'end_stone', side: 'end_portal_frame_side' }
  });
  define('portal_end', {
    title: 'Endportal', shape: B.SHAPE_PORTAL_FLAT, solid: false, collide: false, opaque: false,
    alphaPass: true, light: 11, hardness: -1, drop: null, item: false, opacity: 0, portal: 'the_end'
  });
  define('dragon_egg', {
    title: 'Drachenei', shape: B.SHAPE_EGG, opaque: false, hardness: 3, tool: 'pickaxe', level: 3,
    light: 1, sound: 'stone', group: 'bau'
  });

  // ============================================================
  //  REDSTONE
  // ============================================================
  // Leitung: Meta ist die Signalstärke 0..15. Sie wird nicht als Item
  // gehalten — man platziert Redstonestaub, der zu dieser Leitung wird.
  define('redstone_wire', {
    title: 'Redstoneleitung', shape: B.SHAPE_WIRE, solid: false, collide: false, opaque: false,
    cutout: true, hardness: 0, drop: 'redstone', item: false, opacity: 0, sound: 'stone'
  });
  define('redstone_block', {
    title: 'Redstoneblock', hardness: 5, tool: 'pickaxe', level: 1, sound: 'stone', group: 'redstone'
  });
  // Die Fackel leuchtet, solange ihr Trägerblock KEIN Signal bekommt – das ist
  // das Nicht-Gatter, aus dem sich alles andere baut.
  define('redstone_torch', {
    title: 'Redstonefackel', shape: B.SHAPE_TORCH, solid: false, opaque: false, light: 7,
    hardness: 0, cutout: true, sound: 'wood', opacity: 0, group: 'redstone', tex: 'redstone_torch'
  });
  define('redstone_torch_off', {
    title: 'Redstonefackel (aus)', shape: B.SHAPE_TORCH, solid: false, opaque: false,
    hardness: 0, cutout: true, sound: 'wood', opacity: 0, item: false,
    drop: 'redstone_torch', tex: 'redstone_torch_off'
  });
  define('lever', {
    title: 'Hebel', shape: B.SHAPE_LEVER, solid: false, collide: false, opaque: false,
    cutout: true, hardness: 0.5, sound: 'wood', opacity: 0, group: 'redstone'
  });
  define('stone_button', {
    title: 'Steinknopf', shape: B.SHAPE_BUTTON, solid: false, collide: false, opaque: false,
    hardness: 0.5, tool: 'pickaxe', sound: 'stone', opacity: 0, tex: 'stone', group: 'redstone'
  });
  define('pressure_plate', {
    title: 'Druckplatte', shape: B.SHAPE_PLATE, opaque: false, hardness: 0.5, tool: 'pickaxe',
    sound: 'stone', opacity: 0, tex: 'stone', group: 'redstone'
  });
  define('redstone_lamp', {
    title: 'Redstonelampe', hardness: 0.3, sound: 'glass', group: 'redstone', tex: 'redstone_lamp'
  });
  define('redstone_lamp_lit', {
    title: 'Redstonelampe (an)', hardness: 0.3, light: 15, sound: 'glass', item: false,
    drop: 'redstone_lamp', tex: 'redstone_lamp_lit'
  });
  // Meta: Bits 0-1 Ausgangsrichtung, Bits 2-3 Verzögerung (1..4 Ticks), Bit 4 Ausgang an
  define('repeater', {
    title: 'Verstärker', shape: B.SHAPE_REPEATER, opaque: false, collide: true,
    hardness: 0.5, sound: 'stone', opacity: 0, group: 'redstone',
    tex: { top: 'repeater_top', bottom: 'stone', side: 'repeater_side' }
  });

  // ---------- Bett ----------
  define('bed', {
    title: 'Bett', shape: B.SHAPE_BED, opaque: false, hardness: 0.2, sound: 'cloth',
    tex: { top: 'bed_top', bottom: 'planks_oak', side: 'bed_side' }, item: false, group: 'werkzeug'
  });

  // ---------- Schilder, Rahmen, Gemälde ----------
  // ACHTUNG: neue Blöcke gehören ans ENDE der Liste. Ein Spielstand speichert
  // die Blocknummer, nicht den Namen — ein Block in der Mitte verschiebt alle
  // dahinter und macht jede alte Welt unbrauchbar.
  // Alle drei tragen ihren Inhalt nicht in der Blockdefinition, sondern in
  // einer Blockentität — den Text eines Schildes, das Item im Rahmen. Gezeigt
  // wird er über den Atlas aus dyntex.js.
  define('sign', {
    title: 'Schild', shape: B.SHAPE_SIGN, opaque: false, collide: false, opacity: 0,
    hardness: 1, tool: 'axe', tex: 'planks_oak', sound: 'wood', flammable: true, group: 'bau'
  });
  define('wall_sign', {
    title: 'Wandschild', shape: B.SHAPE_SIGN_WALL, opaque: false, collide: false, opacity: 0,
    hardness: 1, tool: 'axe', tex: 'planks_oak', drop: 'sign', item: false,
    sound: 'wood', flammable: true, group: 'bau'
  });
  // Härte 0: ein Schlag, und Rahmen samt Inhalt fallen zusammen heraus. Mit
  // einer Abbauzeit brauchte es einen gehaltenen Klick, und ein kurzer Schlag
  // sah aus, als bräuchte es zwei davon.
  define('item_frame', {
    title: 'Bilderrahmen', shape: B.SHAPE_FRAME, opaque: false, collide: false, opacity: 0,
    hardness: 0, tex: 'item_frame', sound: 'wood', flammable: true, group: 'bau'
  });
  define('painting', {
    title: 'Gemälde', shape: B.SHAPE_PAINTING, opaque: false, collide: false, opacity: 0,
    hardness: 0, tex: { all: 'painting_back', side: 'painting_back', top: 'painting_back',
                        bottom: 'painting_back', front: 'painting_0' },
    sound: 'wood', flammable: true, group: 'bau'
  });


  // ---------- Logistik ----------
  // Der Auslauf des Trichters: Meta 0 zeigt nach unten, 1..4 zur Seite in
  // Richtung SIDE_DIRS[meta-1]. Dieselbe Zählweise wie bei der Wandfackel.
  B.hopperDir = function (meta) {
    var m = meta & 7;
    if (!m) return [0, -1, 0];
    var d = B.SIDE_DIRS[(m - 1) & 3];
    return [d[0], 0, d[1]];
  };

  // Schienenverlauf: 0 = in Z, 1 = in X, 2..5 = Kurven. Eine Kurve verbindet
  // zwei Richtungen; die Tabelle sagt welche, und daran hängt sowohl das Bild
  // als auch die Fahrt der Lore.
  B.RAIL_GERADE = [[0, -1], [0, 1]];
  B.RAIL_ENDEN = [
    [[0, -1], [0, 1]],      // 0: Nord-Süd
    [[-1, 0], [1, 0]],      // 1: West-Ost
    [[0, -1], [1, 0]],      // 2: Nord-Ost
    [[1, 0], [0, 1]],       // 3: Ost-Süd
    [[0, 1], [-1, 0]],      // 4: Süd-West
    [[-1, 0], [0, -1]]      // 5: West-Nord
  ];
  B.railKurve = function (meta) { return (meta & 7) >= 2; };

  define('rail', {
    title: 'Schiene', shape: B.SHAPE_RAIL, opaque: false, collide: false, opacity: 0,
    hardness: 0.7, tool: 'pickaxe', tex: 'rail', sound: 'stone', group: 'redstone'
  });

  define('hopper', {
    title: 'Trichter', shape: B.SHAPE_HOPPER, opaque: false, hardness: 3, tool: 'pickaxe', level: 1,
    tex: { top: 'hopper_top', side: 'hopper_side', bottom: 'hopper_side' },
    sound: 'stone', group: 'redstone'
  });
  define('dropper', {
    title: 'Werfer', hardness: 3.5, tool: 'pickaxe', level: 1, dir6: true,
    tex: { top: 'dropper_side', side: 'dropper_side', bottom: 'dropper_side', front: 'dropper_front' },
    sound: 'stone', group: 'redstone'
  });

  // ---------- Wetter ----------
  // Beschneites Gras ist ein eigener Block, keine Schneeschicht darüber: das
  // Wetter soll Zustände ändern und nichts platzieren. Abgebaut fällt Erde,
  // genau wie beim gewöhnlichen Gras.
  define('grass_snow', {
    title: 'Beschneites Gras', hardness: 0.6, tool: 'shovel', drop: 'dirt', sound: 'grass',
    tex: { top: 'grass_snow_top', side: 'grass_snow_side', bottom: 'dirt' }, group: 'natur'
  });
  // Der Kessel fängt Regen auf. Meta 0..3 ist der Füllstand.
  define('cauldron', {
    title: 'Kessel', shape: B.SHAPE_CAULDRON, opaque: false, hardness: 2, tool: 'pickaxe', level: 1,
    tex: { top: 'cauldron_top', side: 'cauldron_side', bottom: 'cauldron_side' },
    sound: 'stone', group: 'werkzeug'
  });

  // ---------- Helfer ----------
  B.get = function (id) { return B.byId[id] || B.byId[0]; };
  B.id = function (name) { var b = B.byName[name]; return b ? b.id : 0; };

  B.isOpaque = function (id) { var b = B.byId[id]; return b ? b.opaque : false; };
  B.isSolid = function (id) { var b = B.byId[id]; return b ? b.collide : false; };
  // Zählt dieser Block für das Wasser als Wasser? Seegras und Tang stehen im
  // Wasser, verdrängen es aber im Blockgitter – ohne diese Abfrage zeichnet das
  // Wasser eine Wand gegen sie, und im Meer stehen überall Löcher.
  // Fluten ist ein Zustand, keine Eigenschaft. `nass` sagt nur, dass ein Block
  // Wasser aufnehmen KANN – ob er es tut, steht in seinem Meta. Vorher galt
  // jedes Seegras als randvoll, auch das an Land: Wasser wäre selbst dann
  // gerendert worden, wenn weit und breit keins ist.
  B.NASS_BIT = 1;

  B.kannFluten = function (id) {
    var b = B.byId[id];
    return !!(b && b.nass);
  };

  B.istGeflutet = function (id, meta) {
    var b = B.byId[id];
    return !!(b && b.nass && (meta & B.NASS_BIT));
  };

  // Zählt diese Zelle fürs Rendern, Schwimmen und Fließen als Wasser?
  B.zaehltAlsWasser = function (id, meta) {
    if (id === B.id('water')) return true;
    return B.istGeflutet(id, meta);
  };

  // Was fließendes Wasser wegreißt: alles ohne Masse, das kein Wasser aufnehmen
  // kann – Blumen, Fackeln, Setzlinge, Getreide. Vorher hielt eine Blume das
  // Wasser auf wie eine Mauer, was offensichtlich falsch ist.
  // Abgegrenzt über die Form, nicht über solid/collide: die Leiter ist ebenfalls
  // ohne Masse, trägt aber ihre Richtung im Meta – dort ist kein Bit frei, und
  // weggerissen werden soll sie auch nicht.
  B.spuehltWeg = function (id) {
    var b = B.byId[id];
    if (!b || id === 0) return false;
    if (b.liquid || b.nass) return false;
    return b.shape === B.SHAPE_CROSS || b.shape === B.SHAPE_TORCH || b.shape === B.SHAPE_CROP;
  };

  B.isLiquid = function (id) { var b = B.byId[id]; return b ? b.liquid : false; };
  B.isReplaceable = function (id) { var b = B.byId[id]; return b ? b.replaceable : false; };
  B.light = function (id) { var b = B.byId[id]; return b ? b.light : 0; };
  B.opacity = function (id) { var b = B.byId[id]; return b ? b.opacity : 0; };

  // Waagerechte Nachbarrichtungen, Reihenfolge = Meta 0..3 bei Leiter und Fackel
  B.SIDE_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  // Meta einer Wandrichtung -> Flächennummer im Mesher (0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z)
  B.SIDE_FACE = [5, 0, 4, 1];

  // ============================================================
  //  Schild, Rahmen, Gemälde
  // ============================================================
  // Für alle drei gilt dasselbe: meta & 3 ist die Richtung, in die das Ding
  // BLICKT — ein Wandstück hängt also an der Wand gegenüber. Die Geometrie
  // steht ausgeschrieben statt gedreht gerechnet; vier Zeilen liest man nach,
  // eine Rotationsmatrix nicht.
  //
  // Blickrichtung nach SIDE_DIRS: 0 = -Z, 1 = +X, 2 = +Z, 3 = -X.
  // r ist "rechts" aus Sicht dessen, der davorsteht und liest.
  B.SCHILD_N = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
  B.SCHILD_R = [[-1, 0, 0], [0, 0, -1], [1, 0, 0], [0, 0, 1]];

  B.schildBoxen = function (shape, meta) {
    var m = meta & 3;
    var laengs = (m === 1 || m === 3);   // Brett verläuft in Z statt in X
    if (shape === B.SHAPE_SIGN) {
      return [
        [0.45, 0, 0.45, 0.55, 0.52, 0.55],
        laengs ? [0.44, 0.5, 0.06, 0.56, 1, 0.94] : [0.06, 0.5, 0.44, 0.94, 1, 0.56]
      ];
    }
    var d = shape === B.SHAPE_SIGN_WALL ? 0.12 : 0.0625;
    var y0 = shape === B.SHAPE_SIGN_WALL ? 0.28 : 0.03;
    var y1 = shape === B.SHAPE_SIGN_WALL ? 0.9 : 0.97;
    var q0 = shape === B.SHAPE_SIGN_WALL ? 0.06 : 0.03;
    var q1 = shape === B.SHAPE_SIGN_WALL ? 0.94 : 0.97;
    // Das Brett liegt an der Wand, also gegenüber der Blickrichtung
    if (m === 0) return [[q0, y0, 1 - d, q1, y1, 1]];
    if (m === 1) return [[0, y0, q0, d, y1, q1]];
    if (m === 2) return [[q0, y0, 0, q1, y1, d]];
    return [[1 - d, y0, q0, 1, y1, q1]];
  };

  // Die beschriftbare Fläche: Ursprung oben links, u nach rechts, v nach
  // unten, alles relativ zur Blockzelle. Damit zeichnet der Renderer ein
  // Viereck, ohne die Formen noch einmal zu kennen.
  B.schildFlaeche = function (shape, meta) {
    var m = meta & 3;
    var n = B.SCHILD_N[m], r = B.SCHILD_R[m];
    var breite, hoch, cy, vor;
    if (shape === B.SHAPE_SIGN) { breite = 0.86; hoch = 0.46; cy = 0.75; vor = 0.065; }
    else if (shape === B.SHAPE_SIGN_WALL) { breite = 0.86; hoch = 0.58; cy = 0.59; vor = -0.375; }
    // Der Rahmen ist nur ein Sechzehntel dick: sein Bild muss knapp VOR der
    // Vorderkante liegen, sonst verschluckt ihn das eigene Brett.
    else if (shape === B.SHAPE_FRAME) { breite = 0.7; hoch = 0.7; cy = 0.5; vor = -0.4315; }
    else { breite = 0.94; hoch = 0.94; cy = 0.5; vor = -0.44; }
    var o = [0.5 + n[0] * vor, cy, 0.5 + n[2] * vor];
    return {
      o: [o[0] - r[0] * breite / 2, o[1] + hoch / 2, o[2] - r[2] * breite / 2],
      u: [r[0] * breite, 0, r[2] * breite],
      v: [0, -hoch, 0]
    };
  };

  // Hängt das Ding noch? Ein Wandstück braucht seine Wand, ein stehendes
  // Schild seinen Boden.
  B.schildHaelt = function (getBlock, shape, x, y, z, meta) {
    if (shape === B.SHAPE_SIGN) return B.isSolid(getBlock(x, y - 1, z));
    var g = B.SIDE_DIRS[((meta & 3) + 2) & 3];
    return B.isOpaque(getBlock(x + g[0], y, z + g[1]));
  };

  // Fackel-Meta: 0 = auf dem Boden, 1..4 = an der Wand in Richtung SIDE_DIRS[meta-1].
  // Liefert die Richtung zur tragenden Wand oder null für eine Standfackel.
  B.torchAttach = function (meta) {
    var m = meta & 7;
    return m > 0 ? B.SIDE_DIRS[(m - 1) & 3] : null;
  };

  // Auswahl-/Trefferbox einer Fackel, abhängig von der Montagerichtung
  B.torchBox = function (meta) {
    var a = B.torchAttach(meta);
    if (!a) return [0.4, 0, 0.4, 0.6, 0.625, 0.6];
    // Fuß liegt an der Wand, Spitze neigt sich zur Blockmitte
    var fx = 0.5 + a[0] * 0.44, fz = 0.5 + a[1] * 0.44;
    var tx = 0.5 + a[0] * 0.12, tz = 0.5 + a[1] * 0.12;
    var cl = function (v) { return v < 0 ? 0 : (v > 1 ? 1 : v); };
    return [cl(Math.min(fx, tx) - 0.1), 0.2, cl(Math.min(fz, tz) - 0.1),
            cl(Math.max(fx, tx) + 0.1), 0.95, cl(Math.max(fz, tz) + 0.1)];
  };

  // Treppen: Grundplatte + Stufe. facing (Bits 0-1) = Seite mit dem hohen Teil,
  // Bit 2 = kopfüber montiert.
  B.stairBoxes = function (meta) {
    var f = meta & 3, top = (meta & 4) !== 0;
    var base = top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
    var y0 = top ? 0 : 0.5, y1 = top ? 0.5 : 1;
    var step;
    if (f === 0) step = [0, y0, 0, 1, y1, 0.5];
    else if (f === 1) step = [0.5, y0, 0, 1, y1, 1];
    else if (f === 2) step = [0, y0, 0.5, 1, y1, 1];
    else step = [0, y0, 0, 0.5, y1, 1];
    return [base, step];
  };

  // Tür: 3/16 dicke Platte an einer Blockseite; offen um 90° gedreht.
  B.doorBox = function (meta) {
    var f = (meta >> 1) & 3;
    if (meta & 8) f = (f + 1) & 3;
    switch (f) {
      case 0: return [0, 0, 0, 1, 1, 0.1875];
      case 1: return [0.8125, 0, 0, 1, 1, 1];
      case 2: return [0, 0, 0.8125, 1, 1, 1];
      default: return [0, 0, 0, 0.1875, 1, 1];
    }
  };

  // Leiter: dünne Platte an der Wand, facing = Seite, an der sie hängt
  B.ladderBox = function (meta) {
    switch (meta & 3) {
      case 0: return [0, 0, 0, 1, 1, 0.125];
      case 1: return [0.875, 0, 0, 1, 1, 1];
      case 2: return [0, 0, 0.875, 1, 1, 1];
      default: return [0, 0, 0, 0.125, 1, 1];
    }
  };

  // Zauntor: geschlossen eine Schranke quer zur Blickrichtung, so hoch wie ein
  // Zaun. Offen bleibt nur die Auswahl stehen, die Kollision fällt weg.
  B.gateBox = function (meta) {
    var alongX = (meta & 1) === 0;   // Richtung 0/2 -> Schranke spannt über X
    return alongX ? [0, 0, 0.4375, 1, 1.5, 0.5625] : [0.4375, 0, 0, 0.5625, 1.5, 1];
  };
  B.gateOpen = function (meta) { return (meta & 4) !== 0; };

  // Knopf und Hebel: Meta-Bits 0-1 = Wandrichtung nach SIDE_DIRS, Bit 2 = Boden,
  // Bit 3 = gedrückt bzw. umgelegt.
  B.buttonBox = function (meta) {
    if (meta & 4) return [0.3125, 0, 0.3125, 0.6875, 0.125, 0.6875];
    var d = B.SIDE_DIRS[meta & 3];
    // sitzt an der Wand, zu der d zeigt
    if (d[0] === 1) return [0.875, 0.3125, 0.3125, 1, 0.6875, 0.6875];
    if (d[0] === -1) return [0, 0.3125, 0.3125, 0.125, 0.6875, 0.6875];
    if (d[1] === 1) return [0.3125, 0.3125, 0.875, 0.6875, 0.6875, 1];
    return [0.3125, 0.3125, 0, 0.6875, 0.6875, 0.125];
  };

  B.leverBox = function (meta) {
    if (meta & 4) return [0.3125, 0, 0.3125, 0.6875, 0.625, 0.6875];
    var d = B.SIDE_DIRS[meta & 3];
    if (d[0] === 1) return [0.625, 0.25, 0.25, 1, 0.75, 0.75];
    if (d[0] === -1) return [0, 0.25, 0.25, 0.375, 0.75, 0.75];
    if (d[1] === 1) return [0.25, 0.25, 0.625, 0.75, 0.75, 1];
    return [0.25, 0.25, 0, 0.75, 0.75, 0.375];
  };

  // Kollisionsboxen eines Blocks (relativ 0..1)
  B.boxes = function (id, meta) {
    var b = B.byId[id];
    if (!b || !b.collide) return null;
    switch (b.shape) {
      case B.SHAPE_SLAB:
        return (meta & 1) ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]];
      case B.SHAPE_TORCH:
        return null;
      case B.SHAPE_BED:
        return [[0, 0, 0, 1, 0.5625, 1]];
      case B.SHAPE_FARMLAND:
        return [[0, 0, 0, 1, 0.9375, 1]];
      case B.SHAPE_LIQUID:
        return null;
      case B.SHAPE_STAIRS:
        return B.stairBoxes(meta);
      case B.SHAPE_EGG:
        // eine Box reicht für die Kollision, die Feinform bleibt Optik
        return [[0.0625, 0, 0.0625, 0.9375, 1, 0.9375]];
      case B.SHAPE_ANVIL:
        return [[0.125, 0, 0.0625, 0.875, 1, 0.9375]];
      case B.SHAPE_STAND:
        return [[0.125, 0, 0.125, 0.875, 0.875, 0.875]];
      case B.SHAPE_HOPPER:
        // Rand und Trog: man steht auf ihm, aber die Mitte ist offen
        return [[0, 0, 0, 1, 0.625, 1],
                [0, 0.625, 0, 1, 1, 0.125], [0, 0.625, 0.875, 1, 1, 1],
                [0, 0.625, 0.125, 0.125, 1, 0.875], [0.875, 0.625, 0.125, 1, 1, 0.875]];
      case B.SHAPE_CAULDRON:
        // Boden und vier Wände — man steht im Kessel, nicht auf ihm
        return [[0, 0, 0, 1, 0.25, 1],
                [0, 0.25, 0, 0.125, 1, 1], [0.875, 0.25, 0, 1, 1, 1],
                [0.125, 0.25, 0, 0.875, 1, 0.125], [0.125, 0.25, 0.875, 0.875, 1, 1]];
      case B.SHAPE_PISTON_HEAD:
        return B.PISTON_HEAD_BOXES[meta & 7] || B.PISTON_HEAD_BOXES[0];
      case B.SHAPE_PLATE:
        return [[0, 0, 0, 1, 0.0625, 1]];
      case B.SHAPE_REPEATER:
        return [[0, 0, 0, 1, 0.125, 1]];
      case B.SHAPE_FENCE:
        // etwas breiter als der Pfosten, damit man nicht durchschlüpft
        return [[0.25, 0, 0.25, 0.75, 1.5, 0.75]];
      case B.SHAPE_DOOR:
        return [B.doorBox(meta)];
      case B.SHAPE_GATE:
        return B.gateOpen(meta) ? null : [B.gateBox(meta)];
      case B.SHAPE_RAIL:
      case B.SHAPE_SIGN:
      case B.SHAPE_SIGN_WALL:
      case B.SHAPE_FRAME:
      case B.SHAPE_PAINTING:
      case B.SHAPE_LADDER:
      case B.SHAPE_FIRE:
      case B.SHAPE_PORTAL:
      case B.SHAPE_PORTAL_FLAT:
      case B.SHAPE_WIRE:
      case B.SHAPE_BUTTON:
      case B.SHAPE_LEVER:
        return null;
      default:
        return [[0, 0, 0, 1, 1, 1]];
    }
  };

  // Auswahl-/Raycast-Box
  B.selBox = function (id, meta) {
    var b = B.byId[id];
    if (!b || b.id === 0) return null;
    switch (b.shape) {
      case B.SHAPE_SLAB: return (meta & 1) ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1];
      case B.SHAPE_TORCH: return B.torchBox(meta);
      case B.SHAPE_CROSS: return [0.15, 0, 0.15, 0.85, 0.85, 0.85];
      case B.SHAPE_CROP: return [0.05, 0, 0.05, 0.95, 0.7, 0.95];
      case B.SHAPE_BED: return [0, 0, 0, 1, 0.5625, 1];
      case B.SHAPE_FARMLAND: return [0, 0, 0, 1, 0.9375, 1];
      case B.SHAPE_ANVIL: return [0.125, 0, 0.0625, 0.875, 1, 0.9375];
      case B.SHAPE_STAND: return [0.125, 0, 0.125, 0.875, 0.875, 0.875];
      case B.SHAPE_RAIL: return [0, 0, 0, 1, 0.125, 1];
      case B.SHAPE_HOPPER:
      case B.SHAPE_CAULDRON: return [0, 0, 0, 1, 1, 1];
      case B.SHAPE_PISTON_HEAD: return [0, 0, 0, 1, 1, 1];
      case B.SHAPE_LIQUID: return null;
      case B.SHAPE_STAIRS: return [0, 0, 0, 1, 1, 1];
      case B.SHAPE_FENCE: return [0.375, 0, 0.375, 0.625, 1.5, 0.625];
      case B.SHAPE_DOOR: return B.doorBox(meta);
      case B.SHAPE_GATE: return B.gateBox(meta);
      case B.SHAPE_LADDER: return B.ladderBox(meta);
      case B.SHAPE_FIRE: return [0.05, 0, 0.05, 0.95, 1, 0.95];
      case B.SHAPE_PORTAL: return (meta & 1) ? [0.375, 0, 0, 0.625, 1, 1] : [0, 0, 0.375, 1, 1, 0.625];
      case B.SHAPE_PORTAL_FLAT: return [0, 0.6, 0, 1, 0.9, 1];
      case B.SHAPE_EGG: return [0.0625, 0, 0.0625, 0.9375, 1, 0.9375];
      case B.SHAPE_WIRE: return [0, 0, 0, 1, 0.0625, 1];
      case B.SHAPE_PLATE: return [0, 0, 0, 1, 0.0625, 1];
      case B.SHAPE_REPEATER: return [0, 0, 0, 1, 0.125, 1];
      case B.SHAPE_SIGN: return (meta & 1) ? [0.4, 0, 0.05, 0.6, 1, 0.95] : [0.05, 0, 0.4, 0.95, 1, 0.6];
      case B.SHAPE_SIGN_WALL:
      case B.SHAPE_FRAME:
      case B.SHAPE_PAINTING: return B.schildBoxen(b.shape, meta)[0];
      case B.SHAPE_BUTTON: return B.buttonBox(meta);
      case B.SHAPE_LEVER: return B.leverBox(meta);
      default: return [0, 0, 0, 1, 1, 1];
    }
  };

  // Pflanzen brauchen Untergrund. Fackeln nicht – die hängen auch an Wänden und
  // prüfen ihren Halt über torchSupported().
  B.needsSupport = function (id) {
    var b = B.byId[id];
    if (!b) return false;
    return b.shape === B.SHAPE_CROSS || b.shape === B.SHAPE_CROP;
  };

  // Hat eine Fackel an dieser Stelle Halt? getBlock(x,y,z) -> id
  B.torchSupported = function (getBlock, x, y, z, meta) {
    var a = B.torchAttach(meta);
    if (a) return B.isOpaque(getBlock(x + a[0], y, z + a[1]));
    return B.validGround(B.id('torch'), getBlock(x, y - 1, z));
  };

  B.validGround = function (id, groundId) {
    var b = B.byId[id], g = B.byId[groundId];
    if (!g) return false;
    if (b.shape === B.SHAPE_TORCH) return g.opaque || g.shape === B.SHAPE_SLAB || g.shape === B.SHAPE_FENCE;
    if (b.name === 'wheat') return groundId === B.id('farmland');
    if (b.name === 'nether_wart') return groundId === B.id('soul_sand') || groundId === B.id('soul_soil');
    if (b.name === 'kelp' || b.name === 'seagrass') {
      return groundId === B.id('sand') || groundId === B.id('gravel') || groundId === B.id('dirt') ||
             groundId === B.id('clay') || groundId === B.id('kelp');
    }
    if (b.name.indexOf('coral_fan_') === 0) { var gg = B.byId[groundId]; return !!(gg && gg.opaque); }
    if (b.name === 'crimson_roots') return groundId === B.id('crimson_nylium') || groundId === B.id('netherrack');
    if (b.name === 'warped_roots') return groundId === B.id('warped_nylium') || groundId === B.id('netherrack');
    if (b.name === 'sugar_cane') return groundId === B.id('sand') || groundId === B.id('dirt') || groundId === B.id('grass') || groundId === B.id('sugar_cane');
    if (b.name === 'cactus') return groundId === B.id('sand') || groundId === B.id('cactus');
    if (b.name === 'dead_bush') return groundId === B.id('sand') || groundId === B.id('dirt');
    if (b.name === 'mushroom_red' || b.name === 'mushroom_brown') return g.opaque;
    return groundId === B.id('grass') || groundId === B.id('dirt') || groundId === B.id('farmland');
  };

})();
