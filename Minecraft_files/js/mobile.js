/* ============================================================
   mobile.js  -  Die Pocket-Version: Steuerung für den Finger

   Grundsatz: **kein zweites Spiel.** Dieselbe Welt, dieselbe Spiellogik,
   derselbe Spielstand. Was hier passiert, ist ausschließlich, dass die Eingabe
   aus einer zweiten Quelle kommt — der Knüppel schreibt in dieselben
   Tastenflags, die sonst die Tastatur setzt, und das Ziehen in dieselben
   dx/dy, die sonst die Maus liefert. `Player.update` muss nicht wissen, ob
   dahinter ein Daumen oder eine Tastatur steckt.

   Diese Datei tut nichts, solange kein Touchgerät erkannt wird. Auf dem
   Rechner bleibt alles, wie es war.

   Zwei Dinge sind hier heikler, als sie aussehen:

   1. **Der Browser hält die Gesten für seine.** `user-scalable=no` im
      Viewport-Meta hilft auf iOS seit Version 10 nicht mehr — Apple ignoriert
      die Angabe bewusst. Es braucht `touch-action: none`, dazu
      `preventDefault` mit `passive: false`, dazu die iOS-eigenen
      gesture-Ereignisse. Und das alles nur auf Canvas und Overlay, damit die
      Menüs zoombar bleiben.
   2. **Mehrere Finger.** Wer `touches[0]` liest, baut sich den Fehler ein:
      setzt ein zweiter Finger auf, verschieben sich die Einträge und der
      Knüppel bekommt die Bewegung des Daumens vom Sprungknopf. Darum
      Pointer Events mit `pointerId` und `setPointerCapture` — jeder Zeiger
      gehört ab dem Aufsetzen genau einem Bedienelement, bis er losgelassen
      wird.
   ============================================================ */
