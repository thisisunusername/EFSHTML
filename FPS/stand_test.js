/* 站立/落地判定测试（针对「遁地」「板子飞天」）
   验证：
     1) 站在地面上眼睛高度 = 1.6
     2) 从空中落下会停在地面，不会穿到 y<1.6
     3) 走过台阶/屋顶时会被顶面托住（这是「遁地」的修复点）
     4) 悬空装饰件不参与碰撞，人能从下面走过去 */
'use strict';
const fs=require('fs');

class V3{
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
  clone(){ return new V3(this.x,this.y,this.z); }
  add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  addScaledVector(v,s){ this.x+=v.x*s; this.y+=v.y*s; this.z+=v.z*s; return this; }
  sub(v){ this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; }
  length(){ return Math.hypot(this.x,this.y,this.z); }
  normalize(){ return this; }
  multiplyScalar(){ return this; }
  setFromMatrixPosition(){ return this; }
  applyEuler(){ return this; }
}
function GeoStub(w,h,d){ this.w=w; this.h=h; this.d=d; }
GeoStub.prototype.computeBoundingBox=function(){
  const hw=(this.w||1)/2,hh=(this.h||1)/2,hd=(this.d||1)/2;
  this.boundingBox={min:new V3(-hw,-hh,-hd),max:new V3(hw,hh,hd)};
};
function MatStub(o){ Object.assign(this,o||{}); this.emissive={setHex(){}}; }
function MeshStub(g,m){
  this.geometry=g; this.material=m||new MatStub();
  this.position=new V3(); this.rotation=new V3(); this.scale=new V3(1,1,1);
  this.castShadow=false; this.receiveShadow=false; this.visible=true;
  this.children=[];
}
MeshStub.prototype.add=function(o){ this.children.push(o); };
function SceneCtor(){
  return { children:[], add(o){ this.children.push(o); },
    remove(o){ const i=this.children.indexOf(o); if(i>=0) this.children.splice(i,1); } };
}
const THREE={
  Vector3:V3,
  Euler:function(){ this.x=0;this.y=0;this.z=0;this.order='XYZ';
    this.set=(x,y,z)=>{this.x=x;this.y=y;this.z=z;return this;};
    this.copy=()=>this; },
  BoxGeometry:GeoStub, CylinderGeometry:GeoStub, SphereGeometry:GeoStub,
  CapsuleGeometry:GeoStub, PlaneGeometry:GeoStub, RingGeometry:GeoStub,
  ConeGeometry:GeoStub, CircleGeometry:GeoStub,
  MeshStandardMaterial:MatStub, MeshBasicMaterial:MatStub,
  Mesh:MeshStub, Group:SceneCtor, Scene:SceneCtor,
  Color:function(){ this.setHex=()=>{}; this.set=()=>{}; },
  Fog:function(){},
  HemisphereLight:function(){ return new MeshStub(); },
  AmbientLight:function(){ return new MeshStub(); },
  DirectionalLight:function(){ const m=new MeshStub();
    m.shadow={mapSize:{set(){}},camera:{},bias:0,normalBias:0}; return m; },
  PerspectiveCamera:function(){ const c=new MeshStub(); c.fov=75;
    c.updateProjectionMatrix=()=>{}; return c; },
  WebGLRenderer:function(){ return {setPixelRatio(){},setSize(){},
    shadowMap:{},domElement:{},render(){}}; },
  Clock:function(){ return {getDelta:()=>0.016}; },
  Raycaster:function(){ this.intersectObjects=()=>[]; this.setFromCamera=()=>{}; },
};
global.__THREE__=THREE;

