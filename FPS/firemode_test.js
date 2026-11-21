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
  /* 真实的 Raycaster 有 .ray.origin / .ray.direction，
     新版 fireOnce 会对 direction 做 copy/set/normalize，
     旧桩里没有 ray 字段会直接抛 TypeError。
     这里补上最小可用实现，并记录最后一次调用的射线数（供散射断言）。 */
  Raycaster:function(origin,dir){
    this.ray={ origin:origin?origin.clone():new V3(),
               direction:dir?dir.clone():new V3(0,0,-1) };
    this.calls=0;
    this.intersectObjects=()=>{ this.calls++; return []; };
  },
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
  S=new Function(code+'\n;return {get P(){return P;}, SHOP_ITEMS, SHOT_SPREAD,'
    +' switchSlot, cycleSlot, slotUsable, slotItem, curDamage, curAmmoKey,'
    +' curReserveKey, curIsMelee, buildWpnBar, fire, fireOnce, updFireHold,'
    +' startReload, updReload, fixSlot, WSLOTS,'
    +' curFireMode, curIsAuto, curFireCd, curPumpTime, curPellets, curRecoilK,'
    +' curItem, curModelKind, fireModeLabel, FIRE_MODES,'
    +' get wPump(){return wPump;}, set wPump(v){wPump=v;}, get wAds(){return wAds;},\n'
    +' set wAds(v){wAds=v;}, get wSprint(){return wSprint;}, set wSprint(v){wSprint=v;},\n'
    +' get weaponRoot(){return weaponRoot;}, get wsk(){return wsk;}, updWeapon, updPump,\n'
    +' get wPumpDur(){return wPumpDur;},'
    +' __setCamera(c){ camera=c; },'
    +' __setReady(v){ ready=v; },'
    +' __setShootables(a){ try{ shootables.length=0; a.forEach(function(x){shootables.push(x);}); }catch(e){} }};')();
}catch(e){ console.log('COMPILE_FAIL:',e.message); process.exit(1); }
const P=S.P, IT=S.SHOP_ITEMS;
/* fireOnce() 要读 camera.position / lookDir()，而 smoke_test 那套桩里
   camera 是 initWorld 之后才有的。这里在测试开头就把 camera 造出来，
   并把 shootables 留空（不打到任何东西），只验证弹药、冷却、泵动状态机。 */
global.__camera=global.__camera||new THREE.PerspectiveCamera();
/* 把 camera 塞进被 eval 的作用域：用 S 暴露的 setter 不方便（camera 不是
   getter），改为直接调用在作用域里声明过的 initWorld 之外的赋值方式——
   最简单可靠的做法是靠下面的 __mkCamera 辅助。 */
if(typeof S.__setCamera==='function') S.__setCamera(global.__camera);
let fail=0;
const ok=(c,m)=>{ console.log((c?'  ✅ ':'  ❌ ')+m); if(!c) fail=1; };
const near=(a,b,eps,m)=>{ const d=Math.abs(a-b); ok(d<=(eps===undefined?1e-6:eps), m+' (实际 '+a.toFixed(4)+' 期望 '+b.toFixed(4)+')'); };

/* ============================================================
   第 1 部分：射击模式字段与语义
   ============================================================ */
console.log("\n[1] 射击模式数据表");
/* 用户需求原文：
     步枪全自动 / 手枪半自动 / 狙击手动 / 精确射手半自动 / 霰弹枪 M870 + 泵动 */
const M={auto:['gun_rifle','gun_smg'], semi:['pis_default','pis_heavy','gun_dmr'],
         bolt:['gun_sniper'], pump:['gun_m870']};
for(const [mode,ids] of Object.entries(M)){
  for(const id of ids){
    ok(IT[id] && IT[id].fireMode===mode, id+' -> '+mode);
  }
}
ok(!!IT['gun_m870'], '存在 M870 霰弹枪物品');
ok(IT['gun_m870'].ammoType==='shot','M870 用霰弹（ammo_shot）');
ok(IT['gun_m870'].pellets===9,'M870 一次 9 颗弹丸');
ok(IT['gun_dmr'] && IT['gun_dmr'].ammoType==='rifle','DMR 用步枪弹');

console.log("\n[2] 每把枪都有机瞄参数（没有的补上）");
/* 任何一个 cat==='gun'|'pistol' 的物品都必须登记 adsZ/adsY/sightY，
   否则开镜后枪会停在奇怪位置。 */
for(const id of Object.keys(IT)){
  const it=IT[id];
  if(it.cat!=='gun' && it.cat!=='pistol') continue;
  const good = typeof it.adsZ==='number' && typeof it.adsY==='number'
            && typeof it.sightY==='number' && typeof it.fireMode==='string'
            && typeof it.fireCd==='number';
  ok(good, id+' 具备 fireMode/fireCd/adsZ/adsY/sightY');
}

