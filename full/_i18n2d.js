/* ============================================================
   _i18n2d.js —— 2D 版国际化接入层

   2D 版和 3D 版共用同一个 i18n_core.js（T() 等纯函数），
   但界面结构完全不同，所以接入层各写各的。

   2D 版的文字分三类：
   A) HTML 里写死的静态文本（标题、按钮、难度名）—— 按选择器重写
   B) JS 动态生成的（面板内容、结局、成就）—— 由各 build 函数拼字符串，
      在源头包 T()，这里不重复处理
   C) canvas 里画的 —— 画字时包 T()
   ============================================================ */

/* 统一重绘入口。切语言后调这个。 */
function i18n2dRebuild(){
  try{ i18n2dPaintStart(); }catch(e){}
  try{ i18n2dPaintHUD();   }catch(e){}
  try{ i18n2dPaintTheme(); }catch(e){}
  try{ i18nApplyDOM();     }catch(e){}
  try{ i18nApplyDoc();     }catch(e){}
  /* 面板如果开着，重开一次让里面的文案跟着变 */
  try{
    var p=document.getElementById('panel');
    if(p && !p.classList.contains('hidden') && typeof window.__reopenPanel === 'function'){
      window.__reopenPanel();
    }
  }catch(e){}
  /* 结束界面同理 */
  try{
    var e2=document.getElementById('endScr');
    if(e2 && !e2.classList.contains('hidden') && typeof window.__repaintEnd === 'function'){
      window.__repaintEnd();
    }
  }catch(e){}
}

/* 快捷设文本：找不到节点就跳过，不报错 */
function T2Set(el, txt){ if(el) el.textContent = txt; }
function T2Sel(sel, txt, root){
  var r = root || document;
  if(!r || !r.querySelector) return;
  var n = r.querySelector(sel);
  if(n) n.textContent = txt;
}

