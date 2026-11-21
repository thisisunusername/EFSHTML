/* ============================================================
   s_theme.js —— Material You 主题 · 512 色板 · 调试日志

   【这次重写的缘由】
   上一版的 Material 是「亮白底 + 写死几个变量」，和 2D 版完全不像。
   2D 版（full/f_theme.js）的做法才是真正的 Material Design 3：
     · 主菜单用 M3 深色表面（--m3-surface 系列），不是白底
     · 所有颜色都由「一个种子色」派生（themeBuildTokens）
     · 大圆角 28px + 极轻阴影 + Filled/Tonal Button
   这里把 2D 那套色调函数原样搬过来，保证两版观感一致。
   3D 版既有 CSS 用的是 --bg / --panel / --accent / --accent2，
   所以注入 M3 变量的同时，把这一层也映射过去，
   这样既有 20 处 var(--accent) 不用改一行。

   三个子系统：
     1) 主题：暗夜（原版盐线）/ Material You
     2) 512 色：选一个种子色，整套 M3 配色跟着派生
     3) 调试日志：环缓冲记录，设置面板里可查看/导出
   ============================================================ */

/* ---------- 存储 key ---------- */
const THEME_KEY      = 'efs_theme_v1';
const ACCENT_KEY     = 'efs_accent_v1';
const DEBUGLOG_KEY   = 'efs_debuglog_v1';   /* 是否开启调试日志 */

/* ============================================================
   色调引擎（移植自 2D 版 full/f_theme.js，算法保持一致）
   ============================================================ */
function themeHexToRgb(hex){
  var s=String(hex).replace('#','');
  if(s.length===3) s=s[0]+s[0]+s[1]+s[1]+s[2]+s[2];
  return [parseInt(s.substr(0,2),16), parseInt(s.substr(2,2),16), parseInt(s.substr(4,2),16)];
}
function themeRgbToHex(r,g,b){
  function h(v){ v=Math.max(0,Math.min(255,Math.round(v))); return (v<16?'0':'')+v.toString(16); }
  return '#'+h(r)+h(g)+h(b);
}
/* 从种子色求色相（HSL 空间足够近似 M3 的 HCT 色相） */
function themeHue(hex){
  var c=themeHexToRgb(hex);
  var r=c[0]/255, g=c[1]/255, b=c[2]/255;
  var mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn;
  if(d===0) return 0;
  var h;
  if(mx===r) h=((g-b)/d)%6;
  else if(mx===g) h=(b-r)/d+2;
  else h=(r-g)/d+4;
  h*=60;
  if(h<0) h+=360;
  return h;
}
function themeSat(hex){
  var c=themeHexToRgb(hex);
  var r=c[0]/255, g=c[1]/255, b=c[2]/255;
  var mx=Math.max(r,g,b), mn=Math.min(r,g,b);
  var l=(mx+mn)/2;
  if(mx===mn) return 0;
  return (mx-mn)/(1-Math.abs(2*l-1));
}
/* HSL → HEX */
function themeHsl(h,s,l){
  h=((h%360)+360)%360; s=Math.max(0,Math.min(1,s)); l=Math.max(0,Math.min(1,l));
  var c=(1-Math.abs(2*l-1))*s;
  var x=c*(1-Math.abs((h/60)%2-1));
  var m=l-c/2;
  var r,g,b;
  if(h<60){ r=c; g=x; b=0; }
  else if(h<120){ r=x; g=c; b=0; }
  else if(h<180){ r=0; g=c; b=x; }
  else if(h<240){ r=0; g=x; b=c; }
  else if(h<300){ r=x; g=0; b=c; }
  else { r=c; g=0; b=x; }
  return themeRgbToHex((r+m)*255,(g+m)*255,(b+m)*255);
}
/* 色调值 tone(0..100) → 颜色。chromaScale 控制偏离灰色的程度。
   tone 低端收得比线性更快，接近 M3 实际观感。 */
function themeTone(hue, sat, tone, chromaScale){
  var s = sat * (chromaScale==null?1:chromaScale);
  if(s < 0.06) s = 0.06;
  var l = tone/100;
  if(l < 0.5) l = l*0.86;
  return themeHsl(hue, s, l);
}

