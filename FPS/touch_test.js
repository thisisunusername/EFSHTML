/* 多指触控测试：模拟「左手推摇杆 + 右手转视角」同时进行。
   核心断言：视角转角只由右手决定，摇杆位移只由左手决定。
   修复前两者会互相污染，导致「一起用灵敏度爆炸」。 */
const fs=require('fs');
const html=fs.readFileSync('/tmp/efsrepo/FPS/index.html','utf8');
const m=html.match(/<script type="module">([\s\S]*?)<\/script>/);
if(!m){ console.error('找不到 module'); process.exit(1); }
let code=m[1].replace(/^\s*import[^\n]*\n/gm,'');

// ---- 最小 THREE 桩 ----
class V3{
  constructor(x,y,z){ this.x=x||0;this.y=y||0;this.z=z||0; }
  set(x,y,z){ this.x=x;this.y=y;this.z=z;return this; }
  copy(v){ this.x=v.x;this.y=v.y;this.z=v.z;return this; }
  clone(){ return new V3(this.x,this.y,this.z); }
  add(v){ this.x+=v.x;this.y+=v.y;this.z+=v.z;return this; }
  sub(v){ this.x-=v.x;this.y-=v.y;this.z-=v.z;return this; }
  multiplyScalar(s){ this.x*=s;this.y*=s;this.z*=s;return this; }
  length(){ return Math.hypot(this.x,this.y,this.z); }
  normalize(){ const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this; }
  copy(){ return this; }
  distanceTo(v){ return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z); }
  lerpVectors(){ return this; }
  applyQuaternion(){ return this; }
}
V3.prototype.copy=V3.prototype.copy||function(v){this.x=v.x;this.y=v.y;this.z=v.z;return this;};
const meshStub=new Proxy(function(){},{get:(t,k)=>k==='then'?undefined:()=>meshStub,construct:()=>meshStub,apply:()=>meshStub});
const THREE=new Proxy({},{get:(t,k)=>k==='Vector3'?V3:new Proxy(function(){},{get:()=>()=>THREE,construct:()=>meshStub,apply:()=>meshStub})});

// ---- 假 DOM，能真正收集 addEventListener ----
const listeners={};   // key: elId + ':' + type -> [fn]
function mkEl(id){
  const el={
    id, style:new Proxy({},{get:(o,k)=>o[k]||'',set:(o,k,v)=>{o[k]=v;return true;}}),
    classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    innerHTML:'', textContent:'', children:[],
    addEventListener(type,fn){
      const key=id+':'+type;
      (listeners[key]||(listeners[key]=[])).push(fn);
    },
    removeEventListener(){},
    querySelectorAll:()=>[], querySelector:()=>null,
    appendChild(c){ this.children.push(c); return c; },
    getAttribute:()=>null, setAttribute(){},
    getContext:()=>new Proxy({},{get:()=>()=>{}}),
    requestPointerLock(){}, focus(){}, blur(){},
    getBoundingClientRect:()=>({left:0,top:0,width:800,height:400,right:800,bottom:400}),
    contains:()=>false, clientWidth:800, clientHeight:400, width:800, height:400,
    setPointerCapture(){}, releasePointerCapture(){}, closest:()=>null
  };
  return el;
}
const els={};
const getEl=(id)=>els[id]||(els[id]=mkEl(id));
const bodyEl=mkEl('body');

