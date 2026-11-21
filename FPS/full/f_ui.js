/* ============ f_ui.js：菜单/商店/HUD/输入/摇杆 ============ */
let touchMoveX=0, touchMoveY=0;

function refreshHUD(){
  const hp=$('hpNum'); if(hp) hp.textContent=Math.round(P.hp);
  const hf=$('hpfill'); if(hf){ hf.style.width=Math.max(0,P.hp)+'%'; hf.classList.toggle('low',P.hp<30); }
  const am=$('ammo'); if(am) am.textContent=(P.inv.gun?P.ammo.gun:P.ammo.ammo);
  /* 【备弹显示】原来写死 '30'/'120'，现在按枪种取真实储备：
     步枪读 P.ammo.rifle，手枪读 P.ammo.pistol，没有就退回旧字段。 */
  const ar=$('ammoReserve');
  if(ar) ar.textContent = P.inv.gun ? ((P.ammo.rifle|0)||(P.ammo.ammo|0)) : ((P.ammo.pistol|0)||(P.ammo.ammo|0));
  const money=$('money'); if(money) money.textContent=P.ammo.cash;
  const mm=$('mMoney'); if(mm) mm.textContent=P.ammo.cash;
  const wpn=$('wpnName'); if(wpn) wpn.textContent=P.inv.gun?'步枪':'手枪';
  /* 【护甲 HUD】穿戴头盔/护甲后在地血条旁显示剩余耐久 */
  const av=$('armorPill');
  if(av){
    const hasArmor = P.equip && (P.equip.helmet || P.equip.armorVest);
    if(hasArmor){
      const d = (P.helmetDur|0) + (P.vestDur|0);
      av.style.display='inline-flex';
      av.innerHTML='🛡️ <b>'+Math.max(0,Math.round(d))+'</b>';
    } else { av.style.display='none'; }
  }
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
  window.__joyEnabled=true;   // 允许 document 兜底监听接管左半屏
  const tip=$('htip'); if(tip) tip.textContent='📱 右半屏拖动转视角 · 左摇杆移动 · 右下按钮作战';
}
/* 主菜单/死亡界面时把摇杆和操作按钮收起来。
   之前 #joyZone 是常驻 display:block，层级还压在菜单之上，
   于是主界面也能看到一个摇杆，很碍事。 */