/* 生成整套 M3 颜色变量（与 2D 版逐项一致） */
function themeBuildTokens(hex){
  var h = themeHue(hex);
  var s = themeSat(hex);
  var neutralSat = Math.min(s, 0.16);      /* 表面色用极低饱和的同色相 */
  var t = {};
  t['--m3-primary']             = themeTone(h, s, 80, 1);
  t['--m3-on-primary']          = themeTone(h, s, 20, 1.2);
  t['--m3-primary-container']   = themeTone(h, s, 30, 1);
  t['--m3-on-primary-container']= themeTone(h, s, 90, 0.7);
  t['--m3-secondary']           = themeTone(h, s*0.55, 80, 1);
  t['--m3-on-secondary']        = themeTone(h, s*0.55, 20, 1);
  t['--m3-tertiary']            = themeTone(h+60, s*0.8, 80, 1);
  t['--m3-surface']             = themeTone(h, neutralSat, 6, 1);
  t['--m3-surface-1']           = themeTone(h, neutralSat, 10, 1);
  t['--m3-surface-2']           = themeTone(h, neutralSat, 14, 1);
  t['--m3-surface-3']           = themeTone(h, neutralSat, 18, 1);
  t['--m3-on-surface']          = themeTone(h, neutralSat, 92, 0.5);
  t['--m3-on-surface-var']      = themeTone(h, neutralSat, 70, 0.5);
  t['--m3-outline']             = themeTone(h, neutralSat, 45, 0.8);
  t['--m3-outline-var']         = themeTone(h, neutralSat, 28, 0.8);
  t['--m3-error']               = '#f2b8b5';
  t['--m3-on-error']            = '#601410';
  t['--m3-error-container']     = '#8c1d18';
  t['--m3-success']             = themeTone(h+120, 0.45, 78, 1);
  t['--m3-seed']                = hex;
  return t;
}
/* 圆角常量与 2D 版一致 */
const M3_RADII = {
  '--m3-r-xl':'28px', '--m3-r-l':'20px', '--m3-r-m':'16px',
  '--m3-r-s':'12px',  '--m3-r-xs':'8px'
};

/* ============================================================
   1) 主题
   ============================================================ */
const THEMES = {
  dark: {
    id:'dark',
    get name(){ return T('暗夜（原版）'); },
    get desc(){ return T('盐线暗调 · 对比强'); }
  },
  material: {
    id:'material',
    get name(){ return T('Material You'); },
    get desc(){ return T('深色表面 · 大圆角 · 由种子色派生整套配色'); }
  }
};
let curTheme = 'dark';

/* 暗夜主题的原始值（切回时恢复） */
const DARK_VARS = {
  '--bg'     : '#0b0e14',
  '--panel'  : 'rgba(14,18,28,.92)',
  '--fg'     : '#e8e8f0',
  '--fg-dim' : '#b9c4da'
};
/* 切回暗夜时要把注入过的 M3 变量清干净。
   不清也不影响画面（CSS 都写在 [data-theme="material"] 下面），
   但 inline style 会一直挂着 20 多个死变量，后面排查样式容易误判。 */
function m3Clear(el){
  try{
    const tok = themeBuildTokens('#808080');
    for(const k in tok) el.style.removeProperty(k);
    for(const k in M3_RADII) el.style.removeProperty(k);
  }catch(e){}
}

/* Material 主题作用到 DOM：
   注入 M3 变量 + 把 3D 既有变量映射过去 + 打 data-theme 标记 */
