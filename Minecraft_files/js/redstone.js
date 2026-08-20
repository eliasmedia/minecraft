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
      repeater: B.id('repeater'), tnt: B.id('tnt'),
      obs: B.id('observer'), obsLit: B.id('observer_lit'),
      comp: B.id('comparator'), sensor: B.id('detector_rail'),
      aktiv: B.id('activator_rail'), prail: B.id('powered_rail'),
      licht: B.id('daylight_detector'), note: B.id('note_block'),
      trap: B.id('trapdoor'), spender: B.id('dispenser')
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
        id === d.lamp || id === d.lampLit || id === d.block ||
        id === d.obs || id === d.obsLit ||
        id === d.comp || id === d.licht) return false;
    var b = B.byId[id];
    // Der Schleimblock ist durchsichtig, leitet aber Redstone — im Original
    // ist das genau der Unterschied zum Honigblock, und Flugmaschinen leben
    // davon: der Beobachter speist durch den Schleim in den Kolben.
    return !!(b && (b.opaque || b.slime));
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
    // Der Beobachter gibt nach hinten ab, also entgegen seiner Blickrichtung
    if (id === d.obsLit) {
      var od = R.kolbenRichtung(m);
      return (tx === sx - od[0] && ty === sy - od[1] && tz === sz - od[2]) ? R.MAX : 0;
    }
    // Der Vergleicher ist die einzige Quelle mit ABGESTUFTEM Ausgang. Genau
    // dafuer gibt es ihn: er misst, statt nur zu schalten.
    if (id === d.comp) {
      var kd = B.compDir(m);
      if (!(ty === sy && tx === sx + kd[0] && tz === sz + kd[1])) return 0;
      return B.compStaerke(m);
    }
    // Der Tageslichtsensor speist ringsum mit der gemessenen Helligkeit
    if (id === d.licht) return m & 15;
    // Sensorschiene: eine Lore darauf laedt wie ein Hebel
    if (id === d.sensor) return (m & 16) ? R.MAX : 0;
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
      // Beobachter lädt den Block hinter sich
      if (id === d.obsLit) {
        var od2 = R.kolbenRichtung(m);
        if (nx - od2[0] === x && ny - od2[1] === y && nz - od2[2] === z) return R.MAX;
      }
      // Vergleicher lädt den Block vor sich, mit seiner Stärke
      if (id === d.comp && B.compStaerke(m) > 0) {
        var cd2 = B.compDir(m);
        if (ny === y && nx + cd2[0] === x && nz + cd2[1] === z) return B.compStaerke(m);
      }
      // Tageslichtsensor und Sensorschiene laden den Block unter sich
      if (id === d.licht && ny === y + 1 && (m & 15) > 0) return m & 15;
      if (id === d.sensor && ny === y + 1 && (m & 16)) return R.MAX;
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
      // Die STAERKE zaehlt, nicht nur das Ob: ein Vergleicher, der eine Sieben
      // ausgibt, darf ueber einen Block hinweg keine Fuenfzehn machen.
      var st = R.strong(w, nx, ny, nz, true);
      if (st > best) best = st;
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
      // Eine Stufe hinauf geht nur, wenn ueber DIESER Leitung nichts liegt —
      // ein massiver Deckel trennt. Eine Stufe hinunter nur, wenn ueber der
      // TIEFEREN Leitung nichts liegt. Ohne die beiden Pruefungen sprang das
      // Signal durch jede Decke, und verdeckte Schaltungen leckten nach oben.
      if (isWire(w, nx, y + 1, nz) && !B.isOpaque(w.getBlock(x, y + 1, z))) out.push([nx, y + 1, nz]);
      if (isWire(w, nx, y - 1, nz) && !B.isOpaque(w.getBlock(nx, y, nz))) out.push([nx, y - 1, nz]);
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
  //  Quasi-Konnektivität
  // ============================================================
  // Kolben, Werfer und Trichter schalten im Original auch dann, wenn nicht sie
  // selbst geladen sind, sondern der PLATZ ÜBER IHNEN geladen wäre — auch wenn
  // dort nur Luft ist. Das ist eine Eigenheit der Java-Ausgabe, aber eine, auf
  // der halbe Bauwerksklassen beruhen; ohne sie funktioniert kein Bauplan aus
  // dem Original. Lampe, Tür, Zauntor, Schiene und TNT haben sie NICHT.
  R.poweredQC = function (w, x, y, z) {
    return R.powered(w, x, y, z) || R.powered(w, x, y + 1, z);
  };

  // ============================================================
  //  Antriebsschienen
  // ============================================================
  // Eine Antriebsschiene reicht ihren Strom an bis zu acht weitere in derselben
  // Achse weiter. Ohne das braucht jedes Schienenstueck seine eigene Quelle,
  // und eine Strecke zu bauen wird unbezahlbar.
  R.ANTRIEB_KETTE = 8;

  // Den ganzen zusammenhaengenden Lauf einer Antriebsschiene neu bewerten und
  // das Strom-Bit setzen. Vorher las die Anzeige nur R.powered fuer die eine
  // Schiene: an einer Fackel leuchtete genau ein Stueck, obwohl die Kette
  // laengst acht weitere versorgte.
  R.antriebAktualisieren = function (w, x, y, z) {
    var prail = B.id('powered_rail');
    if (w.getBlock(x, y, z) !== prail) return;
    var lauf = [[x, y, z]];
    var enden = B.RAIL_ENDEN[w.getMeta(x, y, z) & 15] || B.RAIL_ENDEN[0];
    for (var e = 0; e < 2; e++) {
      var d = enden[e], cx = x, cy = y, cz = z;
      for (var n = 1; n <= R.ANTRIEB_KETTE; n++) {
        cx += d[0]; cz += d[1];
        var yy = cy;
        if (w.getBlock(cx, yy, cz) !== prail) {
          if (w.getBlock(cx, yy + 1, cz) === prail) yy += 1;
          else if (w.getBlock(cx, yy - 1, cz) === prail) yy -= 1;
          else break;
        }
        cy = yy;
        lauf.push([cx, cy, cz]);
      }
    }
    for (var i = 0; i < lauf.length; i++) {
      var q = lauf[i];
      var an = R.antriebAn(w, q[0], q[1], q[2]);
      var m = w.getMeta(q[0], q[1], q[2]);
      if (!!(m & 16) !== !!an) w.setMetaOnly(q[0], q[1], q[2], an ? (m | 16) : (m & ~16));
    }
  };

  R.antriebAn = function (w, x, y, z) {
    var prail = B.id('powered_rail');
    if (w.getBlock(x, y, z) !== prail) return false;
    if (R.powered(w, x, y, z)) return true;
    // Der Achse folgen, in die diese Schiene liegt
    var enden = B.RAIL_ENDEN[w.getMeta(x, y, z) & 15] || B.RAIL_ENDEN[0];
    for (var e = 0; e < 2; e++) {
      var d = enden[e];
      var cx = x, cy = y, cz = z;
      for (var n = 1; n <= R.ANTRIEB_KETTE; n++) {
        cx += d[0]; cz += d[1];
        // Steigungen: die naechste Schiene kann eine Ebene hoeher oder tiefer liegen
        var yy = cy;
        if (w.getBlock(cx, yy, cz) !== prail) {
          if (w.getBlock(cx, yy + 1, cz) === prail) yy += 1;
          else if (w.getBlock(cx, yy - 1, cz) === prail) yy -= 1;
          else break;
        }
        cy = yy;
        if (R.powered(w, cx, cy, cz)) return true;
      }
    }
    return false;
  };

  // ============================================================
  //  Verzögerte Bauteile: Sollzustand und eigene Schaltplanung
  // ============================================================
  // Zeigt eine stromführende Leitung waagerecht in diesen Block hinein?
  function leitungZeigtAuf(w, x, y, z) {
    var d = ids();
    for (var i = 0; i < 4; i++) {
      var h = HOR[i];
      if (w.getBlock(x + h[0], y, z + h[1]) === d.wire && w.getMeta(x + h[0], y, z + h[1]) > 0) return true;
    }
    return false;
  }

  // Eine Fackel brennt, solange ihr Trägerblock nicht aufgeladen ist. Stark oder
  // schwach macht hier keinen Unterschied – gerade das Nicht-Gatter lebt davon,
  // dass eine Leitung, die nur seitlich in den Block zeigt, die Fackel abschaltet.
  function torchSoll(w, x, y, z) {
    var att = B.torchAttach(w.getMeta(x, y, z));
    var bx = att ? x + att[0] : x, by = att ? y : y - 1, bz = att ? z + att[1] : z;
    return R.strong(w, bx, by, bz) <= 0 && !leitungZeigtAuf(w, bx, by, bz);
  }

  // Verriegelung: zeigt von der Seite ein EINGESCHALTETER Verstaerker in diesen
  // hinein, friert er ein und behaelt seinen Ausgang. Daraus baut man das
  // Speicherglied — ohne die Regel gibt es im Spiel keinen Latch.
  function repVerriegelt(w, x, y, z, m) {
    var d = ids();
    var rd = R.repDir(m);
    var quer = [[-rd[1], rd[0]], [rd[1], -rd[0]]];
    for (var i = 0; i < 2; i++) {
      var sx = x + quer[i][0], sz = z + quer[i][1];
      if (w.getBlock(sx, y, sz) !== d.repeater) continue;
      var sm = w.getMeta(sx, y, sz);
      if (!R.repOn(sm)) continue;
      var sd = R.repDir(sm);
      if (sx + sd[0] === x && sz + sd[1] === z) return true;
    }
    return false;
  }
  R.repVerriegelt = repVerriegelt;

  // Der Verstärker hört nur auf das, was hinten anliegt.
  function repInput(w, x, y, z, m) {
    var d = ids();
    var rd = R.repDir(m);
    var ix = x - rd[0], iz = z - rd[1];
    return feedsDust(w, ix, y, iz, x, y, z) > 0 ||
           (w.getBlock(ix, y, iz) === d.wire && w.getMeta(ix, y, iz) > 0) ||
           (leitet(w.getBlock(ix, y, iz)) && R.strong(w, ix, y, iz) > 0);
  }

  // Fackeln und Verstärker schalten nicht sofort, sondern nach ihrer eigenen
  // Verzögerung. Die Weltuhr taugt dafür nicht: sie plant jeden Nachbarn eines
  // gesetzten Blocks sofort ein und lässt pro Feld nur einen Eintrag zu, ein
  // fälliges Update würde also die gerade erst begonnene Verzögerung
  // überspringen. Darum führt Redstone eine eigene Liste – erst dadurch laufen
  // Taktgeber mit der Periode, die man am Verstärker eingestellt hat.
  function plane(w, x, y, z, an, delay) {
    var p = w._rsPlan || (w._rsPlan = {});
    var k = x + ',' + y + ',' + z;
    // Steht derselbe Wechsel schon an, bleibt sein Termin stehen
    if (p[k] && p[k].an === an) return;
    p[k] = { x: x, y: y, z: z, t: w.ticks + delay, an: an };
  }

  // Gespeicherte Chunkänderungen landen direkt in den Blockfeldern, ohne setBlock
  // und damit ohne onChange. Fackeln und Verstärker müssen darum einmal neu
  // bewertet werden – sonst steht ein Taktgeber still, sobald man den Spielstand
  // lädt oder auch nur weit genug weggelaufen ist.
  R.weckeGeladene = function (w, c, saved) {
    var d = ids(), liste = w._rsWecken || (w._rsWecken = []);
    for (var k in saved) {
      var id = (saved[k] >> 8) & 255;
      if (id !== d.torch && id !== d.torchOff && id !== d.repeater) continue;
      var i = k | 0;
      liste.push([(c.cx << 4) + (i & 15), (i >> 8) & 255, (c.cz << 4) + ((i >> 4) & 15)]);
    }
  };

  R.tickPlan = function (w) {
    // Erst die frisch geladenen Bauteile, dann die geplanten Wechsel
    var wecken = w._rsWecken;
    if (wecken && wecken.length) {
      w._rsWecken = null;
      for (var i = 0; i < wecken.length; i++) applyConsumer(w, wecken[i][0], wecken[i][1], wecken[i][2]);
    }
    var faellig = null, k, q, j;
    var plaene = [w._rsPlan, w._rsPlan2];
    for (j = 0; j < 2; j++) {
      var p = plaene[j];
      if (!p) continue;
      for (k in p) { if (p[k].t <= w.ticks) (faellig || (faellig = [])).push([p, p[k]]); }
    }
    if (!faellig) return;
    for (var i = 0; i < faellig.length; i++) {
      q = faellig[i][1];
      delete faellig[i][0][q.x + ',' + q.y + ',' + q.z];
      R.schalte(w, q.x, q.y, q.z, q.an);
    }
  };

  // Der eigentliche Umschaltvorgang, wenn die Verzögerung abgelaufen ist
  R.schalte = function (w, x, y, z, an) {
    var d = ids();
    var id = w.getBlock(x, y, z);

    // Der geplante Wechsel wird durchgezogen, auch wenn der Eingang inzwischen
    // wieder abgefallen ist. Vorher wurde hier neu geprueft und abgebrochen —
    // damit verschluckte ein Verstaerker JEDEN Impuls, der kuerzer war als
    // seine eigene Verzoegerung, ein Beobachterpuls von zwei Ticks also immer.
    // Im Original haelt das Bauteil beim Planen fest, was es tun wird, und
    // dehnt einen kurzen Impuls auf seine Laenge. Das anschliessende onChange
    // bewertet die Lage neu und plant bei Bedarf den Gegenwechsel.
    if (id === d.torch || id === d.torchOff) {
      if (an === (id === d.torch)) return;
      // Durchbrennen: wer eine Fackel zu schnell takten laesst, bekommt wie im
      // Original eine Pause. Acht Wechsel innerhalb von sechzig Ticks reichen.
      var bk = w._rsBrand || (w._rsBrand = {});
      var key = x + ',' + y + ',' + z;
      var eintrag = bk[key];
      if (!eintrag || w.ticks - eintrag.seit > 60) eintrag = bk[key] = { seit: w.ticks, n: 0 };
      eintrag.n++;
      if (eintrag.n > 8) {
        if (id === d.torch) {
          w.setBlock(x, y, z, d.torchOff, w.getMeta(x, y, z), { noUpdate: true, noRedstone: true });
          R.onChange(w, x, y, z);
        }
        // Erst nach der Ruhepause zaehlt wieder mit
        eintrag.seit = w.ticks + 40;
        eintrag.n = 0;
        return;
      }
      w.setBlock(x, y, z, an ? d.torch : d.torchOff, w.getMeta(x, y, z), { noUpdate: true, noRedstone: true });
      R.onChange(w, x, y, z);
      return;
    }
    if (id === d.repeater) {
      var m = w.getMeta(x, y, z);
      if (an === R.repOn(m)) return;
      w.setMetaOnly(x, y, z, an ? (m | 16) : (m & ~16));
      R.onChange(w, x, y, z);
      return;
    }
    if (id === d.comp) {
      var cm2 = w.getMeta(x, y, z);
      if (B.compStaerke(cm2) === an) return;
      w.setMetaOnly(x, y, z, B.compMitStaerke(cm2, an));
      R.onChange(w, x, y, z);
      return;
    }
    if (id === d.obs || id === d.obsLit) {
      if (an === (id === d.obsLit)) return;
      w.setBlock(x, y, z, an ? d.obsLit : d.obs, w.getMeta(x, y, z), { noUpdate: true, noRedstone: true });
      R.onChange(w, x, y, z);
    }
  };

  // ============================================================
  //  Vergleicher
  // ============================================================
  // Zwei Betriebsarten, wie im Original. Vergleichen: das Rueckwaertssignal
  // kommt durch, solange keine Seite staerker ist. Abziehen: Rueckwaerts minus
  // der staerksten Seite. Steht hinter ihm ein Behaelter, misst er dessen
  // Fuellstand — das ist die eigentliche Neuerung, denn damit kann eine
  // Schaltung zum ersten Mal wissen, WIE VIEL irgendwo liegt.

  // Fuellstand eines Behaelters als Signalstaerke 0..15, gerechnet wie im
  // Original: null bei leer, sonst eins plus vierzehn Fuenfzehntel der
  // durchschnittlichen Fuellung.
  R.behaelterStaerke = function (w, x, y, z) {
    var L = MC.Logistik;
    // Der Kessel hat keine Faecher, sondern einen Fuellstand im Meta 0..3.
    // Im Original misst der Vergleicher genau diesen Stand — das ist die
    // einzige Art, Regen oder Wasserverbrauch in eine Schaltung zu holen.
    if (w.getBlock(x, y, z) === B.id('cauldron')) return w.getMeta(x, y, z) & 3;
    // Ein Braustand meldet, wie viele Flaschen darin stehen
    var bt = w.tileEntities[x + ',' + y + ',' + z];
    if (bt && bt.glas) {
      var n = 0;
      for (var gi = 0; gi < bt.glas.length; gi++) if (bt.glas[gi]) n++;
      return n;
    }
    if (!L) return 0;
    var te = L.behaelter(w, x, y, z);
    if (!te) return 0;
    var faecher = te.items ? te.items : [te.input, te.fuel, te.output];
    var summe = 0, n = 0;
    for (var i = 0; i < faecher.length; i++) {
      n++;
      var st = faecher[i];
      if (!st || st.count <= 0) continue;
      var max = MC.Items.get(st.id) ? (MC.Items.get(st.id).stack || 64) : 64;
      summe += st.count / max;
    }
    if (!n || summe <= 0) return 0;
    return Math.floor(1 + (summe / n) * 14);
  };

  // Was liegt hinten am Vergleicher an? Erst ein Behaelter, sonst das Signal.
  function compHinten(w, x, y, z, m) {
    var d = ids();
    var cd = B.compDir(m);
    var hx = x - cd[0], hz = z - cd[1];
    var behaelter = R.behaelterStaerke(w, hx, y, hz);
    if (behaelter > 0) return behaelter;
    // Ein Behaelter kann auch einen Block weiter hinten stehen — im Original
    // zaehlt dort ausserdem der Rahmen; wir bleiben beim Behaelter.
    var direkt = feedsDust(w, hx, y, hz, x, y, z);
    if (w.getBlock(hx, y, hz) === d.wire) direkt = Math.max(direkt, w.getMeta(hx, y, hz));
    if (leitet(w.getBlock(hx, y, hz))) direkt = Math.max(direkt, R.strong(w, hx, y, hz));
    return direkt;
  }

  // Und was an den Seiten? Nur Leitungen, Verstaerker und andere Vergleicher —
  // ein gewoehnlicher aufgeladener Block zaehlt hier NICHT, sonst wuerde jede
  // Wand daneben den Vergleicher lahmlegen.
  function compSeiten(w, x, y, z, m) {
    var d = ids();
    var cd = B.compDir(m);
    var quer = [[-cd[1], cd[0]], [cd[1], -cd[0]]];
    var best = 0;
    for (var i = 0; i < 2; i++) {
      var sx = x + quer[i][0], sz = z + quer[i][1];
      var id = w.getBlock(sx, y, sz);
      var sm = w.getMeta(sx, y, sz);
      var v = 0;
      if (id === d.wire) v = sm;
      else if (id === d.block) v = R.MAX;    // ein Redstoneblock zaehlt wie im Original
      else if (id === d.repeater && R.repOn(sm)) {
        var rd = R.repDir(sm);
        if (sx + rd[0] === x && sz + rd[1] === z) v = R.MAX;
      } else if (id === d.comp) {
        var cd2 = B.compDir(sm);
        if (sx + cd2[0] === x && sz + cd2[1] === z) v = B.compStaerke(sm);
      }
      if (v > best) best = v;
    }
    return best;
  }

  R.compSoll = function (w, x, y, z, m) {
    var hinten = compHinten(w, x, y, z, m);
    var seite = compSeiten(w, x, y, z, m);
    if (B.compAbzug(m)) return Math.max(0, hinten - seite);
    return seite > hinten ? 0 : hinten;
  };

  // ============================================================
  //  Tageslichtsensor
  // ============================================================
  R.lichtSoll = function (w, x, y, z, m) {
    var himmel = w.getSky(x, y + 1, z);
    var hell = Math.round(himmel * (w.daylight ? w.daylight() : 1));
    if (m & 16) hell = 15 - hell;      // umgekehrt: misst die Nacht
    return Math.max(0, Math.min(15, hell));
  };

  // ============================================================
  //  Sensorschiene
  // ============================================================
  // Meta-Bit 4 heisst "eine Lore steht darauf". Gesetzt wird es aus dem
  // Weltentakt, nicht aus einem Blockupdate — eine fahrende Lore loest keins aus.
  R.tickSensorSchienen = function (game) {
    var w = game.world, d = ids();
    if (!d.sensor) return;
    var ents = w.entities;
    var drauf = {};
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.dead || e.type !== 'cart') continue;
      drauf[Math.floor(e.x) + ',' + Math.floor(e.y - 0.1) + ',' + Math.floor(e.z)] = true;
      drauf[Math.floor(e.x) + ',' + Math.floor(e.y + 0.1) + ',' + Math.floor(e.z)] = true;
    }
    var liste = w._sensorAn || (w._sensorAn = []);
    // Bekannte eingeschaltete pruefen
    for (var k = liste.length - 1; k >= 0; k--) {
      var q = liste[k];
      if (w.getBlock(q[0], q[1], q[2]) !== d.sensor) { liste.splice(k, 1); continue; }
      if (drauf[q[0] + ',' + q[1] + ',' + q[2]]) continue;
      w.setMetaOnly(q[0], q[1], q[2], w.getMeta(q[0], q[1], q[2]) & ~16);
      R.onChange(w, q[0], q[1], q[2]);
      liste.splice(k, 1);
    }
    // Neue einschalten
    for (var key in drauf) {
      var t = key.split(',');
      var x = +t[0], y = +t[1], z = +t[2];
      if (w.getBlock(x, y, z) !== d.sensor) continue;
      var m = w.getMeta(x, y, z);
      if (m & 16) continue;
      w.setMetaOnly(x, y, z, m | 16);
      R.onChange(w, x, y, z);
      liste.push([x, y, z]);
    }
  };

  // ============================================================
  //  Tageslichtsensoren im Takt nachfuehren
  // ============================================================
  // Sie haengen an der Tageszeit, nicht an einem Blockupdate — also muessen sie
  // regelmaessig nachgesehen werden. Einmal je Sekunde reicht: die Helligkeit
  // aendert sich ueber zwanzig Minuten.
  R.tickLichtsensoren = function (game) {
    var w = game.world, d = ids(), p = game.player;
    if (!d.licht) return;
    var px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    for (var dx = -12; dx <= 12; dx++) {
      for (var dy = -6; dy <= 6; dy++) {
        for (var dz = -12; dz <= 12; dz++) {
          var x = px + dx, y = py + dy, z = pz + dz;
          if (w.getBlock(x, y, z) !== d.licht) continue;
          var m = w.getMeta(x, y, z);
          var soll = R.lichtSoll(w, x, y, z, m);
          if ((m & 15) === soll) continue;
          w.setMetaOnly(x, y, z, (m & 16) | soll);
          R.onChange(w, x, y, z);
        }
      }
    }
  };

  // ============================================================
  //  Verbraucher schalten
  // ============================================================
  // Kolbenkoerper und Kopf gehoeren zusammen. Faellt einer weg, muss der andere
  // mit — sonst bleibt ein Kopf ohne Koerper stehen, und der laesst sich mangels
  // Drop nicht einmal wiederbeschaffen.
  function kolbenPaarPruefen(w, x, y, z, id) {
    var kopfN = B.id('piston_head'), kopfK = B.id('piston_head_sticky');
    var extN = B.id('piston_ext'), extK = B.id('sticky_piston_ext');
    var m = w.getMeta(x, y, z);
    var d = R.kolbenRichtung(m);
    if (id === kopfN || id === kopfK) {
      var kx = x - d[0], ky = y - d[1], kz = z - d[2];
      var koerper = w.getBlock(kx, ky, kz);
      if (koerper !== extN && koerper !== extK) {
        w.setBlock(x, y, z, 0, 0, { noUpdate: true });
        return true;
      }
    }
    if (id === extN || id === extK) {
      var hx = x + d[0], hy = y + d[1], hz = z + d[2];
      var kopf = w.getBlock(hx, hy, hz);
      if (kopf !== kopfN && kopf !== kopfK) {
        w.setBlock(x, y, z, B.id(id === extK ? 'sticky_piston' : 'piston'), m, { noUpdate: true });
        return true;
      }
    }
    return false;
  }

  function applyConsumer(w, x, y, z) {
    var d = ids();
    var id = w.getBlock(x, y, z);
    if (!id) return;
    var b = B.byId[id];
    if (!b) return;
    if (b.piston6 && kolbenPaarPruefen(w, x, y, z, id)) return;

    // Fackel und Verstärker schalten verzögert und regeln sich selbst
    if (id === d.torch || id === d.torchOff) {
      var soll = torchSoll(w, x, y, z);
      if (soll !== (id === d.torch)) plane(w, x, y, z, soll, 2);
      return;
    }
    // Der Vergleicher rechnet ohne Verzoegerungsstufen, aber mit einem Tick
    // Laufzeit — wie im Original.
    if (id === d.comp) {
      var cm = w.getMeta(x, y, z);
      var csoll = R.compSoll(w, x, y, z, cm);
      if (csoll !== B.compStaerke(cm)) plane(w, x, y, z, csoll, 2);
      return;
    }
    if (id === d.repeater) {
      var rm = w.getMeta(x, y, z);
      if (repVerriegelt(w, x, y, z, rm)) {
        // Verriegelt: geplante Wechsel verfallen, der Ausgang bleibt stehen
        if (w._rsPlan) delete w._rsPlan[x + ',' + y + ',' + z];
        return;
      }
      var rein = repInput(w, x, y, z, rm);
      if (rein !== R.repOn(rm)) plane(w, x, y, z, rein, R.repDelay(rm) * 2);
      return;
    }

    if (id === d.prail) { R.antriebAktualisieren(w, x, y, z); return; }

    // Der Beobachter gehoert zur Kolbenfamilie nur, was die Blickrichtung
    // angeht - geschaltet wird er von Blockaenderungen, nicht von Strom.
    if (id === d.obs || id === d.obsLit) return;
    if (b.piston6 && b.shape !== B.SHAPE_PISTON_HEAD) { kolbenPruefen(w, x, y, z, id); return; }

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
    if (b.shape === B.SHAPE_TRAPDOOR) {
      var tm = w.getMeta(x, y, z);
      if (((tm & 4) !== 0) !== an) w.setMetaOnly(x, y, z, an ? (tm | 4) : (tm & ~4));
      return;
    }
    if (id === d.note && an && !w._noteAn) {
      R.noteSpielen(MC.game, x, y, z);
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
  //  Kolben
  // ============================================================
  // Bewegt wird sofort, ohne Zwischenbild. Das Original schiebt in zwei Ticks
  // sichtbar hinaus; das nachzubauen hieße, für jeden Block eine eigene
  // Entität mitzuführen – der Ertrag stünde in keinem Verhältnis.
  R.SCHIEBE_MAX = 12;

  // Was ein Kolben nicht anrührt
  var UNBEWEGLICH = null;
  function unbeweglich(w, x, y, z, id) {
    if (!UNBEWEGLICH) {
      UNBEWEGLICH = {};
      ['bedrock', 'obsidian', 'chest', 'furnace', 'furnace_lit', 'spawner', 'enchanting_table',
       'anvil', 'anvil_chipped', 'anvil_damaged', 'end_portal_frame', 'dragon_egg',
       'piston_head', 'piston_head_sticky', 'piston_ext', 'sticky_piston_ext'
      ].forEach(function (n) { var i = B.id(n); if (i) UNBEWEGLICH[i] = true; });
    }
    if (UNBEWEGLICH[id]) return true;
    var b = B.byId[id];
    if (!b) return true;
    if (b.hardness < 0) return true;
    if (b.liquid) return true;
    // Alles mit eigenem Inhalt bleibt, wo es ist
    if (w.tileEntities && w.tileEntities[x + ',' + y + ',' + z]) return true;
    return false;
  }

  // Was der Kolben zerbricht, faellt als Gegenstand — vorher verschwand es
  // ersatzlos, und beim Redstonestaub merkt man das sofort.
  function zerlege(w, x, y, z) {
    var id = w.getBlock(x, y, z);
    if (!id) return;
    var b = B.byId[id];
    var game = MC.game;
    if (b && b.drop && game && game.world === w && game.mode !== 'creative') {
      var it = MC.Items.get(b.drop);
      if (it) game.spawnItem(x + 0.5, y + 0.4, z + 0.5, { id: b.drop, count: b.dropCount || 1 });
    }
    w.setBlock(x, y, z, 0, 0, { noUpdate: true });
  }

  // Zerbricht beim Schieben statt mitzugehen (Pflanzen, Fackeln, Leitungen)
  function zerbricht(id) {
    var b = B.byId[id];
    if (!b) return false;
    return b.shape === B.SHAPE_CROSS || b.shape === B.SHAPE_TORCH ||
           b.shape === B.SHAPE_WIRE || b.shape === B.SHAPE_PLATE ||
           b.shape === B.SHAPE_CROP || b.replaceable;
  }

  R.kolbenRichtung = function (m) { return B.DIR6[m & 7] || B.DIR6[0]; };

  // Die Blöcke vor dem Kolben einsammeln. null heißt: geht nicht.
  // Ein Schleimblock nimmt seine Nachbarn mit — daraus baut man bewegliche
  // Maschinen, und das ist der ganze Grund, warum es ihn gibt. Die Grenze von
  // zwölf gilt fuer alles zusammen, sonst schoebe eine Traube beliebig viel.
  function schiebeListe(w, x, y, z, d) {
    var liste = [], gesehen = {};
    function merken(cx, cy, cz) {
      var k = cx + ',' + cy + ',' + cz;
      if (gesehen[k]) return true;
      if (cy < 0 || cy >= MC.WORLD_HEIGHT) return false;
      var id = w.getBlock(cx, cy, cz);
      if (id === 0 || zerbricht(id)) return true;
      if (unbeweglich(w, cx, cy, cz, id)) return false;
      if (liste.length >= R.SCHIEBE_MAX) return false;
      gesehen[k] = true;
      liste.push({ x: cx, y: cy, z: cz, id: id, meta: w.getMeta(cx, cy, cz) });
      // Klebt der Block? Dann muessen seine Nachbarn ebenfalls mit.
      if (B.byId[id] && B.byId[id].slime) {
        for (var i = 0; i < 6; i++) {
          var n = NEI[i];
          var ax = cx + n[0], ay = cy + n[1], az = cz + n[2];
          // Zurueck zum Kolben klebt nichts
          if (ax === x && ay === y && az === z) continue;
          var aid = w.getBlock(ax, ay, az);
          if (aid === 0 || zerbricht(aid)) continue;
          if (!merken(ax, ay, az)) return false;
        }
      }
      return true;
    }
    var cx0 = x + d[0], cy0 = y + d[1], cz0 = z + d[2];
    // Erst die Reihe geradeaus, dann haengt merken() die Schleimtrauben an
    for (var n2 = 0; n2 <= R.SCHIEBE_MAX; n2++) {
      var id2 = w.getBlock(cx0, cy0, cz0);
      if (cy0 < 0 || cy0 >= MC.WORLD_HEIGHT) return null;
      if (id2 === 0 || zerbricht(id2)) break;
      if (!merken(cx0, cy0, cz0)) return null;
      cx0 += d[0]; cy0 += d[1]; cz0 += d[2];
    }
    // Vor jedem mitgenommenen Block muss Platz sein
    for (var i2 = 0; i2 < liste.length; i2++) {
      var s2 = liste[i2];
      var vx = s2.x + d[0], vy = s2.y + d[1], vz = s2.z + d[2];
      if (gesehen[vx + ',' + vy + ',' + vz]) continue;
      var vid = w.getBlock(vx, vy, vz);
      if (vid !== 0 && !zerbricht(vid)) return null;
    }
    return liste;
  }

  function ausfahren(w, x, y, z, id, m) {
    var d = R.kolbenRichtung(m);
    var liste = schiebeListe(w, x, y, z, d);
    if (!liste) return false;
    // Am Ende der Reihe steht entweder Luft oder etwas Zerbrechliches. Im
    // zweiten Fall faellt es als Gegenstand — vorher wurde es stumm
    // ueberschrieben. Das muss VOR dem Umsetzen passieren.
    var letzte = liste.length ? liste[liste.length - 1] : { x: x, y: y, z: z };
    zerlege(w, letzte.x + d[0], letzte.y + d[1], letzte.z + d[2]);
    // Erst alle alten Zellen leeren, dann alle neuen setzen. Bei einer
    // Schleimtraube reicht die Reihenfolge von hinten nach vorne nicht — die
    // Traube ist keine Kette, sie hat Aeste.
    for (var i = 0; i < liste.length; i++) {
      w.setBlock(liste[i].x, liste[i].y, liste[i].z, 0, 0, { noUpdate: true });
    }
    for (var j = 0; j < liste.length; j++) {
      var s = liste[j];
      w.setBlock(s.x + d[0], s.y + d[1], s.z + d[2], s.id, s.meta, { noUpdate: true });
    }
    // Verschobene Beobachter melden sich, siehe R.beobachterVerschoben
    for (var jb = 0; jb < liste.length; jb++) {
      R.beobachterVerschoben(w, liste[jb].x + d[0], liste[jb].y + d[1], liste[jb].z + d[2]);
    }
    var klebrig = B.byId[id].sticky;
    w.setBlock(x, y, z, B.id(klebrig ? 'sticky_piston_ext' : 'piston_ext'), m, { noUpdate: true });
    w.setBlock(x + d[0], y + d[1], z + d[2],
               B.id(klebrig ? 'piston_head_sticky' : 'piston_head'), m, { noUpdate: true });
    return true;
  }

  function einfahren(w, x, y, z, id, m) {
    var d = R.kolbenRichtung(m);
    var hx = x + d[0], hy = y + d[1], hz = z + d[2];
    var kopf = w.getBlock(hx, hy, hz);
    if (kopf === B.id('piston_head') || kopf === B.id('piston_head_sticky')) {
      w.setBlock(hx, hy, hz, 0, 0, { noUpdate: true });
    }
    var klebrig = B.byId[id].sticky;
    if (klebrig) {
      // Der Klebkolben zieht den Block hinter dem Kopf wieder mit
      var zx = hx + d[0], zy = hy + d[1], zz = hz + d[2];
      var zid = w.getBlock(zx, zy, zz);
      if (zid !== 0 && !zerbricht(zid) && !unbeweglich(w, zx, zy, zz, zid)) {
        // Zurueckziehen ist Schieben in die Gegenrichtung — dieselbe Liste,
        // damit eine Schleimtraube auch beim Einfahren zusammenbleibt.
        var rueck = [-d[0], -d[1], -d[2]];
        var zug = schiebeListe(w, zx + d[0], zy + d[1], zz + d[2], rueck);
        if (zug && zug.length) {
          for (var zi = 0; zi < zug.length; zi++) {
            w.setBlock(zug[zi].x, zug[zi].y, zug[zi].z, 0, 0, { noUpdate: true });
          }
          for (var zj = 0; zj < zug.length; zj++) {
            var zs = zug[zj];
            w.setBlock(zs.x + rueck[0], zs.y + rueck[1], zs.z + rueck[2], zs.id, zs.meta, { noUpdate: true });
          }
          for (var zb = 0; zb < zug.length; zb++) {
            R.beobachterVerschoben(w, zug[zb].x + rueck[0], zug[zb].y + rueck[1], zug[zb].z + rueck[2]);
          }
        } else {
          var zm = w.getMeta(zx, zy, zz);
          w.setBlock(zx, zy, zz, 0, 0, { noUpdate: true });
          w.setBlock(hx, hy, hz, zid, zm, { noUpdate: true });
        }
      }
    }
    w.setBlock(x, y, z, B.id(klebrig ? 'sticky_piston' : 'piston'), m, { noUpdate: true });
    return true;
  }

  // ============================================================
  //  Beobachter
  // ============================================================
  // Er hängt nicht an der Aufladung, sondern an der Veränderung: sobald sich
  // der Block vor ihm ändert, gibt er nach hinten einen kurzen Impuls ab.
  // Aufgerufen wird das aus world.setBlock, also von jeder Blockänderung.
  R.beobachtet = function (w, x, y, z) {
    var d = ids();
    if (!d.obs) return;
    for (var i = 0; i < 6; i++) {
      var n = NEI[i];
      var ox = x - n[0], oy = y - n[1], oz = z - n[2];
      var id = w.getBlock(ox, oy, oz);
      if (id !== d.obs) continue;
      var od = R.kolbenRichtung(w.getMeta(ox, oy, oz));
      // Nur wenn er wirklich auf diesen Block schaut
      if (ox + od[0] !== x || oy + od[1] !== y || oz + od[2] !== z) continue;
      R.beobachterFeuert(w, ox, oy, oz);
    }
  };

  // Ein Beobachter feuert: kurzer Impuls nach hinten, zwei Ticks lang.
  R.beobachterFeuert = function (w, x, y, z) {
    plane(w, x, y, z, true, 1);
    plane2(w, x, y, z, false, 3);
  };

  // Wird ein Beobachter SELBST verschoben, hat sich der Block vor ihm ebenfalls
  // geaendert — aus seiner Sicht. Im Original feuert er dann, und genau darauf
  // beruht jede Flugmaschine: der Kolben schiebt den Beobachter, der Beobachter
  // zuendet den naechsten Kolben, und das Ganze laeuft von selbst weiter.
  // Ohne diese Zeile steht jede Flugmaschine nach einem Schritt still.
  R.beobachterVerschoben = function (w, x, y, z) {
    var d = ids();
    if (w.getBlock(x, y, z) !== d.obs && w.getBlock(x, y, z) !== d.obsLit) return;
    R.beobachterFeuert(w, x, y, z);
  };

  // Zweiter Plan für das Abschalten: `plane` würde den Einschalttermin
  // überschreiben, weil es je Position nur einen Eintrag führt.
  function plane2(w, x, y, z, an, delay) {
    var p = w._rsPlan2 || (w._rsPlan2 = {});
    p[x + ',' + y + ',' + z] = { x: x, y: y, z: z, t: w.ticks + delay, an: an };
  }

  // Wird aus applyConsumer gerufen: Zustand mit der Aufladung abgleichen
  function kolbenPruefen(w, x, y, z, id) {
    var b = B.byId[id];
    var m = w.getMeta(x, y, z);
    var an = R.poweredQC(w, x, y, z);
    var ausgefahren = (b.name === 'piston_ext' || b.name === 'sticky_piston_ext');
    if (an === ausgefahren) return;
    var game = MC.game;
    var ok = an ? ausfahren(w, x, y, z, id, m) : einfahren(w, x, y, z, id, m);
    if (ok && game && game.world === w) game.audio.play('click');
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
    if (id === d.comp) {
      w.setMetaOnly(x, y, z, m ^ 4);
      game.audio.play('click');
      game.ui.toast(B.compAbzug(m ^ 4) ? 'Vergleicher: abziehen' : 'Vergleicher: vergleichen');
      R.onChange(w, x, y, z);
      return true;
    }
    if (id === d.note) {
      w.setMetaOnly(x, y, z, ((m & 31) + 1) % 25);
      R.noteSpielen(game, x, y, z);
      return true;
    }
    if (B.byId[id] && B.byId[id].shape === B.SHAPE_TRAPDOOR) {
      w.setMetaOnly(x, y, z, m ^ 4);
      game.audio.play('door');
      R.onChange(w, x, y, z);
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

  // ============================================================
  //  Notenblock
  // ============================================================
  // Die Tonhoehe steht im Meta (0..24, zwei Oktaven), das Instrument kommt aus
  // dem Block darunter. Rechtsklick stimmt einen Halbton hoeher.
  R.NOTE_INSTRUMENTE = {
    wood: 'note_bass', stone: 'note_bass_drum', sand: 'note_snare',
    glass: 'note_click', cloth: 'note_guitar'
  };
  R.noteSpielen = function (game, x, y, z) {
    if (!game) return;
    var w = game.world;
    var ton = w.getMeta(x, y, z) & 31;
    var unten = B.byId[w.getBlock(x, y - 1, z)];
    var art = (unten && R.NOTE_INSTRUMENTE[unten.sound]) || 'note_harfe';
    // Halbtonleiter ab F#3, wie im Original
    var hz = 277.18 * Math.pow(2, ton / 12);
    game.audio.note(art, hz, x, y, z);
    game.particles.noten(x + 0.5, y + 1.2, z + 0.5, 1);
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
