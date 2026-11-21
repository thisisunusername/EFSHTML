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
  # 难度系统：diffGet/diffApply/exfilBuild 被 b_world 的 setupWorld 调用，
  # 而 setupWorld 是运行时调用（不是加载时），所以放这里足够早；
  # 但 exfilNear 被 d_game 的 checkExfil 用，也必须在这个位置之前定义。
  cat full/v_diff.js;    printf '\n'
  # 多楼层：buildFloors/updFloors/floorInteract 被 b_world、x_ext、z_render 调用，
  # 三者都是运行时调用，所以放在这里（x_ext 之后）足够。
  cat full/u_floors.js;  printf '\n'
  cat full/w_weapon.js;  printf '\n'
  cat full/y_audio.js;   printf '\n'
  # 强制横屏：依赖 T()（遮罩文案），必须在 i18n_core 之后
  cat full/_orient.js;   printf '\n'
  # 国际化接入层：要调 buildShop/buildBagNew 等，必须排在 f_ui 之后
cat full/u_i18n.js;    printf '\n'
  # 主题 / 512 色板 / 调试日志：纯工具层，被 f_ui 和 t_settings 共同调用
  cat full/s_theme.js;   printf '\n'
  # 设置面板 UI：依赖 s_theme 的 themeSet / accentSet / masterVolSet
  cat full/t_settings.js; printf '\n'
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
    sed -n "$((L1+1)),$((L2-1))p" "$OUT" > /tmp/efs_fps_check.mjs
    # ============================================================
    # 【必须用 .mjs 做真正的 module 检查】
    # 旧版这里是：grep -v '^import ' 之后按「普通脚本」检查。
    # 那是个致命的盲区 —— 普通脚本模式下，重复声明同名函数是合法的
    # （后一个直接覆盖前一个，连警告都没有）；而在 ES module 里
    # （严格模式），重复声明是 SyntaxError：
    #   Identifier 'xxx' has already been declared
    # 一旦出现，整个 module 无法编译，所有 JS 一行都不执行 ——
    # 页面看起来完全正常（HTML/CSS 都在），但所有按钮都没反应。
    # 这就是「主界面按钮点不动、但按下有蓝圈」的真正原因：
    # bagUsed 在 f_ui.js 里被声明了两次，build.sh 却报告「语法通过」。
    # 现在直接把拼接结果写成 .mjs，让 node 按 module 语义解析，
    # 重复声明、顶层 await 位置错误等问题都能被抓出来。
    # ============================================================
    if node --input-type=module --check < /tmp/efs_fps_check.mjs 2>/tmp/efs_fps_err.txt; then
      echo "OK: $OUT ($(wc -c < "$OUT") bytes) 语法通过（module 模式）"
    else
      echo "════════ 语法错误（module 模式）════════"
      cat /tmp/efs_fps_err.txt
      echo "───────────────────────────────────────"
      echo "最常见原因：同一个分块或跨分块重复声明了同名函数/常量。"
      echo "查一下报错里的标识符，在 full/*.js 里 grep 它的声明次数。"
      echo "注意：这类错误会让整个页面 JS 全部不执行（按钮点不动、有蓝圈）。"
      exit 1
    fi
  else
    echo "OK: $OUT ($(wc -c < "$OUT") bytes)，未找到 module script 标记，跳过语法检查"
  fi
else
  echo "OK: $OUT ($(wc -c < "$OUT") bytes)，未安装 node，跳过语法检查"
fi

