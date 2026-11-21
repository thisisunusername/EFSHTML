'use strict';
/* ================= 常量 ================= */
var PW = 35, PH = 18;
var PLAYER_SPEED = 4.6;
var CATCH_RANGE = 0.62;      /* 距离小于此值即被抓 */
var SIGHT_STEP = 3;          /* 视线采样密度 */

/* 坐标约定：格子(ix,iy)的中心 = (ix+0.5, iy+0.5) */

var DIFF = {
  easy:   {name:'简单',   guards:0, tspeed:1.7, gspeed:1.5, sight:5.0, roam:1, replan:14, see:5.0, lives:2},
  normal: {name:'普通',   guards:1, tspeed:1.95, gspeed:1.7, sight:5.6, roam:2, replan:11, see:3.0, lives:2},
  hard:   {name:'困难',   guards:2, tspeed:2.25, gspeed:1.95, sight:6.2, roam:3, replan:8.5, see:1.0, lives:2},
  hell:   {name:'地狱',   guards:3, tspeed:2.55, gspeed:2.2, sight:6.8, roam:4, replan:6, see:0, lives:1, instant:true, onlyRoute45:true}
};

var ITEM = {
  flag:      {name:'老师工作牌',   icon:'🪪', color:'#ffd166'},
  redkey:    {name:'红钥匙',       icon:'🔴', color:'#ef4444'},
  yellowkey: {name:'黄色钥匙',     icon:'🟡', color:'#eab308'},
  saw:       {name:'锯子',         icon:'🪚', color:'#9fb3c8'},
  hammer:    {name:'锤子',         icon:'🔨', color:'#a78bfa'},
  wood:      {name:'木头',         icon:'🪵', color:'#b98b5a'},
  knife:     {name:'小刀',         icon:'🔪', color:'#cbd5e1'},
  blueprint: {name:'黑钥匙制作图', icon:'📜', color:'#f472b6'},
  blackkey:  {name:'黑钥匙',       icon:'⚫', color:'#94a3b8'},
  stealth:   {name:'隐身针',       icon:'💉', color:'#22d3ee'},
  cola:      {name:'可乐',         icon:'🥤', color:'#f87171'},
  torch:     {name:'手电筒',       icon:'🔦', color:'#fde047'}
};
var INV_ORDER = ['flag','redkey','yellowkey','saw','hammer','wood','knife','blueprint','blackkey','stealth','cola','torch'];

/* ================= 工具 ================= */
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function clampi(v,a,b){ return v<a?a:(v>b?b:v); }
function gnew(w,h){
  var g=[];
  for(var y=0;y<h;y++){ var r=[]; for(var x=0;x<w;x++) r.push(1); g.push(r); }
  return g;
}
function carve(g,x0,y0,x1,y1){
  for(var y=y0;y<=y1;y++){
    if(!g[y]) continue;
    for(var x=x0;x<=x1;x++){ if(g[y][x]!==undefined) g[y][x]=0; }
  }
}
function wallr(g,x0,y0,x1,y1){
  for(var y=y0;y<=y1;y++){
    if(!g[y]) continue;
    for(var x=x0;x<=x1;x++){ if(g[y][x]!==undefined) g[y][x]=1; }
  }
}
/* ================= 世界构建 ================= */
var W = {};

/* ================= 楼层链条（NPC 判断该往上还是往下走） ================= */
var FLOOR_CHAIN = ['2F','1F','B1','B2','B3'];

function patrolOf(fl){
  var f=W[fl];
  if(!f || !f.patrol || !f.patrol.length) return null;
  return f.patrol;
}
function stairsOf(fl){
  var f=W[fl]; var out=[];
  if(!f) return out;
  for(var i=0;i<f.objs.length;i++){ if(f.objs[i].t==='stairs') out.push(f.objs[i]); }
  return out;
}
function chainIdx(fl){
  for(var i=0;i<FLOOR_CHAIN.length;i++){ if(FLOOR_CHAIN[i]===fl) return i; }
  return -1;
}

