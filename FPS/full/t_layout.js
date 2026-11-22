/* ============================================================
   t_layout.js —— 触屏控件自定义布局（拖动调整）

   【为什么单独开一个文件】
   摇杆的 CSS 在 a_head.html、按钮的 CSS 也在 a_head.html、
   但「让玩家自己拖动摆位」需要同时操作 joyZone / actZone 两个容器，
   还要接管 bindUI 里已经绑好的触摸事件。塞进 f_ui 会把那个已经
   3000 多行的文件搅得更乱，所以独立成块。

   【核心约束：调整完必须静态】
   玩家拖完退出编辑后，控件绝不能飘。做法是：
     1) 编辑模式下把容器从原来的 CSS 位置（left:0/bottom:0、
        right:0/bottom:0）改成 left/top 像素定位，并清掉 bottom/right；
     2) 摇杆底板（#joyBase）也从 CSS 的「left:110px / top:calc(100% - 110px)」
        改成容器内的像素坐标，同时把 transform 里的 translate(-50%,-50%)
        拆出来（margin 补偿），避免和摇杆头的 transform 打架；
     3) 按钮从 CSS Grid 的 grid-column/grid-row 改成绝对定位 left/top；
     4) 退出编辑时把最终值写进 localStorage，下次开局直接 setPos 还原，
        不做任何每帧重算。
   于是退出编辑后控件就是「死」的：只有浏览器 resize 时才按缩比
   统一缩放一次（不缩放的话换设备/转屏就全跑到屏幕外了）。

   【不和摇杆推杆打架】
   f_ui 里的摇杆逻辑在编辑模式下必须完全停用，见 joyLocked()：
   它返回 true 时 startJoy / document 兜底监听一律直接 return。
   ============================================================ */

/* 全部控件 id → 中文名 + 默认位置（像素，屏幕不足时按屏幕尺寸缩比） */
const TLAYOUT_KEY = 'efs.touchlayout.v1';
const TLAYOUT_ITEMS = [
  /* 摇杆容器本身也是可拖的（它比底板大，是触摸余量） */
  { id:'joyZone', name:'摇杆',           def:{ x:  14, y: 578 }, w:210, h:210 },
  { id:'btnFire', name:'开火',           def:{ x: 300, y: 620 }, w:82,  h:82  },
  { id:'btnAim',  name:'开镜',           def:{ x: 300, y: 530 }, w:58,  h:58  },
  { id:'btnInspect', name:'检视',        def:{ x: 366, y: 530 }, w:58,  h:58  },
  { id:'btnInteract', name:'交互 / 开门', def:{ x: 234, y: 530 }, w:58,  h:58  },
  { id:'btnSprint', name:'奔跑',         def:{ x: 234, y: 596 }, w:58,  h:58  },
  { id:'btnJump',   name:'跳跃',         def:{ x: 300, y: 596 }, w:58,  h:58  },
  { id:'btnReload', name:'换弹',         def:{ x: 366, y: 596 }, w:58,  h:58  },
  { id:'btnProne',  name:'趴下',         def:{ x: 366, y: 662 }, w:58,  h:58  }
];
/* 摇杆底板相对摇杆容器的偏移（默认居中，和原 CSS 一致） */
const TLAYOUT_JOYBASE_DEF = { x:105, y:105 };

let tlay = null;              // { joyBase:{x,y}, items:{ id:{x,y} } } 单位 px @ 设计基准
let tlayEditing = false;
let tlayPicked = null;
let tlayDrag = null;

/* 设计基准：按 390x844（常见竖屏手机）的可用区域推出来的默认摆位。
   屏幕比它小时整体等比缩放，保证首次进去不会跑到屏外。 */
function tlayScale(){
  const w = window.innerWidth  || 390;
  const h = window.innerHeight || 844;
  return Math.max(0.58, Math.min(2.0, Math.min(w/390, h/844)));
}
function tlayDefaults(){
  const s = tlayScale();
  const W = window.innerWidth  || 390;
  const H = window.innerHeight || 844;
  const u = 58 * s;                       /* 单键基准边长 */
  const big = u * 1.42;                   /* 开火键 */
  const gap = 8 * s;                      /* 键间距 */
  const R = W - 14*s;                     /* 右边缘留白 */
  const B = H - 14*s;                     /* 底边缘留白 */

  /* 三列 × 三行方阵，和原来的 Grid 布局完全一致：
       [交互] [开镜] [检视]
       [奔跑] [跳跃] [换弹]
       [    ] [趴下] [开火]
     但这里用「右边缘反推」而不是「设计基准 × 缩比」——
     后者在 360px 宽的窄屏上会把最右一列推出屏幕。
     反推的计算方式保证：不管屏幕多宽，最右一列永远贴右边缘。 */
  const c3 = R - u;                       /* 第三列 x */
  const c2 = c3 - (u + gap);              /* 第二列 x */
  const c1 = c2 - (u + gap);              /* 第一列 x */
  const rBig = B - big;                   /* 开火键（比格子大，单独对齐底边） */
  const r3 = rBig - gap - u;              /* 第三行（趴下/换弹） */
  const r2 = r3 - (u + gap);              /* 第二行 */
  const r1 = r2 - (u + gap);              /* 第一行 */

  const P = {};
  P.btnInteract = { x:c1, y:r1 };
  P.btnAim      = { x:c2, y:r1 };
  P.btnInspect  = { x:c3, y:r1 };
  P.btnSprint   = { x:c1, y:r2 };
  P.btnJump     = { x:c2, y:r2 };
  P.btnReload   = { x:c3, y:r2 };
  P.btnProne    = { x:c2, y:r3 };
  /* 开火键右边缘对齐 R，底边对齐 B */
  P.btnFire     = { x:R - big, y:B - big };
  /* 摇杆：贴左下角，边长 210*s（含触摸余量） */
  const jw = 210 * s;
  P.joyZone     = { x:14*s, y:B - jw };

  const o = { joyBase:{ x:jw/2, y:jw/2 }, items:{} };   /* 底盘居中于摇杆容器 */
  for(const it of TLAYOUT_ITEMS){
    const q = P[it.id];
    if(!q) continue;
    o.items[it.id] = { x:Math.round(Math.max(0, Math.min(W - u, q.x))),
                       y:Math.round(Math.max(0, Math.min(H - u, q.y))) };
  }
  /* 摇杆单独夹一次（它比单键大得多） */
  if(o.items.joyZone){
    o.items.joyZone.x = Math.round(Math.max(0, Math.min(W - jw, P.joyZone.x)));
    o.items.joyZone.y = Math.round(Math.max(0, Math.min(H - jw, P.joyZone.y)));
  }
  return o;
}
function tlayLoad(){
  if(tlay) return tlay;
  let raw = null;
  try{ raw = localStorage.getItem(TLAYOUT_KEY); }catch(e){}
  if(raw){
    try{
      const o = JSON.parse(raw);
      if(o && o.items && o.joyBase){
        tlay = o;
        /* 缺项补齐（以后加新按钮时不会整块回退默认） */
        const d = tlayDefaults();
        for(const k in d.items) if(!tlay.items[k]) tlay.items[k] = d.items[k];
        if(!tlay.joyBase) tlay.joyBase = d.joyBase;
        return tlay;
      }
    }catch(e){}
  }
  tlay = tlayDefaults();
  return tlay;
}
function tlaySave(){
  try{ localStorage.setItem(TLAYOUT_KEY, JSON.stringify(tlayLoad())); }catch(e){}
}
function tlayReset(){
  tlay = tlayDefaults();
  tlaySave();
  tlayApply();
}

