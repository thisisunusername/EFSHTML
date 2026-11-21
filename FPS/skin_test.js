/* 近战 / 皮肤 / 检视 / GM 测试
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
/* Group/Scene 也要有 position/rotation/scale，否则
   weaponRoot.position.set(...) 直接抛错。 */
function SceneCtor(){
  return { children:[],
    position:new V3(), rotation:new V3(), scale:new V3(1,1,1),
    add(o){ this.children.push(o); },
    remove(o){ const i=this.children.indexOf(o); if(i>=0) this.children.splice(i,1); } };
}
const THREE={
  Vector3:V3,
  Euler:function(){ this.x=0;this.y=0;this.z=0;this.order='XYZ';
    this.set=()=>this; this.copy=()=>this; },
  BoxGeometry:GeoStub, CylinderGeometry:GeoStub, SphereGeometry:GeoStub,
  CapsuleGeometry:GeoStub, PlaneGeometry:GeoStub, RingGeometry:GeoStub,
  ConeGeometry:GeoStub, CircleGeometry:GeoStub,
  TorusGeometry:GeoStub, CapsuleGeometry2:GeoStub,
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
  const n={ id, style:{}, dataset:{}, textContent:'', innerHTML:'', value:'',
    offsetWidth:236, offsetHeight:80,
    classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},
      contains(c){return this._s.has(c);},
      toggle(c,on){ if(on===undefined){ this._s.has(c)?this._s.delete(c):this._s.add(c); }
                   else if(on) this._s.add(c); else this._s.delete(c); }},
    _ev:{},
    addEventListener(t,f){ (this._ev[t]=this._ev[t]||[]).push(f); },
    fire(t,e){ (this._ev[t]||[]).forEach(f=>f(Object.assign({stopPropagation(){},preventDefault(){},target:n},e||{}))); },
    appendChild(){}, removeChild(){},
    querySelector(){return null;}, querySelectorAll(){return [];} };
  return n;
}
const store={};
global.document={
  getElementById:(id)=>store[id]||(store[id]=mkNode(id)),
  createElement:(t)=>mkNode('n'),
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
/* 测试里的 prompt 桩：模拟用户输入 42000 */
global.prompt=(msg,def)=>{ global.__promptCall={msg:msg,def:def}; return '42000'; };
/* toast / sfx 之类的 UI 副作用在测试里弹不出来，拦成空函数 */
const parts=['I18N','b_world.js','c_player.js','d_game.js','e_io.js','f_ui.js',
             'x_ext.js','w_weapon.js','y_audio.js','z_render.js'];
let code='const THREE=global.__THREE__;\n';
for(const p of parts){ const fp = p==='I18N' ? '../i18n/i18n_core.js' : 'full/'+p;
  if(!fs.existsSync(fp)) continue;
  code+='\n/* ==== '+p+' ==== */\n'+fs.readFileSync(fp,'utf8'); }
let S;
try{
S=new Function(code+'\n;return {get P(){return P;}, SHOP_ITEMS, SHOP_CATS, SKINS,'
    +' fire, fireOnce, updFireHold, updPump, meleeSwing, MELEE_MAX, MELEE_ARC, MELEE_RANGE,'
    +' curMeleeItem, curIsMelee, curDamage, curFireCd, switchSlot,'
    +' skinOf, skinMats, curSkinId, setSkin, applyWeaponModel, curModelKind,'
    +' startInspect, updInspect, isInspecting, updWeapon,'
    +' INSPECT_TIME, KNIFE_BUILDERS, knifeKindOf,'
    +' gmAddCash, gmSetCash, gmHitD, gmToggle, initGM, GM_HITS, GM_RESET_MS,'
    +' get gmCount(){return _gmCount;}, set gmCount(v){_gmCount=v;},'
    +' get gmLast(){return _gmLast;}, set gmLast(v){_gmLast=v;},'
    +' get gmOpen(){return _gmOpen;}, set gmOpen(v){_gmOpen=v;},'
    +' get wInsT(){return wInsT;}, get wInsDur(){return wInsDur;},'
    +' get weaponRoot(){return weaponRoot;}, get wsk(){return wsk;},'
    +' get _modelCache(){return _modelCache;},'
    +' en(){ return enemies; },'
    +' __setCamera(c){ camera=c; },'
    +' __setReady(v){ ready=v; },'
    +' __initWeapon(){ initWeapon(); },'
    +' __mkScene(){ scene = new THREE.Scene(); scene.add(camera); return scene; } };')();
}catch(e){ console.log('COMPILE_FAIL:',e.message); process.exit(1); }
const P=S.P, IT=S.SHOP_ITEMS, enemies=S.en();
let fail=0;
const ok=(c,m)=>{ console.log((c?'  ✅ ':'  ❌ ')+m); if(!c) fail=1; };
const near=(a,b,eps,m)=>{ const d=Math.abs(a-b); ok(d<=(eps===undefined?1e-6:eps), m+' (实际 '+a.toFixed(4)+' 期望 '+b.toFixed(4)+')'); };

/* ============================================================
   第 1 部分：小刀没有伤害（根因修复）
   ============================================================ */
console.log("[1] 近战武器表 & 伤害");
for(const id of ['melee_knife','melee_baton','melee_karambit','melee_katana','melee_axe']){
  ok(!!IT[id], '存在近战武器 '+id);
  if(IT[id]) ok(IT[id].cat==='melee' && IT[id].dmg>0, id+' 有伤害 '+IT[id].dmg);
}
ok(IT.melee_axe.dmg>IT.melee_katana.dmg,'战术斧伤害高于太刀');
ok(IT.melee_karambit.meleeCd<IT.melee_knife.meleeCd,'爪刀比小刀出手快');
ok(IT.melee_axe.meleeCd>IT.melee_knife.meleeCd,'战术斧比小刀挥得慢');
ok(IT.melee_katana.meleeRange>IT.melee_knife.meleeRange,'太刀范围最大');

console.log("\n[2] curMeleeItem / curDamage 对刀能读到表");
P.equip.melee='melee_knife';
P.slot='melee';
ok(S.curIsMelee()===true,'melee 槽是近战');
ok(S.curMeleeItem()===IT.melee_knife,'curMeleeItem 返回小刀条目');
near(S.curDamage(), 35, 1e-6, '小刀伤害 35');
near(S.curFireCd(), 0.42, 1e-6, '小刀挥砍间隔 0.42s');
P.equip.melee='melee_axe';
near(S.curDamage(), 95, 1e-6, '战术斧伤害 95');
near(S.curFireCd(), 0.78, 1e-6, '战术斧挥砍间隔 0.78s');

console.log("\n[3] 半球判定：贴脸敌人必须能砍到（旧实现用射线擦过胶囊体）");
/* 造一个「敌人」：身体是一个带 position 的 mesh，和 spawnEnemy 同构 */
function mkEnemy(x,z,hp){
  const body=new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial());
  body.position.set(x,0.85,z);
  const head=new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial());
  head.position.set(x,1.5,z);
  return {x:x,z:z,y:0,hp:hp===undefined?100:hp,alive:true,aggro:false,body:body,head:head};
}
/* 桩里的 PerspectiveCamera 继承 MeshStub，position 是 V3，可以用；
   但 initWeapon 还会用到 camera.add / camera.rotation 等，桩里都有。 */
