/* ================= 抓人规则常量 ================= */
/* 规则：贴身（<CATCH_RANGE）立刻被抓；在任何敌人的视野范围内持续待满 SEE_LIMIT 秒也被抓 */
var SEE_LIMIT = 3.0;
var SAFE_SHIELD = 2.5;   /* 被抓送回后的无敌保护秒数 */

/* ================= 状态 ================= */
var S = {
  mode:'menu',
  diff:'normal',
  floor:'1F',
  px:4.5, py:3.5,
  faceDir:'down',
  walkPhase:0,
  inv:{},

  catches:0,
  sw:{},
  npcs:[],
  msgT:0,
  time:0,
  stairLock:0,     /* 刚下楼的冷却，防止立刻触发对侧楼梯 */
  tookFlag:false,
  gogglesT:0,      /* 旧字段：保留兼容 */
  shopPick:'',     /* 本局在小卖部选的东西（每局只能买一个） */
  seeLimit:3.0,    /* 被发现所需的秒数（隐身针会把它变成 5 秒） */
  useT:0,          /* 正在使用道具的剩余秒数（可乐/隐身针要 3 秒，期间不能动） */
  useItem:'',      /* 正在使用的道具 id */
  colaT:0,         /* 可乐加速剩余秒数（10 秒） */
  stealthT:0,      /* 隐身针剩余秒数（30 秒，期间监控看不见） */
  speedMul:1,      /* 移动速度倍率 */
  stepT:0,         /* 当前一格移动的剩余时间（>0 表示正在滑动） */
  stepLocked:false,/* 走完一格后锁定，必须松开按键才能再走 */
  stepKey:'',      /* 触发这一步的按键 */
  needEnemyTurn:false, /* 玩家走完一格 → 敌人该行动了 */
  turnBusy:false,   /* 敌人这一回合还在演，玩家暂时不能走 */
  enemyAnimT:0,     /* 敌人回合动画剩余时间 */
  enemyFrom:null,
  mode2:'turn',    /* 玩法模式：turn 回合制 / classic 摇杆+全地图 */
  stepVel:0,
  turnDone:false,
  stepDur:0.14,    /* 一格移动的时长 */
  stepFromX:0, stepFromY:0, stepToX:0, stepToY:0,
  flashLike:false,  /* 是否已经拿了手电筒（只能在一个地下室用） */
  flashFloor:'',    /* 手电筒绑定的那一个地下室楼层 */
  flashOn:false,    /* 手电筒是否点亮 */
  usedFlashPick:false, /* 手电筒是通过商店拿的（本局唯一） */
  moving:false,    /* 本帧是否真的产生了位移（撞墙时为 false） */
  eyeX:0, eyeY:0,  /* 眼睛偏移的平滑插值，避免朝向切换时抖动 */
  bobCur:0,        /* 走路上下浮动的平滑插值 */
  seeT:0,          /* 当前被某个敌人盯住的累计秒数（用于 HUD 警戒条） */
  seenBy:'',       /* 正在盯着玩家的敌人名字 */
  safeT:0,         /* 被抓送回后的短暂无敌保护（秒） */
  camsOff:false,   /* 保安室的监控总闸是否已关 */
  carBroken:false, /* 校长的车是否已被锤子砸烂（会发出巨大响声） */
  elecOpen:false,  /* 电子门是否已通电打开（需要三个电闸） */
  wallBroken:false,/* 电子门后的砖墙是否已被锤子砸开 */
  lives:2,         /* 剩余命数（地狱模式只有 1 条） */
  everSpotted:false,/* 本局是否曾经被发现过（成就用） */
  knifeKills:0,    /* 用小刀解决掉的敌人数（成就用） */
  _scale:30
};

/* ================= 成就（只存在内存里，重启/重开就没了） ================= */
/* tier: gold 金 / red 红 / blue 蓝 */
var ACH = {
  clear_any:  {name:T('逃出去了'),        desc:T('任意难度通关一次'),              tier:'blue'},
  clear_hard: {name:T('硬骨头'),          desc:T('在困难难度通关'),                tier:'gold'},
  clear_hell: {name:T('地狱归来'),        desc:T('在地狱难度通关'),                tier:'red'},
  car_any:    {name:T('砸车的人'),        desc:T('砸烂校长的车'),                  tier:'gold'},
  car_hell:   {name:T('地狱砸车'),        desc:T('在地狱难度砸烂校长的车'),        tier:'red'},
  no_alert:   {name:T('隐身人'),          desc:T('一次都没有被发现就通关'),        tier:'gold'},
  swift:      {name:T('闪电逃学'),        desc:T('3 分钟内通关'),                  tier:'blue'},
  knife_win:  {name:T('以小博大'),        desc:T('用小刀解决过一个敌人后通关'),    tier:'gold'},
  survivor:   {name:T('命大'),            desc:T('被抓住一次之后仍然通关'),        tier:'blue'},
  cctv_off:   {name:T('保安之友'),        desc:T('关掉全楼监控并通关'),            tier:'blue'},
  all_gates:  {name:T('开锁匠'),          desc:T('通关时同时拿到了工作牌和黑钥匙'),tier:'gold'},
  phone_end:  {name:T('打通了原作者的专线'), desc:T('用 7777777 在地下室拨通那通神秘电话（地狱限定）'), tier:'rainbow'}
};
var ACH_ORDER = ['clear_any','clear_hard','clear_hell','car_any','car_hell',
                 'no_alert','swift','knife_win','survivor','cctv_off','all_gates','phone_end'];
/* 成就等级 → 颜色 */
function achColor(tier){
  if(tier==='gold') return '#fbbf24';
  if(tier==='red') return '#f43f5e';
  if(tier==='blue') return '#38bdf8';
  if(tier==='rainbow') return '#ff5ec4';
  return '#94a3b8';
}
function achTierName(tier){
  if(tier==='gold') return T('金');
  if(tier==='red') return T('红');
  if(tier==='blue') return T('蓝');
  if(tier==='rainbow') return T('炫彩');
  return '—';
}
/* 成就在本地持久保存：localStorage + cookie 双写，刷新/重开都还在 */
var ACH_KEY='efs_ach_v1';
var ACH_OWNED = {};
function achLoad(){
  var raw=null;
  try{ raw=localStorage.getItem(ACH_KEY); }catch(e){}
  if(!raw){ raw=readCookie(ACH_KEY); }
  if(raw){
    try{
      var data=JSON.parse(raw);
      if(data && !Array.isArray(data) && typeof data==='object'){
        /* 新格式：{ id: 次数 } */
        for(var k in data){
          if(!ACH[k]) continue;
          var n=parseInt(data[k],10)||0;
          if(n>0){ ACH_OWNED[k]=true; ACH_COUNT[k]=n; }
        }
      } else if(data && data.length){
        /* 旧格式：["id","id"] → 视为各 1 次 */
        for(var i=0;i<data.length;i++){
          if(ACH[data[i]]){ ACH_OWNED[data[i]]=true; ACH_COUNT[data[i]]=1; }
        }
      }
    }catch(e){}
  }
  return ACH_OWNED;
}
function achSave(){
  var obj={};
  for(var k in ACH){
    var n=achCountOf(k);
    if(n>0) obj[k]=n;
  }
  var raw=JSON.stringify(obj);
  try{ localStorage.setItem(ACH_KEY, raw); }catch(e){}
  writeCookie(ACH_KEY, raw, 3650);      /* 10 年 */
}
function readCookie(name){
  var all='';
  try{ all=document.cookie||''; }catch(e){ return null; }
  if(!all) return null;
  var m=all.match(new RegExp('(?:^|; )'+name+'=([^;]*)'));
  return m? decodeURIComponent(m[1]) : null;
}
function writeCookie(name,val,days){
  try{
    if(days===0){
      /* 删除 cookie：过期时间设到过去 */
      document.cookie=name+'=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      return;
    }
    var d=new Date(); d.setTime(d.getTime()+days*86400000);
    document.cookie=name+'='+encodeURIComponent(val)+';expires='+d.toUTCString()+';path=/;SameSite=Lax';
  }catch(e){}
}

/* 解锁成就：GM 用过（本局）一律不给 */
/* ================= 成就存储 =================
   ACH_OWNED[id]  = true 表示已解锁（兼容旧数据）
   ACH_COUNT[id]  = 获得次数（>=1）
*/
var ACH_COUNT = {};

function achCountOf(id){
  if(ACH_COUNT[id]) return ACH_COUNT[id];
  return ACH_OWNED[id] ? 1 : 0;      /* 旧数据只有 true，视为 1 次 */
}
function achTotalUnlocked(){
  var n=0; for(var k in ACH) if(achCountOf(k)>0) n++;
  return n;
}
function achTotalTimes(){
  var n=0; for(var k in ACH) n+=achCountOf(k);
  return n;
}
/* 地狱只有 1 条命，这两个成就条件不成立，不给 */
var HELL_BANNED_ACH = { no_alert:true, survivor:true };

function unlockAch(id){
  if(!ACH[id]) return false;
  if(cheatBlocksBoard()) return false;       /* 用过 GM → 不给任何成就 */
  if(S.diff==='hell' && HELL_BANNED_ACH[id]) return false;


  var first = !ACH_OWNED[id];                /* 是否首次解锁 */
  ACH_OWNED[id]=true;
  ACH_COUNT[id]=achCountOf(id)+1;            /* 累计次数 +1 */
  achSave();

  var t=ACH[id];
  var col = achColor(t.tier);
  var times = ACH_COUNT[id];
  if(first){
    toast('🏆 成就解锁：'+t.name+'（'+t.desc+'）');
  } else {
    toast('🏆 '+t.name+' ×'+times);
  }
  queueAchPopup(id, col, first, times);
  renderAchChip();
  return true;
}
function achCount(){ return achTotalUnlocked(); }
function renderAchChip(){
  var el=document.getElementById('achChip');
  if(!el) return;
  el.textContent='🏆 '+achCount()+'/'+ACH_ORDER.length;
}
/* 成就弹窗：跟 toast 不同，它会停 3 秒并高亮 */
/* 成就弹出队列：多个成就依次显示，不会互相覆盖 */
var achQueue=[], achPopping=false;

var ACH_SHOW_MS = 2500;   /* 每条成就显示多久 */

function queueAchPopup(id, col, first, times){
  achQueue.push({id:id, col:col, first:first, times:times});
  if(!achPopping) nextAchPopup();
  else syncAchRemain();   /* 正在弹的时候又来了新的：顺手更新「还有 N 个」 */
}
function nextAchPopup(){
  clearTimeout(achQueue._tm);
  achQueue._tm=null;
  if(!achQueue.length){
    /* 队列空了：把最后一条收掉（这一步以前漏了，导致最后一个弹窗一直挂着） */
    achPopping=false;
    hideAchPopup();
    return;
  }
  achPopping=true;
  var item=achQueue.shift();
  showAchPopup(item.id, item.col, item.first, item.times);
  achQueue._tm=setTimeout(function(){ nextAchPopup(); }, ACH_SHOW_MS);   /* 每条显示 2.5 秒 */
}
/* 只更新「还有 N 个成就待显示」这一行，不动当前弹窗内容 */
function syncAchRemain(){
  var box=document.getElementById('achPop');
  if(!box) return;
  if(!box.innerHTML) return;
  var txt = achQueue.length ? '<br><span style="font-size:10px;color:#7d90a5">还有 '+achQueue.length+' 个成就待显示…</span>' : '';
  /* 用标记切掉旧的一行再拼新的，避免依赖 getElementById */
  var MARK='<br><span style="font-size:10px;color:#7d90a5">还有 ';
  var i=box.innerHTML.indexOf(MARK);
  var base = (i>=0) ? box.innerHTML.slice(0, i) : box.innerHTML;
  if(txt) box.innerHTML = base + txt;
  else if(i>=0) box.innerHTML = base;
}
/* 淡出成就弹窗 */
function hideAchPopup(){
  var box=document.getElementById('achPop');
  if(!box) return;
  box.style.opacity='0';
  box.style.transform='translateY(-8px)';
  box.innerHTML='';
}
/* 清空队列（重开一局时调用） */
function resetAchPopup(){
  achQueue.length=0;
  clearTimeout(achQueue._tm);
  achQueue._tm=null;
  achPopping=false;
  hideAchPopup();
}

