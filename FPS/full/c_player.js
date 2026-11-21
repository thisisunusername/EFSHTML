/* ============ c_player.js：玩家对象 + 移动/碰撞/视角 ============ */
const P={
  pos:new THREE.Vector3(0,1.6,5),
  vel:new THREE.Vector3(),
  yaw:0, pitch:0,
  firing:false,            // 扳机是否按住（全自动连发靠它）
  /* 武器皮肤：{ 物品 id: 皮肤 id }。
     存的是「这把枪用什么皮肤」而不是「当前用什么皮肤」，
     这样切枪时每把枪都能记住自己的涂装。 */
  skins:{},
  hp:100, armor:0,
  /* ammo=手枪弹匣 / gun=长枪弹匣 / rifle|pistol|sniper|shot=各类后备弹。
     sniper 和 shot 以前没初始化，撒弹枪和狙击买了弹也只能靠
     「完全没弹时白给满匣」的兜底苟着，换弹时后备一直是 undefined。 */
  ammo:{ammo:90,med:0,cash:0,gun:120,rifle:0,pistol:0,sniper:0,shot:0},
  inv:{gun:true,med:0},
  /* 【搜打撤基础装备】撤离类游戏的核心是「带什么进去、能带回什么」。
     bag 是按 id 聚合的物品表：{ itemId: 数量 }。
     装备栏单独存 id，护甲/头盔提供减伤和额外血量（见 dmgPlayer）。
     背包有容量上限，买太多就会卡住提示「背包已满」。 */
  /* 【搜打撤双层容器】这一刻开始，仓库和背包必须分开：
     stash —— 局外仓库，容量无限，安全区里随便存，阵亡不掉
     pouch —— 局内背包，装什么带什么，容量由背包装备决定，阵亡全丢
     原来的 P.bag 把两者混成一个，导致「蹲局里还能买到所有东西」，
     完全不像搜打撤。现在彻底拆开。 */
  stash:{ med:2, ammo_pistol:2, bandage:3, melee_knife:1, pis_default:1 },  // 局外仓库（新手初始物资）
  pouch:{},                // 局内背包 { itemId: 数量 }
  bagCap:24,               // 局内背包容量（由背包装备决定）
  /* 出击装备：六个槽位，对应仓库左侧的竖排装备栏
       primary   主武器（步枪/冲锋枪/狙击）
       secondary 手枪
       melee     副武器（小刀/防暴棍，永不耗弹）
       chest     胸挂（决定额外弹匣位）
       backpack  背包（决定 bagCap）
       helmet / armorVest 头盔护甲（减伤） */
  equip:{ helmet:null, armorVest:null, backpack:'bp_small',
          primary:null, secondary:'pis_default', melee:'melee_knife', chest:null },
  helmetDur:0, vestDur:0, // 护甲耐久（受伤时先扣）
  /* 【当前手持武器槽】三个可用槽：primary / secondary / melee
     P.slot 决定现在拿哪把：
       'primary'   主武器（步枪/冲锋枪/狙击）—— 有才可选
       'secondary' 手枪 —— 有才可选
       'melee'     副武器小刀/警棍 —— 永不耗弹
     切换逻辑见 switchSlot()。原来的实现只有 P.inv.gun 一个布尔，
     只能表达「有枪/没枪」，做不了多武器切换。 */
  slot:'secondary',        // 初始拿手枪（新手只有手枪+小刀）
  slotT:0,                 // 切换动画计时（抬枪放下再抬起）
  speed:6, sprint:10,
  onGround:true,
  shooting:false, reload:false, reloadT:0,
  shootCd:0, sprinting:false, joyX:0, joyY:0, alive:true,
  aiming:false,    /* 开镜状态（按住开镜键） */
  aimT:0,          /* 开镜过渡插值 0~1，用于平滑 FOV */
  /* 【趴下】eyeH 是当前眼睛离地高度，standH 是站立高度。
     趴下时眼睛降到 0.55 米，移动速度砍到 35%，且不能跳。
     moveAndCollide 用它算身体碰撞区间，所以「趴着能钻矮门洞」
     这类行为是自然成立的，不需要额外的特判。 */
  prone:false,
  eyeH:1.6, standH:1.6, proneH:0.55,
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
  if(P.prone) return;       // 趴着不能跳，得先站起来
  P.vel.y=7;
  P.onGround=false;
  sfxStep();
}

