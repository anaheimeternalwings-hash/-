  // ====== 生成した絵(顔絵・部隊アイコン) ======
  // ビルド時に WebP を埋め込む。キーは h.<指揮官> / e.<敵将> / u.<兵種>.<年代>。無い絵は下の SVG の絵を使う
  // CSS の背景として一度だけ登録し、HTML には空の <svg class="pic a-…"> を置くだけにする(画面を作り直しても重くならない)
  var ART = (function () {
    var D = /*ART*/{ img: {}, meta: {} }/*ENDART*/;
    function cls(k) { return 'a-' + k.replace(/\./g, '-'); }
    var css = '', ZOOM = 1.75;
    Object.keys(D.img).forEach(function (k) {
      var face = k.charAt(0) === 'h' || k.charAt(0) === 'e';  // 顔絵は枠を埋め、部隊・兵器の絵は全体を収める
      css += 'svg.' + cls(k) + '{background:url(' + D.img[k] + ') center/' + (face ? 'cover' : 'contain') + ' no-repeat}';
      if (k.charAt(0) === 'b' && D.meta[k]) {
        // 枠(幅74%・高さ70%)に収めたときの絵の幅 dw(タイルの一辺を1として)。斜めから見た建物の足もとの奥行きは幅の約0.29倍
        var bw = D.meta[k][0], bh = D.meta[k][1], dw = Math.min(0.74 / bw, 0.70 / bh) * bw;
        css += '.grid.iso .tile svg.' + cls(k) + '{bottom:' + ((1 - 0.625 - 0.27 * dw) * 100).toFixed(1) + '%}';
      }
      if (face) {
        // 小さい枠では顔に寄せる(顔の位置 m を枠の中央に)
        var m = D.meta[k] || [0.5, 0.45];
        var pos = m.map(function (f) { return Math.max(0, Math.min(100, (0.5 - f * ZOOM) / (1 - ZOOM) * 100)).toFixed(1) + '%'; });
        css += '.portrait.sm svg.' + cls(k) + ',.portrait.xs svg.' + cls(k) + '{background-size:' + (ZOOM * 100) + '%;background-position:' + pos.join(' ') + '}';
      }
    });
    if (css) { var el = document.createElement('style'); el.textContent = css; document.head.appendChild(el); }
    function has(k) { return !!D.img[k]; }
    function svg(k, c) { return '<svg viewBox="0 0 64 64" class="pic ' + cls(k) + (c ? ' ' + c : '') + '"></svg>'; }
    return { has: has, svg: svg, url: function (k) { return D.img[k]; }, face: function (k) { return D.meta[k] || [0.5, 0.45]; } };
  })();
  // 兵器の開発段階 → 絵の年代(1: 大戦 / 2: 冷戦 / 3: 現代)
  function artEra(w) { w = Math.max(1, w || 1); return w <= 2 ? 1 : w <= 4 ? 2 : 3; }

  // ====== 絵(SVG) ======
  var UPATH = {
    inf: ['M12 2.6c-3.6 0-6.4 2.4-6.6 5.9H4v1.8h16V8.5h-1.4C18.4 5 15.6 2.6 12 2.6z', 'M8.3 11.3c0 2.4 1.7 4.4 3.7 4.4s3.7-2 3.7-4.4z', 'M4 21.6c.4-3.4 3.8-5.3 8-5.3s7.6 1.9 8 5.3z'],
    at: ['M1.6 10.2 19 5.6l.7 2.6L2.3 12.8z', 'M19.2 5.5l2.9-.7.5 1.9-2.7.9z', 'M6.5 8.6c.5-2.2 2.2-3.5 4.3-3.5s3.7 1.4 4.1 3.4z', 'M7.8 12.6a3.1 3.1 0 1 0 6.2 0 3.1 3.1 0 1 0-6.2 0z', 'M4.4 21.6c.4-3.1 3-4.9 6.5-4.9s6.1 1.8 6.5 4.9z'],
    tank: ['M3.2 15.4h17.6a2.7 2.7 0 0 1 0 5.4H3.2a2.7 2.7 0 0 1 0-5.4z', 'M3.4 12.2h17.2l1.3 2.6H2.1z', 'M6.8 8h7.6l2.2 3.8H5.4z', 'M14.6 9.1h7.9v1.7h-7.9z'],
    art: ['M6.8 13.4 20.9 4.6l1 1.6L8.2 15.6z', 'M3.8 10.8h7.4v5.4H3.8z', 'M4.6 17.6a3.9 3.9 0 1 0 7.8 0 3.9 3.9 0 1 0-7.8 0z', 'M10.6 17.1l11 3.4-.5 1.6-11.3-3z']
  };
  function unitSvg(t, color, cls) {
    var p = UPATH[t].map(function (d, i) {
      var c = color;
      if (t === 'tank' && i === 0) c = shade(color, -0.35);
      if (t === 'art' && i === 2) c = shade(color, -0.3);
      return '<path d="' + d + '" fill="' + c + '"/>';
    }).join('');
    var extra = t === 'art' ? '<circle cx="8.5" cy="17.6" r="1.4" fill="#000" opacity=".5"/>' : t === 'tank' ? '<g fill="#000" opacity=".45"><circle cx="5.5" cy="18.1" r="1.2"/><circle cx="9.7" cy="18.1" r="1.2"/><circle cx="13.9" cy="18.1" r="1.2"/><circle cx="18.1" cy="18.1" r="1.2"/></g>' : '';
    return '<svg viewBox="0 0 24 24" class="' + (cls || '') + '">' + p + extra + '</svg>';
  }
  function shade(hex, k) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function f(c) { return Math.max(0, Math.min(255, Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k))); }
    return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
  }
  var ALLY_C = '#8ee6cf', ENEMY_C = '#ff9a86';

  // ====== 兵器の絵(実在の兵器を横から見たシルエット) ======
  // 64×32 の座標で描く。小火器・弾薬は実物の色、車両・火砲は色(pal)を差し替えて兵種アイコンにも使う
  var ArmArt = (function () {
    var M = { st: '#4a5057', st2: '#6b737b', st3: '#9aa3ab', bk: '#23272b', bk2: '#3a3f44', wd: '#87552a', wd2: '#b07a3e',
      od: '#5b6436', od2: '#7a8648', od3: '#3f4626', tn: '#b49866', tn2: '#d6bf8e', gn: '#4d6a3a', gn2: '#6c8c52',
      br: '#c9a03a', br2: '#e8c766', gl: '#8fdcff', rd: '#b8432f', yl: '#e0c040', gy: '#7d8288', gy2: '#a7adb2', dg: '#53585d' };
    function r(x, y, w, h, f, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '"' + (rx ? ' rx="' + rx + '"' : '') + ' fill="' + f + '"/>'; }
    function p(d, f) { return '<path d="' + d + '" fill="' + f + '"/>'; }
    function c(x, y, rr, f) { return '<circle cx="' + x + '" cy="' + y + '" r="' + rr + '" fill="' + f + '"/>'; }
    function e(x, y, rx, ry, f) { return '<ellipse cx="' + x + '" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" fill="' + f + '"/>'; }
    function ln(d, s, w) { return '<path d="' + d + '" fill="none" stroke="' + s + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"/>'; }
    function g(tr, body) { return '<g transform="' + tr + '">' + body + '</g>'; }
    function pal(m) { return { m: m, d: shade(m, -0.32), l: shade(m, 0.22), x: shade(m, -0.6) }; }
    function shadow(y, w) { return e(32, y, w || 28, 2, 'rgba(0,0,0,.28)'); }
    function wheels(xs, y, rr, P) { return xs.map(function (x) { return c(x, y, rr, P.x) + c(x, y, rr * 0.62, P.d) + c(x, y, rr * 0.22, P.x); }).join(''); }
    function track(x0, x1, y0, y1, P) { return r(x0, y0, x1 - x0, y1 - y0, P.x, (y1 - y0) / 2); }

    // ---- 小火器 ----
    function rifle(o) {
      var f = o.furn, s = '';
      if (o.stock === 'long') s += p('M2 15.2 L9 13.2 L20 12.6 L' + o.wEnd + ' 12.6 L' + o.wEnd + ' 16.2 L22 16.4 L15 18.8 L4 21.2 Z', M.wd) + p('M2 15.2 L9 13.2 L20 12.6 L' + o.wEnd + ' 12.6 L' + o.wEnd + ' 13.6 L20 13.6 L9 14.2 Z', M.wd2);
      else if (o.stock === 'wood') s += p('M2 14.5 L18 12.6 L18 17.2 L12 18.6 L3 21 Z', M.wd) + p('M2 14.5 L18 12.6 L18 13.6 L3 15.6 Z', M.wd2);
      else if (o.stock === 'fixed') s += p('M2 13.2 L18 12.8 L18 16.8 L3 19.8 Z', f);
      else if (o.stock === 'tele') s += r(9, 13.4, 10, 2.2, M.bk) + p('M2 12.4 L11 12.4 L11 17.4 L5 19.6 L2 19.6 Z', f);
      else if (o.stock === 'skel') s += ln('M14 13 L3 13 L3 19 L14 16', M.bk2, 1.2);
      // 機関部
      s += r(17, 11.4, o.rcv || 14, 5, o.rcvC || M.st);
      if (o.bolt) s += ln('M23 15.4 L23 18.6', M.st2, 1.1) + c(23, 19, 1.1, M.st2);
      // 銃身
      s += r(30, 12.9, o.len - 30, 1.6, M.bk);
      if (o.gas) s += r(31, 11.2, o.gas - 31, 1.3, M.st2);
      if (o.hg) s += r(o.hg[0], 11.7, o.hg[1] - o.hg[0], 4.4, o.hgC || f, 1.1);
      if (o.rails) for (var i = o.hg[0] + 1; i < o.hg[1] - 1; i += 2.2) s += r(i, 11.2, 1.2, 0.8, M.bk2);
      if (o.band) s += r(o.band, 12.2, 1.4, 4, M.st2);
      if (o.fs) s += p('M' + (o.fs - 1) + ' 12.9 L' + o.fs + ' 9.6 L' + (o.fs + 1) + ' 12.9 Z', M.bk);
      s += r(o.len - 1.6, 12.5, 1.8, 2.4, M.bk2);
      // 握把・弾倉
      if (o.grip) s += p('M23.5 16.3 L27 16.3 L25.8 22.2 L22.4 22.2 Z', o.gripC || f);
      s += ln('M24.5 16.4 C24.5 19 28 19 28.5 16.4', M.bk2, 0.7);
      if (o.mag === 'curve') s += p('M27.6 16.3 L31.4 16.3 C31.8 19.6 33.2 22.6 35 24.6 L31.4 26.4 C29.6 23.8 28.2 20.4 27.6 16.3 Z', o.magC || M.st);
      else if (o.mag === 'straight') s += p('M27.4 16.3 L31.2 16.3 L30.8 24.4 L27.2 24.4 Z', o.magC || M.bk);
      else if (o.mag === 'slight') s += p('M27.4 16.3 L31.2 16.3 C31.3 19.6 31.8 22.4 32.6 24.6 L28.9 25.2 C28 22.6 27.6 19.6 27.4 16.3 Z', o.magC || M.bk);
      else if (o.mag === 'stg') s += p('M26.8 16.3 L30.6 16.3 C30.8 21 31.6 25.4 32.8 28.6 L29 29.4 C27.8 25.6 27.1 21 26.8 16.3 Z', M.st);
      if (o.handle) s += p('M18 11.4 L19.2 7.8 L28.6 7.8 L29.4 11.4 L27.6 11.4 L27.2 9.6 L20.6 9.6 L20 11.4 Z', f);
      if (o.optic) s += r(17, 10.4, 15, 1.1, M.bk) + r(19.6, 6.4, 9, 3.6, M.bk2, 1.2) + r(27.8, 6.9, 1.6, 2.6, M.gl);
      if (o.rsight) s += r(19, 9.8, 2.6, 1.8, M.st2);
      return s;
    }
    var SMALL = {
      // 歩兵の武器
      'inf.w.1': function () { return rifle({ stock: 'long', wEnd: 50, rcv: 13, len: 62, bolt: 1, band: 42, fs: 60, rsight: 1 }); },
      'inf.w.2': function () { return rifle({ stock: 'long', wEnd: 46, rcv: 14, len: 58, band: 38, fs: 56, rsight: 1, gas: 52 }); },
      'inf.w.3': function () { return rifle({ stock: 'wood', rcv: 20, rcvC: M.st, len: 54, hg: [36, 44], hgC: M.st2, grip: 1, gripC: M.wd, mag: 'stg', fs: 50 }); },
      'inf.w.4': function () { return rifle({ stock: 'wood', rcv: 15, len: 52, hg: [32, 41], hgC: M.wd, gas: 44, grip: 1, gripC: M.wd, mag: 'curve', fs: 49 }); },
      'inf.w.5': function () { return rifle({ stock: 'fixed', furn: M.bk2, rcv: 15, len: 55, hg: [32, 44], grip: 1, mag: 'slight', handle: 1, fs: 49 }); },
      'inf.w.6': function () { return rifle({ stock: 'tele', furn: M.bk2, rcv: 15, len: 52, hg: [32, 46], rails: 1, grip: 1, mag: 'slight', magC: M.tn, optic: 1 }); },
      'inf.w.7': function () { return rifle({ stock: 'tele', furn: '#4b5233', rcv: 15, len: 52, hg: [32, 46], hgC: '#4b5233', rails: 1, grip: 1, gripC: '#4b5233', mag: 'straight', optic: 1 }); },
      // 歩兵の特殊(対戦車)
      'inf.x.1': function () { return e(32, 17, 13, 8, M.tn) + e(32, 17, 9, 5, M.tn2) + [[20, 17], [44, 17], [32, 10], [32, 24]].map(function (q) { return r(q[0] - 3, q[1] - 2, 6, 4, M.bk2, 1); }).join('') + r(30, 4, 4, 5, M.st) + c(32, 4, 1.4, M.rd); },
      'inf.x.2': function () { return r(4, 12, 56, 5, M.od, 2.5) + r(2, 11.4, 4, 6.2, M.od3, 1) + r(14, 16.6, 9, 3.4, M.wd) + r(27, 16.6, 3, 6, M.od3) + r(36, 16.6, 3, 5, M.od3) + r(44, 9.4, 1.2, 3, M.st) + r(20, 9, 1.2, 3.2, M.st) + r(56, 11.6, 4, 5.8, M.od3, 1); },
      'inf.x.3': function () { return r(6, 14.6, 34, 2.6, M.od3) + p('M38 11 C45 9.6 52 11.4 55 16 C52 20.6 45 22.4 38 21 Z', M.od) + p('M38 11 C45 9.6 52 11.4 55 16 L38 16 Z', M.od2) + r(28, 10, 1.4, 4.8, M.od2) + r(26, 17.2, 2.4, 4, M.wd); },
      'inf.x.4': function () { return p('M6 13.6 L1.5 11.8 L1.5 18.2 L6 16.4 Z', M.st) + r(6, 13.6, 38, 2.8, M.st) + r(17, 12.8, 11, 4.4, M.wd, 1) + r(19, 16.8, 2.4, 5, M.wd) + r(30, 16.4, 2.4, 5, M.bk2) + r(22, 8.4, 6, 4, M.bk2, 1) + r(27.6, 9, 1.2, 2.6, M.gl) + p('M44 13 L50 10.6 L57 13 L63 15 L57 17 L50 19.4 L44 17 Z', M.od) + p('M44 13 L50 10.6 L57 13 L63 15 L44 15 Z', M.od2); },
      'inf.x.5': function () { return r(4, 11, 54, 8, '#56703f', 2) + r(4, 11, 54, 2.2, '#6d8a52', 1) + r(2, 10.4, 3, 9.2, M.bk2, 1) + r(57, 10.4, 3, 9.2, M.bk2, 1) + r(22, 8, 3, 3, M.bk2) + r(38, 8.6, 2, 2.4, M.bk2) + r(26, 19, 3, 5, M.bk2) + r(12, 19, 8, 2.4, M.bk2); },
      'inf.x.6': function () { return r(4, 13, 52, 7.4, '#717a55', 3) + r(4, 13, 52, 2, '#868f68', 1) + r(1.5, 12.4, 3.6, 8.6, M.bk2, 1.5) + r(54.6, 12.4, 3.6, 8.6, M.bk2, 1.5) + r(22, 4, 16, 9, '#5c6048', 1.5) + r(16, 6, 6, 4.4, M.bk) + r(38, 6.4, 3, 3.4, M.gl) + r(26, 2.4, 6, 1.8, M.bk2) + r(26, 13, 3, 3, M.bk2); },
      // 対戦車兵の武器
      'at.w.1': function () { return p('M2 14 L12 12.6 L12 17.6 L4 20 Z', M.wd) + r(12, 11.6, 14, 5, M.st) + r(19, 4.6, 5, 7, M.st2) + r(26, 12.7, 32, 2.2, M.bk) + r(57, 11.6, 5, 4.4, M.st2) + r(20, 16.6, 3, 4.6, M.wd) + ln('M44 15 L41 26 M44 15 L48 26', M.st2, 1.1); },
      'at.w.2': function () { return r(4, 13, 52, 5.6, M.od, 2.5) + r(30, 3.4, 12, 10, M.od2, 1) + r(33.5, 5.4, 4, 3, '#2b3b44') + r(16, 18.4, 3, 5.6, M.od3) + r(30, 18.4, 3, 4.4, M.od3) + r(2, 12.4, 4, 6.8, M.od3, 1.5) + r(54.6, 12.4, 3, 6.8, M.od3, 1); },
      'at.w.3': function () { return p('M8 10.6 L3 8.4 L3 17.6 L8 15.4 Z', M.od3) + r(8, 10.6, 52, 3.6, M.od, 1) + r(8, 9.6, 12, 5.6, M.od3, 1) + r(14, 6.8, 40, 1.4, M.st) + r(52, 6.2, 2, 2.6, M.st) + ln('M30 15 L22 28 M30 15 L30 28 M30 15 L40 28', M.st2, 1.3) + r(27, 14, 6, 3, M.st2); },
      'at.w.4': function () { return p('M6 11 L1 9 L1 20 L6 18 Z', M.bk2) + r(6, 11, 46, 7, '#3f4a3a', 2) + r(6, 11, 46, 1.8, '#56634f', 1) + r(22, 6.4, 7, 4.8, M.bk2, 1) + r(28.6, 7, 1.2, 3.2, M.gl) + r(18, 18, 3, 5.6, M.bk2) + r(34, 18, 3, 5, M.bk2) + r(10, 18, 6, 2.6, M.bk2); },
      'at.w.5': function () { return r(10, 8.6, 44, 6, M.od, 1.5) + r(52, 8, 3, 7.2, M.od3, 1) + r(8, 8, 3, 7.2, M.od3, 1) + r(22, 15, 11, 6, M.od3, 1) + r(32.6, 16, 1.4, 3, M.gl) + r(25, 21, 5, 2, M.st) + ln('M27.5 23 L16 29.5 M27.5 23 L27.5 29.5 M27.5 23 L39 29.5', M.st2, 1.3); },
      'at.w.6': function () { return r(10, 9.6, 46, 5, '#617241', 1.2) + r(54, 9, 3, 6.2, '#46532c', 1) + r(17, 14.8, 10, 6.4, '#46532c', 1) + r(26.6, 15.8, 1.4, 3, M.gl) + r(20, 21, 4, 2.4, M.st) + ln('M22 23.4 L12 29.5 M22 23.4 L22 29.5 M22 23.4 L32 29.5', M.st2, 1.2); },
      'at.w.7': function () { return r(2, 16, 26, 7, M.od, 1) + r(28, 12, 22, 11, M.od, 1.5) + r(44, 13.6, 5, 5, '#2b3b44') + r(4, 6, 22, 9, M.od2, 1) + [8, 13, 18].map(function (x) { return c(x + 1, 10.5, 2, M.bk2); }).join('') + wheels([12, 42], 25, 4.2, pal('#4a4d40')) + r(26, 13.6, 2.6, 3, M.od3); },
      // 対戦車兵の特殊(対人)
      'at.x.1': function () { return ln('M15 13 L4 12.6 L3 18.4 L15 16.4', M.bk2, 1.2) + r(14, 11.8, 20, 3.4, M.bk) + r(34, 12.6, 14, 1.6, M.bk) + r(46.4, 12, 2, 2.8, M.bk2) + p('M25 15.2 L28.6 15.2 L28.2 28 L25.2 28 Z', M.bk2) + p('M18.5 15.2 L21.6 15.2 L20.4 21 L17.4 21 Z', M.bk2); },
      'at.x.2': function () { return p('M2 14 L14 12 L14 18 L4 20.4 Z', M.st2) + r(14, 11.4, 20, 5.4, M.st) + r(34, 12.8, 20, 1.8, M.bk) + p('M54 12 L60 11.2 L60 15.4 L54 14.6 Z', M.st2) + p('M22 11.4 C23 7 25.6 3.6 29 2 L32 3.6 C29.4 5.6 27.8 8.4 27.4 11.4 Z', M.st2) + r(20, 16.8, 3, 5, M.wd) + ln('M50 14.6 L47 24 M50 14.6 L53 24', M.st, 1.1); },
      'at.x.3': function () { return r(12, 10.4, 16, 7, M.st) + r(28, 11, 26, 4.2, M.st2) + [31, 35, 39, 43, 47, 51].map(function (x) { return c(x, 13.1, 0.9, M.bk); }).join('') + r(54, 12.2, 8, 1.8, M.bk) + r(16, 17.4, 8, 6, M.od) + ln('M14 17.4 C10 20 10 23 13 25', M.br, 1.2) + ln('M26 17.4 L12 29.5 M26 17.4 L27 29.5 M26 17.4 L42 29.5', M.st2, 1.3); },
      'at.x.4': function () { return p('M2 13.2 L14 12.4 L14 17.2 L3 19.4 Z', M.bk2) + r(14, 11.4, 16, 5.4, M.st) + r(30, 12.6, 28, 2.2, M.bk) + r(32, 15, 14, 1.6, M.st2) + r(58, 12.2, 3, 3, M.bk2) + r(19, 8.6, 6, 2.8, M.st2) + ln('M18 16.8 C16 20 18 23 21 24', M.br, 1.2) + ln('M48 15 L45 24 M48 15 L51 24', M.st, 1.1); },
      'at.x.5': function () { return p('M2 13 L14 12.4 L14 17.2 L3 19.6 Z', M.bk2) + r(14, 11, 16, 5.6, M.bk2) + r(14, 10, 16, 1.2, M.bk) + r(30, 12.6, 26, 2, M.bk) + r(56, 12.2, 3, 2.8, M.bk2) + r(16, 16.6, 9, 7.4, '#5f6b3e', 1) + r(26, 16.6, 2.6, 5, M.bk2) + r(19, 6.6, 8, 3, M.bk2) + ln('M48 14.6 L45 24 M48 14.6 L51 24', M.st, 1.1); },
      'at.x.6': function () { return r(16, 8.6, 24, 10, '#4a5232', 1.2) + r(40, 10.6, 16, 5, M.bk) + [43, 47, 51].map(function (x) { return r(x, 11.4, 1.6, 3.4, M.st2); }).join('') + ln('M16 11 L10 9 M16 16 L10 18', M.st2, 1.4) + [4, 8, 12].map(function (x) { return c(x, 22, 1.8, M.br) + c(x, 22, 0.8, M.od3); }).join('') + ln('M28 18.6 L18 29.5 M28 18.6 L28 29.5 M28 18.6 L40 29.5', M.st2, 1.3); },
      // 戦車の特殊(対人)
      'tank.x.1': function () { return e(14, 15, 7, 7, M.dg) + e(14, 15, 4.6, 4.6, M.gy) + r(14, 12.4, 22, 5.2, M.st) + r(36, 12, 22, 6, M.dg, 1) + r(58, 13.6, 4, 2.8, M.bk); },
      'tank.x.2': function () { return r(10, 10, 18, 8, M.st) + r(4, 11, 6, 6, M.st2) + ln('M4 11 L2 9 M4 17 L2 19', M.st2, 1.4) + r(28, 10.8, 9, 5, M.st2) + [30, 32.6, 35].map(function (x) { return c(x, 13.3, 0.8, M.bk); }).join('') + r(37, 12.3, 24, 2.2, M.bk) + r(58, 11.8, 3, 3.2, M.bk2) + r(14, 18, 9, 6, M.od) + ln('M20 18 L12 29 M20 18 L30 29', M.st2, 1.2); },
      'tank.x.3': function () { return r(12, 11, 18, 6, M.st) + r(30, 12.6, 24, 2.2, M.bk) + r(32, 14.8, 12, 1.4, M.st2) + r(54, 12.2, 4, 3, M.bk2) + r(14, 17, 14, 4, M.od) + r(18, 21, 6, 6, M.od3) + ln('M10 14 L6 14', M.st2, 1.6); },
      'tank.x.4': function () { return r(4, 10, 28, 12, M.br) + r(4, 10, 28, 2.4, M.br2) + r(2, 9, 2.6, 14, M.br) + r(32, 10.4, 26, 11.2, '#5d6268') + r(32, 10.4, 26, 2, '#7a8087') + r(58, 10.4, 2.4, 11.2, '#3b3f44') + r(42, 10.4, 2, 11.2, M.bk) + [36, 40, 47, 51, 55].map(function (x) { return c(x, 16, 0.9, '#9aa0a6'); }).join(''); },
      'tank.x.5': function () { return r(4, 10, 26, 12, M.br) + r(4, 10, 26, 2.4, M.br2) + r(2, 9, 2.6, 14, M.br) + p('M30 10.6 L48 10.6 L56 14.6 L56 17.4 L48 21.4 L30 21.4 Z', M.bk2) + r(36, 10.6, 2, 10.8, M.yl) + ln('M56 16 L63 16', M.st2, 1.2); },
      'tank.x.6': function () { return r(8, 22, 40, 6, '#5d6b45', 1) + r(26, 14, 16, 8, '#4a5638', 1) + r(30, 12, 26, 2.4, M.bk) + r(52, 11.4, 3, 3.6, M.bk2) + r(12, 6, 13, 12, '#4a5638', 1.5) + c(18.5, 12, 3.4, M.bk) + c(18.5, 12, 2, M.gl) + r(34, 8, 8, 4, M.od3); },
      // 砲兵の特殊(対装甲の砲弾)
      'art.x.1': function () { return shell({ body: '#5a6342', band: M.yl, nose: 'ogive', base: 1 }) + [[22, 12], [28, 12], [34, 12], [25, 18], [31, 18]].map(function (q) { return c(q[0], q[1], 1.6, '#3e4630'); }).join(''); },
      'art.x.2': function () { return shell({ body: '#5f6747', band: M.yl, nose: 'seeker', fins: 1 }); },
      'art.x.3': function () { return shell({ body: '#58613f', band: M.yl, nose: 'ogive', len: 40 }) + ln('M52 6 C56 3 60 3 62 6', M.tn2, 1) + r(54, 7, 6, 4, M.dg, 1) + ln('M55 6 L57 2 L59 6', M.tn2, 0.6); },
      'art.x.4': function () { return shell({ body: '#636b52', band: M.yl, nose: 'ogive', len: 38 }) + r(48, 4.6, 10, 5, M.dg, 1.5) + ln('M48 7 L44 3 M58 7 L62 3', M.st2, 1) + r(48, 21.4, 10, 5, M.dg, 1.5) + ln('M48 24 L44 28 M58 24 L62 28', M.st2, 1); },
      'art.x.5': function () { return shell({ body: '#5b6450', band: M.yl, nose: 'ogive', len: 40 }) + ln('M54 13 L58 6 L62 13', M.tn2, 0.7) + p('M53 6 C55 2 61 2 63 6 Z', M.tn) + r(55.5, 13, 5, 6, M.dg, 1); },
      'art.x.6': function () { return shell({ body: '#5c6744', band: M.yl, nose: 'excal', fins: 1, canard: 1, len: 52 }); }
    };
    function shell(o) {
      var L = o.len || 46, x0 = 4, x1 = x0 + L, s = '';
      s += r(x0, 10, L - 12, 12, o.body, 1) + r(x0, 10, L - 12, 2.4, shade(o.body, 0.18));
      s += r(x0 + 6, 9.4, 3, 13.2, M.br) + r(x0 + 2, 9.6, 2, 12.8, shade(o.body, -0.2));
      if (o.band) s += r(x1 - 22, 10, 2.4, 12, o.band);
      if (o.nose === 'ogive') s += p('M' + (x1 - 12) + ' 10 C' + (x1 - 4) + ' 10.6 ' + x1 + ' 14 ' + (x1 + 2) + ' 16 C' + x1 + ' 18 ' + (x1 - 4) + ' 21.4 ' + (x1 - 12) + ' 22 Z', o.body) + r(x1, 15, 3, 2, M.br);
      if (o.nose === 'seeker') s += p('M' + (x1 - 12) + ' 10 C' + (x1 - 4) + ' 10.6 ' + x1 + ' 13 ' + x1 + ' 16 C' + x1 + ' 19 ' + (x1 - 4) + ' 21.4 ' + (x1 - 12) + ' 22 Z', o.body) + c(x1 - 1, 16, 3, M.gl) + c(x1 - 1.6, 15, 1, '#fff');
      if (o.nose === 'excal') s += p('M' + (x1 - 12) + ' 10.6 C' + (x1 - 2) + ' 11 ' + (x1 + 4) + ' 14 ' + (x1 + 6) + ' 16 C' + (x1 + 4) + ' 18 ' + (x1 - 2) + ' 21 ' + (x1 - 12) + ' 21.4 Z', o.body);
      if (o.fins) s += p('M' + x0 + ' 10 L' + (x0 - 2) + ' 5 L' + (x0 + 6) + ' 10 Z', M.dg) + p('M' + x0 + ' 22 L' + (x0 - 2) + ' 27 L' + (x0 + 6) + ' 22 Z', M.dg);
      if (o.canard) s += p('M' + (x1 - 8) + ' 11 L' + (x1 - 6) + ' 6 L' + (x1 - 3) + ' 12 Z', M.dg) + p('M' + (x1 - 8) + ' 21 L' + (x1 - 6) + ' 26 L' + (x1 - 3) + ' 20 Z', M.dg);
      return s;
    }

    // ---- 戦車(兵種アイコン・戦車の武器) ----
    var TANKS = [
      { pm: '#5b6436', hull: 'M6 22 L6 14.6 L14 12.6 L44 12.6 L53 17 L55 22 Z', tur: 'M21 12.8 C21 7.8 25 5.6 31.4 5.6 C37.6 5.6 41.4 7.8 41.8 12.8 Z', gun: [41.6, 8.4, 12.6, 2.2], wh: 'bogie', cup: 4 },
      { pm: '#b39b5e', hull: 'M5 22 L5 13.8 L51 13.8 L55.6 16.6 L55.6 22 Z', tur: 'M17 13.8 L18 7.6 L42 7.6 L44.6 9.6 L44.6 13.8 Z', gun: [44.4, 9.4, 17.6, 2.2], brake: 1, wh: 'tiger', cup: 5.8 },
      { pm: '#5a6139', hull: 'M4 22 L5 16 L50 16 L58 19 L58 22 Z', tur: 'M18 16 C18.6 11.2 23 9 31 9 L41 9.6 C44.4 10.6 46 12.8 46 16 Z', gun: [45.6, 10.6, 17.6, 1.9], evac: 52, wh: 'road', cup: 7.4 },
      { pm: '#4b5a3a', hull: 'M4 22 L5 16 L52 16 L59 19 L59 22 Z', tur: 'M15.6 16 L17.6 10 L44 10 L48.4 12 L48.4 16 Z', gun: [48.2, 11.6, 15.2, 2], evac: 54, wh: 'road', skirt: 1, cup: 8.2 },
      { pm: '#4f5d3c', hull: 'M4 22 L5 16 L52 16 L59 19 L59 22 Z', tur: 'M15.6 16 L17.6 10 L40 10 L50.6 13.6 L46 16 Z', gun: [48, 12, 16.4, 1.9], evac: 56.2, wh: 'road', skirt: 1, cup: 8.2 },
      { pm: '#66705d', hull: 'M4 22 L5 16 L52 16 L60 19 L60 22 Z', tur: 'M14 16 L17 10.6 L42 10.4 L52.6 13.6 L50 16 Z', gun: [50.4, 11.7, 13.6, 2.7], evac: 57, wh: 'road', skirt: 1, rws: 1, cup: 8.6 }
    ];
    function tankArt(i, P) {
      var T = TANKS[Math.max(0, Math.min(TANKS.length - 1, i))], s = shadow(29.4, 29);
      s += track(4, 58, 21.4, 29, P);
      if (T.wh === 'bogie') s += [12, 18.4, 27, 33.4, 42, 48.4].map(function (x) { return c(x, 25.6, 2.8, P.d) + c(x, 25.6, 1, P.x); }).join('') + [15.2, 30.2, 45.2].map(function (x) { return r(x - 3.6, 22.4, 7.2, 2.4, P.x); }).join('');
      else if (T.wh === 'tiger') s += [9, 14, 19, 24, 29, 34, 39, 44, 49].map(function (x, k) { return c(x, k % 2 ? 25.2 : 25.8, 2.9, k % 2 ? P.m : P.d) + c(x, k % 2 ? 25.2 : 25.8, 0.9, P.x); }).join('');
      else s += wheels([10, 17, 24, 31, 38, 45, 52], 25.6, 2.5, P);
      s += p(T.hull, P.m) + p(T.hull.replace(/L(\d+(\.\d+)?) 22 Z$/, 'L$1 17 Z'), P.l);
      if (T.skirt) s += r(6, 16.8, 47, 5.4, P.d) + [16, 26, 36, 46].map(function (x) { return r(x, 16.8, 0.6, 5.4, P.x); }).join('');
      s += p(T.tur, P.m) + r(T.gun[0] - 1.2, T.gun[1] - 1.1, 3, T.gun[3] + 2.2, P.d);
      s += r(T.gun[0], T.gun[1], T.gun[2], T.gun[3], P.d);
      if (T.brake) s += r(T.gun[0] + T.gun[2] - 2.4, T.gun[1] - 0.8, 3, T.gun[3] + 1.6, P.x);
      if (T.evac) s += r(T.evac, T.gun[1] - 0.5, 3, T.gun[3] + 1, P.x);
      s += r(T.rws ? 33 : 27, T.cup, 6, 2.4, P.d, 0.8);
      if (T.rws) s += r(22, 6.4, 6, 3.6, P.x, 0.8) + r(28, 7.4, 6, 1, P.x) + r(24, 10, 2, 1, P.x);
      return s;
    }
    // ---- 戦車の防護(装甲の種類) ----
    var TARMOR = {
      1: function () { return p('M8 12 L44 8 L58 14 L22 18 Z', '#9aa1a8') + p('M8 12 L22 18 L22 26 L8 20 Z', '#6b737b') + p('M22 18 L58 14 L58 22 L22 26 Z', '#7f878f') + ln('M26 20 L54 16.6 M26 22.6 L54 19.2', '#5a6168', 0.6) + ln('M30 11.6 L46 10.2 M24 13.4 L50 11.2', '#bfc6cc', 0.6); },
      2: function () { var P = pal('#56603a'); return track(4, 56, 22, 29, P) + wheels([11, 19, 27, 35, 43, 50], 25.6, 2.8, P) + p('M5 22 L5 15 L14 12 L40 12 L56 19 L56 22 Z', P.m) + p('M40 12 L56 19 L52 19 L38 13.6 Z', '#e0c040') + p('M18 12 L20 6.6 L36 6.6 L40 12 Z', P.d) + r(39, 8.4, 14, 1.8, P.x) + ln('M44 22 A7 7 0 0 0 49.6 15.6', '#fff', 0.7); },
      3: function () { var P = pal('#7d7350'); return track(4, 56, 22, 29, P) + wheels([10, 17, 24, 31, 38, 45, 51], 25.6, 2.4, P) + p('M5 22 L5 14 L50 14 L55 17 L55 22 Z', P.m) + p('M18 14 L19 8 L40 8 L42 14 Z', P.m) + r(42, 9.6, 14, 1.8, P.x) + r(6, 15.4, 46, 7.4, P.l) + [17.5, 29, 40.5].map(function (x) { return r(x, 15.4, 0.6, 7.4, P.d); }).join('') + r(16, 7.4, 28, 6.6, P.l) + [26, 35].map(function (x) { return r(x, 7.4, 0.6, 6.6, P.d); }).join(''); },
      4: function () { var s = ''; s += r(6, 6, 52, 4, '#7f878f') + r(6, 22, 52, 4, '#7f878f'); for (var x = 7; x < 57; x += 6.2) s += p('M' + x + ' 11 L' + (x + 3) + ' 10 L' + (x + 6) + ' 11 L' + (x + 6) + ' 16 L' + (x + 3) + ' 17 L' + x + ' 16 Z', '#d9d3c2') + p('M' + x + ' 16 L' + (x + 3) + ' 17 L' + (x + 6) + ' 16 L' + (x + 6) + ' 21 L' + (x + 3) + ' 22 L' + x + ' 21 Z', '#c3bba5'); return s + r(6, 10, 52, 0.8, '#5a6168') + r(6, 21.2, 52, 0.8, '#5a6168'); },
      5: function () { var P = pal('#5b6644'), s = track(4, 58, 22, 29, P) + wheels([10, 17, 24, 31, 38, 45, 52], 25.6, 2.5, P) + p('M4 22 L5 16 L52 16 L59 19 L59 22 Z', P.m) + p('M14 16 C15 10.6 21 8.6 30 8.6 C38 8.6 44 10.6 45 16 Z', P.m) + r(44, 11.6, 18, 2, P.x); for (var i = 0; i < 6; i++) s += r(30 + i * 2.6, 9.6 + i * 0.5, 2.3, 2.4, '#6f7b55') + r(30 + i * 2.6, 12.4 + i * 0.2, 2.3, 2.4, '#6f7b55'); for (i = 0; i < 7; i++) s += r(44 + i * 2.2, 16.4 + i * 0.4, 2, 2.2, '#6f7b55'); return s; },
      6: function () { var P = pal('#7b7a63'); return track(4, 58, 22, 29, P) + wheels([10, 17, 24, 31, 38, 45, 52], 25.6, 2.5, P) + p('M4 22 L5 16 L52 16 L59 19 L59 22 Z', P.m) + p('M14 16 L17 9.6 L44 9.6 L50 13 L48 16 Z', P.m) + r(48, 11.4, 15, 2.1, P.x) + r(20, 10.6, 8, 4.4, '#3b4046', 0.6) + r(21, 11.4, 6, 2.8, '#59626b') + c(36, 9.4, 2.2, P.x) + ln('M8 6 A14 14 0 0 1 32 2', '#8fdcff', 0.8) + ln('M12 8 A10 10 0 0 1 28 4.6', '#8fdcff', 0.8); }
    };

    // ---- 装甲車(対戦車兵の防護) ----
    function apc(i, P) {
      var s = shadow(29.4, 28);
      if (i === 1) return s + track(26, 58, 21, 29, P) + wheels([31, 38, 45, 52], 25.4, 2.6, P) + wheels([12], 25, 4.2, P) + p('M4 22 L4 15 L10 13 L22 13 L24 11 L58 11 L58 22 Z', P.m) + r(24, 11, 34, 2, P.l) + p('M10 13 L12 7.6 L20 7.6 L22 13 Z', P.d) + r(13, 8.6, 6, 3.2, '#2b3b44') + r(40, 7, 1.6, 4, P.x) + r(40, 6.6, 9, 1.6, P.x);
      if (i === 2) return s + track(5, 57, 21, 29, P) + wheels([11, 20, 29, 38, 47], 25.4, 3, P) + p('M5 22 L5 9 L44 9 L56 16 L56 22 Z', P.m) + p('M5 9 L44 9 L56 16 L52 16 L42 10.6 L5 10.6 Z', P.l) + r(34, 5.6, 6, 3.4, P.d) + r(40, 6.6, 9, 1.2, P.x);
      if (i === 3) return s + track(5, 57, 21, 29, P) + wheels([11, 20, 29, 38, 47], 25.4, 3, P) + p('M5 22 L5 11 L46 11 L56 17 L56 22 Z', P.m) + r(5, 11, 41, 1.8, P.l) + c(38, 9.4, 3, P.d) + r(40, 8.4, 10, 1.2, P.x) + r(16, 8.6, 6, 2.4, P.d);
      if (i === 4 || i === 5 || i === 6) {
        var top = i === 6 ? 'M4 21.6 L4 12 L40 11 L56 15 L60 21.6 Z' : i === 5 ? 'M4 21.6 L4 11 L44 11 L58 16 L58 21.6 Z' : 'M4 21.6 L4 10.4 L48 10.4 L57 15 L57 21.6 Z';
        s += p(top, P.m) + r(4, 11.2, 40, 1.6, P.l) + wheels([12, 21, 36, 45], 24.6, 4, P);
        if (i === 4) s += r(30, 6.6, 8, 4, P.d) + r(38, 7.4, 8, 2, P.x);
        if (i === 5) s += r(22, 7, 8, 4, P.d) + r(30, 8, 8, 1.4, P.x) + r(6, 13, 30, 0.6, P.d) + r(6, 16, 30, 0.6, P.d);
        if (i === 6) s += r(20, 7.6, 12, 3.6, P.d, 1) + r(32, 8.6, 12, 1.6, P.x);
        return s;
      }
      return s;
    }
    // ---- 自走砲(砲兵の防護) ----
    function spg(i, P) {
      var s = shadow(29.4, 29);
      if (i === 6) return s + p('M4 22 L4 11 L18 11 L18 14 L58 14 L58 22 Z', P.m) + p('M40 14 L44 8 L54 8 L56 14 Z', P.d) + r(43, 9, 10, 3, '#2b3b44') + wheels([12, 21, 30, 46], 24.6, 4, P) + r(8, 7, 14, 6, P.d) + r(20, 6.4, 30, 2.2, P.x) + r(48, 5.6, 4, 3.8, P.x);
      s += track(4, 58, 21.4, 29, P) + wheels(i === 1 ? [11, 17.4, 26, 32.4, 41, 47.4] : [10, 17, 24, 31, 38, 45, 52], 25.6, 2.6, P);
      if (i === 1) return s + p('M5 22 L5 13 L14 11 L44 11 L54 17 L56 22 Z', P.m) + r(30, 6, 9, 5, P.d) + c(34.5, 6, 3, P.x) + c(34.5, 6, 2, P.d) + r(40, 10, 16, 2.4, P.x);
      var tu = i === 2 ? 'M20 16 L20 7.4 L42 7.4 L44 10 L44 16 Z' : i === 3 ? 'M16 16 L16 8 L40 8 L44 11 L44 16 Z' : i === 4 ? 'M14 16 L15 6.6 L42 6.6 L46 9.6 L46 16 Z' : 'M12 16 L13 5.6 L44 5.6 L48 9 L48 16 Z';
      var gl = i === 2 ? 14 : i === 3 ? 14 : i === 4 ? 16 : 16;
      s += p('M4 22 L5 16 L52 16 L59 19 L59 22 Z', P.m) + p(tu, P.m) + r(tu.indexOf('48 9') > 0 ? 48 : 44, 9.6, gl, 2.2, P.x) + r(4, 16, 48, 1.4, P.l);
      if (i === 5) s += r(59.6, 9, 3.2, 3.2, P.x);
      return s;
    }
    // ---- 火砲(砲兵の武器・兵種アイコン) ----
    function artGun(i, P) {
      var s = shadow(29.4, 27);
      if (i >= 6) {
        if (i === 6) return s + track(4, 56, 21.4, 29, P) + wheels([10, 17, 24, 31, 38, 45, 51], 25.6, 2.5, P) + p('M4 22 L4 16 L46 16 L56 19 L56 22 Z', P.m) + p('M40 16 L44 10 L54 10 L56 16 Z', P.d) + g('rotate(-14 30 16)', r(6, 6, 32, 10, P.l, 1) + r(6, 6, 32, 2, P.m) + [10, 15, 20, 25, 30, 35].map(function (x) { return c(x, 11, 1.6, P.x); }).join(''));
        return s + p('M30 22 L30 13 L46 13 L46 10 L56 10 L60 16 L60 22 Z', P.m) + r(48, 11, 8, 4, '#2b3b44') + wheels([16, 36, 52], 24.6, 4, P) + p('M4 22 L4 16 L30 16 L30 22 Z', P.d) + g('rotate(-16 18 16)', r(4, 6, 26, 10, P.l, 1) + r(4, 6, 26, 2, P.m) + [8, 13, 18, 23].map(function (x) { return c(x, 11, 1.8, P.x); }).join(''));
      }
      var len = [0, 26, 32, 38, 40, 42][i], ang = [0, -14, -12, -12, -10, -10][i], wr = [0, 5, 6, 6.2, 4.6, 3.6][i], wx = 28;
      s += ln('M28 19 L4 27.4', P.x, i === 5 ? 1.6 : 2.4);
      if (i === 4 || i === 5) s += ln('M28 19 L8 25.6', P.d, 1.6);
      s += g('rotate(' + ang + ' 28 16)', r(22, 13.6, len, 3.6, P.d) + r(18, 12.8, 12, 5.6, P.m, 1) + (i >= 4 ? r(22 + len - 3, 12.8, 4, 5.2, P.x) : '') + (i === 3 ? r(22 + len - 2, 13.2, 2.6, 4.4, P.x) : ''));
      if (i === 1 || i === 3) s += r(30, 6.6, 3, 12, P.l) ;
      if (i === 2) s += r(30, 9, 2.4, 9, P.l);
      if (i === 5) s += ln('M16 21 L40 21 M20 21 L28 15 L36 21', P.l, 1.2);
      s += c(wx, 24.6 - (wr - 4.6), wr, P.x) + c(wx, 24.6 - (wr - 4.6), wr * 0.55, P.d) + c(wx, 24.6 - (wr - 4.6), wr * 0.18, P.x);
      if (i === 4) s += r(6, 16, 8, 6, P.d) + c(10, 24, 2.4, P.x);
      return s;
    }
    // ---- 兵士(兵種アイコン) ----
    function soldier(P, aTier, kneel) {
      var s = '', head = '#e8c4a0', helmet = aTier >= 3 ? P.d : P.d;
      if (kneel) {
        s += p('M20 46 L22 36 L34 36 L36 40 L44 40 L44 46 L38 46 L36 44 L30 44 L28 46 Z', P.d) + p('M20 37 L21 22 C21 19 23 18 27 18 L33 18 C37 18 38.6 20 38.6 23 L38.6 37 Z', P.m);
      } else {
        s += p('M18 60 L20 40 L26 40 L27 60 Z M37 60 L36 40 L42 40 L44 60 Z', P.d) + p('M17 42 L17 24 C17 21 19.6 19 23 19 L39 19 C42.4 19 45 21 45 24 L45 42 Z', P.m);
      }
      var hx = kneel ? 30 : 31, hy = kneel ? 13 : 14;
      if (aTier >= 2 && !kneel) s += r(19.6, 22, 22.8, 17, P.x, 3) + (aTier >= 4 ? [23, 28, 33].map(function (x) { return r(x, 30, 4, 6, P.d, 1); }).join('') : r(21, 26, 20, 1.2, P.d) + r(21, 31, 20, 1.2, P.d));
      s += c(hx, hy + 1, 5.6, head);
      if (aTier <= 2) s += p('M' + (hx - 8) + ' ' + (hy - 0.4) + ' C' + (hx - 7) + ' ' + (hy - 9) + ' ' + (hx + 7) + ' ' + (hy - 9) + ' ' + (hx + 8) + ' ' + (hy - 0.4) + ' L' + (hx + 9) + ' ' + (hy + 0.6) + ' L' + (hx - 9) + ' ' + (hy + 0.6) + ' Z', helmet);
      else s += p('M' + (hx - 7) + ' ' + (hy + 3) + ' L' + (hx - 7.4) + ' ' + (hy - 1) + ' C' + (hx - 6.4) + ' ' + (hy - 8.6) + ' ' + (hx + 6.4) + ' ' + (hy - 8.6) + ' ' + (hx + 7.4) + ' ' + (hy - 1) + ' L' + (hx + 6.6) + ' ' + (hy + 0.6) + ' Z', helmet);
      if (aTier >= 5) s += r(hx - 1.6, hy - 8.4, 3.2, 2.6, P.x) + r(hx + 2, hy - 5.6, 5.4, 2.4, '#2b3b44', 1);
      return s;
    }

    var DRAW = {
      inf: { w: function (n) { return SMALL['inf.w.' + n](); }, a: function (n) { return infArmor(n); }, x: function (n) { return SMALL['inf.x.' + n](); } },
      at: { w: function (n) { return SMALL['at.w.' + n](); }, a: function (n) { return apc(n, pal(['#6b6f45', '#7a8058', '#5f6b3e', '#55613a', '#5c6148', '#5d6a48'][n - 1])); }, x: function (n) { return SMALL['at.x.' + n](); } },
      tank: { w: function (n) { return tankArt(n - 1, pal(TANKS[n - 1].pm)); }, a: function (n) { return TARMOR[n](); }, x: function (n) { return SMALL['tank.x.' + n](); } },
      art: { w: function (n) { return artGun(n, pal(['#5b6436', '#7d7350', '#59603a', '#56603d', '#7d7a5a', '#5a6339', '#5f6a46'][n - 1])); }, a: function (n) { return spg(n, pal(['#5b6436', '#5a6139', '#55603a', '#4f5d3c', '#5c6448', '#5b6847'][n - 1])); }, x: function (n) { return SMALL['art.x.' + n](); } }
    };
    function infArmor(n) {
      if (n === 1) return e(32, 26, 18, 2.4, 'rgba(0,0,0,.25)') + p('M12 22 C12 8 22 4 32 4 C42 4 52 8 52 22 L56 23 L56 25 L8 25 L8 23 Z', '#5b6436') + p('M18 12 C22 7 28 6 32 6 C36 6 40 7 44 10 C40 8.6 36 8 32 8 C26 8 21 9.4 18 12 Z', '#7a8648') + ln('M16 25 C18 30 24 30 26 25', '#3f4626', 1.2);
      var col = ['', '', '#5f6a3b', '#4f6a3e', '#6b6f4e', '#b19e74', '#566a44'][n], col2 = shade(col, -0.25);
      var s = p('M14 4 L24 4 C25 8 28 10 32 10 C36 10 39 8 40 4 L50 4 L52 12 L52 30 L12 30 L12 12 Z', col);
      if (n === 2) for (var y = 13; y < 30; y += 3.4) s += r(13, y, 38, 1.2, col2);
      if (n === 3) s += [[18, 15, '#3b4a2a'], [30, 22, '#6e5a3a'], [42, 14, '#2e3a22'], [22, 25, '#2e3a22'], [44, 25, '#6e5a3a']].map(function (q) { return e(q[0], q[1], 5, 3, q[2]); }).join('') + p('M14 4 L24 4 C25 8 28 10 32 10 C36 10 39 8 40 4 L50 4 L50 8 C44 8 40 12 32 12 C24 12 20 8 14 8 Z', col2);
      if (n >= 4) { for (var yy = 14; yy < 29; yy += 3) s += r(16, yy, 32, 1, col2); s += r(22, 16, 7, 9, col2, 1) + r(35, 16, 7, 9, col2, 1); }
      if (n === 5) s += r(12, 14, 4, 14, col2) + r(48, 14, 4, 14, col2) + ln('M18 30 L18 33', '#c03030', 1.4);
      if (n === 6) s += [[18, 20, '#3e4f2d'], [40, 24, '#6b5638'], [30, 13, '#2e3a22']].map(function (q) { return e(q[0], q[1], 4, 2.6, q[2]); }).join('');
      return s;
    }
    function wide(body, vb) { return '<svg viewBox="' + (vb || '0 0 64 32') + '" class="aart">' + body + '</svg>'; }
    // 武装のアイコン(実物の色)。tier 0 は未開発(最初の新型を薄く表示)
    function icon(t, k, tier) {
      var list = TF.ARMS[t][k], n = Math.max(1, Math.min(list.length, tier || 1));
      if (ART.has('a.' + t + '.' + k + '.' + n)) return ART.svg('a.' + t + '.' + k + '.' + n, 'aart');
      if (t === 'inf' && k === 'a') return wide(DRAW[t][k](n), '0 0 64 34');
      return wide(DRAW[t][k](n));
    }
    // 兵種アイコン(チームの色)。開発した武器・防護で見た目が変わる
    function unit(t, color, w, a, cls) {
      var ak = 'u.' + t + '.' + artEra(w);
      if (ART.has(ak)) return ART.svg(ak, (cls || '') + (color === ENEMY_C ? ' en' : ' al'));
      var P = pal(color), s, vb = '0 0 64 64';
      w = Math.max(1, w || 1); a = a || 0;
      if (t === 'tank') { s = tankArt(Math.min(TANKS.length, w) - 1, P); vb = '0 -14 64 52'; }
      else if (t === 'art') { s = artGun(Math.min(7, w), P); vb = '0 -14 64 52'; }
      else if (t === 'inf') {
        s = soldier(P, Math.max(1, a), false) + g('translate(-2 18) rotate(-30 32 16)', SMALL['inf.w.' + Math.min(7, w)]());
      } else {
        var ww = Math.min(7, w);
        if (ww === 7) { s = SMALL['at.w.7'](); vb = '0 -14 64 52'; }
        else if (ww === 3 || ww >= 5) s = soldier(P, Math.max(1, a > 0 ? 3 : 1), true) + g('translate(6 26) scale(.9)', SMALL['at.w.' + ww]());
        else s = soldier(P, Math.max(1, a > 0 ? 3 : 1), true) + g('translate(-2 8) rotate(-12 32 16) scale(1)', SMALL['at.w.' + ww]());
      }
      return '<svg viewBox="' + vb + '" class="' + (cls || '') + '">' + s + '</svg>';
    }
    return { icon: icon, unit: unit, pal: pal };
  })();

  // 兵種アイコン: 味方は開発した武装で、敵はステージの年代で見た目が変わる
  function armTierOf(t, k) { return TF.armTier(TF.armLv(st, t, k)); }
  function offSvg(t, cls) { var k = 'u.' + t + '.1'; return ART.has(k) ? ART.svg(k, (cls || '') + ' off') : unitSvg(t, '#6b7466', cls); }
  function allySvg(t, cls) { return ArmArt.unit(t, ALLY_C, armTierOf(t, 'w'), armTierOf(t, 'a'), cls); }
  function eraTier(s) { return 1 + Math.floor(Math.max(0, s - 1) / 25); }
  function enemySvg(t, s, cls) { var n = eraTier(s); return ArmArt.unit(t, ENEMY_C, n, n, cls); }

  // ====== 施設の絵: 暗いコンクリートの基礎に建つ、立体的なミニチュア(等角図) ======
  var BART = (function () {
    function P(x, y, z) { return [32 + (x - y) * 0.87, 41 + (x + y) * 0.5 - z]; }
    function f1(v) { return Math.round(v * 10) / 10; }
    function poly(pts, fill, ex) { return '<path d="M' + pts.map(function (p) { return f1(p[0]) + ' ' + f1(p[1]); }).join('L') + 'Z" fill="' + fill + '"' + (ex || '') + '/>'; }
    function box(x, y, z, w, d, h, c) {
      var A = P(x, y, z + h), B = P(x + w, y, z + h), C = P(x + w, y + d, z + h), D = P(x, y + d, z + h), B0 = P(x + w, y, z), C0 = P(x + w, y + d, z), D0 = P(x, y + d, z);
      return poly([D, C, C0, D0], c[1]) + poly([C, B, B0, C0], c[2]) + poly([A, B, C, D], c[0]);
    }
    // 切妻屋根(棟は y 方向)
    function gable(x, y, z, w, d, rh, c) {
      var m = x + w / 2;
      return poly([P(x, y, z), P(m, y, z + rh), P(m, y + d, z + rh), P(x, y + d, z)], c[0]) + poly([P(m, y, z + rh), P(x + w, y, z), P(x + w, y + d, z), P(m, y + d, z + rh)], c[2]) +
        poly([P(x, y + d, z), P(m, y + d, z + rh), P(x + w, y + d, z)], c[1]);
    }
    // 左の面(y = 一定)・右の面(x = 一定)に貼る四角
    function onL(yy, a, b, z0, z1, f, ex) { return poly([P(a, yy, z1), P(b, yy, z1), P(b, yy, z0), P(a, yy, z0)], f, ex); }
    function onR(xx, a, b, z0, z1, f, ex) { return poly([P(xx, a, z1), P(xx, b, z1), P(xx, b, z0), P(xx, a, z0)], f, ex); }
    function onTop(x, y, z, w, d, f, ex) { return poly([P(x, y, z), P(x + w, y, z), P(x + w, y + d, z), P(x, y + d, z)], f, ex); }
    function glow(cx, cy, r, col, op) { return '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + r + '" fill="' + col + '" opacity="' + (op || 0.35) + '"/>'; }
    var WALL = ['#56656d', '#35424a', '#252f35'], DARK = ['#3c4950', '#29343a', '#1c2429'], PAD = ['#2c363c', '#1b2226', '#13181b'], OL = ['#5c6a49', '#3c4730', '#2b3323'];
    var AM = '#ffc35a', TL = '#5ff0c0', OR = '#ff7a2a';
    function pad() {
      var s = '<ellipse cx="32" cy="57.5" rx="29" ry="6" fill="#000" opacity=".5"/>' + box(-15, -15, 0, 30, 30, 2.5, PAD);
      for (var i = 0; i < 6; i++) s += onL(15, -15 + i * 5, -12.5 + i * 5, 0, 2.5, i % 2 ? '#0c0e0f' : '#d99a26');
      for (i = 0; i < 6; i++) s += onR(15, -15 + i * 5, -12.5 + i * 5, 0, 2.5, i % 2 ? '#0a0b0c' : '#a8761d');
      s += onTop(-13, -13, 2.5, 26, 26, 'none', ' stroke="#3a464d" stroke-width=".35" stroke-dasharray="1.2 1.2"');
      return s;
    }
    function winsL(yy, x0, x1, n, z0, z1, f) { var s = '', w = (x1 - x0) / n; for (var i = 0; i < n; i++) s += onL(yy, x0 + i * w + w * 0.2, x0 + (i + 1) * w - w * 0.2, z0, z1, f); return s; }
    function winsR(xx, y0, y1, n, z0, z1, f) { var s = '', w = (y1 - y0) / n; for (var i = 0; i < n; i++) s += onR(xx, y0 + i * w + w * 0.2, y0 + (i + 1) * w - w * 0.2, z0, z1, f); return s; }
    function flag(x, y, z, h, col) { var a = P(x, y, z), b = P(x, y, z + h); return '<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + 'V' + f1(b[1]) + '" stroke="#9aa6ad" stroke-width=".8"/><path d="M' + f1(b[0]) + ' ' + f1(b[1]) + 'l7 2.2-7 2.4z" fill="' + col + '"/>'; }
    var Z = 2.5;
    var A = {};
    A.hq = pad() + box(-10, -10, Z, 20, 20, 9, WALL) + winsL(10, -9, 9, 5, Z + 3, Z + 6, AM) + winsR(10, -9, 9, 5, Z + 3, Z + 6, AM) +
      box(-5, -5, Z + 9, 10, 10, 9, WALL) + winsL(5, -4, 4, 2, Z + 12, Z + 16, AM) + winsR(5, -4, 4, 2, Z + 12, Z + 16, '#e0a840') +
      onTop(-4, -4, Z + 18, 8, 8, '#1b2226') + (function () { var t = P(0, 0, Z + 18), u = P(0, 0, Z + 30); return '<path d="M' + f1(t[0]) + ' ' + f1(t[1]) + 'V' + f1(u[1]) + '" stroke="#b9c3c8" stroke-width=".9"/><circle cx="' + f1(u[0]) + '" cy="' + f1(u[1]) + '" r="1.3" fill="#ff4d4d"/>' + glow(u[0], u[1], 3, '#ff4d4d', 0.35); })() +
      (function () { var c = P(-7, 7, Z + 9); return '<ellipse cx="' + f1(c[0]) + '" cy="' + f1(c[1] - 2) + '" rx="4.2" ry="2.4" fill="#c9d2d6" transform="rotate(-20 ' + f1(c[0]) + ' ' + f1(c[1] - 2) + ')"/><path d="M' + f1(c[0]) + ' ' + f1(c[1] - 2) + 'v3" stroke="#8e999e" stroke-width=".8"/>'; })() +
      flag(8, -8, Z + 9, 9, '#38d9b0');
    A.supply = pad() + box(-12, -6, Z, 15, 16, 7, DARK) + gable(-12, -6, Z + 7, 15, 16, 4, ['#4a5a62', '#36434a', '#273036']) + onL(10, -9, -2, Z, Z + 5, '#141a1d') + onL(10, -8.4, -2.6, Z + 0.6, Z + 4.4, 'none', ' stroke="#ffc35a" stroke-width=".4" stroke-dasharray=".8 .8"') +
      box(5, -11, Z, 6, 6, 5, ['#9a7a3c', '#6e5525', '#53401b']) + box(5, -4, Z, 6, 6, 5, ['#8f7036', '#664e22', '#4d3b18']) + box(5, -8, Z + 5, 6, 6, 5, ['#a6844a', '#76592a', '#59431f']) +
      (function () { var c = P(-4.5, 2, Z + 11.5); return '<circle cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="4" fill="#f5b83d" stroke="#fff3c4" stroke-width=".7"/><text x="' + f1(c[0]) + '" y="' + f1(c[1] + 2.2) + '" font-size="6" font-weight="900" text-anchor="middle" fill="#3a2500">¥</text>' + glow(c[0], c[1], 7, AM, 0.22); })();
    A.steel = pad() + box(-11, -9, Z, 15, 18, 9, DARK) + onL(9, -8, -1, Z, Z + 6, '#2a1206') + onL(9, -7.4, -1.6, Z + 0.5, Z + 5.2, OR) + glow(P(-4.5, 9, Z + 3)[0], P(-4.5, 9, Z + 3)[1], 6, OR, 0.4) +
      box(5, -8, Z, 5, 5, 22, ['#5e6b72', '#3d494f', '#2a3338']) + onL(-3, 5, 10, Z + 17, Z + 19, '#d99a26') + onL(-3, 5, 10, Z + 13, Z + 15, '#d99a26') +
      (function () { var t = P(7.5, -5.5, Z + 22); return '<circle cx="' + f1(t[0] + 1) + '" cy="' + f1(t[1] - 4) + '" r="3.2" fill="#8a959b" opacity=".75"/><circle cx="' + f1(t[0] + 4) + '" cy="' + f1(t[1] - 8.5) + '" r="4" fill="#7a868c" opacity=".55"/><circle cx="' + f1(t[0] + 8) + '" cy="' + f1(t[1] - 13) + '" r="4.6" fill="#6e7a80" opacity=".35"/>'; })() +
      box(5, 4, Z, 8, 6, 3, ['#7d8a91', '#56636a', '#3e494f']) + onTop(5.6, 4.6, Z + 3.05, 6.8, 4.8, '#c4ced3');
    A.depot = pad() + box(-12, -11, Z, 24, 20, 6, WALL) +
      (function () { // かまぼこ屋根
        var s = '', n = 6;
        for (var i = 0; i < n; i++) { var a0 = Math.PI * i / n, a1 = Math.PI * (i + 1) / n, x0 = -12 + 12 * (1 - Math.cos(a0)), x1 = -12 + 12 * (1 - Math.cos(a1)), z0 = Z + 6 + 8 * Math.sin(a0), z1 = Z + 6 + 8 * Math.sin(a1); s += poly([P(x0, -11, z0), P(x1, -11, z1), P(x1, 9, z1), P(x0, 9, z0)], i < n / 2 ? '#5f6f78' : i < n - 1 ? '#3f4c54' : '#2d383e'); }
        var g = []; for (i = 0; i <= n; i++) { var a = Math.PI * i / n; g.push(P(-12 + 12 * (1 - Math.cos(a)), 9, Z + 6 + 8 * Math.sin(a))); }
        g.push(P(12, 9, Z + 6)); g.push(P(-12, 9, Z + 6));
        return s + poly(g, '#34414a');
      })() + onL(9, -7, 7, Z, Z + 9, '#141a1d') + (function () { var s = ''; for (var i = 0; i < 6; i++) s += onL(9, -7, 7, Z + 0.6 + i * 1.4, Z + 1.1 + i * 1.4, '#27323a'); return s; })() + onL(9, -7, 7, Z + 9.2, Z + 9.8, AM) + glow(P(0, 9, Z + 9.5)[0], P(0, 9, Z + 9.5)[1], 5, AM, 0.3);
    A.barracks = pad() + box(-12, -11, Z, 8, 21, 5, OL) + gable(-12, -11, Z + 5, 8, 21, 4, ['#6a7a52', '#465234', '#333c26']) + winsR(-4, -9, 8, 4, Z + 1.5, Z + 3.5, AM) +
      box(2, -11, Z, 8, 21, 5, OL) + gable(2, -11, Z + 5, 8, 21, 4, ['#6a7a52', '#465234', '#333c26']) + winsR(10, -9, 8, 4, Z + 1.5, Z + 3.5, AM) + flag(-1, 12, Z, 16, '#38d9b0');
    A.atpost = pad() +
      (function () { var s = ''; for (var i = 0; i < 14; i++) { var a = i / 14 * Math.PI * 2, c = P(Math.cos(a) * 10, Math.sin(a) * 10, Z + 1.2); s += '<ellipse cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" rx="3.2" ry="1.9" fill="' + (i % 2 ? '#8c7a52' : '#a08c5e') + '" stroke="#5a4c30" stroke-width=".4"/>'; } return s; })() +
      box(-3, -3, Z, 6, 6, 2.5, ['#4a554a', '#323a32', '#252b25']) +
      (function () { var b0 = P(0, 0, Z + 4), b1 = P(10, -9, Z + 8); return '<path d="M' + f1(b0[0]) + ' ' + f1(b0[1]) + 'L' + f1(b1[0]) + ' ' + f1(b1[1]) + '" stroke="#2a3330" stroke-width="2.4" stroke-linecap="round"/><path d="M' + f1(b0[0]) + ' ' + f1(b0[1]) + 'L' + f1(b1[0]) + ' ' + f1(b1[1]) + '" stroke="#65736c" stroke-width="1" stroke-linecap="round"/>'; })() +
      onL(3, -3, 3, Z + 2.5, Z + 7, '#3e4a43') + onL(3, -2.6, 2.6, Z + 6, Z + 6.6, AM);
    A.factory = pad() + box(-13, -12, Z, 24, 20, 9, WALL) +
      (function () { var s = ''; for (var i = 0; i < 4; i++) { var x = -13 + i * 6; s += poly([P(x, -12, Z + 9), P(x + 6, -12, Z + 9), P(x + 6, 8, Z + 9), P(x, 8, Z + 9)], '#2c373d') + poly([P(x, -12, Z + 9), P(x, -12, Z + 13), P(x, 8, Z + 13), P(x, 8, Z + 9)], '#7fb2c4') + poly([P(x, -12, Z + 13), P(x + 6, -12, Z + 9), P(x + 6, 8, Z + 9), P(x, 8, Z + 13)], '#4b5a62') + poly([P(x, 8, Z + 9), P(x, 8, Z + 13), P(x + 6, 8, Z + 9)], '#35424a'); } return s; })() +
      onL(8, -9, 3, Z, Z + 7, '#141a1d') + onL(8, -9, 3, Z + 7.2, Z + 7.8, AM) +
      box(2, 9, Z, 8, 5, 2.2, ['#5c6b47', '#3e4a2f', '#2d3622']) + box(4, 10, Z + 2.2, 4, 3, 1.8, ['#6d7d55', '#4a5737', '#36402a']) +
      (function () { var a = P(6, 11.5, Z + 3.1), b = P(6, 18, Z + 3.4); return '<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(b[0]) + ' ' + f1(b[1]) + '" stroke="#2a3322" stroke-width="1.2" stroke-linecap="round"/>'; })();
    A.artpost = pad() +
      (function () { var s = ''; for (var i = 0; i < 16; i++) { var a = i / 16 * Math.PI * 2, c = P(Math.cos(a) * 11, Math.sin(a) * 11, Z + 0.8); s += '<rect x="' + f1(c[0] - 2.2) + '" y="' + f1(c[1] - 1.6) + '" width="4.4" height="3.2" rx="1" fill="' + (i % 2 ? '#5a6248' : '#6c7556') + '"/>'; } return s; })() +
      box(-4, -4, Z, 8, 8, 2, ['#4c5640', '#343b2c', '#262b20']) + box(-2, -2, Z + 2, 4, 4, 3, ['#68745a', '#48513e', '#353c2e']) +
      (function () { var b0 = P(0, 0, Z + 4.5), b1 = P(13, -12, Z + 17); return '<path d="M' + f1(b0[0]) + ' ' + f1(b0[1]) + 'L' + f1(b1[0]) + ' ' + f1(b1[1]) + '" stroke="#262c20" stroke-width="3.2" stroke-linecap="round"/><path d="M' + f1(b0[0]) + ' ' + f1(b0[1]) + 'L' + f1(b1[0]) + ' ' + f1(b1[1]) + '" stroke="#6f7a5e" stroke-width="1.4" stroke-linecap="round"/><circle cx="' + f1(b1[0]) + '" cy="' + f1(b1[1]) + '" r="1.6" fill="#1a1d16"/>'; })() +
      box(-12, 6, Z, 4, 4, 3, ['#9a7a3c', '#6e5525', '#53401b']) + box(-12, 1, Z, 4, 4, 3, ['#8f7036', '#664e22', '#4d3b18']);
    A.lab = pad() + box(-11, -9, Z, 18, 18, 8, WALL) + winsL(9, -10, 6, 4, Z + 3, Z + 5.5, TL) + winsR(7, -8, 8, 4, Z + 3, Z + 5.5, TL) +
      (function () { var c = P(-2, 0, Z + 8), s = ''; s += '<path d="M' + f1(c[0] - 8) + ' ' + f1(c[1]) + 'A8 7 0 0 1 ' + f1(c[0] + 8) + ' ' + f1(c[1]) + 'Z" fill="#7d9aa6"/><path d="M' + f1(c[0] - 8) + ' ' + f1(c[1]) + 'A8 7 0 0 1 ' + f1(c[0]) + ' ' + f1(c[1] - 7) + 'L' + f1(c[0]) + ' ' + f1(c[1]) + 'Z" fill="#a9c3cc"/>'; s += '<path d="M' + f1(c[0] - 1.5) + ' ' + f1(c[1] - 7) + 'L' + f1(c[0] + 1.5) + ' ' + f1(c[1] - 7) + 'L' + f1(c[0] + 1) + ' ' + f1(c[1]) + 'L' + f1(c[0] - 1) + ' ' + f1(c[1]) + 'Z" fill="' + TL + '" opacity=".85"/>' + glow(c[0], c[1] - 4, 7, TL, 0.25); return s; })() +
      (function () { var t = P(6, -8, Z + 8), u = P(6, -8, Z + 17); return '<path d="M' + f1(t[0]) + ' ' + f1(t[1]) + 'V' + f1(u[1]) + '" stroke="#b9c3c8" stroke-width=".8"/><ellipse cx="' + f1(u[0] + 2) + '" cy="' + f1(u[1] + 1) + '" rx="3.6" ry="1.6" fill="#c9d2d6" transform="rotate(-30 ' + f1(u[0] + 2) + ' ' + f1(u[1] + 1) + ')"/><circle cx="' + f1(u[0]) + '" cy="' + f1(u[1]) + '" r="1" fill="' + TL + '"/>'; })();
    return A;
  })();
  // 基地のジオラマの座標。幅1000の図の中に、区画(c: 右下へ / r: 左下へ)をひし形に並べる
  var ISO = (function () {
    var VW = 1000, VH = 790, HX = 146, HY = 84, X0 = 500, Y0 = 252, S = HX / 0.53;   // S: 施設の絵(正方形)の一辺
    function f1(v) { return Math.round(v * 10) / 10; }
    function M(c, r, z) { return [X0 + (c - r) * HX, Y0 + (c + r) * HY - (z || 0)]; }
    function poly(pts, fill, ex) { return '<path d="M' + pts.map(function (q) { return f1(q[0]) + ' ' + f1(q[1]); }).join('L') + 'Z" fill="' + fill + '"' + (ex || '') + '/>'; }
    function quad(c0, r0, c1, r1, fill, ex, z) { return poly([M(c0, r0, z), M(c1, r0, z), M(c1, r1, z), M(c0, r1, z)], fill, ex); }
    function line(a, b, col, w, ex) { return '<path d="M' + f1(a[0]) + ' ' + f1(a[1]) + 'L' + f1(b[0]) + ' ' + f1(b[1]) + '" stroke="' + col + '" stroke-width="' + w + '" fill="none"' + (ex || '') + '/>'; }
    var E0 = -0.62, E1 = 2.62, TH = 46;   // 台座の端(区画の座標)と厚み
    function ground(bySlot) {
      var s = '<svg class="ground" viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="xMidYMid meet"><defs>' +
        '<linearGradient id="isoTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46553b"/><stop offset="1" stop-color="#2f3b29"/></linearGradient>' +
        '<linearGradient id="isoL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a3528"/><stop offset="1" stop-color="#1c1a14"/></linearGradient>' +
        '<linearGradient id="isoR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a261d"/><stop offset="1" stop-color="#12110d"/></linearGradient>' +
        '<radialGradient id="isoSh" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#000" stop-opacity=".55"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>' +
        '<pattern id="isoHatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><rect width="14" height="14" fill="rgba(56,217,176,.05)"/><rect width="5" height="14" fill="rgba(56,217,176,.12)"/></pattern></defs>';
      var A = M(E0, E0), B = M(E1, E0), C = M(E1, E1), D = M(E0, E1), c, r, i;
      // 台座の影・側面(土の層)・上面
      s += '<ellipse cx="' + X0 + '" cy="' + f1(C[1] + TH + 6) + '" rx="470" ry="62" fill="url(#isoSh)"/>';
      s += poly([D, C, [C[0], C[1] + TH], [D[0], D[1] + TH]], 'url(#isoL)') + poly([C, B, [B[0], B[1] + TH], [C[0], C[1] + TH]], 'url(#isoR)');
      for (i = 1; i <= 2; i++) s += line([D[0], D[1] + TH * i / 3], [C[0], C[1] + TH * i / 3], 'rgba(0,0,0,.28)', 2) + line([C[0], C[1] + TH * i / 3], [B[0], B[1] + TH * i / 3], 'rgba(0,0,0,.3)', 2);
      s += poly([A, B, C, D], 'url(#isoTop)');
      // 草地のむら
      var rnd = TF.rngFrom(77);
      for (i = 0; i < 46; i++) { c = E0 + 0.1 + rnd() * (E1 - E0 - 0.2); r = E0 + 0.1 + rnd() * (E1 - E0 - 0.2); var q = M(c, r), rr = 10 + rnd() * 26; s += '<ellipse cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" rx="' + f1(rr) + '" ry="' + f1(rr * 0.5) + '" fill="' + (i % 3 ? '#52633f' : '#26301f') + '" opacity=".22"/>'; }
      // 区画の間の道(コンクリート)と中央線
      [0.5, 1.5].forEach(function (k) {
        s += quad(k - 0.085, E0 + 0.04, k + 0.085, E1 - 0.04, '#5b5a4c') + quad(E0 + 0.04, k - 0.085, E1 - 0.04, k + 0.085, '#5b5a4c');
      });
      [0.5, 1.5].forEach(function (k) {
        s += line(M(k, E0 + 0.1), M(k, E1 - 0.1), 'rgba(235,225,180,.5)', 2.2, ' stroke-dasharray="14 12"') + line(M(E0 + 0.1, k), M(E1 - 0.1, k), 'rgba(235,225,180,.5)', 2.2, ' stroke-dasharray="14 12"');
      });
      // 外周の道
      s += poly([A, B, C, D], 'none', ' stroke="#55544a" stroke-width="16" stroke-linejoin="round" opacity=".55"');
      // 区画の土台(コンクリートの板。まだ何もない区画は点線の枠)
      for (i = 0; i < 9; i++) {
        c = i % 3; r = Math.floor(i / 3);
        var h = 0.405, id = bySlot[i];
        if (id) {
          s += quad(c - h, r - h, c + h, r + h, 'rgba(0,0,0,.35)', '', -7);
          s += poly([M(c - h, r + h), M(c + h, r + h), M(c + h, r + h, -8), M(c - h, r + h, -8)], '#20282d') + poly([M(c + h, r + h), M(c + h, r - h), M(c + h, r - h, -8), M(c + h, r + h, -8)], '#161c20');
          if (ART.has('b.' + id)) {
            s += poly([M(c - h, r + h), M(c + h, r + h), M(c + h, r + h, -8), M(c - h, r + h, -8)], '#8d8a7e') + poly([M(c + h, r + h), M(c + h, r - h), M(c + h, r - h, -8), M(c + h, r + h, -8)], '#6f6c62');
            s += quad(c - h, r - h, c + h, r + h, id === 'hq' ? '#d2cdb8' : '#c9c6b9', ' stroke="' + (id === 'hq' ? 'rgba(245,184,61,.9)' : 'rgba(255,255,255,.35)') + '" stroke-width="' + (id === 'hq' ? 3.5 : 2) + '"');
            s += quad(c - h + 0.05, r - h + 0.05, c + h - 0.05, r + h - 0.05, 'none', ' stroke="rgba(90,88,78,.35)" stroke-width="1.5" stroke-dasharray="10 8"');
          } else s += quad(c - h, r - h, c + h, r + h, id === 'hq' ? '#3a4046' : '#333d43', ' stroke="' + (id === 'hq' ? 'rgba(245,184,61,.75)' : 'rgba(150,170,180,.28)') + '" stroke-width="' + (id === 'hq' ? 3 : 2) + '"');
        } else {
          s += quad(c - h, r - h, c + h, r + h, 'url(#isoHatch)', ' stroke="rgba(56,217,176,.7)" stroke-width="2.5" stroke-dasharray="12 9"');
        }
      }
      // 奥の2辺の柵(支柱と金網)
      var posts = '', top = [], n = 13;
      [[E0, E0, E1, E0], [E0, E0, E0, E1]].forEach(function (e, k) {
        var pts = [];
        for (i = 0; i <= n; i++) { c = e[0] + (e[2] - e[0]) * i / n; r = e[1] + (e[3] - e[1]) * i / n; var p0 = M(c, r), p1 = M(c, r, 30); pts.push(p1); posts += line(p0, p1, '#8f9a8a', 3); }
        s += '<path d="M' + pts.map(function (q) { return f1(q[0]) + ' ' + f1(q[1]); }).join('L') + '" stroke="#a9b3a3" stroke-width="2" fill="none"/>' +
          '<path d="M' + pts.map(function (q) { return f1(q[0]) + ' ' + f1(q[1] + 13); }).join('L') + '" stroke="rgba(169,179,163,.55)" stroke-width="1.5" fill="none"/>';
      });
      s += posts;
      // 奥の角の監視塔と旗
      var tw = M(E0 + 0.13, E0 + 0.13);
      s += '<path d="M' + f1(tw[0] - 9) + ' ' + f1(tw[1]) + 'L' + f1(tw[0] - 6) + ' ' + f1(tw[1] - 58) + 'M' + f1(tw[0] + 9) + ' ' + f1(tw[1]) + 'L' + f1(tw[0] + 6) + ' ' + f1(tw[1] - 58) + 'M' + f1(tw[0] - 8) + ' ' + f1(tw[1] - 20) + 'L' + f1(tw[0] + 7) + ' ' + f1(tw[1] - 40) + 'M' + f1(tw[0] + 8) + ' ' + f1(tw[1] - 20) + 'L' + f1(tw[0] - 7) + ' ' + f1(tw[1] - 40) + '" stroke="#6f7a6c" stroke-width="3" fill="none"/>' +
        '<rect x="' + f1(tw[0] - 15) + '" y="' + f1(tw[1] - 78) + '" width="30" height="20" fill="#4a5347" stroke="#2c332a" stroke-width="2"/><path d="M' + f1(tw[0] - 19) + ' ' + f1(tw[1] - 78) + 'L' + f1(tw[0]) + ' ' + f1(tw[1] - 92) + 'L' + f1(tw[0] + 19) + ' ' + f1(tw[1] - 78) + 'Z" fill="#39413a"/>' +
        '<rect x="' + f1(tw[0] - 9) + '" y="' + f1(tw[1] - 72) + '" width="18" height="7" fill="#ffc35a" opacity=".85"/>';
      // 手前の2辺の縁(警告色の縞)と灯り
      s += line(D, C, '#d99a26', 5, ' stroke-dasharray="18 14"') + line(C, B, '#a8761d', 5, ' stroke-dasharray="18 14"');
      [[D, C], [C, B]].forEach(function (e) { for (i = 1; i < 6; i++) { var x = e[0][0] + (e[1][0] - e[0][0]) * i / 6, y = e[0][1] + (e[1][1] - e[0][1]) * i / 6; s += '<circle cx="' + f1(x) + '" cy="' + f1(y - 3) + '" r="9" fill="#ffc35a" opacity=".16"/><circle cx="' + f1(x) + '" cy="' + f1(y - 3) + '" r="3" fill="#ffe2a0"/>'; } });
      // 上面の縁の光
      s += poly([A, B, C, D], 'none', ' stroke="rgba(56,217,176,.55)" stroke-width="2"');
      return s + '</svg>';
    }
    // 区画 i の施設の絵(正方形)を置く位置。土台の中心が絵の(50%, 62.5%)に来る
    function tileStyle(i) {
      var c = i % 3, r = Math.floor(i / 3), q = M(c, r);
      return 'left:' + f1((q[0] - S / 2) / VW * 100) + '%;top:' + f1((q[1] - S * 0.625) / VH * 100) + '%;width:' + f1(S / VW * 100) + '%;height:' + f1(S / VH * 100) + '%';
    }
    return { ground: ground, tileStyle: tileStyle, VW: VW, VH: VH };
  })();
  function bSvg(id) { return ART.has('b.' + id) ? ART.svg('b.' + id, 'bpic') : '<svg viewBox="0 0 64 64" class="art">' + BART[id] + '</svg>'; }

  // ====== 指揮官・敵将の肖像(軍の身上書ふう: 斜めの光・顔の影・輪郭の光) ======
  var Portrait = (function () {
    function P(d, f, ex) { return '<path d="' + d + '" fill="' + f + '"' + (ex || '') + '/>'; }
    function S(d, c, w, ex) { return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round"' + (ex || '') + '/>'; }
    var FACE = { m: 'M21.5 30C21.5 21.5 26 17.5 32 17.5S42.5 21.5 42.5 30C42.5 37.5 40 43 35.8 46.2C34.2 47.4 29.8 47.4 28.2 46.2C24 43 21.5 37.5 21.5 30Z',
      f: 'M22.2 30C22.2 22 26.4 18 32 18S41.8 22 41.8 30C41.8 37 39.6 41.8 35.9 44.9C34.3 46.2 29.7 46.2 28.1 44.9C24.4 41.8 22.2 37 22.2 30Z' };
    var SHADE = { m: 'M32 17.5C38 17.5 42.5 21.5 42.5 30C42.5 37.5 40 43 35.8 46.2C34.6 47 33.2 47.4 32 47.4C35.6 43 37.6 37 37.6 30C37.6 23.5 35.6 19.3 32 17.5Z',
      f: 'M32 18C37.7 18 41.8 22 41.8 30C41.8 37 39.6 41.8 35.9 44.9C34.7 45.8 33.3 46.2 32 46.2C35.3 41.9 37.2 36.4 37.2 30C37.2 23.6 35.3 19.6 32 18Z' };
    function eyes(o) {
      var s = '', ir = o.f ? 1.45 : 1.25, sc = '#ece8df';
      if (o.glow) { // 光る目(敵将)
        return P('M24.6 31.8Q27.3 30.2 30 31.6Q27.4 32.8 24.6 31.8Z', o.glow) + P('M34 31.6Q36.7 30.2 39.4 31.8Q36.6 32.8 34 31.6Z', o.glow) +
          '<circle cx="27.3" cy="31.6" r="3" fill="' + o.glow + '" opacity=".35"/><circle cx="36.7" cy="31.6" r="3" fill="' + o.glow + '" opacity=".35"/>';
      }
      var sq = o.squint ? 0.55 : 1;
      s += P('M24.6 31.8Q27.3 ' + (31.6 - 1.7 * sq) + ' 30 31.6Q27.4 ' + (31.6 + 1.3 * sq) + ' 24.6 31.8Z', sc);
      s += P('M34 31.6Q36.7 29.9 39.4 31.8Q36.6 32.9 34 31.6Z', sc);
      s += '<circle cx="27.6" cy="31.6" r="' + ir * (o.squint ? 0.8 : 1) + '" fill="' + o.eye + '"/><circle cx="36.6" cy="31.6" r="' + ir + '" fill="' + o.eye + '"/>';
      s += '<circle cx="27.6" cy="31.6" r=".6" fill="#05070a"/><circle cx="36.6" cy="31.6" r=".6" fill="#05070a"/><circle cx="28.1" cy="31.1" r=".38" fill="#fff"/><circle cx="37.1" cy="31.1" r=".38" fill="#fff"/>';
      s += S('M24.4 31.8Q27.3 ' + (31.6 - 2 * sq) + ' 30.2 31.5', '#1a1410', o.f ? 1.1 : 0.85) + S('M33.8 31.5Q36.7 29.6 39.6 31.8', '#1a1410', o.f ? 1.1 : 0.85);
      if (o.f) s += S('M24.4 31.8l-1 -.8M39.6 31.8l1 -.8', '#1a1410', 0.8);
      return s;
    }
    function brows(o) {
      var c = o.browC || '#2a1f18';
      if (o.brow === 'calm') return S('M24.2 28.9Q27 27.6 29.8 28.5', c, 1.3) + S('M34.2 28.5Q37 27.6 39.8 28.9', c, 1.3);
      if (o.brow === 'raised') return S('M24.2 28.4Q27 26.8 29.8 28', c, 1.3) + S('M34.2 28.9Q37 27.8 39.8 28.6', c, 1.3);
      return S('M23.9 28.3L29.9 29.6', c, o.f ? 1.4 : 2) + S('M40.1 28.3L34.1 29.6', c, o.f ? 1.4 : 2);
    }
    function mouth(o, sk2) {
      var m = o.mouth || 'stern', lip = o.f ? '#b8545a' : '#6e3a30';
      if (m === 'smile') return S('M29 41.8Q32 43.6 35 41.8', lip, 1.1);
      if (m === 'smirk') return S('M29.2 42.3Q32.5 42.9 35.4 41.4', lip, 1.1);
      if (m === 'grin') return P('M28.6 41.4Q32 44.6 35.4 41.4Q32 42.4 28.6 41.4Z', '#f2ede2', ' stroke="' + lip + '" stroke-width=".8"');
      return S('M29.3 42.3Q32 42.7 34.7 42.3', lip, 1.1);
    }
    function base(o) {
      var id = o.id, sk = o.skin, sk2 = shade(sk, -0.22), uni = o.uni, f = o.f ? 'f' : 'm', s = '';
      s += '<defs><linearGradient id="pb-' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + o.bg + '"/><stop offset="1" stop-color="#04070a"/></linearGradient>' +
        '<linearGradient id="pu-' + id + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + shade(uni, 0.18) + '"/><stop offset=".6" stop-color="' + uni + '"/><stop offset="1" stop-color="' + shade(uni, -0.4) + '"/></linearGradient></defs>';
      s += '<rect width="64" height="64" fill="url(#pb-' + id + ')"/>';
      s += S('M-4 18L22 -8M-4 30L34 -8M-4 42L46 -8M10 64L64 10M22 64L64 22', o.light, 0.6, ' opacity=".14"');
      s += '<circle cx="42" cy="20" r="24" fill="' + o.light + '" opacity=".14"/>';
      if (o.backHair) s += o.backHair;
      s += P('M3 64C5 52.5 15 48 25 47L32 53L39 47C49 48 59 52.5 61 64Z', 'url(#pu-' + id + ')');
      s += P('M27.5 40.5H36.5L37 48.5L32 53L27 48.5Z', sk2);
      s += P('M25 47L32 53L28.4 57.5L21.5 49.2Z', shade(uni, -0.28)) + P('M39 47L32 53L35.6 57.5L42.5 49.2Z', shade(uni, -0.4));
      if (o.collar) s += o.collar;
      if (o.rank) s += P('M7.5 54.6L18 50.6L18.8 52.6L8.4 56.6Z', '#f5b83d') + P('M45.2 50.6L55.7 54.6L54.8 56.6L44.4 52.6Z', '#c98f22') + P('M10 56L16.4 53.6', 'none', ' stroke="#1a1206" stroke-width=".5"');
      if (o.chest) s += o.chest;
      s += '<ellipse cx="21.2" cy="32.6" rx="2.2" ry="3.3" fill="' + shade(sk, -0.08) + '"/><ellipse cx="42.8" cy="32.6" rx="2.2" ry="3.3" fill="' + sk2 + '"/>';
      s += P(FACE[f], sk) + P(SHADE[f], sk2, ' opacity=".55"');
      s += S('M24.5 38.5Q26.5 43.4 29.6 45.4', sk2, 0.7, ' opacity=".6"');
      if (o.paint) s += o.paint;
      s += eyes(o) + brows(o);
      s += S('M32.1 32.6L30.9 38.1Q32 38.9 33.3 38.3', sk2, 0.9);
      if (o.beard) s += o.beard; else s += mouth(o, sk2);
      if (o.scar) s += S(o.scar, '#a85a4c', 0.9);
      if (o.stubble) s += P(o.f ? '' : 'M25.5 39.5Q28 45.8 32 46.6Q36 45.8 38.5 39.5Q36 43.8 32 44.2Q28 43.8 25.5 39.5Z', '#2a2018', ' opacity=".28"');
      if (o.hair) s += o.hair;
      if (o.head) s += o.head;
      if (o.acc) s += o.acc;
      s += S(f === 'm' ? 'M42.5 27C43 33 41.6 40 37.4 44.6' : 'M41.8 27C42.2 33 40.8 39.4 37.2 43.6', o.light, 0.9, ' opacity=".75"');
      s += P('M0 0H64V64H0ZM2 2V62H62V2Z', 'rgba(0,0,0,.35)', ' fill-rule="evenodd"');
      return '<svg viewBox="0 0 64 64">' + s + '</svg>';
    }
    // ---- 装備 ----
    function helmet(c, big) {
      var k = big ? 1.06 : 1, sx = function (v) { return 32 + (v - 32) * k; };
      return P('M' + sx(19.5) + ' 29C' + sx(19) + ' 16.5 25 ' + (11.5 - (big ? 1 : 0)) + ' 32 ' + (11.5 - (big ? 1 : 0)) + 'S' + sx(45) + ' 16.5 ' + sx(44.5) + ' 29L' + sx(46.6) + ' 29.8C' + sx(46.8) + ' 31 ' + sx(46) + ' 31.7 ' + sx(44.8) + ' 31.7H' + sx(19.2) + 'C' + sx(18) + ' 31.7 ' + sx(17.2) + ' 31 ' + sx(17.4) + ' 29.8Z', c) +
        P('M32 ' + (11.5 - (big ? 1 : 0)) + 'C38 ' + (11.5 - (big ? 1 : 0)) + ' ' + sx(45) + ' 16.5 ' + sx(44.5) + ' 29L' + sx(46.6) + ' 29.8C' + sx(46.8) + ' 31 ' + sx(46) + ' 31.7 ' + sx(44.8) + ' 31.7H37C38.4 26 37.6 17 32 ' + (11.5 - (big ? 1 : 0)) + 'Z', 'rgba(0,0,0,.3)') +
        S('M22 19.5L42 27M24 15.5L44 23M21 24L36 14M27 28.5L42 17', 'rgba(0,0,0,.25)', 0.5) + S('M' + sx(20) + ' 31.4C21 37.5 24 42.6 28 45.8M' + sx(44) + ' 31.4C43 37.5 40 42.6 36 45.8', '#1f2414', 1.1);
    }
    function goggles(y, strap) {
      return S('M20 ' + y + 'H44', strap || '#3a2a1c', 2.2) + '<circle cx="27" cy="' + y + '" r="3.6" fill="#1a2630" stroke="#b9c3c8" stroke-width="1"/><circle cx="37" cy="' + y + '" r="3.6" fill="#1a2630" stroke="#b9c3c8" stroke-width="1"/>' +
        P('M25 ' + (y - 1.5) + 'l3 -.8 1 1.6-3 .6z', '#9fd8ff', ' opacity=".8"') + P('M35 ' + (y - 1.5) + 'l3 -.8 1 1.6-3 .6z', '#9fd8ff', ' opacity=".8"');
    }
    var H = {
      oni: { bg: '#8a2016', light: '#ff8a5c', uni: '#4d5a33', skin: '#d9a37c', eye: '#3a2a1e', brow: 'stern', mouth: 'stern', rank: 1, stubble: 1,
        scar: 'M23.6 34.5L27.4 40.2M24.8 34.2L23.9 35.6', head: helmet('#5a6638') },
      tetsu: { f: 1, bg: '#13406a', light: '#7fc6ff', uni: '#3c4a58', skin: '#efc7a3', eye: '#2f6db0', brow: 'calm', mouth: 'smirk', rank: 1,
        backHair: P('M40 22C49 24 52 36 49 50C47 44 45 40 42 37Z', '#b8322a') + P('M44 26C49 30 50 38 48 46', 'none', ' stroke="#8a1f19" stroke-width="1"'),
        hair: P('M22.4 27.5C23 22 26.6 19.8 30 20.8C27.8 22.8 26 25.2 25.4 29.2Z', '#c13a30'),
        head: P('M20 28C20 17 25.5 12.5 32 12.5S44 17 44 28V31H41V25.5H23V31H20Z', '#5a3d28') + P('M32 12.5C38.5 12.5 44 17 44 28V31H41V25.5H37C38 21 36.5 15 32 12.5Z', 'rgba(0,0,0,.3)') +
          S('M24 13.8V24M28 12.8V24.5M32 12.4V24.6M36 12.8V24.5M40 13.8V24', '#3e2a1b', 1.1) + goggles(22.5, '#2a1d13') },
      taka: { bg: '#164a2e', light: '#9fffc0', uni: '#4f6343', skin: '#e3bd99', eye: '#4a6b3a', brow: 'stern', mouth: 'stern', squint: 1, browC: '#c9cdd2',
        backHair: P('M20 24C17 33 18 42 21 47L24 40C22 35 22 30 23 26Z', '#dfe3e8') + P('M44 24C47 33 46 42 43 47L40 40C42 35 42 30 41 26Z', '#c9ced4'),
        hair: P('M21.5 29C21 20 25.5 15.5 32 15.5S43 20 42.5 29C40 24 37.5 22 33 22.5C29.5 21.5 25 24 21.5 29Z', '#e3e7ec') + P('M32 15.5C38.5 15.5 43 20 42.5 29C41 25.6 39.4 23.4 36.6 22.6C37.2 19.4 35.2 16.6 32 15.5Z', 'rgba(0,0,0,.18)'),
        head: P('M20.5 22.5C22 18 26 15.6 32 15.6S42 18 43.5 22.5L43.8 25.4C37 23.4 27 23.4 20.2 25.4Z', '#4a5a36') + P('M43.2 23.8L49 22.6 48.4 25.6 43.6 25.6Z', '#4a5a36'),
        paint: P('M22.3 35.5L29 36.6 28.6 37.9 22.6 37Z', '#2f4a2a', ' opacity=".8"') + P('M35 36.6L41.7 35.5 41.4 37 35.4 37.9Z', '#1f2f1c', ' opacity=".8"') },
      rai: { bg: '#6a440c', light: '#ffd06a', uni: '#5b4a33', skin: '#d8a77f', eye: '#3a2a1e', brow: 'raised', mouth: 'grin', rank: 1,
        hair: P('M21.6 27C21.4 31 21.8 34 22.8 36.5L23.8 30Z', '#2a211b') + P('M42.4 27C42.6 31 42.2 34 41.2 36.5L40.2 30Z', '#2a211b'),
        head: P('M17.5 20.5C17.5 14.5 24.5 10.5 32 10.5S46.5 14.5 46.5 20.5Z', '#2e3424') + P('M19.5 20.5H44.5V24.6H19.5Z', '#c9a33c') + P('M18.6 24.6H45.4C44.6 27.8 40.4 29 32 29S19.4 27.8 18.6 24.6Z', '#0d0f0c') +
          P('M30.6 13.2L34.4 13.2 32.6 16.4 34.6 16.4 29.6 21.6 31 17.6 29 17.6Z', '#ffd06a') + P('M24 25.8H40', 'none', ' stroke="#3a4048" stroke-width=".7"') },
      sakura: { f: 1, bg: '#6a1f40', light: '#ffb3d1', uni: '#d9d3c6', skin: '#f2cfb3', eye: '#7a3a5a', brow: 'calm', mouth: 'smile',
        backHair: P('M20 24C17.5 33 18.5 41 21.5 45L24 36Z', '#e88fb0') + P('M44 24C46.5 33 45.5 41 42.5 45L40 36Z', '#d97aa0'),
        hair: P('M22.2 30C22 22.5 26 19.6 32 19.6S42 22.5 41.8 30C40 26 37 23.8 32.4 24.4C30 26 26 27.5 22.2 30Z', '#f0a0c0'),
        head: P('M19.8 24.5C20 16.5 25.4 12.4 32 12.4S44 16.5 44.2 24.5C38 22.4 26 22.4 19.8 24.5Z', '#f1ede6') + P('M32 12.4C38.6 12.4 44 16.5 44.2 24.5C42 23.7 39.6 23.2 37 23C37.4 18.8 35.6 14.4 32 12.4Z', 'rgba(0,0,0,.14)') +
          P('M30.4 14.6H33.6V17H36V20.2H33.6V22.6H30.4V20.2H28V17H30.4Z', '#e0302a'),
        chest: P('M11 55.5L20 52.5 21 55.5 12 58.5Z', '#f1ede6') + P('M14.6 54.4H16.6V53.2H17.8V55.2H19V56.4H17.8V57.6H16.6V56.4H15.4Z', '#e0302a') },
      hayate: { bg: '#0d4a5e', light: '#6ff7ff', uni: '#2f3d48', skin: '#e9c19c', eye: '#1d6a8a', brow: 'stern', mouth: 'smirk',
        hair: P('M20.6 29C19 18 25 12 33 12.5C38 12.8 41 15 43 18L50 15.5 45.5 21.5C46 24 45.6 27 43 30C42 25.5 39.5 22.6 35 22.2L37 18.5 31 21.6 28.6 18.4 27 22.8C24.8 23.8 22.6 26 20.6 29Z', '#1c3d66') +
          P('M33 12.5C38 12.8 41 15 43 18L50 15.5 45.5 21.5C46 24 45.6 27 43 30C42 25.5 39.5 22.6 35 22.2L37 18.5Z', 'rgba(0,0,0,.25)') + S('M26 17L31 14.6M35 15L40 16.6', '#5f9fe0', 0.8),
        acc: S('M19.8 28C19.5 17 25 13.4 32 13.2', '#2a2f36', 2) + '<rect x="17.8" y="28" width="4.6" height="8" rx="1.6" fill="#2a2f36" stroke="#6ff7ff" stroke-width=".6"/>' + S('M20 36C20.5 41 24 43.6 28.4 43.2', '#2a2f36', 1.1) + '<circle cx="28.8" cy="43.2" r="1.1" fill="#6ff7ff"/>',
        collar: P('M21 46.5C27 49 37 49 43 46.5L45 50.5C38 53.5 26 53.5 19 50.5Z', '#c8322c') + P('M41 50L52 47.5 49 53Z', '#a8261f') },
      kiri: { f: 1, bg: '#2f2a50', light: '#c6b3ff', uni: '#2e2b38', skin: '#e8c6a6', eye: '#5a4a8a', brow: 'calm', mouth: 'stern', browC: '#1a1820',
        backHair: P('M15 36C14 20 22 10.5 32 10.5S50 20 49 36C48 48 50 56 54 64H10C14 56 16 48 15 36Z', '#25222f'),
        hair: P('M22.4 29C22.8 23 26 20.4 30.6 20C28.6 22.5 27 25 26.6 29.6Z', '#16141c') + P('M41.6 29C41.2 23 38 20.4 33.4 20C35.4 22.5 37 25 37.4 29.6Z', '#16141c'),
        head: P('M18.5 33C17.5 19 23 12 32 12S46.5 19 45.5 33C44.5 26 41 20.5 32 19.6C23 20.5 19.5 26 18.5 33Z', '#3a3550') + P('M32 12C41 12 46.5 19 45.5 33C44.5 26 41 20.5 32 19.6Z', 'rgba(0,0,0,.3)'),
        acc: P('M22.6 34.6C26 36 38 36 41.4 34.6C41.6 39.8 39.4 44.4 36 46.4C34 47.2 30 47.2 28 46.4C24.6 44.4 22.4 39.8 22.6 34.6Z', '#24212c') + S('M24 38H40M25 41.5H39', '#3a3550', 0.6) +
          '<circle cx="48" cy="44" r="5" fill="#c6b3ff" opacity=".12"/><circle cx="52" cy="38" r="3.6" fill="#c6b3ff" opacity=".1"/>' },
      kuro: { bg: '#5a3d14', light: '#ffc88a', uni: '#5a5240', skin: '#c48f68', eye: '#2a1f18', brow: 'stern', rank: 1,
        beard: P('M22 36C22.5 45 26.5 50.5 32 50.5S41.5 45 42 36C40 39 37.5 40.6 34.6 40.6C33.6 39.8 30.4 39.8 29.4 40.6C26.5 40.6 24 39 22 36Z', '#3a2a1e') + S('M29 43H35', '#1f160f', 1.2) + P('M26 40.6Q32 38.2 38 40.6Q32 39.4 26 40.6Z', '#2a1f16'),
        head: helmet('#4a4e44', 1) },
      amagi: { bg: '#123f66', light: '#9fd8ff', uni: '#4d5a6a', skin: '#e8be98', eye: '#2a1f18', brow: 'raised', mouth: 'smile', rank: 1,
        head: P('M19 31C18 17 24 11.5 32 11.5S46 17 45 31L44 37C42.5 33 42 28 41 25H23C22 28 21.5 33 20 37Z', '#6b4a2e') + P('M32 11.5C40 11.5 46 17 45 31L44 37C42.5 33 42 28 41 25H37C37.5 20 36 14.5 32 11.5Z', 'rgba(0,0,0,.28)') +
          S('M23 18.5Q32 14 41 18.5', '#4a321f', 1) + P('M29 13.4L32 11.6 35 13.4 32 15.2Z', '#f5b83d'),
        acc: P('M22.4 30.4H30.6C31 30.4 31.2 30.8 31 31.4L30 34.6C29.6 35.6 28.6 36 27.4 36H25.6C24 36 22.6 35 22.4 33.4Z', 'url(#lens)') + P('M33.4 30.4H41.6L41.6 33.4C41.4 35 40 36 38.4 36H36.6C35.4 36 34.4 35.6 34 34.6L33 31.4C32.8 30.8 33 30.4 33.4 30.4Z', 'url(#lens)') +
          S('M22.2 30.4H41.8M31 31.4Q32 30.6 33 31.4', '#d9b25a', 0.8) + '<defs><linearGradient id="lens" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a6a8a"/><stop offset=".5" stop-color="#1a2a36"/><stop offset="1" stop-color="#d98a3a"/></linearGradient></defs>' +
          P('M24 31.2l3 0-1.4 2.2z', '#fff', ' opacity=".45"') },
      ayase: { f: 1, bg: '#40205e', light: '#e0b3ff', uni: '#3f4552', skin: '#f1cdb0', eye: '#4a2e22', brow: 'calm', mouth: 'smirk',
        backHair: P('M20.5 26C18.5 34 19.5 40 22 43L24.5 34Z', '#4a2e22') + P('M43.5 26C45.5 34 44.5 40 42 43L39.5 34Z', '#3a2219'),
        hair: P('M22.2 30C22 22.5 26 18.6 32 18.6S42 22.5 41.8 30C40.6 25.8 36.6 23.4 31 23.6C27.6 24.8 24.6 26.8 22.2 30Z', '#5a3a2a'),
        head: P('M17.5 21.5C18.5 15 25 11.5 33 12S46.5 16.5 46 21.5C44 23.5 38 24.4 31 24.2S19.5 23.6 17.5 21.5Z', '#7a2048') + P('M33 12C40 12.4 46.5 16.5 46 21.5C44 23.5 40 24.2 36 24.3C37.5 20 36.4 14.8 33 12Z', 'rgba(0,0,0,.28)') +
          '<circle cx="24.4" cy="18.6" r="2" fill="#f5b83d"/><circle cx="41.5" cy="12.6" r="1.6" fill="#7a2048"/>',
        acc: '<circle cx="27.6" cy="31.8" r="3.6" fill="rgba(200,230,255,.12)" stroke="#2a2a33" stroke-width="1"/><circle cx="36.6" cy="31.8" r="3.6" fill="rgba(200,230,255,.12)" stroke="#2a2a33" stroke-width="1"/>' + S('M31.2 31.6H33M24 31.2L21.6 30.4M40.2 31.2L42.4 30.4', '#2a2a33', 0.9) +
          P('M45.5 52.5H54V63H45.5Z', '#d9d2c0') + S('M47 55.5H52.6M47 58H52.6M47 60.5H50.5', '#8a8270', 0.7) }
    };
    // 敵将: 仮面・面頬で顔を隠し、目が光る
    var E = {
      ghost: { bg: '#3a0d0d', light: '#9fffb8', uni: '#2a2d2a', skin: '#b9b4a8', glow: '#b8ffcf',
        head: P('M17 33C16 18 23 10 32 10S48 18 47 33C45 26 41 21 32 20.5C23 21 19 26 17 33Z', '#2c2f2b'),
        acc: P('M21.5 26C24 22 40 22 42.5 26C44 33 42.5 41 37 45.5C35 47 29 47 27 45.5C21.5 41 20 33 21.5 26Z', '#3a3f36') + '<circle cx="27.2" cy="31.4" r="4.2" fill="#0d110e" stroke="#7a8270" stroke-width="1.2"/><circle cx="36.8" cy="31.4" r="4.2" fill="#0d110e" stroke="#7a8270" stroke-width="1.2"/>' +
          '<circle cx="27.2" cy="31.4" r="2.6" fill="#b8ffcf" opacity=".8"/><circle cx="36.8" cy="31.4" r="2.6" fill="#b8ffcf" opacity=".8"/><circle cx="27.2" cy="31.4" r="5" fill="#b8ffcf" opacity=".2"/><circle cx="36.8" cy="31.4" r="5" fill="#b8ffcf" opacity=".2"/>' +
          '<rect x="28" y="38" width="8" height="9" rx="2" fill="#2a2d27" stroke="#6a7060" stroke-width=".8"/>' + S('M29 40.5H35M29 43H35', '#55594e', 0.8) + '<ellipse cx="32" cy="50" rx="5.5" ry="3.4" fill="#4a4f44"/>' },
      wall: { bg: '#3d0f0f', light: '#ff8a7a', uni: '#3a3e44', skin: '#9aa2aa',
        head: P('M18 34C17 18 24 10 32 10S47 18 46 34L46 44C44 47 40 49 32 49S20 47 18 44Z', '#4d555c') + P('M32 10C40 10 47 18 46 34L46 44C44 47 40 49 37 49C39 40 40 22 32 10Z', 'rgba(0,0,0,.3)') +
          P('M20.5 30H43.5V33.6H20.5Z', '#0a0c0d') + P('M22 31H42V32.6H22Z', '#ff4d3d') + '<rect x="20" y="29" width="24" height="6" fill="#ff4d3d" opacity=".25"/>' + S('M24 38V45M28 38.5V46M32 38.8V46.5M36 38.5V46M40 38V45', '#2a3035', 1) +
          S('M22 18L42 18M20.5 24H43.5', '#5f686f', 0.8), collar: P('M14 50C20 46 44 46 50 50L52 57C44 54 20 54 12 57Z', '#545c63') },
      thunder: { bg: '#4a0d0d', light: '#ffd06a', uni: '#1f2227', skin: '#d9b294', eye: '#c03030', brow: 'stern', mouth: 'smirk', rank: 1,
        scar: 'M36.5 27L39.4 35.6M37.2 30.4L38.6 29.8',
        hair: P('M21.6 27C21.4 31 21.8 34 22.8 36.5L23.8 30Z', '#b9bcc2') + P('M42.4 27C42.6 31 42.2 34 41.2 36.5L40.2 30Z', '#a9adb3'),
        head: P('M17 20.5C17 14 24.5 9.6 32 9.6S47 14 47 20.5Z', '#121418') + P('M19 20.5H45V24.8H19Z', '#a8261f') + P('M18.2 24.8H45.8C45 28 40.6 29.4 32 29.4S19 28 18.2 24.8Z', '#050607') +
          P('M30.4 12.2L34.6 12.2 32.6 15.6 34.8 15.6 29.4 21.2 30.8 16.8 28.6 16.8Z', '#ffd06a'),
        acc: '<circle cx="36.6" cy="31.6" r="3.4" fill="none" stroke="#d9b25a" stroke-width=".9"/>' + S('M39.8 32.6Q42 38 40.6 44', '#d9b25a', 0.5) + P('M34.6 30.2l2.6-.6.6 1z', '#fff', ' opacity=".7"') },
      viper: { bg: '#123a12', light: '#9dff6a', uni: '#1f2a1c', skin: '#c8b08e', glow: '#9dff6a',
        head: P('M15 38C13 20 21 10 32 10S51 20 49 38C48 48 50 56 54 64H10C14 56 16 48 15 38Z', '#1f2a1c') + P('M32 10C43 10 51 20 49 38C48 48 50 56 54 64H40C44 50 42 22 32 10Z', 'rgba(0,0,0,.3)') +
          S('M22 16Q26 14 28 18Q30 22 34 20Q38 18 40 22', '#3a5a2a', 1.2) + S('M20 24Q24 22 26 26Q28 30 32 28', '#3a5a2a', 1),
        acc: P('M21.5 35C25 37 39 37 42.5 35C42.6 40.5 40 45 36 47C34 48 30 48 28 47C24 45 21.4 40.5 21.5 35Z', '#2a3626') + goggles(31.4, '#121812').replace(/#1a2630/g, '#0f2a0f') +
          '<circle cx="27" cy="31.4" r="2.2" fill="#9dff6a" opacity=".85"/><circle cx="37" cy="31.4" r="2.2" fill="#9dff6a" opacity=".85"/>' },
      witch: { f: 1, bg: '#3a0a1e', light: '#ff8ab0', uni: '#1a1418', skin: '#e9d2c6', glow: '#ff3b5c', mouth: 'smirk',
        backHair: P('M14 36C12 18 21 9 32 9S52 18 50 36C49 48 52 56 56 64H8C12 56 15 48 14 36Z', '#d9dde3') + P('M32 9C43 9 52 18 50 36C49 48 52 56 56 64H42C46 50 44 20 32 9Z', 'rgba(0,0,0,.2)'),
        hair: P('M22.2 30C22 21 26 16 32 16S42 21 41.8 30C40 24 36.6 20.6 32 20.6S24 24 22.2 30Z', '#eef0f3'),
        head: P('M17 26C18 15 24 9.4 32 9.4S46 15 47 26L45 24C42 18 38 15.4 32 15.4S22 18 19 24Z', '#120c10') + P('M22.2 33.8C26 34.6 38 34.6 41.8 33.8L41.8 36C38 36.8 26 36.8 22.2 36Z', '#120c10', ' opacity=".45"'),
        acc: S('M29.2 42.2Q32 43.4 35 41.8', '#8a1020', 1.4) },
      reaper: { bg: '#2a0a0a', light: '#ff4d4d', uni: '#151719', skin: '#1c1e20', glow: '#ff3030',
        head: helmet('#2a2e30', 1),
        acc: P('M22 30C22 23 26 20.4 32 20.4S42 23 42 30C42 37 40 42 36 45.6C34.4 46.8 29.6 46.8 28 45.6C24 42 22 37 22 30Z', '#16181a') +
          P('M24 30.4C24.6 28 26.6 27.4 28.6 28.2C30 29 30.4 31 29.8 32.6C29 34.2 26.6 34.6 25.2 33.6C24.2 32.8 23.8 31.6 24 30.4Z', '#e8e4da') + P('M40 30.4C39.4 28 37.4 27.4 35.4 28.2C34 29 33.6 31 34.2 32.6C35 34.2 37.4 34.6 38.8 33.6C39.8 32.8 40.2 31.6 40 30.4Z', '#e8e4da') +
          '<circle cx="27.2" cy="31" r="1.6" fill="#0a0a0a"/><circle cx="36.8" cy="31" r="1.6" fill="#0a0a0a"/><circle cx="27.2" cy="31" r=".7" fill="#ff3030"/><circle cx="36.8" cy="31" r=".7" fill="#ff3030"/>' +
          P('M30.6 34.6L32 37 33.4 34.6Z', '#e8e4da') + P('M27 39.6H37V43C35 44.6 29 44.6 27 43Z', '#e8e4da') + S('M29 39.6V43.8M31 39.6V44.3M33 39.6V44.3M35 39.6V43.8', '#16181a', 0.6) }
    };
    var cache = {};
    function hero(id) { var o = H[id]; if (!o) return ''; if (!cache[id]) { o.id = id; cache[id] = base(o); } return cache[id]; }
    function ecmd(k) { var o = E[k]; if (!o) return ''; var key = 'e-' + k; if (!cache[key]) { o.id = key; if (!o.eye) o.eye = '#300'; cache[key] = base(o); } return cache[key]; }
    return { hero: hero, ecmd: ecmd };
  })();
  function heroSvg(id) { return ART.has('h.' + id) ? ART.svg('h.' + id) : Portrait.hero(id); }
  function ecmdSvg(k) { return ART.has('e.' + k) ? ART.svg('e.' + k) : Portrait.ecmd(k); }
  // 指揮官が率いる部隊の強さの倍率(攻撃と耐久をならした値)
  function heroPow(id, lv, fav) { var h = TF.HERO[id]; return TF.heroMult(lv, fav, id) * Math.sqrt(h.atk * h.hp); }

