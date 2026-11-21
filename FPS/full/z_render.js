/* ============ z_render.js：渲染循环 + 启动 ============ */

/* 安全调用：单个子系统抛错时只记一次日志，不中断整帧 */
const __errOnce={};
function safeCall(fn,arg){
  if(typeof fn!=='function') return;
  try{ fn(arg); }
  catch(e){
    const k=fn.name||'anon';
    /* 把最后一次错误暴露到调试面板上：
       如果 updP 每帧都抛错，玩家当然一动不动，
       而以前这个异常只在控制台里，屏幕上完全看不出来。 */
    window.__lastErr=k+':'+(e&&e.message?e.message.slice(0,40):'?');
    if(!__errOnce[k]){ __errOnce[k]=true; console.error('['+k+'] 出错（后续同类错误已静音）：',e); }
  }
}

/* ---- 相机抖动 / 后坐力（学自 saltline 的衰减双频正弦） ---- */
const shake={ t:0, power:0, active:false };
function addShake(power){ shake.power=Math.max(shake.power, power); shake.t=0; shake.active=true; }
function updShake(dt){
  if(!shake.active) return 0;
  shake.t+=dt;
  if(shake.t>0.9){ shake.active=false; shake.power=0; return 0; }
  // 衰减包络 × 双频正弦叠加（避免机械感）
  return shake.power*Math.exp(-shake.t*5)*(0.55+0.45*Math.sin(shake.t*47)*Math.sin(shake.t*13+1))*0.04;
}

/* ---- 像素预算制分辨率（学自 saltline：锁像素总数而非固定倍率） ---- */
const PIXEL_BUDGET=2300000; // 约 high 档
let curPixelScale=1;
let curW=0, curH=0;   // 记录上次画布尺寸，用于横竖屏切换时强制重建
function applyPixelBudget(){
  if(typeof renderer==='undefined'||!renderer) return;
  const w=Math.max(2,window.innerWidth), h=Math.max(2,window.innerHeight);
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const pixels=w*dpr*h*dpr;
  let scale=1;
  if(pixels>PIXEL_BUDGET) scale=Math.sqrt(PIXEL_BUDGET/pixels);
  if(Math.abs(scale-curPixelScale)>0.01 || curW!==w || curH!==h){
    curPixelScale=scale; curW=w; curH=h;
    renderer.setPixelRatio(dpr*scale);
    /* 第 3 个参数必须为 true：要同时更新 canvas 的 CSS 尺寸。
       传 false 只改绘制缓冲区，样式尺寸还是旧的，
       移动端高 DPR 下会被拉伸/错位，严重时看起来像整屏发黑。 */
    renderer.setSize(w,h,true);
  }
  /* 【横屏必做】旋转屏幕后宽高比彻底变了，
     这里必须同步更新相机的 aspect 并重算投影矩阵，
     否则画面会被横向或纵向拉伸成变形（看起来很「错位」）。
     原来只在 resize 里调 applyPixelBudget，从没动过 aspect。 */
  if(typeof camera!=='undefined' && camera){
    const ar=w/h;
    if(Math.abs((camera.aspect||0)-ar) > 0.001){
      camera.aspect=ar;
      camera.updateProjectionMatrix();
    }
  }
}

function safeShake(dt){
  try{ return updShake(dt)||0; }catch(e){ return 0; }
}

