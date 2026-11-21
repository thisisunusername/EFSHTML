/* ==================== u_floors.js：多楼层系统 ====================
   需求：「室内要 5 个楼层（对应 2D 的 2F、1F、-1F、-2F、地下室），
   有电梯和楼梯，遵守 2D 的玩法，比如保安、老师、黑钥匙，室内相当于 2D 的 3D」。

   【2D 版的实际楼层链】../full/b_world.js 第 57 行：
     var FLOOR_CHAIN = ['2F','1F','B1','B2','B3'];
   对应关系（用户说的名字 ↔ 2D 的代号）：
     2F  = 2F         教室层
     1F  = 1F         小卖部层
     -1F = B1         地下车库层
     -2F = B2         工具房层
     地下室 = B3      最深一层，有通到校外的楼梯
   五层一栋，跟 2D 完全一致。

   【每层内容（照 2D 的 b_world.js 复制意图）】
     2F  教室 / 老师办公室 / 厕所 / 电闸室
     1F  小卖部 / 校长办公室 / 厕所×2
     B1  地下车库 / 电闸 / 校长的车 / 厕所 / 保安室
     B2  工具房 / 厕所×2 / 制作室 / 主任办公室 / 电闸
     B3  地下室两段楼梯（一段回 B2，一段通校外 = 地下室撤离点）

   【3D 的实现方式 —— 关键设计】
   不能真的把 5 层都堆在同一个世界坐标里（会互相穿插，且相机看不见别的楼
   层还照样渲染，直接掉帧）。做法是「同一栋楼、按楼层切换场景内容」：
     · 整个校园只保留一栋主楼的位置，一层的家具摆在世界坐标上；
     · 进楼/上下楼时，把当前层的家具整组显示、其他层隐藏；
     · 玩家在楼里时，y 坐标被限制在「这一层的地板到天花板」之间；
     · 每层的地板 y 按层号错开 4 米，切换楼层时把玩家平移到对应高度。
   这样既有 5 层，又不增加渲染负担，而且不需要真实的多层建筑几何。

   【为什么不直接建 5 层实体】主楼已经是 60×14×16 的实心 box，
   真拆成 5 层就是 5 套楼板 + 5 套内墙 + 电梯井，
   碰撞体和 draw call 都会翻几倍，手机上必掉帧。
   现在的做法把开销控制在一层，视觉与玩法都到位。

   【楼梯 & 电梯】
   两者都是「交互点」：靠近按 E。楼梯是走上去的（相邻层），
   电梯可以选层（跳层）。这一点跟 2D 一样 ——
   2D 里楼梯只能一层一层走，电梯（电子门）在 B1。 */

/* ---- 楼层定义 ---- */
/* 【【楼层高度必须对齐建筑实体】】——「人在天上」的最终真因
   主楼是 box(60,14,16, y=7, z=-22)，即一个【y 从 0 到 14 米的实心块】。
   但旧的 FLOORS 写的是 2F=12 / 1F=8 / B1=4 / B2=0 / B3=-4，
   这意味着：
     · 1F 家具建在 y=8，悬在楼体中间，下面 8 米全是空的
     · B2 在 y=0，和楼外操场地面重叠
     · B3 在 y=-4，整楼挖到了地下
   玩家一进楼就被抬到 1F 的 y=8（眼睛 9.6），
   从楼外看就是「人漂在半空」，而屏幕里只剩一层楼板。
   前几轮一直在改物理（兜底、出生点），但这是【建模错误】，
   物理再对也不行：人确实而且应该站在地板上，
   只是那块地板本身就悬在 8 米高空。

   现在按【真实建筑层高】重排，层高 FLOOR_H=3.4，
   且让 1F 贴地 y=0（人从操场走进门口就是 1F，脚不用离地）：
     2F = 3.4   → 眼睛 5.0
     1F = 0     → 眻睛 1.6（和楼外操场完全同高，进门不会被抬）
     B1 = -3.4
     B2 = -6.8
     B3 = -10.2
   这样从楼外往楼里走，人的 y 几乎不变，上楼才上升、下楼才下降，
   完全符合直觉；地下层从实心楼体下方挖出去，不会和楼体打架。
   【待确认】地下层在楼体下方，外面看不到，因为 setFloorVisible()
   只在 inBuilding 时显示当前层，楼外全隐藏。 */
const FLOORS = [
  { id:'2F',  name:'2F 教室层',   y:  3.4, order:0, desc:'教室 / 老师办公室 / 厕所 / 电闸室' },
  { id:'1F',  name:'1F 小卖部层', y:  0.0, order:1, desc:'小卖部 / 校长办公室 / 厕所' },
  { id:'B1',  name:'-1F 车库层',  y: -3.4, order:2, desc:'地下车库 / 校长的车 / 保安室' },
  { id:'B2',  name:'-2F 工具层',  y: -6.8, order:3, desc:'工具房 / 制作室 / 主任办公室' },
  { id:'B3',  name:'地下室',      y:-10.2, order:4, desc:'通到校外的楼梯（撤离点）' }
];
/* 每层层高（米）。地板到天花板 3.4，留 0.6 给楼板厚度感。 */
const FLOOR_H = 3.4;

let curFloor = 1;              // 当前楼层索引（默认 1F = 1）
let floorGroups = [];          // 每层的 THREE.Group，切换时显隐
let inBuilding = false;        // 玩家是否在楼里

function floorByOrder(o){ return FLOORS[Math.max(0,Math.min(FLOORS.length-1,o))]; }
function floorGet(){ return FLOORS[curFloor] || FLOORS[1]; }
function floorY(i){ return (FLOORS[i]||FLOORS[1]).y; }

/* ---- 建一层的内部：把 buildInterior 的内容按层参数化 ---- */
/* 【复用主楼一层的布局】主楼原有一层的课桌/讲台/黑板/柜子布局是
   buildInterior() 里写的。这里不重复一份，而是用不同的「风格」
   在同一块地面区域上生成不同家具，做到 5 层可区分。 */
