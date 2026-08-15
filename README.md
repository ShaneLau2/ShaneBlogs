
<div align="center">

# Shane's Blog

> 基于 [Firefly](https://github.com/CuteLeaf/Firefly)（一款 Astro 静态博客主题模板）二次开发，增加了后台管理系统

</div>

---

## ✨ 新增功能

### 🛠 本地 Admin Panel

运行在 `http://localhost:3000` 的本地后台管理系统。

> 本地版与在线版共用**同一份前端**：规范源在 `admin/web/`（含共享的 `frontmatter.js` 解析器），通过 `pnpm admin:sync-web` 同步到 `admin/public/`（本地 Express 服务）和 `public/admin/`（GitHub Pages 部署）。改前端请只改 `admin/web/`。

```bash
pnpm admin                # 启动（默认监听 http://localhost:3000，仅绑 127.0.0.1）
ADMIN_PASSWORD_HASH=<sha256> pnpm admin  # 用自定义密码哈希启动
```

**首次使用请设置自己的密码**：运行 `pnpm admin:set-pwd 你的密码`，把输出的 SHA-256 哈希填入 `public/admin/config.json` 的 `passwordHash`（或设置 `ADMIN_PASSWORD_HASH` 环境变量）。服务器没有配置密码哈希时会直接报错退出，不会回退到任何硬编码默认值。

| 页面 | 功能 |
|------|------|
| 📊 Dashboard | 博客概览 + Git 状态 |
| 📄 Posts | 创建/编辑/删除文章（Markdown 编辑器 + Frontmatter 表单） |
| 💬 Dynamics | 发布/管理动态 |
| 📋 Pages | 编辑 about / friends / guestbook 页面 |
| 📢 Announcement | 编辑公告标题、内容、链接 |
| ⚙️ Config | 直接编辑任意 TypeScript 配置文件 |
| 🎵 Music | 上传 MP3 + mp3juice 搜索下载 + 自动加入播放列表 |
| 🚀 Deploy | 一键 git commit & push，触发 GitHub Pages 自动部署 |

### 🌐 在线 Admin Panel

纯静态 SPA，部署在 GitHub Pages，无需本地启动。

```
https://你的用户名.github.io/仓库名/admin/
```

通过 GitHub OAuth 登录（不再使用密码 + Personal Access Token）：浏览器跳转到 GitHub 授权后，由 `admin-worker/` 的 Cloudflare Worker 在服务端持有 token，SPA 所有 GitHub API 请求经 Worker 代理转发，浏览器端永远拿不到 token。

**首次使用（一次性配置）：**
1. 在 [GitHub OAuth Apps](https://github.com/settings/developers) 创建一个 OAuth App：
   - Homepage URL：`https://你的用户名.github.io/仓库名/admin/`
   - Authorization callback URL：`https://<你的-worker-域名>.workers.dev/api/oauth/callback`（与下方 Worker 域名一致）
2. 部署 Worker：
   ```bash
   pnpm admin-worker:deploy
   wrangler secret put GITHUB_CLIENT_SECRET   # OAuth App 的 Client secret
   wrangler secret put AUTH_SECRET            # 随机密钥，用于加密会话 cookie（可用 openssl rand -hex 32 生成）
   ```
   `admin-worker/wrangler.jsonc` 里配置 `GITHUB_CLIENT_ID`、`ADMIN_LOGIN`（仅允许此账号登录）、`APP_URL`、`SESSION_TTL`。
3. 把 Worker 的域名填入 `public/admin/config.json` 的 `apiBase`，推送到 GitHub，访问 `/admin/`。
4. 授权时在 GitHub 页面上**只选择本博客仓库**，不要授予其他仓库访问权。

> `config.json` 里的 `passwordHash` 仅供**本地** admin 面板使用，与在线面板无关。

### 🚀 GitHub Pages 自动部署

配置了 GitHub Actions Workflow，每次 push 到 `master` 分支自动构建并部署到 GitHub Pages。

### 🎵 音乐管理

- **本地上传** — 在 admin 选择 MP3 文件，自动加入播放列表并写入配置
- **搜索下载** — 通过 mp3juice 搜索引擎搜歌，点 Download 自动下载并加入播放列表

---

## 🧞 指令

| 命令 | 用途 |
|------|------|
| `pnpm dev` | 启动博客开发服务器（localhost:4321） |
| `pnpm admin` | 启动后台管理系统（localhost:3000，仅绑 127.0.0.1） |
| `pnpm admin:set-pwd` | 生成密码 SHA-256 哈希 |
| `pnpm admin:sync-web` | 把 `admin/web/` 前端同步到 `admin/public/` 与 `public/admin/` |
| `pnpm build` | 构建生产版本到 dist/ |
| `pnpm new-post <name>` | 创建新文章 |
| `pnpm new-d <content>` | 创建新动态 |
| `pnpm check` | Astro 类型检查 |
| `pnpm format` / `pnpm lint` | 代码格式化 / 检查 |

---

## 📝 原项目

本仓库 Fork 自 [CuteLeaf/Firefly](https://github.com/CuteLeaf/Firefly)（原 [fuwari](https://github.com/saicaca/fuwari)），感谢原作者的贡献。
