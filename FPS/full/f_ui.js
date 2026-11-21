/* ============ f_ui.js：菜单/商店/HUD/输入/摇杆 ============ */
let touchMoveX=0, touchMoveY=0;

function refreshHUD(){
  const hp=$('hpNum'); if(hp) hp.textContent=Math.round(P.hp);
  const hf=$('hpfill'); if(hf){ hf.style.width=Math.max(0,P.hp)+'%'; hf.classList.toggle('low',P.hp<30); }
  const am=$('ammo'); if(am) am.textContent=(P.inv.gun?P.ammo.gun:P.ammo.ammo);
  const ar=$('ammoReserve'); if(ar) ar.textContent=(P.inv.gun?'30':'120');
  const money=$('money'); if(money) money.textContent=P.ammo.cash;
  const mm=$('mMoney'); if(mm) mm.textContent=P.ammo.cash;
  const wpn=$('wpnName'); if(wpn) wpn.textContent=P.inv.gun?'步枪':'手枪';
}

function toast(t){
  const el=$('toast'); if(!el) return;
  el.textContent=t; el.style.opacity='1';
  clearTimeout(el._t); el._t=setTimeout(()=>el.style.opacity='0',1500);
}

/* ---- 主菜单 / 开始 / 结束按钮 ---- */
/* 显示摇杆和操作按钮。
   【不要再依赖触摸检测】原来写了 if(!isTouch) return;
   而 isTouch 来自 'ontouchstart' in window || navigator.maxTouchPoints>0。
   某些 Android WebView / 内置浏览器里这两个值都拿不到（或为 0），
   于是这段直接 return，#joyZone 永远停在 CSS 的 display:none，
   display:none 的元素收不到任何事件 —— 手怎么拖都没反应。
   反正桌面端本来也有鼠标拖拽摇杆的兜底，所以干脆无条件显示。 */
function showTouchUI(){
  const jz=$('joyZone'); if(jz) jz.style.display='block';
  const az=$('actZone'); if(az) az.style.display='block';
  const tip=$('htip'); if(tip) tip.textContent='📱 右半屏拖动转视角 · 左摇杆移动 · 右下按钮作战';
}
/* 主菜单/死亡界面时把摇杆和操作按钮收起来。
   之前 #joyZone 是常驻 display:block，层级还压在菜单之上，
   于是主界面也能看到一个摇杆，很碍事。 */
