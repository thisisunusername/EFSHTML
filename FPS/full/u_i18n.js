/* ============================================================
   u_i18n.js —— 3D 版国际化接入层

   i18n_core.js 只提供 T()/i18nSetLang() 这些纯函数，
   不知道「这个游戏有哪些界面要重绘」。本文件负责把它接上去。

   为什么用 querySelector 而不是一堆 getElementById：
   主菜单里的 stat 标题、按键说明都是无 id 的 <div class="k">，
   按结构定位（.row > .stat > .k）比给它们逐个加 id 更稳，
   也不会动到 a_head.html 里的既有结构。
   ============================================================ */

/* 重绘所有依赖语言的界面。
   每一步单独 try：某块没准备好（还没进局、面板未建）
   不应该把整个切换流程弄崩。 */
function i18nRebuildAll(){
  try{ i18nPaintMenu();   }catch(e){}
  try{ i18nPaintHUD();    }catch(e){}
  try{ i18nPaintPanels(); }catch(e){}
  try{ i18nApplyDOM();    }catch(e){}
  try{ if(typeof refreshHUD==='function')       refreshHUD();     }catch(e){}
  try{ if(typeof buildShop==='function')        buildShop();      }catch(e){}
  try{ if(typeof buildBagNew==='function')      buildBagNew();    }catch(e){}
  try{ if(typeof buildStash==='function')       buildStash();     }catch(e){}
  try{ if(typeof refreshWpnBar==='function')    refreshWpnBar();  }catch(e){}
  try{ if(typeof orientPaintMask==='function')  orientPaintMask();}catch(e){}
  try{ i18nApplyDoc();    }catch(e){}
}

/* 快捷：按选择器改文本 */
function i18nSetText(sel, txt, root){
  const r = root || (typeof document!=='undefined' ? document : null);
  if(!r || !r.querySelector) return false;
  const n = r.querySelector(sel);
  if(!n) return false;
  n.textContent = txt;
  return true;
}

/* ---------- 主菜单 ---------- */
function i18nPaintMenu(){
  if(typeof document==='undefined') return;
  const box=document.querySelector('#menu .box');
  if(!box) return;

  /* 标题：🔫 FPS 搜打撤 · 学校 3D
     里面有 <span>搜打撤</span>，所以整串重写，保留 emoji 与结构 */
  const h1=box.querySelector('h1');
  if(h1){
    h1.innerHTML='🔫 FPS <span>'+T('搜打撤')+'</span> '+T('· 学校 3D');
  }

  /* 副标题 */
  const sub=box.querySelector('p.sub');
  if(sub) sub.textContent=T('搜刮物资 → 击杀敌人 → 撤离点撤离。货币可在商店购买装备。数据加密导出，防篡改。');

  /* 操作说明标题 + 手机提示 */
  i18nSetText('.keysbox-t', '⌨️ '+T('操作说明'), box);
  i18nSetText('.keysbox-note', T('📱 手机：左半屏拖动移动 · 右半屏拖动转视角 · 右下按钮射击'), box);

  /* 键位说明：只翻 <span> 里的中文动作名，<kbd> 是键盘按键名不能动。
     按下标对应 a_head.html 里 .keysgrid > .kk 的顺序。
     【必须按下标而不是按内容匹配】—— 一旦英文生效内容就变了，
     按内容找第二次就找不到。 */
  const ACTIONS=[
    '移动', '转视角', '射击', '换弹', '奔跑',
    '跳跃', '拾取/互动', '商店', '菜单'
  ];
  const KKATTR=[
    '移动', '转视角', '射击', '换弹', '奔跑',
    '跳跃', '拾取/互动', '商店', '菜单'
  ];
  const kks=box.querySelectorAll('.keysgrid .kk');
  for(let i=0;i<kks.length;i++){
    const sp=kks[i].querySelector('span');
    if(!sp) continue;
    /* 用 data-i18n-key 记住原始中文，切换语言时以它为准，
       避免「已经翻成英文再翻回中文」时找不到 key。 */
    if(!sp.getAttribute('data-i18n-key')){
      sp.setAttribute('data-i18n-key', ACTIONS[i] || sp.textContent);
    }
    sp.textContent=T(sp.getAttribute('data-i18n-key'));
  }

  /* 三个统计格：当前货币 / 撤离次数 / 击杀数 */
  const stats=[T('当前货币'), T('撤离次数'), T('击杀数')];
  const ks=box.querySelectorAll('.stat .k');
  for(let i=0;i<ks.length;i++){
    if(!ks[i].getAttribute('data-i18n-key')){
      ks[i].setAttribute('data-i18n-key', ['当前货币','撤离次数','击杀数'][i] || ks[i].textContent);
    }
    ks[i].textContent=T(ks[i].getAttribute('data-i18n-key'));
  }

  /* 按钮：逐个按 id 重写。emoji 写在代码里，不依赖原文 */
  const REPLACE={
    btnPlay:'▶ '+T('开始游戏')+' ( '+T('进入游戏')+' )',
    btnShop:'🛒 '+T('商店'),
    btnStash:'🏠 '+T('仓库'),
    btnExport:'⬇️ '+T('加密导出'),
    btnImport:'⬆️ '+T('加密导入'),
    btnReset:'♻️ '+T('重置数据'),
    btnBack:'← '+T('返回原版'),
  };
  for(const id in REPLACE){
    const n=document.getElementById(id);
    if(n) n.textContent=REPLACE[id];
  }
  /* 开始按钮英文下不要空格粘连 */
  const bp=document.getElementById('btnPlay');
  if(bp){
    bp.textContent = I18N_LANG==='en'
      ? '▶ '+T('开始游戏')
      : '▶ 开始（进入游戏）';
  }

  /* 死亡界面 */
  const dh=document.querySelector('#death h2');
  if(dh) dh.textContent='💀 '+T('你阵亡了');
  const bdr=document.getElementById('btnRespawn');
  if(bdr) bdr.textContent=T('重新部署');
  const bdm=document.getElementById('btnDeathMenu');
  if(bdm) bdm.textContent=T('回主菜单');
}