function themeApply(){
  try{
    const el = document.documentElement;
    if(!el) return curTheme;
    el.setAttribute('data-theme', curTheme);
    if(curTheme==='material'){
      const tok = themeBuildTokens(accentSeed(accentIdx));
      for(const k in tok) el.style.setProperty(k, tok[k]);
      for(const k in M3_RADII) el.style.setProperty(k, M3_RADII[k]);
      /* 【把 M3 变量映射到 3D 既有变量】
         3D 版的 CSS 早就在用 var(--accent) / var(--bg) / var(--panel)，
         这里不改一行 CSS，靠映射让它自动跟着 M3 走。 */
      el.style.setProperty('--accent',  tok['--m3-primary']);
      el.style.setProperty('--accent2', tok['--m3-tertiary']);
      el.style.setProperty('--bg',      tok['--m3-surface']);
      el.style.setProperty('--panel',   tok['--m3-surface-2']);
      el.style.setProperty('--fg',      tok['--m3-on-surface']);
      el.style.setProperty('--fg-dim',  tok['--m3-on-surface-var']);
      el.style.setProperty('color-scheme','dark');
    }else{
      m3Clear(el);
      for(const k in DARK_VARS) el.style.setProperty(k, DARK_VARS[k]);
      el.style.removeProperty('color-scheme');
      try{ accentApply(); }catch(e){}
    }
    /* 3D 场景背景：Material 下不用纯黑，留一点种子色倾向 */
    try{
      if(typeof scene!=='undefined' && scene && scene.background && scene.background.isColor){
        scene.background.set(curTheme==='material' ? 0x11151c : 0x0b0e14);
      }
    }catch(e){}
  }catch(e){}
  return curTheme;
}
function themeLoad(){
  try{
    const v = localStorage.getItem(THEME_KEY);
    if(v && THEMES[v]) curTheme = v;
  }catch(e){}
  return curTheme;
}
function themeSet(id){
  if(!THEMES[id]) return curTheme;
  curTheme = id;
  try{ localStorage.setItem(THEME_KEY, id); }catch(e){}
  themeApply();
  /* 主题会整体覆盖 --accent，切完必须让 accent 再写一次 */
  try{ if(typeof accentApply==='function') accentApply(); }catch(e){}
  return curTheme;
}

/* ============================================================
   2) 512 色板
   选的是「种子色」，整套 M3 配色由它派生。
   512 格 = 8 色系 × 64 档（8 饱和 × 8 明度）。
   同一色系内一行扫过去就是一条明暗渐变，手机上最好挑。
   ============================================================ */
const ACCENT_FAMILIES = [
  { id:'red',    get name(){ return T('红'); },   hue0:0   },
  { id:'orange', get name(){ return T('橙'); },   hue0:30  },
  { id:'amber',  get name(){ return T('琥珀'); }, hue0:45  },
  { id:'green',  get name(){ return T('绿'); },   hue0:130 },
  { id:'cyan',   get name(){ return T('青'); },   hue0:185 },
  { id:'blue',   get name(){ return T('蓝'); },   hue0:215 },
  { id:'purple', get name(){ return T('紫'); },   hue0:265 },
  { id:'pink',   get name(){ return T('粉'); },   hue0:325 }
];
const ACCENT_SATS = [0.26,0.36,0.46,0.56,0.68,0.80,0.90,1.00];
const ACCENT_LIGS = [0.72,0.64,0.58,0.52,0.46,0.40,0.34,0.28];
const ACCENT_STEPS = 64;   /* 8*8 */
let accentIdx = 0;         /* 0..511 */

/* 下标 → {h,s,l} */
function accentOf(idx){
  idx = ((idx|0) % 512 + 512) % 512;
  const fam = Math.floor(idx / ACCENT_STEPS);
  const sub = idx % ACCENT_STEPS;
  const li = sub % 8;                 /* 明度：一行内由亮到暗 */
  const si = Math.floor(sub / 8) % 8; /* 饱和度：一行比一行更艳 */
  const F = ACCENT_FAMILIES[fam] || ACCENT_FAMILIES[6];
  return {
    hue: F.hue0,
    s:   ACCENT_SATS[si],
    l:   ACCENT_LIGS[li],
    fam: F.id
  };
}
/* 种子色（HEX）—— M3 色调引擎要 hex，不是 hsl() */
function accentSeed(idx){
  const a = accentOf(idx);
  return themeHsl(a.hue, a.s, a.l);
}
function accentCss(idx){
  const a = accentOf(idx);
  return 'hsl('+a.hue+','+Math.round(a.s*100)+'%,'+Math.round(a.l*100)+'%)';
}
function accentCss2(idx){
  const a = accentOf(idx);
  const l2 = Math.min(0.92, a.l+0.10);
  return 'hsl('+a.hue+','+Math.round(a.s*100)+'%,'+Math.round(l2*100)+'%)';
}
function accentLoad(){
  try{
    const v = parseInt(localStorage.getItem(ACCENT_KEY), 10);
    if(isFinite(v)) accentIdx = ((v%512)+512)%512;
  }catch(e){}
  return accentIdx;
}
function accentApply(){
  try{
    const el = document.documentElement;
    if(!el) return accentIdx;
    if(curTheme==='material'){
      /* Material 下整套配色由种子色派生，直接重建 tokens */
      const tok = themeBuildTokens(accentSeed(accentIdx));
      for(const k in tok) el.style.setProperty(k, tok[k]);
      el.style.setProperty('--accent',  tok['--m3-primary']);
      el.style.setProperty('--accent2', tok['--m3-tertiary']);
      el.style.setProperty('--bg',      tok['--m3-surface']);
      el.style.setProperty('--panel',   tok['--m3-surface-2']);
    }else{
      el.style.setProperty('--accent',  accentCss(accentIdx));
      el.style.setProperty('--accent2', accentCss2(accentIdx));
    }
  }catch(e){}
  return accentIdx;
}
function accentSet(idx){
  accentIdx = ((Number(idx)|0)%512+512)%512;
  try{ localStorage.setItem(ACCENT_KEY, String(accentIdx)); }catch(e){}
  accentApply();
  return accentIdx;
}

