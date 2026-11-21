/* ==================== u_floors.js：多楼层系统 ====================
   需求：「室内要 5 个楼层（对应 2D 的 2F、1F、-1F、-2F、地下室），
   有电梯和楼梯，遵守 2D 的玩法，比如保安、老师、黑钥匙，室内相当于 2D 的 3D」。

   【2D 版的实际楼层链】../full/b_world.js 第 57 行：
     var FLOOR_CHAIN = ['2F','1F','B1','B2','B3'];
   对应关系（用户说的名字 ↔ 2D 的代号）：
     2F  = 2F         教室层
     1F  = 1F         小卖部层
     -1F = B1         地下车库层
     -2F = B2         工具房层
     地下室 = B3      最深一层，有通到校外的楼梯
   五层一栋，跟 2D 完全一致。

   【每层内容（照 2D 的 b_world.js 复制意图）】
     2F  教室 / 老师办公室 / 厕所 / 电闸室
     1F  小卖部 / 校长办公室 / 厕所×2
     B1  地下车库 / 电闸 / 校长的车 / 厕所 / 保安室
     B2  工具房 / 厕所×2 / 制作室 / 主任办公室 / 电闸
     B3  地下室两段楼梯（一段回 B2，一段通校外 = 地下室撤离点）

   【3D 的实现方式 —— 关键设计】
   不能真的把 5 层都堆在同一个世界坐标里（会互相穿插，且相机看不见别的楼
   层还照样渲染，直接掉帧）。做法是「同一栋楼、按楼层切换场景内容」：
     · 整个校园只保留一栋主楼的位置，一层的家具摆在世界坐标上；
     · 进楼/上下楼时，把当前层的家具整组显示、其他层隐藏；
     · 玩家在楼里时，y 坐标被限制在「这一层的地板到天花板」之间；
     · 每层的地板 y 按层号错开 4 米，切换楼层时把玩家平移到对应高度。
   这样既有 5 层，又不增加渲染负担，而且不需要真实的多层建筑几何。

   【为什么不直接建 5 层实体】主楼已经是 60×14×16 的实心 box，
   真拆成 5 层就是 5 套楼板 + 5 套内墙 + 电梯井，
   碰撞体和 draw call 都会翻几倍，手机上必掉帧。
   现在的做法把开销控制在一层，视觉与玩法都到位。

   【楼梯 & 电梯】
   两者都是「交互点」：靠近按 E。楼梯是走上去的（相邻层），
   电梯可以选层（跳层）。这一点跟 2D 一样 ——
   2D 里楼梯只能一层一层走，电梯（电子门）在 B1。 */

/* ---- 楼层定义 ---- */
const FLOORS = [
  { id:'2F',  name:'2F 教室层',   y: 12, order:0, desc:'教室 / 老师办公室 / 厕所 / 电闸室' },
  { id:'1F',  name:'1F 小卖部层', y:  8, order:1, desc:'小卖部 / 校长办公室 / 厕所' },
  { id:'B1',  name:'-1F 车库层',  y:  4, order:2, desc:'地下车库 / 校长的车 / 保安室' },
  { id:'B2',  name:'-2F 工具层',  y:  0, order:3, desc:'工具房 / 制作室 / 主任办公室' },
  { id:'B3',  name:'地下室',      y: -4, order:4, desc:'通到校外的楼梯（撤离点）' }
];
/* 每层层高（米）。地板到天花板 3.4，留 0.6 给楼板厚度感。 */
const FLOOR_H = 3.4;

let curFloor = 1;              // 当前楼层索引（默认 1F = 1）
let floorGroups = [];          // 每层的 THREE.Group，切换时显隐
let inBuilding = false;        // 玩家是否在楼里

function floorByOrder(o){ return FLOORS[Math.max(0,Math.min(FLOORS.length-1,o))]; }
function floorGet(){ return FLOORS[curFloor] || FLOORS[1]; }
function floorY(i){ return (FLOORS[i]||FLOORS[1]).y; }

/* ---- 建一层的内部：把 buildInterior 的内容按层参数化 ---- */
/* 【复用主楼一层的布局】主楼原有一层的课桌/讲台/黑板/柜子布局是
   buildInterior() 里写的。这里不重复一份，而是用不同的「风格」
   在同一块地面区域上生成不同家具，做到 5 层可区分。 */