/* 趴下开关：切换状态，站起时如果头顶有障碍就先不起来。
   检查方式：把眼睛抬到站立高度，看身体区间是否与某个碰撞盒相交；
   相交就说明上面有东西压着，保持趴着并提示。 */
function toggleProne(){
  if(!P.alive) return;
  if(P.prone){
    /* 试着站起来：临时按站立高度算一次碰撞 */
    const standFeet = P.pos.y - P.standH;
    const standHead = P.pos.y - P.eyeH + P.standH;
    let blocked=false;
    for(const m of colliders){
      if(!m.geometry) continue;
      if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb=m.geometry.boundingBox; if(!bb) continue;
      const hw=(bb.max.x-bb.min.x)/2, hd=(bb.max.z-bb.min.z)/2, hh=(bb.max.y-bb.min.y)/2;
      const top=m.position.y+hh, bot=m.position.y-hh;
      if(bot>standHead || top<standFeet+0.05) continue;
      /* 顶面低于脚下 35cm 的（地板/台阶）不算障碍 */
      if(top < standFeet+0.35) continue;
      if(P.pos.x>m.position.x-hw-0.4 && P.pos.x<m.position.x+hw+0.4 &&
         P.pos.z>m.position.z-hd-0.4 && P.pos.z<m.position.z+hd+0.4){ blocked=true; break; }
    }
    if(blocked){ toast('上面太低，站不起来'); sfxDeny(); return; }
    P.prone=false;
  }else{
    P.prone=true;
  }
  sfxUI();
  refreshHUD();
}

