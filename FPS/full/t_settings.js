/* ============================================================
   t_settings.js —— 设置面板

   包含四块：
     1) 外观：主题（暗夜 / Material 浅色）
     2) 主题色：512 色网格
     3) 声音：全局音量滑块 + 总开关
     4) 调试：调试日志开关 / 查看 / 复制 / 清空

   结构上和 shop/stash/gunsmith 同构（一个 #settings 全屏浮层），
   但内容全部在这里生成，不往 f_ui.js 里搎。
   ============================================================ */

/* 当前设置页签 */
let setTab = 'look';

function closeSettings(){
  const s=document.getElementById('settings');
  if(s) s.style.display='none';
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
  } else s.style.display='none';
}

function buildSettings(){
  const el=document.getElementById('settings');
  if(!el) return;
  let h='<div class="box" style="max-width:600px">';
  /* 标题行 */
  h+='<div class="row" style="justify-content:space-between;align-items:center;margin:0 0 8px">'
    +'<h1 style="margin:0">⚙️ '+T('设置')+'</h1>'
    +'<button class="btn ghost small" id="setClose">'+T('关闭')+'</button></div>';
  /* 页签 */
  const TABS=[
    {id:'look',  get n(){ return T('外观'); }},
    {id:'color', get n(){ return T('主题色'); }},
    {id:'sound', get n(){ return T('声音'); }},
    {id:'debug', get n(){ return T('调试'); }}
  ];
  h+='<div class="tabs">';
  for(const t of TABS){
    h+='<button class="tab'+(setTab===t.id?' on':'')+'" data-set-tab="'+t.id+'">'+t.n+'</button>';
  }
  h+='</div>';

  /* ---------- 外观 ---------- */
  if(setTab==='look'){
    h+='<div class="d" style="margin:10px 0 6px">'+T('选择界面主题。浅色主题适合白天，暗夜主题对比更强。')+'</div>';
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
