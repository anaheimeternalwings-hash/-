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
  var NCOL = ['#c8341f', '#3d5a80', '#5b4b6e', '#4a6b5d'], NCOL2 = ['#ff6a4d', '#8fb0d6', '#b6a2d6', '#9cc7b0'];

  // ---- 保存 ----
  var S = null;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  function load() { try { var o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.v === 1 && o.land) return o; } catch (e) { } return null; }
  function newCampaign(trial) {
    S = FY.create({ seed: (Math.random() * 2147483647) | 0, now: Date.now(), trial: trial !== false });
    sel = null; mode = 'idle'; card(null); save(); dirty = true; render();
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
  function hx(i) { var c = i % FY.W, r = (i / FY.W) | 0; return X0 + R3 * HS * (c + 0.5 + 0.5 * (r & 1)); }
  function hy(i) { var r = (i / FY.W) | 0; return Y0 + HS * (1 + 1.5 * r); }
  function hexPath(x, y, s) { cx.beginPath(); for (var k = 0; k < 6; k++) { var a = Math.PI / 6 + k * Math.PI / 3; if (k) cx.lineTo(x + s * Math.cos(a), y + s * Math.sin(a)); else cx.moveTo(x + s * Math.cos(a), y + s * Math.sin(a)); } cx.closePath(); }
  function hexAt(px, py) {
    var best = -1, bd = 1e9;
    for (var i = 0; i < FY.NH; i++) { var d = Math.hypot(px - hx(i), py - hy(i)); if (d < bd) { bd = d; best = i; } }
    return bd <= HS ? best : -1;
  }

  // ---- 選択と命令のモード ----
  var sel = null, mode = 'idle', pending = null, anim = null;
  function unitById(id) { return S.units.filter(function (u) { return u.id === id; })[0]; }
  function seasonCls() { return ['p', 's', 'a', 'w'][FY.season(S)]; }

  // ---- 描画 ----
  function tileKey(i) {
    var t = S.terr[i], w = FY.winter(S);
    if (t === 'forest') return w ? 'm.sforest' : 'm.forest';
    if (t === 'mount') return 'm.mount';
    return w ? 'm.snow' : 'm.grass';
  }
  function draw() {
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.clearRect(0, 0, CW, CH);
    // 海
    var g = cx.createLinearGradient(0, 0, 0, CH); g.addColorStop(0, '#16222a'); g.addColorStop(1, '#0d151b');
    cx.fillStyle = g; cx.fillRect(0, 0, CW, CH);
    cx.strokeStyle = 'rgba(140,170,190,.06)'; cx.lineWidth = 1;
    for (var y = 8; y < CH; y += 10) { cx.beginPath(); for (var x = 0; x <= CW; x += 12) cx.lineTo(x, y + Math.sin(x * 0.05 + y) * 2); cx.stroke(); }
    var i, w = FY.winter(S), sm = FY.supplyMap(S, 0), ip = anim ? anim.k : 1;
    // 陸のマス
    for (i = 0; i < FY.NH; i++) {
      if (!S.land[i]) continue;
      var x0 = hx(i), y0 = hy(i), im = img(tileKey(i));
      cx.save(); hexPath(x0, y0, HS - 0.6); cx.clip();
      if (im) cx.drawImage(im, x0 - HS * 1.05, y0 - HS * 1.05, HS * 2.1, HS * 2.1); else { cx.fillStyle = '#8a8a6a'; cx.fill(); }
      if (S.terr[i] === 'mount' && w) { cx.fillStyle = 'rgba(235,245,255,.35)'; cx.fill(); }
      // 持ち主の色(塗り変わる途中はにじむ)
      var o = S.own[i];
      var fl = anim && anim.flip[i];
      if (fl) {
        if (fl.from >= 0) { cx.fillStyle = NCOL[fl.from]; cx.globalAlpha = 0.34; cx.fillRect(x0 - HS, y0 - HS, HS * 2, HS * 2); }
        cx.globalAlpha = 0.34; cx.fillStyle = NCOL[o] || 'rgba(0,0,0,0)';
        cx.beginPath(); cx.arc(x0, y0, HS * 1.2 * Math.min(1, ip * 1.6), 0, 6.283); cx.fill(); cx.globalAlpha = 1;
      } else if (o >= 0) { cx.globalAlpha = o === 0 ? 0.36 : 0.46; cx.fillStyle = NCOL[o]; cx.fillRect(x0 - HS, y0 - HS, HS * 2, HS * 2); cx.globalAlpha = 1; }
      // 川
      if (S.terr[i] === 'river') {
        cx.strokeStyle = w ? 'rgba(220,240,255,.85)' : 'rgba(60,120,170,.9)'; cx.lineWidth = w ? 3 : 4;
        cx.beginPath(); for (var k = 0; k <= 10; k++) { var px = x0 - HS + k * HS * 0.2, py = y0 + Math.sin(k * 1.2) * HS * 0.15; if (k) cx.lineTo(px, py); else cx.moveTo(px, py); } cx.stroke();
        if (w) { cx.fillStyle = '#1f3a52'; cx.font = '800 8px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillText('凍結', x0, y0 + HS * 0.55); }
      }
      cx.restore();
      // ふち
      hexPath(x0, y0, HS - 0.6); cx.strokeStyle = 'rgba(20,16,12,.45)'; cx.lineWidth = 1; cx.stroke();
      // 孤立
      if (o >= 0 && S.iso[i] > 0 && (o === 0 || FY.NB[i].some(function (n) { return S.own[n] === 0; }))) {
        var mine = o === 0, left = FY.K.isoTurns - S.iso[i], ly = FY.unitAt(S, i) ? y0 - HS * 0.78 : y0 + HS * 0.62;
        hexPath(x0, y0, HS - 3); cx.setLineDash([4, 3]); cx.strokeStyle = mine ? '#ff4d3a' : '#ffd166'; cx.lineWidth = 2; cx.stroke(); cx.setLineDash([]);
        var lt = (mine ? '孤立 あと' : '包囲 あと') + left;
        cx.font = '900 10px -apple-system,sans-serif'; cx.textAlign = 'center'; var tw = cx.measureText(lt).width + 6;
        cx.fillStyle = 'rgba(10,8,6,.85)'; cx.fillRect(x0 - tw / 2, ly - 9, tw, 12); cx.fillStyle = mine ? '#ff7a6a' : '#ffd166'; cx.fillText(lt, x0, ly);
      }
    }
    // 国境(持ち主の違う辺を太く)
    for (i = 0; i < FY.NH; i++) {
      if (!S.land[i] || S.own[i] < 0) continue;
      for (var k2 = 0; k2 < 6; k2++) {
        var a1 = Math.PI / 6 + k2 * Math.PI / 3, a2 = a1 + Math.PI / 3, mx = hx(i) + HS * R3 / 2 * Math.cos(a1 + Math.PI / 6), my = hy(i) + HS * R3 / 2 * Math.sin(a1 + Math.PI / 6);
        var nb = hexAt(hx(i) + (mx - hx(i)) * 2, hy(i) + (my - hy(i)) * 2);
        if (nb >= 0 && S.land[nb] && S.own[nb] === S.own[i]) continue;
        cx.strokeStyle = NCOL2[S.own[i]]; cx.lineWidth = 2.5; cx.globalAlpha = 0.8;
        cx.beginPath(); cx.moveTo(hx(i) + (HS - 2) * Math.cos(a1), hy(i) + (HS - 2) * Math.sin(a1)); cx.lineTo(hx(i) + (HS - 2) * Math.cos(a2), hy(i) + (HS - 2) * Math.sin(a2)); cx.stroke(); cx.globalAlpha = 1;
      }
    }
    // 鉄道
    cx.strokeStyle = 'rgba(30,22,16,.85)'; cx.lineWidth = 2.5;
    for (i = 0; i < FY.NH; i++) if (S.rail[i]) FY.NB[i].forEach(function (n) {
      if (n > i && S.rail[n]) {
        cx.beginPath(); cx.moveTo(hx(i), hy(i)); cx.lineTo(hx(n), hy(n)); cx.stroke();
        var dx = hx(n) - hx(i), dy = hy(n) - hy(i), L = Math.hypot(dx, dy), nx = -dy / L * 4, ny = dx / L * 4;
        for (var q = 0.15; q < 1; q += 0.17) { var ex = hx(i) + dx * q, ey = hy(i) + dy * q; cx.beginPath(); cx.moveTo(ex - nx, ey - ny); cx.lineTo(ex + nx, ey + ny); cx.stroke(); }
      }
    });
    // 町・首都・補給基地・陣地
    for (i = 0; i < FY.NH; i++) {
      if (!S.land[i]) continue;
      var x1 = hx(i), y1 = hy(i), cap = FY.CAPS.indexOf(i);
      if (cap >= 0) {
        var hq = img('b.hq');
        if (hq) cx.drawImage(hq, x1 - HS * 0.62, y1 - HS * 0.75, HS * 1.24, HS * 1.24 * hq.height / hq.width);
        cx.fillStyle = NCOL2[cap]; cx.font = '900 ' + Math.round(HS * 0.36) + 'px -apple-system,sans-serif'; cx.textAlign = 'center';
        cx.lineWidth = 3; cx.strokeStyle = 'rgba(0,0,0,.7)'; cx.strokeText('★首都', x1, y1 - HS * 0.55); cx.fillText('★首都', x1, y1 - HS * 0.55);
      } else if (S.town[i]) {
        cx.fillStyle = 'rgba(30,24,18,.75)';
        [[-0.22, 0.05], [0.12, -0.08], [0.2, 0.2]].forEach(function (p) { var bx = x1 + p[0] * HS, by = y1 + p[1] * HS, s = HS * 0.16; cx.fillRect(bx - s, by - s * 0.7, s * 2, s * 1.4); cx.beginPath(); cx.moveTo(bx - s * 1.2, by - s * 0.7); cx.lineTo(bx, by - s * 1.6); cx.lineTo(bx + s * 1.2, by - s * 0.7); cx.fill(); });
      }
      if (S.depot[i]) {
        var dp = img('b.depot');
        cx.globalAlpha = S.depot[i] === -1 ? 1 : 0.5;
        if (dp) cx.drawImage(dp, x1 - HS * 0.5, y1 - HS * 0.2, HS, HS * dp.height / dp.width);
        cx.globalAlpha = 1;
        cx.fillStyle = '#ffd166'; cx.font = '900 10px -apple-system,sans-serif'; cx.textAlign = 'center';
        cx.fillText(S.depot[i] === -1 ? '補給基地' : '建設中 あと' + S.depot[i], x1, y1 + HS * 0.8);
      }
      if (S.fort[i]) { cx.strokeStyle = '#4a3a20'; cx.lineWidth = 3; cx.beginPath(); cx.arc(x1, y1 + HS * 0.1, HS * 0.72, Math.PI * 0.15, Math.PI * 0.85); cx.stroke(); }
    }
    // 補給の線(自軍の軍団ごとに、補給のもとまで。太い=十分、細い=不足)
    FY.unitsOf(S, 0).forEach(function (u) {
      var d = sm.d[u.at]; if (d === Infinity || d === 0) return;
      var f = FY.factorOf(S, d), pts = [], c = u.at;
      while (c >= 0) { pts.push([hx(c), hy(c)]); c = sm.par[c]; }
      cx.strokeStyle = 'rgba(200,52,31,' + (0.35 + 0.5 * f) + ')'; cx.lineWidth = 1.5 + 5 * f; cx.lineCap = 'round'; cx.lineJoin = 'round';
      if (f < 0.5) cx.setLineDash([6, 5]);
      cx.beginPath(); pts.forEach(function (p, k) { if (k) cx.lineTo(p[0], p[1]); else cx.moveTo(p[0], p[1]); }); cx.stroke(); cx.setLineDash([]);
    });
    // 敵のねらい
    (S.intents || []).forEach(function (it) {
      if (!S.alive[it.n]) return;
      var x2 = hx(it.shown), y2 = hy(it.shown);
      cx.strokeStyle = NCOL2[it.n]; cx.lineWidth = 2; cx.setLineDash([3, 3]); cx.beginPath(); cx.arc(x2, y2, HS * 0.85, 0, 6.283); cx.stroke(); cx.setLineDash([]);
      cx.fillStyle = NCOL2[it.n]; cx.font = '900 10px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillText('狙' + (it.cert === '高' ? '' : '?'), x2 + HS * 0.62, y2 - HS * 0.55);
    });
    // 動ける先
    if (sel && mode === 'unit') {
      var u = unitById(sel); if (u) {
        var mv = FY.moves(S, u), smE = {};
        Object.keys(mv).forEach(function (k) {
          var to = +k, o2 = S.own[to], d2 = FY.unitAt(S, to), col, lab = '';
          if (o2 === 0 && !d2) col = 'rgba(111,209,138,.9)';
          else if (o2 === -1 && !d2) { col = 'rgba(224,169,59,.95)'; lab = '取る'; }
          else { var od = FY.odds(S, u, to, sm); col = 'rgba(255,90,70,.95)'; lab = FY.label(od.r); }
          hexPath(hx(to), hy(to), HS - 3); cx.strokeStyle = col; cx.lineWidth = 3; cx.stroke();
          if (lab) { cx.fillStyle = col; cx.font = '900 11px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.lineWidth = 3; cx.strokeStyle = 'rgba(0,0,0,.75)'; cx.strokeText(lab, hx(to), hy(to) + HS * 0.62); cx.fillText(lab, hx(to), hy(to) + HS * 0.62); }
        });
      }
    }
    if (mode === 're' || mode.indexOf('b:') === 0 || mode.indexOf('o:') === 0) validTargets().forEach(function (t) { hexPath(hx(t), hy(t), HS - 3); cx.strokeStyle = 'rgba(224,169,59,.95)'; cx.lineWidth = 3; cx.stroke(); });
    // 命令の矢印
    S.orders.forEach(function (o, k) {
      if (o.k !== 'move') { if (o.at !== undefined || o.unit) { var at = o.at !== undefined ? o.at : (unitById(o.unit) || {}).at; if (at !== undefined) { cx.fillStyle = '#ffd166'; cx.font = '900 12px -apple-system,sans-serif'; cx.textAlign = 'center'; cx.fillText('命令' + (k + 1), hx(at), hy(at) - HS * 0.75); } } return; }
      var uu = unitById(o.unit); if (!uu) return;
      arrow(hx(uu.at), hy(uu.at), hx(o.to), hy(o.to), '#ff6a4d', k + 1);
    });
    // 軍団
    S.units.forEach(function (un) {
      var p = anim && anim.pos[un.id], ux = hx(un.at), uy = hy(un.at);
      if (p) { var e = 1 - Math.pow(1 - Math.min(1, ip * 1.4), 3); ux = p[0] + (ux - p[0]) * e; uy = p[1] + (uy - p[1]) * e; }
      unitToken(un, ux, uy, sm);
    });
    // 戦いの火花・消えた軍団
    if (anim) anim.fx.forEach(function (f) {
      var a = Math.max(0, 1 - ip);
      if (f.k === 'fight') { cx.fillStyle = 'rgba(255,220,120,' + a + ')'; cx.beginPath(); cx.arc(f.x, f.y, HS * (0.3 + ip * 0.6), 0, 6.283); cx.fill(); }
      if (f.k === 'die') { cx.strokeStyle = 'rgba(20,14,10,' + a + ')'; cx.lineWidth = 4; cx.beginPath(); cx.moveTo(f.x - HS * 0.4, f.y - HS * 0.4); cx.lineTo(f.x + HS * 0.4, f.y + HS * 0.4); cx.moveTo(f.x + HS * 0.4, f.y - HS * 0.4); cx.lineTo(f.x - HS * 0.4, f.y + HS * 0.4); cx.stroke(); }
    });
  }
  function arrow(x1, y1, x2, y2, col, n) {
    var dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, ex = x2 - ux * HS * 0.45, ey = y2 - uy * HS * 0.45;
    cx.strokeStyle = col; cx.lineWidth = 4; cx.lineCap = 'round'; cx.setLineDash([7, 4]);
    cx.beginPath(); cx.moveTo(x1 + ux * HS * 0.4, y1 + uy * HS * 0.4); cx.lineTo(ex, ey); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = col; cx.beginPath(); cx.moveTo(ex + ux * 9, ey + uy * 9); cx.lineTo(ex - uy * 7, ey + ux * 7); cx.lineTo(ex + uy * 7, ey - ux * 7); cx.closePath(); cx.fill();
    cx.fillStyle = '#fff'; cx.font = '900 11px -apple-system,sans-serif'; cx.textAlign = 'center';
    cx.lineWidth = 3; cx.strokeStyle = 'rgba(0,0,0,.8)'; cx.strokeText(n, (x1 + x2) / 2, (y1 + y2) / 2 - 6); cx.fillText(n, (x1 + x2) / 2, (y1 + y2) / 2 - 6);
  }
  function unitToken(u, x, y, sm) {
    var r = HS * 0.5, col = NCOL[u.s], im = img('u.' + u.type + '.2'), f = u.s === 0 ? FY.factorOf(S, sm.d[u.at]) : 1;
    if (u.id === sel) { cx.fillStyle = 'rgba(255,209,102,.35)'; cx.beginPath(); cx.arc(x, y, r + 7, 0, 6.283); cx.fill(); }
    cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.ellipse(x, y + r * 0.9, r * 0.9, r * 0.3, 0, 0, 6.283); cx.fill();
    cx.fillStyle = u.s === 0 ? '#f4ece0' : '#e3e8ee'; cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.fill();
    if (im) { cx.save(); cx.beginPath(); cx.arc(x, y, r - 2, 0, 6.283); cx.clip(); cx.translate(x, y); if (u.s !== 0) cx.scale(-1, 1); var w2 = r * 2.2, h2 = w2 * im.height / im.width; cx.drawImage(im, -w2 / 2, -h2 / 2 + r * 0.05, w2, h2); cx.restore(); }
    cx.strokeStyle = col; cx.lineWidth = 3; cx.beginPath(); cx.arc(x, y, r, 0, 6.283); cx.stroke();
    // 兵力
    cx.fillStyle = col; cx.fillRect(x - 11, y + r - 6, 22, 14);
    cx.fillStyle = '#fff'; cx.font = '900 11px "SF Mono",ui-monospace,monospace'; cx.textAlign = 'center'; cx.fillText(u.str, x, y + r + 5);
    if (u.s === 0 && f === 0) { cx.fillStyle = '#ff4d3a'; cx.font = '900 10px -apple-system,sans-serif'; cx.fillText(u.lift ? '空輸中' : '孤立!', x, y - r - 3); }
    else if (u.s === 0 && f < 0.6) { cx.fillStyle = '#ffb36a'; cx.font = '900 10px -apple-system,sans-serif'; cx.fillText('補給' + Math.round(f * 100) + '%', x, y - r - 3); }
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
    $('tObj').textContent = '目標: ' + (S.obj ? FY.OBJS[S.obj.k].name : '—');
    var h = '';
    for (var k = 0; k < FY.K.cmds; k++) {
      var o = S.orders[k];
      h += o ? '<button class="ord on" data-act="cancel" data-k="' + k + '"><i>' + (k + 1) + '</i>' + esc(orderText(o)) + '</button>' : '<div class="ord">命令' + (k + 1) + '(空き)</div>';
    }
    $('orders').innerHTML = h;
    $('btnGo').disabled = S.done || (!S.trial && S.store <= 0);
    $('btnGo').textContent = !S.trial && S.store <= 0 ? '手番を待つ' : '進める';
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
  function card(html) { var c = $('card'); if (!html) { c.classList.add('hidden'); c.innerHTML = ''; return; } c.innerHTML = html; c.classList.remove('hidden'); }
  function feed(lines) {
    var f = $('feed');
    lines.slice(0, 3).forEach(function (l, k) { var d = document.createElement('div'); d.textContent = l.msg; if (l.s !== 0) d.className = 'e'; d.style.animationDelay = (k * 0.15) + 's'; f.appendChild(d); setTimeout(function () { d.remove(); }, 4800 + k * 150); });
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
    mode = 'idle'; sel = null; card(null); render();
    return r === 'ok';
  }
  function tapHex(i) {
    if (!S || S.done || anim) return;
    if (i < 0) { sel = null; mode = 'idle'; card(null); render(); return; }
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
    if (mode === 'unit' && sel) {
      var su = unitById(sel), mv = FY.moves(S, su);
      if (mv[i]) {
        var o = S.own[i], d = FY.unitAt(S, i);
        if (o === 0 && !d) { tryOrder({ k: 'move', unit: su.id, to: i }); return; }
        // 攻める・取る前の確認
        var od = FY.odds(S, su, i, sm), lb = o === -1 && !d ? '取れる' : FY.label(od.r), cls = lb === '優勢' || lb === '取れる' ? 'g' : lb === '互角' ? 'm' : 'b';
        var f = FY.factorOf(S, sm.d[su.at]), F = FY.front(S, 0), keep = S.own[i]; S.own[i] = 0; var F2 = FY.front(S, 0); S.own[i] = keep;
        var why = ['補給' + Math.round(f * 100) + '%'];
        if (FY.TERR[S.terr[i]].def > 1 && !(S.terr[i] === 'river' && FY.winter(S))) why.push(FY.TERR[S.terr[i]].name + 'で不利');
        if (FY.winter(S)) why.push('冬で-25%');
        if (d) why.push('相手: ' + FY.NAME[d.type] + ' 兵力' + d.str + (FY.AFF[su.type][d.type] > 1 ? '(相性◎)' : FY.AFF[su.type][d.type] < 1 ? '(相性✕)' : ''));
        else if (o > 0) why.push('守備隊 ' + FY.garStr(S, o).toFixed(1));
        pending = { k: 'move', unit: su.id, to: i };
        card('<b>' + FY.NAME[su.type] + '(兵力' + su.str + ')→ ' + esc(FY.place(S, i)) + '</b><br>見こみ: <span class="od ' + cls + '">' + lb + '</span>' + (o === -1 && !d ? '' : '(強さの比 ' + od.r.toFixed(2) + ')') +
          '<br><span style="color:var(--sub)">' + esc(why.join(' ・ ')) + '</span><br>取ると 前線 ' + F + ' → ' + F2 + '(守備隊 ' + FY.garrison(S, 0) + (F2 > FY.garrison(S, 0) ? '・守りが薄くなる' : '') + ')' +
          '<div class="row"><button data-act="cancelc">やめる</button><button class="ok" data-act="confirm">命令する</button></div>');
        mode = 'confirm'; placeCard(i); dirty = true;
        return;
      }
    }
    if (u && u.s === 0) {
      if (S.orders.some(function (x) { return x.unit === u.id; })) { toast('この軍団にはもう命令を出しています(命令を押すと取り消し)'); return; }
      sel = u.id; mode = 'unit'; SND.play('tap');
      var f2 = FY.factorOf(S, sm.d[u.at]);
      card('<b>' + (u.cmd ? FY.CMD_NAME[u.cmd] + 'の' : '') + FY.NAME[u.type] + '軍団</b> 兵力' + u.str + ' ・ 補給' + (f2 ? Math.round(f2 * 100) + '%' : 'なし(孤立)') + '<br><span style="color:var(--sub)">光るマスへ: 緑=移動 / 黄=取る / 赤=攻撃(優勢・互角・不利)</span>');
      placeCard(i); render(); return;
    }
    // マスの説明
    sel = null; mode = 'idle';
    var o2 = S.own[i], t = FY.TERR[S.terr[i]];
    if (!S.land[i]) { card(null); render(); return; }
    var info = esc(FY.place(S, i)) + ' ・ ' + (o2 === 0 ? '自国' : o2 > 0 ? FY.NATIONS[o2].name : 'どこの国でもない') + ' ・ 守り×' + FY.terrDef(S, i).toFixed(2);
    if (u) info += '<br>' + FY.NATIONS[u.s].name + 'の' + FY.NAME[u.type] + '軍団 兵力' + u.str;
    if (o2 === 0) info += '<br>補給 ' + (sm.d[i] === Infinity ? 'なし(孤立)' : Math.round(FY.factorOf(S, sm.d[i]) * 100) + '%');
    card(info + '<div class="row"><button data-act="cancelc">閉じる</button></div>');
    placeCard(i); render();
  }

  // ---- 進める(敵と同時に動く) ----
  function advance() {
    if (!S || S.done || anim) return;
    if (!S.trial && S.store <= 0) { toast('次の手番まで あと' + Math.ceil(FY.nextAccrue(S, Date.now()) / 60000) + '分'); return; }
    if (S.seasonStart) { seasonModal(); return; }
    var pos = {}; S.units.forEach(function (u) { pos[u.id] = [hx(u.at), hy(u.at)]; });
    var nOrders = S.orders.length, beforeHex = FY.hexes(S, 0), beforeSeason = FY.season(S);
    FY.advance(S);
    sel = null; mode = 'idle'; card(null);
    // 演出: 動いた軍団・塗り変わったマス・戦い
    var flip = {}, fx = [], lines = [];
    S.ev.forEach(function (e) {
      if (e.k === 'flip') flip[e.at] = { from: e.from };
      else if (e.k === 'fight') fx.push({ k: 'fight', x: hx(e.to), y: hy(e.to) });
      else if (e.k === 'die') fx.push({ k: 'die', x: pos[e.id] ? pos[e.id][0] : hx(e.at), y: pos[e.id] ? pos[e.id][1] : hy(e.at) });
      if (e.msg) lines.push(e);
    });
    anim = { t: 0, k: 0, pos: pos, flip: flip, fx: fx };
    SND.play('go');
    if (fx.some(function (f) { return f.k === 'fight'; })) setTimeout(function () { SND.play('boom', 1.2); }, 350);
    var gained = FY.hexes(S, 0) - beforeHex;
    if (gained > 0) setTimeout(function () { SND.play('capture'); }, 700); else if (gained < 0) setTimeout(function () { SND.play('lost'); }, 700);
    if (S.ev.some(function (e) { return e.k === 'pocket' || (e.k === 'die' && e.why === 'pocket'); })) setTimeout(function () { SND.play('kill'); }, 900);
    if (gained) lines.unshift({ msg: (gained > 0 ? 'マスを' + gained + 'つ取った' : 'マスを' + (-gained) + 'つ失った') + ' (自国 ' + FY.hexes(S, 0) + 'マス)', s: gained > 0 ? 0 : 1 });
    if (!nOrders) lines.unshift({ msg: '命令なしで1手番が過ぎた', s: 1 });
    feed(lines);
    save(); render();
    setTimeout(function () {
      anim = null; dirty = true;
      if (S.done) endModal();
      else if (S.seasonStart) { if (FY.season(S) !== beforeSeason) SND.play('rankS'); seasonModal(); }
    }, 1100);
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
      '<p>1手番に出せる<b>命令は3つ</b>。軍団をタップ → 光るマスをタップで移動・攻撃(赤いマスは「優勢・互角・不利」の見こみつき)。「補充」「建設」「作戦」も命令を1つ使います。そろったら<b>進める</b>。敵も同時に動きます。</p>' +
      '<p><b>補給</b>: 首都と補給基地から、自国のマスをたどった距離で補給が細ります(2マスまで100% → 6マス以上20%)。朱の線が太いほど十分。<b>鉄道</b>の上は距離が半分。つながっていない軍団は攻撃できず、毎手番 兵力-2。</p>' +
      '<p><b>包囲</b>: 退路のない軍団は、負けると全滅。つながりが切れて孤立したマスは3手番で相手のものに(そこにいる軍団ごと)。敵の根もとを切れば、戦わずに消せます。</p>' +
      '<p><b>前線と守備隊</b>: 敵ととなり合う自国のマスの数が「前線」。守備隊(6+町×2)より多いと、空いたマスの守りが薄くなります。</p>' +
      '<p><b>季節</b>(8手番で1つ): 春はぬかるみ(戦車が遅い・川を渡れない)、秋は物資1.5倍、<b>冬</b>は補給の届く距離が2マス縮み、攻める側は-25%、川が凍って渡れます。</p>' +
      '<p>季節のはじめに<b>敵のねらい</b>(確かさつき)と<b>作戦目標</b>が出ます。</p><button class="btn" data-act="closem">閉じる</button></div>';
    $('modalWrap').classList.remove('hidden');
  }

  // ---- ボタン ----
  var ACT = {
    menu: menu,
    objinfo: function () { toast(S.obj ? '作戦目標: ' + FY.OBJS[S.obj.k].name + '(季節の終わりに達成で物資+8)' : '季節のはじめに作戦目標を選びます'); },
    close: function () { $('sheetWrap').classList.add('hidden'); },
    closem: function () { $('modalWrap').classList.add('hidden'); if (S && S.seasonStart && !S.done) seasonModal(); },
    help: function () { $('sheetWrap').classList.add('hidden'); help(); },
    trial: function () { S.trial = !S.trial; if (!S.trial) { S.lastT = Date.now(); S.store = Math.max(S.store, 3); } save(); render(); menu(); },
    snd: function () { SND.set({ mute: !SND.cfg().mute }); menu(); },
    newask: function () { if (confirm('新しい大陸で始めますか?(いまの戦役は消えます)')) { $('sheetWrap').classList.add('hidden'); newCampaign(S ? S.trial : true); seasonModal(); } },
    'new': function () { $('modalWrap').classList.add('hidden'); newCampaign(S.trial); seasonModal(); },
    obj: function (el) { FY.chooseObjective(S, el.dataset.k); $('modalWrap').classList.add('hidden'); save(); render(); SND.bgm(FY.winter(S) ? 'menu' : 'menu'); },
    cancel: function (el) { FY.cancelOrder(S, +el.dataset.k); SND.play('close'); save(); render(); },
    cancelc: function () { pending = null; mode = 'idle'; sel = null; card(null); render(); },
    confirm: function () { if (pending) tryOrder(pending); pending = null; },
    advance: advance,
    'mode-re': function () {
      if (mode === 're') { mode = 'idle'; card(null); render(); return; }
      var us = FY.unitsOf(S, 0), canRaise = us.length < FY.K.maxCorps && !FY.unitAt(S, FY.CAPS[0]);
      $('sheet').innerHTML = '<h3>補充</h3><button class="opt" data-act="pick-re"><div><b>軍団の兵力を+' + FY.K.reAmt + '</b><small>補給が届いている軍団を選ぶ(兵力' + FY.K.maxStr + 'まで)</small></div><span class="c">物資' + FY.K.costRe + '</span></button>' +
        ['inf', 'at', 'tank', 'art'].map(function (t) { return '<button class="opt" data-act="raise" data-t="' + t + '"' + (canRaise ? '' : ' disabled') + '><div><b>新しい軍団: ' + FY.NAME[t] + '</b><small>' + (canRaise ? '首都に兵力' + FY.K.raiseStr + 'で現れる' : us.length >= FY.K.maxCorps ? '軍団は5つまで' : '首都が空いていない') + '</small></div><span class="c">物資' + FY.K.costRaise + '</span></button>'; }).join('');
      $('sheetWrap').classList.remove('hidden');
    },
    'pick-re': function () { $('sheetWrap').classList.add('hidden'); mode = 're'; sel = null; card('補充する軍団をタップ(光っている軍団)<div class="row"><button data-act="cancelc">やめる</button></div>'); render(); },
    raise: function (el) { $('sheetWrap').classList.add('hidden'); tryOrder({ k: 'raise', type: el.dataset.t, cost: FY.K.costRaise }); },
    'mode-build': function () {
      if (mode.indexOf('b:') === 0) { mode = 'idle'; card(null); render(); return; }
      $('sheet').innerHTML = '<h3>建設</h3>' +
        '<button class="opt" data-act="build" data-m="rail"><div><b>鉄道を1マス</b><small>鉄道の上は補給の距離が半分、軍団は3マス動ける。いまの鉄道のとなりに敷く</small></div><span class="c">物資' + FY.K.costRail + '</span></button>' +
        '<button class="opt" data-act="build" data-m="depot"><div><b>補給基地</b><small>' + FY.K.depotTurns + '手番で完成。そこから補給が届く(取られるとなくなる)</small></div><span class="c">物資' + FY.K.costDepot + '</span></button>' +
        '<button class="opt" data-act="build" data-m="fort"><div><b>陣地</b><small>そのマスの守りが1.3倍</small></div><span class="c">物資' + FY.K.costFort + '</span></button>';
      $('sheetWrap').classList.remove('hidden');
    },
    build: function (el) { $('sheetWrap').classList.add('hidden'); mode = 'b:' + el.dataset.m; sel = null; card('建設するマスをタップ(光っているマス)<div class="row"><button data-act="cancelc">やめる</button></div>'); render(); },
    'mode-op': function () {
      if (mode.indexOf('o:') === 0) { mode = 'idle'; card(null); render(); return; }
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
      mode = 'o:' + el.dataset.m; sel = null;
      if (!validTargets().length) { toast(el.dataset.m === 'lift' ? '孤立している軍団はいません' : '狙える敵がいません'); mode = 'idle'; render(); return; }
      card((el.dataset.m === 'air' ? '空爆する敵をタップ' : '空輸する軍団をタップ') + '<div class="row"><button data-act="cancelc">やめる</button></div>'); render();
    }
  };
  var QUIET = { confirm: 1, cancel: 1, advance: 1, snd: 1 };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var f = ACT[el.dataset.act];
    if (f) { e.preventDefault(); if (!QUIET[el.dataset.act]) SND.play('tap'); f(el); }
  });
  var down = null;
  cv.addEventListener('pointerdown', function (e) { var r = cv.getBoundingClientRect(); down = { x: e.clientX - r.left, y: e.clientY - r.top }; });
  cv.addEventListener('pointerup', function (e) {
    if (!down) return;
    var r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (Math.hypot(x - down.x, y - down.y) < 14) tapHex(hexAt(x, y));
    down = null;
  });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  window.addEventListener('resize', function () { resize(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S) { var a = FY.accrue(S, Date.now()); if (a) { toast('手番が' + a + 'つたまった'); save(); } render(); } });

  // ---- 毎こま ----
  var lastTs = 0;
  function frame(ts) {
    var dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0.016; lastTs = ts;
    if (anim) { anim.t += dt; anim.k = Math.min(1, anim.t / 0.9); dirty = true; }
    if (dirty && S) { dirty = false; draw(); }
    raf = requestAnimationFrame(frame);
  }

  // ---- 起動 ----
  resize();
  S = load();
  if (!S) { newCampaign(true); help(); }
  else { var a0 = FY.accrue(S, Date.now()); if (a0) toast('手番が' + a0 + 'つたまった'); }
  render();
  if (S.seasonStart && $('modalWrap').classList.contains('hidden')) seasonModal();
  else if (S.done) endModal();
  SND.bgm('menu');
  setInterval(function () { if (S && !S.trial) { if (FY.accrue(S, Date.now())) { save(); render(); } } }, 60000);
  raf = requestAnimationFrame(frame);
  window.__fuyu = { FY: FY, get S() { return S; }, snd: SND, advance: advance, tap: tapHex, render: render, hexXY: function (i) { return [hx(i), hy(i)]; },
    autoTurn: function (kind) { FY.playerAI(S, kind || 'smart'); render(); } };
