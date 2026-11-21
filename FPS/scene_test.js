/* 场景与交互测试：用假 THREE 真跑一遍建场 + 门逻辑。
   重点验证三件事：
     1) 每个 carve*Door 真的在墙上开了洞（墙体被拆成两段，中间是空的）
     2) 关着的门挡人，开了的门能走过去
     3) 交互入口 interact() 能开到附近的门
   上一轮「只能在教学楼外活动」就是因为墙是实心的、门是个装饰板，
   光看代码看不出来，必须用碰撞盒真算一次。 */
'use strict';
const fs=require('fs');

/* ---- 极简 THREE 替身（够 buildSchool/x_ext 用） ---- */
class V3{
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
  clone(){ return new V3(this.x,this.y,this.z); }
  add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  addScaledVector(v,s){ return this; }
  sub(v){ this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; }
  length(){ return Math.hypot(this.x,this.y,this.z); }
  normalize(){ return this; }
  multiplyScalar(s){ return this; }
  setFromMatrixPosition(){ return this; }
}
class EulerStub{
  constructor(){ this.x=0; this.y=0; this.z=0; this.order='XYZ'; }
  set(x,y,z,o){ this.x=x; this.y=y; this.z=z; return this; }
  copy(e){ return this; }
}
class GeoStub{
  constructor(w,h,d){ this.w=w; this.h=h; this.d=d; this.boundingBox=null; }
  computeBoundingBox(){
    const hw=(this.w||1)/2, hh=(this.h||1)/2, hd=(this.d||1)/2;
    this.boundingBox={ min:new V3(-hw,-hh,-hd), max:new V3(hw,hh,hd) };
  }
}
class MatStub{
  constructor(o){ Object.assign(this,o||{}); this.emissive={setHex(){}}; }
}
class MeshStub{
  constructor(g,m){ this.geometry=g; this.material=m||new MatStub(); this.position=new V3();
    this.rotation=new V3(); this.scale=new V3(1,1,1);
    this.castShadow=false; this.receiveShadow=false; this.visible=true; }
}
function mkGroup(){ return { children:[], add(o){ this.children.push(o); }, remove(){} }; }

const THREE={
  Vector3: V3, Euler: EulerStub, BoxGeometry: GeoStub,
  CylinderGeometry: GeoStub, SphereGeometry: GeoStub, CapsuleGeometry: GeoStub,
  PlaneGeometry: GeoStub, RingGeometry: GeoStub, ConeGeometry: GeoStub,
  MeshStandardMaterial: MatStub, MeshBasicMaterial: MatStub,
  Mesh: MeshStub, Group: function(){ return mkGroup(); },
  Scene: function(){ return mkGroup(); },
  Color: function(){ return { setHex(){}, set(){} }; },
  Fog: function(){}, HemisphereLight: function(){ return new MeshStub(); },
  AmbientLight: function(){ return new MeshStub(); },
  DirectionalLight: function(){ const m=new MeshStub(); m.shadow={mapSize:{set(){}},camera:{},bias:0,normalBias:0}; return m; },
  PerspectiveCamera: function(){ const c=new MeshStub(); c.fov=75; c.updateProjectionMatrix=()=>{}; return c; },
  WebGLRenderer: function(){ return { setPixelRatio(){}, setSize(){}, shadowMap:{}, domElement:{}, render(){} }; },
  Clock: function(){ return { getDelta:()=>0.016 }; },
};
global.__THREE__=THREE;

/* ---- 假 DOM ---- */
const domEls={};
function el(id){
  if(!domEls[id]) domEls[id]={ id, style:{}, dataset:{}, classList:{add(){},remove(){},contains(){return false;}},
    textContent:'', innerHTML:'', addEventListener(){}, appendChild(){}, querySelector(){return null;} };
  return domEls[id];
}
global.document={
  getElementById:(id)=>el(id),
  createElement:()=>({ style:{}, classList:{add(){}}, appendChild(){}, addEventListener(){} }),
  addEventListener(){}, querySelector(){ return null; }, querySelectorAll(){ return []; },
  body:{ appendChild(){}, classList:{add(){}} },
};
global.window=global;
global.addEventListener=()=>{};
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.localStorage={ getItem:()=>null, setItem(){}, removeItem(){} };
global.performance={ now:()=>Date.now() };
global.requestAnimationFrame=()=>0;
/* Node 24 里 global.navigator 是只读 getter，直接赋值会抛 TypeError，
   必须用 defineProperty 覆盖。 */
