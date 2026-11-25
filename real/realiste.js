/* =====================================================================
   Castaway Miner — rendu réaliste (héros articulé, Kepra-7, LUMI, effets)
   Chargé après le jeu : remplace certaines fonctions de dessin si les
   images sont prêtes, sinon le jeu garde ses dessins d'origine.
   ===================================================================== */
(function(){
'use strict';
const SRC=document.currentScript&&document.currentScript.src;
const BASE=SRC?SRC.replace(/[^\/?#]+([?#].*)?$/,''):'real/';

/* ---------- 1. images ---------- */
const NAMES=['ground2','pick','cactus','v_lumi-blank','n-mfront','n-mback','n2-ffront','n2-fback'];
for(const p of ['hero-y','hero-z'])for(const q of ['torso','legN','legF','nU','nF','fU','fF'])NAMES.push(p+'-'+q);
const FAM={roche:['v_rock0','v_rock1','v_rock2','v_rock3'],fer:['v_iron0','v_iron1','v_iron2','v_iron3'],cuivre:['v_copper0','v_copper1','v_copper2'],rubis:['v_ruby0','v_ruby1','v_ruby2']};
for(const k of ['glace','argent','saphir','cryonite','ambre','amethyste','sporedor','luminite','obsidienne','soufre','magmatite','plasmite','ardoise','iridium','ether','neant','sable','perle','nacre','abyssite','tourbe','jade','seve','chlorite'])FAM[k]=['o_'+k];
for(const k in FAM)NAMES.push(...FAM[k]);
const IM={};let left=NAMES.length,READY=false,FAILED=false;
for(const n of NAMES){const i=new Image();i.decoding='async';i.onload=()=>{if(--left===0&&!FAILED){READY=true;try{if(typeof mode!=='undefined'&&mode==='hub'&&typeof renderHub==='function')renderHub();}catch(e){}}};i.onerror=()=>{FAILED=true;};i.src=BASE+n+'.webp';IM[n]=i;}
window.REAL={get ready(){return READY;},IM};

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,x)=>a+(b-a)*x;
const EIO=x=>x<.5?2*x*x:1-Math.pow(-2*x+2,2)/2,EIN3=x=>x*x*x,EOUT=x=>1-(1-x)*(1-x);
const kepra=()=>{try{return S&&Math.min(S.planet,PLANETS.length-1)===0;}catch(e){return false;}};

/* ---------- 2. géométrie des personnages (coordonnées des images d'origine) ---------- */
const HEROS={
 m:{p:'hero-y',H:615,W:252,fsh:[203,150],fel:[222,228],fhd:[236,312],nsh:[62,150],nel:[46,255],nhd:[52,345],nHip:[95,312],fHip:[152,308],cx:122,front:'n-mfront'},
 f:{p:'hero-z',H:620,W:248,fsh:[198,142],fel:[210,238],fhd:[224,322],nsh:[58,140],nel:[36,235],nhd:[36,322],nHip:[98,302],fHip:[160,300],cx:125,front:'n2-ffront'}};
const PICK={grip:[165,385],grip2:[350,385],head:[950,385],W:1062,H:768};
const HH=250,OW=600,OH=560,OX=300,OY=500;   // repère interne : héros de 250 unités

/* ---------- 3. skins : recoloration de la combinaison ---------- */
const SKC={};
function hexRGB(h){h=String(h||'#fff').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255];}
function skinImg(name,skinId){
  const im=IM[name];if(!skinId||skinId==='nasa'||!im||!im.width)return im;
  const key=name+'|'+skinId;if(SKC[key]!==undefined)return SKC[key]||im;
  let sk=null;try{sk=SKINS.find(z=>z.id===skinId);}catch(e){}
  if(!sk){SKC[key]=null;return im;}
  try{
    const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const g=c.getContext('2d');g.drawImage(im,0,0);
    const d=g.getImageData(0,0,c.width,c.height),a=d.data,S1=hexRGB(sk.suit),A1=hexRGB(sk.acc);
    for(let i=0;i<a.length;i+=4){if(a[i+3]<8)continue;const r=a[i],gg=a[i+1],b=a[i+2],mx=Math.max(r,gg,b),mn=Math.min(r,gg,b),v=mx/255,s=mx?(mx-mn)/mx:0;
      let h=0;if(mx!==mn){if(mx===r)h=((gg-b)/(mx-mn))%6;else if(mx===gg)h=(b-r)/(mx-mn)+2;else h=(r-gg)/(mx-mn)+4;h*=60;if(h<0)h+=360;}
      let T=null,w=0;
      if(s<.24&&v>.42){T=S1;w=clamp((.24-s)/.12,0,1)*clamp((v-.42)/.15,0,1);}          // tissu blanc
      else if(h>4&&h<42&&s>.38&&v>.25){T=A1;w=clamp((s-.38)/.15,0,1);}                  // plaques orange
      if(!T)continue;const L=(r*.3+gg*.59+b*.11)/255,f=Math.min(1.6,L/.78);
      a[i]=lerp(r,clamp(T[0]*f,0,255),w);a[i+1]=lerp(gg,clamp(T[1]*f,0,255),w);a[i+2]=lerp(b,clamp(T[2]*f,0,255),w);}
    g.putImageData(d,0,0);SKC[key]=c;return c;
  }catch(e){SKC[key]=null;return im;}
}

/* ---------- 4. animation : ressorts + images clés ---------- */
function spring(st,k,target,dt,stiff,damp){const J=st.J,V=st.V;if(J[k]===undefined){J[k]=target;V[k]=0;}if(damp===undefined)damp=2*Math.sqrt(stiff);
  const n=Math.max(1,Math.ceil(dt/.008)),h=dt/n;for(let i=0;i<n;i++){V[k]+=(stiff*(target-J[k])-damp*V[k])*h;J[k]+=V[k]*h;}return J[k];}
// coup de pioche du jeu : l'impact tombe à la moitié du geste (comme doStrike)
//      p     poingX poingY manche accroupi buste  jambeAv jambeAr
const KF=[
 [0.00,   28, -128,   0.50,   2,   0.05,  -0.16, 0.22, EIO],
 [0.34,  -24, -246,  -3.80,  -7,  -0.19,  -0.22, 0.28, EOUT],
 [0.40,  -28, -250,  -3.95,  -8,  -0.21,  -0.22, 0.28, EIN3],
 [0.50,   54, -110,   0.70,  24,   0.32,  -0.36, 0.44, EOUT],
 [0.62,   50, -114,   0.88,  20,   0.26,  -0.34, 0.42, EIO],
 [1.00,   28, -128,   0.50,   2,   0.05,  -0.16, 0.22, null]];
function swingPose(p){let i=0;while(i<KF.length-2&&p>=KF[i+1][0])i++;const A=KF[i],B=KF[i+1];const x=A[8]((p-A[0])/(B[0]-A[0]));
  const arc=Math.sin(x*Math.PI)*((i===0)?-10:(i===2)?-26:0);
  return{gx:lerp(A[1],B[1],x)+arc*.4,gy:lerp(A[2],B[2],x)+arc,hd:lerp(A[3],B[3],x),drop:lerp(A[4],B[4],x),lean:lerp(A[5],B[5],x),legN:lerp(A[6],B[6],x),legF:lerp(A[7],B[7],x)};}
function ik2(S0,T0,l1,l2){const dx=T0[0]-S0[0],dy=T0[1]-S0[1];const d=clamp(Math.hypot(dx,dy),Math.abs(l1-l2)+.5,l1+l2-.3);const base=Math.atan2(dy,dx);
  const off=Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1));
  const s=[base+off,base-off].map(a1=>{const E=[S0[0]+Math.cos(a1)*l1,S0[1]+Math.sin(a1)*l1];return{a1,E,a2:Math.atan2(T0[1]-E[1],T0[0]-E[0])};});
  return s[0].E[1]>s[1].E[1]?s[0]:s[1];}   // coude vers le bas
