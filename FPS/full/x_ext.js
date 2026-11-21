/* ============ x_ext.js：场景扩展（大操场 / 可交互门 / 少量NPC） ============ */
/* 依赖 b_world 里的 scene / colliders / box() / cyl() / groundDeco()。

   这一块要解决三个问题：
     1) 只能在教学楼外活动 —— 建筑原本都是实心 box，没有门洞，
        玩家被整面墙挡在外面。现在给主教学楼/东西楼/行政楼都开了真门，
        并且把遮挡门洞的那段墙体精确扣掉，人能真的走进去。
     2) 交互 —— 靠近门显示「开门」，按 E 或点屏幕提示即可开关。
     3) NPC 太多 —— 敌人从 8 个降到 4 个，并分散到更大的场地。 */

/* ==================== 门系统 ==================== */
/* 每扇门 = 一块门板（既是可见 mesh 也是碰撞体）。
   开门时不重新算 AABB（成本高且容易抖），而是把门板
   从 colliders 数组里摘出来，关门时再塞回去。 */
const DOORS=[];
let nearDoor=null;          // 当前可交互的门

function mkDoor(x,z,w,h,color,axis){
  const frameC=0xb9a888, t=0.35;
  /* 门框：两侧立柱 + 上梁。只是装饰，不参与碰撞 */
  if(axis==='x'){
    box(t,h,t*2,frameC,x-w/2,h/2,z,true);
    box(t,h,t*2,frameC,x+w/2,h/2,z,true);
    box(w+t,h*0.14,t*2,frameC,x,h+h*0.07,z,true);
  }else{
    box(t*2,h,t,frameC,x,h/2,z-w/2,true);
    box(t*2,h,t,frameC,x,h/2,z+w/2,true);
    box(t*2,h*0.14,w+t,frameC,x,h+h*0.07,z,true);
  }
  const gw = (axis==='x') ? w : 0.18;
  const gd = (axis==='x') ? 0.18 : w;
  /* 门板也走程序化材质：原来只有 color+roughness+metalness，
     现在按颜色自动选金属/木/混凝土，尺寸小的门用 unit=1.2 保证纹理不过密 */
  const panelMat=matGetForSize(color, gw, h, gd, { unit:1.2 });
  const panel=new THREE.Mesh(
    new THREE.BoxGeometry(gw,h,gd),
    panelMat
  );
  panel.position.set(x,h/2,z);
  panel.castShadow=true; panel.receiveShadow=true;
  scene.add(panel); colliders.push(panel);
  const d={x,z,w,h,panel,axis,open:false,anim:0};
  DOORS.push(d);
  return d;
}

/* 开关门：把门板从 colliders 移入/移出，并做一点旋转动画 */
function setDoor(d,open){
  if(!d||d.open===open) return;
  d.open=open;
  const i=colliders.indexOf(d.panel);
  if(open){ if(i>=0) colliders.splice(i,1); }
  else { if(i<0) colliders.push(d.panel); }
  sfxUI();
}
function toggleDoor(d){ setDoor(d,!d.open); }

/* 找玩家附近最近的一扇门（2.6 米内） */
function findNearDoor(){
  let best=null, bd=2.6;
  for(const d of DOORS){
    const dist=Math.hypot(P.pos.x-d.x, P.pos.z-d.z);
    if(dist<bd){ bd=dist; best=d; }
  }
  return best;
}
/* 每帧调用：更新高亮提示 + 门板开关动画 */
function updDoors(dt){
  const nd=findNearDoor();
  const nc=findNearContainer();
  /* 【容器提示优先】站在箱子边上时提示「搜索」，
     而不是把「开门」写在上面让玩家以为只能开门。 */
  if(nc && nd){
    const el=$('doorHint');
    if(el){
      el.style.display='block';
      if(el.dataset.t!=='搜'){ el.dataset.t='搜';
        el.innerHTML='<b>E</b> 搜索 '+CONTAINER_NAME[nc.type].replace(/^\S+\s/,''); }
    }
  }
  else if(nd!==nearDoor){
    if(nearDoor) nearDoor.panel.material.emissive && nearDoor.panel.material.emissive.setHex(0x000000);
    nearDoor=nd;
    const el=$('doorHint');
    if(el){
      if(nd){ el.style.display='block'; }
      else el.style.display='none';
    }
  }
  if(nearDoor){
    const el=$('doorHint');
    if(el){
      const txt=(nearDoor.open?'关门':'开门');
      if(el.dataset.t!==txt){
        el.dataset.t=txt;
        el.innerHTML='<b>E</b> '+txt;
      }
    }
    // 轻微发亮表示可交互
    if(nearDoor.panel.material.emissive) nearDoor.panel.material.emissive.setHex(nearDoor.open?0x000000:0x223311);
  }
  /* 动画：门板绕自身一侧转开 95°。
     注意 mesh 位置固定在门洞中心，靠旋转让门板「让开」，
     视觉上足够，且不需要处理铰链几何。 */
  for(const d of DOORS){
    const want=d.open?1:0;
    if(Math.abs(d.anim-want)>0.001){
      d.anim += (want-d.anim)*Math.min(1,dt*8);
      if(Math.abs(d.anim-want)<0.01) d.anim=want;
      d.panel.rotation.y = d.anim * (Math.PI/2) * 0.94;
    }
  }
}
/* ==================== 给建筑开门洞 ==================== */
/* 原来的教学楼是一整块实心 box，玩家只能绕着外墙走。
   这里把「门窗那段墙」拆成两段，中间留出 4 米宽的门洞，
   再加一扇可开关的门板。拆墙必须在 buildSchool() 之后就做，
   所以这些补丁函数由 z_render 的 init 链在合适时机调用。 */

