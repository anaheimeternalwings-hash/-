  // ====== タイトル画面 ======
  // 起動のたびに出る。タップで始まり、その操作で音も有効になる(iOS は最初の操作まで音を出せない)
  var Title = (function () {
    var cb = null, shown = false;
    function kv(id, cls) {
      var k = 'h.' + id;
      if (!ART.has(k)) return '';
      var f = ART.face(k);
      return '<div class="tpanel ' + cls + '"><i style="background-image:url(' + ART.url(k) + ');background-position:' + Math.round(f[0] * 100) + '% ' + Math.round(f[1] * 100 - 6) + '%"></i></div>';
    }
    function sndLabel() { $('titleSnd').textContent = SND.cfg().mute ? '音 OFF' : '音 ON'; $('titleSnd').classList.toggle('off', SND.cfg().mute); }
    function show(fn) {
      cb = fn; shown = true;
      var el = $('title'), fresh = !st.stats.battles && !st.cleared;
      $('titleKv').innerHTML = kv('taka', 'l') + kv('oni', 'c') + kv('tetsu', 'r');
      $('titleSub').textContent = fresh ? 'はじめから' : 'つづきから ・ ステージ' + (st.cleared + 1);
      sndLabel();
      el.classList.remove('hidden', 'out');
    }
    function start() {
      if (!shown) return;
      shown = false;
      SND.unlock(); SND.play('title'); SND.bgm('menu');
      var el = $('title');
      el.classList.add('out');
      setTimeout(function () { el.classList.add('hidden'); $('titleKv').innerHTML = ''; }, 520);
      var f = cb; cb = null;
      if (f) f();
    }
    return { show: show, start: start, active: function () { return shown; }, toggleSnd: function () { SND.set({ mute: !SND.cfg().mute }); sndLabel(); if (!SND.cfg().mute) { SND.unlock(); SND.play('ok'); } } };
  })();
