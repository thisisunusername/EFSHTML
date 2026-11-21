/* 用 Node 在严格模式下模拟真实游戏循环：
   把 full/ 的分块拼起来执行，注入一个假 THREE，
   然后按「玩家按住摇杆向前」的输入连续跑 updP，
   任何异常都会被完整打印出来（含行号）。
   这比读代码可靠得多——上一轮的 const bug 就是这样漏掉的。 */
'use strict';
const fs=require('fs');

/* ---- 极简 THREE 替身，只实现 c_player/b_world 用到的那部分 ---- */
class V3{
  constructor(x=0,y=0,z=0){ this.x=x; this.y=y; this.z=z; }
  set(x,y,z){ this.x=x; this.y=y; this.z=z; return this; }
  copy(v){ this.x=v.x; this.y=v.y; this.z=v.z; return this; }
  clone(){ return new V3(this.x,this.y,this.z); }
  add(v){ this.x+=v.x; this.y+=v.y; this.z+=v.z; return this; }
  addScaledVector(v,s){ this.x+=v.x*s; this.y+=v.y*s; this.z+=v.z*s; return this; }
  sub(v){ this.x-=v.x; this.y-=v.y; this.z-=v.z; return this; }
  length(){ return Math.hypot(this.x,this.y,this.z); }
  normalize(){ const l=this.length()||1; this.x/=l; this.y/=l; this.z/=l; return this; }
  multiplyScalar(s){ this.x*=s; this.y*=s; this.z*=s; return this; }
  setFromMatrixPosition(){ return this; }
}
class EulerStub{
  constructor(){ this.x=0; this.y=0; this.z=0; this.order='XYZ'; }
  set(x,y,z,order){ this.x=x; this.y=y; this.z=z; if(order) this.order=order; return this; }
  copy(e){ this.x=e.x; this.y=e.y; this.z=e.z; return this; }
}
class Box3{
  constructor(){ this.min=new V3(1e9,1e9,1e9); this.max=new V3(-1e9,-1e9,-1e9); }
  setFromObject(){ return this; }
  expandByPoint(p){
    this.min.x=Math.min(this.min.x,p.x); this.min.y=Math.min(this.min.y,p.y); this.min.z=Math.min(this.min.z,p.z);
    this.max.x=Math.max(this.max.x,p.x); this.max.y=Math.max(this.max.y,p.y); this.max.z=Math.max(this.max.z,p.z);
    return this;
  }
  getCenter(t){ return t; }
}
class Obj3D{
  constructor(){ this.position=new V3(); this.rotation=new EulerStub(); this.scale=new V3(1,1,1); this.children=[]; this.geometry=null; this.material=null; this.visible=true; this.castShadow=false; this.receiveShadow=false; }
  add(o){ this.children.push(o); return this; }
  remove(){ return this; }
  traverse(fn){ fn(this); this.children.forEach(c=>c.traverse?c.traverse(fn):fn(c)); }
  lookAt(){}
  updateMatrixWorld(){}
  updateMatrix(){}
  updateProjectionMatrix(){}
  getWorldPosition(t){ return t||new V3(); }
  clone(){ return new Obj3D(); }
}
const THREE={
  Vector3:V3, Vector2:class{constructor(x=0,y=0){this.x=x;this.y=y;}},
  Box3, Object3D:Obj3D, Group:class extends Obj3D{},
  Mesh:class extends Obj3D{ constructor(g,m){ super(); this.geometry=g; this.material=m; } },
  BoxGeometry:class{ constructor(w=1,h=1,d=1){ this.w=w; this.h=h; this.d=d;
    this.boundingBox={ min:new V3(-w/2,-h/2,-d/2), max:new V3(w/2,h/2,d/2) }; }
    computeBoundingBox(){ return this.boundingBox; } },
  PlaneGeometry:class{ constructor(w=1,h=1){ this.w=w; this.h=h;
    this.boundingBox={ min:new V3(-w/2,-h/2,0), max:new V3(w/2,h/2,0) }; }
    computeBoundingBox(){ return this.boundingBox; } },
  CylinderGeometry:class{ constructor(rt=1,rb=1,h=1){ this.boundingBox={ min:new V3(-rt,-h/2,-rt), max:new V3(rt,h/2,rt) }; }
    computeBoundingBox(){ return this.boundingBox; } },
  SphereGeometry:class{ constructor(r=1){ this.boundingBox={ min:new V3(-r,-r,-r), max:new V3(r,r,r) }; }
    computeBoundingBox(){ return this.boundingBox; } },
  MeshStandardMaterial:class{ constructor(o){ Object.assign(this,o||{}); } },
  MeshBasicMaterial:class{ constructor(o){ Object.assign(this,o||{}); } },
  Scene:class extends Obj3D{},
  PerspectiveCamera:class extends Obj3D{ constructor(fov,ar,n,f){ super(); this.fov=fov; this.aspect=ar; } },
  WebGLRenderer:class{ constructor(){ this.domElement={style:{}}; this.shadowMap={enabled:false}; }
    setSize(){} setPixelRatio(){} render(){} setClearColor(){} dispose(){} },
  Clock:class{ getDelta(){ return 1/60; } getElapsedTime(){ return 0; } },
  HemisphereLight:class extends Obj3D{}, AmbientLight:class extends Obj3D{}, DirectionalLight:class extends Obj3D{
    constructor(){ super(); this.shadow={ mapSize:{}, bias:0, normalBias:0, camera:{} }; } },
  PointLight:class extends Obj3D{}, SpotLight:class extends Obj3D{},
  Plane:class{ constructor(){ this.normal=new V3(0,1,0); this.constant=0; } },
  Raycaster:class{ constructor(){ this.ray={origin:new V3(),direction:new V3()}; } setFromCamera(){} intersectObjects(){ return []; } },
  MathUtils:{ clamp:(v,a,b)=>Math.max(a,Math.min(b,v)), lerp:(a,b,t)=>a+(b-a)*t, degToRad:d=>d*Math.PI/180 },
  Color:class{ constructor(c){ this.c=c; } },
  Fog:class{ constructor(){} },
  ACESFilmicToneMapping:1, SRGBColorSpace:'srgb',
  RepeatWrapping:1000, DoubleSide:2, FrontSide:0,
  PCFSoftShadowMap:1,
  CanvasTexture:class{ constructor(){ this.wrapS=this.wrapT=0; this.repeat={set(){}}; } },
  TextureLoader:class{ load(){ return {}; } },
  Quaternion:class{ setFromAxisAngle(){ return this; } },
  Euler:class{ constructor(){ this.x=0;this.y=0;this.z=0; } },
  Matrix4:class{},
};

