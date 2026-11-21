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
// 触摸设备才显示摇杆和操作按钮（桌面也可通过触屏检测启用）
function showTouchUI(){
  const isTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
  if(!isTouch) return;
  const jz=$('joyZone'); if(jz) jz.style.display='block';
  const az=$('actZone'); if(az) az.style.display='block';
  const tip=$('htip'); if(tip) tip.textContent='📱 右半屏拖动转视角 · 左摇杆移动 · 右下按钮作战';
}
function bindUI(){
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

  // 触屏摇杆（Pointer Events，整块左半屏可拖）
  const joyZone=$('joyZone'), joyBase=$('joyBase'), joyStick=$('joyStick');
  if(joyZone&&joyBase&&joyStick){
    let jId=null, jx=0, jy=0;
    const startJoy=(t)=>{
      const r=joyBase.getBoundingClientRect();
      jx=t.clientX; jy=t.clientY;
      joyBase.style.left=(t.clientX-r.width/2)+'px';
      joyBase.style.top=(t.clientY-r.height/2)+'px';
      joyBase.style.bottom='auto';
      joyBase.style.display='block';
      jId=t.pointerId;
      touchMoveX=0; touchMoveY=0;
    };
    joyZone.addEventListener('pointerdown',e=>{
      if(jId!==null) return;
      startJoy(e);
      try{ joyZone.setPointerCapture(e.pointerId); }catch(_){}
      const t=$('htip');
      if(t){ t.classList.remove('hide'); t.textContent='🎮 摇杆已激活 · 拖动移动（松手停止）'; }
      e.preventDefault();
    });
    joyZone.addEventListener('pointermove',e=>{
      if(e.pointerId!==jId) return;
      let dx=e.clientX-jx, dy=e.clientY-jy;
      const max=48, d=Math.hypot(dx,dy);
      if(d>max){ dx*=max/d; dy*=max/d; }
      joyStick.style.transform=`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      touchMoveX=dx/max; touchMoveY=dy/max;
      e.preventDefault();
    });
    const endJoy=(e)=>{
      if(jId!==null && e && e.pointerId!==jId) return;
      jId=null; touchMoveX=0; touchMoveY=0;
      joyStick.style.transform='translate(-50%,-50%)';
      joyBase.style.left='24px'; joyBase.style.top='auto'; joyBase.style.bottom='24px';
    };
    joyZone.addEventListener('pointerup',endJoy);
    joyZone.addEventListener('pointercancel',endJoy);
    joyZone.addEventListener('pointerleave',endJoy);
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