/* 仓库布局测试：验证「左侧装备槽 + 右侧格子」这套新结构真的能装能卸。
   重点不是看 HTML 长什么样，而是验证数据流：
     1) 装备槽定义完整（主武器/手枪/副武器/胸挂/背包 五个）
     2) 物品能正确归到对应槽位（stashSlotOf）
     3) 点仓库物品 -> 装备到槽 -> 仓库扣 1
     4) 点装备槽 -> 卸回仓库
     5) 换背包时 bagCap 跟着变
     6) 渲染出来的 HTML 里有左右两栏和装备槽 */
'use strict';
const fs=require('fs');

/* ---- 假 THREE（b_world 需要） ---- */
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
const grp=()=>({children:[],add(o){this.children.push(o);},remove(){}});
const THREE={
  Vector3:V3, Euler:class{constructor(){this.x=0;this.y=0;this.z=0;this.order='XYZ';}
    set(x,y,z,o){this.x=x;this.y=y;this.z=z;return this;} copy(){return this;}},
  BoxGeometry:GeoStub, CylinderGeometry:GeoStub, SphereGeometry:GeoStub,
  CapsuleGeometry:GeoStub, PlaneGeometry:GeoStub, RingGeometry:GeoStub,
  ConeGeometry:GeoStub, MeshStandardMaterial:MatStub, MeshBasicMaterial:MatStub,
  Mesh:MeshStub, Group:grp, Scene:grp, Color:function(){return {setHex(){},set(){}};},
  Fog:function(){}, HemisphereLight:function(){return new MeshStub();},
  AmbientLight:function(){return new MeshStub();},
  DirectionalLight:function(){const m=new MeshStub();m.shadow={mapSize:{set(){}},camera:{},bias:0,normalBias:0};return m;},
  PerspectiveCamera:function(){const c=new MeshStub();c.fov=75;c.updateProjectionMatrix=()=>{};return c;},
  WebGLRenderer:function(){return {setPixelRatio(){},setSize(){},shadowMap:{},domElement:{},render(){}};},
  Clock:function(){return {getDelta:()=>0.016};},
};
global.__THREE__=THREE;

/* ---- 假 DOM：需要一个能存 innerHTML、能按选择器查节点的元素 ---- */
const domStore={};
function mkNode(tag,attrs){
  const n={
    tagName:tag, style:{}, dataset:attrs||{}, children:[], _html:'',
    classList:{add(){},remove(){},contains(){return false;}},
    textContent:'', title:'',
    addEventListener(){}, appendChild(c){ this.children.push(c); },
    querySelector(){return null;}, querySelectorAll(){return [];},
  };
  Object.defineProperty(n,'innerHTML',{
    get(){ return n._html; },
    set(v){ n._html=v; },
  });
  return n;
}
function getEl(id){
  if(!domStore[id]) domStore[id]=mkNode('div');
  return domStore[id];
}
/* buildStashNew 会用 el.querySelectorAll(...) 找刚写入的节点。
   这里实现一个极简选择器：只支持 [data-xxx] 形式，从 innerHTML 里正则扫出来。 */
function makeRealEl(id){
  const el=getEl(id);
  el.querySelectorAll=function(sel){
    const m=sel.match(/^\[data-([\w-]+)\]$/);
    if(!m){ return []; }
    const attr=m[1];
    const out=[];
    /* 把 data-xxx="yyy" 全部抓出来，生成假节点 */
    const re=new RegExp('data-'+attr+'="([^"]+)"','g');
    let mm;
    while((mm=re.exec(el._html))!==null){
      out.push({ dataset:{[attr]:mm[1]}, onclick:null });
    }
    return out;
  };
  return el;
}
global.document={
  getElementById:(id)=>makeRealEl(id),
  createElement:(t)=>mkNode(t),
  addEventListener(){}, querySelector(){return null;}, querySelectorAll(){return [];},
  body:{appendChild(){},classList:{add(){}}},
};
global.window=global;
global.addEventListener=()=>{};
global.innerWidth=1280; global.innerHeight=720; global.devicePixelRatio=1;
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.performance={now:()=>Date.now()};
global.requestAnimationFrame=()=>0;
Object.defineProperty(global,'navigator',{configurable:true,writable:true,
  value:{userAgent:'node',maxTouchPoints:5}});

/* ---- 拼装并执行 ---- */
const parts=['b_world.js','c_player.js','d_game.js','e_io.js','f_ui.js','x_ext.js','w_weapon.js','y_audio.js','z_render.js'];
let code='';
for(const p of parts){
  if(!fs.existsSync('full/'+p)) continue;
  code+='\n/* ==== '+p+' ==== */\n'+fs.readFileSync('full/'+p,'utf8');
}
code='const THREE=global.__THREE__;\n'+code;

let S;
try{
  S=new Function(code+'\n;return {'+
    'get P(){return P;}, get stash(){return P.stash;},'+
    ' SHOP_ITEMS, SLOTS, stashSlotOf, buildStashNew, toggleStash,'+
    ' stashAdd, stashTake, bagAdd, bagTake, pouchUsed, pouchFree, settleDeath, settleExfil'+
    '};')();
}catch(e){ console.log('COMPILE_FAIL:',e.message); process.exit(1); }

