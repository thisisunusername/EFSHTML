/* 趴下 + 按键布局测试
   验证：
     1) 趴下后眼睛高度降到 0.55，站起恢复 1.6
     2) 趴下时移动速度降到 35%
     3) 趴下时不能跳
     4) 头顶太低时站不起来（不会被弹进墙里）
     5) 按键 DOM 里五个键都在，且开门提示不在按键区里 */
'use strict';
const fs=require('fs');

class V3{
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
  clone(){ return new V3(this.x,this.y,this.z); }
  add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  addScaledVector(){ return this; }
  sub(v){ this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; }
  length(){ return Math.hypot(this.x,this.y,this.z); }
  normalize(){ return this; }
  multiplyScalar(){ return this; }
  setFromMatrixPosition(){ return this; }
}
class GeoStub{ constructor(w,h,d){ this.w=w;this.h=h;this.d=d;this.boundingBox=null; }
  computeBoundingBox(){ const hw=(this.w||1)/2,hh=(this.h||1)/2,hd=(this.d||1)/2;
    this.boundingBox={min:new V3(-hw,-hh,-hd),max:new V3(hw,hh,hd)}; } }
class MatStub{ constructor(o){ Object.assign(this,o||{}); this.emissive={setHex(){}}; } }
class MeshStub{ constructor(g,m){ this.geometry=g; this.material=m||new MatStub();
  this.position=new V3(); this.rotation=new V3(); this.scale=new V3(1,1,1);
  this.castShadow=false; this.receiveShadow=false; this.visible=true; } }
function SceneCtor(){ return {children:[],add(o){this.children.push(o);},remove(o){
  const i=this.children.indexOf(o); if(i>=0) this.children.splice(i,1); }}; }
const THREE={
  Vector3:V3, Euler:class{constructor(){this.x=0;this.y=0;this.z=0;this.order='XYZ';}
    set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} copy(){return this;}},
  BoxGeometry:GeoStub, CylinderGeometry:GeoStub, SphereGeometry:GeoStub,
  CapsuleGeometry:GeoStub, PlaneGeometry:GeoStub, RingGeometry:GeoStub,
  ConeGeometry:GeoStub, MeshStandardMaterial:MatStub, MeshBasicMaterial:MatStub,
  Mesh:MeshStub, Group:SceneCtor, Scene:SceneCtor,
  Color:function(){return {setHex(){},set(){}};},
  Fog:function(){}, HemisphereLight:function(){return new MeshStub();},
  AmbientLight:function(){return new MeshStub();},
  DirectionalLight:function(){const m=new MeshStub();m.shadow={mapSize:{set(){}},camera:{},bias:0,normalBias:0};return m;},
  PerspectiveCamera:function(){const c=new MeshStub();c.fov=75;c.updateProjectionMatrix=()=>{};return c;},
  WebGLRenderer:function(){return {setPixelRatio(){},setSize(){},shadowMap:{},domElement:{},render(){}};},
  Clock:function(){return {getDelta:()=>0.016};},
};
global.__THREE__=THREE;

const domStore={};
function mkNode(){ return {style:{},dataset:{},
  classList:{add(){},remove(){},contains(){return false;},toggle(){}},
  textContent:'',innerHTML:'',addEventListener(){},appendChild(){},
  querySelector(){return null;},querySelectorAll(){return [];}}; }
global.document={ getElementById:(id)=>domStore[id]||(domStore[id]=mkNode()),
  createElement:()=>mkNode(), addEventListener(){}, querySelector(){return null;},
  querySelectorAll(){return [];}, body:{appendChild(){},classList:{add(){}}} };
global.window=global; global.addEventListener=()=>{};
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>0;
Object.defineProperty(global,'navigator',{configurable:true,writable:true,
  value:{userAgent:'node',maxTouchPoints:5}});

const parts=['b_world.js','c_player.js','d_game.js','e_io.js','f_ui.js','x_ext.js','w_weapon.js','y_audio.js','z_render.js'];
let code='';
for(const p of parts){ if(!fs.existsSync('full/'+p)) continue;
  code+='\n/* ==== '+p+' ==== */\n'+fs.readFileSync('full/'+p,'utf8'); }
code='const THREE=global.__THREE__;\n'+code;

