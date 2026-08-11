/* ============================================================
   village.js  -  Dörfer: Rasterlayout, Gebäude, Wege
   Alles rein deterministisch aus Seed + Regionskoordinate, damit ein Chunk
   auch dann korrekt entsteht, wenn seine Nachbarn nie geladen wurden.
   ============================================================ */
(function () {
  'use strict';

  var B = MC.Blocks, U = MC.U;
  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT;

  var V = {};
  MC.Village = V;

  V.REGION = 20;                    // Chunks je Region
  V.SPACING = V.REGION * CS;        // 320 Blöcke Raster
  V.CHANCE = 0.62;                  // Anteil der Regionen mit Dorf
  var CELL = 10;                    // Kantenlänge einer Bauparzelle
  var GRID = 2;                     // Parzellen je Richtung ab der Mitte

  // ---------- Materialsätze ----------
  function matsFor(biome) {
    var BM = MC.WorldGen.BIOME;
    if (biome === BM.DESERT) {
      return { wall: 'sandstone', trim: 'sandstone', floor: 'sandstone',
               roof: 'slab_sandstone', fence: 'fence_oak', path: 'sandstone', glass: 'glass' };
    }
    if (biome === BM.TAIGA || biome === BM.SNOW) {
      return { wall: 'planks_spruce', trim: 'log_spruce', floor: 'planks_spruce',
               roof: 'slab_planks_spruce', fence: 'fence_spruce', path: 'gravel', glass: 'glass' };
    }
    return { wall: 'planks_oak', trim: 'log_oak', floor: 'planks_oak',
             roof: 'slab_planks_oak', fence: 'fence_oak', path: 'gravel', glass: 'glass' };
  }

  // Zum Zaun passendes Tor
  function gateFor(fenceName) {
    return 'gate_' + fenceName.replace('fence_', '');
  }

  function resolve(m) {
    var out = {};
    for (var k in m) out[k] = B.id(m[k]);
    out.gate = B.id(gateFor(m.fence));
    out.cobble = B.id('cobblestone');
    // Sockelstein: in der Wüste passt Sandstein, sonst Bruchstein
    out.plinth = B.id(m.wall === 'sandstone' ? 'sandstone' : 'cobblestone');
    out.dirt = B.id('dirt');
    out.torch = B.id('torch');
    out.door = B.id('door_oak');
    out.bed = B.id('bed');
    out.chest = B.id('chest');
    out.bench = B.id('crafting_table');
    out.furnace = B.id('furnace');
    out.shelf = B.id('bookshelf');
    out.water = B.id('water');
    out.farmland = B.id('farmland');
    out.wheat = B.id('wheat');
    return out;
  }

  // Gebäudetypen: Grundfläche und Zeichenfunktion
  var TYPES = {
    haus_klein: { w: 5, d: 5, weight: 4 },
    haus_gross: { w: 7, d: 6, weight: 3 },
    feld:       { w: 7, d: 7, weight: 3 },
    schmiede:   { w: 6, d: 6, weight: 2 },
    bibliothek: { w: 6, d: 6, weight: 2 }
  };
  var TYPE_BAG = [];
  Object.keys(TYPES).forEach(function (k) {
    for (var i = 0; i < TYPES[k].weight; i++) TYPE_BAG.push(k);
  });

  // ============================================================
  //  Layout
  // ============================================================
  // Der billige Teil: gibt es hier überhaupt ein Dorf, und wo liegt seine
  // Mitte? Rund zwanzig Höhenabfragen. Das volle Layout kostet ein Vielfaches
  // davon, deshalb wird es erst gebaut, wenn wirklich jemand in die Nähe kommt.
  function kopf(gen, rx, rz) {
    var rnd = U.rng(U.hashString('dorf:' + gen.seed + ':' + rx + ':' + rz));
    if (rnd() > V.CHANCE) return null;

    var span = V.SPACING;
    var cx = rx * span + 60 + Math.floor(rnd() * (span - 120));
    var cz = rz * span + 60 + Math.floor(rnd() * (span - 120));

    var BM = MC.WorldGen.BIOME;
    var info = gen.columnInfo(cx, cz);
    if (info.biome === BM.OCEAN || info.biome === BM.BEACH ||
        info.biome === BM.SWAMP || info.biome === BM.MOUNTAINS) return null;

    var y = Math.floor(info.h);
    if (y <= gen.sea + 1 || y > WH - 12) return null;

    // Nur halbwegs ebenes Gelände bebauen, sonst steht das Dorf auf Stelzen.
    // Version 2 verträgt deutlich mehr, weil jedes Haus seine eigene Höhe
    // bekommt statt gemeinsam auf einem Plateau zu stehen.
    var erlaubt = gen.genV >= 2 ? 16 : 7;
    var lo = y, hi = y;
    for (var s = 0; s < 20; s++) {
      var a = (s / 20) * Math.PI * 2, r = 10 + (s % 4) * 7;
      var hh = Math.floor(gen.heightAt(cx + Math.round(Math.cos(a) * r), cz + Math.round(Math.sin(a) * r)));
      if (hh < lo) lo = hh;
      if (hh > hi) hi = hh;
    }
    if (hi - lo > erlaubt) return null;
    return { x: cx, z: cz, y: y, biome: info.biome, rnd: rnd };
  }

  function layout(gen, rx, rz) {
    var k = kopf(gen, rx, rz);
    if (!k) return null;
    var rnd = k.rnd, cx = k.x, cz = k.z, y = k.y;

    if (gen.genV >= 2) return layoutV2(gen, rnd, rx, rz, cx, cz, y, k.biome);

    var mat = resolve(matsFor(k.biome));
    var builds = [{ type: 'brunnen', x: cx - 1, z: cz - 1, w: 4, d: 4, face: 0 }];

    for (var i = -GRID; i <= GRID; i++) {
      for (var j = -GRID; j <= GRID; j++) {
        if (i === 0 || j === 0) continue;              // Wegkreuz bleibt frei
        if (rnd() > 0.62) continue;
        var t = TYPE_BAG[(rnd() * TYPE_BAG.length) | 0];
        var spec = TYPES[t];
        var ccx = cx + i * CELL, ccz = cz + j * CELL;
        var jx = (rnd() * 3 | 0) - 1, jz = (rnd() * 3 | 0) - 1;
        // Tür zeigt zur näheren Wegachse
        var face;
        if (Math.abs(i) < Math.abs(j)) face = j < 0 ? 2 : 0;
        else if (Math.abs(j) < Math.abs(i)) face = i < 0 ? 1 : 3;
        else face = rnd() < 0.5 ? (j < 0 ? 2 : 0) : (i < 0 ? 1 : 3);
        builds.push({
          type: t, w: spec.w, d: spec.d, face: face,
          x: ccx - (spec.w >> 1) + jx, z: ccz - (spec.d >> 1) + jz
        });
      }
    }

    // Laternen entlang der Wege
    for (var k = -GRID; k <= GRID; k++) {
      if (k === 0) continue;
      builds.push({ type: 'lampe', x: cx + k * CELL + 3, z: cz + 2, w: 1, d: 1, face: 0 });
      builds.push({ type: 'lampe', x: cx + 2, z: cz + k * CELL + 3, w: 1, d: 1, face: 0 });
    }

    // Das Dorf steht auf einem eingeebneten Plateau. Der äußere Ring wird zum
    // Gelände hin ausgeschliffen, sonst sitzt der Ort in einer Grube.
    var core = GRID * CELL + 4;
    var reach = GRID * CELL + 9;
    var v = {
      id: rx + ':' + rz, x: cx, z: cz, y: y, biome: k.biome, mat: mat, builds: builds,
      core: core, reach: reach,
      minX: cx - reach, maxX: cx + reach, minZ: cz - reach, maxZ: cz + reach
    };
    v.mw = v.maxX - v.minX + 1;
    v.mh = v.maxZ - v.minZ + 1;
    v.roadX = [cx - 1, cx + 1];
    v.roadZ = [cz - 1, cz + 1];

    // built = Häuser und Wege (dort kommt kein Bewuchs hin)
    v.built = new Uint8Array(v.mw * v.mh);
    function mark(x0, z0, x1, z1) {
      for (var mz = Math.max(z0, v.minZ); mz <= Math.min(z1, v.maxZ); mz++)
        for (var mx = Math.max(x0, v.minX); mx <= Math.min(x1, v.maxX); mx++)
          v.built[(mz - v.minZ) * v.mw + (mx - v.minX)] = 1;
    }
    builds.forEach(function (b) { mark(b.x - 1, b.z - 1, b.x + b.w, b.z + b.d); });
    mark(cx - 1, cz - core, cx + 1, cz + core);      // Weg in Z
    mark(cx - core, cz - 1, cx + core, cz + 1);      // Weg in X
    return v;
  }

  // ============================================================
  //  Layout Version 2 – Häuser aufs Gelände, Wege dazwischen
  // ============================================================
  // Kein Plateau mehr. Jedes Haus sucht sich einen Platz, der flach genug ist,
  // und bekommt seine eigene Höhe. Verbunden wird nicht über ein Wegkreuz,
  // sondern über ein Wegenetz, das dem Gelände folgt: eine Dijkstra-Suche vom
  // Brunnen über das ganze Dorffeld gibt für jede Haustür den günstigsten Weg,
  // und weil alle Wege denselben Baum benutzen, laufen sie von selbst zusammen.
  var RAD = 34;              // halbe Kantenlänge des Dorffelds
  var PLATZ = 28;            // so weit vom Brunnen darf gebaut werden
  var MAX_STUFE = 1;         // Höhenschritt, den ein Weg noch nehmen darf

  function layoutV2(gen, rnd, rx, rz, cx, cz, y, biome) {
    var mat = resolve(matsFor(biome));
    var mw = RAD * 2 + 1;
    var minX = cx - RAD, minZ = cz - RAD;

    // ---- Höhenfeld einmal einsammeln ----
    var hf = new Int16Array(mw * mw);
    var nass = new Uint8Array(mw * mw);
    for (var iz = 0; iz < mw; iz++) {
      for (var ix = 0; ix < mw; ix++) {
        var ci = gen.columnInfo(minX + ix, minZ + iz);
        hf[iz * mw + ix] = Math.floor(ci.h);
        if (ci.h < gen.sea + 0.5) nass[iz * mw + ix] = 1;
      }
    }
    function hAt(x, z) {
      var ix = x - minX, iz = z - minZ;
      if (ix < 0 || ix >= mw || iz < 0 || iz >= mw) return null;
      return hf[iz * mw + ix];
    }
    function nassAt(x, z) {
      var ix = x - minX, iz = z - minZ;
      if (ix < 0 || ix >= mw || iz < 0 || iz >= mw) return 1;
      return nass[iz * mw + ix];
    }

    // ---- Bauplätze suchen ----
    var belegt = new Uint8Array(mw * mw);
    function markiere(x0, z0, w, d, feld, rand) {
      rand = rand || 0;
      for (var z = z0 - rand; z < z0 + d + rand; z++) {
        for (var x = x0 - rand; x < x0 + w + rand; x++) {
          var ix = x - minX, iz = z - minZ;
          if (ix < 0 || ix >= mw || iz < 0 || iz >= mw) continue;
          feld[iz * mw + ix] = 1;
        }
      }
    }
    function frei(x0, z0, w, d, rand) {
      for (var z = z0 - rand; z < z0 + d + rand; z++) {
        for (var x = x0 - rand; x < x0 + w + rand; x++) {
          var ix = x - minX, iz = z - minZ;
          if (ix < 0 || ix >= mw || iz < 0 || iz >= mw) return false;
          if (belegt[iz * mw + ix]) return false;
        }
      }
      return true;
    }
    // Wie eben ist die Grundfläche, und auf welcher Höhe sitzt sie?
    function pruefe(x0, z0, w, d) {
      var lo = 9999, hi = -9999;
      for (var z = z0; z < z0 + d; z++) {
        for (var x = x0; x < x0 + w; x++) {
          if (nassAt(x, z)) return null;
          var h = hAt(x, z);
          if (h === null) return null;
          if (h < lo) lo = h;
          if (h > hi) hi = h;
        }
      }
      if (hi - lo > 3) return null;
      return lo;   // auf die tiefste Ecke setzen, den Rest untermauern
    }

    // belegt = kein zweites Haus hierhin. sperre = hier darf auch kein Weg
    // durch. Der Brunnenplatz steht nur in `belegt`: von dort geht der Weg ja
    // gerade los. Häuser sperren, weil sonst ein Weg unter einem Fundament
    // verschwindet und die Tür dahinter unerreichbar wird.
    var sperre = new Uint8Array(mw * mw);
    var builds = [{ type: 'brunnen', x: cx - 1, z: cz - 1, w: 4, d: 4, face: 0, y: y }];
    markiere(cx - 2, cz - 2, 6, 6, belegt);

    // Kandidaten auf einem verrauschten Raster, in zufälliger Reihenfolge
    var kand = [];
    for (var gz = -PLATZ; gz <= PLATZ; gz += 9) {
      for (var gx = -PLATZ; gx <= PLATZ; gx += 9) {
        if (gx * gx + gz * gz > PLATZ * PLATZ) continue;
        if (Math.abs(gx) < 6 && Math.abs(gz) < 6) continue;   // Brunnenplatz
        kand.push([cx + gx + ((rnd() * 5) | 0) - 2, cz + gz + ((rnd() * 5) | 0) - 2]);
      }
    }
    for (var m = kand.length - 1; m > 0; m--) {
      var k = (rnd() * (m + 1)) | 0, t = kand[m]; kand[m] = kand[k]; kand[k] = t;
    }

    for (var ki = 0; ki < kand.length; ki++) {
      var typ = TYPE_BAG[(rnd() * TYPE_BAG.length) | 0];
      var spec = TYPES[typ];
      var px = kand[ki][0] - (spec.w >> 1), pz = kand[ki][1] - (spec.d >> 1);
      if (!frei(px, pz, spec.w, spec.d, 2)) continue;
      var py = pruefe(px, pz, spec.w, spec.d);
      if (py === null) continue;
      // Die Tür zeigt zur Dorfmitte – von dort kommt der Weg. Taugt die Seite
      // nicht (Wasser davor, oder eine Stufe zu hoch), wird reihum probiert;
      // sonst endet der Weg vor einer Schwelle, die man nicht hochkommt.
      var dx = cx - (px + spec.w / 2), dz = cz - (pz + spec.d / 2);
      var wunsch = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 1 : 3) : (dz > 0 ? 2 : 0);
      var face = -1;
      for (var fi = 0; fi < 4 && face < 0; fi++) {
        var f = (wunsch + fi) & 3, sd = SIDE[f];
        var tx = sd[0] === 0 ? px + (spec.w >> 1) : (sd[0] > 0 ? px + spec.w - 1 : px);
        var tz = sd[1] === 0 ? pz + (spec.d >> 1) : (sd[1] > 0 ? pz + spec.d - 1 : pz);
        var fx = tx + sd[0], fz = tz + sd[1];
        if (nassAt(fx, fz)) continue;
        var fh = hAt(fx, fz);
        if (fh === null || Math.abs(fh - py) > 1) continue;
        face = f;
      }
      if (face < 0) continue;
      builds.push({ type: typ, x: px, z: pz, w: spec.w, d: spec.d, face: face, y: py });
      markiere(px, pz, spec.w, spec.d, belegt, 1);
      // Gesperrt ist die Grundfläche selbst; der Ring darum bleibt frei,
      // sonst käme der Weg gar nicht erst bis vor die Tür.
      markiere(px, pz, spec.w, spec.d, sperre);
      if (builds.length > 14) break;
    }
    if (builds.length < 4) return null;    // zu zerklüftet, hier wohnt niemand

    // ---- Wegenetz ----
    var v = {
      id: rx + ':' + rz, v2: true, x: cx, z: cz, y: y, biome: biome, mat: mat,
      builds: builds, minX: minX, maxX: minX + mw - 1, minZ: minZ, maxZ: minZ + mw - 1,
      mw: mw, mh: mw
    };
    var wege = wegenetz(v, hf, nass, sperre, mw, minX, minZ, cx, cz);
    v.wege = wege.maske;
    v.wegH = wege.hoehe;

    // Häuser, zu denen kein Weg führt, sind auch keine Häuser
    v.builds = builds.filter(function (b, i) {
      return i === 0 || b.type === 'lampe' || wege.erreicht[i];
    });

    // Laternen an den Wegkreuzungen
    laternen(v, rnd);

    // built = Häuser und Wege – dort wächst nichts von selbst
    v.built = new Uint8Array(mw * mw);
    v.builds.forEach(function (b) { markiere(b.x - 1, b.z - 1, b.w + 2, b.d + 2, v.built); });
    for (var q = 0; q < wege.maske.length; q++) if (wege.maske[q]) v.built[q] = 1;
    return v;
  }

  // Dijkstra vom Brunnen über das ganze Feld. Kanten mit mehr als einem Block
  // Höhenunterschied gibt es nicht – so ist jeder Weg, den die Suche findet,
  // auch begehbar, ohne dass man Treppen einbauen müsste.
  function wegenetz(v, hf, nass, sperre, mw, minX, minZ, cx, cz) {
    var N = mw * mw;
    var dist = new Float32Array(N); dist.fill(Infinity);
    var vor = new Int32Array(N); vor.fill(-1);
    var fertig = new Uint8Array(N);
    var start = (cz - minZ) * mw + (cx - minX);
    dist[start] = 0;

    // Binärheap, sonst wird das quadratisch
    var heap = [start], hd = [0];
    function push(node, d) {
      heap.push(node); hd.push(d);
      var i = heap.length - 1;
      while (i > 0) {
        var p = (i - 1) >> 1;
        if (hd[p] <= hd[i]) break;
        var a = heap[p]; heap[p] = heap[i]; heap[i] = a;
        var b = hd[p]; hd[p] = hd[i]; hd[i] = b;
        i = p;
      }
    }
    function pop() {
      var top = heap[0];
      var last = heap.pop(), ld = hd.pop();
      if (heap.length) {
        heap[0] = last; hd[0] = ld;
        var i = 0;
        for (;;) {
          var l = i * 2 + 1, r = l + 1, s = i;
          if (l < heap.length && hd[l] < hd[s]) s = l;
          if (r < heap.length && hd[r] < hd[s]) s = r;
          if (s === i) break;
          var a = heap[s]; heap[s] = heap[i]; heap[i] = a;
          var b = hd[s]; hd[s] = hd[i]; hd[i] = b;
          i = s;
        }
      }
      return top;
    }

    var NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
              [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]];
    while (heap.length) {
      var u = pop();
      if (fertig[u]) continue;
      fertig[u] = 1;
      var ux = u % mw, uz = (u / mw) | 0;
      for (var n = 0; n < NB.length; n++) {
        var vx = ux + NB[n][0], vz = uz + NB[n][1];
        if (vx < 0 || vx >= mw || vz < 0 || vz >= mw) continue;
        var vi = vz * mw + vx;
        if (fertig[vi] || nass[vi] || sperre[vi]) continue;
        var dh = hf[vi] - hf[u];
        if (dh > MAX_STUFE || dh < -MAX_STUFE) continue;
        var c = NB[n][2] + Math.abs(dh) * 4;   // Steigung kostet
        if (dist[u] + c < dist[vi]) { dist[vi] = dist[u] + c; vor[vi] = u; push(vi, dist[vi]); }
      }
    }

    var maske = new Uint8Array(N);
    var hoehe = new Int16Array(N);
    var erreicht = [];
    v.builds.forEach(function (b, i) {
      erreicht[i] = (i === 0);
      if (i === 0) return;
      // Zielfeld: der Block direkt vor der Tür
      var d = SIDE[b.face];
      var tx = d[0] === 0 ? b.x + (b.w >> 1) : (d[0] > 0 ? b.x + b.w - 1 : b.x);
      var tz = d[1] === 0 ? b.z + (b.d >> 1) : (d[1] > 0 ? b.z + b.d - 1 : b.z);
      b.doorX = tx; b.doorZ = tz;
      var zx = tx + d[0], zz = tz + d[1];
      var zi = (zz - minZ) * mw + (zx - minX);
      if (zi < 0 || zi >= N || dist[zi] === Infinity) return;
      erreicht[i] = true;
      for (var p = zi; p !== -1; p = vor[p]) {
        if (maske[p]) break;                 // ab hier läuft der Weg schon
        maske[p] = 1; hoehe[p] = hf[p];
        // Diagonalschritte auffüllen: eine Kette einzelner Eckblöcke sieht
        // nicht nach Weg aus. Der Eckblock kommt dazu, wenn er auf derselben
        // Höhe liegt und nicht schon jemandem gehört.
        var q = vor[p];
        if (q === -1) continue;
        var px = p % mw, pz = (p / mw) | 0, qx = q % mw, qz = (q / mw) | 0;
        if (px === qx || pz === qz) continue;
        var e1 = pz * mw + qx, e2 = qz * mw + px;
        var e = (!sperre[e1] && !nass[e1] && hf[e1] === hf[p]) ? e1
              : ((!sperre[e2] && !nass[e2] && hf[e2] === hf[p]) ? e2 : -1);
        if (e >= 0 && !maske[e]) { maske[e] = 1; hoehe[e] = hf[e]; }
      }
      maske[zi] = 1; hoehe[zi] = hf[zi];
    });
    // Der Brunnenplatz selbst gehört dazu
    maske[start] = 1; hoehe[start] = hf[start];
    return { maske: maske, hoehe: hoehe, erreicht: erreicht };
  }

  // Laternen dort, wo der Weg sich verzweigt – das sind die Kreuzungen
  function laternen(v, rnd) {
    var mw = v.mw, maske = v.wege;
    var kandidaten = [];
    for (var iz = 2; iz < mw - 2; iz++) {
      for (var ix = 2; ix < mw - 2; ix++) {
        var i = iz * mw + ix;
        if (maske[i]) continue;
        // ein freies Feld mit mindestens drei Wegnachbarn steht an einer Kreuzung
        var n = 0;
        if (maske[i - 1]) n++;
        if (maske[i + 1]) n++;
        if (maske[i - mw]) n++;
        if (maske[i + mw]) n++;
        if (n >= 2 && rnd() < 0.5) kandidaten.push([v.minX + ix, v.minZ + iz, v.wegH[maske[i - 1] ? i - 1 : (maske[i + 1] ? i + 1 : (maske[i - mw] ? i - mw : i + mw))]]);
      }
    }
    // ausdünnen, sonst steht alle zwei Blöcke eine Laterne
    var gesetzt = [];
    for (var c = 0; c < kandidaten.length; c++) {
      var k = kandidaten[c], ok = true;
      for (var g = 0; g < gesetzt.length; g++) {
        var ddx = gesetzt[g][0] - k[0], ddz = gesetzt[g][1] - k[1];
        if (ddx * ddx + ddz * ddz < 100) { ok = false; break; }
      }
      if (!ok) continue;
      gesetzt.push(k);
      v.builds.push({ type: 'lampe', x: k[0], z: k[1], w: 1, d: 1, face: 0, y: k[2] });
      if (gesetzt.length >= 8) break;
    }
  }

  // Zielhöhe einer Spalte: innen glatt, außen zum Gelände hin verlaufend
  function levelAt(gen, v, wx, wz) {
    var d = Math.max(Math.abs(wx - v.x), Math.abs(wz - v.z));
    if (d > v.reach) return null;
    if (d <= v.core) return v.y;
    var t = (v.reach - d) / (v.reach - v.core);
    t = t * t * (3 - 2 * t);
    return Math.round(gen.columnInfo(wx, wz).h + (v.y - gen.columnInfo(wx, wz).h) * t);
  }

  // ============================================================
  //  Nachschlagen
  // ============================================================
  // Nur die Mitte, ohne das teure Layout
  V.kopfAt = function (gen, rx, rz) {
    if (!gen._vilK) gen._vilK = {};
    var k = rx + ',' + rz;
    if (k in gen._vilK) return gen._vilK[k];
    var h = null;
    try { h = kopf(gen, rx, rz); } catch (e) { h = null; }
    gen._vilK[k] = h;
    return h;
  };

  V.at = function (gen, rx, rz) {
    if (!gen._vil) gen._vil = {};
    var k = rx + ',' + rz;
    if (k in gen._vil) return gen._vil[k];
    var v = null;
    try { v = layout(gen, rx, rz); } catch (e) { v = null; }
    gen._vil[k] = v;
    return v;
  };

  // So weit reicht ein Dorf höchstens von seiner Mitte aus – muss zum
  // Randabstand in V.near passen, sonst fällt ein Dorf am Rand durch
  var WEITE = 34 + 24;

  // Alle Dörfer, die in die Nähe dieser Weltposition reichen (oder null).
  // Erst wird über die billige Mitte gefiltert – sonst würde jeder Chunk das
  // volle Layout aller neun Nachbarregionen erzwingen, für nichts.
  V.near = function (gen, wx, wz) {
    var rx = Math.floor(wx / V.SPACING), rz = Math.floor(wz / V.SPACING);
    var list = null;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        var h = V.kopfAt(gen, rx + dx, rz + dz);
        if (!h) continue;
        if (Math.abs(wx - h.x) > WEITE || Math.abs(wz - h.z) > WEITE) continue;
        var v = V.at(gen, rx + dx, rz + dz);
        if (!v) continue;
        if (wx < v.minX - 24 || wx > v.maxX + 24 || wz < v.minZ - 24 || wz > v.maxZ + 24) continue;
        (list || (list = [])).push(v);
      }
    }
    return list;
  };

  // Nächstes Dorf innerhalb von maxDist um (wx,wz) – für das Spawnen der Bewohner
  V.nearest = function (gen, wx, wz, maxDist) {
    var rx = Math.floor(wx / V.SPACING), rz = Math.floor(wz / V.SPACING);
    var best = null, bestD = maxDist * maxDist;
    for (var dx = -1; dx <= 1; dx++) {
      for (var dz = -1; dz <= 1; dz++) {
        var h = V.kopfAt(gen, rx + dx, rz + dz);
        if (!h) continue;
        var ddx = h.x - wx, ddz = h.z - wz;
        var d2 = ddx * ddx + ddz * ddz;
        if (d2 >= bestD) continue;
        var v = V.at(gen, rx + dx, rz + dz);
        if (!v) continue;
        bestD = d2; best = v;
      }
    }
    return best;
  };

  // Das ganze Plateau ist tabu für die normale Dekoration – Bäume und Blumen
  // würden sonst auf der alten Geländehöhe stehenbleiben und schweben.
  // In Version 2 gibt es kein Plateau: dort ist nur gesperrt, was wirklich
  // bebaut ist. Deshalb wächst der Wald bis an die Häuser heran.
  V.occupies = function (list, wx, wz) {
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.v2) { if (isBuilt(v, wx, wz)) return true; continue; }
      if (Math.max(Math.abs(wx - v.x), Math.abs(wz - v.z)) <= v.reach) return true;
    }
    return false;
  };

  function isBuilt(v, wx, wz) {
    if (wx < v.minX || wx > v.maxX || wz < v.minZ || wz > v.maxZ) return false;
    return !!v.built[(wz - v.minZ) * v.mw + (wx - v.minX)];
  }

  // ============================================================
  //  Bauen
  // ============================================================
  V.generate = function (gen, cx, cz, blocks, meta) {
    var list = V.near(gen, cx * CS + 8, cz * CS + 8);
    if (!list) return;
    var wx0 = cx * CS, wz0 = cz * CS;

    function set(wx, wy, wz, id, m) {
      var lx = wx - wx0, lz = wz - wz0;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS || wy < 0 || wy >= WH) return;
      var i = lx | (lz << 4) | (wy << 8);
      blocks[i] = id;
      meta[i] = m || 0;
    }

    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      if (v.maxX < wx0 || v.minX > wx0 + CS - 1 || v.maxZ < wz0 || v.minZ > wz0 + CS - 1) continue;
      if (v.v2) {
        wegeZeichnen(gen, v, set, wx0, wz0);
      } else {
        plateau(gen, v, set, wx0, wz0);
        roads(gen, v, set, wx0, wz0);
      }
      for (var b = 0; b < v.builds.length; b++) {
        var bd = v.builds[b];
        if (bd.x + bd.w < wx0 - 1 || bd.x > wx0 + CS || bd.z + bd.d < wz0 - 1 || bd.z > wz0 + CS) continue;
        draw(gen, v, bd, set);
      }
    }
  };

  // Version 2: nur die Wegfelder dieses Chunks belegen, jedes auf seiner
  // eigenen Höhe. Der Weg folgt dem Gelände, statt es einzuebnen.
  function wegeZeichnen(gen, v, set, wx0, wz0) {
    var m = v.mat, mw = v.mw;
    var x0 = Math.max(v.minX, wx0), x1 = Math.min(v.maxX, wx0 + CS - 1);
    var z0 = Math.max(v.minZ, wz0), z1 = Math.min(v.maxZ, wz0 + CS - 1);
    for (var z = z0; z <= z1; z++) {
      for (var x = x0; x <= x1; x++) {
        var i = (z - v.minZ) * mw + (x - v.minX);
        if (!v.wege[i]) continue;
        var wy = v.wegH[i];
        set(x, wy, z, m.path, 0);
        for (var ay = wy + 1; ay <= wy + 3; ay++) set(x, ay, z, 0, 0);
      }
    }
  }

  // Plateau einebnen, Rand ausschleifen und etwas Gras stehen lassen
  function plateau(gen, v, set, wx0, wz0) {
    var BM = MC.WorldGen.BIOME;
    var topId = v.biome === BM.DESERT ? B.id('sand') : B.id('grass');
    var fillId = v.biome === BM.DESERT ? B.id('sand') : B.id('dirt');
    var grassId = B.id('tall_grass');
    var flowers = [B.id('flower_red'), B.id('flower_yellow'), B.id('flower_blue')];
    var x0 = Math.max(v.minX, wx0), x1 = Math.min(v.maxX, wx0 + CS - 1);
    var z0 = Math.max(v.minZ, wz0), z1 = Math.min(v.maxZ, wz0 + CS - 1);
    for (var z = z0; z <= z1; z++) {
      for (var x = x0; x <= x1; x++) {
        var ty = levelAt(gen, v, x, z);
        if (ty === null) continue;
        var th = Math.floor(gen.columnInfo(x, z).h);
        for (var ay = ty + 1; ay <= Math.max(ty + 9, th + 3); ay++) set(x, ay, z, 0, 0);
        set(x, ty, z, topId, 0);
        for (var fy = ty - 1; fy > th && fy > 1; fy--) set(x, fy, z, fillId, 0);
        if (isBuilt(v, x, z)) continue;
        var r = U.hash3(x, 3131, z);
        if (r < 0.02) set(x, ty + 1, z, flowers[(U.hash3(x, 55, z) * 3) | 0], 0);
        else if (r < 0.28) set(x, ty + 1, z, grassId, 0);
      }
    }
  }

  // Baugrund: Fläche freiräumen und auf Dorfhöhe legen.
  // groundId === null heißt: Boden so lassen, wie das Plateau ihn gelegt hat.
  function flatten(gen, v, x0, z0, w, d, set, groundId, clearHeight) {
    for (var z = z0; z < z0 + d; z++) {
      for (var x = x0; x < x0 + w; x++) {
        if (groundId !== null) set(x, v.y, z, groundId, 0);
        var th = Math.floor(gen.columnInfo(x, z).h);
        // Sockel: was unter dem Haus fehlt, wird untermauert. In Version 2
        // sieht man ihn am Hang, darum Stein statt Erde.
        var sockel = v.v2 ? v.mat.plinth : v.mat.dirt;
        for (var yy = v.y - 1; yy > th && yy > 1; yy--) set(x, yy, z, sockel, 0);
        var top = Math.max(v.y + clearHeight, th + 2);
        for (var ay = v.y + 1; ay <= top; ay++) set(x, ay, z, 0, 0);
      }
    }
  }

  // Nur die Wegfelder zeichnen, die wirklich in diesem Chunk liegen – sonst
  // kostet jedes Dorf pro Nachbarchunk hunderte Höhenabfragen für nichts.
  function roads(gen, v, set, wx0, wz0) {
    var m = v.mat;
    var x, z;
    var cx0 = wx0, cx1 = wx0 + CS - 1, cz0 = wz0, cz1 = wz0 + CS - 1;
    // Weg in Z-Richtung
    var ax0 = Math.max(v.roadX[0], cx0), ax1 = Math.min(v.roadX[1], cx1);
    var az0 = Math.max(v.z - v.core, cz0), az1 = Math.min(v.z + v.core, cz1);
    for (z = az0; z <= az1; z++) for (x = ax0; x <= ax1; x++) laneCell(v, set, x, z, m.path);
    // Weg in X-Richtung
    var bx0 = Math.max(v.x - v.core, cx0), bx1 = Math.min(v.x + v.core, cx1);
    var bz0 = Math.max(v.roadZ[0], cz0), bz1 = Math.min(v.roadZ[1], cz1);
    for (x = bx0; x <= bx1; x++) for (z = bz0; z <= bz1; z++) laneCell(v, set, x, z, m.path);
  }

  // Das Plateau liegt schon auf v.y – hier nur noch den Belag legen
  function laneCell(v, set, x, z, pathId) {
    set(x, v.y, z, pathId, 0);
    set(x, v.y + 1, z, 0, 0);
  }

  var SIDE = B.SIDE_DIRS;   // 0=-Z 1=+X 2=+Z 3=-X

  function draw(gen, v, b, set) {
    // In Version 2 hat jedes Gebäude seine eigene Höhe. Statt jede Bauroutine
    // umzuschreiben bekommt sie ein Dorf vorgesetzt, dessen `y` die des Hauses
    // ist – alles andere liest sie über die Prototypenkette weiter aus v.
    if (v.v2 && b.y !== undefined && b.y !== v.y) {
      var vv = Object.create(v);
      vv.y = b.y;
      v = vv;
    }
    switch (b.type) {
      case 'brunnen': return well(gen, v, b, set);
      case 'lampe': return lamp(gen, v, b, set);
      case 'feld': return farm(gen, v, b, set);
      default: return house(gen, v, b, set);
    }
  }

  // ---------- Brunnen ----------
  function well(gen, v, b, set) {
    var m = v.mat;
    flatten(gen, v, b.x - 1, b.z - 1, b.w + 2, b.d + 2, set, null, 6);
    var x, z;
    for (z = b.z; z < b.z + 4; z++) {
      for (x = b.x; x < b.x + 4; x++) {
        var rand = (x === b.x || x === b.x + 3 || z === b.z || z === b.z + 3);
        set(x, v.y, z, m.cobble, 0);
        set(x, v.y + 1, z, rand ? m.cobble : m.water, 0);
        if (!rand) set(x, v.y, z, m.cobble, 0);
      }
    }
    // Ecksäulen und Dach
    var corners = [[b.x, b.z], [b.x + 3, b.z], [b.x, b.z + 3], [b.x + 3, b.z + 3]];
    for (var c = 0; c < corners.length; c++) {
      set(corners[c][0], v.y + 2, corners[c][1], m.fence, 0);
      set(corners[c][0], v.y + 3, corners[c][1], m.fence, 0);
    }
    for (z = b.z; z < b.z + 4; z++)
      for (x = b.x; x < b.x + 4; x++) set(x, v.y + 4, z, m.cobble, 0);
  }

  // ---------- Laterne ----------
  function lamp(gen, v, b, set) {
    var m = v.mat;
    flatten(gen, v, b.x, b.z, 1, 1, set, null, 5);
    set(b.x, v.y + 1, b.z, m.fence, 0);
    set(b.x, v.y + 2, b.z, m.fence, 0);
    set(b.x, v.y + 3, b.z, m.fence, 0);
    set(b.x, v.y + 4, b.z, m.torch, 0);
  }

  // ---------- Feld ----------
  function farm(gen, v, b, set) {
    var m = v.mat;
    flatten(gen, v, b.x, b.z, b.w, b.d, set, null, 5);
    var x, z;
    // Zauntor in der Mitte der Seite, die zum Weg zeigt
    var gd = SIDE[b.face];
    var gx = gd[0] === 0 ? b.x + (b.w >> 1) : (gd[0] > 0 ? b.x + b.w - 1 : b.x);
    var gz = gd[1] === 0 ? b.z + (b.d >> 1) : (gd[1] > 0 ? b.z + b.d - 1 : b.z);
    for (z = b.z; z < b.z + b.d; z++) {
      for (x = b.x; x < b.x + b.w; x++) {
        var edge = (x === b.x || x === b.x + b.w - 1 || z === b.z || z === b.z + b.d - 1);
        if (edge) {
          set(x, v.y, z, m.dirt, 0);
          if (x === gx && z === gz) set(x, v.y + 1, z, m.gate, b.face);
          else set(x, v.y + 1, z, m.fence, 0);
          continue;
        }
        // Mittelrinne mit Wasser, links und rechts Ackerboden
        var mid = (z - b.z) === (b.d >> 1);
        if (mid) {
          set(x, v.y, z, m.water, 0);
        } else {
          set(x, v.y, z, m.farmland, 7);
          var grow = U.hash3(x, 909, z);
          set(x, v.y + 1, z, m.wheat, grow < 0.55 ? 7 : (grow * 7) | 0);
        }
      }
    }
  }

  // ---------- Haus ----------
  function house(gen, v, b, set) {
    var m = v.mat;
    var w = b.w, d = b.d, y = v.y;
    var x1 = b.x + w - 1, z1 = b.z + d - 1;
    var wallTop = y + 3;
    flatten(gen, v, b.x - 1, b.z - 1, w + 2, d + 2, set, null, 8);

    var x, z, yy;
    // Boden
    for (z = b.z; z <= z1; z++) for (x = b.x; x <= x1; x++) set(x, y, z, m.floor, 0);

    // Wände mit Ecksäulen
    for (yy = y + 1; yy <= wallTop; yy++) {
      for (z = b.z; z <= z1; z++) {
        for (x = b.x; x <= x1; x++) {
          var onEdge = (x === b.x || x === x1 || z === b.z || z === z1);
          if (!onEdge) { set(x, yy, z, 0, 0); continue; }
          var corner = (x === b.x || x === x1) && (z === b.z || z === z1);
          set(x, yy, z, corner ? m.trim : m.wall, 0);
        }
      }
    }

    // Fenster auf Augenhöhe, jede zweite Wandposition
    for (x = b.x + 1; x < x1; x += 2) {
      set(x, y + 2, b.z, m.glass, 0);
      set(x, y + 2, z1, m.glass, 0);
    }
    for (z = b.z + 1; z < z1; z += 2) {
      set(b.x, y + 2, z, m.glass, 0);
      set(x1, y + 2, z, m.glass, 0);
    }

    // Dach: eine Lage Stufen mit Überstand
    for (z = b.z - 1; z <= z1 + 1; z++)
      for (x = b.x - 1; x <= x1 + 1; x++) set(x, y + 4, z, m.roof, 0);

    // Tür in der Wandmitte
    var dir = SIDE[b.face];
    var dx = dir[0] === 0 ? b.x + (w >> 1) : (dir[0] > 0 ? x1 : b.x);
    var dz = dir[1] === 0 ? b.z + (d >> 1) : (dir[1] > 0 ? z1 : b.z);
    set(dx, y + 1, dz, m.door, (b.face << 1));
    set(dx, y + 2, dz, m.door, (b.face << 1) | 1);
    // Schwelle davor
    set(dx + dir[0], y, dz + dir[1], m.path, 0);

    // Innenlicht: Wandfackel gegenüber der Tür
    var opp = (b.face + 2) & 3, od = SIDE[opp];
    var tx = od[0] === 0 ? b.x + (w >> 1) : (od[0] > 0 ? x1 - 1 : b.x + 1);
    var tz = od[1] === 0 ? b.z + (d >> 1) : (od[1] > 0 ? z1 - 1 : b.z + 1);
    set(tx, y + 3, tz, m.torch, opp + 1);

    // ---- Einrichtung ----
    // Der Flur vor der Tür bleibt frei, sonst kommt man nicht ins Haus.
    var inX0 = b.x + 1, inX1 = x1 - 1, inZ0 = b.z + 1, inZ1 = z1 - 1;
    var sperre = {};
    for (var s = 1; s <= 2; s++) sperre[(dx - dir[0] * s) + ',' + (dz - dir[1] * s)] = true;
    function frei(px, pz) {
      return px >= inX0 && px <= inX1 && pz >= inZ0 && pz <= inZ1 && !sperre[px + ',' + pz];
    }
    // Innenecken in fester Reihenfolge, nur die freien
    var ecken = [[inX0, inZ0], [inX1, inZ0], [inX1, inZ1], [inX0, inZ1]].filter(function (c) {
      return frei(c[0], c[1]);
    });
    function naechsteEcke() { return ecken.shift() || null; }

    if (b.type === 'schmiede') {
      [m.furnace, m.chest, m.bench].forEach(function (id) {
        var c = naechsteEcke();
        if (c) set(c[0], y + 1, c[1], id, 0);
      });
    } else if (b.type === 'bibliothek') {
      // Regale an die Wand gegenüber der Tür, Türfeld ausgespart
      var wall = SIDE[(b.face + 2) & 3];
      for (z = inZ0; z <= inZ1; z++) {
        for (x = inX0; x <= inX1; x++) {
          var anWand = wall[0] !== 0 ? (x === (wall[0] > 0 ? inX1 : inX0))
                                     : (z === (wall[1] > 0 ? inZ1 : inZ0));
          if (!anWand || !frei(x, z)) continue;
          set(x, y + 1, z, m.shelf, 0);
          set(x, y + 2, z, m.shelf, 0);
        }
      }
      // Werkbank in eine Ecke, die kein Regal bekommen hat
      var wandDir = SIDE[(b.face + 2) & 3];
      for (var ei = 0; ei < ecken.length; ei++) {
        var c = ecken[ei];
        var amRegal = wandDir[0] !== 0 ? (c[0] === (wandDir[0] > 0 ? inX1 : inX0))
                                       : (c[1] === (wandDir[1] > 0 ? inZ1 : inZ0));
        if (amRegal) continue;
        set(c[0], y + 1, c[1], m.bench, 0);
        break;
      }
    } else {
      // Bett: Fußende in eine freie Ecke, Kopfteil daneben – beides muss frei sein
      var gelegt = false;
      for (var f = 0; f < 4 && !gelegt; f++) {
        var bedFace = (b.face + 1 + f) & 3, bd = SIDE[bedFace];
        for (var e = 0; e < ecken.length && !gelegt; e++) {
          var bx = ecken[e][0], bz = ecken[e][1];
          var hx = bx + bd[0], hz = bz + bd[1];
          if (!frei(hx, hz)) continue;
          set(bx, y + 1, bz, m.bed, (bedFace << 1));
          set(hx, y + 1, hz, m.bed, (bedFace << 1) | 1);
          sperre[bx + ',' + bz] = true;
          sperre[hx + ',' + hz] = true;
          gelegt = true;
        }
      }
      var rest = [[inX0, inZ0], [inX1, inZ0], [inX1, inZ1], [inX0, inZ1]].filter(function (c) {
        return frei(c[0], c[1]);
      });
      if (rest.length) set(rest[0][0], y + 1, rest[0][1], b.type === 'haus_gross' ? m.chest : m.bench, 0);
    }
  }

  // ============================================================
  //  Truheninhalt
  // ============================================================
  // [Item, Wahrscheinlichkeit, min, max]
  var LOOT = {
    schmiede: [
      ['iron_ingot', 0.85, 1, 4], ['coal', 0.8, 2, 6], ['iron_pickaxe', 0.3, 1, 1],
      ['iron_sword', 0.22, 1, 1], ['iron_helmet', 0.2, 1, 1], ['emerald', 0.35, 1, 2],
      ['apple', 0.4, 1, 3], ['stick', 0.5, 2, 5], ['diamond', 0.06, 1, 1]
    ],
    haus_gross: [
      ['bread', 0.7, 1, 3], ['wheat_item', 0.6, 1, 5], ['seeds', 0.6, 1, 4],
      ['apple', 0.4, 1, 2], ['stick', 0.5, 1, 4], ['wood_hoe', 0.2, 1, 1],
      ['emerald', 0.15, 1, 1], ['bowl', 0.25, 1, 2]
    ],
    haus_klein: [
      ['bread', 0.6, 1, 2], ['seeds', 0.5, 1, 3], ['stick', 0.5, 1, 3],
      ['apple', 0.3, 1, 2], ['coal', 0.3, 1, 3], ['emerald', 0.1, 1, 1]
    ],
    bibliothek: [
      ['book', 0.7, 1, 3], ['paper', 0.8, 2, 6], ['emerald', 0.2, 1, 2],
      ['bookshelf', 0.25, 1, 2], ['glowstone_dust', 0.15, 1, 2]
    ]
  };

  // Inhalt einer Dorftruhe. Rein aus Dorf-Id und Position gewürfelt – die Truhe
  // bekommt also immer denselben Inhalt, egal wann sie zuerst geöffnet wird.
  V.chestLoot = function (gen, wx, wy, wz) {
    var list = V.near(gen, wx, wz);
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      var v = list[i];
      for (var b = 0; b < v.builds.length; b++) {
        var bd = v.builds[b];
        if (wx < bd.x || wx >= bd.x + bd.w || wz < bd.z || wz >= bd.z + bd.d) continue;
        var table = LOOT[bd.type];
        if (!table) return null;
        return roll(table, U.rng(U.hashString('truhe:' + v.id + ':' + wx + ':' + wy + ':' + wz)));
      }
    }
    return null;
  };

  function roll(table, rnd) {
    var items = new Array(27);
    var frei = [];
    for (var s = 0; s < 27; s++) frei.push(s);
    var n = 0;
    for (var i = 0; i < table.length; i++) {
      var e = table[i];
      if (rnd() > e[1]) continue;
      if (!MC.Items.get(e[0])) continue;
      var count = e[2] + ((rnd() * (e[3] - e[2] + 1)) | 0);
      if (count <= 0) continue;
      var k = (rnd() * frei.length) | 0;
      var slot = frei.splice(k, 1)[0];
      items[slot] = MC.Items.newStack(e[0], count);
      n++;
    }
    return n ? items : null;
  }

  // ============================================================
  //  Berufe und Handelsangebote
  // ============================================================
  // give: Liste von [item, anzahl] (max. 2), get: [item, anzahl]
  V.PROFESSIONS = [
    { key: 'bauer', title: 'Bauer', robe: 'mob_villager_bauer', trades: [
      { give: [['wheat_item', 18]], get: ['emerald', 1], max: 16 },
      { give: [['pumpkin', 5]], get: ['emerald', 1], max: 10 },
      { give: [['seeds', 32]], get: ['emerald', 1], max: 10 },
      { give: [['emerald', 1]], get: ['bread', 5], max: 16 },
      { give: [['emerald', 1]], get: ['apple', 4], max: 12 },
      { give: [['emerald', 3]], get: ['golden_apple', 1], max: 3 }
    ] },
    { key: 'bibliothekar', title: 'Bibliothekar', robe: 'mob_villager_bibliothekar', trades: [
      { give: [['paper', 24]], get: ['emerald', 1], max: 12 },
      { give: [['book', 4]], get: ['emerald', 1], max: 10 },
      { give: [['emerald', 1]], get: ['glass', 4], max: 12 },
      { give: [['emerald', 3]], get: ['bookshelf', 1], max: 8 },
      { give: [['emerald', 5]], get: ['glowstone', 1], max: 4 }
    ] },
    { key: 'schmied', title: 'Schmied', robe: 'mob_villager_schmied', trades: [
      { give: [['coal', 16]], get: ['emerald', 1], max: 14 },
      { give: [['iron_ingot', 4]], get: ['emerald', 1], max: 12 },
      { give: [['emerald', 5]], get: ['iron_pickaxe', 1], max: 4 },
      { give: [['emerald', 6]], get: ['iron_chestplate', 1], max: 3 },
      { give: [['emerald', 4]], get: ['iron_sword', 1], max: 4 },
      { give: [['emerald', 16], ['iron_ingot', 4]], get: ['diamond_pickaxe', 1], max: 1 }
    ] },
    { key: 'metzger', title: 'Metzger', robe: 'mob_villager_metzger', trades: [
      { give: [['porkchop_raw', 12]], get: ['emerald', 1], max: 12 },
      { give: [['chicken_raw', 12]], get: ['emerald', 1], max: 12 },
      { give: [['beef_raw', 12]], get: ['emerald', 1], max: 12 },
      { give: [['emerald', 1]], get: ['porkchop_cooked', 3], max: 14 },
      { give: [['emerald', 1]], get: ['beef_cooked', 3], max: 14 }
    ] },
    { key: 'steinmetz', title: 'Steinmetz', robe: 'mob_villager_steinmetz', trades: [
      { give: [['clay_ball', 12]], get: ['emerald', 1], max: 12 },
      { give: [['cobblestone', 40]], get: ['emerald', 1], max: 12 },
      { give: [['emerald', 1]], get: ['stone_bricks', 6], max: 14 },
      { give: [['emerald', 1]], get: ['brick_block', 4], max: 14 },
      { give: [['emerald', 2]], get: ['obsidian', 1], max: 5 }
    ] }
  ];

  // Beruf und Angebotsauswahl hängen nur an Dorf-Id und Platznummer. Ein Bewohner,
  // der nach dem Entladen neu erscheint, hat darum wieder dieselben Angebote.
  V.villagerData = function (villageId, slot) {
    var rnd = U.rng(U.hashString('beruf:' + villageId + ':' + slot));
    var prof = V.PROFESSIONS[(rnd() * V.PROFESSIONS.length) | 0];
    var pool = prof.trades.slice();
    var n = 3 + ((rnd() * 2) | 0);
    var offers = [];
    for (var i = 0; i < n && pool.length; i++) {
      var k = (rnd() * pool.length) | 0;
      var t = pool.splice(k, 1)[0];
      offers.push({ give: t.give, get: t.get, uses: 0, max: t.max });
    }
    return { profession: prof.key, title: prof.title, robe: prof.robe, offers: offers };
  };

  // Ein zufälliger, freier Standort im Dorf – dort erscheinen die Bewohner
  // Das Haus, das zu einer Platznummer gehört: Türfeld, Blickrichtung nach
  // draußen, ein Punkt drinnen und einer davor.
  V.homeFor = function (v, index) {
    var houses = v.builds.filter(function (b) {
      return b.type !== 'lampe' && b.type !== 'brunnen' && b.type !== 'feld';
    });
    if (!houses.length) return null;
    var b = houses[index % houses.length];
    var dir = SIDE[b.face];
    var dx = dir[0] === 0 ? b.x + (b.w >> 1) : (dir[0] > 0 ? b.x + b.w - 1 : b.x);
    var dz = dir[1] === 0 ? b.z + (b.d >> 1) : (dir[1] > 0 ? b.z + b.d - 1 : b.z);
    return {
      // In Version 2 steht jedes Haus auf seiner eigenen Höhe
      y: (b.y !== undefined ? b.y : v.y) + 1,
      doorX: dx, doorZ: dz, dir: dir,
      // Raummitte als Ziel und das Innenrechteck zum Prüfen, ob jemand drin ist
      inX: b.x + b.w / 2, inZ: b.z + b.d / 2,
      x0: b.x + 1, x1: b.x + b.w - 1, z0: b.z + 1, z1: b.z + b.d - 1,
      outX: dx + dir[0] * 2 + 0.5,
      outZ: dz + dir[1] * 2 + 0.5
    };
  };

  V.spawnSpot = function (v, index) {
    var h = V.homeFor(v, index);
    if (!h) return { x: v.x + 0.5, y: v.y + 1.05, z: v.z + 3.5 };
    return { x: h.outX, y: h.y + 0.05, z: h.outZ };
  };

})();
