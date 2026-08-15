# 更新日志

## 🎵 音乐播放列表（本轮重点）

### 播放列表编辑器（本地 + 在线通用）
- **新增曲目**：手动添加（名称 / 艺术家 / 音频 URL / 封面 / LRC），封面可随曲目上传
- **编辑曲目**：行内编辑名称、艺术家、URL，支持替换封面
- **删除曲目**：一键从播放列表移除
- **排序**：三种方式任选
  - 拖拽行（或 `⠿` 手柄）到目标位置
  - 点击选中一行后按 `Alt+↑` / `Alt+↓` 键盘移动
  - 上一版的上/下按钮

### 播放列表数据层重构
- 播放列表从 `musicConfig.ts` 内嵌数组迁出，改为独立的 `src/data/music-playlist.json` 结构化数据
- 管理后台直接读写 JSON，不再靠字符串拼接改配置文件——添加曲目再也不会碰坏 `musicConfig.ts`

### 在线模式支持搜索下载
- 本地和在线模式现在**都能**通过 mp3juice 搜索歌曲并一键下载进播放列表
- 在线模式由 Cloudflare Worker 完成搜索代理与下载上传，浏览器不接触 GitHub token

## 🌐 管理后台：在线模式（GitHub OAuth）

- 弃用旧的「密码 + Personal Access Token」方案，改为 **GitHub OAuth 登录**
- 浏览器跳转 GitHub 授权后，由 Cloudflare Worker 在服务端持有 token，SPA 所有 GitHub API 请求经 Worker 代理转发，浏览器永远拿不到 token
- 仅仓库主人账号（`ADMIN_LOGIN`）可登录，会话 24 小时过期，cookie 加密且 HttpOnly

## 🔒 本地管理后台安全加固

- 登录改为服务端设置 **HttpOnly cookie**，不再把 token 交给前端 JS；登录接口限流（每 IP 10 分钟内 5 次）
- **移除硬编码默认密码**：未配置密码哈希时服务器直接拒绝启动（`pnpm admin:set-pwd` 生成哈希）
- 默认只绑定 `127.0.0.1`，后台不再对局域网开放
- 所有文件路径参数做**路径穿越校验**（slugs、配置名、数据文件名）
- Git 操作改用 `execFileSync`，提交信息无法注入 shell 命令

## 🧩 本地与在线共用一套前端

- 新增 `admin/web/` 作为后台前端**单一来源**，`pnpm admin:sync-web` 一键同步到本地（`admin/public/`）与在线（`public/admin/`），两个面板永远不会版本漂移
- frontmatter 解析器统一为一个共享实现，后台 SPA、Express 服务、Astro 动态 API 三处共用
- 新增本地 e2e 测试与 frontmatter 单元测试

## 🧹 其他

- 移除未使用的轮播过渡遮罩代码
- 不再追踪编辑器历史文件（`.history/`）

---

## 部署提醒（在线模式生效前需完成）

1. 在 GitHub 创建 OAuth App，把 Client ID 填入 `admin-worker/wrangler.jsonc`
2. `wrangler login` 后执行 `pnpm admin-worker:deploy`
3. 用 `wrangler secret put` 设置 `GITHUB_CLIENT_SECRET` 与 `AUTH_SECRET`
4. 把 Worker 域名填入 `public/admin/config.json` 的 `apiBase` 并推送
