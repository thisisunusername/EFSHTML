# EFS 部署说明

两套产物，用途不同，不要混用。

## 一、网页发布（内置单文件）

产物：`FPS/index_single.html`（约 1.94 MB）

Three.js 已经内联进 HTML，**没有任何外部依赖**，直接传一个文件就能用。

上传方式（任选）：

- GitHub Pages：推到仓库，文件名改 `index.html`，启用 Pages
- 任意静态托管：Netlify / Vercel / Cloudflare Pages / 对象存储
- 自己的服务器：nignx 静态目录丢进去即可

注意：不需要额外上传 `three.module.js`，也不需要配置 MIME 类型。

## 二、本地游玩（html + three.js 分开）

产物：

```
FPS/index.html          745 KB
FPS/three.module.js     1.27 MB
fonts/                  字体（可选）
```

这三个放同一个目录。

本地版用的是 ES module + importmap，**不能用 file:// 直接双击打开**（浏览器禁止 file:// 下的 module）。必须起一个本地 HTTP 服务：

```bash
cd FPS
python3 -m http.server 8080
# 浏览器访问 http://127.0.0.1:8080/
```

手机上没有 python3 的话，用任意「本地 Web 服务器」App，或直接把文件丢进 Termux 跑上面的命令。

## 三、构建

```bash
# 完整流程
cd FPS
bash build.sh          # 拼接源码 -> index.html（本地版）
bash build_single.sh   # 内联 three -> index_single.html（网页版）
```

顺序不能反：`build_single.sh` 读的是 `index.html`。

## 四、常见问题

**网页版打开白屏 / 报 module 错误**
- 说明用的是本地版 `index.html`。改用 `index_single.html`。

**本地版按钮全部点不动、只有样式**
- 说明用 `file://` 直接打开了。起 HTTP 服务。

**字体没变化**
- `file://` 或跨域下字体可能被拦。把 `fonts/` 目录放在 HTML 同级。

## 五、产物校验

| 产物 | 大小 | md5 |
|---|---|---|
| 网页版 index_single.html | 2035289 | f0d489dfdf5995141dbaab4d1332cbf2 |
| 本地版 index.html | 762667 | 2106bd519575261946d7f4c925c67b8f |
| three.module.js | 1272972 | a762b8588c6abf23cb87624360d014c4 |
| 2D 版 index.html | 292705 | 770a605bd0da86d63979362a70577846 |