function hideTouchUI(){
  const jz=$('joyZone'); if(jz) jz.style.display='none';
  const az=$('actZone'); if(az) az.style.display='none';
  window.__joyEnabled=false;
  if(window.__joyTouch) window.__joyTouch.active=false;
}
function bindUI(){
  /* 【幂等保护】bindUI 里注册了大量 addEventListener，
     一旦被执行两次，每个 handler 就挂了两份：
     视角每帧的位移会被算两遍（灵敏度直接翻倍）、
     摇杆的移动也会叠两次。
     这正是「两个单独用没问题、一起用灵敏度爆炸」的放大器：
     真实设备上 DOMContentLoaded 与直接调用、或某些 WebView 重复派发，
     都可能触发二次执行。
     用标志位保证只跑一次。 */
if(window.__uiBound) return; window.__uiBound=true;
  bindDoorHint();   // 门提示条点击交互（手机端没有键盘）

  hideTouchUI();   // 一进页面就是主菜单，摇杆/操作按钮先收起来

  /* ===== 多指触控工具（bindUI 顶层，摇杆和视角层共用） =====
     【多指 bug 的核心修复】
     旧实现到处用 e.changedTouches[0] 取触点：
     当「左手推摇杆 + 右手转视角」时，一次 touchmove 会同时派发到
     #joyZone 和 #viewLayer 两个处理函数，而 changedTouches 里
     装的往往是**另一根手指**。结果：
       - 摇杆把手腕的横移当成推杆 → 方向乱跳
       - 视角把摇杆的位移当成转角 → 一点就飞（灵敏度「爆炸」）
     表现就是「单独用没问题，两个一起用灵敏度超级高」。
     所以必须做 identifier 配对：谁认领了哪根手指，就只认那一根。 */

  /* 在 TouchList 里按 identifier 找触点 */
  const findTouch=(e,tid)=>{
    if(!e||tid===null||tid===undefined) return null;
    const lists=[e.changedTouches, e.touches];
    for(const list of lists){
      if(!list) continue;
      for(let i=0;i<list.length;i++){
        if(list[i] && list[i].identifier===tid) return list[i];
      }
    }
    return null;
  };
  /* 某个 identifier 是否在这次变更里被抬起 */
  const hasTouch=(list,tid)=>{
    if(!list||tid===null||tid===undefined) return false;
    for(let i=0;i<list.length;i++){
      if(list[i] && list[i].identifier===tid) return true;
    }
    return false;
  };
  /* 摇杆当前锁定的触点 identifier（null = 没有手指在推摇杆） */
  let joyTid=null;


  /* 【横屏支持】屏幕旋转时立即重算：
       1) 画布尺寸与像素预算（applyPixelBudget 里同时修正相机 aspect）
       2) 摇杆区域占比（横屏时左侧给摇杆 42%，其余归视角拖拽）
     有些 WebView 在旋转时 resize 事件晚于真实尺寸变化，
     所以 orientationchange 之后再补两次延迟调用，确保拿到最终尺寸。 */
  const relayout=()=>{
    if(window.__relayout) window.__relayout();
    if(typeof applyPixelBudget==='function' && ready) { try{ applyPixelBudget(); }catch(e){} }
  };
  window.addEventListener('resize',()=>{ relayout(); setTimeout(relayout,120); });
  window.addEventListener('orientationchange',()=>{ setTimeout(relayout,180); setTimeout(relayout,420); });
  relayout();
  const start=$('btnPlay'); if(start) start.onclick=()=>{ $('menu').style.display='none'; audioInit(); audioResume(); sfxUI(); showTouchUI(); init(); };
  const respawn=$('btnRespawn'); if(respawn) respawn.onclick=()=>{ location.reload(); };
  const deathMenu=$('btnDeathMenu'); if(deathMenu) deathMenu.onclick=()=>{ location.reload(); };
  const shopBtn=$('btnShop'); if(shopBtn) shopBtn.onclick=()=>{ toggleShop(); };
  const stashBtn=$('btnStash'); if(stashBtn) stashBtn.onclick=()=>{ sfxUI(); toggleStash(); };
  /* 【局内背包入口】HUD 右上角的「🎒 背包」可直接点开 */
  const bagBtn=$('bagBtn');
  if(bagBtn) bagBtn.onclick=(ev)=>{ ev.stopPropagation(); sfxUI(); toggleBag(); };
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
    if(e.code==='Space'||e.code==='KeyR'||e.code==='KeyQ'||e.code==='KeyE'||e.code==='KeyB'||e.code==='Tab') e.preventDefault();
    if(e.code==='KeyR') startReload();
    if(e.code==='KeyQ') toggleShop();
    if(e.code==='KeyE') interact();
    /* 背包：B 或 Tab 打开/关闭 */
    if(e.code==='KeyB'||e.code==='Tab'){ if(!e.repeat) toggleBag(); }
    if(e.code==='Space'&&!e.repeat) doJump();
    if(e.code==='Escape'){ $('shop').style.display='none'; $('bag').style.display='none'; }
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
      P.yaw-=dx*0.0016;
      P.pitch-=dy*0.0016;
    }else{
      if(!dragging) return;
      P.yaw-=(e.clientX-lx)*0.0016;
      P.pitch-=(e.clientY-ly)*0.0016;
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
      /* 【摇杆固定】底座位置写死在 CSS 里（左下角），
         绝不再随手指按下的位置移动。
         以前这里执行 joyBase.style.left=cx / top=cy，
         摇杆会「跳到」你按下的地方，看起来像可以拖着到处跑，
         而且会跑到右侧按钮区里，造成穿模。
         现在只让摇杆头（joyStick）在底座内偏移，底座不动。 */
      joyBase.style.display='block';
      joyStick.style.transform='translate(-50%,-50%)';
      P.joyX=0; P.joyY=0;
      window.__joyTouch={ active:true, sx:cx, sy:cy, cx:cx, cy:cy };
    };

    const moveJoy=(cx,cy)=>{
      /* 【死区与缩放】max 是摇杆最大位移，输出经 max 归一化到 -1~1。
         这里保持原逻辑，只补注释。 */
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
      activeId=null; joyTid=null; P.joyX=0; P.joyY=0;
      if(window.__joyTouch) window.__joyTouch.active=false;
      /* 只把摇杆头弹回中心，底座永远留在 CSS 定的左下角 */
      joyStick.style.transform='translate(-50%,-50%)';
    };

    /* 【多指触控的核心修复】
       旧代码一律取 e.changedTouches[0]：
       手指 A 推摇杆、手指 B 转视角时，两个处理函数都会各自收到
       「本次变更的触点数组」，而 [0] 拿到的常常是**另一根手指**。
       于是摇杆把手腕的横移当成了「推杆」，视角也拿摇杆的位移当转角，
       两边互相污染 —— 表现就是「单独用没事，一起用灵敏度爆炸」。

       现在改成：摇杆和视角各自**锁定一个 touch identifier**，
       move/end 时用 identifiers 或 changedTouches 精确找出「自己那根手指」，
       属于别人的触点一律忽略。 */
    joyZone.addEventListener('touchstart',e=>{
      for(const t of e.changedTouches){
        if(joyTid!==null) break;             // 已经认领了一根，其余忽略
        joyTid=t.identifier;
        startJoy(t.clientX,t.clientY);
      }
      const tip=$('htip');
      if(tip){ tip.classList.remove('hide'); tip.textContent='🎮 摇杆已激活 · 拖动移动'; }
      e.preventDefault();
    }, {passive:false});
    joyZone.addEventListener('touchmove',e=>{
      if(joyTid===null) return;
      const t=findTouch(e,joyTid); if(!t) return;
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
    joyZone.addEventListener('touchend',e=>{
      /* 只有「摇杆那根手指」抬起才结束，别的指头抬起不影响 */
      if(joyTid===null) return;
      if(!hasTouch(e.changedTouches,joyTid)) return;
      softEnd();
    },{passive:true});
    joyZone.addEventListener('touchcancel',e=>{
      if(joyTid===null) return;
      if(!hasTouch(e.changedTouches,joyTid)) return;
      endJoy();
    },{passive:true});
    /* 【全局兜底】有些 WebView 里 #joyZone 的 touch 事件会被
       其它覆盖层吃掉（canvas、#grade、#grain、甚至系统手势区）。
       这里在 document 上再挂一份：只要触点落在左半屏、
       且当前没有摇杆在拖，就照样启动摇杆。
       优先走 #joyZone 的正常路径，它没收到才由这里接手。 */
    /* 【横屏适配】摇杆只管屏幕左侧 42% 的区域。
       原来固定是 50%，横屏后左半屏很宽，手指稍微往中间推就落到视角层，
       会变成「推着推着视角自己转起来」。 */
    document.addEventListener('touchstart',e=>{
      if(joyTid!==null) return;
      if(!window.__joyEnabled) return;    // 还没进游戏（菜单界面）不接管
      for(const t of e.changedTouches){
        if(joyTid!==null) break;
        if(t.clientX > window.innerWidth*(window.__joyZoneRatio||0.42)) continue;
        joyTid=t.identifier;
        startJoy(t.clientX,t.clientY);
        break;
      }
    }, {passive:true});
    document.addEventListener('touchmove',e=>{
      if(joyTid===null) return;
      const t=findTouch(e,joyTid); if(!t) return;
      moveJoy(t.clientX,t.clientY);
    }, {passive:true});
    document.addEventListener('touchend',e=>{
      if(joyTid===null) return;
      if(!hasTouch(e.changedTouches,joyTid)) return;
      softEnd();
    }, {passive:true});
    document.addEventListener('touchcancel',e=>{
      if(joyTid===null) return;
      if(!hasTouch(e.changedTouches,joyTid)) return;
      endJoy();
    }, {passive:true});

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
/* 开镜：改成「切换」模式。
     以前是按住生效，手机上一个手指要一直压着开镜键，
     根本没法同时用摇杆移动、也没法开火 —— 手感完全不可用。
     现在点一下开镜、再点一下关闭，状态机单一，不会出现
     touchstart 触发 pointerdown 又触发 pointerleave 导致反复开关。 */
  const aimBtn=$('btnAim');
  const setAim=(on)=>{
    P.aiming=!!on;
    if(aimBtn){
      if(P.aiming) aimBtn.classList.add('active');
      else aimBtn.classList.remove('active');
    }
    const tip=$('htip');
    if(tip) tip.textContent = P.aiming ? '🔭 开镜中 · 再点一次退出' : '📱 右半屏拖动转视角 · 左摇杆移动 · 右下按钮作战';
  };
  if(aimBtn){
    const toggle=(e)=>{
      setAim(!P.aiming);
      if(e&&e.preventDefault) e.preventDefault();
      if(e&&e.stopPropagation) e.stopPropagation();
    };
    aimBtn.addEventListener('touchstart',toggle,{passive:false});
    /* 桌面/鼠标调试用；pointerup 之类不再参与，避免同一次点击被处理两遍 */
    aimBtn.addEventListener('mousedown',e=>{ if(e.button===0) toggle(e); });
    /* 换弹时自动退出开镜，否则换弹动画和 FOV 会互相打架 */
  }
  window.__setAim=setAim;
  // 键盘右键也可开镜（桌面端，按住式）
  addEventListener('mousedown',e=>{ if(e.button===2&&ready){ if(window.__setAim) window.__setAim(true); } });
  addEventListener('mouseup',e=>{ if(e.button===2){ if(window.__setAim) window.__setAim(false); } });

  // 触屏视角拖拽（屏幕右半区，整屏监听，不依赖按钮）
  const viewLayer=$('viewLayer');
  if(viewLayer){
    /* 视角拖拽：只用「第一个落在右半屏的触点」。
       以前按 identifier 严格配对，WebView 里 identifier 偶尔会对不上，
       表现就是视角偶尔卡住。现在改成记录一个独立标记，
       touchend 时检查是不是自己那根手指（位置配对容错更大）。 */
    let vx=0, vy=0, vOn=false, viewTid=null;
    viewLayer.addEventListener('touchstart',e=>{
      if(viewTid!==null) return;
      for(const t of e.changedTouches){
        if(viewTid!==null) break;
        viewTid=t.identifier;
        vOn=true; vx=t.clientX; vy=t.clientY;
      }
    }, {passive:true});
    /* 【视角灵敏度】单位是「弧度/像素」。
       历史上调过两次：
         v1: 0.005  → 一划就飞，完全瞄不准
         v2: 0.0026 → 仍然偏快（用户实测「还是太高」）
       现在降到 0.0016：横向划满一整屏（约 800px）≈ 73°，
       这是主流手游 FPS 的默认档位。
       想改手感只需要动这一个数（触屏和鼠标共用）。 */
   const TOUCH_SENS=0.0016;
   const MOUSE_SENS=0.0016;
   viewLayer.addEventListener('touchmove',e=>{
      if(!vOn || viewTid===null) return;
      /* 【关键】必须先用 findTouch 找到「视角自己那根手指」再决定要不要动。
         不能反过来写成 `if(!t) return` 之前就更新起点——
         否则摇杆手指的 touchmove 也会派发到这里，
         虽然被当成「别人的手指」跳过，却会把 vx/vy 覆写成摇杆的位置，
         导致之后右手怎么划都算不出位移（视角卡死）。
         同理，也绝不能用 changedTouches[0] 兜底。 */
      const t=findTouch(e,viewTid); if(!t) return;
      P.yaw-=(t.clientX-vx)*TOUCH_SENS;
      P.pitch-=(t.clientY-vy)*TOUCH_SENS;
      const lim=1.45; if(P.pitch>lim)P.pitch=lim; if(P.pitch<-lim)P.pitch=-lim;
      vx=t.clientX; vy=t.clientY;
    }, {passive:true});
    viewLayer.addEventListener('touchend',e=>{
      if(viewTid===null) return;
      if(!hasTouch(e.changedTouches,viewTid)) return;   // 抬起的不是视角手指
      vOn=false; viewTid=null;
    }, {passive:true});
    viewLayer.addEventListener('touchcancel',e=>{
      if(viewTid===null) return;
      if(!hasTouch(e.changedTouches,viewTid)) return;
      vOn=false; viewTid=null;
    }, {passive:true});
  }
}

/* ============ 搜打撤物品系统 ============
   撤离类游戏的核心循环：买装备 → 带进局 → 搜物资 → 撤离带回。
   这里把「商品定义」和「背包/装备」分开：
   - SHOP_ITEMS 只描述「卖什么、多少钱、有什么属性」
   - P.bag / P.equip 描述「玩家实际拥有什么」
   - BAG_CAP 描述「能带多少」（背包决定容量） */

const SHOP_ITEMS={
  /* ---- 医疗：局内回血，按回复量分档 ---- */
  med:      {cat:'med', name:'医疗包',   icon:'🩹', price:300,  desc:'恢复 40 生命', heal:40},
  med_kit:  {cat:'med', name:'急救包',   icon:'🧰', price:900,  desc:'恢复 100 生命（满血）', heal:100},
  bandage:  {cat:'med', name:'绷带',     icon:'🩶', price:120,  desc:'恢复 15 生命，便宜量大', heal:15},
  painkill:{cat:'med', name:'止痛药',   icon:'💊', price:250,  desc:'恢复 25 生命并短暂加速', heal:25, buff:'speed'},

  /* ---- 道具：一次性消耗 ---- */
  grenade:  {cat:'tool', name:'手雷',    icon:'💣', price:600,  desc:'投掷爆炸，范围伤害', dmg:120},
  smoke:    {cat:'tool', name:'烟雾弹',  icon:'🌫️', price:350,  desc:'制造烟幕遮挡视线'},
  flashbang:{cat:'tool', name:'闪光弹',  icon:'⚡', price:400,  desc:'致盲附近敌人'},
  lockpick: {cat:'tool', name:'开锁器',  icon:'🔧', price:200,  desc:'打开上锁的箱子'},

  /* ---- 子弹：按枪种分类，买的是「发」 ---- */
  ammo_pistol:{cat:'ammo', name:'手枪弹', icon:'🔸', price:80,  desc:'9mm · 50 发', ammo:'pistol', count:50},
  ammo_rifle: {cat:'ammo', name:'步枪弹', icon:'🔹', price:200, desc:'5.56 · 60 发', ammo:'rifle', count:60},
  ammo_sniper:{cat:'ammo', name:'狙击弹', icon:'🔻', price:400, desc:'7.62 · 20 发', ammo:'sniper', count:20},
  ammo_shot:  {cat:'ammo', name:'霰弹',   icon:'🔶', price:180, desc:'12G · 24 发', ammo:'shot', count:24},

  /* ---- 背包：决定容量，越贵能带的越多 ---- */
  bp_pouch: {cat:'bag', name:'战术腰包', icon:'👝', price:500,   desc:'容量 12 格',  cap:12},
  bp_small: {cat:'bag', name:'小型背包', icon:'🎒', price:1500,  desc:'容量 24 格',  cap:24},
  bp_med:   {cat:'bag', name:'中型背包', icon:'🎒', price:3500,  desc:'容量 36 格',  cap:36},
  bp_large: {cat:'bag', name:'大型背包', icon:'🧳', price:7000,  desc:'容量 48 格',  cap:48},

  /* ---- 头盔：减伤 + 耐久 ---- */
  helm_light:{cat:'helmet', name:'战术头盔', icon:'⛑️', price:800,  desc:'减伤 10% · 耐久 60',  reduce:.10, dur:60},
  helm_med:  {cat:'helmet', name:'防弹头盔', icon:'⛑️', price:2200, desc:'减伤 20% · 耐久 120', reduce:.20, dur:120},
  helm_heavy:{cat:'helmet', name:'重型头盔', icon:'🪖', price:5000, desc:'减伤 32% · 耐久 220', reduce:.32, dur:220},

  /* ---- 护甲：减伤 + 耐久 ---- */
  vest_light:{cat:'armor', name:'轻型护甲', icon:'🦺', price:1200, desc:'减伤 15% · 耐久 80',  reduce:.15, dur:80},
  vest_med:  {cat:'armor', name:'标准护甲', icon:'🦺', price:3000, desc:'减伤 25% · 耐久 150', reduce:.25, dur:150},
  vest_heavy:{cat:'armor', name:'重型护甲', icon:'🛡️', price:6500, desc:'减伤 40% · 耐久 260', reduce:.40, dur:260},
};

/* 分类标签（顺序即显示顺序） */
const SHOP_CATS=[
  {id:'med',    name:'医药'},
  {id:'tool',   name:'道具'},
  {id:'ammo',   name:'子弹'},
  {id:'bag',    name:'背包'},
  {id:'helmet', name:'头盔'},
  {id:'armor',  name:'护甲'},
];

let shopTab='med';   // 当前商店标签页
let bagTab='all';    // 当前背包筛选

/* 背包占用格数：数量 1 个占 1 格，子弹按堆叠算 1 格 */
/* 局内背包占用格数（只有 pouch 算容量，stash 无限） */
function pouchUsed(){
  let n=0;
  for(const k in P.pouch){ if(P.pouch[k]>0) n++; }
  return n;
}
function pouchFree(){ return P.bagCap - pouchUsed(); }
/* 兼容旧名字 */
function bagUsed(){ return pouchUsed(); }
function bagFree(){ return pouchFree(); }

/* 往局内背包塞东西（局内拾取用），容量不足返回 false */
function bagAdd(id, cnt){
  if(!cnt) cnt=1;
  if(!P.pouch[id] || P.pouch[id]<=0){
    if(pouchFree()<=0) return false;   // 新物品占新格
    P.pouch[id]=0;
  }
  P.pouch[id]+=cnt;
  return true;
}
/* 从局内背包扣东西 */
function bagTake(id, cnt){
  if(!cnt) cnt=1;
  if(!P.pouch[id] || P.pouch[id]<cnt) return false;
  P.pouch[id]-=cnt;
  if(P.pouch[id]<=0) delete P.pouch[id];
  return true;
}
/* 往局外仓库塞东西（购买/撤离带回用），容量无限 */
function stashAdd(id, cnt){
  if(!cnt) cnt=1;
  P.stash[id]=(P.stash[id]||0)+cnt;
  return true;
}

/* ---- 商店 ---- */
function toggleShop(){
  const s=$('shop'); if(!s) return;
  const opening = s.style.display!=='flex';
  if(opening){ buildShop(); s.style.display='flex'; }
  else s.style.display='none';
}
function closeShop(){ const s=$('shop'); if(s) s.style.display='none'; }

function buildShop(){
  const s=$('shop'); if(!s) return;
  let h='<div class="box" style="max-width:600px">';
  h+='<div class="row" style="justify-content:space-between;align-items:center;margin:0 0 6px">'
    +'<h1 style="margin:0">🛒 商店</h1>'
    +'<div style="color:#ffd54a;font-weight:700">¥'+P.ammo.cash+'</div></div>';
  /* 分类标签 */
  h+='<div class="tabs">';
  for(const c of SHOP_CATS){
    h+='<button class="tab'+(shopTab===c.id?' on':'')+'" data-cat="'+c.id+'">'+c.name+'</button>';
  }
  h+='</div>';
  /* 商品列表 */
  h+='<div class="list">';
  let any=false;
  for(const id in SHOP_ITEMS){
    const it=SHOP_ITEMS[id];
    if(it.cat!==shopTab) continue;
    any=true;
    const owned = (P.stash[id]>0) ? P.stash[id] : 0;
    const eqTag = equipTagOf(id);
    h+='<div class="item'+(P.ammo.cash<it.price?' locked':'')+'">'
      +'<div class="ic">'+it.icon+'</div>'
      +'<div class="info"><div class="n">'+it.name+(eqTag?' <span class="owned">已装备</span>':'')+'</div>'
      +'<div class="d">'+it.desc+'</div></div>'
      +(owned?'<div class="owned">仓库×'+owned+'</div>':'')
      +'<div class="price">¥'+it.price+'</div>'
      +'<button class="btn sm" data-buy="'+id+'">购买</button>'
      +'</div>';
  }
  if(!any) h+='<div class="d" style="text-align:center;padding:14px">暂无商品</div>';
  h+='</div>';
  /* 底部：说明 + 关闭 */
  h+='<div class="row" style="margin-top:10px;align-items:center;justify-content:space-between">'
    +'<div class="d">买到的物品进仓库 · 出击前在仓库里装包</div>'
    +'<button class="btn ghost" id="closeShop">关闭</button></div>';
  h+='</div>';
  s.innerHTML=h;

  /* 绑定事件 */
  s.querySelectorAll('.tab').forEach(b=>{
    b.onclick=()=>{ shopTab=b.getAttribute('data-cat'); sfxUI(); buildShop(); };
  });
  s.querySelectorAll('[data-buy]').forEach(b=>{
    b.onclick=()=>{ buyItem(b.getAttribute('data-buy')); };
  });
  const cs=$('closeShop'); if(cs) cs.onclick=()=>{ sfxUI(); closeShop(); };
}

function equipTagOf(id){
  const e=P.equip;
  return (e.helmet===id)||(e.armorVest===id)||(e.backpack===id);
}

/* 购买逻辑：扣钱 → 装备类直接穿上 → 其余进「局外仓库」
   【关键】商店是局外功能，买的东西一律进 stash，不占局内背包格子。
   出击前要去仓库把物资装进背包，这才是搜打撤的整备流程。 */
function buyItem(id){
  const it=SHOP_ITEMS[id]; if(!it) return;
  if(P.ammo.cash < it.price){ sfxDeny(); toast('货币不足'); return; }

  const cat=it.cat;
  /* 装备类：直接穿戴（等同买完立刻装备），也记一份进仓库 */
  if(cat==='helmet'){
    P.ammo.cash-=it.price;
    P.equip.helmet=id; P.helmetDur=it.dur;
    sfxBuy(); toast('已装备 '+it.name); refreshHUD(); buildShop(); return;
  }
  if(cat==='armor'){
    P.ammo.cash-=it.price;
    P.equip.armorVest=id; P.vestDur=it.dur;
    sfxBuy(); toast('已装备 '+it.name); refreshHUD(); buildShop(); return;
  }
  if(cat==='bag'){
    P.ammo.cash-=it.price;
    P.equip.backpack=id; P.bagCap=it.cap;
    sfxBuy(); toast('背包装备成功，出击背包 '+it.cap+' 格'); refreshHUD(); buildShop(); return;
  }

  /* 消耗品/子弹：全部进仓库，仓库容量无限 */
  P.ammo.cash-=it.price;
  stashAdd(id,1);
  if(cat==='ammo'){
    const key=it.ammo;
    P.ammo[key]=(P.ammo[key]||0)+it.count;
    sfxBuy(); toast(it.name+' +'+it.count+' → 仓库');
  }else{
    sfxBuy(); toast('买下 '+it.name+' → 仓库');
  }
  refreshHUD(); buildShop(); return;
}

/* ============ 局外仓库 / 局内背包 ============
   搜打撤的两层容器，必须完全分开：

   ┌─ 局外（主菜单）──────────────────────────┐
   │  仓库 stash：容量无限，安全，死亡不掉      │
   │  在这里整备：把装备穿上、把物资塞进背包     │
   └──────────────────────────────────────┘
   ┌─ 局内（进游戏）──────────────────────────┐
   │  背包 pouch：容量 = 背包装备给的格子       │
   │  Tab / B 打开，能用的只有包里这点东西      │
   │  撤离成功 → 并入 stash；阵亡 → 全部丢失     │
   └──────────────────────────────────────┘ */

/* ---- 仓库（局外） ---- */
function toggleStash(){
  const el=$('stash'); if(!el) return;
  const opening = el.style.display!=='flex';
  if(opening){ buildStash(); el.style.display='flex'; }
  else el.style.display='none';
}
function closeStash(){ const el=$('stash'); if(el) el.style.display='none'; }

/* 仓库里的东西搬到出击背包 */
function stashTake(id, n){
  const cnt = n||(P.stash[id]||0);
  if(!(P.stash[id]>0)) return false;
  const move = Math.min(cnt, P.stash[id]);
  /* 出击包按格算：新物品要占一格 */
  if(!(P.pouch[id]>0) && pouchUsed()>=P.bagCap){ toast('出击背包已满（'+P.bagCap+' 格）'); sfxDeny(); return false; }
  P.stash[id]-=move;
  if(P.stash[id]<=0) delete P.stash[id];
  P.pouch[id]=(P.pouch[id]||0)+move;
  sfxPickup(); return true;
}
/* 出击背包里的东西放回仓库 */
function stashPut(id, n){
  if(!(P.pouch[id]>0)) return false;
  const move = Math.min(n||P.pouch[id], P.pouch[id]);
  P.pouch[id]-=move;
  if(P.pouch[id]<=0) delete P.pouch[id];
  P.stash[id]=(P.stash[id]||0)+move;
  sfxPickup(); return true;
}

function buildStash(){
  const el=$('stash'); if(!el) return;
  let h='<div class="box" style="max-width:660px">';
  h+='<div class="row" style="justify-content:space-between;align-items:center;margin:0 0 6px">'
    +'<h1 style="margin:0">🏠 仓库</h1>'
    +'<div style="color:#ffd54a;font-weight:700">¥'+P.ammo.cash+'</div></div>';

  /* 装备栏：出击时真正带进局的三件 */
  h+='<div class="tabs"><span class="tab on" style="cursor:default">出击装备</span></div>';
  h+='<div class="grid">';
  h+=cellOf(P.equip.helmet,'头盔','🪖');
  h+=cellOf(P.equip.armorVest,'护甲','🦺');
  h+=cellOf(P.equip.backpack,'背包','🎒');
  h+='</div>';

  /* 两栏：仓库 ↔ 出击背包 */
  h+='<div class="stashrow" style="margin-top:10px">';

  /* 左：仓库 */
  h+='<div class="stashcol"><div class="tabs"><span class="tab on" style="cursor:default">📦 仓库</span></div><div class="grid">';
  let n=0;
  for(const id in P.stash){
    if(!(P.stash[id]>0)) continue;
    const it=SHOP_ITEMS[id]; if(!it) continue;
    n++;
    h+='<div class="cell" data-out="'+id+'"><div class="ci">'+it.icon+'</div>'
      +'<div class="cn">'+it.name+'</div><div class="cq">×'+P.stash[id]+'</div></div>';
  }
  if(!n) h+='<div class="d" style="grid-column:1/-1;text-align:center;padding:10px">仓库是空的</div>';
  h+='</div></div>';

  /* 右：出击背包 */
  h+='<div class="stashcol"><div class="tabs"><span class="tab on" style="cursor:default">🎒 出击背包 '+pouchUsed()+'/'+P.bagCap+'</span></div><div class="grid">';
  let m=0;
  for(const id in P.pouch){
    if(!(P.pouch[id]>0)) continue;
    const it=SHOP_ITEMS[id]; if(!it) continue;
    m++;
    h+='<div class="cell" data-in="'+id+'"><div class="ci">'+it.icon+'</div>'
      +'<div class="cn">'+it.name+'</div><div class="cq">×'+P.pouch[id]+'</div></div>';
  }
  if(!m) h+='<div class="d" style="grid-column:1/-1;text-align:center;padding:10px">点左边的物品装进来</div>';
  h+='</div></div>';

  h+='</div>';
  h+='<div class="row" style="margin-top:10px;align-items:center;justify-content:space-between">'
    +'<div class="d">点仓库物品 → 装进背包 · 点背包物品 → 放回仓库</div>'
    +'<button class="btn ghost" id="closeStash">关闭</button></div>';
  h+='</div>';
  el.innerHTML=h;

  el.querySelectorAll('[data-out]').forEach(c=>{
    c.onclick=()=>{ if(stashTake(c.getAttribute('data-out'))) buildStash(); };
  });
  el.querySelectorAll('[data-in]').forEach(c=>{
    c.onclick=()=>{ if(stashPut(c.getAttribute('data-in'))) buildStash(); };
  });
  const cs=$('closeStash'); if(cs) cs.onclick=()=>{ sfxUI(); closeStash(); };
}

/* ---- 局内背包 ---- */
function toggleBag(){
  const b=$('bag'); if(!b) return;
  const opening = b.style.display!=='flex';
  if(opening){ buildBag(); b.style.display='flex'; }
  else b.style.display='none';
}
function closeBag(){ const b=$('bag'); if(b) b.style.display='none'; }

function buildBag(){
  const b=$('bag'); if(!b) return;
  let h='<div class="box" style="max-width:600px">';
  h+='<div class="row" style="justify-content:space-between;align-items:center;margin:0 0 6px">'
    +'<h1 style="margin:0">🎒 背包</h1>'
    +'<div class="d">'+pouchUsed()+'/'+P.bagCap+' 格</div></div>';

  /* 身上装备（局内可查看，不能更换） */
  h+='<div class="tabs"><span class="tab on" style="cursor:default">装备中</span></div>';
  h+='<div class="grid">';
  h+=cellOf(P.equip.helmet, '头盔', '🪖');
  h+=cellOf(P.equip.armorVest, '护甲', '🦺');
  h+=cellOf(P.equip.backpack, '背包', '🎒');
  h+='</div>';

  /* 局内只有 pouch 里的东西 */
  h+='<div class="tabs" style="margin-top:10px"><span class="tab on" style="cursor:default">携带物品</span></div>';
  h+='<div class="grid">';
  let cnt=0;
  for(const id in P.pouch){
    if(!(P.pouch[id]>0)) continue;
    const it=SHOP_ITEMS[id]; if(!it) continue;
    cnt++;
    const usable = (it.heal || id==='grenade' || id==='flashbang' || id==='smoke');
    h+='<div class="cell'+(usable?'':' lk2')+'" data-use="'+id+'">'
      +'<div class="ci">'+it.icon+'</div>'
      +'<div class="cn">'+it.name+'</div>'
      +'<div class="cq">×'+P.pouch[id]+'</div>'
      +'</div>';
  }
  if(!cnt) h+='<div class="d" style="grid-column:1/-1;text-align:center;padding:14px">背包是空的（仓库里塞点东西再出击）</div>';
  h+='</div>';

  h+='<div class="row" style="margin-top:10px;align-items:center;justify-content:space-between">'
    +'<div class="d">点击使用 · 撤离才能带回仓库</div>'
    +'<button class="btn ghost" id="closeBag">关闭</button></div>';
  h+='</div>';
  b.innerHTML=h;

  b.querySelectorAll('[data-use]').forEach(el=>{
    el.onclick=()=>{ useItem(el.getAttribute('data-use')); };
  });
  const cb=$('closeBag'); if(cb) cb.onclick=()=>{ sfxUI(); closeBag(); };
}

function cellOf(id, label, fb){
  if(!id) return '<div class="cell"><div class="ci" style="opacity:.25">'+fb+'</div><div class="cn">'+label+'</div><div class="cq lk">空</div></div>';
  const it=SHOP_ITEMS[id];
  let extra='';
  if(it&&it.dur){
    const cur = (it.cat==='helmet')?P.helmetDur:P.vestDur;
    if(cur>0) extra=' <span class="lk">'+Math.round(cur)+'</span>';
  }
  return '<div class="cell eq"><div class="ci">'+(it?it.icon:fb)+'</div><div class="cn">'+(it?it.name:label)+extra+'</div><div class="cq">'+label+'</div></div>';
}

/* 使用背包（pouch）里的物品 */
function useItem(id){
  const it=SHOP_ITEMS[id]; if(!it) return;
  if(!(P.pouch[id]>0)){ sfxDeny(); return; }
  if(it.heal){
    if(P.hp>=100){ sfxDeny(); toast('生命已满'); return; }
    P.pouch[id]--; if(P.pouch[id]<=0) delete P.pouch[id];
    P.hp=Math.min(100,P.hp+it.heal);
    sfxPickup(); toast(it.name+' +'+it.heal+' HP');
    refreshHUD(); buildBag(); return;
  }
  if(id==='grenade'||id==='flashbang'||id==='smoke'){
    P.pouch[id]--; if(P.pouch[id]<=0) delete P.pouch[id];
    sfxPickup(); toast('已投掷 '+it.name); buildBag(); return;
  }
  toast(it.name+' 局内无法直接使用'); sfxDeny();
}

/* ---- 撤离 / 阵亡 结算 ---- */
/* 撤离成功：局内背包 + 身上装备全部并回仓库 */
function settleExfil(){
  let gained=0;
  for(const id in P.pouch){
    if(P.pouch[id]>0){ P.stash[id]=(P.stash[id]||0)+P.pouch[id]; gained+=P.pouch[id]; }
  }
  P.pouch={};
  /* 装备也一起"带回"，保留在 equip 里继续用 */
  toast('撤离成功！带回 '+gained+' 件物品');
}
/* 阵亡：局内背包和装备全部丢失（搜打撤的风险） */
function settleDeath(){
  const lost=Object.keys(P.pouch).length;
  P.pouch={};
  P.equip={ helmet:null, armorVest:null, backpack:null };
  P.helmetDur=0; P.vestDur=0; P.bagCap=0;
  return lost;
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindUI);
else bindUI();