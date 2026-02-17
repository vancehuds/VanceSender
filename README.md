# VanceSender

FiveM `/me` `/do` 角色扮演文本发送器，带一键 AI 生成。

## 功能一览

- **文本发送** — 通过模拟键盘（T → 粘贴 → Enter）向 FiveM 聊天框发送 `/me` `/do` 文本
- **单条发送** — 列表中每条文本均可单独点击发送
- **批量发送** — 一键发送整套文本，支持可配置间隔、实时进度、随时取消
- **AI 生成** — 描述场景，AI 自动生成一整套 `/me` `/do` 文本（支持 OpenAI、DeepSeek、Ollama 等任意 OpenAI 兼容 API）
- **预设管理** — 保存 / 加载 / 删除常用文本集
- **WebUI** — 暗色游戏风界面，支持电脑和移动端
- **局域网访问** — 可选开启，用手机 / 平板远程控制发送
- **RESTful API** — 完整的 REST 接口，附带 Swagger 文档，支持可选 Bearer Token 鉴权

## 环境要求

- Windows 10 / 11
- Python 3.10+
- FiveM 客户端（发送目标）

## 快速开始

### 1. 安装依赖

```bash
cd VanceSender
pip install -r requirements.txt
```

> 如果你之前在 Python 3.14 环境中安装失败（`pydantic-core` 元数据/构建报错），请先升级 `pip` 后重试：
>
> ```bash
> python -m pip install --upgrade pip
> pip install -r requirements.txt
> ```

### 2. 初始化配置

项目提供可提交的模板文件 `config.yaml.example`。首次运行前请复制为本地配置：

```bash
# Windows (CMD)
copy config.yaml.example config.yaml

# PowerShell
Copy-Item config.yaml.example config.yaml
```

> `config.yaml` 为本地私有配置，已在 `.gitignore` 中忽略，不会上传到 GitHub。

### 3. 启动服务

```bash
# 仅本机访问
python main.py

# 允许局域网访问（手机 / 平板可用）
python main.py --lan

# 指定端口
python main.py --port 9000

# 组合使用
python main.py --lan --port 9000
```

启动后访问：

| 地址 | 说明 |
|------|------|
| `http://127.0.0.1:8730` | WebUI 界面 |
| `http://127.0.0.1:8730/docs` | Swagger API 文档 |
| `http://<局域网IP>:8730` | 局域网访问（需 `--lan`） |

### 4. 配置 AI 服务商

首次使用 AI 生成功能前，需要在 **设置 → AI 服务商管理** 中添加至少一个服务商：

| 服务商 | API Base | 说明 |
|--------|----------|------|
| OpenAI | `https://api.openai.com/v1` | 需要 API Key |
| DeepSeek | `https://api.deepseek.com/v1` | 需要 API Key |
| Ollama (本地) | `http://localhost:11434/v1` | API Key 填任意值 |

也可以直接编辑 `config.yaml`：

```yaml
ai:
  providers:
    - id: "deepseek"
      name: "DeepSeek"
      api_base: "https://api.deepseek.com/v1"
      api_key: "sk-your-key-here"
      model: "deepseek-chat"
  default_provider: "deepseek"
```

## 使用方式

### 发送文本

1. 打开 WebUI → **发送** 面板
2. 在文本框中输入，每行一条（自动识别 `/me` `/do` 前缀，无前缀默认为 `/me`）
3. 点击 **导入文本**（或 `Ctrl+Enter`）将文本添加到列表
4. 确保 FiveM 窗口在前台
5. 点击单条文本旁的 🚀 发送按钮，或点击底部 **全部发送**

### AI 生成

1. 切换到 **AI 生成** 面板
2. 输入场景描述（如："一个侦探正在勘察犯罪现场"）
3. 选择文本类型（混合 / 仅 `/me` / 仅 `/do`）
4. 点击 **开始生成**
5. 预览满意后点击 **导入到发送列表**

### 预设

- **保存**：发送面板 → 点击 **存为预设** → 输入名称
- **加载**：预设面板 → 点击预设卡片 → 自动导入到发送列表
- **删除**：预设卡片右上角 ✕ 按钮

## 配置文件

`config.yaml.example` 是配置模板，`config.yaml` 是本地实际运行配置。