global.window=global;
global.document={
  readyState:'complete', body:bodyEl, documentElement:bodyEl,
  getElementById:getEl,
  createElement:(t)=>mkEl('created_'+t),
  querySelector:(s)=>getEl(String(s).replace(/^#/,'')),
  querySelectorAll:()=>[],
  addEventListener(type,fn){ const k='document:'+type; (listeners[k]||(listeners[k]=[])).push(fn); },
  removeEventListener(){}, exitPointerLock(){}, pointerLockElement:null
};
Object.defineProperty(global,'navigator',{value:{maxTouchPoints:5,userAgent:'node'},configurable:true,writable:true});
global.location={reload(){},href:''};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.requestAnimationFrame=()=>0; global.cancelAnimationFrame=()=>{};
global.setTimeout=(f)=>0; global.clearTimeout=()=>{};
global.devicePixelRatio=1; global.innerWidth=1200; global.innerHeight=540;
global.addEventListener=(t,f)=>{ const k='window:'+t; (listeners[k]||(listeners[k]=[])).push(f); };
global.removeEventListener=()=>{};
global.AudioContext=function(){ return new Proxy({},{get:()=>()=>({connect(){},gain:{value:0},frequency:{value:0},start(){},stop(){}})}); };
global.performance={now:()=>0};
global.alert=()=>{}; global.confirm=()=>false;

let api;
try{
  const fn=new Function('THREE', code+'\n;return {P, bindUI, refreshHUD};');
  api=fn(THREE);
}catch(e){
  console.error('加载失败:', e.message);
  process.exit(1);
}
const {P, bindUI}=api;

// 手动跑一次 bindUI 完成事件注册（模块加载时已自动跑过一次，这里调用应被幂等保护挡掉）
const beforeCount=(listeners['viewLayer:touchmove']||[]).length;
try{ bindUI(); }catch(e){
  console.error('bindUI 失败:', e.message);
  process.exit(1);
}
const afterCount=(listeners['viewLayer:touchmove']||[]).length;
console.log('bindUI 执行完成（幂等保护生效：'+beforeCount+' → '+afterCount+' 个 handler）');
if(afterCount!==1){
  console.log('  ❌ 视角 touchmove handler 数量应为 1，实际 '+afterCount+'（重复注册会让灵敏度翻倍）');
  global.__fail=1;
}
console.log('joyZone 监听:', Object.keys(listeners).filter(k=>k.startsWith('joyZone')).join(', '));
console.log('viewLayer 监听:', Object.keys(listeners).filter(k=>k.startsWith('viewLayer')).join(', '));

function fire(el, type, ev){
  const key=el+':'+type;
  const arr=listeners[key]||[];
  for(const fn of arr){
    try{ fn(ev); }catch(e){ console.log('  抛错 '+key+': '+e.message); }
  }
}
function touch(id,x,y){ return {identifier:id, clientX:x, clientY:y, clientId:id}; }
function ev(list){ return {changedTouches:list, touches:list, preventDefault(){}, stopPropagation(){}}; }

function ok(cond,msg){ console.log((cond?'  ✅ ':'  ❌ ')+msg); if(!cond) global.__fail=1; }

/* ============ 场景 1：只有左手推摇杆 ============ */
console.log('\n[1] 单独推摇杆');
P.yaw=0; P.pitch=0; P.joyX=0; P.joyY=0;
window.__joyEnabled=true;
fire('joyZone','touchstart', ev([touch(1, 100, 400)]));
fire('joyZone','touchmove',  ev([touch(1, 100, 340)]));   // 向上推 60px
const joyY1=P.joyY;
console.log('     joyY='+P.joyY.toFixed(2)+' yaw='+P.yaw.toFixed(4));
ok(P.joyY < -0.5, '摇杆检测到向上推');
ok(Math.abs(P.yaw) < 1e-9, '视角没有被摇杆带歪');
fire('joyZone','touchend', ev([touch(1,100,340)]));

/* ============ 场景 2：只有右手转视角 ============ */
console.log('\n[2] 单独转视角');
P.yaw=0; P.pitch=0; P.joyX=0; P.joyY=0;
fire('viewLayer','touchstart', ev([touch(2, 900, 300)]));
fire('viewLayer','touchmove',  ev([touch(2, 950, 300)]));  // 右移 50px
const yaw2=P.yaw;
console.log('     yaw='+P.yaw.toFixed(4)+' joyY='+P.joyY.toFixed(2));
ok(P.yaw < -1e-4, '视角向左转了（yaw 减小）');
ok(Math.abs(P.joyY) < 1e-9, '摇杆没有被视角带歪');
/* 必须抬起手指，否则 viewTid 一直占着，场景 3 的 touchstart 会被忽略 */
fire('viewLayer','touchend', ev([touch(2, 950, 300)]));

/* ============ 场景 3：两个一起用（回归测试） ============ */
console.log('\n[3] 左手推摇杆 + 右手转视角 同时进行  ← 关键');
P.yaw=0; P.pitch=0; P.joyX=0; P.joyY=0;
// 左手先按在摇杆上
fire('joyZone','touchstart', ev([touch(1, 100, 400)]));
// 右手按在视角区
fire('viewLayer','touchstart', ev([touch(2, 900, 300)]));

// 现在两根手指同时在动。
// 关键点：每次 touchmove 的 changedTouches 里只有「当前动的那根」，
// 但事件会同时派发到 joyZone 和 viewLayer 两个处理函数。
// 修复前：joyZone 拿到手指2的位移当推杆、viewLayer 拿到手指1的位移当转角 → 互相污染。
for(let i=1;i<=10;i++){
  // 左手持续向上推（每帧 5px，共 50px）
  const t1=touch(1, 100, 400-5*i);
  fire('joyZone','touchmove', ev([t1]));
  fire('viewLayer','touchmove', ev([t1]));   // 事件也派发到视角层（手指1不属于它）
}
const joyY_mixed=P.joyY;
const yaw_mixed=P.yaw;
console.log('     joyY='+joyY_mixed.toFixed(2)+'  yaw='+yaw_mixed.toFixed(4)+' (期望 yaw≈0)');

// 现在右手单独转 50px（从 900 走到 950，一共 10 帧 × 5px）
for(let i=1;i<=10;i++){
  const t2=touch(2, 900+5*i, 300);
  fire('joyZone','touchmove', ev([t2]));     // 也派发到摇杆层（手指2不属于它）
  fire('viewLayer','touchmove', ev([t2]));
}
console.log('     转视角后 yaw='+P.yaw.toFixed(4));
ok(Math.abs(yaw_mixed) < 1e-9, '左手推摇杆时 yaw 完全没变（未被污染）');
ok(joyY_mixed < -0.5, '摇杆正常（joyY='+joyY_mixed.toFixed(2)+'）');
const expectYaw=-50*0.0016;
ok(Math.abs(P.yaw-expectYaw) < 1e-6,
   '右手转 50px → yaw='+P.yaw.toFixed(4)+'，理论值 '+expectYaw.toFixed(4));
ok(Math.abs(P.joyY-joyY_mixed) < 1e-9, '右手转视角时摇杆值完全没变');

/* ============ 场景 4：视角手指抬起不影响摇杆 ============ */
console.log('\n[4] 抬起视角手指，摇杆应继续有效');
fire('viewLayer','touchend', ev([touch(2, 950, 300)]));
const joyBefore=P.joyY;
const t1b=touch(1, 100, 350);
fire('joyZone','touchmove', ev([t1b]));
ok(P.joyY <= joyBefore + 1e-9, '摇杆仍在响应（joyY='+P.joyY.toFixed(2)+'）');

/* ============ 场景 5：摇杆手指抬起 ============ */
console.log('\n[5] 抬起摇杆手指');
fire('joyZone','touchend', ev([touch(1, 100, 350)]));
/* softEnd 有 250ms 防抖（防止 WebView 误发 touchend），
   测试环境下 setTimeout 被 stub 成不执行，这里手动把时间推过去：
   用 touchcancel 走立即结束的分支即可验证 endJoy 的效果。 */
fire('joyZone','touchcancel', ev([touch(1, 100, 350)]));
const yawKeep=P.yaw;
fire('joyZone','touchmove', ev([touch(1, 100, 200)]));
ok(Math.abs(P.joyY) < 1e-9, '摇杆已归零（joyY='+P.joyY.toFixed(2)+'）');
ok(Math.abs(P.yaw-yawKeep) < 1e-9, '抬手指不影响视角');

if(global.__fail){ console.log('\n❌ 多指测试有失败项'); process.exit(1); }
console.log('\nMULTITOUCH_OK: 摇杆与视角按 identifier 严格隔离，互不污染');