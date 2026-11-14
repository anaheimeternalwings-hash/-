  // ====== 目標(作戦・任務・勲章・図鑑) ======
  // 端末の日付の通し番号(任務はこの番号が変わると入れ替わる)
  function dayNum() { var d = new Date(); return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000); }
  function goalsDot() { return TF.msClaimable(st) + TF.medalClaimable(st); }
  function rewardHtml(r) {
    return '<span class="cost">' + icoMoney() + fmt(r.m) + '</span><span class="cost">' + icoSteel() + fmt(r.s) + '</span>' + (r.bp ? '<span class="cost">' + icoBp() + fmt(r.bp) + '</span>' : '');
  }
  var TIER_COL = ['#c98a4b', '#c9d6de', '#ffd24d', '#8fe8ff', '#d9a8ff', '#ff8a7a'];
  function medalIcon(got, max) {
    var c = got > 0 ? TIER_COL[Math.min(got, TIER_COL.length) - 1] : '#3b4a54', pips = '';
    for (var i = 0; i < max; i++) pips += '<circle cx="' + (32 + (i - (max - 1) / 2) * 7) + '" cy="55" r="2.2" fill="' + (i < got ? c : '#27343c') + '"/>';
    return '<svg viewBox="0 0 64 64" class="medalico"><path d="M22 4h20l-4 16H26z" fill="' + (got > 0 ? '#7a2a2a' : '#252f36') + '"/><path d="M27 4h10l-2 16h-6z" fill="' + (got > 0 ? '#c9a24a' : '#2f3b43') + '"/>' +
      '<path d="M32 18l12 7v14l-12 7-12-7V25z" fill="#0a1014" stroke="' + c + '" stroke-width="3"/><path d="M32 25l2.6 5.4 5.9.7-4.4 4 1.2 5.8-5.3-3-5.3 3 1.2-5.8-4.4-4 5.9-.7z" fill="' + c + '"/>' + pips + '</svg>';
  }
  // 作戦の進み具合(10ステージ。最後はボス)
  function opBar(op, cleared) {
    var h = '<div class="opbar">';
    for (var s = op.first; s <= op.last; s++) h += '<i class="' + (s <= cleared ? 'on' : s === cleared + 1 ? 'cur' : '') + (s === op.last ? ' boss' : '') + '"></i>';
    return h + '</div>';
  }
  // 基地の上の「司令室」: いまの作戦と、今日の任務・勲章への入口
  function opsPanel() {
    var op = TF.opInfo(st.cleared + 1), done = st.cleared - (op.first - 1), ms = TF.msState(st, dayNum());
    var got = ms.filter(function (x) { return x.got; }).length, can = TF.msClaimable(st), mc = TF.medalClaimable(st);
    var ml = TF.medalList(st), mgot = ml.reduce(function (a, x) { return a + x.got; }, 0), mmax = ml.reduce(function (a, x) { return a + x.max; }, 0);
    var html = '<div class="ops card" id="opsPanel"><div class="ophead"><span class="tag">OPERATION ' + ('0' + op.n).slice(-2) + '</span><b class="grow">作戦「' + esc(op.name) + '」</b><span class="num">' + done + '/10</span></div>' + opBar(op, st.cleared) +
      '<div class="opgoal">' + esc(nextGoal()) + '</div><div class="oprow">' +
      '<button class="gbtn" data-act="goals" data-tab="ms"><span class="k">任務</span><span class="v num">' + got + '/' + ms.length + '</span>' +
      '<span class="dots">' + ms.map(function (x) { return '<i class="' + (x.got ? 'got' : x.done ? 'done' : '') + '"></i>'; }).join('') + '</span>' + (can ? '<em>受取 ' + can + '</em>' : '') + '</button>' +
      '<button class="gbtn" data-act="goals" data-tab="medal"><span class="k">勲章</span><span class="v num">' + mgot + '/' + mmax + '</span>' + (mc ? '<em>受取 ' + mc + '</em>' : '') + '</button></div></div>';
    return html;
  }
  var goalsTab = 'ms';
  function openGoals(tab) {
    if (tab) goalsTab = tab;
    sheetCtx = { kind: 'goals' };
    var html = '<div class="grab"></div><button class="close" data-act="sheet-close" aria-label="閉じる">✕</button><h3>司令室</h3>' +
      '<div class="seg gtabs">' + [['ms', '任務'], ['medal', '勲章'], ['book', '図鑑']].map(function (t) {
        var n = t[0] === 'ms' ? TF.msClaimable(st) : t[0] === 'medal' ? TF.medalClaimable(st) : 0;
        return '<button data-act="goals" data-tab="' + t[0] + '" class="' + (goalsTab === t[0] ? 'on' : '') + '">' + t[1] + (n ? '<i class="dot on"></i>' : '') + '</button>';
      }).join('') + '</div>';
    if (goalsTab === 'ms') html += missionsHtml(); else if (goalsTab === 'medal') html += medalsHtml(); else html += bookHtml();
    openSheet(html, true);
  }
  function missionsHtml() {
    var ms = TF.msState(st, dayNum()), rw = TF.msReward(st, false), all = TF.msReward(st, true), allGot = st.ms.all;
    var html = '<div class="small" style="margin:10px 2px 8px">1日に3つ。日付が変わると入れ替わります。</div><div class="glist">';
    ms.forEach(function (x) {
      html += '<div class="gitem' + (x.got ? ' got' : x.done ? ' can' : '') + '" id="ms-' + x.i + '"><div class="grow"><div class="nm">' + esc(x.name) + '</div>' +
        '<div class="gbar"><i style="width:' + Math.round(x.p / x.n * 100) + '%"></i></div><div class="row grw"><span class="num">' + x.p + '/' + x.n + '</span>' + rewardHtml(rw) + '</div></div>' +
        (x.got ? '<span class="pill">受取済</span>' : '<button class="btn' + (x.done ? ' green' : ' sub') + '" data-act="ms-claim" data-i="' + x.i + '"' + (x.done ? '' : ' disabled') + '>' + (x.done ? '受け取る' : '進行中') + '</button>') + '</div>';
    });
    html += '</div><div class="gall' + (allGot ? ' got' : '') + '"><div class="grow"><b>3つすべて達成</b><div class="row grw">' + rewardHtml(all) + '</div></div><span class="pill' + (allGot ? '' : ' gold') + '">' + (allGot ? '受取済' : '追加の報酬') + '</span></div>';
    return html;
  }
  function medalsHtml() {
    var list = TF.medalList(st);
    // 受け取れるものを上に
    list.sort(function (a, b) { return (b.can ? 1 : 0) - (a.can ? 1 : 0); });
    var html = '<div class="small" style="margin:10px 2px 8px">記録が伸びると、段ごとに1回ずつ報酬がもらえます。</div><div class="glist">';
    list.forEach(function (m) {
      var done = m.next === null, pct = done ? 100 : Math.min(100, Math.round(m.v / m.next * 100));
      html += '<div class="gitem' + (m.can ? ' can' : done ? ' got' : '') + '" id="medal-' + m.id + '">' + medalIcon(m.got, m.max) + '<div class="grow"><div class="nm">' + esc(m.name) + (m.tier ? ' <span class="pill">' + m.tier + '</span>' : '') + '</div>' +
        '<div class="small">' + esc(m.desc) + '</div><div class="gbar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="row grw"><span class="num">' + fmt(m.v) + (done ? '' : ' / ' + fmt(m.next)) + ' ' + m.unit + '</span>' + (done ? '<span class="small">すべて授与済み</span>' : '') + '</div>' + (done ? '' : '<div class="row grw">' + rewardHtml(TF.medalReward(st, m.got)) + '</div>') + '</div>' +
        (done ? '' : '<button class="btn' + (m.can ? ' green' : ' sub') + '" data-act="medal-claim" data-id="' + m.id + '"' + (m.can ? '' : ' disabled') + '>' + (m.can ? '受け取る' : m.nextTier) + '</button>') + '</div>';
    });
    return html + '</div>';
  }
  function bookHtml() {
    var S = st.stats, html = '<h2 class="sec">戦績</h2><div class="basestats">';
    [['戦闘', S.battles], ['勝利', S.wins], ['撃破した敵部隊', S.kill || 0], ['S評価のステージ', TF.medalList(st).filter(function (m) { return m.id === 'perfect'; })[0].v], ['制圧した作戦', Math.floor(st.cleared / 10)], ['敵将のスキルを阻止', S.estop || 0]].forEach(function (x) {
      html += '<div class="card"><div class="k">' + x[0] + '</div><div class="v num">' + fmt(x[1]) + '</div></div>';
    });
    html += '</div><h2 class="sec">指揮官</h2><div class="bookgrid">';
    TF.HEROES.forEach(function (hd) {
      var h = st.heroes[hd.id];
      html += '<div class="bookcell' + (h ? '' : ' lock') + '"><div class="portrait">' + (h ? heroSvg(hd.id) : '<span>?</span>') + '</div><div class="nm">' + (h ? hd.name : '???') + '</div><div class="small">' + (h ? hd.title + ' ・ Lv' + h.lv : 'ステージ' + hd.unlock + 'を制圧') + '</div></div>';
    });
    html += '</div><h2 class="sec">敵将</h2><div class="bookgrid">';
    Object.keys(TF.ECMD).forEach(function (k) {
      var c = TF.ECMD[k], seen = st.cleared + 1 >= c.unlock;
      html += '<div class="bookcell enemy' + (seen ? '' : ' lock') + '"><div class="portrait">' + (seen ? ecmdSvg(k) : '<span>?</span>') + '</div><div class="nm">' + (seen ? c.name : '???') + '</div><div class="small">' + (seen ? '〈' + c.skill + '〉' : 'ステージ' + c.unlock + 'から') + '</div></div>';
    });
    html += '</div><h2 class="sec">開発した兵器</h2><div class="small">' + TF.TYPES.map(function (t) {
      return '<b>' + TF.UNIT[t].name + '</b>: ' + TF.ARM_KINDS.map(function (k) { var l = TF.armLv(st, t, k); return l ? TF.armName(t, k, l) : '—'; }).join(' / ');
    }).join('<br>') + '</div>';
    return html;
  }
  function claimFx(el, r) {
    var from = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
    coinFly(from, 'resM', 'i-money', 8); coinFly(from, 'resS', 'i-steel', 5);
    toast('資金+' + fmt(r.m) + ' 鋼材+' + fmt(r.s) + ' 設計図+' + r.bp);
  }
  // 古いセーブで開いたとき(1回だけ): 新しくなった点のお知らせ
  function v2Notice() {
    if (st.flags.v2 || !st.stats.battles) { st.flags.v2 = 1; return false; }
    st.flags.v2 = 1; save();
    var n = TF.medalClaimable(st);
    openModal('<div class="result"><div class="sub" style="color:var(--gold);font-weight:800;letter-spacing:.2em">Ver.2 にようこそ</div><h2 class="win" style="font-size:26px">前線基地、新生</h2>' +
      '<div class="card small" style="line-height:1.8;margin-top:10px">これまでのデータはそのまま使えます。<br>' +
      '・<b>戦闘</b>: 部隊が粘り強くなり、指揮官と敵将のスキルの撃ち合いが見られます<br>・<b>音</b>: 効果音と音楽がつきました(メニューで音量)<br>' +
      '・<b>評価</b>: 被害が少ないほど S・A・B。S評価は初回ボーナス<br>・<b>作戦</b>: 10ステージで1つの作戦。ボスを倒すと制圧報酬<br>' +
      '・<b>任務と勲章</b>: 基地の「司令室」から' + (n ? '。これまでの戦績で、勲章が <b style="color:var(--gold)">' + n + '個</b> 受け取れます' : '') + '</div>' +
      '<div class="btns"><button class="btn wide big" data-act="v2-ok">了解!</button></div></div>');
    return true;
  }
