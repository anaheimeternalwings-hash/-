  // ====== アプリのアイコン(ホーム画面用PNGを生成) ======
  function makeTouchIcon() {
    try {
      var c = document.createElement('canvas'); c.width = c.height = 180;
      var g = c.getContext('2d');
      var grd = g.createLinearGradient(0, 0, 0, 180); grd.addColorStop(0, '#3f4f30'); grd.addColorStop(1, '#1f2818');
      g.fillStyle = grd; g.fillRect(0, 0, 180, 180);
      g.fillStyle = '#f1c453'; g.beginPath();
      for (var i = 0; i < 10; i++) { var r = i % 2 ? 30 : 70, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(90 + Math.cos(a) * r, 92 + Math.sin(a) * r); }
      g.closePath(); g.fill();
      var l = document.createElement('link'); l.rel = 'apple-touch-icon'; l.href = c.toDataURL('image/png');
      document.head.appendChild(l);
    } catch (e) { }
  }

  // ====== 起動 ======
  function boot() {
    var loaded = load();
    var fresh = !loaded;
    st = loaded || TF.newState(now());
    if (fresh) { st.flags = { v2: 1 }; st.lastSeen = now(); }
    TF.msState(st, dayNum());
    var away = now() - (st.lastSeen || now());
    TF.settle(st, now());
    // 着任のステージをクリア済みの指揮官(あとから追加された指揮官など)は、ここで着任
    if (!fresh) pendingHeroes = TF.grantHeroes(st);
    curTab = st.tab || 'base';
    show(curTab);
    setInterval(function () { liveBase(); renderTop(); }, 1000);
    setInterval(save, 15000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) save();
      else { var a = now() - (st.lastSeen || now()); TF.settle(st, now()); render(); if (a > 10 * 60000 && !Battle.active() && !Title.active() && $('modalWrap').classList.contains('hidden')) welcomeBack(a); }
    });
    window.addEventListener('pagehide', save);
    makeTouchIcon();
    if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) { } }
    Title.show(function () {
      if (st.pending) {
        // 戦闘の途中で閉じた場合は、結果をそのまま反映する
        finishBattle();
      } else if (fresh) {
        intro();
      } else if (v2Notice()) {
        // 新しい版のお知らせ(1回だけ)
      } else if (away > 10 * 60000 && TF.storedInfo(st, now()) && hasStored()) {
        welcomeBack(away); // 回収のあとに着任の画面
      } else {
        showHeroJoin();
      }
      save();
    });
    save();
  }
  function hasStored() { var info = TF.storedInfo(st, now()); return ((info.supply ? info.supply.stored : 0) + (info.steel ? info.steel.stored : 0)) > 0; }
  window.__game = { get state() { return st; }, TF: TF, snd: SND, title: Title, guide: Guide, save: save, render: render, baseView: BaseView, battle: Battle, map: MapView, heroSvg: heroSvg, ecmdSvg: ecmdSvg, bestFarm: function () { farmCache = null; return bestFarm(); } };
  boot();
