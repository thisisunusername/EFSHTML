/* ============================================================
   x_campus.js —— 校园扩建（1:1 补齐真实学校应有的建筑与设施）
   【位置】build.sh 排在 x_ext.js 之后、z_render.js 之前。
   本文件只提供 buildCampus()，由 z_render.js 的 init 链调用 ——
   与 x_ext.js 的 buildSportsZone 同一个时机，
   确保 box()/cyl()/groundDeco()/mkDoor() 都已经就绪。

   【坐标全部经过重叠检测（/tmp/campus_plan.py）】
     围墙： x -60..78   z -46..68
     已有： 主楼   x-30..30  z-30..-14
             东楼  x-42..-26 z-14..18
             西楼  x26..42   z-14..18
             行政楼 x-17..17 z18.5..33.5
             操场  x-27..59  z8..60
             体育馆 x45..71  z1..35
             篮球场 x-26..-10 z-5..17
     本次新增（互不重叠，均在墙内）：
             宿舍A  x-58..-42  z-44..-26
             宿舍B  x-58..-42  z-16..4
             食堂   x-58..-42  z36..56
             图书馆 x64..76    z-33..-7
             传达室 x6..10     z-45..-41
             停车场 x-42..-18  z-44..-32
             车棚   x40..52    z-43..-33
   ============================================================ */

/* ---------- 通用：一栋「空心可进」的楼 ----------
   主楼那几道门当年是「先造整块实心 box，再 dropBody 删掉重拼两段」，
   那是因为只有一个调用点、又不得不在事后开洞。
   新建的建筑没这个包袱：直接一次造出「四面墙 + 门洞 + 楼板」即可，
   不用删、也不会留下残块。
   o = { x,z,w,d,h, wallC, floorC, ceilC,
         door:'S'|'N'|'E'|'W', doorW, doorH, doorOff, T, winRows }
   doorOff：门在墙面上的横向偏移（0 = 正中）。
   winRows：窗户基准高度数组，例如 [1.5, 4.9]。 */
