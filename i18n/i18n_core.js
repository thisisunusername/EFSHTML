/* ============================================================
   i18n_core.js —— 中英双语核心
   由 build.sh 打进 2D / 3D 两版，必须保持「纯函数、无外部依赖」。

   设计要点：
   1) 中文原串直接当 key，译文表只在切换英文时用。
      这样源码里所有中文都不必改，破坏面最小。
   2) T('中文') 找得到译文返回英文，找不到原样返回中文 ——
      漏翻最多是「这句还是中文」，绝不会变成 undefined 或空白。
   3) T() 支持 {0} {1} 占位符，对应 T('复活 {0}', 3)。
   4) 语言存在 localStorage，跨会话保持；<html lang> 同步更新，
      方便 CSS 里按语言调字体/字号。
   ============================================================ */
const I18N_LANGS = ['zh', 'en'];
const I18N_LANG_NAMES = { zh: '中文', en: 'English' };
const I18N_STORE_KEY = 'efs_lang_v1';

/* 当前语言：默认中文，符合原有体验 */
let I18N_LANG = 'zh';

/* 英文译文表：key 是中文原串，value 是英文。
   故意做成「平铺字典」而不是分组，因为查表最快也最好维护。 */
const I18N_EN = {
  /* ---------- 2D 开始界面：操作说明 / 五条逃走路线 / 制作名单 ----------
     【为什么这么多短句】说明卡片原来是直接用 HTML 写的，
     里面夹满了 <b> 高亮，所以没法整段当一个 key。
     现在拆成短句逐段翻译，渲染时再拼回 HTML。 */
  '操作': 'Controls',
  'WASD / 方向键 移动（手机用左下摇杆拖动）': 'WASD / Arrow keys to move (drag the joystick at bottom-left on mobile)',
  '「行动」键：商店、制作台、门、树': 'Action key: shop, crafting bench, doors, trees',
  '「跳过」键：在': 'Skip key: in',
  '或': 'or',
  '跳过一回合（只有老师/保安走动）': 'skip one turn (only teachers/guards move)',
  '在老师 / 保安 / 监控的视线里待满指定秒数就会被抓（简单 5 秒 / 普通 3 秒 / 困难 1 秒），被抓会': 'Stay in a teacher / guard / camera sightline for the required seconds and you are caught (Easy 5s / Normal 3s / Hard 1s). Getting caught means',
  '丢失全部道具': 'losing all your items',
  '并送回教室': 'and being sent back to the classroom',
  '看见就死': 'instant death on sight',
  '只有': 'only',
  '条命': 'life',
  '而且大门和侧门全被封死，': 'and both the main gate and side door are sealed, ',
  '只能走路线四或五': 'only routes 4 or 5 are available',
  '通关地狱会拿到红色成就': 'Clearing Hell unlocks a red achievement',
  '全部': 'all ',
  '免费': 'free',
  '但': ' but ',
  '每局只能选一个': 'you may pick only one per raid',
  '隐身针 / 黄色钥匙 / 可乐 / 小刀': 'Invisibility syringe / Yellow key / Cola / Knife',
  '喝 3 秒（不能动）→ 加速 45%，持续 10 秒；': 'drink for 3s (you cannot move) then +45% speed for 10s; ',
  '打 3 秒 → 30 秒内监控看不见、被发现要 5 秒': 'inject for 3s then cameras cannot see you for 30s, and detection takes 5s',
  '按 E 捅身边敌人，25% 概率直接解决掉他': 'press E to stab a nearby enemy, 25% chance to take them out',
  '在三层 / 四层 / 地下室任一地下层点物品栏使用，整层照亮，': 'use from the item bar on floor 3 / floor 4 / the basement: lights up the whole floor,',
  '整局只能用一次': 'usable only once per raid',
  '（地狱没有）': ' (not available in Hell)',
  '被老师抓到两次 → 失败': 'Caught by a teacher twice → failure',
  '老师办公室拿工作牌 → 刷开校长办公室拿红钥匙 → 打开大门': 'Get the staff badge in the teachers office → badge into the principal office for the red key → open the main gate',
  '小卖部选黄色钥匙 → 打开二层的侧门': 'Pick the yellow key at the shop → unlock the side door on floor 2',
  '关掉一层 / 三层 / 四层 三个电闸 → 打开三层电子门 → 用锤子砸开后墙': 'Shut off the three breakers on floor 1 / 3 / 4 → open the electronic door on floor 3 → smash the back wall with a hammer',
  '工具房拿锯子 → 锯小卖部旁的树得木头 → 小卖部选小刀 → 主任办公室拿制作图 → 制作室做黑钥匙 → 开地下室门 → 走到通到校外的楼梯': 'Get the saw in the tool room → saw the tree by the shop for wood → pick the knife at the shop → get the blueprint in the directors office → craft the black key in the workshop → open the basement door → reach the stairs leading outside',
  '注意': 'Note',
  '老师和保安会自己上下楼，别以为躲到别的楼层就安全了': 'Teachers and guards move between floors on their own — do not assume another floor is safe',
  '原版纸上77所做': 'Original paper version by 77',
  '纸上设计，逻辑77,ZYN所做': 'Paper design & logic by 77, ZYN',
  '纸上地图77所做': 'Paper map by 77',
  'HTML版思路，地图ZYN所做': 'HTML concept & map by ZYN',
  'HTML版Deepseek v4.1 flash所做': 'HTML version by Deepseek v4.1 flash',
  /* ---------- 主题自定义面板（2D 设置里的颜色/字体/字号名） ----------
     这些名字原来直接写在 f_theme.js 的数据表里，不过 T()，
     所以切英文后颜色名/字体名仍然是中文。
     现在渲染处包了 TF()，对应的译文补在这里。 */
  '背景': 'Background',
  '卡片底': 'Card',
  '正文': 'Body text',
  '标题': 'Heading',
  '次要文字': 'Muted text',
  '强调色': 'Accent',
  '描边': 'Border',
  '按钮底': 'Button bg',
  '按钮字': 'Button text',
  '已恢复默认主题': 'Default theme restored',
  '我的主题': 'My theme',
  '已恢复自定义主题默认值': 'Custom theme reset to defaults',
  '配置已复制到剪贴板': 'Config copied to clipboard',
  '配置已复制': 'Config copied',
  '已生成配置，请手动长按文本框全选复制': 'Config generated — long-press the box and Select All to copy',

  /* ---------- 武器耐久 + 改枪台 ---------- */
  '改枪台': 'Gunsmith',
  '耐久': 'Durability',
  '耐久已满': 'Full durability',
  '修理': 'Repair',
  '配件槽': 'Attachment slots',
  '瞄准镜': 'Optic',
  '前握把': 'Foregrip',
  '枪托': 'Stock',
  '枪口': 'Muzzle',
  '弹匣': 'Magazine',
  '扳机': 'Trigger',
  '枪配件': 'Gun parts',
  '空': 'Empty',
  '卸下': 'Remove',
  '伤害': 'Damage',
  '已卸下配件': 'Attachment removed',
  '已经装着了': 'Already installed',
  '货币不足': 'Not enough money',
  '这把武器耐久已满': 'This weapon is already at full durability',
  '武器卡壳了！去改枪台花加钱修理': 'Weapon jammed! Go to the gunsmith to repair it',
  '⚠ 已卡壳：射速腰斩 · 后坐力翻倍 · 弹匣减半': '⚠ Jammed: half fire rate · double recoil · half magazine',
  '装上的配件立即生效 · 换枪各存各的': 'Attachments apply instantly · stored per weapon',
  '你还没有任何武器，先去商店买一把': 'You have no weapons yet. Buy one in the shop first',
  '货币不足，修理需要 ': 'Not enough money, repair costs ',
  '修理完成 · 花费 ': 'Repair complete · cost ',
  '买下 ': 'Bought ',
  ' → 仓库，去改枪台装上': ' → stash, install it at the gunsmith',
  '去主菜单「改枪台」安装配件': 'Go to Gunsmith in the main menu to install it',
  '买下并安装 ': 'Bought and installed ',
  '机械瞳准': 'Iron sights',
  '红点镜': 'Red dot',
  '全息镜': 'Holographic',
  '2x 战术镜': '2x tactical scope',
  '4x 精准镜': '4x precision scope',
  '6x 狙击镜': '6x sniper scope',
  '垂直握把': 'Vertical grip',
  '斜角握把': 'Angled grip',
  '短握把': 'Stubby grip',
  '两脚架': 'Bipod',
  '轻型枪托': 'Light stock',
  '重型枪托': 'Heavy stock',
  '折叠枪托': 'Folding stock',
  '补偿器': 'Compensator',
  '消音器': 'Suppressor',
  '枪口制退器': 'Muzzle brake',
  '扩容弹匣': 'Extended mag',
  '弹鼓': 'Drum mag',
  '快拔弹匣': 'Quickdraw mag',
  '竞赛扳机': 'Competition trigger',
  '轻量化扳机组': 'Lightweight trigger',
  '原厂瞄具 · 无额外效果': 'Factory sights · no bonus',
  '开镜更快 · 倍率 1.3x': 'Faster ADS · 1.3x zoom',
  '视野清晰 · 倍率 1.5x · 轻微稳定': 'Clear view · 1.5x zoom · slight stability',
  '中等倍率 · 远处点射利器': 'Medium zoom · great for ranged taps',
  '高倍率 · 近战视野收缩': 'High zoom · tight CQB view',
  '极高倍率 · 只适合栓动': 'Very high zoom · bolt-action only',
  '大幅减少垂直后坐': 'Greatly reduces vertical recoil',
  '后坐力与开镜速度兼顾': 'Balances recoil and ADS speed',
  '开镜最快 · 后坐力改善最少': 'Fastest ADS · least recoil help',
  '趴下时后坐力几乎归零': 'Almost zero recoil when prone',
  '开镜更快 · 后坐力小幅改善': 'Faster ADS · small recoil help',
  '极稳 · 但开镜变慢': 'Very stable · slower ADS',
  '开镜最快 · 后坐力无改善': 'Fastest ADS · no recoil help',
  '压制枪口上跳': 'Tames muzzle rise',
  '开火不惊动远处敌人 · 略降伤害': 'Quieter firing · slightly less damage',
  '制退最强 · 开镜略慢': 'Strongest braking · slightly slower ADS',
  '弹匣容量 +50%': 'Magazine +50%',
  '容量翻倍 · 换弹变慢': 'Double capacity · slower reload',
  '换弹速度 +35%': 'Reload 35% faster',
  '射速 +15%': 'Fire rate +15%',
  '射速 +25% · 后坐力略增': 'Fire rate +25% · a bit more recoil',

  /* ---------- 通用 / 按钮 ---------- */
  '关闭': 'OFF',
  '完成': 'Done',
  '返回': 'Back',
  '取消': 'Cancel',
  '确定': 'OK',
  '是': 'Yes',
  '否': 'No',
  '开': 'ON',
  '关': 'OFF',
  '上': 'Up',
  '下': 'Down',
  '左': 'Left',
  '右': 'Right',
  '收起': 'Collapse',
  '收起 ▾': 'Collapse ▾',
  '展开 ▸': 'Expand ▸',
  '继续': 'Continue',
  '重试': 'Retry',
  '已保存': 'Saved',
  '已复制': 'Copied',
  '复制': 'Copy',
  '删除': 'Delete',
  '清空': 'Clear',
  '设置': 'Settings',
  '语言': 'Language',

  /* ---------- 主菜单 / 通用界面 ---------- */
  '主菜单': 'Main Menu',
  '回主菜单': 'Back to Menu',
  '再次挑战': 'Play Again',
  '再来一次': 'Play Again',
  '开始游戏': 'Start Game',
  '开始': 'Start',
  '暂停': 'Pause',
  '继续游戏': 'Resume',
  '重新开始': 'Restart',
  '玩法说明': 'How to Play',
  '操作说明': 'Controls',
  '设置': 'Settings',
  '排行榜': 'Leaderboard',
  '成就': 'Achievements',
  '成就页': 'Achievements',
  '昵称': 'Nickname',
  '改昵称': 'Change Name',
  '导出': 'Export',
  '导入': 'Import',
  '主题': 'Theme',
  '风格': 'Style',
  '颜色': 'Color',
  '恢复默认': 'Reset to Default',
  '原版': 'Classic',
  '深蓝暗色': 'Deep Blue Dark',
  '终端': 'Terminal',
  '磷光绿屏': 'Phosphor Green',

  /* ---------- 难度 / 模式 ---------- */
  '简单': 'Easy',
  '普通': 'Normal',
  '困难': 'Hard',
  '地狱': 'Hell',
  '选择难度': 'Select Difficulty',
  '难度': 'Difficulty',
  '回 合 制': 'TURN-BASED',
  '摇杆 + 全地图': 'Joystick + Full Map',
  '按一下走一格': 'One tile per tap',
  '连续移动 · 全图可见': 'Free movement · whole map visible',

  /* ---------- 语言 ---------- */
  'English': 'English',
  '切换语言': 'Switch Language',

  /* ---------- HUD 通用 ---------- */
  '生命': 'Health',
  '血量': 'HP',
  '护甲': 'Armor',
  '耐久': 'Durability',
  '货币': 'Currency',
  '金币': 'Coins',
  '当前货币': 'Money',
  '弹药': 'Ammo',
  '备用弹药': 'Reserve',
  '背包': 'Backpack',
  '仓库': 'Stash',
  '商店': 'Shop',
  '物品栏': 'Inventory',
  '装备': 'Equipment',
  '物品': 'Items',
  '地图': 'Map',
  '楼层': 'Floor',
  '回合': 'Turn',
  '经典': 'Classic',
  /* ---------- 2D GM 面板 ---------- */
  '已开': 'ON',
  '关闭': 'OFF',
  '已给': 'Given',
  '给予': 'Give',
  '已拥有': 'Owned',
  '功能': 'Features',
  '快速加入地图': 'Quick-join map',
  '一键跳楼层': 'Jump to floor',
  'DevTest · 成就': 'DevTest · Achievements',
  '数据清理（都要确认两次）': 'Data cleanup (double confirm)',
  '道具（逐个开关）': 'Items (toggle each)',
  '穿墙': 'No Clip',
  '无视墙壁，直接走过去': 'Walk straight through walls',
  '无视伤害': 'Invincible',
  '老师 / 保安 / 监控都抓不到你': 'No teacher / guard / camera can catch you',
  '加速移动': 'Speed Boost',
  '移动速度 ×2（可乐可叠加）': 'Movement ×2 (stacks with Cola)',
  '全局手电': 'Global Flashlight',
  '所有地下层都亮，随时可用': 'Every underground level is lit, usable anytime',
  '一键拉闸': 'Pull All Breakers',
  '三个电闸一次全部拉下、打开电子门': 'Pull all three breakers at once and power the electronic door',
  '全部拉闸': 'Pull All',
  '终端主题开局': 'Start · Terminal theme',
  'Material 开局': 'Start · Material',
  '原版开局': 'Start · Classic',
  '一键全成就': 'Unlock All Achievements',
  '立即解锁全部成就（含炫彩），次数记 1': 'Unlock every achievement (including rainbow), counted once',
  '全部解锁': 'Unlock All',
  '清除存档数据': 'Wipe Save Data',
  '昵称、GM 标记、结局解锁等 cookie 全清': 'Clears the nickname, GM flag, ending unlocks and all cookies',
  '清除数据': 'Wipe Data',
  '清除成就': 'Wipe Achievements',
  '成就解锁状态与累计次数全部归零': 'Reset unlock state and total counts to zero',
  '清除排行榜': 'Wipe Leaderboard',
  '本机排行榜记录全部删除': 'Delete every leaderboard record on this device',
  '清除排行': 'Wipe Board',
  '⚠ 开启作弊会关闭排行榜：成绩和成就都不记录。': '⚠ Cheats disable the leaderboard: scores and achievements are not recorded.',
  '本页面只能触发一次，刷新后需重新连点标题。': 'This can only be triggered once per page — refresh and tap the title again.',
  '再点一次': 'Tap',
  '确认': 'again to confirm',
  'GM 菜单': 'GM Menu',
  /* ---------- 2D 成就表 + 成就面板 ---------- */
  '逃出去了': 'Escaped',
  '任意难度通关一次': 'Clear the game on any difficulty',
  '硬骨头': 'Hard Nut',
  '在困难难度通关': 'Clear the game on Hard',
  '地狱归来': 'Back from Hell',
  '在地狱难度通关': 'Clear the game on Hell',
  '砸车的人': 'Car Wrecker',
  '砸烂校长的车': 'Wreck the principal car',
  '地狱砸车': 'Hell Car Wrecker',
  '在地狱难度砸烂校长的车': 'Wreck the principal car on Hell',
  '隐身人': 'Ghost',
  '一次都没有被发现就通关': 'Clear the game without ever being spotted',
  '闪电逃学': 'Lightning Skip',
  '3 分钟内通关': 'Clear the game within 3 minutes',
  '以小博大': 'David and Goliath',
  '用小刀解决过一个敌人后通关': 'Take out an enemy with the knife and still clear the game',
  '命大': 'Nine Lives',
  '被抓住一次之后仍然通关': 'Get caught once and still clear the game',
  '保安之友': 'Security Friend',
  '关掉全楼监控并通关': 'Cut the building cameras and clear the game',
  '开锁匠': 'Locksmith',
  '通关时同时拿到了工作牌和黑钥匙': 'Have both the staff badge and the black key when you clear the game',
  '打通了原作者的专线': 'Called the Original Dev Hotline',
  '用 7777777 在地下室拨通那通神秘电话（地狱限定）': 'Dial the mystery number 7777777 in the basement (Hell only)',
  '金': 'Gold',
  '红': 'Red',
  '蓝': 'Blue',
  '炫彩': 'Rainbow',
  '？？？': '???',
  '尚未解锁': 'Not unlocked yet',
  '（地狱不给）': '(not granted on Hell)',
  '已解锁': 'Unlocked',
  '累计达成': 'Total earned',
  '次': 'times',
  '（用 GM 的那一局不给成就）': '(the run where you used GM does not count)',

  /* ---------- 2D 小卖部面板 ---------- */
  '打一针：监控看不见你，被发现所需的 3 秒延长到 5 秒': 'Inject: cameras cannot see you, and the 3s detection time becomes 5s',
  '能打开一层的侧门（结局三）': 'Opens the side door on floor 1 (Ending 3)',
  '喝下去：移动速度提升 45%': 'Drink: +45% movement speed',
  '可以雕刻，也能按 E 捅人（25% 概率解决一名敌人）': 'Can carve, and press E to stab (25% chance to take out an enemy)',
  '手电筒：在任意地下室点亮（三层/四层/地下室），整局只能用一次': 'Flashlight: light it up in any underground level (floor 3 / floor 4 / basement), once per raid',
  '本局已经选过了': 'already picked this run',
  '你选的是': 'You picked',
  '道具': 'item',
  '每局只能从小卖部带走一样东西。': 'You may take only one thing from the shop per raid.',
  '已拥有': 'Owned',
  '免 费': 'FREE',

  /* ---------- 2D toast 提示文案（统一在 toast() 出口翻译） ----------
     这些原本直接写中文塞进 textContent，切英文后全是中文。
     现在 toast() 里统一过一道 T()，这里补全译义。
     注：部分文案后面还拼了变量（如「拉下」+n+「个」），
     所以少数译文值故意带尾空格，不要删。 */
  '🏆 成就解锁：': '🏆 Achievement unlocked: ',
  '老师看到你在教室，自己回办公室去了': 'A teacher saw you in the classroom and went back to the office',
  '被': 'by ',
  '来到 ': 'Arrived at ',
  'DevTest 已改为终端指令：请在「终端」风格下按右侧 Shift 打开终端': 'DevTest now uses terminal commands: in the Terminal style, press Right Shift to open the terminal',
  '已加入地图：': 'Added to map: ',
  'DevTest 终端仅在「终端」风格下可用': 'The DevTest terminal only works in the Terminal style',
  'DevTest：GM 菜单已加入「一键全成就」': 'DevTest: added "Unlock All Achievements" to the GM menu',
  'DevTest：已移除「一键全成就」': 'DevTest: removed "Unlock All Achievements"',
  'DevTest 指令不对：BypassGMMenu / OpenTheGMMenu / OpenGMMenuAddAchievement': 'Unknown DevTest command: BypassGMMenu / OpenTheGMMenu / OpenGMMenuAddAchievement',
  'DevTest：GM 菜单已打开': 'DevTest: GM menu opened',
  'DevTest：GM 菜单已关闭': 'DevTest: GM menu closed',
  '已导出 scores.json': 'Exported scores.json',
  '导出失败：': 'Export failed: ',
  '本页面已经触发过作弊了，刷新后再试': 'Cheats were already triggered on this page — refresh and try again',
  '⚠ 再点一次「': '⚠ Tap ',
  'DevTest：已解锁全部成就（': 'DevTest: unlocked all achievements (',
  '已清除全部本地数据': 'All local data cleared',
  '成就已清空': 'Achievements cleared',
  '排行榜已清空': 'Leaderboard cleared',
  '已传送到 ': 'Teleported to ',
  '号码不对…': 'Wrong code…',
  '拿到隐身针：点物品栏使用（要 3 秒，期间别动）': 'Got the invisibility syringe: use it from the item bar (takes 3s, do not move meanwhile)',
  '拿到可乐：点物品栏喝（要 3 秒，期间别动）': 'Got Cola: drink it from the item bar (takes 3s, do not move meanwhile)',
  '拿到黄色钥匙：可以去开一层的侧门了': 'Got the yellow key: you can now unlock the side door on floor 1',
  '拿到小刀：合成黑钥匙要用，也能按 E 捅人（25% 概率）': 'Got the knife: needed to craft the black key, and press E to stab (25% chance)',
  '拿到手电筒：在地下室点物品栏点亮，整局只能用一次': 'Got the flashlight: use it from the item bar underground, works once per raid',
  '正在用 ': 'Using ',
  '没有可乐': 'No Cola',
  '正在喝可乐…3 秒内不能移动': 'Drinking Cola… you cannot move for 3 seconds',
  '没有隐身针': 'No invisibility syringe',
  '正在打隐身针…3 秒内不能移动': 'Injecting… you cannot move for 3 seconds',
  '没有手电筒': 'No flashlight',
  '手电筒已经用过了，没电了': 'The flashlight is already used up — no battery left',
  '手电筒要在地下室用：三层、四层或地下室': 'The flashlight only works underground: floor 3, floor 4 or the basement',
  '手电筒照亮了整层 ': 'The flashlight lit up the whole floor ',
  '喝完了：10 秒内跑得更快': 'Down the hatch: you run faster for 10 seconds',
  '隐身针生效：30 秒内监控看不见你，被发现要 5 秒': 'Invisible: cameras cannot see you for 30s, and detection takes 5s',
  '可乐效果结束了': 'Cola effect ended',
  '隐身针效果结束了': 'Invisibility ended',
  '附近没有人可以捅': 'No one nearby to stab',
  '一刀解决掉了': 'One hit — taken down',
  '没捅中！': 'Missed the stab!',
  '黑钥匙制作完成！': 'Black key crafted!',
  '锯倒了校长的树，获得木头': 'Sawed down the principal tree and got wood',
  '拉下': 'Pulled down ',
  '刷工作牌，校长办公室的门开了': 'Badge tapped — the principal office is open',
  '校长办公室是权限锁，需要老师的工作牌': 'The principal office is access-locked — you need a staff badge',
  '打不开，需要 ': 'Cannot open — you need ',
  '砰！车被砸烂了，响声把附近的老师引了过来': 'Bang! The car is wrecked and the noise drew teachers nearby',
  '电子门没电：三个电闸只关了 ': 'The electronic door has no power: only ',
  '电子门通电打开了，但后面那堵墙还挡着路': 'The electronic door powered open, but the wall behind still blocks the way',
  '砖墙后面是活断路器，先打开电子门通上电': 'There is a live breaker behind the brick wall — power the electronic door first',
  '需要锤子才能砸开砖墙': 'You need a hammer to break the brick wall',
  '配置文件已导出': 'Config file exported',
  '此浏览器不支持下载，已复制到文本框': 'This browser does not support downloads — copied to the text box',
  '请先粘贴配置 JSON': 'Paste the config JSON first',
  '配置解析失败：不是合法 JSON': 'Config parse failed: not valid JSON',
  '配置已导入并启用': 'Config imported and applied',
  '读取文件失败': 'Failed to read the file',
  '已套用预设：': 'Preset applied: ',
  '颜色格式不对，用 #RRGGBB': 'Wrong colour format — use #RRGGBB',

  '🏆 成就': '🏆 Achievements',
  '被 抓': 'Caught',
  '被抓': 'Caught',
  '电闸': 'Breaker',
  '被发现': 'Spotted',
  '撤离': 'Extract',
  '撤离点': 'Extraction Point',
  '击杀数': 'Kills',
  '撤离次数': 'Extractions',

  /* ---------- 动作 ---------- */
  '行动': 'Action',
  '跳过': 'Skip',
  '移动': 'Move',
  '跳跃': 'Jump',
  '奔跑': 'Sprint',
  '趴下': 'Prone',
  '站起': 'Stand',
  '瞄准': 'Aim',
  '射击': 'Fire',
  '换弹': 'Reload',
  '开镜': 'Scope',
  '开门': 'Open Door',
  '关门': 'Close Door',
  '拾取': 'Pick Up',
  '互动': 'Interact',
  '搜刮': 'Loot',
  '使用': 'Use',
  '装填': 'Load',
  '卸下': 'Unequip',
  '装备上': 'Equip',
  '购买': 'Buy',
  '卖出': 'Sell',
  '转视角': 'Look',
  '视角': 'Camera',
  '鼠标': 'Mouse',
  '左键': 'Left Click',
  '右键': 'Right Click',
  '空格': 'Space',
  '交谈': 'Talk',
  '休息': 'Rest',
  '制作': 'Craft',
  '制作台': 'Crafting Bench',
  '小卖部': 'Tuck Shop',

  /* ---------- 游戏状态 ---------- */
  '胜利': 'Victory',
  '失败': 'Defeat',
  '成功逃脱': 'Escaped',
  '你被抓住了': 'You were caught',
  '游戏结束': 'Game Over',
  '正在加载': 'Loading',
  '加载中': 'Loading',
  '准备中': 'Preparing',
  '进度': 'Progress',

  /* ---------- 3D 版：武器槽 ---------- */
  '主武器': 'Primary',
  '副武器': 'Sidearm',
  '手枪': 'Pistol',
  '步枪': 'Rifle',
  '刀': 'Knife',
  '近战': 'Melee',
  '胸挂': 'Chest Rig',
  '头盔': 'Helmet',
  '防弹衣': 'Body Armor',
  '切枪': 'Weapon Swap',

  /* ---------- 3D 版：商店物品 ---------- */
  '医疗包': 'Medkit',
  '急救包': 'First Aid Kit',
  '绷带': 'Bandage',
  '止痛药': 'Painkiller',
  '手雷': 'Grenade',
  '烟雾弹': 'Smoke Grenade',
  '闪光弹': 'Flashbang',
  '开锁器': 'Lockpick',
  '手枪弹': '9mm Rounds',
  '步枪弹': '5.56 Rounds',
  '狙击弹': '7.62 Rounds',
  '霰弹': '12G Shells',
  '战术腰包': 'Tactical Pouch',
  '小型背包': 'Small Backpack',
  '中型背包': 'Medium Backpack',
  '大型背包': 'Large Backpack',
  '防弹背心': 'Ballistic Vest',
  '战术头盔': 'Tactical Helmet',
  '战术小刀': 'Tactical Knife',
  '哨兵手枪': 'Sentry Pistol',
  '突击步枪': 'Assault Rifle',

  /* ---------- 3D 版：商店描述 ---------- */
  '恢复 40 生命': 'Restores 40 HP',
  '恢复 100 生命（满血）': 'Restores 100 HP (full)',
  '恢复 15 生命，便宜量大': 'Restores 15 HP, cheap in bulk',
  '恢复 25 生命并短暂加速': 'Restores 25 HP, brief speed boost',
  '投掷爆炸，范围伤害': 'Thrown explosive, area damage',
  '制造烟幕遮挡视线': 'Creates smoke screen to block vision',
  '致盲附近敌人': 'Blinds nearby enemies',
  '打开上锁的箱子': 'Opens locked crates',
  '容量 12 格': '12 slots',
  '容量 24 格': '24 slots',
  '容量 36 格': '36 slots',
  '容量 48 格': '48 slots',

  /* ---------- 提示 / Toast ---------- */
  '已装备': 'Equipped',
  '已卸下': 'Unequipped',
  '已购买': 'Purchased',
  '货币不足': 'Not enough money',
  '背包已满': 'Backpack is full',
  '距离太远': 'Too far away',
  '需要钥匙': 'Requires a key',
  '门已锁': 'Door is locked',
  '无法使用': 'Cannot use',
  '使用成功': 'Success',
  '生命已满': 'HP is full',
  '无法奔跑': 'Cannot sprint',
  '弹药不足': 'Out of ammo',
  '换弹中': 'Reloading',
  '没有武器': 'No weapon',
  '已切到': 'Switched to',
  '空槽位': 'Empty slot',
  '局内不能换装': 'Cannot change gear in a match',

  /* ---------- 3D 版：主菜单 ---------- */
  '搜打撤': 'Loot · Shoot · Extract',
  '学校 3D': 'School 3D',
  '搜刮物资 → 击杀敌人 → 撤离点撤离。货币可在商店购买装备。数据加密导出，防篡改。':
    'Loot supplies → kill enemies → reach the extraction point. Spend money in the shop. Exports are encrypted to prevent tampering.',
  '▶ 开始（进入游戏）': '▶ Start (Enter Game)',
  '🛒 商店': '🛒 Shop',
  '🏠 仓库': '🏠 Stash',
  '⬇️ 加密导出': '⬇️ Encrypted Export',
  '⬆️ 加密导入': '⬆️ Encrypted Import',
  '♻️ 重置数据': '♻️ Reset Data',
  '← 返回原版': '← Back to Original',
  '💀 你阵亡了': '💀 You Died',
  '重新部署': 'Redeploy',
  '确认重置所有数据？': 'Reset all data?',

  /* ---------- 3D 版：屏幕提示条 ---------- */
  '📱 右半屏拖动转视角 · 左摇杆移动 · 右下按钮作战':
    '📱 Drag right half to look · left stick to move · bottom-right buttons to fight',
  '📱 右半屏拖动转视角 · 左摇杆移动 · 射击/跳/换弹/拾取在右下 · 靠近门按 E 开门':
    '📱 Drag right half to look · left stick to move · fire/jump/reload/loot at bottom right · press E near a door',
  '📱 手机：左半屏拖动移动 · 右半屏拖动转视角 · 右下按钮射击':
    '📱 Mobile: drag left half to move · drag right half to look · bottom-right button to fire',
  '🎮 摇杆已激活 · 拖动移动': '🎮 Joystick active · drag to move',
  '🔭 开镜中 · 再点一次退出': '🔭 Scoped · tap again to exit',
  '⌨️ 操作说明': '⌨️ Controls',

  /* ---------- 2D 版：主菜单 ---------- */
  '逃离学校 · HTML版': 'Escape From the School · HTML Edition',
  '五种结局 · 被抓两次就失败': 'Five endings · caught twice and you fail',
  '一层': 'Floor 1',
  '二层': 'Floor 2',
  '三层': 'Floor 3',
  '四层': 'Floor 4',
  '地下室': 'Basement',
  '五条逃走路线': 'Five escape routes',
  '隐藏结局': 'Hidden Ending',
  '结局': 'Ending',
  '排行榜': 'Leaderboard',
  '🏆 排行榜': '🏆 Leaderboard',
  '🎖 成就': '🎖 Achievements',
  '✏️ 改昵称': '✏️ Change Name',
  '⬇️ 导出': '⬇️ Export',
  '🎨 主题': '🎨 Theme',
  '重置数据': 'Reset Data',
  '确认重置？': 'Reset?',

  /* ---------- 3D 版：商店分类 ---------- */
  '医药': 'Medical',
  '道具': 'Gadgets',
  '子弹': 'Ammo',
  '冲锋枪': 'SMG',
  '狙击步枪': 'Sniper Rifle',
  '制式手枪': 'Standard Pistol',
  '大口径手枪': 'Heavy Pistol',
  '防弹头盔': 'Ballistic Helmet',
  '重型头盔': 'Heavy Helmet',
  '轻型护甲': 'Light Armor',
  '标准护甲': 'Standard Armor',
  '重型护甲': 'Heavy Armor',
  '防暴棍': 'Riot Baton',
  '简易胸挂': 'Light Chest Rig',
  '重型胸挂': 'Heavy Chest Rig',
  '进入游戏': 'Enter Game',
  '加密导出': 'Encrypted Export',
  '加密导入': 'Encrypted Import',
  '返回原版': 'Back to Original',
  '拾取/互动': 'Loot / Interact',

  /* ---------- 3D 版：商店描述（详细） ---------- */
  '9mm · 50 发': '9mm · 50 rounds',
  '5.56 · 60 发': '5.56 · 60 rounds',
  '7.62 · 20 发': '7.62 · 20 rounds',
  '12G · 24 发': '12G · 24 shells',
  '减伤 10% · 耐久 60': '-10% damage · 60 durability',
  '减伤 20% · 耐久 120': '-20% damage · 120 durability',
  '减伤 32% · 耐久 220': '-32% damage · 220 durability',
  '减伤 15% · 耐久 80': '-15% damage · 80 durability',
  '减伤 25% · 耐久 150': '-25% damage · 150 durability',
  '减伤 40% · 耐久 260': '-40% damage · 260 durability',
  '全自动 · 高伤害': 'Full auto · high damage',
  '射速快 · 后坐力小': 'Fast fire rate · low recoil',
  '单发 · 极高伤害': 'Single shot · extreme damage',
  '栓动 · 极高伤害 · 开镜倍率高': 'Bolt action · extreme damage · high ADS zoom',
  '半自动 · 高精度 · 中远距': 'Semi-auto · high accuracy · mid-to-long range',
  '泵动 · 9 颗弹丸 · 近距一枪致命': 'Pump action · 9 pellets · one-shot kill up close',
  '半自动 · 应急副武器': 'Semi-auto · emergency sidearm',
  '半自动 · 高伤副武器': 'Semi-auto · high-damage sidearm',
  '精确射手步枪': 'Marksman Rifle',
  '雷明顿 M870': 'Remington M870',
  '全自动': 'AUTO',
  '半自动': 'SEMI',
  '栓动': 'BOLT',
  '泵动': 'PUMP',
  '近战': 'MELEE',
  '应急副武器': 'Emergency sidearm',
  '高伤副武器': 'High-damage sidearm',
  '近战 · 永不耗弹': 'Melee · never uses ammo',
  '近战 · 攻击范围大': 'Melee · longer reach',
  '额外 2 个弹匣位': '+2 magazine slots',
  '额外 4 个弹匣位': '+4 magazine slots',
  '额外 6 个弹匣位': '+6 magazine slots',

  /* ---------- 3D 版：横屏遮罩 ---------- */
  '请横屏游玩': 'Please Rotate Your Device',
  '3D 第一人称需要横屏。把设备转过来，或者点下面的按钮。':
    '3D first-person needs landscape. Rotate your device, or tap the button below.',
  '进入横屏': 'Go Landscape',


  /* ============================================================
     2D 版：房间 / 地点名
     ============================================================ */
  '教室': 'Classroom',
  '老师办公室': "Teacher's Office",
  '厕所': 'Restroom',
  '电闸室': 'Breaker Room',
  '体育馆前厅': 'Gym Lobby',
  '器材室': 'Equipment Room',
  '走廊': 'Hallway',
  '大门厅': 'Main Lobby',
  '楼梯间': 'Stairwell',
  '空教室': 'Empty Classroom',
  '图书角': 'Reading Corner',
  '体育馆': 'Gymnasium',
  '器材间': 'Equipment Closet',
  '二层电闸': '2F Breaker',
  '大门': 'Main Gate',
  '下楼': 'Go Downstairs',
  '小卖部': 'Tuck Shop',
  '校长办公室': "Principal's Office",
  '侧门区': 'Side Door Area',
  '门厅': 'Foyer',
  '杂物间': 'Storage Room',
  '校长办公室门（权限锁）': "Principal's Office Door (Access Locked)",
  '侧门': 'Side Door',
  '上楼': 'Go Upstairs',
  '下地下车库': 'Go to Garage',
  '保安室': 'Security Room',
  '车库': 'Garage',
  '电子门通道': 'Electronic Door Passage',
  '墙后通道': 'Passage Behind the Wall',
  '上一层': 'Go Up One Floor',
  '下四层': 'Go to Floor 4',
  '监控总闸': 'CCTV Master Breaker',
  '三层电闸': '3F Breaker',
  '校长的车': "Principal's Car",
  '电子门': 'Electronic Door',
  '电子门后的砖墙': 'Brick Wall Behind the Electronic Door',
  '工具房': 'Tool Room',
  '主任办公室': "Dean's Office",
  '制作室': 'Crafting Room',
  '地下室门厅': 'Basement Lobby',
  '库房': 'Stockroom',
  '上三层': 'Go to Floor 3',
  '四层电闸': '4F Breaker',
  '地下室门': 'Basement Door',
  '回四层': 'Back to Floor 4',
  '通往学校外面的楼梯': 'Stairs Leading Outside',

  /* ============================================================
     2D 版：道具
     ============================================================ */
  '老师工作牌': "Teacher's Badge",
  '红钥匙': 'Red Key',
  '黄色钥匙': 'Yellow Key',
  '锯子': 'Saw',
  '锤子': 'Hammer',
  '木头': 'Wood',
  '小刀': 'Knife',
  '黑钥匙制作图': 'Black Key Blueprint',
  '黑钥匙': 'Black Key',
  '隐身针': 'Invisibility syringe',
  '可乐': 'Cola',
  '手电筒': 'Flashlight',

  /* ============================================================
     2D 版：结局标题
     ============================================================ */
  '结局一 · 被抓住了': 'Ending 1 · Caught',
  '结局二 · 大门逃脱': 'Ending 2 · Main Gate Escape',
  '结局三 · 侧门逃脱': 'Ending 3 · Side Door Escape',
  '结局四 · 地下车库逃脱': 'Ending 4 · Garage Escape',
  '结局五 · 地下室逃脱': 'Ending 5 · Basement Escape',
  '结局六 · 打电话给原作者': 'Ending 6 · Call the Original Author',
  '隐藏结局': 'Hidden Ending',
  '隐藏结局 · 仅地狱模式可触发': 'Hidden Ending · Hell mode only',

  /* ============================================================
     2D 版：常用提示 / 交互
     ============================================================ */
  '按 E 打开小卖部': 'Press E to open the tuck shop',
  '按 E 使用制作台': 'Press E to use the crafting bench',
  '按 E 拉闸': 'Press E to pull the breaker',
  '按 E 拉下监控总闸（全楼监控停摆）': 'Press E to cut the CCTV master breaker (all cameras go dark)',
  '按 E 用锤子砸校长的车': "Press E to smash the principal's car with a hammer",
  '按 E 锯树（需要锯子）': 'Press E to saw the tree (requires a saw)',
  '按 E 尝试打开': 'Press E to try opening',
  '按 E 拾取 ': 'Press E to pick up ',
  '按 E 用小刀捅他（25% 概率）': 'Press E to stab them with a knife (25% chance)',
  '走近这里就能逃出去': 'Get close to escape',
  '这是监控，别在它视野里停留': "That's a camera — do not linger in its sight",
  '任务：找一条路逃出学校': 'Objective: find a way out of the school',
  'WASD / 方向键移动，别被老师看见': 'WASD / Arrow keys to move — stay out of sight',
  'WASD / 方向键移动': 'WASD / Arrow keys to move',
  '只有在教室或厕所才能跳过回合': 'You can only skip a turn in a classroom or restroom',
  '跳过一回合，老师 / 保安移动了': 'Turn skipped — teachers and guards moved',
  '无名同学': 'Nameless Student',
  '无名': 'Anonymous',
  '老师': 'Teacher',
  '班主任': 'Homeroom Teacher',
  '保安': 'Security Guard',
  '监控': 'Camera',
  '排行榜（本机记录）': 'Leaderboard (local records)',
  '还没有记录，通关一次就会出现在这里。': 'No records yet — finish a run and it will show up here.',
  '成绩只存在这台设备的 cookie 里，不上传服务器。': "Scores are stored only in the local cookie of this device, never uploaded.",
  '输入你的昵称（存在本机 cookie）': 'Enter your nickname (stored in local cookie)',
  '昵称已保存：': 'Nickname saved: ',
  '成就解锁': 'Achievement Unlocked',
  '成就再次达成': 'Achievement Reached Again',
  '尚未解锁': 'Locked',
  '已解锁': 'Unlocked',
  '累计达成': 'Total reached',
  '自定义': 'Custom',
  '继续': 'Continue',
  '制作': 'Craft',
  '已拥有': 'Owned',
  '免 费': 'FREE',
  '小卖部 · 每局只能选一个': 'Tuck Shop · pick only one per run',
  '小卖部 · 全部免费，但每局只能选一个': 'Tuck Shop · all free, but only one per run',
  '这里没有可以互动的东西': 'Nothing to interact with here',
  '已经拿过了': 'Already taken',
  '获得 ': 'Obtained ',
  '收回：': 'Taken back: ',
  '给予：': 'Given: ',
  '已开': 'ON',
  '关闭': 'Close',
  '需要钥匙': 'A key is required',
  '需要黑钥匙': 'Requires the Black Key',
  '需要小刀': 'Requires a knife',
  '需要锯子才能锯树（工具房里有）': 'You need a saw to cut the tree (one is in the tool room)',
  '需要锤子才能砸车': 'You need a hammer to smash the car',
  '这棵树已经被锯过了': 'This tree has already been cut',
  '这个电闸已经拉下了': 'This breaker is already down',
  '车已经砸烂了': 'The car is already wrecked',
  '监控已经关掉了': 'CCTV is already off',
  '电子门已经打开了': 'The electronic door is already open',
  '砖墙已经砸开了': 'The brick wall is already broken',
  '地下室门锁着，需要黑钥匙': 'The basement door is locked — you need the Black Key',
  '地下室门开了，下去吧': 'The basement door is open — head down',
  '权限锁': 'Access Locked',
  '练习': 'Practice',
  '普通': 'Normal',
  '困难': 'Hard',
  '地狱': 'Hell',
  '地狱难度：所有常规出口都被封死了，只能走电子门或地下室':
    'Hell mode: all normal exits are sealed — you must use the electronic door or the basement',
  '三个电闸已全部拉下，电子门通了': 'All three breakers are down — the electronic door has power',
  '拉下监控总闸：全楼的监控都黑了': 'CCTV master breaker pulled — every camera is dark',
  /* ---------- 3D 版：近战武器（刀型）+ 武器皮肤 + 检视 ---------- */
  '爪刀': 'Karambit',
  '弯刃 · 出手极快 · 近身利器': 'Curved blade · blazing fast · close-quarters tool',
  '太刀': 'Katana',
  '细长刀身 · 挥砍范围最大': 'Long blade · widest swing reach',
  '战术斧': 'Tactical Axe',
  '沉重· 一击必杀，但挥得慢': 'Heavy · one-shot kill, but slow swing',
  '原厂涂装': 'Factory Finish',
  '默认外观，不花一分钱': 'Default look, costs nothing',
  '霓虹夜光': 'Neon Glow',
  '青蓝发光 · 环绕光带': 'Cyan glow · orbiting light rings',
  '赤血红': 'Crimson Blood',
  '血红发光 · 杀气十足': 'Blood-red glow · pure menace',
  '毒液幽绿': 'Toxic Venom',
  '幽绿毒光 · 环绕光带': 'Toxic green glow · orbiting light rings',
  '虚空紫': 'Void Purple',
  '暗紫辐射 · 最强发光': 'Dark purple radiation · strongest glow',
  '黄金': 'Gold',
  '土豪金 · 无光但最闪': 'Rich gold · no glow, maximum shine',
  '武器皮肤': 'Weapon Skins',
  '检视': 'Inspect',
  '检视武器': 'Inspect Weapon',
  '检视武器 (F)': 'Inspect Weapon (F)',
  '先买一把枪再买皮肤': 'Buy a gun first before buying a skin',
  /* ---------- 3D 版：GM 隐藏面板 ---------- */
  '当前资金': 'Balance',
  '设定资金（当前 {0}）': 'Set balance (current {0})',
  '直接设定金额': 'Set exact amount',
  'GM 面板已解锁': 'GM panel unlocked',
  /* ============================================================
     3D 版：本轮新增（撤离倒计时 / 小地图 / 超时结算）
     背景：这些 UI 是上一轮新加的，文案直接写死在代码里，
     切到英文时依然显示中文。这里补齐。
     ============================================================ */
  /* ---- 撤离倒计时 ---- */
  '撤离超时': 'Raid Timed Out',
  '⏰ 撤离超时': '⏰ Raid Timed Out',
  '你没在规定时间内到达撤离点 · 带进去的物资全部丢失':
    'You did not reach the extraction point in time · everything you brought in is lost',
  '⏰ 撤离超时 · 物资丢失': '⏰ Raid timed out · supplies lost',
  /* ---- 小地图区域名 ---- */
  '校园': 'Campus',
  '主楼': 'Main Building',
  '西楼': 'West Building',
  '东楼': 'East Building',
  '行政楼': 'Admin Building',
  '校门口': 'School Gate',
  '操场': 'Sports Field',
  '北场地': 'North Field',
  /* ---- 设置面板：外观 / 512 色 / 声音 / 调试日志 ---- */
  '外观': 'Appearance',
  '主题色': 'Accent color',
  '声音': 'Sound',
  '调试': 'Debug',
  '暗夜（原版）': 'Night (original)',
  'Material You': 'Material You',
  '盐线暗调 · 对比强': 'Saltline dark · strong contrast',
  '深色表面 · 大圆角 · 由种子色派生整套配色':
    'Dark surfaces · large radii · full palette derived from one seed color',
  '选择界面主题。Material You 与 2D 版一致：深色表面、大圆角，配色由种子色派生。':
    'Pick an interface theme. Material You matches the 2D build: dark surfaces, large radii, palette derived from a seed color.',
  '主色共 512 档：8 个色系 × 64 个深浅。点一格立即生效。':
    '512 accent shades: 8 families × 64 steps. Tap one to apply instantly.',
  '紫': 'Purple',
  '蓝': 'Blue',
  '青': 'Cyan',
  '绿': 'Green',
  '琥珀': 'Amber',
  '橙': 'Orange',
  '红': 'Red',
  '粉': 'Pink',
  '全局音量': 'Master volume',
  '对所有音效整体缩放，不影响各音效的相对响度':
    'Scales all sound effects together without changing their relative loudness',
  '音效开关': 'Sound effects',
  '完全静音，倍率保留': 'Mute everything, keep the volume level',
  '调试日志': 'Debug log',
  '记录警告与错误，方便排查问题': 'Records warnings and errors to help diagnose problems',
  '（暂无日志）': '(no log entries yet)',
  '刷新': 'Refresh',
  '复制全部': 'Copy all',
  '共 {0} 条 · 最多保留 300 条': '{0} entries · keeps the latest 300',
  '日志已复制': 'Log copied',
  '复制失败，请手动选择': 'Copy failed, please select manually',
  '复制失败': 'Copy failed',
  '调试日志已开启': 'Debug log enabled',
  /* ---- 设置面板：字体页签（与 2D 版一致的九族三档）---- */
  '字体': 'Font',
  '字体族': 'Font family',
  '字体族与字号均与 2D 版一致。含站酷、马善政楷、龙藏等字体，设备未安装时自动回退到系统字体。':
    'Font families and sizes match the 2D build. Includes ZCOOL, Ma Shan Zheng, Long Cang and others; falls back to the system font when not installed.',
  '当前：{0}': 'Current: {0}',
  '标题字号': 'Title size',
  '正文字号': 'Body size',
  '按钮字号': 'Button size',
  '范围 {0}–{1}px': 'Range {0}–{1}px',
  '恢复默认字体': 'Reset font',
  '系统默认': 'System default',
  '等宽': 'Monospace',
  '衬线': 'Serif',
  '圆体': 'Rounded',
  '手写': 'Handwriting',
  '站酷小薇': 'ZCOOL XiaoWei',
  '马善政楷': 'Ma Shan Zheng',
  '站酷快乐': 'ZCOOL KuaiLe',
  '龙藏体': 'Long Cang',
  /* ---- 设置面板：语言页签 ----
     这里原本挂在主菜单最后一个 .row 上，而那个 .row 就是导入导出行，
     平时 display:none，所以按钮一直被藏着 —— 这就是「语言设置不见了」。 */
  '界面语言。切换后所有界面立即重绘，不需要重开游戏。':
    'Interface language. Every screen is repainted immediately, no restart needed.',
  '简体中文界面': 'Simplified Chinese interface',
  '英文界面': 'English interface',
  '中文': 'Chinese',
  /* ---- 局内暂停 ----
     【语义要点】暂停时倒计时也一起冻结，不是「后台还在走」。
     退出等于放弃本局，物资全丢，所以按钮文案必须写清楚后果。 */
  '已暂停': 'Paused',
  '继续游戏': 'Resume',
  '声音：开': 'Sound: on',
  '声音：关': 'Sound: off',
  '退出（丢失所有）': 'Quit (lose everything)',
  '暂停中 · 剩余 {0}': 'Paused · {0} left',
  '游戏时间与撤离倒计时已冻结': 'Game time and extraction timer are frozen',
  '剩余': 'Left',
  '退出等于放弃本局：身上的装备、背包与胸挂里的物资全部丢失。':
    'Quitting abandons this raid: gear, backpack and chest rig contents are all lost.',
  /* ---- 仓库格子空状态 ---- */
  '空（点击仓库物品放入）': 'Empty (tap a stash item to put it in)',
  '空（局内放入医疗/弹药）': 'Empty (put meds/ammo in during a raid)',
};

