# 🎲 校园战力党 — Zeabur 部署指南

由于你使用的是腾讯云服务器（通过 Zeabur 托管），Zeabur 的自动化部署流程非常适合这个项目。以下是详细步骤：

### 1. 准备代码 (已完成)
我已经完成了以下关键优化：
- **环境变量支持**：服务端自动读取 `process.env.PORT`。
- **构建脚本**：`package.json` 中的 `npm run build` 会自动构建前端，`npm start` 会启动 Express 服务。
- **Git 忽略**：已排除了 `node_modules` 和 `package-lock.json`，避免部署时的权限或冲突问题。

### 2. 在 Zeabur 上部署
1. **登录 Zeabur**: 访问 [Zeabur 控制台](https://zeabur.com/)。
2. **创建项目**: 点击 **Create Project**。
3. **连接 GitHub**:
   - 点击 **Deploy from GitHub**。
   - 选择你的仓库 `bzduel`。
4. **自动配置**:
   - Zeabur 会自动识别这是为一个 Node.js 项目。
   - 它会自动运行 `npm install` -> `npm run build` -> `npm start`。
5. **设置域名**:
   - 部署完成后，在 **Domain** 标签页点击 **Generate Domain**。
   - 你会得到一个类似 `xxx.zeabur.app` 的地址。

### 3. 注意事项
- **端口**: Zeabur 会自动管理端口转发，你不需要在代码里写死。
- **更新**: 每次你 `git push` 到 GitHub 的 `master` 分支，Zeabur 都会自动触发重新构建和部署。
- **静态资源**: 确保你的 `public/photos/` 目录下有所有角色的头像（如 `wyc.jpg`），否则界面会显示空白。

---
**PVE 模式修复说明**:
我已经修复了 PVE (单人模式) 的逻辑：
- 增加了 AI 的自动选卡和准备逻辑。
- 修复了移动端“调课”弹窗的层级 (z-index) 问题。
- 修复了对方骰子显示异常的问题。

现在你可以尝试再次推送代码并观察 Zeabur 的部署情况！
