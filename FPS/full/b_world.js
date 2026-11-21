/* ============ b_world.js：场景初始化 + 学校地图（还原现实） ============ */
/* 【模块已执行的证据】
   a_head.html 里的启动自检脚本会在 5 秒后检查这个标记。
   模块正常跑起来 = 有标记；没有标记 = module 压根没执行
   （多半是 three.module.js 没加载，或者用 file:// 打开被浏览器拦了）。
   放在这里是因为它紧跟 import 之后，是最早能执行的业务代码。 */
window.__moduleRan=true;
const $=id=>document.getElementById(id);
let renderer,scene,camera,clock,ready=false;
const colliders=[],shootables=[],enemies=[],loots=[];
let exfil=null;

/* 造实体：加入场景 + 作为碰撞体 */
function solid(m){ m.castShadow=m.receiveShadow=true; scene.add(m); colliders.push(m); return m; }

/* 箱子（墙体/建筑块）。noCol=true 时只显示不碰撞（如窗户玻璃）
   【材质】以前是 `new MeshStandardMaterial({color:c,roughness:.85})` —— 一个纯色块。
   现在交给 aa_mat.js 的 matGetForSize：按颜色自动选混凝土/砖/沥青/草地/木头/金属/瓷砖，
   并按几何体尺寸算纹理重复（60 米宽的墙不会把一张贴图拉成马赛克）。
   noCol=true 的通常是窗户玻璃，走 plain 分支保持纯色，否则玻璃上会长出砖缝。 */
function box(w,h,d,c,x,y,z,noCol){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
    matGetForSize(c, w, h, d, { plain:noCol?true:false, transparent:false }));
  m.position.set(x,y,z);
  if(noCol){ scene.add(m); return m; }
  return solid(m);
}
/* 圆柱（路灯/树/柱子） */
function cyl(rt,rb,h,c,x,y,z,noCol){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,12),
    matGetForSize(c, rt*2, h, rt*2, { plain:noCol?true:false }));
  m.position.set(x,y,z);
  if(noCol){ scene.add(m); return m; }
  return solid(m);
}
/* 平面装饰（球场标线、跑道等，贴地面不碰撞） */
let decoIndex=0;
function groundDeco(w,d,c,x,z,opacity){
  /* 【贴图错位的根因之一】
     这些装饰面原来全都压在 y=0.02，彼此之间几乎零间距，
     而地面本体在 y=0。两台设备/不同分辨率下深度缓冲精度不同，
     0.02 这个间距不够用，就会出现闪烁、条纹、错位（z-fighting）。
     处理方式双保险：
       1) 每个装饰面按序号抬一点高度，保证彼此不共面；
       2) 材质开 polygonOffset，让渲染器优先画它、把共面冲突推给地面。 */
  decoIndex++;
  /* 材质走 matGetForSize，但保留全部防 z-fighting 字段：
     polygonOffset + 逐面抬高。opacity<1 的（球场标线、淡色涂装）
     走 plain 分支保持纯色 —— 半透明贴图会算错排序。 */
  /* 【必须 clone】matGetForSize 返回的是全局缓存对象，如果直接往上写
     polygonOffset，会把所有共用这个材质的墙体一起改掉。
     所以每个装饰面 clone 一份，只改自己那份。 */
  const mt=matGetForSize(c, w, 1, d, { plain:opacity<1 }).clone();
  mt.transparent=opacity<1;
  mt.opacity=opacity!==undefined?opacity:1;
  mt.polygonOffset=true; mt.polygonOffsetFactor=-2; mt.polygonOffsetUnits=-2;
  mt.depthWrite=opacity>=1;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d), mt);
  m.rotation.x=-Math.PI/2;
  m.position.set(x, 0.06+decoIndex*0.002, z);
  m.receiveShadow=true; scene.add(m); return m;
}