function animate(){
  requestAnimationFrame(animate);
  if(!ready) return;
  /* 【必须先无条件消费 dt】three 的 Clock 记录「距上次 getDelta 的时间差」。
     暂停时如果跳过这一行，差值会一直累积，恢复瞬间会拿到一个巨大 dt：
     人物瞬移、倒计时一下掉一大截。所以先取出来，再决定用不用。 */
  const rawDt=Math.min(clock.getDelta(),0.05);
  /* 暂停：所有需要推进的子步骤一律用 dt=0（等于冻结），
     但 renderer.render 照常执行 —— 暂停菜单要能看见，
     而且恢复时画面不会黑一帧。 */
  const dt = paused ? 0 : rawDt;
  /* 心跳统计：如果 frames 不涨，说明 animate 根本没在跑
     （WebView 后台、异常中断、或 ready 一直为 false），
     这是「怎么拖都不动」的另一种可能原因，直接显示出来好判断。 */
  window.__frames=(window.__frames||0)+1;
  window.__lastDt=rawDt;
  window.__fps=Math.round(1/Math.max(rawDt,0.001));

  if(!paused){
    /* 每个子系统单独兜底：任何一个抛错都不能拖垮渲染循环，
       否则会出现「场景/枪/人物全黑」这种整屏停摆。 */
    safeCall(updP,dt); safeCall(updFireHold,dt); safeCall(updE,dt); safeCall(updLoot,dt);
    safeCall(updDoors,dt);   // 门：高亮提示 + 开关动画
    /* 篮球：球体物理 + 穿筐判环 + 篮网摆动。
       放在 checkExfil 之前，这样最后一帧的投篮也能正常结算。 */
    safeCall(updBasketball,dt); safeCall(updBasketHint);
    /* 光影：太阳缓动 + 天/雾冷暖 + 点光源傍晚提亮。
       纯 uniform 更新，不掉帧，所以放在主循环每帧调用。 */
    safeCall(updLighting,dt);
    /* 多楼层：判断玩家在不在楼里、靠近哪段楼梯/电梯，并显示提示。
       放在门之后：门提示也写 #doorHint，楼层提示优先级更高（后写覆盖）。 */
    safeCall(updFloors,dt);
    safeCall(checkExfil); safeCall(updAudio,dt); safeCall(updWeapon,dt);
    /* 撤离倒计时：必须在每帧推进，且排在 checkExfil 之后 ——
       这样「刚好在最后一秒跑进撤离点」算成功撤离，而不是被超时抢先判定。 */
    safeCall(updRaidTimer,dt);
    /* 小地图：内部自限 10fps，每帧调用无害。暂停时也冻结，省得地图上
       的敌人点位在暂停面板下面偷偷动。 */
    safeCall(drawMiniMap, performance.now());
  } else {
    /* 暂停期间仍要刷新倒计时读数（它不推进，但显示要保持正确），
       以及 HUD 里那些不依赖时间的部分。 */
    safeCall(updRaidTimer,0);
  }

  // 相机抖动叠加（基准位置由 updP 写入）；暂停时不抖
  if(!paused){
    const sh=safeShake(dt);
    if(sh!==0){
      camera.position.x+=(Math.random()-0.5)*sh;
      camera.position.y+=(Math.random()-0.5)*sh;
    }
  }

  refreshHUD();
  /* 常驻诊断角标：把真实坐标画在屏幕上，不需要点击 */
  /* 渲染放在 try 里：万一某帧的子步骤抛错，
     用纯场景渲染兜底，绝不让画面停在全黑上等下一帧。 */
  try{
    renderer.render(scene,camera);
  }catch(e){
    if(!window.__renderErrShown){ window.__renderErrShown=true; console.error('render error',e); }
  }
}

/* 窗口尺寸 / 横竖屏变化时统一走这里。
   由 f_ui.js 的 bindUI 注册（window.__relayout），
   它会在 resize 与 orientationchange 里被调用，
   而且旋转后会延迟补调几次，确保拿到最终尺寸。
   这里同时重算相机宽高比，否则横屏画面会被拉伸变扁。 */
window.__relayout=function(){
  try{
    applyPixelBudget();
    if(typeof camera!=='undefined' && camera && window.innerWidth && window.innerHeight){
      const ar=window.innerWidth/window.innerHeight;
      if(Math.abs((camera.aspect||0)-ar)>0.001){
        camera.aspect=ar;
        camera.updateProjectionMatrix();
      }
    }
  }catch(e){}
};
window.addEventListener('resize',()=>{ if(typeof window.__relayout==='function') window.__relayout(); });

/* 【国际化】读语言 + 挂切换按钮 + 首次重绘。
   放在这里是刻意的：必须在所有分块都执行完（各 buildXXX 已定义）
   之后才能跑，否则重绘时函数还不存在。
   包 try 是因为即便国际化挂了，游戏本身也得能跑。 */
