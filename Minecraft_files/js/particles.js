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

  // ============================================================
  //  Geformte Partikel
  // ============================================================
  // Ein farbiges Quadrat sieht als Herz, als Funke und als Aschenflocke gleich
  // aus — und genau das war das Problem: gezähmte Tiere, geworfene Enderperlen
  // und der Nether hatten denselben Effekt. Diese hier haben eine Form, und
  // damit erkennt man auf einen Blick, was gerade passiert.
  //
  // Gezeichnet wird wie bei den Item-Symbolen als Bild aus Zeichen; der Punkt
  // bleibt durchsichtig, und der Alphatest im Partikeldurchgang schneidet ihn
  // sauber weg.
  function formPartikel(name, rows, pal) {
    if (T.has(name)) return;
    T.add(name, function (g) { g.fill([0, 0, 0], 0); g.art(rows, pal); });
  }

  formPartikel('p_herz', [
    '................', '................', '..RRR....RRR....', '.RHHHRR.RHHHRR..',
    'RHHHHHHRHHHHHHR.', 'RHHHHHHHHHHHHHR.', 'RHHHHHHHHHHHHHR.', 'RDHHHHHHHHHHHDR.',
    '.RDHHHHHHHHHDR..', '..RDHHHHHHHDR...', '...RDHHHHHDR....', '....RDHHHDR.....',
    '.....RDHDR......', '......RDR.......', '.......R........', '................'
  ], { R: [168, 24, 44], H: [246, 92, 112], D: [214, 48, 72] });

  formPartikel('p_stern', [
    '................', '.......W........', '.......W........', '......WGW.......',
    '......WGW.......', '.....WGGGW......', '..WWWWGGGWWWW...', '.WGGGGGGGGGGGW..',
    '..WWWWGGGWWWW...', '.....WGGGW......', '......WGW.......', '......WGW.......',
    '.......W........', '.......W........', '................', '................'
  ], { W: [255, 255, 240], G: [255, 226, 128] });

  formPartikel('p_portal', [
    '................', '.....VVVV.......', '...VVPPPPVV.....', '..VPPPPPPPPV....',
    '..VPPHHHHPPV....', '.VPPHHHHHHPPV...', '.VPPHHWWHHPPV...', '.VPPHHWWHHPPV...',
    '.VPPHHHHHHPPV...', '..VPPHHHHPPV....', '..VPPPPPPPPV....', '...VVPPPPVV.....',
    '.....VVVV.......', '................', '................', '................'
  ], { V: [64, 20, 96], P: [126, 54, 186], H: [176, 108, 226], W: [232, 208, 250] });

  formPartikel('p_asche', [
    '................', '................', '....DD..D.......', '...DGGD.DD......',
    '..DGGGGDDGD.....', '..DGGHGGGGGD....', '...DGGGHGGGD....', '....DGGGGGDD....',
    '.....DDGGGD.....', '......DGGD......', '.......DD.......', '................',
    '................', '................', '................', '................'
  ], { D: [42, 40, 42], G: [92, 88, 88], H: [138, 132, 128] });

  formPartikel('p_funke', [
    '................', '................', '.......C........', '......CWC.......',
    '.....CW.WC......', '....CW...WC.....', '...CW.....WC....', '..CW.......WC...',
    '...WC.....CW....', '....WC...CW.....', '.....WC.CW......', '......WCW.......',
    '.......C........', '................', '................', '................'
  ], { C: [96, 190, 255], W: [236, 250, 255] });

  formPartikel('p_wut', [
    '................', '.....DDDD.......', '...DDKKKKDD.....', '..DKKKKKKKKD....',
    '..DKKKKKKKKD....', '.DKKKKKKKKKKD...', '.DKKKKKKKKKKD...', '..DKKKKKKKKD....',
    '...DDKKKKDD.....', '.....DDDD.......', '................', '................',
    '................', '................', '................', '................'
  ], { D: [26, 22, 30], K: [58, 50, 64] });

  formPartikel('p_note', [
    '................', '.........NNNN...', '.........NNNNN..', '.........N...N..',
    '.........N......', '.........N......', '.........N......', '.........N......',
    '......NNNN......', '.....NNNNNN.....', '....NNNNNNN.....', '....NNNNNNN.....',
    '.....NNNNNN.....', '......NNNN......', '................', '................'
  ], { N: [92, 208, 132] });

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

  // ---- Geformte Effekte ----
  // Herzen: Zuneigung. Sie steigen langsam und werden nicht von der Schwerkraft
  // geholt, damit sie über dem Tier stehen bleiben, statt hineinzufallen.
  Particles.prototype.herzen = function (x, y, z, n) {
    for (var i = 0; i < (n || 5); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.7, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 0.5, 0.7 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5,
        T.layer('p_herz'), 0.22 + Math.random() * 0.08, 1.1 + Math.random() * 0.5, -1);
    }
  };

  // Der violette Wirbel des Endes: Perle, Enderman, Portal
  Particles.prototype.portal = function (x, y, z, n) {
    for (var i = 0; i < (n || 8); i++) {
      var a = Math.random() * 6.283, r = 0.3 + Math.random() * 0.5;
      this.spawn(x + Math.cos(a) * r, y + (Math.random() - 0.3) * 1.2, z + Math.sin(a) * r,
        -Math.cos(a) * 1.4, (Math.random() - 0.4) * 1.2, -Math.sin(a) * 1.4,
        T.layer('p_portal'), 0.12 + Math.random() * 0.08, 0.7 + Math.random() * 0.6, 0);
    }
  };

  // Funken: Blitz, aufgeladener Creeper, Amboss
  Particles.prototype.funken = function (x, y, z, n) {
    for (var i = 0; i < (n || 10); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.5, y + (Math.random() - 0.5) * 0.5, z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5,
        T.layer('p_funke'), 0.14, 0.3 + Math.random() * 0.3, 12);
    }
  };

  // Asche: fällt langsam und ohne Eile, wie Flocken im Basaltdelta
  Particles.prototype.asche = function (x, y, z, n) {
    for (var i = 0; i < (n || 1); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.4, -0.3 - Math.random() * 0.3, (Math.random() - 0.5) * 0.4,
        T.layer('p_asche'), 0.13 + Math.random() * 0.07, 2.4 + Math.random() * 2, 0.12);
    }
  };

  // Ärger über dem Kopf: der Enderman, kurz bevor er nachsetzt
  Particles.prototype.wut = function (x, y, z, n) {
    for (var i = 0; i < (n || 3); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.5, y + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.7, 0.8 + Math.random() * 0.4, (Math.random() - 0.5) * 0.7,
        T.layer('p_wut'), 0.16, 0.7 + Math.random() * 0.4, -0.8);
    }
  };

  // Zufriedenheit: ein geglückter Handel, ein Erfolg
  Particles.prototype.noten = function (x, y, z, n) {
    for (var i = 0; i < (n || 4); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.7, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6,
        T.layer('p_note'), 0.2, 1 + Math.random() * 0.5, -1);
    }
  };

  // Sporen: das Leuchten der Pilzwälder, langsam und schwerelos
  Particles.prototype.sporen = function (x, y, z, n) {
    for (var i = 0; i < (n || 1); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.6, y, z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.3, (Math.random() - 0.3) * 0.4, (Math.random() - 0.5) * 0.3,
        T.layer('p_stern'), 0.07 + Math.random() * 0.05, 3 + Math.random() * 2, 0.05);
    }
  };

  // Zauberei: der violette Schimmer beim Trinken und Verzaubern
  Particles.prototype.zauber = function (x, y, z, n) {
    for (var i = 0; i < (n || 6); i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.7, y + (Math.random() - 0.5) * 0.5, z + (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.8, (Math.random() - 0.5) * 1.2,
        T.layer(Math.random() < 0.5 ? 'p_portal' : 'p_stern'), 0.09, 0.6 + Math.random() * 0.4, -0.5);
    }
  };

  // Kauen: Krümel des Essens, das man gerade im Mund hat. Sie tragen wirklich
  // die Textur der Speise — ein Apfel bröselt rot, Brot braun.
  Particles.prototype.kauen = function (x, y, z, stack) {
    var it = stack && MC.Items.get(stack.id);
    var layer = T.layer(it && T.has(it.tex) ? it.tex : 'p_white');
    for (var i = 0; i < 4; i++) {
      var u = Math.random() * 0.75, v = Math.random() * 0.75;
      this.spawn(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6,
        layer, 0.07, 0.5, 14, [u, v, u + 0.25, v + 0.25]);
    }
  };

  // Der kritische Treffer: Sterne, nicht bloß gelbe Klötzchen
  Particles.prototype.crit = function (x, y, z) {
    for (var i = 0; i < 10; i++) {
      this.spawn(x + (Math.random() - 0.5) * 0.6, y + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2,
        T.layer('p_stern'), 0.13, 0.4, 10);
    }
  };

})();