/* ============================================================
   3) 字体（照搬 2D 版 full/f_theme.js 的 FONT_FAMILY / FONT_LIMITS）
   2D 版把字体选择做在「自定义主题」里，共 9 个字体族 + 3 个字号。
   这里保持完全一致的清单与取值范围，只把存储 key 换成 3D 版自己的，
   免得和 2D 的 localStorage 互相覆盖。
   ============================================================ */
const FONT_KEY = 'efs_font_v1';

const FONT_FAMILY = {
  system: { name:'系统默认', css:'-apple-system,"PingFang SC","Microsoft YaHei",system-ui,sans-serif' },
  mono:   { name:'等宽',     css:'"JetBrains Mono","Cascadia Mono",Consolas,"Noto Sans Mono",monospace' },
  serif:  { name:'衬线',     css:'Georgia,"Songti SC","SimSun","Noto Serif SC",serif' },
  round:  { name:'圆体',     css:'"Yuanti SC","Hiragino Sans GB","Microsoft YaHei",sans-serif' },
  hand:   { name:'手写',     css:'"Kaiti SC","STKaiti",KaiTi,"Noto Serif SC",cursive' },
  zw:     { name:'站酷小薇', css:'"ZCOOLXiaoWei","PingFang SC",sans-serif' },
  ms:     { name:'马善政楷', css:'"MaShanZheng","PingFang SC",cursive' },
  zk:     { name:'站酷快乐', css:'"ZCOOLKuaiLe","PingFang SC",sans-serif' },
  lc:     { name:'龙藏体',   css:'"LongCang","PingFang SC",cursive' }
};
/* 字号：和 2D 版完全相同的上下限与默认值 */
const FONT_LIMITS = {
  title: { min:14, max:48, step:1, def:28, n:'标题字号' },
  body:  { min:9,  max:24, step:1, def:13, n:'正文字号' },
  btn:   { min:10, max:26, step:1, def:14, n:'按钮字号' }
};
/* 3D 版的字体缩放基准：
   上面这三档是照着 2D 版的绝对像素设计的（2D 的标题 28px、正文 13px）。
   3D 版原有字号并不一样（h1 更大、正文更小），如果直接把 28px 套上去，
   界面会整体走形。所以这里做「相对倍率」换算：
     倍率 = 选中的字号 / 该档默认字号
   再乘到 3D 版自己的基准像素上，观感一致又不会破坏布局。 */
const FONT_BASE_3D = { title:30, body:13, btn:14 };

let fontSel = { family:'system', title:28, body:13, btn:14 };

function fontClampSize(k, v){
  const lim = FONT_LIMITS[k];
  if(!lim) return null;
  let n = parseInt(v, 10);
  if(!isFinite(n)) return lim.def;
  if(n < lim.min) n = lim.min;
  if(n > lim.max) n = lim.max;
  return n;
}
function fontNormFamily(v){
  const s = String(v||'').toLowerCase();
  return FONT_FAMILY[s] ? s : 'system';
}
function fontLoad(){
  try{
    const raw = localStorage.getItem(FONT_KEY);
    if(raw){
      const o = JSON.parse(raw);
      if(o && typeof o === 'object'){
        fontSel.family = fontNormFamily(o.family);
        fontSel.title = fontClampSize('title', o.title);
        fontSel.body  = fontClampSize('body',  o.body);
        fontSel.btn   = fontClampSize('btn',   o.btn);
      }
    }
  }catch(e){}
  return fontSel;
}
function fontSave(){
  try{ localStorage.setItem(FONT_KEY, JSON.stringify(fontSel)); }catch(e){}
}
/* 把字体作用到页面：
   --font-ui  —— 所有界面的字体族
   --fs-title / --fs-body / --fs-btn —— 换算后的实际像素 */
