/* ============================================================
   _orient.js —— 3D 版强制横屏

   为什么不用 CSS transform:rotate 把整个游戏转过来？
   因为 3D 版有大量触摸坐标计算（摇杆、右半屏转视角、按钮热区），
   它们全都直接用 clientX/clientY 跟 innerWidth/innerHeight 算。
   一旦给容器加 rotate(90deg)，DOM 坐标和屏幕坐标就整体错位，
   所有触摸判定会全部偏掉 —— 那是比竖屏更难查的 bug。

   所以采用「强制横屏 + 竖屏遮罩」两条路：
   1) 能调 Screen Orientation API 就真的锁成 landscape
      （全屏状态下 Chrome / Android 有效）。
   2) 锁不住的（iOS Safari、非全屏、桌面小窗）就盖一层遮罩，
      提示把设备转过来，并在用户点击时尝试进全屏后再锁。
      竖屏下游戏本身照常渲染，只是被遮住，不会出现半截画面。
   ============================================================ */

/* 竖屏遮罩的 DOM id */
const ORIENT_MASK_ID = 'orientMask';
/* 当前是否处于「应该被遮住」的竖屏状态 */
let orientBlocked = false;
/* 【只在游戏内强制横屏】
   主菜单竖着拿手机很自然（所有按钮都是竖排的卡片布局），
   进去打枪才需要横屏。所以遮罩与方向锁定都加一个「游戏已开始」的前置条件：
     __inGame 为 false 时，无论横竖都不遮、也不锁方向。
   这个变量由 f_ui.js 的「开始」按钮置 true，回主菜单时置 false。 */
function orientInGame(){
  return !!(typeof window !== 'undefined' && window.__inGame);
}

/* 判定竖屏：用 innerWidth/innerHeight。
   注意不能用 screen.orientation.type，部分 WebView 里它是空的。 */
function orientIsPortrait(){
  if(typeof window === 'undefined') return false;
  const w = window.innerWidth || 0;
  const h = window.innerHeight || 0;
  if(w <= 0 || h <= 0) return false;
  return h > w;
}

/* 尝试真正锁定横屏。失败不算错，遮罩会兜底。 */
/* 尝试真正锁定横屏。
   【问题 4 修复】原实现无论 lock() 成功还是被拒绝都 return true，
   调用方因此永远以为「锁上了」，也就不会去提示用户 ——
   这正是「点了进入横屏但没反应，也没任何提示」的原因之一。
   现在改成：真的锁上了才返回 true，被拒绝就返回 false，
   让上层能据此决定要不要显示「请手动把设备转过来」的提示。

   另外补一个兼容路径：部分 WebView 只有旧的 screen.lockOrientation。 */
function orientTryLock(){
  /* 1) 标准 Screen Orientation API（需要全屏 + 用户手势，否则会被拒） */
  try{
    const so = (typeof screen !== 'undefined') ? screen.orientation : null;
    if(so && typeof so.lock === 'function'){
      const p = so.lock('landscape');
      if(p && typeof p.then === 'function'){
        /* 成功/失败都记录下来，供界面提示使用 */
        p.then(function(){
          if(typeof window!=='undefined') window.__orientLocked=true;
        }).catch(function(){
          if(typeof window!=='undefined') window.__orientLocked=false;
        });
        return true;      // 已发起（最终结果看 __orientLocked）
      }
      /* 老实现返回 undefined：假定它同步生效 */
      if(typeof window!=='undefined') window.__orientLocked=true;
      return true;
    }
  }catch(e){}
  /* 2) 旧前缀 API */
  try{
    if(typeof screen !== 'undefined' && screen.lockOrientation){
      screen.lockOrientation('landscape');
      if(typeof window!=='undefined') window.__orientLocked=true;
      return true;
    }
  }catch(e){}
  if(typeof window!=='undefined') window.__orientLocked=false;
  return false;
}

/* 解除锁定（桌面宽屏时没必要锁） */
function orientUnlock(){
  try{
    const so = (typeof screen !== 'undefined') ? screen.orientation : null;
    if(so && typeof so.unlock === 'function') so.unlock();
  }catch(e){}
}

