/* ================= 商店 / 制作 / 门 ================= */
function hidePanel(){ document.getElementById('panel').classList.add('hidden'); }
function showPanel(title, bodyHtml){
  document.getElementById('panelTitle').textContent=title;
  document.getElementById('panelBody').innerHTML=bodyHtml;
  document.getElementById('panel').classList.remove('hidden');
}

function openShop(){
  var items=[
    {id:'stealth',   desc:'打一针：监控看不见你，被发现所需的 3 秒延长到 5 秒'},
    {id:'yellowkey', desc:'能打开一层的侧门（结局三）'},
    {id:'cola',      desc:'喝下去：移动速度提升 45%'},
    {id:'knife',     desc:'可以雕刻，也能按 E 捅人（25% 概率解决一名敌人）'},
    {id:'torch',     desc:'手电筒：在任意地下室点亮（三层/四层/地下室），整局只能用一次'}
  ];
  /* 地狱难度没有手电筒 */
  if(DIFF[S.diff] && DIFF[S.diff].instant){
    items=items.filter(function(it){ return it.id!=='torch'; });
  }
  var html='';
  if(S.shopPick){
    var it0=null;
    for(var q=0;q<items.length;q++) if(items[q].id===S.shopPick) it0=items[q];
    html='<div class="pitem"><div>✅ <b>本局已经选过了</b><br>'+
      '<span style="font-size:10.5px;color:#8ea6c2">你选的是 '+(it0?ITEM[it0.id].name:'道具')+
      '。每局只能从小卖部带走一样东西。</span></div></div>';
    showPanel('小卖部 · 每局只能选一个', html);
    return;
  }
  var can = true;
  for(var i=0;i<items.length;i++){
    var it=items[i];
    var owned = !!S.inv[it.id];
    html += '<div class="pitem"><div>'+
      ITEM[it.id].icon+' <b>'+ITEM[it.id].name+'</b><br>'+
      '<span style="font-size:10.5px;color:#8ea6c2">'+it.desc+'</span></div>'+
      '<button data-buy="'+it.id+'" '+(owned||!can?'':'')+'>'+
      (owned?'已拥有':'免 费')+'</button></div>';
  }
  showPanel('小卖部 · 全部免费，但每局只能选一个', html);
  var bs=document.querySelectorAll('#panelBody button');
  for(var j=0;j<bs.length;j++){
    bs[j].onclick=function(){
      var id=this.getAttribute('data-buy');
      if(S.shopPick) return;
      applyShopPick(id);
    };
  }
}

/* 免费领取，但一局只能领一个；领到的是「道具」，要用时在物品栏点一下 */
function applyShopPick(id){
  if(S.shopPick) return false;
  S.shopPick=id;
  S.inv[id]=true;
  if(id==='stealth')      toast('拿到隐身针：点物品栏使用（要 3 秒，期间别动）');
  else if(id==='cola')    toast('拿到可乐：点物品栏喝（要 3 秒，期间别动）');
  else if(id==='yellowkey') toast('拿到黄色钥匙：可以去开一层的侧门了');
else if(id==='knife')   toast('拿到小刀：合成黑钥匙要用，也能按 E 捅人（25% 概率）');
  else if(id==='torch'){
    S.inv.torch=true; S.flashLike=true; S.flashFloor=''; S.flashOn=false;
    toast('拿到手电筒：在地下室点物品栏点亮，整局只能用一次');
  }
  updateHUD();
  openShop();
}

/* 手电筒只在玩家主动点击时点亮（见 startUse） */
/* ================= 道具使用：可乐 / 隐身针 ================= */
var USE_TIME = 3.0;          /* 可乐、隐身针都要 3 秒才能用上 */
var COLA_TIME = 10.0;        /* 可乐加速持续 10 秒 */
var STEALTH_TIME = 30.0;     /* 隐身针 30 秒内监控看不见 */