function fontApply(){
  try{
    const el = document.documentElement;
    if(!el || !el.style) return fontSel;
    const fam = FONT_FAMILY[fontSel.family] || FONT_FAMILY.system;
    el.style.setProperty('--font-ui', fam.css);
    el.style.setProperty('--fs-title', Math.round(FONT_BASE_3D.title * (fontSel.title / FONT_LIMITS.title.def)) + 'px');
    el.style.setProperty('--fs-body',  Math.round(FONT_BASE_3D.body  * (fontSel.body  / FONT_LIMITS.body.def))  + 'px');
    el.style.setProperty('--fs-btn',   Math.round(FONT_BASE_3D.btn   * (fontSel.btn   / FONT_LIMITS.btn.def))   + 'px');
    /* 打标记方便 CSS 里用 html[data-font] 做特例 */
    el.setAttribute('data-font', fontSel.family);
  }catch(e){}
  return fontSel;
}
/* 【字体是否真的加载成功】@font-face 只是「声明」，
   浏览器要等实际用到才会去下载/解析那个 ttf。
   如果文件路径不对（file:// 下最容易被拦），
   document.fonts.check() 会返回 false，界面静默回退到系统字体 ——
   玩家看到的就是「换了字体没反应」。
   这里给出探测函数，设置面板调用它来决定要不要提示。 */
function fontFaceLoaded(family){
  try{
    const f = FONT_FAMILY[family];
    if(!f) return null;
    /* 只关心那四个 @font-face 自带字体；系统/等宽/衬线/圆体/手写
       都依赖设备本地字体，无需检测（本来就不该有加载问题）。 */
    const m = f.css.match(/^"([A-Za-z]+)"/);
    if(!m) return null;
    const name = m[1];
    if(typeof document==='undefined' || !document.fonts || !document.fonts.check) return null;
    return document.fonts.check('16px "'+name+'"');
  }catch(e){ return null; }
}
/* 主动触发加载：把四个字体都拉一遍，这样切过去立刻就是正确字形，
   不会先闪一下系统字体。走 load() 是异步的，失败了也不会影响界面。 */
function fontWarmup(){
  try{
    if(typeof document==='undefined' || !document.fonts) return;
    const names=['ZCOOLXiaoWei','MaShanZheng','ZCOOLKuaiLe','LongCang'];
    for(const n of names){
      try{
        const p=document.fonts.load('16px "'+n+'"');
        if(p && p.catch) p.catch(()=>{});
      }catch(e){}
    }
  }catch(e){}
}
function fontSetFamily(v){
  fontSel.family = fontNormFamily(v);
  fontSave(); fontApply();
  /* 切到自带字体时顺手确认一下有没有加载成功，失败就明确提示，
     而不是让玩家盯着屏幕猜。 */
  try{
    const ok = fontFaceLoaded(fontSel.family);
    if(ok === false && typeof toast==='function'){
      toast('字体文件没能加载（fonts/ 要和 index.html 放在一起）');
    }
  }catch(e){}
  return fontSel.family;
}
function fontSetSize(k, v){
  const n = fontClampSize(k, v);
  if(n===null) return fontSel;
  fontSel[k] = n;
  fontSave(); fontApply();
  return fontSel;
}
function fontSet(newSel){
  if(newSel && typeof newSel === 'object'){
    if('family' in newSel) fontSel.family = fontNormFamily(newSel.family);
    for(const k of ['title','body','btn']){
      if(k in newSel){ const n = fontClampSize(k, newSel[k]); if(n!==null) fontSel[k]=n; }
    }
  }
  fontSave(); fontApply();
  return fontSel;
}
function fontReset(){
  fontSel = { family:'system', title:FONT_LIMITS.title.def,
              body:FONT_LIMITS.body.def, btn:FONT_LIMITS.btn.def };
  fontSave(); fontApply();
  return fontSel;
}
/* 字体族列表（给设置面板渲染用，保持顺序稳定） */
const FONT_ORDER = ['system','mono','serif','round','hand','zw','ms','zk','lc'];