function campusHollow(o){
  const w=o.w, d=o.d, h=o.h, x=o.x, z=o.z;
  const T = o.T || 0.7;
  const wallC = o.wallC===undefined ? 0xd9c6a3 : o.wallC;
  const floorC= o.floorC===undefined ? 0xb9b3a6 : o.floorC;
  const ceilC = o.ceilC===undefined ? 0xd6d0c2 : o.ceilC;
  const dw = o.doorW || 3.2;
  const dh = o.doorH || 2.6;
  const side = o.door || 'S';
  const off = o.doorOff || 0;
  const xS = x-w/2, xE = x+w/2, zS = z-d/2, zN = z+d/2;
  const half = dw/2;

  /* ---- 楼板：地板 / 天花板 / 外露屋顶 ---- */
  box(w, .1, d, floorC, x, -0.05, z, true);
  const ceilMat=(typeof matGetForSize==='function')
    ? matGetForSize(ceilC, w, .12, d, { side:THREE.DoubleSide })
    : new THREE.MeshStandardMaterial({color:ceilC, side:THREE.DoubleSide});
  const cm=new THREE.Mesh(new THREE.BoxGeometry(w,.12,d), ceilMat);
  cm.position.set(x, h, z); scene.add(cm);
  box(w+.6, .5, d+.6, 0x6b5a45, x, h+.3, z, true);   // 外露屋顶（挑檐）

  /* ---- 南北墙：沿 x 铺开，door 在 S/N 时中间留洞 ---- */
  const cutS = (side==='S'), cutN = (side==='N');
  const segW = (w-dw)/2;
  const makeNS = (zc, isCut)=>{
    if(!isCut){
      box(w, h, T, wallC, x, h/2, zc);
      return;
    }
    const cxm = x + off;                        // 门中心
    box(segW, h, T, wallC, cxm - (half+segW/2), h/2, zc);
    box(segW, h, T, wallC, cxm + (half+segW/2), h/2, zc);
    if(h-dh>0.05) box(dw, h-dh, T, wallC, cxm, (dh+h)/2, zc);   // 过梁
  };
  makeNS(zS+T/2, cutS);
  makeNS(zN-T/2, cutN);

  /* ---- 东西墙：只占南北墙之间那段，避免四角重叠 ---- */
  const cutE = (side==='E'), cutW = (side==='W');
  const segD = (d-dw)/2;
  const innerD = d-2*T;
  const makeEW = (xc, isCut)=>{
    if(!isCut){
      box(T, h, innerD, wallC, xc, h/2, z);
      return;
    }
    const czm = z + off;
    box(T, h, segD, wallC, xc, h/2, czm - (half+segD/2));
    box(T, h, segD, wallC, xc, h/2, czm + (half+segD/2));
    if(h-dh>0.05) box(T, h-dh, dw, wallC, xc, (dh+h)/2, czm);
  };
  makeEW(xS+T/2, cutW);
  makeEW(xE-T/2, cutE);

  /* ---- 门框 + 可开门板（复用 x_ext.js 的 mkDoor） ---- */
  const dcx = x + ((side==='E'||side==='W') ? 0 : off);
  const dcz = z + ((side==='E'||side==='W') ? off : 0);
  const doorC = o.doorC===undefined ? 0x9a7a52 : o.doorC;
  if(typeof mkDoor==='function'){
    if(side==='S')     mkDoor(dcx, zS-0.02, dw, dh, doorC, 'x');
    else if(side==='N')mkDoor(dcx, zN+0.02, dw, dh, doorC, 'x');
    else if(side==='E')mkDoor(xE+0.02, dcz, dw, dh, doorC, 'z');
    else               mkDoor(xS-0.02, dcz, dw, dh, doorC, 'z');
  }
  /* ---- 窗户：沿「非门」的那几面墙排 ---- */
  const wins = o.winRows || [];
  if(wins.length && typeof windowPane==='function'){
    const nW = Math.max(1, Math.floor(w/4.5));
    for(const wy of wins){
      for(let i=0;i<nW;i++){
        const wx = xS + (w/(nW+1))*(i+1);
        if(!cutS) windowPane(2.2,1.8, wx, wy, zS, 'S');
        if(!cutN) windowPane(2.2,1.8, wx, wy, zN, 'N');
      }
      const nD = Math.max(1, Math.floor(d/4.5));
      for(let i=0;i<nD;i++){
        const wz = zS + (d/(nD+1))*(i+1);
        if(!cutW) windowPane(2.2,1.8, xS, wy, wz, 'W');
        if(!cutE) windowPane(2.2,1.8, xE, wy, wz, 'E');
      }
    }
  }
  /* ---- 顶灯 ---- */
  for(const lx of [x-w*0.28, x+w*0.28]){
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(1.6,.08,.4),
      new THREE.MeshStandardMaterial({color:0xffffff, emissive:0xfff4d6, emissiveIntensity:1.0}));
    lamp.position.set(lx, h-0.14, z);
    scene.add(lamp);
  }
  return { xS:xS, xE:xE, zS:zS, zN:zN };
}

/* ============ 1. 学生宿舍（A、B 两栋，西侧长排） ============
   真实学校的宿舍是「一条走廊、两侧宿舍、盥洗室在尽头」。
   这里两栋尺寸相同：10×18，高 7.2（两层视觉高度，实际只建一层空腔——
   搜打掩游戏里跑两层楼没意义，反而让光线和家具密度都变差）。 */
