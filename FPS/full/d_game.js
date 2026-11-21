/* ============ d_game.js：敌人 AI + 物资 + 撤离 + 射击 ============ */
let enemyTick=0;

/* ---- 射击 ----
   三种手持状态：
     primary   主武器：步枪 / 冲锋枪 / DMR / 狙击 / 霰弹枪
     secondary 手枪  ：耗 P.ammo.ammo
     melee     副武器：不耗弹、射速慢、只能近身（射线限 3 米）

   【射击模式】由 SHOP_ITEMS[id].fireMode 决定：
     auto 全自动 —— 按住左键持续开火（在 updFireHold 里循环调用）
     semi 半自动 —— 一次扳机一发，射速受 fireCd 限制
     bolt 栓动   —— 每发之间拉枪机，fireCd 很长（狙击）
     pump 泵动   —— 每发之间拉护木，见 wPump 动画
   本函数只管「打一发」，不负责判断能不能连发；
   连发由 updFireHold 每帧检测左键是否还压着来决定。

   【霰弹】pellets>1 的枪一次发多条射线，每条独立算伤害；
   单颗伤害很低（14），但近距离九颗全中就是 126，一枪带走；
   距离拉开后散得很开，大部分弹丸打空 —— 这就是「近距离伤害高」，
   不需要额外写衰减公式，散射本身就是衰减。

   【近战为什么以前打不出伤害】
   近战是 1 条 3 米长的射线，但敌人胶囊体的 COLLIDER 只在
   spawnEnemy 里 push 进了 shootables，而刀挥出去的时机通常是
   敌人已经贴脸（<1m）—— 射线起点在相机（y≈1.62），刀又往下挥，
   3 米内的射线常常从胶囊体旁边擦过去。表现就是「砍了没反应」。
   现在近战改成【半球形近身判定】：不看准星射线，直接遍历所有
   敌人算水平距离 + 高度差，只要在 2.6 米内、且大致在正面
   120° 扇区内就算命中。这才是刀该有的手感。 */
function fireOnce(dirOverride){
  const melee=curIsMelee();
  /* 近战不做射线检测，走独立的近身判定（见 meleeSwing） */
  if(melee){ meleeSwing(); return; }
  const t=curAmmoKey();
  const dir=dirOverride||lookDir();
  const origin=camera.position.clone();
  const pellets=melee?1:curPellets();
  const baseDmg=curDamage();
  const raycaster=new THREE.Raycaster(origin,dir,0.2, melee?3.0:120);
  let hitAny=false, headAny=false;
  for(let i=0;i<pellets;i++){
    /* 第 0 颗沿准星正中；其余在圆锥内随机偏移（散射） */
    if(i>0){
      const sp=melee?0:SHOT_SPREAD*(P.aimT>0.5?0.55:1);
      raycaster.ray.direction.set(
        dir.x+(Math.random()-0.5)*sp*2,
        dir.y+(Math.random()-0.5)*sp*2,
        dir.z+(Math.random()-0.5)*sp*2
      ).normalize();
    }else{
      raycaster.ray.direction.copy(dir);
    }
    const hits=raycaster.intersectObjects(shootables,true);
    if(!hits.length) continue;
    const hit=hits[0];
    const obj=hit.object;
    for(const e of enemies){
      if(e.body===obj||e.head===obj){
        /* 霰弹距离衰减：6 米内满伤，12 米后只剩三成。
           普通枪 pellets=1，衰减几乎看不出，不影响原手感。 */
        let d=baseDmg;
        if(pellets>1){
          const dist=hit.distance||0;
          if(dist>6) d*= Math.max(0.30, 1-(dist-6)*0.115);
        }
        e.hp-=d;
        e.aggro=true;
        hitAny=true;
        if(obj===e.head && !melee) headAny=true;
        if(e.hp<=0 && e.alive){
          e.alive=false; e.body.visible=false; e.head.visible=false; sfxKill();
        }
        break;
      }
    }
  }
  if(headAny) sfxHeadshot(); else if(hitAny) sfxHit();
}
/* ---- 近战近身判定 ----
   不用射线，改为「圆锥扇形 + 距离」判定：
     1) 水平距离 <= MELEE_RANGE（2.6m）
     2) 与视线方向的水平夹角 <= MELEE_ARC/2（60°，即正面 120° 扇区）
     3) 高度差 <= 2.2m（站着也能砍到趴着的，但打不到楼上的）
   这样贴脸乱砍一定砍得到，而不是刀从人身上穿过去没反应。
   命中的每个敌人独立扣血，一次挥砍最多打 MELEE_MAX（2）个，
   避免一刀把一屋子人全清了。 */
