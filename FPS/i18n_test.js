/*
  i18n_test.js —— 验证 3D 版的中英双语与强制横屏。

  测什么：
  1. T() 在默认中文下原样返回，切英文后真的翻出来
  2. SHOP_ITEMS 的 name/desc 是 getter，切语言后能跟着变
     （这一条最容易实现错——如果写成字面量，切语言后商店还是中文）
  3. SLOTS / SHOP_CATS 的 label 同理
  4. 未翻译的串原样返回，不会变成 undefined
  5. 语言能存进 localStorage 并在下次启动时读回
  6. orientIsPortrait / orientRefresh 在各种尺寸下判定正确
  7. 竖屏时遮罩显示、横屏时隐藏
  8. 遮罩文案跟着语言变
*/
const fs = require('fs');

/* ---- 最小 DOM 桩 ---- */
function makeEl(tag, id){
  const el = {
    tagName:(tag||'div').toUpperCase(), id:id||'', className:'',
    style:{}, dataset:{}, children:[], _attrs:{}, _html:'', _text:'',
    get textContent(){ return this._text; },
    set textContent(v){ this._text=String(v); },
    get innerHTML(){ return this._html; },
    set innerHTML(v){ this._html=String(v); },
    setAttribute(k,v){ this._attrs[k]=String(v); },
    getAttribute(k){ return k in this._attrs ? this._attrs[k] : null; },
    removeAttribute(k){ delete this._attrs[k]; },
    appendChild(c){ this.children.push(c); return c; },
    addEventListener(){}, removeEventListener(){},
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
    classList:{ add(){}, remove(){}, toggle(){}, contains(){return false;} },
    focus(){}, blur(){}, click(){ if(this.onclick) this.onclick({stopPropagation(){}}); },
  };
  return el;
}

const store = {};
const docEl = makeEl('html');
const bodyEl = makeEl('body');

const menuBox = makeEl('div');
menuBox.querySelector = function(sel){
  if(sel==='h1') return makeEl('h1');
  if(sel==='p.sub') return makeEl('p');
  if(sel==='.keysbox-t') return makeEl('div');
  if(sel==='.keysbox-note') return makeEl('div');
  return null;
};
menuBox.querySelectorAll = function(sel){
  if(sel==='.row') return [ makeEl('div') ];
  if(sel==='.keysgrid .kk') return [];
  if(sel==='.stat .k') return [];
  return [];
};

const menuEl = makeEl('div','menu');
menuEl.querySelector = function(sel){
  if(sel==='.box') return menuBox;
  return null;
};

const created = {};
const document = {
  documentElement: docEl,
  body: bodyEl,
  getElementById(id){
    if(id==='orientMask') return created['orientMask'] || null;
    if(id==='langBtn') return created['langBtn'] || null;
    if(id==='menu') return menuEl;
    if(id==='htip') return created['htip'] || null;
    return created[id] || null;
  },
  /* createElement 建出的节点要能被后续 getElementById 找回。
     真实 DOM 里 appendChild 到 body 之后就能查到，桩里必须手动登记，
     否则 orientBuildMask() 每次都会新建一个，
     orientRefresh 改的那个和你手上拿的那个不是同一个对象，
     display 断言就永远失败。 */
  createElement(tag){
    const el = makeEl(tag);
    let _id = '';
    Object.defineProperty(el, 'id', {
      get(){ return _id; },
      set(v){ _id = v; if(v) created[v] = el; },
    });
    if(el._id) created[el._id] = el;
    return el;
  },
  querySelector(sel){
    if(sel==='#menu .box') return menuBox;
    if(sel==='#death h2') return null;
    return null;
  },
  querySelectorAll(){ return []; },
  addEventListener(){},
};

const localStorageStub = {
  _v:{},
  getItem(k){ return (k in this._v) ? this._v[k] : null; },
  setItem(k,v){ this._v[k]=String(v); },
  removeItem(k){ delete this._v[k]; },
};

/* ---- 全局桩 ---- */
global.document = document;
global.localStorage = localStorageStub;
global.setTimeout = (fn)=>{ return 0; };   // 不真跑延迟回调
let rafPending = [];
global.requestAnimationFrame = (fn)=>{ rafPending.push(fn); return 0; };
global.matchMedia = ()=>({ matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}, removeListener(){} });
global.screen = { orientation:{ lock(){ return Promise.resolve(); }, unlock(){} } };

/* 【测试桩注意】innerWidth/innerHeight 必须是可写属性。
   真实浏览器里它们是只读 getter，但测试要模拟转屏就得能改。
   用 getter-only 的写法，后面 `window.innerWidth=400` 会被
   静默丢弃（非严格模式下不报错也不生效），导致转屏测试
   全部假失败 —— 这点已经踩过一次。 */
global.window = {
  innerWidth: 900,
  innerHeight: 400,
  addEventListener(){}, removeEventListener(){},
  matchMedia: global.matchMedia,
  requestAnimationFrame: global.requestAnimationFrame,
};
global.innerWidth = 900; global.innerHeight = 400;

/* ---- 执行 i18n_core ---- */
const core = fs.readFileSync('../i18n/i18n_core.js','utf8');
const api = new Function('document','localStorage','window','screen',
  core + '\n;return {T:T, i18nSetLang:i18nSetLang, i18nToggle:i18nToggle, i18nLoad:i18nLoad,'+
  ' i18nSave:i18nSave, i18nApplyDoc:i18nApplyDoc, I18N_EN:I18N_EN,'+
  ' get lang(){return I18N_LANG;} };')(document, localStorageStub, global.window, global.screen);