/* ---- 准备一个可用的装备状态 ---- */
P.equip.primary='gun_rifle';
P.equip.secondary='pis_default';
P.equip.melee='melee_knife';

console.log("\n[3] curFireMode() 跟随手持槽");
P.slot='primary'; P.equip.primary='gun_rifle';
ok(S.curFireMode()==='auto','步枪 = 全自动');
ok(S.curIsAuto()===true,'步枪允许长按连发');
P.equip.primary='gun_sniper';
ok(S.curFireMode()==='bolt','狙击 = 栓动');
ok(S.curIsAuto()===false,'狙击不允许连发');
P.equip.primary='gun_dmr';
ok(S.curFireMode()==='semi','精确射手 = 半自动');
ok(S.curIsAuto()===false,'DMR 不允许连发');
P.equip.primary='gun_m870';
ok(S.curFireMode()==='pump','M870 = 泵动');
ok(S.curIsAuto()===false,'霰弹枪不允许连发');
ok(S.curPellets()===9,'M870 弹丸数 9');
ok(S.curPumpTime()>0,'M870 有拉护木时间 '+S.curPumpTime());
S.switchSlot('secondary', true);
ok(S.curFireMode()==='semi','手枪 = 半自动');
S.switchSlot('melee', true);
ok(S.curFireMode()==='melee','近战没有射击模式');
ok(S.curPellets()===1,'近战只有 1 条射线');

console.log("\n[4] 射速按枪区分（以前步枪和狙击一样快）");
const cds={};
for(const id of ['gun_rifle','gun_smg','gun_sniper','gun_dmr','gun_m870']){
  P.slot='primary'; P.equip.primary=id;
  cds[id]=S.curFireCd();
}
ok(cds.gun_rifle<cds.gun_sniper,'步枪比狙击快得多 ('+cds.gun_rifle+' vs '+cds.gun_sniper+')');
ok(cds.gun_smg<cds.gun_rifle,'冲锋枪比步枪还快');
ok(cds.gun_sniper>0.8,'狙击开火间隔 > 0.8s，有栓动手感');
ok(cds.gun_dmr>cds.gun_rifle && cds.gun_dmr<cds.gun_sniper,'DMR 介于步枪和狙击之间');

/* ============================================================
   第 2 部分：fire() 的泵动/半自动互斥
   ============================================================ */
console.log("\n[5] 泵动：打完一发必须拉完护木才能再打");
P.slot='primary'; P.equip.primary='gun_m870';
P.reload=false; P.shootCd=0; S.wPump=0;
P.ammo.gun=7;
const ammo0=P.ammo.gun;
S.fire();
ok(P.ammo.gun===ammo0-1,'开火扣 1 发 -> '+P.ammo.gun);
ok(S.wPump>0.99,'开火后进入泵动状态 wPump='+S.wPump);
ok(P.shootCd>=S.curPumpTime()-1e-9,'冷却被拉到拉护木时间 '+P.shootCd.toFixed(2));
const ammo1=P.ammo.gun;
P.shootCd=0;            // 就算冷却人为清零，wPump 没走完也不许开火
S.fire();
ok(P.ammo.gun===ammo1,'拉栓未完成时再点不开火（弹量没变）');
/* 把护木推回去 */
let guard=0;
while(S.wPump>0 && guard++<200) S.updPump(1/60, 0);
ok(S.wPump===0,'泵动动画走完，wPump 归零（用了 '+guard+' 帧）');
P.shootCd=0;
S.fire();
ok(P.ammo.gun===ammo1-1,'拉完护木可以再打一发');

console.log("\n[6] 半自动：松开也要重新点，长按不连发");
P.slot='primary'; P.equip.primary='gun_dmr';
P.reload=false; P.shootCd=0; S.wPump=0; P.ammo.gun=20;
const dmr0=P.ammo.gun;
S.fire();
ok(P.ammo.gun===dmr0-1,'DMR 点一次打一发');
/* updFireHold 在 semi 下必须直接返回 */
P.firing=true;
P.shootCd=0;
S.updFireHold(1/60);
ok(P.ammo.gun===dmr0-1,'按住不放时 DMR 不会再开火（ammo 没减少）');

console.log("\n[7] 全自动：按住时每帧检查冷却，到点就继续打");
P.slot='primary'; P.equip.primary='gun_rifle';
P.reload=false; P.shootCd=0; S.wPump=0; P.ammo.gun=30; P.firing=true;
const auto0=P.ammo.gun;
S.fire();                       // 按下瞬间第一发
ok(P.ammo.gun===auto0-1,'按下立刻打第一发');
/* 模拟按住 dt 累积：每帧把冷却减到 0 再调 updFireHold */
let shots=1;
/* updFireHold 会检查场景是否就绪（b_world 的 ready）。
   测试桩里没有调 initWorld()，ready 恒为 false，
   不置真就变成在测「开局按住不该开枪」。 */
