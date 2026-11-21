/* 地图体检：找出所有会让人难受的问题
   1) 穿模 —— 两个实体在空间上重叠（尤其是建筑之间的墙插进对方）
   2) 错位 —— 装饰面（跑道线/球场线）跑到建筑底下或悬空
   3) 卡死 —— 玩家出生点或门洞里被碰撞体堵着
   4) 越界 —— 场地装饰超出围墙范围

   关键：地面装饰（groundDeco）是不碰撞的平面，但它如果压在建筑
   底下，就表现为「操场线穿进教学楼」的错位。 */
'use strict';
const fs=require('fs');

/* ---- 假 THREE ---- */
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
const grp=()=>({children:[],add(o){this.children.push(o);},remove(o){
  const i=this.children.indexOf(o); if(i>=0) this.children.splice(i,1); }});
/* 注意：Scene 会被 new 调用，必须是构造函数而不是箭头函数 */
function SceneCtor(){ return grp(); }
const THREE={
  Vector3:V3, Euler:class{constructor(){this.x=0;this.y=0;this.z=0;this.order='XYZ';}
    set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} copy(){return this;}},
  BoxGeometry:GeoStub, CylinderGeometry:GeoStub, SphereGeometry:GeoStub,
  CapsuleGeometry:GeoStub, PlaneGeometry:GeoStub, RingGeometry:GeoStub,
  ConeGeometry:GeoStub, MeshStandardMaterial:MatStub, MeshBasicMaterial:MatStub,
  Mesh:MeshStub, Group:SceneCtor, Scene:SceneCtor, Color:function(){return {setHex(){},set(){}};},
  Fog:function(){}, HemisphereLight:function(){return new MeshStub();},
  AmbientLight:function(){return new MeshStub();},
  DirectionalLight:function(){const m=new MeshStub();m.shadow={mapSize:{set(){}},camera:{},bias:0,normalBias:0};return m;},
  PerspectiveCamera:function(){const c=new MeshStub();c.fov=75;c.updateProjectionMatrix=()=>{};return c;},
  WebGLRenderer:function(){return {setPixelRatio(){},setSize(){},shadowMap:{},domElement:{},render(){}};},
  Clock:function(){return {getDelta:()=>0.016};},
};
global.__THREE__=THREE;

/* ---- 假 DOM ---- */
const domStore={};
function mkNode(){ const n={style:{},dataset:{},classList:{add(){},remove(){},contains(){return false;}},
  textContent:'',innerHTML:'',addEventListener(){},appendChild(){},
  querySelector(){return null;},querySelectorAll(){return [];}}; return n; }
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
  S=new Function(code+'\n;return {get scene(){return scene;}, get colliders(){return colliders;},'
    +' get DOORS(){return DOORS;}, get P(){return P;}, init, buildSchool,'
    +' carveMainDoor,carveEastDoor,carveWestDoor,carveAdminDoor,buildSportsZone,'
    +' get enemies(){return enemies;}, get loots(){return loots;}, NPC_POINTS};')();
}catch(e){ console.log('COMPILE_FAIL:',e.message); process.exit(1); }

/* 跑 init，允许在 initWeapon 阶段失败（那是渲染相关，与地图无关） */
try{ S.init(); }
catch(e){
  const st=String(e&&e.stack||'');
  if(!/initWeapon|applyPixelBudget/.test(st)){
    console.log('INIT_FAIL:',e.message); console.log(st.split('\n').slice(0,4).join('\n'));
    process.exit(1);
  }
}

const scene=S.scene, colliders=S.colliders;
const all=scene.children || [];