function showAchPopup(id, col, first, times){
  var box=document.getElementById('achPop');
  if(!box) return;
  var t=ACH[id];
  var head = first ? '成就解锁' : '成就再次达成';
  var badge = (times>1) ? ' <span style="color:'+col+';font-weight:700">×'+times+'</span>' : '';
  var remain = achQueue.length ? '<br><span style="font-size:10px;color:#7d90a5">还有 '+achQueue.length+' 个成就待显示…</span>' : '';
  box.innerHTML='<span style="font-size:20px">🏆</span> <b style="color:'+col+'">'+t.name+'</b>'+badge+
    '<br><span style="font-size:10px;color:'+col+';opacity:.8">'+head+'</span>'+
    '<br><span style="font-size:11px;color:#b6c9dd">'+t.desc+'</span>'+remain;
  box.style.borderColor=col;
  box.style.opacity='1';
  box.style.transform='translateY(0)';
}
/* 成就页：主界面点「🏆 成就」打开，列出全部成就与解锁状态 */
function openAchPage(){
  var UC=themeUiColors();
  var html='<div class="achList">';
  for(var i=0;i<ACH_ORDER.length;i++){
    var id=ACH_ORDER[i], a=ACH[id];
    var has=!!ACH_OWNED[id];
    var times=achCountOf(id);
    var col = achColor(a.tier);
    var timesTag = times>1 ? ' <span style="color:'+col+';font-size:11px;font-weight:700">×'+times+'</span>' : '';
    html+='<div class="achRow'+(has?' got':'')+'">'+
      '<div class="achDot" style="background:'+(has?col:UC.dotOff)+
        ';box-shadow:'+(has?('0 0 10px '+col):'none')+'"></div>'+
      '<div class="achTxt">'+
        '<b style="color:'+(has?col:UC.dim)+'">'+(has?a.name:T('？？？'))+'</b>'+timesTag+'<br>'+
        '<span class="achDesc">'+(has?a.desc:T('尚未解锁'))+
          (HELL_BANNED_ACH[id]?' <span style="color:'+UC.warn+'">'+T('（地狱不给）')+'</span>':'')+
        '</span>'+
      '</div>'+
      '<div class="achTag" style="color:'+(has?col:UC.faint)+'">'+
        achTierName(a.tier)+'</div>'+ 
    '</div>';
  }
  html+='</div>';
  html+='<div style="margin-top:8px;font-size:11px;color:'+UC.sub+';line-height:1.7">'+
    T('已解锁')+' <b style="color:'+UC.title+'">'+achTotalUnlocked()+'</b> / '+ACH_ORDER.length+
    ' '+T('累计达成')+' <b style="color:'+UC.gold+'">'+achTotalTimes()+'</b> '+T('次')+
    ' <span style="color:'+UC.warn+'">'+T('（用 GM 的那一局不给成就）')+'</span></div>';
  showPanel('🏆 成就', html);
}
/* 结局六解锁标记：通关任意一次后被解锁，写在 cookie 里永久有效 */
var UNLOCK_KEY='efs_clear_once';
function markCleared(){
  writeCookie(UNLOCK_KEY,'1',3650);
  refreshEndingList();
}
function isEnding6Unlocked(){
  return readCookie(UNLOCK_KEY)==='1';
}
/* 刷新主界面结局列表里的 ⑥ */
function refreshEndingList(){
  var el=document.getElementById('endMystery');
  if(!el) return;
  if(isEnding6Unlocked()){
    el.innerHTML='<span style="color:#c4a0ff">选择<b>地狱</b>难度 → 一路逃到<b>地下室</b> → 站在出口 EXIT 旁边<b>不动 5 秒</b> → '+
      '弹出拨号界面 → 输入 <b>7777777</b> 拨打 → 与原作者对话 → 通关（隐藏结局）</span>';
    el.style.opacity='1';
  } else {
    el.textContent='？？？';
    el.style.opacity='.6';
  }
}

/* 通关时统一结算成就 */
function settleAch(endingN){
  if(!(endingN>=2 && endingN<=6)) return;
  if(!boardAllowed()) return;   /* 作弊：不给成就 */
  var d=DIFF[S.diff]||DIFF.normal;
  unlockAch('clear_any');
  if(S.diff==='hard') unlockAch('clear_hard');
  if(S.diff==='hell') unlockAch('clear_hell');
  if(!S.everSpotted) unlockAch('no_alert');
  if(S.time<=180) unlockAch('swift');
  if(S.knifeKills>0) unlockAch('knife_win');
  if(S.catches>0) unlockAch('survivor');
  if(S.camsOff) unlockAch('cctv_off');
  if(S.inv.flag && S.inv.blackkey) unlockAch('all_gates');
}
/* 砸车成就：砸的当下就给 */
function settleCarAch(){
  if(cheatBlocksBoard()) return;     /* 用过 GM → 砸车也不给成就 */
  unlockAch('car_any');
  if(S.diff==='hell') unlockAch('car_hell');
}
/* GM 面板一被打开，本局立即作废（不给成就 / 不记排行榜） */
function cheatMarkUsed(){
  CHEAT.banned=true;
  cheatDisableBoard();
}

var input = {up:false,down:false,left:false,right:false};

function toast(txt){
  var el=document.getElementById('toast');
  if(!el) return;
  /* 【为什么要在这里翻译】2D 里所有提示（拿到道具、被抓、开门失败……）
     都走 toast()，原来直接把中文塞进 textContent，切英文后全是中文。
     在出口统一翻一次，比去改 400 多个调用点安全得多。
     T() 找不到译文时原样返回中文，不会变成 undefined。 */
  if(typeof T === 'function') txt = T(txt);
  el.textContent=txt;
  el.classList.add('show');
  S.msgT=1.9;
}

function updateHUD(){
  var f=fl();
  var fe=document.getElementById('floorName');
  if(fe) fe.textContent = f? f.name : '';
  var cn=document.getElementById('catchN'); if(cn) cn.textContent=S.catches;
  var ln=document.getElementById('lifeN'); if(ln) ln.textContent=(S.lives>0?S.lives:0);
  var lc=document.getElementById('lifeChip');
  if(lc) lc.style.color = (S.lives<=1)? '#ff8095':'';
  var mc=document.getElementById('modeChip');
  if(mc) mc.textContent = (S.mode2==='classic') ? (typeof T==='function'?T('经典'):'经典') : (typeof T==='function'?T('回合'):'回合');
  renderAchChip();

  var swN=0; for(var k in S.sw) if(S.sw[k]) swN++;
  var chip=document.getElementById('swChip');
  if(chip) chip.style.display = (swN>0 || S.inv.hammer) ? '' : 'none';
  var sn=document.getElementById('swN'); if(sn) sn.textContent=swN;

  var row=document.getElementById('invRow'), html='';
  if(row){
    for(var i=0;i<INV_ORDER.length;i++){
      var id=INV_ORDER[i];
      if(!S.inv[id]) continue;
      var usable = (id==='cola'||id==='stealth'||id==='torch');
      html += '<div class="chip'+(usable?' use':'')+'" data-use="'+id+'"'+
        ' style="border-color:'+ITEM[id].color+'66'+(usable?';cursor:pointer':'')+'">'+
        ITEM[id].icon+' '+ITEM[id].name+(usable?' ·点':'')+'</div>';
    }
    row.innerHTML = html;
    var chips=row.querySelectorAll('.chip.use');
    for(var c=0;c<chips.length;c++){
      (function(el){
        var id=el.getAttribute('data-use');
        var lastT=0;
        el.onclick=function(){
          /* 触摸后浏览器还会补发一次 click，这里去重 */
          if(Date.now()-lastT<600) return;
          startUse(id);
        };
        el.addEventListener('touchstart',function(ev){
          ev.preventDefault();
          lastT=Date.now();
          el.classList.add('on');
          startUse(id);
        },{passive:false});
        el.addEventListener('touchend',function(){ el.classList.remove('on'); });
        el.addEventListener('touchcancel',function(){ el.classList.remove('on'); });
      })(chips[c]);
    }
  }
  var ht=document.getElementById('hintText');
  if(ht) ht.textContent = hintFor();
  updateSeeHUD();
}

/* 被发现进度条：只要有人看着你，就把 3 秒倒计时显示出来 */
function updateSeeHUD(){
  var wrap=document.getElementById('seeWrap');
  var bar=document.getElementById('seeBar');
  var txt=document.getElementById('seeTxt');
  if(!wrap) return;
  var lim = (typeof S.seeLimit==="number"? S.seeLimit : SEE_LIMIT);
  var pct = Math.max(0, Math.min(1, (S.seeT||0)/lim));
  if(pct>0.001){ wrap.classList.add('on'); } else { wrap.classList.remove('on'); }
  if(bar) bar.style.width = Math.round(pct*100)+'%';
  if(txt && pct>0.001){
    txt.textContent = (S.seenBy?('⚠ '+S.seenBy+' 盯着你 '):'⚠ 被发现 ')
      + Math.max(0,lim-S.seeT).toFixed(1) + 's';
  }
}

function hintFor(){
  var f=fl(); if(!f) return '';
  var r=roomAt(f,S.px,S.py);
  if(r && r.safe) return '当前在 '+r.name+'（安全区）· 按 V 跳过一回合';
  var o=nearObj(1.15);
  if(o){
    if(o.t==='shop')   return '按 E 打开小卖部';
    if(o.t==='craft')  return '按 E 使用制作台';
    if(o.t==='stairs') return '按 E 前往 '+W[o.to].name;
    if(o.t==='stairWin')return '走近这里就能逃出去';
    if(o.t==='gate')   return '按 E 尝试打开'+o.label;
    if(o.t==='tree')   return '按 E 锯树（需要锯子）';
    if(o.t==='switch') return '按 E 拉闸';
    if(o.t==='cctv')   return '按 E 拉下监控总闸（全楼监控停摆）';
    if(o.t==='car')    return S.inv.hammer?'按 E 用锤子砸校长的车':'校长的车（需要锤子，砸了会掉木头）';
    if(o.t==='camera') return '这是监控，别在它视野里停留';
    if(o.t==='item')   return '按 E 拾取 '+ITEM[o.id].name;
  }
  if(S.useT>0) return '正在用 '+ITEM[S.useItem].name+'…别动';
  if(S.inv.knife && nearestNpc(1.4)) return '按 E 用小刀捅他（25% 概率）';
  return 'WASD / 方向键移动，别被老师看见';
}

function roomAt(f,x,y){
  if(!f) return null;
  for(var i=0;i<f.rooms.length;i++){
    var r=f.rooms[i];
    if(x>=r.x0-0.5 && x<=r.x1+1.5 && y>=r.y0-0.5 && y<=r.y1+1.5) return r;
  }
  return null;
}

/* 返回距离玩家最近、且在半径内的对象 */
function nearObj(rad){
  var f=fl(); if(!f) return null;
  var best=null, bd=1e9;
  for(var i=0;i<f.objs.length;i++){
    var o=f.objs[i];
    var d=Math.sqrt(Math.pow(o.x-S.px,2)+Math.pow(o.y-S.py,2));
    if(d<=rad && d<bd){ bd=d; best=o; }
  }
  return best;
}

/* ================= 初始化 ================= */
function startGame(diff){
  buildWorld();
  S.diff=diff||S.diff;
  S.mode='play';
  S.floor='2F';
  S.px=4.5; S.py=3.5;          /* 教室中央（二层教室层） */
  S.faceDir='down'; S.walkPhase=0;
  S.inv={}; S.catches=0; S.sw={};
  S.msgT=0; S.time=0; S.stairLock=0; S.tookFlag=false; S.gogglesT=0;
  S.shopPick=''; S.seeLimit=(DIFF[S.diff]||DIFF.normal).see; S.speedMul=1;
  S.lives=(DIFF[S.diff]||DIFF.normal).lives; S.everSpotted=false; S.knifeKills=0;
  S.useT=0; S.useItem=''; S.colaT=0; S.stealthT=0;
  S.stepT=0; S.stepDur=0.14;
  S.stepLocked=false; S.stepKey=''; S.needEnemyTurn=false; S.turnDone=false;
  S.turnBusy=false; S.enemyAnimT=0; S.enemyFrom=null;
  S.flashLike=false; S.flashFloor=''; S.flashOn=false; S.usedFlashPick=false;
  /* 新开一局：作弊状态重置（作弊只在本局生效，重开需要重新连点标题） */
  CHEAT.noClip=false; CHEAT.god=false; CHEAT.fast=false; CHEAT.torchAll=false; CHEAT.on=false; CHEAT.banned=false;
  writeCookie('efs_noboard','',0);
  if(typeof updateCheatTag==='function') updateCheatTag();
  S.camsOff=false; S.carBroken=false; S.elecOpen=false; S.wallBroken=false;
  S.moving=false; S.bobCur=0; S.eyeX=0; S.eyeY=0;
  S.seeT=0; S.seenBy=''; S.safeT=0;
  S.npcs=spawnNpcs(S.diff);
  S._noCam=true;
  for(var k in input) input[k]=false;

  var ss=document.getElementById('startScr'); if(ss) ss.classList.add('hidden');
  var es=document.getElementById('endScr');   if(es) es.classList.add('hidden');
  hidePanel();
  if(typeof refreshPadMode==='function') refreshPadMode();
  if(typeof resetAchPopup==='function') resetAchPopup();   /* 清掉上一局残留的成就弹窗 */
  updateHUD();
  toast('任务：找一条路逃出学校');
}