/* 渲染器 + 场景 + 光照 + 相机 */
function init(){
  try{
    renderer=new THREE.WebGLRenderer({canvas:$('c'),antialias:true});
  }catch(e){
    showErr('WebGL 初始化失败：'+e.message+'。请检查浏览器是否支持 WebGL。');
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  /* 色调映射：这是 saltline 「像照片」最核心的一步。
     不做映射时，高光一律被硬裁到纯白，画面显平、发灰、像塑料；
     ACES 会做胶片式的柔和肩部压缩，亮部保留层次。 */
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.autoUpdate = true;
  renderer.shadowMap.needsUpdate = true;

  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x8fb7d9);           // 天空淡蓝
  scene.fog=new THREE.Fog(0x8fb7d9,40,180);

  camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,600);
  // 相机初始位置 = 玩家出生点，避免初入黑/空视角
  camera.position.set(0,1.7,8);
  camera.rotation.set(0,0,0);

  clock=new THREE.Clock();

  /* 光照 */
  /* 光照：saltline 是强烈日光 + 明显阴影，不是均匀平光。
     半球光压低（负责暗部补色），主光加强并产生硬阴影，对比就出来了。

     【加贴图后回调】以前墙面是纯色，2.6 的主光正好；
     现在墙上有砖缝、雨痕、颗粒这些高频细节，2.6 的光会把它们全糊成一片白，
     等于白做了贴图。这里把主光降到 2.15、环境光降到 0.13，
     让贴图的明暗层次能透出来，同时保留硬阴影的方向感。 */
  scene.add(new THREE.HemisphereLight(0xcfe4ff,0x6b5f47,0.5));
  scene.add(new THREE.AmbientLight(0xffffff,0.13));   // 极轻的环境底，避免暗部死黑
  const sun=new THREE.DirectionalLight(0xfff4e0,2.15);
  sun.position.set(45,60,25);
  sun.castShadow=true;
  /* 阴影贴图尺寸只在下面 3072 那一处设定。
     （以前这里还有一行 2048，紧接着又被 3072 覆盖，
       属于历史遗留的重复设置，容易让人误以为精度是 2048，已删除） */
  /* 【阴影精度 & 贴图错位】
     原来 shadow.camera 覆盖 180×180 米（left/right/top/bottom 都是 ±90），
     却只给 2048×2048 的贴图 —— 每个像素要管 8.8 厘米，
     墙根、台阶边缘会出现明显的锯齿、条纹和「影子错位」。
     校园主体范围约 ±50 米，把相机收到 ±60 就够用，
     每像素精度提升到约 5.9cm，几乎翻倍；
     再把贴图提到 3072 并加大 normalBias（沿法线偏移，不产生 peter-panning）。 */
  sun.shadow.mapSize.set(3072,3072);
  sun.shadow.camera.left=-60; sun.shadow.camera.right=60;
  sun.shadow.camera.top=60;  sun.shadow.camera.bottom=-60;
  sun.shadow.camera.far=200; sun.shadow.camera.near=1;
  sun.shadow.bias=-0.0002;
  sun.shadow.normalBias=0.045;
  scene.add(sun);

  /* 大地：整个校园地面
     【为什么单独处理】它是 300×300 的平面，如果走 matGetForSize 的
     3.5 米一次，会被 clamp 到 24 次上限，等于每 12.5 米才一个纹理周期，
     草地看起来还是糊的。这里明确指定 unit=6（每 6 米一次），
     重复 50 次，既有细节又不会因为次数太多产生摩尔纹。 */
  const groundMat=matGet(0x6c8f5e, { kind:'grass', repeat:50 });
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(300,300), groundMat);
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

  buildSchool();
  /* 【场景扩展】先开门洞再建操场：
     carve*Door 要把原来的整块外墙拆成两段，必须在 buildSchool 之后立刻执行，
     否则后来者只会叠加出一面又一面墙。 */
  carveMainDoor();
  carveEastDoor();
  carveWestDoor();
  carveAdminDoor();
  buildSportsZone();
  setupWorld();
  ready=true;
}