/* ---- 玩家移动（重力 + 键盘/摇杆输入） ---- */
function updP(dt){
  // 鼠标/触控视角在 e_io/e_ui 里通过 pointer 事件直接改 P.yaw/P.pitch
  /* 【趴下过渡】眼睛高度在站立(1.6)和趴下(0.55)之间平滑插值，
     直接跳变会让画面像瞬移，很难受。 */
  const wantH = P.prone ? P.proneH : P.standH;
  P.eyeH += (wantH - P.eyeH) * Math.min(1, dt*10);
  if(Math.abs(P.eyeH-wantH)<0.002) P.eyeH=wantH;

  const f=P.keys['KeyW'], b=P.keys['KeyS'], l=P.keys['KeyA'], r=P.keys['KeyD'];
  /* 趴下时不能冲刺，且速度只有步行的 35% */
  const sprint=!P.prone && (P.keys['ShiftLeft']||P.keys['ShiftRight']||P.sprinting);
  const spd=(sprint?P.sprint:P.speed) * (P.prone?0.35:1);

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
  /* 【开镜速度】以前固定 dt*12，所有枪和瞄具一栋。
     现在由配件决定：红点/折叠枪托/短握把开镜更快，
     高倍镜和重型枪托更慢。倍率限制在 6~26 之间避免一瞬开镜或慢到没法玩。 */
  let adsRate = 12;
  try{
    if(typeof gunModEff==='function'){
      const gid = (typeof slotItem==='function' && typeof P!=='undefined') ? slotItem(P.slot) : null;
      if(gid) adsRate = 12 * (1 + gunModEff(gid,'adsSpeed'));
    }
  }catch(e){ adsRate = 12; }
  adsRate = Math.max(6, Math.min(26, adsRate));
  P.aimT += (aimTarget - P.aimT) * Math.min(1, dt*adsRate);
  if(camera){
    const baseFov = P.sprinting ? 78 : 75;
    /* 各枪开镜倍率不同：狙击压到 0.55 倍视场（约 2.4 倍镜），
       DMR 0.72、步枪 1.0、手枪 1.0。
       以前所有枪都固定缩 28 度，狙击开镜完全不像狙击。 */
    let adsK=1;
    try{
      const it=(typeof curItem==='function')?curItem():null;
      if(it && it.adsFov) adsK=it.adsFov;
      /* 【瞄具倍率】zoom 是「额外收紧多少度视场」。
         红点 .30 / 全息 .50 / 2x 1.0 / 4x 2.2 / 6x 3.6，
         乘 7 转成度：6x 镜能把 75° 压到 75-28-25 ≈ 22°，接近真倍镜。
         下限 12° 防止高倍镜在低 FOV 下穿模。 */
      const gid=(typeof slotItem==='function')&&P?slotItem(P.slot):null;
      if(gid && typeof gunModEff==='function'){
        const z=gunModEff(gid,'zoom');
        if(z>0) adsK = Math.max(0.28, adsK - z*0.16);
      }
    }catch(e){ adsK=1; }
    camera.fov = Math.max(12, baseFov - 28*P.aimT*adsK);
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
  /* 【可站立高度】P.pos.y 就是眼睛高度，而眼睛高度会随趴下变化，
     所以这里必须用 P.eyeH 而不是写死的 1.6 —— 否则趴下之后
     身体判定区间还是站立的尺寸，钻不过矮处也躲不掉子弹。 */
  const eyeH = P.eyeH;
  const feetY=ny-eyeH, headY=ny;

  /* ================= 垂直方向：落地判定 =================
     【原来这里只有一个 `if(ny<eyeH) ny=eyeH`】
     它只认得「地面 y=0」这一个平面。于是出现了两个严重问题：

       1) 遁地：屋顶、台阶、看台、走廊地板这些物体，
          逻辑上应该能踩上去，但代码里根本没有「站在某个顶面」
          这个概念。玩家走到台阶上，脚下没有支撑判定，
          就一直往下掉，最后被 y=0 那一行兜住 —— 表现就是
          「明明站在楼上却掉到楼里」「走两步突然掉下去」。

       2) 板子飞天：反过来说，悬在空中的装饰板（雨棚、门额横梁）
          被当成实心体，但玩家又不会被它挡住/托住，
          于是它看起来就是「飘在天上、人能穿过去」。

     现在补上真正的顶面判定：
       对每个碰撞体算出它的顶面 top，
       如果玩家这一帧的脚底从 top 上方落到 top 下方（跨过顶面），
       而且水平方向在它范围内，就落在 top 上。
     这一步必须在水平推进「之前」用旧位置算，
     否则人会先被侧面推开、再也对不上顶面。 */
  let standY=1;                       // 至少站在 y=0 地面上（眼睛高度）
  const r0=0.4;
  for(const m of colliders){
    if(!m.geometry) continue;
    if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb=m.geometry.boundingBox; if(!bb) continue;
    const halfH=(bb.max.y-bb.min.y)/2;
    const top=m.position.y+halfH;
    const halfW=(bb.max.x-bb.min.x)/2, halfD=(bb.max.z-bb.min.z)/2;
    const mx=m.position.x, mz=m.position.z;
    /* 水平方向必须在物体范围内（留一点边，不然贴边站不住） */
    if(P.pos.x < mx-halfW-r0*0.6 || P.pos.x > mx+halfW+r0*0.6) continue;
    if(P.pos.z < mz-halfD-r0*0.6 || P.pos.z > mz+halfD+r0*0.6) continue;
    /* 这一帧脚底有没有从 top 上方跨到下方（或本来就踩在 top 上） */
    const prevFeet=P.pos.y-P.eyeH;
    const landTop=top+eyeH;           // 站在这个顶面上时，眼睛应该在的高度
    if(prevFeet>=top-0.08 && ny<=landTop && P.vel.y<=0){
      if(landTop>standY) standY=landTop;
    }
  }
  /* 地面兜底（y=0 那块大平面没有碰撞体，单独处理） */
  if(standY<eyeH) standY=eyeH;

  P.onGround=false;
  if(ny<standY){ ny=standY; P.vel.y=0; P.onGround=true; }
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
