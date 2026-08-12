/* ============================================================
   player.js  -  Inventar + Spieler (Bewegung, Überleben, Interaktion)
   ============================================================ */
(function () {
  'use strict';

  var B = MC.Blocks, I = MC.Items, U = MC.U, P = MC.Physics;

  // ============================================================
  //  Inventar
  // ============================================================
  function Inventory(size) {
    this.size = size || 36;
    this.slots = new Array(this.size);
    for (var i = 0; i < this.size; i++) this.slots[i] = null;
    this.armor = [null, null, null, null];
    this.selected = 0;
  }
  MC.Inventory = Inventory;

  Inventory.prototype.get = function (i) { return this.slots[i]; };
  Inventory.prototype.set = function (i, s) { this.slots[i] = s; };
  Inventory.prototype.selectedStack = function () { return this.slots[this.selected]; };

  // fügt hinzu, gibt Rest zurück
  Inventory.prototype.add = function (stack) {
    if (!stack) return 0;
    var max = I.stackMax(stack.id);
    var i;
    if (max > 1 && !stack.ench) {
      for (i = 0; i < this.size; i++) {
        var s = this.slots[i];
        if (s && s.id === stack.id && s.dur === undefined && !s.ench && s.count < max) {
          var can = Math.min(max - s.count, stack.count);
          s.count += can; stack.count -= can;
          if (stack.count <= 0) return 0;
        }
      }
    }
    for (i = 0; i < this.size; i++) {
      if (!this.slots[i]) {
        var put = Math.min(max, stack.count);
        // Kopie über I.copyStack: sonst ginge beim Aufheben jede Verzauberung
        // und jede Amboss-Vorarbeit verloren
        this.slots[i] = I.copyStack(stack, put);
        stack.count -= put;
        if (stack.count <= 0) return 0;
      }
    }
    return stack.count;
  };

  Inventory.prototype.count = function (id) {
    var n = 0;
    for (var i = 0; i < this.size; i++) if (this.slots[i] && this.slots[i].id === id) n += this.slots[i].count;
    return n;
  };

  // Entfernt n Stück eines Items; gibt false zurück, wenn nicht genug da ist
  Inventory.prototype.remove = function (id, n) {
    if (this.count(id) < n) return false;
    for (var i = 0; i < this.size && n > 0; i++) {
      var s = this.slots[i];
      if (!s || s.id !== id) continue;
      var take = Math.min(s.count, n);
      s.count -= take; n -= take;
      if (s.count <= 0) this.slots[i] = null;
    }
    return true;
  };

  Inventory.prototype.consumeSelected = function (n) {
    var s = this.slots[this.selected];
    if (!s) return false;
    s.count -= (n || 1);
    if (s.count <= 0) this.slots[this.selected] = null;
    return true;
  };

  Inventory.prototype.damageSelected = function (n, game) {
    var s = this.slots[this.selected];
    if (!s || s.dur === undefined) return;
    if (game && game.mode === 'creative') return;
    // Haltbarkeit: mit der Verzauberung geht nur noch ein Bruchteil der
    // Schläge auf das Werkzeug
    if (MC.Ench && !MC.Ench.verbraucht(s, false)) return;
    s.dur -= (n || 1);
    if (s.dur <= 0) {
      this.slots[this.selected] = null;
      if (game) game.audio.play('break_tool');
    }
  };

  Inventory.prototype.damageArmor = function (n, game) {
    for (var i = 0; i < 4; i++) {
      var a = this.armor[i];
      if (!a || a.dur === undefined) continue;
      if (game && game.mode === 'creative') continue;
      if (MC.Ench && !MC.Ench.verbraucht(a, true)) continue;
      a.dur -= n;
      if (a.dur <= 0) { this.armor[i] = null; if (game) game.audio.play('break_tool'); }
    }
  };

  Inventory.prototype.defense = function () {
    var d = 0;
    for (var i = 0; i < 4; i++) {
      var a = this.armor[i];
      if (!a) continue;
      var it = I.get(a.id);
      if (it && it.armor) d += it.armor.defense;
    }
    return d;
  };

  // ============================================================
  //  Detektorhelm
  // ============================================================
  // Wonach der Helm sucht. Bewusst nur das, wofür sich das Graben lohnt – Kohle
  // und Eisen liegen überall herum und würden den Puls entwerten.
  var DETEKTOR_ERZE = ['diamond_ore', 'emerald_ore', 'gold_ore', 'lapis_ore', 'redstone_ore',
                       'ambrosium_ore', 'zanite_ore', 'gravitite_ore', 'quartz_ore'];
  var DETEKTOR_TAKT = 30;      // Sekunden zwischen zwei Peilungen
  var DETEKTOR_R = 20;         // Blöcke Reichweite
  var detektorIds = null;

  // Nächstes lohnendes Erz im Umkreis; liefert den Abstand oder -1
  function detektorSuche(world, px, py, pz) {
    if (!detektorIds) {
      detektorIds = {};
      for (var i = 0; i < DETEKTOR_ERZE.length; i++) {
        var id = B.id(DETEKTOR_ERZE[i]);
        if (id) detektorIds[id] = true;
      }
    }
    var best = -1, r = DETEKTOR_R, r2 = r * r;
    var x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz);
    for (var dy = -r; dy <= r; dy++) {
      var wy = y0 + dy;
      if (wy < 0 || wy >= MC.WORLD_HEIGHT) continue;
      for (var dz = -r; dz <= r; dz++) {
        for (var dx = -r; dx <= r; dx++) {
          var d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > r2) continue;
          if (best >= 0 && d2 >= best) continue;
          if (detektorIds[world.getBlock(x0 + dx, wy, z0 + dz)]) best = d2;
        }
      }
    }
    return best < 0 ? -1 : Math.sqrt(best);
  }

  function tickDetektor(p, game, dt) {
    p.detektorCd = (p.detektorCd === undefined) ? 2 : p.detektorCd - dt;
    p.detektorPuls = Math.max(0, (p.detektorPuls || 0) - dt);
    if (p.detektorCd > 0) return;
    p.detektorCd = DETEKTOR_TAKT;
    var d = detektorSuche(p.world, p.x, p.y + 0.5, p.z);
    if (d < 0) return;
    // Je näher, desto kräftiger der Impuls – ganz nah volle Stärke, am Rand kaum
    p.detektorStaerke = Math.max(0.15, 1 - d / DETEKTOR_R);
    p.detektorPuls = 1.6;
    game.audio.play('click');
  }

  // Trägt der Spieler dieses Rüstungsteil? slot 0=Helm 1=Brust 2=Hose 3=Schuhe
  Inventory.prototype.wears = function (mat, slot) {
    var a = this.armor[slot];
    return !!(a && a.id === mat + '_' + ARMOR_PIECE[slot]);
  };
  Inventory.prototype.armorSetCount = function (mat) {
    var n = 0;
    for (var i = 0; i < 4; i++) if (this.wears(mat, i)) n++;
    return n;
  };
  var ARMOR_PIECE = ['helmet', 'chestplate', 'leggings', 'boots'];

  Inventory.prototype.clear = function () {
    for (var i = 0; i < this.size; i++) this.slots[i] = null;
    this.armor = [null, null, null, null];
  };

  Inventory.prototype.serialize = function () {
    return { slots: this.slots, armor: this.armor, selected: this.selected };
  };
  Inventory.prototype.load = function (d) {
    if (!d) return;
    for (var i = 0; i < this.size; i++) this.slots[i] = (d.slots && d.slots[i]) || null;
    this.armor = d.armor || [null, null, null, null];
    this.selected = d.selected || 0;
  };

  // ============================================================
  //  Spieler
  // ============================================================
  function Player(world, x, y, z) {
    this.world = world;
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.yaw = 0; this.pitch = 0;
    this.width = 0.6; this.height = 1.8;
    this.eyeHeight = 1.62;
    this.onGround = false;
    this.collidedH = false;
    this.flying = false;
    this.sprinting = false;
    this.sneaking = false;
    this.inWater = false;
    this.type = 'player';

    this.health = 20; this.maxHealth = 20;
    this.food = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = 10; this.maxAir = 10;
    this.xp = 0; this.level = 0;
    this.dead = false;
    this.hurtTime = 0;
    this.fallStart = null;
    this.regenTimer = 0; this.starveTimer = 0;
    this.walkTime = 0;
    this.bobPhase = 0;
    this.swingTime = 0;
    this.eatTime = 0;
    this.attackCd = 0;
    this.spawnPoint = { x: x, y: y, z: z };

    this.inventory = new Inventory(36);
    this.mining = null;
    this.placeCd = 0;
    this.breakCd = 0;
    this.lastDamageSource = null;
    this.portalCd = 0;
    this.portalTime = 0;
  }
  MC.Player = Player;
  Player.detektorSuche = detektorSuche;   // für Tests und die Anzeige greifbar

  Player.prototype.eyeY = function () {
    return this.y + (this.sneaking ? this.eyeHeight - 0.18 : this.eyeHeight);
  };

  Player.prototype.lookDir = function () { return U.dirFromAngles(this.yaw, this.pitch); };

  // ---------- Update ----------
  Player.prototype.update = function (dt, input, game) {
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.swingTime > 0) this.swingTime -= dt * 3.2;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.placeCd > 0) this.placeCd -= dt;
    if (this.breakCd > 0) this.breakCd -= dt;
    if (this.pearlCd > 0) this.pearlCd -= dt;

    if (this.dead) { this.vx = this.vz = 0; return; }

    var world = this.world;
    this.inWater = P.inLiquid(world, this, 'water');
    var inLava = P.inLiquid(world, this, 'lava');
    var creative = game.mode === 'creative';

    // ---- Eingabe -> Bewegung ----
    var fwd = 0, side = 0;
    if (input.key('KeyW')) fwd += 1;
    if (input.key('KeyS')) fwd -= 1;
    if (input.key('KeyA')) side -= 1;
    if (input.key('KeyD')) side += 1;
    this.sneaking = input.key('ShiftLeft') || input.key('ShiftRight');
    var wantSprint = input.key('ControlLeft') || input.sprintToggle;
    this.sprinting = wantSprint && fwd > 0 && !this.sneaking && (creative || this.food > 6);

    // Block unter den Füßen: Seelensand bremst, blaue Wolken federn,
    // goldene Wolken fangen den Sturz ab
    var groundB = B.byId[world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z))];

    // Gravititrüstung: jedes Teil bringt eine eigene Eigenschaft mit
    var inv = this.inventory;
    this.gravHelm = inv.wears('gravitite', 0);
    this.gravChest = inv.wears('gravitite', 1);
    this.gravLegs = inv.wears('gravitite', 2);
    this.gravBoots = inv.wears('gravitite', 3);
    this.gravFull = this.gravHelm && this.gravChest && this.gravLegs && this.gravBoots;

    // Detektorhelm: peilt in festem Takt die Umgebung an
    var helm = inv.armor[0];
    if (MC.Effekte) MC.Effekte.tick(this, game, dt);
    this.detektor = !!(helm && helm.id === 'detector_helmet');
    if (this.detektor) tickDetektor(this, game, dt); else this.detektorPuls = 0;

    var speed = 4.317;
    if (this.sprinting) speed = 5.6;
    if (this.sneaking && !this.flying) speed = 1.45;
    if (this.flying) speed = this.sprinting ? 21 : 10.5;
    if (this.inWater && !this.flying) speed *= 0.62;
    if (this.onGround && !this.flying && groundB && groundB.slow) speed *= (1 - groundB.slow);
    // In einer Spinnwebe kommt man kaum vorwärts – anders als Seelensand
    // bremst sie, wenn man drinsteckt, nicht wenn man darauf steht.
    var drin = B.byId[world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.6), Math.floor(this.z))];
    this.inWebe = !!(drin && drin.name === 'cobweb');
    if (this.inWebe && !this.flying) { speed *= 0.22; if (this.vy < 0) this.vy = Math.max(this.vy, -1.2); }
    if (this.gravLegs && !this.flying) speed *= 1.28;   // Hose: leichtfüßig
    if (MC.Effekte) {
      speed *= 1 + 0.2 * MC.Effekte.stufe(this, 'schnelligkeit');
      speed *= 1 - Math.min(0.7, 0.22 * MC.Effekte.stufe(this, 'langsamkeit'));
    }

    var len = Math.sqrt(fwd * fwd + side * side);
    var wx = 0, wz = 0;
    if (len > 0) {
      fwd /= len; side /= len;
      // vorwärts = (sin yaw, cos yaw), rechts = (-cos yaw, sin yaw)
      var sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
      wx = (sy * fwd - cy * side);
      wz = (cy * fwd + sy * side);
    }

    if (this.flying) {
      var vy = 0;
      if (input.key('Space')) vy += 1;
      if (this.sneaking) vy -= 1;
      this.vx = wx * speed; this.vz = wz * speed;
      this.vy = vy * speed * 0.8;
      P.move(world, this, this.vx * dt, this.vy * dt, this.vz * dt);
      this.fallStart = null;
    } else {
      var accel = this.onGround ? 42 : 12;
      this.vx += wx * speed * accel * dt;
      this.vz += wz * speed * accel * dt;
      var hv = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
      if (hv > speed) { this.vx = this.vx / hv * speed; this.vz = this.vz / hv * speed; }

      // Ein Sprung darf nicht daran scheitern, dass der Tastendruck einen Sekunden-
      // bruchteil zu früh oder der Bodenkontakt einen einzigen Frame zu kurz kam.
      // Darum zählt der Boden kurz nach der Kante noch, und ein Druck kurz vor der
      // Landung wird nachgeholt. Genau diese beiden Fälle fühlen sich sonst an, als
      // hätte das Spiel den Sprung verschluckt.
      this.coyote = this.onGround ? 0.12 : Math.max(0, (this.coyote || 0) - dt);
      this.jumpBuffer = input.key('Space') ? 0.16 : Math.max(0, (this.jumpBuffer || 0) - dt);

      // Springen / Schwimmen
      if (input.key('Space') || this.jumpBuffer > 0) {
        // Im Wasser gibt es keinen Sprung, sondern Auftrieb mit Deckel. Mit
        // einem harten Impuls konnte man sich über die Oberfläche hinaus
        // hochtippen und trockenen Fußes über einen See laufen.
        if (this.inWater) {
          // An einer Kante darf man sich herausziehen, sonst nicht
          if (!input.key('Space')) { /* nur der echte Tastendruck treibt auf */ }
          else {
            var maxAuf = this.collidedH ? 4.6 : 2.8;
            this.vy = Math.min(this.vy + 24 * dt, maxAuf);
          }
        }
        else if (this.onGround || this.coyote > 0) {
          // Brustpanzer aus Gravitit hebt einen deutlich höher
          this.vy = this.gravChest ? 13.4 : 8.85;   // sonst ~1,2 Blöcke wie im Original
          // Sprungkraft legt je Stufe gut einen halben Block drauf
          if (MC.Effekte) this.vy += 1.6 * MC.Effekte.stufe(this, 'sprungkraft');
          this.coyote = 0; this.jumpBuffer = 0;
          this.exhaust(this.sprinting ? 0.2 : 0.05);
          if (this.gravChest) game.particles.crit(this.x, this.y + 0.2, this.z);
        } else if (input.key('Space') && this.gravFull && this.vy < 0 && !this.doubleJumped) {
          // Voller Satz: ein einziger Sprung mitten in der Luft
          this.doubleJumped = true;
          this.vy = 10.5;
          this.fallStart = null;
          game.particles.crit(this.x, this.y + 0.4, this.z);
          game.audio.play('pop');
        }
      }
      if (this.onGround) this.doubleJumped = false;

      this.vy -= (this.inWater ? 9 : 32) * dt;
      if (this.inWater && this.vy < -3) this.vy = -3;
      if (this.vy < -78) this.vy = -78;

      this.onLadder = this.checkLadder();

      var beforeY = this.y;
      var sneakGuard = this.sneaking && this.onGround;
      var oldX = this.x, oldZ = this.z, oldY = this.y;
      // Auf dem Boden automatisch eine halbe Stufe hochsteigen (Stufen, Treppen,
      // Ackerboden). Beim Schleichen und in der Luft bleibt es beim reinen Zug.
      if (this.onGround) P.moveWithStep(world, this, this.vx * dt, this.vz * dt, 0.6);
      else P.move(world, this, this.vx * dt, 0, this.vz * dt);
      if (sneakGuard && !this.onFloorAt(this.x, this.y, this.z)) {
        // Schleichen: nicht von der Kante fallen
        if (this.onFloorAt(oldX, this.y, this.z)) { this.x = oldX; this.vx = 0; }
        else if (this.onFloorAt(this.x, this.y, oldZ)) { this.z = oldZ; this.vz = 0; }
        else { this.x = oldX; this.y = oldY; this.z = oldZ; this.vx = 0; this.vz = 0; }
      }
      // Der Auto-Schritt darf keinen Fallschaden auslösen
      if (this.y > oldY) beforeY = this.y;

      // Leiter: langsames Absinken, Klettern mit Leertaste oder Laufen gegen die
      // Wand. Muss nach dem Horizontalzug stehen, denn erst der setzt collidedH.
      if (this.onLadder) {
        if (this.vy < -2.6) this.vy = -2.6;
        if (input.key('Space') || (len > 0 && this.collidedH)) this.vy = 3.4;
        if (this.sneaking) this.vy = 0;
        this.fallStart = null;
      }
      var vyBefore = this.vy;
      P.move(world, this, 0, this.vy * dt, 0);
      // Auf einer blauen Wolke federt man zurück in die Höhe
      if (this.onGround && vyBefore < -1) {
        var landB = B.byId[world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z))];
        if (landB && landB.bounce) {
          this.vy = landB.bounce;
          this.onGround = false;
          this.fallStart = null;
          game.audio.play('pop');
        } else if (landB && landB.soft) {
          this.fallStart = null;
        }
      }

      // Reibung: glatte Blöcke (Eis, Flugsand) lassen einen weiterrutschen
      var friction = 0.35;
      if (this.onGround) {
        var slick = groundB && groundB.slippery ? groundB.slippery : 0;
        friction = slick ? Math.pow(0.0015, 1 - slick) : 0.0015;
      }
      var k = Math.pow(friction, dt);
      this.vx *= k; this.vz *= k;

      // Fallschaden
      if (!this.onGround && this.vy < 0) {
        if (this.fallStart === null) this.fallStart = beforeY;
        else this.fallStart = Math.max(this.fallStart, beforeY);
      }
      if (this.inWater) this.fallStart = null;
      if (this.onGround && this.fallStart !== null) {
        var fd = this.fallStart - this.y;
        // Gravititstiefel fangen jeden Aufprall ab
        if (fd > 3.2 && this.gravBoots) {
          game.particles.crit(this.x, this.y + 0.1, this.z);
          game.audio.play('pop');
        } else if (fd > 3.2) {
          var dmg = Math.floor(fd - 3);
          if (dmg > 0) { this.hurt(dmg, null, game, 'fall'); game.audio.play('fall'); }
        }
        this.fallStart = null;
      }
    }

    var moved = Math.abs(this.vx) + Math.abs(this.vz);
    if (moved > 0.3 && (this.onGround || this.inWater)) {
      this.walkTime += dt * (this.sprinting ? 11 : 8);
      this.bobPhase += dt * (this.sprinting ? 11 : 8);
      this.exhaust(dt * (this.sprinting ? 0.1 : 0.01));
      // Schrittgeräusch
      this.stepTimer = (this.stepTimer || 0) + dt * moved;
      if (this.stepTimer > 2.4) {
        this.stepTimer = 0;
        var gb = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
        if (gb) game.audio.step(B.byId[gb].sound);
      }
    }

    // ---- Umgebung ----
    var headBlock = world.getBlock(Math.floor(this.x), Math.floor(this.eyeY()), Math.floor(this.z));
    var headB = B.byId[headBlock];
    this.headInWater = headB && headB.name === 'water';
    this.headInLava = headB && headB.name === 'lava';

    // Der Gravitithelm bringt kein Atmen unter Wasser mehr, sondern das HUD:
    // Lebensbalken über Kreaturen und den Kompass zum Endportal.
    if (this.headInWater && !creative) {
      // Atmung streckt die Luft: je Stufe kommt eine Sekunde Reserve dazu,
      // gerechnet als Bruchteil des Verbrauchs
      var atmung = MC.Ench ? MC.Ench.stufe(this.inventory.armor[0], 'respiration') : 0;
      this.air -= dt / (1 + atmung);
      if (this.air <= 0) { this.air = 0; this.drownTimer = (this.drownTimer || 0) + dt; if (this.drownTimer > 1) { this.drownTimer = 0; this.hurt(2, null, game); game.audio.play('hurt'); } }
      if (Math.random() < dt * 4) game.particles.splash(this.x, this.eyeY(), this.z, 1);
    } else {
      this.air = Math.min(this.maxAir, this.air + dt * 4);
      this.drownTimer = 0;
    }

    // Zanitrüstung schützt gegen Hitze: jedes Teil ein Viertel, alle vier = immun
    var hitzeSchutz = Math.min(1, inv.armorSetCount('zanite') * 0.25);

    if (inLava && !creative && hitzeSchutz < 1) {
      this.lavaTimer = (this.lavaTimer || 0) + dt;
      if (this.lavaTimer > 0.5) { this.lavaTimer = 0;
        if (!MC.Effekte || !MC.Effekte.stufe(this, 'feuerresistenz')) this.hurt(4 * (1 - hitzeSchutz), null, game, 'feuer'); }
    }

    // Blöcke, die beim Berühren wehtun: Kaktus sticht, Feuer und Magma brennen.
    // Der Suchkasten ist knapp die Spielerbreite und reicht vom Fuß- bis zum
    // Kopfblock. Ein größerer Kasten würde Schaden austeilen, während man
    // daneben oder eine Stufe darüber steht – Lava kollidiert nicht, man kann
    // also direkt an ihrer Kante stehen.
    var cactusId = B.id('cactus'), lavaId = B.id('lava');
    var stich = 0, brand = 0;
    var halb = this.width / 2 - 0.02;
    var cx0 = Math.floor(this.x - halb), cx1 = Math.floor(this.x + halb);
    var cz0 = Math.floor(this.z - halb), cz1 = Math.floor(this.z + halb);
    var cy0 = Math.floor(this.y + 0.02), cy1 = Math.floor(this.y + this.height - 0.02);
    for (var cy = cy0; cy <= cy1; cy++) {
      for (var czz = cz0; czz <= cz1; czz++) {
        for (var cxx = cx0; cxx <= cx1; cxx++) {
          var tid = world.getBlock(cxx, cy, czz);
          // Lava rechnet oben über inLava ab, sonst zählte ihr Schaden doppelt
          if (tid === lavaId) continue;
          var tb = B.byId[tid];
          if (!tb || !tb.damage) continue;
          if (tb.id === cactusId) stich = Math.max(stich, tb.damage);
          else brand = Math.max(brand, tb.damage);
        }
      }
    }
    if (!creative && stich > 0) {
      this.cactusTimer = (this.cactusTimer || 0) + dt;
      if (this.cactusTimer > 0.5) { this.cactusTimer = 0; this.hurt(stich, null, game); }
    } else this.cactusTimer = 0;
    if (!creative && brand > 0 && hitzeSchutz < 1) {
      this.burnTimer = (this.burnTimer || 0) + dt;
      if (this.burnTimer > 0.6) { this.burnTimer = 0;
        if (!MC.Effekte || !MC.Effekte.stufe(this, 'feuerresistenz')) this.hurt(brand * (1 - hitzeSchutz), null, game, 'feuer'); }
    } else this.burnTimer = 0;

    // ---- Hunger & Regeneration ----
    if (!creative) {
      if (this.exhaustion >= 4) {
        this.exhaustion -= 4;
        if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
        else this.food = Math.max(0, this.food - 1);
      }
      if (this.food >= 18 && this.health < this.maxHealth) {
        this.regenTimer += dt;
        if (this.regenTimer > 3.5) { this.regenTimer = 0; this.health = Math.min(this.maxHealth, this.health + 1); this.exhaust(3); }
      } else this.regenTimer = 0;
      if (this.food === 0) {
        this.starveTimer += dt;
        if (this.starveTimer > 4) { this.starveTimer = 0; this.hurt(1, null, game); }
      } else this.starveTimer = 0;
    }

    // Wer im Aether durch die Leere fällt, kommt in der Oberwelt wieder heraus
    if (world.dim === 'aether' && this.y < -8) { game.fallFromAether(); return; }
    if (this.y < -24) this.hurt(999, null, game);
  };

  Player.prototype.checkLadder = function () {
    var w = this.world;
    var x0 = Math.floor(this.x - 0.3), x1 = Math.floor(this.x + 0.3);
    var z0 = Math.floor(this.z - 0.3), z1 = Math.floor(this.z + 0.3);
    var y0 = Math.floor(this.y), y1 = Math.floor(this.y + this.height - 0.2);
    for (var y = y0; y <= y1; y++)
      for (var z = z0; z <= z1; z++)
        for (var x = x0; x <= x1; x++) {
          var b = B.byId[w.getBlock(x, y, z)];
          if (b && b.climbable) return true;
        }
    return false;
  };

  Player.prototype.onFloorAt = function (x, y, z) {
    var boxes = [];
    this.world.collectBoxes(x - 0.3, y - 0.55, z - 0.3, x + 0.3, y - 0.02, z + 0.3, boxes);
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      if (b[4] > y - 0.55 && b[4] <= y + 0.02 &&
          x + 0.3 > b[0] && x - 0.3 < b[3] && z + 0.3 > b[2] && z - 0.3 < b[5]) return true;
    }
    return false;
  };

  Player.prototype.exhaust = function (n) { this.exhaustion += n; };

  // art: 'feuer' | 'explosion' | 'geschoss' | 'fall' | undefined
  Player.prototype.hurt = function (amount, source, game, art) {
    if (this.dead) return;
    if (game.mode === 'creative' && amount < 900) return;
    if (this.hurtTime > 0.35 && amount < 900) return;
    var def = this.inventory.defense();
    if (amount < 900 && def > 0) amount = amount * (1 - Math.min(20, def) * 0.04);
    // Schutzverzauberungen zahlen auf denselben Topf ein, gedeckelt bei 20
    if (amount < 900 && MC.Ench) amount = amount * MC.Ench.schutzFaktor(this.inventory, art);
    amount = Math.max(0, amount);
    this.health -= amount;
    this.hurtTime = 0.6;
    this.inventory.damageArmor(1, game);
    game.audio.play('hurt');
    game.damageFlash = 1;
    if (source) {
      var dx = this.x - source.x, dz = this.z - source.z;
      var d = Math.sqrt(dx * dx + dz * dz) || 1;
      this.vx += dx / d * 8; this.vz += dz / d * 8; this.vy = Math.max(this.vy, 6);
      // Dornen schlagen zurück, wenn der Angreifer nah genug ist
      if (MC.Ench && source.hurt && d < 6) {
        var dorn = MC.Ench.dornen(this.inventory);
        if (dorn) { source.hurt(dorn, this, game); this.inventory.damageArmor(1, game); }
      }
    }
    if (this.health <= 0) this.die(game);
  };

  Player.prototype.heal = function (n) { this.health = Math.min(this.maxHealth, this.health + n); };

  Player.prototype.die = function (game) {
    this.health = 0;
    this.dead = true;
    game.audio.play('death');
    game.particles.death(this.x, this.y + 1, this.z);
    // Inventar fallen lassen
    if (game.mode !== 'creative' && game.keepInventory !== true) {
      for (var i = 0; i < this.inventory.size; i++) {
        var s = this.inventory.slots[i];
        if (s) { game.spawnItem(this.x, this.y + 1, this.z, s); this.inventory.slots[i] = null; }
      }
      for (var a = 0; a < 4; a++) {
        if (this.inventory.armor[a]) { game.spawnItem(this.x, this.y + 1, this.z, this.inventory.armor[a]); this.inventory.armor[a] = null; }
      }
    }
    game.ui.showDeath();
  };

  Player.prototype.respawn = function (game) {
    this.dead = false;
    this.health = this.maxHealth;
    this.food = 20; this.saturation = 5; this.exhaustion = 0;
    this.air = this.maxAir;
    this.vx = this.vy = this.vz = 0;
    this.hurtTime = 0;
    this.fallStart = null;
    this.exhaustion = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.drownTimer = 0;
    var sp = this.spawnPoint;
    // Wiederbelebt wird immer in der Oberwelt – sonst stünde man nach einem Tod
    // im Ende an den Oberweltkoordinaten mitten in der Leere.
    if (game.dim !== 'overworld') {
      game.generateAround(game.dimWorld('overworld'), Math.round(sp.x), Math.round(sp.z), 1);
      game.travelTo('overworld', { x: sp.x, y: sp.y, z: sp.z });
    }
    this.x = sp.x; this.y = sp.y; this.z = sp.z;
    game.ensureChunksAround(this.x, this.z, 2);
    // Bett zuerst, sonst die Oberfläche derselben Spalte
    var pos = game.safeSpawnPos(this.world, sp);
    this.x = pos.x; this.y = pos.y; this.z = pos.z;
    game.ui.hideDeath();
  };

  Player.prototype.addXP = function (n) {
    this.xp += n;
    var need = this.xpNeeded();
    while (this.xp >= need) { this.xp -= need; this.level++; need = this.xpNeeded(); }
  };
  Player.prototype.xpNeeded = function () {
    var l = this.level;
    if (l < 16) return 2 * l + 7;
    if (l < 31) return 5 * l - 38;
    return 9 * l - 158;
  };

  Player.prototype.eat = function (game) {
    var s = this.inventory.selectedStack();
    if (!s) return false;
    var it = I.get(s.id);
    if (!it || !it.food) return false;
    if (this.food >= 20 && it.name !== 'golden_apple') return false;
    this.food = Math.min(20, this.food + it.food.hunger);
    this.saturation = Math.min(this.food, this.saturation + it.food.sat);
    if (it.name === 'golden_apple') {
      this.heal(2);
      if (MC.Effekte) MC.Effekte.gib(this, 'regeneration', 2, 5);
    }
    if (it.name === 'chicken_raw' && Math.random() < 0.3) this.food = Math.max(0, this.food - 2);
    this.inventory.consumeSelected(1);
    game.audio.play('eat');
    game.particles.crit(this.x, this.eyeY() - 0.3, this.z);
    return true;
  };

  Player.prototype.serialize = function () {
    return {
      x: this.x, y: this.y, z: this.z, yaw: this.yaw, pitch: this.pitch,
      health: this.health, food: this.food, saturation: this.saturation,
      xp: this.xp, level: this.level, air: this.air, effekte: this.effekte,
      spawnPoint: this.spawnPoint, inventory: this.inventory.serialize()
    };
  };

  Player.prototype.load = function (d) {
    if (!d) return;
    this.x = d.x; this.y = d.y; this.z = d.z;
    this.yaw = d.yaw || 0; this.pitch = d.pitch || 0;
    this.health = d.health === undefined ? 20 : d.health;
    this.food = d.food === undefined ? 20 : d.food;
    this.saturation = d.saturation || 0;
    this.xp = d.xp || 0; this.level = d.level || 0;
    this.air = d.air === undefined ? 10 : d.air;
    this.effekte = d.effekte || [];
    if (d.spawnPoint) this.spawnPoint = d.spawnPoint;
    this.inventory.load(d.inventory);
  };

})();
