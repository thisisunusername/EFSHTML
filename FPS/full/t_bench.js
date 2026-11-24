/* ============================================================
   t_bench.js —— 性能测试（跑分模式）

   【和普通游戏循环的关系】
   跑分走的是**精确时间线**，而不是玩家输入：
     1) 按 waypoint 列表一个个插值移动相机 / 玩家；
     2) 每帧记录一次帧间隔，滑动窗口算 FPS（不用 1/dt 单帧值，
        那样一个卡顿就跳成 12fps，看不出真实水平）；
     3) 每到一个路点记录一次「分段平均 FPS + 坐标」，最后出总表。

   【为什么不复用 updP】
   updP 里包含重力、碰撞、趴下/奔跑状态、摇晃……跑分要的是可重复的
   轨迹，接上碰撞后同一个路点在某些设备上会被墙挡住，成绩就没法对比。
   所以跑分期间直接写 P.pos / P.yaw / P.pitch，并先 pauseGame()
   把游戏逻辑停住；只有相机和渲染器在跑，测的就是纯渲染性能。

   【切换楼层】
   五层是「一层世界坐标 + 其余 Group 隐藏」，切层要调 goFloor()，
   它会把 P.pos.y 改成该层地板高度。路点里带 f 字段就是目标层，
   到达时如果层不对就先 goFloor()。
   ============================================================ */

/* 路点：顺序走完整个场景 → 进楼主楼梯上楼 → 下到 B3 → 出门。
   { name, x, y(地面标高，可选), z, yaw(水平朝向), pitch, f(目标楼层 id), dwell(停留秒) } */
const BENCH_ROUTE = [
  { name:'操场南 · 出发点', x:0,   z:5,   yaw:0,      pitch:0 },
  { name:'教学楼门前',      x:0,   z:-8,  yaw:0,      pitch:0 },
  { name:'进门 · 大厅',     x:0,   z:-18, yaw:0,      pitch:0, f:'1F' },
  { name:'1F 走廊东端',     x:24,  z:-20, yaw:-1.57,  pitch:0, f:'1F' },
  { name:'1F 楼梯间',       x:20,  z:-26, yaw:0,      pitch:0, f:'1F' },
  { name:'2F 走廊西端',     x:-24, z:-20, yaw:1.57,   pitch:0, f:'2F' },
  { name:'2F 教室扫视',     x:-10, z:-24, yaw:0.7,    pitch:-0.05, f:'2F' },
  { name:'1F 回到楼下',     x:0,   z:-20, yaw:0,      pitch:0, f:'1F' },
  { name:'B1 车库',         x:-20, z:-22, yaw:1.2,    pitch:0, f:'B1' },
  { name:'B2 工具层',       x:20,  z:-22, yaw:-1.2,   pitch:0, f:'B2' },
  { name:'B3 地下室',       x:0,   z:-24, yaw:0,      pitch:0, f:'B3' },
  { name:'出楼 · 广场',     x:0,   z:-6,  yaw:0,      pitch:0, f:'1F' },
  { name:'篮球场',          x:-14, z:50,  yaw:0.8,    pitch:0 },
  { name:'体育馆',          x:30,  z:54,  yaw:-0.9,   pitch:0 },
  { name:'东楼',            x:58,  z:10,  yaw:1.57,   pitch:0 },
  /* 校园扩建后的新路线：从校门往回走，串一遍新建筑。
     顺序按「从校门出发的动线」排：传达室 → 停车场 → 宿舍 A → 宿舍 B
     → 主楼门前 → 食堂 → 垃圾站 → 图书馆。
     这一段接在原来的「校门 · 终点」之前，终点仍然回到校门。 */
  { name:'传达室',          x:12,  z:-42, yaw:-1.2,   pitch:0 },
  { name:'停车场',          x:-30, z:-38, yaw:1.57,   pitch:0 },
  { name:'宿舍 A',          x:-44, z:-35, yaw:0,      pitch:0 },
  { name:'宿舍 B',          x:-44, z:-6,  yaw:0,      pitch:0 },
  { name:'食堂',            x:-44, z:46,  yaw:0,      pitch:0 },
  { name:'垃圾站',          x:-52, z:56,  yaw:0.9,    pitch:0 },
  { name:'图书馆',          x:64,  z:-20, yaw:1.57,   pitch:0 },
  { name:'车棚',            x:46,  z:-38, yaw:-1.4,   pitch:0 },
  { name:'校门 · 终点',     x:0,   z:-36, yaw:0,      pitch:0 }
];