function startUse(id){
  if(S.mode!=='play') return;
  if(S.useT>0){ toast('正在用 '+ITEM[S.useItem].name+'，先别动'); return; }
  if(id==='cola'){
    if(!S.inv.cola){ toast('没有可乐'); return; }
    S.inv.cola=false;                    /* 用掉 */
    S.useT=USE_TIME; S.useItem='cola';
    toast('正在喝可乐…3 秒内不能移动');
  } else if(id==='stealth'){
    if(!S.inv.stealth){ toast('没有隐身针'); return; }
    S.inv.stealth=false;
    S.useT=USE_TIME; S.useItem='stealth';
    toast('正在打隐身针…3 秒内不能移动');
  } else if(id==='torch'){
    /* 手电筒：点一下就开，整局只能用一次，必须站在地下层 */
    if(!S.inv.torch && !CHEAT.torchAll){ toast('没有手电筒'); return; }
    if(S.flashFloor){ toast('手电筒已经用过了，没电了'); return; }
    var f=fl();
    if(!f || !f.dark){ toast('手电筒要在地下室用：三层、四层或地下室'); return; }
    S.inv.torch=false;
    S.flashFloor=S.floor; S.flashOn=true;
    toast('手电筒照亮了整层 '+f.name+'（只能用这一次）');
  }
  updateHUD();
}
/* 每帧推进使用进度 */
function updateUse(dt){
  if(S.useT<=0) return;
  S.useT=Math.max(0, S.useT-dt);
  if(S.useT>0) return;
  var id=S.useItem; S.useItem='';
  if(id==='cola'){
    S.colaT=COLA_TIME; S.speedMul=1.45;
    toast('喝完了：10 秒内跑得更快');
  } else if(id==='stealth'){
    S.stealthT=STEALTH_TIME; S.seeLimit=5.0;
    toast('隐身针生效：30 秒内监控看不见你，被发现要 5 秒');
  }
  updateHUD();
}
function isUsing(){ return S.useT>0; }

/* 每帧递减道具效果时长 */
function tickItemTimers(dt){
  if(S.colaT>0){
    S.colaT=Math.max(0,S.colaT-dt);
    if(S.colaT<=0){ S.speedMul=1; toast('可乐效果结束了'); }
  }
  if(S.stealthT>0){
    S.stealthT=Math.max(0,S.stealthT-dt);
    if(S.stealthT<=0){
      var base=(DIFF[S.diff]||DIFF.normal).see;
      S.seeLimit=base>0?base:0.001;      /* 地狱是看见就死（0.001 秒） */
      toast('隐身针效果结束了');
    }
  }
}

/* 小刀捅人：25% 概率解决一名敌人 */
function knifeStab(){
  if(!S.inv.knife){ toast('需要小刀'); return; }
  var f=fl(); if(!f) return;
  var best=nearestNpc(1.4);
  if(!best){ toast('附近没有人可以捅'); return; }
  if(Math.random()<0.25){
    /* 得手：这名敌人本局退场 */
    S.knifeKills=(S.knifeKills||0)+1;
    for(var k=0;k<S.npcs.length;k++){
      if(S.npcs[k]===best){ S.npcs.splice(k,1); break; }
    }
    toast('一刀解决掉了'+best.name+'！');
  } else {
    /* 失手：对方被激怒，立刻开始追你 */
    best.state='chase';
    best.alertT=3;
    setPath(best, f, S.px, S.py);
    S.seeT=Math.max(0, Math.min((typeof S.seeLimit==='number'?S.seeLimit:SEE_LIMIT)-0.25, S.seeT+1.2));
    toast('没捅中！'+best.name+'被激怒了');
  }
  updateHUD();
}

