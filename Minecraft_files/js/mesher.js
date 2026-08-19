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
  //
  // Die Werte sind bewusst ASYMMETRISCH: +X ist heller als -X, +Z heller
  // als -Z. Damit bekommt die Welt eine feste Sonnenrichtung (hoch, leicht
  // von vorne rechts) und Würfel werden zu Körpern. Vorher waren +X/-X
  // beide 0,62 und +Z/-Z beide 0,80 - ein Block sah von jeder Seite gleich
  // aus, Gebäude und Gelände wirkten dadurch flach.
  var FACES = [
    { n: [1, 0, 0], v: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.86 },
    { n: [-1, 0, 0], v: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.58 },
    { n: [0, 1, 0], v: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0 },
    { n: [0, -1, 0], v: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.46 },
    { n: [0, 0, 1], v: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.74 },
    { n: [0, 0, -1], v: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.64 }
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

  var AO_SHADE = [0.58, 0.74, 0.88, 1.0];

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

  // Wie viele Gemäldemotive es gibt. Steht hier, damit ein Meta jenseits der
  // Motivzahl (aus einem älteren Spielstand) nicht auf Weiß fällt.
  var MOTIVE = 6;

  // Texturebene für eine Blockfläche
  // Die Wuchsreihe einer Pflanze. Ein Block ohne eigenes `tex` erbt seinen
  // Namen als Zeichenkette — Weizen heißt darum 'wheat', seine Bilder aber
  // 'wheat_stage0' bis '3'. Ohne diese Ergänzung landet er auf 'wheat' und
  // damit auf Weiß; genau das war die Wechselwirkung mit dem Nethergewächs,
  // dessen Reihe über tex.stage kommt.
  function cropReihe(block) {
    var tex = block.tex;
    if (typeof tex !== 'string') return tex.stage || 'wheat_stage';
    return T.has(tex + '0') ? tex : tex + '_stage';
  }
  M.cropReihe = cropReihe;

  function faceLayer(block, face, meta) {
    var tex = block.tex;
    // Die Wuchsstufe steht VOR der Abkürzung für einfache Texturen — sonst
    // greift bei einer Pflanze ohne eigenes tex der Name statt der Reihe.
    if (block.shape === B.SHAPE_CROP) {
      return T.layer(cropReihe(block) + Math.min(3, meta >> (block.stufen === 4 ? 0 : 1)));
    }
    if (typeof tex === 'string') return T.layer(tex);
    var name;
    // Tür: obere/untere Hälfte bestimmt die Textur, nicht die Fläche
    if (block.shape === B.SHAPE_DOOR) return T.layer((meta & 1) ? tex.top : tex.bottom);
    // Gemälde: das Motiv liegt auf der Vorderseite, alles andere ist Rahmenholz
    if (block.shape === B.SHAPE_PAINTING) {
      if (face !== B.SIDE_FACE[meta & 3]) return T.layer(tex.all);
      return T.layer('painting_' + ((meta >> 2) % MOTIVE));
    }
    // Endportalrahmen: Meta-Bit 0 = Enderauge eingesetzt
    if (block.name === 'end_portal_frame' && face === 2 && (meta & 1)) return T.layer('end_portal_frame_eye');
    // Stämme mit Achse
    if (block.name.indexOf('log_') === 0) {
      var axis = meta & 3;
      var isEnd = (axis === 0 && (face === 2 || face === 3)) ||
                  (axis === 1 && (face === 0 || face === 1)) ||
                  (axis === 2 && (face === 4 || face === 5));
      return T.layer(isEnd ? tex.top : tex.side);
    }
    // Kolben zeigen in sechs Richtungen, nicht nur in vier
    if (block.piston6) {
      var pd = meta & 7;
      var pf = B.FACE6[pd];
      if (face === pf) return T.layer(tex.front);
      // die Rückseite ist die gegenüberliegende Fläche
      var gegen = B.FACE6[pd < 4 ? ((pd + 2) & 3) : (pd === 4 ? 5 : 4)];
      if (face === gegen) return T.layer(tex.back || tex.side);
      return T.layer(tex.side);
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
              // Wasserdurchlässige Pflanzen tragen ihr Wasser selbst. Vorher
              // wurde nur verhindert, dass die Nachbarn eine Wand gegen sie
              // ziehen – in der Zelle selbst stand aber gar kein Wasser. In
              // tiefem Wasser fiel das nicht auf, in einem Block flachem Wasser
              // klaffte genau dort ein Loch in der Oberfläche.
              if (B.istGeflutet(id, meta)) {
                var wB = B.byId[B.id('water')];
                emitLiquid(wB.alphaPass ? alpha : opaque, x, y, z, wB, 0);
              }
              break;
            }

            case B.SHAPE_CROP: {
              // Die Texturreihe steht am Block. Hier stand sie früher fest auf
              // Weizen – deshalb war ein gesetztes Nethergewächs grün.
              var lay2 = T.layer(cropReihe(block) + Math.min(3, meta >> (block.stufen === 4 ? 0 : 1)));
              emitCross(buf, x, y, z, lay2, gl(x, y, z), 0.95);
              break;
            }

            case B.SHAPE_SIGN:
            case B.SHAPE_SIGN_WALL:
            case B.SHAPE_FRAME:
            case B.SHAPE_PAINTING: {
              var sbx = B.schildBoxen(block.shape, meta);
              for (var sbi = 0; sbi < sbx.length; sbi++) {
                emitBoxCulled(buf, x, y, z, sbx[sbi], block, meta, 0);
              }
              break;
            }

            case B.SHAPE_RAIL: {
              // Eine flache Fläche knapp über dem Boden. Die Drehung steckt in
              // den Texturkoordinaten, nicht in der Geometrie — ein Viereck
              // bleibt ein Viereck, egal wie die Schiene liegt.
              var rm = meta & 7;
              var kurve = rm >= 2;
              emitRail(buf, x, y, z, T.layer(kurve ? 'rail_curve' : 'rail'), gl(x, y, z), rm);
              break;
            }

            case B.SHAPE_HOPPER: {
              // Rand oben, Trog darunter, Auslauf in Richtung des Metas
              emitBoxCulled(buf, x, y, z, [0, 0.625, 0, 1, 1, 1], block, meta, 0);
              emitBoxCulled(buf, x, y, z, [0.25, 0.25, 0.25, 0.75, 0.625, 0.75], block, meta, 0);
              var hd = B.hopperDir(meta);
              if (hd[1] < 0) {
                emitBoxCulled(buf, x, y, z, [0.375, 0, 0.375, 0.625, 0.25, 0.625], block, meta, 0);
              } else {
                var a0 = 0.375 + hd[0] * 0.3125, b0 = 0.375 + hd[2] * 0.3125;
                emitBoxCulled(buf, x, y, z,
                  [Math.min(0.375, a0), 0.25, Math.min(0.375, b0),
                   Math.max(0.625, a0 + 0.25), 0.5, Math.max(0.625, b0 + 0.25)],
                  block, meta, 0);
              }
              break;
            }

            case B.SHAPE_CAULDRON: {
              // Boden, vier Wände und, wenn Wasser drin steht, dessen Fläche
              emitBoxCulled(buf, x, y, z, [0, 0, 0, 1, 0.25, 1], block, meta, 0);
              emitBoxCulled(buf, x, y, z, [0, 0.25, 0, 0.125, 1, 1], block, meta, 0);
              emitBoxCulled(buf, x, y, z, [0.875, 0.25, 0, 1, 1, 1], block, meta, 0);
              emitBoxCulled(buf, x, y, z, [0.125, 0.25, 0, 0.875, 1, 0.125], block, meta, 0);
              emitBoxCulled(buf, x, y, z, [0.125, 0.25, 0.875, 0.875, 1, 1], block, meta, 0);
              if ((meta & 3) > 0) {
                var wh = 0.25 + (meta & 3) * 0.23;
                emitBox(buf, x, y, z, [0.125, wh - 0.02, 0.125], [0.875, wh, 0.875],
                        T.layer('cauldron_wasser'), gl(x, y, z), false);
              }
              break;
            }

            case B.SHAPE_TORCH: {
              emitTorch(buf, x, y, z, meta, gl(x, y, z), block);
              break;
            }

            case B.SHAPE_STAIRS: {
              var sb = B.stairBoxes(meta);
              emitBoxCulled(buf, x, y, z, sb[0], block, meta, 0);
              // Unterseite der Stufe liegt auf der Grundplatte -> weglassen
              emitBoxCulled(buf, x, y, z, sb[1], block, meta, (meta & 4) ? (1 << 2) : (1 << 3));
              break;
            }

            case B.SHAPE_FENCE: {
              emitBoxCulled(buf, x, y, z, [0.375, 0, 0.375, 0.625, 1, 0.625], block, meta, 0);
              var HD = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]];
              for (var fd = 0; fd < 4; fd++) {
                var hn = HD[fd];
                if (!fenceConnects(gb(x + hn[0], y, z + hn[2]))) continue;
                var bars = [[0.375, 0.5625], [0.75, 0.9375]];
                for (var bi = 0; bi < 2; bi++) {
                  var y0 = bars[bi][0], y1 = bars[bi][1];
                  var bx;
                  if (fd === 0) bx = [0.4375, y0, 0, 0.5625, y1, 0.375];
                  else if (fd === 1) bx = [0.625, y0, 0.4375, 1, y1, 0.5625];
                  else if (fd === 2) bx = [0.4375, y0, 0.625, 0.5625, y1, 1];
                  else bx = [0, y0, 0.4375, 0.375, y1, 0.5625];
                  emitBoxCulled(buf, x, y, z, bx, block, meta, 0);
                }
              }
              break;
            }

            case B.SHAPE_GATE: {
              emitGate(buf, x, y, z, block, meta);
              break;
            }

            case B.SHAPE_PORTAL: {
              emitPortal(buf, x, y, z, block, meta);
              break;
            }

            case B.SHAPE_PORTAL_FLAT: {
              emitFlatPortal(buf, x, y, z, block);
              break;
            }

            case B.SHAPE_EGG: {
              for (var eg = 0; eg < B.EGG_LAYERS.length; eg++) {
                var L = B.EGG_LAYERS[eg];
                emitShapedBox(buf, x, y, z, [L[0], L[1], L[2]], [L[3], L[4], L[5]], block, meta);
              }
              break;
            }

            case B.SHAPE_ANVIL: {
              for (var av = 0; av < B.ANVIL_LAYERS.length; av++) {
                var A = B.ANVIL_LAYERS[av];
                emitShapedBox(buf, x, y, z, [A[0], A[1], A[2]], [A[3], A[4], A[5]], block, meta);
              }
              break;
            }

            case B.SHAPE_PISTON_HEAD: {
              var ph = B.PISTON_HEAD_BOXES[meta & 7] || B.PISTON_HEAD_BOXES[0];
              for (var hi = 0; hi < ph.length; hi++) {
                var H = ph[hi];
                emitShapedBox(buf, x, y, z, [H[0], H[1], H[2]], [H[3], H[4], H[5]], block, meta);
              }
              break;
            }

            case B.SHAPE_STAND: {
              for (var sv = 0; sv < B.STAND_LAYERS.length; sv++) {
                var SL = B.STAND_LAYERS[sv];
                emitShapedBox(buf, x, y, z, [SL[0], SL[1], SL[2]], [SL[3], SL[4], SL[5]], block, meta);
              }
              break;
            }

            // Redstoneleitung: flach auf dem Boden. Die Signalstärke steuert
            // die Helligkeit über den Shadewert, darum nur eine Textur.
            case B.SHAPE_WIRE: {
              var wlay = T.layer('redstone_dust');
              var kraft = 0.32 + (meta / 15) * 0.68;
              buf.need(4 * 9);
              var wa = buf.a, wn = buf.n;
              var wq = [[0, 0.0625, 1], [1, 0.0625, 1], [1, 0.0625, 0], [0, 0.0625, 0]];
              for (var wi = 0; wi < 4; wi++) {
                wa[wn++] = bx0 + x + wq[wi][0]; wa[wn++] = y + wq[wi][1]; wa[wn++] = bz0 + z + wq[wi][2];
                wa[wn++] = UVS[wi][0]; wa[wn++] = UVS[wi][1]; wa[wn++] = wlay;
                var wl = gl(x, y, z);
                wa[wn++] = (wl & 15) / 15; wa[wn++] = ((wl >> 4) & 15) / 15; wa[wn++] = kraft;
              }
              buf.n = wn;
              break;
            }

            case B.SHAPE_PLATE: {
              var pm = (meta & 1) ? 0.03125 : 0.0625;
              emitShapedBox(buf, x, y, z, [0.0625, 0, 0.0625], [0.9375, pm, 0.9375], block, meta);
              break;
            }

            case B.SHAPE_REPEATER: {
              emitShapedBox(buf, x, y, z, [0, 0, 0], [1, 0.125, 1], block, meta);
              // zwei Fackelstummel: einer fest, einer je nach Verzögerung versetzt
              // rd zeigt zum Ausgang. Der feste Stummel sitzt vorne am Ausgang,
              // der bewegliche wandert je Verzögerungsstufe nach hinten – so
              // sieht man Richtung und Einstellung auf einen Blick.
              var rd = B.SIDE_DIRS[meta & 3];
              var stufe = ((meta >> 2) & 3);
              var tl = T.layer((meta & 16) ? 'redstone_torch' : 'redstone_torch_off');
              var vorn = [0.5 + rd[0] * 0.3125, 0.5 + rd[1] * 0.3125];
              var hinten = [0.5 - rd[0] * (0.0625 + stufe * 0.0833),
                            0.5 - rd[1] * (0.0625 + stufe * 0.0833)];
              emitRepeaterPin(buf, x, y, z, vorn, tl);
              emitRepeaterPin(buf, x, y, z, hinten, tl);
              break;
            }

            case B.SHAPE_BUTTON: {
              var bb = B.buttonBox(meta);
              emitShapedBox(buf, x, y, z, [bb[0], bb[1], bb[2]], [bb[3], bb[4], bb[5]], block, meta);
              break;
            }

            case B.SHAPE_LEVER: {
              var lb = B.leverBox(meta);
              // Sockel aus Stein
              emitShapedBox(buf, x, y, z, [lb[0], lb[1], lb[2]], [lb[3], lb[4], lb[5]],
                            B.byName['cobblestone'], 0);
              // Griff, je nach Stellung nach vorn oder hinten geneigt
              var an = (meta & 8) !== 0;
              var gx = (lb[0] + lb[3]) / 2, gz = (lb[2] + lb[5]) / 2;
              var neig = an ? 0.18 : -0.18;
              emitShapedBox(buf, x, y, z,
                [gx - 0.06 + neig, lb[4], gz - 0.06],
                [gx + 0.06 + neig, lb[4] + 0.36, gz + 0.06],
                { name: 'lever_handle', tex: 'lever_handle', shape: B.SHAPE_CUBE }, 0);
              break;
            }

            case B.SHAPE_LADDER: {
              emitLadder(buf, x, y, z, meta, gl(x, y, z));
              break;
            }

            case B.SHAPE_DOOR: {
              emitBoxCulled(buf, x, y, z, B.doorBox(meta), block, meta, 0);
              break;
            }

            case B.SHAPE_FIRE: {
              emitCross(buf, x, y, z, T.layer('fire_' + (meta & 1)), 0xF0 | 15, 1.0);
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

    // Quader mit eigenen UV-Bereichen für Seiten / oben / unten
    function emitBoxUV(buf, x, y, z, mn, mx, layer, lightRaw, uvSide, uvTop, uvBottom) {
      var bl = (lightRaw & 15) / 15, sl = ((lightRaw >> 4) & 15) / 15;
      for (var f = 0; f < 6; f++) {
        var F = FACES[f];
        var uv = f === 2 ? uvTop : (f === 3 ? uvBottom : uvSide);
        buf.need(4 * 9);
        var a = buf.a, n = buf.n;
        for (var i = 0; i < 4; i++) {
          var v = F.v[i];
          a[n++] = bx0 + x + mn[0] + v[0] * (mx[0] - mn[0]);
          a[n++] = y + mn[1] + v[1] * (mx[1] - mn[1]);
          a[n++] = bz0 + z + mn[2] + v[2] * (mx[2] - mn[2]);
          a[n++] = uv[0] + UVS[i][0] * (uv[2] - uv[0]);
          a[n++] = uv[1] + UVS[i][1] * (uv[3] - uv[1]);
          a[n++] = layer;
          a[n++] = bl; a[n++] = sl; a[n++] = F.shade;
        }
        buf.n = n;
      }
    }

    // Fackel: 2x10x2-Pixel-Stiel. Die UVs greifen genau den Ausschnitt der Textur ab,
    // damit nicht das Item-Bild auf alle Seiten geklebt wird. Wandfackeln (meta 1..4)
    // sitzen am Wandrand und lehnen sich um ~25° zur Blockmitte.
    function emitTorch(buf, x, y, z, meta, lightRaw, block) {
      // Die Textur kommt vom Block – sonst sähe die Redstonefackel aus wie eine
      // gewöhnliche Fackel.
      var layer = T.layer(block && typeof block.tex === 'string' ? block.tex : 'torch');
      var bl = (lightRaw & 15) / 15, sl = ((lightRaw >> 4) & 15) / 15;
      var U16 = 1 / 16;
      var uvSide = [7 * U16, 6 * U16, 9 * U16, 1];
      var uvTop = [7 * U16, 6 * U16, 9 * U16, 8 * U16];
      var uvBottom = [7 * U16, 14 * U16, 9 * U16, 1];

      var att = B.torchAttach(meta);
      var hw = 0.0625, ht = 0.625;                 // halbe Breite, Höhe
      var ox = 0.5, oy = 0, oz = 0.5;              // Fußmitte im Block
      var lx = 1, lz = 0, ct = 1, st = 0;          // Neigerichtung + Winkel (st=0 -> Identität)
      if (att) {
        ox = 0.5 + att[0] * 0.44; oz = 0.5 + att[1] * 0.44; oy = 0.22;
        lx = -att[0]; lz = -att[1];                // weg von der Wand
        ct = Math.cos(0.44); st = Math.sin(0.44);
      }
      // Lokalen Punkt kippen: Drehung um die Achse quer zur Neigerichtung
      function px(a, b, c) { var u = a * lx + c * lz, w = -a * lz + c * lx; return ox + lx * (u * ct + b * st) - lz * w; }
      function py(a, b, c) { var u = a * lx + c * lz; return oy + (-u * st + b * ct); }
      function pz(a, b, c) { var u = a * lx + c * lz, w = -a * lz + c * lx; return oz + lz * (u * ct + b * st) + lx * w; }

      for (var f = 0; f < 6; f++) {
        var F = FACES[f];
        var uv = f === 2 ? uvTop : (f === 3 ? uvBottom : uvSide);
        buf.need(4 * 9);
        var a = buf.a, n = buf.n;
        for (var i = 0; i < 4; i++) {
          var v = F.v[i];
          var vx0 = -hw + v[0] * hw * 2, vy0 = v[1] * ht, vz0 = -hw + v[2] * hw * 2;
          a[n++] = bx0 + x + px(vx0, vy0, vz0);
          a[n++] = y + py(vx0, vy0, vz0);
          a[n++] = bz0 + z + pz(vx0, vy0, vz0);
          a[n++] = uv[0] + UVS[i][0] * (uv[2] - uv[0]);
          a[n++] = uv[1] + UVS[i][1] * (uv[3] - uv[1]);
          a[n++] = layer;
          a[n++] = bl; a[n++] = sl; a[n++] = F.shade;
        }
        buf.n = n;
      }
    }

    // Quader mit AO/Licht; Flächen an undurchsichtigen Nachbarn werden weggelassen,
    // sofern der Quader diese Blockseite überhaupt berührt. skipMask blendet Flächen fest aus.
    // Schienenfläche: ein Viereck bei y = 1/16, dessen UV je nach Verlauf
    // gedreht wird. Gerade in X ist die Textur um 90 Grad gedreht, jede Kurve
    // um ein Vielfaches davon.
    //
    // Die Drehtabelle steht IN der Funktion, nicht daneben: die Meshschleife
    // steht weiter oben im selben Rumpf, und eine Funktionsdeklaration wird
    // gehoben, die Zuweisung an ein `var` daneben aber nicht. Die Tabelle war
    // beim ersten Aufruf darum undefiniert — und weil das Meshen dann wirft,
    // wird der Chunk nie fertig und das Spiel steht.
    function emitRail(buf, x, y, z, layer, lightRaw, rm) {
      var RAIL_DREH = [0, 1, 0, 1, 2, 3];
      var bl = (lightRaw & 15) / 15, sl = ((lightRaw >> 4) & 15) / 15;
      var uv = [[0, 1], [1, 1], [1, 0], [0, 0]];
      var dreh = RAIL_DREH[rm] || 0;
      var eck = [[0, 0], [1, 0], [1, 1], [0, 1]];
      buf.need(4 * 9);
      var a = buf.a, n = buf.n;
      for (var i = 0; i < 4; i++) {
        var e = eck[i];
        a[n++] = x + e[0]; a[n++] = y + 0.0625; a[n++] = z + e[1];
        var u = uv[(i + dreh) & 3];
        a[n++] = u[0]; a[n++] = u[1]; a[n++] = layer;
        a[n++] = bl; a[n++] = sl; a[n++] = 1;
      }
      buf.n = n;
    }

    function emitBoxCulled(buf, x, y, z, box, block, meta, skipMask) {
      var mn = [box[0], box[1], box[2]], mx = [box[3], box[4], box[5]];
      for (var f = 0; f < 6; f++) {
        if (skipMask & (1 << f)) continue;
        var n = FACES[f].n;
        var touches = (n[0] === 1 && mx[0] >= 1) || (n[0] === -1 && mn[0] <= 0) ||
                      (n[1] === 1 && mx[1] >= 1) || (n[1] === -1 && mn[1] <= 0) ||
                      (n[2] === 1 && mx[2] >= 1) || (n[2] === -1 && mn[2] <= 0);
        if (touches) {
          var nb = B.byId[gb(x + n[0], y + n[1], z + n[2])];
          if (nb && nb.opaque) continue;
        }
        emitFace(buf, x, y, z, f, faceLayer(block, f, meta), block, meta, mn, mx, FULL_UV, false);
      }
    }

    function fenceConnects(id) {
      var b = B.byId[id];
      if (!b || b.id === 0) return false;
      return b.opaque || b.shape === B.SHAPE_FENCE || b.shape === B.SHAPE_GATE ||
             b.shape === B.SHAPE_STAIRS || b.shape === B.SHAPE_SLAB;
    }

    // Zauntor: zwei Pfosten mit zwei Riegeln dazwischen. Offen schwenken die
    // Flügel um 90° zur Seite, die Pfosten bleiben stehen.
    function emitGate(buf, x, y, z, block, meta) {
      var alongX = (meta & 1) === 0;
      var open = B.gateOpen(meta);
      var y0 = 0.3125;                                   // Pfostenunterkante
      var bars = [[0.375, 0.5625], [0.75, 0.9375]];      // Riegelhöhen
      var i, bi;
      // Pfosten an beiden Enden
      var posts = alongX
        ? [[0, y0, 0.4375, 0.125, 1, 0.5625], [0.875, y0, 0.4375, 1, 1, 0.5625]]
        : [[0.4375, y0, 0, 0.5625, 1, 0.125], [0.4375, y0, 0.875, 0.5625, 1, 1]];
      for (i = 0; i < 2; i++) emitBoxCulled(buf, x, y, z, posts[i], block, meta, 0);

      for (bi = 0; bi < 2; bi++) {
        var b0 = bars[bi][0], b1 = bars[bi][1];
        if (!open) {
          emitBoxCulled(buf, x, y, z,
            alongX ? [0.125, b0, 0.4375, 0.875, b1, 0.5625] : [0.4375, b0, 0.125, 0.5625, b1, 0.875],
            block, meta, 0);
          continue;
        }
        // geöffnet: je Pfosten ein Flügel quer zur Schranke
        var side = (meta & 2) ? 1 : -1;   // Richtung 2/3 schwenkt zur anderen Seite
        for (i = 0; i < 2; i++) {
          var near = i === 0 ? 0.0625 : 0.875;
          var far = i === 0 ? 0.125 : 0.9375;
          if (alongX) {
            var z0 = side < 0 ? 0.0625 : 0.5625, z1 = side < 0 ? 0.4375 : 0.9375;
            emitBoxCulled(buf, x, y, z, [near, b0, z0, far, b1, z1], block, meta, 0);
          } else {
            var xx0 = side < 0 ? 0.0625 : 0.5625, xx1 = side < 0 ? 0.4375 : 0.9375;
            emitBoxCulled(buf, x, y, z, [xx0, b0, near, xx1, b1, far], block, meta, 0);
          }
        }
      }
    }

    // Portal: dünne, beidseitig sichtbare Scheibe in der Rahmenebene.
    // Meta-Bit 0 gibt die Achse an: 0 = Rahmen spannt über X, 1 = über Z.
    function emitPortal(buf, x, y, z, block, meta) {
      var layer = T.layer(typeof block.tex === 'string' ? block.tex : block.tex.side);
      var alongZ = (meta & 1) !== 0;
      var q = alongZ
        ? [[0.5, 0, 0], [0.5, 0, 1], [0.5, 1, 1], [0.5, 1, 0]]
        : [[0, 0, 0.5], [1, 0, 0.5], [1, 1, 0.5], [0, 1, 0.5]];
      for (var side = 0; side < 2; side++) {
        buf.need(4 * 9);
        var a = buf.a, n = buf.n;
        for (var i = 0; i < 4; i++) {
          var k = side === 0 ? i : (3 - i);
          var p = q[k];
          a[n++] = bx0 + x + p[0]; a[n++] = y + p[1]; a[n++] = bz0 + z + p[2];
          a[n++] = UVS[side === 0 ? i : (3 - i)][0];
          a[n++] = UVS[side === 0 ? i : (3 - i)][1];
          a[n++] = layer;
          a[n++] = 1; a[n++] = 0; a[n++] = 1;   // leuchtet selbst
        }
        buf.n = n;
      }
    }

    // Endportal: liegende, beidseitig sichtbare Fläche knapp unter der Oberkante
    // des Rahmens – man schaut von oben in die Sterne hinein.
    function emitFlatPortal(buf, x, y, z, block) {
      var layer = T.layer(typeof block.tex === 'string' ? block.tex : block.tex.top);
      var h = 0.75;
      var q = [[0, h, 1], [1, h, 1], [1, h, 0], [0, h, 0]];
      for (var side = 0; side < 2; side++) {
        buf.need(4 * 9);
        var a = buf.a, n = buf.n;
        for (var i = 0; i < 4; i++) {
          var k = side === 0 ? i : (3 - i);
          var p = q[k];
          a[n++] = bx0 + x + p[0]; a[n++] = y + p[1]; a[n++] = bz0 + z + p[2];
          a[n++] = UVS[k][0]; a[n++] = UVS[k][1]; a[n++] = layer;
          a[n++] = 1; a[n++] = 0; a[n++] = 1;   // leuchtet selbst
        }
        buf.n = n;
      }
    }

    // Leiter: flaches, beidseitig sichtbares Rechteck an der Wand
    function emitLadder(buf, x, y, z, meta, lightRaw) {
      var layer = T.layer('ladder');
      var bl = (lightRaw & 15) / 15, sl = ((lightRaw >> 4) & 15) / 15;
      var e = 0.0625;
      var q;
      switch (meta & 3) {
        case 0: q = [[0, 0, e], [1, 0, e], [1, 1, e], [0, 1, e]]; break;
        case 1: q = [[1 - e, 0, 1], [1 - e, 0, 0], [1 - e, 1, 0], [1 - e, 1, 1]]; break;
        case 2: q = [[1, 0, 1 - e], [0, 0, 1 - e], [0, 1, 1 - e], [1, 1, 1 - e]]; break;
        default: q = [[e, 0, 0], [e, 0, 1], [e, 1, 1], [e, 1, 0]]; break;
      }
      for (var side = 0; side < 2; side++) {
        buf.need(4 * 9);
        var a = buf.a, n = buf.n;
        for (var i = 0; i < 4; i++) {
          var k = side === 0 ? i : (3 - i);
          var p = q[k];
          a[n++] = bx0 + x + p[0]; a[n++] = y + p[1]; a[n++] = bz0 + z + p[2];
          a[n++] = UVS[side === 0 ? i : (3 - i)][0];
          a[n++] = UVS[side === 0 ? i : (3 - i)][1];
          a[n++] = layer;
          a[n++] = bl; a[n++] = sl; a[n++] = side === 0 ? 0.9 : 0.8;
        }
        buf.n = n;
      }
    }

    function emitShapedBox(buf, x, y, z, mn, mx, block, meta) {
      for (var f = 0; f < 6; f++) {
        emitFace(buf, x, y, z, f, faceLayer(block, f, meta), block, meta, mn, mx, FULL_UV, false);
      }
    }

    // Kleiner Fackelstummel auf einem Verstärker. Er nutzt denselben
    // UV-Ausschnitt wie eine echte Fackel – Spalten 7-8, Zeilen 6-15 –, sonst
    // klebt die ganze Textur auf jeder Seite.
    function emitRepeaterPin(buf, x, y, z, pos, layer) {
      var U16 = 1 / 16;
      var uvSide = [7 * U16, 6 * U16, 9 * U16, 1];
      var uvTop = [7 * U16, 6 * U16, 9 * U16, 8 * U16];
      var mn = [pos[0] - 0.0625, 0.125, pos[1] - 0.0625];
      var mx = [pos[0] + 0.0625, 0.4375, pos[1] + 0.0625];
      for (var f = 0; f < 6; f++) {
        if (f === 3) continue;                       // Unterseite steckt in der Platte
        emitFace(buf, x, y, z, f, layer, null, 0, mn, mx, f === 2 ? uvTop : uvSide, false);
      }
    }

    function liquidHeight(bx, by, bz, id) {
      if (gb(bx, by + 1, bz) === id) return 1.0;
      // Über einer wasserdurchlässigen Pflanze steht ebenfalls Wasser
      if (id === B.id('water') && B.istGeflutet(gb(bx, by + 1, bz), gm(bx, by + 1, bz))) return 1.0;
      // Unter einem undurchsichtigen Block steht die Flüssigkeit randvoll. Sonst
      // bliebe zwischen ihrer Oberfläche und der Blockdecke ein Spalt – und weil
      // die Oberseite dort weggelassen wird (der Block darüber verdeckt sie ja),
      // sähe man von der Seite durch die Flüssigkeit ins Leere.
      if (B.isOpaque(gb(bx, by + 1, bz))) return 1.0;
      // Die Pflanze selbst hat kein Flüssigkeits-Meta – sie zählt als Quelle
      if (id === B.id('water') && gb(bx, by, bz) !== id && B.istGeflutet(gb(bx, by, bz), gm(bx, by, bz))) return 0.875;
      var m = gm(bx, by, bz);
      if (m === 0 || m === 8) return 0.875;
      return 0.875 - (m / 8) * 0.75;
    }

    function emitLiquid(buf, x, y, z, block, meta) {
      var id = block.id;
      var lay = T.layer(typeof block.tex === 'string' ? block.tex : block.tex.side);
      var hC = liquidHeight(x, y, z, id);
      // Seegras und Tang stehen im Wasser: fürs Rendern zählen sie als Wasser,
      // sonst zieht das Wasser eine Wand gegen sie und man sieht Löcher.
      var wieWasser = (id === B.id('water'))
        ? function (nid, nmeta) { return nid === id || B.istGeflutet(nid, nmeta); }
        : function (nid) { return nid === id; };
      function wieWasserAt(bx, by, bz) { return wieWasser(gb(bx, by, bz), gm(bx, by, bz)); }
      var aboveSame = wieWasserAt(x, y + 1, z) || B.isOpaque(gb(x, y + 1, z));
      // Eckhöhen für ein "fließendes" Aussehen
      function cornerH(dx, dz) {
        if (aboveSame) return 1.0;
        var sum = 0, cnt = 0, maxH = 0;
        for (var ix = 0; ix <= 1; ix++) for (var iz = 0; iz <= 1; iz++) {
          var sx = x + dx * ix, sz = z + dz * iz;
          if (wieWasserAt(sx, y + 1, sz)) return 1.0;
          if (wieWasserAt(sx, y, sz)) { var hh = liquidHeight(sx, y, sz, id); sum += hh; cnt++; if (hh > maxH) maxH = hh; }
          else if (B.byId[gb(sx, y, sz)] && !B.byId[gb(sx, y, sz)].opaque) { cnt++; }
        }
        return cnt ? Math.max(sum / cnt, maxH * 0.85) : hC;
      }
      var h00 = cornerH(-1, -1), h10 = cornerH(1, -1), h01 = cornerH(-1, 1), h11 = cornerH(1, 1);

      for (var f = 0; f < 6; f++) {
        var nn = FACES[f].n;
        var nid = gb(x + nn[0], y + nn[1], z + nn[2]);
        if (wieWasser(nid, gm(x + nn[0], y + nn[1], z + nn[2]))) continue;
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