const STATES=new Map();
function stateFor(a,key){let st=STATES.get(key);if(!st){st={J:{},V:{},walkPh:0,last:null,lt:null,OC:null,g:null,R:0};STATES.set(key,st);if(STATES.size>40)STATES.delete(STATES.keys().next().value);}return st;}

/* ---------- 5. le héros ---------- */
function drawHeroR(a,t,skinId,scale){
  const P=HEROS[(typeof FEM==='function'&&FEM())?'f':'m'];
  const k=scale||TW/60,targetH=(scale?52:62)*k,u=targetH/HH;
  const s0=a.sx!==undefined?[a.sx,a.sy]:iso(a.x,a.y);
  const isPl=(typeof player!=='undefined'&&a===player);
  const st=stateFor(a,isPl?'player':'k'+Math.round(k*10)+'|'+(a.sx!==undefined?'s':'w'));
  const dt=st.lt===null?0:clamp(t-st.lt,0,.05);st.lt=t;
  // offscreen à la bonne résolution
  const dpr=(typeof DPR!=='undefined'?DPR:1),R=clamp(u*dpr,.15,2.2);
  if(!st.OC||Math.abs(st.R-R)>.02){st.OC=st.OC||document.createElement('canvas');st.OC.width=Math.ceil(OW*R);st.OC.height=Math.ceil(OH*R);st.g=st.OC.getContext('2d');st.R=R;}
  const g=st.g,J=st.J;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,st.OC.width,st.OC.height);g.setTransform(R,0,0,R,R*OX,R*OY);
  // marche
  const moving=!!a.moving;
  if(a.x!==undefined){if(st.last)st.walkPh+=Math.hypot(a.x-st.last[0],a.y-st.last[1])*3.6;st.last=[a.x,a.y];}
  if(moving&&(a.x===undefined||dt>0&&st.lastMove===st.walkPh))st.walkPh+=dt*9;st.lastMove=st.walkPh;
  const tool=a.tool||(typeof curTool==='function'?curTool():{id:'pioche'});const ranged=!!tool.beam;
  const swingP=(a.swing>0&&a.swingDur)?clamp(1-a.swing/a.swingDur,0,1):-1;
  const ready=isPl&&!moving&&typeof target!=='undefined'&&target&&!target.dead&&!ranged;
  const mining=swingP>=0&&!ranged,poseMine=mining||ready;
  const jet=isPl||a.sx!==undefined?(typeof GL==='function'&&GL('jetpack')>=1):false;
  const s=Math.sin(st.walkPh),c=Math.cos(st.walkPh),breath=Math.sin(t*2.3);
  const T={legN:-.03+.02*Math.sin(t*.8),legF:.05,drop:.6*breath,lean:.015*Math.sin(t*.8),sway:1.5*Math.sin(t*.8),
    gx:40,gy:-124,fhd:1.48,nsh:1.62+.03*breath,nel:-.12,liftN:0,liftF:0,tilt:0,hover:0};
  if(moving&&!jet){T.legN=-.42*s;T.legF=.42*s;T.liftN=Math.max(0,-c)*9;T.liftF=Math.max(0,c)*9;T.drop=-Math.abs(c)*5+3;T.lean=.06;T.tilt=.03*s;T.sway=0;
    T.nsh=1.62+.28*s;T.nel=-.2-.22*Math.max(0,s);T.gx=40+4*s;T.gy=-126+2*Math.abs(c);T.fhd=1.40-.12*s;}
  if(jet){T.hover=14+3*Math.sin(t*3.1);if(moving){T.legN=.18;T.legF=.32;T.lean=.14;T.liftN=4;T.liftF=2;T.sway=0;}else{T.legN=.06;T.legF=.14;}}
  if(ranged){T.gx=70;T.gy=-150;T.fhd=-.05;if(a.swing>0)T.lean=-.04;}
  if(poseMine){const kf=swingPose(mining?swingP:0);T.gx=kf.gx;T.gy=kf.gy;T.fhd=kf.hd;T.drop=kf.drop;T.lean=kf.lean;if(!jet){T.legN=kf.legN;T.legF=kf.legF;}T.sway=0;T.tilt=mining&&swingP>.48&&swingP<.66?.03:0;}
  const sf=moving?260:140;for(const q of ['legN','legF','liftN','liftF','tilt','sway','hover'])spring(st,q,T[q],dt,sf);
  spring(st,'drop',T.drop,dt,poseMine?900:200,poseMine?38:undefined);spring(st,'lean',T.lean,dt,poseMine?600:120,poseMine?36:undefined);
  for(const q of ['gx','gy','fhd']){if(mining){J[q]=T[q];st.V[q]=0;}else spring(st,q,T[q],dt,ready?260:110);}
  spring(st,'nsh',T.nsh,dt,320);spring(st,'nel',T.nel,dt,320);
  if(poseMine||ranged){J.ik=Math.min(1,(J.ik||0)+dt*6);st.V.ik=0;}else spring(st,'ik',0,dt,200);
  // géométrie
  const sc=HH/P.H,ox=-P.W*sc*.48,oy=-P.H*sc,S=(x,y)=>[ox+x*sc,oy+y*sc];
  const hipC=S((P.nHip[0]+P.fHip[0])/2,(P.nHip[1]+P.fHip[1])/2),legLen=(P.H-P.nHip[1])*sc,drop=J.drop-J.hover;
  const sq=clamp((legLen-J.drop)/legLen,.82,1.08);
  const IMG=n=>skinImg(n,skinId);
  function leg(n,hip,an,lift){const h=S(hip[0],hip[1]);g.save();g.translate(h[0]+J.sway*.5,h[1]+drop-lift);g.rotate(an);g.scale(1,sq);g.drawImage(IMG(n),-hip[0]*sc,-hip[1]*sc,P.W*sc,P.H*sc);g.restore();}
  const upper=new DOMMatrix().translate(hipC[0]+J.sway,hipC[1]+drop).rotate((J.lean+J.tilt)*57.3).scale(1,1+.012*breath).translate(-hipC[0],-hipC[1]);
  const tp=(x,y)=>{const q=upper.transformPoint(new DOMPoint(x,y));return[q.x,q.y];};
  const fS=tp(...S(P.fsh[0],P.fsh[1]));
  const L1=Math.hypot(P.fel[0]-P.fsh[0],P.fel[1]-P.fsh[1])*sc,L2=Math.hypot(P.fhd[0]-P.fel[0],P.fhd[1]-P.fel[1])*sc*1.05;
  const r1=Math.atan2(P.fel[1]-P.fsh[1],P.fel[0]-P.fsh[0]),r2=Math.atan2(P.fhd[1]-P.fel[1],P.fhd[0]-P.fel[0]);
  const fF=tp(J.gx,J.gy-J.hover),sol=ik2(fS,fF,L1,L2),a1=sol.a1,a2=sol.a2,fE=sol.E;
  const hd=J.fhd,psc=HH/949*.40,hdir=[Math.cos(hd),Math.sin(hd)];
  const G2=[fF[0]+hdir[0]*(PICK.grip2[0]-PICK.grip[0])*psc,fF[1]+hdir[1]*(PICK.grip2[0]-PICK.grip[0])*psc];
  const realPick=(tool.id==='pioche'||tool.id==='t1');
  function drawToolR(){g.save();g.translate(fF[0],fF[1]);g.rotate(hd);
    if(realPick){if(tool.id==='t1')g.filter='saturate(.25) brightness(1.05)';if(mining&&swingP>.42&&swingP<.6){g.shadowColor='#5ff';g.shadowBlur=18;}
      g.drawImage(IM.pick,-PICK.grip[0]*psc,-PICK.grip[1]*psc,PICK.W*psc,PICK.H*psc);g.filter='none';}
    else if(typeof drawTool==='function'){const prev=cx;cx=g;try{g.rotate(0);drawTool(tool,250/47*1.05,t,a.swing>0);}catch(e){}finally{cx=prev;}}
    g.restore();}
  function farUpper(){g.save();g.translate(fS[0],fS[1]);g.rotate(a1-r1);g.drawImage(IMG(P.p+'-fU'),-P.fsh[0]*sc,-P.fsh[1]*sc,P.W*sc,P.H*sc);g.restore();}
  function farLower(){drawToolR();g.save();g.translate(fE[0],fE[1]);g.rotate(a2-r2);g.drawImage(IMG(P.p+'-fF'),-P.fel[0]*sc,-P.fel[1]*sc,P.W*sc,P.H*sc);g.restore();}
  const nS=tp(...S(P.nsh[0],P.nsh[1])),n1=Math.hypot(P.nel[0]-P.nsh[0],P.nel[1]-P.nsh[1])*sc,n2=Math.hypot(P.nhd[0]-P.nel[0],P.nhd[1]-P.nel[1])*sc;
  const nr1=Math.atan2(P.nel[1]-P.nsh[1],P.nel[0]-P.nsh[0]),nr2=Math.atan2(P.nhd[1]-P.nel[1],P.nhd[0]-P.nel[0]);
  let b1=J.nsh,b2=J.nsh+J.nel;
  if(J.ik>.01){const so=ik2(nS,ranged?[fF[0]+hdir[0]*20,fF[1]+hdir[1]*20]:G2,n1,n2),w=clamp(J.ik,0,1);const da=(x,y)=>{let q=y-x;while(q>Math.PI)q-=2*Math.PI;while(q<-Math.PI)q+=2*Math.PI;return x+q;};b1=lerp(b1,da(b1,so.a1),w);b2=lerp(b2,da(b2,so.a2),w);}
  const nE=[nS[0]+Math.cos(b1)*n1,nS[1]+Math.sin(b1)*n1];
  // jetpack (derrière le dos)
  if(jet){const jb=tp(...S(P.p==='hero-y'?40:36,170));for(const dx of [-9,9]){g.save();g.translate(jb[0]+dx,jb[1]);
      const fl=moving?1:.55,len=(26+10*Math.sin(t*31+dx))*fl;const fg=g.createLinearGradient(0,40,0,40+len);fg.addColorStop(0,'rgba(190,240,255,.95)');fg.addColorStop(.35,'rgba(90,170,255,.8)');fg.addColorStop(1,'rgba(60,90,255,0)');
      g.fillStyle=fg;g.beginPath();g.moveTo(-6,40);g.quadraticCurveTo(0,40+len*1.2,6,40);g.fill();
      const bg=g.createLinearGradient(-8,0,8,0);bg.addColorStop(0,'#3d4350');bg.addColorStop(.5,'#9aa3b5');bg.addColorStop(1,'#2a2e38');g.fillStyle=bg;g.fillRect(-8,-6,16,46);g.fillStyle='#d8682a';g.fillRect(-8,4,16,5);g.fillStyle='#1c1f26';g.fillRect(-6,38,12,5);g.restore();}}
  leg(P.p+'-legF',P.fHip,J.legF,J.liftF);
  const front=fF[1]>fS[1]+6&&fF[0]>fS[0]-38;
  farUpper();if(!front)farLower();
  leg(P.p+'-legN',P.nHip,J.legN,J.liftN);
  g.save();g.setTransform(new DOMMatrix([R,0,0,R,R*OX,R*OY]).multiply(upper));g.drawImage(IMG(P.p+'-torso'),ox,oy,P.W*sc,P.H*sc);g.restore();
  if(front)farLower();
  g.save();g.translate(nE[0],nE[1]);g.rotate(b2-nr2);g.drawImage(IMG(P.p+'-nF'),-P.nel[0]*sc,-P.nel[1]*sc,P.W*sc,P.H*sc);g.restore();
  g.save();g.translate(nS[0],nS[1]);g.rotate(b1-nr1);g.drawImage(IMG(P.p+'-nU'),-P.nsh[0]*sc,-P.nsh[1]*sc,P.W*sc,P.H*sc);g.restore();
  // bouclier énergétique
  if(typeof GL==='function'&&GL('shield')>=1&&(isPl||a.sx!==undefined)){g.save();g.strokeStyle='rgba(111,227,255,'+(.22+.08*Math.sin(t*3))+')';g.lineWidth=4;g.beginPath();g.ellipse(0,-130-J.hover,95,150,0,0,7);g.stroke();g.restore();}
  // demi-tour en volume
  const face=a.face||1;spring(st,'yaw',face*45,dt,55,2*Math.sqrt(55)*1.05);
  cx.save();cx.translate(s0[0],s0[1]);cx.globalAlpha*=a.alpha===undefined?1:a.alpha;
  {const hv=clamp(J.hover/14,0,1),sr=targetH*.27*(1-.3*hv),sg=cx.createRadialGradient(0,0,1,0,0,sr);sg.addColorStop(0,'rgba(0,0,0,'+(.5-.2*hv)+')');sg.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=sg;cx.beginPath();cx.ellipse(0,0,sr,sr*.32,0,0,7);cx.fill();}
  cx.scale(u,u);
  const ay=Math.abs(J.yaw),fw=clamp((24-ay)/12,0,1);
  const drawFront=al=>{const im=IMG(P.front);if(!im||!im.width)return;const fh=HH*.985,w=im.width*fh/im.height;const sx=.82+.18*Math.cos(J.yaw*Math.PI/90);
    cx.save();cx.globalAlpha*=al;cx.translate(0,J.drop*.5-J.hover);cx.scale(sx,1);
    if(realPick){cx.save();cx.translate(-w/2+(J.yaw>=0?.92:.08)*w,-fh*.47);cx.rotate(1.5);cx.drawImage(IM.pick,-PICK.grip[0]*psc,-PICK.grip[1]*psc,PICK.W*psc,PICK.H*psc);cx.restore();}
    cx.drawImage(im,-w/2,-fh,w,fh);cx.restore();};
  const cyl=ox+P.cx*sc,RR=P.W*sc*.5;
  if(fw>=.5){drawFront(1);if(fw<1)blitYaw(st,J.yaw,cyl,RR,1-fw);}else{blitYaw(st,J.yaw,cyl,RR,1);if(fw>0)drawFront(fw);}
  cx.restore();
  // traces de pas
  if(isPl&&moving&&!jet&&typeof T!=='undefined'){const ph=Math.floor(st.walkPh/Math.PI);if(ph!==st.lastStep){st.lastStep=ph;PRINTS.push({x:a.x,y:a.y,t:t,side:ph%2?1:-1,f:face});if(PRINTS.length>40)PRINTS.shift();}}
}
function blitYaw(st,yaw,cyl,R,AL){const OC=st.OC,K=st.R,ay=Math.abs(yaw),D=(Math.min(45,ay)-45)*Math.PI/180,fade=clamp((yaw+6)/12,0,1);
  const parts=fade>=.5?[[1,1]].concat(fade<1?[[-1,1-fade]]:[]):[[-1,1]].concat(fade>0?[[1,fade]]:[]);
  for(const [dir,al] of parts){cx.save();cx.globalAlpha*=al*AL;cx.scale(dir,1);
    if(Math.abs(D)<.003)cx.drawImage(OC,-OX,-OY,OW,OH);
    else{const step=6,N=OW/step;const map=v=>{if(v>=-1&&v<=1){const th=Math.asin(v)+D;return th<-Math.PI/2?null:R*Math.sin(th);}return R*v*Math.cos(D);};
      for(let i=0;i<N;i++){const xa=-OX+i*step,xb=xa+step,pa=map((xa-cyl)/R),pb=map((xb-cyl)/R);if(pa===null||pb===null||pb<=pa)continue;
        cx.drawImage(OC,i*step*K,0,step*K,OH*K,cyl+pa,-OY,pb-pa+.8,OH);}}
    cx.restore();}}

