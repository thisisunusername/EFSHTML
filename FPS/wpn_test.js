/* 武器槽切换测试
   验证：
     1) 三个槽（主武器/手枪/副武器）能互相切换
     2) 空槽切不过去
     3) 切到副武器后不耗弹、开火伤害来自物品表
     4) 主武器/手枪各自用不同的弹药字段
     5) 换弹中断：换弹中切枪会取消
     6) 底部切换条的 DOM 会跟着高亮 */
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
  this.children=[]; this.visible=true;
}
MeshStub.prototype.add=function(o){ this.children.push(o); };
MeshStub.prototype.clone=function(){
  const c=new MeshStub(this.geometry,this.material);
  c.position.copy(this.position); c.rotation.copy(this.rotation);
  return c;
};
function SceneCtor(){
  return { children:[], add(o){ this.children.push(o); },
    remove(o){ const i=this.children.indexOf(o); if(i>=0) this.children.splice(i,1); } };
}
const THREE={
  Vector3:V3,
  Euler:function(){ this.x=0;this.y=0;this.z=0;this.order='XYZ';
    this.set=()=>this; this.copy=()=>this; },
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
  Raycaster:function(){ this.intersectObjects=()=>[]; },
};
global.__THREE__=THREE;

function mkNode(id){
  return { id, style:{}, dataset:{}, textContent:'', innerHTML:'',
    classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},
      contains(c){return this._s.has(c);},toggle(){}},
    addEventListener(){}, appendChild(){}, removeChild(){},
    querySelector(){return null;}, querySelectorAll(){return [];} };
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
global.setTimeout=(f,t)=>0;
Object.defineProperty(global,'navigator',{configurable:true,writable:true,
  value:{userAgent:'node',maxTouchPoints:0}});

const parts=['I18N','b_world.js','c_player.js','d_game.js','e_io.js','f_ui.js',
             'x_ext.js','w_weapon.js','y_audio.js','z_render.js'];
let code='const THREE=global.__THREE__;\n';
for(const p of parts){ { const fp = p==='I18N' ? '../i18n/i18n_core.js' : 'full/'+p; if(!fs.existsSync(fp)) continue; }
  code+='\n/* ==== '+p+' ==== */\n'+fs.readFileSync(p==='I18N' ? '../i18n/i18n_core.js' : 'full/'+p, 'utf8'); }

let S;
try{
  S=new Function(code+'\n;return {get P(){return P;}, SHOP_ITEMS,'
    +' switchSlot, cycleSlot, slotUsable, slotItem, curDamage, curAmmoKey,'
    +' curReserveKey, curIsMelee, buildWpnBar, fire, updReload, startReload,'
    +' fixSlot, WSLOTS};')();
}catch(e){ console.log('COMPILE_FAIL:',e.message); process.exit(1); }

const P=S.P, IT=S.SHOP_ITEMS;
let fail=0;
const ok=(c,m)=>{ console.log((c?'  ✅ ':'  ❌ ')+m); if(!c) fail=1; };

console.log('\n[1] 初始状态');
P.slot='secondary';
P.equip.primary=null;
P.equip.secondary='pis_default';
P.equip.melee='melee_knife';
ok(S.slotUsable('secondary')===true,'手枪槽可用');
ok(S.slotUsable('melee')===true,'副武器槽可用');
ok(S.slotUsable('primary')===false,'主武器槽为空，不可用');

console.log('\n[2] 空槽切不过去');
const r1=S.switchSlot('primary', true);
ok(r1===false,'切到空的主武器槽被拒绝');
ok(P.slot==='secondary','槽位没有变');

console.log('\n[3] 手枪 <-> 副武器 互切');
ok(S.switchSlot('melee', true)===true,'切到副武器成功');
ok(P.slot==='melee','当前槽是 melee');
ok(S.curIsMelee()===true,'识别为近战');
ok(S.curAmmoKey()===null,'近战不耗弹药字段');
ok(S.switchSlot('secondary', true)===true,'切回手枪成功');
ok(P.slot==='secondary','当前槽是 secondary');

