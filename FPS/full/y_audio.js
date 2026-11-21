/* ============ y_audio.js：Web Audio 合成音效（零素材、零依赖） ============ */
let AC=null, masterGain=null, sfxOn=true, noiseBuf=null;
const VOL={ master:0.55, shot:0.42, reload:0.3, hit:0.35, hurt:0.4, pickup:0.35, step:0.12, ui:0.25, ambient:0.16 };
/* ============================================================
   全局音量（设置面板里的滑块）
   VOL.master 是「出厂基准值」，玩家调的音量是它的百分比倍率。
   为什么要把两者分开：音效各自的相对响度（枪声比脚步响）
   是设计好的，玩家只应该整体缩放它们，不能把枪声调到比脚步小。
   所以 masterGain 的最终值 = VOL.master × masterVol。
   masterVol 存在 localStorage，跨会话保持。
   ============================================================ */
const MASTER_VOL_KEY='efs_master_vol_v1';
let masterVol=1.0;
function masterVolLoad(){
  try{
    const raw=localStorage.getItem(MASTER_VOL_KEY);
    if(raw!==null){
      const v=parseFloat(raw);
      if(isFinite(v)) masterVol=Math.max(0,Math.min(1,v));
    }
  }catch(e){}
  return masterVol;
}
function masterVolApply(){
  try{
    if(masterGain){
      /* sfxOn 是「总开关」，关掉时直接静音，与音量滑块互不干扰 */
      masterGain.gain.value = sfxOn ? (VOL.master*masterVol) : 0;
    }
  }catch(e){}
  return masterVol;
}
function masterVolSet(v){
  masterVol=Math.max(0,Math.min(1,Number(v)||0));
  try{ localStorage.setItem(MASTER_VOL_KEY, String(masterVol)); }catch(e){}
  masterVolApply();
  return masterVol;
}

function audioInit(){
  if(AC) return AC;
  try{
    AC=new (window.AudioContext||window.webkitAudioContext)();
    masterGain=AC.createGain();
    masterVolLoad();
    masterGain.gain.value=sfxOn?(VOL.master*masterVol):0;
    masterGain.connect(AC.destination);
    // 预生成 1 秒白噪声缓冲（枪声/脚步/爆炸复用）
    const len=AC.sampleRate;
    noiseBuf=AC.createBuffer(1,len,AC.sampleRate);
    const d=noiseBuf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    startAmbient();
  }catch(e){ console.warn('audio init failed',e); AC=null; }
  return AC;
}
// 移动端需要用户手势才能解锁音频
function audioResume(){ if(AC&&AC.state==='suspended') AC.resume(); }

/* ---- 基础合成器 ---- */
function tone(freq,dur,type,vol,slideTo,delay){
  if(!AC||!sfxOn) return;
  const t0=AC.currentTime+(delay||0);
  const o=AC.createOscillator(), g=AC.createGain();
  o.type=type||'sine';
  o.frequency.setValueAtTime(freq,t0);
  if(slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20,slideTo),t0+dur);
  g.gain.setValueAtTime(0,t0);
  g.gain.linearRampToValueAtTime(vol||0.3,t0+0.005);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  o.connect(g); g.connect(masterGain);
  o.start(t0); o.stop(t0+dur+0.02);
}
function noise(dur,vol,delay){
  if(!AC||!sfxOn||!noiseBuf) return;
  const t0=AC.currentTime+(delay||0);
  const s=AC.createBufferSource(); s.buffer=noiseBuf;
  const g=AC.createGain(), f=AC.createBiquadFilter();
  f.type='lowpass'; f.frequency.setValueAtTime(6000,t0);
  f.frequency.exponentialRampToValueAtTime(400,t0+dur);
  g.gain.setValueAtTime(vol||0.3,t0);
  g.gain.exponentialRampToValueAtTime(0.0001,t0+dur);
  s.connect(f); f.connect(g); g.connect(masterGain);
  s.start(t0); s.stop(t0+dur+0.02);
}

/* ---- 具体音效 ---- */
function sfxShoot(){
  if(!AC) return;
  const g=!!(P&&P.inv&&P.inv.gun);
  noise(g?0.09:0.16, VOL.shot*(g?0.75:1));
  tone(g?180:95, g?0.07:0.13, 'square', VOL.shot*0.55, g?60:35);
  tone(g?900:520, 0.03, 'sawtooth', VOL.shot*0.2, 200);
}
function sfxReload(){
  tone(420,0.05,'square',VOL.reload,300,0);
  tone(300,0.05,'square',VOL.reload*0.8,220,0.13);
  tone(520,0.06,'square',VOL.reload,380,0.28);
}
function sfxEmpty(){ tone(1100,0.04,'square',VOL.ui*0.6,700); }
function sfxHit(){ tone(1500,0.06,'sine',VOL.hit,900); noise(0.05,VOL.hit*0.5); }
function sfxHeadshot(){ tone(2200,0.05,'sine',VOL.hit*1.1,1400); tone(3000,0.08,'sine',VOL.hit*0.7,1800,0.04); }
function sfxKill(){ tone(660,0.08,'triangle',VOL.hit,880); tone(990,0.12,'triangle',VOL.hit*0.8,1320,0.07); }
function sfxHurt(){
  noise(0.2,VOL.hurt*0.7); tone(140,0.22,'sawtooth',VOL.hurt*0.5,70);
  tone(90,0.25,'sine',VOL.hurt*0.6,45);
}
function sfxPickup(){
  tone(880,0.06,'sine',VOL.pickup,1320,0);
  tone(1320,0.09,'sine',VOL.pickup*0.8,1760,0.06);
}
function sfxStep(){
  if(!AC||!sfxOn) return;
  noise(0.045, VOL.step*(0.7+Math.random()*0.6));
}
function sfxUI(){ tone(600,0.04,'square',VOL.ui,900); }
function sfxBuy(){ tone(700,0.06,'sine',VOL.ui,1050,0); tone(1050,0.1,'sine',VOL.ui*0.8,1400,0.07); }
function sfxDeny(){ tone(220,0.14,'square',VOL.ui*0.9,140); }
function sfxExfil(){
  [523,659,784,1047].forEach((f,i)=>tone(f,0.22,'sine',VOL.pickup*0.9,f*1.02,i*0.14));
}
function sfxDeath(){
  tone(300,0.5,'sawtooth',VOL.hurt,60); noise(0.6,VOL.hurt*0.6);
  tone(150,0.7,'sine',VOL.hurt*0.7,40,0.1);
}

/* ---- 环境音：低频风噪，营造氛围 ---- */
function startAmbient(){
  if(!AC||!noiseBuf) return;
  try{
    const s=AC.createBufferSource(); s.buffer=noiseBuf; s.loop=true;
    const f=AC.createBiquadFilter(); f.type='lowpass'; f.frequency.value=320;
    const g=AC.createGain(); g.gain.value=VOL.ambient;
    s.connect(f); f.connect(g); g.connect(masterGain); s.start();
  }catch(e){}
}

/* ---- 脚步节流 ---- */
let stepT=0;
function updAudio(dt){
  if(!AC||!P.alive) return;
  if(!P.onGround) return;
  const sp=Math.hypot(P.vel.x,P.vel.z);
  if(sp>1.2){
    stepT-=dt*(sp/6);
    if(stepT<=0){ sfxStep(); stepT=0.42; }
  }
}
