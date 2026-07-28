/* ============================================================
   audio.js  -  Prozedurale Sounds über die WebAudio-API
   ============================================================ */
(function () {
  'use strict';

  function Audio() {
    this.ctx = null;
    this.master = null;
    this.enabled = true;
    this.volume = 0.6;
    this.musicOn = true;
    this.noiseBuf = null;
    this.lastPlay = {};
  }
  MC.Audio = Audio;

  Audio.prototype.init = function () {
    if (this.ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);

    // Rauschpuffer
    var len = this.ctx.sampleRate * 1.2;
    var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);
  };

  Audio.prototype.resume = function () {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  };

  Audio.prototype.setVolume = function (v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  };

  Audio.prototype.now = function () { return this.ctx.currentTime; };

  // ---------- Bausteine ----------
  Audio.prototype.noise = function (t, dur, gain, filterType, freq, q, sweepTo) {
    var ctx = this.ctx;
    var src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = filterType || 'lowpass';
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t + dur);
    f.Q.value = q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
    return g;
  };

  Audio.prototype.tone = function (t, dur, gain, type, f0, f1, detuneVib) {
    var ctx = this.ctx;
    var o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.02, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master);
    if (detuneVib) {
      var lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = detuneVib;
      lg.gain.value = 40;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur);
    }
    o.start(t); o.stop(t + dur + 0.02);
    return g;
  };

  // ---------- Sounddefinitionen ----------
  var STEP = {
    grass: [0.08, 900, 0.16, 'lowpass'],
    stone: [0.07, 2400, 0.18, 'bandpass'],
    wood: [0.08, 1300, 0.2, 'bandpass'],
    sand: [0.09, 700, 0.14, 'lowpass'],
    gravel: [0.08, 1800, 0.18, 'bandpass'],
    cloth: [0.09, 500, 0.12, 'lowpass'],
    glass: [0.06, 4200, 0.14, 'bandpass']
  };

  Audio.prototype.step = function (mat) {
    if (!this.enabled) return;
    this.init(); if (!this.ctx) return;
    var s = STEP[mat] || STEP.stone;
    var t = this.now();
    this.noise(t, s[0], s[2] * (0.7 + Math.random() * 0.5), s[3], s[1] * (0.85 + Math.random() * 0.3), 1.4, s[1] * 0.5);
  };

  Audio.prototype.dig = function (mat) {
    if (!this.enabled) return;
    this.init(); if (!this.ctx) return;
    var s = STEP[mat] || STEP.stone;
    var t = this.now();
    this.noise(t, s[0] * 1.3, s[2] * 0.85, s[3], s[1] * 1.1, 1.2, s[1] * 0.45);
  };

  Audio.prototype.breakBlock = function (mat) {
    if (!this.enabled) return;
    this.init(); if (!this.ctx) return;
    var t = this.now();
    var s = STEP[mat] || STEP.stone;
    this.noise(t, 0.24, 0.34, s[3], s[1] * 1.3, 1.1, s[1] * 0.3);
    if (mat === 'glass') { this.noise(t, 0.3, 0.3, 'highpass', 3000, 1, 6000); }
    if (mat === 'wood') this.tone(t, 0.12, 0.1, 'triangle', 260, 120);
  };

  Audio.prototype.place = function (mat) {
    if (!this.enabled) return;
    this.init(); if (!this.ctx) return;
    var s = STEP[mat] || STEP.stone;
    var t = this.now();
    this.noise(t, 0.1, 0.28, s[3], s[1], 1.5, s[1] * 0.6);
  };

  var SIMPLE = {};

  Audio.prototype.play = function (name, vol) {
    if (!this.enabled) return;
    this.init(); if (!this.ctx) return;
    var t = this.now();
    var g = vol === undefined ? 1 : vol;
    // Wiederholungsschutz
    if (this.lastPlay[name] && t - this.lastPlay[name] < 0.035) return;
    this.lastPlay[name] = t;

    switch (name) {
      case 'pop': this.tone(t, 0.09, 0.25 * g, 'square', 520, 900); break;
      case 'xp': this.tone(t, 0.09, 0.16 * g, 'sine', 800, 1400); this.tone(t + 0.06, 0.1, 0.13 * g, 'sine', 1200, 1700); break;
      case 'hit': this.noise(t, 0.09, 0.3 * g, 'bandpass', 900, 1.2, 300); this.tone(t, 0.07, 0.13 * g, 'square', 180, 90); break;
      case 'hurt': this.tone(t, 0.28, 0.28 * g, 'sawtooth', 380, 140, 14); break;
      case 'death': this.tone(t, 0.8, 0.3 * g, 'sawtooth', 340, 70, 7); break;
      case 'fall': this.noise(t, 0.2, 0.35 * g, 'lowpass', 400, 1, 120); this.tone(t, 0.16, 0.2 * g, 'sine', 130, 60); break;
      case 'explode':
        this.noise(t, 1.1, 0.85 * g, 'lowpass', 1400, 1, 90);
        this.tone(t, 0.7, 0.5 * g, 'sine', 90, 28);
        this.noise(t, 0.25, 0.5 * g, 'highpass', 1800, 1, 400);
        break;
      case 'bow': this.noise(t, 0.22, 0.25 * g, 'bandpass', 1600, 2, 500); break;
      case 'thud': this.noise(t, 0.09, 0.28 * g, 'lowpass', 700, 1, 200); break;
      case 'fuse': this.noise(t, 1.5, 0.28 * g, 'highpass', 3200, 1, 5200); break;
      case 'eat': for (var i = 0; i < 3; i++) this.noise(t + i * 0.13, 0.09, 0.2 * g, 'lowpass', 700, 1.5, 300); break;
      case 'break_tool': this.noise(t, 0.25, 0.3 * g, 'bandpass', 2600, 3, 900); break;
      case 'fizz': this.noise(t, 0.8, 0.3 * g, 'highpass', 2600, 1, 900); break;
      case 'click': this.tone(t, 0.04, 0.16 * g, 'square', 900, 700); break;
      case 'open': this.noise(t, 0.16, 0.2 * g, 'bandpass', 900, 2, 400); break;
      case 'levelup': this.tone(t, 0.14, 0.2 * g, 'sine', 660, 880); this.tone(t + 0.12, 0.22, 0.2 * g, 'sine', 880, 1320); break;
      case 'splash': this.noise(t, 0.35, 0.3 * g, 'bandpass', 1400, 1, 500); break;

      // Mobs
      case 'pig': this.tone(t, 0.22, 0.22 * g, 'square', 210, 150, 22); break;
      case 'cow': this.tone(t, 0.6, 0.24 * g, 'sawtooth', 180, 120, 6); break;
      case 'sheep': this.tone(t, 0.45, 0.2 * g, 'square', 420, 330, 20); break;
      case 'chicken': this.tone(t, 0.1, 0.18 * g, 'square', 900, 600); this.tone(t + 0.11, 0.09, 0.15 * g, 'square', 700, 1000); break;
      case 'zombie': this.tone(t, 0.55, 0.24 * g, 'sawtooth', 150, 95, 9); this.noise(t, 0.5, 0.12 * g, 'lowpass', 500, 1, 250); break;
      case 'skeleton': for (var k = 0; k < 4; k++) this.noise(t + k * 0.07, 0.05, 0.16 * g, 'bandpass', 2200 + k * 300, 6, 1800); break;
      case 'creeper': this.noise(t, 0.7, 0.26 * g, 'highpass', 2800, 1, 4200); break;
      default: break;
    }
  };

  Audio.prototype.play3d = function (name, x, y, z, listener) {
    if (!listener) { this.play(name); return; }
    var dx = x - listener.x, dy = y - listener.y, dz = z - listener.z;
    var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > 26) return;
    this.play(name, Math.max(0, 1 - d / 26));
  };

  // ---------- Ambiente-Musik (sanfte Arpeggios) ----------
  var SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  Audio.prototype.tickMusic = function (dt) {
    if (!this.enabled || !this.musicOn || !this.ctx) return;
    this.musicTimer = (this.musicTimer || 0) - dt;
    this.musicWait = (this.musicWait || 0) - dt;
    if (this.musicWait > 0) return;
    if (this.musicTimer > 0) return;
    this.musicTimer = 2.6 + Math.random() * 2.2;
    if (Math.random() < 0.25) { this.musicWait = 18 + Math.random() * 40; return; }

    var t = this.now();
    var root = 220 * Math.pow(2, ((Math.random() * 3) | 0) / 12 - 0.25);
    var n = 3 + ((Math.random() * 3) | 0);
    for (var i = 0; i < n; i++) {
      var semis = SCALE[(Math.random() * SCALE.length) | 0];
      var f = root * Math.pow(2, semis / 12);
      var st = t + i * (0.42 + Math.random() * 0.2);
      this.softNote(st, f, 1.5 + Math.random());
    }
  };

  Audio.prototype.softNote = function (t, f, dur) {
    var ctx = this.ctx;
    var o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    var o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = f * 2.002;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    var g2 = ctx.createGain(); g2.gain.value = 0.35;
    o.connect(g); o2.connect(g2); g2.connect(g);
    g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + 0.05);
    o2.start(t); o2.stop(t + dur + 0.05);
  };

})();
