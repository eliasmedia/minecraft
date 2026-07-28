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
  define('sugar_cane', {
    title: 'Zuckerrohr', shape: B.SHAPE_CROSS, solid: false, opaque: false, cutout: true, collide: false,
    hardness: 0, sound: 'grass', drop: 'sugar_cane_item', group: 'natur'
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

  // ---------- Bett ----------
  define('bed', {
    title: 'Bett', shape: B.SHAPE_BED, opaque: false, hardness: 0.2, sound: 'cloth',
    tex: { top: 'bed_top', bottom: 'planks_oak', side: 'bed_side' }, item: false, group: 'werkzeug'
  });

  // ---------- Helfer ----------
  B.get = function (id) { return B.byId[id] || B.byId[0]; };
  B.id = function (name) { var b = B.byName[name]; return b ? b.id : 0; };

  B.isOpaque = function (id) { var b = B.byId[id]; return b ? b.opaque : false; };
  B.isSolid = function (id) { var b = B.byId[id]; return b ? b.collide : false; };
  B.isLiquid = function (id) { var b = B.byId[id]; return b ? b.liquid : false; };
  B.isReplaceable = function (id) { var b = B.byId[id]; return b ? b.replaceable : false; };
  B.light = function (id) { var b = B.byId[id]; return b ? b.light : 0; };
  B.opacity = function (id) { var b = B.byId[id]; return b ? b.opacity : 0; };

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
      case B.SHAPE_FENCE:
        // etwas breiter als der Pfosten, damit man nicht durchschlüpft
        return [[0.25, 0, 0.25, 0.75, 1.5, 0.75]];
      case B.SHAPE_DOOR:
        return [B.doorBox(meta)];
      case B.SHAPE_LADDER:
      case B.SHAPE_FIRE:
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
      case B.SHAPE_TORCH: return [0.4, 0, 0.4, 0.6, 0.6, 0.6];
      case B.SHAPE_CROSS: return [0.15, 0, 0.15, 0.85, 0.85, 0.85];
      case B.SHAPE_CROP: return [0.05, 0, 0.05, 0.95, 0.7, 0.95];
      case B.SHAPE_BED: return [0, 0, 0, 1, 0.5625, 1];
      case B.SHAPE_FARMLAND: return [0, 0, 0, 1, 0.9375, 1];
      case B.SHAPE_LIQUID: return null;
      case B.SHAPE_STAIRS: return [0, 0, 0, 1, 1, 1];
      case B.SHAPE_FENCE: return [0.375, 0, 0.375, 0.625, 1.5, 0.625];
      case B.SHAPE_DOOR: return B.doorBox(meta);
      case B.SHAPE_LADDER: return B.ladderBox(meta);
      case B.SHAPE_FIRE: return [0.05, 0, 0.05, 0.95, 1, 0.95];
      default: return [0, 0, 0, 1, 1, 1];
    }
  };

  // Pflanzen brauchen Untergrund
  B.needsSupport = function (id) {
    var b = B.byId[id];
    if (!b) return false;
    return b.shape === B.SHAPE_CROSS || b.shape === B.SHAPE_CROP || b.shape === B.SHAPE_TORCH;
  };

  B.validGround = function (id, groundId) {
    var b = B.byId[id], g = B.byId[groundId];
    if (!g) return false;
    if (b.shape === B.SHAPE_TORCH) return g.opaque || g.shape === B.SHAPE_SLAB;
    if (b.name === 'wheat') return groundId === B.id('farmland');
    if (b.name === 'sugar_cane') return groundId === B.id('sand') || groundId === B.id('dirt') || groundId === B.id('grass') || groundId === B.id('sugar_cane');
    if (b.name === 'cactus') return groundId === B.id('sand') || groundId === B.id('cactus');
    if (b.name === 'dead_bush') return groundId === B.id('sand') || groundId === B.id('dirt');
    if (b.name === 'mushroom_red' || b.name === 'mushroom_brown') return g.opaque;
    return groundId === B.id('grass') || groundId === B.id('dirt') || groundId === B.id('farmland');
  };

})();
