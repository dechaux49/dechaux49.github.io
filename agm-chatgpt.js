/* AGM V5 Validation V2 — moteur de coordination de ChatGPT, intégré par Claude en v49 (portage des ancres V43). */
'use strict';
var CM_AGM_LIB=(()=>{
// Source AGM V5 Validation V2 (ChatGPT): agm/legacy/shared.mjs
const m2=(()=>{

// GM03 pilot: single accounting authority. Synchronous trusted owners only.
function createShared({bytes=32*1048576,safety=2*1048576,fx=4*1048576,scratch=4*1048576,slots=128,fxSlots=16,scratchSlots=4,cooldown=500,historyCap=128}={}){
 const nat=x=>Number.isSafeInteger(x)&&x>0;
 if(![bytes,safety,fx,scratch,slots,fxSlots,scratchSlots,cooldown,historyCap].every(nat)||bytes-safety-fx-scratch<=0||slots-fxSlots-scratchSlots<=0)throw RangeError('config');
 const limits={main:[bytes-safety-fx-scratch,slots-fxSlots-scratchSlots],fx:[fx,fxSlots],scratch:[scratch,scratchSlots]};
 const totals={main:{bytes:0,slots:0},fx:{bytes:0,slots:0},scratch:{bytes:0,slots:0}};
 const entries=new Map(), failures=new Map();let busy=false,closed=false,last=0,peak=0;
 const counts={hit:0,miss:0,created:0,evicted:0,refused:0,suppressed:0,errors:0};
 const group=f=>f==='fx'?'fx':f==='scratch'?'scratch':'main';
 const valid=(f,k)=>['dimc','ltc','btc','fx','scratch','gri','grp','skc','htool','sprite','portrait','decor','media','audio'].includes(f)&&typeof k==='string'&&/^[a-zA-Z0-9_.:-]{1,100}$/.test(k);
 const total=()=>totals.main.bytes+totals.fx.bytes+totals.scratch.bytes;
 function forget(e){entries.delete(e.id);totals[e.g].bytes-=e.n;totals[e.g].slots--;}
 function drop(e){try{let r=e.dispose(e.value);if(r&&typeof r.then==='function'){Promise.resolve(r).catch(()=>{});throw Error('async dispose unsupported')}forget(e);return true}catch{e.bad=true;counts.errors++;return false}}
 function backoff(id,now){failures.delete(id);failures.set(id,now);if(failures.size>historyCap)failures.delete(failures.keys().next().value)}
 function lease(e){e.pins++;entries.delete(e.id);entries.set(e.id,e);let live=true;return {value:e.value,release(){if(!live)return false;live=false;e.pins--;return true}}}
 function get(f,k,n,now,build,dispose,{optional=false}={}){
  if(busy||closed||!valid(f,k)||!nat(n)||!Number.isFinite(now)||now<last||typeof build!=='function'||typeof dispose!=='function')return null;
  last=now;let id=f+'/'+k,g=group(f),t=totals[g],lim=limits[g],old=entries.get(id);
  if(old){if(old.bad||old.n!==n||old.pending){counts.refused++;return null}counts.hit++;return lease(old)}
  counts.miss++;if(failures.has(id)&&now-failures.get(id)<cooldown){counts.suppressed++;return null}
  if(n>lim[0]){counts.refused++;backoff(id,now);return null}
  busy=true;try{
   const fits=(b,s)=>b<=lim[0]-n&&s<lim[1];
   if(!fits(t.bytes,t.slots)){
    // Speculative loads and scratch never evict; foreground may evict only its own group.
    if(optional||g==='scratch'){counts.refused++;backoff(id,now);return null}
    let b=t.bytes,s=t.slots;const plan=[];
    for(const e of entries.values()){if(e.g!==g||e.pins||e.bad||e.pending)continue;plan.push(e);b-=e.n;s--;if(fits(b,s))break}
    if(!fits(b,s)){counts.refused++;backoff(id,now);return null}
    for(const e of plan){if(!drop(e)){counts.refused++;backoff(id,now);return null}counts.evicted++}
   }
   const e={id,g,n,pins:0,pending:true,bad:false,dispose,value:null};entries.set(id,e);t.bytes+=n;t.slots++;peak=Math.max(peak,total());
   // Builder must clean up partial allocation if it throws. No asynchronous builders allowed.
   try{e.value=build();if(e.value==null)throw Error('empty');if(typeof e.value.then==='function'){Promise.resolve(e.value).catch(()=>{});e.bad=true;e.uncertain=true;e.pending=false;counts.errors++;backoff(id,now);return null}}
   catch{forget(e);counts.errors++;backoff(id,now);return null}
   e.pending=false;failures.delete(id);counts.created++;return lease(e);
  }finally{busy=false}
 }
 function remove(f,k){if(busy||!valid(f,k))return false;let e=entries.get(f+'/'+k);if(!e||e.pins||e.pending||e.bad||e.uncertain)return false;busy=true;try{return drop(e)}finally{busy=false}}
 function close(){if(busy)return false;closed=true;busy=true;try{for(const e of entries.values())if(!e.pins&&!e.pending&&!e.bad)drop(e);return entries.size===0}finally{busy=false}}
 function snapshot(){return {total:total(),peak,limits:structuredClone(limits),groups:structuredClone(totals),entries:entries.size,history:failures.size,quarantine:[...entries.values()].filter(e=>e.bad).length,...counts}}
 return Object.freeze({get,remove,close,snapshot});
}

return Object.freeze({createShared});
})();
// Source AGM V5 Validation V2 (ChatGPT): agm/legacy/async.mjs
const m3=(()=>{

// GM04: uses exactly one supplied GM03 authority; no second byte ledger.
function createAsyncCache(budget,{load,dispose,clock=()=>performance.now(),maxInFlight=2,maxWaiters=32,cooldown=500,historyCap=128}={}){
 const nat=x=>Number.isSafeInteger(x)&&x>0;
 if(!budget||typeof load!=='function'||typeof dispose!=='function'||![maxInFlight,maxWaiters,cooldown,historyCap].every(nat))throw Error('config');
 const cells=new Map(), failures=new Map();let seq=0,gen=0,active=0,waiting=0,uncertain=0,closed=false,admissionBlocked=false,last=0;
 const stats={starts:0,joins:0,hits:0,denied:0,canceled:0,late:0,clean:0,quarantined:0,recovered:0,trimmed:0,invalidResults:0,oversized:0};
 // A broken clock must not strand waiters or leases. Freeze cooldown, never accelerate it.
 const now=()=>{let n;try{n=clock()}catch{return last}return Number.isFinite(n)?last=Math.max(last,n):last};
 const denied=()=>{stats.denied++;return {promise:Promise.resolve(null),cancel:()=>false}};
 const idOf=s=>s.family+'/'+s.key;
 const valid=s=>s&&['dimc','ltc','btc','fx','gri','grp','skc','htool','sprite','portrait','decor','media','audio'].includes(s.family)&&typeof s.key==='string'&&/^[a-zA-Z0-9_.:-]{1,90}$/.test(s.key)&&nat(s.bytes)&&nat(s.scratch);
 const key=s=>'a:'+s.key;
 function fail(id){failures.delete(id);failures.set(id,now());if(failures.size>historyCap)failures.delete(failures.keys().next().value)}
 function disposal(c){ // synchronous owner cleanup; an async disposer is forbidden
   if(c.phase==='quarantine')throw Error('cleanup uncertain');
   if(c.phase==='ready'||c.phase==='discard'){let r=dispose(c.value,c.spec);if(r&&typeof r.then==='function'){Promise.resolve(r).catch(()=>{});throw Error('async disposer')}if(r!==true)throw Error('cleanup not attested');}
   cells.delete(c.id);c.value=null;
 }
 function borrow(c,g){let l=budget.get(c.spec.family,key(c.spec),c.spec.bytes,now(),()=>{throw Error('missing cell')},disposal);if(!l)return null;let live=true;return {value:c.value,generation:g,valid:()=>live&&g===gen&&!closed,release(){if(!live)return false;live=false;const released=l.release();if(released&&closed)budget.remove(c.spec.family,key(c.spec));return released}}}
 function complete(w,val){if(!w.live)return;w.live=false;waiting--;w.cell.waiters.delete(w);w.resolve(val)}
 function cancel(w){if(!w.live)return false;let c=w.cell;complete(w,null);stats.canceled++;if(!c.waiters.size&&c.phase==='loading'){c.phase='aborting';c.controller.abort()}return true}
 function subscribe(c){let w;const promise=new Promise(resolve=>{w={resolve,live:true,cell:c,generation:gen};c.waiters.add(w);waiting++});return {promise,cancel:()=>cancel(w)}}
 function quarantine(c){c.phase='quarantine';uncertain++;stats.quarantined++;for(const w of [...c.waiters])complete(w,null);fail(c.id);/* keep both pins: no proof of cleanup */}
 function releaseScratch(c){c.scratchLease.release();return budget.remove('scratch',c.scratchKey)}
 // The trusted loader may attach a one-shot cleanup attestation for a timed-out operation.
 // No timer, polling, forced reload or recovery of an unconfirmed disposal.
 function recover(c,proof){if(proof!==true||cells.get(c.id)!==c||c.phase!=='quarantine'||c.value!=null||!c.pin)return false;
   if(!releaseScratch(c))return false;
   c.phase='clean';c.pin.release();c.pin=null;
   if(!budget.remove(c.spec.family,key(c.spec))){c.phase='quarantine';return false;}
   uncertain--;stats.recovered++;fail(c.id);return true;
 }
 // The loader is trusted code, but its result must be a plain data envelope.
 // Do not invoke accessors. Keep any safely observed object until cleanup is attested.
 function readResult(raw,r){
   if(!raw||typeof raw!=='object')throw Error('result');
   const proto=Object.getPrototypeOf(raw);if(proto!==Object.prototype&&proto!==null)throw Error('result prototype');
   for(const k of ['value','status','scratchClean','bytes','recovery']){const d=Object.getOwnPropertyDescriptor(raw,k);if(d){if(!Object.hasOwn(d,'value'))throw Error('result accessor');r[k]=d.value;}}
 }
 function settleRecovery(c,proof){
   if(proof===true)return recover(c,true);
   if(proof===false||proof==null||cells.get(c.id)!==c||c.phase!=='quarantine'||c.value!=null||!c.pin)return false;
   const r={};try{readResult(proof,r);if(r.status!=='uncertain'||r.scratchClean!==false||r.value==null)throw Error('recovery result');}
   catch{if(r.value!=null)c.value=r.value;stats.invalidResults++;admissionBlocked=true;return false}
   c.value=r.value;if(nat(r.bytes)&&r.bytes>c.spec.bytes)stats.oversized++;
   if(!nat(r.bytes)||r.bytes>c.spec.bytes)admissionBlocked=true;return false;
 }
 function finish(c,raw){active--;let r={};try{readResult(raw,r)}catch{if(r.value!=null)c.value=r.value;stats.invalidResults++;admissionBlocked=true;quarantine(c);return}
   if(r.value!=null)c.value=r.value;
   const over=nat(r.bytes)&&r.bytes>c.spec.bytes;
   if(over)stats.oversized++;
   if(r.status==='uncertain'&&r.scratchClean!==true){
     if(c.value!=null&&(!nat(r.bytes)||over))admissionBlocked=true;
     quarantine(c);
     if(c.value==null&&r.recovery!=null&&(typeof r.recovery==='object'||typeof r.recovery==='function'))Promise.resolve(r.recovery).then(proof=>settleRecovery(c,proof)).catch(()=>{});return;
   }
   if(r.status==='clean'&&r.scratchClean===true&&c.value==null){for(const w of [...c.waiters])complete(w,null);c.phase='clean';stats.clean++;fail(c.id);releaseScratch(c);c.pin.release();budget.remove(c.spec.family,key(c.spec));return}
   if(r.status!=='ready'||r.scratchClean!==true||c.value==null||!nat(r.bytes)){
     stats.invalidResults++;admissionBlocked=true;quarantine(c);return;
   }
   if(c.phase!=='loading'||closed||!c.waiters.size||over){stats.late++;for(const w of [...c.waiters])complete(w,null);c.phase='discard';releaseScratch(c);c.pin.release();if(!budget.remove(c.spec.family,key(c.spec))){c.phase='quarantine';uncertain++;stats.quarantined++;if(over)admissionBlocked=true}fail(c.id);return}
   releaseScratch(c);c.phase='ready';failures.delete(c.id);
   for(const w of [...c.waiters])complete(w,w.generation===gen?borrow(c,w.generation):null);
   c.pin.release();c.pin=null;
 }
 function request(spec,{optional=false,generation=gen}={}){
   if(closed||generation!==gen||!valid(spec))return denied();const s=Object.freeze({...spec}),id=idOf(s);let c=cells.get(id);
   if(c){if(c.spec.bytes!==s.bytes||c.spec.scratch!==s.scratch)return denied();if(c.phase==='ready'){let l=borrow(c,gen);if(!l)return denied();stats.hits++;return {promise:Promise.resolve(l),cancel:()=>false}}if(c.phase==='loading'&&waiting<maxWaiters){stats.joins++;return subscribe(c)}return denied()}
   // A quarantined operation with pins can still be running in native code.
   // Count it against the existing concurrency limit until proven recovered.
   const occupied=active+uncertain;
   if(admissionBlocked||occupied>=maxInFlight||waiting>=maxWaiters||(failures.has(id)&&now()-failures.get(id)<cooldown))return denied();
   const scratchKey='a:s'+(++seq);const scratchLease=budget.get('scratch',scratchKey,s.scratch,now(),()=>({}),()=>{}, {optional:true});if(!scratchLease)return denied();
   c={id,spec:s,phase:'loading',scratchKey,scratchLease,controller:new AbortController(),waiters:new Set(),value:null,pin:null};
   const pin=budget.get(s.family,key(s),s.bytes,now(),()=>c,disposal,{optional});if(!pin){releaseScratch(c);return denied()}
   c.pin=pin;cells.set(id,c);active++;stats.starts++;const t=subscribe(c);
   Promise.resolve().then(()=>c.controller.signal.aborted?{status:'clean',scratchClean:true}:load(s,c.controller.signal)).then(r=>finish(c,r),()=>{active--;quarantine(c)});
   return t;
 }
 function invalidate(){gen++;for(const c of cells.values())for(const w of [...c.waiters])cancel(w);return gen}
 function close(){closed=true;invalidate();for(const c of [...cells.values()])if(c.phase==='ready')budget.remove(c.spec.family,key(c.spec));return cells.size===0}
 function trimIdleTerrain(max=2){if(!Number.isSafeInteger(max)||max<1||max>10)return 0;let count=0;for(const c of cells.values()){if(c.spec.family==='gri'&&c.phase==='ready'&&budget.remove('gri',key(c.spec))){count++;stats.trimmed++;if(count>=max)break;}}return count;}
 function snapshot(){return {...stats,generation:gen,active,waiting,cells:cells.size,history:failures.size,closed,admissionBlocked,budget:budget.snapshot()}}
 return Object.freeze({request,invalidate,close,snapshot,trimIdleTerrain,generation:()=>gen});
}

return Object.freeze({createAsyncCache});
})();
// Source AGM V5 Validation V2 (ChatGPT): agm/legacy/gm02.mjs
const m4=(()=>{

 // Pure helper retained from the retired budget.
function rgbaBytes(w,h,copies=1){if(![w,h,copies].every(x=>Number.isSafeInteger(x)&&x>0))return null;const n=w*h*4*copies;return Number.isSafeInteger(n)?n:null}
// A synchronous one-shot inventory. No persistent references or automatic eviction.
function observeGraphics(slots,{maxSlots=2048}={}){
 if(!Array.isArray(slots)||!Number.isSafeInteger(maxSlots)||maxSlots<1||slots.length>maxSlots)throw new RangeError('slots');
 const unique=new Map();let unknown=0,aliases=0,missing=0,conflicts=0;const totals=Object.create(null);
 for(const slot of slots){if(!slot||typeof slot.family!=='string'||!/^[a-z0-9_-]{1,32}$/.test(slot.family)){unknown++;continue;}
   const o=slot.resource;if(o==null){missing++;continue;}if(typeof o!=='object'&&typeof o!=='function'){unknown++;continue;}
   const bytes=rgbaBytes(slot.width,slot.height,slot.copies??1);const old=unique.get(o);
   if(old){aliases++;if(old.bytes!==bytes)old.conflict=true;if(old.family!==slot.family)old.family='shared';continue;}
   unique.set(o,{bytes,family:slot.family,conflict:false});
 }
 let estimated=0;for(const e of unique.values()){if(e.conflict){conflicts++;continue;}if(e.bytes===null||!Number.isSafeInteger(estimated+e.bytes)){unknown++;continue;}estimated+=e.bytes;totals[e.family]=(totals[e.family]??0)+e.bytes;}
 return {slots:slots.length,unique:unique.size,aliases,unknown,missing,conflicts,estimated,byFamily:totals};
}
const FAMILIES=Object.freeze(['gri','grp','skc','dimc','ltc','btc','htool','fx','scratch']);
const EVENTS=Object.freeze(['hit','miss','create','evict','fallback','refuse','release']);
// Owners provide synchronous, bounded snapshots, never transfer ownership.
function createGM02({enabled=false,periodMs=1000,maxSlots=2048,providers={}}={}){
 if(!Number.isFinite(periodMs)||periodMs<250||!Number.isSafeInteger(maxSlots)||maxSlots<1||maxSlots>8192)throw new RangeError('config');
 const sources=FAMILIES.map(f=>[f,typeof providers[f]==='function'?providers[f]:null]);
 const counters=Object.fromEntries(FAMILIES.map(f=>[f,Object.fromEntries(EVENTS.map(e=>[e,0]))]));
 let last=-Infinity,busy=false,peak=0,samples=0;
 function event(f,e){if(!enabled||!FAMILIES.includes(f)||!EVENTS.includes(e))return false;const n=counters[f][e];if(n<Number.MAX_SAFE_INTEGER)counters[f][e]=n+1;return true;}
 function sample(now,{visible=true,frameIdle=false}={}){
  if(!enabled||!visible||!frameIdle||busy||!Number.isFinite(now)||now<last||now-last<periodMs)return null;
  last=now;busy=true;
  try{
   const slots=[],status=Object.create(null);let truncated=false;
   for(const [family,read] of sources){
    if(!read){status[family]='unwired';continue;}
    if(slots.length>=maxSlots){status[family]='not-scanned';truncated=true;continue;}
    const begin=slots.length;
    try{
     const data=read(maxSlots-slots.length);
     if(!Array.isArray(data))throw new TypeError('snapshot');
     const limit=Math.min(data.length,maxSlots-slots.length);
     for(let i=0;i<limit;i++){
      const d=data[i];if(!d||typeof d!=='object')throw new TypeError('descriptor');
      // Do not access URL, player data, pixels or implicit getters on the resource.
      slots.push({family,resource:d.resource,width:d.width,height:d.height,copies:d.copies??1});
     }
     const partial=data.length>limit;status[family]=partial?'truncated':'ok';truncated||=partial;
    }catch{slots.length=begin;status[family]='error';}
   }
   const result=observeGraphics(slots,{maxSlots});
   const complete=!truncated&&FAMILIES.every(f=>status[f]==='ok')&&!result.unknown&&!result.conflicts;
   if(complete)peak=Math.max(peak,result.estimated);samples++;
   return {samples,complete,truncated,status,...result,peakCompleteEstimate:peak,counters:JSON.parse(JSON.stringify(counters))};
  }finally{busy=false;}
 }
 return Object.freeze({event,sample});
}

return Object.freeze({rgbaBytes,observeGraphics,createGM02,FAMILIES,EVENTS});
})();
// Source AGM V5 Validation V2 (ChatGPT): agm/legacy/scopes.mjs
const m5=(()=>{

// GM04 transversal: no storage, no resource budget, no global monkey patches.
// A scope is owned by caller; identity guard is checked even when clearTimeout loses a race.
const validTimerDelay=ms=>Number.isFinite(ms)&&ms>=0&&ms<=2147483647;
function createScope({schedule=setTimeout,unschedule=clearTimeout,maxOptional=32,onCancelError=()=>{}}={}){
 if(!Number.isSafeInteger(maxOptional)||maxOptional<1)throw Error('maxOptional');
 let alive=true,seq=0,optionalPending=0; const pending=new Map(), slots=new Map();
 function cancel(id){const e=pending.get(id);if(!e)return false;pending.delete(id);if(e.optional)optionalPending--;if(e.key!==null&&slots.get(e.key)===id)slots.delete(e.key);try{unschedule(e.handle)}catch{try{onCancelError()}catch{}}return true;}
 function defer(fn,ms,{valid=()=>true,key=null,optional=key!==null}={}){
  if(!alive)return null;if(typeof fn!=='function'||typeof valid!=='function'||!validTimerDelay(ms))throw Error('args');
  // keyed mode is ONLY for optional, replaceable presentation; never for gameplay events.
  if(key!==null){if(!optional)throw Error('essential key');if(typeof key!=='string'||!key||key.length>80)throw Error('key');if(slots.has(key))cancel(slots.get(key));if(slots.size>=maxOptional)return null;}
  if(optional&&optionalPending>=maxOptional)return null;
  const id=++seq,e={handle:null,key,optional};pending.set(id,e);if(optional)optionalPending++;if(key!==null)slots.set(key,id);
  try{e.handle=schedule(()=>{if(!pending.has(id))return;pending.delete(id);if(e.optional)optionalPending--;if(key!==null&&slots.get(key)===id)slots.delete(key);if(alive&&valid())fn();},ms);}catch(err){if(pending.delete(id)&&e.optional)optionalPending--;if(key!==null&&slots.get(key)===id)slots.delete(key);throw err;}return id;
 }
 function close(){if(!alive)return false;alive=false;for(const id of pending.keys())cancel(id);return true;}
 return Object.freeze({defer,cancel,close,live:()=>alive,size:()=>pending.size});
}
// Caller supplies a read-only presentation function, never renderHub() wholesale (has effects).
function createViewBatch({frame,cancelFrame,paint,valid=()=>true}){
 let open=true,pending=null,dirty=false,serial=0;
 function request(){if(!open)return false;dirty=true;if(pending!==null)return true;const tag=++serial;let fired=false;const handle=frame(()=>{fired=true;if(tag!==serial||!open)return;pending=null;if(dirty&&valid()){dirty=false;paint();}});if(!fired)pending=handle;return true;}
 function close(){if(!open)return false;open=false;dirty=false;serial++;if(pending!==null)cancelFrame(pending);pending=null;return true;}
 return Object.freeze({request,close});
}
// Small admission gate for portal proposal; does not execute or retry transaction itself.
function createExclusive(){let ticket=null;return Object.freeze({begin(){if(ticket)return null;ticket=Object.freeze({});return ticket;},valid(t){return !!t&&t===ticket;},end(t){if(!t||t!==ticket)return false;ticket=null;return true;}});}

return Object.freeze({createScope,createViewBatch,createExclusive,validTimerDelay});
})();
// Source AGM V5 Validation V2 (ChatGPT): agm/agm.mjs
const m1=(()=>{
const {createShared}=m2;
const {createAsyncCache}=m3;
const {createGM02}=m4;
const {createScope,createViewBatch,createExclusive}=m5;




const domains=Object.freeze(['A','B','C','D','E','F','G','H','I','J']);
const safeInt=n=>Number.isSafeInteger(n)&&n>0;
// GM05 preflight: trusted manifest metadata, NOT an untrusted file parser.
function preflight({width,height,frames=1,encodedBytes}, {maxSide=4096,maxFrames=64,maxDecoded=8*1048576,maxEncoded=4*1048576}={}){
 if(![width,height,frames,encodedBytes,maxSide,maxFrames,maxDecoded,maxEncoded].every(safeInt)||width>maxSide||height>maxSide||frames>maxFrames||encodedBytes>maxEncoded)return null;
 const bytes=width*height*frames*4;
 return Number.isSafeInteger(bytes)&&bytes<=maxDecoded?{bytes}:null;
}
// All ports share exactly one authority and one async cache. No automatic tick or persistence.
function createAGM({load,dispose,clock=()=>performance.now(),memory={},asyncOptions={},observation={},schedule=setTimeout,unschedule=clearTimeout,frame,cancelFrame,maxScopes=10,maxOwned=128,optionalAdmission=()=>true,optionalPendingLimit=32}={}){
 if(!safeInt(maxScopes)||!safeInt(maxOwned)||!safeInt(optionalPendingLimit)||typeof frame!=='function'||typeof cancelFrame!=='function'||typeof optionalAdmission!=='function')throw Error('AGM config');
 const budget=createShared(memory), cache=createAsyncCache(budget,{...asyncOptions,load,dispose,clock}), observer=createGM02(observation);
 const lifecycle=new Map(), cleanupPending=new Set(), gate=createExclusive();let activeCritical=null,visible=true,closing=false,trimming=false;
 const local=new Map();
 const faults={optionalCallback:0,cancel:0,projection:0,localCleanup:0};const inc=k=>{faults[k]=Math.min(Number.MAX_SAFE_INTEGER,faults[k]+1)};
 function canRun(){return !closing;}
 function allowOptional(domain){if(!visible||closing||trimming)return false;try{return optionalAdmission(domain)===true;}catch{return false;}}
 // Scope key must be a fixed owner name, not per entity id. Replacing cancels only explicitly owned work.
 function open(domain,owner){
  if(!canRun()||!domains.includes(domain)||!owner||typeof owner!=='object')return null;
  if(cleanupPending.has(domain)||lifecycle.has(domain)||lifecycle.size>=maxScopes)return null;
  const scope=createScope({schedule,unschedule,maxOptional:optionalPendingLimit,onCancelError:()=>inc('cancel')}), requests=new Set(),leases=new Set(),views=new Set(),finalizers=new Set();let live=true;
  const valid=()=>live&&!closing&&lifecycle.get(domain)===port;
  function defer(fn,ms,{optional=false,key=null,guard=()=>true}={}){
   if(!valid()||(optional&&!allowOptional(domain)))return null;
   if(!optional&&key!==null)throw Error('cannot coalesce gameplay');
   if(typeof fn!=='function'||typeof guard!=='function')throw Error('callback');
   const check=()=>valid()&&(!optional||allowOptional(domain))&&guard(owner);
   return scope.defer(optional?()=>{try{const r=fn();if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>inc('optionalCallback'))}catch{inc('optionalCallback')}}:fn,ms,{key,optional,valid:optional?()=>{try{return check()}catch{inc('optionalCallback');return false}}:check});
  }
  function request(spec,{optional=false}={}){
   if(!valid()||(optional&&!allowOptional(domain))||requests.size+leases.size>=maxOwned)return Promise.resolve(null);
   const ticket=cache.request(spec,{optional});requests.add(ticket);
   return ticket.promise.then(lease=>{requests.delete(ticket);if(!lease)return null;
    if(!valid()||(optional&&!allowOptional(domain))){lease.release();return null;}
    let held=true;const owned=Object.freeze({value:lease.value,valid:()=>held&&valid()&&lease.valid(),release(){if(!held||cleanupPending.has(domain))return false;held=false;leases.delete(owned);return lease.release();}});leases.add(owned);return owned;
   });
  }
  function projection(paint){if(!valid()||views.size>=maxOwned||typeof paint!=='function')return null;const v=createViewBatch({frame,cancelFrame,paint:()=>{try{const r=paint();if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>inc('projection'))}catch{inc('projection')}},valid:()=>valid()&&visible});views.add(v);return Object.freeze({request(){try{return valid()&&visible&&v.request()}catch{inc('projection');return false}},close(){views.delete(v);try{return v.close()}catch{inc('projection');return false}}});}
  // Synchronous cleanup must attest success. Never auto-retry a failing owner cleanup.
  function own(cleanup){if(!valid()||finalizers.size>=maxOwned||typeof cleanup!=='function')return false;finalizers.add(cleanup);return true;}
  function close(){if(!live)return false;live=false;scope.close();for(const t of requests)t.cancel();requests.clear();for(const v of views)try{v.close()}catch{inc('projection')}views.clear();for(const f of finalizers){try{const r=f();if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>{});if(r!==true)cleanupPending.add(domain)}catch{cleanupPending.add(domain)}}finalizers.clear();if(!cleanupPending.has(domain))for(const l of leases)l.release();lifecycle.delete(domain);return true;}
  const port=Object.freeze({domain,valid,defer,request,projection,own,close,pending:()=>scope.size()});lifecycle.set(domain,port);return port;
 }
 // Critical paths are NOT scopes. Keep ticket on uncertainty, including hidden/close.
 function beginCritical(kind){if(!canRun()||trimming||!['portal','save','purchase','reward','import','update','production'].includes(kind))return null;const t=gate.begin();if(t)activeCritical={t,kind};return t;}
 function settleCritical(t,outcome){if(!gate.valid(t)||!['committed','no-effect','uncertain'].includes(outcome))return false;if(outcome==='uncertain')return false;activeCritical=null;return gate.end(t);}
 function setVisible(v){visible=!!v;return visible;}
 function close(){if(activeCritical||trimming||local.size)return false;closing=true;for(const p of [...lifecycle.values()])p.close();cache.close();const done=budget.close();return done&&cleanupPending.size===0;}
 function snapshot(){return {visible,closing,scopes:lifecycle.size,critical:activeCritical?.kind??null,cleanupPending:[...cleanupPending],localReservations:local.size,faults:{...faults},cache:cache.snapshot()};}
 // Fixed local owner slots, same byte authority as asynchronous resources.
 function canLocal(family){return ['scratch','audio'].includes(family)&&allowOptional(family==='audio'?'F':'A');}
 function reserveLocal(family,key,bytes,cleanup,attest=null){
  if(!['scratch','audio'].includes(family)||typeof key!=='string'||!/^engine-[a-z0-9-]{1,24}$/.test(key)||!safeInt(bytes)||typeof cleanup!=='function'||local.size>=8||!canLocal(family))return null;
  const id=family+'/'+key;if(local.has(id))return null;
  let t;try{t=clock()}catch{return null}if(!Number.isFinite(t))return null;
  const pin=budget.get(family,key,bytes,t,()=>({}),()=>{}, {optional:true});if(!pin)return null;
  let state='active',unpinned=false;function finish(){if(!unpinned){pin.release();unpinned=true;}if(!budget.remove(family,key)){state='quarantine';inc('localCleanup');return false}state='released';local.delete(id);return true}const handle=Object.freeze({release(){if(state!=='active')return false;state='cleaning';try{const r=cleanup();if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>{});if(r!==true)throw Error('cleanup unconfirmed');}catch{state='quarantine';inc('localCleanup');return false}return finish()},recover(){if(state!=='quarantine'||typeof attest!=='function'||activeCritical||closing||trimming)return false;state='cleaning';try{const r=attest();if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>{});if(r!==true){state='quarantine';return false}}catch{state='quarantine';return false}return finish()},status:()=>state});local.set(id,handle);return handle;
 }
 // Every domain has a named explicit port, with critical ones unable to cancel transactions.
 const GM=Object.freeze({
  A:Object.freeze({open:owner=>open('A',owner),preflight}), B:Object.freeze({open:owner=>open('B',owner)}),
  C:Object.freeze({open:owner=>open('C',owner),begin:()=>beginCritical('portal')}), D:Object.freeze({open:owner=>open('D',owner)}),
  E:Object.freeze({open:owner=>open('E',owner),beginReward:()=>beginCritical('reward')}), F:Object.freeze({open:owner=>open('F',owner)}),
  G:Object.freeze({open:owner=>open('G',owner)}), H:Object.freeze({begin:()=>beginCritical('production')}),
  I:Object.freeze({beginSave:()=>beginCritical('save'),beginPurchase:()=>beginCritical('purchase'),beginImport:()=>beginCritical('import')}),
  J:Object.freeze({open:owner=>open('J',owner),beginUpdate:()=>beginCritical('update')})});
 // A single, synchronous safe-point trim; critical tickets cannot begin inside disposal.
 function trimIdleTerrain(max){if(activeCritical||closing||trimming)return 0;trimming=true;try{return cache.trimIdleTerrain(max);}finally{trimming=false;}}
 return Object.freeze({GM,setVisible,settleCritical,close,snapshot,trimIdleTerrain,reserveLocal,canLocal,canOptimize:()=>visible&&!closing&&!trimming&&!activeCritical,observe:(now,opts={})=>observer.sample(now,{...opts,visible}),event:observer.event});
}

