/* ============================================================
   world.js  -  Chunks, Licht-Engine, Flüssigkeiten, Block-Updates
   ============================================================ */
(function () {
  'use strict';

  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT, SEA = MC.SEA_LEVEL;
  var B = MC.Blocks;
  var U = MC.U;

  // ---------- FIFO-Queue auf flachem Int32Array (keine Objektallokation!) ----------
  function Q(stride) {
    this.s = stride;
    this.a = new Int32Array(8192 * stride);
    this.head = 0;
    this.tail = 0;
  }
  Q.prototype.grow = function () {
    if (this.head > 0) {
      this.a.copyWithin(0, this.head, this.tail);
      this.tail -= this.head;
      this.head = 0;
      if (this.tail + this.s <= this.a.length) return;
    }
    var n = new Int32Array(this.a.length * 2);
    n.set(this.a.subarray(0, this.tail));
    this.a = n;
  };
  Q.prototype.push3 = function (x, y, z) {
    if (this.tail + 3 > this.a.length) this.grow();
    var a = this.a, t = this.tail;
    a[t] = x; a[t + 1] = y; a[t + 2] = z;
    this.tail = t + 3;
  };
  Q.prototype.push4 = function (x, y, z, v) {
    if (this.tail + 4 > this.a.length) this.grow();
    var a = this.a, t = this.tail;
    a[t] = x; a[t + 1] = y; a[t + 2] = z; a[t + 3] = v;
    this.tail = t + 4;
  };
  Q.prototype.get = function () { return (this.tail - this.head) / this.s; };
  Q.prototype.empty = function () { return this.head >= this.tail; };
  Q.prototype.clear = function () { this.head = 0; this.tail = 0; };

  // ---------- Chunk ----------
  function Chunk(world, cx, cz) {
    this.world = world;
    this.cx = cx; this.cz = cz;
    this.blocks = new Uint8Array(CS * CS * WH);
    this.meta = new Uint8Array(CS * CS * WH);
    this.light = new Uint8Array(CS * CS * WH);   // hi nibble = Sonne, lo nibble = Blocklicht
    this.hmap = new Uint8Array(CS * CS);          // höchster nicht-transparenter Block +1
    this.state = 0;   // 0 leer, 1 generiert, 2 belichtet
    this.dirty = true;
    this.mesh = null;
    this.modified = null;  // {index: id<<8|meta} für Speicherung
    this.tickCount = 0;
  }
  MC.Chunk = Chunk;

  Chunk.prototype.idx = function (x, y, z) { return x | (z << 4) | (y << 8); };
  Chunk.prototype.get = function (x, y, z) { return this.blocks[x | (z << 4) | (y << 8)]; };
  Chunk.prototype.getMeta = function (x, y, z) { return this.meta[x | (z << 4) | (y << 8)]; };

  Chunk.prototype.recalcHeight = function (x, z) {
    var col = x | (z << 4);
    for (var y = WH - 1; y >= 0; y--) {
      var id = this.blocks[col | (y << 8)];
      if (id !== 0 && B.opacity(id) > 0) { this.hmap[col] = y + 1; return y + 1; }
    }
    this.hmap[col] = 0;
    return 0;
  };

  Chunk.prototype.recalcAllHeights = function () {
    for (var z = 0; z < CS; z++) for (var x = 0; x < CS; x++) this.recalcHeight(x, z);
  };

  Chunk.prototype.markModified = function (i, id, meta) {
    if (!this.modified) this.modified = {};
    this.modified[i] = (id << 8) | meta;
  };

  // ---------- World ----------
  function World(seed, opts) {
    opts = opts || {};
    this.seed = seed >>> 0;
    this.dim = opts.dim || 'overworld';
    this.settings = MC.normalizeWorldOpts(opts.settings);
    this.gen = new MC.WorldGen(this.seed, this.settings, this.dim);
    this.chunks = {};
    this.chunkList = [];
    this.time = opts.time !== undefined ? opts.time : 0.28;   // 0..1 Tagesanteil
    this.dayLength = 20 * 60;   // Sekunden pro Tag/Nacht-Zyklus
    this.tickTimer = 0;
    this.ticks = 0;

    this.lightAdd = new Q(3);       // Sonnenlicht ausbreiten
    this.lightAddB = new Q(3);      // Blocklicht ausbreiten
    this.lightRem = new Q(4);       // Sonnenlicht entfernen (x,y,z,alterWert)
    this.lightRemB = new Q(4);      // Blocklicht entfernen

    this.fluidQueue = [];
    this.fluidSet = {};
    this.blockUpdates = [];
    this.updateSet = {};

    this.entities = [];
    this.tagZaehler = opts.tagZaehler || 0;
    this.doerfer = opts.doerfer || null;    // Zustand je Dorf (Vorrat, Ruf)
    this.pendingChunks = [];
    this.dirtyChunks = [];
    this.tileEntities = {};   // "x,y,z" -> {type, ...}
  }
  MC.World = World;

  World.prototype.key = function (cx, cz) { return cx + ',' + cz; };

  World.prototype.getChunk = function (cx, cz) {
    return this.chunks[cx + ',' + cz] || null;
  };

  World.prototype.chunkAt = function (x, z) {
    return this.getChunk(x >> 4, z >> 4);
  };

  World.prototype.createChunk = function (cx, cz) {
    var k = cx + ',' + cz;
    var c = this.chunks[k];
    if (c) return c;
    c = new Chunk(this, cx, cz);
    this.chunks[k] = c;
    this.chunkList.push(c);
    this._cc = null;
    return c;
  };

  World.prototype.generateChunk = function (c) {
    this.gen.generate(c.cx, c.cz, c.blocks, c.meta);
    // gespeicherte Änderungen anwenden
    var saved = this.savedChunks && this.savedChunks[c.cx + ',' + c.cz];
    if (saved) {
      c.modified = {};
      for (var k in saved) {
        var v = saved[k];
        c.blocks[k] = (v >> 8) & 255;
        c.meta[k] = v & 255;
        c.modified[k] = v;
      }
      if (MC.Redstone) MC.Redstone.weckeGeladene(this, c, saved);
    }
    c.recalcAllHeights();
    c.state = 1;
    c.dirty = true;
  };

  World.prototype.unloadChunk = function (c) {
    var k = c.cx + ',' + c.cz;
    if (c.modified) {
      if (!this.savedChunks) this.savedChunks = {};
      this.savedChunks[k] = c.modified;
    }
    if (c.mesh && this.onChunkUnload) this.onChunkUnload(c);
    delete this.chunks[k];
    this._cc = null;
    var i = this.chunkList.indexOf(c);
    if (i >= 0) this.chunkList.splice(i, 1);
  };

  // ---------- Block-Zugriff ----------
  World.prototype.getBlock = function (x, y, z) {
    if (y < 0 || y >= WH) return 0;
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    if (!c || c.state === 0) return 0;
    return c.blocks[(x & 15) | ((z & 15) << 4) | (y << 8)];
  };

  World.prototype.getMeta = function (x, y, z) {
    if (y < 0 || y >= WH) return 0;
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    if (!c || c.state === 0) return 0;
    return c.meta[(x & 15) | ((z & 15) << 4) | (y << 8)];
  };

  World.prototype.isLoaded = function (x, y, z) {
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    return !!(c && c.state >= 1);
  };

  World.prototype.getLightRaw = function (x, y, z) {
    if (y < 0) return 0;
    if (y >= WH) return 0xF0;
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    if (!c || c.state === 0) return 0xF0;
    return c.light[(x & 15) | ((z & 15) << 4) | (y << 8)];
  };

  World.prototype.getSky = function (x, y, z) { return (this.getLightRaw(x, y, z) >> 4) & 15; };
  World.prototype.getBlockLight = function (x, y, z) { return this.getLightRaw(x, y, z) & 15; };

  World.prototype.setSky = function (x, y, z, v) {
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    if (!c || c.state === 0) return;
    var i = (x & 15) | ((z & 15) << 4) | (y << 8);
    c.light[i] = (c.light[i] & 0x0F) | (v << 4);
    c.dirty = true;
  };

  World.prototype.setBlockLight = function (x, y, z, v) {
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    if (!c || c.state === 0) return;
    var i = (x & 15) | ((z & 15) << 4) | (y << 8);
    c.light[i] = (c.light[i] & 0xF0) | v;
    c.dirty = true;
  };

  // ---------- Block setzen ----------
  World.prototype.setBlock = function (x, y, z, id, meta, opts) {
    if (y < 0 || y >= WH) return false;
    opts = opts || {};
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    if (!c || c.state === 0) return false;
    var lx = x & 15, lz = z & 15;
    var i = lx | (lz << 4) | (y << 8);
    var old = c.blocks[i];
    var oldMeta = c.meta[i];
    if (old === id && oldMeta === (meta | 0)) return false;

    c.blocks[i] = id;
    c.meta[i] = meta | 0;
    c.markModified(i, id, meta | 0);

    var oldOp = B.opacity(old), newOp = B.opacity(id);
    var oldEm = B.light(old), newEm = B.light(id);

    // Höhenkarte
    var col = lx | (lz << 4);
    var oldH = c.hmap[col];
    if (newOp > 0 && y + 1 > oldH) c.hmap[col] = y + 1;
    else if (oldOp > 0 && newOp === 0 && y + 1 === oldH) c.recalcHeight(lx, lz);

    if (c.state >= 2) {
      // ---- Sonnenlicht ----
      if (oldOp !== newOp) {
        this.updateSkyColumn(x, z);
      }
      // ---- Blocklicht ----
      if (oldEm > 0) {
        var cur = this.getBlockLight(x, y, z);
        this.setBlockLight(x, y, z, 0);
        this.lightRemB.push4(x, y, z, cur);
      }
      if (newOp > oldOp && newEm === 0) {
        var cb = this.getBlockLight(x, y, z);
        if (cb > 0) { this.setBlockLight(x, y, z, 0); this.lightRemB.push4(x, y, z, cb); }
      }
      if (newEm > 0) {
        this.setBlockLight(x, y, z, newEm);
        this.lightAddB.push3(x, y, z);
      } else if (newOp === 0) {
        // Licht von Nachbarn hereinlassen
        for (var d = 0; d < 6; d++) {
          var n = NEI[d];
          this.lightAddB.push3(x + n[0], y + n[1], z + n[2]);
          this.lightAdd.push3(x + n[0], y + n[1], z + n[2]);
        }
      }
    }

    // Flüssigkeit verschwunden -> Umgebung neu bewerten
    if (B.isLiquid(old) && !B.isLiquid(id)) this.wakeFluids(x, y, z, 7);

    this.markDirty(x, y, z);
    if (!opts.noUpdate) {
      this.scheduleUpdate(x, y, z);
      for (var k = 0; k < 6; k++) {
        var nn = NEI[k];
        this.scheduleUpdate(x + nn[0], y + nn[1], z + nn[2]);
      }
    }
    if (old !== id) {
      var tk = x + ',' + y + ',' + z;
      if (this.tileEntities[tk] && !opts.keepTile) delete this.tileEntities[tk];
    }
    // Beobachter hängen an der Veränderung selbst, nicht an der Aufladung –
    // sie müssen darum auch dann anspringen, wenn Redstone gerade rechnet.
    if (MC.Redstone && old !== id) MC.Redstone.beobachtet(this, x, y, z);
    // Redstone neu durchrechnen. Der Wächter in onChange verhindert, dass die
    // Blöcke, die dabei selbst gesetzt werden, eine neue Runde auslösen.
    if (MC.Redstone && !opts.noRedstone) MC.Redstone.onChange(this, x, y, z);
    return true;
  };

  World.prototype.setMetaOnly = function (x, y, z, meta) {
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    if (!c) return;
    var i = (x & 15) | ((z & 15) << 4) | (y << 8);
    if (c.meta[i] === meta) return;
    c.meta[i] = meta;
    c.markModified(i, c.blocks[i], meta);
    this.markDirty(x, y, z);
  };

  // Tür öffnen/schließen (beide Hälften). Gibt true zurück, wenn sich etwas
  // geändert hat – Spieler und Dorfbewohner benutzen denselben Weg.
  World.prototype.setDoorOpen = function (x, y, z, open) {
    var id = this.getBlock(x, y, z);
    var b = B.byId[id];
    if (!b || b.shape !== B.SHAPE_DOOR) return false;
    var m = this.getMeta(x, y, z);
    var lowerY = (m & 1) ? y - 1 : y;
    var lm = this.getMeta(x, lowerY, z);
    if (!!(lm & 8) === !!open) return false;
    var bit = open ? 8 : 0;
    this.setMetaOnly(x, lowerY, z, (lm & 7) | bit);
    if (this.getBlock(x, lowerY + 1, z) === id) {
      var um = this.getMeta(x, lowerY + 1, z);
      this.setMetaOnly(x, lowerY + 1, z, (um & 7) | bit);
    }
    return true;
  };

  World.prototype.isDoorOpen = function (x, y, z) {
    var id = this.getBlock(x, y, z);
    var b = B.byId[id];
    if (!b || b.shape !== B.SHAPE_DOOR) return false;
    var m = this.getMeta(x, y, z);
    var lowerY = (m & 1) ? y - 1 : y;
    return (this.getMeta(x, lowerY, z) & 8) !== 0;
  };

  World.prototype.markDirty = function (x, y, z) {
    var cx = x >> 4, cz = z >> 4;
    for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
      var c = this.chunks[(cx + dx) + ',' + (cz + dz)];
      if (c) c.dirty = true;
    }
  };

  var NEI = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  MC.NEI = NEI;
  // Wand, an der eine Leiter mit meta 0..3 hängt (relativ, horizontal)
  var LADDER_SUPPORT = B.SIDE_DIRS;
  MC.LADDER_SUPPORT = LADDER_SUPPORT;

  // ---------- Sonnenlicht-Spalte ----------
  World.prototype.updateSkyColumn = function (x, z) {
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    if (!c) return;
    var lx = x & 15, lz = z & 15;
    var light = 15;
    for (var y = WH - 1; y >= 0; y--) {
      var i = lx | (lz << 4) | (y << 8);
      var op = B.opacity(c.blocks[i]);
      if (op >= 15) light = 0;
      else if (op > 0) light = Math.max(0, light - op);
      var old = (c.light[i] >> 4) & 15;
      if (old !== light) {
        c.light[i] = (c.light[i] & 0x0F) | (light << 4);
        if (old > light) this.lightRem.push4(x, y, z, old);
        else this.lightAdd.push3(x, y, z);
        c.dirty = true;
      } else if (light > 0) {
        this.lightAdd.push3(x, y, z);
      }
      if (light === 0 && op >= 15) {
        // darunter alles 0 setzen
        for (var y2 = y - 1; y2 >= 0; y2--) {
          var i2 = lx | (lz << 4) | (y2 << 8);
          var o2 = (c.light[i2] >> 4) & 15;
          if (o2 !== 0) {
            c.light[i2] = c.light[i2] & 0x0F;
            this.lightRem.push4(x, y2, z, o2);
            c.dirty = true;
          }
        }
        break;
      }
    }
  };

  // ---------- Initiale Belichtung eines Chunks ----------
  World.prototype.lightChunk = function (c) {
    var cx = c.cx, cz = c.cz;
    var x, z, y, i;
    // 1) Sonnenlicht vertikal
    for (z = 0; z < CS; z++) {
      for (x = 0; x < CS; x++) {
        var light = 15;
        for (y = WH - 1; y >= 0; y--) {
          i = x | (z << 4) | (y << 8);
          var op = B.opacity(c.blocks[i]);
          if (op >= 15) light = 0;
          else if (op > 0) light = Math.max(0, light - op);
          c.light[i] = (c.light[i] & 0x0F) | (light << 4);
          if (light === 0) {
            for (var y2 = y - 1; y2 >= 0; y2--) c.light[x | (z << 4) | (y2 << 8)] &= 0x0F;
            break;
          }
        }
      }
    }
    // 2) Randzellen in die Ausbreitungs-Queue
    for (z = 0; z < CS; z++) {
      for (x = 0; x < CS; x++) {
        var wx = cx * CS + x, wz = cz * CS + z;
        var h = c.hmap[x | (z << 4)];
        var hmax = h;
        for (var d = 0; d < 4; d++) {
          var nx = wx + NEI[d < 2 ? d : d + 2][0];
          var nz = wz + NEI[d < 2 ? d : d + 2][2];
          var nh = this.heightAtWorld(nx, nz);
          if (nh > hmax) hmax = nh;
        }
        var top = Math.min(WH - 1, hmax);
        for (y = h; y <= top; y++) this.lightAdd.push3(wx, y, wz);
        if (h > 0) this.lightAdd.push3(wx, h, wz);
      }
    }
    // 3) Blocklicht-Quellen
    for (y = 0; y < WH; y++) {
      for (z = 0; z < CS; z++) {
        for (x = 0; x < CS; x++) {
          i = x | (z << 4) | (y << 8);
          var em = B.light(c.blocks[i]);
          if (em > 0) {
            c.light[i] = (c.light[i] & 0xF0) | em;
            this.lightAddB.push3(cx * CS + x, y, cz * CS + z);
          }
        }
      }
    }
    // 4) Nachbarränder erneut einspeisen (Licht kann von außen hereinfließen).
    //    Direkter Array-Zugriff, damit das billig bleibt.
    var SIDES = [
      { dcx: 1, dcz: 0, nl: 0, ol: 15 },    // Nachbar +X, dessen x=0 grenzt an unser x=15
      { dcx: -1, dcz: 0, nl: 15, ol: 0 },
      { dcx: 0, dcz: 1, nl: 0, ol: 15 },
      { dcx: 0, dcz: -1, nl: 15, ol: 0 }
    ];
    for (var s = 0; s < SIDES.length; s++) {
      var sd = SIDES[s];
      var nc = this.getChunk(cx + sd.dcx, cz + sd.dcz);
      if (!nc || nc.state < 2) continue;
      var horizontal = sd.dcz === 0;
      for (var a = 0; a < CS; a++) {
        var ni, oi, wxn, wzn;
        for (y = 0; y < WH; y++) {
          if (horizontal) {
            ni = sd.nl | (a << 4) | (y << 8);
            oi = sd.ol | (a << 4) | (y << 8);
            wxn = (cx + sd.dcx) * CS + sd.nl; wzn = cz * CS + a;
          } else {
            ni = a | (sd.nl << 4) | (y << 8);
            oi = a | (sd.ol << 4) | (y << 8);
            wxn = cx * CS + a; wzn = (cz + sd.dcz) * CS + sd.nl;
          }
          var nlv = nc.light[ni], olv = c.light[oi];
          if (((nlv >> 4) & 15) > (((olv >> 4) & 15) + 1)) this.lightAdd.push3(wxn, y, wzn);
          if ((nlv & 15) > ((olv & 15) + 1)) this.lightAddB.push3(wxn, y, wzn);
        }
      }
    }
    c.state = 2;
    c.dirty = true;
    // Licht sofort austreiben, damit das Mesh gleich korrekt ist
    this.processLight(30);
  };

  World.prototype.heightAtWorld = function (x, z) {
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    if (!c || c.state === 0) return 0;
    return c.hmap[(x & 15) | ((z & 15) << 4)];
  };

  // ---------- Licht-Ausbreitung (zeitbudgetiert) ----------
  // Direktzugriff auf Chunk + lokalen Index, ohne Stringschlüssel neu zu bauen
  World.prototype._chunkFor = function (x, z) {
    if (this._ccx === (x >> 4) && this._ccz === (z >> 4) && this._cc) return this._cc;
    var c = this.chunks[(x >> 4) + ',' + (z >> 4)];
    this._ccx = x >> 4; this._ccz = z >> 4; this._cc = c;
    return c;
  };

  World.prototype.processLight = function (msBudget) {
    var t0 = performance.now();
    var ops = 0, limit = 4096;
    var q, a, x, y, z, v, d, n, nx, ny, nz, c, i, cur, op, target;

    // ---- Entfernen: Sonnenlicht ----
    q = this.lightRem;
    while (q.head < q.tail) {
      a = q.a; x = a[q.head]; y = a[q.head + 1]; z = a[q.head + 2]; v = a[q.head + 3];
      q.head += 4;
      for (d = 0; d < 6; d++) {
        n = NEI[d];
        nx = x + n[0]; ny = y + n[1]; nz = z + n[2];
        if (ny < 0 || ny >= WH) continue;
        c = this._chunkFor(nx, nz);
        if (!c || c.state === 0) continue;
        i = (nx & 15) | ((nz & 15) << 4) | (ny << 8);
        cur = (c.light[i] >> 4) & 15;
        if (cur === 0) continue;
        if (cur < v || (n[1] === -1 && v === 15)) {
          c.light[i] &= 0x0F; c.dirty = true;
          this.lightRem.push4(nx, ny, nz, cur);
        } else {
          this.lightAdd.push3(nx, ny, nz);
        }
      }
      if (++ops > limit) { ops = 0; if (performance.now() - t0 > msBudget) return; }
    }

    // ---- Entfernen: Blocklicht ----
    q = this.lightRemB;
    while (q.head < q.tail) {
      a = q.a; x = a[q.head]; y = a[q.head + 1]; z = a[q.head + 2]; v = a[q.head + 3];
      q.head += 4;
      for (d = 0; d < 6; d++) {
        n = NEI[d];
        nx = x + n[0]; ny = y + n[1]; nz = z + n[2];
        if (ny < 0 || ny >= WH) continue;
        c = this._chunkFor(nx, nz);
        if (!c || c.state === 0) continue;
        i = (nx & 15) | ((nz & 15) << 4) | (ny << 8);
        cur = c.light[i] & 15;
        if (cur === 0) continue;
        if (cur < v) {
          c.light[i] &= 0xF0; c.dirty = true;
          this.lightRemB.push4(nx, ny, nz, cur);
        } else {
          this.lightAddB.push3(nx, ny, nz);
        }
      }
      if (++ops > limit) { ops = 0; if (performance.now() - t0 > msBudget) return; }
    }

    // ---- Ausbreiten: Sonnenlicht ----
    q = this.lightAdd;
    while (q.head < q.tail) {
      a = q.a; x = a[q.head]; y = a[q.head + 1]; z = a[q.head + 2];
      q.head += 3;
      c = this._chunkFor(x, z);
      if (!c || c.state === 0) continue;
      v = (c.light[(x & 15) | ((z & 15) << 4) | (y << 8)] >> 4) & 15;
      if (v <= 0) continue;
      for (d = 0; d < 6; d++) {
        n = NEI[d];
        nx = x + n[0]; ny = y + n[1]; nz = z + n[2];
        if (ny < 0 || ny >= WH) continue;
        var nc = this._chunkFor(nx, nz);
        if (!nc || nc.state === 0) continue;
        i = (nx & 15) | ((nz & 15) << 4) | (ny << 8);
        op = B.opacity(nc.blocks[i]);
        if (op >= 15) continue;
        target = (n[1] === -1 && v === 15 && op === 0) ? 15 : v - (op > 1 ? op : 1);
        if (target <= 0) continue;
        if (((nc.light[i] >> 4) & 15) < target) {
          nc.light[i] = (nc.light[i] & 0x0F) | (target << 4);
          nc.dirty = true;
          this.lightAdd.push3(nx, ny, nz);
        }
      }
      if (++ops > limit) { ops = 0; if (performance.now() - t0 > msBudget) return; }
    }

    // ---- Ausbreiten: Blocklicht ----
    q = this.lightAddB;
    while (q.head < q.tail) {
      a = q.a; x = a[q.head]; y = a[q.head + 1]; z = a[q.head + 2];
      q.head += 3;
      c = this._chunkFor(x, z);
      if (!c || c.state === 0) continue;
      v = c.light[(x & 15) | ((z & 15) << 4) | (y << 8)] & 15;
      if (v <= 0) continue;
      for (d = 0; d < 6; d++) {
        n = NEI[d];
        nx = x + n[0]; ny = y + n[1]; nz = z + n[2];
        if (ny < 0 || ny >= WH) continue;
        var nc2 = this._chunkFor(nx, nz);
        if (!nc2 || nc2.state === 0) continue;
        i = (nx & 15) | ((nz & 15) << 4) | (ny << 8);
        op = B.opacity(nc2.blocks[i]);
        if (op >= 15) continue;
        target = v - (op > 1 ? op : 1);
        if (target <= 0) continue;
        if ((nc2.light[i] & 15) < target) {
          nc2.light[i] = (nc2.light[i] & 0xF0) | target;
          nc2.dirty = true;
          this.lightAddB.push3(nx, ny, nz);
        }
      }
      if (++ops > limit) { ops = 0; if (performance.now() - t0 > msBudget) return; }
    }
  };

  World.prototype.lightPending = function () {
    return this.lightAdd.get() + this.lightAddB.get() + this.lightRem.get() + this.lightRemB.get();
  };

  // ---------- Block-Updates ----------
  World.prototype.scheduleUpdate = function (x, y, z, delay) {
    if (y < 0 || y >= WH) return;
    var k = x + ',' + y + ',' + z;
    if (this.updateSet[k]) return;
    this.updateSet[k] = true;
    this.blockUpdates.push({ x: x, y: y, z: z, t: this.ticks + (delay || 0), k: k });
  };

  World.prototype.processUpdates = function (max) {
    var n = 0;
    var keep = [];
    for (var i = 0; i < this.blockUpdates.length; i++) {
      var u = this.blockUpdates[i];
      if (u.t > this.ticks) { keep.push(u); continue; }
      if (n >= max) { keep.push(u); continue; }
      delete this.updateSet[u.k];
      this.doUpdate(u.x, u.y, u.z);
      n++;
    }
    this.blockUpdates = keep;
  };

  World.prototype.doUpdate = function (x, y, z) {
    var id = this.getBlock(x, y, z);
    if (id === 0) return;
    var b = B.byId[id];
    if (!b) return;

    // Redstoneleitung, Hebel, Knopf und Platte brauchen einen Halt darunter
    if (b.shape === B.SHAPE_WIRE || b.shape === B.SHAPE_PLATE || b.shape === B.SHAPE_REPEATER) {
      if (!B.isSolid(this.getBlock(x, y - 1, z))) { this.breakBlockNatural(x, y, z); return; }
    }
    // Antriebsschiene: das Strom-Bit im Meta hält die Textur aktuell. Der
    // Mesher kennt kein Redstone, also muss der Zustand im Block stehen.
    if (b.name === 'powered_rail' && MC.Redstone) {
      // Der ganze Lauf, nicht nur dieses Stueck: eine Quelle versorgt acht
      // weitere Schienen, und die muessen alle leuchten.
      MC.Redstone.antriebAktualisieren(this, x, y, z);
    }
    // Eine Schiene ohne Boden fällt — wie eine Fackel ohne Wand
    if (b.shape === B.SHAPE_RAIL && !B.isSolid(this.getBlock(x, y - 1, z))) {
      this.breakBlockNatural(x, y, z);
      return;
    }
    // Schild, Rahmen und Gemälde fallen mit ihrer Wand oder ihrem Boden
    if (b.shape === B.SHAPE_SIGN || b.shape === B.SHAPE_SIGN_WALL ||
        b.shape === B.SHAPE_FRAME || b.shape === B.SHAPE_PAINTING) {
      var self = this;
      if (!B.schildHaelt(function (gx, gy, gz) { return self.getBlock(gx, gy, gz); },
                         b.shape, x, y, z, this.getMeta(x, y, z))) {
        this.breakBlockNatural(x, y, z);
        return;
      }
    }
    if (b.shape === B.SHAPE_LEVER || b.shape === B.SHAPE_BUTTON) {
      var m = this.getMeta(x, y, z);
      if (m & 4) {
        if (!B.isSolid(this.getBlock(x, y - 1, z))) { this.breakBlockNatural(x, y, z); return; }
      } else {
        var sd = B.SIDE_DIRS[m & 3];
        if (!B.isOpaque(this.getBlock(x + sd[0], y, z + sd[1]))) { this.breakBlockNatural(x, y, z); return; }
      }
    }

    // Schwerkraft — nach unten (Sand, Kies, Amboss) wie nach oben (Gravitit).
    // Der Block verlässt die Welt und fliegt als Entität weiter; nur wenn
    // gerade zu viele unterwegs sind, springt er wie früher ein Feld weit.
    if (b.gravity || b.gravityUp) {
      var dir = b.gravityUp ? 1 : -1;
      var ny = y + dir;
      if (ny >= 0 && ny < WH) {
        var nb = this.getBlock(x, ny, z);
        if (nb === 0 || B.isReplaceable(nb)) {
          var m = this.getMeta(x, y, z);
          if (!MC.FallingBlock || !MC.FallingBlock.starte(this, x, y, z, id, m)) {
            this.setBlock(x, y, z, 0, 0);
            this.setBlock(x, ny, z, id, m);
          }
          return;
        }
      }
    }
    // Portalfläche zerfällt ohne Rahmen
    if (b.shape === B.SHAPE_PORTAL) {
      var frame = B.id(MC.Dim.Portal.KINDS[b.portal].frame);
      var axis = this.getMeta(x, y, z) & 1;
      var sides = axis ? [[0, 0, 1], [0, 0, -1]] : [[1, 0, 0], [-1, 0, 0]];
      sides.push([0, 1, 0], [0, -1, 0]);
      for (var s = 0; s < 4; s++) {
        var sn = sides[s];
        var nid = this.getBlock(x + sn[0], y + sn[1], z + sn[2]);
        if (nid !== id && nid !== frame) { MC.Dim.Portal.breakLinked(this, x, y, z); return; }
      }
    }
    // Pflanzenhalt
    if (B.needsSupport(id)) {
      var g = this.getBlock(x, y - 1, z);
      if (!B.validGround(id, g)) {
        this.breakBlockNatural(x, y, z);
        return;
      }
    }
    // Flüssigkeit
    if (b.liquid) {
      this.scheduleFluid(x, y, z, b.name === 'water' ? 5 : 15);
      return;
    }
    // Feuer: brennt aus, frisst brennbare Nachbarn
    if (b.shape === B.SHAPE_FIRE) {
      var age = this.getMeta(x, y, z);
      var fuel = false;
      for (var fd = 0; fd < 6; fd++) {
        var fn = NEI[fd];
        var nb2 = B.byId[this.getBlock(x + fn[0], y + fn[1], z + fn[2])];
        if (nb2 && nb2.flammable) { fuel = true; break; }
      }
      if (!fuel && age >= 3) { this.setBlock(x, y, z, 0, 0); return; }
      if (fuel && Math.random() < 0.28 && (!MC.Cmd || MC.Cmd.regel(MC.game, 'doFireTick'))) {
        var pick = NEI[(Math.random() * 6) | 0];
        var tx = x + pick[0], ty = y + pick[1], tz = z + pick[2];
        var tb = B.byId[this.getBlock(tx, ty, tz)];
        if (tb && tb.flammable) {
          this.setBlock(tx, ty, tz, 0, 0);
          if (this.getBlock(tx, ty + 1, tz) === 0) this.setBlock(tx, ty + 1, tz, b.id, 0);
        }
      }
      if (age >= 6) { this.setBlock(x, y, z, 0, 0); return; }
      this.setMetaOnly(x, y, z, age + 1);
      this.scheduleUpdate(x, y, z, 14 + ((Math.random() * 14) | 0));
      return;
    }
    // Fackel: Boden oder Wand, je nach Meta
    if (b.shape === B.SHAPE_TORCH) {
      var self = this;
      if (!B.torchSupported(function (bx, by, bz) { return self.getBlock(bx, by, bz); }, x, y, z, this.getMeta(x, y, z))) {
        this.breakBlockNatural(x, y, z);
        return;
      }
    }
    // Leiter braucht eine Wand dahinter
    if (b.shape === B.SHAPE_LADDER) {
      var ln = LADDER_SUPPORT[this.getMeta(x, y, z) & 3];
      if (!B.isOpaque(this.getBlock(x + ln[0], y, z + ln[1]))) { this.breakBlockNatural(x, y, z); return; }
    }
    // Tür: fehlt eine Hälfte, verschwindet die andere
    if (b.shape === B.SHAPE_DOOR) {
      var m = this.getMeta(x, y, z);
      var otherY = (m & 1) ? y - 1 : y + 1;
      if (this.getBlock(x, otherY, z) !== id) { this.setBlock(x, y, z, 0, 0); return; }
      if (!(m & 1) && !B.isSolid(this.getBlock(x, y - 1, z))) { this.breakBlockNatural(x, y, z); return; }
    }
    // Blätter zerfallen ohne Stamm in der Nähe
    if (b.name.indexOf('leaves_') === 0) {
      if (!this.hasLogNear(x, y, z, 4)) {
        if (Math.random() < 0.35) this.breakBlockNatural(x, y, z);
        else this.scheduleUpdate(x, y, z, 20);
      }
    }
  };

  World.prototype.hasLogNear = function (x, y, z, r) {
    for (var dy = -r; dy <= r; dy++)
      for (var dz = -r; dz <= r; dz++)
        for (var dx = -r; dx <= r; dx++) {
          var id = this.getBlock(x + dx, y + dy, z + dz);
          if (id && B.byId[id] && B.byId[id].name.indexOf('log_') === 0) return true;
        }
    return false;
  };

  World.prototype.breakBlockNatural = function (x, y, z) {
    var id = this.getBlock(x, y, z);
    if (!id) return;
    var b = B.byId[id];
    if (this.onBlockBreak) this.onBlockBreak(x, y, z, id, this.getMeta(x, y, z), null);
    this.setBlock(x, y, z, 0, 0);
  };

  // ---------- Flüssigkeiten ----------
  World.prototype.scheduleFluid = function (x, y, z, delay) {
    var k = x + ',' + y + ',' + z;
    if (this.fluidSet[k]) return;
    this.fluidSet[k] = true;
    this.fluidQueue.push({ x: x, y: y, z: z, t: this.ticks + delay, k: k });
  };

  // Wird eine Quelle entfernt, müssen alle davon gespeisten Blöcke neu prüfen,
  // ob sie noch Nachschub haben – sonst bleiben Pfützen stehen.
  World.prototype.wakeFluids = function (x, y, z, r) {
    var rv = 3;
    for (var dy = -rv; dy <= rv; dy++) {
      for (var dz = -r; dz <= r; dz++) {
        for (var dx = -r; dx <= r; dx++) {
          var id = this.getBlock(x + dx, y + dy, z + dz);
          if (id === 0) continue;
          var b = B.byId[id];
          if (b && b.liquid) this.scheduleFluid(x + dx, y + dy, z + dz, 2 + ((Math.abs(dx) + Math.abs(dz)) >> 1));
        }
      }
    }
  };

  World.prototype.processFluids = function (max) {
    var keep = [], n = 0;
    for (var i = 0; i < this.fluidQueue.length; i++) {
      var f = this.fluidQueue[i];
      if (f.t > this.ticks || n >= max) { keep.push(f); continue; }
      delete this.fluidSet[f.k];
      this.doFluid(f.x, f.y, f.z);
      n++;
    }
    this.fluidQueue = keep;
  };

  function lvlOf(meta) { return meta === 8 ? 0 : meta; }

  // Wirksamer Fließlevel eines Nachbarn. Eine Fallmarke (8) zählt nur dann als
  // voller Block, wenn wirklich Flüssigkeit darüber steht – sonst würde ein
  // übriggebliebener Marker wie eine Quelle wirken und die Pfütze am Leben halten.
  World.prototype.effectiveLevel = function (x, y, z, id) {
    // Eine geflutete Pflanze hält im Original eine Quelle – für alles, was hier
    // gerechnet wird, ist sie damit ein voller Wasserblock mit Level 0.
    if (id === B.id('water') && B.istGeflutet(this.getBlock(x, y, z), this.getMeta(x, y, z))) return 0;
    var m = this.getMeta(x, y, z);
    if (m === 0) return 0;
    if (m === 8) return this.getBlock(x, y + 1, z) === id ? 0 : 9;
    return m;
  };

  // Zählt die Zelle für das Fließen als diese Flüssigkeit?
  World.prototype.istFluessig = function (x, y, z, id) {
    var bid = this.getBlock(x, y, z);
    if (bid === id) return true;
    return id === B.id('water') && B.istGeflutet(bid, this.getMeta(x, y, z));
  };

  // Wasser läuft in eine flutbare Pflanze hinein, statt sie wegzureißen oder
  // vor ihr stehenzubleiben. Gibt true zurück, wenn hier geflutet wurde.
  World.prototype.flute = function (x, y, z, id) {
    if (id !== B.id('water')) return false;
    var bid = this.getBlock(x, y, z);
    if (!B.kannFluten(bid)) return false;
    var m = this.getMeta(x, y, z);
    if (m & B.NASS_BIT) return false;
    this.setMetaOnly(x, y, z, m | B.NASS_BIT);
    return true;
  };

  // Läuft das Wasser ab, wird die Pflanze wieder trocken.
  World.prototype.entwaessere = function (x, y, z) {
    var bid = this.getBlock(x, y, z);
    var m = this.getMeta(x, y, z);
    if (!B.istGeflutet(bid, m)) return false;
    this.setMetaOnly(x, y, z, m & ~B.NASS_BIT);
    return true;
  };

  // Eine geflutete Pflanze ist eine Quelle: sie gibt nach unten und zur Seite
  // weiter. Und sie prüft, ob sie noch Anschluss hat – sonst wird sie trocken,
  // sobald man das Wasser um sie herum wegnimmt.
  World.prototype.tickGeflutet = function (x, y, z) {
    var wid = B.id('water');
    var halt = false;
    if (this.getBlock(x, y + 1, z) === wid) halt = true;
    if (!halt) {
      for (var q = 0; q < 4; q++) {
        var nx = x + HOR[q][0], nz = z + HOR[q][1];
        if (!this.istFluessig(nx, y, nz, wid)) continue;
        if (this.effectiveLevel(nx, y, nz, wid) < 7) { halt = true; break; }
      }
    }
    if (!halt) {
      this.entwaessere(x, y, z);
      for (var r = 0; r < 4; r++) this.scheduleFluid(x + HOR[r][0], y, z + HOR[r][1], 5);
      this.scheduleFluid(x, y - 1, z, 5);
      this.scheduleFluid(x, y + 1, z, 5);
      return;
    }
    // Weitergeben – erst nach unten, sonst zur Seite
    var unten = this.getBlock(x, y - 1, z);
    var ub = B.byId[unten];
    if (y > 0) {
      if (B.kannFluten(unten)) {
        if (this.flute(x, y - 1, z, wid)) this.scheduleFluid(x, y - 1, z, 5);
        return;
      }
      if (unten === 0 || B.spuehltWeg(unten) || (ub && ub.replaceable && !ub.liquid)) {
        if (unten !== 0 && this.onBlockBreak) this.onBlockBreak(x, y - 1, z, unten, 0, null);
        this.setBlock(x, y - 1, z, wid, 8);
        this.scheduleFluid(x, y - 1, z, 5);
        return;
      }
      if (unten === wid) return;
    }
    for (var h = 0; h < 4; h++) {
      var hx = x + HOR[h][0], hz = z + HOR[h][1];
      var tid = this.getBlock(hx, y, hz);
      var tb = B.byId[tid];
      if (B.kannFluten(tid)) {
        if (this.flute(hx, y, hz, wid)) this.scheduleFluid(hx, y, hz, 5);
      } else if (tid === 0 || B.spuehltWeg(tid) || (tb && tb.replaceable && !tb.liquid)) {
        if (tid !== 0 && this.onBlockBreak) this.onBlockBreak(hx, y, hz, tid, 0, null);
        this.setBlock(hx, y, hz, wid, 1);
        this.scheduleFluid(hx, y, hz, 5);
      }
    }
  };

  World.prototype.doFluid = function (x, y, z) {
    var id = this.getBlock(x, y, z);
    var b = B.byId[id];
    // Eine geflutete Pflanze verhält sich wie eine Wasserquelle: sie verteilt
    // weiter, und sie trocknet, wenn ringsum das Wasser verschwindet.
    if (B.istGeflutet(id, this.getMeta(x, y, z))) {
      this.tickGeflutet(x, y, z);
      return;
    }
    if (!b || !b.liquid) return;
    var isWater = b.name === 'water';
    var maxSpread = isWater ? 7 : 3;
    var delay = isWater ? 5 : 20;
    var meta = this.getMeta(x, y, z);

    // Lava trifft Wasser -> Stein/Obsidian
    if (!isWater) {
      for (var d = 0; d < 6; d++) {
        var n0 = NEI[d];
        var nb = this.getBlock(x + n0[0], y + n0[1], z + n0[2]);
        if (nb === B.id('water')) {
          this.setBlock(x, y, z, meta === 0 ? B.id('obsidian') : B.id('cobblestone'), 0);
          if (this.onFizz) this.onFizz(x, y, z);
          return;
        }
      }
    } else {
      for (var d1 = 0; d1 < 6; d1++) {
        var n1 = NEI[d1];
        var nx1 = x + n1[0], ny1 = y + n1[1], nz1 = z + n1[2];
        if (this.getBlock(nx1, ny1, nz1) === B.id('lava')) {
          var lm = this.getMeta(nx1, ny1, nz1);
          this.setBlock(nx1, ny1, nz1, lm === 0 ? B.id('obsidian') : B.id('cobblestone'), 0);
          if (this.onFizz) this.onFizz(nx1, ny1, nz1);
        }
      }
    }

    // Unendliche Quelle: liegen zwei Quellblöcke waagerecht an, wird auch dieses
    // Feld zur Quelle. Damit lässt sich ein Becken bauen, aus dem man beliebig
    // oft schöpfen kann – im Original geht das nur mit Wasser, nicht mit Lava.
    if (isWater && meta !== 0) {
      var quellen = 0;
      for (var q = 0; q < 4; q++) {
        if (this.getBlock(x + HOR[q][0], y, z + HOR[q][1]) !== id) continue;
        if (this.getMeta(x + HOR[q][0], y, z + HOR[q][1]) === 0) quellen++;
      }
      if (quellen >= 2) {
        this.setMetaOnly(x, y, z, 0);
        meta = 0;
        for (var w2 = 0; w2 < 4; w2++) this.scheduleFluid(x + HOR[w2][0], y, z + HOR[w2][1], delay);
        this.scheduleFluid(x, y - 1, z, delay);
      }
    }

    // Nachschub prüfen (Quellen bleiben)
    if (meta !== 0) {
      var aboveSame = this.getBlock(x, y + 1, z) === id;
      var newMeta;
      if (aboveSame) newMeta = 8;
      else {
        var best = 99;
        for (var k = 0; k < 4; k++) {
          var h = HOR[k];
          if (this.getBlock(x + h[0], y, z + h[1]) === id) {
            var lm2 = this.effectiveLevel(x + h[0], y, z + h[1], id);
            if (lm2 < best) best = lm2;
          }
        }
        newMeta = best + 1;
      }
      // 8 = fallende Flüssigkeit (voller Block) und damit immer gültig
      if (newMeta !== 8 && newMeta > maxSpread) {
        this.setBlock(x, y, z, 0, 0);
        // Nachbarn zwingend neu bewerten, sonst bleibt die Kaskade stehen und
        // zurückgebliebene Fallmarken wirken wie Quellen
        for (var rk = 0; rk < 4; rk++) this.scheduleFluid(x + HOR[rk][0], y, z + HOR[rk][1], delay);
        this.scheduleFluid(x, y - 1, z, delay);
        this.scheduleFluid(x, y + 1, z, delay);
        return;
      }
      if (newMeta !== meta) {
        this.setMetaOnly(x, y, z, newMeta);
        meta = newMeta;
        for (var kk = 0; kk < 4; kk++) this.scheduleFluid(x + HOR[kk][0], y, z + HOR[kk][1], delay);
        this.scheduleFluid(x, y - 1, z, delay);
        this.scheduleFluid(x, y + 1, z, delay);
      }
    } else if (this.getBlock(x, y + 1, z) === id) {
      // Quelle unter fließendem Wasser: das darüber muss nachrechnen
      this.scheduleFluid(x, y + 1, z, delay);
    }

    // Fließen. Grundregel: seitlich wird nur verteilt, wenn es nach unten nicht
    // weitergeht – sonst entstehen Wasserflächen mitten in der Luft.
    var belowId = this.getBlock(x, y - 1, z);
    var belowB = B.byId[belowId];
    if (y > 0) {
      if (B.kannFluten(belowId)) {
        if (this.flute(x, y - 1, z, id)) this.scheduleFluid(x, y - 1, z, delay);
        return;
      }
      if (belowId === 0 || B.spuehltWeg(belowId) || (belowB && belowB.replaceable && !belowB.liquid)) {
        if (belowId !== 0 && this.onBlockBreak) this.onBlockBreak(x, y - 1, z, belowId, this.getMeta(x, y - 1, z), null);
        this.setBlock(x, y - 1, z, id, 8);
        this.scheduleFluid(x, y - 1, z, delay);
        return;
      }
      if (belowId === id) {
        var bm = this.getMeta(x, y - 1, z);
        if (bm !== 0 && bm !== 8) {
          // darunter nur teilgefüllt -> auffüllen statt seitlich auszuweichen
          this.setMetaOnly(x, y - 1, z, 8);
          this.scheduleFluid(x, y - 1, z, delay);
          for (var sk = 0; sk < 4; sk++) this.scheduleFluid(x + HOR[sk][0], y - 1, z + HOR[sk][1], delay);
          return;
        }
        if (bm === 8) return;   // Fallstrecke geht darunter weiter
        // bm === 0: darunter ist eine Quelle, hier darf seitlich verteilt werden
      }
    }

    // eigener Level ebenfalls "effektiv": eine ungültige Fallmarke verteilt nichts mehr
    var lvl = this.effectiveLevel(x, y, z, id);
    if (lvl >= maxSpread) return;
    for (var h2 = 0; h2 < 4; h2++) {
      var hx = x + HOR[h2][0], hz = z + HOR[h2][1];
      var tid = this.getBlock(hx, y, hz);
      var tb = B.byId[tid];
      if (B.kannFluten(tid)) {
        // Seegras füllt sich auf, statt weggerissen zu werden
        if (this.flute(hx, y, hz, id)) this.scheduleFluid(hx, y, hz, delay);
      } else if (tid === 0 || B.spuehltWeg(tid) || (tb && tb.replaceable && !tb.liquid)) {
        if (tid !== 0 && this.onBlockBreak) this.onBlockBreak(hx, y, hz, tid, 0, null);
        this.setBlock(hx, y, hz, id, lvl + 1);
        this.scheduleFluid(hx, y, hz, delay);
      } else if (tid === id) {
        if (this.effectiveLevel(hx, y, hz, id) > lvl + 1) {
          this.setMetaOnly(hx, y, hz, lvl + 1);
          this.scheduleFluid(hx, y, hz, delay);
        }
      }
    }
  };

  var HOR = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // ---------- Zufalls-Ticks (Pflanzenwachstum, Gras) ----------
  World.prototype.randomTick = function (px, pz, count) {
    var grassId = B.id('grass'), dirtId = B.id('dirt'), farm = B.id('farmland'), wheat = B.id('wheat');
    var wartId = B.id('nether_wart'), soulId = B.id('soul_sand');
    for (var n = 0; n < count; n++) {
      var cx = (px >> 4) + ((Math.random() * 7) | 0) - 3;
      var cz = (pz >> 4) + ((Math.random() * 7) | 0) - 3;
      var c = this.getChunk(cx, cz);
      if (!c || c.state < 2) continue;
      for (var t = 0; t < 3; t++) {
        var x = (Math.random() * CS) | 0, z = (Math.random() * CS) | 0, y = (Math.random() * WH) | 0;
        var i = x | (z << 4) | (y << 8);
        var id = c.blocks[i];
        var wx = cx * CS + x, wz = cz * CS + z;
        if (id === grassId) {
          // Gras vergeht unter Blöcken
          if (B.opacity(this.getBlock(wx, y + 1, wz)) >= 15) this.setBlock(wx, y, wz, dirtId, 0);
        } else if (id === dirtId) {
          // Gras breitet sich aus
          if (this.getBlock(wx, y + 1, wz) === 0 && this.getSky(wx, y + 1, wz) > 8) {
            for (var d = 0; d < 4; d++) {
              if (this.getBlock(wx + HOR[d][0], y, wz + HOR[d][1]) === grassId) {
                this.setBlock(wx, y, wz, grassId, 0); break;
              }
            }
          }
        } else if (id === wheat) {
          var m = c.meta[i];
          if (m < 7 && this.getSky(wx, y, wz) >= 9) this.setMetaOnly(wx, y, wz, m + 1);
        } else if (id === wartId) {
          // Nethergewächs braucht kein Licht, nur Seelensand darunter
          var wm = c.meta[i];
          if (wm < 3 && this.getBlock(wx, y - 1, wz) === soulId && Math.random() < 0.35) {
            this.setMetaOnly(wx, y, wz, wm + 1);
          }
        } else if (id === farm) {
          // trocknet ohne Wasser
          if (!this.waterNear(wx, y, wz, 4) && Math.random() < 0.2) this.setBlock(wx, y, wz, dirtId, 0);
        } else if (B.isLiquid(id)) {
          // Sicherheitsnetz: eine "Fallmarke" ohne Wasser darüber ist ungültig.
          // So löst sich stehengebliebenes Wasser auch dann auf, wenn eine
          // Aktualisierungskette einmal abgerissen ist.
          if (c.meta[i] !== 0 && this.getBlock(wx, y + 1, wz) !== id) this.scheduleFluid(wx, y, wz, 1);
        } else if (id && B.byId[id] && B.byId[id].name.indexOf('sapling_') === 0) {
          if (Math.random() < 0.12 && this.getSky(wx, y, wz) >= 9) this.growTree(wx, y, wz, B.byId[id].name.replace('sapling_', ''));
        }
      }
    }
  };

  World.prototype.waterNear = function (x, y, z, r) {
    for (var dx = -r; dx <= r; dx++) for (var dz = -r; dz <= r; dz++) {
      if (this.getBlock(x + dx, y, z + dz) === B.id('water')) return true;
      if (this.getBlock(x + dx, y + 1, z + dz) === B.id('water')) return true;
    }
    return false;
  };

  World.prototype.growTree = function (x, y, z, type) {
    var self = this;
    this.setBlock(x, y, z, 0, 0);
    this.gen.tree(x, y, z, type, function (bx, by, bz, id, over) {
      var cur = self.getBlock(bx, by, bz);
      if (!over && cur !== 0 && !(B.byId[cur] && B.byId[cur].name.indexOf('leaves') === 0)) return;
      if (over || cur === 0 || B.isReplaceable(cur)) self.setBlock(bx, by, bz, id, 0);
    }, x, z);
  };

  // ---------- Raycast ----------
  World.prototype.raycast = function (ox, oy, oz, dx, dy, dz, maxDist, includeLiquid) {
    var x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    var stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    var tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
    var tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
    var tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
    var tMaxX = dx === 0 ? Infinity : ((dx > 0 ? (x + 1 - ox) : (ox - x)) / Math.abs(dx));
    var tMaxY = dy === 0 ? Infinity : ((dy > 0 ? (y + 1 - oy) : (oy - y)) / Math.abs(dy));
    var tMaxZ = dz === 0 ? Infinity : ((dz > 0 ? (z + 1 - oz) : (oz - z)) / Math.abs(dz));
    var face = -1;
    var t = 0;

    var self = this;
    function testCell(bx, by, bz) {
      var id = self.getBlock(bx, by, bz);
      if (id === 0) return null;
      var bb = B.byId[id];
      if (!includeLiquid && bb.liquid) return null;
      if (bb.shape === B.SHAPE_NONE) return null;
      var box = B.selBox(id, self.getMeta(bx, by, bz));
      // Flüssigkeiten haben keine Auswahlbox – für den Eimer brauchen wir trotzdem eine
      if (!box && includeLiquid && bb.liquid) box = [0, 0, 0, 1, 1, 1];
      if (!box) return null;
      var hi = rayBox(ox, oy, oz, dx, dy, dz,
        bx + box[0], by + box[1], bz + box[2], bx + box[3], by + box[4], bz + box[5]);
      if (!hi || hi.t > maxDist) return null;
      return { x: bx, y: by, z: bz, id: id, face: hi.face, dist: hi.t,
               hx: ox + dx * hi.t, hy: oy + dy * hi.t, hz: oz + dz * hi.t };
    }

    for (var it = 0; it < 512 && t <= maxDist; it++) {
      var hit = testCell(x, y, z);
      if (hit) return hit;
      // Zäune und Zauntore sind 1,5 Blöcke hoch und ragen in die Zelle darüber.
      // Ohne diesen Blick nach unten trifft man ihre obere Hälfte nie.
      var lower = B.byId[this.getBlock(x, y - 1, z)];
      if (lower && (lower.shape === B.SHAPE_FENCE || lower.shape === B.SHAPE_GATE)) {
        hit = testCell(x, y - 1, z);
        if (hit) return hit;
      }
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; face = stepX > 0 ? 1 : 0; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 5 : 4; }
      } else {
        if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; face = stepY > 0 ? 3 : 2; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = stepZ > 0 ? 5 : 4; }
      }
      if (y < 0 || y >= WH) break;
    }
    return null;
  };

  // Strahl gegen AABB; face: 0=+X,1=-X,2=+Y,3=-Y,4=+Z,5=-Z (Normale zeigt zum Betrachter)
  function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
    var tmin = -Infinity, tmax = Infinity, face = -1;
    var t1, t2;
    if (dx !== 0) {
      t1 = (x0 - ox) / dx; t2 = (x1 - ox) / dx;
      var f1 = dx > 0 ? 1 : 0;
      if (t1 > t2) { var tt = t1; t1 = t2; t2 = tt; f1 = dx > 0 ? 1 : 0; }
      if (t1 > tmin) { tmin = t1; face = dx > 0 ? 1 : 0; }
      if (t2 < tmax) tmax = t2;
    } else if (ox < x0 || ox > x1) return null;
    if (dy !== 0) {
      t1 = (y0 - oy) / dy; t2 = (y1 - oy) / dy;
      if (t1 > t2) { var t3 = t1; t1 = t2; t2 = t3; }
      if (t1 > tmin) { tmin = t1; face = dy > 0 ? 3 : 2; }
      if (t2 < tmax) tmax = t2;
    } else if (oy < y0 || oy > y1) return null;
    if (dz !== 0) {
      t1 = (z0 - oz) / dz; t2 = (z1 - oz) / dz;
      if (t1 > t2) { var t4 = t1; t1 = t2; t2 = t4; }
      if (t1 > tmin) { tmin = t1; face = dz > 0 ? 5 : 4; }
      if (t2 < tmax) tmax = t2;
    } else if (oz < z0 || oz > z1) return null;
    if (tmax < Math.max(tmin, 0)) return null;
    if (tmin < 0) return null;
    return { t: tmin, face: face };
  }
  MC.rayBox = rayBox;

  // ---------- Kollisionsboxen ----------
  World.prototype.collectBoxes = function (x0, y0, z0, x1, y1, z1, out) {
    out.length = 0;
    var ix0 = Math.floor(x0), ix1 = Math.floor(x1);
    var iy0 = Math.floor(y0), iy1 = Math.floor(y1);
    var iz0 = Math.floor(z0), iz1 = Math.floor(z1);
    // Eine Ebene tiefer mitnehmen: Zäune ragen 1,5 Blöcke hoch über ihren eigenen
    // Block hinaus. Ohne diese Zeile hat der Sprung über einen Zaun einfach nichts
    // getroffen, weil der Zaunblock gar nicht erst eingesammelt wurde.
    for (var y = iy0 - 1; y <= iy1; y++) {
      if (y < 0 || y >= WH) continue;
      for (var z = iz0; z <= iz1; z++) {
        for (var x = ix0; x <= ix1; x++) {
          var id = this.getBlock(x, y, z);
          if (id === 0) continue;
          var boxes = B.boxes(id, this.getMeta(x, y, z));
          if (!boxes) continue;
          for (var i = 0; i < boxes.length; i++) {
            var b = boxes[i];
            out.push([x + b[0], y + b[1], z + b[2], x + b[3], y + b[4], z + b[5]]);
          }
        }
      }
    }
    return out;
  };

  // ---------- Tick ----------
  World.prototype.update = function (dt, px, py, pz) {
    // doDaylightCycle: steht die Regel auf false, bleibt die Zeit stehen
    if (!MC.Cmd || MC.Cmd.regel(MC.game, 'doDaylightCycle')) {
      this.time += dt / this.dayLength;
      // Ein Tageszähler neben der Tageszeit. Daran hängt der Nachschub im Dorf:
      // die Tageszeit allein taugt nicht, sie läuft ja immer wieder von vorn.
      if (this.time >= 1) { this.time -= 1; this.tagZaehler = (this.tagZaehler || 0) + 1; }
    }

    this.tickTimer += dt;
    var maxTicks = 0;
    while (this.tickTimer >= 0.05 && maxTicks < 5) {
      this.tickTimer -= 0.05;
      this.ticks++;
      maxTicks++;
      this.processFluids(140);
      this.processUpdates(220);
      if (MC.Redstone) MC.Redstone.tickPlan(this);
      if ((this.ticks & 3) === 0) this.randomTick(px | 0, pz | 0, 8);
    }
    this.processLight(6);
  };

  // Sonnenhelligkeit 0..1 (Nachts ~0.12).
  // Im Nether gibt es keine Sonne, im Aether geht sie nie unter.
  World.prototype.daylight = function () {
    if (this.dim === 'nether') return 0.34;
    if (this.dim === 'aether') return 1;
    if (this.dim === 'the_end') return 0.85;
    var t = this.time;
    var a = Math.cos((t - 0.5) * Math.PI * 2) * 0.5 + 0.5; // 1 = Mittag
    var d = U.clamp((a - 0.15) / 0.5, 0, 1);
    return 0.13 + d * 0.87;
  };

  World.prototype.isNight = function () {
    if (this.dim !== 'overworld') return false;
    return this.time > 0.79 || this.time < 0.21;
  };

  World.prototype.tileEntity = function (x, y, z, create) {
    var k = x + ',' + y + ',' + z;
    var te = this.tileEntities[k];
    if (!te && create) { te = create(); te.x = x; te.y = y; te.z = z; this.tileEntities[k] = te; }
    return te || null;
  };

})();
