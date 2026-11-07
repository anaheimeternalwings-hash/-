// バランス自動テスト
//   node tests/balance.test.js          … 標準(ステージ120まで)
//   STAGES=200 node tests/balance.test.js … より長く
//
// index.html の <script id="logic"> をそのまま取り出して動かすので、
// ゲーム本体と同じ計算でテストされます。
'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const HTML = path.join(__dirname, '..', 'index.html');
function loadTF() {
  const html = fs.readFileSync(HTML, 'utf8');
  const m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('logic script not found');
  return new Function('module', m[1] + '\n;return TF;')(undefined);
}
const TF = loadTF();
const K = TF.K;
const STEEL_PRICE = 1.6;

let failures = 0;
function check(name, fn) {
  try { fn(); console.log('  ✔ ' + name); }
  catch (e) { failures++; console.log('  ✘ ' + name + '\n      ' + e.message); }
}

// ---------------------------------------------------------------
// 1. ルールの確認
// ---------------------------------------------------------------
console.log('\n[ルール]');
check('相性: 歩兵は対戦車兵と砲兵に強く、戦車に弱い', () => {
  assert(TF.AFF.inf.at > 1 && TF.AFF.inf.art > 1 && TF.AFF.inf.tank < 1);
});
check('相性: 戦車は歩兵と砲兵に強く、対戦車兵に弱い', () => {
  assert(TF.AFF.tank.inf > 1 && TF.AFF.tank.art > 1 && TF.AFF.tank.at < 1);
});
check('相性: 対戦車兵は戦車にとても強く(2倍以上)、ほかには弱め', () => {
  assert(TF.AFF.at.tank >= 2);
  ['inf', 'at', 'art'].forEach(t => assert(TF.AFF.at[t] < 1, t));
});
check('相性: 砲兵は歩兵と対戦車兵に強く、戦車に弱い', () => {
  assert(TF.AFF.art.inf > 1 && TF.AFF.art.at > 1 && TF.AFF.art.tank < 1);
});
check('部隊の枠は司令部Lv1で2、最大6', () => {
  assert.strictEqual(TF.slotsFor(1), 2);
  assert.strictEqual(TF.slotsFor(100), 6);
  for (let l = 1; l < 50; l++) assert(TF.slotsFor(l + 1) >= TF.slotsFor(l));
});
check('施設のレベル上限は司令部レベルで決まる', () => {
  const st = TF.newState(0);
  st.money = st.steel = 1e12;
  const hq = TF.lv(st, 'hq');
  while (TF.canUpgrade(st, 'barracks').ok) TF.doUpgrade(st, 'barracks', 0);
  assert.strictEqual(TF.lv(st, 'barracks'), TF.maxLevel(st, 'barracks'));
  TF.doUpgrade(st, 'hq', 0);
  assert(TF.lv(st, 'hq') === hq + 1 && TF.canUpgrade(st, 'barracks').ok);
});
check('3×3の区画: 中央が司令部、残り8区画に8種の施設が建つ', () => {
  const st = TF.newState(0);
  assert.strictEqual(st.bld.hq.slot, 4);
  st.money = st.steel = 1e12;
  st.bld.hq.lv = 3;
  TF.BLD_ORDER.forEach(id => { if (!st.bld[id]) assert(TF.doUpgrade(st, id, 0).ok, id); });
  const slots = Object.values(st.bld).map(b => b.slot).sort();
  assert.deepStrictEqual(slots, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.strictEqual(TF.freeSlots(st).length, 0);
});
check('生産: 閉じている間も上限まで貯まり、上限を超えない。倉庫で上限時間が延びる', () => {
  const st = TF.newState(0);
  st.money = st.steel = 1e9;
  TF.doUpgrade(st, 'supply', 0, 0);
  TF.settle(st, 100 * 3600e3);
  const cap = TF.prodRate('supply', 1) * TF.capHours(st);
  assert(Math.abs(st.bld.supply.stored - cap) < 1e-6);
  const before = st.money;
  const g = TF.collect(st, 100 * 3600e3);
  assert.strictEqual(st.money, before + g.m);
  assert(g.m > 0 && st.bld.supply.stored < 1);
  st.bld.hq.lv = 2;
  const h0 = TF.capHours(st);
  TF.doUpgrade(st, 'depot', 100 * 3600e3, 3);
  assert(TF.capHours(st) > h0);
});
check('生産: 時計が巻き戻っても資源が減ったり増えすぎたりしない', () => {
  const st = TF.newState(0);
  st.money = st.steel = 1e9;
  TF.doUpgrade(st, 'steel', 3600e3, 0);
  TF.settle(st, 0);
  assert(st.bld.steel.stored === 0);
});
check('敗北しても資源・施設・指揮官は失われず、経験値は入る', () => {
  const st = TF.newState(0);
  const snap = JSON.stringify(st.bld);
  const m = st.money, s = st.steel, exp = st.heroes.oni.exp, lv = st.heroes.oni.lv;
  const r = TF.applyResult(st, 50, false, st.form);
  assert.strictEqual(st.money, m); assert.strictEqual(st.steel, s);
  assert.strictEqual(JSON.stringify(st.bld), snap);
  assert(r.exp > 0 && (st.heroes.oni.exp > exp || st.heroes.oni.lv > lv));
  assert.strictEqual(st.cleared, 0);
});
check('指揮官4人はステージを進めると着任する', () => {
  const st = TF.newState(0);
  assert.deepStrictEqual(Object.keys(st.heroes), ['oni']);
  const joined = [];
  for (let s = 1; s <= 20; s++) { const r = TF.applyResult(st, s, true, st.form); r.newHeroes.forEach(h => joined.push([h, s])); }
  assert.strictEqual(Object.keys(st.heroes).length, 4);
  assert.deepStrictEqual(joined.map(x => x[0]), ['tetsu', 'taka', 'rai']);
});
check('指揮官は得意兵種を率いると強くなり、レベルアップで強くなる', () => {
  TF.HEROES.forEach(h => {
    assert(TF.heroMult(1, true) > TF.heroMult(1, false));
    assert(TF.heroMult(10, false) > TF.heroMult(1, false));
  });
});
check('固有スキル: 突撃・装甲・一撃必中・一斉射撃', () => {
  assert.deepStrictEqual(TF.HEROES.map(h => TF.SKILL[h.skill].name), ['突撃', '装甲', '一撃必中', '一斉射撃']);
});
check('ステージは上限なく続く(ステージ5000でも敵・報酬が有限で戦闘できる)', () => {
  [1, 10, 100, 1000, 5000].forEach(s => {
    const i = TF.stageInfo(s);
    assert(i.enemies.length >= 2 && i.enemies.length <= 6);
    i.enemies.forEach(e => assert(isFinite(e.maxHp) && isFinite(e.atk) && e.maxHp > 0));
    assert(isFinite(i.reward.m) && i.reward.m > 0);
    const r = TF.simulate(i.enemies, i.enemies, 1, true);
    assert(typeof r.win === 'boolean' && r.ev.length > 0);
  });
});
check('同じステージの敵編成・同じシードの戦闘は毎回同じ(事前に見える編成どおり)', () => {
  TF.clearCache();
  const a = JSON.stringify(TF.stageInfo(37));
  TF.clearCache();
  assert.strictEqual(JSON.stringify(TF.stageInfo(37)), a);
  const e = TF.stageInfo(37).enemies;
  assert.deepStrictEqual(TF.simulate(e, e, 9, true), TF.simulate(e, e, 9, true));
});
check('戦闘を少しずつ進めても、操作しなければ一括計算(予想勝率と同じ計算)と完全に同じ結果', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const e = TF.stageInfo(30 + seed % 20).enemies;
    const p = TF.stageInfo(28 + seed % 20).enemies.map((q, i) => Object.assign({}, q, { hero: i < 4 ? ['oni', 'tetsu', 'taka', 'rai'][i] : null }));
    const full = JSON.stringify(TF.simulate(p, e, seed, true));
    const b = TF.createBattle(p, e, seed, { record: true });
    for (let t = 0.016; !b.isDone(); t += 0.033) b.step(t);
    assert.strictEqual(JSON.stringify(b.result()), full, 'seed ' + seed);
  }
});
check('手動: 攻撃指示した部隊は、目標が倒れるまでその目標だけを撃つ', () => {
  const e = TF.stageInfo(40).enemies;
  const p = TF.stageInfo(40).enemies.map(q => Object.assign({}, q, { hero: null }));
  const b = TF.createBattle(p, e, 7, { record: true, auto: false });
  const target = p.length + e.length - 1;
  assert(b.order(0, target));
  b.step(Infinity);
  const shots = b.ev.filter(x => x.k === 'atk' && x.s === 0);
  const killAt = (b.ev.find(x => (x.d === target && x.kill) || (x.hits && x.hits.some(h => h.d === target && h.kill))) || { t: 1e9 }).t;
  assert(shots.length > 0);
  shots.filter(x => x.t <= killAt).forEach(x => assert.strictEqual(x.d, target));
  assert(!b.order(0, 0), '味方を目標にできてしまう');
});
check('手動: 自軍のスキルは押すまで発動せず、たまってから押すと発動する', () => {
  const e = TF.stageInfo(60).enemies;
  const p = TF.stageInfo(60).enemies.map((q, i) => Object.assign({}, q, { hero: i === 0 ? 'rai' : null }));
  const b = TF.createBattle(p, e, 3, { record: true, auto: false });
  b.step(2);
  assert(!b.cast(0, 2), '充填前に発動できてしまう');
  b.step(20);
  assert.strictEqual(b.ev.filter(x => x.k === 'skill' && x.s === 0).length, 0, '手動なのに自動で発動した');
  if (!b.isDone() && b.U[0].alive) {
    assert(b.cast(0, 20));
    assert.strictEqual(b.ev.filter(x => x.k === 'skill' && x.s === 0).length, 1);
  }
  // 敵の指揮官スキルは手動モードでも自動で発動する(敵は操作できない)
  const b2 = TF.createBattle(e, p.map((q, i) => Object.assign({}, q, { hero: i === 0 ? 'oni' : null, maxHp: q.maxHp * (i === 0 ? 4 : 1) })), 3, { record: true, auto: false });
  b2.step(Infinity);
  assert(b2.ev.some(x => x.k === 'skill' && b2.U[x.s].side === 1));
});
check('増援: 増援の枠は司令部レベルで1〜3、敵はステージ6から増援を出す', () => {
  assert.deepStrictEqual([1, 4, 5, 9, 10, 30].map(TF.reserveCount), [1, 1, 2, 2, 3, 3]);
  assert.deepStrictEqual([1, 5, 6, 19, 20, 45].map(TF.enemyReserveCount), [0, 0, 1, 1, 2, 3]);
  const st = TF.newState(0);
  st.bld.hq.lv = 5;
  const r = TF.battleReserves(st, 30);
  assert.strictEqual(r.p.count, 2);
  assert(Object.keys(r.p.defs).length >= 1);
  assert.strictEqual(r.e.list.length, 2);
  assert.deepStrictEqual(JSON.stringify(TF.battleReserves(st, 30)), JSON.stringify(r), '同じステージの敵の増援は毎回同じ');
});
check('増援: 自動ではポイントがたまると両軍とも途中参戦。手動ではポイントが足りないと出せず、たまれば出せる', () => {
  const st = TF.newState(0);
  st.bld.hq.lv = 10;
  const res = TF.battleReserves(st, 50);
  const big = q => Object.assign({}, q, { maxHp: q.maxHp * 6 });
  const e = TF.stageInfo(50).enemies.map(big), p = TF.stageInfo(50).enemies.map(big);
  const a = TF.createBattle(p, e, 5, { record: true, reserves: res });
  a.step(Infinity);
  const sp = a.ev.filter(x => x.k === 'spawn');
  assert(sp.some(x => x.side === 0) && sp.some(x => x.side === 1), '両軍の増援が出ない');
  assert(sp.filter(x => x.side === 0).length <= res.p.count && sp.filter(x => x.side === 1).length <= res.e.list.length, '枠より多く出た');
  // 手動
  const b = TF.createBattle(p, e, 5, { record: true, auto: false, reserves: res });
  b.step(0.5);
  const ty = Object.keys(res.p.defs)[0];
  assert.strictEqual(b.deploy(ty, 0.5), null, 'ポイント不足なのに出せた');
  b.step(TF.K.resCost);
  assert(!b.ev.some(x => x.k === 'spawn' && x.side === 0), '手動なのに勝手に出た');
  const id = b.deploy(ty, TF.K.resCost);
  assert(id !== null, 'たまったのに出せない');
  const info = b.reserveInfo(TF.K.resCost);
  assert.strictEqual(info.used, 1);
  assert(info.pts < info.cost);
  assert.strictEqual(b.U[id].side, 0);
  assert.strictEqual(b.U[id].type, ty);
});
check('配置の指示: 前進は与えるダメージ・受けるダメージが増え、後退は受けるダメージが減る', () => {
  const one = t => [{ type: t, maxHp: 1e6, atk: 100, cd: 1, hero: null, boss: false, power: 1 }];
  function firstHits(stance) {
    const b = TF.createBattle(one('inf'), one('inf'), 11, { record: true, auto: false });
    if (stance) assert(b.setStance(0, stance));
    b.step(6);
    const by = b.ev.filter(x => x.k === 'atk' && !x.miss && x.s === 0)[0];
    const to = b.ev.filter(x => x.k === 'atk' && !x.miss && x.d === 0)[0];
    return [by.dmg, to.dmg];
  }
  const [d0, t0] = firstHits(0), [d1, t1] = firstHits(1), [d2, t2] = firstHits(-1);
  assert(Math.abs(d1 / d0 - TF.K.stDeal['1']) < 0.02 && Math.abs(t1 / t0 - TF.K.stTake['1']) < 0.02, '前進 ' + [d0, d1, t0, t1]);
  assert(Math.abs(d2 / d0 - TF.K.stDeal['-1']) < 0.02 && Math.abs(t2 / t0 - TF.K.stTake['-1']) < 0.02, '後退 ' + [d0, d2, t0, t2]);
  assert(TF.K.stDeal['1'] > 1 && TF.K.stTake['1'] > 1 && TF.K.stTake['-1'] < 1);
});
check('武装: 研究所がないと開発できず、レベル上限は研究所Lv×2。新型の開発(Lv0→1、Lv5→6…)には設計図が要る', () => {
  const st = TF.newState(0);
  st.money = st.steel = 1e9; st.bp = 0;
  st.bld.factory = { lv: 5, slot: 5 };
  assert(!TF.canArm(st, 'tank', 'w').ok && TF.canArm(st, 'tank', 'w').locked, '研究所なしで開発できた');
  assert(!TF.canArm(st, 'art', 'w').ok, '未解放の兵種の武装が開発できた');
  st.bld.lab = { lv: 3, slot: 8 };
  assert.strictEqual(TF.canArm(st, 'tank', 'w').reason, '設計図が不足');
  st.bp = 1000;
  const names = [];
  for (let i = 0; i < 6; i++) { const r = TF.doArm(st, 'tank', 'w'); assert(r.ok, r.reason); names.push(r.name); assert.strictEqual(r.dev, i === 0 || i === 5); }
  assert.strictEqual(TF.armLv(st, 'tank', 'w'), 6);
  assert.strictEqual(names[0], names[4]);
  assert.notStrictEqual(names[4], names[5], '5レベルごとに新型にならない');
  assert.strictEqual(TF.canArm(st, 'tank', 'w').cap, true, '上限(研究所Lv3×2=6)を超えた');
  assert.strictEqual(1000 - st.bp, TF.armCost('tank', 'w', 0).bp + TF.armCost('tank', 'w', 5).bp, '設計図は開発のときだけ減る');
  assert.strictEqual(TF.armCost('tank', 'w', 3).bp, 0);
  assert(/改二$/.test(TF.armName('tank', 'w', 31)), TF.armName('tank', 'w', 31));
});
check('武装: 武器は攻撃力、防護は耐久、特殊は苦手な敵へのダメージだけを上げる(上限は苦手の半分まで。増援にも反映)', () => {
  const st = TF.newState(0);
  st.bld.factory = { lv: 5, slot: 5 }; st.bld.lab = { lv: 10, slot: 8 };
  const q0 = TF.squadStats(st, 'tank', null);
  st.arms = { tank: { w: 10 } };
  const q1 = TF.squadStats(st, 'tank', null);
  assert(Math.abs(q1.atk / q0.atk - (1 + 10 * K.armW)) < 1e-9 && q1.maxHp === q0.maxHp);
  st.arms = { tank: { a: 10 } };
  const q2 = TF.squadStats(st, 'tank', null);
  assert(Math.abs(q2.maxHp / q0.maxHp - (1 + 10 * K.armA)) < 0.01 && q2.atk === q0.atk);
  st.arms = { tank: { x: 10 } };
  const q3 = TF.squadStats(st, 'tank', null);
  assert.deepStrictEqual(Object.keys(q3.vs), TF.ARMS.tank.vs);
  const xm = 1 + TF.armEffect('x', 10, 'tank');
  assert.strictEqual(TF.battleReserves(st, 30).p.defs.tank.vs.at, xm, '増援に武装が反映されない');
  // 特殊は苦手の半分を打ち消すまで: どれだけ上げても相性×効果は等倍との中間を超えない(相性で編成を考える意味が残る)
  TF.TYPES.forEach(t => TF.ARMS[t].vs.forEach(d => { const a = TF.AFF[t][d]; assert(a * (1 + TF.armEffect('x', 999, t)) <= (a + 1) / 2 + 1e-4, t + '→' + d); }));
  assert(TF.armEffect('x', 1, 'tank') > TF.armEffect('x', 20, 'tank') - TF.armEffect('x', 19, 'tank'), '伸びが小さくならない');
  // 苦手な敵(対戦車兵)に撃つときだけダメージが上がる
  function firstHit(attacker, target) {
    const p = [Object.assign({}, attacker, { maxHp: 1e6 })], e = [{ type: target, maxHp: 1e6, atk: 1, cd: 9, hero: null, boss: false, power: 1 }];
    const b = TF.createBattle(p, e, 3, { record: true });
    b.step(5);
    return b.ev.find(x => x.k === 'atk' && x.s === 0 && !x.miss);
  }
  const base = firstHit(q0, 'at'), sp = firstHit(q3, 'at'), other = firstHit(q3, 'inf'), other0 = firstHit(q0, 'inf');
  assert(Math.abs(sp.dmg / base.dmg - xm) < 0.02 && sp.sp === 1, '特効が乗らない');
  assert.strictEqual(other.dmg, other0.dmg, '苦手でない敵にも乗った');
  assert(!other.sp);
});
check('設計図: 勝つと手に入り(先のステージほど多く、ボス戦と初クリアは2倍)、負けると増えない', () => {
  const st = TF.newState(0);
  assert.strictEqual(st.bp, 0);
  let r = TF.applyResult(st, 1, true, st.form);
  assert.strictEqual(r.bp, TF.stageReward(1).bp * K.firstMul);
  r = TF.applyResult(st, 1, true, st.form);
  assert.strictEqual(r.bp, TF.stageReward(1).bp);
  const before = st.bp;
  r = TF.applyResult(st, 2, false, st.form);
  assert.strictEqual(r.bp, 0); assert.strictEqual(st.bp, before);
  assert(TF.stageReward(60).bp > TF.stageReward(5).bp);
  assert.strictEqual(TF.stageReward(50).bp, TF.stageReward(49).bp * 2 * (1 + Math.floor(50 / K.bpStep)) / (1 + Math.floor(49 / K.bpStep)));
});
check('おまかせ編成は枠数どおりで、指揮官が重複しない', () => {
  const st = TF.newState(0);
  st.bld = { hq: { lv: 9, slot: 4 }, barracks: { lv: 5, slot: 0 }, atpost: { lv: 5, slot: 1 }, factory: { lv: 5, slot: 2 }, artpost: { lv: 5, slot: 3 } };
  st.heroes = { oni: { lv: 5, exp: 0 }, tetsu: { lv: 5, exp: 0 }, taka: { lv: 5, exp: 0 }, rai: { lv: 5, exp: 0 } };
  const f = TF.autoFormation(st, 30);
  assert.strictEqual(f.length, 6);
  const hs = f.map(x => x.hero).filter(Boolean);
  assert.strictEqual(new Set(hs).size, hs.length);
  assert.strictEqual(hs.length, 4);
  const p = TF.predict(st, f, 30, 50).winRate;
  assert(p >= 0 && p <= 1);
});
check('最初のステージは初期状態で勝てる', () => {
  const st = TF.newState(0);
  assert(TF.predict(st, st.form, 1, 100).winRate >= 0.95);
});

