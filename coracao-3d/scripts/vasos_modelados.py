"""Os 12 vasos que não existem no BodyParts3D, modelados como tubos.
Cada um começa numa abertura real do modelo (coordenadas em mm, eixo z para cima, -y = anterior, +x = esquerda do paciente).
"""
import json,base64,numpy as np
from tubos import tube
NEW=[]
def add(name,cat,V,F,note):
  NEW.append({'n':name,'c':cat,'m':1,'note':note,'V':np.asarray(V,np.float32),'F':np.asarray(F,np.uint32)})
def into(p0,p1,d=3):  # start point pushed d mm back inside the ostium
  p0=np.array(p0,float);p1=np.array(p1,float);u=(p1-p0)/np.linalg.norm(p1-p0);return tuple(p0-u*d)
arch=[(1,-128,1268),(-2,-130,1278),(-1,-126,1292),(5,-116,1302),(14,-100,1308),(24,-82,1305),(29,-65,1294),(29,-56,1272),(28,-53,1230),(27,-52,1180)]
add('Arco aórtico e aorta descendente','aorta',*tube(arch,lambda s:11-1.5*s),'Continua a aorta ascendente real: sobe, curva para trás e para a esquerda sobre a artéria pulmonar esquerda e desce atrás do átrio esquerdo.')
add('Tronco braquiocefálico','aorta',*tube([(0,-124,1298),(-6,-125,1314),(-12,-127,1332)],6,5.5),'Primeiro ramo do arco; divide-se depois em subclávia e carótida comum direitas.')
add('Artéria carótida comum esquerda','aorta',*tube([(12,-104,1305),(13,-106,1320),(14,-108,1336)],4.2,4),'Segundo ramo do arco aórtico.')
add('Artéria subclávia esquerda','aorta',*tube([(22,-86,1303),(27,-86,1317),(33,-87,1332)],5,4.6),'Terceiro ramo do arco aórtico.')
add('Artéria pulmonar esquerda','pulm',*tube([(29,-119,1287),(42,-106,1292),(58,-95,1292),(74,-86,1287)],9.5,8),'Sai da bifurcação do tronco pulmonar real e segue para o pulmão esquerdo, por baixo do arco aórtico.')
add('Artéria pulmonar direita','pulm',*tube([(27,-120,1285),(18,-110,1283),(5,-101,1281),(-12,-96,1279),(-40,-94,1276)],9.5,8),'Passa por trás da aorta ascendente e da veia cava superior, abaixo do arco, até o pulmão direito.')
add('Veia cava superior','vein',*tube([(-16.1,-115.5,1268),(-16.1,-115.5,1278),(-17,-114,1300),(-18,-112,1330)],10.5,10.5),'Encaixada na abertura superior real do átrio direito.')
add('Veia cava inferior','vein',*tube([(-16.1,-115.5,1195),(-16.1,-115.5,1185),(-15,-111,1170),(-14,-107,1155)],11.5,11.5),'Encaixada na abertura inferior real do átrio direito.')
pv=[('Veia pulmonar superior esquerda',[(45.7,-88,1254.2),(58,-78,1258),(70,-70,1262)],6.5),
    ('Veia pulmonar inferior esquerda',[(45.5,-76.4,1229.8),(56,-68,1226),(67,-62,1222)],6),
    ('Veia pulmonar superior direita',[(-9.1,-92.1,1240.6),(-20,-86,1244),(-36,-80,1247)],6.5),
    ('Veia pulmonar inferior direita',[(-6.8,-83,1221.6),(-18,-78,1219),(-34,-72,1216)],6)]
for n,p,r in pv:
  add(n,'pv',*tube([into(p[0],p[1])]+p,r,r*.95),'Começa no óstio real marcado na parede do átrio esquerdo; o trajeto até o pulmão é aproximado.')