/* ---------- 6. minerais de Kepra-7 ---------- */
const CR=new WeakMap();
function cracks(o){let c=CR.get(o);if(c)return c;c=[];let sd=Math.floor((o.seed||.5)*99991);const Rn=()=>{sd=(sd*9301+49297)%233280;return sd/233280;};
  for(let i=0;i<5;i++){const pts=[[.5+(Rn()-.5)*.24,.38+(Rn()-.5)*.24]];let an=Rn()*6.28;for(let j=0;j<5;j++){an+=(Rn()-.5)*1.2;const l=.08+Rn()*.08,q=pts[pts.length-1];pts.push([q[0]+Math.cos(an)*l,q[1]+Math.sin(an)*l*.8]);}c.push(pts);}CR.set(o,c);return c;}
const OCR=document.createElement('canvas'),ocg=OCR.getContext('2d');
function oreSprite(o){const f=FAM[o.type];if(!f)return null;return IM[f[Math.floor((o.seed||0)*997)%f.length]];}
function drawOreR(o,t){
  const TT=ORES[o.type],s=iso(o.x,o.y),k=TW/60,im=oreSprite(o);
  const sc=(o.sc===undefined?1:o.sc)*TT.sz,w=TW*.88*sc,h=w*im.height/im.width,X=s[0]+(o.shake>0?Math.sin(t*80)*o.shake*5:0),Y=s[1]+TH*.16;
  const flip=(o.seed*13)%1>.5;
  {const sg=cx.createRadialGradient(X+w*.1,Y-2,w*.05,X+w*.1,Y-2,w*.62);sg.addColorStop(0,'rgba(0,0,0,.5)');sg.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=sg;cx.beginPath();cx.ellipse(X+w*.1,Y-2,w*.62,w*.22,0,0,7);cx.fill();}
  if(TT.glow||o.type==='rubis'){const gc=h2r(TT.c),pu=(.18+.12*Math.sin(t*3+o.seed*9))*(.6+.6*(TT.glow||.5)),gg=cx.createRadialGradient(X,Y-h*.2,1,X,Y-h*.2,w*.75);gg.addColorStop(0,'rgba('+gc+','+pu+')');gg.addColorStop(1,'rgba('+gc+',0)');cx.fillStyle=gg;cx.beginPath();cx.ellipse(X,Y-h*.2,w*.75,w*.3,0,0,7);cx.fill();}
  const dmg=o.max?1-o.hp/o.max:0,stage=Math.min(5,Math.ceil(dmg*5));
  let src=im,sw=im.width,sh=im.height;
  if(stage>0){const cw=Math.ceil(w*(typeof DPR!=='undefined'?DPR:1)),ch=Math.ceil(h*(typeof DPR!=='undefined'?DPR:1));OCR.width=cw;OCR.height=ch;ocg.clearRect(0,0,cw,ch);ocg.drawImage(im,0,0,cw,ch);ocg.globalCompositeOperation='source-atop';
    const cr=cracks(o),lw=Math.max(1.2,cw/60);ocg.lineCap='round';ocg.lineJoin='round';
    for(let i=0;i<stage;i++){const p=cr[i];ocg.strokeStyle='rgba(15,8,5,.85)';ocg.lineWidth=lw*1.6;ocg.beginPath();p.forEach((q,j)=>j?ocg.lineTo(q[0]*cw,q[1]*ch):ocg.moveTo(q[0]*cw,q[1]*ch));ocg.stroke();
      ocg.strokeStyle=TT.glow>.3?'rgba('+h2r(TT.c2)+',.8)':o.type==='cuivre'?'rgba(120,255,220,.6)':'rgba(255,230,190,.45)';ocg.lineWidth=lw*.6;ocg.beginPath();p.forEach((q,j)=>j?ocg.lineTo(q[0]*cw+1,q[1]*ch+1):ocg.moveTo(q[0]*cw+1,q[1]*ch+1));ocg.stroke();}
    ocg.globalCompositeOperation='source-over';src=OCR;sw=cw;sh=ch;}
  cx.save();cx.translate(X,Y);if(flip)cx.scale(-1,1);cx.drawImage(src,0,0,sw,sh,-w/2,-h,w,h);
  if(o.shake>.1){cx.globalCompositeOperation='lighter';cx.globalAlpha=Math.min(.5,(o.shake-.1)*4);cx.drawImage(src,0,0,sw,sh,-w/2,-h,w,h);cx.globalAlpha=1;cx.globalCompositeOperation='source-over';}
  cx.restore();
  const top=Y-h;
  if(o.exc){const pu=.5+.5*Math.sin(t*4),gg=cx.createRadialGradient(X,Y-h*.6,2,X,Y-h*.6,w*1.2);gg.addColorStop(0,'rgba(255,215,90,'+(.35+.25*pu)+')');gg.addColorStop(1,'rgba(255,180,40,0)');cx.globalCompositeOperation='lighter';cx.fillStyle=gg;cx.beginPath();cx.arc(X,Y-h*.6,w*1.2,0,7);cx.fill();cx.globalCompositeOperation='source-over';cx.fillStyle='#ffd23f';cx.font='900 '+Math.round(16*k)+'px system-ui';cx.textAlign='center';cx.fillText('!',X,top-TH*.5-pu*4);}
  if(o.geode){for(let q=0;q<5;q++){const an=t*2+q*1.26;cx.fillStyle='hsla('+((t*120+q*72)%360)+',100%,70%,.95)';cx.beginPath();cx.arc(X+Math.cos(an)*w*.4,Y-h*.55+Math.sin(an)*w*.2,2.6*k,0,7);cx.fill();}}
  if(o.pure){cx.fillStyle='rgba(255,255,255,'+(.5+.5*Math.sin(t*8+o.seed*20))+')';const sx2=X+Math.cos(t*2+o.seed*6)*w*.25,sy2=top+4*k;cx.beginPath();cx.moveTo(sx2,sy2-5*k);cx.lineTo(sx2+1.5*k,sy2);cx.lineTo(sx2,sy2+5*k);cx.lineTo(sx2-1.5*k,sy2);cx.fill();}
  if((o.type==='rubis'||TT.st==='crystal')&&Math.sin(t*2.6+o.seed*40)>.9){const gx=X+Math.cos(o.seed*9)*w*.15,gy=top+h*.15,gl=6*k*(Math.sin(t*2.6+o.seed*40)-.9)*10;cx.strokeStyle='rgba(255,255,255,.95)';cx.lineWidth=1.3;cx.beginPath();cx.moveTo(gx-gl,gy);cx.lineTo(gx+gl,gy);cx.moveTo(gx,gy-gl);cx.lineTo(gx,gy+gl);cx.stroke();}
  if(META.set.cb&&typeof oreGlyph==='function'){const gl=oreGlyph(o.type);if(gl){cx.font='900 '+Math.round(13*k)+'px system-ui';cx.textAlign='center';cx.textBaseline='middle';cx.lineWidth=3;cx.strokeStyle='rgba(0,0,0,.85)';cx.strokeText(gl,X,top-TH*.2);cx.fillStyle='#fff';cx.fillText(gl,X,top-TH*.2);cx.textBaseline='alphabetic';}}
  if(dmg>0){const bw=w*.7;cx.fillStyle='rgba(0,0,0,.65)';cx.fillRect(X-bw/2,top-TH*.45,bw,5);cx.fillStyle=TT.c;cx.fillRect(X-bw/2,top-TH*.45,bw*Math.max(0,o.hp/o.max),5);}
  if(typeof target!=='undefined'&&target===o){
    if(typeof L==='function'&&L('zone')&&typeof zoneR==='function'){const Rz=zoneR();cx.strokeStyle='rgba(255,215,120,.45)';cx.lineWidth=2;cx.setLineDash([7,6]);cx.beginPath();cx.ellipse(s[0],s[1],Rz*TW/Math.SQRT2,Rz*TH/Math.SQRT2,0,0,7);cx.stroke();cx.setLineDash([]);}
    const p=.5+.5*Math.sin(t*5);cx.strokeStyle='rgba(255,240,200,'+(.45+.35*p)+')';cx.lineWidth=2.4;cx.setLineDash([8,6]);cx.lineDashOffset=-t*26;cx.beginPath();cx.ellipse(X,Y-2,w*.62+p*3,w*.24+p*1.5,0,0,7);cx.stroke();cx.setLineDash([]);cx.lineDashOffset=0;}
}