const MELEE_RANGE=2.6;      // 挥砍半径（米）
const MELEE_ARC=Math.PI/3;  // 半扇区 60°，正面总共 120°
const MELEE_MAX=2;          // 一刀最多命中几个
function meleeSwing(){
  if(!camera) return;
  const dmg=curDamage();
  /* 【近战耐久】刀也是消耗品：每挥一刀都会磨。
     耐久归零后伤害暴降（见上面的第 2 段），逼你换刀或去修。
     斧头最耐用（300），爪刀最脆（140）。 */
  {
    const mid=slotItem(P.slot);
    if(mid && typeof gunDurUse==='function' && MELEE_DUR_MAX[mid]){
      gunDurUse(mid, 1);
    }
  }
  /* 每把刀的挥砍半径不同：太刀最长，斧头重但短 */
  const mit=(typeof curMeleeItem==='function')?curMeleeItem():null;
  const reach=(mit&&mit.meleeRange)||MELEE_RANGE;
  const cp=camera.position;
  /* 视线水平方向：相机 forward 拍平 */
  const fx=-Math.sin(P.yaw||0), fz=-Math.cos(P.yaw||0);
  const cands=[];
  for(const e of enemies){
    if(!e.alive) continue;
    const dx=(e.x||0)-cp.x, dz=(e.z||0)-cp.z;
    const dist=Math.hypot(dx,dz);
    if(dist>reach) continue;
    if(Math.abs(cp.y-(e.body&&e.body.position?e.body.position.y:cp.y))>2.2) continue;
    /* 贴得极近时方向没意义，直接算命中 */
    let ang=0;
    if(dist>0.25){
      const dot=(dx*fx+dz*fz)/dist;
      ang=Math.acos(Math.max(-1,Math.min(1,dot)));
    }
    if(ang>MELEE_ARC) continue;
    cands.push({e:e,dist:dist});
  }
  /* 近的先挨刀 */
  cands.sort((a,b)=>a.dist-b.dist);
  const n=Math.min(cands.length, MELEE_MAX);
  for(let i=0;i<n;i++){
    const e=cands[i].e;
    e.hp-=dmg;
    e.aggro=true;
    if(e.hp<=0 && e.alive){
      e.alive=false;
      if(e.body) e.body.visible=false;
      if(e.head) e.head.visible=false;
      sfxKill();
    }
  }
  if(n>0) sfxHit();
  return n;
}
/* 霰弹散射半角（弧度/轴向偏移量）：0.028 约等于 1.6 度，
   8 米处散开半径约 22cm —— 正好覆盖一个人上半身。 */
const SHOT_SPREAD=0.028;

/* 实际扣板机入口：检查冷却/弹药，播放声音，决定是否进入泵动/栓动装填 */
function fire(){
  if(P.reload) return;
  /* 检视武器时枪已经转到脸前了，这时候还能开火会很穿帮 */
  if(typeof isInspecting==='function' && isInspecting()) return;
  if(P.shootCd>0) return;
  /* 泵动/栓动：上一发的拉栓动作没做完，不许再开火。
     这条比 shootCd 更严格，因为 fireCd（0.20）比拉栓时间（0.58）短。 */
  if(wPump>0) return;
  const melee=curIsMelee();
  const t=curAmmoKey();             // melee 时为 null
  if(!melee && (P.ammo[t]|0)<=0){ sfxEmpty(); startReload(); return; }
  if(!melee) P.ammo[t]--;
  /* 【武器耐久】每开一发都磨损机械部件。
     不同枪型磨损率不同（SEE GUN_DUR_WEAR）：狙击一发扣 3、手枪一发 0.7。
     扣到 0 会卡壳（射速腰斩、后坐翻倍、弹匣减半），要花钱去改枪台修。 */
  if(!melee){
    const wid=slotItem(P.slot);
    if(wid && typeof gunDurUse==='function'){
      const wear=(typeof GUN_DUR_WEAR==='object' && GUN_DUR_WEAR[wid]) || 1;
      gunDurUse(wid, wear);
    }
  }
  const mode=curFireMode();
  P.shootCd=curFireCd();
  P.shooting=true;
  sfxShoot();
  /* 后坐力：每把枪自己登记 recoil 系数，霰弹/栓动最大 */
  const rk=curRecoilK();
  addShake(melee?0.35:0.55*rk*rk);
  weaponKick();
  fireOnce();
  /* 泵动 / 栓动：打完这一发就开始拉栓，拉完才能再打。
     泵动同时把 wPump 置 1 驱动护木动画；栓动没有护木，
     就用同样的计时器把 shootCd 拉长到拉栓结束。 */
  if(mode==='pump'){
    wPumpDur=curPumpTime()||0.58;
    wPump=1;
    P.shootCd=Math.max(P.shootCd, wPumpDur);
  }else if(mode==='bolt'){
    wPumpDur=curPumpTime()||0.55;
    wPump=1;                      // 借用同一套进度量，只是没有护木模型可动
    P.shootCd=Math.max(P.shootCd, curFireCd());
  }
  /* 打空自动换弹（全自动枪打空后会自动接上，不用再点一次） */
  if(!melee && (P.ammo[t]|0)<=0) startReload();
}