/* ---------- A) 开始界面 / 结束界面 ---------- */
function i18n2dPaintStart(){
  if(typeof document==='undefined') return;
  var ss = document.getElementById('startScr');
  if(!ss) return;

  /* 大标题下面是副标题，两条 .sub 各自含义不同，按顺序处理 */
  var subs = ss.querySelectorAll('p.sub');
  if(subs.length >= 1){
    /* 第一条是「逃离学校 · HTML版」 */
    if(!subs[0].getAttribute('data-i18n-key'))
      subs[0].setAttribute('data-i18n-key','逃离学校 · HTML版');
    subs[0].textContent = T(subs[0].getAttribute('data-i18n-key'));
  }
  if(subs.length >= 2){
    if(!subs[1].getAttribute('data-i18n-key'))
      subs[1].setAttribute('data-i18n-key','五种结局 · 被抓两次就失败');
    subs[1].textContent = T(subs[1].getAttribute('data-i18n-key'));
  }

  /* 玩法模式 / 选择难度 两个小标题 */
  var labels = ss.querySelectorAll('p.sub[style*=margin-top]');
  for(var i=0;i<labels.length;i++){
    var el = labels[i];
    var key = el.getAttribute('data-i18n-key');
    if(!key){
      var cur = (el.textContent||'').trim();
      if(/玩法/.test(cur)) key='玩法模式';
      else if(/难度/.test(cur)) key='选择难度';
      else continue;
      el.setAttribute('data-i18n-key', key);
    }
    el.textContent = T(key);
  }

  /* 模式按钮：每个是 .dbtn，内含 <small> 副标题 */
  var MODE = [
    { main:'回 合 制',        sub:'按一下走一格' },
    { main:'摇杆 + 全地图',   sub:'连续移动 · 全图可见' },
    { main:'🔫 FPS 搜打撤',   sub:'3D 第一人称 · three.js' }
  ];
  var mbtns = ss.querySelectorAll('.diffs .dbtn');
  /* 前三个是模式，后四个（若存在）是难度 —— 用 data 属性区分更稳 */
  var modeBtns = ss.querySelectorAll('.dbtn[data-mode], #fpsModeBtn');
  for(var j=0;j<modeBtns.length;j++){
    var b = modeBtns[j];
    var small = b.querySelector('small');
    var key = b.getAttribute('data-i18n-key');
    if(!key){
      var raw = (b.childNodes[0] && b.childNodes[0].nodeValue) ? b.childNodes[0].nodeValue.trim() : '';
      if(raw) b.setAttribute('data-i18n-key', raw);
      key = raw;
    }
    if(key){
      /* 只改第一个文本节点，保留 <small> 结构 */
      if(b.childNodes[0] && b.childNodes[0].nodeType === 3){
        b.childNodes[0].nodeValue = T(key);
      }
    }
    if(small){
      var sk = small.getAttribute('data-i18n-key');
      if(!sk){ sk = (small.textContent||'').trim(); if(sk) small.setAttribute('data-i18n-key', sk); }
      if(sk) small.textContent = T(sk);
    }
  }

  /* 难度按钮：data-diff */
  var dbtns = ss.querySelectorAll('.dbtn[data-diff]');
  for(var k2=0;k2<dbtns.length;k2++){
    var db = dbtns[k2];
    var dsk = db.getAttribute('data-i18n-key');
    if(!dsk){
      var dv = (db.childNodes[0] && db.childNodes[0].nodeValue) ? db.childNodes[0].nodeValue.trim() : '';
      if(dv) db.setAttribute('data-i18n-key', dv);
      dsk = dv;
    }
    if(dsk && db.childNodes[0] && db.childNodes[0].nodeType === 3){
      /* 「简 单」中间有空格，翻译表里存的是「简单」，
         所以查表前去掉所有空白，查不到就保留原文。 */
      var squeezed = dsk.replace(/\s+/g,'');
      var hit = T(squeezed);
      db.childNodes[0].nodeValue = (hit !== squeezed) ? hit : dsk;
    }
    var dsm = db.querySelector('small');
    if(dsm){
      var dsk2 = dsm.getAttribute('data-i18n-key');
      if(!dsk2){ dsk2=(dsm.textContent||'').trim(); if(dsk2) dsm.setAttribute('data-i18n-key', dsk2); }
      if(dsk2) dsm.textContent = T(dsk2);
    }
  }

  /* 固定按钮 */
  T2Sel('#startBtn', T('开始游戏'), ss);
  T2Sel('#boardBtn', T('🏆 排行榜'), ss);
  T2Sel('#achBtn',   T('🎖 成就'),   ss);
  T2Sel('#nameBtn',  T('✏️ 改昵称'), ss);
  T2Sel('#expBtn',   T('⬇️ 导出'),   ss);
  T2Sel('#againBtn', T('再来一次'),  document.getElementById('endScr')||document);
  T2Sel('#backMenuBtn', T('回主菜单'));

  /* 结束界面标题（内含「结局」/「隐藏结局」时动态改写，这里只处理静态部分） */
  /* ========== 说明卡片 / 逃脱路线 / 制作名单 ==========
     【为什么要在这里补】切英文后能看到
       「操作：WASD / 方向键 移动」「五条逃走路线」这些还是中文，
     因为它们是直接写在 a_head.html 的 HTML 里，根本没过 T()。
     上面那些只处理了标题和按钮，没碰这两块。
     这里用 innerHTML 整体重写：卡片里有大量 <b> 高亮，
     用 textContent 会把所有加粗全打掉。 */
  var cards = ss.querySelectorAll('.card');
  /* 第一张卡片 = 操作说明 */
  if(cards[0]){
    cards[0].innerHTML =
      '<b>'+T('操作')+': </b>'+T('WASD / 方向键 移动（手机用左下摇杆拖动）')+'<br>'+
      '<b>E</b> / '+T('「行动」键：商店、制作台、门、树')+'<br>'+
      '<b>V</b> / '+T('「跳过」键：在')+' <b>'+T('教室')+'</b> '+T('或')+' <b>'+T('厕所')+'</b> '+T('跳过一回合（只有老师/保安走动）')+'<br>'+
      '<b>'+T('被抓')+': </b>'+T('在老师 / 保安 / 监控的视线里待满指定秒数就会被抓（简单 5 秒 / 普通 3 秒 / 困难 1 秒），被抓会')+' <b>'+T('丢失全部道具')+'</b> '+T('并送回教室')+'<br>'+
      '<b>'+T('地狱')+': </b><b>'+T('看见就死')+'</b>, '+T('只有')+' <b>1 '+T('条命')+'</b>, '+T('而且大门和侧门全被封死，')+'<b>'+T('只能走路线四或五')+'</b>. '+T('通关地狱会拿到红色成就')+'<br>'+
      '<b>'+T('小卖部')+': </b>'+T('全部')+'<b>'+T('免费')+'</b>,'+T('但')+'<b>'+T('每局只能选一个')+'</b>: '+T('隐身针 / 黄色钥匙 / 可乐 / 小刀')+'<br>'+
      '<b>'+T('可乐')+': </b>'+T('喝 3 秒（不能动）→ 加速 45%，持续 10 秒；')+'<b>'+T('隐身针')+': </b>'+T('打 3 秒 → 30 秒内监控看不见、被发现要 5 秒')+'<br>'+
      '<b>'+T('小刀')+': </b>'+T('按 E 捅身边敌人，25% 概率直接解决掉他')+'<br>'+
      '<b>'+T('手电筒')+': </b>'+T('在三层 / 四层 / 地下室任一地下层点物品栏使用，整层照亮，')+'<b>'+T('整局只能用一次')+'</b>'+T('（地狱没有）');
  }
  /* 第二张卡片 = 五条逃走路线 + 隐藏结局 */
  if(cards[1]){
    var mystery = cards[1].querySelector('#endMystery');
    var mTxt = mystery ? mystery.textContent : '？？？';
    cards[1].innerHTML =
      '<b>'+T('五条逃走路线')+'</b><br>'+
      '① '+T('被老师抓到两次 → 失败')+'<br>'+
      '② '+T('老师办公室拿工作牌 → 刷开校长办公室拿红钥匙 → 打开大门')+'<br>'+
      '③ '+T('小卖部选黄色钥匙 → 打开二层的侧门')+'<br>'+
      '④ '+T('关掉一层 / 三层 / 四层 三个电闸 → 打开三层电子门 → 用锤子砸开后墙')+'<br>'+
      '⑤ '+T('工具房拿锯子 → 锯小卖部旁的树得木头 → 小卖部选小刀 → 主任办公室拿制作图 → 制作室做黑钥匙 → 开地下室门 → 走到通到校外的楼梯')+'<br>'+
      '<b>'+T('注意')+': </b>'+T('老师和保安会自己上下楼，别以为躲到别的楼层就安全了')+'<br><br>'+
      '<b>'+T('隐藏结局')+'</b><br>'+
      '⑥ <span id="endMystery">'+T(mTxt)+'</span>';
  }
  /* 制作名单 */
  var cr = ss.querySelector('.credits');
  if(cr){
    var cl = cr.querySelector('.cl');
    var clHTML = cl ? cl.outerHTML : '';
    cr.innerHTML =
      T('原版纸上77所做')+'<br>'+
      T('纸上设计，逻辑77,ZYN所做')+'<br>'+
      T('纸上地图77所做')+'<br>'+
      T('HTML版思路，地图ZYN所做')+'<br>'+
      T('HTML版Deepseek v4.1 flash所做')+'<br>'+ clHTML;
  }
}

