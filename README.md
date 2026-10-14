# Coração 3D

Coração humano interativo em 3D, feito para estudo de anatomia. Roda direto no navegador, sem instalar nada.

- **128 peças reais** do [BodyParts3D](https://lifesciencedb.jp/bp3d/): paredes, valvas, músculos papilares, trabéculas, coronárias, veias cardíacas e sistema de condução.
- **12 vasos modelados** para ligar o coração ao corpo: arco aórtico e ramos, aorta descendente, artérias pulmonares, veias cavas e veias pulmonares. São aproximados e aparecem em verde no modo "Real × modelado".
- Três modos de cor: **Realista** (tecido úmido, gordura epicárdica, sombras), **Didático** (cores fortes) e **Real × modelado**.
- Clique numa estrutura para ver o nome em português. Há camadas, transparência das paredes, vistas prontas e zoom.

## Como abrir

Dê dois cliques em `index.html` (abre no Chrome, Edge ou Firefox). Funciona sem internet; só as fontes do Google ficam no padrão do sistema quando estiver offline.

No VS Code, a extensão **Live Server** também funciona: botão direito em `index.html` → *Open with Live Server*.

## Publicar no GitHub Pages

1. Suba esta pasta para um repositório.
2. No GitHub: **Settings → Pages → Source: Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Em um ou dois minutos o site fica em `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/`.

## Estrutura

```
index.html                 página
css/style.css              visual (cores, layout, modo claro/escuro)
js/app.js                  3D e interação (Three.js)
data/heart_data.js         as 140 peças, já convertidas e compactadas (gerado pelos scripts)
vendor/                    Three.js r147 (three.min.js, OrbitControls, RoomEnvironment)
modelos/coracao.glb        o coração inteiro num arquivo 3D padrão (Blender, PowerPoint, Visualizador 3D)
modelos/vasos-modelados/   os 12 vasos modelados em .obj (mm, mesmo sistema do BodyParts3D)
scripts/                   conversão dos .obj do BodyParts3D para data/heart_data.js
```

## Regenerar os dados a partir dos .obj

Precisa de Python 3 com `numpy`, `scipy` e `trimesh` (`pip install -r requirements.txt`).

```bash
python scripts/gerar_dados.py "C:/caminho/pasta-com-objs" "C:/outra/pasta"
python scripts/exportar_modelos.py
```

- `gerar_dados.py` lê os .obj (aceita várias pastas e ignora duplicados), traduz os nomes (`scripts/traducoes.py`), acrescenta os vasos de `scripts/vasos_modelados.py`, calcula sombras e gordura por vértice e grava `data/heart_data.js`.
- `exportar_modelos.py` gera `modelos/coracao.glb` e os .obj dos vasos modelados.

Os .obj originais do BodyParts3D não estão no repositório; baixe-os no site do BodyParts3D.

## O que o modelo simplifica

- Os vasos modelados partem de aberturas reais do modelo, mas o trajeto até pulmões e corpo é aproximado e foi cortado perto do coração.
- Faltam as cordas tendíneas (não existem no BodyParts3D).
- Neste modelo a artéria interventricular posterior vem da coronária esquerda (dominância esquerda). Na maioria das pessoas (≈ 70–80%) vem da coronária direita.
- A distribuição da gordura epicárdica é aproximada.

## Créditos e licença

- Modelos anatômicos: **BodyParts3D**, © The Database Center for Life Science (DBCLS), licença
  [CC BY-SA 2.1 JP](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en). Os arquivos derivados deles
  (`data/heart_data.js`, `modelos/`) seguem a mesma licença — veja `LICENCA-DOS-DADOS.md`.
- [Three.js](https://threejs.org) r147, licença MIT (`vendor/THREE-LICENSE.txt`).
