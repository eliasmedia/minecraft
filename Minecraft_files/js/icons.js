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
  var S = SIZE / 36;          // Maßstab: Würfel belegt 32 Einheiten
  var OX = SIZE / 2, OY = SIZE / 2;

  // Isometrische Projektion eines Punktes im Einheitswürfel (y = oben)
  function proj(x, y, z) {
    return [OX + (x - z) * 16 * S, OY + ((x + z) * 8 - y * 16) * S];
  }

  function texFor(block, face, meta) {
    return T.names[MC.Mesher.faceLayer(block, face, meta)];
  }

  // Eine Fläche als Parallelogramm zeichnen: p0 = Ursprung, pu/pv = Endpunkte der Achsen
  function face(ctx, tile, p0, pu, pv) {
    ctx.save();
    ctx.setTransform((pu[0] - p0[0]) / 16, (pu[1] - p0[1]) / 16,
                     (pv[0] - p0[0]) / 16, (pv[1] - p0[1]) / 16,
                     p0[0], p0[1]);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile, 0, 0, 16, 16, 0, 0, 16, 16);
    ctx.restore();
  }

  // Quader [x0,y0,z0,x1,y1,z1] isometrisch zeichnen
  function isoBox(ctx, bx, block, meta) {
    var x0 = bx[0], y0 = bx[1], z0 = bx[2], x1 = bx[3], y1 = bx[4], z1 = bx[5];
    var top = T.tileCanvas(texFor(block, 2, meta), 1.0);
    var right = T.tileCanvas(texFor(block, 0, meta), 0.68);
    var left = T.tileCanvas(texFor(block, 4, meta), 0.86);
    // Oberseite
    face(ctx, top, proj(x0, y1, z0), proj(x1, y1, z0), proj(x0, y1, z1));
    // rechte Seite (+X)
    face(ctx, right, proj(x1, y1, z1), proj(x1, y1, z0), proj(x1, y0, z1));
    // linke Seite (+Z)
    face(ctx, left, proj(x0, y1, z1), proj(x1, y1, z1), proj(x0, y0, z1));
  }

  function flatIcon(ctx, texName) {
    var tile = T.tileCanvas(texName, 1.0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tile, 0, 0, 16, 16, 2, 2, SIZE - 4, SIZE - 4);
  }

  function blockIcon(block, meta) {
    var c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    switch (block.shape) {
      case B.SHAPE_CROSS:
      case B.SHAPE_CROP:
      case B.SHAPE_TORCH:
      case B.SHAPE_LADDER:
      case B.SHAPE_FIRE:
        flatIcon(ctx, typeof block.tex === 'string' ? block.tex : (block.tex.side || block.tex.top));
        return c;

      case B.SHAPE_SLAB:
        isoBox(ctx, [0, 0, 0, 1, 0.5, 1], block, 0);
        return c;

      case B.SHAPE_BED:
        isoBox(ctx, [0, 0, 0, 1, 0.5625, 1], block, 0);
        return c;

      case B.SHAPE_STAIRS:
        // Grundplatte, dann die Stufe hinten drauf
        isoBox(ctx, [0, 0, 0, 1, 0.5, 1], block, 0);
        isoBox(ctx, [0, 0.5, 0, 1, 1, 0.5], block, 0);
        return c;

      case B.SHAPE_FENCE:
        isoBox(ctx, [0.34, 0, 0.34, 0.66, 1, 0.66], block, 0);
        isoBox(ctx, [0.42, 0.34, 0, 0.58, 0.5, 1], block, 0);
        isoBox(ctx, [0.42, 0.72, 0, 0.58, 0.88, 1], block, 0);
        return c;

      case B.SHAPE_GATE:
        // zwei Pfosten mit zwei Riegeln dazwischen
        isoBox(ctx, [0.42, 0.16, 0, 0.58, 1, 0.16], block, 0);
        isoBox(ctx, [0.42, 0.16, 0.84, 0.58, 1, 1], block, 0);
        isoBox(ctx, [0.44, 0.3, 0.16, 0.56, 0.46, 0.84], block, 0);
        isoBox(ctx, [0.44, 0.66, 0.16, 0.56, 0.82, 0.84], block, 0);
        return c;

      case B.SHAPE_DOOR: {
        // untere und obere Hälfte übereinander, damit man die Tür erkennt
        var lower = { tex: block.tex, shape: B.SHAPE_CUBE, name: block.name };
        var upper = { tex: { top: block.tex.top, bottom: block.tex.top, side: block.tex.top }, shape: B.SHAPE_CUBE, name: block.name };
        isoBox(ctx, [0, 0, 0.36, 1, 0.5, 0.64], lower, 0);
        isoBox(ctx, [0, 0.5, 0.36, 1, 1, 0.64], upper, 0);
        return c;
      }

      default:
        isoBox(ctx, [0, 0, 0, 1, 1, 1], block, meta);
        return c;
    }
  }

  function itemIcon(name) {
    var c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    flatIcon(c.getContext('2d'), name);
    return c;
  }

  Icons.canvas = function (itemId) {
    if (cache[itemId]) return cache[itemId];
    var it = I.get(itemId);
    var c;
    if (it && it.block && B.byName[it.block]) c = blockIcon(B.byName[it.block], 0);
    else if (it && it.place && B.byName[it.place]) c = blockIcon(B.byName[it.place], 0);
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
