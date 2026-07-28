/* ============================================================
   icons.js  -  Item-/Block-Symbole als Canvas/DataURL fürs UI
   ============================================================ */
(function () {
  'use strict';

  var T = MC.Textures, B = MC.Blocks, I = MC.Items;
  var Icons = {};
  MC.Icons = Icons;

  var cache = {};
  var SIZE = 64;

  function texFor(block, face, meta) {
    return T.names[MC.Mesher.faceLayer(block, face, meta)];
  }

  // Isometrischer Würfel in ein Canvas rendern
  function blockIcon(block, meta) {
    var c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var s = SIZE / 36;   // 32 breit + Rand
    var ox = (SIZE - 32 * s) / 2, oy = (SIZE - 32 * s) / 2;

    var shape = block.shape;
    var hTop = 0;          // Absenkung der Oberseite (für Stufen)
    if (shape === B.SHAPE_SLAB || shape === B.SHAPE_BED) hTop = 8;

    var topTile = T.tileCanvas(texFor(block, 2, meta), 1.0);
    var leftTile = T.tileCanvas(texFor(block, 1, meta), 0.70);
    var rightTile = T.tileCanvas(texFor(block, 4, meta), 0.85);

    function face(tile, o, a, b) {
      ctx.save();
      ctx.setTransform(a[0] / 16 * s, a[1] / 16 * s, b[0] / 16 * s, b[1] / 16 * s, ox + o[0] * s, oy + o[1] * s);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tile, 0, 0, 16, 16);
      ctx.restore();
    }

    if (shape === B.SHAPE_CROSS || shape === B.SHAPE_CROP || shape === B.SHAPE_TORCH) {
      var flat = T.tileCanvas(typeof block.tex === 'string' ? block.tex : (block.tex.side || block.tex.top), 1.0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(flat, 2, 2, SIZE - 4, SIZE - 4);
      return c;
    }

    // Oberseite (Raute)
    face(topTile, [0, 8 + hTop], [16, -8], [16, 8]);
    // Linke Fläche
    face(leftTile, [0, 8 + hTop], [16, 8], [0, 16 - hTop]);
    // Rechte Fläche
    face(rightTile, [16, 16 + hTop], [16, -8], [0, 16 - hTop]);
    return c;
  }

  function itemIcon(name) {
    var c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var tile = T.tileCanvas(name, 1.0);
    ctx.drawImage(tile, 0, 0, 16, 16, 2, 2, SIZE - 4, SIZE - 4);
    return c;
  }

  Icons.canvas = function (itemId) {
    if (cache[itemId]) return cache[itemId];
    var it = I.get(itemId);
    var c;
    if (it && it.block && B.byName[it.block]) c = blockIcon(B.byName[it.block], 0);
    else if (it) c = itemIcon(T.has(it.tex) ? it.tex : 'white');
    else c = itemIcon('white');
    cache[itemId] = c;
    return c;
  };

  Icons.url = function (itemId) {
    var key = 'url:' + itemId;
    if (cache[key]) return cache[key];
    var u = Icons.canvas(itemId).toDataURL();
    cache[key] = u;
    return u;
  };

})();
