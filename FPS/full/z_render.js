/* ============ z_render.js：渲染循环 + 启动 ============ */

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
function applyPixelBudget(){
  if(typeof renderer==='undefined'||!renderer) return;
  const w=Math.max(2,window.innerWidth), h=Math.max(2,window.innerHeight);
  const dpr=Math.min(window.devicePixelRatio||1,2);
  const pixels=w*dpr*h*dpr;
  let scale=1;
  if(pixels>PIXEL_BUDGET) scale=Math.sqrt(PIXEL_BUDGET/pixels);
  if(Math.abs(scale-curPixelScale)>0.01){
    curPixelScale=scale;
    renderer.setPixelRatio(dpr*scale);
    renderer.setSize(w,h,false);
  }
}

function animate(){
  requestAnimationFrame(animate);
  if(!ready) return;
  const dt=Math.min(clock.getDelta(),0.05);

  updP(dt);
  updE(dt);
  updLoot(dt);
  checkExfil();
  updAudio(dt);
  updWeapon(dt);

  // 相机抖动叠加（基准位置由 updP 写入）
  const sh=updShake(dt);
  if(sh!==0){
    camera.position.x+=(Math.random()-0.5)*sh;
    camera.position.y+=(Math.random()-0.5)*sh;
  }

  refreshHUD();
  renderer.render(scene,camera);
}

// 窗口尺寸变化时重算像素预算
window.addEventListener('resize',()=>{ if(ready) applyPixelBudget(); });

// 启动：渲染循环立即开始（init 成功后 ready=true 才会真正渲染）
requestAnimationFrame(animate);