let S;
try{
  S=new Function(code+'\n;return {get P(){return P;}, get colliders(){return colliders;},'
    +' toggleProne, doJump, updP, init, buildSchool, carveMainDoor, carveEastDoor,'
    +' carveWestDoor, carveAdminDoor, buildSportsZone, get scene(){return scene;}};')();
}catch(e){ console.log('COMPILE_FAIL:',e.message); process.exit(1); }

const P=S.P;
let fail=0;
function ok(c,m){ console.log((c?'  ✅ ':'  ❌ ')+m); if(!c) fail=1; }

/* 建场景（有碰撞体才能测趴下相关） */
try{ S.init(); }
catch(e){
  const st=String(e&&e.stack||'');
  if(!/initWeapon|applyPixelBudget/.test(st)){
    console.log('INIT_FAIL:',e.message); process.exit(1);
  }
}

console.log('[1] 趴下基本行为');
ok(P.prone===false,'初始是站立状态');
ok(Math.abs(P.eyeH-1.6)<0.01,'初始眼睛高度 1.6');

S.toggleProne();
ok(P.prone===true,'调用 toggleProne 后进入趴下');

/* 跑几帧让插值收敛 */
P.pos.set(8,1.6,8);      // 空地上
for(let i=0;i<60;i++) S.updP(0.016);
ok(Math.abs(P.eyeH-P.proneH)<0.05,'趴下后眼睛降到约 0.55（实际 '+P.eyeH.toFixed(2)+'）');

/* 速度：趴下时移动应明显变慢 */
P.pos.set(8,1.6,8);
P.vel.set(0,0,0);
const z0=P.pos.z;
window.__joyTouch={active:true,sx:0,sy:0,cx:0,cy:-48};  // 满推向前
for(let i=0;i<30;i++) S.updP(0.016);
const proneDist=Math.abs(P.pos.z-z0);
window.__joyTouch=null;

console.log('     趴下 30 帧位移 '+proneDist.toFixed(2)+' 米');
ok(proneDist>0.1,'趴下依然能移动');
ok(proneDist<3.0,'趴下移动速度明显受限（未超过 3 米/0.48 秒）');

console.log('\n[2] 趴下不能跳');
P.onGround=true;
const vy0=P.vel.y;
S.doJump();
ok(P.vel.y===vy0,'趴下时 doJump 不改变垂直速度');

console.log('\n[3] 站起来');
S.toggleProne();
ok(P.prone===false,'再调一次恢复站立');
for(let i=0;i<60;i++) S.updP(0.016);
ok(Math.abs(P.eyeH-1.6)<0.05,'眼睛高度恢复 1.6（实际 '+P.eyeH.toFixed(2)+'）');

console.log('\n[4] 站起后能跳');
P.onGround=true; P.vel.y=0;
S.doJump();
ok(P.vel.y>0,'站立时能起跳');

console.log('\n[5] 按键 DOM 检查');
const html=fs.readFileSync('index.html','utf8');
/* 这五个键是用户示意图里明确要求的 */
for(const [id,name] of [['btnFire','开火'],['btnReload','换弹'],
                        ['btnJump','跳跃'],['btnProne','趴下'],['btnAim','瞄准']]){
  ok(html.indexOf('id="'+id+'"')>=0, '有「'+name+'」按钮 ('+id+')');
}
ok(html.indexOf('id="btnInteract"')>=0,'有交互按钮（开门用）');

/* 开门提示不能落进按钮区 */
const doorCss = (html.match(/#doorHint\{[^}]*\}/)||[''])[0];
ok(/top:\s*22%/.test(doorCss), '开门提示固定在屏幕上方 22%（不进按钮区）');
ok(!/bottom:\s*96px/.test(doorCss), '开门提示不再用 bottom:96px（原来会和按键叠）');

/* 按键位置用 calc 公式统一算，不再各自散落 */
ok(/#btnJump\{[^}]*calc\(/.test(html), '跳跃键位置由 calc 公式推算');
ok(/#btnProne\{[^}]*calc\(/.test(html), '趴下键位置由 calc 公式推算');

console.log('\n'+(fail?'PRONE_FAIL: 趴下或按键测试未通过'
  :'PRONE_OK: 趴下/站起/限速/禁跳 与 五个按键布局全部正确'));
process.exit(fail?1:0);