// ---------------------------------------------------------------
// 2. 自動プレイによるバランス確認
// ---------------------------------------------------------------
// プレイヤーAIの方針:
//  - 予想勝率が tryAt 以上なら次のステージへ挑戦、低ければ直近ステージで稼ぐ
//  - 稼ぐステージは「予想勝率×報酬」が最大のもの(ゲーム内のおすすめと同じ考え方)
//  - 資源は戦略ごとのルールで施設強化に使う
function playthrough(opt) {
  let now = 0;
  const st = TF.newState(now);
  let battles = 0, seed = 1, lastClear = 0, stuckMax = 0, stuckAt = 0, timeSum = 0, timeouts = 0, farmMin = 1;
  const perStage = {};
  const cache = new Map();
  let r = 12345;
  const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  const key = s => s + '|' + Object.keys(st.bld).map(k => k + st.bld[k].lv).join(',') + '|' + Object.keys(st.heroes).map(k => k + st.heroes[k].lv).join(',') + '|' + JSON.stringify(st.arms);
  const armTrace = {};
  let want = null;
  function getForm(s) {
    const k = key(s);
    if (cache.has(k)) return cache.get(k);
    const f = TF.autoFormation(st, s);
    const v = { f, wr: TF.evalForm(st, f, s, 40, 99).winRate };
    cache.set(k, v);
    return v;
  }
  const powerList = form => form.map(f => TF.squadMult(st, f.type, f.hero) * TF.UNIT_POW[f.type]);

  function spend() {
    for (let guard = 0; guard < 300; guard++) {
      const form = getForm(st.cleared + 1).f;
      const pw = powerList(form);
      const sumP = pw.reduce((a, b) => a + b, 0), avgP = sumP / pw.length;
      // 詰まっている次のステージを重く、その先5ステージも見て兵種の需要を測る
      const usage = { inf: 0, at: 0, tank: 0, art: 0 };
      let ws = 0;
      for (let d = 1; d <= 5; d++) {
        const w = d === 1 ? 3 : 1; ws += w;
        getForm(st.cleared + d).f.forEach(f => { usage[f.type] += w * TF.squadMult(st, f.type, f.hero) * TF.UNIT_POW[f.type]; });
      }
      for (const t in usage) usage[t] /= ws;
      const cands = [], deltaOf = {};
      for (const id of ['barracks', 'atpost', 'factory', 'artpost', 'lab']) {
        const cur = TF.lv(st, id), d = TF.BLD[id];
        let delta;
        if (id === 'lab') delta = sumP * K.labPerLv / TF.labMult(st);
        else if (cur === 0) delta = avgP * 0.6;
        else delta = (usage[d.unit] + avgP * 0.15) * K.unitPerLv / TF.unitMult(st, d.unit);
        deltaOf[id] = delta;
        if (TF.lv(st, 'hq') < d.req) continue;
        if (cur > 0 && cur >= TF.maxLevel(st, id)) continue;
        cands.push({ id, delta });
      }
      // 武装(兵器開発): 武器・防護は兵種の攻撃力・耐久、特殊は次のステージの苦手な敵の割合で価値を測る
      let armCap = 0;
      if (opt.arms !== false && TF.lv(st, 'lab') > 0) {
        const nextE = TF.stageInfo(st.cleared + 1).enemies;
        for (const t of TF.unlockedTypes(st)) for (const k of TF.ARM_KINDS) {
          const l = TF.armLv(st, t, k), e0 = TF.armEffect(k, l, t), e1 = TF.armEffect(k, l + 1, t);
          const frac = k === 'x' ? nextE.filter(e => TF.ARMS[t].vs.includes(e.type)).length / nextE.length : 1;
          const delta = (usage[t] + avgP * 0.15) * frac * 0.5 * ((1 + e1) / (1 + e0) - 1);
          if (l >= TF.armMax(st)) { armCap += delta; continue; }
          const cost = TF.armCost(t, k, l);
          cands.push({ id: 'arm', t, k, delta, cost, bpOk: (st.bp || 0) >= cost.bp });
        }
        const lab = cands.find(c => c.id === 'lab');
        if (lab) lab.delta += armCap;
      }
      const hq = TF.lv(st, 'hq');
      let dh = TF.slotsFor(hq + 1) > TF.slotsFor(hq) ? avgP : 0;
      for (const id of ['barracks', 'atpost', 'factory', 'artpost', 'lab']) { const c = TF.lv(st, id); if (c > 0 && c >= TF.maxLevel(st, id)) dh += deltaOf[id]; }
      for (const id of TF.BLD_ORDER) if (TF.BLD[id].req === hq + 1 && id !== 'supply' && id !== 'steel') dh += avgP * 0.5;
      if (dh > 0) cands.push({ id: 'hq', delta: dh });
      cands.forEach(c => {
        if (c.id !== 'arm') c.cost = TF.upgradeCost(c.id, TF.lv(st, c.id));
        c.ratio = c.delta / (c.cost.m + c.cost.s * STEEL_PRICE);
        c.afford = st.money >= c.cost.m && st.steel >= c.cost.s && c.bpOk !== false;
      });
      cands.sort((a, b) => b.ratio - a.ratio);
      let pick = null;
      if (opt.strategy === 'random') {
        // 欲しい強化をランダムに決め、買えるまで貯める
        const same = c => want && c.id === want.id && c.t === want.t && c.k === want.k;
        if (!cands.some(same)) {
          // 基地の画面と兵器の画面を気まぐれに見て、その画面の強化から選ぶ
          const arm = cands.filter(c => c.id === 'arm'), bld = cands.filter(c => c.id !== 'arm');
          const pool = arm.length && (!bld.length || rnd() < 0.5) ? arm : bld;
          want = pool.length ? pool[Math.floor(rnd() * pool.length)] : null;
        }
        const c = cands.find(same);
        if (c && c.afford) { pick = c; want = null; }
      } else if (opt.strategy === 'mono') {
        const ok = cands.filter(c => ['factory', 'lab', 'hq'].includes(c.id) || (c.id === 'arm' ? c.t === 'tank' : TF.lv(st, c.id) === 0));
        if (ok.length && ok[0].afford) pick = ok[0];
      } else if (cands.length) {
        pick = cands[0].afford ? cands[0] : cands.find(c => c.afford && c.ratio >= cands[0].ratio * 0.6) || null;
      }
      if (!pick && opt.production) {
        for (const id of ['supply', 'steel', 'depot']) {
          const cur = TF.lv(st, id);
          if (TF.lv(st, 'hq') < TF.BLD[id].req || cur >= TF.maxLevel(st, id) || cur >= TF.lv(st, 'hq')) continue;
          const c = TF.upgradeCost(id, cur);
          if (st.money >= c.m && st.steel >= c.s && c.m + c.s * STEEL_PRICE < (st.money + st.steel * STEEL_PRICE) * 0.35) { pick = { id }; break; }
        }
      }
      if (!pick || !(pick.id === 'arm' ? TF.doArm(st, pick.t, pick.k) : TF.doUpgrade(st, pick.id, now)).ok) break;
      cache.clear();
    }
  }

  while (st.cleared < opt.target && battles < opt.maxBattles) {
    TF.collect(st, now);
    spend();
    const next = st.cleared + 1;
    const g = getForm(next);
    let stage = next, form = g.f;
    if (g.wr < (opt.tryAt || 0.35) && st.cleared > 0) {
      let best = -1;
      for (let s = Math.max(1, st.cleared - 4); s <= st.cleared; s++) {
        const gg = getForm(s), rw = TF.stageInfo(s).reward;
        const v = gg.wr * (rw.m + rw.s * STEEL_PRICE);
        if (v > best) { best = v; stage = s; form = gg.f; }
      }
      farmMin = Math.min(farmMin, getForm(stage).wr);
    }
    st.form = form;
    const b = TF.prepareBattle(st, form, stage);
    const res = TF.simulate(b.p, b.e, seed++, false, { reserves: b.reserves });
    const sum = TF.applyResult(st, stage, res.win, b.form);
    battles++;
    timeSum += res.time; if (res.timeout) timeouts++;
    // 1戦 = 2倍速の戦闘時間 + 操作10秒 とみなす
    now += (res.time / 2 + 10) * 1000;
    if (opt.sessionBattles && battles % opt.sessionBattles === 0) now += opt.idleMs;
    if (sum.first) {
      const used = battles - lastClear;
      perStage[stage] = used;
      armTrace[stage] = b.p.reduce((a, q) => { const o = TF.armOpt(st, q.type); return a + Math.sqrt(o.atkMul * o.hpMul); }, 0) / b.p.length;
      if (used > stuckMax) { stuckMax = used; stuckAt = stage; }
      lastClear = battles;
    }
  }
  return { st, battles, perStage, stuckMax, stuckAt, hours: now / 3600e3, avgTime: timeSum / battles, timeouts, farmMin, armTrace };
}

