#!/usr/bin/env python3
"""試作(proto/<名前>/)を1ファイルの index.html に組み立てる。

使い方:  python3 -I proto/build.py shusen   (または fuyu)
  proto/<名前>/page.html   骨組み(/*__CSS__*/ /*__LOGIC__*/ /*__AUDIO__*/ /*__UI__*/ /*__ART__*/ を差し込む)
  proto/<名前>/style.css   見た目
  proto/<名前>/logic.js    ルール(Node の計測からも使う)
  proto/<名前>/ui.js       画面
  proto/<名前>/art.txt     使う絵の名前(1行に1つ)。絵は本体の index.html に埋め込まれているものを抜き出す
音は本体の src/ui/05-audio.js をそのまま使う(設定を覚える場所だけ変える)。
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(*p):
    with open(os.path.join(ROOT, *p), encoding='utf-8') as f:
        return f.read()


def art(name):
    html = read('index.html')
    a, b = html.index('/*ART*/') + len('/*ART*/'), html.index('/*ENDART*/')
    A = json.loads(html[a:b])
    keys = [k.strip() for k in read('proto', name, 'art.txt').split('\n') if k.strip() and not k.startswith('#')]
    miss = [k for k in keys if k not in A['img']]
    assert not miss, miss
    return json.dumps({'img': {k: A['img'][k] for k in keys}, 'meta': {k: A['meta'].get(k) for k in keys}}, separators=(',', ':'))


def main():
    name = sys.argv[1]
    page = read('proto', name, 'page.html')
    audio = read('src', 'ui', '05-audio.js').replace("'zensen-commander-audio'", "'%s-proto-audio'" % name)
    parts = {'/*__CSS__*/': read('proto', name, 'style.css'), '/*__LOGIC__*/': read('proto', name, 'logic.js'),
             '/*__AUDIO__*/': audio, '/*__UI__*/': read('proto', name, 'ui.js'), '/*__ART__*/': art(name)}
    for k, v in parts.items():
        assert page.count(k) == 1, k
        page = page.replace(k, v.strip('\n'))
    out = os.path.join(ROOT, 'proto', name, 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    print('built proto/%s/index.html: %d bytes' % (name, len(page.encode('utf-8'))))


if __name__ == '__main__':
    main()