/* 把一个元素在屏幕坐标系里钉死：
   清掉 bottom/right，写 left/top —— 这是「静态」的关键，
   只要 bottom 还在，resize 时浏览器会自己重算一次位置，控件就会移形。 */
function tlayPin(el, x, y){
  if(!el) return;
  el.style.position = 'fixed';
  el.style.left = Math.round(x) + 'px';
  el.style.top  = Math.round(y) + 'px';
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.margin = '0';
}

/* 摇杆区的图形裁剪（见 tlayApply 里的注释）。
   编辑态直接取消，让 210x210 的方块整块可拖。 */
function tlayClipJoy(el){
  if(!el) return;
  if(tlayEditing){
    el.style.clipPath = '';
    el.style.webkitClipPath = '';
    return;
  }
  const o = tlayLoad();
  const s = tlayScale();
  const cx = Math.round(o.joyBase.x), cy = Math.round(o.joyBase.y);
  const r  = Math.round(76 * s);
  const v  = 'circle(' + r + 'px at ' + cx + 'px ' + cy + 'px)';
  /* 老 WebView 只认 -webkit- 前缀；两个都写，不认的会自动忽略 */
  el.style.clipPath = v;
  try{ el.style.webkitClipPath = v; }catch(e){}
}
/* 摇杆底板：从「left:110px / top:calc(100%-110px) + translate(-50%,-50%)」
   改成「容器内绝对坐标 + margin 自居中」。
   之所以用 margin 而不用 transform，是因为 #joyStick 要靠
   transform 做推杆位移，底板如果也用 transform 会互相覆盖。 */
function tlayPinJoyBase(){
  const base = document.getElementById('joyBase');
  const zone = document.getElementById('joyZone');
  if(!base || !zone) return;
  const o = tlayLoad();
  const s = tlayScale();
  const bw = Math.round(110*s), bh = Math.round(110*s);
  base.style.width  = bw + 'px';
  base.style.height = bh + 'px';
  base.style.left = Math.round(o.joyBase.x) + 'px';
  base.style.top  = Math.round(o.joyBase.y) + 'px';
  base.style.transform = 'none';
  base.style.marginLeft = (-bw/2) + 'px';
  base.style.marginTop  = (-bh/2) + 'px';
  base.style.display = 'block';
  /* 摇杆头保持自动居中（left/top 50% + translate(-50%,-50%)） */
  const stick = document.getElementById('joyStick');
  if(stick){
    const sw = Math.round(54*s);
    stick.style.width = sw + 'px';
    stick.style.height = sw + 'px';
    stick.style.left = '50%';
    stick.style.top  = '50%';
    if(!stick.style.transform) stick.style.transform = 'translate(-50%,-50%)';
  }
}

