/* ============================================================
   scene.js  -  Testszene in derselben Technik wie das Spiel
   ------------------------------------------------------------
   Bewusst WebGL2 + TEXTURE_2D_ARRAY + dasselbe Vertexformat
   (x,y,z, u,v, layer, blockLight, skyLight, shade = 9 Floats)
   und dieselbe Beleuchtungsformel wie Minecraft_files/js/renderer.js.
   Was hier funktioniert, funktioniert im Spiel ohne Umbau.

   Zusätzlich: Schalter für genau die technischen Punkte, die für
   das derzeitige Weichzeichnen verantwortlich sind. Damit lässt sich
   am lebenden Bild trennen, was Technik und was Kunst ist.
   ============================================================ */
(function (root) {
  'use strict';

  var Scene = {};
  root.Scene = Scene;

  var FPV = 9;

  // Flächen wie im Mesher: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z
  var FACES = [
    { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
    { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
    { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] }
  ];
  var UVS = [[0, 1], [1, 1], [1, 0], [0, 0]];

  // Bisher: symmetrisch, also ohne Lichtrichtung.
  var SHADE_FLAT = [0.62, 0.62, 1.00, 0.50, 0.80, 0.80];
  // Vorschlag: asymmetrisch aus einer festen Sonnenrichtung.
  var SHADE_DIR = [0.86, 0.58, 1.00, 0.46, 0.74, 0.64];

  // ---------- Matrizen ----------
  function mIdent() { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
  function mPersp(fovy, asp, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function mMul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0;
      for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function mLookAt(eye, ctr, up) {
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function norm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
    var z = norm(sub(eye, ctr)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
    ]);
  }

  // ---------- Shader ----------
  // Identisch zum Spiel, ergänzt um uSrgb (Gammakorrektur) und uLodBias.
  var VS = [
    '#version 300 es',
    'in vec3 aPos; in vec2 aUV; in float aLayer; in float aBl; in float aSl; in float aShade;',
    'uniform mat4 uMVP; uniform vec3 uCam; uniform float uFogNear; uniform float uFogFar;',
    'out vec3 vUVW; out float vLight; out float vFog; out float vShade;',
    'void main(){',
    '  gl_Position = uMVP * vec4(aPos,1.0);',
    '  vUVW = vec3(aUV, aLayer);',
    '  float f = max(aBl, aSl);',
    '  vLight = 0.085 + 0.915 * pow(f, 0.82);',
    '  vShade = aShade;',
    '  float d = distance(aPos, uCam);',
    '  vFog = clamp((d - uFogNear)/max(0.001,(uFogFar-uFogNear)), 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS = [
    '#version 300 es',
    'precision highp float; precision highp sampler2DArray;',
    'in vec3 vUVW; in float vLight; in float vFog; in float vShade;',
    'uniform sampler2DArray uTex; uniform vec3 uFogColor; uniform float uAlphaTest;',
    'uniform float uSrgb; uniform float uLodBias;',
    'out vec4 outColor;',
    'void main(){',
    '  vec4 c = texture(uTex, vUVW, uLodBias);',
    '  if (c.a < uAlphaTest) discard;',
    // sRGB an: erst in linearen Raum, dort beleuchten, dann zurück.
    // Genau das fehlt derzeit im Spiel und lässt jeden Schatten schlammig werden.
    '  vec3 rgb = c.rgb;',
    '  if (uSrgb > 0.5) rgb = pow(rgb, vec3(2.2));',
    '  rgb *= vLight * vShade;',
    '  if (uSrgb > 0.5) rgb = pow(max(rgb, vec3(0.0)), vec3(1.0/2.2));',
    '  rgb = mix(rgb, uFogColor, vFog);',
    '  outColor = vec4(rgb, c.a);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var w = { prog: p, u: {}, a: {} };
    var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < nu; i++) { var n = gl.getActiveUniform(p, i).name.replace('[0]', ''); w.u[n] = gl.getUniformLocation(p, n); }
    var na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var k = 0; k < na; k++) { var an = gl.getActiveAttrib(p, k).name; w.a[an] = gl.getAttribLocation(p, an); }
    return w;
  }

  // ============================================================
  //  Die Szene: welche Texturen wo liegen
  // ============================================================
  // Semantische Kürzel -> Texturname in BEIDEN Atlanten. Das ist der
  // Trick, mit dem der A/B-Vergleich funktioniert.
  var SLOTS = {
    neu: {
      grassTop: 'grass_top', grassSide: 'grass_side', dirt: 'dirt', stone: 'stone',
      cobble: 'cobblestone', bricks: 'stone_bricks', sand: 'sand', gravel: 'gravel',
      planks: 'planks_oak', logSide: 'log_oak', logTop: 'log_oak_top', leaves: 'leaves_oak',
      coal: 'coal_ore', iron: 'iron_ore', gold: 'gold_ore', diamond: 'diamond_ore',
      redstone: 'redstone_ore', snow: 'snow_block', ice: 'ice', glow: 'glowstone',
      obsidian: 'obsidian', clay: 'clay', water: 'water',
      grassPlant: 'tall_grass', fRed: 'flower_red', fYellow: 'flower_yellow', fBlue: 'flower_blue',
      mushRed: 'mushroom_red', mushBrown: 'mushroom_brown', sapling: 'sapling_oak', bush: 'dead_bush',
      creeperBody: 'creeper_body', creeperFace: 'creeper_face',
      pigBody: 'pig_body', pigFace: 'pig_face',
      playerBody: 'player_body', playerFace: 'player_face', playerArm: 'player_arm',
      pick: 'iron_pickaxe', gem: 'diamond', white: 'white'
    },
    alt: {
      grassTop: 'grass_top', grassSide: 'grass_side', dirt: 'dirt', stone: 'stone',
      cobble: 'cobblestone', bricks: 'stone_bricks', sand: 'sand', gravel: 'gravel',
      planks: 'planks_oak', logSide: 'log_oak', logTop: 'log_oak_top', leaves: 'leaves_oak',
      coal: 'coal_ore', iron: 'iron_ore', gold: 'gold_ore', diamond: 'diamond_ore',
      redstone: 'redstone_ore', snow: 'snow_block', ice: 'ice', glow: 'glowstone',
      obsidian: 'obsidian', clay: 'clay', water: 'water',
      grassPlant: 'tall_grass', fRed: 'flower_red', fYellow: 'flower_yellow', fBlue: 'flower_blue',
      mushRed: 'mushroom_red', mushBrown: 'mushroom_brown', sapling: 'sapling_oak', bush: 'dead_bush',
      creeperBody: 'mob_creeper', creeperFace: 'mob_creeper_face',
      pigBody: 'mob_pig', pigFace: 'mob_pig_face',
      playerBody: 'player_skin', playerFace: 'player_face', playerArm: 'mob_player_arm',
      pick: 'iron_pickaxe', gem: 'diamond', white: 'white'
    }
  };

  // Ein Blocktyp = Texturen je Fläche (top, bottom, side) oder Kreuzform
  function cube(top, side, bottom) { return { kind: 'cube', top: top, side: side, bottom: bottom || side }; }
  function cross(t) { return { kind: 'cross', tex: t }; }

  function blockDefs(S) {
    return {
      grass:   cube(S.grassTop, S.grassSide, S.dirt),
      dirt:    cube(S.dirt, S.dirt),
      stone:   cube(S.stone, S.stone),
      cobble:  cube(S.cobble, S.cobble),
      bricks:  cube(S.bricks, S.bricks),
      sand:    cube(S.sand, S.sand),
      gravel:  cube(S.gravel, S.gravel),
      planks:  cube(S.planks, S.planks),
      log:     cube(S.logTop, S.logSide),
      leaves:  cube(S.leaves, S.leaves),
      coal:    cube(S.coal, S.coal),
      iron:    cube(S.iron, S.iron),
      gold:    cube(S.gold, S.gold),
      diamond: cube(S.diamond, S.diamond),
      glow:    cube(S.glow, S.glow),
      snow:    cube(S.snow, S.snow),
      obsidian:cube(S.obsidian, S.obsidian),
      plant:   cross(S.grassPlant),
      fred:    cross(S.fRed),
      fyellow: cross(S.fYellow),
      fblue:   cross(S.fBlue),
      mred:    cross(S.mushRed),
      mbrown:  cross(S.mushBrown),
      sap:     cross(S.sapling),
      bush:    cross(S.bush)
    };
  }

  // ---------- Die Diorama-Welt ----------
  var W = 18, H = 12, D = 18;
  function idx(x, y, z) { return (y * D + z) * W + x; }

  function buildWorld() {
    var v = new Array(W * H * D).fill(null);
    function set(x, y, z, b) { if (x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D) v[idx(x, y, z)] = b; }
    function get(x, y, z) { return (x >= 0 && x < W && y >= 0 && y < H && z >= 0 && z < D) ? v[idx(x, y, z)] : null; }

    // Sockel aus Stein, darauf Erde, darauf Gras – sanft gewellt
    for (var x = 0; x < W; x++) for (var z = 0; z < D; z++) {
      var h = 3 + Math.round(Math.sin(x * 0.45) * 0.9 + Math.cos(z * 0.4) * 0.9);
      for (var y = 0; y < h - 1; y++) set(x, y, z, 'stone');
      set(x, h - 1, z, 'dirt');
      set(x, h, z, 'grass');
      // Erzader im Sockel, an der Schnittkante sichtbar
      if (z === 0 && y !== undefined) { /* Kante bleibt frei */ }
    }
    // Angeschnittene Steilwand vorn: legt Schichten und Erze offen
    for (var xx = 0; xx < W; xx++) for (var zz = 0; zz < 3; zz++) {
      for (var yy = 0; yy < H; yy++) set(xx, yy, zz, null);
    }
    for (var x2 = 0; x2 < W; x2++) {
      var h2 = 3 + Math.round(Math.sin(x2 * 0.45) * 0.9 + Math.cos(3 * 0.4) * 0.9);
      for (var y2 = 0; y2 < h2 - 1; y2++) set(x2, y2, 3, 'stone');
      set(x2, h2 - 1, 3, 'dirt'); set(x2, h2, 3, 'grass');
    }
    set(3, 1, 3, 'coal'); set(4, 1, 3, 'coal');
    set(7, 0, 3, 'iron'); set(8, 1, 3, 'iron');
    set(11, 0, 3, 'gold');
    set(14, 1, 3, 'diamond');
    set(5, 0, 3, 'gravel'); set(6, 0, 3, 'gravel');

    // Sandstrand rechts
    for (var x3 = 13; x3 < W; x3++) for (var z3 = 10; z3 < D; z3++) {
      var top = -1;
      for (var y3 = H - 1; y3 >= 0; y3--) if (get(x3, y3, z3)) { top = y3; break; }
      if (top >= 0) set(x3, top, z3, 'sand');
    }

    // Baum
    var tx = 5, tz = 11, ty = 0;
    for (var y4 = H - 1; y4 >= 0; y4--) if (get(tx, y4, tz)) { ty = y4 + 1; break; }
    for (var t = 0; t < 5; t++) set(tx, ty + t, tz, 'log');
    var krone = [
      [-2, 3, 0], [-1, 3, 0], [0, 3, 0], [1, 3, 0], [2, 3, 0],
      [0, 3, -2], [0, 3, -1], [0, 3, 1], [0, 3, 2],
      [-1, 3, -1], [1, 3, -1], [-1, 3, 1], [1, 3, 1],
      [-2, 3, -1], [-2, 3, 1], [2, 3, -1], [2, 3, 1],
      [-1, 3, -2], [1, 3, -2], [-1, 3, 2], [1, 3, 2],
      [-1, 4, 0], [1, 4, 0], [0, 4, -1], [0, 4, 1], [0, 4, 0],
      [-1, 4, -1], [1, 4, 1], [-1, 4, 1], [1, 4, -1],
      [0, 5, 0], [-1, 5, 0], [1, 5, 0], [0, 5, -1], [0, 5, 1]
    ];
    krone.forEach(function (k) { set(tx + k[0], ty + k[1], tz + k[2], 'leaves'); });

    // Kleiner Setzling und ein Busch
    function aufBoden(x, z, b) {
      for (var y = H - 1; y >= 0; y--) if (get(x, y, z)) { set(x, y + 1, z, b); return; }
    }
    aufBoden(10, 12, 'sap');
    aufBoden(15, 13, 'bush');

    // Vegetation streuen – fest gesetzt, damit die Vorschau reproduzierbar ist
    [[4, 6], [6, 7], [7, 5], [9, 8], [11, 6], [12, 9], [3, 9], [8, 12], [13, 7], [5, 14], [9, 15], [2, 12], [16, 8]]
      .forEach(function (p) { aufBoden(p[0], p[1], 'plant'); });
    [[5, 8], [10, 5], [14, 5]].forEach(function (p) { aufBoden(p[0], p[1], 'fred'); });
    [[8, 6], [12, 12]].forEach(function (p) { aufBoden(p[0], p[1], 'fyellow'); });
    [[3, 6], [11, 14]].forEach(function (p) { aufBoden(p[0], p[1], 'fblue'); });
    [[6, 13]].forEach(function (p) { aufBoden(p[0], p[1], 'mred'); });
    [[7, 14]].forEach(function (p) { aufBoden(p[0], p[1], 'mbrown'); });

    // Ein gebautes Häuschen-Fragment: zeigt Bretter, Bruchstein, Ziegel,
    // Leuchtstein im Zusammenspiel – Materialien müssen nebeneinander lesbar sein.
    var hx = 1, hz = 5, hy = 0;
    for (var y5 = H - 1; y5 >= 0; y5--) if (get(hx, y5, hz)) { hy = y5 + 1; break; }
    for (var a = 0; a < 3; a++) for (var b = 0; b < 3; b++) {
      set(hx + a, hy, hz + b, 'cobble');
    }
    for (var c = 0; c < 3; c++) {
      set(hx, hy + 1, hz + c, 'planks');
      set(hx + 2, hy + 1, hz + c, 'bricks');
    }
    set(hx + 1, hy + 1, hz, 'planks');
    set(hx + 1, hy + 2, hz + 1, 'glow');
    set(hx, hy + 2, hz, 'obsidian');
    set(hx + 2, hy + 2, hz + 2, 'snow');

    return { get: get, set: set };
  }

  // ============================================================
  //  Vernetzung
  // ============================================================
  function meshWorld(world, defs, atlas, shades) {
    var out = [];
    function push(v) { for (var i = 0; i < v.length; i++) out.push(v[i]); }
    function layerOf(name) { return atlas.layer(name); }

    // Sehr einfache Ambient Occlusion – dieselbe Idee wie im Mesher
    function solid(x, y, z) { var b = world.get(x, y, z); return !!b && defs[b] && defs[b].kind === 'cube'; }
    var AO = [0.58, 0.74, 0.88, 1.0];

    for (var y = 0; y < H; y++) for (var z = 0; z < D; z++) for (var x = 0; x < W; x++) {
      var name = world.get(x, y, z);
      if (!name) continue;
      var def = defs[name];
      if (!def) continue;

      if (def.kind === 'cross') {
        var lay = layerOf(def.tex);
        var quads = [
          [[0.07, 0, 0.07], [0.93, 0, 0.93], [0.93, 1, 0.93], [0.07, 1, 0.07]],
          [[0.93, 0, 0.07], [0.07, 0, 0.93], [0.07, 1, 0.93], [0.93, 1, 0.07]]
        ];
        for (var q = 0; q < 2; q++) for (var side = 0; side < 2; side++) {
          for (var i = 0; i < 4; i++) {
            var k = side === 0 ? i : (3 - i);
            var p = quads[q][k];
            push([x + p[0], y + p[1], z + p[2], UVS[k][0], UVS[k][1], lay, 0, 1, 0.94]);
          }
        }
        continue;
      }

      for (var f = 0; f < 6; f++) {
        var F = FACES[f], n = F.n;
        if (solid(x + n[0], y + n[1], z + n[2])) continue;
        var texName = f === 2 ? def.top : (f === 3 ? def.bottom : def.side);
        var lay2 = layerOf(texName);
        var sh = shades[f];
        for (var vi = 0; vi < 4; vi++) {
          var v = F.v[vi];
          // AO an der Ecke bestimmen
          var ax = [], nn = n;
          var axes = [];
          for (var t2 = 0; t2 < 3; t2++) if (nn[t2] === 0) axes.push(t2);
          var s0 = v[axes[0]] * 2 - 1, s1 = v[axes[1]] * 2 - 1;
          var o1 = nn.slice(), o2 = nn.slice(), oc = nn.slice();
          o1[axes[0]] += s0; oc[axes[0]] += s0;
          o2[axes[1]] += s1; oc[axes[1]] += s1;
          var a1 = solid(x + o1[0], y + o1[1], z + o1[2]) ? 1 : 0;
          var a2 = solid(x + o2[0], y + o2[1], z + o2[2]) ? 1 : 0;
          var ac = solid(x + oc[0], y + oc[1], z + oc[2]) ? 1 : 0;
          var lvl = (a1 && a2) ? 0 : (3 - (a1 + a2 + ac));
          void ax;
          push([x + v[0], y + v[1], z + v[2], UVS[vi][0], UVS[vi][1], lay2, 0, 1, sh * AO[lvl]]);
        }
      }
    }
    return new Float32Array(out);
  }

  // ---------- Kreaturen und Gegenstände als Quader ----------
  function boxMesh(parts, atlas, shades, S) {
    var out = [];
    parts.forEach(function (p) {
      var s = 1 / 16;
      for (var f = 0; f < 6; f++) {
        var F = FACES[f];
        var texName = (f === 5 && p.front) ? p.front : p.tex;
        var lay = atlas.layer(S[texName] || texName);
        for (var i = 0; i < 4; i++) {
          var v = F.v[i];
          out.push(
            (p.x + v[0] * p.w) * s + p.ox, (p.y + v[1] * p.h) * s + p.oy, (p.z + v[2] * p.d) * s + p.oz,
            UVS[i][0], UVS[i][1], lay, 0, 1, shades[f]
          );
        }
      }
    });
    return new Float32Array(out);
  }

  function creeperParts(ox, oy, oz) {
    return [
      { tex: 'creeperBody', front: 'creeperFace', x: -4, y: 18, z: -4, w: 8, h: 8, d: 8, ox: ox, oy: oy, oz: oz },
      { tex: 'creeperBody', x: -4, y: 6, z: -2, w: 8, h: 12, d: 4, ox: ox, oy: oy, oz: oz },
      { tex: 'creeperBody', x: -4, y: 0, z: -6, w: 4, h: 6, d: 4, ox: ox, oy: oy, oz: oz },
      { tex: 'creeperBody', x: 0, y: 0, z: -6, w: 4, h: 6, d: 4, ox: ox, oy: oy, oz: oz },
      { tex: 'creeperBody', x: -4, y: 0, z: 2, w: 4, h: 6, d: 4, ox: ox, oy: oy, oz: oz },
      { tex: 'creeperBody', x: 0, y: 0, z: 2, w: 4, h: 6, d: 4, ox: ox, oy: oy, oz: oz }
    ];
  }
  function pigParts(ox, oy, oz) {
    return [
      { tex: 'pigBody', x: -5, y: 6, z: -8, w: 10, h: 8, d: 16, ox: ox, oy: oy, oz: oz },
      { tex: 'pigBody', front: 'pigFace', x: -4, y: 6, z: -12, w: 8, h: 8, d: 4, ox: ox, oy: oy, oz: oz },
      { tex: 'pigBody', x: -5, y: 0, z: -7, w: 4, h: 6, d: 4, ox: ox, oy: oy, oz: oz },
      { tex: 'pigBody', x: 1, y: 0, z: -7, w: 4, h: 6, d: 4, ox: ox, oy: oy, oz: oz },
      { tex: 'pigBody', x: -5, y: 0, z: 3, w: 4, h: 6, d: 4, ox: ox, oy: oy, oz: oz },
      { tex: 'pigBody', x: 1, y: 0, z: 3, w: 4, h: 6, d: 4, ox: ox, oy: oy, oz: oz }
    ];
  }

  // Fallengelassener Gegenstand: als extrudiertes Pixelmodell, genau wie
  // renderer.js es im Spiel macht (itemMesh).
  function itemMesh(atlas, texName, ox, oy, oz, scale) {
    var data = atlas.data(texName);
    if (!data) return new Float32Array(0);
    var lay = atlas.layer(texName), out = [];
    var PX = 1 / 16, DEPTH = 2 / 16;
    function alphaAt(px, py) { return (px < 0 || py < 0 || px > 15 || py > 15) ? 0 : data[(py * 16 + px) * 4 + 3]; }
    function emit(f, mn, mx, u0, u1, v0, v1) {
      var F = FACES[f];
      for (var i = 0; i < 4; i++) {
        var v = F.v[i], uv = UVS[i];
        out.push(
          (mn[0] + v[0] * (mx[0] - mn[0])) * scale + ox,
          (mn[1] + v[1] * (mx[1] - mn[1])) * scale + oy,
          (mn[2] + v[2] * (mx[2] - mn[2])) * scale + oz,
          u0 + uv[0] * (u1 - u0), v0 + uv[1] * (v1 - v0), lay, 0, 1, SHADE_DIR[f]
        );
      }
    }
    for (var py = 0; py < 16; py++) for (var px = 0; px < 16; px++) {
      if (alphaAt(px, py) < 128) continue;
      var mn = [px * PX - 0.5, (15 - py) * PX - 0.5, -DEPTH / 2];
      var mx = [mn[0] + PX, mn[1] + PX, DEPTH / 2];
      var u0 = px / 16, u1 = (px + 1) / 16, v0 = py / 16, v1 = (py + 1) / 16;
      emit(4, mn, mx, u0, u1, v0, v1); emit(5, mn, mx, u0, u1, v0, v1);
      if (alphaAt(px + 1, py) < 128) emit(0, mn, mx, u0, u1, v0, v1);
      if (alphaAt(px - 1, py) < 128) emit(1, mn, mx, u0, u1, v0, v1);
      if (alphaAt(px, py - 1) < 128) emit(2, mn, mx, u0, u1, v0, v1);
      if (alphaAt(px, py + 1) < 128) emit(3, mn, mx, u0, u1, v0, v1);
    }
    return new Float32Array(out);
  }

  // ============================================================
  //  Renderer
  // ============================================================
  Scene.create = function (canvas, atlases, opts) {
    var gl = canvas.getContext('webgl2', { antialias: !!opts.msaa, alpha: false, depth: true, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 nicht verfügbar');

    var prog = program(gl, VS, FS);
    var world = buildWorld();
    var state = {
      atlas: 'neu', mipmap: true, aniso: 16, srgb: true, lodBias: 0,
      dirShade: true, autoRotate: true, yaw: 0.72, pitch: 0.60, dist: 21
    };
    var textures = {}, ibo = null, iboQuads = 0;
    var geo = {};

    function makeIndex(quads) {
      if (iboQuads >= quads) return;
      var arr = new Uint32Array(quads * 6);
      for (var i = 0; i < quads; i++) {
        var o = i * 4;
        arr[i * 6] = o; arr[i * 6 + 1] = o + 1; arr[i * 6 + 2] = o + 2;
        arr[i * 6 + 3] = o; arr[i * 6 + 4] = o + 2; arr[i * 6 + 5] = o + 3;
      }
      if (!ibo) ibo = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      iboQuads = quads;
    }
    makeIndex(200000);

    function buildAtlasTexture(key) {
      var a = atlases[key];
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, a.count(), 0, gl.RGBA, gl.UNSIGNED_BYTE, a.buildBuffer());
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
      textures[key] = tex;
      return tex;
    }
    Object.keys(atlases).forEach(buildAtlasTexture);

    function applyFilter() {
      var tex = textures[state.atlas];
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER,
        state.mipmap ? gl.NEAREST_MIPMAP_LINEAR : gl.NEAREST);
      // Der entscheidende Punkt: die Mipmapkette bei Stufe 2 kappen.
      // Darunter ist von einer 16x16-Kachel nichts mehr übrig als Matsch.
      gl.texParameterf(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAX_LOD, state.capLod ? 2.0 : 1000.0);
      var ext = gl.getExtension('EXT_texture_filter_anisotropic');
      if (ext) {
        var max = gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
        gl.texParameterf(gl.TEXTURE_2D_ARRAY, ext.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(state.aniso, max));
      }
    }

    function rebuild() {
      var a = atlases[state.atlas];
      var S = SLOTS[state.atlas];
      var defs = blockDefs(S);
      var shades = state.dirShade ? SHADE_DIR : SHADE_FLAT;
      var solidData = meshWorld(world, defs, a, shades);

      // Nur die Blattblöcke und Pflanzen brauchen den Alphatest, der Rest
      // ist deckend – hier der Einfachheit halber ein gemeinsamer Durchgang.
      var creeper = boxMesh(creeperParts(9.5, 4.02, 8.5), a, shades, S);
      var pig = boxMesh(pigParts(13.5, 4.02, 6.5), a, shades, S);
      var item1 = itemMesh(a, S.pick, 7.5, 4.6, 13.5, 0.75);
      var item2 = itemMesh(a, S.gem, 8.7, 4.5, 14.2, 0.55);

      var all = [solidData, creeper, pig, item1, item2];
      var total = all.reduce(function (s, x) { return s + x.length; }, 0);
      var merged = new Float32Array(total), off = 0;
      all.forEach(function (x) { merged.set(x, off); off += x.length; });

      if (!geo.buf) {
        geo.buf = gl.createBuffer();
        geo.vao = gl.createVertexArray();
        gl.bindVertexArray(geo.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, geo.buf);
        var stride = FPV * 4;
        gl.enableVertexAttribArray(prog.a.aPos); gl.vertexAttribPointer(prog.a.aPos, 3, gl.FLOAT, false, stride, 0);
        gl.enableVertexAttribArray(prog.a.aUV); gl.vertexAttribPointer(prog.a.aUV, 2, gl.FLOAT, false, stride, 12);
        gl.enableVertexAttribArray(prog.a.aLayer); gl.vertexAttribPointer(prog.a.aLayer, 1, gl.FLOAT, false, stride, 20);
        gl.enableVertexAttribArray(prog.a.aBl); gl.vertexAttribPointer(prog.a.aBl, 1, gl.FLOAT, false, stride, 24);
        gl.enableVertexAttribArray(prog.a.aSl); gl.vertexAttribPointer(prog.a.aSl, 1, gl.FLOAT, false, stride, 28);
        gl.enableVertexAttribArray(prog.a.aShade); gl.vertexAttribPointer(prog.a.aShade, 1, gl.FLOAT, false, stride, 32);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bindVertexArray(null);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, geo.buf);
      gl.bufferData(gl.ARRAY_BUFFER, merged, gl.STATIC_DRAW);
      geo.quads = merged.length / FPV / 4;
      makeIndex(Math.max(iboQuads, Math.ceil(geo.quads * 1.2)));
      gl.bindVertexArray(geo.vao);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
      gl.bindVertexArray(null);
      applyFilter();
    }
    rebuild();

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);

    var FOG = [0.60, 0.72, 0.86];

    function draw() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);

      if (state.autoRotate) state.yaw += 0.0022;
      var cx = W / 2, cz = D / 2 + 1.5, cy = 4.2;
      var eye = [
        cx + Math.cos(state.yaw) * Math.cos(state.pitch) * state.dist,
        cy + Math.sin(state.pitch) * state.dist,
        cz + Math.sin(state.yaw) * Math.cos(state.pitch) * state.dist
      ];
      var proj = mPersp(52 * Math.PI / 180, canvas.width / Math.max(1, canvas.height), 0.1, 200);
      var view = mLookAt(eye, [cx, cy, cz], [0, 1, 0]);
      var mvp = mMul(proj, view);

      gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(prog.prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, textures[state.atlas]);
      gl.uniform1i(prog.u.uTex, 0);
      gl.uniformMatrix4fv(prog.u.uMVP, false, mvp);
      gl.uniform3f(prog.u.uCam, eye[0], eye[1], eye[2]);
      gl.uniform1f(prog.u.uFogNear, 46);
      gl.uniform1f(prog.u.uFogFar, 90);
      gl.uniform3fv(prog.u.uFogColor, new Float32Array(FOG));
      gl.uniform1f(prog.u.uAlphaTest, 0.5);
      gl.uniform1f(prog.u.uSrgb, state.srgb ? 1 : 0);
      gl.uniform1f(prog.u.uLodBias, state.lodBias);

      gl.disable(gl.CULL_FACE);   // Kreuzpflanzen sind beidseitig
      gl.bindVertexArray(geo.vao);
      gl.drawElements(gl.TRIANGLES, geo.quads * 6, gl.UNSIGNED_INT, 0);
      gl.bindVertexArray(null);
      gl.enable(gl.CULL_FACE);

      requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);

    // ---- Maussteuerung ----
    var drag = false, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', function (e) { drag = true; lx = e.clientX; ly = e.clientY; state.autoRotate = false; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointerup', function (e) { drag = false; canvas.releasePointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      state.yaw += (e.clientX - lx) * 0.008;
      state.pitch = Math.max(0.06, Math.min(1.4, state.pitch - (e.clientY - ly) * 0.006));
      lx = e.clientX; ly = e.clientY;
    });
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      state.dist = Math.max(10, Math.min(60, state.dist + e.deltaY * 0.02));
    }, { passive: false });

    return {
      state: state,
      quads: function () { return geo.quads; },
      set: function (k, v) {
        state[k] = v;
        if (k === 'atlas' || k === 'dirShade') rebuild();
        else applyFilter();
      },
      gl: gl
    };
  };

})(window);
