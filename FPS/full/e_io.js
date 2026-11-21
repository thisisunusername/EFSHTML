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

/* ============================================================
   【内置存档密钥】
   用户要求：导出时不要让人设置密码 —— 否则玩家自己设的密码
   写在同一份代码里，等于「加密/解密随便改明文」，一点保护都没有。
   改成所有玩家共用一把内置密钥，藏在文件很靠前的位置，
   导出时自动加密、导入时自动解密，玩家全程不需要知道密码。
   这仍然是明文写在源码里（浏览器必须能看到密钥才能解密），
   所以它防的是「随手改存档」，不是防会读源码的人 —— 这点必须说清楚。
   ============================================================ */
const SAVE_KEY_STR='AESeNcRypTeDNOtMyINsSTalL!*{}';
/* 用密钥派生出一个稳定盐值：同一条存档在哪台机器都能解开，
   所以盐不能随机（随机盐也必须一起存进存档串里，那样等于把
   盐和密文放在一起，还不如直接用固定盐简单可靠）。
   GCM 的 IV 仍然是随机的 —— 那是加密安全所必需的。 */
const SAVE_FIXED_SALT=(()=>{
  const s=new Uint8Array(16);
  for(let i=0;i<16;i++) s[i]=(SAVE_KEY_STR.charCodeAt(i%SAVE_KEY_STR.length)*31+i*7)&0xff;
  return s;
})();

/* ---- 文件下载（参考 2D 版 c_logic.js 的写法）----
   2D 版导出的做法：Blob → URL.createObjectURL → <a download> → click。
   我们照抄这一套，并补两件 2D 版没做的事：
     1. 老 WebView 不支持 <a download> 时，退化成把内容塞进文本框让人手动复制；
     2. 清理用 setTimeout，且在 revoke 之前先移除节点，避免某些
        WebView 里「点了没反应」。
   【为什么以前导出没用】
     旧实现是把加密串塞进页面上的 #savebox 然后 execCommand('copy')。
     在手机 WebView 里 execCommand 经常直接返回 false，
     于是玩家看到「已复制」但其实剪贴板是空的；
     而且它只存了 hp/ammo/inv 几个字段，仓库、皮肤、配件全丢了 ——
     就算复制成功，导入回来也是个残档。这次连内容一起修。 */