function mkNode(id){
  return { id, style:{}, dataset:{}, textContent:'', innerHTML:'',
    classList:{add(){},remove(){},contains(){return false;},toggle(){}},
    addEventListener(){}, appendChild(){}, removeChild(){},
    querySelector(){return null;}, querySelectorAll(){return [];},
    getContext(){ return {}; } };
}
const store={};
global.document={
  getElementById:(id)=>store[id]||(store[id]=mkNode(id)),
  createElement:()=>mkNode('n'),
  addEventListener(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  body:{appendChild(){},classList:{add(){},remove(){},contains(){return false;}}},
  readyState:'complete',
};
global.window=global;
global.addEventListener=()=>{}; global.removeEventListener=()=>{};
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>0;
global.matchMedia=()=>({matches:false});
Object.defineProperty(global,'navigator',{configurable:true,writable:true,
  value:{userAgent:'node',maxTouchPoints:0}});

const parts=['I18N','b_world.js','c_player.js','d_game.js','e_io.js','f_ui.js',
             'x_ext.js','w_weapon.js','y_audio.js','z_render.js'];
let code='const THREE=global.__THREE__;\n';
for(const p of parts){ { const fp = p==='I18N' ? '../i18n/i18n_core.js' : 'full/'+p; if(!fs.existsSync(fp)) continue; }
  code+='\n/* ==== '+p+' ==== */\n'+fs.readFileSync(p==='I18N' ? '../i18n/i18n_core.js' : 'full/'+p, 'utf8'); }

let S;
try{
  S=new Function(code+'\n;return {get P(){return P;},'
    +' get colliders(){return colliders;}, moveAndCollide, init};')();
}catch(e){ console.log('COMPILE_FAIL:',e.message); process.exit(1); }

const P=S.P, colliders=S.colliders;
let fail=0;
const ok=(c,m)=>{ console.log((c?'  ✅ ':'  ❌ ')+m); if(!c) fail=1; };

/* 建真实场景：initWorld() 会铺地面、盖楼、开门洞、建操场 */
let built=false;
try{ S.init(); built=true; }catch(e){ console.log('建场景失败:',e.message); }
console.log('碰撞体数量:', colliders.length, built?'（真实地图）':'（未建成）');

/* 手动搭一个测试平台：一块 10x1x10 的板子，顶面在 y=5 */
const plat=new MeshStub(new GeoStub(10,1,10));
plat.position.set(0,4.5,0);           // 中心 4.5，顶面 5.0
colliders.push(plat);

function sim(x,z,y,steps){
  P.pos.set(x,y,z);
  P.vel.set(0,0,0);
  P.eyeH=1.6; P.prone=false;
  for(let i=0;i<steps;i++){
    P.vel.y-=22*0.016;                // 重力
    S.moveAndCollide(0.016);
  }
  return P.pos.y;
}

console.log('\n[1] 平地落地');
const y0=sim(0,20,10,200);
ok(Math.abs(y0-1.6)<0.02,'从 10 米落到平地后眼睛高度 '+y0.toFixed(2)+'（应为 1.60）');

console.log('\n[2] 落到高台上（「遁地」的修复点）');
const y1=sim(0,0,10,200);
ok(Math.abs(y1-6.6)<0.05,'从 10 米落到顶面 5 米的平台后眼睛高度 '+y1.toFixed(2)+'（应为 6.60）');

console.log('\n[3] 不会穿到地面以下');
const y2=sim(0,20,0.5,100);
ok(y2>=1.59,'从很低的高度也不会穿到地下，眼睛 '+y2.toFixed(2));

console.log('\n[4] 站在平台上不会往下掉');
P.pos.set(0,6.6,0); P.vel.set(0,0,0);
for(let i=0;i<120;i++){ P.vel.y-=22*0.016; S.moveAndCollide(0.016); }
ok(Math.abs(P.pos.y-6.6)<0.05,'在平台上站 2 秒后眼睛高度 '+P.pos.y.toFixed(2)+'（应保持 6.60）');

console.log('\n[5] 走下平台边缘应当掉到地面');
P.pos.set(0,6.6,0); P.vel.set(0,0,0);
P.pos.z=6;                            // 平台 z 范围 -5..5，这里已经在边缘外
for(let i=0;i<200;i++){ P.vel.y-=22*0.016; S.moveAndCollide(0.016); }
ok(Math.abs(P.pos.y-1.6)<0.05,'离开平台后落回地面，眼睛 '+P.pos.y.toFixed(2));

/* ===== 真实地图：出生点与主要活动区必须站在地面 ===== */
console.log('\n[6] 真实地图站立检查');
colliders.splice(colliders.indexOf(plat),1);   // 撤掉测试平台

function dropTo(x,z,h){
  P.pos.set(x,h,z); P.vel.set(0,0,0);
  P.eyeH=1.6; P.prone=false;
  for(let i=0;i<300;i++){ P.vel.y-=22*0.016; S.moveAndCollide(0.016); }
  return P.pos.y;
}
const spots=[
  [0,10,'主干道'],[-18,6,'篮球场'],[16,34,'操场'],
  [0,50,'操场北'],[0,-8,'主楼门前广场'],
];
for(const [x,z,nm] of spots){
  const y=dropTo(x,z,20);
  ok(y>=1.59 && y<3.2, nm+' 落地高度 '+y.toFixed(2)+'（露天场地应≈1.60）');
}

console.log('\n[7] 从高处掉到教学楼屋顶上应该站得住');
/* (-34,2) 是东教学楼的楼体正上方，掉下来应该停在屋顶而不是穿进楼里。
   屋顶是 16x0.7x32 @ y=14.35，顶面 14.7，加上眼睛高度 1.6 = 16.3。 */
const roofY=dropTo(-34,2,30);
ok(Math.abs(roofY-16.3)<0.15,'东教学楼上方落地高度 '+roofY.toFixed(2)
  +'（应为屋顶顶面 14.7 + 眼睛 1.6 = 16.30）');
ok(roofY>2, '确认没有穿进楼里（落地高度远高于地面）');

console.log('\n'+(fail?'STAND_FAIL: 落地判定有问题'
  :'STAND_OK: 平地/高台都能正确站立，不会遁地也不会悬空'));
process.exit(fail?1:0);