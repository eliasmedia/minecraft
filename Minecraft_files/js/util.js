/* ============================================================
   util.js  -  Mathe, Zufall, Noise, Vektoren, Matrizen
   ============================================================ */
var MC = window.MC || {};
window.MC = MC;

MC.CHUNK_SIZE = 16;
MC.WORLD_HEIGHT = 128;
MC.SEA_LEVEL = 62;

(function () {
  'use strict';

  var U = {};
  MC.U = U;

  U.clamp = function (v, a, b) { return v < a ? a : (v > b ? b : v); };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.smooth = function (t) { return t * t * t * (t * (t * 6 - 15) + 10); };
  U.fract = function (x) { return x - Math.floor(x); };
  U.sign = function (x) { return x < 0 ? -1 : (x > 0 ? 1 : 0); };
  U.mod = function (a, n) { return ((a % n) + n) % n; };

  // ---------- deterministischer RNG (mulberry32) ----------
  U.rng = function (seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.hashString = function (s) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  };

  // 3D Integer-Hash -> 0..1  (für Streuung ohne State)
  U.hash3 = function (x, y, z) {
    var h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
    h = (h ^ (h >>> 13)) | 0;
    h = Math.imul(h, 1274126177) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // ---------- Perlin / Simplex Noise ----------
  function Noise(seed) {
    var rnd = U.rng(seed);
    var p = new Uint8Array(512);
    var perm = new Uint8Array(256);
    var i;
    for (i = 0; i < 256; i++) perm[i] = i;
    for (i = 255; i > 0; i--) {
      var j = (rnd() * (i + 1)) | 0;
      var t = perm[i]; perm[i] = perm[j]; perm[j] = t;
    }
    for (i = 0; i < 512; i++) p[i] = perm[i & 255];
    this.p = p;
  }

  function grad2(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y; case 1: return -x + y;
      case 2: return x - y; case 3: return -x - y;
      case 4: return x; case 5: return -x;
      case 6: return y; default: return -y;
    }
  }
  function grad3(hash, x, y, z) {
    var h = hash & 15;
    var u = h < 8 ? x : y;
    var v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  Noise.prototype.n2 = function (x, y) {
    var p = this.p;
    var X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    var u = U.smooth(x), v = U.smooth(y);
    var A = p[X] + Y, B = p[X + 1] + Y;
    return U.lerp(
      U.lerp(grad2(p[A], x, y), grad2(p[B], x - 1, y), u),
      U.lerp(grad2(p[A + 1], x, y - 1), grad2(p[B + 1], x - 1, y - 1), u),
      v);
  };

  Noise.prototype.n3 = function (x, y, z) {
    var p = this.p;
    var X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    var u = U.smooth(x), v = U.smooth(y), w = U.smooth(z);
    var A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z;
    var B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return U.lerp(
      U.lerp(
        U.lerp(grad3(p[AA], x, y, z), grad3(p[BA], x - 1, y, z), u),
        U.lerp(grad3(p[AB], x, y - 1, z), grad3(p[BB], x - 1, y - 1, z), u), v),
      U.lerp(
        U.lerp(grad3(p[AA + 1], x, y, z - 1), grad3(p[BA + 1], x - 1, y, z - 1), u),
        U.lerp(grad3(p[AB + 1], x, y - 1, z - 1), grad3(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w);
  };

  Noise.prototype.fbm2 = function (x, y, oct, lac, gain) {
    oct = oct || 4; lac = lac || 2; gain = gain === undefined ? 0.5 : gain;
    var a = 1, f = 1, s = 0, n = 0;
    for (var i = 0; i < oct; i++) {
      s += a * this.n2(x * f, y * f);
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  };

  // Kammrauschen. `1 - |n|` faltet das Rauschen an der Null und macht aus
  // runden Buckeln scharfe Grate – das ist der Unterschied zwischen Hügeln und
  // einem Gebirge. Jede Oktave wird mit der vorigen gewichtet, sonst zerfasert
  // der Kamm in Kies. Ergebnis 0..1.
  Noise.prototype.ridge2 = function (x, y, oct) {
    oct = oct || 4;
    var sum = 0, norm = 0, amp = 1, freq = 1, w = 1;
    for (var i = 0; i < oct; i++) {
      var v = 1 - Math.abs(this.n2(x * freq, y * freq)) * 1.7;
      if (v < 0) v = 0;
      v = v * v * w;
      w = v * 2; if (w > 1) w = 1;
      sum += v * amp; norm += amp;
      amp *= 0.5; freq *= 2;
    }
    return sum / norm;
  };

  Noise.prototype.fbm3 = function (x, y, z, oct, lac, gain) {
    oct = oct || 4; lac = lac || 2; gain = gain === undefined ? 0.5 : gain;
    var a = 1, f = 1, s = 0, n = 0;
    for (var i = 0; i < oct; i++) {
      s += a * this.n3(x * f, y * f, z * f);
      n += a; a *= gain; f *= lac;
    }
    return s / n;
  };

  U.Noise = Noise;

  // ---------- Matrix 4x4 (column major, wie WebGL) ----------
  var M4 = {};
  U.M4 = M4;

  M4.create = function () {
    return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  };

  M4.identity = function (o) {
    o[0] = 1; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = 1; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 1; o[11] = 0;
    o[12] = 0; o[13] = 0; o[14] = 0; o[15] = 1;
    return o;
  };

  M4.perspective = function (o, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o[0] = f / aspect; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = f; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = (far + near) * nf; o[11] = -1;
    o[12] = 0; o[13] = 0; o[14] = 2 * far * near * nf; o[15] = 0;
    return o;
  };

  M4.ortho = function (o, l, r, b, t, n, f) {
    var lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f);
    o[0] = -2 * lr; o[1] = 0; o[2] = 0; o[3] = 0;
    o[4] = 0; o[5] = -2 * bt; o[6] = 0; o[7] = 0;
    o[8] = 0; o[9] = 0; o[10] = 2 * nf; o[11] = 0;
    o[12] = (l + r) * lr; o[13] = (t + b) * bt; o[14] = (f + n) * nf; o[15] = 1;
    return o;
  };

  M4.multiply = function (o, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (var i = 0; i < 4; i++) {
      var b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  };

  M4.translate = function (o, a, x, y, z) {
    if (o !== a) for (var i = 0; i < 12; i++) o[i] = a[i];
    o[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
    o[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
    o[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
    o[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    return o;
  };

  M4.scale = function (o, a, x, y, z) {
    o[0] = a[0] * x; o[1] = a[1] * x; o[2] = a[2] * x; o[3] = a[3] * x;
    o[4] = a[4] * y; o[5] = a[5] * y; o[6] = a[6] * y; o[7] = a[7] * y;
    o[8] = a[8] * z; o[9] = a[9] * z; o[10] = a[10] * z; o[11] = a[11] * z;
    o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15];
    return o;
  };

  M4.rotateX = function (o, a, r) {
    var s = Math.sin(r), c = Math.cos(r);
    var a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (o !== a) { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; o[3] = a[3]; o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; }
    o[4] = a10 * c + a20 * s; o[5] = a11 * c + a21 * s; o[6] = a12 * c + a22 * s; o[7] = a13 * c + a23 * s;
    o[8] = a20 * c - a10 * s; o[9] = a21 * c - a11 * s; o[10] = a22 * c - a12 * s; o[11] = a23 * c - a13 * s;
    return o;
  };

  M4.rotateY = function (o, a, r) {
    var s = Math.sin(r), c = Math.cos(r);
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    if (o !== a) { o[4] = a[4]; o[5] = a[5]; o[6] = a[6]; o[7] = a[7]; o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; }
    o[0] = a00 * c - a20 * s; o[1] = a01 * c - a21 * s; o[2] = a02 * c - a22 * s; o[3] = a03 * c - a23 * s;
    o[8] = a00 * s + a20 * c; o[9] = a01 * s + a21 * c; o[10] = a02 * s + a22 * c; o[11] = a03 * s + a23 * c;
    return o;
  };

  M4.rotateZ = function (o, a, r) {
    var s = Math.sin(r), c = Math.cos(r);
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    if (o !== a) { o[8] = a[8]; o[9] = a[9]; o[10] = a[10]; o[11] = a[11]; o[12] = a[12]; o[13] = a[13]; o[14] = a[14]; o[15] = a[15]; }
    o[0] = a00 * c + a10 * s; o[1] = a01 * c + a11 * s; o[2] = a02 * c + a12 * s; o[3] = a03 * c + a13 * s;
    o[4] = a10 * c - a00 * s; o[5] = a11 * c - a01 * s; o[6] = a12 * c - a02 * s; o[7] = a13 * c - a03 * s;
    return o;
  };

  // Blickmatrix aus Yaw/Pitch (FPS-Kamera), invertiert (=View)
  M4.fpsView = function (o, px, py, pz, yaw, pitch) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    // Blickrichtung f, Rechts r = f x up, Hoch u = r x f
    // (r x u == -f  =>  Determinante +1, kein gespiegeltes Bild)
    var fx = sy * cp, fy = -sp, fz = cy * cp;
    var rx = -cy, ry = 0, rz = sy;
    var ux = sy * sp, uy = cp, uz = cy * sp;
    // View = transpose(R) * translate(-p);  Kamera schaut entlang -Z
    o[0] = rx; o[1] = ux; o[2] = -fx; o[3] = 0;
    o[4] = ry; o[5] = uy; o[6] = -fy; o[7] = 0;
    o[8] = rz; o[9] = uz; o[10] = -fz; o[11] = 0;
    o[12] = -(rx * px + ry * py + rz * pz);
    o[13] = -(ux * px + uy * py + uz * pz);
    o[14] = (fx * px + fy * py + fz * pz);
    o[15] = 1;
    return o;
  };

  U.dirFromAngles = function (yaw, pitch) {
    var cp = Math.cos(pitch);
    return { x: Math.sin(yaw) * cp, y: -Math.sin(pitch), z: Math.cos(yaw) * cp };
  };

  // ---------- Frustum aus ViewProj ----------
  U.extractFrustum = function (m, out) {
    out = out || [];
    for (var i = 0; i < 6; i++) if (!out[i]) out[i] = new Float32Array(4);
    var p = out;
    // left, right, bottom, top, near, far
    p[0][0] = m[3] + m[0]; p[0][1] = m[7] + m[4]; p[0][2] = m[11] + m[8]; p[0][3] = m[15] + m[12];
    p[1][0] = m[3] - m[0]; p[1][1] = m[7] - m[4]; p[1][2] = m[11] - m[8]; p[1][3] = m[15] - m[12];
    p[2][0] = m[3] + m[1]; p[2][1] = m[7] + m[5]; p[2][2] = m[11] + m[9]; p[2][3] = m[15] + m[13];
    p[3][0] = m[3] - m[1]; p[3][1] = m[7] - m[5]; p[3][2] = m[11] - m[9]; p[3][3] = m[15] - m[13];
    p[4][0] = m[3] + m[2]; p[4][1] = m[7] + m[6]; p[4][2] = m[11] + m[10]; p[4][3] = m[15] + m[14];
    p[5][0] = m[3] - m[2]; p[5][1] = m[7] - m[6]; p[5][2] = m[11] - m[10]; p[5][3] = m[15] - m[14];
    for (var k = 0; k < 6; k++) {
      var pl = p[k];
      var len = Math.sqrt(pl[0] * pl[0] + pl[1] * pl[1] + pl[2] * pl[2]) || 1;
      pl[0] /= len; pl[1] /= len; pl[2] /= len; pl[3] /= len;
    }
    return out;
  };

  U.aabbInFrustum = function (planes, x0, y0, z0, x1, y1, z1) {
    for (var i = 0; i < 6; i++) {
      var p = planes[i];
      var px = p[0] > 0 ? x1 : x0;
      var py = p[1] > 0 ? y1 : y0;
      var pz = p[2] > 0 ? z1 : z0;
      if (p[0] * px + p[1] * py + p[2] * pz + p[3] < 0) return false;
    }
    return true;
  };

  // ---------- Farb-Helfer ----------
  U.rgb = function (r, g, b) { return [r / 255, g / 255, b / 255]; };
  U.mixColor = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  };

  U.formatTime = function (t) {
    var h = Math.floor(t * 24), m = Math.floor((t * 24 - h) * 60);
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  };

})();