/* ---------- B) HUD ---------- */
function i18n2dPaintHUD(){
  if(typeof document==='undefined') return;
  /* 楼层名：由游戏逻辑写入，这里只在已有时翻译。
     楼层名（一层/二层…）翻译表里有，但它是游戏状态，
     所以交给 writeFloor 那类函数处理更准；这里兜底处理一次。 */
  var fn = document.getElementById('floorName');
  if(fn){
    var k = fn.getAttribute('data-i18n-key');
    if(!k){ k=(fn.textContent||'').trim(); if(k) fn.setAttribute('data-i18n-key',k); }
    if(k) fn.textContent = T(k);
  }
  /* 「被抓 x/2」里的「被抓」是带 <b> 的，只改前面的文本节点 */
  var chips = document.querySelectorAll('#hud .chip');
  for(var i=0;i<chips.length;i++){
    var c = chips[i];
    var first = c.childNodes[0];
    if(!first || first.nodeType !== 3) continue;
    var raw = first.nodeValue.trim();
    if(!raw) continue;
    var ck = c.getAttribute('data-i18n-key');
    if(!ck){ c.setAttribute('data-i18n-key', raw); ck = raw; }
    first.nodeValue = T(ck) + ' ';
  }
  /* 被发现读条 */
  var st = document.getElementById('seeTxt');
  if(st){
    var sk = st.getAttribute('data-i18n-key');
    if(!sk){ sk='被发现 {0}s / {1}s'; st.setAttribute('data-i18n-key', sk); }
    /* 数值部分由逻辑层写入，这里只保证文案骨架正确 */
  }
  /* 底部提示 */
  var hint = document.getElementById('hintText');
  if(hint){
    var hk = hint.getAttribute('data-i18n-key');
    if(!hk){ hk='WASD / 方向键移动'; hint.setAttribute('data-i18n-key', hk); }
    hint.textContent = T(hk);
  }
  /* 两个操作按钮 */
  var btnE = document.getElementById('btnE');
  if(btnE){
    var sp = btnE.querySelector('span');
    /* 结构是 <span>✋</span>行动 */
    var txtNode = null;
    for(var n=0;n<btnE.childNodes.length;n++){
      if(btnE.childNodes[n].nodeType===3 && (btnE.childNodes[n].nodeValue||'').trim()) txtNode=btnE.childNodes[n];
    }
    if(txtNode){
      var ek = btnE.getAttribute('data-i18n-key');
      if(!ek){ ek=txtNode.nodeValue.trim(); btnE.setAttribute('data-i18n-key', ek); }
      txtNode.nodeValue = T(ek);
    }
  }
  var btnV = document.getElementById('btnV');
  if(btnV){
    var txtNode2 = null;
    for(var n2=0;n2<btnV.childNodes.length;n2++){
      if(btnV.childNodes[n2].nodeType===3 && (btnV.childNodes[n2].nodeValue||'').trim()) txtNode2=btnV.childNodes[n2];
    }
    if(txtNode2){
      var vk = btnV.getAttribute('data-i18n-key');
      if(!vk){ vk=txtNode2.nodeValue.trim(); btnV.setAttribute('data-i18n-key', vk); }
      txtNode2.nodeValue = T(vk);
    }
  }
  /* 面板关闭按钮 */
  var pc = document.getElementById('panelClose');
  if(pc) pc.textContent = T('关闭');
}

