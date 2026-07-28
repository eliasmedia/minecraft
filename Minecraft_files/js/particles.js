/* ============================================================
   particles.js  -  Partikelsystem (Blockbruch, Rauch, Explosion, ...)
   ============================================================ */
(function () {
  'use strict';

  var T = MC.Textures;

  // Einfarbige Partikeltexturen nachtragen
  [['p_white', [245, 245, 245]], ['p_gray', [130, 130, 130]], ['p_dark', [60, 60, 60]],
   ['p_red', [180, 30, 30]], ['p_orange', [255, 160, 40]], ['p_blue', [80, 130, 220]],
   ['p_yellow', [255, 230, 120]]].forEach(function (p) {
    if (T.has(p[0])) return;
    T.add(p[0], function (g) { g.fill(p[1]); g.noise(0.12); });
  });

  function Particles(world) {
    this.world = world;
    this.list = [];
    this.max = 2200;
  }
  MC.Particles = Particles;

  Particles.prototype.spawn = function (x, y, z, vx, vy, vz, layer, size, life, grav, uv) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({
      x: x, y: y, z: z, vx: vx, vy: vy, vz: vz,
      layer: layer, size: size, life: life, maxLife: life,
      grav: grav === undefined ? 20 : grav,
      u0: uv ? uv[0] : 0, v0: uv ? uv[1] : 0, u1: uv ? uv[2] : 1, v1: uv ? uv[3] : 1
    });
  };

  Particles.prototype.update = function (dt) {
    var l = this.list;
    for (var i = l.length - 1; i >= 0; i--) {
      var p = l[i];
      p.life -= dt;
      if (p.life <= 0) { l.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      var nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      // simple Kollision
      if (this.solid(nx, p.y, p.z)) { p.vx *= -0.3; nx = p.x; }
      if (this.solid(p.x, ny, p.z)) { if (p.vy < 0) { p.vy = 0; p.vx *= 0.6; p.vz *= 0.6; } else p.vy = 0; ny = p.y; }
      if (this.solid(p.x, p.y, nz)) { p.vz *= -0.3; nz = p.z; }
      p.x = nx; p.y = ny; p.z = nz;
      p.vx *= Math.pow(0.6, dt); p.vz *= Math.pow(0.6, dt);
    }
  };

  Particles.prototype.solid = function (x, y, z) {
    var id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    if (!id) return false;
    var b = MC.Blocks.byId[id];
    return b && b.opaque;
  };

  // --- konkrete Effekte ---
  Particles.prototype.blockBreak = function (x, y, z, blockId, meta, count) {
    var b = MC.Blocks.byId[blockId];
    if (!b) return;
    var layer = MC.Mesher.faceLayer(b, 2, meta);
    for (var i = 0; i < (count || 22); i++) {
      var u = Math.random() * 0.75, v = Math.random() * 0.75;
      this.spawn(x + Math.random(), y + Math.random() * 0.9 + 0.05, z + Math.random(),
        (Math.random() - 0.5) * 3.2, Math.random() * 3.6, (Math.random() - 0.5) * 3.2,
        layer, 0.11 + Math.random() * 0.06, 0.6 + Math.random() * 0.7, 20,
        [u, v, u + 0.25, v + 0.25]);
    }
  };

  Particles.prototype.blockHit = function (x, y, z, blockId, meta, nx, ny, nz) {
    var b = MC.Blocks.byId[blockId];
    if (!b) return;
    var layer = MC.Mesher.faceLayer(b, 2, meta);
    for (var i = 0; i < 3; i++) {
      var u = Math.random() * 0.75, v = Math.random() * 0.75;
      this.spawn(x + 0.5 + nx * 0.55 + (Math.random() - 0.5) * 0.5,
                 y + 0.5 + ny * 0.55 + (Math.random() - 0.5) * 0.5,
                 z + 0.5 + nz * 0.55 + (Math.random() - 0.5) * 0.5,
        nx * 2 + (Math.random() - 0.5) * 1.5, ny * 2 + Math.random() * 1.5, nz * 2 + (Math.random() - 0.5) * 1.5,
        layer, 0.08, 0.35 + Math.random() * 0.3, 16, [u, v, u + 0.25, v + 0.25]);
    }
  };

  Particles.prototype.smoke = function (x, y, z, n) {
    for (var i = 0; i < (n || 4); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.4, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.8, (Math.random() - 0.5) * 0.6,
        T.layer('p_gray'), 0.14 + Math.random() * 0.1, 0.8 + Math.random(), -1.5);
    }
  };

  Particles.prototype.flame = function (x, y, z, n) {
    for (var i = 0; i < (n || 2); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.3, y + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.3, 0.5 + Math.random() * 0.5, (Math.random() - 0.5) * 0.3,
        T.layer('p_orange'), 0.09, 0.4 + Math.random() * 0.3, -2);
    }
  };

  Particles.prototype.explosion = function (x, y, z, power) {
    for (var i = 0; i < 90; i++) {
      var a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1);
      var s = (2 + Math.random() * 7) * (power / 4);
      this.spawn(x, y, z,
        Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s,
        T.layer(Math.random() < 0.5 ? 'p_orange' : 'p_dark'), 0.25 + Math.random() * 0.35,
        0.6 + Math.random() * 0.9, 6);
    }
  };

  Particles.prototype.blood = function (x, y, z) {
    for (var i = 0; i < 8; i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.5, z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3,
        T.layer('p_red'), 0.09, 0.5, 18);
    }
  };

  Particles.prototype.death = function (x, y, z) {
    for (var i = 0; i < 26; i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.8, y + (Math.random() - 0.5) * 0.9, z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5,
        T.layer('p_white'), 0.16, 0.8, 1);
    }
  };

  Particles.prototype.splash = function (x, y, z, n) {
    for (var i = 0; i < (n || 12); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3,
        T.layer('p_blue'), 0.08, 0.5, 22);
    }
  };

  Particles.prototype.crit = function (x, y, z) {
    for (var i = 0; i < 10; i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2,
        T.layer('p_yellow'), 0.08, 0.4, 10);
    }
  };

})();
