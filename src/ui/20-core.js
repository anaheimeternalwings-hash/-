  // ====== テキスト定義 ======
  var BDESC = {
    hq: '基地の中枢。強化すると、ほかの施設のレベル上限と部隊の枠が増える。',
    supply: '資金を自動で生産する。アプリを閉じている間も上限まで貯まり続ける。',
    steel: '鋼材を自動で生産する。アプリを閉じている間も上限まで貯まり続ける。',
    depot: '放置で資源が貯まる上限の時間を延ばす(1レベルごとに+1時間)。',
    barracks: '歩兵を解放・強化する。歩兵は対戦車兵と砲兵に強く、戦車に弱い。',
    atpost: '対戦車兵を解放・強化する。戦車にとても強いが、ほかには弱め。',
    factory: '戦車を解放・強化する。戦車は歩兵と砲兵に強く、対戦車兵に弱い。',
    artpost: '砲兵を解放・強化する。砲兵は歩兵と対戦車兵に強く、戦車に弱い。',
    lab: '研究を重ね、全兵種の能力をまとめて強化する。'
  };
  var SHORT = { inf: '歩兵', at: '対戦車', tank: '戦車', art: '砲兵' };
  var STRONG = { inf: ['at', 'art'], at: ['tank'], tank: ['inf', 'art'], art: ['inf', 'at'] };
  var WEAK = { inf: ['tank'], at: ['inf', 'art', 'at'], tank: ['at'], art: ['tank'] };
  function counters(t) { return TF.TYPES.filter(function (x) { return TF.AFF[x][t] >= 1.5; }); }
  function names(arr) { return arr.map(function (x) { return TF.UNIT[x].name; }).join('・'); }

  // ====== 保存と読み込み ======
  function sanitize(o) {
    var d = TF.newState(now());
    if (!o || typeof o !== 'object' || o.v !== 1) return null;
    var s = {};
    Object.keys(d).forEach(function (k) { s[k] = o[k] !== undefined ? o[k] : d[k]; });
    s.money = +s.money || 0; s.steel = +s.steel || 0;
    if (!s.bld || !s.bld.hq) s.bld = d.bld;
    Object.keys(s.bld).forEach(function (k) {
      if (!TF.BLD[k]) { delete s.bld[k]; return; }
      var b = s.bld[k]; b.lv = Math.max(1, b.lv | 0); b.slot = b.slot | 0;
      if (k === 'supply' || k === 'steel') { b.stored = +b.stored || 0; b.t = +b.t || now(); }
    });
    s.bld.hq.slot = 4;
    if (!s.heroes || !s.heroes.oni) s.heroes = d.heroes;
    Object.keys(s.heroes).forEach(function (k) { if (!TF.HERO[k]) delete s.heroes[k]; });
    s.cleared = Math.max(0, s.cleared | 0);
    s.sel = Math.min(Math.max(1, s.sel | 0), s.cleared + 1);
    s.form = TF.normalizeForm(s, s.form);
    s.stats = s.stats || { battles: 0, wins: 0 };
    if ([1, 2, 4].indexOf(s.speed) < 0) s.speed = 1;
    if (['base', 'army', 'arms', 'sortie'].indexOf(s.tab) < 0) s.tab = 'base';
    s.flags = o.flags || {};
    // 武装(兵器開発)。追加前のデータには、これまでのクリア分の設計図を渡す
    var arms = {};
    TF.TYPES.forEach(function (t) {
      var a = s.arms && s.arms[t];
      if (!a) return;
      arms[t] = {};
      TF.ARM_KINDS.forEach(function (k) { var l = Math.max(0, a[k] | 0); if (l) arms[t][k] = l; });
    });
    s.arms = arms;
    if (o.bp === undefined) {
      var g = 0;
      for (var k = 1; k <= s.cleared; k++) g += TF.stageReward(k).bp;
      s.bp = g;
      if (s.cleared > 0) s.flags.armNew = 1;
    } else s.bp = Math.max(0, +o.bp || 0);
    // 試作部品。追加前のデータには、クリア済みのボス戦の初回分を配る
    var parts = {};
    if (o.parts && typeof o.parts === 'object') Object.keys(o.parts).forEach(function (g) { var n = o.parts[g] | 0; if (+g >= 1 && n > 0) parts[+g] = n; });
    else for (var bs = 10; bs <= s.cleared; bs += 10) parts[TF.partGrade(bs)] = (parts[TF.partGrade(bs)] || 0) + TF.K.partFirst;
    s.parts = parts;
    s.auto = o.auto !== false;
    s.lastSeen = +o.lastSeen || now();
    return s;
  }
  var saveFailed = false;
  function save() {
    if (!st) return;
    st.lastSeen = now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(st)); saveFailed = false; }
    catch (e) { if (!saveFailed) { saveFailed = true; toast('保存できませんでした(プライベートブラウズ等)'); } }
  }
  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) return sanitize(JSON.parse(raw));
    } catch (e) { }
    return null;
  }

  // ====== 画面: 上部 ======
  function renderTop() {
    $('vM').textContent = fmtTop(st.money);
    $('vS').textContent = fmtTop(st.steel);
    $('vStage').textContent = 'ST ' + (st.cleared + 1);
    var anyUp = TF.BLD_ORDER.concat(['hq']).some(function (id) { return TF.lv(st, id) > 0 && TF.canUpgrade(st, id).ok; });
    var info = TF.storedInfo(st, now());
    var full = (info.supply && info.supply.full) || (info.steel && info.steel.full);
    $('dotBase').classList.toggle('on', !!(anyUp || full) && curTab !== 'base');
    $('dotArms').classList.toggle('on', (anyArm() || !!st.flags.armNew) && curTab !== 'arms');
    $('dotItems').classList.toggle('on', !!st.flags.itemNew);
  }

  // ====== 次の目標 ======
  function nextGoal() {
    var L = function (id) { return TF.lv(st, id); };
    if (!L('supply')) return '空き区画をタップして「補給所」を建てよう。資金を自動で生産します。';
    if (st.cleared === 0) return '下の「出撃」からステージ1に挑戦しよう!';
    if (!L('steel')) return '「製鋼所」を建てよう。鋼材を自動で生産します。';
    if (L('barracks') < 3) return '「兵舎」を強化して歩兵を強くしよう。';
    if (L('hq') < 2) return '「司令部」をLv2にすると、部隊の枠が増えて新しい施設が建てられます。';
    if (!L('atpost')) return '「対戦車陣地」を建てよう。対戦車兵は戦車にとても強い!';
    if (!L('factory')) return '「戦車工場」を建てよう。戦車は歩兵と砲兵に強い主力です。';
    if (!L('depot')) return '「倉庫」を建てると、放置で資源が貯まる時間が延びます。';
    if (L('hq') < 3) return '「司令部」をLv3にすると、砲兵陣地と研究所が建てられます。';
    if (!L('artpost')) return '「砲兵陣地」を建てよう。砲兵は歩兵と対戦車兵に強い。';
    if (!L('lab')) return '「研究所」を建てよう。全兵種の強化と、兵器の開発ができるようになります。';
    if (!TF.TYPES.some(function (t) { return TF.ARM_KINDS.some(function (k) { return TF.armLv(st, t, k) > 0; }); })) return '下の「兵器」で武装を開発しよう。設計図は戦闘に勝つと手に入ります。';
    if (TF.slots(st) < 8) return '司令部を強化して部隊の枠を増やそう(現在 ' + TF.slots(st) + '/8)。';
    return '敵の編成を見て相性の良い兵種で挑もう。勝てないときは前のステージで稼いで強化!';
  }

