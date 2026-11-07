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

  await test('配置の指示: 部隊を前線の先へなぞると前進、後ろへなぞると後退。AUTOに戻すと解除', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await page.waitForFunction(() => window.__game.battle.debug().phase === 'fight');
    const box = await page.evaluate(() => { const r = document.getElementById('bcv').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    // 敵の部隊の上に落とすと攻撃指示になるので、敵から離れた地点を探してなぞる
    async function dragTo(u, rel) {
      const p = await page.evaluate(([wx, r]) => {
        const d = window.__game.battle.debug(), foes = d.units.filter(f => f.side === 1 && f.alive);
        let best = null, bd = -1;
        for (let x = 20; x <= 180; x += 5) for (let k = 0; k <= 30; k += 5) {
          const q = window.__game.battle.frontPoint(x, r + (r > 0 ? k : -k));
          const dist = Math.min(...foes.map(f => Math.hypot(f.x - q.x, f.y - 6 - q.y)));
          if (q.x > 10 && q.x < innerWidth - 10 && dist > bd) { bd = dist; best = q; }
        }
        return best;
      }, [u.wx, rel]);
      await page.mouse.move(box.x + u.x, box.y + u.y - 6);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + u.x + (p.x - u.x) * i / 8, box.y + u.y - 6 + (p.y - u.y + 6) * i / 8);
      await page.mouse.up();
    }
    let d = await page.evaluate(() => window.__game.battle.debug());
    const [a, b] = d.units.filter(u => u.side === 0 && u.alive);
    await dragTo(a, 14);
    await dragTo(b, -60);
    d = await page.evaluate(() => window.__game.battle.debug());
    const ua = d.units.find(u => u.id === a.id), ub = d.units.find(u => u.id === b.id);
    assert.strictEqual(ua.stance, 1, '前進にならない');
    assert.strictEqual(ub.stance, -1, '後退にならない');
    assert.strictEqual(ua.order, null);
    await page.click('[data-act="auto-toggle"]');
    d = await page.evaluate(() => window.__game.battle.debug());
    assert(d.units.filter(u => u.side === 0).every(u => u.stance === 0), 'AUTOで配置が解除されない');
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
      const x0 = cb.x + cb.width / 2, y0 = cb.y + cb.height / 2, tx = r.x + r.w * 0.2, ty = r.y + r.h * 0.75;
      await page.mouse.move(x0, y0);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(x0 + (tx - x0) * i / 10, y0 + (ty - y0) * i / 10);
      assert(await page.isVisible('.cardghost'), 'ドラッグ中のカードが見えない');
      await page.mouse.up();
      assert.strictEqual((await page.evaluate(() => window.__game.battle.debug())).reserve.used, 1, 'ドラッグで増援が出ない');
      await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.units.some(u => u.side === 0 && u.reserve); }, null, { timeout: 3000 });
      const d = await page.evaluate(() => window.__game.battle.debug());
      const added = d.units.filter(u => u.side === 0 && u.reserve).pop();
      assert(added.wx < 100, '置いた列(左側)に出ていない ' + added.wx);
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
    assert(d.postInfo.front > 3, '前線が進んでいない');
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

  await test('勝つと戦場にコインが散らばり、自動で集まって報酬になる', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await page.waitForSelector('#battle:not(.hidden)');
    await page.click('[data-act="skip"]');
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.coinTotal > 0; }, null, { timeout: 8000 });
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return !d || d.coins >= d.coinTotal; }, null, { timeout: 8000 });
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 8000 });
    assert((await page.textContent('.result h2')).includes('勝利'));
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
      // 武器の絵は実物の兵器。5レベルごとの新型開発で、武器の絵と戦車のアイコンが変わる
      assert(await page.isVisible('#arm-tank-w .wico svg'), '武器の絵がない');
      await page.evaluate(() => { window.__game.state.bp = 100; });
      const icon0 = await page.innerHTML('#arm-tank-w .wico'), unit0 = await page.innerHTML('.armsum .big');
      for (let i = 0; i < 3; i++) await page.click('[data-act="arm-up"][data-t="tank"][data-k="w"]');
      assert.strictEqual(await page.innerHTML('.armsum .big'), unit0, '強化だけで見た目が変わった');
      await page.click('[data-act="arm-up"][data-t="tank"][data-k="w"]');
      await page.waitForSelector('#modalWrap:not(.hidden) .morph');
      assert((await page.textContent('#modalWrap')).includes('見た目も新しく'));
      await page.click('[data-act="modal-close"]');
      assert.strictEqual((await state(page)).arms.tank.w, 6);
      assert.strictEqual((await state(page)).parts[1] || 0, (await page.evaluate(() => window.__game.TF.K.partFirst)) - 1, '試作部品Ⅰが使われていない');
      assert.notStrictEqual(await page.innerHTML('#arm-tank-w .wico'), icon0, '武器の絵が変わらない');
      assert.notStrictEqual(await page.innerHTML('.armsum .big'), unit0, '戦車のアイコンが変わらない');
      await noHorizontalScroll(page);
      // 部隊タブにも武装が表示される
      await page.click('[data-act="tab"][data-tab="army"]');
      assert((await page.textContent('#scr-army')).includes(await page.evaluate(() => window.__game.TF.armName('tank', 'w', 6))));
    }, Object.assign(midState({ money: 1e6, steel: 1e6 }), { bp: undefined }));
    // 勝てば設計図が増え、特殊武装は苦手な敵に「特効!」
    await withPage('iPhone 13', async page => {
      const bp0 = (await state(page)).bp;
      await page.click('[data-act="tab"][data-tab="sortie"]');
      await page.evaluate(() => { const st = window.__game.state; st.form = st.form.map(f => ({ type: 'tank', hero: f.hero })); });
      await page.click('[data-act="tab"][data-tab="army"]');
      await page.click('[data-act="tab"][data-tab="sortie"]');
      await page.click('[data-act="sortie"]');
      await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.spHits > 0; }, null, { timeout: 20000 });
      await page.click('[data-act="skip"]');
      await page.waitForSelector('#modalWrap:not(.hidden) .result');
      if ((await page.textContent('.result h2')).includes('勝利')) {
        assert((await page.textContent('.result')).includes('設計図'));
        assert((await state(page)).bp > bp0, '勝っても設計図が増えない');
      }
    }, midState({ cleared: 35, sel: 36, bp: 0, speed: 2, arms: { tank: { w: 10, a: 10, x: 10 } },
      bld: { hq: { lv: 8, slot: 4 }, barracks: { lv: 14, slot: 1 }, atpost: { lv: 12, slot: 3 }, factory: { lv: 16, slot: 5 }, artpost: { lv: 10, slot: 7 }, lab: { lv: 8, slot: 8 } } }));
  });

  await test('試作部品: 新型の開発に必要。足りなければ「ボス戦へ」で案内され、ボス戦の初クリアで手に入る', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="arms"]');
    await page.click('[data-act="arm-type"][data-t="tank"]');
    assert(!(await page.isEnabled('[data-act="arm-up"][data-t="tank"][data-k="w"]')), '部品なしで開発ボタンが押せる');
    assert((await page.textContent('#arm-tank-w')).includes('試作部品Ⅰが不足'));
    assert((await page.textContent('.partsbar')).includes('Ⅰ'));
    // 素材をタップすると、ドロップするステージへ飛ぶ: 上の部品一覧・カードの必要素材・「ボス戦へ」
    await page.click('.partsbar [data-act="part-go"][data-g="1"]');
    let s = await state(page);
    assert.strictEqual(s.sel, 10, '部品一覧からボス戦に飛べない');
    assert.strictEqual(s.tab, 'sortie');
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

  await test('自軍は川の手前から橋を渡って前線へ。戦闘中は狙いの線が出て、敵の前に土のうの壁がある', () => withPage('iPhone 13', async page => {
    await page.click('[data-act="tab"][data-tab="sortie"]');
    await page.click('[data-act="auto"]');
    await page.click('[data-act="sortie"]');
    await page.waitForSelector('#battle:not(.hidden)');
    const d0 = await page.evaluate(() => window.__game.battle.debug());
    assert(d0.minAllyY < d0.bridgeY, '開始時に川の手前にいない ' + d0.minAllyY);
    assert(d0.wallsTotal > 20 && d0.walls === d0.wallsTotal);
    await page.waitForFunction(() => { const d = window.__game.battle.debug(); return d && d.phase === 'fight' && d.clock > 1.5; }, null, { timeout: 15000 });
    const d1 = await page.evaluate(() => window.__game.battle.debug());
    assert(d1.minAllyY > d1.bridgeY, '川を渡っていない ' + d1.minAllyY);
    assert(d1.aims > 0, '狙いの線が出ない');
    await page.click('[data-act="skip"]');
    await page.waitForSelector('#modalWrap:not(.hidden) .result', { timeout: 8000 });
  }, midState({ cleared: 14, sel: 15 })));

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