/* ---- 全自动持续开火 ----
   以前 mousedown 只调一次 fire()，所以所有枪实际都是「点一次打一发」。
   现在在主循环里检查：左键压住 && 当前枪是 auto && 冷却到了 -> 再打一发。
   半自动/栓动/泵动不走这里，必须重新按一次。 */
/* 场景是否已经能开火。
   正常情况下用 b_world.js 的 ready；但在测试桩里 b_world 的
   let ready 可能落在另一个作用域，读不到就退化为「只要
   camera 存在就算就绪」——fire() 本来就要用 camera，
   camera 都没有的话它也开不了枪。 */
function canShootYet(){
  return !!camera;
}
function updFireHold(dt){
  if(!P.firing) return;
  /* ready 由 b_world.js 声明（let renderer,...,ready=false），
     initWorld() 成功后才置真。场景没建好之前按住开火键不应该开枪。
     用 typeof 保护：单块静态检查时可能还没加载 b_world。 */
  if(typeof ready==='boolean' ? !ready : !canShootYet()) return;
  if(P.reload||curIsMelee()) return;
  if(typeof isInspecting==='function' && isInspecting()) return;
  if(!curIsAuto()) return;
  if(P.shootCd>0||wPump>0) return;
  fire();
}
/* ---- 换弹 ----
   近战不需要换弹，直接忽略。
   弹匣容量按武器数据里的 mag 取，没写就用默认值。 */
function startReload(){
  if(curIsMelee()) return;          // 刀不换弹
  if(P.reload||P.shootCd>0) return;
  P.reload=true; P.reloadT=1.2;
  sfxReload();
}
function updReload(dt){
  if(!P.reload) return;
  P.reloadT-=dt;
  if(P.reloadT<=0){
    P.reload=false;
    /* 换弹时再取一次当前槽：万一换弹中途切了枪，
       这里装填的应该是「现在手上这把」，而不是开始换弹那把。
       同时要检查这把枪还在不在（可能被切走了）。 */
    if(curIsMelee()) return;
    const t=curAmmoKey();
    const rk=curReserveKey();
    const id=slotItem(P.slot);
    const it=id&&SHOP_ITEMS[id];
    /* 【扩容弹匣/弹鼓】magMul 是加算比例，+0.5 = 多 50%，+1.0 = 翻倍。
       没有配件时 magMul=0，完全保持原行为。 */
    let mag=(it&&it.mag)||(curIsPrimary()?30:12);
    try{
      const mm=(typeof gunModEff==='function')?gunModEff(id,'magMul'):0;
      if(mm>0) mag=Math.round(mag*(1+mm));
    }catch(e){}
    /* 【卡壳】耐久归零：弹匣只能装进一半，等于逼你去修 */
    if(id && typeof gunFunctional==='function' && !gunFunctional(id)) mag=Math.max(1, Math.round(mag*0.5));
    /* 从后备弹里扣：有后备就用后备，没有就按旧逻辑白给满弹匣，
       避免新手手枪打空后彻底没法玩。 */
    const have=(P.ammo[rk]|0);
    if(have>0){
      const need=Math.max(0,mag-(P.ammo[t]|0));
      const take=Math.min(have,need);
      P.ammo[t]=(P.ammo[t]|0)+take;
      P.ammo[rk]=have-take;
    }else if(!(P.ammo[t]|0)){
      P.ammo[t]=mag;    // 兜底：完全没弹了给满一梭子，不然新手卡死
    }
    refreshHUD();
  }
}

