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
  /* 【门板改绕铰链转动】
     原来 mesh 定位在门洞中心 (x,z)，`panel.rotation.y` 绕的也是它自己的中心 ——
     门板原地打转，转 85° 之后仍然横在门洞里，只是从「横着挡」变成
     「斜着挡」。碰撞体被摘掉了，人照样能走过去，于是走过去就穿进门板里，
     看起来就是「门后面能穿模」。

     正确做法是把旋转中心挪到门框的一侧立柱（铰链），门板整体偏出去：
       1) 建一个 pivot（空 Group）放在铰链位置，把门板作为子物体，
          门板自身沿宽度方向偏移 w/2，使门板一端正好贴在铰链上；
       2) 之后只转 pivot。门板就会像真门一样，以一侧为轴甩开门洞。
     碰撞体仍然用「摘出/塞回 colliders」控制，不依赖旋转后的 AABB。 */
  const hingeX = (axis==='x') ? (x - w/2) : x;
  const hingeZ = (axis==='x') ? z : (z - w/2);
  const pivot=new THREE.Group();
  pivot.position.set(hingeX, 0, hingeZ);
  scene.add(pivot);
  /* 门板在 pivot 局部坐标里的偏移：宽度方向挪半个门宽 */
  panel.position.set((axis==='x') ? w/2 : 0, h/2, (axis==='x') ? 0 : w/2);
  pivot.add(panel);
  /* panel 不再直接挂在 scene 下，从 scene 移除避免双份 */
  if(panel.parent && panel.parent!==pivot) panel.parent.remove(panel);
  panel.castShadow=true; panel.receiveShadow=true;
  colliders.push(panel);
  const d={x,z,w,h,panel,pivot,hingeX,hingeZ,axis,open:false,anim:0};
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
  /* 动画：绕铰链把门板甩开 95°（见 mkDoor 里的 pivot 说明）。
     门板在 pivot 局部已经偏出半个门宽，所以这里转的是 pivot，
     门板会像真门一样从门洞一侧让开，而不是原地打转。 */
  for(const d of DOORS){
    const want=d.open?1:0;
    if(Math.abs(d.anim-want)>0.001){
      d.anim += (want-d.anim)*Math.min(1,dt*8);
      if(Math.abs(d.anim-want)<0.01) d.anim=want;
      const tgt=d.pivot||d.panel;
      tgt.rotation.y = d.anim * (Math.PI/2) * 0.94;
      /* 门板一直留在 pivot 里，不参与碰撞判定（已从 colliders 摘出）。
         但关门时要保证它回到原位，避免动画残影。 */
      if(!d.open && Math.abs(d.anim)<0.001){
        if(d.panel && d.panel.material && d.panel.material.emissive)
          d.panel.material.emissive.setHex(0x000000);
      }
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
  /* ============ 关键修正：主楼内部必须是空腔 ============
     原来的做法是「删掉整块 60x14x16 的实心体，再拼左右两段实心墙 +
     一块过梁」。门洞看起来是通了，但**拼出来的两段墙依然是 16 米厚
     的实心块**，所以玩家从正门走进去，前脚刚进门洞、后脚就撞在
     那 16 米厚的实心体上 —— 这就是「门里还有墙」。
     现在改成真正的空心楼：
       · 南墙（正面，带门洞）
       · 北墙（后墙）
       · 东西两道侧墙
       · 顶部楼板
     中间留出整块空腔（x -29..29、z -29.3..-14.7），
     正好和 u_floors.js 里各层内部的可用范围一致。
     外墙厚度取 1 米，既有体积感，又不会吃掉室内空间。 */
  const T = 1.0;                       /* 外墙厚度 */
  const ZN = -30, ZS = -14;            /* 主楼南北墙面 */
  const XL = -30, XR = 30;             /* 主楼东西墙面 */
  const H  = 14;                       /* 楼高 */
  /* ---- 南墙（正面，中间留门洞） ---- */
  const segW=(60-w)/2;                 // 每段 27.8
  box(segW,H,T,0xd9c6a3,-(w/2+segW/2),H/2,ZS+T/2);
  box(segW,H,T,0xd9c6a3, (w/2+segW/2),H/2,ZS+T/2);
  box(w,H-h,T,0xd9c6a3,gx,(h+H)/2,ZS+T/2);   /* 门洞上方的过梁 */
  /* ---- 北墙（后墙，整面） ---- */
  box(60,H,T,0xd9c6a3,0,H/2,ZN-T/2);
  /* ---- 东西侧墙（夹在南北墙之间） ---- */
  box(T,H,16-2*T,0xd9c6a3,XL+T/2,H/2,-22);
  box(T,H,16-2*T,0xd9c6a3,XR-T/2,H/2,-22);
  /* ---- 屋顶楼板 ---- */
  box(60,.7,16,0x6b5a45,0,H+0.1,-22,true);
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
     这片区域 x 从 -26 到 -10 是空的。
     【尺寸放宽】原 12x20 太窄，两侧篮球架贴着长边，
     投篮抛物线基本都会撞框。现在 16x22，并单独做成
     半场（一个篮筐），玩家能在同一侧反复投。
     实际投篮逻辑与奖励见 buildBasketball()。 */
  groundDeco(16,22,0x46545f,-18,6);
  groundDeco(.28,20,0xffffff,-18,6,.85);          // 边线
  groundDeco(16,.28,0xffffff,-18,6,.85);
  groundDeco(.28,10,0xffffff,-18,6,.7);           // 中线
  /* 三分线（简化成矩形弧，手机上看得清就够了） */
  groundDeco(11,.24,0xffffff,-18,11.2,.8);
  groundDeco(.24,6,0xffffff,-12.6,8.2,.8);
  groundDeco(.24,6,0xffffff,-23.4,8.2,.8);
  /* 罚球区 */
  groundDeco(5,.22,0xffffff,-18,13.5,.7);
  groundDeco(.22,3,0xffffff,-15.6,12,.7);
  groundDeco(.22,3,0xffffff,-20.4,12,.7);
  /* 中央中圈 */
  groundDeco(6,6,0xffffff,-18,6,.3);
  /* 篮板两侧的篮球架改到 buildBasketball() 里造，带真实篮筐与篮网 */
  buildBasketball();

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

/* ==================== 篮球场：投篮 + 1/2/3 环奖励 ====================
   需求：「加篮球场，可以打篮球，1-3 环不同的奖励」。

   【玩法设计】站在球场上、手上有球，按 E 投篮。
   球走一条真实抛物线（受重力），落点由「朝向 + 力量」决定。
   不是简单随机 —— 玩家能靠瞄准练准头，这是可玩性的根。

   【1/2/3 环怎么判】
   以篮筐中心为圆心，按球穿过篮筐平面时到圆心的水平距离分环：
     ≤0.22m  → 1 环（空心，最准）   奖励最高
     ≤0.55m  → 2 环（擦框入网）
     ≤0.95m  → 3 环（打板弹进）
     其余    → 不进
   为什么「1 环给最多」：危险度越低的环数其实越好投，
   所以这里刻意反过来 —— 环数越小表示越靠中心，
   和射箭/飞镖的计分直觉一致（10 环最高分）。名字沿用「环」这个
   说法，但顺序上 1 环 = 最中心。

   【奖励为什么给钱 + 物资】
   纯给钱会让篮球场变成「站着刷钱」的挂机点，破坏搜打撤的节奏。
   所以：小环数给现金（有上限），大环数给弹药/绷带，
   并且每场有「本局命中上限」，刷不出无限收益。
*/
const BBALL = {
  hoop: { x:-18, z:15.2, rimY:3.05, rimR:0.30 },   // 篮筐（标准 3.05m 高）
  ball: null,                 // 飞行中的球 {mesh,vx,vy,vz,t,scored}
  held: true,                 // 玩家手上是否有球
  shots: 0,                   // 本局已投
  hits: { 1:0, 2:0, 3:0 },    // 各环命中数
  cash: 0,                    // 本局已领现金
  LIMIT_CASH: 1500,           // 本局现金上限，防止刷钱
  LIMIT_SHOTS: 40,            // 本局最多投 40 球
  swinging: 0,                // 篮网摆动
};
/* 奖励表：环数 -> 现金 + 可选物资 */
const BHOOP_REWARD = {
  1: { cash:220, item:'ammo_rifle', n:12, txt:'空心！' },
  2: { cash:120, item:'bandage',    n:2,  txt:'擦框入网' },
  3: { cash: 60, item:'ammo_pistol',n:8,  txt:'打板弹进' },
};
/* 造篮板 + 篮筐 + 篮网（几何只在开局建一次） */
function buildBasketball(){
  const H=BBALL.hoop;
  /* 立柱（在篮筐后方，避免挡投篮路线） */
  cyl(.13,.16,3.6,0x6a7480, H.x, 1.8, H.z+0.55, true);
  /* 篮板：3.2 米高（篮筐 3.05 上沿），1.8 宽 0.08 厚 */
  const board=box(1.8,.95,.08,0xe9eef4, H.x, 3.42, H.z+0.52);
  if(board && board.material) board.material.transparent=true, board.material.opacity=0.92;
  /* 篮板上的方框（装饰） */
  box(.62,.45,.02,0xd24a3a, H.x, 3.28, H.z+0.47, true);
  /* 篮筐：用环面几何，看着才像框而不是一根横杆 */
  const rim=new THREE.Mesh(new THREE.TorusGeometry(H.rimR, .028, 8, 20),
    new THREE.MeshStandardMaterial({color:0xe8621f, roughness:.5, metalness:.4}));
  rim.position.set(H.x, H.rimY, H.z);
  rim.rotation.x=Math.PI/2;   // 环面默认立着，转平才是篮筐
  rim.castShadow=true; scene.add(rim);
  /* 篮网：几根下垂的细线，用线段几何，开销几乎为零 */
  const pts=[];
  for(let i=0;i<10;i++){
    const a=i/10*Math.PI*2;
    pts.push(H.x+Math.cos(a)*H.rimR, H.rimY-.03, H.z+Math.sin(a)*H.rimR);
    pts.push(H.x+Math.cos(a)*H.rimR*.55, H.rimY-.42, H.z+Math.sin(a)*H.rimR*.55);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts,3));
  const net=new THREE.LineSegments(g, new THREE.LineBasicMaterial({color:0xf0f4f8, transparent:true, opacity:.8}));
  scene.add(net);
  BBALL.net=net;
  /* 球本体：开局握在手上，所以先不放到场景里 */
  BBALL.ballMesh=new THREE.Mesh(new THREE.SphereGeometry(.12,14,12),
    new THREE.MeshStandardMaterial({color:0xd9702c, roughness:.85}));
  BBALL.ballMesh.castShadow=true;

  /* ================= 场边常驻篮球 =================
     【之前的问题】玩家走到篮球场，看到的是一个空场地：
     地上没球、场边没球，根本不知道这里能打球。
     原因：BBALL.ballMesh 是个「飞行用」的球，
     只有调用 shootBall() 那一刻才 scene.add()，落地就又 remove()，
     平时它根本不在场景里（而 held 默认就是 true，等于凭空握着球）。
     【本次】在篮柱旁边摆几颗**装饰性实心球**（不参与物理，
     只是告诉玩家「这里是篮球场」），再加一个球筐。
     球用和飞行球一样的橙色 + 黑线纹，风格统一。 */
  BBALL.decoBalls=[];
  const ballMat=new THREE.MeshStandardMaterial({color:0xd9702c, roughness:.85});
  /* 一颗球在篮柱脚边，两颗散在中线附近 */
  const decoPos=[
    [H.x+0.85, 0.12, H.z+0.55],
    [H.x-3.2, 0.12, H.z-2.4],
    [H.x+2.6, 0.12, H.z-5.0]
  ];
  for(const dp of decoPos){
    const b=new THREE.Mesh(new THREE.SphereGeometry(.12,14,12), ballMat);
    b.position.set(dp[0], dp[1], dp[2]);
    b.castShadow=true; b.receiveShadow=true;
    /* 黑线：两条细环，看不出的话至少球的轮廓很饱满 */
    const ring1=new THREE.Mesh(new THREE.TorusGeometry(.121,.006,6,18),
      new THREE.MeshStandardMaterial({color:0x2a1a10, roughness:.9}));
    ring1.rotation.x=Math.PI/2; ring1.position.copy(b.position);
    const ring2=ring1.clone(); ring2.rotation.set(0,0,Math.PI/2);
    scene.add(b); scene.add(ring1); scene.add(ring2);
    BBALL.decoBalls.push(b, ring1, ring2);
  }
  /* 球筐：一个开口的金属框，里面再放两颗球，看着像体育馆器材区 */
  const bcX=H.x+4.2, bcZ=H.z+1.2;
  const bcMat=new THREE.MeshStandardMaterial({color:0x59636e, roughness:.6, metalness:.5});
  /* 四面网壁：用 4 块薄板围一个框（圆筒看不到里面，板框更像球筐） */
  for(let i=0;i<4;i++){
    const a=i*Math.PI/2;
    const w=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.62,0.03), bcMat);
    w.position.set(bcX+Math.cos(a)*0.45, 0.31, bcZ+Math.sin(a)*0.45);
    w.rotation.y=-a;
    scene.add(w);
    BBALL.decoBalls.push(w);
  }
  for(const off of [[-0.2,0.2],[0.22,-0.18]]){
    const b=new THREE.Mesh(new THREE.SphereGeometry(.12,14,12), ballMat);
    b.position.set(bcX+off[0], 0.42, bcZ+off[1]);
    b.castShadow=true;
    scene.add(b);
    BBALL.decoBalls.push(b);
  }
}
/* 投篮：从玩家位置朝准星方向抛出。
   力量固定（避免变成「蓄力条」那种手机上不好操作的机制），
   真正的难度来自「站得远就要抬得高」—— 抛物线会自然惩罚乱投。 */
