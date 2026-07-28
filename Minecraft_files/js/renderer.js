/* ============================================================
   renderer.js  -  WebGL2-Renderer: Himmel, Chunks, Entities, Partikel, Hand
   ============================================================ */
(function () {
  'use strict';

  var U = MC.U, T = MC.Textures, B = MC.Blocks, M4 = U.M4;
  var CS = MC.CHUNK_SIZE, WH = MC.WORLD_HEIGHT;
  var FPV = 9;

  // kachelbare Wolkentextur nachtragen
  if (!T.has('clouds')) {
    T.add('clouds', function (g) {
      g.fill([255, 255, 255], 0);
      var r = MC.U.rng(9182);
      for (var i = 0; i < 5; i++) {
        var x = (r() * 16) | 0, y = (r() * 16) | 0;
        var w = 3 + ((r() * 7) | 0), h = 3 + ((r() * 6) | 0);
        for (var dy = 0; dy < h; dy++) for (var dx = 0; dx < w; dx++) {
          g.set((x + dx) & 15, (y + dy) & 15, [255, 255, 255], 215);
        }
      }
    });
  }

  // ============================================================
  //  Shader
  // ============================================================
  var VS_MAIN = [
    '#version 300 es',
    'in vec3 aPos; in vec2 aUV; in float aLayer; in float aBl; in float aSl; in float aShade;',
    'uniform mat4 uMVP; uniform vec3 uCam; uniform float uDaylight;',
    'uniform float uFogNear; uniform float uFogFar;',
    'out vec3 vUVW; out float vLight; out float vFog; out float vShade;',
    'void main(){',
    '  gl_Position = uMVP * vec4(aPos,1.0);',
    '  vUVW = vec3(aUV, aLayer);',
    '  float f = max(aBl, aSl*uDaylight);',
    '  vLight = 0.085 + 0.915 * pow(f, 0.82);',
    '  vShade = aShade;',
    '  float d = distance(aPos, uCam);',
    '  vFog = clamp((d - uFogNear)/max(0.001,(uFogFar-uFogNear)), 0.0, 1.0);',
    '}'
  ].join('\n');

  var FS_MAIN = [
    '#version 300 es',
    'precision highp float; precision highp sampler2DArray;',
    'in vec3 vUVW; in float vLight; in float vFog; in float vShade;',
    'uniform sampler2DArray uTex; uniform vec3 uFogColor; uniform vec4 uTint; uniform float uAlphaTest;',
    'out vec4 outColor;',
    'void main(){',
    '  vec4 c = texture(uTex, vUVW);',
    '  if (c.a < uAlphaTest) discard;',
    '  c.rgb *= vLight * vShade;',
    '  c *= uTint;',
    '  c.rgb = mix(c.rgb, uFogColor, vFog);',
    '  outColor = c;',
    '}'
  ].join('\n');

  var VS_SKY = [
    '#version 300 es',
    'in vec2 aPos; out vec2 vNdc;',
    'void main(){ vNdc = aPos; gl_Position = vec4(aPos, 1.0, 1.0); }'
  ].join('\n');

  var FS_SKY = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vNdc; out vec4 outColor;',
    'uniform mat4 uInvVP; uniform vec3 uCamPos;',
    'uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;',
    'uniform float uNight; uniform float uUnderwater; uniform vec3 uWaterColor;',
    'float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.71,0.113,0.419)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
    'void main(){',
    '  vec4 a = uInvVP * vec4(vNdc, -1.0, 1.0); a /= a.w;',
    '  vec4 b = uInvVP * vec4(vNdc,  1.0, 1.0); b /= b.w;',
    '  vec3 dir = normalize(b.xyz - a.xyz);',
    '  float up = clamp(dir.y*0.5+0.5, 0.0, 1.0);',
    '  vec3 col = mix(uHorizon, uZenith, pow(clamp(dir.y,0.0,1.0), 0.55));',
    '  if (dir.y < 0.0) col = mix(uHorizon, uHorizon*0.72, clamp(-dir.y*2.0,0.0,1.0));',
    '  // Sonne & Mond als eckige Scheiben (Minecraft-Look)',
    '  vec3 sunT = normalize(cross(vec3(0.0,1.0,0.0), uSunDir) + vec3(0.0,0.0,0.0001));',
    '  vec3 sunB = normalize(cross(uSunDir, sunT));',
    '  float sd = dot(dir, uSunDir);',
    '  if (sd > 0.95) {',
    '    vec2 q = vec2(dot(dir,sunT), dot(dir,sunB)) / max(sd, 0.001);',
    '    if (abs(q.x) < 0.045 && abs(q.y) < 0.045) col = mix(col, uSunColor*1.35, 1.0);',
    '  }',
    '  col += uSunColor * pow(max(sd,0.0), 30.0) * 0.10;',
    '  float md = dot(dir, -uSunDir);',
    '  if (md > 0.97) {',
    '    vec2 qm = vec2(dot(dir,sunT), dot(dir,sunB)) / max(md, 0.001);',
    '    if (abs(qm.x) < 0.028 && abs(qm.y) < 0.028) col = mix(col, vec3(0.92,0.94,1.0), 0.4 + 0.6*uNight);',
    '  }',
    '  // Sterne',
    '  if (uNight > 0.02 && dir.y > 0.0) {',
    '    vec3 q = floor(dir*140.0);',
    '    float h = hash(q);',
    '    if (h > 0.9965) col += vec3(1.0) * uNight * (0.6+0.4*sin(h*100.0));',
    '  }',
    '  col = mix(col, uWaterColor, uUnderwater);',
    '  outColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  var VS_LINE = [
    '#version 300 es',
    'in vec3 aPos; uniform mat4 uMVP;',
    'void main(){ gl_Position = uMVP * vec4(aPos,1.0); }'
  ].join('\n');
  var FS_LINE = [
    '#version 300 es',
    'precision highp float; uniform vec4 uColor; out vec4 outColor;',
    'void main(){ outColor = uColor; }'
  ].join('\n');

  // ============================================================
  //  Renderer
  // ============================================================
  function Renderer(canvas) {
    this.canvas = canvas;
    var gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: true, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false
    });
    if (!gl) throw new Error('WebGL2 wird von diesem Browser nicht unterstützt.');
    this.gl = gl;

    this.progMain = MC.GL.program(gl, VS_MAIN, FS_MAIN);
    this.progSky = MC.GL.program(gl, VS_SKY, FS_SKY);
    this.progLine = MC.GL.program(gl, VS_LINE, FS_LINE);

    this.buildTexture();
    this.buildIndexBuffer(120000);

    // Vollbild-Quad für den Himmel
    this.skyVao = gl.createVertexArray();
    gl.bindVertexArray(this.skyVao);
    var sb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.progSky.a.aPos);
    gl.vertexAttribPointer(this.progSky.a.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // dynamische Puffer
    this.dynBuf = gl.createBuffer();
    this.dynVao = this.makeVao(this.dynBuf);
    this.dynData = new Float32Array(FPV * 4 * 4096);
    this.dynCap = 0;

    this.lineBuf = gl.createBuffer();
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enableVertexAttribArray(this.progLine.a.aPos);
    gl.vertexAttribPointer(this.progLine.a.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.lineData = new Float32Array(2048);

    this.proj = M4.create();
    this.view = M4.create();
    this.vp = M4.create();
    this.invVP = M4.create();
    this.tmp = M4.create();
    this.frustum = U.extractFrustum(M4.create(), []);

    this.renderDistance = 7;
    this.fov = 70;
    this.chunkMeshes = {};
    this.stats = { chunks: 0, quads: 0, entities: 0 };

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
  }
  MC.Renderer = Renderer;

  Renderer.prototype.buildTexture = function () {
    var gl = this.gl;
    var n = T.count();
    var buf = T.buildBuffer();
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, T.TILE, T.TILE, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    var ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D_ARRAY, ext.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    this.texArray = tex;
  };

  Renderer.prototype.buildIndexBuffer = function (quads) {
    var gl = this.gl;
    if (this.indexQuads >= quads) return;
    var arr = new Uint32Array(quads * 6);
    for (var i = 0; i < quads; i++) {
      var o = i * 4;
      arr[i * 6] = o; arr[i * 6 + 1] = o + 1; arr[i * 6 + 2] = o + 2;
      arr[i * 6 + 3] = o; arr[i * 6 + 4] = o + 2; arr[i * 6 + 5] = o + 3;
    }
    if (!this.indexBuffer) this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    this.indexQuads = quads;
  };

  Renderer.prototype.makeVao = function (buffer) {
    var gl = this.gl, p = this.progMain;
    var vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    var stride = FPV * 4;
    gl.enableVertexAttribArray(p.a.aPos); gl.vertexAttribPointer(p.a.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(p.a.aUV); gl.vertexAttribPointer(p.a.aUV, 2, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(p.a.aLayer); gl.vertexAttribPointer(p.a.aLayer, 1, gl.FLOAT, false, stride, 20);
    gl.enableVertexAttribArray(p.a.aBl); gl.vertexAttribPointer(p.a.aBl, 1, gl.FLOAT, false, stride, 24);
    gl.enableVertexAttribArray(p.a.aSl); gl.vertexAttribPointer(p.a.aSl, 1, gl.FLOAT, false, stride, 28);
    gl.enableVertexAttribArray(p.a.aShade); gl.vertexAttribPointer(p.a.aShade, 1, gl.FLOAT, false, stride, 32);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bindVertexArray(null);
    return vao;
  };

  // ---------- Chunk-Meshes ----------
  Renderer.prototype.uploadChunk = function (chunk, mesh) {
    var gl = this.gl;
    var key = chunk.cx + ',' + chunk.cz;
    var m = this.chunkMeshes[key];
    if (!m) {
      m = { vboO: gl.createBuffer(), vboA: gl.createBuffer(), nO: 0, nA: 0 };
      m.vaoO = this.makeVao(m.vboO);
      m.vaoA = this.makeVao(m.vboA);
      this.chunkMeshes[key] = m;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vboO);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.opaque, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vboA);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.alpha, gl.STATIC_DRAW);
    m.nO = mesh.opaqueVerts;
    m.nA = mesh.alphaVerts;
    var maxQuads = Math.max(m.nO, m.nA) / 4;
    if (maxQuads > this.indexQuads) {
      this.buildIndexBuffer(Math.ceil(maxQuads * 1.4));
      // VAOs neu binden, damit der neue Indexpuffer greift
      this.rebindIndexBuffers();
    }
    chunk.mesh = m;
    chunk.dirty = false;
  };

  Renderer.prototype.rebindIndexBuffers = function () {
    var gl = this.gl;
    for (var k in this.chunkMeshes) {
      var m = this.chunkMeshes[k];
      gl.bindVertexArray(m.vaoO); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bindVertexArray(m.vaoA); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    }
    gl.bindVertexArray(this.dynVao); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bindVertexArray(null);
  };

  Renderer.prototype.dropChunk = function (chunk) {
    var gl = this.gl;
    var key = chunk.cx + ',' + chunk.cz;
    var m = this.chunkMeshes[key];
    if (!m) return;
    gl.deleteBuffer(m.vboO); gl.deleteBuffer(m.vboA);
    gl.deleteVertexArray(m.vaoO); gl.deleteVertexArray(m.vaoA);
    delete this.chunkMeshes[key];
    chunk.mesh = null;
  };

  Renderer.prototype.resize = function () {
    var c = this.canvas;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.floor(c.clientWidth * dpr), h = Math.floor(c.clientHeight * dpr);
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    this.gl.viewport(0, 0, c.width, c.height);
    this.aspect = c.width / Math.max(1, c.height);
  };

  // ---------- Farben für Himmel/Nebel ----------
  Renderer.prototype.skyColors = function (world) {
    var t = world.time;
    var dayZ = [0.30, 0.55, 0.95], dayH = [0.62, 0.78, 1.0];
    var nightZ = [0.015, 0.02, 0.06], nightH = [0.05, 0.06, 0.14];
    var duskZ = [0.22, 0.20, 0.42], duskH = [0.92, 0.45, 0.22];

    var f;
    var zen, hor;
    if (t > 0.23 && t < 0.72) { zen = dayZ; hor = dayH; f = 0; }
    else if (t >= 0.72 && t < 0.80) { f = (t - 0.72) / 0.08; zen = U.mixColor(dayZ, duskZ, f); hor = U.mixColor(dayH, duskH, f); }
    else if (t >= 0.80 && t < 0.86) { f = (t - 0.80) / 0.06; zen = U.mixColor(duskZ, nightZ, f); hor = U.mixColor(duskH, nightH, f); }
    else if (t >= 0.86 || t < 0.15) { zen = nightZ; hor = nightH; }
    else if (t >= 0.15 && t < 0.19) { f = (t - 0.15) / 0.04; zen = U.mixColor(nightZ, duskZ, f); hor = U.mixColor(nightH, duskH, f); }
    else { f = (t - 0.19) / 0.04; zen = U.mixColor(duskZ, dayZ, f); hor = U.mixColor(duskH, dayH, f); }
    return { zenith: zen, horizon: hor };
  };

  Renderer.prototype.sunDir = function (world) {
    var a = (world.time - 0.25) * Math.PI * 2;
    return [Math.cos(a) * 0.0 + Math.sin(a) * 0.35, Math.sin(a), Math.cos(a)];
  };

  // ============================================================
  //  Hauptrender
  // ============================================================
  Renderer.prototype.render = function (game, dt) {
    var gl = this.gl;
    var world = game.world, p = game.player;
    this.resize();

    var eyeY = p.eyeY() + (game.camBob || 0);
    var near = 0.08, far = Math.max(64, this.renderDistance * CS * 1.9);
    M4.perspective(this.proj, (this.fov + (p.sprinting ? 6 : 0)) * Math.PI / 180, this.aspect, near, far);
    M4.fpsView(this.view, p.x, eyeY, p.z, p.yaw, p.pitch);
    if (game.camShake > 0) {
      M4.rotateZ(this.view, this.view, (Math.random() - 0.5) * game.camShake * 0.08);
    }
    M4.multiply(this.vp, this.proj, this.view);
    invertM4(this.invVP, this.vp);
    U.extractFrustum(this.vp, this.frustum);

    var sc = this.skyColors(world);
    var daylight = world.daylight();
    var night = U.clamp(1 - (daylight - 0.13) / 0.5, 0, 1);
    var underwater = p.headInWater ? 1 : 0;
    var fogColor = underwater ? [0.10, 0.28, 0.52] : sc.horizon;
    if (p.headInLava) fogColor = [0.6, 0.16, 0.02];

    var fogNear, fogFar;
    if (underwater) { fogNear = 0.5; fogFar = 16; }
    else if (p.headInLava) { fogNear = 0.1; fogFar = 2.2; }
    else { fogNear = this.renderDistance * CS * 0.55; fogFar = this.renderDistance * CS * 0.97; }

    gl.clearColor(fogColor[0], fogColor[1], fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // ---- Himmel ----
    if (!underwater && !p.headInLava) {
      gl.useProgram(this.progSky.prog);
      gl.depthMask(false);
      gl.disable(gl.CULL_FACE);
      var sd = this.sunDir(world);
      var l = Math.sqrt(sd[0] * sd[0] + sd[1] * sd[1] + sd[2] * sd[2]);
      gl.uniformMatrix4fv(this.progSky.u.uInvVP, false, this.invVP);
      gl.uniform3f(this.progSky.u.uCamPos, p.x, eyeY, p.z);
      gl.uniform3fv(this.progSky.u.uZenith, new Float32Array(sc.zenith));
      gl.uniform3fv(this.progSky.u.uHorizon, new Float32Array(sc.horizon));
      gl.uniform3f(this.progSky.u.uSunDir, sd[0] / l, sd[1] / l, sd[2] / l);
      gl.uniform3f(this.progSky.u.uSunColor, 1.0, 0.96, 0.82);
      gl.uniform1f(this.progSky.u.uNight, night);
      gl.uniform1f(this.progSky.u.uUnderwater, 0);
      gl.uniform3f(this.progSky.u.uWaterColor, 0.1, 0.28, 0.52);
      gl.bindVertexArray(this.skyVao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
      gl.depthMask(true);
      gl.enable(gl.CULL_FACE);
    }

    // ---- Terrain (opak) ----
    var mp = this.progMain;
    gl.useProgram(mp.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.texArray);
    gl.uniform1i(mp.u.uTex, 0);
    gl.uniformMatrix4fv(mp.u.uMVP, false, this.vp);
    gl.uniform3f(mp.u.uCam, p.x, eyeY, p.z);
    gl.uniform1f(mp.u.uDaylight, daylight);
    gl.uniform1f(mp.u.uFogNear, fogNear);
    gl.uniform1f(mp.u.uFogFar, fogFar);
    gl.uniform3fv(mp.u.uFogColor, new Float32Array(fogColor));
    gl.uniform4f(mp.u.uTint, 1, 1, 1, 1);
    gl.uniform1f(mp.u.uAlphaTest, 0.5);

    var visible = [];
    var pcx = Math.floor(p.x / CS), pcz = Math.floor(p.z / CS);
    var list = world.chunkList;
    this.stats.chunks = 0; this.stats.quads = 0;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c.mesh) continue;
      var x0 = c.cx * CS, z0 = c.cz * CS;
      if (!U.aabbInFrustum(this.frustum, x0, 0, z0, x0 + CS, WH, z0 + CS)) continue;
      var dx = (x0 + 8) - p.x, dz = (z0 + 8) - p.z;
      visible.push({ c: c, d: dx * dx + dz * dz });
    }
    visible.sort(function (a, b) { return a.d - b.d; });

    for (var v = 0; v < visible.length; v++) {
      var m = visible[v].c.mesh;
      if (m.nO === 0) continue;
      gl.bindVertexArray(m.vaoO);
      gl.drawElements(gl.TRIANGLES, (m.nO / 4) * 6, gl.UNSIGNED_INT, 0);
      this.stats.chunks++;
      this.stats.quads += m.nO / 4;
    }

    // ---- Entities ----
    this.renderEntities(game, daylight, fogColor, fogNear, fogFar);

    // ---- Partikel ----
    this.renderParticles(game, daylight);

    // ---- Zielmarkierung & Bruchstadien ----
    if (game.target && game.mode !== 'spectator') {
      this.renderOutline(game);
      if (game.mining && game.mining.progress > 0) this.renderBreakOverlay(game, daylight);
    }

    // ---- Wolken ----
    this.renderClouds(game, daylight, fogColor, fogNear, fogFar);

    // ---- transparente Blöcke (Wasser/Glas/Eis) ----
    gl.useProgram(mp.prog);
    gl.uniformMatrix4fv(mp.u.uMVP, false, this.vp);
    gl.uniform4f(mp.u.uTint, 1, 1, 1, 1);
    gl.uniform1f(mp.u.uAlphaTest, 0.06);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(true);
    gl.disable(gl.CULL_FACE);
    for (var a = visible.length - 1; a >= 0; a--) {
      var ma = visible[a].c.mesh;
      if (ma.nA === 0) continue;
      gl.bindVertexArray(ma.vaoA);
      gl.drawElements(gl.TRIANGLES, (ma.nA / 4) * 6, gl.UNSIGNED_INT, 0);
      this.stats.quads += ma.nA / 4;
    }
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);

    // ---- Hand / gehaltenes Item ----
    if (game.mode !== 'spectator' && !game.hideHand) this.renderHand(game, daylight);
  };

  // ---------- Wolken ----------
  Renderer.prototype.renderClouds = function (game, daylight, fogColor, fogNear, fogFar) {
    var gl = this.gl, p = game.player, mp = this.progMain;
    var y = 118;
    var size = 512;
    var t = game.time * 0.6;
    var cx = Math.floor(p.x / 64) * 64, cz = Math.floor(p.z / 64) * 64;
    var layer = T.layer('clouds');
    var d = this.dynData;
    var n = 0;
    var uvScale = size / 26;
    var uoff = t / 26;
    var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    var uv = [[0, 0], [uvScale, 0], [uvScale, uvScale], [0, uvScale]];
    for (var i = 0; i < 4; i++) {
      d[n++] = cx + corners[i][0] * size; d[n++] = y; d[n++] = cz + corners[i][1] * size;
      d[n++] = uv[i][0] + uoff; d[n++] = uv[i][1]; d[n++] = layer;
      d[n++] = 0; d[n++] = 1; d[n++] = 0.92;
    }
    // Unterseite (gleiche Geometrie, umgekehrte Reihenfolge)
    for (var j = 3; j >= 0; j--) {
      d[n++] = cx + corners[j][0] * size; d[n++] = y - 4; d[n++] = cz + corners[j][1] * size;
      d[n++] = uv[j][0] + uoff; d[n++] = uv[j][1]; d[n++] = layer;
      d[n++] = 0; d[n++] = 1; d[n++] = 0.7;
    }
    gl.useProgram(mp.prog);
    gl.uniform1f(mp.u.uAlphaTest, 0.1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.depthMask(false);
    this.drawDyn(n);
    gl.depthMask(true);
    gl.enable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
  };

  Renderer.prototype.drawDyn = function (floatCount) {
    var gl = this.gl;
    if (floatCount <= 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.dynBuf);
    if (floatCount > this.dynCap) {
      gl.bufferData(gl.ARRAY_BUFFER, this.dynData, gl.DYNAMIC_DRAW);
      this.dynCap = this.dynData.length;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.dynData.subarray(0, floatCount));
    }
    var verts = floatCount / FPV;
    var quads = Math.floor(verts / 4);
    if (quads > this.indexQuads) { this.buildIndexBuffer(Math.ceil(quads * 1.4)); this.rebindIndexBuffers(); }
    gl.bindVertexArray(this.dynVao);
    gl.drawElements(gl.TRIANGLES, quads * 6, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
  };

  Renderer.prototype.ensureDyn = function (floats) {
    if (this.dynData.length >= floats) return;
    var cap = this.dynData.length;
    while (cap < floats) cap *= 2;
    this.dynData = new Float32Array(cap);
    this.dynCap = 0;
  };

  // ---------- Entities ----------
  Renderer.prototype.renderEntities = function (game, daylight, fogColor, fogNear, fogFar) {
    var gl = this.gl, mp = this.progMain, world = game.world;
    gl.useProgram(mp.prog);
    gl.uniform1f(mp.u.uAlphaTest, 0.5);
    var ents = world.entities;
    this.stats.entities = 0;
    var p = game.player;

    for (var i = 0; i < ents.length; i++) {
      var e = ents[i];
      if (e.dead) continue;
      var dx = e.x - p.x, dz = e.z - p.z;
      if (dx * dx + dz * dz > (this.renderDistance * CS) * (this.renderDistance * CS)) continue;
      if (!U.aabbInFrustum(this.frustum, e.x - 1.2, e.y - 0.4, e.z - 1.2, e.x + 1.2, e.y + e.height + 1, e.z + 1.2)) continue;
      this.stats.entities++;

      var lr = world.getLightRaw(Math.floor(e.x), Math.floor(e.y + e.height * 0.5), Math.floor(e.z));
      var bl = (lr & 15) / 15, sl = ((lr >> 4) & 15) / 15;

      if (e.type === 'item') this.drawItemEntity(e, bl, sl, game);
      else if (e.type === 'xp') this.drawSprite(e.x, e.y + 0.15, e.z, 0.28, T.layer('p_yellow'), bl, sl, game);
      else if (e.type === 'arrow') this.drawArrow(e, bl, sl);
      else if (e.type === 'tnt') this.drawTNT(e, bl, sl, game);
      else if (e.type === 'mob') this.drawMob(e, bl, sl, game);
    }
    gl.uniform4f(mp.u.uTint, 1, 1, 1, 1);
  };

  Renderer.prototype.drawSprite = function (x, y, z, size, layer, bl, sl, game) {
    var d = this.dynData, n = 0;
    var r = this.camRight(), u = this.camUp();
    var h = size / 2;
    var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    var uvs = [[0, 1], [1, 1], [1, 0], [0, 0]];
    for (var i = 0; i < 4; i++) {
      d[n++] = x + (r[0] * corners[i][0] + u[0] * corners[i][1]) * h;
      d[n++] = y + (r[1] * corners[i][0] + u[1] * corners[i][1]) * h;
      d[n++] = z + (r[2] * corners[i][0] + u[2] * corners[i][1]) * h;
      d[n++] = uvs[i][0]; d[n++] = uvs[i][1]; d[n++] = layer;
      d[n++] = bl; d[n++] = sl; d[n++] = 1;
    }
    this.gl.disable(this.gl.CULL_FACE);
    this.drawDyn(n);
    this.gl.enable(this.gl.CULL_FACE);
  };

  Renderer.prototype.camRight = function () {
    return [this.view[0], this.view[4], this.view[8]];
  };
  Renderer.prototype.camUp = function () {
    return [this.view[1], this.view[5], this.view[9]];
  };

  Renderer.prototype.drawItemEntity = function (e, bl, sl, game) {
    var it = MC.Items.get(e.stack.id);
    var bob = Math.sin(e.age * 3 + e.bob) * 0.06;
    var y = e.y + 0.16 + bob;
    if (it && it.block) {
      var blk = B.byName[it.block];
      var n = this.boxGeometry(0, [e.x, y, e.z], 0.26, blk, 0, e.age * 1.4, bl, sl);
      this.drawDyn(n);
    } else {
      this.drawSprite(e.x, y, e.z, 0.42, T.layer(it ? it.tex : 'white'), bl, sl, game);
    }
  };

  // Pfeil: zwei gekreuzte Ebenen entlang der Flugbahn (wie im Original),
  // nicht das Item-Bild auf einen Würfel geklebt.
  Renderer.prototype.drawArrow = function (e, bl, sl) {
    var gl = this.gl;
    var layer = T.layer('arrow_entity');
    var d = this.dynData, n = 0;
    var cy = Math.cos(e.yaw), sy = Math.sin(e.yaw);
    var cp = Math.cos(e.pitch), sp = Math.sin(e.pitch);
    var L = 0.42, W = 0.10;
    var planes = [
      [[0, -W, -L], [0, -W, L], [0, W, L], [0, W, -L]],
      [[-W, 0, -L], [-W, 0, L], [W, 0, L], [W, 0, -L]]
    ];
    for (var pi = 0; pi < planes.length; pi++) {
      for (var side = 0; side < 2; side++) {
        var a = d, m = n;
        for (var i = 0; i < 4; i++) {
          var k = side === 0 ? i : (3 - i);
          var p = planes[pi][k];
          var y1 = p[1] * cp - p[2] * sp, z1 = p[1] * sp + p[2] * cp;
          var x2 = p[0] * cy + z1 * sy, z2 = -p[0] * sy + z1 * cy;
          a[m++] = e.x + x2; a[m++] = e.y + y1; a[m++] = e.z + z2;
          a[m++] = MC.Mesher.UVS[k][0]; a[m++] = MC.Mesher.UVS[k][1]; a[m++] = layer;
          a[m++] = bl; a[m++] = sl; a[m++] = side === 0 ? 1.0 : 0.85;
        }
        n = m;
      }
    }
    gl.disable(gl.CULL_FACE);
    this.drawDyn(n);
    gl.enable(gl.CULL_FACE);
  };

  Renderer.prototype.drawTNT = function (e, bl, sl, game) {
    var gl = this.gl, mp = this.progMain;
    var flash = (Math.sin(e.age * 26) > 0) ? 1 : 0;
    gl.uniform4f(mp.u.uTint, 1 + flash * 1.6, 1 + flash * 1.6, 1 + flash * 1.6, 1);
    var n = this.boxGeometry(0, [e.x, e.y + 0.49, e.z], 0.98, B.byName['tnt'], 0, 0, bl, sl);
    this.drawDyn(n);
    gl.uniform4f(mp.u.uTint, 1, 1, 1, 1);
  };

  // Würfelgeometrie für ein Block-Item (zentriert)
  Renderer.prototype.boxGeometry = function (start, center, size, block, meta, yaw, bl, sl) {
    var d = this.dynData, n = start;
    var h = size / 2;
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    for (var f = 0; f < 6; f++) {
      var F = MC.Mesher.FACES[f];
      var layer = MC.Mesher.faceLayer(block, f, meta);
      for (var i = 0; i < 4; i++) {
        var v = F.v[i];
        var lx = (v[0] - 0.5) * size, ly = (v[1] - 0.5) * size, lz = (v[2] - 0.5) * size;
        var rx = lx * cy + lz * sy, rz = -lx * sy + lz * cy;
        d[n++] = center[0] + rx; d[n++] = center[1] + ly; d[n++] = center[2] + rz;
        d[n++] = MC.Mesher.UVS[i][0]; d[n++] = MC.Mesher.UVS[i][1]; d[n++] = layer;
        d[n++] = bl; d[n++] = sl; d[n++] = F.shade;
      }
    }
    return n;
  };

  Renderer.prototype.boxGeometryRaw = function (pos, mn, mx, layer, bl, sl, yaw, pitch) {
    var d = this.dynData, n = 0;
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    for (var f = 0; f < 6; f++) {
      var F = MC.Mesher.FACES[f];
      for (var i = 0; i < 4; i++) {
        var v = F.v[i];
        var lx = mn[0] + v[0] * (mx[0] - mn[0]);
        var ly = mn[1] + v[1] * (mx[1] - mn[1]);
        var lz = mn[2] + v[2] * (mx[2] - mn[2]);
        // Pitch um X, dann Yaw um Y
        var y1 = ly * cp - lz * sp, z1 = ly * sp + lz * cp;
        var x2 = lx * cy + z1 * sy, z2 = -lx * sy + z1 * cy;
        d[n++] = pos[0] + x2; d[n++] = pos[1] + y1; d[n++] = pos[2] + z2;
        d[n++] = MC.Mesher.UVS[i][0]; d[n++] = MC.Mesher.UVS[i][1]; d[n++] = layer;
        d[n++] = bl; d[n++] = sl; d[n++] = F.shade;
      }
    }
    return n;
  };

  // ---------- Mob-Modelle ----------
  Renderer.prototype.drawMob = function (mob, bl, sl, game) {
    var gl = this.gl, mp = this.progMain;
    var model = mob.model;
    if (!model) return;
    this.ensureDyn(model.parts.length * 6 * 4 * FPV + 64);
    var d = this.dynData, n = 0;
    var s = (model.scale || 1) / 16;
    var walk = mob.walkTime;
    var swing = mob.moving ? 1 : 0;
    // Die Modelle blicken in Modellrichtung -Z, die Laufrichtung eines Mobs bei yaw
    // ist aber (sin yaw, cos yaw). Ohne die halbe Drehung liefen alle Tiere rückwärts.
    var yaw = mob.yaw + Math.PI;
    var cy = Math.cos(yaw), sy = Math.sin(yaw);

    for (var pi = 0; pi < model.parts.length; pi++) {
      var part = model.parts[pi];
      var rot = animRot(part.anim, mob, walk, swing);
      var pivot = part.pivot || [0, 0, 0];
      var texAll, texFront;
      if (typeof part.tex === 'string') {
        texAll = part.tex === 'WOOL' ? ('wool_' + (mob.woolColor || 'white')) : part.tex;
        texFront = texAll;
      } else {
        texAll = part.tex.all; texFront = part.tex.front || part.tex.all;
      }
      if (mob.mobType === 'sheep' && part.name === 'body' && mob.sheared) texAll = 'mob_sheep_face';

      for (var f = 0; f < 6; f++) {
        var F = MC.Mesher.FACES[f];
        var layer = T.layer(f === 5 ? texFront : texAll);
        for (var i = 0; i < 4; i++) {
          var v = F.v[i];
          var lx = part.x + v[0] * part.w;
          var ly = part.y + v[1] * part.h;
          var lz = part.z + v[2] * part.d;
          // um Pivot rotieren
          lx -= pivot[0]; ly -= pivot[1]; lz -= pivot[2];
          if (rot.x) { var t1 = ly * Math.cos(rot.x) - lz * Math.sin(rot.x); lz = ly * Math.sin(rot.x) + lz * Math.cos(rot.x); ly = t1; }
          if (rot.z) { var t2 = lx * Math.cos(rot.z) - ly * Math.sin(rot.z); ly = lx * Math.sin(rot.z) + ly * Math.cos(rot.z); lx = t2; }
          if (rot.y) { var t3 = lx * Math.cos(rot.y) + lz * Math.sin(rot.y); lz = -lx * Math.sin(rot.y) + lz * Math.cos(rot.y); lx = t3; }
          lx += pivot[0]; ly += pivot[1]; lz += pivot[2];
          // Skalieren + Körper-Yaw
          var wx = lx * s, wy = ly * s, wz = lz * s;
          var fx = wx * cy + wz * sy, fz = -wx * sy + wz * cy;
          d[n++] = mob.x + fx; d[n++] = mob.y + wy; d[n++] = mob.z + fz;
          d[n++] = MC.Mesher.UVS[i][0]; d[n++] = MC.Mesher.UVS[i][1]; d[n++] = layer;
          d[n++] = bl; d[n++] = sl; d[n++] = F.shade;
        }
      }
    }

    var tintR = 1, tintG = 1, tintB = 1;
    if (mob.hurtTime > 0) { tintR = 2.2; tintG = 0.55; tintB = 0.55; }
    if (mob.mobType === 'creeper' && mob.fuse > 0) {
      var fl = Math.sin(mob.age * 24) * 0.5 + 0.5;
      tintR = 1 + fl * 1.5; tintG = 1 + fl * 1.5; tintB = 1 + fl * 1.5;
    }
    gl.uniform4f(mp.u.uTint, tintR, tintG, tintB, 1);
    this.drawDyn(n);
    gl.uniform4f(mp.u.uTint, 1, 1, 1, 1);
  };

  function animRot(anim, mob, walk, swing) {
    var r = { x: 0, y: 0, z: 0 };
    if (!anim) return r;
    var amp = 0.85 * swing;
    switch (anim) {
      case 'head':
        r.y = MC.approachAngle(0, normAngle((mob.headYaw || mob.yaw) - mob.yaw), 1.2);
        r.x = mob.headPitch || 0;
        break;
      case 'legFR': case 'legBL': r.x = Math.sin(walk) * amp; break;
      case 'legFL': case 'legBR': r.x = -Math.sin(walk) * amp; break;
      case 'armZ':
        r.x = (mob.mobType === 'zombie' || (mob.mobType === 'skeleton')) ? -1.45 + Math.sin(walk) * 0.12 : Math.sin(walk) * amp * 0.7;
        break;
      case 'wingR': r.z = -Math.abs(Math.sin(walk * 1.4)) * 0.9; break;
      case 'wingL': r.z = Math.abs(Math.sin(walk * 1.4)) * 0.9; break;
    }
    return r;
  }
  function normAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  // ---------- Partikel ----------
  Renderer.prototype.renderParticles = function (game, daylight) {
    var gl = this.gl, mp = this.progMain;
    var list = game.particles.list;
    if (list.length === 0) return;
    this.ensureDyn(list.length * 4 * FPV + 64);
    var d = this.dynData, n = 0;
    var r = this.camRight(), u = this.camUp();
    var world = game.world;
    var p = game.player;
    var corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

    for (var i = 0; i < list.length; i++) {
      var pt = list[i];
      var dx = pt.x - p.x, dy = pt.y - p.y, dz = pt.z - p.z;
      if (dx * dx + dy * dy + dz * dz > 64 * 64) continue;
      var lr = world.getLightRaw(Math.floor(pt.x), Math.floor(pt.y), Math.floor(pt.z));
      var bl = (lr & 15) / 15, sl = ((lr >> 4) & 15) / 15;
      var h = pt.size / 2;
      var uvx = [[pt.u0, pt.v1], [pt.u1, pt.v1], [pt.u1, pt.v0], [pt.u0, pt.v0]];
      for (var k = 0; k < 4; k++) {
        d[n++] = pt.x + (r[0] * corners[k][0] + u[0] * corners[k][1]) * h;
        d[n++] = pt.y + (r[1] * corners[k][0] + u[1] * corners[k][1]) * h;
        d[n++] = pt.z + (r[2] * corners[k][0] + u[2] * corners[k][1]) * h;
        d[n++] = uvx[k][0]; d[n++] = uvx[k][1]; d[n++] = pt.layer;
        d[n++] = bl; d[n++] = sl; d[n++] = 1;
      }
    }
    gl.useProgram(mp.prog);
    gl.uniform1f(mp.u.uAlphaTest, 0.35);
    gl.disable(gl.CULL_FACE);
    this.drawDyn(n);
    gl.enable(gl.CULL_FACE);
  };

  // ---------- Auswahlrahmen ----------
  Renderer.prototype.renderOutline = function (game) {
    var gl = this.gl, t = game.target;
    var box = B.selBox(t.id, game.world.getMeta(t.x, t.y, t.z));
    if (!box) return;
    var e = 0.002;
    var x0 = t.x + box[0] - e, y0 = t.y + box[1] - e, z0 = t.z + box[2] - e;
    var x1 = t.x + box[3] + e, y1 = t.y + box[4] + e, z1 = t.z + box[5] + e;
    var pts = [
      x0, y0, z0, x1, y0, z0, x1, y0, z0, x1, y0, z1, x1, y0, z1, x0, y0, z1, x0, y0, z1, x0, y0, z0,
      x0, y1, z0, x1, y1, z0, x1, y1, z0, x1, y1, z1, x1, y1, z1, x0, y1, z1, x0, y1, z1, x0, y1, z0,
      x0, y0, z0, x0, y1, z0, x1, y0, z0, x1, y1, z0, x1, y0, z1, x1, y1, z1, x0, y0, z1, x0, y1, z1
    ];
    var arr = this.lineData;
    for (var i = 0; i < pts.length; i++) arr[i] = pts[i];
    gl.useProgram(this.progLine.prog);
    gl.uniformMatrix4fv(this.progLine.u.uMVP, false, this.vp);
    gl.uniform4f(this.progLine.u.uColor, 0, 0, 0, 0.45);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, arr.subarray(0, pts.length), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(this.lineVao);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.LINES, 0, pts.length / 3);
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  };

  Renderer.prototype.renderBreakOverlay = function (game, daylight) {
    var gl = this.gl, mp = this.progMain, t = game.target;
    var stage = Math.min(9, Math.floor(game.mining.progress * 10));
    var layer = T.layer('crack_' + stage);
    var box = B.selBox(t.id, game.world.getMeta(t.x, t.y, t.z)) || [0, 0, 0, 1, 1, 1];
    var d = this.dynData, n = 0;
    var e = 0.003;
    for (var f = 0; f < 6; f++) {
      var F = MC.Mesher.FACES[f];
      for (var i = 0; i < 4; i++) {
        var v = F.v[i];
        d[n++] = t.x + box[0] - e + v[0] * (box[3] - box[0] + e * 2);
        d[n++] = t.y + box[1] - e + v[1] * (box[4] - box[1] + e * 2);
        d[n++] = t.z + box[2] - e + v[2] * (box[5] - box[2] + e * 2);
        d[n++] = MC.Mesher.UVS[i][0]; d[n++] = MC.Mesher.UVS[i][1]; d[n++] = layer;
        d[n++] = 1; d[n++] = 1; d[n++] = 1;
      }
    }
    gl.useProgram(mp.prog);
    gl.uniform1f(mp.u.uAlphaTest, 0.02);
    gl.uniform1f(mp.u.uDaylight, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    this.drawDyn(n);
    gl.disable(gl.BLEND);
    gl.uniform1f(mp.u.uDaylight, daylight);
  };

  // ---------- Hand / gehaltenes Item ----------
  Renderer.prototype.renderHand = function (game, daylight) {
    var gl = this.gl, mp = this.progMain, p = game.player;
    var stack = p.inventory.selectedStack();

    var proj = M4.perspective(M4.create(), 70 * Math.PI / 180, this.aspect, 0.02, 8);
    var view = M4.identity(M4.create());

    var swing = Math.sin(Math.max(0, 1 - p.swingTime) * Math.PI);
    var sw = p.swingTime > 0 ? Math.sin((1 - p.swingTime) * Math.PI) : 0;
    var eat = p.eatTime > 0 ? Math.sin(p.eatTime * 30) * 0.08 : 0;
    var bob = Math.sin(p.bobPhase) * 0.012;
    var bobY = Math.abs(Math.cos(p.bobPhase)) * 0.012;

    // Bogen spannen: Item wandert zur Bildmitte und kippt – wie beim Original
    var charge = Math.min(1, game.bowCharge || 0);
    var shake = charge > 0.85 ? (Math.random() - 0.5) * 0.012 : 0;

    var mv = M4.identity(M4.create());
    M4.translate(mv, mv,
      0.44 - charge * 0.22 + bob + shake,
      -0.42 + bobY - eat + charge * 0.10 + shake,
      -0.62 + charge * 0.14);
    M4.rotateY(mv, mv, -0.55 + sw * 0.5 + charge * 0.45);
    M4.rotateX(mv, mv, -0.18 - sw * 0.9 - charge * 0.20);
    M4.rotateZ(mv, mv, 0.12);

    var mvp = M4.multiply(M4.create(), proj, mv);

    var lr = game.world.getLightRaw(Math.floor(p.x), Math.floor(p.eyeY()), Math.floor(p.z));
    var bl = (lr & 15) / 15, sl = ((lr >> 4) & 15) / 15;
    var d = this.dynData, n = 0;

    var it = stack ? MC.Items.get(stack.id) : null;
    if (it && it.block) {
      var blk = B.byName[it.block];
      var meta = 0;
      for (var f = 0; f < 6; f++) {
        var F = MC.Mesher.FACES[f];
        var layer = MC.Mesher.faceLayer(blk, f, meta);
        for (var i = 0; i < 4; i++) {
          var v = F.v[i];
          d[n++] = (v[0] - 0.5) * 0.34; d[n++] = (v[1] - 0.5) * 0.34; d[n++] = (v[2] - 0.5) * 0.34;
          d[n++] = MC.Mesher.UVS[i][0]; d[n++] = MC.Mesher.UVS[i][1]; d[n++] = layer;
          d[n++] = bl; d[n++] = sl; d[n++] = F.shade;
        }
      }
    } else {
      // Item als flache "Karte" oder Arm
      var texName = it ? it.tex : 'mob_player_arm';
      if (it && it.name === 'bow' && charge > 0) {
        texName = 'bow_pull_' + (charge > 0.75 ? 2 : (charge > 0.4 ? 1 : 0));
      }
      var layer2 = T.layer(texName);
      var w = it ? 0.34 : 0.16, h2 = it ? 0.34 : 0.42, dep = it ? 0.03 : 0.16;
      for (var f2 = 0; f2 < 6; f2++) {
        var F2 = MC.Mesher.FACES[f2];
        for (var i2 = 0; i2 < 4; i2++) {
          var v2 = F2.v[i2];
          d[n++] = (v2[0] - 0.5) * w; d[n++] = (v2[1] - 0.5) * h2; d[n++] = (v2[2] - 0.5) * dep;
          d[n++] = MC.Mesher.UVS[i2][0]; d[n++] = MC.Mesher.UVS[i2][1]; d[n++] = layer2;
          d[n++] = bl; d[n++] = sl; d[n++] = F2.shade;
        }
      }
    }

    gl.useProgram(mp.prog);
    gl.uniformMatrix4fv(mp.u.uMVP, false, mvp);
    gl.uniform3f(mp.u.uCam, 0, 0, 0);
    gl.uniform1f(mp.u.uFogNear, 1000);
    gl.uniform1f(mp.u.uFogFar, 1001);
    gl.uniform1f(mp.u.uAlphaTest, 0.5);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    this.drawDyn(n);
    gl.uniformMatrix4fv(mp.u.uMVP, false, this.vp);
  };

  // ---------- Matrix-Inverse ----------
  function invertM4(out, m) {
    var a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3],
        a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
        a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11],
        a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return out;
    det = 1.0 / det;
    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return out;
  }
  MC.invertM4 = invertM4;

})();