function bboxOf(m){
  if(!m.geometry) return null;
  if(!m.geometry.boundingBox) { try{ m.geometry.computeBoundingBox(); }catch(e){ return null; } }
  const bb=m.geometry.boundingBox; if(!bb) return null;
  const hw=(bb.max.x-bb.min.x)/2, hh=(bb.max.y-bb.min.y)/2, hd=(bb.max.z-bb.min.z)/2;
  return { x0:m.position.x-hw, x1:m.position.x+hw,
           y0:m.position.y-hh, y1:m.position.y+hh,
           z0:m.position.z-hd, z1:m.position.z+hd,
           w:bb.max.x-bb.min.x, h:bb.max.y-bb.min.y, d:bb.max.z-bb.min.z };
}
function overlap(a,b){
  const ox=Math.min(a.x1,b.x1)-Math.max(a.x0,b.x0);
  const oy=Math.min(a.y1,b.y1)-Math.max(a.y0,b.y0);
  const oz=Math.min(a.z1,b.z1)-Math.max(a.z0,b.z0);
  return (ox>0.01 && oy>0.01 && oz>0.01) ? {ox,oy,oz} : null;
}

let issues=[];

/* ===== 1. 碰撞体之间的深度穿插 ===== */
const solidBoxes=[];
for(const m of colliders){
  const b=bboxOf(m); if(!b) continue;
  solidBoxes.push({m,b});
}
for(let i=0;i<solidBoxes.length;i++){
  for(let j=i+1;j<solidBoxes.length;j++){
    const A=solidBoxes[i], B=solidBoxes[j];
    const o=overlap(A.b,B.b);
    if(!o) continue;
    /* 只报「深度穿插」：三个轴都重叠超过 0.5 米才算视觉穿模。
       门窗贴墙那种薄薄一层是正常搭接，不算问题。 */
    const minAxis=Math.min(o.ox,o.oy,o.oz);
    if(minAxis>0.5){
      issues.push({type:'穿模', a:A, b:B, o});
    }
  }
}

/* ===== 2. 装饰面压进建筑底下 ===== */
for(const m of all){
  if(!m.geometry) continue;
  /* groundDeco 造的平面：rotation.x = -PI/2，y 接近 0 */
  const isDeco = Math.abs(m.position.y) < 1 && Math.abs(Math.abs(m.rotation.x)-Math.PI/2) < 0.01;
  if(!isDeco) continue;
  const b=bboxOf(m); if(!b) continue;
  for(const s of solidBoxes){
    const sb=s.b;
    /* 装饰面完全躺在地面，如果和某个碰撞体的 XZ 投影重叠，
       且该碰撞体底部在 y<0.3（贴地建筑），就是压在建筑下面 = 错位 */
    if(sb.y0 > 0.4) continue;
    const ox=Math.min(b.x1,sb.x1)-Math.max(b.x0,sb.x0);
    const oz=Math.min(b.z1,sb.z1)-Math.max(b.z0,sb.z0);
    if(ox>0.5 && oz>0.5){
      const cov=ox*oz / Math.max(0.01,(b.x1-b.x0)*(b.z1-b.z0));
      if(cov>0.25){
        issues.push({type:'错位', deco:b, solid:sb, cov});
      }
    }
  }
}

/* ===== 3. 玩家出生点是否被堵 ===== */
function blockedAt(x,y,z){
  for(const m of colliders){
    const b=bboxOf(m); if(!b) continue;
    if(b.y1 < 0.35) continue;               // 地板/矮台阶不算
    if(x>b.x0-0.4 && x<b.x1+0.4 && z>b.z0-0.4 && z<b.z1+0.4
       && y-1.6 < b.y1 && y > b.y0) return m;
  }
  return null;
}
const sp=S.P.pos;
const spawnHit=blockedAt(sp.x, sp.y, sp.z);
if(spawnHit) issues.push({type:'出生点被堵', pos:{x:sp.x,y:sp.y,z:sp.z},
  by:bboxOf(spawnHit)});

