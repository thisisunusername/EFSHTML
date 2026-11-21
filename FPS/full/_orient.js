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
function orientTryLock(){
  try{
    const so = (typeof screen !== 'undefined') ? screen.orientation : null;
    if(so && typeof so.lock === 'function'){
      const p = so.lock('landscape');
      /* lock() 返回 Promise，被拒时别让控制台报未捕获异常 */
      if(p && typeof p.catch === 'function') p.catch(function(){});
      return true;
    }
  }catch(e){}
  try{
    if(typeof screen !== 'undefined' && screen.lockOrientation){
      screen.lockOrientation('landscape');
      return true;
    }
  }catch(e){}
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
  /* 遮罩本身吃掉所有事件，防止「竖屏时还能点到下面的按钮」 */
  m.addEventListener('touchstart', function(e){ e.preventDefault(); }, { passive:false });
  m.addEventListener('touchmove',  function(e){ e.preventDefault(); }, { passive:false });
  const btn = m.querySelector('[data-om="btn"]');
  if(btn){
    btn.onclick = function(ev){
      if(ev) ev.stopPropagation();
      /* 用户手势里先试全屏，再锁方向 —— 顺序不能反，
         非全屏状态下 lock() 基本都被拒。 */
      try{
        const el = document.documentElement;
        const rq = el.requestFullscreen || el.webkitRequestFullscreen;
        if(rq){
          const p = rq.call(el);
          if(p && typeof p.then === 'function'){
            p.then(function(){ orientTryLock(); orientRefresh(); }).catch(function(){ orientTryLock(); orientRefresh(); });
          } else { orientTryLock(); orientRefresh(); }
        } else { orientTryLock(); orientRefresh(); }
      }catch(e){ orientTryLock(); orientRefresh(); }
    };
  }
  return m;
}

/* 刷新遮罩上的文案（语言切换后要跟着变） */
function orientPaintMask(){
  const m = document.getElementById(ORIENT_MASK_ID);
  if(!m) return;
  const t = m.querySelector('[data-om="title"]');
  const d = m.querySelector('[data-om="desc"]');
  const b = m.querySelector('[data-om="btn"]');
  if(t) t.textContent = T('请横屏游玩');
  if(d) d.textContent = T('3D 第一人称需要横屏。把设备转过来，或者点下面的按钮。');
  if(b) b.textContent = T('进入横屏');
}

/* 核心：根据当前朝向决定遮罩显隐 */
function orientRefresh(){
  if(typeof document === 'undefined' || !document.body) return;
  const portrait = orientIsPortrait();
  const mask = orientBuildMask();
  if(!mask) return;
  const wasBlocked = orientBlocked;
  orientBlocked = portrait;
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
  /* 桌面端：宽屏不锁，避免影响多窗口使用 */
  if(!orientIsPortrait()){
    const w = window.innerWidth || 0;
    if(w < 900) orientTryLock();
  }
}
