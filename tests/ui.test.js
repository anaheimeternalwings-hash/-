// iPhone 画面での動作テスト(Playwright)
//   node tests/ui.test.js
'use strict';
const path = require('path');
const assert = require('assert');
const { chromium, devices } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const KEY = 'zensen-commander-save-v1';
let failures = 0;

async function withPage(device, fn, initState) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices[device] });
  const external = [], errors = [];
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (!u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
    return u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:') ? route.continue() : route.abort();
  });
  if (initState) {
    await ctx.addInitScript(([k, s]) => {
      if (!sessionStorage.getItem('__inj')) { localStorage.setItem(k, s); sessionStorage.setItem('__inj', '1'); }
    }, [KEY, JSON.stringify(initState)]);
  }
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  try {
    await page.goto(URL);
    await fn(page);
    assert.deepStrictEqual(external, [], '外部への通信: ' + external.join(', '));
    assert.deepStrictEqual(errors, [], 'エラー: ' + errors.join(' / '));
  } finally {
    await browser.close();
  }
}
async function test(name, fn) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) return;
  try { await fn(); console.log('  ✔ ' + name); }
  catch (e) { failures++; console.log('  ✘ ' + name + '\n      ' + (e && e.message || e)); }
}
const state = page => page.evaluate(() => JSON.parse(JSON.stringify(window.__game.state)));
async function finishBattle(page) {
  await page.waitForSelector('#battle:not(.hidden)');
  await page.click('[data-act="skip"]');
  await page.waitForSelector('#modalWrap:not(.hidden) .result');
}
async function noHorizontalScroll(page) {
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth, mw: document.getElementById('main').scrollWidth, mcw: document.getElementById('main').clientWidth }));
  assert(r.sw <= r.w && r.mw <= r.mcw, JSON.stringify(r));
}
const HERO_UNLOCK = { tetsu: 3, taka: 8, rai: 15, sakura: 22, hayate: 30, kiri: 40, kuro: 50, amagi: 62, ayase: 75 };
function midState(over) {
  const now = Date.now();
  const st = Object.assign({
    v: 1, money: 50000, steel: 30000,
    bld: { hq: { lv: 6, slot: 4 }, barracks: { lv: 10, slot: 1 }, supply: { lv: 8, slot: 0, stored: 0, t: now }, steel: { lv: 8, slot: 2, stored: 0, t: now },
      atpost: { lv: 9, slot: 3 }, factory: { lv: 9, slot: 5 }, depot: { lv: 4, slot: 6 }, artpost: { lv: 6, slot: 7 }, lab: { lv: 5, slot: 8 } },
    heroes: { oni: { lv: 15, exp: 0 }, tetsu: { lv: 14, exp: 0 }, taka: { lv: 12, exp: 0 } },
    cleared: 14, sel: 15, form: [], pending: null, tab: 'base', speed: 1, stats: { battles: 40, wins: 30 }, created: now, flags: { intro: 1, skipDeploy: 1 }, lastSeen: now
  }, over || {});
  // いまの版のセーブと同じく、クリア済みのステージで着任する指揮官はそろえておく(古いセーブを試すときは oldSave)
  if (!(over && over.oldSave)) {
    st.heroes = Object.assign({}, st.heroes);
    Object.entries(HERO_UNLOCK).forEach(([h, s]) => { if (st.cleared >= s && !st.heroes[h]) st.heroes[h] = { lv: 10, exp: 0 }; });
  }
  return st;
}

