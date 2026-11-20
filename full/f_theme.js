/* ================= 主题系统：原版 / Material You =================
   THEME.style: 'classic'（原版深蓝）+ 'material'（Material Design 3）
   THEME.color: 0..255，从 256 色板里选，Material 模式下用它生成整套色调
   只影响主菜单（.overlay#startScr），游戏内 HUD 保持原样
*/
var THEME_KEY = 'efs_theme_v1';
var THEME = { style:'classic', color: 108 };   /* 108 ≈ 那个熟悉的蓝 */

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
      if(row<2){ sat=0; lig=0.10+row*0.13; }    /* 前两行是灰阶 */
      else {
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
        if(o.style==='material'||o.style==='classic') THEME.style=o.style;
        var c=parseInt(o.color,10);
        if(!isNaN(c) && c>=0 && c<256) THEME.color=c;
      }
    }catch(e){}
  }
  return THEME;
}
function themeSave(){
  var raw=JSON.stringify({style:THEME.style, color:THEME.color});
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
  if(body && body.classList){
    if(mat) body.classList.add('theme-material');
    else body.classList.remove('theme-material');
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
    meta.setAttribute('content', mat ? tok['--m3-surface'] : '#0b0f16');
  }
  /* 同步选中态 */
  themeSyncUI();
}

/* 打开 / 关闭主题面板 */
function themeOpenPanel(){
  var p=document.getElementById('themePanel');
  if(p) p.classList.remove('hidden');
  themeRenderGrid();
  themeSyncUI();
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
  if(nm) nm.textContent = (THEME.style==='material'?'Material':'原版')+' · '+themeColorHex().toUpperCase();
}
function themeSetStyle(s){
  THEME.style = (s==='material')?'material':'classic';
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