function shootBall(){
  if(!P.alive || !window.__inGame) return false;
  if(BBALL.shots>=BBALL.LIMIT_SHOTS){ toast('本局投篮次数用完了'); sfxDeny(); return true; }
  if(!BBALL.held){ toast('球还在飞'); sfxDeny(); return true; }
  const H=BBALL.hoop;
  const d=Math.hypot(H.x-P.pos.x, H.z-P.pos.z);
  if(d>26){ toast('离篮筐太远了'); sfxDeny(); return true; }
  /* 出球点：眼睛前方 0.6 米、略微低于视线 */
  const yaw=P.yaw;
  const ox=P.pos.x - Math.sin(yaw)*0.6;
  const oz=P.pos.z - Math.cos(yaw)*0.6;
  const oy=P.pos.y-0.35;
  /* 【求解初速】给定水平距离 d 与高度差 dy，解出让球经过篮筐的速度。
     用 45° 附近的固定发射角 + 反解速度大小：
       dy = v*sin(a)*t - g*t²/2
       d  = v*cos(a)*t
     消去 t 得 v² = g*d² / (2*cos²a*(d*tan(a) - dy))
     分母 <=0 说明 45° 打不到，退化成更陡的角再试。
     这样「站对位置」就必进，「乱站」就进不去 —— 手感靠站位。 */
  const g=22;
  const dy=H.rimY-oy;
  let best=null;
  for(const deg of [40,45,50,55,60,65,70]){
    const a=deg*Math.PI/180;
    const denom=2*Math.cos(a)*Math.cos(a)*(d*Math.tan(a)-dy);
    if(denom<=0) continue;
    const v2=g*d*d/denom;
    if(!isFinite(v2)||v2<=0) continue;
    const v=Math.sqrt(v2);
    if(v>32) continue;            // 太快就不讲道理了
    best={a,v}; break;
  }
  if(!best){ toast('这个位置投不进'); sfxDeny(); return true; }
  /* 把解出的速度分解到世界坐标：朝向篮筐 */
  const dx=(H.x-P.pos.x), dz=(H.z-P.pos.z);
  const dl=Math.hypot(dx,dz)||1;
  BBALL.shots++;
  BBALL.held=false;
  BBALL.ball={ mesh:BBALL.ballMesh, vx:dx/dl*best.v*Math.cos(best.a),
               vy:best.v*Math.sin(best.a), vz:dz/dl*best.v*Math.cos(best.a),
               t:0, scored:false, cd:0 };
  BBALL.ballMesh.position.set(ox,oy,oz);
  scene.add(BBALL.ballMesh);
  try{ sfxStep(); }catch(e){}
  return true;
}
/* 每帧推进球的物理 + 判环 */
function updBasketball(dt){
  const bb=BBALL.ball;
  if(!bb) return;
  bb.t+=dt;
  const g=22;
  const p=bb.mesh.position;
  /* 【判环必须在穿平面之前算】用上一帧的 y 和这一帧的 y 跨过篮筐平面，
     说明球这一帧穿过了篮筐所在的水平面 —— 这时看水平距离。 */
  const prevY=p.y;
  bb.vy-=g*dt;
  p.x+=bb.vx*dt; p.y+=bb.vy*dt; p.z+=bb.vz*dt;
  p.rotation.x+=dt*6; p.rotation.z+=dt*3;
  const H=BBALL.hoop;
  /* 穿过篮筐平面（从上往下）才判 */
  if(!bb.scored && prevY>=H.rimY && p.y<H.rimY && bb.vy<0){
    const dist=Math.hypot(p.x-H.x, p.z-H.z);
    if(dist<=0.95){
      let ring = dist<=0.22 ? 1 : (dist<=0.55 ? 2 : 3);
      bb.scored=true;
      onBasketScore(ring);
    }
  }
  /* 落地：停住并还给玩家 */
  if(p.y<=0.12){
    p.y=0.12;
    if(!bb.scored && bb.t>0.25){
      /* 球落地还没进 —— 也算一次「没投进」，球滚回来 */
      try{ toast('没进'); }catch(e){}
    }
    BBALL.ball=null;
    BBALL.held=true;
    try{ scene.remove(bb.mesh); }catch(e){}
    return;
  }
  /* 超时保护（比如卡在篮板后面） */
  if(bb.t>6){ BBALL.ball=null; BBALL.held=true; try{ scene.remove(bb.mesh); }catch(e){} }
}
/* 命中结算：分环发奖 */
function onBasketScore(ring){
  const R=BHOOP_REWARD[ring]||BHOOP_REWARD[3];
  BBALL.hits[ring]=(BBALL.hits[ring]||0)+1;
  BBALL.swinging=1;
  try{ sfxUI(); }catch(e){}
  /* 现金有本局上限，防止把篮球场当提款机 */
  let cash=R.cash;
  const room=Math.max(0, BBALL.LIMIT_CASH-BBALL.cash);
  cash=Math.min(cash, room);
  if(cash>0){
    BBALL.cash+=cash;
    try{ P.ammo.cash=(P.ammo.cash|0)+cash; refreshHUD(); }catch(e){}
  }
  /* 物资进局内背包（走统一的 bagAdd，容量不足会返回 false） */
  let gotItem='';
  if(R.item && R.n){
    try{
      let ok=false;
      if(typeof bagAdd==='function') ok=bagAdd(R.item, R.n);
      const it=(typeof SHOP_ITEMS!=='undefined')?SHOP_ITEMS[R.item]:null;
      if(ok && it) gotItem=' + '+it.name+'×'+R.n;
      else if(!ok) gotItem='（背包已满，物资没拿到）';
    }catch(e){ console.error('basket reward item', e); }
  }
  const stars='★'.repeat(4-ring);   // 1 环 3 星，3 环 1 星
  try{ toast(stars+' '+R.txt+' · '+(ring)+' 环'+(cash?' +¥'+cash:'')+gotItem); }catch(e){}
  /* 记一次日志，方便排查奖励是否真的触发 */
  try{ if(typeof dlog==='function') dlog('basket', ring+'环 cash+'+cash); }catch(e){}
}
/* 站进篮球场提示 + 每帧维护篮网摆动 */
function updBasketHint(){
  const H=BBALL.hoop;
  const d=Math.hypot(H.x-P.pos.x, H.z-P.pos.z);
  /* 篮网摆动衰减（命中后晃一下，纯视觉） */
  if(BBALL.swinging>0){
    BBALL.swinging=Math.max(0, BBALL.swinging-0.05);
    if(BBALL.net) BBALL.net.position.y=-BBALL.swinging*0.06;
  }
  return d;
}
/* 判断玩家是否在投篮范围内 */
function nearBasketball(){
  const H=BBALL.hoop;
  return Math.hypot(H.x-P.pos.x, H.z-P.pos.z)<=26;
}