function openCraft(){
  var hasAll = S.inv.wood && S.inv.knife && S.inv.blueprint && !S.inv.blackkey;
  var html='<div class="pitem"><div>⚫ <b>黑钥匙</b><br><span style="font-size:10.5px;color:#8ea6c2">需要：木头 + 小刀 + 制作图</span></div>'+
    '<button id="doCraft" '+(hasAll?'':'disabled')+'>制作</button></div>';
  html += '<div style="font-size:11px;color:#8ea6c2;line-height:1.7">'+
    (S.inv.wood?'✅ 木头':'❌ 木头')+' · '+
    (S.inv.knife?'✅ 小刀':'❌ 小刀')+' · '+
    (S.inv.blueprint?'✅ 制作图':'❌ 制作图')+'</div>';
  showPanel('制作台', html);
  var b=document.getElementById('doCraft');
  if(b) b.onclick=function(){
    if(!(S.inv.wood&&S.inv.knife&&S.inv.blueprint)) return;
    S.inv.wood=false; S.inv.blackkey=true;
    hidePanel(); updateHUD();
    toast('黑钥匙制作完成！');
  };
}

function interact(){
  if(S.mode!=='play') return;
  /* 手里有小刀、身边有人：按 E 直接捅 */
  if(S.inv.knife && nearestNpc(1.4)){
    knifeStab(); return;
  }
  var o=nearObj(1.15);
  if(!o){ toast('这里没有可以互动的东西'); return; }
  var f=fl();

  if(o.t==='item'){
    if(S.inv[o.id]){ toast('已经拿过了'); return; }
    S.inv[o.id]=true;
    if(o.id==='flag'){ S.tookFlag=true; }
    removeObj(o);
    updateHUD();
    toast('获得 '+ITEM[o.id].name);
    return;
  }
  if(o.t==='shop'){ openShop(); return; }
  if(o.t==='craft'){ openCraft(); return; }
  if(o.t==='tree'){
    if(S.inv.wood){ toast('这棵树已经被锯过了'); return; }
    if(!S.inv.saw){ toast('需要锯子才能锯树（工具房里有）'); return; }
    S.inv.wood=true;
    updateHUD();
    toast('锯倒了校长的树，获得木头');
    return;
  }
  if(o.t==='switch'){
    if(S.sw[o.id]){ toast('这个电闸已经拉下了'); return; }
    S.sw[o.id]=true; updateHUD();
    var n=0; for(var k in S.sw) if(S.sw[k]) n++;
    toast('拉下'+o.label+'（'+n+'/3）');
    return;
  }
  /* ---------- 新机关 ---------- */
  if(o.t==='cctv'){ tryCctv(o); return; }
  if(o.t==='car'){
    /* 砸车只会发出巨响引来敌人，不再产出木头 */
    if(S.carBroken){ toast('车已经砸烂了'); return; }
    if(!S.inv.hammer){ toast('需要锤子才能砸车'); return; }
    tryCar(o);
    return;
  }
  if(o.t==='stairs'){
    goFloor(o.to,o.tx,o.ty); return;
  }
  if(o.t==='stairWin'){ ending(5); return; }
  if(o.t==='gate'){
    tryGate(o); return;
  }
}

function removeObj(o){
  var f=fl();
  for(var i=0;i<f.objs.length;i++){ if(f.objs[i]===o){ f.objs.splice(i,1); return; } }
}

/* 门 */
var GATE = {
  main:     {need:'redkey',    endingN:2},
  office:   {need:'flag',      endingN:null, label:'权限锁'},
  side:     {need:'yellowkey', endingN:3},
  elec:     {need:null,        endingN:null},
  wall:     {need:null,        endingN:null},
  basement: {need:'blackkey',  endingN:null}
};

function tryGate(o){
  if(o.kind==='elec'){ tryElec(o); return; }
  if(o.kind==='wall'){ tryWall(o); return; }
  var g=GATE[o.kind];
  if(!g) return;
  /* 地狱难度只能走路线四或五：大门、侧门都被封死 */
  if(DIFF[S.diff] && DIFF[S.diff].onlyRoute45 && (o.kind==='main'||o.kind==='side')){
    toast('地狱难度：所有常规出口都被封死了，只能走电子门或地下室');
    return;
  }
  if(o.kind==='basement'){
    if(S.inv.blackkey){ openBasementDoor(); return; }
    toast('地下室门锁着，需要黑钥匙'); return;
  }
  if(o.kind==='office'){
    if(S.inv.flag){ openGateTile(fl(), o); toast('刷工作牌，校长办公室的门开了'); return; }
    toast('校长办公室是权限锁，需要老师的工作牌'); return;
  }
  if(!S.inv[g.need]){
    toast('打不开，需要 '+ITEM[g.need].name);
    return;
  }
  ending(g.endingN);
}

