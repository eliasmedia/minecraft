/* ============================================================
   glcore.js  -  WebGL2 Hilfsfunktionen (Shader, Programme, Buffer)
   ============================================================ */
(function () {
  'use strict';

  var GL = {};
  MC.GL = GL;

  GL.compile = function (gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(s);
      console.error('Shader-Fehler:', log, '\n', src);
      throw new Error('Shader-Kompilierung fehlgeschlagen: ' + log);
    }
    return s;
  };

  GL.program = function (gl, vsSrc, fsSrc) {
    var p = gl.createProgram();
    gl.attachShader(p, GL.compile(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, GL.compile(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error('Programm-Link fehlgeschlagen: ' + gl.getProgramInfoLog(p));
    }
    var wrap = { prog: p, u: {}, a: {} };
    var nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < nu; i++) {
      var info = gl.getActiveUniform(p, i);
      var nm = info.name.replace('[0]', '');
      wrap.u[nm] = gl.getUniformLocation(p, nm);
    }
    var na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (var k = 0; k < na; k++) {
      var ai = gl.getActiveAttrib(p, k);
      wrap.a[ai.name] = gl.getAttribLocation(p, ai.name);
    }
    return wrap;
  };

  // Dynamischer Vertex-Puffer, der bei Bedarf wächst
  function DynBuffer(gl, floatsPerVertex) {
    this.gl = gl;
    this.fpv = floatsPerVertex;
    this.buf = gl.createBuffer();
    this.cap = 0;
    this.data = new Float32Array(4096);
    this.n = 0;
  }
  DynBuffer.prototype.reset = function () { this.n = 0; };
  DynBuffer.prototype.ensure = function (extraFloats) {
    if (this.n + extraFloats <= this.data.length) return;
    var cap = this.data.length;
    while (cap < this.n + extraFloats) cap *= 2;
    var nd = new Float32Array(cap);
    nd.set(this.data.subarray(0, this.n));
    this.data = nd;
  };
  DynBuffer.prototype.upload = function () {
    var gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (this.n > this.cap) {
      gl.bufferData(gl.ARRAY_BUFFER, this.data, gl.DYNAMIC_DRAW);
      this.cap = this.data.length;
    } else {
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data.subarray(0, this.n));
    }
  };
  DynBuffer.prototype.vertexCount = function () { return this.n / this.fpv; };
  GL.DynBuffer = DynBuffer;

  // Gemeinsamer Index-Puffer für Quads (0,1,2, 0,2,3 ...)
  GL.makeQuadIndex = function (gl, maxQuads) {
    var arr = new Uint32Array(maxQuads * 6);
    for (var i = 0; i < maxQuads; i++) {
      var o = i * 4;
      arr[i * 6] = o; arr[i * 6 + 1] = o + 1; arr[i * 6 + 2] = o + 2;
      arr[i * 6 + 3] = o; arr[i * 6 + 4] = o + 2; arr[i * 6 + 5] = o + 3;
    }
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, arr, gl.STATIC_DRAW);
    return { buffer: b, maxQuads: maxQuads };
  };

})();
