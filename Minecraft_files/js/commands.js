/* ============================================================
   commands.js  -  Chatzeile, Zielauswahl und Befehle

   Aufgebaut wie im Original: ein Zerleger, der `~`- und `^`-Koordinaten und
   die Zielauswahl `@s @p @a @r @e` mit Argumenten versteht, und darüber eine
   Tabelle von Befehlen. Jeder einzelne Befehl ist damit nur noch ein
   Tabelleneintrag – die Arbeit steckt im Gerüst, nicht in den Befehlen.

   Bewusst nicht dabei: alles, was Mehrspieler, NBT oder einen Punktestand
   voraussetzt (/data, /scoreboard, /tag, /kick …). Siehe docs/COMMAND-PLAN.md.
   ============================================================ */
(function () {
  'use strict';

  var C = {};
  MC.Cmd = C;

  var B = MC.Blocks, I = MC.Items, U = MC.U;

  // ============================================================
  //  Fehler
  // ============================================================
  // Ein eigener Typ, damit ein Fehler im Befehl nicht wie ein Programmfehler
  // aussieht: er landet als rote Zeile im Chat statt in der Konsole.
  function Fehler(text, stelle) {
    this.text = text;
    this.stelle = stelle;
  }
  C.Fehler = Fehler;

  // ============================================================
  //  Der Leser: zerlegt die Zeile Stück für Stück
  // ============================================================
  function Leser(text) {
    this.text = text;
    this.pos = 0;
  }
  Leser.prototype.restlos = function () {
    while (this.pos < this.text.length && this.text[this.pos] === ' ') this.pos++;
    return this.pos >= this.text.length;
  };
  Leser.prototype.wort = function (was) {
    while (this.pos < this.text.length && this.text[this.pos] === ' ') this.pos++;
    var start = this.pos;
    // Eine Zielauswahl darf Leerzeichen in ihren Klammern haben
    var tiefe = 0;
    while (this.pos < this.text.length) {
      var c = this.text[this.pos];
      if (c === '[') tiefe++;
      else if (c === ']') tiefe--;
      else if (c === ' ' && tiefe <= 0) break;
      this.pos++;
    }
    if (start === this.pos) throw new Fehler('Hier fehlt ' + (was || 'noch etwas'), start);
    return this.text.slice(start, this.pos);
  };
  Leser.prototype.rest = function () {
    while (this.pos < this.text.length && this.text[this.pos] === ' ') this.pos++;
    var r = this.text.slice(this.pos);
    this.pos = this.text.length;
    return r;
  };
  Leser.prototype.optional = function () {
    var merk = this.pos;
    if (this.restlos()) { this.pos = merk; return null; }
    return this.wort();
  };
  Leser.prototype.zahl = function (was) {
    var w = this.wort(was);
    var n = parseFloat(w);
    if (!isFinite(n)) throw new Fehler('"' + w + '" ist keine Zahl', this.pos - w.length);
    return n;
  };

  // ============================================================
  //  Koordinaten
  // ============================================================
  // `~` ist relativ zum Ausführenden, `^` relativ zu seiner Blickrichtung.
  // Ohne beides wäre die Hälfte der Befehle unbrauchbar, weil man für jeden
  // erst die eigenen Koordinaten ablesen müsste.
  function einKoord(w, basis, stelle) {
    if (w[0] === '~') {
      var r = w.length > 1 ? parseFloat(w.slice(1)) : 0;
      if (!isFinite(r)) throw new Fehler('"' + w + '" ist keine Koordinate', stelle);
      return basis + r;
    }
    var n = parseFloat(w);
    if (!isFinite(n)) throw new Fehler('"' + w + '" ist keine Koordinate', stelle);
    return n;
  }

  C.leseOrt = function (leser, kontext) {
    var s = leser.pos;
    var a = leser.wort('eine X-Koordinate');
    var b = leser.wort('eine Y-Koordinate');
    var c = leser.wort('eine Z-Koordinate');
    var q = kontext.ort;

    // Blickrichtungskoordinaten: alle drei oder keine, wie im Original
    var caret = (a[0] === '^') + (b[0] === '^') + (c[0] === '^');
    if (caret === 3) {
      var l = parseFloat(a.slice(1) || '0'), h = parseFloat(b.slice(1) || '0'), v = parseFloat(c.slice(1) || '0');
      if (!isFinite(l) || !isFinite(h) || !isFinite(v)) throw new Fehler('Ungültige ^-Koordinate', s);
      var yaw = kontext.yaw || 0, pit = kontext.pitch || 0;
      // vorwärts = (sin yaw · cos pitch, -sin pitch, cos yaw · cos pitch)
      var fx = Math.sin(yaw) * Math.cos(pit), fy = -Math.sin(pit), fz = Math.cos(yaw) * Math.cos(pit);
      var rx = Math.cos(yaw), rz = -Math.sin(yaw);
      var ux = -Math.sin(yaw) * Math.sin(pit), uy = Math.cos(pit), uz = -Math.cos(yaw) * Math.sin(pit);
      return {
        x: q.x + rx * l + ux * h + fx * v,
        y: q.y + 0 * l + uy * h + fy * v,
        z: q.z + rz * l + uz * h + fz * v
      };
    }
    if (caret > 0) throw new Fehler('^ gilt für alle drei Koordinaten oder für keine', s);
    return { x: einKoord(a, q.x, s), y: einKoord(b, q.y, s), z: einKoord(c, q.z, s) };
  };

  C.leseBlockOrt = function (leser, kontext) {
    var o = C.leseOrt(leser, kontext);
    return { x: Math.floor(o.x), y: Math.floor(o.y), z: Math.floor(o.z) };
  };

  // ============================================================
  //  Zielauswahl
  // ============================================================
  // Kein Mehrspieler heißt, dass @a, @p und @s praktisch zusammenfallen. Sie
  // trotzdem alle zu kennen kostet ein paar Zeilen und macht jedes Rezept aus
  // dem Netz lauffähig.
  var AUSWAHL = { '@s': 1, '@p': 1, '@a': 1, '@r': 1, '@e': 1 };
  C.AUSWAHL = AUSWAHL;

  function argumenteLesen(text, stelle) {
    // "type=zombie,distance=..10,limit=3"
    var args = {};
    if (!text) return args;
    var teile = [], tiefe = 0, akt = '';
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '{' || c === '[') tiefe++;
      if (c === '}' || c === ']') tiefe--;
      if (c === ',' && tiefe === 0) { teile.push(akt); akt = ''; continue; }
      akt += c;
    }
    if (akt) teile.push(akt);
    for (var t = 0; t < teile.length; t++) {
      var p = teile[t].indexOf('=');
      if (p < 0) throw new Fehler('"' + teile[t] + '" braucht ein = ', stelle);
      args[teile[t].slice(0, p).trim()] = teile[t].slice(p + 1).trim();
    }
    return args;
  }

  // "..10", "3..", "2..8" oder "5"
  function bereich(w) {
    var p = w.indexOf('..');
    if (p < 0) { var n = parseFloat(w); return { min: n, max: n }; }
    var a = w.slice(0, p), b = w.slice(p + 2);
    return { min: a === '' ? -Infinity : parseFloat(a), max: b === '' ? Infinity : parseFloat(b) };
  }
  function inBereich(v, r) { return v >= r.min && v <= r.max; }

  C.leseZiele = function (wort, kontext, stelle) {
    var game = kontext.game, spieler = game.player;
    if (wort[0] !== '@') {
      // Ein Name. Wir haben genau einen Spieler – alles andere ist ein Irrtum.
      if (wort === 'Spieler' || wort === 'player' || wort === (game.spielerName || 'Spieler')) return [spieler];
      throw new Fehler('Kein Ziel namens "' + wort + '"', stelle);
    }
    var art = wort.slice(0, 2);
    if (!AUSWAHL[art]) throw new Fehler('Unbekannte Zielauswahl "' + art + '"', stelle);
    var klammer = wort.indexOf('[');
    var args = klammer >= 0
      ? argumenteLesen(wort.slice(klammer + 1, wort.lastIndexOf(']')), stelle)
      : {};

    var liste;
    if (art === '@s') liste = [kontext.selbst || spieler];
    else if (art === '@p' || art === '@a') liste = [spieler];
    else liste = [spieler].concat(game.world.entities.filter(function (e) { return !e.dead; }));
    if (art === '@e' && args.type === 'player') liste = [spieler];

    var q = kontext.ort;
    liste = liste.filter(function (e) {
      if (args.type !== undefined) {
        var typ = (e === spieler) ? 'player' : (e.mobType || e.type || '');
        var neg = args.type[0] === '!';
        var soll = neg ? args.type.slice(1) : args.type;
        if ((typ === soll) === neg) return false;
      }
      if (args.distance !== undefined) {
        var d = Math.sqrt((e.x - q.x) * (e.x - q.x) + (e.y - q.y) * (e.y - q.y) + (e.z - q.z) * (e.z - q.z));
        if (!inBereich(d, bereich(args.distance))) return false;
      }
      // Quader: x/y/z als Ecke, dx/dy/dz als Kantenlänge
      if (args.x !== undefined || args.dx !== undefined) {
        var ex = args.x !== undefined ? +args.x : q.x, edx = args.dx !== undefined ? +args.dx : 0;
        if (e.x < Math.min(ex, ex + edx) || e.x > Math.max(ex, ex + edx) + 1) return false;
      }
      if (args.y !== undefined || args.dy !== undefined) {
        var ey = args.y !== undefined ? +args.y : q.y, edy = args.dy !== undefined ? +args.dy : 0;
        if (e.y < Math.min(ey, ey + edy) || e.y > Math.max(ey, ey + edy) + 1) return false;
      }
      if (args.z !== undefined || args.dz !== undefined) {
        var ez = args.z !== undefined ? +args.z : q.z, edz = args.dz !== undefined ? +args.dz : 0;
        if (e.z < Math.min(ez, ez + edz) || e.z > Math.max(ez, ez + edz) + 1) return false;
      }
      if (args.name !== undefined) {
        var nm = (e === spieler) ? 'Spieler' : (e.eigenName || e.mobType || '');
        if (nm !== args.name) return false;
      }
      if (args.gamemode !== undefined && e === spieler && game.mode !== args.gamemode) return false;
      return true;
    });

    if (args.sort === 'nearest' || art === '@p') {
      liste.sort(function (a, b) {
        return ((a.x - q.x) * (a.x - q.x) + (a.z - q.z) * (a.z - q.z))
             - ((b.x - q.x) * (b.x - q.x) + (b.z - q.z) * (b.z - q.z));
      });
    } else if (args.sort === 'furthest') {
      liste.sort(function (a, b) {
        return ((b.x - q.x) * (b.x - q.x) + (b.z - q.z) * (b.z - q.z))
             - ((a.x - q.x) * (a.x - q.x) + (a.z - q.z) * (a.z - q.z));
      });
    } else if (args.sort === 'random' || art === '@r') {
      liste.sort(function () { return Math.random() - 0.5; });
    }

    var limit = args.limit !== undefined ? Math.max(0, parseInt(args.limit, 10) || 0)
              : (art === '@p' || art === '@r' || art === '@s') ? 1 : Infinity;
    if (limit !== Infinity) liste = liste.slice(0, limit);
    return liste;
  };

  C.leseZieleAus = function (leser, kontext) {
    var stelle = leser.pos;
    return C.leseZiele(leser.wort('ein Ziel'), kontext, stelle);
  };

  // Die deutschen Namen stehen schon in der Spawn-Ei-Tabelle – zweimal
  // pflegen wollen wir sie nicht.
  var MOB_NAME = null;
  C.mobName = function (art) {
    if (!MOB_NAME) {
      MOB_NAME = {};
      (I.EIER || []).forEach(function (e) { MOB_NAME[e[0]] = e[1]; });
    }
    return MOB_NAME[art] || art;
  };

  // ============================================================
  //  Die Befehlstabelle
  // ============================================================
  // { hilfe, form, lauf(leser, kontext) -> Text oder Zahl }
  var BEFEHLE = {};
  C.BEFEHLE = BEFEHLE;

  function befehl(name, form, hilfe, lauf, opt) {
    BEFEHLE[name] = { name: name, form: form, hilfe: hilfe, lauf: lauf,
                      vervollstaendigen: (opt && opt.vervollstaendigen) || null };
  }

  // ---------- Spielmodus ----------
  befehl('gamemode', '<überleben|kreativ|zuschauer> [ziel]',
    'Setzt den Spielmodus.',
    function (l, k) {
      var w = l.wort('einen Modus').toLowerCase();
      var karte = { survival: 'survival', ueberleben: 'survival', 'überleben': 'survival', s: 'survival',
                    creative: 'creative', kreativ: 'creative', c: 'creative',
                    spectator: 'spectator', zuschauer: 'spectator', sp: 'spectator' };
      var m = karte[w];
      if (!m) throw new Fehler('Kein Modus namens "' + w + '"', l.pos);
      k.game.setMode(m);
      return 'Modus auf ' + MC.MODUS_NAME[m] + ' gesetzt';
    }, { vervollstaendigen: function () { return ['überleben', 'kreativ', 'zuschauer']; } });

  befehl('give', '<ziel> <item> [anzahl]',
    'Legt Gegenstände ins Inventar.',
    function (l, k) {
      var ziele = C.leseZieleAus(l, k);
      var stelle = l.pos;
      var name = C.kurzname(l.wort('ein Item'));
      if (!I.get(name)) throw new Fehler('Kein Item namens "' + name + '"', stelle);
      var n = l.restlos() ? 1 : Math.max(1, Math.floor(l.zahl('eine Anzahl')));
      var gegeben = 0;
      ziele.forEach(function (e) {
        if (!e.inventory) return;
        var offen = n;
        while (offen > 0) {
          var portion = Math.min(offen, I.stackMax(name) || 64);
          var stapel = I.newStack(name, portion);
          // add() gibt den REST zurück, 0 heißt vollständig verstaut
          var rest = e.inventory.add(stapel);
          gegeben += portion - rest;
          offen -= portion - rest;
          if (rest > 0) break;
        }
      });
      if (!gegeben) throw new Fehler('Kein Platz im Inventar');
      return gegeben + '× ' + I.get(name).title + ' gegeben';
    }, { vervollstaendigen: function () { return Object.keys(I.byName); } });

  befehl('tp', '<x y z> | <ziel> <x y z> | <ziel> <ziel>',
    'Versetzt Kreaturen oder dich selbst.',
    function (l, k) {
      var merk = l.pos;
      var erstes = l.wort('ein Ziel oder eine Koordinate');
      var ziele, nach;
      if (erstes[0] === '@' || (isNaN(parseFloat(erstes)) && erstes[0] !== '~' && erstes[0] !== '^')) {
        ziele = C.leseZiele(erstes, k, merk);
        if (l.restlos()) throw new Fehler('Wohin denn?', l.pos);
        var merk2 = l.pos;
        var zweites = l.wort('ein Ziel oder eine Koordinate');
        if (zweites[0] === '@') {
          var hin = C.leseZiele(zweites, k, merk2);
          if (!hin.length) throw new Fehler('Kein Ziel gefunden');
          nach = { x: hin[0].x, y: hin[0].y, z: hin[0].z };
        } else {
          l.pos = merk2;
          nach = C.leseOrt(l, k);
        }
      } else {
        l.pos = merk;
        ziele = [k.selbst || k.game.player];
        nach = C.leseOrt(l, k);
      }
      if (!ziele.length) throw new Fehler('Kein Ziel gefunden');
      ziele.forEach(function (e) {
        e.x = nach.x; e.y = nach.y; e.z = nach.z;
        e.vx = e.vy = e.vz = 0;
        if (e.fallStart !== undefined) e.fallStart = null;
      });
      if (ziele.indexOf(k.game.player) >= 0) k.game.ensureChunksAround(nach.x, nach.z, 2);
      return ziele.length + '× versetzt nach ' + Math.round(nach.x) + ' ' + Math.round(nach.y) + ' ' + Math.round(nach.z);
    });
  BEFEHLE.teleport = BEFEHLE.tp;

  befehl('time', 'set <tag|mittag|abend|nacht|mitternacht|zahl> | add <zahl> | query',
    'Ändert oder zeigt die Tageszeit.',
    function (l, k) {
      var w = l.wort('set, add oder query').toLowerCase();
      var welt = k.game.world;
      if (w === 'query') return 'Zeit: ' + U.formatTime(welt.time) + ' (' + welt.time.toFixed(3) + ')';
      // Unsere Uhr läuft von 0 = Mitternacht über 0,25 = Sonnenaufgang und
      // 0,5 = Mittag bis 0,75 = Sonnenuntergang. Die Namen müssen dazu passen,
      // sonst liefert „/time set tag" eine Nacht.
      var karte = { tag: 0.29, day: 0.29, morgen: 0.26, mittag: 0.5, noon: 0.5,
                    abend: 0.74, nacht: 0.80, night: 0.80,
                    mitternacht: 0.0, midnight: 0.0 };
      var stelle = l.pos;
      var wert = l.wort('einen Wert').toLowerCase();
      var t = karte[wert];
      if (t === undefined) {
        t = parseFloat(wert);
        if (!isFinite(t)) throw new Fehler('"' + wert + '" ist keine Zeit', stelle);
        // Ticks wie im Original: dort ist Tick 0 der Sonnenaufgang, bei uns 0,25
        if (t > 1) t = (((t % 24000) / 24000) + 0.25) % 1;
      }
      if (w === 'set') welt.time = ((t % 1) + 1) % 1;
      else if (w === 'add') welt.time = ((welt.time + t) % 1 + 1) % 1;
      else throw new Fehler('set, add oder query — nicht "' + w + '"', l.pos);
      // Alle geladenen Dimensionen mitziehen, sonst springt die Zeit beim Wechsel
      for (var d in k.game.worlds) if (k.game.worlds[d]) k.game.worlds[d].time = welt.time;
      return 'Zeit: ' + U.formatTime(welt.time);
    }, { vervollstaendigen: function () { return ['set', 'add', 'query']; } });

  befehl('kill', '[ziel]',
    'Tötet Kreaturen. Ohne Ziel dich selbst.',
    function (l, k) {
      var ziele = l.restlos() ? [k.game.player] : C.leseZieleAus(l, k);
      var n = 0;
      ziele.forEach(function (e) {
        if (e.hurt) { e.hurt(9999, null, k.game); n++; }
        else if (e !== k.game.player) { e.dead = true; n++; }
      });
      return n + ' getötet';
    });

  befehl('summon', '<art> [x y z]',
    'Ruft eine Kreatur herbei.',
    function (l, k) {
      var stelle = l.pos;
      var art = C.kurzname(l.wort('eine Kreaturenart'));
      if (!MC.MOB_TYPES[art]) throw new Fehler('Keine Kreatur namens "' + art + '"', stelle);
      // Herobrine stellt man nicht hin, man löst ihn aus. Vor die Füße gesetzt
      // wäre er nur eine Figur; der Auftritt ist die ganze Kreatur.
      if (art === 'herobrine' && MC.Herobrine) {
        if (!l.restlos()) l.rest();
        MC.Herobrine.zuruecksetzen();
        MC.Herobrine.fernStarten(k.game);
        if (!MC.Herobrine.zustand) throw new Fehler('Kein Platz in Sichtweite — dreh dich ins Offene');
        var hm = MC.Herobrine.zustand.mob;
        return 'Er steht ' + Math.round(hm.distTo(k.game.player)) + ' Blöcke entfernt.';
      }
      var o = l.restlos() ? k.ort : C.leseOrt(l, k);
      var m = new MC.Mob(k.game.world, art, o.x, o.y, o.z);
      k.game.world.entities.push(m);
      return C.mobName(art) + ' erschienen bei ' +
             Math.round(o.x) + ' ' + Math.round(o.y) + ' ' + Math.round(o.z);
    }, { vervollstaendigen: function () { return Object.keys(MC.MOB_TYPES); } });

  befehl('setblock', '<x y z> <block>',
    'Setzt einen einzelnen Block.',
    function (l, k) {
      var o = C.leseBlockOrt(l, k);
      var stelle = l.pos;
      var name = C.kurzname(l.wort('einen Block'));
      var id = name === 'air' || name === 'luft' ? 0 : B.id(name);
      if (!id && name !== 'air' && name !== 'luft') throw new Fehler('Kein Block namens "' + name + '"', stelle);
      k.game.world.setBlock(o.x, o.y, o.z, id, 0);
      return 'Block gesetzt bei ' + o.x + ' ' + o.y + ' ' + o.z;
    }, { vervollstaendigen: function () { return Object.keys(B.byName); } });

  // Deckel wie im Original: mehr als das legt den Browser für Sekunden still
  var FILL_MAX = 32768;

  befehl('fill', '<x1 y1 z1> <x2 y2 z2> <block>',
    'Füllt einen Quader. Höchstens 32768 Blöcke.',
    function (l, k) {
      var a = C.leseBlockOrt(l, k), b = C.leseBlockOrt(l, k);
      var stelle = l.pos;
      var name = C.kurzname(l.wort('einen Block'));
      var id = (name === 'air' || name === 'luft') ? 0 : B.id(name);
      if (!id && name !== 'air' && name !== 'luft') throw new Fehler('Kein Block namens "' + name + '"', stelle);
      var x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      var y0 = Math.max(0, Math.min(a.y, b.y)), y1 = Math.min(MC.WORLD_HEIGHT - 1, Math.max(a.y, b.y));
      var z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
      var n = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
      if (n > FILL_MAX) throw new Fehler(n + ' Blöcke sind zu viel, höchstens ' + FILL_MAX);
      for (var y = y0; y <= y1; y++)
        for (var z = z0; z <= z1; z++)
          for (var x = x0; x <= x1; x++) k.game.world.setBlock(x, y, z, id, 0);
      return n + ' Blöcke gefüllt';
    }, { vervollstaendigen: function () { return Object.keys(B.byName); } });

  befehl('clone', '<x1 y1 z1> <x2 y2 z2> <zielx ziely zielz>',
    'Kopiert einen Quader an eine andere Stelle.',
    function (l, k) {
      var a = C.leseBlockOrt(l, k), b = C.leseBlockOrt(l, k), z = C.leseBlockOrt(l, k);
      var x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      var y0 = Math.max(0, Math.min(a.y, b.y)), y1 = Math.min(MC.WORLD_HEIGHT - 1, Math.max(a.y, b.y));
      var z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
      var n = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
      if (n > FILL_MAX) throw new Fehler(n + ' Blöcke sind zu viel, höchstens ' + FILL_MAX);
      // Erst lesen, dann schreiben: sonst kopiert sich ein überlappender
      // Bereich in sich selbst hinein
      var w = k.game.world, puffer = new Uint16Array(n), pmeta = new Uint8Array(n), i = 0;
      for (var y = y0; y <= y1; y++) for (var pz = z0; pz <= z1; pz++) for (var px = x0; px <= x1; px++) {
        puffer[i] = w.getBlock(px, y, pz); pmeta[i] = w.getMeta(px, y, pz); i++;
      }
      i = 0;
      for (var y2 = y0; y2 <= y1; y2++) for (var qz = z0; qz <= z1; qz++) for (var qx = x0; qx <= x1; qx++) {
        w.setBlock(z.x + (qx - x0), z.y + (y2 - y0), z.z + (qz - z0), puffer[i], pmeta[i]); i++;
      }
      return n + ' Blöcke kopiert';
    });

  befehl('effect', 'give <ziel> <effekt> [sekunden] [stufe] | clear <ziel>',
    'Gibt oder entfernt Statuseffekte.',
    function (l, k) {
      var w = l.wort('give oder clear').toLowerCase();
      var ziele = C.leseZieleAus(l, k);
      if (w === 'clear') {
        ziele.forEach(function (e) { if (e.effekte) e.effekte = {}; });
        return 'Effekte entfernt';
      }
      if (w !== 'give') throw new Fehler('give oder clear — nicht "' + w + '"', l.pos);
      var stelle = l.pos;
      var key = C.kurzname(l.wort('einen Effekt'));
      if (!MC.Effekte.LISTE[key]) throw new Fehler('Kein Effekt namens "' + key + '"', stelle);
      var sek = l.restlos() ? 30 : l.zahl('eine Dauer');
      var stufe = l.restlos() ? 1 : Math.max(1, Math.floor(l.zahl('eine Stufe')));
      ziele.forEach(function (e) { MC.Effekte.gib(e, key, stufe, sek); });
      return MC.Effekte.LISTE[key].titel + ' ' + stufe + ' für ' + sek + ' s';
    }, { vervollstaendigen: function () { return ['give', 'clear'].concat(Object.keys(MC.Effekte.LISTE)); } });

  befehl('enchant', '<ziel> <verzauberung> [stufe]',
    'Verzaubert das gehaltene Item.',
    function (l, k) {
      var ziele = C.leseZieleAus(l, k);
      var stelle = l.pos;
      var key = C.kurzname(l.wort('eine Verzauberung'));
      var ench = MC.Ench.get(key);
      if (!ench) throw new Fehler('Keine Verzauberung namens "' + key + '"', stelle);
      var stufe = l.restlos() ? 1 : Math.max(1, Math.floor(l.zahl('eine Stufe')));
      var max = ench.max || 1;
      if (stufe > max) stufe = max;
      var n = 0;
      ziele.forEach(function (e) {
        if (!e.inventory) return;
        var st = e.inventory.selectedStack();
        if (!st) return;
        var neu = {}; neu[key] = stufe;
        MC.Ench.anwenden(st, neu);
        n++;
      });
      if (!n) throw new Fehler('Nichts in der Hand');
      return (ench.titel || key) + ' ' + MC.Ench.roemisch(stufe) + ' aufgebracht';
    }, { vervollstaendigen: function () { return MC.Ench.LISTE.map(function (e) { return e.key; }); } });

  befehl('xp', 'add|set|query <ziel> [zahl]',
    'Ändert oder zeigt die Erfahrung.',
    function (l, k) {
      var w = l.wort('add, set oder query').toLowerCase();
      var ziele = C.leseZieleAus(l, k);
      var p = ziele[0];
      if (!p || !p.inventory) throw new Fehler('Das geht nur beim Spieler');
      if (w === 'query') return 'Stufe ' + p.level + ' (' + p.xp.toFixed(1) + ' bis zur nächsten)';
      var n = Math.floor(l.zahl('eine Zahl'));
      if (w === 'set') { p.level = Math.max(0, n); p.xp = 0; }
      else if (w === 'add') { p.level = Math.max(0, p.level + n); }
      else throw new Fehler('add, set oder query — nicht "' + w + '"', l.pos);
      return 'Stufe ' + p.level;
    }, { vervollstaendigen: function () { return ['add', 'set', 'query']; } });

  befehl('difficulty', '<friedlich|leicht|normal|schwer>',
    'Setzt den Schwierigkeitsgrad.',
    function (l, k) {
      var karte = { friedlich: 'peaceful', peaceful: 'peaceful', leicht: 'easy', easy: 'easy',
                    normal: 'normal', schwer: 'hard', hard: 'hard' };
      var stelle = l.pos;
      var w = l.wort('einen Grad').toLowerCase();
      if (!karte[w]) throw new Fehler('Kein Grad namens "' + w + '"', stelle);
      k.game.difficulty = karte[w];
      return 'Schwierigkeit: ' + w;
    }, { vervollstaendigen: function () { return ['friedlich', 'leicht', 'normal', 'schwer']; } });

  befehl('seed', '', 'Zeigt den Seed der Welt.',
    function (l, k) { return 'Seed: ' + k.game.seed; });

  befehl('spawnpoint', '[ziel] [x y z]',
    'Setzt den Wiedereinstiegspunkt.',
    function (l, k) {
      var p = k.game.player;
      var o = l.restlos() ? { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) } : null;
      if (!o) {
        var merk = l.pos, erstes = l.wort('ein Ziel oder eine Koordinate');
        if (erstes[0] === '@') { C.leseZiele(erstes, k, merk); o = l.restlos() ? null : C.leseBlockOrt(l, k); }
        else { l.pos = merk; o = C.leseBlockOrt(l, k); }
        if (!o) o = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z) };
      }
      p.spawnPoint = { x: o.x, y: o.y, z: o.z };
      return 'Wiedereinstieg bei ' + o.x + ' ' + o.y + ' ' + o.z;
    });

  befehl('clear', '[ziel] [item]',
    'Räumt das Inventar leer.',
    function (l, k) {
      var ziele = l.restlos() ? [k.game.player] : C.leseZieleAus(l, k);
      var name = l.restlos() ? null : C.kurzname(l.wort('ein Item'));
      var n = 0;
      ziele.forEach(function (e) {
        if (!e.inventory) return;
        var inv = e.inventory;
        for (var i = 0; i < inv.size; i++) {
          if (!inv.slots[i]) continue;
          if (name && inv.slots[i].id !== name) continue;
          n += inv.slots[i].count || 1;
          inv.slots[i] = null;
        }
      });
      return n + ' Gegenstände entfernt';
    }, { vervollstaendigen: function () { return Object.keys(I.byName); } });

  befehl('say', '<text>', 'Schreibt eine Zeile in den Chat.',
    function (l, k) { return { chat: '<Spieler> ' + l.rest() }; });

  befehl('me', '<text>', 'Schreibt eine Handlung in den Chat.',
    function (l, k) { return { chat: '* Spieler ' + l.rest() }; });

  // ---------- Strukturen suchen ----------
  // Alle unsere Strukturen sind deterministisch aus dem Seed – die Suche ist
  // darum nur eine Schleife über Regionen, kein Weltdurchlauf.
  var STRUKTUREN = {
    dorf: function (gen, wx, wz) { return MC.Village ? MC.Village.nearest(gen, wx, wz, 4000) : null; },
    wrack: function (gen, wx, wz) { return regionSuche(gen, wx, wz, 10 * 16, MC.Caves.wrackAt); },
    tempel: function (gen, wx, wz) { return regionSuche(gen, wx, wz, 20 * 16, MC.Caves.tempelAt); },
    mine: function (gen, wx, wz) { return regionSuche(gen, wx, wz, 8 * 16, MC.Caves.mineAt); },
    wurmloch: function (gen, wx, wz) { return regionSuche(gen, wx, wz, 16 * 16, gen.wurmAt ? function (g, rx, rz) { return g.wurmAt(rx, rz); } : null); },
    festung: function (gen) { return MC.Stronghold ? MC.Stronghold.locate(gen) : null; }
  };

  function regionSuche(gen, wx, wz, spanne, fn) {
    if (!fn) return null;
    var rx0 = Math.floor(wx / spanne), rz0 = Math.floor(wz / spanne);
    var best = null, bestD = Infinity;
    for (var ring = 0; ring <= 8 && !best; ring++) {
      for (var dx = -ring; dx <= ring; dx++) {
        for (var dz = -ring; dz <= ring; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          var s;
          try { s = fn(gen, rx0 + dx, rz0 + dz); } catch (e) { s = null; }
          if (!s) continue;
          var liste = s.length !== undefined ? s : [s];
          for (var i = 0; i < liste.length; i++) {
            var o = liste[i];
            // Manche Strukturen nennen nur ihre Ausdehnung (die Minen etwa
            // sind ein Gangnetz ohne Mittelpunkt) – dann tut es die Mitte.
            var ox = o.x, oz = o.z;
            if (ox === undefined && o.minX !== undefined) {
              ox = (o.minX + o.maxX) / 2; oz = (o.minZ + o.maxZ) / 2;
            }
            if (ox === undefined) continue;
            var d = (ox - wx) * (ox - wx) + (oz - wz) * (oz - wz);
            if (d < bestD) { bestD = d; best = { x: ox, z: oz }; }
          }
        }
      }
      if (best) break;
    }
    return best;
  }

  befehl('locate', '<' + Object.keys(STRUKTUREN).join('|') + '>',
    'Sucht die nächste Struktur.',
    function (l, k) {
      var stelle = l.pos;
      var was = l.wort('eine Struktur').toLowerCase();
      var fn = STRUKTUREN[was];
      if (!fn) throw new Fehler('Nichts namens "' + was + '" — bekannt: ' + Object.keys(STRUKTUREN).join(', '), stelle);
      var p = k.game.player;
      var o = fn(k.game.world.gen, Math.floor(p.x), Math.floor(p.z));
      if (!o) throw new Fehler('Nichts gefunden in Reichweite');
      var d = Math.round(Math.sqrt((o.x - p.x) * (o.x - p.x) + (o.z - p.z) * (o.z - p.z)));
      return was + ' bei ' + Math.round(o.x) + ' ~ ' + Math.round(o.z) + ' — ' + d + ' Blöcke entfernt';
    }, { vervollstaendigen: function () { return Object.keys(STRUKTUREN); } });

  // ---------- Spielregeln ----------
  // Bisher lagen diese Schalter verstreut in game. Hier stehen sie an einer
  // Stelle, mit Vorgabe und Erklärung.
  var REGELN = {
    keepInventory: { def: false, text: 'Inventar beim Tod behalten' },
    doDaylightCycle: { def: true, text: 'Tag und Nacht laufen' },
    doMobSpawning: { def: true, text: 'Kreaturen erscheinen von selbst' },
    mobGriefing: { def: true, text: 'Kreaturen dürfen Blöcke verändern' },
    doTileDrops: { def: true, text: 'Blöcke lassen etwas fallen' },
    doFireTick: { def: true, text: 'Feuer breitet sich aus' },
    herobrine: { def: true, text: 'Die alte Legende erscheint' }
  };
  C.REGELN = REGELN;

  C.regel = function (game, name) {
    if (!game.regeln) game.regeln = {};
    return game.regeln[name] !== undefined ? game.regeln[name] : REGELN[name].def;
  };

  befehl('gamerule', '[regel] [wert]',
    'Zeigt oder setzt eine Spielregel.',
    function (l, k) {
      if (l.restlos()) {
        return Object.keys(REGELN).map(function (r) {
          return r + ' = ' + C.regel(k.game, r);
        }).join('\n');
      }
      var stelle = l.pos;
      var name = l.wort('eine Regel');
      var treffer = Object.keys(REGELN).filter(function (r) { return r.toLowerCase() === name.toLowerCase(); })[0];
      if (!treffer) throw new Fehler('Keine Regel namens "' + name + '"', stelle);
      if (l.restlos()) return treffer + ' = ' + C.regel(k.game, treffer) + '  (' + REGELN[treffer].text + ')';
      var w = l.wort('true oder false').toLowerCase();
      if (w !== 'true' && w !== 'false') throw new Fehler('true oder false — nicht "' + w + '"', l.pos);
      if (!k.game.regeln) k.game.regeln = {};
      k.game.regeln[treffer] = (w === 'true');
      // keepInventory hat schon ein eigenes Feld – die beiden dürfen nicht auseinanderlaufen
      if (treffer === 'keepInventory') k.game.keepInventory = (w === 'true');
      return treffer + ' = ' + w;
    }, { vervollstaendigen: function () { return Object.keys(REGELN); } });

  // ---------- execute ----------
  // Nur die zwei Zweige, die ohne Punktestand etwas bringen: `as` wechselt den
  // Ausführenden, `at` den Bezugspunkt für ~ und ^.
  befehl('execute', 'as|at <ziel> run <befehl>',
    'Führt einen Befehl für jedes Ziel aus.',
    function (l, k) {
      var art = l.wort('as oder at').toLowerCase();
      if (art !== 'as' && art !== 'at') throw new Fehler('as oder at — nicht "' + art + '"', l.pos);
      var ziele = C.leseZieleAus(l, k);
      var run = l.wort('run').toLowerCase();
      if (run !== 'run') throw new Fehler('Hier muss "run" stehen', l.pos);
      var rest = l.rest();
      if (!rest) throw new Fehler('Welcher Befehl denn?', l.pos);
      var ausgaben = [];
      for (var i = 0; i < ziele.length; i++) {
        var e = ziele[i];
        var unter = {
          game: k.game,
          selbst: art === 'as' ? e : k.selbst,
          ort: art === 'at' ? { x: e.x, y: e.y, z: e.z } : k.ort,
          yaw: art === 'at' ? (e.yaw || 0) : k.yaw,
          pitch: art === 'at' ? (e.pitch || 0) : k.pitch,
          tiefe: (k.tiefe || 0) + 1
        };
        if (unter.tiefe > 4) throw new Fehler('execute zu tief verschachtelt');
        ausgaben.push(C.fuehreAus(rest, unter));
      }
      return ausgaben.join('\n');
    }, { vervollstaendigen: function () { return ['as', 'at']; } });

  befehl('help', '[befehl]', 'Zeigt die Befehle.',
    function (l, k) {
      if (l.restlos()) {
        return 'Befehle: ' + Object.keys(BEFEHLE).sort().join(', ') +
               '\nMit /help <befehl> steht die Form dabei.';
      }
      var n = l.wort('einen Befehl').replace(/^\//, '');
      var b = BEFEHLE[n];
      if (!b) throw new Fehler('Keinen Befehl namens "' + n + '"');
      return '/' + b.name + ' ' + b.form + '\n' + b.hilfe;
    }, { vervollstaendigen: function () { return Object.keys(BEFEHLE); } });

  // ============================================================
  //  Ausführen
  // ============================================================
  // "minecraft:stone" und "stone" sollen dasselbe sein – Rezepte aus dem Netz
  // schreiben den Namensraum mit.
  C.kurzname = function (w) {
    var p = w.indexOf(':');
    return p >= 0 ? w.slice(p + 1) : w;
  };

  C.kontextFuer = function (game, quelle) {
    var p = game.player;
    var o = quelle || { x: p.x, y: p.y, z: p.z };
    return {
      game: game, selbst: p, ort: o,
      yaw: p.yaw || 0, pitch: p.pitch || 0, tiefe: 0
    };
  };

  // Gibt einen Text zurück oder wirft einen Fehler.
  C.fuehreAus = function (zeile, kontext) {
    zeile = zeile.replace(/^\//, '').trim();
    if (!zeile) throw new Fehler('Kein Befehl angegeben');
    var l = new Leser(zeile);
    var stelle = l.pos;
    var name = C.kurzname(l.wort('einen Befehl')).toLowerCase();
    var b = BEFEHLE[name];
    if (!b) throw new Fehler('Unbekannter Befehl "' + name + '" — /help zeigt alle', stelle);
    var r = b.lauf(l, kontext);
    if (!l.restlos()) throw new Fehler('Zu viel hinter dem Befehl', l.pos);
    return r;
  };

  // ============================================================
  //  Chatzeile und Protokoll
  // ============================================================
  // Ohne sie ist von den Befehlen nichts zu sehen. `T` öffnet sie, `/` öffnet
  // sie und setzt den Schrägstrich gleich mit. Solange sie offen ist, ruht die
  // Spielsteuerung – sonst läuft man beim Tippen von `W` los.
  var Chat = {};
  C.Chat = Chat;

  Chat.zeilen = [];          // { text, art, zeit }
  Chat.verlauf = [];         // was man selbst getippt hat
  Chat.verlaufPos = -1;
  Chat.offen = false;

  Chat.bauen = function (game) {
    if (Chat.wurzel) return;
    var ui = document.getElementById('ui') || document.body;
    var wurzel = document.createElement('div');
    wurzel.id = 'chat';
    wurzel.innerHTML = '<div id="chatlog"></div>' +
      '<div id="chatzeile"><span class="pfeil">&gt;</span><input id="chatinput" ' +
      'autocomplete="off" spellcheck="false" maxlength="256"><div id="chattipps"></div></div>';
    ui.appendChild(wurzel);
    Chat.wurzel = wurzel;
    Chat.log = wurzel.querySelector('#chatlog');
    Chat.zeile = wurzel.querySelector('#chatzeile');
    Chat.eingabe = wurzel.querySelector('#chatinput');
    Chat.tipps = wurzel.querySelector('#chattipps');
    Chat.game = game;

    Chat.eingabe.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Escape') { Chat.schliessen(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { Chat.absenden(); ev.preventDefault(); }
      else if (ev.key === 'Tab') { Chat.vervollstaendigen(); ev.preventDefault(); }
      else if (ev.key === 'ArrowUp') { Chat.blaettern(1); ev.preventDefault(); }
      else if (ev.key === 'ArrowDown') { Chat.blaettern(-1); ev.preventDefault(); }
    });
    Chat.eingabe.addEventListener('keyup', function (ev) {
      ev.stopPropagation();
      if (['Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'Escape'].indexOf(ev.key) < 0) Chat.tippsZeigen();
    });
    Chat.eingabe.addEventListener('input', function (ev) { ev.stopPropagation(); });
  };

  Chat.oeffnen = function (game, vorbelegt) {
    Chat.bauen(game);
    Chat.game = game;
    Chat.offen = true;
    Chat.verlaufPos = -1;
    Chat.wurzel.classList.add('auf');
    Chat.eingabe.value = vorbelegt || '';
    Chat.eingabe.focus();
    Chat.tippsZeigen();
    if (document.exitPointerLock) document.exitPointerLock();
  };

  Chat.schliessen = function () {
    if (!Chat.offen) return;
    Chat.offen = false;
    Chat.wurzel.classList.remove('auf');
    Chat.eingabe.value = '';
    Chat.tipps.innerHTML = '';
    Chat.eingabe.blur();
    // Der Zeiger wird zurückgeholt, ohne dass das Freigeben davor als
    // „Fenster verloren" gilt – sonst springt das Pausenmenü auf
    if (Chat.game) {
      Chat.game.suppressPauseUntil = performance.now() + 400;
      Chat.game.requestPointerLock();
    }
  };

  Chat.blaettern = function (richtung) {
    if (!Chat.verlauf.length) return;
    Chat.verlaufPos = U.clamp(Chat.verlaufPos + richtung, -1, Chat.verlauf.length - 1);
    Chat.eingabe.value = Chat.verlaufPos < 0 ? '' : Chat.verlauf[Chat.verlaufPos];
    Chat.eingabe.setSelectionRange(Chat.eingabe.value.length, Chat.eingabe.value.length);
    Chat.tippsZeigen();
  };

  Chat.tippsZeigen = function () {
    var t = Chat.eingabe.value;
    if (t[0] !== '/') { Chat.tipps.innerHTML = ''; return; }
    var v = C.vorschlaege(t, Chat.game);
    Chat.tipps.innerHTML = v.slice(0, 12).map(function (x, i) {
      return '<span' + (i === 0 ? ' class="erst"' : '') + '>' + x + '</span>';
    }).join('');
  };

  Chat.vervollstaendigen = function () {
    Chat.eingabe.value = C.ersetzeLetztes(Chat.eingabe.value, Chat.game);
    Chat.tippsZeigen();
  };

  // Ersetzt das letzte Wort durch den besten Vorschlag. Der Schrägstrich am
  // Anfang muss dabei stehen bleiben – sonst wird aus "/gam" ein "gamemode"
  // ohne Schrägstrich und der Befehl läuft nicht mehr.
  C.ersetzeLetztes = function (text, game) {
    if (text[0] !== '/') return text;
    var v = C.vorschlaege(text, game);
    if (!v.length) return text;
    var teile = text.slice(1).split(' ');
    teile[teile.length - 1] = v[0];
    return '/' + teile.join(' ') + (v.length === 1 ? ' ' : '');
  };

  Chat.schreiben = function (text, art) {
    String(text).split('\n').forEach(function (z) {
      Chat.zeilen.push({ text: z, art: art || 'info', zeit: (Chat.game && Chat.game.time) || 0 });
    });
    while (Chat.zeilen.length > 100) Chat.zeilen.shift();
    Chat.neuZeichnen();
  };

  Chat.neuZeichnen = function () {
    if (!Chat.log) return;
    var jetzt = (Chat.game && Chat.game.time) || 0;
    var html = '';
    for (var i = Math.max(0, Chat.zeilen.length - 12); i < Chat.zeilen.length; i++) {
      var z = Chat.zeilen[i];
      // Geschlossen blenden alte Zeilen aus, offen sind alle zu sehen
      if (!Chat.offen && jetzt - z.zeit > 9) continue;
      html += '<div class="cz ' + z.art + '">' + C.escape(z.text) + '</div>';
    }
    Chat.log.innerHTML = html;
    Chat.log.scrollTop = Chat.log.scrollHeight;
  };

  C.escape = function (t) {
    return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };

  Chat.absenden = function () {
    var t = Chat.eingabe.value.trim();
    Chat.schliessen();
    if (!t) return;
    Chat.verlauf.unshift(t);
    while (Chat.verlauf.length > 60) Chat.verlauf.pop();
    if (t[0] !== '/') { Chat.schreiben('<Spieler> ' + t, 'sagen'); return; }
    C.ausfuehrenUndMelden(t, Chat.game);
  };

  // Führt aus und schreibt das Ergebnis in den Chat – grün oder rot.
  C.ausfuehrenUndMelden = function (zeile, game) {
    try {
      var r = C.fuehreAus(zeile, C.kontextFuer(game));
      if (r && r.chat) { Chat.schreiben(r.chat, 'sagen'); return true; }
      if (r !== undefined && r !== null && r !== '') Chat.schreiben(String(r), 'gut');
      return true;
    } catch (e) {
      if (e instanceof Fehler) {
        Chat.schreiben(e.text, 'fehler');
        if (e.stelle !== undefined && e.stelle !== null) {
          var ohne = zeile.replace(/^\//, '');
          Chat.schreiben('  ' + ohne.slice(0, e.stelle) + '‹hier›', 'fehler');
        }
      } else {
        Chat.schreiben('Fehler: ' + (e && e.message ? e.message : e), 'fehler');
      }
      return false;
    }
  };

  // ============================================================
  //  Befehlsblock
  // ============================================================
  // Drei Sorten, zwei Schalter — genau wie im Original:
  //   Impuls        führt einmal aus, wenn das Signal ankommt
  //   Wiederholend  führt in jedem Takt aus, solange es anliegt
  //   Kette         führt aus, wenn der Block davor Erfolg hatte
  // Dazu „braucht Redstone / immer aktiv" und „bedingt / unbedingt".
  var Block = {};
  C.Block = Block;

  Block.SORTEN = { command_block: 'impuls', command_block_repeat: 'wiederholend', command_block_chain: 'kette' };
  Block.SORTENNAME = { impuls: 'Impuls', wiederholend: 'Wiederholend', kette: 'Kette' };
  // Der Deckel gegen Endlosschleifen: eine Kette darf nicht ewig weiterlaufen
  var KETTE_MAX = 64;
  // Und so viele Blöcke dürfen je Takt insgesamt feuern
  var TAKT_MAX = 128;

  Block.daten = function (game, x, y, z) {
    var k = x + ',' + y + ',' + z;
    var te = game.world.tileEntities[k];
    if (!te || te.type !== 'befehlsblock') {
      te = { type: 'befehlsblock', befehl: '', ausgabe: '', bedingt: false,
             immer: Block.SORTEN[B.byId[game.world.getBlock(x, y, z)] &&
                    B.byId[game.world.getBlock(x, y, z)].name] === 'kette', erfolg: 0 };
      game.world.tileEntities[k] = te;
    }
    return te;
  };

  Block.sorte = function (game, x, y, z) {
    var b = B.byId[game.world.getBlock(x, y, z)];
    return b ? Block.SORTEN[b.name] : null;
  };

  // Führt einen einzelnen Block aus und gibt zurück, ob er Erfolg hatte.
  Block.feuern = function (game, x, y, z, zaehler) {
    var te = Block.daten(game, x, y, z);
    if (!te.befehl) { te.ausgabe = ''; te.erfolg = 0; return false; }
    // Bedingt: nur, wenn der Block dahinter Erfolg hatte. „Dahinter" ist bei
    // uns schlicht der Block darüber – wir haben keine Blickrichtung am Block.
    if (te.bedingt) {
      var oben = Block.daten(game, x, y + 1, z);
      if (!oben || !oben.erfolg) { te.ausgabe = 'Bedingung nicht erfüllt'; te.erfolg = 0; return false; }
    }
    var kontext = C.kontextFuer(game, { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    kontext.yaw = 0; kontext.pitch = 0;
    try {
      var r = C.fuehreAus(te.befehl, kontext);
      te.ausgabe = (r && r.chat) ? r.chat : String(r === undefined ? '' : r);
      te.erfolg = 1;
      if (r && r.chat) Chat.schreiben(r.chat, 'sagen');
      return true;
    } catch (e) {
      te.ausgabe = (e instanceof Fehler) ? e.text : ('Fehler: ' + (e && e.message ? e.message : e));
      te.erfolg = 0;
      return false;
    }
  };

  // Die Kette hinter einem Block: nach unten, solange dort Kettenblöcke stehen.
  Block.kette = function (game, x, y, z, erfolgVorher, zaehler) {
    var yy = y - 1;
    var vorher = erfolgVorher;
    for (var i = 0; i < KETTE_MAX; i++) {
      if (Block.sorte(game, x, yy, z) !== 'kette') break;
      var te = Block.daten(game, x, yy, z);
      if (te.bedingt && !vorher) { te.erfolg = 0; te.ausgabe = 'Bedingung nicht erfüllt'; break; }
      if (zaehler.n++ >= TAKT_MAX) break;
      vorher = Block.feuern(game, x, yy, z, zaehler);
      yy--;
    }
  };

  // Das Fenster: Befehlszeile, Sorte, die beiden Schalter und die letzte
  // Ausgabe. Bewusst schlicht gehalten – der Inhalt ist der Befehl.
  Block.oeffnen = function (game, x, y, z) {
    var te = Block.daten(game, x, y, z);
    var sorte = Block.sorte(game, x, y, z);
    Chat.bauen(game);
    var alt = document.getElementById('cbfenster');
    if (alt) alt.remove();
    var f = document.createElement('div');
    f.id = 'cbfenster';
    f.innerHTML =
      '<div class="cbkopf">' + Block.SORTENNAME[sorte] + '-Befehlsblock &nbsp;·&nbsp; ' + x + ' ' + y + ' ' + z + '</div>' +
      '<input id="cbbefehl" autocomplete="off" spellcheck="false" placeholder="/say Hallo">' +
      '<div id="cbtipps"></div>' +
      '<div class="cbreihe">' +
        '<button id="cbimmer"></button>' +
        '<button id="cbbedingt"></button>' +
      '</div>' +
      '<div class="cbaus" id="cbaus"></div>' +
      '<div class="cbreihe">' +
        '<button id="cbok">Übernehmen</button>' +
        '<button id="cbzu">Schließen</button>' +
      '</div>' +
      '<div class="cbhilfe">Tab vervollständigt · Enter übernimmt · Esc schließt</div>';
    (document.getElementById('ui') || document.body).appendChild(f);

    var eing = f.querySelector('#cbbefehl');
    var tipps = f.querySelector('#cbtipps');
    var aus = f.querySelector('#cbaus');
    var bImmer = f.querySelector('#cbimmer');
    var bBed = f.querySelector('#cbbedingt');
    eing.value = te.befehl || '';
    aus.textContent = te.ausgabe ? ('Letzte Ausgabe: ' + te.ausgabe) : 'Noch nichts ausgeführt.';

    function schilder() {
      bImmer.textContent = te.immer ? 'Immer aktiv' : 'Braucht Redstone';
      bBed.textContent = te.bedingt ? 'Bedingt' : 'Unbedingt';
    }
    schilder();
    bImmer.addEventListener('click', function () { te.immer = !te.immer; schilder(); });
    bBed.addEventListener('click', function () { te.bedingt = !te.bedingt; schilder(); });

    function tippsZeigen() {
      var t = eing.value;
      if (t[0] !== '/') { tipps.innerHTML = ''; return; }
      tipps.innerHTML = C.vorschlaege(t, game).slice(0, 10).map(function (v, i) {
        return '<span' + (i === 0 ? ' class="erst"' : '') + '>' + v + '</span>';
      }).join('');
    }
    function schliessen() {
      f.remove(); game.cbOffen = false;
      game.suppressPauseUntil = performance.now() + 400;
      game.requestPointerLock();
    }
    function uebernehmen() {
      te.befehl = eing.value.trim();
      aus.textContent = te.befehl ? 'Befehl gespeichert.' : 'Befehl gelöscht.';
      // Ein Impulsblock, der schon unter Strom steht, soll beim nächsten Takt
      // neu auslösen – sonst müsste man das Signal erst aus- und einschalten.
      if (Block.vorher) delete Block.vorher[x + ',' + y + ',' + z];
    }
    eing.addEventListener('keydown', function (ev) {
      ev.stopPropagation();
      if (ev.key === 'Escape') { uebernehmen(); schliessen(); ev.preventDefault(); }
      else if (ev.key === 'Enter') { uebernehmen(); ev.preventDefault(); }
      else if (ev.key === 'Tab') {
        eing.value = C.ersetzeLetztes(eing.value, game);
        tippsZeigen();
        ev.preventDefault();
      }
    });
    eing.addEventListener('keyup', function (ev) { ev.stopPropagation(); tippsZeigen(); });
    f.querySelector('#cbok').addEventListener('click', uebernehmen);
    f.querySelector('#cbzu').addEventListener('click', function () { uebernehmen(); schliessen(); });

    game.cbOffen = true;
    if (document.exitPointerLock) document.exitPointerLock();
    eing.focus();
    tippsZeigen();
  };

  // Wird aus dem Spieltakt gerufen. Abgesucht wird nur ein Kasten um den
  // Spieler – ein Befehlsblock weit weg interessiert niemanden, und der Kasten
  // ist billiger als eine Liste, die beim Laden gepflegt werden müsste.
  Block.tick = function (game, dt) {
    if (!game.started || game.paused) return;
    Block.timer = (Block.timer || 0) + dt;
    if (Block.timer < 0.1) return;
    Block.timer = 0;
    var w = game.world, p = game.player;
    if (!p) return;
    var px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    var zaehler = { n: 0 };
    if (!Block.vorher) Block.vorher = {};
    for (var dy = -12; dy <= 12; dy++) {
      var y = py + dy;
      if (y < 1 || y >= MC.WORLD_HEIGHT) continue;
      for (var dz = -24; dz <= 24; dz++) {
        for (var dx = -24; dx <= 24; dx++) {
          var x = px + dx, z = pz + dz;
          var sorte = Block.sorte(game, x, y, z);
          if (!sorte || sorte === 'kette') continue;
          var te = Block.daten(game, x, y, z);
          var k = x + ',' + y + ',' + z;
          var an = te.immer || MC.Redstone.powered(w, x, y, z);
          var warAn = !!Block.vorher[k];
          Block.vorher[k] = an;
          var feuern = (sorte === 'wiederholend') ? an : (an && !warAn);
          if (!feuern) continue;
          if (zaehler.n++ >= TAKT_MAX) return;
          var ok = Block.feuern(game, x, y, z, zaehler);
          Block.kette(game, x, y, z, ok, zaehler);
        }
      }
    }
  };

  // ============================================================
  //  Vervollständigung
  // ============================================================
  // Was an dieser Stelle in Frage kommt: an erster Stelle die Befehlsnamen,
  // danach das, was der Befehl selbst anbietet.
  C.vorschlaege = function (zeile, game) {
    var ohne = zeile.replace(/^\//, '');
    var teile = ohne.split(' ');
    var letztes = teile[teile.length - 1];
    var kandidaten;
    if (teile.length <= 1) {
      kandidaten = Object.keys(BEFEHLE).sort();
    } else {
      var b = BEFEHLE[C.kurzname(teile[0]).toLowerCase()];
      kandidaten = [];
      if (letztes[0] === '@') kandidaten = Object.keys(AUSWAHL);
      else if (b && b.vervollstaendigen) { try { kandidaten = b.vervollstaendigen(game) || []; } catch (e) { kandidaten = []; } }
    }
    var klein = letztes.toLowerCase();
    return kandidaten.filter(function (c) { return c.toLowerCase().indexOf(klein) === 0; }).slice(0, 40);
  };

})();