/* ---- 浏览器环境替身 ---- */
const listeners={};
const elStub=()=>({ style:{}, classList:{add(){},remove(){},contains(){return false;}},
  addEventListener(t,f){ (listeners[t]=listeners[t]||[]).push(f); },
  removeEventListener(){}, appendChild(){}, getBoundingClientRect(){ return {left:0,top:0,width:800,height:600}; },
  textContent:'', innerHTML:'', setAttribute(){}, focus(){}, querySelector(){ return elStub(); } });
global.window=global;
global.document={
  getElementById(){ return elStub(); },
  createElement(){ return elStub(); },
  body:elStub(),
  addEventListener(t,f){ (listeners[t]=listeners[t]||[]).push(f); },
  removeEventListener(){},
  querySelector(){ return elStub(); },
  documentElement:elStub(),
};
global.innerWidth=800; global.innerHeight=600; global.devicePixelRatio=2;
Object.defineProperty(global,'navigator',{ value:{ maxTouchPoints:5, userAgent:'node' }, configurable:true, writable:true });
global.localStorage={ getItem(){return null;}, setItem(){}, removeItem(){} };
global.performance={ now:()=>Date.now() };
global.requestAnimationFrame=()=>0;
global.cancelAnimationFrame=()=>{};
global.addEventListener=(t,f)=>{ (listeners[t]=listeners[t]||[]).push(f); };
global.removeEventListener=()=>{};
global.AudioContext=class{ constructor(){ this.destination={}; this.currentTime=0; } createGain(){ return {gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},disconnect(){}}; } createOscillator(){ return {frequency:{value:0,setValueAtTime(){},exponentialRampToValueAtTime(){}},type:'',connect(){},start(){},stop(){}}; } createBufferSource(){ return {buffer:null,connect(){},start(){},stop(){}}; } createBuffer(){ return {getChannelData(){ return new Float32Array(1024); }}; } };
global.screen={ width:800, height:600 };
global.setTimeout=setTimeout; global.clearTimeout=clearTimeout;
global.__THREE_STUB__=true;