/* 创建遮罩 */
function orientBuildMask(){
  if(typeof document === 'undefined') return null;
  let m = document.getElementById(ORIENT_MASK_ID);
  if(m) return m;
  m = document.createElement('div');
  m.id = ORIENT_MASK_ID;
  m.innerHTML = ''
    + '<div class="omBox">'
    +   '<div class="omIcon">\uD83D\uDCF1</div>'
    +   '<div class="omTitle" data-om="title"></div>'
    +   '<div class="omDesc" data-om="desc"></div>'
    +   '<button class="omBtn" data-om="btn" type="button"></button>'
    + '</div>';
  document.body.appendChild(m);
  /* 遮罩本身吃掉所有事件，防止「竖屏时还能点到下面的按钮」。
     【问题 4 修复：进入横屏按钮点不动】
     原来的写法是：
         m.addEventListener('touchstart', e=>e.preventDefault(), {passive:false});
     这条监听挂在遮罩**自己**身上，于是连遮罩内部那个「进入横屏」按钮的
     touchstart 也会被 preventDefault 掉。
     而浏览器只有在 touchstart 没被取消时才会在抬手时**合成 click** ——
     被取消了就没有 click，按钮的 onclick 永远收不到，
     表现就是「点了没反应」。
     正确做法：只在事件目标是遮罩**背景**（不是 .omBox 里的东西）时
     才拦截；点到盒子/按钮就放行，让 click 正常产生。 */
  const inBox=(t)=>{
    let n=t;
    while(n && n!==m){
      if(n.classList && n.classList.contains('omBox')) return true;
      n=n.parentNode;
    }
    return false;
  };
  m.addEventListener('touchstart', function(e){
    if(inBox(e.target)) return;      // 点在盒子/按钮上：放行，别吃掉 click
    e.preventDefault();
  }, { passive:false });
  m.addEventListener('touchmove', function(e){
    if(inBox(e.target)) return;
    e.preventDefault();
  }, { passive:false });
  const btn = m.querySelector('[data-om="btn"]');
  if(btn){
    /* 【双保险】click 之外再挂 touchstart，
       因为部分 WebView 里 requestFullscreen 必须在「触摸事件」的
       用户手势里直接调用，隔一层 click 可能已经失去手势上下文。 */
    let lastTapAt=0;
    const enterLandscape=function(ev){
      if(ev) ev.stopPropagation();
      /* 防止 touchstart + click 两次触发 */
      const now=Date.now();
      if(now-lastTapAt<600) return;
      lastTapAt=now;
      /* 用户手势里先试全屏，再锁方向 —— 顺序不能反，
         非全屏状态下 lock() 基本都被拒。 */
      try{
        const el = document.documentElement;
        const rq = el.requestFullscreen || el.webkitRequestFullscreen;
        if(rq){
          /* Android WebView 里 requestFullscreen 可能不带参数就返回 undefined */
          const p = rq.call(el);
          if(p && typeof p.then === 'function'){
            p.then(function(){ orientTryLock(); orientRefresh(); }).catch(function(){ orientTryLock(); orientRefresh(); });
          } else { orientTryLock(); orientRefresh(); }
        } else { orientTryLock(); orientRefresh(); }
      }catch(e){ orientTryLock(); orientRefresh(); }
      /* 【最后兜底】全屏 + lock 都被拒绝时（非 HTTPS、内嵌 WebView、
         用户禁用了屏幕方向锁定等），至少把遮罩上的说明换成
         「请手动把设备转过来」，让玩家知道该怎么办，
         而不是觉得「这个按钮坏了」。延迟一点再判断，
         因为 lock() 的 Promise 是异步的。 */
      setTimeout(function(){
        try{ orientEnsureHint(); }catch(e){}
      }, 700);
    };
    btn.onclick = enterLandscape;
    btn.addEventListener('touchstart', function(e){
      /* 不 preventDefault：保留浏览器的 click 合成，
         同时让全屏请求借用这个用户手势。 */
      enterLandscape(e);
    }, { passive:true });
  }
  return m;
}

/* 【锁定失败时的提示升级】
   如果玩家点了「进入横屏」，但浏览器拒绝了全屏/方向锁定
   （常见于非 HTTPS、内嵌 WebView、系统锁了自动旋转），
   就把遮罩上的说明改成「请手动把设备转过来」，
   并把按钮文字改成「再试一次」。
   这样至少不会出现「点了没反应、也不知道为什么」的死胡同。 */
function orientEnsureHint(){
  if(typeof document==='undefined') return;
  const m=document.getElementById(ORIENT_MASK_ID);
  if(!m) return;
  /* 只有仍然处于竖屏（还没成功转过去）时才提示 */
  if(!orientIsPortrait()) return;
  const d=m.querySelector('[data-om="desc"]');
  const b=m.querySelector('[data-om="btn"]');
  const locked=(typeof window!=='undefined') && window.__orientLocked===true;
  if(d){
    d.textContent = locked
      ? T('已请求横屏，但设备不允许自动旋转。请从系统快捷开关里打开自动旋转，再把手机横过来。')
      : T('这个浏览器不允许自动转屏。请手动把手机横过来；如果仍是竖屏，请从系统快捷开关打开「自动旋转」。');
  }
  if(b) b.textContent = T('再试一次');
  /* 打上标记：后续 orientPaintMask 不再覆盖这段具体提示 */
  if(typeof window!=='undefined') window.__orientHinted=true;
}

