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
const NAMES=['lumi2','ship_broken','ship_scaff','ship_worn','ship_new','ground2','pick','cactus','v_lumi-blank','n-mfront','n-mback','n2-ffront','n2-fback'];
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

/* ---------- 5b. héros image par image (planches du stagiaire) ---------- */
const HF={"ref": 280, "A20": [102.0, 296, 0.87], "A21": [124.0, 293, 0.87], "A22": [99.0, 284, 0.87], "A23": [102.0, 282, 0.87], "A24": [108.0, 286, 0.87], "A25": [106.0, 273, 0.87], "A26": [90.0, 217, 0.87], "A32": [175.0, 269, 0.87], "A33": [147.0, 289, 0.87], "W00": [88.1, 290, 1], "W01": [88.1, 290, 1], "W02": [88.1, 290, 1], "W03": [88.1, 290, 1], "W04": [88.1, 290, 1], "W05": [88.1, 290, 1], "W06": [88.1, 290, 1], "W07": [88.1, 290, 1], "W08": [88.1, 290, 1], "W09": [88.1, 290, 1], "W10": [88.1, 290, 1], "W11": [88.1, 290, 1], "W12": [88.1, 290, 1], "W13": [88.1, 290, 1], "W14": [88.1, 290, 1], "B00": [96.0, 286, 1], "B01": [96.0, 286, 1], "B02": [96.0, 286, 1], "B03": [96.0, 286, 1], "B04": [96.0, 286, 1], "B05": [96.0, 286, 1], "B06": [96.0, 286, 1], "B07": [96.0, 286, 1], "B08": [96.0, 286, 1], "B09": [96.0, 286, 1], "B10": [96.0, 286, 1], "B11": [96.0, 286, 1], "B12": [96.0, 286, 1], "B13": [96.0, 286, 1], "B14": [96.0, 286, 1], "I00": [125.3, 294, 0.82], "I01": [125.3, 294, 0.82], "I02": [125.3, 294, 0.82], "I03": [125.3, 294, 0.82], "I04": [125.3, 294, 0.82], "I05": [125.3, 294, 0.82], "I06": [125.3, 294, 0.82], "I07": [125.3, 294, 0.82], "I08": [125.3, 294, 0.82], "I09": [125.3, 294, 0.82], "I10": [125.3, 294, 0.82], "I11": [125.3, 294, 0.82], "I12": [125.3, 294, 0.82], "I13": [125.3, 294, 0.82], "I14": [125.3, 294, 0.82], "I15": [125.3, 294, 0.82], "I16": [125.3, 294, 0.82], "I17": [125.3, 294, 0.82], "I18": [125.3, 294, 0.82], "I19": [125.3, 294, 0.82], "I20": [125.3, 294, 0.82], "I21": [125.3, 294, 0.82], "I22": [125.3, 294, 0.82], "I23": [125.3, 294, 0.82]};const HFN=Object.keys(HF).filter(k=>k!=='ref');let HF_LEFT=HFN.length,HF_READY=false;
for(const n of HFN){const i=new Image();i.decoding='async';i.onload=()=>{if(--HF_LEFT===0)HF_READY=true;};i.src=BASE+'h_'+n+'.webp';IM['h_'+n]=i;}
const HF_WALK=Array.from({length:15},(_,i)=>'W'+String(i).padStart(2,'0'));
const HF_BACK=Array.from({length:15},(_,i)=>'B'+String(i).padStart(2,'0'));const HF_IDLE=Array.from({length:24},(_,i)=>'I'+String(i).padStart(2,'0'));
function hfMine(p){return p<.15?'A25':p<.30?'A21':p<.42?'A20':p<.50?'A22':p<.62?'A23':p<.80?'A24':'A25';}
const HTOOL={"A20": [22, 65, 0.22], "A21": [28, 75, 0.16], "A22": [221, 185, -2.85], "A23": [217, 180, -2.97], "A25": [218, 178, -2.9], "W00": [130.0, 185.0, -2.854], "W01": [136.8, 175.9, -2.909], "W02": [142.6, 165.7, -3.041], "W03": [148.9, 157.5, -3.085], "W04": [152.3, 153.4, 3.085], "W05": [154.9, 155.8, 3.068], "W06": [149.0, 157.8, 3.096], "W07": [141.6, 160.7, -3.081], "W08": [132.6, 163.7, -3.048], "W09": [127.0, 167.6, -3.009], "W10": [125.3, 173.7, -2.915], "W11": [123.6, 176.7, 2.7], "W12": [126.9, 167.5, 3.051], "W13": [129.2, 172.1, -3.075], "W14": [134.6, 169.1, 2.537], "B00": [150.9, 187.1, -3.036], "B01": [159.6, 173.3, -3.059], "B02": [167.6, 158.8, 3.046], "B03": [171.8, 148.3, 2.865], "B04": [172.6, 156.7, 2.946], "B05": [173.8, 155.8, 2.91], "B06": [172.1, 144.8, 2.721], "B07": [168.0, 151.2, 2.862], "B08": [159.6, 169.2, -3.05], "B09": [154.3, 161.9, 3.074], "B10": [145.6, 171.9, -3.061], "B11": [138.2, 182.0, -3.027], "B12": [139.4, 191.9, -2.9], "B13": [140.5, 198.2, -2.876], "B14": [144.2, 198.4, -2.875], "I00": [206.1, 202.0, -2.527], "I01": [208.7, 212.1, -2.477], "I02": [209.6, 208.3, -2.501], "I03": [210.2, 205.5, -2.521], "I04": [209.7, 200.9, -2.561], "I05": [210.0, 195.9, -2.647], "I06": [209.7, 191.9, -2.679], "I07": [208.2, 188.1, -2.709], "I08": [208.0, 185.7, -2.746], "I09": [207.4, 183.8, -2.76], "I10": [207.3, 182.7, -2.819], "I11": [207.4, 182.8, -2.825], "I12": [207.5, 182.4, -2.84], "I13": [208.3, 183.1, -2.838], "I14": [209.1, 184.4, -2.831], "I15": [210.0, 185.4, -2.824], "I16": [211.1, 186.3, -2.825], "I17": [211.9, 188.0, -2.817], "I18": [212.0, 189.5, -2.754], "I19": [211.3, 190.6, -2.741], "I20": [211.1, 191.8, -2.729], "I21": [210.9, 194.0, -2.702], "I22": [210.2, 196.5, -2.679], "I23": [209.1, 199.4, -2.651]},TOOLA={t1:[.3,.42,80],t2:[.06,.5,66],t3:[.06,.5,60],t4:[.06,.5,62],t5:[.06,.5,74],t6:[.06,.5,64]},TOOLI={};
function toolImg(id){if(!TOOLI[id]){const i=new Image();i.decoding='async';i.src=BASE+'tool_'+id+'.webp';TOOLI[id]=i;}const i=TOOLI[id];return i.complete&&i.naturalWidth?i:null;}
function erasedImg(n){const k='h_'+n+'_e';if(!IM[k]){const i=new Image();i.decoding='async';i.src=BASE+k+'.webp';IM[k]=i;}const i=IM[k];return i.complete&&i.naturalWidth?k:null;}
function drawHeroF(a,t,skinId,scale){
  const k=scale||TW/60,targetH=(scale?52:62)*k*1.08,u=targetH/HF.ref;
  const s0=a.sx!==undefined?[a.sx,a.sy]:iso(a.x,a.y);
  const isPl=(typeof player!=='undefined'&&a===player);
  const st=stateFor(a,'F'+(isPl?'player':'k'+Math.round(k*10)+'|'+(a.sx!==undefined?'s':'w')));
  const dt=st.lt===null?0:clamp(t-st.lt,0,.05);st.lt=t;
  const moving=!!a.moving;
  if(a.x!==undefined){const sp=iso(a.x,a.y);if(st.lastS){const dy=sp[1]-st.lastS[1];if(Math.abs(dy)>.05)st.up=spring(st,'up',dy<0?1:0,dt,40)>.5;st.walkPh+=Math.hypot(a.x-st.last[0],a.y-st.last[1])*3.2;}st.lastS=sp;st.last=[a.x,a.y];}
  if(moving&&(a.x===undefined||dt>0&&st.lastMove===st.walkPh))st.walkPh+=dt*8;st.lastMove=st.walkPh;
  const tool=a.tool||(typeof curTool==='function'?curTool():{id:'pioche'});const ranged=!!tool.beam;
  const swingP=(a.swing>0&&a.swingDur)?clamp(1-a.swing/a.swingDur,0,1):-1;
  const ready=isPl&&!moving&&typeof target!=='undefined'&&target&&!target.dead&&!ranged;
  const jet=isPl||a.sx!==undefined?(typeof GL==='function'&&GL('jetpack')>=1):false;
  let n;
  if(swingP>=0&&!ranged)n=hfMine(swingP);
  else if(moving&&!jet){const seq=st.up?HF_BACK:HF_WALK;n=seq[Math.floor(st.walkPh*seq.length/(2*Math.PI))%seq.length];}
  else if(ready)n='A25';
  else{const q=Math.floor(t*12)%46,j=q<24?q:46-q;n=HF_IDLE[Math.min(23,j)];}
  const tid=tool.id||'pioche',swap=tid!=='pioche'&&HTOOL[n]&&toolImg(tid)&&erasedImg(n);if(tid!=='pioche'){toolImg(tid);if(!window.__ePre){window.__ePre=1;for(const k in HTOOL)erasedImg(k);}}
  const im=skinImg(swap?('h_'+n+'_e'):('h_'+n),skinId);if(!im||!im.width)return false;
  const hover=jet?(14+3*Math.sin(t*3.1))*k/2.2:0,breath=(!moving&&swingP<0)?Math.sin(t*2.3)*.6:0;
  const face=(a.face||1)>=0?1:-1;
  cx.save();cx.translate(s0[0],s0[1]);cx.globalAlpha*=a.alpha===undefined?1:a.alpha;
  {const hv=clamp(hover/(6*k),0,1),sr=targetH*.27*(1-.3*hv),sg=cx.createRadialGradient(0,0,1,0,0,sr);sg.addColorStop(0,'rgba(0,0,0,'+(.5-.2*hv)+')');sg.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=sg;cx.beginPath();cx.ellipse(0,0,sr,sr*.32,0,0,7);cx.fill();}
  cx.translate(0,-hover+breath);cx.scale(face*u,u);
  if(jet){for(const dx of [-24,-8]){const fl=moving?1:.55,len=(70+26*Math.sin(t*31+dx))*fl,x0=dx*(st.up?-1:1),y0=-150;
    const fg=cx.createLinearGradient(0,y0,0,y0+len);fg.addColorStop(0,'rgba(190,240,255,.95)');fg.addColorStop(.35,'rgba(90,170,255,.8)');fg.addColorStop(1,'rgba(60,90,255,0)');
    cx.fillStyle=fg;cx.beginPath();cx.moveTo(x0-13,y0);cx.quadraticCurveTo(x0,y0+len*1.2,x0+13,y0);cx.fill();}}
  const m=HF[n],q=m[2]||1;cx.drawImage(im,-m[0]*q,-m[1]*q,im.width*q,im.height*q);
  if(swap){const h=HTOOL[n],A=TOOLA[tid]||[.03,.5,70],ti=toolImg(tid),tw=A[2]*q*1.25,th2=tw*ti.height/ti.width;cx.save();cx.translate((h[0]-m[0])*q,(h[1]-m[1])*q);
    {const L=58*q,g=cx.createLinearGradient(0,-3*q,0,3*q);cx.save();cx.rotate(h[2]);g.addColorStop(0,'#5b6270');g.addColorStop(.5,'#2a2e36');g.addColorStop(1,'#14161b');cx.fillStyle=g;cx.fillRect(-4*q,-3.2*q,L,6.4*q);cx.restore();}cx.rotate(h[2]+Math.PI);if(Math.cos(h[2]+Math.PI)<0)cx.scale(1,-1);cx.drawImage(ti,-A[0]*tw,-A[1]*th2,tw,th2);cx.restore();}
  if(typeof GL==='function'&&GL('shield')>=1&&(isPl||a.sx!==undefined)){cx.strokeStyle='rgba(111,227,255,'+(.22+.08*Math.sin(t*3))+')';cx.lineWidth=8;cx.beginPath();cx.ellipse(0,-140,110,170,0,0,7);cx.stroke();}
  cx.restore();
  if(isPl&&moving&&!jet){const ph=Math.floor(st.walkPh/Math.PI);if(ph!==st.lastStep){st.lastStep=ph;PRINTS.push({x:a.x,y:a.y,t:t,side:ph%2?1:-1,f:face});if(PRINTS.length>40)PRINTS.shift();}}
  return true;
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
const QFAM={"fer": {"n": ["q_fer0", "q_fer1", "q_fer2", "q_fer5", "q_fer6", "q_fer8", "q_fer9"], "x": "q_fer9", "g": "q_fer8"}, "cuivre": {"n": ["q_cuivre0", "q_cuivre1", "q_cuivre3", "q_cuivre4", "q_cuivre5"], "x": "q_cuivre2", "g": "q_cuivre8"}, "rubis": {"n": ["q_rubis0", "q_rubis1", "q_rubis3", "q_rubis4", "q_rubis5"], "x": "q_rubis6", "g": "q_rubis9"}, "or": {"n": ["q_or0", "q_or1", "q_or2", "q_or3", "q_or4", "q_or5"], "x": "q_or6", "g": "q_or7"}, "obs": {"n": ["q_obs0", "q_obs1", "q_obs2", "q_obs3", "q_obs4", "q_obs7"], "x": "q_obs8", "g": "q_obs10"}, "blanc": {"n": ["q_blanc0", "q_blanc1", "q_blanc3", "q_blanc4", "q_blanc5"], "x": "q_blanc6", "g": "q_blanc8"}, "ame": {"n": ["q_ame0", "q_ame1", "q_ame3", "q_ame4", "q_ame5"], "x": "q_ame6", "g": "q_ame9"}, "eme": {"n": ["q_eme0", "q_eme1", "q_eme3", "q_eme4", "q_eme6"], "x": "q_eme7", "g": "q_eme9"}, "bleu": {"n": ["q_bleu0", "q_bleu1", "q_bleu3", "q_bleu4", "q_bleu5"], "x": "q_bleu6", "g": "q_bleu9"}},QMAP={"fer": "fer", "cuivre": "cuivre", "rubis": "rubis", "sporedor": "or", "obsidienne": "obs", "quartz": "blanc", "amethyste": "ame", "jade": "eme", "saphir": "bleu", "foudrite": "bleu"},QI={};function qImg(n){if(!QI[n]){const i=new Image();i.decoding='async';i.src=BASE+n+'.webp';QI[n]=i;}const i=QI[n];return i.complete&&i.naturalWidth?i:null;}
function oreSprite(o){const q=QFAM[QMAP[o.type]];if(q){const n=o.geode?q.g:o.exc?q.x:q.n[Math.floor((o.seed||0)*997)%q.n.length];const i=qImg(n);if(i)return i;}const f=FAM[o.type];if(!f)return null;return IM[f[Math.floor((o.seed||0)*997)%f.length]];}
for(const k in QMAP){const q=QFAM[QMAP[k]];q.n.concat([q.x,q.g]).forEach(qImg);}
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
  const im=IM['lumi2'];if(!im||!im.width)return ORIG.drawLumiS(x,y,k,t);
  const h=31*k,w=im.width*h/im.height,kk=h/im.height;let mood='happy';
  try{if(typeof run!=='undefined'&&run&&!run.done&&run.total&&run.t/run.total<.3)mood='worry';if(lumi&&lumi.say>0)mood='joy';}catch(e){}
  const g0=cx.createRadialGradient(x,y,1,x,y,18*k);g0.addColorStop(0,'rgba(120,230,255,.2)');g0.addColorStop(1,'rgba(120,230,255,0)');cx.fillStyle=g0;cx.beginPath();cx.arc(x,y,18*k,0,7);cx.fill();
  cx.save();cx.translate(x,y+Math.sin(t*2.2)*1.2*k);cx.rotate(Math.sin(t*1.7)*.06+(mood==='worry'?Math.sin(t*9)*.04:0));cx.drawImage(im,-w/2,-h/2,w,h);
  let col='127,246,255';try{col=LC();}catch(e){}
  const SX=149.2,SY=119.8,R=67.5;const P=(fx,fy)=>[(SX+fx*R-im.width/2)*kk,(SY+fy*R-im.height/2)*kk],u=R*kk;
  cx.strokeStyle=cx.fillStyle='rgb('+col+')';cx.shadowColor='rgb('+col+')';cx.shadowBlur=6;cx.lineWidth=Math.max(1,.075*u);cx.lineCap='round';
  const blink=(t%3.7)<.12,look=Math.sin(t*.7)*.06;
  for(const sx of [-.36,.36]){const [ox,oy]=P(sx+look,-.08);
    if(mood==='joy'){cx.beginPath();cx.arc(ox,oy+.05*u,.18*u,Math.PI+.3,-.3);cx.stroke();}
    else if(mood==='worry'){cx.beginPath();cx.ellipse(ox,oy+.04*u,.15*u,.19*u,0,0,7);cx.fill();const [bx,by]=P(sx,-.42);cx.beginPath();cx.moveTo(bx-.18*u,by+(sx<0?-.06:.06)*u);cx.lineTo(bx+.18*u,by+(sx<0?.06:-.06)*u);cx.stroke();}
    else if(blink){cx.beginPath();cx.moveTo(ox-.18*u,oy);cx.lineTo(ox+.18*u,oy);cx.stroke();}
    else{cx.beginPath();cx.ellipse(ox,oy,.17*u,.21*u,0,0,7);cx.fill();}}
  const [mx,my]=P(look,.34);cx.beginPath();if(mood==='worry')cx.arc(mx,my+.16*u,.17*u,Math.PI+.4,-.4);else cx.arc(mx,my-.08*u,.2*u,.25,Math.PI-.25);cx.stroke();
  cx.restore();
}

