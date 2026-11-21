/* ============ 搜打撤物品系统 ============
   撤离类游戏的核心循环：买装备 → 带进局 → 搜物资 → 撤离带回。
   这里把「商品定义」和「背包/装备」分开：
   - SHOP_ITEMS 只描述「卖什么、多少钱、有什么属性」
   - P.bag / P.equip 描述「玩家实际拥有什么」
   - BAG_CAP 描述「能带多少」（背包决定容量） */

const SHOP_ITEMS={
  /* ---- 医疗：局内回血，按回复量分档 ---- */
  med:      {cat:'med', name:'医疗包',   icon:'🩹', price:300,  desc:'恢复 40 生命', heal:40},
  med_kit:  {cat:'med', name:'急救包',   icon:'🧰', price:900,  desc:'恢复 100 生命（满血）', heal:100},
  bandage:  {cat:'med', name:'绷带',     icon:'🩶', price:120,  desc:'恢复 15 生命，便宜量大', heal:15},
  painkill:{cat:'med', name:'止痛药',   icon:'💊', price:250,  desc:'恢复 25 生命并短暂加速', heal:25, buff:'speed'},

  /* ---- 道具：一次性消耗 ---- */
  grenade:  {cat:'tool', name:'手雷',    icon:'💣', price:600,  desc:'投掷爆炸，范围伤害', dmg:120},
  smoke:    {cat:'tool', name:'烟雾弹',  icon:'🌫️', price:350,  desc:'制造烟幕遮挡视线'},
  flashbang:{cat:'tool', name:'闪光弹',  icon:'⚡', price:400,  desc:'致盲附近敌人'},
  lockpick: {cat:'tool', name:'开锁器',  icon:'🔧', price:200,  desc:'打开上锁的箱子'},

  /* ---- 子弹：按枪种分类，买的是「发」 ---- */
  ammo_pistol:{cat:'ammo', name:'手枪弹', icon:'🔸', price:80,  desc:'9mm · 50 发', ammo:'pistol', count:50},
  ammo_rifle: {cat:'ammo', name:'步枪弹', icon:'🔹', price:200, desc:'5.56 · 60 发', ammo:'rifle', count:60},
  ammo_sniper:{cat:'ammo', name:'狙击弹', icon:'🔻', price:400, desc:'7.62 · 20 发', ammo:'sniper', count:20},
  ammo_shot:  {cat:'ammo', name:'霰弹',   icon:'🔶', price:180, desc:'12G · 24 发', ammo:'shot', count:24},

  /* ---- 背包：决定容量，越贵能带的越多 ---- */
  bp_pouch: {cat:'bag', name:'战术腰包', icon:'👝', price:500,   desc:'容量 12 格',  cap:12},
  bp_small: {cat:'bag', name:'小型背包', icon:'🎒', price:1500,  desc:'容量 24 格',  cap:24},
  bp_med:   {cat:'bag', name:'中型背包', icon:'🎒', price:3500,  desc:'容量 36 格',  cap:36},
  bp_large: {cat:'bag', name:'大型背包', icon:'🧳', price:7000,  desc:'容量 48 格',  cap:48},

  /* ---- 头盔：减伤 + 耐久 ---- */
  helm_light:{cat:'helmet', name:'战术头盔', icon:'⛑️', price:800,  desc:'减伤 10% · 耐久 60',  reduce:.10, dur:60},
  helm_med:  {cat:'helmet', name:'防弹头盔', icon:'⛑️', price:2200, desc:'减伤 20% · 耐久 120', reduce:.20, dur:120},
  helm_heavy:{cat:'helmet', name:'重型头盔', icon:'🪖', price:5000, desc:'减伤 32% · 耐久 220', reduce:.32, dur:220},

  /* ---- 护甲：减伤 + 耐久 ---- */
  vest_light:{cat:'armor', name:'轻型护甲', icon:'🦺', price:1200, desc:'减伤 15% · 耐久 80',  reduce:.15, dur:80},
  vest_med:  {cat:'armor', name:'标准护甲', icon:'🦺', price:3000, desc:'减伤 25% · 耐久 150', reduce:.25, dur:150},
  vest_heavy:{cat:'armor', name:'重型护甲', icon:'🛡️', price:6500, desc:'减伤 40% · 耐久 260', reduce:.40, dur:260},
};

/* 分类标签（顺序即显示顺序） */
const SHOP_CATS=[
  {id:'med',    name:'医药'},
  {id:'tool',   name:'道具'},
  {id:'ammo',   name:'子弹'},
  {id:'bag',    name:'背包'},
  {id:'helmet', name:'头盔'},
  {id:'armor',  name:'护甲'},
];

let shopTab='med';   // 当前商店标签页
let bagTab='all';    // 当前背包筛选

