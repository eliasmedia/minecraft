/* ============================================================
   redstone.js  -  Signalquellen, Leitungen, Verstärker, Verbraucher

   Nach den Regeln des Originals, auf das Wesentliche eingekocht:

   Quellen      Hebel, Knopf, Druckplatte, Redstoneblock, Redstonefackel und
                der Ausgang eines Verstärkers geben Stärke 15 ab.
   Leitung      Redstonestaub trägt das Signal weiter und verliert pro Block
                eine Stufe. Bei 0 ist Schluss — also 15 Blöcke Reichweite.
   Verstärker   frischt das Signal wieder auf 15 auf, lässt es nur in eine
                Richtung durch und verzögert es um 1 bis 4 Ticks.
   Fackel       leuchtet, solange ihr Trägerblock KEIN Signal bekommt. Das ist
                das Nicht-Gatter; damit lassen sich Und, Oder und Taktgeber bauen.
   Verbraucher  Lampe, Eisentür, Zauntor, Holztür und TNT.

   Vereinfacht gegenüber dem Original: Leitungen laufen waagerecht und über
   eine Stufe, aber nicht an Wänden hoch, und eine Leitung speist alle
   angrenzenden Blöcke statt nur die, auf die sie zeigt.
   ============================================================ */
(function () {
  'use strict';

  var B = MC.Blocks;
  var R = {};
  MC.Redstone = R;

  R.MAX = 15;

  var ID = null;
  function ids() {
    return ID || (ID = {
      wire: B.id('redstone_wire'),
      torch: B.id('redstone_torch'), torchOff: B.id('redstone_torch_off'),
      block: B.id('redstone_block'), lever: B.id('lever'), button: B.id('stone_button'),
      plate: B.id('pressure_plate'), lamp: B.id('redstone_lamp'), lampLit: B.id('redstone_lamp_lit'),
      repeater: B.id('repeater'), tnt: B.id('tnt')
    });
  }

  var NEI = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  var HOR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  function isWire(w, x, y, z) { return w.getBlock(x, y, z) === ids().wire; }

  // ---- Verstärker-Meta ----
  R.repDir = function (m) { return B.SIDE_DIRS[m & 3]; };
  R.repDelay = function (m) { return ((m >> 2) & 3) + 1; };
  R.repOn = function (m) { return (m & 16) !== 0; };

  // ============================================================
  //  Wie stark speist (sx,sy,sz) das Feld (tx,ty,tz)?
  // ============================================================
  function feeds(w, sx, sy, sz, tx, ty, tz) {
    var d = ids();
    var id = w.getBlock(sx, sy, sz);
    if (!id) return 0;
    var m = w.getMeta(sx, sy, sz);
    if (id === d.block) return R.MAX;
    if (id === d.torch) {
      // Die Fackel speist alles außer dem Block, an dem sie hängt
      var att = B.torchAttach(m);
      if (att && tx === sx + att[0] && tz === sz + att[1] && ty === sy) return 0;
      if (!att && tx === sx && tz === sz && ty === sy - 1) return 0;
      return R.MAX;
    }
    if (id === d.lever || id === d.button) return (m & 8) ? R.MAX : 0;
    if (id === d.plate) return (m & 1) ? R.MAX : 0;
    if (id === d.repeater) {
      if (!R.repOn(m)) return 0;
      var rd = R.repDir(m);
      return (ty === sy && tx === sx + rd[0] && tz === sz + rd[1]) ? R.MAX : 0;
    }
    return 0;
  }
  R.feeds = feeds;

  // Höchste Speisung, die von außen auf dieses Feld trifft
  function sourceInto(w, x, y, z) {
    var best = 0;
    for (var i = 0; i < 6; i++) {
      var n = NEI[i];
      var s = feeds(w, x + n[0], y + n[1], z + n[2], x, y, z);
      if (s > best) best = s;
    }
    return best;
  }

  // ============================================================
  //  Ein Leitungsnetz neu durchrechnen
  // ============================================================
  // Nachbarfelder, mit denen eine Leitung verbunden ist: waagerecht und über
  // eine Stufe hinweg, damit man Hänge verdrahten kann.
  function wireNeighbours(w, x, y, z, out) {
    out.length = 0;
    for (var i = 0; i < 4; i++) {
      var h = HOR[i];
      var nx = x + h[0], nz = z + h[1];
      if (isWire(w, nx, y, nz)) { out.push([nx, y, nz]); continue; }
      if (isWire(w, nx, y + 1, nz)) out.push([nx, y + 1, nz]);
      if (isWire(w, nx, y - 1, nz)) out.push([nx, y - 1, nz]);
    }
    return out;
  }

  var NET_LIMIT = 1200;

  function collectNet(w, sx, sy, sz) {
    var net = [], seen = {}, stack = [[sx, sy, sz]], nb = [];
    while (stack.length && net.length < NET_LIMIT) {
      var c = stack.pop();
      var k = c[0] + ',' + c[1] + ',' + c[2];
      if (seen[k]) continue;
      if (!isWire(w, c[0], c[1], c[2])) continue;
      seen[k] = true;
      net.push(c);
      wireNeighbours(w, c[0], c[1], c[2], nb);
      for (var i = 0; i < nb.length; i++) stack.push([nb[i][0], nb[i][1], nb[i][2]]);
    }
    return net;
  }

  // Stärken im Netz bestimmen und in die Metadaten schreiben.
  // Gibt die Randfelder zurück, an denen Verbraucher hängen könnten.
  function solveNet(w, net) {
    var n = net.length, i, j;
    var pow = new Int32Array(n);
    var index = {};
    for (i = 0; i < n; i++) index[net[i][0] + ',' + net[i][1] + ',' + net[i][2]] = i;

    // Startwerte aus den Quellen
    for (i = 0; i < n; i++) pow[i] = sourceInto(w, net[i][0], net[i][1], net[i][2]);

    // Weitergeben, bis sich nichts mehr ändert. Höchstens 15 Runden, weil das
    // Signal je Block eine Stufe verliert.
    var nb = [];
    for (var runde = 0; runde < R.MAX; runde++) {
      var geaendert = false;
      for (i = 0; i < n; i++) {
        if (pow[i] <= 1) continue;
        wireNeighbours(w, net[i][0], net[i][1], net[i][2], nb);
        for (j = 0; j < nb.length; j++) {
          var k = index[nb[j][0] + ',' + nb[j][1] + ',' + nb[j][2]];
          if (k === undefined) continue;
          if (pow[k] < pow[i] - 1) { pow[k] = pow[i] - 1; geaendert = true; }
        }
      }
      if (!geaendert) break;
    }

    for (i = 0; i < n; i++) {
      var c = net[i];
      if (w.getMeta(c[0], c[1], c[2]) !== pow[i]) w.setMetaOnly(c[0], c[1], c[2], pow[i]);
    }
    return net;
  }

  // ============================================================
  //  Liegt an diesem Block Strom an?
  // ============================================================
  R.powered = function (w, x, y, z) {
    var d = ids();
    for (var i = 0; i < 6; i++) {
      var n = NEI[i];
      var nx = x + n[0], ny = y + n[1], nz = z + n[2];
      if (feeds(w, nx, ny, nz, x, y, z) > 0) return true;
      if (w.getBlock(nx, ny, nz) === d.wire && w.getMeta(nx, ny, nz) > 0) return true;
    }
    return false;
  };

  // ============================================================
  //  Verbraucher schalten
  // ============================================================
  function applyConsumer(w, x, y, z) {
    var d = ids();
    var id = w.getBlock(x, y, z);
    if (!id) return;
    var b = B.byId[id];
    if (!b) return;
    var an = R.powered(w, x, y, z);

    if (id === d.lamp && an) { w.setBlock(x, y, z, d.lampLit, 0, { noUpdate: true }); return; }
    if (id === d.lampLit && !an) { w.setBlock(x, y, z, d.lamp, 0, { noUpdate: true }); return; }

    // Eine Tür ist zwei Blöcke hoch. Nur die untere Hälfte entscheidet, sonst
    // sieht die obere keinen Strom und macht sofort wieder zu.
    if (b.shape === B.SHAPE_DOOR) {
      var dm = w.getMeta(x, y, z);
      if (dm & 1) return;
      w.setDoorOpen(x, y, z, an || R.powered(w, x, y + 1, z));
      return;
    }
    if (b.shape === B.SHAPE_GATE) {
      var gm = w.getMeta(x, y, z);
      var offen = (gm & 4) !== 0;
      if (offen !== an) w.setMetaOnly(x, y, z, an ? (gm | 4) : (gm & ~4));
      return;
    }
    if (id === d.tnt && an) {
      var game = MC.game;
      if (!game || !game.world || game.world !== w) return;
      w.setBlock(x, y, z, 0, 0);
      w.entities.push(new MC.TNTEntity(w, x + 0.5, y, z + 0.5, 2.5));
      game.audio.play('fizz');
      return;
    }
    // Fackeln und Verstärker schalten verzögert, damit Taktgeber möglich sind
    if (id === d.torch || id === d.torchOff || id === d.repeater) w.scheduleUpdate(x, y, z, 2);
  }

  // ============================================================
  //  Einstieg: irgendwo hat sich etwas geändert
  // ============================================================
  R.onChange = function (w, x, y, z) {
    if (R.busy) return;
    R.busy = true;
    try {
      var erledigt = {};      // schon durchgerechnete Leitungen
      var kandidaten = {};    // Felder, an denen ein Verbraucher hängen könnte
      var i, k;

      function merke(cx, cy, cz) { kandidaten[cx + ',' + cy + ',' + cz] = [cx, cy, cz]; }
      // Würfel um ein Feld. Radius 1 genügt nicht: eine Fackel hängt an einem
      // Block, der neben der Leitung liegt – das sind schon zwei Schritte.
      function merkeUmfeld(cx, cy, cz, r) {
        for (var ax = -r; ax <= r; ax++) {
          for (var ay = -r; ay <= r; ay++) {
            for (var az = -r; az <= r; az++) merke(cx + ax, cy + ay, cz + az);
          }
        }
      }

      merkeUmfeld(x, y, z, 2);

      // Alle berührten Leitungsnetze neu rechnen. Die Verbraucher hängen am
      // Rand des Netzes, nicht am Auslöser – ein Hebel kann fünfzehn Blöcke
      // von seiner Lampe entfernt liegen.
      var starts = [[x, y, z], [x, y + 1, z], [x, y - 1, z]];
      for (i = 0; i < 6; i++) starts.push([x + NEI[i][0], y + NEI[i][1], z + NEI[i][2]]);
      for (var s = 0; s < starts.length; s++) {
        var c = starts[s];
        if (!isWire(w, c[0], c[1], c[2])) continue;
        if (erledigt[c[0] + ',' + c[1] + ',' + c[2]]) continue;
        var net = collectNet(w, c[0], c[1], c[2]);
        for (k = 0; k < net.length; k++) erledigt[net[k][0] + ',' + net[k][1] + ',' + net[k][2]] = true;
        solveNet(w, net);
        for (k = 0; k < net.length; k++) merkeUmfeld(net[k][0], net[k][1], net[k][2], 1);
      }

      for (var key in kandidaten) {
        var q = kandidaten[key];
        applyConsumer(w, q[0], q[1], q[2]);
      }
    } finally { R.busy = false; }
  };

  // ============================================================
  //  Verzögerte Schaltvorgänge (aus World.doUpdate)
  // ============================================================
  // Gibt true zurück, wenn der Block behandelt wurde.
  R.tick = function (w, x, y, z) {
    var d = ids();
    var id = w.getBlock(x, y, z);

    // ---- Fackel: an, solange der Trägerblock kein Signal hat ----
    if (id === d.torch || id === d.torchOff) {
      var m = w.getMeta(x, y, z);
      var att = B.torchAttach(m);
      var bx = x, by = y - 1, bz = z;
      if (att) { bx = x + att[0]; by = y; bz = z + att[1]; }
      var trägerAn = R.powered(w, bx, by, bz);
      var willAn = !trägerAn;
      var istAn = id === d.torch;
      if (willAn !== istAn) {
        w.setBlock(x, y, z, willAn ? d.torch : d.torchOff, m, { noUpdate: true });
        R.onChange(w, x, y, z);
      }
      return true;
    }

    // ---- Verstärker: Eingang hinten, Ausgang vorne ----
    if (id === d.repeater) {
      var rm = w.getMeta(x, y, z);
      var rd = R.repDir(rm);
      var ix = x - rd[0], iz = z - rd[1];
      var ein = feeds(w, ix, y, iz, x, y, z) > 0 ||
                (w.getBlock(ix, y, iz) === d.wire && w.getMeta(ix, y, iz) > 0);
      if (ein !== R.repOn(rm)) {
        w.setMetaOnly(x, y, z, ein ? (rm | 16) : (rm & ~16));
        R.onChange(w, x, y, z);
      }
      return true;
    }
    return false;
  };

  // ============================================================
  //  Druckplatten: reagieren auf alles, was darauf steht
  // ============================================================
  // Neue Platten findet der Nahbereichsscan; gedrückte werden gemerkt und
  // danach immer geprüft. Sonst bliebe eine Platte für immer unten, sobald man
  // weit genug weggelaufen ist.
  R.tickPlates = function (game) {
    var w = game.world, d = ids();
    var p = game.player;

    function schalte(x, y, z) {
      if (w.getBlock(x, y, z) !== d.plate) return false;
      var an = R.onPlate(game, x, y, z);
      var m = w.getMeta(x, y, z);
      if (!!(m & 1) === an) return an;
      w.setMetaOnly(x, y, z, an ? 1 : 0);
      game.audio.play(an ? 'click' : 'thud');
      R.onChange(w, x, y, z);
      return an;
    }

    // 1) gedrückte Platten von letztem Mal
    var gedrueckt = w._platesDown || (w._platesDown = []);
    for (var i = gedrueckt.length - 1; i >= 0; i--) {
      var q = gedrueckt[i];
      if (!schalte(q[0], q[1], q[2])) gedrueckt.splice(i, 1);
    }

    // 2) Umfeld des Spielers nach neu belasteten Platten absuchen
    var px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    for (var dx = -6; dx <= 6; dx++) {
      for (var dy = -3; dy <= 3; dy++) {
        for (var dz = -6; dz <= 6; dz++) {
          var x = px + dx, y = py + dy, z = pz + dz;
          if (w.getBlock(x, y, z) !== d.plate) continue;
          if (!schalte(x, y, z)) continue;
          var key = x + ',' + y + ',' + z;
          var drin = false;
          for (var k = 0; k < gedrueckt.length; k++) {
            if (gedrueckt[k][3] === key) { drin = true; break; }
          }
          if (!drin) gedrueckt.push([x, y, z, key]);
        }
      }
    }
  };

  R.onPlate = function (game, x, y, z) {
    var p = game.player;
    function drauf(e) {
      return e && !e.dead &&
             e.x > x - 0.05 && e.x < x + 1.05 &&
             e.z > z - 0.05 && e.z < z + 1.05 &&
             e.y > y - 0.6 && e.y < y + 0.8;
    }
    if (drauf(p)) return true;
    var ents = game.world.entities;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.type === 'mob' && drauf(e)) return true;
    }
    return false;
  };

  // ============================================================
  //  Benutzen (Rechtsklick)
  // ============================================================
  // Gibt true zurück, wenn der Klick verbraucht wurde.
  R.use = function (game, x, y, z) {
    var w = game.world, d = ids();
    var id = w.getBlock(x, y, z);
    var m = w.getMeta(x, y, z);

    if (id === d.lever) {
      w.setMetaOnly(x, y, z, m ^ 8);
      game.audio.play('click');
      R.onChange(w, x, y, z);
      return true;
    }
    if (id === d.button) {
      if (m & 8) return true;
      w.setMetaOnly(x, y, z, m | 8);
      game.audio.play('click');
      R.onChange(w, x, y, z);
      // hält einen Moment und springt dann zurück
      w.scheduleUpdate(x, y, z, 20);
      game.buttonReleases = game.buttonReleases || [];
      game.buttonReleases.push({ x: x, y: y, z: z, t: 1.0 });
      return true;
    }
    if (id === d.repeater) {
      // Rechtsklick stellt die Verzögerung um: 1 → 2 → 3 → 4 → 1
      var stufe = (m >> 2) & 3;
      w.setMetaOnly(x, y, z, (m & ~12) | (((stufe + 1) & 3) << 2));
      game.audio.play('click');
      game.ui.toast('Verzögerung: ' + (((stufe + 1) & 3) + 1) + ' Ticks');
      return true;
    }
    return false;
  };

  // Knöpfe nach Ablauf der Zeit zurückspringen lassen
  R.tickButtons = function (game, dt) {
    var list = game.buttonReleases;
    if (!list || !list.length) return;
    var w = game.world, d = ids();
    for (var i = list.length - 1; i >= 0; i--) {
      var b = list[i];
      b.t -= dt;
      if (b.t > 0) continue;
      list.splice(i, 1);
      if (w.getBlock(b.x, b.y, b.z) !== d.button) continue;
      var m = w.getMeta(b.x, b.y, b.z);
      if (!(m & 8)) continue;
      w.setMetaOnly(b.x, b.y, b.z, m & ~8);
      game.audio.play('thud');
      R.onChange(w, b.x, b.y, b.z);
    }
  };

})();
