/* ============================================================
   main.js  -  Spielsteuerung, Chunk-Streaming, Interaktion, Speichern
   ============================================================ */
(function () {
  'use strict';

  var B = MC.Blocks, I = MC.Items, U = MC.U, R = MC.Recipes;
  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT;
  var SAVE_KEY = 'minecraft_html_world_v1';

  // ============================================================
  //  Eingabe
  // ============================================================
  function Input(canvas, game) {
    var self = this;
    this.keys = {};
    this.mouse = [false, false, false];
    this.dx = 0; this.dy = 0;
    this.wheel = 0;
    this.locked = false;
    this.game = game;
    this.lastSpace = 0;
    this.sprintToggle = false;

    window.addEventListener('keydown', function (e) {
      if (e.code === 'F3' || e.code === 'Tab') e.preventDefault();
      // Die Leertaste scrollt sonst die Seite oder drückt einen Knopf, der noch
      // den Fokus hat – der Sprung geht dann verloren. Dasselbe gilt für die
      // Pfeiltasten. Nur solange gespielt wird, damit Eingabefelder frei bleiben.
      if (self.locked && (e.code === 'Space' || e.code.indexOf('Arrow') === 0)) e.preventDefault();
      if (self.keys[e.code]) return;
      self.keys[e.code] = true;
      // Doppeltipp auf W schaltet den Sprint ein – hält bis W losgelassen wird
      if (e.code === 'KeyW') {
        var now = performance.now();
        if (now - (self.lastForward || 0) < 320) self.sprintToggle = true;
        self.lastForward = now;
      }
      game.onKeyDown(e);
    });
    window.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
      if (e.code === 'KeyW') self.sprintToggle = false;
    });
    window.addEventListener('blur', function () {
      self.keys = {}; self.mouse = [false, false, false]; self.sprintToggle = false;
    });

    canvas.addEventListener('mousedown', function (e) {
      if (e.button === 1) e.preventDefault();   // sonst startet der Autoscroll
      if (!self.locked) {
        game.showClickHint(false);
        game._lastUnlock = 0;
        game.requestPointerLock();
        return;
      }
      self.mouse[e.button] = true;
      game.onMouseDown(e.button);
    });
    window.addEventListener('mouseup', function (e) {
      self.mouse[e.button] = false;
      game.onMouseUp(e.button);
    });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('wheel', function (e) {
      if (game.ui.isOpen()) return;
      self.wheel += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('pointerlockchange', function () {
      self.locked = (document.pointerLockElement === canvas);
      if (self.locked) { self.lockedAt = performance.now(); game.showClickHint(false); return; }
      game._lastUnlock = performance.now();
      if (game.ui.isOpen() || game.paused || !game.started || !game.player || game.player.dead) return;
      // Haben wir selbst gerade entsperrt (Fenster geöffnet/geschlossen)? Dann nicht pausieren.
      if (performance.now() < (game.suppressPauseUntil || 0)) { game.showClickHint(true); return; }
      game.pause(true);
    });
    document.addEventListener('pointerlockerror', function () {
      if (game.started && !game.paused && !game.ui.isOpen()) game.showClickHint(true);
    });
    // Der Zeiger springt gelegentlich: der Browser liefert dann für ein einzelnes
    // Bild einen absurd großen Ausschlag, und man schaut plötzlich nach hinten.
    // Solche Werte sind keine Bewegung, die jemand mit der Hand macht – sie werden
    // verworfen. Dieselbe Sperre gilt kurz nach dem Zurückholen des Zeigers, wo
    // der erste Ausschlag die Strecke seit dem Freigeben nachträgt.
    var SPRUNG_MAX = 260;
    document.addEventListener('mousemove', function (e) {
      if (!self.locked) return;
      var mx = e.movementX || 0, my = e.movementY || 0;
      if (performance.now() < (self.lockedAt || 0) + 120) return;
      if (Math.abs(mx) > SPRUNG_MAX || Math.abs(my) > SPRUNG_MAX) { self.verworfen = (self.verworfen || 0) + 1; return; }
      self.dx += mx;
      self.dy += my;
    });
  }
  Input.prototype.key = function (c) { return !!this.keys[c]; };

  // ============================================================
  //  Spiel
  // ============================================================
  function Game() {
    this.canvas = document.getElementById('gl');
    this.mode = 'survival';
    this.difficulty = 'normal';
    this.paused = false;
    this.started = false;
    this.time = 0;
    this.tickCount = 0;
    this.fps = 0;
    this.damageFlash = 0;
    this.camShake = 0;
    this.camBob = 0;
    this.target = null;
    this.mining = null;
    this.sensitivity = 0.0022;
    this.autoSaveTimer = 0;
    this.bowCharge = 0;
  }
  MC.Game = Game;

  Game.prototype.init = function () {
    var self = this;
    this.renderer = new MC.Renderer(this.canvas);
    this.audio = new MC.Audio();
    this.ui = new MC.UI(this);
    this.ui.init();
    this.input = new Input(this.canvas, this);
    // Eier ohne Kreatur wären ein toter Eintrag im Kreativmenü
    if (I.pruefeEier) {
      var ohne = I.pruefeEier();
      if (ohne.length) console.warn('Spawn-Ei ohne Kreatur:', ohne.join(', '));
    }
    this.buildMenu();
    window.addEventListener('resize', function () { self.renderer.resize(); });
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  };

  // ---------- Welt starten ----------
  Game.prototype.newWorld = function (seedStr, mode, settings) {
    var self = this;
    this.stopPanorama();
    var seed = seedStr ? (/^\d+$/.test(seedStr) ? (parseInt(seedStr, 10) >>> 0) : U.hashString(seedStr)) : (Math.random() * 4294967295) >>> 0;
    this.mode = mode || 'survival';
    this.seed = seed;
    this.worldSettings = MC.normalizeWorldOpts(settings);
    this.worlds = {};
    // Die gespeicherten Chunkänderungen des vorherigen Spielstands müssen weg,
    // sonst erbt die neue Welt jeden Block, den man in der alten gesetzt hat.
    this.savedDims = null;
    this.endState = { dragonDead: false };
    this.achievements = {};
    this.dim = 'overworld';
    this.world = this.dimWorld('overworld');
    this.particles = new MC.Particles(this.world);

    var sp = this.world.gen.findSpawn();
    this.player = new MC.Player(this.world, sp.x, sp.y, sp.z);
    this.player.spawnPoint = { x: sp.x, y: sp.y, z: sp.z };
    if (this.mode === 'creative' || this.mode === 'spectator') this.player.flying = true;

    this.ensureChunksAround(this.player.x, this.player.z, 2);
    this.settleSpawn();
    this.started = true;
    this.paused = false;
    this.ui.hideDeath();
    this.hideMenu();
    this.audio.init();
    this.requestPointerLock();
    this.ui.updateHotbar();
    this.ui.toast('Welt erzeugt — Seed ' + seed);
  };

  Game.prototype.settleSpawn = function () {
    var p = this.player;
    for (var y = WH - 2; y > 1; y--) {
      if (this.world.getBlock(Math.floor(p.x), y, Math.floor(p.z)) !== 0) { p.y = y + 1.05; break; }
    }
    p.spawnPoint = { x: p.x, y: p.y, z: p.z };
  };

  Game.prototype.attachWorldHooks = function (w) {
    var self = this;
    w = w || this.world;
    w.onChunkUnload = function (c) { if (c.world === self.world) self.renderer.dropChunk(c); };
    w.onBlockBreak = function (x, y, z, id, meta, tool) { self.dropBlock(x, y, z, id, meta, tool); };
    // Beim Fluten eines Höhlensystems verwandeln sich in einem Tick hunderte
    // Lavablöcke auf einmal. Vorher war der Klang weder ortsgebunden noch
    // begrenzt – man hörte das Zischen minutenlang aus der ganzen Welt.
    w.onFizz = function (x, y, z) {
      var jetzt = self.tickCount || 0;
      if (jetzt !== self._fizzTick) { self._fizzTick = jetzt; self._fizzN = 0; }
      if (self._fizzN >= 3) return;
      self._fizzN++;
      var p = self.player;
      if (p) {
        var dx = x - p.x, dy = y - p.y, dz = z - p.z;
        if (dx * dx + dy * dy + dz * dz > 26 * 26) return;
      }
      self.audio.play3d('fizz', x + 0.5, y + 0.5, z + 0.5, p);
      self.particles.smoke(x, y + 1, z, 8);
    };
  };

  // ---------- Dimensionen ----------
  // Jede Dimension ist eine eigene Welt mit demselben Seed. Sie bleiben im
  // Speicher liegen, damit man beim Zurückkehren dieselbe Landschaft vorfindet.
  Game.prototype.dimWorld = function (dim) {
    if (this.worlds[dim]) return this.worlds[dim];
    var w = new MC.World(this.seed, { settings: this.worldSettings, dim: dim });
    w.entities = [];
    if (this.savedDims && this.savedDims[dim]) {
      w.savedChunks = this.savedDims[dim].chunks || {};
      w.tileEntities = this.savedDims[dim].tileEntities || {};
      if (this.savedDims[dim].time !== undefined) w.time = this.savedDims[dim].time;
    }
    this.attachWorldHooks(w);
    this.worlds[dim] = w;
    return w;
  };

  // Wechselt die Dimension und setzt den Spieler an die Zielstelle
  Game.prototype.travelTo = function (dim, pos) {
    if (dim === this.dim) return;
    var p = this.player;
    // alte Welt behalten, nur Meshes freigeben
    var keys = Object.keys(this.renderer.chunkMeshes);
    for (var i = 0; i < keys.length; i++) {
      var kp = keys[i].split(',');
      this.renderer.dropChunk({ cx: +kp[0], cz: +kp[1] });
    }
    this.dim = dim;
    this.world = this.dimWorld(dim);
    // Die Chunks der Zielwelt waren beim Verlassen fertig gemesht und damit
    // nicht mehr "dirty". Ohne dieses Zurücksetzen baut buildMeshes gar nichts
    // neu auf und man steht in einer leeren Welt, bis man einen Block setzt.
    for (var c = 0; c < this.world.chunkList.length; c++) this.world.chunkList[c].dirty = true;
    this.particles = new MC.Particles(this.world);
    p.world = this.world;
    p.x = pos.x; p.y = pos.y; p.z = pos.z;
    p.vx = p.vy = p.vz = 0;
    p.fallStart = null;
    p.portalCd = 2.2;
    this.ensureChunksAround(p.x, p.z, 2);
    this.ui.toast('Du betrittst: ' + MC.Dim.TITLE[dim]);
    this.audio.play('levelup');
    MC.Achievements.onDim(this, dim);
  };

  // Ein Portal betreten: Gegenstück in der Zielwelt suchen oder eins bauen
  Game.prototype.usePortal = function (kind) {
    // Das Ende hat feste Ein- und Ausstiegspunkte statt eines Gegenstücks
    if (kind === 'the_end') { MC.End.usePortal(this); return; }
    var p = this.player;
    var from = this.dim;
    var to = (from === kind) ? 'overworld' : kind;
    var spec = MC.Dim.Portal.KINDS[kind];
    var target = this.dimWorld(to);

    // Koordinaten umrechnen: der Nether ist achtmal dichter
    var sFrom = MC.Dim.SCALE[from] || 1, sTo = MC.Dim.SCALE[to] || 1;
    var tx = Math.round(p.x * sFrom / sTo);
    var tz = Math.round(p.z * sFrom / sTo);
    var ty = Math.round(p.y);

    // Zielgebiet erzeugen, sonst findet die Suche nichts
    this.generateAround(target, tx, tz, 2);

    var portalId = B.id(spec.portal);
    var found = MC.Dim.Portal.findNear(target, tx, ty, tz, portalId, 24);
    var pos;
    if (found) {
      pos = { x: found[0] + 0.5, y: found[1] + 0.05, z: found[2] + 0.5 };
      var g = MC.Dim.findGround(target, found[0], found[2], found[1] + 2);
      if (g >= 0) pos.y = g + 0.05;
    } else {
      pos = MC.Dim.Portal.build(target, tx, ty, tz, kind);
    }
    this.travelTo(to, pos);
  };

  // Eine Stelle, an der man wirklich stehen kann: erst der gemerkte Spawnpunkt
  // selbst (Bett im Haus), sonst die Oberfläche derselben Spalte. Ohne das
  // landet man nach der Rückkehr aus dem Ende schon mal mitten im Berg.
  Game.prototype.safeSpawnPos = function (world, sp) {
    var x = Math.floor(sp.x), z = Math.floor(sp.z);
    function frei(y) {
      if (y < 1 || y >= WH - 1) return false;
      return world.getBlock(x, y, z) === 0 && world.getBlock(x, y + 1, z) === 0 &&
             B.isSolid(world.getBlock(x, y - 1, z));
    }
    var y0 = Math.round(sp.y);
    for (var d = 0; d <= 2; d++) if (frei(y0 + d)) return { x: sp.x, y: y0 + d + 0.05, z: sp.z };
    for (var y = WH - 3; y > 1; y--) if (frei(y)) return { x: sp.x, y: y + 0.05, z: sp.z };
    return { x: sp.x, y: sp.y, z: sp.z };
  };

  // Das Ausgangsportal im Ende: zurück in die Oberwelt, dazu der Abspann
  Game.prototype.finishGame = function () {
    var sp = this.player.spawnPoint || { x: 0.5, y: 80, z: 0.5 };
    var over = this.dimWorld('overworld');
    this.generateAround(over, Math.round(sp.x), Math.round(sp.z), 1);
    this.travelTo('overworld', this.safeSpawnPos(over, sp));
    this.player.portalCd = 4;
    this.saveWorld();
    this.ui.showCredits();
  };

  // Sturz durch die Leere des Aether: man fällt in der Oberwelt vom Himmel
  Game.prototype.fallFromAether = function () {
    var p = this.player;
    var over = this.dimWorld('overworld');
    var tx = Math.round(p.x), tz = Math.round(p.z);
    this.generateAround(over, tx, tz, 1);
    var g = MC.Dim.findGround(over, tx, tz);
    var y = Math.min(MC.WORLD_HEIGHT - 3, (g < 0 ? over.gen.sea + 20 : g) + 40);
    this.travelTo('overworld', { x: tx + 0.5, y: y, z: tz + 0.5 });
    this.player.vy = -6;
    this.ui.toast('Du stürzt aus dem Aether!');
  };

  // Chunks einer beliebigen Welt erzeugen und belichten (für Portalsuche)
  Game.prototype.generateAround = function (w, x, z, r) {
    var cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    var i;
    for (var dx = -r; dx <= r; dx++) {
      for (var dz = -r; dz <= r; dz++) {
        var c = w.getChunk(cx + dx, cz + dz) || w.createChunk(cx + dx, cz + dz);
        if (c.state === 0) w.generateChunk(c);
      }
    }
    for (i = 0; i < w.chunkList.length; i++) {
      var ch = w.chunkList[i];
      if (ch.state !== 1) continue;
      if (Math.abs(ch.cx - cx) > r || Math.abs(ch.cz - cz) > r) continue;
      var ok = true;
      for (var d = 0; d < 4; d++) {
        var n = w.getChunk(ch.cx + (d === 0 ? 1 : d === 1 ? -1 : 0), ch.cz + (d === 2 ? 1 : d === 3 ? -1 : 0));
        if (!n || n.state === 0) { ok = false; break; }
      }
      if (ok) w.lightChunk(ch);
    }
  };

  // ---------- Chunk-Streaming ----------
  // blockingRadius > 0: sofort erzeugen (Weltstart). Sonst zeitbudgetiert.
  Game.prototype.ensureChunksAround = function (px, pz, blockingRadius) {
    var w = this.world;
    var rd = blockingRadius ? blockingRadius : this.renderer.renderDistance;
    var cx = Math.floor(px / CS), cz = Math.floor(pz / CS);
    var t0 = performance.now();
    var budget = blockingRadius ? 1e9 : 7;

    // ringweise von innen nach außen
    outer:
    for (var r = 0; r <= rd + 1; r++) {
      for (var dz = -r; dz <= r; dz++) {
        for (var dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          if (dx * dx + dz * dz > (rd + 1) * (rd + 1)) continue;
          var c = w.getChunk(cx + dx, cz + dz);
          if (!c) c = w.createChunk(cx + dx, cz + dz);
          if (c.state === 0) {
            w.generateChunk(c);
            if (performance.now() - t0 > budget) break outer;
          }
        }
      }
    }

    // Belichten, sobald alle 4 Nachbarn generiert sind
    for (var i = 0; i < w.chunkList.length; i++) {
      var ch = w.chunkList[i];
      if (ch.state !== 1) continue;
      var n0 = w.getChunk(ch.cx + 1, ch.cz), n1 = w.getChunk(ch.cx - 1, ch.cz);
      var n2 = w.getChunk(ch.cx, ch.cz + 1), n3 = w.getChunk(ch.cx, ch.cz - 1);
      if (!n0 || !n1 || !n2 || !n3) continue;
      if (n0.state === 0 || n1.state === 0 || n2.state === 0 || n3.state === 0) continue;
      w.lightChunk(ch);
      if (performance.now() - t0 > budget * 2.5) break;
    }

    // Entladen
    if (!blockingRadius) {
      var keep = this.renderer.renderDistance + 3;
      for (var k = w.chunkList.length - 1; k >= 0; k--) {
        var cc = w.chunkList[k];
        if (Math.abs(cc.cx - cx) > keep || Math.abs(cc.cz - cz) > keep) w.unloadChunk(cc);
      }
    }
  };

  Game.prototype.buildMeshes = function (blocking) {
    var w = this.world, self = this;
    var t0 = performance.now();
    var budget = blocking ? 100000 : 9;
    var px = this.player.x, pz = this.player.z;
    // Solange noch viel Licht unterwegs ist, lohnt Meshen nicht (würde sofort veralten)
    if (!blocking && w.lightPending() > 40000) { w.processLight(6); return; }
    var candidates = [];
    for (var i = 0; i < w.chunkList.length; i++) {
      var c = w.chunkList[i];
      if (c.state < 2 || !c.dirty) continue;
      // Nachbarn müssen belichtet sein, damit Ränder stimmen
      var ready = true;
      for (var d = 0; d < 4; d++) {
        var n = w.getChunk(c.cx + (d === 0 ? 1 : d === 1 ? -1 : 0), c.cz + (d === 2 ? 1 : d === 3 ? -1 : 0));
        if (!n || n.state < 2) { ready = false; break; }
      }
      if (!ready) continue;
      var dx = c.cx * CS + 8 - px, dz = c.cz * CS + 8 - pz;
      candidates.push({ c: c, d: dx * dx + dz * dz });
    }
    candidates.sort(function (a, b) { return a.d - b.d; });
    for (var k = 0; k < candidates.length; k++) {
      var ch = candidates[k].c;
      var mesh = MC.Mesher.build(w, ch);
      this.renderer.uploadChunk(ch, mesh);
      if (performance.now() - t0 > budget) break;
    }
  };

  // ---------- Drops ----------
  Game.prototype.spawnItem = function (x, y, z, stack) {
    if (!stack || stack.count <= 0) return;
    var e = new MC.ItemEntity(this.world, x, y, z, I.copyStack(stack));
    e.vx = (Math.random() - 0.5) * 2.2;
    e.vy = 2 + Math.random();
    e.vz = (Math.random() - 0.5) * 2.2;
    this.world.entities.push(e);
  };

  Game.prototype.dropBlock = function (x, y, z, id, meta, toolName, stack) {
    var b = B.byId[id];
    if (!b || !b.drop) return;
    if (this.mode === 'creative') return;
    if (!I.canHarvest(toolName, b)) return;
    var drops = [];
    var d = b.drop;

    // Behutsamkeit: der Block selbst statt seiner Beute – aber nur, wenn es
    // ihn überhaupt als Item gibt (Ackerboden und Feuer haben keins).
    var behutsam = stack && MC.Ench.stufe(stack, 'silk_touch') > 0;
    if (behutsam && b.item !== false && I.get(b.name) && b.name !== d) {
      this.spawnItem(x + 0.5, y + 0.4, z + 0.5, { id: b.name, count: 1 });
      return;
    }
    // Glück: mehr Beute aus allem, was nicht sich selbst fallen lässt.
    // Original: gleichverteilt 1 bis Stufe+1 Mal, kleinere Werte fallen weg.
    var glueck = stack ? MC.Ench.stufe(stack, 'fortune') : 0;
    var mehr = 1;
    if (glueck && b.name !== d && d !== 'special_grass' && d.indexOf('special_leaves') !== 0) {
      var w = 1 + ((Math.random() * (glueck + 1)) | 0);
      mehr = Math.max(1, w);
    }

    if (d === 'special_leaves_oak' || d === 'special_leaves_birch' || d === 'special_leaves_spruce') {
      var kind = d.replace('special_leaves_', '');
      if (toolName === 'shears') drops.push({ id: 'leaves_' + kind, n: 1 });
      else {
        if (Math.random() < 0.06) drops.push({ id: 'sapling_' + kind, n: 1 });
        if (kind === 'oak' && Math.random() < 0.008) drops.push({ id: 'apple', n: 1 });
        if (Math.random() < 0.02) drops.push({ id: 'stick', n: 1 });
      }
    } else if (d === 'special_grass') {
      if (toolName === 'shears') drops.push({ id: 'tall_grass', n: 1 });
      else if (Math.random() < 0.16) drops.push({ id: 'seeds', n: 1 });
    } else if (d === 'special_wart') {
      drops.push({ id: 'nether_wart_item', n: meta >= 3 ? 2 + ((Math.random() * 3) | 0) : 1 });
    } else if (d === 'special_wheat') {
      if (meta >= 7) { drops.push({ id: 'wheat_item', n: 1 }); drops.push({ id: 'seeds', n: 1 + ((Math.random() * 3) | 0) }); }
      else drops.push({ id: 'seeds', n: 1 });
    } else if (id === B.id('gravel')) {
      if (Math.random() < 0.12) drops.push({ id: 'flint', n: 1 });
      else drops.push({ id: 'gravel', n: 1 });
    } else if (id === B.id('wool_white') && false) { /* Platzhalter */ }
    else {
      drops.push({ id: d, n: b.dropCount || 1 });
    }

    for (var i = 0; i < drops.length; i++) {
      if (!I.get(drops[i].id)) continue;
      this.spawnItem(x + 0.5, y + 0.4, z + 0.5, { id: drops[i].id, count: drops[i].n * mehr });
    }

    // XP aus Erzen. Ohne die wäre Stufe 30 am Zaubertisch eine Zumutung,
    // darum zählt hier auch der Netherquarz mit.
    var xpOres = { coal_ore: 1, diamond_ore: 5, emerald_ore: 6, lapis_ore: 3, redstone_ore: 3, quartz_ore: 3 };
    if (behutsam) xpOres = {};
    if (xpOres[b.name]) {
      this.world.entities.push(new MC.XPOrb(this.world, x + 0.5, y + 0.5, z + 0.5, xpOres[b.name]));
    }
  };

  // ---------- Interaktion ----------
  Game.prototype.updateTarget = function () {
    var p = this.player;
    var d = p.lookDir();
    var reach = this.mode === 'creative' ? 6 : 4.5;
    this.target = this.world.raycast(p.x, p.eyeY(), p.z, d.x, d.y, d.z, reach, false);
    this.targetEntity = this.pickEntity(reach);
    if (this.targetEntity && this.target) {
      var de = this.targetEntity.dist;
      if (de > this.target.dist) this.targetEntity = null;
    }
  };

  Game.prototype.pickEntity = function (maxDist) {
    var p = this.player, d = p.lookDir();
    var ox = p.x, oy = p.eyeY(), oz = p.z;
    var best = null, bestT = maxDist;
    var ents = this.world.entities;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.dead || !(e.type === 'mob')) continue;
      var w = e.width / 2;
      var hit = MC.rayBox(ox, oy, oz, d.x, d.y, d.z,
        e.x - w - 0.1, e.y - 0.05, e.z - w - 0.1, e.x + w + 0.1, e.y + e.height + 0.1, e.z + w + 0.1);
      if (hit && hit.t < bestT) { bestT = hit.t; best = e; }
    }
    if (!best) return null;
    best.dist = bestT;
    return best;
  };

  Game.prototype.onMouseDown = function (button) {
    if (this.ui.isOpen() || this.paused || !this.started) return;
    var p = this.player;
    if (p.dead) return;
    if (button === 0) {
      this.updateTarget();
      p.swingTime = 1;
      if (this.targetEntity) this.attackEntity(this.targetEntity);
      else if (this.target) this.startMining();
    } else if (button === 1) {
      this.pickBlock();
    } else if (button === 2) {
      this.useItem();
    }
  };

  // Mausrad-Klick: den anvisierten Block in die Hand nehmen.
  // Kreativ holt ihn aus dem Nichts, im Überleben wird nur umgeschaltet,
  // wenn man ihn ohnehin schon dabei hat.
  Game.prototype.pickBlock = function () {
    this.updateTarget();
    if (!this.target) return;
    var name = this.itemForBlock(this.target.id);
    if (!name) return;
    var inv = this.player.inventory;

    // Schon in der Hotbar? Dann einfach auswählen.
    for (var h = 0; h < 9; h++) {
      if (inv.slots[h] && inv.slots[h].id === name) {
        inv.selected = h;
        this.ui.updateHotbar();
        return;
      }
    }
    if (this.mode !== 'creative') {
      // Im Überleben aus dem Inventar in die Hotbar holen
      for (var i = 9; i < inv.size; i++) {
        if (inv.slots[i] && inv.slots[i].id === name) {
          var tmp = inv.slots[inv.selected];
          inv.slots[inv.selected] = inv.slots[i];
          inv.slots[i] = tmp;
          this.ui.updateHotbar();
          return;
        }
      }
      return;
    }
    // Kreativ: freien Hotbar-Platz nehmen, sonst den aktuellen überschreiben
    var slot = inv.selected;
    for (var k = 0; k < 9; k++) if (!inv.slots[k]) { slot = k; break; }
    inv.slots[slot] = I.newStack(name, 1);
    inv.selected = slot;
    this.ui.updateHotbar();
  };

  // Blockid -> passender Item-Name (Ofen an -> Ofen, Ackerboden -> Erde …)
  Game.prototype.itemForBlock = function (id) {
    var b = B.byId[id];
    if (!b || b.id === 0) return null;
    if (I.get(b.name)) return b.name;
    for (var i = 0; i < I.list.length; i++) {
      var it = I.list[i];
      if (it.place === b.name || it.block === b.name) return it.name;
    }
    if (b.drop && I.get(b.drop)) return b.drop;
    return null;
  };

  Game.prototype.onMouseUp = function (button) {
    if (button === 0) this.mining = null;
    if (button === 2) {
      if (this.bowCharge > 0.25) this.shootBow();
      this.bowCharge = 0;
      this.player.eatTime = 0;
      this.eating = false;
    }
  };

  Game.prototype.attackEntity = function (e) {
    if (this.mode === 'spectator') return;
    var p = this.player;
    if (p.attackCd > 0) return;
    p.attackCd = 0.25;
    var st = p.inventory.selectedStack();
    var it = st ? I.get(st.id) : null;
    // Schere auf Schaf
    if (it && it.name === 'shears' && e.mobType === 'sheep' && !e.sheared) {
      e.sheared = true;
      this.spawnItem(e.x, e.y + 0.6, e.z, { id: 'wool_' + e.woolColor, count: 1 + ((Math.random() * 2) | 0) });
      p.inventory.damageSelected(1, this);
      this.audio.play('click');
      return;
    }
    var dmg = it ? it.damage : 1;
    if (!p.onGround && p.vy < 0) { dmg *= 1.5; this.particles.crit(e.x, e.y + e.height * 0.7, e.z); }
    if (st) dmg += MC.Ench.schadenBonus(st, e);
    if (MC.Effekte) dmg += 3 * MC.Effekte.stufe(p, 'staerke');
    var vorher = e.health;
    e.hurt(dmg, p, this);
    // Rückstoß und Verbrennung greifen erst nach dem Treffer
    if (st) {
      var kb = MC.Ench.stufe(st, 'knockback');
      if (kb && !e.dead) {
        var kdx = e.x - p.x, kdz = e.z - p.z;
        var kd = Math.sqrt(kdx * kdx + kdz * kdz) || 1;
        e.vx += kdx / kd * 5 * kb; e.vz += kdz / kd * 5 * kb;
        e.vy = Math.max(e.vy, 3);
      }
      var fa = MC.Ench.stufe(st, 'fire_aspect');
      if (fa && vorher !== undefined) e.brennt = Math.max(e.brennt || 0, fa * 4);
      var pl = MC.Ench.stufe(st, 'looting');
      if (pl) e.looting = pl;
    }
    p.exhaust(0.1);
    if (it && it.tool && it.tool.type === 'sword') p.inventory.damageSelected(1, this);
  };

  Game.prototype.startMining = function () {
    if (this.mode === 'spectator') return;
    var t = this.target;
    if (!t) return;
    var b = B.byId[t.id];
    if (b.hardness < 0 && this.mode !== 'creative') return;
    if (this.mode === 'creative') {
      // ohne Sperre würde jeder Frame einen weiteren Block wegnehmen
      if (this.player.breakCd > 0) return;
      this.breakBlock(t.x, t.y, t.z);
      this.player.breakCd = 0.22;
      this.mining = null;
      return;
    }
    this.mining = { x: t.x, y: t.y, z: t.z, progress: 0 };
  };

  Game.prototype.breakBlock = function (x, y, z) {
    if (this.mode === 'spectator') return;
    var id = this.world.getBlock(x, y, z);
    if (!id) return;
    var meta = this.world.getMeta(x, y, z);
    var b = B.byId[id];
    var st = this.player.inventory.selectedStack();
    var toolName = st ? st.id : null;

    this.particles.blockBreak(x, y, z, id, meta);
    this.audio.breakBlock(b.sound);
    this.dropBlock(x, y, z, id, meta, toolName, st);

    // Truheninhalt ausschütten – bei einer nie geöffneten Dorftruhe wird der
    // Inhalt jetzt erst ausgewürfelt, sonst ginge die Beute verloren
    if (b.name === 'chest') this.chestTile(x, y, z);
    var te = this.world.tileEntities[x + ',' + y + ',' + z];
    if (te && te.items) {
      for (var i = 0; i < te.items.length; i++) if (te.items[i]) this.spawnItem(x + 0.5, y + 0.5, z + 0.5, te.items[i]);
    }
    if (te && te.type === 'furnace') {
      ['input', 'fuel', 'output'].forEach(function (k) { if (te[k]) this.spawnItem(x + 0.5, y + 0.5, z + 0.5, te[k]); }, this);
    }

    // Bett: beide Hälften entfernen
    if (b.shape === B.SHAPE_BED) {
      var dir = BED_DIRS[(meta >> 1) & 3];
      var other = (meta & 1) ? [x - dir[0], y, z - dir[1]] : [x + dir[0], y, z + dir[1]];
      if (this.world.getBlock(other[0], other[1], other[2]) === id) this.world.setBlock(other[0], other[1], other[2], 0, 0);
    }

    // War die Pflanze geflutet, bleibt das Wasser stehen – sie hat es ja nur
    // aufgenommen, nicht verdrängt.
    if (B.istGeflutet(id, meta)) this.world.setBlock(x, y, z, B.id('water'), 0);
    else this.world.setBlock(x, y, z, 0, 0);
    if (this.mode !== 'creative') {
      var it = st ? I.get(st.id) : null;
      if (it && it.tool) this.player.inventory.damageSelected(1, this);
      this.player.exhaust(0.005);
    }
    this.mining = null;
  };

  var BED_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  // angeklickte Blockseite -> Wandrichtung, an der die Leiter hängt
  var LADDER_META = { 4: 0, 5: 2, 0: 3, 1: 1 };

  Game.prototype.facingFromYaw = function () {
    var y = this.player.yaw;
    var d = Math.round(y / (Math.PI / 2)) & 3;
    // 0 = Blick nach +Z -> Vorderseite zeigt zum Spieler (-Z)
    return [0, 3, 2, 1][d];
  };

  Game.prototype.useItem = function () {
    // Der Zuschauer fasst nichts an: kein Abbauen, kein Setzen, kein Benutzen
    if (this.mode === 'spectator') return;
    var p = this.player, w = this.world;
    this.updateTarget();
    var st = p.inventory.selectedStack();
    var it = st ? I.get(st.id) : null;

    // Entity-Interaktion
    if (this.targetEntity && this.targetEntity.mobType === 'villager') {
      this.ui.openScreen('trade', this.targetEntity);
      return;
    }
    if (this.targetEntity && it && it.name === 'shears' && this.targetEntity.mobType === 'sheep') {
      this.attackEntity(this.targetEntity);
      return;
    }

    // Blockinteraktion (Werkbank, Ofen, Truhe, Bett, TNT)
    if (this.target && !p.sneaking) {
      var t = this.target;
      var id = w.getBlock(t.x, t.y, t.z);
      var b = B.byId[id];
      if (b.name === 'crafting_table') { this.ui.openScreen('crafting'); return; }
      if (b.name === 'furnace' || b.name === 'furnace_lit') {
        var te = w.tileEntity(t.x, t.y, t.z, function () { return { type: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 }; });
        this.ui.openScreen('furnace', te);
        return;
      }
      if (b.name === 'chest') {
        this.ui.openScreen('chest', this.chestTile(t.x, t.y, t.z));
        return;
      }
      if (b.shape === B.SHAPE_ANVIL) {
        // Der Amboss merkt sich nichts: was drin liegt, kommt beim Schließen
        // zurück ins Inventar. Nur die Position braucht er, um sich abzunutzen.
        this.ui.openScreen('anvil', { type: 'anvil', a: null, b: null, out: null,
                                      name: '', pos: { x: t.x, y: t.y, z: t.z } });
        return;
      }
      if (b.name === 'brewing_stand') {
        var bt = w.tileEntity(t.x, t.y, t.z, function () {
          return { type: 'brew', zutat: null, fuel: null, glas: [null, null, null],
                   fortschritt: 0, brennstoff: 0 };
        });
        this.ui.openScreen('brew', bt);
        return;
      }
      if (b.name === 'enchanting_table') {
        // Die Regale werden bei jedem Öffnen neu gezählt – wer nachrüstet,
        // sieht den Unterschied sofort. Die Saat hängt am Tisch, damit das
        // Angebot beim Zumachen und Wiederöffnen dasselbe bleibt.
        var et = w.tileEntity(t.x, t.y, t.z, function () {
          return { type: 'enchant', item: null, lapis: null, regale: 0, saat: 1 };
        });
        if (!et.saat || et.saat === 1) et.saat = (U.hashString('zauber:' + t.x + ':' + t.y + ':' + t.z + ':' + this.seed)) >>> 0;
        et.regale = MC.Ench.regale(w, t.x, t.y, t.z);
        this.ui.openScreen('enchant', et);
        return;
      }
      if (b.shape === B.SHAPE_BED) { this.trySleep(t); return; }
      if (b.shape === B.SHAPE_DOOR) {
        if (b.name === 'door_iron') { this.ui.toast('Die Eisentür lässt sich nicht von Hand öffnen.'); return; }
        this.toggleDoor(t.x, t.y, t.z);
        return;
      }
      if (b.shape === B.SHAPE_GATE) {
        var gm = w.getMeta(t.x, t.y, t.z);
        w.setMetaOnly(t.x, t.y, t.z, gm ^ 4);
        this.audio.play((gm & 4) ? 'thud' : 'open');
        p.swingTime = 1;
        return;
      }
      // Hebel, Knopf, Verstärker
      if (MC.Redstone.use(this, t.x, t.y, t.z)) { p.swingTime = 1; return; }
      if (b.name === 'tnt' && it && it.name === 'flint_and_steel') {
        w.setBlock(t.x, t.y, t.z, 0, 0);
        var tnt = new MC.TNTEntity(w, t.x + 0.5, t.y, t.z + 0.5, 3.5);
        w.entities.push(tnt);
        p.inventory.damageSelected(1, this);
        this.audio.play('fizz');
        return;
      }
    }

    if (!it) return;

    // Spawn-Ei: setzt die Kreatur auf die angeklickte Fläche
    if (it.name.indexOf('egg_') === 0) {
      var art = it.name.slice(4);
      if (this.target && MC.MOB_TYPES && MC.MOB_TYPES[art]) {
        var en = MC.NEI[this.target.face];
        var ex = this.target.x + en[0] + 0.5;
        var ey = this.target.y + en[1] + 0.05;
        var ez = this.target.z + en[2] + 0.5;
        var neu = new MC.Mob(w, art, ex, ey, ez);
        // Dorfbewohner ohne Dorf hätten keine Angebote
        if (art === 'villager') neu.makeVillager('frei:' + Math.floor(ex) + ':' + Math.floor(ez), 0, { x: ex, z: ez }, null);
        w.entities.push(neu);
        this.particles.crit(ex, ey + 0.6, ez);
        if (this.mode !== 'creative') p.inventory.consumeSelected(1);
        p.swingTime = 1;
      }
      return;
    }

    // Trinken
    if (MC.Effekte && MC.Effekte.zerlegen(it.name)) {
      MC.Effekte.trinken(this, p.inventory.selectedStack());
      this.particles.crit(p.x, p.eyeY() - 0.3, p.z);
      return;
    }
    // Glasflasche an Wasser fuellen. Wichtig: der normale Zielstrahl geht durch
    // Fluessigkeiten hindurch (sie haben keine Auswahlbox), darum hier derselbe
    // Strahl wie beim Eimer - mit Fluessigkeiten. Ohne das konnte man nie eine
    // Wasserflasche bekommen, und damit war das ganze Brauen unerreichbar.
    if (it.name === 'glass_bottle') {
      var dw = p.lookDir();
      var hw = w.raycast(p.x, p.eyeY(), p.z, dw.x, dw.y, dw.z, 5, true);
      if (hw) {
        var bw = B.byId[w.getBlock(hw.x, hw.y, hw.z)];
        if (bw && bw.name === 'water') {
          if (this.mode !== 'creative') p.inventory.consumeSelected(1);
          var restW = p.inventory.add(I.newStack('water_bottle', 1));
          if (restW > 0) this.throwStack(I.newStack('water_bottle', restW));
          this.audio.play('splash');
          p.swingTime = 1;
          return;
        }
      }
    }
    // Essen
    if (it.food) { this.eating = true; p.eatTime = 1.4; return; }
    // Bogen
    if (it.name === 'bow') {
      if (this.mode === 'creative' || p.inventory.count('arrow') > 0) this.bowCharge = 0.001;
      return;
    }
    // Eimer – Wasser auf einen Glowstone-Rahmen öffnet den Aether
    if (it.name === 'water_bucket' && this.tryIgnitePortal('aether')) {
      if (this.mode !== 'creative') {
        p.inventory.consumeSelected(1);
        p.inventory.add(I.newStack('bucket', 1));
      }
      return;
    }
    if (it.name === 'bucket' || it.name === 'water_bucket' || it.name === 'lava_bucket') { this.useBucket(it); return; }
    // Hacke
    if (it.tool && it.tool.type === 'hoe' && this.target) {
      var gid = w.getBlock(this.target.x, this.target.y, this.target.z);
      if ((gid === B.id('grass') || gid === B.id('dirt')) && w.getBlock(this.target.x, this.target.y + 1, this.target.z) === 0) {
        w.setBlock(this.target.x, this.target.y, this.target.z, B.id('farmland'), 0);
        p.inventory.damageSelected(1, this);
        this.audio.place('grass');
        p.swingTime = 1;
        return;
      }
    }
    // Samen
    if (it.name === 'seeds' && this.target) {
      if (w.getBlock(this.target.x, this.target.y, this.target.z) === B.id('farmland') &&
          w.getBlock(this.target.x, this.target.y + 1, this.target.z) === 0) {
        w.setBlock(this.target.x, this.target.y + 1, this.target.z, B.id('wheat'), 0);
        if (this.mode !== 'creative') p.inventory.consumeSelected(1);
        this.audio.place('grass');
        p.swingTime = 1;
        return;
      }
    }
    // Enderauge in einen Endportalrahmen setzen; beim zwölften zündet das Portal
    if (it.name === 'ender_eye' && MC.End.placeEye(this)) return;
    // Enderperle werfen: man landet dort, wo sie aufschlägt
    if (it.name === 'ender_pearl') { this.throwPearl(); return; }
    // Feuerzeug: erst Portal versuchen, sonst Feuer legen
    if (it.name === 'flint_and_steel') {
      if (this.tryIgnitePortal('nether')) return;
      this.lightFire();
      return;
    }
    // Bett platzieren
    if (it.name === 'bed') { this.placeBed(); return; }
    // Tür platzieren (zwei Blöcke hoch)
    if (it.place === 'door_oak' || it.place === 'door_iron') { this.placeDoor(it.place); return; }
    // Block platzieren
    if (it.block) this.placeBlock(it);
  };

  // Truhe holen und, wenn sie zu einem Dorf gehört, beim ersten Zugriff füllen
  Game.prototype.chestTile = function (x, y, z) {
    var w = this.world;
    return w.tileEntity(x, y, z, function () {
      var loot = null;
      try {
        if (w.dim === 'nether') loot = MC.Dim.fortressLoot(w.gen, x, y, z);
        else if (w.dim === 'overworld') {
          loot = MC.Stronghold.chestLoot(w.gen, x, y, z);
          if (!loot && MC.Caves && w.gen.genV >= 2) loot = MC.Caves.chestLoot(w.gen, x, y, z);
          if (!loot && MC.Village && w.gen.o.structures) loot = MC.Village.chestLoot(w.gen, x, y, z);
        }
      } catch (e) { loot = null; }
      return { type: 'chest', items: loot || new Array(27) };
    });
  };

  Game.prototype.toggleDoor = function (x, y, z) {
    var w = this.world;
    var open = !w.isDoorOpen(x, y, z);
    w.setDoorOpen(x, y, z, open);
    this.audio.play(open ? 'open' : 'thud');
    this.player.swingTime = 1;
  };

  Game.prototype.placeDoor = function (blockName) {
    var w = this.world, p = this.player, t = this.target;
    if (!t) return;
    var n = MC.NEI[t.face];
    var x = t.x + n[0], y = t.y + n[1], z = t.z + n[2];
    var below = w.getBlock(x, y - 1, z);
    if (!B.isSolid(below)) return;
    var cur = w.getBlock(x, y, z), up = w.getBlock(x, y + 1, z);
    if ((cur !== 0 && !B.isReplaceable(cur)) || (up !== 0 && !B.isReplaceable(up))) return;
    var facing = this.facingFromYaw();
    var id = B.id(blockName);
    w.setBlock(x, y, z, id, (facing << 1));
    w.setBlock(x, y + 1, z, id, (facing << 1) | 1);
    this.audio.place(B.byId[id].sound);
    p.swingTime = 1;
    if (this.mode !== 'creative') p.inventory.consumeSelected(1);
  };

  // Zündet ein Portal, wenn der angeklickte Block der passende Rahmen ist.
  // Gibt true zurück, wenn wirklich ein Portal entstanden ist.
  Game.prototype.tryIgnitePortal = function (kind) {
    var w = this.world, t = this.target, p = this.player;
    if (!t) return false;
    var spec = MC.Dim.Portal.KINDS[kind];
    if (w.getBlock(t.x, t.y, t.z) !== B.id(spec.frame)) return false;
    var n = MC.NEI[t.face];
    var n2 = MC.Dim.Portal.ignite(w, t.x + n[0], t.y + n[1], t.z + n[2], kind);
    if (!n2) return false;
    this.audio.play('levelup');
    this.particles.flame(t.x + 0.5, t.y + 1.2, t.z + 0.5, 12);
    p.swingTime = 1;
    if (kind === 'nether' && this.mode !== 'creative') p.inventory.damageSelected(1, this);
    this.ui.toast(MC.Dim.TITLE[kind] + 'portal geöffnet');
    return true;
  };

  Game.prototype.lightFire = function () {
    var w = this.world, p = this.player, t = this.target;
    if (!t) return;
    var n = MC.NEI[t.face];
    var x = t.x + n[0], y = t.y + n[1], z = t.z + n[2];
    var cur = w.getBlock(x, y, z);
    if (cur !== 0 && !B.isReplaceable(cur)) return;
    // Feuer braucht einen Untergrund oder etwas Brennbares daneben
    var ok = B.isSolid(w.getBlock(x, y - 1, z));
    if (!ok) {
      for (var d = 0; d < 6; d++) {
        var nn = MC.NEI[d];
        var nb = B.byId[w.getBlock(x + nn[0], y + nn[1], z + nn[2])];
        if (nb && nb.flammable) { ok = true; break; }
      }
    }
    if (!ok) return;
    w.setBlock(x, y, z, B.id('fire'), 0);
    w.scheduleUpdate(x, y, z, 12);
    this.particles.flame(x + 0.5, y + 0.3, z + 0.5, 8);
    this.audio.play('fizz');
    p.inventory.damageSelected(1, this);
    p.swingTime = 1;
  };

  Game.prototype.placeBlock = function (it) {
    if (this.mode === 'spectator') return;
    var w = this.world, p = this.player, t = this.target;
    if (!t) return;
    var block = B.byName[it.block];
    if (!block) return;

    var tx = t.x, ty = t.y, tz = t.z;
    var targetId = w.getBlock(tx, ty, tz);
    var replaceTarget = B.isReplaceable(targetId) && targetId !== 0;
    var nx = tx, ny = ty, nz = tz;
    if (!replaceTarget) {
      var n = MC.NEI[t.face];
      nx += n[0]; ny += n[1]; nz += n[2];
    }
    var cur = w.getBlock(nx, ny, nz);
    if (cur !== 0 && !B.isReplaceable(cur)) return;
    if (ny < 0 || ny >= WH) return;

    // Kollision mit Spieler/Mobs
    if (block.collide) {
      var boxes = B.boxes(block.id, 0);
      if (boxes) {
        for (var bi = 0; bi < boxes.length; bi++) {
          var bx = boxes[bi];
          if (overlapAABB(p.x - 0.3, p.y, p.z - 0.3, p.x + 0.3, p.y + p.height, p.z + 0.3,
                          nx + bx[0], ny + bx[1], nz + bx[2], nx + bx[3], ny + bx[4], nz + bx[5])) return;
        }
      }
    }
    // Halt für Pflanzen
    if (B.needsSupport(block.id) && !B.validGround(block.id, w.getBlock(nx, ny - 1, nz))) return;

    var meta = 0;
    if (block.shape === B.SHAPE_TORCH) {
      // Seitliche Fläche angeklickt -> Wandfackel, sonst Standfackel
      var wm = LADDER_META[t.face];
      if (wm !== undefined && B.isOpaque(w.getBlock(nx + B.SIDE_DIRS[wm][0], ny, nz + B.SIDE_DIRS[wm][1]))) {
        meta = wm + 1;
      } else if (B.validGround(block.id, w.getBlock(nx, ny - 1, nz))) {
        meta = 0;
      } else return;
    } else if (block.shape === B.SHAPE_SLAB) {
      if (t.face === 3) meta = 1;
      else if (t.face !== 2 && (t.hy - Math.floor(t.hy)) > 0.5) meta = 1;
    } else if (block.shape === B.SHAPE_STAIRS) {
      // hoher Teil zeigt in Blickrichtung -> man steigt nach vorne hinauf
      meta = (this.facingFromYaw() + 2) & 3;
      if (t.face === 3 || (t.face !== 2 && (t.hy - Math.floor(t.hy)) > 0.5)) meta |= 4;
    } else if (block.shape === B.SHAPE_LADDER) {
      var lm = LADDER_META[t.face];
      if (lm === undefined) {
        // Decke/Boden angeklickt: passende Wand in der Nähe suchen
        for (var lf = 0; lf < 4; lf++) {
          var ls = MC.LADDER_SUPPORT[lf];
          if (B.isOpaque(w.getBlock(nx + ls[0], ny, nz + ls[1]))) { lm = lf; break; }
        }
        if (lm === undefined) return;
      }
      var sup = MC.LADDER_SUPPORT[lm];
      if (!B.isOpaque(w.getBlock(nx + sup[0], ny, nz + sup[1]))) return;
      meta = lm;
    } else if (block.shape === B.SHAPE_GATE) {
      // Schranke quer zur Blickrichtung, damit das Tor in die Zaunlinie passt
      meta = this.facingFromYaw();
    } else if (block.shape === B.SHAPE_WIRE || block.shape === B.SHAPE_PLATE) {
      // brauchen festen Boden darunter
      if (!B.isSolid(w.getBlock(nx, ny - 1, nz))) return;
      meta = 0;
    } else if (block.shape === B.SHAPE_REPEATER) {
      if (!B.isSolid(w.getBlock(nx, ny - 1, nz))) return;
      // Ausgang zeigt weg vom Spieler
      meta = (this.facingFromYaw() + 2) & 3;
    } else if (block.shape === B.SHAPE_LEVER || block.shape === B.SHAPE_BUTTON) {
      // Auf den Boden gesetzt oder an eine Wand geklebt
      var wm2 = LADDER_META[t.face];
      if (t.face === 2) {
        if (!B.isSolid(w.getBlock(nx, ny - 1, nz))) return;
        meta = 4;
      } else if (wm2 !== undefined && B.isOpaque(w.getBlock(nx + B.SIDE_DIRS[wm2][0], ny, nz + B.SIDE_DIRS[wm2][1]))) {
        meta = wm2;
      } else if (B.isSolid(w.getBlock(nx, ny - 1, nz))) {
        meta = 4;
      } else return;
    } else if (block.piston6) {
      // Der Kolben zeigt zum Spieler, wie im Original. Steht man deutlich
      // darüber oder darunter, fährt er senkrecht aus.
      var pd = p.lookDir();
      if (pd.y > 0.68) meta = 5;            // von unten gesetzt -> Kopf nach unten
      else if (pd.y < -0.68) meta = 4;      // von oben gesetzt -> Kopf nach oben
      else meta = this.facingFromYaw();
      // Der Beobachter ist umgekehrt herum: er schaut in Blickrichtung, damit
      // er den Block im Auge hat, den man gerade ansieht.
      if (block.name === 'observer') meta = meta < 4 ? ((meta + 2) & 3) : (meta === 4 ? 5 : 4);
    } else if (block.name.indexOf('log_') === 0) {
      meta = (t.face === 2 || t.face === 3) ? 0 : ((t.face === 0 || t.face === 1) ? 1 : 2);
    } else if (typeof block.tex === 'object' && block.tex.front) {
      meta = this.facingFromYaw();
    }

    // Setzt man eine flutbare Pflanze ins Wasser, nimmt sie es auf, statt es
    // zu verdrängen. An Land bleibt sie trocken.
    if (B.kannFluten(block.id)) {
      var davor = w.getBlock(nx, ny, nz);
      var stand = (davor === B.id('water')) || w.istFluessig(nx, ny, nz, B.id('water'));
      if (stand) meta |= B.NASS_BIT;
    }
    w.setBlock(nx, ny, nz, block.id, meta);
    if (B.kannFluten(block.id)) w.scheduleFluid(nx, ny, nz, 2);
    // Der Schwamm saugt das Wasser um sich herum weg und wird dabei nass
    if (block.name === 'sponge') this.saugeSchwamm(nx, ny, nz);
    if (block.liquid) w.scheduleFluid(nx, ny, nz, 2);
    this.audio.place(block.sound);
    p.swingTime = 1;
    if (this.mode !== 'creative') p.inventory.consumeSelected(1);
  };

  // Schwamm: nimmt in einem Umkreis von fünf Blöcken alles Wasser weg und wird
  // dabei selbst nass. Getrocknet wird er im Ofen, wie im Original.
  Game.prototype.saugeSchwamm = function (x, y, z) {
    var w = this.world, wasser = B.id('water'), n = 0;
    for (var dy = -5; dy <= 5; dy++) {
      for (var dz = -5; dz <= 5; dz++) {
        for (var dx = -5; dx <= 5; dx++) {
          if (dx * dx + dy * dy + dz * dz > 30) continue;
          var px = x + dx, py = y + dy, pz = z + dz;
          // Auch das Wasser in gefluteten Pflanzen wird aufgesogen – die
          // Pflanze bleibt stehen, nur trocken.
          if (w.entwaessere(px, py, pz)) { n++; continue; }
          if (w.getBlock(px, py, pz) !== wasser) continue;
          w.setBlock(px, py, pz, 0, 0, { noUpdate: true });
          n++;
        }
      }
    }
    if (!n) return;
    w.setBlock(x, y, z, B.id('sponge_wet'), 0, { noUpdate: true });
    this.particles.splash(x + 0.5, y + 1, z + 0.5, 8);
    this.audio.play('splash');
  };

  Game.prototype.placeBed = function () {
    var w = this.world, p = this.player, t = this.target;
    if (!t) return;
    var n = MC.NEI[t.face];
    var x = t.x + n[0], y = t.y + n[1], z = t.z + n[2];
    if (w.getBlock(x, y, z) !== 0) return;
    // Kopfteil zeigt in Blickrichtung (facingFromYaw liefert die Vorderseite = zum Spieler)
    var facing = (this.facingFromYaw() + 2) & 3;
    var dir = BED_DIRS[facing];
    var hx = x + dir[0], hz = z + dir[1];
    if (w.getBlock(hx, y, hz) !== 0) return;
    if (!B.isSolid(w.getBlock(x, y - 1, z)) || !B.isSolid(w.getBlock(hx, y - 1, hz))) return;
    w.setBlock(x, y, z, B.id('bed'), (facing << 1));
    w.setBlock(hx, y, hz, B.id('bed'), (facing << 1) | 1);
    this.audio.place('cloth');
    if (this.mode !== 'creative') p.inventory.consumeSelected(1);
  };

  Game.prototype.trySleep = function (t) {
    var w = this.world, p = this.player;
    p.spawnPoint = { x: t.x + 0.5, y: t.y + 1.05, z: t.z + 0.5 };
    if (!w.isNight()) { this.ui.toast('Du kannst nur nachts schlafen. Spawnpunkt gesetzt.'); return; }
    // Monster in der Nähe?
    for (var i = 0; i < w.entities.length; i++) {
      var e = w.entities[i];
      if (e.type === 'mob' && e.hostile && !e.dead && e.distTo(p) < 12) {
        this.ui.toast('Du kannst jetzt nicht schlafen, es sind Monster in der Nähe!');
        return;
      }
    }
    w.time = 0.02;
    p.heal(2);
    MC.Achievements.grant(this, 'bett');
    this.ui.toast('Gute Nacht. Spawnpunkt gesetzt.');
    this.audio.play('levelup');
  };

  Game.prototype.useBucket = function (it) {
    var w = this.world, p = this.player;
    var d = p.lookDir();
    if (it.name === 'bucket') {
      var hit = w.raycast(p.x, p.eyeY(), p.z, d.x, d.y, d.z, 5, true);
      if (!hit) return;
      var id = w.getBlock(hit.x, hit.y, hit.z);
      var b = B.byId[id];
      if (!b || !b.liquid || w.getMeta(hit.x, hit.y, hit.z) !== 0) return;
      w.setBlock(hit.x, hit.y, hit.z, 0, 0);
      if (this.mode !== 'creative') {
        p.inventory.consumeSelected(1);
        var left = p.inventory.add(I.newStack(b.name === 'water' ? 'water_bucket' : 'lava_bucket', 1));
        if (left > 0) this.spawnItem(p.x, p.y + 1, p.z, I.newStack(b.name === 'water' ? 'water_bucket' : 'lava_bucket', left));
      }
      this.audio.play('splash');
    } else {
      if (!this.target) return;
      var n = MC.NEI[this.target.face];
      var x = this.target.x + n[0], y = this.target.y + n[1], z = this.target.z + n[2];
      var curId = w.getBlock(x, y, z);
      if (curId !== 0 && !B.isReplaceable(curId)) return;
      var fluid = it.name === 'water_bucket' ? 'water' : 'lava';
      // Im Nether verdampft Wasser sofort, wie im Original – der Eimer wird
      // trotzdem leer, sonst hätte man eine kostenlose Probe.
      if (fluid === 'water' && w.dim === 'nether') {
        if (this.mode !== 'creative') {
          p.inventory.consumeSelected(1);
          p.inventory.add(I.newStack('bucket', 1));
        }
        this.particles.smoke(x + 0.5, y + 0.5, z + 0.5, 10);
        this.audio.play('fizz');
        return;
      }
      w.setBlock(x, y, z, B.id(fluid), 0);
      w.scheduleFluid(x, y, z, 2);
      if (this.mode !== 'creative') {
        p.inventory.consumeSelected(1);
        p.inventory.add(I.newStack('bucket', 1));
      }
      this.audio.play('splash');
    }
  };

  // Amboss nutzt sich ab: angeschlagen, beschädigt, dann ist er hin
  Game.prototype.amboss = function (pos) {
    var w = this.world;
    var cur = B.byId[w.getBlock(pos.x, pos.y, pos.z)];
    if (!cur || cur.shape !== B.SHAPE_ANVIL) return;
    var kette = ['anvil', 'anvil_chipped', 'anvil_damaged'];
    var i = kette.indexOf(cur.name);
    if (i < 0) return;
    if (i === kette.length - 1) {
      w.setBlock(pos.x, pos.y, pos.z, 0, 0);
      this.particles.blockBreak(pos.x, pos.y, pos.z, cur.id, 0);
      this.audio.breakBlock('stone');
      this.ui.toast('Der Amboss ist zerbrochen.');
      this.ui.close();
    } else {
      w.setBlock(pos.x, pos.y, pos.z, B.id(kette[i + 1]), 0);
      this.audio.play('thud');
    }
  };

  Game.prototype.throwPearl = function () {
    var p = this.player;
    if (p.pearlCd > 0) return;
    p.pearlCd = 0.8;
    var d = p.lookDir();
    this.world.entities.push(new MC.EnderPearl(this.world,
      p.x + d.x * 0.4, p.eyeY() - 0.1, p.z + d.z * 0.4,
      d.x * 22, d.y * 22 + 2, d.z * 22, p));
    this.audio.play('bow');
    p.swingTime = 1;
    if (this.mode !== 'creative') p.inventory.consumeSelected(1);
  };

  Game.prototype.shootBow = function () {
    var p = this.player;
    var bogen = p.inventory.selectedStack();
    var unendlich = bogen && MC.Ench.stufe(bogen, 'infinity') > 0;
    if (this.mode !== 'creative') {
      var found = false;
      for (var i = 0; i < p.inventory.size; i++) {
        var s = p.inventory.slots[i];
        if (s && s.id === 'arrow') {
          // Unendlichkeit braucht einen Pfeil im Köcher, verbraucht ihn aber nicht
          if (!unendlich) { s.count--; if (s.count <= 0) p.inventory.slots[i] = null; }
          found = true; break;
        }
      }
      if (!found) return;
      p.inventory.damageSelected(1, this);
    }
    var d = p.lookDir();
    var zug = Math.min(1, this.bowCharge);
    var power = zug * 34 + 12;
    var schaden = 4 + zug * 5;
    if (bogen) {
      // Stärke: +25 % je Stufe, wie im Original
      var st = MC.Ench.stufe(bogen, 'power');
      if (st) schaden *= 1 + 0.25 * st + 0.25;
    }
    var a = new MC.Arrow(this.world, p.x + d.x * 0.5, p.eyeY() - 0.1, p.z + d.z * 0.5,
      d.x * power, d.y * power + 1.2, d.z * power, p, Math.round(schaden));
    if (bogen) {
      a.punch = MC.Ench.stufe(bogen, 'punch');
      a.flamme = MC.Ench.stufe(bogen, 'flame');
    }
    this.world.entities.push(a);
    this.audio.play('bow');
    p.swingTime = 1;
  };

  // ---------- Ofen ----------
  Game.prototype.tickFurnaces = function () {
    var w = this.world;
    for (var k in w.tileEntities) {
      var te = w.tileEntities[k];
      if (te.type !== 'furnace') continue;
      var parts = k.split(',');
      var x = +parts[0], y = +parts[1], z = +parts[2];
      var changed = false;
      var recipe = te.input ? R.smeltResult(te.input.id) : null;
      var canSmelt = false;
      if (recipe) {
        if (!te.output) canSmelt = true;
        else if (te.output.id === recipe.id && te.output.count + recipe.count <= I.stackMax(recipe.id)) canSmelt = true;
      }
      if (te.burn > 0) { te.burn--; changed = true; }
      if (te.burn <= 0 && canSmelt && te.fuel) {
        var fv = R.fuelValue(te.fuel.id);
        if (fv > 0) {
          te.burn = fv; te.burnMax = fv;
          te.fuel.count--;
          if (te.fuel.id === 'lava_bucket') { te.fuel = I.newStack('bucket', 1); }
          else if (te.fuel.count <= 0) te.fuel = null;
          changed = true;
        }
      }
      if (te.burn > 0 && canSmelt) {
        te.cook++;
        if (te.cook >= R.SMELT_TIME) {
          te.cook = 0;
          if (!te.output) te.output = I.newStack(recipe.id, recipe.count);
          else te.output.count += recipe.count;
          MC.Achievements.onItem(this, recipe.id);
          te.input.count--;
          if (te.input.count <= 0) te.input = null;
          this.player.addXP(1);
        }
        changed = true;
      } else if (te.cook > 0) { te.cook = Math.max(0, te.cook - 2); changed = true; }

      // Blockzustand (an/aus)
      var cur = w.getBlock(x, y, z);
      var want = te.burn > 0 ? B.id('furnace_lit') : B.id('furnace');
      if ((cur === B.id('furnace') || cur === B.id('furnace_lit')) && cur !== want) {
        w.setBlock(x, y, z, want, w.getMeta(x, y, z), { keepTile: true, noUpdate: true });
      }
      if (te.burn > 0 && Math.random() < 0.1) this.particles.smoke(x + 0.5, y + 1, z + 0.5, 1);
    }
  };

  Game.prototype.refreshFurnaceUI = function () {
    if (this.ui.open !== 'furnace' || !this.ui.furnace) return;
    var te = this.ui.furnace;
    if (this.ui.fireEl) this.ui.fireEl.style.height = (te.burnMax ? (te.burn / te.burnMax) * 100 : 0) + '%';
    if (this.ui.progEl) this.ui.progEl.firstChild.style.width = (te.cook / R.SMELT_TIME * 100) + '%';
    this.ui.refreshSlots();
  };

  // ---------- Tasten ----------
  Game.prototype.onKeyDown = function (e) {
    var code = e.code;
    if (!this.started) return;
    // M tut dasselbe wie Escape. Nötig, weil der Browser Escape vorher abfängt:
    // es gibt den Mauszeiger frei und verlässt am Mac zusätzlich das Vollbild –
    // beim Spiel kommt die Taste dann gar nicht mehr an.
    if (code === 'Escape' || code === 'KeyM') {
      if (this.ui.isOpen()) this.ui.close();
      else this.pause(!this.paused);
      return;
    }
    if (this.player.dead) {
      if (code === 'Space' || code === 'Enter') this.player.respawn(this);
      return;
    }
    if (this.ui.isOpen()) {
      if (code === 'KeyE' || code === 'KeyI') this.ui.close();
      return;
    }
    if (this.paused) return;

    switch (code) {
      case 'KeyE': case 'KeyI':
        // Der Zuschauer trägt nichts bei sich – ein Inventar wäre sinnlos
        if (this.mode === 'spectator') break;
        this.ui.openScreen(this.mode === 'creative' ? 'creative' : 'inventory');
        break;
      case 'KeyQ': this.dropSelected(e.shiftKey); break;
      case 'F3': this.ui.debugVisible = !this.ui.debugVisible; break;
      case 'KeyP':
        this.setMode(MC.MODI[(MC.MODI.indexOf(this.mode) + 1) % MC.MODI.length]);
        this.ui.toast('Modus: ' + MC.MODUS_NAME[this.mode]);
        break;
      case 'F5': this.hideHand = !this.hideHand; break;
      case 'Space':
        var now = performance.now();
        if (this.mode === 'creative' && now - (this.input.lastSpace || 0) < 320) {
          this.player.flying = !this.player.flying;
          this.player.vy = 0;
        }
        this.input.lastSpace = now;
        break;
      case 'KeyF': this.ui.toast('Sichtweite: ' + this.cycleRenderDistance()); break;
      // M öffnet jetzt das Menü; die Musik schaltet J um und steht weiter im Pausenmenü
      case 'KeyJ': this.audio.musicOn = !this.audio.musicOn; this.ui.toast('Musik ' + (this.audio.musicOn ? 'an' : 'aus')); break;
      case 'KeyR': this.saveWorld(); break;
      // N vergroessert die Karte in der Hand - M ist schon die Pause
      case 'KeyN': this.ui.mapGross = !this.ui.mapGross; break;
    }
    if (code.indexOf('Digit') === 0) {
      var n = parseInt(code.slice(5), 10);
      if (n >= 1 && n <= 9) { this.player.inventory.selected = n - 1; this.ui.updateHotbar(); }
    }
  };

  Game.prototype.cycleRenderDistance = function () {
    var opts = [4, 5, 6, 7, 8, 10, 12];
    var i = opts.indexOf(this.renderer.renderDistance);
    this.renderer.renderDistance = opts[(i + 1) % opts.length];
    return this.renderer.renderDistance;
  };

  // Wirft einen fertigen Stack vor den Spieler (Q, Klick neben das Inventar)
  Game.prototype.throwStack = function (stack) {
    if (!stack || stack.count <= 0) return;
    var p = this.player;
    var d = p.lookDir();
    var e = new MC.ItemEntity(this.world, p.x + d.x * 0.6, p.eyeY() - 0.3, p.z + d.z * 0.6, stack);
    e.vx = d.x * 6; e.vy = d.y * 6 + 1.5; e.vz = d.z * 6;
    e.pickupDelay = 1.2;
    this.world.entities.push(e);
  };

  Game.prototype.dropSelected = function (all) {
    var p = this.player;
    var s = p.inventory.selectedStack();
    if (!s) return;
    var n = all ? s.count : 1;
    this.throwStack(I.copyStack(s, n));
    s.count -= n;
    if (s.count <= 0) p.inventory.slots[p.inventory.selected] = null;
    this.ui.updateHotbar();
  };

  // ---------- Pointer Lock / Pause ----------
  Game.prototype.requestPointerLock = function () {
    var self = this;
    if (this.paused || this.ui.isOpen() || !this.started || !this.player || this.player.dead) return;
    if (!this.canvas.requestPointerLock) return;
    // Chrome verweigert eine sofortige Neuanforderung nach dem Freigeben.
    // Darum kurz warten und den Klick-Hinweis zeigen, falls es nicht klappt.
    var tryLock = function () {
      if (self.paused || self.ui.isOpen() || !self.started) return;
      var p = self.canvas.requestPointerLock();
      if (p && p.catch) p.catch(function () { self.showClickHint(true); });
    };
    if (performance.now() - (this._lastUnlock || 0) < 1300) setTimeout(tryLock, 1300);
    else tryLock();
  };

  Game.prototype.exitPointerLock = function () {
    this._lastUnlock = performance.now();
    this.suppressPauseUntil = performance.now() + 900;
    if (document.exitPointerLock) document.exitPointerLock();
  };

  Game.prototype.toggleFullscreen = function () {
    var el = document.documentElement;
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    } else if (el.requestFullscreen) {
      var p = el.requestFullscreen();
      if (p && p.catch) p.catch(function () { });
    }
  };

  Game.prototype.showClickHint = function (on) {
    var el = document.getElementById('clickhint');
    if (el) el.style.display = on ? 'flex' : 'none';
  };

  // Ein Moduswechsel zieht mehr nach sich als das Feld selbst: der Zuschauer
  // fliegt immer, der Überlebende nie, und offene Fenster passen dann nicht mehr.
  Game.prototype.setMode = function (m) {
    if (MC.MODI.indexOf(m) < 0) m = 'survival';
    this.mode = m;
    this.player.flying = (m !== 'survival');
    if (m === 'spectator') {
      this.mining = null;
      this.bowCharge = 0;
      if (this.ui && this.ui.isOpen()) this.ui.close();
    }
  };

  Game.prototype.pause = function (on) {
    this.paused = on;
    if (on) { this.exitPointerLock(); this.showMenu('pause'); }
    else { this.hideMenu(); this.requestPointerLock(); }
  };

  // Der gelbe Spruch unter dem Logo. Im Original stehen dort Insiderwitze –
  // unsere drehen sich um dieses Projekt.
  var SPLASHES = [
    'Komplett offline!', 'Keine einzige Abhängigkeit!', 'Texturen zur Laufzeit gemalt!',
    'Doppelklick genügt!', 'Ein einziges HTML!', 'Kein Build-Schritt!',
    'Auch der Aether ist drin!', '495 Texturen, alle selbst gemacht!',
    'Neun Weltversionen tief!', 'Wurmlöcher gibt es wirklich!',
    'Seegras ist jetzt richtig nass!', 'Höhlen mit Sackgassen!',
    'Der Drache wartet.', 'Enderperlen tun weh.', 'Nicht in die Lava.',
    'Mit Verzauberungen!', 'Mit Kolben!', 'Mit Ambossen!',
    'Läuft aus dem Downloadordner!', 'Bitte nicht die Werkbank essen.',
    'Auch im Zuschauermodus!', 'Glowstone nur in Bastionen!',
    'Zanit! Gravitit!', 'Hergestellt in Absam.'
  ];

  // Das Logo: Text mit einer Blocktextur gefüllt, dazu ein harter Schatten.
  Game.prototype.logoCanvas = function () {
    var text = 'MINECRAFT';
    var gross = Math.min(96, Math.max(40, Math.floor(window.innerWidth / 11)));
    var c = document.createElement('canvas');
    var ctx = c.getContext('2d');
    ctx.font = 'bold ' + gross + 'px "Courier New", monospace';
    var breite = ctx.measureText(text).width;
    var rand = Math.ceil(gross * 0.22);
    c.width = Math.ceil(breite) + rand * 2;
    c.height = Math.ceil(gross * 1.5) + rand;
    c.className = 'mlogo';
    ctx = c.getContext('2d');
    ctx.font = 'bold ' + gross + 'px "Courier New", monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    var mx = c.width / 2, my = c.height / 2;

    var muster = null;
    try {
      // Grasseite, deutlich aufgehellt – ungebleicht säuft das Logo vor dem
      // Panorama ab und ist nur noch ein dunkler Fleck
      var kachel = MC.Textures.tileCanvas('grass_side', 1.75);
      muster = ctx.createPattern(kachel, 'repeat');
    } catch (e) { muster = null; }

    // Schatten nach unten rechts, wie die versetzten Blöcke im Original
    var tiefe = Math.max(3, Math.round(gross * 0.10));
    ctx.fillStyle = 'rgba(0,0,0,.75)';
    for (var d = tiefe; d > 0; d--) ctx.fillText(text, mx + d, my + d);

    ctx.fillStyle = muster || '#7a9a5c';
    ctx.fillText(text, mx, my);
    // Dunkle Kante, damit die Buchstaben vor dem Panorama stehen bleiben
    ctx.lineWidth = Math.max(1.5, gross * 0.045);
    ctx.strokeStyle = 'rgba(0,0,0,.85)';
    ctx.strokeText(text, mx, my);
    return c;
  };

  // ---------- Startbildschirm: das Panorama ----------
  // Das Original zeigt hinter dem Menü einen langsam schwenkenden Ausschnitt
  // einer Welt. Wir haben den Renderer ohnehin – also erzeugen wir eine kleine
  // Welt, stellen eine Kamera auf eine Anhöhe und drehen sie. Kein Standbild,
  // sondern dieselbe Weltgenerierung, die das Spiel auch sonst benutzt.
  var PANORAMA_SEEDS = [1337, 4242, 90210, 777, 20260813];

  Game.prototype.startPanorama = function () {
    if (this.started || this.panorama) return;
    // Hotbar, Lebensbalken und Fadenkreuz gehören nicht auf den Startbildschirm
    var hud = document.getElementById('hud');
    var kreuz = document.getElementById('crosshair');
    if (hud) hud.style.display = 'none';
    if (kreuz) kreuz.style.display = 'none';
    try {
      var seed = PANORAMA_SEEDS[(Math.random() * PANORAMA_SEEDS.length) | 0];
      this.seed = seed;
      this.worldSettings = MC.defaultWorldOpts();
      this.worlds = {};
      this.savedDims = null;
      this.dim = 'overworld';
      var w = this.dimWorld('overworld');
      this.world = w;
      this.particles = new MC.Particles(w);

      // Ein Aussichtspunkt, kein Spawnpunkt. Gesucht wird eine Stelle mit
      // Höhenunterschied ringsum – vom flachen Strand aus sieht man nur Nebel.
      // Nicht der höchste Gipfel – von dort sieht man nur Himmel, weil alles
      // ringsum tiefer liegt. Gesucht ist ein mäßig erhöhter Punkt mit Relief
      // in der Nachbarschaft, also eine Kuppe über einer bewegten Landschaft.
      var punkt = null, besteWucht = -1;
      var SEA = w.gen.sea;
      for (var v = 0; v < 60; v++) {
        var px = (v * 613) % 2400 - 1200, pz = (v * 977) % 2400 - 1200;
        var mitte = w.gen.heightAt(px, pz);
        if (mitte < SEA + 6 || mitte > SEA + 34) continue;
        var wucht = 0;
        for (var r = 0; r < 8; r++) {
          var a2 = r / 8 * Math.PI * 2;
          wucht += Math.abs(w.gen.heightAt(px + Math.cos(a2) * 45, pz + Math.sin(a2) * 45) - mitte);
        }
        if (wucht > besteWucht) { besteWucht = wucht; punkt = { x: px, z: pz, h: mitte }; }
      }
      if (!punkt) { var sp = w.gen.findSpawn(); punkt = { x: sp.x, z: sp.z, h: sp.y }; }
      var kam = new MC.Player(w, punkt.x + 0.5, punkt.h + 9, punkt.z + 0.5);
      kam.flying = true;
      // Leicht gesenkt, damit Land die untere Hälfte füllt und nicht Himmel
      kam.pitch = -0.20;
      this.player = kam;

      // Kleine Sichtweite, sonst frisst der Startbildschirm mehr als das Spiel
      this.panoDistanz = this.renderer.renderDistance;
      this.renderer.renderDistance = Math.max(this.panoDistanz, 7);
      this.ensureChunksAround(kam.x, kam.z, 2);
      this.time = 0;
      this.world.time = 0.33;          // Vormittag, Sonne hoch genug für Kontrast
      this.panorama = true;
    } catch (e) {
      this.panorama = false;
    }
  };

  Game.prototype.stopPanorama = function () {
    var hud = document.getElementById('hud');
    var kreuz = document.getElementById('crosshair');
    if (hud) hud.style.display = '';
    if (kreuz) kreuz.style.display = '';
    if (!this.panorama) return;
    this.panorama = false;
    if (this.panoDistanz) this.renderer.renderDistance = this.panoDistanz;
  };

  // Eigener, abgespeckter Takt: kein Spieler, keine Kreaturen, nur laden,
  // vernetzen, drehen, zeichnen.
  Game.prototype.tickPanorama = function (dt) {
    var p = this.player;
    if (!p) return;
    p.yaw += dt * 0.045;
    while (p.yaw > Math.PI) p.yaw -= Math.PI * 2;
    this.ensureChunksAround(p.x, p.z, false);
    this.buildMeshes(false);
    this.renderer.render(this, dt);
  };

  // ---------- Menü ----------
  Game.prototype.buildMenu = function () {
    var self = this;
    var m = document.getElementById('menu');
    this.menuEl = m;
    m.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'menubox';
    m.appendChild(box);
    this.menuBox = box;
    this.showMenu('main');

    document.getElementById('respawnbtn').addEventListener('click', function () {
      self.player.respawn(self);
      self.requestPointerLock();
    });
  };

  Game.prototype.showMenu = function (which) {
    var self = this;
    var box = this.menuBox;
    this.menuEl.style.display = 'flex';
    box.innerHTML = '';
    box.classList.remove('titel');
    var alteEcken = this.menuEl.querySelector('.mecken');
    if (alteEcken) alteEcken.remove();
    function h(txt, cls) { var e = document.createElement('div'); e.className = cls || 'mtitle'; e.innerHTML = txt; box.appendChild(e); return e; }
    function btn(txt, fn) {
      var b = document.createElement('button');
      b.className = 'mbtn'; b.textContent = txt;
      b.addEventListener('click', function () { self.audio.init(); self.audio.play('click'); fn(); });
      box.appendChild(b); return b;
    }

    if (which === 'main') {
      if (!this.newWorldSettings) this.newWorldSettings = MC.defaultWorldOpts();
      this.startPanorama();
      box.classList.add('titel');
      // Das Logo wird aus einer Blocktextur gefüllt, genau wie im Original –
      // wir haben die Texturen ohnehin prozedural im Speicher.
      var kopf = document.createElement('div'); kopf.className = 'mhead';
      kopf.appendChild(this.logoCanvas());
      var splash = document.createElement('div');
      splash.className = 'splash';
      splash.textContent = SPLASHES[(Math.random() * SPLASHES.length) | 0];
      kopf.appendChild(splash);
      box.appendChild(kopf);
      var row = document.createElement('div'); row.className = 'mrow'; box.appendChild(row);
      var seed = document.createElement('input');
      seed.className = 'minput'; seed.placeholder = 'Seed (optional)';
      seed.value = this.newWorldSeed || '';
      seed.addEventListener('input', function () { self.newWorldSeed = seed.value; });
      row.appendChild(seed);
      var modeSel = document.createElement('select');
      modeSel.className = 'minput';
      modeSel.innerHTML = '<option value="survival">Überleben</option><option value="creative">Kreativ</option>'
                       + '<option value="spectator">Zuschauer</option>';
      modeSel.value = this.newWorldMode || 'survival';
      modeSel.addEventListener('change', function () { self.newWorldMode = modeSel.value; });
      row.appendChild(modeSel);
      btn('Neue Welt erschaffen', function () { self.newWorld(seed.value.trim(), modeSel.value, self.newWorldSettings); });
      btn('Welt anpassen …', function () { self.showMenu('worldopts'); });
      if (this.hasSave()) btn('Welt laden', function () { self.loadWorld(); });
      btn('Steuerung & Ziele', function () { self.showMenu('help'); });
      // Die beiden Ecken unten wie im Original: links die Fassung, rechts der
      // Hinweis, dass das hier nichts mit Mojang zu tun hat.
      var ecke = document.createElement('div'); ecke.className = 'mecken';
      ecke.innerHTML = '<span>HTML Edition &nbsp;·&nbsp; Weltversion ' + MC.GEN_VERSION +
                       '</span><span>Ein Nachbau — nicht von Mojang</span>';
      this.menuEl.appendChild(ecke);
    } else if (which === 'worldopts') {
      this.buildWorldOpts(h, btn);
    } else if (which === 'pause') {
      h('Pause', 'mtitle');
      btn('Weiterspielen', function () { self.pause(false); });
      btn('Speichern', function () { self.saveWorld(); });
      btn('Vollbild: ' + (document.fullscreenElement ? 'an' : 'aus'), function () {
        self.toggleFullscreen(); setTimeout(function () { self.showMenu('pause'); }, 120);
      });
      btn('Sichtweite: ' + this.renderer.renderDistance, function () { self.cycleRenderDistance(); self.showMenu('pause'); });
      btn('Musik: ' + (this.audio.musicOn ? 'an' : 'aus'), function () { self.audio.musicOn = !self.audio.musicOn; self.showMenu('pause'); });
      btn('Lautstärke: ' + Math.round(this.audio.volume * 100) + '%', function () {
        var v = self.audio.volume + 0.2; if (v > 1.01) v = 0;
        self.audio.setVolume(v); self.showMenu('pause');
      });
      btn('Modus: ' + MC.MODUS_NAME[this.mode], function () {
        self.setMode(MC.MODI[(MC.MODI.indexOf(self.mode) + 1) % MC.MODI.length]);
        self.showMenu('pause');
      });
      btn('Welt exportieren (.json)', function () { self.exportWorld(); });
      btn('Welt importieren', function () { self.importWorld(); });
      btn('Steuerung', function () { self.showMenu('help'); });
      btn('Hauptmenü', function () { self.saveWorld(); self.started = false; self.showMenu('main'); });
    } else if (which === 'help') {
      h('Steuerung', 'mtitle');
      var d = document.createElement('div');
      d.className = 'mhelp';
      d.innerHTML = [
        '<b>W A S D</b> Bewegen &nbsp; <b>Leertaste</b> Springen &nbsp; <b>Shift</b> Schleichen',
        '<b>Strg</b> oder <b>Doppel-W</b> Sprinten &nbsp; <b>Maus</b> Umsehen',
        '<b>Links</b> Abbauen/Angreifen &nbsp; <b>Rechts</b> Platzieren/Benutzen/Handeln',
        '<b>Mausrad-Klick</b> Block aufnehmen &nbsp; <b>1–9 / Mausrad</b> Hotbar &nbsp; <b>E</b> Inventar',
        '<b>Q</b> oder <b>Klick neben das Inventar</b> Item wegwerfen',
        '<b>F3</b> Debug &nbsp; <b>F</b> Sichtweite &nbsp; <b>P</b> Spielmodus &nbsp; <b>J</b> Musik &nbsp; <b>R</b> Speichern',
        '<b>Doppel-Leertaste</b> Fliegen (Kreativ) &nbsp; <b>M</b> oder <b>Esc</b> Pausenmenü',
        'Am Mac fängt der Browser <b>Esc</b> oft selbst ab — dann <b>M</b> nehmen.',
        '<hr>',
        '<b>Ziel:</b> Holz schlagen → Bretter → Werkbank → Werkzeuge → Stein → Erze →',
        'Ofen bauen, Essen braten, Rüstung schmieden, Nacht überleben, bauen.',
        '<hr>',
        '<b>Nether:</b> Obsidianrahmen 4×5 mit dem <b>Feuerzeug</b> zünden.',
        'Dort Bastionen suchen — nur sie haben <b>Glowstone</b>.',
        '<b>Aether:</b> derselbe Rahmen aus <b>Glowstone</b>, mit einem <b>Eimer Wasser</b> fluten.',
        '<b>Das Ende:</b> der <b>Gravitithelm</b> zeigt oben einen Kompass zur',
        'vergrabenen Festung. Zwölf <b>Enderaugen</b> in die Rahmenblöcke setzen',
        '(Lohenrute → Lohenstaub + Enderperle), dann den Drachen erlegen —',
        'erst danach führt ein Portal zurück.',
        '<b>Lohen</b> gibt es nur an den Bastionen im Nether, <b>Endermen</b> nachts',
        'in der Oberwelt, im Nether und im Ende. Endermen bleiben friedlich,',
        'bis man ihnen ins Gesicht sieht.',
        '<b>Enderperle</b> werfen: man landet dort, wo sie aufschlägt.',
        '<hr>',
        '<b>Kompass</b> (4 Eisen + Redstone): zeigt Himmelsrichtung und Koordinaten.',
        '<b>Redstone:</b> Staub legt Leitungen (15 Blöcke Reichweite), <b>Hebel</b> und',
        '<b>Knopf</b> schalten, die <b>Druckplatte</b> reagiert auf Schritte. Der',
        '<b>Verstärker</b> frischt das Signal auf und verzögert es (Rechtsklick).',
        'Die <b>Redstonefackel</b> ist an, solange ihr Block kein Signal hat.',
        'Verbraucher: Lampe, Eisentür, Zauntor, TNT.',
        '<hr>',
        '<b>Rezeptbuch</b> und <b>Erfolge</b>: die zwei Knöpfe im Inventar.'
      ].join('<br>');
      box.appendChild(d);
      btn('Zurück', function () { self.showMenu(self.started ? 'pause' : 'main'); });
    }
  };

  // ---------- Welt anpassen ----------
  var OPT_LABELS = {
    mountains: ['flach', 'normal', 'sehr bergig'],
    caves: ['keine', 'normal', 'durchlöchert'],
    biomeSize: ['klein', 'normal', 'riesig'],
    vegetation: ['karg', 'normal', 'überwuchert'],
    ores: ['selten', 'normal', 'reichlich']
  };

  function optText(spec, v) {
    if (spec.key === 'seaLevel') return 'Y ' + Math.round(v);
    var lab = OPT_LABELS[spec.key];
    var pct = Math.round(v * 100) + ' %';
    if (!lab) return pct;
    var word = Math.abs(v - 1) < 0.05 ? lab[1] : (v < 1 ? lab[0] : lab[2]);
    return pct + ' — ' + word;
  }

  Game.prototype.buildWorldOpts = function (h, btn) {
    var self = this;
    var box = this.menuBox;
    var opts = this.newWorldSettings;
    h('Welt anpassen', 'mtitle');

    MC.WORLD_OPTS.forEach(function (spec) {
      var rowEl = document.createElement('div');
      rowEl.className = 'optrow';
      box.appendChild(rowEl);
      var lbl = document.createElement('label');
      lbl.className = 'optlabel';
      lbl.textContent = spec.title;
      rowEl.appendChild(lbl);

      if (spec.kind === 'choice') {
        var sel = document.createElement('select');
        sel.className = 'minput optctl';
        spec.options.forEach(function (p) {
          var o = document.createElement('option');
          o.value = p[0]; o.textContent = p[1];
          sel.appendChild(o);
        });
        sel.value = opts[spec.key];
        sel.addEventListener('change', function () { opts[spec.key] = sel.value; });
        rowEl.appendChild(sel);
      } else if (spec.kind === 'bool') {
        var b = document.createElement('button');
        b.className = 'mbtn optctl';
        b.textContent = opts[spec.key] ? 'An' : 'Aus';
        b.addEventListener('click', function () {
          opts[spec.key] = !opts[spec.key];
          b.textContent = opts[spec.key] ? 'An' : 'Aus';
        });
        rowEl.appendChild(b);
      } else {
        var sl = document.createElement('input');
        sl.type = 'range'; sl.className = 'optslider';
        sl.min = spec.min; sl.max = spec.max; sl.step = spec.step;
        sl.value = opts[spec.key];
        var val = document.createElement('span');
        val.className = 'optvalue';
        val.textContent = optText(spec, opts[spec.key]);
        sl.addEventListener('input', function () {
          opts[spec.key] = +sl.value;
          val.textContent = optText(spec, opts[spec.key]);
        });
        rowEl.appendChild(sl);
        rowEl.appendChild(val);
      }
    });

    var hint = document.createElement('div');
    hint.className = 'mfoot';
    hint.innerHTML = 'Gilt nur für neue Welten. Die Einstellungen werden im Spielstand mitgespeichert.';
    box.appendChild(hint);

    btn('Zurücksetzen', function () { self.newWorldSettings = MC.defaultWorldOpts(); self.showMenu('worldopts'); });
    btn('Übernehmen', function () { self.showMenu('main'); });
  };

  Game.prototype.hideMenu = function () { this.menuEl.style.display = 'none'; };

  // ---------- Speichern ----------
  Game.prototype.collectSave = function () {
    var dims = {};
    for (var d in this.worlds) {
      var w = this.worlds[d];
      if (!w.savedChunks) w.savedChunks = {};
      for (var i = 0; i < w.chunkList.length; i++) {
        var c = w.chunkList[i];
        if (c.modified) w.savedChunks[c.cx + ',' + c.cz] = c.modified;
      }
      dims[d] = { chunks: w.savedChunks, tileEntities: w.tileEntities, time: w.time };
    }
    return {
      version: 3,
      seed: this.seed,
      settings: this.worldSettings,
      time: this.world.time,
      mode: this.mode,
      dim: this.dim,
      endState: this.endState,
      achievements: this.achievements,
      player: this.player.serialize(),
      dims: dims
    };
  };

  Game.prototype.saveWorld = function () {
    if (!this.started) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.collectSave()));
      this.ui.toast('Welt gespeichert');
    } catch (err) {
      this.ui.toast('Speichern fehlgeschlagen — nutze „Welt exportieren"');
    }
  };

  Game.prototype.hasSave = function () {
    try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
  };

  Game.prototype.loadWorld = function () {
    var data;
    try { data = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { }
    if (!data) { this.ui.toast('Kein Spielstand gefunden'); return; }
    this.stopPanorama();
    this.applySave(data);
  };

  Game.prototype.applySave = function (data) {
    var self = this;
    this.mode = data.mode || 'survival';
    this.seed = data.seed >>> 0;
    // `|| {}` ist wichtig: ein Spielstand ganz ohne Einstellungen ist alt und
    // muss den alten Generator behalten, sonst steht sein Haus im Nichts.
    this.worldSettings = MC.normalizeWorldOpts(data.settings || {});
    // Spielstände vor Version 3 kannten nur die Oberwelt
    this.savedDims = data.dims || {
      overworld: { chunks: data.chunks || {}, tileEntities: data.tileEntities || {}, time: data.time }
    };
    this.worlds = {};
    this.endState = data.endState || { dragonDead: false };
    this.achievements = data.achievements || {};
    this.dim = (data.dim && MC.Dim.TITLE[data.dim]) ? data.dim : 'overworld';
    this.world = this.dimWorld(this.dim);
    if (data.time !== undefined && this.dim === 'overworld') this.world.time = data.time;
    this.particles = new MC.Particles(this.world);

    this.player = new MC.Player(this.world, 0, 80, 0);
    this.player.load(data.player);
    var keys = Object.keys(this.renderer.chunkMeshes);
    for (var ki = 0; ki < keys.length; ki++) {
      var kp = keys[ki].split(',');
      this.renderer.dropChunk({ cx: +kp[0], cz: +kp[1] });
    }
    this.ensureChunksAround(this.player.x, this.player.z, 2);
    this.started = true;
    this.paused = false;
    this.ui.hideDeath();
    this.hideMenu();
    this.audio.init();
    this.requestPointerLock();
    this.ui.updateHotbar();
    this.ui.toast('Welt geladen');
  };

  Game.prototype.exportWorld = function () {
    var data = JSON.stringify(this.collectSave());
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'minecraft-welt-' + this.world.seed + '.json';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    this.ui.toast('Welt exportiert');
  };

  Game.prototype.importWorld = function () {
    var self = this;
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.addEventListener('change', function () {
      var f = inp.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try { self.applySave(JSON.parse(fr.result)); }
        catch (e) { self.ui.toast('Datei konnte nicht gelesen werden'); }
      };
      fr.readAsText(f);
    });
    inp.click();
  };

  // ---------- Hauptschleife ----------
  Game.prototype.loop = function (now) {
    requestAnimationFrame(this.loop);
    var dt = Math.min(0.1, (now - (this.lastTime || now)) / 1000);
    this.lastTime = now;
    this.time += dt;
    this.fps = this.fps * 0.92 + (1 / Math.max(0.0001, dt)) * 0.08;

    if (!this.started) {
      if (this.panorama) this.tickPanorama(dt);
      return;
    }

    var input = this.input;
    var p = this.player;

    // Maus
    if (input.locked && !this.ui.isOpen() && !this.paused && !p.dead) {
      p.yaw -= input.dx * this.sensitivity;
      p.pitch += input.dy * this.sensitivity;
      p.pitch = U.clamp(p.pitch, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
      while (p.yaw > Math.PI) p.yaw -= Math.PI * 2;
      while (p.yaw < -Math.PI) p.yaw += Math.PI * 2;
    }
    input.dx = 0; input.dy = 0;

    if (input.wheel !== 0 && !this.ui.isOpen()) {
      var d = input.wheel > 0 ? 1 : -1;
      p.inventory.selected = (p.inventory.selected + d + 9) % 9;
      this.ui.updateHotbar();
      input.wheel = 0;
    }

    if (!this.paused && !this.ui.isOpen()) {
      this.tickCount++;
      p.update(dt, input, this);
      this.updateTarget();
      this.handleMining(dt);
      this.handleUseHold(dt);

      // Entities
      var ents = this.world.entities;
      for (var i = ents.length - 1; i >= 0; i--) {
        var e = ents[i];
        if (e.dead) { ents.splice(i, 1); continue; }
        e.update(dt, this);
      }
      MC.Spawner.tick(this, dt);
      // Im Ende sorgt ein eigener Takt dafür, dass Kristalle und Drache stehen,
      // sobald die Chunks um die Insel geladen sind
      if (this.dim === 'the_end') {
        this.endTimer = (this.endTimer || 0) + dt;
        if (this.endTimer > 1) { this.endTimer = 0; MC.End.tick(this); }
      }
      this.particles.update(dt);
      this.world.update(dt, p.x, p.y, p.z);
      if ((this.tickCount % 4) === 0) this.tickFurnaces();
      if (MC.Effekte) MC.Effekte.tickStand(this);
      // Druckplatten und gedrückte Knöpfe
      if ((this.tickCount % 4) === 0) MC.Redstone.tickPlates(this);
      if (MC.Caves) { MC.Caves.tick(this, dt); MC.Caves.waechter(this, dt); }
      MC.Redstone.tickButtons(this, dt);
      this.achTimer = (this.achTimer || 0) + dt;
      if (this.achTimer > 1) { this.achTimer = 0; MC.Achievements.checkArmor(this); }

      this.checkPortal(dt);
      this.camBob = Math.sin(p.bobPhase * 2) * 0.022 * (p.sprinting ? 1.4 : 1);
      if (this.damageFlash > 0) this.damageFlash -= dt * 2;
      if (this.camShake > 0) this.camShake -= dt * 2;

      this.autoSaveTimer += dt;
      if (this.autoSaveTimer > 120) { this.autoSaveTimer = 0; this.saveWorld(); }
      this.audio.tickMusic(dt);
      this.ambientParticles(dt);
      this.biomParticles(dt);
    }

    // Hotbar nur neu zeichnen, wenn sich tatsächlich etwas geändert hat
    var sig = p.inventory.selected + '|';
    for (var hi = 0; hi < 9; hi++) {
      var hs = p.inventory.slots[hi];
      sig += hs ? (hs.id + ':' + hs.count + ':' + (hs.dur === undefined ? '-' : hs.dur)) : '.';
      sig += ',';
    }
    if (sig !== this._hotbarSig) { this._hotbarSig = sig; this.ui.updateHotbar(); }

    this.ensureChunksAround(p.x, p.z, false);
    this.buildMeshes(false);
    this.renderer.render(this, dt);
    this.ui.updateHUD();
    this.ui.updateDebug();
    if (this.ui.open === 'furnace') this.refreshFurnaceUI();
    if (this.ui.open === 'brew') { this.ui.refreshBrewUI(); this.ui.refreshSlots(); }
  };

  // Steht der Spieler im Portal? Nach kurzem Verweilen geht es hinüber.
  Game.prototype.checkPortal = function (dt) {
    var p = this.player, w = this.world;
    if (p.portalCd > 0) { p.portalCd -= dt; }
    var b = B.byId[w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.6), Math.floor(p.z))];
    var inPortal = b && (b.shape === B.SHAPE_PORTAL || b.shape === B.SHAPE_PORTAL_FLAT);
    if (!inPortal) { p.portalTime = 0; return; }
    if (p.portalCd > 0) return;
    p.portalTime = (p.portalTime || 0) + dt;
    if ((this.tickCount % 3) === 0) this.particles.crit(p.x, p.y + 1, p.z);
    if (p.portalTime > 0.7) {
      p.portalTime = 0;
      this.usePortal(b.portal);
    }
  };

  // Was in der Luft liegt: Asche im Basaltdelta, Sporen in den Pilzwäldern,
  // Flirren über den Frostspitzen. Kostet fast nichts und macht mehr aus als
  // ein weiterer Blocktyp.
  Game.prototype.biomParticles = function (dt) {
    var w = this.world, p = this.player;
    if (!MC.Dim || w.gen.genV < 3) return;
    if (w.dim !== 'nether' && w.dim !== 'aether') return;
    this.biomTimer = (this.biomTimer || 0) + dt;
    if (this.biomTimer < 0.12) return;
    this.biomTimer = 0;
    var st = MC.Dim.stimmung(w, Math.floor(p.x), Math.floor(p.z));
    if (!st) return;
    var NB = MC.Dim.NETHER_BIOME, AB = MC.Dim.AETHER_BIOME;
    var n = 0, art = null;
    if (w.dim === 'nether') {
      if (st.key === NB.DELTA) { n = 6; art = 'asche'; }
      else if (st.key === NB.CRIMSON || st.key === NB.WARPED) { n = 4; art = 'sporen'; }
      else if (st.key === NB.SOUL) { n = 3; art = 'seelen'; }
    } else {
      if (st.key === AB.FROST) { n = 4; art = 'frost'; }
      else if (st.key === AB.HAIN) { n = 3; art = 'gold'; }
      else if (st.key === AB.FLUGSAND) { n = 3; art = 'sand'; }
    }
    if (!n) return;
    for (var i = 0; i < n; i++) {
      var x = p.x + (Math.random() - 0.5) * 22;
      var y = p.y + 1 + (Math.random() - 0.4) * 10;
      var z = p.z + (Math.random() - 0.5) * 22;
      if (art === 'asche') this.particles.smoke(x, y, z, 1);
      else if (art === 'seelen') this.particles.splash(x, y, z, 1);
      else this.particles.crit(x, y, z);
    }
  };

  // Flammen und Rauch an Fackeln, Feuer und Lava in der Nähe
  Game.prototype.ambientParticles = function (dt) {
    this.ambTimer = (this.ambTimer || 0) + dt;
    if (this.ambTimer < 0.09) return;
    this.ambTimer = 0;
    var w = this.world, p = this.player;
    var torchId = B.id('torch'), fireId = B.id('fire'), lavaId = B.id('lava');
    for (var i = 0; i < 26; i++) {
      var x = Math.floor(p.x) + ((Math.random() * 25) | 0) - 12;
      var y = Math.floor(p.y) + ((Math.random() * 15) | 0) - 7;
      var z = Math.floor(p.z) + ((Math.random() * 25) | 0) - 12;
      var id = w.getBlock(x, y, z);
      if (id === torchId) {
        var att = B.torchAttach(w.getMeta(x, y, z));
        var tfx = x + 0.5, tfy = y + 0.62, tfz = z + 0.5;
        if (att) { tfx += att[0] * 0.17; tfz += att[1] * 0.17; tfy = y + 0.82; }
        if (Math.random() < 0.35) this.particles.flame(tfx, tfy, tfz, 1);
        if (Math.random() < 0.12) this.particles.smoke(tfx, tfy + 0.06, tfz, 1);
      } else if (id === fireId) {
        this.particles.flame(x + 0.5, y + 0.3, z + 0.5, 2);
        if (Math.random() < 0.3) this.particles.smoke(x + 0.5, y + 0.8, z + 0.5, 1);
      } else if (id === lavaId && Math.random() < 0.06) {
        this.particles.flame(x + 0.5, y + 0.9, z + 0.5, 1);
      }
    }
  };

  Game.prototype.handleMining = function (dt) {
    var p = this.player;
    if (!this.input.mouse[0] || this.player.dead) { this.mining = null; return; }
    if (!this.target) { this.mining = null; return; }
    if (this.targetEntity) return;
    var t = this.target;
    if (!this.mining || this.mining.x !== t.x || this.mining.y !== t.y || this.mining.z !== t.z) {
      this.startMining();
      if (!this.mining) return;
    }
    p.swingTime = Math.max(p.swingTime, 0.35);
    var b = B.byId[t.id];
    var st = p.inventory.selectedStack();
    var time = I.breakTime(st ? st.id : null, b, st);
    // Unter Wasser gräbt man wie im Original fünfmal so langsam – dagegen hilft
    // ein Helm mit Wasseraffinität.
    if (p.headInWater && !MC.Ench.stufe(p.inventory.armor[0], 'aqua_affinity')) time *= 5;
    if (time === Infinity) return;
    this.mining.progress += dt / Math.max(0.001, time);
    this.miningSoundTimer = (this.miningSoundTimer || 0) + dt;
    if (this.miningSoundTimer > 0.28) {
      this.miningSoundTimer = 0;
      this.audio.dig(b.sound);
      var n = MC.NEI[t.face];
      this.particles.blockHit(t.x, t.y, t.z, t.id, this.world.getMeta(t.x, t.y, t.z), n[0], n[1], n[2]);
    }
    if (this.mining.progress >= 1) this.breakBlock(t.x, t.y, t.z);
  };

  Game.prototype.handleUseHold = function (dt) {
    var p = this.player;
    if (!this.input.mouse[2]) { this.bowCharge = 0; this.eating = false; p.eatTime = 0; return; }
    var st = p.inventory.selectedStack();
    var it = st ? I.get(st.id) : null;
    if (this.bowCharge > 0) { this.bowCharge = Math.min(1.6, this.bowCharge + dt); return; }
    if (this.eating && it && it.food) {
      p.eatTime -= dt;
      if ((this.tickCount % 6) === 0) this.particles.crit(p.x, p.eyeY() - 0.4, p.z);
      if (p.eatTime <= 0) { p.eat(this); this.eating = false; }
    }
  };

  function overlapAABB(ax0, ay0, az0, ax1, ay1, az1, bx0, by0, bz0, bx1, by1, bz1) {
    return ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0 && az0 < bz1 && az1 > bz0;
  }

  // ---------- Start ----------
  window.addEventListener('load', function () {
    var loading = document.getElementById('loading');
    try {
      var game = new Game();
      MC.game = game;
      game.init();
      loading.style.display = 'none';
    } catch (err) {
      loading.innerHTML = '<div class="err"><h2>Start fehlgeschlagen</h2><p>' + err.message + '</p>' +
        '<p>Diese App benötigt einen Browser mit WebGL2 (Chrome, Edge, Firefox).</p></div>';
      console.error(err);
    }
  });

})();
