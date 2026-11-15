  // ====== 冬将軍(試作)の画面 ======
  var KEY = 'fuyu-proto-v1';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) { var d = document.createElement('div'); d.textContent = msg; $('toast').appendChild(d); setTimeout(function () { d.remove(); }, 2400); }
  var IMG = {};
  function img(k) {
    if (!ART_DATA.img[k]) return null;
    if (!IMG[k]) { IMG[k] = new Image(); IMG[k].onload = function () { dirty = true; }; IMG[k].src = ART_DATA.img[k]; }
    return IMG[k].complete && IMG[k].naturalWidth ? IMG[k] : null;
  }
  Object.keys(ART_DATA.img).forEach(img);
  function face(el, k, z) {
    if (!el || !ART_DATA.img[k]) return;
    z = z || 1.5;
    var m = ART_DATA.meta[k] || [0.5, 0.45];
    el.style.backgroundImage = 'url(' + ART_DATA.img[k] + ')';
    el.style.backgroundSize = (z * 100) + '%';
    el.style.backgroundPosition = m.map(function (f) { return Math.max(0, Math.min(100, (0.5 - f * z) / (1 - z) * 100)).toFixed(1) + '%'; }).join(' ');
  }
  // 国の色(塗り)と、国境・文字の色。東の連邦は草地と見分けやすい青みの緑に
  var NCOL = ['#c8341f', '#2f6bb0', '#7a4fa8', '#13866a'], NCOL2 = ['#ff6a4d', '#8cc0ff', '#d4adff', '#5fe3bd'];
  var TONE = { good: '#8fe3a8', bad: '#ffb3a8', crit: '#ff6a5a', big: '#ffd166', info: '#e8e2d2' };

  // ---- 保存 ----
  var S = null;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function load() { try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1 && o.land) return o; } catch (e) { } return null; }
  function newCampaign(trial) {
    S = FY.create({ seed: (Math.random() * 2147483647) | 0, now: Date.now(), trial: trial !== false });
    sel = null; mode = 'idle'; RT = null; card(null); save(); dirty = true; render();
  }

  // ---- 地図の形 ----
  var cv = $('cv'), cx = cv.getContext('2d'), DPR = 1, CW = 0, CH = 0, HS = 20, X0 = 0, Y0 = 0, dirty = true, raf = 0;
  var R3 = Math.sqrt(3);
  function resize() {
    var r = $('mapWrap').getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    CW = Math.max(100, r.width); CH = Math.max(100, r.height);
    cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
    HS = Math.min((CW - 10) / (R3 * (FY.W + 0.5)), (CH - 10) / (1.5 * (FY.H - 1) + 2));
    X0 = (CW - R3 * HS * (FY.W + 0.5)) / 2; Y0 = 4;
    dirty = true;
  }
  // 描いた大きさと画面の上の大きさがずれると、タップした場所がずれる。毎こまと、タップのたびに確かめる
  function fitCheck() { if (Math.abs(cv.clientWidth - CW) > 1 || Math.abs(cv.clientHeight - CH) > 1) resize(); }
  function hx(i) { var c = i % FY.W, r = (i / FY.W) | 0; return X0 + R3 * HS * (c + 0.5 + 0.5 * (r & 1)); }
  function hy(i) { var r = (i / FY.W) | 0; return Y0 + HS * (1 + 1.5 * r); }
  function hexPath(x, y, s) { cx.beginPath(); for (var k = 0; k < 6; k++) { var a = Math.PI / 6 + k * Math.PI / 3; if (k) cx.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)); else cx.moveTo(x + s * Math.cos(a), y + s * Math.sin(a)); } cx.closePath(); }
  function hexAt(px, py) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < FY.NH; i++) { var d = Math.hypot(px - hx(i), py - hy(i)); if (d < bd) { bd = d; best = i; } }
    return bd <= HS ? best : -1;
  }
  // 地図の文字の大きさは、マスの大きさに合わせる(iPhone SE 10px 〜 16 Pro Max 13px)
  function FS(k) { return Math.round(Math.max(10, Math.min(14, HS * 0.4)) * (k || 1)); }
  function tokAbove(y) { return y - HS * 0.5 - (FS() + 5) / 2 - 1.5; }
  function font(px, mono) { return '900 ' + px + 'px ' + (mono ? '"SF Mono",ui-monospace,monospace' : '-apple-system,BlinkMacSystemFont,sans-serif'); }

  // ---- 地図の上の札: 重ならないように、大事な順に置く(置けない札は出さない) ----
  var TAGS = [], OBST = [], TSTAT = { placed: 0, dropped: 0, droppedHi: 0, overlaps: 0 };
  function tag(t, x, y, o) { o = o || {}; TAGS.push({ t: t, x: x, y: y, col: o.col || '#fff', bg: o.bg === undefined ? 'rgba(10,8,6,.86)' : o.bg, pri: o.pri || 0, fs: o.fs || FS(), cand: o.cand, force: o.force }); }
  function hit(a, b) { return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]; }
  function flushTags() {
    TAGS.sort(function (a, b) { return b.pri - a.pri; });
    var placed = OBST.slice(), mine = [], st = { placed: 0, dropped: 0, droppedHi: 0, overlaps: 0, drops: [] };
    TAGS.forEach(function (g) {
      cx.font = font(g.fs);
      var w = cx.measureText(g.t).width + 8, h = g.fs + 5, ok = false;
      var up = Math.min(g.y - h - 2, tokAbove(g.y)), dn = Math.max(g.y + h + 2, g.y + HS * 0.5 + FS() / 2 + h / 2 + 4);
      var cand = g.cand || [[g.x, g.y], [g.x, up], [g.x, dn], [g.x + w * 0.6, g.y], [g.x - w * 0.6, g.y], [g.x + w * 0.6, up], [g.x - w * 0.6, up]];
      // force の札(再生中の出来事)は、軍団の上に重なってもよい。ほかの札とは重ねない
      for (var pass = 0; pass < (g.force ? 2 : 1) && !ok; pass++) for (var k = 0; k < cand.length && !ok; k++) {
        var r = [Math.max(2, Math.min(CW - w - 2, cand[k][0] - w / 2)), Math.max(2, Math.min(CH - h - 2, cand[k][1] - h / 2)), w, h];
        if (!pass && (cand[k][1] - h / 2 < 2 || cand[k][1] + h / 2 > CH - 2)) continue;
        if ((pass ? mine : placed).some(function (q) { return hit(q, r); })) continue;
        placed.push(r); mine.push(r); ok = true;
        if (g.bg) { cx.fillStyle = g.bg; cx.fillRect(r[0], r[1], w, h); }
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        if (!g.bg) { cx.lineWidth = 3; cx.strokeStyle = 'rgba(0,0,0,.8)'; cx.strokeText(g.t, r[0] + w / 2, r[1] + h / 2 + 1); }
        cx.fillStyle = g.col; cx.fillText(g.t, r[0] + w / 2, r[1] + h / 2 + 1);
        cx.textBaseline = 'alphabetic';
      }
      if (ok) st.placed++; else { st.dropped++; st.drops.push(g.t); if (g.pri >= 70) st.droppedHi++; }
    });
    for (var a = 0; a < mine.length; a++) for (var b = a + 1; b < mine.length; b++) if (hit(mine[a], mine[b])) st.overlaps++;
    TSTAT = st; TAGS = []; OBST = [];
  }

  // ---- 選択と命令のモード ----
  var sel = null, mode = 'idle', pending = null;
  var RT = null;      // 退路の見せ方 { open:[マス], blocked:{マス:命令の番号} }
  var FL = null;      // 「くわしく」から選んだマスを光らせる { at, t }
  var RP = null;      // 手番の再生 { steps, i, t, rep }
  var SUMV = null;    // 再生のあとのまとめ(取ったマス・取られたマスを光らせる)
  function unitById(id) { return S.units.filter(function (u) { return u.id === id; })[0]; }
  function seasonCls() { return ['p', 's', 'a', 'w'][FY.season(S)]; }

  // ---- 描画 ----
  function tileKey(D, i) {
    var t = D.terr[i], w = FY.winter(D);
    if (t === 'forest') return w ? 'm.sforest' : 'm.forest';
    if (t === 'mount') return 'm.mount';
    return w ? 'm.snow' : 'm.grass';
  }
  function ease(p) { return 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 3); }
  // 再生中は、その区切りのあとの地図を見せる(動きは前の地図から)
  function viewNow() {
    if (!RP) return { D: S, prev: null, p: 1, step: null };
    var st = RP.steps[RP.i], D = Object.assign({}, S, st.snap);
    D.intents = []; D.orders = [];
    return { D: D, prev: st.prev, p: Math.min(1, RP.t / (RP.dur * 0.75)), step: st };
  }
  function isoClusters(D) {
    var seen = {}, out = [];
    for (var i = 0; i < FY.NH; i++) {
      var o = D.own[i];
      if (seen[i] || o < 0 || !(D.iso[i] > 0)) continue;
      if (o !== 0 && !FY.NB[i].some(function (n) { return D.own[n] === 0; })) continue;
      var grp = [], q = [i]; seen[i] = 1;
      while (q.length) {
        var x = q.pop(); grp.push(x);
        FY.NB[x].forEach(function (n) { if (!seen[n] && D.own[n] === o && D.iso[n] === D.iso[i]) { seen[n] = 1; q.push(n); } });
      }
      out.push({ own: o, left: FY.K.isoTurns - D.iso[i], hexes: grp });
    }
    return out;
  }
  function draw() {
    var V = viewNow(), D = V.D, p = V.p, prevS = V.prev;
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.clearRect(0, 0, CW, CH);
    // 海
    var g = cx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#16222a'); g.addColorStop(1, '#0d151b');
    cx.fillStyle = g; cx.fillRect(0, 0, CW, CH);
    cx.strokeStyle = 'rgba(140,170,190,.06)'; cx.lineWidth = 1;
    for (var y = 8; y < CH; y += 10) { cx.beginPath(); for (var x = 0; x <= CW; x += 12) cx.lineTo(x, y + Math.sin(x * 0.05 + y) * 2); cx.stroke(); }
    var i, w = FY.winter(D), sm = FY.supplyMap(D, 0);
    var isoBadges = [], pills = [];
    var tintA = function (o) { return o === 0 ? 0.38 : w ? 0.62 : 0.5; };
    // 陸のマス
    for (i = 0; i < FY.NH; i++) {
      if (!D.land[i]) continue;
      var x0 = hx(i), y0 = hy(i), im = img(tileKey(D, i));
      cx.save(); hexPath(x0, y0, HS - 0.6); cx.clip();
      if (im) cx.drawImage(im, x0 - HS * 1.05, y0 - HS * 1.05, HS * 2.1, HS * 2.1); else { cx.fillStyle = '#8a8a6a'; cx.fill(); }
      if (D.terr[i] === 'mount' && w) { cx.fillStyle = 'rgba(235,245,255,.35)'; cx.fill(); }
      // 持ち主の色(再生中に塗り変わるマスは、墨がにじむように)
      var o = D.own[i], from = prevS ? prevS.own[i] : o;
      if (from !== o) {
        if (from >= 0) { cx.fillStyle = NCOL[from]; cx.globalAlpha = tintA(from); cx.fillRect(x0 - HS, y0 - HS, HS * 2, HS * 2); }
        if (o >= 0) { cx.globalAlpha = tintA(o); cx.fillStyle = NCOL[o]; cx.beginPath(); cx.arc(x0, y0, HS * 1.25 * ease(p * 1.3), 0, 6.283); cx.fill(); }
        cx.globalAlpha = 1;
      } else if (o >= 0) { cx.globalAlpha = tintA(o); cx.fillStyle = NCOL[o]; cx.fillRect(x0 - HS, y0 - HS, HS * 2, HS * 2); cx.globalAlpha = 1; }
      // 川
      if (D.terr[i] === 'river') {
        cx.strokeStyle = w ? 'rgba(220,240,255,.85)' : 'rgba(60,120,170,.9)'; cx.lineWidth = w ? 3 : 4;
        cx.beginPath(); for (var k = 0; k <= 10; k++) { var px = x0 - HS + k * HS * 0.2, py = y0 + Math.sin(k * 1.2) * HS * 0.15; if (k) cx.lineTo(px, py); else cx.moveTo(px, py); } cx.stroke();
      }
      cx.restore();
      hexPath(x0, y0, HS - 0.6); cx.strokeStyle = 'rgba(20,16,12,.45)'; cx.lineWidth = 1; cx.stroke();
      if (D.terr[i] === 'river' && w && !FY.unitAt(D, i)) tag('凍結', x0, y0 + HS * 0.5, { col: '#cfe8ff', fs: FS(0.8), pri: 10, cand: [[x0, y0 + HS * 0.5]] });
    }
    // 国境(持ち主の違う辺を太く)
    for (i = 0; i < FY.NH; i++) {
      if (!D.land[i] || D.own[i] < 0) continue;
      for (var k2 = 0; k2 < 6; k2++) {
        var a1 = Math.PI / 6 + k2 * Math.PI / 3, a2 = a1 + Math.PI / 3, mx = hx(i) + HS * R3 / 2 * Math.cos(a1 + Math.PI / 6), my = hy(i) + HS * R3 / 2 * Math.sin(a1 + Math.PI / 6);
        var nb = hexAt(hx(i) + (mx - hx(i)) * 2, hy(i) + (my - hy(i)) * 2);
        if (nb >= 0 && D.land[nb] && D.own[nb] === D.own[i]) continue;
        cx.strokeStyle = NCOL2[D.own[i]]; cx.lineWidth = 3.5; cx.globalAlpha = 0.9;
        cx.beginPath(); cx.moveTo(hx(i) + (HS - 2.5) * Math.cos(a1), hy(i) + (HS - 2.5) * Math.sin(a1)); cx.lineTo(hx(i) + (HS - 2.5) * Math.cos(a2), hy(i) + (HS - 2.5) * Math.sin(a2)); cx.stroke(); cx.globalAlpha = 1;
      }
    }
    // 孤立(まとまりごとに札は1枚)
    isoClusters(D).forEach(function (c) {
      var mine = c.own === 0, col = mine ? '#ff4d3a' : '#ffd166', sx = 0, sy = 0;
      c.hexes.forEach(function (h) { hexPath(hx(h), hy(h), HS - 3); cx.setLineDash([5, 3]); cx.strokeStyle = col; cx.lineWidth = 2.5; cx.stroke(); cx.setLineDash([]); sx += hx(h); sy += hy(h); });
      sx /= c.hexes.length; sy /= c.hexes.length;
      var best = c.hexes[0], bd = 1e9;
      c.hexes.forEach(function (h) { var d = Math.hypot(hx(h) - sx, hy(h) - sy) + (FY.unitAt(D, h) ? HS * 0.6 : 0); if (d < bd) { bd = d; best = h; } });
      var t = (mine ? '孤立' : '包囲') + (c.hexes.length > 1 ? ' ' + c.hexes.length + 'マス' : '') + ' あと' + c.left;
      var order = c.hexes.slice().sort(function (a, b) { return Math.hypot(hx(a) - sx, hy(a) - sy) - Math.hypot(hx(b) - sx, hy(b) - sy); }), cand = [];
      [best].concat(order).forEach(function (h) { cand.push([hx(h), hy(h) + HS * 0.62], [hx(h), hy(h) - HS * 0.72], [hx(h), hy(h)]); });
      cand.push([sx, sy + HS * 1.1], [sx, sy - HS * 1.1]);
      tag(t, hx(best), hy(best) + HS * 0.62, { col: mine ? '#ff8a7a' : '#ffd166', pri: 60, cand: cand });
      c.hexes.forEach(function (h) { isoBadges.push({ at: h, n: c.left, mine: mine }); });
    });
    // 鉄道
    cx.strokeStyle = 'rgba(30,22,16,.85)'; cx.lineWidth = 2.5;
    for (i = 0; i < FY.NH; i++) if (D.rail[i]) FY.NB[i].forEach(function (n) {
      if (n > i && D.rail[n]) {
        cx.beginPath(); cx.moveTo(hx(i), hy(i)); cx.lineTo(hx(n), hy(n)); cx.stroke();
        var dx = hx(n) - hx(i), dy = hy(n) - hy(i), L = Math.hypot(dx, dy), nx = -dy / L * 4, ny = dx / L * 4;
        for (var q = 0.15; q < 1; q += 0.17) { var ex = hx(i) + dx * q, ey = hy(i) + dy * q; cx.beginPath(); cx.moveTo(ex - nx, ey - ny); cx.lineTo(ex + nx, ey + ny); cx.stroke(); }
      }
    });
    // 町・首都・補給基地・陣地
    for (i = 0; i < FY.NH; i++) {
      if (!D.land[i]) continue;
      var x1 = hx(i), y1 = hy(i), cap = FY.CAPS.indexOf(i);
      if (cap >= 0) {
        var hq = img('b.hq');
        if (hq) cx.drawImage(hq, x1 - HS * 0.62, y1 - HS * 0.75, HS * 1.24, HS * 1.24 * hq.height / hq.width);
        var capC = [[x1, y1 - HS * 0.62], [x1, tokAbove(y1)], [x1, y1 + HS * 0.8]];
        if (cap === 0 || D.alive[cap]) tag('★首都', x1, y1 - HS * 0.62, { col: NCOL2[cap], bg: null, fs: FS(1.05), pri: 55, cand: capC });
        else tag('旧首都', x1, y1 - HS * 0.62, { col: '#b9b2a2', bg: null, fs: FS(0.85), pri: 20, cand: capC });
      } else if (D.town[i]) {
        cx.fillStyle = 'rgba(30,24,18,.75)';
        [[-0.22, 0.05], [0.12, -0.08], [0.2, 0.2]].forEach(function (pp) { var bx = x1 + pp[0] * HS, by = y1 + pp[1] * HS, s = HS * 0.16; cx.fillRect(bx - s, by - s * 0.7, s * 2, s * 1.4); cx.beginPath(); cx.moveTo(bx - s * 1.2, by - s * 0.7); cx.lineTo(bx, by - s * 1.6); cx.lineTo(bx + s * 1.2, by - s * 0.7); cx.fill(); });
      }
      if (D.depot[i]) {
        var dp = img('b.depot');
        cx.globalAlpha = D.depot[i] === -1 ? 1 : 0.5;
        if (dp) cx.drawImage(dp, x1 - HS * 0.5, y1 - HS * 0.2, HS, HS * dp.height / dp.width);
        cx.globalAlpha = 1;
        tag(D.depot[i] === -1 ? '補給基地' : '建設中 あと' + D.depot[i], x1, y1 + HS * 0.78, { col: '#ffd166', fs: FS(0.85), pri: 30 });
      }
      if (D.fort[i]) { cx.strokeStyle = '#4a3a20'; cx.lineWidth = 3; cx.beginPath(); cx.arc(x1, y1 + HS * 0.1, HS * 0.72, Math.PI * 0.15, Math.PI * 0.85); cx.stroke(); }
    }
    // 補給の線(自軍の軍団ごとに、補給のもとまで。太い=十分、細い=不足)
    FY.unitsOf(D, 0).forEach(function (u) {
      var d = sm.d[u.at]; if (d === Infinity || d === 0) return;
      var f = FY.factorOf(D, d), pts = [], c = u.at;
      while (c >= 0) { pts.push([hx(c), hy(c)]); c = sm.par[c]; }
      cx.strokeStyle = 'rgba(200,52,31,' + (0.35 + 0.5 * f) + ')'; cx.lineWidth = 1.5 + 5 * f; cx.lineCap = 'round'; cx.lineJoin = 'round';
      if (f < 0.5) cx.setLineDash([6, 5]);
      cx.beginPath(); pts.forEach(function (pp, k) { if (k) cx.lineTo(pp[0], pp[1]); else cx.moveTo(pp[0], pp[1]); }); cx.stroke(); cx.setLineDash([]);
    });
    // 敵のねらい(同じマスに重なったら1枚にまとめる)
    var byHex = {};
    (D.intents || []).forEach(function (it) { if (D.alive[it.n]) (byHex[it.shown] = byHex[it.shown] || []).push(it); });
    Object.keys(byHex).forEach(function (h) {
      var its = byHex[h], x2 = hx(+h), y2 = hy(+h);
      its.forEach(function (it, k) { cx.strokeStyle = NCOL2[it.n]; cx.lineWidth = 2.5; cx.setLineDash([4, 3]); cx.beginPath(); cx.arc(x2, y2, HS * (0.86 - k * 0.1), 0, 6.283); cx.stroke(); cx.setLineDash([]); });
      var sure = its.every(function (it) { return it.cert === '高'; });
      tag('狙' + (its.length > 1 ? '×' + its.length : '') + (sure ? '' : '?'), x2 + HS * 0.62, y2 - HS * 0.62, { col: its.length > 1 ? '#fff' : NCOL2[its[0].n], fs: FS(0.9), pri: 50 });
    });
    // 動ける先
    if (sel && (mode === 'unit' || mode === 'confirm') && !RP) {
      var u = unitById(sel); if (u) {
        var mv = FY.moves(S, u);
        Object.keys(mv).forEach(function (k) {
          var to = +k, o2 = S.own[to], d2 = FY.unitAt(S, to), col, lab = '';
          if (o2 === 0 && !d2) col = 'rgba(111,209,138,.9)';
          else if (o2 === -1 && !d2) { col = 'rgba(224,169,59,.95)'; lab = '取る'; }
          else { var od = FY.odds(S, u, to, sm); col = 'rgba(255,90,70,.95)'; lab = FY.label(od.r); }
          if (mode === 'confirm' && pending && pending.to !== to) return;
          hexPath(hx(to), hy(to), HS - 3); cx.strokeStyle = col; cx.lineWidth = 3; cx.stroke();
          // 見こみの札: 敵の軍団がいるマスは軍団の札の上の縁にじかに描く。いないマスは真ん中に
          if (lab && d2) pills.push({ t: lab, x: hx(to), y: hy(to) - HS * 0.5, col: col });
          else if (lab) tag(lab, hx(to), hy(to), { col: col, bg: 'rgba(0,0,0,.78)', fs: FS(1.05), pri: 92, force: true, cand: [[hx(to), hy(to)], [hx(to), hy(to) + HS * 0.45], [hx(to), hy(to) - HS * 0.45]] });
        });
      }
    }
    if (!RP && (mode === 're' || mode.indexOf('b:') === 0 || mode.indexOf('o:') === 0)) validTargets().forEach(function (t) { hexPath(hx(t), hy(t), HS - 3); cx.strokeStyle = 'rgba(224,169,59,.95)'; cx.lineWidth = 3; cx.stroke(); });
    // 退路(攻める前・敵の軍団を見たとき)
    if (RT && !RP) {
      RT.open.forEach(function (h) { hexPath(hx(h), hy(h), HS - 5); cx.setLineDash([3, 3]); cx.strokeStyle = '#ffd166'; cx.lineWidth = 2.5; cx.stroke(); cx.setLineDash([]); tag('退路', hx(h), hy(h), { col: '#ffd166', pri: 90, force: true }); });
      Object.keys(RT.blocked).forEach(function (h) { h = +h; hexPath(hx(h), hy(h), HS - 5); cx.setLineDash([3, 3]); cx.strokeStyle = '#8fe3a8'; cx.lineWidth = 2.5; cx.stroke(); cx.setLineDash([]); tag('ふさぐ(命令' + RT.blocked[h] + ')', hx(h), hy(h), { col: '#8fe3a8', pri: 90, force: true }); });
    }
    // 命令の矢印
    if (!RP) S.orders.forEach(function (o, k) {
      if (o.k !== 'move') { var at = o.at !== undefined ? o.at : o.unit ? (unitById(o.unit) || {}).at : undefined; if (at !== undefined) tag('命令' + (k + 1), hx(at), hy(at) - HS * 0.78, { col: '#ffd166', pri: 91, force: true }); return; }
      var uu = unitById(o.unit); if (!uu) return;
      arrow(hx(uu.at), hy(uu.at), hx(o.to), hy(o.to), '#ff6a4d', k + 1);
    });
    // 軍団(再生中は前の位置から動かす。消えた軍団は×をつけて薄く)
    var prevU = {}; if (prevS) prevS.units.forEach(function (x) { prevU[x.id] = x; });
    var list = D.units.map(function (x) { return { u: x, dying: false }; });
    if (prevS) prevS.units.forEach(function (x) { if (!D.units.some(function (y) { return y.id === x.id; })) list.push({ u: x, dying: true }); });
    list.forEach(function (it) {
      var un = it.u, ux = hx(un.at), uy = hy(un.at), al = 1, pu = prevU[un.id];
      if (prevS) {
        if (it.dying) al = Math.max(0.15, 1 - p);
        else if (pu && pu.at !== un.at) { var e = ease(p * 1.2); ux = hx(pu.at) + (ux - hx(pu.at)) * e; uy = hy(pu.at) + (uy - hy(pu.at)) * e; }
        else if (!pu) al = p;
      }
      cx.globalAlpha = al; unitToken(D, un, ux, uy, sm, !prevS); cx.globalAlpha = 1;
      if (it.dying) { cx.strokeStyle = 'rgba(20,14,10,.9)'; cx.lineWidth = 5; var r = HS * 0.42; cx.beginPath(); cx.moveTo(ux - r, uy - r); cx.lineTo(ux + r, uy + r); cx.moveTo(ux + r, uy - r); cx.lineTo(ux - r, uy + r); cx.stroke(); }
    });
    pills.forEach(function (pl) {
      var pf = FS(1.0); cx.font = font(pf); var pw = cx.measureText(pl.t).width + 10, ph = pf + 5;
      cx.fillStyle = 'rgba(0,0,0,.85)'; cx.fillRect(pl.x - pw / 2, pl.y - ph / 2, pw, ph);
      cx.strokeStyle = pl.col; cx.lineWidth = 2; cx.strokeRect(pl.x - pw / 2, pl.y - ph / 2, pw, ph);
      cx.fillStyle = pl.col; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(pl.t, pl.x, pl.y + 1); cx.textBaseline = 'alphabetic';
      OBST.push([pl.x - pw / 2, pl.y - ph / 2, pw, ph]);
    });
    // 孤立したマスの「あと何手番」(右上の小さな丸)
    isoBadges.forEach(function (b) {
      var bx = hx(b.at) + HS * 0.6, by = hy(b.at) - HS * 0.42, br = Math.max(7, FS() * 0.62);
      cx.fillStyle = b.mine ? '#c8341f' : '#b8860b'; cx.beginPath(); cx.arc(bx, by, br, 0, 6.283); cx.fill();
      cx.strokeStyle = 'rgba(0,0,0,.7)'; cx.lineWidth = 1.5; cx.stroke();
      cx.fillStyle = '#fff'; cx.font = font(Math.round(br * 1.3)); cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(b.n, bx, by + 1); cx.textBaseline = 'alphabetic';
      OBST.push([bx - br, by - br, br * 2, br * 2]);
    });
    // 再生: 戦いの火花と、出来事の札
    if (V.step) {
      V.step.ev.forEach(function (e) {
        if (e.k !== 'fight' || p > 0.7) return;
        var a = 1 - p / 0.7; cx.fillStyle = 'rgba(255,220,120,' + a * 0.8 + ')'; cx.beginPath(); cx.arc(hx(e.to), hy(e.to), HS * (0.3 + p * 0.8), 0, 6.283); cx.fill();
      });
      V.step.lines.forEach(function (l) {
        if (!l.s || l.at < 0) return;
        hexPath(hx(l.at), hy(l.at), HS - 2); cx.strokeStyle = TONE[l.tone]; cx.lineWidth = 3; cx.stroke();
        tag(l.s, hx(l.at), hy(l.at) - HS * 0.1, { col: TONE[l.tone], fs: FS(1.15), pri: 100, force: true });
      });
    }
    // 再生のあとのまとめ: 取ったマス(緑)・取られたマス(赤)
    if (SUMV) {
      var a3 = Math.max(0, 1 - SUMV.t / 2.2) * (0.6 + 0.4 * Math.sin(SUMV.t * 9));
      SUMV.gained.forEach(function (h) { hexPath(hx(h), hy(h), HS - 2); cx.strokeStyle = 'rgba(143,227,168,' + a3 + ')'; cx.lineWidth = 4; cx.stroke(); });
      SUMV.lost.forEach(function (h) { hexPath(hx(h), hy(h), HS - 2); cx.strokeStyle = 'rgba(255,90,70,' + a3 + ')'; cx.lineWidth = 4; cx.stroke(); });
    }
    if (FL) { var a4 = Math.max(0, 1 - FL.t / 2.4); hexPath(hx(FL.at), hy(FL.at), HS - 1); cx.strokeStyle = 'rgba(255,209,102,' + a4 + ')'; cx.lineWidth = 5; cx.stroke(); }
    flushTags();
  }
  function arrow(x1, y1, x2, y2, col, n) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, ex = x2 - ux * HS * 0.45, ey = y2 - uy * HS * 0.45;
    cx.strokeStyle = col; cx.lineWidth = 4; cx.lineCap = 'round'; cx.setLineDash([7, 4]);
    cx.beginPath(); cx.moveTo(x1 + ux * HS * 0.4, y1 + uy * HS * 0.4); cx.lineTo(ex, ey); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = col; cx.beginPath(); cx.moveTo(ex + ux * 9, ey + uy * 9); cx.lineTo(ex - uy * 7, ey + ux * 7); cx.lineTo(ex + uy * 7, ey - ux * 7); cx.closePath(); cx.fill();
    tag(String(n), (x1 + x2) / 2, (y1 + y2) / 2 - 6, { col: '#fff', bg: 'rgba(200,52,31,.95)', pri: 95, force: true, cand: [[(x1 + x2) / 2, (y1 + y2) / 2 - 6], [(x1 + x2) / 2, (y1 + y2) / 2 + 8]] });
  }
  function unitToken(D, u, x, y, sm, warn) {
    var r = HS * 0.5, col = NCOL[u.s], im = img('u.' + u.type + '.2'), f = u.s === 0 ? FY.factorOf(D, sm.d[u.at]) : 1, bf = FS(1.0);
    if (u.id === sel) { cx.fillStyle = 'rgba(255,209,102,.35)'; cx.beginPath(); cx.arc(x, y, r + 7, 0, 6.283); cx.fill(); }
    cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.ellipse(x, y + r * 0.9, r * 0.9, r * 0.3, 0, 0, 6.283); cx.fill();
    cx.fillStyle = u.s === 0 ? '#f4ece0' : '#e3e8ee'; cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.fill();
    if (im) { cx.save(); cx.beginPath(); cx.arc(x, y, r - 2, 0, 6.283); cx.clip(); cx.translate(x, y); if (u.s !== 0) cx.scale(-1, 1); var w2 = r * 2.2, h2 = w2 * im.height / im.width; cx.drawImage(im, -w2 / 2, -h2 / 2 + r * 0.05, w2, h2); cx.restore(); }
    cx.strokeStyle = col; cx.lineWidth = 3; cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.stroke();
    // 兵力
    var bw = Math.max(22, bf * 2), bh = bf + 4;
    cx.fillStyle = col; cx.fillRect(x - bw / 2, y + r - bh / 2, bw, bh);
    cx.fillStyle = '#fff'; cx.font = font(bf, true); cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(u.str, x, y + r + 1); cx.textBaseline = 'alphabetic';
    // 補給の不足は、兵力と同じく軍団の札にじかに描く(ほかの札に押し出されない)
    var wt = !warn || u.s !== 0 ? '' : f === 0 ? (u.lift ? '空輸中' : '孤立') : f < 0.6 ? '補給' + Math.round(f * 100) + '%' : '';
    var top = y - r;
    if (wt) {
      var wf = FS(0.85); cx.font = font(wf); var ww = cx.measureText(wt).width + 8, wh = wf + 4;
      cx.fillStyle = f === 0 ? (u.lift ? '#2b5f86' : '#b3261e') : '#b8641a'; cx.fillRect(x - ww / 2, y - r - wh / 2 - 2, ww, wh);
      cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(wt, x, y - r - 1); cx.textBaseline = 'alphabetic';
      top = y - r - wh / 2 - 2;
    }
    OBST.push([x - r, top, r * 2, y + r + bh / 2 - top]);
  }

  // ---- 上と下の表示 ----
  function render() {
    if (!S) return;
    var sea = FY.SEASONS[FY.season(S)], w = FY.winter(S);
    $('tSeason').textContent = FY.year(S) + '年目 ' + sea.name;
    $('tSeason').parentNode.classList.toggle('winter', w);
    $('tWinter').textContent = w ? '冬のさなか ・ 春まで ' + (8 - S.turn % 8) + '手番' : '冬まで ' + FY.toWinter(S) + '手番 ・ 期限まで ' + (FY.K.deadline - S.turn);
    $('tMoney').textContent = S.money[0] - FY.pendingCost(S);
    var F = FY.front(S, 0), G = FY.garrison(S, 0);
    $('tFront').textContent = '前線 ' + F + ' / 守備隊 ' + G;
    $('tFront').classList.toggle('warn', F > G);
    $('tTurns').textContent = S.trial ? '手番 ∞(試遊)' : '手番 ' + S.store + '/8';
    $('tObj').textContent = '目標: ' + (S.obj ? FY.OBJS[S.obj.k].name + (S.obj.failed ? '(失敗)' : '') : '—');
    $('tObj').classList.toggle('fail', !!(S.obj && S.obj.failed));
    $('tRep').classList.toggle('hidden', !S.lastRep);
    var h = '';
    for (var k = 0; k < FY.K.cmds; k++) {
      var o = S.orders[k];
      h += o ? '<button class="ord on" data-act="cancel" data-k="' + k + '"><i>' + (k + 1) + '</i>' + esc(orderText(o)) + '</button>' : '<div class="ord">命令' + (k + 1) + '(空き)</div>';
    }
    $('orders').innerHTML = h;
    $('btnGo').disabled = !!RP || S.done || (!S.trial && S.store <= 0);
    $('btnGo').textContent = RP ? '再生中…' : !S.trial && S.store <= 0 ? '手番を待つ' : '進める';
    Array.prototype.forEach.call(document.querySelectorAll('.btns .b'), function (b) { var m = b.dataset.act; b.classList.toggle('on', (m === 'mode-re' && mode === 're') || (m === 'mode-build' && mode.indexOf('b:') === 0) || (m === 'mode-op' && mode.indexOf('o:') === 0)); });
    dirty = true;
  }
  function orderText(o) {
    var u = o.unit ? unitById(o.unit) : null, nm = u ? FY.NAME[u.type] : '';
    if (o.k === 'move') { var d = FY.unitAt(S, o.to), ow = S.own[o.to]; return nm + (d && d.s ? 'で攻撃' : ow > 0 ? 'で攻め取る' : ow === -1 ? 'で取る' : 'を移動'); }
    if (o.k === 're') return nm + 'を補充';
    if (o.k === 'raise') return '新しい軍団';
    if (o.k === 'rail') return '鉄道を敷く';
    if (o.k === 'depot') return '補給基地';
    if (o.k === 'fort') return '陣地を築く';
    if (o.k === 'air') return '空爆';
    if (o.k === 'recon') return '偵察';
    if (o.k === 'lift') return nm + 'へ空輸';
    return o.k;
  }
  function placeCard(i) {
    var c = $('card'); c.classList.remove('top');
    if (i === undefined || i < 0 || c.classList.contains('hidden')) return;
    if (hy(i) + HS > CH - c.offsetHeight - 14) c.classList.add('top');
  }
  function card(html, cls) {
    var c = $('card'); c.classList.remove('rep');
    if (!html) { c.classList.add('hidden'); c.innerHTML = ''; return; }
    c.innerHTML = html; c.classList.remove('hidden'); if (cls) c.classList.add(cls);
  }
  function clearSel() { sel = null; mode = 'idle'; pending = null; RT = null; }

  // ---- 退路: 敵の軍団 d が、負けたときに下がれるマス(先に出した命令で取る予定のマスは「ふさぐ」) ----
  function retreatInfo(d) {
    var rt = FY.retreats(S, d), blocked = {}, open = [];
    rt.forEach(function (h) {
      var k = -1; S.orders.forEach(function (o, j) { if (o.k === 'move' && o.to === h) k = j; });
      if (k >= 0 && d.s !== 0) blocked[h] = k + 1; else open.push(h);
    });
    return { open: open, blocked: blocked, all: rt };
  }
  function retreatLine(d, R) {
    var nb = Object.keys(R.blocked).length;
    if (d.s === 0) return R.all.length === 0 ? '<span class="warn">退路なし: 攻められて負けると全滅</span>' : R.all.length === 1 ? '<span class="warn">退路は1マスだけ(点線)。そこを取られると危ない</span>' : '退路 ' + R.all.length + 'マス';
    if (!R.open.length) return '<span class="pk">退路なし → 勝てば全滅させられる</span>' + (nb ? '<br><small>命令' + Object.keys(R.blocked).map(function (h) { return R.blocked[h]; }).join('・') + 'で退路をふさぐ予定(その命令が失敗すると逃げられる)</small>' : '');
    if (R.open.length === 1) return '<span class="pk2">退路は1マス(点線)。先にそこを取れば、勝ったとき全滅させられる</span>';
    return '退路 ' + R.open.length + 'マス(勝っても退くだけ)';
  }

  // ---- 命令を出す ----
  function validTargets() {
    var out = [], i, sm = FY.supplyMap(S, 0);
    if (mode === 're') FY.unitsOf(S, 0).forEach(function (u) { if (FY.factorOf(S, sm.d[u.at]) > 0) out.push(u.at); });
    else if (mode === 'b:rail') { for (i = 0; i < FY.NH; i++) if (S.own[i] === 0 && !S.rail[i] && FY.NB[i].some(function (n) { return S.rail[n] && S.own[n] === 0; })) out.push(i); }
    else if (mode === 'b:depot') { for (i = 0; i < FY.NH; i++) if (S.own[i] === 0 && !S.depot[i] && FY.CAPS[0] !== i) out.push(i); }
    else if (mode === 'b:fort') { for (i = 0; i < FY.NH; i++) if (S.own[i] === 0 && !S.fort[i]) out.push(i); }
    else if (mode === 'o:air') { S.units.forEach(function (u) { if (u.s > 0) out.push(u.at); }); for (i = 0; i < FY.NH; i++) if (S.own[i] > 0 && S.depot[i] === -1) out.push(i); }
    else if (mode === 'o:lift') FY.unitsOf(S, 0).forEach(function (u) { if (sm.d[u.at] === Infinity) out.push(u.at); });
    return out;
  }
  function tryOrder(o) {
    var r = FY.addOrder(S, o);
    if (r === 'ok') { SND.play('stamp'); save(); }
    else { SND.play('err'); toast(r === 'full' ? '命令は1手番に' + FY.K.cmds + 'つまで' : r === 'money' ? '物資が足りません' : r === 'busy' ? 'この軍団にはもう命令を出しています' : '命令できません'); }
    clearSel(); card(null); render();
    return r === 'ok';
  }
  function tapHex(i) {
    if (!S || S.done) return;
    if (RP) { finishReplay(); return; }
    FL = null;
    if (i < 0) { clearSel(); card(null); render(); return; }
    var u = FY.unitAt(S, i), sm = FY.supplyMap(S, 0);
    if (mode === 're' || mode.indexOf('b:') === 0 || mode.indexOf('o:') === 0) {
      if (validTargets().indexOf(i) < 0) { toast('ここには命令できません(光っているマスを選ぶ)'); return; }
      if (mode === 're') tryOrder({ k: 're', unit: u.id, cost: FY.K.costRe });
      else if (mode === 'b:rail') tryOrder({ k: 'rail', at: i, cost: FY.K.costRail });
      else if (mode === 'b:depot') tryOrder({ k: 'depot', at: i, cost: FY.K.costDepot });
      else if (mode === 'b:fort') tryOrder({ k: 'fort', at: i, cost: FY.K.costFort });
      else if (mode === 'o:air') tryOrder({ k: 'air', at: i });
      else if (mode === 'o:lift') tryOrder({ k: 'lift', unit: u.id });
      return;
    }
    if ((mode === 'unit' || mode === 'confirm') && sel) {
      var su = unitById(sel), mv = FY.moves(S, su);
      if (mv[i]) {
        var o = S.own[i], d = FY.unitAt(S, i);
        if (o === 0 && !d) { tryOrder({ k: 'move', unit: su.id, to: i }); return; }
        // 取る・攻める前の確認
        var F = FY.front(S, 0), keep = S.own[i]; S.own[i] = 0; var F2 = FY.front(S, 0); S.own[i] = keep;
        var G = FY.garrison(S, 0), frontLine = '取ると 前線 ' + F + ' → ' + F2 + '(守備隊 ' + G + (F2 > G ? '・守りが薄くなる' : '') + ')';
        pending = { k: 'move', unit: su.id, to: i };
        RT = null;
        var head = '<b>' + FY.NAME[su.type] + '(兵力' + su.str + ')→ ' + esc(FY.place(S, i)) + '</b><br>';
        var btns = '<div class="row"><button data-act="cancelc">やめる</button><button class="ok" data-act="confirm">命令する</button></div>';
        if (o === -1 && !d) {
          card(head + '見こみ: <span class="od g">取れる</span>(どこの国でもない土地。戦いなし)<br>' + frontLine + btns);
        } else {
          var od = FY.odds(S, su, i, sm), lb = FY.label(od.r), cls = lb === '優勢' ? 'g' : lb === '互角' ? 'm' : 'b';
          var f = FY.factorOf(S, sm.d[su.at]), why = ['補給' + Math.round(f * 100) + '%'];
          if (f === 0) {
            pending = null;
            card(head + '<span class="warn">攻撃できない: この軍団は補給が切れている</span><br><span class="sub">自国のマスをつなぎ直すか、「作戦 → 空輸」で持たせる</span><div class="row"><button data-act="cancelc">やめる</button></div>');
            mode = 'unit'; placeCard(i); dirty = true; return;
          }
          if (FY.TERR[S.terr[i]].def > 1 && !(S.terr[i] === 'river' && FY.winter(S))) why.push(FY.TERR[S.terr[i]].name + 'で守りが固い');
          if (S.town[i]) why.push('町で守りが固い');
          if (S.fort[i]) why.push('陣地あり');
          if (FY.winter(S)) why.push('冬で攻めは-25%');
          if (d) why.push('相手: ' + FY.NAME[d.type] + ' 兵力' + d.str + (FY.AFF[su.type][d.type] > 1 ? '(相性◎)' : FY.AFF[su.type][d.type] < 1 ? '(相性✕)' : ''));
          else if (o > 0) why.push('守備隊 ' + FY.garStr(S, o).toFixed(1));
          var rl = '';
          if (d) { RT = retreatInfo(d); rl = '<br>' + retreatLine(d, RT); }
          card(head + '見こみ: <span class="od ' + cls + '">' + lb + '</span>(強さの比 ' + od.r.toFixed(2) + ')' +
            '<br><span class="sub">' + esc(why.join(' ・ ')) + '</span>' + rl + '<br>' + frontLine + btns);
        }
        mode = 'confirm'; placeCard(i); dirty = true;
        return;
      }
    }
    if (u && u.s === 0) {
      if (S.orders.some(function (x) { return x.unit === u.id; })) { toast('この軍団にはもう命令を出しています(命令を押すと取り消し)'); return; }
      clearSel(); sel = u.id; mode = 'unit'; SND.play('tap');
      var f2 = FY.factorOf(S, sm.d[u.at]), R0 = retreatInfo(u);
      if (R0.all.length <= 1) RT = { open: R0.all, blocked: {} };
      card('<b>' + (u.cmd ? FY.CMD_NAME[u.cmd] + 'の' : '') + FY.NAME[u.type] + '軍団</b> 兵力' + u.str + ' ・ 補給' + (f2 ? Math.round(f2 * 100) + '%' : 'なし(孤立)') +
        (R0.all.length <= 1 ? '<br>' + retreatLine(u, R0) : '') +
        '<br><span class="sub">光るマスへ: 緑=移動 / 黄=取る / 赤=攻撃(優勢・互角・不利)</span>');
      placeCard(i); render(); return;
    }
    // マスの説明(敵の軍団なら退路も)
    clearSel();
    var o2 = S.own[i];
    if (!S.land[i]) { card(null); render(); return; }
    var info = '<b>' + esc(FY.place(S, i)) + '</b> ・ ' + (o2 === 0 ? '自国' : o2 > 0 ? FY.NATIONS[o2].name : 'どこの国でもない') + ' ・ 守り×' + FY.terrDef(S, i).toFixed(2);
    if (u) { info += '<br>' + FY.NATIONS[u.s].name + 'の' + FY.NAME[u.type] + '軍団 兵力' + u.str; RT = retreatInfo(u); info += '<br>' + retreatLine(u, RT); }
    if (o2 === 0) info += '<br>補給 ' + (sm.d[i] === Infinity ? 'なし(孤立)' : Math.round(FY.factorOf(S, sm.d[i]) * 100) + '%');
    if (S.iso[i] > 0) info += '<br><span class="warn">孤立 あと' + (FY.K.isoTurns - S.iso[i]) + '手番で' + (o2 === 0 ? '取られる' : 'こちらのものに') + '</span>';
    card(info + '<div class="row"><button data-act="cancelc">閉じる</button></div>');
    placeCard(i); render();
  }

  // ---- 進める: 自分の命令1→2→3、敵の国ごと、手番のおわり、の順に再生する ----
  function advance() {
    if (!S || S.done || RP) return;
    if (!S.trial && S.store <= 0) { toast('次の手番まで あと' + Math.ceil(FY.nextAccrue(S, Date.now()) / 60000) + '分'); return; }
    if (S.seasonStart) { seasonModal(); return; }
    var nOrders = S.orders.length, rec = [], turn0 = S.turn;
    FY.advance(S, rec);
    var rep = FY.report(S, rec);
    clearSel(); card(null);
    // 保存用の短い記録(「くわしく」で見る)
    S.lastRep = { turn: turn0 + 1, none: !nOrders, gained: rep.gained, lost: rep.lost,
      steps: rep.steps.filter(function (s) { return s.lines.length; }).map(function (s) { return { title: s.title, lines: s.lines.map(function (l) { return { t: l.t, at: l.at, tone: l.tone }; }) }; }) };
    save();
    var steps = rep.steps.filter(function (s) { return s.lines.length || s.ev.some(function (e) { return e.k === 'move' || e.k === 'flip' || e.k === 'die'; }); });
    SND.play('go');
    if (!steps.length) { RP = null; afterReplay(rep); return; }
    RP = { steps: steps, i: -1, t: 0, dur: 0, rep: rep };
    nextStep();
    render();
  }
  function stepDur(st) {
    if (!st.lines.length) return 0.4;
    var fight = st.ev.some(function (e) { return e.k === 'fight'; });
    return 0.75 + Math.min(2, st.lines.length - 1) * 0.3 + (fight ? 0.25 : 0);
  }
  function nextStep() {
    RP.i++; RP.t = 0;
    if (RP.i >= RP.steps.length) { finishReplay(); return; }
    var st = RP.steps[RP.i];
    RP.dur = stepDur(st);
    var tones = st.lines.map(function (l) { return l.tone; });
    if (st.ev.some(function (e) { return e.k === 'fight'; })) SND.play('boom', 0.8);
    setTimeout(function () {
      if (tones.indexOf('big') >= 0) SND.play('kill');
      else if (tones.indexOf('crit') >= 0) SND.play('crit');
      else if (st.lines.some(function (l) { return l.tone === 'bad' && /取られ/.test(l.t); })) SND.play('lost');
      else if (st.lines.some(function (l) { return l.tone === 'good'; })) SND.play('capture');
    }, 260);
    var h = '<div class="h"><span>' + esc(st.title) + '</span><span>タップで早送り</span></div>';
    st.lines.slice(0, 3).forEach(function (l) { h += '<div class="ln ' + l.tone + '">' + esc(l.t) + '</div>'; });
    if (!st.lines.length) h += '<div class="ln info">' + (st.who === 0 ? '移動' : '軍団が動いた') + '</div>';
    $('cap').innerHTML = h; $('cap').classList.remove('hidden');
    dirty = true;
  }
  function finishReplay() {
    if (!RP) return;
    var rep = RP.rep; RP = null;
    $('cap').classList.add('hidden');
    afterReplay(rep);
  }
  function afterReplay(rep) {
    SUMV = { t: 0, gained: rep.gained, lost: rep.lost };
    if (rep.lost.length && !rep.gained.length) SND.play('lost');
    render();
    repCard();
    setTimeout(function () {
      if (S.done) endModal();
      else if (S.seasonStart) { SND.play('rankS'); seasonModal(); }
    }, 900);
  }
  // 手番の報告(地図の下の札)。大きな出来事・痛手を先に、4行まで
  function repCard() {
    var R = S.lastRep; if (!R) return;
    var all = []; R.steps.forEach(function (s) { s.lines.forEach(function (l) { all.push(l); }); });
    var rank = { crit: 0, big: 1, bad: 2, good: 3, info: 4 };
    var top = all.slice().sort(function (a, b) { return rank[a.tone] - rank[b.tone]; }).filter(function (l) { return l.tone !== 'info'; }).slice(0, 4);
    var h = '<div class="sum"><span>' + R.turn + '手番目</span><span class="gn">取った ' + R.gained.length + '</span><span class="ls">取られた ' + R.lost.length + '</span></div><ul>';
    if (R.none) h += '<li class="bad">命令なしで1手番が過ぎた</li>';
    top.forEach(function (l) { h += '<li class="' + l.tone + '">' + esc(l.t) + '</li>'; });
    if (!top.length && !R.none) h += '<li class="info">大きな出来事はなかった</li>';
    h += '</ul><div class="row"><button data-act="replog">くわしく(' + all.length + '件)</button><button data-act="cancelc">閉じる</button></div>';
    card(h, 'rep');
    var hs = R.gained.concat(R.lost), c = $('card');
    c.classList.remove('top');
    if (hs.length) {
      var my = hs.reduce(function (a, i) { return a + hy(i); }, 0) / hs.length, low = hs.filter(function (i) { return hy(i) + HS > CH - c.offsetHeight - 14; }).length;
      if (low > hs.length / 2 || my > CH - c.offsetHeight - 14) c.classList.add('top');
    }
  }
  function repLog() {
    var R = S.lastRep; if (!R) return;
    var h = '<h3>' + R.turn + '手番目のできごと</h3><div class="log">';
    if (R.none) h += '<div class="lt">命令なしで1手番が過ぎた</div>';
    R.steps.forEach(function (s) {
      h += '<div class="lt">' + esc(s.title) + '</div>';
      s.lines.forEach(function (l) { h += '<button class="ll ' + l.tone + '"' + (l.at >= 0 ? ' data-act="goto" data-at="' + l.at + '"' : '') + '>' + esc(l.t) + (l.at >= 0 ? '<i>地図で見る ›</i>' : '') + '</button>'; });
    });
    h += '</div><button class="btn sub" data-act="close">閉じる</button>';
    $('sheet').innerHTML = h; $('sheetWrap').classList.remove('hidden');
  }

  // ---- 季節のはじめ ----
  function seasonModal() {
    var sea = FY.SEASONS[FY.season(S)], cls = seasonCls();
    var h = '<div class="season"><div class="d">' + FY.year(S) + '年目</div><div class="big ' + cls + '">' + sea.name + '</div><div class="d">' + esc(sea.desc) + '</div>';
    var done = S.objDone[S.objDone.length - 1];
    if (done && done.season !== undefined && S.turn > 0) h += '<div class="d" style="margin-top:6px;color:' + (done.ok ? 'var(--good)' : 'var(--dim)') + '">前の季節の目標「' + esc(FY.OBJS[done.k].name) + '」: ' + (done.ok ? '達成(物資+8)' : '未達成') + '</div>';
    h += '<div class="sec">敵のねらい</div>';
    S.intents.forEach(function (it) {
      h += '<div class="intent"><div class="face" data-face="e.' + FY.NATIONS[it.n].ecmd + '"></div><div><b style="color:' + NCOL2[it.n] + '">' + esc(FY.NATIONS[it.n].name) + '</b><br>' + esc(FY.intentText(S, it)) + '<small>確かさ: ' + it.cert + (it.cert !== '高' ? ' ・ 作戦の「偵察」で確かになる' : '') + '</small></div></div>';
    });
    h += '<div class="sec">この季節の作戦目標を1つ(達成で物資+8)</div>';
    S.objOpts.forEach(function (k) { h += '<button class="opt" data-act="obj" data-k="' + k + '"><div><b>' + esc(FY.OBJS[k].name) + '</b></div></button>'; });
    h += '</div>';
    $('modal').innerHTML = h; $('modalWrap').classList.remove('hidden');
    Array.prototype.forEach.call($('modal').querySelectorAll('[data-face]'), function (el) { face(el, el.dataset.face, 1.4); });
  }
  function endModal() {
    var win = S.winner === 0, lc = FY.landCount(S);
    SND.bgm(null); SND.play(win ? 'win' : 'lose');
    var title = win ? '勝利' : S.winner === 1 ? '首都陥落' : '期限切れ';
    $('modal').innerHTML = '<div class="end"><h2 style="color:' + (win ? 'var(--shu2)' : '#8ea2ad') + '">' + title + '</h2><div style="text-align:center;color:var(--sub)">' + (win ? '3つの敵国の首都をすべて落とした' : S.winner === 1 ? '自国の首都が落ちた' : '3年が過ぎた') + '</div>' +
      '<table><tr><td>評価</td><td>' + FY.score(S) + '</td></tr><tr><td>かかった手番</td><td>' + S.turn + '(' + FY.year(S) + '年目)</td></tr><tr><td>自国のマス</td><td>' + FY.hexes(S, 0) + ' / ' + lc + '</td></tr>' +
      '<tr><td>包囲して消した敵の軍団</td><td>' + S.st.pockets + '</td></tr><tr><td>包囲された自軍の軍団</td><td>' + S.st.pocketsLost + '</td></tr><tr><td>落とした国</td><td>' + S.st.falls.length + ' / 3</td></tr>' +
      '<tr><td>達成した作戦目標</td><td>' + S.objDone.filter(function (x) { return x.ok; }).length + ' / ' + S.objDone.length + '</td></tr></table>' +
      '<button class="btn" data-act="new">新しい大陸で始める</button></div>';
    $('modalWrap').classList.remove('hidden');
  }

  // ---- メニュー ----
  function menu() {
    var h = '<h3>メニュー</h3>' +
      '<button class="opt" data-act="help"><div><b>遊び方</b><small>補給・前線・季節のしくみ</small></div></button>' +
      '<button class="opt" data-act="trial"><div><b>試遊モード: ' + (S.trial ? 'ON' : 'OFF') + '</b><small>' + (S.trial ? '手番を待たずに進められます(試作で遊びやすいように)' : '手番は3時間に1つたまります(最大8)。本来の遊び方') + '</small></div></button>' +
      '<button class="opt" data-act="snd"><div><b>音: ' + (SND.cfg().mute ? 'OFF' : 'ON') + '</b></div></button>' +
      '<button class="opt" data-act="newask"><div><b>新しい戦役を始める</b><small>いまの大陸は消えます</small></div></button>';
    $('sheet').innerHTML = h; $('sheetWrap').classList.remove('hidden');
  }
  function help() {
    $('modal').innerHTML = '<div class="help"><h3 style="margin:0 0 6px">遊び方</h3>' +
      '<p>南の<b>自国(朱)</b>から始めて、3つの敵国の<b>首都(★)</b>を落とせば勝ち。自国の首都が落ちたら負け。期限は3年(96手番)。</p>' +
      '<p>1手番に出せる<b>命令は3つ</b>。軍団をタップ → 光るマスをタップで移動・攻撃(赤いマスは「優勢・互角・不利」の見こみつき)。「補充」「建設」「作戦」も命令を1つ使います。そろったら<b>進める</b>。自分の命令1→2→3、敵の国ごとの動きの順に再生します(タップで早送り)。</p>' +
      '<p><b>補給</b>: 首都と補給基地から、自国のマスをたどった距離で補給が細ります(2マスまで100% → 6マス以上20%)。朱の線が太いほど十分。<b>鉄道</b>の上は距離が半分。つながっていない軍団は攻撃できず、毎手番 兵力-2。</p>' +
      '<p><b>包囲</b>: 退路(下がれる自国のマス)のない軍団は、負けると全滅。敵の軍団をタップすると退路が点線で出ます。退路を先に取ってから攻めれば全滅させられます。つながりが切れて孤立したマスは3手番で相手のものに(そこにいる軍団ごと)。</p>' +
      '<p><b>前線と守備隊</b>: 敵ととなり合う自国のマスの数が「前線」。守備隊(6+町×2)より多いと、空いたマスの守りが薄くなります。</p>' +
      '<p><b>季節</b>(8手番で1つ): 春はぬかるみ(戦車が遅い・川を渡れない)、秋は物資1.5倍、<b>冬</b>は補給の届く距離が2マス縮み、攻める側は-25%、川が凍って渡れます。</p>' +
      '<p>季節のはじめに<b>敵のねらい</b>(確かさつき)と<b>作戦目標</b>が出ます。手番の結果は地図の下の報告と、上の「報告」で見られます。</p><button class="btn" data-act="closem">閉じる</button></div>';
    $('modalWrap').classList.remove('hidden');
  }

  // ---- ボタン ----
  var ACT = {
    menu: menu,
    objinfo: function () { toast(S.obj ? '作戦目標: ' + FY.OBJS[S.obj.k].name + (S.obj.failed ? '(この季節は失敗)' : '(季節の終わりに達成で物資+8)') : '季節のはじめに作戦目標を選びます'); },
    replog: repLog,
    goto: function (el) { var at = +el.dataset.at; $('sheetWrap').classList.add('hidden'); FL = { at: at, t: 0 }; tapHex(at); FL = { at: at, t: 0 }; },
    close: function () { $('sheetWrap').classList.add('hidden'); },
    closem: function () { $('modalWrap').classList.add('hidden'); if (S && S.seasonStart && !S.done) seasonModal(); },
    help: function () { $('sheetWrap').classList.add('hidden'); help(); },
    trial: function () { S.trial = !S.trial; if (!S.trial) { S.lastT = Date.now(); S.store = Math.max(S.store, 3); } save(); render(); menu(); },
    snd: function () { SND.set({ mute: !SND.cfg().mute }); menu(); },
    newask: function () { if (confirm('新しい大陸で始めますか?(いまの戦役は消えます)')) { $('sheetWrap').classList.add('hidden'); newCampaign(S ? S.trial : true); seasonModal(); } },
    'new': function () { $('modalWrap').classList.add('hidden'); newCampaign(S.trial); seasonModal(); },
    obj: function (el) { FY.chooseObjective(S, el.dataset.k); $('modalWrap').classList.add('hidden'); save(); render(); SND.bgm('menu'); },
    cancel: function (el) { FY.cancelOrder(S, +el.dataset.k); SND.play('close'); save(); render(); },
    cancelc: function () { clearSel(); card(null); render(); },
    confirm: function () { if (pending) tryOrder(pending); pending = null; },
    advance: advance,
    'mode-re': function () {
      if (mode === 're') { clearSel(); card(null); render(); return; }
      var us = FY.unitsOf(S, 0), canRaise = us.length < FY.K.maxCorps && !FY.unitAt(S, FY.CAPS[0]);
      $('sheet').innerHTML = '<h3>補充</h3><button class="opt" data-act="pick-re"><div><b>軍団の兵力を+' + FY.K.reAmt + '</b><small>補給が届いている軍団を選ぶ(兵力' + FY.K.maxStr + 'まで)</small></div><span class="c">物資' + FY.K.costRe + '</span></button>' +
        ['inf', 'at', 'tank', 'art'].map(function (t) { return '<button class="opt" data-act="raise" data-t="' + t + '"' + (canRaise ? '' : ' disabled') + '><div><b>新しい軍団: ' + FY.NAME[t] + '</b><small>' + (canRaise ? '首都に兵力' + FY.K.raiseStr + 'で現れる' : us.length >= FY.K.maxCorps ? '軍団は5つまで' : '首都が空いていない') + '</small></div><span class="c">物資' + FY.K.costRaise + '</span></button>'; }).join('');
      $('sheetWrap').classList.remove('hidden');
    },
    'pick-re': function () { $('sheetWrap').classList.add('hidden'); clearSel(); mode = 're'; card('補充する軍団をタップ(光っている軍団)<div class="row"><button data-act="cancelc">やめる</button></div>'); render(); },
    raise: function (el) { $('sheetWrap').classList.add('hidden'); tryOrder({ k: 'raise', type: el.dataset.t, cost: FY.K.costRaise }); },
    'mode-build': function () {
      if (mode.indexOf('b:') === 0) { clearSel(); card(null); render(); return; }
      $('sheet').innerHTML = '<h3>建設</h3>' +
        '<button class="opt" data-act="build" data-m="rail"><div><b>鉄道を1マス</b><small>鉄道の上は補給の距離が半分、軍団は3マス動ける。いまの鉄道のとなりに敷く</small></div><span class="c">物資' + FY.K.costRail + '</span></button>' +
        '<button class="opt" data-act="build" data-m="depot"><div><b>補給基地</b><small>' + FY.K.depotTurns + '手番で完成。そこから補給が届く(取られるとなくなる)</small></div><span class="c">物資' + FY.K.costDepot + '</span></button>' +
        '<button class="opt" data-act="build" data-m="fort"><div><b>陣地</b><small>そのマスの守りが1.3倍</small></div><span class="c">物資' + FY.K.costFort + '</span></button>';
      $('sheetWrap').classList.remove('hidden');
    },
    build: function (el) { $('sheetWrap').classList.add('hidden'); clearSel(); mode = 'b:' + el.dataset.m; card('建設するマスをタップ(光っているマス)<div class="row"><button data-act="cancelc">やめる</button></div>'); render(); },
    'mode-op': function () {
      if (mode.indexOf('o:') === 0) { clearSel(); card(null); render(); return; }
      var o = S.ops;
      $('sheet').innerHTML = '<h3>作戦(季節に各1回)</h3>' +
        '<button class="opt" data-act="op" data-m="air"' + (o.air ? '' : ' disabled') + '><div><b>空爆</b><small>敵の軍団の兵力-2、または敵の補給基地を2手番止める</small></div><span class="c">' + (o.air ? '使える' : '使用済') + '</span></button>' +
        '<button class="opt" data-act="op" data-m="recon"' + (o.recon ? '' : ' disabled') + '><div><b>偵察</b><small>この季節の敵のねらいが確かになる</small></div><span class="c">' + (o.recon ? '使える' : '使用済') + '</span></button>' +
        '<button class="opt" data-act="op" data-m="lift"' + (o.lift ? '' : ' disabled') + '><div><b>空輸</b><small>孤立した軍団を2手番だけ持たせる(兵力が減らない)</small></div><span class="c">' + (o.lift ? '使える' : '使用済') + '</span></button>';
      $('sheetWrap').classList.remove('hidden');
    },
    op: function (el) {
      $('sheetWrap').classList.add('hidden');
      if (el.dataset.m === 'recon') { tryOrder({ k: 'recon' }); return; }
      clearSel(); mode = 'o:' + el.dataset.m;
      if (!validTargets().length) { toast(el.dataset.m === 'lift' ? '孤立している軍団はいません' : '狙える敵がいません'); mode = 'idle'; render(); return; }
      card((el.dataset.m === 'air' ? '空爆する敵をタップ' : '空輸する軍団をタップ') + '<div class="row"><button data-act="cancelc">やめる</button></div>'); render();
    }
  };
  var QUIET = { confirm: 1, cancel: 1, advance: 1, snd: 1 };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var f = ACT[el.dataset.act];
    if (!f) return;
    e.preventDefault();
    if (RP && el.dataset.act !== 'menu') { finishReplay(); return; }
    if (!QUIET[el.dataset.act]) SND.play('tap');
    f(el);
  });
  $('cap').addEventListener('click', function () { if (RP) finishReplay(); });
  var down = null;
  cv.addEventListener('pointerdown', function (e) { fitCheck(); var r = cv.getBoundingClientRect(); down = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  cv.addEventListener('pointerup', function (e) {
    if (!down) return;
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - down.x, y - down.y) < 14) tapHex(hexAt(x, y));
    down = null;
  });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  window.addEventListener('resize', function () { resize(); });
  if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe($('mapWrap'));
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S) { var a = FY.accrue(S, Date.now()); if (a) { toast('手番が' + a + 'つたまった'); save(); } render(); } });

  // ---- 毎こま ----
  var lastTs = 0;
  function frame(ts) {
    var dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0.016; lastTs = ts;
    if (RP) { RP.t += dt; dirty = true; if (RP.t >= RP.dur) nextStep(); }
    if (SUMV) { SUMV.t += dt; dirty = true; if (SUMV.t > 2.2) SUMV = null; }
    if (FL) { FL.t += dt; dirty = true; if (FL.t > 2.4) FL = null; }
    fitCheck();
    if (dirty && S) { dirty = false; draw(); }
    raf = requestAnimationFrame(frame);
  }

  // ---- 起動 ----
  S = load();
  if (!S) { newCampaign(true); help(); }
  else { var a0 = FY.accrue(S, Date.now()); if (a0) toast('手番が' + a0 + 'つたまった'); }
  render();
  resize();
  if (S.seasonStart && $('modalWrap').classList.contains('hidden')) seasonModal();
  else if (S.done) endModal();
  SND.bgm('menu');
  setInterval(function () { if (S && !S.trial) { if (FY.accrue(S, Date.now())) { save(); render(); } } }, 60000);
  raf = requestAnimationFrame(frame);
  window.__fuyu = { FY: FY, get S() { return S; }, snd: SND, advance: advance, tap: tapHex, render: render, hexXY: function (i) { return [hx(i), hy(i)]; },
    get replaying() { return !!RP; }, skip: finishReplay, size: function () { return { CW: CW, CH: CH, cssW: cv.clientWidth, cssH: cv.clientHeight }; }, tags: function () { draw(); return TSTAT; },
    autoTurn: function (kind) { FY.playerAI(S, kind || 'smart'); render(); } };
