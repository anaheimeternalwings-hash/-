  var SAVE_KEY = 'zensen-commander-save-v1';
  var st = null;
  var curTab = 'base';
  var dirtyWr = true, wrCache = null;

  // ====== 小道具 ======
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function trimNum(s) { return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
  function fmt(n) {
    n = Math.floor(n || 0);
    if (n < 100000) return n.toLocaleString('ja-JP');
    if (n < 1e8) return trimNum((n / 1e4).toFixed(n < 1e6 ? 2 : 1)) + '万';
    if (n < 1e12) return trimNum((n / 1e8).toFixed(n < 1e9 ? 2 : 1)) + '億';
    return trimNum((n / 1e12).toFixed(2)) + '兆';
  }
  // 上の資源表示用の短い書き方(幅の狭い画面でも切れないように)
  function fmtTop(n) {
    n = Math.floor(n || 0);
    if (n < 100000) return n.toLocaleString('ja-JP');
    if (n < 1e6) return trimNum((n / 1e4).toFixed(1)) + '万';
    if (n < 1e8) return Math.floor(n / 1e4) + '万';
    if (n < 1e12) return trimNum((n / 1e8).toFixed(n < 1e10 ? 1 : 0)) + '億';
    return fmt(n);
  }
  function fmtDur(ms) {
    var m = Math.floor(ms / 60000);
    if (m < 1) return Math.max(1, Math.floor(ms / 1000)) + '秒';
    if (m < 60) return m + '分';
    var h = Math.floor(m / 60);
    return h + '時間' + (m % 60 ? (m % 60) + '分' : '');
  }
  function now() { return Date.now(); }
  function icoMoney(cls) { return '<svg viewBox="0 0 24 24"' + (cls ? ' class="' + cls + '"' : '') + '><use href="#i-money"/></svg>'; }
  // 特殊ユニットの絵(横から見たシルエット)
  var SUP_ICON = {
    heli: '<svg viewBox="0 0 64 32"><path d="M8 8h48" stroke="#2b2f33" stroke-width="2"/><rect x="31" y="8" width="2" height="5" fill="#2b2f33"/><path d="M22 13h20c5 0 9 3 9 7v2H26l-6-4z" fill="#4f5a3a"/><path d="M42 14h4l4 5h-8z" fill="#8fdcff"/><path d="M4 15h20l2 3H6z" fill="#4f5a3a"/><rect x="2" y="11" width="3" height="7" fill="#4f5a3a"/><rect x="26" y="22" width="18" height="2" fill="#3a412b"/><path d="M28 24l-2 4M42 24l2 4M24 28h22" stroke="#2b2f33" stroke-width="1.5"/><rect x="30" y="18" width="12" height="3" rx="1.5" fill="#2b2f33"/></svg>',
    air: '<svg viewBox="0 0 64 32"><path d="M6 17h46l8 2-8 2H6z" fill="#6b747c"/><path d="M28 17l-8-12h6l12 12z" fill="#59626a"/><path d="M28 21l-8 9h6l12-9z" fill="#4c545b"/><path d="M6 17l-3-9h5l7 9z" fill="#59626a"/><rect x="10" y="12" width="9" height="4" rx="2" fill="#4c545b"/><path d="M46 17l4-3h3l2 3z" fill="#8fdcff"/><rect x="56" y="18" width="7" height="1.2" fill="#2b2f33"/></svg>',
    drone: '<svg viewBox="0 0 64 32"><rect x="12" y="13" width="36" height="6" rx="3" fill="#6b6f5a"/><path d="M48 13c5 0 9 1.5 10 3-1 1.5-5 3-10 3z" fill="#4c4f40"/><path d="M26 16l-8-10h4l10 10z" fill="#55594a"/><path d="M26 16l-8 10h4l10-10z" fill="#55594a"/><path d="M12 16l-6-6h3l6 6zM12 16l-6 6h3l6-6z" fill="#55594a"/><circle cx="56" cy="16" r="1.4" fill="#ff5a4a"/></svg>'
  };
  function icoPart(cls) { return '<svg viewBox="0 0 24 24"' + (cls ? ' class="' + cls + '"' : '') + '><use href="#i-part"/></svg>'; }
  function partWhere(g) { return 'ステージ' + TF.partStages(g).join('・') + 'のボス戦'; }
  // 戦闘ごとの試作部品の抽選(出撃時の乱数から決まるので、閉じて開き直しても変わらない)
  function partRoll(seed) { return TF.hashInt((seed | 0) ^ 0x5bd1e995) / 4294967296; }
  function icoBp(cls) { return '<svg viewBox="0 0 24 24"' + (cls ? ' class="' + cls + '"' : '') + '><use href="#i-bp"/></svg>'; }
  function icoSteel(cls) { return '<svg viewBox="0 0 24 24"' + (cls ? ' class="' + cls + '"' : '') + '><use href="#i-steel"/></svg>'; }
  function costHtml(c) {
    return '<span class="cost' + (st.money < c.m ? ' short' : '') + '">' + icoMoney() + fmt(c.m) + '</span>' +
      '<span class="cost' + (st.steel < c.s ? ' short' : '') + '">' + icoSteel() + fmt(c.s) + '</span>';
  }
  function toast(msg) {
    var d = document.createElement('div');
    d.textContent = msg;
    $('toast').appendChild(d);
    setTimeout(function () { d.remove(); }, 2700);
  }
  // 回収したコイン(鋼材)が、上の表示へ飛んでいく
  function coinFly(fromRect, toId, icon, n) {
    var to = $(toId).getBoundingClientRect();
    var fx = fromRect ? fromRect.left + fromRect.width / 2 : window.innerWidth / 2, fy = fromRect ? fromRect.top + fromRect.height / 2 : window.innerHeight / 2;
    var tx = to.left + 18, ty = to.top + to.height / 2;
    for (var i = 0; i < n; i++) (function (i) {
      var d = document.createElement('div');
      d.className = 'coinfly';
      d.innerHTML = '<svg viewBox="0 0 24 24"><use href="#' + icon + '"/></svg>';
      var ox = (Math.random() - 0.5) * 60, oy = (Math.random() - 0.5) * 30;
      d.style.left = (fx + ox) + 'px'; d.style.top = (fy + oy) + 'px';
      d.style.transitionDelay = (i * 0.04) + 's';
      document.body.appendChild(d);
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        d.style.transform = 'translate(' + (tx - fx - ox) + 'px,' + (ty - fy - oy) + 'px) scale(.7)';
        d.style.opacity = '0.4';
      }); });
      setTimeout(function () { d.remove(); if (i === n - 1) bump(toId); }, 800 + i * 40);
    })(i);
  }
  function bump(id) { var e = $(id); e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); }