/* ================= 2D 地图 1:1 搬过来 =================
   【为什么需要这个】3D 的室内之前是"一个大空盒子 + 点缀几件家具"，
   玩家进去只看到一堆课桌椅，没有房间、没有走廊、没有楼梯，
   跟 2D 完全是两个游戏。用户要求 1:1 还原 2D。
   2D 的地图本质是「格子墙」：g[y][x] === 1 是墙，0 是空地，
   房间和走廊都是 carve() 从实心墙里挖出来的。
   所以这里把 carving 指令原样粘过来，在 3D 里重新挖一遍，
   再按格子生成墙体 —— 这样房间大小、走廊宽度、门洞位置
   全部与 2D 一致，不需要手摆。
   坐标映射：1 格 = 1 米。
     格子中心 (ix+0.5, iy+0.5)  ->  世界 (X0 + ix + 0.5, Z0 + iy + 0.5)
   2D 的 y 轴（往下为 +y）对应 3D 的 -z（往楼里为负），
   所以 iy 越大越靠近楼的后墙。 */
function gridNew(w,h){ const g=[]; for(let y=0;y<h;y++){ const r=[]; for(let x=0;x<w;x++) r.push(1); g.push(r);} return g; }
function gridCarve(g,x0,y0,x1,y1){ for(let y=y0;y<=y1;y++){ if(!g[y]) continue; for(let x=x0;x<=x1;x++){ if(g[y][x]!==undefined) g[y][x]=0; } } }
function gridWall(g,x0,y0,x1,y1){ for(let y=y0;y<=y1;y++){ if(!g[y]) continue; for(let x=x0;x<=x1;x++){ if(g[y][x]!==undefined) g[y][x]=1; } } }

/* 每层的格子地图 + 房间名 + 对象（楼梯/门/物品/监控）。
   数据逐条对应 full/b_world.js 里的 W[...]，改 2D 地图时要同步改这里。 */