/* ---------- 7. LUMI ---------- */
function drawLumiR(x,y,k,t){
  const im=IM['v_lumi-blank'],h=27*k,w=im.width*h/im.height,kk=h/im.height;let mood='happy';
  try{if(typeof run!=='undefined'&&run&&!run.done&&run.total&&run.t/run.total<.3)mood='worry';if(lumi&&lumi.say>0)mood='joy';}catch(e){}
  const g0=cx.createRadialGradient(x,y,1,x,y,16*k);g0.addColorStop(0,'rgba(120,230,255,.22)');g0.addColorStop(1,'rgba(120,230,255,0)');cx.fillStyle=g0;cx.beginPath();cx.arc(x,y,16*k,0,7);cx.fill();
  cx.save();cx.translate(x,y);cx.rotate(Math.sin(t*1.7)*.06+(mood==='worry'?Math.sin(t*9)*.04:0));cx.drawImage(im,-w/2,-h/2,w,h);
  let col='127,246,255';try{col=LC();}catch(e){}
  const Pp=(px,py)=>[(px-im.width/2)*kk,(py-im.height/2)*kk],r=im.width/316;
  cx.strokeStyle=cx.fillStyle='rgb('+col+')';cx.shadowColor='rgb('+col+')';cx.shadowBlur=5;cx.lineWidth=Math.max(1,5*kk*r);cx.lineCap='round';
  const blink=(t%3.7)<.12;
  for(const ex of [175,243]){const [ox,oy]=Pp(ex*r,122*r);
    if(mood==='joy'){cx.beginPath();cx.arc(ox,oy+4*kk*r,13*kk*r,Math.PI+.3,-.3);cx.stroke();}
    else if(mood==='worry'){cx.beginPath();cx.ellipse(ox,oy+3*kk*r,12*kk*r,14*kk*r,0,0,7);cx.fill();const [bx,by]=Pp(ex*r,92*r);cx.beginPath();cx.moveTo(bx-14*kk*r,by+(ex<200?-5:5)*kk*r);cx.lineTo(bx+14*kk*r,by+(ex<200?5:-5)*kk*r);cx.stroke();}
    else if(blink){cx.beginPath();cx.moveTo(ox-14*kk*r,oy);cx.lineTo(ox+14*kk*r,oy);cx.stroke();}
    else{cx.beginPath();cx.ellipse(ox,oy,14*kk*r,16*kk*r,0,0,7);cx.fill();}}
  const [mx,my]=Pp(209*r,152*r);cx.beginPath();if(mood==='worry')cx.arc(mx,my+12*kk*r,13*kk*r,Math.PI+.4,-.4);else cx.arc(mx,my-6*kk*r,14*kk*r,.25,Math.PI-.25);cx.stroke();
  cx.restore();
}

