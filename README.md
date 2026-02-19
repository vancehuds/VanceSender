# VanceSender

FiveM `/me` `/do` 角色扮演文本发送器，支持 AI 生成与 AI 重写。

## 功能一览

- **单条发送 / 批量发送**：模拟键盘将文本发送到 FiveM 聊天框，批量支持实时进度和随时取消
- **AI 生成**：按场景生成 `/me` `/do` 文本，支持 OpenAI、DeepSeek、Ollama 等 OpenAI 兼容接口
- **AI 重写**：可重写单条文本或整套预设，保留 `/me` `/do` 类型与顺序
- **预设管理**：保存、加载、删除预设文本
- **快捷悬浮窗**：默认启用，支持热键（默认 `F7`）或鼠标侧键快速选预设并发送
- **桌面内嵌UI + WebUI + REST API**：默认内嵌窗口操作，也可浏览器访问与完整 API（含 Swagger）
- **可选鉴权**：支持 `Bearer Token` 保护 `/api/v1/*`

## 快速开始

1. 前往 [Github Release界面](https://github.com/vancehuds/VanceSender/releases/latest) 下载最新版
2. 解压
3. 打开 VanceSender.exe

### 注意：

打包运行时会将可写配置和数据放在：
- `%LOCALAPPDATA%\VanceSender\config.yaml`
- `%LOCALAPPDATA%\VanceSender\data\presets\*.json`

config文件会在您第一次在WebUI保存设置后生成，下方和仓库内也有完整示例可供参考。  
preset文件夹内可存放指定格式的预设，未来我们也会建设预设库，供大家分享使用，现在各位可以自行分享文件使用。


## 环境要求

- Windows 10 / 11
- Python 3.10+
- FiveM 客户端（发送目标）

## 开始

### 1) 安装依赖

```bash
cd VanceSender
pip install -r requirements.txt
```

如果安装失败，可先升级 pip：

```bash
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 2) 初始化配置

首次运行前，先复制配置模板：

```bash
# CMD
copy config.yaml.example config.yaml

# PowerShell
Copy-Item config.yaml.example config.yaml
```

`config.yaml` 是本地私有配置，已在 `.gitignore` 中忽略。

### 3) 启动服务

推荐 Windows 用户直接使用一键启动脚本：

```bat
start.bat
```

也可以手动运行：

```bash
# 仅本机访问
python main.py

# 开启局域网访问
python main.py --lan

# 指定端口
python main.py --port 9000

# 组合使用
python main.py --lan --port 9000
```

启动后默认地址：

- WebUI：`http://127.0.0.1:8730`
- Swagger：`http://127.0.0.1:8730/docs`
- OpenAPI JSON：`http://127.0.0.1:8730/openapi.json`

默认会优先使用内嵌桌面窗口（依赖 `pywebview`）。

- 若环境不支持 `pywebview`，会自动回退到浏览器模式
- 可使用 `python main.py --no-webview` 强制仅浏览器模式

## Windows `start.bat` 教程

已新增独立教程文档：`docs/windows-start-bat.md`

内容包含：

- 如何双击或命令行启动
- `--lan` / `--port` 参数用法
- 脚本执行流程（Python 检测、`.venv` 创建、依赖安装、启动）
- 常见问题排查（Python 未安装、依赖安装失败、端口冲突、防火墙）

### 用户侧使用

用户机器不需要安装 Python，解压后直接运行：

`VanceSender.exe`

### 打包版配置与数据位置

打包运行时会将可写配置和数据放在：

- `%LOCALAPPDATA%\VanceSender\config.yaml`
- `%LOCALAPPDATA%\VanceSender\data\presets\*.json`

说明：

- `config.yaml` 不存在时会使用内置默认配置启动
- `config.yaml.example` 作为模板会被打包进程序资源目录（`_internal`），便于参考
- 目前推荐 `onedir` 分发；不建议优先使用 `onefile`

## 使用方式

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

### 快捷悬浮窗

- 默认启用（`quick_overlay.enabled: true`）
- 默认触发键 `F7`
- 可配置 `mouse_side_button`（如 `x1` / `x2`）

## 配置说明

`config.yaml.example` 为模板，`config.yaml` 为实际运行配置。

```yaml
server:
  host: 127.0.0.1
  port: 8730
  lan_access: false
  token: ''

launch:
  open_webui_on_start: false  # 启动时自动在系统浏览器打开 WebUI（默认关闭）
  open_intro_on_first_start: true  # 首次启动时自动打开介绍页
  intro_seen: false           # 内部状态：介绍页是否已展示过
  show_console_on_start: false  # 启动时显示控制台日志窗口（默认关闭）

sender:
  method: clipboard          # clipboard 或 typing
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
  compact_mode: false
  trigger_hotkey: f7
  mouse_side_button: ''
  poll_interval_ms: 40

public_config:
  source_url: ''
  timeout_seconds: 5
  cache_ttl_seconds: 120

ai:
  providers: []
  default_provider: ''
  system_prompt: ''
  custom_headers:
    User-Agent: python-httpx/0.28.1
    X-Stainless-Lang: ''
    X-Stainless-Package-Version: ''
    X-Stainless-OS: ''
    X-Stainless-Arch: ''
    X-Stainless-Runtime: ''
    X-Stainless-Runtime-Version: ''
```

### 启动页、浏览器自动打开与控制台

- `launch.open_webui_on_start`：控制每次启动是否自动在系统浏览器打开 WebUI（默认 `false`）
- `launch.open_intro_on_first_start`：控制首次启动是否自动打开介绍页（默认 `true`）
- `launch.intro_seen`：程序首次成功触发介绍页后会自动写为 `true`，通常无需手动修改
- `launch.show_console_on_start`：控制是否在启动时显示控制台日志窗口（默认 `false`，重启后生效）

## API 文档

- 详细接口说明：`API.md`
- 运行时交互文档：`/docs`

当 `server.token` 为空时，不启用鉴权。
当 `server.token` 非空时，所有 `/api/v1/*` 请求都需要：

```http
Authorization: Bearer <your-token>
```

## 项目结构

```text
VanceSender/
├── main.py
├── start.bat
├── README.md
├── API.md
├── config.yaml.example
├── requirements.txt
├── app/
│   ├── api/
│   │   ├── auth.py
│   │   ├── schemas.py
│   │   └── routes/
│   │       ├── ai.py
│   │       ├── presets.py
│   │       ├── sender.py
│   │       └── settings.py
│   ├── core/
│   │   ├── ai_client.py
│   │   ├── config.py
│   │   ├── quick_overlay.py
│   │   └── sender.py
│   └── web/
│       ├── index.html
│       ├── css/style.css
│       └── js/app.js
├── data/
│   └── presets/
└── docs/
    └── windows-start-bat.md
```

## 常见问题

**Q: 发送没有反应？**
A: 先确认 FiveM 在前台。可适当增大 `delay_open_chat`、`focus_timeout`、`retry_count`。

**Q: 聊天键不是 `T` 怎么办？**
A: 修改 `sender.chat_open_key`（例如 `y`）。

**Q: 中文发送异常？**
A: 优先使用 `sender.method: clipboard`。

**Q: 开了 `--lan` 但手机无法访问？**
A: 检查 Windows 防火墙和端口放行；必要时改用 `--port` 指定端口。

## 许可证

GPL v3