const GRID_MAPS = (function(){
  const M = {};
  /* ---------- 2F 教室层（42 x 16） ---------- */
  (function(){
    const w=42,h=16,g=gridNew(w,h);
    gridCarve(g,1,1,7,5);    gridCarve(g,4,6,4,6);
    gridCarve(g,9,1,14,5);   gridCarve(g,11,6,11,6);
    gridCarve(g,16,1,20,5);  gridCarve(g,18,6,18,6);
    gridCarve(g,22,1,27,5);  gridCarve(g,24,6,24,6);
    gridCarve(g,29,1,34,5);  gridCarve(g,31,6,31,6);
    gridCarve(g,36,1,42,5);  gridCarve(g,39,6,39,6);
    gridCarve(g,1,7,42,8);
    gridCarve(g,1,10,8,16);  gridCarve(g,4,9,4,9);
    gridCarve(g,11,10,16,16);gridCarve(g,13,9,13,9);
    gridCarve(g,19,10,24,16);gridCarve(g,21,9,21,9);
    gridCarve(g,26,10,30,16);gridCarve(g,28,9,28,9);
    gridCarve(g,32,10,36,16);gridCarve(g,34,9,34,9);
    gridCarve(g,38,10,42,16);gridCarve(g,40,9,40,9);
    M["2F"]={ w:w, h:h, g:g, rooms:[
      {name:"教室",       x0:1, y0:1,  x1:7,  y1:5,  style:"class"},
      {name:"老师办公室", x0:9, y0:1,  x1:14, y1:5,  style:"office"},
      {name:"厕所",       x0:16,y0:1,  x1:20, y1:5,  style:"toilet"},
      {name:"电闸室",     x0:22,y0:1,  x1:27, y1:5,  style:"utility"},
      {name:"体育馆前厅", x0:29,y0:1,  x1:34, y1:5,  style:"gym"},
      {name:"器材室",     x0:36,y0:1,  x1:42, y1:5,  style:"utility"},
      {name:"走廊",       x0:1, y0:7,  x1:42, y1:8,  style:"corridor"},
      {name:"大门厅",     x0:1, y0:10, x1:8,  y1:16, style:"hall"},
      {name:"楼梯间",     x0:11,y0:10, x1:16, y1:16, style:"stairs"},
      {name:"空教室",     x0:19,y0:10, x1:24, y1:16, style:"class"},
      {name:"图书角",     x0:26,y0:10, x1:30, y1:16, style:"library"},
      {name:"体育馆",     x0:32,y0:10, x1:36, y1:16, style:"gym"},
      {name:"器材间",     x0:38,y0:10, x1:42, y1:16, style:"utility"}
    ],
    objs:[
      {t:"item", x:12.5, y:2.5, id:"flag"},
      {t:"switch", x:25.5, y:2.5, id:"sw1", label:T("二层电闸")},
      {t:"camera", x:2.5, y:12.5, dir:0, range:4.0},
      {t:"gate", x:4.5, y:16.5, kind:"main", label:T("大门")},
      {t:"stairs", x:13.5, y:13.5, to:"1F"},
      {t:"item", x:40.5, y:3.5, id:"torch"},
      {t:"item", x:34.5, y:13.5, id:"cola"}
    ]};
  })();
  /* ---------- 1F 小卖部层（32 x 18） ---------- */
  (function(){
    const w=32,h=18,g=gridNew(w,h);
    gridCarve(g,1,1,7,5);     gridCarve(g,4,6,4,6);
    gridCarve(g,9,1,15,5);
    gridCarve(g,17,1,20,5);   gridCarve(g,18,6,18,6);
    gridCarve(g,22,1,25,5);   gridCarve(g,23,6,23,6);
    gridCarve(g,1,7,30,8);
    gridCarve(g,1,10,7,16);   gridCarve(g,3,9,3,9);
    gridCarve(g,9,10,15,16);  gridCarve(g,12,9,12,9);
    gridCarve(g,17,10,22,16); gridCarve(g,19,9,19,9);
    gridCarve(g,24,10,30,16); gridCarve(g,27,9,27,9);
    M["1F"]={ w:w, h:h, g:g, rooms:[
      {name:"小卖部",     x0:1, y0:1,  x1:7,  y1:5,  style:"shop"},
      {name:"校长办公室", x0:9, y0:1,  x1:15, y1:5,  style:"office"},
      {name:"厕所",       x0:17,y0:1,  x1:20, y1:5,  style:"toilet"},
      {name:"厕所",       x0:22,y0:1,  x1:25, y1:5,  style:"toilet"},
      {name:"走廊",       x0:1, y0:7,  x1:30, y1:8,  style:"corridor"},
      {name:"楼梯间",     x0:1, y0:10, x1:7,  y1:16, style:"stairs"},
      {name:"侧门区",     x0:9, y0:10, x1:15, y1:16, style:"hall"},
      {name:"门厅",       x0:17,y0:10, x1:22, y1:16, style:"hall"},
      {name:"杂物间",     x0:24,y0:10, x1:30, y1:16, style:"utility"}
    ],
    objs:[
      {t:"shop",   x:4.5, y:3.5},
      {t:"tree",   x:6.5, y:3.5},
      {t:"camera", x:8.5, y:7.5, dir:Math.PI, range:4.0},
      {t:"gate",   x:12.5, y:6.5, kind:"office", label:T("校长办公室门")},
      {t:"item",   x:12.5, y:3.5, id:"redkey"},
      {t:"gate",   x:12.5, y:16.5, kind:"side", label:T("侧门")},
      {t:"stairs", x:3.5, y:12.5, to:"2F"},
      {t:"stairs", x:6.5, y:15.5, to:"B1"}
    ]};
  })();

  /* ---------- B1 地下车库层（30 x 18） ---------- */
  (function(){
    const w=30,h=18,g=gridNew(w,h);
    gridCarve(g,1,1,6,6);     gridCarve(g,3,7,4,7);
    gridCarve(g,8,1,12,5);    gridCarve(g,10,6,11,7);
    gridCarve(g,14,1,18,5);   gridCarve(g,16,6,17,7);
    gridCarve(g,20,1,25,5);   gridCarve(g,22,6,23,7);
    gridCarve(g,1,8,28,9);
    gridCarve(g,1,11,14,16);  gridCarve(g,4,10,5,10);
    gridCarve(g,17,11,19,16); gridCarve(g,15,13,16,13);
    gridCarve(g,21,11,24,16);
    gridCarve(g,26,11,28,16);
    M["B1"]={ w:w, h:h, g:g, rooms:[
      {name:"楼梯间",     x0:1, y0:1,  x1:6,  y1:6,  style:"stairs"},
      {name:"保安室",     x0:8, y0:1,  x1:12, y1:5,  style:"office"},
      {name:"厕所",       x0:14,y0:1,  x1:18, y1:5,  style:"toilet"},
      {name:"电闸室",     x0:20,y0:1,  x1:25, y1:5,  style:"utility"},
      {name:"走廊",       x0:1, y0:8,  x1:28, y1:9,  style:"corridor"},
      {name:"车库",       x0:1, y0:11, x1:14, y1:16, style:"garage"},
      {name:"电子门通道", x0:17,y0:11, x1:19, y1:16, style:"corridor"},
      {name:"墙后通道",   x0:21,y0:11, x1:24, y1:16, style:"corridor"}
    ],
    objs:[
      {t:"stairs", x:3.5, y:3.5, to:"1F"},
      {t:"stairs", x:1.5, y:5.5, to:"B2"},
      {t:"cctv",   x:10.5,y:2.5},
      {t:"switch", x:22.5,y:2.5, id:"sw2", label:T("三层电闸")},
      {t:"camera", x:10.5,y:8.5, dir:0, range:3.5},
      {t:"camera", x:20.5,y:8.5, dir:Math.PI, range:3.5},
      {t:"car",    x:7.5, y:13.5},
      {t:"gate",   x:20.5,y:13.5, kind:"elec", label:T("电子门")},
      {t:"gate",   x:25.5,y:13.5, kind:"wall", label:T("砖墙")}
    ]};
  })();

  /* ---------- B2 工具层（30 x 18） ---------- */
  (function(){
    const w=30,h=18,g=gridNew(w,h);
    gridCarve(g,1,1,6,6);     gridCarve(g,3,7,4,7);
    gridCarve(g,8,1,12,5);    gridCarve(g,10,6,11,7);
    gridCarve(g,14,1,19,5);   gridCarve(g,16,6,17,7);
    gridCarve(g,21,1,24,5);   gridCarve(g,22,6,23,7);
    gridCarve(g,26,1,28,5);   gridCarve(g,27,6,28,7);
    gridCarve(g,1,8,28,9);
    gridCarve(g,1,11,7,16);   gridCarve(g,4,10,4,10);
    gridCarve(g,9,11,13,16);  gridCarve(g,11,10,11,10);
    gridCarve(g,15,11,20,16); gridCarve(g,17,10,17,10);
    gridCarve(g,22,11,27,16); gridCarve(g,24,10,24,10);
    M["B2"]={ w:w, h:h, g:g, rooms:[
      {name:"楼梯间",     x0:1, y0:1,  x1:6,  y1:6,  style:"stairs"},
      {name:"工具房",     x0:8, y0:1,  x1:12, y1:5,  style:"utility"},
      {name:"主任办公室", x0:14,y0:1,  x1:19, y1:5,  style:"office"},
      {name:"厕所",       x0:21,y0:1,  x1:24, y1:5,  style:"toilet"},
      {name:"厕所",       x0:26,y0:1,  x1:28, y1:5,  style:"toilet"},
      {name:"走廊",       x0:1, y0:8,  x1:28, y1:9,  style:"corridor"},
      {name:"制作室",     x0:1, y0:11, x1:7,  y1:16, style:"craft"},
      {name:"电闸室",     x0:9, y0:11, x1:13, y1:16, style:"utility"},
      {name:"地下室门厅", x0:15,y0:11, x1:20, y1:16, style:"hall"},
      {name:"库房",       x0:22,y0:11, x1:27, y1:16, style:"utility"}
    ],
    objs:[
      {t:"stairs", x:3.5, y:3.5, to:"B1"},
      {t:"item",   x:9.5, y:2.5, id:"saw"},
      {t:"item",   x:10.5,y:4.5, id:"hammer"},
      {t:"camera", x:16.5,y:2.5, dir:Math.PI/2, range:3.5},
      {t:"item",   x:17.5,y:4.5, id:"blueprint"},
      {t:"switch", x:11.5,y:13.5, id:"sw3", label:T("四层电闸")},
      {t:"craft",  x:4.5, y:13.5},
      {t:"gate",   x:17.5,y:13.5, kind:"basement", label:T("地下室门")}
    ]};
  })();

  /* ---------- B3 地下室（26 x 16） ---------- */
  (function(){
    const w=26,h=16,g=gridNew(w,h);
    gridCarve(g,1,1,23,13);
    gridWall(g,9,5,11,7);
    gridWall(g,15,5,17,7);
    gridWall(g,9,10,11,11);
    M["B3"]={ w:w, h:h, g:g, rooms:[
      {name:"地下室", x0:1, y0:1, x1:23, y1:13, style:"basement"}
    ],
    objs:[
      {t:"stairs",  x:3.5, y:3.5, to:"B2"},
      {t:"stairWin",x:21.5,y:2.5}
    ]};
  })();
  return M;
})();