所有设置均可通过 WebUI 修改，也可直接编辑 `config.yaml`。

```yaml
server:
  host: "127.0.0.1"     # 监听地址，0.0.0.0 表示开放局域网
  port: 8730             # 监听端口
  lan_access: false      # 是否开启局域网访问
  token: ""              # API 访问令牌；留空表示关闭鉴权

sender:
  method: "clipboard"        # 发送方式：clipboard（推荐）或 typing
  chat_open_key: "t"          # 打开聊天框按键（默认 t，可改为 y 等）
  delay_open_chat: 300       # 按 T 后等待聊天框打开的延迟 (ms)
  delay_after_paste: 100     # 粘贴后等待的延迟 (ms)
  delay_after_send: 200      # 按回车后等待的延迟 (ms)
  delay_between_lines: 1500  # 批量发送时每条消息之间的间隔 (ms)
  focus_timeout: 5000        # 等待 FiveM 成为前台窗口的超时 (ms)
  retry_count: 2             # 单条失败后重试次数
  retry_interval: 300        # 每次重试前等待 (ms)
  typing_char_delay: 18      # typing 模式下每字符间隔 (ms)

ai:
  providers: []              # AI 服务商列表
  default_provider: ""       # 默认服务商 ID
  system_prompt: |           # AI 系统提示词（可自定义）
    ...
  custom_headers:            # 透传给 OpenAI SDK 的自定义请求头
    User-Agent: "python-httpx/0.28.1"
    X-Stainless-Lang: ""
    X-Stainless-Package-Version: ""
    X-Stainless-OS: ""
    X-Stainless-Arch: ""
    X-Stainless-Runtime: ""
    X-Stainless-Runtime-Version: ""
```

## API 认证（可选）

当 `config.yaml` 中 `server.token` 为空时，API 不启用鉴权。

当 `server.token` 已设置后，所有 `/api/v1/*` 请求都必须携带：

```http
Authorization: Bearer <your-token>
```

未携带或 Token 不正确时会返回 `401 Unauthorized`。

## 项目结构

```
VanceSender/
├── main.py                      # 入口 & FastAPI 应用
├── config.yaml.example          # 配置模板（可提交）
├── config.yaml                  # 运行配置
├── requirements.txt             # Python 依赖
├── app/
│   ├── core/
│   │   ├── config.py            # 配置管理（YAML 读写）
│   │   ├── sender.py            # 键盘模拟（ctypes SendInput）
│   │   └── ai_client.py         # 多 Provider AI 客户端
│   ├── api/
│   │   ├── schemas.py           # Pydantic 数据模型
│   │   └── routes/
│   │       ├── presets.py       # 预设 CRUD
│   │       ├── sender.py        # 发送（单条 / 批量 SSE）
│   │       ├── ai.py            # AI 生成
│   │       └── settings.py      # 设置 & Provider 管理
│   └── web/                     # 前端静态文件
│       ├── index.html
│       ├── css/style.css
│       └── js/app.js
└── data/
    └── presets/                 # 预设 JSON 文件
```

## 发送原理

VanceSender 通过 Windows `SendInput` API 模拟键盘操作：

1. 将文本复制到系统剪贴板
2. 模拟按下聊天键（默认 `T`，可配置）打开 FiveM 聊天框
3. 等待聊天框打开（可配置延迟）
4. 模拟 `Ctrl+V`（粘贴文本）
5. 模拟按下 `Enter`（发送消息）

> **注意**：发送时请确保 FiveM 窗口处于前台且未被遮挡。

## 常见问题

**Q: 发送没有反应？**
A: 确保 FiveM 窗口在前台。如果延迟不够，尝试在设置中增大 `delay_open_chat`，并适当提高 `focus_timeout` / `retry_count`。

**Q: 我的聊天键不是 T，为什么发不出去？**
A: 将 `chat_open_key` 改成你的聊天键（如 `y`），并重试发送。

**Q: 批量发送太快被服务器检测？**
A: 增大 `delay_between_lines`（建议 2000ms 以上）。

**Q: 中文无法发送？**
A: 确保使用 `clipboard` 发送方式（默认），不要切换到 `typing` 模式。

**Q: 局域网设备无法访问？**
A: 确认使用 `--lan` 启动，并检查防火墙是否放行了对应端口。

## 许可证

MIT