function buildFloorContent(fi, g){
  const f = FLOORS[fi];
  const y = f.y;
  /* 内部可用范围：与主楼一层一致（x -29..29，z -29..-15） */
  const X0=-29, X1=29, Z0=-29, Z1=-15;
  /* 地板 & 天花板：每层都铺，颜色随深度变暗 ——
     越往地下越暗，这是玩家判断「我现在多深」最直接的视觉线索。 */
  const depth = fi;                      // 0=2F, 4=B3
  const floorC = [0xc8c2b4, 0xb9b3a6, 0xa8a296, 0x93907f, 0x7d7a6b][depth] || 0xb9b3a6;
  const ceilC  = [0xe0dacc, 0xd6d0c2, 0xc4bdb0, 0xaea89b, 0x96907f][depth] || 0xd6d0c2;
  const bx = (w,h,d,c,px,py,pz,col)=>box(w,h,d,c,px,y+py,pz,col===undefined?true:col);

  bx(X1-X0, .1, Z1-Z0, floorC, (X0+X1)/2, -0.05, (Z0+Z1)/2, true);
  bx(X1-X0, .12, Z1-Z0, ceilC, (X0+X1)/2, FLOOR_H, (Z0+Z1)/2, true);

  /* 顶灯：2F 亮、越往下越少（地下层的压迫感） */
  const lampN = [4,4,3,2,1][depth] || 2;
  for(let i=0;i<lampN;i++){
    const lx = -21 + i*(42/Math.max(1,lampN-1));
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.6,.08,.4),
      new THREE.MeshStandardMaterial({color:0xffffff,
        emissive: depth>=3?0xffd9a0:0xfff4d6,
        emissiveIntensity: depth>=3?0.7:1.1}));
    lamp.position.set(lx, y+FLOOR_H-0.12, -22);
    g.add(lamp);
    /* 地下层加一盏真的点光源，否则进去全黑 */
    if(depth>=2 && i===Math.floor(lampN/2)){
      const pl=new THREE.PointLight(depth>=3?0xffd9a0:0xfff0cc, 1.2, 20, 2);
      pl.position.set(lx, y+FLOOR_H-0.3, -22);
      g.add(pl);
    }
  }

  /* ---- 按层生成家具 ---- */
  if(f.id==='2F'){
    /* 2F 教室层：三排课桌 + 讲台 + 黑板（与 2D 的 2F 一致） */
    const deskC=0x9a7b52, chairC=0x7a6a52;
    for(let r=0;r<3;r++){
      const dz=-27+r*4.2;
      for(const dx of [-24,-18,-12,-7,7,12,18,24]){
        bx(1.5,.08,1.0,deskC, dx, .78, dz, true);
        bx(.1,.75,.1,0x8a6a45, dx-.65,.38,dz-.42,true);
        bx(.1,.75,.1,0x8a6a45, dx+.65,.38,dz-.42,true);
        bx(.1,.75,.1,0x8a6a45, dx-.65,.38,dz+.42,true);
        bx(.1,.75,.1,0x8a6a45, dx+.65,.38,dz+.42,true);
        bx(.5,.06,.5,chairC, dx, .45, dz+0.85, true);
      }
    }
    bx(3.2,.5,1.2,0x8a6a45, 0, .25, -28.6, true);         // 讲台
    bx(9,3.0,.12,0x2f4a3a, 0, 1.9, -29.4, true);           // 黑板
    bx(9.2,3.2,.06,0xb08a5a, 0, 1.9, -29.46, true);        // 黑板框
  }
  else if(f.id==='1F'){
    /* 1F 小卖部层：货架 + 柜台 + 校长室门牌 */
    for(let i=0;i<4;i++){
      bx(1.2,2.0,.6,0x7a6a8a, -24+i*2.6, 1.0, -27, true);    // 货架
    }
    bx(6,.9,1.2,0x9a7b52, -18, .45, -16.5, true);            // 柜台
    bx(2.4,2.2,.15,0x5a4a3a, 14, 1.1, -28.9, true);          // 校长室门
    bx(1.6,.5,.08,0xd8b45a, 14, 2.5, -28.8, true);           // 门牌
  }
  else if(f.id==='B1'){
    /* B1 地下车库：车位线 + 一辆车 + 保安室 */
    for(let i=0;i<5;i++){
      bx(.12,.02,6,0xe8e8e8, -24+i*5, .02, -24, true);        // 车位线
    }
    /* 校长的车（2D 里 B1 有校长的车，砸车有成就） */
    bx(2.0,.9,4.4,0x2a3a5a, -12, .55, -24, true);             // 车身
    bx(1.8,.7,2.2,0x33456a, -12, 1.35, -24.4, true);          // 车顶
    bx(.3,.3,.3,0xfff0cc, -13.1, .9, -22.2, false);           // 车灯
    bx(3.0,2.6,3.0,0x8a8a8a, 18, 1.3, -26, true);             // 保安室
  }
  else if(f.id==='B2'){
    /* B2 工具层：工具台 + 制作台 + 主任办公室 */
    bx(4.0,.9,1.4,0x8a6a45, -20, .45, -26, true);              // 工具台
    for(let i=0;i<6;i++){
      bx(.12,.12,.9,0x9fb3c8, -21.6+i*0.7, 1.0, -26, false);   // 工具挂
    }
    bx(3.0,1.0,1.2,0x6a7a8a, 6, .5, -26, true);                // 制作台
    bx(2.4,2.2,.15,0x5a4a3a, 20, 1.1, -28.9, true);            // 主任办公室门
  }
  else {
    /* B3 地下室：只有两段楼梯 + 一个通校外的出口（撤离点） */
    bx(2.0,1.4,2.0,0x6a6a6a, -20, .7, -24, true);              // 上行楼梯台
    bx(2.0,1.4,2.0,0x6a6a6a, 20, .7, -24, true);               // 通校外出口台
    const exitLamp=new THREE.Mesh(new THREE.BoxGeometry(.8,.1,.8),
      new THREE.MeshStandardMaterial({color:0x33ff88,emissive:0x33ff88,emissiveIntensity:1.4}));
    exitLamp.position.set(20, y+FLOOR_H-0.5, -24);
    g.add(exitLamp);
  }

  /* 每层两侧各留一个容器点位（配合 CONTAINER_SPOTS 的室内点位） */
  bx(1.2,2.0,.6,0x6a7a8a, -27.5, 1.0, -20, true);
  bx(1.2,2.0,.6,0x6a7a8a, 27.5, 1.0, -20, true);
}

