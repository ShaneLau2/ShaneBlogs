
<div align="center">

# Shane's Blog

> 基于 [Firefly](https://github.com/CuteLeaf/Firefly)（一款 Astro 静态博客主题模板）二次开发，增加了后台管理系统

</div>

---

## ✨ 新增功能

### 🛠 本地 Admin Panel

运行在 `http://localhost:3000` 的本地后台管理系统。

```bash
pnpm admin                # 启动（默认密码 admin）
ADMIN_PASSWORD=你的密码 pnpm admin  # 自定义密码
```

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

通过 GitHub REST API 直接操作仓库文件，功能与本地版基本一致（不含音乐搜索下载）。

**首次使用：**
1. 设置密码：`pnpm admin:set-pwd 你的密码`，将输出的 SHA-256 哈希填入 `public/admin/config.json`
2. 准备 GitHub Personal Access Token（需 `repo` 权限）
3. 推送到 GitHub，访问 `/admin/` 路径

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
| `pnpm admin` | 启动后台管理系统（localhost:3000） |
| `pnpm admin:secure` | 使用密码哈希启动后台 |
| `pnpm admin:set-pwd` | 生成密码哈希 |
| `pnpm build` | 构建生产版本到 dist/ |
| `pnpm new-post <name>` | 创建新文章 |
| `pnpm new-d <content>` | 创建新动态 |
| `pnpm check` | Astro 类型检查 |
| `pnpm format` / `pnpm lint` | 代码格式化 / 检查 |

---

## 📝 原项目

本仓库 Fork 自 [CuteLeaf/Firefly](https://github.com/CuteLeaf/Firefly)（原 [fuwari](https://github.com/saicaca/fuwari)），感谢原作者的贡献。
