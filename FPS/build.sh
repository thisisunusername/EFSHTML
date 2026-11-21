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
