# GitHub Pages 静态文档站部署说明

本项目已提供一套 **GitHub Pages 专用静态文档站**（Intro + Help），用于在线阅读介绍和使用手册。

> 注意：Pages 站点是静态内容，不包含本地发送、AI 请求、预设管理 API 等运行能力。

## 目录结构

- 文档页面源文件：`pages/`
  - `pages/index.html`
  - `pages/help.html`
- 样式与脚本复用来源：`app/web/`
  - `app/web/css/intro.css`
  - `app/web/css/help.css`
  - `app/web/js/help.js`
- 部署工作流：`.github/workflows/deploy-pages-docs.yml`

工作流会在构建时把上述文件复制到临时目录 `.site/`，并发布到 GitHub Pages。

## 启用步骤

1. 推送到 `main` 分支（或手动触发工作流）
2. 进入 GitHub 仓库 `Settings -> Pages`
3. 在 `Build and deployment` 中选择：
   - Source: `GitHub Actions`
4. 等待 `Deploy Static Docs to GitHub Pages` 工作流完成
5. 访问：
   - `https://<owner>.github.io/<repo>/`

## 何时会自动部署

当以下路径发生变更并推送到 `main` 时触发：

- `pages/**`
- `app/web/css/intro.css`
- `app/web/css/help.css`
- `app/web/js/help.js`
- `.github/workflows/deploy-pages-docs.yml`

## 本地预览建议

可用任意静态文件服务器在仓库根目录启动预览，例如：

```bash
python -m http.server 8080
```

然后访问：

- `http://127.0.0.1:8080/pages/index.html`
- `http://127.0.0.1:8080/pages/help.html`

## 路径规则（已适配）

- 页面内链接采用相对路径（如 `./help.html`）
- 避免使用根路径链接（如 `href="/"`），防止在 `/<repo>/` 子路径下跳转错误