/* 主教学楼正面（朝南，z 从 -14 到 -6，墙厚 16）开一个 4 米宽门洞 */
/* 【关键】buildSchool 里已经有一整块 box(60,14,16) 的主楼体，
   如果只是「再叠两段带缝的墙」，原来那整面墙照样挡人，门洞根本不存在。
   所以这里必须拿到原 mesh 并把它从 colliders 里摘掉，再补两段新墙。 */
function dropMainBody(){
  /* 找主楼体：中心在 (0,7,-22)、尺寸 60x14x16 的那块 */
  for(let i=colliders.length-1;i>=0;i--){
    const m=colliders[i];
    if(!m.geometry) continue;
    if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb=m.geometry.boundingBox; if(!bb) continue;
    const w=bb.max.x-bb.min.x, h=bb.max.y-bb.min.y, d=bb.max.z-bb.min.z;
    if(Math.abs(w-60)<0.01 && Math.abs(h-14)<0.01 && Math.abs(d-16)<0.01
       && Math.abs(m.position.x)<0.01 && Math.abs(m.position.z+22)<0.01){
      scene.remove(m);
      colliders.splice(i,1);
      return true;
    }
  }
  return false;
}
function carveMainDoor(){
  dropMainBody();
  const gx=0, w=4.4, h=3.6;
  const segW=(60-w)/2;                    // 每段墙宽 27.8
  /* 左段墙 */
  box(segW,14,16,0xd9c6a3,-(w/2+segW/2),7,-22);
  /* 右段墙 */
  box(segW,14,16,0xd9c6a3, (w/2+segW/2),7,-22);
  /* 门洞上方的过梁 */
  box(w,14-h,16,0xd9c6a3,gx,(h+14)/2,-22);
  /* 门洞两侧的内外门套 */
  box(.4,h,.6,0xb9a888,-w/2,h/2,-14.2);
  box(.4,h,.6,0xb9a888, w/2,h/2,-14.2);
  box(.4,h,.6,0xb9a888,-w/2,h/2,-13.8);
  box(.4,h,.6,0xb9a888, w/2,h/2,-13.8);
  /* 可以开关的门板，装在靠南的墙面位置 */
  mkDoor(gx,-14.05,w-0.5,h,0x9a7a52,'x');
}

/* 沿 z 轴开洞的通用实现：先摘掉原整块 body，再拼南北两段 */
function dropBody(w,h,d,px,pz){
  for(let i=colliders.length-1;i>=0;i--){
    const m=colliders[i];
    if(!m.geometry) continue;
    if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb=m.geometry.boundingBox; if(!bb) continue;
    const bw=bb.max.x-bb.min.x, bh=bb.max.y-bb.min.y, bd=bb.max.z-bb.min.z;
    if(Math.abs(bw-w)<0.01 && Math.abs(bh-h)<0.01 && Math.abs(bd-d)<0.01
       && Math.abs(m.position.x-px)<0.01 && Math.abs(m.position.z-pz)<0.01){
      scene.remove(m);
      colliders.splice(i,1);
      return true;
    }
  }
  return false;
}

/* 东教学楼（x=-34，宽 16，z 从 -14 到 18，共 32 米）东侧开门 */
function carveEastDoor(){
  const gz=2, w=4, h=3.4;
  /* 尺寸必须和 buildSchool 里的新尺寸（32）一致，
     否则 dropBody 找不到原墙体，会留下「整面墙 + 两段新墙」的三重叠加。 */
  dropBody(16,14,32,-34,2);
  const segD=(32-w)/2;                 // 每段 14
  box(16,14,segD,0xd9c6a3,-34,7,-(w/2+segD/2)+gz);
  box(16,14,segD,0xd9c6a3,-34,7, (w/2+segD/2)+gz);
  box(16,14-h,w,0xd9c6a3,-34,(h+14)/2,gz);
  mkDoor(-25.95,gz,w,h,0x9a7a52,'z');
}

