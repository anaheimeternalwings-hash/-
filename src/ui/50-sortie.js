  // ====== 画面: 出撃 ======
  function matchupMark(t, enemies) {
    var dealt = 0, taken = 0;
    enemies.forEach(function (e) { dealt += TF.AFF[t][e.type]; taken += TF.AFF[e.type][t]; });
    var r = dealt / taken;
    if (r >= 1.6) return ['g2', '◎'];
    if (r >= 1.15) return ['g1', '○'];
    if (r >= 0.85) return ['n', '−'];
    return ['b', '×'];
  }
  function wrInfo(w) {
    if (w >= 0.85) return ['楽勝', '#7fd17a'];
    if (w >= 0.6) return ['優勢', '#a9d36a'];
    if (w >= 0.4) return ['互角', '#f0c34a'];
    if (w >= 0.15) return ['苦戦', '#f08c4a'];
    return ['危険', '#ef6b5b'];
  }
  function getWinRate() {
    var key = st.sel + '|' + JSON.stringify(st.form) + '|' + JSON.stringify(st.bld, function (k, v) { return k === 'stored' || k === 't' ? undefined : v; }) + '|' + JSON.stringify(st.heroes);
    if (wrCache && wrCache.key === key) return wrCache.v;
    var v = TF.predict(st, st.form, st.sel, 100);
    wrCache = { key: key, v: v };
    return v;
  }
  function renderSortie() {
    st.form = TF.normalizeForm(st, st.form);
    var s = st.sel, info = TF.stageInfo(s);
    var cleared = s <= st.cleared;
    var html = '<div class="mapwrap"><canvas id="mapcv"></canvas><div class="maptip">なぞって移動・マスをタップで選択</div></div>';
    html += '<div class="stagebar"><button class="nav" data-act="stage" data-d="-1"' + (s <= 1 ? ' disabled' : '') + ' aria-label="前のステージ">◀</button>' +
      '<div class="mid"><div class="sn">ステージ ' + s + '</div><div class="sp">' + esc(info.place) + ' ・ ' + esc(info.theme) + (cleared ? ' ・ <span style="color:var(--good)">クリア済</span>' : ' ・ <span style="color:var(--gold)">未踏</span>') + '</div>' +
      (info.terrain && info.terrain.layout ? '<div class="sp" id="mapType">マップ: ' + esc(TF.LAYOUTS[info.terrain.layout]) + '</div>' : '') + '</div>' +
      '<button class="nav" data-act="stage" data-d="1"' + (s >= st.cleared + 1 ? ' disabled' : '') + ' aria-label="次のステージ">▶</button></div>';
    if (s < st.cleared + 1) html += '<div style="text-align:center;margin-top:6px"><button class="pill" data-act="stage-latest" style="font-size:12px;padding:5px 12px">最新のステージ ' + (st.cleared + 1) + ' へ ▶▶</button></div>';
    // 敵
    html += '<div class="side enemy"><div class="hd"><span class="grow">敵部隊' + (info.boss ? ' <span class="pill gold">ボス: ' + esc(info.bossName) + '</span>' : '') + '</span><span class="pw">戦力 ' + fmt(info.power) + '</span></div><div class="slots">';
    info.enemies.forEach(function (e) {
      html += '<div class="slot' + (e.boss ? ' bossc' : '') + '">' + (e.boss ? '<span class="boss">BOSS</span>' : '') + (e.ecmd ? '<span class="cmdb">敵将</span>' : '') + enemySvg(e.type, s, 'ic') + '<div class="t">' + TF.UNIT[e.type].name + '</div><div class="p num">戦力 ' + fmt(e.power) + '</div><div class="wk">弱点: ' + names(counters(e.type)) + '</div></div>';
    });
    html += '</div>';
    if (info.ecmd) {
      var ec = TF.ECMD[info.ecmd];
      html += '<div class="ecmd" id="ecmdInfo"><div class="eportrait">' + ecmdSvg(info.ecmd) + '</div><div class="grow"><b>敵将「' + esc(ec.name) + '」</b> スキル〈' + esc(ec.skill) + '〉: ' + esc(ec.desc) +
        '<div class="small">発動の' + ec.warn + '秒前に予告があり、そのあいだ敵将の位置がわかります。予告中に倒せば止められます</div></div></div>';
    }
    html += '</div>';
    // 自軍
    var squads = TF.formSquads(st, st.form);
    var myPower = squads.reduce(function (a, q) { return a + q.power; }, 0);
    html += '<div class="side ally"><div class="hd"><span class="grow">自軍の編成</span><span class="pw">戦力 ' + fmt(myPower) + '</span><button class="btn sub" style="min-height:36px;padding:0 10px;font-size:13px" data-act="auto">おまかせ編成</button></div><div class="slots">';
    for (var i = 0; i < 6; i++) {
      if (i >= st.form.length) {
        var needHq = 1; while (TF.slotsFor(needHq) <= i) needHq++;
        html += '<div class="slot locked">🔒<br>司令部Lv' + needHq + 'で解放</div>';
        continue;
      }
      var f = st.form[i], q = squads[i], mk = matchupMark(f.type, info.enemies);
      var hd = f.hero ? TF.HERO[f.hero] : null;
      html += '<button class="slot" data-act="slot" data-i="' + i + '"><span class="mk ' + mk[0] + '">' + mk[1] + '</span>' + allySvg(f.type, 'ic') + '<div class="t">' + TF.UNIT[f.type].name + '</div><div class="p num">戦力 ' + fmt(q.power) + '</div>' +
        (hd ? '<div class="hr"><div class="portrait xs">' + heroSvg(f.hero) + '</div><span>' + hd.name.split(' ')[0] + (hd.fav === f.type ? '★' : '') + '</span></div>' : '<div class="hr none">指揮官なし</div>') + '</button>';
    }
    html += '</div><div class="small" style="margin-top:6px">枠をタップで兵種・指揮官を変更。◎○は敵との相性、★は得意兵種。</div></div>';
    // 勝率
    var wr = getWinRate();
    var wi = wrInfo(wr.winRate);
    var pct = Math.round(wr.winRate * 100);
    var rw = info.reward, first = !cleared;
    html += '<div class="winbox card"><div class="wr"><svg class="c" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" fill="none" stroke="#11160f" stroke-width="4"/>' + (pct > 0 ? '<circle cx="18" cy="18" r="15.5" fill="none" stroke="' + wi[1] + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (pct * 0.974).toFixed(1) + ' 100" transform="rotate(-90 18 18)"/>' : '') + '</svg><div><div class="v num" style="color:' + wi[1] + '">' + pct + '%</div><div class="l" style="color:' + wi[1] + '">' + wi[0] + '</div></div></div>' +
      '<div class="grow rewards"><div class="small">予想勝率(自動戦闘で100回模擬戦)</div><div style="font-weight:800">勝利報酬' + (first ? ' <span class="pill gold">初回×' + TF.K.firstMul + '</span>' : '') + '</div>' +
      '<div class="row"><span class="cost">' + icoMoney() + fmt(rw.m * (first ? TF.K.firstMul : 1)) + '</span><span class="cost">' + icoSteel() + fmt(rw.s * (first ? TF.K.firstMul : 1)) + '</span><span class="cost">' + icoBp() + fmt(rw.bp * (first ? TF.K.firstMul : 1)) + '</span></div>' +
      (TF.partGrade(s) ? '<div class="row"><span class="cost partc">' + icoPart() + TF.partName(TF.partGrade(s)) + (first ? ' ×' + TF.K.partFirst : '') + '</span></div>' : '') +
      '<div class="small">指揮官EXP +' + fmt(rw.exp) + '(敗北時は半分)</div></div></div>';
    var auto = st.auto !== false;
    html += '<div class="modesel"><span class="lbl">戦闘</span><div class="seg"><button data-act="mode" data-m="auto" class="' + (auto ? 'on' : '') + '">自動</button><button data-act="mode" data-m="manual" class="' + (auto ? '' : 'on') + '">手動(指示・スキル)</button></div></div>';
    if (!auto) html += '<div class="small" style="margin-top:6px">手動: 戦闘中に自軍の部隊から敵へドラッグすると集中攻撃。指揮官スキルは下のボタンで自分で発動します(押さないと発動しません)。予想勝率は自動戦闘の場合です。</div>';
    // 戦闘前の配置画面を出すかどうか(配置画面の「次から省略」もここで戻せる)
    var dep = !(st.flags && st.flags.skipDeploy);
    html += '<div class="modesel"><span class="lbl">配置</span><div class="seg"><button data-act="deploy-mode" data-m="on" class="' + (dep ? 'on' : '') + '">戦闘前に配置する</button><button data-act="deploy-mode" data-m="off" class="' + (dep ? '' : 'on') + '">省略(おまかせ)</button></div></div>';
    html += '<button class="btn wide big" style="margin-top:10px" data-act="sortie">出撃!</button>';
    if (st.cleared >= 1) html += '<button class="farmbtn" data-act="farm-find">💰 稼ぎにおすすめのステージを探す</button>';
    if (pct < 40) html += '<div class="tips">' + esc(adviceLine(info)) + '</div>';
    $('scr-sortie').innerHTML = html;
    MapView.mount($('mapcv'));
  }
  function adviceLine(info) {
    var cnt = {};
    info.enemies.forEach(function (e) { cnt[e.type] = (cnt[e.type] || 0) + 1; });
    var main = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
    var c = counters(main);
    var missing = c.filter(function (t) { return !TF.typeUnlocked(st, t); });
    if (missing.length) return 'ヒント: 敵は' + TF.UNIT[main].name + 'が中心。' + names(c) + 'が有効です。' + TF.BLD[TF.TYPE_BLD[missing[0]]].name + 'を建てよう。';
    return 'ヒント: 敵は' + TF.UNIT[main].name + 'が中心。' + names(c) + 'が有効です。勝てないときは前のステージで稼いで、' + TF.BLD[TF.TYPE_BLD[c[0]]].name + 'や研究所を強化しよう。';
  }
  function openSlot(i, keep) {
    sheetCtx = { kind: 'slot', i: i };
    var f = st.form[i];
    var info = TF.stageInfo(st.sel);
    var html = '<div class="grab"></div><button class="close" data-act="sheet-close" aria-label="閉じる">✕</button><h3>部隊' + (i + 1) + 'の編成</h3>';
    html += '<h2 class="sec">兵種</h2><div class="small" style="margin:-4px 2px 6px;color:var(--dim)">編成できる数: ' + TF.TYPES.map(function (t) { return TF.UNIT[t].name + TF.K.typeCap[t]; }).join('・') + '部隊まで</div><div class="slots" style="grid-template-columns:repeat(2,1fr)">';
    TF.TYPES.forEach(function (t) {
      var used = st.form.filter(function (x, j) { return j !== i && x.type === t; }).length, full = used >= TF.K.typeCap[t];
      var on = TF.typeUnlocked(st, t) && !full;
      var q = TF.squadStats(st, t, f.hero);
      var mk = matchupMark(t, info.enemies);
      html += '<button class="slot" style="min-height:96px;background:' + (f.type === t ? '#2f5a4e' : '#1b2a25') + ';border:2px solid ' + (f.type === t ? 'var(--ally)' : '#2f5248') + ';border-radius:12px" data-act="set-type" data-i="' + i + '" data-t="' + t + '"' + (on ? '' : ' disabled') + '>' +
        (on ? '<span class="mk ' + mk[0] + '">' + mk[1] + '</span>' : '') + (on ? allySvg(t, 'ic') : offSvg(t, 'ic')) + '<div class="t">' + TF.UNIT[t].name + '</div>' +
        '<div class="p">' + (on ? '戦力 ' + fmt(q.power) : full ? '上限(' + TF.K.typeCap[t] + '部隊まで)' : TF.BLD[TF.TYPE_BLD[t]].name + 'が必要') + '</div></button>';
    });
    html += '</div><h2 class="sec">指揮官</h2><div class="blist">';
    html += '<button class="bitem" data-act="set-hero" data-i="' + i + '" data-h="" style="' + (!f.hero ? 'border-color:var(--ally)' : '') + '"><div class="grow" style="text-align:left"><div class="nm">指揮官なし</div></div>' + (!f.hero ? '<span class="pill blue">選択中</span>' : '') + '</button>';
    TF.HEROES.forEach(function (hd) {
      var h = st.heroes[hd.id];
      if (!h) return;
      var where = -1;
      st.form.forEach(function (x, j) { if (x.hero === hd.id) where = j; });
      var sel = where === i;
      html += '<button class="bitem" data-act="set-hero" data-i="' + i + '" data-h="' + hd.id + '" style="text-align:left;' + (sel ? 'border-color:var(--ally)' : '') + '"><div class="portrait sm">' + heroSvg(hd.id) + '</div><div class="grow"><div class="nm">' + hd.name + ' <span class="pill gold">Lv' + h.lv + '</span></div>' +
        '<div class="small">得意: ' + TF.UNIT[hd.fav].name + (hd.fav === f.type ? ' <b style="color:var(--gold)">★得意兵種</b>' : '') + ' / スキル「' + TF.SKILL[hd.skill].name + '」</div>' +
        '<div class="small" style="color:var(--khaki)">' + TF.heroTraits(hd.id).slice(0, 3).join('・') + '</div></div>' +
        (sel ? '<span class="pill blue">選択中</span>' : where >= 0 ? '<span class="pill">部隊' + (where + 1) + 'から移動</span>' : '') + '</button>';
    });
    html += '</div><button class="btn wide" style="margin-top:14px" data-act="sheet-close">決定</button>';
    openSheet(html, keep);
  }

  // ====== タブ切替 ======
  function show(tab) {
    curTab = tab; st.tab = tab;
    ['base', 'army', 'arms', 'sortie'].forEach(function (k) { $('scr-' + k).classList.toggle('hidden', k !== tab); });
    Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
    render();
    $('main').scrollTop = 0;
  }
  function render() {
    renderTop();
    if (curTab === 'base') renderBase();
    else if (curTab === 'army') renderArmy();
    else if (curTab === 'arms') renderArms();
    else renderSortie();
  }

  // ====== 陣取り地図 ======
  // 六角形のマスでできた地図。1段=1ステージで、制圧した段までが自軍の領土(緑)、その先が敵の領土(赤)。
  var MapView = (function () {
    var cv = null, g = null, W = 0, H = 0, DPR = 1, R = 24, NC = 7;
    var focus = null, target = 0, raf = 0, drag = null, anim = null, lastDraw = 0;
    var path = [3];
    function colOf(row) {
      while (path.length <= row) {
        var k = path.length, h = TF.hashInt(k * 131 + 7) % 10;
        path.push(Math.max(1, Math.min(NC - 2, path[k - 1] + (h < 3 ? -1 : h < 7 ? 0 : 1))));
      }
      return path[row];
    }
    function terrain(col, row) {
      if (row <= 0) return 'base';
      if (colOf(row) === col) return 'stage';
      var h = TF.hashInt(col * 7349 + row * 104729 + 11) % 100;
      return h < 14 ? 'forest' : h < 21 ? 'mount' : h < 25 ? 'lake' : 'plain';
    }
    var BIO = { grass: '#6f9a4f', desert: '#c9ab6e', snow: '#cfd9e0' };
    // 地形のタイルの絵(地形 × 気候)。読み込みが済むまでは色で塗る
    var TILES = {};
    function tileImg(tr, bi) {
      var k = tr === 'lake' ? 'm.lake' : tr === 'base' ? 'm.base' : tr === 'mount' ? 'm.mount'
        : tr === 'forest' ? (bi === 'desert' ? 'm.dforest' : bi === 'snow' ? 'm.sforest' : 'm.forest') : (bi === 'desert' ? 'm.desert' : bi === 'snow' ? 'm.snow' : 'm.grass');
      if (!ART.has(k)) return null;
      if (!TILES[k]) { var im = new Image(); TILES[k] = { im: im, ok: false }; im.onload = function () { TILES[k].ok = true; }; im.src = ART.url(k); }
      return TILES[k].ok ? TILES[k].im : null;
    }
    function biome(row) {
      if (row < 1 || row > st.cleared + 7) return null;
      var pl = TF.stageInfo(row).place;
      return /雪|霧|北部/.test(pl) ? 'snow' : /砂漠|赤土|火山|荒野/.test(pl) ? 'desert' : 'grass';
    }
    function hexW() { return Math.sqrt(3) * R; }
    // 2色を混ぜる(k は b の割合)
    function mixHex(a, b, k) {
      var pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16), out = '#';
      [16, 8, 0].forEach(function (sh) { var v = Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k); out += ('0' + v.toString(16)).slice(-2); });
      return out;
    }
    function center(col, row) {
      var w = hexW();
      return { x: (W - w * (NC + 0.5)) / 2 + w * (col + 0.5 + (row & 1 ? 0.5 : 0)), y: H * 0.55 - (row - focus) * 1.5 * R };
    }
    function hexPath(x, y, r) {
      g.beginPath();
      for (var i = 0; i < 6; i++) { var a = Math.PI / 6 + i * Math.PI / 3; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      g.closePath();
    }
    function mount(c) {
      cv = c; g = cv.getContext('2d');
      var r = cv.getBoundingClientRect();
      W = r.width; H = r.height; DPR = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
      R = Math.max(18, Math.min(30, W / ((NC + 0.5) * Math.sqrt(3))));
      target = anim ? anim.s + 0.3 : st.sel + 1;
      if (focus === null) focus = target;
      if (st.flags && st.flags.conq) {
        anim = { s: st.flags.conq, t0: performance.now() };
        focus = st.flags.conq - 0.5; target = st.flags.conq + 0.3;
        delete st.flags.conq; save();
        setTimeout(function () {
          if (!cv) return;
          var p = center(colOf(anim ? anim.s : 1), anim ? anim.s : 1), rr = cv.getBoundingClientRect();
          coinFly({ left: rr.left + p.x - 10, top: rr.top + p.y - 10, width: 20, height: 20 }, 'resM', 'i-money', 8);
        }, 350);
      }
      if (!cv.__bound) {
        cv.__bound = true;
        cv.addEventListener('pointerdown', function (e) { drag = { y0: e.clientY, f0: focus, moved: false, x: e.clientX, y: e.clientY }; try { cv.setPointerCapture(e.pointerId); } catch (er) { } });
        cv.addEventListener('pointermove', function (e) {
          if (!drag) return;
          var dy = e.clientY - drag.y0;
          if (Math.abs(dy) > 6) drag.moved = true;
          if (drag.moved) { focus = Math.max(1, Math.min(st.cleared + 9, drag.f0 + dy / (1.5 * R))); target = focus; }
        });
        cv.addEventListener('pointerup', function (e) {
          var d = drag; drag = null;
          if (!d || d.moved) return;
          var r2 = cv.getBoundingClientRect();
          tap(e.clientX - r2.left, e.clientY - r2.top);
        });
        cv.addEventListener('pointercancel', function () { drag = null; });
      }
      loop();
    }
    function tap(x, y) {
      var best = null, bd = R;
      var r0 = Math.floor(focus - H / (1.5 * R)), r1 = Math.ceil(focus + H / (1.5 * R));
      for (var row = Math.max(1, r0); row <= r1; row++) {
        var c = center(colOf(row), row), d = Math.hypot(x - c.x, y - c.y);
        if (d < bd) { bd = d; best = row; }
      }
      if (!best) return;
      if (best > st.cleared + 1) { toast('ステージ' + (st.cleared + 1) + 'をクリアすると進めます'); return; }
      st.sel = best; save();
      renderSortie();
    }
    function loop() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function step(ts) {
        if (!cv || !document.body.contains(cv) || curTab !== 'sortie' || document.hidden) { raf = 0; return; }
        if (!drag) focus += (target - focus) * 0.15;
        if (ts - lastDraw > 33 || anim) { draw(ts); lastDraw = ts; }
        raf = requestAnimationFrame(step);
      });
    }
    function draw(ts) {
      g.setTransform(DPR, 0, 0, DPR, 0, 0);
      g.fillStyle = '#061015'; g.fillRect(0, 0, W, H);
      g.strokeStyle = 'rgba(56,217,176,.06)'; g.lineWidth = 1;
      for (var gx = 0; gx < W; gx += 22) { g.beginPath(); g.moveTo(gx + 0.5, 0); g.lineTo(gx + 0.5, H); g.stroke(); }
      for (var gy = 0; gy < H; gy += 22) { g.beginPath(); g.moveTo(0, gy + 0.5); g.lineTo(W, gy + 0.5); g.stroke(); }
      var C = st.cleared, at = anim ? (ts - anim.t0) / 1600 : 2;
      if (anim && at > 1) { anim = null; target = st.sel + 1; }
      var rows0 = Math.floor(focus - H / (1.5 * R)) - 1, rows1 = Math.ceil(focus + H / (1.5 * R)) + 1;
      var row, col, c;
      // マス
      for (row = rows1; row >= rows0; row--) {
        for (col = 0; col < NC; col++) {
          c = center(col, row);
          if (c.y < -R * 2 || c.y > H + R * 2) continue;
          var tr = row < 0 ? 'plain' : terrain(col, row), bi = biome(Math.max(1, row)) || 'grass';
          var base = tr === 'lake' ? '#4f86ad' : tr === 'base' ? '#7a8a5a' : BIO[bi];
          if (tr === 'forest') base = shade(base, -0.28);
          if (tr === 'mount') base = shade(base, -0.12);
          var tile = tileImg(tr, bi);
          hexPath(c.x, c.y, R - 1.5);
          if (tile) {
            var hv = TF.hashInt(col * 131 + row * 977 + 5) & 3;
            g.save(); g.clip(); g.translate(c.x, c.y); g.scale(hv & 1 ? -1 : 1, tr === 'base' || !(hv & 2) ? 1 : -1); g.drawImage(tile, -R, -R, R * 2, R * 2); g.restore();
            hexPath(c.x, c.y, R - 1.5); g.fillStyle = 'rgba(8,16,22,.3)'; g.fill();
          } else { g.fillStyle = mixHex(base, '#0a151b', 0.8); g.fill(); }
          // 領土の色(自軍は青緑、敵は赤)と、光る縁
          var mineRow = row <= C, tint = mineRow ? 'rgba(47,214,166,.16)' : 'rgba(255,74,61,.13)';
          if (anim && row === anim.s) tint = 'rgba(' + (Math.round(255 - 208 * at)) + ',' + Math.round(74 + 140 * at) + ',' + Math.round(61 + 105 * at) + ',.3)';
          g.fillStyle = tint; g.fill();
          if (row > C + 6) { g.fillStyle = 'rgba(4,8,10,' + Math.min(0.8, 0.25 + (row - C - 6) * 0.12) + ')'; g.fill(); }
          g.strokeStyle = mineRow ? 'rgba(47,214,166,.28)' : 'rgba(255,74,61,.22)'; g.lineWidth = 1; g.stroke();
          // 地形の飾り(タイルの絵がないとき)
          if (!tile && tr === 'forest') { g.fillStyle = 'rgba(20,50,20,.7)'; for (var k = 0; k < 3; k++) { var tx = c.x + (k - 1) * R * 0.38, ty = c.y + (k % 2 ? -R * 0.15 : R * 0.18); g.beginPath(); g.moveTo(tx, ty - R * 0.32); g.lineTo(tx - R * 0.17, ty + R * 0.08); g.lineTo(tx + R * 0.17, ty + R * 0.08); g.fill(); } }
          if (!tile && tr === 'mount') { g.fillStyle = 'rgba(90,90,85,.85)'; g.beginPath(); g.moveTo(c.x - R * 0.5, c.y + R * 0.3); g.lineTo(c.x, c.y - R * 0.45); g.lineTo(c.x + R * 0.5, c.y + R * 0.3); g.fill(); g.fillStyle = '#eef'; g.beginPath(); g.moveTo(c.x - R * 0.13, c.y - R * 0.2); g.lineTo(c.x, c.y - R * 0.45); g.lineTo(c.x + R * 0.13, c.y - R * 0.2); g.fill(); }
          if (!tile && tr === 'lake') { g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(c.x - R * 0.3, c.y - 1, R * 0.4, 2); }
        }
      }
      // 進軍路
      g.strokeStyle = 'rgba(245,184,61,.55)'; g.lineWidth = 1.6; g.setLineDash([3, 5]); g.shadowColor = '#f5b83d'; g.shadowBlur = 6;
      g.beginPath();
      for (row = Math.max(0, rows0); row <= Math.min(rows1, C + 7); row++) { c = center(colOf(row), row); if (row === Math.max(0, rows0)) g.moveTo(c.x, c.y); else g.lineTo(c.x, c.y); }
      g.stroke(); g.setLineDash([]); g.shadowBlur = 0;
      // 本部
      c = center(colOf(0), 0);
      if (c.y < H + R) { g.fillStyle = '#2fd6a6'; g.fillRect(c.x - 8, c.y - 6, 16, 10); g.fillStyle = '#13806a'; g.beginPath(); g.moveTo(c.x - 10, c.y - 6); g.lineTo(c.x, c.y - 13); g.lineTo(c.x + 10, c.y - 6); g.fill(); g.fillStyle = '#fff'; g.font = '800 9px -apple-system,sans-serif'; g.textAlign = 'center'; g.fillText('本部', c.x, c.y + 14); }
      // ステージの印
      var pulse = 0.5 + 0.5 * Math.sin(ts / 220);
      for (row = Math.max(1, rows0); row <= rows1; row++) {
        if (row > C + 7) break;
        c = center(colOf(row), row);
        if (c.y < -R || c.y > H + R) continue;
        var boss = row % 10 === 0, isNext = row === C + 1, done = row <= C && !(anim && row === anim.s && at < 0.5);
        var r = R * 0.5;
        if (row === st.sel) {
          // 選んだマス: 琥珀色の枠と四隅の括弧
          g.strokeStyle = '#f5b83d'; g.lineWidth = 2; g.shadowColor = '#f5b83d'; g.shadowBlur = 10; hexPath(c.x, c.y, R - 2.5); g.stroke(); g.shadowBlur = 0;
          var bb = R * 0.95; g.lineWidth = 1.5;
          [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (q) { g.beginPath(); g.moveTo(c.x + q[0] * bb, c.y + q[1] * (bb - 6)); g.lineTo(c.x + q[0] * bb, c.y + q[1] * bb); g.lineTo(c.x + q[0] * (bb - 6), c.y + q[1] * bb); g.stroke(); });
        }
        if (isNext) {
          // 次の目標: 脈打つ照準
          var rr0 = r + 5 + pulse * 3;
          g.strokeStyle = 'rgba(255,74,61,' + (0.45 + 0.55 * pulse) + ')'; g.lineWidth = 1.6;
          g.beginPath(); g.arc(c.x, c.y, rr0, 0, Math.PI * 2); g.stroke();
          g.beginPath(); g.moveTo(c.x - rr0 - 5, c.y); g.lineTo(c.x - rr0 + 3, c.y); g.moveTo(c.x + rr0 - 3, c.y); g.lineTo(c.x + rr0 + 5, c.y); g.moveTo(c.x, c.y - rr0 - 5); g.lineTo(c.x, c.y - rr0 + 3); g.moveTo(c.x, c.y + rr0 - 3); g.lineTo(c.x, c.y + rr0 + 5); g.stroke();
        }
        hexPath(c.x, c.y, r * 1.05);
        g.fillStyle = done ? '#0d4a3f' : isNext ? '#8a1a14' : '#3a0f0d'; g.fill();
        g.strokeStyle = boss ? '#f5b83d' : done ? '#2fd6a6' : '#ff6a5c'; g.lineWidth = boss ? 2 : 1.4; g.shadowColor = g.strokeStyle; g.shadowBlur = done || isNext || boss ? 8 : 0; g.stroke(); g.shadowBlur = 0;
        g.fillStyle = done ? '#a6f7e2' : '#fff'; g.font = '800 ' + Math.round(r * (done ? 0.9 : 0.78)) + 'px "SF Mono",ui-monospace,Menlo,monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(done ? '✓' : String(row), c.x, c.y + 0.5);
        if (boss) { g.fillStyle = '#f5b83d'; g.font = '800 8px "SF Mono",ui-monospace,Menlo,monospace'; g.fillText('◆BOSS◆', c.x, c.y - r - 7); }
        if (done || isNext || row === st.sel) {
          var lab = row + ' ' + TF.stageInfo(row).place;
          g.font = '800 9px -apple-system,"Hiragino Sans",sans-serif'; var lw2 = g.measureText(lab).width + 8;
          g.fillStyle = 'rgba(4,8,10,.75)'; g.fillRect(c.x - lw2 / 2, c.y + r + 3, lw2, 12);
          g.fillStyle = row === st.sel ? '#ffd98a' : 'rgba(232,238,241,.9)'; g.fillText(lab, c.x, c.y + r + 9.5);
        }
      }
      // 制圧の演出
      if (anim) {
        c = center(colOf(anim.s), anim.s);
        g.strokeStyle = 'rgba(120,255,150,' + (1 - at) + ')'; g.lineWidth = 3;
        g.beginPath(); g.arc(c.x, c.y, R * (0.6 + at * 2.2), 0, Math.PI * 2); g.stroke();
        g.fillStyle = 'rgba(255,255,255,' + Math.min(1, (1 - at) * 2) + ')'; g.font = '900 18px -apple-system,"Hiragino Sans",sans-serif'; g.textAlign = 'center';
        g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,.6)';
        g.strokeText('ステージ' + anim.s + ' 制圧!', c.x, c.y - R - 8 - at * 20); g.fillStyle = '#bfffc8'; g.fillText('ステージ' + anim.s + ' 制圧!', c.x, c.y - R - 8 - at * 20);
      }
      // 凡例
      g.font = '800 10px -apple-system,"Hiragino Sans",sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top';
      g.fillStyle = 'rgba(4,8,10,.8)'; g.fillRect(6, 6, 134, 18); g.fillStyle = '#f5b83d'; g.fillRect(6, 6, 2, 18);
      g.fillStyle = '#2fd6a6'; g.fillRect(14, 11, 8, 8); g.fillStyle = '#dfe8ec'; g.fillText('自軍の領土', 25, 10);
      g.fillStyle = '#ff4a3d'; g.fillRect(80, 11, 8, 8); g.fillStyle = '#dfe8ec'; g.fillText('敵の領土', 91, 10);
    }
    return { mount: mount, debug: function () { return { focus: focus, target: target, anim: !!anim }; }, centerOf: function (row) { return center(colOf(row), row); } };
  })();

  // ====== 出撃と結果 ======
  function startSortie() {
    var s = st.sel;
    // 列の配置は戦場ごと: まずおまかせ配置にして、配置画面で変えられる
    var prep = TF.prepareBattle(st, st.form.map(function (f) { return { type: f.type, hero: f.hero, lane: null }; }), s);
    var seed = (Math.random() * 2147483647) | 0;
    st.form = prep.form;
    // 結果は戦闘が終わってから決まる(手動の指示で変わるため)。途中で閉じたら残りは自動で決着
    st.pending = { s: s, seed: seed, form: prep.form };
    save();
    var rw = prep.info.reward, firstWin = s > st.cleared;
    Battle.play(prep, seed, st.speed, st.auto !== false, function (res) {
      if (!st.pending) return;
      st.pending.win = res.win; st.pending.timeout = res.timeout;
      finishBattle();
    }, {
      deploy: !(st.flags && st.flags.skipDeploy),
      // 配置を決めたら保存(途中で閉じても、その配置で残りを自動で決着)
      onDeploy: function (form) { if (st.pending) { st.pending.form = form; st.form = form; save(); } }
    });
  }
  function finishBattle() {
    var p = st.pending;
    if (!p) return;
    if (p.win === undefined) {
      var prep = TF.prepareBattle(st, p.form, p.s);
      var r = TF.simulate(prep.p, prep.e, p.seed | 0, false, { reserves: prep.reserves, posts: prep.posts, terrain: prep.terrain });
      p.win = r.win; p.timeout = r.timeout; p.resumed = true;
    }
    var wasCleared = st.cleared;
    var sum = TF.applyResult(st, p.s, p.win, p.form, partRoll(p.seed));
    st.pending = null;
    if (sum.part) st.flags.itemNew = 1; // 新しいアイテム: かばんのボタンに印
    if (sum.first) { st.sel = st.cleared + 1; st.flags.conq = p.s; }
    save();
    render();
    showResult(p, sum, wasCleared);
  }
  function showResult(p, sum, wasCleared) {
    var html = '<div class="result">';
    if (p.win) {
      html += '<h2 class="win">勝利!</h2><div class="sub">ステージ' + p.s + ' ' + (sum.first ? '初クリア!' : 'クリア') + '</div>';
      html += '<div class="rlist"><div class="rline">' + icoMoney() + '<span class="grow">資金</span><b class="num">+' + fmt(sum.m) + '</b></div>' +
        '<div class="rline">' + icoSteel() + '<span class="grow">鋼材</span><b class="num">+' + fmt(sum.s) + '</b></div>' +
        '<div class="rline">' + icoBp() + '<span class="grow">設計図 <span class="small">(兵器の開発に使う)</span></span><b class="num">+' + fmt(sum.bp) + '</b></div>' +
        (sum.part ? '<div class="rline rare">' + icoPart() + '<span class="grow"><b>' + TF.partName(sum.part.g) + '</b></span><b class="num">+' + sum.part.n + '</b></div>' : '') +
        (sum.first ? '<div class="small" style="text-align:center">初回クリアボーナスで報酬' + TF.K.firstMul + '倍!</div>' : '') + '</div>';
    } else {
      html += '<h2 class="lose">' + (p.timeout ? '時間切れ' : '敗北…') + '</h2><div class="sub">兵は失われていません。強化して再挑戦しよう。</div>';
    }
    // 敵の作戦は戦闘のあとで明かす
    var tinf = TF.stageInfo(p.s);
    html += '<div class="small" id="resTactic" style="text-align:center;margin:-2px 0 8px;color:var(--khaki)">敵の作戦: ' + TF.TACTICS[tinf.tactic] + (tinf.ecmd ? ' ・ 敵将「' + TF.ECMD[tinf.ecmd].name + '」' : '') + '</div>';
    if (sum.heroExp.length) {
      html += '<div class="rlist">' + sum.heroExp.map(function (x) {
        return '<div class="rline"><div class="portrait xs">' + heroSvg(x.id) + '</div><span class="grow">' + TF.HERO[x.id].name + ' <span class="small">EXP +' + fmt(x.gain) + '</span></span>' +
          (x.after > x.before ? '<span class="up">Lv' + x.before + '→' + x.after + '!</span>' : '<span class="small">Lv' + x.after + '</span>') + '</div>';
      }).join('') + '</div>';
    }
    if (p.resumed) html += '<div class="small" style="text-align:center;margin-bottom:6px">(戦闘の途中で閉じたため、残りは自動で戦いました)</div>';
    if (!p.win) {
      var info = TF.stageInfo(p.s);
      html += '<div class="card small" style="margin-top:8px;line-height:1.6">' + esc(adviceLine(info)) + '<div id="farmBox" style="margin-top:6px">' + (st.cleared >= 1 ? '稼ぎにおすすめのステージを探しています…' : '') + '</div></div>';
      html += '<div class="btns"><div class="row"><button class="btn sub" data-act="r-form">編成を見直す</button><button class="btn sub" data-act="r-base">基地で強化</button></div><div id="farmBtn"></div></div>';
      if (st.cleared >= 1) setTimeout(function () {
        var farm = bestFarm(), box = $('farmBox'), bt = $('farmBtn');
        if (!farm || !box) return;
        box.innerHTML = farmText(farm);
        bt.innerHTML = '<button class="btn wide" data-act="r-farm" data-s="' + farm.s + '">ステージ' + farm.s + 'で稼ぐ</button>';
      }, 60);
    } else {
      html += '<div class="btns">' + (sum.first ? '<button class="btn wide big" data-act="r-next">次のステージへ</button>' : '<button class="btn wide big" data-act="r-retry">もう一度出撃</button>') +
        '<div class="row"><button class="btn sub" data-act="r-form">出撃画面へ</button><button class="btn sub" data-act="r-base">基地へ</button></div></div>';
    }
    html += '</div>';
    openModal(html);
    pendingHeroes = pendingHeroes.concat(sum.newHeroes);
  }
  var pendingHeroes = [];
  function showHeroJoin() {
    var id = pendingHeroes.shift();
    if (!id) return false;
    // 指揮官のいない部隊があれば、得意兵種を優先して配属する
    st.form = TF.normalizeForm(st, st.form);
    var free = st.form.filter(function (f) { return !f.hero; });
    if (free.length) {
      var pick = free.filter(function (f) { return f.type === TF.HERO[id].fav; })[0] || free[0];
      pick.hero = id;
      save();
    }
    var hd = TF.HERO[id], sk = TF.SKILL[hd.skill];
    openModal('<div class="result"><div class="sub" style="color:var(--gold);font-weight:800;letter-spacing:.2em">新たな指揮官が着任!</div>' +
      '<div style="display:grid;place-items:center;margin:8px 0"><div class="portrait" style="width:120px;height:120px;border-radius:24px;border-color:var(--gold)">' + heroSvg(id) + '</div></div>' +
      '<h2 class="win" style="font-size:26px">' + hd.name + '</h2><div class="sub">' + hd.title + ' ・ Lv' + st.heroes[id].lv + ' ・ 得意: ' + TF.UNIT[hd.fav].name + '</div>' +
      '<div class="traits" style="justify-content:center">' + TF.heroTraits(id).map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
      '<div class="skill" style="font-size:13px">固有スキル <b>' + sk.name + '</b>: ' + sk.desc + '</div>' +
      (st.cleared > hd.unlock ? '<div class="small" style="margin-top:8px;color:var(--khaki)">ステージ' + hd.unlock + 'はクリア済みなので、すぐに着任しました。</div>' : '') +
      '<div class="small" style="margin-top:8px">' + (st.form.some(function (f) { return f.hero === id; }) ? '空いていた部隊に配属しました。' : '出撃画面で部隊に配属しよう。') + '得意兵種を率いると大きく強くなります。</div>' +
      '<div class="btns"><button class="btn wide" data-act="hero-ok">了解!</button></div></div>');
    return true;
  }
  // 稼ぎにおすすめのステージ:
  // 「勝てる」= おまかせ編成で予想勝率80%以上 のステージのうち、
  // 1戦あたりの稼ぎ(予想勝率×報酬)がいちばん多いもの。ボス戦は報酬2倍なので、少し前のボス戦が選ばれることもある。
  var FARM_OK = 0.8, farmCache = null;
  function bestFarm() {
    if (st.cleared < 1) return null;
    var key = st.cleared + '|' + JSON.stringify(st.bld, function (k, v) { return k === 'stored' || k === 't' ? undefined : v; }) + '|' + JSON.stringify(st.heroes) + '|' + JSON.stringify(st.arms);
    if (farmCache && farmCache.key === key) return farmCache.v;
    var C = st.cleared, best = null, top = null, n = 0, done = {}, list = [];
    function value(rw) { return rw.m + rw.s * 1.6; }
    function consider(s) {
      if (s < 1 || s > C || done[s]) return null;
      var rw = TF.stageReward(s);
      if (best && value(rw) <= best.inc) return null; // 全勝しても今の候補を超えられない
      done[s] = true; n++;
      var f = TF.autoFormation(st, s, 6);
      var wr = TF.predict(st, f, s, 40).winRate;
      var e = { s: s, wr: wr, inc: wr * value(rw), m: rw.m, st: rw.s };
      list.push(e);
      if (!top || wr > top.wr || (wr === top.wr && e.inc > top.inc)) top = e;
      if (wr >= FARM_OK && (!best || e.inc > best.inc)) best = e;
      return e;
    }
    var s, lo = Math.max(1, C - 11);
    for (s = C; s >= lo; s--) consider(s);
    if (!best) {
      // 直近で勝てるところがなければ、間隔を広げながらさかのぼり、見つかったら手前も調べる
      var fail = lo, back = 16;
      while (!best && C - back >= 1 && n < 26) {
        var e = consider(C - back);
        if (e && e.wr < FARM_OK) fail = C - back;
        back = Math.ceil(back * 1.5);
      }
      if (!best) consider(1);
      if (best) for (s = fail - 1; s > best.s && n < 34; s--) consider(s);
    }
    if (best) {
      // さらに前でも、報酬が今の候補を上回り得るステージ(とくにボス戦)だけ調べる
      for (s = Math.min(lo, best.s) - 1; s >= 1 && n < 42; s--) {
        var nb = Math.floor(s / 10) * 10;
        var bossLeft = nb >= 10 && value(TF.stageReward(nb)) > best.inc;
        if (s % 10 !== 0 && value(TF.stageReward(s)) <= best.inc && !bossLeft) break;
        consider(s);
      }
    }
    // 候補を、出撃画面と同じ計算(おまかせ編成・100回の模擬戦)で確かめてから決める
    function precise(e) {
      e.wr = TF.predict(st, TF.autoFormation(st, e.s), e.s, 100).winRate;
      e.inc = e.wr * value(TF.stageReward(e.s));
      return e;
    }
    var v = null;
    var cands = list.filter(function (e) { return e.wr >= FARM_OK; }).sort(function (a, b) { return b.inc - a.inc; });
    for (var i = 0; i < cands.length && i < 3; i++) {
      if (precise(cands[i]).wr >= FARM_OK) { v = cands[i]; break; }
    }
    if (!v && top) v = precise(top);
    if (v) { v.ok = v.wr >= FARM_OK; v.evals = n; }
    farmCache = { key: key, v: v };
    return v;
  }
  function farmText(f) {
    var pct = Math.round(f.wr * 100);
    if (!f.ok) return '勝率80%以上のステージがまだありません。いちばん勝ちやすいのは <b style="color:var(--gold)">ステージ' + f.s + '</b>(予想勝率' + pct + '%)。施設を強化しよう。';
    return '稼ぐなら <b style="color:var(--gold)">ステージ' + f.s + '</b> がおすすめ(予想勝率' + pct + '%)。<br>1戦で ' + icoMoneyInline() + fmt(f.m) + ' ' + icoSteelInline() + fmt(f.st) + '(勝率込みの平均 ' + icoMoneyInline() + fmt(f.m * f.wr) + ')';
  }

