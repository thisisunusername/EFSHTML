/* ============ w_weapon.js：第一人称武器模型（枪 + 双手） ============ */
let weaponRoot=null, weaponPistol=null, weaponRifle=null, weaponKnife=null, weaponShotgun=null, wsk=null;
let wBobT=0, wRecoil=0, wKick=0;
/* 奔跑/瞄准姿态的平滑插值量。
   【必须在这里声明】本项目所有分块被打包进同一个 <script type="module">，
   模块严格模式下给未声明的变量赋值会抛 ReferenceError，
   而 updWeapon 是在 animate() 里逐帧调用的——
   一旦它抛错，后面的 refreshHUD() 和 renderer.render() 就再也不会执行，
   表现就是整个 3D 场景、枪、人物全部变黑。 */
let wSprint=0, wAds=0;
/* 泵动/栓动作动进度：fire() 里置 1，updPump 每帧衰减到 0。
   声明在这里的原因同上：模块严格模式下给未声明变量赋值会抛 ReferenceError。 */
let wPump=0, wPumpDur=0.58;
/* 检视进度：1 -> 0，updWeapon 末尾读它叠加姿势 */
let wInsT=0, wInsDur=1.5;

function mat(color,rough,metal){
  return new THREE.MeshStandardMaterial({
    color:color, roughness:rough===undefined?0.55:rough,
    metalness:metal===undefined?0.75:metal, flatShading:false
  });
}