/* ---------- 8. sol, rochers, cactus ---------- */
let PAT=null,BLANK=null;
const GRI={},GRP={};function pIdx(){try{return S.planet;}catch(e){return 0;}}
function grImg(i){if(!GRI[i]){const im=new Image();im.decoding='async';im.src=BASE+'gr'+i+'.webp';GRI[i]=im;}return GRI[i];}
function drawGroundR(t){
  if(!BLANK){BLANK=document.createElement('canvas');BLANK.width=BLANK.height=1;}
  const pi=pIdx(),gi=grImg(pi);let pat=GRP[pi];
  if(!pat){if(!gi.complete||!gi.naturalWidth){if(pi===0){if(!PAT)PAT=cx.createPattern(IM.ground2,'repeat');pat=PAT;}else return ORIG.drawGround(t);}else pat=GRP[pi]=cx.createPattern(gi,'repeat');}
  const terr=terrCanvas(),o=iso(0,0);
  cx.save();cx.transform(TW/2,TH/2,-TW/2,TH/2,o[0],o[1]);cx.imageSmoothingEnabled=true;cx.drawImage(terr,-6,-6,N+12,N+12);
  try{pat.setTransform(new DOMMatrix().scale(6/1024));}catch(e){}
  cx.globalAlpha=.92;cx.fillStyle=pat;cx.fillRect(0,0,N,N);cx.globalAlpha=1;cx.restore();
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

/* ---------- ORION réaliste en 4 états ---------- */
function shipState(){let rep=0,tot=1;try{rep=(S.parts||[]).length;tot=PL().parts.length;}catch(e){}const pr=rep/tot;return pr<=0?['ship_broken',null,0]:pr<.6?['ship_scaff',null,0]:pr<1?['ship_worn',null,0]:['ship_new',null,0];}
const SHIPFADE={cur:null,prev:null,t0:0};
function drawShipR(t){
  const s=iso(SHIP.x,SHIP.y),k=TW/60,st=shipState()[0];
  if(SHIPFADE.cur!==st){SHIPFADE.prev=SHIPFADE.cur;SHIPFADE.cur=st;SHIPFADE.t0=t;}
  const im=IM[st];if(!im||!im.width)return false;
  const w=235*k,h=w*im.height/im.width;
  cx.save();cx.translate(s[0],s[1]);
  cx.fillStyle='rgba(0,0,0,.38)';cx.beginPath();cx.ellipse(-6*k,10*k,100*k,30*k,-.42,0,7);cx.fill();
  const dx=-w*.5,dy=-h*.70;
  const fa=SHIPFADE.prev?clamp((t-SHIPFADE.t0)/1.2,0,1):1;
  if(fa<1&&IM[SHIPFADE.prev]){cx.globalAlpha=1-fa;cx.drawImage(IM[SHIPFADE.prev],dx,dy,w,h);}
  cx.globalAlpha=fa;cx.drawImage(im,dx,dy,w,h);cx.globalAlpha=1;
  if(st==='ship_new'||st==='ship_worn'){const g=cx.createRadialGradient(w*.36,-h*.47,1,w*.36,-h*.47,34*k);g.addColorStop(0,'rgba(120,230,255,'+(.35+.15*Math.sin(t*6))+')');g.addColorStop(1,'rgba(120,230,255,0)');cx.fillStyle=g;cx.beginPath();cx.arc(w*.36,-h*.47,34*k,0,7);cx.fill();}
  if(st==='ship_broken'||st==='ship_scaff'){for(let i=0;i<3;i++){const ph=(t*.35+i/3)%1,x=-w*.06+Math.sin(i*2.1)*8*k,y=-h*.48-ph*60*k;cx.fillStyle='rgba(60,60,64,'+(.35*(1-ph))+')';cx.beginPath();cx.arc(x+ph*14*k,y,(6+ph*16)*k,0,7);cx.fill();}}
  cx.restore();return true;
}

/* ---------- décors de chaque planète (images du stagiaire) ---------- */
const DEC={0:[['cactus','a275_1','a275_3'],['a275_0','a275_2']],1:[['a275_4','a275_6','a275_7'],['a275_5']],2:[['b618_0','b618_1'],[]],3:[['b618_3'],['b618_2']],4:[['b618_4','b618_5'],[]],5:[['b618_7'],['b618_6']],6:[['55b0_0'],['55b0_1']],7:[['55b0_3'],['55b0_2']],8:[['55b0_4'],['55b0_5']],9:[['55b0_6'],['55b0_7']]};
const DI={};function decImg(n){if(n==='cactus')return IM.cactus;if(!DI[n]){const im=new Image();im.decoding='async';im.src=BASE+'d_'+n+'.webp';DI[n]=im;}return DI[n];}
function drawDecorR(o,t){const pi=pIdx(),D=DEC[pi];if(!D)return false;
  const r=((o.seed||0)*9301+49297)%1,rare=D[1].length&&r<.14,list=rare?D[1]:D[0],n=list[Math.floor(((o.seed||0)*7.77%1)*list.length)%list.length];
  if(n==='cactus')return drawCactusR(o,t)!==false;
  const im=decImg(n);if(!im.complete||!im.naturalWidth)return false;
  const q=iso(o.x,o.y),k=TW/60,h=(rare?62:34)*k*(.75+.5*(o.h||1)),w=h*im.width/im.height;
  const sg=cx.createRadialGradient(q[0],q[1],1,q[0],q[1],w*.5);sg.addColorStop(0,'rgba(0,0,0,.42)');sg.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=sg;cx.beginPath();cx.ellipse(q[0],q[1],w*.5,w*.17,0,0,7);cx.fill();
  cx.save();if((o.seed||0)*13%1<.5){cx.translate(q[0],0);cx.scale(-1,1);cx.translate(-q[0],0);}cx.drawImage(im,q[0]-w/2,q[1]-h*.94,w,h);cx.restore();return true;}

/* ---------- créatures réalistes (planètes 6 à 10) ---------- */
const MONF={5:[0,[0,1,2,3],4],6:[1,[0,1,2,3],4],7:[2,[1,3,2,3],4],8:[3,[1,2,3,2],4],9:[4,[0,1,2,3],4]};const MI={};
function monImg(r,c){const n='m'+r+'_'+c;if(!MI[n]){const i=new Image();i.decoding='async';i.src=BASE+n+'.webp';MI[n]=i;}const i=MI[n];return i.complete&&i.naturalWidth?i:null;}
for(const p in MONF){const f=MONF[p];f[1].concat([f[2]]).forEach(c=>monImg(f[0],c));}
function drawMonR(m,t){const F=MONF[pIdx()];if(!F)return false;
  const att=(m.lunge||0)>.15,c=att?F[2]:F[1][Math.floor(t*5+m.seed*7)%F[1].length],im=monImg(F[0],c);if(!im)return false;
  const q=iso(m.x,m.y),k=TW/60*1.35*(.35+.65*m.sc),face=player.x-m.x-(player.y-m.y)>0?1:-1,h=(F[0]===2?46:F[0]===3?38:30)*k,w=h*im.width/im.height,bob=Math.sin(t*6+m.seed*9)*1.2*k;
  cx.save();cx.translate(q[0],q[1]);
  {const sg=cx.createRadialGradient(0,0,1,0,0,w*.5);sg.addColorStop(0,'rgba(0,0,0,.5)');sg.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=sg;cx.beginPath();cx.ellipse(0,0,w*.5,w*.18,0,0,7);cx.fill();}
  if(F[0]===3){const g=cx.createRadialGradient(0,-h*.5,1,0,-h*.5,w*.7);g.addColorStop(0,'rgba(140,190,255,'+(.25+.15*Math.sin(t*9))+')');g.addColorStop(1,'rgba(140,190,255,0)');cx.fillStyle=g;cx.beginPath();cx.arc(0,-h*.5,w*.7,0,7);cx.fill();}
  cx.scale(-face,1);cx.translate((m.lunge||0)*8*k,F[0]===3?-6*k+bob:bob*.3);
  cx.drawImage(im,-w/2,-h*.96,w,h);
  if(m.hit>0){cx.globalAlpha=Math.min(1,m.hit*3)*.6;cx.globalCompositeOperation='lighter';cx.drawImage(im,-w/2,-h*.96,w,h);cx.globalCompositeOperation='source-over';cx.globalAlpha=1;}
  cx.restore();
  const bw=34*k;cx.fillStyle='rgba(0,0,0,.7)';cx.fillRect(q[0]-bw/2,q[1]-h-6*k,bw,5);cx.fillStyle='#ff5050';cx.fillRect(q[0]-bw/2,q[1]-h-6*k,bw*Math.max(0,m.hp/m.max),5);
  if(target===m){cx.strokeStyle='rgba(255,80,80,'+(.5+.4*Math.sin(t*8))+')';cx.lineWidth=2;cx.setLineDash([5,4]);cx.beginPath();cx.ellipse(q[0],q[1],Math.max(20*k,w*.45),9*k,0,0,7);cx.stroke();cx.setLineDash([]);}
  return true;}
const ORIG={};
function hook(){
  if(typeof drawAstro!=='function'||typeof drawOre!=='function'){setTimeout(hook,200);return;}
  for(const n of ['drawAstro','drawOre','drawGround','drawRock','drawPlant','drawLumiS','hitOre','breakOre','drawLights','drawShip','drawMon'])ORIG[n]=window[n];
  window.drawMon=function(m,t){if(READY){try{if(drawMonR(m,t))return;}catch(e){console.error(e);}}return ORIG.drawMon.apply(this,arguments);};
  window.drawShip=function(t){if(READY&&!(META.set&&META.set.real===false)){try{if(drawShipR(t)!==false)return;}catch(e){console.error(e);}}return ORIG.drawShip.apply(this,arguments);};
  let lastDT=0,lastNow=performance.now();
  window.drawAstro=function(a,t,skinId,scale){if(!READY||(typeof META!=='undefined'&&META.set&&META.set.real===false))return ORIG.drawAstro.apply(this,arguments);try{if(HF_READY&&!(typeof FEM==='function'&&FEM())&&!(META.set&&META.set.fbf===false)){const ok=drawHeroF(a,t,skinId,scale);if(ok!==false)return;}return drawHeroR(a,t,skinId,scale);}catch(e){console.error(e);return ORIG.drawAstro.apply(this,arguments);}};
  window.drawOre=function(o,t){if(READY&&!o.boss&&oreSprite(o)){try{return drawOreR(o,t);}catch(e){console.error(e);}}return ORIG.drawOre.apply(this,arguments);};
  window.drawGround=function(t){if(READY&&pIdx()<10){try{return drawGroundR(t);}catch(e){console.error(e);}}return ORIG.drawGround.apply(this,arguments);};
  window.drawRock=function(o){if(READY&&kepra()){try{return drawRockR(o);}catch(e){}}return ORIG.drawRock.apply(this,arguments);};
  window.drawPlant=function(o,t){if(READY){try{if(drawDecorR(o,t))return;}catch(e){console.error(e);}}return ORIG.drawPlant.apply(this,arguments);};
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