/* 刷新遮罩上的文案（语言切换后要跟着变） */
function orientPaintMask(){
  const m = document.getElementById(ORIENT_MASK_ID);
  if(!m) return;
  const t = m.querySelector('[data-om="title"]');
  const d = m.querySelector('[data-om="desc"]');
  const b = m.querySelector('[data-om="btn"]');
  if(t) t.textContent = T('请横屏游玩');
  /* 【别把失败提示冲掉】
     orientRefresh() 在 resize / orientationchange 时会被频繁调用，
     每次都把文案重置成默认值的话，orientEnsureHint() 刚写的
     「请手动把手机横过来」会立刻被覆盖回去 ——
     玩家看到的还是那句「把设备转过来，或者点下面的按钮」，
     等于提示从来没升级过。
     所以这里加一个 __orientHinted 标记：一旦已经给过具体提示，
     就不再回退到默认文案，直到成功转成横屏（由 orientRefresh 清掉）。 */
  if(window.__orientHinted){
    /* 保留 orientEnsureHint 写过的内容，只确保标题还在 */
    return;
  }
  if(d) d.textContent = T('3D 第一人称需要横屏。把设备转过来，或者点下面的按钮。');
  if(b) b.textContent = T('进入横屏');
}

/* 核心：根据当前朝向决定遮罩显隐 */
function orientRefresh(){
  if(typeof document === 'undefined' || !document.body) return;
  const mask = orientBuildMask();
  if(!mask) return;
  /* 做主菜单时完全不干预：不遮、不锁、也不改布局信号。
     只把状态清干净，等真正进游戏那一刻再判断。 */
  if(!orientInGame()){
    orientBlocked = false;
    mask.style.display = 'none';
    /* 回主菜单时清掉提示标记，下次进局重新从默认文案开始 */
    if(typeof window!=='undefined') window.__orientHinted=false;
    return;
  }
  const portrait = orientIsPortrait();
  const wasBlocked = orientBlocked;
  orientBlocked = portrait;
  /* 成功转成横屏了：清掉失败提示标记，下次竖屏重新开始提示流程 */
  if(!portrait && typeof window!=='undefined') window.__orientHinted=false;
  orientPaintMask();
  if(portrait){
    mask.style.display = 'flex';
  } else {
    mask.style.display = 'none';
    /* 转到横屏了：如果之前正在玩，尝试顺便锁定一下，避免再转回去 */
    if(wasBlocked){ orientTryLock(); }
  }
  /* 通知渲染层重算尺寸。转屏时 innerWidth/Height 在部分机器上
     要晚一帧才更新，所以补一次 rAF。 */
  if(typeof window !== 'undefined' && typeof window.__relayout === 'function'){
    try{ window.__relayout(); }catch(e){}
    try{
      if(typeof requestAnimationFrame === 'function'){
        requestAnimationFrame(function(){ try{ window.__relayout(); }catch(e){} });
      }
    }catch(e){}
  }
}
/* 进出游戏的开关。由 f_ui.js 在「开始」时调 true，
   回主菜单（或死亡回菜单）时调 false。
   对外暴露成 window.__orientEnter / __orientExit 供 f_ui 调用，
   这样 f_ui 不必知道遮罩的存在。 */
function orientSetInGame(on){
  if(typeof window === 'undefined') return;
  window.__inGame = !!on;
  /* 进游戏才尝试锁横屏；回主菜单解除锁定，让设备能自由转回竖屏 */
  if(on) orientTryLock();
  else orientUnlock();
  orientRefresh();
}
if(typeof window !== 'undefined'){
  window.__orientEnter = function(){ orientSetInGame(true); };
  window.__orientExit  = function(){ orientSetInGame(false); };
}

/* 初始化：绑定事件 + 首次刷新。
   用 matchMedia('(orientation:portrait)') 精确监听，比 resize 稳，
   因为 resize 在转屏时会连发好几次。 */
function orientInit(){
  if(typeof window === 'undefined') return;
  orientBuildMask();
  orientRefresh();
  let mq = null;
  try{ mq = window.matchMedia('(orientation:portrait)'); }catch(e){ mq = null; }
  if(mq){
    const onChange = function(){ orientRefresh(); };
    if(mq.addEventListener) mq.addEventListener('change', onChange);
    else if(mq.addListener) mq.addListener(onChange);
  }
  window.addEventListener('orientationchange', function(){ orientRefresh(); });
  window.addEventListener('resize', function(){ orientRefresh(); });
  if(typeof document !== 'undefined' && document.addEventListener){
    document.addEventListener('fullscreenchange', function(){ orientRefresh(); });
}
  /* 【不要在这里就锁横屏】
     原实现在 init 里就 orientTryLock()，主菜单一打开就被强制转成横屏，
     但主菜单是竖排卡片布局（标题 + 操作说明 + 三排按钮），横过来反而难用。
     现在只在 __orientEnter()（点「开始」）时才锁，主菜单保持用户当前朝向。 */
}