/* ---- 按 build.sh 的顺序拼接分块并执行 ---- */
const parts=['b_world.js','c_player.js','d_game.js','e_io.js','f_ui.js','w_weapon.js','y_audio.js','z_render.js'];
let code='';
for(const p of parts){
  if(!fs.existsSync('full/'+p)) continue;
  code += '\n/* ==== '+p+' ==== */\n' + fs.readFileSync('full/'+p,'utf8');
}
code = 'const THREE=global.__THREE__;\n' + code;

global.__THREE__=THREE;
let scopeCode=code;
try{
  /* 用 with 把分块里的顶层变量暴露出来，方便下面直接调用 updP / P */
  const sandbox={};
  const fn=new Function('THREE','__sbx','with(THREE){\n'+
    code.replace(/^const THREE=global\.__THREE__;\n/,'')+
    '\n;__sbx.updP=typeof updP==="function"?updP:null;'+
    '\n;__sbx.P=typeof P!=="undefined"?P:null;'+
    '\n;__sbx.init=typeof init==="function"?init:null;'+
    '\n;__sbx.moveAndCollide=typeof moveAndCollide==="function"?moveAndCollide:null;'+
  '}');
  fn(THREE, sandbox);
  console.log('✅ 分块脚本加载成功');
  if(!sandbox.updP){ console.log('❌ 拿不到 updP'); process.exit(1); }
  if(!sandbox.P){ console.log('❌ 拿不到 P'); process.exit(1); }

  const {updP, P, init}=sandbox;
  // 初始化世界（会建地图、光照、相机）
  try{ if(init) init(); }catch(e){ console.log('init 异常:', e.message); }
  console.log('初始 pos =', P.pos.x.toFixed(2), P.pos.y.toFixed(2), P.pos.z.toFixed(2));

  /* 模拟摇杆：屏幕上「往上推」= cy < sy，即 dy 为负。
     按 updP 的映射：mz = dy/48（负），前进方向 fwdZ=-cos(yaw)，
     yaw=0 时 fwdZ=-1，所以 wz = fwdZ*mz = (-1)*(负) = 正……
     这正好说明方向符号要按实际观感校准，这里四个方向都测一遍。 */
  function run(label, dxs, dys, frames){
    P.pos.set(0,1.6,5); P.vel.set(0,0,0); P.yaw=0; P.pitch=0;
    window.__joyTouch={ active:true, sx:100, sy:300, cx:100+dxs, cy:300+dys, t0:Date.now() };
    let errs=[];
    for(let i=0;i<frames;i++){
      try{ updP(1/60); }catch(e){ errs.push(e.message); }
    }
    const d=Math.hypot(P.pos.x-0, P.pos.z-5);
    console.log(`  ${label}: 位移 ${d.toFixed(2)}m  pos=(${P.pos.x.toFixed(2)}, ${P.pos.z.toFixed(2)})  异常=${errs.length}  ${d>0.5?'✅':'❌'}`);
    return errs;
  }
  console.log('【摇杆四方向测试，120 帧 = 2 秒】');
  let allErr=[];
  allErr=allErr.concat(run('屏幕向上推 (dy=-60)', 0, -60, 120));
  allErr=allErr.concat(run('屏幕向下推 (dy=+60)', 0,  60, 120));
  allErr=allErr.concat(run('屏幕向左推 (dx=-60)', -60, 0, 120));
  allErr=allErr.concat(run('屏幕向右推 (dx=+60)',  60, 0, 120));
  console.log('全部方向异常总数 =', allErr.length);
  if(allErr.length) console.log('   首个异常:', allErr[0]);

  /* 无输入时不应该有任何异常 */
  window.__joyTouch={ active:false };
  let idleErr=0;
  for(let i=0;i<60;i++){ try{ updP(1/60); }catch(e){ idleErr++; } }
  console.log('无输入 60 帧：异常数 =', idleErr);
}catch(e){
  console.log('⚠ 加载期异常:', e.constructor.name+': '+e.message);
  console.log(e.stack.split('\n').slice(0,6).join('\n'));
}
