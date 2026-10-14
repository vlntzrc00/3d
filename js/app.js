(function(){
const COL={vent:0xa3293f,atrium:0xd2627a,musc:0x7d1d33,art:0xff3045,aorta:0xe02a3c,vein:0x3561e0,pulm:0x2f6bd8,pv:0xc93a5e,valve:0xf3e7c6,cond:0xffd23f};
const GROUPS=[
 {k:'wall',t:'Paredes e músculos',col:'#a3293f',test:p=>['vent','atrium','musc'].includes(p.c)},
 {k:'great',t:'Grandes vasos',col:'#e02a3c',test:p=>['aorta','pulm','pv'].includes(p.c)||(p.c==='vein'&&p.m)},
 {k:'cor',t:'Coronárias e veias cardíacas',col:'#3561e0',test:p=>p.c==='art'||(p.c==='vein'&&!p.m)},
 {k:'valve',t:'Valvas',col:'#e9d9ad',test:p=>p.c==='valve'},
 {k:'cond',t:'Sistema de condução',col:'#ffd23f',test:p=>p.c==='cond'}];
const CATNAME={vent:'Ventrículos',atrium:'Átrios',musc:'Músculos internos',art:'Artéria coronária',aorta:'Aorta e ramos',vein:'Veia',pulm:'Circulação pulmonar (artéria)',pv:'Veia pulmonar',valve:'Valva',cond:'Sistema de condução'};
const stage=document.getElementById('stage'),tip=document.getElementById('tip');
const R=new THREE.WebGLRenderer({antialias:true});R.setPixelRatio(Math.min(devicePixelRatio,2));stage.prepend(R.domElement);
const S=new THREE.Scene();const stc=()=>R.setClearColor(new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--stage').trim()||'#17191f'));stc();matchMedia('(prefers-color-scheme: dark)').addEventListener('change',stc);
const hemi=new THREE.HemisphereLight(0xfff4f0,0x2a1a1c,.55);S.add(hemi);
const key=new THREE.DirectionalLight(0xfff1e6,.95),rim=new THREE.DirectionalLight(0xc8d8ff,.45);S.add(key,rim);
try{const pm=new THREE.PMREMGenerator(R);S.environment=pm.fromScene(new THREE.RoomEnvironment(),.04).texture;}catch(e){}
const C=new THREE.PerspectiveCamera(32,1,1,4000);C.up.set(0,0,1);
const ctl=new THREE.OrbitControls(C,R.domElement);ctl.enableDamping=true;ctl.dampingFactor=.08;ctl.minDistance=90;ctl.maxDistance=700;
const G=new THREE.Group();S.add(G);
const meshes=[];
function dec(b,T){const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return new T(u.buffer)}
function pos(p){const q=dec(p.v,Uint16Array),o=new Float32Array(q.length);for(let i=0;i<q.length;i++){const k=i%3;o[i]=p.o[k]+q[i]/65535*p.s[k]}return o}
let mode='real',opacity=0,sel=null,fatOn=true,dirty=true;
// cores de peça anatômica fresca: miocárdio vermelho-acastanhado, átrios mais escuros, grandes artérias claras (adventícia), veias arroxeadas
const REAL={vent:0x7e2a26,atrium:0x5e1f2a,musc:0x772726,art:0xa8363a,aorta:0xcf9c8e,pulm:0xc0939a,pv:0x8f4a58,vein:0x4a3866,valve:0xe9dcc4,cond:0xe2b935};
function baseColor(p){if(mode==='real')return (p.c==='vein'&&p.m)?0x5b4c7c:REAL[p.c];return mode==='anat'?COL[p.c]:(p.m?0x22b46e:0xc9b3b6)}
const U={uReal:{value:1},uFat:{value:1},uFatCol:{value:new THREE.Color(0xd9bf86)},uAO:{value:1}};
const TEX={vent:0,atrium:0,musc:0,art:1,aorta:1,pulm:1,pv:1,vein:1,valve:2,cond:3};
const GLSL_NOISE=`
float h31(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float vn3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn3(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
`;
function makeMat(p){
 const t=TEX[p.c];
 const m=new THREE.MeshPhysicalMaterial({color:baseColor(p),roughness:t===2?.55:.5,metalness:0,side:THREE.DoubleSide,
   clearcoat:t===2?.3:.55,clearcoatRoughness:.3,sheen:t===2?.5:.1,sheenRoughness:.6,sheenColor:new THREE.Color(t===2?0xffffff:0xffc8c0),envMapIntensity:.45});
 m.onBeforeCompile=sh=>{Object.assign(sh.uniforms,U);sh.uniforms.uKind={value:t};
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 aA;varying vec2 vA;varying vec3 vOP;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nvA=aA;vOP=position;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vA;varying vec3 vOP;uniform float uReal,uFat,uAO;uniform vec3 uFatCol;uniform int uKind;float gFat=0.;'+GLSL_NOISE)
   .replace('#include <color_fragment>',`#include <color_fragment>
    float n1=fbm(vOP*.32),n2=vn3(vOP*1.7);
    if(uKind==0){ // miocárdio: manchas e leve estriação
      float st=vn3(vec3(vOP.x*.9,vOP.y*.9,vOP.z*.18));
      diffuseColor.rgb*=mix(1.,.80+.32*n1+.08*st,uReal);
      float fz=vA.y*1.15+(fbm(vOP*.35+7.)-.5)*.7;
      gFat=smoothstep(.38,.85,fz)*uReal*uFat;
      diffuseColor.rgb=mix(diffuseColor.rgb,uFatCol*(.8+.25*fbm(vOP*.6+2.)),gFat);
    } else if(uKind==1){ diffuseColor.rgb*=mix(1.,.9+.18*n1,uReal);}
    else if(uKind==2){ diffuseColor.rgb*=mix(1.,.92+.12*n1,uReal);}
    diffuseColor.rgb*=mix(1.,vA.x,uAO);`)
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.32,gFat);')
   .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    { float H=0.;
      if(uKind==0) H=.22*fbm(vOP*.45)*uReal + gFat*.55*fbm(vOP*.4+3.);
      else if(uKind==1) H=.08*fbm(vOP*.6)*uReal;
      else if(uKind==2) H=.05*fbm(vOP*.9)*uReal;
      vec3 sx=dFdx(-vViewPosition),sy=dFdy(-vViewPosition);float dHx=dFdx(H),dHy=dFdy(H);
      vec3 R1=cross(sy,normal),R2=cross(normal,sx);float det=dot(sx,R1)*faceDirection;
      vec3 grad=sign(det)*(dHx*R1+dHy*R2);normal=normalize(abs(det)*normal-grad);}`);
 };
 return m;}
function applyMat(){meshes.forEach(m=>{const p=m.userData,mt=m.material;mt.color.setHex(baseColor(p));
  const wall=['vent','atrium'].includes(p.c);const o=wall?1-opacity:1;mt.opacity=o;mt.transparent=o<1;mt.depthWrite=o>=1;
  mt.emissive.setHex(m===sel?0x553300:0x000000);});
 dirty=true;U.uReal.value=mode==='real'?1:0;U.uFat.value=fatOn?1:0;document.getElementById('fatWrap').style.display=mode==='real'?'flex':'none';}
setTimeout(()=>{
 window.HEART.forEach(p=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos(p),3));g.setIndex(new THREE.BufferAttribute(dec(p.f,p.i32?Uint32Array:Uint16Array),1));g.computeVertexNormals();g.setAttribute('aA',new THREE.BufferAttribute(dec(p.a,Uint8Array),2,true));
  const m=new THREE.Mesh(g,makeMat(p));
  m.userData=p;p.grp=GROUPS.find(G=>G.test(p)).k;G.add(m);meshes.push(m);});
 G.position.set(-23,123,-1238);
 document.getElementById('loading').hidden=true;applyMat();view('ant',true);resize();
},30);
// camera views
let fitD=330;const tgt=new THREE.Vector3();let anim=null;
const DIRS={ant:[0,-1,.12],post:[0,1,.12],esq:[1,-.15,.12],dir:[-1,-.15,.12],sup:[.05,-.35,1]};
function view(v,instant){const d=new THREE.Vector3(...DIRS[v]).normalize();const dist=C.position.length()||fitD;const to=d.multiplyScalar(v?fitD:dist);
 if(instant){C.position.copy(to);ctl.target.set(0,0,0);ctl.update();updZ();return}
 const from=C.position.clone(),t0=performance.now();anim=t=>{let k=Math.min(1,(t-t0)/900);k=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;
  C.position.copy(from).lerp(to,k);ctl.target.lerp(tgt,k);if(k>=1)anim=null;updZ();};}
document.querySelectorAll('[data-v]').forEach(b=>b.onclick=()=>view(b.dataset.v));
// zoom
const zR=document.getElementById('zR'),zL=document.getElementById('zL');
const dmin=90,dmax=700;function d2v(d){return 100*(1-Math.log(d/dmin)/Math.log(dmax/dmin))}function v2d(v){return dmin*Math.pow(dmax/dmin,1-v/100)}
function setDist(d){dirty=true;const dir=C.position.clone().sub(ctl.target).normalize();C.position.copy(ctl.target).addScaledVector(dir,d);updZ()}
function updZ(){const d=C.position.distanceTo(ctl.target);zR.value=d2v(d);zL.textContent=Math.round(fitD/d*100)+'%'}
zR.oninput=()=>setDist(v2d(+zR.value));
document.getElementById('zIn').onclick=()=>setDist(Math.max(dmin,C.position.distanceTo(ctl.target)/1.25));
document.getElementById('zOut').onclick=()=>setDist(Math.min(dmax,C.position.distanceTo(ctl.target)*1.25));
document.getElementById('zFit').onclick=()=>{ctl.target.set(0,0,0);setDist(fitD)};
ctl.addEventListener('change',updZ);
// layers
const lay=document.getElementById('layers');const vis={};
GROUPS.forEach(g=>{vis[g.k]=true;const l=document.createElement('label');l.innerHTML=`<input type="checkbox" id="L_${g.k}" checked><i class="sw" style="background:${g.col}"></i>${g.t}`;lay.append(l);
 l.querySelector('input').onchange=e=>{vis[g.k]=e.target.checked;meshes.forEach(m=>m.visible=vis[m.userData.grp]);dirty=true;};});
// colors
const cR=document.getElementById('cReal'),cA=document.getElementById('cAnat'),cO=document.getElementById('cOrig');
function setMode(m){mode=m;cR.setAttribute('aria-pressed',m==='real');cA.setAttribute('aria-pressed',m==='anat');cO.setAttribute('aria-pressed',m==='orig');document.getElementById('origLegend').hidden=m!=='orig';applyMat()}
cR.onclick=()=>setMode('real');cA.onclick=()=>setMode('anat');cO.onclick=()=>setMode('orig');
document.getElementById('fatT').onchange=e=>{fatOn=e.target.checked;applyMat()};
const op=document.getElementById('op');op.oninput=()=>{opacity=op.value/100;document.getElementById('opL').textContent=op.value+'%';applyMat()};
// picking
const ray=new THREE.Raycaster(),mv=new THREE.Vector2();
function pick(e){const r=R.domElement.getBoundingClientRect();mv.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(mv,C);
 const hits=ray.intersectObjects(meshes.filter(m=>m.visible&&(m.material.opacity>.35)),false);return hits[0]&&hits[0].object}
let down=null;
R.domElement.addEventListener('pointerdown',e=>down=[e.clientX,e.clientY]);
R.domElement.addEventListener('pointerup',e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;select(pick(e))});
R.domElement.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType!=='mouse'){tip.hidden=true;return}const m=pick(e);
 if(!m){tip.hidden=true;R.domElement.style.cursor='';return}const r=stage.getBoundingClientRect();tip.hidden=false;tip.textContent=m.userData.n+(m.userData.m?' · modelado':'');tip.style.left=(e.clientX-r.left)+'px';tip.style.top=(e.clientY-r.top)+'px';R.domElement.style.cursor='pointer'});
R.domElement.addEventListener('pointerleave',()=>tip.hidden=true);
function select(m){sel=m||null;applyMat();const p=m&&m.userData;
 document.getElementById('sName').textContent=p?p.n:'Nenhuma ainda';
 document.getElementById('sChips').innerHTML=p?`<span class="chip ${p.m?'model':'real'}">${p.m?'Modelado · aproximado':'Real · BodyParts3D'}</span><span class="chip">${CATNAME[p.c]}</span>`:'';
 document.getElementById('sNote').innerHTML=p?(p.m?p.note||'Peça gerada para completar o modelo.':'Malha original do BodyParts3D, reconstruída a partir de cortes de um adulto.'):'Clique em qualquer parte do coração. As peças <b>modeladas</b> aparecem com um selo verde.';
 const en=document.getElementById('sEn');en.hidden=!(p&&p.en);if(p&&p.en)en.textContent='Nome original: '+p.en;}
// render
function resize(){dirty=true;const w=stage.clientWidth,h=stage.clientHeight;R.setSize(w,h);C.aspect=w/h;C.updateProjectionMatrix();fitD=w/h<.9?430:330}
addEventListener('resize',resize);resize();
window.__frames=0;
R.setAnimationLoop(t=>{const a=!!anim;if(anim)anim(t);const ch=ctl.update();if(!(a||ch||dirty))return;dirty=false;
 key.position.copy(C.position).add(new THREE.Vector3(60,0,140));rim.position.copy(C.position).multiplyScalar(-1).setZ(120);R.render(S,C);window.__frames++});
['pointerdown','wheel','pointermove'].forEach(e=>R.domElement.addEventListener(e,()=>dirty=true,{passive:true}));
})();
