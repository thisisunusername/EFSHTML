/* ================= 画布基础 ================= */
var cv = document.getElementById('cv');
var ctx = cv.getContext('2d');
var CW = 360, CH = 640, DPR = 1;

/* 世界坐标约定：格子(ix,iy) 的中心 = (ix+0.5, iy+0.5)，全项目统一 */
function resize(){
  DPR = Math.min(window.devicePixelRatio||1, 2);
  CW = window.innerWidth || 360;
  CH = window.innerHeight || 640;
  cv.width = Math.floor(CW*DPR);
  cv.height = Math.floor(CH*DPR);
  cv.style.width = CW+'px';
  cv.style.height = CH+'px';
  ctx.setTransform(DPR,0,0,DPR,0,0);
  mapCache.key='';
}

/* ================= 静态地图缓存 ================= */
var mapCache = {key:'', cv:null, w:0, h:0};

function buildMapCache(f, px){
  var w = Math.max(1, Math.round(f.w*px));
  var h = Math.max(1, Math.round(f.h*px));
  var c = document.createElement('canvas');
  c.width=w; c.height=h;
  var g = c.getContext('2d');
  var sx = w/f.w, sy = h/f.h;

for(var y=0;y<f.h;y++){
     for(var x=0;x<f.w;x++){
       if(f.g[y][x]===1) continue;
       g.fillStyle = ((x+y)%2===0) ? '#243139' : '#202c34';
       g.fillRect(x*sx, y*sy, sx+0.7, sy+0.7);
     }
   }
   /* 地面格线：把地砖一格一格分清楚（跳过一回合时按格计算才看得懂） */
   g.strokeStyle='rgba(120,180,235,.13)';
   g.lineWidth=1;
   for(var gy=0;gy<=f.h;gy++){
     g.beginPath(); g.moveTo(0, Math.round(gy*sy)+.5); g.lineTo(w, Math.round(gy*sy)+.5); g.stroke();
   }
   for(var gx=0;gx<=f.w;gx++){
     g.beginPath(); g.moveTo(Math.round(gx*sx)+.5, 0); g.lineTo(Math.round(gx*sx)+.5, h); g.stroke();
   }
  for(var i=0;i<f.rooms.length;i++){
    var r=f.rooms[i];
    g.fillStyle = r.safe==='class' ? 'rgba(60,160,255,.11)'
                 : r.safe==='toilet'? 'rgba(80,220,180,.10)'
                 : 'rgba(120,160,220,.05)';
    g.fillRect((r.x0-1)*sx,(r.y0-1)*sy,(r.x1-r.x0+2)*sx,(r.y1-r.y0+2)*sy);
  }
  for(var yy=0;yy<f.h;yy++){
    for(var xx=0;xx<f.w;xx++){
if(f.g[yy][xx]!==1) continue;
       g.fillStyle = ((xx+yy)%2===0) ? '#37505f' : '#2e4553';
       g.fillRect(xx*sx, yy*sy, sx+0.7, sy+0.7);
       g.strokeStyle='rgba(150,200,240,.13)';
      g.lineWidth=1;
      g.strokeRect(xx*sx+.5, yy*sy+.5, Math.max(1,sx-1), Math.max(1,sy-1));
    }
  }
  g.textAlign='center'; g.textBaseline='middle';
  for(var k=0;k<f.rooms.length;k++){
    var rm=f.rooms[k];
    var mx=(rm.x0+rm.x1)*0.5*sx, my=(rm.y0+rm.y1)*0.5*sy;
    g.font='600 '+Math.max(9,Math.min(13,sx*0.4))+'px -apple-system,"PingFang SC",sans-serif';
    g.fillStyle='rgba(200,225,255,.30)';
    g.fillText(rm.name, mx, my);
  }
  mapCache.key=f.key+'|'+w+'|'+h;
  mapCache.cv=c;
  return c;
}

/* ================= 视图 ================= */
var scale = 30;
var camX = 0, camY = 0;          /* 视口左上角在世界像素中的位置 */

/* 把坐标对齐到设备像素网格：亚像素圆心会让抗锯齿每帧重算，看起来就是抖动 */
function snapPx(v, dpr){
  var d = dpr || 1;
  return Math.round(v*d)/d;
}
var padTop = 96, padBot = 190;
var viewH = 400;

function computeView(){
  var f=fl(); if(!f) return;
  padTop = 96;
  padBot = (CH>620) ? 190 : 172;
  viewH = Math.max(140, CH-padTop-padBot);

  /* 视口大约显示 18 格：回合制下要能看清敌人的走位 */
  var tiles = 18;
  /* 经典模式：格子保持看得清（13 格视野），相机跟随玩家 */
  if(S.mode2==='classic'){ tiles = 13; }
  scale = Math.min(CW/tiles, viewH/tiles);
  scale = Math.max(12, Math.min(scale, 34));
  S._scale = scale;
  return f;
}