/* 西教学楼（x=34）西侧开门，与东楼对称 */
function carveWestDoor(){
  const gz=2, w=4, h=3.4;
  dropBody(16,14,32,34,2);
  const segD=(32-w)/2;
  box(16,14,segD,0xd9c6a3, 34,7,-(w/2+segD/2)+gz);
  box(16,14,segD,0xd9c6a3, 34,7, (w/2+segD/2)+gz);
  box(16,14-h,w,0xd9c6a3, 34,(h+14)/2,gz);
  mkDoor(25.95,gz,w,h,0x9a7a52,'z');
}

/* 行政楼（z=26，深 15，从 18.5 到 33.5）南面开门 */
/* 和主楼同理：先摘掉原来的整块 34x11x15，再拼两段。 */
function dropAdminBody(){
  for(let i=colliders.length-1;i>=0;i--){
    const m=colliders[i];
    if(!m.geometry) continue;
    if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb=m.geometry.boundingBox; if(!bb) continue;
    const w=bb.max.x-bb.min.x, h=bb.max.y-bb.min.y, d=bb.max.z-bb.min.z;
    if(Math.abs(w-34)<0.01 && Math.abs(h-11)<0.01 && Math.abs(d-15)<0.01
       && Math.abs(m.position.x)<0.01 && Math.abs(m.position.z-26)<0.01){
      scene.remove(m);
      colliders.splice(i,1);
      return true;
    }
  }
  return false;
}
function carveAdminDoor(){
  dropAdminBody();
  const gx=0, w=4, h=3.2;
  const segW=(34-w)/2;                    // 每段 15
  box(segW,11,15,0xcfbc9a,-(w/2+segW/2),5.5,26);
  box(segW,11,15,0xcfbc9a, (w/2+segW/2),5.5,26);
  box(w,11-h,15,0xcfbc9a,gx,(h+11)/2,26);
  mkDoor(gx,18.45,w,h,0x8a6a45,'x');
}

/* ==================== 操场扩容 ==================== */
/* 原来操场在 (20,30)，跑道 44x30，紧贴行政楼北侧，几乎没有活动空间。
   现在把整个操场搬到校园东北角的大空地上，做成 400m 标准场地，
   并补上篮球场/沙坑/看台/体育馆，让地图从「楼间小过道」变成有层次的场地。 */
function buildSportsZone(){
  /* 真正的草地底面（比跑道大一圈） */
  groundDeco(96,64,0x5f8a52,16,34);

  /* ---- 400m 跑道：8 条道 ---- */
  groundDeco(86,52,0xa83528,16,34);      // 红色跑道整体
  groundDeco(76,42,0x5c8a4f,16,34);      // 场地绿
  /* 分道线 */
  for(let i=1;i<=6;i++){
    groundDeco(76+i*1.6,42+i*1.6,0xffffff,16,34,.5);
  }
  /* 内场白边 */
  groundDeco(58,26,0xffffff,16,34,.55);
  groundDeco(56,24,0x4f7a45,16,34,1);
  /* 中线与中圈 */
  groundDeco(.3,24,0xffffff,16,34,.8);
  groundDeco(7,7,0xffffff,16,34,.25);

  /* ---- 足球门（两端） ---- */
  for(const gz of [22,46]){
    box(.25,2.4,.25,0xffffff,-12,1.2,gz,true);
    box(.25,2.4,.25,0xffffff,44,1.2,gz,true);
    box(56.25,.25,.25,0xffffff,16,2.4,gz,true);
  }

  /* ---- 看台（操场南侧，可走上去？不，用矮台阶即可） ---- */
  for(let i=0;i<4;i++){
    box(60,.7,1.6,0x9aa3ab,16,.35+i*0.7,60-i*1.7);
  }
  /* 看台遮阳棚支柱 */
  for(const sx of [-12,40]){
    cyl(.18,.18,7,0x888888,sx,3.5,58,true);
  }

  /* ---- 沙坑（跳远） ---- */
  groundDeco(9,5,0xdcc89a,52,-4);

  /* ---- 篮球场（操场西侧） ----
     【位置修正】原来放在 (-30,18)，但西教学楼在 x=34（16 宽，即 26..42），
     东教学楼在 x=-34（即 -42..-26）—— 也就是说 (-30,18) 正好在
     东教学楼肚子里，整块球场和两个篮球架都被埋在楼里，
     表现出来就是「球场线穿进教学楼」「篮球架看不见」。
     现在挪到东西楼之间的空地 (-18,6)，
     这片区域 x 从 -26 到 -10 是空的，尺寸也收窄到 12x20。 */
  groundDeco(12,20,0x46545f,-18,6);
  groundDeco(.3,18,0xffffff,-18,6,.85);
  groundDeco(12,.3,0xffffff,-18,6,.85);
  groundDeco(3,3,0xffffff,-18,6,.4);
  for(const bx of [-23.5,-12.5]){
    cyl(.14,.14,3.4,0x777777,bx,1.7,6,true);
    box(2.2,.14,1.2,0xffffff,bx,3.2,6,true);
  }

  /* ---- 体育馆（操场东侧的一栋新建筑，有门可进） ---- */
  /* 直接建成两段带门洞的样子，不要先造整块再拆 */
  const gymW=26, gymD=34, gymH=10, gymDoor=4;
  const gymSeg=(gymW-gymDoor)/2;      // 每段 11
  box(gymSeg,gymH,gymD,0xc8cdd4,58-(gymDoor/2+gymSeg/2),gymH/2,18);
  box(gymSeg,gymH,gymD,0xc8cdd4,58+(gymDoor/2+gymSeg/2),gymH/2,18);
  box(gymDoor,gymH-3.6,gymD,0xc8cdd4,58,(3.6+gymH)/2,18);   // 门洞过梁
  box(27,.6,35,0x6b7078,58,10.3,18);                        // 屋顶
  mkDoor(58,0.95,gymDoor,3.6,0x8a7a5a,'x');

  /* ---- 路灯（操场四角） ---- */
  for(const lp of [[-28,-2],[60,-2],[-28,62],[60,62]]){
    cyl(.12,.16,6,0x555555,lp[0],3,lp[1],true);
    const la=new THREE.Mesh(new THREE.SphereGeometry(.4,8,8),
      new THREE.MeshStandardMaterial({color:0xfff5d0,emissive:0xffeaa0,emissiveIntensity:.6}));
    la.position.set(lp[0],6.2,lp[1]); scene.add(la);
  }
}