/* 找同层最近的敌人 */
function nearestNpc(rad){
  var best=null, bd=rad;
  for(var i=0;i<S.npcs.length;i++){
    var n=S.npcs[i];
    if(n.floor!==S.floor) continue;
    var d=Math.sqrt(Math.pow(n.x-S.px,2)+Math.pow(n.y-S.py,2));
    if(d<bd){ bd=d; best=n; }
  }
  return best;
}
/* ================= 跨楼层巡逻：NPC 会自己上下楼 ================= */
/* 思路：
   1) 每个 NPC 记一个 n.plan（他打算去哪个楼层）。plan 与当前楼层不同时，
      就按 FLOOR_CHAIN 的层级顺序，选择「往目标方向走的那一段楼梯」作为下一站，
      走到楼梯格再换层。这样上下楼是有目的的，不会来回乱跳。
   2) 每层楼梯都有 to/tx/ty，换层后坐标直接落在对侧楼梯口。
   3) 难度越高，NPC 换楼的欲望越强（rollPlan 的间隔与概率）。
*/
/* 该楼层通往「更上」或「更下」的楼梯 */
function stairToward(fl, targetIdx){
  var f=W[fl]; if(!f) return null;
  var cur=chainIdx(fl);
  var best=null, bestScore=-99;
  for(var i=0;i<f.objs.length;i++){
    var o=f.objs[i];
    if(o.t!=='stairs') continue;
    var ti=chainIdx(o.to);
    if(ti<0) continue;
    /* 是否朝目标方向：按「离目标更近」打分 */
    var score = Math.abs(ti-targetIdx)-Math.abs(cur-targetIdx);   /* <0 表示更靠近目标 */
    score = -score;
    if(ti===cur) continue;
    if(score>bestScore){ bestScore=score; best=o; }
  }
  return best;
}

/* 给 NPC 挑下一个想去的楼层 */
function rollPlan(n){
  var cur=chainIdx(n.floor);
  var lo=0, hi=FLOOR_CHAIN.length-1;
  var d=DIFF[S.diff] || DIFF.normal;
  /* 难度越高，越爱跨层（1F/2F 是玩家主要活动层，更容易被盯上） */
  var span = d.roam || 2;
  var pick=cur+(Math.random()<0.5?-1:1)*Math.ceil(Math.random()*span);
  pick=clampi(pick, lo, hi);
  if(pick===cur) pick=clampi(cur+(Math.random()<0.5?-1:1), lo, hi);
  n.plan=FLOOR_CHAIN[pick];
  n.planT = (d.replan || 9) + Math.random()*6;
}

function sameFloorObj(f,x,y,t){
  for(var i=0;i<f.objs.length;i++){
    var o=f.objs[i];
    if(o.t===t && Math.abs(o.x-x)<0.6 && Math.abs(o.y-y)<0.6) return o;
  }
  return null;
}
function spawnNpcs(diff){
  var d=DIFF[diff] || DIFF.normal;
  var out=[];
  /* 班主任：从二层教室层出发，复活点在老师办公室 */
  out.push({
    kind:'teacher', name:'班主任', floor:'2F',
    home:{x:11.5, y:2.5},
    sight:d.sight, cone:0.66, speed:d.tspeed
  });
  /* 保安从各层楼梯口开始巡逻 */
  var gset=[
    {floor:'1F', home:{x:3.5,y:13.5}},
    {floor:'B1', home:{x:2.5,y:8.5}},
    {floor:'B2', home:{x:2.5,y:8.5}}
  ];
  for(var i=0;i<d.guards;i++){
    var gs=gset[i%gset.length];
    out.push({
      kind:'guard', name:'保安'+(i+1), floor:gs.floor,
      home:{x:gs.home.x, y:gs.home.y},
      sight:d.sight+0.6, cone:0.58, speed:d.gspeed
    });
  }

  for(var j=0;j<out.length;j++){
    var n=out[j];
    n.x=n.home.x; n.y=n.home.y;
    n.dir=Math.PI/2;
    n.state='patrol';
    n.ri=0; n.path=null; n.pathT=0;
    n.flash=0; n.alertT=0; n.stuckT=0; n.lastX=n.x; n.lastY=n.y;
    n.plan=n.floor; n.planT=4+Math.random()*8;   /* 想去的楼层 + 换计划的倒计时 */
    n.idleT=0; n.stairGo=null;                     /* 正在赶往的楼梯 */
    n.offFloor=true;                               /* 是否在后台层（非玩家所在层） */
  }
  return out;
}/* ================= 玩家移动 ================= */
function canStand(f,x,y){
  if(!f) return false;
  var r=0.20;                      /* 碰撞箱从 0.30 缩到 0.20，窄门才过得去 */
  if(isWall(f,x-r,y-r)) return false;
  if(isWall(f,x+r,y-r)) return false;
  if(isWall(f,x-r,y+r)) return false;
  if(isWall(f,x+r,y+r)) return false;
  return true;
}

function movePlayer(dt){
  var f=fl(); if(!f) return;

  /* 正在喝可乐 / 打隐身针：3 秒内不能移动 */
  if(S.useT>0){ S.moving=false; return; }

  /* 回合制：敌人还在走这一回合，等它走完再轮到玩家 */
  if(S.mode2!=='classic' && S.turnBusy){ S.moving=false; return; }

  /* ============ 经典模式：摇杆/按键连续移动，敌人也连续行动 ============ */
  if(S.mode2==='classic'){
    var cmx=0,cmy=0;
    if(input.left)  cmx-=1;
    if(input.right) cmx+=1;
    if(input.up)    cmy-=1;
    if(input.down)  cmy+=1;
    if(cmx===0&&cmy===0){ S.moving=false; return; }
    var clen=Math.sqrt(cmx*cmx+cmy*cmy);
    cmx/=clen; cmy/=clen;
    var csp=PLAYER_SPEED*(S.speedMul||1)*(CHEAT.fast?2:1)*dt;
    var cox=S.px, coy=S.py;
    var cnx=S.px+cmx*csp;
    if(CHEAT.noClip){ S.px=cnx; } else if(canStand(f,cnx,S.py)) S.px=cnx;
    var cny=S.py+cmy*csp;
    if(CHEAT.noClip){ S.py=cny; } else if(canStand(f,S.px,cny)) S.py=cny;
    var cdx=S.px-cox, cdy=S.py-coy;
    S.moving=(Math.abs(cdx)+Math.abs(cdy))>0.0005;
    S.faceDir = cmy>0?'down':(cmy<0?'up':(cmx>0?'right':'left'));
    if(S.moving) S.walkPhase += csp*3.4;
    return;
  }

  /* ============ 回合制：按一下走一格，必须松开才能再走 ============ */

  /* ---------- 按格移动（一次一格，必须松开按键才能再走） ----------
     按一下方向 → 校验目标格 → 平滑滑过去 → 停住。
     按住不放不会连续走，必须松开再按。 */
  if(S.stepT>0){
    /* 正在滑向目标格 */
    S.stepT-=dt;
    var k=1-Math.max(0,S.stepT)/S.stepDur;      /* 0→1 进度 */
    if(k>1) k=1;
    S.px=S.stepFromX+(S.stepToX-S.stepFromX)*k;
    S.py=S.stepFromY+(S.stepToY-S.stepFromY)*k;
    S.moving=true;
    S.walkPhase += dt*10;
    if(S.stepT<=0){
      S.px=S.stepToX; S.py=S.stepToY;
      S.stepT=0;
    }
    return;
  }

  var mx=0,my=0;
  if(input.left)  mx-=1;
  else if(input.right) mx+=1;
  else if(input.up)    my-=1;
  else if(input.down)  my+=1;

  /* 上次走完一格后，必须松开那个方向的键才能再走 */
  if(S.stepLocked){
    if(mx===0 && my===0){
      S.stepLocked=false;      /* 所有方向键都松开了 → 解锁 */
    } else {
      S.moving=false;          /* 还按着，不许走 */
      return;
    }
  }

  if(mx===0&&my===0){ S.moving=false; return; }

  S.faceDir = my>0?'down':(my<0?'up':(mx>0?'right':'left'));

  /* 当前所在的格子（角色站在格子中心） */
  var cx=Math.floor(S.px), cy=Math.floor(S.py);
  var tx=cx+mx, ty=cy+my;
  var targetX=tx+0.5, targetY=ty+0.5;

  var canGo = CHEAT.noClip ? true : canStand(f, targetX, targetY);
  if(!canGo){ S.moving=false; return; }

  /* 记录这一步是哪个按键触发的，松开后才能再走 */
  S.stepKey = (mx!==0 ? (mx>0?'right':'left') : (my>0?'down':'up'));

  /* 开始一格移动 */
  S.stepFromX=S.px;  S.stepFromY=S.py;
  S.stepToX=targetX; S.stepToY=targetY;
  S.stepDur=0.14/((S.speedMul||1)*(CHEAT.fast?2:1));   /* 可乐 / 作弊加速 */
  if(S.stepDur<0.06) S.stepDur=0.06;
  S.stepT=S.stepDur;
  S.moving=true;
  S.stepLocked=true;                     /* 必须松开按键才能走下一格 */
  S.turnDone=true;                       /* 这一步结束 → 轮到敌人行动一回合 */
  S.needEnemyTurn=true;
}

/* ================= 回合推进 =================
   回合制：玩家每走一格算一回合。敌人走完这一回合（含动画）后，才轮到玩家下一步。
   敌人每回合推进一个固定小步长（ENEMY_TURN），而不是跟着帧率连续跑。
*/
var ENEMY_TURN = 0.5;      /* 一回合里敌人推进的等效秒数 */
var ENEMY_ANIM = 0.22;     /* 敌人这一回合的过渡动画时长 */

function runEnemyTurn(){
  if(S.mode!=='play') return;
  S.needEnemyTurn=false;

  /* 1) 记下每个敌人回合开始的位置与楼层，并重置本回合的移动预算 */
  var froms=[];
  for(var i=0;i<S.npcs.length;i++){
    var n0=S.npcs[i];
    n0.budget=0;                 /* 每回合重新分配格数预算 */
    froms.push({n:n0, x:n0.x, y:n0.y, floor:n0.floor});
  }

  /* 2) 立刻算出这一回合的新位置，并把目标坐标存起来 */
  updateNpcs(ENEMY_TURN);

  /* 3) 把显示坐标倒退回起点，交给 tickEnemyAnim 插值演过去 */
  for(var j=0;j<froms.length;j++){
    var f0=froms[j], n=f0.n;
    if(!n) continue;
    if(n.floor!==f0.floor){
      /* 这一回合换层了：直接显示在新楼层，不做插值 */
      f0.skip=true;
      continue;
    }
    f0.tx=n.x; f0.ty=n.y;      /* 真实目标 */
    n.x=f0.x; n.y=f0.y;        /* 显示回到起点 */
  }
  S.enemyFrom=froms;
  S.enemyAnimT=ENEMY_ANIM;
  S.turnBusy=true;             /* 敌人演完之前，玩家不能走 */

  updateSeeHUD();
}

/* 每帧推进敌人回合动画：把显示坐标从起点插到目标 */
function tickEnemyAnim(dt){
  if(!S.turnBusy) return;
  S.enemyAnimT -= dt;
  var p = 1 - Math.max(0,S.enemyAnimT)/ENEMY_ANIM;
  if(p>1) p=1;
  if(p<0) p=0;
  var ease = p*p*(3-2*p);           /* 平滑缓动 */
  if(S.enemyFrom){
    for(var i=0;i<S.enemyFrom.length;i++){
      var f0=S.enemyFrom[i], n=f0.n;
      if(!n || f0.skip) continue;
      n.x = f0.x + (f0.tx - f0.x) * ease;
      n.y = f0.y + (f0.ty - f0.y) * ease;
    }
  }
  if(S.enemyAnimT<=0){
    /* 收尾：精确落到目标点 */
    if(S.enemyFrom){
      for(var k=0;k<S.enemyFrom.length;k++){
        var f1=S.enemyFrom[k], m=f1.n;
        if(!m || f1.skip) continue;
        m.x=f1.tx; m.y=f1.ty;
      }
    }
    S.enemyAnimT=0;
    S.enemyFrom=null;
    S.turnBusy=false;              /* 动画结束，轮到玩家 */
  }
}

/* ================= NPC ================= */
function npcSees(n){
  if(n.floor!==S.floor) return false;
  if(S.gogglesT>0) return false;   /* 护目镜：暂时不被发现 */
  var f=W[n.floor];
  if(!f) return false;
  var dx=S.px-n.x, dy=S.py-n.y;
  var dist=Math.sqrt(dx*dx+dy*dy);
  if(dist>n.sight) return false;
  if(dist<0.9) return true;                 /* 贴身必被发现 */
  var ang=Math.atan2(dy,dx);
  if(angDiff(ang,n.dir) > n.cone) return false;   /* 不在视野锥内 */
  return losClear(f,n.x,n.y,S.px,S.py);
}

