/* ============ f_ui.js：菜单/商店/HUD/输入/摇杆 ============ */
let touchMoveX=0, touchMoveY=0;

function refreshHUD(){
  const hp=$('hpNum'); if(hp) hp.textContent=Math.round(P.hp);
  const hf=$('hpfill'); if(hf){ hf.style.width=Math.max(0,P.hp)+'%'; hf.classList.toggle('low',P.hp<30); }
  /* 【弹药 HUD】按当前手持槽取数：
     主武器 -> P.ammo.gun / 后备 P.ammo.rifle
     手枪   -> P.ammo.ammo / 后备 P.ammo.pistol
     ​副武器 -> 不显示弹药，显示「近战」 */
  const am=$('ammo');
  const ar=$('ammoReserve');
  const ak=curAmmoKey(), rk=curReserveKey();
  if(am){
    if(ak===null) am.textContent='∞';
    else am.textContent=(P.ammo[ak]|0);
  }
  if(ar){
    if(rk===null) ar.textContent='近战';
    else ar.textContent=((P.ammo[rk]|0)||(P.ammo.ammo|0));
  }
  const money=$('money'); if(money) money.textContent=P.ammo.cash;
  const mm=$('mMoney'); if(mm) mm.textContent=P.ammo.cash;
  /* 武器名：显示当前手持的实际枪名，而不是笼统的「步枪/手枪」 */
  const wpn=$('wpnName');
  if(wpn){
    const id=slotItem(P.slot);
    const it=id&&SHOP_ITEMS[id];
    wpn.textContent = it ? it.name : slotName(P.slot);
  }
  /* 射击模式徽标：全自动/半自动/栓动/泵动/近战。
     玩家换了枪如果不显示模式，根本不知道这把是点射还是连发。 */
  const fmt=$('fireModeTag');
  if(fmt){
    const mode=curFireMode();
    const melee=(mode==='melee');
    fmt.textContent = melee ? T('近战') : fireModeLabel();
    fmt.className = melee ? '' : mode;
    fmt.style.display='';
  }
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
  buildWpnBar();
  setWpnBarVisible(true);
  const tip=$('htip'); if(tip) tip.textContent='📱 右半屏拖动转视角 · 左摇杆移动 · 右下按钮作战';
}
/* 主菜单/死亡界面时把摇杆和操作按钮收起来。
   之前 #joyZone 是常驻 display:block，层级还压在菜单之上，
   于是主界面也能看到一个摇杆，很碍事。 */
