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
    return { dx: e.x - ox, dy: e.y - oy, dz: e.z - oz };
  };

  // Versucht, eine Stufe hochzusteigen
  P.moveWithStep = function (world, e, dx, dz, stepHeight) {
    var sx = e.x, sy = e.y, sz = e.z;
    var wasGround = e.onGround;
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
    return { dx: e.x - sx, dy: e.y - sy, dz: e.z - sz };
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
          if (world.getBlock(x, y, z) === id) return true;
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
    if ((game.tickCount & 1) === 0) game.particles.crit(this.x, this.y, this.z);
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

    game.particles.crit(p.x, p.eyeY(), p.z);
    p.x = bx + 0.5; p.y = by; p.z = bz + 0.5;
    p.vx = p.vy = p.vz = 0;
    p.fallStart = null;
    game.particles.crit(p.x, p.eyeY(), p.z);
    game.audio.play('enderman');
    game.ensureChunksAround(p.x, p.z, 1);
    if (game.mode !== 'creative') p.hurt(5, null, game);
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
      MC.explode(game, this.x, this.y + 0.5, this.z, 4.2);
    }
  };

  // ============================================================
  //  Explosion
  // ============================================================
  MC.explode = function (game, x, y, z, power) {
    var world = game.world;
    var r = Math.ceil(power);
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
        part('armR', 'ROBE', -8, 15, -3, 4, 9, 4, 'armCross', [-4, 22, -1]),
        part('armL', 'ROBE', 4, 15, -3, 4, 9, 4, 'armCross', [4, 22, -1]),
        part('legR', 'ROBE', -4, 0, -2, 4, 12, 4, 'legFR', [-2, 12, 0]),
        part('legL', 'ROBE', 0, 0, -2, 4, 12, 4, 'legFL', [2, 12, 0])
      ]
    },
    player: {
      height: 1.8, width: 0.6, scale: 0.92,
      parts: [
        part('head', { all: 'player_skin', front: 'player_face' }, -4, 24, -4, 8, 8, 8, 'head', [0, 24, 0]),
        part('body', 'player_skin', -4, 12, -2, 8, 12, 4),
        part('armR', 'mob_player_arm', -8, 12, -2, 4, 12, 4, 'armZ', [-6, 23, 0]),
        part('armL', 'mob_player_arm', 4, 12, -2, 4, 12, 4, 'armZ', [6, 23, 0]),
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
    pig: { hp: 10, hostile: false, speed: 2.1, drops: [{ id: 'porkchop_raw', min: 1, max: 3 }], xp: 2, sound: 'pig' },
    cow: { hp: 10, hostile: false, speed: 2.0, drops: [{ id: 'beef_raw', min: 1, max: 3 }, { id: 'leather', min: 0, max: 2 }], xp: 2, sound: 'cow' },
    sheep: { hp: 8, hostile: false, speed: 2.0, drops: [{ id: 'mutton_raw', min: 1, max: 2 }], xp: 2, sound: 'sheep' },
    chicken: { hp: 4, hostile: false, speed: 1.8, drops: [{ id: 'chicken_raw', min: 1, max: 1 }, { id: 'feather', min: 0, max: 2 }], xp: 1, sound: 'chicken' },
    zombie: { hp: 20, hostile: true, speed: 2.4, damage: 3, drops: [{ id: 'porkchop_raw', min: 0, max: 0 }], xp: 5, sound: 'zombie', burns: true },
    skeleton: { hp: 20, hostile: true, speed: 2.5, damage: 2, ranged: true, drops: [{ id: 'bone', min: 0, max: 2 }, { id: 'arrow', min: 0, max: 2 }], xp: 5, sound: 'skeleton', burns: true },
    creeper: { hp: 20, hostile: true, speed: 2.2, damage: 0, drops: [{ id: 'gunpowder', min: 0, max: 2 }], xp: 5, sound: 'creeper' },
    villager: { hp: 20, hostile: false, speed: 1.5, drops: [], xp: 0, sound: 'villager' },
    // ---- Nether ----
    piglin: { hp: 20, hostile: true, speed: 2.3, damage: 4, drops: [{ id: 'gold_ingot', min: 0, max: 1 }, { id: 'porkchop_raw', min: 0, max: 1 }], xp: 5, sound: 'pig', fireproof: true },
    ghast: { hp: 10, hostile: true, speed: 1.6, damage: 0, ranged: true, flying: true, projectile: 'fireball', drops: [{ id: 'gunpowder', min: 0, max: 2 }], xp: 5, sound: 'ghast', fireproof: true },
    magma_cube: { hp: 12, hostile: true, speed: 1.9, damage: 3, hop: true, drops: [{ id: 'magma_block', min: 0, max: 1 }], xp: 4, sound: 'thud', fireproof: true },
    // Lohe: einzige Quelle für Lohenruten, darum nur bei den Bastionen
    blaze: { hp: 20, hostile: true, speed: 1.5, damage: 5, ranged: true, flying: true, projectile: 'flame', drops: [{ id: 'blaze_rod', min: 1, max: 2 }], xp: 10, sound: 'fizz', fireproof: true },
    // ---- Enderman: überall zu Hause, friedlich bis man ihn anstarrt ----
    // Zwei Perlen als Höchstwert: für zwölf Augen wären 0–1 wie im Original
    // hier zu zäh, weil deutlich weniger Endermen unterwegs sind
    enderman: { hp: 40, hostile: false, speed: 3.4, damage: 7, drops: [{ id: 'ender_pearl', min: 0, max: 2 }], xp: 5, sound: 'enderman' },
    // ---- Aether ----
    moa: { hp: 14, hostile: false, speed: 2.2, drops: [{ id: 'feather', min: 1, max: 3 }], xp: 3, sound: 'chicken' },
    phyg: { hp: 10, hostile: false, speed: 2.0, drops: [{ id: 'porkchop_raw', min: 1, max: 2 }], xp: 2, sound: 'pig' },
    sheepuff: { hp: 8, hostile: false, speed: 1.9, drops: [{ id: 'mutton_raw', min: 1, max: 2 }], xp: 2, sound: 'sheep' },
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
    this.headYaw = 0; this.headPitch = 0;
    this.burning = 0;
    this.woolColor = null;
    this.sheared = false;
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
  Mob.prototype.makeVillager = function (villageId, slot, home, house) {
    var d = MC.Village.villagerData(villageId, slot);
    this.villageId = villageId;
    this.slot = slot;
    this.home = home;
    this.house = house || null;
    this.doorCd = 0;
    this.profession = d.profession;
    this.professionTitle = d.title;
    this.robe = d.robe;
    this.offers = d.offers;
    return this;
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
      if (p && !p.dead && dist < 16 && game.mode !== 'creative') {
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
            MC.explode(game, this.x, this.y + 0.8, this.z, 3.6);
            return;
          }
        } else {
          if (this.fuse > 0) this.fuse = Math.min(1.6, this.fuse + dt * 0.7);
          if (this.fuse > 1.55) this.fuse = -1;
          this.moveToward(dt, wantYaw, 1);
        }
      } else if (this.spec.ranged) {
        if (dist > 10) this.moveToward(dt, wantYaw, 1);
        else if (dist < 5) this.moveToward(dt, wantYaw + Math.PI, 0.8);
        else this.strafe(dt, wantYaw);
        if (this.attackCd <= 0 && dist < 16 && this.canSee(p)) {
          this.attackCd = 2.0;
          this.shootArrow(game, p);
        }
      } else {
        this.moveToward(dt, wantYaw, 1);
        if (dist < 1.6 && this.attackCd <= 0) {
          this.attackCd = 1.0;
          p.hurt(this.spec.damage, this, game);
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
    if (p && !p.dead && game.mode !== 'creative') {
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
      this.moveToward(dt, Math.atan2(ziel[0] - this.x, ziel[1] - this.z), bedroht ? 1.5 : 1);
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
    if (!this.hostile && p && !p.dead && game.mode !== 'creative') {
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
          game.particles.crit(this.x, this.y + this.height * 0.9, this.z);
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
      game.particles.crit(this.x, this.y + 1.6, this.z);
      this.x = x + 0.5; this.y = y; this.z = z + 0.5;
      this.vx = this.vy = this.vz = 0;
      game.particles.crit(this.x, this.y + 1.6, this.z);
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
    if (this.hurtTime > 0.25 || this.dead) return;
    this.hp -= amount;
    this.hurtTime = 0.5;
    // Ein getroffener Enderman wird wütend und setzt sich erst einmal ab
    if (this.mobType === 'enderman') {
      this.hostile = true;
      if (this.hp > 0 && Math.random() < 0.5) { this.teleportNear(game, 12); return; }
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

  Mob.prototype.die = function (game, source) {
    this.dead = true;
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
    if (!p || game.mode === 'creative') { }
    Spawner.timer = (Spawner.timer || 0) + dt;
    if (Spawner.timer < 4) return;
    Spawner.timer = 0;

    var mobs = 0, hostiles = 0, passives = 0;
    for (var i = 0; i < world.entities.length; i++) {
      var e = world.entities[i];
      if (e.type === 'mob' && !e.dead) { mobs++; if (e.hostile) hostiles++; else passives++; }
    }
    var night = world.isNight();
    var maxHostile = game.difficulty === 'peaceful' ? 0 : (night ? 12 : 4);
    var maxPassive = 12;

    if (world.dim !== 'overworld') {
      if (world.dim === 'nether') Spawner.blazes(game);
      Spawner.otherDim(game, world, p, hostiles, passives, maxHostile, maxPassive);
      return;
    }

    Spawner.villagers(game);

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
        var kinds2 = ['zombie', 'zombie', 'zombie', 'zombie', 'zombie', 'zombie', 'zombie', 'zombie',
                      'skeleton', 'skeleton', 'skeleton', 'skeleton', 'skeleton', 'skeleton', 'skeleton', 'skeleton',
                      'creeper', 'creeper', 'creeper', 'creeper', 'creeper', 'creeper', 'creeper', 'enderman'];
        var kind2 = kinds2[(Math.random() * kinds2.length) | 0];
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
    nether: { hostile: ['piglin', 'piglin', 'piglin', 'piglin', 'ghast', 'ghast', 'magma_cube'], passive: [], ground: ['netherrack', 'soul_sand', 'magma_block'] },
    aether: { hostile: ['cockatrice', 'zephyr'], passive: ['moa', 'phyg', 'sheepuff'], ground: ['aether_grass', 'quicksoil', 'holystone'] },
    // Im Ende soll der Drache die Hauptrolle behalten – Endermen bleiben selten
    the_end: { hostile: ['enderman'], passive: [], ground: ['end_stone'], rate: 0.25, max: 5 }
  };

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
      if (!kinds.length) continue;
      if (wantHostile && hostiles >= maxHostile) continue;
      if (!wantHostile && passives >= maxPassive) continue;

      var kind = kinds[(Math.random() * kinds.length) | 0];
      var spec = MOB_TYPES[kind];
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
      m.makeVillager(v.id, s, { x: v.x, z: v.z }, MC.Village.homeFor(v, s));
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
