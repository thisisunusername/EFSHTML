/* ============ c_player.js：玩家对象 + 移动/碰撞/视角 ============ */
const P={
  pos:new THREE.Vector3(0,1.6,5),
  vel:new THREE.Vector3(),
  yaw:0, pitch:0,
  hp:100, armor:0,
  ammo:{ammo:90,med:0,cash:0,gun:120},
  inv:{gun:true,med:0},
  speed:6, sprint:10,
  onGround:true,
  shooting:false, reload:false, reloadT:0,
  shootCd:0, sprinting:false, joyX:0, joyY:0, alive:true,
  aiming:false,    /* 开镜状态（按住开镜键） */
  aimT:0,          /* 开镜过渡插值 0~1，用于平滑 FOV */
  keys:{},
};
const LOCK_TURN=false; // 手机端陀螺仪可后续接入

function lookAtYawPitch(){
  camera.rotation.order='YXZ';
  camera.rotation.y=P.yaw;
  camera.rotation.x=P.pitch;
}
function setView(y,p){
  P.yaw=y; P.pitch=p;
  const lim=1.45; if(P.pitch>lim)P.pitch=lim; if(P.pitch<-lim)P.pitch=-lim;
  lookAtYawPitch();
}
function lookDir(){
  const v=new THREE.Vector3(0,0,-1);
  v.applyEuler(new THREE.Euler(P.pitch,P.yaw,0,'YXZ'));
  return v;
}

/* ---- 跳跃（只能在落地时跳，防止二段跳） ---- */
function doJump(){
  if(!P.alive) return;
  if(!P.onGround) return;   // 空中不能跳
  P.vel.y=7;
  P.onGround=false;
  sfxStep();
}

/* ---- 玩家移动（重力 + 键盘/摇杆输入） ---- */
function updP(dt){
  // 鼠标/触控视角在 e_io/e_ui 里通过 pointer 事件直接改 P.yaw/P.pitch
  const f=P.keys['KeyW'], b=P.keys['KeyS'], l=P.keys['KeyA'], r=P.keys['KeyD'];
  const sprint=P.keys['ShiftLeft']||P.keys['ShiftRight']||P.sprinting;
  const spd=sprint?P.sprint:P.speed;

  let mx=0,mz=0;
  if(f)mz-=1; if(b)mz+=1; if(l)mx-=1; if(r)mx+=1;
  // 虚拟摇杆输入（移动端，挂在 P 上避免跨模块变量问题）
  if(P.joyX||P.joyY){
    mx=P.joyX; mz=P.joyY;
  }
  /* 【双保险】直接读取 joyZone 上正在生效的触点。
     某些 Android WebView 里 pointermove 的 pointerId 与 pointerdown 不一致，
     导致 P.joyX 永远是 0、怎么拖都不动。这里绕过 pointerId 匹配，
     直接问浏览器「左半屏现在有几个手指按着、在哪」，
     只要发现按下点与当前点的位移，就照样驱动移动，不依赖事件配对。 */
  if(!mx && !mz && window.__joyTouch && window.__joyTouch.active){
    const t=window.__joyTouch;
    let dx=t.cx-t.sx, dy=t.cy-t.sy;
    const max=48, d=Math.hypot(dx,dy);
    if(d>6){
      if(d>max){ dx*=max/d; dy*=max/d; }
      mx=dx/max; mz=dy/max;
      P.joyX=mx; P.joyY=mz;
    }
  }

  /* 开镜：按住开镜键时 FOV 收紧，松开还原。
     aimT 是平滑插值，避免瞬间跳变导致眩晕。 */
  const aimTarget = P.aiming && P.onGround ? 1 : 0;
  P.aimT += (aimTarget - P.aimT) * Math.min(1, dt*12);
  if(camera){
    const baseFov = P.sprinting ? 78 : 75;
    camera.fov = baseFov - 28*P.aimT;   // 75 -> 47
    camera.updateProjectionMatrix();
  }

  // 相对 yaw 的方向
  const sin=Math.sin(P.yaw), cos=Math.cos(P.yaw);
  // 前进方向：世界 -z 旋转 yaw
  const fwdX=-sin, fwdZ=-cos;
  const rightX=cos, rightZ=-sin;
  const wx=fwdX*mz + rightX*mx;
  const wz=fwdZ*mz + rightZ*mx;
  const len=Math.hypot(wx,wz);
  if(len>0){
    wx/=len; wz/=len;
    P.vel.x=wx*spd;
    P.vel.z=wz*spd;
  }else{
    P.vel.x*=0.8; P.vel.z*=0.8;
  }

  // 重力
  P.vel.y-=22*dt;

  // 移动 + 碰撞（简单的 AABB 在地面的检测）
  moveAndCollide(dt);

  // 玩家朝向跟随视角
  camera.position.set(P.pos.x,P.pos.y,P.pos.z);
  lookAtYawPitch();

  /* 调试：把摇杆活值和速度显示在 HUD 上，直接看数据而不是猜。
     位置固定右下角，字体很小，不影响游戏。 */
  if(!window.__dbgEl){
    const d=document.createElement('div');
    d.id='__dbg';
    d.style.cssText='position:fixed;left:50%;top:6px;transform:translateX(-50%);z-index:99999;color:#00ff88;font:bold 12px monospace;background:rgba(0,0,0,.75);padding:5px 10px;border-radius:6px;pointer-events:none;line-height:1.45;white-space:pre;text-align:left';
    document.body.appendChild(d);
    window.__dbgEl=d;
  }
  if(window.__dbgEl){
    const t=window.__joyTouch||{};
    window.__dbgEl.textContent=
      'joyX='+(P.joyX||0).toFixed(2)+' joyY='+(P.joyY||0).toFixed(2)+'\n'+
      'vel='+(P.vel.x||0).toFixed(2)+','+(P.vel.z||0).toFixed(2)+'\n'+
      'pos='+P.pos.x.toFixed(1)+','+P.pos.z.toFixed(1)+'\n'+
      'touch='+(t.active?'Y':'N')+' id='+(t.active?(t.sx|0):'-');
  }
}