function hideTouchUI(){
  const jz=$('joyZone'); if(jz) jz.style.display='none';
  const az=$('actZone'); if(az) az.style.display='none';
}
function bindUI(){
  hideTouchUI();   // 一进页面就是主菜单，摇杆/操作按钮先收起来
  const start=$('btnPlay'); if(start) start.onclick=()=>{ $('menu').style.display='none'; audioInit(); audioResume(); sfxUI(); showTouchUI(); init(); };
  const respawn=$('btnRespawn'); if(respawn) respawn.onclick=()=>{ location.reload(); };
  const deathMenu=$('btnDeathMenu'); if(deathMenu) deathMenu.onclick=()=>{ location.reload(); };
  const shopBtn=$('btnShop'); if(shopBtn) shopBtn.onclick=()=>{ toggleShop(); };
  // 音效开关
  const sndBtn=$('sndBtn');
  if(sndBtn) sndBtn.onclick=(ev)=>{
    ev.stopPropagation();
    sfxOn=!sfxOn;
    if(masterGain) masterGain.gain.value=sfxOn?VOL.master:0;
    $('sndTxt').textContent=sfxOn?'开':'关';
    sndBtn.firstChild.textContent=sfxOn?'🔊 ':'🔇 ';
    if(sfxOn) sfxUI();
  };
  const exportBtn=$('btnExport'); if(exportBtn) exportBtn.onclick=exportSave;
  const importBtn=$('btnImport'); if(importBtn) importBtn.onclick=importSave;
  const resetBtn=$('btnReset'); if(resetBtn) resetBtn.onclick=()=>{ if(confirm('确认重置所有数据？')) location.reload(); };
  const backBtn=$('btnBack'); if(backBtn) backBtn.onclick=()=>{ location.href='../'; };

  // 键盘
  addEventListener('keydown',e=>{
    P.keys[e.code]=true;
    if(e.code==='Space'||e.code==='KeyR'||e.code==='KeyQ'||e.code==='KeyE') e.preventDefault();
    if(e.code==='KeyR') startReload();
    if(e.code==='KeyQ') toggleShop();
    if(e.code==='KeyE') interact();
    if(e.code==='Space'&&!e.repeat) doJump();
    if(e.code==='Escape') $('shop').style.display='none';
  });
  addEventListener('keyup',e=>{ P.keys[e.code]=false; });
  addEventListener('mousedown',e=>{
    if(e.button===0 && ready) fire();
  });

  // 指针锁定视角
  const cv=$('c');
  let dragging=false, lx=0, ly=0, locked=false;
  cv.addEventListener('mousedown',e=>{
    if(!ready) return;
    dragging=true; lx=e.clientX; ly=e.clientY;
    // 只有左键/中键才请求锁定，避免右键菜单干扰
    if(!locked && cv.requestPointerLock) cv.requestPointerLock();
  });
  document.addEventListener('pointerlockchange',()=>{
    locked=(document.pointerLockElement===cv);
    document.body.classList.toggle('locked',locked);
  });
  addEventListener('mouseup',()=>{ dragging=false; });
  addEventListener('mousemove',e=>{
    // 锁定态优先用 movementX/Y（clientX 在锁定下是冻结的）
    if(locked){
      const dx=e.movementX||0, dy=e.movementY||0;
      if(dx===0&&dy===0) return;
      P.yaw-=dx*0.0025;
      P.pitch-=dy*0.0025;
    }else{
      if(!dragging) return;
      P.yaw-=(e.clientX-lx)*0.003;
      P.pitch-=(e.clientY-ly)*0.003;
      lx=e.clientX; ly=e.clientY;
    }
    const lim=1.45; if(P.pitch>lim)P.pitch=lim; if(P.pitch<-lim)P.pitch=-lim;
  });

  /* 触屏摇杆：只用 touch 事件。
     【为什么不用 pointer】pointerdown/pointermove 与 touchstart/touchmove
     同时绑在同一个元素上时，两者会互相打架：
     pointerdown 先跑并把 jId 赋值，接着 touchstart 看到 jId!==null 直接 return，
     而 pointermove 又因为设备上 pointerId 配对异常被 if 挡掉，
     结果两套事件都「启动了」，但没有任何一套真正更新 P.joyX，
     表现就是摇杆能显示、能跟随手指，玩家却一动不动。
     这里只保留 touch 事件，逻辑单一，不再有配对问题。 */
  const joyZone=$('joyZone'), joyBase=$('joyBase'), joyStick=$('joyStick');
  if(joyZone&&joyBase&&joyStick){
    let activeId=null, sx=0, sy=0;

    /* 【真凶就在这里】原来 startJoy 每次都无条件执行 sx=cx;sy=cy;
       浏览器只要多发一次 touchstart（手指轻微抖动、WebView 重新派发、
       或者 #joyZone 被反复 touchstart），起点就被刷新成「当前点」，
       于是接下来的 touchmove 里 dx=cx-sx 恒等于 0，
       moveJoy 被调用了 134 次、joyX 却永远是 0.00，pos 永远 0.0,5.0。
       修法：只有「当前没有活动触点」时才记录起点，
       已经在拖时再收到 touchstart 一律忽略。 */
    const startJoy=(cx,cy)=>{
      if(activeId!==null){          // 已经在拖了，绝不重置起点
        window.__evtStart=(window.__evtStart||0)+1;
        return;
      }
      sx=cx; sy=cy;
      activeId=1;
      window.__evtStart=(window.__evtStart||0)+1;
      window.__lastStart=[cx|0,cy|0];
      /* 摇杆放在按下位置，用 translate(-50%,-50%) 精确居中 */
      joyBase.style.left=cx+'px';
      joyBase.style.top=cy+'px';
      joyBase.style.display='block';
      joyStick.style.transform='translate(-50%,-50%)';
      P.joyX=0; P.joyY=0;
      window.__joyTouch={ active:true, sx:cx, sy:cy, cx:cx, cy:cy };
    };

    const moveJoy=(cx,cy)=>{
      window.__evtMove=(window.__evtMove||0)+1;
      window.__lastMove=[cx|0,cy|0];
      let dx=cx-sx, dy=cy-sy;
      const max=48, d=Math.hypot(dx,dy);
      if(d>max){ dx*=max/d; dy*=max/d; }
      joyStick.style.transform='translate(calc(-50% + '+dx+'px), calc(-50% + '+dy+'px))';
      /* 死区 2px：手指轻微抖动不算推杆，但门限不能太大，
         否则手感会发黏。超过门限按比例输出 -1~1。 */
      if(d>2){ P.joyX=dx/max; P.joyY=dy/max; }
      else { P.joyX=0; P.joyY=0; }
      if(window.__joyTouch){ window.__joyTouch.cx=cx; window.__joyTouch.cy=cy; window.__joyTouch.active=true; }
    };

    const endJoy=()=>{
      activeId=null; P.joyX=0; P.joyY=0;
      if(window.__joyTouch) window.__joyTouch.active=false;
      joyStick.style.transform='translate(-50%,-50%)';
      /* 松开后回到常驻位置（左下角），而不是隐藏——
         常驻可见才能一眼确认摇杆是否真的在工作。 */
      joyBase.style.left='110px';
      joyBase.style.top='calc(100% - 110px)';
    };

    joyZone.addEventListener('touchstart',e=>{
      /* 已经在拖时不再重置起点（见上面 startJoy 的说明） */
      const t=e.changedTouches[0]; if(!t) return;
      startJoy(t.clientX,t.clientY);
      const tip=$('htip');
      if(tip){ tip.classList.remove('hide'); tip.textContent='🎮 摇杆已激活 · 拖动移动'; }
      e.preventDefault();
    }, {passive:false});
    joyZone.addEventListener('touchmove',e=>{
      if(activeId===null) return;
      const t=e.changedTouches[0]; if(!t) return;
      moveJoy(t.clientX,t.clientY);
      e.preventDefault();
    }, {passive:false});
    /* 【按住期间被系统吞掉 touchend 的兜底】
       如果 WebView 在手指仍按着时发了 touchend、却没有后续 touchstart，
       会出现「手指仍在动、却收不到 move」的僵死状态。
       用一个定时器在 touchend 后 250ms 检查：期间没有任何 move，
       才真正结束摇杆，否则把它当作误报忽略。 */
    let endTimer=null;
    const softEnd=()=>{
      if(endTimer) clearTimeout(endTimer);
      const t0=window.__joyTouch?window.__joyTouch.t0:0;
      const mv=window.__evtMove||0;
      endTimer=setTimeout(()=>{
        if((window.__evtMove||0)!==mv && Date.now()-(window.__joyTouch.t0||0)<2000){
          // 期间还有 move，说明是误报的 touchend，保持按住状态
          return;
        }
        endJoy();
      }, 250);
    };
    joyZone.addEventListener('touchend',e=>{ softEnd(); },{passive:true});
    joyZone.addEventListener('touchcancel',e=>{ endJoy(); },{passive:true});

    /* 桌面调试用：鼠标拖左半屏也能触发摇杆，方便在电脑上验证移动逻辑 */
    joyZone.addEventListener('mousedown',e=>{
      if(activeId!==null) return;
      startJoy(e.clientX,e.clientY);
      const mv=ev=>moveJoy(ev.clientX,ev.clientY);
      const up=()=>{ endJoy(); removeEventListener('mousemove',mv); removeEventListener('mouseup',up); };
      addEventListener('mousemove',mv); addEventListener('mouseup',up);
      e.preventDefault();
    });
  }

  // 移动端操作按钮
  const fireBtn=$('btnFire'); if(fireBtn){ fireBtn.addEventListener('touchstart',e=>{ if(ready) fire(); e.preventDefault(); }); }
  const jumpBtn=$('btnJump'); if(jumpBtn){ jumpBtn.addEventListener('touchstart',e=>{ if(ready) doJump(); e.preventDefault(); }); }
  const reloadBtn=$('btnReload'); if(reloadBtn){ reloadBtn.addEventListener('touchstart',e=>{ startReload(); e.preventDefault(); }); }
  const sprintBtn=$('btnSprint'); if(sprintBtn){
    sprintBtn.addEventListener('touchstart',e=>{ P.sprinting=true; e.preventDefault(); });
    sprintBtn.addEventListener('touchend',()=>{ P.sprinting=false; });
  }
  const interactBtn=$('btnInteract'); if(interactBtn){ interactBtn.addEventListener('touchstart',e=>{ interact(); e.preventDefault(); }); }
  // 开镜：按住生效，松开还原（同时兼容 pointer 与 touch）
  const aimBtn=$('btnAim');
  if(aimBtn){
    const aimOn=e=>{ P.aiming=true; aimBtn.classList.add('active'); if(e&&e.preventDefault) e.preventDefault(); };
    const aimOff=e=>{ P.aiming=false; aimBtn.classList.remove('active'); };
    aimBtn.addEventListener('touchstart',aimOn,{passive:false});
    aimBtn.addEventListener('touchend',aimOff,{passive:true});
    aimBtn.addEventListener('touchcancel',aimOff,{passive:true});
    aimBtn.addEventListener('pointerdown',aimOn);
    aimBtn.addEventListener('pointerup',aimOff);
    aimBtn.addEventListener('pointercancel',aimOff);
    aimBtn.addEventListener('pointerleave',aimOff);
  }
  // 键盘右键也可开镜（桌面端）
  addEventListener('mousedown',e=>{ if(e.button===2&&ready){ P.aiming=true; if(aimBtn) aimBtn.classList.add('active'); } });
  addEventListener('mouseup',e=>{ if(e.button===2){ P.aiming=false; if(aimBtn) aimBtn.classList.remove('active'); } });

  // 触屏视角拖拽（屏幕右半区，整屏监听，不依赖按钮）
  const viewLayer=$('viewLayer');
  if(viewLayer){
    let vId=null, vx=0, vy=0;
    viewLayer.addEventListener('touchstart',e=>{
      if(vId!==null) return;
      const t=e.changedTouches[0];
      vId=t.identifier; vx=t.clientX; vy=t.clientY;
    }, {passive:true});
    viewLayer.addEventListener('touchmove',e=>{
      for(const t of e.changedTouches){
        if(t.identifier!==vId) continue;
        P.yaw-=(t.clientX-vx)*0.005;
        P.pitch-=(t.clientY-vy)*0.005;
        const lim=1.45; if(P.pitch>lim)P.pitch=lim; if(P.pitch<-lim)P.pitch=-lim;
        vx=t.clientX; vy=t.clientY;
      }
    }, {passive:true});
    viewLayer.addEventListener('touchend',e=>{
      for(const t of e.changedTouches) if(t.identifier===vId) vId=null;
    }, {passive:true});
    viewLayer.addEventListener('touchcancel',()=>{ vId=null; }, {passive:true});
  }
}