/* ===== 4. 门洞里是否残留碰撞体 ===== */
for(const d of S.DOORS){
  /* 先全开，再看门洞中间有没有别的东西 */
  S.DOORS.forEach(x=>{ const i=colliders.indexOf(x.panel); if(i>=0) colliders.splice(i,1); x.open=true; });
  const h=blockedAt(d.x, 1.6, d.z);
  if(h) issues.push({type:'门洞被堵', door:{x:d.x,z:d.z}, by:bboxOf(h)});
}
/* 复原 */
S.DOORS.forEach(d=>{ d.open=false; if(colliders.indexOf(d.panel)<0) colliders.push(d.panel); });

/* ===== 5. 敌人/物资是否卡在实体里 ===== */
for(const e of S.enemies){
  const h=blockedAt(e.x,1.6,e.z);
  if(h) issues.push({type:'敌人卡墙', pos:{x:e.x,z:e.z}, by:bboxOf(h)});
}
for(const l of S.loots){
  const h=blockedAt(l.x,1.6,l.z);
  if(h) issues.push({type:'物资卡墙', pos:{x:l.x,z:l.z}, by:bboxOf(h)});
}

/* ---- 输出 ---- */
console.log('=== 地图体检报告 ===');
console.log('场景实体:', all.length, '｜碰撞体:', colliders.length, '｜门:', S.DOORS.length);
console.log('');

if(!issues.length){
  console.log('MAP_OK: 未发现穿模/错位/堵死问题');
  process.exit(0);
}

const byType={};
for(const it of issues) (byType[it.type]=byType[it.type]||[]).push(it);

for(const t in byType){
  const arr=byType[t];
  console.log('【'+t+'】'+arr.length+' 处');
  /* 同样的物体只打一次，避免刷屏 */
  const seen=new Set();
  let shown=0;
  for(const it of arr){
    let key='', desc='';
    if(it.type==='穿模'){
      const A=it.a.b, B=it.b.b;
      key=A.x0.toFixed(1)+','+A.z0.toFixed(1)+'|'+B.x0.toFixed(1)+','+B.z0.toFixed(1);
      desc='A('+A.w.toFixed(0)+'x'+A.h.toFixed(0)+'x'+A.d.toFixed(0)+' @ '
        +((A.x0+A.x1)/2).toFixed(1)+','+((A.z0+A.z1)/2).toFixed(1)+') 与 '
        +'B('+B.w.toFixed(0)+'x'+B.h.toFixed(0)+'x'+B.d.toFixed(0)+' @ '
        +((B.x0+B.x1)/2).toFixed(1)+','+((B.z0+B.z1)/2).toFixed(1)+') 重叠 '
        +it.o.ox.toFixed(1)+'×'+it.o.oy.toFixed(1)+'×'+it.o.oz.toFixed(1);
    }else if(it.type==='错位'){
      const D=it.deco, Sd=it.solid;
      key=D.x0.toFixed(1)+','+D.z0.toFixed(1);
      desc='装饰面('+((D.x0+D.x1)/2).toFixed(1)+','+((D.z0+D.z1)/2).toFixed(1)
        +' 尺寸 '+(D.x1-D.x0).toFixed(0)+'x'+(D.z1-D.z0).toFixed(0)+') 压在建筑'
        +'('+((Sd.x0+Sd.x1)/2).toFixed(1)+','+((Sd.z0+Sd.z1)/2).toFixed(1)+') 下面 '
        +(it.cov*100).toFixed(0)+'%';
    }else{
      key=it.type+JSON.stringify(it.pos||it.door||{});
      desc=it.type+' @ '+JSON.stringify(it.pos||it.door)
        +' 被 '+JSON.stringify(it.by&&{x:(it.by.x0+it.by.x1)/2,z:(it.by.z0+it.by.z1)/2,
           w:it.by.w,h:it.by.h,d:it.by.d});
    }
    if(seen.has(key)) continue;
    seen.add(key);
    if(shown<12) console.log('  · '+desc);
    shown++;
  }
  if(arr.length>12) console.log('  ...（共 '+arr.length+' 处，只显示前 12 条）');
  console.log('');
}

console.log('MAP_ISSUES: 共发现 '+issues.length+' 处问题');
process.exit(1);