/* 用基础几何体拼一支枪（无需外部模型文件） */
function buildPistol(PAL){
  const g=new THREE.Group();
  /* 不传配色就用原厂默认值，这样旧调用点不会炸 */
  const C=PAL||{main:0x2a2d33,dark:0x14161a,steel:0x5a5f68,grip:0x1e2126};
  const dark=mat(C.main,0.45,0.9);
  const black=mat(C.dark,0.6,0.85);
  const steel=mat(C.steel,0.35,0.95);
  const grip=mat(C.grip,0.85,0.2);

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

function buildRifle(PAL){
  const g=new THREE.Group();
  const C=PAL||{main:0x2e3238,dark:0x15171b,steel:0x646a74,poly:0x3a3f47};
  const dark=mat(C.main,0.5,0.85);
  const black=mat(C.dark,0.62,0.8);
  const steel=mat(C.steel,0.3,0.95);
  const poly=mat(C.poly,0.8,0.25);

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

/* ============ 武器皮肤（颜色 + 发光特效） ============
   皮肤只改材质，不改几何体 —— 这样一支枪能用任意皮肤，
   不用给每个组合都建一遍模型。
   结构：SKINS[id] = { name, colors:{涂装色}, glow:{发光色, 强度}, deco:'aura'|'none' }
   glow 用 MeshStandardMaterial 的 emissive/emissiveIntensity，
   不需要额外的后期处理就能有很明显的「这把枪在发光」的观感。 */
const SKINS={
  skin_none:{ get name(){ return T('原厂'); },
    main:0x2e3238, dark:0x15171b, steel:0x646a74, poly:0x3a3f47, grip:0x1e2126,
    glow:0x000000, glowI:0, deco:'none' },
  skin_neon:{ get name(){ return T('霓虹夜光'); },
    main:0x1a2436, dark:0x0d1220, steel:0x39e8ff, poly:0x131b2a, grip:0x0e1420,
    glow:0x18e0ff, glowI:0.95, deco:'aura' },
  skin_blood:{ get name(){ return T('赤血红'); },
    main:0x2a0d10, dark:0x140507, steel:0xff3b3b, poly:0x1d0a0c, grip:0x120607,
    glow:0xff2233, glowI:1.15, deco:'aura' },
  skin_gold:{ get name(){ return T('黄金'); },
    main:0x3a2c10, dark:0x1d1607, steel:0xffd24a, poly:0x4a3812, grip:0x241b0a,
    glow:0xffb524, glowI:0.55, deco:'none' },
  skin_toxic:{ get name(){ return T('毒液幽绿'); },
    main:0x12220f, dark:0x081207, steel:0x7cff4a, poly:0x0f1c0c, grip:0x0a1208,
    glow:0x6cff3a, glowI:1.05, deco:'aura' },
  skin_void:{ get name(){ return T('虚空紫'); },
    main:0x1c1030, dark:0x0c0618, steel:0xb46cff, poly:0x160c26, grip:0x0e0719,
    glow:0x9a4dff, glowI:1.25, deco:'aura' },
};
const SKIN_IDS=Object.keys(SKINS);
/* 皮肤加成：只给一点主题色，不破坏平衡（纯外观，零属性） */
function skinOf(id){ return SKINS[id]||SKINS.skin_none; }

/* 根据皮肤造一组材质。
   【为什么要重建而不是改色】
   MeshStandardMaterial 的 color 可以 setHex 临时改，但每个 mesh 可能
   共享同一个材质对象（mat() 每次新建所以其实不共享），
   为了安全起见重新造一套最省心，而且开火前的重建频率只有「换武器/换皮肤」
   这一次，不在每帧执行。 */
function skinMats(sk){
  const g=Math.max(0,sk.glowI||0);
  const mk=(col)=>{ const m=mat(col,0.42,0.85);
    if(g>0 && sk.glow){
      m.emissive=new THREE.Color(sk.glow);
      m.emissiveIntensity=g;
    }
    return m;
  };
  return { main:mk(sk.main), dark:mk(sk.dark), steel:mk(sk.steel),
           poly:mk(sk.poly), grip:mk(sk.grip) };
}

/* 当前装备的皮肤（存在 P.skins[slot] 里，没设就用原厂） */
function curSkinId(){
  const id=slotItem(P.slot);
  if(!id) return 'skin_none';
  const m=(P.skins&&P.skins[id])||null;
  return (m&&SKINS[m]) ? m : 'skin_none';
}
function setSkin(itemId, skinId){
  if(!SKINS[skinId]) return false;
  if(!P.skins) P.skins={};
  P.skins[itemId]=skinId;
  _modelCache.key=null;        // 强制下次 applyWeaponModel 重建
  return true;
}

/* ---- 雷明顿 M870 泵动霰弹枪 ----
   结构和步枪不同：
     1) 下挂弹管（tube）—— 泵动枪的标志，子弹塞在枪管下面
     2) 可滑动的护木（pumpGrip）—— 这是泵动动作的本体，
        开完一枪它要往后拉 7cm 再推回去
     3) 没有弹匣，靠弹管供弹
   护木必须单独拿出来建，并挂到 g.userData 之外通过返回值带出去，
   因为动画要单独改它的 position.z。 */
function buildM870(PAL){
  const g=new THREE.Group();
  const C=PAL||{main:0x35302a,dark:0x15171b,steel:0x5e646e,poly:0x5a3d22};
  const dark=mat(C.main,0.62,0.45);   // 木纹/聚合物
  const black=mat(C.dark,0.6,0.85);
  const steel=mat(C.steel,0.34,0.95);
  const wood=mat(C.poly,0.78,0.15);

  // 机匣
  const recv=new THREE.Mesh(new THREE.BoxGeometry(0.075,0.082,0.26), dark);
  recv.position.set(0,0.030,-0.06); g.add(recv);
  // 枪管（粗，霰弹枪特征）
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.026,0.026,0.52,12), steel);
  barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.046,-0.44); g.add(barrel);
  // 下挂弹管
  const tube=new THREE.Mesh(new THREE.CylinderGeometry(0.020,0.020,0.42,10), black);
  tube.rotation.x=Math.PI/2; tube.position.set(0,0.006,-0.40); g.add(tube);
  // 弹管帽
  const cap=new THREE.Mesh(new THREE.CylinderGeometry(0.023,0.023,0.03,10), steel);
  cap.rotation.x=Math.PI/2; cap.position.set(0,0.006,-0.61); g.add(cap);
  // 可动护木（泵动本体）
  const pumpGrip=new THREE.Mesh(new THREE.BoxGeometry(0.062,0.056,0.14), wood);
  pumpGrip.position.set(0,0.006,-0.30); g.add(pumpGrip);
  /* 护木上的防滑纹（两条细槽），让它一眼能看出是泵动握把 */
  for(const dz of [-0.035,0.035]){
    const rib=new THREE.Mesh(new THREE.BoxGeometry(0.066,0.010,0.010), black);
    rib.position.set(0,0.006,-0.30+dz); g.add(rib);
  }
  // 握把（枪颈）
  const grip=new THREE.Mesh(new THREE.BoxGeometry(0.056,0.14,0.078), wood);
  grip.position.set(0,-0.095,0.075); grip.rotation.x=-0.34; g.add(grip);
  // 枪托
  const stock=new THREE.Mesh(new THREE.BoxGeometry(0.056,0.085,0.22), wood);
  stock.position.set(0,0.010,0.26); g.add(stock);
  // 托底
  const butt=new THREE.Mesh(new THREE.BoxGeometry(0.060,0.11,0.032), black);
  butt.position.set(0,0.004,0.375); g.add(butt);
  // 抛壳口
  const ej=new THREE.Mesh(new THREE.BoxGeometry(0.078,0.032,0.055), black);
  ej.position.set(0,0.042,0.040); g.add(ej);
  /* 机瞄：霰弹枪用「珠状准星 + 缺口照门」，
     珠星放在枪口上方，照门在机匣尾，两者构成瞄准线 */
  const bead=new THREE.Mesh(new THREE.SphereGeometry(0.007,8,8), steel);
  bead.position.set(0,0.076,-0.665); g.add(bead);
  const rear=new THREE.Mesh(new THREE.BoxGeometry(0.030,0.013,0.014), black);
  rear.position.set(0,0.074,0.055); g.add(rear);
  /* 把护木暴露出去：泵动动画要单独动它。
     THREE.Group 的 userData 在真机里能用，但测试桩里的
     Group 桩不保证有 userData 字段，所以统一在 updWeapon 里兜底创建。 */
  if(!g.userData) g.userData={};
  g.userData.pumpGrip=pumpGrip;
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

/* ============ 近战武器模型 ============
   五种刀，形状各不相同：
     knife   战术小刀  —— 短、直、通用
     karambit 爪刀      —— 弯刃，视觉最骚，反手握
     katana  太刀/长刀  —— 细长，挥砍感强
     machete 砍刀      —— 宽刃，厚背
     axe     战术斧    —— 斧头，沉重
   每个都是「刀刃 + 护手 + 刀柄 + 握持手」，只是几何参数和角度不同。
   配色来自皮肤系统，发光皮肤会让刀刃发光。

   姿态说明：近战武器在 FPS 里视角要更靠中间，
   所以整体往画面中心挪一点，握持角度也换成「反手握」的侧面姿态。 */

