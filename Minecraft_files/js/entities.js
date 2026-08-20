/* ============================================================
   entities.js  -  Physik, Item-Drops, Pfeile, XP, TNT, Mobs & KI
   ============================================================ */
(function () {
  'use strict';

  var B = MC.Blocks, I = MC.Items, U = MC.U;
  var WH = MC.WORLD_HEIGHT;

  // ============================================================
  //  Physik-Helfer
  // ============================================================
  var P = {};
  MC.Physics = P;
  var boxBuf = [];

  P.move = function (world, e, dx, dy, dz) {
    var w = e.width / 2, h = e.height;
    var ox = e.x, oy = e.y, oz = e.z;
    // Nur die Flags zurücksetzen, die dieser Zug auch neu bestimmt. Sonst löscht
    // ein reiner Y-Zug das collidedH des vorangegangenen Horizontalzugs – davon
    // leben Leiterklettern und der Hindernissprung der Mobs.
    if (dy !== 0) e.onGround = false;
    // Merken, worauf wir standen: steht der Zug an einer Wand still, wird der
    // Bodenkontakt am Ende daraus wiederhergestellt.
    var standVorher = e.onGround;
    if (dx !== 0 || dz !== 0) e.collidedH = false;

    // Y
    if (dy !== 0) {
      world.collectBoxes(e.x - w, Math.min(e.y, e.y + dy) - 0.001, e.z - w,
                         e.x + w, Math.max(e.y + h, e.y + h + dy) + 0.001, e.z + w, boxBuf);
      for (var i = 0; i < boxBuf.length; i++) {
        var b = boxBuf[i];
        if (e.x + w <= b[0] + 1e-6 || e.x - w >= b[3] - 1e-6) continue;
        if (e.z + w <= b[2] + 1e-6 || e.z - w >= b[5] - 1e-6) continue;
        if (dy < 0 && e.y >= b[4] - 1e-4 && e.y + dy < b[4]) { dy = b[4] - e.y; e.onGround = true; }
        else if (dy > 0 && e.y + h <= b[1] + 1e-4 && e.y + h + dy > b[1]) { dy = b[1] - (e.y + h); e.vy = 0; }
      }
      e.y += dy;
      if (e.onGround) e.vy = 0;
    }

    // X
    if (dx !== 0) {
      world.collectBoxes(Math.min(e.x, e.x + dx) - w - 0.001, e.y - 0.001, e.z - w,
                         Math.max(e.x, e.x + dx) + w + 0.001, e.y + h + 0.001, e.z + w, boxBuf);
      for (var j = 0; j < boxBuf.length; j++) {
        var b2 = boxBuf[j];
        if (e.y + h <= b2[1] + 1e-6 || e.y >= b2[4] - 1e-6) continue;
        if (e.z + w <= b2[2] + 1e-6 || e.z - w >= b2[5] - 1e-6) continue;
        if (dx > 0 && e.x + w <= b2[0] + 1e-4 && e.x + w + dx > b2[0]) { dx = b2[0] - (e.x + w); e.collidedH = true; }
        else if (dx < 0 && e.x - w >= b2[3] - 1e-4 && e.x - w + dx < b2[3]) { dx = b2[3] - (e.x - w); e.collidedH = true; }
      }
      e.x += dx;
    }

    // Z
    if (dz !== 0) {
      world.collectBoxes(e.x - w, e.y - 0.001, Math.min(e.z, e.z + dz) - w - 0.001,
                         e.x + w, e.y + h + 0.001, Math.max(e.z, e.z + dz) + w + 0.001, boxBuf);
      for (var k = 0; k < boxBuf.length; k++) {
        var b3 = boxBuf[k];
        if (e.y + h <= b3[1] + 1e-6 || e.y >= b3[4] - 1e-6) continue;
        if (e.x + w <= b3[0] + 1e-6 || e.x - w >= b3[3] - 1e-6) continue;
        if (dz > 0 && e.z + w <= b3[2] + 1e-4 && e.z + w + dz > b3[2]) { dz = b3[2] - (e.z + w); e.collidedH = true; }
        else if (dz < 0 && e.z - w >= b3[5] - 1e-4 && e.z - w + dz < b3[5]) { dz = b3[5] - (e.z - w); e.collidedH = true; }
      }
      e.z += dz;
    }
    // Ein reiner Waagrechtzug nimmt einem den Boden nicht weg. Ohne das steht
    // man nach ein paar Bildern gegen einer Wand ohne Bodenkontakt da, weil der
    // senkrechte Zug mit dy = 0 gar nicht mehr läuft und onGround nie wieder
    // gesetzt wird – dann verschluckt das Spiel den Sprung.
    if (dy === 0 && standVorher) e.onGround = true;
    return { dx: e.x - ox, dy: e.y - oy, dz: e.z - oz };
  };

  // Versucht, eine Stufe hochzusteigen
  P.moveWithStep = function (world, e, dx, dz, stepHeight) {
    var sx = e.x, sy = e.y, sz = e.z;
    var wasGround = e.onGround, wasVy = e.vy;
    var r = P.move(world, e, dx, 0, dz);
    if (!e.collidedH || !wasGround) return r;
    var movedX = e.x - sx, movedZ = e.z - sz;
    if (Math.abs(movedX - dx) < 1e-4 && Math.abs(movedZ - dz) < 1e-4) return r;
    // Rücksetzen und über die Stufe versuchen
    var afterX = e.x, afterZ = e.z;
    e.x = sx; e.y = sy; e.z = sz;
    P.move(world, e, 0, stepHeight, 0);
    P.move(world, e, dx, 0, dz);
    P.move(world, e, 0, -stepHeight, 0);
    if ((e.x - sx) * (e.x - sx) + (e.z - sz) * (e.z - sz) <
        (afterX - sx) * (afterX - sx) + (afterZ - sz) * (afterZ - sz)) {
      e.x = afterX; e.z = afterZ; e.y = sy;
      P.move(world, e, 0, 0, 0);
    }
    // Der Versuch ist eine PROBE: er hebt den Körper an, schiebt ihn und setzt
    // ihn wieder ab. Dabei laufen drei P.move mit dy != 0, und jedes davon
    // löscht den Bodenkontakt. Beim Absetzen kommt er nicht zuverlässig
    // zurück, weil der Landetest ein echtes Unterschreiten der Oberkante
    // verlangt – nach genau 0,6 hoch und 0,6 runter landet man exakt darauf.
    //
    // Ergebnis war der verschluckte Sprung: wer gegen eine ein Block hohe
    // Stufe läuft, verliert dabei den Bodenkontakt und darf nicht springen.
    // Steht der Körper am Ende wieder auf seiner Ausgangshöhe, ist gar nichts
    // passiert – dann werden Bodenkontakt und Fallgeschwindigkeit
    // zurückgesetzt, als hätte die Probe nie stattgefunden.
    if (Math.abs(e.y - sy) < 1e-6) { e.onGround = wasGround; e.vy = wasVy; }
    return { dx: e.x - sx, dy: e.y - sy, dz: e.z - sz };
  };

  // Steht wirklich fester Boden unter den Füßen? Fragt die Welt statt das
  // Flag. Das Flag ist ein Rechenergebnis, das ein Zug zwischendurch löschen
  // kann; der Block darunter liegt einfach da.
  P.stehtAuf = function (world, e) {
    // Der Rand wird um eine Winzigkeit eingezogen. Die Kollision setzt den
    // Körper exakt an die Blockkante — steht man an einer Wand, ist
    // e.x + width/2 also genau die Kante der Wandzelle, und ohne das Einziehen
    // zählt die WAND als Boden unter den Füßen. Genau daran konnte man sich an
    // einer Mauer endlos hochspringen.
    var w = e.width / 2 - 1e-3, y = e.y - 0.06;
    var x0 = Math.floor(e.x - w), x1 = Math.floor(e.x + w);
    var z0 = Math.floor(e.z - w), z1 = Math.floor(e.z + w);
    var by = Math.floor(y);
    for (var z = z0; z <= z1; z++) {
      for (var x = x0; x <= x1; x++) {
        var b = B.byId[world.getBlock(x, by, z)];
        if (b && b.collide !== false && b.solid !== false && b.name !== 'water' && b.name !== 'lava') return true;
      }
    }
    return false;
  };

  P.blockAtFeet = function (world, e) {
    return world.getBlock(Math.floor(e.x), Math.floor(e.y + 0.1), Math.floor(e.z));
  };

  P.inLiquid = function (world, e, name) {
    var id = B.id(name);
    var x0 = Math.floor(e.x - e.width / 2), x1 = Math.floor(e.x + e.width / 2);
    var z0 = Math.floor(e.z - e.width / 2), z1 = Math.floor(e.z + e.width / 2);
    var y0 = Math.floor(e.y), y1 = Math.floor(e.y + e.height * 0.7);
    for (var y = y0; y <= y1; y++)
      for (var z = z0; z <= z1; z++)
        for (var x = x0; x <= x1; x++)
          // Seegras und Tang zählen als Wasser – sonst fällt man mitten im
          // Tangwald plötzlich, weil dort kein Wasserblock steht.
          if (name === 'water' ? B.zaehltAlsWasser(world.getBlock(x, y, z), world.getMeta(x, y, z))
                               : world.getBlock(x, y, z) === id) return true;
    return false;
  };

  // ============================================================
  //  Basis-Entity
  // ============================================================
  function Entity(world, x, y, z) {
    this.world = world;
    this.x = x; this.y = y; this.z = z;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.width = 0.6; this.height = 1.8;
    this.yaw = 0; this.pitch = 0;
    this.onGround = false;
    this.dead = false;
    this.age = 0;
    this.type = 'entity';
    this.gravity = 32;
  }
  MC.Entity = Entity;

  Entity.prototype.applyPhysics = function (dt, drag, groundFriction) {
    this.vy -= this.gravity * dt;
    if (this.vy < -60) this.vy = -60;
    var inWater = P.inLiquid(this.world, this, 'water');
    if (inWater) { this.vy *= 0.72; this.vx *= 0.85; this.vz *= 0.85; }
    P.move(this.world, this, this.vx * dt, this.vy * dt, this.vz * dt);
    var f = this.onGround ? (groundFriction === undefined ? 0.55 : groundFriction) : (drag === undefined ? 0.985 : drag);
    var k = Math.pow(f, dt * 20);
    this.vx *= k; this.vz *= k;
  };

  Entity.prototype.distTo = function (o) {
    var dx = this.x - o.x, dy = this.y - o.y, dz = this.z - o.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  // ============================================================
  //  Item-Entity
  // ============================================================
  function ItemEntity(world, x, y, z, stack) {
    Entity.call(this, world, x, y, z);
    this.width = 0.28; this.height = 0.28;
    this.stack = stack;
    this.type = 'item';
    this.pickupDelay = 0.6;
    this.bob = Math.random() * 6.28;
    this.gravity = 22;
  }
  ItemEntity.prototype = Object.create(Entity.prototype);
  ItemEntity.prototype.constructor = ItemEntity;
  MC.ItemEntity = ItemEntity;

  ItemEntity.prototype.update = function (dt, game) {
    this.age += dt;
    this.pickupDelay -= dt;
    this.applyPhysics(dt, 0.98, 0.6);
    if (this.age > 300) { this.dead = true; return; }
    if (this.y < -8) { this.dead = true; return; }
    // Lava zerstört Items
    if (P.inLiquid(this.world, this, 'lava')) { this.dead = true; return; }

    var p = game.player;
    if (this.pickupDelay <= 0 && p && !p.dead) {
      var dx = p.x - this.x, dy = (p.y + 0.9) - this.y, dz = p.z - this.z;
      var d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 1.8 * 1.8) {
        var pull = 6 * dt / Math.max(0.4, Math.sqrt(d2));
        this.x += dx * pull; this.y += dy * pull; this.z += dz * pull;
      }
      if (d2 < 0.75 * 0.75) {
        var aufgesammelt = this.stack.id;
        var left = p.inventory.add(this.stack);
        if (left === 0) {
          this.dead = true;
          game.audio.play('pop');
          game.ui.flashPickup(this.stack);
        } else this.stack.count = left;
        if (MC.Achievements) MC.Achievements.onItem(game, aufgesammelt);
      }
    }
    // gleiche Items zusammenführen
    if ((game.tickCount & 15) === 0) {
      for (var i = 0; i < this.world.entities.length; i++) {
        var o = this.world.entities[i];
        if (o === this || o.type !== 'item' || o.dead) continue;
        if (!I.sameItem(o.stack, this.stack)) continue;
        if (this.distTo(o) > 0.9) continue;
        var max = I.stackMax(this.stack.id);
        var total = this.stack.count + o.stack.count;
        if (total <= max) { this.stack.count = total; o.dead = true; }
      }
    }
  };

  // ============================================================
  //  XP-Kugel
  // ============================================================
  function XPOrb(world, x, y, z, amount) {
    Entity.call(this, world, x, y, z);
    this.width = 0.25; this.height = 0.25;
    this.amount = amount;
    this.type = 'xp';
    this.gravity = 16;
    this.vy = 1.5 + Math.random();
    this.vx = (Math.random() - 0.5) * 2;
    this.vz = (Math.random() - 0.5) * 2;
  }
  XPOrb.prototype = Object.create(Entity.prototype);
  XPOrb.prototype.constructor = XPOrb;
  MC.XPOrb = XPOrb;

  XPOrb.prototype.update = function (dt, game) {
    this.age += dt;
    this.applyPhysics(dt, 0.98, 0.6);
    if (this.age > 300 || this.y < -8) { this.dead = true; return; }
    var p = game.player;
    if (!p || p.dead) return;
    var dx = p.x - this.x, dy = (p.y + 0.9) - this.y, dz = p.z - this.z;
    var d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 5 * 5) {
      var pull = 5 * dt / Math.max(0.5, Math.sqrt(d2));
      this.x += dx * pull; this.y += dy * pull; this.z += dz * pull;
    }
    if (d2 < 0.8 * 0.8) {
      // Reparatur: die Kugel flickt getragenes Gerät, bevor sie zu Stufen wird.
      var rest = this.amount;
      if (MC.Ench) rest = MC.Ench.reparieren(p.inventory, rest);
      if (rest > 0) p.addXP(rest);
      this.dead = true;
      game.audio.play('xp');
    }
  };

  // ============================================================
  //  Pfeil
  // ============================================================
  function Arrow(world, x, y, z, vx, vy, vz, shooter, damage) {
    Entity.call(this, world, x, y, z);
    this.width = 0.2; this.height = 0.2;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.type = 'arrow';
    this.shooter = shooter;
    this.damage = damage || 4;
    this.stuck = false;
    this.gravity = 18;
  }
  Arrow.prototype = Object.create(Entity.prototype);
  Arrow.prototype.constructor = Arrow;
  MC.Arrow = Arrow;

  Arrow.prototype.update = function (dt, game) {
    this.age += dt;
    if (this.age > 60) { this.dead = true; return; }
    if (this.stuck) return;
    this.vy -= this.gravity * dt;
    var nx = this.x + this.vx * dt, ny = this.y + this.vy * dt, nz = this.z + this.vz * dt;
    this.yaw = Math.atan2(this.vx, this.vz);
    this.pitch = -Math.atan2(this.vy, Math.sqrt(this.vx * this.vx + this.vz * this.vz));

    // Trefferprüfung gegen Entities
    var ents = this.world.entities;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e === this || e.dead || !e.isMob) continue;
      if (e === this.shooter) continue;
      if (Math.abs(e.x - nx) < e.width / 2 + 0.25 && Math.abs(e.z - nz) < e.width / 2 + 0.25 &&
          ny > e.y - 0.2 && ny < e.y + e.height + 0.2) {
        e.hurt(this.damage, this.shooter, game);
        // Schlag stößt zurück, Flamme zündet an
        if (this.punch && !e.dead) {
          var kd = Math.sqrt(this.vx * this.vx + this.vz * this.vz) || 1;
          e.vx += this.vx / kd * 6 * this.punch;
          e.vz += this.vz / kd * 6 * this.punch;
          e.vy = Math.max(e.vy, 3);
        }
        if (this.flamme) e.brennt = Math.max(e.brennt || 0, 5);
        this.dead = true;
        game.audio.play('hit');
        return;
      }
    }
    if (this.shooter !== game.player && game.player && !game.player.dead) {
      var p = game.player;
      if (Math.abs(p.x - nx) < 0.55 && Math.abs(p.z - nz) < 0.55 && ny > p.y - 0.2 && ny < p.y + p.height + 0.2) {
        p.hurt(this.damage, this, game, 'geschoss');
        this.dead = true;
        return;
      }
    }
    // Block
    var hit = this.world.raycast(this.x, this.y, this.z, this.vx, this.vy, this.vz,
      Math.sqrt((nx - this.x) * (nx - this.x) + (ny - this.y) * (ny - this.y) + (nz - this.z) * (nz - this.z)) + 0.05, false);
    if (hit) {
      this.x = hit.hx - this.vx * 0.02; this.y = hit.hy - this.vy * 0.02; this.z = hit.hz - this.vz * 0.02;
      this.stuck = true;
      this.vx = this.vy = this.vz = 0;
      game.audio.play('thud');
      return;
    }
    this.x = nx; this.y = ny; this.z = nz;
  };

  // ============================================================
  //  Enderperle
  // ============================================================
  // Fliegt in einem Bogen und setzt den Werfer dorthin, wo sie aufschlägt.
  // Der Aufprall kostet wie im Original etwas Leben.
  function EnderPearl(world, x, y, z, vx, vy, vz, owner) {
    Entity.call(this, world, x, y, z);
    this.width = 0.25; this.height = 0.25;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.owner = owner;
    this.type = 'pearl';
    this.gravity = 18;
    this.life = 20;
  }
  EnderPearl.prototype = Object.create(Entity.prototype);
  EnderPearl.prototype.constructor = EnderPearl;
  MC.EnderPearl = EnderPearl;

  EnderPearl.prototype.update = function (dt, game) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0 || this.y < -8) { this.dead = true; return; }
    this.vy -= this.gravity * dt;
    var nx = this.x + this.vx * dt, ny = this.y + this.vy * dt, nz = this.z + this.vz * dt;

    var dx = nx - this.x, dy = ny - this.y, dz = nz - this.z;
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 0.0001) {
      var hit = this.world.raycast(this.x, this.y, this.z, dx / len, dy / len, dz / len, len + 0.05, false);
      if (hit) { this.land(game, hit.hx, hit.hy, hit.hz); return; }
    }
    this.x = nx; this.y = ny; this.z = nz;
    if ((game.tickCount & 1) === 0) game.particles.portal(this.x, this.y, this.z, 2);
  };

  EnderPearl.prototype.land = function (game, x, y, z) {
    this.dead = true;
    var p = game.player;
    if (this.owner !== p || p.dead) return;

    // Vom Aufprallpunkt aus die erste Stelle mit zwei Blöcken Luft suchen
    var bx = Math.floor(x), bz = Math.floor(z), by = -1;
    for (var d = 0; d <= 3 && by < 0; d++) {
      var ty = Math.floor(y) + d;
      if (this.world.getBlock(bx, ty, bz) === 0 && this.world.getBlock(bx, ty + 1, bz) === 0) by = ty;
    }
    if (by < 0) { game.ui.toast('Dort ist kein Platz zum Landen.'); return; }

    game.particles.portal(p.x, p.eyeY(), p.z, 12);
    p.x = bx + 0.5; p.y = by; p.z = bz + 0.5;
    p.vx = p.vy = p.vz = 0;
    p.fallStart = null;
    game.particles.portal(p.x, p.eyeY(), p.z, 14);
    game.audio.play('enderman');
    game.ensureChunksAround(p.x, p.z, 1);
    if (!MC.friedlichFuer(game)) p.hurt(5, null, game);
  };

  // ============================================================
  //  TNT
  // ============================================================
  function TNTEntity(world, x, y, z, fuse) {
    Entity.call(this, world, x, y, z);
    this.width = 0.98; this.height = 0.98;
    this.type = 'tnt';
    this.fuse = fuse || 4;
    this.vy = 2.5;
    this.vx = (Math.random() - 0.5) * 0.6;
    this.vz = (Math.random() - 0.5) * 0.6;
  }
  TNTEntity.prototype = Object.create(Entity.prototype);
  TNTEntity.prototype.constructor = TNTEntity;
  MC.TNTEntity = TNTEntity;

  TNTEntity.prototype.update = function (dt, game) {
    this.fuse -= dt;
    this.applyPhysics(dt, 0.99, 0.7);
    game.particles.smoke(this.x, this.y + 1, this.z, 1);
    if (this.fuse <= 0) {
      this.dead = true;
      MC.explode(game, this.x, this.y + 0.5, this.z, 4.2, true);
    }
  };

  // ============================================================
  //  Fallender Block
  // ============================================================
  // Sand, Kies, Amboss und Gravitit sprangen bisher Feld um Feld: ein setBlock
  // löschte oben, ein zweites setzte unten. Für die Dauer des Falls sind sie
  // jetzt eine Entität mit Flugbahn. Daran hängt alles, was einen Fall
  // interessant macht — eine Explosion schleudert sie fort, sie fliegen an
  // einer Fackel vorbei statt sie zu schlucken, und wo kein Platz mehr ist,
  // landen sie als Gegenstand statt als Block.
  //
  // Der Deckel ist Absicht, kein Notnagel: eine einstürzende Sandwand darf
  // nicht tausend Entitäten auf einmal erzeugen. Ist er erreicht, springt der
  // Rest wie früher — sichtbar wird das kaum, denn dann fällt ohnehin alles
  // gleichzeitig.
  var MAX_FALLENDE = 96;

  function FallingBlock(world, x, y, z, id, meta) {
    Entity.call(this, world, x, y, z);
    this.width = 0.98; this.height = 0.98;
    this.type = 'falling';
    this.blockId = id;
    this.meta = meta || 0;
    var b = B.byId[id];
    this.up = !!(b && b.gravityUp);     // Gravitit steigt, statt zu fallen
    this.startY = y;
    this.getroffen = [];                // wen der Amboss unterwegs erwischt hat
  }
  FallingBlock.prototype = Object.create(Entity.prototype);
  FallingBlock.prototype.constructor = FallingBlock;
  MC.FallingBlock = FallingBlock;

  // Löst den Block aus der Welt und schickt ihn auf die Reise. Liefert false,
  // wenn gerade zu viele unterwegs sind; dann bleibt es beim alten Sprung.
  FallingBlock.starte = function (world, x, y, z, id, meta) {
    var n = 0;
    for (var i = 0; i < world.entities.length; i++) {
      var e = world.entities[i];
      if (e.type === 'falling' && !e.dead) n++;
    }
    if (n >= MAX_FALLENDE) return false;
    world.setBlock(x, y, z, 0, 0);
    world.entities.push(new FallingBlock(world, x + 0.5, y, z + 0.5, id, meta));
    return true;
  };

  FallingBlock.prototype.update = function (dt, game) {
    var w = this.world;
    this.age += dt;
    var dir = this.up ? 1 : -1;
    this.vy += dir * this.gravity * dt;
    if (this.vy > 60) this.vy = 60;
    if (this.vy < -60) this.vy = -60;
    if (P.inLiquid(w, this, 'water')) { this.vy *= 0.62; this.vx *= 0.82; this.vz *= 0.82; }

    var vorher = this.y, wollte = this.vy * dt;
    P.move(w, this, this.vx * dt, wollte, this.vz * dt);
    var k = Math.pow(0.96, dt * 20);
    this.vx *= k; this.vz *= k;

    if (B.byId[this.blockId].shape === B.SHAPE_ANVIL) this.zerquetschen(game);

    if (this.y < -4 || this.y > WH + 8 || this.age > 60) { this.dead = true; return; }

    // Angekommen ist er, sobald ihn etwas aufgehalten hat: er ist weniger weit
    // gekommen, als er wollte. Das gilt nach oben wie nach unten und braucht
    // damit keine zweite Landeprüfung für den Gravititfall.
    if (Math.abs(this.y - vorher) < Math.abs(wollte) - 1e-6) this.absetzen(game);
  };

  // Ein fallender Amboss tut weh, und zwar nach Fallhöhe. Jeder wird nur
  // einmal getroffen — sonst zählt bei 60 Bildern je Sekunde jedes einzelne.
  FallingBlock.prototype.zerquetschen = function (game) {
    if (this.vy > -7) return;
    var ziele = this.world.entities;
    for (var i = 0; i <= ziele.length; i++) {
      var e = (i === ziele.length) ? game.player : ziele[i];
      if (!e || e.dead || e === this || !e.hurt) continue;
      if (this.getroffen.indexOf(e) >= 0) continue;
      if (Math.abs(e.x - this.x) > 0.85 || Math.abs(e.z - this.z) > 0.85) continue;
      if (e.y > this.y + 0.95 || e.y + (e.height || 1.8) < this.y) continue;
      this.getroffen.push(e);
      e.hurt(Math.min(40, Math.round(Math.max(0, this.startY - this.y) * 2)), null, game);
      game.audio.play('thud');
    }
  };

  // Wo der Block zur Ruhe kommt. Gesucht wird von der eigenen Zelle aus, denn
  // beim Landen steht er ohnehin schon richtig — die Suche fängt nur die
  // Sonderfälle ab: der Fall durchs Wasser, das Absetzen vor dem Speichern.
  FallingBlock.prototype.ruhepunkt = function () {
    var w = this.world, d = this.up ? 1 : -1;
    var bx = Math.floor(this.x), bz = Math.floor(this.z);
    var by = Math.floor(this.y + this.height * 0.5);
    for (var i = 0; i < WH; i++) {
      var ny = by + d;
      if (ny < 0 || ny >= WH) break;
      if (!this.freiFuer(w.getBlock(bx, ny, bz))) break;
      by = ny;
    }
    return by;
  };

  // Luft, Wasser und Gewächs geben nach; eine Fackel, eine Treppe oder eine
  // Truhe nicht. Genau daran hängt der alte Trick, einen Sandfall mit einer
  // Fackel aufzuhalten: der Sand kommt nicht unter, also fällt er als Item.
  FallingBlock.prototype.freiFuer = function (id) {
    if (id === 0 || B.isReplaceable(id)) return true;
    var b = B.byId[id];
    return !!(b && b.shape === B.SHAPE_CROSS);
  };

  FallingBlock.prototype.absetzen = function (game) {
    if (this.dead) return;
    this.dead = true;
    var w = this.world;
    var bx = Math.floor(this.x), bz = Math.floor(this.z);
    var by = this.ruhepunkt();
    var da = by >= 0 && by < WH ? w.getBlock(bx, by, bz) : 1;
    if (by >= 0 && by < WH && this.freiFuer(da)) {
      if (da !== 0 && !B.isReplaceable(da)) game.dropBlock(bx, by, bz, da, w.getMeta(bx, by, bz), null);
      // setBlock verweigert den Dienst in einem nicht geladenen Chunk. Dann
      // fällt der Block lieber als Gegenstand an, als lautlos zu verschwinden.
      if (!w.setBlock(bx, by, bz, this.blockId, this.meta)) { this.alsItem(game); return; }
      game.particles.blockBreak(bx + 0.5, by + (this.up ? 0.15 : 0.85), bz + 0.5, this.blockId, this.meta, 5);
      game.audio.play('thud', 0.45);
    } else {
      this.alsItem(game);
    }
  };

  FallingBlock.prototype.alsItem = function (game) {
    var b = B.byId[this.blockId];
    if (!b) return;
    if (MC.Cmd && !MC.Cmd.regel(game, 'doTileDrops')) return;
    var name = (typeof b.drop === 'string' && b.drop) ? b.drop : b.name;
    if (!I.get(name)) name = b.name;
    if (!I.get(name)) return;
    game.spawnItem(this.x, this.y + 0.2, this.z, { id: name, count: 1 });
  };

  // Vor dem Speichern gehört zurück in die Welt, was noch in der Luft hängt:
  // Entitäten wandern nicht in den Spielstand, der Block wäre sonst weg.
  FallingBlock.alleAbsetzen = function (game) {
    var ents = game.world.entities;
    for (var i = 0; i < ents.length; i++) {
      if (ents[i].type === 'falling' && !ents[i].dead) ents[i].absetzen(game);
    }
  };

  // ============================================================
  //  Explosion
  // ============================================================
  MC.explode = function (game, x, y, z, power, vonMob) {
    var world = game.world;
    // mobGriefing: eine Explosion einer Kreatur schadet dann nur noch, sie
    // reißt aber keine Blöcke mehr weg
    var blockschaden = !(vonMob && MC.Cmd && !MC.Cmd.regel(game, 'mobGriefing'));
    var r = blockschaden ? Math.ceil(power) : 0;
    for (var dx = -r; dx <= r; dx++) {
      for (var dy = -r; dy <= r; dy++) {
        for (var dz = -r; dz <= r; dz++) {
          var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d > power) continue;
          var bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
          if (by < 1 || by >= WH) continue;
          var id = world.getBlock(bx, by, bz);
          if (id === 0) continue;
          var b = B.byId[id];
          if (!b || b.hardness < 0) continue;
          if (b.hardness > 20) continue;
          // TNT wird nicht zerstört, sondern gezündet -> Kettenreaktion
          if (b.name === 'tnt') {
            world.setBlock(bx, by, bz, 0, 0);
            var chained = new TNTEntity(world, bx + 0.5, by, bz + 0.5, 0.5 + Math.random() * 1.2);
            world.entities.push(chained);
            continue;
          }
          if (Math.random() > (1 - d / power) * 1.4) continue;
          if (Math.random() < 0.32 && b.drop) game.dropBlock(bx, by, bz, id, world.getMeta(bx, by, bz), null);
          world.setBlock(bx, by, bz, 0, 0);
        }
      }
    }
    // Schaden & Rückstoß
    var targets = world.entities.concat([game.player]);
    for (var i = 0; i < targets.length; i++) {
      var e = targets[i];
      if (!e || e.dead) continue;
      var ex = e.x - x, ey = e.y + 0.9 - y, ez = e.z - z;
      var dist = Math.sqrt(ex * ex + ey * ey + ez * ez);
      if (dist > power * 2) continue;
      var f = 1 - dist / (power * 2);
      if (e.hurt) e.hurt(Math.round(f * 28), null, game);
      var inv = 1 / Math.max(0.4, dist);
      e.vx += ex * inv * f * 14; e.vy += ey * inv * f * 14 + 4; e.vz += ez * inv * f * 14;
    }
    game.particles.explosion(x, y, z, power);
    game.audio.play('explode');
    game.camShake = 0.8;
  };

  // ============================================================
  //  Mob-Modelle  (Maße in Pixeln, 16 px = 1 Block)
  // ============================================================
  function part(name, tex, x, y, z, w, h, d, anim, pivot) {
    return { name: name, tex: tex, x: x, y: y, z: z, w: w, h: h, d: d, anim: anim || null, pivot: pivot || null };
  }

  var MODELS = {
    pig: {
      height: 0.9, width: 0.9, scale: 1,
      // Der Sattel wird nur gezeichnet, wenn das Tier einen trägt
      sattel: part('sattel', 'saddle_block', -6, 13, -5, 12, 2, 9),
      parts: [
        part('body', 'mob_pig', -5, 6, -8, 10, 8, 16),
        part('head', { all: 'mob_pig', front: 'mob_pig_face' }, -4, 6, -12, 8, 8, 4, 'head', [0, 10, -8]),
        part('leg0', 'mob_pig', -5, 0, -7, 4, 6, 4, 'legFR', [-3, 6, -5]),
        part('leg1', 'mob_pig', 1, 0, -7, 4, 6, 4, 'legFL', [3, 6, -5]),
        part('leg2', 'mob_pig', -5, 0, 3, 4, 6, 4, 'legBR', [-3, 6, 5]),
        part('leg3', 'mob_pig', 1, 0, 3, 4, 6, 4, 'legBL', [3, 6, 5])
      ]
    },
    cow: {
      height: 1.4, width: 0.9, scale: 1,
      parts: [
        part('body', 'mob_cow', -6, 10, -9, 12, 10, 18),
        part('head', { all: 'mob_cow', front: 'mob_cow_face' }, -4, 14, -14, 8, 8, 6, 'head', [0, 18, -9]),
        part('horn0', 'mob_cow_horn', -6, 20, -12, 2, 2, 2, 'head', [0, 18, -9]),
        part('horn1', 'mob_cow_horn', 4, 20, -12, 2, 2, 2, 'head', [0, 18, -9]),
        part('leg0', 'mob_cow', -6, 0, -8, 4, 10, 4, 'legFR', [-4, 10, -6]),
        part('leg1', 'mob_cow', 2, 0, -8, 4, 10, 4, 'legFL', [4, 10, -6]),
        part('leg2', 'mob_cow', -6, 0, 4, 4, 10, 4, 'legBR', [-4, 10, 6]),
        part('leg3', 'mob_cow', 2, 0, 4, 4, 10, 4, 'legBL', [4, 10, 6])
      ]
    },
    sheep: {
      height: 1.3, width: 0.9, scale: 1,
      parts: [
        part('body', 'WOOL', -6, 9, -9, 12, 11, 17),
        part('head', { all: 'mob_sheep_skin', front: 'mob_sheep_face' }, -3, 12, -13, 6, 6, 5, 'head', [0, 15, -9]),
        part('leg0', 'mob_sheep_skin', -5, 0, -7, 4, 9, 4, 'legFR', [-3, 9, -5]),
        part('leg1', 'mob_sheep_skin', 1, 0, -7, 4, 9, 4, 'legFL', [3, 9, -5]),
        part('leg2', 'mob_sheep_skin', -5, 0, 4, 4, 9, 4, 'legBR', [-3, 9, 6]),
        part('leg3', 'mob_sheep_skin', 1, 0, 4, 4, 9, 4, 'legBL', [3, 9, 6])
      ]
    },
    chicken: {
      height: 0.7, width: 0.5, scale: 1,
      parts: [
        part('body', 'mob_chicken', -3, 5, -4, 6, 6, 8),
        part('head', { all: 'mob_chicken', front: 'mob_chicken_face' }, -2, 9, -6, 4, 5, 3, 'head', [0, 10, -3]),
        part('wingR', 'mob_chicken', -4, 6, -3, 1, 4, 6, 'wingR', [-3, 10, 0]),
        part('wingL', 'mob_chicken', 3, 6, -3, 1, 4, 6, 'wingL', [3, 10, 0]),
        part('leg0', 'mob_chicken_leg', -2, 0, -1, 1, 5, 3, 'legFR', [-1, 5, 0]),
        part('leg1', 'mob_chicken_leg', 1, 0, -1, 1, 5, 3, 'legFL', [1, 5, 0])
      ]
    },
    // Der Schleim: derselbe Aufbau wie der Magmawuerfel. Seine Groesse haengt
    // an mob.groesse und wird im Renderer ueber die Skalierung geregelt.
    slime: {
      // Der Klumpen misst im Modell zwoelf Einheiten, also drei Viertel Block.
      // Die Trefferbox eines grossen Schleims ist 1,4 breit — ohne die
      // Streckung sass ein sichtbar zu kleiner Wuerfel in einer zu grossen Box.
      height: 1.0, width: 1.0, scale: 1.87,
      parts: [
        part('kern', 'mob_slime_core', -5, 1, -5, 10, 10, 10),
        part('huelleO', { all: 'mob_slime', front: 'mob_slime_face' }, -6, 8, -6, 12, 5, 12),
        part('huelleU', 'mob_slime', -6, 0, -6, 12, 5, 12)
      ]
    },
    // Die Spinne: Hinterleib, Brust, Kopf und acht Beine. Die vier Paare setzen
    // von vorn nach hinten am Koerper an; nach aussen und nach unten geknickt
    // werden sie erst in animRot(). So stehen die Winkel an einer Stelle statt
    // achtmal von Hand im Modell, wo sie beim naechsten Massstabswechsel nicht
    // mehr passen wuerden.
    spider: {
      height: 0.9, width: 1.4, scale: 1,
      parts: [
        part('hinterleib', 'mob_spider', -5, 4, 2, 10, 8, 12),
        part('brust', 'mob_spider', -3, 5, -4, 6, 6, 6),
        part('kopf', { all: 'mob_spider', front: 'mob_spider_face' }, -4, 5, -12, 8, 8, 8),
        part('beinR0', 'mob_spider_leg', -19, 9, -5, 16, 2, 2, 'spinneR0', [-3, 10, -4]),
        part('beinL0', 'mob_spider_leg', 3, 9, -5, 16, 2, 2, 'spinneL0', [3, 10, -4]),
        part('beinR1', 'mob_spider_leg', -19, 9, -2, 16, 2, 2, 'spinneR1', [-3, 10, -1]),
        part('beinL1', 'mob_spider_leg', 3, 9, -2, 16, 2, 2, 'spinneL1', [3, 10, -1]),
        part('beinR2', 'mob_spider_leg', -19, 9, 1, 16, 2, 2, 'spinneR2', [-3, 10, 2]),
        part('beinL2', 'mob_spider_leg', 3, 9, 1, 16, 2, 2, 'spinneL2', [3, 10, 2]),
        part('beinR3', 'mob_spider_leg', -19, 9, 4, 16, 2, 2, 'spinneR3', [-3, 10, 5]),
        part('beinL3', 'mob_spider_leg', 3, 9, 4, 16, 2, 2, 'spinneL3', [3, 10, 5])
      ]
    },
    // Herobrine hat Steves Maße – er soll aussehen wie ein Spieler, der dort
    // steht, wo keiner stehen sollte.
    herobrine: {
      height: 1.85, width: 0.6, scale: 0.94,
      parts: [
        part('head', { all: 'mob_herobrine', front: 'mob_herobrine_face' }, -4, 24, -4, 8, 8, 8, 'head', [0, 24, 0]),
        part('body', 'mob_herobrine_shirt', -4, 12, -2, 8, 12, 4),
        part('armR', 'mob_herobrine_shirt', -8, 12, -2, 4, 12, 4, 'armZ', [-6, 23, 0]),
        part('armL', 'mob_herobrine_shirt', 4, 12, -2, 4, 12, 4, 'armZ', [6, 23, 0]),
        part('legR', 'mob_herobrine_hose', -4, 0, -2, 4, 12, 4, 'legFR', [-2, 12, 0]),
        part('legL', 'mob_herobrine_hose', 0, 0, -2, 4, 12, 4, 'legFL', [2, 12, 0])
      ]
    },
    zombie: {
      height: 1.85, width: 0.6, scale: 0.94,
      parts: [
        part('head', { all: 'mob_zombie', front: 'mob_zombie_face' }, -4, 24, -4, 8, 8, 8, 'head', [0, 24, 0]),
        part('body', 'mob_zombie_shirt', -4, 12, -2, 8, 12, 4),
        part('armR', 'mob_zombie', -8, 12, -2, 4, 12, 4, 'armZ', [-6, 23, 0]),
        part('armL', 'mob_zombie', 4, 12, -2, 4, 12, 4, 'armZ', [6, 23, 0]),
        part('legR', 'mob_zombie_shirt', -4, 0, -2, 4, 12, 4, 'legFR', [-2, 12, 0]),
        part('legL', 'mob_zombie_shirt', 0, 0, -2, 4, 12, 4, 'legFL', [2, 12, 0])
      ]
    },
    skeleton: {
      height: 1.85, width: 0.6, scale: 0.94,
      parts: [
        part('head', { all: 'mob_skeleton', front: 'mob_skeleton_face' }, -4, 24, -4, 8, 8, 8, 'head', [0, 24, 0]),
        part('body', 'mob_skeleton', -4, 12, -2, 8, 12, 4),
        part('armR', 'mob_skeleton', -7, 12, -1, 3, 12, 2, 'armZ', [-5, 23, 0]),
        part('armL', 'mob_skeleton', 4, 12, -1, 3, 12, 2, 'armZ', [5, 23, 0]),
        part('legR', 'mob_skeleton', -3, 0, -1, 2, 12, 2, 'legFR', [-2, 12, 0]),
        part('legL', 'mob_skeleton', 1, 0, -1, 2, 12, 2, 'legFL', [2, 12, 0])
      ]
    },
    creeper: {
      height: 1.7, width: 0.6, scale: 1,
      parts: [
        part('head', { all: 'mob_creeper', front: 'mob_creeper_face' }, -4, 18, -4, 8, 8, 8, 'head', [0, 18, 0]),
        part('body', 'mob_creeper', -4, 6, -2, 8, 12, 4),
        part('leg0', 'mob_creeper', -4, 0, -6, 4, 6, 4, 'legFR', [-2, 6, -4]),
        part('leg1', 'mob_creeper', 0, 0, -6, 4, 6, 4, 'legFL', [2, 6, -4]),
        part('leg2', 'mob_creeper', -4, 0, 2, 4, 6, 4, 'legBR', [-2, 6, 4]),
        part('leg3', 'mob_creeper', 0, 0, 2, 4, 6, 4, 'legBL', [2, 6, 4])
      ]
    },
    // ---- Nether ----
    piglin: {
      height: 1.9, width: 0.6, scale: 0.95,
      parts: [
        part('head', { all: 'mob_piglin', front: 'mob_piglin_face' }, -4, 24, -4, 8, 8, 8, 'head', [0, 24, 0]),
        part('body', 'mob_piglin_shirt', -4, 12, -2, 8, 12, 4),
        part('armR', 'mob_piglin', -8, 12, -2, 4, 12, 4, 'armZ', [-6, 23, 0]),
        part('armL', 'mob_piglin', 4, 12, -2, 4, 12, 4, 'armZ', [6, 23, 0]),
        part('legR', 'mob_piglin_shirt', -4, 0, -2, 4, 12, 4, 'legFR', [-2, 12, 0]),
        part('legL', 'mob_piglin_shirt', 0, 0, -2, 4, 12, 4, 'legFL', [2, 12, 0])
      ]
    },
    fish: {
      height: 0.4, width: 0.5, scale: 0.55,
      parts: [
        part('body', { all: 'mob_fish', front: 'mob_fish_face' }, -3, 0, -5, 6, 5, 10),
        part('tail', 'mob_fish', -1, 1, 5, 2, 4, 4, 'tentacle', [0, 3, 5]),
        part('finR', 'mob_fish', -5, 1, -2, 2, 1, 4, 'armZ', [-3, 2, 0]),
        part('finL', 'mob_fish', 3, 1, -2, 2, 1, 4, 'armZ', [3, 2, 0])
      ]
    },
    guardian: {
      height: 1.6, width: 1.5, scale: 1.4,
      parts: [
        part('body', { all: 'mob_guardian', front: 'mob_guardian_face' }, -6, 2, -6, 12, 12, 12),
        part('s0', 'mob_guardian', -8, 6, -2, 2, 4, 2, 'tentacle', [-6, 8, 0]),
        part('s1', 'mob_guardian', 6, 6, -2, 2, 4, 2, 'tentacle', [6, 8, 0]),
        part('s2', 'mob_guardian', -1, 14, -1, 2, 4, 2, 'tentacle', [0, 14, 0])
      ]
    },

    // ---- Erste Runde neuer Kreaturen ----
    wither_skeleton: {
      height: 2.4, width: 0.7, scale: 1.2,
      parts: [
        part('head', { all: 'mob_wither_skeleton', front: 'mob_wither_skeleton_face' }, -4, 24, -4, 8, 8, 8, 'head', [0, 24, 0]),
        part('body', 'mob_wither_skeleton', -4, 12, -2, 8, 12, 4),
        part('armR', 'mob_wither_skeleton', -6, 12, -1, 2, 12, 2, 'armZ', [-5, 23, 0]),
        part('armL', 'mob_wither_skeleton', 4, 12, -1, 2, 12, 2, 'armZ', [5, 23, 0]),
        part('legR', 'mob_wither_skeleton', -3, 0, -1, 2, 12, 2, 'legFR', [-2, 12, 0]),
        part('legL', 'mob_wither_skeleton', 1, 0, -1, 2, 12, 2, 'legFL', [2, 12, 0])
      ]
    },
    hoglin: {
      height: 1.4, width: 1.3, scale: 1.25,
      parts: [
        part('body', 'mob_hoglin', -6, 8, -10, 12, 10, 20),
        part('head', { all: 'mob_hoglin', front: 'mob_hoglin_face' }, -5, 8, -14, 10, 9, 5, 'head', [0, 13, -10]),
        part('leg0', 'mob_hoglin', -6, 0, -8, 4, 8, 4, 'legFR', [-4, 8, -6]),
        part('leg1', 'mob_hoglin', 2, 0, -8, 4, 8, 4, 'legFL', [4, 8, -6]),
        part('leg2', 'mob_hoglin', -6, 0, 4, 4, 8, 4, 'legBR', [-4, 8, 6]),
        part('leg3', 'mob_hoglin', 2, 0, 4, 4, 8, 4, 'legBL', [4, 8, 6])
      ]
    },
    piglin_brute: {
      height: 2.1, width: 0.7, scale: 1.08,
      parts: [
        part('head', { all: 'mob_piglin', front: 'mob_piglin_face' }, -4, 24, -4, 8, 8, 8, 'head', [0, 24, 0]),
        part('body', 'mob_brute_shirt', -4, 12, -2, 8, 12, 4),
        part('armR', 'mob_piglin', -9, 12, -3, 5, 13, 5, 'armZ', [-6, 23, 0]),
        part('armL', 'mob_piglin', 4, 12, -3, 5, 13, 5, 'armZ', [6, 23, 0]),
        part('legR', 'mob_brute_shirt', -4, 0, -2, 4, 12, 4, 'legFR', [-2, 12, 0]),
        part('legL', 'mob_brute_shirt', 0, 0, -2, 4, 12, 4, 'legFL', [2, 12, 0])
      ]
    },
    ash_wight: {
      height: 1.1, width: 0.7, scale: 0.85,
      parts: [
        part('body', { all: 'mob_ash_wight', front: 'mob_ash_wight_face' }, -5, 4, -5, 10, 10, 10),
        part('armR', 'mob_ash_wight', -8, 5, -2, 3, 7, 3, 'armZ', [-6, 11, 0]),
        part('armL', 'mob_ash_wight', 5, 5, -2, 3, 7, 3, 'armZ', [6, 11, 0]),
        part('leg0', 'mob_ash_wight', -4, 0, -2, 3, 4, 3, 'legFR', [-2, 4, 0]),
        part('leg1', 'mob_ash_wight', 1, 0, -2, 3, 4, 3, 'legFL', [2, 4, 0])
      ]
    },
    frost_wight: {
      height: 1.3, width: 0.8, scale: 0.95,
      parts: [
        part('body', { all: 'mob_frost_wight', front: 'mob_frost_wight_face' }, -5, 5, -5, 10, 11, 10),
        part('t0', 'mob_frost_wight', -7, 2, -3, 3, 5, 3, 'tentacle', [-5, 5, 0]),
        part('t1', 'mob_frost_wight', 4, 2, -3, 3, 5, 3, 'tentacle', [5, 5, 0]),
        part('t2', 'mob_frost_wight', -2, 0, -2, 4, 4, 4, 'tentacle', [0, 5, 0])
      ]
    },
    aechor_plant: {
      height: 1.1, width: 0.9, scale: 1,
      parts: [
        part('body', 'mob_aechor', -4, 0, -4, 8, 7, 8),
        part('head', { all: 'mob_aechor_petal', front: 'mob_aechor_petal' }, -6, 7, -6, 12, 5, 12, 'head', [0, 9, 0]),
        part('t0', 'mob_aechor', -1, 12, -1, 2, 4, 2, 'tentacle', [0, 12, 0])
      ]
    },
    ghast: {
      height: 3.6, width: 3.6, scale: 3.4,
      parts: [
        part('body', { all: 'mob_ghast', front: 'mob_ghast_face' }, -8, 6, -8, 16, 16, 16),
        part('t0', 'mob_ghast', -6, 1, -6, 2, 6, 2, 'tentacle', [-5, 6, -5]),
        part('t1', 'mob_ghast', 4, 1, -6, 2, 6, 2, 'tentacle', [5, 6, -5]),
        part('t2', 'mob_ghast', -6, 1, 4, 2, 6, 2, 'tentacle', [-5, 6, 5]),
        part('t3', 'mob_ghast', 4, 1, 4, 2, 6, 2, 'tentacle', [5, 6, 5]),
        part('t4', 'mob_ghast', -1, 1, -1, 2, 7, 2, 'tentacle', [0, 6, 0])
      ]
    },
    magma_cube: {
      height: 1.0, width: 1.0, scale: 1,
      parts: [
        part('core', 'mob_magma_core', -5, 1, -5, 10, 10, 10),
        part('shellT', { all: 'mob_magma', front: 'mob_magma_face' }, -6, 8, -6, 12, 5, 12),
        part('shellB', 'mob_magma', -6, 0, -6, 12, 5, 12)
      ]
    },
    // Lohe: ein schwebender Kopf, umkreist von zwei Ringen brennender Ruten
    blaze: {
      height: 1.8, width: 0.6, scale: 1,
      parts: [
        part('head', { all: 'mob_blaze', front: 'mob_blaze_face' }, -4, 14, -4, 8, 8, 8),
        part('r0', 'mob_blaze_rod', -7, 6, -1, 2, 8, 2, 'blazeRing', [0, 10, 0]),
        part('r1', 'mob_blaze_rod', 5, 6, -1, 2, 8, 2, 'blazeRing', [0, 10, 0]),
        part('r2', 'mob_blaze_rod', -1, 6, -7, 2, 8, 2, 'blazeRing', [0, 10, 0]),
        part('r3', 'mob_blaze_rod', -1, 6, 5, 2, 8, 2, 'blazeRing', [0, 10, 0]),
        part('r4', 'mob_blaze_rod', -5, 0, -5, 2, 8, 2, 'blazeRing2', [0, 4, 0]),
        part('r5', 'mob_blaze_rod', 3, 0, -5, 2, 8, 2, 'blazeRing2', [0, 4, 0]),
        part('r6', 'mob_blaze_rod', -5, 0, 3, 2, 8, 2, 'blazeRing2', [0, 4, 0]),
        part('r7', 'mob_blaze_rod', 3, 0, 3, 2, 8, 2, 'blazeRing2', [0, 4, 0])
      ]
    },
    // Enderman: knapp drei Blöcke hoch, dünn, mit leuchtenden Augen
    enderman: {
      height: 2.9, width: 0.6, scale: 1,
      parts: [
        part('head', { all: 'mob_enderman', front: 'mob_enderman_face' }, -4, 40, -4, 8, 8, 8, 'head', [0, 40, 0]),
        part('body', 'mob_enderman', -4, 26, -2, 8, 14, 4),
        part('armR', 'mob_enderman', -6, 8, -1, 2, 22, 2, 'armZ', [-5, 30, 0]),
        part('armL', 'mob_enderman', 4, 8, -1, 2, 22, 2, 'armZ', [5, 30, 0]),
        part('legR', 'mob_enderman', -3, 0, -1, 2, 26, 2, 'legFR', [-2, 26, 0]),
        part('legL', 'mob_enderman', 1, 0, -1, 2, 26, 2, 'legFL', [2, 26, 0])
      ]
    },
    // ---- Aether ----
    moa: {
      height: 1.9, width: 0.8, scale: 1,
      sattel: part('sattel', 'saddle_block', -5, 16, -4, 10, 2, 9),
      parts: [
        part('body', 'MOA', -4, 8, -5, 8, 9, 12),
        part('neck', 'MOA', -2, 14, -6, 4, 9, 4, 'head', [0, 15, -4]),
        part('head', { all: 'MOA', front: 'mob_moa_face' }, -3, 22, -8, 6, 5, 6, 'head', [0, 15, -4]),
        part('wingR', 'MOA', -6, 10, -3, 2, 7, 8, 'wingR', [-4, 16, 0]),
        part('wingL', 'MOA', 4, 10, -3, 2, 7, 8, 'wingL', [4, 16, 0]),
        part('legR', 'mob_chicken_leg', -3, 0, -2, 2, 9, 2, 'legFR', [-2, 9, 0]),
        part('legL', 'mob_chicken_leg', 1, 0, -2, 2, 9, 2, 'legFL', [2, 9, 0])
      ]
    },
    phyg: {
      height: 0.9, width: 0.9, scale: 1,
      sattel: part('sattel', 'saddle_block', -6, 13, -5, 12, 2, 9),
      parts: [
        part('body', 'mob_phyg', -5, 6, -8, 10, 8, 16),
        part('head', { all: 'mob_phyg', front: 'mob_phyg_face' }, -4, 6, -12, 8, 8, 4, 'head', [0, 10, -8]),
        part('wingR', 'mob_phyg_wing', -9, 11, -4, 4, 1, 9, 'wingR', [-5, 12, 0]),
        part('wingL', 'mob_phyg_wing', 5, 11, -4, 4, 1, 9, 'wingL', [5, 12, 0]),
        part('leg0', 'mob_phyg', -5, 0, -7, 4, 6, 4, 'legFR', [-3, 6, -5]),
        part('leg1', 'mob_phyg', 1, 0, -7, 4, 6, 4, 'legFL', [3, 6, -5]),
        part('leg2', 'mob_phyg', -5, 0, 3, 4, 6, 4, 'legBR', [-3, 6, 5]),
        part('leg3', 'mob_phyg', 1, 0, 3, 4, 6, 4, 'legBL', [3, 6, 5])
      ]
    },
    sheepuff: {
      height: 1.0, width: 0.9, scale: 1,
      parts: [
        part('body', 'mob_sheepuff', -5, 7, -9, 11, 10, 18),
        part('head', { all: 'mob_sheepuff', front: 'mob_sheepuff_face' }, -3, 8, -13, 6, 6, 6, 'head', [0, 11, -9]),
        part('leg0', 'mob_sheepuff', -5, 0, -7, 4, 8, 4, 'legFR', [-3, 8, -5]),
        part('leg1', 'mob_sheepuff', 1, 0, -7, 4, 8, 4, 'legFL', [3, 8, -5]),
        part('leg2', 'mob_sheepuff', -5, 0, 4, 4, 8, 4, 'legBR', [-3, 8, 6]),
        part('leg3', 'mob_sheepuff', 1, 0, 4, 4, 8, 4, 'legBL', [3, 8, 6])
      ]
    },
    zephyr: {
      height: 2.2, width: 2.2, scale: 2.1,
      parts: [
        part('body', { all: 'mob_zephyr', front: 'mob_zephyr_face' }, -8, 4, -8, 16, 14, 16),
        part('t0', 'mob_zephyr', -5, 0, -5, 2, 5, 2, 'tentacle', [-4, 4, -4]),
        part('t1', 'mob_zephyr', 3, 0, -5, 2, 5, 2, 'tentacle', [4, 4, -4]),
        part('t2', 'mob_zephyr', -5, 0, 3, 2, 5, 2, 'tentacle', [-4, 4, 4]),
        part('t3', 'mob_zephyr', 3, 0, 3, 2, 5, 2, 'tentacle', [4, 4, 4])
      ]
    },
    cockatrice: {
      height: 1.6, width: 0.7, scale: 1,
      parts: [
        part('body', 'mob_cockatrice', -3, 7, -4, 7, 8, 10),
        part('neck', 'mob_cockatrice', -2, 13, -5, 4, 7, 4, 'head', [0, 14, -3]),
        part('head', { all: 'mob_cockatrice', front: 'mob_cockatrice_face' }, -3, 19, -7, 6, 5, 6, 'head', [0, 14, -3]),
        part('wingR', 'mob_cockatrice', -5, 9, -2, 2, 6, 7, 'wingR', [-3, 14, 0]),
        part('wingL', 'mob_cockatrice', 3, 9, -2, 2, 6, 7, 'wingL', [3, 14, 0]),
        part('legR', 'mob_chicken_leg', -2, 0, -1, 2, 7, 2, 'legFR', [-1, 7, 0]),
        part('legL', 'mob_chicken_leg', 0, 0, -1, 2, 7, 2, 'legFL', [1, 7, 0])
      ]
    },
    // ---- Das Ende ----
    // Maßstab 2,6 statt 1: der Drache misst so gut zehn Blöcke von der
    // Schnauze bis zur Schwanzspitze und ebenso viel von Flügel zu Flügel.
    ender_dragon: {
      height: 3.0, width: 6.0, scale: 2.6,
      parts: [
        part('body', 'mob_dragon', -5, 5, -10, 10, 8, 22),
        part('neck', 'mob_dragon', -3, 9, -18, 6, 6, 9, 'dragonNeck', [0, 11, -10]),
        part('head', { all: 'mob_dragon', front: 'mob_dragon_face' }, -4, 9, -27, 8, 7, 10, 'dragonHead', [0, 11, -18]),
        part('jaw', 'mob_dragon', -3, 6, -26, 6, 3, 8, 'dragonJaw', [0, 11, -18]),
        part('wingR', 'mob_dragon_wing', -31, 11, -6, 26, 1, 14, 'wingR', [-5, 12, 0]),
        part('wingL', 'mob_dragon_wing', 5, 11, -6, 26, 1, 14, 'wingL', [5, 12, 0]),
        part('tail1', 'mob_dragon', -3, 6, 12, 6, 6, 12, 'dragonTail1', [0, 9, 12]),
        part('tail2', 'mob_dragon', -2, 7, 24, 4, 4, 12, 'dragonTail2', [0, 9, 24]),
        part('legR', 'mob_dragon', -8, 0, -4, 4, 6, 4, 'legFR', [-6, 6, -2]),
        part('legL', 'mob_dragon', 4, 0, -4, 4, 6, 4, 'legFL', [6, 6, -2])
      ]
    },
    end_crystal: {
      height: 1.4, width: 1.0, scale: 1,
      parts: [part('core', 'end_crystal', -5, 4, -5, 10, 10, 10, 'crystalSpin', [0, 9, 0])]
    },
    villager: {
      height: 1.9, width: 0.6, scale: 0.95,
      parts: [
        part('head', { all: 'mob_villager', front: 'mob_villager_face' }, -4, 24, -4, 8, 8, 8, 'head', [0, 24, 0]),
        part('nase', 'mob_villager_nose', -1, 26, -6, 2, 4, 2, 'head', [0, 24, 0]),
        part('body', 'ROBE', -4, 12, -3, 8, 12, 6),
        part('armR', 'ROBE', -7, 15, -3, 4, 9, 4, 'armCross', [-4, 22, -1]),
        part('armL', 'ROBE', 3, 15, -3, 4, 9, 4, 'armCross', [4, 22, -1]),
        part('legR', 'ROBE', -4, 0, -2, 4, 12, 4, 'legFR', [-2, 12, 0]),
        part('legL', 'ROBE', 0, 0, -2, 4, 12, 4, 'legFL', [2, 12, 0])
      ]
    },
    player: {
      height: 1.8, width: 0.6, scale: 0.92,
      parts: [
        part('head', { all: 'player_skin', front: 'player_face' }, -4, 24, -4, 8, 8, 8, 'head', [0, 24, 0]),
        part('body', 'player_skin', -4, 12, -2, 8, 12, 4),
        part('armR', 'mob_player_arm', -8, 12, -2, 4, 12, 4, 'armSwingR', [-6, 23, 0]),
        part('armL', 'mob_player_arm', 4, 12, -2, 4, 12, 4, 'armSwingL', [6, 23, 0]),
        part('legR', 'player_skin', -4, 0, -2, 4, 12, 4, 'legFR', [-2, 12, 0]),
        part('legL', 'player_skin', 0, 0, -2, 4, 12, 4, 'legFL', [2, 12, 0])
      ]
    }
  };
  MC.MODELS = MODELS;

  // ============================================================
  //  Mob
  // ============================================================
  var MOB_TYPES = {
    // Trefferpunkte durchgehend wie im Original. Vier Werte wichen davon ab
    // (Piglin 20, Magmawuerfel 12, Hoglin 24, Hauer 30) — ohne Absicht, die
    // uebrigen dreiundzwanzig stimmten exakt.
    pig: { reitbar: true, reitsprung: 9.2, futter: 'apple', hp: 10, hostile: false, speed: 2.1, drops: [{ id: 'porkchop_raw', min: 1, max: 3 }], xp: 2, sound: 'pig' },
    cow: { futter: 'wheat_item', hp: 10, hostile: false, speed: 2.0, drops: [{ id: 'beef_raw', min: 1, max: 3 }, { id: 'leather', min: 0, max: 2 }], xp: 2, sound: 'cow' },
    sheep: { futter: 'wheat_item', hp: 8, hostile: false, speed: 2.0, drops: [{ id: 'mutton_raw', min: 1, max: 2 }], xp: 2, sound: 'sheep' },
    chicken: { futter: 'seeds', hp: 4, hostile: false, speed: 1.8, drops: [{ id: 'chicken_raw', min: 1, max: 1 }, { id: 'feather', min: 0, max: 2 }], xp: 1, sound: 'chicken' },
    // Er greift nicht an, er nimmt keinen Schaden, er bewegt sich nicht von
    // selbst. Alles, was er tut, steuert herobrine.js.
    herobrine: { hp: 1, hostile: false, speed: 0, steht: true, starr: true, damage: 0, drops: [], xp: 0, unsterblich: true },
    // Verfaultes Fleisch gibt es hier nicht, also lassen Zombies Eisen fallen
    // wie im Original ihre seltene Beute. Vorher stand hier ein Eintrag mit
    // min 0 und max 0 - ein Platzhalter, der nie etwas ergab.
    zombie: { hp: 20, hostile: true, speed: 2.4, damage: 3, drops: [{ id: 'iron_ingot', min: 0, max: 1 }], xp: 5, sound: 'zombie', burns: true },
    skeleton: { hp: 20, hostile: true, speed: 2.5, damage: 2, ranged: true, drops: [{ id: 'bone', min: 0, max: 2 }, { id: 'arrow', min: 0, max: 2 }], xp: 5, sound: 'skeleton', burns: true },
    creeper: { hp: 20, hostile: true, speed: 2.2, damage: 0, drops: [{ id: 'gunpowder', min: 0, max: 2 }], xp: 5, sound: 'creeper' },
    villager: { hp: 20, hostile: false, speed: 1.5, drops: [], xp: 0, sound: 'villager' },
    // Der Schleim huepft und teilt sich beim Sterben in zwei kleinere. Erst die
    // kleinste Stufe laesst Schleimbaelle fallen — im Original genauso, und es
    // ist der Grund, warum man ihn nicht einfach einmal erschlaegt.
    slime: { hp: 16, hostile: true, speed: 1.4, damage: 2, hop: true, teilt: true,
      drops: [{ id: 'slimeball', min: 1, max: 2 }], xp: 4, sound: 'thud' },
    // Die Spinne klettert an Waenden hoch und ist nur im Dunkeln feindlich —
    // beides wie im Original. Ihr Faden ist die einzige Quelle ausserhalb der
    // Spinnweben in den verlassenen Minen; ohne sie hing der Bogen an einem
    // Minenfund.
    spider: { hp: 16, hostile: true, speed: 2.6, damage: 2, klettert: true, lichtscheu: true,
      drops: [{ id: 'string', min: 0, max: 2 }], xp: 5, sound: 'spider' },

    // ---- Nether ----
    piglin: { hp: 16, hostile: true, speed: 2.3, damage: 4, drops: [{ id: 'gold_ingot', min: 0, max: 1 }, { id: 'porkchop_raw', min: 0, max: 1 }], xp: 5, sound: 'pig', fireproof: true },
    ghast: { hp: 10, hostile: true, speed: 1.6, damage: 0, ranged: true, flying: true, projectile: 'fireball', drops: [{ id: 'gunpowder', min: 0, max: 2 }, { id: 'ghast_tear', min: 0, max: 1 }], xp: 5, sound: 'ghast', fireproof: true },
    magma_cube: { hp: 16, hostile: true, speed: 1.9, damage: 3, hop: true, drops: [{ id: 'magma_block', min: 0, max: 1 }, { id: 'slimeball', min: 0, max: 2 }], xp: 4, sound: 'thud', fireproof: true },
    // Lohe: einzige Quelle für Lohenruten, darum nur bei den Bastionen
    blaze: { hp: 20, hostile: true, speed: 1.5, damage: 5, ranged: true, flying: true, projectile: 'flame', drops: [{ id: 'blaze_rod', min: 1, max: 2 }], xp: 10, sound: 'fizz', fireproof: true },

    // ---- Meer ----
    // Fisch: Schwarmtier, das im Wasser bleibt und an Land erstickt
    fish: { hp: 3, hostile: false, speed: 1.6, damage: 0, schwimmt: true,
      drops: [{ id: 'fish_raw', min: 1, max: 1 }], xp: 1, sound: 'splash' },
    // Wächter: bewacht den Tempel
    guardian: { hp: 30, hostile: true, speed: 1.4, damage: 6, schwimmt: true, ranged: true,
      drops: [{ id: 'prismarine_shard', min: 1, max: 3 }, { id: 'prismarine_crystals', min: 0, max: 1 }, { id: 'fish_raw', min: 0, max: 1 }],
      xp: 10, sound: 'splash' },

    // ---- Erste Runde neuer Kreaturen ----
    // Das Witherskelett ist der Grund, ins Seelensandtal zu gehen: sein Treffer
    // verdorrt, und Verdorren hebt die Regeneration auf.
    wither_skeleton: { hp: 20, hostile: true, speed: 2.4, damage: 5, effekt: 'verdorren', effektZeit: 8,
      drops: [{ id: 'bone', min: 0, max: 2 }, { id: 'coal', min: 0, max: 2 }], xp: 8, sound: 'skeleton', fireproof: true },
    // Der Hoglin rennt an und schleudert weg. Nethergewächs verscheucht ihn –
    // wer im Karmesinwald baut, pflanzt sich einen Zaun.
    hoglin: { hp: 40, hostile: true, speed: 2.6, damage: 5, ansturm: true, scheut: 'nether_wart',
      drops: [{ id: 'porkchop_raw', min: 2, max: 4 }, { id: 'leather', min: 0, max: 1 }], xp: 6, sound: 'pig', fireproof: true },
    // Nimmt kein Gold und handelt nicht – der Grund, weshalb man eine Bastion
    // nicht einfach ausräumt.
    piglin_brute: { hp: 50, hostile: true, speed: 2.4, damage: 7,
      drops: [{ id: 'gold_ingot', min: 1, max: 2 }], xp: 10, sound: 'pig', fireproof: true },
    // Zerfällt beim Tod in eine Aschewolke
    ash_wight: { hp: 12, hostile: true, speed: 2.0, damage: 3, ascheTod: true,
      drops: [{ id: 'coal', min: 1, max: 2 }, { id: 'blackstone', min: 0, max: 2 }], xp: 5, sound: 'fizz', fireproof: true },
    // Gegenstück im Aether: sein Treffer bremst
    frost_wight: { hp: 14, hostile: true, speed: 1.7, damage: 3, flying: true, effekt: 'langsamkeit', effektZeit: 6,
      drops: [{ id: 'icestone', min: 1, max: 2 }], xp: 5, sound: 'ghast' },
    // Steht fest und schießt. Ihre Schote ist die Heiltrankzutat des Aethers.
    aechor_plant: { hp: 12, hostile: true, speed: 0, steht: true, damage: 1, ranged: true, projectile: 'stachel', braucht: ['aether_grass'],
      drops: [{ id: 'aechor_petal', min: 1, max: 2 }], xp: 4, sound: 'grass' },
    // ---- Enderman: überall zu Hause, friedlich bis man ihn anstarrt ----
    // Zwei Perlen als Höchstwert: für zwölf Augen wären 0–1 wie im Original
    // hier zu zäh, weil deutlich weniger Endermen unterwegs sind
    enderman: { hp: 40, hostile: false, speed: 3.4, damage: 7, drops: [{ id: 'ender_pearl', min: 0, max: 2 }], xp: 5, sound: 'enderman' },
    // ---- Aether ----
    moa: { reitbar: true, reitsprung: 13.5, futter: 'blueberries', hp: 14, hostile: false, speed: 2.2, drops: [{ id: 'feather', min: 1, max: 3 }], xp: 3, sound: 'chicken' },
    phyg: { reitbar: true, reitsprung: 11, fliegt: true, futter: 'apple', hp: 10, hostile: false, speed: 2.0, drops: [{ id: 'porkchop_raw', min: 1, max: 2 }], xp: 2, sound: 'pig' },
    sheepuff: { futter: 'wheat_item', hp: 8, hostile: false, speed: 1.9, drops: [{ id: 'mutton_raw', min: 1, max: 2 }], xp: 2, sound: 'sheep' },
    zephyr: { hp: 8, hostile: true, speed: 1.5, damage: 0, ranged: true, flying: true, drops: [{ id: 'aercloud', min: 0, max: 2 }], xp: 4, sound: 'ghast' },
    cockatrice: { hp: 14, hostile: true, speed: 2.4, damage: 3, drops: [{ id: 'feather', min: 0, max: 2 }], xp: 5, sound: 'chicken' }
  };
  MC.MOB_TYPES = MOB_TYPES;

  function Mob(world, type, x, y, z) {
    Entity.call(this, world, x, y, z);
    var spec = MOB_TYPES[type];
    var model = MODELS[type];
    this.mobType = type;
    this.spec = spec;
    this.model = model;
    this.type = 'mob';
    this.isMob = true;
    this.width = model.width;
    this.height = model.height;
    this.hp = spec.hp;
    this.maxHp = spec.hp;
    // Der Schleim gibt es in drei Groessen. Wie im Original haengt alles an
    // dieser einen Zahl: Trefferpunkte sind ihr Quadrat, der Schaden ist sie
    // selbst, und die kleinste Stufe tut gar nichts.
    if (spec.teilt) this.setzeGroesse(4);
    this.hostile = spec.hostile;
    this.speed = spec.speed;
    this.walkTime = 0;
    this.hurtTime = 0;
    this.attackCd = 0;
    this.wanderCd = 0;
    this.targetYaw = Math.random() * 6.28;
    this.moving = false;
    this.fuse = -1;
    this.jumpCd = 0;
    this.gereizt = 0;      // Lichtscheue: wie lange ein Treffer noch nachwirkt
    this.headYaw = 0; this.headPitch = 0;
    this.burning = 0;
    this.woolColor = null;
    this.sheared = false;
    // ---- Tiere: Zucht, Nachwuchs, Reiten ----
    this.baby = false;
    this.liebe = 0;        // Restzeit der Paarungsbereitschaft
    this.zuchtCd = 0;      // Sperre nach einem Wurf
    this.wachstum = 0;     // Restzeit, bis ein Junges erwachsen ist
    this.zahm = 0;         // wie oft gefüttert (Reittiere)
    this.gesattelt = false;
    this.reiter = null;
    this.panic = 0;
    if (type === 'sheep') {
      var cols = B.WOOL_COLORS;
      var r = Math.random();
      this.woolColor = r < 0.78 ? 'white' : cols[(Math.random() * cols.length) | 0][0];
    }
    if (type === 'moa') {
      var mc = ['blue', 'white', 'black'];
      this.moaColor = mc[(Math.random() * mc.length) | 0];
    }
  }
  Mob.prototype = Object.create(Entity.prototype);
  Mob.prototype.constructor = Mob;
  MC.Mob = Mob;

  // Beruf, Roben-Textur und Angebote setzen (Dorf-Id + Platznummer -> immer gleich)
  Mob.prototype.makeVillager = function (villageId, slot, home, house, dorf) {
    var d = MC.Village.villagerData(villageId, slot);
    this.dorf = dorf || null;      // Layout mit dem Wegenetz
    this.villageId = villageId;
    this.slot = slot;
    this.home = home;
    this.house = house || null;
    this.doorCd = 0;
    this.profession = d.profession;
    this.professionTitle = d.title;
    this.robe = d.robe;
    this.offers = d.offers;

    // Erzeugung liefert das Angebot, die Welt den Verbrauch. Erst beides
    // zusammen ergibt den Stand, den der Spieler hinterlassen hat.
    var V = MC.Village;
    V.nachschub(this.world, villageId);
    var pz = V.platzZustand(this.world, villageId, slot, false);
    var zust = V.zustand(this.world, villageId, false);
    var rabatt = V.rufRabatt(zust ? zust.ruf : 0);
    for (var i = 0; i < this.offers.length; i++) {
      var o = this.offers[i];
      if (pz && pz.uses[i]) o.uses = Math.min(o.max, pz.uses[i]);
      // Der Ruf schlägt sich im Preis nieder — aber nie unter einem Smaragd,
      // und nur dort, wo überhaupt mit Smaragden bezahlt wird.
      if (rabatt) {
        for (var q = 0; q < o.give.length; q++) {
          if (o.give[q][0] !== 'emerald') continue;
          o.give[q] = [o.give[q][0], Math.max(1, o.give[q][1] + rabatt)];
        }
      }
    }
    return this;
  };

  // Ein getätigter Handel: der Verbrauch gehört in die Welt, nicht an die
  // Kreatur — sie verschwindet beim Entladen, die Welt bleibt.
  Mob.prototype.handelNotieren = function (idx) {
    if (this.mobType !== 'villager' || !MC.Village || this.villageId === undefined) return;
    var pz = MC.Village.platzZustand(this.world, this.villageId, this.slot, true);
    pz.uses[idx] = (pz.uses[idx] || 0) + 1;
    MC.Village.rufAendern(this.world, this.villageId, 1);
  };

  Mob.prototype.update = function (dt, game) {
    this.age += dt;
    if (this.hurtTime > 0) this.hurtTime -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.jumpCd > 0) this.jumpCd -= dt;
    if (this.panic > 0) this.panic -= dt;
    if (this.knockCd > 0) this.knockCd -= dt;

    var world = this.world, p = game.player;
    var dist = p && !p.dead ? this.distTo(p) : 9999;

    // Tiere: Zucht, Nachwuchs, Locken, Reiten. Steht hier vorn, weil ein
    // getragenes oder verliebtes Tier keine eigene Wanderlust mehr braucht.
    if (this.tierTick(dt, game, p, dist)) return;

    // Was die Kreatur scheut, hält sie auf Abstand. Beim Hoglin ist das
    // Nethergewächs – damit lässt sich ein Gehöft im Karmesinwald einzäunen.
    if (this.spec.scheut && (game.tickCount % 10) === 0) {
      var scheuId = B.id(this.spec.scheut);
      var fliehe = false;
      for (var sdx = -2; sdx <= 2 && !fliehe; sdx++) {
        for (var sdz = -2; sdz <= 2; sdz++) {
          for (var sdy = 0; sdy <= 1; sdy++) {
            if (world.getBlock(Math.floor(this.x) + sdx, Math.floor(this.y) + sdy, Math.floor(this.z) + sdz) === scheuId) {
              fliehe = true; break;
            }
          }
        }
      }
      if (fliehe) this.panic = Math.max(this.panic, 1.6);
    }

    // Lichtscheu: nur im Dunkeln greift sie von sich aus an. Wer sie schlaegt,
    // hat sie am Hals, egal wie hell es ist — der Reiz haelt an, bis sie ihn
    // verliert. Das Original macht es genauso.
    if (this.spec.lichtscheu) {
      if (this.gereizt > 0) { this.gereizt -= dt; this.hostile = true; }
      else {
        var hx = Math.floor(this.x), hy = Math.floor(this.y + this.height * 0.5), hz = Math.floor(this.z);
        // Himmelslicht mal Tageshelligkeit, dagegen das Blocklicht — dieselbe
        // Rechnung wie im Original. Ein Schalter auf isNight() waere zu grob:
        // in der Daemmerung stuende die Spinne im Halbdunkel und waere trotzdem
        // noch friedlich, bis es schlagartig Nacht ist.
        var hell = Math.max(world.getSky(hx, hy, hz) * world.daylight(),
                            world.getLightRaw(hx, hy, hz) & 15);
        this.hostile = hell <= 9;
        if (!this.hostile) this.target = null;
      }
    }

    // Verbrennen im Tageslicht
    if (this.spec.burns && !game.world.isNight() && world.getSky(Math.floor(this.x), Math.floor(this.y + 1), Math.floor(this.z)) > 12
        && !P.inLiquid(world, this, 'water')) {
      this.burning += dt;
      if (this.burning > 1) { this.burning = 0; this.hurt(1, null, game); }
      game.particles.smoke(this.x, this.y + this.height * 0.7, this.z, 1);
    }

    // Von einer Verbrennungsklinge angezündet – eigener Zähler, damit er sich
    // nicht mit dem Sonnenbrand der Untoten ins Gehege kommt
    if (this.brennt > 0 && !this.spec.fireproof) {
      this.brennt -= dt;
      this.feuerCd = (this.feuerCd || 0) + dt;
      if (this.feuerCd > 1) { this.feuerCd = 0; this.hurt(1, null, game); }
      game.particles.smoke(this.x, this.y + this.height * 0.6, this.z, 1);
    }

    // Lava / Kaktus-Schaden – Netherbewohner stört das nicht
    if (!this.spec.fireproof && P.inLiquid(world, this, 'lava')) {
      if ((game.tickCount % 12) === 0) this.hurt(4, null, game);
    }

    // Endermen haben ihren eigenen Kopf: Blickkontakt, Sprünge, Wasserscheu
    if (this.mobType === 'enderman') this.endermanTick(dt, game);

    // Fliegende Mobs schweben, statt zu laufen
    if (this.spec.flying) { this.flyTick(dt, game, foeOf(this, game)); return; }
    // Fische schwimmen wie fliegende Mobs, bleiben aber im Wasser. An Land
    // zappeln sie und ersticken – das ist billiger als ein eigenes Modell für
    // beides und sieht genau richtig aus.
    if (this.spec.schwimmt) {
      var imWasser = P.inLiquid(world, this, 'water');
      if (imWasser) {
        this.flyTick(dt, game, null);
        // nicht aus dem Wasser herausschwimmen
        if (world.getBlock(Math.floor(this.x), Math.floor(this.y + 1), Math.floor(this.z)) === 0) {
          this.vy = Math.min(this.vy, -0.6);
        }
        return;
      }
      this.landCd = (this.landCd || 0) + dt;
      this.vy -= 18 * dt;
      this.yaw += dt * 9;                       // Zappeln
      this.applyPhysics(dt, 0.9, 0.5);
      if (this.landCd > 12) this.hurt(20, null, game);
      return;
    }

    // ---- KI ----
    this.moving = false;
    var wantYaw = this.yaw;

    // Beute wählen: der Spieler, sonst der nächste Dorfbewohner in Reichweite.
    // Ein Mob nimmt den Spieler nur auf, wenn er ihn wirklich sehen kann. Eine
    // Freigabe für den Nahbereich gab es hier einmal, damit niemand direkt vor
    // der Nase unbemerkt bleibt – die hat aber genau das Gegenteil bewirkt: durch
    // eine Wand hindurch wurde jeder aggro, der zufällig nah genug stand.
    var foe = null, foeDist = 9999;
    if (this.hostile) {
      if (p && !p.dead && dist < 16 && !MC.friedlichFuer(game)) {
        this.seeCd = (this.seeCd === undefined ? 0 : this.seeCd) - dt;
        if (this.seeCd <= 0) {
          this.seeCd = 0.35;                        // Sichtprüfung ist ein Raycast
          this.sawPlayer = this.canSee(p);
          if (this.sawPlayer) this.forgetCd = 5;    // kurz dranbleiben, wenn er weg ist
        }
        this.forgetCd = (this.forgetCd || 0) - dt;
        if (this.sawPlayer || this.forgetCd > 0) { foe = p; foeDist = dist; }
      } else {
        this.sawPlayer = false;
      }
      var vFoe = this.nearestVillager(16);
      if (vFoe && vFoe.d < foeDist) { foe = vFoe.e; foeDist = vFoe.d; }
    }

    // Dorfbewohner steuern sich selbst; liefert false, wenn sie einfach
    // herumstehen dürfen – dann greift weiter unten das normale Umherwandern.
    var villagerBusy = (this.mobType === 'villager') && this.villagerTick(dt, game);

    if (villagerBusy) {
      /* schon bewegt */
    } else if (foe) {
      p = foe; dist = foeDist;
      this.target = foe;
      wantYaw = Math.atan2(p.x - this.x, p.z - this.z);
      this.headYaw = wantYaw;
      this.headPitch = Math.atan2(this.y + 1.4 - (p.y + 1.5), Math.max(0.1, dist)) * 0.6;

      if (this.mobType === 'creeper') {
        if (dist < 3.2) {
          if (this.fuse < 0) { this.fuse = 1.6; game.audio.play('fuse'); }
          this.fuse -= dt;
          if (this.fuse <= 0) {
            this.dead = true;
            // Ein vom Blitz aufgeladener Creeper reißt deutlich weiter
            MC.explode(game, this.x, this.y + 0.8, this.z, this.geladen ? 6.4 : 3.6, true);
            return;
          }
        } else {
          if (this.fuse > 0) this.fuse = Math.min(1.6, this.fuse + dt * 0.7);
          if (this.fuse > 1.55) this.fuse = -1;
          this.moveToward(dt, wantYaw, 1);
        }
      } else if (this.spec.ranged) {
        // Die Aechorpflanze wurzelt – sie dreht sich nur zum Ziel
        if (this.spec.steht) {
          this.yaw = wantYaw;
          if (this.attackCd <= 0 && dist < 9 && this.canSee(p)) {
            this.attackCd = 1.8;
            this.shootArrow(game, p);
          }
        } else {
          if (dist > 10) this.moveToward(dt, wantYaw, 1);
          else if (dist < 5) this.moveToward(dt, wantYaw + Math.PI, 0.8);
          else this.strafe(dt, wantYaw);
          if (this.attackCd <= 0 && dist < 16 && this.canSee(p)) {
            this.attackCd = 2.0;
            this.shootArrow(game, p);
          }
        }
      } else {
        // Der Hoglin nimmt Anlauf statt gleichmäßig zu traben
        var tempo = 1;
        if (this.spec.ansturm) {
          this.anlauf = (this.anlauf || 0) + dt;
          tempo = (this.anlauf % 4) > 2.2 ? 1.9 : 0.75;
        }
        this.moveToward(dt, wantYaw, tempo);
        if (dist < 1.9 && this.attackCd <= 0) {
          this.attackCd = this.spec.ansturm ? 1.6 : 1.0;
          p.hurt(this.schadenEigen !== undefined ? this.schadenEigen : this.spec.damage, this, game);
          // Was der Treffer überträgt, steht in den Werten der Kreatur
          if (this.spec.effekt && MC.Effekte) {
            MC.Effekte.gib(p, this.spec.effekt, 1, this.spec.effektZeit || 6);
          }
          // Der Ansturm wirft weit weg – das ist seine eigentliche Waffe
          if (this.spec.ansturm) {
            var kdx = p.x - this.x, kdz = p.z - this.z;
            var kd = Math.sqrt(kdx * kdx + kdz * kdz) || 1;
            p.vx += kdx / kd * 11; p.vz += kdz / kd * 11; p.vy = Math.max(p.vy, 7);
          }
          game.audio.play('hit');
        }
      }
    } else if (this.panic > 0) {
      this.moveToward(dt, this.targetYaw, 1.35);
    } else {
      // Umherwandern
      this.wanderCd -= dt;
      if (this.wanderCd <= 0) {
        this.wanderCd = 2 + Math.random() * 5;
        if (Math.random() < 0.55) { this.targetYaw = Math.random() * Math.PI * 2; this.wanderState = 1; }
        else this.wanderState = 0;
      }
      // Dorfbewohner bleiben in Sichtweite ihres Dorfes
      if (this.home) {
        var hdx = this.home.x - this.x, hdz = this.home.z - this.z;
        if (hdx * hdx + hdz * hdz > 20 * 20) {
          this.targetYaw = Math.atan2(hdx, hdz);
          this.wanderState = 1;
        }
      }
      if (this.wanderState) this.moveToward(dt, this.targetYaw, 0.55);
      this.headYaw = this.yaw;
      this.headPitch = 0;
      if (Math.random() < dt * 0.06) game.audio.play3d(this.spec.sound, this.x, this.y, this.z, game.player);
    }

    // Schwimmen
    if (P.inLiquid(world, this, 'water')) {
      this.vy = Math.max(this.vy, 3.2);
    }
    // Die Spinne klettert: stoesst sie waagerecht an, zieht sie sich daran
    // hoch. Kein Sprung, sondern eine gehaltene Aufwaertsbewegung — sonst
    // haengt sie an jeder zweiten Wand fest und huepft davor auf und ab.
    // Steht hier und nicht weiter oben: alles vor der Physik wird von der
    // Schwerkraft und dem Bodenabgleich darunter wieder eingesammelt.
    if (this.spec.klettert && this.collidedH && !P.inLiquid(world, this, 'water')) {
      this.vy = Math.max(this.vy, 4.2);
      this.onGround = false;
    }
    // Wer im Nether zu Hause ist, geht in Lava nicht unter. Ohne das versinkt
    // ein Piglin im ersten See, den er quert — feuerfest heißt ja nur, dass es
    // ihm nicht wehtut, nicht dass er darin schwimmen kann.
    if (this.spec.fireproof && P.inLiquid(world, this, 'lava')) {
      this.vy = Math.max(this.vy, 2.2);
      this.vx *= 0.86; this.vz *= 0.86;
    }

    // Physik
    this.vy -= 30 * dt;
    if (this.vy < -55) this.vy = -55;
    var before = this.y;
    P.moveWithStep(world, this, this.vx * dt, this.vz * dt, 0.6);
    P.move(world, this, 0, this.vy * dt, 0);
    if (this.onGround) this.vy = 0;
    var fr = Math.pow(this.knockCd > 0 ? 0.55 : (this.onGround ? 0.02 : 0.75), dt);
    this.vx *= fr; this.vz *= fr;

    // Fallschaden
    if (!this.onGround) {
      if (this.vy < 0) this.fallStart = this.fallStart === undefined ? this.y : Math.max(this.fallStart, this.y);
    } else if (this.fallStart !== undefined) {
      var fd = this.fallStart - this.y;
      if (fd > 3.5) this.hurt(Math.floor(fd - 3), null, game);
      this.fallStart = undefined;
    }

    if (this.moving) this.walkTime += dt * 9;
    if (this.y < -10) this.dead = true;

    // Despawn nach Entfernung. Solange der Spieler tot ist, gibt es keine
    // sinnvolle Entfernung – sonst löst sich beim Tod die ganze Umgebung auf.
    if (p && !p.dead) {
      if (this.hostile && dist > 62) this.dead = true;
      if (!this.hostile && dist > (this.mobType === 'villager' ? 170 : 110)) this.dead = true;
    }
  };

  // Wen greift dieser Mob gerade an? Spieler, sonst nächster Dorfbewohner.
  function foeOf(mob, game) {
    if (!mob.hostile) return null;
    var p = game.player;
    var best = null, bestD = 9999;
    if (p && !p.dead && !MC.friedlichFuer(game)) {
      var d = mob.distTo(p);
      if (d < 28 && (d < 8 || mob.canSee(p))) { best = p; bestD = d; }
    }
    var v = mob.nearestVillager(20);
    if (v && v.d < bestD) best = v.e;
    return best;
  }

  // ---- Ghast und Zephyr ----
  // Sie schweben auf einer Wunschhöhe, halten Abstand und schießen von dort.
  Mob.prototype.flyTick = function (dt, game, foe) {
    var world = this.world;
    this.moving = true;

    // Wunschhöhe: über dem Boden bleiben
    var gx = Math.floor(this.x), gz = Math.floor(this.z);
    var ground = world.heightAtWorld(gx, gz);
    var wantY = Math.max(ground + 8, this.y);
    if (this.hoverCd === undefined || this.hoverCd <= 0) {
      this.hoverCd = 3 + Math.random() * 4;
      this.hoverY = ground + 7 + Math.random() * 9;
      this.driftYaw = Math.random() * Math.PI * 2;
    }
    this.hoverCd -= dt;
    wantY = this.hoverY;

    var tx = Math.sin(this.driftYaw), tz = Math.cos(this.driftYaw);
    if (foe) {
      var d = this.distTo(foe);
      this.yaw = Math.atan2(foe.x - this.x, foe.z - this.z);
      this.headYaw = this.yaw;
      // Abstand halten: zu nah -> weg, zu weit -> ran
      var sign = d < 9 ? -1 : (d > 17 ? 1 : 0);
      tx = Math.sin(this.yaw) * sign;
      tz = Math.cos(this.yaw) * sign;
      wantY = foe.y + 6;
      if (this.attackCd <= 0 && d < 24 && this.canSee(foe)) {
        this.attackCd = this.mobType === 'ghast' ? 3.2 : 2.6;
        this.shootBall(game, foe);
      }
    } else {
      this.yaw = this.driftYaw;
      this.headYaw = this.yaw;
    }

    var s = this.speed;
    this.vx += tx * s * dt * 4;
    this.vz += tz * s * dt * 4;
    this.vy += (wantY - this.y) * dt * 1.6;
    var hv = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    if (hv > s) { this.vx = this.vx / hv * s; this.vz = this.vz / hv * s; }
    if (this.vy > 3) this.vy = 3;
    if (this.vy < -3) this.vy = -3;
    P.move(world, this, this.vx * dt, this.vy * dt, this.vz * dt);
    var k = Math.pow(0.6, dt * 20);
    this.vx *= k; this.vz *= k; this.vy *= Math.pow(0.85, dt * 20);
    this.walkTime += dt * 3;

    var p = game.player;
    if (p && !p.dead && this.distTo(p) > 90) this.dead = true;
  };

  // Ghast wirft Feuerbälle, die Lohe kleine Flammen, der Zephyr Schneebälle:
  // der erste sprengt, der zweite brennt nur, der dritte stößt weg.
  Mob.prototype.shootBall = function (game, target) {
    var dx = target.x - this.x;
    var dy = (target.y + 0.9) - (this.y + this.height * 0.5);
    var dz = target.z - this.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var kind = this.spec.projectile || 'snowball';
    var fire = kind !== 'snowball';
    var speed = kind === 'fireball' ? 14 : (kind === 'flame' ? 22 : 17);
    var power = kind === 'fireball' ? 2.4 : 0;
    var b = new Projectile(this.world,
      this.x + dx / d * 1.4, this.y + this.height * 0.5 + dy / d * 1.4, this.z + dz / d * 1.4,
      dx / d * speed, dy / d * speed, dz / d * speed, this, fire, power);
    this.world.entities.push(b);
    game.audio.play3d(fire ? 'fizz' : 'bow', this.x, this.y, this.z, game.player);
  };

  // ---- Geschoss von Ghast/Lohe/Zephyr/Drache ----
  // power > 0 sprengt beim Aufschlag, power 0 macht nur Schaden
  function Projectile(world, x, y, z, vx, vy, vz, owner, fire, power) {
    Entity.call(this, world, x, y, z);
    this.width = 0.5; this.height = 0.5;
    this.vx = vx; this.vy = vy; this.vz = vz;
    this.owner = owner;
    this.fire = !!fire;
    this.power = power === undefined ? 2.4 : power;
    this.type = 'projectile';
    this.gravity = 0;
    this.life = 5;
  }
  Projectile.prototype = Object.create(Entity.prototype);
  Projectile.prototype.constructor = Projectile;
  MC.Projectile = Projectile;

  Projectile.prototype.update = function (dt, game) {
    this.age += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    var w = this.world;
    var nx = this.x + this.vx * dt, ny = this.y + this.vy * dt, nz = this.z + this.vz * dt;

    // Treffer am Spieler?
    var p = game.player;
    if (p && !p.dead) {
      var dx = p.x - nx, dy = (p.y + 0.9) - ny, dz = p.z - nz;
      if (dx * dx + dy * dy + dz * dz < 1.1 * 1.1) { this.impact(game, nx, ny, nz); return; }
    }
    // Treffer an einem Block?
    if (B.isSolid(w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz)))) {
      this.impact(game, nx, ny, nz);
      return;
    }
    this.x = nx; this.y = ny; this.z = nz;
    if (this.fire) game.particles.flame(this.x, this.y, this.z, 1);
    else game.particles.smoke(this.x, this.y, this.z, 1);
  };

  Projectile.prototype.impact = function (game, x, y, z) {
    this.dead = true;
    var p = game.player;
    if (this.fire && this.power <= 0) {
      // Flamme der Lohe: verbrennt, reißt aber kein Loch ins Gelände
      game.particles.flame(x, y, z, 10);
      game.audio.play3d('fizz', x, y, z, p);
      if (p && !p.dead) {
        var fdx = p.x - x, fdy = (p.y + 0.9) - y, fdz = p.z - z;
        if (fdx * fdx + fdy * fdy + fdz * fdz < 2.2 * 2.2) p.hurt(5, this, game, 'feuer');
      }
    } else if (this.fire) {
      MC.explode(game, x, y, z, this.power);
    } else {
      // Schneeball: kein Schaden, aber kräftiger Stoß – so fegt der Zephyr
      // dich von der Insel
      game.particles.splash(x, y, z, 8);
      game.audio.play3d('thud', x, y, z, p);
      if (p && !p.dead) {
        var dx = p.x - x, dz = p.z - z;
        var d = Math.sqrt(dx * dx + dz * dz) || 1;
        if (d < 3.5) { p.vx += dx / d * 16; p.vz += dz / d * 16; p.vy = Math.max(p.vy, 6); }
      }
    }
  };

  // Nächster Dorfbewohner im Umkreis r (für die Zielwahl feindlicher Mobs)
  Mob.prototype.nearestVillager = function (r) {
    var ents = this.world.entities, best = null, bestD = r;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e === this || e.dead || e.mobType !== 'villager') continue;
      var d = this.distTo(e);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best ? { e: best, d: bestD } : null;
  };

  // Durchgangspunkt in einer Türöffnung: von der Seite weg, auf der das
  // Türblatt steht, sonst passt man mit 0,6 Breite nicht durch.
  function doorPass(w, h) {
    var m = w.getMeta(h.doorX, h.y, h.doorZ);
    var f = (m >> 1) & 3;
    if (m & 8) f = (f + 1) & 3;
    var pd = B.SIDE_DIRS[f];
    return [h.doorX + 0.5 - pd[0] * 0.17, h.doorZ + 0.5 - pd[1] * 0.17];
  }

  // ---- Dorfbewohner ----
  // Nachts oder wenn ein Monster in der Nähe ist, geht der Bewohner ins Haus.
  // Türen werden beim Durchgehen geöffnet und hinter sich wieder zugemacht.
  // Läuft ein Ziel über das Dorfnetz an. Gibt es kein Netz, keinen Weg oder ist
  // das Ziel ohnehin nah, bleibt es beim geraden Zugehen — also beim alten
  // Verhalten. Der Weg wird alle drei Sekunden neu gesucht und immer dann, wenn
  // das Ziel gewechselt hat; ein Bewohner, der zwei Sekunden lang nicht
  // vorankommt, wirft ihn weg und geht wieder gerade.
  Mob.prototype.gehZu = function (dt, game, zx, zz, tempo) {
    var zdx = zx - this.x, zdz = zz - this.z;
    var zielAbstand = zdx * zdx + zdz * zdz;
    // Auf den letzten Metern führt der Weg nur noch in die Irre: die Tür liegt
    // neben dem Netz, und wer dort noch einen Wegpunkt anläuft, dreht wieder
    // von ihr weg. Sechs Blöcke sind die Grenze — darunter geht es gerade zu.
    if (this.dorf && MC.Village.weg && zielAbstand > 6 * 6) {
      var neuesZiel = !this.wegZiel ||
        Math.abs(this.wegZiel[0] - zx) > 1.5 || Math.abs(this.wegZiel[1] - zz) > 1.5;
      this.wegTimer = (this.wegTimer || 0) - dt;
      if (neuesZiel || this.wegTimer <= 0) {
        this.wegZiel = [zx, zz];
        this.wegTimer = 3;
        this.weg = MC.Village.weg(this.dorf, this.x, this.z, zx, zz);
        this.wegIdx = 0;
        this.wegFest = 0;
      }
      if (this.weg && this.wegIdx < this.weg.length) {
        // Steckengeblieben? Dann taugt der Weg hier nichts.
        var bewegt = (this.x - (this.wegX || 0)) * (this.x - (this.wegX || 0)) +
                     (this.z - (this.wegZ || 0)) * (this.z - (this.wegZ || 0));
        this.wegX = this.x; this.wegZ = this.z;
        this.wegFest = bewegt < 0.0004 ? (this.wegFest || 0) + dt : 0;
        if (this.wegFest > 2) { this.weg = null; }
        else {
          var pkt = this.weg[this.wegIdx];
          var pdx = pkt[0] - this.x, pdz = pkt[1] - this.z;
          var pAbstand = pdx * pdx + pdz * pdz;
          if (pAbstand < 0.75 * 0.75) this.wegIdx++;
          // Ist das Ziel selbst näher als der nächste Wegpunkt, hat der Weg
          // seinen Zweck erfüllt — dann bringt er nichts mehr.
          else if (pAbstand > zielAbstand) this.weg = null;
          else {
            this.moveToward(dt, Math.atan2(pdx, pdz), tempo);
            return;
          }
        }
      }
    }
    this.moveToward(dt, Math.atan2(zx - this.x, zz - this.z), tempo);
  };

  // ============================================================
  //  Tiere: Zucht, Nachwuchs, Locken, Reiten
  // ============================================================
  // Liefert true, wenn dieser Durchgang schon alles erledigt hat — dann läuft
  // die gewöhnliche KI nicht mehr.
  Mob.prototype.tierTick = function (dt, game, p, dist) {
    if (this.liebe > 0) this.liebe -= dt;
    if (this.zuchtCd > 0) this.zuchtCd -= dt;

    // ---- Ein Junges wird groß ----
    if (this.baby) {
      this.wachstum -= dt;
      if (this.wachstum <= 0) this.erwachsen();
    }

    // ---- Getragen ----
    // Das Reittier hat keine eigene Meinung mehr: es geht, wohin der Reiter
    // schaut. Gesteuert wird es in player.js, hier steht nur die Folge davon.
    if (this.reiter) {
      if (this.reiter.dead || this.reiter.reittier !== this) { this.reiter = null; }
      else {
        this.moving = Math.abs(this.vx) + Math.abs(this.vz) > 0.2;
        this.walkTime += dt * 9 * (this.moving ? 1 : 0);
        this.headYaw = this.yaw;
        this.applyMobPhysics(dt);
        // Der Reiter wird vom Tier gesetzt, nicht umgekehrt — und zwar NACH
        // dessen Physik. Setzte er sich selbst, hinge die Kamera ein Bild
        // hinterher und das Reiten ruckelte.
        var r = this.reiter;
        r.x = this.x; r.z = this.z; r.y = this.y + this.height * 0.72;
        r.onGround = this.onGround;
        r.walkTime = this.walkTime;
        return true;
      }
    }

    var futter = this.spec.futter;
    if (!futter) return false;

    // ---- Verliebt: Partner suchen ----
    if (this.liebe > 0 && !this.baby) {
      if ((game.tickCount % 4) === 0) game.particles.herzen(this.x, this.y + this.height * 0.9, this.z, 1);
      var partner = null, best = 64;
      var ents = this.world.entities;
      for (var i = 0; i < ents.length; i++) {
        var o = ents[i];
        if (o === this || o.dead || o.mobType !== this.mobType) continue;
        if (!(o.liebe > 0) || o.baby) continue;
        var d2 = (o.x - this.x) * (o.x - this.x) + (o.z - this.z) * (o.z - this.z);
        if (d2 < best) { best = d2; partner = o; }
      }
      if (partner) {
        if (best < 1.8 * 1.8) {
          // Nur einer der beiden legt das Junge an, sonst kämen zwei heraus.
          // Entschieden wird über die Stelle in der Liste — das ist stabil und
          // braucht keine zusätzliche Marke.
          if (ents.indexOf(this) < ents.indexOf(partner)) this.nachwuchs(game, partner);
        } else {
          this.moveToward(dt, Math.atan2(partner.x - this.x, partner.z - this.z), 1);
          this.headYaw = this.yaw;
          this.applyMobPhysics(dt);
          return true;
        }
      }
    }

    // ---- Gelockt: wer das richtige Futter in der Hand hält, wird verfolgt ----
    if (p && !p.dead && dist < 9 && this.locktMich(p, futter)) {
      if (dist > 2.2) {
        this.moveToward(dt, Math.atan2(p.x - this.x, p.z - this.z), 1);
        this.headYaw = this.yaw;
        this.applyMobPhysics(dt);
        return true;
      }
      this.headYaw = Math.atan2(p.x - this.x, p.z - this.z);
    }

    // ---- Ein Junges bleibt bei einem Erwachsenen ----
    if (this.baby) {
      var mutter = null, mb = 144;
      var es2 = this.world.entities;
      for (var k = 0; k < es2.length; k++) {
        var m = es2[k];
        if (m === this || m.dead || m.baby || m.mobType !== this.mobType) continue;
        var md = (m.x - this.x) * (m.x - this.x) + (m.z - this.z) * (m.z - this.z);
        if (md < mb) { mb = md; mutter = m; }
      }
      if (mutter && mb > 2.5 * 2.5) {
        this.moveToward(dt, Math.atan2(mutter.x - this.x, mutter.z - this.z), 1.15);
        this.headYaw = this.yaw;
        this.applyMobPhysics(dt);
        return true;
      }
    }
    return false;
  };

  Mob.prototype.locktMich = function (p, futter) {
    var st = p.inventory.selectedStack();
    return !!(st && st.id === futter);
  };

  // Füttern: ein Junges wächst schneller, ein Erwachsener verliebt sich, ein
  // Reittier wird zutraulicher. Liefert true, wenn das Futter verbraucht ist.
  Mob.prototype.fuettern = function (game) {
    var futter = this.spec.futter;
    if (!futter) return false;
    var p = game.player;
    var st = p.inventory.selectedStack();
    if (!st || st.id !== futter) return false;

    if (this.baby) {
      this.wachstum = Math.max(0, this.wachstum - 30);
      game.particles.herzen(this.x, this.y + this.height * 0.8, this.z, 2);
    } else if (this.spec.reitbar && this.zahm < 3) {
      // Reittiere werden erst zutraulich, bevor sie sich satteln lassen
      this.zahm++;
      game.particles.herzen(this.x, this.y + this.height * 0.9, this.z, 3);
      game.ui.toast(this.zahm >= 3 ? 'Das Tier vertraut dir jetzt' : 'Das Tier gewöhnt sich an dich');
    } else if (this.zuchtCd <= 0 && this.liebe <= 0) {
      this.liebe = 20;
      game.particles.herzen(this.x, this.y + this.height * 0.9, this.z, 5);
    } else {
      return false;
    }
    game.audio.play('eat');
    if (game.mode !== 'creative') p.inventory.consumeSelected(1);
    return true;
  };

  Mob.prototype.nachwuchs = function (game, partner) {
    this.liebe = 0; partner.liebe = 0;
    this.zuchtCd = 90; partner.zuchtCd = 90;
    var kind = new Mob(this.world, this.mobType, (this.x + partner.x) / 2,
                       this.y + 0.1, (this.z + partner.z) / 2);
    kind.zumBaby();
    if (this.woolColor) kind.woolColor = Math.random() < 0.5 ? this.woolColor : partner.woolColor;
    if (this.moaColor) kind.moaColor = Math.random() < 0.5 ? this.moaColor : partner.moaColor;
    this.world.entities.push(kind);
    game.particles.herzen(kind.x, kind.y + 0.5, kind.z, 8);
    game.audio.play('pop');
    if (game.player && game.player.addXP) game.player.addXP(1 + ((Math.random() * 6) | 0));
  };

  // Ein Junges ist halb so groß — und weil Breite und Höhe die Trefferbox
  // sind, ist es das auch wirklich und passt durch niedrigere Lücken.
  Mob.prototype.zumBaby = function () {
    this.baby = true;
    this.wachstum = 300;
    this.width = this.model.width * 0.5;
    this.height = this.model.height * 0.5;
    this.hp = Math.max(1, Math.round(this.spec.hp / 2));
    this.maxHp = this.hp;
  };

  Mob.prototype.erwachsen = function () {
    this.baby = false;
    this.wachstum = 0;
    this.width = this.model.width;
    this.height = this.model.height;
    this.hp = this.spec.hp;
    this.maxHp = this.spec.hp;
  };

  Mob.prototype.villagerTick = function (dt, game) {
    var h = this.house, w = this.world;
    if (!h) return false;
    if (this.doorCd > 0) this.doorCd -= dt;

    var bedroht = !!this.nearestHostile(12);
    var rein = w.isNight() || bedroht;
    // Wirklich zwischen den Wänden, nicht bloß "nah dran"
    var drin = this.x > h.x0 && this.x < h.x1 && this.z > h.z0 && this.z < h.z1;

    var offen = w.isDoorOpen(h.doorX, h.y, h.doorZ);
    var ddx = (h.doorX + 0.5) - this.x, ddz = (h.doorZ + 0.5) - this.z;
    var doorDist = Math.sqrt(ddx * ddx + ddz * ddz);

    if (rein && !drin) {
      if (doorDist < 3.5 && !offen && this.doorCd <= 0) {
        if (w.setDoorOpen(h.doorX, h.y, h.doorZ, true)) {
          this.doorCd = 1.2;
          game.audio.play3d('open', h.doorX, h.y, h.doorZ, game.player);
          offen = true;
        }
      }
      // Erst auf die freie Hälfte der Türöffnung zielen, dann in die Raummitte.
      // Das offene Türblatt frisst eine Blockseite – mittig würde man hängen bleiben.
      var pass = doorPass(w, h);
      var pdx = pass[0] - this.x, pdz = pass[1] - this.z;
      var passDist = Math.sqrt(pdx * pdx + pdz * pdz);
      var ziel = passDist > 0.8 ? pass : [h.inX, h.inZ];
      this.gehZu(dt, game, ziel[0], ziel[1], bedroht ? 1.5 : 1);
      this.headYaw = this.yaw;
      return true;
    }

    if (rein && drin) {
      // drinnen: Tür zu und stehenbleiben
      if (offen && this.doorCd <= 0) {
        if (w.setDoorOpen(h.doorX, h.y, h.doorZ, false)) {
          this.doorCd = 2.5;
          game.audio.play3d('thud', h.doorX, h.y, h.doorZ, game.player);
        }
      }
      this.headYaw = this.yaw;
      return true;
    }

    // Tag und keine Gefahr: raus, falls wir noch drin stehen
    if (drin) {
      if (!offen && this.doorCd <= 0 && w.setDoorOpen(h.doorX, h.y, h.doorZ, true)) {
        this.doorCd = 1.2;
        game.audio.play3d('open', h.doorX, h.y, h.doorZ, game.player);
        offen = true;
      }
      var raus = offen ? doorPass(w, h) : [h.outX, h.outZ];
      var rdx = raus[0] - this.x, rdz = raus[1] - this.z;
      if (rdx * rdx + rdz * rdz < 0.7 * 0.7) raus = [h.outX, h.outZ];
      this.moveToward(dt, Math.atan2(raus[0] - this.x, raus[1] - this.z), 1);
      this.headYaw = this.yaw;
      return true;
    }
    // Tag und keine Gefahr: ein Ziel auf dem Wegenetz, statt bloß um die eigene
    // Tür herumzustehen. Das ist erst jetzt möglich — ohne Wegfindung endete
    // jeder Gang am nächsten Zaun.
    this.tagTimer = (this.tagTimer || 0) - dt;
    if (this.dorf && (!this.tagZiel || this.tagTimer <= 0)) {
      this.tagTimer = 15 + Math.random() * 15;
      this.tagZiel = MC.Village.wegpunkt(this.dorf, Math.random());
    }
    if (this.tagZiel) {
      var tdx = this.tagZiel[0] - this.x, tdz = this.tagZiel[1] - this.z;
      if (tdx * tdx + tdz * tdz > 1.4 * 1.4) {
        this.gehZu(dt, game, this.tagZiel[0], this.tagZiel[1], 0.75);
        this.headYaw = this.yaw;
        return true;
      }
      // Angekommen: einen Augenblick stehenbleiben, dann ein neues Ziel
      this.tagZiel = null;
      this.tagTimer = 3 + Math.random() * 6;
    }
    return false;   // draußen bei Tag -> normales Umherwandern
  };

  // ---- Enderman ----
  // Friedlich, bis man ihm ins Gesicht sieht. Springt kurz umher, weicht Wasser
  // aus und setzt sich beim Angriff direkt neben den Spieler.
  Mob.prototype.endermanTick = function (dt, game) {
    var w = this.world, p = game.player;

    if (P.inLiquid(w, this, 'water')) {
      this.wetTimer = (this.wetTimer || 0) + dt;
      if (this.wetTimer > 0.5) { this.wetTimer = 0; this.hurt(2, null, game); }
      this.teleportNear(game, 16);
    } else this.wetTimer = 0;

    // Blickkontakt: Fadenkreuz auf dem Kopf, Sichtlinie frei. Ein kurzer Blick
    // stört ihn nicht – erst wer knapp eine Sekunde hinsieht, macht ihn wütend.
    this.stareTime = this.stareTime || 0;
    if (!this.hostile && p && !p.dead && !MC.friedlichFuer(game)) {
      var dx = p.x - this.x, dy = p.eyeY() - (this.y + this.height * 0.9), dz = p.z - this.z;
      var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      var angestarrt = false;
      if (d > 1 && d < 20) {
        var look = p.lookDir();
        var dot = -(look.x * dx + look.y * dy + look.z * dz) / d;
        // Nicht der Winkel entscheidet, sondern wie weit der Blickstrahl am Kopf
        // vorbeigeht. Ein fester Winkel wäre aus der Nähe viel zu großzügig – da
        // füllt der Enderman das halbe Bild, und man starrt ihn versehentlich an.
        var seitlich = dot > 0 ? Math.sqrt(Math.max(0, 1 - dot * dot)) * d : 99;
        angestarrt = seitlich < 0.45 && this.canSee(p);
      }
      if (angestarrt) {
        this.stareTime += dt;
        // Er merkt es: erst zuckt er, dann wird er wütend. Die Vorwarnung muss
        // deutlich sein – wer sie übersieht, wird ohne Vorankündigung angegriffen.
        if (this.stareTime > 0.45 && Math.random() < dt * 10) {
          game.particles.wut(this.x, this.y + this.height * 1.0, this.z, 2);
        }
        if (this.stareTime > 0.45 && !this.zuckLaut) {
          this.zuckLaut = true;
          game.audio.play3d('pop', this.x, this.y, this.z, p);
          game.ui.toast('Der Enderman starrt zurück.');
        }
        if (this.stareTime > 1.4) {
          this.hostile = true;
          this.attackCd = 1.2;
          this.wutCd = 20;
          game.audio.play3d('enderman', this.x, this.y, this.z, p);
          game.ui.toast('Du hast zu lange hingesehen.');
        }
      } else {
        this.stareTime = Math.max(0, this.stareTime - dt * 1.5);
        if (this.stareTime <= 0) this.zuckLaut = false;
      }
    }

    // Wut hält nicht ewig: wer ihn abhängt, ist ihn los. Maßstab ist der
    // Sichtkontakt, nicht der Abstand – sonst hält er sich mit seinen eigenen
    // Sprüngen ewig in Reichweite und verfolgt einen über die halbe Karte.
    if (this.hostile) {
      if (this.wutCd === undefined) this.wutCd = 20;   // auch bei Wut durch einen Treffer
      this.sichtCd = (this.sichtCd === undefined ? 0 : this.sichtCd) - dt;
      if (this.sichtCd <= 0) {                         // Raycast nicht jeden Bild
        this.sichtCd = 0.4;
        this.siehtZiel = !!(p && !p.dead && this.distTo(p) < 26 && this.canSee(p));
      }
      this.wutCd = this.siehtZiel ? 20 : this.wutCd - dt;
      if (this.wutCd <= 0) {
        this.hostile = false; this.stareTime = 0; this.target = null;
        this.wutCd = undefined; this.siehtZiel = false;
      }
    }

    this.tpCd = (this.tpCd === undefined) ? 8 + Math.random() * 10 : this.tpCd - dt;
    if (this.tpCd <= 0) {
      if (this.hostile) {
        this.tpCd = 7 + Math.random() * 8;
        // Nachsetzen nur über größere Entfernung, nur mit freier Sicht, und dann
        // in Sichtweite statt direkt vor die Nase – sonst steht er ohne
        // Vorwarnung im Gesicht.
        if (p && !p.dead && this.distTo(p) > 14 && this.siehtZiel) this.teleportRing(game, p.x, p.z, 8, 12);
      } else {
        this.tpCd = 14 + Math.random() * 16;
        // Ein friedlicher Enderman wandert nur herum. Beim Spieler landen darf er
        // dabei nicht – genau das wirkte wie ein Angriff aus dem Nichts.
        this.teleportNear(game, 14, p, 12);
      }
    }
  };

  // Zufälliger Sprung in der Umgebung; meide/meideR halten einen Bogen um jemanden
  Mob.prototype.teleportNear = function (game, r, meide, meideR) {
    var a = Math.random() * Math.PI * 2, d = 4 + Math.random() * r;
    return this.teleportTo(game, this.x + Math.cos(a) * d, this.z + Math.sin(a) * d, 0, meide, meideR);
  };

  // Sprung in einen Ring um einen Punkt – zwischen min und max Blöcken Abstand
  Mob.prototype.teleportRing = function (game, cx, cz, min, max) {
    var a = Math.random() * Math.PI * 2, d = min + Math.random() * (max - min);
    return this.teleportTo(game, cx + Math.cos(a) * d, cz + Math.sin(a) * d, 2);
  };

  Mob.prototype.teleportTo = function (game, wx, wz, spread, meide, meideR) {
    var w = this.world;
    for (var t = 0; t < 8; t++) {
      var x = Math.floor(wx + (Math.random() - 0.5) * spread * 2);
      var z = Math.floor(wz + (Math.random() - 0.5) * spread * 2);
      if (!w.isLoaded(x, 64, z)) continue;
      if (meide && !meide.dead) {
        var mdx = x + 0.5 - meide.x, mdz = z + 0.5 - meide.z;
        if (mdx * mdx + mdz * mdz < meideR * meideR) continue;
      }
      var y = MC.Dim.findGround(w, x, z, Math.round(this.y));
      if (y < 0) continue;
      // knapp drei Blöcke hoch – ohne Kopffreiheit steckt er in der Decke
      if (w.getBlock(x, y + 2, z) !== 0) continue;
      game.particles.portal(this.x, this.y + 1.6, this.z, 10);
      this.x = x + 0.5; this.y = y; this.z = z + 0.5;
      this.vx = this.vy = this.vz = 0;
      game.particles.portal(this.x, this.y + 1.6, this.z, 10);
      game.audio.play3d('pop', this.x, this.y, this.z, game.player);
      return true;
    }
    return false;
  };

  Mob.prototype.nearestHostile = function (r) {
    var ents = this.world.entities;
    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.dead || !e.isMob || !e.hostile) continue;
      if (this.distTo(e) < r) return e;
    }
    return null;
  };

  // Sichtlinie vom Kopf des Mobs zum Kopf des Ziels. Geprüft wird nur auf
  // undurchsichtige Blöcke: Gras, Blumen, Fackeln und Glas halten keinen Blick
  // auf, der allgemeine Strahl wäre aber an ihren Auswahlboxen hängengeblieben
  // und hätte die Mobs mitten auf der Wiese blind gemacht.
  Mob.prototype.canSee = function (t) {
    var ox = this.x, oy = this.y + this.height * 0.85, oz = this.z;
    var dx = t.x - ox, dy = (t.y + 1.5) - oy, dz = t.z - oz;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.001) return true;
    var w = this.world;
    var n = Math.ceil(d * 3);          // drei Abtastungen je Block, so rutscht keine Wand durch
    for (var i = 1; i < n; i++) {
      var f = i / n;
      if (B.isOpaque(w.getBlock(Math.floor(ox + dx * f), Math.floor(oy + dy * f), Math.floor(oz + dz * f)))) return false;
    }
    return true;
  };

  // Dieselbe Physik wie am Ende von Mob.update — für die Fälle, in denen der
  // Tierteil den Durchgang vorzeitig beendet.
  Mob.prototype.applyMobPhysics = function (dt) {
    var world = this.world;
    this.vy -= 30 * dt;
    if (this.vy < -55) this.vy = -55;
    P.moveWithStep(world, this, this.vx * dt, this.vz * dt, 0.6);
    P.move(world, this, 0, this.vy * dt, 0);
    if (this.onGround) this.vy = 0;
    var fr = Math.pow(this.onGround ? 0.02 : 0.75, dt);
    this.vx *= fr; this.vz *= fr;
    if (this.moving) this.walkTime += dt * 9;
    if (this.y < -10) this.dead = true;
  };

  Mob.prototype.moveToward = function (dt, yaw, mult) {
    this.yaw = approachAngle(this.yaw, yaw, dt * 7);
    // Während des Rückstoßes fliegt er, statt zu laufen
    if (this.knockCd > 0) { this.moving = true; return; }
    // Magmawürfel laufen nicht, sie hüpfen
    if (this.spec.hop) {
      if (this.onGround && this.jumpCd <= 0) {
        this.jumpCd = 0.7 + Math.random() * 0.4;
        this.vy = 7.5;
        var hs = this.speed * (mult || 1);
        this.vx = Math.sin(this.yaw) * hs;
        this.vz = Math.cos(this.yaw) * hs;
      }
      this.moving = true;
      return;
    }
    var s = this.speed * (mult || 1);
    this.vx += Math.sin(this.yaw) * s * dt * 14;
    this.vz += Math.cos(this.yaw) * s * dt * 14;
    var v = Math.sqrt(this.vx * this.vx + this.vz * this.vz);
    if (v > s) { this.vx = this.vx / v * s; this.vz = this.vz / v * s; }
    this.moving = true;
    // Hindernis -> springen
    if (this.collidedH && this.onGround && this.jumpCd <= 0) {
      this.vy = 8.2; this.jumpCd = 0.4;
    }
  };

  Mob.prototype.strafe = function (dt, yaw) {
    this.yaw = approachAngle(this.yaw, yaw, dt * 7);
    var side = yaw + Math.PI / 2;
    this.vx += Math.sin(side) * this.speed * dt * 8;
    this.vz += Math.cos(side) * this.speed * dt * 8;
    this.moving = true;
  };

  Mob.prototype.shootArrow = function (game, target) {
    var dx = target.x - this.x, dy = (target.y + 1.2) - (this.y + this.height * 0.8), dz = target.z - this.z;
    var d = Math.sqrt(dx * dx + dz * dz);
    var speed = 22;
    var vy = dy / Math.max(0.5, d) * speed * 0.55 + d * 0.35;
    var a = new Arrow(this.world, this.x, this.y + this.height * 0.8, this.z,
      dx / Math.max(0.01, d) * speed, vy, dz / Math.max(0.01, d) * speed, this, this.spec.damage + 2);
    this.world.entities.push(a);
    game.audio.play('bow');
  };

  Mob.prototype.hurt = function (amount, source, game) {
    // Herobrine lässt sich nicht schlagen. Er ist kein Gegner, sondern ein
    // Anblick – ein Treffer würde ihn zu einem Gegner machen.
    if (this.unverwundbar) return;
    if (this.hurtTime > 0.25 || this.dead) return;
    this.hp -= amount;
    this.hurtTime = 0.5;
    // Eine getroffene Spinne bleibt feindlich, auch am hellen Tag
    if (this.spec.lichtscheu) { this.gereizt = 20; this.hostile = true; }
    // Ein getroffener Enderman wird wütend und setzt sich erst einmal ab
    if (this.mobType === 'enderman') {
      this.hostile = true;
      if (this.hp > 0 && Math.random() < 0.5) { this.teleportNear(game, 12); return; }
    }
    // Wer im Dorf zuschlägt, ist dort bekannt. Der Ruf hängt am Dorf, nicht am
    // Getroffenen — sonst könnte man sich einen nach dem anderen vornehmen.
    if (this.mobType === 'villager' && source && source.type === 'player' && MC.Village) {
      MC.Village.rufAendern(this.world, this.villageId, -4);
    }
    this.panic = this.hostile ? 0 : 4;
    if (source) {
      var dx = this.x - source.x, dz = this.z - source.z;
      var d = Math.sqrt(dx * dx + dz * dz) || 1;
      this.vx = dx / d * 10; this.vz = dz / d * 10; this.vy = 7;
      // Solange der Stoß läuft, steuert der Mob nicht gegen. Ohne das würde
      // moveToward die Geschwindigkeit sofort wieder auf Laufwerte begrenzen.
      this.knockCd = 0.32;
      this.targetYaw = Math.atan2(dx, dz);
    }
    game.particles.blood(this.x, this.y + this.height * 0.6, this.z);
    game.audio.play3d(this.spec.sound === 'creeper' ? 'hurt' : this.spec.sound, this.x, this.y, this.z, game.player);
    if (this.hp <= 0) this.die(game, source);
  };

  // Groesse 4 = gross, 2 = mittel, 1 = klein. Masse, Trefferpunkte und Schaden
  // haengen daran, das Modell wird im Renderer entsprechend skaliert.
  Mob.prototype.setzeGroesse = function (g) {
    this.groesse = g;
    this.modellSkala = g / 4;
    this.width = this.model.width * this.modellSkala * 1.4;
    this.height = this.model.height * this.modellSkala * 1.4;
    this.maxHp = g * g;
    this.hp = this.maxHp;
    this.schadenEigen = (g > 1) ? g : 0;
  };

  Mob.prototype.die = function (game, source) {
    this.dead = true;
    // Ein grosser Schleim zerfaellt in kleinere, statt Beute zu lassen. Erst
    // die kleinste Stufe gibt Schleimbaelle her.
    if (this.spec.teilt && this.groesse > 1) {
      var neu = this.groesse / 2;
      var anzahl = 2 + ((Math.random() * 3) | 0);
      for (var t = 0; t < anzahl; t++) {
        var kind = new Mob(this.world, this.mobType,
          this.x + (Math.random() - 0.5) * 0.9, this.y + 0.1, this.z + (Math.random() - 0.5) * 0.9);
        kind.setzeGroesse(neu);
        kind.vy = 3;
        this.world.entities.push(kind);
      }
      game.particles.death(this.x, this.y + this.height / 2, this.z);
      game.audio.play3d('thud', this.x, this.y, this.z, game.player);
      return;
    }
    var drops = this.spec.drops || [];
    // Plünderung hebt nur die Obergrenze an, wie im Original – der Wurf selbst
    // bleibt gleichverteilt, es fällt also nicht garantiert mehr.
    var pl = this.looting || 0;
    for (var i = 0; i < drops.length; i++) {
      var d = drops[i];
      var n = d.min + Math.floor(Math.random() * (d.max + pl - d.min + 1));
      if (n > 0) game.spawnItem(this.x, this.y + 0.5, this.z, I.newStack(d.id, n));
    }
    if (this.mobType === 'sheep' && !this.sheared) {
      game.spawnItem(this.x, this.y + 0.5, this.z, I.newStack('wool_' + this.woolColor, 1));
    }
    if (this.spec.xp) {
      for (var k = 0; k < 3; k++) {
        game.world.entities.push(new XPOrb(this.world, this.x, this.y + 0.5, this.z, Math.ceil(this.spec.xp / 3)));
      }
    }
    game.particles.death(this.x, this.y + this.height / 2, this.z);
    // Der Aschenwicht zerplatzt und nimmt kurz die Sicht
    if (this.spec.ascheTod) {
      for (var a = 0; a < 26; a++) {
        game.particles.smoke(this.x + (Math.random() - 0.5) * 3,
                             this.y + Math.random() * 2.2,
                             this.z + (Math.random() - 0.5) * 3, 1);
      }
    }
    game.audio.play3d('death', this.x, this.y, this.z, game.player);
  };

  function approachAngle(cur, target, step) {
    var d = target - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < step) return target;
    return cur + Math.sign(d) * step;
  }
  MC.approachAngle = approachAngle;

  // ============================================================
  //  Spawner
  // ============================================================
  var Spawner = {};
  MC.Spawner = Spawner;

  Spawner.tick = function (game, dt) {
    var world = game.world, p = game.player;
    if (MC.Cmd && !MC.Cmd.regel(game, 'doMobSpawning')) return;
    Spawner.timer = (Spawner.timer || 0) + dt;
    if (Spawner.timer < 4) return;
    Spawner.timer = 0;

    var mobs = 0, hostiles = 0, passives = 0;
    for (var i = 0; i < world.entities.length; i++) {
      var e = world.entities[i];
      if (e.type === 'mob' && !e.dead) { mobs++; if (e.hostile) hostiles++; else passives++; }
    }
    var night = world.isNight();
    // Nether, Aether und Ende haben keinen Tageslauf – isNight() liefert dort
    // immer false, und damit galt die Tagesobergrenze von vier Feinden. Das
    // war der Grund, weshalb der Nether so leer wirkte.
    var immerNacht = world.dim === 'nether' || world.dim === 'the_end';
    var maxHostile = game.difficulty === 'peaceful' ? 0 : ((night || immerNacht) ? 14 : 4);
    var maxPassive = 12;

    if (world.dim !== 'overworld') {
      if (world.dim === 'nether') { Spawner.blazes(game); Spawner.bastionsWachen(game); }
      Spawner.otherDim(game, world, p, hostiles, passives, maxHostile, maxPassive);
      return;
    }

    Spawner.villagers(game);
    Spawner.fische(game);

    for (var t = 0; t < 4; t++) {
      var ang = Math.random() * Math.PI * 2;
      var r = 20 + Math.random() * 30;
      var x = Math.floor(p.x + Math.cos(ang) * r);
      var z = Math.floor(p.z + Math.sin(ang) * r);
      if (!world.isLoaded(x, 64, z)) continue;
      var col = world.chunkAt(x, z);
      if (!col || col.state < 2) continue;
      var h = world.heightAtWorld(x, z);
      // Passiv: auf Gras, hell
      var wantHostile = Math.random() < (night ? 0.75 : 0.45);
      if (!wantHostile && passives < maxPassive) {
        var groundP = world.getBlock(x, h - 1, z);
        if (groundP !== B.id('grass')) continue;
        if (world.getSky(x, h, z) < 9) continue;
        if (world.getBlock(x, h, z) !== 0 || world.getBlock(x, h + 1, z) !== 0) continue;
        var kinds = ['pig', 'cow', 'sheep', 'chicken'];
        var kind = kinds[(Math.random() * kinds.length) | 0];
        var group = 1 + ((Math.random() * 3) | 0);
        for (var g = 0; g < group; g++) {
          var m = new Mob(world, kind, x + 0.5 + (Math.random() - 0.5) * 3, h + 0.1, z + 0.5 + (Math.random() - 0.5) * 3);
          world.entities.push(m);
        }
        passives += group;
      } else if (wantHostile && hostiles < maxHostile) {
        // Feindlich: dunkel, fester Boden
        var y = pickDarkSpot(world, x, z, p);
        if (y < 0) continue;
        // Endermen sind eine Seltenheit, kein Nachtvolk: eine von vierundzwanzig
        // Erscheinungen, und nie mehr als zwei gleichzeitig in der Umgebung.
        var kinds2 = ['zombie', 'zombie', 'zombie', 'zombie', 'zombie', 'zombie', 'zombie',
                      'skeleton', 'skeleton', 'skeleton', 'skeleton', 'skeleton', 'skeleton', 'skeleton',
                      'creeper', 'creeper', 'creeper', 'creeper', 'creeper', 'creeper',
                      'spider', 'spider', 'spider', 'slime', 'slime', 'enderman'];
        var kind2 = kinds2[(Math.random() * kinds2.length) | 0];
        // Schleime gehoeren in die Tiefe und in den Sumpf, nicht auf jede Wiese.
        // Im Original sind es Schleimchunks und Sumpfnaechte; der Sumpf plus
        // eine Tiefengrenze trifft dasselbe, ohne eine zweite Zufallsschicht.
        if (kind2 === 'slime') {
          var tief = y < 40;
          var sumpf = world.gen && world.gen.biomeAt(x, z) === MC.WorldGen.BIOME.SWAMP;
          if (!tief && !sumpf) continue;
        }
        if (kind2 === 'enderman') {
          var anzahlE = 0;
          for (var ie = 0; ie < world.entities.length; ie++) {
            var ee = world.entities[ie];
            if (!ee.dead && ee.mobType === 'enderman') anzahlE++;
          }
          if (anzahlE >= 2) continue;
        }
        var mm = new Mob(world, kind2, x + 0.5, y, z + 0.5);
        if (mm.distTo(p) < 18) continue;
        // Endermen sind fast drei Blöcke hoch und brauchen entsprechend Platz
        if (mm.height > 2 && world.getBlock(x, y + 2, z) !== 0) continue;
        world.entities.push(mm);
        hostiles++;
      }
    }
  };

  // Nether und Aether haben eigene Bewohner. Im Nether ist es überall dunkel,
  // also spawnen Monster unabhängig von der Tageszeit; im Aether ist es umgekehrt.
  var DIM_MOBS = {
    // Im Nether gehören nur die Bewohner des Nether hin: überwiegend Piglins,
    // dazu Ghasts und Magmawürfel. Zombies und Endermen haben hier nichts
    // verloren. Die Lohe steht bewusst nicht in dieser Liste – sie spawnt
    // ausschließlich an den Festungen, damit sie ein Fund bleibt.
    nether: { hostile: ['piglin', 'piglin', 'piglin', 'piglin', 'ghast', 'ghast', 'magma_cube'], passive: [],
              ground: ['netherrack', 'soul_sand', 'soul_soil', 'magma_block', 'crimson_nylium', 'warped_nylium', 'basalt', 'blackstone'] },
    aether: { hostile: ['cockatrice', 'zephyr'], passive: ['moa', 'phyg', 'sheepuff'],
              ground: ['aether_grass', 'frosted_grass', 'quicksoil', 'holystone'] },
    // Im Ende soll der Drache die Hauptrolle behalten – Endermen bleiben selten
    the_end: { hostile: ['enderman'], passive: [], ground: ['end_stone'], rate: 0.25, max: 5 }
  };

  // Welche Mobs passen in dieses Biom? null = die Tabelle der Dimension nehmen.
  function biomMischung(world, x, z, feindlich) {
    if (!MC.Dim || world.gen.genV < 3) return null;
    var st = MC.Dim.stimmung(world, x, z);
    if (!st) return null;
    if (world.dim === 'nether') {
      var NB = MC.Dim.NETHER_BIOME;
      if (!feindlich) return null;
      switch (st.key) {
        // Jedes Biom hat jetzt einen eigenen Bewohner, den es sonst nirgends gibt
        case NB.SOUL: return ['wither_skeleton', 'wither_skeleton', 'ghast', 'ghast'];
        case NB.DELTA: return ['ash_wight', 'ash_wight', 'magma_cube', 'magma_cube'];
        case NB.CRIMSON: return ['hoglin', 'hoglin', 'piglin', 'piglin', 'piglin_brute'];
        case NB.WARPED: return ['enderman', 'piglin'];              // still und fremd
      }
      return null;
    }
    var AB = MC.Dim.AETHER_BIOME;
    if (feindlich) {
      if (st.key === AB.FROST) return ['frost_wight', 'frost_wight', 'zephyr', 'cockatrice'];
      if (st.key === AB.WOLKEN) return ['zephyr'];
      // Die Aechorpflanze steht auf den Wiesen und im Hain – sie wurzelt,
      // darum ist sie nur dort sinnvoll, wo auch Gras wächst.
      if (st.key === AB.WIESEN || st.key === AB.HAIN) {
        return ['aechor_plant', 'aechor_plant', 'cockatrice', 'zephyr'];
      }
      return null;
    }
    if (st.key === AB.HAIN) return ['moa', 'phyg', 'phyg', 'sheepuff'];
    if (st.key === AB.FROST) return ['sheepuff', 'sheepuff', 'moa'];
    if (st.key === AB.FLUGSAND) return ['moa'];
    return null;
  }

  Spawner.otherDim = function (game, world, p, hostiles, passives, maxHostile, maxPassive) {
    var table = DIM_MOBS[world.dim];
    if (!table) return;
    var groundIds = table.ground.map(function (n) { return B.id(n); });
    // Eigene Obergrenze je Dimension – im Ende soll der Drache die Bühne haben
    if (table.max !== undefined) maxHostile = Math.min(maxHostile, table.max);

    for (var t = 0; t < 4; t++) {
      if (table.rate !== undefined && Math.random() > table.rate) continue;
      var ang = Math.random() * Math.PI * 2;
      var r = 22 + Math.random() * 30;
      var x = Math.floor(p.x + Math.cos(ang) * r);
      var z = Math.floor(p.z + Math.sin(ang) * r);
      var col = world.chunkAt(x, z);
      if (!col || col.state < 2) continue;

      // freie Stelle über festem, passendem Boden suchen
      var y = -1;
      var from = Math.min(MC.WORLD_HEIGHT - 4, Math.floor(p.y) + 22);
      for (var sy = from; sy > 4; sy--) {
        var g = world.getBlock(x, sy, z);
        if (groundIds.indexOf(g) < 0) continue;
        if (world.getBlock(x, sy + 1, z) !== 0 || world.getBlock(x, sy + 2, z) !== 0) continue;
        y = sy + 1; break;
      }
      if (y < 0) continue;

      var wantHostile = table.passive.length === 0 || Math.random() < 0.6;
      var kinds = wantHostile ? table.hostile : table.passive;
      // Ab Version 3 hat jedes Biom seine eigene Mischung. Solange es keine
      // eigenen Kreaturen gibt, verschiebt das nur die Gewichte - ein
      // Basaltdelta gehoert den Magmawuerfeln, ein Seelensandtal den Ghasts.
      var misch = biomMischung(world, x, z, wantHostile);
      if (misch) kinds = misch;
      if (!kinds.length) continue;
      if (wantHostile && hostiles >= maxHostile) continue;
      if (!wantHostile && passives >= maxPassive) continue;

      var kind = kinds[(Math.random() * kinds.length) | 0];
      var spec = MOB_TYPES[kind];
      // Manche brauchen einen bestimmten Boden – die Aechorpflanze wurzelt und
      // hat auf Flugsand nichts verloren, auch nicht am Rand einer Wiese.
      if (spec.braucht) {
        var bod = B.byId[world.getBlock(x, y - 1, z)];
        if (!bod || spec.braucht.indexOf(bod.name) < 0) continue;
      }
      // Fliegende Mobs erscheinen weiter oben in der Luft
      var sy2 = spec.flying ? y + 6 + Math.random() * 8 : y + 0.1;
      var m = new Mob(world, kind, x + 0.5, sy2, z + 0.5);
      if (m.distTo(p) < 18) continue;
      if (m.height > 2 && world.getBlock(x, y + 2, z) !== 0) continue;
      world.entities.push(m);
      if (wantHostile) hostiles++; else passives++;

      if (!wantHostile) {
        var extra = (Math.random() * 3) | 0;
        for (var e = 0; e < extra; e++) {
          world.entities.push(new Mob(world, kind, x + 0.5 + (Math.random() - 0.5) * 3, y + 0.1, z + 0.5 + (Math.random() - 0.5) * 3));
          passives++;
        }
      }
    }
  };

  // Lohen gehören zur Bastion, nicht in den freien Nether. Sie kommen darum
  // nicht aus der allgemeinen Tabelle – sonst nähmen Piglins ihnen die Plätze
  // weg und Lohenruten wären reine Glückssache. Eine Bastion hält bis zu vier.
  // An einer Bastion steht neben der Lohe auch die Wache
  Spawner.bastionsWachen = function (game) {
    var world = game.world, p = game.player;
    if (!p || game.mode === 'creative') return;
    // fortressNear liefert eine Liste, nicht eine einzelne Festung
    var liste = MC.Dim.fortressNear ? MC.Dim.fortressNear(world.gen, p.x, p.z) : null;
    if (!liste || !liste.length) return;
    var f = liste[0];
    var n = 0;
    for (var i = 0; i < world.entities.length; i++) {
      var e = world.entities[i];
      if (e.type === 'mob' && !e.dead && (e.mobType === 'piglin_brute' || e.mobType === 'wither_skeleton')) n++;
    }
    if (n >= 4) return;
    if (Math.random() > 0.35) return;
    var art = Math.random() < 0.5 ? 'piglin_brute' : 'wither_skeleton';
    var sx = f.x + ((Math.random() * 14) | 0) - 7, sz = f.z + ((Math.random() * 14) | 0) - 7;
    for (var y = Math.min(MC.WORLD_HEIGHT - 4, Math.floor(p.y) + 16); y > 6; y--) {
      if (!B.isSolid(world.getBlock(sx, y, sz))) continue;
      if (world.getBlock(sx, y + 1, sz) !== 0 || world.getBlock(sx, y + 2, sz) !== 0) break;
      var m = new Mob(world, art, sx + 0.5, y + 1.05, sz + 0.5);
      if (m.distTo(p) > 10) world.entities.push(m);
      break;
    }
  };

  Spawner.blazes = function (game) {
    var w = game.world, p = game.player;
    var list = MC.Dim.fortressNear(w.gen, Math.floor(p.x), Math.floor(p.z));
    if (!list || !list.length) return;
    var f = list[0];

    var n = 0;
    for (var i = 0; i < w.entities.length; i++) {
      var e = w.entities[i];
      if (!e.dead && e.mobType === 'blaze') n++;
    }
    if (n >= 4) return;

    for (var t = 0; t < 6; t++) {
      var x = f.x + Math.round((Math.random() - 0.5) * 20);
      var z = f.z + Math.round((Math.random() - 0.5) * 20);
      var y = f.y + 3 + ((Math.random() * 6) | 0);
      if (!w.isLoaded(x, y, z)) continue;
      if (w.getBlock(x, y, z) !== 0 || w.getBlock(x, y + 1, z) !== 0) continue;
      var m = new Mob(w, 'blaze', x + 0.5, y, z + 0.5);
      if (m.distTo(p) < 10 || m.distTo(p) > 48) continue;
      w.entities.push(m);
      return;   // pro Durchlauf höchstens eine
    }
  };

  // Dorfbewohner: pro Dorf so viele wie Wohnhäuser, höchstens acht.
  // Jeder besetzt eine feste Platznummer, damit sein Beruf gleich bleibt.
  // Fische: Schwärme im offenen Wasser, ab Weltversion 5
  Spawner.fische = function (game) {
    var world = game.world, p = game.player;
    if (!p || world.gen.genV < 5) return;
    var n = 0;
    for (var i = 0; i < world.entities.length; i++) {
      if (world.entities[i].mobType === 'fish' && !world.entities[i].dead) n++;
    }
    if (n >= 48) return;
    var sea = world.gen.sea;
    var schwaerme = 0;
    for (var t = 0; t < 10 && schwaerme < 2; t++) {
      var ang = Math.random() * Math.PI * 2, r = 12 + Math.random() * 30;
      var x = Math.floor(p.x + Math.cos(ang) * r), z = Math.floor(p.z + Math.sin(ang) * r);
      var col = world.chunkAt(x, z);
      if (!col || col.state < 2) continue;
      // Die alte Version suchte nur knapp unter der Oberfläche. In den tiefen
      // Becken war dort oft gar kein Fisch möglich – jetzt zählt die ganze
      // Wassersäule, und tiefe Stellen bekommen die größeren Schwärme.
      // heightAtWorld liefert über dem Meer die Wasseroberfläche, nicht den
      // Grund – der Boden muss von oben herunter gesucht werden.
      var boden = -1;
      for (var y2 = sea; y2 > sea - 48; y2--) {
        if (!B.zaehltAlsWasser(world.getBlock(x, y2, z), world.getMeta(x, y2, z))) { boden = y2; break; }
      }
      if (boden < 0 || sea - boden < 3) continue;
      var tiefe = sea - boden;
      var y = boden + 1 + ((Math.random() * (tiefe - 1)) | 0);
      if (!B.zaehltAlsWasser(world.getBlock(x, y, z), world.getMeta(x, y, z))) continue;
      if (!B.zaehltAlsWasser(world.getBlock(x, y + 1, z), world.getMeta(x, y + 1, z))) continue;
      var gruppe = 4 + ((Math.random() * 5) | 0) + (tiefe > 12 ? 3 : 0);
      for (var k = 0; k < gruppe && n < 48; k++, n++) {
        // Nur nach unten streuen – sonst hüpft ein Fisch aus dem Wasser
        var m = new Mob(world, 'fish', x + 0.5 + (Math.random() - 0.5) * 4,
                        y + 0.3 - Math.random() * Math.min(2, tiefe - 2), z + 0.5 + (Math.random() - 0.5) * 4);
        world.entities.push(m);
      }
      schwaerme++;
    }
  };

  Spawner.villagers = function (game) {
    var world = game.world, p = game.player;
    if (!MC.Village || !world.gen.o.structures) return;
    var v = MC.Village.nearest(world.gen, p.x, p.z, 80);
    if (!v) return;

    var want = 0;
    for (var b = 0; b < v.builds.length; b++) {
      var t = v.builds[b].type;
      if (t === 'haus_klein' || t === 'haus_gross' || t === 'schmiede' || t === 'bibliothek') want++;
    }
    want = Math.min(8, want);
    if (want === 0) return;

    var taken = {}, have = 0;
    for (var i = 0; i < world.entities.length; i++) {
      var e = world.entities[i];
      if (e.mobType === 'villager' && !e.dead && e.villageId === v.id) { taken[e.slot] = true; have++; }
    }
    if (have >= want) return;

    for (var s = 0; s < want; s++) {
      if (taken[s]) continue;
      var spot = MC.Village.spawnSpot(v, s);
      var bx = Math.floor(spot.x), bz = Math.floor(spot.z);
      if (!world.isLoaded(bx, v.y, bz)) return;
      // freien Boden über dem Dorfniveau suchen
      var y = -1;
      for (var yy = v.y + 4; yy > v.y - 4; yy--) {
        if (B.isSolid(world.getBlock(bx, yy, bz)) &&
            world.getBlock(bx, yy + 1, bz) === 0 && world.getBlock(bx, yy + 2, bz) === 0) { y = yy + 1; break; }
      }
      if (y < 0) continue;
      var m = new Mob(world, 'villager', bx + 0.5, y + 0.05, bz + 0.5);
      m.makeVillager(v.id, s, { x: v.x, z: v.z }, MC.Village.homeFor(v, s), v);
      world.entities.push(m);
      return;   // pro Durchlauf höchstens einer
    }
  };

  function pickDarkSpot(world, x, z, p) {
    for (var tries = 0; tries < 10; tries++) {
      var y = 6 + ((Math.random() * 90) | 0);
      if (world.getBlock(x, y, z) !== 0) continue;
      if (world.getBlock(x, y + 1, z) !== 0) continue;
      var g = world.getBlock(x, y - 1, z);
      if (g === 0 || !B.isSolid(g)) continue;
      if (B.byId[g] && B.byId[g].liquid) continue;
      var bl = world.getBlockLight(x, y, z);
      var sk = world.getSky(x, y, z);
      if (bl > 7) continue;
      if (sk > 7 && !world.isNight()) continue;
      return y;
    }
    return -1;
  }

})();