/* ---------- HUD ---------- */
function i18nPaintHUD(){
  if(typeof document==='undefined') return;
  /* 唯一需要翻的固定文案是「背包」和「开/关」。
     弹药、时间之类是数字，不用管。 */
  const bagBtn=document.getElementById('bagBtn');
  if(bagBtn){
    /* 结构是 🎒 <span>背包</span>，只改 span */
    const sp=bagBtn.querySelector('span');
    if(sp){
      if(!sp.getAttribute('data-i18n-key')) sp.setAttribute('data-i18n-key', sp.textContent.trim());
      sp.textContent=T(sp.getAttribute('data-i18n-key'));
    }
  }
  const sndTxt=document.getElementById('sndTxt');
  if(sndTxt){
    const raw=sndTxt.getAttribute('data-i18n-key') || sndTxt.textContent.trim();
    sndTxt.setAttribute('data-i18n-key', raw);
    /* 音效开关的「开/关」是状态量，按当前显示值翻。
       raw 只会是「开」或「关」两种之一。 */
    sndTxt.textContent=T(raw==='开'?'开':(raw==='关'?'关':raw));
  }
  /* 常驻操作提示条 */
  if(typeof refreshHtip==='function') refreshHtip();
}

/* 刷新底部常驻提示条的文案。
   htip 的内容会随「是否开镜」变化（f_ui.js 里会改写），
   所以统一走这里生成，避免两处文案不一致。 */
function refreshHtip(){
  if(typeof document==='undefined') return;
  const el=document.getElementById('htip');
  if(!el) return;
  /* 记住当前是哪种状态（开镜 / 普通），而不是记住已经翻好的文字 */
  let st=el.getAttribute('data-htip-state');
  if(!st){
    /* 首次：从现有文本推断 */
    st = /开镜/.test(el.textContent||'') ? 'aim' : 'normal';
    el.setAttribute('data-htip-state', st);
  }
  if(typeof P!=='undefined' && P && P.aim) st='aim';
  el.setAttribute('data-htip-state', st);
  el.textContent = st==='aim'
    ? T('🔭 开镜中 · 再点一次退出')
    : T('📱 右半屏拖动转视角 · 左摇杆移动 · 射击/跳/换弹/拾取在右下 · 靠近门按 E 开门');
}

/* ---------- 商店 / 背包 / 仓库 的静态标题 ----------
   这三个面板整体由 buildXXX() 生成，内容里的物品名/描述
   在 SHOP_ITEMS 里，由 f_ui.js 的 T() 包住。
   这里只补面板级文案（标题、关闭按钮）。 */
function i18nPaintPanels(){
  if(typeof document==='undefined') return;
  ['shop','bag','stash'].forEach(function(id){
    const p=document.getElementById(id);
    if(!p) return;
    p.querySelectorAll('[data-i18n]').forEach(function(n){
      n.textContent=T(n.getAttribute('data-i18n'));
    });
  });
}

/* ---------- 挂语言切换按钮 ----------
   放在主菜单最后一行按钮组里（⊃ 返回原版 右侧），
   不额外占行，也不会跟底部武器条打架。 */
function i18nMountMenuButton(){
  if(typeof document==='undefined') return null;
  /* 已有就复用 */
  let btn=document.getElementById('langBtn');
  if(btn){ i18nPaintLangBtn(btn); return btn; }

  const menu=document.getElementById('menu');
  if(!menu){ return null; }
  const box=menu.querySelector('.box');
  /* 挂在最后一行 .row 里 */
  const rows=box ? box.querySelectorAll('.row') : [];
  const host=rows.length ? rows[rows.length-1] : box;
  if(!host) return null;

  btn=document.createElement('button');
  btn.id='langBtn';
  btn.type='button';
  btn.className='btn ghost small';  /* 跟同排按钮完全一致的外观 */
  host.appendChild(btn);
  btn.onclick=function(ev){
    if(ev) ev.stopPropagation();
    i18nToggle(function(){ i18nRebuildAll(); });
  };
  i18nPaintLangBtn(btn);
  return btn;
}

/* 语言按钮上的字：显示「点了会变成什么」，而不是当前语言。
   这是国际化按钮的惯例（当前是中文就显示 English）。 */
function i18nPaintLangBtn(btn){
  if(!btn) return;
  btn.textContent = I18N_LANG==='zh' ? '🌐 English' : '🌐 中文';
  btn.setAttribute('title', T('切换语言'));
  btn.setAttribute('aria-label', T('切换语言'));
}

/* ---------- 初始化 ---------- */
function i18nInitUI(){
  i18nLoad();          /* 必须先读，否则首帧就是错语言 */
  i18nApplyDoc();
  i18nMountMenuButton();
  const run=function(){ try{ i18nRebuildAll(); }catch(e){} };
  if(typeof requestAnimationFrame==='function') requestAnimationFrame(run);
  else setTimeout(run, 0);
  /* 再补一次：部分面板要等 init() 建完才存在 */
  setTimeout(run, 150);
}