/* 在刀柄上叠几道指槽，所有刀共用 */
function knifeGrooves(g,rim,y0,n,step,w,h,z){
  for(let i=0;i<n;i++){
    const groove=new THREE.Mesh(new THREE.BoxGeometry(w,h,w*0.95), rim);
    groove.position.set(0,y0+i*step,z); g.add(groove);
  }
}

/* ---- 战术小刀：短直刃 ---- */
function buildKnifeTypeKnife(PAL){
  const g=new THREE.Group();
  const C=PAL||{steel:0xc9d3e0,grip:0x23272e,rim:0x8a939f};
  const steel=mat(C.steel,0.35,0.65);
  const grip=mat(C.grip,0.95,0.05);
  const rim=mat(C.rim||C.grip,0.5,0.4);
  const handle=new THREE.Mesh(new THREE.BoxGeometry(0.030,0.115,0.030), grip);
  handle.position.set(0,-0.03,0.02); g.add(handle);
  knifeGrooves(g,rim,-0.065,3,0.028,0.034,0.008,0.02);
  const guard=new THREE.Mesh(new THREE.BoxGeometry(0.062,0.012,0.034), rim);
  guard.position.set(0,0.032,0.02); g.add(guard);
  const blade=new THREE.Mesh(new THREE.BoxGeometry(0.026,0.20,0.010), steel);
  blade.position.set(0,0.14,0.02); blade.rotation.x=-0.04; g.add(blade);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(0.014,0.055,4), steel);
  tip.position.set(0,0.265,0.018); tip.rotation.y=Math.PI/4; g.add(tip);
  return g;
}

/* ---- 爪刀：弯刃，反手 ---- */
function buildKnifeTypeKarambit(PAL){
  const g=new THREE.Group();
  const C=PAL||{steel:0xc9d3e0,grip:0x1b1f26,rim:0x8a939f};
  const steel=mat(C.steel,0.30,0.75);
  const grip=mat(C.grip,0.92,0.08);
  const rim=mat(C.rim||C.grip,0.45,0.5);
  /* 指环：爪刀的灵魂，放在刀柄尾部 */
  const ring=new THREE.Mesh(new THREE.TorusGeometry(0.028,0.008,8,16), rim);
  ring.position.set(0,-0.075,0.02); ring.rotation.x=Math.PI/2; g.add(ring);
  /* 刀柄（短，带指槽） */
  const handle=new THREE.Mesh(new THREE.BoxGeometry(0.026,0.085,0.028), grip);
  handle.position.set(0,-0.028,0.02); handle.rotation.x=-0.12; g.add(handle);
  knifeGrooves(g,rim,-0.055,2,0.032,0.030,0.009,0.02);
  /* 弯刃：三段拼接画出弧线（不用自定义几何体） */
  const seg1=new THREE.Mesh(new THREE.BoxGeometry(0.022,0.085,0.009), steel);
  seg1.position.set(0.004,0.048,0.024); seg1.rotation.z=0.18; g.add(seg1);
  const seg2=new THREE.Mesh(new THREE.BoxGeometry(0.020,0.085,0.009), steel);
  seg2.position.set(0.026,0.104,0.024); seg2.rotation.z=0.62; g.add(seg2);
  const seg3=new THREE.Mesh(new THREE.BoxGeometry(0.018,0.075,0.009), steel);
  seg3.position.set(0.062,0.140,0.024); seg3.rotation.z=1.05; g.add(seg3);
  /* 刃尖 */
  const tip=new THREE.Mesh(new THREE.ConeGeometry(0.011,0.050,4), steel);
  tip.position.set(0.098,0.152,0.024); tip.rotation.z=-2.5; g.add(tip);
  return g;
}

/* ---- 太刀：细长弯刃 ---- */
function buildKnifeTypeKatana(PAL){
  const g=new THREE.Group();
  const C=PAL||{steel:0xdfe8f2,grip:0x1a1a22,rim:0xc9a227};
  const steel=mat(C.steel,0.22,0.85);
  const grip=mat(C.grip,0.9,0.1);
  const rim=mat(C.rim||C.grip,0.35,0.7);
  /* 长刀柄（双手握，比较粗长） */
  const handle=new THREE.Mesh(new THREE.BoxGeometry(0.032,0.20,0.032), grip);
  handle.position.set(0,-0.085,0.02); g.add(handle);
  /* 柄卷：一圈圈的菱形记号 */
  for(let i=0;i<6;i++){
    const wrap=new THREE.Mesh(new THREE.BoxGeometry(0.036,0.012,0.036), rim);
    wrap.position.set(0,-0.165+i*0.032,0.02); wrap.rotation.z=0.25; g.add(wrap);
  }
  /* 镡（圆形护手） */
  const tsuba=new THREE.Mesh(new THREE.CylinderGeometry(0.042,0.042,0.010,16), rim);
  tsuba.rotation.x=Math.PI/2; tsuba.position.set(0,0.030,0.02); g.add(tsuba);
  /* 刀身：很长，轻微弯（两段折角近似弧度） */
  const blade=new THREE.Mesh(new THREE.BoxGeometry(0.024,0.42,0.008), steel);
  blade.position.set(0.004,0.245,0.02); blade.rotation.z=0.035; g.add(blade);
  const upper=new THREE.Mesh(new THREE.BoxGeometry(0.022,0.16,0.008), steel);
  upper.position.set(0.022,0.525,0.02); upper.rotation.z=0.16; g.add(upper);
  const tip=new THREE.Mesh(new THREE.ConeGeometry(0.011,0.062,4), steel);
  tip.position.set(0.048,0.628,0.02); tip.rotation.z=2.9; g.add(tip);
  return g;
}