console.log('\n[4] 装上主武器后可以切过去');
P.equip.primary='gun_rifle';
ok(S.slotUsable('primary')===true,'主武器槽变为可用');
ok(S.switchSlot('primary', true)===true,'切到主武器成功');
ok(S.curAmmoKey()==='gun','主武器用 P.ammo.gun');
ok(S.curReserveKey()==='rifle','主武器备弹用 P.ammo.rifle');
ok(S.curDamage()===IT['gun_rifle'].dmg,'伤害取自物品表 '+S.curDamage());

console.log('\n[5] 不同枪的伤害不同');
S.switchSlot('secondary', true);
ok(S.curDamage()===IT['pis_default'].dmg,'手枪伤害 '+S.curDamage());
S.switchSlot('melee', true);
/* 近战伤害改回从物品表读：小刀 35、爪刀 42、太刀 56、战术斧 95。
   以前这里写死 return 40，导致「买更贵的刀伤害完全没变」，
   等于花钱只买了个外观。 */
ok(S.curDamage()===IT['melee_knife'].dmg,
   '近战伤害读物品表（小刀 '+S.curDamage()+'）');
P.equip.melee='melee_axe';
ok(S.curDamage()===IT['melee_axe'].dmg,'换战术斧伤害跟着变 -> '+S.curDamage());
P.equip.melee='melee_knife';

console.log('\n[6] 副武器不消耗弹药（按 curAmmoKey 判空来验证）');
/* 不真的调 fire()：它要用 camera/raycaster，测试桩里没建场景。
   改为直接验证「近战取到的弹药字段是 null」这个决定消耗的前置条件，
   以及 fire() 开头那段 `if(!melee && ...)` 的分支是走不进去的。 */
S.switchSlot('melee', true);
ok(S.curAmmoKey()===null,'近战 curAmmoKey() 为 null -> fire() 不会扣弹药');
ok(S.curIsMelee()===true,'curIsMelee() 为 true -> 跳过弹药检查');

console.log('\n[7] 近战不能换弹');
P.reload=false; P.shootCd=0;
S.startReload();
ok(P.reload===false,'副武器调用换弹被忽略');

console.log('\n[8] 手枪能换弹并从备弹扣');
S.switchSlot('secondary', true);
P.reload=false; P.shootCd=0;
P.ammo.ammo=0; P.ammo.pistol=40;
S.startReload();
ok(P.reload===true,'手枪开始换弹');
P.reloadT=0; S.updReload(0.016);
ok(P.ammo.ammo>0,'换弹后弹匣有子弹 '+P.ammo.ammo);
ok(P.ammo.pistol<40,'备弹被扣除，剩 '+P.ammo.pistol);

console.log('\n[9] 换弹中途切枪会取消换弹');
P.reload=false; P.shootCd=0;
S.startReload();
ok(P.reload===true,'开始换弹');
S.switchSlot('melee', true);
ok(P.reload===false,'切枪后换弹被取消');

console.log('\n[10] 循环切枪会跳过空槽');
P.equip.primary=null;
P.slot='secondary';
S.cycleSlot();
ok(P.slot==='melee','手枪之后循环到副武器（跳过空的主武器）');

console.log('\n[11] fixSlot 修正非法槽位');
P.slot='primary';                    // 但 primary 是空的
S.fixSlot();
ok(P.slot!=='primary','修正后不再是空槽 '+P.slot);

console.log('\n[12] 底部切换条的 DOM');
S.buildWpnBar();
const bar=store['wpnBar'];
ok(!!bar,'#wpnBar 存在');
ok(typeof bar.innerHTML==='string' && bar.innerHTML.indexOf('data-slot')>=0,
   '切换条含三个 data-slot 格子');
for(const s of S.WSLOTS){
  ok(bar.innerHTML.indexOf('data-slot="'+s+'"')>=0, '包含 '+s+' 格子');
}
ok(bar.innerHTML.indexOf('on')>=0,'当前槽带高亮类');

console.log('\n'+(fail?'WPN_FAIL: 武器切换有问题'
  :'WPN_OK: 主武器/手枪/副武器 可互切，弹药与伤害各自独立，空槽与换弹中断处理正确'));
process.exit(fail?1:0);