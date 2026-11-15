// 朱線(試作): 5本の列で前線を押し合う、90秒の陣取り。ルールと自動プレイヤー(Node でも動く。グローバル SH)
var SH = (function () {
  'use strict';
  var L = 5, R = 9; // 列5本 × 段9つ。段0が自分の本陣、段8が敵の本陣(敵から見ると逆)
  var K = {
    time: 90,                                 // 1戦の長さ(秒)
    arrive: 2.3, townCut: 0.15, minArrive: 1.4, // 部隊が届く間隔。町1つで0.15秒縮む
    qMax: 4, laneMax: 3,                      // 待機は4つまで、1列に3部隊まで(先頭+控え2)
    run: 1.2, push: 0.6, river: 0.5,         // 走る速さ(段/秒)。自分の陣地の外へ押し出すときは遅い。川は半分
    hp: 100, dps: 10, aff: 1.5, hill: 0.7,    // 体力・1秒の被害・相性の倍率・丘で守る側の被害
    engage: 0.9, gap: 0.55,                   // 撃ち合う距離、控えの間隔
    over: 2, flank1: 1.5, flank2: 2.0, chip: 4, collapse: 4, // 出すぎ: 隣より2段以上前に出ると、列の全員が横からも撃たれる。4段以上で全滅すると総崩れ
    home: 0.7, homeStep: 0.075,               // 地の利: 自分の本陣に近いほど被害が少ない(0.7 + 0.075×段)
    retreatT: 3, retreatCd: 8, retreatMul: 0.5, ambush: 1.5, // 後退: 3秒その場で構え(待ち伏せ)、被害半分・与える被害1.5倍。同じ列は8秒に1回
    breachT: 4, hqDps: 10,                    // 敵の本陣に4秒とどまれば突破勝ち。本陣とその手前の段では、本陣の守りに撃たれる
    skillDur: 5, barrage: 50                  // 指揮官の技
  };
  var TYPES = ['inf', 'at', 'tank'];
  var NAME = { inf: '歩兵', at: '対戦車兵', tank: '戦車' };
  var SHORT = { inf: '歩', at: '対', tank: '戦' };
  var BEAT = { inf: 'at', at: 'tank', tank: 'inf' }; // 歩兵→対戦車兵→戦車→歩兵
  function aff(a, d) { return BEAT[a] === d ? K.aff : BEAT[d] === a ? 1 / K.aff : 1; }
  var SKILLS = {
    barrage: { name: '一斉砲撃', desc: '選んだ列の敵すべてに' + K.barrage + 'の被害', lane: true },
    rush:    { name: '急行',     desc: K.skillDur + '秒間、送った部隊がすぐ前線に着く' },
    hold:    { name: '死守',     desc: K.skillDur + '秒間、全列の被害が半分' }
  };
  // 乱数(状態は S.rs に持つので、戦闘の途中を保存できる)
  function rnd(S) {
    var a = S.rs = (S.rs + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15; return n >>> 0; }

  // ---- 戦場(地形)。両軍に公平になるよう、点対称に置く ----
  // terr[l][r]: 0 平地 / 1 町 / 2 丘 / 3 川。r は自分の本陣から数えた段
  function makeField(seed, kind) {
    var S = { rs: hash(seed * 7919 + 13) }, t = [], l, r;
    for (l = 0; l < L; l++) { t.push([]); for (r = 0; r < R; r++) t[l].push(0); }
    function put(l0, r0, v) { t[l0][r0] = v; t[L - 1 - l0][R - 1 - r0] = v; }
    // 町: 真ん中の段に1つと、点対称の2つ
    var cl = Math.floor(rnd(S) * L);
    t[2][4] = 1;
    var tl = cl === 2 ? 0 : cl;
    put(tl, 3, 1);
    // 丘・川
    var nh = kind === 'hills' ? 3 : 1 + Math.floor(rnd(S) * 2);
    for (var i = 0; i < nh; i++) { l = Math.floor(rnd(S) * L); r = 2 + Math.floor(rnd(S) * 2); if (!t[l][r]) put(l, r, 2); }
    var nr = kind === 'river' ? 2 : rnd(S) < 0.4 ? 1 : 0;
    for (i = 0; i < nr; i++) { l = Math.floor(rnd(S) * L); if (!t[l][3]) put(l, 3, 3); }
    return t;
  }

  // ---- 戦闘 ----
  // o = { seed, comp: [自分の編成10, 敵の編成10], field, skill: [自分の技, 敵の技], eRate(敵の届く間隔の倍率), eHp, ai: [null か自動プレイヤーの種類, 敵の種類], style(敵の性格) }
  function create(o) {
    var S = {
      t: 0, done: false, winner: -1, why: '', rs: (o.seed >>> 0) || 1,
      field: o.field || makeField(o.seed || 1),
      h: [[3, 3, 3, 3, 3], [3, 3, 3, 3, 3]],   // 両軍の陣地の高さ(本陣から何段ぶん持っているか)
      units: [], nid: 1, q: [[], []], bag: [[], []], comp: [o.comp[0].slice(), o.comp[1].slice()],
      nextT: [0.4, 0.4], rate: [1, o.eRate || 1], hpMul: [1, o.eHp || 1],
      hold: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], half: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]], cd: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
      skill: [o.skill ? o.skill[0] : null, o.skill ? o.skill[1] : null], used: [false, false], rush: [-1, -1], guard: [-1, -1],
      breach: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]],
      ai: [o.ai ? o.ai[0] : null, o.ai ? o.ai[1] : 'normal'], style: o.style || 'plain', mem: [{ next: 0 }, { next: 0 }],
      ev: [],
      st: { sent: [0, 0], swaps: [0, 0], retreats: [0, 0], collapses: [0, 0], skills: [0, 0], lost: [0, 0], kills: [0, 0], lead: 0, leadChanges: 0, behindAt45: null, taps: [0, 0] }
    };
    for (var s = 0; s < 2; s++) { refill(S, s); while (S.q[s].length < 2) S.q[s].push(draw(S, s)); }
    return S;
  }
  function refill(S, s) {
    var b = S.comp[s].slice();
    for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(rnd(S) * (i + 1)), x = b[i]; b[i] = b[j]; b[j] = x; }
    S.bag[s] = b;
  }
  function draw(S, s) { if (!S.bag[s].length) refill(S, s); return S.bag[s].shift(); }
  // 次に届く3部隊(袋の中身。足りなければ次の袋はまだ決まっていないので出さない)
  function upcoming(S, s) { return S.bag[s].slice(0, 3); }
  // 段 c(side s の本陣から数えて)の持ち主: s / 相手 / -1(空き地)
  function owner(S, s, l, c) { return c < S.h[s][l] ? s : c >= R - S.h[1 - s][l] ? 1 - s : -1; }
  function terrAt(S, s, l, c) { var r = s === 0 ? c : R - 1 - c, ll = s === 0 ? l : l; return S.field[ll][r]; }
  function towns(S, s) {
    var n = 0;
    for (var l = 0; l < L; l++) for (var r = 0; r < R; r++) if (S.field[l][r] === 1) { var c = s === 0 ? r : R - 1 - r; if (owner(S, s, l, c) === s) n++; }
    return n;
  }
  function interval(S, s) { return Math.max(K.minArrive, (K.arrive - K.townCut * towns(S, s)) * S.rate[s]); }
  function cells(S, s) { var n = 0; for (var l = 0; l < L; l++) n += S.h[s][l]; return n; }
  function laneUnits(S, s, l) {
    var a = [];
    for (var i = 0; i < S.units.length; i++) { var u = S.units[i]; if (u.s === s && u.l === l) a.push(u); }
    a.sort(function (x, y) { return y.p - x.p; });
    return a;
  }
  // 出すぎ: 隣の列より K.over 段以上前に出ている側の数(0〜2)
  function over(S, s, l) {
    var n = 0, h = S.h[s];
    if (l > 0 && h[l] - h[l - 1] >= K.over) n++;
    if (l < L - 1 && h[l] - h[l + 1] >= K.over) n++;
    return n;
  }
  function nbMax(S, s, l) { var h = S.h[s], m = 1; if (l > 0) m = Math.max(m, h[l - 1]); if (l < L - 1) m = Math.max(m, h[l + 1]); return m; }

  // ---- 操作 ----
  function send(S, s, l) {
    if (S.done || !S.q[s].length) return 'empty';
    if (laneUnits(S, s, l).length >= K.laneMax) return 'full';
    var type = S.q[s].shift(), lane = laneUnits(S, s, l), p = 0.5;
    // 急行: すぐ前線(先頭の後ろか、陣地の端)に着く
    if (S.t < S.rush[s]) p = Math.max(0.5, lane.length ? lane[lane.length - 1].p - K.gap : S.h[s][l] - 0.5);
    var u = { id: S.nid++, s: s, type: type, hp: K.hp * S.hpMul[s], max: K.hp * S.hpMul[s], l: l, p: p, hitT: -9 };
    S.units.push(u);
    S.st.sent[s]++; S.st.taps[s]++;
    S.ev.push({ t: S.t, k: 'send', s: s, l: l, id: u.id, type: type });
    return u;
  }
  function swap(S, s, i) {
    if (S.done || i <= 0 || i >= S.q[s].length) return false;
    var x = S.q[s][0]; S.q[s][0] = S.q[s][i]; S.q[s][i] = x;
    S.st.swaps[s]++; S.st.taps[s]++;
    return true;
  }
  // 後退: 列を1段ゆずる(その段は空き地に)。部隊は無傷で下がり、3秒その場で構えて被害半分
  function canRetreat(S, s, l) { return !S.done && S.t >= S.cd[s][l] && S.h[s][l] > 1; }
  function retreat(S, s, l) {
    if (!canRetreat(S, s, l)) return false;
    S.h[s][l]--;
    var lane = laneUnits(S, s, l);
    lane.forEach(function (u, k) { u.p = Math.max(0.3, Math.min(u.p, S.h[s][l] - 0.15 - k * K.gap)); });
    S.hold[s][l] = S.half[s][l] = S.t + K.retreatT; S.cd[s][l] = S.t + K.retreatCd;
    S.st.retreats[s]++; S.st.taps[s]++;
    S.ev.push({ t: S.t, k: 'retreat', s: s, l: l });
    return true;
  }
  function useSkill(S, s, l) {
    var k = S.skill[s];
    if (S.done || !k || S.used[s]) return false;
    if (SKILLS[k].lane && (l === undefined || l === null)) return false;
    S.used[s] = true; S.st.skills[s]++; S.st.taps[s]++;
    if (k === 'barrage') {
      laneUnits(S, 1 - s, l).forEach(function (u) { hurt(S, u, K.barrage, s); });
      S.ev.push({ t: S.t, k: 'skill', s: s, sk: k, l: l });
      cleanup(S);
    } else if (k === 'rush') { S.rush[s] = S.t + K.skillDur; S.ev.push({ t: S.t, k: 'skill', s: s, sk: k }); }
    else if (k === 'hold') { S.guard[s] = S.t + K.skillDur; S.ev.push({ t: S.t, k: 'skill', s: s, sk: k }); }
    return true;
  }

  // ---- 1こま進める ----
  function hurt(S, u, d, by) { u.hp -= d; u.hitT = S.t; u.by = by; }
  function takeMul(S, u) {
    var m = K.home + K.homeStep * u.p, c = Math.floor(u.p);
    if (terrAt(S, u.s, u.l, Math.min(R - 1, c)) === 2 && c < S.h[u.s][u.l] + 1) m *= K.hill;
    var o = over(S, u.s, u.l);
    if (o === 1) m *= K.flank1; else if (o === 2) m *= K.flank2;
    if (S.t < S.half[u.s][u.l]) m *= K.retreatMul;
    if (S.t < S.guard[u.s]) m *= 0.5;
    return m;
  }
  function cleanup(S) {
    for (var i = S.units.length - 1; i >= 0; i--) {
      var u = S.units[i];
      if (u.hp > 0) continue;
      S.units.splice(i, 1);
      S.st.lost[u.s]++; S.st.kills[1 - u.s]++;
      S.ev.push({ t: S.t, k: 'die', s: u.s, l: u.l, id: u.id, type: u.type });
      // 総崩れ: 出すぎた列で、控えもいないまま先頭が倒れた → 隣の列の高さまで一気に取り返される
      if (!laneUnits(S, u.s, u.l).length && S.h[u.s][u.l] - Math.min(u.l > 0 ? S.h[u.s][u.l - 1] : 99, u.l < L - 1 ? S.h[u.s][u.l + 1] : 99) >= K.collapse) {
        var from = S.h[u.s][u.l], to = nbMax(S, u.s, u.l);
        if (to < from) {
          S.h[u.s][u.l] = to;
          S.h[1 - u.s][u.l] = R - to;
          S.st.collapses[u.s]++;
          S.ev.push({ t: S.t, k: 'collapse', s: u.s, l: u.l, from: from, to: to });
        }
      }
    }
  }
  function step(S, dt) {
    if (S.done) return;
    S.t += dt;
    var s, l, i;
    // 補給: 部隊が届く(待機がいっぱいなら、その分は届かない)
    for (s = 0; s < 2; s++) {
      while (S.t >= S.nextT[s]) {
        if (S.q[s].length < K.qMax) S.q[s].push(draw(S, s)); else S.st.lost[s] += 0, S.st.overflow = (S.st.overflow || [0, 0]), S.st.overflow[s]++;
        S.nextT[s] += interval(S, s);
      }
    }
    // 自動プレイヤー(敵と、自動で遊ぶときの自分)
    for (s = 0; s < 2; s++) if (S.ai[s]) think(S, s);
    // 動き・撃ち合い
    for (l = 0; l < L; l++) {
      var A = laneUnits(S, 0, l), B = laneUnits(S, 1, l), a = A[0], b = B[0];
      var eng = a && b && (R - a.p - b.p) <= K.engage;
      [[A, 0], [B, 1]].forEach(function (pair) {
        var U = pair[0], sd = pair[1], opp = sd === 0 ? b : a;
        for (var k = 0; k < U.length; k++) {
          var u = U[k];
          if (k === 0) {
            if (eng || S.t < S.hold[sd][l]) continue;
            var c = Math.floor(u.p + 0.5), own = c < S.h[sd][l];
            var sp = own ? K.run : K.push;
            if (terrAt(S, sd, l, Math.min(R - 1, c)) === 3) sp *= K.river;
            var np = u.p + sp * dt, lim = R - 0.7;
            if (opp) lim = Math.min(lim, R - opp.p - K.engage + 0.001);
            u.p = Math.min(np, Math.max(u.p, lim));
          } else {
            var tg = U[k - 1].p - K.gap;
            if (u.p < tg) u.p = Math.min(tg, u.p + K.run * dt);
          }
        }
      });
      if (eng) {
        hurt(S, b, K.dps * dt * aff(a.type, b.type) * takeMul(S, b) * (S.t < S.half[0][l] ? K.ambush : 1), 0);
        hurt(S, a, K.dps * dt * aff(b.type, a.type) * takeMul(S, a) * (S.t < S.half[1][l] ? K.ambush : 1), 1);
      }
      // 横からの射撃: 出すぎた列は、撃ち合っていなくても全員が少しずつ削られる。本陣に近づいた先頭は本陣の守りに撃たれる
      [[A, 0], [B, 1]].forEach(function (pair) { var o = over(S, pair[1], l); if (o) pair[0].forEach(function (u) { hurt(S, u, K.chip * o * dt, 1 - u.s); }); });
      [a, b].forEach(function (u) { if (u && u.p >= R - 2) hurt(S, u, K.hqDps * dt * (S.t < S.guard[u.s] ? 0.5 : 1), 1 - u.s); });
    }
    cleanup(S);
    // 陣地を取る(先頭がいる段まで)・突破
    for (l = 0; l < L; l++) for (s = 0; s < 2; s++) {
      var ld = laneUnits(S, s, l)[0];
      if (!ld) { S.breach[s][l] = 0; continue; }
      var cc = Math.floor(ld.p);
      if (cc >= S.h[s][l] && cc <= R - 2) {
        S.h[s][l] = cc + 1;
        if (S.h[1 - s][l] > R - 1 - cc) S.h[1 - s][l] = R - 1 - cc;
        S.ev.push({ t: S.t, k: 'take', s: s, l: l, c: cc });
      }
      if (ld.p >= R - 1) {
        S.breach[s][l] += dt;
        if (S.breach[s][l] >= K.breachT) { finish(S, s, 'breach'); return; }
      } else S.breach[s][l] = 0;
    }
    // 優勢の入れ替わり
    var d = cells(S, 0) - cells(S, 1), sg = d > 0 ? 1 : d < 0 ? -1 : 0;
    if (sg && S.st.lead && sg !== S.st.lead) S.st.leadChanges++;
    if (sg) S.st.lead = sg;
    if (S.st.behindAt45 === null && S.t >= 45) S.st.behindAt45 = sg;
    if (S.t >= K.time) {
      var c0 = cells(S, 0), c1 = cells(S, 1);
      finish(S, c0 > c1 ? 0 : c1 > c0 ? 1 : towns(S, 0) > towns(S, 1) ? 0 : 1, 'time');
    }
  }
  function finish(S, w, why) {
    S.done = true; S.winner = w; S.why = why;
    S.ev.push({ t: S.t, k: 'end', w: w, why: why });
  }
  function result(S) {
    return { win: S.winner === 0, why: S.why, time: S.t, cells: [cells(S, 0), cells(S, 1)], st: S.st };
  }

  // ---- 自動プレイヤー ----
  // 種類: none(何もしない) / random(でたらめ) / one(1列だけ) / affinity(相性だけ) / skilled(相性+後退+挟み撃ち) / normal(敵の標準)
  var THINK = { none: 9, random: 0.5, one: 0.4, affinity: 0.45, skilled: 0.35, normal: 0.55, easy: 0.8, hard: 0.4, look: 0.5, lookNR: 0.5 };
  function think(S, s) {
    var m = S.mem[s], kind = S.ai[s];
    if (kind === 'none' || S.t < m.next) return;
    m.next = S.t + THINK[kind] * (0.8 + rnd(S) * 0.4);
    var o = 1 - s;
    if (kind === 'random') { if (S.q[s].length) send(S, s, Math.floor(rnd(S) * L)); return; }
    if (kind === 'look' || kind === 'lookNR') { lookahead(S, s, kind === 'look'); return; }
    if (kind === 'one') { if (S.q[s].length) send(S, s, 2); return; }
    var smart = kind === 'skilled' || kind === 'hard';
    var noRetreat = S.noRetreat && S.noRetreat[s];
    // 後退: 自分の列の先頭が不利な相手と撃ち合っていて、敵がその列で隣より前に出ている(下がれば敵が出すぎになる)
    if (smart && !noRetreat) {
      for (var l = 0; l < L; l++) {
        if (!canRetreat(S, s, l)) continue;
        var A = laneUnits(S, s, l), B = laneUnits(S, o, l), a = A[0], b = B[0];
        if (!a || !b || (R - a.p - b.p) > K.engage + 0.05) continue;
        var bad = aff(b.type, a.type) > 1 && a.hp < a.max * 0.7;
        var lure = S.h[o][l] + 1 - Math.min(l > 0 ? S.h[o][l - 1] : 99, l < L - 1 ? S.h[o][l + 1] : 99) >= K.over;
        var counter = S.q[s].some(function (t) { return aff(t, b.type) > 1; }) || A.slice(1).some(function (u) { return aff(u.type, b.type) > 1; });
        if (bad && lure && counter && S.h[s][l] > 2) { retreat(S, s, l); m.lure = { l: l, until: S.t + 4 }; return; }
      }
    }
    // 技
    if (S.skill[s] && !S.used[s]) {
      var k = S.skill[s];
      if (k === 'barrage') {
        var bl = -1, bv = 0;
        for (l = 0; l < L; l++) { var v = 0; laneUnits(S, o, l).forEach(function (u) { v += Math.min(u.hp, K.barrage); }); v *= 1 + over(S, o, l); if (v > bv) { bv = v; bl = l; } }
        if (bv >= (smart ? 90 : 60) || (S.t > 70 && bv > 0)) { useSkill(S, s, bl); }
      } else if (k === 'hold') {
        var engN = 0;
        for (l = 0; l < L; l++) { var x = laneUnits(S, s, l)[0], y = laneUnits(S, o, l)[0]; if (x && y && (R - x.p - y.p) <= K.engage) engN++; }
        if (engN >= 3 || S.t > 75) useSkill(S, s, null);
      } else if (k === 'rush') { if (S.q[s].length >= 3 || S.t > 75) useSkill(S, s, null); }
    }
    if (!S.q[s].length) return;
    // 送り先: 待機の各部隊 × 各列 の点数がいちばん高い組み合わせ
    var best = null, bs = -1e9;
    for (var i = 0; i < S.q[s].length; i++) {
      var ty = S.q[s][i];
      for (l = 0; l < L; l++) {
        var lane = laneUnits(S, s, l);
        if (lane.length >= K.laneMax) continue;
        var e = laneUnits(S, o, l), el = e[0], hs = S.h[s][l], ho = S.h[o][l], sc = 0;
        // 相手の先頭との相性
        if (el) sc += (aff(ty, el.type) - 1) * 6;
        // 足りない列ほど(相手が多い・自分が少ない)
        sc += (e.length - lane.length) * 1.6;
        // 押されている列は急ぐ(本陣に近い)。敵の先頭が本陣に迫っていたら最優先
        sc += Math.max(0, 4 - hs) * 1.2;
        if (el && el.p >= 5.5) sc += 4 + (el.p - 5.5) * 3;
        if (!el && ho <= 3) sc += 1.0; // 相手のいない列は押し込める
        // 町
        for (var c = hs; c < R - ho && c < hs + 2; c++) if (terrAt(S, s, l, c) === 1) sc += 0.8;
        if (smart) {
          // 自分が出すぎている列に控えがいなければ、総崩れになる前に足す
          if (over(S, s, l) && lane.length <= 1) sc += 2;
          // 相手が出すぎている列は挟める(先頭が横からも撃たれている)。相性の良い部隊を当てて崩す
          sc += over(S, o, l) * 2.5 * (el ? Math.max(0.5, aff(ty, el.type)) : 1);
        }
        // 敵の性格
        if (s === 1 || kind === 'normal') {
          var st = S.style;
          if (st === 'rush') sc += (hs - 3) * 0.6;
          if (st === 'wall') sc += Math.max(0, 4 - hs) * 0.8;
          if (st === 'edge' && (l === 0 || l === L - 1)) sc += 1.5;
          if (st === 'town') for (c = hs; c < R - ho; c++) if (terrAt(S, s, l, c) === 1) sc += 1.2;
        }
        if (smart && m.lure && S.t < m.lure.until && m.lure.l === l && el && aff(ty, el.type) > 1) sc += 5;
        sc -= i * 0.3; // 入れ替えは少し手間
        sc += rnd(S) * (kind === 'easy' ? 3 : kind === 'normal' ? 1.2 : 0.4);
        if (sc > bs) { bs = sc; best = { i: i, l: l }; }
      }
    }
    if (!best) return;
    if (best.i > 0) swap(S, s, best.i);
    send(S, s, best.l);
  }

  // 先読み: 候補(待つ・各列へ送る・入れ替えて送る・後退・技)を打ったあと LOOK 秒を、両軍とも標準の頭で試算する
  var LOOK = 8;
  function clone(S) {
    var c = JSON.parse(JSON.stringify(Object.assign({}, S, { ev: [] })));
    return c;
  }
  function value(S, s) {
    var v = (cells(S, s) - cells(S, 1 - s)) * 10, i;
    for (i = 0; i < S.units.length; i++) v += (S.units[i].s === s ? 1 : -1) * S.units[i].hp / 25;
    v += (S.q[s].length - S.q[1 - s].length) * 3;
    if (S.done) v += S.winner === s ? 500 : -500;
    return v;
  }
  function lookahead(S, s, allowRetreat) {
    var cands = [{ k: 'wait' }], i, l, seen = {};
    for (i = 0; i < S.q[s].length; i++) {
      if (seen[S.q[s][i]]) continue; seen[S.q[s][i]] = 1;
      for (l = 0; l < L; l++) if (laneUnits(S, s, l).length < K.laneMax) cands.push({ k: 'send', i: i, l: l });
    }
    if (allowRetreat) for (l = 0; l < L; l++) if (canRetreat(S, s, l) && laneUnits(S, s, l).length && S.h[s][l] > 2) cands.push({ k: 'ret', l: l });
    if (S.skill[s] && !S.used[s]) { if (SKILLS[S.skill[s]].lane) { for (l = 0; l < L; l++) if (laneUnits(S, 1 - s, l).length) cands.push({ k: 'skill', l: l }); } else cands.push({ k: 'skill', l: null }); }
    if (cands.length === 1) return;
    var best = null, bv = -1e18;
    cands.forEach(function (c) {
      var T = clone(S);
      T.ai = T.ai.slice(); T.ai[s] = 'affinity'; T.mem = [{ next: T.t + 0.6 }, { next: T.mem[1 - s].next }];
      if (s === 1) T.mem = [{ next: T.mem[0].next }, { next: T.t + 0.6 }];
      if (c.k === 'send') { if (c.i) swap(T, s, c.i); send(T, s, c.l); }
      else if (c.k === 'ret') retreat(T, s, c.l);
      else if (c.k === 'skill') useSkill(T, s, c.l);
      var end = T.t + LOOK;
      while (!T.done && T.t < end) step(T, 0.1);
      var v = value(T, s) - (c.k === 'skill' ? 15 : 0);
      if (v > bv) { bv = v; best = c; }
    });
    if (best.k === 'send') { if (best.i) swap(S, s, best.i); send(S, s, best.l); }
    else if (best.k === 'ret') retreat(S, s, best.l);
    else if (best.k === 'skill') useSkill(S, s, best.l);
  }

  // ---- 通しで1戦(Node の計測用) ----
  function simulate(o, dt) {
    var S = create(o);
    if (o.noRetreat) S.noRetreat = o.noRetreat;
    dt = dt || 0.05;
    while (!S.done) step(S, dt);
    return result(S);
  }

  // ---- 戦区(試作では戦場10個) ----
  var ECMD = [
    { id: 'ghost', name: '亡霊', style: 'rush', trait: '突っこんでくる' },
    { id: 'wall', name: '鉄壁', style: 'wall', trait: '守りが固い' },
    { id: 'viper', name: '毒蛇', style: 'edge', trait: '端ばかり狙う' },
    { id: 'witch', name: '魔女', style: 'town', trait: '町を先に取る' },
    { id: 'thunder', name: '雷帝', style: 'rush', trait: '突っこんでくる・技が強い' },
    { id: 'reaper', name: '死神', style: 'town', trait: 'すきを逃さない' }
  ];
  var CMDS = [
    { id: 'rai', name: '雷門 ハヤト', skill: 'barrage' },
    { id: 'hayate', name: '疾風 カイ', skill: 'rush' },
    { id: 'tetsu', name: '鉄崎 ミナ', skill: 'hold' }
  ];
  var COMPS = {
    even: { name: '均等', comp: ['inf', 'inf', 'inf', 'inf', 'tank', 'tank', 'tank', 'at', 'at', 'at'] },
    armor: { name: '戦車多め', comp: ['inf', 'inf', 'inf', 'tank', 'tank', 'tank', 'tank', 'tank', 'at', 'at'] },
    foot: { name: '歩兵多め', comp: ['inf', 'inf', 'inf', 'inf', 'inf', 'inf', 'tank', 'tank', 'at', 'at'] }
  };
  var PLACES = ['渡し場', '麦畑', '峠の町', '霧の谷', '鉄橋', '丘の村', '旧街道', '湖畔', '砂の原', '本営'];
  function stage(n) {
    var e = ECMD[(n - 1) % ECMD.length], seed = n * 1009 + 7;
    var rate = [1.18, 1.12, 1.08, 1.04, 1.0, 0.98, 0.96, 0.94, 0.92, 0.88][n - 1] || 0.88;
    var kind = n % 3 === 0 ? 'river' : n % 3 === 1 ? 'hills' : null;
    var eComp = e.style === 'rush' ? COMPS.armor.comp : e.style === 'wall' ? ['inf', 'inf', 'inf', 'at', 'at', 'at', 'at', 'tank', 'tank', 'tank'] : COMPS.even.comp;
    return { n: n, name: PLACES[n - 1] || '戦場' + n, ecmd: e, seed: seed, field: makeField(seed, kind), eRate: rate, eSkill: ['barrage', 'hold', 'rush'][n % 3], eComp: eComp, ai: n <= 2 ? 'easy' : n >= 8 ? 'hard' : 'normal', boss: n === 10 };
  }
  // 星: 勝つ / 総崩れを1回以上起こす / 突破勝ちか10段差以上
  function stars(S) {
    if (S.winner !== 0) return 0;
    var n = 1;
    if (S.st.collapses[1] >= 1) n++;
    if (S.why === 'breach' || cells(S, 0) - cells(S, 1) >= 10) n++;
    return n;
  }

  return {
    K: K, L: L, R: R, TYPES: TYPES, NAME: NAME, SHORT: SHORT, BEAT: BEAT, SKILLS: SKILLS, aff: aff,
    makeField: makeField, create: create, step: step, send: send, swap: swap, retreat: retreat, canRetreat: canRetreat, useSkill: useSkill,
    owner: owner, terrAt: terrAt, towns: towns, cells: cells, laneUnits: laneUnits, over: over, upcoming: upcoming, interval: interval,
    result: result, simulate: simulate, stage: stage, stars: stars, ECMD: ECMD, CMDS: CMDS, COMPS: COMPS
  };
})();
if (typeof module !== 'undefined') module.exports = SH;