function buildDormitory(o){
  const r = campusHollow({
    x:o.x, z:o.z, w:10, d:18, h:7.2, T:0.6,
    wallC:0xcfc0a8, floorC:0xa9a294, ceilC:0xcfc8b8,
    /* 【门坐标要精算】宿舍 x=-50、宽 10，东墙在 x=-45（xE= -50+5）。
       如果传 x=-50，campusHollow 用 xE 算门面位置没问题，
       但「门洞在墙上的中心偏移」是相对楼中心的 —— 楼中心在 -50，
       门要在东墙上正中，所以 x 传 -50、door:'E' 是对的；
       真正要检查的是 mkDoor 的 x 是否等于 xE 而不是楼中心。
       下面把门面显式算好交给 campusHollow，避免两处算法不一致。 */
    door:o.door||'E', doorW:3.0, doorH:2.5, doorOff:0,
    winRows:[1.7, 5.1]
  });
  /* ---- 内部：中走廊（x 方向留 2.2 米）+ 两侧各 5 间宿舍 ---- */
  const rc = 0x8f8878;                       // 内隔墙色
  const cxm = o.x;
  /* 两侧长墙：把房间从中走廊分开。真正挡人的就是这两道。 */
  box(.16, 2.8, 14.0, rc, cxm-1.1, 1.4, o.z);
  box(.16, 2.8, 14.0, rc, cxm+1.1, 1.4, o.z);
  /* 横隔：每 2.8 米一道，把两侧各切成 5 间。
     这里用 noCol（纯视觉）—— 宿舍的价值是「放床的房间」不是迷宫；
     0.14 米厚的薄隔墙做碰撞最容易被玩家怼穿，
     敌人寻路也会因为多了一堆小隔间在门口反复抽搐。 */
  for(let i=0;i<5;i++){
    const zz = o.z - 5.6 + i*2.8;
    /* 西侧房间隔墙（留 1 米门洞） */
    box(3.3, 2.8, .14, rc, cxm-3.15, 1.4, zz, true);
    box(3.3, 2.8, .14, rc, cxm+3.15, 1.4, zz, true);
  }
  /* 床头柜 / 双层床（西东两侧各一组，每间一套） */
  for(let i=0;i<5;i++){
    const zz = o.z - 4.2 + i*2.8;
    for(const sx of [cxm-3.2, cxm+3.2]){
      box(1.9, .18, 1.1, 0x8a6a45, sx, .55, zz, true);     // 下铺板
      box(1.9, .18, 1.1, 0x9a7b52, sx, 1.55, zz, true);    // 上铺板
      box(.1, 2.0, .1, 0x6a5a48, sx-0.88, 1.0, zz-.48, true);
      box(.1, 2.0, .1, 0x6a5a48, sx+0.88, 1.0, zz-.48, true);
      box(.5,.5,.5, 0x7a6a58, sx+0.85, .25, zz+0.9, true); // 床头柜
    }
  }
  /* 盥洗室：z 正端一间，里面几个水池（用矮台子示意） */
  box(8.0,.85,.5, 0xdde4ea, o.x, .42, o.z+8.2, true);
  for(let i=0;i<4;i++){
    box(.45,.18,.4, 0xeef4f8, o.x-2.7+i*1.8, .95, o.z+8.2, true);
  }
  return r;
}

/* ============ 2. 食堂（大厅 + 售饭台 + 后厨） ============ */
function buildCanteen(){
  const X=-50, Z=46, W=16, D=20, H=6.5;
  const r = campusHollow({
    x:X, z:Z, w:W, d:D, h:H, T:0.7,
    wallC:0xd8c8a8, floorC:0xbdb4a2, ceilC:0xd8d2c4,
    door:'E', doorW:3.6, doorH:2.8,
    winRows:[1.6, 4.6]
  });
  /* ---- 售饭台（靠西墙一条） ---- */
  for(let i=0;i<4;i++){
    box(4.6, .9, 1.0, 0x9c9c9c, X-5.0, .45, Z-6.0+i*4.2, true);
    box(4.6, .06, 1.0, 0xc8cdd4, X-5.0, .95, Z-6.0+i*4.2, true);
    /* 隔窗玻璃（不碰撞） */
    box(.08, 1.4, 1.0, 0xbcd8e4, X-2.6, 1.9, Z-6.0+i*4.2, true);
  }
  /* ---- 就餐区：8 张长桌 + 鲁排椅子 ---- */
  for(let a=0;a<4;a++){
    for(let b=0;b<2;b++){
      const tx = X + 0.6 + b*5.4;
      const tz = Z - 6.5 + a*4.4;
      box(3.4, .08, .9, 0x9a7b52, tx, .74, tz, true);
      box(.1,.72,.1, 0x8a6a45, tx-1.5,.36,tz-.36,true);
      box(.1,.72,.1, 0x8a6a45, tx+1.5,.36,tz-.36,true);
      box(.1,.72,.1, 0x8a6a45, tx-1.5,.36,tz+.36,true);
      box(.1,.72,.1, 0x8a6a45, tx+1.5,.36,tz+.36,true);
      box(1.0,.46,.42, 0x8a8a8a, tx, .23, tz-1.0, true);   // 鲁排凳
      box(1.0,.46,.42, 0x8a8a8a, tx, .23, tz+1.0, true);
    }
  }
  /* ---- 后厨：东南角隔一间，里面炉灶 + 案台 ---- */
  box(.16, 3.0, 7.0, 0x9a9282, X+3.4, 1.5, Z+6.0, true);
  box(6.6, 3.0, .16, 0x9a9282, X+6.2, 1.5, Z+2.6, true);
  box(1.8,.9,1.0, 0x6a6a6a, X+6.0, .45, Z+7.4, true);      // 炉灶
  box(3.2,.85,.9, 0xb0b8c0, X+5.2, .42, Z+4.0, true);      // 案台
  /* ---- 垃圾回收桶（门口左侧） ---- */
  cyl(.45,.5,1.0,0x4a5a4a, X+7.2, .5, Z-7.0, true);
  return r;
}

