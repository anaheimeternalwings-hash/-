#!/usr/bin/env python3
"""生成した絵(SpriteCook)をゲーム用に整えて index.html に埋め込む。

  python3 tools/art.py add h:oni     元画像.png   … 指揮官の顔(正方形に切って 256px)
  python3 tools/art.py add e:ghost   元画像.png   … 敵将の顔
  python3 tools/art.py add u:tank:3  元画像.png   … 部隊アイコン(背景を透明にした味方の絵。
                                                  青緑の部分を赤に変えた敵の絵も作る。128px)
  python3 tools/art.py embed                     … art/*.webp を index.html の ART に書き込む

画像は軽い WebP にして art/ に置き、index.html には data URL で埋め込む(1ファイルのまま、オフラインで動く)。
必要なもの: Pillow(WebP 対応)
"""
import base64
import colorsys
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART_DIR = os.path.join(ROOT, 'art')
HTML = os.path.join(ROOT, 'index.html')

PORTRAIT_PX = 256
UNIT_PX = 128
QUALITY = 80

# 味方の色(HUD の --ally #38d9b0)の色相のあたりを、敵の色(--enemy #ff4d4d)の色相へ回す
ALLY_HUE = 164 / 360
ENEMY_HUE = 0 / 360
HUE_RANGE = 34 / 360   # 味方の色とみなす色相の幅(±)
MIN_SAT = 0.22         # これより色の薄い部分(鉄・肌・影)は変えない


def key_to_file(key):
    return key.replace(':', '-') + '.webp'


def file_to_key(name):
    return name[:-5].replace('-', ':')


def save_webp(img, key):
    os.makedirs(ART_DIR, exist_ok=True)
    path = os.path.join(ART_DIR, key_to_file(key))
    img.save(path, 'WEBP', quality=QUALITY, method=6)
    print('  %s  %dx%d  %.1f KB' % (os.path.relpath(path, ROOT), img.width, img.height, os.path.getsize(path) / 1024))


def square_crop(img):
    w, h = img.size
    s = min(w, h)
    # 顔は上寄りにあることが多いので、縦長のときは上から切る
    top = 0 if h > w else (h - s) // 2
    left = (w - s) // 2
    return img.crop((left, top, left + s, top + s))


def portrait(src, key):
    img = Image.open(src).convert('RGB')
    img = square_crop(img).resize((PORTRAIT_PX, PORTRAIT_PX), Image.LANCZOS)
    save_webp(img, key)


def trim_pad(img, margin=0.06):
    """透明な余白を切り、正方形のまんなかに置く"""
    bbox = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    s = int(max(w, h) * (1 + margin * 2))
    out = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    # 地面に置いた物は下をそろえる(横長の車両は少し下寄り)
    out.paste(img, ((s - w) // 2, (s - h) // 2 + (s - h) // 6 if w > h * 1.2 else (s - h) // 2))
    return out


def to_enemy(img):
    """味方の青緑を敵の赤に塗り替える(鉄・肌・影などの色の薄い部分はそのまま)"""
    px = img.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            d = (h - ALLY_HUE + 0.5) % 1 - 0.5
            if abs(d) > HUE_RANGE or s < MIN_SAT:
                continue
            # 色相の幅の端ほど弱く変える(境目がなじむように)
            k = min(1.0, (HUE_RANGE - abs(d)) / (HUE_RANGE * 0.35)) * min(1.0, (s - MIN_SAT) / 0.12)
            nh = (ENEMY_HUE + d * 0.5) % 1
            nr, ng, nb = colorsys.hsv_to_rgb(nh, min(1, s * 1.02), min(1, v * 1.12))
            px[x, y] = (round(r + (nr * 255 - r) * k), round(g + (ng * 255 - g) * k), round(b + (nb * 255 - b) * k), a)
    return img


def unit(src, key):
    m = re.fullmatch(r'u:(inf|at|tank|art):(\d+)', key)
    if not m:
        sys.exit('部隊アイコンのキーは u:兵種:段階 (例 u:tank:3)')
    t, n = m.group(1), m.group(2)
    img = Image.open(src).convert('RGBA')
    img = trim_pad(img).resize((UNIT_PX, UNIT_PX), Image.LANCZOS)
    save_webp(img, 'u:%s:a:%s' % (t, n))
    save_webp(to_enemy(img.copy()), 'u:%s:e:%s' % (t, n))


def embed():
    files = sorted(f for f in os.listdir(ART_DIR) if f.endswith('.webp')) if os.path.isdir(ART_DIR) else []
    lines = []
    total = 0
    for f in files:
        data = open(os.path.join(ART_DIR, f), 'rb').read()
        total += len(data)
        lines.append("'%s': 'data:image/webp;base64,%s'," % (file_to_key(f), base64.b64encode(data).decode()))
    html = open(HTML, encoding='utf-8').read()
    pat = re.compile(r'/\*ART-BEGIN\*/.*?/\*ART-END\*/', re.S)
    if not pat.search(html):
        sys.exit('index.html に /*ART-BEGIN*/ … /*ART-END*/ がない')
    body = '/*ART-BEGIN*/\n' + ''.join(l + '\n' for l in lines) + '/*ART-END*/'
    html = pat.sub(lambda _: body, html, count=1)
    open(HTML, 'w', encoding='utf-8').write(html)
    print('埋め込み: %d 枚 / %.1f KB(base64 で約 %.1f KB)' % (len(files), total / 1024, total * 4 / 3 / 1024))


def main(argv):
    if len(argv) >= 1 and argv[0] == 'embed':
        return embed()
    if len(argv) == 3 and argv[0] == 'add':
        key, src = argv[1], argv[2]
        if re.fullmatch(r'[he]:[a-z]+', key):
            return portrait(src, key)
        return unit(src, key)
    print(__doc__)
    sys.exit(1)


if __name__ == '__main__':
    main(sys.argv[1:])