/* ==================== NPC / 敌人布置 ==================== */
/* 原来 8 个敌人挤在 60x80 的楼间区域，走三步一个，完全没有「搜」的空间。
   现在砍到 4 个，并且分散到操场、篮球场、体育馆、教学楼一层内部，
   每个点位都藏在不同场景里，玩家需要主动去找。 */
/* 4 个点位，全部经过体检脚本验证不在任何碰撞体内：
     - 篮球场挪到 (-18,6) 之后，敌人跟着挪过去
     - 操场中央、体育馆内、主楼一层内保持不变 */
const NPC_POINTS=[
  [16,34],    // 操场中央，视野开阔
  [-18,6],    // 篮球场（修正：原来 (-30,18) 在东教学楼肚子里）
  [58,18],    // 体育馆内部
  [0,-22],    // 主教学楼一层内部
];

/* ==================== 统一交互入口 ==================== */
/* f_ui 里 KeyE 和右下角的交互按钮都调用 interact()，
   但之前这个函数根本没定义 —— 按 E 会直接 ReferenceError。
   现在把「当前可交互对象」集中在一处判断：
   门优先，其次才是拾取等其它交互。 */
function interact(){
  if(!P.alive) return;
  /* 【容器优先】搜打撤的核心动作是「搜」。站在箱子边上按 E，
     当然是想开箱子，而不是想开旁边那扇门。 */
  const c=findNearContainer();
  if(c){ openContainer(c); return true; }
  const d=findNearDoor();
  if(d){ toggleDoor(d); return true; }
  return false;
}
/* ==================== 局内容器 / 搜索 ====================
   设计要点：
   1. 容器是「稀疏资源」—— 不能三步一个，否则失去探索感。
      所以只在校舍、操场看台、体育馆等关键点位撒 11 个。
   2. 三种容器有不同产出战利品表：
        box 纸箱   杂货：绷带、止痛药、手枪弹、开锁器
        locker 铁柜 军械：头盔、护甲、配件、步枪弹
        med 医疗柜  医疗：医疗包、急救包、绷带
   3. 【关键】搜到的东西自动打「搜来的」标记（P.looted），
      撤离后卖出价格比原价高 —— 这是搜打撤的主要赚钱手段，
      否则玩家只能靠买低卖高，那就不叫搜打撤了。 */

/* 容器点位：坐标全部落在建筑外的空地或门口，
   避免生成在墙里导致玩家摸不到（此前 loot 就踩过这个坑）。 */
