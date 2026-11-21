/* ============ f_ui.js：菜单/商店/HUD/输入/摇杆 ============ */
let touchMoveX=0, touchMoveY=0;

/* ================= 事件沙箱：判断这次点击是不是落在 UI 上 =================
   【为什么要它】全局 mousedown 只管「开火」，但它挂在 window 上，
   分不清「玩家想射击」和「玩家在按 HUD 按钮」。
   凡是命中了下面这些元素的点击，一律不当成开火：
     · 任何 button / .pill（音量、背包、治疗、金币……）
     · 右下角操作按钮群 #actZone（那里有自己的 touchstart 处理）
     · 摇杆 #joyZone / 视角层 #viewLayer
     · 任何打开的浮层面板（商店/背包/仓库/改枪台/死亡/菜单/搜刮箱）
     · 武器切换条 #wpnBar
   用 closest 向上找，所以点在图标/文字上（svg、span）也算命中父按钮。 */
const UI_SELECTOR=[
  '#topbar','#actZone','#joyZone','#viewLayer','#wpnBar',
  '#menu','#shop','#bag','#stash','#gunsmith','#death','#lootBox',
  '#gmPanel','#orientMask','#saveRow','#__bootdiag','button'
].join(',');
function isUIEvent(e){
  if(!e) return false;
  const t=e.target;
  if(!t) return false;
  /* tagName 存在才说明是真 DOM 元素（排除 canvas 和桩对象） */
  if(!t.tagName) return false;
  if(t.tagName==='CANVAS'){
    /* canvas 只有主画布 #c 算「游戏区域」，小地图是 UI */
    return t.id==='mmCanvas';
  }
  if(t.closest){
    try{ if(t.closest(UI_SELECTOR)) return true; }catch(err){}
  }
  return false;
}

/* ================= 「假鼠标」识别（前置共享实现）=================
   【为什么要前置】全局开火监听在 bindUI 里（约 460 行），必须先能调
   isSyntheticMouse；而完整识别逻辑原本写在 2700 多行的输入检测里，
   形式是 const 箭头函数 —— 不提升，提前调用直接 ReferenceError。
   现在把判据集中成这一份前置实现，输入检测那边直接复用。
   判据（从可靠到兜底）：
     · pointerType === 'touch'                  → 触摸
     · sourceCapabilities.firesTouchEvents      → 触屏合成的兼容事件
     · 最近 1.2 秒内有真实 touchstart/touchmove → 必然是合成的
     · 老 WebView 无 pointerType 字段且有过触摸 → 当合成处理 */
let lastRealTouchAt = 0;
addEventListener('touchstart', ()=>{ lastRealTouchAt=Date.now(); }, {passive:true, capture:true});
addEventListener('touchmove',  ()=>{ lastRealTouchAt=Date.now(); }, {passive:true, capture:true});
function isSyntheticMouse(e){
  if(!e) return true;
  if(e.pointerType==='touch') return true;
  const sc=e.sourceCapabilities;
  if(sc && sc.firesTouchEvents===true) return true;
  if(Date.now()-lastRealTouchAt < 1200) return true;
  if(e.pointerType===undefined && lastRealTouchAt>0) return true;
  return false;
}

function refreshHUD(){
  /* 【撤离倒计时 HUD】
     原来 #timer 这个 pill 是个摆设：整个代码库搜 'timer' 没有任何写入，
     永远是 HTML 里写死的 00:00。现在它真正显示本局剩余时间，
     低于 60 秒变红并闪烁，给玩家最后的机会往撤离点跑。 */
  const tm=$('timer');
  if(tm){
    const left = (typeof RAID_LIMIT==='number') ? (RAID_LIMIT - (P.raidT||0)) : 0;
    const l = Math.max(0, Math.ceil(left));
    const mm = Math.floor(l/60), ss = l%60;
    const txt = mm+':'+(ss<10?'0':'')+ss;
    if(tm.textContent!==txt) tm.textContent=txt;
    const low = l<=60;
    tm.style.color = low ? '#ff5a4a' : '';
    tm.style.fontWeight = low ? '800' : '';
    /* 最后一分钟闪烁：用 CSS 类而不是逐帧改样式，避免每帧重排 */
    const pill=tm.parentElement;
    if(pill && pill.classList){ pill.classList.toggle('lowtime', low); }
  }
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
  /* 【治疗按钮】同步数量与可用状态。
     数量 = 胸挂 + 背包里的所有治疗品总数，这样玩家一眼知道自己还剩几口药。
     没药或者满血时按钮变暗（.none），点它也不会有反馈骗人。 */
  const mb=$('medBtn');
  if(mb){
    const n=medTotalCount();
    const nb=$('medBtnN'); if(nb) nb.textContent=n;
    mb.classList.toggle('none', n<=0 || P.hp>=100);
  }
}
/* 统计身上（胸挂 + 背包）所有治疗品的总数 */
function medTotalCount(){
  let n=0;
  const add=(box)=>{
    for(const id in box){
      const it=SHOP_ITEMS[id];
      if(it && it.heal && box[id]>0) n+=box[id];
    }
  };
  add(P.chestPouch); add(P.pouch);
  return n;
}
/* 【一键治疗】不打开背包也能立刻吃药。
   挑药策略按优先级：
     1. 先胸挂后背包 —— 胸挂本来就是「急用格」，掏出来最快；
     2. 同级里优先选「刚好能补满」的最小药，避免满血差 5 点却吃掉一个
        900 块的急救包；
     3. 找不到刚好够的，就选当前能用的、heal 最大的那个（救命优先）。
   这样玩家连点治疗时，不会因为一个绷带把急救包浪费掉。 */
