/* ============================================================
   t_settings.js —— 设置面板

   包含六个页签：
     1) 外观：主题（暗夜 / Material You）
     2) 字体：9 个字体族 + 标题/正文/按钮三档字号（照搬 2D 版）
     3) 主题色：512 色网格（选种子色）
     4) 声音：全局音量滑块 + 总开关
     5) 语言：中文 / English —— 原来挂在主菜单末尾，
        但那个 .row 是 #saveRow（display:none），按钮被藏没了，
        所以玩家说「语言设置不见了」。现在收进设置里，永远找得到。
     6) 调试：调试日志开关 / 查看 / 复制 / 清空

   结构上和 shop/stash/gunsmith 同构（一个 #settings 全屏浮层），
   但内容全部在这里生成，不往 f_ui.js 里搎。
   ============================================================ */

/* 当前设置页签 */
let setTab = 'look';

function closeSettings(){
  const s=document.getElementById('settings');
  if(s) s.style.display='none';
  /* 【从暂停里进来的要还回去】玩家局内暂停 → 点「设置」→
     改完点返回，应该回到暂停界面，而不是掉回一个看不出状态的对局画面。 */
  try{ if(typeof pauseReturnFromPanel==='function') pauseReturnFromPanel(); }catch(e){}
}

function toggleSettings(){
  const s=document.getElementById('settings');
  if(!s) return;
  const opening = s.style.display!=='flex';
  if(opening){
    s.style.display='flex';
    /* 和商店/仓库/改枪台互斥，四选一 */
    try{ if(typeof closeShop==='function') closeShop(); }catch(e){}
    try{ if(typeof closeStash==='function') closeStash(); }catch(e){}
    try{ if(typeof closeGunsmith==='function') closeGunsmith(); }catch(e){}
    try{ if(typeof closeBag==='function') closeBag(); }catch(e){}
    buildSettings();
  } else closeSettings();
}

