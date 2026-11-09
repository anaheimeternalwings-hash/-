# .work/art.json の絵を index.html に埋め込む(/*ART*/ と /*ENDART*/ のあいだを置きかえる)
#   python3 -I tools/art/embed.py            … リポジトリの index.html を書きかえる
#   部隊アイコンは 4兵種×3年代 がそろったときだけ使う(古い絵と混ざらないように)
import json, os, re, sys
D = os.path.dirname(os.path.abspath(__file__))
NEED = ['u.%s.%d' % (t, e) for t in ('inf', 'at', 'tank', 'art') for e in (1, 2, 3)]
def embed(html):
    A = json.load(open(D + '/.work/art.json'))
    miss = [k for k in NEED if k not in A['img']]
    if miss:
        for k in [k for k in list(A['img']) if k.startswith('u.')]: A['img'].pop(k); A['meta'].pop(k, None)
        print('部隊アイコンが足りないので使わない:', miss)
    a, b = '/*ART*/', '/*ENDART*/'
    assert html.count(a) == 1 and html.count(b) == 1
    i, j = html.index(a) + len(a), html.index(b)
    return html[:i] + json.dumps(A, separators=(',', ':')) + html[j:]
if __name__ == '__main__':
    p = sys.argv[1] if len(sys.argv) > 1 else os.path.join(D, '..', '..', 'index.html')
    h = embed(open(p).read()); open(p, 'w').write(h); print('embedded', len(h), 'bytes')
