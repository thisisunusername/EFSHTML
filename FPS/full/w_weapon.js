/* ============ w_weapon.js：第一人称武器模型（枪 + 双手） ============ */
let weaponRoot=null, weaponPistol=null, weaponRifle=null, wsk=null;
let wBobT=0, wRecoil=0, wKick=0;

function mat(color,rough,metal){
  return new THREE.MeshStandardMaterial({
    color:color, roughness:rough===undefined?0.55:rough,
    metalness:metal===undefined?0.75:metal, flatShading:false
  });
}

/* 用基础几何体拼一支枪（无需外部模型文件） */
function buildPistol(){
  const g=new THREE.Group();
  const dark=mat(0x2a2d33,0.45,0.9);
  const black=mat(0x14161a,0.6,0.85);
  const steel=mat(0x5a5f68,0.35,0.95);
  const grip=mat(0x1e2126,0.85,0.2);

  // 套筒（上）
  const slide=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.075,0.34), dark);
  slide.position.set(0,0.045,-0.06); g.add(slide);
  // 枪管
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.30,12), steel);
  barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.038,-0.13); g.add(barrel);
  // 机匣（下）
  const frame=new THREE.Mesh(new THREE.BoxGeometry(0.068,0.055,0.24), black);
  frame.position.set(0,-0.015,-0.03); g.add(frame);
  // 握把
  const gr=new THREE.Mesh(new THREE.BoxGeometry(0.062,0.15,0.075), grip);
  gr.position.set(0,-0.10,0.075); gr.rotation.x=-0.22; g.add(gr);
  // 扳机护圈
  const tg=new THREE.Mesh(new THREE.TorusGeometry(0.028,0.007,6,12), black);
  tg.rotation.y=Math.PI/2; tg.position.set(0,-0.045,0.018); g.add(tg);
  // 准星
  const sight=new THREE.Mesh(new THREE.BoxGeometry(0.012,0.018,0.012), steel);
  sight.position.set(0,0.093,-0.215); g.add(sight);
  // 后照门
  const rear=new THREE.Mesh(new THREE.BoxGeometry(0.042,0.012,0.012), steel);
  rear.position.set(0,0.09,0.075); g.add(rear);
  // 弹匣底
  const mag=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.02,0.06), steel);
  mag.position.set(0,-0.175,0.085); mag.rotation.x=-0.22; g.add(mag);
  return g;
}

function buildRifle(){
  const g=new THREE.Group();
  const dark=mat(0x2e3238,0.5,0.85);
  const black=mat(0x15171b,0.62,0.8);
  const steel=mat(0x646a74,0.3,0.95);
  const poly=mat(0x3a3f47,0.8,0.25);

  // 上机匣
  const upper=new THREE.Mesh(new THREE.BoxGeometry(0.078,0.08,0.40), dark);
  upper.position.set(0,0.045,-0.10); g.add(upper);
  // 下机匣
  const lower=new THREE.Mesh(new THREE.BoxGeometry(0.070,0.075,0.26), black);
  lower.position.set(0,-0.025,-0.04); g.add(lower);
  // 护木
  const hand=new THREE.Mesh(new THREE.BoxGeometry(0.062,0.062,0.30), poly);
  hand.position.set(0,0.040,-0.42); g.add(hand);
  // 枪管
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.019,0.019,0.42,12), steel);
  barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.040,-0.62); g.add(barrel);
  // 消焰器
  const comp=new THREE.Mesh(new THREE.CylinderGeometry(0.028,0.024,0.075,10), black);
  comp.rotation.x=Math.PI/2; comp.position.set(0,0.040,-0.85); g.add(comp);
  // 弹匣（弯的）
  const mag=new THREE.Mesh(new THREE.BoxGeometry(0.048,0.20,0.085), black);
  mag.position.set(0,-0.14,0.01); mag.rotation.x=0.16; g.add(mag);
  // 握把
  const grip=new THREE.Mesh(new THREE.BoxGeometry(0.058,0.15,0.075), poly);
  grip.position.set(0,-0.105,0.115); grip.rotation.x=-0.3; g.add(grip);
  // 枪托
  const stock=new THREE.Mesh(new THREE.BoxGeometry(0.058,0.085,0.24), poly);
  stock.position.set(0,0.005,0.28); g.add(stock);
  // 托底
  const butt=new THREE.Mesh(new THREE.BoxGeometry(0.062,0.11,0.03), black);
  butt.position.set(0,0.0,0.40); g.add(butt);
  // 导轨 + 小瞄具
  const rail=new THREE.Mesh(new THREE.BoxGeometry(0.03,0.014,0.26), steel);
  rail.position.set(0,0.092,-0.10); g.add(rail);
  const scope=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.13,12), black);
  scope.rotation.x=Math.PI/2; scope.position.set(0,0.125,-0.10); g.add(scope);
  const apt=new THREE.Mesh(new THREE.BoxGeometry(0.038,0.014,0.014), steel);
  apt.position.set(0,0.092,-0.225); g.add(apt);
  return g;
}