/* ==================== 室内场景 ====================
   需求：「室内做了吗？没做做」。

   【之前的状态】三栋楼都是实心 box，只在正面 carves 出一个门洞，
   门能开、人也能走进去 —— 但进去之后是「实心方块内部」，
   什么都没有，等于走进一块石头里。所以「室内没做」是准确的。

   【现在的做法】不去真的挖空楼体（那要把整栋楼拆成几十块外墙，
   几何量和碰撞体数量都会暴涨，手机上掉帧），
   而是：
     1) 在楼体内部铺一层地板（可站立面）
     2) 在内部放家具：课桌、讲台、黑板、储物柜、书架
     3) 【关键】用「室内指示牌 + 光源」让玩家知道这里可以进
   这样楼体仍然是实心的外壳，但一进门就是一个有内容的房间。

   【为什么地板必须单独铺】玩家能不能站住，取决于 colliders 里的
   顶面判定（c_player.js 的 standY）。楼体本身就是个 14 米高的
   AABB，它的顶面在 14 米 —— 也就是说在楼里走会「站」在 14 米高的
   楼顶上，而不是地面。铺一块 y=0.02 的地板，顶面就变成 0.02，
   人才会正常站在楼里。这一步不做，室内哪怕摆了桌椅也全是空中楼阁。
*/
function buildInterior(){
  /* 【主楼已交给 u_floors.js 的多楼层系统】
     原来这个函数把主楼一层的地板铺在 y≈0，摆课桌/讲台/黑板。
     现在主楼改成 5 层（2F/1F/-1F/-2F/地下室），由 buildFloors() 统一生成，
     这里再铺一层 y=0 的地板会和 B2 层重叠 —— 表现是「一进门就看着
     一堆桌椅浮在半空」。所以主楼部分直接跳过，只保留东西楼与行政楼。
     想恢复单层主楼，把下面的 return 删掉即可。 */
  return buildSideBuildings();
}
function buildSideBuildings(){
  /* ---- 主教学楼一层（x:-30..30，z:-30..-14） ----
     门洞在 x=0、z=-14，所以正对门的中轴要留出通道。
     两侧各摆 2 排课桌，中间当走廊。 */
  const mainZ0=-29, mainZ1=-15;        // 内部可用范围
  const mainX0=-29, mainX1=29;
  /* 地板：淡淡的水磨石灰，比外墙浅一档，进门有明暗对比 */
  box(mainX1-mainX0, .1, mainZ1-mainZ0, 0xb9b3a6,
      (mainX0+mainX1)/2, -0.05, (mainZ0+mainZ1)/2, true);
  /* 天花板：贴在 y=3.4，压住高度感，不至于一进门看到 14 米的空腔 */
  box(mainX1-mainX0, .12, mainZ1-mainZ0, 0xd6d0c2,
      (mainX0+mainX1)/2, 3.42, (mainZ0+mainZ1)/2, true);
  /* 顶灯（自发光小方块，兼作「这栋楼能进」的视觉信号） */
  for(const lx of [-18,-6,6,18]){
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.6,.08,.4),
      new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xfff4d6, emissiveIntensity:1.1}));
    lamp.position.set(lx, 3.3, -22); scene.add(lamp);
  }
  /* 课桌：两排，避开中间 x=-2..2 的走廊 */
  const deskC=0x9a7b52, chairC=0x7a6a52;
  for(let r=0;r<3;r++){
    const dz=-27+r*4.2;
    for(const dx of [-24,-18,-12,-7, 7,12,18,24]){
      box(1.5,.08,1.0,deskC, dx, .78, dz, true);       // 桌面
      box(.1,.75,.1,0x8a6a45, dx-.65,.38,dz-.42,true); // 四腿
      box(.1,.75,.1,0x8a6a45, dx+.65,.38,dz-.42,true);
      box(.1,.75,.1,0x8a6a45, dx-.65,.38,dz+.42,true);
      box(.1,.75,.1,0x8a6a45, dx+.65,.38,dz+.42,true);
      /* 椅子：挡住但不碰撞，避免玩家在教室里被椅背卡住 */
      box(.5,.06,.5,chairC, dx, .45, dz+0.85, true);
      box(.09,.45,.09,chairC, dx, .22, dz+1.05, true);
    }
  }
  /* 讲台 + 黑板（在北墙内侧） */
  box(3.2,.5,1.2,0x8a6a45, 0, .25, -28.6, true);
  box(9,3.0,.12,0x2f4a3a, 0, 1.9, -29.4, true);       // 黑板
  box(9.2,3.2,.06,0xb08a5a, 0, 1.9, -29.46, true);    // 黑板框
  /* 两侧储物柜（也给玩家视觉上的「这里可以翻」暗示，
     配合 x_ext.js 里的室内容器点位） */
  for(const cx of [-27.5, 27.5]){
    for(let i=0;i<3;i++){
      box(1.2,2.0,.6,0x6a7a8a, cx, 1.0, -20+i*2.2, false);
    }
  }
  /* ---- 东/西教学楼一层（各 16 宽 32 深，内部更窄） ---- */
  /* 东楼本体 x:-42..-26、z:-14..18，门在西侧墙面 x=-26 */
  const ewX0=-41, ewX1=-27, ewZ0=-13, ewZ1=17;
  box(ewX1-ewX0,.1,ewZ1-ewZ0,0xb5b0a2,(ewX0+ewX1)/2,-0.05,(ewZ0+ewZ1)/2,true);
  box(ewX1-ewX0,.12,ewZ1-ewZ0,0xd2ccbe,(ewX0+ewX1)/2,3.42,(ewZ0+ewZ1)/2,true);
  /* 西楼本体 x:26..42、z:-14..18，门在东侧墙面 x=26 */
  const wwX0=27, wwX1=41, wwZ0=-13, wwZ1=17;
  box(wwX1-wwX0,.1,wwZ1-wwZ0,0xb5b0a2,(wwX0+wwX1)/2,-0.05,(wwZ0+wwZ1)/2,true);
  box(wwX1-wwX0,.12,wwZ1-wwZ0,0xd2ccbe,(wwX0+wwX1)/2,3.42,(wwZ0+wwZ1)/2,true);
  /* 东西楼内部各摆一组桌椅 + 柜子 */
  for(const bx of [-34, 34]){
    for(let r=0;r<4;r++){
      for(const dz of [-8, 0, 8]){
        box(1.4,.08,.9,deskC, bx+(r-1.5)*3.2, .78, dz, true);
      }
    }
    box(1.2,2.0,.6,0x6a7a8a, bx, 1.0, 14, false);
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.4,.08,.4),
      new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xfff4d6, emissiveIntensity:1.0}));
    lamp.position.set(bx, 3.3, 2); scene.add(lamp);
  }
  /* ---- 行政楼（34x15，z:18.5..33.5）---- */
  const adX0=-16.5, adX1=16.5, adZ0=19.5, adZ1=33;
  box(adX1-adX0,.1,adZ1-adZ0,0xc4bda8,(adX0+adX1)/2,-0.05,(adZ0+adZ1)/2,true);
  box(adX1-adX0,.12,adZ1-adZ0,0xdad4c0,(adX0+adX1)/2,3.42,(adZ0+adZ1)/2,true);
  /* 行政楼：前台 + 办公桌 + 文件柜 */
  box(6,.9,1.2,0x8a6a45, 0, .45, 21.5, true);         // 前台
  for(const dx of [-11,-6,6,11]){
    box(2.0,.08,1.0,deskC, dx, .75, 30, true);
  }
  for(const cx of [-15, 15]){
    box(1.4,2.2,.5,0x5f6f7f, cx, 1.1, 32.5, false);
  }
  const lamp2=new THREE.Mesh(new THREE.BoxGeometry(1.8,.08,.4),
    new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xfff4d6, emissiveIntensity:1.0}));
  lamp2.position.set(0, 3.3, 26); scene.add(lamp2);

  /* ---- 室内容器：让「进楼」有意义，进去能搜到东西 ---- */
  /* 复用 x_ext 的容器系统（CONTAINER_SPOTS），这里只把几个点位
     挪到室内坐标。容器是每局重新生成的，所以放在 buildContainers 之后
     调用最稳妥 —— 但 buildContainers 在本函数之后执行，
     所以室内容器另走一份 supplement 列表（见 x_ext.js）。 */
}