function buildSettings(){
  const el=document.getElementById('settings');
  if(!el) return;
  let h='<div class="box" style="max-width:600px">';
  /* 标题行：返回放在最左，符合「左上角返回」的通用习惯 */
  h+='<div class="row" style="justify-content:space-between;align-items:center;margin:0 0 8px">'
    +'<h1 style="margin:0">⚙️ '+T('设置')+'</h1>'
    +'<button class="backBtn" id="setClose">← '+T('返回')+'</button></div>';
  /* 页签 */
  const TABS=[
    {id:'look',  get n(){ return T('外观'); }},
    {id:'font',  get n(){ return T('字体'); }},
    {id:'color', get n(){ return T('主题色'); }},
    {id:'sound', get n(){ return T('声音'); }},
    {id:'lang',  get n(){ return T('语言'); }},
    {id:'touch', get n(){ return T('触屏'); }},
    {id:'bench', get n(){ return T('跑分'); }},
    {id:'debug', get n(){ return T('调试'); }}
  ];
  h+='<div class="tabs">';
  for(const t of TABS){
    h+='<button class="tab'+(setTab===t.id?' on':'')+'" data-set-tab="'+t.id+'">'+t.n+'</button>';
  }
  h+='</div>';

  /* ---------- 外观 ---------- */
  if(setTab==='look'){
    h+='<div class="d" style="margin:10px 0 6px">'+T('选择界面主题。Material You 与 2D 版一致：深色表面、大圆角，配色由种子色派生。')+'</div>';
    for(const id in THEMES){
      const th=THEMES[id];
      const on = (typeof curTheme!=='undefined') && curTheme===id;
      h+='<div class="setrow'+(on?' on':'')+'" data-theme-pick="'+id+'">'
        +'<div class="setinfo"><div class="setn">'+th.name+'</div>'
        +'<div class="setd">'+(th.desc||'')+'</div></div>'
        +'<div class="setmark">'+(on?'✓':'')+'</div>'
        +'</div>';
    }
  }

  /* ---------- 字体（对齐 2D 版）----------
     2D 版是在「自定义主题」里选字体族 + 三档字号，这里照抄同一套清单。 */
  if(setTab==='font'){
    h+='<div class="d" style="margin:10px 0 6px">'
      +T('字体族与字号均与 2D 版一致。含站酷、马善政楷、龙藏等字体，设备未安装时自动回退到系统字体。')
      +'</div>';
    /* 字体族：两列小格子，比下拉框在手机上更好按 */
    h+='<div class="setrow" style="flex-direction:column;align-items:stretch">'
      +'<div class="setinfo"><div class="setn">'+T('字体族')+'</div>'
      +'<div class="setd">'+T('当前：{0}', (FONT_FAMILY[fontSel.family]||FONT_FAMILY.system).name)+'</div></div>'
      +'</div>';
    h+='<div class="fontgrid">';
    for(const fk of FONT_ORDER){
      const f=FONT_FAMILY[fk];
      const on=(fontSel.family===fk);
      h+='<button class="fontcell'+(on?' on':'')+'" data-font-fam="'+fk+'" '
        +'style="font-family:'+f.css+'">'+f.name+'</button>';
    }
    h+='</div>';
    /* 三档字号 */
    for(const sk of ['title','body','btn']){
      const lim=FONT_LIMITS[sk];
      const v=fontSel[sk];
      h+='<div class="setrow" style="flex-direction:column;align-items:stretch">'
        +'<div class="setinfo" style="display:flex;justify-content:space-between;align-items:center">'
        +'<div><div class="setn">'+T(lim.n)+'</div>'
        +'<div class="setd">'+T('范围 {0}–{1}px', lim.min, lim.max)+'</div></div>'
        +'<div class="setval">'+v+'</div></div>'
        +'<input class="volrange" id="fs_'+sk+'" type="range" min="'+lim.min+'" max="'+lim.max+'" step="'+lim.step+'" value="'+v+'">'
        +'</div>';
    }
    h+='<div class="row" style="margin-top:10px">'
      +'<button class="btn ghost small" id="fontReset">'+T('恢复默认字体')+'</button></div>';
  }

  /* ---------- 512 色 ---------- */
  if(setTab==='color'){
    h+='<div class="d" style="margin:10px 0 6px">'
      +T('主色共 512 档：8 个色系 × 64 个深浅。点一格立即生效。')
      +'</div>';
    /* 当前色预览 */
    h+='<div class="setcurr">'
      +'<span class="setdot" style="background:'+accentCss(accentIdx)+'"></span>'
      +'<span class="setmono">#'+String(accentIdx).padStart(3,'0')+' / 512</span>'
      +'<span class="setmono" style="opacity:.6">'+accentCss(accentIdx)+'</span>'
      +'</div>';
    h+='<div class="palwrap">';
    for(let f=0; f<ACCENT_FAMILIES.length; f++){
      const fam=ACCENT_FAMILIES[f];
      h+='<div class="palrow">';
      h+='<div class="palfam">'+fam.name+'</div>';
      h+='<div class="palgrid">';
      for(let s=0; s<ACCENT_STEPS; s++){
        const idx=f*ACCENT_STEPS+s;
        const sel = (idx===accentIdx)?' sel':'';
        h+='<div class="palcell'+sel+'" data-accent="'+idx+'"'
          +' style="background:'+accentCss(idx)+'"'
          +' title="'+idx+'"></div>';
      }
      h+='</div></div>';
    }
    h+='</div>';
  }

  /* ---------- 声音 ---------- */
  if(setTab==='sound'){
    const pct = Math.round((typeof masterVol==='number'?masterVol:1)*100);
    h+='<div class="setrow">'
      +'<div class="setinfo"><div class="setn">'+T('全局音量')+'</div>'
      +'<div class="setd">'+T('对所有音效整体缩放，不影响各音效的相对响度')+'</div></div>'
      +'<div class="setval">'+pct+'%</div></div>';
    h+='<input id="volRange" class="volrange" type="range" min="0" max="100" step="1" value="'+pct+'">';
    const on = (typeof sfxOn!=='undefined') && sfxOn;
    h+='<div class="setrow'+(on?' on':'')+'" data-sfx-toggle="1">'
      +'<div class="setinfo"><div class="setn">'+T('音效开关')+'</div>'
      +'<div class="setd">'+T('完全静音，倍率保留')+'</div></div>'
      +'<div class="setmark">'+(on?'✓':'')+'</div></div>';
  }

  /* ---------- 语言 ---------- */
  if(setTab==='lang'){
    h+='<div class="d" style="margin:10px 0 6px">'
      +T('界面语言。切换后所有界面立即重绘，不需要重开游戏。')
      +'</div>';
    const langs=[['zh','中文'],['en','English']];
    const cur=(typeof I18N_LANG!=='undefined')?I18N_LANG:'zh';
    for(const [code,name] of langs){
      const on=(cur===code);
      h+='<div class="setrow'+(on?' on':'')+'" data-lang-pick="'+code+'">'
        +'<div class="setinfo"><div class="setn">'+name+'</div>'
        +'<div class="setd">'+(code==='zh'?T('简体中文界面'):T('英文界面'))+'</div></div>'
        +'<div class="setmark">'+(on?'✓':'')+'</div></div>';
    }
  }

  /* ---------- 触屏布局 ---------- */
  if(setTab==='touch'){
    h += (typeof tlayTabHtml==='function' ? tlayTabHtml()
      : '<div class="d">触屏布局模块未加载</div>');
  }
  /* ---------- 跑分 ---------- */
  if(setTab==='bench'){
    h += '<div class="d" style="margin:10px 0 6px">'
      + '自动沿预设路线走一遍整个校园（含五层楼），每段测一次平均帧率，'
      + '结束时给出总分、平均 FPS 和每一段的坐标。测试期间不能操作，大约 40 秒。'
      + '</div>';
    h += '<div class="setrow" style="cursor:default">'
      + '<div class="setinfo"><div class="setn">测试路线</div>'
      + '<div class="setd">操场 → 教学楼五层 → 篮球场 → 体育馆 → 东楼 → 校门</div></div>'
      + '<div class="setval">' + (typeof BENCH_ROUTE!=='undefined' ? BENCH_ROUTE.length : 0) + ' 段</div>'
      + '</div>';
    h += '<div class="row" style="gap:8px;flex-wrap:wrap;margin-top:10px">'
      + '<button class="btn small" id="benchStartBtn">开始性能测试</button>'
      + '<button class="btn ghost small" id="benchLastBtn">查看上次结果</button>'
      + '</div>';
    h += '<div class="d" style="margin-top:10px">'
      + '提示：跑分时会暂停游戏逻辑（不刷怪、不倒计时），只测渲染性能，'
      + '所以成绩可以跨设备直接对比。'
      + '</div>';
  }
  /* ---------- 调试 ---------- */
  if(setTab==='debug'){
    const on = (typeof logOn!=='undefined') && logOn;
    h+='<div class="setrow'+(on?' on':'')+'" data-log-toggle="1">'
      +'<div class="setinfo"><div class="setn">'+T('调试日志')+'</div>'
      +'<div class="setd">'+T('记录警告与错误，方便排查问题')+'</div></div>'
      +'<div class="setmark">'+(on?'✓':'')+'</div></div>';
    /* 【日志内容区】以前错误只能看控制台，手机上根本看不到。
       这里直接把环缓冲打印出来，还能一键复制。 */
    const txt = logText();
    h+='<div class="setlog">'+(txt? escapeHtml(txt) : T('（暂无日志）'))+'</div>';
    h+='<div class="row" style="margin-top:8px;gap:8px">'
      +'<button class="btn ghost small" id="logRefresh">'+T('刷新')+'</button>'
      +'<button class="btn ghost small" id="logCopy">'+T('复制全部')+'</button>'
      +'<button class="btn danger small" id="logClear">'+T('清空')+'</button>'
      +'</div>';
    h+='<div class="d" style="margin-top:8px">'+T('共 {0} 条 · 最多保留 300 条', logBuf.length)+'</div>';
  }

  h+='</div>';
  el.innerHTML=h;
  bindSettings();
}

