// 用假 DOM/THREE 在 Node 里真跑一遍商店购买 + 背包 + 护甲减伤
const fs=require('fs');
const html=fs.readFileSync('/tmp/efsrepo/FPS/index.html','utf8');
const m=html.match(/<script type="module">([\s\S]*?)<\/script>/);
if(!m){ console.error('找不到 module'); process.exit(1); }
let code=m[1];

class V3{
  constructor(x,y,z){ this.x=x||0; this.y=y||0; this.z=z||0; }
  set(x,y,z){ this.x=x;this.y=y;this.z=z;return this; }
  copy(v){ this.x=v.x;this.y=v.y;this.z=v.z;return this; }
  clone(){ return new V3(this.x,this.y,this.z); }
  add(v){ this.x+=v.x;this.y+=v.y;this.z+=v.z;return this; }
  sub(v){ this.x-=v.x;this.y-=v.y;this.z-=v.z;return this; }
  multiplyScalar(s){ this.x*=s;this.y*=s;this.z*=s;return this; }
  length(){ return Math.hypot(this.x,this.y,this.z); }
  normalize(){ const l=this.length()||1; this.x/=l;this.y/=l;this.z/=l;return this; }
  distanceTo(v){ return Math.hypot(this.x-v.x,this.y-v.y,this.z-v.z); }
  crossVectors(){ return this; }
  applyEuler(){ return this; }
  setFromMatrixPosition(){ return this; }
}
const meshStub=new Proxy(function(){},
  {get:(t,k)=>{ if(k==='then') return undefined; return ()=>meshStub; }, construct:()=>meshStub, apply:()=>meshStub});
const threeStub=new Proxy({},{
  get:(t,k)=>{
    if(k==='Vector3') return V3;
    return new Proxy(function(){},{get:()=>()=>threeStub,construct:()=>meshStub,apply:()=>meshStub});
  }
});

// 假 DOM
const els={};
function mkEl(id){
  const e={
    id, style:{}, classList:{add(){},remove(){},toggle(){},contains(){return false;}},
    innerHTML:'', textContent:'', children:[], _handlers:{},
    addEventListener(t,f){ this._handlers[t]=f; },
    removeEventListener(){},
    querySelectorAll(sel){ return collectFrom(this, sel); },
    querySelector(sel){ const r=collectFrom(this,sel); return r[0]||null; },
    appendChild(c){ this.children.push(c); return c; },
    getAttribute(k){ return this['_'+k]; },
    setAttribute(k,v){ this['_'+k]=v; },
    getContext(){ return ctxStub; },
    requestPointerLock(){}, focus(){},
    getBoundingClientRect(){ return {left:0,top:0,width:800,height:400,right:800,bottom:400}; },
    contains(){ return false; }
  };
  return e;
}
const ctxStub=new Proxy({},{get:()=>()=>{}});

/* 把 innerHTML 里 data-xxx="yy" 的属性抽出来，模拟 querySelectorAll 能找到它们。
   足够验证「点了购买之后状态有没有变」。 */
function collectFrom(root, sel){
  const out=[];
  const htmlv=root.innerHTML||'';
  // 只处理 [data-xxx] 和 .tab / .cell / #id 这类简单选择器
  let attr=null;
  const mm=sel.match(/^\[data-([a-z]+)\]$/);
  if(mm) attr=mm[1];
  if(attr){
    const re=new RegExp('data-'+attr+'="([^"]+)"','g');
    let r;
    while((r=re.exec(htmlv))){
      const el=mkEl('dyn_'+attr+'_'+r[1]);
      el._attrVal=r[1];
      el.getAttribute=(k)=>{ if(k==='data-'+attr) return r[1]; return el['_'+k]; };
      el.onclick=null;
      out.push(el);
    }
    return out;
  }
  if(sel==='.tab'){
    const re=/data-cat="([^"]+)"/g; let r;
    while((r=re.exec(htmlv))){
      const el=mkEl('tab_'+r[1]); el.getAttribute=(k)=> k==='data-cat'?r[1]:el['_'+k];
      el.onclick=null; out.push(el);
    }
    return out;
  }
  return out;
}

const bodyEl=mkEl('body');
global.window=global;
global.document={
  readyState:'complete',
  getElementById:(id)=>{ if(!els[id]) els[id]=mkEl(id); return els[id]; },
  createElement:(t)=>mkEl(t),
  querySelector:(s)=>els[s]||null,
  querySelectorAll:()=>[],
  addEventListener:(t,f)=>{ (global.__docH||(global.__docH={}))[t]=f; },
  body:bodyEl,
  documentElement:bodyEl,
  exitPointerLock(){}, pointerLockElement:null
};
Object.defineProperty(global,'navigator',{value:{maxTouchPoints:1,userAgent:'node'},configurable:true,writable:true});
global.location={reload(){},href:''};
global.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
global.requestAnimationFrame=()=>0;
global.cancelAnimationFrame=()=>{};
global.setTimeout=(f,t)=>{ return 0; };
global.clearTimeout=()=>{};
global.devicePixelRatio=1;
global.innerWidth=800; global.innerHeight=400;
global.addEventListener=(t,f)=>{ (global.__winH||(global.__winH={}))[t]=f; };
global.removeEventListener=()=>{};
global.AudioContext=function(){ return new Proxy({},{get:()=>()=>({connect(){},gain:{value:0},frequency:{value:0}})}); };
global.WebGLRenderingContext=function(){};
global.performance={now:()=>0};
global.alert=()=>{}; global.confirm=()=>false;