/* 把一整层格子地图生成 3D 墙体：
   相邻的墙格合并成一整块（否则 42x16 会生成几百个 1 米小盒子，
   手机直接卡死），水平方向按最长连续段合并。 */
function buildGridWalls(m, y, g, wallColor, doorAt){
  /* doorAt: {gx, gw} 指定在最后一行（南墙）上开口的格子位置，
     用来和主楼正门门洞（世界 x=0 附近）对齐。
     不加这一步的话，格子地图的外墙是封闭的 ——
     玩家虽然从主楼门洞进了楼，却会被自己家里的外墙挡在外面。 */
  const X0 = -(m.w)/2, Z0 = Z_BASE - (m.h - 1);   /* 格(ix,0) 左上角世界坐标：x 居中，z 从南端往回推 */
  const WT=0.30;          /* 墙厚 30cm */
  const WH=FLOOR_H-0.1;   /* 墙高：略低于天花板，留缝给顶灯 */
  const col = wallColor || 0xd8d2c4;
  /* 【只建主楼范围内的墙】各层地图进深不同（16 或 18 格），
     18 格的那三层北端会达 z=-31，比主楼北墙（z=-30）多出 1 米。
     那 1 米在主楼外面，玩家永远走不到，建出来只会是一排悬空的墙。
     所以这里按世界 z 过滤：超出 -30 的行直接跳过。 */
  for(let iy=0; iy<m.h; iy++){
    const rowZ = Z_BASE - (m.h - 1 - iy);      /* 这一行所在的世界 z */
    if(rowZ < -30) continue;                    /* 超出主楼北墙，不建 */
    /* 【门洞判定必须做成函数，并在两处都调用】
       上一版的 bug：只在「起点格」判断门洞，而合并循环
       while(j+1<m.w && m.g[iy][j+1]===1) j++ 会一路吞并到行尾，
       结果 1F 南墙（整行 32 格全实心）被合成一根 32 米长的墙段，
       doorAt 跳过的 4 格被包在里面 —— 门口依然是一堵墙。 */
    const isDoorGap = function(gx){
      if(!doorAt || iy !== m.h-1) return false;
      const halfG = (doorAt.gw||4)/2;
      return gx >= doorAt.gx-halfG && gx < doorAt.gx+halfG;
    };
    let ix=0;
    while(ix<m.w){
      if(isDoorGap(ix)){ ix++; continue; }
      if(m.g[iy][ix]!==1){ ix++; continue; }
      /* 往右合并连续墙格 —— 遇到门洞格必须断开 */
      let j=ix;
      while(j+1<m.w && m.g[iy][j+1]===1 && !isDoorGap(j+1)) j++;
      const len = j-ix+1;
      const cx = X0 + ix + len/2;
      const cz = Z0 + iy + 0.5;
      box(len, WH, WT, col, cx, y+WH/2, cz, false);
      ix = j+1;
    }
  }
}

/* 格子坐标 -> 世界坐标 */
/* 格子坐标 -> 世界坐标。
   【必须每层各自居中】主楼 x 范围是 -30..30（宽 60 米），
   而各层地图宽度不同（2F 42 格 / 1F 32 格 / B1B2 30 格 / B3 26 格）。
   如果都从 x=-29 开始排，地图会贴在楼左半边，右边空一大块。
   所以按各自宽度算居中偏移；z 方向统一从楼后墙 -29 开始往前排。 */
/* 【各层按自身宽度居中】2F 42x16、1F 32x18、B1/B2 30x18、B3 26x16。
   曾经试过「全部按最宽层 42 格左对齐」，但那会让窄层整体贴在楼体西北角
   （1F 只覆盖 x -21..11，东侧空出 10 米），门洞也对不上主楼正中。
   2D 原版就是每层自己铺满、各自居中的，所以这里保持 -(m.w)/2。
   换层时楼梯 x 会有位移，这是 2D 也有的正常现象（每层楼梯间位置本来就不同），
   玩家换层后人出现在目标层自己的楼梯间里。 */
function gridOriginX(m){ return -(m && typeof m.w === 'number' ? m.w : 32)/2; }
/* 【为什么不传 m 也不会崩】
   这个函数有二类调用点：
     ① 明确知道要换算哪一层：gridToWorld(gx, gy, gm)
     ② 在 buildFloorContent 里手写玩法物件坐标：gridToWorld(7.5, 13.5)
   ②原来没传 m，而 gridOriginX(m) 会直读 m.w，于是
   “Cannot read properties of undefined (reading 'w')” —— 整个 init 挂掉、画面全黑。
   这里做容错：不传 m 时取「当前正在构建/所在的那一层」的地图。 */
/* 【Z_BASE 为什么是 -14】
   主楼是一个 box(60,14,16, y=7, z=-22)，也就是 z 从 -30 到 -14。
   carveMainDoor() 在正南面（z=-14）开出 4.4 米宽门洞，
   玩家是从 z=-14 这一面走进去的。
   但各层格子地图进深不同：2F/B3 是 16 格，1F/B1/B2 是 18 格。
   如果简单用「z = -29 + gy」，南墙就分别落在 -13 / -11 ——
   都比门洞的 -14 更靠里 1~3 米，于是玩家一进门先撞上格子外墙，
   而且五层的南墙在 z=-13、-11 各叠两堵，看起来就是「门口一堆墙」。
   现在统一：每层地图的南边最后一格对齐到 z=-14，楼体向北长。
   这样各层南墙共面、都贴着门洞，进门直接进走廊。 */
