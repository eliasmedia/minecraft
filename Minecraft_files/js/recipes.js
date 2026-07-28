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
    '#planks': ['planks_oak', 'planks_birch', 'planks_spruce'],
    '#logs': ['log_oak', 'log_birch', 'log_spruce'],
    '#wool': MC.Blocks.WOOL_COLORS.map(function (c) { return 'wool_' + c[0]; })
  };

  R.matchesIngredient = function (want, id) {
    if (want === id) return true;
    var tag = R.TAGS[want];
    return !!(tag && tag.indexOf(id) >= 0);
  };

  function shaped(pattern, key, result, count) {
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
    R.shaped.push({ w: cols, h: rows, grid: grid, out: { id: result, count: count || 1 } });
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

  // Türen, Leitern, Zäune, Treppen
  shaped(['PP', 'PP', 'PP'], { P: '#planks' }, 'door_oak', 3);
  shaped(['II', 'II', 'II'], { I: 'iron_ingot' }, 'door_iron', 3);
  shaped(['S S', 'SSS', 'S S'], { S: 'stick' }, 'ladder', 3);
  woods.forEach(function (wd) {
    shaped(['PSP', 'PSP'], { P: 'planks_' + wd, S: 'stick' }, 'fence_' + wd, 3);
    shaped(['P..', 'PP.', 'PPP'], { P: 'planks_' + wd }, 'stairs_' + wd, 4);
    shaped(['..P', '.PP', 'PPP'], { P: 'planks_' + wd }, 'stairs_' + wd, 4);
    shaped(['PPP'], { P: 'planks_' + wd }, 'slab_planks_' + wd, 6);
  });
  [['cobblestone', 'stairs_cobblestone'], ['stone_bricks', 'stairs_stone_bricks'],
   ['sandstone', 'stairs_sandstone'], ['brick_block', 'stairs_brick']
  ].forEach(function (s) {
    shaped(['X..', 'XX.', 'XXX'], { X: s[0] }, s[1], 4);
    shaped(['..X', '.XX', 'XXX'], { X: s[0] }, s[1], 4);
  });

  // ---------------- Werkzeuge & Waffen ----------------
  var tierMat = {
    wood: '#planks', stone: 'cobblestone', iron: 'iron_ingot',
    gold: 'gold_ingot', diamond: 'diamond'
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
  Object.keys(MC.Items.ARMOR).forEach(function (m) {
    var M = MC.Items.ARMOR[m].mat;
    shaped(['MMM', 'M M'], { M: M }, m + '_helmet', 1);
    shaped(['M M', 'MMM', 'MMM'], { M: M }, m + '_chestplate', 1);
    shaped(['MMM', 'M M', 'M M'], { M: M }, m + '_leggings', 1);
    shaped(['M M', 'M M'], { M: M }, m + '_boots', 1);
  });

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

  // ---------------- Brennstoffe ----------------
  fuel('coal', 1600); fuel('charcoal', 1600); fuel('coal_block', 16000);
  fuel('stick', 100); fuel('lava_bucket', 20000);
  woods.forEach(function (w) { fuel('planks_' + w, 300); fuel('log_' + w, 300); });
  fuel('crafting_table', 300); fuel('chest', 300); fuel('bookshelf', 300); fuel('bowl', 200);
  fuel('ladder', 300); fuel('door_oak', 200);
  woods.forEach(function (w) { fuel('fence_' + w, 300); fuel('stairs_' + w, 300); fuel('slab_planks_' + w, 150); });
  ['wood_pickaxe', 'wood_axe', 'wood_shovel', 'wood_sword', 'wood_hoe'].forEach(function (t) { fuel(t, 200); });
  fuel('slab_planks_oak', 150);

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
        return { id: r.out.id, count: r.out.count };
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