/* ---------- 8. sol, rochers, cactus ---------- */
let PAT=null,BLANK=null;
function drawGroundR(t){
  if(!PAT){PAT=cx.createPattern(IM.ground2,'repeat');BLANK=document.createElement('canvas');BLANK.width=BLANK.height=1;}
  const terr=terrCanvas(),o=iso(0,0);
  cx.save();cx.transform(TW/2,TH/2,-TW/2,TH/2,o[0],o[1]);cx.imageSmoothingEnabled=true;cx.drawImage(terr,-6,-6,N+12,N+12);
  try{PAT.setTransform(new DOMMatrix().scale(6/1024));}catch(e){}
  cx.globalAlpha=.9;cx.fillStyle=PAT;cx.fillRect(0,0,N,N);cx.globalAlpha=1;cx.restore();
  GFX.terr=BLANK;try{ORIG.drawGround(t);}finally{GFX.terr=terr;}
  // traces de pas
  for(const p of PRINTS){const a=clamp(1-(t-p.t)/5,0,1);if(a<=0)continue;const q=iso(p.x,p.y),k=TW/60;cx.save();cx.globalAlpha=a*.4;cx.fillStyle='#3a1608';cx.translate(q[0]+p.side*2.5*k,q[1]);cx.beginPath();cx.ellipse(0,0,3*k,1.5*k,0,0,7);cx.fill();cx.restore();}
  while(PRINTS.length&&t-PRINTS[0].t>5)PRINTS.shift();
}
function drawRockR(o){const q=iso(o.x,o.y),r=TW*o.s*.5,f=FAM.roche,im=IM[f[Math.floor((o.x*7+o.y*13)*97)%f.length|0]||f[0]],w=r*2.3,h=w*im.height/im.width;
  const sg=cx.createRadialGradient(q[0]+r*.2,q[1]+2,r*.1,q[0]+r*.2,q[1]+2,r*1.3);sg.addColorStop(0,'rgba(0,0,0,.4)');sg.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=sg;cx.beginPath();cx.ellipse(q[0]+r*.2,q[1]+2,r*1.3,r*.55,0,0,7);cx.fill();
  cx.drawImage(im,q[0]-w/2,q[1]+r*.25-h,w,h);}