// 移除 import 语句
code = code.replace(/^\s*import[^\n]*\n/gm,'');

const sandboxParamNames=['THREE','__exportBag'];
let fn;
try{
  fn=new Function('THREE', code+'\n;return {P,SHOP_ITEMS,buildShop,buyItem,bagAdd,bagTake,bagUsed,bagFree,toggleBag,buildBag,useItem,damageP,refreshHUD,setTabs:function(){},};');
}catch(e){
  console.error('COMPILE_FAIL:',e.message); process.exit(1);
}
let api;
try{
  api=fn(threeStub);
}catch(e){
  console.error('RUN_FAIL:',e.message, e.stack&&e.stack.split('\n')[1]);
  process.exit(1);
}
console.log('模块加载 OK');

const {P,SHOP_ITEMS,buyItem,buildShop,bagUsed,bagFree,buildBag,useItem,damageP}=api;

function ok(cond,msg){ console.log((cond?'  ✅ ':'  ❌ ')+msg); if(!cond) global.__fail=1; }

// 1. 初始状态
console.log('\n[1] 初始状态');
ok(P.bagCap===24,'背包容量 24');
ok(bagUsed()===0,'背包为空');
ok(Object.keys(SHOP_ITEMS).length>=20,'商品数 '+Object.keys(SHOP_ITEMS).length+' >= 20');
const cats=new Set(Object.values(SHOP_ITEMS).map(i=>i.cat));
ok(['med','tool','ammo','bag','helmet','armor'].every(c=>cats.has(c)),'六大分类齐全: '+[...cats].join(','));

// 2. 购买医疗包
console.log('\n[2] 购买医疗包');
P.ammo.cash=100000;
buyItem('med');
ok(P.bag.med===1,'医疗包进背包 ×'+P.bag.med);
ok(bagUsed()===1,'占用 1 格');

// 3. 买头盔 -> 直接装备
console.log('\n[3] 购买头盔（应直接装备，不占背包格）');
const before=bagUsed();
buyItem('helm_med');
ok(P.equip.helmet==='helm_med','头盔已装备: '+P.equip.helmet);
ok(P.helmetDur===120,'头盔耐久 120');
ok(bagUsed()===before,'不进背包，格子数不变');

// 4. 买护甲
console.log('\n[4] 购买护甲');
buyItem('vest_light');
ok(P.equip.armorVest==='vest_light','护甲已装备: '+P.equip.armorVest);
ok(P.vestDur===80,'护甲耐久 80');

// 5. 换背包 -> 容量变化
console.log('\n[5] 换背包提升容量');
buyItem('bp_large');
ok(P.bagCap===48,'容量 24 → '+P.bagCap);

// 6. 买子弹
console.log('\n[6] 购买子弹');
const r0=P.ammo.rifle||0;
buyItem('ammo_rifle');
ok((P.ammo.rifle||0)===r0+60,'步枪弹 +60 → '+P.ammo.rifle);

// 7. 护甲减伤
console.log('\n[7] 护甲减伤验证');
P.hp=100;
damageP(50);
console.log('     受伤 50 之后 hp='+P.hp.toFixed(1)+' vestDur='+P.vestDur.toFixed(1));
ok(P.hp>50,'有减伤，实际掉血少于 50');
ok(P.hp<100,'确实掉血了');
ok(P.vestDur<80,'护甲耐久被消耗');

// 8. 使用医疗包回血
console.log('\n[8] 使用医疗包');
const hp0=P.hp;
useItem('med');
ok(P.hp>hp0,'回血 '+hp0.toFixed(1)+' → '+P.hp.toFixed(1));
ok(!(P.bag.med>0),'医疗包已消耗');

// 9. 背包满
console.log('\n[9] 背包容量上限');
P.bag={}; P.bagCap=4;
for(let i=0;i<8;i++) buyItem('bandage');
const used=bagUsed();
ok(used<=4,'背包未超容量: '+used+'/4');

// 10. 渲染不崩
console.log('\n[10] 商店/背包渲染');
try{ buildShop(); ok(true,'buildShop 渲染无异常'); }catch(e){ ok(false,'buildShop 抛错: '+e.message); }
try{ buildBag(); ok(true,'buildBag 渲染无异常'); }catch(e){ ok(false,'buildBag 抛错: '+e.message); }

if(global.__fail){ console.log('\n❌ 有测试失败'); process.exit(1); }
console.log('\nSHOP_BAG_OK: 商店/背包/护甲全部通过');