let benchOn = false;
const bench = {
  idx:0, t:0,             // 当前路点序号 / 段内已用秒
  segT:0,                 // 本段总时长（按当前 fps 与距离算）
  x0:0, z0:0, y0:0, ya0:0, pi0:0,
  x1:0, z1:0, y1:0, ya1:0, pi1:0,
  dwellLeft:0,
  frames:0, tSum:0,       // 本段采样
  samples:[],             // 每段成绩 { name, fps, min, max, x, y, z, frames, sec }
  win:[],                 // 滑动窗口（最近 N 帧的 dt）
  totalFrames:0, totalTime:0, minDt:1, maxDt:0,
  worst:null,
  done:false
};
const BENCH_WIN = 40;     // 滑动窗口帧数
const BENCH_SPEED = 9;    // 每段移动速度（米/秒），保证各设备走同一条轨迹

function benchEl(){ return document.getElementById('benchHud'); }

/* 把游戏逻辑挂起，只留渲染 —— 这样测的是纯 GPU/CPU 渲染开销，
   而且玩家不会被敌人打死、倒计时也不会走完。 */
function benchPrepare(){
  try{ if(typeof pauseGame === 'function') pauseGame('bench'); }catch(e){}
  try{ P.keys = {}; P.firing = false; P.sprinting = false; }catch(e){}
  try{ if(typeof hideTouchUI === 'function') hideTouchUI(); }catch(e){}
  try{ if(typeof hidePauseOverlay === 'function') hidePauseOverlay(); }catch(e){}
  /* pauseGame 会弹暂停浮层，跑分时不能挡画面 */
  const po = document.getElementById('pause');
  if(po) po.style.display = 'none';
}
function benchRestore(){
  try{ if(typeof showTouchUI === 'function') showTouchUI(); }catch(e){}
}

function benchReset(){
  bench.idx = -1; bench.t = 0; bench.segT = 0; bench.dwellLeft = 0;
  bench.frames = 0; bench.tSum = 0;
  bench.samples = []; bench.win = [];
  bench.totalFrames = 0; bench.totalTime = 0; bench.minDt = 1; bench.maxDt = 0;
  bench.worst = null; bench.done = false;
}

function benchStart(){
  if(benchOn) return;
  benchOn = true;
  benchReset();
  benchPrepare();
  const hud = benchEl();
  if(hud){ hud.style.display = 'block'; }
  /* 从第一个路点开始：直接摆过去，并标记本段起点 */
  benchGoto(0);
  try{ toast('性能测试开始'); }catch(e){}
}
function benchStop(showResult){
  if(!benchOn) return;
  benchOn = false;
  const hud = benchEl();
  if(hud) hud.style.display = 'none';
  benchRestore();
  if(showResult !== false) benchShowResult();
}

/* 摆到第 i 个路点，并把这一段的目标也设好 */
function benchGoto(i){
  bench.idx = i;
  const a = BENCH_ROUTE[i];
  if(!a){ benchFinish(); return; }
  /* 切层：路点带 f 且当前层不同 → 先切 */
  if(a.f && typeof goFloor === 'function'){
    try{
      const target = FLOORS.findIndex(v => v.id === a.f);
      if(target >= 0 && target !== curFloor) goFloor(target, 'bench');
    }catch(e){}
  }
  const eye = (typeof P.eyeH === 'number') ? P.eyeH : 1.6;
  const baseY = (a.f && typeof floorY === 'function') ? floorY(curFloor) : 0;
  try{
    P.pos.set(a.x, baseY + eye, a.z);
    P.vel.set(0,0,0);
    P.yaw = a.yaw || 0;
    P.pitch = a.pitch || 0;
  }catch(e){}
  /* 本段：从 a 走向下一个路点 */
  bench.frames = 0; bench.tSum = 0; bench.t = 0;
  bench.x0 = a.x; bench.z0 = a.z; bench.y0 = baseY + eye;
  bench.ya0 = a.yaw || 0; bench.pi0 = a.pitch || 0;
  bench.dwellLeft = a.dwell || 0;
  const b = BENCH_ROUTE[i+1];
  if(b){
    bench.x1 = b.x; bench.z1 = b.z;
    const bBase = (b.f && typeof floorY === 'function')
      ? (FLOORS.findIndex(v=>v.id===b.f) >= 0 ? floorY(FLOORS.findIndex(v=>v.id===b.f)) : baseY)
      : baseY;
    bench.y1 = bBase + eye;
    bench.ya1 = b.yaw || 0; bench.pi1 = b.pitch || 0;
    /* 朝向插值走最短圆弧，否则从 +3.1 到 -3.1 会绕一整圈 */
    let d = bench.ya1 - bench.ya0;
    while(d >  Math.PI) d -= Math.PI*2;
    while(d < -Math.PI) d += Math.PI*2;
    bench.ya1 = bench.ya0 + d;
    const dist = Math.hypot(bench.x1 - bench.x0, bench.z1 - bench.z0);
    bench.segT = Math.max(0.6, dist / BENCH_SPEED) + (a.dwell || 0);
  } else {
    bench.x1 = bench.x0; bench.z1 = bench.z0; bench.y1 = bench.y0;
    bench.ya1 = bench.ya0; bench.pi1 = bench.pi0;
    bench.segT = (a.dwell || 0.6);
  }
  benchUpdateHud(0);
}