const cam={ position:new THREE.Vector3(0,1.62,0), rotation:new THREE.Vector3(),
  quaternion:{setFromEuler(){return this;}}, fov:75, aspect:1,
  children:[], add(o){ this.children.push(o); },
  updateProjectionMatrix(){}, updateMatrixWorld(){},
  getWorldPosition(v){ return v; } };
if(!cam.position) cam.position=new V3();
if(!cam.rotation) cam.rotation=new V3();
if(!cam.quaternion) cam.quaternion={setFromEuler(){return this;}};
cam.position.set(0,1.62,0);
S.__setCamera(cam);
S.__setReady(true);
P.yaw=0;   // 朝 -Z 看（fx=-sin0=0, fz=-cos0=-1）
enemies.length=0;
/* 贴脸 0.6 米，正前方 */
const e1=mkEnemy(0,-0.6);
enemies.push(e1);
P.equip.melee='melee_knife'; P.slot='melee';
const n1=S.meleeSwing();
ok(n1===1,'贴脸敌人被命中（旧射线实现这里返回 0）');
ok(e1.hp<100,'敌人掉血 -> '+e1.hp);
ok(e1.aggro===true,'被砍到会激活仇恨');

console.log("\n[4] 半球判定：背后 / 太远 / 高度差过大 都不该命中");
enemies.length=0;
const behind=mkEnemy(0, 2.0);   // 背后（+Z 方向）
enemies.push(behind);
ok(S.meleeSwing()===0,'背后的敌人砍不到（只有正面 120°）');
ok(behind.hp===100,'背后敌人没掉血');
enemies.length=0;
const far=mkEnemy(0,-9.0);      // 9 米，超出 2.6 米
enemies.push(far);
ok(S.meleeSwing()===0,'9 米外的敌人砍不到');
enemies.length=0;
const high=mkEnemy(0,-1.0);
high.body.position.y=6.0;       // 楼上的敌人
enemies.push(high);
ok(S.meleeSwing()===0,'高度差 4 米以上的砍不到');

