#!/usr/bin/env bash
# 把 FPS/full/ 里的分块源码拼成 FPS/index.html（ESM 模块版）
# 用法：cd FPS && bash build.sh
set -u

cd "$(dirname "$0")"

OUT=index.html

{
  cat full/a_head.html            # HTML+CSS+importmap+<script type="module">+import * as THREE
  printf '\n'
  cat full/b_world.js;   printf '\n'
  cat full/c_player.js;  printf '\n'
  cat full/d_game.js;    printf '\n'
  cat full/e_io.js;      printf '\n'
  cat full/f_ui.js;      printf '\n'
  # x_ext 提供门/新操场/交互入口，必须在 b_world 之后、z_render 之前
  cat full/x_ext.js;     printf '\n'
  cat full/w_weapon.js;  printf '\n'
  cat full/y_audio.js;   printf '\n'
  cat full/z_render.js
  printf '\n</script>\n'
  printf '</body>\n'
  printf '</html>\n'
} > "$OUT"

# 语法自检（需要 node）
if command -v node >/dev/null 2>&1; then
  L1=$(grep -n '^<script type="module">$' "$OUT" | head -1 | cut -d: -f1)
  L2=$(grep -n '^</script>$' "$OUT" | head -1 | cut -d: -f1)
  if [ -n "$L1" ] && [ -n "$L2" ]; then
    sed -n "$((L1+1)),$((L2-1))p" "$OUT" > /tmp/efs_fps_check.js
    # 剥离顶层 import 行（ESM 专属），剩余代码作为普通脚本做语法检查
    grep -v '^import ' /tmp/efs_fps_check.js > /tmp/efs_fps_check_plain.js
    if node --check /tmp/efs_fps_check_plain.js; then
      echo "OK: $OUT ($(wc -c < "$OUT") bytes) 语法通过"
    else
      echo "语法错误！请检查 full/ 里的分块"
      exit 1
    fi
  else
    echo "OK: $OUT ($(wc -c < "$OUT") bytes)，未找到 module script 标记，跳过语法检查"
  fi
else
  echo "OK: $OUT ($(wc -c < "$OUT") bytes)，未安装 node，跳过语法检查"
fi

# 冒烟测试：用假 THREE 在 Node 里真跑一遍 updP，
# 验证「摇杆四个方向都能让玩家移动，且不抛异常」。
# 以前只做语法检查（node --check），语法通过但运行时抛错的情况完全查不出来，
# 比如「给 const 重新赋值」这类严格模式错误，就藏了好几个版本。
if command -v node >/dev/null 2>&1 && [ -f smoke_test.js ]; then
  SMOKE=$(node smoke_test.js 2>&1)
  echo "$SMOKE" | grep -E '^  ' || true
  if echo "$SMOKE" | grep -q '❌'; then
    echo "冒烟测试失败：玩家无法移动，请检查 updP"
    exit 1
  fi
  if ! echo "$SMOKE" | grep -q '全部方向异常总数 = 0'; then
    echo "冒烟测试失败：updP 运行期抛异常"
    exit 1
  fi
  echo "SMOKE_OK: 摇杆四方向均可移动，updP 无运行期异常"
fi
# 商店/背包测试：验证购买、装备、容量上限、护甲减伤、使用消耗
if command -v node >/dev/null 2>&1 && [ -f shop_test.js ]; then
  SHOP=$(node shop_test.js 2>&1)
  if echo "$SHOP" | grep -q '❌'; then
    echo "商店/背包测试失败："
    echo "$SHOP" | grep '❌'
    exit 1
  fi
  echo "SHOP_BAG_OK: 商店/背包/护甲全部通过"
fi

# 多指触控测试：验证「左手推摇杆 + 右手转视角」按 identifier 严格隔离
if command -v node >/dev/null 2>&1 && [ -f touch_test.js ]; then
  TT=$(node touch_test.js 2>&1)
  if echo "$TT" | grep -q '❌'; then
    echo "多指触控测试失败："
    echo "$TT" | grep '❌'
    exit 1
  fi
  echo "MULTITOUCH_OK: 摇杆与视角按 identifier 严格隔离，互不污染"
fi

# 场景与交互测试：真跑一遍建场 + 门开关
# 防止「门是装饰、墙是实心」这类问题再回来（这曾经导致玩家只能在教学楼外活动）
if command -v node >/dev/null 2>&1 && [ -f scene_test.js ]; then
  SC=$(node scene_test.js 2>&1)
  if echo "$SC" | grep -q 'SCENE_OK'; then
    echo "SCENE_OK: 门可开关、门洞畅通、交互可用、NPC 已精简"
  else
    echo "$SC" | tail -20
    echo "场景测试失败"
    exit 1
  fi
fi

# 仓库布局测试：验证「左装备槽 + 右格子」的数据流
if command -v node >/dev/null 2>&1 && [ -f stash_test.js ]; then
  ST=$(node stash_test.js 2>&1)
  if echo "$ST" | grep -q 'STASH_OK'; then
    echo "STASH_OK: 左侧五个装备槽 + 右侧格子区，装卸/换包/阵亡清空全部正确"
  else
    echo "$ST" | tail -20
    echo "仓库测试失败"
    exit 1
  fi
fi

# 地图体检：排查穿模 / 地面装饰错位 / 出生点与门洞堵死
# 这一项是硬失败：地图有穿模就说明坐标算错了，必须修
if command -v node >/dev/null 2>&1 && [ -f map_test.js ]; then
  MAP=$(node map_test.js 2>&1)
  if echo "$MAP" | grep -q 'MAP_OK'; then
    echo "MAP_OK: 无穿模、无错位、出生点与门洞畅通、敌人物资未卡墙"
  else
    echo "$MAP" | head -30
    echo "地图体检未通过"
    exit 1
  fi
fi

# 趴下与按键布局
if command -v node >/dev/null 2>&1 && [ -f prone_test.js ]; then
  PR=$(node prone_test.js 2>&1)
  if echo "$PR" | grep -q 'PRONE_OK'; then
    echo "PRONE_OK: 趴下/站起/限速/禁跳 与 五个按键布局全部正确"
  else
    echo "$PR" | tail -20
    echo "趴下测试失败"
    exit 1
  fi
fi

# 输入方式自适应 + 键盘映射
if command -v node >/dev/null 2>&1 && [ -f input_test.js ]; then
  IN=$(node input_test.js 2>&1)
  if echo "$IN" | grep -q 'INPUT_OK'; then
    echo "INPUT_OK: 键盘/触摸自动切换触摸按键，WASD/E/左键/右键/Shift/Space/Ctrl+W 全部正确"
  else
    echo "$IN" | tail -25
    echo "输入测试失败"
    exit 1
  fi
fi

# 站立/落地判定（遁地、板子飞天）
if command -v node >/dev/null 2>&1 && [ -f stand_test.js ]; then
  ST=$(node stand_test.js 2>&1)
  if echo "$ST" | grep -q 'STAND_OK'; then
    echo "STAND_OK: 平地/屋顶都能正确站立，不会遁地也不会悬空"
  else
    echo "$ST" | tail -20
    echo "站立测试失败"
    exit 1
  fi
fi

# 武器槽切换
if command -v node >/dev/null 2>&1 && [ -f wpn_test.js ]; then
  WP=$(node wpn_test.js 2>&1)
  if echo "$WP" | grep -q 'WPN_OK'; then
    echo "WPN_OK: 主武器/手枪/副武器 可互切，弹药与伤害各自独立"
  else
    echo "$WP" | tail -20
    echo "武器切换测试失败"
    exit 1
  fi
fi
