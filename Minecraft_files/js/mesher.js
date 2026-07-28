/* ============================================================
   mesher.js  -  Chunk -> Vertexdaten (mit Ambient Occlusion & weichem Licht)
   Vertexformat: x,y,z, u,v, layer, blockLight, skyLight, shade  (9 Floats)
   ============================================================ */
(function () {
  'use strict';

  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT;
  var B = MC.Blocks;
  var T = MC.Textures;

  var M = {};
  MC.Mesher = M;
  M.FLOATS_PER_VERTEX = 9;

  // Flächen: 0=+X 1=-X 2=+Y 3=-Y 4=+Z 5=-Z
  var FACES = [
    { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.62 },
    { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.62 },
    { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
    { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.5 },
    { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.8 },
    { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8 }
  ];
  var UVS = [[0, 1], [1, 1], [1, 0], [0, 0]];
  M.FACES = FACES;
  M.UVS = UVS;

  // AO-Nachbaroffsets vorberechnen: [face][vertex] = [o1, o2, oc]
  var AO_OFF = [];
  (function () {
    for (var f = 0; f < 6; f++) {
      var n = FACES[f].n;
      var ax = [];
      for (var i = 0; i < 3; i++) if (n[i] === 0) ax.push(i);
      AO_OFF[f] = [];
      for (var vi = 0; vi < 4; vi++) {
        var v = FACES[f].v[vi];
        var s0 = v[ax[0]] * 2 - 1, s1 = v[ax[1]] * 2 - 1;
        var o1 = [n[0], n[1], n[2]], o2 = [n[0], n[1], n[2]], oc = [n[0], n[1], n[2]];
        o1[ax[0]] += s0; oc[ax[0]] += s0;
        o2[ax[1]] += s1; oc[ax[1]] += s1;
        AO_OFF[f][vi] = [o1, o2, oc];
      }
    }
  })();

  var AO_SHADE = [0.60, 0.74, 0.88, 1.0];

  // Wiederverwendete Zwischenspeicher (keine Allokation pro Fläche)
  var tvx = new Float32Array(4), tvy = new Float32Array(4), tvz = new Float32Array(4);
  var tsh = new Float32Array(4), tbl = new Float32Array(4), tsl = new Float32Array(4);
  var tu = new Float32Array(4), tv = new Float32Array(4);
  var ORDER_A = [0, 1, 2, 3], ORDER_B = [1, 2, 3, 0];

  // Wachsender Float-Puffer
  function Buf() { this.a = new Float32Array(65536); this.n = 0; }
  Buf.prototype.need = function (k) {
    if (this.n + k <= this.a.length) return;
    var cap = this.a.length;
    while (cap < this.n + k) cap *= 2;
    var b = new Float32Array(cap);
    b.set(this.a.subarray(0, this.n));
    this.a = b;
  };

  // Texturebene für eine Blockfläche
  function faceLayer(block, face, meta) {
    var tex = block.tex;
    if (typeof tex === 'string') return T.layer(tex);
    var name;
    if (block.shape === B.SHAPE_CROP) return T.layer('wheat_stage' + Math.min(3, meta >> 1));
    // Stämme mit Achse
    if (block.name.indexOf('log_') === 0) {
      var axis = meta & 3;
      var isEnd = (axis === 0 && (face === 2 || face === 3)) ||
                  (axis === 1 && (face === 0 || face === 1)) ||
                  (axis === 2 && (face === 4 || face === 5));
      return T.layer(isEnd ? tex.top : tex.side);
    }
    if (tex.front) {
      var facing = meta & 3;
      var frontFace = facing === 0 ? 5 : facing === 1 ? 0 : facing === 2 ? 4 : 1;
      if (face === frontFace) return T.layer(tex.front);
    }
    if (face === 2) name = tex.top;
    else if (face === 3) name = tex.bottom || tex.top;
    else name = tex.side;
    return T.layer(name || tex.top);
  }
  M.faceLayer = faceLayer;

  // ---------- Hauptfunktion ----------
  M.build = function (world, chunk) {
    var opaque = new Buf(), alpha = new Buf();
    var cx = chunk.cx, cz = chunk.cz;
    var bx0 = cx * CS, bz0 = cz * CS;
    var blocks = chunk.blocks, metas = chunk.meta, lights = chunk.light;

    // schnelle Zugriffe (lokal wenn möglich)
    function gb(x, y, z) {
      if (y < 0) return B.id('bedrock');
      if (y >= WH) return 0;
      if (x >= 0 && x < CS && z >= 0 && z < CS) return blocks[x | (z << 4) | (y << 8)];
      return world.getBlock(bx0 + x, y, bz0 + z);
    }
    function gm(x, y, z) {
      if (y < 0 || y >= WH) return 0;
      if (x >= 0 && x < CS && z >= 0 && z < CS) return metas[x | (z << 4) | (y << 8)];
      return world.getMeta(bx0 + x, y, bz0 + z);
    }
    function gl(x, y, z) {
      if (y < 0) return 0;
      if (y >= WH) return 0xF0;
      if (x >= 0 && x < CS && z >= 0 && z < CS) return lights[x | (z << 4) | (y << 8)];
      return world.getLightRaw(bx0 + x, y, bz0 + z);
    }

    function solidForAO(id) {
      var b = B.byId[id];
      if (!b) return false;
      return b.opaque;
    }

    function emitFace(buf, x, y, z, face, layer, block, meta, boxMin, boxMax, uvRect, doubleSided) {
      var F = FACES[face];
      var vs = F.v;
      var aoOff = AO_OFF[face];
      var shadeBase = F.shade;
      var lightBase = gl(x + F.n[0], y + F.n[1], z + F.n[2]);

      var vx = tvx, vy = tvy, vz = tvz, vs2 = tsh, vbl = tbl, vsl = tsl, vu = tu, vv = tv;
      var i;
      for (i = 0; i < 4; i++) {
        var v = vs[i];
        var px = boxMin[0] + v[0] * (boxMax[0] - boxMin[0]);
        var py = boxMin[1] + v[1] * (boxMax[1] - boxMin[1]);
        var pz = boxMin[2] + v[2] * (boxMax[2] - boxMin[2]);
        vx[i] = bx0 + x + px; vy[i] = y + py; vz[i] = bz0 + z + pz;

        // AO + weiches Licht
        var o = aoOff[i];
        var b1 = gb(x + o[0][0], y + o[0][1], z + o[0][2]);
        var b2 = gb(x + o[1][0], y + o[1][1], z + o[1][2]);
        var bc = gb(x + o[2][0], y + o[2][1], z + o[2][2]);
        var s1 = solidForAO(b1) ? 1 : 0, s2 = solidForAO(b2) ? 1 : 0, sc = solidForAO(bc) ? 1 : 0;
        var ao = (s1 && s2) ? 0 : (3 - (s1 + s2 + sc));
        vs2[i] = shadeBase * AO_SHADE[ao];

        // Licht mitteln
        var sumB = lightBase & 15, sumS = (lightBase >> 4) & 15, cnt = 1;
        if (!s1) { var l1 = gl(x + o[0][0], y + o[0][1], z + o[0][2]); sumB += l1 & 15; sumS += (l1 >> 4) & 15; cnt++; }
        if (!s2) { var l2 = gl(x + o[1][0], y + o[1][1], z + o[1][2]); sumB += l2 & 15; sumS += (l2 >> 4) & 15; cnt++; }
        if (!sc && !(s1 && s2)) { var lc = gl(x + o[2][0], y + o[2][1], z + o[2][2]); sumB += lc & 15; sumS += (lc >> 4) & 15; cnt++; }
        vbl[i] = (sumB / cnt) / 15;
        vsl[i] = (sumS / cnt) / 15;

        var uv = UVS[i];
        vu[i] = uvRect[0] + uv[0] * (uvRect[2] - uvRect[0]);
        vv[i] = uvRect[1] + uv[1] * (uvRect[3] - uvRect[1]);
      }

      // Anisotropie vermeiden: Quad drehen, wenn die Diagonalen ungleich sind
      var order = (vs2[0] + vs2[2] < vs2[1] + vs2[3]) ? ORDER_B : ORDER_A;

      buf.need(4 * 9);
      var a = buf.a, n = buf.n;
      for (i = 0; i < 4; i++) {
        var j = order[i];
        a[n++] = vx[j]; a[n++] = vy[j]; a[n++] = vz[j];
        a[n++] = vu[j]; a[n++] = vv[j]; a[n++] = layer;
        a[n++] = vbl[j]; a[n++] = vsl[j]; a[n++] = vs2[j];
      }
      buf.n = n;

      if (doubleSided) {
        buf.need(4 * 9);
        a = buf.a; n = buf.n;
        for (i = 3; i >= 0; i--) {
          var j2 = order[i];
          a[n++] = vx[j2]; a[n++] = vy[j2]; a[n++] = vz[j2];
          a[n++] = vu[j2]; a[n++] = vv[j2]; a[n++] = layer;
          a[n++] = vbl[j2]; a[n++] = vsl[j2]; a[n++] = vs2[j2] * 0.92;
        }
        buf.n = n;
      }
    }

    var FULL_UV = [0, 0, 1, 1];
    var MIN0 = [0, 0, 0], MAX1 = [1, 1, 1];

    for (var y = 0; y < WH; y++) {
      for (var z = 0; z < CS; z++) {
        for (var x = 0; x < CS; x++) {
          var idx = x | (z << 4) | (y << 8);
          var id = blocks[idx];
          if (id === 0) continue;
          var block = B.byId[id];
          if (!block || block.shape === B.SHAPE_NONE) continue;
          var meta = metas[idx];
          var buf = block.alphaPass ? alpha : opaque;

          switch (block.shape) {

            case B.SHAPE_CROSS: {
              var lay = T.layer(typeof block.tex === 'string' ? block.tex : block.tex.side);
              emitCross(buf, x, y, z, lay, gl(x, y, z), 1.0);
              break;
            }

            case B.SHAPE_CROP: {
              var lay2 = T.layer('wheat_stage' + Math.min(3, meta >> 1));
              emitCross(buf, x, y, z, lay2, gl(x, y, z), 0.95);
              break;
            }

            case B.SHAPE_TORCH: {
              var lt = T.layer('torch');
              var lightHere = gl(x, y, z);
              emitBox(buf, x, y, z, [0.4375, 0, 0.4375], [0.5625, 0.625, 0.5625], lt, lightHere, true);
              break;
            }

            case B.SHAPE_LIQUID: {
              emitLiquid(buf, x, y, z, block, meta);
              break;
            }

            case B.SHAPE_SLAB: {
              var top = (meta & 1) === 1;
              var mn = [0, top ? 0.5 : 0, 0], mx = [1, top ? 1 : 0.5, 1];
              for (var fs = 0; fs < 6; fs++) {
                var nb = gb(x + FACES[fs].n[0], y + FACES[fs].n[1], z + FACES[fs].n[2]);
                var nbB = B.byId[nb];
                if (nbB && nbB.opaque) {
                  var covered = (fs === 3) ? !top : (fs === 2) ? top : true;
                  if (covered) continue;
                }
                var uvr = FULL_UV;
                if (fs !== 2 && fs !== 3) uvr = top ? [0, 0, 1, 0.5] : [0, 0.5, 1, 1];
                emitFace(buf, x, y, z, fs, faceLayer(block, fs, meta), block, meta, mn, mx, uvr, false);
              }
              break;
            }

            case B.SHAPE_BED: {
              emitShapedBox(buf, x, y, z, [0, 0, 0], [1, 0.5625, 1], block, meta);
              break;
            }

            case B.SHAPE_FARMLAND: {
              emitShapedBox(buf, x, y, z, [0, 0, 0], [1, 0.9375, 1], block, meta);
              break;
            }

            default: {
              // Vollwürfel
              for (var f = 0; f < 6; f++) {
                var nn = FACES[f].n;
                var nid = gb(x + nn[0], y + nn[1], z + nn[2]);
                if (nid !== 0) {
                  var nB = B.byId[nid];
                  if (nB) {
                    if (nB.opaque) continue;
                    if (nid === id && (block.alphaPass || block.liquid || block.cutout)) continue;
                    if (nB.shape === B.SHAPE_SLAB) {
                      var slabTop = (gm(x + nn[0], y + nn[1], z + nn[2]) & 1) === 1;
                      if ((f === 2 && !slabTop) || (f === 3 && slabTop)) continue;
                    }
                  }
                }
                emitFace(buf, x, y, z, f, faceLayer(block, f, meta), block, meta, MIN0, MAX1, FULL_UV, false);
              }
              break;
            }
          }
        }
      }
    }

    // ---- lokale Helfer ----
    function emitCross(buf, x, y, z, layer, lightRaw, h) {
      var bl = (lightRaw & 15) / 15, sl = ((lightRaw >> 4) & 15) / 15;
      var quads = [
        [[0.07, 0, 0.07], [0.93, 0, 0.93], [0.93, h, 0.93], [0.07, h, 0.07]],
        [[0.93, 0, 0.07], [0.07, 0, 0.93], [0.07, h, 0.93], [0.93, h, 0.07]]
      ];
      for (var q = 0; q < quads.length; q++) {
        for (var side = 0; side < 2; side++) {
          buf.need(4 * 9);
          var a = buf.a, n = buf.n;
          for (var i = 0; i < 4; i++) {
            var k = side === 0 ? i : (3 - i);
            var p = quads[q][k];
            var uv = UVS[side === 0 ? i : (3 - i)];
            a[n++] = bx0 + x + p[0]; a[n++] = y + p[1]; a[n++] = bz0 + z + p[2];
            a[n++] = uv[0]; a[n++] = uv[1]; a[n++] = layer;
            a[n++] = bl; a[n++] = sl; a[n++] = 0.92;
          }
          buf.n = n;
        }
      }
    }

    function emitBox(buf, x, y, z, mn, mx, layer, lightRaw, cutoutFull) {
      var bl = (lightRaw & 15) / 15, sl = ((lightRaw >> 4) & 15) / 15;
      for (var f = 0; f < 6; f++) {
        var F = FACES[f];
        buf.need(4 * 9);
        var a = buf.a, n = buf.n;
        for (var i = 0; i < 4; i++) {
          var v = F.v[i];
          a[n++] = bx0 + x + mn[0] + v[0] * (mx[0] - mn[0]);
          a[n++] = y + mn[1] + v[1] * (mx[1] - mn[1]);
          a[n++] = bz0 + z + mn[2] + v[2] * (mx[2] - mn[2]);
          a[n++] = UVS[i][0]; a[n++] = UVS[i][1]; a[n++] = layer;
          a[n++] = bl; a[n++] = sl; a[n++] = F.shade;
        }
        buf.n = n;
      }
    }

    function emitShapedBox(buf, x, y, z, mn, mx, block, meta) {
      for (var f = 0; f < 6; f++) {
        emitFace(buf, x, y, z, f, faceLayer(block, f, meta), block, meta, mn, mx, FULL_UV, false);
      }
    }

    function liquidHeight(bx, by, bz, id) {
      if (gb(bx, by + 1, bz) === id) return 1.0;
      var m = gm(bx, by, bz);
      if (m === 0 || m === 8) return 0.875;
      return 0.875 - (m / 8) * 0.75;
    }

    function emitLiquid(buf, x, y, z, block, meta) {
      var id = block.id;
      var lay = T.layer(typeof block.tex === 'string' ? block.tex : block.tex.side);
      var hC = liquidHeight(x, y, z, id);
      var aboveSame = gb(x, y + 1, z) === id;
      // Eckhöhen für ein "fließendes" Aussehen
      function cornerH(dx, dz) {
        if (aboveSame) return 1.0;
        var sum = 0, cnt = 0, maxH = 0;
        for (var ix = 0; ix <= 1; ix++) for (var iz = 0; iz <= 1; iz++) {
          var sx = x + dx * ix, sz = z + dz * iz;
          if (gb(sx, y + 1, sz) === id) return 1.0;
          if (gb(sx, y, sz) === id) { var hh = liquidHeight(sx, y, sz, id); sum += hh; cnt++; if (hh > maxH) maxH = hh; }
          else if (B.byId[gb(sx, y, sz)] && !B.byId[gb(sx, y, sz)].opaque) { cnt++; }
        }
        return cnt ? Math.max(sum / cnt, maxH * 0.85) : hC;
      }
      var h00 = cornerH(-1, -1), h10 = cornerH(1, -1), h01 = cornerH(-1, 1), h11 = cornerH(1, 1);

      for (var f = 0; f < 6; f++) {
        var nn = FACES[f].n;
        var nid = gb(x + nn[0], y + nn[1], z + nn[2]);
        if (nid === id) continue;
        var nB = B.byId[nid];
        if (nB && nB.opaque) continue;
        var mn = [0, 0, 0], mx = [1, hC, 1];
        if (f === 2) {
          // Oberseite mit variablen Eckhöhen
          emitLiquidTop(buf, x, y, z, lay, h00, h10, h01, h11);
          continue;
        }
        if (f === 3) mx[1] = hC;
        emitFace(buf, x, y, z, f, lay, block, meta, mn, mx, [0, 1 - hC, 1, 1], false);
      }
    }

    function emitLiquidTop(buf, x, y, z, layer, h00, h10, h01, h11) {
      var l = gl(x, y + 1, z);
      var bl = (l & 15) / 15, sl = ((l >> 4) & 15) / 15;
      var pts = [[0, h01, 1], [1, h11, 1], [1, h10, 0], [0, h00, 0]];
      buf.need(4 * 9);
      var a = buf.a, n = buf.n;
      for (var i = 0; i < 4; i++) {
        a[n++] = bx0 + x + pts[i][0]; a[n++] = y + pts[i][1]; a[n++] = bz0 + z + pts[i][2];
        a[n++] = UVS[i][0]; a[n++] = UVS[i][1]; a[n++] = layer;
        a[n++] = bl; a[n++] = sl; a[n++] = 1.0;
      }
      buf.n = n;
    }

    return {
      opaque: opaque.a.subarray(0, opaque.n),
      alpha: alpha.a.subarray(0, alpha.n),
      opaqueVerts: opaque.n / 9,
      alphaVerts: alpha.n / 9
    };
  };

})();