function buildWorld(){
  W = {};

  /* ========== 2F 教室层：教室 / 老师办公室 / 厕所 / 电闸室 / 大门（旁有监控） ========== */
  (function(){
    var w=44,h=18,g=gnew(w,h);
    carve(g,1,1,7,5);     carve(g,4,6,4,6);      /* 教室 */
    carve(g,9,1,14,5);    carve(g,11,6,11,6);    /* 老师办公室 */
    carve(g,16,1,20,5);   carve(g,18,6,18,6);    /* 厕所 */
    carve(g,22,1,27,5);   carve(g,24,6,24,6);    /* 电闸室 */
    carve(g,29,1,34,5);   carve(g,31,6,31,6);    /* 体育馆前厅（扩展） */
    carve(g,36,1,42,5);   carve(g,39,6,39,6);    /* 器材室（扩展） */
    carve(g,1,7,42,8);                            /* 走廊（加长） */
    carve(g,1,10,8,16);   carve(g,4,9,4,9);      /* 大门厅 */
    carve(g,11,10,16,16); carve(g,13,9,13,9);    /* 楼梯间 */
    carve(g,19,10,24,16); carve(g,21,9,21,9);    /* 空教室 */
    carve(g,26,10,30,16); carve(g,28,9,28,9);    /* 图书角 */
    carve(g,32,10,36,16); carve(g,34,9,34,9);    /* 体育馆（扩展） */
    carve(g,38,10,42,16); carve(g,40,9,40,9);    /* 器材间（扩展） */

    W['2F'] = {
      key:'2F', name:'一层', w:w, h:h, g:g, dark:false,
      rooms:[
        {name:'教室',       x0:1, y0:1,  x1:7,  y1:5,  safe:'class'},
        {name:'老师办公室', x0:9, y0:1,  x1:14, y1:5},
        {name:'厕所',       x0:16,y0:1,  x1:20, y1:5,  safe:'toilet'},
        {name:'电闸室',     x0:22,y0:1,  x1:27, y1:5},
        {name:'体育馆前厅', x0:29,y0:1,  x1:34, y1:5},
        {name:'器材室',     x0:36,y0:1,  x1:42, y1:5},
        {name:'走廊',       x0:1, y0:7,  x1:42, y1:8},
        {name:'大门厅',     x0:1, y0:10, x1:8,  y1:16},
        {name:'楼梯间',     x0:11,y0:10, x1:16, y1:16},
        {name:'空教室',     x0:19,y0:10, x1:24, y1:16, safe:'class'},
        {name:'图书角',     x0:26,y0:10, x1:30, y1:16},
        {name:'体育馆',     x0:32,y0:10, x1:36, y1:16},
        {name:'器材间',     x0:38,y0:10, x1:42, y1:16}
      ],
      patrol:[{x:4.5,y:7.5},{x:18.5,y:8.5},{x:29.5,y:7.5},{x:13.5,y:12.5},{x:21.5,y:7.5},{x:34.5,y:12.5},{x:40.5,y:7.5}],
      objs:[
        {t:'item', x:12.5, y:2.5, id:'flag'},                                      /* 老师工作牌 */
        {t:'switch', x:25.5, y:2.5, id:'sw1', label:'二层电闸'},
        {t:'camera', x:2.5, y:12.5, dir:0, cone:Math.PI, range:7.5},                  /* 大门旁静态监控 */
        {t:'gate', x:4.5, y:16.5, kind:'main', label:'大门'},
        {t:'stairs', x:13.5, y:13.5, to:'1F', tx:3.5, ty:13.5, label:'下楼'},
        {t:'item', x:40.5, y:3.5, id:'torch'},                                        /* 器材室：手电筒 */
        {t:'item', x:34.5, y:13.5, id:'cola'}                                          /* 体育馆：可乐 */
      ]
    };
  })();

  /* ========== 1F 小卖部层：小卖部(旁有监控) / 校长办公室(权限锁) / 厕所×2 / 侧门 ========== */
  (function(){
    var w=32,h=18,g=gnew(w,h);
    carve(g,1,1,7,5);     carve(g,4,6,4,6);      /* 小卖部 */
    carve(g,9,1,15,5);                            /* 校长办公室（门洞不打通，要靠工作牌刷开） */
    carve(g,17,1,20,5);   carve(g,18,6,18,6);    /* 厕所 */
    carve(g,22,1,25,5);   carve(g,23,6,23,6);    /* 厕所 2 */
    carve(g,1,7,30,8);                            /* 走廊 */
    carve(g,1,10,7,16);   carve(g,3,9,3,9);      /* 楼梯间 */
    carve(g,9,10,15,16);  carve(g,12,9,12,9);    /* 侧门区 */
    carve(g,17,10,22,16); carve(g,19,9,19,9);    /* 门厅 */
    carve(g,24,10,30,16); carve(g,27,9,27,9);    /* 杂物间 */

    W['1F'] = {
      key:'1F', name:'二层', w:w, h:h, g:g, dark:false,
      rooms:[
        {name:'小卖部',     x0:1, y0:1,  x1:7,  y1:5},
        {name:'校长办公室', x0:9, y0:1,  x1:15, y1:5},
        {name:'厕所',       x0:17,y0:1,  x1:20, y1:5, safe:'toilet'},
        {name:'厕所',       x0:22,y0:1,  x1:25, y1:5, safe:'toilet'},
        {name:'走廊',       x0:1, y0:7,  x1:30, y1:8},
        {name:'楼梯间',     x0:1, y0:10, x1:7,  y1:16},
        {name:'侧门区',     x0:9, y0:10, x1:15, y1:16},
        {name:'门厅',       x0:17,y0:10, x1:22, y1:16},
        {name:'杂物间',     x0:24,y0:10, x1:30, y1:16}
      ],
      patrol:[{x:4.5,y:7.5},{x:12.5,y:8.5},{x:19.5,y:7.5},{x:28.5,y:8.5},{x:3.5,y:13.5},{x:19.5,y:12.5}],
      objs:[
        {t:'shop', x:4.5, y:3.5},
        {t:'tree', x:6.5, y:3.5},                                                     /* 校长的树 */
        {t:'camera', x:8.5, y:7.5, dir:Math.PI, cone:Math.PI, range:7.5},
        /* 静态监控：不旋转，大范围覆盖小卖部这一片 */
        {t:'gate', x:12.5, y:6.5, kind:'office', label:'校长办公室门（权限锁）'},
        {t:'item', x:12.5, y:3.5, id:'redkey'},                                       /* 红钥匙 */
        {t:'gate', x:12.5, y:16.5, kind:'side', label:'侧门'},
        {t:'stairs', x:3.5, y:12.5, to:'2F', tx:13.5, ty:12.5, label:'上楼'},
        {t:'stairs', x:6.5, y:15.5, to:'B1', tx:3.5,  ty:5.5,  label:'下地下车库'}
      ]
    };
  })();

  /* ========== B1 地下车库层：电闸 / 有监控的路 / 校长的车 / 厕所 / 保安室 / 电子门 ========== */
  (function(){
    var w=30,h=18,g=gnew(w,h);
    carve(g,1,1,6,6);     carve(g,3,7,4,7);      /* 楼梯间 */
    carve(g,8,1,12,5);    carve(g,10,6,11,7);    /* 保安室 */
    carve(g,14,1,18,5);   carve(g,16,6,17,7);    /* 厕所 */
    carve(g,20,1,25,5);   carve(g,22,6,23,7);    /* 电闸室 */
    carve(g,1,8,28,9);                            /* 走廊（有监控） */
    carve(g,1,11,14,16);  carve(g,4,10,5,10);    /* 车库（门洞 2 格宽） */
    carve(g,17,11,19,16); carve(g,15,13,16,13);  /* 电子门前通道，与车库横向连通 */
    carve(g,21,11,24,16);                         /* 电子门后通道 */
    carve(g,26,11,28,16);                         /* 砖墙后的小隔间 */

    W['B1'] = {
      key:'B1', name:'三层', w:w, h:h, g:g, dark:true,
      rooms:[
        {name:'楼梯间',   x0:1,  y0:1,  x1:6,  y1:6},
        {name:'保安室',   x0:8,  y0:1,  x1:12, y1:5},
        {name:'厕所',     x0:14, y0:1,  x1:18, y1:5, safe:'toilet'},
        {name:'电闸室',   x0:20, y0:1,  x1:25, y1:5},
        {name:'走廊',     x0:1,  y0:8,  x1:28, y1:9},
        {name:'车库',     x0:1,  y0:11, x1:14, y1:16},
        {name:'电子门通道',x0:17, y0:11, x1:19, y1:16},
        {name:'墙后通道', x0:21, y0:11, x1:24, y1:16}
      ],
      patrol:[{x:2.5,y:8.5},{x:10.5,y:8.5},{x:20.5,y:8.5},{x:27.5,y:8.5},{x:7.5,y:13.5}],
      objs:[
        {t:'stairs', x:3.5, y:3.5, to:'1F', tx:6.5, ty:16.5, label:'上一层'},
        {t:'stairs', x:1.5, y:5.5, to:'B2', tx:3.5, ty:5.5,  label:'下四层'},
        {t:'cctv', x:10.5, y:2.5, label:'监控总闸'},
        {t:'switch', x:22.5, y:2.5, id:'sw2', label:'三层电闸'},
        {t:'camera', x:10.5, y:8.5, dir:0,       cone:Math.PI, range:6.5},
        {t:'camera', x:20.5, y:8.5, dir:Math.PI, cone:Math.PI, range:6.5},
        {t:'car', x:7.5, y:13.5, label:'校长的车'},
        {t:'gate', x:20.5, y:13.5, kind:'elec', label:'电子门'},
        {t:'gate', x:25.5, y:13.5, kind:'wall', label:'电子门后的砖墙'}
      ]
    };
  })();

  /* ========== B2 第四层：工具房 / 厕所×2 / 制作室 / 主任办公室(监控) / 电闸 / 地下室门 ========== */
  (function(){
    var w=30,h=18,g=gnew(w,h);
    carve(g,1,1,6,6);     carve(g,3,7,4,7);      /* 楼梯间 */
    carve(g,8,1,12,5);    carve(g,10,6,11,7);    /* 工具房 */
    carve(g,14,1,19,5);   carve(g,16,6,17,7);    /* 主任办公室 */
    carve(g,21,1,24,5);   carve(g,22,6,23,7);    /* 厕所 */
    carve(g,26,1,28,5);   carve(g,27,6,28,7);    /* 厕所 2 */
    carve(g,1,8,28,9);
    carve(g,1,11,7,16);    carve(g,4,10,4,10);   /* 制作室 */
    carve(g,9,11,13,16);   carve(g,11,10,11,10); /* 电闸室 */
    carve(g,15,11,20,16);  carve(g,17,10,17,10); /* 地下室门厅 */
    carve(g,22,11,27,16);  carve(g,24,10,24,10); /* 库房 */

    W['B2'] = {
      key:'B2', name:'四层', w:w, h:h, g:g, dark:true,
      rooms:[
        {name:'楼梯间',     x0:1,  y0:1,  x1:6,  y1:6},
        {name:'工具房',     x0:8,  y0:1,  x1:12, y1:5},
        {name:'主任办公室', x0:14, y0:1,  x1:19, y1:5},
        {name:'厕所',       x0:21, y0:1,  x1:24, y1:5, safe:'toilet'},
        {name:'厕所',       x0:26, y0:1,  x1:28, y1:5, safe:'toilet'},
        {name:'走廊',       x0:1,  y0:8,  x1:28, y1:9},
        {name:'制作室',     x0:1,  y0:11, x1:7,  y1:16},
        {name:'电闸室',     x0:9,  y0:11, x1:13, y1:16},
        {name:'地下室门厅', x0:15, y0:11, x1:20, y1:16},
        {name:'库房',       x0:22, y0:11, x1:27, y1:16}
      ],
      patrol:[{x:2.5,y:8.5},{x:10.5,y:8.5},{x:18.5,y:8.5},{x:27.5,y:8.5},{x:4.5,y:13.5},{x:17.5,y:15.5}],
      objs:[
        {t:'stairs', x:3.5, y:3.5, to:'B1', tx:1.5, ty:5.5, label:'上三层'},
        {t:'item', x:9.5,  y:2.5, id:'saw'},
        {t:'item', x:10.5, y:4.5, id:'hammer'},
        {t:'camera', x:16.5, y:2.5, dir:Math.PI/2, cone:Math.PI, range:6.0},        /* 主任办公室静态监控 */
        {t:'item', x:17.5, y:4.5, id:'blueprint'},
        {t:'switch', x:11.5, y:13.5, id:'sw3', label:'四层电闸'},
        {t:'craft', x:4.5, y:13.5},
        {t:'gate', x:17.5, y:13.5, kind:'basement', label:'地下室门'}
      ]
    };
  })();

  /* ========== B3 地下室：两段楼梯（一段回四层，一段通到学校外面） ========== */
  (function(){
    var w=26,h=16,g=gnew(w,h);
    carve(g,1,1,23,13);
    wallr(g,9,5,11,7);
    wallr(g,15,5,17,7);
    wallr(g,9,10,11,11);

    W['B3'] = {
      key:'B3', name:'地下室', w:w, h:h, g:g, dark:true,
      rooms:[ {name:'地下室', x0:1, y0:1, x1:23, y1:13} ],
      objs:[
        {t:'stairs', x:3.5, y:3.5, to:'B2', tx:19.5, ty:13.5, label:'回四层'},
        {t:'stairWin', x:21.5, y:2.5, label:'通往学校外面的楼梯'}
      ]
    };
  })();
}/* ================= 地图查询 ================= */
function fl(){ return W[S.floor]; }
function isWall(f,x,y){
  var ix=Math.floor(x), iy=Math.floor(y);
  if(ix<0||iy<0||ix>=f.w||iy>=f.h) return true;
  return f.g[iy][ix]===1;
}
function tileBlocked(f,ix,iy){
  if(ix<0||iy<0||ix>=f.w||iy>=f.h) return true;
  return f.g[iy][ix]===1;
}