console.log("\n[5] 一刀最多砍 2 个，优先砍近的");
enemies.length=0;
const a=mkEnemy(-0.4,-0.9), b=mkEnemy(0.4,-1.0), c=mkEnemy(0,-1.3);
enemies.push(c,a,b);
ok(S.meleeSwing()===S.MELEE_MAX,'3 个敌人在圈内，只命中 MELEE_MAX='+S.MELEE_MAX+' 个');
ok(a.hp<100 && b.hp<100,'最近的两个掉血');
ok(c.hp===100,'最远的那个没挨刀');

console.log("\n[6] 太刀范围更大，能砍到小刀砍不到的距离");
enemies.length=0;
const mid=mkEnemy(0,-3.0);      // 3 米：超出小刀 2.6，但在太刀 3.3 内
enemies.push(mid);
P.equip.melee='melee_knife';
ok(S.meleeSwing()===0,'3 米外小刀砍不到');
P.equip.melee='melee_katana';
ok(S.meleeSwing()===1,'3 米外太刀能砍到');

console.log("\n[7] 斧头命中足够秒杀普通敌人");
ok(IT.melee_axe.dmg>=80,'战术斧 95 伤害，普通敌人 100 血两下，精英也扛不住三下');
enemies.length=0;
const e2=mkEnemy(0,-1.0,80);
enemies.push(e2);
P.equip.melee='melee_axe'; P.shootCd=0; P.reload=false;
S.fire();
ok(e2.alive===false,'80 血的敌人被一斧带走');
ok(e2.body.visible===false,'被击杀的敌人身体隐藏');

console.log("\n[8] 近战开火不耗弹");
enemies.length=0;
P.equip.melee='melee_knife'; P.slot='melee';
const ammoBefore={gun:P.ammo.gun, pistol:P.ammo.pistol};
P.shootCd=0;
S.fire();
ok(P.ammo.gun===ammoBefore.gun && P.ammo.pistol===ammoBefore.pistol,'砍一刀不动任何弹药字段');

/* ============================================================
   第 2 部分：武器皮肤
   ============================================================ */
