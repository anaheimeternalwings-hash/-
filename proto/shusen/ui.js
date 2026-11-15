  // ====== 朱線(試作)の画面 ======
  var KEY = 'shusen-proto-v1';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) { var d = document.createElement('div'); d.textContent = msg; $('toast').appendChild(d); setTimeout(function () { d.remove(); }, 2400); }

  // ---- 絵(本体から抜き出して埋め込んだもの) ----
  var IMG = {};
  function img(k) {
    if (!ART_DATA.img[k]) return null;
    if (!IMG[k]) { IMG[k] = new Image(); IMG[k].src = ART_DATA.img[k]; }
    return IMG[k].complete && IMG[k].naturalWidth ? IMG[k] : null;
  }
  Object.keys(ART_DATA.img).forEach(img);
  // 顔: 枠いっぱいに、顔の位置へ寄せる
  function face(el, k, z) {
    if (!el || !ART_DATA.img[k]) return;
    z = z || 1.55;
    var m = ART_DATA.meta[k] || [0.5, 0.45];
    var pos = m.map(function (f) { return Math.max(0, Math.min(100, (0.5 - f * z) / (1 - z) * 100)).toFixed(1) + '%'; });
    el.style.backgroundImage = 'url(' + ART_DATA.img[k] + ')';
    el.style.backgroundSize = (z * 100) + '%';
    el.style.backgroundPosition = pos.join(' ');
  }
  function faceHtml(k, cls, z) { return '<div class="face ' + (cls || '') + '" data-face="' + k + '" data-z="' + (z || 1.55) + '"></div>'; }
  function hydrate(root) { Array.prototype.forEach.call(root.querySelectorAll('[data-face]'), function (el) { face(el, el.dataset.face, +el.dataset.z); }); }
  function era(n) { return n <= 4 ? 1 : n <= 8 ? 2 : 3; }
  function unitKey(t, n) { return 'u.' + t + '.' + era(n); }

  // ---- 保存 ----
  var P = (function () { try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1) return o; } catch (e) { } return null; })() || { v: 1, stars: {}, cmd: 'rai', comp: 'even', tut: 0, battle: null };
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) { } }
  function cleared() { var c = 0; for (var n = 1; n <= 10; n++) if (P.stars[n]) c = n; return c; }

  // ---- 戦区の地図 ----
  function renderMap() {
    var c = cleared(), tot = 0, h = '';
    for (var n = 1; n <= 10; n++) {
      var g = SH.stage(n), st = P.stars[n] || 0, lock = n > c + 1;
      tot += st;
      h += '<button class="node' + (n === c + 1 ? ' cur' : st ? ' done' : '') + (lock ? ' lock' : '') + (g.boss ? ' boss' : '') + '" data-act="stage" data-n="' + n + '"' + (lock ? ' disabled' : '') + '>' +
        '<div class="no"><span>' + n + '</span></div>' + faceHtml('e.' + g.ecmd.id) +
        '<div class="tx"><b>' + esc(g.name) + '</b><small>敵将「' + esc(g.ecmd.name) + '」 ' + esc(g.ecmd.trait) + '</small></div>' +
        '<div class="st">' + '★★★'.slice(0, st) + '<span style="color:#3a3a34">' + '★★★'.slice(st) + '</span></div></button>';
    }
    $('mPath').innerHTML = h;
    $('mStars').textContent = '★' + tot + '/30';
    hydrate($('mPath'));
    sndLabel();
    var cur = $('mPath').querySelector('.cur');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }
  function show(v) { ['map', 'battle'].forEach(function (k) { $(k).classList.toggle('hidden', k !== v); }); }
  function openSheet(html) { $('sheet').innerHTML = html; $('sheetWrap').classList.remove('hidden'); hydrate($('sheet')); }
  function closeSheet() { $('sheetWrap').classList.add('hidden'); $('sheet').innerHTML = ''; }
  function openModal(html) { $('modal').innerHTML = html; $('modalWrap').classList.remove('hidden'); hydrate($('modal')); }
  function closeModal() { $('modalWrap').classList.add('hidden'); $('modal').innerHTML = ''; }

  // 出撃前: 敵将・戦場・指揮官・編成
  var selN = 1;
  function openStage(n) {
    selN = n;
    var g = SH.stage(n), f = g.field, mini = '';
    for (var r = SH.R - 1; r >= 0; r--) for (var l = 0; l < SH.L; l++) {
      var cls = r < 3 ? 'p' : r >= 6 ? 'e' : '', t = f[l][r];
      if (t === 1) cls += ' t'; else if (t === 2) cls += ' h'; else if (t === 3) cls += ' r';
      mini += '<i class="' + cls + '"></i>';
    }
    var h = '<button class="ibtn x" data-act="close" aria-label="閉じる">✕</button><h3>戦場' + n + '「' + esc(g.name) + '」</h3>' +
      '<div class="foe">' + faceHtml('e.' + g.ecmd.id, '', 1.4) + '<div><b>敵将「' + esc(g.ecmd.name) + '」</b><div style="font-size:13px;color:var(--sub)">' + esc(g.ecmd.trait) + '・技「' + SH.SKILLS[g.eSkill].name + '」</div>' +
      '<div style="font-size:11px;color:var(--dim)">' + (g.eRate > 1.05 ? '敵の補給は遅め' : g.eRate < 0.95 ? '敵の補給は速い' : '敵の補給は互角') + '</div></div></div>' +
      '<div class="sec">戦場(下が自分の本陣)</div><div class="mini">' + mini + '</div>' +
      '<div class="sec">指揮官(技は1戦に1回)</div><div class="choices">' + SH.CMDS.map(function (c) {
        return '<button class="ch' + (P.cmd === c.id ? ' on' : '') + '" data-act="cmd" data-id="' + c.id + '">' + faceHtml('h.' + c.id) + '<b>' + c.name.split(' ')[0] + '</b>' + SH.SKILLS[c.skill].name + '</button>';
      }).join('') + '</div><div style="font-size:11px;color:var(--sub);margin-top:4px">' + esc(SH.SKILLS[cmdOf().skill].desc) + '</div>' +
      '<div class="sec">編成(届く10部隊の中身)</div><div class="choices">' + Object.keys(SH.COMPS).map(function (k) {
        var c = SH.COMPS[k], cnt = {};
        c.comp.forEach(function (t) { cnt[t] = (cnt[t] || 0) + 1; });
        return '<button class="ch' + (P.comp === k ? ' on' : '') + '" data-act="comp" data-id="' + k + '"><b>' + c.name + '</b>歩' + (cnt.inf || 0) + ' 対' + (cnt.at || 0) + ' 戦' + (cnt.tank || 0) + '</button>';
      }).join('') + '</div>' +
      '<button class="btn" data-act="go">出撃</button>';
    openSheet(h);
  }
  function cmdOf() { return SH.CMDS.filter(function (c) { return c.id === P.cmd; })[0] || SH.CMDS[0]; }

  // ====== 戦闘 ======
  var B = null, cv = $('cv'), cx = cv.getContext('2d'), DPR = 1, CW = 0, CH = 0, G = null, paper = null, raf = 0, lastTs = 0;
  function resize() {
    var r = $('boardWrap').getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    CW = Math.max(100, r.width); CH = Math.max(100, r.height);
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    var pad = 6, bw = CW - pad * 2, bh = CH - pad * 2;
    G = { x0: pad, y0: pad, bw: bw, bh: bh, lw: bw / SH.L, rh: bh / SH.R };
    G.tok = Math.min(G.lw * 0.33, G.rh * 0.42);
    makePaper();
  }
  // 紙の質感(1回だけ描いておく)
  function makePaper() {
    paper = document.createElement('canvas');
    paper.width = cv.width; paper.height = cv.height;
    var g = paper.getContext('2d');
    g.scale(DPR, DPR);
    g.fillStyle = '#e8dfc9'; g.fillRect(G.x0, G.y0, G.bw, G.bh);
    var r = SH.makeField ? 1 : 1, seed = 7;
    function rr() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    for (var i = 0; i < 900; i++) { g.fillStyle = 'rgba(80,60,30,' + (rr() * 0.06) + ')'; g.fillRect(G.x0 + rr() * G.bw, G.y0 + rr() * G.bh, 1 + rr() * 2, 1 + rr() * 2); }
    for (i = 0; i < 60; i++) { g.strokeStyle = 'rgba(90,70,40,' + (0.03 + rr() * 0.04) + ')'; g.lineWidth = 0.6; var x = G.x0 + rr() * G.bw, y = G.y0 + rr() * G.bh; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rr() - 0.5) * 40, y + (rr() - 0.5) * 12); g.stroke(); }
    var vg = g.createRadialGradient(G.x0 + G.bw / 2, G.y0 + G.bh / 2, G.bh * 0.25, G.x0 + G.bw / 2, G.y0 + G.bh / 2, G.bh * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(60,40,10,.22)');
    g.fillStyle = vg; g.fillRect(G.x0, G.y0, G.bw, G.bh);
  }
  function xOf(l) { return G.x0 + (l + 0.5) * G.lw; }
  function yOf(s, p) { return G.y0 + (s === 0 ? SH.R - p : p) * G.rh; }
  function laneAt(x) { return Math.max(0, Math.min(SH.L - 1, Math.floor((x - G.x0) / G.lw))); }

  function startBattle(n, resume) {
    closeSheet(); closeModal();
    var g = SH.stage(n), c = cmdOf(), S;
    if (resume && resume.S) S = resume.S;
    else S = SH.create({ seed: (Math.random() * 2147483647) | 0, comp: [SH.COMPS[P.comp].comp, g.eComp], field: g.field, skill: [c.skill, g.eSkill], eRate: g.eRate, ai: [null, g.ai], style: g.ecmd.style });
    B = { n: n, g: g, S: S, ei: S.ev.length, fx: [], texts: [], flash: [], shake: 0, armed: false, pos: {}, overWas: [0, 0, 0, 0, 0], eOverWas: [0, 0, 0, 0, 0], tip: null, tipT: 0, tipQ: [], qKey: '', saveT: 0, paused: false, hot: false, breachSaid: false, shotT: 0, lastTake: 0, startT: S.t };
    show('battle');
    resize();
    face($('eFace'), 'e.' + g.ecmd.id, 1.4);
    $('eName').textContent = '敵将「' + g.ecmd.name + '」';
    $('eTrait').textContent = g.ecmd.trait + ' ・ 戦場' + n + '「' + g.name + '」';
    face($('sFace'), 'h.' + c.id, 1.5);
    $('sName').textContent = SH.SKILLS[c.skill].name;
    $('sDesc').textContent = SH.SKILLS[c.skill].lane ? '押して、列をタップ(1回だけ)' : SH.SKILLS[c.skill].desc;
    $('clock').classList.remove('hot');
    SND.bgm('battle');
    if (!resume) SND.play('go');
    // 遊び方のひとこと(最初の2戦)
    if (!(P.tut & 1)) tipQ(['列をタップすると、下の「次に出る」部隊がその列へ走ります。2秒ほどで次が届きます', '相性: 歩兵→対戦車兵→戦車→歩兵(矢印の先に強い)。敵の先頭を見て当てよう']);
    lastTs = 0;
    if (resume) pause(true);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  function tipQ(list) { list.forEach(function (t) { B.tipQ.push(t); }); }
  function fitCheck() { if (B && (Math.abs(cv.clientWidth - CW) > 1 || Math.abs(cv.clientHeight - CH) > 1)) resize(); }
  function frame(ts) {
    if (!B) return;
    fitCheck();
    var dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0.016;
    lastTs = ts;
    if (!B.paused) {
      var left = dt;
      while (left > 1e-6 && !B.S.done) { var d = Math.min(0.05, left); SH.step(B.S, d); left -= d; events(); }
      B.saveT += dt;
      if (B.saveT > 1 && !B.S.done) { B.saveT = 0; P.battle = { n: B.n, S: strip(B.S) }; save(); }
    }
    fxUpdate(dt);
    draw();
    hud();
    if (B.S.done && !B.ended) { B.ended = true; setTimeout(endBattle, 1400); }
    raf = requestAnimationFrame(frame);
  }
  function strip(S) { return Object.assign({}, S, { ev: [] }); }

  // ---- 出来事 → 演出と音 ----
  function events() {
    var S = B.S;
    while (B.ei < S.ev.length) {
      var e = S.ev[B.ei++];
      if (e.k === 'send' && e.s === 0) { B.flash.push({ l: e.l, t: 0, c: 'rgba(255,90,60,' }); SND.play('tab'); }
      else if (e.k === 'retreat') {
        B.flash.push({ l: e.l, t: 0, c: e.s === 0 ? 'rgba(255,220,120,' : 'rgba(120,160,220,', ret: e.s });
        if (e.s === 0) { SND.play('close'); text(xOf(e.l), yOf(0, S.h[0][e.l]) + 4, '後退', '#ffd27a', 15); }
        else text(xOf(e.l), yOf(1, S.h[1][e.l]) - 4, '敵が後退', '#a8c4e4', 12);
      } else if (e.k === 'die') {
        var p = B.pos[e.id];
        if (p) { burst(p.x, p.y, e.type === 'tank' ? 1.4 : 1); SND.play('boom', e.type === 'tank' ? 1.3 : 0.9, e.s === 1 ? 1 : 0.7); }
      } else if (e.k === 'collapse') {
        var mine = e.s === 0;
        B.flash.push({ l: e.l, t: 0, c: mine ? 'rgba(80,120,200,' : 'rgba(255,180,60,', big: true });
        B.shake = 12;
        text(xOf(e.l), G.y0 + G.bh / 2, mine ? '総崩れ…' : '敵が総崩れ!', mine ? '#9cc0ea' : '#ffd166', 26, true);
        SND.play('kill'); SND.play(mine ? 'lost' : 'capture');
        if (!mine && !(P.tut & 4)) { P.tut |= 4; save(); tipQ(['敵の列を崩した! 隣より4段以上出すぎた列は、部隊が全滅すると隣の高さまで一気に取り返されます']); }
      } else if (e.k === 'take' && e.s === 0) {
        if (S.t - B.lastTake > 0.15) { B.lastTake = S.t; SND.play('tick'); }
        stamp(xOf(e.l), yOf(0, e.c + 0.5));
      } else if (e.k === 'skill') {
        var sk = SH.SKILLS[e.sk];
        text(G.x0 + G.bw / 2, G.y0 + G.bh * (e.s === 0 ? 0.62 : 0.38), (e.s === 0 ? '' : '敵の技 ') + '「' + sk.name + '」', e.s === 0 ? '#ffd166' : '#a8c4e4', 24, true);
        SND.play('skill', e.sk === 'barrage' ? 'barrage' : e.sk === 'rush' ? 'blitz' : 'armor');
        if (e.sk === 'barrage') { B.shake = 9; for (var i = 0; i < 6; i++) burst(xOf(e.l) + (Math.random() - 0.5) * G.lw * 0.6, yOf(1 - e.s, 1 + Math.random() * 5), 1.3); SND.play('missile'); }
      }
    }
  }
  // 粒・文字
  function burst(x, y, size) {
    for (var i = 0; i < 14 * size; i++) { var a = Math.random() * 6.283, v = 30 + Math.random() * 90 * size; B.fx.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, life: 0.5 + Math.random() * 0.4, max: 0.9, r: 1.5 + Math.random() * 3 * size, c: Math.random() < 0.35 ? 'f' : 'i' }); }
    B.fx.push({ x: x, y: y, vx: 0, vy: 0, life: 0.25, max: 0.25, r: 22 * size, c: 'flash' });
  }
  function stamp(x, y) { B.fx.push({ x: x, y: y, vx: 0, vy: 0, life: 0.5, max: 0.5, r: Math.min(G.lw, G.rh) * 0.42, c: 'stamp' }); }
  function text(x, y, s, c, size, big) { B.texts.push({ x: x, y: y, s: s, c: c, size: size || 14, life: big ? 1.6 : 1.0, max: big ? 1.6 : 1.0, big: !!big }); }
  function fxUpdate(dt) {
    B.fx = B.fx.filter(function (p) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 120 * dt; p.vx *= 1 - 3 * dt; return p.life > 0; });
    B.texts = B.texts.filter(function (t) { t.life -= dt; t.y -= (t.big ? 8 : 26) * dt; return t.life > 0; });
    B.flash = B.flash.filter(function (f) { f.t += dt; return f.t < (f.big ? 0.9 : 0.35); });
    B.shake = Math.max(0, B.shake - dt * 30);
    if (B.tip) { B.tipT -= dt; if (B.tipT <= 0) { B.tip = null; $('tip').classList.add('hidden'); } }
    if (!B.tip && B.tipQ.length && !B.paused) { B.tip = B.tipQ.shift(); B.tipT = 4.5; $('tip').textContent = B.tip; $('tip').classList.remove('hidden'); }
  }

  // ---- 描画 ----
  function brush(pts, color, w) {
    for (var k = 0; k < 3; k++) {
      cx.strokeStyle = color; cx.globalAlpha = k === 0 ? 0.95 : 0.35; cx.lineWidth = w * (k === 0 ? 1 : 0.6); cx.lineCap = 'round'; cx.lineJoin = 'round';
      cx.beginPath();
      pts.forEach(function (p, i) { var ox = k ? (k === 1 ? 1.2 : -1) : 0, oy = k ? (k === 1 ? -1.4 : 1.6) : 0; if (i) cx.lineTo(p[0] + ox, p[1] + oy); else cx.moveTo(p[0] + ox, p[1] + oy); });
      cx.stroke();
    }
    cx.globalAlpha = 1;
  }
  function draw() {
    var S = B.S, l, r;
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.clearRect(0, 0, CW, CH);
    cx.save();
    if (B.shake > 0) cx.translate((Math.random() - 0.5) * B.shake, (Math.random() - 0.5) * B.shake);
    cx.drawImage(paper, 0, 0, CW, CH);
    // 陣地の色
    for (l = 0; l < SH.L; l++) {
      var x = G.x0 + l * G.lw, h0 = S.h[0][l], h1 = S.h[1][l];
      cx.fillStyle = 'rgba(200,52,31,.20)'; cx.fillRect(x, yOf(0, h0), G.lw, h0 * G.rh);
      cx.fillStyle = 'rgba(200,52,31,.18)'; cx.fillRect(x, yOf(0, 1), G.lw, G.rh);
      cx.fillStyle = 'rgba(47,74,102,.24)'; cx.fillRect(x, G.y0, G.lw, h1 * G.rh);
      cx.fillStyle = 'rgba(47,74,102,.2)'; cx.fillRect(x, G.y0, G.lw, G.rh);
    }
    // 地形
    for (l = 0; l < SH.L; l++) for (r = 0; r < SH.R; r++) {
      var t = S.field[l][r]; if (!t) continue;
      var cxp = xOf(l), cyp = yOf(0, r + 0.5);
      cx.strokeStyle = 'rgba(28,25,21,.55)'; cx.fillStyle = 'rgba(28,25,21,.5)'; cx.lineWidth = 1.4;
      if (t === 1) { // 町: 墨の家
        var own = SH.owner(S, 0, l, r);
        for (var k = -1; k <= 1; k += 2) { var hx = cxp + k * G.lw * 0.18, hy = cyp + (k > 0 ? 4 : -2), hw = G.lw * 0.16; cx.fillStyle = own === 0 ? 'rgba(200,52,31,.55)' : own === 1 ? 'rgba(47,74,102,.6)' : 'rgba(28,25,21,.35)'; cx.fillRect(hx - hw / 2, hy - hw * 0.4, hw, hw * 0.8); cx.beginPath(); cx.moveTo(hx - hw * 0.65, hy - hw * 0.4); cx.lineTo(hx, hy - hw); cx.lineTo(hx + hw * 0.65, hy - hw * 0.4); cx.closePath(); cx.fill(); }
        cx.fillStyle = 'rgba(28,25,21,.7)'; cx.font = '800 9px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillText('町', cxp, cyp + G.rh * 0.38);
      } else if (t === 2) { // 丘: 墨のなだらかな山の形を2つ
        cx.fillStyle = 'rgba(70,60,40,.16)';
        [[-0.16, 0.22, 0.26], [0.12, 0.3, 0.2]].forEach(function (m) {
          var bx = cxp + m[0] * G.lw, by = cyp + G.rh * 0.22, hw = m[1] * G.lw, hh = m[2] * G.rh * 1.6;
          cx.beginPath(); cx.moveTo(bx - hw, by); cx.quadraticCurveTo(bx - hw * 0.3, by - hh, bx, by - hh); cx.quadraticCurveTo(bx + hw * 0.3, by - hh, bx + hw, by); cx.closePath(); cx.fill(); cx.stroke();
        });
        cx.fillStyle = 'rgba(28,25,21,.6)'; cx.font = '800 9px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillText('丘', cxp, cyp + G.rh * 0.42);
      }
      else if (t === 3) { cx.strokeStyle = 'rgba(40,90,140,.55)'; cx.lineWidth = 2; for (k = 0; k < 2; k++) { cx.beginPath(); for (var i = 0; i <= 12; i++) { var px = G.x0 + l * G.lw + i * G.lw / 12, py = cyp + (k - 0.5) * G.rh * 0.35 + Math.sin(i * 1.3) * 3; if (i) cx.lineTo(px, py); else cx.moveTo(px, py); } cx.stroke(); } }
    }
    // 列の区切りと本陣
    cx.strokeStyle = 'rgba(28,25,21,.18)'; cx.lineWidth = 1; cx.setLineDash([3, 5]);
    for (l = 1; l < SH.L; l++) { cx.beginPath(); cx.moveTo(G.x0 + l * G.lw, G.y0); cx.lineTo(G.x0 + l * G.lw, G.y0 + G.bh); cx.stroke(); }
    cx.setLineDash([]);
    cx.font = '900 10px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillStyle = 'rgba(120,30,18,.6)'; cx.fillText('自 分 の 本 陣', G.x0 + G.bw / 2, yOf(0, 0.18));
    cx.fillStyle = 'rgba(30,50,75,.6)'; cx.fillText('敵 の 本 陣', G.x0 + G.bw / 2, yOf(1, 0.3));
    // 押した・引いた列のきらめき
    B.flash.forEach(function (f) { var a = 1 - f.t / (f.big ? 0.9 : 0.35); cx.fillStyle = f.c + (0.35 * a) + ')'; cx.fillRect(G.x0 + f.l * G.lw, G.y0, G.lw, G.bh); });
    // 出すぎ: 自分の列は赤いしま、敵の列は「挟め」
    for (l = 0; l < SH.L; l++) {
      var o0 = SH.over(S, 0, l), o1 = SH.over(S, 1, l);
      if (o0) {
        var yt = yOf(0, S.h[0][l]), yb = yOf(0, Math.max(1, S.h[0][l] - 2));
        cx.save(); cx.beginPath(); cx.rect(G.x0 + l * G.lw, yt, G.lw, yb - yt); cx.clip();
        cx.strokeStyle = 'rgba(210,30,20,' + (0.35 + 0.25 * Math.sin(S.t * 8)) + ')'; cx.lineWidth = 3;
        for (var q = -G.rh * 3; q < G.lw + G.rh * 3; q += 12) { cx.beginPath(); cx.moveTo(G.x0 + l * G.lw + q, yt); cx.lineTo(G.x0 + l * G.lw + q - (yb - yt), yb); cx.stroke(); }
        cx.restore();
        cx.fillStyle = '#b3160a'; cx.font = '900 11px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillText('出すぎ', xOf(l), yt + 12);
        if (!B.overWas[l]) { SND.play('etick', 2); if (!(P.tut & 2)) { P.tut |= 2; save(); tipQ(['出すぎ! 隣の列より2段以上前に出た列は、横からも撃たれます。列を下にはじくと1段下がって構え直せます']); } }
      }
      B.overWas[l] = o0;
      if (o1) {
        var ye = yOf(1, S.h[1][l]);
        cx.strokeStyle = 'rgba(224,169,59,' + (0.6 + 0.35 * Math.sin(S.t * 10)) + ')'; cx.lineWidth = 3;
        for (var cc = 0; cc < 2; cc++) { var yy = ye + 10 + cc * 9; cx.beginPath(); cx.moveTo(xOf(l) - 12, yy + 6); cx.lineTo(xOf(l), yy); cx.lineTo(xOf(l) + 12, yy + 6); cx.stroke(); }
        cx.fillStyle = '#9a6a10'; cx.font = '900 11px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillText('挟め!', xOf(l), ye + 40);
        if (!B.eOverWas[l] && !(P.tut & 8) && B.n <= 3) { P.tut |= 8; save(); tipQ(['敵が出すぎた列は横からも撃たれて弱っています。相性の良い部隊を送ると崩せます']); }
      }
      B.eOverWas[l] = o1;
    }
    // 前線: 自分は朱の太い筆、敵は藍の筆
    var pp = [], pe = [];
    for (l = 0; l < SH.L; l++) {
      var y0 = yOf(0, S.h[0][l]), y1 = yOf(1, S.h[1][l]), xa = G.x0 + l * G.lw + 1, xb = G.x0 + (l + 1) * G.lw - 1;
      pp.push([xa, y0], [xb, y0]); pe.push([xa, y1], [xb, y1]);
    }
    brush(pe, '#2f4a66', 3.2);
    brush(pp, '#c8341f', 5.5);
    // 部隊(控え → 先頭の順に)
    for (l = 0; l < SH.L; l++) [0, 1].forEach(function (s) {
      var U = SH.laneUnits(S, s, l);
      for (var i = U.length - 1; i >= 0; i--) unit(U[i], i === 0);
    });
    // 撃ち合いの火花
    for (l = 0; l < SH.L; l++) {
      var a = SH.laneUnits(S, 0, l)[0], b = SH.laneUnits(S, 1, l)[0];
      if (a && b && SH.R - a.p - b.p <= SH.K.engage) {
        var ya = yOf(0, a.p), yb2 = yOf(1, b.p);
        if (Math.random() < 0.5) { cx.fillStyle = 'rgba(255,220,120,.9)'; cx.beginPath(); cx.arc(xOf(l) + (Math.random() - 0.5) * 10, (ya + yb2) / 2 + (Math.random() - 0.5) * 10, 2 + Math.random() * 3, 0, 6.283); cx.fill(); }
        if (Math.random() < 0.06 && !B.paused) SND.play('shot.' + (Math.random() < 0.5 ? a.type : b.type), null, 0.5);
      }
    }
    // 突破
    for (l = 0; l < SH.L; l++) [0, 1].forEach(function (s) {
      var bt = S.breach[s][l]; if (!bt) return;
      var u = SH.laneUnits(S, s, l)[0]; if (!u) return;
      var x = xOf(l), y = yOf(s, u.p), k = bt / SH.K.breachT;
      cx.strokeStyle = s === 0 ? '#ffd166' : '#ff4d3a'; cx.lineWidth = 4; cx.beginPath(); cx.arc(x, y, G.tok + 6, -Math.PI / 2, -Math.PI / 2 + k * 6.283); cx.stroke();
      cx.fillStyle = s === 0 ? '#7a4a00' : '#b3160a'; cx.font = '900 12px -apple-system,sans-serif'; cx.textAlign = 'center';
      cx.fillText(s === 0 ? '突破まで ' + (SH.K.breachT - bt).toFixed(1) : '本陣が危ない! ' + (SH.K.breachT - bt).toFixed(1), x, y + (s === 0 ? G.tok + 18 : -G.tok - 10));
      if (s === 1 && !B.breachSaid) { B.breachSaid = true; SND.play('ewarn'); }
    });
    if (!S.breach[1].some(function (v) { return v > 0; })) B.breachSaid = false;
    // 粒と文字
    B.fx.forEach(function (p) {
      var a = p.life / p.max;
      if (p.c === 'flash') { cx.fillStyle = 'rgba(255,240,200,' + (a * 0.7) + ')'; cx.beginPath(); cx.arc(p.x, p.y, p.r * (1.4 - a * 0.4), 0, 6.283); cx.fill(); }
      else if (p.c === 'stamp') { cx.strokeStyle = 'rgba(200,52,31,' + (a * 0.8) + ')'; cx.lineWidth = 3; cx.strokeRect(p.x - p.r * (1.3 - a * 0.3), p.y - p.r * 0.6 * (1.3 - a * 0.3), p.r * 2 * (1.3 - a * 0.3), p.r * 1.2 * (1.3 - a * 0.3)); }
      else { cx.fillStyle = p.c === 'f' ? 'rgba(255,150,60,' + a + ')' : 'rgba(28,22,18,' + (a * 0.85) + ')'; cx.beginPath(); cx.arc(p.x, p.y, p.r * (0.6 + a * 0.4), 0, 6.283); cx.fill(); }
    });
    B.texts.forEach(function (t) {
      var a = Math.min(1, t.life / t.max * 2);
      cx.globalAlpha = a; cx.font = '900 ' + t.size + 'px -apple-system,"Hiragino Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.lineWidth = 4; cx.strokeStyle = 'rgba(15,12,10,.85)'; cx.strokeText(t.s, t.x, t.y); cx.fillStyle = t.c; cx.fillText(t.s, t.x, t.y);
      cx.globalAlpha = 1; cx.textBaseline = 'alphabetic';
    });
    cx.restore();
    // 一時停止
    if (B.paused) {
      cx.fillStyle = 'rgba(0,0,0,.45)'; cx.fillRect(0, 0, CW, CH);
      cx.fillStyle = '#fff'; cx.font = '900 22px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillText(B.count ? String(Math.ceil(B.count)) : '一時停止', CW / 2, CH / 2);
    }
    // 技の狙い
    if (B.armed) { cx.fillStyle = 'rgba(224,169,59,.12)'; cx.fillRect(G.x0, G.y0, G.bw, G.bh); cx.fillStyle = '#7a4a00'; cx.font = '900 14px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillText('砲撃する列をタップ', CW / 2, G.y0 + G.bh * 0.5); }
  }
  function unit(u, lead) {
    var x = xOf(u.l), y = yOf(u.s, u.p), r = G.tok * (lead ? 1 : 0.72), col = u.s === 0 ? '#c8341f' : '#2f4a66';
    B.pos[u.id] = { x: x, y: y };
    cx.globalAlpha = lead ? 1 : 0.85;
    cx.fillStyle = 'rgba(0,0,0,.18)'; cx.beginPath(); cx.ellipse(x, y + r * 0.85, r * 0.9, r * 0.3, 0, 0, 6.283); cx.fill();
    cx.fillStyle = u.s === 0 ? '#f6ece0' : '#e2e8ee'; cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.fill();
    var im = img(unitKey(u.type, B.n));
    if (im) {
      cx.save(); cx.beginPath(); cx.arc(x, y, r - 2, 0, 6.283); cx.clip();
      var w = r * 2.1, h = w * im.height / im.width;
      cx.translate(x, y); if (u.s === 1) cx.scale(-1, 1);
      cx.drawImage(im, -w / 2, -h / 2 + r * 0.08, w, h);
      cx.restore();
    }
    // 兵力の輪
    cx.lineWidth = lead ? 4 : 3; cx.strokeStyle = 'rgba(0,0,0,.25)'; cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.stroke();
    cx.strokeStyle = col; cx.beginPath(); cx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + 6.283 * Math.max(0, u.hp / u.max)); cx.stroke();
    if (B.S.t - u.hitT < 0.08) { cx.fillStyle = 'rgba(255,255,255,.35)'; cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.fill(); }
    // 兵種の字
    if (lead) {
      cx.fillStyle = col; cx.beginPath(); cx.arc(x + r * 0.78, y + r * 0.62, 8, 0, 6.283); cx.fill();
      cx.fillStyle = '#fff'; cx.font = '900 10px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillText(SH.SHORT[u.type], x + r * 0.78, y + r * 0.62 + 3.5);
    }
    cx.globalAlpha = 1;
  }

  // ---- 上と下の表示 ----
  function hud() {
    var S = B.S, left = Math.max(0, SH.K.time - S.t);
    $('clock').textContent = Math.floor(left / 60) + ':' + ('0' + Math.floor(left % 60)).slice(-2);
    if (left <= 30 && !B.hot) { B.hot = true; $('clock').classList.add('hot'); SND.bgm('boss'); }
    var c0 = SH.cells(S, 0), c1 = SH.cells(S, 1);
    $('scP').textContent = c0; $('scE').textContent = c1;
    $('sbP').style.width = (c0 / (c0 + c1) * 100) + '%'; $('sbE').style.width = (c1 / (c0 + c1) * 100) + '%';
    var key = S.q[0].join(',') + '|' + SH.upcoming(S, 0).join(',') + '|' + laneLeadKey(S);
    if (key !== B.qKey) {
      B.qKey = key;
      var h = '';
      for (var i = 0; i < SH.K.qMax; i++) {
        var t = S.q[0][i];
        if (!t) { h += '<div class="qs empty"><span>待機</span></div>'; continue; }
        var good = bestLanes(S, t);
        h += '<button class="qs' + (i === 0 ? ' head' : '') + '" data-act="swap" data-i="' + i + '"><img src="' + ART_DATA.img[unitKey(t, B.n)] + '" alt=""><span>' + SH.NAME[t] + '</span>' + (good ? '<i class="adv" style="color:var(--good)">' + good + '</i>' : '') + '</button>';
      }
      $('queue').innerHTML = h;
      $('nextList').innerHTML = SH.upcoming(S, 0).map(function (t) { return '<b>' + SH.SHORT[t] + '</b>'; }).join('');
    }
    var iv = SH.interval(S, 0), k = S.q[0].length >= SH.K.qMax ? 1 : 1 - Math.max(0, S.nextT[0] - S.t) / iv;
    $('arrBar').style.width = (Math.max(0, Math.min(1, k)) * 100) + '%';
    $('arrBar').style.background = S.q[0].length >= SH.K.qMax ? '#e0a93b' : '';
    var sb = $('skillBtn');
    sb.disabled = S.used[0] || S.done;
    sb.classList.toggle('armed', !!B.armed);
  }
  // 待機の部隊が相性で勝てる列(敵の先頭)の数を、小さく示す
  function laneLeadKey(S) { var a = []; for (var l = 0; l < SH.L; l++) { var e = SH.laneUnits(S, 1, l)[0]; a.push(e ? e.type : '-'); } return a.join(''); }
  function bestLanes(S, t) { var n = 0; for (var l = 0; l < SH.L; l++) { var e = SH.laneUnits(S, 1, l)[0]; if (e && SH.aff(t, e.type) > 1) n++; } return n ? '有利' + n : ''; }

  // ---- 操作 ----
  var down = null;
  cv.addEventListener('pointerdown', function (e) { if (!B) return; fitCheck(); var r = cv.getBoundingClientRect(); down = { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId }; });
  cv.addEventListener('pointerup', function (e) {
    if (!B || !down || B.S.done) { down = null; return; }
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, dx = x - down.x, dy = y - down.y, l = laneAt(down.x);
    down = null;
    if (B.paused) { if (!B.count) resumeBattle(); return; }
    if (dy > 26 && dy > Math.abs(dx) * 1.2) {
      if (!SH.retreat(B.S, 0, l)) { toast(B.S.h[0][l] <= 1 ? 'これ以上は下がれません' : '同じ列の後退は8秒に1回'); SND.play('err'); }
      return;
    }
    if (Math.hypot(dx, dy) > 18) return;
    if (B.armed) { B.armed = false; if (SH.useSkill(B.S, 0, l)) return; }
    var res = SH.send(B.S, 0, l);
    if (res === 'full') { toast('この列はいっぱい(3部隊まで)'); SND.play('err'); }
    else if (res === 'empty') { toast('待機がありません(2秒ほどで届きます)'); SND.play('err'); }
  });
  cv.addEventListener('pointercancel', function () { down = null; });
  function pause(resumeAfter) {
    if (!B || B.S.done) return;
    B.paused = true; B.count = 0;
    if (!resumeAfter) openModal('<div style="text-align:center"><h3 style="margin:0 0 8px">一時停止</h3><button class="btn" data-act="resume">続ける</button><button class="btn sub" data-act="giveup">この戦いをやめる(負け)</button></div>');
    else openModal('<div style="text-align:center"><h3 style="margin:0 0 8px">戦闘の途中です</h3><div style="color:var(--sub);font-size:13px">戦場' + B.n + '「' + esc(B.g.name) + '」 残り' + Math.ceil(SH.K.time - B.S.t) + '秒</div><button class="btn" data-act="resume">続きから</button><button class="btn sub" data-act="giveup">やめる(負け)</button></div>');
  }
  function resumeBattle() {
    closeModal();
    B.count = 3;
    var tick = function () { if (!B) return; B.count -= 1; if (B.count <= 0) { B.count = 0; B.paused = false; lastTs = 0; SND.play('go'); } else { SND.play('tick'); setTimeout(tick, 700); } };
    SND.play('tick'); setTimeout(tick, 700);
  }
  function endBattle() {
    if (!B) return;
    var S = B.S, n = B.n, st = SH.stars(S), win = S.winner === 0, prev = P.stars[n] || 0;
    if (st > prev) P.stars[n] = st;
    P.battle = null; save();
    SND.bgm(null); SND.play(win ? 'win' : 'lose');
    var why = S.why === 'breach' ? (win ? '敵の本陣を突破!' : '本陣を突破された') : S.why === 'giveup' ? '撤退' : '時間切れ・陣地の数で' + (win ? '勝ち' : '負け');
    var stars = '★★★'.slice(0, st) + '<span>' + '★★★'.slice(st) + '</span>';
    openModal('<div class="res"><h2 class="' + (win ? 'w' : 'l') + '">' + (win ? '勝利' : '敗北') + '</h2><div class="stars">' + stars + '</div><div class="why">' + why + '</div>' +
      '<table><tr><td>陣地(自分 対 敵)</td><td>' + SH.cells(S, 0) + ' 対 ' + SH.cells(S, 1) + '</td></tr>' +
      '<tr><td>敵を総崩れにした</td><td>' + S.st.collapses[1] + '回</td></tr><tr><td>総崩れにされた</td><td>' + S.st.collapses[0] + '回</td></tr>' +
      '<tr><td>後退した</td><td>' + S.st.retreats[0] + '回</td></tr><tr><td>送った部隊 / 倒した敵</td><td>' + S.st.sent[0] + ' / ' + S.st.kills[0] + '</td></tr></table>' +
      '<div style="font-size:11px;color:var(--dim);margin-top:8px">星: 勝つ / 敵を総崩れにする / 突破か10段差以上</div>' +
      '<div class="row2"><button class="btn sub" data-act="map">地図へ</button>' + (win && n < 10 ? '<button class="btn" data-act="next">次へ</button>' : '<button class="btn" data-act="again">もう1回</button>') + '</div></div>');
    if (n <= 2) { P.tut |= 1; save(); }
    B = null;
    cancelAnimationFrame(raf);
  }

  // ---- 遊び方 ----
  function help() {
    openModal('<div class="help"><h3 style="margin:0 0 6px">遊び方</h3>' +
      '<p>縦の<b>列が5本</b>。下が自分、上が敵。ぶつかった所が<b>前線(朱の線)</b>です。90秒たって<b>陣地(色のついたマス)が多い方</b>の勝ち。敵の本陣に4秒とどまれば、その場で<b>突破勝ち</b>。</p>' +
      '<p><b>列をタップ</b>すると、下の「次に出る」部隊がその列へ走ります。部隊は2秒ほどに1つ届き、待機は4つまで(あふれた分は届かない)。待機の2番目以降を押すと先頭と入れ替わります。</p>' +
      '<p><b>相性</b>: 歩兵 → 対戦車兵 → 戦車 → 歩兵(矢印の先に強い。被害1.5倍)。敵の先頭を見て当てよう。</p>' +
      '<p><b>出すぎ</b>: 隣の列より2段以上前に出た列は、横からも撃たれます(赤いしま)。4段以上出すぎた列で部隊が全滅すると<b>総崩れ</b>、隣の高さまで一気に取り返されます。</p>' +
      '<p><b>後退</b>: 列を<b>下にはじく</b>と1段ゆずり、3秒その場で構えます(受ける被害半分・与える被害1.5倍)。敵を誘い込んで出すぎにさせ、「挟め!」の出た列に相性の良い部隊を送ると崩せます。</p>' +
      '<p><b>地の利</b>: 自分の本陣に近いほど守りが固く、押し込んだ側ほど援軍が遠い。押されても逆転できます。町を持つと部隊が早く届きます。</p>' +
      '<p><b>指揮官の技</b>は1戦に1回。</p><button class="btn" data-act="closem">閉じる</button></div>');
  }
  function sndLabel() { var b = $('sndBtn'); if (b) { b.textContent = SND.cfg().mute ? '消音' : '音'; b.style.color = SND.cfg().mute ? 'var(--dim)' : 'var(--gold)'; } }

  // ---- ボタン ----
  var ACT = {
    stage: function (el) { openStage(+el.dataset.n); },
    close: closeSheet,
    closem: closeModal,
    cmd: function (el) { P.cmd = el.dataset.id; save(); openStage(selN); },
    comp: function (el) { P.comp = el.dataset.id; save(); openStage(selN); },
    go: function () { startBattle(selN); },
    swap: function (el) { var i = +el.dataset.i; if (B && i > 0 && SH.swap(B.S, 0, i)) SND.play('tap'); },
    skill: function () {
      if (!B || B.S.used[0] || B.paused) return;
      var k = B.S.skill[0];
      if (SH.SKILLS[k].lane) { B.armed = !B.armed; SND.play('tap'); return; }
      SH.useSkill(B.S, 0, null);
    },
    pause: function () { pause(false); },
    resume: function () { resumeBattle(); },
    giveup: function () { if (!B) return; closeModal(); B.S.done = true; B.S.winner = 1; B.S.why = 'giveup'; B.ended = true; endBattle(); },
    map: function () { closeModal(); show('map'); renderMap(); SND.bgm('menu'); },
    next: function () { closeModal(); show('map'); renderMap(); openStage(Math.min(10, cleared() + 1)); },
    again: function () { closeModal(); startBattle(selN); },
    help: help,
    snd: function () { SND.set({ mute: !SND.cfg().mute }); sndLabel(); if (!SND.cfg().mute) SND.play('ok'); }
  };
  var QUIET = { swap: 1, skill: 1, snd: 1 };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var f = ACT[el.dataset.act];
    if (f) { e.preventDefault(); if (!QUIET[el.dataset.act]) SND.play('tap'); f(el); }
  });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  window.addEventListener('resize', function () { if (B) resize(); });
  if (window.ResizeObserver) new ResizeObserver(function () { if (B) resize(); }).observe($('boardWrap'));
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && B && !B.S.done) { P.battle = { n: B.n, S: strip(B.S) }; save(); if (!B.paused) pause(false); }
  });
  window.addEventListener('pagehide', function () { if (B && !B.S.done) { P.battle = { n: B.n, S: strip(B.S) }; save(); } });

  // ---- 起動 ----
  renderMap();
  SND.bgm('menu');
  if (P.battle && P.battle.S && !P.battle.S.done) { selN = P.battle.n; startBattle(P.battle.n, P.battle); }
  else if (!P.seen) { P.seen = 1; save(); help(); }
  // テスト・確認用
  window.__shusen = { SH: SH, get P() { return P; }, get B() { return B; }, snd: SND, size: function () { return { CW: CW, CH: CH, cssW: cv.clientWidth, cssH: cv.clientHeight }; },
    play: function (sec) { if (!B) return; var end = B.S.t + sec; while (!B.S.done && B.S.t < end) { SH.step(B.S, 0.05); events(); } },
    auto: function (kind) { if (B) B.S.ai[0] = kind || 'affinity'; } };
