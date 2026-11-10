# .work/art.json の絵を index.html に埋め込む(/*ART*/ と /*ENDART*/ のあいだを置きかえる)
#   python3 -I tools/art/embed.py            … リポジトリの index.html を書きかえる
#   部隊アイコンは兵種ごとに、3年代がそろった兵種だけ使う(同じ兵種で古い絵と混ざらないように)
import json, os, re, sys
D = os.path.dirname(os.path.abspath(__file__))
TYPES = ('inf', 'at', 'tank', 'art')
def embed(html):
    A = json.load(open(D + '/.work/art.json'))
    for t in TYPES:
        ks = ['u.%s.%d' % (t, e) for e in (1, 2, 3)]
        miss = [k for k in ks if k not in A['img']]
        if miss:
            for k in ks: A['img'].pop(k, None); A['meta'].pop(k, None)
            print('部隊アイコンが足りない兵種は今までの絵:', t, miss)
    NARM = {'inf': {'w': 7, 'a': 6, 'x': 6}, 'at': {'w': 7, 'a': 6, 'x': 6}, 'tank': {'w': 6, 'a': 6, 'x': 6}, 'art': {'w': 7, 'a': 6, 'x': 6}}
    for t in NARM:
        for k, n in NARM[t].items():
            ks = ['a.%s.%s.%d' % (t, k, i + 1) for i in range(n)]
            if any(x not in A['img'] for x in ks):
                if any(x in A['img'] for x in ks): print('兵器の絵が足りない組は今までの絵:', t, k)
                for x in ks: A['img'].pop(x, None); A['meta'].pop(x, None)
    MK = ['m.grass', 'm.forest', 'm.mount', 'm.desert', 'm.dforest', 'm.lake', 'm.snow', 'm.sforest', 'm.base']
    if any(x not in A['img'] for x in MK):
        for x in MK: A['img'].pop(x, None); A['meta'].pop(x, None)
    a, b = '/*ART*/', '/*ENDART*/'
    assert html.count(a) == 1 and html.count(b) == 1
    i, j = html.index(a) + len(a), html.index(b)
    return html[:i] + json.dumps(A, separators=(',', ':')) + html[j:]
if __name__ == '__main__':
    p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(D, '..', '..', 'index.html')
    h = embed(open(p).read()); open(p, 'w').write(h); print('embedded', len(h), 'bytes')
