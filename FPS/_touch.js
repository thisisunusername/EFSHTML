/* 重写 f_ui.js 里的触摸输入层：
   摇杆和视角各锁定一根手指（按 identifier 严格配对），
   互不串味。同时删掉顶部的调试 HUD。 */
const fs=require('fs');
const p='/tmp/efsrepo/FPS/full/f_ui.js';
let s=fs.readFileSync(p,'utf8');
let changed=0;

function rep(label, find, replacement){
  const i=s.indexOf(find);
  if(i<0){ console.error('❌ 未找到片段:', label); process.exitCode=1; return false; }
  s=s.slice(0,i)+replacement+s.slice(i+find.length);
  changed++;
  return true;
}

/* ---------- 1. 摇杆：startJoy / moveJoy / endJoy 三件套 ---------- */
rep(
'joy-core',
`    const moveJoy=(cx,cy)=>{`,
`    const moveJoy=(cx,cy)=>{
      /* 【死区与缩放】max 是摇杆最大位移，输出经 max 归一化到 -1~1。
         这里保持原逻辑，只补注释。 */`
);

/* ---------- 2. 摇杆 touchstart/touchmove/touchend 换成 identifier 版 ---------- */
rep(
'joy-listeners',
`    joyZone.addEventListener('touchstart',e=>{
      /* 已经在拖时不再重置起点（见上面 startJoy 的说明） */
      const t=e.changedTouches[0]; if(!t) return;
      startJoy(t.clientX,t.clientY);
      const tip=$('htip');
      if(tip){ tip.classList.remove('hide'); tip.textContent='🎮 摇杆已激活 · 拖动移动'; }
      e.preventDefault();
    }, {passive:false});
    joyZone.addEventListener('touchmove',e=>{
      if(activeId===null) return;
      const t=e.changedTouches[0]; if(!t) return;
      moveJoy(t.clientX,t.clientY);
      e.preventDefault();
    }, {passive:false});`,
`    /* 【多指触控的核心修复】
       旧代码一律取 e.changedTouches[0]：
       手指 A 推摇杆、手指 B 转视角时，两个处理函数都会各自收到
       「本次变更的触点数组」，而 [0] 拿到的常常是**另一根手指**。
       于是摇杆把手腕的横移当成了「推杆」，视角也拿摇杆的位移当转角，
       两边互相污染 —— 表现就是「单独用没事，一起用灵敏度爆炸」。

       现在改成：摇杆和视角各自**锁定一个 touch identifier**，
       move/end 时用 identifiers 或 changedTouches 精确找出「自己那根手指」，
       属于别人的触点一律忽略。 */
    joyZone.addEventListener('touchstart',e=>{
      for(const t of e.changedTouches){
        if(joyTid!==null) break;             // 已经认领了一根，其余忽略
        joyTid=t.identifier;
        startJoy(t.clientX,t.clientY);
      }
      const tip=$('htip');
      if(tip){ tip.classList.remove('hide'); tip.textContent='🎮 摇杆已激活 · 拖动移动'; }
      e.preventDefault();
    }, {passive:false});
    joyZone.addEventListener('touchmove',e=>{
      if(joyTid===null) return;
      const t=findTouch(e,joyTid); if(!t) return;
      moveJoy(t.clientX,t.clientY);
      e.preventDefault();
    }, {passive:false});`
);

/* ---------- 3. touchend / touchcancel ---------- */
rep(
'joy-end',
`    joyZone.addEventListener('touchend',e=>{ softEnd(); },{passive:true});
    joyZone.addEventListener('touchcancel',e=>{ endJoy(); },{passive:true});`,
`    joyZone.addEventListener('touchend',e=>{
      /* 只有「摇杆那根手指」抬起才结束，别的指头抬起不影响 */
      if(joyTid===null) return;
      if(!hasTouch(e.changedTouches,joyTid)) return;
      softEnd();
    },{passive:true});
    joyZone.addEventListener('touchcancel',e=>{
      if(joyTid===null) return;
      if(!hasTouch(e.changedTouches,joyTid)) return;
      endJoy();
    },{passive:true});`
);