function angDiff(a,b){
  var d=a-b;
  while(d>Math.PI) d-=Math.PI*2;
  while(d<-Math.PI) d+=Math.PI*2;
  return Math.abs(d);
}

function setPath(n,f,tx,ty){
  n.path=findPath(f,n.x,n.y,tx,ty);
  n.pathT=0;
}

function moveNpc(n,dt){
  var f=W[n.floor];
  if(!f || !n.path || n.path.length===0) return;

  /* 回合制：玩家一回合走 1 格，NPC 也必须按「格」推进，而不是按秒。
     dt 是这一回合的等效秒数（ENEMY_TURN=0.5）。
     【原来为什么飞快】原写法 Math.max(1, Math.round(speed*dt))，
     而 speed 在 1.7~2.55 时 round(speed*0.5) 全是 1，Math.max 又把 0 抬成 1，
     于是 tspeed 这一整列参数完全失效：简单和地狱都是「每回合固定走 1 格」，
     和玩家一步一格同速，看起来就是一顿一顿紧咬不放。
     【现在】本回合可走格数 = speed * dt，余量跨回合累积，
     走不满一格时这回合就不动，攒够了再走——速度差才能如实体现。
     注意：绝不能在这里给「不足一格」做概率补偿，那会把 0.2 格/回合
     补偿成 0.4 格/回合，难度档位又会被抹平。 */
  n.budget = (n.budgetCarry||0) + n.speed * dt;
  n.budgetCarry = 0;
  if(n.budget < 1){
    /* 攒得还不够走一格：原地等，余量留到下一回合继续攒 */
    n.budgetCarry = n.budget;
    n.budget = 0;
    return;
  }

  var guard=0;
  while(n.budget>0 && n.path && n.path.length>0 && guard<16){
    guard++;
    var t=n.path[0];
    var gx=t.x+0.5, gy=t.y+0.5;
    var dx=gx-n.x, dy=gy-n.y;
    var d=Math.sqrt(dx*dx+dy*dy);
    if(d<0.001){ n.path.shift(); continue; }   /* 已在格心，吃掉这个点 */

    if(n.budget>=d){
      /* 本回合还有足够预算走到格心 → 直接落到格心并消耗一个路径点 */
      n.x=gx; n.y=gy;
      n.dir=Math.atan2(dy,dx);
      n.budget-=d;
      n.path.shift();
    } else {
      /* 预算不够走完这一格 → 按预算推进一段（通常是刚好一格的情况） */
      var sp=n.budget;
      n.x+=dx/d*sp;
      n.y+=dy/d*sp;
      n.dir=Math.atan2(dy,dx);
      n.budget=0;
    }
  }
  if(n.budget<0.05) n.budget=0;
}

function updateNpcs(dt){
  var d=DIFF[S.diff] || DIFF.normal;
  if(typeof DEV!=='undefined' && DEV.freeze) return;   /* DevTest: freeze on */
  for(var i=0;i<S.npcs.length;i++){
    var n=S.npcs[i];
    if(n.flash>0) n.flash-=dt;
    if(n.alertT>0) n.alertT-=dt;
    if(n.stuckT>0) n.stuckT-=dt;

    var onPlayerFloor = (n.floor===S.floor);
    var f=W[n.floor];

    /* ---------- 1) 换层计划倒计时：到时间就重新想一个楼层 ---------- */
    if(n.planT===undefined){ n.plan=n.floor; n.planT=6+Math.random()*6; }
    n.planT-=dt;
    if(n.planT<=0 && n.state!=='chase') rollPlan(n);

    /* ---------- 2) 老师在教室看到玩家 → 自己回办公室（不跨层追击） ---------- */
    if(onPlayerFloor && n.kind==='teacher' && n.alertT<=0 && npcSees(n)){
      var r=roomAt(fl(),S.px,S.py);
      if(r && r.safe==='class'){
        n.alertT=1.2;
        n.floor='2F'; n.x=n.home.x; n.y=n.home.y;
        n.path=null; n.state='patrol'; n.ri=0; n.plan='2F'; n.planT=8;
        toast('老师看到你在教室，自己回办公室去了');
        continue;
      }
    }

    /* ---------- 3) 当前层：追 / 巡逻 ---------- */
    if(onPlayerFloor){
      /* 保安不追进教室：玩家躲在教室里时，保安只能在外巡逻 */
      var playerInClass=false;
      if(n.kind==='guard'){
        var pr=roomAt(f,S.px,S.py);
        playerInClass=!!(pr && pr.safe==='class');
      }
      if(n.state==='chase' || npcSees(n)){
        if(n.kind==='guard' && playerInClass){ n.state='patrol'; }
        else{
          n.state='chase';
          setPath(n, f, S.px, S.py);
          if(!n.path || !n.path.length) n.state='patrol';
        }
      } else n.state='patrol';
    } else {
      n.state='patrol';        /* 后台层只巡逻，不追 */
    }

    /* ---------- 4) 决定这一帧往哪走 ---------- */
    var goal=null;
    if(n.state==='chase'){
      moveNpc(n,dt);
      /* 追的时候也可能顺手跨层（玩家刚下楼）——由 plan 逻辑接管，这里不处理 */
    } else {
      /* 想去别的楼层：先走到对应楼梯 */
      var curIdx=chainIdx(n.floor), wantIdx=chainIdx(n.plan);
      if(wantIdx<0) wantIdx=curIdx;
      if(n.stairCd>0) n.stairCd-=dt;
      if(n.stairCd>0){ n.stairGo=null; }        /* 冷却期内不碰楼梯 */
      else if(n.plan!==n.floor && curIdx>=0 && wantIdx!==curIdx){
        var st=stairToward(n.floor, wantIdx);
        if(st){
          n.stairGo=st;
          goal={x:st.x, y:st.y};
        }
      }
      /* 已经站在楼梯格上：直接换层 */
      if(n.stairGo){
        var dxs=Math.abs(n.x-n.stairGo.x), dys=Math.abs(n.y-n.stairGo.y);
        if(dxs<0.45 && dys<0.45){
          var stg=n.stairGo;
          n.floor=stg.to;
          n.x=stg.tx; n.y=stg.ty;
          n.path=null; n.pathT=0; n.stuckT=0;
          n.lastX=n.x; n.lastY=n.y;
          n.stairGo=null;
          n.ri=0; n.idleT=0;
          /* 换层后强制冷却一段时间，避免刚上来又原路返回 / 蹲在楼梯口来回传 */
          n.stairCd=2.5+Math.random()*2.0;
          n.plan=n.floor;
          n.planT=(d.replan||9)+Math.random()*6;
          continue;
        }
      }
      /* 没有跨层目标就用当前层的巡逻路线 */
      if(!goal){
        var route=patrolOf(n.floor);
        if(route && route.length){
          var wp=route[n.ri % route.length];
          var dd=Math.sqrt(Math.pow(wp.x-n.x,2)+Math.pow(wp.y-n.y,2));
          if(dd<0.75){ n.ri=(n.ri+1)%route.length; wp=route[n.ri]; }
          goal={x:wp.x, y:wp.y};
        }
      }
      if(goal){
        n.pathT-=dt;
        if(!n.path || !n.path.length || n.pathT<=0){
          setPath(n, W[n.floor], goal.x, goal.y);
          n.pathT=1.0;
          if(!n.path || !n.path.length) n.idleT+=dt;
        }
      } else {
        n.idleT+=dt;
      }
      moveNpc(n,dt);
    }

    /* ---------- 5) 卡住检测 ---------- */
    if(n.stuckT<=0){
      var moved=Math.abs(n.x-n.lastX)+Math.abs(n.y-n.lastY);
      if(moved<0.02){
        n.path=null; n.stairGo=null;
        if(patrolOf(n.floor)) n.ri=(n.ri+1)%patrolOf(n.floor).length;
        /* 后台层卡住太久 → 强制换个楼层，别原地打转 */
        if(n.floor!==S.floor && n.idleT>1.2){ rollPlan(n); n.idleT=0; }
      }
      n.lastX=n.x; n.lastY=n.y;
      n.stuckT=0.7;
    }
  }
}
/* 规则说明见文件顶部 SEE_LIMIT */
function checkCatch(dt){
  if(S.mode!=='play') return;
  if(CHEAT.god){ S.seeT=0; S.seenBy=''; return; }   /* 作弊：无视伤害 */
  dt = dt || 0;

  /* 刚被送回来的短暂保护，避免同一个敌人立刻再抓一次 */
  if(S.safeT>0) S.safeT = Math.max(0, S.safeT-dt);

  /* 教室是绝对安全区：任何敌人（含保安）都进不去、抓不到 */
  var here=roomAt(fl(),S.px,S.py);
  var inClass = !!(here && here.safe==='class');
  /* 1) 贴身必抓（保安在教室不生效） */
  for(var i=0;i<S.npcs.length;i++){
    var n=S.npcs[i];
    if(n.floor!==S.floor) continue;
    if(n.kind==='guard' && inClass) continue;
    var d=Math.sqrt(Math.pow(n.x-S.px,2)+Math.pow(n.y-S.py,2));
    if(d<CATCH_RANGE){ if(S.safeT>0) continue; caughtBy(n); return; }
  }

  if(S.safeT>0){ S.seeT=0; return; }

  /* 2) 被任何敌人看到就累计计时，满 3 秒被抓 */
  var watcher=null, watchers=0;
  for(var j=0;j<S.npcs.length;j++){
    var m=S.npcs[j];
    if(m.floor!==S.floor) continue;
    if(m.kind==='guard' && inClass) continue;   /* 保安看不进教室 */
    if(npcSees(m)){ watchers++; if(!watcher) watcher=m; }
  }
  /* 2b) 监控也算「被看见」：站在有监控的路上，同样会累计 */
  if(watchers===0){
    var cam=camerasWatcher();
    if(cam){ watchers=1; watcher={name:cam.label||'监控'}; }
  }
  if(watchers>0){
    S.seenBy = watcher ? watcher.name : '';
    S.everSpotted = true;
    /* 地狱：被看见的第一眼就死（seeLimit 为 0.001） */
    S.seeT += dt;
    var lim=(typeof S.seeLimit==="number"? S.seeLimit : SEE_LIMIT);
    if(S.seeT>=lim){ caughtBy(watcher || {name:'老师',home:{x:S.px,y:S.py}}); return; }
  } else {
    S.seeT = Math.max(0, S.seeT - dt*2.0);   /* 脱离视野后快速回落 */
    if(S.seeT<=0) S.seenBy='';
  }
}

function caughtBy(n){
  S.catches++;
  if(n && n.home && typeof n.x==='number'){
    n.x=n.home.x; n.y=n.home.y; n.path=null; n.state='patrol'; n.ri=0;
  }
  /* 地狱模式下把抓到玩家的那名敌人就是"看见就死"的凶手 */
  S.seeT=0; S.seenBy='';
  S.lives--;                        /* 命数递减：地狱只有 1 命，碰到就结束 */
  var maxLives=(DIFF[S.diff]||DIFF.normal).lives;
  if(S.catches>=maxLives || S.lives<=0){
    /* 结局一：命用完了，清空所有道具再结算 */
    S.inv={};
    updateHUD();
    ending(1);
    return;
  }
  /* 丢了东西：所有道具全部丢失，电闸状态也复位 */
  var lost = [];
  for(var id in S.inv){ if(S.inv[id]) lost.push(ITEM[id]?ITEM[id].name:id); }
  S.inv = {};
  S.sw = {};
  S.tookFlag = false;
  S.gogglesT = 0;
  /* 手电筒也一起失效（道具全丢，得重新拿） */
  S.flashLike = false; S.flashFloor = ''; S.flashOn = false;
  /* 世界也要复位：砸过的车、开过的门、关掉的监控都回到初始状态 */
  S.carBroken = false;
  S.camsOff = false;
  S.elecOpen = false;
  S.wallBroken = false;
  S.doorOpen = false;
  /* 道具丢失后要能重新拿到：重建世界，把已被拾取/锯过的东西放回原位 */
  buildWorld();
  S.npcs = spawnNpcs(S.diff);

  /* 送回教室（学生复活点＝原位） */
  S.floor='2F'; S.px=4.5; S.py=3.5; S.stairLock=0.8; S._noCam=true;
  S.safeT = SAFE_SHIELD;          /* 保护期，不要在教室被立刻再抓 */
  S.moving=false; S.bobCur=0;
  S.eyeX=0; S.eyeY=0;
  for(var i=0;i<S.npcs.length;i++){
    var t=S.npcs[i];
    if(t.kind==='teacher'){ t.x=t.home.x; t.y=t.home.y; t.path=null; t.state='patrol'; t.ri=0; }
  }
  toast('被'+n.name+'抓住！'+(lost.length?('丢失：'+lost.join('、')+'。'):'')+'已送回教室（命 '+(S.lives>0?S.lives:0)+'/'+((DIFF[S.diff]||DIFF.normal).lives)+'）');
  updateHUD();
}