/* ---------- C) 主题面板 ---------- */
function i18n2dPaintTheme(){
  if(typeof document==='undefined') return;
  var tp = document.getElementById('themePanel');
  if(!tp) return;
  var h3 = tp.querySelector('h3');
  if(h3) h3.textContent = T('🎨 主题');
  T2Sel('#themeClose', T('完成'), tp);
  T2Sel('#themeReset', T('恢复默认'), tp);
  T2Sel('.tlabel', T('风格'), tp);

  /* 三个风格格：原版 / Material / 终端 */
  var stys = tp.querySelectorAll('.tsty');
  for(var i=0;i<stys.length;i++){
    var st = stys[i];
    var sm = st.querySelector('small');
    var key = st.getAttribute('data-i18n-key');
    if(!key){
      var v = (st.childNodes[0] && st.childNodes[0].nodeValue) ? st.childNodes[0].nodeValue.trim() : '';
      if(v) st.setAttribute('data-i18n-key', v);
      key = v;
    }
    if(key && st.childNodes[0] && st.childNodes[0].nodeType===3){
      st.childNodes[0].nodeValue = T(key);
    }
    if(sm){
      var sk = sm.getAttribute('data-i18n-key');
      if(!sk){ sk=(sm.textContent||'').trim(); if(sk) sm.setAttribute('data-i18n-key', sk); }
      if(sk) sm.textContent = T(sk);
    }
  }
  /* 标题「颜色（256 色）」 */
  var tl = tp.querySelectorAll('.tlabel');
  if(tl.length >= 2){
    var ck = tl[1].getAttribute('data-i18n-key');
    if(!ck){ ck='颜色'; tl[1].setAttribute('data-i18n-key', ck); }
  }
  /* 说明长文 */
  var note = document.getElementById('themeNote');
  if(note){
    var nk = note.getAttribute('data-i18n-key');
    if(!nk){ nk = (note.textContent||'').trim(); if(nk) note.setAttribute('data-i18n-key', nk); }
    if(nk) note.textContent = T(nk);
  }
}

/* ---------- 挂语言按钮 ----------
   2D 版放在开始界面右上角，用 .themeFab 同一套定位风格，
   避免跟「选择难度」那堆按钮抢位置。 */
function i18n2dMountButton(){
  if(typeof document==='undefined') return null;
  var ss = document.getElementById('startScr');
  if(!ss) return null;
  var btn = document.getElementById('langBtn');
  if(!btn){
    btn = document.createElement('div');
    btn.id = 'langBtn';
    btn.className = 'langFab2d';
    ss.appendChild(btn);
  }
  btn.onclick = function(ev){
    if(ev){ ev.stopPropagation(); ev.preventDefault(); }
    i18nToggle(function(){ i18n2dRebuild(); });
    paint();
  };
  function paint(){
    btn.textContent = I18N_LANG === 'zh' ? '🌐 English' : '🌐 中文';
    btn.setAttribute('title', T('切换语言'));
  }
  paint();
  return btn;
}

/* 初始化 */
function i18n2dInit(){
  i18nLoad();
  i18nApplyDoc();
  i18n2dMountButton();
  var run = function(){ try{ i18n2dRebuild(); }catch(e){} };
  if(typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
  else setTimeout(run, 0);
  setTimeout(run, 150);
}