try{ if(typeof i18nInitUI==='function') i18nInitUI(); }catch(e){ console.error('i18n init failed', e); }

/* 【强制横屏】建遮罩 + 绑定转屏监听。
   同样放最后：orientRefresh 里会调 window.__relayout，
   那是上面刚定义的，必须已存在。 */
try{ if(typeof orientInit==='function') orientInit(); }catch(e){ console.error('orient init failed', e); }
/* 【GM 面板】绑拖动 + 加钱按钮。
   必须放在这里而不是 f_ui.js 的 bindUI 里：bindUI 在脚本执行到
   f_ui.js 时就跑了（那时文档已 ready），而 initGM 定义在后面的
   x_ext.js —— 那一刻还不存在，typeof 检查会静默跳过，
   结果就是「连点 D 15 次面板也不出来，而且没有任何报错」。
   initGM 内部有 dataset.bound 幂等保护，重复调用无害。 */
try{ if(typeof initGM==='function') initGM(); }catch(e){ console.error('GM init failed', e); }
/* 【本地自动存档】读档必须在所有 buildXXX 都已定义之后、渲染循环开始之前：
   否则读到的钱和仓库不会显示在菜单上（菜单是读档前画的）。
   autoSaveLoad 内部对每个字段都做了存在性校验，坏档一律当新档。 */
try{ if(typeof autoSaveLoad==='function') autoSaveLoad(); }catch(e){ console.error('autosave load failed', e); }
/* 【主题 / 色板 / 调试日志初始化】
   必须排在最后：themeInit 会读写 document.documentElement 的 CSS 变量，
   还会去碰 scene.background，所以 scene 必须先建好。
   顺序也重要 —— themeApply 先清 MATERIAL_VARS，accentApply 再把玩家
   选的颜色写回去，反过来的话玩家自定义色会被主题默认值覆盖。 */
try{ if(typeof themeInit==='function') themeInit(); }catch(e){ console.error('theme init failed', e); }
/* 【难度选择渲染】菜单里的四格难度由 v_diff.js 生成。
   必须在 DOM 就绪后跑，但不必等 init()（init 是点「开始」才执行的）。
   放在启动之前，这样主菜单一出现就有难度可选。 */
try{ if(typeof diffInit==='function') diffInit(); }catch(e){ console.error('diff init failed', e); }
/* 【主菜单生涯统计首次填充】打开页面就要显示真实的击杀数/撤离次数，
   不能等打完一局才出现。P.stats 会被存档读回，所以这里直接渲染即可。 */
try{ if(typeof refreshMenuStats==='function') refreshMenuStats(); }catch(e){}
try{ if(typeof fontWarmup==='function') fontWarmup(); }catch(e){}
/* ============ 屏幕诊断条（长按顶栏 2 秒触发）============
   手机上看不到控制台，遇到「按钮点不动/人物悬空」这类问题时
   只能靠猜。这里做一个最小诊断：按住顶栏 2 秒，弹出一个小面板，
   把玩家坐标、帧率、楼层状态、HUD 层级、按钮是否绑上全打出来。
   再点一下关掉。不占屏幕、不影响正常游玩。 */