/* ---- 受伤 ---- */
function damageP(n){
  /* 【护甲减伤】穿着头盔/护甲时：
     1) 先按装备的减伤比例削掉一部分伤害（头盔管头部，这里统一按加权算）
     2) 再扣装备耐久，耐久归零则装备失效并自动卸下
     原来的 P.armor 是旧的护盾值，保留兼容。 */
  let reduce=0;
  if(P.equip){
    if(P.equip.helmet && P.helmetDur>0) reduce += (SHOP_ITEMS[P.equip.helmet]?.reduce||0)*0.4;
    if(P.equip.armorVest && P.vestDur>0) reduce += (SHOP_ITEMS[P.equip.armorVest]?.reduce||0)*0.6;
  }
  if(reduce>0) n = n*(1-Math.min(0.75,reduce));

  if(P.armor>0){
    const a=Math.min(P.armor,n*.6);
    P.armor-=a; n-=a;
  }

  /* 扣耐久：伤害的一半转到护甲耐久上 */
  if(P.equip){
    if(P.equip.armorVest && P.vestDur>0){
      P.vestDur=Math.max(0,P.vestDur-n*0.5);
      if(P.vestDur<=0){ P.equip.armorVest=null; toast('护甲已损坏'); }
    } else if(P.equip.helmet && P.helmetDur>0){
      P.helmetDur=Math.max(0,P.helmetDur-n*0.5);
      if(P.helmetDur<=0){ P.equip.helmet=null; toast('头盔已损坏'); }
    }
  }

  P.hp-=n;
  sfxHurt();
  refreshHUD();
  if(P.hp<=0){ P.hp=0; onDeath(); }
}
function onDeath(){
  sfxDeath();
  /* 【阵亡结算】搜打撤的风险机制：
     你带进局的背包物资和身上的头盔/护甲，全都丢了。
     仓库里的东西不受影响（那是安全区）。 */
  const lost = (typeof settleDeath==='function') ? settleDeath() : 0;
  const info=$('deathInfo');
  if(info) info.textContent='击杀 '+(enemies.filter(e=>!e.alive).length)+' 名敌人 · 现金 ¥'+P.ammo.cash
    +' · 丢失背包物品 '+lost+' 种、装备全部掉光';
  const d=$('death'); if(d) d.style.display='flex';
}

/* ---- 敌人 AI ---- */
function updE(dt){
  if(P.shootCd>0) P.shootCd-=dt;
  if(P.reload) updReload(dt);
  if(P.shooting) P.shooting=false;

  enemyTick+=dt;
  while(enemyTick>=0.2){
    enemyTick-=0.2;
    for(const e of enemies){
      if(!e.alive){
        if(e.respawn>0) e.respawn-=1;
        continue;
      }
      // aggro 状态朝玩家移动，否则巡逻（原地小幅晃动）
      const dx=P.pos.x-e.x, dz=P.pos.z-e.z;
      const dist=Math.hypot(dx,dz);
      if(dist<18){ e.aggro=true; }
      if(e.aggro){
        const spd=e.speed;
        if(dist>1.5){
          e.x+=dx/dist*spd*0.2;
          e.z+=dz/dist*spd*0.2;
          e.body.rotation.y=Math.atan2(dx,dz);
        }
        // 攻击
        if(dist<3 && e.atkCd<=0){
          damageP(8+e.speed*0); e.atkCd=1.0;
        }
      }
      if(e.atkCd>0) e.atkCd-=0.2;
      // 同步 mesh 位置
      e.body.position.set(e.x,0.85,e.z);
      e.head.position.set(e.x,1.7,e.z);
    }
  }
  // 复活的敌人（respawn 计数器用 0.2s 节拍，这里简单延迟重生）
  for(const e of enemies){
    if(e.alive||e.respawn<=0) continue;
    e.respawn-=0.2;
    if(e.respawn<=0){ respawnEnemy(e); }
  }
}
function respawnEnemy(e){
  e.alive=true; e.hp=100; e.aggro=false;
  e.body.visible=true; e.head.visible=true;
  e.respawn=0;
}

/* ---- 物资拾取 ---- */
/* 【改了行为】以前踩到地上物资就直接改 P.ammo / P.inv —— 等于凭空变出子弹，
   和「搜打撤」里「东西必须是背包里实实在在的一件」完全不符。
   现在统一塞进背包（并打上「搜来的」标记），撤离后才能作为战利品卖钱。
   背包装不下就提示，不白拿。 */
const LOOT_PICK={
  ammo:['ammo_rifle',1],
  med: ['med',1],
  gun: ['ammo_rifle',2],   // 地上的"枪"改为给一把枪的弹药补给，避免凭空多出枪
};
function updLoot(dt){
  for(const l of loots){
    if(l.taken) continue;
    const d=Math.hypot(P.pos.x-l.x,P.pos.z-l.z);
    if(d<1.5){
      if(l.type==='cash'){
        l.taken=true; l.mesh.visible=false;
        P.ammo.cash=(P.ammo.cash|0)+200;
        sfxPickup(); toast('💵 +¥200'); refreshHUD();
        continue;
      }
      const pair=LOOT_PICK[l.type];
      if(!pair){ l.taken=true; l.mesh.visible=false; continue; }
      const id=pair[0], cnt=pair[1];
      if(typeof bagAdd==='function' && bagAdd(id,cnt)){
        l.taken=true; l.mesh.visible=false;
        if(!P.looted[id]) P.looted[id]=0;
        P.looted[id]+=cnt;
        const it=SHOP_ITEMS[id];
        sfxPickup(); toast('拾取 '+(it?it.name:id)+' ×'+cnt);
        refreshHUD();
      } else {
        toast('背包满了 · 先清点东西');
      }
    }
  }
}