const CONTAINER_SPOTS=[
  {x:-8,  z:-4,  type:'box'},     // 主楼门前
  {x:8,   z:-4,  type:'locker'},  // 主楼门前东侧
  {x:-20, z:22,  type:'box'},     // 西楼侧空地
  {x:20,  z:22,  type:'med'},     // 东楼侧空地
  {x:0,   z:42,  type:'box'},     // 操场看台前
  /* 【坐标体检修正】原来 (-26,-6) 和 (26,-6) 正好压在东西教学楼
     外墙皮上（西楼 x:-42..-26，东楼 x:26..42），容器一半嵌进墙里。
     往外挪 4 米到楼外空地，且避开篮球场。 */
  {x:-46, z:-6,  type:'locker'},  // 西教学楼外（楼外空地）
  {x:46,  z:-6,  type:'med'},     // 东教学楼外（楼外空地）
  {x:52,  z:20,  type:'locker'},  // 体育馆内
  {x:-34, z:30,  type:'med'},     // 西北角
  {x:34,  z:36,  type:'box'},     // 东南角
  /* 原来 (-6,-30) 在主教学楼体内部（z:-30..-14），完全看不见。
     现在放到校门内侧偏西，避开正中主干道和石碑（石碑在 -9,-40）。 */
  {x:-20, z:-40, type:'box'},     // 校门内侧偏西
];
const containers=[];        // {x,z,type,mesh,opened,items:{id:cnt},used}
/* 战利品表：[物品id, 权重, 最小数量, 最大数量] */
const LOOT_TABLES={
  box:[
    ['bandage',30,1,3], ['painkill',18,1,2], ['ammo_pistol',24,1,2],
    ['med',14,1,2], ['lockpick',8,1,1], ['grenade',5,1,1],
    ['smoke',4,1,1], ['ammo_shot',10,1,1],
  ],
  locker:[
    ['ammo_rifle',26,1,2], ['helm_light',12,1,1], ['vest_light',10,1,1],
    ['mod_reddot',8,1,1], ['mod_grip_vert',9,1,1], ['mod_comp',7,1,1],
    ['mod_mag_ext',6,1,1], ['ammo_sniper',8,1,1], ['vest_med',4,1,1],
    ['mod_holo',4,1,1], ['helm_med',3,1,1],
  ],
  med:[
    ['med',30,1,2], ['bandage',28,2,4], ['painkill',18,1,2],
    ['med_kit',16,1,1], ['grenade',4,1,1],
  ],
};
const CONTAINER_NAME={ box:'📦 纸箱', locker:'🗄️ 铁柜', med:'🧰 医疗柜' };
const CONTAINER_COLOR={ box:0x8a6a3f, locker:0x5a6470, med:0xd8d2c4 };

/* 按权重从战利品表抽 n 件（允许重复，同类合并数量） */
function rollLoot(table, n){
  const out={};
  const total=table.reduce((s,e)=>s+e[1],0);
  for(let i=0;i<n;i++){
    let r=Math.random()*total, pick=null;
    for(const e of table){ r-=e[1]; if(r<=0){ pick=e; break; } }
    if(!pick) pick=table[table.length-1];
    const id=pick[0];
    const c=pick[2]+Math.floor(Math.random()*(pick[3]-pick[2]+1));
    out[id]=(out[id]||0)+c;
  }
  return out;
}
/* 建容器模型：一个矮方块 + 顶盖，不同颜色区分种类。
   容器要有碰撞，否则玩家会直接穿过它。 */
function spawnContainer(spot){
  const c=CONTAINER_COLOR[spot.type]||0x777777;
  const h = spot.type==='locker' ? 1.5 : 0.85;
  const w = spot.type==='locker' ? 0.9 : 1.1;
  const body=box(w, h, w*0.8, c, spot.x, h/2, spot.z);
  body.castShadow=true; body.receiveShadow=true;
  const lid=box(w*1.06, 0.1, w*0.86, c, spot.x, h+0.05, spot.z, true);
  lid.castShadow=true;
  const o={ x:spot.x, z:spot.z, type:spot.type, mesh:body, lid,
            opened:false, items:rollLoot(LOOT_TABLES[spot.type]||LOOT_TABLES.box, 2+((Math.random()*3)|0)) };
  containers.push(o);
  return o;
}
function buildContainers(){
  for(const m of containers){ try{ scene.remove(m.mesh); scene.remove(m.lid); }catch(e){} }
  containers.length=0;
  CONTAINER_SPOTS.forEach(spawnContainer);
}
/* 找离玩家最近、且在可交互距离内的容器 */
function findNearContainer(){
  let best=null, bd=2.2;
  for(const c of containers){
    if(c.opened && !Object.keys(c.items).length) continue;
    const d=Math.hypot(P.pos.x-c.x, P.pos.z-c.z);
    if(d<bd){ bd=d; best=c; }
  }
  return best;
}
/* ---- 搜索面板 ---- */
let cacheContainer=null;   // 当前打开的容器
function openContainer(c){
  cacheContainer=c;
  const el=$('lootBox'); if(!el) return;
  const ti=$('lbTitle'); if(ti) ti.textContent=CONTAINER_NAME[c.type]||'📦 容器';
  paintContainer();
  el.style.display='';
  sfxUI();
}
function closeContainer(){
  const el=$('lootBox'); if(el) el.style.display='none';
  cacheContainer=null;
}
function paintContainer(){
  const g=$('lbGrid'); if(!g) return;
  const c=cacheContainer;
  if(!c){ g.innerHTML=''; return; }
  let h='';
  const ids=Object.keys(c.items).filter(id=>c.items[id]>0 && SHOP_ITEMS[id]);
  if(!ids.length){
    h='<div class="lbEmpty">空的 · 已经搜干净了</div>';
  } else {
    for(const id of ids){
      const it=SHOP_ITEMS[id];
      /* 稀有物品（价格 ≥1000 或配件）高亮，让玩家一眼看到好东西 */
      const rare=(it.price>=1000 || it.cat==='mod')?' rare':'';
      h+='<div class="lbi'+rare+'" data-loot="'+id+'" title="'+it.name+'">'
        +it.icon+'<b>'+c.items[id]+'</b></div>';
    }
  }
  g.innerHTML=h;
  g.querySelectorAll('[data-loot]').forEach(node=>{
    node.onclick=()=>{ takeLoot(node.dataset.loot); };
  });
  const tip=$('lbTip');
  if(tip) tip.textContent='点物品拿取 · 背包 '+pouchUsed()+'/'+P.bagCap;
}
/* 从容器拿一件物品进背包。
   优先塞背包；背包满了如果胸挂能收就进胸挂（医疗/弹药正好是胸挂能收的），
   这样玩家不会因为背包装满了就白跑一趟。 */
