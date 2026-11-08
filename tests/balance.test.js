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
check('部隊の枠は司令部Lv1で2、最大8', () => {
  assert.strictEqual(TF.slotsFor(1), 2);
  assert.strictEqual(TF.slotsFor(100), 8);
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
check('指揮官10人はステージを進めると着任する', () => {
  const st = TF.newState(0);
  assert.deepStrictEqual(Object.keys(st.heroes), ['oni']);
  const joined = [];
  for (let s = 1; s <= 80; s++) { const r = TF.applyResult(st, s, true, st.form); r.newHeroes.forEach(h => joined.push(h + '@' + s)); }
  assert.strictEqual(Object.keys(st.heroes).length, 10);
  assert.deepStrictEqual(joined, ['tetsu@3', 'taka@8', 'rai@15', 'sakura@22', 'hayate@30', 'kiri@40', 'kuro@50', 'amagi@62', 'ayase@75']);
});
check('あとから追加された指揮官も、着任のステージをクリア済みなら着任する(レベルはいちばん高い指揮官の7割)', () => {
  const st = TF.newState(0);
  st.cleared = 60;
  st.heroes = { oni: { lv: 30, exp: 0 }, tetsu: { lv: 28, exp: 0 }, taka: { lv: 25, exp: 0 }, rai: { lv: 22, exp: 0 } };
  const got = TF.grantHeroes(st);
  assert.deepStrictEqual(got, ['sakura', 'hayate', 'kiri', 'kuro']);
  got.forEach(h => assert.strictEqual(st.heroes[h].lv, 21));
  assert(!st.heroes.amagi && !st.heroes.ayase, 'まだのステージの指揮官まで着任した');
  assert.deepStrictEqual(TF.grantHeroes(st), [], '2回目でも着任した');
  st.cleared = 62;
  assert.deepStrictEqual(TF.grantHeroes(st), ['amagi']);
});
check('指揮官は得意兵種を率いると強くなり、レベルアップで強くなる。それぞれ特徴が違う(攻撃型・耐久型・伸び方・進軍・射程・会心)', () => {
  TF.HEROES.forEach(h => {
    assert(TF.heroMult(1, true, h.id) > TF.heroMult(1, false, h.id), h.id);
    assert(TF.heroMult(10, false, h.id) > TF.heroMult(1, false, h.id), h.id);
    assert(TF.heroTraits(h.id).length >= 2, h.id + ' の特徴が少ない');
  });
  assert.strictEqual(new Set(TF.HEROES.map(h => JSON.stringify(TF.heroTraits(h.id)))).size, TF.HEROES.length, '特徴が同じ指揮官がいる');
  // 攻撃型と耐久型: 同じ兵種・同じレベルでも、攻撃と耐久の比が違う
  const st = TF.newState(0);
  st.heroes = { taka: { lv: 10, exp: 0 }, kuro: { lv: 10, exp: 0 }, hayate: { lv: 10, exp: 0 } };
  const a = TF.squadStats(st, 'inf', 'taka'), d = TF.squadStats(st, 'inf', 'kuro'), n = TF.squadStats(st, 'inf', null);
  assert(a.atk / a.maxHp > n.atk / n.maxHp * 1.2 && d.atk / d.maxHp < n.atk / n.maxHp * 0.8, '攻撃型・耐久型の差がない');
  assert(a.rngB > 0 && a.critB > 0, '射程・会心の特徴が部隊に付かない');
  assert(TF.squadStats(st, 'tank', 'hayate').spd > 1.2, '進軍の速さが部隊に付かない');
  // 進軍が速い指揮官の部隊は早く着く
  const mk = o => Object.assign({ type: 'tank', maxHp: 1e6, atk: 100, cd: 1, hero: null, boss: false, power: 1, lane: 0 }, o);
  const arr = q => TF.createBattle([q], [mk({})], 3, { terrain: TF.flatTerrain() }).U[0].arrT;
  assert(arr(mk({ spd: 1.35 })) < arr(mk({})) * 0.8, '進軍が速くならない');
});
check('固有スキル: 10人それぞれ違うスキル(突撃・装甲・一撃必中・一斉射撃・応急手当・電撃戦・煙幕・鉄壁反撃・爆撃要請・弱点看破)', () => {
  assert.deepStrictEqual(TF.HEROES.map(h => TF.SKILL[h.skill].name), ['突撃', '装甲', '一撃必中', '一斉射撃', '応急手当', '電撃戦', '煙幕', '鉄壁反撃', '爆撃要請', '弱点看破']);
  assert.strictEqual(new Set(TF.HEROES.map(h => h.skill)).size, 10);
  TF.HEROES.forEach(h => { const k = TF.SKILL[h.skill]; assert(k.desc && k.short && k.cd > 0 && k.first > 0, h.skill); });
});
check('新しいスキルの効果: 回復・連射・煙幕・撃ち返し・密集地の爆撃・弱点(どれも指揮官なしの同じ戦闘と比べて効く)', () => {
  const mk = (t, lane, o) => Object.assign({ type: t, maxHp: 20000, atk: 300, cd: 1, hero: null, boss: false, power: 1, lane: lane }, o || {});
  function run(hero) {
    const b = TF.createBattle([mk('inf', 3, { hero }), mk('inf', 2), mk('tank', 4)], [mk('inf', 3), mk('inf', 3), mk('tank', 4), mk('inf', 2)], 11, { record: true });
    b.step(25);
    return b;
  }
  const base = run(null);
  const atks = (b, side) => b.ev.filter(e => e.k === 'atk' && b.U[e.s].side === side);
  const sk = (b) => b.ev.filter(e => e.k === 'skill' && e.s === 0);
  const heal = run('sakura');
  assert(sk(heal).some(e => e.heals && e.heals.length && e.heals.every(h => h.heal > 0)), '応急手当で回復しない');
  assert(atks(run('hayate'), 0).length > atks(base, 0).length * 1.1, '電撃戦で攻撃が速くならない');
  assert(atks(run('kiri'), 1).filter(e => e.miss).length > atks(base, 1).filter(e => e.miss).length * 2, '煙幕で敵の攻撃が外れやすくならない');
  const rf = run('kuro');
  assert(rf.ev.some(e => e.k === 'refl' && e.dmg > 0 && rf.U[e.d].side === 1), '鉄壁反撃で撃ち返さない');
  assert(!base.ev.some(e => e.k === 'refl'));
  const air = sk(run('amagi')).find(e => e.sk === 'air');
  assert(air && air.hits.length >= 2, '爆撃要請がまとめて当たらない');
  const mb = run('ayase'), mkEv = sk(mb).find(e => e.sk === 'mark');
  const foes = mb.U.filter(u => u.side === 1);
  assert(mkEv && mb.U[mkEv.d].atk === Math.max(...foes.map(u => u.atk)), '弱点看破がいちばん強い敵を狙わない');
});
check('ステージは上限なく続く(ステージ5000でも敵・報酬が有限で戦闘できる)', () => {
  [1, 10, 100, 1000, 5000].forEach(s => {
    const i = TF.stageInfo(s);
    assert(i.enemies.length >= 2 && i.enemies.length <= 8);
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
check('拠点: 敵部隊を撃破すると前線が進んで拠点を占領し、増援+1と特殊ユニット1回を得る(両軍とも)。占領は記録どおり', () => {
  const st = TF.newState(0);
  st.bld.hq.lv = 10; st.bld.factory = { lv: 5, slot: 5 };
  const res = TF.battleReserves(st, 50);
  const mk = (t, hp, atk) => ({ type: t, maxHp: hp, atk: atk, cd: 1, hero: null, boss: false, power: 1 });
  // 自軍が強い: 撃破のたびに敵側の拠点を手前から占領
  const strong = [mk('tank', 5000, 400), mk('tank', 5000, 400), mk('tank', 5000, 400)], weak = [1, 2, 3, 4].map(() => mk('inf', 900, 5));
  const a = TF.createBattle(strong, weak, 3, { record: true, reserves: res, posts: true });
  a.step(Infinity);
  const posts = a.ev.filter(x => x.k === 'post');
  assert(posts.length >= 2, '撃破しても占領しない');
  assert.deepStrictEqual(posts.slice(0, 3).map(x => x.i), TF.POST_ORDER.slice(3, 3 + Math.min(3, posts.length)), '前線に近い拠点から順に占領していない');
  assert(posts.every(x => x.side === 0));
  assert.strictEqual(posts[0].kind, TF.POST_KIND[TF.POST_ORDER[3]]);
  const sups = a.ev.filter(x => x.k === 'sup' && x.side === 0);
  assert(sups.length >= 1, '自動で特殊ユニットが発進しない');
  assert(sups[0].t >= posts[0].t + K.supDelay - 1e-9, '占領と同時に発進した');
  assert(a.result().win);
  // 決着した後は占領しない(勝利後の進軍はしない)
  const lastKill = Math.max(...a.ev.filter(x => (x.kill) || (x.hits && x.hits.some(h => h.kill))).map(x => x.t));
  assert(posts.every(x => x.t <= lastKill));
  // 増援の枠が増える
  const b = TF.createBattle(strong, weak, 3, { record: true, reserves: res, posts: true, auto: false });
  const left0 = b.reserveInfo(0).left;
  b.step(Infinity);
  const pi = b.postInfo();
  assert(pi.front > 3, '前線が進んでいない');
  assert(b.reserveInfo(b.time()).left >= left0 + 1, '前線基地の増援が増えない');
  // 手動では、ボタン(support)を押すまで発進しない
  assert(!b.ev.some(x => x.k === 'sup' && x.side === 0), '手動なのに自動で発進した');
  // 逆に自軍がやられると、自軍側の拠点を奪われ、敵が特殊ユニットを使う
  const slow = [mk('tank', 5000, 40), mk('tank', 5000, 40), mk('tank', 5000, 40)];
  const c = TF.createBattle(weak, slow, 3, { record: true, posts: true });
  c.step(Infinity);
  const lost = c.ev.filter(x => x.k === 'post');
  assert(lost.length >= 1 && lost.every(x => x.side === 1), '自軍がやられても拠点を奪われない');
  assert.strictEqual(lost[0].i, TF.POST_ORDER[2]);
  assert(c.ev.some(x => x.k === 'sup' && x.side === 1), '敵が特殊ユニットを使わない');
  // posts なしの戦闘には拠点の影響がない
  const d = TF.createBattle(strong, weak, 3, { record: true });
  d.step(Infinity);
  assert(!d.ev.some(x => x.k === 'post' || x.k === 'sup'));
});
check('拠点: 手動では特殊ユニットをボタンで発進でき、1回使うと減る。少しずつ進めても一括計算と同じ結果', () => {
  const mk = (t, hp, atk) => ({ type: t, maxHp: hp, atk: atk, cd: 1, hero: null, boss: false, power: 1 });
  const strong = [mk('tank', 5000, 300), mk('tank', 5000, 300)], weak = [1, 2, 3, 4, 5].map(() => mk('inf', 700, 5));
  const b = TF.createBattle(strong, weak, 9, { record: true, posts: true, auto: false });
  let tt = 0;
  while (!b.isDone() && !b.postInfo().charges.length && tt < 30) { tt += 0.1; b.step(tt); }
  const ch = b.postInfo().charges;
  assert(ch.length >= 1, '占領しても特殊ユニットが使えない');
  const nSup = b.ev.filter(x => x.k === 'sup').length, nPost = b.ev.filter(x => x.k === 'post').length;
  assert(b.support(ch[0], tt), '発進できない');
  assert.strictEqual(b.ev.filter(x => x.k === 'sup').length, nSup + 1);
  assert(b.ev.some(x => x.k === 'sup' && x.side === 0 && x.kind === ch[0]));
  // 1回使うと減る(発進で撃破して新しく占領した分は増える)
  const gained = b.ev.filter(x => x.k === 'post').slice(nPost).filter(x => x.kind).length;
  assert.strictEqual(b.postInfo().charges.length, ch.length - 1 + gained);
  const have = b.postInfo().charges, missing = ['heli', 'air', 'drone'].find(k => !have.includes(k));
  if (missing && !b.isDone()) assert(!b.support(missing, tt), '持っていない特殊ユニットが発進した');
  // 一括計算と少しずつ進めた場合が同じ
  for (let seed = 1; seed <= 30; seed++) {
    const e = TF.stageInfo(30 + seed % 20).enemies, p = TF.stageInfo(28 + seed % 20).enemies.map(q => Object.assign({}, q, { hero: null }));
    const res = { p: { count: 2, defs: { tank: mk('tank', 800, 60), inf: mk('inf', 600, 40) } }, e: { list: [e[0]] } };
    const full = JSON.stringify(TF.simulate(p, e, seed, true, { reserves: res, posts: true }));
    const s = TF.createBattle(p, e, seed, { record: true, reserves: res, posts: true });
    for (let t2 = 0.016; !s.isDone(); t2 += 0.033) s.step(t2);
    assert.strictEqual(JSON.stringify(s.result()), full, 'seed ' + seed);
  }
});
check('地形: 森林・市街地は歩兵と対戦車兵を守り、戦車は平原で強く湿地・市街地で弱い。丘陵は攻撃が上がり砲兵はさらに強い', () => {
  assert(TF.terrTake('forest', 'inf') < 1 && TF.terrTake('urban', 'at') < 1 && TF.terrTake('urban', 'tank') > 1);
  assert(TF.terrAtk('plain', 'tank') > 1 && TF.terrAtk('marsh', 'tank') < 1 && TF.terrTake('marsh', 'tank') > 1);
  assert(TF.terrAtk('hill', 'art') > TF.terrAtk('hill', 'inf') && TF.terrAtk('hill', 'inf') > 1 && TF.terrTake('hill', 'tank') < 1);
  TF.TERRAIN_KEYS.forEach(k => TF.TYPES.forEach(t => { assert(TF.terrAtk(k, t) > 0.5 && TF.terrAtk(k, t) < 1.6); assert(TF.terrTake(k, t) > 0.5 && TF.terrTake(k, t) < 1.6); }));
  // 戦闘でも効く: 同じ相手に、平原の戦車は湿地の戦車より大きなダメージを与える
  const mk = (t, lane) => ({ type: t, maxHp: 1e6, atk: 100, cd: 1, hero: null, boss: false, power: 1, lane: lane });
  function firstDmg(trP, trE, att, def) {
    const b = TF.createBattle([mk(att, 0)], [mk(def, 0)], 5, { record: true, terrain: TF.flatTerrain(trP, trE) });
    b.step(8);
    return b.ev.find(x => x.k === 'atk' && x.s === 0 && !x.miss).dmg;
  }
  assert(firstDmg('plain', 'plain', 'tank', 'inf') > firstDmg('marsh', 'plain', 'tank', 'inf') * 1.5, '平原と湿地の差がない');
  assert(firstDmg('plain', 'forest', 'tank', 'inf') < firstDmg('plain', 'plain', 'tank', 'inf') * 0.75, '森林で守られない');
});
check('列: 部隊はおもに同じ列の敵を狙い、離れた列への攻撃は弱い。砲兵はどの列にも届く', () => {
  const mk = (t, lane) => ({ type: t, maxHp: 1e7, atk: 100, cd: 1, hero: null, boss: false, power: 1, lane: lane });
  function shots(att) {
    // 離れた列の敵は砲兵(射程が戦場全体なので動かない)
    const b = TF.createBattle([mk(att, 0)], [mk('inf', 0), mk('art', 4)], 7, { record: true });
    b.step(60);
    const a = b.ev.filter(x => x.k === 'atk' && x.s === 0 && !x.miss);
    const near = a.filter(x => x.d === 1), far = a.filter(x => x.d === 2);
    return { near: near.length, far: far.length, nd: near.length ? near[0].dmg : 0, fd: far.length ? far[0].dmg : 0 };
  }
  const inf = shots('inf'), art = shots('art');
  assert(inf.near > inf.far * 10, '同じ列をおもに狙わない ' + JSON.stringify(inf));
  assert(art.far >= 5 && art.far > art.near * 0.15 && inf.far === 0, '砲兵が離れた列を撃たない ' + JSON.stringify(art));
});
check('移動: 地形で進む速さが変わり(戦車は平原で速く湿地でとても遅い)、射撃位置に着くまで撃てない。砲兵は陣地から撃てる。列の移動にも時間がかかる', () => {
  assert(TF.terrMove('plain', 'tank') > 1 && TF.terrMove('marsh', 'tank') < 0.6 && TF.terrMove('forest', 'tank') < TF.terrMove('forest', 'inf'));
  TF.TERRAIN_KEYS.forEach(k => TF.TYPES.forEach(t => assert(TF.terrMove(k, t) >= 0.4 && TF.terrMove(k, t) <= 1.4, k + t)));
  const mk = (t, lane) => ({ type: t, maxHp: 1e6, atk: 100, cd: 1, hero: null, boss: false, power: 1, lane: lane });
  const T = a => TF.flatTerrain(a, 'plain');
  function first(att, tr) {
    const b = TF.createBattle([mk(att, 0)], [mk('inf', 0)], 3, { record: true, terrain: T(tr) });
    b.step(10);
    return { arr: b.U[0].arrT, t: b.ev.find(x => x.k === 'atk' && x.s === 0).t };
  }
  const tp = first('tank', 'plain'), tm = first('tank', 'marsh'), ar = first('art', 'marsh');
  assert(tp.arr > 0.3 && tm.arr > tp.arr * 2, '湿地で遅くならない ' + tp.arr + ' ' + tm.arr);
  assert(tp.t >= tp.arr && tm.t >= tm.arr, '着く前に撃った');
  assert.strictEqual(ar.arr, 0, '砲兵が移動を待った');
  assert.strictEqual(TF.createBattle([mk('tank', 0)], [mk('inf', 0)], 3, {}).U[0].arrT, 0, '地形がないのに移動した');
  // 列の移動: 3列先へは数秒かかり、その間は撃たない
  const m = TF.createBattle([mk('inf', 0)], [mk('inf', 0)], 3, { record: true, auto: false, terrain: T('plain') });
  m.step(5);
  assert(m.setLane(0, 3, 5), '動かせない');
  const lv = m.ev.find(x => x.k === 'lane');
  assert(lv.dur > 2, '列の移動が一瞬 ' + lv.dur);
  m.step(5 + lv.dur + 3);
  assert(!m.ev.some(x => x.k === 'atk' && x.s === 0 && x.t > 5 && x.t < 5 + lv.dur), '移動中に撃った');
  assert(m.ev.some(x => x.k === 'atk' && x.s === 0 && x.t > 5 + lv.dur), '移動のあと撃たない');
});
check('自由配置: 列の間(小数の列)や前後の好きな位置に置ける。前に置くほど早く着き、列の間はとなりの列との中間の狙い方になる', () => {
  const st = TF.newState(0);
  st.bld.hq.lv = 12;
  const f = TF.normalizeForm(st, [{ type: 'inf', hero: null, lane: 2, lx: 2.4, adv: 9 }, { type: 'inf', hero: null, lane: 2, lx: 5, adv: -9 }, { type: 'inf', hero: null, lane: null, lx: 1, adv: 0.5 }]);
  assert.strictEqual(f[0].lx, 2.4); assert.strictEqual(f[0].adv, K.advMax, '前に置ける範囲を超えた');
  assert.strictEqual(f[1].lx, undefined, '列から離れた位置が通った'); assert.strictEqual(f[1].adv, K.advMin);
  assert.strictEqual(f[2].lx, undefined, '列なしで位置が通った');
  const p = TF.prepareBattle(st, [{ type: 'inf', hero: null, lane: 3, lx: 3.3, adv: 0.5 }], 30);
  assert(p.p[0].lane === 3 && p.p[0].lx === 3.3 && p.p[0].adv === 0.5, '出撃の準備で位置が消えた');
  // 前に置くほど早く着く(ふだんの位置ならこれまでどおり)
  const mk = (adv, lx) => ({ type: 'inf', maxHp: 1e6, atk: 100, cd: 1, hero: null, boss: false, power: 1, lane: 0, lx: lx, adv: adv });
  const arr = adv => TF.createBattle([mk(adv)], [mk()], 3, { terrain: TF.flatTerrain() }).U[0].arrT;
  assert(arr(K.advMax) < arr(undefined) && arr(undefined) < arr(K.advMin), '前後の位置で到着が変わらない');
  assert(Math.abs(arr(undefined) - K.app.inf / TF.terrMove('plain', 'inf')) < 1e-9);
  // 狙い方: 列の間は、となりの列との中間
  assert.strictEqual(TF.laneW(K.laneAim, 1), K.laneAim[1]);
  const mid = TF.laneW(K.laneAim, 0.5);
  assert(mid < K.laneAim[0] && mid > K.laneAim[1]);
  function share(lx) {
    const b = TF.createBattle([Object.assign(mk(), { lane: Math.round(lx), lx: lx, maxHp: 1e7 })], [Object.assign(mk(), { lane: 0, maxHp: 1e7 }), Object.assign(mk(), { lane: 1, maxHp: 1e7 })], 9, { record: true });
    b.step(60);
    const a = b.ev.filter(x => x.k === 'atk' && x.s === 0);
    return a.filter(x => x.d === 2).length / a.length;
  }
  const s0 = share(0), s5 = share(0.5), s1 = share(1);
  assert(s0 < 0.4 && s1 > 0.6 && s5 > s0 + 0.15 && s5 < s1 - 0.15, '列の間で狙い方が中間にならない ' + [s0, s5, s1]);
});
check('射程: 歩兵は左右2列・対戦車兵2.5列・戦車3列・砲兵は戦場全体。射程の外の敵は狙わず、射程内に敵がいなければ見えている近い敵のほうへ横に動く(動く間は撃たない)', () => {
  assert(K.rng.inf < K.rng.at && K.rng.at < K.rng.tank && K.rng.art >= K.laneN);
  const mk = (t, lane) => ({ type: t, maxHp: 1e7, atk: 100, cd: 1, hero: null, boss: false, power: 1, lane: lane });
  // 列5の敵は砲兵(自分は動かない)。射程内の敵(列1)が残っている間は、射程の外の列5は撃たない
  let b = TF.createBattle([mk('inf', 0)], [mk('inf', 1), mk('art', 5)], 3, { record: true });
  b.step(30);
  assert(!b.ev.some(e => e.k === 'atk' && e.s === 0 && e.d === 2), '射程の外の敵を撃った');
  // 離れた列の砲兵は、偵察が進んで見えてから近づく
  b = TF.createBattle([mk('inf', 0)], [mk('art', 5)], 3, { record: true, terrain: TF.flatTerrain() });
  b.step(45);
  const mv = b.ev.find(e => e.k === 'lane' && e.s === 0);
  assert(mv && mv.auto && Math.abs(mv.lx - 5) <= K.rng.inf + 1e-9, '射程の外の敵へ近づかない');
  assert(!b.ev.some(e => e.k === 'atk' && e.s === 0 && e.t < mv.t + mv.dur - 1e-9), '動いている間に撃った');
  assert(b.ev.some(e => e.k === 'atk' && e.s === 0 && e.t >= mv.t + mv.dur), '近づいたあとに撃たない');
  // 砲兵は、味方が見つけた敵なら反対の端の列でも撃てる(動かない)
  b = TF.createBattle([mk('art', 0), mk('inf', 6)], [mk('inf', 6)], 3, { record: true, terrain: TF.flatTerrain() });
  b.step(5);
  assert(!b.ev.some(e => e.k === 'lane' && e.s === 0) && b.ev.some(e => e.k === 'atk' && e.s === 0), '砲兵が戦場全体に届かない');
});
check('地形はマップ上の区域: 同じ列でも前後で地形が違い、戦う場所の地形が効く。拠点を取って前線が進むと戦う場所も進む。通り道の地形で進む速さが変わる', () => {
  // 敵側の前線近く(列3)だけに森、自軍の通り道(列1)に湿地がある地図
  const map = { blobs: [
    { k: 'forest', x: 3, y: 0.3, rx: 0.4, ry: 0.25, a1: 0, a2: 0, p1: 0, p2: 0 },
    { k: 'marsh', x: 1, y: -0.4, rx: 0.4, ry: 0.2, a1: 0, a2: 0, p1: 0, p2: 0 }] };
  assert.strictEqual(TF.terrAt(map, 3, 0.3), 'forest'); assert.strictEqual(TF.terrAt(map, 3, -0.3), 'plain'); assert.strictEqual(TF.terrAt(map, 5, 0.3), 'plain');
  assert.strictEqual(TF.fightTerr(map, 1, 'inf', 3), 'forest', '敵は森で戦わない');
  assert.strictEqual(TF.fightTerr(map, 0, 'inf', 3), 'plain');
  assert.strictEqual(TF.fightTerr(map, 0, 'inf', 3, undefined, 5), 'forest', '前線が進んでも自軍が森に入らない');
  assert(TF.arrivalTime(map, 0, 'tank', 1) > TF.arrivalTime(map, 0, 'tank', 5) * 1.5, '湿地を通っても遅くならない');
  const mk = (t, lane) => ({ type: t, maxHp: 1e7, atk: 100, cd: 1, hero: null, boss: false, power: 1, lane: lane });
  function firstDmg(lane) {
    const b = TF.createBattle([mk('inf', lane)], [mk('inf', lane)], 5, { record: true, terrain: map });
    b.step(8);
    return b.ev.find(x => x.k === 'atk' && x.s === 0 && !x.miss).dmg;
  }
  const inForest = firstDmg(3), onPlain = firstDmg(5);
  assert(inForest < onPlain * 0.8, '森にいる敵が守られない ' + inForest + ' ' + onPlain);
});
check('マップの型: ステージごとに地形の並び方が変わる(9ステージで9種類すべて・となりのステージとは違う型)。拠点の場所も毎回違う', () => {
  const keys = Object.keys(TF.LAYOUTS);
  assert(keys.length >= 9);
  for (let b = 0; b < 30; b++) {
    const got = new Set();
    for (let s = 3 + b * keys.length; s < 3 + (b + 1) * keys.length; s++) got.add(TF.stageLayout(s));
    assert.strictEqual(got.size, keys.length, 'ブロック' + b + 'で型がそろわない');
  }
  for (let s = 3; s <= 1000; s++) assert.notStrictEqual(TF.stageLayout(s), TF.stageLayout(s - 1), 'ステージ' + s + 'がとなりと同じ型');
  for (let s = 3; s <= 300; s++) assert.strictEqual(TF.stageInfo(s).terrain.layout, TF.stageLayout(s));
  // 型ごとに地形の形が違う: 市街戦は市街地が多く、横切る帯は同じ地形が横一列、開けた平原は区域が小さい
  const area = T => T.blobs.reduce((a, b) => a + b.rx * b.ry, 0);
  const of = k => { const out = []; for (let s = 3; out.length < 6; s++) if (TF.stageLayout(s) === k) out.push(TF.stageInfo(s).terrain); return out; };
  of('town').forEach(T => assert(T.blobs.filter(b => b.k === 'urban').length >= 4, '市街戦に町が少ない'));
  of('band').forEach(T => { const b0 = T.blobs[0], row = T.blobs.filter(b => b.k === b0.k && Math.abs(b.y - b0.y) < 0.1); assert(row.length >= 5 && Math.max(...row.map(b => b.x)) - Math.min(...row.map(b => b.x)) > 4, '帯になっていない'); });
  of('open').forEach(T => assert(area(T) < Math.min(...of('scatter').map(area)), '開けた平原なのに区域が大きい'));
  // 拠点の場所(見た目)もステージで違う
  const posKey = s => JSON.stringify(TF.stageInfo(s).terrain.posts.map(p => p.x.toFixed(2)));
  assert(new Set([10, 11, 12, 13, 14, 15]
    .map(posKey)).size >= 5, '拠点の場所が毎回同じ');
});
check('ステージ: 地形マップ(森林・市街地・丘陵・湿地の区域)は毎回同じで両軍の側にある。敵は地形に合った列に配置。おまかせ配置は決めた列を変えずに残りを振り分ける', () => {
  assert.strictEqual(K.laneN, 7);
  for (let s = 1; s <= 200; s += 7) {
    const i = TF.stageInfo(s), bl = i.terrain.blobs;
    assert(bl.length >= 6 && bl.length <= 14, 'blobs ' + bl.length);
    bl.forEach(b => assert(TF.TERRAIN[b.k] && b.k !== 'plain', b.k));
    assert(bl.some(b => b.y < 0) && bl.some(b => b.y > 0), '片側にしか地形がない');
    for (let x = 0; x <= 6; x += 1.5) for (let y = -1; y <= 1; y += 0.5) assert(TF.TERRAIN[TF.terrAt(i.terrain, x, y)]);
    i.enemies.forEach(e => assert(e.lane >= 0 && e.lane < 7));
    assert.deepStrictEqual(TF.stageInfo(s).terrain, i.terrain, '同じステージの地形が毎回同じでない');
  }
  const st = TF.newState(0);
  st.bld.hq.lv = 12; st.bld.atpost = { lv: 5, slot: 3 }; st.bld.factory = { lv: 5, slot: 5 };
  const f = TF.normalizeForm(st, []).map((x, k) => Object.assign(x, { lane: k === 0 ? 4 : null }));
  const out = TF.autoLanes(st, f, 30);
  assert.strictEqual(out[0].lane, 4, '決めた列が変わった');
  out.forEach(x => assert(x.lane >= 0 && x.lane < 7));
  assert(new Set(out.map(x => x.lane)).size >= 3, '列に散らばらない');
  assert.strictEqual(TF.normalizeForm(st, [{ type: 'inf', hero: null, lane: null }])[0].lane, null, '列なしが0列になった');
});
check('布陣は見えない: おまかせ配置・配置中の予想勝率は敵の本当の布陣を使わない。敵の布陣もこちらの配置に左右されない', () => {
  const st = TF.newState(0);
  st.bld.hq.lv = 12; st.bld.atpost = { lv: 5, slot: 3 }; st.bld.factory = { lv: 5, slot: 5 };
  const s = 30, info = TF.stageInfo(s), f = TF.normalizeForm(st, []);
  const a = JSON.stringify(TF.autoLanes(st, f, s)), pa = TF.predictBlind(st, f, s, 20).winRate;
  const saved = info.enemies.map(e => e.lane);
  info.enemies.forEach(e => { e.lane = (e.lane + 3) % K.laneN; });
  const b = JSON.stringify(TF.autoLanes(st, f, s)), pb = TF.predictBlind(st, f, s, 20).winRate;
  info.enemies.forEach((e, i) => { e.lane = saved[i]; });
  assert.strictEqual(a, b, 'おまかせ配置が敵の布陣に左右された');
  assert.strictEqual(pa, pb, '配置中の予想勝率が敵の本当の布陣に左右された');
  const p1 = TF.prepareBattle(st, f.map(x => Object.assign({}, x, { lane: 0 })), s), p2 = TF.prepareBattle(st, f.map(x => Object.assign({}, x, { lane: 6 })), s);
  assert.deepStrictEqual(p1.e.map(e => e.lane), p2.e.map(e => e.lane), '敵の布陣がこちらの配置で変わった');
});
check('索敵: 部隊ごとに索敵範囲があり、範囲に入るまで敵味方とも見えない。見えない敵は狙わず、撃つと遠くからでも見つかる', () => {
  // 索敵範囲は兵種ごと(歩兵がいちばん広く、砲兵がいちばん狭い)
  assert(K.det.inf > K.det.at && K.det.at > K.det.tank && K.det.tank > K.det.art && K.det.art > 0);
  const mk = (t, lane, o) => Object.assign({ type: t, maxHp: 1e6, atk: 100, cd: 1, hero: null, boss: false, power: 1, lane: lane }, o || {});
  // 配置の時点では、どこに置いても(いちばん前でも)お互いに見えない
  for (let s = 5; s <= 60; s += 11) {
    const info = TF.stageInfo(s);
    const p = info.enemies.map(e => mk(e.type, e.lane, { lx: e.lane, adv: K.advMax }));
    const b = TF.createBattle(p, info.enemies, 1, { terrain: info.terrain, posts: true });
    assert(b.hasDet(), '索敵が働いていない');
    b.U.forEach(u => assert(!b.seen(1 - u.side, u.id, 0), `ステージ${s}: 配置の時点で見えている`));
  }
  // 砲兵(射程は戦場全体)だけでは、離れた列の敵は見えないので撃たない(どちらの側も)
  const T = TF.flatTerrain();
  let b = TF.createBattle([mk('art', 0)], [mk('inf', 6)], 7, { record: true, terrain: T });
  b.step(2.9);
  assert(!b.seen(0, 1, 2.9) && !b.ev.some(e => e.k === 'atk' && e.s === 0), '見えない敵を撃った');
  assert(!b.seen(1, 0, 2.9) && !b.ev.some(e => e.k === 'atk' && e.s === 1), '敵が見えないはずの部隊を撃った');
  // 同じ列なら近づくと見えて撃ち合いになる
  b = TF.createBattle([mk('inf', 3)], [mk('inf', 3)], 7, { record: true, terrain: T });
  b.step(2.5);
  assert(b.ev.some(e => e.k === 'atk'), '同じ列で近づいても見えない');
  // 歩兵が見つけた敵は、後方の砲兵も撃てる(見え方は味方全体で共有)
  b = TF.createBattle([mk('art', 0), mk('inf', 5)], [mk('inf', 5)], 7, { record: true, terrain: T });
  b.step(2.9);
  assert(b.ev.some(e => e.k === 'atk' && e.s === 0), '味方が見つけた敵を砲兵が撃たない');
  // 撃った部隊は、ふだんの2倍の距離から見つかる(となりの列の敵歩兵からは、撃つ前の砲兵は見えない)
  b = TF.createBattle([mk('art', 0), mk('inf', 1)], [mk('inf', 1)], 7, { record: true, terrain: T });
  let shot = null;
  for (let tt = 0.05; tt < 2.9 && !shot; tt += 0.05) {
    b.step(tt);
    shot = b.ev.find(e => e.k === 'atk' && e.s === 0);
    if (!shot) assert(!b.seen(1, 0, tt), '撃つ前の砲兵が見えている');
  }
  assert(shot && b.seen(1, 0, shot.t + 0.01), '撃った砲兵が見つからない');
  // 長引いても、偵察が進んで最後には見つかる(時間切れにならない)
  b = TF.createBattle([mk('tank', 0, { maxHp: 1000 })], [mk('tank', 4, { maxHp: 800 })], 7, { record: true, terrain: T });
  b.step(Infinity);
  const first = b.ev.find(e => e.k === 'atk');
  assert(first && first.t > K.detT0, '離れた列の敵がすぐ見えた');
  assert(!b.result().timeout, '見つけられずに時間切れ');
});
check('列の移動: 手動のときだけ戦闘中に別の列へ動かせる。地形と列があっても少しずつ進めた結果は一括計算と同じ', () => {
  const st = TF.newState(0);
  st.bld.hq.lv = 12; st.bld.atpost = { lv: 8, slot: 3 }; st.bld.factory = { lv: 8, slot: 5 }; st.bld.barracks.lv = 8;
  const b = TF.prepareBattle(st, TF.autoFormation(st, 30, 4), 30);
  const m = TF.createBattle(b.p, b.e, 4, { record: true, auto: false, terrain: b.terrain, reserves: b.reserves, posts: true });
  m.step(1);
  const to = (b.p[0].lane + 2) % 7;
  assert(m.setLane(0, to, 1), '動かせない');
  assert.strictEqual(m.U[0].lane, to);
  const a = TF.createBattle(b.p, b.e, 4, { record: true, terrain: b.terrain });
  assert(!a.setLane(0, to, 1), 'AUTOなのに動かせた');
  for (let seed = 1; seed <= 20; seed++) {
    const full = JSON.stringify(TF.simulate(b.p, b.e, seed, true, { reserves: b.reserves, posts: true, terrain: b.terrain }));
    const s2 = TF.createBattle(b.p, b.e, seed, { record: true, reserves: b.reserves, posts: true, terrain: b.terrain });
    for (let t2 = 0.016; !s2.isDone(); t2 += 0.033) s2.step(t2);
    assert.strictEqual(JSON.stringify(s2.result()), full, 'seed ' + seed);
  }
});
check('武装: 研究所がないと開発できず、レベル上限は研究所Lv×2。最初の型は設計図で配備、新型(Lv5→6…)には試作部品も要る', () => {
  const st = TF.newState(0);
  st.money = st.steel = 1e9; st.bp = 0;
  st.bld.factory = { lv: 5, slot: 5 };
  assert(!TF.canArm(st, 'tank', 'w').ok && TF.canArm(st, 'tank', 'w').locked, '研究所なしで開発できた');
  assert(!TF.canArm(st, 'art', 'w').ok, '未解放の兵種の武装が開発できた');
  st.bld.lab = { lv: 3, slot: 8 };
  assert.strictEqual(TF.canArm(st, 'tank', 'w').reason, '設計図が不足');
  st.bp = 1000;
  st.parts = { 1: 1 };
  const names = [];
  for (let i = 0; i < 6; i++) { const r = TF.doArm(st, 'tank', 'w'); assert(r.ok, r.reason); names.push(r.name); assert.strictEqual(r.dev, i === 0 || i === 5); }
  assert.strictEqual(TF.armLv(st, 'tank', 'w'), 6);
  assert.strictEqual(names[0], names[4]);
  assert.notStrictEqual(names[4], names[5], '5レベルごとに新型にならない');
  assert.strictEqual(TF.canArm(st, 'tank', 'w').cap, true, '上限(研究所Lv3×2=6)を超えた');
  assert.strictEqual(1000 - st.bp, TF.armCost('tank', 'w', 0).bp + TF.armCost('tank', 'w', 5).bp, '設計図は開発のときだけ減る');
  assert.deepStrictEqual(st.parts, {}, '試作部品が開発で1個ずつ使われていない');
  assert.strictEqual(TF.armCost('tank', 'w', 0).part, 0, '最初の型(配備)は部品なし');
  assert.strictEqual(TF.armCost('tank', 'w', 5).part, 1, '2番目の新型には試作部品Ⅰ');
  st.arms.tank.w = 10; st.bld.lab.lv = 6;
  assert.strictEqual(TF.canArm(st, 'tank', 'w').reason, TF.partName(2) + 'が不足', '試作部品なしで新型を開発できた');
  assert.strictEqual(TF.armCost('tank', 'w', 3).bp, 0);
  const nw = TF.ARMS.tank.w.length;
  assert.strictEqual(TF.armName('tank', 'w', nw * 5), TF.ARMS.tank.w[nw - 1]);
  assert.strictEqual(TF.armName('tank', 'w', nw * 5 + 1), TF.ARMS.tank.w[nw - 1] + '改', '最後の新型の次が「改」にならない');
  assert.strictEqual(TF.armName('tank', 'w', (nw + 2) * 5), TF.ARMS.tank.w[nw - 1] + '改二');
  // 名前は兵種・系統の中で重複しない
  TF.TYPES.forEach(t => TF.ARM_KINDS.forEach(k => assert.strictEqual(new Set(TF.ARMS[t][k]).size, TF.ARMS[t][k].length, t + k)));
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
check('試作部品: n+1番目の新型にはステージ10nのボスの部品(最初の型は部品なし)。初クリアで確定、以降はまれに。ボス以外・敗北では出ない', () => {
  assert.deepStrictEqual([9, 10, 15, 20, 30, 40, 120].map(TF.partGrade), [0, 1, 0, 2, 3, 4, 12]);
  for (let g = 1; g <= 12; g++) TF.partStages(g).forEach(s => assert.strictEqual(TF.partGrade(s), g));
  // 新型の段階と部品の等級が一致する
  for (let l = 0; l < 60; l += 5) assert.strictEqual(TF.armCost('inf', 'w', l).part, TF.armTier(l));
  const st = TF.newState(0);
  st.cleared = 19;
  let r = TF.applyResult(st, 20, true, st.form, 0.99);
  assert.deepStrictEqual(r.part, { g: 2, n: K.partFirst }, '初クリアで確定しない');
  r = TF.applyResult(st, 20, true, st.form, 0.99);
  assert.strictEqual(r.part, null, '確率を外しても出た');
  r = TF.applyResult(st, 20, true, st.form, K.partRate / 2);
  assert.deepStrictEqual(r.part, { g: 2, n: 1 }, 'まれに出ない');
  r = TF.applyResult(st, 20, false, st.form, 0);
  assert.strictEqual(r.part, null, '負けても出た');
  r = TF.applyResult(st, 19, true, st.form, 0);
  assert.strictEqual(r.part, null, 'ボス以外で出た');
  assert.strictEqual(TF.partCount(st, 2), K.partFirst + 1);
  // ドロップ率は乱数どおり
  let n = 0;
  for (let i = 0; i < 1000; i++) if (TF.partDrop(30, false, i / 1000).n) n++;
  assert(Math.abs(n / 1000 - K.partRate) < 0.01);
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
  let battles = 0, seed = 1 + (opt.seedOff || 0), lastClear = 0, stuckMax = 0, stuckAt = 0, timeSum = 0, timeouts = 0, farmMin = 1;
  const perStage = {};
  const cache = new Map();
  let r = 12345 + (opt.seedOff || 0);
  const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
  const key = s => s + '|' + Object.keys(st.bld).map(k => k + st.bld[k].lv).join(',') + '|' + Object.keys(st.heroes).map(k => k + st.heroes[k].lv).join(',') + '|' + JSON.stringify(st.arms);
  const armTrace = {};
  let partFarm = 0;
  let want = null, partWish = 0;
  const roll = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
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
          const partOk = !cost.part || TF.partCount(st, cost.part) > 0;
          cands.push({ id: 'arm', t, k, delta, cost, bpOk: (st.bp || 0) >= cost.bp && partOk, partOk });
        }
        const lab = cands.find(c => c.id === 'lab');
        if (lab) lab.delta += armCap;
      }
      const hq = TF.lv(st, 'hq');
      let dh = TF.slotsFor(hq + 1) > TF.slotsFor(hq) ? avgP : 0;
      for (const id of ['barracks', 'atpost', 'factory', 'artpost', 'lab']) { const c = TF.lv(st, id); if (c > 0 && c >= TF.maxLevel(st, id)) dh += deltaOf[id]; }
      for (const id of TF.BLD_ORDER) if (TF.BLD[id].req === hq + 1 && id !== 'supply' && id !== 'steel') dh += avgP * 0.5;
      if (dh > 0) cands.push({ id: 'hq', delta: dh });
      // 試作部品は集めるのに手間がかかる(平均 1/ドロップ率 回のボス戦)ので、その分の稼ぎを費用に含めて比べる
      const rwNow = TF.stageInfo(Math.max(1, st.cleared)).reward, partEq = (opt.partEqMul === undefined ? 0.3 : opt.partEqMul) * (rwNow.m + rwNow.s * STEEL_PRICE) / K.partRate;
      cands.forEach(c => {
        if (c.id !== 'arm') c.cost = TF.upgradeCost(c.id, TF.lv(st, c.id));
        c.ratio = c.delta / (c.cost.m + c.cost.s * STEEL_PRICE + (c.cost.part ? partEq : 0));
        c.afford = st.money >= c.cost.m && st.steel >= c.cost.s && c.bpOk !== false;
      });
      cands.sort((a, b) => b.ratio - a.ratio);
      // 試作部品だけが足りない開発(資金・設計図は足りている)が一番の候補なら、その等級の部品を狙う
      const mine = cands.filter(c => opt.strategy !== 'mono' || ['factory', 'lab', 'hq'].includes(c.id) || (c.id === 'arm' && c.t === 'tank'));
      const blocked = mine.find(c => c.id === 'arm' && !c.partOk && st.money >= c.cost.m && st.steel >= c.cost.s && (st.bp || 0) >= c.cost.bp);
      partWish = blocked && mine.length && blocked.ratio >= mine[0].ratio * (opt.partFarmMin === undefined ? 1 : opt.partFarmMin) ? blocked.cost.part : 0;
      let pick = null;
      if (opt.strategy === 'random') {
        // 欲しい強化をランダムに決め、買えるまで貯める
        const same = c => want && c.id === want.id && c.t === want.t && c.k === want.k;
        if (!cands.some(same) || (want && want.partOk === false)) {
          // 基地の画面と兵器の画面を気まぐれに見て、その画面の強化から選ぶ
          const arm = cands.filter(c => c.id === 'arm'), bld = cands.filter(c => c.id !== 'arm');
          const armOk = arm.filter(c => c.partOk);
          const pool = armOk.length && (!bld.length || rnd() < 0.5) ? armOk : bld;
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
      // 開発したいのに試作部品が足りなければ、その等級のボス戦で部品を狙う(十分勝てるとき)
      if (partWish && !opt.noPartFarm) {
        for (const s of TF.partStages(partWish)) {
          if (s > st.cleared) continue;
          const gg = getForm(s);
          if (gg.wr >= (opt.partFarmWr || 0.6)) { stage = s; form = gg.f; partFarm++; break; }
        }
      }
      farmMin = Math.min(farmMin, getForm(stage).wr);
    }
    st.form = form;
    const b = TF.prepareBattle(st, form, stage);
    const res = TF.simulate(b.p, b.e, seed++, false, { reserves: b.reserves, posts: b.posts, terrain: b.terrain });
    const sum = TF.applyResult(st, stage, res.win, b.form, roll());
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
  return { st, battles, perStage, stuckMax, stuckAt, hours: now / 3600e3, avgTime: timeSum / battles, timeouts, farmMin, armTrace, partFarm };
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
  console.log('    武装: ' + TF.TYPES.filter(t => TF.typeUnlocked(res.st, t)).map(t => TF.UNIT[t].name + ' ' + TF.ARM_KINDS.map(k => TF.armLv(res.st, t, k)).join('/')).join('  ') + ` (武器/防護/特殊のLv) 設計図の残り ${res.st.bp} / 部品集めのボス戦 ${res.partFarm}回 / 部品の残り ${JSON.stringify(res.st.parts)}`);
}

const TARGET = +process.env.STAGES || 120;
console.log(`\n[自動プレイ] ステージ${TARGET}まで(プレイヤーの方針を変えて4通り)`);
const t0 = Date.now();

const greedy = playthrough({ target: TARGET, maxBattles: 20000 });
report('堅実なプレイヤー(相性を見て強化)', greedy);
// 気まぐれなプレイヤーは、乱数しだいで買う強化が大きく変わる(詰まり方も乱数で大きく違う)ので、3通りの乱数で調べる
const randoms = [0, 1, 2].map(k => playthrough({ target: TARGET, maxBattles: 20000, strategy: 'random', seedOff: k }));
randoms.forEach((r, k) => report('気まぐれなプレイヤー(欲しい強化をランダムに決めて貯める)・乱数' + (k + 1), r));
const random = randoms[0];
const randomStuck = randoms.map(r => r.stuckMax).sort((a, b) => a - b);
const mono = playthrough({ target: Math.min(TARGET, 100), maxBattles: 20000, strategy: 'mono' });
report('戦車ひと筋のプレイヤー(相性を無視)', mono);
const idle = playthrough({ target: Math.min(TARGET, 80), maxBattles: 20000, production: true, sessionBattles: 30, idleMs: 4 * 3600e3 });
const active80 = playthrough({ target: Math.min(TARGET, 80), maxBattles: 20000 });
report('放置派(30戦ごとに4時間放置・生産施設あり)', idle);

console.log('\n[判定]');
check('どの方針でも目標ステージに到達する(永久に詰まらない)', () => {
  [greedy].concat(randoms).forEach(r => assert.strictEqual(r.st.cleared, TARGET));
  assert.strictEqual(mono.st.cleared, Math.min(TARGET, 100));
  assert.strictEqual(idle.st.cleared, Math.min(TARGET, 80));
});
check('序盤(ステージ1〜10)は合計30戦以内で進める', () => {
  let n = 0; for (let s = 1; s <= 10; s++) n += greedy.perStage[s];
  assert(n <= 30, `${n}戦`);
});
check('詰まっても前のステージで稼げば進める: 最大の詰まりが 堅実40戦/気まぐれ60戦(3通りの中央値。どの乱数でも120戦)/相性無視150戦 以内', () => {
  assert(greedy.stuckMax <= 40, `堅実 ${greedy.stuckMax}`);
  assert(randomStuck[1] <= 60 && randomStuck[2] <= 120, `気まぐれ ${randomStuck.join('/')}`);
  assert(mono.stuckMax <= 150, `相性無視 ${mono.stuckMax}`);
});
check('稼ぎに使うステージは十分勝てる(予想勝率40%以上)', () => {
  [greedy, mono, idle].concat(randoms).forEach(r => assert(r.farmMin >= 0.4, r.farmMin));
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
  [greedy, mono].concat(randoms).forEach(r => assert(r.timeouts / r.battles < 0.01));
});

console.log(`\n(${((Date.now() - t0) / 1000).toFixed(0)}秒)`);
if (failures) { console.log(`\n${failures}件の失敗`); process.exit(1); }
console.log('\nすべて合格');
