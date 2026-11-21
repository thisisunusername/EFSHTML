/* ============ w_weapon.js：第一人称武器模型（枪 + 双手） ============ */
let weaponRoot=null, weaponPistol=null, weaponRifle=null, weaponKnife=null, wsk=null;
let wBobT=0, wRecoil=0, wKick=0;
/* 奔跑/瞄准姿态的平滑插值量。
   【必须在这里声明】本项目所有分块被打包进同一个 <script type="module">，
   模块严格模式下给未声明的变量赋值会抛 ReferenceError，
   而 updWeapon 是在 animate() 里逐帧调用的——
   一旦它抛错，后面的 refreshHUD() 和 renderer.render() 就再也不会执行，
   表现就是整个 3D 场景、枪、人物全部变黑。 */
let wSprint=0, wAds=0;

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

/* 战术小刀：刀刃 + 刀柄 + 护手。
   melee 槽的视觉表现。近战武器在 FPS 里视角要更靠中间，
   所以整体往画面中心挪一点，握持角度也换成「反手握」的侧面姿态。 */
function buildKnife(){
  const g=new THREE.Group();
  const steel=mat(0xc9d3e0,0.35,0.65);
  const grip=mat(0x23272e,0.95,0.05);
  const rim=mat(0x8a939f,0.5,0.4);

  // 刀柄（带指槽）
  const handle=new THREE.Mesh(new THREE.BoxGeometry(0.030,0.115,0.030), grip);
  handle.position.set(0,-0.03,0.02); g.add(handle);
  for(let i=0;i<3;i++){
    const groove=new THREE.Mesh(new THREE.BoxGeometry(0.034,0.008,0.032), rim);
    groove.position.set(0,-0.065+i*0.028,0.02); g.add(groove);
  }
  // 护手
  const guard=new THREE.Mesh(new THREE.BoxGeometry(0.062,0.012,0.034), rim);
  guard.position.set(0,0.032,0.02); g.add(guard);
  // 刀刃：底宽顶窄，用两段近似（没有自定义几何体时这样最省）
  const blade=new THREE.Mesh(new THREE.BoxGeometry(0.026,0.20,0.010), steel);
  blade.position.set(0,0.14,0.02); blade.rotation.x=-0.04; g.add(blade);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(0.014,0.055,4), steel);
  tip.position.set(0,0.265,0.018); tip.rotation.y=Math.PI/4; g.add(tip);

  /* 握刀的手：右手掌心包住刀柄 */
  const hand=buildHand(false);
  hand.position.set(0,-0.075,0.045);
  hand.rotation.x=-0.15;
  g.add(hand);
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
  weaponKnife=buildKnife();
  weaponRifle.visible=false;
  weaponKnife.visible=false;

  // 左右手分别挂在枪上，随枪一起动
  const rHand=buildHand(false); rHand.position.set(0.012,-0.115,0.10);
  const lHand=buildHand(true);  lHand.position.set(0.0,-0.115,0.10);

  weaponPistol.add(rHand.clone());
  weaponPistol.add(lHand.clone());
  weaponRifle.add(rHand.clone());
  weaponRifle.add(lHand.clone());
  /* 刀已经自带一只握刀的手，另一只手不用挂 */

  weaponRoot.add(weaponPistol);
  weaponRoot.add(weaponRifle);
  weaponRoot.add(weaponKnife);

  camera.add(weaponRoot);
  if(!scene.children.includes(camera)) scene.add(camera); // 相机必须在场景里才会渲染子物体
  wsk={pistol:weaponPistol, rifle:weaponRifle, knife:weaponKnife};
  syncWeapon();
}

/* ===== 手持武器槽：切换与查询 =====
   三个可用槽位，优先级就是数组顺序：
     primary   主武器（步枪/冲锋枪/狙击）—— 耗对应步枪弹
     secondary 手枪                      —— 耗手枪弹
     melee     副武器（小刀/警棍）        —— 永不耗弹，近战

   为什么不再用 P.inv.gun 布尔：
     那个布尔只能表达「有长枪 / 只有手枪」两种情况，
     玩家买了步枪之后就没法切回手枪，也没法掏刀。
     现在改成「当前手持哪一把」，装备槽里有什么就能切什么。 */

const WSLOTS=['primary','secondary','melee'];

/* 这一槽当前装的是哪把武器（item id），没有就是 null */
function slotItem(slot){ return (P.equip && P.equip[slot]) || null; }
/* 这一槽能不能用：装了东西才算 */
function slotUsable(slot){
  const id=slotItem(slot);
  if(!id) return false;
  return !!SHOP_ITEMS[id];
}
/* 当前手持武器是否远程（近战不耗弹、不用换弹） */
function curIsMelee(){ return P.slot==='melee'; }
function curIsPrimary(){ return P.slot==='primary'; }
/* 当前武器用的弹匣字段：near=主武器步枪弹 / secondary=手枪弹 / melee=无 */
function curAmmoKey(){
  if(curIsMelee()) return null;
  return curIsPrimary() ? 'gun' : 'ammo';
}
function curReserveKey(){
  if(curIsMelee()) return null;
  return curIsPrimary() ? 'rifle' : 'pistol';
}
/* 当前武器的伤害（数据来自物品表，买更好的枪就更疼） */
function curDamage(){
  if(curIsMelee()) return 40;          // 近战固定伤害（够一刀砍死普通敌人）
  const id=slotItem(P.slot);
  const it=id&&SHOP_ITEMS[id];
  return (it&&it.dmg) || (curIsPrimary()?26:14);
}
/* 开火间隔：主武器快、手枪慢、近战更慢 */
function curFireCd(){
  if(curIsMelee()) return 0.42;
  return curIsPrimary() ? 0.12 : 0.18;
}

