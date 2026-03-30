# VanceSender

FiveM `/me` `/do` 角色扮演文本发送器，支持 AI 生成、AI 重写与 AI 高级剧情树。

## ✨ 功能一览

- **单条发送 / 批量发送**：模拟键盘将文本发送到 FiveM 聊天框，批量支持实时进度和随时取消
- **AI 生成**：按场景生成 `/me` `/do` 文本，支持 OpenAI、DeepSeek、Google Gemini、Ollama 等多种 AI 接口
- **AI 重写**：可重写单条文本或整套预设，保留 `/me` `/do` 类型与顺序
- **AI 高级剧情树**：AI 驱动的对话剧情树，可设置剧情倾向与风格生成分支故事线，快速复制节点文本
- **AI 对话历史**：保存和管理 AI 对话记录
- **预设管理**：保存、加载、删除预设文本
- **快捷悬浮窗**：默认启用，支持热键（默认 `F7`）或鼠标侧键快速选预设并发送，可显示 WebUI 发送状态
- **桌面内嵌窗口 + 系统托盘**：基于 pywebview 的原生桌面窗口体验，支持启动后托盘驻留、托盘恢复主窗口
- **WebUI + REST API**：可浏览器访问完整 WebUI，完整 REST API 含 Swagger 交互文档
- **Cloudflare Tunnel**：支持通过 cloudflared 创建公网 HTTPS 隧道，零配置快速分享或自定义域名
- **多语言支持（i18n）**：WebUI 内建国际化支持
- **自动更新检查**：启动时检查 GitHub 新版本
- **远程公告系统**：支持从 GitHub 获取远程公告并展示
- **统计面板**：发送与 AI 使用统计数据
- **启动引导页**：首次启动引导体验
- **端口占用检测**：启动时自动检测端口冲突
- **可选鉴权**：支持 `Bearer Token` 保护 `/api/v1/*`

## 🚀 快速开始