function hideTouchUI(){
  const jz=$('joyZone'); if(jz) jz.style.display='none';
  const az=$('actZone'); if(az) az.style.display='none';
  setWpnBarVisible(false);
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
  initInputModeDetect();   // 键盘/触摸自动切换触摸按键

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
  const start=$('btnPlay'); if(start) start.onclick=()=>{
    $('menu').style.display='none';
    audioInit(); audioResume(); sfxUI();
    /* 进局了：置标记，然后按当前输入方式决定显示摇杆还是纯键盘。
       注意 init() 必须保留 —— 它负责建场景、生成敌人和武器。 */
    window.__inGame=true;
    init();
    applyInputMode(inputMode, true);
  };
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

  /* ===== 键盘映射（按用户指定）=====
       W A S D    移动
       E          互动 / 开门
       鼠标左键    开火        （在下面的 mousedown 里）
       鼠标右键    瞄准        （在下面的 mousedown/mouseup 里）
       Shift      趴下        （左右 Shift 都可以）
       右 Shift   趴下        （同上）
       Space      跳跃
       Ctrl+W     奔跑
       R          换弹
       B / Tab    背包
       Q          商店
       Esc        关闭面板
   ============================== */
  addEventListener('keydown',e=>{
    P.keys[e.code]=true;

    /* Ctrl+W 奔跑：以前 Ctrl 被拿来做「趴下」，和奔跑冲突；
       现在趴下给 Shift，Ctrl 只负责奔跑。
       注意浏览器里 Ctrl+W 是关闭标签页的快捷键，这里必须 preventDefault
       拦下来，否则玩家一按就把页面关了。 */
    if(e.code==='KeyW' && (e.ctrlKey||e.metaKey)){
      e.preventDefault();
      P.sprinting=true;
      return;
    }

    if(e.code==='Space'||e.code==='KeyR'||e.code==='KeyQ'||e.code==='KeyE'||e.code==='KeyB'||e.code==='Tab') e.preventDefault();
    if(e.code==='KeyR') startReload();
    if(e.code==='KeyQ') toggleShop();
    if(e.code==='KeyE') interact();
    /* 背包：B 或 Tab 打开/关闭 */
    if(e.code==='KeyB'||e.code==='Tab'){ if(!e.repeat) toggleBag(); }
    if(e.code==='Space'&&!e.repeat) doJump();
    /* 趴下：Shift（左右都行），切换式 */
    if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat) toggleProne();
    /* 数字键 1/2/3 = 主武器 / 手枪 / 副武器（和底部切换条一一对应） */
    if(e.code==='Digit1'&&!e.repeat) switchSlot('primary');
    if(e.code==='Digit2'&&!e.repeat) switchSlot('secondary');
    if(e.code==='Digit3'&&!e.repeat) switchSlot('melee');
    /* X = 循环切枪，懒得记槽位时用 */
    if(e.code==='KeyX'&&!e.repeat) cycleSlot();
    if(e.code==='Escape'){ $('shop').style.display='none'; $('bag').style.display='none'; }
  });
  addEventListener('keyup',e=>{
    P.keys[e.code]=false;
    /* 松开 W 或 Ctrl 就停止奔跑 */
    if(e.code==='KeyW'||e.code==='ControlLeft'||e.code==='ControlRight') P.sprinting=false;
  });
  /* 失焦时清空所有按键，否则切出去再回来会「自己一直走」 */
  addEventListener('blur',()=>{
    P.keys={};
    P.sprinting=false;
    P.firing=false;      // 切出去必须松开扳机，否则回来就是满屏弹壳
    if(typeof endJoy==='function'){ try{ endJoy(); }catch(err){} }
  });
  /* 左键：按住不放记为 P.firing，松开才算停。
     全自动枪的连发不在这个事件里循环，而是由 updFireHold
     在主循环里每帧检查 —— 事件只负责「扳机是否被按住」。
     半自动/栓动/泵动虽然也会把 P.firing 置真，
     但 updFireHold 会直接 return（curIsAuto() 为假），
     所以它们仍然只能靠重新点击开火。 */
  addEventListener('mousedown',e=>{
    if(e.button!==0) return;
    if(!ready) return;
    P.firing=true;
    fire();                          // 按下立刻先打一发，不能等下一帧
  });
  addEventListener('mouseup',e=>{
    if(e.button!==0) return;
    P.firing=false;
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
  /* 移动端开火键：同样用「按住」语义。
     以前只监听 touchstart，所以移动端也打不出连发。
     touchend / touchcancel 都必须清掉，否则手指抬起后
     全自动枪会一直响到弹匣打空。 */
  const fireBtn=$('btnFire');
  if(fireBtn){
    fireBtn.addEventListener('touchstart',e=>{
      if(ready){ P.firing=true; fire(); }
      e.preventDefault();
    },{passive:false});
    const stopFire=()=>{ P.firing=false; };
    fireBtn.addEventListener('touchend',stopFire);
    fireBtn.addEventListener('touchcancel',stopFire);
    /* 桌面调试：鼠标压住按钮也走同一套 */
    fireBtn.addEventListener('mousedown',e=>{ if(ready){ P.firing=true; fire(); } e.preventDefault(); });
    fireBtn.addEventListener('mouseup',()=>{ P.firing=false; });
  }
  const jumpBtn=$('btnJump'); if(jumpBtn){ jumpBtn.addEventListener('touchstart',e=>{ if(ready) doJump(); e.preventDefault(); }); }
  const reloadBtn=$('btnReload'); if(reloadBtn){ reloadBtn.addEventListener('touchstart',e=>{ startReload(); e.preventDefault(); }); }
  const sprintBtn=$('btnSprint'); if(sprintBtn){
    sprintBtn.addEventListener('touchstart',e=>{ P.sprinting=true; e.preventDefault(); });
    sprintBtn.addEventListener('touchend',()=>{ P.sprinting=false; });
  }
  /* 趴下：点一下切换（不是按住），和跳跃一样是瞬时动作 */
  const proneBtn=$('btnProne'); if(proneBtn){
    const tap=(e)=>{ e.preventDefault(); e.stopPropagation(); toggleProne(); };
    proneBtn.addEventListener('touchstart',tap,{passive:false});
    proneBtn.addEventListener('click',tap);
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
  /* 右键瞄准：按住开镜，松开还原。
     必须同时屏蔽浏览器右键菜单，否则一按右键先弹出一个菜单，
     瞄准根本没法用。只在画布上屏蔽，不影响其它区域。 */
  addEventListener('contextmenu',e=>{
    if(e.target && (e.target.tagName==='CANVAS' || e.target.id==='viewLayer')){
      e.preventDefault();
    }
  });
  addEventListener('mousedown',e=>{ if(e.button===2&&ready){ e.preventDefault(); if(window.__setAim) window.__setAim(true); } });
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

/* 装备槽定义：顺序就是左侧从上到下的顺序 */
/* 【i18n】label 用 getter 而不是字面量：
   数组在脚本加载时只求值一次，如果这里直接写 T('主武器')，
   语言切换后这些 label 还停在加载时的语言。
   getter 每次读取时现算，切换语言立即生效。 */
const SLOTS=[
  { key:'primary',  get label(){ return T('主武器'); },  fb:'🔫', accept:['gun'] },
  { key:'secondary',get label(){ return T('手枪'); },    fb:'🔫', accept:['pistol'] },
  { key:'melee',    get label(){ return T('副武器'); },  fb:'🔪', accept:['melee'] },
  { key:'chest',    get label(){ return T('胸挂'); },    fb:'🦺', accept:['chest'] },
  { key:'backpack', get label(){ return T('背包'); },    fb:'🎒', accept:['bag'] },
];

const SHOP_ITEMS={
  /* ---- 医疗：局内回血，按回复量分档 ---- */
  med:      {cat:'med', get name(){ return T('医疗包'); },   icon:'🩹', price:300,  get desc(){ return T('恢复 40 生命'); }, heal:40},
  med_kit:  {cat:'med', get name(){ return T('急救包'); },   icon:'🧰', price:900,  get desc(){ return T('恢复 100 生命（满血）'); }, heal:100},
  bandage:  {cat:'med', get name(){ return T('绷带'); },     icon:'🩶', price:120,  get desc(){ return T('恢复 15 生命，便宜量大'); }, heal:15},
  painkill:{cat:'med', get name(){ return T('止痛药'); },   icon:'💊', price:250,  get desc(){ return T('恢复 25 生命并短暂加速'); }, heal:25, buff:'speed'},

  /* ---- 道具：一次性消耗 ---- */
  grenade:  {cat:'tool', get name(){ return T('手雷'); },    icon:'💣', price:600,  get desc(){ return T('投掷爆炸，范围伤害'); }, dmg:120},
  smoke:    {cat:'tool', get name(){ return T('烟雾弹'); },  icon:'🌫️', price:350,  get desc(){ return T('制造烟幕遮挡视线'); }},
  flashbang:{cat:'tool', get name(){ return T('闪光弹'); },  icon:'⚡', price:400,  get desc(){ return T('致盲附近敌人'); }},
  lockpick: {cat:'tool', get name(){ return T('开锁器'); },  icon:'🔧', price:200,  get desc(){ return T('打开上锁的箱子'); }},

  /* ---- 子弹：按枪种分类，买的是「发」 ---- */
  ammo_pistol:{cat:'ammo', get name(){ return T('手枪弹'); }, icon:'🔸', price:80,  get desc(){ return T('9mm · 50 发'); }, ammo:'pistol', count:50},
  ammo_rifle: {cat:'ammo', get name(){ return T('步枪弹'); }, icon:'🔹', price:200, get desc(){ return T('5.56 · 60 发'); }, ammo:'rifle', count:60},
  ammo_sniper:{cat:'ammo', get name(){ return T('狙击弹'); }, icon:'🔻', price:400, get desc(){ return T('7.62 · 20 发'); }, ammo:'sniper', count:20},
  ammo_shot:  {cat:'ammo', get name(){ return T('霰弹'); },   icon:'🔶', price:180, get desc(){ return T('12G · 24 发'); }, ammo:'shot', count:24},

  /* ---- 背包：决定容量，越贵能带的越多 ---- */
  bp_pouch: {cat:'bag', get name(){ return T('战术腰包'); }, icon:'👝', price:500,   get desc(){ return T('容量 12 格'); },  cap:12},
  bp_small: {cat:'bag', get name(){ return T('小型背包'); }, icon:'🎒', price:1500,  get desc(){ return T('容量 24 格'); },  cap:24},
  bp_med:   {cat:'bag', get name(){ return T('中型背包'); }, icon:'🎒', price:3500,  get desc(){ return T('容量 36 格'); },  cap:36},
  bp_large: {cat:'bag', get name(){ return T('大型背包'); }, icon:'🧳', price:7000,  get desc(){ return T('容量 48 格'); },  cap:48},

  /* ---- 头盔：减伤 + 耐久 ---- */
  helm_light:{cat:'helmet', get name(){ return T('战术头盔'); }, icon:'⛑️', price:800,  get desc(){ return T('减伤 10% · 耐久 60'); },  reduce:.10, dur:60},
  helm_med:  {cat:'helmet', get name(){ return T('防弹头盔'); }, icon:'⛑️', price:2200, get desc(){ return T('减伤 20% · 耐久 120'); }, reduce:.20, dur:120},
  helm_heavy:{cat:'helmet', get name(){ return T('重型头盔'); }, icon:'🪖', price:5000, get desc(){ return T('减伤 32% · 耐久 220'); }, reduce:.32, dur:220},

  /* ---- 护甲：减伤 + 耐久 ---- */
  vest_light:{cat:'armor', get name(){ return T('轻型护甲'); }, icon:'🦺', price:1200, get desc(){ return T('减伤 15% · 耐久 80'); },  reduce:.15, dur:80},
  vest_med:  {cat:'armor', get name(){ return T('标准护甲'); }, icon:'🦺', price:3000, get desc(){ return T('减伤 25% · 耐久 150'); }, reduce:.25, dur:150},
  vest_heavy:{cat:'armor', get name(){ return T('重型护甲'); }, icon:'🛡️', price:6500, get desc(){ return T('减伤 40% · 耐久 260'); }, reduce:.40, dur:260},
  /* ---- 武器槽（对应左侧装备栏） ----
     主武器决定你拿的是步枪还是冲锋枪；手枪是副武器，主武器没子弹时切换用；
     小刀是最后的近战手段，不耗子弹。
     这三个 cat 分别对应 SLOTS 里的 primary / secondary / melee。 */
  gun_rifle:  {cat:'gun',    get name(){ return T('突击步枪'); }, icon:'🔫', price:4500, get desc(){ return T('全自动 · 高伤害'); }, ammoType:'rifle',  dmg:26, fireMode:'auto', fireCd:0.086, mag:30, recoil:1.0, adsZ:0.62, adsY:0.013, sightY:0.092},
  gun_smg:    {cat:'gun',    get name(){ return T('冲锋枪'); },   icon:'🔫', price:2800, get desc(){ return T('射速快 · 后坐力小'); }, ammoType:'pistol', dmg:18, fireMode:'auto', fireCd:0.070, mag:30, recoil:0.70, adsZ:0.50, adsY:0.012, sightY:0.095},
  gun_sniper: {cat:'gun',    get name(){ return T('狙击步枪'); }, icon:'🎯', price:8000, get desc(){ return T('栓动 · 极高伤害 · 开镜倍率高'); }, ammoType:'sniper', dmg:60, fireMode:'bolt', fireCd:1.30, mag:5, recoil:1.0, adsZ:0.46, adsY:0.020, sightY:0.125, adsFov:0.55},
  gun_dmr:    {cat:'gun',    get name(){ return T('精确射手步枪'); }, icon:'🎯', price:6200, get desc(){ return T('半自动 · 高精度 · 中远距'); }, ammoType:'rifle', dmg:44, fireMode:'semi', fireCd:0.30, mag:20, recoil:1.0, adsZ:0.55, adsY:0.018, sightY:0.108, adsFov:0.72},
  gun_m870:   {cat:'gun',    get name(){ return T('雷明顿 M870'); }, icon:'🔫', price:5200, get desc(){ return T('泵动 · 9 颗弹丸 · 近距一枪致命'); }, ammoType:'shot', dmg:14, fireMode:'pump', fireCd:0.20, mag:7, pumpTime:0.58, pellets:9, recoil:1.0, adsZ:0.60, adsY:0.014, sightY:0.090},
  pis_default:{cat:'pistol', get name(){ return T('制式手枪'); }, icon:'🔫', price:600,  get desc(){ return T('半自动 · 应急副武器'); }, ammoType:'pistol', dmg:14, fireMode:'semi', fireCd:0.17, mag:12, recoil:0.90, adsZ:0.40, adsY:0.012, sightY:0.093},
  pis_heavy:  {cat:'pistol', get name(){ return T('大口径手枪'); }, icon:'🔫', price:1800, get desc(){ return T('半自动 · 高伤副武器'); }, ammoType:'pistol', dmg:24, fireMode:'semi', fireCd:0.24, mag:8, recoil:0.75, adsZ:0.42, adsY:0.013, sightY:0.093},
  melee_knife:{cat:'melee',  get name(){ return T('战术小刀'); }, icon:'🔪', price:200,  get desc(){ return T('近战 · 永不耗弹'); }, dmg:35},
  melee_baton:{cat:'melee',  get name(){ return T('防暴棍'); },   icon:'🏏', price:500,  get desc(){ return T('近战 · 攻击范围大'); }, dmg:28},
  /* ---- 胸挂（对应左侧装备栏，提供额外弹药携带） ---- */
  chest_small:{cat:'chest',  get name(){ return T('简易胸挂'); }, icon:'🦺', price:800,  get desc(){ return T('额外 2 个弹匣位'); }, mags:2},
  chest_med:  {cat:'chest',  get name(){ return T('战术胸挂'); }, icon:'🦺', price:2000, get desc(){ return T('额外 4 个弹匣位'); }, mags:4},
  chest_large:{cat:'chest',  get name(){ return T('重型胸挂'); }, icon:'🦺', price:4500, get desc(){ return T('额外 6 个弹匣位'); }, mags:6},
};

/* 分类标签（顺序即显示顺序） */
const SHOP_CATS=[
  /* 武器分类要放在最前面：这是玩家在仓库里最先要填的三个槽
     （主武器/手枪/副武器），商店里买不到就永远空着。 */
  {id:'gun',    get name(){ return T('主武器'); }},
  {id:'pistol', get name(){ return T('手枪'); }},
  {id:'melee',  get name(){ return T('副武器'); }},
  {id:'chest',  get name(){ return T('胸挂'); }},
  {id:'med',    get name(){ return T('医药'); }},
  {id:'tool',   get name(){ return T('道具'); }},
  {id:'ammo',   get name(){ return T('子弹'); }},
  {id:'bag',    get name(){ return T('背包'); }},
  {id:'helmet', get name(){ return T('头盔'); }},
  {id:'armor',  get name(){ return T('护甲'); }},
];
let shopTab='gun';   // 当前商店标签页（默认停在主武器，对应仓库第一件事）
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
  /* 【新加的四个装备槽】
     主武器/手枪/副武器/胸挂都直接穿上，因为它们只有在装备槽里才有意义。
     但「主武器」比较特殊：玩家可能想先买一把备着，所以我们只在
     对应槽位空着的时候自动装备，否则丢进仓库。 */
  if(cat==='gun'||cat==='pistol'||cat==='melee'||cat==='chest'){
    P.ammo.cash-=it.price;
    const slot=stashSlotOf(id);
    if(slot && !P.equip[slot]){
      P.equip[slot]=id;
      sfxBuy(); toast('已装备 '+it.name); refreshHUD(); buildShop(); return;
    }
    stashAdd(id,1);
    sfxBuy(); toast('买下 '+it.name+' → 仓库'); refreshHUD(); buildShop(); return;
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
  if(opening){ buildStashNew(); el.style.display='flex'; }
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

/* ============ 局外仓库（按设计图重做） ============ */
/* 布局参考塔科夫/暗区突围：
     左侧竖排 —— 返回键、大标题「仓库」、装备槽
                  主武器 / 手枪 / 副武器(小刀) / 胸挂 / 背包
     右侧     —— 顶部现金，下面是仓库格子

   和老实现的区别：
     老的是「左仓库右出击背包」两列平铺，本质还是一维列表。
     现在是真正的「装备槽 + 仓库格子」分离，装备槽管你身上穿什么，
     仓库管你囤了什么，出击背包在装备槽里点「背包」进去装。 */


/* 当前选中的物品（点一下格子选中，再点装备槽放入） */
let selStash=null;

function stashSlotOf(id){
  const it=SHOP_ITEMS[id]; if(!it) return null;
  for(const s of SLOTS){ if(s.accept.includes(it.cat)) return s.key; }
  return null;
}

function buildStashNew(){
  const el=$('stash'); if(!el) return;
  let h='<div class="stk">';

  /* ---------- 左侧：返回 + 标题 + 装备槽 ---------- */
  h+='<div class="stkleft">';
  h+='<button class="stkback" id="stkBack">←</button>';
  h+='<div class="stktitle">仓库</div>';

  /* 装备槽区：每个槽一行，图标 + 槽名 + 当前装备 */
  h+='<div class="stkslots">';
  for(const s of SLOTS){
    const id=P.equip[s.key];
    const it=id?SHOP_ITEMS[id]:null;
    let fill=it?(it.icon):('  ');
    let cls='stkslot'+(it?' on':'');
    let name=it?it.name:s.label;
    /* 背包槽显示容量 */
    let extra='';
    if(s.key==='backpack'){
      extra='<span class="stkcap">'+pouchUsed()+'/'+P.bagCap+'</span>';
    }
    h+='<div class="'+cls+'" data-slot="'+s.key+'">'
      +'<span class="stksi">'+(it?it.icon:s.fb)+'</span>'
      +'<span class="stksn">'+name+'</span>'
      +extra
      +'</div>';
  }
  h+='</div>';

  /* 出击背包格子（在左侧下方，点背包槽展开） */
  h+='<div class="stkpouch" id="stkPouchBox" style="display:none">';
  h+='<div class="stkph">🎒 出击背包 <span class="stkcap">'+pouchUsed()+'/'+P.bagCap+'</span></div>';
  h+='<div class="stkpgrid">';
  let np=0;
  for(const id in P.pouch){
    if(!(P.pouch[id]>0)) continue;
    const it=SHOP_ITEMS[id]; if(!it) continue;
    np++;
    h+='<div class="stkpi" data-pouch="'+id+'" title="'+it.name+'">'+it.icon+'<b>'+P.pouch[id]+'</b></div>';
  }
  if(!np) h+='<div class="stkempty2">空（点击仓库物品放入）</div>';
  h+='</div></div>';

  h+='</div>';   /* 左栏结束 */

  /* ---------- 右侧：现金 + 仓库格子 ---------- */
  h+='<div class="stkright">';
  h+='<div class="stkcash">💵 <b>'+P.ammo.cash+'</b> 元</div>';

  /* 仓库格子：把数量展开成一格一格的小方块。
     塔科夫那种 2×3 大物品我们先不做（手机屏幕太小），
     这里每件物品占一个方块，数量用角标表示。 */
  h+='<div class="stkgrid" id="stkGrid">';
  /* 先铺满底格，形成「一堆格子」的观感 */
  const cellTotal=96;      // 8 列 × 12 行
  let used=0;
  const owned=[];
  for(const id in P.stash){
    if(!(P.stash[id]>0)) continue;
    if(!SHOP_ITEMS[id]) continue;
    owned.push(id);
  }
  /* 已占用格数 = sum(ceil(数量)) 简单按种类算一格，数量累加到角标 */
  used=owned.length;

  /* 渲染有物品的格子 */
  for(const id of owned){
    const it=SHOP_ITEMS[id];
    const sel=(selStash===id)?' sel':'';
    h+='<div class="stkg'+sel+'" data-item="'+id+'">'
      +'<span class="stkgi">'+it.icon+'</span>'
      +'<b class="stkgq">'+P.stash[id]+'</b>'
      +'</div>';
  }
  /* 补空格子，凑成整齐的一片 */
  for(let i=owned.length;i<cellTotal;i++){
    h+='<div class="stkg"></div>';
  }
  h+='</div>';

  h+='</div>';   /* 右栏结束 */

  h+='</div>';   /* 容器结束 */
  el.innerHTML=h;

  /* ---- 绑定事件 ---- */
  const bk=$('stkBack');
  if(bk) bk.onclick=()=>{ selStash=null; toggleStash(); };

  /* 点装备槽：如果是背包就展开出击背包，否则卸下 */
  el.querySelectorAll('[data-slot]').forEach(node=>{
    node.onclick=()=>{
      const k=node.dataset.slot;
      if(k==='backpack'){
        const box=$('stkPouchBox');
        if(box){
          const show=box.style.display==='none';
          box.style.display=show?'':'none';
        }
        return;
      }
      /* 其它槽：点一下卸下到仓库 */
      const cur=P.equip[k];
      if(cur){
        stashAdd(cur,1);
        P.equip[k]=null;
        if(k==='primary'||k==='secondary'||k==='melee') P.inv.gun=true;
        toast('已卸下');
        buildStashNew();
      }
    };
  });

  /* 点仓库格子：选中 / 放入装备槽 / 放进出击背包 */
  el.querySelectorAll('[data-item]').forEach(node=>{
    node.onclick=()=>{
      const id=node.dataset.item;
      const it=SHOP_ITEMS[id]; if(!it) return;

      /* 装备类直接穿上（替换下来的回仓库） */
      const slot=stashSlotOf(id);
      if(slot){
        const old=P.equip[slot];
        if(old && old!==id) stashAdd(old,1);
        P.equip[slot]=id;
        P.stash[id]--;
        if(P.stash[id]<=0) delete P.stash[id];
        /* 背包要重算容量 */
        if(slot==='backpack'){ P.bagCap=it.cap||24; }
        toast('已装备 '+(it.name||''));
        buildStashNew(); refreshHUD();
        return;
      }

      /* 消耗品：放进出击背包 */
      if(P.bagCap<=0){ toast('没有背包，装不了东西'); sfxDeny(); return; }
      if(pouchUsed()>=P.bagCap){ toast('背包满了'); sfxDeny(); return; }
      /* 容量：物品本身占 1 格，一次放 1 个 */
      if(stashTake(id,1)){
        bagAdd(id,1);
        buildStashNew(); refreshHUD();
      }
    };
  });

  /* 点出击背包里的物品：放回仓库 */
  el.querySelectorAll('[data-pouch]').forEach(node=>{
    node.onclick=()=>{
      const id=node.dataset.pouch;
      if(bagTake(id,1)) stashAdd(id,1);
      buildStashNew(); refreshHUD();
    };
  });
}

/* ---- 局内背包 ---- */
function toggleBag(){
  const b=$('bag'); if(!b) return;
  const opening = b.style.display!=='flex';
  if(opening){ buildBagNew(); b.style.display='flex'; }
  else b.style.display='none';
}
function closeBag(){ const b=$('bag'); if(b) b.style.display='none'; }

/* ============ 底部中间：武器切换条 ============
   三个格子对应三个武器槽。点一下就切过去。
   空槽显示为虚线变暗、点了没反应（不是隐藏，让玩家知道「这槽能装东西」）。 */
function buildWpnBar(){
  const el=$('wpnBar'); if(!el) return;
  let h='';
  for(const s of WSLOTS){
    const id=slotItem(s);
    const it=id&&SHOP_ITEMS[id];
    const usable=slotUsable(s);
    const on = (P.slot===s);
    const cls='ws'+(on?' on':'')+(usable?'':' empty');
    /* 名字优先显示具体枪名（突击步枪/制式手枪），
       太长就靠 CSS ellipsis 截断；空槽显示槽位名。 */
    const nm = it ? it.name : slotName(s);
    const ic = it ? it.icon : slotIcon(s);
    h+='<div class="'+cls+'" data-slot="'+s+'" title="'+slotName(s)+'">'
      +'<span class="wi">'+ic+'</span>'
      +'<span class="wn">'+nm+'</span>'
      +'</div>';
  }
  el.innerHTML=h;
  el.querySelectorAll('[data-slot]').forEach(node=>{
    node.onclick=()=>{
      const s=node.dataset.slot;
      /* switchSlot 内部会处理「空槽」「已经是当前槽」这些情况 */
      switchSlot(s);
    };
  });
}

/* 武器条跟着摇杆/按键一起显示隐藏，主菜单上不该出现 */
function setWpnBarVisible(v){
  const el=$('wpnBar'); if(!el) return;
  el.style.display = v ? 'flex' : 'none';
}
function refreshWpnBar(){ buildWpnBar(); }
/* 用户要求「局内背包就是仓库的左边，一模一样就行」。
   所以这里直接复用仓库那套 .stk / .stkleft / .stkright / .stkgrid
   的视觉结构，保证两个界面看起来是同一个系统，只是数据源不同：

     仓库（局外）：左装备槽 + 右 P.stash（无限，死亡不掉）
     背包（局内）：左装备槽 + 右 P.pouch（有限格子，死亡全丢）

   区别只有交互：
     仓库里点物品 = 装备 / 装包
     背包里点物品 = 直接使用（医疗、手雷等），装备只是展示不能换 */
function buildBagNew(){
  const el=$('bag'); if(!el) return;
  let h='<div class="stk">';

  /* ---------- 左侧：返回 + 标题 + 装备槽（只读） ---------- */
  h+='<div class="stkleft">';
  h+='<button class="stkback" id="bagBack">←</button>';
  h+='<div class="stktitle">背包</div>';

  h+='<div class="stkslots">';
  for(const s of SLOTS){
    const id=P.equip[s.key];
    const it=id?SHOP_ITEMS[id]:null;
    let extra='';
    if(s.key==='backpack'){
      extra='<span class="stkcap">'+pouchUsed()+'/'+P.bagCap+'</span>';
    }
    h+='<div class="stkslot'+(it?' on':'')+'" data-ro="'+s.key+'">'
      +'<span class="stksi">'+(it?it.icon:s.fb)+'</span>'
      +'<span class="stksn">'+(it?it.name:s.label)+'</span>'
      +extra
      +'</div>';
  }
  h+='</div>';
  h+='</div>';   /* 左栏结束 */

  /* ---------- 右侧：体力/负重位 + 格子 ---------- */
  h+='<div class="stkright">';
  /* 局内没有钱的概念（现金是撤离后结算的），这里显示剩余空间 */
  const free=Math.max(0, P.bagCap-pouchUsed());
  h+='<div class="stkcash">'+free+' 格空位</div>';

  h+='<div class="stkgrid" id="bagGrid">';
  const owned=[];
  for(const id in P.pouch){
    if(!(P.pouch[id]>0)) continue;
    if(!SHOP_ITEMS[id]) continue;
    owned.push(id);
  }
  const cellTotal=Math.max(48, P.bagCap>0?P.bagCap:48);
  for(const id of owned){
    const it=SHOP_ITEMS[id];
    /* 可以点的：回血 / 投掷 / 弹药（弹药点了补备弹）。
       其余置灰但仍可点击，点了会明确提示为什么不能用。 */
    const usable=(it.heal || id==='grenade'||id==='flashbang'||id==='smoke'
                  || (it.cat==='ammo' && it.ammo));
    h+='<div class="stkg'+(usable?'':' dim')+'" data-use="'+id+'">'
      +'<span class="stkgi">'+it.icon+'</span>'
      +'<b class="stkgq">'+P.pouch[id]+'</b>'
      +'</div>';
  }
  for(let i=owned.length;i<cellTotal;i++){
    h+='<div class="stkg"></div>';
  }
  h+='</div>';
  h+='</div>';   /* 右栏结束 */

  h+='</div>';
  el.innerHTML=h;

  /* 返回 */
  const bk=$('bagBack');
  if(bk) bk.onclick=()=>{ toggleBag(); };

  /* 点物品 = 使用。
     【为什么改成在容器上做委托，而不是给每个格子绑 onclick】
     原来的写法是 `el.querySelectorAll('[data-use]').forEach(n=>n.onclick=...)`，
     看起来没问题，但 useItem() 内部自己又调了一次 buildBagNew()，
     等于「点一下 → 重建 DOM」，刚绑上的节点立刻被 innerHTML 覆盖成新节点，
     新节点上又要等下一轮循环才绑事件，中间有一次点击是打空的。
     更稳的做法是在 #bag 上挂一次委托，用 closest 找目标格子 ——
     无论 DOM 被重建多少次，监听器都挂在没被替换掉的父节点上。 */
  if(!el.__useBound){
    el.__useBound=true;
    el.addEventListener('click', ev=>{
      const g=ev.target && ev.target.closest ? ev.target.closest('[data-use]') : null;
      if(!g) return;
      /* 只读的装备槽（data-ro）不要触发使用 */
      if(g.dataset.ro) return;
      const id=g.dataset.use;
      if(!id) return;
      ev.stopPropagation();
      useItem(id);
    });
  }
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
    refreshHUD(); buildBagNew(); return;
  }
  if(id==='grenade'||id==='flashbang'||id==='smoke'){
    P.pouch[id]--; if(P.pouch[id]<=0) delete P.pouch[id];
    sfxPickup(); toast('已投掷 '+it.name); buildBagNew(); return;
  }
  /* 【弹药物品】点一下就把备弹补到对应枪里。
     以前弹药走到这里只会提示「局内无法直接使用」，
     玩家身上背着一堆子弹却打不出去，看起来就像背包坏了。 */
  if(it.cat==='ammo' && it.ammo){
    const key={rifle:'rifle',pistol:'pistol',sniper:'sniper',shot:'shot'}[it.ammo]||it.ammo;
    const add=it.count||30;
    P.ammo[key]=(P.ammo[key]|0)+add;
    P.pouch[id]--; if(P.pouch[id]<=0) delete P.pouch[id];
    sfxPickup(); toast('装填 '+it.name+' +'+add);
    refreshHUD(); buildBagNew(); return;
  }
  /* 【装备类】这里不允许换装（换装是局外仓库的事），
     但要明确告诉玩家为什么点了没用，而不是静默失败。 */
  if(it.cat==='gun'||it.cat==='pistol'||it.cat==='melee'
     || it.cat==='chest'||it.cat==='backpack'||it.cat==='helmet'||it.cat==='vest'){
    toast(it.name+'：局内不能换装，回仓库再装备'); sfxDeny(); return;
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
  /* 【阵亡清空全部九个槽位】
     原来只写了 helmet/armorVest/backpack 三个，
     后来加了 primary/secondary/melee/chest 四个武器槽却忘了同步，
     结果主武器、手枪、小刀、胸挂在你死后会「跟着你进下一局」——
     等于白捡，搜打撤的风险完全消失了。
     这里改成整表重建，以后再加槽也不会漏。 */
  P.equip={ helmet:null, armorVest:null, backpack:null,
            primary:null, secondary:null, melee:null, chest:null };
  P.helmetDur=0; P.vestDur=0; P.bagCap=0;
  return lost;
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindUI);
else bindUI();/* ============ 输入方式自适应 ============
   需求：
     · 检测到键盘 -> 隐藏触摸按键（摇杆 + 右侧按钮）
     · 检测到触摸  -> 重新显示
     · 键盘映射：
         W A S D    移动
         E          互动（开门）
         鼠标左键    开火
         鼠标右键    瞄准（按住开镜）
         Shift      趴下（切换）
         Space      跳跃
         Ctrl+W     奔跑
         右 Shift   趴下

   实现要点：
     纯「有触摸就显示」会误判：带触摸屏的笔记本一碰就跳回触摸模式；
     纯「按平台判断」也不准：平板接了键盘照样摸屏幕。
     所以用「最近一次真实输入来源」为准，并给个冷却时间，
     避免鼠标微动和触摸抖动来回切。 */

let inputMode='touch';       // 'touch' | 'keyboard'
let lastSwitchAt=0;
const MODE_COOLDOWN=400;     // 切模式后 400ms 内不再切，防抖

function applyInputMode(mode, force){
  const now=Date.now();
  if(!force && mode===inputMode) return;
  if(!force && now-lastSwitchAt<MODE_COOLDOWN) return;
  inputMode=mode;
  lastSwitchAt=now;
  window.__inputMode=mode;

  const jz=$('joyZone'), az=$('actZone');
  if(mode==='keyboard'){
    /* 键盘模式：整块触摸 UI 收起，画面干净 */
    if(jz) jz.style.display='none';
    if(az) az.style.display='none';
    setWpnBarVisible(false);
    window.__joyEnabled=false;
    if(window.__joyTouch) window.__joyTouch.active=false;
    /* 正在拖摇杆的手指如果卡住了，一并清掉，避免人「自己一直往前走」 */
    if(typeof endJoy==='function'){ try{ endJoy(); }catch(e){} }
    const tip=$('htip');
    if(tip){
      tip.textContent='⌨️ WASD 移动 · E 互动 · 左键开火 · 右键瞄准 · Shift/右Shift 趴下 · Space 跳跃 · Ctrl+W 奔跑';
      tip.classList.remove('hide');
      setTimeout(()=>tip.classList.add('hide'), 9000);
    }
  }else{
    /* 触摸模式：只有已经在局内才显示摇杆和按钮，
       主菜单/结算界面保持隐藏（否则主界面上会浮着一个摇杆）。 */
    if(window.__inGame){
      if(jz) jz.style.display='block';
      if(az) az.style.display='block';
      buildWpnBar();
      setWpnBarVisible(true);
    }
    window.__joyEnabled=true;
    const tip=$('htip');
    if(tip){
      tip.textContent='📱 右半屏拖动转视角 · 左摇杆移动 · 右下按钮作战';
      tip.classList.remove('hide');
      setTimeout(()=>tip.classList.add('hide'), 9000);
    }
  }
}

/* 检测到真实键盘按键 */
function onKeyboardSignal(){ applyInputMode('keyboard'); }
/* 检测到真实触摸 */
function onTouchSignal(){ applyInputMode('touch'); }

/* 启动检测：
   · keydown 任何键 -> 键盘模式（排除纯修饰键连按造成的抖动由冷却兜住）
   · touchstart -> 触摸模式
   · mousemove 不算「键盘」也不算「触摸」，保持当前模式
   · 鼠标点击 -> 有指针设备，按键盘模式处理（桌面用户不想要触摸按钮） */
function initInputModeDetect(){
  if(window.__inputDetectBound) return;
  window.__inputDetectBound=true;

  addEventListener('keydown', e=>{
    /* 只认真实的字符/功能键，修饰键单独按不算（防止 Alt+Tab 之类误切） */
    if(e.key==='Shift'||e.key==='Control'||e.key==='Alt'||e.key==='Meta') return;
    onKeyboardSignal();
  }, {passive:true});

  addEventListener('touchstart', ()=>{
    onTouchSignal();
  }, {passive:true});

  addEventListener('mousedown', e=>{
    /* 鼠标左键按下视为桌面用户 */
    if(e.pointerType==='touch') { onTouchSignal(); return; }
    onKeyboardSignal();
  }, {passive:true});

  /* 初始判定：有精确指针（鼠标）且没有粗指针（触摸）就是纯桌面。
     用 try 包住是因为部分 WebView / 测试环境没有 matchMedia，
     这种环境下一律按触摸处理（最保守，至少按钮能用）。 */
  try{
    const maxTouch = (typeof navigator!=='undefined' && navigator.maxTouchPoints) || 0;
    const coarse = (typeof matchMedia==='function') && matchMedia('(pointer:coarse)').matches;
    const hover  = (typeof matchMedia==='function') && matchMedia('(hover:hover)').matches;
    const isTouch = maxTouch>0 || coarse;
    applyInputMode((!isTouch || hover) ? 'keyboard' : 'touch', true);
  }catch(e){
    try{ applyInputMode('touch', true); }catch(e2){ /* 极端环境下直接放弃检测 */ }
  }
}