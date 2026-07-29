/* ============================================================
   items.js  -  Item-Registry (Werkzeuge, Nahrung, Rüstung, Material)
   ============================================================ */
(function () {
  'use strict';

  var I = {};
  MC.Items = I;

  I.byName = {};
  I.list = [];

  function define(name, o) {
    o = o || {};
    var it = {
      name: name,
      title: o.title || name,
      stack: o.stack || 64,
      block: o.block || null,
      tex: o.tex || name,
      tool: o.tool || null,          // {type,level,speed,damage}
      durability: o.durability || 0,
      food: o.food || null,          // {hunger,sat}
      armor: o.armor || null,        // {slot,defense}
      damage: o.damage || 1,
      fuel: o.fuel || 0,             // Brennzeit in Ticks (Ofen)
      group: o.group || 'material',
      place: o.place || null,
      onUse: o.onUse || null
    };
    I.byName[name] = it;
    I.list.push(it);
    return it;
  }
  I.define = define;

  // ---------- Block-Items automatisch ----------
  MC.Blocks.list.forEach(function (b) {
    if (!b.item || b.id === 0) return;
    define(b.name, { title: b.title, block: b.name, stack: b.stack, group: b.group });
  });

  // ---------- Materialien ----------
  var mats = [
    ['stick', 'Stock', 'werkzeug', 100],
    ['coal', 'Kohle', 'material', 1600],
    ['charcoal', 'Holzkohle', 'material', 1600],
    ['iron_ingot', 'Eisenbarren', 'material', 0],
    ['gold_ingot', 'Goldbarren', 'material', 0],
    ['diamond', 'Diamant', 'material', 0],
    ['emerald', 'Smaragd', 'material', 0],
    ['redstone', 'Redstone', 'material', 0],
    ['lapis', 'Lapislazuli', 'material', 0],
    ['clay_ball', 'Tonklumpen', 'material', 0],
    ['brick', 'Ziegelstein', 'material', 0],
    ['flint', 'Feuerstein', 'material', 0],
    ['feather', 'Feder', 'material', 0],
    ['leather', 'Leder', 'material', 0],
    ['bone', 'Knochen', 'material', 0],
    ['string', 'Faden', 'material', 0],
    ['gunpowder', 'Schwarzpulver', 'material', 0],
    ['wheat_item', 'Weizen', 'material', 0],
    ['seeds', 'Weizensamen', 'material', 0],
    ['sugar_cane_item', 'Zuckerrohr', 'material', 0],
    ['sugar', 'Zucker', 'material', 0],
    ['paper', 'Papier', 'material', 0],
    ['book', 'Buch', 'material', 0],
    ['glowstone_dust', 'Glowstonestaub', 'material', 0],
    ['arrow', 'Pfeil', 'werkzeug', 0],
    ['bowl', 'Schüssel', 'material', 200],
    // Nether
    ['quartz', 'Netherquarz', 'material', 0],
    ['nether_brick', 'Netherziegelstein', 'material', 0],
    // Aether
    ['zanite_gemstone', 'Zanit', 'material', 0],
    ['gravitite', 'Gravitit', 'material', 0]
  ];
  mats.forEach(function (m) { define(m[0], { title: m[1], group: m[2], fuel: m[3] }); });

  // ---------- Nahrung ----------
  var foods = [
    ['apple', 'Apfel', 4, 2.4],
    ['bread', 'Brot', 5, 6],
    ['porkchop_raw', 'Rohes Schweinefleisch', 3, 1.8],
    ['porkchop_cooked', 'Gebratenes Schweinefleisch', 8, 12.8],
    ['beef_raw', 'Rohes Rindfleisch', 3, 1.8],
    ['beef_cooked', 'Steak', 8, 12.8],
    ['chicken_raw', 'Rohes Hühnchen', 2, 1.2],
    ['chicken_cooked', 'Gebratenes Hühnchen', 6, 7.2],
    ['mutton_raw', 'Rohes Hammelfleisch', 2, 1.2],
    ['mutton_cooked', 'Gebratenes Hammelfleisch', 6, 9.6],
    ['golden_apple', 'Goldener Apfel', 4, 9.6],
    ['blueberries', 'Blaubeeren', 2, 0.8],
    // Ambrosium ist im Aether das, was der goldene Apfel in der Oberwelt ist
    ['ambrosium_shard', 'Ambrosiumscherbe', 2, 1.2]
  ];
  foods.forEach(function (f) {
    define(f[0], { title: f[1], food: { hunger: f[2], sat: f[3] }, group: 'nahrung' });
  });

  // ---------- Werkzeuge ----------
  I.TIERS = {
    wood:      { level: 1, speed: 2,  dmg: 0, dur: 59,   mat: 'planks_oak' },
    stone:     { level: 2, speed: 4,  dmg: 1, dur: 131,  mat: 'cobblestone' },
    iron:      { level: 3, speed: 6,  dmg: 2, dur: 250,  mat: 'iron_ingot' },
    gold:      { level: 1, speed: 12, dmg: 0, dur: 32,   mat: 'gold_ingot' },
    diamond:   { level: 4, speed: 8,  dmg: 3, dur: 1561, mat: 'diamond' },
    // Aether: Heiligstein ist schnell, aber mürbe; Zanit liegt bei Eisen;
    // Gravitit schlägt Diamant, taugt aber nur mit Aether-Material
    holystone: { level: 2, speed: 5,  dmg: 1, dur: 90,   mat: 'holystone' },
    zanite:    { level: 3, speed: 7,  dmg: 2, dur: 420,  mat: 'zanite_gemstone' },
    gravitite: { level: 4, speed: 10, dmg: 4, dur: 1400, mat: 'gravitite' }
  };
  var tierTitle = {
    wood: 'Holz', stone: 'Stein', iron: 'Eisen', gold: 'Gold', diamond: 'Diamant',
    holystone: 'Heiligstein', zanite: 'Zanit', gravitite: 'Gravitit'
  };
  var toolTitle = { pickaxe: 'spitzhacke', axe: 'axt', shovel: 'schaufel', sword: 'schwert', hoe: 'hacke' };
  var toolBaseDmg = { pickaxe: 2, axe: 3, shovel: 1, sword: 4, hoe: 1 };

  Object.keys(I.TIERS).forEach(function (t) {
    var tier = I.TIERS[t];
    ['pickaxe', 'axe', 'shovel', 'sword', 'hoe'].forEach(function (tp) {
      define(t + '_' + tp, {
        title: tierTitle[t] + toolTitle[tp],
        stack: 1,
        durability: tier.dur,
        tool: { type: tp, level: tier.level, speed: tier.speed },
        damage: toolBaseDmg[tp] + tier.dmg,
        group: 'werkzeug',
        fuel: t === 'wood' ? 200 : 0
      });
    });
  });

  // Bett und Türen belegen zwei Blöcke, darum eigene Items statt Auto-Block-Items.
  // Ohne das Bett-Item lief das Bettrezept ins Leere.
  define('bed', { title: 'Bett', stack: 1, group: 'werkzeug', place: 'bed' });
  define('door_oak', { title: 'Holztür', tex: 'door_oak_lower', group: 'bau', fuel: 200, place: 'door_oak' });
  define('door_iron', { title: 'Eisentür', tex: 'door_iron_lower', group: 'bau', place: 'door_iron' });

  define('shears', { title: 'Schere', stack: 1, durability: 238, tool: { type: 'shears', level: 1, speed: 5 }, damage: 1, group: 'werkzeug' });
  define('bow', { title: 'Bogen', stack: 1, durability: 384, damage: 1, group: 'werkzeug' });
  define('bucket', { title: 'Eimer', stack: 1, group: 'werkzeug' });
  define('water_bucket', { title: 'Wassereimer', stack: 1, group: 'werkzeug' });
  define('lava_bucket', { title: 'Lavaeimer', stack: 1, group: 'werkzeug', fuel: 20000 });
  define('flint_and_steel', { title: 'Feuerzeug', stack: 1, durability: 64, group: 'werkzeug' });
  // In der Hand blendet der Kompass oben ein Band mit Himmelsrichtung und
  // Koordinaten ein – die Nadel selbst steckt in der Oberfläche, nicht im Item.
  define('compass', { title: 'Kompass', stack: 1, group: 'werkzeug' });

  // ---------- Rüstung ----------
  I.ARMOR = {
    leather: { def: [1, 3, 2, 1], dur: [55, 80, 75, 65], mat: 'leather', title: 'Leder' },
    gold: { def: [2, 5, 3, 1], dur: [77, 112, 105, 91], mat: 'gold_ingot', title: 'Gold' },
    iron: { def: [2, 6, 5, 2], dur: [165, 240, 225, 195], mat: 'iron_ingot', title: 'Eisen' },
    diamond: { def: [3, 8, 6, 3], dur: [363, 528, 495, 429], mat: 'diamond', title: 'Diamant' },
    zanite: { def: [2, 6, 5, 2], dur: [242, 352, 330, 286], mat: 'zanite_gemstone', title: 'Zanit' },
    gravitite: { def: [3, 8, 6, 3], dur: [418, 608, 570, 494], mat: 'gravitite', title: 'Gravitit' }
  };
  var armorPieces = ['helmet', 'chestplate', 'leggings', 'boots'];
  var armorTitle = ['helm', 'brustpanzer', 'hose', 'stiefel'];
  Object.keys(I.ARMOR).forEach(function (m) {
    var a = I.ARMOR[m];
    armorPieces.forEach(function (p, i) {
      define(m + '_' + p, {
        title: a.title + armorTitle[i], stack: 1, durability: a.dur[i],
        armor: { slot: i, defense: a.def[i] }, group: 'ruestung'
      });
    });
  });

  I.get = function (name) { return I.byName[name] || null; };

  I.isTool = function (name) { var it = I.byName[name]; return !!(it && it.tool); };

  // Abbaugeschwindigkeit eines Items auf einem Block
  I.breakSpeed = function (itemName, block) {
    var it = itemName ? I.byName[itemName] : null;
    var speed = 1;
    if (it && it.tool) {
      if (it.tool.type === block.tool) speed = it.tool.speed;
      else if (block.tool === 'shears' && it.tool.type === 'shears') speed = it.tool.speed;
      else if (it.tool.type === 'shears' && (block.name.indexOf('leaves') === 0 || block.name === 'tall_grass')) speed = 15;
      else if (it.tool.type === 'sword' && block.shape === MC.Blocks.SHAPE_CROSS) speed = 15;
    }
    return speed;
  };

  I.canHarvest = function (itemName, block) {
    if (!block.tool || block.level === 0) return true;
    var it = itemName ? I.byName[itemName] : null;
    if (!it || !it.tool) return false;
    if (it.tool.type !== block.tool) return false;
    return it.tool.level >= block.level;
  };

  // Zeit in Sekunden zum Abbauen
  I.breakTime = function (itemName, block) {
    if (block.hardness < 0) return Infinity;
    if (block.hardness === 0) return 0;
    var can = I.canHarvest(itemName, block);
    var speed = I.breakSpeed(itemName, block);
    return (block.hardness * (can ? 1.5 : 5)) / speed;
  };

  // ---------- Stack-Helfer ----------
  I.stackMax = function (name) {
    var it = I.byName[name];
    if (!it) return 64;
    if (it.durability > 0) return 1;
    return it.stack;
  };

  I.newStack = function (name, count) {
    var it = I.byName[name];
    if (!it) return null;
    var s = { id: name, count: count === undefined ? 1 : count };
    if (it.durability > 0) s.dur = it.durability;
    return s;
  };

  I.sameItem = function (a, b) {
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (a.dur !== undefined || b.dur !== undefined) return false; // Werkzeuge nie stapeln
    return true;
  };

  I.title = function (name) { var it = I.byName[name]; return it ? it.title : name; };

})();
