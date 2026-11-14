var TF = (function () {
  'use strict';

  // ====== 乱数 ======
  function rngFrom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashInt(n) {
    n = (n ^ 61) ^ (n >>> 16);
    n = (n + (n << 3)) | 0;
    n = n ^ (n >>> 4);
    n = Math.imul(n, 0x27d4eb2d);
    n = n ^ (n >>> 15);
    return n >>> 0;
  }

  // ====== 兵種 ======
  var TYPES = ['inf', 'at', 'tank', 'art'];
  var UNIT = {
    inf:  { name: '歩兵',     short: '歩', hp: 110, atk: 13, cd: 1.0,  bld: 'barracks' },
    at:   { name: '対戦車兵', short: '対', hp: 95,  atk: 15, cd: 1.15, bld: 'atpost' },
    tank: { name: '戦車',     short: '戦', hp: 160, atk: 18, cd: 1.4,  bld: 'factory' },
    art:  { name: '砲兵',     short: '砲', hp: 85,  atk: 22, cd: 1.6,  bld: 'artpost' }
  };
  // AFF[攻撃側][防御側] = ダメージ倍率
  var AFF = {
    inf:  { inf: 1.0,  at: 1.5, tank: 0.6, art: 1.5 },
    tank: { inf: 1.5,  at: 0.5, tank: 1.0, art: 1.5 },
    at:   { inf: 0.75, at: 0.8, tank: 2.6, art: 0.75 },
    art:  { inf: 1.5,  at: 1.5, tank: 0.6, art: 1.0 }
  };

  var AFF2 = {};
  Object.keys(AFF).forEach(function (a) { AFF2[a] = {}; Object.keys(AFF[a]).forEach(function (d) { AFF2[a][d] = AFF[a][d] * AFF[a][d]; }); });

  // ====== 建物 ======
  // cm/cs: 建設費(資金/鋼材), g: 強化費の伸び
  var BLD = {
    hq:       { name: '司令部',     req: 1, cm: 300, cs: 170, g: 2.15 },
    supply:   { name: '補給所',     req: 1, cm: 100, cs: 40,  g: 1.95 },
    steel:    { name: '製鋼所',     req: 1, cm: 110, cs: 30,  g: 1.95 },
    depot:    { name: '倉庫',       req: 2, cm: 200, cs: 120, g: 2.0 },
    barracks: { name: '兵舎',       req: 1, cm: 60,  cs: 30,  g: 1.95, unit: 'inf' },
    atpost:   { name: '対戦車陣地', req: 2, cm: 80,  cs: 40,  g: 1.95, unit: 'at' },
    factory:  { name: '戦車工場',   req: 2, cm: 90,  cs: 60,  g: 1.95, unit: 'tank' },
    artpost:  { name: '砲兵陣地',   req: 3, cm: 90,  cs: 50,  g: 1.95, unit: 'art' },
    lab:      { name: '研究所',     req: 3, cm: 200, cs: 130, g: 2.05 }
  };
  var BLD_ORDER = ['supply', 'steel', 'depot', 'barracks', 'atpost', 'factory', 'artpost', 'lab'];
  var TYPE_BLD = { inf: 'barracks', at: 'atpost', tank: 'factory', art: 'artpost' };

  // ====== 指揮官 ======
  // それぞれ特徴がある: atk/hp = 率いる部隊の攻撃・耐久の傾向、base/grow = Lv1の強さとレベルごとの伸び、
  // favMul = 得意兵種を率いたときの倍率、spd = 進軍(移動)の速さ、rng = 射程の追加(列)、crit = 会心率の追加
  var HEROES = [
    { id: 'oni',    name: '鬼塚 剛',     title: '鬼軍曹',         fav: 'inf',  skill: 'charge',  unlock: 0,  atk: 1.08, hp: 0.97, base: 1.06, grow: 0.030, favMul: 1.25, crit: 0.05 },
    { id: 'tetsu',  name: '鉄崎 ミナ',   title: '鋼鉄の戦車長',   fav: 'tank', skill: 'armor',   unlock: 3,  atk: 0.92, hp: 1.12, base: 1.05, grow: 0.030, favMul: 1.25 },
    { id: 'taka',   name: '白鷹 レン',   title: '必中の狙撃手',   fav: 'at',   skill: 'snipe',   unlock: 8,  atk: 1.15, hp: 0.88, base: 1.04, grow: 0.030, favMul: 1.25, rng: 0.5, crit: 0.10 },
    { id: 'rai',    name: '雷門 ハヤト', title: '砲撃の雷神',     fav: 'art',  skill: 'barrage', unlock: 15, atk: 1.08, hp: 0.95, base: 1.05, grow: 0.030, favMul: 1.25, spd: 0.9 },
    { id: 'sakura', name: '桜井 ユイ',   title: '野戦病院の天使', fav: 'inf',  skill: 'heal',    unlock: 22, atk: 0.90, hp: 1.12, base: 1.05, grow: 0.030, favMul: 1.20 },
    { id: 'hayate', name: '疾風 カイ',   title: '電撃戦の申し子', fav: 'tank', skill: 'blitz',   unlock: 30, atk: 1.06, hp: 0.94, base: 1.05, grow: 0.032, favMul: 1.25, spd: 1.35 },
    { id: 'kiri',   name: '霧島 シズカ', title: '煙幕の策士',     fav: 'at',   skill: 'smoke',   unlock: 40, atk: 1.00, hp: 1.04, base: 1.09, grow: 0.030, favMul: 1.12, spd: 1.1 },
    { id: 'kuro',   name: '黒岩 ゲン',   title: '不動の守護者',   fav: 'inf',  skill: 'reflect', unlock: 50, atk: 0.82, hp: 1.26, base: 1.05, grow: 0.030, favMul: 1.25, spd: 0.85 },
    { id: 'amagi',  name: '天城 アキラ', title: '空軍連絡将校',   fav: 'art',  skill: 'air',     unlock: 62, atk: 1.00, hp: 1.00, base: 1.00, grow: 0.036, favMul: 1.30 },
    { id: 'ayase',  name: '綾瀬 リコ',   title: '情報参謀',       fav: 'tank', skill: 'mark',    unlock: 75, atk: 1.03, hp: 0.97, base: 1.04, grow: 0.030, favMul: 1.20, rng: 0.5, crit: 0.05 }
  ];
  var HERO = {};
  HEROES.forEach(function (h) { HERO[h.id] = h; });

  // 固有スキル(指揮官ごとに1つ。手動ではボタンで、AUTOでは充填されると発動)
  var SKILL = {
    charge:  { name: '突撃',     first: 6,  cd: 24, dur: 12, mul: 1.5,  short: '味方全体 攻撃力+50%' },
    armor:   { name: '装甲',     first: 8,  cd: 24, dur: 12, mul: 0.4,  short: '味方全体 被ダメージ6割減' },
    snipe:   { name: '一撃必中', first: 8,  cd: 15, mul: 4.0,           short: '必中の一撃' },
    barrage: { name: '一斉射撃', first: 9,  cd: 21, mul: 0.9,           short: '敵全体へ砲撃' },
    heal:    { name: '応急手当', first: 9,  cd: 18, mul: 0.27, n: 3,    short: '味方3部隊の兵力を回復' },
    blitz:   { name: '電撃戦',   first: 6,  cd: 24, dur: 10, mul: 0.66, short: '味方全体 連射' },
    smoke:   { name: '煙幕',     first: 8,  cd: 24, dur: 10, mul: 0.35, short: '敵の攻撃が外れやすい' },
    reflect: { name: '鉄壁反撃', first: 8,  cd: 24, dur: 12, mul: 0.45, short: '受けたダメージを撃ち返す' },
    air:     { name: '爆撃要請', first: 9,  cd: 21, mul: 3.4, w: 1.2,   short: '敵の密集地を爆撃' },
    mark:    { name: '弱点看破', first: 6,  cd: 26, dur: 12, mul: 0.25, short: '敵の位置と弱点を暴く' }
  };
  // 説明文は数値から作る(調整しても文と中身がずれないように)
  (function () {
    function pc(x) { return Math.round(x * 100); }
    var S = SKILL;
    S.charge.desc = '味方全体の攻撃力を' + S.charge.dur + '秒間 +' + pc(S.charge.mul - 1) + '%';
    S.armor.desc = '味方全体の被ダメージを' + S.armor.dur + '秒間 ' + Math.round((1 - S.armor.mul) * 10) + '割減らす';
    S.snipe.desc = '見えている敵のうち相性の良い1体に、攻撃力' + pc(S.snipe.mul) + '%の必中ダメージ';
    S.barrage.desc = '見えている敵全体に、攻撃力' + pc(S.barrage.mul) + '%の砲撃ダメージ';
    S.heal.desc = '傷の深い味方' + S.heal.n + '部隊の兵力を最大の' + pc(S.heal.mul) + '%回復(全滅した部隊は戻らない)';
    S.blitz.desc = '味方全体の攻撃の間隔を' + S.blitz.dur + '秒間 ' + S.blitz.mul + '倍に(すばやく連射)';
    S.smoke.desc = '敵全体の攻撃が' + S.smoke.dur + '秒間 ' + pc(S.smoke.mul) + '%多く外れる';
    S.reflect.desc = S.reflect.dur + '秒間、味方が撃たれると、受けたダメージの' + pc(S.reflect.mul) + '%を撃った敵に返す';
    S.air.desc = '見えている敵がいちばん集まっている場所(左右' + S.air.w + '列)を爆撃。攻撃力' + pc(S.air.mul) + '%';
    S.mark.desc = S.mark.dur + '秒間、隠れている敵もすべて見え、敵全体が受けるダメージ+' + pc(S.mark.mul) + '%';
  })();
  // 敵を狙うスキル(見えている敵だけが対象。見える敵がいなければ待つ)
  var SKILL_AIM = { snipe: 1, barrage: 1, air: 1 };
  // 指揮官の特徴(画面の説明用)
  function heroTraits(id) {
    var h = HERO[id], out = [];
    if (h.atk > 1.02) out.push('攻撃型(攻撃×' + h.atk.toFixed(2) + ')'); else if (h.atk < 0.98) out.push('攻撃×' + h.atk.toFixed(2));
    if (h.hp > 1.02) out.push('耐久型(耐久×' + h.hp.toFixed(2) + ')'); else if (h.hp < 0.98) out.push('耐久×' + h.hp.toFixed(2));
    if (h.grow > 0.031) out.push('大器晩成(よく伸びる)'); else if (h.grow < 0.029) out.push('早熟(Lv1から強い)');
    if (h.favMul < 1.2) out.push('万能(得意兵種以外でも強い)'); else if (h.favMul > 1.26) out.push('得意兵種で特に強い(×' + h.favMul + ')');
    if (h.spd > 1) out.push('進軍が速い(+' + Math.round((h.spd - 1) * 100) + '%)'); else if (h.spd < 1) out.push('進軍が遅い(' + Math.round((h.spd - 1) * 100) + '%)');
    if (h.rng) out.push('射程+' + h.rng + '列');
    if (h.crit) out.push('会心率+' + Math.round(h.crit * 100) + '%');
    return out;
  }

  // ====== 武装 ======
  // 兵種ごとに 武器(攻撃力)・防護(耐久)・特殊(苦手な敵へのダメージ) の3系統。5レベルごとに新型を開発する
  var ARM_KINDS = ['w', 'a', 'x'];
  var ARM_KIND = {
    w: { name: '武器', stat: '攻撃力' },
    a: { name: '防護', stat: '耐久' },
    x: { name: '特殊', stat: '' }
  };
  // 名前は実在の兵器・装備から(おおむね年代順)。性能はゲーム用の数値
  var ARMS = {
    inf:  { vs: ['tank'],
      w: ['三八式歩兵銃', 'M1ガーランド', 'StG44', 'AK-47', 'M16A2', 'HK416', '20式小銃'],
      a: ['M1ヘルメット', 'M1952防弾ベスト', 'PASGTベスト', 'インターセプター', 'IOTV', '防弾チョッキ3型'],
      x: ['九九式破甲爆雷', 'M1バズーカ', 'パンツァーファウスト', 'RPG-7', 'AT4', 'ジャベリン'] },
    at:   { vs: ['inf', 'art'],
      w: ['ボーイズ対戦車銃', 'パンツァーシュレック', 'M40無反動砲', 'カール・グスタフ', 'TOW', 'コルネット', '中距離多目的誘導弾'],
      a: ['M3ハーフトラック', 'M113装甲兵員輸送車', '73式装甲車', '96式装輪装甲車', 'ストライカー', 'パトリアAMV'],
      x: ['MP40', 'ブレン軽機関銃', 'M1919機関銃', 'M60機関銃', 'ミニミ軽機関銃', 'Mk19自動擲弾銃'] },
    tank: { vs: ['at'],
      w: ['75mm M3戦車砲', '88mm KwK36', '105mm L7', '120mm L44', '120mm L55', '130mm Rh-130'],
      a: ['均質圧延装甲', '傾斜装甲', 'シュルツェン', 'チョバム・アーマー', 'コンタクト5', 'トロフィーAPS'],
      x: ['MG34車載機関銃', 'M2重機関銃', '74式車載機関銃', 'M1028キャニスター弾', 'M830A1多目的弾', 'CROWS遠隔銃塔'] },
    art:  { vs: ['tank'],
      w: ['M101榴弾砲', 'sFH18重榴弾砲', 'M114榴弾砲', 'FH70榴弾砲', 'M777榴弾砲', 'M270 MLRS', 'M142ハイマース'],
      a: ['M7プリースト', 'M109自走榴弾砲', '75式自走りゅう弾砲', '99式自走りゅう弾砲', 'PzH2000', '19式装輪自走砲'],
      x: ['M483A1 DPICM', 'M712カッパーヘッド', 'M898 SADARM', 'BONUS対装甲弾', 'SMArt155', 'M982エクスカリバー'] }
  };

  // ====== 拠点と特殊ユニット ======
  // 拠点は6か所(0〜2が自軍側、3〜5が敵側)。POST_ORDER は奥行きの順(自軍の奥 → 敵の奥)
  var POST_KIND = ['heli', 'drone', 'air', 'heli', 'drone', 'air'];
  var POST_ORDER = [2, 0, 1, 4, 3, 5];
  var SUPPORT = {
    heli:  { name: 'AH-64 アパッチ', short: '攻撃ヘリ', desc: '戦車を優先して対戦車ミサイルを4発撃ち込む' },
    air:   { name: 'A-10 サンダーボルトII', short: '対地攻撃機', desc: '敵の全部隊を機関砲で掃射する' },
    drone: { name: 'スイッチブレード', short: '自爆ドローン', desc: 'いちばん攻撃力の高い敵に突入して大ダメージ' }
  };

  // ====== 地形 ======
  // 部隊のいる地形で、攻撃力(atk)・受けるダメージ(take)・移動の速さ(move)が変わる。all は全兵種、兵種名の指定が優先
  // 移動が遅いと、戦闘開始時に射撃位置へ着くのが遅れる(着くまでは撃てない。砲兵は陣地から届く)。列の移動も遅くなる
  var TERRAIN = {
    plain:  { name: '平原',   short: '戦車◎ 速い', atk: { tank: 1.2 }, take: {}, move: { tank: 1.3, all: 1.1 }, desc: '見通しが良く戦車が動きやすい: 戦車の攻撃+20%。移動が速い(戦車+30%・ほか+10%)' },
    forest: { name: '森林',   short: '歩・対 守り↑ / 戦車↓ 遅い', atk: { tank: 0.85, art: 0.9 }, take: { inf: 0.7, at: 0.7 }, move: { inf: 0.85, at: 0.85, tank: 0.55, art: 0.65 }, desc: '歩兵・対戦車兵は身を隠せる: 被ダメージ-30%。戦車は攻撃-15%。木々で移動が遅い(戦車-45%・歩兵-15%)' },
    urban:  { name: '市街地', short: '歩・対 守り↑↑ / 戦車✕', atk: { inf: 1.1 }, take: { inf: 0.65, at: 0.65, tank: 1.25 }, move: { inf: 0.9, at: 0.9, tank: 0.7, art: 0.75 }, desc: '歩兵・対戦車兵は被ダメージ-35%(歩兵は攻撃+10%)。戦車は待ち伏せで被ダメージ+25%。がれきで移動がやや遅い(戦車-30%)' },
    hill:   { name: '丘陵',   short: '攻撃↑ / 砲兵◎ 坂で遅い', atk: { all: 1.15, art: 1.35 }, take: { all: 0.9 }, move: { all: 0.8, tank: 0.75 }, desc: '高所から攻撃+15%(砲兵は+35%)、被ダメージ-10%。坂道で移動が遅い(-20%)' },
    marsh:  { name: '湿地',   short: '戦車✕ / 砲兵↓ とても遅い', atk: { tank: 0.7, art: 0.85 }, take: { tank: 1.2, art: 1.1 }, move: { all: 0.7, tank: 0.45 }, desc: 'ぬかるみ: 戦車は攻撃-30%・被ダメージ+20%、砲兵も動きにくい。移動がとても遅い(戦車-55%・ほか-30%)' }
  };
  var TERRAIN_KEYS = ['plain', 'forest', 'urban', 'hill', 'marsh'];
  function terrAtk(tr, t) { var a = TERRAIN[tr].atk; return a[t] || a.all || 1; }
  function terrTake(tr, t) { var a = TERRAIN[tr].take; return a[t] || a.all || 1; }
  function terrMove(tr, t) { var a = TERRAIN[tr].move; return a[t] || a.all || 1; }
  // ====== 地形マップ ======
  // 地形は戦場に広がる区域(森林・市街地・丘陵・湿地。それ以外は平原)。区域は少しゆがんだ楕円で、後のものが上に重なる。
  // 座標: 横 x = 列の番号(0〜6、小数も可)、縦 y = -1(自軍の出撃線)・0(最初の前線)・1(敵の出撃線)
  // 部隊は「いる場所」の地形の効果を受ける: 戦う場所(前線のすぐ手前)、砲兵は置いた場所。進む速さは通り道の地形で決まる
  var FIRE_Y = 0.1;      // 前線から射撃位置までの距離
  var FRONT_STEP = 0.22; // 拠点を1つ取るごとに前線が進む距離
  // 拠点の場所(前線が進むと手前から占領される。POST_ORDER の順)
  var POST_POS = [{ x: 0.9, y: -0.34 }, { x: 5.1, y: -0.12 }, { x: 3, y: -0.56 }, { x: 0.9, y: 0.34 }, { x: 5.1, y: 0.12 }, { x: 3, y: 0.56 }];
  function frontY(fIdx) { return (fIdx - 3) * FRONT_STEP; }
  function advY(side, adv) { return side === 0 ? -1 + adv * (1 - FIRE_Y) : 1 - adv * (1 - FIRE_Y); }
  function blobR(b, th) { return 1 + b.a1 * Math.sin(3 * th + b.p1) + b.a2 * Math.sin(5 * th + b.p2); }
  function inBlob(b, x, y) {
    var dx = (x - b.x) / b.rx, dy = (y - b.y) / b.ry, r2 = dx * dx + dy * dy;
    if (r2 > 1.75) return false;
    var R = blobR(b, Math.atan2(dy, dx));
    return r2 < R * R;
  }
  // 丘陵は盛り上がった地形なので、ほかの区域と重なったら丘陵が上になる
  function terrAt(map, x, y) {
    if (!map || !map.blobs) return 'plain';
    var bl = map.blobs, i;
    for (i = bl.length - 1; i >= 0; i--) if (bl[i].k === 'hill' && inBlob(bl[i], x, y)) return 'hill';
    for (i = bl.length - 1; i >= 0; i--) if (bl[i].k !== 'hill' && inBlob(bl[i], x, y)) return bl[i].k;
    return 'plain';
  }
  // 縦に y0→y1 進む道のり÷速さ(16か所の地形で平均)
  function marchCost(map, ty, x, y0, y1) {
    var n = 16, d = (y1 - y0) / n, c = 0;
    for (var i = 0; i < n; i++) c += Math.abs(d) / terrMove(terrAt(map, x, y0 + d * (i + 0.5)), ty);
    return c;
  }
  // 横に x0→x1 進む道のり÷速さ
  function sideCost(map, ty, x0, x1, y) {
    var n = Math.max(2, Math.ceil(Math.abs(x1 - x0) * 4)), d = (x1 - x0) / n, c = 0;
    for (var i = 0; i < n; i++) c += Math.abs(d) / terrMove(terrAt(map, x0 + d * (i + 0.5), y), ty);
    return c;
  }
  var MARCH0 = 1 - FIRE_Y - (1 - FIRE_Y) * 0.4; // ふだんの位置から射撃位置までの道のり(K.advDef=0.4 のとき)
  // 戦う場所の縦の位置(砲兵は置いた場所。前線が近づいたら下がる)
  function fightY(side, type, adv, fIdx) {
    var f = frontY(fIdx === undefined ? 3 : fIdx);
    if (type === 'art') { var a = advY(side, adv); return side === 0 ? Math.min(a, f - 2 * FIRE_Y) : Math.max(a, f + 2 * FIRE_Y); }
    return side === 0 ? f - FIRE_Y : f + FIRE_Y;
  }
  // 地図ごとの覚え書き(おまかせ配置・予想勝率で、ふだんの位置の同じ計算を何度もしないように)
  function mapMemo(map) {
    if (!map._c) Object.defineProperty(map, '_c', { value: {}, enumerable: false });
    return map._c;
  }
  function fightTerr(map, side, type, x, adv, fIdx) {
    var plainPos = map && (adv === undefined || adv === K.advDef) && (fIdx === undefined || fIdx === 3);
    if (plainPos) { var c = mapMemo(map), k = 'f' + side + type + x; return c[k] !== undefined ? c[k] : (c[k] = terrAt(map, x, fightY(side, type, K.advDef))); }
    return terrAt(map, x, fightY(side, type, adv === undefined ? K.advDef : adv, fIdx));
  }
  // 射撃位置に着くまでの秒数(置いた場所から前線へ。mul は増援などの倍率)
  function arrivalTime(map, side, type, x, adv, fIdx, mul) {
    if (!K.app[type]) return 0;
    var plainPos = map && (adv === undefined || adv === K.advDef) && (fIdx === undefined || fIdx === 3);
    var y0 = advY(side, adv === undefined ? K.advDef : adv), y1 = fightY(side, type, 0, fIdx);
    if (side === 0 ? y0 >= y1 : y0 <= y1) return 0;
    var cost;
    if (plainPos) { var c = mapMemo(map), k = 'a' + side + type + x; cost = c[k] !== undefined ? c[k] : (c[k] = marchCost(map, type, x, y0, y1)); }
    else cost = marchCost(map, type, x, y0, y1);
    return K.app[type] * (mul || 1) * cost / MARCH0;
  }
  // 通り道の情報(画面の案内用): ふだんの平原と比べた時間の倍率と、いちばん遅い地形
  function marchInfo(map, side, type, x, adv) {
    var y0 = advY(side, adv === undefined ? K.advDef : adv), y1 = fightY(side, type, 0), n = 16, slow = 'plain', sm = 9;
    for (var i = 0; i < n; i++) { var k = terrAt(map, x, y0 + (y1 - y0) * (i + 0.5) / n), m = terrMove(k, type); if (m < sm) { sm = m; slow = k; } }
    return { time: arrivalTime(map, side, type, x, adv), base: K.app[type] / terrMove('plain', type), slow: slow, slowMove: sm };
  }
  // テスト・説明用: 自軍側・敵側をそれぞれ1つの地形にした地図
  function flatTerrain(pk, ek) {
    function b(k, y) { return { k: k, x: 3, y: y, rx: 40, ry: 1, a1: 0, a2: 0, p1: 0, p2: 0 }; }
    return { blobs: [b(pk || 'plain', -1), b(ek || 'plain', 1)] };
  }
  // 列の距離 d(小数も可)に応じた重み。自由配置で列の間に置いた部隊は、となりの列との間の値になる
  function laneW(arr, d) {
    var i = Math.floor(d), f = d - i;
    if (i >= arr.length - 1) return arr[arr.length - 1];
    return f ? arr[i] + (arr[i + 1] - arr[i]) * f : arr[i];
  }

  // ====== バランス調整値 ======
  var K = {
    unitPerLv: 0.12, labPerLv: 0.08, heroBase: 1.05, heroPerLv: 0.03, favMul: 1.25,
    miss: 0.06, crit: 0.10, critMul: 1.5,
    maxT: 180, // 戦闘は最大3分
    // 戦闘の長さ: 全部隊の耐久をこの倍率で底上げする(両軍同じ)。互角の戦いが30秒前後になるように
    hpScale: 2,
    startMoney: 500, startSteel: 300,
    // 戦場は7列(レーン)。部隊はおもに同じ列の敵を狙い、離れた列への攻撃は弱まる(砲兵はどの列にも届く)
    laneN: 7, laneAim: [1, 0.35, 0.12, 0.05, 0.03, 0.02, 0.01], laneDmg: [1, 0.85, 0.72, 0.62, 0.55, 0.5, 0.45], laneAimArt: [1, 0.8, 0.65, 0.55, 0.5, 0.45, 0.4],
    // 移動: 陣地から射撃位置までの所要時間(秒・地形の速さで割る)。砲兵は陣地から撃てる。
    // 列の移動は1列あたりの秒数。増援は後方から来るので resApp 倍かかり、前線基地(占領した拠点)1つごとに fwdApp ずつ短くなる
    app: { inf: 1.6, at: 1.7, tank: 1.1, art: 0 }, side: { inf: 1.0, at: 1.1, tank: 0.7, art: 1.5 }, resApp: 1.3, fwdApp: 0.3,
    // 配置の奥行き(adv): 出撃線(0)から射撃位置(1)へどれだけ前に置いたか。ふだん(おまかせ・敵)は advDef で、app はそのときの所要時間。
    // 自由配置では advMin〜advMax の範囲に置け、前に置くほど早く着く(所要時間は (1-adv)/(1-advDef) 倍)
    advDef: 0.4, advMin: 0, advMax: 0.95, eAdvMax: 0.22,
    // マップ全体で戦う: 部隊はマップ上を自由に動き、見えている敵が射程に入ればどこでも撃ち合う(動いている間は撃てない)。
    // 速さは列の幅/秒(平原。地形の速さを掛ける)。replan 秒ごとに行き先を考え直す。見えている敵がいなければ前へ進んで探す(searchY まで)
    spd: { inf: 0.6, at: 0.55, tank: 0.9, art: 0.35 }, replan: 0.5, searchY: 0.92, lineLead: 0.2, scoutR: 0.5, scoutFwd: 1.2, marchMul: 1.5, mapX: [-0.5, 6.5], mapY: [-1.08, 1.08],
    hrA: 0.04,
    // 射程(何列ぶんの距離まで撃てるか。奥行きも同じ縮尺)。射程の外の敵は狙えず、射程内に敵がいなければ見えている敵へ近づく
    rng: { inf: 2, at: 2.5, tank: 3, art: 99 },
    // 索敵範囲(列の幅を1とした距離。奥行きは出撃線〜前線の1が detY 列ぶん)。どちらの側も、自分の部隊の索敵範囲に入るまで敵が見えず、
    // 見えない敵は狙えない。見つかりやすさ sig は兵種ごと(敵が見える距離 = 見る側の索敵範囲 × 見られる側の見つかりやすさ)。
    // 攻撃している部隊は位置が見える(撃ってから fireT 秒)。時間がたつだけでは見つからない(部隊を動かして探す)
    det: { inf: 1.3, at: 1.0, tank: 0.9, art: 0.6 }, sig: { inf: 0.8, at: 0.6, tank: 1.25, art: 1.1 }, detY: 1.75, fireT: 2.5, idleT: 0.3,
    // 拠点: 敵部隊を撃破すると前線が進んで拠点を占領。占領した拠点は前線基地になり(増援+1・ポイント回復が速く)、
    // 特殊ユニットを1回発進できる(攻撃ヘリ・対地攻撃機・自爆ドローン)。味方がやられると拠点を奪われる
    postRate: 0.15, postRes: 1, supDelay: 2.5, supGap: 3, supMul: 0.6, supHeli: 0.9, supHeliTank: 1.5, supHeliN: 4, supAir: 0.8, supDrone: 3.0,
    // 増援: 戦闘中に指揮ポイントがたまり、コストを払うと予備の部隊を投入できる
    resRate: 0.5, resCost: 5, resStart: 2, resMax: 10, resMul: 0.6,
    // 配置: 前進(与/被ダメージ↑・狙われやすい)、後退(与/被ダメージ↓・狙われにくい。砲兵は与ダメージが下がらない)
    stDeal: { '1': 1.25, '-1': 0.75 }, stTake: { '1': 1.25, '-1': 0.6 }, stAim: { '1': 1.6, '-1': 0.5 },
    ecmdRate: 0.3, ecmdFocus: 6, ecmdJit: 2, ecmdHp: 3.5, ecmdAdv: 0.04, artSpot: 2.0,
    // 兵種ごとに編成できる部隊の数の上限(ほかに置ける兵種がないときだけ超えてよい)
    typeCap: { inf: 4, at: 3, tank: 3, art: 2 },
    rankS: 0.7, rankA: 0.45, flawless: 0.95,
    // 目標の報酬(いまの最前線のステージの報酬に対する倍率): 任務1つ・任務を全部こなした日・勲章(段ごとに増える)・S評価の初回・作戦の制圧
    msRw: 0.6, msAllRw: 1.5, medalRw: 0.5, medalRwStep: 0.25, sRw: 0.5, opRw: 1,
    // 敵の連携: 集中攻撃(同じ目標を狙いやすい倍率・目標を選び直す間隔)
    focusW: 5, focusT: 6,
    normW: 1, lossExp: 0.5, firstMul: 2, bossMul: 2, bossHp: 3.1, bossAtk: 1.4, bossTotal: 1.08, normMin: 0.6, normMax: 1.6,
    typeAdj: { inf: 1.04, at: 0.95, tank: 0.97, art: 1.05 },
    baseCapH: 2, depotCapH: 1, depotMaxLv: 22,
    // 敵の総合戦力倍率 T(s) = b + a*s^p + c*s^2
    enA: 0.33, enP: 1.3, enC: 0.0095, enB: 1.2,
    // 武装: 1レベルごとの効果(武器=攻撃力、防護=耐久、特殊=苦手な敵へのダメージ)、5レベルごとに新型の開発(設計図が必要)
    // 特殊は苦手の半分を打ち消すまで(相性0.6→0.8など)で、レベルが上がるほど伸びが小さくなる: 上限×(1 - armXd^Lv)
    armW: 0.05, armA: 0.05, armXd: 0.9, armXk: 0.5, armPer: 5, armLab: 2,
    armM: 80, armS: 30, armG: 1.9, armBp: 4, armBpP: 1.8, bpStep: 20, bpBoss: 2,
    // 試作部品: 新型の開発に1個使う。そのレベル帯に入るときのボス戦でだけ手に入る(初クリアは確定、以降はまれに)
    partFirst: 2, partRate: 0.1,
    // 武装の普及に合わせて敵も強くなる(武装を使う前提の難しさ): 1 + arR * max(0, s - arS)^arP
    arR: 0.012, arS: 8, arP: 0.8,
    // 報酬
    rwM: 20, rwS: 12, rwP: 1.5, rwExpA: 4, rwExpP: 1.2,
    // 生産(1時間あたり)
    prodM: 600, prodS: 400, prodP: 1.5
  };

  // ====== 基本関数 ======
  function lv(st, id) { var b = st.bld[id]; return b ? b.lv : 0; }
  function slotsFor(hqLv) { return Math.min(8, 2 + Math.floor(hqLv / 2)); }
  function slots(st) { return slotsFor(lv(st, 'hq')); }
  function maxLevel(st, id) {
    if (id === 'hq') return 999;
    var cap = lv(st, 'hq') * 2;
    if (id === 'depot') return Math.min(cap, K.depotMaxLv);
    return cap;
  }
  function upgradeCost(id, curLv) {
    var d = BLD[id];
    var f = Math.pow(curLv + 1, d.g);
    return { m: Math.round(d.cm * f / 10) * 10, s: Math.round(d.cs * f / 10) * 10 };
  }
  function prodRate(id, l) {
    if (l <= 0) return 0;
    var base = id === 'supply' ? K.prodM : K.prodS;
    return base * Math.pow(l, K.prodP);
  }
  function capHours(st) { return K.baseCapH + K.depotCapH * lv(st, 'depot'); }
  function freeSlots(st) {
    var used = {};
    Object.keys(st.bld).forEach(function (k) { used[st.bld[k].slot] = true; });
    var r = [];
    for (var i = 0; i < 9; i++) if (!used[i]) r.push(i);
    return r;
  }

  function canUpgrade(st, id) {
    var cur = lv(st, id);
    var d = BLD[id];
    if (cur === 0) {
      if (lv(st, 'hq') < d.req) return { ok: false, reason: '司令部Lv' + d.req + 'で解放' };
      if (!freeSlots(st).length) return { ok: false, reason: '空き区画がありません' };
    } else if (cur >= maxLevel(st, id)) {
      return { ok: false, reason: id === 'depot' && cur >= K.depotMaxLv ? '最大レベル' : '司令部の強化が必要', cap: true };
    }
    var c = upgradeCost(id, cur);
    if (st.money < c.m || st.steel < c.s) return { ok: false, reason: '資源が不足', cost: c, short: true };
    return { ok: true, cost: c };
  }

  function settle(st, now) {
    var capH = capHours(st);
    ['supply', 'steel'].forEach(function (id) {
      var b = st.bld[id];
      if (!b) return;
      var rate = prodRate(id, b.lv);
      var cap = rate * capH;
      var dt = (now - b.t) / 3600000;
      if (!(dt > 0)) dt = 0;
      b.stored = Math.min(cap, (b.stored || 0) + rate * dt);
      if (b.stored < 0 || !isFinite(b.stored)) b.stored = 0;
      b.t = now;
    });
  }
  function storedInfo(st, now) {
    settle(st, now);
    var capH = capHours(st);
    var r = {};
    ['supply', 'steel'].forEach(function (id) {
      var b = st.bld[id];
      if (!b) { r[id] = null; return; }
      var rate = prodRate(id, b.lv);
      r[id] = { stored: Math.floor(b.stored), cap: Math.floor(rate * capH), rate: rate, full: b.stored >= rate * capH - 0.5 };
    });
    return r;
  }
  function collect(st, now) {
    settle(st, now);
    var gm = 0, gs = 0;
    if (st.bld.supply) { gm = Math.floor(st.bld.supply.stored); st.bld.supply.stored -= gm; }
    if (st.bld.steel) { gs = Math.floor(st.bld.steel.stored); st.bld.steel.stored -= gs; }
    st.money += gm; st.steel += gs;
    if (gm + gs > 0) note(st, 'collect', 1);
    return { m: gm, s: gs };
  }

  function doUpgrade(st, id, now, slot) {
    var chk = canUpgrade(st, id);
    if (!chk.ok) return chk;
    settle(st, now);
    st.money -= chk.cost.m; st.steel -= chk.cost.s;
    if (!st.bld[id]) {
      var fs = freeSlots(st);
      if (slot === undefined || fs.indexOf(slot) < 0) slot = fs[0];
      st.bld[id] = { lv: 1, slot: slot };
      if (id === 'supply' || id === 'steel') { st.bld[id].stored = 0; st.bld[id].t = now; }
    } else {
      st.bld[id].lv++;
    }
    note(st, 'upgrade', 1);
    return { ok: true, cost: chk.cost };
  }

  // ====== 部隊の強さ ======
  function typeUnlocked(st, t) { return lv(st, TYPE_BLD[t]) > 0; }
  function unlockedTypes(st) { return TYPES.filter(function (t) { return typeUnlocked(st, t); }); }
  function unitMult(st, t) { var l = lv(st, TYPE_BLD[t]); return l > 0 ? 1 + K.unitPerLv * (l - 1) : 0; }
  function labMult(st) { return 1 + K.labPerLv * lv(st, 'lab'); }
  // 指揮官の倍率(攻撃・耐久の傾向を除いた共通部分)。id を渡すとその指揮官の伸び方・得意兵種の倍率を使う
  function heroMult(hlv, fav, id) {
    var h = id ? HERO[id] : null;
    return ((h ? h.base : K.heroBase) + (h ? h.grow : K.heroPerLv) * (hlv - 1)) * (fav ? (h ? h.favMul : K.favMul) : 1);
  }
  function squadMult(st, t, heroId) {
    var m = unitMult(st, t) * labMult(st);
    if (heroId && st.heroes[heroId]) { var h = HERO[heroId]; m *= heroMult(st.heroes[heroId].lv, h.fav === t, heroId) * Math.sqrt(h.atk * h.hp); }
    return m;
  }
  // 戦力の表示は、耐久の底上げ(K.hpScale)を除いた値(底上げは両軍同じなので、強さの比は変わらない)
  function powerOf(hp, atk, cd) { return Math.round(Math.sqrt(hp / K.hpScale * atk / cd) * 2.645); }
  function makeSquad(t, mult, opt) {
    opt = opt || {};
    var u = UNIT[t];
    var hp = Math.max(1, Math.round(u.hp * K.hpScale * mult * (opt.hpMul || 1)));
    var atk = u.atk * mult * (opt.atkMul || 1);
    var q = { type: t, maxHp: hp, atk: atk, cd: u.cd, hero: opt.hero || null, boss: !!opt.boss, power: powerOf(hp, atk, u.cd) };
    if (opt.vs) q.vs = opt.vs;
    return q;
  }
  function squadStats(st, t, heroId) {
    var o = armOpt(st, t);
    o.hero = heroId;
    var h = heroId && st.heroes[heroId] ? HERO[heroId] : null;
    if (h) { var g = Math.sqrt(h.atk * h.hp); o.atkMul = (o.atkMul || 1) * h.atk / g; o.hpMul = (o.hpMul || 1) * h.hp / g; }
    var q = makeSquad(t, squadMult(st, t, heroId), o);
    if (h) { if (h.spd) q.spd = h.spd; if (h.rng) q.rngB = h.rng; if (h.crit) q.critB = h.crit; }
    return q;
  }

  // ====== 武装の開発・強化 ======
  function armLv(st, t, k) { var a = st.arms && st.arms[t]; return a && a[k] > 0 ? a[k] | 0 : 0; }
  function armTier(l) { return l <= 0 ? 0 : Math.ceil(l / K.armPer); }
  // 新型の名前。5種を超えたら「改」「改二」…
  function armName(t, k, l) {
    var list = ARMS[t][k], tr = Math.max(1, armTier(l));
    if (tr <= list.length) return list[tr - 1];
    var n = tr - list.length;
    return list[list.length - 1] + '改' + (n === 1 ? '' : n < 10 ? '二三四五六七八九'[n - 2] : n);
  }
  function armMax(st) { return lv(st, 'lab') * K.armLab; }
  function armIsDev(l) { return l % K.armPer === 0; } // Lv0→1、Lv5→6… は新型の開発
  function armCost(t, k, l) {
    var f = Math.pow(l + 1, K.armG);
    var c = { m: Math.round(K.armM * f / 10) * 10, s: Math.round(K.armS * f / 10) * 10, bp: 0 };
    if (armIsDev(l)) { c.bp = Math.round(K.armBp * Math.pow(armTier(l) + 1, K.armBpP)); c.part = armTier(l); }
    return c;
  }
  // ---- 試作部品 ----
  // ボス戦(10ステージごと)の等級: ステージ10→Ⅰ、20→Ⅱ、30→Ⅲ…
  // 最初の型は部品なしで配備でき、n+1番目の新型の開発には等級nの部品(ステージ10nのボス)を使う
  function partGrade(s) { return s % 10 !== 0 ? 0 : s / 10; }
  function partStages(g) { return [10 * g]; }
  var ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ'];
  function partName(g) { return '試作部品' + (ROMAN[g] || g); }
  function partCount(st, g) { return st.parts && st.parts[g] > 0 ? st.parts[g] | 0 : 0; }
  // ボス戦に勝ったときの試作部品。roll は 0〜1 の乱数(出撃時に決まる)
  function partDrop(s, first, roll) {
    var g = partGrade(s);
    if (!g) return null;
    var n = first ? K.partFirst : roll < K.partRate ? 1 : 0;
    return { g: g, n: n };
  }
  // 効果(倍率の増分)。特殊の上限は「苦手な相性を等倍との中間まで戻す」分
  function armXMax(t) { var a = AFF[t][ARMS[t].vs[0]]; return (a + (1 - a) * K.armXk) / a - 1; }
  function armEffect(k, l, t) {
    if (k === 'w') return K.armW * l;
    if (k === 'a') return K.armA * l;
    return armXMax(t) * (1 - Math.pow(K.armXd, l));
  }
  function canArm(st, t, k) {
    if (!typeUnlocked(st, t)) return { ok: false, reason: BLD[TYPE_BLD[t]].name + 'で解放', locked: true };
    if (!lv(st, 'lab')) return { ok: false, reason: '研究所を建てると開発できます', locked: true };
    var cur = armLv(st, t, k), c = armCost(t, k, cur), dev = c.bp > 0;
    if (cur >= armMax(st)) return { ok: false, reason: '研究所Lv' + (Math.floor(cur / K.armLab) + 1) + 'が必要', cap: true, cost: c, dev: dev };
    if (c.part && partCount(st, c.part) < 1) return { ok: false, reason: partName(c.part) + 'が不足', cost: c, dev: dev, short: true, needPart: c.part };
    if ((st.bp || 0) < c.bp) return { ok: false, reason: '設計図が不足', cost: c, dev: dev, short: true };
    if (st.money < c.m || st.steel < c.s) return { ok: false, reason: '資源が不足', cost: c, dev: dev, short: true };
    return { ok: true, cost: c, dev: dev };
  }
  function doArm(st, t, k) {
    var chk = canArm(st, t, k);
    if (!chk.ok) return chk;
    st.money -= chk.cost.m; st.steel -= chk.cost.s; st.bp = (st.bp || 0) - chk.cost.bp;
    if (chk.cost.part) { st.parts[chk.cost.part] = partCount(st, chk.cost.part) - 1; if (!st.parts[chk.cost.part]) delete st.parts[chk.cost.part]; }
    if (!st.arms) st.arms = {};
    if (!st.arms[t]) st.arms[t] = {};
    var l = armLv(st, t, k) + 1;
    st.arms[t][k] = l;
    note(st, 'arm', 1);
    if (chk.dev) note(st, 'dev', 1);
    return { ok: true, cost: chk.cost, dev: chk.dev, lv: l, name: armName(t, k, l) };
  }
  // 部隊に載せる武装の効果
  function armOpt(st, t) {
    var o = { atkMul: 1 + armEffect('w', armLv(st, t, 'w')), hpMul: 1 + armEffect('a', armLv(st, t, 'a')) };
    var x = armLv(st, t, 'x');
    if (x > 0) { o.vs = {}; ARMS[t].vs.forEach(function (d) { o.vs[d] = 1 + armEffect('x', x, t); }); }
    return o;
  }
  // 敵が想定する武装の普及度(ステージが進むほど強い武装を前提にする)
  function armRef(s) { return 1 + K.arR * Math.pow(Math.max(0, s - K.arS), K.arP); }
  function expNeed(l) { return Math.round(20 + 14 * Math.pow(l, 1.55)); }
  function addHeroExp(st, id, exp) {
    var h = st.heroes[id];
    if (!h) return null;
    var before = h.lv;
    h.exp += exp;
    while (h.exp >= expNeed(h.lv)) { h.exp -= expNeed(h.lv); h.lv++; }
    return { id: id, gain: exp, before: before, after: h.lv };
  }

  // ====== ステージ ======
  var PLACES = ['荒野', '北部平原', '赤土の渓谷', '旧市街', '港湾地区', '黒い森', '砂漠地帯', '雪原', '高原', '河川敷', '丘陵地', '鉱山跡', '国境線', '湿地帯', '工業地帯', '霧の峠', '廃線跡', '飛行場跡', '海岸線', '火山帯'];
  var THEMES = {
    inf:  '歩兵大隊', at: '対戦車防衛線', tank: '機甲師団', art: '砲兵連隊', mix: '混成部隊'
  };
  var BOSS_NAMES = { inf: '精鋭突撃隊', at: '重対戦車隊', tank: '重戦車', art: '列車砲' };
  // ====== 敵将(敵の指揮官) ======
  // ボス戦と一部のステージに出てくる。1人で戦況をひっくり返すほどのスキルを持つ。
  // 発動の warn 秒前に予告があり、その間は位置が見える。予告中に倒せば発動しない
  var ECMD = {
    ghost:   { name: '亡霊',   skill: '亡者の行進',   unlock: 12, first: 11, cd: 70, warn: 7, hp: 0.5 },
    wall:    { name: '鉄壁',   skill: '不落要塞',     unlock: 12, first: 10, cd: 60, warn: 7, dur: 20, mul: 0.2, heal: 0.25 },
    thunder: { name: '雷帝',   skill: '戦術ミサイル', unlock: 25, first: 10, cd: 60, warn: 7, r: 1.6, dmg: 0.5 },
    viper:   { name: '毒蛇',   skill: '電子妨害',     unlock: 40, first: 10, cd: 60, warn: 7, dur: 20 },
    witch:   { name: '魔女',   skill: '寝返り工作',   unlock: 55, first: 10, cd: 80, warn: 7 },
    reaper:  { name: '死神',   skill: '斬首作戦',     unlock: 70, first: 10, cd: 70, warn: 7, dmg: 0.6 }
  };
  (function () {
    function pc(x) { return Math.round(x * 100); }
    var E = ECMD;
    E.ghost.desc = '倒された敵の部隊をすべて兵力' + pc(E.ghost.hp) + '%でよみがえらせる';
    E.wall.desc = E.wall.dur + '秒間、敵全体の被ダメージを' + Math.round(1 / E.wall.mul) + '分の1にし、兵力を' + pc(E.wall.heal) + '%回復する';
    E.thunder.desc = '自軍がいちばん集まった場所(半径' + E.thunder.r + '列)の部隊すべてに、兵力の' + pc(E.thunder.dmg) + '%のダメージ';
    E.viper.desc = E.viper.dur + '秒間、自軍の索敵がすべて使えなくなる(敵がまったく見えず、撃てない)';
    E.witch.desc = '自軍のいちばん強い部隊(指揮官のいない部隊)を寝返らせ、敵にする';
    E.reaper.desc = '指揮官のいる自軍の部隊すべてに、兵力の' + pc(E.reaper.dmg) + '%のダメージ';
  })();
  var ECMD_KEYS = Object.keys(ECMD);
  // ステージの敵将: ボス戦はかならず、ふつうのステージは12から3割ほど。出てくる敵将はステージが進むと増える
  function stageCmd(s) {
    if (s < 12) return null;
    var boss = s % 10 === 0, r = rngFrom(hashInt(s * 5059 + 13));
    if (!boss && r() >= K.ecmdRate) return null;
    var ok = ECMD_KEYS.filter(function (k) { return ECMD[k].unlock <= s; });
    return ok[Math.floor(r() * ok.length)];
  }
  function enemyCount(s) { return s <= 3 ? 2 : s <= 8 ? 3 : s <= 18 ? 4 : s <= 30 ? 5 : s <= 50 ? 6 : s <= 80 ? 7 : 8; }
  // ステージの地形マップ。場所の名前で出やすい地形が変わる(平原が多い場所は区域が少ない)。
  // 区域は自軍側・敵側に交互に置き、前線をまたぐものもある
  // 地形の型: ステージごとに地形の並び方が変わる(となりのステージとは違う型。左右の反転もある)
  var LAYOUTS = {
    scatter: '地形が点在', open: '開けた平原', ridges: '縦にのびる尾根と森', center: '中央の高地', band: '戦場を横切る帯',
    flanks: '両翼に森', diagonal: '斜めの尾根', town: '市街戦', fort: '固められた陣地'
  };
  var LAYOUT_KEYS = Object.keys(LAYOUTS);
  // 9ステージごとに9つの型を1回ずつ(順番はブロックごとに変わり、となりのステージとは必ず違う型)
  function layoutPerm(blk) {
    var r = rngFrom(hashInt(blk * 613 + 29)), a = LAYOUT_KEYS.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), x = a[i]; a[i] = a[j]; a[j] = x; }
    return a;
  }
  function blockPerm(blk) {
    var a = layoutPerm(blk);
    if (blk > 0) { var pv = layoutPerm(blk - 1); if (a[0] === pv[pv.length - 1]) { var x = a[0]; a[0] = a[1]; a[1] = x; } }
    return a;
  }
  function stageLayout(s) {
    if (s <= 2) return 'scatter';
    var n = LAYOUT_KEYS.length, blk = Math.floor((s - 3) / n);
    return blockPerm(blk)[(s - 3) % n];
  }
  function stageTerrain(s) {
    var place = PLACES[hashInt(s * 31 + 7) % PLACES.length], rnd = rngFrom(hashInt(s * 4241 + 77));
    var w = { plain: 3, forest: 2, urban: 1, hill: 2, marsh: 1 };
    if (/平原|荒野|砂漠|飛行場/.test(place)) { w.plain += 4; w.marsh = 0.3; }
    if (/森/.test(place)) w.forest += 5;
    if (/市街|港湾|工業|廃線/.test(place)) w.urban += 5;
    if (/丘陵|高原|峠|鉱山|火山|渓谷/.test(place)) w.hill += 4;
    if (/湿地|河川|海岸/.test(place)) w.marsh += 4;
    if (/雪/.test(place)) { w.forest += 2; w.hill += 1; }
    function pickOf(keys) { var tot = 0, i; for (i = 0; i < keys.length; i++) tot += w[keys[i]]; var r = rnd() * tot; for (i = 0; i < keys.length; i++) { r -= w[keys[i]]; if (r <= 0) return keys[i]; } return keys[0]; }
    function pick() { return pickOf(['forest', 'urban', 'hill', 'marsh']); }
    function blob(k, x, y, rx, ry) { return { k: k, x: x, y: y, rx: rx, ry: ry, a1: 0.08 + rnd() * 0.12, a2: 0.04 + rnd() * 0.08, p1: rnd() * 6.283, p2: rnd() * 6.283 }; }
    var lay = stageLayout(s), blobs = [], i, x, y, k;
    // 小さめの区域をいくつか散らす(y の符号: 交互に両軍の側へ)
    function sprinkle(n, avoid) {
      for (var j = 0, tries = 0; j < n && tries < n * 6; tries++) {
        var sx = -0.2 + rnd() * 6.4, sy = (j % 2 ? 1 : -1) * (0.1 + rnd() * 0.85);
        if (avoid && avoid(sx, sy)) continue;
        var kk = pick();
        blobs.push(blob(kk, sx, sy, (0.45 + rnd() * 0.6) * (kk === 'urban' ? 0.8 : 1), 0.13 + rnd() * 0.16)); j++;
      }
    }
    if (lay === 'scatter') {
      var tot = w.forest + w.urban + w.hill + w.marsh, n = Math.round(6 + 8 * tot / (tot + w.plain));
      for (i = 0; i < n; i++) {
        k = pick();
        blobs.push(blob(k, -0.4 + rnd() * 6.8, (i % 2 ? 1 : -1) * (0.05 + rnd() * 1.05), (0.6 + rnd() * 1.1) * (k === 'urban' ? 0.8 : 1), 0.16 + rnd() * 0.24));
      }
    } else if (lay === 'open') {
      // 開けた平原: 小さな森や村がぽつぽつあるだけ
      for (i = 0; i < 6; i++) { k = pickOf(['forest', 'urban', 'forest', 'hill']); blobs.push(blob(k, -0.2 + rnd() * 6.4, (i % 2 ? 1 : -1) * (0.15 + rnd() * 0.8), 0.3 + rnd() * 0.3, 0.1 + rnd() * 0.08)); }
    } else if (lay === 'ridges') {
      // 縦にのびる尾根や森の帯が戦場を区切る(帯の間が回廊になる)
      var xs = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5].sort(function () { return rnd() - 0.5; }), used = [];
      xs.forEach(function (cx) { if (used.length < 3 && used.every(function (u) { return Math.abs(u - cx) >= 2; })) used.push(cx); });
      used.forEach(function (cx) {
        var kk = pickOf(['forest', 'hill']);
        [-0.62, 0, 0.62].forEach(function (cy) { if (rnd() < 0.85) blobs.push(blob(kk, cx + (rnd() - 0.5) * 0.3, cy + (rnd() - 0.5) * 0.14, 0.3 + rnd() * 0.15, 0.3 + rnd() * 0.1)); });
      });
      sprinkle(3, function (sx) { return used.some(function (u) { return Math.abs(u - sx) < 0.8; }); });
    } else if (lay === 'center') {
      // 前線の真ん中に大きな高地(または町)。両翼に森
      k = rnd() < 0.65 ? 'hill' : 'urban';
      blobs.push(blob(k, 2.6 + rnd() * 0.8, (rnd() - 0.5) * 0.24, 1.1 + rnd() * 0.5, 0.3 + rnd() * 0.12));
      for (i = 0; i < 4; i++) blobs.push(blob(pickOf(['forest', 'marsh', 'forest']), i % 2 ? 5.6 + rnd() * 0.6 : 0.4 - rnd() * 0.6, (i < 2 ? -1 : 1) * (0.25 + rnd() * 0.55), 0.5 + rnd() * 0.4, 0.18 + rnd() * 0.16));
      sprinkle(2);
    } else if (lay === 'band') {
      // 湿地(森のこともある)の帯が戦場を横切る。1〜2か所だけ切れ目がある
      var bk = w.marsh >= 1 || rnd() < 0.5 ? 'marsh' : 'forest', yb = [-0.36, 0.36, 0.02][Math.floor(rnd() * 3)], gaps = [Math.floor(rnd() * 7)];
      if (rnd() < 0.5) gaps.push((gaps[0] + 3 + Math.floor(rnd() * 2)) % 7);
      for (x = 0; x <= 6; x++) if (gaps.indexOf(x) < 0) blobs.push(blob(bk, x + (rnd() - 0.5) * 0.2, yb + (rnd() - 0.5) * 0.08, 0.5 + rnd() * 0.12, 0.1 + rnd() * 0.05));
      sprinkle(4, function (sx, sy) { return Math.abs(sy - yb) < 0.3; });
    } else if (lay === 'flanks') {
      // 両翼に深い森(丘)。真ん中は開けている
      [0.2, 5.8].forEach(function (cx) {
        var kk = pickOf(['forest', 'forest', 'hill']);
        blobs.push(blob(kk, cx + (rnd() - 0.5) * 0.4, -0.45 - rnd() * 0.2, 0.7 + rnd() * 0.3, 0.32 + rnd() * 0.12));
        blobs.push(blob(kk, cx + (rnd() - 0.5) * 0.4, 0.45 + rnd() * 0.2, 0.7 + rnd() * 0.3, 0.32 + rnd() * 0.12));
      });
      blobs.push(blob(rnd() < 0.5 ? 'urban' : 'marsh', 2.5 + rnd(), (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.3), 0.4 + rnd() * 0.2, 0.12 + rnd() * 0.06));
      sprinkle(2, function (sx) { return sx > 1.6 && sx < 4.4; });
    } else if (lay === 'diagonal') {
      // 斜めに走る尾根(丘と森の連なり)
      for (i = 0; i < 6; i++) { var f = i / 5; blobs.push(blob(i % 2 ? pickOf(['forest', 'hill']) : 'hill', -0.2 + f * 6.4 + (rnd() - 0.5) * 0.3, -0.8 + f * 1.6 + (rnd() - 0.5) * 0.1, 0.55 + rnd() * 0.2, 0.17 + rnd() * 0.08)); }
      sprinkle(2, function (sx, sy) { return Math.abs(sy - (-0.8 + (sx + 0.2) / 6.4 * 1.6)) < 0.35; });
    } else if (lay === 'town') {
      // 市街戦: 町の区画が戦場の真ん中に並ぶ。公園の森
      for (x = 1.2; x <= 4.9; x += 0.9) for (y = -0.55; y <= 0.6; y += 0.38) if (rnd() < 0.55) blobs.push(blob('urban', x + (rnd() - 0.5) * 0.2, y + (rnd() - 0.5) * 0.08, 0.3 + rnd() * 0.12, 0.1 + rnd() * 0.05));
      while (blobs.length < 5) blobs.push(blob('urban', 1.2 + rnd() * 3.7, (blobs.length % 2 ? 1 : -1) * (0.1 + rnd() * 0.5), 0.35, 0.12));
      if (blobs.length > 11) blobs.length = 11;
      blobs.push(blob('forest', rnd() < 0.5 ? 0.2 : 5.8, (rnd() < 0.5 ? -1 : 1) * (0.3 + rnd() * 0.4), 0.5 + rnd() * 0.3, 0.2 + rnd() * 0.1));
    } else {
      // 固められた陣地: 片方の側(ふつうは敵の側)に丘と町が集まり、もう片方は開けている
      var sg = rnd() < 0.7 ? 1 : -1;
      for (i = 0; i < 5; i++) blobs.push(blob(pickOf(['hill', 'urban', 'hill', 'forest']), 0.2 + i * 1.4 + (rnd() - 0.5) * 0.4, sg * (0.25 + rnd() * 0.55), 0.5 + rnd() * 0.3, 0.16 + rnd() * 0.1));
      for (i = 0; i < 2; i++) blobs.push(blob(pickOf(['forest', 'marsh']), 0.8 + rnd() * 4.4, -sg * (0.25 + rnd() * 0.5), 0.35 + rnd() * 0.25, 0.1 + rnd() * 0.06));
    }
    // 両軍の側に地形があるように
    if (!blobs.some(function (b) { return b.y < 0; })) blobs.push(blob(pick(), 0.5 + rnd() * 5, -0.3 - rnd() * 0.4, 0.5, 0.15));
    if (!blobs.some(function (b) { return b.y > 0; })) blobs.push(blob(pick(), 0.5 + rnd() * 5, 0.3 + rnd() * 0.4, 0.5, 0.15));
    while (blobs.length < 6) sprinkle(1);
    if (blobs.length > 14) blobs.length = 14;
    // 左右の反転と、拠点の位置(見た目だけ。左右反転・少しずらす)
    var mir = rnd() < 0.5;
    if (mir) blobs.forEach(function (b) { b.x = 6 - b.x; });
    var posts = POST_POS.map(function (p) {
      var px = (mir ? 6 - p.x : p.x) + (rnd() - 0.5) * 0.9;
      return { x: Math.max(0.2, Math.min(5.8, px)), y: p.y + (rnd() - 0.5) * 0.08 };
    });
    return { blobs: blobs, layout: lay, posts: posts };
  }
  // ====== 布陣: マップの自分の側の好きな地点 ======
  // 横 x は 0〜6(列の番号・小数も可)、奥行き adv は 自軍 advMin〜advMax / 敵 0〜eAdvMax(配置の時点では見つからない奥)
  // 地形の効果が大きい場所ほど良い(砲兵は後ろ寄り、ほかは少し前寄り)。近くに味方が多いと下げる
  function placeScore(T, side, t, x, adv) {
    var tr = T ? terrAt(T, x, advY(side, adv)) : 'plain', sc = 1.2 * (terrAtk(tr, t) / terrTake(tr, t) - 1);
    if (t === 'art') sc -= adv * 0.3; else sc += adv * 0.15 + 0.1 * (terrMove(tr, t) - 1);
    return sc;
  }
  function placeUnits(types, T, side, rnd, fixed) {
    var out = [], placed = (fixed || []).slice(), maxA = side === 0 ? K.advMax : K.eAdvMax, a0 = side === 0 ? 0.1 : 0;
    types.forEach(function (t) {
      var best = { x: 3, adv: K.advDef }, bs = -1e9;
      for (var x = 0; x <= 6.001; x += 0.5) for (var a = a0; a <= maxA + 1e-9; a += (maxA - a0) / 4) {
        var sc = placeScore(T, side, t, x, a) + (rnd ? rnd() * 0.35 : 0) - Math.abs(x - 3) * 0.02;
        for (var j = 0; j < placed.length; j++) {
          var dx = placed[j].x - x, dy = (placed[j].adv - a) * (1 - FIRE_Y) * K.detY, d = Math.sqrt(dx * dx + dy * dy);
          if (d < 1.2) sc -= 0.5 * (1.2 - d);
        }
        if (sc > bs) { bs = sc; best = { x: x, adv: a }; }
      }
      placed.push(best);
      var tr = T ? terrAt(T, best.x, advY(side, best.adv)) : 'plain';
      // 敵は、地形の良い場所に置いた部隊はそこで待ち構える(見つけた敵には向かう)
      out.push({ lane: Math.round(best.x), lx: best.x, adv: Math.round(best.adv * 1000) / 1000, hold: side === 1 && t !== 'art' && terrAtk(tr, t) / terrTake(tr, t) >= 1.08 });
    });
    return out;
  }
  // 敵の作戦: 待ち伏せ(地形の良い所で待つ)・総攻撃(そろって前進)・陽動(囮が正面で引きつけ、別動隊が片側から後衛へ回り込む)・
  // 挟み撃ち(囮が正面、両側から回り込む)。どの作戦でも、見えている敵のうち1つに集中攻撃する
  var TACTICS = { ambush: '待ち伏せ', assault: '総攻撃', decoy: '陽動', pincer: '挟み撃ち' };
  function stageTactic(s) {
    if (s < 6) return 'ambush';
    var k = ['ambush', 'assault', 'decoy', 'pincer'];
    if (s < 15) k = ['ambush', 'assault', 'decoy'];
    return k[hashInt(s * 2711 + 5) % k.length];
  }
  function enemyPlace(types, T, s) {
    var out = placeUnits(types, T, 1, rngFrom(hashInt(s * 9173 + 41))), tac = stageTactic(s), r = rngFrom(hashInt(s * 337 + 9));
    // 動ける部隊(砲兵以外)を速い順に
    var mv = types.map(function (t, i) { return i; }).filter(function (i) { return types[i] !== 'art'; });
    mv.sort(function (a, b) { return K.spd[types[b]] - K.spd[types[a]] || a - b; });
    function setRole(i, role, x, adv) { out[i].role = role; out[i].hold = role === 'hold'; if (x !== undefined) { out[i].lx = x; out[i].lane = Math.round(x); } if (adv !== undefined) out[i].adv = adv; }
    if (tac === 'assault') mv.forEach(function (i) { setRole(i, 'assault'); });
    else if (tac === 'decoy' && mv.length >= 3) {
      var side = r() < 0.5 ? 0.2 : 5.8, dc = mv[mv.length - 1];
      mv.forEach(function (i) { if (types[i] === 'inf' || types[i] === 'tank') { if (types[dc] === 'at') dc = i; } });
      setRole(dc, 'decoy', 3, K.eAdvMax);
      mv.filter(function (i) { return i !== dc; }).slice(0, 2).forEach(function (i, k) { setRole(i, 'flank', side + (side < 3 ? 1 : -1) * k * 0.6, K.eAdvMax * 0.5); });
    } else if (tac === 'pincer' && mv.length >= 3) {
      var dc2 = mv[mv.length - 1];
      setRole(dc2, 'decoy', 3, K.eAdvMax);
      var fl = mv.filter(function (i) { return i !== dc2; }).slice(0, 2);
      if (fl[0] !== undefined) setRole(fl[0], 'flank', 0.2, K.eAdvMax * 0.5);
      if (fl[1] !== undefined) setRole(fl[1], 'flank', 5.8, K.eAdvMax * 0.5);
    }
    out.forEach(function (o) { o.tactic = tac; });
    return out;
  }
  // 敵の布陣は見えないので、自軍のおまかせ配置は地形だけで決める
  function blindPlace(types, T) { return placeUnits(types, T, 0, null); }
  function enemyTotal(s) {
    var ease = s < 12 ? 0.75 + 0.25 * (s - 1) / 11 : 1; // 序盤はやさしく
    return (K.enB + K.enA * Math.pow(s, K.enP) + K.enC * s * s) * ease * armRef(s) * heroRef(s);
  }
  // 指揮官が増えると、指揮官つきの部隊が増えて強くなる。最初の4人より後に着任する指揮官1人ごとに、敵も少し強くする
  function heroRef(s) {
    var n = 0;
    for (var i = 4; i < HEROES.length; i++) if (HEROES[i].unlock < s) n++;
    return 1 + K.hrA * n;
  }
  function stagePool(s) {
    if (s <= 1) return ['inf'];
    if (s <= 3) return ['inf', 'at'];
    if (s <= 8) return ['inf', 'at', 'art'];
    return TYPES;
  }
  function refTypesFor(s) { return s <= 10 ? ['inf'] : s <= 16 ? ['inf', 'at', 'tank'] : TYPES; }
  // 全兵種が倍率xの「基準軍」(指揮官なし)が勝率50%になるxを求める
  // terrain があるときは、基準軍も敵と同じ列に向かい合って、地形の効果込みで計算する
  function refBreakEven(eSquads, refTypes, terrain) {
    var n = eSquads.length, sopt = terrain ? { terrain: terrain } : undefined;
    function evalAt(arr, x, k) {
      // 基準軍も敵の布陣は見えないので、地形だけで場所を決める
      var bl = terrain ? blindPlace(arr, terrain) : null;
      var p = arr.map(function (t, j) { var q = makeSquad(t, x); if (bl) { q.lane = bl[j].lane; q.lx = bl[j].lx; q.adv = bl[j].adv; } return q; });
      var w = 0, sc = 0;
      for (var i = 0; i < k; i++) {
        var r = simulate(p, eSquads, 5000 + i * 7919, false, sopt);
        if (r.win) w++;
        sc += scoreOf(r);
      }
      return { wr: w / k, sc: sc / k };
    }
    // 基準軍もプレイヤーと同じ編成の上限を守る(兵種が1つしかないうちは別)
    function capOk(arr) {
      if (refTypes.length < 2) return true;
      var c = {};
      for (var q = 0; q < arr.length; q++) { c[arr[q]] = (c[arr[q]] || 0) + 1; if (c[arr[q]] > K.typeCap[arr[q]]) return false; }
      return true;
    }
    var cur = [], cc = {};
    for (var i = 0; i < n; i++) {
      var pick = refTypes[0];
      if (refTypes.length > 1) for (var r0 = 0; r0 < refTypes.length; r0++) { if ((cc[refTypes[r0]] || 0) < K.typeCap[refTypes[r0]]) { pick = refTypes[r0]; break; } }
      cc[pick] = (cc[pick] || 0) + 1; cur.push(pick);
    }
    if (refTypes.length > 1) {
      var best = evalAt(cur, 1, 8).sc;
      for (var pass = 0; pass < 2; pass++) {
        var improved = false;
        for (i = 0; i < n; i++) {
          for (var k = 0; k < refTypes.length; k++) {
            if (cur[i] === refTypes[k]) continue;
            var cand = cur.slice(); cand[i] = refTypes[k];
            if (!capOk(cand)) continue;
            var sc = evalAt(cand, 1, 8).sc;
            if (sc > best + 1e-6) { best = sc; cur = cand; improved = true; }
          }
        }
        if (!improved) break;
      }
    }
    var lo = Math.log(0.2), hi = Math.log(5);
    for (var it = 0; it < 10; it++) {
      var mid = (lo + hi) / 2;
      if (evalAt(cur, Math.exp(mid), 16).wr >= 0.5) hi = mid; else lo = mid;
    }
    return Math.exp((lo + hi) / 2);
  }
  // ステージの勝利報酬(初回ボーナス抜き)。10ステージごとのボス戦は2倍
  function stageReward(s) {
    var boss = s % 10 === 0, rm = Math.pow(s, K.rwP);
    return {
      m: Math.round((40 + K.rwM * rm) * (boss ? K.bossMul : 1) / 5) * 5,
      s: Math.round((25 + K.rwS * rm) * (boss ? K.bossMul : 1) / 5) * 5,
      exp: Math.round((10 + K.rwExpA * Math.pow(s, K.rwExpP)) * (boss ? 1.5 : 1)),
      bp: (1 + Math.floor(s / K.bpStep)) * (boss ? K.bpBoss : 1)
    };
  }
  var stageCache = {};
  function stageInfo(s) {
    if (stageCache[s]) return stageCache[s];
    var rnd = rngFrom(hashInt(s * 7919 + 17));
    var n = enemyCount(s);
    var pool = stagePool(s);
    var theme = 'mix', main = null;
    if (s >= 4 && rnd() < 0.6) { main = pool[Math.floor(rnd() * pool.length)]; theme = main; }
    var boss = s % 10 === 0;
    var types = [];
    for (var i = 0; i < n; i++) {
      var t = (main && rnd() < 0.6) ? main : pool[Math.floor(rnd() * pool.length)];
      types.push(t);
    }
    if (main && types.indexOf(main) < 0) types[0] = main;
    var vars = types.map(function () { return 0.92 + rnd() * 0.16; });
    var bossIdx = boss ? Math.floor(rnd() * n) : -1;
    if (boss && main) types[bossIdx] = main;
    // 敵もプレイヤーと同じ編成の上限を守る(ほかに置ける兵種があるときだけ)
    var tc = {};
    if (bossIdx >= 0) tc[types[bossIdx]] = 1; // ボスの兵種は先に数える
    types.forEach(function (t0, k) {
      if (k === bossIdx) return;
      if ((tc[t0] || 0) >= K.typeCap[t0]) {
        var alt = pool.filter(function (x) { return (tc[x] || 0) < K.typeCap[x]; });
        if (alt.length) types[k] = alt[Math.floor(rnd() * alt.length)];
      }
      tc[types[k]] = (tc[types[k]] || 0) + 1;
    });
    // 単位倍率の敵を作り、「全兵種が同じ強さの自軍」が五分になる倍率で編成の難しさを均す
    // 敵将: ボスの部隊(ボス戦でなければ、いちばん強い部隊)が率いる。敵将の部隊は耐久の高い親衛隊
    var cmd = stageCmd(s), cmdIdx = -1;
    function sqOpt(i) {
      var o = i === bossIdx ? { boss: true, hpMul: K.bossHp, atkMul: K.bossAtk } : {};
      if (i === cmdIdx) o.hpMul = (o.hpMul || 1) * K.ecmdHp;
      return o;
    }
    var unitE = types.map(function (t, i) { return makeSquad(t, vars[i], sqOpt(i)); });
    if (cmd) {
      cmdIdx = 0;
      unitE.forEach(function (e, i) { if (e.power > unitE[cmdIdx].power) cmdIdx = i; });
      if (bossIdx >= 0) cmdIdx = bossIdx;
      unitE[cmdIdx] = makeSquad(types[cmdIdx], vars[cmdIdx], sqOpt(cmdIdx));
      unitE[cmdIdx].ecmd = cmd;
    }
    var sumV = 0;
    unitE.forEach(function (e) { sumV += e.power / (100 * UNIT_POW[e.type]); });
    // 地形と敵の配置を先に決め、その条件で難しさを均す
    var terrain = stageTerrain(s), places = enemyPlace(types, terrain, s);
    // 敵将は後方の本陣で動かずに構える(予告で位置がわかっても、近づかないと止められない)
    if (cmdIdx >= 0) places[cmdIdx] = { lane: places[cmdIdx].lane, lx: places[cmdIdx].lane, adv: K.ecmdAdv, hold: true, role: null, tactic: places[cmdIdx].tactic };
    function setPlace(e, i) { e.lane = places[i].lane; e.lx = places[i].lx; e.adv = places[i].adv; if (places[i].hold) e.hold = true; if (places[i].role) e.role = places[i].role; }
    unitE.forEach(setPlace);
    var be = refBreakEven(unitE, refTypesFor(s), terrain);
    // 指揮官スキル込みの実戦では兵種ごとに少し難易度がずれるので、自動テストの結果から補正する
    var tf = 0;
    types.forEach(function (t) { tf += K.typeAdj[t] / n; });
    var norm = Math.min(K.normMax, Math.max(K.normMin, tf / be));
    var w = Math.min(1, Math.max(0, (s - 4) / 16)) * K.normW; // 序盤は補正を弱める(兵種がそろうまで)
    norm = 1 + (norm - 1) * w;
    var m = enemyTotal(s) * (boss ? K.bossTotal : 1) * norm / sumV;
    var enemies = types.map(function (t, i) { return makeSquad(t, vars[i] * m, sqOpt(i)); });
    var reward = stageReward(s);
    var place = PLACES[hashInt(s * 31 + 7) % PLACES.length];
    enemies.forEach(setPlace);
    if (cmd) enemies[cmdIdx].ecmd = cmd;
    var info = {
      s: s, place: place, theme: boss ? 'ボス戦' : THEMES[theme], main: main, boss: boss,
      bossName: boss ? BOSS_NAMES[types[bossIdx]] : null, norm: norm, be: be,
      enemies: enemies, reward: reward, terrain: terrain, ecmd: cmd, ecmdIdx: cmdIdx, tactic: places.length ? places[0].tactic : 'ambush',
      power: enemies.reduce(function (a, e) { return a + e.power; }, 0)
    };
    stageCache[s] = info;
    return info;
  }

  // ====== 編成 ======
  function normalizeForm(st, form) {
    var n = slots(st);
    var types = unlockedTypes(st);
    var out = [];
    var used = {};
    var cnt = {};
    for (var i = 0; i < n; i++) {
      var f = form && form[i] ? form[i] : null;
      var t = f && types.indexOf(f.type) >= 0 ? f.type : types[0];
      // 兵種の上限: 超えるときは、まだ置ける兵種に替える
      if ((cnt[t] || 0) >= K.typeCap[t]) { var alt = types.filter(function (x) { return (cnt[x] || 0) < K.typeCap[x]; })[0]; if (alt) t = alt; }
      cnt[t] = (cnt[t] || 0) + 1;
      var h = f && f.hero && st.heroes[f.hero] && !used[f.hero] ? f.hero : null;
      if (h) used[h] = true;
      var ln = f && typeof f.lane === 'number' && f.lane >= 0 && f.lane < K.laneN ? f.lane | 0 : null;
      var o = { type: t, hero: h, lane: ln };
      // 自由配置: 横の位置(列の番号を小数で)と奥行き
      if (ln !== null && typeof f.lx === 'number' && f.lx >= 0 && f.lx <= K.laneN - 1 && Math.abs(f.lx - ln) <= 0.5) o.lx = f.lx;
      if (ln !== null && typeof f.adv === 'number' && isFinite(f.adv)) o.adv = Math.max(K.advMin, Math.min(K.advMax, f.adv));
      out.push(o);
    }
    return out;
  }
  function formSquads(st, form) {
    return form.map(function (f) {
      var q = squadStats(st, f.type, f.hero);
      if (f.lane !== null && f.lane !== undefined) { q.lane = f.lane; if (typeof f.lx === 'number') q.lx = f.lx; if (typeof f.adv === 'number') q.adv = f.adv; }
      return q;
    });
  }
  // おまかせ配置: 強い部隊から順に、相性の良い敵がいて地形が合う列へ(同じ列に集まりすぎないように)
  function autoLanes(st, form, s) {
    var info = stageInfo(s), T = info.terrain, out = form.map(function (f) {
      var o = { type: f.type, hero: f.hero, lane: f.lane };
      if (typeof f.lx === 'number') o.lx = f.lx;
      if (typeof f.adv === 'number') o.adv = f.adv;
      return o;
    });
    // 置いてある部隊はそのまま。残りは強い部隊から順に、地形だけで決める(敵の布陣は見えない。集まりすぎないように)
    var fixed = out.filter(function (f) { return f.lane !== null && f.lane !== undefined; }).map(function (f) { return { x: typeof f.lx === 'number' ? f.lx : f.lane, adv: typeof f.adv === 'number' ? f.adv : K.advDef }; });
    var order = out.map(function (f, i) { return i; }).filter(function (i) { return out[i].lane === null || out[i].lane === undefined; });
    order.sort(function (a, b) { return squadMult(st, out[b].type, out[b].hero) * UNIT_POW[out[b].type] - squadMult(st, out[a].type, out[a].hero) * UNIT_POW[out[a].type]; });
    var pl = placeUnits(order.map(function (i) { return out[i].type; }), T, 0, null, fixed);
    order.forEach(function (i, k) { out[i].lane = pl[k].lane; out[i].lx = pl[k].lx; out[i].adv = pl[k].adv; });
    return out;
  }
  function assignHeroes(st, typesArr) {
    var heroes = Object.keys(st.heroes).sort(function (a, b) { return st.heroes[b].lv - st.heroes[a].lv; });
    var form = typesArr.map(function (t) { return { type: t, hero: null }; });
    var rest = [];
    heroes.forEach(function (h) {
      var fav = HERO[h].fav;
      for (var i = 0; i < form.length; i++) {
        if (!form[i].hero && form[i].type === fav) { form[i].hero = h; return; }
      }
      rest.push(h);
    });
    rest.forEach(function (h) {
      var best = -1, bm = -1;
      for (var i = 0; i < form.length; i++) {
        if (form[i].hero) continue;
        var m = unitMult(st, form[i].type) * UNIT_POW[form[i].type];
        if (m > bm) { bm = m; best = i; }
      }
      if (best >= 0) form[best].hero = h;
    });
    return form;
  }
  var UNIT_POW = {};
  TYPES.forEach(function (t) { var u = UNIT[t]; UNIT_POW[t] = Math.sqrt(u.hp * u.atk / u.cd) / 37.8; });

  // ====== 戦闘シミュレーション ======
  // 次に行動する部隊を順に処理するイベント駆動型。
  // createBattle は少しずつ進められる戦闘で、手動操作(攻撃目標の指示・スキル発動)を受け付ける。
  // 操作しなければ simulate とまったく同じ結果になる。
  function createBattle(pList, eList, seed, opt) {
    opt = opt || {};
    var rnd = rngFrom(seed);
    var U = [], live = [[], []];
    var TR = opt.terrain && opt.terrain.blobs ? opt.terrain : null; // 地形マップ
    // ---- 位置と移動(マップ全体。x=列の番号、y=-1 自軍の出撃線〜1 敵の出撃線) ----
    var DY = K.detY; // 奥行き1が何列ぶんの距離か
    function hasPos(u) { return u.x !== null && u.x !== undefined; }
    function posAt(u, T) {
      var m = u.mv;
      if (!m) return { x: u.x, y: u.y };
      var k = m.t1 > m.t0 ? Math.max(0, Math.min(1, (T - m.t0) / (m.t1 - m.t0))) : 1;
      return { x: m.x0 + (m.x1 - m.x0) * k, y: m.y0 + (m.y1 - m.y0) * k };
    }
    function distAt(a, b, T) {
      if (!hasPos(a) || !hasPos(b)) return 0;
      var p = posAt(a, T), q = posAt(b, T), dx = p.x - q.x, dy = (p.y - q.y) * DY;
      return Math.sqrt(dx * dx + dy * dy);
    }
    // 移動を終える(途中で考え直すときは、いまの場所で止まる)
    function settle(u) {
      if (!u.mv) return;
      var p = posAt(u, t);
      u.x = p.x; u.y = p.y; u.mv = null;
      u.lx = u.x; u.lane = Math.max(0, Math.min(K.laneN - 1, Math.round(u.x)));
    }
    // 部隊がいまいる場所の地形
    function curTerr(u) {
      if (!TR || !hasPos(u)) return null;
      var p = posAt(u, t);
      return terrAt(TR, p.x, p.y);
    }
    // 目標の点へ向かって進む(stop だけ手前で止まる)。replan 秒ぶん進んだら考え直す。戻り値 true = 動いた/待つ
    function moveToward(u, g, stop, march) {
      settle(u);
      var dx = g.x - u.x, dy = (g.y - u.y) * DY, d = Math.sqrt(dx * dx + dy * dy);
      if (d <= stop + 0.02) { u.next = t + K.idleT; return true; }
      var sp = K.spd[u.type] * u.spd * terrMove(TR ? terrAt(TR, u.x, u.y) : 'plain', u.type) * (march ? K.marchMul : 1);
      var len = Math.min(d - stop, sp * K.replan), k = len / d;
      var nx = Math.max(K.mapX[0], Math.min(K.mapX[1], u.x + dx * k)), ny = Math.max(K.mapY[0], Math.min(K.mapY[1], u.y + dy / DY * k));
      var dur = Math.max(0.05, len / sp);
      u.mv = { x0: u.x, y0: u.y, t0: t, x1: nx, y1: ny, t1: t + dur };
      u.next = t + dur;
      return true;
    }
    function spawn(q, side, slot, at, lane) {
      var ln = lane !== undefined ? lane : q.lane === undefined ? null : q.lane;
      if (ln !== null && ln !== undefined && !(typeof ln === 'number' && isFinite(ln))) ln = null;
      var u = {
        id: U.length, side: side, slot: slot, type: q.type, hp: q.maxHp, maxHp: q.maxHp, atk: q.atk, cd: q.cd,
        next: (at || 0) + (at ? 0.6 : 0.15) + rnd() * 0.35, alive: true, hero: q.hero, boss: q.boss, sk: null, skNext: Infinity, skLast: 0, order: null,
        stance: 0, reserve: !!at, vs: q.vs || null, lane: ln, arrT: at || 0,
        // lx: 横の位置(列の番号。自由配置では小数)。adv: 配置の奥行き(前に置くほど早く着く)
        lx: ln === null ? null : !at && lane === undefined && typeof q.lx === 'number' ? q.lx : ln,
        adv: at || typeof q.adv !== 'number' ? K.advDef : q.adv,
        // 指揮官の特徴: 進軍の速さ・射程の追加・会心率の追加
        spd: q.spd || 1, rngB: q.rngB || 0, crit: K.crit + (q.critB || 0)
      };
      // 最初の位置: 配置した場所。増援は後方(占領した拠点があれば、いちばん前の前線基地)から
      u.revUntil = -1; u.mv = null; u.goal = null; u.hold = !!q.hold && !at; u.role = at ? null : q.role || null; u.wp = 0;
      if (ln === null) { u.x = null; u.y = null; }
      else if (at) {
        var bp = fwdBase(side);
        if (bp) { u.x = bp.x; u.y = bp.y; } else { u.x = u.lx; u.y = side === 0 ? K.mapY[0] : K.mapY[1]; }
        u.lx = u.x;
      } else { u.x = u.lx; u.y = advY(side, u.adv); }
      if (q.hero) { u.sk = HERO[q.hero].skill; u.skNext = SKILL[u.sk].first + rnd(); }
      // 敵将のスキル(予告 → 発動)
      if (q.ecmd && ECMD[q.ecmd] && !at) { u.esk = q.ecmd; u.eskNext = ECMD[q.ecmd].first + rnd() * K.ecmdJit; u.eskWarn = false; }
      U.push(u); live[side].push(u);
      return u;
    }
    var i;
    for (i = 0; i < pList.length; i++) spawn(pList[i], 0, i);
    for (i = 0; i < eList.length; i++) spawn(eList[i], 1, i);
    var atkUntil = [-1, -1], atkMulv = [1, 1], armUntil = [-1, -1];
    // 新しいスキルの効果: 連射(電撃戦)・煙幕(その側の攻撃が外れやすい)・反撃(撃たれた側が撃ち返す)・弱点(狙われた部隊)
    var hasteUntil = [-1, -1], smokeUntil = [-1, -1], reflUntil = [-1, -1], markUntil = [-1, -1];
    var fortUntil = [-1, -1], jamUntil = [-1, -1]; // 敵将のスキル: 不落要塞・電子妨害
    var focus = [-1, -1], focusT = [-1, -1]; // 集中攻撃の目標(敵の側だけが使う)
    var ev = opt.record ? [] : null;
    var t = 0, winner = -1, done = false, maxT = K.maxT, stops = 0;
    var auto = opt.auto !== false; // false: 自軍のスキル・増援・配置は手動
    function laneDist(a, b) { return distAt(a, b, t); }
    // ---- 索敵(地形マップのある戦闘だけ) ----
    var DET = !!TR && opt.det !== false;
    // 捜索: マップを区画(横 SCX × 縦 SCY)に分け、探し終えた区画を覚えておく(側ごと)
    var SCX = [0, 1, 2, 3, 4, 5, 6], SCY = [-0.88, -0.53, -0.18, 0.18, 0.53, 0.88], explored = [{}, {}];
    function markExplored(u) {
      if (!hasPos(u)) return;
      var p = posAt(u, t), ex = explored[u.side];
      if (u.mkX === p.x && u.mkY === p.y) return; // 動いていなければ同じ
      u.mkX = p.x; u.mkY = p.y;
      var i0 = Math.max(0, Math.floor(p.x - K.scoutR)), i1 = Math.min(SCX.length - 1, Math.ceil(p.x + K.scoutR));
      for (var i = i0; i <= i1; i++) for (var j = 0; j < SCY.length; j++) {
        var dx = SCX[i] - p.x, dy = (SCY[j] - p.y) * DY;
        if (dx * dx + dy * dy <= K.scoutR * K.scoutR) ex[i + ',' + j] = 1;
      }
    }
    function searchCell(u, sg) {
      var ex = explored[u.side], best = null, bs = 1e9, i, j, pass;
      for (pass = 0; pass < 2 && !best; pass++) {
        for (i = 0; i < SCX.length; i++) for (j = 0; j < SCY.length; j++) {
          if (ex[i + ',' + j]) continue;
          var dx = SCX[i] - u.x, dy = (SCY[j] - u.y) * DY, sc = Math.sqrt(dx * dx + dy * dy) - K.scoutFwd * sg * SCY[j], key = i + ',' + j;
          // ほかの部隊が向かっている区画は避ける(手分けして探す)
          for (var m = 0; m < live[u.side].length; m++) { var o = live[u.side][m]; if (o !== u && o.scoutKey === key) { sc += 1.5; break; } }
          if (sc < bs) { bs = sc; best = { x: SCX[i], y: SCY[j], key: key }; }
        }
        if (!best) { explored[u.side] = ex = {}; u.mkX = null; markExplored(u); } // 全部探したら、もう一度
      }
      u.scoutKey = best ? best.key : null;
      return best || { x: u.x, y: sg * K.searchY };
    }
    function detR(u) { return K.det[u.type]; }
    // side の部隊から敵 f が見えるか(どれかの部隊の索敵範囲に入っている。撃ったばかりの部隊は遠くからでも見つかる)
    // observed: 索敵範囲で見つけている(観測している)ときだけ。砲兵はこれでないと撃てない
    function seen(side, f, T, observed) {
      if (T < jamUntil[side]) return false; // 電子妨害: 何も見えない
      if (T < markUntil[1 - side]) return true; // 弱点看破: 敵がすべて見える
      if (!DET || !hasPos(f)) return true;
      if (f.eskWarn) return true; // スキルの予告中の敵将は位置がわかる
      var rev = T < f.revUntil;
      if (!observed && rev) return true; // 攻撃している間は位置が見える
      // 砲兵(observed): 味方が索敵範囲で観測している敵のほか、攻撃して位置がばれた敵は、近くの味方(砲兵以外)が着弾を誘導できれば撃てる
      var fp = posAt(f, T), own = live[side], fm = K.sig[f.type] || 1, sp2 = K.artSpot * K.artSpot;
      for (var j = 0; j < own.length; j++) {
        var o = own[j];
        if (!hasPos(o)) return true;
        var op = posAt(o, T), dx = op.x - fp.x, dy = (op.y - fp.y) * DY, r = detR(o) * fm, d2 = dx * dx + dy * dy;
        if (d2 <= r * r) return true;
        if (observed && rev && o.type !== 'art' && d2 <= sp2) return true;
      }
      return false;
    }
    function visFoes(side, observed) {
      var foes = live[1 - side];
      if (!DET) return foes;
      return foes.filter(function (f) { return seen(side, f, t, observed); });
    }
    function reveal(u) { if (DET) u.revUntil = t + K.fireT; }
    // 増援を出す列: 相性の良い敵が近く、味方が少ない列
    function chooseLane(side, ty) {
      var best = (K.laneN - 1) >> 1, bs = -1e9, foes = visFoes(side);
      for (var L = 0; L < K.laneN; L++) {
        var sc = 0, own = 0;
        foes.forEach(function (f) { var d = hasPos(f) ? Math.abs(posAt(f, t).x - L) : 0; sc += laneW(K.laneAim, d) * f.hp * (AFF[ty][f.type] - AFF[f.type][ty] * 0.8); });
        live[side].forEach(function (u2) { if (hasPos(u2) && Math.abs(posAt(u2, t).x - L) < 0.5) own += u2.hp; });
        sc -= own * 0.3;
        if (TR) { var tr = terrAt(TR, L, fightY(side, ty, K.advDef, fIdx)), tf = terrAtk(tr, ty) / terrTake(tr, ty) * (0.85 + 0.15 * terrMove(tr, ty)); sc = sc > 0 ? sc * tf : sc / tf; }
        if (sc > bs) { bs = sc; best = L; }
      }
      return best;
    }
    // 増援
    var R = opt.reserves || null;
    var rLeft = [R && R.p ? R.p.count : 0, R && R.e ? R.e.list.length : 0], rUsed = [0, 0];
    var pts = [K.resStart, K.resStart], ptsT = [0, 0];
    // 拠点(opt.posts のときだけ): fIdx = 前線の位置。POST_ORDER の fIdx 番目より手前が自軍の拠点
    var PO = opt.posts ? POST_ORDER : null, fIdx = 3, granted = [{}, {}], charges = [[], []], supNext = [Infinity, Infinity], killQ = [];
    function fwd(side) { return !PO ? 0 : side === 0 ? Math.max(0, fIdx - 3) : Math.max(0, 3 - fIdx); } // 占領している敵の拠点の数
    function rate(side) { return K.resRate + K.postRate * fwd(side); }
    function ptsAt(side, tt) { return Math.min(K.resMax, pts[side] + rate(side) * (tt - ptsT[side])); }
    function accrue(side, tt) { pts[side] = ptsAt(side, tt); ptsT[side] = tt; }
    function deployTime(side) {
      if (rLeft[side] <= 0 || (side === 0 && !auto)) return Infinity;
      if (side === 1 && !(R && R.e && R.e.list.length)) return Infinity;
      var need = K.resCost - ptsAt(side, t);
      return need <= 0 ? t : t + need / rate(side);
    }
    function postOwner(i) { return PO.indexOf(i) < fIdx ? 0 : 1; }
    function fwdBase(side) {
      if (!PO || !fwd(side)) return null;
      var i = side === 0 ? PO[fIdx - 1] : PO[fIdx], pp = TR && TR.posts ? TR.posts[i] : POST_POS[i];
      return pp ? { x: pp.x, y: pp.y } : null;
    }
    // 撃破した側が前線を1つ進め、拠点を占領する
    function capture(side) {
      if (!live[1 - side].length) return; // 決着したら占領しない(勝利後の進軍はしない)
      var i;
      if (side === 0) { if (fIdx >= PO.length) return; i = PO[fIdx]; }
      else { if (fIdx <= 0) return; i = PO[fIdx - 1]; }
      accrue(0, t); accrue(1, t);
      fIdx += side === 0 ? 1 : -1;
      var kind = null, home = i >= 3 ? 1 : 0;
      if (home !== side && !granted[side][i]) {
        granted[side][i] = 1;
        kind = POST_KIND[i];
        charges[side].push(kind);
        if (K.postRes && R && (side === 0 ? R.p : R.e && R.e.list.length)) rLeft[side] += K.postRes; // 前線基地から増援
        if (side === 1 || auto) supNext[side] = Math.min(supNext[side], t + K.supDelay);
      }
      if (ev) ev.push({ t: t, k: 'post', i: i, side: side, kind: kind });
    }
    function flushKills() { while (killQ.length) capture(killQ.shift()); }
    // 特殊ユニットの発進(生きている部隊の平均攻撃力が基準)
    function launch(side, kind) {
      var foes = visFoes(side), own = live[side], j, f, h, hits = [];
      if (!foes.length || !own.length) return;
      var base = 0;
      for (j = 0; j < own.length; j++) base += own[j].atk;
      base = base / own.length * K.supMul;
      var src = { side: side, type: 'sup' };
      if (kind === 'air') {
        var tg = foes.slice();
        for (j = 0; j < tg.length; j++) { h = hit(src, tg[j], base * K.supAir * (0.9 + rnd() * 0.2)); hits.push({ d: tg[j].id, dmg: Math.abs(h), kill: h < 0 ? 1 : 0 }); }
      } else if (kind === 'heli') {
        for (var m = 0; m < K.supHeliN && foes.length; m++) {
          f = foes[0];
          for (j = 1; j < foes.length; j++) if (foes[j].hp * (foes[j].type === 'tank' ? 2 : 1) > f.hp * (f.type === 'tank' ? 2 : 1)) f = foes[j];
          h = hit(src, f, base * K.supHeli * (f.type === 'tank' ? K.supHeliTank : 1) * (0.9 + rnd() * 0.2));
          hits.push({ d: f.id, dmg: Math.abs(h), kill: h < 0 ? 1 : 0 });
        }
      } else {
        f = foes[0];
        for (j = 1; j < foes.length; j++) if (foes[j].atk > f.atk) f = foes[j];
        h = hit(src, f, base * K.supDrone);
        hits.push({ d: f.id, dmg: Math.abs(h), kill: h < 0 ? 1 : 0 });
      }
      if (ev) ev.push({ t: t, k: 'sup', side: side, kind: kind, hits: hits });
    }
    function useCharge(side, kind) {
      var k = charges[side].indexOf(kind);
      if (k < 0) return false;
      charges[side].splice(k, 1);
      launch(side, kind);
      flushKills();
      if (!live[1 - side].length) { winner = side; done = true; }
      return true;
    }
    // 自動で出す増援の兵種: 生き残っている敵に対していちばん相性が良いもの
    function bestReserveType() {
      var best = null, bs = -1;
      Object.keys(R.p.defs).forEach(function (ty) {
        var d = 0, k = 0;
        live[1].forEach(function (f) { d += AFF[ty][f.type] * f.hp; k += AFF[f.type][ty] * f.hp; });
        var sc = (k > 0 ? d / k : 1) * R.p.defs[ty].power;
        if (sc > bs) { bs = sc; best = ty; }
      });
      return best;
    }
    function deploy(side, ty, lane) {
      accrue(side, t);
      pts[side] -= K.resCost;
      var q = side === 0 ? R.p.defs[ty] : R.e.list[rUsed[1] % R.e.list.length];
      rLeft[side]--; rUsed[side]++;
      var ql = q.lane === undefined ? null : q.lane;
      var ln = lane !== undefined && lane !== null ? lane : (TR || ql !== null || live[1 - side].some(function (f) { return f.lane !== null; })) ? chooseLane(side, q.type) : null;
      var u = spawn(q, side, 100 + rUsed[side], t, ln);
      if (ev) ev.push({ t: t, k: 'spawn', s: u.id, side: side, type: u.type, lane: u.lane, arr: u.arrT });
      return u;
    }

    function hit(u, f, raw) {
      if (TR) {
        var ta = u.type === 'sup' ? null : curTerr(u), tf = curTerr(f);
        if (ta) raw *= terrAtk(ta, u.type);
        if (tf) raw *= terrTake(tf, f.type);
      }
      if (t < atkUntil[u.side]) raw *= atkMulv[u.side];
      if (t < armUntil[f.side]) raw *= SKILL.armor.mul;
      if (t < fortUntil[f.side]) raw *= ECMD.wall.mul;
      if (t < markUntil[f.side]) raw *= 1 + SKILL.mark.mul;
      return damage(f, Math.max(1, Math.round(raw)), u.side);
    }
    // ダメージを与える(撃破したら列から外し、拠点の前線を進める)。戻り値: 負数=撃破
    function damage(f, dmg, bySide) {
      f.hp -= dmg;
      if (f.hp <= 0) {
        if (f.eskWarn) stops++; // 予告中の敵将を倒した: スキルを阻止
        f.hp = 0; f.alive = false; f.eskWarn = false;
        var arr = live[f.side];
        arr.splice(arr.indexOf(f), 1);
        if (PO) killQ.push(bySide);
        return -dmg;
      }
      return dmg;
    }
    // 部隊の行動(撃つ・近づく・探す)。戻り値 true = 次の行動の時刻を自分で決めた
    function act(u) {
      if (!live[1 - u.side].length) return true;
      settle(u);
      // 砲兵は、味方が観測している敵か、近くの味方が着弾を誘導できる敵だけを撃てる
      var foes = visFoes(u.side, u.type === 'art'), rg = (K.rng[u.type] || 99) + u.rngB + 1e-9, j, f;
      // 指示された目標を集中攻撃(見えている間。射程の外なら近づく)
      if (u.order !== null) {
        f = U[u.order];
        if (!f.alive) u.order = null;
        else if (foes.indexOf(f) >= 0) {
          if (distAt(u, f, t) <= rg) { fire(u, f); return; }
          return moveToward(u, posAt(f, t), Math.min(rg, 3) * 0.85);
        }
      }
      // 指示された場所へ(着いたらそこで守る)
      if (u.goal && hasPos(u)) {
        var gx = u.goal.x - u.x, gy = (u.goal.y - u.y) * DY;
        if (gx * gx + gy * gy > 0.0025) return moveToward(u, u.goal, 0);
      }
      // 敵の連携: 集中攻撃の目標(見えている敵のうち、いちばん倒しやすい部隊)を、ときどき選び直す
      var fo = null;
      if (u.side === 1 && foes.length) {
        var cur = focus[1] >= 0 ? U[focus[1]] : null;
        if (!cur || !cur.alive || cur.side === 1 || foes.indexOf(cur) < 0 || t - focusT[1] > K.focusT) {
          var fb = null, fs = 1e18;
          foes.forEach(function (x) { var sc = x.hp * (x.type === 'art' ? 0.6 : 1); if (sc < fs) { fs = sc; fb = x; } });
          focus[1] = fb ? fb.id : -1; focusT[1] = t; cur = fb;
        }
        fo = cur;
      }
      // 回り込み: 戦場の端を通って後ろへ回り、後衛(砲兵・後ろにいる部隊)を襲う。着くまでは後衛しか撃たない
      var sgn = u.side === 0 ? 1 : -1; // 前へ進む向き(相手の陣地の奥が +)
      function rear(x) { return x.type === 'art' || (hasPos(x) && posAt(x, t).y * sgn > 0.55); }
      if (u.role === 'flank' && hasPos(u)) {
        var ex0 = u.lx < 3 ? -0.2 : 6.2, wps = [{ x: ex0, y: 0.1 * sgn }, { x: ex0, y: 0.75 * sgn }, { x: u.lx < 3 ? 1.5 : 4.5, y: 0.85 * sgn }];
        var rt = foes.filter(function (x) { return rear(x) && distAt(u, x, t) <= rg; });
        if (rt.length) { var bestR = rt[0]; rt.forEach(function (x) { if ((x.type === 'art') > (bestR.type === 'art') || distAt(u, x, t) < distAt(u, bestR, t)) bestR = x; }); fire(u, bestR); return; }
        if (u.wp < wps.length) {
          var wp = wps[u.wp], wx = wp.x - u.x, wy = (wp.y - u.y) * DY;
          if (wx * wx + wy * wy < 0.02) { u.wp++; u.next = t + 0.05; return true; }
          return moveToward(u, wp, 0, true);
        }
      }
      // 射程内の見えている敵を撃つ(相性の良い敵・近い敵を狙いやすい。敵は集中攻撃の目標・回り込んだ部隊は後衛を特に狙う)
      var aff = AFF2[u.type], LA = u.type === 'art' ? K.laneAimArt : K.laneAim, tot = 0, ws = [], near = null, nd = 1e9;
      for (j = 0; j < foes.length; j++) {
        var dj = distAt(u, foes[j], t), w = 0;
        if (dj <= rg) { w = aff[foes[j].type] * laneW(LA, dj) * (foes[j].eskWarn ? K.ecmdFocus : 1) * (foes[j] === fo ? K.focusW : 1) * (u.role === 'flank' && rear(foes[j]) ? 4 : 1); tot += w; }
        ws.push(w);
        var sc = dj / (0.6 + aff[foes[j].type]);
        if (sc < nd) { nd = sc; near = foes[j]; }
      }
      if (tot > 0) {
        var r = rnd() * tot;
        for (j = 0; j < foes.length; j++) { if (!ws[j]) continue; f = foes[j]; r -= ws[j]; if (r <= 0) break; }
        fire(u, f); return;
      }
      // 場所の指示・砲兵は動かずに待つ
      if (u.goal || u.type === 'art' || !hasPos(u)) { u.next = t + K.idleT; return true; }
      // 見えている敵へ近づく(敵は集中攻撃の目標へ)
      if (fo && u.role !== 'flank') near = fo;
      if (near) return moveToward(u, posAt(near, t), Math.min(rg, 3) * 0.85);
      // 囮: 足並みをそろえず、まっすぐ相手の陣地の真ん中へ出て引きつける
      if (u.role === 'decoy') return moveToward(u, { x: 3, y: 0.55 * sgn }, 0, true);
      // 待ち構える部隊は、敵が見えるまでその場で待つ
      if (u.hold) { u.next = t + K.idleT; return true; }
      if (DET) markExplored(u);
      // 見えている敵がいない: マップを区画に分け、まだ探していない区画を(前のほうを先に)近い順に探して回る。
      // 味方と足並みをそろえ、1部隊だけ先に行きすぎない(待ち構える部隊・砲兵・場所の指示がある部隊は数えない)
      var sg = u.side === 0 ? 1 : -1, line = 0, nl = 0;
      live[u.side].forEach(function (o) { if (o.type !== 'art' && !o.hold && !o.goal && o.role !== 'decoy' && o.role !== 'flank' && hasPos(o)) { line += posAt(o, t).y * sg; nl++; } });
      var lim = nl ? line / nl + K.lineLead : 1, g = searchCell(u, sg);
      if (sg * g.y > lim) {
        if (sg * u.y >= lim - 0.02) { u.next = t + K.idleT; return true; } // 味方を待つ
        g = { x: u.x + (g.x - u.x) * Math.max(0, (lim - sg * u.y) / Math.max(1e-6, sg * (g.y - u.y))), y: sg * lim };
      }
      return moveToward(u, g, 0, true);
    }
    function fire(u, f) {
      reveal(u); // 撃つと位置がばれる
      if (rnd() < K.miss + (t < smokeUntil[u.side] ? SKILL.smoke.mul : 0)) { if (ev) ev.push({ t: t, k: 'atk', s: u.id, d: f.id, miss: 1 }); return; }
      var crit = rnd() < u.crit, vm = u.vs && u.vs[f.type] || 1;
      var ld = u.type === 'art' ? 1 : laneW(K.laneDmg, laneDist(u, f));
      var h = hit(u, f, u.atk * AFF[u.type][f.type] * vm * ld * (0.9 + rnd() * 0.2) * (crit ? K.critMul : 1));
      if (ev) { var e1 = { t: t, k: 'atk', s: u.id, d: f.id, dmg: Math.abs(h), crit: crit ? 1 : 0, kill: h < 0 ? 1 : 0 }; if (vm > 1) e1.sp = 1; ev.push(e1); }
      // 鉄壁反撃: 撃たれた側が、受けたダメージの一部を撃った部隊に返す
      if (t < reflUntil[f.side] && u.alive) {
        var back = damage(u, Math.max(1, Math.round(Math.abs(h) * SKILL.reflect.mul)), f.side);
        if (ev) ev.push({ t: t, k: 'refl', s: f.id, d: u.id, dmg: Math.abs(back), kill: back < 0 ? 1 : 0 });
      }
    }
    function cast(u) {
      var id = u.sk, sk = SKILL[id], foes = visFoes(u.side), j, h;
      if (SKILL_AIM[id]) reveal(u);
      if (id === 'charge') {
        atkUntil[u.side] = t + sk.dur; atkMulv[u.side] = sk.mul;
        if (ev) ev.push({ t: t, k: 'skill', s: u.id, sk: id, dur: sk.dur });
      } else if (id === 'armor') {
        armUntil[u.side] = t + sk.dur;
        if (ev) ev.push({ t: t, k: 'skill', s: u.id, sk: id, dur: sk.dur });
      } else if (id === 'snipe') {
        if (!foes.length) return;
        var best = foes[0], aff = AFF[u.type];
        if (u.order !== null && U[u.order].alive && foes.indexOf(U[u.order]) >= 0) best = U[u.order]; // 指示した目標を狙撃
        else for (j = 1; j < foes.length; j++) {
          var f = foes[j];
          if (aff[f.type] > aff[best.type] || (aff[f.type] === aff[best.type] && f.hp < best.hp)) best = f;
        }
        h = hit(u, best, u.atk * sk.mul * aff[best.type] * (u.vs && u.vs[best.type] || 1));
        if (ev) ev.push({ t: t, k: 'skill', s: u.id, sk: id, hits: [{ d: best.id, dmg: Math.abs(h), kill: h < 0 ? 1 : 0 }] });
      } else if (id === 'barrage') {
        var targets = foes.slice(), hits = [];
        for (j = 0; j < targets.length; j++) {
          h = hit(u, targets[j], u.atk * sk.mul * AFF[u.type][targets[j].type] * (u.vs && u.vs[targets[j].type] || 1) * (0.9 + rnd() * 0.2));
          hits.push({ d: targets[j].id, dmg: Math.abs(h), kill: h < 0 ? 1 : 0 });
        }
        if (ev) ev.push({ t: t, k: 'skill', s: u.id, sk: id, hits: hits });
      } else if (id === 'heal') {
        // 応急手当: 兵力の減りがいちばん大きい味方から順に回復
        var al = live[u.side].slice().sort(function (a, b) { return (b.maxHp - b.hp) - (a.maxHp - a.hp) || a.id - b.id; }), heals = [];
        for (j = 0; j < al.length && j < sk.n; j++) {
          var g = Math.min(al[j].maxHp - al[j].hp, Math.round(al[j].maxHp * sk.mul));
          if (g <= 0) continue;
          al[j].hp += g; heals.push({ d: al[j].id, heal: g });
        }
        if (ev) ev.push({ t: t, k: 'skill', s: u.id, sk: id, heals: heals });
      } else if (id === 'blitz') {
        hasteUntil[u.side] = t + sk.dur;
        if (ev) ev.push({ t: t, k: 'skill', s: u.id, sk: id, dur: sk.dur });
      } else if (id === 'smoke') {
        smokeUntil[1 - u.side] = t + sk.dur;
        if (ev) ev.push({ t: t, k: 'skill', s: u.id, sk: id, dur: sk.dur });
      } else if (id === 'reflect') {
        reflUntil[u.side] = t + sk.dur;
        if (ev) ev.push({ t: t, k: 'skill', s: u.id, sk: id, dur: sk.dur });
      } else if (id === 'air') {
        // 爆撃要請: 左右 w 列の中の敵の兵力がいちばん多い場所を爆撃
        if (!foes.length) return;
        var c = foes[0], cs = -1;
        foes.forEach(function (f0) {
          var sum = 0;
          foes.forEach(function (f1) { if (distAt(f0, f1, t) <= sk.w) sum += f1.hp; });
          if (sum > cs) { cs = sum; c = f0; }
        });
        var tg = foes.filter(function (f1) { return distAt(c, f1, t) <= sk.w; }), ah = [];
        for (j = 0; j < tg.length; j++) {
          h = hit(u, tg[j], u.atk * sk.mul * (0.9 + rnd() * 0.2));
          ah.push({ d: tg[j].id, dmg: Math.abs(h), kill: h < 0 ? 1 : 0 });
        }
        if (ev) ev.push({ t: t, k: 'skill', s: u.id, sk: id, hits: ah, lx: hasPos(c) ? posAt(c, t).x : null });
      } else if (id === 'mark') {
        // 弱点看破: しばらくの間、敵の位置がすべて見え、敵全体の被ダメージが増える
        markUntil[1 - u.side] = t + sk.dur;
        if (ev) ev.push({ t: t, k: 'skill', s: u.id, sk: id, dur: sk.dur });
      }
    }
    // 敵将のスキル
    function ecmdCast(u) {
      var c = ECMD[u.esk], foes = live[1 - u.side], j, out = { t: t, k: 'eskCast', s: u.id, sk: u.esk };
      if (u.esk === 'ghost') {
        var rv = [], bp = posAt(u, t);
        U.forEach(function (x) {
          if (x.side !== u.side || x.alive || x.reserveOnly) return;
          x.alive = true; x.hp = Math.max(1, Math.round(x.maxHp * c.hp)); x.order = null; x.goal = null; x.mv = null;
          if (hasPos(x) && hasPos(u)) { var a = rnd() * 6.283; x.x = Math.max(K.mapX[0], Math.min(K.mapX[1], bp.x + Math.cos(a) * 0.5)); x.y = Math.max(K.mapY[0], Math.min(K.mapY[1], bp.y + Math.sin(a) * 0.25)); x.lx = x.x; }
          x.next = t + 0.6; live[x.side].push(x); rv.push({ d: x.id, hp: x.hp });
        });
        out.revive = rv;
      } else if (u.esk === 'wall') {
        fortUntil[u.side] = t + c.dur;
        var hs = [];
        live[u.side].forEach(function (x) { var g = Math.min(x.maxHp - x.hp, Math.round(x.maxHp * c.heal)); if (g > 0) { x.hp += g; hs.push({ d: x.id, heal: g }); } });
        out.dur = c.dur; out.heals = hs;
      } else if (u.esk === 'thunder') {
        if (!foes.length) return;
        var best = foes[0], bs = -1;
        foes.forEach(function (f0) { var n = 0; foes.forEach(function (f1) { if (distAt(f0, f1, t) <= c.r) n += f1.maxHp; }); if (n > bs) { bs = n; best = f0; } });
        var tg = foes.filter(function (f1) { return distAt(best, f1, t) <= c.r; }), hits = [];
        for (j = 0; j < tg.length; j++) { var h = damage(tg[j], Math.max(1, Math.round(tg[j].maxHp * c.dmg * (t < armUntil[tg[j].side] ? SKILL.armor.mul : 1))), u.side); hits.push({ d: tg[j].id, dmg: Math.abs(h), kill: h < 0 ? 1 : 0 }); }
        out.hits = hits; var cp = hasPos(best) ? posAt(best, t) : null; out.x = cp ? cp.x : null; out.y = cp ? cp.y : null;
      } else if (u.esk === 'viper') {
        jamUntil[1 - u.side] = t + c.dur; out.dur = c.dur;
      } else if (u.esk === 'witch') {
        var cand = foes.filter(function (f) { return !f.hero; });
        if (!cand.length) cand = foes.slice();
        if (cand.length <= 1 && foes.length <= 1) return; // 最後の1部隊は寝返らせない(勝負を決めるのは戦闘で)
        var tu = cand[0];
        cand.forEach(function (f) { if (f.hp * f.atk > tu.hp * tu.atk) tu = f; });
        settle(tu);
        live[tu.side].splice(live[tu.side].indexOf(tu), 1);
        tu.side = u.side; tu.order = null; tu.goal = null; tu.sk = null; tu.skNext = Infinity; tu.hold = false; tu.next = t + 0.5;
        live[tu.side].push(tu);
        out.d = tu.id;
      } else if (u.esk === 'reaper') {
        var hh = [];
        foes.filter(function (f) { return f.hero; }).forEach(function (f) { var h2 = damage(f, Math.max(1, Math.round(f.maxHp * c.dmg)), u.side); hh.push({ d: f.id, dmg: Math.abs(h2), kill: h2 < 0 ? 1 : 0 }); });
        out.hits = hh;
      }
      if (ev) ev.push(out);
    }
    // 応急手当は、傷ついた味方がいないときは使わずに待つ(AUTO・敵)
    function healNeeded(side) { return live[side].some(function (x) { return x.hp < x.maxHp * 0.8; }); }
    function manualSkill(u) { return !auto && u.side === 0; }
    // 時刻 T までの行動をすべて処理する
    function step(T) {
      while (!done) {
        var actor = null, bt = Infinity, isSk = false, dep = -1;
        for (i = 0; i < U.length; i++) {
          var u = U[i];
          if (!u.alive) continue;
          if (u.skNext < bt && !manualSkill(u)) { bt = u.skNext; actor = u; isSk = true; }
          if (u.next < bt) { bt = u.next; actor = u; isSk = false; }
          if (u.esk) { var et = u.eskWarn ? u.eskNext : u.eskNext - ECMD[u.esk].warn; if (et < bt) { bt = et; actor = u; isSk = 'esk'; } }
        }
        if (R) for (var sd = 1; sd >= 0; sd--) { var dt2 = deployTime(sd); if (dt2 < bt) { bt = dt2; dep = sd; actor = null; } }
        var sup = -1;
        if (PO) for (var s2 = 1; s2 >= 0; s2--) { if (charges[s2].length && (s2 === 1 || auto) && supNext[s2] < bt) { bt = supNext[s2]; sup = s2; dep = -1; actor = null; } }
        if ((!actor && dep < 0 && sup < 0) || bt > maxT) { if (T >= maxT) { t = maxT; done = true; } break; }
        if (bt > T) break;
        t = bt;
        if (sup >= 0) {
          if (!visFoes(sup).length) { supNext[sup] = t + 1; continue; } // 見えている敵がいなければ待つ
          useCharge(sup, charges[sup][0]); supNext[sup] = charges[sup].length ? t + K.supGap : Infinity; continue;
        }
        if (dep >= 0) { deploy(dep, dep === 0 ? bestReserveType() : null); continue; }
        if (isSk === 'esk') {
          if (!actor.eskWarn) { actor.eskWarn = true; if (ev) ev.push({ t: t, k: 'eskWarn', s: actor.id, sk: actor.esk, at: actor.eskNext }); }
          else { actor.eskWarn = false; ecmdCast(actor); actor.eskNext = t + ECMD[actor.esk].cd; flushKills(); if (!live[1 - actor.side].length) { winner = actor.side; done = true; } }
          continue;
        }
        if (isSk && actor.sk === 'heal' && !healNeeded(actor.side)) { actor.skNext = t + 1; continue; }
        if (isSk && SKILL_AIM[actor.sk] && !visFoes(actor.side).length) { actor.skNext = t + 1; continue; } // 狙う敵が見えるまで待つ
        if (isSk) { cast(actor); actor.skLast = t; actor.skNext += SKILL[actor.sk].cd; }
        else if (act(actor) !== true) actor.next = t + actor.cd * (t < hasteUntil[actor.side] ? SKILL.blitz.mul : 1);
        flushKills();
        if (!live[1 - actor.side].length) { winner = actor.side; done = true; }
      }
    }
    function result() {
      var hpP = 0, mxP = 0, hpE = 0, mxE = 0;
      for (i = 0; i < U.length; i++) { var x = U[i]; if (x.side === 0) { hpP += x.hp; mxP += x.maxHp; } else { hpE += x.hp; mxE += x.maxHp; } }
      var kills = 0;
      for (i = 0; i < U.length; i++) if (U[i].side === 1 && !U[i].alive) kills++;
      return { win: winner === 0, timeout: winner === -1, time: t, pHp: hpP / mxP, eHp: hpE / mxE, kills: kills, estop: stops, ev: ev };
    }
    return {
      U: U, ev: ev, step: step, result: result,
      time: function () { return t; },
      isDone: function () { return done; },
      isAuto: function () { return auto; },
      // 索敵: side から部隊 id が見えるか(時刻 now)。索敵範囲の半径(列の幅=1)
      seen: function (side, id, now) { var f = U[id]; return !!f && seen(side, f, now === undefined ? t : now); },
      detR: function (id) { var u = U[id]; return u ? detR(u) : 0; },
      hasDet: function () { return DET; },
      // 自動/手動の切替。自動に戻すと、たまっているスキルはすぐ発動する
      setAuto: function (on, now) {
        auto = !!on;
        if (auto) {
          U.forEach(function (u) { if (u.side === 0 && u.sk && u.skNext < now) u.skNext = Math.max(t, now); });
          U.forEach(function (u) { if (u.side === 0) { u.goal = null; u.order = null; } });
          if (R) { accrue(0, Math.max(t, now)); }
          if (PO && charges[0].length) supNext[0] = Math.max(t, now);
        }
      },
      // いまの位置(画面用)。moving = 移動中
      pos: function (id, now) { var u = U[id]; if (!u || !hasPos(u)) return null; var T = now === undefined ? t : now, p = posAt(u, T); return { x: p.x, y: p.y, moving: !!(u.mv && T < u.mv.t1), goal: u.goal }; },
      // 指揮ポイントと残りの増援
      reserveInfo: function (now) {
        return { pts: R ? ptsAt(0, Math.max(t, now)) : 0, max: K.resMax, cost: K.resCost, left: rLeft[0], used: rUsed[0], eLeft: rLeft[1] };
      },
      // 拠点の状況(持ち主・前線の位置・使える特殊ユニット)
      postInfo: function () {
        if (!PO) return null;
        return { owners: POST_KIND.map(function (k, i) { return postOwner(i); }), front: fIdx, charges: charges[0].slice(), eCharges: charges[1].slice() };
      },
      // 手動で特殊ユニットを発進
      support: function (kind, now) {
        if (done || auto || !PO || charges[0].indexOf(kind) < 0) return false;
        var tt = Math.max(t, now);
        step(tt);
        if (done) return false;
        t = tt;
        return useCharge(0, kind);
      },
      // 手動で増援を投入
      deploy: function (ty, now, lane) {
        if (done || auto || !R || rLeft[0] <= 0 || !R.p.defs[ty]) return null;
        var tt = Math.max(t, now);
        step(tt);
        if (done) return null;
        t = tt;
        if (ptsAt(0, t) < K.resCost) return null;
        return deploy(0, ty, typeof lane === 'number' && lane >= 0 && lane < K.laneN ? lane | 0 : undefined).id;
      },
      // 部隊をマップ上の好きな場所へ動かす(手動のとき)。着いたらそこで守る(射程内の見えている敵だけ撃つ)
      moveTo: function (id, x, y, now) {
        var u = U[id];
        if (done || auto || !u || !u.alive || u.side !== 0 || !hasPos(u) || !(typeof x === 'number' && typeof y === 'number' && isFinite(x) && isFinite(y))) return false;
        var tt = Math.max(t, now);
        step(tt);
        if (done || !u.alive) return false;
        t = tt;
        settle(u);
        u.goal = { x: Math.max(K.mapX[0], Math.min(K.mapX[1], x)), y: Math.max(K.mapY[0], Math.min(K.mapY[1], y)) };
        u.order = null;
        u.next = t;
        if (ev) ev.push({ t: t, k: 'goal', s: u.id, x: u.goal.x, y: u.goal.y });
        return true;
      },
      // 攻撃目標の指示(target=null で自由攻撃に戻す)
      order: function (id, target) {
        var u = U[id];
        if (!u || !u.alive || u.side !== 0) return false;
        if (target === null || target === undefined) { u.order = null; u.goal = null; return true; }
        var f = U[target];
        if (!f || !f.alive || f.side === u.side) return false;
        u.order = target; u.goal = null;
        return true;
      },
      // 手動でスキル発動(たまっているときだけ)
      cast: function (id, now) {
        var u = U[id];
        if (done || auto || !u || !u.alive || u.side !== 0 || !u.sk) return false;
        var tt = Math.max(t, now);
        if (tt < u.skNext) return false;
        step(tt);
        if (done || !u.alive) return false;
        t = tt;
        if (SKILL_AIM[u.sk] && !visFoes(0).length) return false; // 見えている敵がいない
        cast(u);
        u.skLast = t; u.skNext = t + SKILL[u.sk].cd;
        if (!live[1].length) { winner = 0; done = true; }
        return true;
      }
    };
  }
  function simulate(pList, eList, seed, record, opt) {
    var b = createBattle(pList, eList, seed, { record: record, reserves: opt && opt.reserves, posts: opt && opt.posts, terrain: opt && opt.terrain });
    b.step(Infinity);
    return b.result();
  }

  // 増援の数: 自軍は司令部レベル、敵はステージで増える
  function reserveCount(hqLv) { return 1 + (hqLv >= 5 ? 1 : 0) + (hqLv >= 10 ? 1 : 0); }
  function enemyReserveCount(s) { return s < 6 ? 0 : 1 + (s >= 20 ? 1 : 0) + (s >= 45 ? 1 : 0); }
  function battleReserves(st, s) {
    var defs = {};
    unlockedTypes(st).forEach(function (t) { defs[t] = makeSquad(t, unitMult(st, t) * labMult(st) * K.resMul, armOpt(st, t)); });
    var info = stageInfo(s), list = [], rnd = rngFrom(hashInt(s * 977 + 5)), n = enemyReserveCount(s);
    var normal = info.enemies.filter(function (e) { return !e.boss; });
    if (!normal.length) normal = info.enemies;
    for (var i = 0; i < n; i++) {
      var e = normal[Math.floor(rnd() * normal.length)];
      list.push(makeSquad(e.type, e.atk / UNIT[e.type].atk * K.resMul));
    }
    return { p: { count: reserveCount(lv(st, 'hq')), defs: defs }, e: { list: list } };
  }
  function scoreOf(r) { return r.win ? 1 + r.pHp : -r.eHp; }
  // 評価: 勝ったときの被害の少なさ(残った兵力の割合)。S = 7割以上、A = 4割5分以上、B = それ未満。負けは評価なし
  function rankOf(r) { return !r || !r.win ? null : r.pHp >= K.rankS ? 'S' : r.pHp >= K.rankA ? 'A' : 'B'; }
  function evalForm(st, form, s, n, seed0) {
    var info0 = stageInfo(s), p = formSquads(st, autoLanes(st, form, s)), e = info0.enemies, res = { reserves: battleReserves(st, s), posts: true, terrain: info0.terrain };
    var wins = 0, sc = 0;
    for (var i = 0; i < n; i++) {
      var r = simulate(p, e, (seed0 || 1000) + i * 7919, false, res);
      if (r.win) wins++;
      sc += scoreOf(r);
    }
    return { winRate: wins / n, score: sc / n };
  }
  function predict(st, form, s, n) { return evalForm(st, normalizeForm(st, form), s, n || 100, 424242); }
  // 配置画面の予想勝率: 敵の布陣は見えないので、地形に合わせた敵の布陣をいくつか想定して平均する(本当の布陣は使わない)
  function predictBlind(st, form, s, n) {
    var info = stageInfo(s), types = info.enemies.map(function (e) { return e.type; }), KN = 4, wins = 0, tot = 0;
    var p = formSquads(st, autoLanes(st, normalizeForm(st, form), s)), res = { reserves: battleReserves(st, s), posts: true, terrain: info.terrain };
    var per = Math.max(1, Math.ceil((n || 40) / KN));
    for (var k = 0; k < KN; k++) {
      var pl = enemyPlace(types, info.terrain, s * 7 + 1009 * (k + 1));
      var e = info.enemies.map(function (q, i) { var c = {}; for (var key in q) c[key] = q[key]; c.lane = pl[i].lane; c.lx = pl[i].lx; c.adv = pl[i].adv; c.hold = pl[i].hold; c.role = pl[i].role; return c; });
      for (var i = 0; i < per; i++) { var r = simulate(p, e, 424242 + i * 7919 + k * 31, false, res); tot++; if (r.win) wins++; }
    }
    return { winRate: wins / tot };
  }

  // おまかせ編成: 兵種の組み合わせ(重複組合せ)を総当たりし、上位を精査して決める
  function autoFormation(st, s, nSims) {
    nSims = nSims || 16;
    var n = slots(st), types = unlockedTypes(st);
    if (!types.length) return [];
    var combos = [];
    (function rec(idx, left, acc) {
      if (idx === types.length - 1) { combos.push(acc.concat([left])); return; }
      for (var c = left; c >= 0; c--) rec(idx + 1, left - c, acc.concat([c]));
    })(0, n, []);
    // 兵種の上限を守る組み合わせだけ(上限を守れないほど兵種が少ないときは、そのまま)
    var capped = combos.filter(function (cnt) { return cnt.every(function (c, i) { return c <= K.typeCap[types[i]]; }); });
    if (capped.length) combos = capped;
    var scored = combos.map(function (cnt) {
      var arr = [];
      cnt.forEach(function (c, i) { for (var j = 0; j < c; j++) arr.push(types[i]); });
      var f = assignHeroes(st, arr);
      return { f: f, sc: combos.length === 1 ? 0 : evalForm(st, f, s, nSims, 777).score };
    });
    scored.sort(function (x, y) { return y.sc - x.sc; });
    var top = scored.slice(0, Math.min(3, scored.length));
    if (top.length > 1) {
      top.forEach(function (c) { c.sc2 = evalForm(st, c.f, s, nSims * 3, 31337).score; });
      top.sort(function (x, y) { return y.sc2 - x.sc2; });
    }
    var form = top[0].f;
    // 見た目を整える: 指揮官つきを前列に
    form.sort(function (a, b) { return (b.hero ? 1 : 0) - (a.hero ? 1 : 0) || TYPES.indexOf(a.type) - TYPES.indexOf(b.type); });
    return autoLanes(st, form.map(function (f) { return { type: f.type, hero: f.hero, lane: null }; }), s);
  }

  // ====== 戦闘の実行と結果 ======
  function prepareBattle(st, form, s) {
    form = autoLanes(st, normalizeForm(st, form), s);
    var p = formSquads(st, form);
    var info = stageInfo(s);
    return { form: form, p: p, e: info.enemies, info: info, reserves: battleReserves(st, s), posts: true, terrain: info.terrain };
  }
  // ext = { rank: 'S'|'A'|'B', kills: 撃破した敵部隊の数, manual: 手動で戦った, estop: 敵将のスキルを阻止した数, pHp: 残った兵力の割合 }
  function applyResult(st, s, win, form, roll, ext) {
    var info = stageInfo(s);
    form = form || st.form || [];
    var first = win && s > st.cleared;
    var gm = 0, gs = 0, gb = 0, exp;
    if (win) {
      gm = info.reward.m * (first ? K.firstMul : 1);
      gs = info.reward.s * (first ? K.firstMul : 1);
      gb = info.reward.bp * (first ? K.firstMul : 1);
      exp = info.reward.exp;
    } else {
      exp = Math.round(info.reward.exp * K.lossExp);
    }
    st.money += gm; st.steel += gs; st.bp = (st.bp || 0) + gb;
    // ボス戦の試作部品(初クリアは確定、以降はまれに)
    var part = null;
    if (win) {
      if (roll === undefined) roll = hashInt(st.stats.battles * 7919 + s * 31 + 3) / 4294967296;
      part = partDrop(s, first, roll);
      if (part && part.n) { if (!st.parts) st.parts = {}; st.parts[part.g] = partCount(st, part.g) + part.n; }
      if (part && !part.n) part = null;
    }
    var heroExp = [];
    var seen = {};
    form.forEach(function (f) {
      if (f && f.hero && seen[f.hero]) return;
      if (f && f.hero) seen[f.hero] = true;
      if (f && f.hero && st.heroes[f.hero]) heroExp.push(addHeroExp(st, f.hero, exp));
    });
    var newHeroes = [];
    if (first) {
      st.cleared = s;
      newHeroes = grantHeroes(st);
    }
    st.stats.battles++;
    if (win) st.stats.wins++;
    var out = { win: win, first: first, m: gm, s: gs, bp: gb, part: part, exp: exp, heroExp: heroExp, newHeroes: newHeroes };
    ext = ext || {};
    if (ext.kills > 0) note(st, 'kill', ext.kills);
    if (ext.estop > 0) note(st, 'estop', ext.estop);
    if (win) {
      var rk = RANK_N[ext.rank] || 1, prev = st.rank && st.rank[s] || 0;
      out.rank = RANK_L[rk]; out.best = RANK_L[Math.max(rk, prev)];
      note(st, 'win', 1);
      if (rk >= 2) note(st, 'rankA', 1);
      if (rk >= 3) note(st, 'rankS', 1);
      if (info.boss) note(st, 'boss', 1);
      if (info.ecmd) note(st, 'ecmd', 1);
      if (ext.manual) note(st, 'manual', 1);
      if (first) note(st, 'first', 1);
      if (ext.pHp >= K.flawless) note(st, 'flawless', 1);
      if (rk > prev) {
        if (!st.rank) st.rank = {};
        st.rank[s] = rk;
        // S評価をはじめて取ったステージ: 1回だけの報酬
        if (rk === 3) { var sb = rankBonus(s); st.money += sb.m; st.steel += sb.s; st.bp += sb.bp; out.sBonus = sb; }
      }
      // 作戦(10ステージ)の最後のボスをはじめて倒した: 制圧報酬
      if (first && info.boss) { var ob = opReward(s / 10), oi = opInfo(s); st.money += ob.m; st.steel += ob.s; st.bp += ob.bp; out.op = { n: oi.n, name: oi.name, m: ob.m, s: ob.s, bp: ob.bp }; }
    }
    return out;
  }

  // 着任のステージをクリア済みなのに、まだいない指揮官を着任させる(戻り値: 着任した指揮官)。
  // ふつうはそのステージの初クリアで着任する。あとから追加された指揮官は、すでにクリアしていれば次に開いたときに着任する。
  // レベルはいちばん高い指揮官の7割から
  function grantHeroes(st) {
    var maxL = 1, out = [];
    Object.keys(st.heroes).forEach(function (k) { maxL = Math.max(maxL, st.heroes[k].lv); });
    HEROES.forEach(function (h) {
      if (!st.heroes[h.id] && h.unlock > 0 && st.cleared >= h.unlock) {
        st.heroes[h.id] = { lv: Math.max(1, Math.round(maxL * 0.7)), exp: 0 };
        out.push(h.id);
      }
    });
    return out;
  }
  // ====== 目標と報酬(作戦・評価・任務・勲章) ======
  var RANK_N = { B: 1, A: 2, S: 3 }, RANK_L = [null, 'B', 'A', 'S'];
  // 作戦: 10ステージで1つ。最後のボスを倒すと制圧
  var OPS = ['夜明けの槌', '鉄の雨', '霧の回廊', '赤い稜線', '沈黙の港', '黒い森', '砂の嵐', '凍てつく刃', '雷鳴の峠', '灰色の狼', '鋼の潮', '燃える地平',
    '影の行軍', '白い沈黙', '蒼い稲妻', '最後の橋', '鉄の環', '暁の門', '嵐の目', '静かな海', '緋色の空', '深い霧', '遠い砲声', '夜の果て'];
  function opInfo(s) {
    var n = Math.max(1, Math.ceil(s / 10)), c = Math.floor((n - 1) / OPS.length);
    return { n: n, name: OPS[(n - 1) % OPS.length] + (c ? ' ' + (ROMAN[c + 1] || c + 1) : ''), first: (n - 1) * 10 + 1, last: n * 10 };
  }
  function round5(x) { return Math.max(5, Math.round(x / 5) * 5); }
  function opReward(n) { var rw = stageReward(n * 10); return { m: round5(rw.m * K.opRw), s: round5(rw.s * K.opRw), bp: rw.bp }; }
  function rankBonus(s) { var rw = stageReward(s); return { m: round5(rw.m * K.sRw), s: round5(rw.s * K.sRw), bp: 1 }; }
  function bestRank(st, s) { return RANK_L[st.rank && st.rank[s] || 0]; }
  // 任務・勲章の報酬の基準: いまの最前線(ボス戦は報酬が2倍なので、1つ手前で測る)
  function goalBase(st) { var c = Math.max(1, st.cleared); return stageReward(c % 10 === 0 && c > 1 ? c - 1 : c); }
  // 記録(勲章)と、今日の任務の進み具合を数える
  function note(st, ev, n) {
    if (!st.stats) st.stats = { battles: 0, wins: 0 };
    st.stats[ev] = (st.stats[ev] || 0) + n;
    if (st.ms && st.ms.prog) st.ms.prog[ev] = (st.ms.prog[ev] || 0) + n;
  }
  // ---- 任務: 1日に3つ(端末の日付で入れ替わる)。全部こなすと追加の報酬 ----
  var MISSIONS = {
    win:     { name: '戦闘に{n}回勝利する', n: [3, 4, 5] },
    kill:    { name: '敵の部隊を{n}撃破する', n: [10, 15, 20] },
    rankA:   { name: 'A評価以上で{n}回勝利する', n: [2, 3], grp: 'rank' },
    rankS:   { name: 'S評価で{n}回勝利する', n: [1, 2], grp: 'rank' },
    boss:    { name: 'ボス戦に勝利する', n: [1], min: 10 },
    ecmd:    { name: '敵将のいる戦闘に勝利する', n: [1], min: 13 },
    manual:  { name: '手動(AUTO OFF)で勝利する', n: [1], min: 3 },
    first:   { name: '新しいステージを{n}つ制圧する', n: [1, 2] },
    upgrade: { name: '施設を{n}回強化する', n: [2, 3, 4] },
    arm:     { name: '兵器を{n}回強化する', n: [2, 3], need: 'lab' },
    collect: { name: '基地で資源を回収する', n: [1], need: 'supply' }
  };
  var MS_KEYS = Object.keys(MISSIONS);
  function msPick(st, day) {
    var r = rngFrom(hashInt(day * 131 + ((st.created || 0) % 100000))), ok = MS_KEYS.filter(function (k) {
      var m = MISSIONS[k];
      return !(m.min && st.cleared < m.min) && !(m.need && !lv(st, m.need));
    }), out = [], grp = {};
    for (var i = ok.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), x = ok[i]; ok[i] = ok[j]; ok[j] = x; }
    for (i = 0; i < ok.length && out.length < 3; i++) {
      var m = MISSIONS[ok[i]];
      if (m.grp) { if (grp[m.grp]) continue; grp[m.grp] = 1; }
      out.push({ id: ok[i], n: m.n[Math.floor(r() * m.n.length)], got: false });
    }
    return out;
  }
  // 今日の任務(日付が変わっていたら入れ替える)。day = 日付の通し番号
  function msState(st, day) {
    if (!st.ms || st.ms.day !== day || !st.ms.list) st.ms = { day: day, list: msPick(st, day), prog: {}, all: false };
    return st.ms.list.map(function (q, i) {
      var m = MISSIONS[q.id], p = Math.min(q.n, st.ms.prog[q.id] || 0);
      return { i: i, id: q.id, name: m.name.replace('{n}', q.n), n: q.n, p: p, done: p >= q.n, got: !!q.got };
    });
  }
  function msReward(st, all) {
    var b = goalBase(st), k = all ? K.msAllRw : K.msRw;
    return { m: round5(b.m * k), s: round5(b.s * k), bp: all ? 2 : 1 };
  }
  function msClaim(st, i) {
    var q = st.ms && st.ms.list && st.ms.list[i];
    if (!q || q.got || (st.ms.prog[q.id] || 0) < q.n) return null;
    var rw = msReward(st, false), out = { m: rw.m, s: rw.s, bp: rw.bp, all: null };
    q.got = true;
    if (!st.ms.all && st.ms.list.every(function (x) { return x.got; })) { st.ms.all = true; out.all = msReward(st, true); out.m += out.all.m; out.s += out.all.s; out.bp += out.all.bp; }
    st.money += out.m; st.steel += out.s; st.bp = (st.bp || 0) + out.bp;
    note(st, 'missions', 1);
    return out;
  }
  function msClaimable(st) { return st.ms && st.ms.list ? st.ms.list.filter(function (q) { return !q.got && (st.ms.prog[q.id] || 0) >= q.n; }).length : 0; }
  // ---- 勲章: 記録が一定の数に届くと、段ごとに1回ずつ報酬 ----
  function stat(st, k) { return st.stats && st.stats[k] || 0; }
  var MEDALS = [
    { id: 'advance', name: '進撃章', desc: 'ステージを制圧する', unit: 'ステージ', t: [10, 30, 60, 100, 150, 200], v: function (st) { return st.cleared; } },
    { id: 'veteran', name: '歴戦章', desc: '戦闘に勝利する', unit: '勝', t: [10, 50, 200, 500, 1000], v: function (st) { return stat(st, 'wins'); } },
    { id: 'hunter', name: '撃破章', desc: '敵の部隊を撃破する', unit: '部隊', t: [50, 300, 1000, 3000, 10000], v: function (st) { return stat(st, 'kill'); } },
    { id: 'perfect', name: '完勝章', desc: 'S評価を取ったステージの数', unit: 'ステージ', t: [5, 20, 50, 100], v: function (st) { var n = 0; if (st.rank) for (var k in st.rank) if (st.rank[k] >= 3) n++; return n; } },
    { id: 'operation', name: '作戦章', desc: '作戦を制圧する(10ステージごとのボスを撃破)', unit: '作戦', t: [1, 3, 6, 10, 15], v: function (st) { return Math.floor(st.cleared / 10); } },
    { id: 'tactician', name: '采配章', desc: '手動(AUTO OFF)で勝利する', unit: '勝', t: [1, 10, 50], v: function (st) { return stat(st, 'manual'); } },
    { id: 'breaker', name: '阻止章', desc: '予告中の敵将を倒して、スキルを阻止する', unit: '回', t: [1, 5, 20], v: function (st) { return stat(st, 'estop'); } },
    { id: 'duelist', name: '将星章', desc: '敵将のいる戦闘に勝利する', unit: '勝', t: [1, 10, 40], v: function (st) { return stat(st, 'ecmd'); } },
    { id: 'flawless', name: '無傷章', desc: '被害5%以下で勝利する', unit: '勝', t: [1, 10, 50], v: function (st) { return stat(st, 'flawless'); } },
    { id: 'builder', name: '築城章', desc: '施設を建設・強化する', unit: '回', t: [10, 50, 150, 300], v: function (st) { return stat(st, 'upgrade'); } },
    { id: 'engineer', name: '技術章', desc: '兵器を強化する', unit: '回', t: [10, 50, 150, 300], v: function (st) { return stat(st, 'arm'); } },
    { id: 'inventor', name: '開発章', desc: '新型の兵器を開発する', unit: '種', t: [4, 12, 24, 40], v: function (st) { var n = 0; TYPES.forEach(function (t) { ARM_KINDS.forEach(function (k) { n += armTier(armLv(st, t, k)); }); }); return n; } },
    { id: 'leader', name: '人望章', desc: '指揮官を集める', unit: '人', t: [3, 6, 10], v: function (st) { return Object.keys(st.heroes).length; } },
    { id: 'mentor', name: '練達章', desc: '指揮官の最高レベル', unit: 'Lv', t: [10, 30, 60, 100], v: function (st) { var m = 0; Object.keys(st.heroes).forEach(function (h) { m = Math.max(m, st.heroes[h].lv); }); return m; } },
    { id: 'supply', name: '補給章', desc: '基地で資源を回収する', unit: '回', t: [5, 30, 100], v: function (st) { return stat(st, 'collect'); } },
    { id: 'duty', name: '精勤章', desc: '任務を達成する', unit: '件', t: [3, 15, 50, 150], v: function (st) { return stat(st, 'missions'); } }
  ];
  var MEDAL = {};
  MEDALS.forEach(function (m) { MEDAL[m.id] = m; });
  var MEDAL_TIER = ['銅', '銀', '金', '白金', '金剛', '極'];
  function medalReward(st, tier) { var b = goalBase(st), k = K.medalRw + K.medalRwStep * tier; return { m: round5(b.m * k), s: round5(b.s * k), bp: 1 + tier }; }
  // 勲章の一覧: got = 受け取った段の数、can = いま受け取れる(次の段に届いている)
  function medalList(st) {
    return MEDALS.map(function (m) {
      var got = Math.min(m.t.length, st.medals && st.medals[m.id] || 0), v = m.v(st), next = got < m.t.length ? m.t[got] : null;
      return { id: m.id, name: m.name, desc: m.desc, unit: m.unit, v: v, got: got, max: m.t.length, next: next, can: next !== null && v >= next, tier: got > 0 ? MEDAL_TIER[got - 1] : null, nextTier: next !== null ? MEDAL_TIER[got] : null };
    });
  }
  function medalClaim(st, id) {
    var m = MEDAL[id];
    if (!m) return null;
    var got = st.medals && st.medals[id] || 0;
    if (got >= m.t.length || m.v(st) < m.t[got]) return null;
    var rw = medalReward(st, got);
    if (!st.medals) st.medals = {};
    st.medals[id] = got + 1;
    st.money += rw.m; st.steel += rw.s; st.bp = (st.bp || 0) + rw.bp;
    return { id: id, name: m.name, tier: MEDAL_TIER[got], m: rw.m, s: rw.s, bp: rw.bp };
  }
  function medalClaimable(st) { return medalList(st).filter(function (x) { return x.can; }).length; }

  function newState(now) {
    return {
      v: 1, money: K.startMoney, steel: K.startSteel,
      bld: { hq: { lv: 1, slot: 4 }, barracks: { lv: 1, slot: 1 } },
      heroes: { oni: { lv: 1, exp: 0 } },
      cleared: 0, sel: 1, arms: {}, bp: 0, parts: {},
      form: [{ type: 'inf', hero: 'oni' }, { type: 'inf', hero: null }],
      pending: null, tab: 'base', speed: 1,
      stats: { battles: 0, wins: 0 }, created: now,
      rank: {}, ms: null, medals: {}
    };
  }

  return {
    K: K, TYPES: TYPES, UNIT: UNIT, AFF: AFF, BLD: BLD, BLD_ORDER: BLD_ORDER, TYPE_BLD: TYPE_BLD,
    HEROES: HEROES, HERO: HERO, SKILL: SKILL, UNIT_POW: UNIT_POW, heroTraits: heroTraits, grantHeroes: grantHeroes,
    rngFrom: rngFrom, hashInt: hashInt,
    lv: lv, slots: slots, slotsFor: slotsFor, maxLevel: maxLevel, upgradeCost: upgradeCost, canUpgrade: canUpgrade,
    doUpgrade: doUpgrade, prodRate: prodRate, capHours: capHours, settle: settle, storedInfo: storedInfo, collect: collect,
    freeSlots: freeSlots, typeUnlocked: typeUnlocked, unlockedTypes: unlockedTypes, unitMult: unitMult, labMult: labMult,
    heroMult: heroMult, squadMult: squadMult, squadStats: squadStats, makeSquad: makeSquad, expNeed: expNeed, addHeroExp: addHeroExp,
    enemyCount: enemyCount, enemyTotal: enemyTotal, stageInfo: stageInfo, stageReward: stageReward, normalizeForm: normalizeForm, formSquads: formSquads,
    assignHeroes: assignHeroes, simulate: simulate, createBattle: createBattle, battleReserves: battleReserves, reserveCount: reserveCount, enemyReserveCount: enemyReserveCount, evalForm: evalForm, predict: predict, predictBlind: predictBlind, blindPlace: blindPlace, autoFormation: autoFormation,
    prepareBattle: prepareBattle, applyResult: applyResult, newState: newState,
    POST_KIND: POST_KIND, POST_ORDER: POST_ORDER, SUPPORT: SUPPORT,
    TERRAIN: TERRAIN, TERRAIN_KEYS: TERRAIN_KEYS, terrAtk: terrAtk, terrTake: terrTake, terrMove: terrMove, laneW: laneW,
    terrAt: terrAt, inBlob: inBlob, blobR: blobR, fightTerr: fightTerr, fightY: fightY, advY: advY, arrivalTime: arrivalTime, marchInfo: marchInfo, flatTerrain: flatTerrain,
    frontY: frontY, POST_POS: POST_POS, ECMD: ECMD, stageCmd: stageCmd, TACTICS: TACTICS, stageTactic: stageTactic, LAYOUTS: LAYOUTS, stageLayout: stageLayout, FIRE_Y: FIRE_Y, stageTerrain: stageTerrain, autoLanes: autoLanes, placeUnits: placeUnits, enemyPlace: enemyPlace,
    ARMS: ARMS, ARM_KINDS: ARM_KINDS, ARM_KIND: ARM_KIND, armLv: armLv, armTier: armTier, armName: armName, armMax: armMax, armIsDev: armIsDev,
    armCost: armCost, armEffect: armEffect, armXMax: armXMax,
    partGrade: partGrade, partStages: partStages, partName: partName, partCount: partCount, partDrop: partDrop, canArm: canArm, doArm: doArm, armOpt: armOpt, armRef: armRef,
    rankOf: rankOf, RANK_N: RANK_N, opInfo: opInfo, opReward: opReward, rankBonus: rankBonus, bestRank: bestRank, goalBase: goalBase, note: note,
    MISSIONS: MISSIONS, msState: msState, msClaim: msClaim, msReward: msReward, msClaimable: msClaimable,
    MEDALS: MEDALS, medalList: medalList, medalClaim: medalClaim, medalReward: medalReward, medalClaimable: medalClaimable,
    clearCache: function () { stageCache = {}; }
  };
})();
if (typeof module !== 'undefined') module.exports = TF;