function openBasementDoor(){
  if(!S.inv.blackkey){ toast('需要黑钥匙'); return; }
  S.doorOpen=true;
  toast('地下室门开了，下去吧');
  goFloor('B3',2.5,11.5);
}

/* ================= 结局 ================= */
var ENDINGS = {
  1:{title:'结局一 · 被抓住了', color:'#ef4444',
     desc:'老师第二次抓住了你。你被送到办公室，作业翻倍，逃走计划彻底失败。'},
  2:{title:'结局二 · 大门逃脱', color:'#f59e0b',
     desc:'你借老师的工作牌进了校长办公室，拿到红钥匙，正大光明推开了大门。自由的空气真甜。'},
  3:{title:'结局三 · 侧门逃脱', color:'#eab308',
     desc:'你从小卖部买下黄色钥匙，侧门咔哒一声开了。没人发现你是从侧门溜走的。'},
  4:{title:'结局四 · 地下车库逃脱', color:'#a78bfa',
     desc:'三个电闸全部拉下，你举着锤子砸开铁门，从车库通道走了出去。'},
  5:{title:'结局五 · 地下室逃脱', color:'#38bdf8',
     desc:'锯树、买刀、拿到制作图，你在制作室做出黑钥匙。推开门，走过那段没人知道的楼梯——你赢了。'},
  6:{title:'结局六 · 打电话给原作者', color:'#a855f7',
     desc:'你在地下室的出口旁边站了很久，忽然听见一阵电话铃声。拨出 7777777，电话那头是原作者。<br>「行，我佩服你的实力」—— 你被放行了。'}
};

function ending(n){
  if(S.mode!=='play') return;
  S.mode='end';
  Object.keys(input).forEach(function(k){ input[k]=false; });
  hidePanel();
  var e=ENDINGS[n];
  var el=document.getElementById('endScr');
  var t=document.getElementById('endTitle');
  t.textContent=e.title; t.style.color=e.color;
  t.style.textShadow='0 0 22px '+e.color+'88';
  var extra='';
  if(n===5) extra='<br><br><span style="color:#8ea6c2">从楼梯走到另一个楼梯，就是出口。</span>';
  if(n===6) extra='<br><br><span style="color:#c4a0ff">隐藏结局 · 仅地狱模式可触发</span>';
  document.getElementById('endDesc').innerHTML=e.desc+extra+
    '<br><br><span style="color:#8ea6c2;font-size:12px">难度：'+DIFF[S.diff].name+' · 被抓 '+S.catches+' 次 · 剩余命 '+(S.lives>0?S.lives:0)+'</span>'
    +'<div style="margin-top:8px;font-size:11px;color:#8ea6c2">🏆 本局成就 '+achCount()+'/'+ACH_ORDER.length+
      (cheatBlocksBoard()?' <span style="color:#ff8095">（用过 GM，本局不给成就）</span>':'')+'</div>';
  el.classList.remove('hidden');
  /* 通关（结局 2~5）才结算成就；结局一不算 */
  settleAch(n);
  reportClear(n);            /* 把成绩记进本机 cookie 排行榜 */
}