/* ============================================================
   4) 调试日志
   ============================================================ */
const LOG_MAX = 300;
let logOn = false;
let logBuf = [];
let logHookInstaled = false;

function logStamp(){
  const d = new Date();
  const p = n=> (n<10?'0':'')+n;
  return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}
function logPush(level, args){
  if(!logOn) return;
  try{
    let msg = '';
    for(let i=0;i<args.length;i++){
      const a = args[i];
      if(a instanceof Error) msg += (a.stack||a.message||String(a));
      else if(typeof a === 'object'){
        try{ msg += JSON.stringify(a); }catch(e){ msg += String(a); }
      } else msg += String(a);
      if(i<args.length-1) msg += ' ';
    }
    logBuf.push({ t:logStamp(), lv:level||'info', m:msg.slice(0,500) });
    if(logBuf.length > LOG_MAX) logBuf.splice(0, logBuf.length-LOG_MAX);
    updateLogBadge();
  }catch(e){}
}
function dlog(){ logPush('log', arguments); }
function dwarn(){ logPush('warn', arguments); }
function derr(){ logPush('error', arguments); }

/* 【钩住原生 console】只做旁路拷贝，不改原本行为。
   钩一次就行，重复钩会导致同一条日志被记录多份。 */
function logHookConsole(){
  if(logHookInstaled) return;
  logHookInstaled = true;
  try{
    const ow = console.warn, oe = console.error;
    console.warn = function(){ try{ if(logOn) logPush('warn', arguments); }catch(e){} return ow.apply(console, arguments); };
    console.error= function(){ try{ if(logOn) logPush('error', arguments); }catch(e){} return oe.apply(console, arguments); };
  }catch(e){}
  try{
    window.addEventListener('error', function(e){
      try{
        if(e && e.target && e.target.tagName==='SCRIPT') return;
        logPush('error', [(e&&e.message)||'未知错误','@'+((e&&e.filename)||'')+':'+((e&&e.lineno)||'')]);
      }catch(x){}
    }, true);
    window.addEventListener('unhandledrejection', function(e){
      const r=e && e.reason;
      logPush('error', ['Promise 未捕获：'+((r&&(r.stack||r.message))||String(r))]);
    });
  }catch(e){}
}
function logLoad(){
  try{ logOn = localStorage.getItem(DEBUGLOG_KEY)==='1'; }catch(e){ logOn=false; }
  return logOn;
}
function logSet(on){
  logOn = !!on;
  try{ localStorage.setItem(DEBUGLOG_KEY, logOn?'1':'0'); }catch(e){}
  updateLogBadge();
  if(logOn) logPush('info', [T('调试日志已开启')]);
  return logOn;
}
function logClear(){ logBuf=[]; updateLogBadge(); return 0; }
function logText(){
  const out=[];
  for(let i=0;i<logBuf.length;i++){
    const r=logBuf[i];
    out.push('['+r.t+'] ['+r.lv+'] '+r.m);
  }
  return out.join('\n');
}
function updateLogBadge(){
  try{
    const b=document.getElementById('logBadge');
    if(!b) return;
    if(!logOn){ b.textContent=''; b.style.display='none'; return; }
    b.style.display='inline-block';
    b.textContent='LOG '+logBuf.length;
  }catch(e){}
}

/* ============================================================
   初始化：必须在 DOM 就绪后调，且在所有分块定义之后。
   ============================================================ */
function themeInit(){
  themeLoad();
  accentLoad();
  fontLoad();
  logLoad();
  logHookConsole();
  /* 【顺序不能反】
     themeApply 在 material 下会用种子色重建整套 tokens，
     accentApply 再按当前主题写一次 —— 反过来玩家选的颜色会被盖掉。 */
  themeApply();
  accentApply();
  /* 字体放在主题之后：fontApply 只写 --font-ui / --fs-*，不碰颜色，
     所以顺序其实无所谓，但排在后面读起来更合逻辑。 */
  fontApply();
  dlog('theme init', curTheme, 'accent', accentIdx, 'seed', accentSeed(accentIdx));
  dlog('font init', fontSel.family, fontSel.title, fontSel.body, fontSel.btn);
}