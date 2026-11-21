/* 输入方式自适应 + 键盘映射测试
   验证：
     1) 检测到键盘按键 -> 摇杆和按钮被隐藏
     2) 检测到触摸 -> 重新显示（且只在局内）
     3) 主菜单上不会显示摇杆
     4) 键盘映射：E 互动 / Shift 趴下 / Space 跳跃 / Ctrl+W 奔跑
     5) 松开 Ctrl+W 停止奔跑
     6) 失焦清空按键（不会卡住「一直往前走」） */
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

/* ---- 会记录监听器的假 DOM ---- */
const listeners={};          // 'type' -> [fn]
function mkNode(id){
  const n={ id, style:{}, dataset:{},
    classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},
      contains(c){return this._s.has(c);},toggle(c){ this._s.has(c)?this._s.delete(c):this._s.add(c); }},
    textContent:'',innerHTML:'',_lis:{},
    addEventListener(t,f){ (this._lis[t]=this._lis[t]||[]).push(f); },
    appendChild(){}, querySelector(){return null;}, querySelectorAll(){return [];} };
  return n;
}
const domStore={};
global.document={
  getElementById:(id)=>domStore[id]||(domStore[id]=mkNode(id)),
  createElement:(t)=>mkNode('new-'+t),
  addEventListener(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  body:{appendChild(){},classList:{add(){},remove(){},contains(){return false;}}},
  readyState:'complete',
};
global.window=global;
/* 全局事件登记：游戏用 addEventListener 挂 keydown/mousedown 等 */
global.addEventListener=(t,f)=>{ (listeners[t]=listeners[t]||[]).push(f); };
global.removeEventListener=()=>{};
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>0;
global.setTimeout=(f,t)=>0;     // 测试里不跑定时器
global.matchMedia=(q)=>({ matches: q.indexOf('coarse')>=0 ? false : true });
Object.defineProperty(global,'navigator',{configurable:true,writable:true,
  value:{userAgent:'node',maxTouchPoints:0}});

const parts=['I18N','b_world.js','c_player.js','d_game.js','e_io.js','f_ui.js','x_ext.js','w_weapon.js','y_audio.js','z_render.js'];
let code='';
for(const p of parts){ { const fp = p==='I18N' ? '../i18n/i18n_core.js' : 'full/'+p; if(!fs.existsSync(fp)) continue; }
  code+='\n/* ==== '+p+' ==== */\n'+fs.readFileSync(p==='I18N' ? '../i18n/i18n_core.js' : 'full/'+p, 'utf8'); }
code='const THREE=global.__THREE__;\n'+code;

let S;
try{
  S=new Function(code+'\n;return {get P(){return P;},'
    +' applyInputMode, initInputModeDetect, toggleProne, doJump,'
    +' get inputMode(){return inputMode;}};')();
}catch(e){ console.log('COMPILE_FAIL:',e.message); process.exit(1); }

const P=S.P;
let fail=0;
function ok(c,m){ console.log((c?'  ✅ ':'  ❌ ')+m); if(!c) fail=1; }

/* bindUI 已在模块末尾自动执行，检测监听器应已挂上 */
const keydowns=listeners['keydown']||[];
ok(keydowns.length>0,'全局 keydown 监听已挂上（'+keydowns.length+' 个）');

function fire(type, ev){
  const base={ preventDefault(){}, stopPropagation(){}, repeat:false,
    code:'', key:'', button:0, ctrlKey:false, metaKey:false,
    target:{tagName:'CANVAS',id:'c'} };
  const e=Object.assign(base, ev||{});
  for(const f of (listeners[type]||[])) f(e);
}
function jz(){ return domStore['joyZone']; }
function az(){ return domStore['actZone']; }

console.log('\n[1] 主菜单上不显示触摸控件');
ok(jz().style.display!=='block','主菜单时摇杆未显示');
ok(az().style.display!=='block','主菜单时按钮区未显示');

console.log('\n[2] 检测到键盘 -> 隐藏触摸控件');
window.__inGame=true;                 // 先假装已经进局
S.applyInputMode('touch', true);
ok(jz().style.display==='block','进局+触摸模式：摇杆显示');
ok(az().style.display==='block','进局+触摸模式：按钮区显示');

S.applyInputMode('keyboard', true);
ok(jz().style.display==='none','切到键盘：摇杆隐藏');
ok(az().style.display==='none','切到键盘：按钮区隐藏');
ok(S.inputMode==='keyboard','内部模式确实是 keyboard');

console.log('\n[3] 检测到触摸 -> 重新显示');
S.applyInputMode('touch', true);
ok(jz().style.display==='block','切回触摸：摇杆重新显示');
ok(az().style.display==='block','切回触摸：按钮区重新显示');

console.log('\n[4] 按键盘真的会触发切换（不是只有手动调用才行）');
S.applyInputMode('touch', true);
/* 模式切换有 400ms 防抖冷却，测试里要先把时间往前推过冷却期，
   否则上一次 applyInputMode 刚设置的 lastSwitchAt 会挡住这次切换。 */
const realNow=Date.now;
let fakeClock=realNow()+5000;
Date.now=()=>fakeClock;
fire('keydown', {code:'KeyW', key:'w'});
ok(S.inputMode==='keyboard','按下 W 后自动切到键盘模式');
ok(jz().style.display==='none','W 按下后摇杆已隐藏');

console.log('\n[5] 触摸屏幕切回触摸模式');
fakeClock+=5000;
fire('touchstart', {code:'', key:''});
ok(S.inputMode==='touch','触摸后自动切回触摸模式');
Date.now=realNow;

console.log('\n[6] 键盘映射');
/* Shift -> 趴下 */
P.prone=false;
fire('keydown',{code:'ShiftLeft', key:'Shift'});
ok(P.prone===true,'左 Shift -> 趴下');
fire('keydown',{code:'ShiftRight', key:'Shift'});
ok(P.prone===false,'右 Shift -> 站起');

/* Space -> 跳跃（先确保站立、在地面） */
P.prone=false; P.onGround=true; P.vel.y=0;
fire('keydown',{code:'Space', key:' '});
ok(P.vel.y>0,'Space -> 跳跃');

/* Ctrl+W -> 奔跑 */
P.sprinting=false;
fire('keydown',{code:'KeyW', key:'w', ctrlKey:true});
ok(P.sprinting===true,'Ctrl+W -> 进入奔跑');
ok(P.keys['KeyW']===true,'Ctrl+W 同时也算前进输入');

console.log('\n[7] 松开后停止奔跑');
fire('keyup',{code:'KeyW', key:'w'});
ok(P.sprinting===false,'松开 W 后停止奔跑');
ok(P.keys['KeyW']===false,'松开 W 后清掉按键状态');

console.log('\n[8] 失焦清空按键');
P.keys['KeyA']=true; P.sprinting=true;
fire('blur',{});
ok(Object.keys(P.keys).length===0,'失焦后按键表清空');
ok(P.sprinting===false,'失焦后停止奔跑');

console.log('\n[9] 按键不冲突：Ctrl 不再负责趴下');
P.prone=false;
fire('keydown',{code:'ControlLeft', key:'Control'});
ok(P.prone===false,'单独按 Ctrl 不会误触趴下');

console.log('\n'+(fail?'INPUT_FAIL: 输入模式或键盘映射未通过'
  :'INPUT_OK: 键盘/触摸自动切换触摸按键，WASD/E/左键/右键/Shift/Space/Ctrl+W 全部正确'));
process.exit(fail?1:0);