/* 简单的地面碰撞：只检测与 colliders（BOX）的 XZ 平面重叠 */
function moveAndCollide(dt){
  const nx=P.pos.x+P.vel.x*dt;
  const nz=P.pos.z+P.vel.z*dt;
  let ny=P.pos.y+P.vel.y*dt;
  const r=0.4; // 玩家半径

  // 地面
  P.onGround=false;              // 先假设离地，落地时再置 true
  if(ny<1.6){ ny=1.6; P.vel.y=0; P.onGround=true; }

  /* 分轴推进：先试 X，再试 Z。
     整体一起判定的写法在角落里会把两轴一起弹回原位，
     表现就是「贴着墙走不动」甚至「一出生就动不了」。
     分轴的好处是被挡住时还能沿墙滑行，手感也顺。 */
  let px=P.pos.x, pz=P.pos.z;

  // ---- X 轴 ----
  let tx=nx, blockedX=false;
  for(const m of colliders){
    if(!m.geometry) continue;
    if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb=m.geometry.boundingBox; if(!bb) continue;
    const halfW=(bb.max.x-bb.min.x)/2, halfD=(bb.max.z-bb.min.z)/2, halfH=(bb.max.y-bb.min.y)/2;
    const mx=m.position.x, mz=m.position.z, my=m.position.y;
    if(ny < (my+halfH) && ny+1.6 > (my-halfH)){
      if(tx>mx-halfW-r && tx<mx+halfW+r && pz>mz-halfD-r && pz<mz+halfD+r){
        tx = (tx>mx) ? (mx+halfW+r) : (mx-halfW-r);
        blockedX=true;
      }
    }
  }
  if(blockedX) P.vel.x=0;

  // ---- Z 轴 ----
  let tz=nz, blockedZ=false;
  for(const m of colliders){
    if(!m.geometry) continue;
    if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb=m.geometry.boundingBox; if(!bb) continue;
    const halfW=(bb.max.x-bb.min.x)/2, halfD=(bb.max.z-bb.min.z)/2, halfH=(bb.max.y-bb.min.y)/2;
    const mx=m.position.x, mz=m.position.z, my=m.position.y;
    if(ny < (my+halfH) && ny+1.6 > (my-halfH)){
      if(tx>mx-halfW-r && tx<mx+halfW+r && tz>mz-halfD-r && tz<mz+halfD+r){
        tz = (tz>mz) ? (mz+halfD+r) : (mz-halfD-r);
        blockedZ=true;
      }
    }
  }
  if(blockedZ) P.vel.z=0;

  /* 兜底：万一出生点正好在某个碰撞盒内部（tx/tz 被来回夹住），
     检测到这个情况就把玩家沿最近的可站立方向轻推出去，避免彻底卡死。 */
  if(!isFinite(tx)||!isFinite(tz)){ tx=P.pos.x; tz=P.pos.z; }

  P.pos.x=tx; P.pos.z=tz; P.pos.y=ny;
}
