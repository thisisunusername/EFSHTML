/*
  i18n_2d_test.js —— 验证 2D 版的中英双语。

  重点不是「T() 能不能翻」（那个 3D 版已经测过），
  而是「2D 版特有的接入逻辑对不对」：
    · b_world 里的房间名/物品名/难度名是不是真的 T() 包住了
    · 「简 单」带空格这种写法能不能正确查表
    · 开始界面的按钮文案会不会被改对
    · 切回中文能恢复原样（不会卡在英文）
*/
const fs = require('fs');

/* 加载 i18n 核心，拿一个可控制的 T */
const core = fs.readFileSync('i18n/i18n_core.js','utf8');
const api = new Function('localStorage','document',
  core + '\n;return {T:T, i18nSetLang:i18nSetLang, get lang(){return I18N_LANG;}};')(
  { getItem:()=>null, setItem:()=>{} },
  { documentElement:{ setAttribute:()=>{} } });

let fail = 0;
const ok = (c,m)=>{ console.log((c?'  ✅ ':'  ❌ ')+m); if(!c) fail=1; };

console.log('[1] 2D 房间名（b_world 里已包 T）');
api.i18nSetLang('en');
ok(api.T('教室')==='Classroom', '教室 -> Classroom');
ok(api.T('校长办公室')==="Principal's Office", '校长办公室 -> Principal\'s Office');
ok(api.T('地下室')==='Basement', '地下室 -> Basement');
ok(api.T('墙后通道')==='Passage Behind the Wall', '墙后通道 -> Passage Behind the Wall');

console.log('\n[2] 2D 道具名');
ok(api.T('老师工作牌')==="Teacher's Badge", '老师工作牌 -> Teacher\'s Badge');
ok(api.T('黑钥匙制作图')==='Black Key Blueprint', '黑钥匙制作图 -> Black Key Blueprint');
ok(api.T('隐身针')==='Invisibility Syringe', '隐身针 -> Invisibility Syringe');

console.log('\n[3] 结局标题');
ok(api.T('结局一 · 被抓住了')==='Ending 1 · Caught', '结局一');
ok(api.T('结局五 · 地下室逃脱')==='Ending 5 · Basement Escape', '结局五');
ok(api.T('结局六 · 打电话给原作者')==='Ending 6 · Call the Original Author', '结局六');

console.log('\n[4] 难度名（含带空格的写法）');
/* 界面上写的是「简 单」，查表前要去空格 */
const squeeze = (s)=>s.replace(/\s+/g,'');
const diffBtnText = ['简 单','普 通','困 难','地 狱'];
const expect = ['Easy','Normal','Hard','Hell'];
for(let i=0;i<diffBtnText.length;i++){
  const sq = squeeze(diffBtnText[i]);
  const hit = api.T(sq);
  ok(hit===expect[i], '「'+diffBtnText[i]+'」去空格查到 '+hit);
}

console.log('\n[5] 交互提示');
ok(api.T('按 E 打开小卖部').indexOf('Press E')===0, '按 E 打开小卖部');
ok(api.T('按 E 用小刀捅他（25% 概率）').indexOf('Press E')===0, '带百分号的提示');
ok(api.T('需要锯子才能锯树（工具房里有）').indexOf('need a saw')>0, '长提示句子');

console.log('\n[6] 带空格与冒号的短串');
ok(api.T('获得 ')==='Obtained ', '「获得 」保留尾部空格（后面接物品名）');
ok(api.T('昵称已保存：')==='Nickname saved: ', '冒号结尾');
ok(api.T('免 费')==='FREE', '带空格的「免 费」');

console.log('\n[7] 切回中文可以恢复');
api.i18nSetLang('zh');
ok(api.T('教室')==='教室', '教室 恢复中文');
ok(api.T('结局一 · 被抓住了')==='结局一 · 被抓住了', '结局恢复中文');
ok(api.T('简 单')==='简 单', '带空格原文原样保留');

console.log('\n[8] 未翻译串安全（2D 里还有大量 DevTest 文本未翻）');
ok(api.T('DevTest 终端仅在「终端」风格下可用')==='DevTest 终端仅在「终端」风格下可用', '未翻译原样返回');
ok(api.T('')==='', '空串安全');

console.log('\n[9] 字典规模');
api.i18nSetLang('en');
const dict = new Function(core + '\n;return I18N_EN;')();
ok(Object.keys(dict).length > 350, '译文条目 ' + Object.keys(dict).length + ' 条');

/* [10] 静态检查：b_world.js 的关键字段是否都包了 T */
console.log('\n[10] 源码静态检查');
const bw = fs.readFileSync('full/b_world.js','utf8');
ok(/easy:\s*\{name:T\('简单'\)/.test(bw), 'DIFF.easy.name 已包 T()');
ok(/hell:\s*\{name:T\('地狱'\)/.test(bw), 'DIFF.hell.name 已包 T()');
ok(/flag:\s*\{name:T\('老师工作牌'\)/.test(bw), 'ITEM.flag.name 已包 T()');
ok(/torch:\s*\{name:T\('手电筒'\)/.test(bw), 'ITEM.torch.name 已包 T()');
ok(/key:'2F', name:T\('一层'\)/.test(bw), 'W.2F.name 已包 T()');
ok(/\{name:T\('教室'\)/.test(bw), 'rooms[0].name 已包 T()');
ok(/label:T\('大门'\)/.test(bw), 'objs label 已包 T()');
/* 确保没有漏网的裸中文字面量躺在 name: 后面 */
const missName = bw.match(/name:'[\u4e00-\u9fff][^']*'/g) || [];
ok(missName.length===0, '没有漏包的 name: 中文字面量（实际 '+missName.length+' 处）');
const missLabel = bw.match(/label:'[\u4e00-\u9fff][^']*'/g) || [];
ok(missLabel.length===0, '没有漏包的 label: 中文字面量（实际 '+missLabel.length+' 处）');

console.log(fail===0 ? '\nI18N_2D_OK: 2D 版中英切换全部正确' : '\nI18N_2D_FAILED');
process.exit(fail===0?0:1);
