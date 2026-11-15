// 試作②『朱線』と試作③『冬将軍』のテスト(ルールの手ざわり + iPhone 画面)
//   python3 -I proto/build.py shusen && python3 -I proto/build.py fuyu && node tests/proto.test.js
'use strict';
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');
const SH = require('../proto/shusen/logic.js');
const FY = require('../proto/fuyu/logic.js');

let failures = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✔ ' + name); }
  catch (e) { failures++; console.log('  ✘ ' + name + '\n    ' + (e && e.stack || e)); }
}
const url = name => 'file://' + path.resolve(__dirname, '..', 'proto', name, 'index.html');

async function withPage(device, file, fn) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices[device] });
  const external = [], errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    const ok = u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:');
    if (!ok) external.push(u);
    return ok ? route.continue() : route.abort();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(url(file));
    await fn(page);
    assert.deepStrictEqual(external, [], '外部への通信: ' + external.join(', '));
    assert.deepStrictEqual(errors, [], 'エラー: ' + errors.join(' / '));
  } finally { await browser.close(); }
}
async function noSideScroll(page) {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  assert.ok(w[0] <= w[1], '横にはみ出している ' + w.join(' > '));
}

(async () => {
  console.log('[朱線] ルール');
  await test('何もしないと勝てず、相性を見て送ると でたらめより勝てる', () => {
    let none = 0, rnd = 0, aff = 0;
    for (let i = 0; i < 24; i++) {
      const seed = 500 + i * 7919, base = { seed, comp: [SH.COMPS.even.comp, SH.COMPS.even.comp], field: SH.makeField(seed, null), skill: ['barrage', 'barrage'], style: 'plain', eRate: 1 };
      if (SH.simulate(Object.assign({}, base, { ai: ['none', 'normal'] })).win) none++;
      if (SH.simulate(Object.assign({}, base, { ai: ['random', 'normal'] })).win) rnd++;
      if (SH.simulate(Object.assign({}, base, { ai: ['affinity', 'normal'] })).win) aff++;
    }
    assert.strictEqual(none, 0, '何もしないで勝てた ' + none);
    assert.ok(aff > rnd, `相性 ${aff} <= でたらめ ${rnd}`);
  });
  await test('戦区は10個あり、どれも決着がつく', () => {
    for (let n = 1; n <= 10; n++) {
      const g = SH.stage(n);
      const r = SH.simulate({ seed: 9 + n, comp: [SH.COMPS.even.comp, g.eComp], field: g.field, skill: ['barrage', g.eSkill], eRate: g.eRate, ai: ['affinity', g.ai], style: g.ecmd.style });
      assert.ok(r.time > 0 && r.time <= SH.K.time + 0.1, '戦区' + n + ' の長さ ' + r.time);
    }
  });

  console.log('[冬将軍] ルール');
  await test('何もしない・とにかく前へ は勝てず、補給を考えると勝てる', () => {
    let none = 0, fwd = 0, smart = 0;
    for (let i = 0; i < 20; i++) {
      const o = { seed: 301 + i * 7919 };
      if (FY.simulate(o, 'none').winner === 0) none++;
      if (FY.simulate(o, 'forward').winner === 0) fwd++;
      if (FY.simulate(o, 'smart').winner === 0) smart++;
    }
    assert.strictEqual(none, 0, '何もしないで勝てた');
    assert.ok(fwd <= 4, 'とにかく前へ で ' + fwd + '/20 勝てた');
    assert.ok(smart >= 8, '補給を考えて ' + smart + '/20 しか勝てない');
  });
  await test('補給が切れた軍団は毎手番 兵力が減る', () => {
    const S = FY.create({ seed: 77 });
    FY.chooseObjective(S, S.objOpts[0]);
    // 自軍の歩兵を、自国とつながっていない中立のマスに置く
    const u = S.units.find(x => x.s === 0);
    let far = -1;
    for (let i = 0; i < FY.NH; i++) if (S.land[i] && S.own[i] === -1 && !FY.unitAt(S, i) && FY.hexDist(i, FY.CAPS[0]) >= 4) { far = i; break; }
    assert.ok(far >= 0);
    S.own[far] = 0; u.at = far;
    const before = u.str;
    S.orders = []; FY.advance(S);
    const now = S.units.find(x => x.id === u.id);
    assert.ok(!now || now.str <= before - FY.K.starve + FY.K.regen, `兵力 ${before} → ${now && now.str}`);
  });
  await test('手番は3時間に1つ、最大8までたまる(試遊モードでないとき)', () => {
    const t0 = 1e12, S = FY.create({ seed: 5, now: t0, trial: false });
    S.store = 0;
    assert.strictEqual(FY.accrue(S, t0 + 2.9 * 3600e3), 0);
    assert.strictEqual(FY.accrue(S, t0 + 3.1 * 3600e3), 1);
    assert.strictEqual(FY.accrue(S, t0 + 100 * 3600e3), FY.K.maxStore - 1);
    assert.strictEqual(S.store, FY.K.maxStore);
  });

  for (const dev of ['iPhone 16 Pro Max', 'iPhone 13', 'iPhone SE']) {
    console.log(`[朱線] 画面 ${dev}`);
    await test('遊び方 → 地図 → 出撃 → 戦って結果が出る / 星が残る', () => withPage(dev, 'shusen', async page => {
      await page.waitForSelector('#modalWrap:not(.hidden)');
      await page.click('[data-act="closem"]');
      await noSideScroll(page);
      await page.click('.node.cur');
      await page.click('[data-act="go"]');
      await page.waitForFunction(() => window.__shusen.B && !window.__shusen.B.paused);
      // 列をタップして部隊を送る
      const box = await page.locator('#cv').boundingBox();
      await page.waitForTimeout(2600);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.7);
      await page.waitForFunction(() => window.__shusen.B.S.st.taps[0] >= 1 || window.__shusen.B.S.units.some(u => u.s === 0));
      await page.evaluate(() => { window.__shusen.auto('look'); window.__shusen.play(200); });
      await page.waitForSelector('#modalWrap:not(.hidden) .res', { timeout: 10000 });
      const st = await page.evaluate(() => JSON.parse(localStorage.getItem('shusen-proto-v1')));
      assert.ok(st && st.v === 1 && st.battle === null, '戦いのあとに保存が残っていない');
    }));
    console.log(`[冬将軍] 画面 ${dev}`);
    await test('遊び方 → 季節の目標 → 軍団に命令 → 進める → 開きなおしても続き', () => withPage(dev, 'fuyu', async page => {
      await page.waitForSelector('#modalWrap:not(.hidden) .help');
      await page.click('[data-act="closem"]');
      await page.waitForSelector('#modalWrap:not(.hidden) .season');
      await page.click('[data-act="obj"]');
      await noSideScroll(page);
      // 自軍の戦車をタップ → 光るマスをタップ → 命令する
      const pick = await page.evaluate(() => {
        const w = window.__fuyu, S = w.S, u = S.units.find(x => x.s === 0 && x.type === 'tank');
        const ks = Object.keys(w.FY.moves(S, u)).map(Number), to = ks.find(k => S.own[k] !== 0) ?? ks[0];
        return { from: w.hexXY(u.at), to: w.hexXY(to) };
      });
      const box = await page.locator('#cv').boundingBox();
      await page.touchscreen.tap(box.x + pick.from[0], box.y + pick.from[1]);
      await page.waitForSelector('#card:not(.hidden)');
      await page.touchscreen.tap(box.x + pick.to[0], box.y + pick.to[1]);
      if (await page.$('[data-act="confirm"]')) await page.click('[data-act="confirm"]');
      assert.strictEqual(await page.evaluate(() => window.__fuyu.S.orders.length), 1, '命令が入っていない');
      await page.click('#btnGo');
      await page.waitForTimeout(1300);
      const t = await page.evaluate(() => window.__fuyu.S.turn);
      assert.strictEqual(t, 1);
      await page.reload();
      await page.waitForFunction(() => window.__fuyu && window.__fuyu.S);
      assert.strictEqual(await page.evaluate(() => window.__fuyu.S.turn), 1, '開きなおすと続きにならない');
      // 冬まで進めても壊れない
      await page.evaluate(() => {
        const w = window.__fuyu;
        for (let k = 0; k < 40 && !w.S.done && !w.FY.winter(w.S); k++) { if (w.S.seasonStart) w.FY.chooseObjective(w.S, w.S.objOpts[0]); w.FY.playerAI(w.S, 'smart'); w.FY.advance(w.S); }
        w.render();
      });
      await page.waitForTimeout(200);
      const win = await page.evaluate(() => window.__fuyu.S.done || window.__fuyu.FY.winter(window.__fuyu.S));
      assert.ok(win);
    }));
  }

  console.log(failures ? `\n${failures} 件 失敗` : '\nすべて合格');
  process.exit(failures ? 1 : 0);
})();
