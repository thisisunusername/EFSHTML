/* ==================== v_diff.js：难度系统 ====================
   需求：「主页选难度，普通、机密、绝密、超星，对应 2D 的简单、普通、困难、地狱，
   然后 2D 是加保安和限制结局，这个也限制撤离点和室内结局和老师刷新量」。

   【对应关系】2D 版 b_world.js 的 DIFF 表是：
     easy   {guards:0, tspeed:0.45, sight:5.0, see:5.0, lives:2}
     normal {guards:1, tspeed:0.62, sight:5.6, see:3.0, lives:2}
     hard   {guards:2, tspeed:0.78, sight:6.2, see:1.0, lives:2}
     hell   {guards:3, tspeed:0.95, sight:6.8, see:0,   lives:1, instant:true}
   3D 版这边名字换成塔科夫风格：
     普通 = easy / 机密 = normal / 绝密 = hard / 超星 = hell
   参数一一平移，只是 3D 是实时射击，速度那几项要按米/秒重新标定。

   【为什么 3D 不能用 2D 的 tspeed/gspeed】2D 是格子回合制，速度是
   「每回合走几格」；3D 是连续时间，必须换成米/秒。换算基准：
   玩家走路 5.2 m/s（c_player 里的 P.spd），所以「老师巡逻速度」
   按玩家速度的百分比给，手感才对得上：
     easy 45% / normal 62% / hard 78% / hell 95%

   【为什么难度要限制「撤离点数量」】2D 版的难度是「限制结局」——
   地狱才能开地下室电话结局。3D 版这边把同样的思路落到最直接的
   风险收益上：难度越高，可用撤离点越少、越偏、越贵。
   这样高难度的「多搜一个屋」的赌注才真的成立。 */

/* ---- 难度表 ---- */
const DIFFS = {
  pu: {
    id:'pu', name:'普通', tag:'EASY',
    /* 对应 2D easy */
    guards:0,                  // 保安数量（2D guards:0）
    teachers:2,                // 老师/班主任数量（室内巡逻）
    speedMul:0.45,             // 敌人移动速度倍率
    sight:5.0,                 // 视野距离（米）
    seeTime:5.0,               // 被看见多久才触发（2D see:5.0）
    lives:2,                   // 命数
    raidTime:600,              // 单局时长（秒）普通给宽裕些
    exfils:3,                  // 可用撤离点数量
    blackKey:false,            // 黑钥匙是否可出现（限制结局）
    basementEnd:false,         // 地下室结局（对应 2D 地狱限定电话结局）
    lootRich:1.0,              // 物资刷新密度倍率
    color:'#22c55e',
    desc:'保安不巡逻，老师慢。三个撤离点全开，适合熟悉地图。'
  },
  ji: {
    id:'ji', name:'机密', tag:'NORMAL',
    guards:1, teachers:3, speedMul:0.62, sight:5.6, seeTime:3.0, lives:2,
    raidTime:480, exfils:2, blackKey:true, basementEnd:false, lootRich:1.0,
    color:'#3b82f6',
    desc:'1 名保安巡逻。两个撤离点，其中一个在楼内。'
  },
  jue: {
    id:'jue', name:'绝密', tag:'HARD',
    guards:2, teachers:5, speedMul:0.78, sight:6.2, seeTime:1.0, lives:2,
    raidTime:420, exfils:1, blackKey:true, basementEnd:false, lootRich:1.15,
    color:'#f59e0b',
    desc:'2 名保安 + 5 名老师。只剩校门一个撤离点，物资更肥。'
  },
  chao: {
    id:'chao', name:'超星', tag:'HELL',
    guards:3, teachers:7, speedMul:0.95, sight:6.8, seeTime:0, lives:1,
    /* 2D hell 的 see:0 意味着「看见的瞬间就算被发现」，
       这里用 seeTime:0 + instant:true 表达同一件事。 */
    instant:true,
    raidTime:360, exfils:1, blackKey:true, basementEnd:true, lootRich:1.35,
    color:'#ef4444',
    desc:'保安 3 人、老师 7 人，被看见即死，只有一条命。地下室结局解锁。'
  }
};
const DIFF_ORDER = ['pu','ji','jue','chao'];

/* 当前难度。localStorage 记住上次选择，菜单默认高亮它。 */
const DIFF_KEY = 'efs_fps_diff_v1';
let curDiff = 'pu';

function diffLoad(){
  try{
    const v = localStorage.getItem(DIFF_KEY);
    if(v && DIFFS[v]) curDiff = v;
  }catch(e){}
  return DIFFS[curDiff];
}
function diffSave(){
  try{ localStorage.setItem(DIFF_KEY, curDiff); }catch(e){}
}
function diffGet(){
  return DIFFS[curDiff] || DIFFS.pu;
}
function diffSet(id){
  if(!DIFFS[id]) return diffGet();
  curDiff = id;
  diffSave();
  renderDiffPicker();
  return DIFFS[id];
}

/* 把难度参数应用到本局。
   【为什么要单独一个 apply 函数】难度不只影响数值，还影响
   「生成几个敌人」「开几个撤离点」，这些必须在 setupWorld 之后执行，
   否则会被 setupWorld 里的固定数量覆盖掉。 */
