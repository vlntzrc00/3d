"""
Exporta a partir de data/heart_data.js:
  - modelos/coracao.glb : todas as peças num único arquivo 3D (abre no Blender, Visualizador 3D do Windows,
                          PowerPoint > Inserir > Modelos 3D, Sketchfab...). Unidades em metros, eixo Y para cima,
                          paciente de frente para +Z.
  - modelos/vasos-modelados/*.obj : os vasos modelados (os que não existem no BodyParts3D), em mm,
                          no mesmo sistema de coordenadas dos OBJ originais.

Dependências: numpy, trimesh  (pip install numpy trimesh)
"""
import os, re, json, base64, unicodedata
import numpy as np
import trimesh

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.join(AQUI, '..')
CORES = {'vent': '7e2a26', 'atrium': '5e1f2a', 'musc': '772726', 'art': 'a8363a', 'aorta': 'cf9c8e', 'pulm': 'c0939a',
         'pv': '8f4a58', 'vein': '4a3866', 'valve': 'e9dcc4', 'cond': 'e2b935'}


def ler():
    txt = open(os.path.join(RAIZ, 'data', 'heart_data.js'), encoding='utf-8').read()
    for p in json.loads(txt[txt.index('=') + 1:].rstrip().rstrip(';')):
        q = np.frombuffer(base64.b64decode(p['v']), np.uint16).reshape(-1, 3).astype(float)
        V = np.array(p['o']) + q / 65535 * np.array(p['s'])
        F = np.frombuffer(base64.b64decode(p['f']), np.uint32 if p['i32'] else np.uint16).reshape(-1, 3).astype(np.int64)
        yield p, V, F


def slug(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode()
    return re.sub(r'[^a-zA-Z0-9]+', '-', s).strip('-').lower()


def main():
    pecas = list(ler())
    centro = np.vstack([V for _, V, _ in pecas]).mean(0)
    cena = trimesh.Scene()
    pasta_obj = os.path.join(RAIZ, 'modelos', 'vasos-modelados'); os.makedirs(pasta_obj, exist_ok=True)
    usados = {}
    for p, V, F in pecas:
        W = (V - centro) * 0.001                     # mm -> m, centrado
        W = np.stack([W[:, 0], W[:, 2], -W[:, 1]], 1)  # z-up -> y-up; anterior (-y) -> +z
        cor = [int(CORES[p['c']][i:i + 2], 16) for i in (0, 2, 4)] + [255]
        mat = trimesh.visual.material.PBRMaterial(baseColorFactor=cor, roughnessFactor=0.5, metallicFactor=0.0, doubleSided=True)
        m = trimesh.Trimesh(W, F, process=False, visual=trimesh.visual.TextureVisuals(material=mat))
        nome = p['n']; usados[nome] = usados.get(nome, 0) + 1
        if usados[nome] > 1: nome = f'{nome} ({usados[nome]})'
        cena.add_geometry(m, node_name=nome, geom_name=nome)
        if p['m']:
            with open(os.path.join(pasta_obj, slug(p['n']) + '.obj'), 'w', encoding='utf-8') as fh:
                fh.write(f"# {p['n']} - modelado (aproximado). Coordenadas em mm, mesmo sistema do BodyParts3D.\n")
                fh.writelines(f'v {x:.3f} {y:.3f} {z:.3f}\n' for x, y, z in V)
                fh.writelines(f'f {a+1} {b+1} {c+1}\n' for a, b, c in F)
    saida = os.path.join(RAIZ, 'modelos', 'coracao.glb')
    cena.export(saida)
    print('salvo', os.path.normpath(saida), f'{os.path.getsize(saida)/1e6:.1f} MB')


if __name__ == '__main__':
    main()
