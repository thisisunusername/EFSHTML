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
  const dt=Math.min(clock.getDelta(),0.05);
  /* 心跳统计：如果 frames 不涨，说明 animate 根本没在跑
     （WebView 后台、异常中断、或 ready 一直为 false），
     这是「怎么拖都不动」的另一种可能原因，直接显示出来好判断。 */
  window.__frames=(window.__frames||0)+1;
  window.__lastDt=dt;
  window.__fps=Math.round(1/Math.max(dt,0.001));

  /* 每个子系统单独兜底：任何一个抛错都不能拖垮渲染循环，
     否则会出现「场景/枪/人物全黑」这种整屏停摆。 */
  safeCall(updP,dt); safeCall(updE,dt); safeCall(updLoot,dt);
  safeCall(checkExfil); safeCall(updAudio,dt); safeCall(updWeapon,dt);

  // 相机抖动叠加（基准位置由 updP 写入）
  const sh=safeShake(dt);
  if(sh!==0){
    camera.position.x+=(Math.random()-0.5)*sh;
    camera.position.y+=(Math.random()-0.5)*sh;
  }

  refreshHUD();
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

// 启动：渲染循环立即开始（init 成功后 ready=true 才会真正渲染）
requestAnimationFrame(animate);