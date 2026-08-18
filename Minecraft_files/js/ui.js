/* ============================================================
   ui.js  -  HUD, Inventar, Crafting, Ofen, Truhe, Menüs
   ============================================================ */
(function () {
  'use strict';

  var I = MC.Items, B = MC.Blocks, R = MC.Recipes, Icons = MC.Icons;

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  // Alle Namen kommen aus unseren eigenen Tabellen, aber innerHTML mit
  // ungeprüftem Text ist trotzdem eine schlechte Angewohnheit.
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function UI(game) {
    this.game = game;
    this.open = null;          // null | 'inventory' | 'crafting' | 'furnace' | 'chest' | 'creative'
    this.cursor = null;        // Stack an der Maus
    this.craftGrid = [];
    this.craftSize = 2;
    this.craftResult = null;
    this.chest = null;
    this.furnace = null;
    this.toasts = [];
    this.creativeTab = 'bau';
    this.creativeSearch = '';
  }
  MC.UI = UI;

  UI.prototype.init = function () {
    var self = this;
    this.root = document.getElementById('ui');
    this.hud = document.getElementById('hud');
    this.screen = document.getElementById('screen');
    this.debugEl = document.getElementById('debug');
    this.toastEl = document.getElementById('toasts');
    this.crosshair = document.getElementById('crosshair');
    this.overlay = document.getElementById('overlay');
    this.deathEl = document.getElementById('death');
    this.menuEl = document.getElementById('menu');
    this.hotbarEl = document.getElementById('hotbar');
    this.statsEl = document.getElementById('stats');
    this.itemNameEl = document.getElementById('itemname');
    this.effectsEl = document.getElementById('effects');
    this.mapEl = document.getElementById('mapview');
    this.mapCanvas = document.getElementById('mapcanvas');
    this.mapMark = document.getElementById('mapmark');

    // Hotbar aufbauen
    this.hotbarSlots = [];
    for (var i = 0; i < 9; i++) {
      var s = el('div', 'slot hotbar-slot', this.hotbarEl);
      s.dataset.index = i;
      this.hotbarSlots.push(s);
      (function (idx) {
        s.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          self.game.player.inventory.selected = idx;
          self.updateHotbar();
        });
      })(i);
    }

    // Lebens-/Hungerleisten
    this.healthEl = document.getElementById('health');
    this.hungerEl = document.getElementById('hunger');
    this.armorEl = document.getElementById('armorbar');
    this.airEl = document.getElementById('air');
    this.xpEl = document.getElementById('xpbar');
    this.xpFill = document.getElementById('xpfill');
    this.xpLevel = document.getElementById('xplevel');

    this.hearts = [];
    for (var h = 0; h < 10; h++) this.hearts.push(el('div', 'icon heart', this.healthEl));
    this.hungers = [];
    for (var f = 0; f < 10; f++) this.hungers.push(el('div', 'icon food', this.hungerEl));
    this.armors = [];
    for (var a = 0; a < 10; a++) this.armors.push(el('div', 'icon armor', this.armorEl));
    this.bubbles = [];
    for (var b = 0; b < 10; b++) this.bubbles.push(el('div', 'icon bubble', this.airEl));

    // Cursor-Item
    this.cursorEl = el('div', 'cursor-item', this.root);
    this.cursorEl.style.display = 'none';
    document.addEventListener('mousemove', function (ev) {
      self.mouseX = ev.clientX; self.mouseY = ev.clientY;
      if (self.cursor) {
        self.cursorEl.style.left = ev.clientX + 'px';
        self.cursorEl.style.top = ev.clientY + 'px';
      }
    });

    // Klick neben das Fenster wirft den Stack an der Maus in die Welt – wie Q.
    // Links = alles, rechts = ein Stück.
    this.screen.addEventListener('mousedown', function (ev) {
      if (ev.target !== self.screen || !self.cursor) return;
      ev.preventDefault();
      self.dropCursor(ev.button === 2 ? 1 : self.cursor.count);
    });
    this.screen.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });

    this.buildHudIcons();
    this.buildCompass();
    this.updateHotbar();
  };

  // ============================================================
  //  Kompassband
  // ============================================================
  // Ein Streifen oben am Bildschirm, wie ihn Spiele üblicherweise zeigen:
  // ±90° Blickfeld, Norden ist -Z. Sichtbar, sobald man einen Kompass in der
  // Hand hält oder den Gravitithelm trägt.
  var COMPASS_FOV = 90;
  var DIRS = [['N', 0], ['NO', 45], ['O', 90], ['SO', 135],
              ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];

  UI.prototype.buildCompass = function () {
    this.compassEl = document.getElementById('compass');
    this.compassBand = document.getElementById('compassband');
    this.compassCoords = document.getElementById('compasscoords');
    this.compassMarks = [];
    var self = this;
    DIRS.forEach(function (d) {
      var e = el('i', 'cdir' + (d[0].length === 1 ? ' major' : ''), self.compassBand);
      e.textContent = d[0];
      self.compassMarks.push({ el: e, angle: d[1] * Math.PI / 180 });
    });
    // Zielmarke: zeigt mit dem Gravitithelm zum Endportal
    this.compassGoal = el('i', 'cgoal', this.compassBand);
    this.compassGoal.textContent = '◆';
  };

  // Winkel im Uhrzeigersinn ab Norden (-Z)
  function bearingTo(dx, dz) { return Math.atan2(dx, -dz); }
  function wrapPi(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function placeMark(node, delta) {
    var deg = delta * 180 / Math.PI;
    if (Math.abs(deg) > COMPASS_FOV) { node.style.display = 'none'; return; }
    node.style.display = '';
    node.style.left = (50 + deg / COMPASS_FOV * 50) + '%';
    node.style.opacity = (1 - Math.abs(deg) / COMPASS_FOV * 0.75).toFixed(2);
  }

  // Wohin zeigt die Marke? Nur der Gravitithelm kennt das Ziel.
  UI.prototype.compassTarget = function () {
    var g = this.game;
    if (!g.player.gravHelm) return null;
    if (g.dim === 'overworld') {
      try { return MC.Stronghold.portalPos(g.world.gen); } catch (e) { return null; }
    }
    if (g.dim === 'the_end') return { x: 0, y: MC.End.TOP, z: 0, title: 'Ausgang' };
    return null;
  };

  UI.prototype.updateCompass = function () {
    var g = this.game, p = g.player;
    if (!p) return;
    var st = p.inventory.selectedStack();
    var inHand = !!(st && st.id === 'compass');
    if (!inHand && !p.gravHelm) { this.compassEl.style.display = 'none'; return; }
    this.compassEl.style.display = 'flex';

    var d = p.lookDir();
    var bearing = bearingTo(d.x, d.z);
    for (var i = 0; i < this.compassMarks.length; i++) {
      var m = this.compassMarks[i];
      placeMark(m.el, wrapPi(m.angle - bearing));
    }

    var t = this.compassTarget();
    var extra = '';
    if (t) {
      var tdx = t.x - p.x, tdz = t.z - p.z;
      placeMark(this.compassGoal, wrapPi(bearingTo(tdx, tdz) - bearing));
      extra = '   ' + (t.title || 'Endportal') + ' ' + Math.round(Math.sqrt(tdx * tdx + tdz * tdz)) + ' m';
    } else {
      this.compassGoal.style.display = 'none';
    }

    this.compassCoords.textContent =
      'X ' + Math.floor(p.x) + '   Y ' + Math.floor(p.y) + '   Z ' + Math.floor(p.z) + extra;
  };

  // ============================================================
  //  Bossleiste (Enderdrache)
  // ============================================================
  UI.prototype.updateBossBar = function () {
    var g = this.game;
    if (!this.bossEl) {
      this.bossEl = document.getElementById('bossbar');
      this.bossName = document.getElementById('bossname');
      this.bossFill = document.getElementById('bossfill');
      this.bossHint = document.getElementById('bosshint');
    }
    var dragon = (g.dim === 'the_end' && MC.End) ? MC.End.dragon(g.world) : null;
    if (!dragon) { this.bossEl.style.display = 'none'; return; }
    this.bossEl.style.display = 'flex';
    this.bossName.textContent = 'Enderdrache';
    this.bossFill.style.width = Math.max(0, dragon.hp / dragon.maxHp * 100) + '%';
    var n = MC.End.crystalsAlive(g.world).length;
    this.bossHint.textContent = n
      ? n + ' Enderkristall' + (n === 1 ? '' : 'e') + ' heilen ihn noch'
      : 'Alle Kristalle zerstört';
  };

  // ============================================================
  //  Abspann
  // ============================================================
  UI.prototype.showCredits = function () {
    var self = this, g = this.game;
    if (!this.creditsEl) this.creditsEl = document.getElementById('credits');
    this.creditsOpen = true;
    g.exitPointerLock();
    this.creditsEl.style.display = 'flex';
    this.creditsEl.innerHTML = '';
    var roll = el('div', 'croll', this.creditsEl);
    roll.innerHTML = [
      '<h1>Du hast es geschafft.</h1>',
      '<p>Der Enderdrache ist gefallen. Das Portal hat dich zurückgetragen.</p>',
      '<hr>',
      '<h2>Der Weg dahin</h2>',
      '<p>Ein Baum. Ein paar Bretter. Eine Werkbank.<br>' +
      'Eine Nacht, die man in einem Erdloch abgewartet hat.</p>',
      '<p>Zehn Blöcke Obsidian und ein Feuerzeug — der <b>Nether</b>.<br>' +
      'Vierzehn Blöcke Glowstone aus einer Bastion — der <b>Aether</b>.<br>' +
      'Ein Helm aus Gravitit, der den Weg zeigt.</p>',
      '<p>Sechs Lohenruten. Zwölf Enderperlen. Zwölf Augen.<br>' +
      'Und ganz unten, unter dreißig Blöcken Stein, ein Rahmen,<br>' +
      'der auf genau das gewartet hat — <b>das Ende</b>.</p>',
      '<hr>',
      '<h2>Minecraft — HTML Edition</h2>',
      '<p>Eine Voxelwelt in einer Datei.<br>' +
      'Eigener WebGL2-Renderer, 355 prozedurale Texturen,<br>' +
      'kein Framework, kein Server, keine externen Dateien.</p>',
      '<p class="dim">Privates Lernprojekt. Minecraft ist eine Marke von Mojang Studios.</p>',
      '<hr>',
      '<p>Die Welt läuft weiter. Das Ende steht offen — der Drache kommt nicht wieder.</p>'
    ].join('');
    var btn = el('button', 'mbtn', this.creditsEl);
    btn.textContent = 'Weiterspielen';
    btn.addEventListener('click', function () { self.hideCredits(); });
  };

  UI.prototype.hideCredits = function () {
    if (!this.creditsOpen) return;
    this.creditsOpen = false;
    this.creditsEl.style.display = 'none';
    this.game.requestPointerLock();
  };

  // Wirft n Stück aus dem Cursor-Stack vor den Spieler
  UI.prototype.dropCursor = function (n) {
    if (!this.cursor) return;
    n = Math.min(n, this.cursor.count);
    if (n <= 0) return;
    this.game.throwStack({ id: this.cursor.id, count: n, dur: this.cursor.dur });
    this.cursor.count -= n;
    if (this.cursor.count <= 0) this.cursor = null;
    this.game.audio.play('pop');
    this.updateCursorEl();
  };

  // ---------- HUD-Symbole prozedural erzeugen ----------
  UI.prototype.buildHudIcons = function () {
    var S = 18;
    function mk(draw) {
      var c = document.createElement('canvas');
      c.width = S; c.height = S;
      var x = c.getContext('2d');
      x.imageSmoothingEnabled = false;
      draw(x);
      return 'url(' + c.toDataURL() + ')';
    }
    function heartPath(x) {
      x.beginPath();
      x.moveTo(9, 16);
      x.bezierCurveTo(-1, 9, 1, 2, 5, 2);
      x.bezierCurveTo(7.2, 2, 8.4, 3.4, 9, 4.6);
      x.bezierCurveTo(9.6, 3.4, 10.8, 2, 13, 2);
      x.bezierCurveTo(17, 2, 19, 9, 9, 16);
      x.closePath();
    }
    function heart(fill, halfOnly) {
      return mk(function (x) {
        // Hintergrund (leer)
        heartPath(x);
        x.fillStyle = '#3a1010'; x.fill();
        x.lineWidth = 1.6; x.strokeStyle = '#111'; x.stroke();
        if (!fill) return;
        x.save();
        if (halfOnly) { x.beginPath(); x.rect(0, 0, 9, S); x.clip(); }
        heartPath(x);
        x.fillStyle = '#e23a3a'; x.fill();
        x.strokeStyle = '#7d1414'; x.lineWidth = 1.2; x.stroke();
        x.restore();
      });
    }
    function drumstickPath(x) {
      x.beginPath();
      x.arc(6, 6.5, 4.4, 0, 6.3); x.closePath();
      x.moveTo(8, 8); x.lineTo(15, 14); x.lineTo(12.5, 16); x.lineTo(6, 10); x.closePath();
    }
    function food(fill, halfOnly) {
      return mk(function (x) {
        drumstickPath(x); x.fillStyle = '#3a2a18'; x.fill();
        x.strokeStyle = '#111'; x.lineWidth = 1.5; x.stroke();
        if (!fill) return;
        x.save();
        if (halfOnly) { x.beginPath(); x.rect(0, 0, 9, S); x.clip(); }
        drumstickPath(x); x.fillStyle = '#c98a3e'; x.fill();
        x.strokeStyle = '#6b4418'; x.lineWidth = 1.2; x.stroke();
        x.restore();
      });
    }
    function shieldPath(x) {
      x.beginPath();
      x.moveTo(9, 1.5); x.lineTo(16, 4.5); x.lineTo(16, 9);
      x.quadraticCurveTo(16, 14, 9, 16.5);
      x.quadraticCurveTo(2, 14, 2, 9); x.lineTo(2, 4.5);
      x.closePath();
    }
    function armor(fill, halfOnly) {
      return mk(function (x) {
        shieldPath(x); x.fillStyle = '#2c2c30'; x.fill();
        x.strokeStyle = '#111'; x.lineWidth = 1.5; x.stroke();
        if (!fill) return;
        x.save();
        if (halfOnly) { x.beginPath(); x.rect(0, 0, 9, S); x.clip(); }
        shieldPath(x); x.fillStyle = '#d8d8de'; x.fill();
        x.strokeStyle = '#6f6f78'; x.lineWidth = 1.2; x.stroke();
        x.restore();
      });
    }
    function bubble(fill) {
      return mk(function (x) {
        x.beginPath(); x.arc(9, 9, 6.4, 0, 6.3);
        x.fillStyle = fill ? '#8fdcff' : '#26404d'; x.fill();
        x.strokeStyle = '#111'; x.lineWidth = 1.5; x.stroke();
        if (fill) { x.beginPath(); x.arc(6.8, 6.6, 1.8, 0, 6.3); x.fillStyle = '#ffffff'; x.fill(); }
      });
    }

    var css = [
      '.heart.full{background-image:' + heart(true, false) + '}',
      '.heart.half{background-image:' + heart(true, true) + '}',
      '.heart.empty{background-image:' + heart(false, false) + '}',
      '.food.full{background-image:' + food(true, false) + '}',
      '.food.half{background-image:' + food(true, true) + '}',
      '.food.empty{background-image:' + food(false, false) + '}',
      '.armor.full{background-image:' + armor(true, false) + '}',
      '.armor.half{background-image:' + armor(true, true) + '}',
      '.armor.empty{background-image:' + armor(false, false) + '}',
      '.bubble.full{background-image:' + bubble(true) + '}',
      '.bubble.empty{background-image:' + bubble(false) + '}'
    ].join('\n');
    var st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  };

  // ============================================================
  //  HUD
  // ============================================================
  UI.prototype.updateHotbar = function () {
    if (!this.game.player) return;
    var inv = this.game.player.inventory;
    for (var i = 0; i < 9; i++) {
      var slot = this.hotbarSlots[i];
      slot.classList.toggle('selected', i === inv.selected);
      this.renderSlot(slot, inv.slots[i]);
    }
    var st = inv.selectedStack();
    if (st) {
      var it = I.get(st.id);
      var zauber = MC.Ench ? MC.Ench.beschreiben(st) : [];
      this.itemNameEl.innerHTML = escapeHtml(MC.Ench ? MC.Ench.anzeigeName(st) : (it ? it.title : st.id)) +
        (zauber.length ? '<span class="ench">' + escapeHtml(zauber.join(' · ')) + '</span>' : '');
      this.itemNameEl.classList.add('show');
      clearTimeout(this._nameTimer);
      var self = this;
      this._nameTimer = setTimeout(function () { self.itemNameEl.classList.remove('show'); }, 1800);
    } else {
      this.itemNameEl.classList.remove('show');
    }
  };

  // Laufende Statuseffekte am rechten Rand, mit Restzeit
  UI.prototype.updateEffects = function (p) {
    if (!this.effectsEl || !MC.Effekte) return;
    var liste = p.effekte || [];
    var sig = liste.map(function (e) { return e.key + e.stufe + Math.ceil(e.rest); }).join('|');
    if (sig === this._effSig) return;
    this._effSig = sig;
    this.effectsEl.innerHTML = '';
    for (var i = 0; i < liste.length; i++) {
      var e = liste[i], spec = MC.Effekte.LISTE[e.key];
      if (!spec) continue;
      var row = el('div', 'eff', this.effectsEl);
      var punkt = el('i', '', row);
      punkt.style.background = spec.farbe;
      var m = Math.floor(e.rest / 60), sek = Math.floor(e.rest % 60);
      row.appendChild(document.createTextNode(
        spec.titel + (e.stufe > 1 ? ' ' + MC.Ench.roemisch(e.stufe) : '') +
        '  ' + m + ':' + (sek < 10 ? '0' : '') + sek));
    }
  };

  // Karte in der Hand: kleiner Ausschnitt unten rechts, mit M gross
  UI.prototype.updateMap = function () {
    var g = this.game, p = g.player;
    if (!this.mapEl || !MC.Karte) return;
    var st = p.inventory.selectedStack();
    var an = !!(st && st.id === 'map' && !this.isOpen());
    this.mapEl.classList.toggle('show', an);
    this.mapEl.classList.toggle('big', an && !!this.mapGross);
    if (!an) return;
    if (!st.karte) st.karte = MC.Karte.neu(Math.floor(p.x), Math.floor(p.z));
    var neu = MC.Karte.erkunden(st.karte, Math.floor(p.x), Math.floor(p.z), 26);
    // Neu zeichnen nur, wenn sich etwas geaendert hat - die Karte ist 128x128
    // Spalten, das will man nicht jeden Frame durchrechnen.
    this._mapT = (this._mapT || 0) + 1;
    var sig = st.karte.x + ':' + st.karte.z;
    if (neu || this._mapSig !== sig || (this._mapT % 90) === 0) {
      MC.Karte.zeichnen(g.world, st.karte, this.mapCanvas);
      this._mapSig = sig;
    }
    var z = MC.Karte.zeiger(st.karte, p.x, p.z);
    if (!z) { this.mapMark.style.display = 'none'; return; }
    this.mapMark.style.display = 'block';
    this.mapMark.style.left = (z.x * 100) + '%';
    this.mapMark.style.top = (z.z * 100) + '%';
  };

  UI.prototype.renderSlot = function (dom, stack) {
    if (!stack || stack.count <= 0) {
      dom.style.backgroundImage = '';
      dom._id = null;          // sonst bleibt der Slot beim Zurücklegen leer
      dom.innerHTML = '';
      dom.title = '';
      return;
    }
    if (dom._id !== stack.id) {
      dom.style.backgroundImage = 'url(' + Icons.url(stack.id) + ')';
      dom._id = stack.id;
    }
    var html = '';
    if (stack.count > 1) html += '<span class="count">' + stack.count + '</span>';
    var it = I.get(stack.id);
    if (stack.dur !== undefined && it && it.durability) {
      var frac = stack.dur / it.durability;
      var col = frac > 0.5 ? '#3c3' : (frac > 0.25 ? '#dd3' : '#d33');
      html += '<span class="durbar"><i style="width:' + Math.round(frac * 100) + '%;background:' + col + '"></i></span>';
    }
    // Verzaubertes schimmert violett und nennt seine Verzauberungen im Tooltip
    var zauber = MC.Ench ? MC.Ench.beschreiben(stack) : [];
    if (zauber.length) html += '<span class="glint"></span>';
    dom.innerHTML = html;
    dom.title = (MC.Ench ? MC.Ench.anzeigeName(stack) : (it ? it.title : stack.id)) +
                (zauber.length ? '\n' + zauber.join('\n') : '');
  };

  UI.prototype.updateHUD = function () {
    if (!this.game.player) return;
    var p = this.game.player, g = this.game;
    this.updateEffects(p);
    this.updateMap();
    var creative = g.mode === 'creative';
    document.getElementById('survivalhud').style.display = creative ? 'none' : '';

    if (!creative) {
      var hp = Math.ceil(p.health);
      for (var i = 0; i < 10; i++) {
        var v = hp - i * 2;
        this.hearts[i].className = 'icon heart ' + (v >= 2 ? 'full' : v === 1 ? 'half' : 'empty');
      }
      var fd = Math.ceil(p.food);
      for (var f = 0; f < 10; f++) {
        var fv = fd - f * 2;
        this.hungers[f].className = 'icon food ' + (fv >= 2 ? 'full' : fv === 1 ? 'half' : 'empty');
      }
      var def = p.inventory.defense();
      this.armorEl.style.display = def > 0 ? '' : 'none';
      for (var a = 0; a < 10; a++) {
        var av = def - a * 2;
        this.armors[a].className = 'icon armor ' + (av >= 2 ? 'full' : av === 1 ? 'half' : 'empty');
      }
      var showAir = p.air < p.maxAir - 0.01;
      this.airEl.style.display = showAir ? '' : 'none';
      if (showAir) {
        var bubbles = Math.ceil(p.air / p.maxAir * 10);
        for (var b = 0; b < 10; b++) this.bubbles[b].className = 'icon bubble ' + (b < bubbles ? 'full' : 'empty');
      }
      this.xpFill.style.width = Math.round(p.xp / p.xpNeeded() * 100) + '%';
      this.xpLevel.textContent = p.level > 0 ? p.level : '';
    }

    // Bildschirm-Overlays
    var ov = '';
    if (p.headInWater) ov = 'water';
    else if (p.headInLava) ov = 'lava';
    this.overlay.className = ov;
    this.overlay.style.opacity = g.damageFlash > 0 ? Math.min(0.55, g.damageFlash * 0.55) : (ov ? 1 : 0);
    if (g.damageFlash > 0) this.overlay.className = 'damage';

    this.updateDetector(p);
    this.updateCompass();
    this.updateBossBar();
  };

  // Der Puls des Detektorhelms: kurz aufleuchten und wieder abklingen. Wie hell,
  // hängt am Abstand zum Fund – ganz nah leuchtet er kräftig, am Rand der
  // Reichweite bleibt es ein Hauch.
  UI.prototype.updateDetector = function (p) {
    if (!this.detectorEl) this.detectorEl = document.getElementById('detector');
    if (!this.detectorEl) return;
    var t = p.detektorPuls || 0;
    if (t <= 0) { this.detectorEl.style.opacity = 0; return; }
    // Zwei Schwünge über die 1,6 s, damit es als Signal lesbar ist und nicht als Blende
    var welle = Math.sin((1.6 - t) / 1.6 * Math.PI * 2) * 0.5 + 0.5;
    var huelle = Math.min(1, t / 0.4);
    this.detectorEl.style.opacity = (welle * huelle * (p.detektorStaerke || 0.5)).toFixed(3);
  };

  UI.prototype.flashPickup = function (stack) {
    this.toast(I.title(stack.id) + (stack.count > 1 ? ' ×' + stack.count : ''));
  };

  UI.prototype.toast = function (text) {
    var t = el('div', 'toast', this.toastEl);
    t.textContent = text;
    setTimeout(function () { t.classList.add('fade'); }, 1400);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 2200);
    while (this.toastEl.children.length > 6) this.toastEl.removeChild(this.toastEl.firstChild);
  };

  UI.prototype.updateDebug = function () {
    var g = this.game, p = g.player, w = g.world;
    if (!this.debugVisible || !p || !w) { this.debugEl.style.display = 'none'; return; }
    this.debugEl.style.display = 'block';
    var bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    // Nether und Aether haben eigene Biome – dort steht deren Name
    var st = MC.Dim ? MC.Dim.stimmung(w, bx, bz) : null;
    var biomName = st ? st.name : MC.WorldGen.BIOME_NAME[w.gen.biomeAt(bx, bz)];
    var lines = [
      'Minecraft HTML — ' + g.fps.toFixed(0) + ' fps',
      'XYZ: ' + p.x.toFixed(2) + ' / ' + p.y.toFixed(2) + ' / ' + p.z.toFixed(2),
      'Block: ' + bx + ' ' + by + ' ' + bz + '   Chunk: ' + (bx >> 4) + ' ' + (bz >> 4),
      'Biom: ' + biomName + '   Seed: ' + w.seed,
      'Licht: Himmel ' + w.getSky(bx, by + 1, bz) + ' / Block ' + w.getBlockLight(bx, by + 1, bz),
      'Zeit: ' + MC.U.formatTime(w.time) + (w.isNight() ? ' (Nacht)' : ' (Tag)'),
      'Chunks: ' + g.renderer.stats.chunks + '/' + w.chunkList.length + '   Quads: ' + (g.renderer.stats.quads | 0),
      'Entities: ' + w.entities.length + ' (sichtbar ' + g.renderer.stats.entities + ')',
      'Modus: ' + (g.mode === 'creative' ? 'Kreativ' : 'Überleben') + '   Sichtweite: ' + g.renderer.renderDistance,
      'Ziel: ' + (g.target ? (B.byId[g.target.id].title + ' @ ' + g.target.x + ',' + g.target.y + ',' + g.target.z) : '-')
    ];
    this.debugEl.innerHTML = lines.join('<br>');
  };

  // ============================================================
  //  Bildschirme
  // ============================================================
  UI.prototype.isOpen = function () { return this.open !== null || !!this.creditsOpen; };

  UI.prototype.close = function () {
    if (this.creditsOpen) { this.hideCredits(); return; }
    if (this.cursor) {
      this.game.player.inventory.add(this.cursor);
      this.cursor = null;
    }
    // Crafting-Reste zurückgeben
    for (var i = 0; i < this.craftGrid.length; i++) {
      if (this.craftGrid[i]) { this.game.player.inventory.add(this.craftGrid[i]); this.craftGrid[i] = null; }
    }
    // Was im Zaubertisch liegt, bleibt nicht dort liegen
    if (this.enchTable) {
      if (this.enchTable.item) { this.game.player.inventory.add(this.enchTable.item); this.enchTable.item = null; }
      if (this.enchTable.lapis) { this.game.player.inventory.add(this.enchTable.lapis); this.enchTable.lapis = null; }
      this.enchTable = null;
      this.enchRows = null;
    }
    if (this.brew) {
      // Der Braustand behaelt seinen Inhalt - er ist ein Geraet, kein Tisch
      this.brew = null; this.brewProg = null; this.brewFuel = null;
    }
    if (this.anvil) {
      if (this.anvil.a) { this.game.player.inventory.add(this.anvil.a); this.anvil.a = null; }
      if (this.anvil.b) { this.game.player.inventory.add(this.anvil.b); this.anvil.b = null; }
      this.anvil.out = null; this.anvil.plan = null;
      this.anvil = null;
      this.anvilCostEl = null; this.anvilOut = null; this.anvilNameEl = null;
    }
    this.open = null;
    this.trader = null;
    this.tradeRows = null;
    this.screen.innerHTML = '';
    this.screen.style.display = 'none';
    this.updateCursorEl();
    this.updateHotbar();
    this.game.requestPointerLock();
  };

  UI.prototype.openScreen = function (type, data) {
    if (this.open) this.close();
    this.open = type;
    this.screen.style.display = 'block';
    this.screen.innerHTML = '';
    this.game.exitPointerLock();
    this.game.audio.play('open');

    if (type === 'inventory') this.buildInventory(2);
    else if (type === 'crafting') this.buildInventory(3);
    else if (type === 'furnace') this.buildFurnace(data);
    else if (type === 'enchant') this.buildEnchant(data);
    else if (type === 'anvil') this.buildAnvil(data);
    else if (type === 'brew') this.buildBrew(data);
    else if (type === 'chest') this.buildChest(data);
    else if (type === 'creative') this.buildCreative();
    else if (type === 'trade') this.buildTrade(data);
    else if (type === 'recipes') this.buildRecipes();
    else if (type === 'achievements') this.buildAchievements();
  };

  // Zwei Knöpfe, die aus jedem Inventarfenster ins Rezeptbuch und in die
  // Erfolge führen. Beide merken sich, woher man kam.
  UI.prototype.addBookButtons = function (win, zurueck) {
    var self = this;
    var reihe = el('div', 'bookrow', win);
    function knopf(sym, titel, ziel) {
      var b = el('button', 'bookbtn', reihe);
      b.type = 'button';
      b.innerHTML = '<span class="bsym">' + sym + '</span>' + titel;
      b.addEventListener('mousedown', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        self.backTo = zurueck;
        self.openScreen(ziel);
      });
    }
    knopf('📖', 'Rezepte', 'recipes');
    knopf('🏆', 'Erfolge', 'achievements');
    return reihe;
  };

  UI.prototype.backButton = function (win) {
    var self = this;
    var b = el('button', 'bookbtn back', win);
    b.type = 'button';
    b.textContent = '◀ Zurück';
    b.addEventListener('mousedown', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      var ziel = self.backTo || 'inventory';
      self.backTo = null;
      self.openScreen(ziel);
    });
    return b;
  };

  // ============================================================
  //  Rezeptbuch
  // ============================================================
  // Sammelt alles, was das Spiel herstellen kann: geformte und ungeformte
  // Rezepte plus die Ofenrezepte. Sammelbegriffe wie "#planks" zeigen ihren
  // ersten Vertreter, sonst wäre die Zelle leer.
  UI.prototype.recipeList = function () {
    if (this._recipes) return this._recipes;
    var out = [];

    function aufloesen(want) {
      if (!want) return null;
      if (want.charAt(0) !== '#') return want;
      var tag = R.TAGS[want];
      return tag && tag.length ? tag[0] : null;
    }

    R.shaped.forEach(function (r) {
      var grid = new Array(9);
      for (var y = 0; y < r.h; y++) {
        for (var x = 0; x < r.w; x++) {
          grid[y * 3 + x] = aufloesen(r.grid[y][x]);
        }
      }
      out.push({ art: 'Werkbank', grid: grid, out: r.out });
    });

    R.shapeless.forEach(function (r) {
      var grid = new Array(9);
      for (var i = 0; i < r.ing.length && i < 9; i++) grid[i] = aufloesen(r.ing[i]);
      out.push({ art: 'Ungeformt', grid: grid, out: r.out });
    });

    for (var input in R.smelting) {
      var g2 = new Array(9);
      g2[0] = input;
      out.push({ art: 'Ofen', grid: g2, out: R.smelting[input] });
    }

    // Nach Ergebnisnamen sortieren, damit das Blättern eine Ordnung hat
    out.sort(function (a, b) {
      var ta = I.title(a.out.id) || a.out.id, tb = I.title(b.out.id) || b.out.id;
      return ta < tb ? -1 : (ta > tb ? 1 : 0);
    });
    this._recipes = out;
    return out;
  };

  UI.PAGE_RECIPES = 6;

  UI.prototype.buildRecipes = function () {
    var self = this;
    this.slotList = [];
    var win = el('div', 'window book', this.screen);
    var head = el('div', 'wtitle', win);
    head.textContent = 'Rezeptbuch';
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var suche = el('input', 'search', win);
    suche.placeholder = 'Nach Ergebnis suchen …';
    suche.value = this.recipeSearch || '';
    suche.addEventListener('input', function () {
      self.recipeSearch = this.value;
      self.recipePage = 0;
      self.fillRecipes();
    });
    suche.addEventListener('mousedown', function (e) { e.stopPropagation(); });

    this.recipeBox = el('div', 'recipebox', win);

    var pager = el('div', 'pager', win);
    this.rPrev = el('button', 'pagebtn', pager); this.rPrev.textContent = '◀';
    this.rLabel = el('span', 'pagelabel', pager);
    this.rNext = el('button', 'pagebtn', pager); this.rNext.textContent = '▶';
    this.rPrev.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      self.recipePage = Math.max(0, (self.recipePage || 0) - 1); self.fillRecipes();
    });
    this.rNext.addEventListener('mousedown', function (e) {
      e.preventDefault(); e.stopPropagation();
      self.recipePage = (self.recipePage || 0) + 1; self.fillRecipes();
    });

    this.backButton(win);
    this.fillRecipes();
  };

  UI.prototype.fillRecipes = function () {
    var self = this;
    var box = this.recipeBox;
    box.innerHTML = '';
    var q = (this.recipeSearch || '').toLowerCase();
    var alle = this.recipeList().filter(function (r) {
      if (!q) return true;
      var t = (I.title(r.out.id) || r.out.id).toLowerCase();
      return t.indexOf(q) >= 0 || r.out.id.indexOf(q) >= 0;
    });

    var seiten = Math.max(1, Math.ceil(alle.length / UI.PAGE_RECIPES));
    if (this.recipePage === undefined) this.recipePage = 0;
    if (this.recipePage >= seiten) this.recipePage = seiten - 1;
    if (this.recipePage < 0) this.recipePage = 0;
    this.rLabel.textContent = 'Seite ' + (this.recipePage + 1) + ' / ' + seiten +
                              '   ·   ' + alle.length + ' Rezepte';
    this.rPrev.disabled = this.recipePage === 0;
    this.rNext.disabled = this.recipePage >= seiten - 1;

    alle.slice(this.recipePage * UI.PAGE_RECIPES, (this.recipePage + 1) * UI.PAGE_RECIPES)
      .forEach(function (r) {
        var karte = el('div', 'rcard', box);
        var kopf = el('div', 'rhead', karte);
        kopf.innerHTML = '<b>' + (I.title(r.out.id) || r.out.id) + '</b>' +
                         (r.out.count > 1 ? ' ×' + r.out.count : '') +
                         '<span class="rart">' + r.art + '</span>';
        var zeile = el('div', 'rrow', karte);
        var grid = el('div', 'rgrid', zeile);
        for (var i = 0; i < 9; i++) {
          var s = el('div', 'slot mini', grid);
          if (r.grid[i]) self.renderSlot(s, { id: r.grid[i], count: 1 });
        }
        el('div', 'rarrow', zeile).textContent = '➜';
        var res = el('div', 'slot', zeile);
        self.renderSlot(res, { id: r.out.id, count: r.out.count });
      });
  };

  // ============================================================
  //  Erfolge
  // ============================================================
  UI.prototype.buildAchievements = function () {
    var self = this, g = this.game;
    var A = MC.Achievements;
    this.slotList = [];
    var win = el('div', 'window book', this.screen);
    var head = el('div', 'wtitle', win);
    var erreicht = 0;
    A.LIST.forEach(function (e) { if (A.has(g, e[0])) erreicht++; });
    head.textContent = 'Erfolge — ' + erreicht + ' von ' + A.LIST.length;
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var baum = el('div', 'achtree', win);

    // Der Baum wird rekursiv eingerückt; die Linien links machen die
    // Abhängigkeiten sichtbar, ohne dass man Kanten zeichnen muss.
    function zweig(eltern, tiefe, behaelter) {
      A.children(eltern).forEach(function (e) {
        var offen = A.has(g, e.id);
        // Erreichbar, sobald der Vorgänger steht – sonst bleibt es verdeckt
        var frei = !e.parent || A.has(g, e.parent);
        var row = el('div', 'achrow' + (offen ? ' done' : (frei ? '' : ' locked')), behaelter);
        row.style.marginLeft = (tiefe * 26) + 'px';

        var ico = el('div', 'slot mini achico', row);
        if (offen || frei) self.renderSlot(ico, { id: e.icon, count: 1 });

        var txt = el('div', 'achtxt', row);
        var t = el('div', 'achname', txt);
        t.textContent = (offen ? '✓ ' : '') + (frei ? e.title : '???');
        var d = el('div', 'achdesc', txt);
        d.textContent = frei ? e.desc : 'Erst den vorigen Erfolg holen.';

        zweig(e.id, tiefe + 1, behaelter);
      });
    }
    zweig(null, 0, baum);

    var hinweis = el('div', 'whint', win);
    hinweis.textContent = 'Der Baum folgt dem Weg durch die vier Welten. Wer einen Erfolg ' +
                          'überspringt, bekommt die Vorgeschichte rückwirkend angerechnet.';

    this.backButton(win);
  };

  // Auffälliger als ein normaler Toast: der Erfolg soll man merken
  UI.prototype.achievementToast = function (e) {
    var t = el('div', 'toast ach', this.toastEl);
    t.innerHTML = '<span class="achtoastico" style="background-image:url(' +
                  Icons.url(e.icon) + ')"></span>' +
                  '<span><b>Erfolg</b><br>' + e.title + '</span>';
    setTimeout(function () { t.classList.add('fade'); }, 3200);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 4000);
    while (this.toastEl.children.length > 6) this.toastEl.removeChild(this.toastEl.firstChild);
  };

  UI.prototype.makeSlot = function (parent, getFn, setFn, opts) {
    var self = this;
    opts = opts || {};
    var s = el('div', 'slot' + (opts.cls ? ' ' + opts.cls : ''), parent);
    s.slotGet = getFn; s.slotSet = setFn; s.slotOpts = opts;
    s.addEventListener('mousedown', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      self.slotClick(s, ev.button, ev.shiftKey);
    });
    s.addEventListener('contextmenu', function (ev) { ev.preventDefault(); });
    this.slotList.push(s);
    return s;
  };

  UI.prototype.refreshSlots = function () {
    for (var i = 0; i < this.slotList.length; i++) {
      var s = this.slotList[i];
      this.renderSlot(s, s.slotGet());
    }
    this.updateCursorEl();
    this.updateHotbar();
    if (this.open === 'trade') this.refreshTrade();
  };

  UI.prototype.updateCursorEl = function () {
    if (!this.cursor) { this.cursorEl.style.display = 'none'; return; }
    this.cursorEl.style.display = '';
    this.cursorEl.style.left = (this.mouseX || 0) + 'px';
    this.cursorEl.style.top = (this.mouseY || 0) + 'px';
    this.cursorEl.style.backgroundImage = 'url(' + Icons.url(this.cursor.id) + ')';
    this.cursorEl.innerHTML = this.cursor.count > 1 ? '<span class="count">' + this.cursor.count + '</span>' : '';
  };

  UI.prototype.slotClick = function (slot, button, shift) {
    var opts = slot.slotOpts;
    var cur = slot.slotGet();
    this.game.audio.play('click');

    // Ergebnisslot (Crafting/Ofen): nur entnehmen
    if (opts.result) {
      if (!cur) return;
      // Der Amboss will erst bezahlt werden – ohne diese Sperre läge das
      // fertige Stück schon am Zeiger, bevor die Stufen abgezogen sind.
      if (opts.canTake && !opts.canTake()) { this.game.audio.play('nope'); return; }
      if (this.cursor && (this.cursor.id !== cur.id || this.cursor.count + cur.count > I.stackMax(cur.id) ||
                          this.cursor.ench || cur.ench)) return;
      var times = shift ? 64 : 1;
      for (var t = 0; t < times; t++) {
        var res = slot.slotGet();
        if (!res) break;
        if (shift) {
          if (this.game.player.inventory.add(I.copyStack(res)) > 0) break;
        } else {
          if (!this.cursor) this.cursor = I.copyStack(res);
          else this.cursor.count += res.count;
        }
        if (opts.onTake) opts.onTake(res);
        if (!shift) break;
      }
      this.refreshSlots();
      return;
    }

    // Shift-Klick: schnelles Verschieben
    if (shift && cur) {
      if (opts.onShift) opts.onShift(slot, cur);
      else this.quickMove(slot, cur);
      this.refreshSlots();
      return;
    }

    if (button === 0) {
      if (!this.cursor) {
        if (cur) { this.cursor = cur; slot.slotSet(null); }
      } else {
        if (opts.filter && !opts.filter(this.cursor)) { this.refreshSlots(); return; }
        if (!cur) { slot.slotSet(this.cursor); this.cursor = null; }
        else if (I.sameItem(cur, this.cursor)) {
          var max = I.stackMax(cur.id);
          var can = Math.min(max - cur.count, this.cursor.count);
          cur.count += can; this.cursor.count -= can;
          if (this.cursor.count <= 0) this.cursor = null;
        } else {
          slot.slotSet(this.cursor); this.cursor = cur;
        }
      }
    } else if (button === 2) {
      if (!this.cursor) {
        if (cur) {
          var half = Math.ceil(cur.count / 2);
          this.cursor = { id: cur.id, count: half, dur: cur.dur };
          cur.count -= half;
          if (cur.count <= 0) slot.slotSet(null);
        }
      } else {
        if (opts.filter && !opts.filter(this.cursor)) { this.refreshSlots(); return; }
        if (!cur) {
          slot.slotSet({ id: this.cursor.id, count: 1, dur: this.cursor.dur });
          this.cursor.count--;
          if (this.cursor.count <= 0) this.cursor = null;
        } else if (I.sameItem(cur, this.cursor) && cur.count < I.stackMax(cur.id)) {
          cur.count++; this.cursor.count--;
          if (this.cursor.count <= 0) this.cursor = null;
        }
      }
    }
    if (opts.onChange) opts.onChange();
    this.refreshSlots();
  };

  UI.prototype.quickMove = function (slot, stack) {
    var inv = this.game.player.inventory;
    var opts = slot.slotOpts;
    if (opts.area === 'inv') {
      // Inventar <-> Hotbar
      var from = opts.index;
      var target = from < 9 ? [9, 36] : [0, 9];
      if (this.moveInto(stack, inv, target[0], target[1])) slot.slotSet(stack.count > 0 ? stack : null);
    } else if (opts.area === 'ext') {
      if (this.moveInto(stack, inv, 0, 36)) slot.slotSet(stack.count > 0 ? stack : null);
    } else {
      if (inv.add(stack) === 0) slot.slotSet(null);
    }
  };

  UI.prototype.moveInto = function (stack, inv, from, to) {
    var max = I.stackMax(stack.id);
    var i;
    if (max > 1) {
      for (i = from; i < to; i++) {
        var s = inv.slots[i];
        if (s && s.id === stack.id && s.dur === undefined && s.count < max) {
          var can = Math.min(max - s.count, stack.count);
          s.count += can; stack.count -= can;
          if (stack.count <= 0) return true;
        }
      }
    }
    for (i = from; i < to; i++) {
      if (!inv.slots[i]) {
        inv.slots[i] = I.copyStack(stack);
        stack.count = 0;
        return true;
      }
    }
    return stack.count === 0;
  };

  // ---------- Inventar / Werkbank ----------
  UI.prototype.buildInventory = function (craftSize) {
    var self = this, inv = this.game.player.inventory;
    this.slotList = [];
    this.craftSize = craftSize;
    if (this.craftGrid.length !== craftSize * craftSize) {
      this.craftGrid = new Array(craftSize * craftSize);
      for (var q = 0; q < this.craftGrid.length; q++) this.craftGrid[q] = null;
    }

    var win = el('div', 'window', this.screen);
    var head = el('div', 'wtitle', win);
    head.textContent = craftSize === 3 ? 'Werkbank' : 'Inventar';
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var top = el('div', 'wrow', win);

    // Rüstung
    if (craftSize === 2) {
      var armorBox = el('div', 'armorbox', top);
      var labels = ['Helm', 'Brust', 'Hose', 'Schuhe'];
      for (var a = 0; a < 4; a++) {
        (function (ai) {
          var s = self.makeSlot(armorBox, function () { return inv.armor[ai]; }, function (v) { inv.armor[ai] = v; },
            { cls: 'armorslot', area: 'armor', filter: function (st) { var it = I.get(st.id); return it && it.armor && it.armor.slot === ai; } });
          s.dataset.ph = labels[ai];
        })(a);
      }
      var pv = el('div', 'preview', top);
      pv.innerHTML = '<div class="pvbody"></div>';
    }

    // Crafting
    var craftBox = el('div', 'craftbox', top);
    var grid = el('div', 'cgrid', craftBox);
    grid.style.gridTemplateColumns = 'repeat(' + craftSize + ', var(--slot))';
    for (var i = 0; i < craftSize * craftSize; i++) {
      (function (ci) {
        self.makeSlot(grid, function () { return self.craftGrid[ci]; },
          function (v) { self.craftGrid[ci] = v; self.updateCraft(); },
          { area: 'craft', onChange: function () { self.updateCraft(); } });
      })(i);
    }
    el('div', 'arrow', craftBox).textContent = '➜';
    this.resultSlot = this.makeSlot(craftBox, function () { return self.craftResult; }, function () { },
      { result: true, cls: 'resultslot', onTake: function (res) { self.consumeCraft(); } });

    el('div', 'wsep', win);

    // Hauptinventar
    var main = el('div', 'invgrid', win);
    for (var m = 9; m < 36; m++) {
      (function (mi) {
        self.makeSlot(main, function () { return inv.slots[mi]; }, function (v) { inv.slots[mi] = v; },
          { area: 'inv', index: mi });
      })(m);
    }
    var hb = el('div', 'invgrid hotbarrow', win);
    for (var hh = 0; hh < 9; hh++) {
      (function (hi) {
        self.makeSlot(hb, function () { return inv.slots[hi]; }, function (v) { inv.slots[hi] = v; },
          { area: 'inv', index: hi });
      })(hh);
    }

    this.addBookButtons(win, craftSize === 3 ? 'crafting' : 'inventory');

    var hint = el('div', 'whint', win);
    hint.textContent = 'Linksklick: nehmen/ablegen · Rechtsklick: teilen/einzeln · Shift+Klick: schnell verschieben · E schließt';

    this.updateCraft();
    this.refreshSlots();
  };

  UI.prototype.updateCraft = function () {
    this.craftResult = null;
    var m = R.match(this.craftGrid, this.craftSize);
    if (m) this.craftResult = R.carryOver(m.keep, I.newStack(m.id, m.count));
    if (this.resultSlot) this.renderSlot(this.resultSlot, this.craftResult);
  };

  UI.prototype.consumeCraft = function () {
    var gemacht = this.craftResult ? this.craftResult.id : null;
    for (var i = 0; i < this.craftGrid.length; i++) {
      var s = this.craftGrid[i];
      if (!s) continue;
      s.count--;
      if (s.count <= 0) this.craftGrid[i] = null;
    }
    this.updateCraft();
    this.game.player.addXP(1);
    if (MC.Achievements) MC.Achievements.onItem(this.game, gemacht);
  };

  // ---------- Ofen ----------
  UI.prototype.buildFurnace = function (te) {
    var self = this, inv = this.game.player.inventory;
    this.slotList = [];
    this.furnace = te;
    var win = el('div', 'window', this.screen);
    var head = el('div', 'wtitle', win); head.textContent = 'Ofen';
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var top = el('div', 'furnacebox', win);
    var col = el('div', 'fcol', top);
    this.makeSlot(col, function () { return te.input; }, function (v) { te.input = v; }, { area: 'ext' });
    var fire = el('div', 'fire', col);
    this.fireEl = el('i', '', fire);
    this.makeSlot(col, function () { return te.fuel; }, function (v) { te.fuel = v; }, { area: 'ext' });

    var mid = el('div', 'fmid', top);
    this.progEl = el('div', 'progress', mid);
    el('i', '', this.progEl);

    var right = el('div', 'fcol', top);
    this.makeSlot(right, function () { return te.output; }, function (v) { te.output = v; },
      { result: true, onTake: function () { te.output = null; } });

    el('div', 'wsep', win);
    var main = el('div', 'invgrid', win);
    for (var m = 9; m < 36; m++) {
      (function (mi) { self.makeSlot(main, function () { return inv.slots[mi]; }, function (v) { inv.slots[mi] = v; }, { area: 'inv', index: mi }); })(m);
    }
    var hb = el('div', 'invgrid hotbarrow', win);
    for (var hh = 0; hh < 9; hh++) {
      (function (hi) { self.makeSlot(hb, function () { return inv.slots[hi]; }, function (v) { inv.slots[hi] = v; }, { area: 'inv', index: hi }); })(hh);
    }
    this.refreshSlots();
  };

  // ---------- Zaubertisch ----------
  // Ein Fantasiealphabet für die Angebotszeilen: im Original steht dort die
  // "galaktische" Schrift, die niemand lesen kann und lesen soll. Der Text ist
  // aus dem Angebot abgeleitet, damit er beim Neuzeichnen stehen bleibt.
  var RUNEN = 'ᔑ ʖ ᓵ ↸ ᒷ ⎓ ⊣ ⍑ ╎ ⋮ ꖌ ꖎ ᒲ リ ○ ᑑ ᑫ ∷ ᓭ ℸ ⚍ ⍊ ∴ ̇/ ||'.split(' ');
  function runen(seed, n) {
    var r = MC.U.rng(MC.U.hashString('rune:' + seed));
    var out = [], w = 2 + ((r() * 3) | 0);
    for (var i = 0; i < n; i++) {
      if (w === 0) { out.push(' '); w = 2 + ((r() * 3) | 0); continue; }
      out.push(RUNEN[(r() * RUNEN.length) | 0]); w--;
    }
    return out.join('');
  }

  UI.prototype.buildEnchant = function (te) {
    var self = this, g = this.game, inv = g.player.inventory;
    this.slotList = [];
    this.enchTable = te;
    var win = el('div', 'window enchwin', this.screen);
    var head = el('div', 'wtitle', win); head.textContent = 'Zaubertisch';
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var top = el('div', 'enchbox', win);
    var links = el('div', 'fcol', top);
    this.makeSlot(links, function () { return te.item; },
      function (v) { te.item = v; self.refreshEnchant(); }, { area: 'ext' });
    this.makeSlot(links, function () { return te.lapis; },
      function (v) { te.lapis = v; self.refreshEnchant(); }, { area: 'ext' });
    var hinweis = el('div', 'enchhint', links);
    hinweis.textContent = 'Lapis';

    this.enchRows = el('div', 'enchrows', top);

    el('div', 'wsep', win);
    var main = el('div', 'invgrid', win);
    for (var m = 9; m < 36; m++) {
      (function (mi) { self.makeSlot(main, function () { return inv.slots[mi]; }, function (v) { inv.slots[mi] = v; }, { area: 'inv', index: mi }); })(m);
    }
    var hb = el('div', 'invgrid hotbarrow', win);
    for (var hh = 0; hh < 9; hh++) {
      (function (hi) { self.makeSlot(hb, function () { return inv.slots[hi]; }, function (v) { inv.slots[hi] = v; }, { area: 'inv', index: hi }); })(hh);
    }
    this.refreshEnchant();
    this.refreshSlots();
  };

  UI.prototype.refreshEnchant = function () {
    var self = this, g = this.game, te = this.enchTable, E = MC.Ench;
    if (!te || !this.enchRows) return;
    this.enchRows.innerHTML = '';
    var kreativ = g.mode === 'creative';
    var kopf = el('div', 'enchshelves', this.enchRows);
    kopf.textContent = te.regale + ' Bücherregal' + (te.regale === 1 ? '' : 'e');

    if (!te.item || !E.verzauberbar(te.item)) {
      var leer = el('div', 'enchempty', this.enchRows);
      leer.textContent = te.item ? 'Darauf wirkt keine Verzauberung.'
                                 : 'Werkzeug, Rüstung, Bogen oder Buch einlegen.';
      return;
    }

    var angebote = E.angebote(te.item, te.regale, te.saat);
    angebote.forEach(function (a, i) {
      var leerAngebot = !Object.keys(a.ench).length;
      var lapisDa = kreativ || (te.lapis && te.lapis.id === 'lapis' && te.lapis.count >= a.lapis);
      var stufeDa = kreativ || g.player.level >= a.stufe;
      var ok = lapisDa && stufeDa && !leerAngebot;
      var row = el('div', 'enchrow' + (ok ? '' : ' aus'), self.enchRows);
      el('div', 'enchnum', row).textContent = a.lapis;
      var txt = el('div', 'enchtext', row);
      el('div', 'enchrunes', txt).textContent = runen(te.saat + ':' + i, 16);
      // Wie im Original wird eine der Verzauberungen schon vorab verraten
      var keys = Object.keys(a.ench);
      var tipp = keys.length ? E.get(keys[0]).titel +
            (E.get(keys[0]).max > 1 ? ' ' + E.roemisch(a.ench[keys[0]]) : '') +
            (keys.length > 1 ? ' …' : '') : 'nichts Passendes';
      el('div', 'enchtip', txt).textContent = tipp;
      var kosten = el('div', 'enchcost', row);
      kosten.textContent = a.stufe;
      kosten.title = 'Stufe ' + a.stufe + ' nötig · kostet ' + a.lapis + ' Stufen und ' + a.lapis + ' Lapis';
      if (!ok) return;
      row.addEventListener('mousedown', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        self.verzaubern(a);
      });
    });
  };

  UI.prototype.verzaubern = function (angebot) {
    var g = this.game, te = this.enchTable, E = MC.Ench;
    if (!te.item) return;
    if (g.mode !== 'creative') {
      if (g.player.level < angebot.stufe) return;
      if (!te.lapis || te.lapis.id !== 'lapis' || te.lapis.count < angebot.lapis) return;
      // Bezahlt werden nur so viele Stufen wie Lapis – die angezeigte Stufe ist
      // bloß die Voraussetzung. Genau wie im Original.
      g.player.level -= angebot.lapis;
      g.player.xp = 0;
      te.lapis.count -= angebot.lapis;
      if (te.lapis.count <= 0) te.lapis = null;
    }
    E.anwenden(te.item, angebot.ench);
    te.saat = (te.saat * 1103515245 + 12345) >>> 0;   // neues Angebot
    g.audio.play('level');
    g.particles.crit(g.player.x, g.player.y + 1, g.player.z);
    if (MC.Achievements) MC.Achievements.onItem(g, 'enchanted');
    this.refreshEnchant();
    this.refreshSlots();
    this.game.ui.updateHUD();
  };

  // ---------- Braustand ----------
  UI.prototype.buildBrew = function (te) {
    var self = this, inv = this.game.player.inventory;
    this.slotList = [];
    this.brew = te;
    var win = el('div', 'window', this.screen);
    var head = el('div', 'wtitle', win); head.textContent = 'Braustand';
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var box = el('div', 'brewbox', win);
    var oben = el('div', 'fcol', box);
    this.makeSlot(oben, function () { return te.zutat; }, function (v) { te.zutat = v; }, { area: 'ext' });
    el('div', 'enchhint', oben).textContent = 'Zutat';
    this.brewProg = el('div', 'progress tall', box);
    el('i', '', this.brewProg);
    var glaeser = el('div', 'brewglass', box);
    for (var b = 0; b < 3; b++) {
      (function (bi) {
        self.makeSlot(glaeser, function () { return te.glas[bi]; }, function (v) { te.glas[bi] = v; }, { area: 'ext' });
      })(b);
    }
    var brenn = el('div', 'fcol', box);
    this.makeSlot(brenn, function () { return te.fuel; }, function (v) { te.fuel = v; }, { area: 'ext' });
    this.brewFuel = el('div', 'enchhint', brenn);

    el('div', 'wsep', win);
    var main = el('div', 'invgrid', win);
    for (var m = 9; m < 36; m++) {
      (function (mi) { self.makeSlot(main, function () { return inv.slots[mi]; }, function (v) { inv.slots[mi] = v; }, { area: 'inv', index: mi }); })(m);
    }
    var hb = el('div', 'invgrid hotbarrow', win);
    for (var hh = 0; hh < 9; hh++) {
      (function (hi) { self.makeSlot(hb, function () { return inv.slots[hi]; }, function (v) { inv.slots[hi] = v; }, { area: 'inv', index: hi }); })(hh);
    }
    this.refreshBrewUI();
    this.refreshSlots();
  };

  UI.prototype.refreshBrewUI = function () {
    var te = this.brew;
    if (!te || !this.brewProg) return;
    var f = Math.min(1, te.fortschritt / MC.Effekte.BRAUZEIT);
    this.brewProg.firstChild.style.height = Math.round(f * 100) + '%';
    this.brewFuel.textContent = te.brennstoff > 0 ? te.brennstoff + '×' : 'Lohenstaub';
  };

  // ---------- Amboss ----------
  UI.prototype.buildAnvil = function (te) {
    var self = this, g = this.game, inv = g.player.inventory;
    this.slotList = [];
    this.anvil = te;
    var win = el('div', 'window', this.screen);
    var head = el('div', 'wtitle', win); head.textContent = 'Amboss';
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var name = el('input', 'anvilname', win);
    name.type = 'text'; name.maxLength = 32; name.placeholder = 'Name';
    name.addEventListener('input', function () { te.name = name.value; self.refreshAnvil(); });
    name.addEventListener('keydown', function (e) { e.stopPropagation(); });
    this.anvilNameEl = name;

    var box = el('div', 'furnacebox', win);
    this.makeSlot(box, function () { return te.a; },
      function (v) { te.a = v; self.anvilNameSync(); self.refreshAnvil(); }, { area: 'ext' });
    el('div', 'anvilplus', box).textContent = '+';
    this.makeSlot(box, function () { return te.b; },
      function (v) { te.b = v; self.refreshAnvil(); }, { area: 'ext' });
    this.anvilCostEl = el('div', 'anvilcost', box);
    this.anvilOut = this.makeSlot(box, function () { return te.out; }, function () { },
      { result: true,
        canTake: function () {
          return g.mode === 'creative' || (te.plan && g.player.level >= te.plan.kosten);
        },
        onTake: function () { self.anvilNehmen(); } });

    el('div', 'wsep', win);
    var main = el('div', 'invgrid', win);
    for (var m = 9; m < 36; m++) {
      (function (mi) { self.makeSlot(main, function () { return inv.slots[mi]; }, function (v) { inv.slots[mi] = v; }, { area: 'inv', index: mi }); })(m);
    }
    var hb = el('div', 'invgrid hotbarrow', win);
    for (var hh = 0; hh < 9; hh++) {
      (function (hi) { self.makeSlot(hb, function () { return inv.slots[hi]; }, function (v) { inv.slots[hi] = v; }, { area: 'inv', index: hi }); })(hh);
    }
    this.anvilNameSync();
    this.refreshAnvil();
    this.refreshSlots();
  };

  // Das Namensfeld zeigt den aktuellen Namen des linken Stücks, solange
  // niemand hineingeschrieben hat – sonst müsste man ihn abtippen.
  UI.prototype.anvilNameSync = function () {
    var te = this.anvil;
    if (!te || !this.anvilNameEl) return;
    te.name = te.a ? MC.Ench.anzeigeName(te.a) : '';
    this.anvilNameEl.value = te.name;
  };

  UI.prototype.refreshAnvil = function () {
    var te = this.anvil, g = this.game;
    if (!te) return;
    var r = MC.Ench.amboss(te.a, te.b, te.name);
    te.out = (r && !(r.zuTeuer && g.mode !== 'creative')) ? r.out : null;
    te.plan = r;
    if (this.anvilCostEl) {
      if (!r) this.anvilCostEl.textContent = '';
      else if (r.zuTeuer && g.mode !== 'creative') {
        this.anvilCostEl.innerHTML = '<span class="teuer">Zu teuer!</span>';
      } else {
        var reicht = g.mode === 'creative' || g.player.level >= r.kosten;
        this.anvilCostEl.innerHTML = '<span class="' + (reicht ? '' : 'teuer') + '">' +
          r.kosten + ' Stufe' + (r.kosten === 1 ? '' : 'n') + '</span>';
      }
    }
    if (this.anvilOut) this.renderSlot(this.anvilOut, te.out);
  };

  UI.prototype.anvilNehmen = function () {
    var te = this.anvil, g = this.game, r = te.plan;
    if (!r || !te.out) return;
    if (g.mode !== 'creative') {
      if (g.player.level < r.kosten) return;
      g.player.level -= r.kosten;
      g.player.xp = 0;
    }
    te.a = null;
    if (te.b) {
      te.b.count -= r.verbraucht;
      if (te.b.count <= 0) te.b = null;
    }
    te.out = null; te.plan = null;
    g.audio.play('level');
    // Der Amboss nimmt beim Arbeiten Schaden – zwölf Prozent je Vorgang
    if (g.mode !== 'creative' && te.pos && Math.random() < 0.12) g.amboss(te.pos);
    this.anvilNameSync();
    this.refreshAnvil();
    this.refreshSlots();
    this.updateHUD();
  };

  // ---------- Truhe ----------
  UI.prototype.buildChest = function (te) {
    var self = this, inv = this.game.player.inventory;
    this.slotList = [];
    this.chest = te;
    var win = el('div', 'window', this.screen);
    var head = el('div', 'wtitle', win); head.textContent = 'Truhe';
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var grid = el('div', 'invgrid', win);
    for (var i = 0; i < 27; i++) {
      (function (ci) {
        self.makeSlot(grid, function () { return te.items[ci]; }, function (v) { te.items[ci] = v; }, { area: 'ext' });
      })(i);
    }
    el('div', 'wsep', win);
    var main = el('div', 'invgrid', win);
    for (var m = 9; m < 36; m++) {
      (function (mi) {
        self.makeSlot(main, function () { return inv.slots[mi]; }, function (v) { inv.slots[mi] = v; },
          { area: 'inv', index: mi, onShift: function (slot, st) { if (self.moveIntoChest(st, te)) slot.slotSet(st.count > 0 ? st : null); } });
      })(m);
    }
    var hb = el('div', 'invgrid hotbarrow', win);
    for (var hh = 0; hh < 9; hh++) {
      (function (hi) {
        self.makeSlot(hb, function () { return inv.slots[hi]; }, function (v) { inv.slots[hi] = v; },
          { area: 'inv', index: hi, onShift: function (slot, st) { if (self.moveIntoChest(st, te)) slot.slotSet(st.count > 0 ? st : null); } });
      })(hh);
    }
    this.refreshSlots();
  };

  UI.prototype.moveIntoChest = function (stack, te) {
    var max = I.stackMax(stack.id), i;
    for (i = 0; i < 27; i++) {
      var s = te.items[i];
      if (s && s.id === stack.id && s.dur === undefined && s.count < max) {
        var can = Math.min(max - s.count, stack.count);
        s.count += can; stack.count -= can;
        if (stack.count <= 0) return true;
      }
    }
    for (i = 0; i < 27; i++) {
      if (!te.items[i]) { te.items[i] = I.copyStack(stack); stack.count = 0; return true; }
    }
    return stack.count === 0;
  };

  // ---------- Handel ----------
  UI.prototype.buildTrade = function (villager) {
    var self = this, inv = this.game.player.inventory;
    this.slotList = [];
    this.trader = villager;

    var win = el('div', 'window trade', this.screen);
    var head = el('div', 'wtitle', win);
    head.textContent = 'Handel — ' + (villager.professionTitle || 'Dorfbewohner');
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var list = el('div', 'tradelist', win);
    this.tradeRows = [];
    (villager.offers || []).forEach(function (offer, idx) {
      var row = el('div', 'traderow', list);
      var give = el('div', 'tside', row);
      offer.give.forEach(function (g) {
        var s = el('div', 'slot', give);
        self.renderSlot(s, { id: g[0], count: g[1] });
      });
      el('div', 'tarrow', row).textContent = '➜';
      var got = el('div', 'tside', row);
      var gs = el('div', 'slot', got);
      self.renderSlot(gs, { id: offer.get[0], count: offer.get[1], ench: offer.ench });
      var btn = el('button', 'tbtn', row);
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault(); e.stopPropagation();
        self.doTrade(idx);
      });
      self.tradeRows.push({ row: row, btn: btn, offer: offer });
    });

    if (!this.tradeRows.length) {
      el('div', 'whint', win).textContent = 'Dieser Bewohner hat gerade nichts anzubieten.';
    }

    el('div', 'wsep', win);
    var main = el('div', 'invgrid', win);
    for (var m = 9; m < 36; m++) {
      (function (mi) {
        self.makeSlot(main, function () { return inv.slots[mi]; }, function (v) { inv.slots[mi] = v; },
          { area: 'inv', index: mi });
      })(m);
    }
    var hb = el('div', 'invgrid hotbarrow', win);
    for (var hh = 0; hh < 9; hh++) {
      (function (hi) {
        self.makeSlot(hb, function () { return inv.slots[hi]; }, function (v) { inv.slots[hi] = v; },
          { area: 'inv', index: hi });
      })(hh);
    }

    el('div', 'whint', win).textContent = 'Smaragde findest du in Smaragderz — oder du verkaufst dem Dorf, was es braucht.';
    this.refreshTrade();
    this.refreshSlots();
  };

  UI.prototype.canAfford = function (offer) {
    var inv = this.game.player.inventory;
    if (offer.uses >= offer.max) return false;
    // Ein Angebot kann dieselbe Zutat zweimal listen
    var need = {};
    for (var i = 0; i < offer.give.length; i++) need[offer.give[i][0]] = (need[offer.give[i][0]] || 0) + offer.give[i][1];
    for (var id in need) if (inv.count(id) < need[id]) return false;
    return true;
  };

  UI.prototype.refreshTrade = function () {
    if (!this.tradeRows) return;
    for (var i = 0; i < this.tradeRows.length; i++) {
      var r = this.tradeRows[i];
      var out = r.offer.uses >= r.offer.max;
      var ok = this.canAfford(r.offer);
      r.btn.disabled = !ok;
      r.btn.textContent = out ? 'Ausverkauft' : 'Tauschen';
      r.row.classList.toggle('soldout', out);
    }
  };

  UI.prototype.doTrade = function (idx) {
    var g = this.game, inv = g.player.inventory;
    var offer = this.tradeRows[idx].offer;
    if (!this.canAfford(offer)) { g.audio.play('nope'); return; }
    for (var i = 0; i < offer.give.length; i++) inv.remove(offer.give[i][0], offer.give[i][1]);
    var ware = I.newStack(offer.get[0], offer.get[1]);
    if (offer.ench) { ware.ench = {}; for (var k in offer.ench) ware.ench[k] = offer.ench[k]; }
    var rest = inv.add(ware);
    if (rest > 0) g.throwStack(I.newStack(offer.get[0], rest));
    offer.uses++;
    if (this.trader && this.trader.handelNotieren) this.trader.handelNotieren(idx);
    if (this.trader) g.particles.noten(this.trader.x, this.trader.y + 2.1, this.trader.z, 5);
    g.player.addXP(2);
    MC.Achievements.grant(g, 'dorf');
    g.audio.play('trade');
    this.refreshTrade();
    this.refreshSlots();
  };

  // ---------- Kreativ-Palette ----------
  UI.prototype.buildCreative = function () {
    var self = this, inv = this.game.player.inventory;
    // Der Reiterwechsel ruft diese Funktion erneut auf. Ohne das Leeren hing das
    // neue Fenster einfach unter dem alten.
    this.screen.innerHTML = '';
    this.slotList = [];
    var win = el('div', 'window creative', this.screen);
    var head = el('div', 'wtitle', win); head.textContent = 'Kreativmodus — Gegenstände';
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var tabs = el('div', 'tabs', win);
    var groups = [['bau', 'Baublöcke'], ['natur', 'Natur'], ['werkzeug', 'Werkzeug'],
                  ['redstone', 'Redstone'], ['material', 'Material'],
                  ['nahrung', 'Nahrung'], ['ruestung', 'Rüstung'], ['eier', 'Spawn-Eier']];
    groups.forEach(function (g) {
      var t = el('div', 'tab' + (self.creativeTab === g[0] ? ' active' : ''), tabs);
      t.textContent = g[1];
      t.addEventListener('mousedown', function (e) {
        e.stopPropagation();
        self.creativeTab = g[0];
        self.creativePage = 0;
        self.buildCreative();
      });
    });
    var search = el('input', 'search', win);
    search.placeholder = 'Suchen…';
    search.value = this.creativeSearch;
    search.addEventListener('input', function () { self.creativeSearch = this.value; self.creativePage = 0; self.fillCreative(); });
    search.addEventListener('mousedown', function (e) { e.stopPropagation(); });
    this.searchEl = search;

    this.creativeGrid = el('div', 'invgrid creativegrid', win);

    // Seitenblättern statt endlosem Scrollen
    var pager = el('div', 'pager', win);
    this.pagePrev = el('button', 'pagebtn', pager);
    this.pagePrev.textContent = '◀';
    this.pageLabel = el('span', 'pagelabel', pager);
    this.pageNext = el('button', 'pagebtn', pager);
    this.pageNext.textContent = '▶';
    this.pagePrev.addEventListener('mousedown', function (e) {
      e.stopPropagation(); e.preventDefault();
      self.creativePage = Math.max(0, (self.creativePage || 0) - 1); self.fillCreative();
    });
    this.pageNext.addEventListener('mousedown', function (e) {
      e.stopPropagation(); e.preventDefault();
      self.creativePage = (self.creativePage || 0) + 1; self.fillCreative();
    });

    el('div', 'wsep', win);
    var hb = el('div', 'invgrid hotbarrow', win);
    for (var hh = 0; hh < 9; hh++) {
      (function (hi) {
        self.makeSlot(hb, function () { return inv.slots[hi]; }, function (v) { inv.slots[hi] = v; }, { area: 'inv', index: hi });
      })(hh);
    }
    this.addBookButtons(win, 'creative');
    this.fillCreative();
    this.refreshSlots();
  };

  UI.PAGE_SIZE = 45;   // 9 x 5

  UI.prototype.fillCreative = function () {
    var self = this;
    var grid = this.creativeGrid;
    grid.innerHTML = '';
    this.slotList = this.slotList.filter(function (s) { return s.parentNode !== grid; });
    var q = this.creativeSearch.toLowerCase();

    var matches = I.list.filter(function (it) {
      if (it.group !== self.creativeTab) return false;
      if (q && it.title.toLowerCase().indexOf(q) < 0 && it.name.indexOf(q) < 0) return false;
      return true;
    });
    var pages = Math.max(1, Math.ceil(matches.length / UI.PAGE_SIZE));
    if (this.creativePage === undefined) this.creativePage = 0;
    if (this.creativePage >= pages) this.creativePage = pages - 1;
    if (this.creativePage < 0) this.creativePage = 0;
    if (this.pageLabel) this.pageLabel.textContent = 'Seite ' + (this.creativePage + 1) + ' / ' + pages;
    if (this.pagePrev) this.pagePrev.disabled = this.creativePage === 0;
    if (this.pageNext) this.pageNext.disabled = this.creativePage >= pages - 1;

    matches.slice(this.creativePage * UI.PAGE_SIZE, (this.creativePage + 1) * UI.PAGE_SIZE).forEach(function (it) {
      var s = el('div', 'slot', grid);
      self.renderSlot(s, { id: it.name, count: 1 });
      s.addEventListener('mousedown', function (ev) {
        ev.preventDefault(); ev.stopPropagation();
        if (ev.button === 2) { self.cursor = null; self.updateCursorEl(); return; }
        self.cursor = I.newStack(it.name, ev.shiftKey ? I.stackMax(it.name) : 1);
        self.updateCursorEl();
      });
      s.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  };

  // ---------- Tod / Menü ----------
  UI.prototype.showDeath = function () {
    this.deathEl.style.display = 'flex';
    this.game.exitPointerLock();
  };
  UI.prototype.hideDeath = function () {
    this.deathEl.style.display = 'none';
  };

})();