/* ================= 输入 ================= */
function bindInput(){
  document.addEventListener('keydown',function(e){
    var k=e.key.toLowerCase();
    if(k==='w'||k==='arrowup'){ input.up=true; e.preventDefault(); }
    else if(k==='s'||k==='arrowdown'){ input.down=true; e.preventDefault(); }
    else if(k==='a'||k==='arrowleft'){ input.left=true; e.preventDefault(); }
    else if(k==='d'||k==='arrowright'){ input.right=true; e.preventDefault(); }
    else if(k==='e'){ interact(); }
    else if(k==='v'){ skipTurn(); }
  });
  document.addEventListener('keyup',function(e){
    var k=e.key.toLowerCase();
    if(k==='w'||k==='arrowup') input.up=false;
    else if(k==='s'||k==='arrowdown') input.down=false;
    else if(k==='a'||k==='arrowleft') input.left=false;
    else if(k==='d'||k==='arrowright') input.right=false;
  });

  /* 虚拟方向键：上下左右四个按钮 */
  var btns=document.querySelectorAll('#dpad .btn');
  for(var i=0;i<btns.length;i++){
    (function(b){
      var dir=b.getAttribute('data-dir');
      function on(ev){ ev.preventDefault(); input[dir]=true; b.classList.add('on'); }
      function off(ev){ if(ev) ev.preventDefault(); input[dir]=false; b.classList.remove('on'); }
      b.addEventListener('touchstart',on,{passive:false});
      b.addEventListener('touchend',off,{passive:false});
      b.addEventListener('touchcancel',off,{passive:false});
      b.addEventListener('mousedown',on);
      b.addEventListener('mouseup',off);
      b.addEventListener('mouseleave',off);
    })(btns[i]);
  }

  /* 圆形摇杆（经典模式）：按住拖动，按方向给 input */
  var swrap=document.getElementById('stickWrap');
  var sbase=document.getElementById('stickBase2');
  var sknob=document.getElementById('stickKnob2');
  var sid=null, scenter=null;
  function sCenter(){
    if(!sbase || !sbase.getBoundingClientRect) return {x:0,y:0,rad:70};
    var r=sbase.getBoundingClientRect();
    return {x:r.left+r.width/2, y:r.top+r.height/2, rad:r.width/2};
  }
  function sMove(cx,cy){
    var c=scenter||sCenter();
    var dx=cx-c.x, dy=cy-c.y;
    var d=Math.sqrt(dx*dx+dy*dy);
    var maxR=(c.rad||70)*0.8;
    if(d>maxR && d>0){ dx=dx/d*maxR; dy=dy/d*maxR; d=maxR; }
    if(sknob) sknob.style.transform='translate('+dx+'px,'+dy+'px)';
    var dead=(c.rad||70)*0.18;
    if(d<dead){ input.up=input.down=input.left=input.right=false; return; }
    var nx=dx/maxR, ny=dy/maxR;
    input.right = nx> 0.32;
    input.left  = nx<-0.32;
    input.down  = ny> 0.32;
    input.up    = ny<-0.32;
  }
  function sEnd(){
    sid=null; scenter=null;
    input.up=input.down=input.left=input.right=false;
    if(sknob) sknob.style.transform='translate(0,0)';
  }
  if(swrap && sbase){
    sbase.addEventListener('touchstart',function(ev){
      ev.preventDefault();
      var t=ev.changedTouches[0]; if(!t) return;
      sid=t.identifier; scenter=sCenter();
      sMove(t.clientX,t.clientY);
    },{passive:false});
    sbase.addEventListener('touchmove',function(ev){
      ev.preventDefault();
      for(var k2=0;k2<ev.changedTouches.length;k2++){
        var t=ev.changedTouches[k2];
        if(t.identifier===sid){ sMove(t.clientX,t.clientY); break; }
      }
    },{passive:false});
    sbase.addEventListener('touchend',function(ev){ ev.preventDefault(); sEnd(); },{passive:false});
    sbase.addEventListener('touchcancel',function(ev){ ev.preventDefault(); sEnd(); },{passive:false});
    sbase.addEventListener('mousedown',function(ev){
      ev.preventDefault(); scenter=sCenter();
      sMove(ev.clientX,ev.clientY);
      var mv=function(e){ sMove(e.clientX,e.clientY); };
      var up=function(){ sEnd(); document.removeEventListener('mousemove',mv); document.removeEventListener('mouseup',up); };
      document.addEventListener('mousemove',mv); document.addEventListener('mouseup',up);
    });
  }
  if(typeof refreshPadMode==='function') refreshPadMode();

  var bE=document.getElementById('btnE');
  bE.addEventListener('touchstart',function(e){ e.preventDefault(); bE.classList.add('on'); interact(); },{passive:false});
  bE.addEventListener('touchend',function(e){ e.preventDefault(); bE.classList.remove('on'); },{passive:false});
  bE.addEventListener('click',function(){ interact(); });

  var bV=document.getElementById('btnV');
  bV.addEventListener('touchstart',function(e){ e.preventDefault(); bV.classList.add('on'); skipTurn(); },{passive:false});
  bV.addEventListener('touchend',function(e){ e.preventDefault(); bV.classList.remove('on'); },{passive:false});
  bV.addEventListener('click',function(){ skipTurn(); });

  document.getElementById('panelClose').addEventListener('click',hidePanel);

  /* 难度选择 */
  var ds=document.querySelectorAll('.dbtn[data-diff]');
  for(var j=0;j<ds.length;j++){
    (function(d){
      d.addEventListener('click',function(){
        for(var k=0;k<ds.length;k++) ds[k].classList.remove('on');
        d.classList.add('on');
        S.diff=d.getAttribute('data-diff');
      });
    })(ds[j]);
  }
  /* 玩法模式切换 */
  var ms=document.querySelectorAll('.dbtn[data-mode]');
  for(var q=0;q<ms.length;q++){
    (function(d){
      d.addEventListener('click',function(){
        for(var k=0;k<ms.length;k++) ms[k].classList.remove('on');
        d.classList.add('on');
        S.mode2=d.getAttribute('data-mode');
        if(typeof refreshPadMode==='function') refreshPadMode();
      });
    })(ms[q]);
  }
  document.getElementById('startBtn').addEventListener('click',function(){ startGame(S.diff); });
  var bb=document.getElementById('boardBtn');
  if(bb) bb.addEventListener('click',function(){ openBoard(); });
  var ab=document.getElementById('achBtn');
  if(ab) ab.addEventListener('click',function(){ openAchPage(); });
  var nb=document.getElementById('nameBtn');
  if(nb) nb.addEventListener('click',function(){ askName(); });
  var eb=document.getElementById('expBtn');
  if(eb) eb.addEventListener('click',function(){ exportScores(); });
  /* 主题面板 */
  if(typeof themeBind==='function') themeBind();

  /* 作弊：连点标题 7 次打开 */
  var h1=document.querySelector('h1');
  if(h1) h1.addEventListener('click',function(){ cheatTap(); });
  var cc=document.getElementById('cheatClose');
  if(cc){
    cc.addEventListener('click',function(){ closeCheatPanel(); });
    cc.addEventListener('touchstart',function(e){
      e.preventDefault(); e.stopPropagation();
      closeCheatPanel();
    },{passive:false});
  }
  /* GM 小球：可拖动，轻点展开面板 */
  var gb=document.getElementById('gmBall');
  if(gb){
    var gDrag=false, gMoved=false, gSX=0, gSY=0, gOX=0, gOY=0;
    function gStart(e){
      var t=e.touches? e.touches[0] : e;
      gDrag=true; gMoved=false;
      gSX=t.clientX; gSY=t.clientY;
      var r=gb.getBoundingClientRect();
      gOX=r.left; gOY=r.top;
      gb.style.right='auto'; gb.style.bottom='auto';
      gb.style.left=gOX+'px'; gb.style.top=gOY+'px';
    }
    function gMoveH(e){
      if(!gDrag) return;
      var t=e.touches? e.touches[0] : e;
      var dx=t.clientX-gSX, dy=t.clientY-gSY;
      if(Math.abs(dx)+Math.abs(dy)>6) gMoved=true;
      gb.style.left=(gOX+dx)+'px';
      gb.style.top =(gOY+dy)+'px';
      if(e.cancelable) e.preventDefault();
    }
    function gEnd(e){
      if(!gDrag) return;
      gDrag=false;
      /* 没怎么移动 = 当成点击，展开面板 */
      if(!gMoved) toggleCheatPanel();
    }
    gb.addEventListener('mousedown',gStart);
    gb.addEventListener('touchstart',gStart,{passive:true});
    document.addEventListener('mousemove',gMoveH);
    document.addEventListener('touchmove',gMoveH,{passive:false});
    document.addEventListener('mouseup',gEnd);
    document.addEventListener('touchend',gEnd);
    document.addEventListener('touchcancel',gEnd);
  }
  var cp=document.getElementById('cheatPanel');
  var ch=document.getElementById('cheatHead');
  if(cp && ch) makeDraggable(cp, ch);
  document.getElementById('againBtn').addEventListener('click',function(){ startGame(S.diff); });
  document.getElementById('backMenuBtn').addEventListener('click',function(){
    S.mode='menu';
    document.getElementById('endScr').classList.add('hidden');
    document.getElementById('startScr').classList.remove('hidden');
  });
}
/* ================= 新机关：监控 / 保安室 / 校长的车 / 电子门 / 砖墙 ================= */

