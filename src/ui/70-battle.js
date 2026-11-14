  // ====== 戦闘演出 ======
  // 広い戦場を斜め上から見下ろし、兵士の群れ(部隊)が前線をはさんで撃ち合う。
  // 指でなぞると見回し、2本指で拡大・縮小できる。
  // 勝敗とダメージは TF.createBattle が決め、ここはそれを再生・操作するだけ。
  var Battle = (function () {
    var wrap, cv, cx, W = 0, H = 0, DPR = 1;
    var B = null, raf = 0, lastTs = 0, bgCanvas = null, bgKey = '', SPR = null;
    var TROOP = { inf: 1500, at: 1200, tank: 800, art: 600 };   // ラベルに出す兵数(ステージが進むと増える)
    var FIGMAX = { inf: 54, at: 36, tank: 6, art: 5 };          // 描く兵士・車両の数
    var FIGSP = { inf: 1.85, at: 2.2, tank: 6.4, art: 7.0 };
    var FIGH = { inf: 2.8, at: 2.8, tank: 4.4, art: 4.2 };
    // 戦場の兵士・車両も描き下ろしの絵(部隊アイコンと同じ絵)で描く。大きさは戦場の単位(幅・高さ)
    var RAST = { inf: [4.4, 4.1], at: [5.5, 4.5], tank: [12, 6.9], art: [12.4, 6.2] };  // 描くときは FIGS 倍(歩兵で幅6.8・戦車で幅18.6ほど。家は幅6〜11)
    var HAS_RAST = ['inf', 'at', 'tank', 'art'].every(function (t) { return ART.has('u.' + t + '.1') && ART.has('u.' + t + '.2') && ART.has('u.' + t + '.3'); });
    if (HAS_RAST) {
      // 1部隊は歩兵10人・対戦車兵6組・戦車4両・砲兵3門
      FIGMAX = { inf: 10, at: 6, tank: 4, art: 3 };
      FIGSP = { inf: 5.5, at: 6.9, tank: 14.6, art: 15.2 };
      FIGH = { inf: RAST.inf[1], at: RAST.at[1], tank: RAST.tank[1], art: RAST.art[1] };
    }
    var UIMG = {};
    function uImg(k) {
      if (!ART.has(k)) return null;
      if (!UIMG[k]) { var im = new Image(); im.src = ART.url(k); UIMG[k] = im; }
      var m = UIMG[k];
      return m.complete && m.naturalWidth ? m : null;
    }
    if (HAS_RAST) ['inf', 'at', 'tank', 'art'].forEach(function (t) { [1, 2, 3].forEach(function (e) { uImg('u.' + t + '.' + e); }); });
    ['heli', 'air', 'drone'].forEach(function (k) { uImg('s.' + k); });  // 特殊ユニットの絵も先に読み込んでおく
    var FIGW = { inf: 1.8, at: 2.6, tank: 5.8, art: 6.2 };
    var FLIGHT = { inf: 0.18, at: 0.5, tank: 0.26, art: 0.78 };
    var TEAM = [
      { main: '#2fd6a6', dark: '#13806a', light: '#a6f7e2', rgb: '47,214,166', icon: '#0d5a4b' },
      { main: '#ff4a3d', dark: '#a3231b', light: '#ffa496', rgb: '255,74,61', icon: '#7a1812' }
    ];
    var BIOME = {
      snow: { near: '#e3eaef', far: '#cfd9e1', patch: 'rgba(160,178,196,.22)', furrow: 'rgba(120,140,160,.25)', road: '#a88a6c', roadE: '#86694f', tree: '#2c5a4a', tree2: '#3b7360', cap: '#f7fbff', rock: '#98a4ae', haze: '226,234,240', wall: '#c9c2b4', pond: '#86aec6', shore: '#eef3f6', roofs: ['#7a5a48', '#5f6873', '#6f4f6a'] },
      grass: { near: '#7fa65b', far: '#668c49', patch: 'rgba(40,70,20,.16)', furrow: 'rgba(30,55,15,.22)', road: '#b48e62', roadE: '#8c6a45', tree: '#2d6630', tree2: '#3f8840', cap: null, rock: '#8d9182', haze: '200,220,190', wall: '#d6ccb4', pond: '#5b8db0', shore: '#9cb87a', roofs: ['#8a4f36', '#5d6670', '#7a6a3a'] },
      desert: { near: '#e2c991', far: '#cdb077', patch: 'rgba(150,100,40,.15)', furrow: 'rgba(130,85,35,.2)', road: '#a77a4f', roadE: '#84603c', tree: '#6d7b3a', tree2: '#8a9a48', cap: null, rock: '#a88f6c', haze: '240,225,190', wall: '#d9c7a2', pond: '#5f9fae', shore: '#c9b67a', roofs: ['#b07a4a', '#9a8a6a', '#c49a5a'] }
    };
    function biomeOf(place) {
      if (/雪|霧|北部/.test(place)) return 'snow';
      if (/砂漠|赤土|火山|荒野/.test(place)) return 'desert';
      return 'grass';
    }

    // ---- 戦場の広さ ----
    // 7列の広大な戦場。両軍は奥行きのある地形の区画の奥(出撃線)から前線へ進んでくる。
    // 進む速さは地形で変わり(エンジンの到着時刻どおりに動く)、2本指の拡大・縮小で全体を見渡せる
    var CXW = 150, F0 = 150;                              // 戦場の中心(横)と、最初の前線(奥行き)
    var DS = 2;                                           // 奥行きの倍率
    function Yd(y) { return F0 + (y - F0) * DS; }         // もとの奥行きの座標を、深い戦場に合わせて伸ばす
    function X(x) { return (x - 100) * 1.6 + 150; }       // もとの幅200の座標を、広い戦場に合わせて伸ばす
    function WX(x) { return CXW + (x - CXW) * 1.35; }     // 5列のころの地図の横位置を、7列の地図に合わせる
    var MAP = { x0: -260, x1: 560, y0: -190, y1: 520 };   // 地面の広さ
    var LANES = [-18, 38, 94, 150, 206, 262, 318], LANEW = 56; // 部隊の列(7列)
    var LMID = 3, COLS = LANES;
    var ZOOM0 = 0.6;
    var ZFIT = 0.46;                                      // 部隊を全部入れるときも、これより引かない(兵士の絵が見える大きさ)                                     // ふだんの拡大率
    var ZOOMD = 0.27;                                     // 配置のときは戦場全体を見渡す
    var ZMIN = 0.15, ZMAX = 1.8;                          // 拡大・縮小の範囲(いちばん引くと戦場全体が見える)
    function laneOfX(x) { var b = 0; for (var i = 1; i < LANES.length; i++) if (Math.abs(x - LANES[i]) < Math.abs(x - LANES[b])) b = i; return b; }
    // 地形の区画(各列の自軍側・敵側)
    var ZONE = { hw: 26, p: [Yd(96), 146], e: [154, Yd(204)] };
    // 出撃線: 配置した部隊が待つ所(地形の区画の奥)。戦闘が始まると、ここから前線へ進む
    var START = { p: ZONE.p[0] + 10, e: ZONE.e[1] - 10 };
    // 地形マップの座標(横=列の番号、縦=-1 自軍の出撃線〜0 前線〜1 敵の出撃線)と戦場の座標の変換
    var HALF = F0 - START.p;
    function fxW(x) { return LANES[0] + x * LANEW; }
    function fyW(y) { return F0 + y * HALF; }
    function terrW(wx, wy) { return TF.terrAt(B.info.terrain, (wx - LANES[0]) / LANEW, (wy - F0) / HALF); }
    // 射撃位置(前線の少し手前)。配置の奥行き adv は、出撃線(0)から射撃位置(1)までのどこに置いたか
    var FIRE = { p: F0 - 10, e: F0 + 10 };
    function advToY(side, adv) { return side === 0 ? START.p + adv * (FIRE.p - START.p) : START.e - adv * (START.e - FIRE.e); }
    function yToAdv(y) { return (y - START.p) / (FIRE.p - START.p); }
    function xToLx(x) { return Math.max(0, Math.min(LANES.length - 1, (x - LANES[0]) / LANEW)); }
    // 自軍の配置エリア: 7列の幅いっぱい・出撃線の少し後ろから、自軍の陣地の中ほどまで(前に置くほど早く撃ち始める)
    var DEP = { x0: LANES[0] - LANEW / 2 + 6, x1: LANES[LANES.length - 1] + LANEW / 2 - 6, y0: advToY(0, TF.K.advMin), y1: advToY(0, TF.K.advMax) };
    function clampDep(x, y) { return { x: Math.max(DEP.x0, Math.min(DEP.x1, x)), y: Math.max(DEP.y0, Math.min(DEP.y1, y)) }; }

    // ---- カメラ(遠近つき・見回し・拡大縮小) ----
    var CAM = { x: CXW, y: F0 + 14, z: 1, th: 0.78, D: 215 };
    var SN = 0, CS = 0, KREF = 1, FP = 1, CY = 0;
    function setupProj() {
      SN = Math.sin(CAM.th); CS = Math.cos(CAM.th);
      KREF = W / 112;           // 拡大率1のとき、画面中央で横112マスが見える
      FP = CAM.D * KREF * CAM.z;
      CY = H * 0.54;
    }
    // 地面の点 → 画面(丘の上なら、その高さだけ上に)
    function proj(wx, wy) {
      var dy = wy - CAM.y, zc = CAM.D + dy * CS;
      if (zc < 30) zc = 30;
      var k = FP / zc, e = ELEV ? elevAt(wx, wy) : 0;
      return { x: W / 2 + (wx - CAM.x) * k, y: CY - dy * SN * k - e * k, k: k, s: k / KREF };
    }
    function projFlat(wx, wy) {
      var dy = wy - CAM.y, zc = CAM.D + dy * CS;
      if (zc < 30) zc = 30;
      var k = FP / zc;
      return { x: W / 2 + (wx - CAM.x) * k, y: CY - dy * SN * k, k: k, s: k / KREF };
    }
    // ---- 丘の高さ(地形マップの丘陵の区域から作る。部隊・木・前線も丘の上に乗る) ----
    var ELEV = null;
    // 丘の高さ: 狭いほうの半径の3割ほど(形のへこんだ所や画面の奥でも、奥の斜面がカメラから隠れない傾きに収まる)
    function hillH(b) { return Math.max(3.5, Math.min(16, 0.34 * Math.min(b.rx * LANEW, b.ry * HALF) * (1 - b.a1 - b.a2))); }
    function hillProf(q) { return q < 1 ? (1 - q) * (1 - q) : 0; }  // 中心からの距離(の2乗 q)→ 高さの割合。裾(q=1)と頂上(q=0)で傾きが0
    function hillLevel(b, v) { var q = 1 - Math.sqrt(Math.max(0, Math.min(1, v / hillH(b)))); return Math.sqrt(Math.max(0, q)); } // 高さ v の輪の大きさ
    function buildElev(TM) {
      ELEV = null;
      var hills = (TM && TM.blobs || []).filter(function (b) { return b.k === 'hill'; });
      if (!hills.length) return;
      var g = { x0: LANES[0] - LANEW * 1.6, y0: fyW(-1.7), step: 2 };
      g.nx = Math.ceil((LANES[LANES.length - 1] + LANEW * 1.6 - g.x0) / g.step) + 1;
      g.ny = Math.ceil((fyW(1.7) - g.y0) / g.step) + 1;
      var h = new Float32Array(g.nx * g.ny);
      for (var j = 0; j < g.ny; j++) {
        var fy = (g.y0 + j * g.step - F0) / HALF;
        for (var i = 0; i < g.nx; i++) {
          var lx = (g.x0 + i * g.step - LANES[0]) / LANEW, best = 0;
          for (var m = 0; m < hills.length; m++) {
            var b = hills[m], dx = (lx - b.x) / b.rx, dy = (fy - b.y) / b.ry, r2 = dx * dx + dy * dy;
            if (r2 > 1.75) continue;
            var R = TF.blobR(b, Math.atan2(dy, dx)), q = r2 / (R * R);
            if (q < 1) { var v = hillH(b) * hillProf(q); if (v > best) best = v; }
          }
          h[j * g.nx + i] = best;
        }
      }
      g.h = h; ELEV = g;
    }
    function elevAt(wx, wy) {
      var g = ELEV, fx = (wx - g.x0) / g.step, fy = (wy - g.y0) / g.step;
      if (fx < 0 || fy < 0 || fx >= g.nx - 1 || fy >= g.ny - 1) return 0;
      var i = fx | 0, j = fy | 0, ax = fx - i, ay = fy - j, n = g.nx, h = g.h, o = j * n + i;
      return (h[o] * (1 - ax) + h[o + 1] * ax) * (1 - ay) + (h[o + n] * (1 - ax) + h[o + n + 1] * ax) * ay;
    }
    // 画面上の点 → 平らな地面上の点(カメラの移動・地面の描画用)
    function unprojFlat(sx, sy) {
      var a = (CY - sy) / FP, den = SN - a * CS;
      if (den < 0.04) den = 0.04;
      var dy = a * CAM.D / den, zc = CAM.D + dy * CS;
      return { x: CAM.x + (sx - W / 2) * zc / FP, y: CAM.y + dy, zc: zc };
    }
    // 画面上の点 → 地面上の点(丘の上なら、その高さぶん手前の地点。指で触った場所そのもの)
    function unproj(sx, sy) {
      var w = unprojFlat(sx, sy);
      if (!ELEV) return w;
      for (var i = 0; i < 6; i++) {
        var e = elevAt(w.x, w.y);
        if (e <= 0 && i === 0) return w;
        var n = unprojFlat(sx, sy + e * FP / Math.max(30, w.zc));
        n.x = w.x + (n.x - w.x) * 0.7; n.y = w.y + (n.y - w.y) * 0.7; n.zc = w.zc + (n.zc - w.zc) * 0.7;
        if (Math.abs(n.y - w.y) < 0.05 && Math.abs(n.x - w.x) < 0.05) return n;
        w = n;
      }
      return w;
    }
    function clampCam() {
      CAM.z = Math.max(ZMIN, Math.min(ZMAX, CAM.z));
      setupProj();
      CAM.x = Math.max(-150, Math.min(450, CAM.x));
      CAM.y = Math.max(Yd(-10), Math.min(Yd(300), CAM.y));
    }

    function resize() {
      if (!wrap) return;
      var r = wrap.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      [cv, bgCanvas].forEach(function (c) {
        c.width = Math.round(W * DPR); c.height = Math.round(H * DPR);
        c.style.width = W + 'px'; c.style.height = H + 'px';
      });
      setupProj();
      bgKey = ''; SPR = null;
    }

    // ---- 小さな絵(兵士・戦車・砲)を先に描いておく ----
    function makeSprites() {
      var ppu = 7 * DPR;
      function sp(wu, hu, draw) {
        var c = document.createElement('canvas');
        c.width = Math.ceil(wu * ppu); c.height = Math.ceil(hu * ppu);
        var g = c.getContext('2d');
        g.scale(ppu, ppu); g.translate(wu / 2, hu);
        draw(g);
        return { c: c, w: wu, h: hu };
      }
      function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
      function soldier(g, T, at, side, tier) {
        g.fillStyle = 'rgba(0,0,0,.28)'; ell(g, 0, -0.12, 0.85, 0.3);
        g.fillStyle = T.dark; g.fillRect(-0.45, -1.1, 0.34, 1.05); g.fillRect(0.11, -1.1, 0.34, 1.05);
        g.fillStyle = T.main; g.fillRect(-0.6, -2.1, 1.2, 1.1);
        g.fillStyle = T.light; g.fillRect(-0.6, -2.1, 0.32, 1.1);
        if (side === 1) { g.fillStyle = '#f0c9a2'; ell(g, 0, -2.38, 0.36, 0.36); }
        g.fillStyle = T.dark; g.beginPath(); g.arc(0, -2.45, 0.46, Math.PI, 0); g.fill(); g.fillRect(-0.52, -2.5, 1.04, 0.14);
        if (at) {
          g.save(); g.translate(0.1, -2.15); g.rotate(-0.32);
          var tl = 2.1 + 0.12 * tier, tw = tier >= 4 ? 0.46 : 0.34;
          g.fillStyle = tier >= 4 ? '#3f4a3a' : '#4a4f45'; g.fillRect(-1.1, -tw / 2, tl, tw);
          g.fillStyle = tier === 2 ? '#6b7a4a' : T.light; g.fillRect(-1.1 + tl - 0.2, -0.22, 0.32, 0.44);
          if (tier === 2) { g.fillStyle = '#6b7a4a'; g.fillRect(0.1, -0.75, 0.12, 1.5); }
          if (tier >= 5) { g.fillStyle = '#2b3329'; g.fillRect(0.2, 0.17, 0.5, 0.35); }
          g.restore();
        } else {
          g.strokeStyle = '#2b2b26'; g.lineWidth = 0.16;
          g.beginPath(); g.moveTo(0.48, -1.7); g.lineTo(0.75, -2.75); g.stroke();
        }
      }
      function tank(g, T, side, tier) {
        g.fillStyle = 'rgba(0,0,0,.28)'; ell(g, 0, -0.35, 2.9, 0.9);
        g.fillStyle = '#2d302a'; g.fillRect(-2.7, -3.7, 1.0, 3.5); g.fillRect(1.7, -3.7, 1.0, 3.5);
        g.fillStyle = T.dark; g.fillRect(-1.85, -3.9, 3.7, 3.7);
        g.fillStyle = T.main; g.fillRect(-1.75, -3.95, 3.5, 2.6);
        g.fillStyle = T.light; g.fillRect(-1.75, -3.95, 3.5, 0.45);
        // 砲身の長さ・太さと砲塔の形は、開発した主砲で変わる(1: 丸い砲塔の短砲身 … 6: くさび形の大口径砲)
        var bl = 1.7 + 0.32 * tier, bw = tier >= 6 ? 0.5 : tier === 2 ? 0.44 : 0.38, boxy = tier === 2 || tier >= 4;
        if (side === 0) { g.fillStyle = '#2d302a'; g.fillRect(-bw / 2, -2.2 - bl, bw, bl); if (tier === 2) g.fillRect(-0.32, -2.3 - bl, 0.64, 0.34); if (tier >= 3) { g.fillStyle = '#23261f'; g.fillRect(-bw / 2 - 0.06, -2.2 - bl * 0.6, bw + 0.12, 0.3); } }
        if (boxy) {
          g.fillStyle = T.dark; g.fillRect(-1.25, -3.35, 2.5, 1.85);
          g.fillStyle = T.main; g.fillRect(-1.1, -3.5, 2.2, 1.6);
          if (tier >= 5) { g.beginPath(); g.moveTo(-1.1, -1.9); g.lineTo(0, -1.3); g.lineTo(1.1, -1.9); g.fill(); }
          g.fillStyle = T.light; g.fillRect(-1.1, -3.5, 2.2, 0.32);
          if (tier >= 6) { g.fillStyle = '#2d302a'; g.fillRect(0.35, -3.95, 0.5, 0.45); }
        } else {
          g.fillStyle = T.dark; ell(g, 0, -2.45, 1.15, 0.95);
          g.fillStyle = T.main; ell(g, 0, -2.6, 0.95, 0.75);
          g.fillStyle = T.light; ell(g, -0.25, -2.8, 0.35, 0.25);
        }
        if (side === 1) { g.fillStyle = '#2d302a'; g.fillRect(-bw / 2, -2.4, bw, 2.4); g.fillStyle = '#111'; g.fillRect(-bw / 2 - 0.02, -0.15, bw + 0.04, 0.2); }
      }
      function gun(g, T, side, tier) {
        g.fillStyle = 'rgba(0,0,0,.28)'; ell(g, 0, -0.35, 3.0, 0.8);
        if (tier >= 6) {
          // 多連装ロケット(M270 / ハイマース): 車体の上に発射機の箱
          g.fillStyle = '#2d302a'; g.fillRect(-2.3, -1.2, 4.6, 1.0);
          g.fillStyle = T.dark; g.fillRect(-2.1, -2.0, 4.2, 1.2);
          g.fillStyle = T.main; g.fillRect(-1.7, -3.6, 3.4, 1.8);
          g.fillStyle = T.light; g.fillRect(-1.7, -3.6, 3.4, 0.34);
          g.fillStyle = '#23261f';
          for (var ry = 0; ry < 2; ry++) for (var rx = 0; rx < 3; rx++) { g.beginPath(); g.arc(-1.1 + rx * 1.1, (side === 0 ? -3.0 : -2.3) + ry * 0.55, 0.2, 0, Math.PI * 2); g.fill(); }
          return;
        }
        g.strokeStyle = '#3a3a33'; g.lineWidth = 0.35;
        g.beginPath(); g.moveTo(-0.5, -1.1); g.lineTo(-2.4, -0.2); g.moveTo(0.5, -1.1); g.lineTo(2.4, -0.2); g.stroke();
        g.fillStyle = '#2d302a'; ell(g, -1.75, -1.0, 0.75, 0.9); ell(g, 1.75, -1.0, 0.75, 0.9);
        g.fillStyle = '#777'; ell(g, -1.75, -1.0, 0.25, 0.3); ell(g, 1.75, -1.0, 0.25, 0.3);
        g.save(); g.translate(0, -2.0); g.rotate(side === 0 ? -0.55 : 0.55);
        var gl = 2.3 + 0.28 * tier; g.fillStyle = '#34372f'; g.fillRect(-0.28, -gl + 0.2, 0.56, gl); if (tier >= 4) g.fillRect(-0.4, -gl + 0.1, 0.8, 0.4);
        g.restore();
        g.fillStyle = T.main; g.fillRect(-1.3, -2.6, 2.6, 1.5);
        g.fillStyle = T.light; g.fillRect(-1.3, -2.6, 2.6, 0.35);
      }
      // 味方は開発した武器、敵はステージの年代で見た目が変わる
      function tierOf(side, t) { return side === 0 ? Math.max(1, armTierOf(t, 'w')) : eraTier(B ? B.info.s : 1); }
      SPR = [0, 1].map(function (side) {
        var T = TEAM[side];
        return {
          inf: sp(FIGW.inf, FIGH.inf, function (g) { soldier(g, T, false, side, tierOf(side, 'inf')); }),
          at: sp(FIGW.at, FIGH.at, function (g) { soldier(g, T, true, side, Math.min(6, tierOf(side, 'at'))); }),
          tank: sp(FIGW.tank, FIGH.tank + 1.6, function (g) { tank(g, T, side, Math.min(6, tierOf(side, 'tank'))); }),
          art: sp(FIGW.art, FIGH.art, function (g) { gun(g, T, side, Math.min(7, tierOf(side, 'art'))); }),
          fallen: sp(2.6, 0.9, function (g) {
            g.globalAlpha = 0.8; g.fillStyle = 'rgba(0,0,0,.2)'; ell(g, 0, -0.3, 1.2, 0.3);
            g.fillStyle = T.dark; g.fillRect(-1.0, -0.6, 1.6, 0.5); g.beginPath(); g.arc(0.85, -0.38, 0.32, 0, Math.PI * 2); g.fill();
          }),
          wreck: sp(5.8, 3.0, function (g) {
            g.fillStyle = 'rgba(20,18,15,.45)'; ell(g, 0, -0.5, 2.9, 0.9);
            g.fillStyle = '#3b3833'; g.fillRect(-1.9, -2.6, 3.8, 2.1);
            g.fillStyle = '#26241f'; ell(g, 0.2, -2.0, 1.0, 0.7);
            g.fillStyle = shade(T.dark, -0.5); g.fillRect(-1.9, -2.6, 3.8, 0.4);
          })
        };
      });
      if (HAS_RAST) {
        var miss = false;
        [0, 1].forEach(function (side) {
          ['inf', 'at', 'tank', 'art'].forEach(function (t) {
            var im = uImg('u.' + t + '.' + artEra(tierOf(side, t)));
            if (!im) { miss = true; return; }
            var wu = RAST[t][0], hu = RAST[t][1], c = document.createElement('canvas'), RS = 1.6;
            c.width = Math.ceil(wu * ppu * RS); c.height = Math.ceil(hu * ppu * RS);
            var g = c.getContext('2d'), pad = 0.08 * c.height;
            var sc = Math.min((c.width - pad * 2) / im.width, (c.height - pad) / im.height), w = im.width * sc, h = im.height * sc;
            g.save();
            if (side === 1) { g.translate(c.width, 0); g.scale(-1, 1); }
            g.shadowColor = side === 0 ? 'rgba(56,217,176,.95)' : 'rgba(255,77,77,.95)'; g.shadowBlur = Math.max(2, 0.1 * ppu * RS);
            g.drawImage(im, (c.width - w) / 2, c.height - h, w, h);
            g.restore();
            SPR[side][t] = { c: c, w: wu, h: hu };
          });
        });
        SPR.retry = miss;  // 絵の読み込みが済んでいなければ、あとで作り直す
      }
    }

    // ---- 戦場の地図を作る(地面は真上から見た絵、木や家は立てて描く) ----
    var TEXPPU = 3;
    function makeMap() {
      var bio = BIOME[B.biome], rnd = TF.rngFrom(1000 + B.info.s * 31);
      var tw = Math.round((MAP.x1 - MAP.x0) * TEXPPU), th = Math.round((MAP.y1 - MAP.y0) * TEXPPU);
      var c = document.createElement('canvas');
      c.width = tw; c.height = th;
      var g = c.getContext('2d');
      // 世界座標で描けるよう変換(奥=上)
      g.setTransform(TEXPPU, 0, 0, -TEXPPU, -MAP.x0 * TEXPPU, MAP.y1 * TEXPPU);
      g.fillStyle = bio.near; g.fillRect(MAP.x0, MAP.y0, MAP.x1 - MAP.x0, MAP.y1 - MAP.y0);
      var i, j, x, y;
      for (i = 0; i < 200; i++) {
        g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '0,0,0' : '255,250,230') + ',' + (0.03 + rnd() * 0.04) + ')';
        g.beginPath(); g.ellipse(MAP.x0 + rnd() * (MAP.x1 - MAP.x0), MAP.y0 + rnd() * (MAP.y1 - MAP.y0), 8 + rnd() * 40, 5 + rnd() * 24, rnd() * 3, 0, Math.PI * 2); g.fill();
      }
      // 畑・区画
      for (i = 0; i < 170; i++) {
        var fx = MAP.x0 + rnd() * (MAP.x1 - MAP.x0), fy = MAP.y0 + rnd() * (MAP.y1 - MAP.y0), fw = 14 + rnd() * 26, fd = 9 + rnd() * 18, rot = (rnd() - 0.5) * 0.7;
        g.save(); g.translate(fx, fy); g.rotate(rot);
        g.fillStyle = bio.patch; g.fillRect(-fw / 2, -fd / 2, fw, fd);
        if (rnd() < 0.7) {
          g.strokeStyle = bio.furrow; g.lineWidth = 0.32; g.beginPath();
          for (j = -fd / 2 + 1.3; j < fd / 2 - 0.4; j += 1.4) { g.moveTo(-fw / 2 + 0.8, j); g.lineTo(fw / 2 - 0.8, j); }
          g.stroke();
        }
        g.restore();
      }
      // 池
      var ponds = [[WX(rnd() < 0.5 ? -14 : 314), Yd(225 + rnd() * 30)], [WX(rnd() < 0.5 ? -20 : 320), Yd(120 + rnd() * 30)], [WX(rnd() < 0.5 ? -60 : 360), Yd(60 + rnd() * 40)], [WX(rnd() < 0.5 ? -50 : 350), Yd(290 + rnd() * 30)]];
      ponds.forEach(function (p) {
        g.fillStyle = bio.shore; g.beginPath(); g.ellipse(p[0], p[1], 13, 8, 0.3, 0, Math.PI * 2); g.fill();
        g.fillStyle = bio.pond; g.beginPath(); g.ellipse(p[0], p[1], 11, 6.4, 0.3, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.ellipse(p[0] - 3, p[1] + 1.5, 4, 1.4, 0.3, 0, Math.PI * 2); g.fill();
      });
      // 道: 敵陣から自陣への本道(曲がり方はステージごとに違う)と、0〜2本の横道
      var MV = B.mapv, ph = MV.ph;
      function mainX(yy) {
        var t = Math.max(0, Math.min(1, (yy - Yd(32)) / (Yd(268) - Yd(32)))), e = t * t * (3 - 2 * t);
        return MV.px + (MV.ex - MV.px) * e + Math.sin(yy * 0.012 + ph) * MV.amp * Math.sin(Math.PI * t);
      }
      var yR1 = Yd(115 + rnd() * 30), yR2 = Yd(190 + rnd() * 35);
      function crossY(xx, base, k) { return base + Math.sin(xx * 0.03 + ph * k) * 9; }
      function road(pts, wid) {
        g.lineCap = 'round'; g.lineJoin = 'round';
        [[bio.roadE, wid * 1.3], [bio.road, wid]].forEach(function (stl) {
          g.strokeStyle = stl[0]; g.lineWidth = stl[1];
          g.beginPath(); pts.forEach(function (p, k) { if (k) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.stroke();
        });
      }
      var r1 = [], r2 = [], r3 = [];
      for (y = MAP.y0; y <= MAP.y1; y += 3) r1.push([mainX(y), y]);
      for (x = MAP.x0; x <= MAP.x1; x += 3) { r2.push([x, crossY(x, yR1, 1)]); r3.push([x, crossY(x, yR2, 2)]); }
      if (MV.cross >= 1) road(r2, 3.2);
      if (MV.cross >= 2) road(r3, 3.2);
      road(r1, 4.2);
      // 両軍の陣地(踏み固められた広場)
      [[MV.px, Yd(32)], [MV.ex, Yd(268)]].forEach(function (p) {
        g.fillStyle = shade(bio.road, 0.25); g.globalAlpha = 0.55;
        g.beginPath(); g.ellipse(p[0], p[1], 100, 40, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      });
      // 砲撃の跡
      for (i = 0; i < 40; i++) {
        var kx = LANES[0] - 10 + rnd() * (LANES[6] - LANES[0] + 20), ky = Yd(115 + rnd() * 75), kr = 1.5 + rnd() * 2.5;
        g.fillStyle = 'rgba(40,30,20,.35)'; g.beginPath(); g.ellipse(kx, ky, kr, kr * 0.8, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(255,240,210,.18)'; g.lineWidth = 0.5; g.beginPath(); g.ellipse(kx, ky, kr + 0.6, kr * 0.8 + 0.5, 0, 0, Math.PI * 2); g.stroke();
      }
      function onRoad(xx, yy, m) {
        m = m || 4.5;
        if (Math.abs(xx - mainX(yy)) < m) return true;
        return (MV.cross >= 1 && Math.abs(yy - crossY(xx, yR1, 1)) < m) || (MV.cross >= 2 && Math.abs(yy - crossY(xx, yR2, 2)) < m);
      }
      // 立てて描くもの: 木・岩・家
      var props = [];
      function occupied(xx, yy) {
        if (Math.abs(xx - MV.px) < 160 && yy > Yd(12) && yy < Yd(50)) return true;    // 自軍陣地
        if (Math.abs(xx - MV.ex) < 160 && yy > Yd(248) && yy < Yd(292)) return true;  // 敵陣地
        if (xx > LANES[0] - 40 && xx < LANES[LANES.length - 1] + 40 && yy > fyW(-1.3) && yy < fyW(1.3)) return true; // 戦場の地形は区域どおりに描く
        return false;
      }
      // 林: 両脇に多く、奥と手前にも
      for (i = 0; i < 64; i++) {
        var side = rnd();
        var ccx = side < 0.4 ? WX(-120 + rnd() * 100) : side < 0.8 ? WX(320 + rnd() * 100) : MAP.x0 + rnd() * (MAP.x1 - MAP.x0);
        var ccy = side < 0.8 ? MAP.y0 + 10 + rnd() * (MAP.y1 - MAP.y0 - 20) : (rnd() < 0.5 ? Yd(290 + rnd() * 40) : Yd(-15 + rnd() * 30));
        var nT = 5 + Math.floor(rnd() * 9);
        for (j = 0; j < nT; j++) {
          var tx = ccx + (rnd() - 0.5) * 22, ty = ccy + (rnd() - 0.5) * 16;
          if (onRoad(tx, ty) || occupied(tx, ty)) continue;
          props.push({ k: rnd() < (B.biome === 'desert' ? 0.6 : 0.07) ? 'rock' : 'tree', x: tx, y: ty, s: 0.75 + rnd() * 0.6 });
        }
      }
      // 地形の区域(戦闘の計算とまったく同じ形): 森林・市街地・丘陵・湿地。区域の外は平原。後の区域が上に重なる
      var TM = B.info.terrain;
      buildElev(TM);
      B.hills = (TM && TM.blobs || []).filter(function (b) { return b.k === 'hill'; }).map(function (b) { return { k: 'hill', b: b, x: fxW(b.x), y: fyW(b.y + b.ry * 1.3) }; });
      function blobPath(b, sc) {
        g.beginPath();
        for (var a = 0; a <= 72; a++) {
          var th = a / 72 * Math.PI * 2, R = TF.blobR(b, th) * (sc || 1);
          var px = fxW(b.x + b.rx * R * Math.cos(th)), py = fyW(b.y + b.ry * R * Math.sin(th));
          if (a) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.closePath();
      }
      // 区域の中で、その地形が見えている(後の区域に覆われていない)点に物を置く
      function scatter(b, n, fn) {
        var bx = fxW(b.x), by = fyW(b.y), rxw = b.rx * LANEW * 1.3, ryw = b.ry * HALF * 1.3;
        for (var i = 0; i < n * 4 && n > 0; i++) {
          var px = bx + (rnd() * 2 - 1) * rxw, py = by + (rnd() * 2 - 1) * ryw;
          if (!TF.inBlob(b, (px - LANES[0]) / LANEW, (py - F0) / HALF) || terrW(px, py) !== b.k) continue;
          fn(px, py); n--;
        }
      }
      if (TM && TM.blobs) TM.blobs.forEach(function (b) {
        var area = Math.PI * b.rx * LANEW * b.ry * HALF, k2;
        if (b.k === 'forest') {
          g.fillStyle = shade(bio.near, -0.2); blobPath(b, 1.03); g.fill();
          g.fillStyle = shade(bio.near, -0.28); blobPath(b, 0.75); g.fill();
          scatter(b, Math.round(area / 34), function (px, py) { props.push({ k: 'tree', x: px, y: py, s: 0.9 + rnd() * 0.7 }); });
        } else if (b.k === 'urban') {
          g.fillStyle = shade(bio.road, 0.2); blobPath(b); g.fill();
          g.save(); blobPath(b); g.clip();
          var gx0 = fxW(b.x - b.rx * 1.4), gx1 = fxW(b.x + b.rx * 1.4), gy0 = fyW(b.y - b.ry * 1.4), gy1 = fyW(b.y + b.ry * 1.4), gx, gy;
          g.strokeStyle = shade(bio.road, -0.18); g.lineWidth = 1.8; g.beginPath();
          for (gx = gx0; gx <= gx1; gx += 17) { g.moveTo(gx, gy0); g.lineTo(gx, gy1); }
          for (gy = gy0; gy <= gy1; gy += 15) { g.moveTo(gx0, gy); g.lineTo(gx1, gy); }
          g.stroke(); g.restore();
          for (gx = gx0; gx < gx1; gx += 17) for (gy = gy0; gy < gy1; gy += 15) {
            var hx = gx + 8.5, hy = gy + 7.5;
            if (!TF.inBlob(b, (hx - LANES[0]) / LANEW, (hy - F0) / HALF) || terrW(hx, hy) !== 'urban' || rnd() < 0.12) continue;
            // 中心ほど高い建物(ビル)が多い
            var cen = 1 - Math.min(1, Math.hypot((hx - fxW(b.x)) / (b.rx * LANEW), (hy - fyW(b.y)) / (b.ry * HALF))), tall = rnd() < 0.15 + 0.5 * cen;
            props.push({ k: 'house', x: hx + (rnd() - 0.5) * 2, y: hy + (rnd() - 0.5) * 2, w: 7 + rnd() * 4, d: 5.5 + rnd() * 3, h: tall ? 8 + rnd() * 7 * (0.5 + cen) : 3.5 + rnd() * 3, roof: bio.roofs[Math.floor(rnd() * 3)], gable: !tall && B.biome !== 'desert', roofType: tall ? 'flat' : undefined });
          }
        } else if (b.k === 'hill') {
          [[1.0, 0.08], [0.78, 0.15], [0.56, 0.22], [0.34, 0.29]].forEach(function (q) {
            g.fillStyle = shade(bio.near, q[1]); blobPath(b, q[0]); g.fill();
            g.strokeStyle = shade(bio.near, -0.22); g.lineWidth = 0.4; g.stroke();
          });
          scatter(b, Math.round(area / 500) + 2, function (px, py) { props.push({ k: 'rock', x: px, y: py, s: 0.6 + rnd() * 0.4 }); });
        } else if (b.k === 'marsh') {
          g.fillStyle = shade(bio.near, -0.14); blobPath(b, 1.02); g.fill();
          g.fillStyle = 'rgba(70,90,60,.25)'; blobPath(b, 0.7); g.fill();
          scatter(b, Math.round(area / 45), function (mx2, my2) {
            g.fillStyle = bio.pond; g.globalAlpha = 0.75; g.beginPath(); g.ellipse(mx2, my2, 2.5 + rnd() * 4, 1.4 + rnd() * 2, rnd() * 3, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
            g.strokeStyle = shade(bio.tree2, -0.1); g.lineWidth = 0.4; g.beginPath(); for (var rr2 = 0; rr2 < 3; rr2++) { g.moveTo(mx2 + 3 + rr2, my2); g.lineTo(mx2 + 3.4 + rr2, my2 + 2.2); } g.stroke();
          });
        }
      });
      // 村(戦場の脇に家が数軒)
      [[-30, 150], [330, 158], [-14, 238], [314, 100], [-50, 60], [350, 250], [-60, 300], [360, 20]].forEach(function (v, vi) {
        v = [WX(v[0]), Yd(v[1])];
        var n = 3 + Math.floor(rnd() * 3);
        g.fillStyle = shade(bio.road, 0.2); g.globalAlpha = 0.45;
        g.beginPath(); g.ellipse(v[0], v[1], 16, 12, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
        for (j = 0; j < n; j++) {
          props.push({ k: 'house', x: v[0] + (rnd() - 0.5) * 22, y: v[1] + (rnd() - 0.5) * 16, w: 6 + rnd() * 3, d: 5 + rnd() * 2, h: 3.5 + rnd() * 1.5, roof: bio.roofs[Math.floor(rnd() * 3)], gable: B.biome !== 'desert' });
        }
      });
      B.tex = { c: c, w: tw, h: th };
      B.props = props;
    }

    // ---- 地面を写す(視点が動いたときだけ描き直す) ----
    function drawGround() {
      B.bgDraws = (B.bgDraws || 0) + 1;
      var g = bgCanvas.getContext('2d');
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      var bio = BIOME[B.biome], T = B.tex;
      g.fillStyle = bio.far; g.fillRect(0, 0, W, H);
      // 地図の奥の端より向こうは、空と遠くの山なみ(地平線のある景色に)
      var hy = projFlat(CAM.x, MAP.y1).y;
      if (hy > 0) {
        var sky = g.createLinearGradient(0, 0, 0, hy);
        sky.addColorStop(0, '#1b2731'); sky.addColorStop(0.65, 'rgb(' + bio.haze + ')'); sky.addColorStop(1, shade(bio.far, 0.25));
        g.fillStyle = sky; g.fillRect(0, 0, W, hy + 1);
        [[0.5, 0.06, 0.6, '#5f7480'], [0.28, 0.035, 1.3, shade(bio.far, -0.05)]].forEach(function (L, li) {
          g.fillStyle = L[3]; g.globalAlpha = li ? 0.9 : 0.55; g.beginPath(); g.moveTo(0, hy + 1);
          for (var x = 0; x <= W; x += 6) {
            var wx = (x - W / 2) / FP * 600 + CAM.x * 0.3;
            g.lineTo(x, hy - H * L[1] * (0.55 + 0.45 * Math.sin(wx * 0.011 * L[2] + li * 2) * Math.sin(wx * 0.027 * L[2] + 1.7 + li)) - H * L[1] * 0.4);
          }
          g.lineTo(W, hy + 1); g.closePath(); g.fill(); g.globalAlpha = 1;
        });
      }
      g.imageSmoothingEnabled = true;
      var band = 3;
      for (var sy = 0; sy < H; sy += band) {
        var top = unprojFlat(W / 2, sy), bot = unprojFlat(W / 2, sy + band), mid = unprojFlat(W / 2, sy + band / 2);
        var half = (W / 2) * mid.zc / FP;
        var x0 = (mid.x - half - MAP.x0) * TEXPPU, x1 = (mid.x + half - MAP.x0) * TEXPPU;
        var y0 = (MAP.y1 - top.y) * TEXPPU, y1 = (MAP.y1 - bot.y) * TEXPPU;
        if (y1 <= y0) continue;
        var cx0 = Math.max(0, x0), cx1 = Math.min(T.w, x1), cy0 = Math.max(0, y0), cy1 = Math.min(T.h, y1);
        if (cx1 <= cx0 || cy1 <= cy0) continue;
        var dx0 = (cx0 - x0) / (x1 - x0) * W, dx1 = (cx1 - x0) / (x1 - x0) * W;
        var dy0 = sy + (cy0 - y0) / (y1 - y0) * band, dy1 = sy + (cy1 - y0) / (y1 - y0) * band;
        g.drawImage(T.c, cx0, cy0, cx1 - cx0, cy1 - cy0, dx0, dy0, dx1 - dx0, dy1 - dy0 + 0.6);
      }
      // 木・岩・家・建物を奥から順に
      // 丘(立体)・木・岩・家・建物を奥から順に。丘は奥の端の位置で並べ、丘の上と手前の物は丘のあとに描く
      var items = B.props.concat(B.blds, B.hills || []);
      items.sort(function (a, b) { return b.y - a.y; });
      items.forEach(function (it) {
        if (it.k === 'hill') { drawHill(g, it.b, bio); return; }
        var p = proj(it.x, it.y);
        if (p.y < -30 || p.y > H + 80 || p.x < -80 || p.x > W + 80) return;
        if (it.k === 'tree' || it.k === 'rock') drawProp(g, it, p, bio);
        else drawBuilding(g, it);
      });
      var hz = g.createLinearGradient(0, 0, 0, H * 0.48);
      hz.addColorStop(0, 'rgba(' + bio.haze + ',.78)'); hz.addColorStop(0.35, 'rgba(' + bio.haze + ',.32)'); hz.addColorStop(1, 'rgba(' + bio.haze + ',0)');
      g.fillStyle = hz; g.fillRect(0, 0, W, H * 0.48);
      var vg = g.createRadialGradient(W / 2, H * 0.55, Math.min(W, H) * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.25)');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
    // 丘: 高さごとの輪を下から積み重ねて立体に描く(左上から光が当たり、右下に影)
    function drawHill(g, b, bio) {
      var H0 = hillH(b), N = 12, a, th, R, i;
      function ring(s, v, ox, oy) {
        var pts = [], x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (a = 0; a <= 40; a++) {
          th = a / 40 * Math.PI * 2; R = TF.blobR(b, th) * s;
          var p = projFlat(fxW(b.x + b.rx * R * Math.cos(th)) + (ox || 0), fyW(b.y + b.ry * R * Math.sin(th)) + (oy || 0));
          p.y -= v * p.k;
          pts.push(p); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
        }
        return { pts: pts, x0: x0, x1: x1, y0: y0, y1: y1 };
      }
      function path(r) { g.beginPath(); r.pts.forEach(function (p, k) { if (k) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.closePath(); }
      var base = ring(1, 0);
      if (base.x1 < -40 || base.x0 > W + 40 || base.y1 < -40 || base.y0 > H + 80) return;
      // 地面に落ちる影
      path(ring(1.04, 0, H0 * 0.8, -H0 * 0.4)); g.fillStyle = 'rgba(0,0,0,.24)'; g.fill();
      for (i = 0; i < N; i++) {
        var v = H0 * i / N, s = hillLevel(b, v);
        if (s < 0.05) break;
        var r = ring(s, v);
        // 左上から光: 輪ごとに、左上は明るく・右下は暗く。上の輪ほど少し明るい
        var c0 = shade(bio.near, 0.02 + 0.16 * i / N), gr = g.createLinearGradient(r.x0, r.y0, r.x1, r.y1);
        gr.addColorStop(0, shade(c0, 0.3)); gr.addColorStop(0.45, c0); gr.addColorStop(1, shade(c0, -0.34));
        path(r); g.fillStyle = gr; g.fill();
        if (i === 0) { g.strokeStyle = 'rgba(30,36,22,.28)'; g.lineWidth = 1; g.stroke(); }
        else if (i % 3 === 0) { g.strokeStyle = 'rgba(40,50,30,.08)'; g.lineWidth = 0.7; g.stroke(); }
      }
    }
    function drawProp(g, it, p, bio) {
      var sz = it.s * p.k;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.ellipse(p.x + sz * 0.6, p.y, sz * 2.6, sz * 0.9, 0, 0, Math.PI * 2); g.fill();
      if (it.k === 'rock') {
        g.fillStyle = bio.rock; g.beginPath(); g.ellipse(p.x, p.y - sz * 0.6, sz * 2.2, sz * 1.3, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(p.x - sz * 0.6, p.y - sz * 1.1, sz * 0.9, sz * 0.5, 0, 0, Math.PI * 2); g.fill();
        return;
      }
      g.fillStyle = '#4b3a2a'; g.fillRect(p.x - sz * 0.25, p.y - sz * 1.2, sz * 0.5, sz * 1.2);
      for (var L = 0; L < 3; L++) {
        var by = p.y - sz * (1.0 + L * 1.7), hw = sz * (2.2 - L * 0.55), hh = sz * 2.6;
        var tc = L % 2 ? bio.tree2 : bio.tree;
        g.fillStyle = shade(tc, 0.12); g.beginPath(); g.moveTo(p.x - hw, by); g.lineTo(p.x + hw * 0.15, by); g.lineTo(p.x, by - hh); g.closePath(); g.fill();
        g.fillStyle = shade(tc, -0.3); g.beginPath(); g.moveTo(p.x + hw * 0.15, by); g.lineTo(p.x + hw, by); g.lineTo(p.x, by - hh); g.closePath(); g.fill();
        if (bio.cap) { g.fillStyle = bio.cap; g.beginPath(); g.moveTo(p.x - hw * 0.45, by - hh * 0.55); g.lineTo(p.x + hw * 0.45, by - hh * 0.55); g.lineTo(p.x, by - hh); g.closePath(); g.fill(); }
      }
    }
    function poly(g, pts, fill) { g.beginPath(); pts.forEach(function (p, i) { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.closePath(); g.fillStyle = fill; g.fill(); }
    // 箱形の建物。owner があれば軍の色の屋根、なければ民家
    function drawBuilding(g, b) {
      var bio = BIOME[B.biome];
      if (b.ruin) {
        // がれき
        var c0 = proj(b.x, b.y), kk = c0.k;
        g.fillStyle = 'rgba(30,24,18,.45)'; g.beginPath(); g.ellipse(c0.x, c0.y, (b.w * 0.7 + 1) * kk, (b.d * 0.45 + 0.6) * kk, 0, 0, Math.PI * 2); g.fill();
        var rr0 = TF.rngFrom(Math.round(b.x * 13 + b.y * 7));
        for (var ri = 0; ri < 7; ri++) {
          var rx = c0.x + (rr0() - 0.5) * b.w * kk, ry = c0.y + (rr0() - 0.5) * b.d * 0.5 * kk, rs = (0.8 + rr0() * 1.4) * kk;
          g.fillStyle = ri % 3 ? shade(bio.wall, -0.35) : (b.owner === undefined ? b.roof : TEAM[b.owner].dark);
          g.beginPath(); g.moveTo(rx - rs, ry); g.lineTo(rx - rs * 0.3, ry - rs * 1.1); g.lineTo(rx + rs, ry - rs * 0.4); g.lineTo(rx + rs * 0.6, ry + rs * 0.2); g.closePath(); g.fill();
        }
        g.strokeStyle = '#3a2c20'; g.lineWidth = Math.max(1, 0.35 * kk);
        g.beginPath(); g.moveTo(c0.x - b.w * 0.3 * kk, c0.y - 0.5 * kk); g.lineTo(c0.x + b.w * 0.2 * kk, c0.y - 2.2 * kk); g.stroke();
        return;
      }
      var roofMain = b.owner === undefined ? b.roof : TEAM[b.owner].main, roofDark = b.owner === undefined ? shade(b.roof, -0.3) : TEAM[b.owner].dark;
      var gp = [proj(b.x - b.w / 2, b.y - b.d / 2), proj(b.x + b.w / 2, b.y - b.d / 2), proj(b.x + b.w / 2, b.y + b.d / 2), proj(b.x - b.w / 2, b.y + b.d / 2)];
      function up(p, h, k) { return { x: p.x, y: p.y - h * (k || p.k) }; }
      var t = gp.map(function (p) { return up(p, b.h); });
      g.fillStyle = 'rgba(0,0,0,.2)';
      g.beginPath(); g.ellipse((gp[0].x + gp[1].x) / 2 + 4, (gp[0].y + gp[2].y) / 2 + 2, Math.abs(gp[1].x - gp[0].x) * 0.65, Math.abs(gp[0].y - gp[2].y) * 0.8 + 2, 0, 0, Math.PI * 2); g.fill();
      var wall = b.hq ? shade(bio.wall, -0.1) : bio.wall;
      var camx = CAM.x;
      if (b.x < camx) poly(g, [gp[1], gp[2], t[2], t[1]], shade(wall, -0.25)); else poly(g, [gp[0], gp[3], t[3], t[0]], shade(wall, -0.25));
      poly(g, [gp[0], gp[1], t[1], t[0]], wall);
      g.fillStyle = shade(wall, -0.5);
      var dx = (gp[1].x - gp[0].x), dy = (gp[1].y - gp[0].y), nW = Math.max(1, Math.round(b.w / 4));
      for (var i = 1; i <= nW; i++) { var wxp = gp[0].x + dx * i / (nW + 1), wyp = gp[0].y + dy * i / (nW + 1); g.fillRect(wxp - 0.8 * gp[0].k, wyp - b.h * gp[0].k * 0.7, 1.6 * gp[0].k, b.h * gp[0].k * 0.28); }
      if (b.gable !== false && b.roofType !== 'flat') {
        var rh = b.h * 0.6;
        var r0 = up({ x: (t[0].x + t[3].x) / 2, y: (t[0].y + t[3].y) / 2, k: (gp[0].k + gp[3].k) / 2 }, rh);
        var r1 = up({ x: (t[1].x + t[2].x) / 2, y: (t[1].y + t[2].y) / 2, k: (gp[1].k + gp[2].k) / 2 }, rh);
        poly(g, [r0, r1, t[2], t[3]], roofDark);
        poly(g, [t[0], t[1], r1, r0], roofMain);
        if (bio.cap) { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = Math.max(1, 0.5 * gp[0].k); g.beginPath(); g.moveTo(r0.x, r0.y); g.lineTo(r1.x, r1.y); g.stroke(); }
      } else {
        poly(g, t, roofMain);
        poly(g, [t[0], t[1], { x: t[1].x, y: t[1].y + 2 }, { x: t[0].x, y: t[0].y + 2 }], roofDark);
      }
      if (b.hq) {
        var fp = { x: (t[0].x + t[1].x + t[2].x + t[3].x) / 4, y: (t[0].y + t[1].y + t[2].y + t[3].y) / 4 };
        var ph = 9 * gp[0].k;
        g.strokeStyle = '#ddd'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(fp.x, fp.y); g.lineTo(fp.x, fp.y - ph); g.stroke();
        g.fillStyle = roofMain; g.beginPath(); g.moveTo(fp.x, fp.y - ph); g.lineTo(fp.x + 3.2 * gp[0].k, fp.y - ph + 1); g.lineTo(fp.x, fp.y - ph + 2); g.closePath(); g.fill();
      }
    }

    // ---- 開始 ----
    function play(prep, seed, speed, auto, cb, opts) {
      opts = opts || {};
      wrap = $('bwrap'); cv = $('bcv'); cx = cv.getContext('2d'); bgCanvas = $('bbg');
      $('battle').classList.remove('hidden');
      bindInput();
      var eng = TF.createBattle(prep.p, prep.e, seed, { record: true, auto: auto, reserves: prep.reserves, posts: prep.posts, terrain: prep.terrain });
      B = {
        eng: eng, auto: auto, sel: null, drag: null, pan: null, pinch: null, ptrs: {}, hint: null, userCam: false,
        units: [], ev: eng.ev, ei: 0, clock: 0, res: null, info: prep.info, speed: speed, cb: cb,
        biome: biomeOf(prep.info.place), seed: prep.info.s * 131,
        projs: [], imps: [], parts: [], texts: [], marks: [], pillars: [], beams: [], sights: [], air: [], supKey: null,
        banner: null, shake: 0, buff: [{ atk: -1, arm: -1 }, { atk: -1, arm: -1 }], ewarn: null, jamUntil: -1,
        phase: opts.deploy ? 'deploy' : 'intro', introT: 0, ending: 0, endT: 0, front: F0, colOff: LANES.map(function () { return 0; }), wave: 0, camTY: F0 + 14,
        prep: prep, seedB: seed, onDeploy: opts.onDeploy || null
      };
      // 地図の見た目もステージごとに変える: 両軍の陣地の横の位置・道の曲がり方・横道の数
      (function () {
        var r = TF.rngFrom(B.info.s * 7 + 5);
        B.mapv = { px: CXW + (r() - 0.5) * 120, ex: CXW + (r() - 0.5) * 170, amp: 8 + r() * 30, ph: r() * 6, cross: Math.floor(r() * 3), hx: (r() - 0.5) * 90, hk: r() };
      })();
      SPR = null; // 武装の見た目を反映し直す
      prep.p.forEach(function (q, i) { B.units.push(mkSquad(q, 0, i, B.units.length)); });
      prep.e.forEach(function (q, i) { B.units.push(mkSquad(q, 1, i, B.units.length)); });
      // 帯に出す顔を先に読み込んでおく
      B.units.forEach(function (u) { if (u.hero) portraitImg('h:' + u.hero); if (u.ecmd) portraitImg('e:' + u.ecmd); });
      B.blds = [
        { k: 'bld', x: X(100), y: Yd(279), w: 18, d: 10, h: 8, owner: 1, home: 1, hq: true, roofType: 'flat' },
        { k: 'bld', x: X(66), y: Yd(263), w: 13, d: 8, h: 5, owner: 1, home: 1 },
        { k: 'bld', x: X(134), y: Yd(265), w: 13, d: 8, h: 5, owner: 1, home: 1 },
        { k: 'bld', x: X(100), y: Yd(252), w: 9, d: 6, h: 3, owner: 1, home: 1, roofType: 'flat' },
        { k: 'bld', x: X(46), y: Yd(278), w: 8, d: 6, h: 4, owner: 1, home: 1 },
        { k: 'bld', x: X(154), y: Yd(276), w: 8, d: 6, h: 4, owner: 1, home: 1 },
        { k: 'bld', x: X(100), y: Yd(24), w: 18, d: 10, h: 8, owner: 0, home: 0, hq: true, roofType: 'flat' },
        { k: 'bld', x: X(64), y: Yd(38), w: 13, d: 8, h: 5, owner: 0, home: 0 },
        { k: 'bld', x: X(136), y: Yd(36), w: 13, d: 8, h: 5, owner: 0, home: 0 },
        { k: 'bld', x: X(44), y: Yd(22), w: 8, d: 6, h: 4, owner: 0, home: 0 },
        { k: 'bld', x: X(156), y: Yd(24), w: 8, d: 6, h: 4, owner: 0, home: 0 }
      ];
      B.blds.forEach(function (b) { b.x += (b.owner === 0 ? B.mapv.px : B.mapv.ex) - CXW; });
      B.walls = []; // マップ全体で戦うので、前線の土のうの壁はない
      // 敵の部隊の後ろの家と見張り塔(近くで爆発が続くと壊れる)
      [[52, 186, 7, 6, 4], [148, 189, 7, 6, 4], [80, 194, 8, 6, 4.5], [122, 192, 7, 6, 4], [100, 222, 4, 4, 11, 'tower'], [38, 204, 7, 5, 4], [162, 207, 8, 6, 4.5]].forEach(function (h, i) {
        if (i !== 4 && ((i * 37 + B.info.s * 11) % 7) < 2) return; // 家の数も毎回少し違う
        B.blds.push({ k: 'bld', x: X(h[0]) + B.mapv.hx * (h[5] === 'tower' ? 0.5 : 1), y: Yd(h[1] + 18), w: h[2], d: h[3], h: h[4], owner: 1, home: 1, fragile: true, hp: 2.0, roofType: h[5] === 'tower' ? 'flat' : undefined, tower: h[5] === 'tower' });
      });
      // 戦場の拠点(旗)。前線のどちら側にあるかで色が変わる。場所はステージごとに違う
      B.posts = (B.info.terrain && B.info.terrain.posts || TF.POST_POS).map(function (p) { return { x: fxW(p.x), y: fyW(p.y), owner: p.y < 0 ? 0 : 1, flipT: -9 }; });
      CAM.x = CXW; CAM.y = Yd(128); CAM.z = 0.22; // 最初は戦場全体を引きで見せ、前線へ寄っていく
      if (B.phase === 'deploy') { CAM.y = CAMD.y; CAM.z = ZOOMD; }
      setSpeed(speed);
      buildSkillBar();
      setAutoUI();
      resize();
      makeMap();
      layout(B.phase === 'deploy');
      $('camReset').classList.add('hidden');
      if (B.phase === 'deploy') startDeploy();
      B.defs = prep.reserves.p.defs; B.lanePref = null;
      buildCardBar();
      if (B.phase === 'deploy') $('cardBar').classList.add('hidden');
      else if (st.flags && st.flags.skipDeploy) showHint('配置は省略中(出撃画面の「配置」で戻せます)', 3.5);
      else if (!auto) showHint('敵へドラッグで集中攻撃/空き地へドラッグで移動(別の列へも)/カードで増援', 5);
      else if (!(st.flags && st.flags.camHint)) { showHint('なぞると戦場を見回せます(2本指で拡大・縮小)', 4); st.flags = st.flags || {}; st.flags.camHint = 1; }
      lastTs = 0;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
    }
    function mkSquad(q, side, slot, id) {
      var t = q.type, boss = q.boss;
      var n = Math.round(FIGMAX[t] * (boss ? 1.5 : 1));
      var sp = FIGSP[t];
      var cols = (t === 'tank' || t === 'art') ? Math.min(n, 3) : Math.ceil(Math.sqrt(n * 3.4));
      if (HAS_RAST) cols = t === 'inf' ? 4 : t === 'at' ? 3 : 2;  // 大きな絵は、となりの部隊と重ならない幅に並べる
      var rows = Math.ceil(n / cols);
      var rnd = TF.rngFrom(id * 7919 + 3);
      var figs = [];
      for (var i = 0; i < n; i++) {
        var c = i % cols, r = Math.floor(i / cols);
        var inRow = r === rows - 1 ? n - r * cols : cols;
        figs.push({
          ox: (c - (inRow - 1) / 2) * sp + (rnd() - 0.5) * sp * 0.3,
          oy: (r - (rows - 1) / 2) * sp * 0.85 + (rnd() - 0.5) * sp * 0.3,
          alive: true, ph: rnd() * 6.28, fire: -1
        });
      }
      figs.sort(function (a, b) { return b.oy - a.oy; });
      var farOy = Math.max.apply(null, figs.map(function (f) { return f.oy; }));
      return {
        id: id, side: side, slot: slot, type: t, maxHp: q.maxHp, hp: q.maxHp, hero: q.hero, boss: boss, ecmd: q.ecmd || null,
        troop: Math.round(TROOP[t] * (1 + B.info.s / 40) * (boss ? 2 : 1) / 50) * 50, figs: figs, farOy: farOy, big: boss && (t === 'tank' || t === 'art') ? 1.35 : 1,
        wx: CXW, wy: 0, col: CXW, row: 0, jx: 0, jy: 0, moving: false, hitT: -9, dead: false, colF: 0, aim: null, aimT: -9
      };
    }
    // 部隊の列(エンジンの列番号。なければ中央)
    function laneOfUnit(u) { var e = B.eng && B.eng.U[u.id]; return e && e.lane !== null && e.lane !== undefined ? e.lane : u.lane0 !== undefined ? u.lane0 : LMID; }
    // 列の中での並び: 同じ列の部隊は横に並び、3部隊目からは後ろの段
    // (自由に置いた部隊はその場所のまま)
    function placeInLanes(side, onlyCol) {
      var list = B.units.filter(function (u) { return u.side === side && !u.dead && !u.free; }), by = {};
      list.forEach(function (u) { var L = laneOfUnit(u); (by[L] = by[L] || []).push(u); });
      list.forEach(function (u) {
        var L = laneOfUnit(u), grp = by[L], j = grp.indexOf(u), k = grp.length;
        var row = j < 2 ? 0 : 1, inRow = row === 0 ? Math.min(2, k) : k - 2, jj = row === 0 ? j : j - 2;
        u.col = LANES[L] + (jj - (inRow - 1) / 2) * 20;
        u.homeCol = u.col;
        if (u.side === 0 && B.phase === 'deploy' || u.homeY === undefined) u.homeY = advToY(side, TF.K.advDef) + (side === 0 ? -1 : 1) * row * 12;
      });
      frontRows(side);
    }
    // 前線での並び: すぐ横(18以内)により前に置いた部隊がいれば、その後ろの段に付く
    function frontRows(side) {
      var list = B.units.filter(function (u) { return u.side === side && !u.dead; });
      list.forEach(function (u) {
        var r = 0, fu = side === 0 ? u.homeY : -u.homeY;
        list.forEach(function (v) {
          if (v === u || Math.abs(v.col - u.col) >= 18) return;
          var fv = side === 0 ? v.homeY : -v.homeY;
          if (fv > fu + 0.01 || (Math.abs(fv - fu) <= 0.01 && v.id < u.id)) r++;
        });
        u.row = Math.min(2, r);
      });
    }
    function layout(deploy) {
      [0, 1].forEach(function (side) {
        placeInLanes(side);
        B.units.filter(function (u) { return u.side === side; }).forEach(function (u, i) {
          var r = TF.rngFrom(B.seed + u.id * 97);
          u.jx = (r() - 0.5) * 6; u.jy = (r() - 0.5) * 3;
          u.wx = u.col + u.jx;
          // 両軍とも、配置した場所(出撃線)から始まる
          u.wy = u.homeY;
          B.pillars.push({ wx: u.wx, wy: u.wy, side: side, t: 0.15 * (i + side * 0.5), big: 1 });
        });
      });
    }
    function setSpeed(sp) {
      if (B) B.speed = sp;
      Array.prototype.forEach.call(document.querySelectorAll('#speedSel button'), function (b) { b.classList.toggle('on', +b.dataset.sp === sp); });
    }
    function skip() {
      if (!B || B.ending) return;
      if (B.phase === 'deploy') deployGo();
      B.phase = 'fight';
      B.eng.setAuto(true, B.clock);
      B.eng.step(Infinity); // 残りは自動で決着
      while (B.ei < B.ev.length) applyEventInstant(B.ev[B.ei++]);
      B.imps.forEach(function (im) { im.quiet = true; applyImpact(im); });
      B.imps = []; B.projs = []; B.beams = []; B.sights = [];
      B.clock = Math.max(B.clock, B.eng.time());
      startEnding();
    }
    function applyEventInstant(ev) {
      if (ev.k === 'spawn') { spawnVisual(ev); return; }
      if (ev.k === 'lane') { laneMoveVisual(ev, true); return; }
      if (ev.k === 'refl') { applyImpact({ d: ev.d, dmg: ev.dmg, kill: ev.kill, quiet: true }); return; }
      if (ev.k === 'eskWarn' || ev.k === 'eskCast') { ecmdEvent(ev, true); return; }
      if (ev.k === 'skill' && ev.heals) { ev.heals.forEach(function (h) { var hu = B.units[h.d]; if (hu) { hu.hp = Math.min(hu.maxHp, hu.hp + h.heal); reviveFigs(hu); } }); return; }
      if (ev.k === 'post') { postEvent(ev, true); return; }
      if (ev.k === 'atk') { if (!ev.miss) applyImpact({ d: ev.d, dmg: ev.dmg, kill: ev.kill, quiet: true }); }
      else if (ev.hits) ev.hits.forEach(function (h) { applyImpact({ d: h.d, dmg: h.dmg, kill: h.kill, quiet: true }); });
    }
    function startEnding() {
      B.res = B.eng.result(); B.ending = 1; B.endT = 0; B.drag = null; B.sel = null; B.pan = null; B.pinch = null;
      B.userCam = false; $('camReset').classList.add('hidden');
    }
    function fxNow() { return B.introT + B.clock + B.endT; }
    // 索敵: 敵の部隊は、自軍のどれかの部隊の索敵範囲に入るまで見えない(撃ってくると位置がばれる)。
    // 配置中は見えない。決着したら残りの敵も見せる。見つけた瞬間に「発見!」
    function updateVis(dt) {
      B.units.forEach(function (u) {
        if (u.side !== 1) return;
        var v = B.ending ? true : B.phase !== 'fight' ? false : u.dead ? u.vis : B.eng.seen(0, u.id, B.clock);
        if (v && !u.vis && !u.dead && B.phase === 'fight' && !B.ending) {
          var eu0 = B.eng.U[u.id], ep0 = B.eng.pos(u.id, B.clock);
          if (eu0 && eu0.role === 'flank' && ep0 && ep0.y < 0 && !B.flankSaid) { B.flankSaid = true; showHint('敵が側面から回り込んできた! 後衛(砲兵)に注意', 2.6); }
          var nt = B.noteT || (B.noteT = {});
          if (!(nt.spot > B.clock - 0.25)) { nt.spot = B.clock; text(u.wx, u.wy, '発見!', '#ffd27a', 13, 38); }
          part(u.wx, u.wy, { life: 0.5, r: 7, c: 'ring' });
        }
        u.vis = v;
        u.visA = Math.max(0, Math.min(1, (u.visA || 0) + (v ? 1 : -1) * dt * 5));
      });
    }
    function hiddenFoe(u) { return u.side === 1 && !(u.visA > 0.02); }
    // 部隊が戦う場所の地形の効果(攻撃・守り)を、部隊の上に出す
    function terrNote(u) {
      var ep = B.eng.pos(u.id);
      if (!B.info.terrain || !ep) return;
      var k = TF.terrAt(B.info.terrain, ep.x, ep.y);
      var a = TF.terrAtk(k, u.type), tk = TF.terrTake(k, u.type), parts = [];
      if (a !== 1) parts.push('攻' + (a > 1 ? '+' : '') + Math.round((a - 1) * 100) + '%');
      if (tk !== 1) parts.push(tk < 1 ? '守+' + Math.round((1 - tk) * 100) + '%' : '被ダメ+' + Math.round((tk - 1) * 100) + '%');
      if (!parts.length) return;
      // 同じ地形・同じ効果の部隊が続けて着いたら、ひとことは1回だけ
      var key = k + parts.join(''), nt = B.noteT || (B.noteT = {});
      if (nt[key] !== undefined && B.clock - nt[key] < 1.5) return;
      nt[key] = B.clock;
      text(u.wx, u.wy, TF.TERRAIN[k].name + ' ' + parts.join(' '), a / tk >= 1 ? '#bfffc8' : '#ffb3a8', 12, 40);
    }
    function frame(ts) {
      if (!B) return;
      var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
      lastTs = ts;
      update(dt);
      if (!B) return;
      draw();
      if (B.ending && B.endT > (B.res.win ? 2.2 : 2.6)) { finish(); return; }
      raf = requestAnimationFrame(frame);
    }
    function finish() {
      var cb = B.cb, res = B.res;
      B = null;
      $('battle').classList.add('hidden');
      cb(res);
    }

    // ---- 前線 ----
    function sideFrac(side) {
      var h = 0, m = 0;
      B.units.forEach(function (u) { if (u.side === side) { h += u.hp; m += u.maxHp; } });
      return m ? h / m : 0;
    }
    function frontAt(x) {
      var o = B.colOff, v;
      var nL = LANES.length;
      if (x <= LANES[0]) v = o[0];
      else if (x >= LANES[nL - 1]) v = o[nL - 1];
      else { var li = Math.min(nL - 2, Math.floor((x - LANES[0]) / LANEW)), t = (x - LANES[li]) / LANEW; v = o[li] + (o[li + 1] - o[li]) * (1 - Math.cos(t * Math.PI)) / 2; }
      return B.front + v + Math.sin(x * 0.09 + B.wave) * 2 + Math.sin(x * 0.031 + 1.3) * 4;
    }
    function updateFront(gdt, rdt) {
      var a = sideFrac(0), e = sideFrac(1), cdt = B.ending ? rdt : gdt;
      if (B.ending) {
        // 勝ったときはその場で止まる(敵陣への進軍はしない)。負けたときは押し戻される
        if (!B.res.win) {
          var d = Yd(75) - B.front, step = Math.max(Math.abs(d) * Math.min(1, rdt * 1.3), Math.min(Math.abs(d), 45 * rdt));
          B.front += d > 0 ? step : -step;
        }
      } else {
        // 前線は拠点を占領するたびに進む(戦闘の計算と同じ位置)。兵力の差で少し揺れる
        var pi = B.eng.postInfo ? B.eng.postInfo() : null;
        var t2 = fyW(pi ? TF.frontY(pi.front) : 0) + 10 * (a - e) + (B.buff[0].atk > B.clock ? 4 : 0) - (B.buff[1].atk > B.clock ? 4 : 0);
        B.front += (t2 - B.front) * Math.min(1, gdt * 1.4);
      }
      B.wave += cdt * 0.5;
      COLS.forEach(function (xc, c) {
        var ah = 0, am = 0, eh = 0, em = 0;
        B.units.forEach(function (u) {
          if (Math.abs(u.col - xc) < LANEW / 2) { if (u.side === 0) { ah += u.hp; am += u.maxHp; } else { eh += u.hp; em += u.maxHp; } }
        });
        if (B.ending && B.res.win) return;
        var t = B.ending ? 0 : 14 * ((am ? ah / am : a) - (em ? eh / em : e));
        B.colOff[c] += (t - B.colOff[c]) * Math.min(1, cdt * 1.2);
      });
      // 前線が押し上がると、敵の土のうの壁が崩れる
      B.walls.forEach(function (w) {
        if (w.ok && frontAt(w.x) > w.y + 3) { w.ok = false; part(w.x, w.y, { vy: -12, life: 0.6, r: 1.6, c: 'dust' }); }
      });
    }
    // 近くに重なった部隊は、見た目だけ少し離して描く
    function separate(dt) {
      var al = B.units.filter(function (u) { return !u.dead; }), i, j;
      al.forEach(function (u) { u.pushX = 0; u.pushY = 0; });
      for (i = 0; i < al.length; i++) for (j = i + 1; j < al.length; j++) {
        var a = al[i], b = al[j], dx = a.wx - b.wx, dy = (a.wy - b.wy) * 1.6, d = Math.hypot(dx, dy);
        if (d >= 15) continue;
        var f = (15 - d) / 15 * 9, nx = d > 0.01 ? dx / d : (a.id < b.id ? 1 : -1), ny = d > 0.01 ? dy / d : 0;
        a.pushX += nx * f; b.pushX -= nx * f; a.pushY += ny * f * 0.5; b.pushY -= ny * f * 0.5;
      }
      var k = Math.min(1, dt * 3);
      al.forEach(function (u) {
        u.sepX = Math.max(-18, Math.min(18, (u.sepX || 0) + (u.pushX - (u.sepX || 0) * 0.15) * k));
        u.sepY = Math.max(-10, Math.min(10, (u.sepY || 0) + (u.pushY - (u.sepY || 0) * 0.15) * k));
      });
    }
    // 見せたい部隊の奥行きの真ん中(自軍と、見えている敵)
    function camCenterY() {
      var sum = 0, n = 0;
      B.units.forEach(function (u) { if (u.dead || (u.side === 1 && !u.vis)) return; sum += u.wy; n++; });
      return n ? sum / n : F0;
    }
    // ---- カメラの追従 ----
    var CAMD = { y: DEP.y1 + 18 }; // 配置のときの視点(下は配置の操作パネルに隠れるので、自軍の出撃線を画面の中ほどに)
    function updateCam(rdt) {
      if (B.userCam) return;
      // 部隊をなぞっている間と、指を離してすぐは視点を動かさない(狙った場所がずれないように)
      if (B.phase !== 'deploy' && (B.drag || (B.camHold && performance.now() < B.camHold))) return;
      var cyT = camCenterY() + 10;
      if (B.ending) B.camTY = cyT;
      else if (Math.abs(cyT - B.camTY) > 14) B.camTY = cyT; // 部隊が大きく動いたときだけ追う
      var k = Math.min(1, rdt * (B.ending ? 2.4 : B.phase === 'intro' ? (B.introT < 0.9 ? 0.35 : 1.3) : 1.6));
      var ty = Math.max(Yd(40), Math.min(Yd(300), B.camTY)), z0 = ZOOM0, tx = CXW;
      if (B.phase === 'deploy') { ty = CAMD.y; z0 = ZOOMD; k = Math.min(1, rdt * 3); }
      else if (B.phase === 'intro' && B.introT < 0.9) z0 = 0.22;
      else if (!B.ending) {
        // 両軍の部隊が横に全部入るように引く(端の列の部隊が画面の外に出ないように)。
        // 部隊が前線へ進んでいる間は、もう少し引いて見る。
        // (視点が動き続けると地面の描き直しが増えるので、拡大率と横の位置はとびとびの値にする)
        var far = 0, x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        B.units.forEach(function (u) { if (u.dead || (u.side === 1 && !u.vis)) return; x0 = Math.min(x0, u.wx); x1 = Math.max(x1, u.wx); y0 = Math.min(y0, u.wy); y1 = Math.max(y1, u.wy); });
        if (x1 >= x0) {
          var span = Math.max(x1 - x0 + 70, (y1 - y0 + 50) * 1.6), zf = Math.floor(Math.max(ZFIT, Math.min(ZOOM0, 104 / span)) * 25) / 25;
          z0 = Math.min(ZOOM0, zf);
          tx = CXW + Math.round(Math.max(-90, Math.min(90, (x0 + x1) / 2 - CXW)) / 15) * 15;
        }
        if (far > 40) z0 = Math.min(z0, ZOOM0 * 0.72);
      }
      // 目に見えないほど近づいたら止める(地面の描き直しを減らす)
      CAM.x = Math.abs(tx - CAM.x) < 0.08 ? tx : CAM.x + (tx - CAM.x) * k;
      CAM.y = Math.abs(ty - CAM.y) < 0.08 ? ty : CAM.y + (ty - CAM.y) * k;
      CAM.z = Math.abs(z0 - CAM.z) < 0.0015 ? z0 : CAM.z + (z0 - CAM.z) * k;
      setupProj();
    }

    // ---- 更新 ----
    function update(dtReal) {
      var sp = B.speed, gdt = dtReal * sp, fxdt = dtReal * Math.sqrt(sp);
      if (B.phase === 'deploy') {
        // 配置中: 時間は進めない
      } else if (B.phase === 'intro') {
        B.introT += gdt;
        if (B.introT > 2.4) { B.phase = 'fight'; B.units.forEach(function (u) { if (u.side === 0 && !u.dead && u.type === 'art') { u.noted = true; terrNote(u); } }); }
      } else if (!B.ending) {
        B.clock += gdt;
        B.eng.step(B.clock);
        while (B.ei < B.ev.length) fire(B.ev[B.ei++]);
        for (var i = B.imps.length - 1; i >= 0; i--) {
          if (B.imps[i].at <= B.clock) { applyImpact(B.imps[i]); B.imps.splice(i, 1); }
        }
        if (B.eng.isDone() && !B.imps.length && B.clock >= B.eng.time() + 0.5) startEnding();
      } else {
        B.endT += dtReal;
      }
      updateVis(dtReal);
      updateFront(B.ending ? 0 : gdt, dtReal);
      separate(dtReal);
      updateCam(dtReal);
      B.units.forEach(function (u) {
        if (u.dead) return;
        var eu = B.eng.U[u.id];
        // 配置中にドラッグしている部隊は指に付いてくる
        if (B.phase === 'deploy' && B.drag && B.drag.deploy && B.drag.moved && B.drag.u === u) {
          var dp = clampDep(unproj(B.drag.x, B.drag.y).x, unproj(B.drag.x, B.drag.y).y);
          u.wx = dp.x; u.wy = dp.y; u.moving = true;
          return;
        }
        // 配置中の自軍は置いた場所。それ以外はエンジンの位置(マップ全体を動き、出会った所で戦う)
        var ep = B.phase === 'deploy' && u.side === 0 ? null : B.eng.pos(u.id, B.phase === 'fight' ? B.clock : 0), tx, ty;
        if (ep) { tx = fxW(ep.x) + u.jx + (u.sepX || 0); ty = fyW(ep.y) + u.jy + (u.sepY || 0); }
        else { tx = u.col + u.jx; ty = (u.homeY !== undefined ? u.homeY : advToY(u.side, 0)) + u.jy; }
        u.march = !!(ep && ep.moving && B.phase === 'fight' && !B.ending);
        u.dest = ep && ep.goal && u.side === 0 ? { x: fxW(ep.goal.x), y: fyW(ep.goal.y) } : null;
        // 止まって戦い始めたら、その場所の地形の効果をひとこと(1回だけ)
        if (u.side === 0 && u.wasMarch && !u.march && B.phase === 'fight' && !B.ending && !u.noted) { u.noted = true; terrNote(u); }
        u.wasMarch = u.march;
        var dx = tx - u.wx, dy = ty - u.wy, d = Math.hypot(dx, dy), kf = Math.min(1, dtReal * (B.phase === 'fight' ? 12 : 8));
        if (d > 0.01) { u.wx += dx * kf; u.wy += dy * kf; }
        u.moving = u.march || d > 0.8;
        // 前進中は土ぼこりを上げる
        if (u.march && u.moving && Math.random() < (u.type === 'tank' ? 0.5 : 0.22) * Math.min(1, gdt * 60)) puff(u.wx + (Math.random() - 0.5) * 10, u.wy - (u.side === 0 ? 3 : -3));
      });
      // 壊れた家は、しばらく燃えて煙を上げる
      B.blds.forEach(function (b) {
        if (b.ruin && fxNow() - b.ruinT < 9 && Math.random() < 0.35 * Math.min(1, B.speed)) {
          var fx = b.x + (Math.random() - 0.5) * b.w, fy = b.y + (Math.random() - 0.5) * b.d;
          if (Math.random() < 0.5) part(fx, fy, { vx: (Math.random() - 0.5) * 6, vy: -16 - Math.random() * 10, life: 0.6, r: 0.9, c: 'fire' });
          else part(fx, fy, { vx: 3, vy: -18, life: 1.6, r: 1.6, c: 'smoke' });
        }
      });
      B.projs = B.projs.filter(function (p) { return B.clock < p.t1 + 0.02; });
      B.beams = B.beams.filter(function (b) { b.life -= fxdt; return b.life > 0; });
      B.sights = B.sights.filter(function (m) { return B.clock < m.until; });
      B.pillars = B.pillars.filter(function (p) { return fxNow() - p.t < 1.3; });
      B.parts = B.parts.filter(function (p) {
        p.life -= fxdt; p.ox += p.vx * fxdt; p.oy += p.vy * fxdt; p.vy += (p.g || 0) * fxdt; p.vx *= 1 - 2 * fxdt;
        return p.life > 0;
      });
      if (B.parts.length > 340) B.parts.splice(0, B.parts.length - 340);
      if (B.marks.length > 320) B.marks.splice(0, B.marks.length - 320);
      B.texts = B.texts.filter(function (t) { t.life -= dtReal; t.rise += 30 * dtReal; return t.life > 0; });
      B.shake = Math.max(0, B.shake - dtReal * 30);
      if (B.banner) { B.banner.t += dtReal; if (B.banner.t > 1.2) B.banner = null; }
      if (B.hint) { B.hint.t += dtReal; if (B.hint.t > B.hint.dur) B.hint = null; }
      updateSkillBar();
      updateCardBar(); updateSupBar();
      B.projs.forEach(function (p) {
        if ((p.kind === 'at' && Math.random() < 0.7) || p.kind === 'rocket') {
          var wk = (B.clock - p.t0) / (p.t1 - p.t0);
          if (wk < 0 || wk > 1) return;
          var wx = p.x0 + (p.x1 - p.x0) * wk, wy = p.y0 + (p.y1 - p.y0) * wk;
          part(wx, wy, { oy: -liftOf(p, wk) * proj(wx, wy).k, vx: (Math.random() - 0.5) * 8, vy: -4, life: p.kind === 'rocket' ? 1.1 : 0.5, r: (p.kind === 'rocket' ? 1.3 : 0.7) + Math.random() * 0.5, c: 'smoke' });
        }
      });
    }
    function aliveFigs(u) { return u.figs.filter(function (f) { return f.alive; }); }
    var FIGS = 1.55, FIGD = 1.3; // 兵士・車両の見た目の大きさと、部隊の中の間隔
    function figPos(u, f) {
      var c = u.colF || 0;
      return { x: u.wx + f.ox * u.big * FIGD * (1 - 0.72 * c), y: u.wy + f.oy * u.big * FIGD * (1 + 1.8 * c) };
    }
    function figWorld(u) {
      var a = aliveFigs(u);
      var f = a.length ? a[Math.floor(Math.random() * a.length)] : { ox: 0, oy: 0 };
      var q = figPos(u, f);
      return { x: q.x, y: q.y, f: f };
    }
    // 増援部隊を画面に出す(自軍は川を渡った所、敵は敵陣から)
    // 相手側の拠点で、いちばん前線に近いもの(前線基地)
    function forwardBase(side) {
      var best = null;
      B.posts.forEach(function (p, i) {
        if (p.owner !== side || (side === 0 ? i < 3 : i >= 3)) return;
        if (!best || (side === 0 ? p.y > best.y : p.y < best.y)) best = p;
      });
      return best;
    }
    function postEvent(ev, quiet) {
      var p = B.posts[ev.i];
      p.owner = ev.side; p.flipT = fxNow(); p.kind = ev.kind || p.kind;
      if (quiet) return;
      var ally = ev.side === 0;
      text(p.x, p.y, ally ? '拠点占領!' : '拠点を奪われた', ally ? '#bfffc8' : '#ffb3a8', 15, 34);
      B.pillars.push({ wx: p.x, wy: p.y, side: ev.side, t: fxNow(), big: 1.5 });
      if (ev.kind) {
        var sp = TF.SUPPORT[ev.kind];
        text(p.x, p.y, (ally ? sp.short + 'が出撃可能' : '敵の' + sp.short + 'に注意'), ally ? '#e2c8ff' : '#ffb3a8', 12, 50);
        if (ally && !B.auto) showHint('拠点を占領! 右下のボタンで「' + sp.short + '」を発進できます', 3);
      }
    }
    // 特殊ユニット: 発進した拠点から飛んで行き、少し遅れて着弾
    function supportEvent(ev) {
      var side = ev.side, sp = TF.SUPPORT[ev.kind], p0 = null;
      B.posts.forEach(function (p, i) { if (p.owner === side && p.kind === ev.kind && (side === 0 ? i >= 3 : i < 3)) p0 = p; });
      var from = p0 ? { x: p0.x, y: p0.y } : { x: side === 0 ? B.mapv.px : B.mapv.ex, y: side === 0 ? Yd(40) : Yd(260) };
      B.banner = { t: 0, name: sp.name, skill: sp.short, side: side, sub: sp.desc };
      B.supCount = (B.supCount || [0, 0]); B.supCount[side]++;
      var hits = ev.hits, t0 = B.clock, i, d, tw;
      if (ev.kind === 'heli') {
        d = hits.length ? B.units[hits[0].d] : null;
        var hx = d ? d.wx + (side === 0 ? 0 : 0) : from.x, hy = d ? d.wy + (side === 0 ? -26 : 26) : from.y;
        B.air.push({ kind: 'heli', side: side, x0: from.x, y0: from.y, x1: hx, y1: hy, t0: t0, t1: t0 + 0.8 + hits.length * 0.3 + 0.6 });
        hits.forEach(function (h, k) {
          var dd = B.units[h.d], w = figWorld(dd), ts = t0 + 0.8 + k * 0.3;
          B.projs.push({ kind: 'rocket', x0: hx, y0: hy, x1: w.x, y1: w.y, t0: ts, t1: ts + 0.4, side: side });
          B.imps.push({ at: ts + 0.4, d: h.d, dmg: h.dmg, kill: h.kill, kind: 'rocket', wx: w.x, wy: w.y, crit: 1 });
        });
      } else if (ev.kind === 'air') {
        var ys = hits.map(function (h) { return B.units[h.d].wy; }), my = ys.length ? ys.reduce(function (a, b) { return a + b; }, 0) / ys.length : from.y;
        var ax0 = LANES[0] - 70, ax1 = LANES[LANES.length - 1] + 70;
        B.air.push({ kind: 'air', side: side, x0: ax0, y0: my, x1: ax1, y1: my, t0: t0 + 0.2, t1: t0 + 1.8 });
        hits.forEach(function (h, k) {
          var dd = B.units[h.d], w = figWorld(dd), ts = t0 + 0.5 + (dd.wx - ax0) / (ax1 - ax0) * 1.6;
          for (var m = 0; m < 3; m++) B.imps.push({ at: ts + m * 0.06, d: h.d, dmg: 0, kind: 'art', wx: w.x + (m - 1) * 3, wy: w.y, fx: true });
          B.imps.push({ at: ts + 0.2, d: h.d, dmg: h.dmg, kill: h.kill, kind: 'art', wx: w.x, wy: w.y, crit: 1 });
        });
      } else {
        d = hits.length ? B.units[hits[0].d] : null;
        tw = d ? figWorld(d) : from;
        B.air.push({ kind: 'drone', side: side, x0: from.x, y0: from.y, x1: tw.x, y1: tw.y, t0: t0, t1: t0 + 1.1 });
        hits.forEach(function (h) { B.imps.push({ at: t0 + 1.1, d: h.d, dmg: h.dmg, kill: h.kill, kind: 'rocket', wx: tw.x, wy: tw.y, big: true, crit: 1 }); });
      }
    }
    function drawAir() {
      B.air = B.air.filter(function (a) { return B.clock < a.t1 + 0.8; });
      B.air.forEach(function (a) {
        var k = Math.max(0, Math.min(1, (B.clock - a.t0) / Math.max(0.01, a.t1 - a.t0))), x, y, alt;
        if (B.clock < a.t0) return;
        if (a.kind === 'heli') {
          var inK = Math.min(1, (B.clock - a.t0) / 0.8), outK = Math.max(0, (B.clock - (a.t1 - 0.6)) / 0.6);
          x = a.x0 + (a.x1 - a.x0) * inK - outK * 60; y = a.y0 + (a.y1 - a.y0) * inK - (a.side === 0 ? 1 : -1) * outK * 40; alt = 14;
        } else if (a.kind === 'air') { x = a.x0 + (a.x1 - a.x0) * k; y = a.y0; alt = 22; }
        else { x = a.x0 + (a.x1 - a.x0) * k; y = a.y0 + (a.y1 - a.y0) * k; alt = 12 * (1 - k * k); }
        var p = proj(x, y), sc = p.k * (a.kind === 'air' ? 1.3 : a.kind === 'heli' ? 1.1 : 1.0), ay = p.y - alt * p.k;
        cx.fillStyle = 'rgba(0,0,0,.25)'; cx.beginPath(); cx.ellipse(p.x, p.y, 6 * sc, 2 * sc, 0, 0, Math.PI * 2); cx.fill();
        var dir = a.kind === 'air' ? 1 : (a.x1 >= a.x0 ? 1 : -1);
        cx.save(); cx.translate(p.x, ay); cx.scale(dir * sc, sc);
        var aim = uImg('s.' + a.kind);
        if (aim) {
          // 描き下ろしの絵(右向き)。進む向きに合わせて左右を反転する
          var wU = a.kind === 'air' ? 30 : a.kind === 'heli' ? 26 : 14, hU = wU * aim.height / aim.width;
          cx.drawImage(aim, -wU / 2, -hU / 2, wU, hU);
          if (a.kind === 'heli') { cx.fillStyle = 'rgba(20,24,22,' + (0.18 + 0.12 * Math.abs(Math.sin(B.clock * 40))) + ')'; cx.beginPath(); cx.ellipse(1.5, -hU * 0.3, 11, 1.1, 0, 0, Math.PI * 2); cx.fill(); }
          if (a.kind === 'air' && Math.random() < 0.6) { cx.fillStyle = '#ffe28a'; cx.fillRect(wU / 2 - 1, hU * 0.12, 4, 0.9); }
        } else if (a.kind === 'heli') {
          cx.fillStyle = '#4f5a3a'; cx.beginPath(); cx.ellipse(0, 0, 5, 2.2, 0, 0, Math.PI * 2); cx.fill(); cx.fillRect(-11, -0.8, 8, 1.6);
          cx.fillStyle = '#8fdcff'; cx.fillRect(2.4, -1.6, 2, 1.4);
          var rl = 9 * Math.abs(Math.sin(B.clock * 40));
          cx.strokeStyle = 'rgba(30,30,30,.8)'; cx.lineWidth = 0.6; cx.beginPath(); cx.moveTo(-rl, -3.4); cx.lineTo(rl, -3.4); cx.stroke();
        } else if (a.kind === 'air') {
          cx.fillStyle = '#6b747c'; cx.beginPath(); cx.moveTo(8, 0); cx.lineTo(-8, -1.2); cx.lineTo(-8, 1.2); cx.closePath(); cx.fill();
          cx.fillStyle = '#59626a'; cx.beginPath(); cx.moveTo(1, 0); cx.lineTo(-4, -7); cx.lineTo(-2, -7); cx.lineTo(4, 0); cx.lineTo(-2, 7); cx.lineTo(-4, 7); cx.closePath(); cx.fill();
          if (Math.random() < 0.6) { cx.fillStyle = '#ffe28a'; cx.fillRect(8, -0.4, 3, 0.8); }
        } else {
          cx.fillStyle = '#6b6f5a'; cx.fillRect(-4, -0.8, 8, 1.6); cx.fillStyle = '#55594a'; cx.fillRect(-1, -3.5, 1.2, 7);
          cx.fillStyle = '#ff5a4a'; cx.beginPath(); cx.arc(4, 0, 0.7, 0, Math.PI * 2); cx.fill();
        }
        cx.restore();
      });
    }
    function updateSupBar() {
      var bar = $('supBar'), info = B.eng.postInfo ? B.eng.postInfo() : null;
      var ch = info && !B.auto && !B.ending ? info.charges : [];
      var key = ch.join(',') + '|' + B.auto;
      if (key === B.supKey) return;
      B.supKey = key;
      bar.classList.toggle('hidden', !ch.length);
      var cnt = {};
      ch.forEach(function (k) { cnt[k] = (cnt[k] || 0) + 1; });
      bar.innerHTML = Object.keys(cnt).map(function (k) {
        return '<button class="supbtn" data-act="sup-launch" data-kind="' + k + '">' + (ART.has('s.' + k) ? ART.svg('s.' + k) : SUP_ICON[k]) + '<span>' + TF.SUPPORT[k].short + '</span><span class="n">' + cnt[k] + '</span></button>';
      }).join('');
    }
    function launchSupport(kind) {
      if (!B || B.ending) return;
      if (B.auto) { showHint('AUTOのときは占領と同時に自動で発進します'); return; }
      if (!B.eng.support(kind, B.clock)) showHint('いまは発進できません');
      updateSupBar();
    }
    function spawnVisual(ev) {
      var e = B.eng.U[ev.s];
      var u = mkSquad({ type: e.type, maxHp: e.maxHp, boss: false, hero: null }, ev.side, 100 + ev.s, ev.s);
      u.troop = Math.round(u.troop * TF.K.resMul / 50) * 50;
      u.reserve = true;
      var lane;
      if (ev.lane !== null && ev.lane !== undefined) lane = LANES[ev.lane] + (Math.random() - 0.5) * 14;
      else {
        var cnt = LANES.map(function (x) { return B.units.filter(function (v) { return v.side === ev.side && !v.dead && Math.abs(v.col - x) < LANEW / 2; }).length; });
        lane = LANES[cnt.indexOf(Math.min.apply(null, cnt))];
      }
      B.lanePref = null;
      u.col = lane; u.row = 1; u.jx = (Math.random() - 0.5) * 6; u.jy = (Math.random() - 0.5) * 3; u.homeY = advToY(ev.side, 0);
      var sp0 = B.eng.pos(ev.s, ev.t), base = forwardBase(ev.side);
      if (sp0) { u.wx = fxW(sp0.x); u.wy = fyW(sp0.y); } else { u.wx = lane; u.wy = ev.side === 0 ? START.p - 26 : START.e + 20; }
      B.units[ev.s] = u;
      if (ev.side === 1) { u.vis = false; u.visA = 0; showHint('敵の増援が来た(見つけるまで位置はわからない)', 1.8); return; }
      B.pillars.push({ wx: u.wx, wy: u.wy, side: ev.side, t: fxNow(), big: 1.3 });
      text(u.wx, u.wy, base ? '前線基地から増援!' : '増援到着!', '#bfffc8', 15, 30);
    }
    // 射程内に敵がいないので横へ動いた(エンジンが決めた移動。手動の移動は画面側ですでに動かしている)
    function laneMoveVisual(ev, quiet) {
      if (!ev.auto) return;
      var u = B.units[ev.s];
      if (!u || u.dead) return;
      u.col = u.homeCol = fxW(ev.lx); u.free = true; u.jx = 0;
      frontRows(u.side);
      if (quiet || u.side !== 0) return;
      var nt = B.noteT || (B.noteT = {});
      if (nt.rng !== undefined && B.clock - nt.rng < 1.2) return;
      nt.rng = B.clock;
      text(u.wx, u.wy, '射程外→敵へ移動', '#cfe9ff', 12, 34);
    }
    function fire(ev) {
      if (ev.k === 'post') { postEvent(ev, false); return; }
      if (ev.k === 'sup') { supportEvent(ev); return; }
      var s = B.units[ev.s];
      if (ev.k === 'lane') { laneMoveVisual(ev, false); return; }
      if (ev.k === 'eskWarn' || ev.k === 'eskCast') { ecmdEvent(ev, false); return; }
      if (ev.k === 'refl') {
        // 鉄壁反撃: 撃たれた部隊から撃った部隊へ光が返る
        var rt = B.units[ev.d];
        B.beams.push({ x0: s.wx, y0: s.wy, x1: rt.wx, y1: rt.wy, life: 0.25, max: 0.25, c: 'refl' });
        B.imps.push({ at: B.clock + 0.1, d: ev.d, dmg: ev.dmg, kill: ev.kill, kind: 'at', wx: rt.wx, wy: rt.wy });
        return;
      }
      if (ev.k === 'atk') {
        s.aim = ev.d; s.aimT = B.clock;
        if (s.side === 1) {
          var tg0 = B.units[ev.d];
          if (tg0 && tg0.side === 0) {
            tg0.shotBy = (tg0.shotBy || []).filter(function (x) { return B.clock - x.t < 2; });
            if (!tg0.shotBy.some(function (x) { return x.s === s.id; })) tg0.shotBy.push({ s: s.id, t: B.clock });
            if (tg0.shotBy.length >= 3 && !(B.clock - (tg0.focusSaid || -9) < 6)) { tg0.focusSaid = B.clock; text(tg0.wx, tg0.wy, '集中攻撃を受けている!', '#ff9a8a', 13, 44); }
          }
        }
        var d = B.units[ev.d], fl = FLIGHT[s.type];
        var n = s.type === 'inf' ? 3 : 1;
        for (var i = 0; i < n; i++) {
          var a = figWorld(s), b = figWorld(d);
          a.f.fire = B.clock + i * 0.05;
          if (ev.miss) { b.x += (Math.random() < 0.5 ? -1 : 1) * (9 + Math.random() * 4); b.y += (Math.random() - 0.5) * 6; }
          B.projs.push({ kind: s.type, x0: a.x, y0: a.y, x1: b.x, y1: b.y, t0: B.clock + i * 0.05, t1: B.clock + i * 0.05 + fl, side: s.side });
          if (i === n - 1) B.imps.push({ at: B.clock + i * 0.05 + fl, d: ev.d, dmg: ev.dmg, crit: ev.crit, kill: ev.kill, miss: ev.miss, sp: ev.sp, kind: s.type, wx: b.x, wy: b.y });
        }
        if (s.type === 'inf' || s.type === 'at') for (i = 0; i < 4; i++) { var ff = figWorld(s).f; ff.fire = B.clock + Math.random() * 0.15; }
      } else if (ev.k === 'spawn') {
        spawnVisual(ev);
      } else if (ev.k === 'skill') {
        var hd = TF.HERO[s.hero], sk = TF.SKILL[ev.sk];
        B.banner = { t: 0, name: hd.name, skill: sk.name, side: s.side, sub: sk.short, portrait: 'h:' + s.hero };
        if (ev.sk === 'charge') B.buff[s.side].atk = B.clock + ev.dur;
        else if (ev.sk === 'armor') B.buff[s.side].arm = B.clock + ev.dur;
        else if (ev.sk === 'blitz') B.buff[s.side].haste = B.clock + ev.dur;
        else if (ev.sk === 'smoke') { B.buff[1 - s.side].smoke = B.clock + ev.dur; B.units.forEach(function (v) { if (v.side !== s.side && !v.dead) for (var q = 0; q < 5; q++) part(v.wx + (Math.random() - 0.5) * 24, v.wy + (Math.random() - 0.5) * 10, { vx: (Math.random() - 0.5) * 10, vy: -6, life: 2.2, max: 2.2, r: 5 + Math.random() * 4, c: 'smoke' }); }); }
        else if (ev.sk === 'reflect') B.buff[s.side].refl = B.clock + ev.dur;
        else if (ev.sk === 'mark') { B.mark = B.mark || [null, null]; B.mark[1 - s.side] = { until: B.clock + ev.dur }; text(s.wx, s.wy, s.side === 0 ? '敵の位置と弱点を暴いた!' : '位置と弱点を暴かれた!', '#ff8a7a', 15, 44); }
        else if (ev.sk === 'heal') {
          ev.heals.forEach(function (h) {
            var hu = B.units[h.d];
            if (!hu) return;
            hu.hp = Math.min(hu.maxHp, hu.hp + h.heal); reviveFigs(hu);
            if (hiddenFoe(hu)) return;
            text(hu.wx, hu.wy, '+' + fmt(Math.round(h.heal / hu.maxHp * hu.troop)) + '人', '#9cffb0', 15, 38);
            for (var q = 0; q < 6; q++) part(hu.wx + (Math.random() - 0.5) * 14, hu.wy, { vx: (Math.random() - 0.5) * 8, vy: -22 - Math.random() * 14, life: 0.9, r: 1.1, c: 'heal' });
          });
        } else if (ev.sk === 'air') {
          // 爆撃機が横切りながら、密集地に爆弾を落とす
          var ax0 = LANES[0] - 70, ax1 = LANES[LANES.length - 1] + 70, ys = ev.hits.map(function (h) { return B.units[h.d].wy; }), my = ys.length ? ys.reduce(function (a, b) { return a + b; }, 0) / ys.length : B.front;
          B.air.push({ kind: 'air', side: s.side, x0: ax0, y0: my, x1: ax1, y1: my, t0: B.clock, t1: B.clock + 1.6 });
          ev.hits.forEach(function (h) {
            var dd = B.units[h.d], w = figWorld(dd), ts = B.clock + 0.3 + (dd.wx - ax0) / (ax1 - ax0) * 1.4;
            B.imps.push({ at: ts, d: h.d, dmg: 0, kind: 'rocket', wx: w.x - 4, wy: w.y, big: true, fx: true });
            B.imps.push({ at: ts + 0.12, d: h.d, dmg: h.dmg, kill: h.kill, kind: 'rocket', wx: w.x, wy: w.y, big: true, crit: 1 });
          });
        }
        else if (ev.sk === 'snipe') {
          ev.hits.forEach(function (h) {
            var d2 = B.units[h.d];
            B.sights.push({ u: d2, until: B.clock + 0.45, t0: B.clock });
            B.imps.push({ at: B.clock + 0.45, d: h.d, dmg: h.dmg, crit: 1, kill: h.kill, kind: 'snipe', wx: d2.wx, wy: d2.wy, from: s });
          });
        } else if (ev.sk === 'barrage') {
          ev.hits.forEach(function (h, i) {
            var d3 = B.units[h.d];
            // 後方の陣地からミサイルを撃ち込む
            for (var k = 0; k < 2; k++) {
              var t0 = B.clock + i * 0.1 + k * 0.14, tw = figWorld(d3);
              var lx = (s.side === 0 ? B.mapv.px : B.mapv.ex) + (Math.random() - 0.5) * 110, ly = s.side === 0 ? Yd(34) : Yd(266);
              B.projs.push({ kind: 'rocket', x0: lx, y0: ly, x1: tw.x, y1: tw.y, t0: t0, t1: t0 + 1.0, side: s.side });
              if (k === 1) B.imps.push({ at: t0 + 1.0, d: h.d, dmg: h.dmg, kill: h.kill, kind: 'rocket', wx: tw.x, wy: tw.y, big: true, crit: 1 });
              else B.imps.push({ at: t0 + 1.0, d: h.d, dmg: 0, kind: 'rocket', wx: tw.x, wy: tw.y, big: true, fx: true });
            }
          });
        }
      }
    }
    // 敵将のスキル: 予告(8秒前・位置がばれる)と発動
    function ecmdEvent(ev, quiet) {
      var c = TF.ECMD[ev.sk], s = B.units[ev.s];
      if (ev.k === 'eskWarn') {
        if (quiet) return;
        B.ewarn = { s: ev.s, sk: ev.sk, at: ev.at };
        B.banner = { t: 0, name: '敵将「' + c.name + '」', skill: c.skill + 'を準備中', side: 1, sub: 'あと' + c.warn + '秒 ・ 倒せば止められる', portrait: 'e:' + ev.sk };
        if (s) text(s.wx, s.wy, '敵将を発見!', '#ff8a7a', 16, 46);
        return;
      }
      if (B.ewarn && B.ewarn.s === ev.s) B.ewarn = null;
      B.ecast = (B.ecast || 0) + 1;
      if (!quiet) { B.banner = { t: 0, name: '敵将「' + c.name + '」', skill: c.skill, side: 1, sub: c.desc, portrait: 'e:' + ev.sk }; B.shake = Math.max(B.shake, 8); }
      if (ev.sk === 'ghost') {
        (ev.revive || []).forEach(function (r0) {
          var u = B.units[r0.d]; if (!u) return;
          var ep = B.eng.pos(u.id, ev.t);
          u.dead = false; u.hp = r0.hp; u.vis = false;
          u.figs.forEach(function (f) { f.alive = false; }); reviveFigs(u);
          if (ep) { u.wx = fxW(ep.x); u.wy = fyW(ep.y); }
          if (!quiet) B.pillars.push({ wx: u.wx, wy: u.wy, side: 1, t: fxNow(), big: 1.3 });
        });
        if (!quiet) showHint('倒した敵の部隊がよみがえった!', 2);
      } else if (ev.sk === 'wall') {
        B.buff[1].fort = B.clock + ev.dur;
        (ev.heals || []).forEach(function (h) { var u = B.units[h.d]; if (u) { u.hp = Math.min(u.maxHp, u.hp + h.heal); reviveFigs(u); } });
      } else if (ev.sk === 'thunder') {
        if (quiet) { (ev.hits || []).forEach(function (h) { applyImpact({ d: h.d, dmg: h.dmg, kill: h.kill, quiet: true }); }); return; }
        var cxw = ev.x !== null && ev.x !== undefined ? fxW(ev.x) : CXW, cyw = ev.y !== null && ev.y !== undefined ? fyW(ev.y) : F0;
        B.projs.push({ kind: 'rocket', x0: B.mapv.ex, y0: Yd(270), x1: cxw, y1: cyw, t0: B.clock, t1: B.clock + 1.2, side: 1 });
        B.imps.push({ at: B.clock + 1.2, d: (ev.hits && ev.hits[0] ? ev.hits[0].d : ev.s), dmg: 0, kind: 'rocket', wx: cxw, wy: cyw, big: true, fx: true });
        (ev.hits || []).forEach(function (h, i) { var u = B.units[h.d]; B.imps.push({ at: B.clock + 1.25 + i * 0.05, d: h.d, dmg: h.dmg, kill: h.kill, kind: 'rocket', wx: u.wx, wy: u.wy, big: true, crit: 1 }); });
      } else if (ev.sk === 'viper') {
        B.jamUntil = B.clock + ev.dur;
      } else if (ev.sk === 'witch') {
        var tu = B.units[ev.d];
        if (tu) {
          tu.side = 1; tu.vis = true; tu.visA = 1; tu.reserve = false;
          if (!quiet) { text(tu.wx, tu.wy, '寝返った!', '#e2b8ff', 18, 40); B.pillars.push({ wx: tu.wx, wy: tu.wy, side: 1, t: fxNow(), big: 1.4 }); }
          buildSkillBar();
        }
      } else if (ev.sk === 'reaper') {
        (ev.hits || []).forEach(function (h, i) {
          var u = B.units[h.d]; if (!u) return;
          if (quiet) { applyImpact({ d: h.d, dmg: h.dmg, kill: h.kill, quiet: true }); return; }
          B.sights.push({ u: u, until: B.clock + 0.5, t0: B.clock });
          B.imps.push({ at: B.clock + 0.5 + i * 0.08, d: h.d, dmg: h.dmg, crit: 1, kill: h.kill, kind: 'snipe', wx: u.wx, wy: u.wy });
        });
      }
    }
    // 粒子は地面上の点に結びつけ、画面上のずれ(ox,oy)で動かす。拡大率が変わっても追従する
    function part(wx, wy, o) {
      var k0 = proj(wx, wy).k;
      B.parts.push({ wx: wx, wy: wy, ox: o.ox || 0, oy: o.oy || 0, vx: (o.vx || 0) * k0 / KREF, vy: (o.vy || 0) * k0 / KREF, g: (o.g || 0) * k0 / KREF, life: o.life, max: o.max || o.life, r: o.r * k0, c: o.c, k0: k0 });
    }
    function boom(wx, wy, size) {
      var n = Math.round(5 + size * 6), i;
      for (i = 0; i < n; i++) {
        var a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 70 * size;
        part(wx, wy, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 20, life: 0.3 + Math.random() * 0.25, max: 0.55, r: (0.9 + Math.random() * 1.4) * size, c: 'fire' });
      }
      for (i = 0; i < n * 0.7; i++) part(wx + (Math.random() - 0.5) * 3, wy, { vx: (Math.random() - 0.5) * 20, vy: -14 - Math.random() * 24, life: 0.9 + Math.random() * 0.6, max: 1.5, r: (1.2 + Math.random() * 1.7) * size, c: 'smoke' });
      for (i = 0; i < n * 0.5; i++) { var a2 = -Math.PI * Math.random(); part(wx, wy, { vx: Math.cos(a2) * 70, vy: Math.sin(a2) * 110, g: 300, life: 0.5, r: 0.35, c: 'debris' }); }
      part(wx, wy, { life: 0.3, r: 5.5 * size, c: 'ring' });
      if (size >= 1.4) part(wx, wy, { life: 0.55, r: 9 * size, c: 'shock' });
      // 閃光(光が重なって明るくなる)と、飛び散る火花
      part(wx, wy, { oy: -3 * size, life: 0.22, r: 10 * size, c: 'flash' });
      for (i = 0; i < 3 + size * 4; i++) { var a3 = -Math.PI * (0.1 + 0.8 * Math.random()); part(wx, wy, { vx: Math.cos(a3) * (60 + Math.random() * 90), vy: Math.sin(a3) * (80 + Math.random() * 110), g: 260, life: 0.35 + Math.random() * 0.3, r: 0.5, c: 'spark' }); }
      // 地面の焦げ跡(しばらく残る)
      if (size >= 0.9) { B.scorch = B.scorch || []; B.scorch.push({ wx: wx + (Math.random() - 0.5) * 2, wy: wy, r: 2.6 * size + Math.random(), t: fxNow() }); if (B.scorch.length > 70) B.scorch.shift(); }
      // 近くの土のうと家にも被害
      var R = 2.5 + 2 * size;
      B.walls.forEach(function (w) { if (w.ok && Math.abs(w.x - wx) < R && Math.abs(w.y - wy) < R * 0.8) { w.ok = false; } });
      B.blds.forEach(function (b) {
        if (!b.fragile || b.ruin) return;
        if (Math.abs(b.x - wx) < b.w / 2 + 3 + 2 * size && Math.abs(b.y - wy) < b.d / 2 + 3 + 2 * size) {
          b.hp -= size;
          if (b.hp <= 0) { b.ruin = true; b.ruinT = fxNow(); bgKey = ''; B.shake = Math.max(B.shake, 6); boomRaw(b.x, b.y, 1.5); }
        }
      });
    }
    function boomRaw(wx, wy, size) {
      var n = Math.round(5 + size * 6);
      for (var i = 0; i < n; i++) { var a = Math.random() * Math.PI * 2, v = 20 + Math.random() * 70 * size; part(wx, wy, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 20, life: 0.35 + Math.random() * 0.25, max: 0.6, r: (0.9 + Math.random() * 1.4) * size, c: 'fire' }); }
      for (i = 0; i < n; i++) part(wx + (Math.random() - 0.5) * 4, wy, { vx: (Math.random() - 0.5) * 20, vy: -16 - Math.random() * 24, life: 1.2 + Math.random() * 0.6, max: 1.8, r: (1.4 + Math.random() * 1.8) * size, c: 'smoke' });
    }
    function puff(wx, wy) { for (var i = 0; i < 3; i++) part(wx + (Math.random() - 0.5) * 2, wy, { vx: (Math.random() - 0.5) * 16, vy: -10 - Math.random() * 10, life: 0.4, r: 0.8, c: 'dust' }); }
    // 文字も地面上の点に結びつけて、上へ浮かせる
    function text(wx, wy, s, color, size, lift) {
      var n = 0;
      B.texts.forEach(function (t) { if (Math.abs(t.wx - wx) < 8 && Math.abs(t.wy - wy) < 8 && t.max - t.life < 0.4) n++; });
      B.texts.push({ wx: wx, wy: wy, lift: (lift || 26) + Math.min(n, 3) * 16, rise: 0, jx: (Math.random() - 0.5) * 10, s: s, c: color, size: size || 15, life: 1.0, max: 1.0 });
    }
    // 兵力(HP)に合わせて、倒れた兵士・壊れた車両を地面に残す
    // 回復したら、倒れていた兵士が立ち上がる
    function reviveFigs(u) {
      if (u.dead || u.hp <= 0) return;
      var want = Math.max(1, Math.ceil(u.hp / u.maxHp * u.figs.length)), alive = aliveFigs(u).length;
      for (var i = 0; i < u.figs.length && alive < want; i++) if (!u.figs[i].alive) { u.figs[i].alive = true; alive++; }
    }
    function syncFigs(u, quiet) {
      var want = u.hp <= 0 ? 0 : Math.max(1, Math.ceil(u.hp / u.maxHp * u.figs.length));
      var alive = aliveFigs(u);
      while (alive.length > want) {
        var f = alive.splice(Math.floor(Math.random() * alive.length), 1)[0];
        f.alive = false;
        var fp = figPos(u, f), wx = fp.x, wy = fp.y;
        var heavy = u.type === 'tank' || u.type === 'art';
        B.marks.push({ wx: wx, wy: wy, side: u.side, kind: heavy ? 'wreck' : 'fallen', big: u.big, t: B.clock, flip: Math.random() < 0.5 });
        if (!quiet && heavy) boom(wx, wy, 1.1);
      }
    }
    function applyImpact(im) {
      var d = B.units[im.d];
      var wx = im.wx === undefined ? d.wx : im.wx, wy = im.wy === undefined ? d.wy : im.wy;
      if (im.miss) { if (!im.quiet) puff(wx, wy); return; }
      if (im.fx) { if (!im.quiet) { boom(wx, wy, im.kind === 'rocket' ? 1.6 : 1.0); B.shake = Math.max(B.shake, 5); } return; }
      d.hp = Math.max(0, d.hp - im.dmg);
      if (im.kill) d.hp = 0;
      syncFigs(d, im.quiet);
      if (im.quiet) { if (d.hp <= 0) d.dead = true; return; }
      d.hitT = B.clock;
      if (im.from) B.beams.push({ x0: im.from.wx, y0: im.from.wy, x1: d.wx, y1: d.wy, life: 0.3, max: 0.3 });
      var size = im.kind === 'rocket' ? 1.8 : im.kind === 'art' ? (im.big ? 1.25 : 1.1) : im.kind === 'snipe' ? 1.4 : im.kind === 'tank' ? 0.9 : im.kind === 'at' ? 0.9 : 0;
      if (size) boom(wx, wy, size); else puff(wx, wy);
      if (im.crit || im.kind === 'snipe') text(wx, wy, (im.kind === 'snipe' ? '' : '会心 ') + '-' + fmt(im.dmg), '#ffe066', 15);
      else if (im.sp && !(B.clock - (d.spT || -9) < 1.2)) { d.spT = B.clock; B.spHits = (B.spHits || 0) + 1; text(wx, wy - 4, '特効!', '#e2b8ff', 14); }
      if (im.kind === 'art' || im.kind === 'snipe' || im.kind === 'rocket') B.shake = Math.max(B.shake, im.kind === 'art' ? 3.5 : 8);
      if (d.hp <= 0 && !d.dead) {
        d.dead = true;
        boom(d.wx, d.wy, 1.7);
        part(d.wx, d.wy, { oy: -8, life: 0.4, r: 26, c: 'flash' });
        for (var bk = 0; bk < 10; bk++) part(d.wx + (Math.random() - 0.5) * 6, d.wy, { vx: (Math.random() - 0.5) * 10, vy: -24 - Math.random() * 30, life: 2 + Math.random(), max: 3, r: 2.2 + Math.random() * 2, c: 'smoke' });
        B.shake = 10;
        text(d.wx, d.wy, d.side === 1 ? '撃破!' : '全滅…', d.side === 1 ? '#ffd166' : '#ff8b78', 18, 32);
      }
    }
    function liftOf(p, k) {
      if (p.kind === 'art') return 1.6 + Math.sin(Math.PI * k) * (16 + Math.abs(p.y1 - p.y0) * 0.35);
      if (p.kind === 'at') return 1.6 + Math.sin(Math.PI * k) * 4;
      if (p.kind === 'rocket') return 1.6 + Math.pow(Math.sin(Math.PI * k), 0.75) * Math.min(70, 30 + Math.abs(p.y1 - p.y0) * 0.3);
      return 1.6;
    }
    function projPos(p, c) {
      var k = (c - p.t0) / (p.t1 - p.t0);
      if (k < 0 || k > 1) return null;
      var wx = p.x0 + (p.x1 - p.x0) * k, wy = p.y0 + (p.y1 - p.y0) * k;
      var q = proj(wx, wy), lift = liftOf(p, k);
      return { x: q.x, y: q.y - lift * q.k, gx: q.x, gy: q.y, s: q.s, k: k };
    }

    function drawWalls() {
      B.walls.forEach(function (w) {
        var p = proj(w.x, w.y), k = p.k;
        if (p.y < -20 || p.y > H + 20 || p.x < -20 || p.x > W + 20) return;
        if (w.ok) {
          cx.fillStyle = 'rgba(0,0,0,.18)'; cx.beginPath(); cx.ellipse(p.x + 0.4 * k, p.y, 1.6 * k, 0.5 * k, 0, 0, Math.PI * 2); cx.fill();
          [[-0.62, -0.45], [0.62, -0.45], [0, -1.2]].forEach(function (o) {
            cx.fillStyle = '#a88f62'; cx.beginPath(); cx.ellipse(p.x + o[0] * k, p.y + o[1] * k, 0.78 * k, 0.46 * k, 0, 0, Math.PI * 2); cx.fill();
            cx.fillStyle = '#cdb685'; cx.beginPath(); cx.ellipse(p.x + o[0] * k - 0.1 * k, p.y + o[1] * k - 0.13 * k, 0.56 * k, 0.26 * k, 0, 0, Math.PI * 2); cx.fill();
          });
        } else {
          cx.fillStyle = 'rgba(120,100,70,.6)';
          cx.beginPath(); cx.ellipse(p.x - 0.7 * k, p.y - 0.15 * k, 0.75 * k, 0.32 * k, 0.3, 0, Math.PI * 2); cx.fill();
          cx.beginPath(); cx.ellipse(p.x + 0.7 * k, p.y + 0.1 * k, 0.65 * k, 0.28 * k, -0.4, 0, Math.PI * 2); cx.fill();
        }
      });
    }
    // 各部隊から、いま狙っている敵へ細い線を引く(自軍は緑、敵は赤)
    function drawAims() {
      B.units.forEach(function (u) {
        if (u.dead || u.aim === null) return;
        var tg = B.units[u.aim];
        if (!tg || tg.dead) return;
        if (u.side === 0 && B.eng.U[u.id].order !== null) return; // 指示中は指示の矢印を出す
        var age = B.clock - u.aimT;
        if (age > 2.4 || age < 0) return;
        var a = 0.12 + 0.38 * (1 - age / 2.4);
        var p0 = proj(u.wx, u.wy), p1 = proj(tg.wx, tg.wy);
        var y0 = p0.y - 2.4 * p0.k, y1 = p1.y - 1.6 * p1.k;
        cx.lineCap = 'round';
        cx.strokeStyle = 'rgba(' + TEAM[u.side].rgb + ',' + (a * 0.3) + ')'; cx.lineWidth = 3.5;
        cx.beginPath(); cx.moveTo(p0.x, y0); cx.lineTo(p1.x, y1); cx.stroke();
        cx.strokeStyle = u.side === 0 ? 'rgba(150,255,170,' + a + ')' : 'rgba(255,140,120,' + a + ')'; cx.lineWidth = 1.1; cx.setLineDash([7, 5]);
        cx.beginPath(); cx.moveTo(p0.x, y0); cx.lineTo(p1.x, y1); cx.stroke(); cx.setLineDash([]);
      });
    }
    function drawPosts() {
      var now = fxNow();
      B.posts.forEach(function (p) {
        var q = proj(p.x, p.y);
        if (q.y < -20 || q.y > H + 40 || q.x < -30 || q.x > W + 30) return;
        var T = TEAM[p.owner], flash = Math.max(0, 1 - (now - p.flipT) / 0.6);
        cx.strokeStyle = 'rgba(' + T.rgb + ',' + (0.55 + 0.45 * flash) + ')'; cx.lineWidth = 2 + 2 * flash;
        cx.beginPath(); cx.ellipse(q.x, q.y, 5 * q.k, 2.2 * q.k, 0, 0, Math.PI * 2); cx.stroke();
        cx.fillStyle = 'rgba(' + T.rgb + ',.18)'; cx.fill();
        var ph = 9 * q.k;
        cx.strokeStyle = '#e6e6dc'; cx.lineWidth = Math.max(1, 0.35 * q.k);
        cx.beginPath(); cx.moveTo(q.x, q.y); cx.lineTo(q.x, q.y - ph); cx.stroke();
        var wv = Math.sin(B.wave * 6 + p.x) * 0.5 * q.k;
        cx.fillStyle = T.main; cx.beginPath(); cx.moveTo(q.x, q.y - ph); cx.lineTo(q.x + 4 * q.k, q.y - ph + 1.2 * q.k + wv); cx.lineTo(q.x, q.y - ph + 2.6 * q.k); cx.closePath(); cx.fill();
      });
    }
    function drawSquad(u) {
      if (hiddenFoe(u)) return; // 見つけていない敵は描かない
      if (u.side === 1 && u.visA < 1) { cx.save(); cx.globalAlpha = u.visA; drawSquad0(u); cx.restore(); return; }
      drawSquad0(u);
    }
    function drawSquad0(u) {
      var spr = SPR[u.side][u.type], ally = u.side === 0;
      var c = proj(u.wx, u.wy);
      if (c.y < -60 || c.y > H + 60 || c.x < -90 || c.x > W + 90) return;
      var bw = 11 * c.k * u.big * (u.type === 'inf' ? 1 : 0.9) * (HAS_RAST ? 1.1 : 1);
      if (!u.dead) { cx.fillStyle = 'rgba(0,0,0,.2)'; cx.beginPath(); cx.ellipse(c.x + bw * 0.25, c.y + 1, bw * 1.25, bw * 0.42, 0, 0, Math.PI * 2); cx.fill(); }
      if (!u.dead && u.moving && (u.type === 'tank' || u.type === 'art') && Math.random() < 0.25) part(u.wx + (Math.random() - 0.5) * 10, u.wy + (u.side === 0 ? -3 : 3), { vx: (Math.random() - 0.5) * 10, vy: -6 - Math.random() * 6, life: 0.9, r: 1.6 + Math.random(), c: 'dust' });
      if (!u.dead && B.buff[u.side].atk > B.clock) {
        cx.fillStyle = 'rgba(255,130,50,' + (0.22 + 0.1 * Math.sin(B.clock * 12)) + ')';
        cx.beginPath(); cx.ellipse(c.x, c.y, bw * 1.15, bw * 0.45, 0, 0, Math.PI * 2); cx.fill();
      }
      for (var i = 0; i < u.figs.length; i++) {
        var f = u.figs[i];
        if (!f.alive) continue;
        var fq = figPos(u, f), p = proj(fq.x, fq.y);
        var bob = u.moving ? Math.abs(Math.sin(B.clock * 9 + B.introT * 9 + B.endT * 9 + f.ph)) * 0.5 * p.k : 0;
        var w = spr.w * p.k * u.big * FIGS, h = spr.h * p.k * u.big * FIGS;
        cx.drawImage(spr.c, p.x - w / 2, p.y - h - bob, w, h);
        if (f.fire > 0 && B.clock - f.fire < 0.08 && B.clock >= f.fire) {
          var mx = p.x + (u.type === 'tank' || u.type === 'art' ? 0 : 0.6 * p.k), my0 = p.y - h * 0.85 + (ally ? -1 : 1) * 0.4 * p.k, mr0 = Math.max(4, 2.4 * p.k);
          cx.save(); cx.globalCompositeOperation = 'lighter'; var mg = cx.createRadialGradient(mx, my0, 0, mx, my0, mr0);
          mg.addColorStop(0, 'rgba(255,250,210,.95)'); mg.addColorStop(0.4, 'rgba(255,200,90,.6)'); mg.addColorStop(1, 'rgba(255,120,40,0)');
          cx.fillStyle = mg; cx.beginPath(); cx.arc(mx, my0, mr0, 0, Math.PI * 2); cx.fill(); cx.restore();
        }
      }
      if (B.clock - u.hitT < 0.12) {
        cx.fillStyle = 'rgba(255,255,255,.25)';
        cx.beginPath(); cx.ellipse(c.x, c.y - 4 * c.k, bw, bw * 0.5, 0, 0, Math.PI * 2); cx.fill();
      }
      if (!u.dead && B.buff[u.side].haste > B.clock) {
        // 電撃戦: 足元に黄色い流線
        cx.strokeStyle = 'rgba(255,226,90,' + (0.55 + 0.3 * Math.sin(B.clock * 20)) + ')'; cx.lineWidth = 2;
        for (var hs = -1; hs <= 1; hs++) { cx.beginPath(); cx.moveTo(c.x - bw * 1.3, c.y + hs * 3); cx.lineTo(c.x - bw * 0.6, c.y + hs * 3); cx.stroke(); }
      }
      if (!u.dead && B.buff[u.side].refl > B.clock) {
        // 鉄壁反撃: とげのある金色の輪
        cx.save(); cx.strokeStyle = 'rgba(255,214,100,.85)'; cx.lineWidth = 1.6; cx.beginPath();
        for (var sp = 0; sp < 16; sp++) { var an = sp / 16 * Math.PI * 2 + B.clock, rr = sp % 2 ? bw * 1.05 : bw * 1.3; cx.lineTo(c.x + Math.cos(an) * rr, c.y - 3 * c.k + Math.sin(an) * rr * 0.45); }
        cx.closePath(); cx.stroke(); cx.restore();
      }
      if (!u.dead && B.mark && B.mark[u.side] && B.mark[u.side].until > B.clock) {
        // 弱点看破: 暴かれた側の部隊すべてに赤い照準
        var mr = Math.max(10, bw * 0.8), my2 = c.y - 6 * c.k;
        cx.save(); cx.strokeStyle = 'rgba(255,70,60,' + (0.7 + 0.25 * Math.sin(B.clock * 9)) + ')'; cx.lineWidth = 2;
        cx.beginPath(); cx.arc(c.x, my2, mr, 0, Math.PI * 2); cx.stroke();
        cx.beginPath(); cx.moveTo(c.x - mr - 5, my2); cx.lineTo(c.x - mr + 5, my2); cx.moveTo(c.x + mr - 5, my2); cx.lineTo(c.x + mr + 5, my2); cx.moveTo(c.x, my2 - mr - 5); cx.lineTo(c.x, my2 - mr + 5); cx.stroke(); cx.restore();
      }
      if (!u.dead && B.buff[u.side].smoke > B.clock && Math.random() < 0.08) part(u.wx + (Math.random() - 0.5) * 20, u.wy, { vx: (Math.random() - 0.5) * 8, vy: -5, life: 1.8, max: 1.8, r: 4 + Math.random() * 3, c: 'smoke' });
      if (!u.dead && B.buff[u.side].arm > B.clock) {
        cx.save();
        cx.globalAlpha = 0.55 + 0.25 * Math.sin(B.clock * 8);
        cx.strokeStyle = '#8fd3ff'; cx.lineWidth = 2;
        cx.fillStyle = 'rgba(143,211,255,.14)';
        cx.beginPath(); cx.ellipse(c.x, c.y - 2 * c.k, bw * 1.2, bw * 0.75, 0, Math.PI, 0); cx.lineTo(c.x + bw * 1.2, c.y - 2 * c.k);
        cx.ellipse(c.x, c.y - 2 * c.k, bw * 1.2, bw * 0.3, 0, 0, Math.PI); cx.closePath(); cx.fill(); cx.stroke();
        cx.restore();
      }
    }
    // 自軍の前進中の部隊: 向かう先へ点線
    function drawMarch() {
      cx.save(); cx.setLineDash([4, 5]); cx.lineWidth = 1.6; cx.strokeStyle = 'rgba(190,255,200,.55)';
      B.units.forEach(function (u) {
        if (u.dead || u.side !== 0 || !u.dest) return;
        var a = proj(u.wx, u.wy), b = proj(u.dest.x, u.dest.y);
        if (Math.hypot(b.x - a.x, b.y - a.y) < 8) return;
        cx.beginPath(); cx.moveTo(a.x, a.y); cx.lineTo(b.x, b.y); cx.stroke();
        cx.beginPath(); cx.arc(b.x, b.y, 3, 0, Math.PI * 2); cx.stroke();
      });
      cx.restore();
    }
    function drawLabel(u) {
      if (u.dead || hiddenFoe(u)) return;
      if (u.side === 1 && u.visA < 1) { cx.save(); cx.globalAlpha = u.visA; drawLabel0(u); cx.restore(); return; }
      drawLabel0(u);
    }
    function drawLabel0(u) {
      var p = proj(u.wx, u.wy + u.farOy * u.big);
      if (p.y < -40 || p.y > H + 60 || p.x < -60 || p.x > W + 60) return;
      var sz = Math.max(0.7, Math.min(1.15, 0.6 + 0.4 * p.s));
      var y = p.y - FIGH[u.type] * p.k * u.big * FIGS - 3;
      var r = 9.5 * sz;
      var shake = B.clock - u.hitT < 0.15 ? (Math.random() - 0.5) * 3 : 0;
      // 兵種章: 部隊の上に浮かぶ六角形(チームの色の縁が光る)。地面まで細い支柱
      cx.strokeStyle = TEAM[u.side].main; cx.globalAlpha *= 0.55; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(p.x, y); cx.lineTo(p.x, p.y - 2); cx.stroke(); cx.globalAlpha /= 0.55;
      var hx0 = p.x, hy0 = y - r;
      cx.beginPath(); for (var hi = 0; hi < 6; hi++) { var ha = Math.PI / 6 + hi * Math.PI / 3; cx.lineTo(hx0 + Math.cos(ha) * r * 1.05, hy0 + Math.sin(ha) * r * 1.05); } cx.closePath();
      cx.fillStyle = TEAM[u.side].icon; cx.fill();
      cx.shadowColor = TEAM[u.side].main; cx.shadowBlur = 6; cx.strokeStyle = TEAM[u.side].light; cx.lineWidth = 1.4; cx.stroke(); cx.shadowBlur = 0;
      cx.save(); cx.translate(p.x, y - r); var isz = r * 1.3; cx.scale(isz / 24, isz / 24); cx.translate(-12, -12);
      cx.fillStyle = '#fff'; path(u.type).forEach(function (pp) { cx.fill(pp); }); cx.restore();
      var men = Math.ceil(u.hp / u.maxHp * u.troop);
      cx.font = '800 ' + Math.round(12 * sz) + 'px "SF Mono",ui-monospace,Menlo,monospace'; cx.textAlign = 'center'; cx.textBaseline = 'bottom';
      var mw = cx.measureText(men).width + 8 * sz, my = y - 2 * r - 1.5;
      cx.fillStyle = 'rgba(4,8,10,.78)'; cx.fillRect(p.x - mw / 2 + shake, my - 13 * sz, mw, 13.5 * sz);
      cx.fillStyle = TEAM[u.side].main; cx.fillRect(p.x - mw / 2 + shake, my - 13 * sz, 2, 13.5 * sz);
      cx.fillStyle = B.clock - u.hitT < 0.15 ? '#ffd2c8' : '#ffffff'; cx.fillText(men, p.x + shake + 1, my + 0.5);
      if (u.boss) {
        cx.font = '900 ' + Math.round(10 * sz) + 'px -apple-system,sans-serif'; cx.fillStyle = '#f1c453';
        cx.strokeText('BOSS', p.x, y - 2 * r - 15 * sz); cx.fillText('BOSS', p.x, y - 2 * r - 15 * sz);
      }
      if (u.hero) {
        var hx = p.x + r * 2.0, hy = y - r, hr = r * 0.78;
        var prog = skillProg(u.id);
        cx.fillStyle = '#f1c453'; cx.beginPath(); cx.arc(hx, hy, hr, 0, Math.PI * 2); cx.fill();
        cx.strokeStyle = 'rgba(0,0,0,.5)'; cx.lineWidth = 2.4; cx.beginPath(); cx.arc(hx, hy, hr + 2.2, 0, Math.PI * 2); cx.stroke();
        cx.strokeStyle = prog >= 1 ? '#fff' : '#ffe58a'; cx.beginPath(); cx.arc(hx, hy, hr + 2.2, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); cx.stroke();
        cx.fillStyle = '#2a2008'; cx.font = '900 ' + Math.round(hr * 1.25) + 'px -apple-system,"Hiragino Sans",sans-serif'; cx.textBaseline = 'middle';
        cx.fillText(TF.HERO[u.hero].name.charAt(0), hx, hy + 0.5);
      }
      if (u.ecmd && u.side === 1) {
        var ex2 = p.x + r * 2.0, ey2 = y - r, er = r * 0.82;
        cx.fillStyle = '#c0281c'; cx.beginPath(); cx.arc(ex2, ey2, er, 0, Math.PI * 2); cx.fill();
        cx.strokeStyle = '#ffd9a0'; cx.lineWidth = 2; cx.beginPath(); cx.arc(ex2, ey2, er + 1.5, 0, Math.PI * 2); cx.stroke();
        cx.fillStyle = '#fff'; cx.font = '900 ' + Math.round(er * 1.2) + 'px -apple-system,"Hiragino Sans",sans-serif'; cx.textBaseline = 'middle';
        cx.fillText('将', ex2, ey2 + 0.5);
        if (B.ewarn && B.ewarn.s === u.id) {
          var left = Math.max(0, B.ewarn.at - B.clock);
          cx.font = '900 ' + Math.round(15 * sz) + 'px -apple-system,"Hiragino Sans",sans-serif'; cx.textBaseline = 'bottom';
          cx.lineWidth = 4; cx.strokeStyle = 'rgba(40,0,0,.85)'; cx.strokeText('発動まで ' + left.toFixed(1), p.x, y - 2 * r - 18 * sz);
          cx.fillStyle = '#ff6a5a'; cx.fillText('発動まで ' + left.toFixed(1), p.x, y - 2 * r - 18 * sz);
        }
      }
      if (u.dest || u.reserve) {
        var sx = p.x - r * 2.0, sy = y - r;
        cx.fillStyle = u.dest ? '#7fc6ff' : '#9cffb0';
        cx.beginPath(); cx.arc(sx, sy, r * 0.72, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = '#1a1a14'; cx.font = '900 ' + Math.round(r * 1.0) + 'px -apple-system,"Hiragino Sans",sans-serif'; cx.textBaseline = 'middle';
        cx.fillText(u.dest ? '守' : '援', sx, sy + 0.5);
      }
    }
    var PATHS = {};
    function path(t) {
      if (!PATHS[t]) PATHS[t] = UPATH[t].map(function (d) { return new Path2D(d); });
      return PATHS[t];
    }
    // ミサイル・ロケットの煙の尾(飛んだ跡に煙を残す)
    function trail(p, c, pos) {
      if (p.lastTrail !== undefined && c - p.lastTrail < 0.03) return;
      p.lastTrail = c;
      var k = (c - p.t0) / (p.t1 - p.t0), wx = p.x0 + (p.x1 - p.x0) * k, wy = p.y0 + (p.y1 - p.y0) * k, g0 = proj(wx, wy);
      part(wx, wy, { oy: pos.y - g0.y, ox: pos.x - g0.x, vx: (Math.random() - 0.5) * 4, vy: -3, life: p.kind === 'rocket' ? 1.1 : 0.7, r: p.kind === 'rocket' ? 1.5 : 1.0, c: 'trail' });
    }
    function drawProj(p) {
      var c = B.clock, pos = projPos(p, c);
      if (!pos) return;
      if (p.kind === 'inf') {
        var prev = projPos(p, Math.max(p.t0, c - 0.055)) || pos;
        cx.save(); cx.globalCompositeOperation = 'lighter';
        cx.strokeStyle = 'rgba(255,190,90,.35)'; cx.lineWidth = 3.4; cx.beginPath(); cx.moveTo(prev.x, prev.y); cx.lineTo(pos.x, pos.y); cx.stroke();
        cx.strokeStyle = 'rgba(255,244,190,.95)'; cx.lineWidth = 1.3; cx.beginPath(); cx.moveTo(prev.x, prev.y); cx.lineTo(pos.x, pos.y); cx.stroke();
        cx.restore();
      } else if (p.kind === 'tank') {
        var pv = projPos(p, Math.max(p.t0, c - 0.07)) || pos;
        cx.save(); cx.globalCompositeOperation = 'lighter';
        cx.strokeStyle = 'rgba(255,170,80,.45)'; cx.lineWidth = 6; cx.beginPath(); cx.moveTo(pv.x, pv.y); cx.lineTo(pos.x, pos.y); cx.stroke();
        cx.strokeStyle = 'rgba(255,236,180,.95)'; cx.lineWidth = 2.2; cx.beginPath(); cx.moveTo(pv.x, pv.y); cx.lineTo(pos.x, pos.y); cx.stroke();
        cx.fillStyle = '#fff6d8'; cx.beginPath(); cx.arc(pos.x, pos.y, 2.8, 0, Math.PI * 2); cx.fill();
        cx.restore();
        if (c - p.t0 < 0.05 && !p.mz) { p.mz = 1; part(p.x0, p.y0, { oy: -4, life: 0.14, r: 7, c: 'flash' }); for (var mz = 0; mz < 3; mz++) part(p.x0, p.y0, { vx: (Math.random() - 0.5) * 18, vy: -8 - Math.random() * 8, life: 0.8, r: 1.6, c: 'dust' }); }
      } else if (p.kind === 'at') {
        trail(p, c, pos);
        var nx = projPos(p, c + 0.01) || pos, ang = Math.atan2(nx.y - pos.y, nx.x - pos.x);
        cx.save(); cx.translate(pos.x, pos.y); cx.rotate(ang);
        cx.fillStyle = '#ffb347'; cx.beginPath(); cx.moveTo(-4, 0); cx.lineTo(-10 - Math.random() * 5, -2.2); cx.lineTo(-10 - Math.random() * 5, 2.2); cx.fill();
        cx.fillStyle = '#e0e2d6'; cx.fillRect(-4, -1.6, 8, 3.2); cx.fillStyle = '#c0392b'; cx.fillRect(3, -1.6, 2, 3.2);
        cx.restore();
      } else if (p.kind === 'rocket') {
        trail(p, c, pos);
        cx.save(); cx.globalCompositeOperation = 'lighter'; var gr0 = cx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, 14);
        gr0.addColorStop(0, 'rgba(255,220,140,.75)'); gr0.addColorStop(1, 'rgba(255,120,40,0)'); cx.fillStyle = gr0; cx.beginPath(); cx.arc(pos.x, pos.y, 14, 0, Math.PI * 2); cx.fill(); cx.restore();
        var nr = projPos(p, Math.min(p.t1, c + 0.012)) || pos, ar = Math.atan2(nr.y - pos.y, nr.x - pos.x);
        cx.save(); cx.translate(pos.x, pos.y); cx.rotate(ar);
        cx.fillStyle = 'rgba(255,200,90,.9)'; cx.beginPath(); cx.moveTo(-7, 0); cx.lineTo(-17 - Math.random() * 8, -3.5); cx.lineTo(-17 - Math.random() * 8, 3.5); cx.fill();
        cx.fillStyle = '#e9ece2'; cx.fillRect(-7, -2.4, 13, 4.8);
        cx.fillStyle = p.side === 0 ? TEAM[0].main : TEAM[1].main; cx.beginPath(); cx.moveTo(6, -2.4); cx.lineTo(10, 0); cx.lineTo(6, 2.4); cx.fill();
        cx.fillStyle = '#7d8278'; cx.fillRect(-7, -3.6, 3, 1.2); cx.fillRect(-7, 2.4, 3, 1.2);
        cx.restore();
      } else if (p.kind === 'art') {
        cx.fillStyle = 'rgba(0,0,0,.22)'; cx.beginPath(); cx.ellipse(pos.gx, pos.gy, 4 * pos.s + 1, 1.8 * pos.s + 0.6, 0, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = p.big ? '#ffcf5a' : '#2b2b26'; cx.beginPath(); cx.arc(pos.x, pos.y, 3.5 * pos.s + 1.2, 0, Math.PI * 2); cx.fill();
        cx.strokeStyle = 'rgba(255,220,150,.55)'; cx.lineWidth = 1.2; cx.beginPath(); cx.arc(pos.x, pos.y, 5 * pos.s + 1.5, 0, Math.PI * 2); cx.stroke();
      }
    }
    function drawParts() {
      B.parts.forEach(function (p) {
        var q = proj(p.wx, p.wy), sc = q.k / p.k0, x = q.x + p.ox * sc, y = q.y + p.oy * sc, r = p.r * sc;
        if (x < -40 || x > W + 40 || y < -40 || y > H + 40) return;
        var a = Math.max(0, p.life / p.max);
        if (p.c === 'flash' || p.c === 'spark' || p.c === 'glow') {
          cx.save(); cx.globalCompositeOperation = 'lighter';
          if (p.c === 'flash') {
            var fr = r * (0.7 + 0.5 * (1 - a)), gf = cx.createRadialGradient(x, y, 0, x, y, fr);
            gf.addColorStop(0, 'rgba(255,255,230,' + a + ')'); gf.addColorStop(0.3, 'rgba(255,200,90,' + (0.8 * a) + ')'); gf.addColorStop(1, 'rgba(255,90,20,0)');
            cx.fillStyle = gf; cx.beginPath(); cx.arc(x, y, fr, 0, Math.PI * 2); cx.fill();
          } else if (p.c === 'glow') {
            var gg = cx.createRadialGradient(x, y, 0, x, y, r);
            gg.addColorStop(0, 'rgba(255,220,140,' + (0.7 * a) + ')'); gg.addColorStop(1, 'rgba(255,120,40,0)');
            cx.fillStyle = gg; cx.beginPath(); cx.arc(x, y, r, 0, Math.PI * 2); cx.fill();
          } else {
            cx.strokeStyle = 'rgba(255,' + Math.round(170 + 80 * a) + ',90,' + a + ')'; cx.lineWidth = 1.3;
            cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - p.vx * 0.025 * sc, y - p.vy * 0.025 * sc); cx.stroke();
          }
          cx.restore(); return;
        }
        if (p.c === 'trail') { cx.fillStyle = 'rgba(205,205,195,' + (a * 0.42) + ')'; cx.beginPath(); cx.arc(x, y, r * (1 + 1.6 * (1 - a)), 0, Math.PI * 2); cx.fill(); return; }
        if (p.c === 'fire') { cx.save(); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = 'rgba(255,' + Math.round(120 + 120 * a) + ',' + Math.round(40 * a) + ',' + (a * 0.9) + ')'; cx.beginPath(); cx.arc(x, y, r * (0.6 + 0.6 * (1 - a)), 0, Math.PI * 2); cx.fill(); cx.restore(); }
        else if (p.c === 'heal') { cx.fillStyle = 'rgba(140,255,160,' + (a * 0.9) + ')'; cx.font = '900 ' + Math.max(8, Math.round(r * 6)) + 'px sans-serif'; cx.textAlign = 'center'; cx.fillText('+', x, y); }
        else if (p.c === 'smoke' || p.c === 'dust') { cx.fillStyle = (p.c === 'dust' ? 'rgba(200,185,150,' : 'rgba(70,70,64,') + (a * 0.5) + ')'; cx.beginPath(); cx.arc(x, y, r * (1 + (1 - a)), 0, Math.PI * 2); cx.fill(); }
        else if (p.c === 'debris') { cx.fillStyle = 'rgba(60,50,40,' + a + ')'; cx.fillRect(x, y, r * 1.6 + 0.8, r * 1.6 + 0.8); }
        else if (p.c === 'shock') {
          var rr2 = r * (0.3 + 1.0 * (1 - a));
          cx.fillStyle = 'rgba(255,190,80,' + (0.28 * a) + ')'; cx.beginPath(); cx.ellipse(x, y, rr2, rr2 * 0.55, 0, 0, Math.PI * 2); cx.fill();
          cx.strokeStyle = 'rgba(255,150,40,' + (0.9 * a) + ')'; cx.lineWidth = 3; cx.stroke();
        }
        else if (p.c === 'ring') { cx.strokeStyle = 'rgba(255,230,160,' + a + ')'; cx.lineWidth = 2.5; cx.beginPath(); cx.ellipse(x, y, r * (1.3 - a), r * (1.3 - a) * 0.5, 0, 0, Math.PI * 2); cx.stroke(); }
      });
    }
    var GRADE = null;
    function grade() {
      if (!GRADE || GRADE.w !== W || GRADE.h !== H) {
        var c2 = document.createElement('canvas'); c2.width = Math.max(1, Math.round(W)); c2.height = Math.max(1, Math.round(H));
        var g3 = c2.getContext('2d'), lg = g3.createLinearGradient(0, 0, 0, H);
        lg.addColorStop(0, 'rgba(40,80,120,.16)'); lg.addColorStop(0.55, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(255,150,60,.08)');
        g3.fillStyle = lg; g3.fillRect(0, 0, W, H);
        var vg2 = g3.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.42, W / 2, H * 0.48, Math.max(W, H) * 0.78);
        vg2.addColorStop(0, 'rgba(0,0,0,0)'); vg2.addColorStop(1, 'rgba(0,0,0,.32)');
        g3.fillStyle = vg2; g3.fillRect(0, 0, W, H);
        GRADE = { c: c2, w: W, h: H };
      }
      cx.drawImage(GRADE.c, 0, 0, W, H);
    }
    function drawScorch() {
      if (!B.scorch) return;
      var now = fxNow();
      B.scorch.forEach(function (sc) {
        var a = Math.max(0, 1 - (now - sc.t) / 30);
        if (a <= 0) return;
        var p = proj(sc.wx, sc.wy), r = sc.r * p.k;
        if (p.x < -r || p.x > W + r || p.y < -r || p.y > H + r) return;
        var g2 = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g2.addColorStop(0, 'rgba(20,14,10,' + (0.55 * a) + ')'); g2.addColorStop(0.6, 'rgba(30,22,14,' + (0.3 * a) + ')'); g2.addColorStop(1, 'rgba(30,22,14,0)');
        cx.fillStyle = g2; cx.beginPath(); cx.ellipse(p.x, p.y, r, r * 0.5, 0, 0, Math.PI * 2); cx.fill();
        if (now - sc.t < 4) { cx.save(); cx.globalCompositeOperation = 'lighter'; cx.fillStyle = 'rgba(255,110,30,' + (0.25 * (1 - (now - sc.t) / 4)) + ')'; cx.beginPath(); cx.ellipse(p.x, p.y, r * 0.45, r * 0.22, 0, 0, Math.PI * 2); cx.fill(); cx.restore(); }
      });
    }
    function drawPillars() {
      var now = fxNow();
      B.pillars.forEach(function (pl) {
        var t = now - pl.t;
        if (t < 0) return;
        var p = proj(pl.wx, pl.wy), k = p.k * pl.big;
        var a = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.15) / 1.0);
        var w = 9 * k, h = 55 * k * (0.6 + 0.4 * Math.min(1, t / 0.3));
        var gr = cx.createLinearGradient(0, p.y - h, 0, p.y);
        gr.addColorStop(0, 'rgba(' + TEAM[pl.side].rgb + ',0)'); gr.addColorStop(1, 'rgba(' + TEAM[pl.side].rgb + ',' + (0.45 * a) + ')');
        cx.fillStyle = gr; cx.fillRect(p.x - w / 2, p.y - h, w, h);
        var gc = cx.createLinearGradient(0, p.y - h, 0, p.y);
        gc.addColorStop(0, 'rgba(255,255,255,0)'); gc.addColorStop(1, 'rgba(255,255,255,' + (0.6 * a) + ')');
        cx.fillStyle = gc; cx.fillRect(p.x - w * 0.12, p.y - h * 0.9, w * 0.24, h * 0.9);
        cx.strokeStyle = 'rgba(' + TEAM[pl.side].rgb + ',' + a + ')'; cx.lineWidth = 2;
        cx.beginPath(); cx.ellipse(p.x, p.y, w * 0.7 * (1 + t), w * 0.28 * (1 + t), 0, 0, Math.PI * 2); cx.stroke();
      });
    }
    function drawMarks() {
      B.marks.forEach(function (m) {
        var p = proj(m.wx, m.wy);
        if (p.y < -20 || p.y > H + 20 || p.x < -20 || p.x > W + 20) return;
        var spr = SPR[m.side][m.kind];
        var age = B.clock - m.t;
        cx.globalAlpha = m.kind === 'wreck' ? 1 : Math.max(0.25, 1 - age / 8);
        var w = spr.w * p.k * m.big, h = spr.h * p.k * m.big;
        if (m.flip) { cx.save(); cx.translate(p.x, 0); cx.scale(-1, 1); cx.drawImage(spr.c, -w / 2, p.y - h, w, h); cx.restore(); }
        else cx.drawImage(spr.c, p.x - w / 2, p.y - h, w, h);
        cx.globalAlpha = 1;
        if (m.kind === 'wreck' && Math.random() < 0.06) part(m.wx, m.wy, { oy: -2 * p.k, vx: 2, vy: -14, life: 1.1, r: 0.8, c: 'smoke' });
      });
    }
    function totalMen(side) {
      var n = 0;
      B.units.forEach(function (u) { if (u.side === side) n += Math.ceil(u.hp / u.maxHp * u.troop); });
      return n;
    }
    function drawHud() {
      var g = cx.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, 'rgba(6,10,13,.94)'); g.addColorStop(1, 'rgba(6,10,13,.72)');
      cx.fillStyle = g; cx.fillRect(0, 0, W, 62);
      cx.fillStyle = 'rgba(245,184,61,.55)'; cx.fillRect(0, 61, W, 1);
      // ステージ名(左)と、拠点・残り時間(右)
      cx.textBaseline = 'top'; cx.textAlign = 'left';
      cx.fillStyle = '#f5b83d'; cx.font = '700 9px "SF Mono",ui-monospace,Menlo,monospace'; cx.fillText('OP.' + B.info.s, 12, 6);
      cx.fillStyle = '#e8eef1'; cx.font = '800 13px -apple-system,"Hiragino Sans",sans-serif';
      cx.fillText(B.info.place + (B.info.boss ? '(ボス戦)' : ''), 12 + cx.measureText('OP.' + B.info.s).width * 0.72 + 8, 5);
      var tl = Math.max(0, TF.K.maxT - B.clock), mine = B.posts.filter(function (p) { return p.owner === 0; }).length;
      var tt = B.phase === 'deploy' ? '配置中' : B.phase === 'intro' ? '展開中' : Math.floor(Math.ceil(tl) / 60) + ':' + ('0' + Math.ceil(tl) % 60).slice(-2);
      cx.textAlign = 'right'; cx.font = '800 13px "SF Mono",ui-monospace,Menlo,monospace';
      var tw = cx.measureText(tt).width + 14;
      cx.fillStyle = 'rgba(0,0,0,.55)'; cx.fillRect(W - 12 - tw, 3, tw, 19);
      cx.strokeStyle = tl < 15 && B.phase === 'fight' ? '#ff5a4e' : 'rgba(245,184,61,.6)'; cx.lineWidth = 1; cx.strokeRect(W - 12 - tw + 0.5, 3.5, tw - 1, 18);
      cx.fillStyle = tl < 15 && B.phase === 'fight' ? '#ff8b78' : '#ffd98a'; cx.fillText(tt, W - 19, 6);
      cx.fillStyle = '#9db0ba'; cx.font = '800 12px -apple-system,"Hiragino Sans",sans-serif';
      cx.fillText('拠点' + mine + '/' + B.posts.length, W - 20 - tw, 6);
      // 兵力のバー(斜めの端・目盛り)
      var bw = (W - 36) / 2;
      [[0, 12, '自軍', ['#13806a', '#2fd6a6', '#a6f7e2']], [1, 24 + bw, '敵軍', ['#a3231b', '#ff4a3d', '#ffb0a6']]].forEach(function (a) {
        var f = sideFrac(a[0]), x = a[1], y = 29, hgt = 20, k = 7;
        function bar(w0) { cx.beginPath(); cx.moveTo(x + k, y); cx.lineTo(x + w0, y); cx.lineTo(x + w0 - k, y + hgt); cx.lineTo(x, y + hgt); cx.closePath(); }
        bar(bw); cx.fillStyle = 'rgba(0,0,0,.7)'; cx.fill(); cx.strokeStyle = a[0] ? 'rgba(255,74,61,.45)' : 'rgba(47,214,166,.45)'; cx.lineWidth = 1; cx.stroke();
        if (f > 0) {
          var gg = cx.createLinearGradient(x, 0, x + bw, 0); gg.addColorStop(0, a[3][0]); gg.addColorStop(1, a[3][1]);
          cx.save(); bar(bw); cx.clip(); bar(Math.max(k + 2, bw * f)); cx.fillStyle = gg; cx.fill();
          cx.fillStyle = 'rgba(255,255,255,.18)'; cx.fillRect(x, y, bw * f, 3);
          cx.strokeStyle = 'rgba(0,0,0,.35)'; cx.lineWidth = 1;
          for (var q = 1; q < 10; q++) { var tx = x + bw * q / 10; cx.beginPath(); cx.moveTo(tx + 3, y); cx.lineTo(tx - 3, y + hgt); cx.stroke(); }
          cx.restore();
        }
        cx.textAlign = 'left'; cx.textBaseline = 'middle'; cx.lineWidth = 3; cx.strokeStyle = 'rgba(0,0,0,.7)';
        cx.fillStyle = a[3][2]; cx.font = '800 11px -apple-system,"Hiragino Sans",sans-serif';
        cx.strokeText(a[2], x + 10, y + hgt / 2 + 0.5); cx.fillText(a[2], x + 10, y + hgt / 2 + 0.5);
        var lw = cx.measureText(a[2]).width;
        cx.fillStyle = '#fff'; cx.font = '800 12px "SF Mono",ui-monospace,Menlo,monospace';
        var sn = fmt(totalMen(a[0]));
        cx.strokeText(sn, x + 16 + lw, y + hgt / 2 + 0.5); cx.fillText(sn, x + 16 + lw, y + hgt / 2 + 0.5);
      });
    }
    function rr(x, y, w, h, r) {
      cx.beginPath(); cx.moveTo(x + r, y); cx.arcTo(x + w, y, x + w, y + h, r); cx.arcTo(x + w, y + h, x, y + h, r); cx.arcTo(x, y + h, x, y, r); cx.arcTo(x, y, x + w, y, r); cx.closePath();
    }
    // 帯に出す顔(SVGを画像にして描く)
    var PIMG = {};
    function portraitImg(key) {
      if (PIMG[key]) return PIMG[key].ok ? PIMG[key].img : null;
      var ak = (key.charAt(0) === 'e' ? 'e.' : 'h.') + key.slice(2);
      if (ART.has(ak)) {
        var src = new Image(), r2 = { img: null, ok: false };
        PIMG[key] = r2;
        src.onload = function () {
          var c = document.createElement('canvas'), N = 128, f = ART.face(ak), z = 1.3, sw = src.width / z;
          var sx = Math.max(0, Math.min(src.width - sw, f[0] * src.width - sw / 2)), sy = Math.max(0, Math.min(src.height - sw, f[1] * src.height - sw / 2));
          c.width = c.height = N; c.getContext('2d').drawImage(src, sx, sy, sw, sw, 0, 0, N, N);
          r2.img = c; r2.ok = true;
        };
        src.src = ART.url(ak);
        return null;
      }
      var svg = key.charAt(0) === 'e' ? ecmdSvg(key.slice(2)) : heroSvg(key.slice(2));
      if (!svg) return null;
      var img = new Image(), rec = { img: img, ok: false };
      PIMG[key] = rec;
      img.onload = function () { rec.ok = true; };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" '));
      return null;
    }
    function drawBanner() {
      var b = B.banner; if (!b) return;
      var k = b.t < 0.18 ? b.t / 0.18 : b.t > 1.0 ? 1 - (b.t - 1.0) / 0.2 : 1;
      // 下のスキルボタンに隠れないよう、その上に出す
      if (b.y === undefined) {
        var sbEl = $('skillBar'), cvr = cv.getBoundingClientRect(), sbr = sbEl && !sbEl.classList.contains('hidden') ? sbEl.getBoundingClientRect() : null;
        b.y = Math.min(H - 58 - 14, sbr && sbr.height ? sbr.top - cvr.top - 58 - 8 : H);
      }
      var h = 58, y = b.y;
      var off = (1 - Math.min(1, b.t / 0.18)) * W * (b.side ? 1 : -1);
      cx.save(); cx.globalAlpha = Math.max(0, k);
      var g = cx.createLinearGradient(0, 0, W, 0);
      var c1 = b.side === 0 ? 'rgba(12,30,36,' : 'rgba(60,8,8,';
      g.addColorStop(0, c1 + '0)'); g.addColorStop(0.15, c1 + '.94)'); g.addColorStop(0.85, c1 + '.94)'); g.addColorStop(1, c1 + '0)');
      cx.fillStyle = g; cx.fillRect(off, y, W, h);
      // 斜めの縞と、上下の光る線
      cx.save(); cx.beginPath(); cx.rect(off, y, W, h); cx.clip();
      cx.strokeStyle = b.side === 0 ? 'rgba(245,184,61,.08)' : 'rgba(255,77,77,.1)'; cx.lineWidth = 6;
      for (var sx = -h; sx < W + h; sx += 18) { cx.beginPath(); cx.moveTo(off + sx, y + h); cx.lineTo(off + sx + h, y); cx.stroke(); }
      cx.restore();
      var acc = b.side === 0 ? '#f5b83d' : '#ff4d4d';
      cx.fillStyle = acc; cx.shadowColor = acc; cx.shadowBlur = 10; cx.fillRect(off, y, W, 2); cx.fillRect(off, y + h - 2, W, 2); cx.shadowBlur = 0;
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      // 顔(指揮官・敵将)
      var pim = b.portrait ? portraitImg(b.portrait) : null, tx0 = W / 2 + off;
      if (pim) {
        var ps = h + 18, px = (b.side ? W - ps - 10 : 10) + off, py = y - 9;
        cx.save(); cx.beginPath(); cx.moveTo(px + 8, py); cx.lineTo(px + ps, py); cx.lineTo(px + ps, py + ps - 8); cx.lineTo(px + ps - 8, py + ps); cx.lineTo(px, py + ps); cx.lineTo(px, py + 8); cx.closePath();
        cx.fillStyle = '#000'; cx.fill(); cx.clip(); cx.drawImage(pim, px, py, ps, ps); cx.restore();
        cx.strokeStyle = b.side === 0 ? '#f5b83d' : '#ff4d4d'; cx.lineWidth = 1.5;
        cx.beginPath(); cx.moveTo(px + 8, py); cx.lineTo(px + ps, py); cx.lineTo(px + ps, py + ps - 8); cx.lineTo(px + ps - 8, py + ps); cx.lineTo(px, py + ps); cx.lineTo(px, py + 8); cx.closePath(); cx.stroke();
        tx0 = b.side ? (W - ps - 10) / 2 + off : (W + ps + 10) / 2 + off;
      }
      cx.fillStyle = '#e8eef1'; cx.font = '700 11.5px -apple-system,"Hiragino Sans",sans-serif';
      cx.fillText(b.name + ' ・ ' + b.sub, tx0, y + 15, W - (pim ? h + 40 : 20));
      cx.fillStyle = b.side === 0 ? '#ffd98a' : '#ffb0a6'; cx.font = '900 25px -apple-system,"Hiragino Sans",sans-serif';
      cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.55)'; cx.strokeText('「' + b.skill + '!」', tx0, y + 39, W - (pim ? h + 40 : 20));
      cx.fillText('「' + b.skill + '!」', tx0, y + 39, W - (pim ? h + 40 : 20));
      cx.restore();
    }
    function drawEnding() {
      var t = B.endT - 0.45;
      if (t < 0) return;
      var k = Math.min(1, t / 0.35);
      cx.fillStyle = 'rgba(0,0,0,' + (0.22 * k) + ')'; cx.fillRect(0, 0, W, H);
      var win = B.res.win;
      var s = 0.6 + 0.4 * (1 - Math.pow(1 - k, 3));
      cx.save(); cx.translate(W / 2, H * 0.6); cx.scale(s, s); cx.globalAlpha = k;
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.font = '900 58px -apple-system,"Hiragino Sans",sans-serif';
      cx.lineWidth = 8; cx.strokeStyle = win ? '#2a4a10' : '#222';
      var label = win ? '勝利!' : B.res.timeout ? '時間切れ' : '敗北…';
      cx.strokeText(label, 0, 0);
      cx.fillStyle = win ? '#f1c453' : '#c9b0a6'; cx.fillText(label, 0, 0);
      cx.font = '800 14px -apple-system,"Hiragino Sans",sans-serif'; cx.lineWidth = 4;
      var sub = win ? '敵部隊を撃破!' : '兵は無事に撤退しました';
      cx.strokeText(sub, 0, 44); cx.fillStyle = '#fff'; cx.fillText(sub, 0, 44);
      cx.restore();
    }
    function draw() {
      if (SPR && SPR.retry && ['inf', 'at', 'tank', 'art'].every(function (t) { return uImg('u.' + t + '.1') && uImg('u.' + t + '.2') && uImg('u.' + t + '.3'); })) SPR = null;
      if (!SPR) makeSprites();
      var key = CAM.x.toFixed(1) + ',' + CAM.y.toFixed(1) + ',' + CAM.z.toFixed(3) + ',' + W + ',' + H;
      if (key !== bgKey) { drawGround(); bgKey = key; }
      cx.setTransform(DPR, 0, 0, DPR, 0, 0);
      cx.clearRect(0, 0, W, H);
      cx.save();
      if (B.shake > 0) cx.translate((Math.random() - 0.5) * B.shake, (Math.random() - 0.5) * B.shake);
      drawScorch();
      drawPosts();
      drawMarks();
      var order = B.units.slice().sort(function (a, b) { return b.wy - a.wy; });
      // 壁より奥の部隊 → 壁 → 手前の部隊 の順に描く
      var wallY = F0 + 3;
      drawMarch();
      order.forEach(function (u) { if (u.wy > wallY) drawSquad(u); });
      drawWalls();
      order.forEach(function (u) { if (u.wy <= wallY) drawSquad(u); });
      drawAims();
      drawPillars();
      B.sights.forEach(function (m) {
        var p = proj(m.u.wx, m.u.wy), k = (B.clock - m.t0) / 0.45, r = (34 - 16 * k) * (0.6 + 0.4 * p.s);
        cx.strokeStyle = '#ff3b3b'; cx.lineWidth = 2.5;
        cx.beginPath(); cx.arc(p.x, p.y - 4, r, 0, Math.PI * 2); cx.stroke();
        cx.beginPath(); cx.moveTo(p.x - r - 7, p.y - 4); cx.lineTo(p.x + r + 7, p.y - 4); cx.moveTo(p.x, p.y - r - 11); cx.lineTo(p.x, p.y + r + 3); cx.stroke();
      });
      B.projs.forEach(drawProj);
      drawAir();
      B.beams.forEach(function (bm) {
        var a = bm.life / bm.max, pa = proj(bm.x0, bm.y0), pb = proj(bm.x1, bm.y1);
        cx.strokeStyle = 'rgba(255,240,180,' + a + ')'; cx.lineWidth = 6 * a + 1;
        cx.beginPath(); cx.moveTo(pa.x, pa.y - 6); cx.lineTo(pb.x, pb.y - 6); cx.stroke();
        cx.strokeStyle = bm.c === 'refl' ? 'rgba(255,214,100,' + a + ')' : 'rgba(255,80,60,' + a + ')'; cx.lineWidth = 2;
        cx.beginPath(); cx.moveTo(pa.x, pa.y - 6); cx.lineTo(pb.x, pb.y - 6); cx.stroke();
      });
      drawOrders();
      drawEcmd();
      drawParts();
      order.forEach(drawLabel);
      B.texts.forEach(function (t) {
        var p = proj(t.wx, t.wy), x = p.x + t.jx, y = p.y - t.lift - t.rise;
        var a = Math.min(1, t.life / t.max * 1.6);
        cx.globalAlpha = a; cx.font = '900 ' + t.size + 'px -apple-system,"Hiragino Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.75)'; cx.strokeText(t.s, x, y);
        cx.fillStyle = t.c; cx.fillText(t.s, x, y);
        cx.globalAlpha = 1;
      });
      cx.restore();
      grade();
      drawHud();
      drawJam();
      drawBanner();
      drawHint();
      drawEcmdAlert();
      if (B.ending) drawEnding();
      drawCardGhost();
      drawDeploy();
    }

    // ---- 手動操作・スキル ----
    function skillProg(id) {
      var eu = B.eng.U[id];
      if (!eu.sk) return 0;
      if (B.clock >= eu.skNext) return 1;
      return Math.max(0, Math.min(1, (B.clock - eu.skLast) / Math.max(0.01, eu.skNext - eu.skLast)));
    }
    function showHint(msg, dur) { if (B) B.hint = { msg: msg, t: 0, dur: dur || 2.2 }; }
    function buildSkillBar() {
      var bar = $('skillBar');
      var hs = B.units.filter(function (u) { return u.side === 0 && u.hero; });
      bar.classList.toggle('hidden', !hs.length);
      bar.classList.toggle('many', hs.length >= 6);
      // ボタンに出すスキルの短い名前(2文字)
      var TAG = { charge: '突撃', armor: '装甲', snipe: '必中', barrage: '一斉', heal: '手当', blitz: '電撃', smoke: '煙幕', reflect: '反撃', air: '爆撃', mark: '看破' };
      bar.innerHTML = hs.map(function (u) {
        var hd = TF.HERO[u.hero];
        return '<button class="skb" data-act="skill" data-u="' + u.id + '" id="skb' + u.id + '"><div class="portrait xs">' + heroSvg(u.hero) + '</div>' +
          '<span class="tx"><span class="nm">' + (TAG[hd.skill] || TF.SKILL[hd.skill].name) + '</span><span class="st" id="skst' + u.id + '">準備中</span></span></button>';
      }).join('');
      B.skCache = {};
    }
    function updateSkillBar() {
      B.units.forEach(function (u) {
        if (u.side !== 0 || !u.hero) return;
        var el = $('skb' + u.id);
        if (!el) return;
        var eu = B.eng.U[u.id], p = skillProg(u.id), dead = !eu.alive;
        var ready = !dead && p >= 1 && !B.auto && !B.ending;
        var st = dead ? '戦闘不能' : B.auto ? (p >= 1 ? '発動!' : '自動') : ready ? 'タップ!' : '充填中';
        var key = Math.round(p * 50) + st + ready;
        if (B.skCache[u.id] === key) return;
        B.skCache[u.id] = key;
        el.style.setProperty('--p', p.toFixed(2));
        el.classList.toggle('ready', ready);
        el.classList.toggle('dead', dead);
        $('skst' + u.id).textContent = st;
      });
    }
    function buildCardBar() {
      var bar = $('cardBar');
      var types = Object.keys(B.defs);
      bar.classList.toggle('hidden', !types.length);
      bar.innerHTML = '<div class="pts"><span>増援</span><b id="rpPts">0</b><i><em id="rpBar" style="width:0%"></em></i></div>' +
        types.map(function (t) {
          return '<div class="rcard off" data-type="' + t + '" id="rc-' + t + '">' + allySvg(t) + '<span class="nm">' + TF.UNIT[t].name + '</span><span class="cs">' + TF.K.resCost + '</span></div>';
        }).join('');
      B.rcCache = '';
    }
    function updateCardBar() {
      var info = B.eng.reserveInfo(B.clock);
      var can = !B.auto && !B.ending && B.phase === 'fight' && info.left > 0 && info.pts >= info.cost;
      var key = Math.floor(info.pts * 4) + '|' + info.left + '|' + can + '|' + B.auto;
      if (key === B.rcCache) return;
      B.rcCache = key;
      $('rpPts').textContent = info.left > 0 ? Math.floor(info.pts) : '済';
      $('rpBar').style.width = (info.pts / info.max * 100).toFixed(0) + '%';
      Array.prototype.forEach.call(document.querySelectorAll('#cardBar .rcard'), function (el) {
        el.classList.toggle('on', can);
        el.classList.toggle('off', !can);
        el.querySelector('.cs').textContent = B.auto ? '自動' : info.left > 0 ? '残' + info.left : 'なし';
      });
    }
    function deployCard(type, lane) {
      if (!B || B.ending) return;
      if (B.auto) { showHint('AUTOをOFFにすると、好きなときに増援を出せます'); return; }
      if (B.phase !== 'fight') { showHint(B.phase === 'deploy' ? '配置を決めて「戦闘開始」を押してください' : 'まだ展開中です'); return; }
      var info = B.eng.reserveInfo(B.clock);
      if (info.left <= 0) { showHint('この戦闘の増援は出しきりました'); return; }
      if (info.pts < info.cost) { showHint('増援ポイントがたまっていません(' + info.cost + '必要)'); return; }
      if (B.eng.deploy(type, B.clock, lane === undefined ? undefined : laneOfX(lane)) === null) showHint('いまは増援を出せません');
      updateCardBar(); updateSupBar();
    }
    // カードは、タップでおまかせの位置に、戦場へドラッグするとその列に出す
    var cardDrag = null;
    function cardDown(e) {
      var el = e.target.closest('.rcard');
      if (!el || !B) return;
      e.preventDefault();
      cardDrag = { type: el.dataset.type, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, ghost: null };
    }
    function cardMove(e) {
      if (!cardDrag) return;
      cardDrag.x = e.clientX; cardDrag.y = e.clientY;
      if (!cardDrag.moved && Math.hypot(e.clientX - cardDrag.x0, e.clientY - cardDrag.y0) > 10) {
        cardDrag.moved = true;
        var g = document.createElement('div'); g.className = 'cardghost'; g.innerHTML = allySvg(cardDrag.type);
        document.body.appendChild(g); cardDrag.ghost = g;
      }
      if (cardDrag.ghost) { cardDrag.ghost.style.left = e.clientX + 'px'; cardDrag.ghost.style.top = e.clientY + 'px'; }
    }
    function cardUp(e) {
      if (!cardDrag) return;
      var d = cardDrag; cardDrag = null;
      if (d.ghost) d.ghost.remove();
      if (!B) return;
      if (!d.moved) { deployCard(d.type); return; }
      var r = cv.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        var w = unproj(e.clientX - r.left, e.clientY - r.top);
        deployCard(d.type, w.x);
      }
    }
    function drawCardGhost() {
      if (!cardDrag || !cardDrag.moved) return;
      var r = cv.getBoundingClientRect(), x = cardDrag.x - r.left, y = cardDrag.y - r.top;
      if (x < 0 || x > W || y < 0 || y > H) return;
      var w = unproj(x, y), lane = LANES[laneOfX(w.x)];
      var a = proj(lane, START.p + 70), b = proj(lane, START.p - 20);
      cx.strokeStyle = 'rgba(90,255,120,.8)'; cx.lineWidth = 3; cx.setLineDash([8, 6]);
      cx.beginPath(); cx.moveTo(b.x, b.y); cx.lineTo(a.x, a.y); cx.stroke(); cx.setLineDash([]);
      cx.fillStyle = 'rgba(90,255,120,.25)'; cx.beginPath(); cx.ellipse(a.x, a.y, 16 * a.k / 3, 6 * a.k / 3, 0, 0, Math.PI * 2); cx.fill();
    }
    function setAutoUI() {
      $('btnAuto').classList.toggle('on', B.auto);
      $('autoState').textContent = B.auto ? 'ON' : 'OFF';
      if (B.skCache) B.skCache = {};
    }
    function toggleAuto() {
      if (!B || B.ending) return null;
      B.auto = !B.auto;
      B.eng.setAuto(B.auto, B.clock);
      B.sel = null; B.drag = null;
      if (B.auto) {
        B.units.forEach(function (u) { if (u.side === 0) { B.eng.order(u.id, null); if (u.reserve !== true) u.col = u.homeCol || u.col; } });
        showHint('自動戦闘に切り替えました', 1.6);
      } else {
        showHint('敵へドラッグで集中攻撃/空き地へドラッグで移動/カードで増援', 3.5);
      }
      setAutoUI();
      return B.auto;
    }
    function castSkill(id) {
      if (!B || B.ending) return;
      if (B.auto) { showHint('AUTOをOFFにすると、好きなタイミングで発動できます'); return; }
      if (B.phase !== 'fight') { showHint('まだ展開中です'); return; }
      if (!B.eng.cast(id, B.clock)) showHint(B.eng.U[id].alive ? 'スキルの充填中です' : 'この部隊は戦闘不能です');
    }
    function camReset() { if (B) { B.userCam = false; $('camReset').classList.add('hidden'); } }
    function userCamOn() { if (!B.userCam) { B.userCam = true; $('camReset').classList.remove('hidden'); } }
    function localPt(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function pickSquad(pt, side) {
      var best = null, bd = 1e9;
      B.units.forEach(function (u) {
        if (u.side !== side || u.dead || (side === 1 && !u.vis)) return; // 見えていない敵は選べない
        var c = proj(u.wx, u.wy), lp = proj(u.wx, u.wy + u.farOy * u.big);
        var ly = lp.y - FIGH[u.type] * lp.k * u.big - 12;
        var R = Math.max(30, 10 * c.k * u.big);
        var d = Math.min(Math.hypot(pt.x - c.x, (pt.y - (c.y - 6)) * 1.3), Math.hypot(pt.x - lp.x, pt.y - ly));
        if (d < R && d < bd) { bd = d; best = u; }
      });
      return best;
    }
    // 空き地へドラッグ: その場所へ移動。前線より前なら前進、ずっと後ろなら後退
    // ---- 戦闘前の配置 ----
    // 列の有利・不利(おまかせ配置と同じ考え方): 相性の良い敵が近く、地形が合うほど高い
    function deployForm() {
      return B.units.filter(function (u) { return u.side === 0; }).map(function (u) {
        var f = B.prep.form[u.id] || {}, q = B.prep.p[u.id], o = { type: u.type, hero: f.hero || null, lane: laneOfUnit(u) };
        if (u.free && typeof q.lx === 'number') { o.lx = q.lx; o.adv = q.adv; }
        return o;
      });
    }
    // 自由配置: 落とした場所(配置エリアの中)にそのまま置く。重なるときは少し横へずらす
    function setDeployPos(u, w) {
      var p = clampDep(w.x, w.y), x = p.x, y = p.y;
      for (var it = 0; it < 8; it++) {
        var hit = null;
        B.units.forEach(function (v) { if (v !== u && v.side === 0 && !v.dead && Math.abs(v.col - x) < 13 && Math.abs(v.homeY - y) < 9) hit = v; });
        if (!hit) break;
        var nx = x + (x >= hit.col ? 1 : -1) * 14;
        if (nx < DEP.x0 || nx > DEP.x1) nx = x - (x >= hit.col ? 1 : -1) * 28;
        x = Math.max(DEP.x0, Math.min(DEP.x1, nx));
      }
      var L = laneOfX(x), lx = Math.round(xToLx(x) * 1000) / 1000, adv = Math.round(yToAdv(y) * 1000) / 1000;
      u.free = true; u.col = u.homeCol = x; u.homeY = y; u.jx = 0; u.jy = 0;
      var e = B.eng.U[u.id], q = B.prep.p[u.id];
      e.lane = L; e.lx = lx; q.lane = L; q.lx = lx; q.adv = adv;
      frontRows(0);
      var ft = TF.terrAt(B.info.terrain, lx, (y - F0) / HALF);
      text(x, y, TF.TERRAIN[ft].name + 'に配置', '#cfe9ff', 13, 26);
      deployPredict();
    }
    var predT = 0;
    function deployPredict() {
      var el = $('dpWr');
      if (!el) return;
      el.textContent = '計算中…';
      clearTimeout(predT);
      predT = setTimeout(function () {
        if (!B || B.phase !== 'deploy') return;
        // 敵の布陣は見えないので、いくつかの布陣を想定した予想(本当の布陣は使わない)
        // 出撃画面の予想勝率(おまかせ配置のとき)から始めて、部隊を動かした分だけ上下させる。
        // 動かした分は「想定した布陣」で測るので、数字から敵の本当の場所はわからない
        var blind = TF.predictBlind(st, deployForm(), B.info.s, 40).winRate;
        if (!B.wrBase) B.wrBase = { real: (B.info.s === st.sel ? getWinRate() : TF.predict(st, st.form, B.info.s, 60)).winRate, blind0: blind };
        var wr = Math.max(0.01, Math.min(0.99, B.wrBase.real + (blind - B.wrBase.blind0))), pct = Math.round(wr * 100), wi = wrInfo(wr);
        el.innerHTML = '<span style="color:' + wi[1] + ';white-space:nowrap">予想勝率 ' + pct + '%</span><span class="small" style="display:block;color:var(--dim);font-weight:600"><b style="color:' + wi[1] + '">' + wi[0] + '</b>・配置で上下</span>';
      }, 120);
    }
    function startDeploy() {
      $('skillBar').classList.add('hidden'); $('cardBar').classList.add('hidden');
      var T = B.info.terrain, seen = {};
      seen.plain = 1; (T.blobs || []).forEach(function (b) { seen[b.k] = 1; });
      var bar = $('deployBar');
      bar.innerHTML = '<div><span class="tt">部隊の配置</span> 自軍の側の好きな場所へドラッグ。戦いはマップのどこでも起き、いる場所の地形が効きます。敵は索敵範囲(水色の円)に入るまで見えません。敵からも同じです</div>' +
        '<div class="trn">' + TF.TERRAIN_KEYS.filter(function (k) { return seen[k]; }).map(function (k) { return '<button data-act="terrain-info" data-k="' + k + '"><b>' + TF.TERRAIN[k].name + '</b>' + esc(TF.TERRAIN[k].short) + '</button>'; }).join('') + '</div>' +
        '<div class="row2"><span class="wrp grow" id="dpWr"></span><button class="btn sub" data-act="deploy-auto">おまかせ配置</button><button class="btn" data-act="deploy-go">戦闘開始 ▶</button></div>' +
        '<label><input type="checkbox" data-act="deploy-skipnext"' + (st.flags && st.flags.skipDeploy ? ' checked' : '') + '> 次から配置を省略(おまかせ配置で始める)</label>';
      bar.classList.remove('hidden');
      deployPredict();
    }
    function deployAuto() {
      if (!B || B.phase !== 'deploy') return;
      var f = TF.autoLanes(st, deployForm().map(function (x) { return { type: x.type, hero: x.hero, lane: null }; }), B.info.s);
      B.units.filter(function (u) { return u.side === 0; }).forEach(function (u) {
        var q = B.prep.p[u.id], e = B.eng.U[u.id];
        u.free = false; e.lane = f[u.id].lane; e.lx = e.lane; q.lane = f[u.id].lane; delete q.lx; delete q.adv;
      });
      placeInLanes(0, true);
      showHint('おまかせで配置しました', 1.6);
      deployPredict();
    }
    // 配置を決めて戦闘開始: 決めた列で戦闘を計算し直す
    function deployGo() {
      if (!B || B.phase !== 'deploy') return;
      var form = deployForm();
      B.prep.p.forEach(function (q, i) { q.lane = form[i].lane; });
      var eng = TF.createBattle(B.prep.p, B.prep.e, B.seedB, { record: true, auto: B.auto, reserves: B.prep.reserves, posts: B.prep.posts, terrain: B.prep.terrain });
      B.eng = eng; B.ev = eng.ev; B.ei = 0;
      if (B.onDeploy) B.onDeploy(form);
      B.phase = 'intro'; B.introT = 1.5; B.deployed = true;
      $('deployBar').classList.add('hidden');
      buildSkillBar(); $('cardBar').classList.toggle('hidden', !Object.keys(B.defs || {}).length);
      text(CXW, F0 - 22, '攻撃開始!', '#ffe08a', 18, 30);
      if (!B.auto) showHint('敵へドラッグで集中攻撃/好きな場所へドラッグで移動(着いたらそこで守る)/カードで増援', 4);
    }
    // 射程: 地面に円(砲兵は戦場全体)
    function drawRange(type, wx, wy) {
      var r = TF.K.rng[type];
      if (!(r < TF.K.laneN)) return;
      ringAt(wx, wy, r * LANEW, 'rgba(255,214,90,.10)', 'rgba(255,224,120,.9)', '射程 半径' + r + '列', '#ffe08a', 1);
    }
    function ringAt(wx, wy, rad, fill, stroke, label, lc, top) {
      var n = 44, pts = [];
      for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; pts.push(proj(wx + Math.cos(a) * rad, wy + Math.sin(a) * rad)); }
      cx.save();
      cx.fillStyle = fill; cx.strokeStyle = stroke; cx.lineWidth = 2; cx.setLineDash([7, 4]);
      cx.beginPath(); pts.forEach(function (p, i) { if (i) cx.lineTo(p.x, p.y); else cx.moveTo(p.x, p.y); }); cx.closePath(); cx.fill(); cx.stroke();
      cx.setLineDash([]);
      if (label) {
        var m = proj(wx, wy + (top ? rad : -rad));
        cx.font = '800 11px -apple-system,"Hiragino Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = top ? 'bottom' : 'top';
        var tw = cx.measureText(label).width + 10;
        cx.fillStyle = 'rgba(10,14,9,.8)'; cx.fillRect(m.x - tw / 2, top ? m.y - 17 : m.y + 2, tw, 15);
        cx.fillStyle = lc; cx.fillText(label, m.x, top ? m.y - 3 : m.y + 3);
      }
      cx.restore();
    }
    // 索敵範囲: 地面に円(列の幅=1。奥行きも同じ縮尺)
    function drawDetect(type, wx, wy, strong) {
      var r = TF.K.det[type] * LANEW, n = 40, pts = [];
      for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; pts.push(proj(wx + Math.cos(a) * r, wy + Math.sin(a) * r)); }
      cx.save();
      cx.fillStyle = 'rgba(110,215,255,' + (strong ? 0.2 : 0.07) + ')'; cx.strokeStyle = 'rgba(150,235,255,' + (strong ? 1 : 0.5) + ')'; cx.lineWidth = strong ? 2.4 : 1.4; cx.setLineDash([6, 4]);
      cx.beginPath(); pts.forEach(function (p, i) { if (i) cx.lineTo(p.x, p.y); else cx.moveTo(p.x, p.y); }); cx.closePath(); cx.fill(); cx.stroke();
      cx.setLineDash([]);
      if (strong) {
        // 名前は円の手前の縁に(射程の帯の名前は奥に出る)
        var m = proj(wx, wy - r);
        cx.font = '800 11px -apple-system,"Hiragino Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'top';
        var tl = '索敵 半径' + TF.K.det[type] + '列', tw = cx.measureText(tl).width + 10;
        cx.fillStyle = 'rgba(10,14,9,.8)'; cx.fillRect(m.x - tw / 2, m.y + 2, tw, 15);
        cx.fillStyle = '#bfefff'; cx.fillText(tl, m.x, m.y + 3);
      }
      cx.restore();
    }
    function drawDeploy() {
      if (B.phase !== 'deploy') return;
      var T = B.info.terrain, drag = B.drag && B.drag.deploy && B.drag.moved ? B.drag : null;
      var dl = drag ? laneOfX(unproj(drag.x, drag.y).x) : -1;
      cx.save();
      // 地形の区域の名前(区域の真ん中に。見えている区域だけ)
      cx.font = '700 10px -apple-system,"Hiragino Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      var used = B.units.filter(function (u) { return !u.dead && u.side === 0; }).map(function (u) { var q = proj(u.wx, u.wy); return { x: q.x, y: q.y - 34, w: 46, h: 44 }; });
      (T && T.blobs || []).forEach(function (b) {
        if (TF.terrAt(T, b.x, b.y) !== b.k || Math.abs(b.y) > 1.2) return;
        var c0 = proj(fxW(b.x), fyW(b.y)), nm = TF.TERRAIN[b.k].name;
        if (c0.x < -20 || c0.x > W + 20 || c0.y < 0 || c0.y > H) return;
        var tw = cx.measureText(nm).width + 8;
        // ほかの名前や部隊の札と重なるものは出さない
        if (used.some(function (r) { return Math.abs(r.x - c0.x) < (r.w + tw) / 2 + 2 && Math.abs(r.y - c0.y) < (r.h + 14) / 2 + 2; })) return;
        used.push({ x: c0.x, y: c0.y, w: tw, h: 14 });
        cx.fillStyle = 'rgba(8,14,18,.5)'; cx.fillRect(c0.x - tw / 2, c0.y - 7, tw, 14);
        cx.fillStyle = b.y < 0 ? 'rgba(191,233,200,.9)' : 'rgba(255,201,189,.9)'; cx.fillText(nm, c0.x, c0.y + 0.5);
      });
      // ドラッグ中: 置く場所の射程・索敵範囲と、その場所の地形の効果
      if (drag) {
        var dw0 = unproj(drag.x, drag.y), dp0 = clampDep(dw0.x, dw0.y), ty0 = drag.u.type;
        drawRange(ty0, dp0.x, dp0.y);
        drawDetect(ty0, dp0.x, dp0.y, true);
        var ft = TF.terrAt(T, xToLx(dp0.x), (dp0.y - F0) / HALF), fa = TF.terrAtk(ft, ty0), fk = TF.terrTake(ft, ty0), fm = TF.terrMove(ft, ty0), fp = proj(dp0.x, dp0.y), parts = [];
        if (fa !== 1) parts.push('攻' + (fa > 1 ? '+' : '') + Math.round((fa - 1) * 100) + '%');
        if (fk !== 1) parts.push(fk < 1 ? '守+' + Math.round((1 - fk) * 100) + '%' : '被ダメ+' + Math.round((fk - 1) * 100) + '%');
        if (fm !== 1 && ty0 !== 'art') parts.push(fm > 1 ? '速い' : '遅い');
        var info = '置く場所: ' + TF.TERRAIN[ft].name + (parts.length ? ' ' + parts.join(' ') : '');
        cx.font = '800 12px -apple-system,"Hiragino Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
        var iw = cx.measureText(info).width + 12, ix = Math.max(iw / 2 + 4, Math.min(W - iw / 2 - 4, fp.x));
        cx.fillStyle = 'rgba(10,14,9,.85)'; cx.fillRect(ix - iw / 2, fp.y - 52, iw, 20);
        cx.fillStyle = fa / fk > 1.02 ? '#9cffb0' : fa / fk < 0.98 ? '#ffb3a8' : '#ffe08a'; cx.fillText(info, ix, fp.y - 42);
      }
      // 配置エリア(前に置くほど早く撃ち始める)
      var a0 = proj(DEP.x0, DEP.y0), a1 = proj(DEP.x1, DEP.y0), a2 = proj(DEP.x1, DEP.y1), a3 = proj(DEP.x0, DEP.y1);
      cx.fillStyle = drag ? 'rgba(140,210,255,.13)' : 'rgba(140,210,255,.06)';
      cx.beginPath(); cx.moveTo(a0.x, a0.y); cx.lineTo(a1.x, a1.y); cx.lineTo(a2.x, a2.y); cx.lineTo(a3.x, a3.y); cx.closePath(); cx.fill();
      cx.strokeStyle = 'rgba(170,225,255,' + (drag ? 0.85 : 0.5) + ')'; cx.lineWidth = 1.5; cx.setLineDash([6, 5]); cx.stroke(); cx.setLineDash([]);
      if (drag) {
        // ドラッグ中だけ、配置エリアの名前を前の端に出す
        var lb = proj(CXW, DEP.y1), lt = '配置エリア(自軍の側ならどこでも)';
        cx.font = '800 11px -apple-system,"Hiragino Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'bottom';
        cx.fillStyle = 'rgba(10,14,9,.7)'; var lw = cx.measureText(lt).width + 10; cx.fillRect(lb.x - lw / 2, lb.y - 17, lw, 15);
        cx.fillStyle = '#cfe9ff'; cx.fillText(lt, lb.x, lb.y - 3);
      }
      if (drag) {
        var dw = unproj(drag.x, drag.y), dp = clampDep(dw.x, dw.y), g0 = proj(dp.x, dp.y);
        cx.strokeStyle = '#ffe08a'; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(g0.x, g0.y, 16 * g0.s, 6 * g0.s, 0, 0, Math.PI * 2); cx.stroke();
      }
      cx.restore();
    }
    function moveSquad(u, w) {
      if (!B.eng.moveTo(u.id, xToLx(w.x), (w.y - F0) / HALF, B.clock)) return;
      text(u.wx, u.wy, '移動', '#cfe9ff', 14, 30);
      part(w.x, w.y, { life: 0.45, r: 6, c: 'ring' });
    }
    function issueOrder(u, target) {
      if (B.eng.order(u.id, target.id)) {
        text(u.wx, u.wy, '攻撃指示!', '#9cffb0', 14, 30);
        part(target.wx, target.wy, { life: 0.4, r: 7, c: 'ring' });
      }
    }
    function pinchInfo() {
      var ids = Object.keys(B.ptrs);
      var a = B.ptrs[ids[0]], b = B.ptrs[ids[1]];
      return { d: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    function onDown(e) {
      if (!B) return;
      var pt = localPt(e);
      B.ptrs[e.pointerId] = pt;
      try { cv.setPointerCapture(e.pointerId); } catch (er) { }
      e.preventDefault();
      if (Object.keys(B.ptrs).length >= 2) {
        // 2本指: 拡大・縮小(指示やスクロールは取り消し)
        B.drag = null; B.pan = null;
        var pi = pinchInfo();
        B.pinch = { d0: pi.d, z0: CAM.z, world: unprojFlat(pi.x, pi.y) };
        return;
      }
      if (B.ending) return;
      if (B.phase === 'deploy') {
        var du = pickSquad(pt, 0);
        if (du) { B.drag = { u: du, deploy: true, x0: pt.x, y0: pt.y, x: pt.x, y: pt.y, moved: false }; return; }
      }
      var u = !B.auto && B.phase !== 'deploy' ? pickSquad(pt, 0) : null;
      if (u) { B.drag = { u: u, x0: pt.x, y0: pt.y, x: pt.x, y: pt.y, moved: false, hover: null }; return; }
      B.pan = { world: unprojFlat(pt.x, pt.y), x0: pt.x, y0: pt.y, moved: false };
    }
    function onMove(e) {
      if (!B || !B.ptrs[e.pointerId]) return;
      var pt = localPt(e);
      B.ptrs[e.pointerId] = pt;
      e.preventDefault();
      if (B.pinch && Object.keys(B.ptrs).length >= 2) {
        var pi = pinchInfo();
        CAM.z = B.pinch.z0 * pi.d / B.pinch.d0;
        clampCam();
        var now = unprojFlat(pi.x, pi.y);
        CAM.x += B.pinch.world.x - now.x; CAM.y += B.pinch.world.y - now.y;
        clampCam();
        userCamOn();
        return;
      }
      if (B.drag) {
        var d = B.drag;
        d.x = pt.x; d.y = pt.y;
        if (Math.hypot(pt.x - d.x0, pt.y - d.y0) > 12) d.moved = true;
        d.hover = d.moved && !d.deploy ? pickSquad(pt, 1) : null;
        return;
      }
      if (B.pan) {
        if (!B.pan.moved && Math.hypot(pt.x - B.pan.x0, pt.y - B.pan.y0) < 8) return;
        B.pan.moved = true;
        var w = unprojFlat(pt.x, pt.y);
        CAM.x += B.pan.world.x - w.x; CAM.y += B.pan.world.y - w.y;
        clampCam();
        userCamOn();
      }
    }
    function onUp(e) {
      if (!B) return;
      var pt = B.ptrs[e.pointerId] || localPt(e);
      delete B.ptrs[e.pointerId];
      if (B.pinch) { if (Object.keys(B.ptrs).length < 2) B.pinch = null; B.pan = null; return; }
      if (B.drag) {
        var d = B.drag;
        B.drag = null;
        B.camHold = performance.now() + 2000;
        if (d.u.dead) return;
        if (d.deploy) {
          if (!d.moved) { showHint('部隊をドラッグして、配置エリアの好きな場所に置けます', 1.8); return; }
          setDeployPos(d.u, unproj(d.x, d.y));
          return;
        }
        if (!d.moved) { B.sel = B.sel === d.u ? null : d.u; if (B.sel) showHint('攻撃する敵部隊をタップ', 1.8); return; }
        if (d.hover) issueOrder(d.u, d.hover);
        else moveSquad(d.u, unproj(d.x, d.y));
        return;
      }
      if (B.pan) {
        var moved = B.pan.moved;
        B.pan = null;
        if (moved || B.ending) return;
        // その場でタップ
        var en = pickSquad(pt, 1);
        if (B.auto) { if (en || pickSquad(pt, 0)) showHint('AUTOをOFFにすると、攻撃目標を指示できます'); return; }
        if (en && B.sel && !B.sel.dead) { issueOrder(B.sel, en); B.sel = null; }
        else if (en) showHint('先に自軍の部隊をタップ(またはドラッグ)してください');
        else B.sel = null;
      }
    }
    function bindInput() {
      var c = $('bcv');
      if (c.__bound) return;
      c.__bound = true;
      c.addEventListener('pointerdown', function (e) { if (B) { cv = c; onDown(e); } });
      c.addEventListener('pointermove', onMove);
      c.addEventListener('pointerup', onUp);
      c.addEventListener('pointercancel', function (e) { if (B) { delete B.ptrs[e.pointerId]; B.drag = null; B.pan = null; B.pinch = null; } });
      var cb = $('cardBar');
      cb.addEventListener('pointerdown', cardDown);
      document.addEventListener('pointermove', cardMove);
      document.addEventListener('pointerup', cardUp);
      document.addEventListener('pointercancel', function () { if (cardDrag && cardDrag.ghost) cardDrag.ghost.remove(); cardDrag = null; });
      c.addEventListener('wheel', function (e) {
        if (!B) return;
        e.preventDefault();
        var pt = localPt(e), before = unprojFlat(pt.x, pt.y);
        CAM.z *= e.deltaY < 0 ? 1.1 : 1 / 1.1;
        clampCam();
        var after = unprojFlat(pt.x, pt.y);
        CAM.x += before.x - after.x; CAM.y += before.y - after.y;
        clampCam();
        userCamOn();
      }, { passive: false });
    }
    function arrow(x0, y0, x1, y1, color, width, dash) {
      var L = Math.hypot(x1 - x0, y1 - y0);
      if (L < 4) return;
      var mx = (x0 + x1) / 2, my = (y0 + y1) / 2 - Math.min(40, L * 0.18);
      cx.save();
      cx.strokeStyle = color; cx.lineWidth = width; cx.lineCap = 'round';
      if (dash) cx.setLineDash(dash);
      cx.beginPath(); cx.moveTo(x0, y0); cx.quadraticCurveTo(mx, my, x1, y1); cx.stroke();
      cx.setLineDash([]);
      var a2 = Math.atan2(y1 - my, x1 - mx), hl = Math.max(9, width * 2.6);
      cx.fillStyle = color;
      cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x1 - Math.cos(a2 - 0.45) * hl, y1 - Math.sin(a2 - 0.45) * hl); cx.lineTo(x1 - Math.cos(a2 + 0.45) * hl, y1 - Math.sin(a2 + 0.45) * hl); cx.closePath(); cx.fill();
      cx.restore();
    }
    function drawOrders() {
      B.units.forEach(function (u) {
        if (u.side !== 0 || u.dead) return;
        var eu = B.eng.U[u.id];
        if (eu.order === null || !B.eng.U[eu.order].alive) return;
        var tg = B.units[eu.order], a = proj(u.wx, u.wy), b = proj(tg.wx, tg.wy);
        arrow(a.x, a.y - 4, b.x, b.y + 4, 'rgba(110,255,140,.75)', 2.5, [7, 6]);
        cx.strokeStyle = 'rgba(110,255,140,.9)'; cx.lineWidth = 2;
        var r = 10 * b.s + 6;
        cx.beginPath(); cx.arc(b.x, b.y - 4, r, 0, Math.PI * 2); cx.moveTo(b.x - r - 4, b.y - 4); cx.lineTo(b.x + r + 4, b.y - 4); cx.stroke();
      });
      if (B.sel && !B.sel.dead) {
        var p = proj(B.sel.wx, B.sel.wy), w = 11 * p.k * B.sel.big;
        cx.strokeStyle = 'rgba(255,255,255,' + (0.6 + 0.35 * Math.sin(fxNow() * 8)) + ')'; cx.lineWidth = 2.5;
        cx.beginPath(); cx.ellipse(p.x, p.y, w * 1.15, w * 0.45, 0, 0, Math.PI * 2); cx.stroke();
      }
      if (B.drag && B.drag.moved) {
        var d = B.drag, s0 = proj(d.u.wx, d.u.wy);
        if (d.hover) {
          var h = proj(d.hover.wx, d.hover.wy), hw = 11 * h.k * d.hover.big;
          cx.strokeStyle = '#ff5a4e'; cx.lineWidth = 3;
          cx.beginPath(); cx.ellipse(h.x, h.y, hw * 1.2, hw * 0.5, 0, 0, Math.PI * 2); cx.stroke();
        }
        if (!d.deploy) {
          if (!d.hover) { var dw2 = unproj(d.x, d.y); drawDetect(d.u.type, dw2.x, dw2.y, true); drawRange(d.u.type, dw2.x, dw2.y); }
          arrow(s0.x, s0.y - 4, d.x, d.y, 'rgba(90,255,120,.95)', 6);
        }
      }
    }
    // 敵将: 予告中は赤い輪が脈打つ。不落要塞の間は敵に青い盾。電子妨害の間は画面にノイズ
    function drawEcmd() {
      if (B.ewarn) {
        var u = B.units[B.ewarn.s];
        if (u && !u.dead) {
          var p = proj(u.wx, u.wy), w = 11 * p.k * u.big, ph = 0.5 + 0.5 * Math.sin(fxNow() * 10);
          cx.strokeStyle = 'rgba(255,60,40,' + (0.55 + 0.4 * ph) + ')'; cx.lineWidth = 3 + 2 * ph;
          cx.beginPath(); cx.ellipse(p.x, p.y, w * (1.6 + 0.3 * ph), w * (0.65 + 0.12 * ph), 0, 0, Math.PI * 2); cx.stroke();
        }
      }
      if (B.buff[1].fort > B.clock) B.units.forEach(function (v) {
        if (v.side !== 1 || v.dead || !v.vis) return;
        var q = proj(v.wx, v.wy), ww = 11 * q.k * v.big;
        cx.strokeStyle = 'rgba(120,200,255,.8)'; cx.lineWidth = 2.5;
        cx.beginPath(); cx.ellipse(q.x, q.y - 4, ww * 1.25, ww * 0.6, 0, 0, Math.PI * 2); cx.stroke();
      });
    }
    // 敵将のスキルの予告: 画面の上に、発動までの秒数をずっと出す(敵将が画面の外にいても気づけるように)。
    // 敵将が画面の外にいるときは、その方向を矢印で示す
    function drawEcmdAlert() {
      var w0 = B.ewarn; if (!w0 || B.ending || B.phase !== 'fight') return;
      var u = B.units[w0.s]; if (!u || u.dead) return;
      var c = TF.ECMD[w0.sk], left = Math.max(0, w0.at - B.clock), k = Math.max(0, Math.min(1, left / c.warn)), ph = 0.5 + 0.5 * Math.sin(fxNow() * 10);
      var bw = Math.min(W - 24, 330), bh = 42, x = W / 2 - bw / 2, y = 106;
      B.ealertT = B.clock;
      cx.save();
      cx.fillStyle = 'rgba(46,8,8,.92)'; cx.fillRect(x, y, bw, bh);
      cx.strokeStyle = 'rgba(255,90,70,' + (0.55 + 0.45 * ph) + ')'; cx.lineWidth = 1.5 + ph; cx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
      var pim = portraitImg('e:' + w0.sk), tx = x + 10;
      if (pim) { cx.drawImage(pim, x + 3, y + 3, bh - 9, bh - 9); tx = x + bh + 1; }
      cx.textBaseline = 'middle'; cx.textAlign = 'left';
      cx.font = '700 10px -apple-system,"Hiragino Sans",sans-serif'; cx.fillStyle = '#ffb3a8'; cx.fillText('敵将「' + c.name + '」がスキルを準備中 ・ 倒せば止められる', tx, y + 11, bw - (tx - x) - 62);
      cx.font = '900 15px -apple-system,"Hiragino Sans",sans-serif'; cx.fillStyle = '#fff'; cx.fillText('〈' + c.skill + '〉', tx - 4, y + 27, bw - (tx - x) - 62);
      cx.textAlign = 'right';
      cx.font = '700 9px -apple-system,"Hiragino Sans",sans-serif'; cx.fillStyle = '#ffb3a8'; cx.fillText('発動まで', x + bw - 9, y + 10);
      cx.font = '900 21px "SF Mono",ui-monospace,Menlo,monospace'; cx.fillStyle = ph > 0.5 ? '#ff6a5a' : '#ffd9d2'; cx.fillText(left.toFixed(1), x + bw - 9, y + 27);
      cx.fillStyle = 'rgba(255,255,255,.14)'; cx.fillRect(x, y + bh - 4, bw, 4);
      cx.fillStyle = '#ff4d4d'; cx.shadowColor = '#ff4d4d'; cx.shadowBlur = 6; cx.fillRect(x, y + bh - 4, bw * k, 4); cx.shadowBlur = 0;
      // 敵将が画面の外(または上の表示の裏)にいるとき: その方向の端に矢印
      var p = proj(u.wx, u.wy), y0 = y + bh + 20, y1 = H - 190;
      if (p.x < 14 || p.x > W - 14 || p.y < y0 - 8 || p.y > y1 + 8) {
        var ax = Math.max(24, Math.min(W - 24, p.x)), ay = Math.max(y0, Math.min(y1, p.y)), an = Math.atan2(p.y - ay, p.x - ax);
        cx.translate(ax, ay);
        cx.fillStyle = 'rgba(46,8,8,.9)'; cx.beginPath(); cx.arc(0, 0, 15, 0, Math.PI * 2); cx.fill();
        cx.strokeStyle = 'rgba(255,90,70,' + (0.6 + 0.4 * ph) + ')'; cx.lineWidth = 2; cx.stroke();
        cx.fillStyle = '#fff'; cx.font = '900 12px -apple-system,"Hiragino Sans",sans-serif'; cx.textAlign = 'center'; cx.fillText('将', 0, 0.5);
        cx.rotate(an); cx.fillStyle = '#ff4d4d'; cx.beginPath(); cx.moveTo(25 + 3 * ph, 0); cx.lineTo(17, -6); cx.lineTo(17, 6); cx.closePath(); cx.fill();
      }
      cx.restore();
    }
    function drawJam() {
      if (!(B.jamUntil > B.clock)) return;
      cx.save();
      cx.fillStyle = 'rgba(30,40,30,.18)'; cx.fillRect(0, 0, W, H);
      for (var i = 0; i < 70; i++) { cx.fillStyle = 'rgba(255,255,255,' + (Math.random() * 0.25) + ')'; cx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 30, 1.2); }
      cx.font = '900 16px -apple-system,"Hiragino Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      cx.lineWidth = 4; cx.strokeStyle = 'rgba(0,0,0,.8)'; var tx = '電子妨害中! 敵が見えない(あと' + Math.ceil(B.jamUntil - B.clock) + '秒)';
      cx.strokeText(tx, W / 2, H * 0.3); cx.fillStyle = '#9cffb0'; cx.fillText(tx, W / 2, H * 0.3);
      cx.restore();
    }
    function drawHint() {
      var h = B.hint; if (!h) return;
      var a = Math.min(1, h.t / 0.2, (h.dur - h.t) / 0.3);
      cx.save(); cx.globalAlpha = Math.max(0, a);
      cx.font = '800 13px -apple-system,"Hiragino Sans",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
      var w = Math.min(W - 24, cx.measureText(h.msg).width + 28), y = 84;
      cx.fillStyle = 'rgba(10,14,9,.85)'; rr(W / 2 - w / 2, y - 16, w, 32, 10); cx.fill();
      cx.strokeStyle = 'rgba(241,196,83,.6)'; cx.lineWidth = 1; cx.stroke();
      cx.fillStyle = '#fff'; cx.fillText(h.msg, W / 2, y + 0.5, w - 16);
      cx.restore();
    }
    window.addEventListener('resize', function () { if (B) resize(); });
    return { play: play, setSpeed: setSpeed, skip: skip, toggleAuto: toggleAuto, castSkill: castSkill, camReset: camReset, deployCard: deployCard, launchSupport: launchSupport, deployGo: deployGo, deployAuto: deployAuto, active: function () { return !!B; },
      debug: function () {
        if (!B) return null;
        return { auto: B.auto, phase: B.phase, clock: B.clock, ending: B.ending, ewarn: B.ewarn ? { s: B.ewarn.s, sk: B.ewarn.sk } : null, ealert: B.ealertT !== undefined && B.clock - B.ealertT < 0.5, ecast: B.ecast || 0, jam: B.jamUntil > B.clock, drag: B.drag ? { id: B.drag.u.id, moved: !!B.drag.moved } : null, pan: !!B.pan, bgDraws: B.bgDraws || 0, cam: { x: CAM.x, y: CAM.y, z: CAM.z, user: B.userCam }, posts: B.posts.map(function (p) { return p.owner; }),
          captured: B.blds.filter(function (b) { return b.home === 1 && b.owner === 0; }).length,
          walls: B.walls.filter(function (w) { return w.ok; }).length, wallsTotal: B.walls.length,
          ruins: B.blds.filter(function (b) { return b.ruin; }).length,
          aims: B.units.filter(function (u) { return !u.dead && u.aim !== null && B.clock - u.aimT < 2.4; }).length,
          rockets: B.projs.filter(function (p) { return p.kind === 'rocket'; }).length,
          reserve: B.eng.reserveInfo(B.clock), spawned: B.ev.filter(function (e) { return e.k === 'spawn'; }).map(function (e) { return e.side; }),
          goals: B.units.filter(function (u) { return u.side === 0; }).map(function (u) { var g = B.eng.U[u.id].goal; return g ? { x: g.x, y: g.y } : null; }),
          spHits: B.spHits || 0, front: B.front,
          postInfo: B.eng.postInfo ? B.eng.postInfo() : null, supCount: B.supCount || [0, 0], air: B.air.length,
          lanes: B.units.map(function (u) { return laneOfUnit(u); }), terrain: B.info.terrain, unitX: B.units.map(function (u) { return u.col; }),
          supEvents: B.ev.filter(function (e) { return e.k === 'sup'; }).map(function (e) { return e.side + ':' + e.kind; }),
          postEvents: B.ev.filter(function (e) { return e.k === 'post'; }).map(function (e) { return e.side + ':' + e.i; }),
          startY: START.p, minAllyY: Math.min.apply(null, B.units.filter(function (u) { return u.side === 0; }).map(function (u) { return u.wy; })),
          units: B.units.map(function (u) { var eu = B.eng.U[u.id]; var p = proj(u.wx, u.wy); return { id: u.id, side: u.side, ecmd: u.ecmd, vis: u.side === 0 || !!u.vis, type: u.type, x: p.x, y: p.y, wx: u.wx, wy: u.wy, ex: eu.mv ? null : eu.x, ey: eu.mv ? null : eu.y, moving: !!u.march, lx: eu.lx, adv: eu.adv, spd: eu.spd, order: eu.order, alive: eu.alive, goal: eu.goal ? { x: eu.goal.x, y: eu.goal.y } : null, reserve: !!eu.reserve, skNext: eu.sk ? eu.skNext : null }; }),
          skills: B.ev.filter(function (e) { return e.k === 'skill' && B.eng.U[e.s].side === 0; }).length };
      },
      // テスト用: 前線から rel だけ前(+)/後ろ(-)の地点の画面座標
      lastSkill: function () { if (!B) return null; var e = B.ev.slice(0, B.ei).filter(function (x) { return x.k === 'skill' && B.units[x.s] && B.units[x.s].side === 0; }).pop(); return e ? e.sk : null; },
      worldToScreen: function (x, y) { if (!B) return null; var p = proj(x, y); return { x: p.x, y: p.y, k: p.k }; },
      hills: function () { if (!B) return []; return (B.info.terrain.blobs || []).filter(function (b) { return b.k === 'hill'; }).map(function (b) { return { x: fxW(b.x), y: fyW(b.y), rw: b.rx * LANEW, rd: b.ry * HALF, h: hillH(b), top: ELEV ? elevAt(fxW(b.x), fyW(b.y)) : 0 }; }); },
      figSize: function () { return { inf: [RAST.inf[0] * FIGS, RAST.inf[1] * FIGS], tank: [RAST.tank[0] * FIGS, RAST.tank[1] * FIGS], n: FIGMAX }; },
      debugForm: function () { return B && B.phase === 'deploy' ? deployForm() : null; },
      // テスト用: マップの点(x=列の番号, y=-1〜1)の画面座標
      mapPoint: function (x, y) { if (!B) return null; var p = proj(fxW(x), fyW(y)); return { x: p.x, y: p.y }; },
      // テスト用: 画面の点 → 地面の点と、前線からの距離
      screenToWorld: function (sx, sy) { if (!B) return null; var w = unproj(sx, sy); return { x: w.x, y: w.y, mx: xToLx(w.x), my: (w.y - F0) / HALF }; } };
  })();