/* ---- 砍刀：宽厚刃 ---- */
function buildKnifeTypeMachete(PAL){
  const g=new THREE.Group();
  const C=PAL||{steel:0xa8b4c4,grip:0x2b2118,rim:0x6b5540};
  const steel=mat(C.steel,0.45,0.55);
  const grip=mat(C.grip,0.9,0.08);
  const rim=mat(C.rim||C.grip,0.7,0.2);
  /* 木柄 */
  const handle=new THREE.Mesh(new THREE.BoxGeometry(0.036,0.145,0.042), grip);
  handle.position.set(0,-0.048,0.02); g.add(handle);
  knifeGrooves(g,rim,-0.095,3,0.036,0.040,0.010,0.02);
  /* 厚背护手 */
  const guard=new THREE.Mesh(new THREE.BoxGeometry(0.058,0.020,0.048), rim);
  guard.position.set(0,0.030,0.02); g.add(guard);
  /* 宽刃：底面比小刀宽一倍，前端稍斜 */
  const blade=new THREE.Mesh(new THREE.BoxGeometry(0.052,0.30,0.012), steel);
  blade.position.set(0.004,0.185,0.02); blade.rotation.z=-0.03; g.add(blade);
  /* 刃背加强脊 */
  const spine=new THREE.Mesh(new THREE.BoxGeometry(0.014,0.29,0.016), steel);
  spine.position.set(-0.022,0.183,0.02); g.add(spine);
  /* 斜尖 */
  const tip=new THREE.Mesh(new THREE.ConeGeometry(0.030,0.085,4), steel);
  tip.position.set(0.008,0.370,0.02); tip.rotation.z=0.28; tip.rotation.y=Math.PI/4; g.add(tip);
  return g;
}

/* ---- 战术斧：斧头 ---- */
function buildKnifeTypeAxe(PAL){
  const g=new THREE.Group();
  const C=PAL||{steel:0x8f9aa8,grip:0x241a12,rim:0x5c4632};
  const steel=mat(C.steel,0.42,0.7);
  const grip=mat(C.grip,0.94,0.06);
  const rim=mat(C.rim||C.grip,0.8,0.15);
  /* 长柄：竖直圆柱 */
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(0.017,0.019,0.52,10), grip);
  shaft.position.set(0,0.02,0.02); g.add(shaft);
  /* 柄尾缠绕 */
  for(let i=0;i<3;i++){
    const wrap=new THREE.Mesh(new THREE.CylinderGeometry(0.021,0.021,0.014,10), rim);
    wrap.position.set(0,-0.16+i*0.026,0.02); g.add(wrap);
  }
  /* 斧头：一块厚楔形 —— 用 Box 斜切近似 */
  const head=new THREE.Mesh(new THREE.BoxGeometry(0.030,0.13,0.020), steel);
  head.position.set(0.040,0.235,0.02); g.add(head);
  /* 斧刃：前端薄片，稍微外扩 */
  const edge=new THREE.Mesh(new THREE.BoxGeometry(0.048,0.155,0.010), steel);
  edge.position.set(0.076,0.235,0.02); edge.rotation.z=0.06; g.add(edge);
  /* 斧背：反面的钝头 */
  const poll=new THREE.Mesh(new THREE.BoxGeometry(0.026,0.075,0.028), steel);
  poll.position.set(-0.010,0.235,0.02); g.add(poll);
  /* 斧头和柄的连接座 */
  const collar=new THREE.Mesh(new THREE.BoxGeometry(0.034,0.060,0.034), rim);
  collar.position.set(0.006,0.235,0.02); g.add(collar);
  return g;
}

