/* ================= 主题系统：原版 / Material You =================
   THEME.style: 'classic'（原版深蓝）+ 'material'（Material Design 3）
   THEME.color: 0..255，从 256 色板里选，Material 模式下用它生成整套色调
   只影响主菜单（.overlay#startScr），游戏内 HUD 保持原样
*/
var THEME_KEY = 'efs_theme_v1';
var THEME = { style:'classic', color: 108, custom:false };   /* 108 ≈ 那个熟悉的蓝 */

var THEME_PALETTE = null;   /* 256 色，惰性生成 */

/* HCT 简化版：把种子色转成 M3 的 tonal palette（明度分档） */
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
/* 色调值 token → 颜色。chroma 控制偏离灰色的程度（灰阶种子自动降饱和） */
function themeTone(hue, sat, tone, chromaScale){
  var s = sat * (chromaScale==null?1:chromaScale);
  if(s < 0.06) s = 0.06;
  /* tone 0..100 → HSL 亮度，暗端收得比线性更快，接近 M3 实际观感 */
  var l = tone/100;
  if(l < 0.5) l = l*0.86;
  return themeHsl(hue, s, l);
}

/* 生成整套 M3 颜色变量 */
function themeBuildTokens(hex){
  var h = themeHue(hex);
  var s = themeSat(hex);
  var neutralSat = Math.min(s, 0.16);      /* 表面色用极低饱和的同色相 */
  var t = {};
  t['--m3-primary']            = themeTone(h, s, 80, 1);
  t['--m3-on-primary']         = themeTone(h, s, 20, 1.2);
  t['--m3-primary-container']  = themeTone(h, s, 30, 1);
  t['--m3-on-primary-container']= themeTone(h, s, 90, 0.7);
  t['--m3-secondary']          = themeTone(h, s*0.55, 80, 1);
  t['--m3-on-secondary']       = themeTone(h, s*0.55, 20, 1);
  t['--m3-tertiary']           = themeTone(h+60, s*0.8, 80, 1);
  t['--m3-surface']            = themeTone(h, neutralSat, 6, 1);
  t['--m3-surface-1']          = themeTone(h, neutralSat, 10, 1);
  t['--m3-surface-2']          = themeTone(h, neutralSat, 14, 1);
  t['--m3-surface-3']          = themeTone(h, neutralSat, 18, 1);
  t['--m3-on-surface']         = themeTone(h, neutralSat, 92, 0.5);
  t['--m3-on-surface-var']     = themeTone(h, neutralSat, 70, 0.5);
  t['--m3-outline']            = themeTone(h, neutralSat, 45, 0.8);
  t['--m3-outline-var']        = themeTone(h, neutralSat, 28, 0.8);
  t['--m3-error']              = '#f2b8b5';
  t['--m3-on-error']           = '#601410';
  t['--m3-error-container']    = '#8c1d18';
  t['--m3-success']            = themeTone(h+120, 0.45, 78, 1);
  t['--m3-seed']               = hex;
  return t;
}

/* 256 色板：16×16。色相绕一圈，饱和/亮度分档 */
function themePalette(){
  if(THEME_PALETTE) return THEME_PALETTE;
  var arr=[];
  /* 按 16 个色相列、16 个明度行排：方便手机上一眼扫到喜欢的颜色 */
  for(var row=0; row<16; row++){
    for(var col=0; col<16; col++){
      var hue = col*22.5;                       /* 0..360 一圈 */
      var tv  = row/15;                         /* 0..1 明度梯度 */
      var sat, lig;
      if(row===0){
        /* 第 0 行：完整中性灰阶，从左到右纯黑 → 纯白（col=15 就是 #ffffff） */
        sat = 0; lig = col/15;
      } else if(row===1){
        sat = 0; lig = 0.10 + (col/15)*0.55;    /* 第 1 行：暗部灰阶，补中间调 */
      } else {
        sat = Math.min(1, 0.30 + (row-2)/13*0.65);
        lig = 0.78 - (row-2)/13*0.52;
      }
      arr.push({ hex: themeHsl(hue, sat, lig), hue: hue, row: row, col: col });
    }
  }
  THEME_PALETTE = arr;
  return arr;
}