/* 把当前布局套到 DOM 上（幂等，随时可重复调用） */
function tlayApply(){
  const o = tlayLoad();
  const s = tlayScale();
  /* 1) 摇杆容器 */
  const jz = document.getElementById('joyZone');
  if(jz && o.items.joyZone){
    const w = Math.round(210*s);
    jz.style.width = w + 'px';
    jz.style.height = w + 'px';
    tlayPin(jz, o.items.joyZone.x, o.items.joyZone.y);
    tlayPinJoyBase();
  }
  /* 2) 八个操作键 */
  for(const it of TLAYOUT_ITEMS){
    if(it.id === 'joyZone') continue;
    const el = document.getElementById(it.id);
    const p = o.items[it.id];
    if(!el || !p) continue;
    /* 开火键比其他键大 1.42 倍，和原 CSS 保持一致 */
    const u = Math.round(58*s) * (it.id === 'btnFire' ? 1.42 : 1);
    el.style.width  = Math.round(u) + 'px';
    el.style.height = Math.round(u) + 'px';
    el.style.gridColumn = 'auto';
    el.style.gridRow = 'auto';
    tlayPin(el, p.x, p.y);
  }
  /* 【摇杆区的命中范围要剪成圆】
     #joyZone 本体是 210x210 的透明方块（含触摸余量），它的右上角会和
     「奔跑」键叠 ~38x54。方块形状下，两个键在同一块区域竞争：
       - 摇杆在上面 → 奔跑键那片区域永远点不动；
       - 按钮在上面 → 按摇杆偏右上会误触奔跑。
     两种都不行。所以用 clip-path 把命中区剪成「底盘外扩一圈」的圆：
     圆半径 76*s（底盘半径 55*s + 21px 容差），以底板圆心为中心。
     实测 390x844 下奔跑键离圆心最近角距离 84px > 76px，正好错开。
     clip-path 会同时裁剪绘制与命中测试，所以这既是视觉也是交互边界。
     编辑态下不裁剪（否则方块形状没法拖），恢复时再贴。 */
  if(jz) tlayClipJoy(jz);
  /* 3) 容器必须只在编辑模式下才吃掉整层事件，平时不能挡视角 */
  const az = document.getElementById('actZone');
  if(az){
    az.style.position = 'fixed';
    az.style.left = '0'; az.style.top = '0';
    az.style.right = 'auto'; az.style.bottom = 'auto';
    az.style.width = '100%'; az.style.height = '100%';
    az.style.pointerEvents = 'none';   /* 子按钮各自是 auto */
    az.style.zIndex = '35';
  }
}

/* 编辑模式下把所有控件改成 document.body 的子节点？
   不需要 —— 它们本来就是 fixed 定位，父容器也不再限制它们。
   但 #actGrid 的 grid 布局必须停掉，否则左值会被 grid 覆盖。 */
function tlayKillGrid(){
  const g = document.getElementById('actGrid');
  if(g){
    g.style.display = 'block';
    g.style.position = 'static';
    g.style.gap = '0';
  }
}

/* ---------- 编辑模式 ---------- */
/* 【编辑态进来时记下菜单/暂停原本的样子，退出时原样还回去】
   这两个值必须是模块级，因为 tlaySetEditing 是成对调用的。 */
let tlayMenuPrev = null, tlayPauseWasOn = false, tlayPauseAdded = false;
function tlaySetEditing(on){
  tlayEditing = !!on;
  tlayKillGrid();
  const wrap = document.getElementById('tlEdit');
  if(on){
    /* 必须先让摇杆区可见，否则拖不到 */
    const jz = document.getElementById('joyZone'); if(jz) jz.style.display = 'block';
    const az = document.getElementById('actZone'); if(az) az.style.display = 'block';
    document.body.classList.add('tl-editing');
    if(wrap) wrap.style.display = 'block';
    tlayApply();
    try{ tlayClipJoy(document.getElementById('joyZone')); }catch(e){}
    tlayDrawMarks();
    /* 【局内：先暂停，但立刻把暂停面板藏起来】
       暂停面板 #pause 是 z-index:60 的全屏遮罩，比摇杆(34)/按键(35) 都高。
       不藏的话，进编辑后玩家看到的是一张「已暂停」卡片压在控件上，
       根本看不清摇杆和按键在哪、拖动时也像是点在卡片上。
       这里用 hidePauseOverlay(true) —— 保留 paused=true，
       只把 DOM 藏掉，等退出编辑再 resumeGame()。 */
    /* 【弄清「暂停是我开的还是本来就有的」】
       两种情况退场处理完全不同：
         A. 局内直接暂停 → 设置 → 触屏 → 编辑：本来就 paused，
            退出编辑应该**回到暂停界面**，不能把人直接扔回对局（会挨打）。
         B. 局内照常玩着 → 暂停 → 设置 → 触屏 → 编辑：pauseGame 返回 true，
            这个暂停是我开的，退出时必须 resumeGame，否则人卡住。（这是真 bug）
       所以用 pauseGame() 的返回值区分，而不是看 window.__paused。 */
    tlayPauseAdded = false;
    try{ if(typeof pauseGame === 'function') tlayPauseAdded = !!pauseGame('touchlayout'); }catch(e){}
    tlayPauseWasOn = !!(window.__paused);
    try{ if(tlayPauseWasOn && typeof hidePauseOverlay === 'function') hidePauseOverlay(true); }catch(e){}
    /* 【非局内：主菜单 #menu 是 z-index:100，同样会盖住控件】
       从设置里点「进入拖动编辑」时多半还没开局，菜单一直挂着，
       于是编辑层被菜单挡得干干净净。这里临时把菜单收起来，退出时还原。 */
    const menu = document.getElementById('menu');
    if(menu && !tlayMenuPrev){
      const cs = window.getComputedStyle ? window.getComputedStyle(menu) : null;
      const vis = cs ? (cs.display !== 'none') : (menu.style.display !== 'none');
      if(vis){ tlayMenuPrev = menu.style.display || ''; menu.style.display = 'none'; }
    }
  } else {
    document.body.classList.remove('tl-editing');
    if(wrap) wrap.style.display = 'none';
    tlayPicked = null;
    tlayHideMarks();
    tlaySave();
    tlayApply();
    try{ tlayClipJoy(document.getElementById('joyZone')); }catch(e){}
    /* 【退出编辑必须把局面还回去】
       进编辑时调了 pauseGame，之前漏了对应 resumeGame，
       于是玩家拖完点「完成」，人还卡在 paused 状态，
       只是暂停面板被藏了 —— 看起来就是「画面不动、按钮全没反应」，
       必须再点一次暂停才能动。这是真 bug，现在补上。
       但只把自己开的暂停收回去；本来就处于暂停的，要把暂停卡片还回来。 */
    if(tlayPauseAdded){
      try{ if(typeof resumeGame === 'function') resumeGame(); }catch(e){}
    } else if(tlayPauseWasOn){
      try{
        const pz = document.getElementById('pause');
        if(pz){ if(typeof renderPauseOverlay==='function') renderPauseOverlay(); pz.style.display='flex'; }
        window.__pauseHiddenForPanel = false;
      }catch(e){}
    }
    tlayPauseWasOn = false; tlayPauseAdded = false;
    /* 不在局内（从主菜单进编辑的）：退出后把触屏控件收起来，
       否则八个按钮会一直挂在菜单底下（看不见，但会抢触摸）。 */
    if(!window.__inGame){
      try{ if(typeof hideTouchUI === 'function') hideTouchUI(); }catch(e){}
    }
    if(tlayMenuPrev !== null){
      const menu = document.getElementById('menu');
      if(menu) menu.style.display = tlayMenuPrev;
      tlayMenuPrev = null;
    }
  }
  window.__tlEditing = tlayEditing;
  try{ if(typeof sfxUI === 'function') sfxUI(); }catch(e){}
}

