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
  await test('手番の知らせ: 取った・取られたマスは、どれもその手番の知らせのどこかで説明される', () => {
    let changed = 0, lines = 0;
    for (let g = 0; g < 8; g++) {
      const S = FY.create({ seed: 4242 + g * 7919 });
      for (let t = 0; t < 120 && !S.done; t++) {
        FY.playerAI(S, 'smart');
        const rec = []; FY.advance(S, rec);
        const R = FY.report(S, rec), cov = new Set();
        R.steps.forEach(st => st.lines.forEach(l => { lines++; assert.ok(l.t && ['good', 'bad', 'crit', 'big', 'info'].includes(l.tone), '知らせの形: ' + JSON.stringify(l)); l.ats.forEach(a => cov.add(a)); }));
        for (const h of R.gained.concat(R.lost)) { changed++; assert.ok(cov.has(h), `${S.turn}手番: ${FY.place(S, h)} の変化が知らせにない`); }
        // 取られたマスの知らせは「わるい」「痛手」のどちらか
        for (const h of R.lost) assert.ok(R.steps.some(st => st.lines.some(l => l.ats.includes(h) && (l.tone === 'bad' || l.tone === 'crit'))), '取られたマスがよい知らせになっている');
      }
    }
    assert.ok(changed > 300 && lines > 500, `調べた数が少ない(${changed}マス・${lines}行)`);
  });
  await test('再生の区切り: 自分の命令ごと → 敵の国ごと → 手番のおわり の順で、最後の地図は手番のあとと同じ', () => {
    const S = FY.create({ seed: 99 });
    for (let t = 0; t < 30 && !S.done; t++) {
      FY.playerAI(S, 'smart');
      const n = S.orders.length, rec = []; FY.advance(S, rec);
      const who = rec.map(r => r.who);
      assert.strictEqual(who[0], 'start'); assert.strictEqual(who[who.length - 1], 'end');
      assert.deepStrictEqual(who.slice(1, 1 + n), new Array(n).fill(0));
      const nat = who.slice(1 + n, -1); assert.deepStrictEqual(nat, nat.slice().sort());
      assert.deepStrictEqual(rec[rec.length - 1].snap.own, S.own);
    }
  });
  await test('「1つも失わない」目標は、マスを取られたその手番に失敗が知らされる', () => {
    let seen = 0;
    for (let g = 0; g < 30 && seen < 3; g++) {
      const S = FY.create({ seed: 31 + g * 101 });
      FY.chooseObjective(S, 'hold');
      for (let t = 0; t < 8 && !S.done; t++) {
        const before = S.st.lostHexes, rec = [];
        FY.advance(S, rec);
        if (S.st.lostHexes > before) {
          const R = FY.report(S, rec);
          assert.ok(R.steps.some(st => st.lines.some(l => /失敗/.test(l.t))), '失敗の知らせがない');
          seen++; break;
        }
        if (S.seasonStart) break;
      }
    }
    assert.ok(seen >= 1, '取られる場面が作れなかった');
  });
  await test('細かい不具合: 軍団は3つで始まる / 最初の季節に3国のねらいが同じマスにならない / 冬の説明が数字と合う', () => {
    for (let g = 0; g < 200; g++) {
      const S = FY.create({ seed: 101 + g * 7919 });
      assert.strictEqual(FY.unitsOf(S, 0).length, 3, '種 ' + (101 + g * 7919) + ' で軍団が ' + FY.unitsOf(S, 0).length);
      assert.ok(new Set(S.intents.map(i => i.shown)).size > 1, '3国のねらいが同じマス');
    }
    assert.ok(FY.SEASONS[3].desc.includes('-' + Math.round((1 - FY.K.winterAtk) * 100) + '%'), '冬の説明: ' + FY.SEASONS[3].desc);
  });
  await test('退路: 退路のない敵の軍団に勝つと全滅、退路があれば退く', () => {
    let pocket = 0, push = 0;
    for (let g = 0; g < 20; g++) {
      const S = FY.create({ seed: 7 + g * 313 });
      for (let t = 0; t < 60 && !S.done; t++) {
        // 攻める前に退路の数を記録して、結果と見くらべる
        FY.playerAI(S, 'smart');
        const plan = S.orders.filter(o => o.k === 'move').map(o => { const d = FY.unitAt(S, o.to); return d && d.s > 0 ? { to: o.to, id: d.id } : null; }).filter(Boolean);
        const rt = {}; plan.forEach(p => { rt[p.id] = FY.retreats(S, FY.unitAt(S, p.to)).length; });
        const rec = []; FY.advance(S, rec);
        rec.forEach(r => r.ev.forEach(e => {
          if (e.k !== 'fight' || e.s !== 0 || !e.dId || e.res !== 'win' || rt[e.dId] === undefined) return;
          if (e.out === 'pocket') pocket++;
          if (e.out === 'push') { push++; assert.ok(rt[e.dId] > 0, '退路0なのに退いた'); }
        }));
      }
    }
    assert.ok(pocket > 0 && push > 0, `包囲${pocket} 退いた${push}`);
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
      const z = await page.evaluate(() => window.__shusen.size());
      assert.ok(Math.abs(z.CW - z.cssW) <= 1 && Math.abs(z.CH - z.cssH) <= 1, '盤の大きさがずれている ' + JSON.stringify(z));
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
      // 描いた地図と画面の上の地図の大きさが合っている(下の欄の高さが変わっても、すぐ合わせなおす)
      const fit = async () => { const z = await page.evaluate(() => window.__fuyu.size()); assert.ok(Math.abs(z.CW - z.cssW) <= 1 && Math.abs(z.CH - z.cssH) <= 1, '地図の大きさがずれている ' + JSON.stringify(z)); };
      await fit();
      await page.evaluate(() => { document.getElementById('orders').style.minHeight = '120px'; });
      await page.waitForTimeout(150); await fit();
      await page.evaluate(() => { document.getElementById('orders').style.minHeight = ''; });
      await page.waitForTimeout(150); await fit();
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
      // 命令1から順に再生され、上に出来事が出る
      await page.waitForSelector('#cap:not(.hidden)');
      assert.ok(/命令1/.test(await page.textContent('#cap')), '再生の見出しがない');
      await page.waitForFunction(() => !window.__fuyu.replaying, null, { timeout: 15000 });
      const t = await page.evaluate(() => window.__fuyu.S.turn);
      assert.strictEqual(t, 1);
      // 手番の報告 → くわしく → 地図で見る
      await page.waitForSelector('#card.rep:not(.hidden)');
      await page.click('#card [data-act="replog"]');
      await page.waitForSelector('#sheetWrap:not(.hidden) .log .ll');
      const go = await page.$('.log [data-act="goto"]');
      if (go) { await go.click(); await page.waitForSelector('#sheetWrap.hidden', { state: 'attached' }); } else await page.click('.sheet [data-act="close"]');
      await page.reload();
      await page.waitForFunction(() => window.__fuyu && window.__fuyu.S);
      assert.strictEqual(await page.evaluate(() => window.__fuyu.S.turn), 1, '開きなおすと続きにならない');
      // 冬まで画面ごと進めても壊れない。地図の札は重ならず、大事な札(再生・命令・軍団の見こみ)は消えない
      const st = await page.evaluate(() => {
        const w = window.__fuyu, out = { overlaps: 0, hi: [] };
        for (let k = 0; k < 40 && !w.S.done && !w.FY.winter(w.S); k++) {
          if (w.S.seasonStart) w.FY.chooseObjective(w.S, w.S.objOpts[0]);
          w.autoTurn('smart'); w.advance();
          const a = w.tags(); out.overlaps += a.overlaps; if (a.droppedHi) out.hi.push(a.drops.join('/'));
          w.skip();
          const b = w.tags(); out.overlaps += b.overlaps; if (b.droppedHi) out.hi.push(b.drops.join('/'));
        }
        document.getElementById('modalWrap').classList.add('hidden');
        out.done = w.S.done || w.FY.winter(w.S);
        return out;
      });
      assert.ok(st.done);
      // 軍団を選んだとき・攻める前の確認のときも、見こみの札(優勢・互角・不利)は必ず出る
      const sel = await page.evaluate(() => {
        const w = window.__fuyu, F = w.FY, out = { overlaps: 0, hi: [] };
        for (const u of F.unitsOf(w.S, 0)) {
          w.tap(u.at); let a = w.tags(); out.overlaps += a.overlaps; if (a.droppedHi) out.hi.push(a.drops.join('/'));
          for (const k of Object.keys(F.moves(w.S, u))) { const to = +k; if (w.S.own[to] === 0 && !F.unitAt(w.S, to)) continue; w.tap(to); a = w.tags(); out.overlaps += a.overlaps; if (a.droppedHi) out.hi.push(a.drops.join('/')); w.tap(u.at); }
          w.tap(-1);
        }
        return out;
      });
      st.overlaps += sel.overlaps; st.hi = st.hi.concat(sel.hi);
      assert.strictEqual(st.overlaps, 0, '地図の札が重なった');
      assert.deepStrictEqual(st.hi, [], '大事な札が出せなかった');
    }));
  }

  console.log(failures ? `\n${failures} 件 失敗` : '\nすべて合格');
  process.exit(failures ? 1 : 0);
})();
