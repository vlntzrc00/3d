"""
Gera data/heart_data.js a partir dos arquivos OBJ do BodyParts3D.

Uso:
    python scripts/gerar_dados.py "pasta/com/objs" ["outra/pasta" ...]

Etapas:
  1. Lê todos os .obj (pode ser mais de uma pasta; arquivos com o mesmo número MM são lidos uma vez só).
  2. Remove peças duplicadas, classifica cada peça (ventrículo, átrio, valva, coronária...) e traduz o nome.
  3. Acrescenta os vasos modelados (scripts/vasos_modelados.py).
  4. Calcula, por vértice, a oclusão ambiente (sombras nas reentrâncias) e a gordura epicárdica
     (perto dos troncos coronários, do seio coronário e das veias maiores).
  5. Compacta: posições em Uint16 (precisão < 0,01 mm), índices em Uint16/Uint32, tudo em base64.

Dependências: numpy, scipy  (pip install numpy scipy)
"""
import os, re, sys, glob, json, base64, hashlib
import numpy as np
from scipy.spatial import cKDTree

AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)
from traducoes import TRADUCOES
import vasos_modelados

SAIDA = os.path.join(AQUI, '..', 'data', 'heart_data.js')


def categoria(nome):
    l = nome.lower()
    if 'valve of' in l: return 'valve'
    if 'vein' in l or 'coronary sinus' in l: return 'vein'
    if 'artery' in l or 'coronary' in l or 'arteri' in l: return 'art'
    if 'aorta' in l: return 'aorta'
    if 'pulmonary trunk' in l: return 'pulm'
    if any(k in l for k in ['node', 'bundle', 'internodal', 'todaro', 'sinuatrial']): return 'cond'
    if any(k in l for k in ['valve', 'leaflet', 'cusp', 'anulus', 'scallop', 'fibrous ring', 'trigone']): return 'valve'
    if any(k in l for k in ['papillary', 'trabecula', 'crest', 'crista', 'pectinate']): return 'musc'
    if any(k in l for k in ['atri', 'auricle']): return 'atrium'
    return 'vent'


def ler_obj(caminho):
    V, F = [], []
    with open(caminho) as fh:
        for linha in fh:
            if linha.startswith('v '):
                V.append([float(x) for x in linha.split()[1:4]])
            elif linha.startswith('f '):
                idx = [int(t.split('/')[0]) - 1 for t in linha.split()[1:]]
                for k in range(1, len(idx) - 1):
                    F.append((idx[0], idx[k], idx[k + 1]))
    return np.array(V, float), np.array(F, np.int64)


def ler_pastas(pastas):
    arquivos = {}
    for p in pastas:
        for f in glob.glob(os.path.join(p, '**', '*.obj'), recursive=True):
            mm = os.path.basename(f).split('_')[0]
            arquivos.setdefault(mm, f)
    pecas, vistos = [], set()
    for mm in sorted(arquivos, key=lambda s: int(re.sub(r'\D', '', s) or 0)):
        f = arquivos[mm]
        en = re.sub(r'^MM\d+_BP\d+_FMA\d+_', '', os.path.basename(f))[:-4]
        V, F = ler_obj(f)
        h = hashlib.md5(V.astype(np.float32).tobytes()).hexdigest()
        if h in vistos:
            continue
        vistos.add(h)
        pecas.append({'n': TRADUCOES.get(en, en), 'en': en, 'c': categoria(en), 'm': 0, 'V': V, 'F': F})
    return pecas


def normais(V, F):
    n = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    N = np.zeros_like(V)
    for k in range(3):
        np.add.at(N, F[:, k], n)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)


def amostrar(V, F, rng, dens=1.5):
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    idx = np.repeat(np.arange(len(F)), rng.poisson(area * dens))
    r1, r2 = rng.random((2, len(idx), 1)); s = np.sqrt(r1)
    return a[idx] * (1 - s) + b[idx] * s * (1 - r2) + c[idx] * s * r2


def sombras_e_gordura(pecas):
    rng = np.random.default_rng(1)
    arvore = cKDTree(np.vstack([amostrar(p['V'], p['F'], rng) for p in pecas]))
    troncos = ('Trunk of', 'Great cardiac', 'Coronary sinus', 'Small cardiac', 'Stem of')
    vasos = np.vstack([np.vstack([p['V'], p['V'][p['F']].mean(1)]) for p in pecas
                       if p['c'] in ('art', 'vein') and not p['m'] and any(k in p.get('en', '') for k in troncos)])
    arvore_vasos = cKDTree(vasos)
    r, desloc, lo, hi = 6.0, 4.5, 75.0, 450.0
    for p in pecas:
        V, N = p['V'], normais(p['V'], p['F'])
        c = np.minimum(arvore.query_ball_point(V + N * desloc, r, return_length=True),
                       arvore.query_ball_point(V - N * desloc, r, return_length=True))
        ao = 0.35 + 0.65 * (1 - np.clip((c - lo) / (hi - lo), 0, 1))  # 1 = aberto, 0.35 = bem escondido
        if p['c'] in ('vent', 'atrium'):
            d, _ = arvore_vasos.query(V, distance_upper_bound=20)
            gordura = np.clip((8 - np.where(np.isfinite(d), d, 20)) / 5.5, 0, 1) ** 1.2
        else:
            gordura = np.zeros(len(V))
        p['A'] = np.stack([np.round(ao * 255), np.round(gordura * 255)], 1).astype(np.uint8)


def empacotar(p):
    V = np.asarray(p['V'], np.float64); mn = V.min(0); esc = np.maximum(V.max(0) - mn, 1e-6)
    q = np.round((V - mn) / esc * 65535).astype(np.uint16)
    grande = len(V) > 65535
    out = {k: p[k] for k in ('n', 'c', 'm') }
    if p.get('en'): out['en'] = p['en']
    if p.get('note'): out['note'] = p['note']
    out.update({'o': [round(x, 4) for x in mn], 's': [round(x, 4) for x in esc],
                'v': base64.b64encode(q.tobytes()).decode(),
                'f': base64.b64encode(np.asarray(p['F'], np.uint32 if grande else np.uint16).tobytes()).decode(),
                'i32': int(grande), 'a': base64.b64encode(p['A'].tobytes()).decode()})
    return out


def main():
    pastas = sys.argv[1:]
    if not pastas:
        sys.exit(__doc__)
    pecas = ler_pastas(pastas)
    print(len(pecas), 'peças reais lidas')
    for v in vasos_modelados.NEW:
        pecas.append({'n': v['n'], 'c': v['c'], 'm': 1, 'note': v['note'], 'V': v['V'].astype(float), 'F': v['F'].astype(np.int64)})
    sombras_e_gordura(pecas)
    js = 'window.HEART=' + json.dumps([empacotar(p) for p in pecas], ensure_ascii=False, separators=(',', ':')) + ';'
    os.makedirs(os.path.dirname(SAIDA), exist_ok=True)
    with open(SAIDA, 'w', encoding='utf-8') as fh:
        fh.write(js)
    print('salvo', os.path.normpath(SAIDA), f'{len(js)/1e6:.1f} MB,', len(pecas), 'peças')


if __name__ == '__main__':
    main()