function drawCactusR(o,t){const s=iso(o.x,o.y),im=IM.cactus,h=TH*1.6*o.h*1.7,w=im.width*h/im.height,sw=Math.sin(t*1.5+o.seed*10)*.03;
  const sg=cx.createRadialGradient(s[0]+w*.15,s[1],1,s[0]+w*.15,s[1],w*.5);sg.addColorStop(0,'rgba(0,0,0,.35)');sg.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=sg;cx.beginPath();cx.ellipse(s[0]+w*.15,s[1],w*.5,w*.18,0,0,7);cx.fill();
  cx.save();cx.translate(s[0],s[1]+h*.03);cx.rotate(sw);cx.drawImage(im,-w/2,-h,w,h);cx.restore();}

/* ---------- 9. effets : éclats, fin de filon, flèche de retour ---------- */
const PRINTS=[],FX=[];
function chunkBurst(o){const im=oreSprite(o);if(!im)return;for(let i=0;i<10;i++){const sw=im.width*(.18+Math.random()*.16),sh=im.height*(.18+Math.random()*.16);
  FX.push({x:o.x,y:o.y,z:TH*.5,vx:(Math.random()-.5)*3.4,vy:(Math.random()-.5)*3.4,vz:120+Math.random()*170,rot:Math.random()*6,vr:(Math.random()-.5)*14,life:1.1,im,sx:Math.random()*(im.width-sw),sy:Math.random()*(im.height-sh),sw,sh});}}