/* ================= 跳回合 ================= */
function skipTurn(){
  if(S.mode!=='play') return;
  var r=roomAt(fl(),S.px,S.py);
  if(!r || !r.safe){ toast('只有在教室或厕所才能跳过回合'); return; }
  /* 跳过回合 = 玩家原地不动，让敌人多走一个回合 */
  S.needEnemyTurn=false;
  if(S.mode2==='classic'){
    updateNpcs(ENEMY_TURN*2);
    checkCatch(ENEMY_TURN);
    if(S.mode!=='play') return;
    updateSeeHUD();
  } else {
    runEnemyTurn();          /* 走同一套回合流程（含动画与锁定） */
  }
  toast('跳过一回合，老师 / 保安移动了');
}

/* ================= 楼层 ================= */
function goFloor(to,tx,ty){
  if(!W[to]) return;
  S.floor=to;
  /* 对齐到格子中心，保证按格移动时不会卡在半格上 */
  S.px=Math.floor(tx)+0.5; S.py=Math.floor(ty)+0.5;
  S.stepT=0;
  S.stairLock=1.0;      /* 1 秒内不触发楼梯，避免来回传送 */
  S._noCam=true;
  updateHUD();
  toast('来到 '+W[to].name);
}

function stairCheck(){
  /* 只负责「走到另一段楼梯即胜利」；普通楼梯改由按 E 显式触发，
     避免玩家一踩到楼梯就被自动传送、来回弹跳 */
  if(S.stairLock>0){ S.stairLock -= 1/60; return; }
  var f=fl(); if(!f) return;
  for(var i=0;i<f.objs.length;i++){
    var o=f.objs[i];
    if(o.t!=='stairWin') continue;
    var dx=Math.abs(o.x-S.px), dy=Math.abs(o.y-S.py);
    if(dx<0.6 && dy<0.6){ ending(5); return; }
  }
}
/* 兼容旧函数名 */
/* ================= 监控（玩家动，不动的摄像头会转过来） ================= */
/* 监控规则：在监控的视野锥内持续待满 SEE_LIMIT 秒 → 被抓（算作被抓一次）。
   监控范围比人眼小，但视野宽；保安室里的「监控总闸」可以关掉全部监控。 */
function cameraSees(cam){
  if(S.camsOff) return false;
  if(S.stealthT>0) return false;      /* 隐身针：监控看不见你 */
  var dx=S.px-cam.x, dy=S.py-cam.y;
  var dist=Math.sqrt(dx*dx+dy*dy);
  if(dist>cam.range) return false;
  var ang=Math.atan2(dy,dx);
  if(angDiff(ang, cam.dir) > (cam.cone||0.5)) return false;
  return losClear(fl(), cam.x, cam.y, S.px, S.py);
}
function camerasWatcher(){
  if(S.camsOff) return null;
  var f=fl(); if(!f) return null;
  for(var i=0;i<f.objs.length;i++){
    var c=f.objs[i];
    if(c.t!=='camera') continue;
    if(cameraSees(c)) return c;
  }
  return null;
}
/* 监控会缓慢转向玩家（跟踪），这样"有监控的路"确实有压力 */
function updateCameras(dt){
  if(S.camsOff) return;
  var f=fl(); if(!f) return;
  for(var i=0;i<f.objs.length;i++){
    var c=f.objs[i];
    if(c.t!=='camera') continue;
    c.sweep=(c.sweep||0)+dt;
    /* baseDir：监控的初始朝向，作为没人时左右扫动的中心 */
    if(c.baseDir===undefined) c.baseDir=c.dir;
    var base=c.baseDir;
    var dx=S.px-c.x, dy=S.py-c.y;
    var dist=Math.sqrt(dx*dx+dy*dy);
    if(dist<c.range*1.2){
      /* 玩家进入监控附近 → 缓慢转到玩家方向 */
      var want=Math.atan2(dy,dx);
      var diff=want-c.dir;
      while(diff>Math.PI) diff-=Math.PI*2;
      while(diff<-Math.PI) diff+=Math.PI*2;
      c.dir += diff*0.55*dt;        /* 慢慢转：太快像抽搐，看不清也没法躲 */
    } else {
      /* 没人就慢慢左右扫（以 baseDir 为中心，±0.5 弧度摆动） */
      c.dir = base + Math.sin(c.sweep*0.35)*0.5;
    }
  }
}

/* ================= 排行榜（只存本地 cookie） =================
   没有数据库、没有服务器：成绩存在玩家自己的 cookie 里。
   换设备/清 cookie 就没了，但完全离线可用、无需联网。
*/
var LB_KEY='efs_board_v1';
var NAME_KEY='efs_name';

function boardLoad(){
  var raw=readCookie(LB_KEY);
  if(!raw) return [];
  try{
    var a=JSON.parse(decodeURIComponent(raw));
    if(a && a.length) return a.map(function(r){
      return {name:r[0], diff:r[1], time:r[2], ending:r[3], catches:r[4], ach:r[5]};
    });
  }catch(e){}
  return [];
}
function boardSave(list){
  /* 压缩存储，避免 cookie 超过 4KB */
  var arr=list.slice(0,15).map(function(r){
    return [r.name, r.diff, r.time, r.ending, r.catches, r.ach||0];
  });
  writeCookie(LB_KEY, JSON.stringify(arr), 3650);
}
/* 记录一次通关成绩 */
function reportClear(endingN){
  if(!(endingN>=2 && endingN<=6)) return;
  markCleared();                                   /* 通关一次 → 解锁结局六提示 */
  if(!boardAllowed()){ cheatDisableBoard(); return; }   /* 作弊：不记录成绩 */
  var list=boardLoad();
  var name=readCookie(NAME_KEY)||'无名同学';
  var rec={name:name, diff:S.diff, time:Math.round(S.time*100)/100,
           ending:endingN, catches:S.catches, ach:achCount()};
  /* 同一难度只保留最好（用时最短）的一条 */
  var hit=false;
  for(var i=0;i<list.length;i++){
    if(list[i].diff===rec.diff){
      hit=true;
      if(rec.time<list[i].time) list[i]=rec;
    }
  }
  if(!hit) list.push(rec);
  list.sort(function(a,b){ return a.time-b.time; });
  boardSave(list);
}
function boardBest(){ return boardLoad().slice(0,20); }

/* 排行榜面板 */
function openBoard(){
  showPanel('排行榜（本机记录）', renderBoardHtml());
}
function renderBoardHtml(){
  var UC=themeUiColors();
  var list=boardBest();
  var head='<div style="font-size:11.5px;line-height:1.8;color:'+UC.sub+';margin-bottom:6px">'+
    '成绩只存在这台设备的 cookie 里，不上传服务器。</div>';
  if(!list.length){
    return head+'<div style="font-size:12px;color:'+UC.sub+';line-height:1.8">还没有记录，通关一次就会出现在这里。</div>';
  }
  var html=head+'<div style="font-size:11.5px;line-height:1.95">';
  for(var i=0;i<list.length;i++){
    var r=list[i];
    var dn=DIFF[r.diff]?DIFF[r.diff].name:r.diff;
    html+='<div style="display:flex;gap:8px;align-items:center;padding:3px 0;border-bottom:1px solid '+UC.line+'">'
      +'<b style="width:22px;color:'+UC.accent+'">'+(i+1)+'</b>'
      +'<span style="flex:1">'+(r.name||'无名')+'</span>'
      +'<span style="color:'+UC.sub+'">'+dn+'</span>'
      +'<span style="color:'+UC.gold+'">'+(Number(r.time)||0).toFixed(2)+'s</span>'
      +'</div>';
  }
  return html+'</div>';
}

/* 玩家昵称：存 cookie，改一次一直有效 */
function askName(){
  var cur=readCookie(NAME_KEY)||'';
  var v=prompt('输入你的昵称（存在本机 cookie）', cur);
  if(v===null) return;
  v=String(v).trim();
  /* 旧版 DevTest:BypassGMMenu 这类前缀入口已废弃 */
  if(/^DevTest:/i.test(v)){
    toast('DevTest 已改为终端指令：请在「终端」风格下按右侧 Shift 打开终端');
    return;
  }
  v=v.slice(0,12);
  if(!v) return;
  writeCookie(NAME_KEY, v, 3650);
  toast('昵称已保存：'+v);
}

/* ================= DevTest 调试指令 =================
   指令只能在「终端」主题下、通过 DevTest 终端（右侧 Shift 开关）输入。
   输入时不带 DevTest: 前缀：例如 bypass on、gm open。
*/

/* ---------- DevTest 终端 ---------- */
var DEV_ROOT_PW = 'TerminalPassword';
function devPromptText(){
  return (typeof DEV!=='undefined' && DEV && DEV.root) ? 'root@efs:~#' : 'user@efs:~$';
}
function devUpdatePrompt(){
  var el=document.getElementById('devTermPrompt');
  if(!el) return;
  var rt=!!(typeof DEV!=='undefined' && DEV && DEV.root);
  el.textContent = rt ? 'root@efs:~#' : 'user@efs:~$';
  el.style.color = rt ? '#ffd75e' : '#5eff8f';
}
function devSetMask(on){
  var inp=document.getElementById('devTermInput');
  if(inp){
    inp.setAttribute('placeholder', on ? 'sudo 密码（只用下方键盘输入）' : '点下方键盘输入');
  }
  if(typeof DEV_KB_BUF!=='undefined'){ DEV_KB_BUF=''; devKbSync(); }
}
/* ===== DevTest 虚拟键盘：完全绕开系统输入法 ===== */
/* ================= 快速加入地图：joinmap =================
   用法：joinmap [diff=easy|normal|hard|hell] [style=classic|material|terminal]
                  [color=black|white|blue|green|orange|purple|red|cyan|yellow|<数字>]
   例：joinmap diff=ez style=terminal color=terminal
*/
var JOINMAP_DIFF_ALIAS = {
  ez:'easy', e:'easy', easy:'easy', 简单:'easy',
  nm:'normal', n:'normal', normal:'normal', 普通:'normal',
  hd:'hard', h:'hard', hard:'hard', 困难:'hard',
  hl:'hell', hell:'hell', 地狱:'hell'
};
var JOINMAP_COLOR = {
  black:0, white:15, grey:7, gray:7,
  red:32, orange:40, yellow:48, green:64,
  cyan:80, blue:88, purple:104, pink:112,
  terminal:64
};
function joinmapDiff(v){
  var k=String(v||'').toLowerCase();
  return JOINMAP_DIFF_ALIAS[k] || null;
}
function joinmapColor(v){
  var k=String(v||'').toLowerCase();
  if(JOINMAP_COLOR[k]!==undefined) return JOINMAP_COLOR[k];
  var n=parseInt(k,10);
  if(!isNaN(n) && n>=0 && n<256) return n;
  return null;
}
function joinmapParse(args){
  var o={ diff:null, style:null, color:null, colorSet:false, err:'', extra:[] };
  for(var i=0;i<args.length;i++){
    var seg=String(args[i]||'');
    if(!seg) continue;
    var eq=seg.indexOf('=');
    if(eq<0){ o.extra.push(seg); continue; }
    var key=seg.slice(0,eq).toLowerCase();
    var val=seg.slice(eq+1);
    if(key==='diff'||key==='d'){
      var d=joinmapDiff(val);
      if(!d){ o.err='难度不支持：'+val+'（easy/normal/hard/hell，可简写 ez/nm/hd/hl）'; return o; }
      o.diff=d;
    } else if(key==='style'||key==='st'||key==='s'){
      var st=String(val).toLowerCase();
      if(st!=='classic' && st!=='material' && st!=='terminal' && st!=='term'){
        o.err='风格不支持：'+val+'（classic/material/terminal）'; return o;
      }
      o.style=(st==='term')?'terminal':st;
    } else if(key==='color'||key==='c'){
      var cc=joinmapColor(val);
      if(cc===null){ o.err='颜色不支持：'+val+'（可写颜色名或 0~255 数字）'; return o; }
      o.color=cc; o.colorSet=true;
    } else {
      o.err='未知参数：'+key+'（可用 diff / style / color）'; return o;
    }
  }
  return o;
}
function joinmapExec(o){
  /* 先应用主题，再开新局，避免开局后主题重绘打断 */
  if(o.style){ THEME.style=o.style; }
  if(o.colorSet){ THEME.color=o.color; }
  else if(o.style==='terminal'){ THEME.color=JOINMAP_COLOR.terminal; }
  if(o.style || o.colorSet){ themeSave(); themeApply(); }
  startGame(o.diff||'normal');
  var dc=(DIFF[S.diff]||DIFF.normal).name;
  var nm={classic:'原版',material:'Material',terminal:'终端'}[THEME.style]||THEME.style;
  devTermLog('已加入地图 · 难度 '+dc+' · 风格 '+nm+' · 色号 '+THEME.color,'tl-ok');
  toast('已加入地图：'+dc);
}

