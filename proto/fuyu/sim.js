// 冬将軍(試作)の面白さの数字を測る(画面なし)。企画書の「作る前の合格表」
//   node proto/fuyu/sim.js          … 各200戦役(N=… で変えられる)
'use strict';
const FY = require('./logic.js');
const N = +process.env.N || 200;
if (process.env.OV) Object.assign(FY.K, JSON.parse(process.env.OV));
function run(kind) {
  const o = { n: 0, win: 0, lose: 0, turns: [], winTurns: [], pockets: 0, pocketsLost: 0, setbacks: 0, atk: [[0, 0], [0, 0], [0, 0], [0, 0]], after60: [], falls: 0 };
  for (let i = 0; i < N; i++) {
    const S = FY.simulate({ seed: 101 + i * 7919 }, kind);
    o.n++;
    if (S.winner === 0) { o.win++; o.winTurns.push(S.turn); if (S.st.at60 !== null) o.after60.push((S.turn - S.st.at60) / S.turn); }
    if (S.winner === 1) o.lose++;
    o.turns.push(S.turn);
    o.pockets += S.st.pockets; o.pocketsLost += S.st.pocketsLost; o.falls += S.st.falls.length;
    for (let k = 0; k < 4; k++) { o.atk[k][0] += S.st.attacks[k][0]; o.atk[k][1] += S.st.attacks[k][1]; }
    // 押し返された季節(季節のあいだに自国のマスが2つ以上減った)
    const h = S.st.hexHist;
    for (let t = 8; t < h.length; t += 8) if (h[t] - h[t - 8] <= -2) o.setbacks++;
  }
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : NaN; };
  o.med = med(o.turns); o.medWin = med(o.winTurns); o.after60m = o.after60.length ? o.after60.reduce((a, b) => a + b, 0) / o.after60.length : NaN;
  return o;
}
const pct = x => (x * 100).toFixed(0) + '%';
const t0 = Date.now(), R = {};
let fails = 0;
console.log(`[冬将軍] 4種類のプレイヤーで各${N}戦役`);
for (const [k, label, lo, hi] of [['none', '何もしない', 0, 0], ['forward', 'とにかく前へ', 0, 0.2], ['defend', 'ひたすら守る', 0, 0.2], ['smart', '補給を考える', 0.6, 0.75]]) {
  const r = R[k] = run(k), w = r.win / r.n, ok = w >= lo - 1e-9 && w <= hi + 1e-9;
  if (!ok) fails++;
  console.log(`  ${ok ? '✔' : '✘'} ${label.padEnd(8, '　')} 勝率 ${pct(w).padStart(4)} (目標 ${pct(lo)}〜${pct(hi)}) | 首都を落とされた ${pct(r.lose / r.n)} 長さ中央 ${r.med}手番 包囲で消した${(r.pockets / r.n).toFixed(1)}/消された${(r.pocketsLost / r.n).toFixed(1)} 落とした国 ${(r.falls / r.n).toFixed(1)}`);
}
const sm = R.smart, a = sm.atk, sr = k => a[k][0] ? a[k][1] / a[k][0] : 0;
const lines = [
  ['「補給を考える」と上の2つの差', sm.win / N - Math.max(R.forward.win, R.defend.win) / N, x => x >= 0.4, '40ポイント以上', 'p'],
  ['勝った戦役の長さ(中央値)', sm.medWin, x => x >= 60 && x <= 90, '60〜90手番(8〜11日)', 'n'],
  ['押し返された季節(1戦役あたり)', sm.setbacks / N, x => x >= 1, '1回以上(逆転・ピンチがある)', 'n'],
  ['包囲で消した・消された(1戦役あたり合計)', (sm.pockets + sm.pocketsLost) / N, x => x >= 3, '3回以上', 'n'],
  ['冬の攻撃の成功率(夏との差)', sr(1) - sr(3), x => x >= 0.2 && x <= 0.3, '夏より20〜30ポイント低い', 'p'],
  ['冬の攻撃の回数(夏に対して)', a[1][0] ? a[3][0] / a[1][0] : 0, x => x <= 0.6, '6割以下(冬は攻めを控える)', 'p'],
  ['マスの6割を取ってから勝つまで(勝った戦役の長さに対して)', sm.after60m, x => !(x > 0.25), '4分の1以下', 'p']
];
for (const [label, v, f, goal, fm] of lines) {
  const ok = f(v); if (!ok) fails++;
  console.log(`  ${ok ? '✔' : '✘'} ${label}: ${fm === 'p' ? pct(v) : (+v).toFixed(1)} (目標 ${goal})`);
}
console.log(`  (季節ごとの攻撃の成功率 春${pct(sr(0))} 夏${pct(sr(1))} 秋${pct(sr(2))} 冬${pct(sr(3))} / 攻撃の回数 ${a.map(x => x[0]).join('・')})  ${((Date.now() - t0) / 1000).toFixed(0)}秒`);
console.log(fails ? `${fails}件が目標の外` : 'すべて目標の内');
