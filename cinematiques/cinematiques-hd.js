/* ============================================================================
   CASTAWAY MINER — MODULE CINÉMATIQUES VIDÉO CINÉMA + HD (v36)
   - Joue automatiquement les VRAIES VIDÉOS (.mp4 / .webm) placées dans
     cinematiques/video/ (personnages en mouvement, actions cinéma).
   - Si une vidéo n'est pas encore ajoutée pour une scène, bascule
     automatiquement sur l'image HD correspondante dans cinematiques/img/
     avec mouvements de caméra, effets de panne, fumée et teinte planétaire.

   Intégration : placer le dossier "cinematiques/" à côté de index.html et
   ajouter juste avant </body> :
     <script src="cinematiques/cinematiques-hd.js"></script>
   ============================================================================ */
(function(){
  if(typeof SHOT==='undefined' || typeof cx==='undefined'){
    console.warn('[CinematiquesHD] Jeu non détecté (SHOT ou cx manquant).');
    return;
  }

  const _cs = document.currentScript;
  const ROOT = (_cs && _cs.src)
    ? _cs.src.replace(/[^\/?#]+([?#].*)?$/, '')
    : 'cinematiques/';
  const IMG_BASE = ROOT + 'img/';
  const VID_BASE = ROOT + 'video/';

  const SCENES = [
    'home','cruise','cockpit','impact','panic','entry','wake','wake_hero',
    'launch','hyper','earth','land','run','hug','sea',
    'video_birthday','video_garden'
  ];

  // Vidéos réellement présentes dans video/ (évite des erreurs 404 inutiles).
  // Suffixe -m = version héros, -f = version héroïne, sans suffixe = pour les deux.
  const VIDEO_FILES = ['cockpit-m','panic-f','cruise','home-m'];
  const isFem = () => { try{ return typeof FEM === 'function' && FEM(); }catch(e){ return false; } };
  function vidKeyFor(key){
    const g = isFem() ? '-f' : '-m';
    if(VIDEO_FILES.indexOf(key + g) >= 0) return key + g;
    if(VIDEO_FILES.indexOf(key) >= 0) return key;
    return null; // pas de vidéo (ou seulement celle de l'autre personnage) -> image HD
  }

  const ORIG_SHOT = Object.assign({}, SHOT);
  const ORIG_DRAW_VIDEO = typeof window.drawVideo === 'function' ? window.drawVideo : null;

  // --- 1. Préchargement des images HD (secours immédiat) ---
  const IMG = {};
  for(const k of SCENES){
    if(k === 'run') continue;
    const im = new Image();
    im.decoding = 'async';
    im.src = IMG_BASE + k + '.jpg';
    IMG[k] = im;
  }

  // --- 2. Moteur de lecture vidéo HTML5 (<video> -> canvas) ---
  const VID = {};
  let activeVidKey = null;

  // Volume des vidéos = réglage « Effets sonores » du jeu (0 = muet)
  function vidVolume(){
    try{ return Math.max(0, Math.min(1, (typeof META!=='undefined' && META.set && META.set.sfx!=null) ? META.set.sfx : 1)); }catch(e){ return 1; }
  }
  // Baisse la musique du jeu pendant une vidéo parlée, la remet après
  let musDucked = false;
  function duckMusic(on){
    try{
      if(typeof AU==='undefined' || !AU.mus || typeof META==='undefined') return;
      if(on === musDucked) return;
      musDucked = on;
      AU.mus.gain.value = on ? META.set.music*.5*0.15 : META.set.music*.5;
    }catch(e){}
  }

  function initVideo(key){
    if(VID[key]) return VID[key];
    const v = document.createElement('video');
    v.muted = false; // voix et bruitages natifs de la vidéo
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.loop = false;  // le film se joue une fois ; à la fin on garde la dernière image
    v.preload = 'metadata';
    const rec = { el: v, ok: false, failed: false, triedWebm: false, lastShotT: 999, forcedMute: false };
    v.addEventListener('loadeddata', () => { rec.ok = true; rec.failed = false; });
    v.addEventListener('ended', () => { if(activeVidKey === key) duckMusic(false); });
    v.addEventListener('error', () => {
      if(!rec.triedWebm){
        rec.triedWebm = true;
        v.src = VID_BASE + key + '.webm';
        v.load();
      } else {
        rec.failed = true;
        rec.ok = false;
      }
    });
    v.src = VID_BASE + key + '.mp4';
    VID[key] = rec;
    return rec;
  }

  for(const k of VIDEO_FILES){ initVideo(k); }

  function pauseAllVideos(exceptKey){
    for(const k in VID){
      if(k === exceptKey) continue;
      const v = VID[k].el;
      if(!v.paused){ try{ v.pause(); }catch(e){} }
    }
    if(!exceptKey) duckMusic(false);
  }

  function getVideo(key0, t){
    const key = vidKeyFor(key0);
    if(!key) return null;
    const rec = VID[key];
    if(!rec || rec.failed) return null;
    const v = rec.el;
    if(activeVidKey !== key || t < rec.lastShotT - 0.25){
      pauseAllVideos(key);
      activeVidKey = key;
      if(rec.ok){
        try{ v.currentTime = 0; }catch(e){}
      }
    }
    rec.lastShotT = t;
    const vol = vidVolume();
    v.volume = vol;
    if(!rec.forcedMute) v.muted = (vol <= 0);
    // ne relance PAS une vidéo terminée (sinon elle reboucle avec le son)
    if(v.paused && !v.ended && v.readyState >= 2){
      const p = v.play();
      if(p && p.catch) p.catch(() => {
        // le navigateur refuse le son sans geste du joueur : on rejoue sans le son
        rec.forcedMute = true; v.muted = true;
        const p2 = v.play(); if(p2 && p2.catch) p2.catch(()=>{});
      });
    }
    duckMusic(!v.muted && !v.ended);
    return (rec.ok && v.readyState >= 2 && v.videoWidth > 0) ? v : null;
  }

  // Dès que le joueur touche l'écran, les vidéos coupées faute de geste retrouvent le son
  document.addEventListener('pointerdown', () => {
    for(const k in VID){ const r = VID[k]; if(r.forcedMute){ r.forcedMute = false; if(vidVolume() > 0) r.el.muted = false; } }
  }, { passive: true });

  if(typeof window.setMode === 'function'){
    const origSetMode = window.setMode;
    window.setMode = function(m){
      if(m !== 'cine' && m !== 'tx'){
        pauseAllVideos(null);
        activeVidKey = null;
      }
      return origSetMode.apply(this, arguments);
    };
  }

  // Un plan qui a une vraie vidéo dure au moins la durée de la vidéo,
  // et ses sous-titres sont répartis sur toute la vidéo (au prorata de la longueur des répliques)
  const VTIME = {};
  if(typeof FILMS === 'object'){
    for(const kind of Object.keys(FILMS)){
      const orig = FILMS[kind];
      FILMS[kind] = function(){
        const shots = orig.apply(this, arguments);
        try{
          for(const sh of shots){
            const k = vidKeyFor(sh.v); const r = k && VID[k];
            if(!r || r.failed) continue;
            const d = r.el.duration > 0 ? r.el.duration : 10; // les films Gemini font 10 s
            sh.min = Math.max(sh.min || 0, d + (sh.pre || 0));
            const chars = sh.lines.reduce((n, l) => n + String(l[1] || '').length, 0) || 1;
            VTIME[k] = { dur: Math.max(1, d - (sh.pre || 0) - 0.35 * sh.lines.length), chars };
          }
        }catch(e){}
        return shots;
      };
    }
  }

  // Coupe la voix synthétique du navigateur quand une vraie vidéo parlée joue,
  // tout en laissant les sous-titres (#sub) s'afficher dans les 9 langues
  if(typeof window.speak === 'function'){
    const origSpeak = window.speak;
    window.speak = function(text, who, onEnd){
      const r = activeVidKey && VID[activeVidKey];
      if(r && r.ok && !r.el.muted && !r.el.ended){
        const vt = VTIME[activeVidKey];
        const ms = vt ? vt.dur * 1000 * text.length / vt.chars : text.length * 55;
        if(onEnd) setTimeout(onEnd, Math.max(1500, ms));
        return true;
      }
      return origSpeak.apply(this, arguments);
    };
  }

  function readyImg(key){
    const im = IMG[key];
    return im && im.complete && im.naturalWidth > 0 ? im : null;
  }

  function drawMedia(media, w, h, zoom, panX, panY, rot){
    const iw = media.videoWidth || media.naturalWidth;
    const ih = media.videoHeight || media.naturalHeight;
    if(!iw || !ih) return;
    const baseScale = Math.max(w / iw, h / ih);
    const sc = baseScale * (zoom || 1);
    const dw = iw * sc, dh = ih * sc;
    cx.save();
    cx.translate(w * 0.5 + (panX || 0) * w, h * 0.5 + (panY || 0) * h);
    if(rot) cx.rotate(rot);
    cx.drawImage(media, -dw * 0.5, -dh * 0.5, dw, dh);
    cx.restore();
  }

  function drawScene(keys, t, zoom, panX, panY, rot){
    const list = Array.isArray(keys) ? keys : [keys];
    for(const k of list){
      const v = getVideo(k, t);
      if(v){
        drawMedia(v, W, H, 1.02, 0, 0, rot ? rot * 0.4 : 0);
        return 'video';
      }
    }
    for(const k of list){
      const im = readyImg(k);
      if(im){
        drawMedia(im, W, H, zoom, panX, panY, rot);
        return 'image';
      }
    }
    return null;
  }

  function planetTint(planet, alpha){
    if(!planet) return;
    const g = planet.ground || [132,86,60];
    const s1 = planet.sky ? planet.sky[1] : '#7a3426';
    cx.save();
    cx.globalCompositeOperation = 'color';
    cx.globalAlpha = alpha || 0.35;
    const gr = cx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, s1);
    gr.addColorStop(1, 'rgb(' + g[0] + ',' + g[1] + ',' + g[2] + ')');
    cx.fillStyle = gr;
    cx.fillRect(0, 0, W, H);
    cx.globalCompositeOperation = 'soft-light';
    cx.globalAlpha = (alpha || 0.35) * 0.7;
    cx.fillRect(0, 0, W, H);
    cx.restore();
  }

  function spawnDust(F, dt, rate, color, vyMin, vyMax, rMin, rMax, add){
    if(Math.random() < dt * rate){
      F.p.push({
        x: rnd(0, W), y: vyMin < 0 ? rnd(H * 0.25, H * 1.05) : rnd(-10, H * 0.8),
        vx: rnd(-18, 18), vy: rnd(vyMin, vyMax),
        life: rnd(1.4, 3.0), l0: 3.0, c: color, r: rnd(rMin, rMax), gr: 0, add: !!add
      });
    }
  }

  function travelIncidentFX(t, dt, F){
    const idx = (typeof FILMARG !== 'undefined' && FILMARG && FILMARG.from !== undefined) ? Math.min(FILMARG.from, 8) : -1;
    if(idx < 0) return;
    cx.save();
    if(idx === 0){
      const g = cx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.22, W/2, H/2, Math.max(W,H)*0.72);
      g.addColorStop(0, 'rgba(140,225,255,0)');
      g.addColorStop(1, 'rgba(150,230,255,' + (0.35 + 0.15*Math.sin(t*4)) + ')');
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      spawnDust(F, dt, 22, '#d8f6ff', 15, 50, 1.2, 3, true);
    } else if(idx === 1){
      if(Math.sin(t*19) > 0.55){ cx.fillStyle = 'rgba(0,0,0,0.45)'; cx.fillRect(0, 0, W, H); }
      cx.fillStyle = 'rgba(111,227,255,0.22)';
      for(let i=0;i<6;i++) cx.fillRect(0, rnd(0,H), W, rnd(2,8));
    } else if(idx === 2){
      const fl = cx.createRadialGradient(W*0.75, H*0.25, 10, W*0.75, H*0.25, Math.max(W,H)*0.85);
      fl.addColorStop(0, 'rgba(255,245,190,' + (0.45 + 0.25*Math.sin(t*8)) + ')');
      fl.addColorStop(0.5, 'rgba(255,140,40,0.25)');
      fl.addColorStop(1, 'rgba(255,80,0,0)');
      cx.globalCompositeOperation = 'lighter';
      cx.fillStyle = fl; cx.fillRect(0, 0, W, H);
    } else if(idx === 3){
      const bk = cx.createRadialGradient(W*0.5, H*0.42, Math.min(W,H)*0.08, W*0.5, H*0.42, Math.max(W,H)*0.75);
      bk.addColorStop(0, 'rgba(0,0,0,0.55)');
      bk.addColorStop(0.35, 'rgba(110,60,220,0.28)');
      bk.addColorStop(1, 'rgba(0,0,0,0.7)');
      cx.fillStyle = bk; cx.fillRect(0, 0, W, H);
    } else if(idx === 7){
      if(Math.random() < dt * 3.5){
        cx.fillStyle = 'rgba(200,235,255,0.55)'; cx.fillRect(0, 0, W, H);
        cx.strokeStyle = '#d8f4ff'; cx.lineWidth = 3;
        cx.beginPath(); let lx = rnd(W*0.2, W*0.8), ly = 0; cx.moveTo(lx, ly);
        for(let s=0;s<6;s++){ lx += rnd(-45,45); ly += H/6; cx.lineTo(lx, ly); }
        cx.stroke();
        F.shake = Math.max(F.shake, 9);
      }
    } else {
      spawnDust(F, dt, 24, '#ffae42', -80, -25, 1.2, 3, true);
    }
    cx.restore();
  }

  SHOT.home = function(t, dt, F){
    const k = clamp(t / 14, 0, 1);
    const kind = drawScene('home', t, 1.04 + k * 0.12, -0.02 + k * 0.03, 0.01 - k * 0.02);
    if(!kind) return ORIG_SHOT.home(t, dt, F);
    if(kind === 'image'){
      cx.save(); cx.globalCompositeOperation = 'lighter';
      const sun = cx.createRadialGradient(W*0.28, H*0.18, 10, W*0.28, H*0.18, W*0.7);
      sun.addColorStop(0, 'rgba(255,215,140,' + (0.14 + 0.04*Math.sin(t*1.5)) + ')');
      sun.addColorStop(1, 'rgba(255,160,70,0)');
      cx.fillStyle = sun; cx.fillRect(0, 0, W, H); cx.restore();
      spawnDust(F, dt, 10, '#ffe3a8', -22, -6, 1.2, 2.8, true);
      fPart(F, dt);
    }
  };

  SHOT.cruise = function(t, dt, F){
    const k = clamp(t / 12, 0, 1);
    const kind = drawScene(['cruise','impact'], t, 1.04 + k * 0.14, 0.03 - k * 0.06, Math.sin(t*0.6)*0.008);
    if(!kind) return ORIG_SHOT.cruise(t, dt, F);
    if(kind === 'image'){ spawnDust(F, dt, 8, '#bfefff', -12, 12, 0.8, 1.8, true); fPart(F, dt); }
  };

  SHOT.cockpit = function(t, dt, F){
    const red = t > 0.7;
    const k = clamp(t / 8, 0, 1);
    const kind = drawScene(['cockpit','panic'], t, 1.06 + k * 0.14, Math.sin(t*1.8)*0.008, -0.01 + k*0.02);
    if(!kind) return ORIG_SHOT.cockpit(t, dt, F);
    if(red){
      if(!F.al || t - F.al > 0.58){ F.al = t; AU.alarm && AU.alarm(); }
      cx.fillStyle = 'rgba(255,20,20,' + (0.12 + 0.14 * Math.abs(Math.sin(t * 7))) + ')';
      cx.fillRect(0, 0, W, H);
      F.shake = Math.max(F.shake, 2.5);
    }
    travelIncidentFX(t, dt, F);
    if(kind === 'image') spawnDust(F, dt, red ? 20 : 6, red ? '#ffcf70' : '#7ae8ff', 20, 120, 1, 2.5, true);
    fPart(F, dt);
  };

  SHOT.impact = function(t, dt, F){
    const k = clamp(t / 6, 0, 1);
    const rot = t > 1.4 ? Math.sin(t * 2.5) * 0.03 : 0;
    const kind = drawScene('impact', t, 1.06 + k * 0.22, 0.02 - k * 0.05, -0.02 + k * 0.04, rot);
    if(!kind) return ORIG_SHOT.impact(t, dt, F);
    const hits = [1.4, 2.2, 3.0, 3.8];
    F.hi = F.hi || 0;
    if(F.hi < hits.length && t > hits[F.hi]){
      fBoom(F, W * rnd(0.28, 0.72), H * rnd(0.32, 0.65), 0.9 + Math.random()*0.5);
      F.hi++;
    }
    if(t > 1.4){
      if(kind === 'image') spawnDust(F, dt, 35, '#ff9d3b', -90, 90, 1.2, 3.2, true);
      F.shake = Math.max(F.shake, 4.5);
    }
    fExpl(F, dt); fPart(F, dt);
  };

  SHOT.panic = function(t, dt, F){
    const k = clamp(t / 8, 0, 1);
    const kind = drawScene('panic', t, 1.06 + k * 0.16, -0.02 + k * 0.04, 0.01 - k * 0.02, Math.sin(t*3)*0.012);
    if(!kind) return ORIG_SHOT.panic(t, dt, F);
    const red = (kind === 'video' ? 0.07 : 0.12) + 0.14 * Math.abs(Math.sin(t * 7.5));
    cx.fillStyle = 'rgba(255,20,10,' + red + ')';
    cx.fillRect(0, 0, W, H);
    if(kind === 'image' && Math.random() < dt * 24){
      const sx = rnd(W*0.55, W*0.95), sy = rnd(H*0.45, H*0.8);
      for(let i=0;i<5;i++){
        F.p.push({x:sx, y:sy, vx:rnd(-160,120), vy:rnd(-100,180), g:360, life:rnd(0.25,0.6), l0:0.6, c:Math.random()<0.4?'#7ae8ff':'#ffd27a', r:rnd(1.2,2.6), add:1});
      }
    }
    if(!F.al || t - F.al > 0.6){ F.al = t; AU.alarm && AU.alarm(); }
    F.shake = Math.max(F.shake, 3.2);
    travelIncidentFX(t, dt, F);
    fPart(F, dt);
  };

  SHOT.entry = function(t, dt, F){
    const k = clamp(t / 4.5, 0, 1);
    const kind = drawScene('entry', t, 1.06 + k * 0.24, -0.03 + k * 0.06, -0.04 + k * 0.08, 0.02*Math.sin(t*8));
    if(!kind) return ORIG_SHOT.entry(t, dt, F);
    const dest = PLANETS[(typeof FILMARG !== 'undefined' && FILMARG && FILMARG.to !== undefined) ? FILMARG.to : 0];
    if(dest && (typeof FILMARG !== 'undefined' && FILMARG && FILMARG.to > 0)) planetTint(dest, 0.34);
    if(kind === 'image'){
      for(let i=0;i<3;i++){
        if(Math.random() < dt * 32){
          F.p.push({x:rnd(0,W), y:rnd(0,H), vx:rnd(-320,-160), vy:rnd(-240,-100), life:rnd(0.2,0.45), l0:0.45, c:'#ffb84d', r:rnd(1.2,2.6), add:1});
        }
      }
      fPart(F, dt);
    }
    F.shake = Math.max(F.shake, 3 + k * 9);
    if(!F.rm || t - F.rm > 0.65){ F.rm = t; AU.tone && AU.tone(58 + Math.random()*28, 0.6, 'sawtooth', 0.08, 38); }
  };

  SHOT.crash = function(t, dt, F){
    if(!F.cr){ F.cr = 1; AU.boom && AU.boom(); setTimeout(()=>AU.boom && AU.boom(), 180); F.shake = 26; }
    if(t < 0.55){
      const kind = drawScene('entry', t + 3, 1.35 + t*0.5, 0, 0);
      if(!kind){ cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H); }
    } else {
      cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
    }
    const a = t < 0.22 ? t / 0.22 : Math.max(0, 1 - (t - 0.22) / 1.35);
    cx.fillStyle = 'rgba(255,240,210,' + a + ')';
    cx.fillRect(0, 0, W, H);
    if(t > 0.25 && Math.random() < dt * 18){
      F.p.push({x:rnd(0,W), y:rnd(H*0.4,H), vx:rnd(-30,30), vy:rnd(-60,-15), life:rnd(0.8,1.8), l0:1.8, c:'#ff8a3d', r:rnd(1.5,3.5), add:1});
    }
    fPart(F, dt);
  };

  SHOT.black = function(t, dt, F){ pauseAllVideos(null); activeVidKey = null; ORIG_SHOT.black(t, dt, F); };

  function drawWakeHD(t, dt, F, planet, isTitle){
    const k = clamp(t / 12, 0, 1);
    const kind = drawScene(['wake','wake_hero'], t, 1.03 + k * 0.13, -0.02 + k * 0.04, 0.015 - k * 0.02);
    if(!kind) return isTitle ? ORIG_SHOT.title(t, dt, F) : ORIG_SHOT.wake(t, dt, F);
    if(planet && planet.n !== 'Kepra-7') planetTint(planet, 0.42);
    if(kind === 'image'){
      if(Math.random() < dt * 12){
        F.p.push({x:W*rnd(0.45,0.75), y:H*rnd(0.28,0.45), vx:rnd(-8,12), vy:rnd(-32,-14), life:rnd(2,3.5), l0:3.5, c:'rgba(35,28,28,0.45)', r:rnd(12,26), gr:10});
      }
      const dc = (planet && planet.dc) ? ('rgb(' + planet.dc + ')') : '#ffd2a0';
      spawnDust(F, dt, 14, dc, -16, 12, 1, 2.4, true);
      fPart(F, dt);
    }
  }

  SHOT.wake = function(t, dt, F){ drawWakeHD(t, dt, F, PLANETS[0], false); };
  SHOT.arrive = function(t, dt, F){
    const dest = PLANETS[(typeof FILMARG !== 'undefined' && FILMARG && FILMARG.to !== undefined) ? FILMARG.to : 1];
    drawWakeHD(t, dt, F, dest, false);
  };
  SHOT.title = function(t, dt, F){
    drawWakeHD(t + 4, dt, F, PLANETS[0], true);
    cx.fillStyle = 'rgba(4,3,10,' + Math.min(0.62, t * 0.35) + ')';
    cx.fillRect(0, 0, W, H);
    const a = clamp((t - 0.35) / 1.1, 0, 1);
    cx.save(); cx.globalAlpha = a; cx.textAlign = 'center';
    const fs = Math.round(Math.min(W * 0.115, 54));
    cx.font = '900 ' + fs + 'px system-ui';
    const tg = cx.createLinearGradient(0, H*0.35, 0, H*0.52);
    tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.55, '#ffd88a'); tg.addColorStop(1, '#ff9234');
    cx.fillStyle = tg; cx.shadowColor = 'rgba(255,140,40,0.85)'; cx.shadowBlur = 28;
    cx.fillText('CASTAWAY', W/2, H*0.42);
    cx.fillText('MINER', W/2, H*0.42 + fs * 1.06);
    cx.shadowBlur = 0; cx.font = '700 13px system-ui';
    cx.fillStyle = 'rgba(170,235,255,' + clamp((t - 1.3) / 1, 0, 1) + ')';
    cx.fillText(_t('DIX PLANÈTES · UNE PROMESSE'), W/2, H*0.42 + fs * 1.88);
    cx.restore();
  };

  SHOT.launch = function(t, dt, F){
    const fromP = PLANETS[(typeof FILMARG !== 'undefined' && FILMARG && FILMARG.from !== undefined) ? FILMARG.from : 0];
    const k = clamp(t / 5, 0, 1);
    const kind = drawScene(['launch','entry'], t, 1.16 - k * 0.12, 0, 0.05 - k * 0.10);
    if(!kind) return ORIG_SHOT.launch(t, dt, F);
    if(fromP && fromP.n !== 'Kepra-7') planetTint(fromP, 0.40);
    if(kind === 'image'){
      if(Math.random() < dt * 36){
        F.p.push({x:W*0.5+rnd(-90,90), y:H*0.84, vx:rnd(-130,130), vy:rnd(-45,-8), life:rnd(0.9,1.8), l0:1.8, c:'#ffc978', r:rnd(3,9), gr:10, add:1});
      }
      fPart(F, dt);
    }
    F.shake = Math.max(F.shake, k < 0.75 ? 4.5 : 1.5);
  };

  SHOT.hyper = function(t, dt, F){
    if(!F.mu){ F.mu = 1; AU.startMusic && AU.startMusic(); }
    const k = clamp(t / 5, 0, 1);
    const kind = drawScene(['hyper','cruise'], t, 1.03 + k * 0.25, 0, 0, Math.sin(t*1.5)*0.01);
    if(!kind) return ORIG_SHOT.hyper(t, dt, F);
    if(kind === 'image'){
      cx.save(); cx.globalCompositeOperation = 'lighter'; cx.strokeStyle = 'rgba(150,230,255,0.35)';
      for(let i=0;i<16;i++){
        const ang = (i / 16) * Math.PI * 2 + t * 0.15;
        const r0 = ((t * 420 + i * 73) % (Math.max(W,H) * 0.7)) + 30;
        cx.lineWidth = 1.5; cx.beginPath();
        cx.moveTo(W/2 + Math.cos(ang)*r0, H*0.48 + Math.sin(ang)*r0);
        cx.lineTo(W/2 + Math.cos(ang)*(r0+80), H*0.48 + Math.sin(ang)*(r0+80));
        cx.stroke();
      }
      cx.restore();
    }
  };

  SHOT.earth = function(t, dt, F){
    const k = clamp(t / 8, 0, 1);
    const kind = drawScene('earth', t, 1.03 + k * 0.14, 0.01 - k * 0.02, 0.01 - k * 0.02);
    if(!kind) return ORIG_SHOT.earth(t, dt, F);
  };

  SHOT.land = function(t, dt, F){
    const k = clamp(t / 7, 0, 1);
    const kind = drawScene(['land','home'], t, 1.12 - k * 0.08, -0.01 + k * 0.02, -0.03 + k * 0.05);
    if(!kind) return ORIG_SHOT.land(t, dt, F);
    if(kind === 'image'){ spawnDust(F, dt, 16, '#9beeff', -25, -5, 1.5, 4, true); fPart(F, dt); }
  };

  SHOT.run = function(t, dt, F){
    const k = clamp(t / 5, 0, 1);
    const kind = drawScene(['run','hug','land','home'], t, 1.04 + k * 0.16, 0.02 - k * 0.02, 0.02 - k * 0.03);
    if(!kind) return ORIG_SHOT.run(t, dt, F);
    if(kind === 'image'){ spawnDust(F, dt, 10, '#ffd88a', -18, -4, 1.5, 3.2, true); fPart(F, dt); }
  };

  SHOT.hug = function(t, dt, F){
    const k = clamp(t / 9, 0, 1);
    const kind = drawScene(['hug','home'], t, 1.08 + k * 0.16, 0, 0.01 - k * 0.03);
    if(!kind) return ORIG_SHOT.hug(t, dt, F);
    if(t > 1.5 && Math.random() < dt * 3.0){
      F.p.push({x:W*0.5+rnd(-W*0.25,W*0.25), y:H*0.62, vx:rnd(-12,12), vy:rnd(-45,-20), life:2.4, l0:2.4, c:'#ff7eb3', r:4, heart:1});
    }
    for(const q of F.p){
      if(!q.heart) continue;
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt;
      cx.globalAlpha = clamp(q.life / 2.4, 0, 0.85);
      cx.fillStyle = q.c; cx.font = '18px system-ui'; cx.textAlign = 'center';
      cx.fillText('♥', q.x, q.y);
    }
    cx.globalAlpha = 1; F.p = F.p.filter(q => q.life > 0);
  };

  SHOT.sea = function(t, dt, F){
    const k = clamp(t / 8, 0, 1);
    const kind = drawScene(['sea','home'], t, 1.04 + k * 0.12, -0.02 + k * 0.04, Math.sin(t*1.2)*0.005);
    if(!kind) return ORIG_SHOT.sea(t, dt, F);
  };

  window.drawVideo = function(sc, w, h, t){
    const key = sc === 'birthday' ? 'video_birthday' : (sc === 'garden' ? 'video_garden' : null);
    const media = key ? (getVideo(key, t) || readyImg(key) || (sc === 'garden' ? readyImg('home') : null)) : null;
    if(!media){
      if(ORIG_DRAW_VIDEO) return ORIG_DRAW_VIDEO(sc, w, h, t);
      return;
    }
    const isVid = !!media.videoWidth;
    const iw = media.videoWidth || media.naturalWidth;
    const ih = media.videoHeight || media.naturalHeight;
    const baseScale = Math.max(w / iw, h / ih);
    const sc2 = baseScale * (isVid ? 1.01 : (1.03 + 0.025 * Math.sin(t * 0.4)));
    const dw = iw * sc2, dh = ih * sc2;
    cx.save();
    cx.drawImage(media, (w - dw)/2 + (isVid ? 0 : Math.sin(t*0.7)*4), (h - dh)/2 + (isVid ? 0 : Math.cos(t*0.5)*2), dw, dh);
    cx.restore();
    cx.fillStyle = 'rgba(255,70,70,' + (0.5 + 0.5*Math.sin(t*5)) + ')';
    cx.beginPath(); cx.arc(16, 16, 4, 0, 7); cx.fill();
    cx.fillStyle = 'rgba(220,245,255,0.85)';
    cx.font = '700 10px monospace';
    cx.fillText('ORION-CAM · LIVE', 26, 19);
  };

  console.log('[CinematiquesHD v36] Mode Vidéo Cinéma (.mp4/.webm) + secours HD 16 images prêt.');
})();