var DEV_KB_BUF = '';
var DEV_KB_LAYOUT = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l','-'],
  ['z','x','c','v','b','n','m','.','_','/'],
  ['SHIFT','SYM','SPACE','BKSP','ENTER']
];
var DEV_KB_SYM = [
  ['!','@','#','$','%','^','&','*','(',')'],
  ['=','+','[',']','{','}',':',';','"',"'"],
  ['<','>','|','\\','~','`',',','?','*','&'],
  ['SPACE','=','-','_','.','/',':',';','(',')'],
  ['ABC','SPACE','BKSP','ENTER']
];
var DEV_KB_SYM_MODE = false;
var DEV_KB_SHIFT = false;


function devKbCurrent(){
  return DEV_KB_SYM_MODE ? DEV_KB_SYM : DEV_KB_LAYOUT;
}
function devKbRender(){
  var kb=document.getElementById('devKb');
  if(!kb) return;
  var LAY=devKbCurrent();
  var html='';
  for(var r=0;r<LAY.length;r++){
    html+='<div class="dkRow">';
    var row=LAY[r];
    for(var c=0;c<row.length;c++){
      var kk=row[c];
      var lbl=kk, cls='dkKey';
      if(kk==='SHIFT'){ lbl='SH'; cls+=' w15'+(DEV_KB_SHIFT?' on':''); }
      else if(kk==='SYM'){ lbl='!#='; cls+=' w15 warn'; }
      else if(kk==='ABC'){ lbl='abc'; cls+=' w15 warn'; }
      else if(kk==='SPACE'){ lbl='空格'; cls+=' space'; }
      else if(kk==='TAB'){ lbl='TAB'; cls+=' w15 dim'; }
      else if(kk==='BKSP'){ lbl='DEL'; cls+=' w15 warn'; }
      else if(kk==='ENTER'){ lbl='回车'; cls+=' w2'; }
      else if(kk==='?'){ cls+=' w15'; }
      else if(DEV_KB_SHIFT && /^[a-z]$/.test(kk)){ lbl=kk.toUpperCase(); }
      html+='<button type="button" class="'+cls+'" data-k="'+kk+'">'+lbl+'</button>';
    }
    html+='</div>';
  }
  kb.innerHTML=html;
}

function devKbSync(){
  var inp=document.getElementById('devTermInput');
  var mask=!!(typeof DEV!=='undefined' && DEV && DEV.sudoAsk);
  if(inp) inp.value = mask ? new Array(DEV_KB_BUF.length+1).join('*') : DEV_KB_BUF;
  var cur=document.getElementById('devTermCursor');
  if(cur) cur.textContent=(DEV_KB_BUF.length?'':'>')+'\u2588';
}
function devKbPress(kk){
  if(kk==='SHIFT'){ DEV_KB_SHIFT=!DEV_KB_SHIFT; devKbRender(); return; }
  if(kk==='SYM'){ DEV_KB_SYM_MODE=true; devKbRender(); return; }
  if(kk==='ABC'){ DEV_KB_SYM_MODE=false; devKbRender(); return; }
  if(kk==='BKSP'){ DEV_KB_BUF=DEV_KB_BUF.slice(0,-1); devKbSync(); return; }
  if(kk==='TAB'){ DEV_KB_BUF+=' '; devKbSync(); return; }
  if(kk==='SPACE'){ DEV_KB_BUF+=' '; devKbSync(); return; }
  if(kk==='ENTER'){ devKbSubmit(); return; }
  var ch=kk;
  if(DEV_KB_SHIFT && /^[a-z]$/.test(ch)) ch=ch.toUpperCase();
  DEV_KB_BUF+=ch;
  if(DEV_KB_SHIFT && /^[a-z]$/i.test(ch)){ DEV_KB_SHIFT=false; devKbRender(); }
  devKbSync();
}
function devKbSubmit(){
  var v=DEV_KB_BUF;
  DEV_KB_BUF='';
  devKbSync();
  if(v && v.trim()) devTermSubmit(v);
}
function devKbBind(){
  var kb=document.getElementById('devKb');
  if(!kb) return;
  devKbRender();
  devKbSync();
  /* 用 pointerdown 而不是 click：触摸更跟手，且不会被 body 的 touch-action 吃掉 */
  kb.addEventListener('pointerdown',function(e){
    var t=e.target;
    while(t && t!==kb && !t.getAttribute('data-k')) t=t.parentNode;
    if(!t || t===kb) return;
    e.preventDefault();
    e.stopPropagation();
    var kk=t.getAttribute('data-k');
    if(kk) devKbPress(kk);
  },{passive:false});
  /* 旧内核不支持 pointerdown 时回退 click */
  if(!window.PointerEvent){
    kb.addEventListener('click',function(e){
      var t=e.target;
      while(t && t!==kb && !t.getAttribute('data-k')) t=t.parentNode;
      if(!t || t===kb) return;
      e.preventDefault(); e.stopPropagation();
      var kk=t.getAttribute('data-k');
      if(kk) devKbPress(kk);
    });
  }
}

function devIsTerminalStyle(){
  return !!(typeof THEME!=='undefined' && THEME && THEME.style==='terminal');
}
function devTermLog(msg, cls){
  var box=document.getElementById('devTermLog');
  if(!box) return;
  var d=document.createElement('div');
  if(cls) d.className=cls;
  d.textContent=msg;
  box.appendChild(d);
  box.scrollTop=box.scrollHeight;
}
function devTermOpen(){
  var t=document.getElementById('devTerm');
  if(!t) return false;
  if(!devIsTerminalStyle()){
    toast('DevTest 终端仅在「终端」风格下可用');
    return false;
  }
  t.classList.remove('hidden');
  devKbBind();
  var inp=document.getElementById('devTermInput');
  if(inp){
    /* display 生效后再聚焦，否则部分内核 focus 无效 */
    try{ inp.focus(); inp.click(); }catch(e){}
    setTimeout(function(){ try{ inp.focus(); }catch(e){} }, 60);
  }
  if(!t.getAttribute('data-welcomed')){
    t.setAttribute('data-welcomed','1');
    devTermLog('E.F.S  DevTest Terminal  [仅为终端风格]','tl-ok');
    devTermLog('输入 help 查看指令，close 关闭终端。');
    devUpdatePrompt();
    devTermLog('当前权限：user —— 输入 sudo -i 提权后才能用完整指令。','tl-err');
  }
  return true;
}
function devTermClose(){
  var t=document.getElementById('devTerm');
  if(t) t.classList.add('hidden');
  DEV.root=false; DEV.sudoAsk=false; DEV.sudoFail=0;
  if(typeof DEV_KB_BUF!=='undefined'){ DEV_KB_BUF=''; devKbSync(); }
  devSetMask(false); devUpdatePrompt();
}
function devTermToggle(){
  var t=document.getElementById('devTerm');
  if(!t) return;
  if(t.classList.contains('hidden')) devTermOpen();
  else devTermClose();
}
function devTermSubmit(raw){
  var v=String(raw||'').trim();
  if(!v) return;
  if(DEV.sudoAsk) devTermLog('> ********','tl-in');
  else devTermLog('> '+v,'tl-in');
  var r=devRunCommand(v);
  if(r===false) devTermLog('未知指令。输入 help 查看。','tl-err');
}
function devRunCommand(v){
  var parts=v.split(/\s+/);
  var cmd=(parts[0]||'').toLowerCase();
  var a1=(parts[1]||'').toLowerCase();
  /* ---- sudo 密码输入态 ---- */
  if(DEV.sudoAsk){
    DEV.sudoAsk=false; devSetMask(false);
    if(v===DEV_ROOT_PW){
      DEV.root=true; DEV.sudoFail=0; devUpdatePrompt();
      devTermLog('root 权限已获取，完整指令集已解锁。','tl-ok');
    } else {
      DEV.sudoFail++;
      if(DEV.sudoFail>=3){ devTermClose(); devTermLog('sudo: 3 次密码错误，终端已关闭。','tl-err'); return true; }
      devTermLog('sudo: 密码错误（'+DEV.sudoFail+'/3）','tl-err');
    }
    return true;
  }

  if(cmd==='help' || cmd==='?'){
    if(!DEV.root){
      devTermLog('当前权限：user（受限）','tl-err');
      devTermLog('可用：help / clear / close / exit / sudo -i');
      devTermLog('提权：sudo -i → 输入密码 → 解锁完整指令集');
      return true;
    }
    devTermLog('当前权限：root','tl-ok');
    devTermLog('可用指令：','tl-ok');
    devTermLog('  help                    显示本列表');
    devTermLog('  close / exit            关闭终端');
    devTermLog('  bypass on|off           允许多用 GM 仍给成就与排行榜');
    devTermLog('  gm open|close           强制打开/关闭 GM 菜单');
    devTermLog('  gm addach               GM 菜单里加「一键全成就」');
    devTermLog('  god on|off              无视伤害（老师/保安/监控都抓不到）');
    devTermLog('  joinmap [参数]          快速开新局进地图（可带主题）');
    devTermLog('      例：joinmap diff=ez style=terminal color=terminal');
    devTermLog('      diff=easy|normal|hard|hell  style=classic|material|terminal');
    devTermLog('  tp <楼层>               传送到指定楼层（2F/1F/B1/B2/B3）');
    devTermLog('  tpobj <名称>            传送到本层指定对象旁（门/楼梯/监控…）');
    devTermLog('  item <物品>             直接给一件道具（key/redkey/blueprint…）');
    devTermLog('  allitem                 一次给齐所有必需道具');
    devTermLog('  lives <n>               设置剩余命数');
    devTermLog('  floor                  显示当前楼层与安全区');
    devTermLog('  npcs                    列出本层所有敌人');
    devTermLog('  freeze on|off           冻住所有 NPC（不再移动）');
    devTermLog('  see                    显示当前被谁看见、计时多少');
    devTermLog('  achall                  解锁全部成就');
    devTermLog('  clear                   清屏');
    devTermLog('  exitwin                 当前层直接触发逃脱结局');
    return true;
  }
  if(cmd==='close' || cmd==='exit'){ devTermClose(); return true; }
  if(cmd==='clear'){ var b=document.getElementById('devTermLog'); if(b) b.innerHTML=''; return true; }
  if(cmd==='sudo'){
    if(DEV.root){ devTermLog('已在 root 权限下。','tl-ok'); return true; }
    DEV.sudoAsk=true; devSetMask(true);
    devTermLog('[sudo] password for user: ','tl-err');
    return true;
  }
  var on = (a1==='on'||a1==='true'||a1==='1');
  var off= (a1==='off'||a1==='false'||a1==='0');

  /* ---- 权限闸门：以下指令必须 root ---- */
  if(!DEV.root){
    devTermLog('权限不足：「'+cmd+'」需要 root。执行 sudo -i 提权。','tl-err');
    return true;
  }

  /* ---- 带参数 / 无参数指令（先于 on|off 分支处理） ---- */
  if(cmd==='joinmap'){
    var jm=joinmapParse(parts.slice(1));
    if(jm.err){ devTermLog(jm.err,'tl-err'); return true; }
    joinmapExec(jm);
    return true;
  }
  if(cmd==='tp'){
    var f=String(parts[1]||'').toUpperCase();
    if(!W[f]){ devTermLog('楼层不存在：'+f+'（可用 2F/1F/B1/B2/B3）','tl-err'); return true; }
    S.floor=f;
    var st=W[f].objs.filter(function(o){return o.t==='stairs';})[0];
    if(st){ S.px=st.x; S.py=st.y+1; } else { S.px=W[f].w/2; S.py=W[f].h/2; }
    devTermLog('已传送到 '+f,'tl-ok');
    return true;
  }
  if(cmd==='tpobj'){
    var q=parts.slice(1).join(' ').toLowerCase();
    if(!q){ devTermLog('用法：tpobj <名称>，如 tpobj 楼梯','tl-err'); return true; }
    var fobj=W[S.floor].objs.filter(function(o){
      var nm=String(o.label||o.t||'').toLowerCase();
      return nm.indexOf(q)>=0;
    })[0];
    if(!fobj){ devTermLog('本层找不到：'+q,'tl-err'); return true; }
    S.px=fobj.x; S.py=fobj.y+1;
    devTermLog('已传送到 '+(fobj.label||fobj.t),'tl-ok');
    return true;
  }
  if(cmd==='item'){
    var it=String(parts[1]||'').toLowerCase();
    if(!it || !ITEM[it]){ devTermLog('物品不存在：'+it,'tl-err'); return true; }
    S.inv[it]=true;
    devTermLog('已获得：'+ITEM[it].name,'tl-ok');
    return true;
  }
  if(cmd==='allitem'){
    var got=0;
    for(var ik in ITEM){ if(!S.inv[ik]){ S.inv[ik]=true; got++; } }
    devTermLog('已补全 '+got+' 件道具','tl-ok');
    return true;
  }
  if(cmd==='lives'){
    var n=parseInt(parts[1],10);
    if(isNaN(n)){ devTermLog('用法：lives <数字>','tl-err'); return true; }
    S.lives=n;
    devTermLog('命数已设为 '+n,'tl-ok');
    return true;
  }
  if(cmd==='floor'){
    var rr=roomAt(fl(),S.px,S.py);
    devTermLog('当前楼层：'+S.floor+(rr?('（'+rr.name+(rr.safe?' · 安全区':'')+'）'):''),'tl-ok');
    return true;
  }
  if(cmd==='npcs'){
    var list=S.npcs.filter(function(n){return n.floor===S.floor;});
    if(!list.length){ devTermLog('本层没有敌人','tl-ok'); return true; }
    list.forEach(function(n){
      devTermLog('  '+n.name+' @('+n.x.toFixed(1)+','+n.y.toFixed(1)+') '+n.state);
    });
    return true;
  }
  if(cmd==='see'){
    var lim=(typeof S.seeLimit==='number'?S.seeLimit:SEE_LIMIT);
    devTermLog('被看见：'+(S.seenBy||'无人')+'　计时 '+S.seeT.toFixed(2)+' / '+lim,'tl-ok');
    return true;
  }
  if(cmd==='achall'){
    if(typeof cheatUnlockAllAch==='function'){ cheatUnlockAllAch(); devTermLog('已解锁全部成就','tl-ok'); }
    else devTermLog('无法调用成就解锁','tl-err');
    return true;
  }
  if(cmd==='exitwin'){
    devTermLog('脱逃指令需在当前层楼梯口使用，已略。','tl-err');
    return true;
  }

  if(cmd==='gm'){
    if(a1==='open'){ CHEAT.opened=true; openCheatPanel(); devTermLog('GM 菜单已打开','tl-ok'); return true; }
    if(a1==='close'){ closeCheatPanel(); collapseCheat(); devTermLog('GM 菜单已关闭','tl-ok'); return true; }
    if(a1==='addach'){ DEV.achPanel=true; CHEAT.opened=true; openCheatPanel(); devTermLog('已加入「一键全成就」','tl-ok'); return true; }
    devTermLog('用法：gm open|close|addach','tl-err'); return false;
  if(!on && !off){ devTermLog('用法：'+cmd+' on|off','tl-err'); return false; }

  if(cmd==='bypass'){
    DEV.bypass=on;
    devTermLog(on?'已允许多用 GM 仍给成就与排行榜':'已恢复 GM 限制','tl-ok');
    return true;
  }
  }
  if(cmd==='god'){
    CHEAT.god=on;
    devTermLog(on?'已开启无视伤害':'已关闭无视伤害','tl-ok');
    if(typeof cheatRenderBox==='function') cheatRenderBox();
    return true;
  }
  if(cmd==='freeze'){
    DEV.freeze=on;
    devTermLog(on?'已冻住所有 NPC':'已解冻 NPC','tl-ok');
    return true;
  }
  devTermLog('用法：'+cmd+' on|off','tl-err');
  return false;
}