const Z_BASE = -14;   /* 各层地图南端（最后一行）所在的世界 z */
function gridToWorld(gx, gy, m){
  let mm = m;
  if(!mm){
    /* 优先用模块内的 curFloor；构建期间 curFloor 可能还没就位，
       再退化到 1F（地图一定存在）。 */
    mm = (GRID_MAPS && GRID_MAPS[FLOORS[curFloor] ? FLOORS[curFloor].id : '1F'])
      || (GRID_MAPS && GRID_MAPS['1F'])
      || null;
  }
  if(!mm || typeof mm.w !== 'number'){
    /* 最后的兜底：用 1F 的宽度（32）居中，返回一个合法坐标，绝不抛错 */
    return { x: -(32)/2 + gx, z: Z_BASE - (17 - gy) };
  }
  return { x: gridOriginX(mm) + gx, z: Z_BASE - (mm.h - 1 - gy) };
}
/* gridOriginX 也加保护，防止别处直接传 undefined */

/* 按房间 style 放家具。每个房间用自己的中心点，避免互相穿插。
   corridor / hall / stairs 不放家具，保证通行。 */
function buildRoomsFurniture(m, y, g, depth){
  for(const r of m.rooms){
    const OX = gridOriginX(m);
    const cx = OX + (r.x0 + r.x1)/2 + 0.5;
    const cz = Z_BASE - (m.h - 1) + (r.y0 + r.y1)/2 + 0.5;
    const rw = r.x1 - r.x0 + 1, rd = r.y1 - r.y0 + 1;
    if(rw < 3 || rd < 3) continue;
    switch(r.style){
      case 'class': {
        const rows = Math.min(3, Math.max(1, Math.floor((rd-2)/1.6)));
        const cols = Math.min(4, Math.max(1, Math.floor((rw-2)/1.9)));
        for(let a=0;a<rows;a++){
          for(let b=0;b<cols;b++){
            const dx = cx - (cols-1)*0.95 + b*1.9;
            const dz = cz - 0.8 + a*1.6;
            box(1.1,.07,.7, 0x9a7b52, dx, y+.75, dz, true);
            box(.07,.72,.07, 0x8a6a45, dx-.45, y+.36, dz-.28, true);
            box(.07,.72,.07, 0x8a6a45, dx+.45, y+.36, dz-.28, true);
            box(.42,.05,.42, 0x7a6a52, dx, y+.44, dz+0.62, true);
          }
        }
        box(2.0,.85,.7, 0x8a6a45, cx, y+.43, (-29+r.y0)+0.9, true);
        box(Math.min(rw-1,5),1.6,.08, 0x2f4a3a, cx, y+1.5, (-29+r.y0)+0.2, true);
        break; }
      case 'office': {
        box(1.8,.78,.9, 0x8a6a45, cx, y+.39, cz, true);
        box(.5,.9,.5, 0x6a5a48, cx, y+.45, cz+1.0, true);
        box(.4,1.9,.9, 0x7a6a52, -29+r.x0+0.7, y+.95, cz, true);
        break; }
      case 'toilet': {
        box(.08,1.9,Math.min(1.8,rd-1), 0xcfd6dd, cx-0.9, y+.95, cz, true);
        box(1.2,.15,.5, 0xe8eef4, cx+0.6, y+.85, (-29+r.y0)+0.7, true);
        break; }
      case 'utility': {
        box(Math.min(rw-2,2.6),1.9,.45, 0x7a6a8a, cx, y+.95, (-29+r.y0)+0.6, true);
        box(.7,.7,.7, 0x8a7a62, cx-0.9, y+.35, cz+0.8, true);
        break; }
      case 'gym': {
        box(.2,3.0,.2, 0x9aa0a8, cx, y+1.5, (-29+r.y0)+0.5, true);
        box(.9,.06,.9, 0xff8a3a, cx, y+2.9, (-29+r.y0)+0.9, true);
        break; }
      case 'library': {
        box(Math.min(rw-2,3.0),2.0,.4, 0x7a5c3a, cx, y+1.0, (-29+r.y0)+0.5, true);
        box(1.2,.45,.6, 0x9a7b52, cx, y+.22, cz, true);
        break; }
      case 'garage': {
        for(let i=0;i<4;i++) box(2.6,.02,.1, 0xe8e8e8, cx-3+i*2, y+.02, cz, true);
        break; }
      case 'craft': {
        box(2.4,.9,.8, 0x8a6a45, cx, y+.45, cz, true);
        box(2.4,.06,.1, 0x9fb3c8, cx, y+1.6, (-29+r.y0)+0.3, true);
        break; }
      case 'shop': {
        box(Math.min(rw-2,3.0),1.9,.5, 0x7a6a8a, cx, y+.95, (-29+r.y0)+0.6, true);
        box(2.0,.9,.7, 0x9a7b52, cx, y+.45, cz+0.9, true);
        break; }
      case 'basement': {
        box(3.0,1.2,1.0, 0x6a6a6a, cx-4, y+.6, cz-2, true);
        box(2.0,1.4,2.0, 0x6a6a6a, cx+5, y+.7, cz+2, true);
        break; }
      default: break;
    }
  }
}

/* 按 objs 里的 stairs 生成楼梯实体：4 级台阶 + 两侧扶手。
   玩家能真的踩上去，这就是 2D 里那个 stairs 对象的 3D 版。 */
function buildGridStairs(m, y, g, depth){
  if(!m.objs) return;
  for(const o of m.objs){
    if(o.t !== 'stairs') continue;
    const p = gridToWorld(o.x, o.y);
    const dirZ = -1;
    for(let i=0;i<4;i++){
      box(1.6,.18,.55, 0x8f8f8f, p.x, y+.09+i*0.18, p.z - dirZ*i*0.55, true);
    }
    box(.08,.95,.08, 0xa8a8a8, p.x-0.85, y+.48, p.z, false);
    box(.08,.95,.08, 0xa8a8a8, p.x+0.85, y+.48, p.z, false);
  }
}

