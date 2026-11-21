#!/usr/bin/env bash
# 把 full/ 里的分块源码拼成单文件 index.html
# 用法：bash build.sh
set -u

cd "$(dirname "$0")"

OUT=index.html

{
  cat full/a_head.html
  printf '(function(){\n'
# i18n 核心：T() 在 b_world 的 DIFF/ITEM/W 里就被调用，必须最先
  cat i18n/i18n_core.js; printf '\n'
# b_world.js 自带 'use strict';，这里不再重复输出
  cat full/b_world.js;   printf '\n'
  cat full/c_logic.js;   printf '\n'
  cat full/d_actions.js; printf '\n'
  cat full/f_theme.js;   printf '\n'
  # 国际化接入层：要读 startScr/HUD 等节点，放在渲染之后、尾部之前
  cat full/_i18n2d.js;   printf '\n'
  cat full/e_render.js
  printf '</script>\n'
  printf '</body>\n'
  printf '</html>\n'
} > "$OUT"

# 语法自检（需要 node）
if command -v node >/dev/null 2>&1; then
  L1=$(grep -n '^<script>$' "$OUT" | head -1 | cut -d: -f1)
  L2=$(grep -n '^</script>$' "$OUT" | head -1 | cut -d: -f1)
  if [ -n "$L1" ] && [ -n "$L2" ]; then
    sed -n "$((L1+1)),$((L2-1))p" "$OUT" > /tmp/efs_check.js
    if node --check /tmp/efs_check.js; then
      echo "OK: $OUT ($(wc -c < "$OUT") bytes) 语法通过"
    else
      echo "语法错误！请检查 full/ 里的分块"
      exit 1
    fi
  else
    echo "OK: $OUT ($(wc -c < "$OUT") bytes)，未找到 script 标记，跳过语法检查"
  fi
else
  echo "OK: $OUT ($(wc -c < "$OUT") bytes)，未安装 node，跳过语法检查"
fi
# 2D 版中英双语
if command -v node >/dev/null 2>&1 && [ -f i18n_2d_test.js ]; then
  I2=$(node i18n_2d_test.js 2>&1)
  if echo "$I2" | grep -q 'I18N_2D_OK'; then
    echo "I18N_2D_OK: 2D 版房间/道具/结局/难度中英双语全部正确"
  else
    echo "$I2" | tail -20
    echo "2D 国际化测试失败"
    exit 1
  fi
fi