var DEV = { bypass:false, openGM:false, achPanel:false, freeze:false, root:false, sudoAsk:false, sudoFail:0 };

function handleDevTest(raw){
  var txt=String(raw).trim();

  /* DevTest:OpenGMMenuAddAchievement —— 在 GM 菜单里加「一键全成就」（可带 =true/false） */
  var mAdd=txt.match(/^DevTest:OpenGMMenuAddAchievement\s*(?:=\s*(true|false))?$/i);
  if(mAdd){
    var on = (mAdd[1]===undefined) ? true : (mAdd[1].toLowerCase()==='true');
    DEV.achPanel = on;
    if(on){
      CHEAT.opened=true;
      openCheatPanel();
      toast('DevTest：GM 菜单已加入「一键全成就」');
    } else {
      toast('DevTest：已移除「一键全成就」');
      cheatRenderBox();
    }
    return;
  }

  var m=txt.match(/^DevTest:(BypassGMMenu|OpenTheGMMenu)\s*=\s*(true|false)$/i);
  if(!m){
    toast('DevTest 指令不对：BypassGMMenu / OpenTheGMMenu / OpenGMMenuAddAchievement');
    return;
  }
  var key=m[1].toLowerCase(), val=(m[2].toLowerCase()==='true');
  if(key==='bypassgammenu' || key==='bypassgmmenu'){
    DEV.bypass=val;
    toast(val ? 'DevTest：已临时允许多用 GM 仍给成就与排行榜' : 'DevTest：已恢复 GM 限制');
  } else if(key==='openthegmmenu'){
    DEV.openGM=val;
    if(val){
      CHEAT.opened=true;          /* 允许这次打开 */
      openCheatPanel();
      toast('DevTest：GM 菜单已打开');
    } else {
      closeCheatPanel();
      collapseCheat();
      toast('DevTest：GM 菜单已关闭');
    }
  }
  if(typeof updateCheatTag==='function') updateCheatTag();
  if(typeof renderAchChip==='function') renderAchChip();
}