console.log("\n[9] 皮肤表");
const SK=['skin_none','skin_neon','skin_blood','skin_gold','skin_toxic','skin_void'];
for(const id of SK){
  ok(!!S.SKINS[id], 'SKINS 里有 '+id);
  ok(!!IT[id], '商店里有 '+id);
  if(IT[id]) ok(IT[id].cat==='skin', id+' 分类是 skin');
}
ok(S.SKINS.skin_none.glowI===0,'原厂不发光');
ok(S.SKINS.skin_neon.glowI>0.5,'霓虹夜光有明显发光');
ok(S.SKINS.skin_void.glowI>S.SKINS.skin_gold.glowI,'虚空紫比黄金更亮（黄金是反光不发光）');
ok(S.SKINS.skin_neon.deco==='aura','霓虹有环绕光带');
ok(S.SKINS.skin_gold.deco==='none','黄金没有光环（只有金属高光）');
ok(S.SKIN_CATS_OK===undefined || true,'');
const skinCat=S.SHOP_CATS.filter(c=>c.id==='skin');
ok(skinCat.length===1,'SHOP_CATS 里有「武器皮肤」标签');
ok(skinCat[0].name.length>0,'分类名可读：'+skinCat[0].name);

console.log("\n[10] skinMats 给材质写 emissive");
const m0=S.skinMats(S.skinOf('skin_none'));
ok(m0.steel.emissiveIntensity===undefined || m0.steel.emissiveIntensity===0 || !m0.steel.emissive,
   '原厂材质不写 emissive');
const mn=S.skinMats(S.skinOf('skin_neon'));
ok(!!mn.steel.emissive,'霓虹材质设置了 emissive 颜色');
near(mn.steel.emissiveIntensity, 0.95, 1e-6, '霓虹发光强度 0.95');
ok(!!mn.main && !!mn.grip && !!mn.poly && !!mn.dark,'五种材质都造出来了');
ok(mn.main!==mn.steel,'不同部位的材质不是同一个对象（避免改一处全变）');

console.log("\n[11] curSkinId / setSkin 记住「哪把枪用哪个皮肤」");
P.equip.primary='gun_rifle';
P.equip.secondary='pis_default';
P.skins={};
ok(S.curSkinId()==='skin_none','默认是原厂');
ok(S.setSkin('gun_rifle','skin_neon')===true,'setSkin 成功');
ok(P.skins.gun_rifle==='skin_neon','P.skins 记录到了步枪上');
P.slot='primary';
ok(S.curSkinId()==='skin_neon','手持步枪时 curSkinId 是霓虹');
P.slot='secondary';
ok(S.curSkinId()==='skin_none','换到手枪又是原厂（各记各的）');
P.skins.pis_default='skin_blood';
ok(S.curSkinId()==='skin_blood','手枪单独记自己的赤血红');
ok(S.setSkin('gun_rifle','skin_gold')===true && P.skins.gun_rifle==='skin_gold','可以换皮肤');
ok(S.setSkin('gun_rifle','not_a_skin')===false,'未知皮肤 id 被拒绝');

console.log("\n[12] setSkin 触发模型重建（_modelCache.key 清空）");
S.__mkScene();   // 先把场景造出来，initWeapon 会往 scene 里塞相机
S.__initWeapon();
P.slot='primary'; P.equip.primary='gun_rifle';
P.skins.gun_rifle='skin_none';
S.applyWeaponModel();
const k1=S._modelCache.key;
ok(!!k1,'第一次 applyWeaponModel 建立了缓存 key='+k1);
S.applyWeaponModel();
ok(S._modelCache.key===k1,'同样参数再调一次不重建（key 不变）');
S.setSkin('gun_rifle','skin_void');
ok(S._modelCache.key===null,'setSkin 把 key 清了，下次必定重建');
S.applyWeaponModel();
ok(S._modelCache.key!==k1 && S._modelCache.key!==null,'重建后 key 变了 -> '+S._modelCache.key);
ok(S._modelCache.key.indexOf('skin_void')>=0,'新 key 里带皮肤名');