/* 双手（简化胶囊 + 手指块） */
function buildHand(isLeft){
  const g=new THREE.Group();
  const skin=mat(0xc9a17a,0.85,0.05);
  const sleeve=mat(0x2b3038,0.9,0.1);
  // 前臂
  const arm=new THREE.Mesh(new THREE.CylinderGeometry(0.042,0.048,0.30,10), sleeve);
  arm.rotation.x=Math.PI/2.35; arm.position.set(0,-0.055,0.20); g.add(arm);
  // 手掌
  const palm=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.055,0.10), skin);
  palm.position.set(0,-0.02,0.045); g.add(palm);
  // 四指（包住握把）
  for(let i=0;i<4;i++){
    const f=new THREE.Mesh(new THREE.BoxGeometry(0.020,0.052,0.058), skin);
    f.position.set(-0.026+i*0.0175,-0.052,-0.005);
    f.rotation.x=0.55; g.add(f);
  }
  // 拇指
  const th=new THREE.Mesh(new THREE.BoxGeometry(0.022,0.062,0.026), skin);
  th.position.set(isLeft?0.038:-0.038,-0.005,0.03);
  th.rotation.z=isLeft?-0.5:0.5; g.add(th);
  return g;
}

/* 初始化武器（挂在相机上，跟随视角） */
function initWeapon(){
  if(weaponRoot) return;
  weaponRoot=new THREE.Group();
  // 位置：右下方，略微内收
  weaponRoot.position.set(0.19,-0.17,-0.38);

  weaponPistol=buildPistol();
  weaponRifle=buildRifle();
  weaponRifle.visible=false;

  // 左右手分别挂在枪上，随枪一起动
  const rHand=buildHand(false); rHand.position.set(0.012,-0.115,0.10);
  const lHand=buildHand(true);  lHand.position.set(0.0,-0.115,0.10);

  weaponPistol.add(rHand.clone());
  weaponPistol.add(lHand.clone());
  weaponRifle.add(rHand.clone());
  weaponRifle.add(lHand.clone());

  weaponRoot.add(weaponPistol);
  weaponRoot.add(weaponRifle);

  camera.add(weaponRoot);
  if(!scene.children.includes(camera)) scene.add(camera); // 相机必须在场景里才会渲染子物体
  wsk={pistol:weaponPistol, rifle:weaponRifle};
  syncWeapon();
}

/* 根据当前武器切换显示 */
function syncWeapon(){
  if(!wsk) return;
  const hasGun=!!(P&&P.inv&&P.inv.gun);
  wsk.pistol.visible=!hasGun;
  wsk.rifle.visible=hasGun;
}

/* 每帧更新：走路晃动 + 后坐力回弹 + 换弹动作 + 奔跑收枪 */
function updWeapon(dt){
  if(!weaponRoot||!wsk) return;

  // 想用的枪
  const wantRifle=!!(P&&P.inv&&P.inv.gun);
  if(wsk.rifle.visible!==wantRifle) syncWeapon();

  const spd=Math.hypot(P.vel.x,P.vel.z);
  const moving=spd>0.5&&P.onGround;
  const sprinting=P.sprinting&&moving;

  // 平滑过渡系数（避免姿态突变）
  const k=Math.min(1,dt*10);
  wSprint = wSprint===undefined?0:wSprint+( (sprinting?1:0) - wSprint )*k;
  wAds = wAds===undefined?0:wAds;

  // 走路晃动：冲刺时频率和幅度都加大
  wBobT+=dt*(moving?spd*(sprinting?2.1:1.6):0);
  const bobAmt=moving?Math.min(spd/10,1):0;
  const bobScale=sprinting?1.85:1;
  const bobX=Math.sin(wBobT)*0.012*bobAmt*bobScale;
  const bobY=Math.abs(Math.cos(wBobT))*0.010*bobAmt*bobScale;

  // 开火后坐力衰减
  if(wRecoil>0) wRecoil=Math.max(0,wRecoil-dt*6);
  // 换弹下沉
  const reloadDip=P.reload?0.09:0;
  const reloadRot=P.reload?0.5:0;

  // ===== 奔跑姿态：枪身放低、向内倾斜、上下颠 =====
  // 右手枪判断（冲刺时把枪压低并向左收）
  const s=wSprint;
  const bobRun=Math.sin(wBobT*1.0)*0.028*s;

  weaponRoot.position.x=(0.19+bobX) - 0.055*s;
  weaponRoot.position.y=(-0.17-bobY-wRecoil*0.03-reloadDip) - 0.075*s + bobRun;
  weaponRoot.position.z=(-0.38+wRecoil*0.06) + 0.055*s;

  // 奔跑时枪口朝左下压，形成「抱着枪跑」的观感
  weaponRoot.rotation.x=wRecoil*0.16 + reloadRot*0.35 + 0.42*s;
  weaponRoot.rotation.z=Math.sin(wBobT*0.5)*0.02*bobAmt + reloadRot*0.25 + 0.30*s;
  weaponRoot.rotation.y=(P.reload?0.3:0) + 0.22*s;
}

/* 开火时调用：给模型加后坐 */
function weaponKick(){ wRecoil=Math.min(1.2,wRecoil+0.85); }