/* 读写 */
function themeLoad(){
  var raw=null;
  try{ raw=localStorage.getItem(THEME_KEY); }catch(e){}
  if(!raw) raw=readCookie(THEME_KEY);
  if(raw){
    try{
      var o=JSON.parse(raw);
      if(o){
        if(o.style==='material'||o.style==='classic'||o.style==='terminal') THEME.style=o.style;
        var c=parseInt(o.color,10);
        if(!isNaN(c) && c>=0 && c<256) THEME.color=c;
        THEME.custom=!!o.custom;
      }
    }catch(e){}
  }
  if(THEME.custom){ try{ customLoad(); }catch(e){} }
  return THEME;
}
function themeSave(){
  var raw=JSON.stringify({style:THEME.style, color:THEME.color, custom:!!THEME.custom});
  try{ localStorage.setItem(THEME_KEY, raw); }catch(e){}
  writeCookie(THEME_KEY, raw, 3650);
}
/* 当前选中色的十六进制 */
function themeColorHex(){
  var p=themePalette();
  var i=THEME.color;
  if(isNaN(i) || i<0 || i>=p.length) i=108;
  return p[i].hex;
}

/* 把主题作用到 DOM */
function themeApply(){
  if(typeof document==='undefined') return;
  var body=document.body;
  var root=document.documentElement;
  var mat = (THEME.style==='material');
  var trm = (THEME.style==='terminal');
  if(body && body.classList){
    if(mat) body.classList.add('theme-material');
    else body.classList.remove('theme-material');
    if(trm) body.classList.add('theme-terminal');
    else body.classList.remove('theme-terminal');
  }
  /* 生成并注入 Material 变量 */
  var hex=themeColorHex();
  var tok=themeBuildTokens(hex);
  var target=root && root.style ? root.style : (body && body.style ? body.style : null);
  if(target && target.setProperty){
    for(var k in tok) target.setProperty(k, tok[k]);
  }
  /* 浏览器地址栏配色也跟着走 */
  var meta=document.querySelector? document.querySelector('meta[name="theme-color"]') : null;
  if(meta && meta.setAttribute){
    meta.setAttribute('content', (mat||trm) ? tok['--m3-surface'] : '#0b0f16');
  }
  /* 自定义主题变量注入 */
  if(typeof customApply==='function') customApply();
  /* 同步选中态 */
  themeSyncUI();
}

/* 打开 / 关闭主题面板 */
function themeOpenPanel(){
  var p=document.getElementById('themePanel');
  if(p) p.classList.remove('hidden');
  if(!CUSTOM_THEME) customLoad();
  themeRenderGrid();
  themeSyncUI();
  customRenderUI();
}
function themeClosePanel(){
  var p=document.getElementById('themePanel');
  if(p) p.classList.add('hidden');
}
/* 渲染 256 色格 */
function themeRenderGrid(){
  var g=document.getElementById('themeGrid');
  if(!g) return;
  var pal=themePalette();
  var html='';
  for(var i=0;i<pal.length;i++){
    var on=(i===THEME.color)?' sel':'';
    html+='<button class="tsw'+on+'" data-ti="'+i+'" style="background:'+pal[i].hex+'"></button>';
  }
  g.innerHTML=html;
}
/* 同步风格胶囊 + 色格高亮 + 预览条 */
function themeSyncUI(){
  var st=document.getElementById('themeStyles');
  if(st && st.querySelectorAll){
    var bs=st.querySelectorAll('.tsty');
    for(var i=0;i<bs.length;i++){
      var isOn=(bs[i].getAttribute('data-ts')===THEME.style);
      if(isOn) bs[i].classList.add('on');
      else bs[i].classList.remove('on');
    }
  }
  var g=document.getElementById('themeGrid');
  if(g && g.querySelectorAll){
    var sw=g.querySelectorAll('.tsw');
    for(var j=0;j<sw.length;j++){
      var on=(parseInt(sw[j].getAttribute('data-ti'),10)===THEME.color);
      if(on) sw[j].classList.add('sel');
      else sw[j].classList.remove('sel');
    }
  }
  var pv=document.getElementById('themePreview');
  if(pv && pv.style){
    pv.style.background=themeColorHex();
  }
  var nm=document.getElementById('themeNowName');
  if(nm) nm.textContent = themeStyleName()+' · '+themeColorHex().toUpperCase();
}
function themeStyleName(){
  if(THEME.style==='material') return 'Material';
  if(THEME.style==='terminal') return '终端';
  return '原版';
}
function themeSetStyle(s){
  THEME.style = (s==='material')?'material':((s==='terminal')?'terminal':'classic');
  themeSave();
  themeApply();
}
function themeSetColor(i){
  i=parseInt(i,10);
  if(isNaN(i) || i<0 || i>=256) return;
  THEME.color=i;
  themeSave();
  themeApply();
}
/* 恢复默认：原版 + 蓝 */
function themeReset(){
  THEME.style='classic';
  THEME.color=108;
  themeSave();
  themeApply();
  toast('已恢复默认主题');
}