/* ---- 商店 ---- */
function toggleShop(){
  buildShop();
  const s=$('shop'); s.style.display=s.style.display==='flex'?'none':'flex';
}
function buildShop(){
  const s=$('shop'); if(!s) return;
  s.innerHTML='<div class="box" style="max-width:420px">'
    +'<h1>🛒 商店</h1>'
    +'<div class="shoprow"><div class="info"><div class="n">医疗包</div><div class="d">恢复 40 生命</div></div><div class="price">¥300</div><button class="btn small" id="buyMed">购买</button></div>'
    +'<div class="shoprow"><div class="info"><div class="n">使用医疗包</div><div class="d">拥有 '+P.inv.med+' 个</div></div><button class="btn small" id="useMed">使用</button></div>'
    +'<div class="row"><button class="btn ghost" id="closeShop">关闭</button></div>'
    +'</div>';
  $('buyMed').onclick=()=>{ if(P.ammo.cash>=300){ P.ammo.cash-=300; P.inv.med++; sfxBuy(); refreshHUD(); buildShop(); } else { sfxDeny(); toast('货币不足'); } };
  $('useMed').onclick=()=>{ if(P.inv.med>0&&P.hp<100){ P.inv.med--; P.hp=Math.min(100,P.hp+40); sfxPickup(); refreshHUD(); buildShop(); } else sfxDeny(); };
  $('closeShop').onclick=()=>{ sfxUI(); s.style.display='none'; };
}

/* ---- 拾取/互动（E） ---- */
function interact(){
  let best=null, bd=2.2;
  for(const l of loots){
    if(l.taken) continue;
    const d=Math.hypot(P.pos.x-l.x,P.pos.z-l.z);
    if(d<bd){ bd=d; best=l; }
  }
  if(best){
    best.taken=true; best.mesh.visible=false;
    switch(best.type){
      case 'ammo': P.ammo.ammo+=30; toast('拾取 弹药 +30'); break;
      case 'med':  P.inv.med++; toast('拾取 医疗包'); break;
      case 'cash': P.ammo.cash+=200; toast('拾取 现金 +200'); break;
      case 'gun':  P.inv.gun=true; P.ammo.gun=120; toast('拾取 步枪！'); break;
    }
    refreshHUD();
  }
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindUI);
else bindUI();