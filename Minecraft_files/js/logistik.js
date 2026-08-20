/* ============================================================
   logistik.js  -  Trichter und Werfer

   Redstone konnte bisher schalten, aber nichts bewegen. Ohne einen Trichter
   bleibt jede Farm Handarbeit, und der Beobachter hat gar keinen Abnehmer:
   er meldet eine Änderung, und niemand tut etwas damit.

   Beides sind Behälter mit Zeitgeber, keine Redstoneleitungen. Sie hängen an
   derselben Blockentität wie die Truhe — `{ items: [...] }` —, und genau darum
   funktionieren sie mit allem zusammen, was es schon gibt: Truhe, Ofen,
   Braustand, ein zweiter Trichter.
   ============================================================ */
(function () {
  'use strict';

  var L = {};
  MC.Logistik = L;
  var B = MC.Blocks, I = MC.Items;

  L.TAKT = 0.4;          // Sekunden zwischen zwei Bewegungen
  L.HOPPER_SLOTS = 5;
  L.DROPPER_SLOTS = 9;

  // ============================================================
  //  Behälter
  // ============================================================
  // Alles, was `items` hat, ist ein Behälter. Der Ofen bekommt eine Sonderrolle,
  // weil seine drei Fächer verschiedene Aufgaben haben: von oben kommt das
  // Rohmaterial hinein, von unten wird das Ergebnis herausgezogen.
  L.behaelter = function (world, x, y, z) {
    var id = world.getBlock(x, y, z);
    if (!id) return null;
    var b = B.byId[id];
    if (!b) return null;
    if (b.name === 'chest') return MC.game && MC.game.chestTile ? MC.game.chestTile(x, y, z) : null;
    var te = world.tileEntities[x + ',' + y + ',' + z];
    if (!te) return null;
    if (te.items) return te;
    if (te.type === 'furnace') return te;
    return null;
  };

  // Ein Fach hineinlegen. Liefert true, wenn wenigstens eines untergekommen ist.
  L.einlegen = function (te, stack, vonOben) {
    if (!stack || stack.count <= 0) return false;
    if (te.type === 'furnace') {
      // Von oben das Rohmaterial, von der Seite der Brennstoff — dieselbe
      // Aufteilung wie im Original, und sie ergibt sich aus dem Aufbau des Ofens.
      var feld = vonOben ? 'input' : 'fuel';
      if (te[feld] && te[feld].id !== stack.id) return false;
      if (te[feld]) {
        var max = I.get(te[feld].id).stack || 64;
        if (te[feld].count >= max) return false;
        te[feld].count++;
      } else {
        te[feld] = I.newStack(stack.id, 1);
        if (stack.ench) te[feld].ench = stack.ench;
      }
      stack.count--;
      return true;
    }
    var items = te.items;
    if (!items) return false;
    var maxStack = I.get(stack.id) ? (I.get(stack.id).stack || 64) : 64;
    // Erst auf einen angefangenen Stapel, dann auf ein leeres Fach
    for (var i = 0; i < items.length; i++) {
      var s = items[i];
      if (s && s.id === stack.id && !s.ench && !stack.ench && s.count < maxStack) {
        s.count++; stack.count--; return true;
      }
    }
    for (var k = 0; k < items.length; k++) {
      if (!items[k]) {
        items[k] = I.newStack(stack.id, 1);
        if (stack.ench) items[k].ench = stack.ench;
        stack.count--;
        return true;
      }
    }
    return false;
  };

  // Ein Fach herausnehmen. Liefert den entnommenen Einzelstapel oder null.
  L.entnehmen = function (te, vonUnten) {
    if (te.type === 'furnace') {
      // Aus einem Ofen wird nur das Ergebnis gezogen, nie das, was noch brennt
      if (!vonUnten || !te.output) return null;
      var eins = I.newStack(te.output.id, 1);
      if (te.output.ench) eins.ench = te.output.ench;
      te.output.count--;
      if (te.output.count <= 0) te.output = null;
      return eins;
    }
    var items = te.items;
    if (!items) return null;
    for (var i = 0; i < items.length; i++) {
      var s = items[i];
      if (!s || s.count <= 0) continue;
      var raus = I.newStack(s.id, 1);
      if (s.ench) raus.ench = s.ench;
      s.count--;
      if (s.count <= 0) items[i] = null;
      return raus;
    }
    return null;
  };

  // ============================================================
  //  Trichter
  // ============================================================
  L.trichterDaten = function (world, x, y, z) {
    return world.tileEntity(x, y, z, function () {
      return { type: 'hopper', items: new Array(L.HOPPER_SLOTS), cd: 0 };
    });
  };

  L.werferDaten = function (world, x, y, z) {
    return world.tileEntity(x, y, z, function () {
      return { type: 'dropper', items: new Array(L.DROPPER_SLOTS), an: false };
    });
  };

  // Ein Trichter arbeitet in drei Schritten, und die Reihenfolge ist wichtig:
  // erst hinausgeben, dann von oben ziehen, dann liegengebliebene Gegenstände
  // aufsammeln. Andersherum ginge ein Stück in einem Takt durch — der Trichter
  // wäre dann kein Zwischenlager mehr, sondern ein Rohr.
  function trichterTakt(game, x, y, z, te, dt) {
    var world = game.world;
    te.cd -= dt;
    if (te.cd > 0) return;
    te.cd = L.TAKT;

    // Redstone hält ihn an, wie im Original
    if (MC.Redstone && MC.Redstone.poweredQC(world, x, y, z)) return;

    var meta = world.getMeta(x, y, z);
    var d = B.hopperDir(meta);

    // 1) hinausgeben
    var ziel = L.behaelter(world, x + d[0], y + d[1], z + d[2]);
    if (ziel) {
      var raus = L.entnehmen(te, false);
      if (raus) {
        if (!L.einlegen(ziel, raus, d[1] < 0)) {
          // Passte nicht — zurücklegen, sonst verschwindet es
          L.einlegen(te, raus, true);
        }
      }
    }

    // 2) von oben ziehen
    var oben = L.behaelter(world, x, y + 1, z);
    if (oben) {
      var rein = L.entnehmen(oben, true);
      if (rein && !L.einlegen(te, rein, true)) L.einlegen(oben, rein, true);
    }

    // 3) aufsammeln, was über dem Rand liegt
    var ents = world.entities;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.dead || e.type !== 'item' || e.pickupDelay > 0) continue;
      if (e.x < x - 0.2 || e.x > x + 1.2 || e.z < z - 0.2 || e.z > z + 1.2) continue;
      if (e.y < y + 0.5 || e.y > y + 1.9) continue;
      while (e.stack.count > 0 && L.einlegen(te, e.stack, true)) { /* Stück für Stück */ }
      if (e.stack.count <= 0) e.dead = true;
      break;
    }
  }

  // Der Werfer wirft auf die steigende Flanke, nicht solange Strom anliegt —
  // sonst leert er sich in einem Takt komplett.
  function werferTakt(game, x, y, z, te) {
    var world = game.world;
    var an = MC.Redstone ? MC.Redstone.poweredQC(world, x, y, z) : false;
    if (an === te.an) return;
    te.an = an;
    if (!an) return;

    var voll = [];
    for (var i = 0; i < te.items.length; i++) if (te.items[i] && te.items[i].count > 0) voll.push(i);
    if (!voll.length) { game.audio.play('nope'); return; }

    var k = voll[(Math.random() * voll.length) | 0];
    var s = te.items[k];
    var raus = I.newStack(s.id, 1);
    if (s.ench) raus.ench = s.ench;
    s.count--;
    if (s.count <= 0) te.items[k] = null;

    var meta = world.getMeta(x, y, z);
    var d = B.DIR6[meta & 7] || B.DIR6[0];

    // Steht davor ein Behaelter, wird eingelegt statt geworfen — wie im
    // Original. Nur ins Leere fliegt der Gegenstand wirklich. Ohne das liess
    // sich keine Werfer-Truhen-Kette bauen, alles landete auf dem Boden.
    var ziel = L.behaelter(world, x + d[0], y + d[1], z + d[2]);
    if (ziel && L.einlegen(ziel, raus, d[1] < 0)) { game.audio.play('click'); return; }

    var e = new MC.ItemEntity(world, x + 0.5 + d[0] * 0.7, y + 0.5 + d[1] * 0.7, z + 0.5 + d[2] * 0.7, raus);
    e.vx = d[0] * 6 + (Math.random() - 0.5) * 0.6;
    e.vy = d[1] * 6 + 1.2;
    e.vz = d[2] * 6 + (Math.random() - 0.5) * 0.6;
    e.pickupDelay = 0.4;
    world.entities.push(e);
    game.audio.play('click');
  }

  // ============================================================
  //  Takt
  // ============================================================
  // Abgesucht wird ein Kasten um den Spieler — dieselbe Lösung wie beim
  // Befehlsblock. Ein Verzeichnis aller Trichter der Welt müsste beim Laden und
  // Entladen gepflegt werden und wäre eine zweite Wahrheit neben den
  // Blockentitäten.
  L.tick = function (game, dt) {
    if (!game.started || game.paused) return;
    var world = game.world, p = game.player;
    var tes = world.tileEntities;
    for (var k in tes) {
      var te = tes[k];
      if (!te || (te.type !== 'hopper' && te.type !== 'dropper')) continue;
      var dx = te.x + 0.5 - p.x, dz = te.z + 0.5 - p.z;
      if (dx * dx + dz * dz > 64 * 64) continue;
      var id = world.getBlock(te.x, te.y, te.z);
      if (te.type === 'hopper') {
        if (id !== B.id('hopper')) continue;
        trichterTakt(game, te.x, te.y, te.z, te, dt);
      } else {
        if (id !== B.id('dropper')) continue;
        werferTakt(game, te.x, te.y, te.z, te);
      }
    }
  };

  // ============================================================
  //  Schienen
  // ============================================================
  // Eine Schiene richtet sich nach ihren Nachbarn: liegen zwei in einer Linie,
  // wird sie gerade; liegen sie über Eck, wird sie zur Kurve. Das passiert beim
  // Setzen und noch einmal bei jeder Änderung ringsum — sonst bleibt ein
  // nachträglich angebautes Stück quer liegen.
  var NACHBARN = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  L.istSchiene = function (world, x, y, z) {
    var id = world.getBlock(x, y, z);
    return id === B.id('rail') || id === B.id('powered_rail');
  };

  L.railAusrichten = function (world, x, y, z) {
    if (!L.istSchiene(world, x, y, z)) return;
    var da = [], hoch = -1;
    for (var i = 0; i < 4; i++) {
      var n = NACHBARN[i];
      if (L.istSchiene(world, x + n[0], y, z + n[1])) da.push(i);
      // Eine Schiene einen Block höher nebenan macht aus dieser eine Rampe
      else if (L.istSchiene(world, x + n[0], y + 1, z + n[1])) { da.push(i); if (hoch < 0) hoch = i; }
      // Eine Schiene einen Block TIEFER nebenan zaehlt als Nachbar, macht aus
      // dieser hier aber keine Rampe — die Rampe ist die untere. Ohne diesen
      // Fall sah die erste Schiene oben auf einer Stufe gar keinen Nachbarn
      // und legte sich quer zur Strecke.
      else if (L.istSchiene(world, x + n[0], y - 1, z + n[1])) da.push(i);
    }
    // Steigung schlägt alles andere: sonst läge am Fuß eines Anstiegs eine
    // flache Schiene und die Lore stünde vor einer Stufe.
    if (hoch >= 0) {
      var sm = 6 + hoch;
      if ((world.getMeta(x, y, z) & 15) !== sm) world.setMetaOnly(x, y, z, sm);
      return;
    }
    var meta;
    if (da.length === 0) meta = 0;
    else if (da.length === 1) meta = (da[0] % 2 === 0) ? 0 : 1;
    else {
      // Zwei gegenüberliegende Nachbarn ergeben eine Gerade, zwei benachbarte
      // eine Kurve. Bei drei oder vier gewinnt die erste gefundene Gerade —
      // Weichen gibt es nicht, und eine Kreuzung wäre eine.
      var a = da[0], b = da[1];
      if (da.length >= 3) {
        if (da.indexOf(0) >= 0 && da.indexOf(2) >= 0) { a = 0; b = 2; }
        else { a = 1; b = 3; }
      }
      if ((a + 2) % 4 === b) meta = (a % 2 === 0) ? 0 : 1;
      else {
        var paar = [a, b].sort(function (p1, p2) { return p1 - p2; }).join('');
        meta = { '01': 2, '12': 3, '23': 4, '03': 5 }[paar];
        if (meta === undefined) meta = 0;
      }
    }
    if ((world.getMeta(x, y, z) & 15) !== meta) world.setMetaOnly(x, y, z, meta);
  };

  // Nach jeder Änderung an einer Schiene richten sich auch die Nachbarn neu aus
  L.railUmgebung = function (world, x, y, z) {
    L.railAusrichten(world, x, y, z);
    for (var i = 0; i < 4; i++) {
      var n = NACHBARN[i];
      // Auch eine Ebene darüber und darunter: eine neue Schiene am Fuß eines
      // Hangs macht aus der oberen eine Rampe und umgekehrt.
      L.railAusrichten(world, x + n[0], y, z + n[1]);
      L.railAusrichten(world, x + n[0], y + 1, z + n[1]);
      L.railAusrichten(world, x + n[0], y - 1, z + n[1]);
    }
  };

  // ============================================================
  //  Lore
  // ============================================================
  // Sie fährt nicht frei durch die Gegend, sondern folgt der Schiene unter sich:
  // aus deren Verlauf kommt die Richtung, und die Lore wird jedes Bild auf die
  // Mitte des Gleises gezogen. Damit kann sie gar nicht erst entgleisen.
  var MAX_TEMPO = 11;     // Höchstgeschwindigkeit einer Lore
  var SCHUB_MAX = 2.6;    // so schnell wird man von Hand, nicht schneller

  function Minecart(world, x, y, z) {
    MC.Entity.call(this, world, x, y, z);
    this.width = 0.94; this.height = 0.7;
    this.type = 'cart';
    this.tempo = 0;                 // Blöcke je Sekunde ENTLANG dir, mit Vorzeichen
    this.dir = [0, 1];              // Fahrtrichtung in der Ebene
    this.reiter = null;
    this.neigung = 0;      // Längsneigung auf einer Rampe
    this.gravity = 30;
  }
  Minecart.prototype = Object.create(MC.Entity.prototype);
  Minecart.prototype.constructor = Minecart;
  MC.Minecart = Minecart;
  L.Minecart = Minecart;

  Minecart.prototype.railUnter = function () {
    var w = this.world;
    var bx = Math.floor(this.x), bz = Math.floor(this.z);
    // Von oben nach unten suchen: auf einer Rampe steht die Lore höher als der
    // Block, zu dem die Schiene gehört.
    for (var dy = 1; dy >= -1; dy--) {
      var by = Math.floor(this.y + 0.1) + dy;
      if (!L.istSchiene(w, bx, by, bz)) continue;
      return { x: bx, y: by, z: bz, meta: w.getMeta(bx, by, bz) & 15,
               antrieb: w.getBlock(bx, by, bz) === B.id('powered_rail') };
    }
    return null;
  };

  // Höhe innerhalb einer Rampenzelle: 0 am Fuß, 1 an der Bergkante.
  function rampenHoehe(schiene, x, z) {
    var auf = B.railSteigung(schiene.meta);
    if (!auf) return 0;
    var l = auf[0] ? (x - schiene.x) : (z - schiene.z);
    if (auf[0] < 0 || auf[1] < 0) l = 1 - l;
    return Math.max(0, Math.min(1, l));
  }

  // Die ganze Fahrt in einer Größe: `tempo` ist die Geschwindigkeit ENTLANG
  // `dir`, mit Vorzeichen. Vorher gab es einen Betrag und eine Richtung, die
  // beim Gegensteuern umsprang — dabei wurde man schneller statt langsamer,
  // weil der Betrag ja stieg. Mit Vorzeichen bremst ein Schub von vorne
  // einfach, kehrt um und beschleunigt in die andere Richtung.
  Minecart.prototype.update = function (dt, game) {
    var w = this.world;
    this.age += dt;
    var schiene = this.railUnter();

    if (!schiene) {
      // Vom Gleis herunter: der Schwung steckt bis hierher in `tempo` entlang
      // `dir` und wurde nie in echte Geschwindigkeit umgesetzt — die Lore blieb
      // wie angenagelt liegen und liess sich auch nicht mehr anschieben.
      // Einmal umbuchen, dann ist sie ein gewoehnlicher Koerper.
      if (this.tempo !== 0) {
        this.vx += this.dir[0] * this.tempo;
        this.vz += this.dir[1] * this.tempo;
        this.tempo = 0;
      }
      this.applyPhysics(dt, 0.98, 0.4);
      if (this.reiter) this.reiterSetzen();
      return;
    }
    // Zurueck auf dem Gleis: die Restgeschwindigkeit wieder in Fahrt umbuchen
    if (this.vx !== 0 || this.vz !== 0) {
      this.tempo += this.vx * this.dir[0] + this.vz * this.dir[1];
      this.vx = 0; this.vz = 0;
    }

    var steigung = B.railSteigung(schiene.meta);
    var enden = steigung ? B.RAIL_ENDEN_STEIGUNG[schiene.meta - 6]
                         : (B.RAIL_ENDEN[schiene.meta] || B.RAIL_ENDEN[0]);
    // Die Achse bleibt, wo sie war — sonst springt die Fahrtrichtung in jeder
    // Kurve. Gewählt wird das Ende, das der bisherigen Achse am nächsten liegt.
    var bestes = enden[0], bestP = -9;
    for (var i = 0; i < 2; i++) {
      var pkt = enden[i][0] * this.dir[0] + enden[i][1] * this.dir[1];
      if (pkt > bestP) { bestP = pkt; bestes = enden[i]; }
    }
    this.dir = [bestes[0], bestes[1]];

    // ---- Kräfte ----
    // 1) Schwerkraft auf der Rampe. Sie ist die eigentliche Quelle von Tempo:
    //    wer in die Mine hinunter will, braucht keinen Antrieb.
    if (steigung) {
      var bergauf = steigung[0] * this.dir[0] + steigung[1] * this.dir[1];
      this.tempo -= bergauf * 11 * dt;
    }

    // 2) Antriebsschiene: unter Strom Gas, ohne Strom Bremse. Steht die Lore,
    //    stößt sie in Achsenrichtung an.
    if (schiene.antrieb) {
      var an = MC.Redstone ? MC.Redstone.antriebAn(w, schiene.x, schiene.y, schiene.z) : false;
      if (an) {
        if (Math.abs(this.tempo) < 0.3) this.tempo = 1.2;
        else this.tempo += (this.tempo > 0 ? 1 : -1) * 14 * dt;
      } else {
        this.tempo *= Math.pow(0.02, dt);
      }
    }

    // 3) Der Reiter schiebt nur an — Tempo kommt aus Gefälle und Antrieb.
    if (this.reiter && this.reiter.reitEingabe) {
      var e = this.reiter.reitEingabe;
      if (e.vor || e.zurueck) {
        var blick = [Math.sin(this.reiter.yaw), Math.cos(this.reiter.yaw)];
        var wohin = (blick[0] * this.dir[0] + blick[1] * this.dir[1]) >= 0 ? 1 : -1;
        if (e.zurueck) wohin = -wohin;
        this.schub(wohin, dt);
      }
    }

    this.tempo *= Math.pow(0.86, dt);
    if (Math.abs(this.tempo) < 0.04) this.tempo = 0;
    if (this.tempo > MAX_TEMPO) this.tempo = MAX_TEMPO;
    if (this.tempo < -MAX_TEMPO) this.tempo = -MAX_TEMPO;

    // ---- Fahren ----
    // In Schritten von hoechstens einem halben Block. Bei elf Bloecken je
    // Sekunde und einem langen Bild sprang die Lore sonst ueber eine ganze
    // Kurvenzelle hinweg: die Richtung wurde nie umgesetzt, und sie flog
    // geradeaus aus dem Gleis. Zwischen den Schritten wird die Schiene neu
    // gelesen, damit jede Zelle ihre Kurve auch bekommt.
    var weg = Math.abs(this.tempo) * dt;
    var schritte = Math.max(1, Math.ceil(weg / 0.5));
    var sdt = dt / schritte;
    var mx = schiene.x + 0.5, mz = schiene.z + 0.5;
    for (var si = 0; si < schritte; si++) {
      this.x += this.dir[0] * this.tempo * sdt;
      this.z += this.dir[1] * this.tempo * sdt;
      var zelle = this.railUnter();
      if (!zelle) break;
      // Neue Zelle: Achse an ihren Verlauf anpassen, sonst faehrt die Lore in
      // der Kurve geradeaus weiter
      if (zelle.x !== schiene.x || zelle.z !== schiene.z || zelle.y !== schiene.y) {
        schiene = zelle;
        var st2 = B.railSteigung(zelle.meta);
        var en2 = st2 ? B.RAIL_ENDEN_STEIGUNG[zelle.meta - 6]
                      : (B.RAIL_ENDEN[zelle.meta] || B.RAIL_ENDEN[0]);
        var b2 = en2[0], p2 = -9;
        for (var e2 = 0; e2 < 2; e2++) {
          var pk2 = en2[e2][0] * this.dir[0] + en2[e2][1] * this.dir[1];
          if (pk2 > p2) { p2 = pk2; b2 = en2[e2]; }
        }
        this.dir = [b2[0], b2[1]];
        mx = zelle.x + 0.5; mz = zelle.z + 0.5;
      }
      // In der Querachse immer auf die Gleismitte ziehen
      if (this.dir[0] === 0) this.x += (mx - this.x) * Math.min(1, sdt * 12);
      if (this.dir[1] === 0) this.z += (mz - this.z) * Math.min(1, sdt * 12);
    }

    // Nach dem Zug erneut nachsehen, welche Schiene jetzt unter uns liegt —
    // sonst hängt die Höhe auf einer Rampe ein Feld hinterher.
    var jetzt = this.railUnter() || schiene;
    this.y = jetzt.y + 0.12 + rampenHoehe(jetzt, this.x, this.z);
    this.vy = 0;
    this.onGround = true;

    // Gegen eine Wand ist Schluss — aber eine Stufe ist keine Wand. Auf einer
    // Rampe liegt der nächste Block zwangsläufig eine Ebene höher; wer nur auf
    // gleicher Höhe nachsieht, bleibt am Anstieg kleben.
    var vx = Math.floor(this.x + this.dir[0] * 0.7), vz = Math.floor(this.z + this.dir[1] * 0.7);
    var frei = L.istSchiene(w, vx, jetzt.y, vz) ||
               L.istSchiene(w, vx, jetzt.y + 1, vz) ||
               L.istSchiene(w, vx, jetzt.y - 1, vz) ||
               !B.isSolid(w.getBlock(vx, jetzt.y + 1, vz));
    if (!frei) {
      this.tempo = 0;
      this.x = mx; this.z = mz;
    }
    // Die Neigung merken, damit der Renderer die Lore schräg stellen kann
    var auf = B.railSteigung(jetzt.meta);
    this.neigung = auf ? -(auf[0] * this.dir[0] + auf[1] * this.dir[1]) * 0.72 : 0;
    if (this.reiter) this.reiterSetzen();
  };

  // Anschieben — von Hand oder vom Reiter. Der Deckel ist der Punkt: mit der
  // Hand kommt man in Gang, aber nicht auf Fahrt.
  Minecart.prototype.schub = function (richtung, dt) {
    var ziel = richtung * SCHUB_MAX;
    if (richtung > 0 && this.tempo >= ziel) return;
    if (richtung < 0 && this.tempo <= ziel) return;
    this.tempo += richtung * 9 * dt;
    if (richtung > 0 && this.tempo > ziel) this.tempo = ziel;
    if (richtung < 0 && this.tempo < ziel) this.tempo = ziel;
  };

  Minecart.prototype.reiterSetzen = function () {
    var r = this.reiter;
    if (!r || r.reittier !== this) { this.reiter = null; return; }
    r.x = this.x; r.z = this.z; r.y = this.y + 0.12;
    r.onGround = true;
    r.sitzt = true;          // Beine nach vorn, Auge tiefer
  };

  // Wer dagegenläuft, schiebt sie an — aber nur bis Schrittgeschwindigkeit.
  // Tempo gibt es nur bergab oder auf einer Antriebsschiene.
  Minecart.prototype.anstossen = function (p, dt) {
    dt = dt || 1 / 60;
    var dx = this.x - p.x, dz = this.z - p.z;
    // Neben dem Gleis gibt es keine Achse, an der ein Schub entlanglaufen
    // koennte — dort wird die Lore einfach weggeschoben. Vorher lief der Schub
    // immer in `tempo`, und das wertet ohne Schiene niemand aus: eine
    // herausgesprungene Lore war unbewegbar.
    if (!this.railUnter()) {
      var l = Math.sqrt(dx * dx + dz * dz) || 1;
      var soll = SCHUB_MAX;
      var vl = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
      if (vl < soll) {
        this.vx += dx / l * 9 * dt;
        this.vz += dz / l * 9 * dt;
      }
      return;
    }
    var richtung = (dx * this.dir[0] + dz * this.dir[1]) >= 0 ? 1 : -1;
    this.schub(richtung, dt);
  };

  // Beim Abbauen fällt der Inhalt heraus — das erledigt breakBlock über
  // `te.items` bereits; hier steht nur, was darüber hinaus nötig ist.
  L.abgebaut = function (game, x, y, z) { /* nichts Eigenes */ };

})();