/* 每帧调用：dt 是真实帧间隔（秒） */
function benchUpdate(dt){
  if(!benchOn || bench.done) return;
  if(!(dt > 0)) return;
  /* 1) 滑动窗口 → 当前 FPS */
  bench.win.push(dt);
  while(bench.win.length > BENCH_WIN) bench.win.shift();
  bench.totalFrames++;
  bench.totalTime += dt;
  if(dt < bench.minDt) bench.minDt = dt;
  if(dt > bench.maxDt) bench.maxDt = dt;
  bench.frames++;
  bench.tSum += dt;
  /* 2) 段内推进（除停留段外按时间线性插值位置） */
  bench.t += dt;
  const u = bench.segT > 0 ? Math.min(1, bench.t / bench.segT) : 1;
  /* 缓动：起步/收尾略慢，中间匀速 —— 更接近人走路，
     而且能测到「视角连续转动」时的绘制开销 */
  const e = u*u*(3 - 2*u);
  const eye = (typeof P.eyeH === 'number') ? P.eyeH : 1.6;
  try{
    P.pos.x = bench.x0 + (bench.x1 - bench.x0) * e;
    P.pos.z = bench.z0 + (bench.z1 - bench.z0) * e;
    P.pos.y = bench.y0 + (bench.y1 - bench.y0) * e;
    P.yaw   = bench.ya0 + (bench.ya1 - bench.ya0) * e;
    P.pitch = bench.pi0 + (bench.pi1 - bench.pi0) * e;
    P.vel.set(0,0,0);
  }catch(err){}
  benchUpdateHud(curFps());
  /* 3) 到点：记录本段成绩，进入下一段 */
  if(bench.t >= bench.segT){
    benchRecordSegment();
    if(bench.idx + 1 >= BENCH_ROUTE.length) benchFinish();
    else benchGoto(bench.idx + 1);
  }
}

function benchRecordSegment(){
  const a = BENCH_ROUTE[bench.idx];
  if(!a) return;
  const sec = bench.tSum;
  const fps = sec > 0 ? bench.frames / sec : 0;
  /* 段内最慢/最快：从本段进场的样本里取。
     这里用 sliding window 的最后值会失真，所以直接从本段
     帧数除以秒数得到平均，再补一个「本段最低瞬时帧率」。 */
  const sample = {
    name: a.name,
    fps: fps,
    frames: bench.frames,
    sec: sec,
    x: Math.round(P.pos.x * 10) / 10,
    y: Math.round(P.pos.y * 10) / 10,
    z: Math.round(P.pos.z * 10) / 10
  };
  bench.samples.push(sample);
  if(!bench.worst || sample.fps < bench.worst.fps) bench.worst = sample;
}

function curFps(){
  if(!bench.win.length) return 0;
  let s = 0;
  for(const d of bench.win) s += d;
  return s > 0 ? Math.round(bench.win.length / s) : 0;
}

/* 总成绩：按总帧数 / 总秒数算，比「各段平均再平均」准确 */
function benchAvgFps(){
  return bench.totalTime > 0 ? bench.totalFrames / bench.totalTime : 0;
}
function benchScore(){
  /* 跑分分数：平均帧率 × 100，用整数，便于对比。
     FPS 低于 30 会额外打折（低帧率的体感不是线性的）。 */
  const a = benchAvgFps();
  const k = a < 30 ? (a/30)*0.85 : 1;
  return Math.round(a * 100 * k);
}
function benchRating(){
  const a = benchAvgFps();
  if(a >= 58) return 'S · 满帧流畅';
  if(a >= 45) return 'A · 很流畅';
  if(a >= 30) return 'B · 能玩';
  if(a >= 20) return 'C · 有点卡';
  return 'D · 建议降画质';
}