/* 把 {0} {1} 换掉。只在 T() 内部用。 */
function i18nFormat(str, args){
  if(!args || !args.length) return str;
  return String(str).replace(/\{(\d+)\}/g, function(m, i){
    const v = args[+i];
    return (v === undefined || v === null) ? m : String(v);
  });
}

/* 核心翻译函数：中文原串 -> 当前语言 */
function T(str, a, b, c){
  if(str == null) return str;
  let out = str;
  if(I18N_LANG === 'en'){
    const hit = I18N_EN[str];
    if(hit !== undefined) out = hit;
  }
  return i18nFormat(out, arguments.length > 1 ? Array.prototype.slice.call(arguments, 1) : null);
}

/* 按当前语言二选一，用于「中文文案 / 英文文案」都需要保留原样的场合 */
function TL(zh, en){ return I18N_LANG === 'en' ? en : zh; }

/* 读取持久化的语言 */
function i18nLoad(){
  let v = null;
  try{ v = localStorage.getItem(I18N_STORE_KEY); }catch(e){ v = null; }
  if(v && I18N_LANGS.indexOf(v) >= 0) I18N_LANG = v;
  else I18N_LANG = 'zh';
  return I18N_LANG;
}

/* 保存语言 */
function i18nSave(){
  try{ localStorage.setItem(I18N_STORE_KEY, I18N_LANG); }catch(e){}
}