function buildFloorContent(fi, g){
  const f = FLOORS[fi];
  const y = f.y;
  /* 内部可用范围：与主楼一层一致（x -29..29，z -29..-15） */
  const X0=-29, X1=29, Z0=-29, Z1=-15;
  /* 地板 & 天花板：每层都铺，颜色随深度变暗 ——
     越往地下越暗，这是玩家判断「我现在多深」最直接的视觉线索。 */
  const depth = fi;                      // 0=2F, 4=B3
  const floorC = [0xc8c2b4, 0xb9b3a6, 0xa8a296, 0x93907f, 0x7d7a6b][depth] || 0xb9b3a6;
  const ceilC  = [0xe0dacc, 0xd6d0c2, 0xc4bdb0, 0xaea89b, 0x96907f][depth] || 0xd6d0c2;
  const bx = (w,h,d,c,px,py,pz,col)=>box(w,h,d,c,px,y+py,pz,col===undefined?true:col);

  bx(X1-X0, .1, Z1-Z0, floorC, (X0+X1)/2, -0.05, (Z0+Z1)/2, true);
  bx(X1-X0, .12, Z1-Z0, ceilC, (X0+X1)/2, FLOOR_H, (Z0+Z1)/2, true);

  /* 顶灯：2F 亮、越往下越少（地下层的压迫感） */
  const lampN = [4,4,3,2,1][depth] || 2;
  for(let i=0;i<lampN;i++){
    const lx = -21 + i*(42/Math.max(1,lampN-1));
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.6,.08,.4),
      new THREE.MeshStandardMaterial({color:0xffffff,
        emissive: depth>=3?0xffd9a0:0xfff4d6,
        emissiveIntensity: depth>=3?0.7:1.1}));
    lamp.position.set(lx, y+FLOOR_H-0.12, -22);
    g.add(lamp);
    /* 地下层加一盏真的点光源，否则进去全黑 */
    if(depth>=2 && i===Math.floor(lampN/2)){
      const pl=new THREE.PointLight(depth>=3?0xffd9a0:0xfff0cc, 1.2, 20, 2);
      pl.position.set(lx, y+FLOOR_H-0.3, -22);
      g.add(pl);
    }
  }

  /* ================= 按 2D 格子地图建墙 ================= */
  /* 【这才是 1:1 还原 2D 的关键】
     以前这一段只摆家具，玩家进去看到一整个大空盒子 ——
     没有房间、没有走廊、没有楼梯，全是椅子。
     现在先按 GRID_MAPS 的格子（1=墙 0=空地）生成墙体，
     房间和走廊就是这些墙围出来的，门洞也是 carve 留的，
     与 2D 的 b_world.js 完全同构。 */
  const gm = GRID_MAPS[f.id];
  if(gm){
    const wallC = [0xe8e2d4, 0xded7c6, 0xcfc7b4, 0xb8b09c, 0x9a927f][depth] || 0xded7c6;
    /* 南门位置换算：主楼门洞在世界 x≈0，
       对应格子 = 世界x - (格子原点x)，即 0 - (-m.w/2) = m.w/2。 */
    const doorGX = Math.round(gm.w/2);
    /* 【每一层南墙都要开门】
       原来只有 1F/2F 开门，B1/B2/B3 是封闭的 ——
       但玩家在 B1 从楼梯下来后，想出去也会撞到那面南墙。
       各层地图南端现在统一贴 z=Z_BASE(-14)，也就是主楼门洞那条线，
       所以所有层都在同一位置开一个 4 格宽的口子，与主楼门洞对齐。 */
    buildGridWalls(gm, y, g, wallC, {gx:doorGX, gw:4});
    buildRoomsFurniture(gm, y, g, depth);
    buildGridStairs(gm, y, g, depth);
  }

/* ---- 按层补充“玩法必需的实体” ----
     【改动说明】以前这一段是「每层家具有哪些」的唯一来源，
     家具位置是手写的，和 3D 大厅（一个空盒子）对得上，
     但和 2D 的真实房间布局完全无关 —— 这就是“进去全是椅子、
     没有房间没有楼梯”的来源。
     现在房间家具由 buildRoomsFurniture() 按 GRID_MAPS 生成，
     这里只保留那些“不是家具、而是玩法物件”的东西：
       校长的车（砸车成就）、地下室撤离出口、容器点位。
     坐标一律用 gridToWorld 从 2D 的格子坐标换算，不再手写。 */
  const OBJ_Y = y;    /* 本层地板高度 */
  if(f.id==='B1'){
    /* 校长的车：2D 里在 B1 车库 (7.5, 13.5) 格 */
    const car = gridToWorld(7.5, 13.5, gm);
    box(2.0,.9,4.0, 0x2a3a5a, car.x, OBJ_Y+.55, car.z, false);   // 车身
    box(1.8,.7,2.0, 0x33456a, car.x, OBJ_Y+1.35, car.z, false);  // 车顶
    box(.25,.25,.25, 0xfff0cc, car.x-0.9, OBJ_Y+.9, car.z-1.6, true); // 车灯
  }
  if(f.id==='B3'){
    /* 通到校外的撤离出口：2D 里 stairWin 在 (21.5, 2.5) 格 */
    const ex = gridToWorld(21.5, 2.5, gm);
    box(2.0,1.2,2.0, 0x6a6a6a, ex.x, OBJ_Y+.6, ex.z, false);      // 出口台
    const exitLamp=new THREE.Mesh(new THREE.BoxGeometry(.8,.1,.8),
      new THREE.MeshStandardMaterial({color:0x33ff88,emissive:0x33ff88,emissiveIntensity:1.4}));
    exitLamp.position.set(ex.x, OBJ_Y+FLOOR_H-0.5, ex.z);
    g.add(exitLamp);
  }
  /* 容器点位：放在走廊两端（走廊是通的，不会堵门） */
  if(gm){
    const c1 = gridToWorld(2.5, 7.5, gm);
    box(1.0,1.6,.6, 0x6a7a8a, c1.x, OBJ_Y+.8, c1.z, false);
    const c2 = gridToWorld(gm.w-3.5, 7.5, gm);
    box(1.0,1.6,.6, 0x6a7a8a, c2.x, OBJ_Y+.8, c2.z, false);
  }
}

/* 【为什么声明要放在这么前面】
   STAIR_SPOTS 是用 let 声明的。let/const 有“暂时性死区”：
   在声明语句真正执行之前访问它，会直接抛
   “Cannot access 'STAIR_SPOTS' before initialization”，
   而不是像 var 那样给个 undefined。
   而 buildFloors() 在初始化时就会调 rebuildStairSpots() 往里 push，
   如果声明写在 buildFloors 后面，初始化阶段就会崩 ——
   外面包着 try/catch 变成 “init failed”，表现就是整屏全黑。
   所以这里提前声明，声明时不依赖任何外部值，安全。 */
