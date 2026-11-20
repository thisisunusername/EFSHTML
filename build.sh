#!/usr/bin/env bash
# 把 full/ 里的分块源码拼成单文件 index.html
# 用法：bash build.sh
set -u

cd "$(dirname "$0")"

OUT=index.html

{
  cat full/a_head.html
  printf '(function(){\n'
  printf "'use strict';\n"
  cat full/b_world.js;   printf '\n'
  cat full/c_logic.js;   printf '\n'
  cat full/d_actions.js; printf '\n'
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