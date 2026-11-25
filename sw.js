// Service worker : le jeu marche sans Internet, et se met à jour tout seul dès qu'une nouvelle version est en ligne.
const CACHE='mineur-v40';
const FILES=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./icon-maskable-512.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>new Request(f,{cache:'reload'})))));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{const req=e.request;if(req.method!=='GET')return;
  if(/\.(mp4|webm)(\?|$)/.test(req.url)||req.headers.has('range'))return; // vidéos : lues en streaming, jamais mises en cache
  const isPage=req.mode==='navigate'||req.url.endsWith('/')||req.url.endsWith('.html');
  if(isPage){// page du jeu : toujours la version en ligne d'abord, la copie locale seulement hors connexion
    e.respondWith(fetch(req,{cache:'no-store'}).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy));return res;}).catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));return;}
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>{if(res.ok&&res.status===200){const copy=res.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});}return res;})));});