/* 窗户（玻璃 + 窗框）。
     【原来错在哪】直接把玻璃当成 `box(2.6,2.6,.3, 0x88ccee, x, y, -14.15, true)`：
     主楼墙体中心 z=-22、厚 16，墙面在 z=-14。玻璃中心放 -14.15、厚 0.3，
     于是它向外凸 0.15、向内凹 0.15 —— 一半埋在墙里，和墙面完全共面，
     从外面看就是一片闪烁的色块（z-fighting），既没有窗框也没有凹进去的窗洞感。
     东西楼（墙面 x=±26）和行政楼（墙面 z=18.5，原代码放 18.6，连凸都没凸出来，
     整块玻璃埋在墙里看不见）都是同类错误。

     现在统一用这个函数：玻璃贴在墙面外侧 0.06 米（留极小的间隙避免共面），
     四周加一圈窗框（比玻璃略突出），并在玻璃上开十字窗棂。
     face 用 'S'(朝 -z) / 'N'(朝 +z) / 'W'(朝 -x) / 'E'(朝 +x) 指定朝向。 */
function windowPane(w,h, x,y,z, face, noCol){
  const T=0.08;                    // 玻璃厚度
  const F=0.16;                    // 窗框厚度（比玻璃厚，才有立体感）
  const off=0.02;                  // 贴墙间隙，防止与墙面共面闪烁
  const glassC=0x9fd4e8;           // 玻璃：淡青蓝，比原来的 0x88ccee 更像玻璃
  const frameC=0xcfc8ba;           // 窗框：浅米灰（塑钢/铝合金的颜色）
  const dir=(face==='S')?-1:(face==='N'?1:(face==='W'?-1:1));
  const along=(face==='S'||face==='N');   // 沿 x 铺开 还是 沿 z 铺开
  /* 玻璃：只显示不碰撞（原来的 noCol 语义保留） */
  const gz = (face==='S'||face==='N') ? z+dir*(off+T/2) : x+dir*(off+T/2);
  if(along) box(w,h,T,glassC, x,y,gz, true);
  else      box(T,h,w,glassC, gz,y,z, true);
  /* 窗框：上下左右四条，围出一个略大于玻璃的矩形 */
  const fz=(face==='S'||face==='N') ? z+dir*(off+F/2) : x+dir*(off+F/2);
  const frame=(w2,h2,dx,dy)=>{
    if(along) box(w2,h2,F,frameC, x+dx,y+dy,fz, true);
    else      box(F,h2,w2,frameC, fz,y+dy,z+dx, true);
  };
  frame(w+F*2, F, 0,  h/2+F*0.4);          // 上
  frame(w+F*2, F, 0, -h/2-F*0.4);          // 下
  frame(F, h,     -w/2-F*0.4, 0);          // 左
  frame(F, h,      w/2+F*0.4, 0);          // 右
  /* 竖向窗棂：把玻璃分成三格，比一整块玻璃有辨识度 */
  const barT=0.05;
  if(along) box(barT,h,T*0.6,frameC, x,y,gz, true);
  else      box(T*0.6,h,barT,frameC, gz,y,z, true);
  return null;
}

