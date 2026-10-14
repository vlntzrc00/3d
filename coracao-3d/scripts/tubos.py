"""Geração de tubos (vasos) ao longo de uma curva suave, com raio variável."""
import numpy as np
from scipy.interpolate import CubicSpline
def spline(pts,n):
  pts=np.array(pts,float);d=np.r_[0,np.cumsum(np.linalg.norm(np.diff(pts,axis=0),axis=1))]
  cs=CubicSpline(d,pts,bc_type='natural');t=np.linspace(0,d[-1],n);return cs(t)
def tube(pts,r0,r1=None,seg=None,n=None,cap0=False,cap1=True):
  r1=r0 if r1 is None else r1
  if seg is None: seg=48 if (r0 if not callable(r0) else r0(0))>5 else 24  # vasos grandes mais redondos
  L=np.sum(np.linalg.norm(np.diff(np.array(pts,float),axis=0),axis=1));n=n or max(12,int(L/1.2))
  C=spline(pts,n);T=np.gradient(C,axis=0);T/=np.linalg.norm(T,axis=1)[:,None]
  a=np.array([0,0,1.]) if abs(T[0,2])<.9 else np.array([1.,0,0])
  N=np.cross(T[0],a);N/=np.linalg.norm(N);Ns=[N]
  for i in range(1,n):
    N=N-T[i]*(N@T[i]);N/=np.linalg.norm(N);Ns.append(N)
  Ns=np.array(Ns);B=np.cross(T,Ns)
  th=np.linspace(0,2*np.pi,seg,endpoint=False);V=[];F=[]
  for i in range(n):
    r=r0+(r1-r0)*i/(n-1) if not callable(r0) else r0(i/(n-1))
    for t in th: V.append(C[i]+r*(np.cos(t)*Ns[i]+np.sin(t)*B[i]))
  for i in range(n-1):
    for j in range(seg):
      a_,b_=i*seg+j,i*seg+(j+1)%seg;c_,d_=a_+seg,b_+seg;F+=[(a_,c_,b_),(b_,c_,d_)]
  for cap,i,flip in ((cap0,0,True),(cap1,n-1,False)):
    if cap:
      ci=len(V);V.append(C[i])
      for j in range(seg):
        a_,b_=i*seg+j,i*seg+(j+1)%seg;F.append((ci,b_,a_) if flip else (ci,a_,b_))
  F=np.array(F)[:,::-1]  # triângulos virados para fora (permite descartar as faces de trás na renderização)
  return np.array(V),F
def merge(*ms):
  V=[];F=[];o=0
  for v,f in ms: V.append(v);F.append(f+o);o+=len(v)
  return np.vstack(V),np.vstack(F)