/* ---- 构建全部楼层（隐藏的层不加入场景渲染） ---- */
function buildFloors(){
  /* 先清掉旧的分组（重开一局时会再调一次） */
  if(floorGroups && floorGroups.length){
    for(const g of floorGroups){ try{ scene.remove(g); }catch(e){} }
  }
  floorGroups = [];
  for(let i=0;i<FLOORS.length;i++){
    const g = new THREE.Group();
    g.visible = false;
    buildFloorContent(i, g);
    scene.add(g);
    floorGroups.push(g);
  }
  curFloor = 1;                 // 默认从 1F 进门
  inBuilding = false;
  setFloorVisible();
}

function setFloorVisible(){
  for(let i=0;i<floorGroups.length;i++){
    if(floorGroups[i]) floorGroups[i].visible = (i===curFloor);
  }
}

/* 切换楼层：把玩家放到该层地板上，并清速度避免穿层 */
function goFloor(idx, reason){
  const nb = Math.max(0, Math.min(FLOORS.length-1, idx|0));
  const f = nb===curFloor ? '' : FLOORS[nb].name;
  /* 楼板之间的家具切换是瞬间的，所以必须先摆好可见性再移动玩家，
     否则玩家会先看到旧层一秒。 */
  const oldY = floorY(curFloor);
  curFloor = nb;
  setFloorVisible();
  try{
    if(typeof P === 'object' && P.pos){
      /* 保持水平位置不变（楼梯/电梯都在同一处），只改高度 */
      P.pos.y = floorY(nb) + (typeof P.eyeH === 'number' ? P.eyeH : 1.7);
      P.vel.y = 0;
      P.onGround = true;
    }
  }catch(e){}
  try{ if(typeof sfxUI==='function') sfxUI(); }catch(e){}
  if(f){
    try{ toast('🏢 到达 '+f); }catch(e){}
  } else if(reason){
    try{ toast(reason); }catch(e){}
  }
  return FLOORS[nb];
}

/* ---- 楼梯 / 电梯 交互点 ---- */
/* 楼梯：2F↔1F↔B1↔B2↔B3 一层一层走，位置在主楼东西两端。
   电梯：放在主楼正中偏东，可以跳层（代价是声音大，会引敌人）。 */
const STAIR_SPOTS = [
  { x:-24, z:-22, kind:'stairs', up:true  },   // 西侧楼梯上行
  { x: 24, z:-22, kind:'stairs', up:false }    // 东侧楼梯下行
];
const ELEV = { x:10, z:-22, w:2.4, d:2.4 };

let nearFloorThing = null;      // {kind:'stairs'|'elev', dir}

function buildFloorTransports(){
  /* 楼梯：两级台阶 + 扶手，纯视觉 */
  for(const s of STAIR_SPOTS){
    for(let i=0;i<4;i++){
      box(2.0,.18,0.6, 0x8a8a8a, s.x, 0.09+i*0.18, s.z + (s.up?i*0.6:-i*0.6), true);
    }
    box(.1,.9,.1, 0xa0a0a0, s.x-0.95, 0.45, s.z, false);
    box(.1,.9,.1, 0xa0a0a0, s.x+0.95, 0.45, s.z, false);
  }
  /* 电梯：一个金属方舱 + 门缝 */
  box(ELEV.w, 2.6, ELEV.d, 0x9aa4b0, ELEV.x, 1.3, ELEV.z, true);
  box(.06, 2.2, ELEV.d*0.8, 0x6a7480, ELEV.x, 1.1, ELEV.z, false);
  const led=new THREE.Mesh(new THREE.BoxGeometry(.5,.3,.1),
    new THREE.MeshStandardMaterial({color:0x33ff88,emissive:0x33ff88,emissiveIntensity:1.0}));
  led.position.set(ELEV.x, 2.9, ELEV.z-1.25);
  scene.add(led);
}