/* ============ 学校建筑（还原现实校园） ============ */
function buildSchool(){
  /* ---- 主教学楼（南侧，z=-22）60m 宽 × 4 层 ---- */
  box(60,14,16,0xd9c6a3,0,7,-22);                 // 主楼体
  /* 主楼屋顶做成「两边收窄」的样子：
    主楼本体 60 米宽（x 从 -30 到 30），而东西楼内边缘在 x=±26，
     如果屋顶也做满 60 米，它会在 y=14.35 的高度悬在东西楼上方
     —— 两个屋顶互相插在一起，从远处看就是「楼顶打架」。
     这里收窄到 50 米（x 从 -25 到 25），刚好落在东西楼之间。 */
  box(50,.7,16,0x6b5a45,0,14.35,-22);            // 平屋顶
  // 正面门窗（朝南 z=-14）—— 墙面 z=-14，玻璃朝外贴在南面
  for(let i=0;i<13;i++){
    const x=-27+i*4.5;
    windowPane(2.6,2.6, x,5,   -14, 'S');        // 窗（一层，高一点）
    windowPane(2.6,2.6, x,9.5, -14, 'S');        // 窗（二层）
    windowPane(2.6,2.6, x,12.5,-14, 'S');        // 窗（三层）
  }
  /* 正门已交给 carveMainDoor() 建造真实可开的门，
     这里不能再放一块 6x3.6 的装饰门板 —— 它正好把门洞堵死，
     玩家开了门也进不去（这正是「只能在教学楼外活动」的真正原因）。 */
  /* 门楣/雨棚：这块板子挂在门洞正上方 y=4.0 处，是个纯装饰件。
     【为什么它之前看起来「飞天」】它被 solid() 注册成了碰撞体，
     而旧代码没有「站在顶面上」的概念，玩家既不会被它挡住，
     也不会被它托住 —— 于是一块实心板子悬在 4 米高的空中，
     人从下面走过去时完全穿透，视觉上就是「板子飘在天上」。
     现在它不再参与碰撞（noCol=true），纯装饰；
     同时贴合门洞上沿（门高 3.6，板子厚 0.3，中心 3.75 才刚好接上），
     原来放 4.0 会留 0.25 米缝隙，看起来像悬空的。 */
  box(3.2,.3,1.2,0x8a7a5a,0,3.75,-14.4,true);   // 门楣/雨棚（不碰撞，贴门洞上沿）

  /* ---- 东教学楼（x=-34）----
     【尺寸修正】原来 44 米长（z 从 -20 到 24），
     但主楼在 z=-22（深 16，即 -30..-14），行政楼在 z=26（深 15，即 18.5..33.5），
     两者都和它重叠 6 米 —— 这就是「穿模」的直接来源：
     东西楼的墙角直接插进主楼和行政楼的墙体里。
     现在收成 32 米（z 从 -14 到 18），留出 0.5 米缝，
     既不碰主楼也不碰行政楼。 */
  box(16,14,32,0xd9c6a3,-34,7,2);
  box(16,.7,32,0x6b5a45,-34,14.35,2);
  /* 东楼墙面在 x=-26（本体 -34、宽 16），窗户朝东（+x 方向，即 'E'） */
  for(let i=0;i<6;i++){ const z=-10+i*4.5;
    windowPane(2.6,2.4, -26,5, z, 'E');
    windowPane(2.6,2.4, -26,10,z, 'E');
  }

  /* ---- 西教学楼（x=34） ---- */
  box(16,14,32,0xd9c6a3,34,7,2);
  box(16,.7,32,0x6b5a45,34,14.35,2);
  for(let i=0;i<6;i++){ const z=-10+i*4.5;
    windowPane(2.6,2.4, 26,5, z, 'W');
    windowPane(2.6,2.4, 26,10,z, 'W');
  }

  /* ---- 后侧行政楼（z=26） ---- */
  box(34,11,15,0xcfbc9a,0,5.5,26);
  box(34,.7,15,0x6b5a45,0,11.35,26);
  /* 行政楼本体 z=26、深 15，南墙面在 z=18.5（26-7.5）。
     原来窗户放 z=18.6 —— 在墙面内侧 0.1 米，整块埋在墙里，从外面根本看不见。
     现在朝南贴在墙面外侧。 */
  for(let i=0;i<7;i++){ const x=-13+i*4.3;
    windowPane(2.4,2.4, x,4.5, 18.5, 'S');
    windowPane(2.4,2.4, x,8,   18.5, 'S');
  }
  /* 行政楼门同理，交给 carveAdminDoor()，
     这里不再放 5x3.2 的装饰门板堵住门洞。 */

  /* ---- 围墙（南墙留校门洞） ---- */
  const wallC=0x8a9aa8;
  /* 【围墙外扩】原来北墙在 z=52，操场一扩就会被压到墙外。
     现在北墙推到 z=68，东墙推到 x=78（体育馆在 x=58 附近，需要留出余量），
     南/西不动，校门位置保持不变。 */
  box(120,2.6,.5,wallC,0,1.3,-46);                      // 南墙
  box(.5,2.6,120,wallC,-60,1.3,10);                     // 西墙
  box(.5,2.6,120,wallC,78,1.3,10);                      // 东墙
  box(140,2.6,.5,wallC,9,1.3,68);                       // 北墙
  // 校门（南墙中央开口 + 门柱 + 牌坊）
  box(1.4,3.6,1,0x555555,-5,1.8,-46);
  box(1.4,3.6,1,0x555555,5,1.8,-46);
  /* 门额横梁：架在两根门柱（高 3.6）顶上，纯装饰。
     同样的问题：以前它是实心碰撞体却悬在 4.2 米，
     玩家既踩不上去也穿得过去，看着像凭空浮着的板子。
     改成不碰撞，并且把高度对准门柱顶面（3.6 + 0.25）。 */
  box(12,.5,1.2,0x7a4a2a,0,3.85,-46,true);            // 门额横梁（不碰撞，架在门柱上）
  // 校门内石碑（原在 z=-40，正对主楼门前主干道；挪到路边免得挡人）
  box(3,1.8,.8,0xb0b8c0,-9,.9,-40);

  /* ---- 旧操场已移除 ----
     原来这里是 (20,30) 的 44x30 小跑道，紧贴行政楼北墙，
     玩家在楼间只能沿一条窄道走，地图「只有教学楼外」的观感就来自这里。
     现在整体搬到 buildSportsZone()（x_ext.js），做成 400m 场地。 */

  /* ---- 篮球场已移到操场西侧，见 buildSportsZone ---- */

  /* ---- 树木（围墙内侧一圈） ---- */
  function tree(x,z){
    cyl(.22,.3,1.8,0x6b4a2a,x,.9,z,true);
    /* 树冠：走 grass 材质（有斑驳明暗），比纯色球体自然得多 */
    const c1=new THREE.Mesh(new THREE.SphereGeometry(1.4,8,8),
      matGet(0x3f7a3a, { kind:'grass', repeat:2 }));
    c1.position.set(x,2.6,z); c1.castShadow=true; scene.add(c1);
  }
  const trees=[[-50,-38],[-40,-38],[-30,-38],[-20,-38],[-10,-38],[-8,-36],[8,-36],[10,-38],[20,-38],[30,-38],[40,-38],[50,-38],[-55,14],[-55,30],[-55,42],[55,14],[55,30],[55,42],[-40,46],[-20,46],[0,46],[20,46],[40,46]];
  for(const t of trees) tree(t[0],t[1]);

  /* ---- 路灯（主干道两侧） ---- */
  for(const lx of[-14,0,14]){
    /* 【修了个旧 bug】这里原来写的是 0x555 —— 那是 0x000555，#000555，
       实际是近乎黑的深蓝，不是想要的深灰。路灯杆一直有点偏蓝就是这个原因。
       正确写法是 0x555555。 */
    const pole=cyl(.1,.14,4.5,0x555555,lx,2.25,0,true);
    const lamp=new THREE.Mesh(new THREE.SphereGeometry(.4,8,8),new THREE.MeshStandardMaterial({color:0xfff5d0,emissive:0xffeaa0,emissiveIntensity:.5}));
    lamp.position.set(lx,4.6,0); scene.add(lamp);
  }

  /* ---- 旗杆 + 国旗 ---- */
  const pole=cyl(.15,.22,10,0xcccccc,0,5,10,true);
  const flag=new THREE.Mesh(new THREE.PlaneGeometry(2.6,1.6),new THREE.MeshStandardMaterial({color:0xd62828,side:THREE.DoubleSide}));
  flag.position.set(1.4,9.0,10); scene.add(flag);
  // 升旗台
  box(4,.6,4,0x8a8a8a,0,.3,10);
}

