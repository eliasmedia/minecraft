/* ============================================================
   herobrine.js  -  Die alte Legende

   Herobrine geht auf die Anfangszeit von Minecraft zurück: ein Screenshot, ein
   Forenbeitrag, eine Geschichte, die nie stimmte und trotzdem nie wegging. Er
   war nie im Spiel. Hier ist er es – aber nicht als Gegner.

   Er tut einem nichts. Er steht nur da, wo keiner stehen sollte. Zwei
   Auftritte:

   1. **In der Ferne.** Ganz selten steht er am Rand der Sicht. Geht man auf ihn
      zu, ist er weg. Sieht man weg, kommt er näher – wie ein Weinender Engel,
      nur im Augenblick des Nichthinsehens. Das geht bis auf zehn Blöcke, dann
      verschwindet er beim nächsten Blickwechsel oder Schritt.
   2. **Direkt hinter einem.** Steht man lange still, hört man plötzlich etwas.
      Dreht man sich um, steht er da – und ist im selben Moment weg.

   Alles daran ist absichtlich unbeweisbar: kein Kampf, keine Beute, keine
   Meldung. Wer ihn sieht, sieht ihn kurz und ist sich hinterher nicht sicher.
   ============================================================ */
(function () {
  'use strict';

  var H = {};
  MC.Herobrine = H;

  var U = MC.U;

  // ---------- Stellschrauben ----------
  H.AN = true;                      // über /gamerule herobrine abschaltbar
  var PRUEF_TAKT = 3.0;             // so oft wird überhaupt gewürfelt
  // Bei einer Prüfung alle drei Sekunden heißt 0,0008 im Mittel gut eine
  // Stunde Spielzeit. Das ist Absicht: er soll eine Erinnerung wert sein.
  var CHANCE_FERN = 0.0008;
  // Der Auftritt von hinten setzt zusätzlich langes Stillstehen voraus und ist
  // damit noch seltener, obwohl die Zahl größer aussieht.
  var CHANCE_NAH = 0.004;
  var RUHE_NOETIG = 25;             // so lange muss man stillstehen
  var PAUSE_DANACH = 600;           // zehn Minuten Ruhe nach einem Auftritt
  var FERN_MIN = 42, FERN_MAX = 62; // so weit weg erscheint er zuerst
  var NAH_SCHLUSS = 10;             // näher als das kommt er nie
  var GEDULD = 45;                  // ohne Reaktion verschwindet er wieder
  var FLUCHT_WEG = 2.5;             // so viel Annäherung genügt zum Verschwinden

  // Sichtfeld etwas enger als die Kamera: er soll gelten als „nicht gesehen",
  // solange er nur am äußersten Rand klebt.
  var SICHT_WINKEL = 55 * Math.PI / 180;

  H.zustand = null;                 // null | { art, mob, ... }
  H.timer = 0;
  H.sperre = 0;
  H.ruhe = 0;

  H.zuruecksetzen = function () {
    H.entfernen(MC.game);
    H.zustand = null; H.timer = 0; H.sperre = 0; H.ruhe = 0;
  };

  // ============================================================
  //  Sehen
  // ============================================================
  // Steht er im Blickfeld UND ist nichts dazwischen? Beides muss stimmen,
  // sonst „sieht" man ihn durch einen Berg hindurch.
  H.imBlick = function (game, x, y, z) {
    var p = game.player;
    var dx = x - p.x, dy = (y + 0.9) - p.eyeY(), dz = z - p.z;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.001) return true;
    var fx = Math.sin(p.yaw) * Math.cos(p.pitch);
    var fy = -Math.sin(p.pitch);
    var fz = Math.cos(p.yaw) * Math.cos(p.pitch);
    var cos = (dx * fx + dy * fy + dz * fz) / len;
    if (cos < Math.cos(SICHT_WINKEL)) return false;
    return H.freieSicht(game, x, y, z);
  };

  H.freieSicht = function (game, x, y, z) {
    var p = game.player;
    var ox = p.x, oy = p.eyeY(), oz = p.z;
    var dx = x - ox, dy = (y + 0.9) - oy, dz = z - oz;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.001) return true;
    var t = game.world.raycast(ox, oy, oz, dx / len, dy / len, dz / len, len - 0.6, false);
    return !t;
  };

  // ============================================================
  //  Einen Standplatz finden
  // ============================================================
  // Fester Boden unter den Füßen, zwei Blöcke Luft darüber, und der Spieler
  // muss ihn sehen können – ein Herobrine hinter einer Wand ist keiner.
  H.platzSuchen = function (game, minR, maxR, mussSichtbar, umWinkel) {
    var w = game.world, p = game.player;
    for (var v = 0; v < 60; v++) {
      var winkel = umWinkel !== undefined
        ? umWinkel + (Math.random() - 0.5) * SICHT_WINKEL * 1.4
        : Math.random() * Math.PI * 2;
      var r = minR + Math.random() * (maxR - minR);
      var x = Math.floor(p.x + Math.sin(winkel) * r) + 0.5;
      var z = Math.floor(p.z + Math.cos(winkel) * r) + 0.5;
      if (!w.isLoaded(Math.floor(x), 64, Math.floor(z))) continue;
      var c = w.chunkAt(Math.floor(x), Math.floor(z));
      if (!c || c.state < 2) continue;
      var y = w.heightAtWorld(Math.floor(x), Math.floor(z));
      if (y < 1 || y >= MC.WORLD_HEIGHT - 3) continue;
      // Nicht auf Wasser und nicht im Wasser stehen
      var unten = w.getBlock(Math.floor(x), y - 1, Math.floor(z));
      var ub = MC.Blocks.byId[unten];
      if (!ub || !ub.opaque) continue;
      if (w.getBlock(Math.floor(x), y, Math.floor(z)) !== 0) continue;
      if (w.getBlock(Math.floor(x), y + 1, Math.floor(z)) !== 0) continue;
      if (Math.abs(y - p.y) > 8) continue;           // nicht tief unter oder über einem
      if (mussSichtbar && !H.imBlick(game, x, y, z)) continue;
      if (!mussSichtbar && !H.freieSicht(game, x, y, z)) continue;
      return { x: x, y: y, z: z };
    }
    return null;
  };

  // ============================================================
  //  Erscheinen und verschwinden
  // ============================================================
  H.stellen = function (game, ort) {
    H.entfernen(game);
    var m = new MC.Mob(game.world, 'herobrine', ort.x, ort.y, ort.z);
    m.herobrine = true;
    m.unverwundbar = true;
    m.yaw = Math.atan2(game.player.x - ort.x, game.player.z - ort.z);
    game.world.entities.push(m);
    return m;
  };

  H.entfernen = function (game) {
    if (!game || !game.world) return;
    var ents = game.world.entities;
    for (var i = ents.length - 1; i >= 0; i--) {
      if (ents[i].herobrine) { ents[i].dead = true; ents.splice(i, 1); }
    }
  };

  H.weg = function (game) {
    H.entfernen(game);
    H.zustand = null;
    H.sperre = PAUSE_DANACH;
  };

  // ============================================================
  //  Takt
  // ============================================================
  H.tick = function (game, dt) {
    if (!game.started || game.paused || !game.player || game.player.dead) return;
    if (game.mode === 'spectator') return;
    if (MC.Cmd && !MC.Cmd.regel(game, 'herobrine')) { if (H.zustand) H.weg(game); return; }

    var p = game.player;
    // Wie lange steht der Spieler schon still? Für den Auftritt von hinten.
    var bewegt = Math.abs(p.vx) + Math.abs(p.vz) > 0.35;
    H.ruhe = bewegt ? 0 : H.ruhe + dt;

    if (H.zustand) { H.laufend(game, dt); return; }

    if (H.sperre > 0) { H.sperre -= dt; return; }
    H.timer += dt;
    if (H.timer < PRUEF_TAKT) return;
    H.timer = 0;

    // Nur in der Oberwelt und nur unter freiem Himmel – im Stollen wirkt es
    // nicht, und man sähe ihn ohnehin nicht kommen.
    if (game.world.dim !== 'overworld') return;

    if (H.ruhe > RUHE_NOETIG && Math.random() < CHANCE_NAH) { H.hinterDirStarten(game); return; }
    if (Math.random() < CHANCE_FERN) H.fernStarten(game);
  };

  // ---------- In der Ferne ----------
  H.fernStarten = function (game) {
    var p = game.player;
    var ort = H.platzSuchen(game, FERN_MIN, FERN_MAX, true, p.yaw);
    if (!ort) return;
    var m = H.stellen(game, ort);
    H.zustand = {
      art: 'fern', mob: m,
      standAbstand: m.distTo(p),
      warGesehen: true,
      alter: 0,
      schritte: 0
    };
  };

  // ---------- Direkt hinter einem ----------
  H.hinterDirStarten = function (game) {
    var p = game.player;
    // Genau im Rücken, zwei bis drei Blöcke
    var rueck = p.yaw + Math.PI;
    var w = game.world;
    for (var v = 0; v < 12; v++) {
      var r = 2 + Math.random() * 1.2;
      var winkel = rueck + (Math.random() - 0.5) * 0.9;
      var x = Math.floor(p.x + Math.sin(winkel) * r) + 0.5;
      var z = Math.floor(p.z + Math.cos(winkel) * r) + 0.5;
      var y = w.heightAtWorld(Math.floor(x), Math.floor(z));
      if (Math.abs(y - p.y) > 2) continue;
      if (w.getBlock(Math.floor(x), y, Math.floor(z)) !== 0) continue;
      if (w.getBlock(Math.floor(x), y + 1, Math.floor(z)) !== 0) continue;
      var m = H.stellen(game, { x: x, y: y, z: z });
      game.audio.play3d('herobrine', x, y + 1.2, z, p);
      H.zustand = { art: 'nah', mob: m, alter: 0, gesehen: 0 };
      return;
    }
  };

  H.laufend = function (game, dt) {
    var z = H.zustand;
    if (!z) return;
    var m = z.mob, p = game.player;
    if (!m || m.dead) { H.weg(game); return; }
    z.alter += dt;
    // Er sieht einen immer an
    m.yaw = Math.atan2(p.x - m.x, p.z - m.z);

    if (z.art === 'nah') {
      // Umgedreht? Dann ist er im selben Augenblick weg.
      if (H.imBlick(game, m.x, m.y, m.z)) {
        z.gesehen += dt;
        if (z.gesehen > 0.45) { H.weg(game); return; }
      }
      if (z.alter > 6) H.weg(game);
      return;
    }

    // ---- die Ferne ----
    var abstand = m.distTo(p);
    var sichtbar = H.imBlick(game, m.x, m.y, m.z);

    // Auf ihn zugehen lässt ihn verschwinden. Gemessen wird gegen den Abstand
    // beim Erscheinen – gegen ein laufendes Minimum verglichen schiebt sich der
    // Bezugswert bei jedem Schritt mit und die Schwelle wird nie erreicht.
    if (z.standAbstand - abstand > FLUCHT_WEG) { H.weg(game); return; }

    // Der Augenblick des Wegsehens: jetzt rückt er nach
    if (z.warGesehen && !sichtbar) {
      z.warGesehen = false;
      if (abstand <= NAH_SCHLUSS + 1) { H.weg(game); return; }
      var ziel = Math.max(NAH_SCHLUSS + 2, abstand * (0.52 + Math.random() * 0.16));
      // Die Untergrenze gilt auch für die Streuung der Platzsuche – sonst steht
      // er am Ende doch näher als die zehn Blöcke.
      var ort = H.platzSuchen(game, Math.max(NAH_SCHLUSS, ziel - 2), ziel + 2, false, p.yaw);
      if (!ort) { H.weg(game); return; }
      m.x = ort.x; m.y = ort.y; m.z = ort.z;
      z.standAbstand = m.distTo(p);
      z.schritte++;
      // Ganz leise, damit man sich nicht sicher ist, ob da etwas war
      if (z.schritte >= 2) game.audio.play3d('herobrine', m.x, m.y + 1.2, m.z, p);
    } else if (!z.warGesehen && sichtbar) {
      z.warGesehen = true;
    }

    if (z.alter > GEDULD) H.weg(game);
  };

})();