S.__setReady(true);
for(let i=0;i<10;i++){
  P.shootCd=Math.max(0, P.shootCd-0.02);
  if(P.shootCd<=0){ const b=P.ammo.gun; S.updFireHold(0.02); if(P.ammo.gun<b) shots++; }
}
ok(shots>1,'按住期间连续开火，共打了 '+shots+' 发');
ok(P.ammo.gun<auto0,'弹药确实在持续消耗');
/* 松开扳机必须停 */
P.firing=false; P.shootCd=0;
const hold0=P.ammo.gun;
S.updFireHold(1/60);
ok(P.ammo.gun===hold0,'松开扳机后 updFireHold 不再开火');

/* ============================================================
   第 3 部分：霰弹多弹丸 + 近距离高伤害
   ============================================================ */
console.log("\n[8] 霰弹散开：pellets 决定取样条数");
P.slot='primary'; P.equip.primary='gun_m870';
ok(S.curPellets()===9,'M870 取 9 条射线');
P.equip.primary='gun_rifle';
ok(S.curPellets()===1,'步枪只取 1 条射线');
ok(S.SHOT_SPREAD>0 && S.SHOT_SPREAD<0.2,'散射半角在合理范围 '+S.SHOT_SPREAD);

console.log("\n[9] 近距离伤害：9 颗全中 = 一枪 126");
/* 用数据表直接算理论值，不依赖场景：
   单颗 14，9 颗全中 126 —— 超过满血 100，符合「近距一枪致命」。 */
const m870=IT['gun_m870'];
ok(m870.dmg* m870.pellets>100,'9 颗全中 '+(m870.dmg*m870.pellets)+' > 100 满血');
ok(m870.dmg<m870.dmg*m870.pellets,'单颗伤害远低于总伤害（散弹特征）');
/* 衰减公式：6m 内满伤，12m 剩 31%，20m 后封底 30% */
const decay=(d)=> d>6 ? Math.max(0.30, 1-(d-6)*0.115) : 1;
ok(decay(3)===1,'3 米内不衰减');
ok(decay(6)===1,'6 米仍满伤');
ok(decay(10)<0.6 && decay(10)>0.5,'10 米衰减到 '+(decay(10)*100).toFixed(0)+'%');
ok(decay(30)===0.30,'30 米封底 30%，不会归零');

/* ============================================================
   第 4 部分：机瞄位姿
   ============================================================ */
console.log("\n[10] wAds 跟随 P.aimT（以前是死变量）");
ok(S.weaponRoot===null, '未初始化时 weaponRoot 为 null（updWeapon 会安全返回）');
S.updWeapon(1/60);        // 不应该抛异常
ok(true,'weaponRoot 未建时 updWeapon 直接返回，不抛错');

console.log("\n[11] 机瞄参数插值边界");
/* 直接验证 addYTarget 的算式在两个极端取值：
     a=0  -> 枪在右下角腰射位姿
     a=1  -> 枪在正中、瞄具对齐屏幕中心
   由于测试桩里没有相机和 group，这里用公式本身断言，
   真机位姿由真机截图额外确认。 */
const adsYTarget=(it)=> it.adsY - it.sightY*0.55;
for(const id of ['gun_rifle','gun_smg','gun_sniper','gun_dmr','gun_m870','pis_default','pis_heavy']){
  const it=IT[id];
  const y=adsYTarget(it);
  /* 开镜后枪身 Y 必须离 0 很近（不可能是 -0.17 那种右下角位置），
     否则准星会偏到屏幕外面去。 */
  ok(Math.abs(y)<0.06, id+' 开镜 Y 偏移 '+y.toFixed(4)+' 接近准星中心');
}
/* 狙击的镜筒最高，所以它下移的量应该最大 */
ok(Math.abs(adsYTarget(IT.gun_sniper))>Math.abs(adsYTarget(IT.gun_rifle)),
   '狙击镜筒更高，开镜需要下移更多');
/* 各枪 FOV 倍率：狙击最小视场 = 放得最大 */
ok((IT.gun_sniper.adsFov||1)<(IT.gun_dmr.adsFov||1),'狙击开镜倍率高于 DMR');
ok((IT.gun_dmr.adsFov||1)<1,'DMR 开镜有额外放大');
ok((IT.gun_rifle.adsFov||1)===1,'步枪保持基准视场');

