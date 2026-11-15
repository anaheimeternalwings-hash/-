// 朱線(試作)の面白さの数字を測る(画面なし)。企画書の「作る前の合格表」
//   node proto/shusen/sim.js          … 各1000戦(N=… で変えられる)
'use strict';
const SH = require('./logic.js');
const N = +process.env.N || 1000;
const STYLES = ['plain', 'rush', 'wall', 'edge', 'town'];
const SK = ['barrage', 'rush', 'hold'];
// 先読みは重いので、数を減らして測る
function runN(kind, o = {}) { return run(kind, Object.assign({ n: Math.min(N, +process.env.NL || 120) }, o)); }
function run(kind, o = {}) {
  const NN = o.n || N;
  const out = { n: 0, win: 0, timeEnds: 0, time: [], lead: 0, col: 0, colP: 0, colE: 0, close: 0, short: 0, taps: 0, behind: 0, comeback: 0, breach: 0, retreats: 0, overflow: 0 };
  for (let i = 0; i < NN; i++) {
    const seed = 1000 + i * 7919, sk = SK[i % 3];
    const r = SH.simulate({ seed, comp: [SH.COMPS.even.comp, SH.COMPS.even.comp], field: SH.makeField(seed, i % 3 === 0 ? 'river' : i % 3 === 1 ? 'hills' : null),
      skill: [sk, sk], ai: [kind, o.enemy || 'normal'], style: STYLES[i % STYLES.length], eRate: o.eRate || 1, noRetreat: o.noRetreat ? [true, false] : null });
    out.n++; if (r.win) out.win++;
    out.time.push(r.time);
    out.lead += r.st.leadChanges;
    out.colP += r.st.collapses[0]; out.colE += r.st.collapses[1];
    if (r.why === 'time') { out.timeEnds++; if (Math.abs(r.cells[0] - r.cells[1]) <= 5) out.close++; }
    if (r.time <= 40) out.short++;
    if (r.why === 'breach') out.breach++;
    out.taps += r.st.taps[0];
    out.retreats += r.st.retreats[0];
    out.overflow += (r.st.overflow || [0, 0])[0];
    if (r.st.behindAt45 === -1) { out.behind++; if (r.win) out.comeback++; }
  }
  out.time.sort((a, b) => a - b);
  return out;
}
const pct = x => (x * 100).toFixed(0) + '%';
const kinds = [['none', '何もしない', [0, 0]], ['random', 'でたらめに送る', [0, 0.15]], ['one', '1列だけに集める', [0, 0.3]], ['affinity', '相性だけ見る', [0.45, 0.6]], ['look', '先を読む(後退・挟み撃ち)', [0.75, 0.9]]];
const t0 = Date.now(), res = {};
console.log(`[朱線] 同じ強さの敵(標準の頭)と各${N}戦`);
let fails = 0;
for (const [k, label, [lo, hi]] of kinds) {
  const r = res[k] = /^look/.test(k) ? runN(k) : run(k), w = r.win / r.n, ok = w >= lo - 1e-9 && w <= hi + 1e-9;
  if (!ok) fails++;
  console.log(`  ${ok ? '✔' : '✘'} ${label.padEnd(12, '　')} 勝率 ${pct(w).padStart(4)} (目標 ${pct(lo)}〜${pct(hi)}) | 長さ中央 ${r.time[r.n >> 1].toFixed(0)}秒 入れ替わり ${(r.lead / r.n).toFixed(1)} 総崩れ 起こした${(r.colE / r.n).toFixed(1)}/された${(r.colP / r.n).toFixed(1)} 突破 ${pct(r.breach / r.n)} タップ ${(r.taps / r.n).toFixed(0)} 後退 ${(r.retreats / r.n).toFixed(1)} あふれ ${(r.overflow / r.n).toFixed(1)}`);
}
const nr = runN('lookNR'), sk = res.look, af = res.affinity;
// 強い敵(部隊が15%速く届く・先の手が良い)を相手に、後退ありとなしを比べる(同じ強さだと勝率が上限に張りつくので)
const skH = runN('look', { eRate: 0.85, enemy: 'hard' }), nrH = runN('lookNR', { eRate: 0.85, enemy: 'hard' }), afH = run('affinity', { eRate: 0.85, enemy: 'hard' });
const lines = [
  ['後退を使う/使わないの差(先を読む人・強い敵)', skH.win / skH.n - nrH.win / nrH.n, x => x >= 0.1, '10ポイント以上'],
  ['1戦の長さ(相性だけ・中央値)', af.time[af.n >> 1], x => x >= 70 && x <= 90.5, '70〜90秒'],
  ['40秒以内の決着(相性だけ)', af.short / af.n, x => x <= 0.05, '5%以下'],
  ['優勢の入れ替わり(相性だけ・1戦平均)', af.lead / af.n, x => x >= 2, '2回以上'],
  ['45秒で負けていた側の勝ち(相性だけ)', af.behind ? af.comeback / af.behind : 0, x => x >= 0.2 && x <= 0.35, '20〜35%'],
  ['総崩れ(相性だけ・1戦あたり両軍合計)', (af.colP + af.colE) / af.n, x => x >= 1 && x <= 3, '1〜3回'],
  ['5段差以内の決着(相性だけ・時間切れのうち)', af.close / Math.max(1, af.timeEnds), x => x >= 0.4, '4割以上'],
  ['タップ回数(相性だけ・1戦)', af.taps / af.n, x => x >= 35 && x <= 50, '35〜50回']
];
for (const [label, v, f, goal] of lines) {
  const ok = f(v); if (!ok) fails++;
  console.log(`  ${ok ? '✔' : '✘'} ${label}: ${v < 1.5 && v > -1.5 && !/長さ|回数|入れ替わり|総崩れ/.test(label) ? pct(v) : v.toFixed(1)} (目標 ${goal})`);
}
console.log(`  (同じ強さ: 後退なしで先を読む人 ${pct(nr.win / nr.n)} / 強い敵: 先を読む人 ${pct(skH.win / skH.n)}・後退なし ${pct(nrH.win / nrH.n)}・相性だけ ${pct(afH.win / afH.n)})  ${((Date.now() - t0) / 1000).toFixed(0)}秒`);
console.log(fails ? `${fails}件が目標の外` : 'すべて目標の内');