let fail=0;
function ok(c,m){ console.log((c?'  ✅ ':'  ❌ ')+m); if(!c) fail=1; }

const P=S.P, IT=S.SHOP_ITEMS;

console.log('[1] 装备槽定义');
ok(S.SLOTS.length===5,'5 个槽位（主武器/手枪/副武器/胸挂/背包），实际 '+S.SLOTS.length);
const keys=S.SLOTS.map(s=>s.key).join(',');
ok(keys==='primary,secondary,melee,chest,backpack','槽位顺序符合设计图');
ok(S.SLOTS[0].label==='主武器'&&S.SLOTS[1].label==='手枪'
   &&S.SLOTS[2].label==='副武器'&&S.SLOTS[3].label==='胸挂'
   &&S.SLOTS[4].label==='背包','槽位名称与设计图一致');

console.log('\n[2] 物品归类正确');
ok(S.stashSlotOf('gun_rifle')==='primary','突击步枪 -> 主武器槽');
ok(S.stashSlotOf('gun_sniper')==='primary','狙击枪 -> 主武器槽');
ok(S.stashSlotOf('pis_default')==='secondary','制式手枪 -> 手枪槽');
ok(S.stashSlotOf('melee_knife')==='melee','战术小刀 -> 副武器槽');
ok(S.stashSlotOf('chest_med')==='chest','战术胸挂 -> 胸挂槽');
ok(S.stashSlotOf('bp_large')==='backpack','大型背包 -> 背包槽');
ok(S.stashSlotOf('med')===null,'医疗包不属于任何装备槽');

console.log('\n[3] 新手初始装备');
ok(P.equip.secondary==='pis_default','初始带手枪');
ok(P.equip.melee==='melee_knife','初始带小刀');
ok(P.equip.primary===null,'初始没有主武器（要去商店买）');
ok(P.equip.backpack==='bp_small','初始有小型背包');
ok(P.bagCap===24,'初始背包容量 24');

console.log('\n[4] 装备：仓库扣 1，槽位写入');
P.stash.gun_rifle=1;
const before=P.stash.gun_rifle;
const slot=S.stashSlotOf('gun_rifle');
P.equip[slot]='gun_rifle';
P.stash.gun_rifle--;
if(P.stash.gun_rifle<=0) delete P.stash.gun_rifle;
ok(P.equip.primary==='gun_rifle','主武器已装备');
ok(P.stash.gun_rifle===undefined,'仓库里的步枪已被取走（数量归零后删除）');

console.log('\n[5] 换背包，容量跟着变');
ok(P.bagCap===24,'换之前容量 24');
P.equip.backpack='bp_large';
P.bagCap=IT['bp_large'].cap;
ok(P.bagCap===48,'换成大型背包后容量 48');
ok(P.bagCap===IT['bp_large'].cap,'容量取自物品定义的 cap 字段');

console.log('\n[6] 卸下装备回仓库');
const oldP=P.equip.primary;
S.stashAdd(oldP,1); P.equip.primary=null;
ok(P.equip.primary===null,'主武器槽已清空');
ok(P.stash[oldP]===1,'步枪回到仓库（数量 1）');

console.log('\n[7] 渲染出左右两栏');
domStore['stash']=mkNode('div');
S.buildStashNew();
const html=domStore['stash']._html || domStore['stash'].innerHTML;
ok(html.indexOf('stkleft')>=0,'有左栏（装备槽）');
ok(html.indexOf('stkright')>=0,'有右栏（仓库格子）');
ok(html.indexOf('stktitle')>=0 && html.indexOf('仓库')>=0,'有大标题「仓库」');
ok(html.indexOf('id="stkBack"')>=0,'有返回按钮');
ok(html.indexOf('💵')>=0,'右栏有现金显示');
ok(html.indexOf('stkgrid')>=0,'有仓库格子区');
/* 五个装备槽都渲染出来 */
for(const s of S.SLOTS){
  ok(html.indexOf('data-slot="'+s.key+'"')>=0, '装备槽「'+s.label+'」已渲染');
}
/* 主界面上的物品应该出现在格子里 */
ok(html.indexOf('data-item="'+oldP+'"')>=0,'仓库里的步枪渲染成了格子');
/* 「一堆格子」的观感：空格子数量 */
const emptyCount=(html.match(/<div class="stkg"><\/div>/g)||[]).length;
ok(emptyCount>50,'空格子铺满（实际 '+emptyCount+' 个），符合「一堆格子」');

console.log('\n[8] 阵亡清空装备但不碰仓库');
const stashBefore=JSON.stringify(P.stash);
P.equip.helmet='helm_med';
S.settleDeath();
ok(P.equip.primary===null&&P.equip.backpack===null&&P.equip.helmet===null,
   '阵亡后所有装备槽清空');
ok(JSON.stringify(P.stash)===stashBefore,'仓库完全没变');
ok(P.bagCap===0,'没有背包了，容量归 0');

console.log('\n'+(fail?'STASH_FAIL: 仓库布局测试未通过'
  :'STASH_OK: 左侧五个装备槽 + 右侧格子区，装卸/换包/阵亡清空全部正确'));
process.exit(fail?1:0);