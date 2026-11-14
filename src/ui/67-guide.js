  // ====== 最初の案内(押す場所を示す) ======
  // 最初の戦闘 → 補給所を建てる → 兵舎を強化 → ステージ2へ出撃、までを吹き出しと光る輪で案内する。
  // 進み具合はデータの状態から決める(どの順で押しても迷子にならない)。✕ でいつでもやめられる
  var Guide = (function () {
    var box = null, ring = null, timer = null, last = '';
    function sheetOpen() { return !$('sheetWrap').classList.contains('hidden'); }
    function step() {
      if (!st || !st.flags || !(st.flags.tut >= 1) || st.flags.tut >= 9) return null;
      if (Battle.active() || Title.active() || !$('modalWrap').classList.contains('hidden')) return null;
      if (st.cleared < 1) return null; // 最初の戦闘は、着任のあいさつから始まる
      var L = function (id) { return TF.lv(st, id); }, so = sheetOpen();
      if (!L('supply')) {
        if (so) return document.querySelector('[data-act="build"][data-id="supply"]') ? { sel: '[data-act="build"][data-id="supply"]', text: '「補給所」を建てよう。資金を自動で生産します' } : { sel: '.sheet .close', text: 'いったん閉じよう' };
        if (curTab !== 'base') return { sel: '#tabs [data-tab="base"]', text: '報酬で基地を育てよう。「基地」へ' };
        return { sel: '.tile.empty', text: '空いている区画をタップ' };
      }
      if (L('barracks') < 2) {
        if (so) return document.querySelector('[data-act="upgrade"][data-id="barracks"]') ? { sel: '[data-act="upgrade"][data-id="barracks"]', text: '「強化」を押すと、歩兵が強くなります' } : { sel: '.sheet .close', text: 'いったん閉じよう' };
        if (curTab !== 'base') return { sel: '#tabs [data-tab="base"]', text: '「基地」で兵舎を強化しよう' };
        return { sel: '.tile[data-slot="' + st.bld.barracks.slot + '"]', text: '「兵舎」をタップ' };
      }
      if (st.cleared < 2) {
        if (so) return { sel: '.sheet .close', text: '強くなった! 閉じて出撃へ' };
        if (curTab !== 'sortie') return { sel: '#tabs [data-tab="sortie"]', text: '「出撃」でステージ2へ' };
        return { sel: '[data-act="sortie"]', text: '「出撃!」で戦闘開始', scroll: true };
      }
      return 'done';
    }
    function ensure() {
      if (box) return;
      box = document.createElement('div'); box.id = 'coach'; box.className = 'hidden';
      box.innerHTML = '<span id="coachTx"></span><button data-act="guide-skip" aria-label="案内をやめる">✕</button>';
      ring = document.createElement('div'); ring.id = 'coachRing'; ring.className = 'hidden';
      document.body.appendChild(ring); document.body.appendChild(box);
      // 画面を動かしたら、すぐ輪を付け直す
      ['main', 'sheet'].forEach(function (id) { $(id).addEventListener('scroll', function () { if (timer) update(); }, { passive: true }); });
      window.addEventListener('resize', function () { if (timer) update(); });
    }
    function hide() { if (box) { box.classList.add('hidden'); ring.classList.add('hidden'); } last = ''; }
    function update() {
      var s = step();
      if (s === 'done') {
        st.flags.tut = 9; save(); hide(); stop();
        toast('案内はここまで。あとは基地の「司令室」の指令と任務が道しるべです');
        return;
      }
      if (!s) { hide(); if (!st || !st.flags || !(st.flags.tut >= 1) || st.flags.tut >= 9) stop(); return; }
      ensure(); start();
      var t = document.querySelector(s.sel);
      if (!t) { hide(); return; }
      var key = s.sel + '|' + s.text;
      if (s.scroll && key !== last) { try { t.scrollIntoView({ block: 'center' }); } catch (e) { } }
      var r = t.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
      if (r.width < 2 || r.bottom < 0 || r.top > H) { hide(); last = key; return; } // まだ画面の外(シートが開く途中など)。次の確認で出す
      ring.classList.remove('hidden'); box.classList.remove('hidden');
      ring.style.left = (r.left - 5) + 'px'; ring.style.top = (r.top - 5) + 'px'; ring.style.width = (r.width + 10) + 'px'; ring.style.height = (r.height + 10) + 'px';
      if ($('coachTx').textContent !== s.text) $('coachTx').textContent = s.text;
      last = key;
      var bw = Math.min(W - 16, box.offsetWidth), bh = box.offsetHeight, cx = r.left + r.width / 2;
      var x = Math.max(8, Math.min(W - bw - 8, cx - bw / 2)), below = r.top < bh + 30, y = below ? r.bottom + 14 : r.top - bh - 14;
      box.style.left = x + 'px'; box.style.top = Math.max(4, Math.min(H - bh - 4, y)) + 'px';
      box.classList.toggle('below', below);
      box.style.setProperty('--ax', Math.max(14, Math.min(bw - 14, cx - x)) + 'px');
    }
    function start() { if (!timer) timer = setInterval(update, 300); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    return {
      update: update,
      begin: function () { st.flags.tut = 1; save(); },
      skip: function () { st.flags.tut = 9; save(); hide(); stop(); toast('案内をやめました。基地の「司令室」に次の指令が出ます'); },
      active: function () { return !!(st && st.flags && st.flags.tut >= 1 && st.flags.tut < 9); },
      debug: function () { var s = step(); return { tut: st && st.flags ? st.flags.tut : null, step: s && s !== 'done' ? s : null, shown: !!box && !box.classList.contains('hidden'), text: box ? $('coachTx').textContent : '' }; }
    };
  })();