/* 应用 <html lang> 与 <html data-lang>，CSS 可据此调字号 */
function i18nApplyDoc(){
  if(typeof document === 'undefined' || !document.documentElement) return;
  const el = document.documentElement;
  el.setAttribute('data-lang', I18N_LANG);
  el.setAttribute('lang', I18N_LANG === 'en' ? 'en' : 'zh-CN');
}

/* 切换语言。返回是否真的变了。
   rebuild 由各版自己传进来（重绘界面），这样 core 不需要知道界面细节。 */
function i18nSetLang(lang, rebuild){
  if(I18N_LANGS.indexOf(lang) < 0) return false;
  if(lang === I18N_LANG) return false;
  I18N_LANG = lang;
  i18nSave();
  i18nApplyDoc();
  if(typeof rebuild === 'function'){ try{ rebuild(); }catch(e){} }
  return true;
}

/* 在两种语言间来回切 */
function i18nToggle(rebuild){
  return i18nSetLang(I18N_LANG === 'zh' ? 'en' : 'zh', rebuild);
}

/* 扫描 DOM 里带 data-i18n 的元素并替换文本。
   属性用法：data-i18n 填中文原串即可；
   也可以填 data-i18n-ph 换 placeholder、data-i18n-title 换 title。 */
function i18nApplyDOM(root){
  if(typeof document === 'undefined') return;
  const scope = root || document;
  const nodes = scope.querySelectorAll ? scope.querySelectorAll('[data-i18n]') : [];
  for(let i = 0; i < nodes.length; i++){
    const n = nodes[i];
    n.textContent = T(n.getAttribute('data-i18n'));
  }
  const phs = scope.querySelectorAll ? scope.querySelectorAll('[data-i18n-ph]') : [];
  for(let i = 0; i < phs.length; i++){
    const n = phs[i];
    n.setAttribute('placeholder', T(n.getAttribute('data-i18n-ph')));
  }
  const tts = scope.querySelectorAll ? scope.querySelectorAll('[data-i18n-title]') : [];
  for(let i = 0; i < tts.length; i++){
    const n = tts[i];
    n.setAttribute('title', T(n.getAttribute('data-i18n-title')));
  }
}

/* 生成一个语言切换按钮并挂到指定容器上。
   两版共用同一套外观，颜色跟各自主题走（用 CSS 变量）。 */
function i18nMountToggle(parent, rebuild, cls){
  if(typeof document === 'undefined' || !parent) return null;
  let btn = document.getElementById('langBtn');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'langBtn';
    btn.className = cls || 'langBtn';
    btn.type = 'button';
    parent.appendChild(btn);
  }
  const paint = function(){
    btn.textContent = I18N_LANG === 'zh' ? '🌐 English' : '🌐 中文';
    btn.setAttribute('title', T('切换语言'));
    btn.setAttribute('aria-label', T('切换语言'));
  };
  paint();
  btn.onclick = function(ev){
    if(ev) ev.stopPropagation();
    i18nToggle(function(){ rebuild && rebuild(); paint(); });
  };
  return btn;
}
