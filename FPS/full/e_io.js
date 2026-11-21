/* ============ e_io.js：加密存档（PBKDF2 + AES-GCM + FNV-1a） ============ */
const MAGIC='EFSFPS';

function fnv1a(str){
  let h=0x811c9dc5;
  for(let i=0;i<str.length;i++){
    h^=str.charCodeAt(i);
    h=(h*0x01000193)>>>0;
  }
  return h.toString(16).padStart(8,'0');
}

function buf2b64(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function b642buf(b64){ return Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); }

async function importKey(pw,salt){
  const km=await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey(
    {name:'PBKDF2',salt:salt,iterations:200000,hash:'SHA-256'},
    km,
    {name:'AES-GCM',length:256},
    false,
    ['encrypt','decrypt']
  );
}

async function encryptSave(obj,pw){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const json=JSON.stringify(obj);
  const key=await importKey(pw,salt);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(json));
  return MAGIC+'.'+buf2b64(salt)+'.'+buf2b64(iv)+'.'+buf2b64(ct);
}

async function decryptSave(str,pw){
  const parts=str.split('.');
  if(parts.length!==4||parts[0]!==MAGIC) throw new Error('格式错误');
  const salt=b642buf(parts[1]);
  const iv=b642buf(parts[2]);
  const ct=b642buf(parts[3]);
  const key=await importKey(pw,salt);
  const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

function exportSave(){
  const obj={hp:P.hp,armor:P.armor,ammo:P.ammo,inv:P.inv,cash:P.ammo.cash,pos:[P.pos.x,P.pos.z]};
  const pw=prompt('设置存档密码：');
  if(!pw) return;
  encryptSave(obj,pw).then(s=>{
    const t=$('savebox'); if(!t) return;
    t.value=s; t.style.display='block';
    t.select(); document.execCommand('copy');
    alert('已加密并复制到剪贴板');
  });
}
function importSave(){
  const s=prompt('粘贴存档串：');
  if(!s) return;
  const pw=prompt('输入存档密码：');
  if(!pw) return;
  decryptSave(s,pw).then(o=>{
    P.hp=o.hp; P.armor=o.armor; P.ammo=o.ammo; P.inv=o.inv;
    P.pos.set(o.pos[0],1.6,o.pos[1]);
    refreshHUD();
    alert('存档已恢复');
  }).catch(e=>{
    alert('解密失败：'+e.message);
  });
}
/* ============================================================
   本地自动存档（localStorage + cookie 双写）

   【为什么要做】以前 3D 版只有「加密导出/导入」这种手动路径：
   关掉页面（或 WebView 被杀）之后，仓库、钱、皮肤、出击装备
   全部归零。用户回一句「没有本地 cookie 保存吗」—— 确实没有。

   【存什么】只存「局外」的东西：钱、仓库、出击装备、皮肤、护甲耐久。
   局内的血量/位置不存 —— 搜打撤的意义就是带着风险进去、
   死在里面就丢光，存档把它救回来就没意思了。
   所以刷新后回到主菜单，仓库还在，人重新出发。

   【localStorage 还是 cookie】
   localStorage 容量大（5MB）、不会随请求发给服务器、没有 4KB 限制，
   是 JSON 存档的首选。cookie 只能存 4KB、每次请求都带，
   但它的存活范围更广（某些 WebView 清 localStorage 不清 cookie）。
   所以两边都写一份：localStorage 为主，cookie 为兜底。
   两者都没有时当作新存档，不报错。
   ============================================================ */
const AUTO_SAVE_KEY = 'efs_fps_save_v1';
const AUTO_SAVE_COOKIE = 'efs_fps_save_v1';
const AUTO_SAVE_VERSION = 1;
const AUTO_SAVE_DAYS = 180;

/* 只把局外字段扒出来。字段白名单而不是黑名单：
   以后 P 里新增局内字段（子弹飞行、敌人状态）不会被误存进去。 */
function autoSaveSnapshot(){
  return {
    v: AUTO_SAVE_VERSION,
    t: Date.now(),
    cash: P.ammo.cash|0,
    ammo: { rifle:P.ammo.rifle|0, pistol:P.ammo.pistol|0,
            sniper:P.ammo.sniper|0, shot:P.ammo.shot|0 },
    stash: P.stash || {},
    equip: P.equip || {},
    skins: P.skins || {},
    bagCap: P.bagCap|0,
    helmetDur: P.helmetDur|0,
    vestDur: P.vestDur|0,
    /* 【武器耐久 + 改枪配件】不存的话一刷新就全没了：
       花几千块买的瞄具凭空消失，打完的枪又变满耐久，
       等于「耐久」和「改枪」两个系统都变成摆设。 */
    gunDur: P.gunDur || {},
    gunMods: P.gunMods || {}
  };
}

/* 写入 cookie。SameSite=Lax 避免跨站场景下被浏览器丢掉，
   max-age 用秒；值里有分号/逗号会截断，所以一律 encodeURIComponent。 */
function autoSaveCookie(str){
  try{
    const v = encodeURIComponent(str);
    const maxAge = AUTO_SAVE_DAYS*24*60*60;
    document.cookie = AUTO_SAVE_COOKIE + '=' + v
      + '; path=/; max-age=' + maxAge + '; SameSite=Lax';
  }catch(e){}
}
function autoSaveReadCookie(){
  try{
    const all = document.cookie || '';
    const parts = all.split(';');
    for(let i=0;i<parts.length;i++){
      const s = parts[i].trim();
      const eq = s.indexOf('=');
      if(eq<0) continue;
      if(s.slice(0,eq) === AUTO_SAVE_COOKIE){
        return decodeURIComponent(s.slice(eq+1));
      }
    }
  }catch(e){}
  return null;
}

/* 保存。两个后端都失败时只 console.warn，不弹出东西骚扰玩家。 */
function autoSaveWrite(){
  let json = '';
  try{ json = JSON.stringify(autoSaveSnapshot()); }catch(e){ return false; }
  let ok = false;
  try{ localStorage.setItem(AUTO_SAVE_KEY, json); ok = true; }catch(e){}
  autoSaveCookie(json);
  return ok;
}

/* 读档：先 localStorage，拿不到或坏了再试 cookie。
   解析失败一律返回 null（当作新档），绝不让坏数据把游戏卡死。 */
function autoSaveRead(){
  const tryParse = (raw)=>{
    if(!raw) return null;
    try{
      const o = JSON.parse(raw);
      if(!o || typeof o!=='object') return null;
      return o;
    }catch(e){ return null; }
  };
  let raw = null;
  try{ raw = localStorage.getItem(AUTO_SAVE_KEY); }catch(e){}
  let o = tryParse(raw);
  if(!o) o = tryParse(autoSaveReadCookie());
  return o;
}

/* 把存档套进 P。只覆盖认识的字段，缺什么就保留当前默认值。 */
function autoSaveApply(o){
  if(!o) return false;
  try{
    if(typeof o.cash==='number') P.ammo.cash = Math.max(0, o.cash|0);
    if(o.ammo && typeof o.ammo==='object'){
      ['rifle','pistol','sniper','shot'].forEach(k=>{
        if(typeof o.ammo[k]==='number') P.ammo[k] = Math.max(0, o.ammo[k]|0);
      });
    }
    if(o.stash && typeof o.stash==='object'){
      /* 过滤掉已经不是合法物品的 key（以后删了某个物品，旧存档别带崩商店） */
      const clean = {};
      for(const id in o.stash){
        if(!Object.prototype.hasOwnProperty.call(o.stash, id)) continue;
        if(typeof SHOP_ITEMS!=='undefined' && !SHOP_ITEMS[id]) continue;
        const n = o.stash[id]|0;
        if(n>0) clean[id] = n;
      }
      P.stash = clean;
    }
    if(o.equip && typeof o.equip==='object'){
      /* 装备栏逐个槽校验：物品存在且分类对得上才装回去，
         否则宁可留空 —— 一个坏 id 会让 slotUsable 判断崩掉。 */
      const slots=['primary','secondary','melee','helmet','armorVest','backpack','chest'];
      for(const k of slots){
        const id = o.equip[k];
        if(id===undefined) continue;
        if(id===null){ P.equip[k]=null; continue; }
        if(typeof SHOP_ITEMS!=='undefined' && SHOP_ITEMS[id]) P.equip[k]=id;
      }
    }
    if(o.skins && typeof o.skins==='object'){
      const clean = {};
      for(const id in o.skins){
        if(!Object.prototype.hasOwnProperty.call(o.skins, id)) continue;
        if(typeof SHOP_ITEMS!=='undefined' && !SHOP_ITEMS[id]) continue;
        const sk = o.skins[id];
        if(typeof SKINS!=='undefined' && !SKINS[sk]) continue;
        clean[id] = sk;
      }
      P.skins = clean;
    }
    if(typeof o.bagCap==='number' && o.bagCap>0) P.bagCap = o.bagCap|0;
    if(typeof o.helmetDur==='number') P.helmetDur = Math.max(0, o.helmetDur|0);
    if(typeof o.vestDur==='number')   P.vestDur   = Math.max(0, o.vestDur|0);
    /* 【武器耐久】按武器 id 逐个校验并夹到 [0, 上限]。
       上限取 gunDurMax，所以以后调整数值平衡时旧档会自动跟着缩放，
       不会出现「存档里 320/260」这种超过上限的怪值。 */
    if(o.gunDur && typeof o.gunDur==='object'){
      const clean={};
      for(const id in o.gunDur){
        if(!Object.prototype.hasOwnProperty.call(o.gunDur, id)) continue;
        if(typeof SHOP_ITEMS!=='undefined' && !SHOP_ITEMS[id]) continue;
        const mx=(typeof gunDurMax==='function')?gunDurMax(id):200;
        const v=Number(o.gunDur[id]);
        if(!isFinite(v)) continue;
        clean[id]=Math.max(0, Math.min(mx, v));
      }
      P.gunDur=clean;
    } else if(typeof P.gunDur!=='object'){
      P.gunDur={};
    }
    /* 【改枪配件】两层校验：武器 id 合法 + 配件 id 合法 + 槽位得匹配。
       不校验的话，旧存档里的脏数据会让 gunModEff 读到 undefined 而崩掉，
       或者把瞄具装到枪托槽上，属性直接乱套。 */
    if(o.gunMods && typeof o.gunMods==='object'){
      const clean={};
      for(const gid in o.gunMods){
        if(!Object.prototype.hasOwnProperty.call(o.gunMods, gid)) continue;
        if(typeof SHOP_ITEMS!=='undefined' && !SHOP_ITEMS[gid]) continue;
        const src=o.gunMods[gid];
        if(!src || typeof src!=='object') continue;
        const dst={};
        for(const slot in src){
          const mid=src[slot];
          if(typeof GUN_MODS==='undefined' || !GUN_MODS[mid]) continue;
          if(GUN_MODS[mid].slot!==slot) continue;   // 槽位不匹配 → 丢
          if(typeof gunSlotsOf==='function' && gunSlotsOf(gid).indexOf(slot)<0) continue;
          dst[slot]=mid;
        }
        if(Object.keys(dst).length) clean[gid]=dst;
      }
      P.gunMods=clean;
    } else if(typeof P.gunMods!=='object'){
      P.gunMods={};
    }
    return true;
  }catch(e){ return false; }
}

/* 启动时调用一次。放在 e_io 里、由 z_render 的启动段拉起。 */
function autoSaveLoad(){
  const o = autoSaveRead();
  if(!o) return false;
  return autoSaveApply(o);
}

/* 自动保存的调度：
   - 改动后立即写一次（下面的 autoSaveTouch 会被各处调用）
   - 页面隐藏/卸载时再写一次（防止最后一次改动没来得及落盘）
   不用 setInterval 轮询 —— 存档只在「有变化」时才需要写，
   轮询只会白耗电。 */
let _autoSavePending = false;
function autoSaveTouch(){
  if(_autoSavePending) return;
  _autoSavePending = true;
  /* 合并同一帧内的多次改动：买东西会连改 stash/cash/equip，
     一帧写三次 localStorage 纯属浪费。 */
  const flush = ()=>{ _autoSavePending = false; autoSaveWrite(); };
  if(typeof queueMicrotask==='function') queueMicrotask(flush);
  else if(typeof setTimeout==='function') setTimeout(flush, 0);
  else flush();
}

/* 清档（「重置数据」按钮要用） */
function autoSaveClear(){
  try{ localStorage.removeItem(AUTO_SAVE_KEY); }catch(e){}
  try{
    document.cookie = AUTO_SAVE_COOKIE + '=; path=/; max-age=0; SameSite=Lax';
  }catch(e){}
}

/* 页面生命周期挂钩：切到后台、关掉前各写一次。
   pagehide 比 beforeunload 可靠（移动端 WebView 经常不触发 beforeunload）。 */
if(typeof window!=='undefined'){
  window.addEventListener('pagehide', ()=>{ try{ autoSaveWrite(); }catch(e){} });
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='hidden'){ try{ autoSaveWrite(); }catch(e){} }
  });
}
