#!/usr/bin/env python3
"""生成画像(art/src/*.png)を小さな WebP にして index.html の <script id="art"> に埋め込む。

  python3 tools/embed_art.py

ファイル名がそのまま画像のキーになる:
  h-<指揮官>.png   味方の指揮官の顔(正方形に切り抜く・背景あり)
  e-<敵将>.png     敵将の顔
  u-<兵種>-<段階>.png  兵種アイコン(味方・背景は透明)。敵用(v-)は青緑を赤に塗り替えて自動で作る
加工したものは art/webp/ にも保存する(差分を見るため)。
"""
import base64
import io
import os
import re
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'art', 'src')
OUT = os.path.join(ROOT, 'art', 'webp')
HTML = os.path.join(ROOT, 'index.html')

PORTRAIT_PX = 192   # 一番大きい表示(120px)を高精細の画面でもぼやけない程度に
UNIT_PX = 128       # 一番大きい表示(84px)
Q_PORTRAIT = 78
Q_UNIT = 82


def square_crop(im):
    w, h = im.size
    s = min(w, h)
    return im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def portrait(path):
    im = Image.open(path).convert('RGB')
    return square_crop(im).resize((PORTRAIT_PX, PORTRAIT_PX), Image.LANCZOS)


def unit_icon(path):
    im = Image.open(path).convert('RGBA')
    a = np.array(im)[:, :, 3]
    ys, xs = np.where(a > 16)
    if len(xs):  # 透明な余白を詰めて、正方形の中央に置く(少し余白を残す)
        im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    w, h = im.size
    s = int(max(w, h) * 1.06)
    sq = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    sq.paste(im, ((s - w) // 2, (s - h) // 2))
    return sq.resize((UNIT_PX, UNIT_PX), Image.LANCZOS)


def to_enemy(im):
    """青緑(味方 #38d9b0)の部分だけを赤(敵 #ff4d4d)に塗り替える。琥珀色や灰色はそのまま"""
    rgba = np.array(im).astype(np.float32) / 255.0
    rgb = rgba[:, :, :3]
    mx, mn = rgb.max(axis=2), rgb.min(axis=2)
    d = mx - mn
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    hue = np.zeros_like(mx)
    nz = d > 1e-6
    rm = nz & (mx == r)
    gm = nz & (mx == g) & ~rm
    bm = nz & ~rm & ~gm
    hue[rm] = ((g - b)[rm] / d[rm]) % 6
    hue[gm] = (b - r)[gm] / d[gm] + 2
    hue[bm] = (r - g)[bm] / d[bm] + 4
    hue *= 60.0
    sat = np.where(mx > 0, d / np.maximum(mx, 1e-6), 0)
    # 青緑〜水色(130〜205度)を対象に、境目はなだらかに
    wgt = np.clip(1 - np.abs(hue - 167) / 38, 0, 1) * np.clip((sat - 0.12) / 0.2, 0, 1)
    wgt = np.clip(wgt * 1.6, 0, 1)
    # 赤に置き換えた色: 明るさ(max)と彩度を保ち、色相を 0 度に
    v = np.clip(mx * 1.15, 0, 1)
    s2 = np.clip(sat * 1.05, 0, 1)
    red = np.stack([v, v * (1 - s2 * 0.92), v * (1 - s2 * 0.92)], axis=2)
    out = rgb * (1 - wgt[:, :, None]) + red * wgt[:, :, None]
    rgba[:, :, :3] = out
    return Image.fromarray((np.clip(rgba, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def webp(im, q):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=q, method=6)
    return buf.getvalue()


def main():
    if not os.path.isdir(SRC):
        sys.exit('art/src がありません')
    os.makedirs(OUT, exist_ok=True)
    items = {}
    for fn in sorted(os.listdir(SRC)):
        m = re.match(r'^([hue])-([a-z]+(?:-\d+)?)\.(png|webp|jpg)$', fn)
        if not m:
            continue
        kind, name = m.group(1), m.group(2)
        path = os.path.join(SRC, fn)
        if kind in 'he':
            items[kind + '-' + name] = webp(portrait(path), Q_PORTRAIT)
        else:
            ic = unit_icon(path)
            items['u-' + name] = webp(ic, Q_UNIT)
            items['v-' + name] = webp(to_enemy(ic), Q_UNIT)
    total = 0
    for k, data in items.items():
        open(os.path.join(OUT, k + '.webp'), 'wb').write(data)
        total += len(data)
    body = ''.join('\n"%s":"%s",' % (k, base64.b64encode(items[k]).decode()) for k in sorted(items))
    html = open(HTML, encoding='utf-8').read()
    new, n = re.subn(r'/\*ART:BEGIN\*/[\s\S]*?/\*ART:END\*/', lambda _: '/*ART:BEGIN*/' + body.rstrip(',') + '\n/*ART:END*/', html)
    if n != 1:
        sys.exit('index.html に ART の目印がありません')
    open(HTML, 'w', encoding='utf-8').write(new)
    print('%d 枚 / WebP 合計 %.1f KB(base64 で %.1f KB)' % (len(items), total / 1024, total * 4 / 3 / 1024))


if __name__ == '__main__':
    main()