/* 编辑态的可视提示：虚线框靠 CSS（body.tl-editing），
   这里只负责「选中项高亮」那圈的绘制。 */
function tlayDrawMarks(){
  const box = document.getElementById('tlMarks');
  if(!box) return;
  const o = tlayLoad();
  let h = '';
  const s = tlayScale();
  for(const it of TLAYOUT_ITEMS){
    const p = o.items[it.id]; if(!p) continue;
    const w = it.id === 'joyZone' ? 210*s : (58*s) * (it.id === 'btnFire' ? 1.42 : 1);
    h += '<div class="tlmk' + (tlayPicked === it.id ? ' sel' : '') + '" style="left:' +
         Math.round(p.x) + 'px;top:' + Math.round(p.y) + 'px;width:' + Math.round(w) +
         'px;height:' + Math.round(w) + 'px"></div>';
  }
  box.innerHTML = h;
}
function tlayHideMarks(){
  const box = document.getElementById('tlMarks');
  if(box) box.innerHTML = '';
}

/* 屏幕坐标 → 素材坐标（摇杆容器和按钮的 x/y 都指「左上角」） */
function tlayProcMove(id, cx, cy){
  const o = tlayLoad();
  const s = tlayScale();
  const it = TLAYOUT_ITEMS.find(v => v.id === id);
  if(!it) return;
  const w = it.id === 'joyZone' ? 210*s : (58*s) * (it.id === 'btnFire' ? 1.42 : 1);
  /* 拖的是中心 → 换算成左上角，并夹在屏幕内（留 2px 容差） */
  let x = cx - w/2;
  let y = cy - w/2;
  x = Math.max(0, Math.min(window.innerWidth  - w, x));
  y = Math.max(0, Math.min(window.innerHeight - w, y));
  o.items[id] = { x: Math.round(x), y: Math.round(y) };
  /* 摇杆容器移动后底板跟着走（底板坐标是容器内相对值，不用改） */
  tlayApply();
  tlayDrawMarks();
}

/* 绑定拖动事件。只绑一次（幂等），用事件委托挂在 document 上。
   编辑态下这些处理函数先跑，并且 stopPropagation，
   所以 f_ui 里「左半屏拖动 = 摇杆」「右半屏拖动 = 转视角」一律收不到事件。 */
