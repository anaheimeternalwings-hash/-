  // ====== 音(効果音とBGM。すべて Web Audio の合成音で、音声ファイルは使わない) ======
  // 設定はセーブとは別に覚える(タイトル画面より前から使うので)。iOS では最初のタップで音が出せるようになる
  var SND = (function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    var CFG_KEY = 'zensen-commander-audio';
    var cfg = { se: 0.8, bgm: 0.6, mute: false }, SE_GAIN = 1.5, BGM_GAIN = 1.5;
    try { var c0 = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); if (c0) { if (c0.se >= 0 && c0.se <= 1) cfg.se = +c0.se; if (c0.bgm >= 0 && c0.bgm <= 1) cfg.bgm = +c0.bgm; cfg.mute = !!c0.mute; } } catch (e) { }
    var ctx = null, master = null, seBus = null, bgmBus = null, noiseBuf = null, meterNode = null, meterBuf = null;
    var played = {}, lastAt = {}, voices = 0, steps = 0;
    var theme = null, wantTheme = null, seq = null, seqTimer = null, duckUntil = 0;

    function ensure() {
      if (ctx || !AC) return !!ctx;
      try {
        ctx = new AC();
        var comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
        master = ctx.createGain(); seBus = ctx.createGain(); bgmBus = ctx.createGain();
        seBus.connect(master); bgmBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
        meterNode = ctx.createAnalyser(); meterNode.fftSize = 2048; comp.connect(meterNode); meterBuf = new Float32Array(2048);
        var n = Math.floor(ctx.sampleRate * 1.2), d;
        noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate); d = noiseBuf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        applyVol();
      } catch (e) { ctx = null; }
      return !!ctx;
    }
    function applyVol() {
      if (!ctx) return;
      var t = ctx.currentTime;
      master.gain.setTargetAtTime(cfg.mute ? 0 : 1, t, 0.02);
      seBus.gain.setTargetAtTime(cfg.se * SE_GAIN, t, 0.02);
      bgmBus.gain.setTargetAtTime(cfg.bgm * BGM_GAIN, t, 0.05);
    }
    function running() { return !!ctx && ctx.state === 'running'; }
    // 最初の操作で音を有効にする(iOS)。戻ってきたときも呼ぶ
    function unlock() {
      if (!ensure()) return;
      if (ctx.state !== 'running' && ctx.resume) { try { var p = ctx.resume(); if (p && p.then) p.then(function () { if (wantTheme && !seqTimer) startSeq(); }, function () { }); } catch (e) { } }
      if (wantTheme && !seqTimer && running()) startSeq();
    }

    // ---- 音の部品 ----
    // 音程のある音: f=周波数, o={type,vol,a(立ち上がり),d(長さ),to(終わりの周波数),lp(ローパス),bus}
    function tone(f, t, o) {
      var os = ctx.createOscillator(), g = ctx.createGain(), d = o.d || 0.15, a = o.a || 0.004, v = o.vol || 0.2, out = g;
      os.type = o.type || 'sine';
      os.frequency.setValueAtTime(f, t);
      if (o.to) os.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + d);
      if (o.vib) { var lf = ctx.createOscillator(), lg = ctx.createGain(); lf.frequency.value = o.vib; lg.gain.value = f * 0.012; lf.connect(lg); lg.connect(os.frequency); lf.start(t); lf.stop(t + d + 0.05); }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      if (o.hold) g.gain.setValueAtTime(v, t + a + o.hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      os.connect(g);
      if (o.lp) { var fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(o.lp, t); if (o.lpTo) fl.frequency.exponentialRampToValueAtTime(o.lpTo, t + d); fl.Q.value = o.q || 0.7; g.connect(fl); out = fl; }
      out.connect(o.bus || seBus);
      os.start(t); os.stop(t + d + 0.03);
      voices++; os.onended = function () { voices--; };
    }
    // 雑音: o={vol,d,a,type(フィルタ),f,to,q,bus}
    function noise(t, o) {
      var src = ctx.createBufferSource(), g = ctx.createGain(), fl = ctx.createBiquadFilter(), d = o.d || 0.2, a = o.a || 0.002, v = o.vol || 0.2;
      src.buffer = noiseBuf; src.loop = true;
      fl.type = o.type || 'lowpass'; fl.frequency.setValueAtTime(o.f || 1000, t); fl.Q.value = o.q || 0.8;
      if (o.to) fl.frequency.exponentialRampToValueAtTime(Math.max(30, o.to), t + d);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      if (o.hold) g.gain.setValueAtTime(v, t + a + o.hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      src.connect(fl); fl.connect(g); g.connect(o.bus || seBus);
      src.start(t, Math.random() * 0.9); src.stop(t + d + 0.03);
      voices++; src.onended = function () { voices--; };
    }
    function rnd(a, b) { return a + Math.random() * (b - a); }
    var N = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    function hz(n) { // 'A4' → 440
      var m = /^([A-G]#?)(-?\d)$/.exec(n);
      return 440 * Math.pow(2, (N[m[1]] - 9 + (+m[2] - 4) * 12) / 12);
    }
    // 金管ふうの音(のこぎり波をローパスに通す)
    function brass(n, t, d, v, bus) { var f = typeof n === 'number' ? n : hz(n); tone(f, t, { type: 'sawtooth', vol: v, a: 0.03, d: d, hold: d * 0.55, lp: f * 3.2, lpTo: f * 1.6, bus: bus }); tone(f * 1.005, t, { type: 'sawtooth', vol: v * 0.6, a: 0.04, d: d, hold: d * 0.5, lp: f * 2.4, bus: bus }); }
    function kick(t, v, bus) { tone(150, t, { vol: v, d: 0.2, to: 46, bus: bus }); noise(t, { vol: v * 0.35, d: 0.03, type: 'bandpass', f: 1400, q: 0.8, bus: bus }); }
    function boomAt(t, size, v) {
      noise(t, { vol: v, d: 0.28 + 0.3 * size, f: 900 + 500 * size, to: 90, q: 0.6 });
      tone(rnd(70, 95) / (0.7 + 0.4 * size), t, { vol: v * 1.1, d: 0.22 + 0.25 * size, to: 32 });
    }

    // ---- 効果音 ----
    // min: 同じ音を続けて鳴らさない間隔(秒)。v: 音量の倍率
    var FX = {
      tap: { min: 0.03, f: function (t) { tone(1500, t, { type: 'triangle', vol: 0.09, d: 0.045, to: 1100 }); } },
      tab: { min: 0.05, f: function (t) { tone(620, t, { type: 'triangle', vol: 0.11, d: 0.07, to: 880 }); } },
      open: { min: 0.05, f: function (t) { tone(520, t, { type: 'sine', vol: 0.1, d: 0.09, to: 780 }); noise(t, { vol: 0.03, d: 0.08, type: 'highpass', f: 3000 }); } },
      close: { min: 0.05, f: function (t) { tone(700, t, { type: 'sine', vol: 0.09, d: 0.09, to: 440 }); } },
      ok: { min: 0.05, f: function (t) { tone(880, t, { type: 'triangle', vol: 0.13, d: 0.09 }); tone(1320, t + 0.07, { type: 'triangle', vol: 0.13, d: 0.14 }); } },
      err: { min: 0.15, f: function (t) { tone(160, t, { type: 'sawtooth', vol: 0.12, d: 0.14, lp: 700 }); tone(120, t + 0.09, { type: 'sawtooth', vol: 0.12, d: 0.16, lp: 600 }); } },
      // 強化: 上がっていく音 + きらめき
      upgrade: { min: 0.1, f: function (t) { ['C5', 'E5', 'G5', 'C6'].forEach(function (n, i) { tone(hz(n), t + i * 0.06, { type: 'triangle', vol: 0.15, d: 0.22 }); }); noise(t + 0.18, { vol: 0.05, d: 0.3, type: 'highpass', f: 5000 }); } },
      build: { min: 0.1, f: function (t) { for (var i = 0; i < 3; i++) { noise(t + i * 0.11, { vol: 0.2, d: 0.07, f: 1400, to: 300 }); tone(180, t + i * 0.11, { vol: 0.16, d: 0.08, to: 90 }); } ['G4', 'C5', 'E5', 'G5'].forEach(function (n, i) { tone(hz(n), t + 0.36 + i * 0.07, { type: 'triangle', vol: 0.15, d: 0.25 }); }); } },
      // 新型の開発: 金属の音 + 上がる和音
      dev: { min: 0.2, f: function (t) { tone(2100, t, { type: 'square', vol: 0.06, d: 0.25, to: 1900 }); tone(3150, t, { type: 'sine', vol: 0.06, d: 0.35 }); noise(t, { vol: 0.12, d: 0.06, type: 'highpass', f: 2500 }); ['D5', 'F#5', 'A5', 'D6'].forEach(function (n, i) { tone(hz(n), t + 0.12 + i * 0.07, { type: 'triangle', vol: 0.15, d: 0.4 }); }); } },
      coin: { min: 0.04, f: function (t) { tone(1568, t, { type: 'square', vol: 0.05, d: 0.06 }); tone(2093, t + 0.045, { type: 'square', vol: 0.05, d: 0.12 }); } },
      collect: { min: 0.2, f: function (t) { for (var i = 0; i < 5; i++) { tone(1568 + i * 90, t + i * 0.07, { type: 'square', vol: 0.045, d: 0.06 }); tone(2093 + i * 120, t + i * 0.07 + 0.04, { type: 'square', vol: 0.045, d: 0.1 }); } } },
      tick: { min: 0.03, f: function (t) { tone(1900, t, { type: 'square', vol: 0.035, d: 0.03 }); } },
      levelup: { min: 0.2, f: function (t) { ['C5', 'E5', 'G5'].forEach(function (n, i) { brass(n, t + i * 0.09, 0.2, 0.08); }); brass('C6', t + 0.27, 0.5, 0.1); } },
      join: { min: 0.5, f: function (t) { brass('D4', t, 0.25, 0.09); brass('A4', t + 0.2, 0.25, 0.09); brass('D5', t + 0.4, 0.3, 0.1); brass('F#5', t + 0.6, 0.8, 0.11); noise(t + 0.6, { vol: 0.05, d: 0.6, type: 'highpass', f: 4500 }); } },
      medal: { min: 0.3, f: function (t) { tone(hz('E6'), t, { type: 'sine', vol: 0.1, d: 0.5 }); tone(hz('B6'), t + 0.08, { type: 'sine', vol: 0.08, d: 0.6 }); ['E5', 'G#5', 'B5', 'E6'].forEach(function (n, i) { tone(hz(n), t + i * 0.05, { type: 'triangle', vol: 0.1, d: 0.3 }); }); } },
      stamp: { min: 0.1, f: function (t) { noise(t, { vol: 0.3, d: 0.16, f: 700, to: 120 }); tone(110, t, { vol: 0.3, d: 0.2, to: 45 }); tone(hz('A5'), t + 0.02, { type: 'triangle', vol: 0.07, d: 0.5 }); } },
      // ---- 戦闘 ----
      'shot.inf': { min: 0.07, f: function (t, v) { for (var i = 0; i < 3; i++) noise(t + i * 0.055 + rnd(0, 0.01), { vol: 0.13 * v, d: 0.07, type: 'bandpass', f: rnd(1500, 2600), q: 0.9 }); } },
      'shot.at': { min: 0.12, f: function (t, v) { noise(t, { vol: 0.16 * v, d: 0.32, type: 'bandpass', f: 500, to: 2200, q: 1.2 }); tone(140, t, { vol: 0.14 * v, d: 0.12, to: 70 }); } },
      'shot.tank': { min: 0.12, f: function (t, v) { noise(t, { vol: 0.26 * v, d: 0.22, f: 1500, to: 180 }); tone(rnd(85, 105), t, { vol: 0.3 * v, d: 0.24, to: 38 }); } },
      'shot.art': { min: 0.15, f: function (t, v) { noise(t, { vol: 0.24 * v, d: 0.4, f: 800, to: 110 }); tone(rnd(58, 70), t, { vol: 0.36 * v, d: 0.42, to: 28 }); } },
      boom: { min: 0.06, f: function (t, v, p) { boomAt(t, p || 1, 0.24 * v); } },
      kill: { min: 0.12, f: function (t, v) { boomAt(t, 2, 0.32 * v); noise(t + 0.08, { vol: 0.16 * v, d: 0.7, f: 2400, to: 200, q: 0.5 }); } },
      crit: { min: 0.1, f: function (t, v) { noise(t, { vol: 0.14 * v, d: 0.09, type: 'highpass', f: 3500 }); tone(1250, t, { type: 'square', vol: 0.045 * v, d: 0.1, to: 820 }); } },
      found: { min: 0.3, f: function (t) { tone(1320, t, { type: 'sine', vol: 0.11, d: 0.25 }); tone(1760, t + 0.09, { type: 'sine', vol: 0.09, d: 0.3 }); } },
      spawn: { min: 0.3, f: function (t) { noise(t, { vol: 0.05, d: 0.1, type: 'bandpass', f: 2200, q: 3 }); tone(660, t + 0.05, { type: 'square', vol: 0.06, d: 0.07 }); tone(880, t + 0.14, { type: 'square', vol: 0.06, d: 0.12 }); } },
      capture: { min: 0.3, f: function (t) { brass('G4', t, 0.14, 0.09); brass('C5', t + 0.12, 0.14, 0.09); brass('E5', t + 0.24, 0.36, 0.1); } },
      lost: { min: 0.3, f: function (t) { brass('E4', t, 0.18, 0.09); brass('C4', t + 0.16, 0.18, 0.09); brass('A3', t + 0.32, 0.4, 0.1); } },
      heli: { min: 0.5, f: function (t) { for (var i = 0; i < 18; i++) noise(t + i * 0.075, { vol: 0.1 * Math.sin(Math.PI * (i + 1) / 19), d: 0.06, f: 520, to: 180 }); } },
      jet: { min: 0.5, f: function (t) { noise(t, { vol: 0.2, a: 0.5, d: 1.7, type: 'bandpass', f: 500, to: 3200, q: 0.8 }); noise(t + 0.6, { vol: 0.14, a: 0.3, d: 1.4, f: 2600, to: 300 }); } },
      drone: { min: 0.5, f: function (t) { tone(190, t, { type: 'sawtooth', vol: 0.07, d: 1.05, to: 330, vib: 28, lp: 1500 }); } },
      missile: { min: 0.3, f: function (t) { noise(t, { vol: 0.18, a: 0.25, d: 1.15, type: 'bandpass', f: 700, to: 2600, q: 1 }); tone(880, t, { type: 'sine', vol: 0.05, d: 1.15, to: 240 }); } },
      // 指揮官のスキル(p = スキルの種類)
      skill: { min: 0.15, f: function (t, v, p) {
        noise(t, { vol: 0.09, a: 0.08, d: 0.3, type: 'bandpass', f: 400, to: 3000, q: 0.9 });
        if (p === 'charge') { brass('D4', t, 0.16, 0.1); brass('A4', t + 0.14, 0.16, 0.1); brass('D5', t + 0.28, 0.5, 0.12); }
        else if (p === 'armor' || p === 'reflect') { tone(520, t, { type: 'square', vol: 0.08, d: 0.5, to: 505 }); tone(1310, t, { type: 'sine', vol: 0.09, d: 0.7 }); noise(t, { vol: 0.2, d: 0.08, type: 'highpass', f: 2200 }); tone(110, t, { vol: 0.22, d: 0.3, to: 60 }); }
        else if (p === 'snipe') { noise(t + 0.45, { vol: 0.3, d: 0.12, type: 'highpass', f: 1800 }); tone(1900, t + 0.45, { type: 'sine', vol: 0.07, d: 0.9, to: 1700 }); tone(90, t + 0.45, { vol: 0.25, d: 0.2, to: 40 }); }
        else if (p === 'heal') { ['E5', 'G#5', 'B5', 'E6'].forEach(function (n, i) { tone(hz(n), t + i * 0.08, { type: 'sine', vol: 0.11, d: 0.5 }); }); }
        else if (p === 'blitz') { ['D5', 'F5', 'A5', 'D6', 'F6', 'A6'].forEach(function (n, i) { tone(hz(n), t + i * 0.045, { type: 'square', vol: 0.05, d: 0.09 }); }); }
        else if (p === 'smoke') { noise(t, { vol: 0.16, a: 0.15, d: 1.1, type: 'highpass', f: 2600, to: 900 }); }
        else if (p === 'mark') { for (var i = 0; i < 3; i++) tone(1480, t + i * 0.16, { type: 'sine', vol: 0.1, d: 0.14, to: 1700 }); }
        else if (p === 'barrage' || p === 'air') { tone(600, t, { type: 'sawtooth', vol: 0.06, d: 0.9, to: 1100, lp: 2200 }); }
        else { brass('A4', t, 0.3, 0.1); }
      } },
      // 敵将: 予告の警報・残り秒数の刻み・発動・阻止
      ewarn: { min: 0.5, f: function (t) { for (var i = 0; i < 3; i++) { tone(740, t + i * 0.26, { type: 'square', vol: 0.085, d: 0.12, lp: 2400 }); tone(587, t + i * 0.26 + 0.12, { type: 'square', vol: 0.085, d: 0.12, lp: 2400 }); } tone(55, t, { type: 'sawtooth', vol: 0.16, d: 0.9, lp: 300 }); } },
      etick: { min: 0.2, f: function (t, v, p) { tone(p <= 3 ? 1180 : 880, t, { type: 'square', vol: 0.06, d: 0.07, lp: 3000 }); } },
      ecast: { min: 0.5, f: function (t) { ['D2', 'G#2', 'D3'].forEach(function (n) { tone(hz(n), t, { type: 'sawtooth', vol: 0.15, a: 0.02, d: 1.3, hold: 0.5, lp: 900, lpTo: 200 }); }); noise(t, { vol: 0.22, a: 0.01, d: 0.9, f: 1800, to: 120 }); tone(48, t, { vol: 0.35, d: 0.6, to: 28 }); } },
      estop: { min: 0.5, f: function (t) { noise(t, { vol: 0.2, d: 0.1, type: 'highpass', f: 2500 }); brass('A4', t, 0.12, 0.1); brass('D5', t + 0.1, 0.12, 0.1); brass('F#5', t + 0.2, 0.5, 0.12); } },
      // タイトル: 低い打撃と、金管の短い主題
      title: { min: 1, f: function (t) { kick(t, 0.3); noise(t, { vol: 0.12, d: 0.5, f: 2400, to: 200 }); [['D4', 0.05, 0.3], ['A4', 0.3, 0.3], ['D5', 0.55, 0.3], ['F5', 0.8, 0.9]].forEach(function (x) { brass(x[0], t + x[1], x[2] + 0.1, 0.1); }); brass('A4', t + 0.8, 1.0, 0.07); brass('D4', t + 0.8, 1.0, 0.07); noise(t + 0.8, { vol: 0.05, d: 0.8, type: 'highpass', f: 5000 }); } },
      // 開戦・ボス・決着
      go: { min: 0.5, f: function (t) { tone(70, t, { vol: 0.35, d: 0.35, to: 40 }); noise(t, { vol: 0.14, d: 0.2, f: 500, to: 100 }); brass('D4', t + 0.05, 0.5, 0.08); brass('A4', t + 0.05, 0.5, 0.06); } },
      boss: { min: 0.5, f: function (t) { for (var i = 0; i < 3; i++) { tone(62, t + i * 0.34, { vol: 0.4, d: 0.4, to: 34 }); noise(t + i * 0.34, { vol: 0.16, d: 0.22, f: 420, to: 90 }); } ['D2', 'A2', 'D#3'].forEach(function (n) { tone(hz(n), t + 0.95, { type: 'sawtooth', vol: 0.13, a: 0.1, d: 1.8, hold: 0.8, lp: 700, lpTo: 180 }); }); } },
      win: { min: 1, f: function (t) {
        var seqn = [['G4', 0, 0.16], ['G4', 0.16, 0.16], ['G4', 0.32, 0.16], ['C5', 0.48, 0.4], ['A4', 0.9, 0.16], ['C5', 1.06, 0.16], ['E5', 1.24, 0.95]];
        seqn.forEach(function (x) { brass(x[0], t + x[1], x[2] + 0.1, 0.11); });
        [['C3', 0.48], ['F3', 0.9], ['C3', 1.24]].forEach(function (x) { tone(hz(x[0]), t + x[1], { type: 'triangle', vol: 0.2, d: 0.5 }); });
        brass('G5', t + 1.24, 1.05, 0.07); brass('C5', t + 1.24, 1.05, 0.07);
        [0.48, 1.24].forEach(function (x) { tone(80, t + x, { vol: 0.3, d: 0.3, to: 42 }); noise(t + x, { vol: 0.08, d: 0.5, type: 'highpass', f: 5000 }); });
      } },
      lose: { min: 1, f: function (t) {
        [['A4', 0, 0.4], ['G4', 0.42, 0.4], ['F4', 0.84, 0.4], ['D4', 1.26, 1.1]].forEach(function (x) { brass(x[0], t + x[1], x[2] + 0.12, 0.09); });
        [['D3', 0], ['A#2', 0.84], ['D2', 1.26]].forEach(function (x) { tone(hz(x[0]), t + x[1], { type: 'triangle', vol: 0.2, d: 0.9 }); });
      } },
      rankS: { min: 0.5, f: function (t) { noise(t, { vol: 0.3, d: 0.16, f: 800, to: 120 }); tone(100, t, { vol: 0.3, d: 0.22, to: 42 }); ['C6', 'E6', 'G6', 'C7'].forEach(function (n, i) { tone(hz(n), t + 0.05 + i * 0.05, { type: 'triangle', vol: 0.1, d: 0.5 }); }); } }
    };
    // name: 効果音の名前, p: 種類など, v: 音量の倍率(0〜1)
    function play(name, p, v) {
      played[name] = (played[name] || 0) + 1;
      var fx = FX[name];
      if (!fx || !running() || cfg.mute || cfg.se <= 0) return;
      var t = ctx.currentTime;
      if (lastAt[name] !== undefined && t - lastAt[name] < fx.min) return;
      // 鳴りすぎないように(同時に鳴る音が多いときは、発砲・着弾から間引く)
      if (voices > 40 && name.indexOf('shot.') === 0) return;
      if (voices > 56 && (name === 'boom' || name === 'crit' || name === 'tick' || name === 'found')) return;
      lastAt[name] = t;
      try { fx.f(t + 0.005, v === undefined ? 1 : v, p); } catch (e) { }
      // 大きな音のあいだ、BGMを少し下げる
      if (name === 'win' || name === 'lose' || name === 'boss' || name === 'ecast' || name === 'join') duck(name === 'win' || name === 'lose' ? 2.6 : 1.4);
    }
    function duck(sec) {
      if (!ctx) return;
      var t = ctx.currentTime;
      duckUntil = t + sec;
      bgmBus.gain.cancelScheduledValues(t);
      bgmBus.gain.setTargetAtTime(cfg.bgm * BGM_GAIN * 0.25, t, 0.05);
      bgmBus.gain.setTargetAtTime(cfg.bgm * BGM_GAIN, t + sec, 0.4);
    }

    // ---- BGM(小さなシーケンサー。16分音符ごとに音を置く) ----
    // 曲は [コード進行ごとの小節] の並び。bass/arp/lead は度数ではなく音名で書く
    function chord(root, kind) { // root: 'D3'。kind: m / M
      var f = hz(root), th = kind === 'M' ? 4 : 3;
      return [f, f * Math.pow(2, th / 12), f * Math.pow(2, 7 / 12)];
    }
    var SONGS = {
      // 基地: ゆっくりした低い持続音に、ソナーのような音がぽつぽつ鳴る
      menu: { bpm: 72, bars: [['D3', 'm'], ['A#2', 'M'], ['F3', 'M'], ['C3', 'M'], ['D3', 'm'], ['A#2', 'M'], ['G2', 'm'], ['A2', 'M']],
        step: function (s, bar, t, sp) {
          var ch = chord(this.bars[bar][0], this.bars[bar][1]), root = ch[0];
          if (s === 0) { ch.forEach(function (f, i) { tone(f, t, { type: 'sawtooth', vol: 0.05, a: 0.5, d: sp * 16.5, hold: sp * 12, lp: 900, bus: bgmBus }); tone(f * 2.004, t, { type: 'triangle', vol: 0.022, a: 0.8, d: sp * 16.5, hold: sp * 11, bus: bgmBus }); }); tone(root, t, { type: 'triangle', vol: 0.1, a: 0.05, d: sp * 15, hold: sp * 10, bus: bgmBus }); }
          if (s === 0 || s === 10) kick(t, 0.16, bgmBus);
          if (s === 4 || s === 12) noise(t, { vol: 0.02, d: 0.05, type: 'highpass', f: 6500, bus: bgmBus });
          var mel = [[2, 2], [6, 1], [9, 0], [14, 2]], k;
          for (k = 0; k < mel.length; k++) if (mel[k][0] === s && (bar % 2 === 0 || k < 2)) tone(ch[mel[k][1]] * 4, t, { type: 'sine', vol: 0.05, d: 0.9, bus: bgmBus });
          if (bar % 4 === 3 && s === 12) tone(ch[2] * 2, t, { type: 'triangle', vol: 0.05, d: 0.7, bus: bgmBus });
        } },
      // 戦闘: 低音の刻みと行進のドラム、節目に弦の和音
      battle: { bpm: 126, bars: [['D2', 'm'], ['D2', 'm'], ['A#1', 'M'], ['C2', 'M'], ['D2', 'm'], ['F2', 'M'], ['G2', 'm'], ['A2', 'M']],
        lead: [['D5', 0, 3], ['F5', 3, 3], ['A5', 6, 2], ['G5', 8, 4], ['F5', 12, 2], ['E5', 14, 2]],
        step: function (s, bar, t, sp) {
          var ch = chord(this.bars[bar][0], this.bars[bar][1]), root = ch[0], hi = this === SONGS.boss;
          // 低音: 8分の刻み(ところどころ1オクターブ上)
          if (s % 2 === 0) tone(root * (s === 6 || s === 14 ? 4 : 2), t, { type: 'sawtooth', vol: 0.11, d: sp * 1.7, lp: 950, bus: bgmBus });
          else if (hi) tone(root * 2, t, { type: 'sawtooth', vol: 0.06, d: sp * 0.9, lp: 800, bus: bgmBus });
          if (s === 0 || s === 8 || (s === 10 && bar % 2) || (hi && s === 6)) kick(t, 0.24, bgmBus);
          if (s === 4 || s === 12) noise(t, { vol: 0.11, d: 0.13, type: 'bandpass', f: 1700, q: 0.7, bus: bgmBus });
          if (bar % 4 === 3 && s >= 12) noise(t, { vol: 0.07, d: 0.06, type: 'bandpass', f: 1900, q: 0.7, bus: bgmBus }); // 小太鼓の連打
          if (s % 2 === 0) noise(t, { vol: s % 4 === 2 ? 0.035 : 0.02, d: 0.035, type: 'highpass', f: 7000, bus: bgmBus });
          if (s === 0) ch.forEach(function (f) { tone(f * 4, t, { type: 'sawtooth', vol: 0.035, a: 0.03, d: sp * 7, hold: sp * 3, lp: 1500, bus: bgmBus }); });
          if (s === 10 && bar % 2) ch.forEach(function (f) { tone(f * 4, t, { type: 'sawtooth', vol: 0.03, a: 0.02, d: sp * 3, lp: 1700, bus: bgmBus }); });
          // 旋律(4小節目からの後半だけ)
          if (bar >= 4 && bar % 2 === 0) { var L = this.lead, i; for (i = 0; i < L.length; i++) if (L[i][1] === s) tone(hz(L[i][0]) * (hi ? Math.pow(2, 2 / 12) : 1), t, { type: 'triangle', vol: 0.07, a: 0.01, d: sp * L[i][2] * 1.1, bus: bgmBus }); }
        } },
      boss: null
    };
    // ボス戦: 戦闘の曲を速く・全音上げて・音数を増やす
    SONGS.boss = { bpm: 144, bars: [['E2', 'm'], ['E2', 'm'], ['C2', 'M'], ['D2', 'M'], ['E2', 'm'], ['G2', 'M'], ['A2', 'm'], ['B2', 'M']], lead: SONGS.battle.lead, step: SONGS.battle.step };
    function startSeq() {
      stopSeq();
      if (!wantTheme || !running()) return;
      theme = wantTheme;
      var song = SONGS[theme], sp = 60 / song.bpm / 4;
      seq = { song: song, sp: sp, step: 0, next: ctx.currentTime + 0.08 };
      seqTimer = setInterval(pump, 60);
      pump();
    }
    function pump() {
      if (!seq || !running()) return;
      var ahead = ctx.currentTime + 0.22;
      // 画面が止まっていた分は飛ばす(まとめて鳴らさない)
      if (seq.next < ctx.currentTime - 0.3) seq.next = ctx.currentTime + 0.05;
      while (seq.next < ahead) {
        var n = seq.song.bars.length * 16, s = seq.step % n;
        if (cfg.bgm > 0 && !cfg.mute) { try { seq.song.step(s % 16, Math.floor(s / 16), seq.next, seq.sp); } catch (e) { } }
        seq.step++; steps++; seq.next += seq.sp;
      }
    }
    function stopSeq() { if (seqTimer) clearInterval(seqTimer); seqTimer = null; seq = null; theme = null; }
    function bgm(name) {
      wantTheme = name && SONGS[name] ? name : null;
      if (!wantTheme) { stopSeq(); return; }
      if (theme === wantTheme && seqTimer) return;
      if (running()) startSeq();
    }
    function set(o) {
      if (o.se !== undefined) cfg.se = Math.max(0, Math.min(1, +o.se));
      if (o.bgm !== undefined) cfg.bgm = Math.max(0, Math.min(1, +o.bgm));
      if (o.mute !== undefined) cfg.mute = !!o.mute;
      try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { }
      applyVol();
    }
    // 最初の操作で有効に。裏に回ったら止め、戻ったら再開
    ['pointerdown', 'touchend', 'keydown', 'click'].forEach(function (ev) { document.addEventListener(ev, unlock, true); });
    document.addEventListener('visibilitychange', function () {
      if (!ctx) return;
      if (document.hidden) { if (seqTimer) { clearInterval(seqTimer); seqTimer = null; } try { ctx.suspend(); } catch (e) { } }
      else unlock();
    });
    return {
      play: play, bgm: bgm, set: set, unlock: unlock, duck: duck,
      cfg: function () { return { se: cfg.se, bgm: cfg.bgm, mute: cfg.mute }; },
      // いま出ている音の大きさ(確認用): peak = 波形の最大値(1 を超えると音が割れる)、rms = 平均的な大きさ
      meter: function () {
        if (!meterNode) return { peak: 0, rms: 0 };
        meterNode.getFloatTimeDomainData(meterBuf);
        var pk = 0, sq = 0;
        for (var i = 0; i < meterBuf.length; i++) { var a = Math.abs(meterBuf[i]); if (a > pk) pk = a; sq += a * a; }
        return { peak: pk, rms: Math.sqrt(sq / meterBuf.length) };
      },
      // テスト・確認用
      debug: function () { return { ok: !!AC, state: ctx ? ctx.state : 'none', played: played, theme: theme, want: wantTheme, steps: steps, voices: voices, cfg: { se: cfg.se, bgm: cfg.bgm, mute: cfg.mute } }; }
    };
  })();