function segments(res, size) {
  const out = [];
  for (let a = 1; a <= res.st.cleared; a += size) {
    const v = [];
    for (let s = a; s < a + size && res.perStage[s] !== undefined; s++) v.push(res.perStage[s]);
    if (v.length) out.push({ from: a, to: a + v.length - 1, avg: v.reduce((x, y) => x + y, 0) / v.length, max: Math.max(...v) });
  }
  return out;
}
function report(label, res) {
  console.log(`\n  ■ ${label}`);
  console.log(`    到達ステージ ${res.st.cleared} / 総戦闘 ${res.battles}回 / 想定プレイ時間 ${res.hours.toFixed(1)}時間`);
  console.log(`    最大の詰まり ${res.stuckMax}戦(ステージ${res.stuckAt}) / 平均戦闘時間 ${res.avgTime.toFixed(1)}秒 / 時間切れ ${res.timeouts}回 / 稼ぎ時の最低予想勝率 ${Math.round(res.farmMin * 100)}%`);
  console.log('    ' + segments(res, 20).map(g => `s${g.from}-${g.to}: 平均${g.avg.toFixed(1)} 最大${g.max}`).join('\n    '));
  const b = res.st.bld;
  console.log('    施設: ' + Object.keys(b).map(k => TF.BLD[k].name + b[k].lv).join(' '));
  console.log('    武装: ' + TF.TYPES.filter(t => TF.typeUnlocked(res.st, t)).map(t => TF.UNIT[t].name + ' ' + TF.ARM_KINDS.map(k => TF.armLv(res.st, t, k)).join('/')).join('  ') + ` (武器/防護/特殊のLv) 設計図の残り ${res.st.bp}`);
}