/* ---- 每帧：检测玩家是否在楼里、是否靠近楼梯/电梯 ---- */
function updFloors(dt){
  if(!floorGroups.length) return;
  let inB=false, nd=null, bd=2.2;
  try{
    if(typeof P === 'object' && P.pos){
      const px=P.pos.x, pz=P.pos.z;
      /* 主楼内部范围（x -29..29，z -29..-15） */
      inB = (px>-29 && px<29 && pz>-29 && pz>-15);
      if(inB){
        for(const s of STAIR_SPOTS){
          const dd=Math.hypot(px-s.x, pz-s.z);
          if(dd<bd){ bd=dd; nd={kind:'stairs', dir:s.up?'up':'down', spot:s}; }
        }
        const de=Math.hypot(px-ELEV.x, pz-ELEV.z);
        if(de<bd){ bd=de; nd={kind:'elev'}; }
      }
    }
  }catch(e){}
  inBuilding = inB;
  nearFloorThing = inB ? nd : null;

  /* 楼内时把玩家的 y 锁在本层地板附近，防止从楼板缝隙掉下去。
     只在「脚底明显低于本层地板」时拉回，避免干扰正常跳跃。 */
  try{
    if(inB && typeof P === 'object' && P.pos){
      const base = floorY(curFloor) + (typeof P.eyeH==='number'?P.eyeH:1.7);
      if(P.pos.y < base - 2.5){ P.pos.y = base; P.vel.y = 0; }
    }
  }catch(e){}

  /* 提示：靠近楼梯/电梯时显示 */
  try{
    const el = document.getElementById('doorHint');
    if(el && nearFloorThing){
      el.style.display='block';
      if(nearFloorThing.kind==='elev'){
        el.innerHTML='<b>E</b> 电梯（'+floorGet().name+'）';
      } else {
        const tgt = nearFloorThing.dir==='up' ? (curFloor-1) : (curFloor+1);
        const t = tgt>=0 && tgt<FLOORS.length ? FLOORS[tgt].name : '（无）';
        el.innerHTML='<b>E</b> 楼梯 → '+t;
      }
    }
  }catch(e){}
}

/* 交互入口：由 x_ext 的 interact() 调用。
   返回 true 表示这次交互被楼层系统吃掉了。 */
function floorInteract(){
  if(!nearFloorThing) return false;
  if(nearFloorThing.kind==='elev'){
    /* 电梯：跳到「下一层」，到底了回到 2F（环形）。
       为什么不弹选层面板：手机上一个弹窗会打断节奏，
       而且 5 层环形其实就是「按 E 往下走一层」，够用。 */
    let nxt = curFloor + 1;
    if(nxt >= FLOORS.length) nxt = 0;
    goFloor(nxt, '电梯');
    return true;
  }
  if(nearFloorThing.kind==='stairs'){
    const tgt = nearFloorThing.dir==='up' ? curFloor-1 : curFloor+1;
    if(tgt<0 || tgt>=FLOORS.length){
      try{ toast('这里没有楼梯可走了'); }catch(e){}
      return true;
    }
    goFloor(tgt);
    return true;
  }
  return false;
}

/* ---- 黑钥匙（2D 里黑钥匙是开「电子门」的，绝密/超星才刷新） ---- */
/* 2D 版：blackkey 由蓝图 + 木头 + 锤子制作；3D 版没有制作系统，
   改为「难度允许时，室内容器有概率搜到」。
   对应需求「黑钥匙」与「限制结局」：普通难度根本不给黑钥匙。 */
const BLACKKEY_ID = 'blackkey';
function maybeSpawnBlackKey(){
  let d = null;
  try{ d = (typeof diffGet==='function') ? diffGet() : null; }catch(e){}
  if(!d || !d.blackKey) return false;
  /* 挂到「本局的容器战利品表」上：拿到 blackkey 的容器必须真的产出。
     做法是给 CONTAINER_SPOTS 里某个室内点位打标记，openContainer 时
     会额外塞一把黑钥匙。 */
  try{
    if(typeof CONTAINER_SPOTS==='array' || Array.isArray(CONTAINER_SPOTS)){
      const indoor = CONTAINER_SPOTS.filter(s=>s.x>-29 && s.x<29 && s.z>-29 && s.z>-15);
      if(indoor.length){
        indoor[Math.floor(Math.random()*indoor.length)].hasBlackKey = true;
      }
    }
  }catch(e){}
  return true;
}