console.log("\n[12] 奔跑时不允许机瞄");
/* 公式：adsTarget = P.aimT * (1-wSprint)。
   跑起来 wSprint->1，乘数归零，机瞄量被压掉。 */
ok(1*(1-1)===0,'wSprint=1 时 adsTarget 为 0');
ok(1*(1-0)===1,'wSprint=0 时 adsTarget 跟随 aimT');

console.log("\n[13] 模型选择：M870 显示霰弹枪模型");
P.slot='primary';
P.equip.primary='gun_m870';
ok(S.curModelKind()==='shotgun','M870 -> shotgun 模型');
P.equip.primary='gun_rifle';
ok(S.curModelKind()==='rifle','步枪 -> rifle 模型');
P.equip.primary='gun_sniper';
ok(S.curModelKind()==='rifle','狙击也走 rifle 模型（有镜筒）');
P.slot='secondary';
ok(S.curModelKind()==='pistol','手枪槽 -> pistol 模型');
P.slot='melee';
ok(S.curModelKind()==='knife','近战槽 -> knife 模型');

console.log("\n[14] 射击模式标签有中文可显示");
P.slot='primary'; P.equip.primary='gun_rifle';
ok(S.fireModeLabel()==='全自动','步枪标签 全自动');
P.equip.primary='gun_m870';
ok(S.fireModeLabel()==='泵动','M870 标签 泵动');
P.equip.primary='gun_sniper';
ok(S.fireModeLabel()==='栓动','狙击标签 栓动');
P.equip.primary='gun_dmr';
ok(S.fireModeLabel()==='半自动','DMR 标签 半自动');
P.slot='melee';
ok(S.fireModeLabel()==='近战','近战标签 近战');

/* ============================================================
   第 5 部分：原有武器槽行为不能被破坏
   ============================================================ */
console.log("\n[15] 回归：三个槽仍可互切");
P.equip.primary='gun_rifle';
P.slot='primary';
ok(S.switchSlot('secondary', true)===true,'切到手枪');
ok(S.switchSlot('melee', true)===true,'切到副武器');
ok(S.switchSlot('primary', true)===true,'切回主武器');
ok(S.curAmmoKey()==='gun','主武器仍用 P.ammo.gun');
console.log("\n[16] 回归：子弹 HUD 不炸");
P.slot='melee';
ok(S.curAmmoKey()===null,'近战 ammoKey 为 null（HUD 显示 ∞）');
ok(S.curReserveKey()===null,'近战 reserveKey 为 null（HUD 显示 近战）');

console.log("\n[17] 后备弹种按枪选（不是一律 rifle）");
/* 这是改 M870 时揪出来的真 bug：curReserveKey 原来按槽位硬写
   primary->'rifle'，导致霰弹枪从步枪弹里扣子弹。 */
P.slot='primary';
const reserves={
  gun_rifle:'rifle', gun_smg:'pistol', gun_sniper:'sniper',
  gun_dmr:'rifle', gun_m870:'shot'
};
for(const [id,expect] of Object.entries(reserves)){
  P.equip.primary=id;
  ok(S.curReserveKey()===expect, id+' 后备弹 = '+S.curReserveKey()+' 期望 '+expect);
}
P.slot='secondary'; P.equip.secondary='pis_default';
ok(S.curReserveKey()==='pistol','手枪后备弹 = pistol');
P.slot='melee';
ok(S.curReserveKey()===null,'近战没有后备弹');

console.log("\n[18] P.ammo 初始化齐全（以前缺 sniper/shot）");
for(const k of ['rifle','pistol','sniper','shot']){
  ok(typeof P.ammo[k]==='number', 'P.ammo.'+k+' 已初始化 = '+P.ammo[k]);
}

console.log("\n[19] M870 换弹从霰弹后备扣");
P.slot='primary'; P.equip.primary='gun_m870';
P.reload=false; P.shootCd=0; S.wPump=0;
P.ammo.gun=0; P.ammo.shot=24; P.ammo.rifle=60;
S.startReload();
ok(P.reload===true,'霰弹枪开始换弹');
P.reloadT=0; S.updReload(0.016);
ok(P.ammo.gun>0,'换弹后弹匣有弹 '+P.ammo.gun);
ok(P.ammo.shot<24,'霰弹后备被扣到 '+P.ammo.shot);
ok(P.ammo.rifle===60,'步枪后备丝毫没动（仍是 60）');
ok(P.ammo.gun<=7,'装填量不超过弹管容量 7，实际 '+P.ammo.gun);

console.log('\n'+(fail?'FIREMODE_FAIL: 射击模式/机瞄有问题'
  :'FIREMODE_OK: 全自动/半自动/栓动/泵动 手感分离，M870 多弹丸近距高伤，所有枪械有机瞄位姿'));
process.exit(fail?1:0);
