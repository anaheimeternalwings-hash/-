#!/usr/bin/env python3
"""src/ のソースと tools/art の絵から index.html を組み立てる。

使い方:  python3 -I tools/build.py [出力先]
  src/page.html   ページの骨組み(/*__CSS__*/ /*__LOGIC__*/ /*__UI__*/ を差し込む)
  src/style.css   見た目
  src/logic.js    ゲームの計算(Node のテストからも使う。グローバル TF)
  src/ui/*.js     画面と演出(ファイル名の順につないで、1つの関数の中に入れる)
絵は tools/art/.work/art.json(なければ今の index.html に入っている絵)を埋め込む。
"""
import glob, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools', 'art'))
import embed  # noqa: E402


def read(*p):
    with open(os.path.join(ROOT, *p), encoding='utf-8') as f:
        return f.read()


def assemble():
    page = read('src', 'page.html')
    ui = ''.join(read(p) for p in sorted(glob.glob(os.path.join(ROOT, 'src', 'ui', '*.js'))))
    for key, body in (('/*__CSS__*/', read('src', 'style.css')), ('/*__LOGIC__*/', read('src', 'logic.js')), ('/*__UI__*/', ui)):
        assert page.count(key) == 1, key
        page = page.replace(key, body.strip('\n'))
    return page


def with_art(html):
    """絵を埋め込む。tools/art/.work/art.json がなければ(クローンした直後など)、今の index.html の絵をそのまま使う"""
    if os.path.exists(os.path.join(ROOT, 'tools', 'art', '.work', 'art.json')):
        return embed.embed(html)
    a, b = '/*ART*/', '/*ENDART*/'
    cur = read('index.html')
    assert html.count(a) == 1 and html.count(b) == 1 and cur.count(a) == 1 and cur.count(b) == 1
    return html[:html.index(a)] + cur[cur.index(a):cur.index(b)] + html[html.index(b):]


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'index.html')
    html = with_art(assemble())
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('built %s: %d bytes' % (os.path.relpath(out, ROOT), len(html.encode('utf-8'))))


if __name__ == '__main__':
    main()