/* 刀型分派：物品 id -> 形状 */
const KNIFE_BUILDERS={
  knife:  buildKnifeTypeKnife,
  karambit: buildKnifeTypeKarambit,
  katana: buildKnifeTypeKatana,
  machete: buildKnifeTypeMachete,
  axe:    buildKnifeTypeAxe,
};
/* 根据物品 id 决定用哪个刀型；认不出就当战术小刀 */
function knifeKindOf(itemId){
  const it=(typeof SHOP_ITEMS!=='undefined') && SHOP_ITEMS[itemId];
  const k=it && it.knife;
  return (k && KNIFE_BUILDERS[k]) ? k : 'knife';
}
/* 建刀 + 挂握持手（原来的 buildKnife 保持可用，供旧调用点） */
function buildKnife(kind, PAL){
  const fn=KNIFE_BUILDERS[kind]||KNIFE_BUILDERS.knife;
  const g=fn(PAL);
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
  // 位置：右下方，略微内收（腰射基准位姿，updWeapon 会每帧重算）
  weaponRoot.position.set(0.19,-0.17,-0.38);
  /* 【模型改为按需创建】
     以前这里一次性预建 rifle/pistol/knife 三把模型常驻内存，
     但它们既不支持皮肤也不支持多种刀型。
     现在只建一个空引擎，真的模型交给 applyWeaponModel()
     按「当前物品 id + 皮肤」生成，换枪时重建。 */
  camera.add(weaponRoot);
  if(!scene.children.includes(camera)) scene.add(camera); // 相机必须在场景里才会渲染子物体
  wsk={ activeModel:null, pumpGrip:null };
  applyWeaponModel();
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
/* 后备弹字段：按「当前这把枪用什么弹」决定，不能按槽位硬写。
   以前主武器一律返回 'rifle'，装了 M870（吃 shot）就会
   从步枪弹里扣后备，换弹时还会把霰弹位置错扣空。
   ammoType 已经在 SHOP_ITEMS 里登记好（rifle/pistol/sniper/shot），
   这里直接用它；没登记才退回按槽位的老逻辑。 */
function curReserveKey(){
  if(curIsMelee()) return null;
  const it=curItem();
  const at=it&&it.ammoType;
  if(at==='rifle'||at==='pistol'||at==='sniper'||at==='shot') return at;
  return curIsPrimary() ? 'rifle' : 'pistol';
}
/* 当前武器的伤害（数据来自物品表，买更好的枪就更疼） */
function curDamage(){
  /* 近战读物品表的 dmg：小刀 35 / 爪刀 42 / 太刀 56 / 战术斧 95。
     以前这里写死成 40，导致买更贵的刀伤害完全没变（花钱没效果）。 */
  if(curIsMelee()){
    const mit=curMeleeItem();
    return (mit&&mit.dmg) || 40;
  }
  const id=slotItem(P.slot);
  const it=id&&SHOP_ITEMS[id];
  return (it&&it.dmg) || (curIsPrimary()?26:14);
}
/* ---- 射击模式 ----
   auto = 全自动（按住持续开火）
   semi = 半自动（一次扳机一发，射速由 fireCd 限制）
   bolt = 栓动（每发之间要拉枪机，冷却很长）
   pump = 泵动（每发之间要拉护木，见 pumpTime）
   近战不算枪械：单发、无模式。
   数据来自 SHOP_ITEMS[id].fireMode，没写就当 semi —— 这样以后
   新加武器忘了填字段也不会变成突突突。 */
const FIRE_MODES=['auto','semi','bolt','pump'];
function curItem(){
  if(curIsMelee()) return null;
  const id=slotItem(P.slot);
  return (id&&SHOP_ITEMS[id])||null;
}
/* 取当前手持武器的物品数据，近战也算（curItem 对近战返回 null，
   因为枪械逻辑要把刀排除在外，但刀的伤害/间隔/范围需要读表）。 */
function curMeleeItem(){
  const id=slotItem(P.slot);
  return (id&&SHOP_ITEMS[id])||null;
}
function curFireMode(){
  if(curIsMelee()) return 'melee';
  const it=curItem();
  const m=it&&it.fireMode;
  return FIRE_MODES.includes(m) ? m : 'semi';
}
/* 只有全自动才允许「按住不放持续开火」。
   semi/bolt/pump/melee 都得重新按一次。 */
function curIsAuto(){ return curFireMode()==='auto'; }
/* 开火间隔：优先读物品表的 fireCd；
   以前写死成 primary 0.12 / secondary 0.18，导致狙击枪和步枪
   射速一模一样，栓动枪完全没有手感。 */
function curFireCd(){
  /* 近战武器各有自己的挥砍间隔（斧头慢、爪刀快） */
  if(curIsMelee()){
    const mit=curMeleeItem();
    return (mit&&mit.meleeCd) || 0.42;
  }
  const it=curItem();
  if(it && it.fireCd) return it.fireCd;
  return curIsPrimary() ? 0.12 : 0.18;
}
/* 泵动/栓动要额外拉栓的时间（只对 pump 有意义） */
function curPumpTime(){
  const it=curItem();
  const t=it&&it.pumpTime;
  return (typeof t==='number' && t>0) ? t : 0;
}
/* 霰弹枪一次打几颗弹丸；普通枪是 1 */
function curPellets(){
  const it=curItem();
  const n=it&&it.pellets;
  return (typeof n==='number' && n>1) ? (n|0) : 1;
}
/* 后坐力系数：霰弹枪/栓动枪甩得厉害，冲锋枪最稳 */
function curRecoilK(){
  const it=curItem();
  const k=it&&it.recoil;
  return (typeof k==='number' && k>0) ? k : 1;
}
/* 射击模式的 HUD 显示名（走 i18n） */
function fireModeLabel(){
  switch(curFireMode()){
    case 'auto': return T('全自动');
    case 'semi': return T('半自动');
    case 'bolt': return T('栓动');
    case 'pump': return T('泵动');
    default:     return T('近战');
  }
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

/* 根据当前武器切换显示。
   模型的生命周期已经交给 applyWeaponModel()，这里只需要
   在切槽时刷新一次即可（它内部会做脏检查，重复调用无代价）。 */
function syncWeapon(){
  if(!weaponRoot) return;
  _modelCache.key=null;     // 强制重建，因为槽位变了
  applyWeaponModel();
  /* 换枪瞬间把武器往下甩一点（P.slotT 控制），
     0 -> 1 表示「放下旧枪又抬上新枪」的过渡。 */
  if(P.slotT!==undefined) P.slotT=Math.min(1,P.slotT);
}
/* ---- 按「物品 id + 皮肤」重建模型 ----
   以前主武器槽只有一个步枪模型，买什么长枪都长一样。
   现在模型 = 物品 id 对应的形状 × 当前皮肤配色，
   换枪/换皮肤都需要重建，所以用 cacheKey 做脏检查。

   【为什么要重建而不是只改材质颜色】
   皮肤会改发光（emissive），而 MeshStandardMaterial 的 emissive
   在一个条链路上套用不上时不好统一改；重建一次只发生在换枪瞬间，
   每帧跑不到，性能上是可接受的。
   旧模型必须从 weaponRoot 里 remove 掉，否则换几次皮肤就会
   在相机前面叠一堆看不见的废模型。 */
const _modelCache={key:null};
function curModelKind(){
  if(P.slot==='melee') return 'knife';
  if(P.slot==='secondary') return 'pistol';
  const it=curItem();
  if(it && (it.pellets>1 || it.ammoType==='shot')) return 'shotgun';
  return 'rifle';
}
/* 把皮肤配色转成各 builder 认识的形式 */
function skinPaletteFor(kind){
  const sk=skinOf(curSkinId());
  if(kind==='knife'){
    return { steel:sk.steel, grip:sk.grip, rim:sk.steel };
  }
  return { main:sk.main, dark:sk.dark, steel:sk.steel,
           poly:sk.poly, grip:sk.grip };
}
function buildWeaponFor(kind){
  const PAL=skinPaletteFor(kind);
  if(kind==='knife'){
    const id=slotItem(P.slot);
    return buildKnife(knifeKindOf(id), PAL);
  }
  if(kind==='pistol') return buildPistol(PAL);
  if(kind==='shotgun') return buildM870(PAL);
  return buildRifle(PAL);
}
function applyWeaponModel(){
  if(!weaponRoot) return;
  const id=slotItem(P.slot)||'__none__';
  const kind=curModelKind();
  const skin=curSkinId();
  const key=id+'|'+kind+'|'+skin;
  if(_modelCache.key===key) return;      // 什么都没变，不碰节点
  _modelCache.key=key;
  /* 旧模型移走：不动 visible 而是直接 remove，避免堆积 */
  const old=wsk.activeModel;
  if(old && weaponRoot.children.indexOf(old)>=0) weaponRoot.remove(old);
  /* 新模型 */
  const m=buildWeaponFor(kind);
  /* 重新挂双手（新模型是新建的 Group，手也得重新加） */
  if(kind==='shotgun'){
    const sR=buildHand(false); sR.position.set(0.012,-0.115,0.10);
    const sL=buildHand(true);  sL.position.set(0.004,-0.078,-0.30);
    m.add(sR); m.add(sL);
  }else if(kind!=='knife'){
    /* 刀自带一只手，不额外加 */
    const rH=buildHand(false); rH.position.set(0.012,-0.115,0.10);
    const lH=buildHand(true);  lH.position.set(0.0,-0.115,0.10);
    m.add(rH); m.add(lH);
  }
  m.visible=true;
  weaponRoot.add(m);
  wsk.activeModel=m;
  /* 霰弹枪的护木引用要跟着换新模型更新，否则泵动动画会去动一个
     已经被 remove 掉的旧节点（表现为护木不动） */
  if(kind==='shotgun' && m.userData && m.userData.pumpGrip){
    wsk.pumpGrip=m.userData.pumpGrip;
  }else{
    wsk.pumpGrip=null;
  }
  /* 换枪时清零泵动进度，避免新枪一出来就在拉护木 */
  wPump=0;
  /* 皮肤带的装饰光环要重挂（因为整个模型换了） */
  attachAura(kind, skin);
}

/* ---- 皮肤装饰：环绕光环（只有 deco==='aura' 的皮肤才有） ----
   用两个半透明环叠在枪身上，配合 emissive 发光，
   看起来像「枪周围有一圈能量」。它们在 updWeapon 里缓缓旋转。 */
let _aura=null;
function attachAura(kind, skinId){
  if(_aura && _aura.parent) _aura.parent.remove(_aura);
  _aura=null;
  const sk=skinOf(skinId);
  if(!sk || sk.deco!=='aura') return;
  const m=wsk&&wsk.activeModel;
  if(!m) return;
  const col=new THREE.Color(sk.glow||sk.steel);
  const g=new THREE.Group();
  const rmat=new THREE.MeshBasicMaterial({ color:col, transparent:true, opacity:0.34,
    side:THREE.DoubleSide });
  const r1=new THREE.Mesh(new THREE.TorusGeometry(0.13,0.006,6,22), rmat);
  r1.rotation.x=Math.PI/2; r1.position.set(0,0.02,-0.18); g.add(r1);
  const r2=new THREE.Mesh(new THREE.TorusGeometry(0.09,0.004,6,18), rmat);
  r2.position.set(0,0.02,-0.10); g.add(r2);
  m.add(g);
  _aura=g;
}

/* ============ 检视武器（Inspect） ============
   按 F（桌面）或点 HUD 上的「检视」按钮，武器会在摄像头前
   转一圈给玩家看 —— 这是让皮肤/刀型能被看见的关键。
   时长 INSPECT_TIME 秒，wInsT 从 1 线性降到 0，
   姿势由 updWeapon 末尾按 sin 曲线叠加，结束时自动归位。
   检视期间不能开火（枪都转过去了），但可以移动。 */
const INSPECT_TIME=1.5;
function startInspect(){
  if(P.reload) return false;
  if(wInsT>0) return false;       // 正在检视就不重来
  wInsT=1;
  wInsDur=INSPECT_TIME;
  if(typeof sfxUI==='function') sfxUI();
  return true;
}
function updInspect(dt){
  if(wInsT<=0) return;
  wInsT=Math.max(0, wInsT - dt/Math.max(0.1,wInsDur));
}
function isInspecting(){ return wInsT>0; }

/* ---- 每帧更新：走路晃动/* ---- 每帧更新：走路晃动 + 后坐力回弹 + 换弹动作 + 奔跑收枪 + 机瞄 ----
   【机瞄位姿】
   开镜（P.aiming）时不能只缩 FOV —— 那样枪还停在屏幕右下方，
   看起来像「把镜头拉近了」而已，根本不像举枪瞄准。
   真正的机瞄要把武器模型平移到屏幕正中、把枪身上的准星/照门
   对齐到视线中点，同时把枪身旋转归零。
   每把枪的机构高度不同（pistol 0.093 / rifle 0.092 / sniper 镜筒 0.125），
   所以用物品表里的 adsZ / adsY / sightY 三个字段描述各自的瞄准位姿：
     adsZ   开镜后武器往镜头方向推多近（越大越近）
     adsY   开镜后整枪左右中心的 Y 偏移（让准星对准屏幕中心）
     sightY 这把枪瞄具的光轴高度，用来算「把光轴抬到 0」需要下移多少
   wAds 就是 0~1 的机瞄插值量，直接跟随 P.aimT（updP 里已经平滑过），
   这样开镜/关镜两边共用同一条曲线，不会一个快一个慢。
   以前 wAds 声明了但从不赋值、也不参与计算，等于死代码。 */
function updWeapon(dt){
  if(!weaponRoot||!wsk) return;
  /* 把当前武器按「物品 id + 刀型 + 皮肤」换成对应模型。
     【注意】以前这里会先比较 wsk.rifle/pistol/knife 三个模型的 visible
     再决定要不要 syncWeapon()，但那种「预建三个模型、靠 visible 切换」
     的做法已经被淘汰了（不支持皮肤和多刀型）。
     现在只有一个 activeModel，检查工作全在 applyWeaponModel() 里
     用 key 做脏检查，不一致才重建，一致就什么都不做。 */
  applyWeaponModel();
  /* 换枪动画：切槽后 P.slotT 从 0 涨到 1，
     这段时间武器整体往下沉，做「放下旧枪、抬起新枪」的观感。 */
  if(P.slotT<1) P.slotT=Math.min(1, P.slotT + dt*3.2);
  const swapDip=(1-P.slotT)*0.22;   // 0 -> 0.22 米的下坠量
  const spd=Math.hypot(P.vel.x,P.vel.z);
  const moving=spd>0.5&&P.onGround;
  const sprinting=P.sprinting&&moving;
  // 平滑过渡系数（避免姿态突变）
  const k=Math.min(1,dt*10);
  wSprint = wSprint+( (sprinting?1:0) - wSprint )*k;
  /* 机瞄插值：直接复用 updP 算好的 P.aimT（0~1）。
     奔跑时禁止机瞄：端着枪跑还开着镜不合逻辑，且会和冲刺姿态打架。
     近战没有机瞄（刀没瞄具），强制归零。 */
  /* 检视时也压掉机瞄：一边转枪一边开镜会互相打架 */
  const adsTarget = (P.aimT||0) * (1-wSprint) * (curIsMelee()?0:1) * (wInsT>0?0:1);
  const adsK = Math.min(1, dt*14);
  wAds += (adsTarget - wAds)*adsK;
  if(wAds<0.0005) wAds=0;
  // ===== 泵动/栓动作动：拉护木 =====
  updPump(dt, wAds);
  // ===== 皮肤光环缓缓旋转 =====
  if(_aura){ _aura.rotation.y += dt*1.35; _aura.rotation.z += dt*0.55; }
  // ===== 检视武器 =====
  updInspect(dt);
  // 走路晃动：冲刺时频率和幅度都加大
  wBobT+=dt*(moving?spd*(sprinting?2.1:1.6):0);
  const bobAmt=moving?Math.min(spd/10,1):0;
  const bobScale=sprinting?1.85:1;
  /* 开镜时晃动幅度大幅衰减（稳定持枪），不然准星一直在跳没法瞄 */
  const bobAds=(1-wAds*0.82);
  const bobX=Math.sin(wBobT)*0.012*bobAmt*bobScale*bobAds;
  const bobY=Math.abs(Math.cos(wBobT))*0.010*bobAmt*bobScale*bobAds;
  // 开火后坐力衰减
  if(wRecoil>0) wRecoil=Math.max(0,wRecoil-dt*6);
  /* 开镜后后坐力的视觉幅度减小：
     抵肩射击时枪身是往后顶的，不该像腰射那样乱甩。 */
  const recoilVis=wRecoil*(1-wAds*0.55);
  // 换弹下沉
  const reloadDip=P.reload?0.09:0;
  const reloadRot=P.reload?0.5:0;
  // ===== 奔跑姿态：枪身放低、向内倾斜、上下颠 =====
  // 右手枪判断（冲刺时把枪压低并向左收）
  const s2=wSprint;
  const bobRun=Math.sin(wBobT*1.0)*0.028*s2;
  /* ---- 枪身基准位姿（腰射） ---- */
  const hipX=0.19, hipY=-0.17, hipZ=-0.38;
  /* ---- 机瞄目标位姿 ----
     读取当前武器在物品表里登记的瞄准参数，
     没有装备数据（比如调试状态）就用步枪的默认值。 */
  const it=curItem();
  const adsZ = (it&&it.adsZ) || 0.62;
  const adsY = (it&&it.adsY) || 0.013;
  const sightY = (it&&it.sightY) || 0.092;
  /* 把光轴抬到屏幕中心：sightY 是瞄具相对枪身原点的高度，
     想让准星落在视线中心，枪身就得下移同样的量。
     再乘 0.55 是因为相机近裁剪和 FOV 会让实际视觉高度小于模型高度，
     全量下移会「瞄具跑到准星下面」，只下移一半左右最自然。 */
  const adsYTarget = adsY - sightY*0.55;
  const adsZTarget = -0.38 + (adsZ-0.62);   // 各枪自己推近，步枪=基准
  const a=wAds;
  /* 位置：腰射位姿 -> 机瞄位姿 线性插值
     X 收到 0（对准屏幕正中），Y 只保留微小偏移，Z 按枪型推近 */
  weaponRoot.position.x = (hipX + bobX*(1-a) - 0.055*s2)*(1-a) + 0.0*a;
  weaponRoot.position.y = ((hipY - bobY - recoilVis*0.03 - reloadDip) - 0.075*s2 + bobRun - swapDip)*(1-a)
                          + (adsYTarget - recoilVis*0.012 - swapDip)*a;
  weaponRoot.position.z = ((-0.38 + recoilVis*0.06) + 0.055*s2)*(1-a)
                          + (adsZTarget + recoilVis*0.035)*a;
  /* 旋转：开镜时全部归零（枪身端正），奔跑时朝左下压 */
  weaponRoot.rotation.x = (recoilVis*0.16 + reloadRot*0.35 + 0.42*s2)*(1-a)
                          + (recoilVis*0.05)*a;
  weaponRoot.rotation.z = (Math.sin(wBobT*0.5)*0.02*bobAmt + reloadRot*0.25 + 0.30*s2)*(1-a);
  weaponRoot.rotation.y = ((P.reload?0.3:0) + 0.22*s2)*(1-a);
  /* ---- 叠加检视姿势（最后一步，直接加到已有位姿上） ----
     用 additive 的方式，这样不用重写前面那一大堆插值公式，
     检视结束后各分量回 0，武器自然回到原来的姿态。 */
  if(wInsT>0){
    const p=wInsT;                      // 1 -> 0
    const swing=Math.sin((1-p)*Math.PI); // 0 -> 1 -> 0 的来回
    weaponRoot.position.x += -0.26*p + Math.sin((1-p)*Math.PI*2)*0.05*p;
    weaponRoot.position.y += 0.10*p;
    weaponRoot.position.z += 0.12*p;
    weaponRoot.rotation.y += 1.15*swing + 0.35*p;
    weaponRoot.rotation.x += -0.28*swing;
    weaponRoot.rotation.z += 0.45*swing;
  }
}
/* 泵动动画：开完一枪后护木往后拉再推回去。
   wPump 在 fire() 里被置为 1，这里每帧衰减。
   用 sin 曲线：0->1 是往后拉，1->0 是往前推，一个来回 = 上膛完毕。
   护木模型的引用存在 wsk.pumpGrip，没有就跳过（手枪/步枪没护木）。 */
function updPump(dt){
  if(wPump<=0) return;
  const t=wPump;
  wPump=Math.max(0, wPump - dt/Math.max(0.05, wPumpDur));
  /* 曲线：先加速拉到底再推回，用 sin 做平滑 */
  const phase=Math.sin((1-t)*Math.PI);
  const g=wsk&&wsk.pumpGrip;
  if(g){
    if(!g.userData) g.userData={};
    if(g.userData.z0===undefined) g.userData.z0=g.position.z;
    /* 护木沿着枪身轴往后（+z）拉约 7cm */
    g.position.z = g.userData.z0 + phase*0.07;
  }
  /* 整枪也跟着泵动的节奏轻颤，增加手感 */
  if(wPump===0 && g){
    if(g.userData.z0!==undefined) g.position.z=g.userData.z0;
  }
}
/* 开火时调用：给模型加后坐 */
function weaponKick(){ wRecoil=Math.min(1.2,wRecoil+0.85); }