function takeLoot(id){
  const c=cacheContainer; if(!c) return;
  if(!(c.items[id]>0)) return;
  const it=SHOP_ITEMS[id]; if(!it) return;
  let src=null;
  if(bagAdd(id,1)) src='bag';
  else if(typeof chestAccept==='function' && chestAccept(id) && chestFree()>0){
    if(!P.chestPouch[id]) P.chestPouch[id]=0;
    P.chestPouch[id]++; src='chest';
  }
  if(!src){ sfxDeny(); toast('背包和胸挂都满了'); return; }
  c.items[id]--;
  if(c.items[id]<=0) delete c.items[id];
  /* 【来源标记】搜来的东西记一笔，撤离后卖价更高。 */
  if(!P.looted[id]) P.looted[id]=0;
  P.looted[id]++;
  sfxPickup();
  paintContainer(); refreshHUD();
  if(!Object.keys(c.items).length){
    c.opened=true;
    if(c.lid){ c.lid.rotation.x=-0.5; c.lid.position.y+=0.1; }
    toast('已搜空 '+CONTAINER_NAME[c.type]);
    setTimeout(closeContainer,350);
  }
}
/* 绑定关闭按钮（只绑一次） */
function bindContainerUI(){
  const cl=$('lbClose');
  if(cl && !cl.__bound){ cl.__bound=true; cl.onclick=()=>{ closeContainer(); sfxUI(); }; }
  const el=$('lootBox');
  if(el && !el.__bound){ el.__bound=true;
    el.addEventListener('touchstart', e=>e.stopPropagation(), {passive:true}); }
}

/* 屏幕提示条点击也能开门（手机上没有键盘） */
function bindDoorHint(){
  const el=$('doorHint');
  if(!el||el.__bound) return;
  el.__bound=true;
  const tap=(e)=>{ e.preventDefault(); e.stopPropagation(); interact(); };
  el.addEventListener('touchstart',tap,{passive:false});
  el.addEventListener('click',tap);
}

/* ============ GM 隐藏面板 ============
   入口：主菜单连续点键盘 D 键 15 次。
   【为什么不用一个显眼的按钮】
   这是个调试/爽玩用的后门，不该让正常玩家误触，
   所以埋成打击键的彩蛋。连续按，中间断了就重新计数。
   面板可拖动（拖标题栏）、可收起（− 或 关闭），
   且不拦截游戏输入 —— 它浮在最上层，但点它自己的按钮才会响应。 */
const GM_HITS=15;              // 需要连点的次数
/* 【改成 4 秒】原来是 1200ms —— 手指在手机屏上点同一个位置，
   只要稍微喘口气就超过 1.2 秒，计数当场清零，等于是要求
   「每秒点 8 下且不能抖」，实际上没人做得到，于是表现为
   「GM 打不开了」。4 秒的窗口既保留了「连点」的仪式感，
   又不至于把人卡死在手感上。 */
const GM_RESET_MS=4000;        // 超过这么久没按就清零
let _gmCount=0, _gmLast=0, _gmOpen=false;

/* 加钱：直接改 P.ammo.cash，并立刻刷新所有显示金额的地方。
   注意不能只改 DOM —— P.ammo.cash 才是数据源，
   否则一刷新 HUD 就把假数字盖回去了。 */
function gmAddCash(n){
  const v=Number(n)||0;
  /* 只允许加钱：这个面板是「开发者给自己发钱」，
     不该能当扣钱按钮用（万一误点到 -9999999 把存档搞坏就麻烦了）。
     要减少金额请用「设定…」直接输入目标值。 */
  if(!(v>0)) return;
  P.ammo.cash=Math.max(0,(P.ammo.cash|0)+v);
  gmPaint();
  try{ refreshHUD(); }catch(e){}
  try{ if(typeof buildShop==='function') buildShop(); }catch(e){}
  try{ if(typeof buildMenuStats==='function') buildMenuStats(); }catch(e){}
  try{ if(typeof sfxUI==='function') sfxUI(); }catch(e){}
}
function gmSetCash(n){
  const v=Math.max(0,Math.floor(Number(n)||0));
  P.ammo.cash=v;
  gmPaint();
  try{ refreshHUD(); }catch(e){}
  try{ if(typeof buildShop==='function') buildShop(); }catch(e){}
}
function gmPaint(){
  const el=document.getElementById('gmCashNum');
  if(el) el.textContent=(P.ammo.cash|0).toLocaleString('en-US');
}