(async () => {
  console.log('\n[iPhone 画面テスト]');

  await test('初回起動 → 補給所を建設 → ステージ1に出撃 → 勝利して報酬', () => withPage('iPhone 13', async page => {
    await page.waitForSelector('[data-act="intro-ok"]');
    await page.click('[data-act="intro-ok"]');
    await page.click('.tile.empty >> nth=0');
    await page.click('[data-act="build"][data-id="supply"]');
    let st = await state(page);
    assert(st.bld.supply && st.bld.supply.lv === 1);
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.waitForSelector('.winbox');
    const wr = await page.textContent('.wr .v');
    assert(/\d+%/.test(wr));
    const money0 = st.money;
    await page.click('[data-act="sortie"]');
    await finishBattle(page);
    assert((await page.textContent('.result h2')).includes('勝利'));
    st = await state(page);
    assert.strictEqual(st.cleared, 1);
    assert(st.money > money0);
    assert.strictEqual(st.pending, null);
  }));

  await test('ブラウザを閉じて開き直すと、最初の画面ではなく続きから再開する', async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    let page = await ctx.newPage();
    await page.goto(URL);
    await page.click('[data-act="intro-ok"]');
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="sortie"]');
    await finishBattle(page);
    await page.click('[data-act="r-next"]');
    const before = await state(page);
    await page.close();
    page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForSelector('#scr-sortie:not(.hidden)');
    assert(await page.isHidden('[data-act="intro-ok"]'), 'イントロが再表示された');
    const after = await state(page);
    assert.strictEqual(after.cleared, before.cleared);
    assert.strictEqual(after.money, before.money);
    assert.strictEqual(after.sel, 2);
    assert((await page.textContent('.stagebar .sn')).includes('2'));
    await browser.close();
  });

  await test('戦闘の途中で閉じても、開き直すと結果が1回だけ反映される', async () => {
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    let page = await ctx.newPage();
    await page.goto(URL);
    await page.click('[data-act="intro-ok"]');
    await page.click('[data-act="tab"][data-tab="sortie"]');
    const m0 = (await state(page)).money;
    await page.click('[data-act="sortie"]');
    await page.waitForSelector('#battle:not(.hidden)');
    const pend = (await state(page)).pending;
    assert(pend && pend.s === 1 && typeof pend.seed === 'number');
    await page.close();
    page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForSelector('#modalWrap:not(.hidden) .result');
    const st = await state(page);
    assert.strictEqual(st.pending, null);
    assert.strictEqual(st.stats.battles, 1);
    assert((await page.textContent('#modal')).includes('残りは自動で戦いました'));
    if (st.cleared === 1) assert(st.money > m0);
    await page.close();
    page = await ctx.newPage();
    await page.goto(URL);
    await page.waitForTimeout(300);
    const st2 = await state(page);
    assert.strictEqual(st2.stats.battles, 1, '結果が二重に反映された');
    assert.strictEqual(st2.money, st.money);
    await browser.close();
  });

  await test('閉じている間も生産施設に上限まで貯まり、回収ボタンで受け取れる', async () => {
    const now = Date.now();
    const s0 = midState({ lastSeen: now - 10 * 3600e3 });
    s0.bld.supply.t = now - 10 * 3600e3;
    s0.bld.steel.t = now - 10 * 3600e3;
    await withPage('iPhone 13', async page => {
      await page.waitForSelector('[data-act="welcome-collect"]');
      const txt = await page.textContent('#modal');
      assert(txt.includes('おかえりなさい'));
      const before = await state(page);
      await page.click('[data-act="welcome-collect"]');
      const after = await state(page);
      const capH = 2 + 4; // 倉庫Lv4
      const capM = await page.evaluate(h => window.__game.TF.prodRate('supply', 8) * h, capH);
      const gain = after.money - before.money;
      assert(gain > capM * 0.99 && gain <= capM + 1, `回収 ${gain} / 上限 ${capM}`);
      await page.waitForSelector('#btnCollect[disabled]');
    }, s0);
  });

  await test('敗北しても兵や資源は失われず、稼ぎのおすすめが出る', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    const before = await state(page);
    await page.click('[data-act="sortie"]');
    await finishBattle(page);
    assert(!(await page.textContent('.result h2')).includes('勝利'));
    const txt = await page.textContent('#modal');
    assert(txt.includes('兵は失われていません'));
    await page.waitForSelector('[data-act="r-farm"]', { timeout: 10000 });
    const farmS = +(await page.getAttribute('[data-act="r-farm"]', 'data-s'));
    const farmWr = await page.evaluate(s => { const G = window.__game; return G.TF.predict(G.state, G.TF.autoFormation(G.state, s), s, 100).winRate; }, farmS);
    assert(farmWr >= 0.8, `おすすめのステージ${farmS}の予想勝率が${farmWr}`);
    assert(txt.includes('兵は失われていません'));
    const after = await state(page);
    assert.strictEqual(after.money, before.money);
    assert.strictEqual(after.steel, before.steel);
    assert.deepStrictEqual(Object.keys(after.bld), Object.keys(before.bld));
    await page.click('[data-act="r-farm"]');
    const st = await state(page);
    assert(st.sel <= st.cleared);
  }, midState({ cleared: 60, sel: 61, tab: 'sortie' })));

  await test('ステージ3クリアで新しい指揮官が着任する', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await finishBattle(page);
    assert((await page.textContent('.result h2')).includes('勝利'));
    await page.click('[data-act="r-next"]');
    await page.waitForSelector('[data-act="hero-ok"]');
    assert((await page.textContent('#modal')).includes('鉄崎 ミナ'));
    await page.click('[data-act="hero-ok"]');
    const st = await state(page);
    assert(st.heroes.tetsu);
    assert(st.form.some(f => f.hero === 'tetsu'), '空き部隊に配属されていない');
  }, midState({ cleared: 2, sel: 3, heroes: { oni: { lv: 15, exp: 0 } } })));

  await test('倍速(×1/×2/×4)の切替とスキップ', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="sortie"]');
    await page.waitForSelector('#battle:not(.hidden)');
    await page.click('[data-act="speed"][data-sp="4"]');
    assert((await state(page)).speed === 4);
    assert(await page.isVisible('[data-act="speed"][data-sp="4"].on'));
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 5000 });
  }, midState({ tab: 'sortie' })));

  await test('戦闘をスキップせず最後まで再生すると結果が出る(戦場と兵士が描かれている)', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="sortie"]');
    await page.waitForSelector('#battle:not(.hidden)');
    await page.click('[data-act="speed"][data-sp="4"]');
    await page.waitForTimeout(900);
    const painted = await page.evaluate(() => {
      const bg = document.getElementById('bbg'), fg = document.getElementById('bcv');
      const a = bg.getContext('2d').getImageData(bg.width >> 1, bg.height >> 1, 1, 1).data[3];
      const d = fg.getContext('2d').getImageData(0, 0, fg.width, fg.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4 * 61) if (d[i] > 0) n++;
      return { bg: a, fg: n };
    });
    assert(painted.bg === 255 && painted.fg > 200, JSON.stringify(painted));
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 30000 });
    assert.strictEqual((await state(page)).pending, null);
  }, midState({ cleared: 2, sel: 3 })));

  await test('手動モード: ドラッグで攻撃指示、ボタンでスキル発動、AUTOで自動に切替', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="mode"][data-m="manual"]');
    assert.strictEqual((await state(page)).auto, false);
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await page.waitForSelector('#battle:not(.hidden)');
    assert(!(await page.isVisible('#btnAuto.on')), 'AUTOがONのまま');
    await page.waitForFunction(() => window.__game.battle.debug().phase === 'fight');
    // 自軍の部隊から敵の部隊へドラッグ(見えている敵だけ狙える。索敵範囲に入るまで待つ)
    // (カメラは寄っているので、画面に映っている部隊どうしで。なぞっている間にやられたらやり直す)
    const onScr = `(u => u.x > 24 && u.x < innerWidth - 24 && u.y > 70 && u.y < document.getElementById('skillBar').getBoundingClientRect().top - document.getElementById('bcv').getBoundingClientRect().top - 12)`;
    await page.waitForFunction(f => { const on = eval(f), us = window.__game.battle.debug().units; return us.some(u => u.side === 1 && u.alive && u.vis && on(u)) && us.some(u => u.side === 0 && u.alive && !u.reserve && on(u)); }, onScr, { timeout: 20000 });
    await page.waitForTimeout(300);
    const box = await page.evaluate(() => { const r = document.getElementById('bcv').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    let ordered = false;
    for (let tries = 0; tries < 4 && !ordered; tries++) {
      const pick = await page.evaluate(f => { const on = eval(f), us = window.__game.battle.debug().units; return { a: us.find(u => u.side === 0 && u.alive && !u.reserve && on(u)), e: us.filter(u => u.side === 1 && u.alive && u.vis && on(u)).pop() }; }, onScr);
      if (!pick.a || !pick.e) { await page.waitForTimeout(500); continue; }
      const a = pick.a, e = pick.e;
      await page.mouse.move(box.x + a.x, box.y + a.y - 6);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + a.x + (e.x - a.x) * i / 6, box.y + a.y - 6 + (e.y - a.y) * i / 6);
      await page.mouse.up();
      const d2 = await page.evaluate(() => window.__game.battle.debug());
      const a2 = d2.units.find(u => u.id === a.id), e2 = d2.units.find(u => u.id === e.id);
      if (a2.alive && e2.alive) { assert.strictEqual(a2.order, e.id, '攻撃指示が入っていない'); ordered = true; }
    }
    assert(ordered, '攻撃指示を試せなかった');
    // 手動ではスキルは勝手に発動しない。たまったらボタンで発動
    await page.waitForFunction(() => {
      const d = window.__game.battle.debug();
      return d && d.units.some(u => u.side === 0 && u.alive && u.skNext !== null && d.clock >= u.skNext);
    }, null, { timeout: 20000 });
    assert.strictEqual((await page.evaluate(() => window.__game.battle.debug())).skills, 0, '手動なのにスキルが自動発動した');
    await page.waitForSelector('#skillBar .skb.ready:not(.dead)');
    await page.evaluate(() => { const b = document.querySelector('#skillBar .skb.ready:not(.dead)'); b.click(); });
    assert.strictEqual((await page.evaluate(() => { const d = window.__game.battle.debug(); return d.skills; })), 1, 'ボタンでスキルが発動しない');
    // AUTOに切り替えると設定も保存される
    await page.click('[data-act="auto-toggle"]');
    assert((await page.evaluate(() => window.__game.battle.debug().auto)) === true);
    assert.strictEqual((await state(page)).auto, true);
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result');
  }, midState({ cleared: 24, sel: 25, auto: true })));

  await test('移動の指示: 手動では自軍の部隊をマップ上の好きな場所へなぞると、そこへ移動して守る。AUTOに戻すと解除', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d.phase === 'fight' && d.clock > 1; }, null, { timeout: 15000 });
    const box = await page.evaluate(() => { const r = document.getElementById('bcv').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    // 自軍の側の、部隊からも敵からも離れた地点(下のボタンに隠れていない所)を探してなぞる。なぞっている間にやられたらやり直す
    let done = null;
    for (let tries = 0; tries < 4 && !done; tries++) {
      await page.waitForTimeout(300);
      const plan = await page.evaluate(() => {
        const G = window.__game.battle, d = G.debug(), us = d.units.filter(u => u.alive && (u.side === 0 || u.vis));
        const cv = document.getElementById('bcv').getBoundingClientRect(), lim = document.getElementById('skillBar').getBoundingClientRect().top - cv.top - 12;
        // 画面に映っている自軍の部隊(カメラは寄っているので、端の部隊は画面の外にいることがある)
        const u = d.units.find(x => x.side === 0 && x.alive && !x.reserve && x.x > 30 && x.x < innerWidth - 30 && x.y > 60 && x.y < lim) || d.units.find(x => x.side === 0 && x.alive && !x.reserve);
        let best = null, bd = -1;
        for (let x = 0.5; x <= 5.5; x += 0.5) for (let y = -0.8; y <= -0.1; y += 0.1) {
          const q = G.mapPoint(x, y);
          if (!(q.x > 20 && q.x < innerWidth - 20 && q.y > 20 && q.y < lim)) continue;
          const dist = Math.min(...us.map(v => Math.hypot(v.x - q.x, v.y - 6 - q.y)));
          if (dist > bd) { bd = dist; best = { x, y, sx: q.x, sy: q.y }; }
        }
        return { u, best };
      });
      const { u, best } = plan;
      await page.mouse.move(box.x + u.x, box.y + u.y - 6);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + u.x + (best.sx - u.x) * i / 8, box.y + u.y - 6 + (best.sy - u.y + 6) * i / 8);
      await page.mouse.up();
      const now = await page.evaluate(id => window.__game.battle.debug().units.find(x => x.id === id), u.id);
      if (now.alive) done = { id: u.id, goal: now.goal, best };
    }
    assert(done && done.goal, '移動の指示が入らない');
    assert(Math.abs(done.goal.x - done.best.x) < 0.4 && Math.abs(done.goal.y - done.best.y) < 0.15, '指示した場所がずれた ' + JSON.stringify(done));
    await page.click('[data-act="auto-toggle"]');
    const d = await page.evaluate(() => window.__game.battle.debug());
    assert(d.units.filter(u => u.side === 0).every(u => !u.goal), 'AUTOで指示が解除されない');
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result');
  }, midState({ cleared: 24, sel: 25, auto: false })));

  await test('途中参戦: 増援ポイントがたまるとカードが使え、タップやドラッグで部隊が戦場に加わる', async () => {
    async function startManual(page) {
      await page.click('[data-act="tab"][data-tab="sortie"]');
      await page.click('[data-act="auto"]');
      await page.click('[data-act="sortie"]');
      await page.waitForFunction(() => window.__game.battle.debug().phase === 'fight');
      assert(await page.isVisible('#cardBar'), '増援カードが出ていない');
    }
    const st = midState({ cleared: 12, sel: 13, auto: false });
    // タップ: おまかせの列に出る
    await withPage('iPhone 13', async page => {
      await startManual(page);
      const n0 = (await page.evaluate(() => window.__game.battle.debug())).units.filter(u => u.side === 0).length;
      assert.strictEqual(await page.locator('#cardBar .rcard.on').count(), 0, 'ポイント不足なのに使える');
      await page.click('#cardBar .rcard >> nth=0');
      assert.strictEqual((await page.evaluate(() => window.__game.battle.debug())).reserve.used, 0, 'ポイント不足なのに出た');
      await page.waitForSelector('#cardBar .rcard.on', { timeout: 20000 });
      await page.click('#cardBar .rcard.on >> nth=0');
      assert.strictEqual((await page.evaluate(() => window.__game.battle.debug())).reserve.used, 1, 'タップで増援が出ない');
      // 戦場への登場は次の描画で反映される
      await page.waitForFunction(n => { const d = window.__game.battle.debug(); return d && d.units.filter(u => u.side === 0).length === n + 1 && d.units.some(u => u.side === 0 && u.reserve); }, n0, { timeout: 3000 });
      const d = await page.evaluate(() => window.__game.battle.debug());
      assert(d.reserve.pts < d.reserve.cost, 'ポイントが減っていない');
      assert.strictEqual(await page.locator('#cardBar .rcard.on').count(), 0, '使った直後もカードが使える表示のまま');
      await page.click('[data-act="skip"]');
      await page.waitForSelector('#modalWrap:not(.hidden) .result');
    }, st);
    // ドラッグ: 置いた列に出る
    await withPage('iPhone 13', async page => {
      await startManual(page);
      await page.waitForSelector('#cardBar .rcard.on', { timeout: 20000 });
      const cb = await page.locator('#cardBar .rcard.on >> nth=0').boundingBox();
      const r = await page.evaluate(() => { const b = document.getElementById('bcv').getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
      // 戦場全体が見えるまで引いてから、左端の列のあたりへ落とす
      await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
      for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 120);
      const lp = await page.evaluate(() => window.__game.battle.mapPoint(0, -0.5));
      const x0 = cb.x + cb.width / 2, y0 = cb.y + cb.height / 2, tx = r.x + Math.max(12, lp.x), ty = r.y + lp.y;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + (tx - x0) * i / 10, y0 + (ty - y0) * i / 10);
      assert(await page.isVisible('.cardghost'), 'ドラッグ中のカードが見えない');
      await page.mouse.up();
      assert.strictEqual((await page.evaluate(() => window.__game.battle.debug())).reserve.used, 1, 'ドラッグで増援が出ない');
      await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.units.some(u => u.side === 0 && u.reserve); }, null, { timeout: 3000 });
      const d = await page.evaluate(() => window.__game.battle.debug());
      const ai = d.units.map((u, k) => k).filter(k => d.units[k].side === 0 && d.units[k].reserve).pop();
      // 画面の左側に置いた → 左側の列(0か1)に入る(出てくる場所は前線基地のこともある)
      assert(d.lanes[ai] <= 1, '置いた列(左側)に出ていない ' + d.lanes[ai]);
      assert(d.unitX[ai] < 130, '置いた列へ向かわない ' + d.unitX[ai]);
      await page.click('[data-act="skip"]');
      await page.waitForSelector('#modalWrap:not(.hidden) .result');
    }, st);
  });


  await test('拠点: 敵を撃破すると前線が進んで拠点を占領。前線基地から増援が出て、手動ではボタンで特殊ユニットを発進', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.postEvents.some(e => e[0] === '0'); }, null, { timeout: 40000 });
    let d = await page.evaluate(() => window.__game.battle.debug());
    // 前線の位置 = 3 + 自軍が占領した数 - 奪われた数(敵も占領してくる)
    assert.strictEqual(d.postInfo.front, 3 + d.postEvents.filter(e => e[0] === '0').length - d.postEvents.filter(e => e[0] === '1').length, '前線の位置が占領と合わない');
    const captured = d.postEvents.filter(e => e[0] === '0').map(e => +e.split(':')[1]);
    captured.forEach(i => assert.strictEqual(d.posts[i], 0, '旗が自軍の色にならない'));
    assert(d.reserve.left >= 3, '前線基地の増援が増えない ' + d.reserve.left);
    // 手動なので自動では発進しない。ボタンで発進する
    assert(!d.supEvents.some(e => e[0] === '0'), '手動なのに自動で発進した');
    await page.waitForSelector('#supBar .supbtn', { timeout: 5000 });
    await page.click('#supBar .supbtn');
    d = await page.evaluate(() => window.__game.battle.debug());
    assert(d.supEvents.some(e => e[0] === '0'), 'ボタンで特殊ユニットが発進しない');
    await page.waitForFunction(() => { const x = window.__game.battle.debug(); return !x || x.air > 0 || x.ending; }, null, { timeout: 3000 });
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 15000 });
  }, midState({ cleared: 34, sel: 35, auto: false, bp: 0, parts: {},
    bld: { hq: { lv: 10, slot: 4 }, barracks: { lv: 18, slot: 1 }, atpost: { lv: 16, slot: 3 }, factory: { lv: 18, slot: 5 }, artpost: { lv: 14, slot: 7 }, lab: { lv: 12, slot: 8 } },
    heroes: { oni: { lv: 30, exp: 0 }, tetsu: { lv: 28, exp: 0 }, taka: { lv: 24, exp: 0 }, rai: { lv: 22, exp: 0 } } })));

  await test('配置: 出撃すると広大な戦場で部隊を配置。敵は索敵範囲に入るまで見えない。ドラッグで自軍の側の好きな場所(列の間・前後も)に置ける。戦闘開始で置いた場所から戦う', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    const wrSortie = parseInt((await page.textContent('.winbox .wr')).replace(/[^0-9]/g, ' ').trim().split(' ')[0], 10);
    // 混成の編成で(おまかせ編成は使わない)
    await page.click('[data-act="sortie"]');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.phase === 'deploy'; });
    assert(await page.isVisible('#deployBar'), '配置の画面が出ない');
    const txt = await page.textContent('#deployBar');
    let d = await page.evaluate(() => window.__game.battle.debug());
    assert(d.terrain.blobs.length >= 6, '地形の区域がない');
    // 敵は索敵範囲に入るまで見えない(配置中はどこにも見えない)。
    // 予想勝率は、おまかせ配置のままなら出撃画面と同じ数字(部隊を動かすと、その分だけ上下する)
    assert(d.units.filter(u => u.side === 1).every(u => !u.vis), '配置中に敵が見えている');
    await page.waitForFunction(() => /予想勝率 \d+%/.test((document.getElementById('dpWr') || {}).textContent || ''), null, { timeout: 8000 });
    const wrDeploy = parseInt((await page.textContent('#dpWr')).match(/予想勝率 (\d+)%/)[1], 10);
    assert.strictEqual(wrDeploy, wrSortie, '配置画面の予想勝率が出撃画面と違う ' + wrDeploy + ' / ' + wrSortie);
    const names = await page.evaluate(() => Object.keys(window.__game.TF.TERRAIN).map(k => window.__game.TF.TERRAIN[k].name));
    assert(names.some(n => txt.includes(n)), '地形の説明が出ない');
    const allies = d.units.filter(u => u.side === 0);
    assert.strictEqual(allies.length, 8, '部隊が8つ出ていない');
    assert(new Set(d.lanes.slice(0, 8)).size >= 3, 'おまかせ配置が列に散らばっていない');
    // 時間は進まない
    const c0 = d.clock;
    await page.waitForTimeout(800);
    assert.strictEqual((await page.evaluate(() => window.__game.battle.debug())).clock, c0, '配置中に戦闘が進んだ');
    // ドラッグで別の列へ
    await page.waitForTimeout(800);
    d = await page.evaluate(() => window.__game.battle.debug());
    const box = await page.evaluate(() => { const r = document.getElementById('bcv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
    const i0 = d.units.findIndex(u => u.side === 0), u0 = d.units[i0], lane0 = d.lanes[i0];
    const tx = lane0 >= 3 ? 12 : box.w - 12; // 端の列へ
    await page.mouse.move(box.x + u0.x, box.y + u0.y - 6); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + u0.x + (tx - u0.x) * i / 10, box.y + u0.y - 6);
    await page.mouse.up();
    d = await page.evaluate(() => window.__game.battle.debug());
    const moved = d.lanes[i0];
    assert.notStrictEqual(moved, lane0, 'ドラッグで列が変わらない');
    assert(moved === 0 || moved === 6, '端の列にならない ' + moved);
    // 自由配置: 列と列の間・前寄りの好きな場所に置ける(置いた場所に止まる)
    const i1 = d.units.findIndex((u, k) => u.side === 0 && k !== i0 && u.type !== 'art');
    const u1 = d.units[i1], to = await page.evaluate(() => window.__game.battle.worldToScreen(122, 103));
    await page.mouse.move(box.x + u1.x, box.y + u1.y - 6); await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + u1.x + (to.x - u1.x) * i / 10, box.y + u1.y - 6 + (to.y - u1.y + 6) * i / 10);
    await page.mouse.up();
    await page.waitForTimeout(300);
    d = await page.evaluate(() => window.__game.battle.debug());
    const p1 = d.units[i1];
    // 落とした画面の点に見えている地面(丘の上ならその表面)に置かれる
    const w1 = await page.evaluate(p => window.__game.battle.screenToWorld(p.x, p.y), to);
    assert(Math.abs(p1.wx - w1.x) < 16 && Math.abs(p1.wy - w1.y) < 4, '置いた場所にいない ' + p1.wx + ',' + p1.wy + ' / ' + w1.x + ',' + w1.y);
    const f1 = (await page.evaluate(() => window.__game.battle.debugForm()))[i1];
    assert(typeof f1.lx === 'number' && Math.abs(f1.lx - Math.round(f1.lx)) > 0.05, '列の間の位置が残らない ' + JSON.stringify(f1));
    assert(f1.adv > 0.45, '前に置いた奥行きが残らない ' + JSON.stringify(f1));
    // 戦闘開始: 置いた場所から始まり、途中で閉じても同じ配置で決着できるよう保存される
    await page.click('[data-act="deploy-go"]');
    d = await page.evaluate(() => window.__game.battle.debug());
    assert.strictEqual(d.phase, 'intro');
    const e1 = d.units[i1];
    assert(Math.abs(e1.ex - f1.lx) < 1e-6 && Math.abs(e1.ey - (-1 + f1.adv * 0.9)) < 1e-3, '置いた場所から始まらない ' + JSON.stringify([e1.ex, e1.ey, f1]));
    await page.waitForFunction(() => { const x = window.__game.battle.debug(); return x && x.phase === 'fight'; }, null, { timeout: 8000 });
    // 近づくと索敵範囲に入って見えてくる
    await page.waitForFunction(() => { const x = window.__game.battle.debug(); return x && x.phase === 'fight' && x.units.some(u => u.side === 1 && u.vis); }, null, { timeout: 15000 });
    const pend = await page.evaluate(() => window.__game.state.pending.form);
    assert.strictEqual(pend[i0].lane, moved, '配置が保存されない');
    assert.strictEqual(pend[i1].lx, f1.lx, '自由配置の位置が保存されない');
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 15000 });
  }, midState({ cleared: 40, sel: 41, auto: false, flags: { intro: 1 }, form: ['tank', 'inf', 'at', 'tank', 'inf', 'art', 'at', 'tank'].map((t, i) => ({ type: t, hero: ['oni', 'tetsu', 'taka', 'rai'][i] || null })), 
    bld: { hq: { lv: 12, slot: 4 }, barracks: { lv: 18, slot: 1 }, atpost: { lv: 16, slot: 3 }, factory: { lv: 18, slot: 5 }, artpost: { lv: 14, slot: 7 }, lab: { lv: 12, slot: 8 } },
    heroes: { oni: { lv: 30, exp: 0 }, tetsu: { lv: 28, exp: 0 }, taka: { lv: 24, exp: 0 }, rai: { lv: 22, exp: 0 } } })));

  await test('移動: 戦闘が始まると部隊は配置した場所からマップ上を進み、出会った所で戦う(画面の位置は戦闘の計算どおり)。2本指で大きく引くと戦場全体が見える', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    // 混成の編成で(おまかせ編成は使わない)
    await page.click('[data-act="sortie"]');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.phase === 'deploy'; });
    await page.click('[data-act="deploy-go"]');
    let d = await page.evaluate(() => window.__game.battle.debug());
    const movers = d.units.filter(u => u.side === 0 && u.type !== 'art');
    assert(movers.length >= 3);
    await page.waitForFunction(() => { const x = window.__game.battle.debug(); return x && (x.clock > 2.5 || x.ending); }, null, { timeout: 20000 });
    d = await page.evaluate(() => window.__game.battle.debug());
    // 前へ進んでいる(見えている敵がいなければ探しに行く)
    const adv = movers.filter(m => { const u = d.units.find(x => x.id === m.id); return u.alive && u.wy > m.wy + 15; });
    assert(adv.length >= 2, '前へ進まない');
    // 画面の位置は戦闘の計算の位置どおり(重なりをよける分だけずれる)
    d.units.filter(u => u.side === 0 && u.alive && u.ex !== null).forEach(u => assert(Math.abs(u.wx - (-18 + u.ex * 56)) < 32, '画面の位置が計算とずれる ' + u.wx + ' ' + u.ex));
    // いちばん引くと、7列すべてと両軍の陣地が画面に収まる
    const box = await page.evaluate(() => { const r = document.getElementById('bcv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 120);
    const z = await page.evaluate(() => window.__game.battle.debug().cam.z);
    assert(z <= 0.16, '十分に引けない ' + z);
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 15000 });
  }, midState({ cleared: 40, sel: 41, auto: false, flags: { intro: 1 }, form: ['tank', 'inf', 'at', 'tank', 'inf', 'art', 'at', 'tank'].map((t, i) => ({ type: t, hero: ['oni', 'tetsu', 'taka', 'rai'][i] || null })), 
    bld: { hq: { lv: 12, slot: 4 }, barracks: { lv: 18, slot: 1 }, atpost: { lv: 16, slot: 3 }, factory: { lv: 18, slot: 5 }, artpost: { lv: 14, slot: 7 }, lab: { lv: 12, slot: 8 } },
    heroes: { oni: { lv: 30, exp: 0 }, tetsu: { lv: 28, exp: 0 } } })));

  await test('配置: 「次から省略」にすると配置画面を出さずにおまかせ配置で始まる。出撃画面の「配置」でいつでも戻せる', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="sortie"]');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.phase === 'deploy'; });
    await page.click('#deployBar [data-act="deploy-skipnext"]');
    assert.strictEqual((await state(page)).flags.skipDeploy, 1);
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 15000 });
    await page.click('#modalWrap [data-act="r-form"]');
    await page.click('[data-act="hero-ok"]').catch(() => {});
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="sortie"]');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.phase !== 'deploy'; }, null, { timeout: 5000 });
    assert(!(await page.isVisible('#deployBar')), '省略にしても配置画面が出る');
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 15000 });
    // 出撃画面の「配置」で戻すと、また配置画面が出る
    await page.click('#modalWrap [data-act="r-form"]');
    await page.click('[data-act="hero-ok"]').catch(() => {});
    await page.click('[data-act="tab"][data-tab="sortie"]');
    assert(await page.isVisible('[data-act="deploy-mode"][data-m="off"].on'), '出撃画面に省略中と出ない');
    await page.click('[data-act="deploy-mode"][data-m="on"]');
    assert.strictEqual((await state(page)).flags.skipDeploy, 0);
    await page.click('[data-act="sortie"]');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.phase === 'deploy'; }, null, { timeout: 5000 });
    assert(await page.isVisible('#deployBar'), '戻しても配置画面が出ない');
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 15000 });
  }, midState({ cleared: 2, sel: 3, flags: { intro: 1 } })));

  await test('勝っても戦場にコインを集める演出は出ず、すぐに結果になる', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await page.waitForSelector('#battle:not(.hidden)');
    await page.click('[data-act="skip"]');
    const t0 = Date.now();
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 8000 });
    assert(Date.now() - t0 < 3500, '結果が出るまで長い ' + (Date.now() - t0));
    assert((await page.textContent('.result h2')).includes('勝利'));
    assert.strictEqual(await page.evaluate(() => typeof window.__game.battle.debug), 'function');
  }, midState({ cleared: 2, sel: 3 })));

  await test('陣取り地図: マスをタップで選択、なぞって移動、未到達は選べない。初クリアで制圧の演出', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.waitForSelector('#mapcv');
    await page.waitForTimeout(400);
    const tapRow = async row => {
      const p = await page.evaluate(r0 => { const c = window.__game.map.centerOf(r0); const r = document.getElementById('mapcv').getBoundingClientRect(); return { x: r.left + c.x, y: r.top + c.y }; }, row);
      await page.mouse.click(p.x, p.y);
    };
    await tapRow(14);
    assert.strictEqual((await state(page)).sel, 14, 'タップで選べない');
    assert((await page.textContent('.stagebar .sn')).includes('14'));
    await tapRow(17);
    assert.strictEqual((await state(page)).sel, 14, 'まだ行けないステージが選べた');
    // なぞって過去の段へ
    const f0 = (await page.evaluate(() => window.__game.map.debug())).focus;
    const b = await page.evaluate(() => { const r = document.getElementById('mapcv').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + 60 }; });
    await page.mouse.move(b.x, b.y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(b.x, b.y - i * 18);
    await page.mouse.up();
    const f1 = (await page.evaluate(() => window.__game.map.debug())).focus;
    assert(f1 < f0 - 2, '地図を動かせない ' + f0 + '→' + f1);
    await tapRow(Math.round(f1));
    assert.strictEqual((await state(page)).sel, Math.round(f1));
    // 最新ステージを初クリア → 地図に戻ると制圧の演出
    await page.evaluate(() => { window.__game.state.sel = 15; });
    await page.click('[data-act="tab"][data-tab="army"]');
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await finishBattle(page);
    assert((await page.textContent('.result h2')).includes('勝利'));
    await page.click('[data-act="r-next"]');
    await page.waitForFunction(() => window.__game.map.debug().anim, null, { timeout: 3000 });
    const s = await state(page);
    assert.strictEqual(s.cleared, 15);
    assert.strictEqual(s.sel, 16);
    assert(!s.flags.conq, '演出の印が残っている');
  }, midState({ cleared: 14, sel: 15, tab: 'base' })));

  await test('兵器: 研究所がないと案内が出る。設計図で新型を開発、資源で強化、数値が上がる', async () => {
    // 研究所なし
    await withPage('iPhone 13', async page => {
      await page.click('[data-act="tab"][data-tab="arms"]');
      assert((await page.textContent('#scr-arms')).includes('研究所'), '案内が出ない');
      assert.strictEqual(await page.locator('[data-act="arm-up"]').count(), 0);
    }, midState({ bld: { hq: { lv: 2, slot: 4 }, barracks: { lv: 3, slot: 1 } } }));
    // 以前のデータ(設計図なし)には、これまでのクリア分の設計図が配られ、タブに印が出る
    await withPage('iPhone 13', async page => {
      let s = await state(page);
      assert(s.bp > 0, '設計図が配られていない');
      assert(await page.isVisible('#dotArms.on'), '兵器タブに印がない');
      await page.click('[data-act="tab"][data-tab="arms"]');
      await page.click('[data-act="arm-type"][data-t="tank"]');
      const atk0 = (await page.evaluate(() => window.__game.TF.squadStats(window.__game.state, 'tank', null).atk));
      const bp0 = s.bp;
      await page.click('[data-act="arm-up"][data-t="tank"][data-k="w"]');
      await page.waitForSelector('#modalWrap:not(.hidden) .devart');
      assert((await page.textContent('#modalWrap')).includes('配備完了'), '最初の型の配備画面が出ない');
      await page.click('[data-act="modal-close"]');
      s = await state(page);
      assert.strictEqual(s.arms.tank.w, 1);
      assert(s.bp < bp0, '設計図が減っていない');
      const m0 = s.money;
      await page.click('[data-act="arm-up"][data-t="tank"][data-k="w"]');
      s = await state(page);
      assert.strictEqual(s.arms.tank.w, 2, '強化できない');
      assert(s.money < m0);
      assert.strictEqual(s.bp, bp0 - (await page.evaluate(() => window.__game.TF.armCost('tank', 'w', 0).bp)), '強化で設計図が減った');
      const atk1 = (await page.evaluate(() => window.__game.TF.squadStats(window.__game.state, 'tank', null).atk));
      assert(atk1 > atk0 * 1.09, '攻撃力が上がらない');
      assert((await page.textContent('#arm-tank-w')).includes('Lv2'));
      // 設計図の必要数をタップすると、設計図を集めやすい(勝てて稼げる)ステージへ飛ぶ
      const anyBp = await page.$('.arm .costs [data-act="bp-go"]');
      assert(anyBp, '設計図の必要数が表示されていない');
      {
        await anyBp.click();
        await page.waitForFunction(() => window.__game.state.tab === 'sortie', null, { timeout: 15000 });
        const sb = await state(page);
        assert(sb.sel >= 1 && sb.sel <= sb.cleared, '設計図のステージに飛べない ' + sb.sel);
        await page.click('[data-act="tab"][data-tab="arms"]');
        await page.click('[data-act="arm-type"][data-t="tank"]');
      }
      // 武器の絵は実物の兵器。5レベルごとの新型開発で武器の絵が変わる。
      // 部隊のアイコン(描き下ろしの絵)は年代(大戦・冷戦・現代)が変わる開発で変わる(新型2つ目までは大戦、3つ目から冷戦)
      assert(await page.isVisible('#arm-tank-w .wico svg'), '武器の絵がない');
      await page.evaluate(() => { window.__game.state.bp = 100; });
      const icon0 = await page.innerHTML('#arm-tank-w .wico'), unit0 = await page.innerHTML('.armsum .big');
      for (let i = 0; i < 3; i++) await page.click('[data-act="arm-up"][data-t="tank"][data-k="w"]');
      assert.strictEqual(await page.innerHTML('.armsum .big'), unit0, '強化だけで見た目が変わった');
      await page.click('[data-act="arm-up"][data-t="tank"][data-k="w"]');
      await page.waitForSelector('#modalWrap:not(.hidden) .devart');
      await page.click('[data-act="modal-close"]');
      assert.strictEqual((await state(page)).arms.tank.w, 6);
      assert.strictEqual((await state(page)).parts[1] || 0, (await page.evaluate(() => window.__game.TF.K.partFirst)) - 1, '試作部品Ⅰが使われていない');
      assert.notStrictEqual(await page.innerHTML('#arm-tank-w .wico'), icon0, '武器の絵が変わらない');
      await page.evaluate(() => { const s = window.__game.state; s.bp = 200; s.money = 1e9; s.steel = 1e9; s.parts = { 1: 9, 2: 9, 3: 9 }; s.bld.lab.lv = 10; });
      for (let i = 0; i < 4; i++) await page.click('[data-act="arm-up"][data-t="tank"][data-k="w"]');
      assert.strictEqual((await state(page)).arms.tank.w, 10);
      await page.click('[data-act="arm-up"][data-t="tank"][data-k="w"]');
      await page.waitForSelector('#modalWrap:not(.hidden) .morph');
      assert((await page.textContent('#modalWrap')).includes('見た目も新しく'));
      await page.click('[data-act="modal-close"]');
      assert.strictEqual((await state(page)).arms.tank.w, 11);
      assert.notStrictEqual(await page.innerHTML('.armsum .big'), unit0, '戦車のアイコンが変わらない');
      await noHorizontalScroll(page);
      // 部隊タブにも武装が表示される
      await page.click('[data-act="tab"][data-tab="army"]');
      assert((await page.textContent('#scr-army')).includes(await page.evaluate(() => window.__game.TF.armName('tank', 'w', 11))));
    }, Object.assign(midState({ money: 1e6, steel: 1e6 }), { bp: undefined }));
    // 勝てば設計図が増え、特殊武装は苦手な敵に「特効!」
    await withPage('iPhone 13', async page => {
      const bp0 = (await state(page)).bp;
      await page.click('[data-act="tab"][data-tab="sortie"]');
      await page.evaluate(() => { const st = window.__game.state; st.form = st.form.map(f => ({ type: 'tank', hero: f.hero })); });
      await page.click('[data-act="tab"][data-tab="army"]');
      await page.click('[data-act="tab"][data-tab="sortie"]');
      await page.click('[data-act="sortie"]');
      // (戦車は3部隊まで。マップ全体で敵を探してから戦うので、少し時間がかかる)
      await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && (d.spHits > 0 || d.ending); }, null, { timeout: 60000 });
      assert((await page.evaluate(() => window.__game.battle.debug().spHits)) > 0, '特効が出ない');
      await page.click('[data-act="skip"]');
      await page.waitForSelector('#modalWrap:not(.hidden) .result');
      if ((await page.textContent('.result h2')).includes('勝利')) {
        assert((await page.textContent('.result')).includes('設計図'));
        assert((await state(page)).bp > bp0, '勝っても設計図が増えない');
      }
    }, midState({ cleared: 18, sel: 19, bp: 0, speed: 4, arms: { tank: { w: 10, a: 10, x: 10 } },
      bld: { hq: { lv: 8, slot: 4 }, barracks: { lv: 14, slot: 1 }, atpost: { lv: 12, slot: 3 }, factory: { lv: 16, slot: 5 }, artpost: { lv: 10, slot: 7 }, lab: { lv: 8, slot: 8 } } }));
  });

  await test('試作部品: 新型の開発に必要。足りなければ「ボス戦へ」で案内され、ボス戦の初クリアで手に入る', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="arms"]');
    await page.click('[data-act="arm-type"][data-t="tank"]');
    assert(!(await page.isEnabled('[data-act="arm-up"][data-t="tank"][data-k="w"]')), '部品なしで開発ボタンが押せる');
    assert((await page.textContent('#arm-tank-w')).includes('試作部品Ⅰが不足'));
    // 開発アイテムは兵器の画面に常に出さず、アイテム一覧(上のかばん・兵器画面のボタン)で見る
    assert(!(await page.$('#scr-arms .item')), '兵器の画面にアイテムが常に出ている');
    await page.click('#scr-arms [data-act="items"]');
    await page.waitForSelector('#sheetWrap:not(.hidden) .itemlist');
    const list = await page.textContent('.itemlist');
    assert(list.includes('設計図') && list.includes('試作部品Ⅰ') && list.includes('ステージ10'), 'アイテム一覧の中身が足りない ' + list);
    assert((await page.textContent('#item-part-1')).includes('戦車'), '部品の使い道が出ない');
    await page.click('.sheet .close');
    // 素材をタップすると、ドロップするステージへ飛ぶ: アイテム一覧・カードの必要素材・「ボス戦へ」
    await page.click('#top [data-act="items"]');
    await page.click('#item-part-1 [data-act="part-go"]');
    let s = await state(page);
    assert.strictEqual(s.sel, 10, 'アイテム一覧からボス戦に飛べない');
    assert.strictEqual(s.tab, 'sortie');
    assert(await page.isHidden('#sheetWrap'), 'アイテム一覧が閉じない');
    await page.evaluate(() => { window.__game.state.sel = 3; });
    await page.click('[data-act="tab"][data-tab="arms"]');
    await page.click('#arm-tank-w .costs [data-act="part-go"]');
    s = await state(page);
    assert.strictEqual(s.sel, 10, 'カードの必要素材からボス戦に飛べない');
    await page.evaluate(() => { window.__game.state.sel = 3; });
    await page.click('[data-act="tab"][data-tab="arms"]');
    await page.click('#arm-tank-w .why [data-act="part-go"]');
    s = await state(page);
    assert.strictEqual(s.sel, 10, 'ボス戦に案内されない');
    assert.strictEqual(s.tab, 'sortie');
    assert((await page.textContent('.winbox')).includes('試作部品Ⅰ'), '出撃画面に部品の報酬が出ない');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await finishBattle(page);
    assert((await page.textContent('.result h2')).includes('勝利'));
    assert((await page.textContent('.result')).includes('試作部品Ⅰ'), '結果に部品が出ない');
    const first = await page.evaluate(() => window.__game.TF.K.partFirst);
    assert.strictEqual((await state(page)).parts[1], first);
    assert(await page.isVisible('#dotItems.on'), '新しいアイテムの印が出ない');
    await page.click('[data-act="r-base"]').catch(() => {});
    await page.click('[data-act="hero-ok"]').catch(() => {});
    await page.click('[data-act="tab"][data-tab="arms"]');
    await page.click('[data-act="arm-type"][data-t="tank"]');
    await page.click('[data-act="arm-up"][data-t="tank"][data-k="w"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .devart');
    assert((await page.textContent('#modalWrap')).includes('試作部品Ⅰを使用'));
    s = await state(page);
    assert.strictEqual(s.arms.tank.w, 6);
    assert.strictEqual(s.parts[1], first - 1);
  }, midState({ cleared: 9, sel: 10, bp: 200, parts: {}, arms: { tank: { w: 5 } } })));

  await test('広い戦場: なぞって見回し、2本指で拡大・縮小、「戦況を追う」で戻る。勝っても敵陣へは進軍しない', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await page.waitForFunction(() => window.__game.battle.debug().phase === 'fight');
    const box = await page.evaluate(() => { const r = document.getElementById('bcv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const c0 = (await page.evaluate(() => window.__game.battle.debug())).cam;
    await page.mouse.move(box.x + box.w / 2, box.y + box.h * 0.8);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.w / 2 + i * 15, box.y + box.h * 0.8 - i * 25);
    await page.mouse.up();
    const c1 = (await page.evaluate(() => window.__game.battle.debug())).cam;
    assert(c1.user && (Math.abs(c1.x - c0.x) > 3 || Math.abs(c1.y - c0.y) > 3), '見回せない ' + JSON.stringify([c0, c1]));
    assert(await page.isVisible('#camReset'), '「戦況を追う」ボタンが出ない');
    // 2本指で広げる → 拡大
    const z0 = c1.z;
    await page.evaluate(b => {
      const c = document.getElementById('bcv'), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      const ev = (type, id, x, y) => c.dispatchEvent(new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 11, pointerType: 'touch' }));
      ev('pointerdown', 11, cx - 40, cy); ev('pointerdown', 12, cx + 40, cy);
      for (let i = 1; i <= 5; i++) { ev('pointermove', 11, cx - 40 - i * 12, cy); ev('pointermove', 12, cx + 40 + i * 12, cy); }
      ev('pointerup', 11, cx - 100, cy); ev('pointerup', 12, cx + 100, cy);
    }, box);
    const c2 = (await page.evaluate(() => window.__game.battle.debug())).cam;
    assert(c2.z > z0 * 1.3, '拡大できない ' + z0 + '→' + c2.z);
    await page.click('#camReset');
    assert.strictEqual((await page.evaluate(() => window.__game.battle.debug())).cam.user, false);
    // 勝っても敵陣へは進軍しない(前線はその場で止まり、建物も占領しない)
    await page.click('[data-act="skip"]');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.ending; }, null, { timeout: 8000 });
    const e0 = await page.evaluate(() => window.__game.battle.debug());
    await page.waitForTimeout(1500);
    const e1 = await page.evaluate(() => window.__game.battle.debug());
    if (e1) {
      assert(Math.abs(e1.front - e0.front) < 0.5, '勝利後に前線が進んだ ' + e0.front + '→' + e1.front);
      assert.strictEqual(e1.captured, 0, '勝利後に建物を占領した');
    }
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 8000 });
    assert((await page.textContent('.result h2')).includes('勝利'));
  }, midState({ cleared: 2, sel: 3 })));

  await test('自軍は配置した場所から進む(最初に川や橋を渡らない。前線の線や土のうの壁もない)。戦闘中は狙いの線が出る', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    // 出撃画面にマップの型が出る(となりのステージとは違う型)
    const ty1 = await page.textContent('#mapType');
    assert(ty1.startsWith('マップ: '), ty1);
    await page.click('[data-act="stage"][data-d="-1"]');
    const ty0 = await page.textContent('#mapType');
    assert(ty0 !== ty1, 'となりのステージと同じ型 ' + ty0);
    await page.click('[data-act="stage"][data-d="1"]');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await page.waitForSelector('#battle:not(.hidden)');
    const d0 = await page.evaluate(() => window.__game.battle.debug());
    assert(d0.bridgeY === undefined, 'まだ川がある');
    assert.strictEqual(d0.wallsTotal, 0, '土のうの壁がある');
    d0.units.filter(u => u.side === 0).forEach(u => assert(Math.abs(u.wy - (150 + (-1 + u.adv * 0.9) * 98)) < 30, '開始時に配置した場所にいない ' + u.wy));
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.phase === 'fight' && d.clock > 1.5; }, null, { timeout: 15000 });
    const d1 = await page.evaluate(() => window.__game.battle.debug());
    const mv = d1.units.filter(u => u.side === 0 && u.type !== 'art' && u.alive && u.wy > d0.units.find(v => v.id === u.id).wy + 15);
    assert(mv.length >= 1, '前へ進まない');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && (d.aims > 0 || d.ending); }, null, { timeout: 20000 });
    assert((await page.evaluate(() => window.__game.battle.debug())).aims > 0, '狙いの線が出ない');
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 8000 });
  }, midState({ cleared: 14, sel: 15 })));

  await test('編成の上限: 兵種ごとに編成できる数を超える兵種は選べない(歩兵4・対戦車兵3・戦車3・砲兵2)', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="slot"][data-i="3"]');
    await page.waitForSelector('.sheet [data-act="set-type"]');
    assert(await page.isDisabled('.sheet [data-act="set-type"][data-t="tank"]'), '4部隊目の戦車が選べる');
    assert((await page.textContent('.sheet [data-act="set-type"][data-t="tank"]')).includes('上限'), '上限の説明が出ない');
    assert(!(await page.isDisabled('.sheet [data-act="set-type"][data-t="inf"]')), '歩兵が選べない');
    assert((await page.textContent('.sheet')).includes('編成できる数'), '上限の一覧が出ない');
  }, midState({ cleared: 40, sel: 41, form: ['tank', 'tank', 'tank', 'inf', 'inf', 'at'].map(t => ({ type: t, hero: null })),
    bld: { hq: { lv: 12, slot: 4 }, barracks: { lv: 18, slot: 1 }, atpost: { lv: 16, slot: 3 }, factory: { lv: 18, slot: 5 }, artpost: { lv: 14, slot: 7 }, lab: { lv: 12, slot: 8 } } })));

  await test('敵将: 敵将のいるステージは出撃画面にスキルが出て、戦闘には「将」の部隊がいる。結果画面で敵の作戦が明かされる', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    const tx = await page.textContent('#ecmdInfo');
    assert(tx.includes('敵将「') && tx.includes('予告'), '敵将の説明が出ない ' + tx);
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.phase === 'fight'; }, null, { timeout: 15000 });
    const d = await page.evaluate(() => window.__game.battle.debug());
    assert(d.units.some(u => u.side === 1 && u.ecmd), '敵将の部隊がいない');
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 15000 });
    assert((await page.textContent('#resTactic')).includes('敵の作戦'), '敵の作戦が出ない');
  }, midState({ cleared: 13, sel: 14 })));

  await test('出撃画面の「稼ぎにおすすめ」: 勝率80%以上のステージを選んで編成する', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="farm-find"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 10000 });
    assert((await page.textContent('#modal')).includes('稼ぐなら'));
    const st = await state(page);
    assert(st.sel <= st.cleared);
    const wr = await page.evaluate(s => { const G = window.__game; return G.TF.predict(G.state, G.state.form, s, 100).winRate; }, st.sel);
    assert(wr >= 0.8, `予想勝率 ${wr}`);
  }, midState({ cleared: 40, sel: 41 })));

  await test('部隊の編成(兵種・指揮官の変更、おまかせ編成、予想勝率)', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="slot"][data-i="0"]');
    await page.click('[data-act="set-type"][data-t="tank"]');
    await page.click('[data-act="set-hero"][data-i="0"][data-h="tetsu"]');
    await page.click('.sheet [data-act="sheet-close"].btn');
    let st = await state(page);
    assert.strictEqual(st.form[0].type, 'tank');
    assert.strictEqual(st.form[0].hero, 'tetsu');
    assert.strictEqual(st.form.filter(f => f.hero === 'tetsu').length, 1);
    await page.click('[data-act="auto"]');
    st = await state(page);
    assert.strictEqual(st.form.length, 5);
    assert(/\d+%/.test(await page.textContent('.wr .v')));
  }, midState()));

  for (const dev of ['iPhone SE', 'iPhone 13', 'iPhone 14 Pro Max']) {
    await test(`${dev}: 横スクロールなし・各画面が表示できる`, () => withPage(dev, async page => {
      for (const tab of ['base', 'army', 'sortie']) {
        await page.click(`[data-act="tab"][data-tab="${tab}"]`);
        await noHorizontalScroll(page);
      }
      await page.click('[data-act="tab"][data-tab="base"]');
      await page.click('[data-act="tile"][data-slot="4"]');
      await page.waitForSelector('[data-act="upgrade"]');
      await noHorizontalScroll(page);
      await page.click('.sheet .close');
      await page.click('[data-act="tab"][data-tab="sortie"]');
      await page.click('[data-act="sortie"]');
      await page.waitForTimeout(800);
      const box = await page.evaluate(() => { const c = document.getElementById('bcv').getBoundingClientRect(); return { w: c.width, h: c.height, iw: innerWidth }; });
      assert(box.w === box.iw && box.h > 300, JSON.stringify(box));
      await page.click('[data-act="skip"]');
      await page.waitForSelector('#modalWrap:not(.hidden) .result');
      await noHorizontalScroll(page);
    }, midState()));
  }

  await test('部隊の画面に兵種ごとの射程と10人の指揮官(特徴・スキル)が出る。アイテム一覧の✕は下までスクロールしても見えている', () => withPage('iPhone SE', async page => {
    await page.click('[data-act="tab"][data-tab="army"]');
    const txt = await page.textContent('#scr-army');
    assert(txt.includes('射程') && txt.includes('2列') && txt.includes('索敵') && txt.includes('見つかりにくさ'), '射程・索敵が出ない');
    // 指揮官は10人(まだの指揮官も、着任するステージ・特徴・スキルが見える)
    assert.strictEqual(await page.locator('#scr-army .card.hero').count(), 10, '指揮官が10人いない');
    assert(await page.locator('#scr-army .card.hero .traits span').count() >= 20, '指揮官の特徴が出ない');
    assert(txt.includes('応急手当') && txt.includes('弱点看破') && txt.includes('ステージ75'), 'まだの指揮官の情報が出ない');
    await page.click('#top [data-act="items"]');
    await page.waitForSelector('#sheetWrap:not(.hidden) .itemlist');
    await page.evaluate(() => { const s = document.getElementById('sheet'); s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => { const s = document.getElementById('sheet').getBoundingClientRect(), c = document.querySelector('.sheet .close').getBoundingClientRect(); return { st: s.top, ct: c.top, cb: c.bottom, sb: s.bottom }; });
    assert(r.ct >= r.st - 1 && r.cb <= r.sb, '✕が見えない ' + JSON.stringify(r));
    await page.click('.sheet .close');
    assert(await page.isHidden('#sheetWrap'), '✕で閉じない');
  }, midState({ cleared: 45, sel: 46, parts: { 1: 2, 2: 1, 3: 1, 4: 2 } })));

  await test('絵: 指揮官・敵将の顔は描き下ろしの絵(ファイルに埋め込み・外部から読まない)。小さい枠では顔に寄せる。部隊アイコンが描き下ろしなら敵は左右反転', () => withPage('iPhone 13', async page => {
    const isArt = 's => !!s && s.classList.contains("pic") && getComputedStyle(s).backgroundImage.startsWith("url(\\"data:image/webp")';
    await page.click('[data-act="tab"][data-tab="army"]');
    const r = await page.evaluate(f => { const ok = eval(f); const ps = [...document.querySelectorAll('#scr-army .card.hero .portrait svg')]; return { n: ps.length, art: ps.filter(ok).length }; }, isArt);
    assert.strictEqual(r.n, 10, '指揮官の顔が10人分ない');
    assert.strictEqual(r.art, 10, '描き下ろしの顔が出ない ' + JSON.stringify(r));
    await page.click('[data-act="tab"][data-tab="sortie"]');
    assert(await page.evaluate(f => eval(f)(document.querySelector('#ecmdInfo .eportrait svg')), isArt), '敵将の顔が描き下ろしでない');
    await page.click('[data-act="auto"]');
    const z = await page.evaluate(() => { const s = document.querySelector('.slot .portrait.xs svg.pic'); return s ? getComputedStyle(s).backgroundSize : null; });
    assert(z && z.startsWith('175%'), '小さい枠で顔に寄らない ' + z);
    const u = await page.evaluate(() => { const en = document.querySelector('.slot svg.pic.en'), al = document.querySelector('.slot svg.pic.al'); return { en: en ? getComputedStyle(en).transform : null, al: !!al }; });
    if (u.al) assert(u.en && u.en.startsWith('matrix(-1'), '敵の部隊アイコンが左右反転しない ' + JSON.stringify(u));
  }, midState({ cleared: 13, sel: 14 })));

  await test('あとから追加された指揮官: 着任のステージをクリア済みなら、開いたときに着任の画面が出て使えるようになる', () => withPage('iPhone 13', async page => {
    await page.waitForSelector('#modalWrap:not(.hidden)', { timeout: 5000 });
    const names = [];
    for (let i = 0; i < 4; i++) {
      const txt = await page.textContent('#modal');
      assert(txt.includes('新たな指揮官が着任') && txt.includes('クリア済み'), '着任の画面が出ない ' + txt.slice(0, 60));
      names.push(txt);
      await page.click('[data-act="hero-ok"]');
    }
    assert(names[0].includes('桜井') && names[3].includes('黒岩'), '着任の順番が違う');
    const s = await state(page);
    assert.deepStrictEqual(['sakura', 'hayate', 'kiri', 'kuro'].map(h => !!s.heroes[h]), [true, true, true, true], '着任していない');
    assert(!s.heroes.amagi, 'まだのステージの指揮官まで着任した');
    // 空いていた部隊に配属され、出撃で使える
    assert(s.form.some(f => f.hero === 'sakura'), '部隊に配属されていない');
    await page.click('[data-act="tab"][data-tab="army"]');
    assert((await page.textContent('#scr-army')).includes('桜井 ユイ'), '部隊タブに出ない');
  }, midState({ oldSave: true, cleared: 60, sel: 61, heroes: { oni: { lv: 30, exp: 0 }, tetsu: { lv: 28, exp: 0 }, taka: { lv: 25, exp: 0 }, rai: { lv: 22, exp: 0 } } })));

  await test('施設の強化で資源が減り、レベルが上がる', () => withPage('iPhone 13', async page => {
    const before = await state(page);
    await page.click('[data-act="tile"][data-slot="1"]');
    await page.click('[data-act="upgrade"][data-id="barracks"]');
    const after = await state(page);
    assert.strictEqual(after.bld.barracks.lv, before.bld.barracks.lv + 1);
    assert(after.money < before.money && after.steel < before.steel);
  }, midState()));

  if (failures) { console.log(`\n${failures}件の失敗`); process.exit(1); }
  console.log('\nすべて合格');
})();