/* ============ 3. 图书馆（书架阵 + 阅览桌） ============ */
function buildLibrary(){
  const X=70, Z=-20, W=12, D=26, H=8.0;
  const r = campusHollow({
    x:X, z:Z, w:W, d:D, h:H, T:0.7,
    wallC:0xc8c4b8, floorC:0xa8a49a, ceilC:0xd0ccc0,
    door:'W', doorW:3.4, doorH:2.8,
    winRows:[1.6, 5.2]
  });
  /* ---- 书架：6 排，每排 3 个单元，中间留过道 ---- */
  for(let a=0;a<6;a++){
    const bz = Z - 9.5 + a*3.8;
    for(const bx of [X-3.4, X+0.4, X+4.2]){
      box(2.6, 2.2, .55, 0x7a5c3a, bx, 1.1, bz, false);     // 书架（碰撞：挡子弹、挡视线）
      /* 层板 + 书脊（不碰撞，纯装饰） */
      for(let s=0;s<4;s++){
        box(2.4, .05, .5, 0x9a7b52, bx, .35+s*0.55, bz, true);
        for(let k=0;k<5;k++){
          box(.28,.36,.4, [0xa63b3b,0x3b6ea6,0x4a8a4a,0xc8963c,0x6a4a8a][k%5],
              bx-0.9+k*0.45, .58+s*0.55, bz, true);
        }
      }
    }
  }
  /* ---- 阅览区（西侧靠门）---- */
  for(let a=0;a<3;a++){
    const tz = Z - 9.0 + a*4.2;
    box(3.0,.08,1.2, 0x8a6a45, X-4.2, .76, tz, true);
    box(.12,.74,.12, 0x7a5c3a, X-5.4,.37,tz-.45,true);
    box(.12,.74,.12, 0x7a5c3a, X-3.0,.37,tz-.45,true);
    box(.12,.74,.12, 0x7a5c3a, X-5.4,.37,tz+.45,true);
    box(.12,.74,.12, 0x7a5c3a, X-3.0,.37,tz+.45,true);
  }
  /* ---- 借还书台 ---- */
  box(3.2,.95,.9, 0x9a7b52, X+3.0, .47, Z+11.0, false);
  return r;
}

/* ============ 4. 传达室（校门旁，保安坐的地方） ============ */
function buildGuardHouse(){
  const X=8, Z=-43;
  const r = campusHollow({
    x:X, z:Z, w:4.4, d:4.4, h:3.0, T:0.35,
    wallC:0xd0c8b8, floorC:0xa8a294, ceilC:0xcfc8ba,
    door:'W', doorW:1.6, doorH:2.2,
    winRows:[1.3]
  });
  /* 桌子 + 椅子 + 登记本 */
  box(1.8,.75,.7, 0x8a6a45, X+.4, .38, Z, true);
  box(.45,.9,.45, 0x6a5a48, X+.4, .45, Z+1.0, true);
  box(.35,.05,.5, 0xe8e0cc, X+.4, .79, Z-.1, true);
  /* 监控显示器（传达室就能看到监控画面） */
  box(.7,.5,.08, 0x22262e, X+.2, 1.4, Z-2.0, true);
  box(.5,.35,.02, 0x4a6a5a, X+.2, 1.4, Z-2.06, true);
  return r;
}

