/* ============================================================
   recipes.js  -  Crafting (geformt/ungeformt) + Schmelzen
   ============================================================ */
(function () {
  'use strict';

  var R = {};
  MC.Recipes = R;

  R.shaped = [];
  R.shapeless = [];
  R.smelting = {};
  R.fuel = {};

  // Sammelbegriffe: "#planks" passt auf jede Brettersorte usw.
  R.TAGS = {
    '#planks': ['planks_oak', 'planks_birch', 'planks_spruce', 'planks_skyroot', 'crimson_planks', 'warped_planks'],
    '#logs': ['log_oak', 'log_birch', 'log_spruce', 'log_skyroot', 'log_golden_oak'],
    '#wool': MC.Blocks.WOOL_COLORS.map(function (c) { return 'wool_' + c[0]; })
  };

  R.matchesIngredient = function (want, id) {
    if (want === id) return true;
    var tag = R.TAGS[want];
    return !!(tag && tag.indexOf(id) >= 0);
  };

  // opts.keep = Zutat, deren Zustand ins Ergebnis übergeht (Aufwertungsrezepte)
  function shaped(pattern, key, result, count, opts) {
    var rows = pattern.length, cols = 0;
    for (var i = 0; i < rows; i++) cols = Math.max(cols, pattern[i].length);
    var grid = [];
    for (var y = 0; y < rows; y++) {
      var row = [];
      for (var x = 0; x < cols; x++) {
        var c = pattern[y][x] || ' ';
        row.push(c === ' ' ? null : key[c]);
      }
      grid.push(row);
    }
    R.shaped.push({
      w: cols, h: rows, grid: grid, out: { id: result, count: count || 1 },
      keep: (opts && opts.keep) || null
    });
  }

  function shapeless(ing, result, count) {
    R.shapeless.push({ ing: ing.slice(), out: { id: result, count: count || 1 } });
  }

  function smelt(input, output, count) { R.smelting[input] = { id: output, count: count || 1 }; }
  function fuel(item, ticks) { R.fuel[item] = ticks; }

  R.addShaped = shaped;
  R.addShapeless = shapeless;

  // ---------------- Holz ----------------
  var woods = ['oak', 'birch', 'spruce'];
  woods.forEach(function (w) {
    shapeless(['log_' + w], 'planks_' + w, 4);
  });
  shaped(['P', 'P'], { P: '#planks' }, 'stick', 4);
  shaped(['PP', 'PP'], { P: '#planks' }, 'crafting_table', 1);
  shaped(['CCC', 'C C', 'CCC'], { C: 'cobblestone' }, 'furnace', 1);
  shaped(['PPP', 'P P', 'PPP'], { P: '#planks' }, 'chest', 1);
  shaped(['C', 'S'], { C: 'coal', S: 'stick' }, 'torch', 4);
  shaped(['C', 'S'], { C: 'charcoal', S: 'stick' }, 'torch', 4);
  shaped(['PPP', 'BBB', 'PPP'], { P: '#planks', B: 'book' }, 'bookshelf', 1);
  // Zaubertisch wie im Original: Buch oben, Diamanten neben dem Obsidian
  shaped([' B ', 'DOD', 'OOO'], { B: 'book', D: 'diamond', O: 'obsidian' }, 'enchanting_table', 1);
  // Amboss: drei Eisenblöcke obendrauf, vier Barren darunter
  shaped(['BBB', ' I ', 'III'], { B: 'iron_block', I: 'iron_ingot' }, 'anvil', 1);

  // Türen, Leitern, Zäune, Treppen
  shaped(['PP', 'PP', 'PP'], { P: '#planks' }, 'door_oak', 3);
  shaped(['II', 'II', 'II'], { I: 'iron_ingot' }, 'door_iron', 3);
  shaped(['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 3);
  // Logistik: Trichter und Werfer
  shaped(['I I', 'ICI', ' I '], { I: 'iron_ingot', C: 'chest' }, 'hopper', 1);
  shaped(['CCC', 'C C', 'CRC'], { C: 'cobblestone', R: 'redstone' }, 'dropper', 1);
  shaped(['I I', 'III'], { I: 'iron_ingot' }, 'minecart', 1);
  shaped(['PIP', 'PPP', ' P '], { P: '#planks', I: 'iron_ingot' }, 'shield', 1);
  shaped(['I I', 'ISI', 'I I'], { I: 'iron_ingot', S: 'stick' }, 'rail', 16);
  shaped(['G G', 'GSG', 'GRG'], { G: 'gold_ingot', S: 'stick', R: 'redstone' }, 'powered_rail', 6);
  // Sattel: drei Leder und zwei Eisenbarren als Bügel
  shaped(['LLL', 'I I'], { L: 'leather', I: 'iron_ingot' }, 'saddle', 1);
  // Schild, Rahmen, Gemälde — die drei Wanddinge
  shaped(['PPP', 'PPP', ' S '], { P: '#planks', S: 'stick' }, 'sign', 3);
  shaped(['SSS', 'SLS', 'SSS'], { S: 'stick', L: 'leather' }, 'item_frame', 1);
  shaped(['SSS', 'SWS', 'SSS'], { S: 'stick', W: '#wool' }, 'painting', 1);
  woods.forEach(function (wd) {
    shaped(['PSP', 'PSP'], { P: 'planks_' + wd, S: 'stick' }, 'fence_' + wd, 3);
    shaped(['SPS', 'SPS'], { P: 'planks_' + wd, S: 'stick' }, 'gate_' + wd, 1);
    shaped(['P  ', 'PP ', 'PPP'], { P: 'planks_' + wd }, 'stairs_' + wd, 4);
    shaped(['  P', ' PP', 'PPP'], { P: 'planks_' + wd }, 'stairs_' + wd, 4);
    shaped(['PPP'], { P: 'planks_' + wd }, 'slab_planks_' + wd, 6);
  });
  [['cobblestone', 'stairs_cobblestone'], ['stone_bricks', 'stairs_stone_bricks'],
   ['sandstone', 'stairs_sandstone'], ['brick_block', 'stairs_brick']
  ].forEach(function (s) {
    shaped(['X  ', 'XX ', 'XXX'], { X: s[0] }, s[1], 4);
    shaped(['  X', ' XX', 'XXX'], { X: s[0] }, s[1], 4);
  });

  // ---------------- Werkzeuge & Waffen ----------------
  var tierMat = {
    wood: '#planks', stone: 'cobblestone', iron: 'iron_ingot',
    gold: 'gold_ingot', diamond: 'diamond',
    holystone: 'holystone', zanite: 'zanite_gemstone', gravitite: 'gravitite'
  };
  Object.keys(tierMat).forEach(function (t) {
    var M = tierMat[t];
    shaped(['MMM', ' S ', ' S '], { M: M, S: 'stick' }, t + '_pickaxe', 1);
    shaped(['MM', 'MS', ' S'], { M: M, S: 'stick' }, t + '_axe', 1);
    shaped(['M', 'S', 'S'], { M: M, S: 'stick' }, t + '_shovel', 1);
    shaped(['M', 'M', 'S'], { M: M, S: 'stick' }, t + '_sword', 1);
    shaped(['MM', ' S', ' S'], { M: M, S: 'stick' }, t + '_hoe', 1);
  });

  // ---------------- Rüstung ----------------
  // Zanit und Gravitit fehlen hier bewusst: die beiden besten Sätze gibt es
  // nicht mehr aus dem Nichts, sondern nur noch durch Aufwerten (siehe unten).
  var ARMOR_PIECES = ['helmet', 'chestplate', 'leggings', 'boots'];
  var ARMOR_CRAFTED = { helmet: ['MMM', 'M M'], chestplate: ['M M', 'MMM', 'MMM'],
                        leggings: ['MMM', 'M M', 'M M'], boots: ['M M', 'M M'] };
  Object.keys(MC.Items.ARMOR).forEach(function (m) {
    if (m === 'zanite' || m === 'gravitite') return;
    var M = MC.Items.ARMOR[m].mat;
    ARMOR_PIECES.forEach(function (p) { shaped(ARMOR_CRAFTED[p], { M: M }, m + '_' + p, 1); });
  });

  // Aufwertung. Ein Diamantteil, ringsum mit vier Zaniten belegt, wird zum
  // Zanitteil; ein Zanitteil mit vier Gravititen zum Gravititteil. Der Zustand
  // des eingesetzten Teils geht mit über – wer einen halb durchgeschlagenen
  // Panzer aufwertet, bekommt keinen fabrikneuen zurück.
  ARMOR_PIECES.forEach(function (p) {
    shaped([' Z ', 'ZDZ', ' Z '], { Z: 'zanite_gemstone', D: 'diamond_' + p },
           'zanite_' + p, 1, { keep: 'diamond_' + p });
    shaped([' G ', 'GZG', ' G '], { G: 'gravitite', Z: 'zanite_' + p },
           'gravitite_' + p, 1, { keep: 'zanite_' + p });
  });

  // Zanithelm, rundum mit Diamanten belegt – der Detektorhelm
  shaped(['DDD', 'DHD', 'DDD'], { D: 'diamond', H: 'zanite_helmet' }, 'detector_helmet', 1,
         { keep: 'zanite_helmet' });

  // ---------------- Diverse Werkzeuge ----------------
  shaped([' I', 'I '], { I: 'iron_ingot' }, 'shears', 1);
  shaped([' SF', 'S F', ' SF'], { S: 'stick', F: 'string' }, 'bow', 1);
  shaped(['F', 'S', 'E'], { F: 'flint', S: 'stick', E: 'feather' }, 'arrow', 4);
  shaped(['I I', ' I '], { I: 'iron_ingot' }, 'bucket', 1);
  shaped(['I', 'F'], { I: 'iron_ingot', F: 'flint' }, 'flint_and_steel', 1);
  shaped(['P P', ' P '], { P: '#planks' }, 'bowl', 4);

  // ---------------- Baumaterial ----------------
  shaped(['BB', 'BB'], { B: 'brick' }, 'brick_block', 1);
  shaped(['SS', 'SS'], { S: 'stone' }, 'stone_bricks', 4);
  shaped(['SS', 'SS'], { S: 'sand' }, 'sandstone', 1);
  shaped(['GG', 'GG'], { G: 'glowstone_dust' }, 'glowstone', 1);
  shaped(['SS', 'SS'], { S: 'string' }, 'wool_white', 1);
  shaped(['GSG', 'SGS', 'GSG'], { G: 'gunpowder', S: 'sand' }, 'tnt', 1);
  shaped(['WWW', 'PPP'], { W: '#wool', P: '#planks' }, 'bed', 1);

  // Steinstufen (Holzstufen entstehen sortenrein weiter oben)
  [['stone', 'slab_stone'], ['cobblestone', 'slab_cobblestone'],
   ['sandstone', 'slab_sandstone'], ['brick_block', 'slab_brick'], ['stone_bricks', 'slab_stone_bricks']
  ].forEach(function (p) {
    shaped(['XXX'], { X: p[0] }, p[1], 6);
  });

  // Kompaktblöcke (9 <-> 1)
  [['coal', 'coal_block'], ['iron_ingot', 'iron_block'], ['gold_ingot', 'gold_block'],
   ['diamond', 'diamond_block'], ['lapis', 'lapis_block'], ['emerald', 'emerald_block']
  ].forEach(function (p) {
    shaped(['XXX', 'XXX', 'XXX'], { X: p[0] }, p[1], 1);
    shapeless([p[1]], p[0], 9);
  });

  // ---------------- Nahrung ----------------
  shaped(['WWW'], { W: 'wheat_item' }, 'bread', 1);
  shapeless(['sugar_cane_item'], 'sugar', 1);
  shaped(['SSS'], { S: 'sugar_cane_item' }, 'paper', 3);
  shaped(['PPP', ' L '], { P: 'paper', L: 'leather' }, 'book', 1);
  shaped(['GGG', 'GAG', 'GGG'], { G: 'gold_ingot', A: 'apple' }, 'golden_apple', 1);

  // ---------------- Nether & Aether ----------------
  shapeless(['log_skyroot'], 'planks_skyroot', 4);
  shapeless(['log_golden_oak'], 'planks_skyroot', 4);
  shaped(['PSP', 'PSP'], { P: 'planks_skyroot', S: 'stick' }, 'fence_skyroot', 3);
  shaped(['SPS', 'SPS'], { P: 'planks_skyroot', S: 'stick' }, 'gate_skyroot', 1);
  shaped(['P  ', 'PP ', 'PPP'], { P: 'planks_skyroot' }, 'stairs_skyroot', 4);
  shaped(['  P', ' PP', 'PPP'], { P: 'planks_skyroot' }, 'stairs_skyroot', 4);
  shaped(['PPP'], { P: 'planks_skyroot' }, 'slab_planks_skyroot', 6);
  shaped(['XXX'], { X: 'holystone' }, 'slab_holystone', 6);
  shaped(['X  ', 'XX ', 'XXX'], { X: 'holystone' }, 'stairs_holystone', 4);
  shaped(['  X', ' XX', 'XXX'], { X: 'holystone' }, 'stairs_holystone', 4);
  shaped(['XXX'], { X: 'nether_bricks' }, 'slab_nether_bricks', 6);
  shaped(['X  ', 'XX ', 'XXX'], { X: 'nether_bricks' }, 'stairs_nether_bricks', 4);
  shaped(['  X', ' XX', 'XXX'], { X: 'nether_bricks' }, 'stairs_nether_bricks', 4);
  shaped(['BB', 'BB'], { B: 'nether_brick' }, 'nether_bricks', 1);
  // Pilzholz aus den beiden Netherwaeldern
  shapeless(['crimson_stem'], 'crimson_planks', 4);
  shapeless(['warped_stem'], 'warped_planks', 4);
  shaped(['XXX'], { X: 'blackstone' }, 'slab_blackstone', 6);
  shaped(['X  ', 'XX ', 'XXX'], { X: 'blackstone' }, 'stairs_blackstone', 4);
  shaped(['  X', ' XX', 'XXX'], { X: 'blackstone' }, 'stairs_blackstone', 4);
  shaped(['XXX'], { X: 'basalt' }, 'slab_basalt', 6);
  shaped(['QQ', 'QQ'], { Q: 'quartz' }, 'quartz_block', 1);
  shaped(['HH', 'HH'], { H: 'holystone' }, 'holystone_bricks', 4);
  // Ambrosiumfackel: leuchtet wie eine normale
  shaped(['A', 'S'], { A: 'ambrosium_shard', S: 'stick' }, 'torch', 4);
  // Vier Schleimbaelle geben einen Magmablock. Vorher stand hier viermal
  // Magmablock auf einen Magmablock — das Rezept fraß drei davon.
  shaped(['SS', 'SS'], { S: 'slimeball' }, 'magma_block', 1);
  // Karte: Papier um einen Kompass – der zeigt dem Blatt, wo es liegt
  shaped(['PPP', 'PCP', 'PPP'], { P: 'paper', C: 'compass' }, 'map', 1);
  // Kompass wie im Original: Eisen ringsum, Redstone in der Mitte
  shaped([' I ', 'IRI', ' I '], { I: 'iron_ingot', R: 'redstone' }, 'compass', 1);
  // Enderauge: eine Lohenrute gibt zwei Staub, Staub plus Perle gibt das Auge
  shapeless(['blaze_rod'], 'blaze_powder', 2);
  shapeless(['blaze_powder', 'ender_pearl'], 'ender_eye', 1);
  shaped(['EE', 'EE'], { E: 'end_stone' }, 'end_stone_bricks', 4);
  // Prismarin aus den Scherben der Wächter
  shaped(['SS', 'SS'], { S: 'prismarine_shard' }, 'prismarine', 1);
  shaped(['SSS', 'SSS', 'SSS'], { S: 'prismarine_shard' }, 'prismarine_bricks', 1);
  shaped(['SSS', 'SCS', 'SSS'], { S: 'prismarine_shard', C: 'coal' }, 'dark_prismarine', 1);
  shaped(['SCS', 'CCC', 'SCS'], { S: 'prismarine_shard', C: 'prismarine_crystals' }, 'sea_lantern', 1);

  // ---------------- Brauen ----------------
  shaped(['G G', ' G '], { G: 'glass' }, 'glass_bottle', 3);
  // Braustand: Lohenrute auf drei Bruchsteinen, wie im Original
  shaped([' R ', 'CCC'], { R: 'blaze_rod', C: 'cobblestone' }, 'brewing_stand', 1);

  // ---------------- Redstone ----------------
  shaped(['R', 'S'], { R: 'redstone', S: 'stick' }, 'redstone_torch', 1);
  shaped(['S', 'C'], { S: 'stick', C: 'cobblestone' }, 'lever', 1);
  shaped(['S'], { S: 'stone' }, 'stone_button', 1);
  shaped(['SS'], { S: 'stone' }, 'pressure_plate', 1);
  shaped([' R ', 'RGR', ' R '], { R: 'redstone', G: 'glowstone' }, 'redstone_lamp', 1);
  shaped(['RRR', 'RRR', 'RRR'], { R: 'redstone' }, 'redstone_block', 1);
  shaped(['TRT', 'SSS'], { T: 'redstone_torch', R: 'redstone', S: 'stone' }, 'repeater', 1);
  // Kolben wie im Original: Bretter oben, Stein und Eisen darunter, Redstone hinten
  shaped(['PPP', 'CIC', 'CRC'], { P: '#planks', C: 'cobblestone', I: 'iron_ingot', R: 'redstone' }, 'piston', 1);
  // Klebrig wird er mit einem Klumpen Schleim – bei uns tut es Zuckerrohrsaft
  shaped(['S', 'P'], { S: 'slimeball', P: 'piston' }, 'sticky_piston', 1);
  // Beobachter: Bruchstein, Redstone und Netherquarz
  shaped(['CCC', 'RRQ', 'CCC'], { C: 'cobblestone', R: 'redstone', Q: 'quartz' }, 'observer', 1);

  // ---------------- Nachtrag: Vergleicher, Spender, Schienen ----------------
  // Vergleicher wie im Original: drei Fackeln, Netherquarz, Stein darunter
  shaped([' T ', 'TQT', 'SSS'], { T: 'redstone_torch', Q: 'quartz', S: 'stone' }, 'comparator', 1);
  // Spender: der Werfer mit einem Bogen darin
  shaped(['CCC', 'CBC', 'CRC'], { C: 'cobblestone', B: 'bow', R: 'redstone' }, 'dispenser', 1);
  shaped(['I I', 'IPI', 'IRI'], { I: 'iron_ingot', P: 'pressure_plate', R: 'redstone' }, 'detector_rail', 6);
  shaped(['ISI', 'IRI', 'ISI'], { I: 'iron_ingot', S: 'stick', R: 'redstone_torch' }, 'activator_rail', 6);
  shaped(['SS', 'SS'], { S: 'slimeball' }, 'slime_block', 1);
  shapeless(['slime_block'], 'slimeball', 4);
  shaped(['PPP', 'PRP', 'PPP'], { P: '#planks', R: 'redstone' }, 'note_block', 1);
  shaped(['GGG', 'QQQ', 'SSS'], { G: 'glass', Q: 'quartz', S: 'slab_stone' }, 'daylight_detector', 1);
  shaped(['PPP', 'PPP'], { P: '#planks' }, 'trapdoor', 2);
  shapeless(['chest', 'minecart'], 'chest_minecart', 1);
  shapeless(['hopper', 'minecart'], 'hopper_minecart', 1);

  // ---------------- Schmelzen ----------------
  smelt('cobblestone', 'stone');
  smelt('sand', 'glass');
  smelt('iron_ore', 'iron_ingot');
  smelt('gold_ore', 'gold_ingot');
  smelt('clay_ball', 'brick');
  smelt('clay', 'brick_block');
  smelt('porkchop_raw', 'porkchop_cooked');
  smelt('beef_raw', 'beef_cooked');
  smelt('chicken_raw', 'chicken_cooked');
  smelt('mutton_raw', 'mutton_cooked');
  woods.forEach(function (w) { smelt('log_' + w, 'charcoal'); });
  smelt('diamond_ore', 'diamond');
  smelt('coal_ore', 'coal');
  smelt('emerald_ore', 'emerald');
  smelt('netherrack', 'nether_brick');
  smelt('quartz_ore', 'quartz');
  smelt('zanite_ore', 'zanite_gemstone');
  smelt('gravitite_ore', 'gravitite');
  smelt('ambrosium_ore', 'ambrosium_shard');
  smelt('log_skyroot', 'charcoal');
  smelt('log_golden_oak', 'charcoal');
  smelt('fish_raw', 'fish_cooked');
  smelt('sponge_wet', 'sponge');        // trocknen im Ofen, wie im Original

  // ---------------- Brennstoffe ----------------
  fuel('coal', 1600); fuel('charcoal', 1600); fuel('coal_block', 16000);
  fuel('stick', 100); fuel('lava_bucket', 20000);
  woods.forEach(function (w) { fuel('planks_' + w, 300); fuel('log_' + w, 300); });
  fuel('crafting_table', 300); fuel('chest', 300); fuel('bookshelf', 300); fuel('bowl', 200);
  fuel('ladder', 300); fuel('door_oak', 200); fuel('trapdoor', 300); fuel('note_block', 300);
  fuel('daylight_detector', 300);
  woods.forEach(function (w) { fuel('fence_' + w, 300); fuel('stairs_' + w, 300); fuel('slab_planks_' + w, 150); });
  ['wood_pickaxe', 'wood_axe', 'wood_shovel', 'wood_sword', 'wood_hoe'].forEach(function (t) { fuel(t, 200); });
  fuel('slab_planks_oak', 150);
  fuel('planks_skyroot', 300); fuel('log_skyroot', 300); fuel('log_golden_oak', 300);
  fuel('fence_skyroot', 300); fuel('gate_skyroot', 300); fuel('stairs_skyroot', 300);
  fuel('slab_planks_skyroot', 150); fuel('ambrosium_shard', 800); fuel('netherrack', 200);

  R.SMELT_TIME = 200; // Ticks

  // ============================================================
  //  Matching
  // ============================================================

  // grid: Array[size*size] von Stacks oder null
  R.match = function (grid, size) {
    // 1) geformt
    var minX = size, minY = size, maxX = -1, maxY = -1, count = 0;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (grid[y * size + x]) {
          count++;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (count === 0) return null;
    var w = maxX - minX + 1, h = maxY - minY + 1;

    for (var i = 0; i < R.shaped.length; i++) {
      var r = R.shaped[i];
      if (!r.out || r.w !== w || r.h !== h) continue;
      if (matchShaped(r, grid, size, minX, minY, false) || matchShaped(r, grid, size, minX, minY, true)) {
        return { id: r.out.id, count: r.out.count, keep: r.keep ? findStack(grid, r.keep) : null };
      }
    }

    // 2) ungeformt
    for (var k = 0; k < R.shapeless.length; k++) {
      var sr = R.shapeless[k];
      if (sr.ing.length !== count) continue;
      var pool = sr.ing.slice(), ok = true;
      for (var g = 0; g < size * size && ok; g++) {
        var st = grid[g];
        if (!st) continue;
        var idx = -1;
        for (var pi = 0; pi < pool.length; pi++) {
          if (R.matchesIngredient(pool[pi], st.id)) { idx = pi; break; }
        }
        if (idx < 0) ok = false; else pool.splice(idx, 1);
      }
      if (ok && pool.length === 0) return { id: sr.out.id, count: sr.out.count };
    }
    return null;
  };

  function findStack(grid, id) {
    for (var i = 0; i < grid.length; i++) if (grid[i] && grid[i].id === id) return grid[i];
    return null;
  }

  // Aufwertung: was das eingesetzte Teil an Zustand mitbringt, nimmt das
  // Ergebnis mit. Haltbarkeit anteilig, weil das neue Teil mehr aushält.
  R.carryOver = function (from, to) {
    if (!from || !to) return to;
    var src = MC.Items.get(from.id), dst = MC.Items.get(to.id);
    if (src && dst && src.durability > 0 && dst.durability > 0 && from.dur !== undefined) {
      to.dur = Math.max(1, Math.round(dst.durability * (from.dur / src.durability)));
    }
    if (from.ench) {
      to.ench = {};
      for (var k in from.ench) to.ench[k] = from.ench[k];
    }
    return to;
  };

  function matchShaped(r, grid, size, ox, oy, mirror) {
    for (var y = 0; y < r.h; y++) {
      for (var x = 0; x < r.w; x++) {
        var want = r.grid[y][mirror ? (r.w - 1 - x) : x];
        var have = grid[(oy + y) * size + (ox + x)];
        if (want === null || want === undefined) { if (have) return false; }
        else { if (!have || !R.matchesIngredient(want, have.id)) return false; }
      }
    }
    return true;
  }

  // Alle Rezepte, die mit den vorhandenen Items machbar wären (für das Rezeptbuch)
  R.allResults = function () {
    var out = [];
    R.shaped.forEach(function (r) { if (r.out) out.push(r); });
    return out;
  };

  R.smeltResult = function (id) { return R.smelting[id] || null; };
  R.fuelValue = function (id) { return R.fuel[id] || 0; };

})();
