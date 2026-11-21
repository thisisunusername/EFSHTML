#!/usr/bin/env bash
# 把 FPS/full/ 里的分块源码拼成 FPS/index.html（ESM 模块版）
# 用法：cd FPS && bash build.sh
set -u

cd "$(dirname "$0")"

OUT=index.html

{
  cat full/a_head.html            # HTML+CSS+importmap+<script type="module">+import * as THREE
  printf '\n'
  # i18n 核心必须第一个：T() 在 b_world 起就被调用（物品名/场景标签）
  cat ../i18n/i18n_core.js; printf '\n'
  # 程序化材质系统：b_world 的 box()/cyl() 要调 matGetForSize，必须排在它之前
  cat full/aa_mat.js;    printf '\n'
  cat full/b_world.js;   printf '\n'
  cat full/c_player.js;  printf '\n'
  cat full/d_game.js;    printf '\n'
  cat full/e_io.js;      printf '\n'
  cat full/f_ui.js;      printf '\n'
  # x_ext 提供门/新操场/交互入口，必须在 b_world 之后、z_render 之前
  cat full/x_ext.js;     printf '\n'
  cat full/w_weapon.js;  printf '\n'
  cat full/y_audio.js;   printf '\n'
  # 强制横屏：依赖 T()（遮罩文案），必须在 i18n_core 之后
  cat full/_orient.js;   printf '\n'
  # 国际化接入层：要调 buildShop/buildBagNew 等，必须排在 f_ui 之后
  cat full/u_i18n.js;    printf '\n'
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