/* 背包占用格数：数量 1 个占 1 格，子弹按堆叠算 1 格 */
function bagUsed(){
  let n=0;
  for(const k in P.bag){ if(P.bag[k]>0) n++; }
  return n;
}
function bagFree(){ return P.bagCap - bagUsed(); }

/* 给背包加物品，返回是否成功（容量不足则失败） */
function bagAdd(id, cnt){
  if(!cnt) cnt=1;
  if(!P.bag[id] || P.bag[id]<=0){
    if(bagFree()<=0) return false;   // 新物品占新格
    P.bag[id]=0;
  }
  P.bag[id]+=cnt;
  return true;
}
/* 从背包扣物品 */
function bagTake(id, cnt){
  if(!cnt) cnt=1;
  if(!P.bag[id] || P.bag[id]<cnt) return false;
  P.bag[id]-=cnt;
  if(P.bag[id]<=0) delete P.bag[id];
  return true;
}

/* ---- 商店 ---- */
function toggleShop(){
  const s=$('shop'); if(!s) return;
  const opening = s.style.display!=='flex';
  if(opening){ buildShop(); s.style.display='flex'; }
  else s.style.display='none';
}
function closeShop(){ const s=$('shop'); if(s) s.style.display='none'; }

function buildShop(){
  const s=$('shop'); if(!s) return;
  let h='<div class="box" style="max-width:600px">';
  h+='<div class="row" style="justify-content:space-between;align-items:center;margin:0 0 6px">'
    +'<h1 style="margin:0">🛒 商店</h1>'
    +'<div style="color:#ffd54a;font-weight:700">¥'+P.ammo.cash+'</div></div>';
  /* 分类标签 */
  h+='<div class="tabs">';
  for(const c of SHOP_CATS){
    h+='<button class="tab'+(shopTab===c.id?' on':'')+'" data-cat="'+c.id+'">'+c.name+'</button>';
  }
  h+='</div>';
  /* 商品列表 */
  h+='<div class="list">';
  let any=false;
  for(const id in SHOP_ITEMS){
    const it=SHOP_ITEMS[id];
    if(it.cat!==shopTab) continue;
    any=true;
    const owned = (P.bag[id]>0) ? P.bag[id] : 0;
    const eqTag = equipTagOf(id);
    h+='<div class="item'+(P.ammo.cash<it.price?' locked':'')+'">'
      +'<div class="ic">'+it.icon+'</div>'
      +'<div class="info"><div class="n">'+it.name+(eqTag?' <span class="owned">已装备</span>':'')+'</div>'
      +'<div class="d">'+it.desc+'</div></div>'
      +(owned?'<div class="owned">×'+owned+'</div>':'')
      +'<div class="price">¥'+it.price+'</div>'
      +'<button class="btn sm" data-buy="'+id+'">购买</button>'
      +'</div>';
  }
  if(!any) h+='<div class="d" style="text-align:center;padding:14px">暂无商品</div>';
  h+='</div>';
  /* 底部：容量 + 关闭 */
  h+='<div class="row" style="margin-top:10px;align-items:center;justify-content:space-between">'
    +'<div class="d">背包 '+bagUsed()+'/'+P.bagCap+' 格</div>'
    +'<button class="btn ghost" id="closeShop">关闭</button></div>';
  h+='</div>';
  s.innerHTML=h;

  /* 绑定事件 */
  s.querySelectorAll('.tab').forEach(b=>{
    b.onclick=()=>{ shopTab=b.getAttribute('data-cat'); sfxUI(); buildShop(); };
  });
  s.querySelectorAll('[data-buy]').forEach(b=>{
    b.onclick=()=>{ buyItem(b.getAttribute('data-buy')); };
  });
  const cs=$('closeShop'); if(cs) cs.onclick=()=>{ sfxUI(); closeShop(); };
}

function equipTagOf(id){
  const e=P.equip;
  return (e.helmet===id)||(e.armorVest===id)||(e.backpack===id);
}

/* 购买逻辑：扣钱 → 装备类直接穿上 → 其余进背包 */
function buyItem(id){
  const it=SHOP_ITEMS[id]; if(!it) return;
  if(P.ammo.cash < it.price){ sfxDeny(); toast('货币不足'); return; }

  const cat=it.cat;
  /* 装备类：不进背包，直接替换装备位 */
  if(cat==='helmet'){
    P.ammo.cash-=it.price;
    P.equip.helmet=id; P.helmetDur=it.dur;
    sfxBuy(); toast('已装备 '+it.name); refreshHUD(); buildShop(); return;
  }
  if(cat==='armor'){
    P.ammo.cash-=it.price;
    P.equip.armorVest=id; P.vestDur=it.dur;
    sfxBuy(); toast('已装备 '+it.name); refreshHUD(); buildShop(); return;
  }
  if(cat==='bag'){
    P.ammo.cash-=it.price;
    P.equip.backpack=id; P.bagCap=it.cap;
    sfxBuy(); toast('背包装备成功，容量 '+it.cap); refreshHUD(); buildShop(); return;
  }

  /* 其余物品进背包，先查容量 */
  if(bagFree()<=0 && !(P.bag[id]>0)){ sfxDeny(); toast('背包已满'); return; }

  if(cat==='ammo'){
    P.ammo.cash-=it.price;
    /* 子弹直接进弹匣储备（P.ammo[类型]），同时记一格背包 */
    bagAdd(id,1);
    const key=it.ammo;
    P.ammo[key]=(P.ammo[key]||0)+it.count;
    sfxBuy(); toast(it.name+' +'+it.count); refreshHUD(); buildShop(); return;
  }

  P.ammo.cash-=it.price;
  bagAdd(id,1);
  sfxBuy(); toast('购买 '+it.name); refreshHUD(); buildShop(); return;
}