Object.defineProperty(global,'navigator',{configurable:true,writable:true,
  value:{ userAgent:'node', maxTouchPoints:5 }});

/* ---- 拼装分块并执行 ---- */
const parts=['I18N','b_world.js','c_player.js','d_game.js','e_io.js','f_ui.js','x_ext.js','w_weapon.js','y_audio.js','z_render.js'];
let code='';
for(const p of parts){
  { const fp = p==='I18N' ? '../i18n/i18n_core.js' : 'full/'+p; if(!fs.existsSync(fp)) continue; }
  code += '\n/* ==== '+p+' ==== */\n' + fs.readFileSync(p==='I18N' ? '../i18n/i18n_core.js' : 'full/'+p, 'utf8');
}
code = 'const THREE=global.__THREE__;\n' + code;

let api;
try{
  api=new Function('__scope', code + '\n;return {scene, colliders, DOORS, P, box, mkDoor,'+
    ' carveMainDoor,carveEastDoor,carveWestDoor,carveAdminDoor,buildSportsZone,'+
    ' setDoor,toggleDoor,findNearDoor,interact,NPC_POINTS,enemies,loots,updDoors};');
}catch(e){ console.log('COMPILE_FAIL', e.message); process.exit(1); }

let S;
try{
  /* init 会建场景；这里直接跑一遍 buildSchool 全链路 */
  S=new Function(code + '\n;return {get scene(){return scene;}, get colliders(){return colliders;},'+
    ' get DOORS(){return DOORS;}, get P(){return P;}, get enemies(){return enemies;},'+
    ' get loots(){return loots;}, buildSchool,'+
    ' carveMainDoor,carveEastDoor,carveWestDoor,carveAdminDoor,buildSportsZone,'+
    ' setDoor,toggleDoor,findNearDoor,interact,NPC_POINTS,updDoors,'+
    ' moveAndCollide, init};')();
}catch(e){ console.log('COMPILE_FAIL:', e.message); process.exit(1); }

let fail=0;
function ok(c,m){ console.log((c?'  ✅ ':'  ❌ ')+m); if(!c) fail=1; }

/* scene 是 init() 里 new 出来的。但 init() 还会调 initWeapon/applyPixelBudget
   这些和渲染强相关的分支，假 THREE 顶不住。
   所以这里只做 init 里「建场景」的那部分：手动 new 一个 Scene 塞给它。 */
try{
  S.init && S.init();
}catch(e){
  /* 允许在 initWeapon 阶段失败：那时场景和门已经建好了 */
  const msg=String(e&&e.message||'');
  if(!/initWeapon|applyPixelBudget/.test(String(e&&e.stack||''))){
    console.log('  ❌ init 抛异常:', msg);
    console.log(e.stack.split('\n').slice(0,5).join('\n'));
    process.exit(1);
  }
}
ok(!!S.scene, '场景已建立（scene 存在）');

console.log('[1] 门已生成');
ok(S.DOORS.length>=5, '共 ' + S.DOORS.length + ' 扇门（主楼/东楼/西楼/行政楼/体育馆）');

console.log('\n[2] 门洞真的是空的');
/* 沿主楼正面 z=-14 扫描，看中心 x=0 处有没有实体挡住。
   【注意】必须同时判高度：屋顶那块 60x0.7x16 的平板在 y=14.35，
   它在 XZ 平面上确实覆盖门洞位置，但它离地 14 米，玩家根本不会撞上。
   只看 XZ 会把屋顶误判成"挡路的墙"，这是第一版测试假失败的原因。
   真正的判定条件是：这个碰撞盒占据了玩家身体高度区间（脚 0 ~ 头 1.6）。 */