let STAIR_SPOTS = [];
/* ---- 构建全部楼层（隐藏的层不加入场景渲染） ---- */
function buildFloors(){
  /* 先清掉旧的分组（重开一局时会再调一次） */
  if(floorGroups && floorGroups.length){
    for(const g of floorGroups){ try{ scene.remove(g); }catch(e){} }
  }
  floorGroups = [];
  for(let i=0;i<FLOORS.length;i++){
    const g = new THREE.Group();
    g.visible = false;
    buildFloorContent(i, g);
    scene.add(g);
    floorGroups.push(g);
  }
  curFloor = 1;                 // 默认从 1F 进门
  /* 建完楼先把 1F 的楼梯点位算出来，否则刚进楼时碰不到任何楼梯 */
  try{ rebuildStairSpots(curFloor); }catch(e){}
  inBuilding = false;
  setFloorVisible();
}

/* 【楼外不显示楼层】这是「开局玩家在天上」的根因所在。
   主楼 5 层是叠在一起的：2F@12 / 1F@8 / B1@4 / B2@0 / B3@-4。
   玩家出生在楼外操场（0, 1.6, 5），而 curFloor 默认是 1（1F@y8）——
   于是在楼外抬头能看到一整层悬在 8 米高空的楼板家具，
   视觉上就是「开局人在天上」。
   现在：只有玩家真的在楼里（inBuilding）才显示当前层，
   在楼外时 5 层全部隐藏，看到的只有主楼外壳。 */
function setFloorVisible(){
  const show = (typeof inBuilding==='boolean') ? inBuilding : true;
  for(let i=0;i<floorGroups.length;i++){
    if(floorGroups[i]) floorGroups[i].visible = show && (i===curFloor);
  }
}

/* 切换楼层：把玩家放到该层地板上，并清速度避免穿层 */
function goFloor(idx, reason){
  const nb = Math.max(0, Math.min(FLOORS.length-1, idx|0));
  const f = nb===curFloor ? '' : FLOORS[nb].name;
  /* 楼板之间的家具切换是瞬间的，所以必须先摆好可见性再移动玩家，
     否则玩家会先看到旧层一秒。 */
  const oldY = floorY(curFloor);
  curFloor = nb;
  setFloorVisible();
  /* 【关键】换层后楼梯点位必须跟着换：
     每层的楼梯在 2D 地图里位置不同（1F 在西南楼梯间、B1 在西北……），
     所以 STAIR_SPOTS 必须按新层重新生成，否则会在旧坐标上误触发换层。 */
  rebuildStairSpots(nb);
  try{
    if(typeof P === 'object' && P.pos){
      /* 保持水平位置不变（楼梯/电梯都在同一处），只改高度 */
      P.pos.y = floorY(nb) + (typeof P.eyeH === 'number' ? P.eyeH : 1.7);
      P.vel.y = 0;
      P.onGround = true;
    }
  }catch(e){}
  try{ if(typeof sfxUI==='function') sfxUI(); }catch(e){}
  if(f){
    try{ toast('🏢 到达 '+f); }catch(e){}
  } else if(reason){
    try{ toast(reason); }catch(e){}
  }
  return FLOORS[nb];
}

/* ---- 楼梯 / 电梯 交互点 ---- */
/* 楼梯：2F↔1F↔B1↔B2↔B3 一层一层走，位置在主楼东西两端。
   电梯：放在主楼正中偏东，可以跳层（代价是声音大，会引敌人）。 */
/* 【为什么改成动态生成】原来的 STAIR_SPOTS 是两处写死的点位（x=±24, z=-22），
   与楼层无关。但 2D 的楼梯是**每层各自定义在 objs 里**的：
   1F 的楼梯在格子 (3.5,12.5)/(6.5,15.5)，B1 在 (3.5,3.5)/(1.5,5.5)……
   按 2D 1:1 建出墙体后，那些写死点位正好落在墙里或空房间里，
   于是「看得到楼梯台阶却走不上去换层」。
   现在改为：每次换层/进入时，从当前层的 GRID_MAPS[curFloor].objs
   里把所有 t:'stairs' 取出来，用 gridToWorld() 换算成世界坐标，
   目标层直接读 2D 数据里的 to 字段。这样楼梯的位置与去向
自动与 2D 完全一致，改地图时这里不用跟着改。 */
/* 声明已前移，原因见下方 buildFloorContent 之前的说明。 */
function rebuildStairSpots(fi){
  STAIR_SPOTS = [];
  try{
    const idx = (typeof fi === 'number' && fi >= 0) ? fi : curFloor;
    const fdef = FLOORS[idx];
    const fid = fdef ? fdef.id : '1F';
    const m = GRID_MAPS[fid];
    if(!m || !m.objs) return;
    for(const o of m.objs){
      if(o.t !== 'stairs' || !o.to) continue;
      const p = gridToWorld(o.x, o.y, m);
      const tgt = FLOORS.findIndex(f=>f.id===o.to);
      if(tgt < 0) continue;
      STAIR_SPOTS.push({ x:p.x, z:p.z, kind:'stairs', to:tgt, label:o.to });
    }
  }catch(e){}
  /* 兜底：地图里没定义楼梯时，退回到楼东侧一处，至少不会卡死 */
  if(!STAIR_SPOTS.length && fi !== undefined){
    STAIR_SPOTS.push({ x:-24, z:-22, kind:'stairs', to:(fi+1<FLOORS.length?fi+1:0) });
  }
}
const ELEV = { x:10, z:-22, w:2.4, d:2.4 };

let nearFloorThing = null;      // {kind:'stairs'|'elev', dir}

function buildFloorTransports(){
  /* 【改】以前这里自己画一段假楼梯，位置固定在东西两端。
     现在真楼梯由 buildGridStairs() 按每层 objs 生成（4 级台阶+扶手，可踩），
     这里只负责电梯。若再画一遍，楼里会出现两组互不相干的台阶——
     玩家踩到假的那组却不能换层，那正是「楼梯走上不去」的观感来源。 */
  /* 电梯：一个金属方舱 + 门缝 */
  box(ELEV.w, 2.6, ELEV.d, 0x9aa4b0, ELEV.x, 1.3, ELEV.z, true);
  box(.06, 2.2, ELEV.d*0.8, 0x6a7480, ELEV.x, 1.1, ELEV.z, false);
  const led=new THREE.Mesh(new THREE.BoxGeometry(.5,.3,.1),
    new THREE.MeshStandardMaterial({color:0x33ff88,emissive:0x33ff88,emissiveIntensity:1.0}));
  led.position.set(ELEV.x, 2.9, ELEV.z-1.25);
  scene.add(led);
}