function oreFX(o,crit){if(!META.set.fx)return;const n=crit?10:5;
  for(let i=0;i<n;i++){if(o.type==='cuivre')parts.push({x:o.x,y:o.y,z:TH*.5,vx:rnd(-.8,.8),vy:rnd(-.8,.8),vz:rnd(10,30),life:.9,c:'rgba(70,210,180,.6)',r:rnd(3,5),smoke:1});
    else if(o.type==='rubis')parts.push({x:o.x,y:o.y,z:TH*.7,vx:rnd(-2.4,2.4),vy:rnd(-2.4,2.4),vz:rnd(80,200),life:rnd(.3,.6),c:'#ff5a78',r:1,spark:1});
    else if(o.type==='fer')parts.push({x:o.x,y:o.y,z:TH*.7,vx:rnd(-3.6,3.6),vy:rnd(-3.6,3.6),vz:rnd(100,260),life:rnd(.2,.4),c:'#ffe0a0',r:1,spark:1});
    else parts.push({x:o.x,y:o.y,z:TH*.4,vx:rnd(-.7,.7),vy:rnd(-.7,.7),vz:rnd(8,24),life:.8,c:'rgba(160,150,140,.5)',r:rnd(3,5),smoke:1});}}
function drawFX(dt){const k=TW/60;
  for(const p of FX){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vz-=520*dt;if(p.z<0){p.z=0;p.vz*=-.25;p.vx*=.5;p.vy*=.5;p.vr*=.4;}p.rot+=p.vr*dt;
    const q=iso(p.x,p.y,p.z),sc=TW*.5/p.im.width*1.6;cx.save();cx.globalAlpha=clamp(p.life*2,0,1);cx.translate(q[0],q[1]);cx.rotate(p.rot);cx.drawImage(p.im,p.sx,p.sy,p.sw,p.sh,-p.sw*sc/2,-p.sh*sc/2,p.sw*sc,p.sh*sc);cx.restore();}
  for(let i=FX.length-1;i>=0;i--)if(FX[i].life<=0)FX.splice(i,1);
  // flèche vers l'ORION quand l'oxygène baisse
  try{if(mode==='run'&&run&&!run.done&&run.total&&run.t/run.total<.35){const a0=iso(player.x,player.y,TH*1.2),b0=iso(SHIP.x,SHIP.y),an=Math.atan2(b0[1]-a0[1],b0[0]-a0[0]),d=Math.hypot(b0[0]-a0[0],b0[1]-a0[1]);
    if(d>TW*2.2){const pu=.5+.5*Math.sin(T*6),rx=a0[0]+Math.cos(an)*TW*1.3,ry=a0[1]+Math.sin(an)*TW*1.3;cx.save();cx.translate(rx,ry);cx.rotate(an);cx.globalAlpha=.6+.4*pu;cx.fillStyle='#6ff';cx.shadowColor='#6ff';cx.shadowBlur=12;cx.beginPath();cx.moveTo(14*k,0);cx.lineTo(-7*k,-8*k);cx.lineTo(-2*k,0);cx.lineTo(-7*k,8*k);cx.closePath();cx.fill();cx.restore();
      cx.save();cx.font='800 '+Math.round(11*k)+'px system-ui';cx.textAlign='center';cx.fillStyle='rgba(120,255,255,'+(.6+.4*pu)+')';cx.fillText('ORION',rx,ry-12*k);cx.restore();}}}catch(e){}
}