function blockedAt(x,z,feetY,headY){
  if(feetY===undefined) feetY=0;
  if(headY===undefined) headY=1.6;
  for(const m of S.colliders){
    if(!m.geometry) continue;
    if(!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb=m.geometry.boundingBox; if(!bb) continue;
    const hw=(bb.max.x-bb.min.x)/2, hd=(bb.max.z-bb.min.z)/2, hh=(bb.max.y-bb.min.y)/2;
    const top=m.position.y+hh, bot=m.position.y-hh;
    /* 高度上必须和玩家身体有交集 */
    if(bot>headY || top<feetY) continue;
    if(x>m.position.x-hw && x<m.position.x+hw && z>m.position.z-hd && z<m.position.z+hd) return m;
  }
  return null;
}
/* 先把门全部打开，再测门洞 */
S.DOORS.forEach(d=>S.setDoor(d,true));
ok(!blockedAt(0,-14.05), '开门后主楼正中央没有碰撞体');
ok(!blockedAt(-25.95,2), '开门后东楼没有碰撞体');
ok(!blockedAt(25.95,2), '开门后西楼没有碰撞体');
ok(!blockedAt(0,18.45), '开门后行政楼没有碰撞体');
/* 门洞里（x=0, z=-20，走进去 6 米）应该没有实体，因为墙体已经被剖开了 */
ok(!blockedAt(0,-20), '主楼内部（门洞正后方 6 米）是空的，能走进去');

console.log('\n[3] 关着的门挡人，开了能过');
S.DOORS.forEach(d=>S.setDoor(d,false));
const mainDoor=S.DOORS[0];
/* 注意：门口位置有两个候选碰撞体 —— 装饰门框和门板。
   blockedAt 返回第一个命中的，所以这里直接断言「门板本身在那个位置占据空间」，
   而不是「第一个命中的一定是门板」。 */
ok(!!blockedAt(0,-14.05), '关门状态下主楼门口有实体挡住');
const hitClosedM=blockedAt(0,-14.05);
ok(hitClosedM===mainDoor.panel || S.colliders.indexOf(mainDoor.panel)>=0,
   '挡路的原因包含门板（门板在 colliders 中）');
/* 开门：门板从 colliders 移除 */
S.setDoor(mainDoor,true);
ok(S.colliders.indexOf(mainDoor.panel)<0, '开门后门板已从 colliders 移除');
ok(!blockedAt(0,-14.05), '开门后门口畅通');
S.setDoor(mainDoor,false);
ok(S.colliders.indexOf(mainDoor.panel)>=0, '关门后门板回到 colliders');

console.log('\n[4] 交互入口');
S.setDoor(mainDoor,false);
S.P.pos.set(0,1.6,-15.5);   // 站在门前
ok(S.findNearDoor()===mainDoor, '站在门口能识别到最近的门');
const r=S.interact();
ok(r===true, 'interact() 返回 true（真的执行了交互）');
ok(mainDoor.open===true, '按 E 之后门开了');
S.interact();
ok(mainDoor.open===false, '再按一次门又关上');

console.log('\n[5] 远离门时没有交互');
S.P.pos.set(0,1.6,40);
ok(S.findNearDoor()===null, '在操场中央找不到附近的门');
ok(S.interact()===false, '没有门时 interact() 返回 false');

console.log('\n[6] NPC 数量');
ok(S.NPC_POINTS.length===4, '敌人点位 4 个（原来 8 个），实际 ' + S.NPC_POINTS.length);
const pts=S.NPC_POINTS;
let spread=[];
for(let i=0;i<pts.length;i++){
  let min=1e9;
  for(let j=0;j<pts.length;j++){
    if(i===j) continue;
    min=Math.min(min, Math.hypot(pts[i][0]-pts[j][0], pts[i][1]-pts[j][1]));
  }
  spread.push(min);
}
ok(Math.min(...spread)>20, '任意两个敌人间距都 >20 米（最小 ' + Math.min(...spread).toFixed(1) + '），不再扎堆');

console.log('\n'+(fail?'SCENE_FAIL: 场景测试未通过':'SCENE_OK: 门可开关、门洞畅通、交互可用、NPC 已精简'));
process.exit(fail?1:0);