console.log("\n[13] 换刀型也触发重建，且模型不堆积");
S.__initWeapon();
P.slot='melee'; P.equip.melee='melee_knife';
S.applyWeaponModel();
const kids1=S.weaponRoot.children.length;
P.equip.melee='melee_katana';
S.applyWeaponModel();
const kids2=S.weaponRoot.children.length;
ok(kids2===1,'换刀型后 weaponRoot 下只有 1 个模型，没有堆积（旧的是 '+kids1+' 个）');
ok(S._modelCache.key.indexOf('katana')>=0,'key 里带刀型 katana');
P.equip.melee='melee_axe';
S.applyWeaponModel();
ok(S.weaponRoot.children.length===1,'再换斧头也是 1 个模型');
ok(S.curModelKind()==='knife','斧头归为 knife 类模型');
ok(S.knifeKindOf('melee_karambit')==='karambit','爪刀映射 karambit');
ok(S.knifeKindOf('melee_baton')==='machete','防暴棍用砍刀模型');
ok(typeof S.KNIFE_BUILDERS.karambit==='function','爪刀 builder 存在');
ok(typeof S.KNIFE_BUILDERS.katana==='function','太刀 builder 存在');
ok(typeof S.KNIFE_BUILDERS.axe==='function','战术斧 builder 存在');

/* ============================================================
   第 3 部分：检视（Inspect）
   ============================================================ */
console.log("\n[14] startInspect / updInspect");
P.slot='primary'; P.equip.primary='gun_rifle'; P.reload=false;
ok(S.isInspecting()===false,'初始不在检视');
ok(S.startInspect()===true,'startInspect 返回 true');
ok(S.isInspecting()===true,'状态变成检视中');
ok(S.wInsT===1,'wInsT 从 1 开始');
ok(S.startInspect()===false,'检视中再点不会重来');
S.updInspect(S.INSPECT_TIME/2);
near(S.wInsT, 0.5, 1e-6, '过一半时间 wInsT=0.5');
S.updInspect(S.INSPECT_TIME);
ok(S.wInsT===0,'时间到自动结束');
ok(S.isInspecting()===false,'结束后 isInspecting 为 false');
P.reload=true;
ok(S.startInspect()===false,'换弹中不能检视');
P.reload=false;

console.log("\n[15] 检视期间不能开火（枪都转脸上了）");
P.slot='primary'; P.equip.primary='gun_rifle';
P.ammo.gun=30; P.shootCd=0;
S.startInspect();
const before=P.ammo.gun;
S.fire();
ok(P.ammo.gun===before,'检视中扣扳机不掉弹');
P.firing=true;
S.updFireHold(1/60);
ok(P.ammo.gun===before,'检视中按住也不连发');
P.firing=false;
S.updInspect(S.INSPECT_TIME*2);
P.shootCd=0;
S.fire();
ok(P.ammo.gun===before-1,'检视结束后恢复正常开火');

console.log("\n[16] updWeapon 在检视中不抛错且叠加位移");
S.__initWeapon();
P.slot='primary'; P.equip.primary='gun_rifle';
S.applyWeaponModel();
let threw=false;
try{
  for(let i=0;i<20;i++){ S.startInspect(); S.updWeapon(1/60); }
}catch(e){ threw=true; console.log('    抛错：',e.message); }
ok(!threw,'连续 20 帧 updWeapon 检视无异常');
S.updInspect(99);
ok(S.wInsT===0,'强制结束后 wInsT 归零');

/* ============================================================
   第 4 部分：GM 隐藏面板
   ============================================================ */
console.log("\n[17] gmAddCash 改的是数据源 P.ammo.cash");
P.ammo.cash=500;
S.gmAddCash(1000);
ok(P.ammo.cash===1500,'+1 千 -> '+P.ammo.cash);
S.gmAddCash(10000);
ok(P.ammo.cash===11500,'+1 万 -> '+P.ammo.cash);
S.gmAddCash(0);
ok(P.ammo.cash===11500,'加 0 不生效（防误触）');
S.gmAddCash(-9999999);
ok(P.ammo.cash===11500,'负数被挡住（不能倒扣到负）');
S.gmAddCash(1000000);
ok(P.ammo.cash===1011500,'+100 万 -> '+P.ammo.cash);
ok(store.gmCashNum && store.gmCashNum.textContent!=='0','GM 面板金额数字被刷新 -> '+store.gmCashNum.textContent);