const TARGET = +process.env.STAGES || 120;
console.log(`\n[自動プレイ] ステージ${TARGET}まで(プレイヤーの方針を変えて4通り)`);
const t0 = Date.now();

const greedy = playthrough({ target: TARGET, maxBattles: 20000 });
report('堅実なプレイヤー(相性を見て強化)', greedy);
const random = playthrough({ target: TARGET, maxBattles: 20000, strategy: 'random' });
report('気まぐれなプレイヤー(欲しい強化をランダムに決めて貯める)', random);
const mono = playthrough({ target: Math.min(TARGET, 100), maxBattles: 20000, strategy: 'mono' });
report('戦車ひと筋のプレイヤー(相性を無視)', mono);
const idle = playthrough({ target: Math.min(TARGET, 80), maxBattles: 20000, production: true, sessionBattles: 30, idleMs: 4 * 3600e3 });
const active80 = playthrough({ target: Math.min(TARGET, 80), maxBattles: 20000 });
report('放置派(30戦ごとに4時間放置・生産施設あり)', idle);

console.log('\n[判定]');
check('どの方針でも目標ステージに到達する(永久に詰まらない)', () => {
  [greedy, random].forEach(r => assert.strictEqual(r.st.cleared, TARGET));
  assert.strictEqual(mono.st.cleared, Math.min(TARGET, 100));
  assert.strictEqual(idle.st.cleared, Math.min(TARGET, 80));
});
check('序盤(ステージ1〜10)は合計30戦以内で進める', () => {
  let n = 0; for (let s = 1; s <= 10; s++) n += greedy.perStage[s];
  assert(n <= 30, `${n}戦`);
});
check('詰まっても前のステージで稼げば進める: 最大の詰まりが 堅実40戦/気まぐれ60戦/相性無視150戦 以内', () => {
  assert(greedy.stuckMax <= 40, `堅実 ${greedy.stuckMax}`);
  assert(random.stuckMax <= 60, `気まぐれ ${random.stuckMax}`);
  assert(mono.stuckMax <= 150, `相性無視 ${mono.stuckMax}`);
});
check('稼ぎに使うステージは十分勝てる(予想勝率40%以上)', () => {
  [greedy, random, mono, idle].forEach(r => assert(r.farmMin >= 0.4, r.farmMin));
});
check('進むほど詰まりが際限なく重くならない(20ステージごとの平均が8戦以内)', () => {
  segments(greedy, 20).forEach(g => assert(g.avg <= 8, `s${g.from}: ${g.avg.toFixed(1)}`));
});
check('相性を見て強化するほうが、相性を無視するより早く進める', () => {
  let a = 0, b = 0;
  for (let s = 1; s <= Math.min(TARGET, 100); s++) { a += greedy.perStage[s]; b += mono.perStage[s]; }
  assert(a < b, `${a} vs ${b}`);
});
check('生産施設と放置で、同じステージまでの戦闘回数が減る', () => {
  assert(idle.battles < active80.battles, `${idle.battles} vs ${active80.battles}`);
});
check('戦闘はほぼ決着がつく(時間切れ1%未満)', () => {
  [greedy, random, mono].forEach(r => assert(r.timeouts / r.battles < 0.01));
});

console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}秒)`);
if (failures) { console.log(`\n${failures}件の失敗`); process.exit(1); }
console.log('\nすべて合格');
