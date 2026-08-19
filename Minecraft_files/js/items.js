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
      iconTex: o.iconTex || null,   // eigenes Symbol, falls der Block anders aussieht
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
    ['sugar_cane_item', 'Zuckerrohrstange', 'material', 0],   // der Block heisst Zuckerrohr
    ['sugar', 'Zucker', 'material', 0],
    ['paper', 'Papier', 'material', 0],
    ['book', 'Buch', 'material', 0],
    ['glowstone_dust', 'Glowstonestaub', 'material', 0],
    ['arrow', 'Pfeil', 'werkzeug', 0],
    ['bowl', 'Schüssel', 'material', 200],
    // Nether
    ['quartz', 'Netherquarz', 'material', 0],
    // Aus dem Magmawürfel: das klebrige Zeug, das den Klebkolben klebrig macht
    ['slimeball', 'Schleimball', 'material', 0],
    ['nether_brick', 'Netherziegelstein', 'material', 0],
    // Aether
    ['zanite_gemstone', 'Zanit', 'material', 0],
    ['gravitite', 'Gravitit', 'material', 0],
    // Von der Aechorpflanze: die Heiltrankzutat des Aethers
    ['aechor_petal', 'Aechorschote', 'material', 0],
    // Meer
    ['prismarine_shard', 'Prismarinscherbe', 'material', 0],
    ['prismarine_crystals', 'Prismarinkristalle', 'material', 0],
    // Das Ende: Lohenrute und Enderperle ergeben zusammen das Enderauge
    ['blaze_rod', 'Lohenrute', 'material', 2400],
    ['blaze_powder', 'Lohenstaub', 'material', 0],
    ['ender_eye', 'Enderauge', 'material', 0]
  ];
  mats.forEach(function (m) { define(m[0], { title: m[1], group: m[2], fuel: m[3] }); });
  // Enderperlen stapeln sich wie im Original nur bis 16
  define('ender_pearl', { title: 'Enderperle', stack: 16, group: 'material' });

  // Redstonestaub wird als Leitung platziert, wie im Original, und alles rund
  // um Redstone bekommt im Kreativmenü einen eigenen Reiter
  // block statt place, damit placeBlock greift; das Symbol bleibt der Staub,
  // sonst zeigte das Inventar das Leitungskreuz
  I.byName['redstone'].block = 'redstone_wire';
  // Es gibt keine Textur namens "redstone" – der Staub heißt redstone_dust.
  // Ohne das war das Item im Inventar wie am Boden ein weißer Fleck.
  define('saddle', { title: 'Sattel', stack: 1, tex: 'saddle', group: 'werkzeug' });
  define('minecart', { title: 'Lore', stack: 1, tex: 'minecart', group: 'werkzeug' });
  define('shield', { title: 'Schild', stack: 1, tex: 'shield', durability: 336, group: 'werkzeug' });
  define('wand', { title: 'Auswahlstab', stack: 1, tex: 'wand', group: 'werkzeug' });

  I.byName['redstone'].iconTex = 'redstone_dust';
  // Schild, Rahmen und Gemälde sehen als Würfel falsch aus — sie bekommen ihr
  // eigenes Symbol.
  ['sign', 'item_frame', 'painting'].forEach(function (n) {
    if (I.byName[n]) I.byName[n].iconTex = n + '_item';
  });
  I.byName['redstone'].tex = 'redstone_dust';
  I.byName['redstone'].group = 'redstone';
  if (I.byName['tnt']) I.byName['tnt'].group = 'redstone';

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
    ['fish_raw', 'Roher Fisch', 2, 0.4],
    ['fish_cooked', 'Gebratener Fisch', 5, 6],
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
  // Karte: der Ausschnitt wird beim ersten Tragen festgelegt und bleibt dann
  define('map', { title: 'Karte', stack: 1, group: 'werkzeug' });
  // Verzauberungsbuch: trägt seine Verzauberung, bis der Amboss sie weitergibt
  define('enchanted_book', { title: 'Verzaubertes Buch', stack: 1, tex: 'book', group: 'material' });

  // ---------- Brauen ----------
  define('glass_bottle', { title: 'Glasflasche', stack: 16, group: 'nahrung' });
  define('water_bottle', { title: 'Wasserflasche', stack: 1, tex: 'potion_water', group: 'nahrung' });
  // Eigene Item-Grafik: ohne iconTex ginge das Symbol über den Block, und der
  // ist eine Pflanze mit Wuchsstufen — im Inventar lag dann die reife Staude
  // statt der Schote. Die Zuweisung stand früher weiter oben und lief ins
  // Leere, weil das Item hier erst entsteht.
  define('nether_wart_item', { title: 'Nethergewächs', tex: 'nether_wart_item',
    iconTex: 'nether_wart_item', group: 'natur', place: 'nether_wart' });
  define('ghast_tear', { title: 'Ghastträne', group: 'material' });
  // Für jeden Trank ein Item, dazu die gestreckte und die verstärkte Fassung
  MC.Effekte.TRAENKE && Object.keys(MC.Effekte.TRAENKE).forEach(function (k) {
    var t = MC.Effekte.TRAENKE[k];
    define('potion_' + k, { title: t.titel, stack: 1, tex: 'potion_' + k, group: 'nahrung' });
    if (!t.effekt) return;
    if (t.dauer) define('potion_' + k + '_lang', { title: t.titel + ' (gestreckt)', stack: 1, tex: 'potion_' + k, group: 'nahrung' });
    define('potion_' + k + '_stark', { title: t.titel + ' II', stack: 1, tex: 'potion_' + k, group: 'nahrung' });
  });

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

  // Der Detektorhelm entsteht aus einem Zanithelm, der in der Werkbank rundum
  // mit Diamanten belegt wird. Er schützt wie sein Vorgänger und meldet alle
  // halbe Minute, wenn in der Nähe etwas Wertvolles im Gestein steckt.
  define('detector_helmet', {
    // Haltbarkeit wie der Zanithelm, aus dem er entsteht. Vorher stand hier
    // 352 - der Wert des Zanit-Brustpanzers.
    title: 'Detektorhelm', stack: 1, durability: 242,
    armor: { slot: 0, defense: 2 }, group: 'ruestung'
  });

  // ---------- Spawn-Eier ----------
  // Wie im Original: ein Ei je Kreatur, nur im Kreativmenü. Die Liste steht
  // hier und nicht in entities.js, weil items.js und textures.js beide vor
  // entities.js geladen werden – und beide brauchen sie.
  // [Schlüssel, Anzeigename, Grundfarbe, Fleckenfarbe]
  I.EIER = [
    ['pig', 'Schwein', [240, 154, 158], [212, 96, 106]],
    ['cow', 'Kuh', [68, 48, 36], [216, 212, 208]],
    ['sheep', 'Schaf', [228, 220, 210], [164, 132, 122]],
    ['chicken', 'Huhn', [232, 232, 228], [232, 178, 62]],
    ['villager', 'Dorfbewohner', [86, 60, 44], [172, 140, 108]],
    ['zombie', 'Zombie', [0, 168, 88], [122, 168, 108]],
    ['skeleton', 'Skelett', [196, 196, 192], [72, 72, 72]],
    ['creeper', 'Creeper', [12, 208, 72], [0, 0, 0]],
    ['spider', 'Spinne', [58, 46, 40], [206, 44, 38]],
    ['enderman', 'Enderman', [22, 22, 26], [128, 84, 200]],
    ['piglin', 'Piglin', [232, 154, 132], [186, 106, 78]],
    ['piglin_brute', 'Piglin-Hauer', [232, 154, 132], [96, 66, 48]],
    ['ghast', 'Ghast', [246, 246, 250], [188, 188, 196]],
    ['magma_cube', 'Magmawürfel', [52, 32, 24], [232, 116, 32]],
    ['blaze', 'Lohe', [244, 176, 44], [252, 224, 96]],
    ['wither_skeleton', 'Witherskelett', [58, 58, 56], [20, 20, 20]],
    ['hoglin', 'Hoglin', [138, 92, 78], [92, 56, 44]],
    ['ash_wight', 'Aschenwicht', [86, 82, 84], [232, 128, 48]],
    ['moa', 'Moa', [120, 176, 232], [246, 246, 250]],
    ['phyg', 'Phyg', [240, 154, 158], [246, 246, 250]],
    ['sheepuff', 'Sheepuff', [228, 232, 244], [180, 200, 232]],
    ['cockatrice', 'Cockatrice', [96, 72, 132], [56, 40, 82]],
    ['zephyr', 'Zephyr', [214, 232, 248], [150, 190, 236]],
    ['frost_wight', 'Frostwicht', [176, 208, 232], [60, 130, 200]],
    ['aechor_plant', 'Aechorpflanze', [86, 150, 92], [196, 96, 176]],
    ['fish', 'Fisch', [98, 132, 170], [216, 228, 240]],
    ['guardian', 'Wächter', [88, 140, 138], [232, 150, 60]]
  ];
  I.EIER.forEach(function (e) {
    define('egg_' + e[0], { title: e[1] + '-Spawnei', stack: 16, group: 'eier' });
  });
  // Beim Start prüfen, ob jedes Ei auch eine Kreatur hat. entities.js lädt
  // später, darum erst dann – ein Ei ohne Mob wäre sonst ein toter Eintrag
  // im Kreativmenü, den niemand bemerkt.
  I.pruefeEier = function () {
    if (!MC.MOB_TYPES) return [];
    return I.EIER.map(function (e) { return e[0]; })
                 .filter(function (k) { return !MC.MOB_TYPES[k]; });
  };

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

  // Zeit in Sekunden zum Abbauen. `stack` nur, wenn Verzauberungen zählen sollen.
  I.breakTime = function (itemName, block, stack) {
    if (block.hardness < 0) return Infinity;
    if (block.hardness === 0) return 0;
    var can = I.canHarvest(itemName, block);
    var speed = I.breakSpeed(itemName, block);
    if (stack && MC.Ench) speed += MC.Ench.grabBonus(stack, block);
    return (block.hardness * (can ? 1.5 : 5)) / speed;
  };

  // ---------- Stack-Helfer ----------
  I.stackMax = function (name) {
    var it = I.byName[name];
    if (!it) return 64;
    if (it.durability > 0) return 1;
    return it.stack;
  };

  // Ein Stack trägt inzwischen mehr als Name und Zahl: Haltbarkeit,
  // Verzauberungen, Vorarbeit am Amboss, eigener Name. Kopiert wird deshalb
  // über eine Stelle – jede handgeschriebene Kopie hätte irgendwann ein Feld
  // vergessen und die Verzauberung stillschweigend verschluckt.
  I.copyStack = function (s, count) {
    if (!s) return null;
    var n = { id: s.id, count: count === undefined ? s.count : count };
    if (s.dur !== undefined) n.dur = s.dur;
    if (s.ench) { n.ench = {}; for (var k in s.ench) n.ench[k] = s.ench[k]; }
    if (s.pw) n.pw = s.pw;
    if (s.eigenName) n.eigenName = s.eigenName;
    if (s.karte) n.karte = s.karte;
    return n;
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
    if (a.ench || b.ench) return false;   // zwei Zauberbücher sind nicht dasselbe
    return true;
  };

  I.title = function (name) { var it = I.byName[name]; return it ? it.title : name; };

})();