/* ---- 背包（局内 Tab / B 打开） ---- */
function toggleBag(){
  const b=$('bag'); if(!b) return;
  const opening = b.style.display!=='flex';
  if(opening){ buildBag(); b.style.display='flex'; }
  else b.style.display='none';
}
function closeBag(){ const b=$('bag'); if(b) b.style.display='none'; }

function buildBag(){
  const b=$('bag'); if(!b) return;
  let h='<div class="box" style="max-width:600px">';
  h+='<div class="row" style="justify-content:space-between;align-items:center;margin:0 0 6px">'
    +'<h1 style="margin:0">🎒 背包</h1>'
    +'<div class="d">'+bagUsed()+'/'+P.bagCap+' 格</div></div>';

  /* 装备栏 */
  h+='<div class="tabs"><span class="tab on" style="cursor:default">装备中</span></div>';
  h+='<div class="grid">';
  h+=cellOf(P.equip.helmet, '头盔', '🪖');
  h+=cellOf(P.equip.armorVest, '护甲', '🦺');
  h+=cellOf(P.equip.backpack, '背包', '🎒');
  h+='</div>';

  /* 物品栏 */
  h+='<div class="tabs" style="margin-top:10px"><span class="tab on" style="cursor:default">物品</span></div>';
  h+='<div class="grid">';
  let cnt=0;
  for(const id in P.bag){
    if(!(P.bag[id]>0)) continue;
    const it=SHOP_ITEMS[id]; if(!it) continue;
    cnt++;
    h+='<div class="cell" data-use="'+id+'">'
      +'<div class="ci">'+it.icon+'</div>'
      +'<div class="cn">'+it.name+'</div>'
      +'<div class="cq">×'+P.bag[id]+'</div>'
      +'</div>';
  }
  if(!cnt) h+='<div class="d" style="grid-column:1/-1;text-align:center;padding:14px">背包是空的</div>';
  h+='</div>';

  h+='<div class="row" style="margin-top:10px;align-items:center;justify-content:space-between">'
    +'<div class="d">点击物品使用 / 消耗</div>'
    +'<button class="btn ghost" id="closeBag">关闭</button></div>';
  h+='</div>';
  b.innerHTML=h;

  b.querySelectorAll('[data-use]').forEach(el=>{
    el.onclick=()=>{ useItem(el.getAttribute('data-use')); };
  });
  const cb=$('closeBag'); if(cb) cb.onclick=()=>{ sfxUI(); closeBag(); };
}

function cellOf(id, label, fb){
  if(!id) return '<div class="cell"><div class="ci" style="opacity:.25">'+fb+'</div><div class="cn">'+label+'</div><div class="cq lk">空</div></div>';
  const it=SHOP_ITEMS[id];
  let extra='';
  if(it.dur){
    const cur = (it.cat==='helmet')?P.helmetDur:P.vestDur;
    if(cur>0) extra=' <span class="lk">'+Math.round(cur)+'</span>';
  }
  return '<div class="cell eq"><div class="ci">'+(it?it.icon:fb)+'</div><div class="cn">'+(it?it.name:label)+extra+'</div><div class="cq">'+(label)+'</div></div>';
}

/* 使用背包里的物品 */
function useItem(id){
  const it=SHOP_ITEMS[id]; if(!it) return;
  if(!(P.bag[id]>0)){ sfxDeny(); return; }
  if(it.heal){
    if(P.hp>=100){ sfxDeny(); toast('生命已满'); return; }
    bagTake(id,1);
    P.hp=Math.min(100,P.hp+it.heal);
    sfxPickup(); toast(it.name+' +'+it.heal+' HP');
    refreshHUD(); buildBag(); return;
  }
  if(id==='grenade'||id==='flashbang'||id==='smoke'){
    bagTake(id,1); sfxPickup(); toast('已投掷 '+it.name); buildBag(); return;
  }
  toast(it.name+' 暂时无法直接使用'); sfxDeny();
}