function diffApply(){
  const d = diffGet();
  try{
    if(typeof P === 'object'){
      P.livesMax = d.lives;
      if(typeof P.lives !== 'number' || P.lives > d.lives) P.lives = d.lives;
    }
  }catch(e){}
  /* 敌人速度：spawnEnemy 里写死 speed:2.5，这里按倍率改写。
     用 5.2（玩家步速）当基准，乘倍率就是敌人的实际米/秒。 */
  try{
    if(typeof enemies !== 'undefined' && enemies.forEach){
      for(const e of enemies){
        if(e && 'speed' in e) e.speed = 5.2 * d.speedMul;
        if(e && 'sight' in e) e.sight = d.sight;
        /* seeT 用来累加「被同一个敌人持续看见」的时间，
           累计超过 seeTime 才算被发现。超星 seeTime=0 直接判定。 */
        if(e){ e.seeT = 0; e.needSee = d.seeTime; e.instant = !!d.instant; }
      }
    }
  }catch(e){}
  return d;
}

/* ---- 撤离点：按难度决定开哪几个 ---- */
/* 候选点。索引 0 永远可用（校门，2D 版里 1F 的大门厅也是这个定位）。
   难度越高，越靠后的点被关掉 —— 也就是越「难走」的撤离点才留给高难度，
   这跟 2D「限制结局」的用意一致：给的东西越少，越要逼玩家走险路。 */
const EXFIL_SPOTS = [
  { x:0,   z:-36, name:'校门',       indoor:false },
  { x:52,  z:20,  name:'体育馆侧门', indoor:true  },
  { x:-46, z:-6,  name:'西楼后门',   indoor:false }
];
const exfilList = [];       // 本局实际启用的撤离点

function exfilBuild(){
  const d = diffGet();
  exfilList.length = 0;
  /* diff.exfils = 1 时只留索引 0；=2 时留 0,1；=3 时全留。
     但「只有一个撤离点」在高难度下太单调，所以超星额外开一个
     地下室出口（对应 2D 地狱的 EXIT），由 basementEnd 控制。 */
  const n = Math.max(1, Math.min(EXFIL_SPOTS.length, d.exfils));
  for(let i=0;i<n;i++) exfilList.push(Object.assign({}, EXFIL_SPOTS[i]));
  if(d.basementEnd){
    exfilList.push({ x:2.5, z:-22, name:'地下室 EXIT', indoor:true, basement:true });
  }
  /* 每局重建光环：旧的先拆掉，避免叠出一堆绿圈 */
  try{
    if(typeof scene !== 'undefined' && scene){
      if(window.__exfilMeshes){
        for(const m of window.__exfilMeshes) scene.remove(m);
      }
      window.__exfilMeshes = [];
      for(const s of exfilList){
        const r = new THREE.Mesh(new THREE.RingGeometry(1.4,1.9,28),
          new THREE.MeshStandardMaterial({color: s.basement?0xa855f7:0x33ff88,
            emissive: s.basement?0xa855f7:0x33ff88, emissiveIntensity:.7,
            side:THREE.DoubleSide}));
        r.rotation.x = -Math.PI/2; r.position.set(s.x, .07, s.z);
        scene.add(r); window.__exfilMeshes.push(r);
        const b = new THREE.Mesh(new THREE.CylinderGeometry(1.4,1.4,8,16,1,true),
          new THREE.MeshStandardMaterial({color: s.basement?0xa855f7:0x33ff88,
            emissive: s.basement?0xa855f7:0x33ff88, emissiveIntensity:.45,
            transparent:true, opacity:.22, side:THREE.DoubleSide}));
        b.position.set(s.x, 4, s.z);
        scene.add(b); window.__exfilMeshes.push(b);
      }
    }
  }catch(e){}
  /* 兼容旧逻辑：exfil 是 d_game.js 里 checkExfil 用的单点。
     现在有多个点，checkExfil 改走 exfilNear()，但保留 exfil
     指向第一个，避免任何还在读它的地方报错。 */
  try{ if(typeof exfil === 'object') exfil = {x:exfilList[0].x, z:exfilList[0].z}; }catch(e){}
  return exfilList;
}
/* 玩家是否站在任一撤离点范围内 */
function exfilNear(){
  try{
    if(typeof P !== 'object' || !P.pos) return null;
    for(const s of exfilList){
      const dd = Math.hypot(P.pos.x-s.x, P.pos.z-s.z);
      if(dd < 2.0) return s;
    }
  }catch(e){}
  return null;
}

/* ---- 菜单里的难度选择 UI ---- */
function renderDiffPicker(){
  const host = document.getElementById('diffPicker');
  if(!host) return;
  const cur = diffGet();
  let h = '<div class="diffhint">选择难度（本局生效，可在撤离后更换）</div><div class="diffgrid">';
  for(const id of DIFF_ORDER){
    const d = DIFFS[id];
    const on = (id===curDiff);
    h += '<button class="diffcell'+(on?' on':'')+'" data-diff="'+id+'">'
      +  '<div class="dk" style="color:'+d.color+'">'+d.name+'</div>'
      +  '<div class="dt">'+d.tag+'</div>'
      +  '<div class="dn">保安 '+d.guards+' · 老师 '+d.teachers+' · 撤离点 '+d.exfils+' · '+'命 '+d.lives+'</div>'
      + '</button>';
  }
  h += '</div>';
  h += '<div class="diffdesc" style="border-left-color:'+cur.color+'">'
     +   '<b style="color:'+cur.color+'">'+cur.name+'</b> · '+cur.desc
     + '</div>';
  host.innerHTML = h;
  host.querySelectorAll('[data-diff]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      diffSet(btn.getAttribute('data-diff'));
      try{ sfxUI(); }catch(e){}
    });
  });
}

/* 单局时长：d_game.js 的 RAID_LIMIT 现在是 let，由这里按难度改写 */
function diffRaidTime(){
  return diffGet().raidTime;
}

/* 初始化（在菜单构建之后调用一次） */
function diffInit(){
  diffLoad();
  renderDiffPicker();
}