(function(){
  let timer=null, box=null;
  function kill(){ if(box&&box.parentNode){ box.parentNode.removeChild(box); } box=null; }
  function showDiag(){
    kill();
    const get=(id)=>{ try{ return document.getElementById(id); }catch(e){ return null; } };
    const cs=(el)=>{ try{ return el?getComputedStyle(el):null; }catch(e){ return null; } };
    let txt='';
    try{
      const v3=(typeof P==='object'&&P&&P.pos)?P.pos:null;
      txt+='P.pos = '+(v3? (v3.x.toFixed(2)+', '+v3.y.toFixed(2)+', '+v3.z.toFixed(2)) : '(无)')+'\n';
      txt+='P.eyeH='+((P&&P.eyeH)||0).toFixed(2)+'  onGround='+(P&&P.onGround)+'\n';
      txt+='vel.y = '+((P&&P.vel)?P.vel.y.toFixed(2):'?')+'\n';
      txt+='frames='+(window.__frames||0)+'  fps='+(window.__fps||0)+'\n';
      txt+='ready='+(typeof ready!=='undefined'?ready:'?')+'  inGame='+window.__inGame+'  paused='+(typeof paused!=='undefined'?paused:'?')+'\n';
      txt+='updP='+(typeof updP)+'  moveAndCollide='+(typeof moveAndCollide)+'\n';
      try{ txt+='curFloor='+curFloor+'  inBuilding='+inBuilding+'  floorY='+floorY(curFloor)+'\n'; }catch(e){ txt+='楼层: '+e.message+'\n'; }
    }catch(e){ txt+='取值异常: '+e.message+'\n'; }
    const tb=cs(get('topbar')), vl=cs(get('viewLayer')), hud=cs(get('hud'));
    txt+='--- 层级 ---\n';
    txt+='hud z='+(hud?hud.zIndex:'?')+' pe='+(hud?hud.pointerEvents:'?')+'\n';
    txt+='topbar z='+(tb?tb.zIndex:'?')+' pe='+(tb?tb.pointerEvents:'?')+'\n';
    txt+='viewLayer z='+(vl?vl.zIndex:'?')+' disp='+(vl?vl.display:'?')+'\n';
    const ids=['bagBtn','sndBtn','pauseBtn','medBtn'];
    txt+='--- 按钮 ---\n';
    for(const id of ids){
      const el=get(id);
      if(!el){ txt+=id+': 不存在\n'; continue; }
      const r=el.getBoundingClientRect();
      txt+=id+': bound='+(el.__tapBound?'Y':'N')+' x='+Math.round(r.left)+'..'+Math.round(r.right)+' y='+Math.round(r.top)+'..'+Math.round(r.bottom)+'\n';
    }
    txt+='--- 命中测试 ---\n';
    for(const id of ids){
      const el=get(id); if(!el) continue;
      const r=el.getBoundingClientRect();
      const cx=Math.round((r.left+r.right)/2), cy=Math.round((r.top+r.bottom)/2);
      try{
        const hit=document.elementFromPoint(cx,cy);
        txt+=id+' -> '+(hit? (hit.id||hit.className||hit.tagName) : 'null')+'\n';
      }catch(e){ txt+=id+' 探测失败\n'; }
    }
    const d=document.createElement('div');
    d.style.cssText='position:fixed;left:6px;top:6px;right:6px;max-height:80vh;overflow:auto;z-index:999999;'
      +'background:rgba(0,0,0,.92);color:#7CFC9E;font:11px/1.5 ui-monospace,monospace;'
      +'padding:10px;border-radius:10px;border:1px solid #4caf50;white-space:pre-wrap;';
    d.textContent='📊 诊断（点一下关闭）\n'+txt;
    d.onclick=kill;
    (document.body||document.documentElement).appendChild(d);
    box=d;
  }
  const tb=document.getElementById('topbar');
  if(tb && !tb.__diagBound){
    tb.__diagBound=true;
    tb.addEventListener('touchstart', ()=>{ timer=setTimeout(showDiag, 2000); }, {passive:true});
    const clr=()=>{ if(timer){ clearTimeout(timer); timer=null; } };
    tb.addEventListener('touchend', clr, {passive:true});
    tb.addEventListener('touchmove', clr, {passive:true});
    tb.addEventListener('touchcancel', clr, {passive:true});
  }
})();

/* 【已移除】常驻诊断角标
   左下角那个绿框（y= / cam= / inB= / fl= / vis=）是之前排查
   「人物站在天上、楼层显隐不对」时加的临时调试显示，
   那个问题已经解决，它就不该再出现在玩家画面上了。
   原始实现保留在 git 历史里（提交 d9dd821 及之前），需要时能找回。 */

// 启动：渲染循环立即开始（init 成功后 ready=true 才会真正渲染）
requestAnimationFrame(animate);