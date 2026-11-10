# まとめて描いた絵(grid/ のグリッド・横並び)を1枚ずつに切り分けて .work/cells に置く
#   python3 -I tools/art/split.py
import json, os, glob
import numpy as np
from PIL import Image
D = os.path.dirname(os.path.abspath(__file__))
os.makedirs(D + '/.work/cells', exist_ok=True)
G = json.load(open(D + '/grids.json'))
def runs(mask):
    # True が続く区間 [(start, end)] を返す
    out, i, n = [], 0, len(mask)
    while i < n:
        if mask[i]:
            j = i
            while j < n and mask[j]: j += 1
            out.append((i, j)); i = j
        else: i += 1
    return out
def cuts(dark, k):
    # 暗い列(行)の区間から、k 個のセルの範囲を求める。見つからなければ等分
    n = len(dark); rs = runs(dark)
    inner = [r for r in rs if r[0] > 0 and r[1] < n]
    lo = rs[0][1] if rs and rs[0][0] == 0 else 0
    hi = rs[-1][0] if rs and rs[-1][1] == n else n
    seps = []
    for c in range(1, k):
        want = lo + (hi - lo) * c / k
        best = min(inner, key=lambda r: abs((r[0] + r[1]) / 2 - want)) if inner else None
        if best and abs((best[0] + best[1]) / 2 - want) < (hi - lo) / k * 0.25: seps.append(best)
        else: seps.append((int(want), int(want)))
    edges = [lo] + [x for s in seps for x in s] + [hi]
    return [(edges[2 * i], edges[2 * i + 1]) for i in range(k)]
for f in sorted(glob.glob(D + '/grid/*')):
    name = os.path.splitext(os.path.basename(f))[0]
    if name not in G: print('skip', name); continue
    g = G[name]; im = Image.open(f).convert('RGB')
    if 'crop' in g: im = im.crop(tuple(g['crop']))
    a = np.asarray(im).astype(np.int16)
    if 'grid' in g:
        cols, rows = g['grid']
        lum = a.mean(axis=2)
        cx = cuts((lum < 28).mean(axis=0) > 0.8, cols)
        cy = cuts((lum < 28).mean(axis=1) > 0.8, rows)
        i = 0
        for r in range(rows):
            for c in range(cols):
                x0, x1 = cx[c]; y0, y1 = cy[r]
                im.crop((x0, y0, x1, y1)).save(D + '/.work/cells/' + g['keys'][i] + '.png'); i += 1
                print(name, g['keys'][i - 1], (x0, y0, x1, y1))
    else:
        # 白い背景に並んだ絵: 背景をふちから塗りつぶし、残りをつながった塊ごとに分ける。
        # 大きい塊 k 個を部隊とし、小さな塊(銃の先などの切れ端)はいちばん近い部隊に付ける。
        # 切り出すときは、ほかの部隊の部分を白で消す(隣の兵の足が入らないように)
        k = g['strip']; H, W, _ = a.shape
        wh = (a.min(axis=2) > 200) & ((a.max(axis=2) - a.min(axis=2)) < 30)
        bg = np.zeros((H, W), bool)
        st = [(y, x) for y in range(H) for x in (0, W - 1)] + [(y, x) for x in range(W) for y in (0, H - 1)]
        while st:
            y, x = st.pop()
            if bg[y, x] or not wh[y, x]: continue
            bg[y, x] = True
            if y > 0: st.append((y - 1, x))
            if y < H - 1: st.append((y + 1, x))
            if x > 0: st.append((y, x - 1))
            if x < W - 1: st.append((y, x + 1))
        lab = np.zeros((H, W), np.int32); comps = []
        fg = ~bg
        for y0 in range(H):
            for x0 in np.where(fg[y0] & (lab[y0] == 0))[0]:
                if lab[y0, x0]: continue
                n = len(comps) + 1; lab[y0, x0] = n; st = [(y0, x0)]; cnt = 0; xs0 = x0; xs1 = x0; ys0 = y0; ys1 = y0
                while st:
                    y, x = st.pop(); cnt += 1
                    xs0 = min(xs0, x); xs1 = max(xs1, x); ys0 = min(ys0, y); ys1 = max(ys1, y)
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            yy, xx = y + dy, x + dx
                            if 0 <= yy < H and 0 <= xx < W and fg[yy, xx] and not lab[yy, xx]:
                                lab[yy, xx] = n; st.append((yy, xx))
                comps.append({'n': n, 'cnt': cnt, 'box': (xs0, ys0, xs1, ys1)})
        big = sorted(comps, key=lambda c: -c['cnt'])[:k]
        # 段に分ける(縦の中心が同じ段の範囲に入るもの)→ 上の段から、段の中は左から
        rows = []
        for c in sorted(big, key=lambda c: (c['box'][1] + c['box'][3]) / 2):
            cy = (c['box'][1] + c['box'][3]) / 2
            for r in rows:
                if r['y0'] <= cy <= r['y1']: r['m'].append(c); break
            else: rows.append({'y0': c['box'][1], 'y1': c['box'][3], 'm': [c]})
        big = [c for r in rows for c in sorted(r['m'], key=lambda c: c['box'][0])]
        owner = {}
        pts = []
        for b in big:
            yy, xx = np.where(lab == b['n']); pts.append(np.stack([yy[::3], xx[::3]], 1).astype(np.float32))
        for c in comps:
            if c in big: owner[c['n']] = big.index(c); continue
            if c['cnt'] < 12: continue  # ちり
            yy, xx = np.where(lab == c['n']); q = np.stack([yy[::2], xx[::2]], 1).astype(np.float32)
            d = [min(np.sqrt(((P[None, :, :] - q[i:i + 64, None, :]) ** 2).sum(2)).min() for i in range(0, len(q), 64)) for P in pts]
            j = int(np.argmin(d))
            if d[j] <= 28: owner[c['n']] = j  # 近い切れ端だけ付ける(遠いのは捨てる)
        for i in range(k):
            keep = np.isin(lab, [n for n, o in owner.items() if o == i])
            ys, xs = np.where(keep)
            pad = 16
            x0, x1 = max(0, xs.min() - pad), min(W, xs.max() + pad + 1)
            y0, y1 = max(0, ys.min() - pad), min(H, ys.max() + pad + 1)
            out = a.copy(); out[~keep] = 255
            Image.fromarray(out[y0:y1, x0:x1].astype(np.uint8)).save(D + '/.work/cells/' + g['keys'][i] + '.png')
            print(name, g['keys'][i], (x0, y0, x1, y1), 'parts', sum(1 for o in owner.values() if o == i))