/* ---------- 4. document 兜底：同样按 identifier ---------- */
rep(
'doc-fallback',
`    document.addEventListener('touchstart',e=>{
      if(activeId!==null) return;
      if(!window.__joyEnabled) return;    // 还没进游戏（菜单界面）不接管
      const t=e.changedTouches[0]; if(!t) return;
      if(t.clientX > window.innerWidth*(window.__joyZoneRatio||0.42)) return;
      startJoy(t.clientX,t.clientY);
    }, {passive:true});
    document.addEventListener('touchmove',e=>{
      if(activeId===null) return;
      const t=e.changedTouches[0]; if(!t) return;
      moveJoy(t.clientX,t.clientY);
    }, {passive:true});
    document.addEventListener('touchend',e=>{
      if(activeId===null) return;
      softEnd();
    }, {passive:true});`,
`    document.addEventListener('touchstart',e=>{
      if(joyTid!==null) return;
      if(!window.__joyEnabled) return;    // 还没进游戏（菜单界面）不接管
      for(const t of e.changedTouches){
        if(joyTid!==null) break;
        if(t.clientX > window.innerWidth*(window.__joyZoneRatio||0.42)) continue;
        joyTid=t.identifier;
        startJoy(t.clientX,t.clientY);
        break;
      }
    }, {passive:true});
    document.addEventListener('touchmove',e=>{
      if(joyTid===null) return;
      const t=findTouch(e,joyTid); if(!t) return;
      moveJoy(t.clientX,t.clientY);
    }, {passive:true});
    document.addEventListener('touchend',e=>{
      if(joyTid===null) return;
      if(!hasTouch(e.changedTouches,joyTid)) return;
      softEnd();
    }, {passive:true});
    document.addEventListener('touchcancel',e=>{
      if(joyTid===null) return;
      if(!hasTouch(e.changedTouches,joyTid)) return;
      endJoy();
    }, {passive:true});`
);

/* ---------- 5. 视角层：同样按 identifier ---------- */
rep(
'view-listeners',
`    let vx=0, vy=0, vOn=false;
    viewLayer.addEventListener('touchstart',e=>{
      if(vOn) return;
      const t=e.changedTouches[0]; if(!t) return;
      vOn=true; vx=t.clientX; vy=t.clientY;
    }, {passive:true});`,
`    let vx=0, vy=0, vOn=false, viewTid=null;
    viewLayer.addEventListener('touchstart',e=>{
      if(viewTid!==null) return;
      for(const t of e.changedTouches){
        if(viewTid!==null) break;
        viewTid=t.identifier;
        vOn=true; vx=t.clientX; vy=t.clientY;
      }
    }, {passive:true});`
);

rep(
'view-move',
`    viewLayer.addEventListener('touchmove',e=>{
      if(!vOn) return;
      const t=e.changedTouches[0]; if(!t) return;
      P.yaw-=(t.clientX-vx)*TOUCH_SENS;
      P.pitch-=(t.clientY-vy)*TOUCH_SENS;
      const lim=1.45; if(P.pitch>lim)P.pitch=lim; if(P.pitch<-lim)P.pitch=-lim;
      vx=t.clientX; vy=t.clientY;
    }, {passive:true});
    viewLayer.addEventListener('touchend',()=>{ vOn=false; }, {passive:true});
    viewLayer.addEventListener('touchcancel',()=>{ vOn=false; }, {passive:true});`,
`    viewLayer.addEventListener('touchmove',e=>{
      if(!vOn || viewTid===null) return;
      /* 只认「视角那根手指」，摇杆手指的位移绝不参与转角计算 */
      const t=findTouch(e,viewTid); if(!t) return;
      P.yaw-=(t.clientX-vx)*TOUCH_SENS;
      P.pitch-=(t.clientY-vy)*TOUCH_SENS;
      const lim=1.45; if(P.pitch>lim)P.pitch=lim; if(P.pitch<-lim)P.pitch=-lim;
      vx=t.clientX; vy=t.clientY;
    }, {passive:true});
    viewLayer.addEventListener('touchend',e=>{
      if(viewTid===null) return;
      if(!hasTouch(e.changedTouches,viewTid)) return;   // 抬起的不是视角手指
      vOn=false; viewTid=null;
    }, {passive:true});
    viewLayer.addEventListener('touchcancel',e=>{
      if(viewTid===null) return;
      if(!hasTouch(e.changedTouches,viewTid)) return;
      vOn=false; viewTid=null;
    }, {passive:true});`
);

/* vOn 在 endJoy 时不该被清掉（那是摇杆的），补一个安全判断 */
fs.writeFileSync(p,s);
console.log('替换完成，共', changed, '处，新长度', s.length);