/* 避免把日志里的 < > 当 HTML 渲染 */
function escapeHtml(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function bindSettings(){
  const el=document.getElementById('settings');
  if(!el) return;
  const cs=document.getElementById('setClose');
  if(cs) cs.onclick=()=>{ try{ sfxUI(); }catch(e){} closeSettings(); };
  /* 页签 */
  el.querySelectorAll('[data-set-tab]').forEach(b=>{
    b.onclick=()=>{ setTab=b.getAttribute('data-set-tab'); try{ sfxUI(); }catch(e){} buildSettings(); };
  });
  /* 主题 */
  el.querySelectorAll('[data-theme-pick]').forEach(b=>{
    b.onclick=()=>{
      themeSet(b.getAttribute('data-theme-pick'));
      try{ sfxUI(); }catch(e){}
      buildSettings();
    };
  });
  /* 512 色 */
  el.querySelectorAll('[data-accent]').forEach(b=>{
    b.onclick=()=>{
      accentSet(parseInt(b.getAttribute('data-accent'),10));
      try{ sfxUI(); }catch(e){}
      buildSettings();
    };
  });
  /* 字体族 —— 九宫格，点一格立即换字并重建面板以刷新选中态 */
  el.querySelectorAll('[data-font-fam]').forEach(b=>{
    b.onclick=()=>{
      fontSetFamily(b.getAttribute('data-font-fam'));
      try{ sfxUI(); }catch(e){}
      buildSettings();
    };
  });
  /* 三档字号 —— 和音量滑块同一个道理：拖动过程中只改数值与预览，
     不能 rebuild，否则滑块一拖就断。松手（change）才重建。 */
  for(const sk of ['title','body','btn']){
    const r=document.getElementById('fs_'+sk);
    if(!r) continue;
    const fresh=()=>{
      const v=parseInt(r.value,10);
      if(isNaN(v)) return;
      fontSetSize(sk, v);
      /* 滑块上方那个 .setval 数字跟着走 */
      const rowv=r.parentElement && r.parentElement.querySelector('.setval');
      if(rowv) rowv.textContent=v;
    };
    r.oninput=fresh;
    r.onchange=()=>{ fresh(); buildSettings(); };
  }
  /* 恢复默认字体 */
  const fr=document.getElementById('fontReset');
  if(fr) fr.onclick=()=>{
    fontReset();
    try{ sfxUI(); }catch(e){}
    buildSettings();
  };
  /* 语言 —— 切完要把整个界面重绘一遍，所以先关面板再重开，
     否则设置面板里残留的还是旧语言的文案。 */
  el.querySelectorAll('[data-lang-pick]').forEach(b=>{
    b.onclick=()=>{
      const code=b.getAttribute('data-lang-pick');
      try{ sfxUI(); }catch(e){}
      try{ i18nSetLang(code, i18nRebuildAll); }catch(e){}
      /* 设置面板自身也要跟着换语言：直接重建一次即可 */
      try{ buildSettings(); }catch(e){}
    };
  });
  /* 音量滑块 */
  const vr=document.getElementById('volRange');
  if(vr){
    const onInput=()=>{
      const v=parseInt(vr.value,10)||0;
      /* 【必须先把 AudioContext 跑起来】主菜单时 AC 还是 null，
         不 init 的话滑块只是改了变量，听不到任何变化。 */
      try{ if(typeof audioInit==='function'){ audioInit(); audioResume(); } }catch(e){}
      masterVolSet(v/100);
      masterVolApply();
      /* 只改显示，不重建面板 —— 重建会让滑块失去拖动焦点，
         手指一拖就断。 */
      const row=vr.previousElementSibling;
      if(row){
        const vv=row.querySelector('.setval');
        if(vv) vv.textContent=v+'%';
      }
    };
    vr.oninput=onInput;
    vr.onchange=onInput;
  }
  /* 音效总开关 */
  const st=el.querySelector('[data-sfx-toggle]');
  if(st){
    st.onclick=()=>{
      if(typeof sfxOn==='boolean') sfxOn=!sfxOn;
      masterVolApply();
      try{ sfxUI(); }catch(e){}
      buildSettings();
    };
  }
  /* 触屏布局：进入拖动编辑 / 恢复默认 */
  const tls = document.getElementById('tlStart');
  if(tls) tls.onclick = () => {
    try{ if(typeof tlayEnterFromSettings==='function') tlayEnterFromSettings(); }catch(e){}
  };
  const tlr = document.getElementById('tlReset');
  if(tlr) tlr.onclick = () => {
    try{ if(typeof tlayReset==='function'){ tlayReset(); } }catch(e){}
    try{ sfxUI(); }catch(e){}
    buildSettings();
  };
  /* 键位导出 / 导入 */
  const tlx = document.getElementById('tlExport');
  if(tlx) tlx.onclick = () => {
    try{ if(typeof tlayExport==='function') tlayExport(); }catch(e){}
  };
  const tli = document.getElementById('tlImport');
  if(tli) tli.onclick = () => {
    try{ if(typeof tlayImport==='function') tlayImport(); }catch(e){}
  };
  /* 选文件导入：手机上贴长串 JSON 很痛苦，能挑文件最省事。
     file input 每次 buildSettings 都会重建，所以绑定要放在这里一起重做。 */
  const tlp = document.getElementById('tlPick');
  if(tlp) tlp.onclick = () => {
    try{ if(typeof tlayPickFile==='function') tlayPickFile(); }catch(e){}
  };
  try{ if(typeof tlayBindFile==='function') tlayBindFile(); }catch(e){}
  /* 跑分：先关设置，再开测。不关设置的话遮罩会挡住渲染画面，
     测出来是「页面上盖了一层半透明黑」的成绩，不真实。 */
  const bsb = document.getElementById('benchStartBtn');
  if(bsb) bsb.onclick = () => {
    try{ closeSettings(); }catch(e){}
    try{ if(typeof benchStart==='function') setTimeout(benchStart, 60); }catch(e){}
  };
  const blb = document.getElementById('benchLastBtn');
  if(blb) blb.onclick = () => {
    try{ closeSettings(); }catch(e){}
    try{ if(typeof benchShowResult==='function') setTimeout(benchShowResult, 60); }catch(e){}
  };
  /* 调试日志开关 */
  const lg=el.querySelector('[data-log-toggle]');
  if(lg){
    lg.onclick=()=>{
      logSet(!logOn);
      try{ sfxUI(); }catch(e){}
      buildSettings();
    };
  }
  const lr=document.getElementById('logRefresh');
  if(lr) lr.onclick=()=>{ buildSettings(); };
  const lc=document.getElementById('logClear');
  if(lc) lc.onclick=()=>{ logClear(); buildSettings(); };
  const lcp=document.getElementById('logCopy');
  if(lcp) lcp.onclick=()=>{
    const txt=logText()||T('（暂无日志）');
    copyText(txt);
  };
}

/* 复制文本：先试 navigator.clipboard，不行退回 textarea + execCommand。
   后者在 file:// 下依旧可用，而 clipboard API 需要安全上下文。 */
function copyText(txt){
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){
        try{ toast(T('日志已复制')); }catch(e){}
      }).catch(function(){ legacyCopy(txt); });
      return;
    }
  }catch(e){}
  legacyCopy(txt);
}
function legacyCopy(txt){
  try{
    const ta=document.createElement('textarea');
    ta.value=txt;
    ta.style.cssText='position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    const ok=document.execCommand('copy');
    document.body.removeChild(ta);
    try{ toast(ok?T('日志已复制'):T('复制失败，请手动选择')); }catch(e){}
  }catch(e){
    try{ toast(T('复制失败')); }catch(x){}
  }
}
