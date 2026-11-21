/* ============ c_player.js：玩家对象 + 移动/碰撞/视角 ============ */
const P={
  pos:new THREE.Vector3(0,1.6,5),
  vel:new THREE.Vector3(),
  yaw:0, pitch:0,
  hp:100, armor:0,
  ammo:{ammo:90,med:0,cash:0,gun:120},
  inv:{gun:true,med:0},
  /* 【搜打撤基础装备】撤离类游戏的核心是「带什么进去、能带回什么」。
     bag 是按 id 聚合的物品表：{ itemId: 数量 }。
     装备栏单独存 id，护甲/头盔提供减伤和额外血量（见 dmgPlayer）。
     背包有容量上限，买太多就会卡住提示「背包已满」。 */
  bag:{},                 // { 'med': 3, 'ammo_pistol': 60, ... }
  bagCap:24,              // 背包容量（格）
  equip:{ helmet:null, armorVest:null, backpack:'pouch' },  // 装备中的 id
  helmetDur:0, vestDur:0, // 护甲耐久（受伤时先扣耐久）
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
  /* 【摇杆输入 —— 单一数据源】
     以前这里有两条路：先读 P.joyX，再读 window.__joyTouch 做「双保险」，
     两套逻辑并存导致出问题时无法判断是哪条路喂的值，
     调试面板上还会显示 P.joyX=0 而实际在用 __joyTouch（或反过来）。
     现在只从 window.__joyTouch 读：它是 touchmove 直接写入的原始触点，
     不依赖任何事件配对，也不受模块作用域影响。
     位移按 max=48px 归一化到 -1~1，死区 2px。 */
  const jt=window.__joyTouch;
  if(jt && jt.active){
    let dx=jt.cx-jt.sx, dy=jt.cy-jt.sy;
    const jmax=48;
    let d=Math.hypot(dx,dy);
    if(d>jmax){ dx*=jmax/d; dy*=jmax/d; d=jmax; }
    /* 【符号约定 —— 这里踩过坑】
       mx/mz 与键盘保持一致：mz 为负 = 前进，为正 = 后退。
       屏幕坐标 y 向下为正，手指「往上推」时 dy<0。
       但 updP 里前进方向是 mz<0 对应的 fwdZ=-cos(yaw)，
       若直接把 dy 当 mz 用，dy<0 会乘出正数 → 玩家反而后退。
       所以必须取反：屏幕往上推 → mz 为负 → 沿相机前方前进。 */
    if(d>2){ mx=dx/jmax; mz=-dy/jmax; }
    /* 同步回 P，方便 HUD 和其它系统读取；不是输入源 */
    P.joyX=mx; P.joyY=mz;
  }else{
    P.joyX=0; P.joyY=0;
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
  /* 【致命 bug 所在地】
     wx/wz 原来声明为 const，随后又写 wx/=len 归一化，
     ES module 是严格模式，给 const 赋值直接抛
     TypeError: Assignment to constant variable.
     结果是：只要玩家有任何移动输入，updP 就在这一行中断，
     后面的 moveAndCollide 永远执行不到 → 人永远站在原地。
     而没有任何输入时 len=0 走 else 分支，不抛错，
     所以「能转视角、能开镜、能开火，就是走不动」。
     这也解释了为什么前面几轮全在修摇杆都没用：
     摇杆值其实一直是好的，是下游把它消费掉的那一步炸了。 */
  let wx=fwdX*mz + rightX*mx;
  let wz=fwdZ*mz + rightZ*mx;
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
}

/* 简单的地面碰撞：只检测与 colliders（BOX）的 XZ 平面重叠 */
function moveAndCollide(dt){
  const nx=P.pos.x+P.vel.x*dt;
  const nz=P.pos.z+P.vel.z*dt;
  let ny=P.pos.y+P.vel.y*dt;
  const r=0.4; // 玩家半径
  /* 玩家可站立高度：P.pos.y 就是眼睛高度（1.6），
     所以身体占 [ny-1.6, ny] 这一段，而不是 [ny, ny+1.6]。
     以前写成 ny+1.6，等于把判定盒整段抬到头顶以上，
     站在地面板上时永远和「地面」这个碰撞体相交。 */
  const feetY=ny-1.6, headY=ny;
  // 地面
  P.onGround=false;              // 先假设离地，落地时再置 true
  if(ny<1.6){ ny=1.6; P.vel.y=0; P.onGround=true; }
  const canBlock=(m)=>{
    if(!m.geometry) return false;
    if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb=m.geometry.boundingBox; if(!bb) return false;
    const halfH=(bb.max.y-bb.min.y)/2;
    const top=m.position.y+halfH;
    /* 顶面低于脚下 35cm 的（地面、操场、走廊地板、马路）不参与侧面碰撞，
       否则站在地板上会被判定为「卡在实体内部」，分轴推进时每一帧都被推回原位。 */
    if(top < feetY+0.35) return false;
    return true;
  };
  /* 分轴推进：先试 X，再试 Z。
     整体一起判定的写法在角落里会把两轴一起弹回原位，
     表现就是「贴着墙走不动」甚至「一出生就动不了」。
     分轴的好处是被挡住时还能沿墙滑行，手感也顺。 */
  let px=P.pos.x, pz=P.pos.z;
  // ---- X 轴 ----
  let tx=nx, blockedX=false;
  for(const m of colliders){
    if(!canBlock(m)) continue;
    const bb=m.geometry.boundingBox;
    const halfW=(bb.max.x-bb.min.x)/2, halfD=(bb.max.z-bb.min.z)/2, halfH=(bb.max.y-bb.min.y)/2;
    const mx=m.position.x, mz=m.position.z, my=m.position.y;
    if(feetY < (my+halfH) && headY > (my-halfH)){
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
    if(!canBlock(m)) continue;
    const bb=m.geometry.boundingBox;
    const halfW=(bb.max.x-bb.min.x)/2, halfD=(bb.max.z-bb.min.z)/2, halfH=(bb.max.y-bb.min.y)/2;
    const mx=m.position.x, mz=m.position.z, my=m.position.y;
    if(feetY < (my+halfH) && headY > (my-halfH)){
      if(tx>mx-halfW-r && tx<mx+halfW+r && tz>mz-halfD-r && tz<mz+halfD+r){
        tz = (tz>mz) ? (mz+halfD+r) : (mz-halfD-r);
        blockedZ=true;
      }
    }
  }
  if(blockedZ) P.vel.z=0;
  /* 兜底：数值异常时保持原位，绝不让 NaN 传染给下一帧 */
  if(!isFinite(tx)||!isFinite(tz)){ tx=P.pos.x; tz=P.pos.z; }
  P.pos.x=tx; P.pos.z=tz; P.pos.y=ny;
}
