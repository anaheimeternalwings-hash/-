# Gemini で作った絵を、ゲームに埋め込める小さな WebP にする(single/ と .work/cells/ → .work/art.json)
#   python3 -I tools/art/art.py
#  h.<id> / e.<id> : 顔絵(正方形に切り出し 288px)。小さい表示用に顔の位置(fx,fy)も出す
#  u.<type>.<era>  : 部隊アイコン(白背景を透明にして余白を詰める)
#  a.<type>.<k>.<n>: 兵器の絵、b.<施設>: 基地の施設、s.<特殊ユニット>(同じく透明に)、m.<地形>: 出撃の地図のタイル(正方形)
import json, os, sys, glob, base64, io
import numpy as np
from PIL import Image, ImageFilter
D = os.path.dirname(os.path.abspath(__file__))
cfg = json.load(open(D + '/cfg.json'))
CELLS = set(k for g in json.load(open(D + '/grids.json')).values() for k in g['keys'] if k)
out = {}
meta = {}
def webp(im, q):
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=6); return b.getvalue()
def portrait(key, im):
    c = cfg.get(key, {})
    W, H = im.size
    cell = key in CELLS  # まとめ描きから切り出した絵は、セルいっぱいを使う
    s = c.get('size', min(W, H) * (1 if cell else 0.82)); cx = c.get('cx', W / 2); top = c.get('top', 0 if cell else H * 0.03)
    if 'inset' in c: s = min(W, H) * (1 - 2 * c['inset']); cx = W / 2 + c.get('dx', 0) * W; top = H * (c['inset'] + c.get('dy', 0))  # まわりの余白(紙の縁)を切り落とす
    x0 = max(0, min(W - s, cx - s / 2)); y0 = max(0, min(H - s, top))
    im = im.crop((int(x0), int(y0), int(x0 + s), int(y0 + s))).resize((288, 288), Image.LANCZOS)
    fx, fy = c.get('face', [0.5, 0.45])
    if fx <= 1 and fy <= 1: fx, fy = fx * W, fy * H  # 1以下は画像に対する割合
    meta[key] = [round((fx - x0) / s, 3), round((fy - y0) / s, 3)]
    return webp(im, 80)
def unit(key, im):
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    H, W, _ = a.shape
    # 白に近い点(背景候補)のうち、ふちからつながっているものを背景にする
    wh = (a.min(axis=2) > 200) & ((a.max(axis=2) - a.min(axis=2)) < 30)
    if key.startswith('b.'): wh = (a.min(axis=2) > 186) & ((a.max(axis=2) - a.min(axis=2)) < 26)  # 施設: 足もとの薄い影も背景として消す
    bg = np.zeros((H, W), bool)
    stack = [(y, 0) for y in range(H)] + [(y, W - 1) for y in range(H)] + [(0, x) for x in range(W)] + [(H - 1, x) for x in range(W)]
    while stack:
        y, x = stack.pop()
        if y < 0 or x < 0 or y >= H or x >= W or bg[y, x] or not wh[y, x]: continue
        bg[y, x] = True
        stack += [(y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)]
    # 囲まれた白いすき間(引き金のまわりなど)も背景にする(ほぼ真っ白で、ある程度の大きさのもの)
    hole = (a.min(axis=2) > 232) & ((a.max(axis=2) - a.min(axis=2)) < 16) & ~bg
    if key.startswith('b.') and cfg.get(key, {}).get('holes'): hole = (a.min(axis=2) > 200) & ((a.max(axis=2) - a.min(axis=2)) < 22) & ~bg
    if key.startswith('b.') and not cfg.get(key, {}).get('holes'): hole[:] = False  # 施設は中の白い所(アンテナ・屋根の光)を残す(cfg で holes を付けた施設だけ抜く)
    seen = np.zeros((H, W), bool)
    for y0, x0 in zip(*np.where(hole)):
        if seen[y0, x0]: continue
        st = [(y0, x0)]; seen[y0, x0] = True; pts = []
        while st:
            y, x = st.pop(); pts.append((y, x))
            for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= yy < H and 0 <= xx < W and hole[yy, xx] and not seen[yy, xx]: seen[yy, xx] = True; st.append((yy, xx))
        if len(pts) >= 14:
            for y, x in pts: bg[y, x] = True
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))
    al = np.asarray(alpha).astype(np.float32)
    # ふちの白いにじみを消す(半透明のところは白を引いて色を戻す)
    rgb = a.astype(np.float32)
    k = (al / 255.0)[..., None]
    rgb = np.where(k > 0.02, (rgb - 255 * (1 - k)) / np.maximum(k, 0.02), rgb).clip(0, 255)
    rgba = np.dstack([rgb, al]).astype(np.uint8)
    img = Image.fromarray(rgba, 'RGBA')
    # 細長い兵器(銃など)が斜めに描かれていたら、横向きに直す(主軸の向きをそろえる)
    if key.startswith('a.'):
        ys, xs = np.where(al > 24)
        if len(xs) > 50:
            cxy = np.stack([xs - xs.mean(), ys - ys.mean()])
            ev, evec = np.linalg.eigh(np.cov(cxy))
            v = evec[:, 1]; ang = np.degrees(np.arctan2(v[1], v[0]))
            if ang > 90: ang -= 180
            if ang < -90: ang += 180
            if ev[1] > 9 * ev[0] and 6 < abs(ang) < 60:
                img = img.rotate(ang, resample=Image.BICUBIC, expand=True)
                al = np.asarray(img)[:, :, 3].astype(np.float32); W, H = img.size
    ys, xs = np.where(al > 24)
    pad = 6
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad), min(W, xs.max() + pad), min(H, ys.max() + pad))
    img = img.crop(box)
    if cfg.get(key, {}).get('flip'): img = img.transpose(Image.FLIP_LEFT_RIGHT)  # 左向きに描かれた絵は右向きにそろえる
    w, h = img.size; sc = 300 / max(w, h)
    img = img.resize((max(1, round(w * sc)), max(1, round(h * sc))), Image.LANCZOS)
    meta[key] = [img.size[0], img.size[1]]
    return webp(img, 84)
def tile(key, im):
    W, H = im.size; m = int(min(W, H) * 0.04); s = min(W, H) - 2 * m
    im = im.crop(((W - s) // 2, (H - s) // 2, (W - s) // 2 + s, (H - s) // 2 + s)).resize((192, 192), Image.LANCZOS)
    meta[key] = [192, 192]
    return webp(im, 78)
for f in sorted(glob.glob(D + '/.work/cells/*')) + sorted(glob.glob(D + '/single/*')):  # 同じキーは後(1枚ずつ描き直した絵)が優先
    key = os.path.splitext(os.path.basename(f))[0]
    im = Image.open(f).convert('RGB')
    b = unit(key, im) if key[:2] in ('u.', 'a.', 'b.', 's.') else tile(key, im) if key.startswith('m.') else portrait(key, im)
    out[key] = 'data:image/webp;base64,' + base64.b64encode(b).decode()
    print(key, len(b), 'bytes', meta[key])
json.dump({'img': out, 'meta': meta}, open(D + '/.work/art.json', 'w'), separators=(',', ':'))
print('total', sum(len(v) for v in out.values()), 'chars')