/* ---- 撤离倒计时 ----
   【为什么要有这个】搜打撤（塔科夫/暗区）的核心压力来自「时间有限」：
   你必须在规定时间内搜完、跑到撤离点，时间一到没走就等于死了。
   以前这一局可以无限耗下去，既没有紧张惑，也让「敢不敢多搜一个屋」
   这个核心决策完全不存在。现在 8 分钟一到强制结束，东西全丢。 */
const RAID_LIMIT = 480;   // 单局时长（秒）8 分钟

/* 每帧推进计时。返回剩余秒数（用于 HUD 显示）。 */
function updRaidTimer(dt){
  if(!window.__inGame) return RAID_LIMIT;
  if(typeof P.raidT!=='number') P.raidT=0;
  P.raidT += dt;
  const left = RAID_LIMIT - P.raidT;
  /* 【超时惩罚】时间到：直接算阵亡，不带任何东西出去。
     用 window.__raidOver 做一次性保护，避免每帧都弹一次结算。 */
  if(left<=0 && !window.__raidOver && !exfiled){
    window.__raidOver = true;
    try{ if(typeof raidTimeout==='function') raidTimeout(); }
    catch(e){ console.error('raidTimeout failed', e); }
  }
  return Math.max(0, left);
}

/* 超时结算：与阵亡同效，但文案不同（提示玩家「是时间到了」） */
function raidTimeout(){
  try{ P.firing=false; }catch(e){}
  try{ if(typeof sfxDeny==='function') sfxDeny(); }catch(e){}
  window.__inGame = false;
  const d=$('death');
  if(d){
    /* 【国际化】'T()' 在切语言时找不到译文就原样返回中文，
       所以这里不需要判断语言。 */
    const h2=d.querySelector('h2'); if(h2) h2.textContent=T('⏰ 撤离超时');
    const info=$('deathInfo');
    if(info) info.textContent=T('你没在规定时间内到达撤离点 · 带进去的物资全部丢失');
    d.style.display='flex';
  }
  /* 【处理局内资产】超时 = 阵亡：背包、胸挂、身上装备全部丢失。
     这是搜打撤的标准规则，时间压力才有意义。 */
  /* 直接复用阵亡结算：背包/胸挂清空、搜来记录作废、九个槽位全掉。
     超时的惩罚与阵亡完全一致 —— 搜打撤里「没撤走」就是死。 */
  try{ if(typeof settleDeath==='function') settleDeath(); }catch(e){ console.error('settleDeath failed', e); }
  try{ if(typeof saveTick==='function') saveTick(); }catch(e){}
  try{ toast(T('⏰ 撤离超时 · 物资丢失')); }catch(e){}
}

/* ---- 撤离判定 ---- */
let exfiled=false;
function checkExfil(){
  if(!exfil||exfiled) return;
  if(window.__raidOver) return;   // 已经超时了，别再触发撤离
  const d=Math.hypot(P.pos.x-exfil.x,P.pos.z-exfil.z);
  if(d<3){
    exfiled=true;
    sfxExfil();
    /* 【撤离结算】局内背包里的所有东西并回仓库，
       身上的头盔/护甲/背包继续保留可以用。 */
    const before={};
    if(typeof P.pouch==='object'){ for(const k in P.pouch) before[k]=P.pouch[k]; }
    if(typeof settleExfil==='function') settleExfil();
    let msg='';
    for(const k in before){
      const it=(typeof SHOP_ITEMS==='object')?SHOP_ITEMS[k]:null;
      msg+=(it?it.icon+' '+it.name+' ×'+before[k]+'　':'');
    }
    toast('✅ 成功撤离！');
    // 用死亡面板显示撤离结算
    const info=$('deathInfo');
    if(info) info.textContent='✅ 撤离成功 · 现金 ¥'+P.ammo.cash
      +(msg?' · 带回：'+msg:' · 背包是空的');
    const h=$('death'); if(h) h.style.display='flex';
    const h2=h&&h.querySelector('h2'); if(h2) h2.textContent='✅ 撤离成功';
  }
}