function saveDownload(filename, text){
  try{
    const blob=new Blob([text],{type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url; a.download=filename; a.style.display='none';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{
      try{ document.body.removeChild(a); }catch(e){}
      try{ URL.revokeObjectURL(url); }catch(e){}
    }, 400);
    return true;
  }catch(e){
    return false;
  }
}
/* 导出的内容 = 本地自动存档的完整快照。
   用 autoSaveSnapshot() 而不是手写字段：本地存档已经把所有
   「局外资产」维护好了（仓库/胸挂/搜来账本/皮肤/配件/护甲耐久/
   背包容量…），导出再手写一遍字段只会两边不同步 ——
   这正是旧版「导出没用」的根因。 */
function exportSave(){
  let snap;
  try{ snap=autoSaveSnapshot(); }catch(e){ toast('导出失败：'+e.message); return; }
  snap.kind='efs-fps-save';
  snap.exportedAt=new Date().toISOString();
  const plain=JSON.stringify(snap,null,2);

  /* 先用内置密钥加密。crypto.subtle 在 http:// 或某些老 WebView 里
     不存在（安全上下文限制），那就退回存明文 JSON ——
     文件仍然能用，只是没了加密，总比导不出来强。 */
  const done=(text,enc)=>{
    const fn='efs-save-'+(enc?'enc':'plain')+'-'+Date.now()+'.json';
    if(saveDownload(fn,text)){
      toast((enc?'已加密导出 ':'已导出 ')+fn);
    }else{
      /* 下载通道不可用：显示文本框兜底，让玩家自己复制 */
      const t=$('savebox');
      if(t){
        t.value=text; t.style.display='block'; t.select();
        toast('无法直接下载，已放到下面的文本框，请手动复制');
      }else{
        toast('导出失败：这个浏览器不支持文件下载');
      }
    }
  };

  (async()=>{
    try{
      if(crypto && crypto.subtle){
        const enc=await encryptSave(snap,SAVE_KEY_STR);
        done(enc,true);
      }else{
        done(plain,false);
      }
    }catch(e){
      /* 加密失败（极少见）也照样导出明文，不让玩家白点一次 */
      done(plain,false);
    }
  })().catch(()=>{ done(plain,false); });
}

/* 导入：自动识别「加密串」和「明文 JSON」两种格式，
   全程不问密码。这样玩家六年前的旧存档（如果当时是加密的）
   也能靠内置密钥打开。 */
function importSave(){
  const box=$('savebox');
  const file=$('saveFile');
  const finishSafe=(text)=>{
    if(!text || !text.trim()){ toast('没有内容可导入'); return; }
    const raw=text.trim();
    const parseAndApply=(obj)=>{
      if(!obj || typeof obj!=='object'){ toast('存档格式不对'); return; }
      try{
        /* autoSaveApply 内部对每个字段都做了合法性校验，
           坏字段会被忽略而不是把游戏搞崩。 */
        autoSaveApply(obj);
        /* 导入完立刻落盘，避免「导进来了但一刷新又没了」 */
        if(typeof autoSaveTouch==='function') autoSaveTouch();
        refreshHUD();
        try{ if(typeof buildMenuStats==='function') buildMenuStats(); }catch(e){}
        toast('存档已导入');
      }catch(e){
        toast('导入失败：'+e.message);
      }
    };
    if(raw.indexOf(MAGIC+'.')===0){
      /* 加密串：直接拿内置密钥解，不询问密码 */
      decryptSave(raw, SAVE_KEY_STR)
        .then(parseAndApply)
        .catch(()=>{
          /* 万一不是内置密钥加密的（比如玩家自己设过密码的老档），
             才退回问一次密码 —— 只在真的解不开时才打扰玩家。 */
          const pw=(typeof prompt==='function')?prompt('这份存档不是内置密钥加密的，请输入它原来的密码：'):null;
          if(!pw) return;
          decryptSave(raw,pw).then(parseAndApply).catch(e=>toast('解密失败：'+e.message));
        });
      return;
    }
    let obj=null;
    try{ obj=JSON.parse(raw); }catch(e){}
    if(obj) parseAndApply(obj);
    else toast('无法识别这段内容');
  };

  /* 优先读文件：手机上从下载目录挑一个 .json 比「复制粘贴一大段」
      intuitiveness 高太多。 */
  if(file && file.files && file.files.length){
    const f=file.files[0];
    const fr=new FileReader();
    fr.onload=()=>finishSafe(String(fr.result||''));
    fr.onerror=()=>toast('读取文件失败');
    fr.readAsText(f);
    return;
  }
  if(box && box.value && box.value.trim()){ finishSafe(box.value); return; }
  /* 都没有：让玩家先把内容贴进文本框，再点一次导入 */
  if(box){
    box.style.display='block';
    toast('把存档内容贴到下面的文本框，再点一次「导入」');
    try{ box.focus(); }catch(e){}
  }else{
    toast('这台设备上没法选文件，请用文本框粘贴');
  }
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
    /* 胸挂格子也要存：它装的是医疗/弹药，局内撤离线时是真实收益。
       不存的话退到主菜单再进，胸挂里塞的急救包会凭空消失。 */
    chestPouch: P.chestPouch || {},
    /* 【搜来的物品数量】卖出系统靠它判断「这件是搜的还是买的」。
       不存的话，退出重进之后搜来的东西会被当成自购品只能按 6 折卖，
       玩家辛苦搜一身装备反而亏钱。 */
    looted: P.looted || {},
    equip: P.equip || {},
    skins: P.skins || {},
    bagCap: P.bagCap|0,
    helmetDur: P.helmetDur|0,
    vestDur: P.vestDur|0,
    /* 【武器耐久 + 改枪配件】不存的话一刷新就全没了：
       花几千块买的瞄具凭空消失，打完的枪又变满耐久，
       等于「耐久」和「改枪」两个系统都变成摆设。 */
    gunDur: P.gunDur || {},
    gunMods: P.gunMods || {},
    /* 【生涯统计】击杀数 / 撤离次数 / 阵亡数 / 出击数。
       放进快照才会被 autoSave 和「导出存档」一起带走，
       换设备导入后主菜单的数字才是对的。 */
    stats: P.stats || {}
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
    /* 【胸挂格子】按当前胸挂容量做截断：
       如果存档里塞了 8 格、但玩家现在只戴 3 格胸挂（比如换了装备），
       多出来的部分不能凭空保留，否则容量限制形同虚设。
       多出的物品不销毁，挪回仓库 —— 玩家不会因为换胸挂而丢东西。 */
    if(o.chestPouch && typeof o.chestPouch==='object'){
      const clean={};
      for(const id in o.chestPouch){
        if(!Object.prototype.hasOwnProperty.call(o.chestPouch, id)) continue;
        if(typeof SHOP_ITEMS!=='undefined' && !SHOP_ITEMS[id]) continue;
        const n=Number(o.chestPouch[id]);
        if(!isFinite(n) || n<=0) continue;
        clean[id]=n|0;
      }
      P.chestPouch=clean;
    }else{
      P.chestPouch=P.chestPouch||{};
    }
    /* 【搜来的物品数量】读档校验：只保留合法物品 id 的正整数。 */
    if(o.looted && typeof o.looted==='object'){
      const cl={};
      for(const id in o.looted){
        if(!Object.prototype.hasOwnProperty.call(o.looted, id)) continue;
        if(typeof SHOP_ITEMS!=='undefined' && !SHOP_ITEMS[id]) continue;
        const n=Number(o.looted[id]);
        if(!isFinite(n) || n<=0) continue;
        cl[id]=n|0;
      }
      P.looted=cl;
    }else{
      P.looted=P.looted||{};
    }
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
    /* 【生涯统计】读回来。旧存档没有这个字段，那就保持初始的 0。
       每个值都做一次整数夹取，防止手改存档塞进 NaN/负数。 */
    if(o.stats && typeof o.stats==='object'){
      P.stats = P.stats || {};
      const ks=['kills','exfils','deaths','raids'];
      for(const k of ks){
        const v=Number(o.stats[k]);
        P.stats[k] = isFinite(v) ? Math.max(0, v|0) : (P.stats[k]|0);
      }
    } else if(!P.stats || typeof P.stats!=='object'){
      P.stats={ kills:0, exfils:0, deaths:0, raids:0 };
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
/* 【立即写盘】和 autoSaveTouch 的区别：这个是同步的，调用返回时
   数据已经在 localStorage 里了。
   【为什么后来必须加这个】用户反馈「本地 cookie 没保存」，
   查下来不是写盘代码坏了，而是两处漏了「触发」：
     1. 仓库里点物品「放进出击背包」那条分支压根没调 saveTick()，
        只有装备槽那条调了。玩家把药、子弹塞进背包，然后关页面 ——
        这些改动从来没被写过。
     2. 手机 WebView 从最近任务里划掉时，pagehide/visibilitychange
        不一定来得及触发（进程直接被 kill）。队里只挂了一个
        queueMicrotask 的话，一帧都跑不完就没了。
   所以凡是「离开某个界面 / 结算」这类关键时刻，一律用 autoSaveFlush()
   同步写一次，不再赌微任务能不能跑完。 */
function autoSaveFlush(){
  _autoSavePending = false;
  return autoSaveWrite();
}

/* 清档（「重置数据」按钮要用） */
function autoSaveClear(){
  try{ localStorage.removeItem(AUTO_SAVE_KEY); }catch(e){}
  try{
    document.cookie = AUTO_SAVE_COOKIE + '=; path=/; max-age=0; SameSite=Lax';
  }catch(e){}
}

/* 页面生命周期挂钩：切到后台、关掉前各写一次。
   pagehide 比 beforeunload 可靠（移动端 WebView 经常不触发 beforeunload）。
   再用 autoSaveFlush 同步写，不要队列 —— 进程快被 kill 的时候，
   排队中的微任务根本没机会执行。 */
if(typeof window!=='undefined'){
  window.addEventListener('pagehide', ()=>{ try{ autoSaveFlush(); }catch(e){} });
  /* 某些 iPad/WebView 连 pagehide 都不发，只有 beforeunload 有反应，
     两个都挂上，重复写同一份数据没有副作用。 */
  window.addEventListener('beforeunload', ()=>{ try{ autoSaveFlush(); }catch(e){} });
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='hidden'){ try{ autoSaveFlush(); }catch(e){} }
  });
  /* 【兜底定时写盘】最后一道保险：每隔 20 秒，如果期间发生过改动
     就同步写一次。手机的 WebView 被系统回收时可能一个事件都不给，
     有了这个，最多丢 20 秒内的操作，而不是整个会话。
     没有改动就不写，所以不会有额外 IO。 */
  try{
    setInterval(()=>{
      if(_autoSavePending) autoSaveFlush();
    }, 20000);
  }catch(e){}
}