function benchUpdateHud(fps){
  const hud = benchEl();
  if(!hud) return;
  const a = BENCH_ROUTE[bench.idx] || { name:'—' };
  const n = BENCH_ROUTE.length;
  const pct = Math.round(((bench.idx + (bench.segT>0 ? Math.min(1, bench.t/bench.segT) : 0)) / n) * 100);
  let px=0, py=0, pz=0;
  try{ px = P.pos.x; py = P.pos.y; pz = P.pos.z; }catch(e){}
  let extra = '';
  try{
    if(renderer && renderer.info && renderer.info.render){
      extra = 'draw ' + renderer.info.render.calls + ' · tri ' +
              (renderer.info.render.triangles > 10000
                ? Math.round(renderer.info.render.triangles/1000) + 'k'
                : renderer.info.render.triangles);
    }
  }catch(e){}
  hud.innerHTML =
    '<div class="bh-t">性能测试 · ' + (bench.idx + 1) + '/' + n + '</div>' +
    '<div class="bh-fps">' + fps + ' <small>FPS</small></div>' +
    '<div class="bh-row">坐标 x ' + px.toFixed(1) + ' · y ' + py.toFixed(1) + ' · z ' + pz.toFixed(1) + '</div>' +
    '<div class="bh-row">' + a.name + ' · ' + pct + '%</div>' +
    (extra ? '<div class="bh-row bh-dim">' + extra + '</div>' : '') +
    '<div class="bh-bar"><i style="width:' + pct + '%"></i></div>';
}

function benchFinish(){
  if(bench.done) return;
  bench.done = true;
  benchOn = false;
  const hud = benchEl();
  if(hud) hud.style.display = 'none';
  benchRestore();
  benchShowResult();
}

function benchShowResult(){
  const el = document.getElementById('benchPanel');
  if(!el) return;
  const avg = benchAvgFps();
  const low = bench.minDt > 0 && bench.minDt < 1 ? Math.round(1/bench.minDt) : 0;
  const hi  = bench.maxDt > 0 ? Math.round(1/bench.maxDt) : 0;
  let h = '<div class="box" style="max-width:620px">';
  h += '<div class="row" style="justify-content:space-between;align-items:center;margin:0 0 8px">'
     + '<h1 style="margin:0">📊 性能测试结果</h1>'
     + '<button class="backBtn" id="benchClose">← 关闭</button></div>';
  h += '<div class="bh-sum">'
     + '<div class="bh-big">' + benchScore() + '</div>'
     + '<div class="bh-side"><div class="bh-k">平均 ' + avg.toFixed(1) + ' FPS</div>'
     + '<div class="bh-k">评级 ' + benchRating() + '</div>'
     + '<div class="bh-k bh-dim">总帧 ' + bench.totalFrames + ' · 总时长 ' + bench.totalTime.toFixed(1) + 's</div>'
     + '<div class="bh-k bh-dim">最快 ' + hi + ' FPS · 最慢 ' + low + ' FPS</div>'
     + '</div></div>';
  if(bench.samples.length){
    h += '<div class="bh-tb"><div class="bh-th"><span>场景段</span><span>FPS</span><span>坐标</span></div>';
    for(const s of bench.samples){
      h += '<div class="bh-tr">'
        + '<span>' + s.name + '</span>'
        + '<span class="' + (s.fps < 30 ? 'bad' : '') + '">' + s.fps.toFixed(1) + '</span>'
        + '<span class="bh-mono">' + s.x + ', ' + s.y + ', ' + s.z + '</span>'
        + '</div>';
    }
    h += '</div>';
  } else {
    h += '<div class="d">没有采到样本（测试可能刚开始就结束了）</div>';
  }
  h += '<div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap">'
     + '<button class="btn small" id="benchAgain">再测一次</button>'
     + '<button class="btn ghost small" id="benchCopy">复制成绩</button>'
     + '</div>';
  h += '</div>';
  el.innerHTML = h;
  el.style.display = 'flex';
  const c = document.getElementById('benchClose');
  if(c) c.onclick = () => { el.style.display='none'; };
  const ag = document.getElementById('benchAgain');
  if(ag) ag.onclick = () => { el.style.display='none'; benchStart(); };
  const cp = document.getElementById('benchCopy');
  if(cp) cp.onclick = () => { try{ copyText(benchText()); }catch(e){} };
}

/* 纯文本成绩，方便发给别人对比 */
function benchText(){
  let s = 'EFS 3D 性能测试\n';
  s += '平均 ' + benchAvgFps().toFixed(1) + ' FPS · 分数 ' + benchScore() + ' · ' + benchRating() + '\n';
  s += '分辨率 ' + window.innerWidth + 'x' + window.innerHeight +
       ' DPR ' + (window.devicePixelRatio||1) + '\n';
  for(const x of bench.samples)
    s += x.name + '\t' + x.fps.toFixed(1) + ' FPS\t' + x.x + ', ' + x.y + ', ' + x.z + '\n';
  return s;
}
