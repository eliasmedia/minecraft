/* ============================================================
   redstone.js  -  Signalquellen, Leitungen, Verstärker, Verbraucher

   Nach den Regeln des Originals. Der Kern ist die Unterscheidung zwischen
   starker und schwacher Aufladung eines Blocks:

   stark   kann eine frische Leitung speisen und eine Fackel umschalten.
           Quellen: Hebel und Knopf laden ihren Trägerblock, die Druckplatte
           den Block darunter, der Verstärker den Block vor sich, die
           Redstonefackel den Block über sich, und eine Leitung den Block,
           auf dem sie liegt.
   schwach schaltet nur Mechanismen, die den Block berühren. Eine Leitung
           lädt die Blöcke, auf die sie waagerecht zeigt, nur schwach — darum
           läuft ein Signal nicht endlos von Block zu Block weiter.

   Damit funktioniert das, was man erwartet: ein Hebel an einer Wand speist
   die Leitung auf der anderen Seite, eine Fackel unter einem Block speist die
   Leitung obendrauf, und eine Leitung auf einem Block schaltet die Fackel an
   dessen Seite ab — das Nicht-Gatter.

   Leitung   trägt das Signal weiter und verliert pro Block eine Stufe, also
             15 Blöcke Reichweite.
   Verstärker frischt auf 15 auf, lässt nur in eine Richtung durch und
             verzögert um 1 bis 4 Redstoneticks (Rechtsklick stellt um).
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

  // ---- Verstärker-Meta: Bits 0-1 Richtung, 2-3 Verzögerung, 4 Ausgang an ----
  R.repDir = function (m) { return B.SIDE_DIRS[m & 3]; };
  R.repDelay = function (m) { return ((m >> 2) & 3) + 1; };
  R.repOn = function (m) { return (m & 16) !== 0; };

  // Ein Block, der Aufladung an anliegende Mechanismen weitergibt. Redstoneteile
  // selbst tun das nicht – eine Lampe leitet nichts weiter.
  function leitet(id) {
    var d = ids();
    if (!id) return false;
    if (id === d.wire || id === d.torch || id === d.torchOff || id === d.repeater ||
        id === d.lever || id === d.button || id === d.plate ||
        id === d.lamp || id === d.lampLit || id === d.block) return false;
    var b = B.byId[id];
    return !!(b && b.opaque);
  }

  // Der Block, an dem ein Hebel oder Knopf hängt
  function trager(w, x, y, z) {
    var m = w.getMeta(x, y, z);
    if (m & 4) return [x, y - 1, z];
    var d = B.SIDE_DIRS[m & 3];
    return [x + d[0], y, z + d[1]];
  }

  // ============================================================
  //  Direktspeisung einer Leitung durch eine Quelle daneben
  // ============================================================
  function feedsDust(w, sx, sy, sz, tx, ty, tz) {
    var d = ids();
    var id = w.getBlock(sx, sy, sz);
    if (!id) return 0;
    var m = w.getMeta(sx, sy, sz);

    if (id === d.block) return R.MAX;
    if (id === d.torch) {
      // Alles außer dem eigenen Trägerblock
      var att = B.torchAttach(m);
      var tx2 = att ? sx + att[0] : sx, ty2 = att ? sy : sy - 1, tz2 = att ? sz + att[1] : sz;
      if (tx === tx2 && ty === ty2 && tz === tz2) return 0;
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
  R.feedsDust = feedsDust;

  // ============================================================
  //  Starke Aufladung: speist frische Leitungen, schaltet Fackeln
  // ============================================================
  // ohneLeitung überspringt die Leitung, die oben aufliegt. Beim Speisen einer
  // Leitung ist das nötig: sonst lädt sie den Block unter sich auf, der Block
  // speist sie zurück, und das Signal hält sich selbst am Leben.
  R.strong = function (w, x, y, z, ohneLeitung) {
    var d = ids();
    var i, n, nx, ny, nz, id, m;

    if (!ohneLeitung && w.getBlock(x, y + 1, z) === d.wire && w.getMeta(x, y + 1, z) > 0) return R.MAX;

    for (i = 0; i < 6; i++) {
      n = NEI[i];
      nx = x + n[0]; ny = y + n[1]; nz = z + n[2];
      id = w.getBlock(nx, ny, nz);
      if (!id) continue;
      m = w.getMeta(nx, ny, nz);

      // Fackel lädt den Block über sich
      if (id === d.torch && ny === y - 1) return R.MAX;
      // Hebel und Knopf laden ihren Trägerblock
      if ((id === d.lever || id === d.button) && (m & 8)) {
        var t = trager(w, nx, ny, nz);
        if (t[0] === x && t[1] === y && t[2] === z) return R.MAX;
      }
      // Druckplatte lädt den Block darunter
      if (id === d.plate && (m & 1) && ny === y + 1) return R.MAX;
      // Verstärker lädt den Block vor sich
      if (id === d.repeater && R.repOn(m)) {
        var rd = R.repDir(m);
        if (ny === y && nx + rd[0] === x && nz + rd[1] === z) return R.MAX;
      }
    }
    return 0;
  };

  // ============================================================
  //  Schwache Aufladung: schaltet nur anliegende Mechanismen
  // ============================================================
  R.weak = function (w, x, y, z) {
    var d = ids();
    for (var i = 0; i < 6; i++) {
      var n = NEI[i];
      var nx = x + n[0], ny = y + n[1], nz = z + n[2];
      var id = w.getBlock(nx, ny, nz);
      if (!id) continue;
      // Leitung auf gleicher Höhe zeigt auf diesen Block
      if (id === d.wire && ny === y && w.getMeta(nx, ny, nz) > 0) return R.MAX;
      // Fackel neben dem Block (nicht ihr Träger – das prüft strong)
      if (id === d.torch) {
        var att = B.torchAttach(w.getMeta(nx, ny, nz));
        var tx = att ? nx + att[0] : nx, ty = att ? ny : ny - 1, tz = att ? nz + att[1] : nz;
        if (!(tx === x && ty === y && tz === z)) return R.MAX;
      }
    }
    return 0;
  };

  // ============================================================
  //  Startwert einer Leitung
  // ============================================================
  function sourceInto(w, x, y, z) {
    var best = 0, i, n;
    for (i = 0; i < 6; i++) {
      n = NEI[i];
      var s = feedsDust(w, x + n[0], y + n[1], z + n[2], x, y, z);
      if (s > best) best = s;
    }
    if (best >= R.MAX) return best;
    // Ein stark aufgeladener Block speist die Leitung neben ihm
    for (i = 0; i < 6; i++) {
      n = NEI[i];
      var nx = x + n[0], ny = y + n[1], nz = z + n[2];
      if (!leitet(w.getBlock(nx, ny, nz))) continue;
      if (R.strong(w, nx, ny, nz, true) > best) best = R.MAX;
    }
    return best;
  }

  // ============================================================
  //  Ein Leitungsnetz durchrechnen
  // ============================================================
  // Verbindungen: waagerecht und über eine Stufe, damit Hänge gehen
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

  function solveNet(w, net) {
    var n = net.length, i, j;
    var pow = new Int32Array(n);
    var index = {};
    for (i = 0; i < n; i++) index[net[i][0] + ',' + net[i][1] + ',' + net[i][2]] = i;
    for (i = 0; i < n; i++) pow[i] = sourceInto(w, net[i][0], net[i][1], net[i][2]);

    // Weitergeben, bis nichts mehr wächst – höchstens 15 Runden, weil das
    // Signal je Block eine Stufe verliert
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
  //  Liegt an einem Mechanismus Strom an?
  // ============================================================
  R.powered = function (w, x, y, z) {
    var d = ids();
    var i, n, nx, ny, nz;
    for (i = 0; i < 6; i++) {
      n = NEI[i];
      nx = x + n[0]; ny = y + n[1]; nz = z + n[2];
      if (feedsDust(w, nx, ny, nz, x, y, z) > 0) return true;
      if (w.getBlock(nx, ny, nz) === d.wire && w.getMeta(nx, ny, nz) > 0) return true;
    }
    // Ein aufgeladener Block schaltet auch, was an ihm anliegt – stark oder schwach
    for (i = 0; i < 6; i++) {
      n = NEI[i];
      nx = x + n[0]; ny = y + n[1]; nz = z + n[2];
      if (!leitet(w.getBlock(nx, ny, nz))) continue;
      if (R.strong(w, nx, ny, nz) > 0 || R.weak(w, nx, ny, nz) > 0) return true;
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

    // Fackel und Verstärker schalten verzögert und regeln sich selbst
    if (id === d.torch || id === d.torchOff) {
      w.scheduleUpdate(x, y, z, 2);
      return;
    }
    if (id === d.repeater) {
      w.scheduleUpdate(x, y, z, R.repDelay(w.getMeta(x, y, z)) * 2);
      return;
    }

    var an = R.powered(w, x, y, z);

    if (id === d.lamp && an) { w.setBlock(x, y, z, d.lampLit, 0, { noUpdate: true }); return; }
    if (id === d.lampLit && !an) { w.setBlock(x, y, z, d.lamp, 0, { noUpdate: true }); return; }

    // Eine Tür ist zwei Blöcke hoch; nur die untere Hälfte entscheidet
    if (b.shape === B.SHAPE_DOOR) {
      var dm = w.getMeta(x, y, z);
      if (dm & 1) return;
      w.setDoorOpen(x, y, z, an || R.powered(w, x, y + 1, z));
      return;
    }
    if (b.shape === B.SHAPE_GATE) {
      var gm = w.getMeta(x, y, z);
      if (((gm & 4) !== 0) !== an) w.setMetaOnly(x, y, z, an ? (gm | 4) : (gm & ~4));
      return;
    }
    if (id === d.tnt && an) {
      var game = MC.game;
      if (!game || game.world !== w) return;
      w.setBlock(x, y, z, 0, 0);
      w.entities.push(new MC.TNTEntity(w, x + 0.5, y, z + 0.5, 2.5));
      game.audio.play('fizz');
      return;
    }
  }

  // ============================================================
  //  Einstieg: irgendwo hat sich etwas geändert
  // ============================================================
  R.onChange = function (w, x, y, z) {
    if (R.busy) return;
    R.busy = true;
    try {
      var erledigt = {}, kandidaten = {};
      var i, k;

      function merke(cx, cy, cz) { kandidaten[cx + ',' + cy + ',' + cz] = [cx, cy, cz]; }
      function merkeUmfeld(cx, cy, cz, r) {
        for (var ax = -r; ax <= r; ax++) {
          for (var ay = -r; ay <= r; ay++) {
            for (var az = -r; az <= r; az++) merke(cx + ax, cy + ay, cz + az);
          }
        }
      }

      merkeUmfeld(x, y, z, 2);

      // Alle berührten Leitungsnetze neu rechnen. Der Suchradius ist zwei, weil
      // eine Quelle über einen Block hinweg wirken kann: Hebel an der Wand,
      // Leitung auf der anderen Seite – das sind zwei Schritte.
      var starts = [];
      for (var sx = -2; sx <= 2; sx++) {
        for (var sy = -2; sy <= 2; sy++) {
          for (var sz = -2; sz <= 2; sz++) starts.push([x + sx, y + sy, z + sz]);
        }
      }
      for (var s = 0; s < starts.length; s++) {
        var c = starts[s];
        if (!isWire(w, c[0], c[1], c[2])) continue;
        if (erledigt[c[0] + ',' + c[1] + ',' + c[2]]) continue;
        var net = collectNet(w, c[0], c[1], c[2]);
        for (k = 0; k < net.length; k++) erledigt[net[k][0] + ',' + net[k][1] + ',' + net[k][2]] = true;
        solveNet(w, net);
        // Radius 2, weil ein Mechanismus hinter einem Block hängen kann:
        // Leitung, dann Block, dann Lampe – das sind zwei Schritte.
        for (k = 0; k < net.length; k++) merkeUmfeld(net[k][0], net[k][1], net[k][2], 2);
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
  R.tick = function (w, x, y, z) {
    var d = ids();
    var id = w.getBlock(x, y, z);

    // ---- Fackel: an, solange ihr Trägerblock nicht STARK aufgeladen ist ----
    if (id === d.torch || id === d.torchOff) {
      var m = w.getMeta(x, y, z);
      var att = B.torchAttach(m);
      var bx = att ? x + att[0] : x, by = att ? y : y - 1, bz = att ? z + att[1] : z;
      var willAn = R.strong(w, bx, by, bz) <= 0;
      if (willAn !== (id === d.torch)) {
        w.setBlock(x, y, z, willAn ? d.torch : d.torchOff, m, { noUpdate: true });
        R.onChange(w, x, y, z);
      }
      return true;
    }

    // ---- Verstärker: Eingang hinten, Ausgang vorne, mit Verzögerung ----
    if (id === d.repeater) {
      var rm = w.getMeta(x, y, z);
      var rd = R.repDir(rm);
      var ix = x - rd[0], iz = z - rd[1];
      var ein = feedsDust(w, ix, y, iz, x, y, z) > 0 ||
                (w.getBlock(ix, y, iz) === d.wire && w.getMeta(ix, y, iz) > 0) ||
                (leitet(w.getBlock(ix, y, iz)) && R.strong(w, ix, y, iz) > 0);
      if (ein !== R.repOn(rm)) {
        w.setMetaOnly(x, y, z, ein ? (rm | 16) : (rm & ~16));
        R.onChange(w, x, y, z);
      }
      return true;
    }
    return false;
  };

  // ============================================================
  //  Druckplatten
  // ============================================================
  // Neue Platten findet der Nahbereichsscan; gedrückte werden gemerkt und
  // danach immer geprüft, sonst bliebe eine Platte für immer unten.
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

    var gedrueckt = w._platesDown || (w._platesDown = []);
    for (var i = gedrueckt.length - 1; i >= 0; i--) {
      var q = gedrueckt[i];
      if (!schalte(q[0], q[1], q[2])) gedrueckt.splice(i, 1);
    }

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
      if (ents[i].type === 'mob' && drauf(ents[i])) return true;
    }
    return false;
  };

  // ============================================================
  //  Benutzen (Rechtsklick)
  // ============================================================
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
      game.buttonReleases = game.buttonReleases || [];
      game.buttonReleases.push({ x: x, y: y, z: z, t: 1.0 });
      return true;
    }
    if (id === d.repeater) {
      var stufe = (((m >> 2) & 3) + 1) & 3;
      w.setMetaOnly(x, y, z, (m & ~12) | (stufe << 2));
      game.audio.play('click');
      game.ui.toast('Verzögerung: ' + (stufe + 1) + (stufe === 0 ? ' Tick' : ' Ticks'));
      // Sofort neu planen, damit die neue Stufe gleich greift
      R.onChange(w, x, y, z);
      return true;
    }
    return false;
  };

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