1. 前往 [GitHub Release 界面](https://github.com/vancehuds/VanceSender/releases/latest) 下载最新版
2. 解压
3. 打开 `VanceSender.exe`

### 注意

打包运行时会将可写配置和数据放在：
- `%LOCALAPPDATA%\VanceSender\config.yaml`
- `%LOCALAPPDATA%\VanceSender\data\presets\*.json`

config 文件会在您第一次在 WebUI 保存设置后生成，下方和仓库内也有完整示例可供参考。  
preset 文件夹内可存放指定格式的预设，未来我们也会建设预设库，供大家分享使用，现在各位可以自行分享文件使用。

## 📖 使用方式

### 发送文本

1. 打开 WebUI 的发送面板
2. 输入文本（每行一条；无前缀默认按 `/me` 处理）
3. 导入到发送列表后，确保 FiveM 在前台
4. 点击单条发送，或执行全部发送

### AI 生成

1. 输入场景描述
2. 选择文本类型（`mixed` / `me` / `do`）
3. 可选填写风格（style）
4. 生成后导入发送列表

### AI 重写

- 支持对单条文本重写
- 支持对整套预设重写后保存
- 可附加风格与额外要求

### AI 高级剧情树

- 基于 AI 的对话式剧情分支系统
- 支持设置剧情倾向（plot tendency）引导 AI 故事方向
- 自动生成环境描述 + 互动提问两类 AI 回复
- 快捷复制用户节点文本到发送列表

### 快捷悬浮窗

- 默认启用（`quick_overlay.enabled: true`）
- 默认触发键 `F7`
- 可配置 `mouse_side_button`（如 `x1` / `x2`）
- 支持显示 WebUI 发送状态（`show_webui_send_status: true`）

### Cloudflare Tunnel

通过 cloudflared 创建公网 HTTPS 隧道，实现远程访问：

- **快速隧道（Quick Tunnel）**：零配置，自动生成 `*.trycloudflare.com` 随机域名
- **命名隧道（Named Tunnel）**：使用预配置的隧道 Token，绑定自定义域名
- **安全保护**：启动隧道时自动检测并配置 Bearer Token，未配置时自动生成安全随机令牌
- **速率限制**：隧道激活时自动启用请求限流（60 次/分钟/IP）

使用前提：需安装 [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

## ⚙️ 配置说明

`config.yaml.example` 为模板，`config.yaml` 为实际运行配置。

```yaml
server:
  host: 127.0.0.1
  port: 8730
  lan_access: false
  token: ''

launch:
  enable_tray_on_start: true
  close_action: ask              # ask / minimize_to_tray / exit
  open_webui_on_start: false
  open_intro_on_first_start: false
  intro_seen: false
  show_console_on_start: false

sender:
  method: clipboard              # clipboard 或 typing
  chat_open_key: t
  delay_open_chat: 450
  delay_after_paste: 160
  delay_after_send: 260
  delay_between_lines: 1800
  focus_timeout: 8000
  retry_count: 3
  retry_interval: 450
  typing_char_delay: 18

quick_overlay:
  enabled: true
  show_webui_send_status: true
  compact_mode: true
  trigger_hotkey: f7
  mouse_side_button: ''
  poll_interval_ms: 40

public_config:
  source_url: ''
  timeout_seconds: 5
  cache_ttl_seconds: 120

ai:
  providers:
    - id: openai
      name: OpenAI
      type: openai
      api_base: https://api.openai.com/v1
      api_key: sk-your-openai-key
      model: gpt-4o-mini
    - id: deepseek
      name: DeepSeek
      type: openai
      api_base: https://api.deepseek.com/v1
      api_key: sk-your-deepseek-key
      model: deepseek-chat
    - id: gemini
      name: Google Gemini
      type: gemini
      api_key: your-gemini-api-key
      model: gemini-2.0-flash
  default_provider: openai
  system_prompt: |
    你是一个FiveM角色扮演文本生成助手。...
  custom_headers:
    User-Agent: python-httpx/0.28.1
```

### 配置项说明

| 配置项 | 说明 |
|--------|------|
| `launch.enable_tray_on_start` | 启动时启用系统托盘图标（默认 `true`） |
| `launch.close_action` | 关闭行为：`ask` 每次询问、`minimize_to_tray` 直接托盘化、`exit` 直接退出 |
| `launch.open_webui_on_start` | 启动时自动在系统浏览器打开 WebUI（默认 `false`） |
| `launch.open_intro_on_first_start` | 首次启动自动打开介绍页（默认 `false`） |
| `launch.intro_seen` | 介绍页是否已展示过（自动管理） |
| `launch.show_console_on_start` | 启动时显示控制台日志窗口（默认 `false`，重启后生效） |
| `quick_overlay.show_webui_send_status` | 悬浮窗中显示 WebUI 发送状态 |

## 📡 API 文档

- 详细接口说明：[`docs/API.md`](docs/API.md)
- 运行时交互文档：`http://127.0.0.1:8730/docs`

当 `server.token` 为空时，不启用鉴权。  
当 `server.token` 非空时，所有 `/api/v1/*` 请求都需要：

```http
Authorization: Bearer <your-token>
```

## 📂 项目结构

```text
VanceSender/
├── main.py                          # 程序入口
├── requirements.txt                 # Python 依赖
├── package.json                     # 前端工具链 (Tailwind CSS)
├── tailwind.config.js               # Tailwind 配置
├── vancesender.spec                 # PyInstaller 打包配置
├── config.yaml.example              # 配置模板
├── icon.ico / icon.png              # 应用图标
├── README.md
├── app/
│   ├── api/
│   │   ├── auth.py                  # Token 鉴权中间件
│   │   ├── schemas.py               # Pydantic 请求/响应模型
│   │   └── routes/
│   │       ├── ai.py                # AI 生成 / 重写 / 剧情树路由
│   │       ├── presets.py           # 预设 CRUD 路由
│   │       ├── sender.py           # 发送控制路由
│   │       ├── settings.py         # 设置管理路由
│   │       ├── stats.py            # 统计数据路由
│   │       └── tunnel.py           # Cloudflare Tunnel 路由
│   ├── core/
│   │   ├── ai_client.py            # OpenAI 兼容 AI 客户端
│   │   ├── ai_gemini.py            # Google Gemini AI 客户端
│   │   ├── ai_conversation_tree.py # AI 剧情对话树引擎
│   │   ├── ai_history.py           # AI 对话历史管理
│   │   ├── app_meta.py             # 应用元数据 (名称/版本/仓库)
│   │   ├── config.py               # 配置加载与管理
│   │   ├── desktop_shell.py        # pywebview 桌面窗口 & 系统托盘
│   │   ├── history.py              # 发送历史记录
│   │   ├── network.py              # 局域网 IP 发现
│   │   ├── notifications.py        # 通知系统
│   │   ├── overlay_status.py       # 悬浮窗状态管理
│   │   ├── port_guard.py           # 启动端口占用检测
│   │   ├── presets.py              # 预设文件读写
│   │   ├── public_config.py        # GitHub 远程公告
│   │   ├── quick_overlay.py        # 快捷悬浮窗核心逻辑
│   │   ├── rate_limit.py           # 隧道速率限制中间件
│   │   ├── runtime_paths.py        # 运行时路径解析
│   │   ├── sender.py               # FiveM 文本发送引擎
│   │   ├── stats.py                # 使用统计
│   │   ├── tunnel.py               # Cloudflare Tunnel 管理器
│   │   └── update_checker.py       # GitHub 自动更新检查
│   └── web/
│       ├── index.html              # 主界面
│       ├── intro.html              # 启动引导页
│       ├── help.html               # 帮助页
│       ├── favicon.ico
│       ├── css/
│       │   ├── style.css           # 主样式
│       │   ├── tailwind.css        # Tailwind 输出
│       │   ├── input.css           # Tailwind 源
│       │   ├── intro.css           # 引导页样式
│       │   └── help.css            # 帮助页样式
│       └── js/
│           ├── app.js              # 主应用逻辑
│           ├── i18n.js             # 国际化
│           └── help.js             # 帮助页逻辑
├── pages/
│   ├── index.html                  # GitHub Pages 首页
│   └── help.html                   # GitHub Pages 帮助页
├── data/
│   └── presets/                    # 预设文件存放
└── docs/
    ├── API.md                      # API 接口文档
    ├── github-pages.md
    ├── update-check-optimization.md
    └── windows-start-bat.md
```

## 🛠️ 开发环境

### 技术栈

| 层 | 技术 |
|----|------|
| **后端** | Python 3.10+、FastAPI、Uvicorn、Pydantic v2 |
| **AI 接口** | OpenAI SDK、Google GenAI SDK、HTTPX |
| **桌面集成** | pywebview (WebView2)、pystray (系统托盘) |
| **前端** | HTML / CSS / JavaScript、Tailwind CSS v3 |
| **打包** | PyInstaller |

### 本地开发

```bash
# 安装 Python 依赖
pip install -r requirements.txt

# 安装前端工具链（仅开发时需要）
npm install

# 启动开发服务器
python main.py

# 启用局域网访问
python main.py --lan

# 自定义端口
python main.py --port 9000

# 禁用内嵌桌面窗口（仅浏览器模式）
python main.py --no-webview
```

### 打包

```bash
pyinstaller vancesender.spec
```

## ❓ 常见问题

**Q: 发送没有反应？**  
A: 先确认 FiveM 在前台。可适当增大 `delay_open_chat`、`focus_timeout`、`retry_count`。

**Q: 聊天键不是 `T` 怎么办？**  
A: 修改 `sender.chat_open_key`（例如 `y`）。

**Q: 中文发送异常？**  
A: 优先使用 `sender.method: clipboard`。

**Q: 开了 `--lan` 但手机无法访问？**  
A: 检查 Windows 防火墙和端口放行；必要时改用 `--port` 指定端口。

**Q: 启动时提示端口被占用？**  
A: VanceSender 内置端口占用检测，会提示冲突进程。关闭占用端口的程序或更换端口即可。

**Q: 内嵌窗口无法显示？**  
A: 需要系统安装 WebView2 Runtime。若缺失则自动回退浏览器模式。

## 📜 许可证

[GPL v3](LICENSE)