/* 保安室的监控总闸：关掉后全场监控失效 */
function tryCctv(o){
  if(S.camsOff){ toast('监控已经关掉了'); return; }
  S.camsOff=true;
  updateHUD();
  toast('拉下监控总闸：全楼的监控都黑了');
}

/* 校长的车：锤子砸烂 → 巨大响声 → 把同层敌人全招过来 */
function tryCar(o){
  if(S.carBroken){ toast('车已经砸烂了'); return; }
  if(!S.inv.hammer){ toast('需要锤子才能砸车'); return; }
  S.carBroken=true;
  updateHUD();
  /* 巨大响声：附近敌人直接闻声过来 */
  var f=fl();
  for(var i=0;i<S.npcs.length;i++){
    var n=S.npcs[i];
    if(n.floor!==S.floor) continue;
    var d=Math.sqrt(Math.pow(n.x-o.x,2)+Math.pow(n.y-o.y,2));
    if(d<12){
      n.alertT=2.5;
      setPath(n, f, o.x, o.y);
      n.noiseX=o.x; n.noiseY=o.y; n.noiseT=6.0;
    }
  }
  toast('砰！车被砸烂了，响声把附近的老师引了过来');
  settleCarAch();
}

/* 电子门：需要三个电闸全部拉下才通得上电 */
function tryElec(o){
  if(S.elecOpen){ toast('电子门已经打开了'); return; }
  var n=0; for(var k in S.sw) if(S.sw[k]) n++;
  if(n<3){ toast('电子门没电：三个电闸只关了 '+n+'/3'); return; }
  S.elecOpen=true;
  updateHUD();
  /* 开门：把门所在格的墙打通 */
  var f=fl();
  openGateTile(f, o);
  toast('电子门通电打开了，但后面那堵墙还挡着路');
}

/* 电子门后面的砖墙：用锤子砸开 */
function tryWall(o){
  if(S.wallBroken){ toast('砖墙已经砸开了'); return; }
  if(!S.elecOpen){ toast('砖墙后面是活断路器，先打开电子门通上电'); return; }
  if(!S.inv.hammer){ toast('需要锤子才能砸开砖墙'); return; }
  S.wallBroken=true;
  var f=fl();
  openGateTile(f, o);
  updateHUD();
  ending(4);
}

/* 把门所在格打通（门就是一格墙） */
function openGateTile(f, o){
  if(!f) return;
  var ix=Math.floor(o.x), iy=Math.floor(o.y);
  for(var dy=-1;dy<=1;dy++){
    for(var dx=-1;dx<=1;dx++){
      var x=ix+dx, y=iy+dy;
      if(x<0||y<0||x>=f.w||y>=f.h) continue;
      if(!f.g[y] || f.g[y][x]===undefined) continue;
      if(Math.abs(dx)+Math.abs(dy)>1) continue;
      f.g[y][x]=0;
    }
  }
  /* 打开后把门对象移除，别再挡互动 */
  for(var i=0;i<f.objs.length;i++){ if(f.objs[i]===o){ f.objs.splice(i,1); break; } }
}