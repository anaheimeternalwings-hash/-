  // ====== おかえり ======
  function welcomeBack(away) {
    var info = TF.storedInfo(st, now());
    var gm = info.supply ? info.supply.stored : 0, gs = info.steel ? info.steel.stored : 0;
    if (gm + gs <= 0) return;
    openModal('<div class="result"><h2 class="win" style="font-size:24px">おかえりなさい、司令官</h2><div class="sub">留守の間(' + fmtDur(away) + ')も基地は稼働していました。</div>' +
      '<div class="rlist"><div class="rline">' + icoMoney() + '<span class="grow">補給所の資金</span><b class="num">' + fmt(gm) + '</b></div><div class="rline">' + icoSteel() + '<span class="grow">製鋼所の鋼材</span><b class="num">' + fmt(gs) + '</b></div></div>' +
      '<div class="small" style="text-align:center">放置で貯まる上限は ' + TF.capHours(st) + '時間分(倉庫で延長)</div>' +
      '<div class="btns"><button class="btn wide green big" data-act="welcome-collect">回収する</button></div></div>');
  }

  // ====== メニュー ======
  function openMenu() {
    var html = '<div class="grab"></div><button class="close" data-act="sheet-close" aria-label="閉じる">✕</button><h3>メニュー</h3>';
    html += '<div class="card small" style="margin-top:10px;line-height:1.7">戦闘回数 ' + st.stats.battles + '(勝利 ' + st.stats.wins + ')<br>進行状況は自動で保存され、次に開いたときは続きから再開します。<br>ホーム画面に追加すると、全画面で遊べます。</div>';
    var sc = SND.cfg();
    html += '<h2 class="sec">音</h2><div class="card sndcfg">' +
      '<label><span>音楽</span><input type="range" min="0" max="100" step="5" value="' + Math.round(sc.bgm * 100) + '" data-snd="bgm" aria-label="音楽の音量"><b class="num" id="sndv-bgm">' + Math.round(sc.bgm * 100) + '</b></label>' +
      '<label><span>効果音</span><input type="range" min="0" max="100" step="5" value="' + Math.round(sc.se * 100) + '" data-snd="se" aria-label="効果音の音量"><b class="num" id="sndv-se">' + Math.round(sc.se * 100) + '</b></label>' +
      '<button class="btn sub wide' + (sc.mute ? ' on' : '') + '" data-act="snd-mute" id="sndMute">' + (sc.mute ? '消音中(タップで音を出す)' : '消音にする') + '</button>' +
      '<div class="small" style="margin-top:6px">iPhone 本体の消音スイッチが入っていると、音は出ません。</div></div>';
    html += '<h2 class="sec">引き継ぎ(バックアップ)</h2><div class="small">下のコードを保存しておけば、データが消えても復元できます。</div>' +
      '<textarea id="exportBox" readonly>' + esc(exportCode()) + '</textarea><div class="row" style="margin-top:8px"><button class="btn sub grow" data-act="copy-export">コードをコピー</button></div>' +
      '<textarea id="importBox" placeholder="ここに引き継ぎコードを貼り付け" style="margin-top:10px;height:70px"></textarea><div class="row" style="margin-top:8px"><button class="btn sub grow" data-act="import">コードから復元</button></div>';
    html += '<h2 class="sec">データ</h2><button class="btn red wide" data-act="reset">最初からやり直す</button>';
    openSheet(html);
  }
  function exportCode() {
    try { return 'ZC1:' + btoa(unescape(encodeURIComponent(JSON.stringify(st)))); } catch (e) { return ''; }
  }
  function importCode(code) {
    try {
      code = (code || '').trim();
      if (code.indexOf('ZC1:') !== 0) return false;
      var o = sanitize(JSON.parse(decodeURIComponent(escape(atob(code.slice(4))))));
      if (!o) return false;
      st = o; st.pending = null; save(); return true;
    } catch (e) { return false; }
  }

  // ====== 操作 ======
  var actions = {
    tab: function (el) { show(el.dataset.tab); },
    'base-zoom': function (el) { BaseView.step(+el.dataset.d); },
    'part-info': function (el) {
      var g = +el.dataset.g;
      toast(TF.partName(g) + ': ' + partWhere(g) + 'で手に入ります(初クリアで' + TF.K.partFirst + '個)');
    },
    // 素材(試作部品)をタップ → ドロップするボス戦のステージへ
    items: function () { openItems(); },
    'part-go': function (el) {
      closeSheet();
      var g = +el.dataset.g, list = TF.partStages(g), s0 = list.filter(function (x) { return x <= st.cleared; }).pop();
      if (!s0) {
        s0 = Math.min(st.cleared + 1, list[0]);
        toast(s0 === list[0] ? 'ステージ' + s0 + 'のボスを倒すと' + TF.partName(g) + 'が手に入ります(初クリアで' + TF.K.partFirst + '個)' : partWhere(g) + 'はまだ先です(ステージ' + list[0] + 'まで進もう)');
      } else toast('ステージ' + s0 + 'のボス戦で' + TF.partName(g) + 'が手に入ります');
      st.sel = s0; save(); show('sortie');
    },
    // 素材(設計図)をタップ → 勝てて稼げるステージへ(設計図は先のステージ・ボス戦ほど多い)
    'bp-go': function () {
      closeSheet();
      if (st.cleared < 1) { st.sel = 1; save(); show('sortie'); return; }
      toast('設計図を集めやすいステージを探しています…');
      setTimeout(function () {
        var f = bestFarm();
        if (!f) return;
        st.sel = f.s; save(); show('sortie');
        toast('設計図はステージ' + f.s + 'で集めよう(予想勝率' + Math.round(f.wr * 100) + '%・1勝で設計図' + TF.stageReward(f.s).bp + ')');
      }, 30);
    },
    'arm-type': function (el) { st.flags.armSel = el.dataset.t; save(); renderArms(); },
    'arm-up': function (el) {
      var t = el.dataset.t, k = el.dataset.k;
      var r = TF.doArm(st, t, k);
      if (!r.ok) { SND.play('err'); toast(r.reason); return; }
      SND.play(r.dev ? 'dev' : 'upgrade');
      save(); render(); bump('resM'); bump('resS');
      var card = $('arm-' + t + '-' + k);
      if (card) {
        card.classList.add('flash');
        var f = document.createElement('div'); f.className = 'armfloat'; f.textContent = 'Lv' + r.lv + '! ' + armEffText(t, k, r.lv).replace(/^.* /, '');
        card.appendChild(f);
      }
      if (r.dev) showDevDone(t, k, r);
    },
    tile: function (el) {
      var slot = +el.dataset.slot, id = null;
      Object.keys(st.bld).forEach(function (k) { if (st.bld[k].slot === slot) id = k; });
      if (id) openBuilding(id); else openBuildMenu(slot);
    },
    build: function (el) {
      var id = el.dataset.id;
      var r = TF.doUpgrade(st, id, now(), +el.dataset.slot);
      if (!r.ok) { SND.play('err'); toast(r.reason); return; }
      SND.play('build');
      toast(TF.BLD[id].name + 'を建設しました!');
      if (TF.BLD[id].unit) toast(TF.UNIT[TF.BLD[id].unit].name + 'が使えるようになりました');
      save(); closeSheet(); render(); bump('resM'); bump('resS');
    },
    upgrade: function (el) {
      var id = el.dataset.id;
      var beforeSlots = TF.slots(st);
      var r = TF.doUpgrade(st, id, now());
      if (!r.ok) { SND.play('err'); toast(r.reason); return; }
      SND.play('upgrade');
      if (id === 'hq') {
        st.form = TF.normalizeForm(st, st.form);
        if (TF.slots(st) > beforeSlots) toast('部隊の枠が ' + TF.slots(st) + ' に増えました!');
        var unl = TF.BLD_ORDER.filter(function (k) { return TF.BLD[k].req === TF.lv(st, 'hq'); });
        if (unl.length) toast(unl.map(function (k) { return TF.BLD[k].name; }).join('・') + 'が建設可能に!');
      }
      toast(TF.BLD[id].name + ' Lv' + TF.lv(st, id) + 'に強化しました');
      save(); render(); openBuilding(id);
    },
    collect: function (el) {
      var g = TF.collect(st, now());
      if (g.m + g.s > 0) {
        SND.play('collect');
        toast('資金+' + fmt(g.m) + ' 鋼材+' + fmt(g.s) + 'を回収');
        var from = el && el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (g.m > 0) coinFly(from, 'resM', 'i-money', 10);
        if (g.s > 0) coinFly(from, 'resS', 'i-steel', 6);
      }
      save(); render();
    },
    'welcome-collect': function () { closeModal(); actions.collect(); showHeroJoin(); },
    'sheet-close': function () {
      var wasSlot = sheetCtx && sheetCtx.kind === 'slot';
      closeSheet();
      if (wasSlot) render();
    },
    stage: function (el) {
      st.sel = Math.min(st.cleared + 1, Math.max(1, st.sel + (+el.dataset.d)));
      save(); renderSortie();
    },
    'stage-latest': function () { st.sel = st.cleared + 1; save(); renderSortie(); },
    slot: function (el) { openSlot(+el.dataset.i); },
    'set-type': function (el) {
      var i = +el.dataset.i;
      st.form[i].type = el.dataset.t;
      save(); openSlot(i, true);
    },
    'set-hero': function (el) {
      var i = +el.dataset.i, h = el.dataset.h || null;
      if (h) st.form.forEach(function (f) { if (f.hero === h) f.hero = null; });
      st.form[i].hero = h;
      save(); openSlot(i, true);
    },
    auto: function () {
      st.form = TF.autoFormation(st, st.sel);
      save(); renderSortie(); toast('おまかせ編成しました');
    },
    sortie: function () { startSortie(); },
    mode: function (el) { st.auto = el.dataset.m === 'auto'; save(); renderSortie(); },
    'auto-toggle': function () { var v = Battle.toggleAuto(); if (v !== null) { st.auto = v; save(); } },
    skill: function (el) { Battle.castSkill(+el.dataset.u); },
    'cam-reset': function () { Battle.camReset(); },
    'sup-launch': function (el) { Battle.launchSupport(el.dataset.kind); },
    'deploy-go': function () { Battle.deployGo(); },
    'terrain-info': function (el) { var tr = TF.TERRAIN[el.dataset.k]; toast(tr.name + ': ' + tr.desc); },
    'deploy-auto': function () { Battle.deployAuto(); },
    'deploy-skipnext': function (el) {
      st.flags.skipDeploy = el.checked ? 1 : 0; save();
      if (el.checked) toast('次回から配置を省略します(出撃画面の「配置」でいつでも戻せます)');
    },
    'deploy-mode': function (el) { st.flags.skipDeploy = el.dataset.m === 'off' ? 1 : 0; save(); renderSortie(); },
    'farm-find': function (el) {
      el.textContent = '探しています…';
      el.disabled = true;
      setTimeout(function () {
        var f = bestFarm();
        if (!f) { renderSortie(); return; }
        st.sel = f.s;
        st.form = TF.autoFormation(st, f.s);
        save(); renderSortie();
        openModal('<div class="result"><h2 class="win" style="font-size:24px">稼ぎにおすすめ</h2><div class="card small" style="line-height:1.7;margin-top:10px">' + farmText(f) +
          '<br>ステージ' + f.s + 'を選び、おまかせ編成にしました。</div><div class="btns"><button class="btn wide" data-act="modal-close">OK</button></div></div>');
      }, 30);
    },
    'modal-close': function () { closeModal(); },
    speed: function (el) { st.speed = +el.dataset.sp; Battle.setSpeed(st.speed); save(); },
    skip: function () { Battle.skip(); },
    'r-next': function () { closeModal(); if (!showHeroJoin()) { st.sel = st.cleared + 1; show('sortie'); } },
    'r-retry': function () { closeModal(); if (!showHeroJoin()) startSortie(); },
    'r-form': function () { closeModal(); if (!showHeroJoin()) show('sortie'); },
    'r-base': function () { closeModal(); if (!showHeroJoin()) show('base'); },
    'r-farm': function (el) {
      closeModal();
      st.sel = +el.dataset.s;
      st.form = TF.autoFormation(st, st.sel);
      save(); show('sortie');
    },
    'hero-ok': function () {
      closeModal();
      if (!showHeroJoin()) { st.form = TF.normalizeForm(st, st.form); show('sortie'); }
    },
    menu: function () { openMenu(); },
    goals: function (el) { openGoals(el.dataset.tab); },
    'ms-claim': function (el) {
      var r = TF.msClaim(st, +el.dataset.i);
      if (!r) { SND.play('err'); return; }
      SND.play(r.all ? 'medal' : 'collect'); claimFx(el, r);
      if (r.all) toast('今日の任務をすべて達成! 追加の報酬を受け取りました');
      save(); render(); openGoals('ms');
    },
    'medal-claim': function (el) {
      var r = TF.medalClaim(st, el.dataset.id);
      if (!r) { SND.play('err'); return; }
      SND.play('medal'); claimFx(el, r);
      toast(r.name + '(' + r.tier + ')を授与されました');
      save(); render(); openGoals('medal');
    },
    'v2-ok': function () { closeModal(); if (TF.medalClaimable(st)) openGoals('medal'); else showHeroJoin(); },
    'title-start': function () { Title.start(); },
    'title-snd': function () { Title.toggleSnd(); },
    'snd-mute': function () { var m = !SND.cfg().mute; SND.set({ mute: m }); if (!m) SND.play('ok'); openMenu(); },
    'copy-export': function () {
      var box = $('exportBox');
      var done = function () { toast('コピーしました'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(box.value).then(done, function () { box.select(); document.execCommand('copy'); done(); });
      else { box.select(); document.execCommand('copy'); done(); }
    },
    import: function () {
      if (importCode($('importBox').value)) {
        closeSheet(); TF.clearCache();
        pendingHeroes = TF.grantHeroes(st); save();
        show(st.tab); toast('データを復元しました'); showHeroJoin();
      }
      else toast('コードが正しくありません');
    },
    reset: function () {
      if (!confirm('本当に最初からやり直しますか?(元に戻せません)')) return;
      if (!confirm('すべての施設・指揮官・進行状況が消えます。よろしいですか?')) return;
      st = TF.newState(now()); st.flags = { v2: 1 }; st.lastSeen = now(); TF.msState(st, dayNum());
      save(); closeSheet(); show('base'); intro();
    },
    'intro-ok': function () { closeModal(); st.flags.intro = 1; save(); },
    // 案内つきで始める: そのまま最初の戦闘へ(配置はおまかせ)
    'intro-go': function () {
      closeModal(); st.flags.intro = 1; st.flags.skipDeploy = 1; st.flags.depTip = 0; st.auto = true; st.sel = 1;
      Guide.begin(); show('sortie'); startSortie();
    },
    'guide-skip': function () { Guide.skip(); },
    // 配置の案内(ステージ6)
    'dep-yes': function () { closeModal(); st.flags.depTip = 1; st.flags.skipDeploy = 0; save(); startSortie(); },
    'dep-no': function () { closeModal(); st.flags.depTip = 1; save(); startSortie(); }
  };
  // ボタンの音: ふつうは小さなタップ音。自分で音を鳴らす操作(強化・回収など)は null
  var ACT_SND = { tab: 'tab', 'sheet-close': 'close', 'modal-close': 'close', menu: 'open', items: 'open', tile: 'open', slot: 'open', sortie: 'ok', 'deploy-go': null,
    upgrade: null, build: null, 'arm-up': null, collect: null, 'ms-claim': null, 'medal-claim': null, goals: 'open', 'v2-ok': 'ok', 'welcome-collect': null, skill: null, 'sup-launch': null, 'r-next': 'ok', 'r-retry': 'ok', 'intro-go': 'ok', 'dep-yes': 'ok', 'hero-ok': 'ok', 'intro-ok': 'ok', 'title-start': null, 'snd-mute': null };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    if (el.dataset.act === 'tile' && BaseView.blocked()) return; // 基地を拡大・移動した指を離しただけ
    var fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); var sn = ACT_SND[el.dataset.act]; if (sn !== null) SND.play(sn || 'tap'); fn(el); Guide.update(); }
  });
  // 音量のつまみ(メニュー)
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (!el || !el.dataset || el.dataset.snd === undefined) return;
    var o = {}; o[el.dataset.snd] = +el.value / 100; SND.set(o);
    var lab = $('sndv-' + el.dataset.snd); if (lab) lab.textContent = el.value;
    if (el.dataset.snd === 'se') SND.play('coin');
  });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('touchstart', function () { }, { passive: true }); // iOS Safari で :active を効かせる

  function intro() {
    if (st.flags.intro) return;
    openModal('<div class="result"><div style="display:grid;place-items:center"><div class="portrait" style="width:112px;height:112px;border-radius:20px">' + heroSvg('oni') + '</div></div>' +
      '<h2 class="win" style="font-size:24px;margin-top:8px">着任ご苦労であります!</h2>' +
      '<div class="card small" style="line-height:1.75;margin-top:10px">司令官、敵の前哨が目の前です。<br>まずは一戦、手並みを拝見!<br><span style="color:var(--sub)">負けても兵は失いません。進行は自動で保存されます。</span>' +
      '<div style="text-align:right;color:var(--khaki)">― 軍曹 鬼塚 剛</div></div>' +
      '<div class="btns"><button class="btn wide big" data-act="intro-go">出撃する!</button><button class="btn sub wide" data-act="intro-ok" style="min-height:44px;font-size:13px">案内なしで、自分で進める</button></div></div>');
  }

