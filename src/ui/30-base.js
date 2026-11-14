  // ====== 画面: 基地 ======
  function renderBase() {
    var t = now();
    var info = TF.storedInfo(st, t);
    var gm = info.supply ? info.supply.stored : 0, gs = info.steel ? info.steel.stored : 0;
    var html = '<div class="hint"><span class="tag">指令</span><span>' + esc(nextGoal()) + '</span></div>';
    html += '<div class="collect card"><div class="info">貯まっている資源<br><b class="num">' + icoMoneyInline() + '<span id="cM">' + fmt(gm) + '</span></b>  <b class="num">' + icoSteelInline() + '<span id="cS">' + fmt(gs) + '</span></b>' +
      '<br>放置上限 ' + TF.capHours(st) + '時間</div><button class="btn green" id="btnCollect" data-act="collect"' + (gm + gs > 0 ? '' : ' disabled') + '>回収</button></div>';
    var bySlot = {};
    Object.keys(st.bld).forEach(function (k) { bySlot[st.bld[k].slot] = k; });
    // 基地は斜め上から見た立体のジオラマ: 台座の上に 3×3 の区画をひし形に並べ、奥の施設から順に重ねる
    html += '<div class="grid iso" id="grid"><div class="isoz" id="isoZ">' + ISO.ground(bySlot);
    for (var i = 0; i < 9; i++) {
      var id = bySlot[i], ipos = ISO.tileStyle(i);
      if (!id) {
        html += '<button class="tile empty" data-act="tile" data-slot="' + i + '" style="' + ipos + '"><i class="hit"></i><div class="plus">+</div><div class="lbl">建設</div></button>';
        continue;
      }
      var b = st.bld[id];
      var up = TF.canUpgrade(st, id).ok;
      var extra = '';
      if (id === 'supply' || id === 'steel') {
        var si = info[id];
        var pct = si.cap > 0 ? Math.min(100, si.stored / si.cap * 100) : 0;
        extra = '<div class="store' + (id === 'steel' ? ' steel' : '') + '"><i id="bar-' + id + '" style="width:' + pct.toFixed(1) + '%"></i></div>';
        extra += '<div class="bub' + (si.full ? ' full' : '') + (si.stored >= 1 ? '' : ' hidden') + '" id="bub-' + id + '">' + (id === 'supply' ? icoMoney() : icoSteel()) + '<span>' + fmt(si.stored) + '</span></div>';
        up = false;
      }
      html += '<button class="tile' + (id === 'hq' ? ' hq' : '') + '" data-act="tile" data-slot="' + i + '" style="' + ipos + '"><i class="hit"></i>' + bSvg(id) +
        '<div class="plate"><div class="lv">Lv' + b.lv + '</div><div class="nm">' + TF.BLD[id].name + '</div></div>' + (up ? '<div class="up">↑</div>' : '') + extra + '</button>';
    }
    html += '</div><div class="isohint">2本指で拡大・縮小</div><div class="isoctl"><button data-act="base-zoom" data-d="0" aria-label="もとの大きさ">1×</button>' +
      '<button data-act="base-zoom" data-d="-1" aria-label="縮小">－</button><button data-act="base-zoom" data-d="1" aria-label="拡大">＋</button></div></div>';
    var power = TF.formSquads(st, st.form).reduce(function (a, q) { return a + q.power; }, 0);
    html += '<div class="basestats">' +
      '<div class="card"><div class="k">部隊の枠</div><div class="v">' + TF.slots(st) + ' / 8</div></div>' +
      '<div class="card"><div class="k">施設の上限レベル</div><div class="v">Lv' + TF.lv(st, 'hq') * 2 + '</div></div>' +
      '<div class="card"><div class="k">編成中の総戦力</div><div class="v num">' + fmt(power) + '</div></div>' +
      '<div class="card"><div class="k">最高到達</div><div class="v">ステージ' + st.cleared + '</div></div></div>';
    $('scr-base').innerHTML = html;
    BaseView.apply();
  }
  var BaseView = (function () {
    var v = { z: 1, x: 0, y: 0 }, g = null, blockUntil = 0, ZMAX = 3;
    function box() { var gr = $('grid'); return gr ? gr.getBoundingClientRect() : null; }
    function apply() {
      var e = $('isoZ'), b = box();
      if (!e || !b) return;
      v.z = Math.max(1, Math.min(ZMAX, v.z));
      v.x = Math.min(0, Math.max(b.width * (1 - v.z), v.x)); v.y = Math.min(0, Math.max(b.height * (1 - v.z), v.y));
      e.style.transform = 'translate(' + v.x.toFixed(1) + 'px,' + v.y.toFixed(1) + 'px) scale(' + v.z.toFixed(3) + ')';
      $('grid').classList.toggle('zoomed', v.z > 1.01);
      $('grid').style.setProperty('--inv', Math.pow(1 / v.z, 0.8).toFixed(3));  // 札や矢印は、拡大してもあまり大きくしない
    }
    // 画面上の点(px, py: ジオラマの枠の左上から)を中心に拡大率を変える
    function zoomAt(nz, px, py) {
      var cx = (px - v.x) / v.z, cy = (py - v.y) / v.z;
      v.z = Math.max(1, Math.min(ZMAX, nz)); v.x = px - cx * v.z; v.y = py - cy * v.z;
      apply();
    }
    function step(d) {
      var b = box(); if (!b) return;
      if (!d) { v.z = 1; v.x = v.y = 0; apply(); } else zoomAt(v.z * (d > 0 ? 1.5 : 1 / 1.5), b.width / 2, b.height / 2);
    }
    function inGrid(e) { return e.target && e.target.closest && e.target.closest('#grid'); }
    function pts(e) { var b = box(); return [].map.call(e.touches, function (t) { return { x: t.clientX - b.left, y: t.clientY - b.top }; }); }
    function startPinch(p) { var mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2; g = { k: 'pinch', d0: Math.max(1, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)), z0: v.z, cx: (mx - v.x) / v.z, cy: (my - v.y) / v.z }; }
    function startPan(q, on) { g = v.z > 1.01 ? { k: 'pan', x0: q.x, y0: q.y, vx: v.x, vy: v.y, on: !!on } : null; }
    document.addEventListener('touchstart', function (e) {
      if (!inGrid(e) || !box()) { g = null; return; }
      var p = pts(e);
      if (p.length >= 2) startPinch(p); else startPan(p[0]);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!g || !box()) return;
      var p = pts(e);
      if (g.k === 'pinch' && p.length >= 2) {
        e.preventDefault();
        var mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
        v.z = Math.max(1, Math.min(ZMAX, g.z0 * Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) / g.d0));
        v.x = mx - g.cx * v.z; v.y = my - g.cy * v.z;
        apply(); blockUntil = Date.now() + 400;
      } else if (g.k === 'pan' && p.length === 1) {
        var dx = p[0].x - g.x0, dy = p[0].y - g.y0;
        if (!g.on && Math.hypot(dx, dy) < 6) return;
        g.on = true; e.preventDefault();
        v.x = g.vx + dx; v.y = g.vy + dy;
        apply(); blockUntil = Date.now() + 400;
      }
    }, { passive: false });
    document.addEventListener('touchend', function (e) {
      if (!g) return;
      if (!e.touches.length || !box()) { g = null; return; }
      if (g.k === 'pinch' && e.touches.length === 1) startPan(pts(e)[0], true);   // 指を1本離したら、そのまま移動に
    });
    document.addEventListener('touchcancel', function () { g = null; });
    // パソコン: ホイールで拡大・縮小、拡大中はドラッグで移動
    document.addEventListener('wheel', function (e) {
      if (!inGrid(e)) return;
      var b = box(); if (!b) return;
      e.preventDefault();
      zoomAt(v.z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - b.left, e.clientY - b.top);
    }, { passive: false });
    var md = null;
    document.addEventListener('mousedown', function (e) { md = inGrid(e) && v.z > 1.01 ? { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, on: false } : null; });
    document.addEventListener('mousemove', function (e) {
      if (!md || !(e.buttons & 1)) { md = null; return; }
      var dx = e.clientX - md.x, dy = e.clientY - md.y;
      if (!md.on && Math.hypot(dx, dy) < 6) return;
      md.on = true; v.x = md.vx + dx; v.y = md.vy + dy; apply(); blockUntil = Date.now() + 400;
    });
    document.addEventListener('mouseup', function () { md = null; });
    return { apply: apply, step: step, zoomAt: zoomAt, state: v, blocked: function () { return Date.now() < blockUntil; } };
  })();
  function icoMoneyInline() { return '<svg viewBox="0 0 24 24" style="display:inline-block;width:15px;height:15px;vertical-align:-2px;margin-right:2px"><use href="#i-money"/></svg>'; }
  function icoSteelInline() { return '<svg viewBox="0 0 24 24" style="display:inline-block;width:15px;height:15px;vertical-align:-2px;margin-right:2px"><use href="#i-steel"/></svg>'; }

  // 生産の表示だけを1秒ごとに更新
  // (要素を作り直すとタップを取りこぼすので、数値と棒だけ書き換える)
  function liveBase() {
    if (curTab !== 'base' || !$('cM')) return;
    var info = TF.storedInfo(st, now());
    var gm = info.supply ? info.supply.stored : 0, gs = info.steel ? info.steel.stored : 0;
    $('cM').textContent = fmt(gm); $('cS').textContent = fmt(gs);
    $('btnCollect').disabled = gm + gs <= 0;
    ['supply', 'steel'].forEach(function (id) {
      var si = info[id], bar = $('bar-' + id), bub = $('bub-' + id);
      if (!si || !bar) return;
      bar.style.width = (si.cap > 0 ? Math.min(100, si.stored / si.cap * 100) : 0).toFixed(1) + '%';
      bub.classList.toggle('hidden', si.stored < 1);
      bub.classList.toggle('full', si.full);
      bub.lastChild.textContent = fmt(si.stored);
    });
  }

  // ====== 施設シート ======
  function effectRows(id, l) {
    var rows = [], cur = l, nx = l + 1;
    function pct(m) { return '×' + m.toFixed(2); }
    if (id === 'hq') {
      rows.push(['部隊の枠', TF.slotsFor(cur), TF.slotsFor(nx) + (TF.slotsFor(nx) >= 6 ? '(最大)' : '')]);
      rows.push(['施設の上限', 'Lv' + cur * 2, 'Lv' + nx * 2]);
    } else if (id === 'supply' || id === 'steel') {
      var nm = id === 'supply' ? '資金' : '鋼材';
      var capH = TF.capHours(st);
      rows.push([nm + 'の生産(1時間)', cur ? fmt(TF.prodRate(id, cur)) : '-', fmt(TF.prodRate(id, nx))]);
      rows.push(['貯蔵の上限(' + capH + '時間分)', cur ? fmt(TF.prodRate(id, cur) * capH) : '-', fmt(TF.prodRate(id, nx) * capH)]);
    } else if (id === 'depot') {
      rows.push(['放置の上限時間', (TF.K.baseCapH + TF.K.depotCapH * cur) + '時間', (TF.K.baseCapH + TF.K.depotCapH * nx) + '時間']);
    } else if (id === 'lab') {
      rows.push(['全兵種の能力', pct(1 + TF.K.labPerLv * cur), pct(1 + TF.K.labPerLv * nx)]);
    } else {
      var t = TF.BLD[id].unit;
      rows.push([TF.UNIT[t].name + 'の能力', cur ? pct(1 + TF.K.unitPerLv * (cur - 1)) : '未解放', pct(1 + TF.K.unitPerLv * (nx - 1))]);
    }
    return rows;
  }
  // 射程の説明(左右に何列先まで撃てるか)
  function rngText(t) { var r = TF.K.rng[t]; return r >= TF.K.laneN ? '戦場全体' : r + '列'; }
  // 見つかりにくさ(敵から見える距離の倍率が小さいほど見つかりにくい)
  function hideText(t) { var g = TF.K.sig[t]; return (g <= 0.65 ? 'とても高い' : g <= 0.85 ? '高い' : g < 1.15 ? 'ふつう' : '低い(目立つ)') + '(×' + g + ')'; }
  function unitCardHtml(t) {
    var q = TF.squadStats(st, t, null);
    var on = TF.typeUnlocked(st, t);
    return '<div class="card urow" style="margin-top:8px"><div class="uicon' + (on ? '' : ' off') + '">' + allySvg(t) + '</div><div class="grow">' +
      '<div class="row"><b>' + TF.UNIT[t].name + '</b>' + (on ? '<span class="pill">兵舎系Lv' + TF.lv(st, TF.TYPE_BLD[t]) + '</span>' : '<span class="pill red">未解放</span>') + '</div>' +
      (on ? '<div class="stats"><span>HP <b class="num">' + fmt(q.maxHp) + '</b></span><span>攻撃 <b class="num">' + fmt(q.atk) + '</b></span><span>射程 <b>' + rngText(t) + '</b></span><span>索敵 <b>' + TF.K.det[t] + '列</b></span><span>見つかりにくさ <b>' + hideText(t) + '</b></span></div>' : '') +
      '<div class="aff"><span class="s">強い: ' + names(STRONG[t]) + '</span> / <span class="w">弱い: ' + names(WEAK[t]) + '</span></div></div></div>';
  }
  function openBuilding(id) {
    var l = TF.lv(st, id), d = TF.BLD[id];
    var chk = TF.canUpgrade(st, id);
    var max = TF.maxLevel(st, id);
    var html = '<div class="grab"></div><button class="close" data-act="sheet-close" aria-label="閉じる">✕</button>';
    html += '<div class="bhead"><div class="art">' + bSvg(id) + '</div><div><h3>' + d.name + '</h3><div class="row" style="margin-top:4px"><span class="pill gold">Lv' + l + '</span><span class="small">上限 Lv' + (id === 'hq' ? '∞' : max) + '</span></div></div></div>';
    html += '<div class="desc">' + BDESC[id] + '</div>';
    if (id === 'supply' || id === 'steel') {
      var si = TF.storedInfo(st, now())[id];
      html += '<div class="card" style="margin-bottom:8px"><div class="row"><span class="grow small">貯まっている' + (id === 'supply' ? '資金' : '鋼材') + '</span><b class="num">' + fmt(si.stored) + ' / ' + fmt(si.cap) + '</b></div><div class="bar" style="margin-top:6px"><i style="width:' + Math.min(100, si.stored / Math.max(1, si.cap) * 100) + '%;' + (id === 'steel' ? 'background:var(--steel)' : 'background:var(--gold)') + '"></i></div>' +
        '<div class="small" style="margin-top:4px">' + (si.full ? '満杯です。回収しましょう!' : 'あと ' + fmtDur((si.cap - si.stored) / si.rate * 3600000) + 'で満杯') + '</div></div>';
    }
    var maxed = id === 'depot' && l >= TF.K.depotMaxLv;
    if (!maxed) {
      html += '<table class="eff">' + effectRows(id, l).map(function (r) { return '<tr><td>' + r[0] + '</td><td class="cur">' + r[1] + '</td><td class="arrow">→ ' + r[2] + '</td></tr>'; }).join('') + '</table>';
    } else {
      html += '<div class="card small">最大レベルです(放置上限 ' + TF.capHours(st) + '時間)。</div>';
    }
    if (id === 'hq') {
      var unl = TF.BLD_ORDER.filter(function (k) { return TF.BLD[k].req === l + 1; });
      if (unl.length) html += '<div class="small" style="margin-top:8px">Lv' + (l + 1) + 'で建設可能: <b style="color:var(--gold)">' + unl.map(function (k) { return TF.BLD[k].name; }).join('・') + '</b></div>';
    }
    if (d.unit) html += unitCardHtml(d.unit);
    if (!maxed) {
      var c = TF.upgradeCost(id, l);
      html += '<div class="costrow">' + costHtml(c) + '</div>';
      html += '<button class="btn wide big" data-act="upgrade" data-id="' + id + '"' + (chk.ok ? '' : ' disabled') + '>強化する Lv' + l + ' → ' + (l + 1) + '</button>';
      if (!chk.ok) html += '<div class="reason">' + esc(chk.reason) + (chk.short ? '(出撃で稼ぐか、生産施設から回収しよう)' : '') + '</div>';
    }
    openSheet(html);
  }
  function openBuildMenu(slot) {
    var html = '<div class="grab"></div><button class="close" data-act="sheet-close" aria-label="閉じる">✕</button><h3>施設を建設</h3><div class="small">区画' + (slot + 1) + 'に建てる施設を選んでください。</div><div class="blist">';
    var avail = TF.BLD_ORDER.filter(function (id) { return !st.bld[id]; });
    if (!avail.length) html += '<div class="card small">すべての施設を建設済みです。</div>';
    avail.forEach(function (id) {
      var d = TF.BLD[id], chk = TF.canUpgrade(st, id), c = TF.upgradeCost(id, 0);
      var locked = TF.lv(st, 'hq') < d.req;
      html += '<div class="bitem' + (locked ? ' locked' : '') + '"><div class="art">' + bSvg(id) + '</div><div class="grow"><div class="nm">' + d.name + '</div><div class="small">' + BDESC[id] + '</div>' +
        '<div class="row" style="margin-top:3px;font-size:13px;gap:10px">' + (locked ? '<span class="pill red">司令部Lv' + d.req + 'で解放</span>' : costHtml(c)) + '</div></div>' +
        '<button class="btn" data-act="build" data-id="' + id + '" data-slot="' + slot + '"' + (chk.ok ? '' : ' disabled') + '>建設</button></div>';
    });
    html += '</div>';
    openSheet(html);
  }
  function openSheet(html, keepScroll) {
    var y = $('sheet').scrollTop;
    $('sheet').innerHTML = html;
    $('sheetWrap').classList.remove('hidden');
    $('sheet').scrollTop = keepScroll ? y : 0;
  }
  function closeSheet() { $('sheetWrap').classList.add('hidden'); $('sheet').innerHTML = ''; sheetCtx = null; }
  var sheetCtx = null;

  function openModal(html) { $('modal').innerHTML = html; $('modalWrap').classList.remove('hidden'); $('modal').scrollTop = 0; }
  function closeModal() { $('modalWrap').classList.add('hidden'); $('modal').innerHTML = ''; }