function tlayBind(){
  if(window.__tlBound) return;
  window.__tlBound = true;
  const inside = (cx, cy, el) => {
    if(!el) return false;
    const r = el.getBoundingClientRect();
    return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
  };
  document.addEventListener('touchstart', e => {
    if(!tlayEditing) return;
    for(const t of e.changedTouches){
      /* 【命中顺序：按钮优先，摇杆最后】
         摇杆区是一块 210x210 的透明方域，它的右上角会和
         「奔跑」键、底部武器条叠在一起。如果先把摇杆当命中目标，
         叠住的那半个按钮就永远拖不动（玩家会说「这个键抓不住」）。
         所以从小到大判：先看按钮（开火键最大，放最前），
         所有按钮都不命中时才当成拖摇杆。 */
      let hit = null;
      const order = ['btnFire','btnAim','btnInspect','btnInteract',
                     'btnSprint','btnJump','btnReload','btnProne','joyZone'];
      for(const id of order){
        if(inside(t.clientX, t.clientY, document.getElementById(id))){ hit = id; break; }
      }
      if(!hit) continue;
      tlayPicked = hit;
      tlayDrag = { id:hit, tid:t.identifier };
      tlayDrawMarks();
      tlayShowPickedName(hit);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }, {passive:false, capture:true});

  document.addEventListener('touchmove', e => {
    if(!tlayEditing || !tlayDrag) return;
    for(const t of e.changedTouches){
      if(t.identifier !== tlayDrag.tid) continue;
      tlayProcMove(tlayDrag.id, t.clientX, t.clientY);
      e.preventDefault();
      e.stopPropagation();
      return;
    }
  }, {passive:false, capture:true});

  const up = e => {
    if(!tlayEditing || !tlayDrag) return;
    for(const t of e.changedTouches){
      if(t.identifier !== tlayDrag.tid) continue;
      tlayDrag = null;
      tlaySave();
      e.stopPropagation();
      return;
    }
  };
  document.addEventListener('touchend', up, {capture:true});
  document.addEventListener('touchcancel', up, {capture:true});

  /* 桌面调试：鼠标也能拖 */
  document.addEventListener('mousedown', e => {
    if(!tlayEditing) return;
    const order = ['btnFire','btnAim','btnInspect','btnInteract',
                   'btnSprint','btnJump','btnReload','btnProne','joyZone'];
    for(const id of order){
      const el = document.getElementById(id);
      if(inside(e.clientX, e.clientY, el)){
        tlayPicked = id; tlayDrag = { id:id, tid:'mouse' };
        tlayDrawMarks(); tlayShowPickedName(id);
        e.preventDefault(); e.stopPropagation();
        return;
      }
    }
  }, {capture:true});
  document.addEventListener('mousemove', e => {
    if(!tlayEditing || !tlayDrag || tlayDrag.tid !== 'mouse') return;
    tlayProcMove(tlayDrag.id, e.clientX, e.clientY);
    e.preventDefault(); e.stopPropagation();
  }, {capture:true});
  document.addEventListener('mouseup', e => {
    if(!tlayEditing || !tlayDrag || tlayDrag.tid !== 'mouse') return;
    tlayDrag = null; tlaySave();
  }, {capture:true});

  /* 转屏 / 窗口变化：控件位置是写死的像素，不缩放就跑出屏外。
     这里只做「统一按新缩比重新贴一次」，不改玩家存的坐标，
     所以不会出现「拖好的位置被重算漂移」那种事。 */
  window.addEventListener('resize', () => { if(!tlayEditing) tlayOnResize(); });
}

function tlayShowPickedName(id){
  const el = document.getElementById('tlName');
  if(!el) return;
  const it = TLAYOUT_ITEMS.find(v => v.id === id);
  el.textContent = it ? ('正在调整：' + it.name) : '';
}

/* ---------- 给 f_ui 用的锁定判断 ---------- */
function tlayVisible(el){
  if(!el) return false;
  /* 【不能只看 style.display】内联 style 为空时是 ''，
     而「隐藏」也可能是 CSS 里写的 display:none。
     两者用内联属性都判不准，必须取计算样式。
     实测踩坑：pause 面板从没被写过内联 display，
     旧代码 `!=='none' && !==''` 于是恒为 true，
     导致**整个游戏里摇杆全都不响应**。 */
  try{
    const cs = window.getComputedStyle ? window.getComputedStyle(el) : null;
    if(cs){
      if(cs.display === 'none' || cs.visibility === 'hidden') return false;
      return true;
    }
  }catch(e){}
  /* 拿不到计算样式（极老的 WebView）就退回内联判断 */
  const d = el.style ? el.style.display : '';
  return !(d === 'none' || d === '');
}
function joyLocked(){
  if(tlayEditing) return true;
  /* 主菜单、设置面板、暂停浮层、商店/仓库/背包这类全屏浮层打开时，
     手指落在屏幕上不应该变成「推摇杆往前走」。 */
  if(tlayVisible(document.getElementById('menu')))     return true;
  if(tlayVisible(document.getElementById('settings'))) return true;
  if(tlayVisible(document.getElementById('pause')))    return true;
  try{
    if(tlayVisible(document.getElementById('shop')))   return true;
    if(tlayVisible(document.getElementById('stash')))  return true;
    if(tlayVisible(document.getElementById('bag')))    return true;
    if(tlayVisible(document.getElementById('gunsmith'))) return true;
    if(tlayVisible(document.getElementById('benchPanel'))) return true;
  }catch(e){}
  return false;
}

/* ---------- 设置面板的「触屏布局」页 ---------- */
function tlayTabHtml(){
  let h = '<div class="d" style="margin:10px 0 6px">'
    + '拖动屏幕上的摇杆和按键，摆到自己顺手的为止。退出编辑后位置固定不动。'
    + '</div>';
  h += '<div class="row" style="gap:8px;flex-wrap:wrap">'
    +  '<button class="btn small" id="tlStart">进入拖动编辑</button>'
    +  '<button class="btn ghost small" id="tlReset">恢复默认布局</button>'
    + '</div>';
  /* 【键位导出/导入】单独一套，不跟存档混在一起：
     存档里有加密（crypto.subtle + 内置密钥），键位是纯明文 JSON，
     方便直接看、直接改、发给同学。
     也不用 saveDownload —— 那个函数在 e_io.js，这里是纯布局层，
     自己写一份免得耦合。 */
  h += '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:8px">'
    +  '<button class="btn ghost small" id="tlExport">导出键位</button>'
    +  '<button class="btn ghost small" id="tlImport">导入键位</button>'
    +  '<button class="btn ghost small" id="tlPick">选文件导入</button>'
    + '</div>';
  /* 文件选择：手机上贴一长串 JSON 很痛苦，能直接挑文件最省事。
     不用存档那个 #saveFile —— 那是加密存档专用的，这里是独立一套。 */
  h += '<input type="file" id="tlFile" accept="application/json,.json,.txt" style="display:none">';
  h += '<textarea id="tlIoBox" class="setlog" style="display:none;margin-top:8px;width:100%;height:110px;box-sizing:border-box;font-family:monospace;font-size:11px"></textarea>';
  h += '<div class="d" style="margin-top:6px" id="tlIoHint"></div>';
  h += '<div class="d" style="margin:12px 0 6px">当前各控件位置（像素）</div>';
  const o = tlayLoad();
  for(const it of TLAYOUT_ITEMS){
    const p = o.items[it.id] || { x:0, y:0 };
    h += '<div class="setrow" style="cursor:default">'
      + '<div class="setinfo"><div class="setn">' + it.name + '</div></div>'
      + '<div class="setval" style="font-size:12px">' + Math.round(p.x) + ', ' + Math.round(p.y) + '</div>'
      + '</div>';
  }
  h += '<div class="setrow" style="cursor:default">'
    + '<div class="setinfo"><div class="setn">摇杆底盘</div></div>'
    + '<div class="setval" style="font-size:12px">'
    + Math.round(o.joyBase.x) + ', ' + Math.round(o.joyBase.y) + '</div></div>';
  return h;
}
/* 设置面板点了「进入拖动编辑」：先关设置，再进编辑态 */
function tlayEnterFromSettings(){
  try{ if(typeof closeSettings === 'function') closeSettings(); }catch(e){}
  /* 编辑时需要一个「对局画面」当背景，否则玩家只能在菜单上拖，看不到实际位置。
     如果当前不在局内，就先开一局训练（不扣东西，退出不结算）。 */
  if(!window.__inGame){
    try{
      if(typeof showTouchUI === 'function') showTouchUI();
    }catch(e){}
  }
  tlaySetEditing(true);
}

/* ---------- 编辑浮层上的两个按钮 ----------
   这两个按钮不能挂 onclick： #tlEdit 是 pointer-events:none 的容器，
   只有 #tlTop 是 auto，所以按钮本身能收到事件；
   但触摸时浏览器会先把事件派发到 document（我们的拖动监听），
   如果拖动监听把事件 preventDefault 了，click 就不会触发。
   实测中直接绑 touchstart 最稳，并在里面 stopPropagation，
   让拖动监听拿不到它（否则会把它当成「拖了一片空白」）。 */
function tlayBindPanel(){
  const done = document.getElementById('tlDoneBtn');
  const rst  = document.getElementById('tlResetBtn');
  const stop = e => { if(e && e.stopPropagation) e.stopPropagation(); };
  if(done && !done.__b){
    done.__b = true;
    const f = e => { stop(e); if(e && e.preventDefault) e.preventDefault(); tlaySave(); tlaySetEditing(false); };
    done.addEventListener('touchstart', f, {passive:false});
    done.addEventListener('click', f);
  }
  if(rst && !rst.__b){
    rst.__b = true;
    const f = e => { stop(e); if(e && e.preventDefault) e.preventDefault();
      tlayReset(); tlayDrawMarks(); tlayShowPickedName('');
      try{ toast('已恢复默认布局'); }catch(err){} };
    rst.addEventListener('touchstart', f, {passive:false});
    rst.addEventListener('click', f);
  }
}

/* 模块载入后：绑拖动 + 绑浮层按钮 + 首次应用布局。
   包 setTimeout 是为了等 DOM 都建好（a_head 里的控件在 script 之前，
   其实已经存在，但 f_ui 的 bindUI 会改 pointer-events，
   所以延迟一帧再套一遍最保险）。 */
try{
  tlayBind();
  tlayBindPanel();
  setTimeout(function(){
    try{ tlayBindPanel(); tlayApply(); }catch(e){}
  }, 0);
}catch(e){ console.error('t_layout init', e); }

/* ---------- 尺寸变化后的重算 ----------
   【为什么不能简单 tlayApply()】
   tlayApply 是把存的像素原样写到 style 上，屏幕一变窄，
   存在右边的键就跑到屏幕外了。所以尺寸变化时要先用
   tlayDefaults() 按新尺寸生成基准方阵，再按「玩家相对方阵的偏移」
   把玩家自定义的位置缩放过去。

   但这里有个取舍：如果玩家只是轻微旋转了一下设备，
   做比例缩放会让他精心调好的位置变形。所以只在
   「尺寸变化超过 8%」时才整体重排；小幅抖动只做边界夹取。 */
let tlayLastW = 0, tlayLastH = 0;
function tlayOnResize(){
  const W = window.innerWidth || 390;
  const H = window.innerHeight || 844;
  if(tlayLastW && tlayLastH){
    const rw = Math.abs(W - tlayLastW) / tlayLastW;
    const rh = Math.abs(H - tlayLastH) / tlayLastH;
    if(rw > 0.08 || rh > 0.08){
      /* 大变化：按新尺寸重建基准方阵，保留玩家的相对偏移（相对左上角并按比例缩放） */
      const o = tlayLoad();
      const oldW = tlayLastW, oldH = tlayLastH;
      const nd = tlayDefaults();
      for(const it of TLAYOUT_ITEMS){
        const p = o.items[it.id];
        const q = nd.items[it.id];
        if(!p || !q) continue;
        /* 偏移量 = 玩家位置 - 旧基准。没有旧基准就当作 0。 */
        const bx = Math.round(p.x * (W / oldW));
        const by = Math.round(p.y * (H / oldH));
        o.items[it.id] = { x:bx, y:by };
      }
      /* 摇杆底盘也跟着容器的比例改 */
      o.joyBase = nd.joyBase;
      /* 再夹一次，防止缩放后溢出去 */
      const s = tlayScale();
      for(const it of TLAYOUT_ITEMS){
        const p = o.items[it.id]; if(!p) continue;
        const w = (it.id === 'joyZone' ? 210 : 58*(it.id==='btnFire'?1.42:1)) * s;
        p.x = Math.max(0, Math.min(W - w, p.x));
        p.y = Math.max(0, Math.min(H - w, p.y));
        p.x = Math.round(p.x); p.y = Math.round(p.y);
      }
      tlaySave();
    }
  }
  tlayLastW = W; tlayLastH = H;
  tlayApply();
}
/* 首次记录基准尺寸 */
try{ tlayLastW = window.innerWidth||390; tlayLastH = window.innerHeight||844; }catch(e){}

/* ============================================================
   键位导出 / 导入（纯明文，不加密，独立于存档）

   【为什么要单独一套】
   存档导出走 e_io.js 的 exportSave()，它用内置密钥做了 AES-GCM 加密。
   键位这种东西没必要加密 —— 它的价值就是「发给别人 / 备份一下」，
   加密反而让人打不开、改不了、出问题也查不了。
   所以这里自己写一份明白的 JSON，不碰 crypto，不碰存档格式。

   【格式】版本号写在外面，以后加字段能识别旧文件：
   { "kind": "efs-touchlayout", "v": 1, "screen": "390x844",
     "joyBase": {x,y}, "items": { btnFire:{x,y}, ... } }

   【导入要宽容】玩家可能拿到的文件：
     1) 本游戏导出的（带 kind）；
     2) 手改过的（缺字段 / 多字段 / 坐标是数字字符串）；
     3) 直接把旧版 localStorage 的字符串复制过来的（没有 kind）；
   三种都得能吃，缺的补默认、多的忽略、坐标做数字校验并夹进屏幕。
   宁可导入一个能用的近似布局，也不要弹一句「格式错误」白点一次。
   ============================================================ */
/* 选文件导入：手机上从聊天/下载目录挑一个 json 最省事。
   读取用 FileReader，不用 file.text()（老 WebView 没有）。 */
function tlayPickFile(){
  const f = document.getElementById('tlFile');
  if(!f){ tlayIoHint('文件选择器未找到', true); return; }
  /* 每次都要清 value，否则选同一个文件第二次不触发 change */
  try{ f.value = ''; }catch(e){}
  try{ f.click(); }catch(e){ tlayIoHint('这个浏览器不支持选文件，请手动粘贴', true); }
}
function tlayBindFile(){
  const f = document.getElementById('tlFile');
  if(!f || f.__b) return;
  f.__b = true;
  f.addEventListener('change', () => {
    const file = f.files && f.files[0];
    if(!file) return;
    if(typeof FileReader !== 'function'){
      tlayIoHint('这个浏览器读不了文件，请手动粘贴内容', true); return;
    }
    tlayIoHint('正在读取 ' + (file.name || '文件') + ' …');
    const rd = new FileReader();
    rd.onload = () => {
      const box = tlayIoBox();
      if(box) box.value = String(rd.result || '');
      tlayImport();
    };
    rd.onerror = () => tlayIoHint('读取失败：' + (rd.error && rd.error.message || '未知错误'), true);
    try{ rd.readAsText(file, 'utf-8'); }catch(e){ tlayIoHint('读取失败：' + e.message, true); }
  });
}
const TLAYOUT_FILE_KIND = 'efs-touchlayout';

function tlayExportText(){
  const o = tlayLoad();
  const out = {
    kind: TLAYOUT_FILE_KIND,
    v: 1,
    /* 记录导出时的屏幕尺寸，导入时用得上：不同尺寸的设备
       坐标要按比例换算，否则在大屏上拖开的键装到小屏上会跑出去 */
    screen: (window.innerWidth||390) + 'x' + (window.innerHeight||844),
    exportedAt: new Date().toISOString(),
    joyBase: { x: Math.round(o.joyBase.x), y: Math.round(o.joyBase.y) },
    items: {}
  };
  for(const it of TLAYOUT_ITEMS){
    const p = o.items[it.id];
    if(!p) continue;
    out.items[it.id] = { x: Math.round(p.x), y: Math.round(p.y) };
  }
  return JSON.stringify(out, null, 2);
}

/* 下载：和 e_io.js 的 saveDownload 同原理，但独立实现。
   返回 false 表示这个浏览器不给下载，调用方改成「显示文本框手动复制」。 */
function tlayDownload(filename, text){
  try{
    const blob = new Blob([text], {type:'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{
      try{ document.body.removeChild(a); }catch(e){}
      try{ URL.revokeObjectURL(url); }catch(e){}
    }, 400);
    return true;
  }catch(e){ return false; }
}

function tlayIoHint(msg, bad){
  const el = document.getElementById('tlIoHint');
  if(!el) return;
  el.textContent = msg || '';
  el.style.color = bad ? '#ff8a6a' : '#7ee8a0';
}
function tlayIoBox(){
  const el = document.getElementById('tlIoBox');
  if(!el) return null;
  el.style.display = 'block';
  return el;
}

/* 导出按钮：优先下载文件；下载不了就把内容放进文本框让玩家自己复制 */
function tlayExport(){
  let text;
  try{ text = tlayExportText(); }
  catch(e){ tlayIoHint('导出失败：' + e.message, true); return; }
  const fn = 'efs-keymap-' + Date.now() + '.json';
  if(tlayDownload(fn, text)){
    tlayIoHint('已导出 ' + fn + '（明文 JSON，可直接改）');
    try{ if(typeof sfxUI==='function') sfxUI(); }catch(e){}
  }else{
    /* 老 WebView 不给下载：把内容摊在文本框里 */
    const box = tlayIoBox();
    if(box){
      box.value = text;
      box.readOnly = false;
      try{ box.select(); }catch(e){}
      tlayIoHint('这个浏览器不支持直接下载，内容已放在上面的框里，长按全选复制', true);
    }else{
      tlayIoHint('导出失败：浏览器不支持文件下载', true);
    }
  }
}

/* 把任意一种输入（导出的 JSON / 手改的 / 旧 localStorage 串）
   解析成标准布局。失败抛错，由调用方提示。 */
function tlayParseImport(raw){
  let obj;
  if(raw && typeof raw === 'object') obj = raw;
  else{
    const t = String(raw || '').trim();
    if(!t) throw new Error('内容为空');
    try{ obj = JSON.parse(t); }
    catch(e){ throw new Error('不是合法的 JSON'); }
  }
  if(!obj || typeof obj !== 'object') throw new Error('内容不是对象');
  /* 认一下是不是别人的东西（存档 / 2D 的档）
     不是必须，但报错能说得更清楚 */
  if(obj.kind && obj.kind !== TLAYOUT_FILE_KIND){
    throw new Error('这不是键位文件（kind=' + obj.kind + '）');
  }
  const srcItems = obj.items || obj;
  const def = tlayDefaults();
  const s = tlayScale();
  const W = window.innerWidth || 390;
  const H = window.innerHeight || 844;

  /* 跨尺寸换算：导出设备和自己不一样大时，按比例缩放坐标。
     只在导出的 screen 字段存在且能解析时做；否则当作同尺寸。 */
  let kx = 1, ky = 1;
  if(typeof obj.screen === 'string'){
    const m = obj.screen.match(/^(\d+)\s*[x*]\s*(\d+)$/i);
    if(m){
      const sw = parseInt(m[1], 10), sh = parseInt(m[2], 10);
      if(sw > 0 && sh > 0){
        kx = W / sw; ky = H / sh;
        /* 缩放别做太猛：限制在 0.5~2 倍，否则极端的屏幕差会把键堆到一角 */
        kx = Math.max(0.5, Math.min(2, kx));
        ky = Math.max(0.5, Math.min(2, ky));
      }
    }
  }

  const num = (v, d) => {
    const n = (typeof v === 'number') ? v : parseFloat(v);
    return isFinite(n) ? n : d;
  };

  const out = { joyBase:{ x:def.joyBase.x, y:def.joyBase.y }, items:{} };
  let got = 0;      /* 真正解析成功的控件数 */
  let seen = 0, bad = 0;   /* 文件里出现过的控件数 / 其中坐标坏掉的数 */
  for(const it of TLAYOUT_ITEMS){
    const p = srcItems ? srcItems[it.id] : null;
    if(p && (typeof p === 'object')){
      seen++;
      const w = (it.id === 'joyZone' ? 210 : 58*(it.id==='btnFire'?1.42:1)) * s;
      let x = num(p.x, NaN) * kx;
      let y = num(p.y, NaN) * ky;
      if(!isFinite(x) || !isFinite(y)){
        /* 这一个控件的坐标坏了：只跳它，用默认值，不整个导入失败。
           注意也要计入 seen —— 文件里确实有这个键，只是值坏了，
           不能因为「文件里只有一个键且它坏了」就报「没找到任何坐标」。 */
        bad++;
        out.items[it.id] = { x: def.items[it.id].x, y: def.items[it.id].y };
        continue;
      }
      x = Math.max(0, Math.min(W - w, x));
      y = Math.max(0, Math.min(H - w, y));
      out.items[it.id] = { x: Math.round(x), y: Math.round(y) };
      got++;
    }else{
      out.items[it.id] = { x: def.items[it.id].x, y: def.items[it.id].y };
    }
  }
  /* 摇杆底盘：也是「容器内相对坐标」，同样做数字校验 */
  if(obj.joyBase && typeof obj.joyBase === 'object'){
    const bw = (window.innerWidth ? 210*s : 210*s);
    const bx = num(obj.joyBase.x, def.joyBase.x) * kx;
    const by = num(obj.joyBase.y, def.joyBase.y) * ky;
    out.joyBase = { x: Math.round(Math.max(0, Math.min(bw, bx))),
                    y: Math.round(Math.max(0, Math.min(bw, by))) };
  }
  /* 【只有「一个键都没见到」才算不是键位文件】
     见到了但坐标全坏的情况不抛错 —— 按「脏值只回退它自己」的总原则，
     照样把默认布局应用上去，并在提示里说清楚有几个坐标读不懂。
     否则玩家手改错一个字符，整个文件就被拒，比不处理还困惑。 */
  if(seen === 0) throw new Error('没有找到任何按键坐标');
  return { layout: out, count: got, bad: bad, scaled: (kx !== 1 || ky !== 1) };
}

/* 导入按钮：先让框可见。框里有内容就立即导入；没有就提示粘贴。 */
function tlayImport(){
  const box = tlayIoBox();
  if(!box){ tlayIoHint('导入框未找到', true); return; }
  const txt = (box.value || '').trim();
  if(!txt){
    /* 【空框时先自己读剪贴板】手机上从聊天窗口复制了 JSON 过来，
       还要长按粘贴进文本框很麻烦。navigator.clipboard.readText() 在
       部分 WebView 里需要用户手势或用权限，失败就不弹错，退回手贴。 */
    const afterRead = (t) => {
      const s2 = (t || '').trim();
      if(!s2){ tlayIoHint('把键位 JSON 粘到上面的框里，或点「选文件」导入')
               ;try{ box.focus(); }catch(e){} return; }
      box.value = s2;
      tlayImport();
    };
    try{
      if(navigator.clipboard && navigator.clipboard.readText){
        navigator.clipboard.readText().then(afterRead).catch(()=>afterRead(''));
        return;
      }
    }catch(e){}
    afterRead('');
    return;
  }
  let res;
  try{ res = tlayParseImport(txt); }
  catch(e){ tlayIoHint('导入失败：' + e.message, true); return; }
  tlay = res.layout;
  tlaySave();
  tlayApply();
  tlayDrawMarks();
  if(box) box.value = '';
  /* 全坏的时候也照样应用（全是默认值），只把语气变告警色。 */
  tlayIoHint(res.count
             ? ('已导入 ' + res.count + ' 个控件位置' +
                (res.bad ? ('，' + res.bad + ' 个坐标损坏已用默认值') : '') +
                (res.scaled ? '（已按屏幕尺寸换算）' : ''))
             : ('没有可用的坐标（' + res.bad + ' 个都读不懂），已恢复默认布局'),
             !res.count);
  try{ if(typeof sfxUI==='function') sfxUI(); }catch(e){}
  /* 导入后重建面板，让上面那串坐标读数跟着刷新 */
  try{
    if(typeof setTab === 'string' && setTab === 'touch' && typeof buildSettings === 'function'){
      setTimeout(buildSettings, 0);
    }
  }catch(e){}
}
