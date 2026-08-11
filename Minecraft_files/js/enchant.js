/* ============================================================
   enchant.js  -  Verzauberungen: Modell, Tisch, Wirkung

   Die Zahlen sind die aus dem Original und gelten dort seit 1.8 unverändert.
   Wer Minecraft kennt, soll sich an unserem Tisch nicht umgewöhnen müssen –
   dasselbe Prinzip wie beim Redstone.
   ============================================================ */
(function () {
  'use strict';

  var E = {};
  MC.Ench = E;

  var U = MC.U, I = MC.Items, B = MC.Blocks;

  // ============================================================
  //  Die Verzauberungen
  // ============================================================
  // min/max = Stufenfenster: in diesem Bereich muss der Verzauberungswert
  // liegen, damit diese Stufe überhaupt in Frage kommt.
  // gewicht: häufig 10, ungewöhnlich 5, selten 2, sehr selten 1.
  var L = [
    // ---- Rüstung ----
    { key: 'protection', titel: 'Schutz', max: 4, gewicht: 10, ziel: 'ruestung',
      min: [1, 12, 23, 34], hi: [12, 23, 34, 45], streit: ['fire_protection', 'blast_protection', 'projectile_protection'] },
    { key: 'fire_protection', titel: 'Feuerschutz', max: 4, gewicht: 5, ziel: 'ruestung',
      min: [10, 18, 26, 34], hi: [18, 26, 34, 42], streit: ['protection', 'blast_protection', 'projectile_protection'] },
    { key: 'blast_protection', titel: 'Explosionsschutz', max: 4, gewicht: 2, ziel: 'ruestung',
      min: [5, 13, 21, 29], hi: [13, 21, 29, 37], streit: ['protection', 'fire_protection', 'projectile_protection'] },
    { key: 'projectile_protection', titel: 'Geschossschutz', max: 4, gewicht: 5, ziel: 'ruestung',
      min: [3, 9, 15, 21], hi: [9, 15, 21, 27], streit: ['protection', 'fire_protection', 'blast_protection'] },
    { key: 'feather_falling', titel: 'Federfall', max: 4, gewicht: 5, ziel: 'stiefel',
      min: [5, 11, 17, 23], hi: [11, 17, 23, 29] },
    { key: 'respiration', titel: 'Atmung', max: 3, gewicht: 2, ziel: 'helm',
      min: [10, 20, 30], hi: [40, 50, 60] },
    { key: 'aqua_affinity', titel: 'Wasseraffinität', max: 1, gewicht: 2, ziel: 'helm',
      min: [1], hi: [41] },
    { key: 'thorns', titel: 'Dornen', max: 3, gewicht: 1, ziel: 'brustpanzer',
      min: [10, 30, 50], hi: [60, 80, 100] },
    // ---- Waffe ----
    { key: 'sharpness', titel: 'Schärfe', max: 5, gewicht: 10, ziel: 'schwert',
      min: [1, 12, 23, 34, 45], hi: [21, 32, 43, 54, 65], streit: ['smite', 'bane_of_arthropods'] },
    { key: 'smite', titel: 'Bann', max: 5, gewicht: 5, ziel: 'schwert',
      min: [5, 13, 21, 29, 37], hi: [25, 33, 41, 49, 57], streit: ['sharpness', 'bane_of_arthropods'] },
    { key: 'bane_of_arthropods', titel: 'Nemesis der Gliederfüßer', max: 5, gewicht: 5, ziel: 'schwert',
      min: [5, 13, 21, 29, 37], hi: [25, 33, 41, 49, 57], streit: ['sharpness', 'smite'] },
    { key: 'knockback', titel: 'Rückstoß', max: 2, gewicht: 5, ziel: 'schwert',
      min: [5, 25], hi: [55, 75] },
    { key: 'fire_aspect', titel: 'Verbrennung', max: 2, gewicht: 2, ziel: 'schwert',
      min: [10, 30], hi: [60, 80] },
    { key: 'looting', titel: 'Plünderung', max: 3, gewicht: 2, ziel: 'schwert',
      min: [15, 24, 33], hi: [65, 74, 83] },
    // ---- Werkzeug ----
    { key: 'efficiency', titel: 'Effizienz', max: 5, gewicht: 10, ziel: 'werkzeug',
      min: [1, 11, 21, 31, 41], hi: [51, 61, 71, 81, 91] },
    { key: 'silk_touch', titel: 'Behutsamkeit', max: 1, gewicht: 1, ziel: 'grabwerkzeug',
      min: [15], hi: [65], streit: ['fortune'] },
    { key: 'fortune', titel: 'Glück', max: 3, gewicht: 2, ziel: 'grabwerkzeug',
      min: [15, 24, 33], hi: [65, 74, 83], streit: ['silk_touch'] },
    // ---- Bogen ----
    { key: 'power', titel: 'Stärke', max: 5, gewicht: 10, ziel: 'bogen',
      min: [1, 11, 21, 31, 41], hi: [16, 26, 36, 46, 56] },
    { key: 'punch', titel: 'Schlag', max: 2, gewicht: 2, ziel: 'bogen',
      min: [12, 32], hi: [37, 57] },
    { key: 'flame', titel: 'Flamme', max: 1, gewicht: 2, ziel: 'bogen',
      min: [20], hi: [50] },
    { key: 'infinity', titel: 'Unendlichkeit', max: 1, gewicht: 1, ziel: 'bogen',
      min: [20], hi: [50], streit: ['mending'] },
    // ---- überall ----
    { key: 'unbreaking', titel: 'Haltbarkeit', max: 3, gewicht: 5, ziel: 'alles',
      min: [5, 13, 21], hi: [55, 63, 71] },
    { key: 'mending', titel: 'Reparatur', max: 1, gewicht: 2, ziel: 'alles',
      min: [25], hi: [75], streit: ['infinity'] }
  ];
  E.LISTE = L;
  var NACH_KEY = {};
  L.forEach(function (e) { NACH_KEY[e.key] = e; });
  E.get = function (key) { return NACH_KEY[key] || null; };

  var ROEMISCH = ['', 'I', 'II', 'III', 'IV', 'V'];
  E.roemisch = function (n) { return ROEMISCH[n] || String(n); };

  // ============================================================
  //  Wo passt was drauf
  // ============================================================
  var GRABEN = { pickaxe: 1, axe: 1, shovel: 1, hoe: 1 };

  E.passt = function (ziel, itemName) {
    var it = I.get(itemName);
    if (!it) return false;
    if (itemName === 'enchanted_book') return true;      // ins Buch geht alles
    var werkzeug = it.tool ? it.tool.type : null;
    switch (ziel) {
      case 'alles': return it.durability > 0;
      case 'schwert': return werkzeug === 'sword';
      case 'werkzeug': return !!(werkzeug && (GRABEN[werkzeug] || werkzeug === 'shears'));
      case 'grabwerkzeug': return !!(werkzeug && GRABEN[werkzeug]);
      case 'bogen': return itemName === 'bow';
      case 'ruestung': return !!it.armor;
      case 'helm': return !!(it.armor && it.armor.slot === 0);
      case 'brustpanzer': return !!(it.armor && it.armor.slot === 1);
      case 'stiefel': return !!(it.armor && it.armor.slot === 3);
    }
    return false;
  };

  E.verzauberbar = function (stack) {
    if (!stack) return false;
    var it = I.get(stack.id);
    if (!it) return false;
    if (stack.id === 'book' || stack.id === 'enchanted_book') return true;
    if (it.durability <= 0) return false;
    if (stack.ench) return false;              // schon verzaubert
    return true;
  };

  // ============================================================
  //  Verzauberbarkeit des Materials
  // ============================================================
  // Original: Holz/Leder 15, Stein 5, Eisen 14 (Rüstung 9), Gold 22 (25),
  // Diamant 10, Buch und Bogen 1. Heiligstein, Zanit und Gravitit gibt es dort
  // nicht – Zanit ist bei uns das magischere Material, Gravitit hart wie Diamant.
  var WERK_V = { wood: 15, stone: 5, iron: 14, gold: 22, diamond: 10,
                 holystone: 8, zanite: 16, gravitite: 10 };
  var RUEST_V = { leather: 15, gold: 25, iron: 9, diamond: 10, zanite: 12, gravitite: 10 };

  E.verzauberbarkeit = function (itemName) {
    if (itemName === 'book' || itemName === 'enchanted_book' || itemName === 'bow') return 1;
    if (itemName === 'shears') return 14;
    if (itemName === 'detector_helmet') return 12;
    var teil = itemName.lastIndexOf('_');
    if (teil < 0) return 1;
    var mat = itemName.slice(0, teil), rest = itemName.slice(teil + 1);
    if (rest === 'helmet' || rest === 'chestplate' || rest === 'leggings' || rest === 'boots') {
      return RUEST_V[mat] || 10;
    }
    return WERK_V[mat] || 10;
  };

  // ============================================================
  //  Bücherregale zählen
  // ============================================================
  // Originalregel: wirksam ist ein Regal, das genau zwei Blöcke entfernt auf
  // einer Waagerechten steht, bis zu zwei auf der anderen, auf Tischhöhe oder
  // einen darüber – und zwischen Tisch und Regal muss Luft sein. Höchstens 15.
  E.regale = function (world, x, y, z) {
    var shelf = B.id('bookshelf');
    var n = 0;
    function istRegal(bx, by, bz) { return world.getBlock(bx, by, bz) === shelf; }
    function frei(bx, by, bz) {
      var id = world.getBlock(bx, by, bz);
      if (id === 0) return true;
      var b = B.byId[id];
      return !!(b && !b.opaque);
    }
    for (var dz = -1; dz <= 1; dz++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        if (!frei(x + dx, y, z + dz) || !frei(x + dx, y + 1, z + dz)) continue;
        for (var dy = 0; dy <= 1; dy++) {
          if (istRegal(x + dx * 2, y + dy, z + dz * 2)) n++;
          if (dx !== 0 && dz !== 0) {
            if (istRegal(x + dx * 2, y + dy, z + dz)) n++;
            if (istRegal(x + dx, y + dy, z + dz * 2)) n++;
          }
        }
      }
    }
    return Math.min(15, n);
  };

  // ============================================================
  //  Die drei Angebote
  // ============================================================
  function irnd(rnd, n) { return (rnd() * (n + 1)) | 0; }          // 0..n
  function dreieck(rnd, n) { return (rnd() + rnd() - 1) * n; }     // um 0, dreieckig

  // xpBasis = 1 + zufall(0..7) + floor(regale/2) + zufall(0..regale)
  E.angebote = function (stack, regale, rnd) {
    var b = Math.min(15, regale);
    var basis = 1 + irnd(rnd, 7) + Math.floor(b / 2) + irnd(rnd, b);
    var kosten = [
      Math.floor(Math.max(1, basis / 3)),
      Math.floor(2 * basis / 3) + 1,
      Math.floor(Math.max(basis, 2 * b))
    ];
    var out = [];
    for (var s = 0; s < 3; s++) {
      // Jeder Platz würfelt seine Verzauberung aus einem eigenen, aber festen
      // Faden – sonst änderte sich das Angebot bei jedem Neuzeichnen.
      var r = U.rng(U.hashString('slot:' + s + ':' + kosten.join(',') + ':' + stack.id + ':' + (stack.dur || 0)));
      var ench = E.wuerfeln(stack.id, kosten[s], r);
      out.push({ stufe: kosten[s], lapis: s + 1, ench: ench });
    }
    return out;
  };

  // Verzauberungswert und daraus die Auswahl – beides wie im Original
  E.wuerfeln = function (itemName, slotKosten, rnd) {
    var V = E.verzauberbarkeit(itemName);
    var vier = Math.floor(V / 4);
    var e = Math.round((slotKosten + 1 + irnd(rnd, vier) + irnd(rnd, vier)) * (1 + dreieck(rnd, 0.15)));
    if (e < 1) e = 1;

    var gewaehlt = {};
    var erste = ziehen(itemName, e, gewaehlt, rnd);
    if (!erste) return gewaehlt;
    gewaehlt[erste.key] = erste.stufe;

    // Danach halbiert sich der Wert, und mit (e+1)/50 kommt noch eine dazu
    for (;;) {
      e = e >> 1;
      if (irnd(rnd, 49) > e) break;
      var w = ziehen(itemName, e, gewaehlt, rnd);
      if (!w) break;
      gewaehlt[w.key] = w.stufe;
    }
    return gewaehlt;
  };

  // Eine Verzauberung nach Gewicht ziehen, die zum Wert passt und sich mit den
  // schon gewählten verträgt. Genommen wird immer die höchste passende Stufe.
  function ziehen(itemName, wert, schon, rnd) {
    var kand = [], summe = 0;
    for (var i = 0; i < L.length; i++) {
      var en = L[i];
      if (schon[en.key] !== undefined) continue;
      if (!E.passt(en.ziel, itemName)) continue;
      if (en.streit && en.streit.some(function (k) { return schon[k] !== undefined; })) continue;
      var stufe = 0;
      for (var s = en.max; s >= 1; s--) {
        if (wert >= en.min[s - 1] && wert <= en.hi[s - 1]) { stufe = s; break; }
      }
      if (!stufe) continue;
      kand.push({ key: en.key, stufe: stufe, gewicht: en.gewicht });
      summe += en.gewicht;
    }
    if (!kand.length) return null;
    var z = rnd() * summe;
    for (var k = 0; k < kand.length; k++) {
      z -= kand[k].gewicht;
      if (z <= 0) return kand[k];
    }
    return kand[kand.length - 1];
  }

  // ============================================================
  //  Auf einen Stack anwenden
  // ============================================================
  E.anwenden = function (stack, ench) {
    if (!stack || !ench) return stack;
    var keys = Object.keys(ench);
    if (!keys.length) return stack;
    if (stack.id === 'book') {
      // Ein Buch nimmt die Verzauberung auf, statt sie zu tragen. Wie im
      // Original fällt dabei eine wieder heraus, wenn es mehrere wurden.
      var kopie = {};
      keys.forEach(function (k) { kopie[k] = ench[k]; });
      var alle = Object.keys(kopie);
      if (alle.length > 1) delete kopie[alle[(Math.random() * alle.length) | 0]];
      stack.id = 'enchanted_book';
      stack.ench = kopie;
      delete stack.dur;
      return stack;
    }
    stack.ench = {};
    keys.forEach(function (k) { stack.ench[k] = ench[k]; });
    return stack;
  };

  E.stufe = function (stack, key) {
    return (stack && stack.ench && stack.ench[key]) || 0;
  };

  // Lesbare Liste für den Tooltip
  E.beschreiben = function (stack) {
    if (!stack || !stack.ench) return [];
    var out = [];
    for (var k in stack.ench) {
      var en = NACH_KEY[k];
      if (!en) continue;
      out.push(en.titel + (en.max > 1 ? ' ' + E.roemisch(stack.ench[k]) : ''));
    }
    return out.sort();
  };

  // ============================================================
  //  Amboss
  // ============================================================
  // Der Preis einer Verzauberung hängt an ihrer Seltenheit. Aus einem Buch ist
  // sie halb so teuer wie von einem Werkzeug – so wie im Original.
  var PREIS_ITEM = { 10: 1, 5: 2, 2: 4, 1: 8 };
  var PREIS_BUCH = { 10: 1, 5: 1, 2: 2, 1: 4 };
  E.ZU_TEUER = 40;

  // Womit sich ein Stück reparieren lässt: mit dem Material, aus dem es besteht
  E.reparaturMaterial = function (itemName) {
    var teil = itemName.lastIndexOf('_');
    if (teil < 0) return null;
    var mat = itemName.slice(0, teil), rest = itemName.slice(teil + 1);
    if (rest === 'helmet' || rest === 'chestplate' || rest === 'leggings' || rest === 'boots') {
      return I.ARMOR[mat] ? I.ARMOR[mat].mat : null;
    }
    if (I.TIERS[mat]) {
      // Holzwerkzeug flickt man mit Brettern – das Rezept nimmt jede Sorte,
      // hier genügt die Eiche
      return I.TIERS[mat].mat;
    }
    return null;
  };

  // Verzauberungen von `quelle` auf `ziel` übertragen, gibt die Kosten zurück
  function mischen(ziel, quelle) {
    if (!quelle.ench) return 0;
    var ausBuch = quelle.id === 'enchanted_book';
    var tabelle = ausBuch ? PREIS_BUCH : PREIS_ITEM;
    var kosten = 0;
    if (!ziel.ench) ziel.ench = {};
    for (var k in quelle.ench) {
      var en = NACH_KEY[k];
      if (!en) continue;
      // Auf ein Buch passt alles, auf ein Werkzeug nur, was dorthin gehört
      if (ziel.id !== 'enchanted_book' && !E.passt(en.ziel, ziel.id)) continue;
      // Unverträgliches kostet trotzdem einen Punkt, wie im Original
      if (en.streit && en.streit.some(function (s) { return ziel.ench[s] !== undefined; })) { kosten++; continue; }
      var alt = ziel.ench[k] || 0, neu = quelle.ench[k];
      var stufe = (alt === neu) ? Math.min(en.max, alt + 1) : Math.max(alt, neu);
      if (stufe === alt) { kosten++; continue; }
      ziel.ench[k] = stufe;
      kosten += stufe * (tabelle[en.gewicht] || 1);
    }
    return kosten;
  }

  // links = das Stück, das bleibt. rechts = Opfergabe. name = neuer Name oder null.
  // Gibt null zurück, wenn die Kombination nichts ergibt.
  E.amboss = function (links, rechts, name) {
    if (!links) return null;
    var itL = I.get(links.id);
    if (!itL) return null;
    var out = I.copyStack(links, 1);
    var vorarbeit = (links.pw || 0) + (rechts ? (rechts.pw || 0) : 0);
    var kosten = (Math.pow(2, links.pw || 0) - 1) + (rechts ? Math.pow(2, rechts.pw || 0) - 1 : 0);
    var getan = false;
    var verbraucht = 1;

    if (rechts) {
      var mat = E.reparaturMaterial(links.id);
      if (mat && rechts.id === mat && links.dur !== undefined && links.dur < itL.durability) {
        // Reparieren mit Material: ein Stück flickt ein Viertel
        var proStueck = Math.ceil(itL.durability / 4);
        var n = Math.min(rechts.count, Math.ceil((itL.durability - links.dur) / proStueck));
        out.dur = Math.min(itL.durability, links.dur + n * proStueck);
        kosten += n; verbraucht = n; getan = true;
      } else if (rechts.id === links.id && links.dur !== undefined) {
        // Zwei gleiche Stücke: Resthaltbarkeit plus 12 % Bonus, dann mischen
        var rest = (rechts.dur === undefined ? itL.durability : rechts.dur) + Math.floor(itL.durability * 0.12);
        if (links.dur < itL.durability) { out.dur = Math.min(itL.durability, links.dur + rest); kosten += 2; getan = true; }
        var m1 = mischen(out, rechts);
        if (m1 > 0) getan = true;
        kosten += m1;
      } else if (rechts.id === 'enchanted_book') {
        var m2 = mischen(out, rechts);
        if (m2 > 0) getan = true;
        kosten += m2;
      } else {
        return null;
      }
    }

    if (name !== null && name !== undefined && name !== (links.eigenName || itL.title)) {
      out.eigenName = name.trim() ? name.trim().slice(0, 32) : null;
      if (!out.eigenName) delete out.eigenName;
      kosten += 1; getan = true;
    }
    if (!getan) return null;
    out.pw = Math.max(links.pw || 0, rechts ? (rechts.pw || 0) : 0) + 1;
    return { out: out, kosten: Math.max(1, Math.round(kosten)), verbraucht: verbraucht,
             zuTeuer: kosten >= E.ZU_TEUER, vorarbeit: vorarbeit };
  };

  E.anzeigeName = function (stack) {
    if (!stack) return '';
    if (stack.eigenName) return stack.eigenName;
    var it = I.get(stack.id);
    return it ? it.title : stack.id;
  };

  // ============================================================
  //  Wirkung
  // ============================================================

  // Effizienz: +Stufe²+1 auf die Abbaugeschwindigkeit, aber nur mit dem
  // richtigen Werkzeug – sonst hackte man mit der Spitzhacke Holz.
  E.grabBonus = function (stack, block) {
    var s = E.stufe(stack, 'efficiency');
    if (!s) return 0;
    var it = I.get(stack.id);
    if (!it || !it.tool || it.tool.type !== block.tool) return 0;
    return s * s + 1;
  };

  // Haltbarkeit: mit Stufe n wird nur noch in 1/(n+1) der Fälle abgenutzt.
  // Rüstung hält im Original grundsätzlich länger durch.
  E.verbraucht = function (stack, istRuestung) {
    var s = E.stufe(stack, 'unbreaking');
    if (!s) return true;
    if (istRuestung) return Math.random() < 0.6 + 0.4 / (s + 1);
    return Math.random() < 1 / (s + 1);
  };

  // Schärfe: 1 + 0,5 je weiterer Stufe. Bann und Nemesis zählen nur gegen ihre
  // Gruppe, dafür kräftiger.
  E.schadenBonus = function (stack, ziel) {
    var d = 0;
    var sc = E.stufe(stack, 'sharpness');
    if (sc) d += 1 + (sc - 1) * 0.5;
    var untot = ziel && (ziel.mobType === 'zombie' || ziel.mobType === 'skeleton');
    if (untot) d += E.stufe(stack, 'smite') * 2.5;
    var krabbler = ziel && (ziel.mobType === 'spider' || ziel.mobType === 'silverfish');
    if (krabbler) d += E.stufe(stack, 'bane_of_arthropods') * 2.5;
    return d;
  };

  // Schutz: alle vier Arten zahlen auf denselben Topf ein, gedeckelt bei 20.
  // Das Original rechnet 4 % Abzug je Punkt.
  E.schutzFaktor = function (inv, art) {
    var epf = 0;
    for (var i = 0; i < 4; i++) {
      var a = inv.armor[i];
      if (!a || !a.ench) continue;
      epf += E.stufe(a, 'protection');
      if (art === 'feuer') epf += E.stufe(a, 'fire_protection') * 2;
      if (art === 'explosion') epf += E.stufe(a, 'blast_protection') * 2;
      if (art === 'geschoss') epf += E.stufe(a, 'projectile_protection') * 2;
      if (art === 'fall') epf += E.stufe(a, 'feather_falling') * 3;
    }
    return 1 - Math.min(20, epf) * 0.04;
  };

  E.dornen = function (inv) {
    var s = 0;
    for (var i = 0; i < 4; i++) if (inv.armor[i]) s = Math.max(s, E.stufe(inv.armor[i], 'thorns'));
    if (!s) return 0;
    return Math.random() < s * 0.15 ? 1 + ((Math.random() * 4) | 0) : 0;
  };

  // Reparatur: eine Erfahrungskugel flickt statt Stufen zu geben. Zwei
  // Haltbarkeitspunkte je Erfahrungspunkt, wie im Original.
  E.reparieren = function (inv, menge) {
    var kandidaten = [];
    var sel = inv.slots[inv.selected];
    if (sel && sel.ench && sel.ench.mending && sel.dur !== undefined) kandidaten.push(sel);
    for (var i = 0; i < 4; i++) {
      var a = inv.armor[i];
      if (a && a.ench && a.ench.mending && a.dur !== undefined) kandidaten.push(a);
    }
    var offen = kandidaten.filter(function (s) {
      var it = I.get(s.id);
      return it && s.dur < it.durability;
    });
    if (!offen.length) return menge;
    var ziel = offen[(Math.random() * offen.length) | 0];
    var it2 = I.get(ziel.id);
    var fehlt = it2.durability - ziel.dur;
    var heilt = Math.min(fehlt, menge * 2);
    ziel.dur += heilt;
    return menge - Math.ceil(heilt / 2);
  };

})();
