(function(){
'use strict';
/* ============================================================
   Coração 3D — visualizador (Three.js r147)
   Organização:
   1. Cores, grupos e nomes
   2. Renderizador, cena, luzes e câmera (fluxo de cor sRGB)
   3. Materiais: "completo" (tecido procedural) e "leve" (só cor + sombras)
   4. Carregamento das malhas num Web Worker (decodifica + calcula normais)
   5. Interface: vistas, zoom, camadas, cores, qualidade, transparência
   6. Seleção pelo mouse (no máximo 1 raycast por quadro)
   7. Laço de renderização sob demanda (só desenha quando algo muda)
   ============================================================ */

/* ---------- 1. Cores, grupos e nomes ---------- */
const COL={vent:0xa3293f,atrium:0xd2627a,musc:0x7d1d33,art:0xff3045,aorta:0xe02a3c,vein:0x3561e0,pulm:0x2f6bd8,pv:0xc93a5e,valve:0xf3e7c6,cond:0xffd23f};
// peça anatômica fresca: miocárdio vermelho-acastanhado, átrios mais escuros, grandes artérias claras (adventícia), veias arroxeadas
const REAL={vent:0x7e2a26,atrium:0x5e1f2a,musc:0x772726,art:0xa8363a,aorta:0xcf9c8e,pulm:0xc0939a,pv:0x8f4a58,vein:0x4a3866,valve:0xe9dcc4,cond:0xe2b935};
const GROUPS=[
 {k:'wall',t:'Paredes e músculos',col:'#a3293f',test:p=>['vent','atrium','musc'].includes(p.c)},
 {k:'great',t:'Grandes vasos',col:'#e02a3c',test:p=>['aorta','pulm','pv'].includes(p.c)||(p.c==='vein'&&p.m)},
 {k:'cor',t:'Coronárias e veias cardíacas',col:'#3561e0',test:p=>p.c==='art'||(p.c==='vein'&&!p.m)},
 {k:'valve',t:'Valvas',col:'#e9d9ad',test:p=>p.c==='valve'},
 {k:'cond',t:'Sistema de condução',col:'#ffd23f',test:p=>p.c==='cond'}];
const CATNAME={vent:'Ventrículos',atrium:'Átrios',musc:'Músculos internos',art:'Artéria coronária',aorta:'Aorta e ramos',vein:'Veia',pulm:'Circulação pulmonar (artéria)',pv:'Veia pulmonar',valve:'Valva',cond:'Sistema de condução'};
const TEX={vent:0,atrium:0,musc:0,art:1,aorta:1,pulm:1,pv:1,vein:1,valve:2,cond:3}; // tipo de textura no shader completo

/* ---------- 2. Renderizador, cena, luzes, câmera ---------- */
THREE.ColorManagement.legacyMode=false;          // cores em hex são lidas como sRGB e convertidas para linear
const stage=document.getElementById('stage'),tip=document.getElementById('tip'),loadingEl=document.getElementById('loading');
const R=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
R.outputEncoding=THREE.sRGBEncoding;
R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.0;
stage.prepend(R.domElement);
const S=new THREE.Scene();
const stageColor=()=>R.setClearColor(new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--stage').trim()||'#17191f'));
stageColor();matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{stageColor();dirty=true});
const hemi=new THREE.HemisphereLight(0xfff4f0,0x2a1a1c,.6);S.add(hemi);
const key=new THREE.DirectionalLight(0xfff1e6,1.35),rim=new THREE.DirectionalLight(0xc8d8ff,.6);S.add(key,rim);
let envTex=null;
try{const pm=new THREE.PMREMGenerator(R);envTex=pm.fromScene(new THREE.RoomEnvironment(),.04).texture;pm.dispose();}catch(e){}
const C=new THREE.PerspectiveCamera(32,1,1,4000);C.up.set(0,0,1);
const ctl=new THREE.OrbitControls(C,R.domElement);ctl.enableDamping=true;ctl.dampingFactor=.08;ctl.minDistance=90;ctl.maxDistance=700;
const G=new THREE.Group();S.add(G);
const meshes=[];

let mode='real',opacity=0,sel=null,fatOn=true,dirty=true;
// qualidade: "alta" usa o shader de tecido; "leve" usa material simples e resolução 1×
const fraco=matchMedia('(pointer:coarse)').matches||(navigator.hardwareConcurrency||8)<=4;
let quality=fraco?'leve':'alta';
function applyPixelRatio(){R.setPixelRatio(quality==='alta'?Math.min(devicePixelRatio,2):Math.min(devicePixelRatio,1.25));resize()}

/* ---------- 3. Materiais ---------- */
function baseColor(p){if(mode==='real')return (p.c==='vein'&&p.m)?0x5b4c7c:REAL[p.c];return mode==='anat'?COL[p.c]:(p.m?0x22b46e:0xc9b3b6)}
const U={uReal:{value:1},uFat:{value:1},uFatCol:{value:new THREE.Color(0xd9bf86)}};
// ruído: 3 oitavas, calculado 2 vezes por pixel (antes eram ~5 chamadas de 4 oitavas)
const GLSL_NOISE=`
float h31(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<3;i++){s+=a*vn3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s/.875;}
`;
const VERT_IN=['#include <common>','#include <common>\nattribute vec2 aA;varying vec2 vA;varying vec3 vOP;'];
const VERT_SET=['#include <begin_vertex>','#include <begin_vertex>\nvA=aA;vOP=position;'];
// Material completo: tecido úmido, manchas, gordura com relevo
function fullMat(p){
 const t=TEX[p.c];
 const m=new THREE.MeshPhysicalMaterial({color:baseColor(p),roughness:t===2?.55:.5,metalness:0,side:p.ds?THREE.DoubleSide:THREE.FrontSide,
   clearcoat:t===2?.25:.45,clearcoatRoughness:.3,envMap:envTex,envMapIntensity:.4});
 m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,U);sh.uniforms.uKind={value:t};
  sh.vertexShader=sh.vertexShader.replace(...VERT_IN).replace(...VERT_SET);
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vA;varying vec3 vOP;uniform float uReal,uFat;uniform vec3 uFatCol;uniform int uKind;float gFat=0.,gN1=.5,gN2=.5;'+GLSL_NOISE)
   .replace('#include <color_fragment>',`#include <color_fragment>
    if(uKind<3){ gN1=fbm(vOP*.4); }
    if(uKind==0){
      gN2=fbm(vOP*.33+7.);
      diffuseColor.rgb*=mix(1.,.84+.3*gN1,uReal);
      gFat=smoothstep(.4,.85,vA.y*1.15+(gN2-.5)*.7)*uReal*uFat;
      diffuseColor.rgb=mix(diffuseColor.rgb,uFatCol*(.82+.25*gN2),gFat);
    } else if(uKind<3){ diffuseColor.rgb*=mix(1.,.92+.14*gN1,uReal); }
    diffuseColor.rgb*=vA.x;`)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.32,gFat);')
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    if(uKind<3){
      float H=(uKind==0?.16:.05)*gN1*uReal + gFat*.4*gN2;
      vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);float dHx=dFdx(H),dHy=dFdy(H);
      vec3 R1=cross(sy,normal),R2=cross(normal,sx);float det=dot(sx,R1)*faceDirection;
      normal=normalize(abs(det)*normal-sign(det)*(dHx*R1+dHy*R2));}`);
 };
 m.customProgramCacheKey=()=>'full';
 return m;}
// Material leve: cor + sombras pré-calculadas (+ gordura lisa no modo realista)
function liteMat(p){
 const m=new THREE.MeshStandardMaterial({color:baseColor(p),roughness:.55,metalness:0,side:p.ds?THREE.DoubleSide:THREE.FrontSide});
 const wall=TEX[p.c]===0;
 m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,U);sh.uniforms.uWall={value:wall?1:0};
  sh.vertexShader=sh.vertexShader.replace(...VERT_IN).replace(...VERT_SET);
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vA;varying vec3 vOP;uniform float uReal,uFat,uWall;uniform vec3 uFatCol;')
   .replace('#include <color_fragment>',`#include <color_fragment>
    diffuseColor.rgb=mix(diffuseColor.rgb,uFatCol,smoothstep(.45,.8,vA.y)*uReal*uFat*uWall);
    diffuseColor.rgb*=vA.x;`);
 };
 m.customProgramCacheKey=()=>'lite';
 return m;}
function wantFull(){return quality==='alta'&&mode==='real'}
function applyMat(){
 const full=wantFull();
 meshes.forEach(m=>{const p=m.userData;
  const want=full?'full':'lite';
  if(m.userData._k!==want){ if(!m.userData['_'+want])m.userData['_'+want]=full?fullMat(p):liteMat(p); m.material=m.userData['_'+want]; m.userData._k=want; }
  const mt=m.material;mt.color.setHex(baseColor(p));
  const wall=['vent','atrium'].includes(p.c);const o=wall?1-opacity:1;mt.opacity=o;mt.transparent=o<1;mt.depthWrite=o>=1;
  mt.emissive.setHex(m===sel?0x553300:0x000000);});
 U.uReal.value=mode==='real'?1:0;U.uFat.value=fatOn?1:0;
 document.getElementById('fatWrap').style.display=mode==='real'?'flex':'none';
 dirty=true;}

/* ---------- 4. Carregamento das malhas num Web Worker ---------- */
// O worker decodifica base64, desquantiza as posições e calcula as normais fora da thread da interface.
const WORKER_SRC=`
function dec(b){const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u.buffer}
onmessage=e=>{const L=e.data;
 L.forEach((p,k)=>{
  const q=new Uint16Array(dec(p.v)),P=new Float32Array(q.length);
  for(let i=0;i<q.length;i+=3){P[i]=p.o[0]+q[i]/65535*p.s[0];P[i+1]=p.o[1]+q[i+1]/65535*p.s[1];P[i+2]=p.o[2]+q[i+2]/65535*p.s[2];}
  const I=p.i32?new Uint32Array(dec(p.f)):new Uint16Array(dec(p.f));
  const N=new Float32Array(P.length);
  for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3;
   const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];
   const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
   N[a]+=nx;N[a+1]+=ny;N[a+2]+=nz;N[b]+=nx;N[b+1]+=ny;N[b+2]+=nz;N[c]+=nx;N[c+1]+=ny;N[c+2]+=nz;}
  for(let i=0;i<N.length;i+=3){const l=Math.hypot(N[i],N[i+1],N[i+2])||1;N[i]/=l;N[i+1]/=l;N[i+2]/=l;}
  const A=new Uint8Array(dec(p.a));
  postMessage({k,P,I,N,A},[P.buffer,I.buffer,N.buffer,A.buffer]);
 });
 postMessage({done:true});};`;
function addMesh(p,P,I,N,A){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('normal',new THREE.BufferAttribute(N,3));
 g.setAttribute('aA',new THREE.BufferAttribute(A,2,true));g.setIndex(new THREE.BufferAttribute(I,1));
 g.computeBoundingSphere();
 const m=new THREE.Mesh(g);m.userData=p;p.grp=GROUPS.find(G=>G.test(p)).k;
 m.visible=vis[p.grp]!==false;G.add(m);meshes.push(m);}
function finishLoad(){
 G.position.set(-23,123,-1238);
 loadingEl.hidden=true;applyMat();view('ant',true);applyPixelRatio();
 try{delete window.HEART}catch(e){window.HEART=null}}
function loadMeshes(){
 const parts=window.HEART||[];
 const meta=parts.map(p=>({n:p.n,en:p.en,c:p.c,m:p.m,note:p.note,ds:p.ds}));
 let got=0;
 const fallback=()=>{ // sem Worker: faz na thread principal, em lotes, para não congelar a página
  let k=0;const step=()=>{const t0=performance.now();
   while(k<parts.length&&performance.now()-t0<30){const p=parts[k];
    const d=s=>{const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer};
    const q=new Uint16Array(d(p.v)),P=new Float32Array(q.length);for(let i=0;i<q.length;i++){const j=i%3;P[i]=p.o[j]+q[i]/65535*p.s[j]}
    const I=p.i32?new Uint32Array(d(p.f)):new Uint16Array(d(p.f));
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setIndex(new THREE.BufferAttribute(I,1));g.computeVertexNormals();
    addMesh(meta[k],P,I,g.getAttribute('normal').array,new Uint8Array(d(p.a)));k++;
    loadingEl.textContent='Montando peças… '+Math.round(k/parts.length*100)+'%';}
   if(k<parts.length)setTimeout(step,0);else finishLoad();};step();};
 try{
  const w=new Worker(URL.createObjectURL(new Blob([WORKER_SRC],{type:'text/javascript'})));
  w.onmessage=e=>{const d=e.data;
   if(d.done){w.terminate();finishLoad();return}
   addMesh(meta[d.k],d.P,d.I,d.N,d.A);got++;loadingEl.textContent='Montando peças… '+Math.round(got/parts.length*100)+'%';};
  w.onerror=ev=>{ev.preventDefault();w.terminate();if(!got)fallback();};
  w.postMessage(parts.map(p=>({v:p.v,f:p.f,a:p.a,o:p.o,s:p.s,i32:p.i32})));
 }catch(e){fallback();}
}

/* ---------- 5. Interface ---------- */
// vistas
let fitD=330;const tgt=new THREE.Vector3();let anim=null;
const DIRS={ant:[0,-1,.12],post:[0,1,.12],esq:[1,-.15,.12],dir:[-1,-.15,.12],sup:[.05,-.35,1]};
function view(v,instant){const to=new THREE.Vector3(...DIRS[v]).normalize().multiplyScalar(fitD);
 if(instant){C.position.copy(to);ctl.target.set(0,0,0);ctl.update();updZ();dirty=true;return}
 const from=C.position.clone(),t0=performance.now();anim=t=>{let k=Math.min(1,(t-t0)/900);k=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
  C.position.copy(from).lerp(to,k);ctl.target.lerp(tgt,k);if(k>=1)anim=null;updZ();};}
document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>view(b.dataset.v));
// zoom
const zR=document.getElementById('zR'),zL=document.getElementById('zL');
const dmin=90,dmax=700;const d2v=d=>100*(1-Math.log(d/dmin)/Math.log(dmax/dmin)),v2d=v=>dmin*Math.pow(dmax/dmin,1-v/100);
function setDist(d){const dir=C.position.clone().sub(ctl.target).normalize();C.position.copy(ctl.target).addScaledVector(dir,d);updZ();dirty=true}
function updZ(){const d=C.position.distanceTo(ctl.target);zR.value=d2v(d);zL.textContent=Math.round(fitD/d*100)+'%'}
zR.oninput=()=>setDist(v2d(+zR.value));
document.getElementById('zIn').onclick=()=>setDist(Math.max(dmin,C.position.distanceTo(ctl.target)/1.25));
document.getElementById('zOut').onclick=()=>setDist(Math.min(dmax,C.position.distanceTo(ctl.target)*1.25));
document.getElementById('zFit').onclick=()=>{ctl.target.set(0,0,0);setDist(fitD)};
ctl.addEventListener('change',updZ);
// camadas
const lay=document.getElementById('layers');const vis={};
GROUPS.forEach(g=>{vis[g.k]=true;const l=document.createElement('label');l.innerHTML=`<input type="checkbox" id="L_${g.k}" checked><i class="sw" style="background:${g.col}"></i>${g.t}`;lay.append(l);
 l.querySelector('input').onchange=e=>{vis[g.k]=e.target.checked;meshes.forEach(m=>m.visible=vis[m.userData.grp]);dirty=true;};});
// cores
const cR=document.getElementById('cReal'),cA=document.getElementById('cAnat'),cO=document.getElementById('cOrig');
function setMode(m){mode=m;cR.setAttribute('aria-pressed',m==='real');cA.setAttribute('aria-pressed',m==='anat');cO.setAttribute('aria-pressed',m==='orig');document.getElementById('origLegend').hidden=m!=='orig';applyMat()}
cR.onclick=()=>setMode('real');cA.onclick=()=>setMode('anat');cO.onclick=()=>setMode('orig');
document.getElementById('fatT').onchange=e=>{fatOn=e.target.checked;applyMat()};
// qualidade
const qA=document.getElementById('qAlta'),qL=document.getElementById('qLeve');
function setQuality(q){quality=q;qA.setAttribute('aria-pressed',q==='alta');qL.setAttribute('aria-pressed',q==='leve');applyMat();applyPixelRatio()}
qA.onclick=()=>setQuality('alta');qL.onclick=()=>setQuality('leve');
qA.setAttribute('aria-pressed',quality==='alta');qL.setAttribute('aria-pressed',quality==='leve');
// transparência
const op=document.getElementById('op');op.oninput=()=>{opacity=op.value/100;document.getElementById('opL').textContent=op.value+'%';applyMat()};

/* ---------- 6. Seleção pelo mouse ---------- */
const ray=new THREE.Raycaster(),mv=new THREE.Vector2();
function pickAt(x,y){const r=R.domElement.getBoundingClientRect();mv.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1);ray.setFromCamera(mv,C);
 const hits=ray.intersectObjects(meshes.filter(m=>m.visible&&m.material.opacity>.35),false);return hits[0]&&hits[0].object}
let down=null,hoverReq=null,dragging=false;
R.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];dragging=true;tip.hidden=true});
addEventListener('pointerup',()=>{dragging=false});
R.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;select(pickAt(e.clientX,e.clientY))});
// o tooltip não pede um novo desenho do coração; o raycast roda no máximo uma vez por quadro
R.domElement.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse'||dragging){return}hoverReq=[e.clientX,e.clientY]});
R.domElement.addEventListener('pointerleave',()=>{hoverReq=null;tip.hidden=true});
function doHover(){if(!hoverReq)return;const [x,y]=hoverReq;hoverReq=null;const m=pickAt(x,y);
 if(!m){tip.hidden=true;R.domElement.style.cursor='';return}
 const r=stage.getBoundingClientRect();tip.hidden=false;tip.textContent=m.userData.n+(m.userData.m?' · modelado':'');
 tip.style.left=(x-r.left)+'px';tip.style.top=(y-r.top)+'px';R.domElement.style.cursor='pointer';}
function select(m){sel=m||null;applyMat();const p=m&&m.userData;
 document.getElementById('sName').textContent=p?p.n:'Nenhuma ainda';
 document.getElementById('sChips').innerHTML=p?`<span class="chip ${p.m?'model':'real'}">${p.m?'Modelado · aproximado':'Real · BodyParts3D'}</span><span class="chip">${CATNAME[p.c]}</span>`:'';
 document.getElementById('sNote').innerHTML=p?(p.m?p.note||'Peça gerada para completar o modelo.':'Malha original do BodyParts3D, reconstruída a partir de cortes de um adulto.'):'Clique em qualquer parte do coração. As peças <b>modeladas</b> aparecem com um selo verde.';
 const en=document.getElementById('sEn');en.hidden=!(p&&p.en);if(p&&p.en)en.textContent='Nome original: '+p.en;}

/* ---------- 7. Renderização sob demanda ---------- */
function resize(){const w=stage.clientWidth,h=stage.clientHeight;R.setSize(w,h);C.aspect=w/h;C.updateProjectionMatrix();fitD=w/h<.9?430:330;dirty=true}
addEventListener('resize',resize);
window.__frames=0;
const keyOff=new THREE.Vector3(60,0,140);
R.setAnimationLoop(t=>{
 doHover();
 const a=!!anim;if(anim)anim(t);
 const moved=ctl.update();
 if(!(a||moved||dirty))return;
 dirty=false;
 key.position.copy(C.position).add(keyOff);rim.position.copy(C.position).multiplyScalar(-1).setZ(120);
 R.render(S,C);window.__frames++;});
window.__heart={R,S,C,setQuality,setMode}; // usado só para testes de desempenho
applyPixelRatio();
setTimeout(loadMeshes,20);
})();
