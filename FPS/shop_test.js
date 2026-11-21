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
  fn=new Function('THREE', code+'\n;return {P,SHOP_ITEMS,buildShop,buyItem,bagAdd,bagTake,bagUsed,bagFree,pouchUsed,pouchFree,stashAdd,stashTake,stashPut,toggleBag,buildBag,buildStash,toggleStash,useItem,damageP,refreshHUD,settleExfil,settleDeath,};');
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

const {P,SHOP_ITEMS,buyItem,buildShop,buildBag,buildStash,
       pouchUsed,pouchFree,stashTake,stashPut,useItem,damageP,
       settleExfil,settleDeath}=api;

function ok(cond,msg){ console.log((cond?'  ✅ ':'  ❌ ')+msg); if(!cond) global.__fail=1; }

/* ========== 1. 仓库与背包必须是两个独立容器 ========== */
console.log('\n[1] 仓库 / 背包 分离');
P.stash={}; P.pouch={}; P.ammo.cash=100000;
ok(P.stash!==P.pouch, 'stash 和 pouch 是两个不同对象');
ok(typeof P.stash==='object' && typeof P.pouch==='object', '两者都存在');

/* ========== 2. 商店买东西进仓库，不占局内背包 ========== */
console.log('\n[2] 商店购买 → 进仓库');
buyItem('med');
ok(P.stash.med===1, '仓库里有 1 个医疗包（stash.med='+P.stash.med+'）');
ok(!(P.pouch.med>0), '局内背包里没有（买的东西不直接进包）');
ok(pouchUsed()===0, '局内背包占用 0 格');

/* ========== 3. 仓库装包：受背包容量限制 ========== */
console.log('\n[3] 仓库 → 出击背包');
P.bagCap=2;
P.stash={med:5, bandage:5, grenade:5};
P.pouch={};
stashTake('med');
stashTake('bandage');
ok(pouchUsed()===2, '装了 2 格：'+pouchUsed());
const r=stashTake('grenade');
ok(r===false, '第 3 件被拒绝（容量 2 格已满）');
ok(!(P.pouch.grenade>0), '确实没装进去');
ok(P.stash.grenade===5, '仓库里的手雷没被扣掉');

/* ========== 4. 背包放回仓库 ========== */
console.log('\n[4] 出击背包 → 仓库');
stashPut('med');
ok(!(P.pouch.med>0), '背包里的医疗包已取出');
ok(P.stash.med===5, '回到仓库（stash.med='+P.stash.med+'）');
ok(pouchUsed()===1, '现在只占 1 格');

/* ========== 5. 局内使用只动 pouch，不动 stash ========== */
console.log('\n[5] 局内使用物品');
P.pouch={med:2}; P.stash={med:10}; P.hp=50;
const stashBefore=P.stash.med;
useItem('med');
ok(P.pouch.med===1, '背包里医疗包 2 → 1');
ok(P.stash.med===stashBefore, '仓库里的 10 个完全没动');
ok(P.hp>50, '回血生效：50 → '+P.hp.toFixed(1));

/* ========== 6. 阵亡：背包和装备全丢，仓库安全 ========== */
console.log('\n[6] 阵亡结算');
P.pouch={med:3, bandage:2, grenade:1};
P.stash={med:10, bandage:5};
P.equip={helmet:'helm_med', armorVest:'vest_light', backpack:'bp_large'};
P.helmetDur=120; P.vestDur=80; P.bagCap=48;
const lost=settleDeath();
ok(lost===3, '丢失 3 种背包物品');
ok(Object.keys(P.pouch).length===0, '局内背包清空');
ok(P.equip.helmet===null && P.equip.armorVest===null && P.equip.backpack===null, '装备全部掉光');
ok(P.bagCap===0, '背包容量归 0（没背包了）');
ok(P.stash.med===10 && P.stash.bandage===5, '✅ 仓库完好无损（med=10, bandage=5）');

/* ========== 7. 撤离：背包物资全部带回仓库 ========== */
console.log('\n[7] 撤离结算');
P.stash={med:10}; P.pouch={bandage:4, grenade:2};
settleExfil();
ok(Object.keys(P.pouch).length===0, '局内背包清空');
ok(P.stash.bandage===4, '绷带带回仓库（×4）');
ok(P.stash.grenade===2, '手雷带回仓库（×2）');
ok(P.stash.med===10, '原有仓库物品保留（med=10）');

/* ========== 8. 护甲减伤仍然有效 ========== */
console.log('\n[8] 护甲减伤');
P.equip={helmet:'helm_heavy', armorVest:'vest_heavy', backpack:'bp_small'};
P.helmetDur=220; P.vestDur=260; P.hp=100;
damageP(50);
console.log('     受伤 50 后 hp='+P.hp.toFixed(1)+' vestDur='+P.vestDur.toFixed(1));
ok(P.hp>60, '重甲减伤明显（实际掉血 '+(100-P.hp).toFixed(1)+'）');
ok(P.vestDur<260, '护甲耐久被消耗');

/* ========== 9. 渲染不崩 ========== */
console.log('\n[9] 三个面板渲染');
try{ buildShop(); ok(true,'buildShop 正常'); }catch(e){ ok(false,'buildShop 抛错: '+e.message); }
try{ buildBag();  ok(true,'buildBag 正常');  }catch(e){ ok(false,'buildBag 抛错: '+e.message); }
try{ buildStash();ok(true,'buildStash 正常');}catch(e){ ok(false,'buildStash 抛错: '+e.message); }

if(global.__fail){ console.log('\n❌ 有测试失败'); process.exit(1); }
console.log('\nSHOP_BAG_OK: 仓库/背包分离、购买、容量、阵亡掉装、撤离带回 全部通过');