function camTarget(){
  var f=fl(); if(!f) return;
  var mapW=f.w*scale, mapH=f.h*scale;
  var tx, ty;
  var cx = S.px*scale, cy = S.py*scale;
  if(mapW<=CW) tx = -(CW-mapW)/2;
  else tx = clamp(cx-CW/2, 0, mapW-CW);
  if(mapH<=viewH) ty = -(viewH-mapH)/2;
  else ty = clamp(cy-viewH/2, 0, mapH-viewH);
  /* 平滑跟随 */
  if(S._noCam){ camX=tx; camY=ty; S._noCam=false; }
  else { camX += (tx-camX)*0.25; camY += (ty-camY)*0.25; }
  /* 对齐到设备像素：避免亚像素采样让角色眼睛/轮廓来回抖 */
  camX = snapPx(camX, DPR);
  camY = snapPx(camY, DPR);
}

function worldToScreen(wx,wy){
  return { x: wx*scale-camX, y: wy*scale-camY+padTop };
}

/* ================= 主绘制 ================= */
function drawAll(){
  ctx.setTransform(DPR,0,0,DPR,0,0);
  ctx.clearRect(0,0,CW,CH);
  /* 画布外的底色：柔和的青灰，不再是死黑的洞 */
  var bg=ctx.createRadialGradient(CW*0.5, CH*0.42, 0, CW*0.5, CH*0.42, Math.max(CW,CH)*0.85);
  bg.addColorStop(0,'#16222b');
  bg.addColorStop(0.62,'#111a21');
  bg.addColorStop(1,'#0b1216');
  ctx.fillStyle=bg; ctx.fillRect(0,0,CW,CH);

  var f = computeView(); if(!f) return;
  camTarget();

  var mapW=f.w*scale, mapH=f.h*scale;
  var need=f.key+'|'+Math.round(mapW)+'|'+Math.round(mapH);
  if(mapCache.key!==need || !mapCache.cv) buildMapCache(f, scale);

  ctx.save();
  ctx.translate(-camX, padTop-camY);
  if(mapCache.cv) ctx.drawImage(mapCache.cv, 0, 0, mapW, mapH);

  for(var o=0;o<f.objs.length;o++) drawObj(f.objs[o]);
  for(var n=0;n<S.npcs.length;n++){
    if(S.npcs[n].floor===S.floor) drawNpc(S.npcs[n]);
  }
  drawPlayer();
  ctx.restore();

  /* 地图边界光框 */
  ctx.strokeStyle='rgba(90,170,235,.18)'; ctx.lineWidth=1;
  ctx.strokeRect(-camX, padTop-camY, mapW, mapH);

  /* 地下层视野遮罩 */
  if(f.dark){
    var ps=worldToScreen(S.px,S.py);
    if(CHEAT.torchAll || (S.flashFloor===S.floor && S.flashOn)){
      /* 手电筒：这一层地下室的黑暗被整个照亮，只留一点点氛围 */
      var fl2=ctx.createRadialGradient(ps.x,ps.y,scale*6.0,ps.x,ps.y,scale*22.0);
      fl2.addColorStop(0,'rgba(0,0,0,0)');
      fl2.addColorStop(1,'rgba(0,0,0,.18)');
      ctx.fillStyle=fl2;
      ctx.fillRect(0,padTop-2,CW,viewH+4);
    } else {
      var rad=ctx.createRadialGradient(ps.x,ps.y,scale*1.4,ps.x,ps.y,scale*4.8);
      rad.addColorStop(0,'rgba(0,0,0,0)');
      rad.addColorStop(1,'rgba(0,0,0,.82)');
      ctx.fillStyle=rad;
      ctx.fillRect(0,padTop-2,CW,viewH+4);
    }
  } else if(CHEAT.torchAll || (S.flashFloor===S.floor && S.flashOn)){
    /* 在地上层用手电筒：额外提亮一点，不影响玩法 */
    ctx.save();
    ctx.fillStyle='rgba(255,240,200,.05)';
    ctx.fillRect(0,padTop-2,CW,viewH+4);
    ctx.restore();
  }

  drawOverlayHints(f);
}

function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