function gmToggle(force){
  const el=document.getElementById('gmPanel');
  if(!el) return;
  _gmOpen = (typeof force==='boolean') ? force : !_gmOpen;
  el.classList.toggle('on', _gmOpen);
  /* 在控制台里手动试的时候方便：__gm() 直接看状态 */
  if(window.__GM_DEBUG) console.log('[GM] open='+_gmOpen);
  if(_gmOpen){
    gmPaint();
    /* 第一次打开时把位置初始化到右下角，之后由拖动决定 */
    gmClampPos(el);
  }
}
/* 把面板夹在可视区域内，避免拖到屏幕外面就找不回来了 */
function gmClampPos(el){
  if(!el) return;
  const w=el.offsetWidth||236, h=el.offsetHeight||80;
  const W=window.innerWidth||360, H=window.innerHeight||640;
  let x=parseFloat(el.dataset.gx);
  let y=parseFloat(el.dataset.gy);
  if(!isFinite(x)) x=W-w-18;
  if(!isFinite(y)) y=H-h-18;
  x=Math.max(4,Math.min(W-w-4,x));
  y=Math.max(4,Math.min(H-h-4,y));
  el.dataset.gx=x; el.dataset.gy=y;
  el.style.left=x+'px'; el.style.top=y+'px';
  el.style.right='auto'; el.style.bottom='auto';
}
/* 拖动：pointer 事件对鼠标和触摸都生效，比分别绑 mousedown/touchstart 简洁。
   只在标题栏上发起拖动，避免在按钮上拖时点不到按钮。 */
function gmBindDrag(el, head){
  let dragging=false, sx=0, sy=0, ox=0, oy=0;
  const down=(e)=>{
    if(e.target && e.target.id==='gmMin') return;   // 收起按钮不触发拖动
    dragging=true;
    const p=gmPoint(e);
    sx=p.x; sy=p.y;
    ox=parseFloat(el.dataset.gx)||0;
    oy=parseFloat(el.dataset.gy)||0;
    if(e.cancelable) e.preventDefault();
  };
  const move=(e)=>{
    if(!dragging) return;
    const p=gmPoint(e);
    const W=window.innerWidth||360, H=window.innerHeight||640;
    const w=el.offsetWidth||236, h=el.offsetHeight||80;
    let nx=ox+(p.x-sx), ny=oy+(p.y-sy);
    nx=Math.max(4,Math.min(W-w-4,nx));
    ny=Math.max(4,Math.min(H-h-4,ny));
    el.dataset.gx=nx; el.dataset.gy=ny;
    el.style.left=nx+'px'; el.style.top=ny+'px';
    if(e.cancelable) e.preventDefault();
  };
  const up=()=>{ dragging=false; };
  head.addEventListener('pointerdown',down);
  window.addEventListener('pointermove',move,{passive:false});
  window.addEventListener('pointerup',up);
  window.addEventListener('pointercancel',up);
  /* 没有 pointer 事件的老 WebView 退化为 touch + mouse */
  if(!window.PointerEvent){
    head.addEventListener('touchstart',down,{passive:false});
    head.addEventListener('touchmove',move,{passive:false});
    head.addEventListener('touchend',up);
    head.addEventListener('mousedown',down);
    window.addEventListener('mousemove',move);
    window.addEventListener('mouseup',up);
  }
}
function gmPoint(e){
  if(e.touches && e.touches.length) return {x:e.touches[0].clientX,y:e.touches[0].clientY};
  if(e.changedTouches && e.changedTouches.length) return {x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};
  return {x:e.clientX||0,y:e.clientY||0};
}

