/* ============================================================
   icons.js  -  Item-/Block-Symbole als Canvas/DataURL fürs UI
   ============================================================ */
(function () {
  'use strict';

  var T = MC.Textures, B = MC.Blocks, I = MC.Items;
  var Icons = {};
  MC.Icons = Icons;

  var cache = {};
  // Maßstab GANZZAHLIG. Vorher: 64/36 = 1,777 - dabei wird ein Texel mal
  // 2 px breit und mal 1 px, die Kanten fransen aus. Mit S = 2 ist ein
  // Texel auf der Deckfläche exakt 2 px waagerecht und 1 px senkrecht,
  // also das klassische 2:1-Raster der Pixel-Isometrie.
  var S = 2;
  var SIZE = 72;              // 36 Einheiten * 2
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
    // Ganzzahlig vergrößern: 16 -> 64 ist genau Faktor 4, Rand 4 px.
    ctx.drawImage(tile, 0, 0, 16, 16, 4, 4, 64, 64);
  }

  // Das Symbol entsteht aus derselben Quaderliste, aus der auch das Item in
  // der Hand und am Boden gebaut wird - siehe B.itemBoxen(). Solange hier
  // nichts eigenes mehr steht, koennen die drei Ansichten nicht auseinander
  // laufen.
  function blockIcon(block, meta) {
    var c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    var teile = B.itemBoxen(block);
    if (!teile) { flatIcon(ctx, B.itemFlachTex(block)); return c; }
    for (var i = 0; i < teile.length; i++) isoBox(ctx, teile[i].box, teile[i].b, teile[i].meta);
    return c;
  }

  // ============================================================
  //  Spielerfigur fuers Inventar
  // ============================================================
  // Dieselbe Isometrie wie bei den Bloecken, nur auf die Teile des
  // Spielermodells angewandt. Vorher stand im Inventar ein dreifarbiger
  // Farbverlauf als Platzhalter — und das neben Feldern, die den Kopf des
  // Spielers texturiert zeigen, sobald er einen Helm traegt.
  //
  // Die z-Achse wird gespiegelt: icons.js zeichnet Deckflaeche, +X und +Z, das
  // Modell blickt aber nach -Z. Ohne die Spiegelung saehe man dem Spieler
  // immer auf den Hinterkopf.
  Icons.spielerCanvas = function () {
    if (cache['__spieler']) return cache['__spieler'];
    var modell = MC.MODELS && MC.MODELS.player;
    if (!modell) { var leer = document.createElement('canvas'); leer.width = leer.height = 1; return (cache['__spieler'] = leer); }

    var k = 5;                    // Bildpunkte je Modelleinheit

    // Groesste z-Koordinate im Modell: um sie wird gespiegelt
    var zmax = 0;
    modell.parts.forEach(function (t) { zmax = Math.max(zmax, t.z + t.d); });

    var teile = modell.parts.map(function (t) {
      return { t: t, box: [t.x, t.y, zmax - (t.z + t.d), t.x + t.w, t.y + t.h, zmax - t.z] };
    });
    // Malreihenfolge: erst nach Tiefe (naeher am Betrachter heisst groesseres
    // x+z), bei gleicher Tiefe von unten nach oben. Ohne den zweiten Schluessel
    // legt die Deckflaeche des Rumpfes den Kopf zur Haelfte zu — beide liegen
    // auf der Achse und damit auf derselben Tiefe.
    teile.sort(function (a, b) {
      var ta = a.box[0] + a.box[3] + a.box[2] + a.box[5];
      var tb = b.box[0] + b.box[3] + b.box[2] + b.box[5];
      return (ta - tb) || (a.box[1] - b.box[1]);
    });

    // Erst messen, dann zeichnen: so sitzt die Figur ohne Rand im Kasten und
    // 'background-size: contain' zeigt sie so gross wie moeglich.
    function roh(x, y, z) { return [(x - z) * k, ((x + z) * k / 2 - y * k)]; }
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    teile.forEach(function (e) {
      var b = e.box;
      for (var i = 0; i < 8; i++) {
        var q = roh(b[(i & 1) ? 3 : 0], b[(i & 2) ? 4 : 1], b[(i & 4) ? 5 : 2]);
        if (q[0] < minX) minX = q[0]; if (q[0] > maxX) maxX = q[0];
        if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1];
      }
    });
    var c = document.createElement('canvas');
    c.width = Math.ceil(maxX - minX); c.height = Math.ceil(maxY - minY);
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    function pr(x, y, z) { var q = roh(x, y, z); return [q[0] - minX, q[1] - minY]; }

    teile.forEach(function (e) {
      var tex = e.t.tex;
      var alle = typeof tex === 'string' ? tex : (tex.all || 'player_skin');
      var vorn = typeof tex === 'string' ? tex : (tex.front || alle);
      var b = e.box;
      var top = T.tileCanvas(T.has(alle) ? alle : 'white', 1.0);
      var rechts = T.tileCanvas(T.has(alle) ? alle : 'white', 0.68);
      var links = T.tileCanvas(T.has(vorn) ? vorn : 'white', 0.86);
      face(ctx, top, pr(b[0], b[4], b[2]), pr(b[3], b[4], b[2]), pr(b[0], b[4], b[5]));
      face(ctx, rechts, pr(b[3], b[4], b[5]), pr(b[3], b[4], b[2]), pr(b[3], b[1], b[5]));
      face(ctx, links, pr(b[0], b[4], b[5]), pr(b[3], b[4], b[5]), pr(b[0], b[1], b[5]));
    });
    cache['__spieler'] = c;
    return c;
  };

  Icons.spielerUrl = function () {
    if (cache['__spielerurl']) return cache['__spielerurl'];
    var u = Icons.spielerCanvas().toDataURL();
    cache['__spielerurl'] = u;
    return u;
  };

  function itemIcon(name) {
    var c = document.createElement('canvas');
    c.width = SIZE; c.height = SIZE;
    flatIcon(c.getContext('2d'), name);
    return c;
  }

  // Eine einzelne Kachel als DataURL, fuers Blatt. Damit koennen Feuer und
  // Fortschritt im Ofen dieselbe Grafik tragen wie der Block in der Welt,
  // statt grauer Kaesten mit Farbverlauf.
  Icons.texUrl = function (name, bright) {
    var key = 'tex:' + name + '|' + bright;
    if (cache[key]) return cache[key];
    var u = T.tileCanvas(T.has(name) ? name : 'white', bright === undefined ? 1 : bright).toDataURL();
    cache[key] = u;
    return u;
  };

  Icons.canvas = function (itemId) {
    if (cache[itemId]) return cache[itemId];
    var it = I.get(itemId);
    var c;
    if (it && it.iconTex) c = itemIcon(it.iconTex);
    else if (it && it.block && B.byName[it.block]) c = blockIcon(B.byName[it.block], 0);
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