/* ================= BFS 寻路 ================= */
function findPath(f,sx,sy,gx,gy){
  sx=clampi(Math.floor(sx),0,f.w-1); sy=clampi(Math.floor(sy),0,f.h-1);
  gx=clampi(Math.floor(gx),0,f.w-1); gy=clampi(Math.floor(gy),0,f.h-1);
  if(sx===gx&&sy===gy) return [];
  if(tileBlocked(f,gx,gy)) return null;
  var w2=f.w, h2=f.h, sz=w2*h2;
  var prev=new Int32Array(sz); prev.fill(-1);
  var q=new Int32Array(sz), qs=0, qe=0;
  var start=sy*w2+sx;
  q[qe++]=start; prev[start]=-2;
  var dxs=[1,-1,0,0], dys=[0,0,1,-1];
  var goal=gy*w2+gx;
  var found=false;
  while(qs<qe){
    var cur=q[qs++];
    if(cur===goal){ found=true; break; }
    var cx=cur%w2, cy=(cur-cx)/w2;
    for(var k=0;k<4;k++){
      var nx=cx+dxs[k], ny=cy+dys[k];
      if(nx<0||ny<0||nx>=w2||ny>=h2) continue;
      var ni=ny*w2+nx;
      if(prev[ni]!==-1) continue;
      if(tileBlocked(f,nx,ny)) continue;
      prev[ni]=cur; q[qe++]=ni;
    }
  }
  if(!found) return null;
  var path=[], n=goal, guard=0;
  while(n>=0 && prev[n]!==-2){
    path.push({x:n%w2, y:(n-(n%w2))/w2});
    n=prev[n];
    if(++guard>4000) break;
  }
  path.reverse();
  return path;
}

/* ================= 视线 ================= */
function losClear(f,x0,y0,x1,y1){
  var dx=x1-x0, dy=y1-y0;
  var dist=Math.sqrt(dx*dx+dy*dy);
  var steps=Math.ceil(dist*SIGHT_STEP);
  for(var i=1;i<steps;i++){
    var t=i/steps;
    if(isWall(f, x0+dx*t, y0+dy*t)) return false;
  }
  return true;
}