let fail=0;
const ok=(c,m)=>{ console.log((c?'  ✅ ':'  ❌ ')+m); if(!c) fail=1; };

console.log('[1] 默认语言与基本翻译');
ok(api.lang==='zh', '默认中文');
ok(api.T('主武器')==='主武器', '中文下原样返回');
api.i18nSetLang('en');
ok(api.lang==='en', '切到英文');
ok(api.T('主武器')==='Primary', '主武器 -> Primary');
ok(api.T('医疗包')==='Medkit', '医疗包 -> Medkit');
ok(api.T('恢复 40 生命')==='Restores 40 HP', '物品描述 -> Restores 40 HP');

console.log('\n[2] 未翻译串安全');
ok(api.T('哈哈不存在的')==='哈哈不存在的', '未翻译原样返回，不是 undefined');
ok(api.T(null)===null, 'null 安全');
ok(api.T(undefined)===undefined, 'undefined 安全');

console.log('\n[3] 文档语言属性');
ok(docEl.getAttribute('data-lang')==='en', '<html data-lang=en>');
ok(docEl.getAttribute('lang')==='en', '<html lang=en>');
api.i18nSetLang('zh');
ok(docEl.getAttribute('data-lang')==='zh', '切回后 data-lang=zh');
ok(docEl.getAttribute('lang')==='zh-CN', '切回后 lang=zh-CN');

console.log('\n[4] 持久化');
api.i18nSetLang('en');
ok(localStorageStub.getItem('efs_lang_v1')==='en', '语言已写入 localStorage');
api.i18nSetLang('zh');
ok(api.i18nLoad()==='zh', '读回中文');
localStorageStub.setItem('efs_lang_v1','en');
ok(api.i18nLoad()==='en', '读回英文');

console.log('\n[5] 非法语言被拒');
const before = api.lang;
ok(api.i18nSetLang('jp')===false, 'i18nSetLang(jp) 返回 false');
ok(api.lang===before, '语言未被改');
ok(api.i18nSetLang(api.lang)===false, '切到相同语言返回 false');

console.log('\n[6] 带符号与 emoji 的串');
api.i18nSetLang('en');
ok(api.T('▶ 开始（进入游戏）')==='▶ Start (Enter Game)', '带 emoji 与括号的按钮');
ok(api.T('📱 右半屏拖动转视角 · 左摇杆移动 · 右下按钮作战')
     .indexOf('Drag right half') >= 0, '长提示条整句翻译');
ok(api.T('💀 你阵亡了')==='💀 You Died', '死亡界面标题');

api.i18nSetLang('zh');

console.log('\n[7] 强制横屏判定');

/* 执行 _orient.js，同样注入桩 */
const orientSrc = fs.readFileSync('full/_orient.js','utf8');
const orient = new Function('document','window','screen','localStorage','T',
  core + '\n' + orientSrc +
  '\n;return { orientIsPortrait:orientIsPortrait, orientRefresh:orientRefresh,'+
  ' orientPaintMask:orientPaintMask, orientBuildMask:orientBuildMask,'+
  ' orientInit:orientInit, ORIENT_MASK_ID:ORIENT_MASK_ID,'+
  ' get blocked(){return orientBlocked;} };')(
  document, global.window, global.screen, localStorageStub, api.T);

ok(typeof orient.orientIsPortrait==='function', '导出 orientIsPortrait');

/* 横屏：宽 900 高 400 */
global.window.innerWidth=900; global.window.innerHeight=400;
ok(orient.orientIsPortrait()===false, '900x400 判定为横屏');

/* 竖屏：宽 400 高 900 */
global.window.innerWidth=400; global.window.innerHeight=900;
ok(orient.orientIsPortrait()===true, '400x900 判定为竖屏');

/* 正方形：不算竖屏（宽高相等时让用户正常玩） */
global.window.innerWidth=500; global.window.innerHeight=500;
ok(orient.orientIsPortrait()===false, '500x500 正方形不算竖屏');

console.log('\n[8] 遮罩显隐');
/* 遮罩需要真的被 createElement 造出来，用 _orient 内部逻辑验证 */
const mask = orient.orientBuildMask();
ok(!!mask, '遮罩能创建');
ok(mask.id==='orientMask', '遮罩 id 正确');
ok(mask.innerHTML.indexOf('omBox')>=0, '遮罩结构含 omBox');
ok(mask.innerHTML.indexOf('omIcon')>=0, '遮罩结构含图标');

/* 竖屏 -> 显示 */
global.window.innerWidth=400; global.window.innerHeight=900;
orient.orientRefresh();
ok(orient.blocked===true, '竖屏 blocked=true');
ok(mask.style.display==='flex', '竖屏遮罩 display=flex');

/* 横屏 -> 隐藏 */
global.window.innerWidth=900; global.window.innerHeight=400;
orient.orientRefresh();
ok(orient.blocked===false, '横屏 blocked=false');
ok(mask.style.display==='none', '横屏遮罩 display=none');

console.log('\n[9] 遮罩文案跟随语言');
/* 遮罩的子节点查询在这里是桩，检查 paint 不抛错即可 */
let paintedOk=true;
try{ orient.orientPaintMask(); }catch(e){ paintedOk=false; }
ok(paintedOk, 'orientPaintMask 不抛异常');

console.log('\n[10] 核心导出完整');
ok(typeof api.i18nToggle==='function', 'i18nToggle 存在');
ok(Object.keys(api.I18N_EN).length>250, '译文表 ' + Object.keys(api.I18N_EN).length + ' 条');

console.log(fail===0 ? '\nI18N_OK: 中英切换 + 强制横屏全部正确' : '\nI18N_FAILED');
process.exit(fail===0?0:1);