return Object.freeze({preflight,createAGM});
})();
// Source AGM V5 Validation V2 (ChatGPT): coordination.mjs
const m0=(()=>{
const {createAGM}=m1;
// AGM V2: policy at existing ownership/admission boundaries. No new resource ledger,
// no timers, no event subscribers, no persistence, no automatic financial actions.

const sources=Object.freeze(['CORE','GM05','GM06','GM07','GM08','GM09','GM10','GM11','GM12','GM13','GM14','GM15']);
const codes=Object.freeze(['pressure','pressure-clear','render-slow','render-normal','offline','online','fallback','cleanup-uncertain','stale-action','transaction-uncertain','fault']);
const roles=Object.freeze({'pressure':['CORE'],'pressure-clear':['CORE'],'render-slow':['GM06'],'render-normal':['GM06'],'offline':['GM15'],'online':['GM15'],'transaction-uncertain':['GM11','GM13']});
const sat=n=>Math.min(Number.MAX_SAFE_INTEGER,n+1);
function createCoordinatedAGM({coordinationClock=()=>performance.now(),trimCooldown=1000,...options}={}){
 if(typeof coordinationClock!=='function'||!Number.isSafeInteger(trimCooldown)||trimCooldown<1||'optionalAdmission' in options)throw Error('coordination config');
 const counts=new Float64Array(sources.length*codes.length), denials=new Float64Array(10);
 let pressure=false,slow=false,offline=false,lastTime=-Infinity,lastTrim=-Infinity,trimAttempts=0,trimmed=0,trimFaults=0,checking=false,staleReports=0;
 const latest=new Map();
 const stateGroup={'pressure':'pressure','pressure-clear':'pressure','render-slow':'render','render-normal':'render','offline':'network','online':'network'};
 let agm;
 function allowed(domain){const pass=agm.canOptimize()&&!pressure&&!slow&&!(offline&&domain==='J');if(!pass){const i='ABCDEFGHIJ'.indexOf(domain);if(i>=0)denials[i]=sat(denials[i]);}return pass;}
 agm=createAGM({...options,optionalAdmission:allowed});
 function signal(source,code,revision){const i=sources.indexOf(source),j=codes.indexOf(code);if(i<0||j<0||(Object.hasOwn(roles,code)&&!roles[code].includes(source)))return false;
  const group=Object.hasOwn(stateGroup,code)?stateGroup[code]:null;
  if(revision!==undefined&&(!group||!Number.isSafeInteger(revision)||revision<0))return false;
  if(group&&latest.has(group)&&(revision===undefined||revision<=latest.get(group))){staleReports=sat(staleReports);return false;}
  if(group&&revision!==undefined)latest.set(group,revision);
  const n=i*codes.length+j;counts[n]=sat(counts[n]);
  // Only an authoritative producer can change policy. Fault reports are observations,
  // not proof of root cause, and do not clear a quarantine or a critical ticket.
  switch(code){case 'pressure':pressure=true;break;case 'pressure-clear':pressure=false;break;case 'render-slow':slow=true;break;case 'render-normal':slow=false;break;case 'offline':offline=true;break;case 'online':offline=false;break;}
  return true;
 }
 function terrainEvent(e){if(!['hit','miss','create','evict','fallback','refuse','release'].includes(e))return false;
  agm.event('gri',e);if(e==='fallback')signal('GM05','fallback');if(e==='refuse')signal('GM05','cleanup-uncertain');return true;
 }
 function safePoint({idle=false,ownersReleased=false}={}){if(checking||!pressure||idle!==true||ownersReleased!==true||!agm.canOptimize())return 0;
  checking=true;try{
  let t;try{t=coordinationClock();}catch{return 0;}if(!Number.isFinite(t)||t<lastTime||!pressure||!agm.canOptimize())return 0;lastTime=t;
  if(t-lastTrim<trimCooldown)return 0;lastTrim=t;trimAttempts=sat(trimAttempts);
  try{const n=agm.trimIdleTerrain(2);trimmed=Math.min(Number.MAX_SAFE_INTEGER,trimmed+n);return n;}catch{trimFaults=sat(trimFaults);return 0;}
  }finally{checking=false;}
 }
 function snapshot(){const reports={};for(let i=0;i<sources.length;i++){const row={};for(let j=0;j<codes.length;j++){const v=counts[i*codes.length+j];if(v)row[codes[j]]=v;}if(Object.keys(row).length)reports[sources[i]]=row;}
  return {pressure,slow,offline,reports,optionalDenied:Object.fromEntries([...denials].map((v,i)=>['ABCDEFGHIJ'[i],v])),trimAttempts,trimmed,trimFaults,staleReports,agm:agm.snapshot()};}
 return Object.freeze({agm,signal,terrainEvent,safePoint,snapshot});
}

return Object.freeze({createCoordinatedAGM});
})();
// Source AGM V5 Validation V2 (ChatGPT): engine.mjs
const m6=(()=>{

// AGM Engine pilot: local preconditions, same AGM, fixed-size diagnostics; no extra tick.
const kinds=Object.freeze(['image','geometry','scratch','stale','damage']);
const domains=Object.freeze(['GM06','GM06','GM06','GM08','GM08']);
const codes=Object.freeze(['fallback','fault','fallback','stale-action','fault']);
function createEngine({coord=null,maxScratchBytes=4*1048576,maxSide=4096}={}){
 if(!Number.isSafeInteger(maxScratchBytes)||maxScratchBytes<4||!Number.isSafeInteger(maxSide)||maxSide<1)throw Error('engine config');
 const count=new Float64Array(kinds.length),pending=new Uint8Array(kinds.length);let reportFailures=0,flushing=false;
 function fault(i){count[i]=Math.min(Number.MAX_SAFE_INTEGER,count[i]+1);pending[i]=1;return false;}
 function flush(){if(!coord||flushing)return 0;flushing=true;let sent=0;try{for(let i=0;i<pending.length;i++){if(!pending[i])continue;pending[i]=0;try{if(coord.signal(domains[i],codes[i])===true){sent++}else{pending[i]=1;reportFailures=Math.min(Number.MAX_SAFE_INTEGER,reportFailures+1)}}catch{pending[i]=1;reportFailures=Math.min(Number.MAX_SAFE_INTEGER,reportFailures+1)}}return sent;}finally{flushing=false;}}
 function image(im){try{return !!(im&&typeof im==='object'&&Number.isFinite(im.width)&&im.width>0&&Number.isFinite(im.height)&&im.height>0&&(!('complete' in im)||(im.complete&&Number.isFinite(im.naturalWidth)&&im.naturalWidth>0&&Number.isFinite(im.naturalHeight)&&im.naturalHeight>0)))||fault(0)}catch{return fault(0)}}
 function geometry(o,T,t,TW,TH){if(o&&o.sc===0)return false;return !!(o&&T&&Number.isFinite(o.x)&&Number.isFinite(o.y)&&Number.isFinite(o.seed)&&Number.isFinite(t)&&Number.isFinite(TW)&&Number.isFinite(TH)&&Number.isFinite(T.sz)&&Number.isFinite(o.sc??1)&&TW>0&&TH>0&&T.sz>0&&(o.sc??1)>0&&Number.isFinite(TW*T.sz*(o.sc??1)))||fault(1);}
 function scratch(w,h){return (Number.isSafeInteger(w)&&Number.isSafeInteger(h)&&w>0&&h>0&&w<=maxSide&&h<=maxSide&&w*h*4<=maxScratchBytes)||fault(2);}
 function damage(o,dmg,T){return !!(o&&T&&Number.isFinite(o.hp)&&Number.isFinite(o.max)&&o.max>0&&Number.isFinite(dmg)&&dmg>=0&&Number.isFinite(o.hp-dmg))||fault(4);}
 function snapshot(){return {counts:Object.fromEntries(kinds.map((k,i)=>[k,count[i]])),pending:Array.from(pending).reduce((a,b)=>a+b,0),reportFailures};}
 return Object.freeze({image,geometry,scratch,damage,flush,snapshot});
}

return Object.freeze({createEngine});
})();
// Source AGM V5 Validation V2 (ChatGPT): floor-actions.mjs
const m7=(()=>{
const {validTimerDelay}=m5;
// Opt-in adapter: reuse AGM's existing B scope, not a second scheduler or ledger.
// Only bind if B is exclusively owned by floor callbacks. Critical transactions are not scoped.

function createFloorActions({agm,readRun,report=()=>{}}){
 if(typeof readRun!=='function')throw Error('readRun');
 let current=null,transitioning=false;
 function note(code){try{report('GM08',code)}catch{}}
 function leave(){if(transitioning)return false;transitioning=true;try{const old=current;current=null;return old?old.port.close():true}finally{transitioning=false}}
 function enter(){if(transitioning)return false;const run=readRun(),ores=run?.ores;if(!run||run.done||!Array.isArray(ores)){leave();return false}
  if(current?.run===run&&current.ores===ores&&current.port.valid())return true;
  if(!leave())return false;const port=agm.GM.B.open(run);if(!port){note('fault');return false}current={run,ores,port,advance:false};return true;}
 function valid(c){return !!c&&current===c&&readRun()===c.run&&!c.run.done&&c.run.ores===c.ores&&c.port.valid()}
 function defer(fn,ms,advance=false){const c=current;if(!valid(c)||typeof fn!=='function'||!validTimerDelay(ms)){note('stale-action');return false}
  if(advance&&c.advance)return false;if(advance)c.advance=true;
  try{const id=c.port.defer(()=>{if(advance)c.advance=false;if(!valid(c)){note('stale-action');return}fn()},ms);if(id===null){if(advance)c.advance=false;note('fault');return false}return id}catch(e){if(advance)c.advance=false;throw e}}
 return Object.freeze({enter,leave,deferRun:(fn,ms)=>defer(fn,ms),deferFloor:(fn,ms)=>defer(fn,ms,true),pending:()=>current?.port.pending()??0});
}

return Object.freeze({createFloorActions});
})();
// Source AGM V5 Validation V2 (ChatGPT): engine-resources.mjs
const m8=(()=>{

// No timer, polling, or separate byte ledger. Canvas size is RGBA estimate, not GPU RAM.
function createCanvasOwner({agm,canvas,key='engine-cracks',maxSide=4096,context=null,report=()=>{}}){
 let lease=null,w=0,h=0,blocked=false,resizes=0,refused=0,busy=false;
 function note(code){try{report('GM06',code)}catch{}}
 function zero(){canvas.width=0;canvas.height=0;return canvas.width===0&&canvas.height===0;}
 // The caller must pass a fresh zero-size canvas (before a rendering context is used).
 if(canvas.width!==0||canvas.height!==0)throw Error('scratch must start empty');
 function close(){if(busy)return false;busy=true;try{return release()}finally{busy=false}}
 function release(){if(blocked)return false;if(!lease)return true;const ok=lease.release();if(!ok){blocked=true;note('cleanup-uncertain');return false;}lease=null;w=h=0;return true;}
 function resize(x,y){if(busy)return false;busy=true;try{return resizeInner(x,y)}finally{busy=false}}
 function resizeInner(x,y){if(context&&typeof context.isContextLost==='function'){try{if(context.isContextLost()){refused++;note('fallback');return false;}}catch{refused++;note('fallback');return false;}}if(blocked||!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x<1||y<1||x>maxSide||y>maxSide){refused++;return false;}
  if(lease&&x===w&&y===h&&canvas.width===w&&canvas.height===h)return true;
  // Release old storage before asking for the next size; always draw fallback if denied.
  if(!agm.canLocal('scratch')||!release()){refused++;return false;}
  lease=agm.reserveLocal('scratch',key,x*y*4,zero,()=>canvas.width===0&&canvas.height===0);if(!lease){refused++;return false;}
  try{canvas.width=x;canvas.height=y;if(canvas.width!==x||canvas.height!==y)throw Error('size mismatch');w=x;h=y;resizes++;return true;}catch{release();refused++;note('fallback');return false;}
 }
 function recover(){if(busy||!blocked||!lease)return false;busy=true;try{if(!lease.recover())return false;lease=null;w=h=0;blocked=false;return true}finally{busy=false}}
 return Object.freeze({resize,close,recover,snapshot:()=>({w,h,blocked,resizes,refused})});
}
// PCM is accounted before createBuffer. Native node overhead is not included.
// A single owner for an ambience; transition is explicit, never retry a failed cleanup.
function createAudioOwner({agm,report=()=>{}}){
 let lease=null,nodes=[],buffer=null,blocked=false,active=false,busy=false,ownerContext=null;
 function note(code){try{report('GM09',code)}catch{}}
 function cleanup(){let ok=true;for(const n of nodes){try{if(n.started)n.node.stop()}catch{ok=false}try{n.node.disconnect()}catch{ok=false}}
  if(ok){nodes=[];buffer=null;active=false;ownerContext=null;}return ok;}
 function stop(){if(busy)return false;busy=true;try{return release()}finally{busy=false}}
 function release(){if(blocked)return false;if(!lease)return true;if(!lease.release()){blocked=true;note('cleanup-uncertain');return false;}lease=null;return true;}
 function start(ctx,seconds,build){if(busy)return false;busy=true;try{return startInner(ctx,seconds,build)}finally{busy=false}}
 function startInner(ctx,seconds,build){if(blocked||active||lease||!ctx||(typeof ctx.state==='string'&&ctx.state!=='running')||!Number.isFinite(ctx.sampleRate)||!Number.isFinite(seconds)||seconds<=0||seconds>4||typeof build!=='function')return false;
  const len=Math.floor(ctx.sampleRate*seconds);if(!Number.isSafeInteger(len)||len<1||len>384000)return false;
  lease=agm.reserveLocal('audio','engine-ambience',len*4,cleanup,()=>{if(ownerContext?.state!=='closed')return false;for(const n of nodes){try{n.node.disconnect()}catch{return false}}nodes=[];buffer=null;active=false;return true});if(!lease)return false;ownerContext=ctx;
  // register each node immediately after creation, before connect/start.
  let building=true;function own(node,source=false){if(!building)throw Error('late node registration');const n={node,started:false};nodes.push(n);return source?()=>{if(!building||n.started)throw Error('invalid source start');n.started=true;node.start()}:node;}
  try{buffer=ctx.createBuffer(1,len,ctx.sampleRate);const r=build(buffer,own);if(r&&typeof r.then==='function'){Promise.resolve(r).catch(()=>{});throw Error('async builder unsupported')}active=true;return true;}catch{release();note('fallback');return false;}finally{building=false;}
 }
 function recover(){if(busy||!blocked||!lease)return false;busy=true;try{if(!lease.recover())return false;lease=null;blocked=false;ownerContext=null;return true}finally{busy=false}}
 return Object.freeze({start,stop,recover,snapshot:()=>({active,blocked,nodes:nodes.length})});
}

return Object.freeze({createCanvasOwner,createAudioOwner});
})();
// Source AGM V5 Validation V2 (ChatGPT): adaptive-v5.mjs
const m9=(()=>{

// One producer for GM06 render state; feed existing measured FPS windows, no timer.
// A slow frame is not proof of CPU/GPU bottleneck or thermal state.
function createAdaptive({coord,apply,initial=2,thermalInput=null,targetFps=60}={}){
 if(!coord?.agm||typeof coord.signal!=='function'||typeof apply!=='function'||![1,2].includes(initial)||![30,60].includes(targetFps)|| (thermalInput!==null&&typeof thermalInput.hint!=='function'))throw Error('adaptive config');
 let quality=initial,slow=coord.snapshot().slow===true,low=0,high=0,rev=0,busy=false,changes=0,uncertain=false;
 function sample(fps,seconds,visible=true,thermal='unknown'){
  if(busy||uncertain)return quality;
  if(thermalInput!==null){try{thermal=thermalInput.hint();}catch{thermal='unknown';}}
  if(visible!==true||!Number.isFinite(fps)||fps<=0||fps>1000||!Number.isFinite(seconds)||seconds<=0||seconds>2||!['unknown','normal','severe','warm','critical'].includes(thermal)){low=high=0;return quality;}
  // When the real renderer starts in low quality, keep optional work gated.
  if(quality===1&&!slow){busy=true;try{if(!coord.agm.canOptimize()||coord.signal('GM06','render-slow',rev++)!==true)return quality;slow=true;}finally{busy=false}}
  if(thermal==='critical'){low=4;high=0;}
  else if(fps<(targetFps===30?19:38)||thermal==='severe'||thermal==='warm'){low=Math.min(4,low+seconds);high=0;}
  else if(fps>=(targetFps===30?26:52)){high=Math.min(8,high+seconds);low=0;}else{low=high=0;}
  if(low<4&&high<8)return quality;
  const target=low>=4?1:2;
  if(target===quality&&slow===(quality===1))return quality;
  busy=true;try{
   if(!coord.agm.canOptimize())return quality;
   if(target===2&&coord.snapshot().pressure)return quality;
   // Gate optional work before lowering quality, clear only after successful restoration.
   if(target===1&&!slow){if(!coord.signal('GM06','render-slow',rev++))return quality;slow=true;}
   if(target!==quality){try{const result=apply(target);if(result===false)return quality;if(result!==true){if(result&&typeof result.then==='function')Promise.resolve(result).catch(()=>{});uncertain=true;return quality;}}catch{uncertain=true;return quality;}quality=target;changes++;low=high=0;}
   if(target===2&&slow){if(coord.signal('GM06','render-normal',rev++))slow=false;}
   return quality;
  }finally{busy=false;}
 }
 return Object.freeze({sample,reset(){low=high=0;},snapshot:()=>({quality,slow,changes,uncertain})});
}
// Event-only recovery for the existing scratch owner. No new resource allocation.
function bindCanvasRecovery({canvas,context,owner,report=()=>{}}){
 if(!canvas||!context||typeof context.isContextLost!=='function'||typeof owner.close!=='function'||typeof owner.recover!=='function')return null;
 let lost=true,closed=false,recovering=false,uncertain=false;try{lost=context.isContextLost()!==false}catch{}
 function note(code){try{const r=report('GM06',code);if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>{})}catch{}}
 function onLost(){if(closed||lost)return;lost=true;note('fallback');}
 function attest(fn){const r=fn();if(r===true||r===false)return r;if(r&&typeof r.then==='function')Promise.resolve(r).catch(()=>{});uncertain=true;return false;}
 function onRestore(){if(closed||!lost||recovering||uncertain)return;recovering=true;try{if(context.isContextLost()!==false)return;const clean=attest(()=>owner.close());const ok=clean||(!uncertain&&attest(()=>owner.recover()));if(ok&&!closed&&context.isContextLost()===false)lost=false;else note('cleanup-uncertain');}catch{uncertain=true;note('cleanup-uncertain')}finally{recovering=false}}
 canvas.addEventListener('contextlost',onLost);canvas.addEventListener('contextrestored',onRestore);
 return Object.freeze({ready:()=>{if(closed||lost||recovering)return false;try{if(context.isContextLost()===false)return true;}catch{}onLost();return false},retry:onRestore,close(){if(closed)return false;closed=true;canvas.removeEventListener('contextlost',onLost);canvas.removeEventListener('contextrestored',onRestore);return true;}});
}

// Optional native input; bind receive() only to a validated TWA channel, never a global.
// seq is channel-local, now() is the receiving document's monotonic clock in ms.
// No timer, array, persistent storage, user/device identifier, or per-frame allocation.
function createThermalInput({now=()=>performance.now()}={}){
 let seq=-1,received=-Infinity,hot=false,critical=false,coolSince=-1,lastCool=-1,known=false,lastRequest=-Infinity;
 function clock(){try{const t=now();return Number.isFinite(t)&&t>=0?t:NaN;}catch{return NaN;}}
 function receive(n,status,headroom=null){
  const t=clock();
  if(!Number.isSafeInteger(n)||n<0||n<=seq||!Number.isFinite(t)||t<received||
    !(status===null||(Number.isInteger(status)&&status>=0&&status<=6))||
    !(headroom===null||(Number.isFinite(headroom)&&headroom>=0)))return false;
  if(status===null&&headroom===null)return false;
  seq=n;received=t;known=headroom!==null||(status!==null&&status>0);
  const danger=status>=3||(headroom!==null&&headroom>=1);
  const warning=status>=2||(headroom!==null&&headroom>=0.85);
  if(danger||warning){hot=true;critical=danger;coolSince=lastCool=-1;return true;}
  // Require a valid headroom for positive cooling evidence; NONE alone can be stuck.
  const cool=headroom!==null&&headroom<=0.65&&(status===null||status<=1);
  if(hot){
   if(!cool){coolSince=lastCool=-1;return true;}
   if(coolSince<0||t-lastCool>45000)coolSince=t;
   lastCool=t;
   if(t-coolSince>=30000){hot=false;critical=false;coolSince=lastCool=-1;}
  }
  return true;
 }
 function hint(){
  const t=clock();
  if(hot)return critical?'critical':'warm'; // lost source never authorizes recovery after heat
  return known&&Number.isFinite(t)&&t>=received&&t-received<=45000?'normal':'unknown';
 }
 // A new validated channel may restart sequence numbering but must not clear a heat latch.
 function reconnect(){seq=-1;received=-Infinity;known=false;coolSince=lastCool=-1;}
 // Piggyback on existing visible FPS window, only if a validated channel is connected.
 function shouldRequest(visible,connected){const t=clock();if(visible!==true||connected!==true||!Number.isFinite(t)||t-lastRequest<15000)return false;lastRequest=t;return true;}
 return Object.freeze({receive,hint,reconnect,shouldRequest});
}

return Object.freeze({createAdaptive,bindCanvasRecovery,createThermalInput});
})();

return Object.freeze({...m0,...m6,...m7,...m8,...m9});
})();