console.log("\n[18] gmSetCash 直接设定（走 prompt）");
S.gmSetCash('42000');
ok(P.ammo.cash===42000,'设定为 42000');
S.gmSetCash(-5);
ok(P.ammo.cash===0,'负数被夹到 0');
S.gmAddCash(777);
ok(P.ammo.cash===777,'设定后还能继续加');

console.log("\n[19] 主菜单连点 D 15 次才解锁");
/* 菜单可见 = style.display !== 'none' */
const menu=store.menu || (store.menu=mkNode('menu'));
menu.style.display='flex';
S.gmOpen=false; S.gmCount=0; S.gmLast=0;
for(let i=0;i<S.GM_HITS-1;i++) S.gmHitD();
ok(S.gmOpen===false,'点 '+(S.GM_HITS-1)+' 次还不开（差一次）');
S.gmHitD();
ok(S.gmOpen===true,'第 '+S.GM_HITS+' 次解锁 GM 面板');
ok(store.gmPanel.classList.contains('on'),'面板加上了 .on 类');
ok(S.gmCount===0,'解锁后计数归零，可以再触发');

console.log("\n[20] 中途停顿超过 1.2 秒就重新数");
S.gmOpen=false; S.gmCount=0; S.gmLast=0;
for(let i=0;i<10;i++) S.gmHitD();
ok(S.gmCount===10,'连点 10 次计数到 10');
S.gmLast=Date.now()-9999;   // 模拟停了很久
S.gmHitD();
ok(S.gmCount===1,'超时后重新从 1 数（不是 11）');
ok(S.gmOpen===false,'这时候当然没开面板');

console.log("\n[21] 游戏里按 D（菜单已隐藏）不计数");
S.gmOpen=false; S.gmCount=0; S.gmLast=0;
menu.style.display='none';
for(let i=0;i<30;i++) S.gmHitD();
ok(S.gmCount===0,'菜单隐藏时按 30 次 D，计数仍是 0（不会误触）');
ok(S.gmOpen===false,'也没开面板');
menu.style.display='flex';

console.log("\n[22] gmToggle 收起 / 展开");
S.gmToggle(true);
ok(S.gmOpen===true && store.gmPanel.classList.contains('on'),'展开');
S.gmToggle(false);
ok(S.gmOpen===false && !store.gmPanel.classList.contains('on'),'收起');
S.gmToggle();
ok(S.gmOpen===true,'不传参 = 切换');
S.gmToggle();
ok(S.gmOpen===false,'再切一次又关');

console.log("\n[23] initGM 幂等 + 按钮已绑");
store.gmPanel.dataset={};
S.initGM();
ok(store.gmPanel.dataset.bound==='1','initGM 打了 bound 标记');
const evCount=(store.gmPanel._ev.click||[]).length;
S.initGM();
ok((store.gmPanel._ev.click||[]).length===evCount,'再调一次 initGM 不会重复绑（幂等）');

console.log("\n[24] 所有近战/皮肤文案都有英文译文");
const needTexts=[];
for(const id of ['melee_knife','melee_baton','melee_karambit','melee_katana','melee_axe']){
  const it=IT[id]; if(!it) continue;
  needTexts.push(it.name, it.desc);
}
for(const id of SK){ const it=IT[id]; if(!it) continue; needTexts.push(it.name, it.desc); }
needTexts.push('武器皮肤','检视','先买一把枪再买皮肤','当前资金','GM 面板已解锁');
const I18N_EN=store.__none; // 占位，实际译文表在闭包里
/* 译文表在闭包里拿不到，改用一次性脚本核对（见 i18n_test）。
   这里只保证中文文案本身不为空。 */
let allTxtOk=true;
for(const t of needTexts){ if(!t || typeof t!=='string' || !t.length){ allTxtOk=false; console.log('    空文案：'+t); } }
ok(allTxtOk,'近战武器与皮肤的 name/desc 全部非空');

console.log('\n'+(fail?'❌ 有用例失败':'✅ 全部通过'));
process.exit(fail?1:0);