/* ---------- 10. branchement ---------- */
const ORIG={};
function hook(){
  if(typeof drawAstro!=='function'||typeof drawOre!=='function'){setTimeout(hook,200);return;}
  for(const n of ['drawAstro','drawOre','drawGround','drawRock','drawPlant','drawLumiS','hitOre','breakOre','drawLights'])ORIG[n]=window[n];
  let lastDT=0,lastNow=performance.now();
  window.drawAstro=function(a,t,skinId,scale){if(!READY||(typeof META!=='undefined'&&META.set&&META.set.real===false))return ORIG.drawAstro.apply(this,arguments);try{return drawHeroR(a,t,skinId,scale);}catch(e){console.error(e);return ORIG.drawAstro.apply(this,arguments);}};
  window.drawOre=function(o,t){if(READY&&!o.boss&&FAM[o.type]){try{return drawOreR(o,t);}catch(e){console.error(e);}}return ORIG.drawOre.apply(this,arguments);};
  window.drawGround=function(t){if(READY&&kepra()){try{return drawGroundR(t);}catch(e){console.error(e);}}return ORIG.drawGround.apply(this,arguments);};
  window.drawRock=function(o){if(READY&&kepra()){try{return drawRockR(o);}catch(e){}}return ORIG.drawRock.apply(this,arguments);};
  window.drawPlant=function(o,t){if(READY&&kepra()&&PL().flora==='cactus'){try{return drawCactusR(o,t);}catch(e){}}return ORIG.drawPlant.apply(this,arguments);};
  window.drawLumiS=function(x,y,k,t){if(READY){try{return drawLumiR(x,y,k,t);}catch(e){console.error(e);}}return ORIG.drawLumiS.apply(this,arguments);};
  window.hitOre=function(o,dmg,src){const alive=o&&!o.dead,fl=floats.length;const r=ORIG.hitOre.apply(this,arguments);
    if(alive&&READY){const crit=floats.slice(fl).some(f=>f.txt==='CRITIQUE !');if(FAM[o.type])oreFX(o,crit);if(crit){shake=Math.max(shake,5);if(typeof vib==='function')vib(18);}else if(typeof vib==='function'&&src==='pioche')vib(6);}
    return r;};
  window.breakOre=function(o,src){const was=o&&!o.dead;const r=ORIG.breakOre.apply(this,arguments);
    if(was&&o.dead&&READY&&FAM[o.type]&&META.set.fx){chunkBurst(o);shake=Math.max(shake,3);if(typeof vib==='function')vib(14);}return r;};
  if(typeof gemHTML==='function'){ORIG.gemHTML=gemHTML;const st=document.createElement('style');st.textContent='.gemi{display:inline-block;width:1.35em;height:1.35em;object-fit:contain;vertical-align:-.32em;margin:0 .18em 0 0;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}';document.head.appendChild(st);
    window.gemHTML=function(r){if(READY&&FAM[r]&&!(META.set&&META.set.cb))return '<img class="gemi" alt="" src="'+BASE+FAM[r][0]+'.webp">';return ORIG.gemHTML.apply(this,arguments);};}
  window.drawLights=function(pl,t){const now=performance.now(),dt=clamp((now-lastNow)/1000,0,.05);lastNow=now;try{if(READY)drawFX(dt);}catch(e){}return ORIG.drawLights.apply(this,arguments);};
}
hook();
})();