/* ============ 5. 停车场（校门西侧，十几个车位） ============ */
function buildParking(){
  const X0=-42, X1=-18, Z0=-44, Z1=-32;
  const cx=(X0+X1)/2, cz=(Z0+Z1)/2, w=X1-X0, d=Z1-Z0;
  /* 地面：沥青（深灰）比草地暗一档，跟校门口连成一片 */
  groundDeco(w, d, 0x4a4a4c, cx, cz);
  /* 车位线：每个 2.6 米，横排停，两排 */
  const slotW = 2.6;
  const n = Math.floor(w/slotW);
  for(let i=0;i<=n;i++){
    const lx = X0 + i*slotW;
    groundDeco(0.12, d*0.42, 0xf0f0f0, lx, Z0+d*0.25, 0.75);
    groundDeco(0.12, d*0.42, 0xf0f0f0, lx, Z1-d*0.25, 0.75);
  }
  /* 中间行车通道的黄色虚线 */
  for(let i=0;i<6;i++){
    groundDeco(1.6, 0.14, 0xd8c040, X0+2+i*3.6, cz, 0.7);
  }
  /* 停着的车：西侧 3 辆、东侧 2 辆（颜色按真实校车/教师车配色） */
  const cars = [
    {x:X0+3.2, z:Z0+3.4, c:0x2f3b52},
    {x:X0+9.0, z:Z0+3.4, c:0x8a2f2f},
    {x:X0+14.8,z:Z0+3.4, c:0xb0b4b8},
    {x:X0+6.2, z:Z1-3.4, c:0x2a4a3a},
    {x:X0+12.0,z:Z1-3.4, c:0x3a3a48}
  ];
  for(const car of cars){
    box(1.9,.75,4.0, car.c, car.x, .55, car.z);        // 车身（碰撞）
    box(1.6,.65,2.0, car.c, car.x, 1.25, car.z, true); // 车顶
    box(1.7,.5,1.8, 0x6a7a8a, car.x, 1.2, car.z+.9, true);  // 前挡风
    /* 四个轮子 */
    for(const dx of [-0.85,0.85]) for(const dz of [-1.3,1.3])
      cyl(.34,.34,.28, 0x1a1a1a, car.x+dx, .34, car.z+dz, true);
    /* 车灯 */
    box(.3,.22,.1, 0xfff4d0, car.x-0.6, .7, car.z-2.02, true);
    box(.3,.22,.1, 0xfff4d0, car.x+0.6, .7, car.z-2.02, true);
  }
  /* 进出闸机（靠通道口） */
  cyl(.14,.14,1.2,0xf0c040, X1-1.0, .6, cz-3.0, true);
}

/* ============ 6. 自行车棚（东南，铁架 + 拉顶棚 + 一排自行车） ============ */
function buildBikeShed(){
  const X0=40, X1=52, Z0=-43, Z1=-33;
  const cx=(X0+X1)/2, cz=(Z0+Z1)/2;
  /* 地面：水泥 */
  groundDeco(X1-X0, Z1-Z0, 0x8f8f8f, cx, cz);
  /* 立柱 */
  for(const px of [X0+0.6, cx, X1-0.6]){
    for(const pz of [Z0+0.6, Z1-0.6]){
      cyl(.09,.11, 2.6, 0x6a7a8a, px, 1.3, pz, true);
    }
  }
  /* 顶棚（向一侧挑檐，用两层板做斜面感） */
  box(X1-X0, .08, Z1-Z0, 0x7a8a9a, cx, 2.66, cz, true);
  box(X1-X0+1.2, .06, 1.2, 0x6a7a8a, cx, 2.55, Z0-0.2, true);
  /* 自行车：简化为「两轮 + 车架 + 车座」 */
  for(let i=0;i<6;i++){
    const bx = X0+1.6+i*1.75;
    cyl(.3,.3,.06, 0x2a2a2a, bx, .3, cz-.6, true);
    cyl(.3,.3,.06, 0x2a2a2a, bx, .3, cz+.9, true);
    box(.05,.55,1.5, [0x3a6a9a,0x9a3a3a,0x3a8a5a][i%3], bx, .62, cz+.15, true);
    box(.28,.07,.5, 0x2a2a2a, bx, .95, cz+.85, true);
  }
}