/* ==================== 光影每帧更新 ====================
   配合 init() 里的光影增强。这里只做三件事，全是「改数值」：
   太阳走下坡 → 天与雾变暖 → 灯在傍晚变亮。
   不新增 draw call，手机上几乎零开销。
   【为什么不在这里改材质】每帧改 material 会触发 shader 重编译或
   上传，那才是掉帧的真正来源。只改 light.position / intensity / color
   和 scene.fog.color 是纯 uniform 更新，最便宜。 */
let _lightT = 0;
function updLighting(dt){
  const sun = window.__sunLight;
  if(!sun) return;
  _lightT += (dt || 0);
  /* 周期 360 秒：一整局（通常 3~5 分钟）走完 1/3~1/2 圈，
     也就是从上午玩到午后偏晚，能察觉但不会突然天黑。 */
  const p = (_lightT % 360) / 360;              // 0..1
  const ang = p * Math.PI;                      // 0..π，太阳从东到西
  const R = 78;
  sun.position.set(
    Math.cos(ang) * R,
    Math.max(18, Math.sin(ang) * R),            // 不沉到地平线以下
    25 + Math.sin(ang * 0.5) * 18
  );
  /* 太阳高度 → 冷暖。低角度偏橙，高角度偏白黄。 */
  const h = Math.max(0, Math.min(1, Math.sin(ang)));
  const warm = new THREE.Color(0xffb066);
  const high = new THREE.Color(0xfff4e0);
  sun.color.copy(warm).lerp(high, h);
  /* 主光强度随高度走：太低时压一档，免得长影子里一片死黑 */
  sun.intensity = 1.75 + h * 0.55;

  if(typeof scene !== 'undefined' && scene){
    const skyHi = new THREE.Color(0x8fb7d9);    // 原淡蓝
    const skyLo = new THREE.Color(0xd79a6a);    // 暮色橙
    const sky = skyLo.clone().lerp(skyHi, h);
    if(scene.background && scene.background.isColor) scene.background.copy(sky);
    /* 雾色只跟一半，全跟会让远景糊成糖水 */
    if(scene.fog && scene.fog.color) scene.fog.color.copy(sky);

    /* 点光源：傍晚自动提亮，白天略收 —— 否则大白天空地上
       飘着一团突兀光斑。 */
    const lamps = window.__lampMeshes || [];
    const k = 0.55 + (1 - h) * 0.75;            // 正午 0.55，傍晚 1.30
    for(let i=0;i<lamps.length;i++){
      const it = lamps[i];
      if(!it || !it.light) continue;
      it.light.intensity = it.base * k;
      if(it.bulb) it.bulb.scale.setScalar(0.85 + (1 - h) * 0.5);
    }
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
  /* 校园扩建：新建筑里也各放一个，不然新地图是「空的」——
     搜打掩的游戏循环要求每栋楼里都有风险与产出。
     坐标都取在建筑内部的中轴/走廊上，不压墙。 */
  [-50,-35],  // 宿舍 A 走廊
  [-50,-6],   // 宿舍 B 走廊
  [-50,46],   // 食堂就餐区
  [70,-20],   // 图书馆书架间过道
  [-30,-38],  // 停车场中间通道
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
  /* 【篮球次之】站在篮球场里按 E = 投篮。
     放在门之前：球场上本来就没有门，但万一附近有，
     玩家按 E 显然是想投篮而不是去开门。 */
  if(typeof nearBasketball==='function' && nearBasketball()){
    if(typeof shootBall==='function' && shootBall()) return true;
  }
  /* 【楼层：楼梯 / 电梯】放在门之前。
     理由：楼梯和电梯都在楼内深处，附近不会有门；
     但玩家站在楼梯口按 E 显然是想上下楼，
     如果先判门，有可能把这次交互吃掉（门洞就在几米外）。 */
  if(typeof floorInteract==='function' && floorInteract()) return true;
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
  /* 校园扩建后的容器：宿舍/食堂/图书馆/车棚各一个，
     类型按场景配（宿舍→铁柜、食堂→医疗柜、图书馆→纸箱、车棚→纸箱） */
  {x:-46, z:-30, type:'locker'},  // 宿舍 A 门厅
  {x:-46, z:-2,  type:'med'},     // 宿舍 B 门厅
  {x:-44, z:44,  type:'med'},     // 食堂门口
  {x:67,  z:-14, type:'box'},     // 图书馆阅览区
  {x:47,  z:-40, type:'box'},     // 车棚
  /* 【室内点位】buildInterior() 铺完地板后，楼内终于是可站立空间，
     所以容器的「搜索」终于能进楼用了。
     主楼一层（x:-30..30，z:-30..-14，门洞在 x=0）。
     【坐标体检】课桌是 r=0..2、dz=-27/-22.8/-18.6，
     dx 落在 ±24/±18/±12/±7，椅子再往 +z 偏 0.85；讲台占 (0,-28.6)，
     两侧柜子占 x=±27.5、z=-20/17.8/15.6。所以：
       - 不能用 z=-27（正好第一排桌子）；
       - 不能用 x=±26（紧贴 x=±27.5 的柜子，会互相嵌进去）；
     最终放在「讲台与第一排桌子之间的横带 z=-16 附近」和
     「走廊尽头两侧」——这几处地面是空的，且都在门内可见范围。 */
  {x:-21, z:-16, type:'locker'},  // 主楼一层西南侧铁柜
  {x:21,  z:-16, type:'med'},     // 主楼一层东南侧医疗柜
  {x:-4,  z:-16, type:'box'},     // 主楼一层讲台东侧纸箱
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
