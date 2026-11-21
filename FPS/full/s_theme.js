/* ============================================================
   s_theme.js —— Material 主题 · 512 色板 · 设置项存储 · 调试日志

   为什么单独一个文件：这些东西全局被引用（CSS 变量、面板渲染、
   音效、日志），如果塞进 f_ui.js 会和 UI 逻辑缠在一起。
   放在 u_i18n.js 之后加载，因为设置面板要调 T()。

   三个子系统：
     1) 主题：默认盐线暗调 / Material You 亮调两套 CSS 变量
     2) 512 色：指主色（accent）可调，512 = 8 组 × 64 色
     3) 调试日志：环缓冲记录，设置面板里可查看/导出
   ============================================================ */

/* ---------- 存储 key ---------- */
const THEME_KEY      = 'efs_theme_v1';
const ACCENT_KEY     = 'efs_accent_v1';
const DEBUGLOG_KEY   = 'efs_debuglog_v1';   /* 是否开启调试日志 */

/* ============================================================
   1) 主题
   两套主题只靠 <html data-theme="..."> 切换，变量名一致，
   这样所有既有 CSS 不需要改一行 —— 它们早就在用 var(--accent) 了。
   ============================================================ */
const THEMES = {
  dark: { id:'dark',  get name(){ return T('暗夜（原版）'); },  desc:'Saltline 暗色 · 对比强' },
  material: { id:'material', get name(){ return T('Material 浅色'); }, desc:'Material You 亮调 · 白天友好' }
};
let curTheme = 'dark';

/* Material 主题的变量表。
   只改颜色，不改尺寸 —— 否则布局会跟着变，风险太大。 */
const MATERIAL_VARS = {
  '--bg'      : '#f4f2f7',
  '--panel'   : 'rgba(255,255,255,.92)',
  '--accent'  : '#6750a4',
  '--accent2' : '#8b6fd1',
  '--fg'      : '#1d1b20',
  '--fg-dim'  : '#5f5b66'
};

function themeLoad(){
  try{
    const v = localStorage.getItem(THEME_KEY);
    if(v && THEMES[v]) curTheme = v;
    else if(v==='material') curTheme='material';
  }catch(e){}
  return curTheme;
}
function themeApply(){
  try{
    const el = document.documentElement;
    if(!el) return curTheme;
    el.setAttribute('data-theme', curTheme);
    if(curTheme==='material'){
      for(const k in MATERIAL_VARS) el.style.setProperty(k, MATERIAL_VARS[k]);
      /* 浅色主题下正文颜色变深，否则白底白字看不见 */
      el.style.setProperty('color-scheme','light');
    }else{
      for(const k in MATERIAL_VARS) el.style.removeProperty(k);
      el.style.removeProperty('color-scheme');
    }
    /* 3D 场景背景也跟着走：浅色主题下暗背景很刺眼 */
    try{
      if(typeof scene!=='undefined' && scene && scene.background && scene.background.isColor){
        scene.background.set(curTheme==='material' ? 0xcfd8e3 : 0x0b0e14);
      }
    }catch(e){}
  }catch(e){}
  return curTheme;
}
function themeSet(id){
  if(!THEMES[id]) return curTheme;
  curTheme = id;
  try{ localStorage.setItem(THEME_KEY, id); }catch(e){}
  themeApply();
  /* 【必须补一次 accentApply】
     themeApply 在切回 dark 时会 removeProperty 清掉 MATERIAL_VARS，
     而 --accent 就在那张表里 —— 于是玩家自定义的主色被一起剥掉，
     界面变回默认紫。这里把玩家选的颜色写回去。
     顺序和 themeInit 一致：先主题、后 accent。 */
  try{ if(typeof accentApply==='function') accentApply(); }catch(e){}
  return curTheme;
}

/* ============================================================
   2) 512 色板
   「512 color」理解为主色可选范围：8 个色相家族 × 64 个明度/饱和度档位。
   为什么不直接用 HSL 滑条：玩家在手机上拉滑条很难拉准，
   而且没参照物。这里直接给一个 8×64 的网格，点哪算哪，
   还能一眼看完所有可选颜色。
   ============================================================ */
const ACCENT_FAMILIES = [
  { id:'purple', get name(){ return T('紫'); } },
  { id:'blue',   get name(){ return T('蓝'); } },
  { id:'cyan',   get name(){ return T('青'); } },
  { id:'green',  get name(){ return T('绿'); } },
  { id:'amber',  get name(){ return T('琥珀'); } },
  { id:'orange', get name(){ return T('橙'); } },
  { id:'red',    get name(){ return T('红'); } },
  { id:'pink',   get name(){ return T('粉'); } }
];
/* 每个家族的基准色相 */
const ACCENT_HUE = {
  purple:265, blue:215, cyan:188, green:142,
  amber:45,  orange:22, red:358, pink:330
};
/* 64 档 = 8 饱和度 × 8 明度，形成深浅梯度 */
const ACCENT_SATS = [0.28,0.40,0.52,0.64,0.76,0.88,0.96,1.00];
const ACCENT_LIGS = [0.86,0.76,0.68,0.60,0.52,0.44,0.36,0.28];
const ACCENT_STEPS = 64;   /* 8*8 */
let accentIdx = 0;         /* 0..511 */

/* 下标 -> {h,s,l} */
function accentOf(idx){
  idx = ((idx|0) % 512 + 512) % 512;
  const fam = Math.floor(idx / ACCENT_STEPS);
  const sub = idx % ACCENT_STEPS;
  const si = sub % 8;
  const li = Math.floor(sub / 8) % 8;
  const fid = ACCENT_FAMILIES[fam] ? ACCENT_FAMILIES[fam].id : 'purple';
  return {
    hue: ACCENT_HUE[fid] || 265,
    s: ACCENT_SATS[si],
    l: ACCENT_LIGS[li],
    fam: fid
  };
}
function accentCss(idx){
  const a = accentOf(idx);
  return 'hsl('+a.hue+','+Math.round(a.s*100)+'%,'+Math.round(a.l*100)+'%)';
}
function accentCss2(idx){
  /* 辅助色：同色相，抬高 8% 亮度 */
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
    el.style.setProperty('--accent', accentCss(accentIdx));
    el.style.setProperty('--accent2', accentCss2(accentIdx));
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
   3) 调试日志
   两件事：
     · 一个环缓冲（最近 300 条），不依赖控制台 —— 手机上没控制台
     · 一个开关，关掉时不记录，避免影响帧率
   console.error / console.warn 也会被抄一份进来。
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
  /* 未捕获异常也进日志 */
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
  if(logOn) logPush('info', ['调试日志已开启']);
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
/* 把开关状态同步到 HUD 那个小徽标（有就更新，没有就跳过） */
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
  logLoad();
  logHookConsole();
  /* 【两层都要上】
     themeApply 会清掉 MATERIAL_VARS，accentApply 会盖 --accent。
     顺序不能反：先主题（可能清 accent），再 accent（写回玩家选的颜色）。 */
  themeApply();
  accentApply();
  dlog('theme init', curTheme, 'accent', accentIdx);
}