/* 切到指定槽位。返回是否切换成功（没装备就切不过去）。 */
function switchSlot(slot, quiet){
  if(!WSLOTS.includes(slot)) return false;
  if(slot===P.slot) return false;
  if(!slotUsable(slot)){
    if(!quiet) toast(slotName(slot)+'槽是空的');
    return false;
  }
  /* 换枪要打断换弹：换弹到一半切成别的枪，
     那颗子弹应该留在原来那把枪里，不能凭空装上。 */
  if(P.reload){ P.reload=false; P.reloadT=0; }
  P.slot=slot;
  P.slotT=0;              // 触发抬枪动画
  P.shootCd=Math.max(P.shootCd, curFireCd()); // 切枪后有个最小间隔，防止瞬间连射
  sfxUI();
  syncWeapon();
  refreshHUD();
  refreshWpnBar();     // 底部切换条同步高亮
  if(!quiet) toast('切到 '+slotName(slot));
  return true;
}

/* 中文名，给 HUD 和提示用 */
function slotName(slot){
  return slot==='primary'?'主武器':slot==='secondary'?'手枪':'副武器';
}
function slotIcon(slot){
  return slot==='primary'?'🔫':slot==='secondary'?'🔫':'🔪';
}

/* 循环切到下一把可用的武器（按主武器 -> 手枪 -> 刀 的顺序）
   给手机上「点一下切枪」这种单键操作准备。 */
function cycleSlot(){
  const cur=WSLOTS.indexOf(P.slot);
  for(let i=1;i<=WSLOTS.length;i++){
    const s=WSLOTS[(cur+i)%WSLOTS.length];
    if(slotUsable(s)) return switchSlot(s);
  }
  toast('没有可切换的武器');
  return false;
}

/* 出门时校正一次：装备槽里空空如也的话，P.slot 可能指向一个空槽，
   这时自动落回第一个可用槽，避免开局拿着空气。 */
function fixSlot(){
  if(slotUsable(P.slot)) return P.slot;
  for(const s of WSLOTS){
    if(slotUsable(s)){ P.slot=s; return s; }
  }
  P.slot='melee';   // 连刀都没有的极端情况，至少别崩
  return P.slot;
}

/* 根据当前武器切换显示 */
function syncWeapon(){
  if(!wsk) return;
  /* 现在三把模型：rifle / pistol / knife。
     melee 用刀，别的按主副武器分。 */
  const s=P.slot;
  const showRifle = s==='primary';
  const showPistol = s==='secondary';
  const showKnife = s==='melee';
  if(wsk.rifle) wsk.rifle.visible=showRifle;
  if(wsk.pistol) wsk.pistol.visible=showPistol;
  if(wsk.knife) wsk.knife.visible=showKnife;
  /* 换枪瞬间把武器往下甩一点（P.slotT 控制），
     0 -> 1 表示「放下旧枪又抬上新枪」的过渡。
     updWeapon 里会读这个值做下坠位移。 */
  if(P.slotT!==undefined) P.slotT=Math.min(1,P.slotT);
}

/* 每帧更新：走路晃动 + 后坐力回弹 + 换弹动作 + 奔跑收枪 */
function updWeapon(dt){
  if(!weaponRoot||!wsk) return;

  /* 想用的枪：以 P.slot 为准，不再看 inv.gun 布尔。
     这里只做「检测到不一致就同步一次」，不要每帧 syncWeapon ——
     那会每帧遍历三个模型改 visible，白费性能。 */
  const wantRifle = (P.slot==='primary');
  const wantPistol = (P.slot==='secondary');
  const wantKnife = (P.slot==='melee');
  if(wsk.rifle.visible!==wantRifle || wsk.pistol.visible!==wantPistol
     || (wsk.knife && wsk.knife.visible!==wantKnife)) syncWeapon();

  /* 换枪动画：切槽后 P.slotT 从 0 涨到 1，
     这段时间武器整体往下沉，做「放下旧枪、抬起新枪」的观感。 */
  if(P.slotT<1) P.slotT=Math.min(1, P.slotT + dt*3.2);
  const swapDip=(1-P.slotT)*0.22;   // 0 -> 0.22 米的下坠量

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
  weaponRoot.position.y=(-0.17-bobY-wRecoil*0.03-reloadDip) - 0.075*s + bobRun - swapDip;
  weaponRoot.position.z=(-0.38+wRecoil*0.06) + 0.055*s;

  // 奔跑时枪口朝左下压，形成「抱着枪跑」的观感
  weaponRoot.rotation.x=wRecoil*0.16 + reloadRot*0.35 + 0.42*s;
  weaponRoot.rotation.z=Math.sin(wBobT*0.5)*0.02*bobAmt + reloadRot*0.25 + 0.30*s;
  weaponRoot.rotation.y=(P.reload?0.3:0) + 0.22*s;
}

/* 开火时调用：给模型加后坐 */
function weaponKick(){ wRecoil=Math.min(1.2,wRecoil+0.85); }
