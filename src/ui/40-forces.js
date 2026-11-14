  // ====== 画面: 部隊 ======
  function renderArmy() {
    var html = '<h2 class="sec" style="margin-top:4px">兵種</h2><div class="ulist">';
    TF.TYPES.forEach(function (t) {
      var on = TF.typeUnlocked(st, t), q = TF.squadStats(st, t, null), b = TF.TYPE_BLD[t];
      html += '<div class="card urow"><div class="uicon' + (on ? '' : ' off') + '">' + allySvg(t) + '</div><div class="grow">' +
        '<div class="row"><b>' + TF.UNIT[t].name + '</b>' + (on ? '<span class="pill">' + TF.BLD[b].name + ' Lv' + TF.lv(st, b) + '</span>' : '<span class="pill red">' + TF.BLD[b].name + 'で解放</span>') + '</div>' +
        (on ? '<div class="stats"><span>HP <b class="num">' + fmt(q.maxHp) + '</b></span><span>攻撃 <b class="num">' + fmt(q.atk) + '</b></span><span>戦力 <b class="num">' + fmt(q.power) + '</b></span><span>射程 <b>' + rngText(t) + '</b></span><span>索敵 <b>' + TF.K.det[t] + '列</b></span><span>見つかりにくさ <b>' + hideText(t) + '</b></span></div>' : '') +
        (on ? '<div class="small" style="margin-top:2px">武装: ' + TF.ARM_KINDS.map(function (k) { var l = TF.armLv(st, t, k); return l ? TF.armName(t, k, l) + ' Lv' + l : '<span style="opacity:.6">' + TF.ARM_KIND[k].name + 'なし</span>'; }).join(' ・ ') + '</div>' : '') +
        '<div class="aff"><span class="s">強い: ' + names(STRONG[t]) + '</span> / <span class="w">弱い: ' + names(WEAK[t]) + '</span></div></div></div>';
    });
    html += '</div><div class="small" style="margin-top:6px">研究所 Lv' + TF.lv(st, 'lab') + ': 全兵種 ×' + TF.labMult(st).toFixed(2) + '(数値は指揮官なしの場合)</div>';
    html += '<h2 class="sec">指揮官</h2><div class="ulist">';
    var assigned = {};
    st.form.forEach(function (f, i) { if (f.hero) assigned[f.hero] = i + 1; });
    TF.HEROES.forEach(function (hd) {
      var h = st.heroes[hd.id], sk = TF.SKILL[hd.skill];
      if (!h) {
        html += '<div class="card hero"><div class="portrait locked">' + heroSvg(hd.id) + '</div><div class="grow"><div class="nm" style="color:var(--dim)">??? </div><div class="ttl">' + hd.title + ' ・ 得意: ' + TF.UNIT[hd.fav].name + '</div>' +
          '<div class="small" style="margin-top:4px">ステージ' + hd.unlock + 'をクリアすると着任</div>' +
          '<div class="traits">' + TF.heroTraits(hd.id).map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
          '<div class="skill">固有スキル <b>' + sk.name + '</b>: ' + sk.desc + '</div></div></div>';
        return;
      }
      var need = TF.expNeed(h.lv);
      html += '<div class="card hero"><div class="portrait">' + heroSvg(hd.id) + '</div><div class="grow"><div class="row"><span class="nm">' + hd.name + '</span><span class="pill gold">Lv' + h.lv + '</span></div>' +
        '<div class="ttl">' + hd.title + ' ・ 得意: ' + TF.UNIT[hd.fav].name + '</div>' +
        '<div class="row" style="margin-top:4px"><div class="bar grow"><i style="width:' + (h.exp / need * 100).toFixed(1) + '%;background:linear-gradient(90deg,#c99a2e,#f1c453)"></i></div><span class="small num">' + fmt(h.exp) + '/' + fmt(need) + '</span></div>' +
        '<div class="stats" style="margin-top:2px"><span>率いる部隊 <b>×' + heroPow(hd.id, h.lv, false).toFixed(2) + '</b></span><span>得意兵種なら <b>×' + heroPow(hd.id, h.lv, true).toFixed(2) + '</b></span></div>' +
        '<div class="traits">' + TF.heroTraits(hd.id).map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
        '<div class="skill">固有スキル <b>' + sk.name + '</b>: ' + sk.desc + '</div>' +
        '<div class="small" style="margin-top:4px">' + (assigned[hd.id] ? '部隊' + assigned[hd.id] + 'を指揮中' : '待機中(出撃画面で配属)') + '</div></div></div>';
    });
    html += '</div>';
    html += '<h2 class="sec">相性表</h2><div class="card"><table class="mtx"><tr><th>攻撃→</th>' + TF.TYPES.map(function (t) { return '<th>' + SHORT[t] + '</th>'; }).join('') + '</tr>';
    TF.TYPES.forEach(function (a) {
      html += '<tr><th>' + SHORT[a] + '</th>' + TF.TYPES.map(function (d) {
        var v = TF.AFF[a][d];
        var c = v >= 2 ? 's2' : v >= 1.4 ? 's1' : v >= 1 ? 'n' : 'w1';
        var m = v >= 2 ? '◎' : v >= 1.4 ? '○' : v >= 1 ? '−' : '△';
        return '<td class="' + c + '">' + m + '<br><span style="font-size:10px;font-weight:600">×' + v + '</span></td>';
      }).join('') + '</tr>';
    });
    html += '</table><div class="small" style="margin-top:6px">行の兵種が列の兵種を攻撃したときのダメージ倍率。</div></div>';
    $('scr-army').innerHTML = html;
  }

  // ====== 画面: 兵器(武装の開発・強化) ======
  var KICO = {
    w: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/></svg>',
    a: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5.5-3.4 9.4-8 11-4.6-1.6-8-5.5-8-11V5z" fill="currentColor"/><path d="M12 5.2v14" stroke="#000" stroke-opacity=".25" stroke-width="1.4"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M13.5 2 4.5 14h6.2l-1.2 8 9-12.2h-6.2z" fill="currentColor"/></svg>'
  };
  function armSel() {
    var ts = TF.unlockedTypes(st);
    var t = st.flags.armSel;
    if (!t || ts.indexOf(t) < 0) t = ts[0] || 'inf';
    return t;
  }
  function anyArm() {
    if (!TF.lv(st, 'lab')) return false;
    return TF.unlockedTypes(st).some(function (t) { return TF.ARM_KINDS.some(function (k) { return TF.canArm(st, t, k).ok; }); });
  }
  // 小さい差も見えるよう、端数があれば小数1桁まで
  function armPct(v) { var x = Math.round(v * 1000) / 10; return '+' + (x % 1 ? x.toFixed(1) : x) + '%'; }
  function armEffText(t, k, l) {
    var e = TF.armEffect(k, l, t);
    if (k === 'x') return names(TF.ARMS[t].vs) + 'へのダメージ ' + armPct(e);
    return TF.ARM_KIND[k].stat + ' ' + armPct(e);
  }
  function renderArms() {
    var lab = TF.lv(st, 'lab'), t = armSel();
    // 開発に使うアイテム(設計図・試作部品)は常に出さず、必要なときに一覧を開く
    var html = '<button class="card armlink wide" data-act="items">' + icoPart() + '<span class="grow" style="text-align:left"><b>開発アイテム</b> <span class="small">設計図・試作部品の数と集め方</span></span><span class="pill">一覧 ▶</span></button>';
    if (!lab) {
      html += '<div class="card" style="margin-top:10px;text-align:center;line-height:1.7"><div style="font-weight:900;font-size:16px;margin-bottom:4px">兵器開発</div>' +
        '各兵種の<b>武器</b>(攻撃力)・<b>防護</b>(耐久)・<b>特殊</b>(苦手な敵へのダメージ)を開発・強化できます。<br>' +
        '<span style="color:var(--warn)">基地に「研究所」を建てると使えるようになります(司令部Lv3から)。</span>' +
        '<div style="margin-top:10px"><button class="btn sub" data-act="tab" data-tab="base">基地へ</button></div></div>';
      $('scr-arms').innerHTML = html;
      return;
    }
    html += '<div class="armtypes">' + TF.TYPES.map(function (x) {
      var on = TF.typeUnlocked(st, x), tot = 0;
      TF.ARM_KINDS.forEach(function (k) { tot += TF.armLv(st, x, k); });
      var can = on && TF.ARM_KINDS.some(function (k) { return TF.canArm(st, x, k).ok; });
      return '<button data-act="arm-type" data-t="' + x + '"' + (x === t ? ' class="on"' : '') + (on ? '' : ' disabled') + '>' + (on ? allySvg(x) : offSvg(x)) +
        '<span>' + SHORT[x] + '</span><span class="lvs">' + (on ? '武装Lv' + tot : '未解放') + '</span><i class="dot' + (can ? ' on' : '') + '"></i></button>';
    }).join('') + '</div>';
    var o = TF.armOpt(st, t), q = TF.squadStats(st, t, null);
    html += '<div class="card armsum"><div class="big">' + allySvg(t) + '</div><div class="grow"><div style="font-weight:900;font-size:16px">' + TF.UNIT[t].name + 'の武装</div>' +
      '<div class="st"><span>攻撃力 <b>×' + o.atkMul.toFixed(2) + '</b></span><span>耐久 <b>×' + o.hpMul.toFixed(2) + '</b></span><span>' + names(TF.ARMS[t].vs) + 'へ <b>×' + (o.vs ? o.vs[TF.ARMS[t].vs[0]] : 1).toFixed(2) + '</b></span></div>' +
      '<div class="st"><span>HP <b class="num">' + fmt(q.maxHp) + '</b></span><span>攻撃 <b class="num">' + fmt(q.atk) + '</b></span><span>戦力 <b class="num">' + fmt(q.power) + '</b></span></div></div></div>';
    html += '<div class="armlist">';
    TF.ARM_KINDS.forEach(function (k) {
      var l = TF.armLv(st, t, k), chk = TF.canArm(st, t, k), c = chk.cost || TF.armCost(t, k, l), dev = TF.armIsDev(l);
      var inTier = l === 0 ? 0 : ((l - 1) % TF.K.armPer) + 1, pips = '';
      for (var i = 1; i <= TF.K.armPer; i++) pips += '<i' + (i <= inTier ? ' class="on"' : '') + '></i>';
      var nextName = TF.armName(t, k, l + 1);
      html += '<div class="card arm" id="arm-' + t + '-' + k + '"><div class="top"><div class="wico' + (l ? '' : ' none') + '">' + ArmArt.icon(t, k, Math.max(1, TF.armTier(l))) + '<span class="kb ' + k + '">' + KICO[k] + '</span>' + (l ? '' : '<span class="nd">未開発</span>') + '</div><div class="grow">' +
        '<div class="kind">' + TF.ARM_KIND[k].name + (k === 'x' ? '(' + names(TF.ARMS[t].vs) + 'に強くなる)' : '') + '</div>' +
        '<div class="row"><span class="nm' + (l ? '' : ' none') + '">' + (l ? esc(TF.armName(t, k, l)) : '未開発') + '</span>' + (l ? '<span class="pill gold">Lv' + l + '</span>' : '') + '</div>' +
        (l ? '<div class="pips">' + pips + '</div>' : '') +
        '<div class="eff">' + (l ? armEffText(t, k, l) : TF.ARM_KIND[k].name + 'なし') + ' → <b>' + armEffText(t, k, l + 1).replace(/^.* /, '') + '</b>' + (dev && l ? ' <span class="pill blue">新型: ' + esc(nextName) + '</span>' : '') + '</div></div></div>';
      html += '<div class="act"><div class="costs">' + (c.part ? '<button class="cost partc mat' + (TF.partCount(st, c.part) < 1 ? ' short' : '') + '" data-act="part-go" data-g="' + c.part + '">' + icoPart() + TF.partName(c.part).replace('試作部品', '部品') + ' ' + TF.partCount(st, c.part) + '/1</button>' : '') + (c.bp ? '<button class="cost mat' + ((st.bp || 0) < c.bp ? ' short' : '') + '" data-act="bp-go">' + icoBp() + fmt(c.bp) + '</button>' : '') + costHtml(c) + '</div>' +
        '<button class="btn ' + (dev ? 'dev' : 'green') + '" data-act="arm-up" data-t="' + t + '" data-k="' + k + '"' + (chk.ok ? '' : ' disabled') + '>' + (l === 0 ? '配備' : dev ? '開発' : '強化') + '</button></div>' +
        (chk.ok ? '' : '<div class="why">' + esc(chk.reason) + (chk.cap ? '(武装のレベル上限は 研究所Lv×' + TF.K.armLab + ')' : '') +
          (chk.needPart ? '<br><span class="small">' + partWhere(chk.needPart) + 'で手に入ります(初クリアで' + TF.K.partFirst + '個)</span> <button class="pill" data-act="part-go" data-g="' + chk.needPart + '">ボス戦へ ▶</button>' : '') + '</div>') + '</div>';
    });
    html += '</div><div class="small" style="margin-top:8px;line-height:1.6">研究所 Lv' + lab + ': 武装のレベル上限 ' + TF.armMax(st) + '。最初の型は設計図で配備、' + TF.K.armPer + 'レベルごとの新型の開発には試作部品と設計図が必要。増援の部隊にも武装が反映されます。武装の名前は実在の兵器から取っています(性能はゲーム用の数値です)。</div>';
    $('scr-arms').innerHTML = html;
    if (st.flags.armNew) { delete st.flags.armNew; save(); renderTop(); }
  }
  // ====== アイテム一覧(開発に使う設計図・試作部品) ======
  // 上のかばんのボタンか、兵器の画面から開く。各アイテムの集め方へ移動できる
  function openItems() {
    if (st.flags.itemNew) { delete st.flags.itemNew; save(); }
    $('dotItems').classList.remove('on');
    var html = '<div class="grab"></div><button class="close" data-act="sheet-close" aria-label="閉じる">✕</button><h3>アイテム</h3>' +
      '<div class="small">兵器の開発に使うアイテムです。「集めに行く」で手に入るステージへ移動します。</div><div class="itemlist">';
    // 設計図
    var bpUse = [];
    TF.unlockedTypes(st).forEach(function (t) { TF.ARM_KINDS.forEach(function (k) { var c = TF.armCost(t, k, TF.armLv(st, t, k)); if (c.bp && TF.armLv(st, t, k) < TF.armMax(st)) bpUse.push(c.bp); }); });
    html += '<div class="card item' + ((st.bp || 0) ? '' : ' zero') + '"><div class="ic">' + icoBp() + '</div><div class="grow"><div class="row"><span class="nm">設計図</span><b class="n num">' + fmt(st.bp || 0) + '</b></div>' +
      '<div class="small">戦闘に勝つと手に入ります(先のステージほど多く、ボス戦・初クリアは2倍)。武装の配備と新型の開発に使います。</div>' +
      (bpUse.length ? '<div class="small use">次の開発に必要: ' + fmt(Math.min.apply(null, bpUse)) + (Math.max.apply(null, bpUse) > Math.min.apply(null, bpUse) ? '〜' + fmt(Math.max.apply(null, bpUse)) : '') + '</div>' : '') +
      '<button class="pill" data-act="bp-go">集めに行く ▶</button></div></div>';
    // 試作部品: 持っている等級と、次の開発に要る等級(手の届くところまで)
    var reach = TF.partGrade(Math.max(10, Math.ceil((st.cleared + 1) / 10) * 10)), top = 1, use = {};
    Object.keys(st.parts || {}).forEach(function (g) { top = Math.max(top, +g); });
    TF.unlockedTypes(st).forEach(function (t) {
      TF.ARM_KINDS.forEach(function (k) {
        var l = TF.armLv(st, t, k), c = TF.armCost(t, k, l);
        if (!c.part) return;
        if (c.part <= reach) top = Math.max(top, c.part);
        (use[c.part] = use[c.part] || []).push(SHORT[t] + 'の' + TF.ARM_KIND[k].name + '「' + TF.armName(t, k, l + 1) + '」');
      });
    });
    for (var g = 1; g <= top; g++) {
      var n = TF.partCount(st, g), first = TF.partStages(g)[0];
      html += '<div class="card item part' + (n ? '' : ' zero') + '" id="item-part-' + g + '"><div class="ic">' + icoPart() + '</div><div class="grow"><div class="row"><span class="nm">' + TF.partName(g) + '</span><b class="n num">×' + n + '</b></div>' +
        '<div class="small">' + partWhere(g) + 'で手に入ります(初クリアで' + TF.K.partFirst + '個)。新型の開発に1個使います。</div>' +
        (use[g] ? '<div class="small use">次に使う開発: ' + use[g].map(esc).join('、') + '</div>' : '') +
        '<button class="pill" data-act="part-go" data-g="' + g + '">' + (st.cleared >= first ? 'ボス戦へ ▶' : 'ステージ' + first + 'へ ▶') + '</button></div></div>';
    }
    html += '</div>';
    openSheet(html);
  }
  function showDevDone(t, k, r) {
    // 部隊の見た目が変わるなら、前と後を並べて見せる
    var wT = armTierOf(t, 'w'), aT = armTierOf(t, 'a');
    var before = ArmArt.unit(t, ALLY_C, k === 'w' ? TF.armTier(r.lv - 1) : wT, k === 'a' ? TF.armTier(r.lv - 1) : aT);
    var after = ArmArt.unit(t, ALLY_C, wT, aT);
    var morph = before !== after ? '<div class="morph"><div class="uicon">' + before + '</div><span class="ar">▶</span><div class="uicon new">' + after + '</div></div><div class="small" style="text-align:center;margin-top:-4px;margin-bottom:6px">' + TF.UNIT[t].name + 'の見た目も新しくなりました</div>' : '';
    openModal('<div class="result"><div class="sub" style="color:#d9b8ff;font-weight:900;letter-spacing:.2em;margin-bottom:0">' + (r.lv === 1 ? '新兵器 配備完了!' : '新型兵器 開発成功!') + '</div>' +
      '<div class="devart"><div class="ring w2">' + ArmArt.icon(t, k, TF.armTier(r.lv)) + '<span class="kb ' + k + '">' + KICO[k] + '</span></div></div>' +
      '<h2 class="win" style="font-size:' + (r.name.length > 11 ? 20 : r.name.length > 8 ? 24 : 28) + 'px;letter-spacing:.02em">' + esc(r.name) + '</h2><div class="sub">' + TF.UNIT[t].name + 'の' + TF.ARM_KIND[k].name + ' ・ Lv' + r.lv + (r.cost.part ? ' ・ ' + TF.partName(r.cost.part) + 'を使用' : '') + '</div>' +
      '<div class="rlist"><div class="rline"><span style="color:#d9b8ff">' + KICO[k].replace('<svg ', '<svg style="width:22px;height:22px" ') + '</span><span class="grow">' + armEffText(t, k, r.lv - 1).replace(/ [^ ]*$/, '') + '</span><span class="small">' + armEffText(t, k, r.lv - 1).replace(/^.* /, '') + ' → </span><b class="up">' + armEffText(t, k, r.lv).replace(/^.* /, '') + '</b></div></div>' +
      morph +
      '<div class="btns"><button class="btn wide" data-act="modal-close">配備する!</button></div></div>');
  }