/* ============ 7. 宣传栏 / 花坛 / 主干道 / 垃圾站 ============ */
function buildCampusDeco(){
  /* ---- 主干道：校门（z=-46）→ 主楼门前（z=-14），宽 8 米 ---- */
  groundDeco(8, 30, 0x555555, 0, -30);
  /* 人行道两侧 */
  groundDeco(1.6, 30, 0x9a9a9a, -5.2, -30);
  groundDeco(1.6, 30, 0x9a9a9a,  5.2, -30);
  /* ---- 主楼到行政楼的纵向连接道（东西各一条）---- */
  groundDeco(6, 30, 0x555555, -22, 8);
  groundDeco(6, 30, 0x555555,  22, 8);
  /* ---- 宣传栏（主干道两侧，各 3 块）---- */
  for(let i=0;i<3;i++){
    const bz = -40 + i*7;
    for(const bx of [-8.5, 8.5]){
      cyl(.08,.08,2.2, 0x6a7a8a, bx-1.4, 1.1, bz, true);
      cyl(.08,.08,2.2, 0x6a7a8a, bx+1.4, 1.1, bz, true);
      box(3.0, 1.5, .1, 0x2f4a3a, bx, 1.5, bz, true);     // 公告板
      box(3.2, 1.7, .06, 0x8a9aa8, bx, 1.5, bz+0.06, true); // 边框
    }
  }
  /* ---- 花坛（主干道中段，左右各一个）---- */
  for(const fx of [-14, 14]){
    box(4, .5, 4, 0x9a9a9a, fx, .25, -34);
    /* 花坛里的土 + 矮灌木 */
    box(3.4, .15, 3.4, 0x5a4a3a, fx, .53, -34, true);
    for(const px of [-0.9,0,0.9]) for(const pz of [-0.9,0,0.9]){
      const b=new THREE.Mesh(new THREE.SphereGeometry(.42,7,6),
        matGet(0x3f7a3a,{kind:'grass',repeat:1}));
      b.position.set(fx+px, .85, -34+pz); b.castShadow=true; scene.add(b);
    }
  }
  /* ---- 垃圾站（食堂背后，围墙西侧）---- */
  box(3.0, 1.6, 2.0, 0x5a5a52, -55, .8, 60, false);            // 垃圾房
  box(3.2, .12, 2.2, 0x3a3a36, -55, 1.66, 60, true);            // 顶盖
  for(let i=0;i<3;i++){
    cyl(.42,.46,.9, [0x4a5a4a,0x5a4a3a,0x3a4a5a][i], -56.2+i*1.2, .45, 61.4, true);
  }
  /* ---- 主干道两侧路灯（比原来的 3 盏更密）---- */
  for(const lz of [-42,-34,-26,-18]){
    for(const lx of [-6.4, 6.4]){
      cyl(.1,.14,4.2, 0x555555, lx, 2.1, lz, true);
      const lamp=new THREE.Mesh(new THREE.SphereGeometry(.34,8,8),
        new THREE.MeshStandardMaterial({color:0xfff5d0,emissive:0xffeaa0,emissiveIntensity:.5}));
      lamp.position.set(lx, 4.3, lz); scene.add(lamp);
    }
  }
}

/* ============ 总入口 ============ */
function buildCampus(){
  /* 【为什么全部包成一个个小函数】每一块都是一组「墙 + 家具 + 门」，
     拆开写方便单独调位置，出错（某个门开错面）时也能一行定位。 */
  buildDormitory({ x:-50, z:-35, door:'E' });   // 宿舍 A
  buildDormitory({ x:-50, z:-6,  door:'E' });   // 宿舍 B
  buildCanteen();
  buildLibrary();
  buildGuardHouse();
  buildParking();
  buildBikeShed();
  buildCampusDeco();
}