function drawObj(o){
  var x=o.x*scale, y=o.y*scale, s=scale;
  ctx.save();
  if(o.t==='item'){
    var it=ITEM[o.id];
    var bob=Math.sin(S.time*3+(o.x+o.y))*s*0.06;
    ctx.shadowColor=it.color; ctx.shadowBlur=14;
    ctx.fillStyle=it.color;
    ctx.beginPath(); ctx.arc(x,y+bob,s*0.30,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.font='700 '+(s*0.38)+'px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(it.icon, x, y+bob);
  } else if(o.t==='shop'){
    ctx.fillStyle='#f59e0b'; ctx.shadowColor='#f59e0b'; ctx.shadowBlur=12;
    roundRect(x-s*0.36,y-s*0.32,s*0.72,s*0.64,4); ctx.fill();
    ctx.shadowBlur=0;
    ctx.font='700 '+(s*0.4)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#1a1200'; ctx.fillText('¥', x, y);
  } else if(o.t==='craft'){
    ctx.fillStyle='#38bdf8'; ctx.shadowColor='#38bdf8'; ctx.shadowBlur=12;
    roundRect(x-s*0.34,y-s*0.34,s*0.68,s*0.68,4); ctx.fill();
    ctx.shadowBlur=0;
    ctx.font='700 '+(s*0.4)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#04222e'; ctx.fillText('⚙', x, y);
  } else if(o.t==='tree'){
    var done=!!(S.inv.wood && S.inv.blueprint);
    ctx.fillStyle=done?'#4b3a28':'#2f7d4f';
    ctx.shadowColor=done?'rgba(0,0,0,0)':'#2f7d4f'; ctx.shadowBlur=done?0:14;
    ctx.beginPath(); ctx.arc(x,y,s*0.34,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
    ctx.font=(s*0.34)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(done?'🪵':'🌳', x, y);
  } else if(o.t==='switch'){
    var on=!!S.sw[o.id];
    ctx.fillStyle=on?'#22c55e':'#64748b';
    ctx.shadowColor=on?'#22c55e':'rgba(0,0,0,0)'; ctx.shadowBlur=on?16:0;
    roundRect(x-s*0.27,y-s*0.32,s*0.54,s*0.64,3); ctx.fill();
    ctx.shadowBlur=0;
    ctx.strokeStyle='#0b1220'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(x,y-s*0.13); ctx.lineTo(x+(on?0:s*0.11), y+s*0.13); ctx.stroke();
  } else if(o.t==='stairs'){
    ctx.fillStyle='rgba(56,189,248,.20)';
    ctx.strokeStyle='rgba(120,220,255,.8)'; ctx.lineWidth=1.6;
    roundRect(x-s*0.42,y-s*0.42,s*0.84,s*0.84,5); ctx.fill(); ctx.stroke();
    ctx.font='700 '+(s*0.34)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#7ee0ff'; ctx.fillText(o.to==='B1'?'▼':'↕', x, y);
  } else if(o.t==='stairWin'){
    var pul=0.5+0.5*Math.sin(S.time*4);
    ctx.strokeStyle='rgba(255,230,120,'+(0.6+0.4*pul)+')';
    ctx.lineWidth=2.4;
    ctx.shadowColor='#ffe066'; ctx.shadowBlur=18;
    roundRect(x-s*0.45,y-s*0.45,s*0.9,s*0.9,6); ctx.stroke();
    ctx.shadowBlur=0;
    ctx.font='700 '+Math.max(8,s*0.28)+'px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#ffe066'; ctx.fillText('EXIT', x, y);
  } else if(o.t==='gate'){
    var col = o.kind==='main'?'#ef4444':(o.kind==='side'?'#eab308':(o.kind==='iron'?'#a78bfa':'#94a3b8'));
    ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=12;
    var gw=(o.kind==='main'||o.kind==='side') ? s*0.94 : s*0.72;
    ctx.fillRect(x-gw/2, y-s*0.13, gw, s*0.26);
    ctx.shadowBlur=0;
    ctx.font='600 '+Math.max(8,s*0.24)+'px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillStyle='rgba(230,240,255,.85)';
    ctx.fillText(o.label, x, y-s*0.2);
  } else if(o.t==='camera'){
    var camOn = !S.camsOff;
    var ccol = camOn ? '#ff4d6d' : '#475569';
    ctx.save();
    if(camOn){
      /* 监控视野锥 */
      ctx.fillStyle='rgba(255,70,90,.10)';
      ctx.beginPath();
      ctx.moveTo(x,y);
      ctx.arc(x, y, Math.round((o.range||5)*scale), o.dir-(o.cone||0.5), o.dir+(o.cone||0.5));
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle='rgba(255,90,110,.35)'; ctx.lineWidth=1; ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle=ccol; ctx.shadowColor=ccol; ctx.shadowBlur=camOn?12:0;
    roundRect(x-s*0.24, y-s*0.18, s*0.48, s*0.36, 3); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='#0b1220';
    ctx.beginPath(); ctx.arc(x, y, Math.max(1,s*0.07), 0, Math.PI*2); ctx.fill();
    ctx.font='700 '+Math.max(8,s*0.3)+'px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillStyle= camOn?'rgba(255,140,160,.9)':'rgba(120,140,160,.7)';
    ctx.fillText(camOn?'📹':'📹✕', x, y-s*0.24);
  } else if(o.t==='cctv'){
    var off=!!S.camsOff;
    ctx.fillStyle= off?'#22c55e':'#64748b';
    ctx.shadowColor= off?'#22c55e':'rgba(0,0,0,0)'; ctx.shadowBlur=off?16:0;
    roundRect(x-s*0.3, y-s*0.3, s*0.6, s*0.6, 4); ctx.fill();
    ctx.shadowBlur=0;
    ctx.font='700 '+Math.max(8,s*0.32)+'px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillStyle='#0b1220'; ctx.fillText(off?'OFF':'ON', x, y);
  } else if(o.t==='car'){
    var dead=!!S.carBroken;
    ctx.fillStyle= dead?'#3f3a35':'#1f7ae0';
    ctx.shadowColor= dead?'rgba(0,0,0,0)':'#1f7ae0'; ctx.shadowBlur=dead?0:14;
    roundRect(x-s*0.42,y-s*0.26,s*0.84,s*0.52,6); ctx.fill();
    ctx.shadowBlur=0;
    ctx.fillStyle='#0b1220';
    ctx.beginPath(); ctx.arc(x-s*0.24, y+s*0.28, Math.max(1.5,s*0.1), 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(x+s*0.24, y+s*0.28, Math.max(1.5,s*0.1), 0, Math.PI*2); ctx.fill();
    ctx.font='700 '+Math.max(8,s*0.28)+'px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='bottom';
    ctx.fillStyle='rgba(220,235,255,.8)';
    ctx.fillText(dead?'🚗💥':'🚗', x, y-s*0.28);
  } else if(o.t==='enter'){
    ctx.strokeStyle='rgba(120,220,255,.6)'; ctx.lineWidth=2;
    ctx.setLineDash([4,4]);
    roundRect(x-s*0.5,y-s*0.5,s,s,4); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

function drawPlayer(){
  var x=S.px*scale, y=S.py*scale, s=scale;

  /* 走路浮动：先算出目标值，再用指数平滑过渡，避免帧率抖动导致上下跳 */
  var targetBob = S.moving ? Math.sin(S.walkPhase||0)*s*0.05 : 0;
  S.bobCur += (targetBob - S.bobCur)*0.25;
  if(Math.abs(S.bobCur)<0.02) S.bobCur=0;
  var bob = S.bobCur;

  /* 眼睛偏移：按朝向给目标值，同样做平滑插值，切换朝向时不会瞬移跳动 */
  var tex = S.faceDir==='left'?-0.09:(S.faceDir==='right'?0.09:0);
  var tey = S.faceDir==='up'?-0.10:(S.faceDir==='down'?0.06:0);
  S.eyeX += (tex - S.eyeX)*0.30;
  S.eyeY += (tey - S.eyeY)*0.30;
  if(Math.abs(S.eyeX)<0.002) S.eyeX=0;
  if(Math.abs(S.eyeY)<0.002) S.eyeY=0;
  var ex=S.eyeX, ey=S.eyeY;

  /* 关键：把角色整体对齐到设备像素网格（1/DPR），
     否则角色中心与眼睛圆心落在亚像素上，每帧四舍五入会左右上下各差 1px → 看起来就是「眼睛抖」 */
  var bx = snapPx(x, DPR), by = snapPx(y + bob, DPR);
  var glowX = snapPx(x, DPR), glowY = snapPx(y, DPR);

  ctx.save();
  var rad=ctx.createRadialGradient(glowX,glowY,s*0.2,glowX,glowY,s*1.7);
  rad.addColorStop(0,'rgba(120,210,255,.22)');
  rad.addColorStop(1,'rgba(120,210,255,0)');
  ctx.fillStyle=rad;
  ctx.beginPath(); ctx.arc(glowX,glowY,s*1.7,0,Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor='#4aa8ff'; ctx.shadowBlur=16;
  ctx.fillStyle='#4aa8ff';
  ctx.beginPath(); ctx.arc(bx,by,s*0.31,0,Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.fillStyle='#04101c';
  var er=Math.max(1, Math.round(s*0.05));   /* 眼睛半径取整，避免半径抖动 */
  var eyeGap=0.085;
  /* 眼睛中心同样按设备像素对齐；两眼固定在同一水平线上 */
  var e1x = snapPx(x+(ex-eyeGap)*s, DPR), e2x = snapPx(x+(ex+eyeGap)*s, DPR);
  var eyy = snapPx(by + ey*s, DPR);
  ctx.beginPath(); ctx.arc(e1x, eyy, er,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(e2x, eyy, er,0,Math.PI*2); ctx.fill();
}

function drawNpc(n){
  var x=snapPx(n.x*scale, DPR), y=snapPx(n.y*scale, DPR), s=scale;
  var chasing = n.state==='chase';
  var col = n.kind==='teacher' ? '#ff6b6b' : '#8b93ff';

  ctx.save();
  ctx.fillStyle = chasing ? 'rgba(255,70,70,.18)'
                : (n.kind==='teacher'?'rgba(255,120,120,.10)':'rgba(140,150,255,.10)');
  ctx.beginPath();
  ctx.moveTo(x,y);
  ctx.arc(x,y, Math.round(n.sight*scale), n.dir-n.cone, n.dir+n.cone);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.shadowColor=col; ctx.shadowBlur=chasing?22:11;
  ctx.fillStyle=col;
  ctx.beginPath(); ctx.arc(x,y,s*0.30,0,Math.PI*2); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(n.dir);
  ctx.fillStyle='rgba(255,255,255,.9)';
  ctx.beginPath();
  ctx.moveTo(s*0.25,0); ctx.lineTo(s*0.06,-s*0.14); ctx.lineTo(s*0.06,s*0.14);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  ctx.font='600 '+Math.max(8,s*0.23)+'px sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='bottom';
  ctx.fillStyle = chasing ? '#ff8a8a' : 'rgba(220,235,255,.62)';
  ctx.fillText(chasing?('! '+n.name):n.name, x, y-s*0.34);
}

function drawOverlayHints(f){
  var r=roomAt(f,S.px,S.py);
  if(!r || !r.safe) return;
  ctx.save();
  ctx.font='600 11px -apple-system,"PingFang SC",sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  var txt='安全区 · 按 V 跳过一回合';
  var tw=ctx.measureText(txt).width;
  var bx=CW/2, by=padTop-13;
  ctx.fillStyle='rgba(16,38,58,.94)';
  ctx.strokeStyle='rgba(90,200,255,.35)'; ctx.lineWidth=1;
  roundRect(bx-tw/2-9, by-10, tw+18, 20, 10);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle='#9fe6ff';
  ctx.fillText(txt, bx, by);
  ctx.restore();
}

/* ================= 主循环 ================= */
var lastT = 0;
function loop(t){
  requestAnimationFrame(loop);
  if(!lastT) lastT=t;
  var dt=(t-lastT)/1000;
  if(!(dt>0)) dt=0;
  if(dt>0.05) dt=0.05;
  lastT=t;

  if(S.mode==='play'){
    S.time+=dt;
    if(S.gogglesT>0) S.gogglesT=Math.max(0,S.gogglesT-dt);
    updateUse(dt);
    tickItemTimers(dt);
    updateCameras(dt);
    movePlayer(dt);
    stairCheck();
    /* 敌人移动：回合制只在玩家走完一格后行动一次；经典模式每帧连续行动 */
    if(S.mode2==='classic'){
      updateNpcs(dt);
    } else {
      if(S.needEnemyTurn && S.stepT<=0) runEnemyTurn();
      tickEnemyAnim(dt);          /* 把敌人这一回合的移动演出来 */
    }
    /* 抓捕判定：每帧都要跑，站着不动也会被监控/视野抓到 */
    if(S.mode==='play') checkCatch(dt);
    if(S.msgT>0){
      S.msgT-=dt;
      if(S.msgT<=0){
        var te=document.getElementById('toast');
        if(te) te.classList.remove('show');
      }
    }
    if(Math.floor(S.time*2)!==Math.floor((S.time-dt)*2)) updateHUD();
    updateSeeHUD();          /* 警戒条每帧刷新，倒计时才跟得上 */
  }
  drawAll();
}

/* ================= 启动 ================= */
window.addEventListener('resize',function(){ resize(); });
window.addEventListener('orientationchange',function(){ setTimeout(resize,150); });
resize();
bindInput();
buildWorld();
achLoad();          /* 载入本地保存的成就（localStorage / cookie） */
renderAchChip();
S.mode='menu';
requestAnimationFrame(loop);
})();