/* 初始化：绑按钮 + 挂 D 键计数 */
function initGM(){
  const el=document.getElementById('gmPanel');
  if(!el || el.dataset.bound==='1') return;
  el.dataset.bound='1';
  const head=document.getElementById('gmHead');
  if(head) gmBindDrag(el, head);
  /* 金额按钮 */
  for(const btn of el.querySelectorAll('[data-gm]')){
    const amt=parseInt(btn.getAttribute('data-gm'),10);
    btn.addEventListener('click',(e)=>{ e.stopPropagation(); gmAddCash(amt); });
  }
  const setBtn=document.getElementById('gmSet');
  if(setBtn) setBtn.addEventListener('click',(e)=>{
    e.stopPropagation();
    /* 用原生 prompt：这个面板就是给开发者自己用的，
       为了它引入一个自制弹窗不划算。 */
    const cur=String(P.ammo.cash|0);
    const v=(typeof prompt==='function') ? prompt('设定资金（当前 '+cur+'）', cur) : null;
    if(v!==null && v!==undefined && v!=='') gmSetCash(v);
  });
  const hideBtn=document.getElementById('gmHide');
  if(hideBtn) hideBtn.addEventListener('click',(e)=>{ e.stopPropagation(); gmToggle(false); });
  const minBtn=document.getElementById('gmMin');
  if(minBtn) minBtn.addEventListener('click',(e)=>{
    e.stopPropagation();
    el.classList.toggle('min');
    minBtn.textContent=el.classList.contains('min')?'+':'−';
    gmClampPos(el);
  });
  /* 【手机上的解锁入口】操作说明里那个「D」按键图标可以点。
     手机压根没有键盘，光绑 keydown 等于把彩蛋锁死在桌面端；
     这里把菜单里的 <kbd id="gmKeyD">D</kbd> 也绑上，
     触屏和鼠标都能点，和键盘走同一个计数函数。
     touchstart + click 双绑：touchstart 让反馈更跟手，
     click 兜底老 WebView；两者都用 e.repeat 那套防重复逻辑
     （gmHitD 内部是计数，重复调用只会多加一次，所以这里
      用 preventDefault 挡掉 touchstart 之后浏览器补发的 click）。 */
  const keyD=document.getElementById('gmKeyD');
  if(keyD){
    let lastTouch=0;
    /* 直接调 gmCountHit：点得到这个 <kbd> 就说明菜单开着，
       不必再走 gmMenuVisible 的可见性判断（那一步是给键盘准备的，
       防止游戏里按 D 向右走时误触）。 */
    keyD.addEventListener('touchstart',(e)=>{
      lastTouch=Date.now();
      if(e.cancelable) e.preventDefault();
      gmCountHit();
    },{passive:false});
    keyD.addEventListener('click',(e)=>{
      e.stopPropagation();
      /* touchstart 刚处理过就别再算一次，否则点一下记两次 */
      if(Date.now()-lastTouch<600) return;
      gmCountHit();
    });
    /* 兜底：某些老 WebView 只派发 pointerdown 不派发 touchstart/click */
    keyD.addEventListener('pointerdown',(e)=>{
      if(e.pointerType==='mouse') return;   // 鼠标交给 click，避免双击记两次
      lastTouch=Date.now();
      gmCountHit();
    });
  }
}

/* 主菜单 D 键计数。
   【要点】只在菜单可见时计数，游戏中按 D 是「向右走」，
   不该被当成彩蛋触发。
   【为什么不能只查 style.display】菜单的默认显示来自 CSS 的
   `#menu{display:flex}`，内联 style.display 是空串而不是 'flex'，
   一旦哪天有人把内联值改掉（或换成 class 控制），
   这里的判断就会一直误判成「不可见」，面板怎么也开不出来。
   所以按优先级依次确认：内联 display: none -> 不可见；
   否则看计算样式（getComputedStyle）；拿不到计算样式时才退回内联值。 */
function gmMenuVisible(){
  const menu=document.getElementById('menu');
  if(!menu) return false;
  if(menu.style && menu.style.display==='none') return false;
  let vis='';
  try{
    if(window.getComputedStyle) vis=(window.getComputedStyle(menu).display||'');
  }catch(e){}
  if(!vis) vis=(menu.style&&menu.style.display)||'';
  return vis!=='none' && vis!=='';
}
function gmHitD(){
  if(!gmMenuVisible()) return;
  gmCountHit();
}
/* 真正计数的那一步，键盘和点击共用。
   【为什么不把可见性判断也放进来】点击「D」按键图标时，
   手指按在菜单上，菜单必然可见；但万一将来把 <kbd> 挪到别处
   （或者面板被别的层盖住），按可见性判断会直接吞掉点击，
   又变成「点了没反应」。所以点击入口信任调用方，
   键盘入口（可能在游戏里按到）才必须查可见性。 */
function gmCountHit(){
  const now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  if(now-_gmLast>GM_RESET_MS) _gmCount=0;
  _gmLast=now;
  _gmCount++;
  /* 从第 2 次开始给一点反馈：不然连点 15 下全程毫无动静，
     用户根本分不清是「没绑上」还是「还差几下」。
     toast 只在开局几次显示，避免最后几次刷屏。 */
  if(_gmCount>=2 && _gmCount<GM_HITS){
    try{ toast('GM ' + _gmCount + '/' + GM_HITS); }catch(e){}
  }
  if(window.__GM_DEBUG) console.log('[GM] '+_gmCount+'/'+GM_HITS);
  if(_gmCount>=GM_HITS){
    _gmCount=0;
    gmToggle(true);
    try{ toast('GM 面板已解锁'); }catch(e){}
  }
}