/* 绑定主题面板的交互 */
function themeBind(){
  var open=document.getElementById('themeBtn');
  if(open) open.addEventListener('click',function(e){
    if(e && e.stopPropagation) e.stopPropagation();
    themeOpenPanel();
  });
  var cl=document.getElementById('themeClose');
  if(cl) cl.addEventListener('click',function(){ themeClosePanel(); });
  var rs=document.getElementById('themeReset');
  if(rs) rs.addEventListener('click',function(){ themeReset(); });

  var st=document.getElementById('themeStyles');
  if(st){
    var bs=st.querySelectorAll('.tsty');
    for(var i=0;i<bs.length;i++){
      (function(b){
        b.addEventListener('click',function(){
          themeSetStyle(b.getAttribute('data-ts'));
        });
      })(bs[i]);
    }
  }
  var g=document.getElementById('themeGrid');
  if(g) g.addEventListener('click',function(e){
    var t=e.target||e.srcElement;
    while(t && t!==g){
      if(t.getAttribute && t.getAttribute('data-ti')!==null && t.getAttribute('data-ti')!==''){
        themeSetColor(t.getAttribute('data-ti'));
        return;
      }
      t=t.parentNode;
    }
  });
}

/* ================= 地图调色板 =================
   经典模式用原来那套深蓝灰；Material 模式下由同一个种子色派生，
   保证地图和主菜单是同一套色相。
   注意：物件（门/灯/监控）的颜色承载玩法语义，这里只改底子，
   不动那些语义色，避免玩家看不懂哪扇门对应哪把钥匙。
*/
function themeMapColors(){
  if(THEME.style !== 'material' && THEME.style !== 'terminal'){
    return {
      m3:false,
      bg0:'#16222b', bg1:'#111a21', bg2:'#0b1216',
      floorA:'#243139', floorB:'#202c34',
      wallA:'#37505f', wallB:'#2e4553',
      grid:'rgba(120,180,235,.13)', wallEdge:'rgba(150,200,240,.13)',
      roomClass:'rgba(60,160,255,.11)', roomToilet:'rgba(80,220,180,.10)', roomOther:'rgba(120,160,220,.05)',
      roomLabel:'rgba(200,225,255,.30)',
      border:'rgba(90,170,235,.18)'
    };
  }
  /* ===== 终端：绿色磷光栅格，硬边界、无色相派生 ===== */
  if(THEME.style === 'terminal'){
    return {
      m3:false, trm:true,
      bg0:'#000000', bg1:'#000000', bg2:'#000000',
      floorA:'#04140a', floorB:'#030f07',
      wallA:'#0f4a26', wallB:'#0b3a1e',
      grid:'rgba(94,255,143,0.10)', wallEdge:'rgba(94,255,143,0.16)',
      roomClass:'rgba(94,255,143,0.10)', roomToilet:'rgba(94,255,143,0.07)', roomOther:'rgba(94,255,143,0.03)',
      roomLabel:'rgba(94,255,143,0.45)',
      border:'rgba(31,122,63,0.55)'
    };
  }
  var seed = themeColorHex();
  var h = themeHue(seed), s = themeSat(seed);
  var ns = Math.min(s, 0.16);
  var ha = h + 60;
  function rgba(hex, a){
    var c = themeHexToRgb(hex);
    return 'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';
  }
  return {
    m3:true,
    bg0:themeTone(h, ns, 12, 1),
    bg1:themeTone(h, ns, 8, 1),
    bg2:themeTone(h, ns, 4, 1),
    floorA:themeTone(ha, ns+0.05, 16, 1),
    floorB:themeTone(ha, ns+0.05, 13, 1),
    wallA:themeTone(h, Math.min(s,0.22), 30, 1),
    wallB:themeTone(h, Math.min(s,0.22), 25, 1),
    grid:rgba(themeTone(h, s, 70, 1), 0.10),
    wallEdge:rgba(themeTone(h, s, 78, 1), 0.12),
    roomClass:rgba(themeTone(h+200, 0.6, 70, 1), 0.10),
    roomToilet:rgba(themeTone(h+140, 0.5, 70, 1), 0.09),
    roomOther:rgba(themeTone(h, 0.4, 70, 1), 0.04),
    roomLabel:rgba(themeTone(h, ns, 88, 1), 0.34),
    border:rgba(themeTone(h, s, 70, 1), 0.18)
  };
}

