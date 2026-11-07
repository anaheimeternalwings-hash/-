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
function midState(over) {
  const now = Date.now();
  return Object.assign({
    v: 1, money: 50000, steel: 30000,
    bld: { hq: { lv: 6, slot: 4 }, barracks: { lv: 10, slot: 1 }, supply: { lv: 8, slot: 0, stored: 0, t: now }, steel: { lv: 8, slot: 2, stored: 0, t: now },
      atpost: { lv: 9, slot: 3 }, factory: { lv: 9, slot: 5 }, depot: { lv: 4, slot: 6 }, artpost: { lv: 6, slot: 7 }, lab: { lv: 5, slot: 8 } },
    heroes: { oni: { lv: 15, exp: 0 }, tetsu: { lv: 14, exp: 0 }, taka: { lv: 12, exp: 0 } },
    cleared: 14, sel: 15, form: [], pending: null, tab: 'base', speed: 1, stats: { battles: 40, wins: 30 }, created: now, flags: { intro: 1 }, lastSeen: now
  }, over || {});
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
    // 自軍の部隊から敵の部隊へドラッグ
    const dbg = await page.evaluate(() => window.__game.battle.debug());
    const box = await page.evaluate(() => { const r = document.getElementById('bcv').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    const a = dbg.units.find(u => u.side === 0 && u.alive), e = dbg.units.filter(u => u.side === 1 && u.alive).pop();
    await page.mouse.move(box.x + a.x, box.y + a.y - 6);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + a.x + (e.x - a.x) * i / 6, box.y + a.y - 6 + (e.y - a.y) * i / 6);
    await page.mouse.up();
    const d2 = await page.evaluate(() => window.__game.battle.debug());
    assert.strictEqual(d2.units.find(u => u.id === a.id).order, e.id, '攻撃指示が入っていない');
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