/* ---- 每帧：检测玩家是否在楼里、是否靠近楼梯/电梯 ---- */
function updFloors(dt){
  if(!floorGroups.length) return;
  let inB=false, nd=null, bd=2.2;
  try{
    if(typeof P === 'object' && P.pos){
      const px=P.pos.x, pz=P.pos.z;
      /* 主楼内部范围（x -29..29，z -29..-15） */
      /* 【改】原来写死 pz>-15，但按 2D 1:1 建图后各层进深不同：
         2F 16 格 → z 到 -13；1F/B1/B2 18 格 → z 到 -11；B3 16 格 → -13。
         用 -15 会把 1F 南侧楼梯间（z=-13.5）判成「在楼外」，
         玩家站上去时楼梯检测整段被跳过，就换不了层。
         改成按当前楼层地图的真实进深算。 */
      const _gm = (typeof GRID_MAPS!=='undefined') ? GRID_MAPS[FLOORS[curFloor].id] : null;
      const _zEnd = Z_BASE + 0.5;   /* 南端就在门洞处，稍微留一点容差 */
      inB = (px>-29 && px<29 && pz>-29 && pz<_zEnd);
      if(inB){
        /* 【改】楼梯点位由 rebuildStairSpots() 按当前层 objs 生成，
           每个 spot 自带 to（目标层索引），不再靠 up/down 猜方向。
           半径 2.2 米，正好覆盖 4 级台阶（约 2.2 米长）。 */
        for(const s of STAIR_SPOTS){
          const dd=Math.hypot(px-s.x, pz-s.z);
          if(dd<bd){ bd=dd; nd={kind:'stairs', to:s.to, spot:s}; }
        }
        const de=Math.hypot(px-ELEV.x, pz-ELEV.z);
        if(de<bd){ bd=de; nd={kind:'elev'}; }
      }
    }
  }catch(e){}
  /* 【进出楼切换可见性】inBuilding 一变就要刷新分层显隐：
     进楼 → 显示当前层；出楼 → 5 层全隐藏（否则楼板悬在半空）。
     顺带在「刚进楼」这一刻把玩家摆到本层地板：
     现在 1F 地板就在 y=0（与楼外操场同高），
     所以从 z=-14 门口走进去时 P.pos.y 本来就是 1.6，
     这里再写一次只是「对齐」（防止从楼上跳下来进楼时高度错位），
     不再会出现原来那种「一进门被抬到 8 米」的跳变。 */
  const wasInB = inBuilding;
  inBuilding = inB;
  if(inB !== wasInB){
    setFloorVisible();
    if(inB && typeof P === 'object' && P.pos){
      const base = floorY(curFloor) + (typeof P.eyeH==='number'?P.eyeH:1.7);
      P.pos.y = base;
      P.vel.y = 0;
      P.onGround = true;
    }
  }
  nearFloorThing = inB ? nd : null;

  /* 楼内时把玩家的 y 锁在本层地板附近，防止从楼板缝隙掉下去。
     只在「脚底明显低于本层地板」时拉回，避免干扰正常跳跃。 */
  try{
    if(inB && typeof P === 'object' && P.pos){
      const base = floorY(curFloor) + (typeof P.eyeH==='number'?P.eyeH:1.7);
      if(P.pos.y < base - 2.5){ P.pos.y = base; P.vel.y = 0; }
    }
  }catch(e){}

  /* 提示：靠近楼梯/电梯时显示 */
  try{
    const el = document.getElementById('doorHint');
    if(el && nearFloorThing){
      el.style.display='block';
      if(nearFloorThing.kind==='elev'){
        el.innerHTML='<b>E</b> 电梯（'+floorGet().name+'）';
      } else {
        const tgt = nearFloorThing.to;
        const t = (typeof tgt==='number' && tgt>=0 && tgt<FLOORS.length) ? FLOORS[tgt].name : '（无）';
        el.innerHTML='<b>E</b> 楼梯 → '+t;
      }
    }
  }catch(e){}
}

/* 交互入口：由 x_ext 的 interact() 调用。
   返回 true 表示这次交互被楼层系统吃掉了。 */
function floorInteract(){
  if(!nearFloorThing) return false;
  if(nearFloorThing.kind==='elev'){
    /* 电梯：跳到「下一层」，到底了回到 2F（环形）。
       为什么不弹选层面板：手机上一个弹窗会打断节奏，
       而且 5 层环形其实就是「按 E 往下走一层」，够用。 */
    let nxt = curFloor + 1;
    if(nxt >= FLOORS.length) nxt = 0;
    goFloor(nxt, '电梯');
    return true;
  }
  if(nearFloorThing.kind==='stairs'){
    /* to 直接来自 2D 地图数据的 o.to，例如 1F 的楼梯写 to:'2F' */
    const tgt = nearFloorThing.to;
    if(typeof tgt!=='number' || tgt<0 || tgt>=FLOORS.length){
      try{ toast('这里没有楼梯可走了'); }catch(e){}
      return true;
    }
    goFloor(tgt);
    return true;
  }
  return false;
}

/* ---- 黑钥匙（2D 里黑钥匙是开「电子门」的，绝密/超星才刷新） ---- */
/* 2D 版：blackkey 由蓝图 + 木头 + 锤子制作；3D 版没有制作系统，
   改为「难度允许时，室内容器有概率搜到」。
   对应需求「黑钥匙」与「限制结局」：普通难度根本不给黑钥匙。 */
const BLACKKEY_ID = 'blackkey';
function maybeSpawnBlackKey(){
  let d = null;
  try{ d = (typeof diffGet==='function') ? diffGet() : null; }catch(e){}
  if(!d || !d.blackKey) return false;
  /* 挂到「本局的容器战利品表」上：拿到 blackkey 的容器必须真的产出。
     做法是给 CONTAINER_SPOTS 里某个室内点位打标记，openContainer 时
     会额外塞一把黑钥匙。 */
  try{
    if(typeof CONTAINER_SPOTS==='array' || Array.isArray(CONTAINER_SPOTS)){
      const indoor = CONTAINER_SPOTS.filter(s=>s.x>-29 && s.x<29 && s.z>-29 && s.z>-15);
      if(indoor.length){
        indoor[Math.floor(Math.random()*indoor.length)].hasBlackKey = true;
      }
    }
  }catch(e){}
  return true;
}