function medQuickUse(){
  if(P.hp>=100){ sfxDeny(); toast('生命已满'); return false; }
  const need=100-P.hp;
  const cands=[];
  const scan=(box,src)=>{
    for(const id in box){
      const it=SHOP_ITEMS[id];
      if(!it || !it.heal || !(box[id]>0)) continue;
      cands.push({id, src, heal:it.heal, price:it.price||0, name:it.name});
    }
  };
  scan(P.chestPouch,'chest');   // 胸挂先入列
  scan(P.pouch,'bag');
  if(!cands.length){ sfxDeny(); toast('没有可用的药'); return false; }
  // 刚好够补满的里挑最便宜的；否则挑 heal 最大的
  const enough=cands.filter(c=>c.heal>=need);
  let pick;
  if(enough.length){
    enough.sort((a,b)=> (a.heal-b.heal) || (a.price-b.price));
    pick=enough[0];
  } else {
    cands.sort((a,b)=> b.heal-a.heal);
    pick=cands[0];
  }
  useItem(pick.id, pick.src);
  return true;
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
     【重要修改】标志位原来在函数第一行就置 true。
     如果函数中途抛错（比如某个 xxx 还没定义），
     标志位已经立住了 —— 第二次调用直接 return，
     结果就是「所有按钮一个都没绑上，而且没有任何报错」。
     现在改成：只在【完整跑完】之后才置 true，
     并且每一步用 safe() 包住，单个失败不拖垮后面的绑定。
     这就是用户报的「主界面所有按钮点不动、但按钮有按下反馈」的根因：
     CSS 的 :active 是浏览器自己做的，不需要 JS；
     而 onclick 需要 JS 绑 —— JS 中断了，按钮自然只剩视觉反馈。 */
  if(window.__uiBound) return;
  /* 单步容错执行器：失败只记日志，继续绑后面的 */
  const safe=(label,fn)=>{ try{ fn(); }catch(e){ console.error('bindUI.'+label+' failed', e); } };

  safe('bindDoorHint', ()=>bindDoorHint());   // 门提示条点击交互（手机端没有键盘）
  safe('initInputModeDetect', ()=>initInputModeDetect());   // 键盘/触摸自动切换触摸按键
  safe('hideTouchUI', ()=>hideTouchUI());   // 一进页面就是主菜单，摇杆/操作按钮先收起来

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
  /* 【主菜单按钮】这一整块用 try 包住 —— 之前如果这里前面有任何一处
     抛错，后面的按钮就全都不绑，表现正是「主界面所有按钮都点不动」。
     现在每类绑定各自兜底，一个坏掉不影响其它。 */

  /* ---------------------------------------------------------------
     【问题 2 修复：只有「开始」能点，其它按钮全都点不动】

     现象：btnPlay 有反应，商店/仓库/改枪台/导出/导入/重置/返回全都没反应。

     原因在这一整块的组织方式上：它们全在**同一个 try{} 里**。
     只要其中任何一句抛错（比如 exportSave 在那一刻还不可用、
     或者某个 $() 返回的元素在结构上不存在导致属性访问失败），
     try 立刻跳到 catch —— 而 catch 只是 console.error，
     接着整个菜单块就结束了。
     于是**排在抛错点之后的按钮全部没绑上**。
     btnPlay 排在最前面，所以它活着；
     btnShop 在它后面，就死了。这完全符合「只有开始能点」的现象。

     修法：改成「每个按钮一次独立的 safe 绑定」。
     用一个局部函数 bindBtn(id, fn) 包住，单个失败只记一行日志，
     绝不会影响后面的按钮。这样任何一个按钮的问题都被限制在它自己身上。
     --------------------------------------------------------------- */
  const bindBtn=(id, fn)=>{
    try{
      const el=document.getElementById(id);
      if(!el) return false;
      el.onclick=fn;
      /* 【必须打标记】__bindMenuFallback 的捕获阶段委托靠 el.__jsBound
         判断「这个按钮已经有 onclick 了，别再跑一遍」，避免点一次触发两次。
         之前这里漏了赋值，标记永远不出现，等于：
           有点击时 —— onclick 跑一次、委托再跑一次（商店开→关，看起来没反应）
           点击失效时 —— 只有委托，能救回来
         这就是「三个按钮时灵时不灵」的一半原因。 */
      try{ el.__jsBound=true; }catch(e){}
      return true;
    }catch(e){
      console.error('bindBtn failed: '+id, e);
      return false;
    }
  };

  /* ---- 开始（进游戏）---- */
  bindBtn('btnPlay', ()=>{
    /* 【开局前同步落盘一次】主菜单时期的所有改动（买东西、仓库整理、
       改枪、换皮肤）到这一刻必须已经写进 localStorage 了。
       进局之后 P 会被 init() 大改，再想存「出击前的配置」就晚了 ——
       而且玩家进局后直接被杀进程，主菜单的改动会全部丢失。 */
    try{ if(typeof autoSaveFlush==='function') autoSaveFlush(); }catch(e){}
    const m=document.getElementById('menu'); if(m) m.style.display='none';
    try{ audioInit(); audioResume(); sfxUI(); }catch(e){ console.error(e); }
    /* 进局了：置标记，然后按当前输入方式决定显示摇杆还是纯键盘。
       注意 init() 必须保留 —— 它负责建场景、生成敌人和武器。 */
    window.__inGame=true;
    /* 进游戏才强制横屏：主菜单保持用户当前朝向（竖着拿手机看菜单更舒服），
       打枪时竖屏会看不清，才需要转过去。__orientEnter 会锁方向并亮遮罩。 */
    if(typeof window.__orientEnter==='function'){ try{ window.__orientEnter(); }catch(e){} }
    try{ init(); }catch(e){ console.error('init failed', e); }
    try{ applyInputMode(inputMode, true); }catch(e){ console.error(e); }
  });

  /* ---- 死亡界面 / 复活 ---- */
  bindBtn('btnRespawn', ()=>{ location.reload(); });
  bindBtn('btnDeathMenu', ()=>{ location.reload(); });

  /* ---- 商店 / 仓库 / 改枪台 ----
     【为什么这三个要额外挂 touchstart】
     bindBtn 只写 onclick，而「触摸 → 浏览器合成 click」这条路
     在真机上并不可靠：
       · 页面根节点 touch-action:none，部分 WebView 因此不再合成 click
       · 只要路径上任何一层在 touchstart 里 preventDefault，click 就没了
       · 手指微动（超过 slop）会被当成滑动，也不合成 click
     btnPlay 一直能点、这三个不能——而现在三个按钮就紧挨着 btnPlay，
     唯一的结构差异就是它们是「打开一个全屏浮层」。所以这里改用 tapAction：
     touchstart 直接执行，click 兜底给鼠标/桌面，两者时间戳去重。
     同一个 fn 对象只包一次，避免 touch 与 click 各包一层、去重失效。 */
  const tapCache=new WeakMap();
  const tapAction=(id, fn)=>{
    const el=document.getElementById(id);
    if(!el) return false;
    let cached=tapCache.get(el);
    if(cached && cached.fn===fn){ cached.apply(); return true; }
    /* 先把 onoutput 语义保留下来：写 onclick 给桌面/键盘触发 */
    el.onclick=fn; el.__jsBound=true;
    let last=0;
    const run=(ev)=>{
      const now=Date.now();
      if(now-last<400) return;
      last=now;
      /* 先把「执行过」的时间戳写上，再做事。
         这样即使 fn 内部抛错（或被异步推迟），委托那边也已经知道
         这次点击被接管了，不会再跑一遍造成开关抵消。 */
      try{ el.__boundAt=now; }catch(e){}
      if(ev){
        if(ev.cancelable && ev.preventDefault) ev.preventDefault();
        if(ev.stopPropagation) ev.stopPropagation();
      }
      try{ fn(ev); }catch(e){ console.error('tap failed: '+id, e); }
      try{ window.__menuTapLog=(window.__menuTapLog||{})[id]=now; }catch(e){}
    };
    el.addEventListener('touchstart', run, {passive:false});
    el.addEventListener('click', run);
    tapCache.set(el, {fn:fn, apply:()=>{ el.onclick=fn; }});
    return true;
  };
  tapAction('btnShop', ()=>{ try{ toggleShop(); }catch(e){ console.error('shop', e); } });
  tapAction('btnStash', ()=>{ try{ sfxUI(); }catch(e){} try{ toggleStash(); }catch(e){ console.error('stash', e); } });
  /* 【改枪台入口】面板是互斥的：开改枪台前先把商店/仓库收起来，
     否则三层全屏浮层叠在一起，点哪都是最上面那个。 */
  tapAction('btnGunsmith', ()=>{
    try{ sfxUI(); }catch(e){}
    try{ closeShop(); }catch(e){}
    try{ const st=document.getElementById('stash'); if(st) st.style.display='none'; }catch(e){}
    try{ toggleGunsmith(); }catch(e){ console.error('gunsmith', e); }
  });

  /* ---- 局内背包 / 吃药 / 音效 ----
     【为什么不用 onclick】这套 UI 在手机上走的是触摸：
     #viewLayer / #actZone 的 touchstart 都会 preventDefault，
     而浏览器**只有在 touchstart 未被取消时才会合成 click**。
     结果就是这些按钮的 onclick 在真机上时灵时不灵。
     现在统一用 tapBtn()：touchstart 直接执行（不等 300ms 也不依赖
     合成 click），同时保留 onclick 给鼠标/桌面，两者用时间戳去重，
     保证一次点击只执行一次。 */
  const tapBtn=(el, fn)=>{
    if(!el || el.__tapBound) return;
    el.__tapBound=true;
    let last=0;
    const run=(ev)=>{
      /* 去重：touchstart 之后浏览器如果还是补了一次 click，这里把它挡掉 */
      const now=Date.now();
      if(now-last<400) return;
      last=now;
      if(ev){
        if(ev.stopPropagation) ev.stopPropagation();
        if(ev.cancelable && ev.preventDefault) ev.preventDefault();
      }
      try{ fn(ev); }catch(e){ console.error('tap failed', e); }
    };
    el.addEventListener('touchstart', run, {passive:false});
    el.addEventListener('click', run);
  };

  const bagBtn=document.getElementById('bagBtn');
  tapBtn(bagBtn, ()=>{ try{ sfxUI(); }catch(e){} toggleBag(); });
  /* 【HUD 治疗按钮】一键吃药，不用开背包。
     连点不会出错：medQuickUse 内部会重新判满血/无药。 */
  const medBtn=document.getElementById('medBtn');
  tapBtn(medBtn, ()=>{ try{ sfxUI(); }catch(e){} medQuickUse(); });
  // 音效开关
  const sndBtn=document.getElementById('sndBtn');
  tapBtn(sndBtn, ()=>{
    sfxOn=!sfxOn;
    if(masterGain) masterGain.gain.value=sfxOn?VOL.master:0;
    const t=document.getElementById('sndTxt'); if(t) t.textContent=sfxOn?'开':'关';
    if(sndBtn.firstChild) sndBtn.firstChild.textContent=sfxOn?'🔊 ':'🔇 ';
    if(sfxOn){ try{ sfxUI(); }catch(e){} }
  });

  /* ---- 导出 / 导入 / 选文件 / 重置 / 返回 ---- */
  bindBtn('btnExport', ()=>{ try{ exportSave(); }catch(e){ console.error('export', e); } });
  /* 【导入按钮】点击流程改成：
       先亮出「📂 选择存档文件」那一行 —— 手机上从下载目录挑 json
       比复制粘贴一大段省事得多；
       如果设备根本弹不出文件选择器（老 WebView），再退回文本框粘贴。
     exportSave/importSave 全程不问密码：加密导出用内置密钥，
     导入先拿内置密钥试，解不开才问。 */
  bindBtn('btnImport', ()=>{
    const row=document.getElementById('saveRow');
    const f=document.getElementById('saveFile');
    if(row) row.style.display='flex';
    if(f){
      f.value='';                 // 清掉上次选的文件，否则重新选同一个文件不会触发 change
      /* 直接调 click()：靠 onchange 触发导入。不弹文件选择器时
         什么也不会发生，下面的文本框兜底依然是可用的。 */
      try{ f.click(); }catch(e){}
    }
    try{ importSave(); }catch(e){ console.error('import', e); }
  });
  /* 手动挑文件的入口（有些 WebView 会拦截程序化 click，必须靠用户真点一个按钮） */
  bindBtn('btnPickSave', ()=>{ const f=document.getElementById('saveFile'); if(f) f.click(); });
  const saveFileEl=document.getElementById('saveFile');
  if(saveFileEl) saveFileEl.onchange=()=>{ try{ importSave(); }catch(e){ console.error(e); } };
  /* 【重置数据】以前只做 location.reload() —— 现在有了本地自动存档，
     重载后 autoSaveLoad() 会把旧档读回来，等于「重置完了还是原来的数据」。
     所以必须先清档再重载。 */
  bindBtn('btnReset', ()=>{
    if(!confirm('确认重置所有数据？')) return;
    try{ if(typeof autoSaveClear==='function') autoSaveClear(); }catch(e){}
    try{ if(typeof localStorage!=='undefined') localStorage.removeItem('efs_fps_save_v1'); }catch(e){}
    location.reload();
  });
  bindBtn('btnBack', ()=>{ location.href='../'; });

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
    /* F = 检视当前武器（看皮肤/看刀型）。
       用 !e.repeat 避免长按 F 每帧都重新触发一次。 */
    if(e.code==='KeyF'&&!e.repeat){ if(typeof startInspect==='function') startInspect(); }
    /* 主菜单连点 D 15 次解锁 GM 面板。
       游戏里按 D 是向右走，gmHitD 内部会先判断菜单是否可见，
       所以不会误触。 */
    if(e.code==='KeyD'&&!e.repeat){ if(typeof gmHitD==='function') gmHitD(); }
    /* X = 循环切枪，懒得记槽位时用 */
    if(e.code==='KeyX'&&!e.repeat) cycleSlot();
    if(e.code==='Escape'){
      /* 以前这里只关商店和背包，仓库/改枪台按 Esc 关不掉，
         只能去找那个小小的关闭按钮。四个一起关。 */
      const closeAll=['shop','bag','stash','gunsmith'];
      for(const _id of closeAll){ const _el=$(_id); if(_el) _el.style.display='none'; }
    }
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
  /* 【单点会射击的根因】
     这个监听挂在 window 上，不区分点在哪。于是：
       · 手指点一下屏幕想转视角  -> 开一枪
       · 点音量/背包这些 HUD 按钮 -> 先开一枪再处理按钮
       · 触屏抬指后浏览器合成的兼容鼠标事件 -> 又开一枪
     手机上根本没有「鼠标左键」这个东西，这个监听只会带来误触。
     现在只接受【真鼠标】且【不落在任何 UI 元素上】的左键。 */
  addEventListener('mousedown',e=>{
    if(e.button!==0) return;
    if(!ready) return;
    /* 触屏合成的兼容鼠标事件：一律不开火（否则点哪都走火） */
    if(isSyntheticMouse(e)) return;
    /* 点在交互元素上：那是按钮/面板，不是开火 */
    if(isUIEvent(e)) return;
    /* 键盘模式下对局界面才认鼠标左键；触摸模式一律不开火 */
    if(inputMode!=='keyboard') return;
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
  /* 检视按钮：点一下把武器在脸前转一圈，用来欣赏皮肤和刀型。
     用 touchstart 防止 300ms 延迟，同时 preventDefault 避免
     触发后面的 mousedown 造成双重调用。 */
  const inspectBtn=$('btnInspect');
  if(inspectBtn){
    const doIns=(e)=>{ if(typeof startInspect==='function') startInspect();
      if(e&&e.preventDefault) e.preventDefault();
      if(e&&e.stopPropagation) e.stopPropagation(); };
    inspectBtn.addEventListener('touchstart',doIns,{passive:false});
    inspectBtn.addEventListener('click',doIns);
  }
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
  /* 【头盔/护甲】以前漏了这两个槽，导致：
     · stashSlotOf('helm_light') 返回 null —— 因为没有任何槽 accept:['helmet']
     · 仓库左栏看不到头甲，玩家在商店买了之后既看不见也换不下来
       （buyItem 里有 cat==='helmet' 直接穿戴的分支，所以是「穿上但隐身」）
     P.equip 和 settleDeath 里一直有这两个键，只有这个数组漏了。 */
  { key:'helmet',   get label(){ return T('头盔'); },    fb:'⛑️', accept:['helmet'] },
  { key:'armorVest',get label(){ return T('护甲'); },    fb:'🛡️', accept:['armor'] },
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
  gun_rifle:  {cat:'gun',    get name(){ return T('突击步枪'); }, icon:'🔫', price:4500, get desc(){ return T('全自动 · 高伤害'); }, ammoType:'rifle',  dmg:26, fireMode:'auto', fireCd:0.086, mag:40, recoil:1.0, adsZ:0.62, adsY:0.013, sightY:0.092},
  gun_smg:    {cat:'gun',    get name(){ return T('冲锋枪'); },   icon:'🔫', price:2800, get desc(){ return T('射速快 · 后坐力小'); }, ammoType:'pistol', dmg:18, fireMode:'auto', fireCd:0.070, mag:20, recoil:0.70, adsZ:0.50, adsY:0.012, sightY:0.095},
  gun_sniper: {cat:'gun',    get name(){ return T('狙击步枪'); }, icon:'🎯', price:8000, get desc(){ return T('栓动 · 极高伤害 · 开镜倍率高'); }, ammoType:'sniper', dmg:60, fireMode:'bolt', fireCd:1.30, mag:5, recoil:1.0, adsZ:0.46, adsY:0.020, sightY:0.125, adsFov:0.55},
  gun_dmr:    {cat:'gun',    get name(){ return T('精确射手步枪'); }, icon:'🎯', price:6200, get desc(){ return T('半自动 · 高精度 · 中远距'); }, ammoType:'rifle', dmg:44, fireMode:'semi', fireCd:0.30, mag:30, recoil:1.0, adsZ:0.55, adsY:0.018, sightY:0.108, adsFov:0.72},
  gun_m870:   {cat:'gun',    get name(){ return T('雷明顿 M870'); }, icon:'🔫', price:5200, get desc(){ return T('泵动 · 9 颗弹丸 · 近距一枪致命'); }, ammoType:'shot', dmg:14, fireMode:'pump', fireCd:0.20, mag:8, pumpTime:0.58, pellets:9, recoil:1.0, adsZ:0.60, adsY:0.014, sightY:0.090},
  pis_default:{cat:'pistol', get name(){ return T('制式手枪'); }, icon:'🔫', price:600,  get desc(){ return T('半自动 · 应急副武器'); }, ammoType:'pistol', dmg:14, fireMode:'semi', fireCd:0.17, mag:20, recoil:0.90, adsZ:0.40, adsY:0.012, sightY:0.093},
  pis_heavy:  {cat:'pistol', get name(){ return T('大口径手枪'); }, icon:'🔫', price:1800, get desc(){ return T('半自动 · 高伤副武器'); }, ammoType:'pistol', dmg:24, fireMode:'semi', fireCd:0.24, mag:20, recoil:0.75, adsZ:0.42, adsY:0.013, sightY:0.093},
  melee_knife:{cat:'melee', get name(){ return T('战术小刀'); }, icon:'🔪', price:200,  get desc(){ return T('近战 · 永不耗弹 · 出手快'); }, dmg:35, knife:'knife', meleeCd:0.42, meleeRange:2.6},
  melee_baton:{cat:'melee', get name(){ return T('防暴棍'); },   icon:'🏏', price:500,  get desc(){ return T('近战 · 攻击范围大'); }, dmg:28, knife:'machete', meleeCd:0.46, meleeRange:2.8},
  /* ---- 更多刀型：只改外观，伤害各有微调 ---- */
  melee_karambit:{cat:'melee', get name(){ return T('爪刀'); }, icon:'🗡️', price:1400, get desc(){ return T('弯刃 · 出手极快 · 近身利器'); }, dmg:42, knife:'karambit', meleeCd:0.30, meleeRange:2.2},
  melee_katana:{cat:'melee', get name(){ return T('太刀'); },   icon:'⚔️', price:2600, get desc(){ return T('细长刀身 · 挥砍范围最大'); }, dmg:56, knife:'katana', meleeCd:0.52, meleeRange:3.3},
  melee_axe:{cat:'melee',    get name(){ return T('战术斧'); }, icon:'🪓', price:3600, get desc(){ return T('沉重· 一击必杀，但挥得慢'); }, dmg:95, knife:'axe', meleeCd:0.78, meleeRange:2.7},
  /* ---- 武器皮肤：纯外观，不提供任何属性加成 ---- */
  skin_none:{cat:'skin', get name(){ return T('原厂涂装'); }, icon:'⬜', price:0,    get desc(){ return T('默认外观，不花一分钱'); }, skin:'skin_none'},
  skin_neon:{cat:'skin', get name(){ return T('霓虹夜光'); },   icon:'🟦', price:2000, get desc(){ return T('青蓝发光 · 环绕光带'); }, skin:'skin_neon'},
  skin_blood:{cat:'skin',get name(){ return T('赤血红'); },     icon:'🟥', price:3200, get desc(){ return T('血红发光 · 杀气十足'); }, skin:'skin_blood'},
  skin_toxic:{cat:'skin',get name(){ return T('毒液幽绿'); },   icon:'🟩', price:3800, get desc(){ return T('幽绿毒光 · 环绕光带'); }, skin:'skin_toxic'},
  skin_void:{cat:'skin', get name(){ return T('虚空紫'); },     icon:'🟪', price:5000, get desc(){ return T('暗紫辐射 · 最强发光'); }, skin:'skin_void'},
  skin_gold:{cat:'skin', get name(){ return T('黄金'); },       icon:'🟨', price:9000, get desc(){ return T('土豪金 · 无光但最闪'); }, skin:'skin_gold'},
  /* ---- 胸挂（对应左侧装备栏，提供额外弹药携带） ---- */
  /* ---- 胸挂（提供独立的快速取用格子，不占背包容量）----
     slot = 胸挂能装几格小件。
     原来是 mags:2/4/6（只能说明「额外弹匣位」，界面上看不见也用不上），
     现在换成真实的格子数，并且只收医疗/弹药/手雷/配件这类小件。 */
  chest_small:{cat:'chest',  get name(){ return T('简易胸挂'); }, icon:'🦺', price:800,  get desc(){ return T('3 格快速取用（医疗/弹药/手雷）'); }, slot:3},
  chest_med:  {cat:'chest',  get name(){ return T('战术胸挂'); }, icon:'🦺', price:2000, get desc(){ return T('5 格快速取用（医疗/弹药/手雷）'); }, slot:5},
  chest_large:{cat:'chest',  get name(){ return T('重型胸挂'); }, icon:'🦺', price:4500, get desc(){ return T('8 格快速取用（医疗/弹药/手雷）'); }, slot:8},
};

/* 分类标签（顺序即显示顺序） */
const SHOP_CATS=[
  /* 武器分类要放在最前面：这是玩家在仓库里最先要填的三个槽
     （主武器/手枪/副武器），商店里买不到就永远空着。 */
  {id:'gun',    get name(){ return T('主武器'); }},
  {id:'pistol', get name(){ return T('手枪'); }},
  {id:'melee',  get name(){ return T('副武器'); }},
  {id:'skin',   get name(){ return T('武器皮肤'); }},
  /* 配件放皮肤后面：玩家买枪 → 买配件改装，是自然的下一步 */
  {id:'mod',    get name(){ return T('枪配件'); }},
  {id:'chest',  get name(){ return T('胸挂'); }},
  {id:'med',    get name(){ return T('医药'); }},
  {id:'tool',   get name(){ return T('道具'); }},
  {id:'ammo',   get name(){ return T('子弹'); }},
  {id:'bag',    get name(){ return T('背包'); }},
  {id:'helmet', get name(){ return T('头盔'); }},
  {id:'armor',  get name(){ return T('护甲'); }},
];
/* ============ 武器耐久 + 改枪配件系统 ============

 【武器耐久】以前只有头甲有耐久，枪是永久武器 —— 这个不对称太明显：
 头盔打坏了会消失，几千块的步枪却永远不会退场。
 现在每把枪也有耐久，射击扣、近战挥砍也扣，扣光「卡壳」（可以修）。
 修枪要花钱，价格随损耗线性上升，所以好枪的长期使用成本更高。

 【改枪】每把枪有 6 个配件槽，装上的配件实时改属性：
   瞄准属性、后坐力、射速、弹匣、开火模式、镜倍率、伤害
 属性不是存在武器上的，而是每次读 curXxx() 时现算（见 w_weapon.js），
 所以换配件立即生效，不需要重建模型或重开一局。

 【数据结构】P.gunMods = { 武器id: { slot: 配件id } }
 挂武器而不是挂槽位：手枪和主武器各存各的，换枪不串味。
*/
const GUN_DUR_MAX = {
  gun_rifle: 320, gun_smg: 300, gun_sniper: 260, gun_dmr: 300, gun_m870: 280,
  pis_default: 240, pis_heavy: 200
};
/* 每发射击扣多少耐久。栓动/霰弹一发的机械负担远大于自动步枪。 */
const GUN_DUR_WEAR = {
  gun_rifle: 1, gun_smg: 0.8, gun_sniper: 3, gun_dmr: 2, gun_m870: 2.5,
  pis_default: 0.7, pis_heavy: 1.2
};
/* 近战武器耐久：刀是消耗品，斧头最耐用 */
const MELEE_DUR_MAX = {
  melee_knife: 180, melee_baton: 260, melee_karambit: 140,
  melee_katana: 220, melee_axe: 300
};
/* 取某把武器的耐久上限 */
function gunDurMax(id){
  return GUN_DUR_MAX[id] || MELEE_DUR_MAX[id] || 200;
}
/* 取当前耐久（没有记录就当作满耐久，兼容老存档） */
function gunDurOf(id){
  if(!id) return 0;
  if(typeof P.gunDur!=='object' || !P.gunDur) return gunDurMax(id);
  const v = P.gunDur[id];
  if(typeof v!=='number') return gunDurMax(id);
  return v;
}
function gunDurPct(id){
  const mx=gunDurMax(id);
  return mx>0 ? Math.max(0, Math.min(1, gunDurOf(id)/mx)) : 1;
}
/* 掉耐久。返回是否「刚坏」。
   坏了不销毁（几千块的枪直接消失太狠），而是进“卡壳”状态：
   还能打但射速腰斩、后坐力翻倍，逼你去修。 */
function gunDurUse(id, amt){
  if(!id) return false;
  if(typeof P.gunDur!=='object' || !P.gunDur) P.gunDur={};
  const before = gunDurOf(id);
  if(before<=0) return false;
  const after = Math.max(0, before - (amt||0));
  P.gunDur[id]=after;
  if(before>0 && after<=0){
    toast(T('武器卡壳了！去改枪台花加钱修理'));
    saveTick();
    return true;
  }
  return false;
}
/* 武器状态：1=完好 0=卡壳 */
function gunFunctional(id){ return gunDurOf(id)>0; }

/* ---------- 配件表 ----------
   slot 是安装位置，同一把枪每个位置只能装一件。
   eff 里每项都是「加算」修正值，读属性时统一叠加，
   这样配件之间天然可以组合，不用写一堆 if 分支。 */
const GUN_MODS={
  /* ==== 瞄具（scope）==== */
  mod_iron:   {cat:'mod', slot:'scope', get name(){return T('机械瞳准');},   icon:'🎯', price:0,    get desc(){return T('原厂瞄具 · 无额外效果');}, eff:{}},
  mod_reddot: {cat:'mod', slot:'scope', get name(){return T('红点镜');},       icon:'🔴', price:700,  get desc(){return T('开镜更快 · 倍率 1.3x');}, eff:{adsSpeed:.25, zoom:.30, adsZ:-.03}},
  mod_holo:   {cat:'mod', slot:'scope', get name(){return T('全息镜');},       icon:'🔵', price:1100, get desc(){return T('视野清晰 · 倍率 1.5x · 轻微稳定');}, eff:{adsSpeed:.18, zoom:.50, adsZ:-.05, recoil:-.05}},
  mod_scope2: {cat:'mod', slot:'scope', get name(){return T('2x 战术镜');},    icon:'🔭', price:1800, get desc(){return T('中等倍率 · 远处点射利器');}, eff:{zoom:1.00, adsZ:-.08, adsSpeed:.10}},
  mod_scope4: {cat:'mod', slot:'scope', get name(){return T('4x 精准镜');},    icon:'🔬', price:3600, get desc(){return T('高倍率 · 近战视野收缩');}, eff:{zoom:2.20, adsZ:-.12, adsSpeed:-.15}},
  mod_scope6: {cat:'mod', slot:'scope', get name(){return T('6x 狙击镜');},    icon:'📡', price:6000, get desc(){return T('极高倍率 · 只适合栓动');}, eff:{zoom:3.60, adsZ:-.16, adsSpeed:-.25}},

  /* ==== 前握把（frontgrip）—— 管后坐力与稳定性 ==== */
  mod_grip_vert:{cat:'mod', slot:'frontgrip', get name(){return T('垂直握把');}, icon:'⬇️', price:500, get desc(){return T('大幅减少垂直后坐');}, eff:{recoil:.22}},
  mod_grip_ang: {cat:'mod', slot:'frontgrip', get name(){return T('斜角握把');}, icon:'↘️', price:800, get desc(){return T('后坐力与开镜速度兼顾');}, eff:{recoil:.14, adsSpeed:.12}},
  mod_grip_stub:{cat:'mod', slot:'frontgrip', get name(){return T('短握把');},   icon:'▪️', price:400, get desc(){return T('开镜最快 · 后坐力改善最少');}, eff:{adsSpeed:.30, recoil:.06}},
  mod_bipod:    {cat:'mod', slot:'frontgrip', get name(){return T('两脚架');},   icon:'🦵', price:2400, get desc(){return T('趴下时后坐力几乎归零');}, eff:{recoil:.10, proneRecoil:1.6}},

  /* ==== 枪托（stock）—— 管后坐力与瞄准速度 ==== */
  mod_stock_light:{cat:'mod', slot:'stock', get name(){return T('轻型枪托');}, icon:'🪶', price:600, get desc(){return T('开镜更快 · 后坐力小幅改善');}, eff:{adsSpeed:.22, recoil:.08}},
  mod_stock_heavy:{cat:'mod', slot:'stock', get name(){return T('重型枪托');}, icon:'🔩', price:1400, get desc(){return T('极稳 · 但开镜变慢');}, eff:{recoil:.28, adsSpeed:-.12}},
  mod_stock_fold:{cat:'mod', slot:'stock', get name(){return T('折叠枪托');},   icon:'📎', price:1000, get desc(){return T('开镜最快 · 后坐力无改善');}, eff:{adsSpeed:.35}},

  /* ==== 枪口（muzzle）==== */
  mod_comp:   {cat:'mod', slot:'muzzle', get name(){return T('补偿器');},   icon:'🌀', price:900,  get desc(){return T('压制枪口上跳');}, eff:{recoil:.18}},
  mod_supp:   {cat:'mod', slot:'muzzle', get name(){return T('消音器');},   icon:'🔇', price:2200, get desc(){return T('开火不惊动远处敌人 · 略降伤害');}, eff:{suppress:1, dmg:-.05, recoil:.08}},
  mod_brake:  {cat:'mod', slot:'muzzle', get name(){return T('枪口制退器');}, icon:'💨', price:1300, get desc(){return T('制退最强 · 开镜略慢');}, eff:{recoil:.26, adsSpeed:-.06}},

  /* ==== 弹匣（mag）==== */
  mod_mag_ext:{cat:'mod', slot:'mag', get name(){return T('扩容弹匣');}, icon:'📦', price:700,  get desc(){return T('弹匣容量 +50%');}, eff:{magMul:.5}},
  mod_mag_drum:{cat:'mod', slot:'mag', get name(){return T('弹鼓');},     icon:'🥁', price:1900, get desc(){return T('容量翻倍 · 换弹变慢');}, eff:{magMul:1.0, reloadMul:.35}},
  mod_mag_quick:{cat:'mod', slot:'mag', get name(){return T('快拔弹匣');}, icon:'⚡', price:1100, get desc(){return T('换弹速度 +35%');}, eff:{reloadMul:-.35}},

  /* ==== 扳机（trigger）==== */
  mod_trigger: {cat:'mod', slot:'trigger', get name(){return T('竞赛扳机');}, icon:'🔧', price:1500, get desc(){return T('射速 +15%');}, eff:{fireCdMul:-.15}},
  mod_trigger_heavy:{cat:'mod', slot:'trigger', get name(){return T('轻量化扳机组');}, icon:'🎚️', price:2600, get desc(){return T('射速 +25% · 后坐力略增');}, eff:{fireCdMul:-.25, recoil:-.08}},
};

/* 每把枪允许的配件槽（栓动枪不能装弹鼓，手枪装不了两脚架这种差异） */
const GUN_SLOTS={
  gun_rifle:  ['scope','frontgrip','stock','muzzle','mag','trigger'],
  gun_smg:    ['scope','frontgrip','stock','muzzle','mag','trigger'],
  gun_dmr:    ['scope','frontgrip','stock','muzzle','mag','trigger'],
  gun_sniper: ['scope','frontgrip','stock','muzzle','mag'],
  gun_m870:   ['scope','frontgrip','stock','muzzle'],
  pis_default:['scope','muzzle','mag'],
  pis_heavy:  ['scope','muzzle','mag'],
};
function gunSlotsOf(id){ return GUN_SLOTS[id] || ['scope']; }
/* 该枪的配件表：{ slot: modId } */
function gunModsOf(id){
  if(!id) return {};
  if(typeof P.gunMods!=='object' || !P.gunMods) P.gunMods={};
  return P.gunMods[id] || (P.gunMods[id]={});
}
function gunModId(id, slot){
  const m=gunModsOf(id);
  const v=m[slot];
  return (v && GUN_MODS[v]) ? v : null;
}
function gunModItem(id, slot){
  const k=gunModId(id, slot);
  return k ? GUN_MODS[k] : null;
}
/* 累加所有配件效果。key 不传时返回合并后的对象。 */
function gunModEff(id, key){
  const m=gunModsOf(id);
  const out={};
  for(const slot in m){
    const md=GUN_MODS[m[slot]];
    if(!md || !md.eff) continue;
    for(const k in md.eff) out[k]=(out[k]||0)+md.eff[k];
  }
  return key ? (out[key]||0) : out;
}
let shopTab='gun';   // 当前商店标签页（默认停在主武器，对应仓库第一件事）
let bagTab='all';    // 当前背包筛选

/* 背包占用格数：数量 1 个占 1 格，子弹按堆叠算 1 格 */
/* ---- 局内背包占用格数（只有 pouch 算容量，stash 无限） ---- */
function pouchUsed(){
  let n=0;
  for(const k in P.pouch){ if(P.pouch[k]>0) n++; }
  return n;
}
function pouchFree(){ return P.bagCap - pouchUsed(); }
function bagUsed(){ return pouchUsed(); }
function bagFree(){ return pouchFree(); }

/* ============ 胸挂格子 ============
   以前胸挂只有一个 `mags:4` 的数字，代表「额外 4 个弹匣位」，
   但玩家在界面上完全看不到这 4 个位置，也不知道里面装了什么 ——
   等于买了个数字。
   现在胸挂是真正的独立格子区（P.chestPouch），和背包分开：
     · 容量由胸挂的 slot 字段决定（简易 3 格 / 战术 5 格 / 重型 8 格）
     · 只允许放「小件」：医疗、弹药、手雷、配件
       —— 大件（枪、背包、护甲）塞不进胸挂，这符合现实
     · 局内胸挂格子在背包界面单独一排显示，点一下立即使用
     · 【不占背包容量】玩家不用为了带个急救包而牺牲一格背包
   胸挂脱下时，里面的东西自动倒回背包（背包满了就掉在地上，见 chestUnequip） */
function chestCapOf(){
  const id=P.equip && P.equip.chest;
  const it=id && SHOP_ITEMS[id];
  return (it && it.slot) ? (it.slot|0) : 0;
}
function chestUsed(){
  let n=0;
  for(const k in P.chestPouch){ if(P.chestPouch[k]>0) n++; }
  return n;
}
function chestFree(){ return chestCapOf() - chestUsed(); }
/* 这个物品能不能放进胸挂：只收小件 */
function chestAccept(id){
  const it=SHOP_ITEMS[id]; if(!it) return false;
  if(it.cat==='med') return true;                  // 医疗
  if(it.cat==='ammo') return true;                 // 弹药
  if(id==='grenade'||id==='flashbang'||id==='smoke') return true;
  if(it.cat==='mod') return true;                  // 配件（小件）
  return false;                                    // 枪/背包/胸挂/护甲 都不收
}
/* 【注意】这里原先还有一句 `function bagUsed(){ return pouchUsed(); }`
   注释写着「兼容旧名字」。但 bagUsed 在文件上方（pouchUsed 旁边）
   已经定义过一次了 —— 同一个作用域里重复声明同名函数，
   在 ES module（严格模式）下是 SyntaxError：
     Identifier 'bagUsed' has already been declared
   而**语法错误会让整个 module 无法编译**，于是所有 JS 一行都不执行，
   表现就是「主界面所有按钮点不动、但按下有蓝圈」（蓝圈是 CSS :active，
   不需要 JS）。这个重复声明已经删除，旧名字仍由上方那处定义提供。 */
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
/* 【从仓库扣一件，并同步「搜来的」账本】
   凡是要从仓库拿走物品的地方都该走这个函数，而不是直接 P.stash[id]--。
   直接扣会让 P.looted 留下幽灵额度 —— 搜来的东西早就用掉了，
   但账本还以为仓库里这件是搜来的，于是自购品被按 1.35 倍卖出去，
   等于凭空印钱。这属于「藏得很深、玩很久才会被发现」的漏洞。 */
function stashConsume(id, n){
  const cnt = n||1;
  if(!(P.stash[id]>0)) return false;
  const move = Math.min(cnt, P.stash[id]);
  P.stash[id]-=move;
  if(P.stash[id]<=0) delete P.stash[id];
  if(P.looted && P.looted[id]>0){
    const took=Math.min(move, P.looted[id]|0);
    P.looted[id]=(P.looted[id]|0)-move;
    if(P.looted[id]<=0) delete P.looted[id];
    /* 记下「有多少件搜来物被带出仓库」，撤离成功时按这个数还回去 */
    if(took>0){
      if(!P.pouchLoot || typeof P.pouchLoot!=='object') P.pouchLoot={};
      P.pouchLoot[id]=(P.pouchLoot[id]|0)+took;
    }
  }
  return true;
}

/* ---- 商店 ---- */
/* ============ 改枪台 ============

 为什么单独做一个面板而不是塞进商店：
 配件是「装在某把已经拥有的枪上」的，有归属关系；商店是「付钱拿货」。
 混在一起会出现「在商店里给还没买的枪装瞄具」这种鬼状态。

 面板结构：
   顶部：选枪（只列出你拥有的枪）
   中间：耐久条 + 修理按钮（价格随损耗上升）
   下面：该枪的每个配件槽，点开选配件（列出已拥有 + 可购买）
*/

/* 你拥有哪些枪/刀（装备栏里 + 仓库里，去重） */
function ownedWeapons(){
  const out=[];
  const seen={};
  const push=id=>{
    if(!id || seen[id]) return;
    const it=SHOP_ITEMS[id];
    if(!it) return;
    if(it.cat!=='gun' && it.cat!=='pistol' && it.cat!=='melee') return;
    seen[id]=1; out.push(id);
  };
  if(P.equip) for(const k in P.equip) push(P.equip[k]);
  for(const id in P.stash) if(P.stash[id]>0) push(id);
  return out;
}
/* 修枪价格：按缺的耐久算，满修 = 武器售价的 35%。
   越贵的枪修起来越贵，所以「好枪更贵」不只体现在买的时候。 */
function gunRepairCost(id){
  const it=SHOP_ITEMS[id]; if(!it) return 0;
  const mx=gunDurMax(id);
  const cur=gunDurOf(id);
  if(mx<=0) return 0;
  const miss=Math.max(0, mx-cur);
  if(miss<=0) return 0;
  const perUnit=(it.price||1000)*0.35/mx;
  return Math.max(1, Math.round(miss*perUnit));
}
function gunRepair(id){
  const cost=gunRepairCost(id);
  if(cost<=0){ toast(T('这把武器耐久已满')); return; }
  if((P.ammo.cash|0) < cost){ sfxDeny(); toast(T('货币不足，修理需要 ')+cost); return; }
  P.ammo.cash-=cost;
  if(typeof P.gunDur!=='object' || !P.gunDur) P.gunDur={};
  P.gunDur[id]=gunDurMax(id);
  sfxBuy();
  toast(T('修理完成 · 花费 ')+cost);
  saveTick();
  buildGunsmith(); refreshHUD();
}
/* 装/卸配件 */
function gunMount(gunId, slot, modId){
  if(!gunId || !GUN_MODS[modId]) return;
  const md=GUN_MODS[modId];
  if(md.slot!==slot) return;
  const cur=gunModId(gunId, slot);
  if(cur===modId){ toast(T('已经装着了')); return; }
    /* 配件要有货：仓库里有才装得上（mod_iron 是原厂自带，免费）。
       装新配件时把旧的退回仓库，不吞玩家东西。 */
  if(modId!=='mod_iron' && !(P.stash[modId]>0)){
    if((P.ammo.cash|0) >= (md.price||0)){
      P.ammo.cash-=md.price;
      toast(T('买下并安装 ')+md.name+' · -'+md.price);
    }else{
      sfxDeny(); toast(T('货币不足')); return;
    }
  }else if(modId!=='mod_iron'){
    stashConsume(modId);   // 走统一扣减，顺带清掉搜来账本
  }
  if(cur && cur!=='mod_iron') stashAdd(cur,1);
  const m=gunModsOf(gunId);
  if(modId==='mod_iron') delete m[slot];
  else m[slot]=modId;
  sfxBuy();
  saveTick();
  gunRefreshModel();
  buildGunsmith(); refreshHUD(); refreshHUD();
}
/* 卸下配件 → 回仓库 */
function gunUnmount(gunId, slot){
  const cur=gunModId(gunId, slot);
  if(!cur) return;
  if(cur!=='mod_iron') stashAdd(cur,1);
  const m=gunModsOf(gunId);
  delete m[slot];
  toast(T('已卸下配件'));
  saveTick(); gunRefreshModel(); buildGunsmith(); refreshHUD();
}
/* 改完配件要重建武器模型（瞄具会影响枪的贴图层次，握把/枪托影响视觉）
   【问题 1 修复：武器模型消失】
   原来的写法是「清掉 _modelCache.key → 调 initWeapon()」。
   但 initWeapon() 第一句是：
       if(weaponRoot) return;
   也就是说，只要武器根节点已经建过（进过一次游戏之后必然已建），
   这个函数立刻返回，**什么都不会做**。
   于是这里唯一的效果是「把缓存 key 清空」，模型并没有重建。
   下ー次 applyWeaponModel() 发现 key 不匹配 → 进去重建 →
   先把旧模型 remove 掉，再用 buildWeaponFor(kind) 造新的。
   如果这一路有任何一环出错（比如当前槽位为空、SHOP_ITEMS 里查不到
   对应 id），结果就是：旧模型已经被移除、新模型没造出来 →
   **手里彻底没枪了**。玩家看到的就是「武器模型没了」。

   正确做法：不要在这里重建整个 weaponRoot，
   只要让 applyWeaponModel() 的脏检查失效，交给每帧的 updWeapon()
   去安全地重建即可 —— 它有完整的分支保护，
   而且不会把「根节点」整个丢掉。

   另外把 syncWeapon() 作为首选：它内部做的就是
   「清缓存 + applyWeaponModel() + 切枪动画」，语义正好对应
   「枪的外观变了，重新摆一次」。 */
function gunRefreshModel(){
  try{
    if(typeof _modelCache==='object') _modelCache.key=null;
  }catch(e){}
  /* 真正触发重建：优先 syncWeapon（它保证在 weaponRoot 存在时才动），
     没有这个函数时退化为直接调 applyWeaponModel。 */
  try{
    if(typeof syncWeapon==='function') syncWeapon();
    else if(typeof applyWeaponModel==='function') applyWeaponModel();
  }catch(e){ console.error('gunRefreshModel failed', e); }
}

let gunsmithGun=null;   // 当前改的哪把枪

function toggleGunsmith(){
  const s=$('gunsmith'); if(!s) return;
  const opening = s.style.display!=='flex';
  if(opening){
    /* 同上：先开面板再 build。改枪台以前连 CSS 都没有，
       就算 build 成功内容也是画在页面末尾被 #menu 盖住，
       现在样式补上了，这里再把「先 visible 后填充」的保险也加上。 */
    s.style.display='flex';
    closeShop(); closeBag(); closeStash();
    try{
      const list=ownedWeapons();
      if(!gunsmithGun || list.indexOf(gunsmithGun)<0) gunsmithGun=list[0]||null;
      buildGunsmith();
    }
    catch(e){ console.error('buildGunsmith failed', e);
      s.innerHTML='<div class="box"><h1>改枪台</h1><div class="d">加载失败：'+(e&&e.message||e)+'</div></div>'; }
  }else s.style.display='none';
}
function closeGunsmith(){ const s=$('gunsmith'); if(s) s.style.display='none'; }

function buildGunsmith(){
  const el=$('gunsmith'); if(!el) return;
  const list=ownedWeapons();
  let h='<div class="box" style="max-width:640px">';
  h+='<div class="row" style="justify-content:space-between;align-items:center;margin:0 0 6px">'
    +'<h1 style="margin:0">🔧 '+T('改枪台')+'</h1>'
    +'<div style="color:#ffd54a;font-weight:700">¥'+P.ammo.cash+'</div></div>';

  if(!list.length){
    h+='<div class="d" style="text-align:center;padding:20px">'+T('你还没有任何武器，先去商店买一把')+'</div>';
    h+='<div class="row" style="justify-content:center"><button class="btn ghost" id="gsClose">'+T('关闭')+'</button></div>';
    h+='</div>'; el.innerHTML=h; bindGunsmith(); return;
  }

  /* 选枪标签 */
  h+='<div class="tabs">';
  for(const id of list){
    const it=SHOP_ITEMS[id];
    const pct=Math.round(gunDurPct(id)*100);
    h+='<button class="tab'+(gunsmithGun===id?' on':'')+'" data-gun="'+id+'">'
      +it.icon+' '+it.name+' <span style="opacity:.7;font-size:11px">'+pct+'%</span></button>';
  }
  h+='</div>';

  const gid=gunsmithGun;
  const git=SHOP_ITEMS[gid];
  if(git){
    /* ---- 耐久条 + 修理 ---- */
    const mx=gunDurMax(gid), cur=gunDurOf(gid);
    const pct=mx>0?Math.round(cur/mx*100):0;
    const broken=cur<=0;
    const cost=gunRepairCost(gid);
    h+='<div style="margin:10px 0 4px;padding:11px;border-radius:11px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)">';
    h+='<div class="row" style="justify-content:space-between;align-items:center">'
      +'<div style="font-weight:700;font-size:13.5px">'+git.icon+' '+git.name+'</div>'
      +'<div style="font-size:12px;color:'+(broken?'#ff6b6b':(pct<35?'#ffb648':'#7ee8a0'))+';font-weight:800">'
      +T('耐久')+' '+Math.round(cur)+'/'+mx+' ('+pct+'%)</div></div>';
    /* 进度条 */
    h+='<div style="height:7px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden;margin:8px 0 9px">'
      +'<div style="height:100%;width:'+pct+'%;border-radius:4px;background:'
      +(broken?'#ff4444':(pct<35?'linear-gradient(90deg,#ffb648,#ffd54a)':'linear-gradient(90deg,#4ade80,#7ee8a0)'))
      +'"></div></div>';
    if(git.dmg) h+='<div class="d">'+T('伤害')+' '+Math.round(git.dmg*(1+gunModEff(gid,'dmg')))
      +(gunModEff(gid,'recoil')>0?(T(' · 后坐力 ')+'-'+Math.round(Math.min(0.7,gunModEff(gid,'recoil'))*100)+'%'):'')
      +(gunModEff(gid,'zoom')>0?(T(' · 倍率 ')+'+'+(gunModEff(gid,'zoom')*0.5).toFixed(1)+'x'):'')
      +(gunModEff(gid,'magMul')>0?(T(' · 弹匣 ')+'+'+Math.round(gunModEff(gid,'magMul')*100)+'%'):'')
      +(gunModEff(gid,'fireCdMul')<0?(T(' · 射速 ')+'+'+Math.round(-gunModEff(gid,'fireCdMul')*100)+'%'):'')
      +'</div>';
    if(broken){
      h+='<div class="d" style="color:#ff6b6b;margin-top:5px">'+T('⚠ 已卡壳：射速腰斩 · 后坐力翻倍 · 弹匣减半')+'</div>';
    }
    h+='<div class="row" style="margin-top:9px">'
      +(cost>0
        ? '<button class="btn sm" id="gsRepair" data-cost="'+cost+'">🔧 '+T('修理')+' ¥'+cost+'</button>'
        : '<button class="btn sm ghost" disabled>'+T('耐久已满')+'</button>')
      +'</div>';
    h+='</div>';

    /* ---- 配件槽 ---- */
    const slots=gunSlotsOf(gid);
    const SLOT_LABEL={scope:'瞄准镜',frontgrip:'前握把',stock:'枪托',muzzle:'枪口',mag:'弹匣',trigger:'扳机'};
    h+='<div style="font-size:12px;font-weight:700;color:#9aa3b2;margin:12px 0 6px">'+T('配件槽')+'</div>';
    for(const slot of slots){
      const mid=gunModId(gid, slot);
      const mit=mid?GUN_MODS[mid]:null;
      h+='<div style="padding:9px 11px;border-radius:10px;background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);margin-bottom:7px">';
      h+='<div class="row" style="justify-content:space-between;align-items:center">'
        +'<div style="font-size:12px;color:#9aa3b2;min-width:64px">'+T(SLOT_LABEL[slot]||slot)+'</div>'
        +'<div style="flex:1;font-size:13px;font-weight:700;margin-left:8px">'
        +(mit? (mit.icon+' '+mit.name) : ('<span style="opacity:.45">'+T('空')+'</span>'))+'</div>'
        +(mid? '<button class="btn sm ghost" data-umount="'+slot+'">'+T('卸下')+'</button>' : '')
        +'</div>';
      if(mit) h+='<div class="d" style="margin-left:72px;margin-top:2px">'+mit.desc+'</div>';
      /* 可选配件列表 */
      h+='<div class="row" style="flex-wrap:wrap;gap:5px;margin-top:6px;margin-left:64px">';
      for(const modId in GUN_MODS){
        const md=GUN_MODS[modId];
        if(md.slot!==slot) continue;
        if(modId===mid) continue;
        const owned=(P.stash[modId]>0);
        const free=(modId==='mod_iron');
        const canPay=free||owned||((P.ammo.cash|0)>=(md.price||0));
        h+='<button class="btn sm'+(canPay?'':' ghost')+'" data-mount="'+slot+':'+modId+'" '
          +(canPay?'':'disabled')+' style="font-size:11px;padding:4px 8px">'
          +md.icon+' '+md.name+(free?'':(owned?' ✓':' ¥'+md.price))+'</button>';
      }
      h+='</div></div>';
    }
  }

  h+='<div class="row" style="margin-top:10px;align-items:center;justify-content:space-between">'
    +'<div class="d">'+T('装上的配件立即生效 · 换枪各存各的')+'</div>'
    +'<button class="btn ghost" id="gsClose">'+T('关闭')+'</button></div>';
  h+='</div>';
  el.innerHTML=h;
  bindGunsmith();
}

function bindGunsmith(){
  const el=$('gunsmith'); if(!el) return;
  el.querySelectorAll('[data-gun]').forEach(b=>{
    b.onclick=()=>{ gunsmithGun=b.getAttribute('data-gun'); sfxUI(); buildGunsmith(); };
  });
  const rb=$('gsRepair');
  if(rb) rb.onclick=()=>gunRepair(gunsmithGun);
  el.querySelectorAll('[data-umount]').forEach(b=>{
    b.onclick=()=>gunUnmount(gunsmithGun, b.getAttribute('data-umount'));
  });
  el.querySelectorAll('[data-mount]').forEach(b=>{
    b.onclick=()=>{
      const v=b.getAttribute('data-mount').split(':');
      gunMount(gunsmithGun, v[0], v[1]);
    };
  });
  const cb=$('gsClose'); if(cb) cb.onclick=()=>{ sfxUI(); closeGunsmith(); };
}

function toggleShop(){
  const s=$('shop'); if(!s) return;
  const opening = s.style.display!=='flex';
  if(opening){
    /* 【先开面板，再填内容】
       以前的顺序是 buildShop() 然后才 display='flex'。
       buildShop 里只要有任何一句抛错（数据缺字段、某个 id 没定义……），
       display 那一行就永远执行不到 —— 表现就是「点商店毫无反应」。
       现在先让面板可见，build 失败也只是空面板 + 控制台报错，
       不会再出现「按了没动静」这种完全无从下手的状态。 */
    s.style.display='flex';
    closeBag(); closeStash(); closeGunsmith();
    try{ buildShop(); }
    catch(e){ console.error('buildShop failed', e);
      s.innerHTML='<div class="box"><h1>商店</h1><div class="d">加载失败：'+(e&&e.message||e)+'</div></div>'; }
  }
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
/* 自动存档打点：改动局外数据后调用。
   内部用 queueMicrotask 合并同帧多次调用，所以随便打点都不会重复写盘。 */
function saveTick(){ try{ if(typeof autoSaveTouch==='function') autoSaveTouch(); }catch(e){} }
function buyItem(id){
  /* 【注意括号】这里曾经被写成 `if(!it) saveTick(); return;` ——
     return 脱离了 if 的作用域，变成「函数无条件立即返回」，
     结果就是商店里点任何商品都毫无反应，而且不报错。
     补上大括号，把 return 真正关回 if 里。 */
  const it=SHOP_ITEMS[id];
  if(!it){ saveTick(); return; }
  if(P.ammo.cash < it.price){ sfxDeny(); toast('货币不足'); saveTick(); return; }

  const cat=it.cat;
  /* 装备类：直接穿戴（等同买完立刻装备），也记一份进仓库 */
  if(cat==='helmet'){
    P.ammo.cash-=it.price;
    P.equip.helmet=id; P.helmetDur=it.dur;
    sfxBuy(); toast('已装备 '+it.name); refreshHUD(); buildShop(); saveTick(); return;
  }
  if(cat==='armor'){
    P.ammo.cash-=it.price;
    P.equip.armorVest=id; P.vestDur=it.dur;
    sfxBuy(); toast('已装备 '+it.name); refreshHUD(); buildShop(); saveTick(); return;
  }
  if(cat==='bag'){
    P.ammo.cash-=it.price;
    P.equip.backpack=id; P.bagCap=it.cap;
    sfxBuy(); toast('背包装备成功，出击背包 '+it.cap+' 格'); refreshHUD(); buildShop(); saveTick(); return;
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
      sfxBuy(); toast('已装备 '+it.name); refreshHUD(); buildShop(); saveTick(); return;
    }
    stashAdd(id,1);
    sfxBuy(); toast('买下 '+it.name+' → 仓库'); refreshHUD(); buildShop(); saveTick(); return;
  }

  /* 【武器皮肤】买完立刻套到当前手持的主武器上。
     皮肤是纯外观，没有属性，所以不需要进仓库再装备 ——
     买完直接生效手感最好，也避免玩家买了不知道怎么用。
     如果手上不是枪（比如拿到了刀），就存进 P.skins 里，
     等真正装备那把枪时自动生效（curSkinId 会去查）。
     由于皮肤只能给枪上，我们把 skin 存到 P.equip.primary 这把枪的 id 上。 */
  if(cat==='skin'){
    const skinId=it.skin||id;
    /* 找一把能套的武器：优先当前手持的主武器，其次手里任何一把枪 */
    let target=(P.equip&&P.equip.primary)||null;
    if(!target && P.equip && P.equip.secondary) target=P.equip.secondary;
    if(!target){
      /* 一把枪都没有，不允许买，不然花了钱什么都看不到 */
      toast('先买一把枪再买皮肤'); sfxDeny(); buildShop(); saveTick(); return;
    }
    P.ammo.cash-=it.price;
    stashAdd(id,1);
    if(typeof setSkin==='function') setSkin(target, skinId);
    if(typeof _modelCache==='object') _modelCache.key=null;
    sfxBuy();
    toast('皮肤已应用 '+(SHOP_ITEMS[target]?SHOP_ITEMS[target].name:'')+' · '+it.name);
    refreshHUD(); buildShop(); saveTick(); return;
  }
  /* 【枪配件】进仓库，之后到「改枪台」装到具体的枪上。
     不在商店里直接装：配件有归属（装哪把枪），商店里没有「哪把枪」这个概念。 */
  if(cat==='mod'){
    P.ammo.cash-=it.price;
    stashAdd(id,1);
    sfxBuy(); toast(T('买下 ')+it.name+T(' → 仓库，去改枪台装上'));
    toast(T('去主菜单「改枪台」安装配件'));
    saveTick(); return;
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
  refreshHUD(); buildShop(); saveTick(); return;
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
  /* 【先开面板，再填内容】
     和 toggleShop 同一个坑：buildStashNew 抛错 -> display 不执行 -> 点了没反应。
     buildStashNew 有两百多行、要碰 P.stash/P.pouch/SHOP_ITEMS/GUN_MODS，
     任何一个数据异常都会让整个仓库打不开。现在面板先亮起来，
     build 出错时把错误直接显示在面板里，玩家能看到、我们也能定位。 */
  if(opening){
    el.style.display='flex';
    closeShop(); closeBag(); closeGunsmith();
    /* 每次打开仓库顺手修一次 looted 账本（见 clampLooted 注释），
       并重置卖出模式 —— 否则上次点开卖出没确认就退出，
       下次进来还是选择模式，点格子不装备，玩家会以为仓库坏了。 */
    if(typeof clampLooted==='function') clampLooted();
    sellMode=false; sellSel={};
    try{ buildStashNew(); }
    catch(e){ console.error('buildStashNew failed', e);
      el.innerHTML='<div class="stk"><div class="stkleft"><div class="stktitle">仓库</div>'
        +'<div class="d">加载失败：'+(e&&e.message||e)+'</div></div></div>'; }
  }
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
  /* 统一走 stashConsume：它会把「搜来的」账本一起扣掉，
     避免背包里的搜来物撤离回来后被当成自购品。 */
  if(!stashConsume(id, move)) return false;
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
/* 【卖出模式】点「卖出」进入选择模式：此时点仓库格子是「勾选/取消」，
   不再是「装备/放背包」。选完点「确认卖出」一次结算。
   为什么不直接点一下就卖：仓库里点错一格就把几千块的枪卖了，
   玩家会当场原地爆炸。所以必须两步确认。 */
let sellMode=false;
let sellSel={};      // { itemId: 选中数量（按此 id 全部卖） }
/* 单个物品的卖出单价：
     · 搜来的（P.looted 里还有额度）→ 原价 × 1.35（黑市溢价）
     · 自己买的 → 原价 × 0.6（六折回收，即原价 -40%）
   混着有时按「先卖搜来的」顺序算，这样对玩家最有利。 */
const SELL_LOOT_MUL=1.35;
const SELL_BOUGHT_MUL=0.6;
/* 【防止刷钱】looted 只是「这个东西里有几件是搜来的」的账本。
   它有两个必须守住的不变量：
     ① looted[id] ≤ stash[id]        —— 搜来 3 件但仓库只剩 1 件，账本最多算 1
     ② 任何让物品离开仓库的动作都要同步扣账本
        （stashTake / 装备 / 卖出 / 用掉）
   只做 ① 是不够的。反例：
     搜到 5 个医疗包(looted=5) → 全用掉 → 仓库空(looted 被夹成 0，OK)
     但如果是：搜到 1 个(looted=1) → 拿去装备/放背包 → 仓库 0、
     looted 被夹成 0 —— 这时是安全的。
     真正的坑在于「夹」这个动作本身是无损的：
     仓库里只剩 1 件自购品，而 looted 还记着 5，
     夹成 1 之后那 1 件自购品就被永久当成搜来的，按 1.35 倍卖 —— 白赚 35%。
   所以这里改成：一旦发现 looted > stash，说明搜来的那些已经不在仓库里了，
   直接清零，而不是夹到 stash 的数。宁可少给玩家一点溢价，
   也不能留下一个「玩两百小时后被发现」的经济漏洞。 */
function clampLooted(){
  if(typeof P.looted!=='object' || !P.looted) P.looted={};
  for(const id in P.looted){
    const have=P.stash[id]|0;
    const n=P.looted[id]|0;
    if(have<=0 || n<=0){ delete P.looted[id]; continue; }
    if(n>have) delete P.looted[id];
  }
}
function sellPriceOf(id){
  const it=SHOP_ITEMS[id];
  if(!it) return 0;
  const base=Math.max(1, it.price|0);
  /* 按「这一格整批卖」算平均价：先抵扣搜来的数量，剩下的算自购 */
  const have=P.stash[id]|0;
  const loot=Math.min(have, (P.looted[id]|0));
  const bought=Math.max(0, have-loot);
  if(have<=0) return 0;
  return Math.floor((loot*base*SELL_LOOT_MUL + bought*base*SELL_BOUGHT_MUL)/have);
}
/* 一次性结算：把 sellSel 里选中的物品全部卖掉 */
function doSellSelected(){
  clampLooted();   // 卖之前夹一次账本，防止用掉的搜来物品被重复溢价
  let total=0, cnt=0;
  for(const id in sellSel){
    const n=Math.min(sellSel[id]|0, P.stash[id]|0);
    if(n<=0) continue;
    const it=SHOP_ITEMS[id]; if(!it) continue;
    const base=Math.max(1, it.price|0);
    /* 先消耗「搜来的」额度再消耗自购额度 */
    let loot=Math.min(n, P.looted[id]|0);
    let bought=n-loot;
    total += Math.floor(loot*base*SELL_LOOT_MUL + bought*base*SELL_BOUGHT_MUL);
    /* 扣减来源计数 */
    if(loot>0){ P.looted[id]=(P.looted[id]|0)-loot; if(P.looted[id]<=0) delete P.looted[id]; }
    P.stash[id]=(P.stash[id]|0)-n;
    if(P.stash[id]<=0) delete P.stash[id];
    cnt+=n;
  }
  if(!cnt){ toast('没有选中物品'); sfxDeny(); return; }
  P.ammo.cash=(P.ammo.cash|0)+total;
  sellSel={}; sellMode=false;
  sfxBuy();
  toast('卖出 '+cnt+' 件 · +¥'+total);
  saveTick();
  buildStashNew(); refreshHUD();
}

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
  h+='<div class="stkbar">'
    +'<div class="stkcash">💵 <b>'+P.ammo.cash+'</b> 元</div>'
    +(sellMode
      ? '<button class="stksell on" id="stkSellBtn">确认卖出'+(Object.keys(sellSel).length?' ('+Object.keys(sellSel).length+')':'')+'</button>'
        +'<button class="stksell cancel" id="stkSellCancel">取消</button>'
      : '<button class="stksell" id="stkSellBtn">卖出</button>')
    +'</div>';
  if(sellMode){
    h+='<div class="stksellhint">'
      +'点物品选中 · 黄色边框是搜来的（¥溢价）· 点击确认卖出'
      +'</div>';
  }

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
    const sel=(sellMode && sellSel[id])?' selsell'
             :(!sellMode && selStash===id)?' sel':'';
    /* 卖出模式下每格右上角标出「能卖多少钱」，玩家不用猜 */
    const priceTag = sellMode
      ? '<span class="stkgp">¥'+sellPriceOf(id)+'</span>'
      : '';
    h+='<div class="stkg'+sel+'" data-item="'+id+'">'
      +'<span class="stkgi">'+it.icon+'</span>'
      +'<b class="stkgq">'+P.stash[id]+'</b>'
      +priceTag
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
  if(bk) bk.onclick=()=>{ selStash=null; sellMode=false; sellSel={}; toggleStash(); };

  /* 【卖出按钮】点一下进入/退出选择模式 */
  const sb=$('stkSellBtn');
  if(sb) sb.onclick=()=>{
    if(!sellMode){
      sellMode=true; sellSel={}; sfxUI();
      buildStashNew();
    } else {
      /* 已经在选择模式：这个按钮此时变成「确认卖出」 */
      const n=Object.keys(sellSel).length;
      if(!n){ toast('先点物品选中'); sfxDeny(); return; }
      let total=0;
      for(const id in sellSel){
        const c=sellSel[id]|0;
        const base=Math.max(1, SHOP_ITEMS[id].price|0);
        const loot=Math.min(c, P.looted[id]|0), bought=c-loot;
        total+=Math.floor(loot*base*SELL_LOOT_MUL + bought*base*SELL_BOUGHT_MUL);
      }
      if(confirm('确认卖出 '+n+' 种物品？共可得 ¥'+total)) doSellSelected();
    }
  };
  const sc=$('stkSellCancel');
  if(sc) sc.onclick=()=>{ sellMode=false; sellSel={}; sfxUI(); buildStashNew(); };

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
        saveTick();
        buildStashNew();
      }
    };
  });

  /* 点仓库格子：选中 / 放入装备槽 / 放进出击背包 */
  el.querySelectorAll('[data-item]').forEach(node=>{
    node.onclick=()=>{
      const id=node.dataset.item;
      const it=SHOP_ITEMS[id]; if(!it) return;
      /* 【卖出模式】此时点格子只是勾选，不做装备/放包 */
      if(sellMode){
        if(sellSel[id]) delete sellSel[id];
        else sellSel[id]=P.stash[id]|0;
        sfxUI();
        buildStashNew();
        return;
      }

      /* 装备类直接穿上（替换下来的回仓库） */
      const slot=stashSlotOf(id);
      if(slot){
        const old=P.equip[slot];
        if(old && old!==id) stashAdd(old,1);
        P.equip[slot]=id;
        stashConsume(id);   // 同步搜来账本（见 stashConsume 注释）
        /* 背包要重算容量 */
        if(slot==='backpack'){ P.bagCap=it.cap||24; }
        toast('已装备 '+(it.name||''));
        saveTick();
        buildStashNew(); refreshHUD();
        return;
      }

      /* 消耗品：放进出击背包 */
      if(P.bagCap<=0){ toast('没有背包，装不了东西'); sfxDeny(); return; }
      if(pouchUsed()>=P.bagCap){ toast('背包满了'); sfxDeny(); return; }
      /* 容量：物品本身占 1 格，一次放 1 个 */
      if(stashTake(id,1)){
        bagAdd(id,1);
        /* 【以前这里没有 saveTick()】玩家把药、子弹、手雷从仓库点进
           出击背包后直接关页面，这一格就丢了 —— 表现就是「没保存」。
           放包和装备都是局外资产变动，一律立刻落盘。 */
        saveTick();
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
  /* 【拖拽配件到武器】在仓库里把配件格子拖到「主武器/手枪」槽上即安装。
     为什么要拖而不是点：点格子已经有含义（装备 / 放背包），
     加二级菜单在手机上很难用，所以走直觉的「拖上去」。
     实现用 pointer 事件 + 8px 阈值区分「点击」和「拖动」，
     否则手指稍微抖一下就会既装备又拖拽，两次操作打架。 */
  bindStashDrag(el);
}
/* 找到当前能接收某配件的武器槽（返回槽 key，如 'primary'） */
function modTargetSlot(modId){
  const md=GUN_MODS[modId];
  if(!md) return null;
  for(const s of ['primary','secondary']){
    const gid=P.equip[s];
    if(!gid) continue;
    const list=GUN_SLOTS[gid];
    if(list && list.indexOf(md.slot)>=0) return s;
  }
  return null;
}
/* 把配件拖到武器上 = 安装到那把枪的对应槽位 */
function dragModOnto(modId, slotKey){
  const gid=P.equip[slotKey];
  if(!gid){ sfxDeny(); toast('这个槽没装枪'); return false; }
  const md=GUN_MODS[modId];
  if(!md){ return false; }
  const list=GUN_SLOTS[gid]||[];
  if(list.indexOf(md.slot)<0){
    sfxDeny(); toast(SHOP_ITEMS[gid]?SHOP_ITEMS[gid].name:gid+' 没有 '+md.slot+' 位置');
    return false;
  }
  gunMount(gid, md.slot, modId);
  buildStashNew();
  return true;
}
function bindStashDrag(root){
  const ghostPool={g:null};
  const cells=root.querySelectorAll('[data-item]');
  cells.forEach(cell=>{
    const id=cell.dataset.item;
    const it=SHOP_ITEMS[id];
    if(!it || it.cat!=='mod') return;      // 只有配件可拖
    cell.classList.add('armed');           // 视觉提示：这个能拖
    let sx=0, sy=0, dragging=false, moved=false, ghost=null;
    let hotSlot=null;
    const clearHot=()=>{
      if(hotSlot) hotSlot.classList.remove('hot');
      hotSlot=null;
    };
    const dropTargetAt=(x,y)=>{
      const e=document.elementFromPoint(x,y);
      if(!e) return null;
      const n=e.closest ? e.closest('[data-slot]') : null;
      if(!n) return null;
      const k=n.dataset.slot;
      if(k!=='primary' && k!=='secondary') return null;
      const gid=P.equip[k];
      if(!gid) return null;
      const list=GUN_SLOTS[gid]||[];
      if(list.indexOf(GUN_MODS[id]?GUN_MODS[id].slot:'')<0) return null;
      return n;
    };
    const onDown=(ev)=>{
      if(ev.button!==undefined && ev.button!==0 && ev.pointerType==='mouse') return;
      sx=ev.clientX; sy=ev.clientY; moved=false; dragging=true;
    };
    const onMove=(ev)=>{
      if(!dragging) return;
      const dx=ev.clientX-sx, dy=ev.clientY-sy;
      if(!moved && Math.abs(dx)+Math.abs(dy) < 8) return;   // 阈值内当点击
      moved=true;
      if(!ghost){
        ghost=document.createElement('div');
        ghost.className='dragghost';
        ghost.textContent=it.icon||'🔧';
        document.body.appendChild(ghost);
        ghostPool.g=ghost;
      }
      ghost.style.left=ev.clientX+'px';
      ghost.style.top=ev.clientY+'px';
      const t=dropTargetAt(ev.clientX, ev.clientY);
      if(t!==hotSlot){ clearHot(); if(t){ t.classList.add('hot'); hotSlot=t; } }
      if(ev.cancelable) ev.preventDefault();
    };
    const onUp=(ev)=>{
      if(!dragging) return;
      const wasMoved=moved;
      dragging=false; moved=false;
      if(ghost){ ghost.remove(); ghost=null; ghostPool.g=null; }
      const t=hotSlot; clearHot();
      if(!wasMoved) return;                 // 没拖动 → 交给 click 处理
      if(t){
        dragModOnto(id, t.dataset.slot);
      } else {
        const tk=modTargetSlot(id);
        if(tk){ dragModOnto(id, tk); }
        else { sfxDeny(); toast('拖到主武器或手枪上才能装'); }
      }
    };
    cell.addEventListener('pointerdown', onDown);
    cell.addEventListener('pointermove', onMove);
    cell.addEventListener('pointerup', onUp);
    cell.addEventListener('pointercancel', onUp);
    /* 拖动结束后浏览器仍会补发一次 click —— 用捕获阶段拦掉，
       否则会「装上配件」又立刻「把配件塞进背包」，玩家会一脸懵。 */
    cell.addEventListener('click', (ev)=>{
      if(cell.dataset.justDragged==='1'){ ev.stopPropagation(); ev.preventDefault();
        cell.dataset.justDragged=''; }
    }, true);
    const mark=(ev)=>{ if(moved) cell.dataset.justDragged='1'; };
    cell.addEventListener('pointerup', mark);
  });
}

/* ---- 局内背包 ---- */
function toggleBag(){
  const b=$('bag'); if(!b) return;
  const opening = b.style.display!=='flex';
  if(opening){
    b.style.display='flex';
    closeShop(); closeStash(); closeGunsmith();
    try{ buildBagNew(); }
    catch(e){ console.error('buildBagNew failed', e);
      b.innerHTML='<div class="stk"><div class="stkleft"><div class="stktitle">背包</div>'
        +'<div class="d">加载失败：'+(e&&e.message||e)+'</div></div></div>'; }
  }
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
  /* ---------- 胸挂格子（独立一排，点一下立即使用） ----------
     放在背包格子【上面】且视觉上分开，强调「快速取用」：
     打仗时急的是掏急救包，不是翻背包。 */
  const ccap=chestCapOf();
  if(ccap>0){
    const cfill=Math.min(ccap, chestUsed());
    h+='<div class="chestrow"><div class="chesthd">🦺 胸挂快速取用 '+cfill+'/'+ccap+'</div><div class="chestgrid">';
    const owned2=[];
    for(const id in P.chestPouch){
      if(!(P.chestPouch[id]>0)) continue;
      if(!SHOP_ITEMS[id]) continue;
      owned2.push(id);
    }
    for(const id of owned2){
      const it=SHOP_ITEMS[id];
      h+='<div class="stkg chest" data-use="'+id+'" data-src="chest">'
        +'<span class="stkgi">'+it.icon+'</span>'
        +'<b class="stkgq">'+P.chestPouch[id]+'</b>'
        +'</div>';
    }
    for(let i=owned2.length;i<ccap;i++) h+='<div class="stkg chest empty"></div>';
    h+='</div></div>';
  }else{
    h+='<div class="chestrow"><div class="chesthd dim">🦺 没有佩戴胸挂（不能快速取用医疗/弹药）</div></div>';
  }
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
      /* data-src='chest' 表示这一格在胸挂区，从胸挂扣数量 */
      useItem(id, g.dataset.src);
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

/* 使用背包（pouch）或胸挂（chestPouch）里的物品。
   src 省略时按「胸挂优先」查找 —— 胸挂就是用来快速取用的。 */
function useItem(id, src){
  const it=SHOP_ITEMS[id]; if(!it) return;
  /* 决定从哪个容器扣：显式指定 > 胸挂里有就胸挂 > 背包 */
  let from=null;
  if(src==='chest' && P.chestPouch[id]>0) from='chest';
  else if(src==='bag' && P.pouch[id]>0) from='bag';
  else if(P.chestPouch[id]>0) from='chest';
  else if(P.pouch[id]>0) from='bag';
  if(!from){ sfxDeny(); return; }
  const box = (from==='chest') ? P.chestPouch : P.pouch;
  if(it.heal){
    if(P.hp>=100){ sfxDeny(); toast('生命已满'); return; }
    box[id]--; if(box[id]<=0) delete box[id];
    P.hp=Math.min(100,P.hp+it.heal);
    sfxPickup(); toast(it.name+' +'+it.heal+' HP');
    refreshHUD(); buildBagNew(); return;
  }
  if(id==='grenade'||id==='flashbang'||id==='smoke'){
    box[id]--; if(box[id]<=0) delete box[id];
    sfxPickup(); toast('已投掷 '+it.name); buildBagNew(); return;
  }
  /* 【弹药物品】点一下就把备弹补到对应枪里。
     以前弹药走到这里只会提示「局内无法直接使用」，
     玩家身上背着一堆子弹却打不出去，看起来就像背包坏了。 */
  if(it.cat==='ammo' && it.ammo){
    const key={rifle:'rifle',pistol:'pistol',sniper:'sniper',shot:'shot'}[it.ammo]||it.ammo;
    const add=it.count||30;
    P.ammo[key]=(P.ammo[key]|0)+add;
    box[id]--; if(box[id]<=0) delete box[id];
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

/* ================= 小地图 =================
   【为什么要有】校园主体约 138×114 米、六栋楼加操场看台，
   光靠第一人称走一定会迷路，更别说最后要在一分钟内跑到撤离点。
   世界坐标 -> 地图像素是纯线性映射，不做旋转（北永远朝上），
   这样玩家才能把「地图上的楼」和「眼前的楼」对应起来。

   世界范围（取自 b_world.js 的围墙）：
     西墙 x=-60、东墙 x=78、南墙 z=-46、北墙 z=68
   往外留 4 米边距，免得撤离点/门柱贴边被裁掉。 */
const MM_X0=-64, MM_X1=82, MM_Z0=-52, MM_Z1=74;
/* 校园里几块主要建筑，直接用矩形近似（和 b_world.js 的 box 尺寸一致）。
   x,z 是盒子中心，w,d 是宽/深，n 是名字。 */
const MM_BUILDINGS=[
  {x:0,   z:-22, w:60, d:16, n:'主楼'},      // box(60,14,16, 0,-22)
  {x:-34, z:2,   w:16, d:32, n:'西楼'},      // box(16,14,32, -34,2)
  {x:34,  z:2,   w:16, d:32, n:'东楼'},      // box(16,14,32, 34,2)
  {x:0,   z:26,  w:34, d:15, n:'行政楼'},    // box(34,11,15, 0,26)
  {x:16,  z:34,  w:86, d:52, n:'操场'},      // groundDeco(86,52, 16,34)
  {x:58,  z:18,  w:26, d:22, n:'体育馆'}     // 体育馆在操场东侧
];
let mmCtx=null, mmLast=0;

function mmProject(x,z,w,h){
  const px = (x-MM_X0)/(MM_X1-MM_X0)*w;
  const pz = (z-MM_Z0)/(MM_Z1-MM_Z0)*h;
  return [px,pz];
}

/* 主入口：每帧画一次。10fps 足够，省电且不抖。 */
function drawMiniMap(now){
  const cv=$('mmCanvas');
  if(!cv) return;
  if(now-mmLast < 100) return;
  mmLast=now;
  if(!mmCtx) mmCtx=cv.getContext('2d');
  const g=mmCtx; if(!g) return;
  const W=cv.width, H=cv.height;
  g.clearRect(0,0,W,H);

  /* 底：深色地面 */
  g.fillStyle='rgba(18,26,20,.72)';
  g.fillRect(0,0,W,H);

  /* 操场：绿色块 + 跑道橙红描边，一眼能认出方位 */
  g.save();
  const [sx,sz]=mmProject(16-43, 34-26, W,H);
  const [sw,sh]=[86/(MM_X1-MM_X0)*W, 52/(MM_Z1-MM_Z0)*H];
  g.fillStyle='rgba(52,104,60,.72)';
  g.fillRect(sx,sz,sw,sh);
  g.strokeStyle='rgba(168,53,40,.85)';
  g.lineWidth=1.6;
  g.strokeRect(sx+1,sz+1,sw-2,sh-2);
  g.restore();

  /* 建筑：灰米色矩形 + 描边 */
  for(let i=0;i<MM_BUILDINGS.length;i++){
    const b=MM_BUILDINGS[i];
    if(b.n==='操场') continue;   // 上面已经画过
    const [bx,bz]=mmProject(b.x-b.w/2, b.z-b.d/2, W,H);
    const bw=b.w/(MM_X1-MM_X0)*W, bh=b.d/(MM_Z1-MM_Z0)*H;
    g.fillStyle='rgba(196,184,158,.82)';
    g.fillRect(bx,bz,bw,bh);
    g.strokeStyle='rgba(90,82,68,.9)';
    g.lineWidth=1;
    g.strokeRect(bx+.5,bz+.5,bw-1,bh-1);
  }

  /* 围墙：虚线表示校园边界 */
  g.save();
  g.setLineDash([3,3]);
  g.strokeStyle='rgba(160,180,200,.45)';
  g.lineWidth=1;
  const [wx0,wz0]=mmProject(-60,-46,W,H);
  const [wx1,wz1]=mmProject(78,68,W,H);
  g.strokeRect(wx0,wz0,wx1-wx0,wz1-wz0);
  g.restore();

  /* 校门：南墙中间留个缺口，画成亮色 */
  g.save();
  const [gx,gz]=mmProject(-5,-46,W,H);
  g.strokeStyle='rgba(255,213,74,.9)';
  g.lineWidth=2.5;
  g.beginPath(); g.moveTo(gx,gz); g.lineTo(gx+10/(MM_X1-MM_X0)*W,gz); g.stroke();
  g.restore();

  /* 撤离点：绿色呼吸光圈 + 固定十字标记。
     呼吸用时间正弦，不占帧预算，但比静态点醒目得多。 */
  if(exfil){
    const [ex,ez]=mmProject(exfil.x,exfil.z,W,H);
    const ph=(Math.sin(now/300)+1)/2;          // 0..1
    const r=4+ph*4;
    g.beginPath();
    g.arc(ex,ez,r,0,Math.PI*2);
    g.strokeStyle='rgba(51,255,136,'+(0.35+ph*0.5).toFixed(2)+')';
    g.lineWidth=1.8; g.stroke();
    g.beginPath();
    g.arc(ex,ez,2.2,0,Math.PI*2);
    g.fillStyle='#33ff88'; g.fill();
    /* 小标：撤离两个字太大，用一个 E 字母 + 短引线 */
    g.font='bold 7px system-ui,sans-serif';
    g.fillStyle='#33ff88';
    g.textAlign='center'; g.textBaseline='bottom';
    g.fillText('E',ex,ez-7);
  }

  /* 玩家：三角形箭头，指向当前朝向。
     世界前方向是 (-sin(yaw), -cos(yaw))（见 c_player.js 的 updP），
     映射到地图像素后，屏幕上的「上」对应世界 -z。 */
  if(P && P.pos){
    const [px,pz]=mmProject(P.pos.x,P.pos.z,W,H);
    /* 【角度推导】世界前方向 fwd=(-sin(yaw), -cos(yaw))，见 c_player.js。
       地图像素坐标 x 向右 = 世界 +x，y 向下 = 世界 +z。
       所以地图空间里的前方向量就是 (fwdX, fwdZ)。
       canvas 的「上」是 -y，而箭头模型的尖端画在 (0,-5.5)（即上），
       因此要让尖端指向 (fwdX,fwdZ)，旋转角应为
         a = atan2(fwdX, -fwdZ)。
       【之前错在哪】写成了 atan2(-sin, -cos)，正好等价于 atan2(fwdX, fwdZ)，
       等于把「向下为正」当成了「向上为正」，箭头永远差一个镜像，
       而且 yaw=±90° 附近还会退化到 π，看起来像箭头乱跳。 */
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const a = Math.atan2(fx, -fz);
    g.save();
    g.translate(px,pz);
    g.rotate(a);
    g.beginPath();
    g.moveTo(0,-5.5);
    g.lineTo(4,4.5);
    g.lineTo(0,2);
    g.lineTo(-4,4.5);
    g.closePath();
    g.fillStyle='#7c5cff';
    g.strokeStyle='#fff';
    g.lineWidth=1;
    g.fill(); g.stroke();
    g.restore();
  }

  /* 底部小字：根据玩家位置提示当前所在区域，顺便当方位参考 */
  const lb=$('mmLabel');
  if(lb){
    let zone='校园';
    if(P && P.pos){
      const x=P.pos.x, z=P.pos.z;
      /* 【判定顺序】必须从小到大、从具体到笼统。
         操场是 86×52 的大矩形，以前用「到中心距离<50」当判据，
         半径 50 的圆几乎盖住了整个校园，导致站在西楼、体育馆、
         甚至校门口都被标成「操场」。现在全部改成矩形包含判断，
         并且把建筑排在操场前面 —— 站在楼里就该显示楼名。 */
      const inRect=(cx,cz,w,d)=>Math.abs(x-cx)<=w/2 && Math.abs(z-cz)<=d/2;
      if(inRect(0,-22,60,16))        zone='主楼';
      else if(inRect(-34,2,16,32))   zone='西楼';
      else if(inRect(34,2,16,32))    zone='东楼';
      else if(inRect(0,26,34,15))    zone='行政楼';
      else if(inRect(58,18,26,22))   zone='体育馆';
      else if(z<-40)                 zone='校门口';
      else if(inRect(16,34,86,52))   zone='操场';
      else if(z>44)                  zone='北场地';
    }
    /* 【国际化】zone 保留中文原申作为 key（不要先翻再存），
       每次渲染即时调 T()。这样切语言后不需要重建小地图，
       下一帧就自动变成英文。 */
    const t='🗺 '+T(zone);
    if(lb.textContent!==t) lb.textContent=t;
  }
}

/* ---- 撤离 / 阵亡 结算 ---- */
/* 撤离成功：局内背包 + 胸挂 + 身上装备全部并回仓库 */
function settleExfil(){
  let gained=0;
  /* 【带回物品的来源标记】物品带上局的时候 stashConsume 把它的
     「搜来的」额度扣掉了。撤离成功后它回到仓库，如果这里不补回去，
     玩家每次带出去又带回来，搜来的东西就会慢慢「变成」自购品，
     最后只能按 6 折卖 —— 明明什么都没做，价格自己掉了，很反直觉。
     所以：带回多少件，就把多少件的搜来额度还回去（以物品当初的来源为准）。 */
  const backLoot={};
  for(const id in P.pouch){
    if(P.pouch[id]>0) backLoot[id]=(backLoot[id]||0)+P.pouch[id];
  }
  for(const id in P.chestPouch){
    if(P.chestPouch[id]>0) backLoot[id]=(backLoot[id]||0)+P.chestPouch[id];
  }
  for(const id in P.pouch){
    if(P.pouch[id]>0){ P.stash[id]=(P.stash[id]||0)+P.pouch[id]; gained+=P.pouch[id]; }
  }
  /* 胸挂里的东西也带回来 —— 它是你自己带进去的，撤离成功自然该保住。
     如果只结算 pouch 而不结算 chestPouch，玩家会发现
     「放进胸挂的急救包撤离后不见了」，这显然不合逻辑。 */
  for(const id in P.chestPouch){
    if(P.chestPouch[id]>0){ P.stash[id]=(P.stash[id]||0)+P.chestPouch[id]; gained+=P.chestPouch[id]; }
  }
  P.pouch={};
  P.chestPouch={};
  /* 把「带出去又带回来」的物品的搜来额度还回去。
     注意只还「原来就是搜来的」那些：P.pouchLoot 在 stashTake 时记录了
     这次带进局的物品里有多少是搜来的，没有该记录就什么都不还，
     保证不会把自购品误标成搜来的。 */
  if(P.pouchLoot && typeof P.pouchLoot==='object'){
    for(const id in P.pouchLoot){
      const n=P.pouchLoot[id]|0;
      if(n<=0) continue;
      const have=P.stash[id]|0;
      const add=Math.min(n, have);
      if(add>0){
        P.looted[id]=(P.looted[id]|0)+add;
        if(P.looted[id]>have) P.looted[id]=have;
      }
    }
  }
  P.pouchLoot={};
  /* 装备也一起"带回"，保留在 equip 里继续用 */
  saveTick();   // 撤离是钱/仓库大变动，必须立刻落盘
  /* 撤离时如果搜索面板还开着，要关掉 —— 否则下一局开局就顶着
     上一局的箱子面板，看着像 bug。 */
  try{ if(typeof closeContainer==='function') closeContainer(); }catch(e){}
  toast('撤离成功！带回 '+gained+' 件物品');
}
/* 阵亡：局内背包和装备全部丢失（搜打撤的风险） */
function settleDeath(){
  /* 胸挂里的也算「带进局的物资」，阵亡一样丢。 */
  const lost=Object.keys(P.pouch).length + Object.keys(P.chestPouch).length;
  P.pouch={};
  P.chestPouch={};
  /* 阵亡：带出去的搜来记录也一并作废（东西已经丢了，不能再还额度）。 */
  P.pouchLoot={};
  /* 【阵亡清空全部九个槽位】
     原来只写了 helmet/armorVest/backpack 三个，
     后来加了 primary/secondary/melee/chest 四个武器槽却忘了同步，
     结果主武器、手枪、小刀、胸挂在你死后会「跟着你进下一局」——
     等于白捡，搜打撤的风险完全消失了。
     这里改成整表重建，以后再加槽也不会漏。 */
  P.equip={ helmet:null, armorVest:null, backpack:null,
            primary:null, secondary:null, melee:null, chest:null };
  P.helmetDur=0; P.vestDur=0; P.bagCap=0;
  try{ if(typeof closeContainer==='function') closeContainer(); }catch(e){}
  saveTick();   // 阵亡清空装备，同样要落盘（否则刷新后装备回来了，风险机制失效）
  return lost;
}

/* 【启动 bindUI】
   以前是直接 bindUI()。问题在于：bindUI 内部任何一处抛错，
   都会让「它后面的所有按钮绑定」全部跳过 —— 用户看到的就是
   「主界面所有按钮都点不动，但按下有蓝圈」（蓝圈是 CSS :active，
   不需要 JS，所以视觉有反馈但功能死了）。
   现在：
     1. 外面加 try/catch 并打印明确日志，不再静默失败；
     2. 无论成功失败都设置 __uiBound，避免 DOMContentLoaded 再跑一遍
        导致事件重复绑定（灵敏度翻倍的问题会回来）；
     3. 即使 bindUI 崩了，下面的菜单按钮兜底绑定也会补上。 */
function __startBindUI(){
  let ok=false;
  try{ bindUI(); ok=true; }
  catch(e){ console.error('bindUI crashed', e); }
  window.__uiBound=true;
  /* 兜底：如果 bindUI 中途崩了，主菜单按钮很可能一个都没绑上。
     这里再统一补一次（幂等：已经绑过的直接覆盖，不会重复）。
     这是「按钮点不动」的最后一道保险。 */
  try{ __bindMenuFallback(); }catch(e){ console.error('menu fallback failed', e); }
  window.__uiReady=ok;
}
/* 主菜单按钮兜底绑定：只做最容易失效、也最要紧的那几个 */
function __bindMenuFallback(){
  /* 【事件委托兜底 —— 最关键的一层】
     不管 bindUI 有没有跑完、有没有绑 onclick，只要点到这些 id
     就能触发对应功能。这是最后一个保险丝：
       · 用捕获阶段（capture=true）先拿到事件，避免被别的层吞掉；
       · 靠 e.target 向上找 id，不依赖任何按钮是否被绑定过；
       · 每个分支各自 try，互不影响。
     用户的实际现象是「按下有蓝圈（CSS :active）但没反应」，
     说明事件确实到达了按钮，只是没有 JS 处理 ——
     这层委托正是针对这个情况。 */
  /* 委托只接管这几个按钮：其余元素（面板内部、摇杆、HUD pill）
     各自有自己的触摸逻辑，不能让委托偷跑。 */
  const MENU_DELEGATE_IDS=new Set(['btnPlay','btnShop','btnStash','btnGunsmith',
    'btnExport','btnImport','btnReset','btnBack','btnPickSave']);
  const pick=(t)=>{
    let n=t;
    while(n && n.nodeType===1){
      if(n.id) return n.id;
      n=n.parentElement;
    }
    return null;
  };
  const handler=(e)=>{
    const id=pick(e.target);
    if(!id) return;
    /* 【去重】如果这个按钮已经有 onclick 并且真的执行过，
       就不要再走委托，否则点一次会触发两次（比如买两件、
       开两次面板、跳两次页面）。
       判断依据：元素上有 __jsBound 标记（绑定成功时打上）。
       没标记 = onclick 没绑上 = 正是委托要救的场景。 */
    /* 【防双跑】如果这个按钮在最近 500ms 内已经被它自己的 onclick 执行过，
       委托就不要再跑一次。
       为什么要改基准：原来只判 el.__jsBound（标记存在 = 跳过），
       但标记只能说明「当时绑上了」，不能说明「这次点击它真的执行了」——
       如果 onclick 因为同步异常在 run 之前就抛了，或者被某层吞了，
       标记依然存在，委托也会跳继，于是点击彻底失联。
       tapAction 会在执行时写 el.__boundAt = Date.now()，这里用它当真实凭据；
       没有 __boundAt（老式 bindBtn 绑的）时再退回 __jsBound 判据。 */
    const el=(e.target && e.target.closest)? e.target.closest('#'+id) : e.target;
    if(el){
      const at=el.__boundAt||0;
      if(at && Date.now()-at<500) return;
      if(!at && el.__jsBound) return;
    }
    try{
      switch(id){
        case 'btnPlay': {
          try{ if(typeof autoSaveFlush==='function') autoSaveFlush(); }catch(x){}
          const m=$('menu'); if(m) m.style.display='none';
          try{ audioInit(); audioResume(); sfxUI(); }catch(x){}
          window.__inGame=true;
          if(typeof window.__orientEnter==='function'){ try{ window.__orientEnter(); }catch(x){} }
          try{ init(); }catch(x){ console.error('init failed', x); }
          try{ applyInputMode(inputMode, true); }catch(x){}
          break;
        }
        case 'btnShop':      try{ toggleShop(); }catch(x){ console.error(x); } break;
        case 'btnStash':     try{ sfxUI(); toggleStash(); }catch(x){ console.error(x); } break;
        case 'btnGunsmith':  try{ sfxUI(); closeShop();
                                   const st=$('stash'); if(st) st.style.display='none';
                                   toggleGunsmith(); }catch(x){ console.error(x); } break;
        case 'btnExport':    exportSave(); break;
        case 'btnImport': {
          const row=$('saveRow'), f=$('saveFile');
          if(row) row.style.display='flex';
          if(f){ f.value=''; try{ f.click(); }catch(x){} }
          importSave();
          break;
        }
        case 'btnPickSave': { const f=$('saveFile'); if(f) f.click(); break; }
        case 'btnReset':
          if(!confirm('确认重置所有数据？')) return;
          try{ if(typeof autoSaveClear==='function') autoSaveClear(); }catch(x){}
          try{ localStorage.removeItem('efs_fps_save_v1'); }catch(x){}
          location.reload();
          break;
        case 'btnBack': location.href='../'; break;
      }
    }catch(x){ console.error('menu delegate failed for '+id, x); }
  };
  /* 【touchstart 也走一遍】
     这层委托原本只挂 click。可这几个按钮失效的典型现场就是
     「click 根本没被浏览器合成」（touch-action:none + 页面里有
     preventDefault），而 touchstart 是一定会到的。
     所以再挂一份 touchstart，并把「这次触摸已被处理」的凭据
     （__boundAt）共享给 click 那份，保证一次点击只执行一次。 */
  const touchHandler=(e)=>{
    /* 只处理主菜单里这几个按钮，其它地方不干预，
       否则会和面板内部的按钮、摇杆、摇杆等触摸逻辑冲突。 */
    const id=pick(e.target);
    if(!id) return;
    if(!MENU_DELEGATE_IDS.has(id)) return;
    const el=(e.target && e.target.closest)? e.target.closest('#'+id) : e.target;
    if(el){
      const at=el.__boundAt||0;
      if(at && Date.now()-at<500) return;   // 它自己的 touchstart 已经处理了
    }
    handler(e);
  };
  /* 幂等：只挂一次 */
  if(!window.__menuDelegated){
    window.__menuDelegated=true;
    document.addEventListener('click', handler, true);
    try{ document.addEventListener('touchstart', touchHandler, {capture:true, passive:true}); }catch(e){}
  }
  /* 下面这些是为「明确绑定」留的，有 delegate 在就算没绑上也能用，
     但保留 onclick 可以让绑定的语义更清晰（也兼容旧逻辑）。 */
  const play=$('btnPlay');
  if(play && !play.onclick){ play.onclick=()=>{
    try{ if(typeof autoSaveFlush==='function') autoSaveFlush(); }catch(e){}
    const m=$('menu'); if(m) m.style.display='none';
    try{ audioInit(); audioResume(); sfxUI(); }catch(e){}
    window.__inGame=true;
    if(typeof window.__orientEnter==='function'){ try{ window.__orientEnter(); }catch(e){} }
    try{ init(); }catch(e){ console.error('init failed', e); }
    try{ applyInputMode(inputMode, true); }catch(e){}
  }; play.__jsBound=true; }
  const shopBtn=$('btnShop');
  if(shopBtn && !shopBtn.onclick){ shopBtn.onclick=()=>{ try{ toggleShop(); }catch(e){ console.error(e); } }; shopBtn.__jsBound=true; }
  const stashBtn=$('btnStash');
  if(stashBtn && !stashBtn.onclick){ stashBtn.onclick=()=>{ try{ sfxUI(); toggleStash(); }catch(e){ console.error(e); } }; stashBtn.__jsBound=true; }
  const gsBtn=$('btnGunsmith');
  if(gsBtn && !gsBtn.onclick){
    gsBtn.onclick=()=>{
      try{ sfxUI(); closeShop(); const st=$('stash'); if(st) st.style.display='none'; toggleGunsmith(); }
      catch(e){ console.error(e); }
    };
    gsBtn.__jsBound=true;
  }
  const exportBtn=$('btnExport');
  if(exportBtn && !exportBtn.onclick){ exportBtn.onclick=exportSave; exportBtn.__jsBound=true; }
  const importBtn=$('btnImport');
  if(importBtn && !importBtn.onclick){
    importBtn.onclick=()=>{
      const row=$('saveRow'), f=$('saveFile');
      if(row) row.style.display='flex';
      if(f){ f.value=''; try{ f.click(); }catch(e){} }
      importSave();
    };
    importBtn.__jsBound=true;
  }
  const resetBtn=$('btnReset');
  if(resetBtn && !resetBtn.onclick){
    resetBtn.onclick=()=>{
      if(!confirm('确认重置所有数据？')) return;
      try{ if(typeof autoSaveClear==='function') autoSaveClear(); }catch(e){}
      try{ localStorage.removeItem('efs_fps_save_v1'); }catch(e){}
      location.reload();
    };
    resetBtn.__jsBound=true;
  }
  const backBtn=$('btnBack');
  if(backBtn && !backBtn.onclick){ backBtn.onclick=()=>{ location.href='../'; }; backBtn.__jsBound=true; }
}
/* 【bindUI 的调用时机】
   原来紧跟在 f_ui.js 末尾就调用。而 f_ui.js 后面还有 x_ext / w_weapon /
   y_audio / _orient / u_i18n / z_render 五个文件没被解析。
   虽然函数声明会提升，但只要 bindUI 里碰到任何一个用 const/let
   定义的东西（比如某个常量、或者被 let 声明的状态），
   就会抛 ReferenceError（暂时性死区），而且是整个模块直接中断。
   现在改成用 DOMContentLoaded + 微任务推迟到「所有分块都执行完」之后再跑，
   这样任何函数都肯定已经存在了。 */
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',()=>{ setTimeout(__startBindUI,0); });
}else{
  /* 脚本还没跑完（后面还有几个文件），推迟到当前任务之后再绑 */
  setTimeout(__startBindUI,0);
}/* ============ 输入方式自适应 ============
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
  /* 【音量/背包/治疗按钮的触摸不要外传】
     这三个 pill 自己已经用 touchstart 处理了点击，但如果同一次触摸
     继续冒泡到 window，会被下面的逻辑当成「游戏区域点击」
     （开火/转视角/切输入模式），表现为「点了背包还能听到枪响」。
     在捕获阶段就截住，并且只截这三个 + 顶部货币条。 */
  addEventListener('touchstart', e=>{
    const t=e.target;
    if(!t || !t.closest) return;
    let hit=null;
    try{ hit=t.closest('#topbar'); }catch(err){}
    if(hit && e.cancelable){ e.stopPropagation(); }
  }, {passive:false, capture:true});

  /* ============================================================
     【问题 3 修复】手指点一下「按键之外」的地方就被判成键盘。

     原因是这一句 mousedown：
        if(e.pointerType==='touch') { onTouchSignal(); return; }
        onKeyboardSignal();
     触屏设备在手指抬起后，浏览器会**额外合成一次鼠标事件序列**
     （mousedown/mouseup/click）用来兼容老网页 —— 这就是所谓的
     「兼容性鼠标事件」。这串事件的 pointerType 是空字符串，
     不是 'touch'，所以走进了 onKeyboardSignal()，
     于是「手指点屏幕 → 被当成插了键盘 → 触摸按键全隐藏」。
     又因为 applyInputMode 有 400ms 冷却、而触摸信号总是先到，
     两者来回打架，表现就是点一下闪一下、最后停在键盘模式。

     为什么不能简单地把 mousedown 删掉：
     桌面用户（真插鼠标）还是希望隐藏触摸按键的。

     正确做法：从源头上区分「真鼠标」和「触屏合成的假鼠标」。
     浏览器给出的可靠判据：
       · e.sourceCapabilities.firesTouchEvents === true  → 是触屏合成的
       · e.pointerType === 'touch'                       → 触摸
       · 最近 1 秒内刚有 touchstart                       → 肯定是触屏
     另外鼠标真正「移动」过（mousemove 带位移）才是真鼠标 ——
     触屏合成的 mousemove 位移恒为 0，靠这个也能区分。
     ============================================================ */

  /* 【已上移】lastRealTouchAt / isSyntheticMouse 现在定义在 refreshHUD 之前，
     因为 bindUI 里的全局开火监听也要用它们。这里是唯一实现，
     不再重复声明（ES module 严格模式下重复声明会编译失败）。 */

  addEventListener('mousedown', e=>{
    /* 【只有真鼠标才切键盘模式】合成鼠标一律当作触摸 */
    if(isSyntheticMouse(e)){ onTouchSignal(); return; }
    onKeyboardSignal();
  }, {passive:true});

  /* mousemove 才是「真的有鼠标」的最强证据：
     触屏合成的 mousemove 坐标不变化（screenX/Y 都是上次的值）。
     真鼠标挪动会带来非零位移，这时才允许切键盘模式。 */
  let lastMx=null, lastMy=null;
  addEventListener('mousemove', e=>{
    if(isSyntheticMouse(e)) return;
    const x=e.screenX, y=e.screenY;
    const moved = (lastMx!==null) && (Math.abs(x-lastMx)>2 || Math.abs(y-lastMy)>2);
    lastMx=x; lastMy=y;
    if(moved) onKeyboardSignal();
  }, {passive:true});

  /* 初始判定：有精确指针（鼠标）且没有粗指针（触摸）就是纯桌面。
     用 try 包住是因为部分 WebView / 测试环境没有 matchMedia，
     这种环境下一律按触摸处理（最保守，至少按钮能用）。
     【额外收紧】只要设备报 maxTouchPoints>0，就默认当触摸设备 ——
     手机上即使被识别成 hover:hover（个别外接屏/浏览器会这样报），
     也不该默认藏起触摸按键，那会让手机玩家直接没法玩。 */
  try{
const maxTouch = (typeof navigator!=='undefined' && navigator.maxTouchPoints) || 0;
    const coarse = (typeof matchMedia==='function') && matchMedia('(pointer:coarse)').matches;
    const hover  = (typeof matchMedia==='function') && matchMedia('(hover:hover)').matches;
    const isTouch = maxTouch>0 || coarse;
    applyInputMode((!isTouch && hover) ? 'keyboard' : 'touch', true);
  }catch(e){
    try{ applyInputMode('touch', true); }catch(e2){ /* 极端环境下直接放弃检测 */ }
  }
}