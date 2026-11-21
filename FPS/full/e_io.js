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