/* ============================================================
   board.js  -  Aufbau des Stilblatts
   ------------------------------------------------------------
   Zeichnet die Musterkarten. Der isometrische Würfel benutzt
   bewusst den korrigierten Maßstab S = 2 (ein Texel = exakt 2 px
   waagerecht, 1 px senkrecht auf der Deckfläche). Das ist das
   klassische 2:1-Verhältnis der Pixel-Isometrie und ersetzt den
   derzeitigen krummen Maßstab 64/36 = 1,777, der die Pixel der
   Inventarsymbole ungleich breit werden lässt.
   ============================================================ */
(function (root) {
  'use strict';

  var Board = {};
  root.Board = Board;

  var TILE = 16;
  var S = 2;                       // ganzzahlig! -> saubere Pixel
  var ICON = 16 * S * 2 + 8;       // 72 px Kantenlänge

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt !== undefined) e.textContent = txt;
    return e;
  }
  Board.el = el;

  function tileCanvas(atlas, name, bright) {
    var c = document.createElement('canvas');
    c.width = TILE; c.height = TILE;
    var ctx = c.getContext('2d');
    var img = ctx.createImageData(TILE, TILE);
    var src = atlas.data(name);
    if (!src) return c;
    for (var i = 0; i < src.length; i += 4) {
      img.data[i] = src[i] * bright;
      img.data[i + 1] = src[i + 1] * bright;
      img.data[i + 2] = src[i + 2] * bright;
      img.data[i + 3] = src[i + 3];
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // Flach vergrößert, immer ganzzahlig
  Board.flat = function (atlas, name, scale) {
    var c = document.createElement('canvas');
    c.width = TILE * scale; c.height = TILE * scale;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var t = tileCanvas(atlas, name, 1);
    ctx.drawImage(t, 0, 0, TILE, TILE, 0, 0, c.width, c.height);
    c.className = 'px';
    return c;
  };

  // Isometrischer Würfel, ganzzahliger Maßstab
  Board.isoCube = function (atlas, top, side, front) {
    var c = document.createElement('canvas');
    c.width = ICON; c.height = ICON;
    var ctx = c.getContext('2d');
    var OX = ICON / 2, OY = ICON / 2;
    function proj(x, y, z) { return [OX + (x - z) * 16 * S, OY + ((x + z) * 8 - y * 16) * S]; }
    function face(tile, p0, pu, pv) {
      ctx.save();
      ctx.setTransform((pu[0] - p0[0]) / 16, (pu[1] - p0[1]) / 16,
                       (pv[0] - p0[0]) / 16, (pv[1] - p0[1]) / 16, p0[0], p0[1]);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tile, 0, 0, 16, 16, 0, 0, 16, 16);
      ctx.restore();
    }
    // Helligkeit wie die Flächenschattierung im Mesher-Vorschlag
    face(tileCanvas(atlas, top, 1.0), proj(0, 1, 0), proj(1, 1, 0), proj(0, 1, 1));
    face(tileCanvas(atlas, side, 0.66), proj(1, 1, 1), proj(1, 1, 0), proj(1, 0, 1));
    face(tileCanvas(atlas, front || side, 0.84), proj(0, 1, 1), proj(1, 1, 1), proj(0, 0, 1));
    c.className = 'px';
    return c;
  };

  // Farbreihe einer Textur
  Board.paletteStrip = function (atlas, name, maxN) {
    var wrap = el('div', 'strip');
    var cols = (atlas.paletteOf ? atlas.paletteOf(name) : countColors(atlas, name)).slice(0, maxN || 7);
    cols.forEach(function (c) {
      var s = el('i');
      s.style.background = 'rgb(' + c.rgb.join(',') + ')';
      s.title = 'rgb(' + c.rgb.join(', ') + ') – ' + c.n + ' px';
      wrap.appendChild(s);
    });
    var n = el('span', 'stripn', cols.length + (cols.length >= (maxN || 7) ? '+' : '') + ' Töne');
    wrap.appendChild(n);
    return wrap;
  };

  function countColors(atlas, name) {
    var src = atlas.data(name); if (!src) return [];
    var m = {};
    for (var i = 0; i < src.length; i += 4) {
      if (src[i + 3] < 128) continue;
      var k = src[i] + ',' + src[i + 1] + ',' + src[i + 2];
      m[k] = (m[k] || 0) + 1;
    }
    return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })
      .map(function (k) { return { rgb: k.split(',').map(Number), n: m[k] }; });
  }
  Board.countColors = countColors;

  // ---- Karte für einen Block ----
  Board.blockCard = function (atlas, opt) {
    var card = el('div', 'card');
    var art = el('div', 'cardart');
    art.appendChild(Board.isoCube(atlas, opt.top, opt.side, opt.front));
    var faces = el('div', 'faces');
    var fTop = el('div', 'facebox');
    fTop.appendChild(Board.flat(atlas, opt.top, 4));
    fTop.appendChild(el('label', null, 'oben'));
    var fSide = el('div', 'facebox');
    fSide.appendChild(Board.flat(atlas, opt.side, 4));
    fSide.appendChild(el('label', null, 'Seite'));
    faces.appendChild(fTop); faces.appendChild(fSide);
    art.appendChild(faces);
    card.appendChild(art);

    var body = el('div', 'cardbody');
    body.appendChild(el('h4', null, opt.name));
    var m = atlas.meta ? atlas.meta(opt.top) : {};
    body.appendChild(el('p', 'motif', m.motif || opt.motif || '—'));
    body.appendChild(Board.paletteStrip(atlas, opt.top));
    var tags = el('div', 'tags');
    tags.appendChild(el('span', 'tag', '16×16'));
    if (m.family) tags.appendChild(el('span', 'tag fam-' + m.family, m.family));
    if (opt.tag) tags.appendChild(el('span', 'tag', opt.tag));
    body.appendChild(tags);
    card.appendChild(body);
    return card;
  };

  // ---- Karte für eine Kachel (Gegenstand, Pflanze, Effekt) ----
  Board.tileCard = function (atlas, name, label, note, scale) {
    var card = el('div', 'card small');
    var art = el('div', 'cardart');
    art.appendChild(Board.flat(atlas, name, scale || 5));
    card.appendChild(art);
    var body = el('div', 'cardbody');
    body.appendChild(el('h4', null, label));
    if (note) body.appendChild(el('p', 'motif', note));
    body.appendChild(Board.paletteStrip(atlas, name, 6));
    card.appendChild(body);
    return card;
  };

  // ---- Kachelprobe 4x4: prüft, ob eine Textur wirklich kachelt ----
  Board.tiled = function (atlas, name, reps, scale) {
    reps = reps || 4; scale = scale || 3;
    var c = document.createElement('canvas');
    c.width = TILE * reps * scale; c.height = TILE * reps * scale;
    var ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    var t = tileCanvas(atlas, name, 1);
    for (var y = 0; y < reps; y++) for (var x = 0; x < reps; x++) {
      ctx.drawImage(t, 0, 0, TILE, TILE, x * TILE * scale, y * TILE * scale, TILE * scale, TILE * scale);
    }
    c.className = 'px';
    return c;
  };

  // ---- Gegenüberstellung alt / neu ----
  Board.versus = function (altAtlas, neuAtlas, altName, neuName, label, kritik) {
    var row = el('div', 'vs');
    var a = el('div', 'vscol');
    a.appendChild(el('span', 'vslabel bad', 'jetzt'));
    a.appendChild(altAtlas && altAtlas.data(altName) ? Board.flat(altAtlas, altName, 5) : el('div', 'missing', '–'));
    if (altAtlas && altAtlas.data(altName)) a.appendChild(Board.paletteStrip(altAtlas, altName, 6));
    var b = el('div', 'vscol');
    b.appendChild(el('span', 'vslabel good', 'Vorschlag'));
    b.appendChild(Board.flat(neuAtlas, neuName, 5));
    b.appendChild(Board.paletteStrip(neuAtlas, neuName, 6));
    var t = el('div', 'vstext');
    t.appendChild(el('h4', null, label));
    t.appendChild(el('p', null, kritik));
    row.appendChild(a); row.appendChild(b); row.appendChild(t);
    return row;
  };

  // ---- Schärfeprobe: dieselbe Kachel in mehreren Mipmap-Stufen ----
  Board.mipStrip = function (atlas, name) {
    var wrap = el('div', 'mips');
    var src = tileCanvas(atlas, name, 1);
    [16, 8, 4, 2, 1].forEach(function (size, i) {
      var box = el('div', 'mipbox');
      var c = document.createElement('canvas');
      c.width = 64; c.height = 64;
      var ctx = c.getContext('2d');
      // Stufe erzeugen (Mittelwert, wie generateMipmap) …
      var tmp = document.createElement('canvas');
      tmp.width = size; tmp.height = size;
      var tctx = tmp.getContext('2d');
      tctx.imageSmoothingEnabled = true;
      tctx.drawImage(src, 0, 0, size, size);
      // … und für die Anzeige hart hochskalieren
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, size, size, 0, 0, 64, 64);
      c.className = 'px';
      box.appendChild(c);
      box.appendChild(el('label', null, 'LOD ' + i + ' · ' + size + '²'));
      wrap.appendChild(box);
    });
    return wrap;
  };

  Board.section = function (id, titel, unter) {
    var s = el('section', null);
    s.id = id;
    var h = el('div', 'shead');
    h.appendChild(el('h2', null, titel));
    if (unter) h.appendChild(el('p', null, unter));
    s.appendChild(h);
    return s;
  };

  Board.grid = function (cls) { return el('div', 'grid ' + (cls || '')); };

})(window);
