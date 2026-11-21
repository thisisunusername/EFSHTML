/* ============ b_world.js：场景初始化 + 学校地图（还原现实） ============ */
const $=id=>document.getElementById(id);
let renderer,scene,camera,clock,ready=false;
const colliders=[],shootables=[],enemies=[],loots=[];
let exfil=null;

/* 造实体：加入场景 + 作为碰撞体 */
function solid(m){ m.castShadow=m.receiveShadow=true; scene.add(m); colliders.push(m); return m; }

/* 箱子（墙体/建筑块）。noCol=true 时只显示不碰撞（如窗户玻璃） */
function box(w,h,d,c,x,y,z,noCol){
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color:c,roughness:.85}));
  m.position.set(x,y,z);
  if(noCol){ scene.add(m); return m; }
  return solid(m);
}
/* 圆柱（路灯/树/柱子） */
function cyl(rt,rb,h,c,x,y,z,noCol){
  const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,12),new THREE.MeshStandardMaterial({color:c,roughness:.8}));
  m.position.set(x,y,z);
  if(noCol){ scene.add(m); return m; }
  return solid(m);
}
/* 平面装饰（球场标线、跑道等，贴地面不碰撞） */
function groundDeco(w,d,c,x,z,opacity){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshStandardMaterial({color:c,roughness:1,transparent:opacity<1,opacity:opacity!==undefined?opacity:1}));
  m.rotation.x=-Math.PI/2; m.position.set(x,.02,z); m.receiveShadow=true; scene.add(m); return m;
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

  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x8fb7d9);           // 天空淡蓝
  scene.fog=new THREE.Fog(0x8fb7d9,40,180);

  camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,.1,600);
  // 相机初始位置 = 玩家出生点，避免初入黑/空视角
  camera.position.set(0,1.7,8);
  camera.rotation.set(0,0,0);

  clock=new THREE.Clock();

  /* 光照 */
  scene.add(new THREE.HemisphereLight(0xbfd8ff,0x8a7a5a,.95));
  const sun=new THREE.DirectionalLight(0xfff2df,1.7);
  sun.position.set(45,60,25);
  sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);
  sun.shadow.camera.left=-90; sun.shadow.camera.right=90;
  sun.shadow.camera.top=90;  sun.shadow.camera.bottom=-90;
  sun.shadow.camera.far=260; sun.shadow.camera.near=1;
  sun.shadow.bias=-0.0005;
  scene.add(sun);

  /* 大地：整个校园地面 */
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(300,300),new THREE.MeshStandardMaterial({color:0x6c8f5e,roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.receiveShadow=true; scene.add(ground);

  buildSchool();
  setupWorld();
  ready=true;
}

/* ============ 学校建筑（还原现实校园） ============ */
function buildSchool(){
  /* ---- 主教学楼（南侧，z=-22）60m 宽 × 4 层 ---- */
  box(60,14,16,0xd9c6a3,0,7,-22);                 // 主楼体
  box(60,.7,16,0x6b5a45,0,14.35,-22);            // 平屋顶
  // 正面门窗（朝南 z=-14）
  for(let i=0;i<13;i++){
    const x=-27+i*4.5;
    box(2.6,2.6,.3,0x88ccee,x,5,-14.15,true);    // 窗（一层，高一点）
    box(2.6,2.6,.3,0x88ccee,x,9.5,-14.15,true);  // 窗（二层）
    box(2.6,2.6,.3,0x88ccee,x,12.5,-14.15,true); // 窗（三层）
  }
  // 正门（中央 z=-14）
  box(6,3.6,.5,0xcfbc9a,0,1.8,-14.0);
  box(.7,3.6,.5,0xcfbc9a,-3.4,1.8,-14.0);
  box(.7,3.6,.5,0xcfbc9a,3.4,1.8,-14.0);
  box(1.8,.3,2.5,0x8a7a5a,0,4.0,-15.0);         // 门楣/雨棚

  /* ---- 东教学楼（x=-34） ---- */
  box(16,14,44,0xd9c6a3,-34,7,2);
  box(16,.7,44,0x6b5a45,-34,14.35,2);
  for(let i=0;i<8;i++){ const z=-16+i*6; box(.3,2.4,2.6,0x88ccee,-26.15,5,z,true); box(.3,2.4,2.6,0x88ccee,-26.15,10,z,true); }

  /* ---- 西教学楼（x=34） ---- */
  box(16,14,44,0xd9c6a3,34,7,2);
  box(16,.7,44,0x6b5a45,34,14.35,2);
  for(let i=0;i<8;i++){ const z=-16+i*6; box(.3,2.4,2.6,0x88ccee,26.15,5,z,true); box(.3,2.4,2.6,0x88ccee,26.15,10,z,true); }

  /* ---- 后侧行政楼（z=26） ---- */
  box(34,11,15,0xcfbc9a,0,5.5,26);
  box(34,.7,15,0x6b5a45,0,11.35,26);
  for(let i=0;i<7;i++){ const x=-13+i*4.3; box(2.4,2.4,.3,0x88ccee,x,4.5,18.6,true); box(2.4,2.4,.3,0x88ccee,x,8,18.6,true); }
  box(5,3.2,.5,0x8a6a45,0,1.6,18.5);             // 行政楼门

  /* ---- 围墙（南墙留校门洞） ---- */
  const wallC=0x8a9aa8;
  box(120,2.6,.5,wallC,0,1.3,-46);                      // 南墙
  box(.5,2.6,100,wallC,-60,1.3,4);                      // 西墙
  box(.5,2.6,100,wallC,60,1.3,4);                       // 东墙
  box(120,2.6,.5,wallC,0,1.3,52);                       // 北墙
  // 校门（南墙中央开口 + 门柱 + 牌坊）
  box(1.4,3.6,1,0x555555,-5,1.8,-46);
  box(1.4,3.6,1,0x555555,5,1.8,-46);
  box(12,.5,1.2,0x7a4a2a,-0+0,4.2,-46);               // 门额横梁
  // 校门内石碑
  box(3,1.8,.8,0xb0b8c0,0,.9,-40);

  /* ---- 操场（东北角，标准 200m 跑道） ---- */
  // 跑道外圈（深红环）
  groundDeco(44,30,0x9a3b2f,20,30);
  groundDeco(38,24,0x6c8f5e,20,30);                     // 跑道内圈（球场绿）
  // 跑道白色标线
  groundDeco(40,26,0xffffff,20,30,.7);
  groundDeco(30,16,0xffffff,20,30,.35);
  // 中间足球场中线/中圈
  groundDeco(.3,16,0xffffff,20,30,.7);
  groundDeco(4,4,0xffffff,20,30,.4);

  /* ---- 篮球场（西北角） ---- */
  groundDeco(16,29,0x4a5a6a,-28,-18);
  groundDeco(.25,26,0xffffff,-28,-18,.85);             // 中线
  groundDeco(16,.25,0xffffff,-28,-18,.85);             // 分区线
  groundDeco(14,10,0xffffff,-28,-18,.4);               // 罚球区示意
  // 两个篮球架
  for(const bx of[-34,-22]){
    cyl(.12,.12,3.2,0x888,-bx*-1?bx:bx,1.6,-30,true);
    box(2.2,.12,1.1,0xffffff,bx+0,3.1,-30,true);       // 篮板
  }

  /* ---- 树木（围墙内侧一圈） ---- */
  function tree(x,z){
    cyl(.22,.3,1.8,0x6b4a2a,x,.9,z,true);
    const c1=new THREE.Mesh(new THREE.SphereGeometry(1.4,8,8),new THREE.MeshStandardMaterial({color:0x3f7a3a,roughness:1}));
    c1.position.set(x,2.6,z); c1.castShadow=true; scene.add(c1);
  }
  const trees=[[-50,-38],[-40,-38],[-30,-38],[-20,-38],[-10,-38],[-8,-36],[8,-36],[10,-38],[20,-38],[30,-38],[40,-38],[50,-38],[-55,14],[-55,30],[-55,42],[55,14],[55,30],[55,42],[-40,46],[-20,46],[0,46],[20,46],[40,46]];
  for(const t of trees) tree(t[0],t[1]);

  /* ---- 路灯（主干道两侧） ---- */
  for(const lx of[-14,0,14]){
    const pole=cyl(.1,.14,4.5,0x555,lx,2.25,0,true);
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

  // 敌人分布在操场、篮球场、楼间、校门等真实点位
  [[-18,2],[18,2],[-10,18],[15,18],[0,-8],[-30,-10],[25,-20],[8,22]].forEach(p=>enemies.push(spawnEnemy(p[0],p[1])));
  // 物资散落在楼内、球场、树下
  loots.push(
    spawnLoot(-22,2,'ammo'),  spawnLoot(22,2,'ammo'),
    spawnLoot(-12,12,'med'),   spawnLoot(12,12,'med'),
    spawnLoot(-30,18,'cash'),  spawnLoot(30,18,'cash'),
    spawnLoot(0,22,'gun'),     spawnLoot(-8,28,'cash'),
    spawnLoot(8,28,'cash'),    spawnLoot(-30,-14,'ammo'),
    spawnLoot(26,-16,'med'),   spawnLoot(0,-36,'cash')
  );
  spawnExfil(0,-36);  // 撤离点在校门南侧外
  applyPixelBudget(); // 像素预算制分辨率（低端机自动降采样保帧率）
  // 操作提示 8 秒后淡出
  const tip=$('htip');
  if(tip) setTimeout(()=>tip.classList.add('hide'), 8000);
}

function showErr(msg){
  const e=$('loaderr'); if(!e) return;
  e.textContent=msg; e.style.display='block';
}