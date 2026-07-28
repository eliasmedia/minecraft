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

    this.buildHudIcons();
    this.updateHotbar();
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
      this.itemNameEl.textContent = it ? it.title : st.id;
      this.itemNameEl.classList.add('show');
      clearTimeout(this._nameTimer);
      var self = this;
      this._nameTimer = setTimeout(function () { self.itemNameEl.classList.remove('show'); }, 1800);
    } else {
      this.itemNameEl.classList.remove('show');
    }
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
    dom.innerHTML = html;
    dom.title = it ? it.title : stack.id;
  };

  UI.prototype.updateHUD = function () {
    if (!this.game.player) return;
    var p = this.game.player, g = this.game;
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
    var biome = w.gen.biomeAt(bx, bz);
    var lines = [
      'Minecraft HTML — ' + g.fps.toFixed(0) + ' fps',
      'XYZ: ' + p.x.toFixed(2) + ' / ' + p.y.toFixed(2) + ' / ' + p.z.toFixed(2),
      'Block: ' + bx + ' ' + by + ' ' + bz + '   Chunk: ' + (bx >> 4) + ' ' + (bz >> 4),
      'Biom: ' + MC.WorldGen.BIOME_NAME[biome] + '   Seed: ' + w.seed,
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
  UI.prototype.isOpen = function () { return this.open !== null; };

  UI.prototype.close = function () {
    if (this.cursor) {
      this.game.player.inventory.add(this.cursor);
      this.cursor = null;
    }
    // Crafting-Reste zurückgeben
    for (var i = 0; i < this.craftGrid.length; i++) {
      if (this.craftGrid[i]) { this.game.player.inventory.add(this.craftGrid[i]); this.craftGrid[i] = null; }
    }
    this.open = null;
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
    else if (type === 'chest') this.buildChest(data);
    else if (type === 'creative') this.buildCreative();
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
      if (this.cursor && (this.cursor.id !== cur.id || this.cursor.count + cur.count > I.stackMax(cur.id))) return;
      var times = shift ? 64 : 1;
      for (var t = 0; t < times; t++) {
        var res = slot.slotGet();
        if (!res) break;
        if (shift) {
          if (this.game.player.inventory.add({ id: res.id, count: res.count, dur: res.dur }) > 0) break;
        } else {
          if (!this.cursor) this.cursor = { id: res.id, count: res.count, dur: res.dur };
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
        inv.slots[i] = { id: stack.id, count: stack.count, dur: stack.dur };
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

    var hint = el('div', 'whint', win);
    hint.textContent = 'Linksklick: nehmen/ablegen · Rechtsklick: teilen/einzeln · Shift+Klick: schnell verschieben · E schließt';

    this.updateCraft();
    this.refreshSlots();
  };

  UI.prototype.updateCraft = function () {
    this.craftResult = null;
    var m = R.match(this.craftGrid, this.craftSize);
    if (m) this.craftResult = I.newStack(m.id, m.count);
    if (this.resultSlot) this.renderSlot(this.resultSlot, this.craftResult);
  };

  UI.prototype.consumeCraft = function () {
    for (var i = 0; i < this.craftGrid.length; i++) {
      var s = this.craftGrid[i];
      if (!s) continue;
      s.count--;
      if (s.count <= 0) this.craftGrid[i] = null;
    }
    this.updateCraft();
    this.game.player.addXP(1);
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
      if (!te.items[i]) { te.items[i] = { id: stack.id, count: stack.count, dur: stack.dur }; stack.count = 0; return true; }
    }
    return stack.count === 0;
  };

  // ---------- Kreativ-Palette ----------
  UI.prototype.buildCreative = function () {
    var self = this, inv = this.game.player.inventory;
    this.slotList = [];
    var win = el('div', 'window creative', this.screen);
    var head = el('div', 'wtitle', win); head.textContent = 'Kreativmodus — Gegenstände';
    var close = el('div', 'wclose', head); close.textContent = '✕';
    close.addEventListener('mousedown', function (e) { e.stopPropagation(); self.close(); });

    var tabs = el('div', 'tabs', win);
    var groups = [['bau', 'Baublöcke'], ['natur', 'Natur'], ['werkzeug', 'Werkzeug'], ['material', 'Material'],
                  ['nahrung', 'Nahrung'], ['ruestung', 'Rüstung']];
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