/* ================= 通用 UI 调色板（成就/排行榜/商店等面板共用） =================
   面板里很多颜色写在 JS 内联 style 里，CSS 覆盖不了，所以统一从这里取。
   经典分支返回与原版完全一致的硬编码色；Material 分支由种子色派生。
*/
function themeUiColors(){
  if(typeof THEME==='undefined' || (THEME.style!=='material' && THEME.style!=='terminal')){
    return {
      m3:false,
      title:'#9fe6ff',      /* 面板标题 */
      text:'#e8f2ff',       /* 正文 */
      sub:'#8ea6c2',        /* 说明/次要文字 */
      dim:'#6f8298',        /* 更弱的文字 */
      faint:'#4b5a68',      /* 最弱（未解锁标签） */
      accent:'#8fd0ff',     /* 强调（名次等） */
      gold:'#fbbf24',       /* 成绩/星级 */
      warn:'#ff8095',       /* 警告文字 */
      line:'rgba(120,160,220,.12)', /* 分隔线 */
      rowBg:'rgba(24,34,48,.9)',
      rowGot:'rgba(30,44,62,.95)',
      rowBorder:'rgba(120,160,220,.16)',
      rowGotBorder:'rgba(140,190,250,.32)',
      dotOff:'rgba(120,140,160,.25)'
    };
  }
  var hex=themeColorHex();
  var h=themeHue(hex), s=themeSat(hex);
  /* ===== 终端：磷光绿 CRT，零圆角硬框，颜色固定不随色轮走 ===== */
  if(THEME.style==='terminal'){
    return {
      m3:false, trm:true,
      title:'#5eff8f', text:'#3fb865', sub:'#35a058', dim:'#2b7d45', faint:'#1c5a30',
      accent:'#5eff8f', gold:'#ffd75e', warn:'#ff6b6b',
      line:'rgba(94,255,143,0.16)',
      rowBg:'#000000', rowGot:'#04180a',
      rowBorder:'#14532b', rowGotBorder:'#1f7a3f',
      dotOff:'rgba(43,125,69,0.35)'
    };
  }
  var ns=Math.min(s, 0.16);
  /* 种子接近灰色时，强调色会失去区分度，抬一个保底饱和度 */
  var as=Math.max(s, 0.42);
  var rgba=function(hx, a){
    var v=themeHexToRgb(hx);
    return 'rgba('+v[0]+','+v[1]+','+v[2]+','+a+')';
  };
  return {
    m3:true,
    title:themeTone(h, Math.min(as,0.34), 88, 1),
    text:themeTone(h, ns, 92, 1),
    sub:themeTone(h, ns, 72, 1),
    dim:themeTone(h, ns, 58, 1),
    faint:themeTone(h, ns, 44, 1),
    accent:themeTone(h, Math.min(as,0.50), 80, 1),
    gold:themeTone(h+40, Math.min(Math.max(s,0.50),0.62), 78, 1),
    warn:themeTone(h-150, Math.min(Math.max(s,0.45),0.6), 76, 1),
    line:rgba(themeTone(h, ns, 60, 1), 0.16),
    rowBg:rgba(themeTone(h, ns, 14, 1), 0.92),
    rowGot:rgba(themeTone(h, ns, 20, 1), 0.95),
    rowBorder:rgba(themeTone(h, ns, 55, 1), 0.20),
    rowGotBorder:rgba(themeTone(h, Math.min(as,0.35), 70, 1), 0.42),
    dotOff:rgba(themeTone(h, ns, 55, 1), 0.28)
  };
}
/* ================= 自定义主题 =================
   允许用户自定义主界面各项颜色，并可导出/导入/复制配置。
   配置结构：{ v:1, name:'', ui:{ bg, card, text, title, sub, accent, line, btn, btnText } }
*/
var CUSTOM_KEY = 'efs_custom_theme_v1';
var CUSTOM_THEME = null;
var CUSTOM_FIELDS = [
  { k:'bg',      n:'背景',     d:'#0e1519' },
  { k:'card',    n:'卡片底',   d:'#131c26' },
  { k:'text',    n:'正文',     d:'#e8eef7' },
  { k:'title',   n:'标题',     d:'#ffffff' },
  { k:'sub',     n:'次要文字', d:'#8ea6c2' },
  { k:'accent',  n:'强调色',   d:'#5b8def' },
  { k:'line',    n:'描边',     d:'#2a3a4d' },
  { k:'btn',     n:'按钮底',   d:'#1e2c42' },
  { k:'btnText', n:'按钮字',   d:'#dceaff' }
];
function customDefaults(){
  var o={ v:1, name:'我的主题', ui:{} };
  for(var i=0;i<CUSTOM_FIELDS.length;i++) o.ui[CUSTOM_FIELDS[i].k]=CUSTOM_FIELDS[i].d;
  return o;
}
function customNormHex(v){
  if(v===null || v===undefined) return null;
  var s=String(v).trim();
  if(!s) return null;
  if(s.charAt(0)!=='#') s='#'+s;
  if(/^#[0-9a-fA-F]{3}$/.test(s)){
    s='#'+s.charAt(1)+s.charAt(1)+s.charAt(2)+s.charAt(2)+s.charAt(3)+s.charAt(3);
  }
  if(!/^#[0-9a-fA-F]{6}$/.test(s)) return null;
  return s.toLowerCase();
}

function customLoad(){
  var raw=null;
  try{ raw=localStorage.getItem(CUSTOM_KEY); }catch(e){}
  if(!raw) raw=readCookie(CUSTOM_KEY);
  if(!raw){ CUSTOM_THEME=null; return null; }
  CUSTOM_THEME=customParse(raw);
  return CUSTOM_THEME;
}
function customSave(){
  if(!CUSTOM_THEME) return;
  var raw=JSON.stringify(CUSTOM_THEME);
  try{ localStorage.setItem(CUSTOM_KEY, raw); }catch(e){}
  writeCookie(CUSTOM_KEY, raw, 3650);
}
function customParse(raw){
  var o=null;
  try{ o=(typeof raw==='string')? JSON.parse(raw) : raw; }catch(e){ return null; }
  if(!o || typeof o!=='object') return null;
  var base=customDefaults();
  var out={ v:1, name:String(o.name||base.name).slice(0,32), ui:{} };
  var src=o.ui||o;
  for(var i=0;i<CUSTOM_FIELDS.length;i++){
    var f=CUSTOM_FIELDS[i];
    var v=customNormHex(src[f.k]);
    out.ui[f.k]= v||base.ui[f.k];
  }
  return out;
}
function customGet(){
  if(!CUSTOM_THEME) CUSTOM_THEME=customDefaults();
  return CUSTOM_THEME;
}
function customSerialize(pretty){
  var o=customGet();
  return pretty? JSON.stringify(o,null,2) : JSON.stringify(o);
}
function customSetField(k,v){
  var h=customNormHex(v);
  if(!h) return false;
  for(var i=0;i<CUSTOM_FIELDS.length;i++){
    if(CUSTOM_FIELDS[i].k===k){ customGet().ui[k]=h; customSave(); customApply(); return true; }
  }
  return false;
}

/* 把自定义色注入为 CSS 变量；关掉时清空 */
function customApply(){
  if(typeof document==='undefined') return;
  var root=document.documentElement;
  if(!root || !root.style || !root.style.setProperty) return;
  var on=!!(THEME.custom && CUSTOM_THEME);
  if(on){
    var ui=customGet().ui;
    root.style.setProperty('--cf-bg', ui.bg);
    root.style.setProperty('--cf-card', ui.card);
    root.style.setProperty('--cf-text', ui.text);
    root.style.setProperty('--cf-title', ui.title);
    root.style.setProperty('--cf-sub', ui.sub);
    root.style.setProperty('--cf-accent', ui.accent);
    root.style.setProperty('--cf-line', ui.line);
    root.style.setProperty('--cf-btn', ui.btn);
    root.style.setProperty('--cf-btnText', ui.btnText);
  }
  var body=document.body;
  if(body && body.classList){
    if(on) body.classList.add('theme-custom');
    else body.classList.remove('theme-custom');
  }
}
function customEnable(on){
  THEME.custom=!!on;
  if(on && !CUSTOM_THEME) CUSTOM_THEME=customDefaults();
  themeSave();
  themeApply();
  customRenderUI();
}
function customReset(){
  CUSTOM_THEME=customDefaults();
  customSave();
  customApply();
  customRenderUI();
  toast('已恢复自定义主题默认值');
}

function customRenderUI(){
  var box=document.getElementById('custBox');
  if(!box) return;
  var o=customGet();
  var html='';
  html+='<div class="tlabel">自定义主题</div>';
  html+='<div class="custRow"><label class="custSw"><input type="checkbox" id="custOn"'+(THEME.custom?' checked':'')+'> 启用自定义主题</label></div>';
  for(var i=0;i<CUSTOM_FIELDS.length;i++){
    var f=CUSTOM_FIELDS[i];
    html+='<div class="custRow">'+
      '<span class="custName">'+f.n+'</span>'+
      '<input type="color" class="custPick" id="cust_'+f.k+'" value="'+o.ui[f.k]+'">'+
      '<input type="text" class="custHex" id="custHex_'+f.k+'" value="'+o.ui[f.k]+'" maxlength="7" spellcheck="false">'+
      '</div>';
  }
  html+='<div class="custRow"><span class="custName">预设</span><div class="custPresets">';
  html+='<button data-cp="dark">深色</button>';
  html+='<button data-cp="light">浅色</button>';
  html+='<button data-cp="green">终端绿</button>';
  html+='<button data-cp="sunset">暖橙</button>';
  html+='</div></div>';
  html+='<div class="custRow">'+
    '<button id="custCopy">复制配置</button>'+
    '<button id="custExport">导出文件</button>'+
    '<button id="custImport">导入</button>'+
    '<button id="custReset2" class="danger">重置</button></div>';
  html+='<textarea id="custIOText" class="custIO" placeholder="点「复制配置」会把 JSON 放这里；也可以粘贴别人的配置后点「导入」"></textarea>';
  box.innerHTML=html;
  customBindUI();
}

var CUSTOM_PRESETS = {
  dark:   { bg:'#0e1519', card:'#131c26', text:'#e8eef7', title:'#ffffff', sub:'#8ea6c2', accent:'#5b8def', line:'#2a3a4d', btn:'#1e2c42', btnText:'#dceaff' },
  light:  { bg:'#f2f4f8', card:'#ffffff', text:'#1b2430', title:'#0c1219', sub:'#5b6b7f', accent:'#2f6fe0', line:'#d3dae6', btn:'#e4eaf4', btnText:'#1b2430' },
  green:  { bg:'#04140a', card:'#071f10', text:'#5eff8f', title:'#a8ffc4', sub:'#3fb865', accent:'#5eff8f', line:'#1f7a3f', btn:'#0a2114', btnText:'#5eff8f' },
  sunset: { bg:'#1a0f0a', card:'#241509', text:'#ffe8d6', title:'#ffd7a8', sub:'#c9a184', accent:'#ff8a3d', line:'#5a3520', btn:'#331d0f', btnText:'#ffd7a8' }
};
function customPreset(name){
  var p=CUSTOM_PRESETS[name];
  if(!p) return false;
  var o=customGet();
  for(var i=0;i<CUSTOM_FIELDS.length;i++){
    var k=CUSTOM_FIELDS[i].k;
    if(p[k]) o.ui[k]=p[k];
  }
  o.name='预设 · '+name;
  customSave(); customApply(); customRenderUI();
  toast('已套用预设：'+name);
  return true;
}
function customBindUI(){
  var on=document.getElementById('custOn');
  if(on) on.onchange=function(){ customEnable(!!this.checked); };
  for(var i=0;i<CUSTOM_FIELDS.length;i++){
    (function(f){
      var pk=document.getElementById('cust_'+f.k);
      var hx=document.getElementById('custHex_'+f.k);
      if(pk) pk.oninput=function(){
        customSetField(f.k, this.value);
        if(hx) hx.value=customGet().ui[f.k];
        customRefreshSwatches();
      };
      if(hx) hx.onchange=function(){
        if(customSetField(f.k, this.value)){
          if(pk) pk.value=customGet().ui[f.k];
          this.value=customGet().ui[f.k];
          customRefreshSwatches();
        } else { this.value=customGet().ui[f.k]; toast('颜色格式不对，用 #RRGGBB'); }
      };
    })(CUSTOM_FIELDS[i]);
  }
  /* 字体族 */
  var fbs=document.querySelectorAll('#custBox .custFonts button');
  for(var fi=0;fi<fbs.length;fi++){
    (function(b){ b.onclick=function(){ customSetFont('family', b.getAttribute('data-cft')); }; })(fbs[fi]);
  }
  /* 字号滑块 */
  var sizeKeys=['title','body','btn'];
  for(var si=0;si<sizeKeys.length;si++){
    (function(sk){
      var rg=document.getElementById('custFs_'+sk);
      var vl=document.getElementById('custFv_'+sk);
      if(rg) rg.oninput=function(){ customSetFont(sk, this.value); if(vl) vl.textContent=customGet().font[sk]; };
    })(sizeKeys[si]);
  }
  /* 预设 */
  var ps=document.querySelectorAll('#custBox .custPresets button');
  for(var j=0;j<ps.length;j++){
    (function(b){ b.onclick=function(){ customPreset(b.getAttribute('data-cp')); }; })(ps[j]);
  }
  var cp=document.getElementById('custCopy');
  if(cp) cp.onclick=function(){ customCopyConfig(); };
  var ex=document.getElementById('custExport');
  if(ex) ex.onclick=function(){ customExportFile(); };
  var im=document.getElementById('custImport');
  if(im) im.onclick=function(){ customImportText(); };
  var rs=document.getElementById('custReset2');
  if(rs) rs.onclick=function(){ customReset(); };

  // 通用：点击行文字框兜底聚焦（避免 touch-action:none 干扰）
  var custInputs=box.querySelectorAll('input[type=text],input[type=color],textarea');
  custInputs.forEach(function(inp){
    inp.addEventListener('touchstart',function(e){
      // 不 preventDefault，只延迟聚焦
      setTimeout(function(){ inp.focus(); },0);
    },{passive:true});
    inp.addEventListener('pointerdown',function(e){
      setTimeout(function(){ inp.focus(); },0);
    },{passive:true});
  });
}
function customRefreshSwatches(){ customApply(); }