(function () {
  'use strict';

  var M = {};
  MC.Mobile = M;

  M.aktiv = false;
  var WAHL_KEY = 'minecraft_html_touch';

  // ============================================================
  //  Erkennung
  // ============================================================
  M.erkannt = function () {
    var grob = false;
    try { grob = window.matchMedia('(pointer: coarse)').matches; } catch (e) { }
    return grob && (navigator.maxTouchPoints || 0) > 0;
  };

  M.wahl = function () {
    try { return localStorage.getItem(WAHL_KEY); } catch (e) { return null; }
  };

  M.sollAn = function () {
    var w = M.wahl();
    if (w === 'an') return true;
    if (w === 'aus') return false;
    return M.erkannt();
  };

  // Umschalten aus dem Pausenmenü heraus. Lädt neu, weil das Overlay tief in
  // die Eingabe greift und ein Halbzustand nur Ärger macht.
  M.umschalten = function () {
    try { localStorage.setItem(WAHL_KEY, M.aktiv ? 'aus' : 'an'); } catch (e) { }
    location.reload();
  };

  // ============================================================
  //  Aufbau
  // ============================================================
  M.start = function (game) {
    if (M.aktiv || !M.sollAn()) return false;
    M.aktiv = true;
    M.game = game;
    document.documentElement.classList.add('touch');
    M.gestenSperren();
    M.bauen();
    M.langesDrueckenEinrichten();
    M.fensterBeobachten();
    // Ohne das wertet die Spielschleife die Blickdeltas nicht aus – auf dem
    // Telefon gibt es keinen Pointer Lock, der das Flag setzen könnte.
    game.input.locked = true;
    return true;
  };

  // ---------- Browsergesten ----------
  M.gestenSperren = function () {
    // iOS feuert eigene Gestenereignisse, die von touch-action unberührt
    // bleiben. Drei Zeilen, die die letzte Lücke schließen.
    ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (n) {
      document.addEventListener(n, function (e) { e.preventDefault(); }, { passive: false });
    });
    // Doppeltipp-Zoom auf dem Spielfeld: zwei Tipps dicht hintereinander
    var letzte = 0;
    document.addEventListener('touchend', function (e) {
      if (!M.imSpielfeld(e.target)) return;
      var jetzt = Date.now();
      if (jetzt - letzte < 320) e.preventDefault();
      letzte = jetzt;
    }, { passive: false });
  };

  M.imSpielfeld = function (el) {
    if (!el || !el.closest) return false;
    return !!(el.closest('#touchui') || el.id === 'gl');
  };

  // ---------- Das Overlay ----------
  // data-tb ist die Kennung des Bedienelements, data-halt heißt „wirkt,
  // solange gedrückt", sonst wird beim Loslassen ausgelöst.
  // Piktogramme statt Emojis: die sehen auf jedem Gerät anders aus, bringen
  // eine fremde Schriftart mit und passen nicht zum Pixelstil. Hier sind sie
  // als winzige SVG gezeichnet — keine Datei, keine Schrift, überall gleich.
  function svg(inhalt) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + inhalt + '</svg>';
  }
  var SYM = {
    // Kein Werkzeug, sondern das Ergebnis: ein Block mit einem Riss. Eine
    // Spitzhacke bei 26 Pixeln war ein senkrechter Stiel mit einem Bogen
    // darüber — und damit vom Sprungpfeil daneben nicht zu unterscheiden.
    // Der Rissblock kann mit nichts sonst verwechselt werden.
    hacke: svg('<rect x="4" y="4" width="16" height="16" />' +
               '<path d="M9.5 4l2 5-3 2.5 3.5 3-1.5 5.5" />'),
    // Schwert: Klinge nach oben rechts, Parierstange quer, kurzer Griff
    schwert: svg('<path d="M20.5 3.5L11 13" />' +
                 '<path d="M20.5 3.5l-4.2.5-.5 4.2" />' +
                 '<path d="M8.2 12.2l3.6 3.6" />' +
                 '<path d="M9.5 16.2L6 19.7" />'),
    // Hand: Handfläche mit vier Fingern
    hand: svg('<path d="M9 12V5.5a1.5 1.5 0 013 0V11" /><path d="M12 11V4.5a1.5 1.5 0 013 0V11" />' +
              '<path d="M15 11V6.5a1.5 1.5 0 013 0V14c0 4-2.5 6.5-6 6.5s-6-2-6-5.5v-3l-1.5-2a1.4 1.4 0 012-2L9 12" />'),
    hoch: svg('<path d="M12 20V6" /><path d="M6 12l6-6 6 6" />'),
    runter: svg('<path d="M12 4v14" /><path d="M6 12l6 6 6-6" />'),
    // Inventar: neun Felder
    kisten: svg('<rect x="3.5" y="3.5" width="5" height="5" /><rect x="9.5" y="3.5" width="5" height="5" />' +
                '<rect x="15.5" y="3.5" width="5" height="5" /><rect x="3.5" y="9.5" width="5" height="5" />' +
                '<rect x="9.5" y="9.5" width="5" height="5" /><rect x="15.5" y="9.5" width="5" height="5" />' +
                '<rect x="3.5" y="15.5" width="5" height="5" /><rect x="9.5" y="15.5" width="5" height="5" />' +
                '<rect x="15.5" y="15.5" width="5" height="5" />'),
    balken: svg('<path d="M4 7h16" /><path d="M4 12h16" /><path d="M4 17h16" />'),
    blase: svg('<path d="M4 5h16v11H9l-5 4v-4H4z" />'),
    // Hotbar blättern: zwei Pfeile um eine Reihe Felder
    blaettern: svg('<path d="M5 8.5L1.5 12 5 15.5" /><path d="M19 8.5L22.5 12 19 15.5" />' +
                   '<rect x="7.5" y="8.5" width="4" height="7" /><rect x="12.5" y="8.5" width="4" height="7" />'),
    info: svg('<circle cx="12" cy="12" r="8.5" /><path d="M12 11v5" /><path d="M12 7.6v.9" />')
  };

  // `zieht: true` heißt: der Finger darf vom Knopf wegwandern und dreht dabei
  // die Kamera — genau das braucht man, um mehrere Blöcke hintereinander
  // abzubauen, ohne zwischendurch loszulassen.
  var KNOEPFE = [
    { id: 'menu',   ecke: 'ol', sym: 'balken',    titel: 'Menü' },
    { id: 'chat',   ecke: 'ol', sym: 'blase',     titel: 'Chat und Befehle' },
    { id: 'leiste', ecke: 'or', sym: 'blaettern', titel: 'Halten und wischen: Schnellleiste', wischt: true },
    { id: 'debug',  ecke: 'or', sym: 'info',      titel: 'Debug' },
    { id: 'aktion', ecke: 'ur', sym: 'hacke',     titel: 'Abbauen und Angreifen', halt: true, gross: true, zieht: true },
    { id: 'nutzen', ecke: 'ur', sym: 'hand',      titel: 'Setzen und Benutzen', halt: true, gross: true, zieht: true },
    { id: 'sprung', ecke: 'ur', sym: 'hoch',      titel: 'Springen', halt: true },
    { id: 'ducken', ecke: 'ur', sym: 'runter',    titel: 'Ducken', halt: true },
    { id: 'inv',    ecke: 'ur', sym: 'kisten',    titel: 'Inventar' }
  ];

  M.bauen = function () {
    var ui = document.getElementById('ui') || document.body;
    var w = document.createElement('div');
    w.id = 'touchui';
    w.innerHTML =
      '<div id="tblick"></div>' +
      '<div id="tstick"><b></b><i></i></div>' +
      '<div class="tecke ol"></div>' +
      '<div class="tecke or"></div>' +
      '<div class="tecke ur"></div>' +
      '<div id="tdreh"><div>Bitte quer halten</div></div>';
    ui.appendChild(w);
    M.wurzel = w;
    M.stick = w.querySelector('#tstick');
    M.stickKnauf = M.stick.querySelector('i');

    KNOEPFE.forEach(function (k) {
      var b = document.createElement('div');
      b.className = 'tknopf' + (k.gross ? ' gross' : '');
      b.setAttribute('data-tb', k.id);
      b.title = k.titel;
      b.innerHTML = SYM[k.sym];
      w.querySelector('.tecke.' + k.ecke).appendChild(b);
      M.zeigerBinden(b, k);
    });

    M.blickBinden(w.querySelector('#tblick'));
    M.stickBinden(M.stick);
    M.hotbarBinden();
  };

  // ============================================================
  //  Zeigerverwaltung
  // ============================================================
  // Jedes Bedienelement fängt seinen eigenen Zeiger ein. Damit gibt es keine
  // gemeinsame Liste, die durcheinandergeraten könnte, und ein Daumen, der
  // vom Knopf rutscht, bleibt trotzdem bei seinem Knopf.
  function fangen(el, ev) {
    try { el.setPointerCapture(ev.pointerId); } catch (e) { }
  }

  M.zeigerBinden = function (el, k) {
    var eigen = null, lx = 0, ly = 0, gewischt = 0;
    el.addEventListener('pointerdown', function (ev) {
      if (eigen !== null) return;
      eigen = ev.pointerId;
      lx = ev.clientX; ly = ev.clientY; gewischt = 0;
      fangen(el, ev);
      el.classList.add('an');
      ev.preventDefault();
      if (M.game && M.game.audio) M.game.audio.init();
      M.aus(k.id, true);
    }, { passive: false });

    el.addEventListener('pointermove', function (ev) {
      if (eigen !== ev.pointerId) return;
      var dx = ev.clientX - lx, dy = ev.clientY - ly;

      // Halten und wischen: durch die Schnellleiste blättern. Ein Schritt je
      // angefangenem Stück Weg, damit es sich rastend anfühlt.
      if (k.wischt) {
        // Bei einem Richtungswechsel muss der angesammelte Weg weg, sonst
        // frisst der Rest aus der Gegenrichtung den ersten Schritt zurück.
        if (dx !== 0 && (dx > 0) !== (gewischt > 0)) gewischt = 0;
        gewischt += dx;
        var stufe = 26;
        if (Math.abs(gewischt) >= stufe) {
          M.leisteSchieben(gewischt > 0 ? 1 : -1);
          gewischt = 0;
        }
      }
      // Ziehen auf dem Aktions- oder Benutzenknopf dreht die Kamera mit. Ohne
      // das müsste man zum Abbauen der nächsten Blöcke jedes Mal loslassen,
      // umsehen und neu drücken.
      else if (k.zieht) {
        var g = M.game;
        if (g && g.input) {
          g.input.dx += dx * M.empfindlichkeit();
          g.input.dy += dy * M.empfindlichkeit();
        }
      }
      lx = ev.clientX; ly = ev.clientY;
      ev.preventDefault();
    }, { passive: false });

    function los(ev) {
      if (eigen !== ev.pointerId) return;
      eigen = null;
      el.classList.remove('an');
      ev.preventDefault();
      M.aus(k.id, false);
    }
    el.addEventListener('pointerup', los, { passive: false });
    el.addEventListener('pointercancel', los, { passive: false });
  };

  // Einen Platz weiter in der Schnellleiste, mit Umlauf wie beim Mausrad.
  M.leisteSchieben = function (richtung) {
    var g = M.game;
    if (!g || !g.player) return;
    var inv = g.player.inventory;
    inv.selected = (inv.selected + richtung + 9) % 9;
    g.ui.updateHotbar();
  };

  // ---------- Blickfläche ----------
  M.blickBinden = function (el) {
    var eigen = null, lx = 0, ly = 0;
    el.addEventListener('pointerdown', function (ev) {
      if (eigen !== null) return;
      eigen = ev.pointerId; lx = ev.clientX; ly = ev.clientY;
      fangen(el, ev);
      ev.preventDefault();
    }, { passive: false });
    el.addEventListener('pointermove', function (ev) {
      if (eigen !== ev.pointerId) return;
      var g = M.game;
      if (g && g.input) {
        // Dieselben Felder, die sonst die Maus füllt – der Rest des Spiels
        // merkt keinen Unterschied.
        g.input.dx += (ev.clientX - lx) * M.empfindlichkeit();
        g.input.dy += (ev.clientY - ly) * M.empfindlichkeit();
      }
      lx = ev.clientX; ly = ev.clientY;
      ev.preventDefault();
    }, { passive: false });
    function los(ev) {
      if (eigen !== ev.pointerId) return;
      eigen = null;
      ev.preventDefault();
    }
    el.addEventListener('pointerup', los, { passive: false });
    el.addEventListener('pointercancel', los, { passive: false });
  };

  M.EMPF = 1.35;
  M.empfindlichkeit = function () { return M.EMPF; };

  // ---------- Knüppel ----------
  // Die Mitte entsteht dort, wo der Finger aufsetzt. Ein Knüppel, den man
  // erst treffen muss, ist am Telefon eine Zumutung.
  M.stickBinden = function (el) {
    var eigen = null, mx = 0, my = 0;
    var R = 52;                       // Auslenkung bis zum Anschlag

    el.addEventListener('pointerdown', function (ev) {
      if (eigen !== null) return;
      eigen = ev.pointerId;
      mx = ev.clientX; my = ev.clientY;
      fangen(el, ev);
      el.classList.add('an');
      M.stickKnauf.style.transform = 'translate(-50%,-50%)';
      ev.preventDefault();
    }, { passive: false });

    el.addEventListener('pointermove', function (ev) {
      if (eigen !== ev.pointerId) return;
      var dx = ev.clientX - mx, dy = ev.clientY - my;
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len > R) { dx = dx / len * R; dy = dy / len * R; }
      M.stickKnauf.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      M.stickSetzen(dx / R, dy / R, len / R);
      ev.preventDefault();
    }, { passive: false });

    function los(ev) {
      if (eigen !== ev.pointerId) return;
      eigen = null;
      el.classList.remove('an');
      M.stickKnauf.style.transform = 'translate(-50%,-50%)';
      M.stickSetzen(0, 0, 0);
      if (M.game && M.game.input) M.game.input.schub = 1;
      ev.preventDefault();
    }
    el.addEventListener('pointerup', los, { passive: false });
    el.addEventListener('pointercancel', los, { passive: false });
  };

  // Aus der Auslenkung werden dieselben Tastenflags, die die Tastatur setzt.
  // Eine Schwelle in der Mitte, damit ein ruhender Daumen nicht zittert.
  // Ab hier zählt eine Auslenkung als Bewegung, ab SPRINT_AB als Sprint. Der
  // Ring auf dem Knüppel zeichnet genau diesen zweiten Wert nach, damit man
  // sieht, wie weit man ziehen muss.
  M.TOT = 0.16;
  M.SPRINT_AB = 0.86;

  M.stickSetzen = function (nx, ny, laenge) {
    var g = M.game;
    if (!g || !g.input) return;
    var k = g.input.keys;
    // Die Richtung entscheidet die Achse, nicht ein fester Schwellwert je
    // Achse – sonst läuft man bei schräger Auslenkung nur diagonal oder gar
    // nicht. Alles, was mehr als ein Drittel der Hauptrichtung ausmacht,
    // zählt mit.
    var stark = Math.max(Math.abs(nx), Math.abs(ny));
    var mit = stark * 0.36;
    var an = laenge > M.TOT;
    k.KeyW = an && -ny > mit && ny < 0;
    k.KeyS = an && ny > mit && ny > 0;
    k.KeyA = an && -nx > mit && nx < 0;
    k.KeyD = an && nx > mit && nx > 0;

    // Stufenlos gehen: die Auslenkung wird zum Schub zwischen Schleichen und
    // vollem Tempo. Am Rechner bleibt das Feld unberührt und damit wirkungslos.
    if (!an) g.input.schub = 0;
    else g.input.schub = 0.28 + 0.72 * Math.min(1, (laenge - M.TOT) / (0.82 - M.TOT));
    g.input.sprintToggle = laenge >= M.SPRINT_AB && k.KeyW;
    M.stick.classList.toggle('sprint', g.input.sprintToggle);
  };

  // ============================================================
  //  Was die Knöpfe auslösen
  // ============================================================
  // Ein Ereignisobjekt, wie es onKeyDown erwartet – damit rufen wir dieselben
  // Wege auf, die die Tastatur nimmt, statt sie nachzubauen.
  function tastenEreignis(code, shift) {
    return { code: code, key: code, shiftKey: !!shift, ctrlKey: false,
             preventDefault: function () { }, stopPropagation: function () { } };
  }

  M.taste = function (code, shift) {
    if (M.game) M.game.onKeyDown(tastenEreignis(code, shift));
  };

  M.aus = function (id, an) {
    var g = M.game;
    if (!g) return;
    switch (id) {
      case 'aktion':
        if (an) { g.input.mouse[0] = true; g.onMouseDown(0); }
        else { g.input.mouse[0] = false; g.onMouseUp(0); }
        break;
      case 'nutzen':
        if (an) { g.input.mouse[2] = true; g.onMouseDown(2); }
        else { g.input.mouse[2] = false; g.onMouseUp(2); }
        break;
      case 'sprung':
        g.input.keys.Space = an;
        // Doppeltipp schaltet im Kreativmodus das Fliegen um – dieselbe
        // Auswertung wie bei der Leertaste, darum über onKeyDown.
        if (an) M.taste('Space');
        break;
      case 'ducken':
        g.input.keys.ShiftLeft = an;
        break;
      case 'inv':   if (!an) M.taste('KeyE'); break;
      case 'chat':  if (!an) M.taste('KeyT'); break;
      case 'leiste': break;                       // wirkt nur übers Wischen
      case 'debug': if (!an) M.taste('F3'); break;
      case 'menu':  if (!an) M.taste('KeyM'); break;
    }
  };

  // Das Symbol des Aktionsknopfes folgt dem Ziel: Schwert bei einer Kreatur,
  // Spitzhacke bei einem Block, blass bei nichts. Am Rechner tut dieselbe
  // Taste stumm beides – hier sieht man, was passieren wird.
  M.zielAnzeigen = function () {
    if (!M.aktiv || !M.game) return;
    var b = M.wurzel && M.wurzel.querySelector('[data-tb="aktion"]');
    if (!b) return;
    var g = M.game;
    var neu = g.targetEntity ? 'schwert' : 'hacke';
    if (b.getAttribute('data-sym') !== neu) {
      b.setAttribute('data-sym', neu);
      b.innerHTML = SYM[neu];
    }
    b.classList.toggle('blass', !g.target && !g.targetEntity);
  };

  // ---------- Hotbar ----------
  M.hotbarBinden = function () {
    var hb = document.getElementById('hotbar');
    if (!hb) return;
    hb.addEventListener('pointerdown', function (ev) {
      var s = ev.target && ev.target.closest ? ev.target.closest('.slot') : null;
      if (!s) return;
      var slots = hb.querySelectorAll('.slot');
      for (var i = 0; i < slots.length; i++) {
        if (slots[i] !== s) continue;
        var g = M.game;
        if (g && g.player) { g.player.inventory.selected = i; g.ui.updateHotbar(); }
        break;
      }
      ev.preventDefault();
    }, { passive: false });
  };

  // ============================================================
  //  Langes Drücken statt Rechtsklick
  // ============================================================
  // Die dreißig Fensterhandler in ui.js lesen ev.button. Statt sie alle
  // anzufassen, wird hier ein zweiter Mausdruck erzeugt und der echte, den
  // der Browser aus dem Tippen macht, genau einmal geschluckt.
  var LANG_MS = 420;

  M.langesDrueckenEinrichten = function () {
    var timer = null, ziel = null, sx = 0, sy = 0, ausgeloest = false;

    document.addEventListener('pointerdown', function (ev) {
      var s = ev.target && ev.target.closest ? ev.target.closest('.slot') : null;
      if (!s || s.closest('#hotbar')) return;      // die Hotbar hat ihren eigenen Weg
      ziel = s; sx = ev.clientX; sy = ev.clientY; ausgeloest = false;
      clearTimeout(timer);
      timer = setTimeout(function () {
        if (!ziel) return;
        ausgeloest = true;
        ziel.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true, cancelable: true, button: 2, buttons: 2,
          clientX: sx, clientY: sy
        }));
      }, LANG_MS);
    }, true);

    document.addEventListener('pointermove', function (ev) {
      if (!ziel) return;
      if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) > 12) {
        clearTimeout(timer); ziel = null;
      }
    }, true);

    function ende() { clearTimeout(timer); ziel = null; }
    document.addEventListener('pointerup', ende, true);
    document.addEventListener('pointercancel', ende, true);

    // Der Browser schickt nach dem Loslassen noch einen echten Mausdruck
    // hinterher. Nach einem langen Drücken wäre das ein zweiter, ungewollter
    // Griff in den Stapel – der wird hier einmal abgefangen.
    document.addEventListener('mousedown', function (ev) {
      if (!ausgeloest || ev.button !== 0) return;
      ausgeloest = false;
      ev.stopPropagation();
      ev.preventDefault();
    }, true);
  };

  // ============================================================
  //  Overlay verstecken, solange ein Fenster offen ist
  // ============================================================
  // Ohne Eingriff in die Spielschleife: ein Beobachter auf den Stilattributen
  // der beiden Vollbildebenen genügt.
  M.fensterBeobachten = function () {
    var pruefe = function () {
      var s = document.getElementById('screen');
      var m = document.getElementById('menu');
      var offen = (s && getComputedStyle(s).display !== 'none') ||
                  (m && getComputedStyle(m).display !== 'none') ||
                  !!document.getElementById('cbfenster') ||
                  (MC.Cmd && MC.Cmd.Chat && MC.Cmd.Chat.offen);
      M.wurzel.classList.toggle('weg', !!offen);
    };
    var beob = new MutationObserver(pruefe);
    ['screen', 'menu', 'ui'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) beob.observe(el, { attributes: true, attributeFilter: ['style', 'class'], childList: id === 'ui' });
    });
    pruefe();
    M.fensterPruefen = pruefe;
  };

})();
