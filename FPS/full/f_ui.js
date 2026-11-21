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
function bindUI(){
  const start=$('btnPlay'); if(start) start.onclick=()=>{ $('menu').style.display='none'; audioInit(); audioResume(); sfxUI(); init(); };
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
    if(e.code==='Escape') $('shop').style.display='none';
  });
  addEventListener('keyup',e=>{ P.keys[e.code]=false; });
  addEventListener('mousedown',e=>{
    if(e.button===0 && ready) fire();
  });

  // 指针锁定视角
  const cv=$('c');
  let dragging=false, lx=0, ly=0;
  cv.addEventListener('mousedown',e=>{
    if(!ready) return;
    dragging=true; lx=e.clientX; ly=e.clientY;
    if(cv.requestPointerLock) cv.requestPointerLock();
  });
  addEventListener('mouseup',()=>{ dragging=false; });
  addEventListener('mousemove',e=>{
    if(!dragging) return;
    P.yaw-=(e.clientX-lx)*0.003;
    P.pitch-=(e.clientY-ly)*0.003;
    const lim=1.45; if(P.pitch>lim)P.pitch=lim; if(P.pitch<-lim)P.pitch=-lim;
    lx=e.clientX; ly=e.clientY;
  });

  // 触屏摇杆
  const joyBase=$('joyBase'), joyStick=$('joyStick');
  if(joyBase){
    let jActive=false, jx=0, jy=0;
    joyBase.addEventListener('touchstart',e=>{
      const r=joyBase.getBoundingClientRect();
      jActive=true; jx=r.left+r.width/2; jy=r.top+r.height/2;
      e.preventDefault();
    });
    joyBase.addEventListener('touchmove',e=>{
      if(!jActive) return;
      const t=e.touches[0];
      let dx=t.clientX-jx, dy=t.clientY-jy;
      const max=45, d=Math.hypot(dx,dy);
      if(d>max){ dx*=max/d; dy*=max/d; }
      joyStick.style.transform=`translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      touchMoveX=dx/max; touchMoveY=dy/max;
      e.preventDefault();
    });
    joyBase.addEventListener('touchend',()=>{ jActive=false; touchMoveX=0; touchMoveY=0; joyStick.style.transform='translate(-50%,-50%)'; });
  }

  // 移动端操作按钮
  const fireBtn=$('btnFire'); if(fireBtn){ fireBtn.addEventListener('touchstart',e=>{ if(ready) fire(); e.preventDefault(); }); }
  const jumpBtn=$('btnJump'); if(jumpBtn){ jumpBtn.addEventListener('touchstart',e=>{ P.vel.y=7; e.preventDefault(); }); }
  const reloadBtn=$('btnReload'); if(reloadBtn){ reloadBtn.addEventListener('touchstart',e=>{ startReload(); e.preventDefault(); }); }
  const sprintBtn=$('btnSprint'); if(sprintBtn){
    sprintBtn.addEventListener('touchstart',e=>{ P.sprinting=true; e.preventDefault(); });
    sprintBtn.addEventListener('touchend',()=>{ P.sprinting=false; });
  }
  const interactBtn=$('btnInteract'); if(interactBtn){ interactBtn.addEventListener('touchstart',e=>{ interact(); e.preventDefault(); }); }

  // 触屏视角拖拽（右侧操作区）
  const actZone=$('actZone');
  if(actZone){
    let vActive=false, vx=0, vy=0;
    actZone.addEventListener('touchstart',e=>{ vActive=true; vx=e.touches[0].clientX; vy=e.touches[0].clientY; });
    actZone.addEventListener('touchmove',e=>{
      if(!vActive) return;
      const t=e.touches[0];
      P.yaw-=(t.clientX-vx)*0.005;
      P.pitch-=(t.clientY-vy)*0.005;
      const lim=1.45; if(P.pitch>lim)P.pitch=lim; if(P.pitch<-lim)P.pitch=-lim;
      vx=t.clientX; vy=t.clientY;
    });
    actZone.addEventListener('touchend',()=>{ vActive=false; });
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