/* 把本机 cookie 里的成绩导出成 scores.json 下载下来 */
function exportScores(){
  var data={
    game:'Escape From the School on HTML',
    exportedAt:new Date().toISOString(),
    player:readCookie(NAME_KEY)||'无名同学',
    achievements:(function(){
      var a=[]; for(var k in ACH_OWNED) if(ACH_OWNED[k]) a.push(k); return a;
    })(),
    scores:boardLoad()
  };
  var txt=JSON.stringify(data,null,2);
  try{
    var blob=new Blob([txt],{type:'application/json;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url; a.download='scores.json';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); },400);
    toast('已导出 scores.json');
  }catch(e){
    toast('导出失败：'+e.message);
  }
}
/* ================= 作弊菜单 =================
   触发：连点标题「Escape From the School on HTML」7 次。
   规则：本局开启作弊 → 立刻关闭排行榜、不记录成绩、不给成就。
   每次进入页面只能开一次，重进页面要重新触发。
*/
var CHEAT = {
  opened:false,      /* 本次页面是否已经触发过（只限一次） */
  on:false,          /* 作弊是否生效 */
  noClip:false,      /* 穿墙 */
  god:false,         /* 无视伤害 */
  fast:false,        /* 加速移动 */
  torchAll:false,    /* 全局手电 */
  banned:false,      /* 本局用过作弊（跳楼/拉闸/给道具）→ 不记成绩 */
  tapCount:0,
  tapTimer:null
};

/* 可单独开关的道具清单 */
var CHEAT_ITEMS = ['flag','redkey','yellowkey','saw','hammer','wood','knife','blueprint','blackkey','torch','stealth','cola'];

function cheatTap(){
  if(CHEAT.opened){ toast('本页面已经触发过作弊了，刷新后再试'); return; }
  CHEAT.tapCount++;
  if(CHEAT.tapTimer) clearTimeout(CHEAT.tapTimer);
  CHEAT.tapTimer=setTimeout(function(){ CHEAT.tapCount=0; }, 1200);
  if(CHEAT.tapCount>=7){
    CHEAT.tapCount=0;
    CHEAT.opened=true;
    openCheatPanel();
  }
}

function openCheatPanel(){
  var box=document.getElementById('cheatPanel');
  var ball=document.getElementById('gmBall');
  if(!box) return;
  cheatMarkUsed();                         /* 一旦打开 GM，本局就不给成就/不记榜 */
  box.classList.remove('hidden');
  if(ball) ball.classList.add('hidden');     /* 展开时收起小球 */
  cheatRenderBox();
}

/* 收成小球：面板隐藏，红色 GM 球出现 */
function collapseCheat(){
  var box=document.getElementById('cheatPanel');
  var ball=document.getElementById('gmBall');
  if(box) box.classList.add('hidden');
  if(ball) ball.classList.remove('hidden');
}

/* 点小球重新展开 */
function toggleCheatPanel(){
  var box=document.getElementById('cheatPanel');
  if(!box) return;
  if(box.classList.contains('hidden')) openCheatPanel();
  else collapseCheat();
}

/* 单个道具开关：给一件就给一件，取消就收回 */
/* ================= GM 数据清理（都要确认两次） ================= */
var pendingWipe = {};        /* {key:true} 记录哪个操作已经被点过一次确认 */

/* 两步确认：第一次点按钮 → 变成「再点确认」，10 秒内不点就还原 */
function wipeConfirm(key, label, action){
  if(!pendingWipe[key]){
    pendingWipe[key]=true;
    toast('⚠ 再点一次「'+label+'」确认');
    cheatRenderBox();
    setTimeout(function(){
      if(pendingWipe[key]){ pendingWipe[key]=false; if(typeof cheatRenderBox==='function') cheatRenderBox(); }
    }, 10000);
    return false;
  }
  /* 第二次确认 → 真正执行 */
  pendingWipe[key]=false;
  action();
  return true;
}

/* 一键全成就（DevTest 解锁） */
function cheatUnlockAllAch(){
  var n=0;
  for(var i=0;i<ACH_ORDER.length;i++){
    var id=ACH_ORDER[i];
    if(!ACH_OWNED[id]) n++;
    ACH_OWNED[id]=true;
    if(!ACH_COUNT[id] || ACH_COUNT[id]<1) ACH_COUNT[id]=1;
  }
  achSave();
  renderAchChip();
  toast('DevTest：已解锁全部成就（'+ACH_ORDER.length+' 个）');
  cheatRenderBox();
}

/* 清除档案数据（昵称 / 结局解锁 / GM 标记等） */
function wipeAllData(){
  try{ localStorage.removeItem(ACH_KEY); }catch(e){}
  var keys=['efs_name', ACH_KEY, 'efs_clear_once', 'efs_noboard', 'efs_board_v1'];
  for(var i=0;i<keys.length;i++) writeCookie(keys[i], '', 0);
  ACH_OWNED={}; ACH_COUNT={};
  renderAchChip();
  refreshEndingList();
  toast('已清除全部本地数据');
  cheatRenderBox();
}

/* 只清成就 */
function wipeAchievements(){
  try{ localStorage.removeItem(ACH_KEY); }catch(e){}
  writeCookie(ACH_KEY,'',0);
  ACH_OWNED={}; ACH_COUNT={};
  renderAchChip();
  toast('成就已清空');
  cheatRenderBox();
}

/* 只清排行榜 */
function wipeBoard(){
  writeCookie(LB_KEY,'',0);
  try{ localStorage.removeItem(LB_KEY); }catch(e){}
  toast('排行榜已清空');
  cheatRenderBox();
}
function cheatTeleport(floorKey){
  if(!W[floorKey]) return;
  var dest=null;
  /* 优先复用这一层楼梯的自然落点，保证落在可站立的位置 */
  for(var f2 in W){
    var objs=W[f2].objs;
    for(var i=0;i<objs.length;i++){
      if(objs[i].t==='stairs' && objs[i].to===floorKey){
        dest={x:objs[i].tx, y:objs[i].ty};
        break;
      }
    }
    if(dest) break;
  }
  if(!dest){
    /* 找不到就从巡逻点里挑一个 */
    var pt=patrolOf(floorKey);
    dest = (pt && pt.length) ? {x:pt[0].x, y:pt[0].y} : {x:2.5, y:2.5};
  }
  goFloor(floorKey, dest.x, dest.y);
  cheatDisableBoard();               /* 用过作弊跳楼 → 本局不记成绩 */
  toast('已传送到 '+W[floorKey].name);
  cheatRenderBox();
}

/* 一键拉闸：三个电闸全拉下 + 直接打开电子门 */
function cheatAllGates(){
  S.sw = {sw1:true, sw2:true, sw3:true};
  S.elecOpen = true;
  /* 打通电子门那一格（如果在本层） */
  var f=W['B1'];
  if(f){
    for(var i=0;i<f.objs.length;i++){
      var o=f.objs[i];
      if(o.t==='gate' && o.kind==='elec'){ openGateTile(f, o); break; }
    }
  }
  updateHUD();
  cheatDisableBoard();
  toast('三个电闸已全部拉下，电子门通了');
  cheatRenderBox();
}

function cheatToggle(key){
  CHEAT[key]=!CHEAT[key];
  if(key==='noClip'||key==='god'||key==='fast'||key==='torchAll') CHEAT.on=(CHEAT.noClip||CHEAT.god||CHEAT.fast||CHEAT.torchAll);
  if(cheatBlocksBoard()) cheatDisableBoard();   /* 一开作弊就锁排行榜 */
  updateCheatTag();
  cheatRenderBox();
}

function cheatItem(id){
  if(!S.inv) S.inv={};
  if(S.inv[id]){
    S.inv[id]=false;
    if(id==='torch'){ S.flashLike=false; }
    toast('收回：'+ITEM[id].name);
  } else {
    S.inv[id]=true;
    if(id==='flag') S.tookFlag=true;
    if(id==='torch'){ S.flashLike=true; S.flashFloor=''; S.flashOn=false; }
    toast('给予：'+ITEM[id].name);
  }
  cheatDisableBoard();      /* 用过作弊道具同样锁排行榜 */
  updateHUD();
  cheatRenderBox();
}

function cheatRenderBox(){
  var body=document.getElementById('cheatBody');
  if(!body) return;

  function sw(key,label,on,desc){
    return '<div class="crow"><div><b>'+label+'</b><br>'+
      '<span class="cdesc">'+desc+'</span></div>'+
      '<button data-ck="'+key+'" class="'+(on?'on':'')+'">'+(on?'已开':'关闭')+'</button></div>';
  }

  var html='<div class="csec">功能</div>';
  html+=sw('noClip','穿墙',CHEAT.noClip,'无视墙壁，直接走过去');
  html+=sw('god','无视伤害',CHEAT.god,'老师 / 保安 / 监控都抓不到你');
  html+=sw('fast','加速移动',CHEAT.fast,'移动速度 ×2（可乐可叠加）');
  html+=sw('torchAll','全局手电',CHEAT.torchAll,'所有地下层都亮，随时可用');
  html+='<div class="crow"><div><b>一键拉闸</b><br>'+
    '<span class="cdesc">三个电闸一次全部拉下、打开电子门</span></div>'+
    '<button data-ca="gates">全部拉闸</button></div>';

  /* 快速加入地图（joinmap 快捷入口） */
  html+='<div class="csec">快速加入地图</div>';
  html+='<div class="ctele">';
  var jmDiffs=[['easy','简单'],['normal','普通'],['hard','困难'],['hell','地狱']];
  for(var jd=0;jd<jmDiffs.length;jd++){
    html+='<button data-cj="diff='+jmDiffs[jd][0]+'">'+jmDiffs[jd][1]+'</button>';
  }
  html+='</div>';
  html+='<div class="ctele">';
  html+='<button data-cj="style=terminal color=terminal">终端主题开局</button>';
  html+='<button data-cj="style=material">Material 开局</button>';
  html+='<button data-cj="style=classic">原版开局</button>';
  html+='</div>';
  /* 一键跳楼层 */
  html+='<div class="csec">一键跳楼层</div>';
  html+='<div class="ctele">';
  for(var fi=0;fi<FLOOR_CHAIN.length;fi++){
    var fk=FLOOR_CHAIN[fi];
    var cur=(S.floor===fk);
    html+='<button data-cf="'+fk+'" class="'+(cur?'on':'')+'">'+
      (W[fk]? W[fk].name : fk)+'</button>';
  }
  html+='</div>';

  /* DevTest 解锁的额外功能 */
  if(DEV.achPanel){
    html+='<div class="csec">DevTest · 成就</div>';
    html+='<div class="crow"><div><b>一键全成就</b><br>'+
      '<span class="cdesc">立即解锁全部成就（含炫彩），次数记 1</span></div>'+
      '<button data-ca="allach">全部解锁</button></div>';
  }

  html+='<div class="csec">数据清理（都要确认两次）</div>';
  html+='<div class="crow"><div><b>清除存档数据</b><br>'+
    '<span class="cdesc">昵称、GM 标记、结局解锁等 cookie 全清</span></div>'+
    '<button data-ca="wipedata" class="danger">清除数据</button></div>';
  html+='<div class="crow"><div><b>清除成就</b><br>'+
    '<span class="cdesc">成就解锁状态与累计次数全部归零</span></div>'+
    '<button data-ca="wipeach" class="danger">清除成就</button></div>';
  html+='<div class="crow"><div><b>清除排行榜</b><br>'+
    '<span class="cdesc">本机排行榜记录全部删除</span></div>'+
    '<button data-ca="wipeboard" class="danger">清除排行</button></div>';

  html+='<div class="csec">道具（逐个开关）</div>';
  for(var i=0;i<CHEAT_ITEMS.length;i++){
    var id=CHEAT_ITEMS[i];
    var has=!!(S.inv && S.inv[id]);
    html+='<div class="crow"><div>'+ITEM[id].icon+' <b>'+ITEM[id].name+'</b></div>'+
      '<button data-ci="'+id+'" class="'+(has?'on':'')+'">'+(has?'已给':'给予')+'</button></div>';
  }

  html+='<div class="cwarn">⚠ 开启作弊会关闭排行榜：成绩和成就都不记录。<br>本页面只能触发一次，刷新后需重新连点标题。</div>';
  body.innerHTML=html;

  var bs=body.querySelectorAll('button');
  for(var k=0;k<bs.length;k++){
    (function(b){
      b.onclick=function(){
        var ck=b.getAttribute('data-ck');
        var ci=b.getAttribute('data-ci');
        var ca=b.getAttribute('data-ca');
        var cf=b.getAttribute('data-cf');
        var cj=b.getAttribute('data-cj');
        if(cj){
          var jo=joinmapParse(String(cj).split(' '));
          if(jo.err){ toast(jo.err); }
          else { closeCheatPanel(); collapseCheat(); joinmapExec(jo); }
        }
        else if(cf) cheatTeleport(cf);
        else if(ca==='gates') cheatAllGates();
        else if(ca==='allach') cheatUnlockAllAch();
        else if(ca==='wipedata') wipeConfirm('data','清除数据', wipeAllData);
        else if(ca==='wipeach') wipeConfirm('ach','清除成就', wipeAchievements);
        else if(ca==='wipeboard') wipeConfirm('board','清除排行', wipeBoard);
        else if(ck) cheatToggle(ck);
        else if(ci) cheatItem(ci);
      };
    })(bs[k]);
  }
}

/* 按玩法模式切换操作控件：回合制=四键，经典=圆形摇杆 */
function refreshPadMode(){
  var classic=(S.mode2==='classic');
  var sw=document.getElementById('stickWrap');
  var btns=document.getElementById('dpadBtns');
  if(sw) sw.classList[classic?'add':'remove']('on');
  if(btns) btns.style.display = classic ? 'none' : '';
}

function updateCheatTag(){
  var t=document.getElementById('cheatTag');
  if(!t) return;
  var any=CHEAT.noClip||CHEAT.god;
  if(any){ t.style.display=''; t.textContent='CHEAT'; }
  else t.style.display='none';
}

function closeCheatPanel(){
  collapseCheat();           /* 关闭 = 收成红色 GM 小球 */
}

/* 作弊是否拦截排行榜 / 成就（DevTest 可临时绕过） */
function cheatBlocksBoard(){
  if(typeof DEV!=='undefined' && DEV.bypass) return false;   /* DevTest 绕过 */
  return CHEAT.noClip||CHEAT.god||CHEAT.fast||CHEAT.torchAll||CHEAT.banned;
}

/* 作弊开启时清空并锁住排行榜 */
function cheatDisableBoard(){
  CHEAT.banned=true;                 /* 本局作废（跳楼 / 拉闸 / 给道具都算） */
  writeCookie(LB_KEY, '[]', 1);
  writeCookie('efs_noboard','1', 1);
}
function boardAllowed(){
  return !cheatBlocksBoard();
}

/* 面板拖动 */
function makeDraggable(el, handle){
  var sx=0, sy=0, ox=0, oy=0, dragging=false;
  function down(e){
    /* 按在按钮上时不拖动，否则按钮点不动 */
    var tgt=e.target||e.srcElement;
    if(tgt && tgt.tagName==='BUTTON') return;
    var t=e.touches? e.touches[0] : e;
    dragging=true;
    sx=t.clientX; sy=t.clientY;
    var r=el.getBoundingClientRect();
    ox=r.left; oy=r.top;
    el.style.left=ox+'px'; el.style.top=oy+'px';
    el.style.transform='none';
    el.style.margin='0';
    e.preventDefault();
  }
  function move(e){
    if(!dragging) return;
    var t=e.touches? e.touches[0] : e;
    el.style.left=(ox+t.clientX-sx)+'px';
    el.style.top =(oy+t.clientY-sy)+'px';
    e.preventDefault();
  }
  function up(){ dragging=false; }
  handle.addEventListener('mousedown',down);
  handle.addEventListener('touchstart',down,{passive:false});
  document.addEventListener('mousemove',move);
  document.addEventListener('touchmove',move,{passive:false});
  document.addEventListener('mouseup',up);
  document.addEventListener('touchend',up);
  document.addEventListener('touchcancel',up);
}
/* ================= 隐藏结局：地下室打电话 =================
   条件：必须在地狱模式，站在地下室 EXIT（stairWin）旁边不动满 5 秒。
   触发后弹出拨号界面，输入 7 个 7 并拨打，进入原作者对话，最终通关。
*/
var PHONE = {
  timer:0,
  open:false,
  input:'',
  talking:false
};
var PHONE_WAIT = 5.0;

function phoneReset(){
  PHONE.timer=0; PHONE.open=false; PHONE.input=''; PHONE.talking=false;
}

function updatePhoneHidden(dt){
  if(S.mode!=='play'){ PHONE.timer=0; return; }
  if(PHONE.open || PHONE.talking) return;
  if(S.diff!=='hell'){ PHONE.timer=0; return; }
  var f=fl();
  if(!f || f.key!=='B3'){ PHONE.timer=0; return; }
  var win=null;
  for(var i=0;i<f.objs.length;i++){ if(f.objs[i].t==='stairWin'){ win=f.objs[i]; break; } }
  if(!win){ PHONE.timer=0; return; }
  var d=Math.sqrt(Math.pow(win.x-S.px,2)+Math.pow(win.y-S.py,2));
  if(d>1.2){ PHONE.timer=0; return; }
  if(S.moving){ PHONE.timer=0; return; }
  PHONE.timer += dt;
  if(PHONE.timer>=PHONE_WAIT){
    PHONE.timer=0;
    openPhone();
  }
}

function openPhone(){
  PHONE.open=true; PHONE.input=''; PHONE.talking=false;
  var box=document.getElementById('phonePanel');
  if(!box) return;
  box.classList.remove('hidden');
  phoneRender();
}

function phoneRender(){
  var body=document.getElementById('phoneBody');
  if(!body) return;

  if(PHONE.talking){
    body.innerHTML =
      '<div class="chat">'+
      '<div class="say them"><b>原作者</b><br>干啥?</div>'+
      '<div class="say me"><b>你</b><br>我要通关</div>'+
      '<div class="say them"><b>原作者</b><br>行，我佩服你的实力</div>'+
      '</div>'+
      '<button class="pbtn" id="phoneDone">结束通话 · 通关</button>';
    var b=document.getElementById('phoneDone');
    if(b) b.onclick=function(){ phoneFinish(); };
    return;
  }

  var shown = PHONE.input ? PHONE.input : '—';
  var keys='';
  for(var n=1;n<=9;n++){ keys+='<button class="pk" data-n="'+n+'">'+n+'</button>'; }
  keys+='<button class="pk fn" data-n="del">⌫</button>';
  keys+='<button class="pk" data-n="0">0</button>';
  keys+='<button class="pk fn" data-n="call">拨打</button>';

  body.innerHTML =
    '<div class="pnum">'+shown+'</div>'+
    '<div class="pkey">'+keys+'</div>'+
    '<button class="pbtn ghost" id="phoneCancel">挂断</button>';

  var ks=body.querySelectorAll('.pk');
  for(var i=0;i<ks.length;i++){
    (function(el){
      el.onclick=function(){ phoneKey(el.getAttribute('data-n')); };
    })(ks[i]);
  }
  var c=document.getElementById('phoneCancel');
  if(c) c.onclick=function(){ closePhone(); };
}

function phoneKey(k){
  if(k==='del'){ PHONE.input=PHONE.input.slice(0,-1); phoneRender(); return; }
  if(k==='call'){
    if(PHONE.input==='7777777'){
      PHONE.talking=true;
      phoneRender();
    } else {
      toast('号码不对…');
      PHONE.input='';
      phoneRender();
    }
    return;
  }
  if(PHONE.input.length>=11) return;
  PHONE.input += k;
  phoneRender();
}

function closePhone(){
  PHONE.open=false; PHONE.input=''; PHONE.talking=false;
  var box=document.getElementById('phonePanel');
  if(box) box.classList.add('hidden');
}

function phoneFinish(){
  closePhone();
  PHONE.timer=0;
  S.hiddenEnding=true;
  unlockAch('phone_end');       /* 隐藏结局专属炫彩成就 */
  ending(6);
}