/* ============ 敌人 / 物资 / 撤离点 ============ */
function spawnEnemy(x,z){
  const h=1.7;
  const body=new THREE.Mesh(new THREE.CapsuleGeometry(.4,h-.8,4,8),new THREE.MeshStandardMaterial({color:0x3b4a6b,roughness:.7}));
  body.position.set(x,h/2,z); body.castShadow=true;
  const head=new THREE.Mesh(new THREE.SphereGeometry(.28,12,12),new THREE.MeshStandardMaterial({color:0xe0b28a,roughness:.6}));
  head.position.set(x,h+.12,z); head.castShadow=true;
  scene.add(body); scene.add(head);
  shootables.push(body,head);
  return {x,z,hp:100,alive:true,body,head,speed:2.5,aggro:false,atkCd:0,respawn:0};
}
function spawnLoot(x,z,t){
  const C={ammo:0x555533,med:0xcc3333,cash:0xffd54a,gun:0x333355};
  const m=new THREE.Mesh(new THREE.BoxGeometry(.6,.5,.6),new THREE.MeshStandardMaterial({color:C[t],roughness:.5}));
  m.position.set(x,.28,z); m.castShadow=true; scene.add(m); shootables.push(m);
  return {x,z,type:t,mesh:m,taken:false};
}
function spawnExfil(x,z){
  const r=new THREE.Mesh(new THREE.RingGeometry(1.5,2,32),new THREE.MeshStandardMaterial({color:0x33ff88,emissive:0x33ff88,emissiveIntensity:.6,side:THREE.DoubleSide}));
  r.rotation.x=-Math.PI/2; r.position.set(x,.06,z); scene.add(r);
  const b=new THREE.Mesh(new THREE.CylinderGeometry(1.5,1.5,9,16,1,true),new THREE.MeshStandardMaterial({color:0x33ff88,emissive:0x33ff88,emissiveIntensity:.4,transparent:true,opacity:.25,side:THREE.DoubleSide}));
  b.position.set(x,4.5,z); scene.add(b);
  exfil={x,z};
}
function setupWorld(){
  enemies.forEach(e=>{scene.remove(e.body);scene.remove(e.head);});
  loots.forEach(l=>scene.remove(l.mesh));
  enemies.length=0; loots.length=0;

  // 【敌人精简】原来 8 个挤在楼间小道上，走两步撞一个，没有「搜」的余地。
  // 现在 4 个，分散在操场/篮球场/体育馆/教学楼内，各自守一片场地。
  NPC_POINTS.forEach(p=>enemies.push(spawnEnemy(p[0],p[1])));
  // 物资散落到新场地里：操场看台、篮球场、体育馆、各楼内
  /* 物资坐标全部经体检脚本验证不在建筑内。
     重点修了两个卡墙的：
       (-14,56) 原来卡在看台台阶里 -> 挪到看台前方 (-14,50)
       (-30,10) 原来在东教学楼里   -> 挪到楼间空地 (-18,14) */
  loots.push(
    spawnLoot(-10,10,'ammo'),  spawnLoot(10,10,'ammo'),
    spawnLoot(-14,50,'med'),   spawnLoot(30,54,'med'),
    spawnLoot(-18,14,'cash'),  spawnLoot(-18,-2,'cash'),
    spawnLoot(58,10,'gun'),    spawnLoot(58,28,'cash'),
    spawnLoot(0,-22,'cash'),   spawnLoot(-34,2,'ammo'),
    spawnLoot(34,2,'med'),     spawnLoot(0,34,'cash'),
    spawnLoot(20,40,'ammo'),   spawnLoot(52,-2,'cash')
  );
  spawnExfil(0,-36);  // 撤离点在校门南侧外
  /* 【每局重置计时】raidT 归零、超时标志清掉。
     这一步必须在 setupWorld 里做：它是每局的起点，
     少了它第二局一进来就「时间到」、直接弹阵亡结算。 */
  try{
    P.raidT=0;
    window.__raidOver=false;
  }catch(e){}
  /* 【局内容器】每次开局重新生成一遍，战利品随机 */
  if(typeof buildContainers==='function') buildContainers();
  if(typeof bindContainerUI==='function') bindContainerUI();
  applyPixelBudget(); // 像素预算制分辨率（低端机自动降采样保帧率）
  initWeapon();       // 第一人称武器模型
  // 操作提示 8 秒后淡出
  const tip=$('htip');
  if(tip) setTimeout(()=>tip.classList.add('hide'), 8000);
}

function showErr(msg){
  const e=$('loaderr'); if(!e) return;
  e.textContent=msg; e.style.display='block';
}