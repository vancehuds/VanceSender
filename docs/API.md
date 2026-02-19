# VanceSender API 文档

Base URL: `http://127.0.0.1:8730/api/v1`

运行后可通过以下地址查看在线文档：

- Swagger UI: `http://127.0.0.1:8730/docs`
- OpenAPI JSON: `http://127.0.0.1:8730/openapi.json`

除 SSE 接口（`/send/batch`、`/ai/generate/stream`）外，请求与响应均为 JSON。

---

## 目录

- [认证（可选）](#认证可选)
- [发送接口](#发送接口)
  - [发送单条文本](#发送单条文本)
  - [批量发送文本（SSE）](#批量发送文本sse)
  - [取消批量发送](#取消批量发送)
  - [获取发送状态](#获取发送状态)
- [AI 接口](#ai-接口)
  - [生成文本](#生成文本)
  - [流式生成文本（SSE）](#流式生成文本sse)
  - [重写文本](#重写文本)
  - [测试服务商连接](#测试服务商连接)
- [预设接口](#预设接口)
  - [列出所有预设](#列出所有预设)
  - [创建预设](#创建预设)
  - [获取单个预设](#获取单个预设)
  - [更新预设](#更新预设)
  - [删除预设](#删除预设)
- [设置接口](#设置接口)
  - [获取全部设置](#获取全部设置)
  - [检查版本更新](#检查版本更新)
  - [获取远程公共配置](#获取远程公共配置)
  - [更新发送设置](#更新发送设置)
  - [更新服务器设置](#更新服务器设置)
  - [更新启动设置](#更新启动设置)
  - [更新 AI 设置](#更新-ai-设置)
- [AI 服务商接口](#ai-服务商接口)
  - [列出服务商](#列出服务商)
  - [添加服务商](#添加服务商)
  - [更新服务商](#更新服务商)
  - [删除服务商](#删除服务商)
- [通用数据结构与错误响应](#通用数据结构与错误响应)

---

## 认证（可选）

所有 `/api/v1/*` 路由都挂载了统一鉴权依赖：

- 当 `server.token` 为空：不启用认证
- 当 `server.token` 非空：必须携带 Bearer Token

```http
Authorization: Bearer <your-token>
```

认证失败时：

```json
{
  "detail": "未授权访问，请提供有效的 Token"
}
```

并附带响应头：

```http
WWW-Authenticate: Bearer
```

---

## 发送接口

### 发送单条文本

向 FiveM 聊天框发送一条文本。

```http
POST /api/v1/send
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | 是 | 发送文本，最少 1 个字符 |

请求示例：

```json
{
  "text": "/me 缓缓推开了房门"
}
```

响应示例：

```json
{
  "success": true,
  "text": "/me 缓缓推开了房门",
  "error": null
}
```

当正在进行批量发送时，该接口不会抛 HTTP 错误，而是返回：

```json
{
  "success": false,
  "text": "/me 缓缓推开了房门",
  "error": "正在批量发送中，请等待完成或取消"
}
```

---

### 批量发送文本（SSE）

按顺序发送多条文本，并通过 SSE 返回进度。

```http
POST /api/v1/send/batch
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `texts` | string[] | 是 | 文本数组，至少 1 条 |
| `delay_between` | int | 否 | 每条间隔(ms)，范围 `200-30000`，不传则用配置值 |

请求示例：

```json
{
  "texts": [
    "/me 缓缓走向车辆",
    "/do 男子的脚步声在停车场中回响",
    "/me 掏出车钥匙，按下解锁按钮"
  ],
  "delay_between": 2000
}
```

响应头：`Content-Type: text/event-stream`

事件格式：`data: <JSON>\n\n`

常见事件：

```text
data: {"status":"sending","index":0,"total":3,"text":"/me 缓缓走向车辆"}

data: {"status":"line_result","index":0,"total":3,"success":true,"error":null,"text":"/me 缓缓走向车辆"}

data: {"status":"line_result","index":1,"total":3,"success":false,"error":"未检测到 FiveM 在前台...","text":"/do 男子的脚步声在停车场中回响"}

data: {"status":"completed","total":3,"sent":3,"success":2,"failed":1}
```

取消时：

```text
data: {"status":"cancelled","index":2,"total":3}
```

若已有批量任务在运行，接口会直接返回一条错误事件流：

```text
data: {"status":"error","error":"已有批量发送任务进行中"}
```

---

### 取消批量发送

请求取消当前批量发送任务。

```http
POST /api/v1/send/stop
```

响应示例（已发送取消信号）：

```json
{
  "message": "已发送取消请求",
  "success": true
}
```

响应示例（当前没有批量任务）：

```json
{
  "message": "当前没有正在进行的批量发送",
  "success": false
}
```

---

### 获取发送状态

查询当前是否在发送以及最新进度。

```http
GET /api/v1/send/status
```

响应示例：

```json
{
  "sending": true,
  "progress": {
    "status": "sending",
    "index": 1,
    "total": 3,
    "text": "/do 男子的脚步声在停车场中回响"
  }
}
```

---

## AI 接口

### 生成文本

根据场景生成 `/me` `/do` 文本。

```http
POST /api/v1/ai/generate
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `scenario` | string | 是 | 场景描述 |
| `provider_id` | string | 否 | 指定服务商 ID，不传则使用默认服务商 |
| `count` | int | 否 | 期望条数，范围 `1-30` |
| `text_type` | string | 否 | `mixed`(默认) / `me` / `do` |
| `style` | string | 否 | 生成风格（1-120 字符） |

请求示例：

```json
{
  "scenario": "一个侦探正在勘察一间被翻得乱七八糟的公寓",
  "count": 6,
  "text_type": "mixed",
  "style": "冷峻电影感"
}
```

响应示例：

```json
{
  "texts": [
    { "type": "me", "content": "推开半掩的房门，环顾四周" },
    { "type": "do", "content": "房间内一片狼藉，家具东倒西歪" }
  ],
  "provider_id": "deepseek"
}
```

常见错误码：

| 状态码 | 说明 |
|--------|------|
| 400 | 参数错误、默认服务商未配置、provider_id 无效等 |
| 502 | 上游 AI 服务请求失败 |

`detail` 可能是结构化对象，常见字段：`message`、`error_type`、`provider_id`、`status_code`、`request_id`、`body`。

---

### 流式生成文本（SSE）

以 SSE 流式返回模型输出片段。

```http
POST /api/v1/ai/generate/stream
```

请求体与 [生成文本](#生成文本) 相同。

响应头：`Content-Type: text/event-stream`

示例：

```text
data: /me 推开

data: 半掩的房门

data: /do 房间内一片狼藉

data: [DONE]
```

说明：

- 每条 `data:` 是模型输出的一段文本
- 前端负责拼接后再解析
- 结束标记为 `[DONE]`

---

### 重写文本

重写已有文本（单条或多条），保持输入条数和顺序。

```http
POST /api/v1/ai/rewrite
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `texts` | TextLine[] | 是 | 需要重写的文本列表，范围 `1-80` |
| `provider_id` | string | 否 | 指定服务商 ID，不传则使用默认 |
| `style` | string | 否 | 重写风格（1-120 字符） |
| `requirements` | string | 否 | 额外要求（1-500 字符） |

请求示例：

```json
{
  "texts": [
    { "type": "me", "content": "缓缓走向车辆" },
    { "type": "do", "content": "脚步声在停车场回响" }
  ],
  "style": "克制、压迫感",
  "requirements": "保留动作顺序并强化环境描写"
}
```

响应示例：

```json
{
  "texts": [
    { "type": "me", "content": "压低脚步，慢慢逼近那辆车" },
    { "type": "do", "content": "空旷车场里，鞋底与地面的摩擦声被放大" }
  ],
  "provider_id": "deepseek"
}
```

常见错误码：

| 状态码 | 说明 |
|--------|------|
| 400 | 输入格式/参数不合法、provider 无效 |
| 502 | AI 上游失败或返回格式不符合要求 |

---

### 测试服务商连接

向指定服务商发送最小请求，验证可用性。

```http
POST /api/v1/ai/test/{provider_id}
```

路径参数：

| 参数 | 类型 | 说明 |
|------|------|------|
| `provider_id` | string | 服务商 ID |

成功示例：

```json
{
  "message": "连接成功: Hi",
  "success": true,
  "response": "Hi",
  "error_type": null,
  "status_code": null,
  "request_id": null,
  "body": null
}
```

失败示例：

```json
{
  "message": "连接失败: Connection refused | type=APIConnectionError",
  "success": false,
  "response": null,
  "error_type": "APIConnectionError",
  "status_code": null,
  "request_id": null,
  "body": null
}
```

`404` 表示服务商不存在。

---

## 预设接口

### 列出所有预设

```http
GET /api/v1/presets
```

响应示例：

```json
[
  {
    "id": "a1b2c3d4",
    "name": "开车门场景",
    "texts": [
      { "type": "me", "content": "缓缓走向车辆" },
      { "type": "do", "content": "脚步声在停车场回响" }
    ],
    "created_at": "2026-02-17T08:30:00+00:00",
    "updated_at": "2026-02-17T08:30:00+00:00"
  }
]
```

---

### 创建预设

```http
POST /api/v1/presets
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 名称，范围 `1-100` |
| `texts` | TextLine[] | 否 | 文本列表，不传默认为空数组 |

响应：`201 Created`

---

### 获取单个预设

```http
GET /api/v1/presets/{preset_id}
```

响应为单个预设对象；不存在返回 `404`。

---

### 更新预设

```http
PUT /api/v1/presets/{preset_id}
```

请求体（按需传递）：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 新名称 |
| `texts` | TextLine[] | 否 | 新文本列表（整体替换） |

响应为更新后的完整预设对象。

---

### 删除预设

```http
DELETE /api/v1/presets/{preset_id}
```

响应示例：

```json
{
  "message": "预设 'a1b2c3d4' 已删除",
  "success": true
}
```

不存在返回 `404`。

---

## 设置接口

### 获取全部设置

```http
GET /api/v1/settings
```

响应示例：

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8730,
    "lan_access": false,
    "webui_url": "http://127.0.0.1:8730",
    "docs_url": "http://127.0.0.1:8730/docs",
    "token_set": true,
    "system_tray_supported": true,
    "risk_no_token_with_lan": false,
    "security_warning": ""
  },
  "launch": {
    "enable_tray_on_start": true,
    "close_action": "ask",
    "open_webui_on_start": false,
    "open_intro_on_first_start": true,
    "show_console_on_start": false
  },
  "sender": {
    "method": "clipboard",
    "chat_open_key": "t",
    "delay_open_chat": 300,
    "delay_after_paste": 100,
    "delay_after_send": 200,
    "delay_between_lines": 1500,
    "focus_timeout": 5000,
    "retry_count": 2,
    "retry_interval": 300,
    "typing_char_delay": 18
  },
  "ai": {
    "providers": [
      {
        "id": "deepseek",
        "name": "DeepSeek",
        "api_base": "https://api.deepseek.com/v1",
        "model": "deepseek-chat",
        "api_key_set": true
      }
    ],
    "default_provider": "deepseek",
    "system_prompt": "你是一个FiveM角色扮演文本生成助手...",
    "custom_headers": {
      "User-Agent": "python-httpx/0.28.1"
    }
  }
}
```

注意：

- `server.token` 不会明文返回，只通过 `token_set` 表示是否已配置
- provider 的 `api_key` 不会明文返回，只通过 `api_key_set` 表示是否已配置
- 当 `lan_access=true` 且 `token` 为空时，`risk_no_token_with_lan=true`
- `launch` 区块用于控制启动行为（托盘化、关闭行为、浏览器自动打开、介绍页、控制台日志窗口）

---

### 检查版本更新

```http
GET /api/v1/settings/update-check
```

说明：

- 优先请求 GitHub Release：`/repos/{owner}/{repo}/releases/latest`
- 若仓库无 Release（`404`），自动回退到 Tag：`/repos/{owner}/{repo}/tags?per_page=1`
- 后端带 10 分钟缓存与条件请求（`If-Modified-Since` / `If-None-Match`）以降低限流风险
- 鉴权失败时仍返回 `401`；业务层统一返回 `UpdateCheckResponse`

响应字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | bool | 检查流程是否成功（若上游失败但命中缓存，也会返回成功缓存结果） |
| `current_version` | string | 当前应用版本 |
| `latest_version` | string \| null | 最新版本号（失败时可能为空） |
| `update_available` | bool | 是否确定有更新 |
| `release_url` | string \| null | 发布页或标签页链接 |
| `published_at` | string \| null | Release 发布时间（Tag 回退时通常为空） |
| `message` | string | 面向用户的结果描述 |
| `error_type` | string \| null | 错误类型（失败时可用） |
| `status_code` | int \| null | 上游状态码（失败时可用） |

成功响应示例（发现新版本）：

```json
{
  "success": true,
  "current_version": "1.0.1",
  "latest_version": "1.1.0",
  "update_available": true,
  "release_url": "https://github.com/vancehuds/VanceSender/releases/tag/v1.1.0",
  "published_at": "2026-02-18T08:00:00Z",
  "message": "发现新版本 v1.1.0",
  "error_type": null,
  "status_code": null
}
```

成功响应示例（无法可靠比较版本时不误报更新）：

```json
{
  "success": true,
  "current_version": "1.0.1",
  "latest_version": "nightly-2026-02-18",
  "update_available": false,
  "release_url": "https://github.com/vancehuds/VanceSender/tags",
  "published_at": null,
  "message": "已获取最新版本 vnightly-2026-02-18（基于标签），但无法可靠比较版本高低",
  "error_type": null,
  "status_code": null
}
```

失败响应示例（无可用缓存时）：

```json
{
  "success": false,
  "current_version": "1.0.1",
  "latest_version": null,
  "update_available": false,
  "release_url": null,
  "published_at": null,
  "message": "检查更新失败，请稍后重试",
  "error_type": "HTTPError",
  "status_code": 429
}
```

---

### 获取远程公共配置

```http
GET /api/v1/settings/public-config
```

说明：

- 默认从 `https://raw.githubusercontent.com/vancehuds/VanceSender/main/public-config.yaml` 拉取配置
- 远程配置中的 `enabled=false` 时，后端会返回 `visible=false`（前端应默认不显示）
- 当远程拉取失败、超时或格式错误时，也会返回 `visible=false`（默认不显示）

响应字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `success` | bool | 拉取+解析流程是否成功 |
| `visible` | bool | 是否建议在 WebUI / CLI 中显示 |
| `source_url` | string \| null | 实际拉取地址 |
| `title` | string \| null | 显示标题 |
| `content` | string \| null | 显示内容 |
| `message` | string | 结果描述 |
| `fetched_at` | string \| null | 拉取时间（UTC ISO 格式） |
| `link_url` | string \| null | 可选跳转链接 |
| `link_text` | string \| null | 可选链接文本 |
| `error_type` | string \| null | 失败时错误类型 |
| `status_code` | int \| null | 上游状态码 |

成功响应示例（远程开启）：

```json
{
  "success": true,
  "visible": true,
  "source_url": "https://raw.githubusercontent.com/vancehuds/VanceSender/main/public-config.yaml",
  "title": "远程公告",
  "content": "今晚 22:00 维护，请提前保存预设。",
  "message": "已获取远程公共配置",
  "fetched_at": "2026-02-18T10:35:20.123456+00:00",
  "link_url": "https://github.com/vancehuds/VanceSender",
  "link_text": "查看详情",
  "error_type": null,
  "status_code": 200
}
```

成功响应示例（远程关闭，不显示）：

```json
{
  "success": true,
  "visible": false,
  "source_url": "https://raw.githubusercontent.com/vancehuds/VanceSender/main/public-config.yaml",
  "title": null,
  "content": null,
  "message": "远程开关关闭",
  "fetched_at": "2026-02-18T10:36:00.000000+00:00",
  "link_url": null,
  "link_text": null,
  "error_type": null,
  "status_code": 200
}
```

---

### 更新发送设置

```http
PUT /api/v1/settings/sender
```

请求体（按需传递）：

| 字段 | 类型 | 范围 |
|------|------|------|
| `method` | string | `clipboard` / `typing` |
| `chat_open_key` | string | 单字符 |
| `delay_open_chat` | int | `50-5000` |
| `delay_after_paste` | int | `50-5000` |
| `delay_after_send` | int | `50-5000` |
| `delay_between_lines` | int | `200-30000` |
| `focus_timeout` | int | `0-30000` |
| `retry_count` | int | `0-5` |
| `retry_interval` | int | `50-5000` |
| `typing_char_delay` | int | `0-200` |

响应示例：

```json
{
  "message": "发送设置已更新",
  "success": true
}
```

若请求体为空（无可更新字段）：

```json
{
  "message": "没有需要更新的设置",
  "success": false
}
```

---

### 更新服务器设置

```http
PUT /api/v1/settings/server
```

请求体（按需传递）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `lan_access` | bool | 是否开启局域网访问 |
| `token` | string | API 令牌（传空字符串可关闭鉴权） |

说明：

- 修改 `lan_access` 时，后端会自动同步 `host`（`0.0.0.0` 或 `127.0.0.1`）
- 部分设置需重启服务生效

响应示例：

```json
{
  "message": "服务器设置已更新，部分配置需重启生效",
  "success": true
}
```

---

### 更新启动设置

```http
PUT /api/v1/settings/launch
```

请求体（按需传递）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `enable_tray_on_start` | bool | 启动时是否启用系统托盘图标（启动后仍会显示主窗口） |
| `close_action` | string | 关闭行为：`ask` / `minimize_to_tray` / `exit` |
| `open_webui_on_start` | bool | 是否在启动时自动打开系统浏览器 |
| `open_intro_on_first_start` | bool | 是否在首次启动时打开介绍页 |
| `show_console_on_start` | bool | 是否在启动时显示控制台日志窗口 |

说明：

- 启动行为相关配置通常需重启后生效
- 选择 `close_action=ask` 时，桌面窗口关闭按钮会弹出单个自定义确认窗口（含“记住选择”复选框）
- 为兼容旧版本，服务端仍接受 `start_minimized_to_tray` 作为输入别名，并会写入新字段 `enable_tray_on_start`

响应示例：

```json
{
  "message": "启动设置已更新，重启后生效",
  "success": true
}
```

---

### 更新 AI 设置

```http
PUT /api/v1/settings/ai
```

请求体（按需传递）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `default_provider` | string | 默认服务商 ID |
| `system_prompt` | string | 系统提示词 |
| `custom_headers` | object | 自定义请求头（整体替换） |

说明：

- `default_provider` 不存在会返回 `400`
- `custom_headers` 更新是整体替换，不做深度合并

响应示例：

```json
{
  "message": "AI设置已更新",
  "success": true
}
```

---

## AI 服务商接口

### 列出服务商

```http
GET /api/v1/settings/providers
```

响应示例：

```json
[
  {
    "id": "deepseek",
    "name": "DeepSeek",
    "api_base": "https://api.deepseek.com/v1",
    "api_key_set": true,
    "model": "deepseek-chat"
  }
]
```

---

### 添加服务商

```http
POST /api/v1/settings/providers
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 否 | 自定义 ID，不传自动生成 8 位字符串 |
| `name` | string | 是 | 显示名称 |
| `api_base` | string | 是 | API Base URL |
| `api_key` | string | 否 | API Key |
| `model` | string | 否 | 模型名称，默认 `gpt-4o` |

响应：`201 Created`

说明：如果当前还没有默认服务商，新建后会自动设为默认。

---

### 更新服务商

```http
PUT /api/v1/settings/providers/{provider_id}
```

请求体（按需传递）：`name`、`api_base`、`api_key`、`model`。

成功返回更新后的服务商对象，不存在返回 `404`。

---

### 删除服务商

```http
DELETE /api/v1/settings/providers/{provider_id}
```

响应示例：

```json
{
  "message": "服务商 'deepseek' 已删除",
  "success": true
}
```

不存在返回 `404`。

如果删除的是当前默认服务商，后端会自动切换为剩余列表中的第一个服务商（若有）。

---

## 通用数据结构与错误响应

### TextLine

```json
{
  "type": "me",
  "content": "推开了房门"
}
```

- `type`：`me` 或 `do`
- `content`：文本内容（不含 `/me` 或 `/do` 前缀）

### MessageResponse

```json
{
  "message": "操作成功",
  "success": true
}
```

### 错误响应

常见错误格式：

```json
{
  "detail": "错误描述"
}
```

或结构化对象：

```json
{
  "detail": {
    "message": "AI服务请求失败",
    "error_type": "APIStatusError",
    "provider_id": "openai"
  }
}
```

常见状态码：

| 状态码 | 含义 |
|--------|------|
| 400 | 请求参数错误 / 业务校验失败 |
| 401 | 未授权（Token 缺失或无效） |
| 404 | 资源不存在 |
| 422 | Pydantic 请求体验证失败 |
| 502 | 上游 AI 服务失败 |
