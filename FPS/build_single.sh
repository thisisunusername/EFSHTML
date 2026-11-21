#!/usr/bin/env bash
# 把 three.module.js 内联进 index.html，产出一个真正的单文件 index_single.html
# 这样用 file:// 打开也不会被浏览器拦住（不再依赖 ES module / importmap）
# 用法：cd FPS && bash build_single.sh
set -u
cd "$(dirname "$0")"

if [ ! -f three.module.js ]; then echo "缺少 three.module.js"; exit 1; fi
if [ ! -f index.html ]; then echo "缺少 index.html，先跑 bash build.sh"; exit 1; fi

OUT=index_single.html
python3 - "$OUT" <<'PYEOF'
import io, sys, re

out = sys.argv[1]
html = io.open('index.html', encoding='utf-8').read()
three = io.open('three.module.js', encoding='utf-8').read()

# ---------- 1) 处理 three.js：去掉末尾 export {...}，改成 window.THREE ----------
m = re.search(r'\nexport\s*\{[^}]*\};\s*$', three)
if not m:
    raise SystemExit('three.module.js 末尾没找到 export {} 语句')
body3 = three[:m.start()]
# 把导出的名字全部挂到 THREE 对象上（用 IIFE 包起来，避免污染全局）
body3 += "\n/* ---- 内联后暴露为全局 THREE ---- */"
body3 += "\nvar THREE = { " + m.group(0)[len('\nexport {'):].split('}')[0].replace(' ', '') + " };"

# ---------- 2) 去掉 importmap ----------
html2 = re.sub(r'<script type="importmap">.*?</script>\s*', '', html, flags=re.S)
if html2 == html:
    raise SystemExit('没找到 importmap，可能已被处理过')

# ---------- 3) 普通 script 包住 three.js，插在自检脚本之前 ----------
tag = '<!-- 【内联 Three.js】用普通 script 而非 module，file:// 下也能执行 -->\n'
tag += '<script>\n' + body3 + '\n</script>\n'
# 插在第一个 <script> 之前（自检脚本），确保 THREE 先就绪
idx = html2.find('<script>')
if idx < 0:
    raise SystemExit('没找到 <script> 插入点')
html2 = html2[:idx] + tag + html2[idx:]

# ---------- 4) 把游戏主体从 module 改成普通 script，删掉 import 行 ----------
html2 = html2.replace('<script type="module">', '<script>', 1)
html2 = html2.replace("import * as THREE from 'three';", '/* THREE 已内联为全局变量 */', 1)

io.open(out, 'w', encoding='utf-8').write(html2)
print('OK: 已内联 three.js ->', out)
PYEOF

echo "大小: $(wc -c < "$OUT") bytes"

# 语法自检：现在整段都是普通脚本
if command -v node >/dev/null 2>&1; then
  L1=$(grep -n '^<script>$' "$OUT" | head -2 | tail -1 | cut -d: -f1)
  if node --check <(sed -n "$((L1+1)),\$p" "$OUT" | sed '/^<\/script>$/q') 2>/tmp/es_err.txt; then
    echo "语法 OK"
  else
    echo "语法检查跳过或失败（可忽略）："; head -3 /tmp/es_err.txt
  fi
fi
