// 冬将軍(試作): 季節が進む大陸の地図で、補給の線をつなぎながら3つの敵国を落とす陣取り。ルールと自動プレイヤー(Node でも動く。グローバル FY)
var FY = (function () {
  'use strict';
  var W = 7, H = 9, NH = W * H;
  var K = {
    cmds: 3, maxCorps: 5, perSeason: 8, deadline: 96,          // 1手番に命令3つ、軍団は5つまで、8手番で1季節、96手番(3年)が期限
    accrueH: 3, maxStore: 8, firstTurns: 16,                   // 手番は3時間に1つたまる(最大8)。はじめは16
    winterRange: 2, winterAtk: 0.75,                            // 冬: 補給が届く距離が2マス縮む、攻める側の強さ-2割
    starve: 2, isoTurns: 3,                                    // 補給が切れた軍団は毎手番 兵力-2、孤立したマスは3手番で相手のものに
    garBase: 6, garTown: 2, garStr: 2,                         // 守備隊の数(6+町×2)と、空いたマスの守り(2)
    income: 1, incTown: 1, incCap: 3, autumn: 1.5,             // 物資: 1 + 町 + 首都3(秋は1.5倍)
    regen: 1, regenMax: 8,                                     // 補給が8割以上届く軍団は、2手番ごとに兵力+1(8まで。補充すれば10まで)
    costRe: 4, reAmt: 3, costDepot: 8, depotTurns: 3, costRail: 2, costFort: 3, costRaise: 10, raiseStr: 4, maxStr: 10,
    fortMul: 1.3, win: 1.25, draw: 0.85,                       // 陣地は守り1.3倍。強さの比が1.25以上で勝ち、0.85未満で負け
    eIncome: 1.0, eRegen: 1, eMax: 8, ePerNation: 2, capDef: 1.0 // 敵国: 物資の倍率、補給が届く軍団の回復、兵力の上限、軍団の数。首都の守り
  };
  var TYPES = ['inf', 'at', 'tank', 'art'];
  var NAME = { inf: '歩兵', at: '対戦車兵', tank: '戦車', art: '砲兵' };
  // 兵種の相性(攻める側 → 守る側)。前作の三すくみを、大きな地図向けにやわらげたもの
  var AFF = {
    inf: { inf: 1, at: 1.3, tank: 0.8, art: 1.3 },
    at: { inf: 0.9, at: 1, tank: 1.6, art: 0.9 },
    tank: { inf: 1.3, at: 0.7, tank: 1, art: 1.3 },
    art: { inf: 1.2, at: 1.2, tank: 0.8, art: 1 }
  };
  var TERR = { plain: { name: '平地', def: 1 }, forest: { name: '森', def: 1.25 }, mount: { name: '山', def: 1.5 }, river: { name: '川', def: 1.4 } };
  var SEASONS = [
    { name: '春', desc: 'ぬかるみ: 戦車は2マス進めない。川があふれて渡れない' },
    { name: '夏', desc: '攻めどき。特別なことは起きない' },
    { name: '秋', desc: '収穫: 物資が1.5倍。冬じたくの最後の機会' },
    { name: '冬', desc: '補給の届く距離が2マス縮む。攻める側の強さ-2割。川が凍って渡れる(川の守りが消える)' }
  ];
  var NATIONS = [
    { name: '自国' },
    { name: '西の王国', ecmd: 'wall', who: '鉄壁', style: 'hold', color: '#3d5a80' },
    { name: '北の帝国', ecmd: 'thunder', who: '雷帝', style: 'attack', color: '#5b4b6e' },
    { name: '東の連邦', ecmd: 'viper', who: '毒蛇', style: 'cut', color: '#4a6b5d' }
  ];
  var CMDS = ['oni', 'tetsu', 'rai', 'taka', 'hayate'];
  var CMD_NAME = { oni: '鬼塚', tetsu: '鉄崎', rai: '雷門', taka: '白鷹', hayate: '疾風' };

  // ---- 乱数(状態を持つので、途中を保存できる) ----
  function rnd(S) {
    var a = S.rs = (S.rs + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // ---- 六角マス(横の行ごとに半マスずれる。奇数行が右へ) ----
  function idx(c, r) { return r * W + c; }
  var NB = [];
  (function () {
    for (var i = 0; i < NH; i++) {
      var c = i % W, r = (i / W) | 0, d = r & 1 ? [[1, 0], [-1, 0], [0, -1], [1, -1], [0, 1], [1, 1]] : [[1, 0], [-1, 0], [-1, -1], [0, -1], [-1, 1], [0, 1]], a = [];
      d.forEach(function (v) { var cc = c + v[0], rr = r + v[1]; if (cc >= 0 && cc < W && rr >= 0 && rr < H) a.push(idx(cc, rr)); });
      NB.push(a);
    }
  })();
  function adj(a, b) { return NB[a].indexOf(b) >= 0; }
  function cube(i) { var c = i % W, r = (i / W) | 0, x = c - (r - (r & 1)) / 2; return [x, r, -x - r]; }
  function hexDist(a, b) { var p = cube(a), q = cube(b); return Math.max(Math.abs(p[0] - q[0]), Math.abs(p[1] - q[1]), Math.abs(p[2] - q[2])); }

  // ---- 大陸を作る(種の数字から) ----
  var CAPS = [idx(3, 8), idx(1, 2), idx(3, 0), idx(5, 3)];
  function makeMap(S) {
    for (var tries = 0; tries < 30; tries++) {
      var land = [], i, k;
      for (i = 0; i < NH; i++) land.push(true);
      var keep = {};
      CAPS.forEach(function (c) { keep[c] = 1; NB[c].forEach(function (n) { keep[n] = 1; }); });
      // ふちから海を削る(15マスほど)
      var edge = [];
      for (i = 0; i < NH; i++) { var c = i % W, r = (i / W) | 0; if ((c === 0 || c === W - 1 || r === 0 || r === H - 1) && !keep[i]) edge.push(i); }
      var sea = 0, target = 13 + Math.floor(rnd(S) * 4);
      while (sea < target && edge.length) {
        k = Math.floor(rnd(S) * edge.length);
        var e = edge.splice(k, 1)[0];
        if (!land[e]) continue;
        land[e] = false; sea++;
        // ときどき内側へ入り江
        if (rnd(S) < 0.35) NB[e].forEach(function (n) { if (!keep[n] && land[n] && rnd(S) < 0.3 && sea < target) { land[n] = false; sea++; } });
      }
      // 陸がつながっているか(首都から)
      var seen = {}, q = [CAPS[0]]; seen[CAPS[0]] = 1;
      while (q.length) { var x = q.shift(); NB[x].forEach(function (n) { if (land[n] && !seen[n]) { seen[n] = 1; q.push(n); } }); }
      var ok = CAPS.every(function (c) { return seen[c]; });
      for (i = 0; i < NH; i++) if (land[i] && !seen[i]) land[i] = false;
      var nl = land.filter(Boolean).length;
      if (ok && nl >= 44 && nl <= 52) { S.land = land; break; }
    }
    // 国: 首都から広げる(自国6・敵国9ずつ)
    S.own = []; for (i = 0; i < NH; i++) S.own.push(-1);
    var size = [6, 9, 9, 9], fr = [[], [], [], []];
    CAPS.forEach(function (c, s) { S.own[c] = s; fr[s] = NB[c].slice(); });
    for (var round = 0; round < 12; round++) for (var s = 0; s < 4; s++) {
      var have = S.own.filter(function (o) { return o === s; }).length;
      if (have >= size[s]) continue;
      var cand = [];
      for (i = 0; i < NH; i++) if (S.land[i] && S.own[i] === -1 && NB[i].some(function (n) { return S.own[n] === s; })) cand.push(i);
      // 自国は南へ、敵国は北寄りに広がる(遠すぎる所は取らない)
      cand = cand.filter(function (n) { return hexDist(n, CAPS[s]) <= 2; });
      if (!cand.length) continue;
      S.own[cand[Math.floor(rnd(S) * cand.length)]] = s;
    }
    // 地形
    S.terr = []; for (i = 0; i < NH; i++) S.terr.push('plain');
    // 川: 自国と敵国のあいだを横切る(橋が2つ)
    var rr = 5, bridges = [Math.floor(rnd(S) * W)];
    bridges.push((bridges[0] + 2 + Math.floor(rnd(S) * 3)) % W);
    for (c = 0; c < W; c++) {
      i = idx(c, rr);
      if (S.land[i] && S.own[i] === -1 && bridges.indexOf(c) < 0) S.terr[i] = 'river';
      if (rnd(S) < 0.35) rr = rr === 5 ? 4 : 5;
    }
    for (i = 0; i < NH; i++) {
      if (!S.land[i] || S.terr[i] !== 'plain' || CAPS.indexOf(i) >= 0) continue;
      var v = rnd(S);
      if (v < 0.2) S.terr[i] = 'forest'; else if (v < 0.27) S.terr[i] = 'mount';
    }
    // 町: 首都4つ + 各国に1つ + どこの国でもない土地に3つ
    S.town = []; for (i = 0; i < NH; i++) S.town.push(false);
    CAPS.forEach(function (c) { S.town[c] = true; });
    function addTown(f) {
      var cand = [];
      for (var j = 0; j < NH; j++) if (S.land[j] && !S.town[j] && S.terr[j] !== 'mount' && S.terr[j] !== 'river' && f(j) && !NB[j].some(function (n) { return S.town[n]; })) cand.push(j);
      if (cand.length) { var t = cand[Math.floor(rnd(S) * cand.length)]; S.town[t] = true; if (S.terr[t] !== 'plain') S.terr[t] = 'plain'; }
    }
    for (s = 0; s < 4; s++) addTown(function (j) { return S.own[j] === s; });
    for (k = 0; k < 3; k++) addTown(function (j) { return S.own[j] === -1; });
    S.rail = []; S.depot = []; S.fort = []; S.iso = [];
    for (i = 0; i < NH; i++) { S.rail.push(false); S.depot.push(0); S.fort.push(false); S.iso.push(0); }
    S.rail[CAPS[0]] = true;
  }

  // ---- 新しい戦役 ----
  function create(o) {
    o = o || {};
    var S = { v: 1, seed: o.seed || 1, rs: ((o.seed || 1) * 2654435761) >>> 0, turn: 0, done: false, winner: -1, why: '',
      units: [], nid: 1, money: [10, 6, 6, 6], alive: [true, true, true, true], orders: [], ops: { air: true, recon: true, lift: true },
      intents: [], recon: false, obj: null, objOpts: null, objDone: [], log: [], ev: [], seasonStart: true,
      store: K.firstTurns, trial: o.trial !== false, lastT: o.now || 0,
      st: { pockets: 0, pocketsLost: 0, starved: 0, attacks: [[0, 0], [0, 0], [0, 0], [0, 0]], hexHist: [], lostHexes: 0, maxShare: 0, at60: null, falls: [] },
      diff: o.diff || 1 };
    makeMap(S);
    // 自国の軍団3つ(指揮官つき)
    var pc = [CAPS[0]].concat(NB[CAPS[0]].filter(function (n) { return S.own[n] === 0; }));
    [['inf', 7, 'oni'], ['tank', 7, 'tetsu'], ['art', 6, 'rai']].forEach(function (d, k) { if (pc[k] !== undefined) addUnit(S, 0, d[0], d[1], pc[k], d[2]); });
    // 敵国の軍団(2つずつ)
    for (var n = 1; n <= 3; n++) {
      var cells = [CAPS[n]].concat(NB[CAPS[n]].filter(function (x) { return S.own[x] === n; }));
      var types = n === 1 ? ['inf', 'at', 'art'] : n === 2 ? ['tank', 'inf', 'tank'] : ['at', 'tank', 'inf'];
      for (var k = 0; k < K.ePerNation && k < cells.length; k++) addUnit(S, n, types[k], Math.round(5 * S.diff), cells[k]);
    }
    newSeason(S);
    return S;
  }
  function addUnit(S, s, type, str, at, cmd) {
    var u = { id: S.nid++, s: s, type: type, str: str, at: at, cmd: cmd || null, lift: 0 };
    S.units.push(u);
    return u;
  }
  function unitAt(S, i) { for (var k = 0; k < S.units.length; k++) if (S.units[k].at === i) return S.units[k]; return null; }
  function unitsOf(S, s) { return S.units.filter(function (u) { return u.s === s; }); }
  function season(S) { return (1 + Math.floor(S.turn / K.perSeason)) % 4; }
  function year(S) { return 1 + Math.floor((S.turn + K.perSeason) / (K.perSeason * 4)); }
  function winter(S) { return season(S) === 3; }
  function toWinter(S) { var t = S.turn % (K.perSeason * 4), w = K.perSeason * 2; return t <= w ? w - t : K.perSeason * 4 - t + w; }
  function passable(S, i) { if (!S.land[i]) return false; if (S.terr[i] === 'river' && season(S) === 0) return false; return true; }
  function terrDef(S, i) {
    var t = S.terr[i];
    if (t === 'river' && winter(S)) t = 'plain';
    return TERR[t].def * (S.town[i] ? 1.15 : 1) * (S.fort[i] ? K.fortMul : 1) * (CAPS.indexOf(i) > 0 ? K.capDef : 1);
  }
  // ---- 補給: 首都と補給基地から、自分のマスをたどった距離(鉄道どうしは半分) ----
  function supplyMap(S, s) {
    var d = [], par = [], i, src = [];
    for (i = 0; i < NH; i++) { d.push(Infinity); par.push(-1); }
    if (S.own[CAPS[s]] === s) src.push(CAPS[s]);
    for (i = 0; i < NH; i++) if (S.own[i] === s && S.depot[i] === -1 && src.indexOf(i) < 0) src.push(i);
    var q = [];
    src.forEach(function (x) { d[x] = 0; q.push(x); });
    while (q.length) {
      var bi = 0;
      for (var k = 1; k < q.length; k++) if (d[q[k]] < d[q[bi]]) bi = k;
      var x = q.splice(bi, 1)[0];
      NB[x].forEach(function (n) {
        if (S.own[n] !== s) return;
        var w = S.rail[x] && S.rail[n] && s === 0 ? 0.5 : 1;
        if (d[x] + w < d[n]) { d[n] = d[x] + w; par[n] = x; q.push(n); }
      });
    }
    return { d: d, par: par };
  }
  function factorOf(S, dist) {
    if (dist === Infinity) return 0;
    var dd = Math.ceil(dist - 1e-9) + (winter(S) ? K.winterRange : 0);
    return dd <= 2 ? 1 : dd === 3 ? 0.8 : dd === 4 ? 0.6 : dd === 5 ? 0.4 : 0.2;
  }
  // 前線(敵ととなり合う自分のマス)と守備隊
  function towns(S, s) { var n = 0; for (var i = 0; i < NH; i++) if (S.own[i] === s && S.town[i]) n++; return n; }
  function front(S, s) {
    var n = 0;
    for (var i = 0; i < NH; i++) if (S.own[i] === s && NB[i].some(function (x) { return S.own[x] >= 0 && S.own[x] !== s && (s === 0 || S.own[x] === 0); })) n++;
    return n;
  }
  function garrison(S, s) { return (s === 0 ? K.garBase : 4) + K.garTown * towns(S, s); }
  function garStr(S, s) { var f = front(S, s); return K.garStr * Math.min(1, garrison(S, s) / Math.max(1, f)); }
  function hexes(S, s) { var n = 0; for (var i = 0; i < NH; i++) if (S.own[i] === s) n++; return n; }
  function landCount(S) { var n = 0; for (var i = 0; i < NH; i++) if (S.land[i]) n++; return n; }
  function income(S, s) {
    var m = K.income + K.incTown * towns(S, s) + (S.own[CAPS[s]] === s ? K.incCap - K.incTown : 0);
    if (season(S) === 2) m *= K.autumn;
    if (s > 0) m *= K.eIncome;
    return Math.round(m);
  }

  // ---- 戦いの見こみ ----
  function attackPower(S, u, sm) { var f = factorOf(S, (sm || supplyMap(S, u.s)).d[u.at]); return u.str * f * (winter(S) ? K.winterAtk : 1) * (u.cmd ? 1.1 : 1); }
  function defense(S, i, smDef) {
    var d = unitAt(S, i), o = S.own[i];
    if (d) return { unit: d, pow: d.str * terrDef(S, i) * Math.max(0.4, factorOf(S, (smDef || supplyMap(S, d.s)).d[i])) * (d.cmd ? 1.1 : 1) };
    if (o === -1) return { unit: null, pow: 1 * terrDef(S, i) };
    return { unit: null, pow: (garStr(S, o) + (S.town[i] ? 1 : 0)) * terrDef(S, i) };
  }
  function odds(S, u, to, sm, smDef) {
    var df = defense(S, to, smDef), a = attackPower(S, u, sm) * (df.unit ? AFF[u.type][df.unit.type] : 1);
    return { r: a / Math.max(0.01, df.pow), def: df };
  }
  function label(r) { return r >= K.win ? '優勢' : r >= K.draw ? '互角' : '不利'; }

  // ---- 動ける先 ----
  // 戦車は春以外、平地を2マス。鉄道の上にいれば、つながった自分の鉄道の上を3マスまで
  function moves(S, u) {
    var out = {}, s = u.s, sp = season(S);
    function enter(i) { return passable(S, i) && !(unitAt(S, i) && unitAt(S, i).s === s); }
    NB[u.at].forEach(function (n) { if (enter(n)) out[n] = 1; });
    if (u.type === 'tank' && sp !== 0) NB[u.at].forEach(function (n) {
      if (S.own[n] !== s || unitAt(S, n) || S.terr[n] !== 'plain' || !passable(S, n)) return;
      NB[n].forEach(function (m) { if (m !== u.at && enter(m) && S.terr[m] !== 'mount') out[m] = out[m] || 2; });
    });
    if (s === 0 && S.rail[u.at]) {
      var seen = {}, q = [[u.at, 0]]; seen[u.at] = 1;
      while (q.length) {
        var x = q.shift();
        if (x[1] >= 3) continue;
        NB[x[0]].forEach(function (n) { if (!seen[n] && S.rail[n] && S.own[n] === s && !unitAt(S, n)) { seen[n] = 1; out[n] = out[n] || 3; q.push([n, x[1] + 1]); } });
      }
    }
    return out;
  }

  // ---- 命令 ----
  function ordersOf(S) { return S.orders; }
  function pendingCost(S) { var c = 0; S.orders.forEach(function (o) { c += o.cost || 0; }); return c; }
  function canOrder(S) { return !S.done && S.orders.length < K.cmds && (S.trial || S.store > 0); }
  function addOrder(S, o) {
    if (!canOrder(S)) return 'full';
    if (o.cost && S.money[0] - pendingCost(S) < o.cost) return 'money';
    if (o.unit && S.orders.some(function (x) { return x.unit === o.unit; })) return 'busy';
    S.orders.push(o);
    return 'ok';
  }
  function cancelOrder(S, k) { S.orders.splice(k, 1); }

  // ---- 実行 ----
  function log(S, s, msg, k, at) { S.log.push({ t: S.turn, s: s, msg: msg }); S.ev.push({ k: k || 'log', s: s, msg: msg, at: at, t: S.turn }); }
  function capture(S, s, i) {
    var prev = S.own[i];
    if (prev === 0 && s !== 0) S.st.lostHexes++;
    S.own[i] = s; S.iso[i] = 0; S.fort[i] = false;
    if (S.depot[i]) S.depot[i] = 0;
    if (s !== 0) S.rail[i] = false;
    S.ev.push({ k: 'flip', at: i, s: s, from: prev, t: S.turn });
  }
  function retreatHex(S, d, from) {
    var best = -1, bs = -1e9, sm = supplyMap(S, d.s);
    NB[d.at].forEach(function (n) {
      if (S.own[n] !== d.s || unitAt(S, n) || !passable(S, n)) return;
      var sc = -sm.d[n] + hexDist(n, from) * 0.5;
      if (sc > bs) { bs = sc; best = n; }
    });
    return best;
  }
  function kill(S, u, why) {
    S.units.splice(S.units.indexOf(u), 1);
    S.ev.push({ k: 'die', at: u.at, s: u.s, why: why, id: u.id, t: S.turn });
    if (why === 'pocket' || why === 'starve') { if (u.s === 0) S.st.pocketsLost++; else S.st.pockets++; }
  }
  function moveOrAttack(S, u, to) {
    if (S.units.indexOf(u) < 0) return;
    var mv = moves(S, u);
    if (!mv[to]) return;
    var o = S.own[to], d = unitAt(S, to), s = u.s;
    if (d && d.s === s) return;
    if (o === s && !d) { S.ev.push({ k: 'move', id: u.id, from: u.at, to: to, s: s, t: S.turn }); u.at = to; return; }
    if (o === -1 && !d) { S.ev.push({ k: 'move', id: u.id, from: u.at, to: to, s: s, t: S.turn }); u.at = to; capture(S, s, to); return; }
    // 戦い(敵の軍団か、敵の守備隊)
    if (mv[to] > 1) { // 2マス進んでから攻める戦車は、手前のマスまで進んでから
      var mid = NB[to].filter(function (n) { return adj(n, u.at) && S.own[n] === s && !unitAt(S, n); })[0];
      if (mid === undefined) return;
      u.at = mid;
    }
    var sm = supplyMap(S, s);
    if (factorOf(S, sm.d[u.at]) === 0) { log(S, s, '補給が切れていて攻撃できない', 'log', u.at); return; }
    var od = odds(S, u, to, sm), r = od.r * (0.9 + rnd(S) * 0.2), win = r >= K.win;
    var ss = season(S);
    S.st.attacks[ss][0]++; if (win) S.st.attacks[ss][1]++;
    S.ev.push({ k: 'fight', id: u.id, from: u.at, to: to, s: s, r: r, res: win ? 'win' : r >= K.draw ? 'draw' : 'lose', t: S.turn });
    if (d) {
      if (win) {
        d.str -= Math.max(2, Math.ceil(1.5 + (r - 1) * 3));
        if (r < 1.6) u.str -= 1;
        if (d.str <= 0) { kill(S, d, 'battle'); log(S, s, (s === 0 ? '敵の軍団を撃破' : '自軍の軍団が撃破された'), 'battle', to); }
        else {
          var back = retreatHex(S, d, u.at);
          if (back < 0) { kill(S, d, 'pocket'); log(S, s, s === 0 ? '退路のない敵の軍団を包囲殲滅!' : '退路を断たれ、軍団が全滅…', 'pocket', to); }
          else { S.ev.push({ k: 'move', id: d.id, from: d.at, to: back, s: d.s, t: S.turn }); d.at = back; }
        }
        if (u.str > 0) { S.ev.push({ k: 'move', id: u.id, from: u.at, to: to, s: s, t: S.turn }); u.at = to; capture(S, s, to); }
      } else if (r >= K.draw) { d.str -= 1; u.str -= r < 1 ? 2 : 1; }
      else { u.str -= 2; if (r > 0.7) d.str -= 1; }
      if (d.str <= 0 && S.units.indexOf(d) >= 0) kill(S, d, 'battle');
    } else {
      if (r >= 1) { if (r < 1.3) u.str -= 1; S.ev.push({ k: 'move', id: u.id, from: u.at, to: to, s: s, t: S.turn }); u.at = to; capture(S, s, to); }
      else u.str -= 1;
    }
    if (u.str <= 0 && S.units.indexOf(u) >= 0) kill(S, u, 'battle');
  }
  function exec(S, s, o) {
    var u = o.unit ? S.units.filter(function (x) { return x.id === o.unit; })[0] : null;
    if (o.k === 'move') { if (u) moveOrAttack(S, u, o.to); return; }
    if (o.k === 're') { if (u && S.money[s] >= K.costRe) { S.money[s] -= K.costRe; u.str = Math.min(K.maxStr, u.str + K.reAmt); S.ev.push({ k: 're', at: u.at, s: s, t: S.turn }); } return; }
    if (o.k === 'raise') { if (S.money[s] >= K.costRaise && !unitAt(S, CAPS[s]) && unitsOf(S, s).length < K.maxCorps) { S.money[s] -= K.costRaise; var cm = CMDS.filter(function (c) { return !S.units.some(function (x) { return x.cmd === c; }); })[0]; addUnit(S, s, o.type || 'inf', K.raiseStr, CAPS[s], s === 0 ? cm : null); S.ev.push({ k: 'raise', at: CAPS[s], s: s, t: S.turn }); } return; }
    if (o.k === 'rail') { if (S.own[o.at] === s && S.money[s] >= K.costRail && NB[o.at].some(function (n) { return S.rail[n]; })) { S.money[s] -= K.costRail; S.rail[o.at] = true; S.ev.push({ k: 'rail', at: o.at, s: s, t: S.turn }); } return; }
    if (o.k === 'depot') { if (S.own[o.at] === s && S.money[s] >= K.costDepot && !S.depot[o.at]) { S.money[s] -= K.costDepot; S.depot[o.at] = K.depotTurns; S.ev.push({ k: 'depot', at: o.at, s: s, t: S.turn }); } return; }
    if (o.k === 'fort') { if (S.own[o.at] === s && S.money[s] >= K.costFort) { S.money[s] -= K.costFort; S.fort[o.at] = true; S.ev.push({ k: 'fort', at: o.at, s: s, t: S.turn }); } return; }
    if (o.k === 'air') {
      if (!S.ops.air) return; S.ops.air = false;
      var t = unitAt(S, o.at);
      if (t && t.s !== s) { t.str -= 2; S.ev.push({ k: 'air', at: o.at, s: s, t: S.turn }); if (t.str <= 0) kill(S, t, 'battle'); }
      else if (S.depot[o.at] === -1) { S.depot[o.at] = 2; S.ev.push({ k: 'air', at: o.at, s: s, t: S.turn }); }
      return;
    }
    if (o.k === 'recon') { if (S.ops.recon) { S.ops.recon = false; S.recon = true; S.intents.forEach(function (x) { x.shown = x.target; x.cert = '高'; }); } return; }
    if (o.k === 'lift') { if (S.ops.lift && u) { S.ops.lift = false; u.lift = 2; S.ev.push({ k: 'lift', at: u.at, s: s, t: S.turn }); } return; }
  }

  // ---- 手番を進める ----
  function advance(S) {
    if (S.done || (!S.trial && S.store <= 0)) return false;
    S.ev = [];
    var plans = enemyPlans(S);
    var mine = S.orders.slice(); S.orders = [];
    mine.forEach(function (o) { exec(S, 0, o); });
    plans.forEach(function (o) { exec(S, o.s, o); });
    upkeep(S);
    if (!S.trial) S.store--;
    return true;
  }
  function upkeep(S) {
    var i, s;
    // 首都が落ちた国は崩れる
    for (s = 1; s <= 3; s++) if (S.alive[s] && S.own[CAPS[s]] !== s) {
      S.alive[s] = false;
      for (i = 0; i < NH; i++) if (S.own[i] === s) capture(S, S.own[CAPS[s]] === 0 ? 0 : -1, i);
      unitsOf(S, s).forEach(function (u) { kill(S, u, 'fall'); });
      S.st.falls.push(S.turn);
      log(S, 0, NATIONS[s].name + 'が崩れた!(首都を落とした)', 'fall', CAPS[s]);
    }
    if (S.own[CAPS[0]] !== 0) { finish(S, 1, 'capital'); return; }
    // 補給が切れた軍団は弱る
    var sms = [0, 1, 2, 3].map(function (k) { return supplyMap(S, k); });
    S.units.slice().forEach(function (u) {
      if (S.own[u.at] !== u.s) return;
      if (sms[u.s].d[u.at] !== Infinity) return;
      if (u.lift > 0) { u.lift--; return; }
      u.str -= K.starve;
      if (u.str <= 0) { kill(S, u, 'starve'); log(S, u.s, u.s === 0 ? '補給が切れた軍団が力尽きた…' : '補給の切れた敵の軍団が力尽きた', 'starve', u.at); }
    });
    // 孤立したマスは、3手番で相手のものに
    for (i = 0; i < NH; i++) {
      var o = S.own[i];
      if (o < 0 || i === CAPS[o]) { S.iso[i] = 0; continue; }
      if (sms[o].d[i] !== Infinity) { S.iso[i] = 0; continue; }
      S.iso[i]++;
      if (S.iso[i] >= K.isoTurns) {
        var cnt = {}, best = -1, bn = 0;
        NB[i].forEach(function (n) { var x = S.own[n]; if (x >= 0 && x !== o && (o === 0 || x === 0)) cnt[x] = (cnt[x] || 0) + 1; });
        Object.keys(cnt).forEach(function (k) { if (cnt[k] > bn) { bn = cnt[k]; best = +k; } });
        if (best < 0) continue;
        var u = unitAt(S, i);
        if (u) { kill(S, u, 'pocket'); log(S, best, best === 0 ? '孤立した敵の軍団が降伏した!' : '孤立した軍団が降伏した…', 'pocket', i); }
        capture(S, best, i);
      }
    }
    // 補給基地の完成
    for (i = 0; i < NH; i++) if (S.depot[i] > 0) { S.depot[i]--; if (S.depot[i] === 0) { S.depot[i] = -1; if (S.own[i] === 0) log(S, 0, '補給基地が完成した', 'depot', i); } }
    // 回復: 補給がよく届く軍団は少しずつ兵力が戻る(両軍とも)
    if (S.turn % 2 === 0) S.units.forEach(function (u) { if (factorOf(S, sms[u.s].d[u.at]) >= 0.8 && u.str < K.regenMax) u.str = Math.min(K.regenMax, u.str + K.regen); });
    // 物資
    for (s = 0; s < 4; s++) if (S.alive[s]) S.money[s] += income(S, s);
    // 敵国: 回復・増強・新しい軍団
    for (s = 1; s <= 3; s++) {
      if (!S.alive[s]) continue;
      var us = unitsOf(S, s).sort(function (a, b) { return a.str - b.str; });
      if (us.length && us[0].str <= 5 && S.money[s] >= K.costRe) { S.money[s] -= K.costRe; us[0].str = Math.min(K.eMax, us[0].str + K.reAmt); }
      if (us.length < K.ePerNation + Math.floor(S.turn / 32) && S.money[s] >= K.costRaise && !unitAt(S, CAPS[s])) { S.money[s] -= K.costRaise; addUnit(S, s, TYPES[Math.floor(rnd(S) * 4)], K.raiseStr + 1, CAPS[s]); }
    }
    for (s = 1; s <= 3; s++) unitsOf(S, s).forEach(function (u) { if (u.lift) u.lift--; });
    // 記録
    var hp = hexes(S, 0), lc = landCount(S);
    S.st.hexHist.push(hp);
    S.st.maxShare = Math.max(S.st.maxShare, hp / lc);
    if (S.st.at60 === null && hp / lc >= 0.6) S.st.at60 = S.turn;
    // 季節の目標
    var before = season(S);
    S.turn++;
    if (S.alive.slice(1).every(function (a) { return !a; })) { finish(S, 0, 'conquest'); return; }
    if (S.turn >= K.deadline) { finish(S, -1, 'deadline'); return; }
    if (season(S) !== before) { endObjective(S); newSeason(S); }
  }
  function finish(S, w, why) { S.done = true; S.winner = w; S.why = why; S.ev.push({ k: 'end', w: w, why: why, t: S.turn }); }
  function score(S) {
    // 評価: 勝ちなら早いほど高い。期限切れは持っているマスの割合
    if (S.winner === 0) return S.turn <= 56 ? 'S' : S.turn <= 72 ? 'A' : 'B';
    return S.winner === 1 ? '-' : hexes(S, 0) / landCount(S) >= 0.5 ? 'B' : 'C';
  }

  // ---- 季節のはじめ: 作戦行動の回数・敵のねらい・作戦目標 ----
  var OBJS = {
    town: { name: '町を1つ取る', test: function (S, b) { return towns(S, 0) > b.towns; } },
    front: { name: '前線を守備隊以下にして季節を終える', test: function (S) { return front(S, 0) <= garrison(S, 0); } },
    depot: { name: '補給基地を1つ完成させる', test: function (S, b) { var n = 0; for (var i = 0; i < NH; i++) if (S.depot[i] === -1 && S.own[i] === 0) n++; return n > b.depots; } },
    pocket: { name: '敵の軍団を1つ包囲殲滅する', test: function (S, b) { return S.st.pockets > b.pockets; } },
    hold: { name: 'マスを1つも失わずに季節を終える', test: function (S, b) { return hexes(S, 0) >= b.hexes && S.st.lostHexes === b.lost; } }
  };
  function newSeason(S) {
    S.ops = { air: true, recon: true, lift: true };
    S.recon = false;
    S.intents = [];
    for (var n = 1; n <= 3; n++) {
      if (!S.alive[n]) continue;
      var st = NATIONS[n].style, t = intentTarget(S, n);
      var cert = rnd(S) < 0.5 ? '中' : '低', truth = rnd(S) < (cert === '中' ? 0.8 : 0.55);
      var shown = truth ? t : decoy(S, n, t);
      S.intents.push({ n: n, target: t, shown: shown, cert: cert, kind: st });
      S.intent = S.intent || {}; S.intent[n] = t;
    }
    var keys = Object.keys(OBJS), opts = [];
    while (opts.length < 3) { var k = keys[Math.floor(rnd(S) * keys.length)]; if (opts.indexOf(k) < 0) opts.push(k); }
    S.objOpts = opts; S.obj = null; S.seasonStart = true;
  }
  function chooseObjective(S, k) {
    var depots = 0; for (var i = 0; i < NH; i++) if (S.depot[i] === -1 && S.own[i] === 0) depots++;
    S.obj = { k: k, base: { towns: towns(S, 0), depots: depots, pockets: S.st.pockets, hexes: hexes(S, 0), lost: S.st.lostHexes } };
    S.seasonStart = false;
  }
  function endObjective(S) {
    if (!S.obj) return;
    var ok = OBJS[S.obj.k].test(S, S.obj.base);
    S.objDone.push({ k: S.obj.k, ok: ok, season: season(S) });
    if (ok) { S.money[0] += 8; log(S, 0, '作戦目標「' + OBJS[S.obj.k].name + '」達成: 物資+8', 'obj'); }
    S.obj = null;
  }
  // 敵のねらい: 性格に合わせて、自国のマス(町・首都・前線の弱い所)を選ぶ
  function intentTarget(S, n) {
    var best = CAPS[0], bs = -1e9, sm = supplyMap(S, 0);
    for (var i = 0; i < NH; i++) {
      if (S.own[i] !== 0) continue;
      var d = Math.min.apply(null, [CAPS[n]].concat(NB[CAPS[n]]).map(function (x) { return hexDist(x, i); }));
      var sc = -d * 2 + (S.town[i] ? 4 : 0) + (i === CAPS[0] ? 3 : 0);
      if (NATIONS[n].style === 'cut') sc += Math.min(6, sm.d[i] === Infinity ? 6 : sm.d[i]) * 1.5;
      if (NATIONS[n].style === 'attack') sc += unitAt(S, i) ? 0 : 2;
      if (sc > bs) { bs = sc; best = i; }
    }
    return best;
  }
  function decoy(S, n, t) {
    var c = []; for (var i = 0; i < NH; i++) if (S.own[i] === 0 && i !== t) c.push(i);
    return c.length ? c[Math.floor(rnd(S) * c.length)] : t;
  }
  function intentText(S, it) {
    var where = place(S, it.shown);
    var verb = it.kind === 'hold' ? 'は守りを固め、' + where + 'をうかがう' : it.kind === 'cut' ? 'は補給線を狙い、' + where + 'へ回りこむ' : 'は' + where + 'へ攻め寄せる';
    return NATIONS[it.n].who + verb;
  }
  function place(S, i) {
    var c = i % W, r = (i / W) | 0;
    var dir = (r <= 2 ? '北' : r >= 6 ? '南' : '中央') + (c <= 1 ? '西' : c >= 5 ? '東' : '');
    if (i === CAPS[0]) return '首都';
    return dir + 'の' + (S.town[i] ? '町' : TERR[S.terr[i]].name);
  }

  // ---- 敵の頭 ----
  // 自分の手番の命令を出す前の地図を見て、それぞれの軍団の行き先を決める(同時に動く)
  function cutValue(S, s, i) {
    // マス i を取られたら、補給が切れる s のマスの数
    var o = S.own[i]; if (o !== s) return 0;
    S.own[i] = -2;
    var sm = supplyMap(S, s), n = 0;
    for (var k = 0; k < NH; k++) if (S.own[k] === s && sm.d[k] === Infinity) n++;
    S.own[i] = o;
    return n;
  }
  function enemyPlans(S) {
    var plans = [], taken = {};
    var sm0 = supplyMap(S, 0);
    for (var n = 1; n <= 3; n++) {
      if (!S.alive[n]) continue;
      var sm = supplyMap(S, n), st = NATIONS[n].style, tgt = (S.intent && S.intent[n]) || CAPS[0];
      unitsOf(S, n).sort(function (a, b) { return b.str - a.str; }).forEach(function (u) {
        var mv = moves(S, u), best = null, bs = st === 'hold' ? 1 : 0;
        var unsup = sm.d[u.at] === Infinity;
        // 首都が危ないときは戻る
        var capThreat = NB[CAPS[n]].some(function (x) { var y = unitAt(S, x); return y && y.s === 0; });
        Object.keys(mv).forEach(function (k) {
          var to = +k, o = S.own[to], d = unitAt(S, to), sc;
          if (taken[to]) return;
          if (o === n && !d) {
            sc = (hexDist(u.at, tgt) - hexDist(to, tgt)) * 1.2;
            if (unsup) sc += (sm.d[to] !== Infinity ? 8 : 0);
            if (capThreat) sc += (hexDist(u.at, CAPS[n]) - hexDist(to, CAPS[n])) * 4;
            if (st === 'hold') sc += (S.terr[to] === 'river' || S.terr[to] === 'forest' ? 1 : 0) - 0.5;
          } else if (o === -1 && !d) {
            sc = 2.5 + (S.town[to] ? 5 : 0) + (hexDist(u.at, tgt) - hexDist(to, tgt)) * 1.5;
          } else if (o === 0 || (d && d.s === 0)) {
            if (unsup) return;
            var od = odds(S, u, to, sm, sm0), r = od.r;
            var need = st === 'attack' ? 1.05 : st === 'hold' ? 1.4 : 1.2;
            if (r < need) return;
            sc = 6 + (r - 1) * 6 + (S.town[to] ? 6 : 0) + (to === CAPS[0] ? 40 : 0) + cutValue(S, 0, to) * (st === 'cut' ? 3 : 1.2) + (hexDist(u.at, tgt) - hexDist(to, tgt)) * 2;
            if (od.def.unit && retreatHex(S, od.def.unit, u.at) < 0) sc += 8;
          } else return;
          if (sc > bs) { bs = sc; best = to; }
        });
        if (best !== null) { taken[best] = 1; plans.push({ k: 'move', unit: u.id, to: best, s: n }); }
      });
    }
    // 攻める順: 強い国から交互に
    return plans;
  }

  // ---- 自動プレイヤー(計測用) ----
  // none: 何もしない / forward: とにかく前へ / defend: ひたすら守る / smart: 補給を考える
  function nearestEnemyCap(S, i) { var b = -1, bd = 99; for (var n = 1; n <= 3; n++) if (S.alive[n]) { var d = hexDist(i, CAPS[n]); if (d < bd) { bd = d; b = n; } } return b; }
  function pathStep(S, from, to, s) {
    // 陸の上を to へ向かう最短の次の1マス(自分の軍団がいるマスは通れない)
    var prev = {}, q = [from]; prev[from] = -1;
    while (q.length) {
      var x = q.shift(); if (x === to) break;
      NB[x].forEach(function (n) { if (prev[n] === undefined && S.land[n] && !(unitAt(S, n) && unitAt(S, n).s === s && n !== to)) { prev[n] = x; q.push(n); } });
    }
    if (prev[to] === undefined) return -1;
    var c = to; while (prev[c] !== from && prev[c] !== -1) c = prev[c];
    return c;
  }
  function playerAI(S, kind) {
    if (S.seasonStart) chooseObjective(S, S.objOpts[0]);
    if (kind === 'none') return;
    var us = unitsOf(S, 0).sort(function (a, b) { return b.str - a.str; }), sm = supplyMap(S, 0);
    if (kind === 'forward') {
      us.slice(0, K.cmds).forEach(function (u) {
        var n = nearestEnemyCap(S, u.at); if (n < 0) return;
        var st = pathStep(S, u.at, CAPS[n], 0), mv = moves(S, u);
        if (st >= 0 && mv[st]) addOrder(S, { k: 'move', unit: u.id, to: st });
      });
      return;
    }
    if (kind === 'defend') {
      us.forEach(function (u) { if (S.orders.length < K.cmds && u.str <= 7 && S.money[0] - pendingCost(S) >= K.costRe) addOrder(S, { k: 're', unit: u.id, cost: K.costRe }); });
      us.forEach(function (u) { if (S.orders.length < K.cmds && !S.fort[u.at] && S.money[0] - pendingCost(S) >= K.costFort) addOrder(S, { k: 'fort', at: u.at, cost: K.costFort }); });
      return;
    }
    // smart: 候補に点数をつけて、良い順に3つ
    var cands = [], i;
    var eSm = [null, supplyMap(S, 1), supplyMap(S, 2), supplyMap(S, 3)];
    var capThreat = NB[CAPS[0]].some(function (x) { var y = unitAt(S, x); return y && y.s > 0; });
    var F = front(S, 0), G = garrison(S, 0);
    us.forEach(function (u) {
      var mv = moves(S, u), f = factorOf(S, sm.d[u.at]);
      Object.keys(mv).forEach(function (k) {
        var to = +k, o = S.own[to], d = unitAt(S, to), v = null;
        var en = nearestEnemyCap(S, to), prog = en > 0 ? (hexDist(u.at, CAPS[en]) - hexDist(to, CAPS[en])) : 0;
        if (o === 0 && !d) {
          // 首都の守り・補給の届く所へ戻る
          v = (capThreat ? (hexDist(u.at, CAPS[0]) - hexDist(to, CAPS[0])) * 6 : 0) + (f < 0.6 ? (factorOf(S, sm.d[to]) - f) * 8 : 0) + prog * 0.6;
          if (v <= 0.5) v = null;
        } else if (o === -1 && !d) {
          v = 3 + (S.town[to] ? 6 : 0) + prog * 1.5 - (F + 1 > G ? 1.5 : 0) - (winter(S) ? 1 : 0);
          if (f < 0.4) v -= 4;
        } else if (o > 0 || (d && d.s > 0)) {
          if (f === 0) return;
          var own = o > 0 ? o : d.s, od = odds(S, u, to, sm, eSm[own]), need = winter(S) ? 1.45 : 1.3;
          if (od.r < need) return;
          v = 6 + Math.min(4, (od.r - 1) * 5) + (to === CAPS[own] ? 80 : 0) + (S.town[to] ? 6 : 0) + cutValue(S, own, to) * 4 + prog * 2;
          if (od.def.unit && retreatHex(S, od.def.unit, u.at) < 0) v += 12;
          if (f < 0.6 && to !== CAPS[own]) v -= 4;
          if (F + 1 > G * 1.3 && to !== CAPS[own]) v -= 3;
        }
        if (v !== null) cands.push({ v: v, o: { k: 'move', unit: u.id, to: to } });
      });
      // 補充
      if (u.str <= 6 && f >= 0.6) cands.push({ v: (8 - u.str) * 1.3 + (NB[u.at].some(function (x) { return S.own[x] > 0; }) ? 2 : 0), o: { k: 're', unit: u.id, cost: K.costRe } });
      // 空輸
      if (f === 0 && S.ops.lift) cands.push({ v: 9, o: { k: 'lift', unit: u.id } });
    });
    // 鉄道: いちばん補給の遠い軍団へ向かってのばす
    var far = null; us.forEach(function (u) { if (sm.d[u.at] !== Infinity && (!far || sm.d[u.at] > sm.d[far.at])) far = u; });
    if (far && sm.d[far.at] >= 3) {
      var c = far.at; while (sm.par[c] >= 0 && !S.rail[sm.par[c]]) c = sm.par[c];
      if (!S.rail[c] && NB[c].some(function (n) { return S.rail[n]; })) cands.push({ v: 3 + sm.d[far.at] * 0.8, o: { k: 'rail', at: c, cost: K.costRail } });
    }
    // 補給基地: 前線から1〜2マス後ろ、補給が遠い所
    var building = false; for (i = 0; i < NH; i++) if (S.depot[i] > 0 && S.own[i] === 0) building = true;
    if (!building && far && sm.d[far.at] >= 4) {
      var bd = -1, bv = -1;
      for (i = 0; i < NH; i++) if (S.own[i] === 0 && !S.depot[i] && sm.d[i] !== Infinity && sm.d[i] >= 2) {
        var near = NB[i].some(function (x) { return S.own[x] > 0; }), cover = 0;
        us.forEach(function (u) { if (hexDist(u.at, i) <= 2) cover++; });
        var sc = cover * 2 + sm.d[i] - (near ? 3 : 0);
        if (sc > bv) { bv = sc; bd = i; }
      }
      if (bd >= 0) cands.push({ v: 7, o: { k: 'depot', at: bd, cost: K.costDepot } });
    }
    // 新しい軍団
    if (us.length < K.maxCorps && !unitAt(S, CAPS[0])) cands.push({ v: 5 + (capThreat ? 10 : 0), o: { k: 'raise', type: ['inf', 'tank', 'at', 'art'][us.length % 4], cost: K.costRaise } });
    // 空爆
    if (S.ops.air) S.units.forEach(function (t) { if (t.s > 0 && t.str >= 5 && NB[t.at].some(function (x) { var y = unitAt(S, x); return y && y.s === 0; })) cands.push({ v: 2.5, o: { k: 'air', at: t.at } }); });
    cands.sort(function (a, b) { return b.v - a.v; });
    var used = {};
    cands.forEach(function (c) {
      if (S.orders.length >= K.cmds) return;
      if (c.o.unit && used[c.o.unit]) return;
      if (c.o.k === 'move' && used['to' + c.o.to]) return;
      if (addOrder(S, c.o) === 'ok') { if (c.o.unit) used[c.o.unit] = 1; if (c.o.k === 'move') used['to' + c.o.to] = 1; }
    });
  }
  function simulate(o, kind) {
    var S = create(o), guard = 0;
    while (!S.done && guard++ < 200) { playerAI(S, kind); advance(S); }
    return S;
  }

  // ---- 手番がたまる(3時間に1つ、最大8) ----
  function accrue(S, now) {
    if (S.trial) { S.lastT = now; return 0; }
    if (!S.lastT) { S.lastT = now; return 0; }
    var n = Math.floor((now - S.lastT) / (K.accrueH * 3600e3));
    if (n <= 0) return 0;
    var add = Math.min(n, Math.max(0, K.maxStore - S.store));
    S.store += add; S.lastT += n * K.accrueH * 3600e3;
    return add;
  }
  function nextAccrue(S, now) { return S.lastT + K.accrueH * 3600e3 - now; }

  return {
    K: K, W: W, H: H, NH: NH, NB: NB, CAPS: CAPS, TYPES: TYPES, NAME: NAME, AFF: AFF, TERR: TERR, SEASONS: SEASONS, NATIONS: NATIONS, OBJS: OBJS, CMD_NAME: CMD_NAME,
    create: create, advance: advance, addOrder: addOrder, cancelOrder: cancelOrder, canOrder: canOrder, pendingCost: pendingCost, chooseObjective: chooseObjective,
    moves: moves, odds: odds, label: label, supplyMap: supplyMap, factorOf: factorOf, unitAt: unitAt, unitsOf: unitsOf, season: season, year: year, winter: winter, toWinter: toWinter,
    front: front, garrison: garrison, garStr: garStr, towns: towns, hexes: hexes, landCount: landCount, income: income, terrDef: terrDef, passable: passable, adj: adj, hexDist: hexDist,
    intentText: intentText, place: place, score: score, playerAI: playerAI, simulate: simulate, accrue: accrue, nextAccrue: nextAccrue, cutValue: cutValue
  };
})();
if (typeof module !== 'undefined') module.exports = FY;
