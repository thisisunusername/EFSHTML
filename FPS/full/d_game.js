/* ============ d_game.js：敌人 AI + 物资 + 撤离 + 射击 ============ */
let enemyTick=0;

/* ---- 射击 ---- */
function fire(){
  if(P.reload) return;
  const t=P.inv.gun?'gun':'ammo';
  if(P.shootCd>0) return;
  if((P.ammo[t]||0)<=0){ sfxEmpty(); startReload(); return; }
  P.ammo[t]--;
  P.shootCd=P.inv.gun?0.12:0.18;
  P.shooting=true;
  sfxShoot();
  addShake(P.inv.gun?0.55:0.9);
  weaponKick();

  // 射线检测
  const dir=lookDir();
  const origin=camera.position.clone();
  const raycaster=new THREE.Raycaster(origin,dir,0.2,120);
  const hits=raycaster.intersectObjects(shootables,true);
  if(hits.length>0){
    const hit=hits[0];
    const obj=hit.object;
    // 命中敌人（body/head）
    for(const e of enemies){
      if(e.body===obj||e.head===obj){
        const dmg=P.inv.gun?34:10;
        e.hp-=dmg;
        e.aggro=true;
        if(obj===e.head) sfxHeadshot(); else sfxHit();
        if(e.hp<=0){ e.alive=false; e.body.visible=false; e.head.visible=false; sfxKill(); }
        break;
      }
    }
  }
  // 枪口火光（简单后续可扩展）
}

/* ---- 换弹 ---- */
function startReload(){
  if(P.reload||P.shootCd>0) return;
  P.reload=true; P.reloadT=1.2;
  sfxReload();
}
function updReload(dt){
  if(!P.reload) return;
  P.reloadT-=dt;
  if(P.reloadT<=0){
    P.reload=false;
    const t=P.inv.gun?'gun':'ammo';
    P.ammo[t]=P.inv.gun?30:120; // 上限
  }
}

/* ---- 受伤 ---- */
function damageP(n){
  if(P.armor>0){
    const a=Math.min(P.armor,n*.6);
    P.armor-=a; n-=a;
  }
  P.hp-=n;
  sfxHurt();
  if(P.hp<=0){ P.hp=0; onDeath(); }
}
function onDeath(){
  sfxDeath();
  const info=$('deathInfo'); if(info) info.textContent='击杀 '+(enemies.filter(e=>!e.alive).length)+' 名敌人 · 现金 ¥'+P.ammo.cash;
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
function updLoot(dt){
  for(const l of loots){
    if(l.taken) continue;
    const d=Math.hypot(P.pos.x-l.x,P.pos.z-l.z);
    if(d<1.5){
      l.taken=true; l.mesh.visible=false;
      switch(l.type){
        case 'ammo': P.ammo.ammo+=30; break;
        case 'med':  P.inv.med++; break;
        case 'cash': P.ammo.cash+=200; break;
        case 'gun':  P.inv.gun=true; P.ammo.gun=120; break;
      }
      sfxPickup();
      refreshHUD();
    }
  }
}

/* ---- 撤离判定 ---- */
let exfiled=false;
function checkExfil(){
  if(!exfil||exfiled) return;
  const d=Math.hypot(P.pos.x-exfil.x,P.pos.z-exfil.z);
  if(d<3){
    exfiled=true;
    sfxExfil();
    toast('✅ 成功撤离！');
    // 用死亡面板显示撤离结算
    const info=$('deathInfo'); if(info) info.textContent='✅ 撤离成功 · 现金 ¥'+P.ammo.cash;
    const h=$('death'); if(h) h.style.display='flex';
    const h2=h&&h.querySelector('h2'); if(h2) h2.textContent='✅ 撤离成功';
  }
}
