# VanceSender API 文档

Base URL: `http://127.0.0.1:8730/api/v1`

除 SSE 接口（`/send/batch`、`/ai/generate/stream`）外，请求和响应均使用 JSON 格式。也可通过 `http://127.0.0.1:8730/docs` 查看交互式 Swagger 文档。

---

## 目录

- [认证（可选）](#认证可选)
- [发送文本](#发送文本)
  - [发送单条文本](#发送单条文本)
  - [批量发送文本（SSE）](#批量发送文本sse)
  - [取消批量发送](#取消批量发送)
  - [获取发送状态](#获取发送状态)
- [AI 生成](#ai-生成)
  - [生成文本](#生成文本)
  - [流式生成文本（SSE）](#流式生成文本sse)
  - [测试服务商连接](#测试服务商连接)
- [预设管理](#预设管理)
  - [列出所有预设](#列出所有预设)
  - [创建预设](#创建预设)
  - [获取单个预设](#获取单个预设)
  - [更新预设](#更新预设)
  - [删除预设](#删除预设)
- [设置](#设置)
  - [获取全部设置](#获取全部设置)
  - [更新发送设置](#更新发送设置)
  - [更新服务器设置](#更新服务器设置)
  - [更新 AI 设置](#更新-ai-设置)
- [AI 服务商管理](#ai-服务商管理)
  - [列出所有服务商](#列出所有服务商)
  - [添加服务商](#添加服务商)
  - [更新服务商](#更新服务商)
  - [删除服务商](#删除服务商)
- [通用数据结构](#通用数据结构)

---

## 认证（可选）

当 `server.token` 为空时，API 不启用认证。

当 `server.token` 已配置后，所有 `/api/v1/*` 请求都需要携带以下请求头：

```http
Authorization: Bearer <your-token>
```

未携带或 Token 不匹配时会返回：

```json
{
  "detail": "未授权访问，请提供有效的 Token"
}
```

并包含响应头：

```http
WWW-Authenticate: Bearer
```

---

## 发送文本

### 发送单条文本

向 FiveM 聊天框发送一条文本消息。

```
POST /api/v1/send
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | string | 是 | 完整的发送文本，如 `/me 打开车门` |

**请求示例：**

```json
{
  "text": "/me 缓缓推开了房门"
}
```

**响应：**

```json
{
  "success": true,
  "text": "/me 缓缓推开了房门",
  "error": null
}
```

**错误情况：**

- 当前正在批量发送时会返回 `success: false`，`error` 字段包含原因。

---

### 批量发送文本（SSE）

批量发送多条文本，返回 Server-Sent Events 事件流用于实时跟踪进度。

```
POST /api/v1/send/batch
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `texts` | string[] | 是 | 文本列表，至少 1 条 |
| `delay_between` | int | 否 | 每条消息间隔（ms），范围 200–30000，留空使用配置默认值 |

**请求示例：**

```json
{
  "texts": [
    "/me 缓缓走向车辆",
    "/do 男子的脚步声在安静的停车场中回响",
    "/me 掏出车钥匙，按下解锁按钮",
    "/do 车辆发出\"哔\"的一声，车灯闪烁了两下"
  ],
  "delay_between": 2000
}
```

**响应：** `Content-Type: text/event-stream`

SSE 事件流中的每条消息格式为 `data: <JSON>\n\n`，包含以下事件类型：

**发送中事件：**

```
data: {"status": "sending", "index": 0, "total": 4, "text": "/me 缓缓走向车辆"}

data: {"status": "sending", "index": 1, "total": 4, "text": "/do 男子的脚步声在安静的停车场中回响"}
```

**完成事件：**

```
data: {"status": "completed", "total": 4, "sent": 4, "success": 4, "failed": 0}
```

**单条结果事件：**

```
data: {"status": "line_result", "index": 1, "total": 4, "success": true, "error": null, "text": "/do ..."}

data: {"status": "line_result", "index": 2, "total": 4, "success": false, "error": "未检测到 FiveM 在前台...", "text": "/me ..."}
```

**取消事件：**

```
data: {"status": "cancelled", "index": 2, "total": 4}
```

**冲突事件（已有任务运行中）：**

```
data: {"status": "error", "error": "已有批量发送任务进行中"}
```

---

### 取消批量发送

取消正在进行的批量发送任务。

```
POST /api/v1/send/stop
```

**请求体：** 无

**响应：**

```json
{
  "message": "已发送取消请求",
  "success": true
}
```

若当前没有正在进行的任务：

```json
{
  "message": "当前没有正在进行的批量发送",
  "success": false
}
```

---

### 获取发送状态

查询当前发送器的状态。

```
GET /api/v1/send/status
```

**响应：**

```json
{
  "sending": true,
  "progress": {
    "status": "sending",
    "index": 2,
    "total": 5,
    "text": "/do 门被缓缓推开"
  }
}
```

空闲时：

```json
{
  "sending": false,
  "progress": {}
}
```

---

## AI 生成

### 生成文本

使用 AI 服务商生成一套 `/me` `/do` 角色扮演文本。

```
POST /api/v1/ai/generate
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `scenario` | string | 是 | 场景描述 |
| `provider_id` | string | 否 | 使用的服务商 ID，留空使用默认 |
| `count` | int | 否 | 期望生成条数（1–30），留空由 AI 决定 |
| `text_type` | string | 否 | 文本类型：`"mixed"`（默认）、`"me"`、`"do"` |

**请求示例：**

```json
{
  "scenario": "一个侦探正在勘察一间被翻得乱七八糟的公寓",
  "count": 6,
  "text_type": "mixed"
}
```

**响应：**

```json
{
  "texts": [
    { "type": "me", "content": "推开半掩的房门，环顾四周" },
    { "type": "do", "content": "房间内一片狼藉，家具东倒西歪，地板上散落着碎玻璃" },
    { "type": "me", "content": "戴上手套，蹲下身仔细查看地面上的痕迹" },
    { "type": "do", "content": "地板上可以看到一串模糊的泥脚印，从窗户方向延伸过来" },
    { "type": "me", "content": "掏出手机拍下脚印的照片" },
    { "type": "do", "content": "手机快门声在安静的房间里格外清晰" }
  ],
  "provider_id": "deepseek"
}
```

**错误码：**

| 状态码 | 说明 |
|--------|------|
| 400 | 服务商配置错误或请求参数异常（如未配置默认服务商、provider_id 无效） |
| 502 | AI 上游服务请求失败 |

> `detail` 可能是结构化对象，常见字段包括 `message`、`error_type`、`provider_id`、`status_code`、`request_id`、`body`。

---

### 流式生成文本（SSE）

以 Server-Sent Events 流的形式实时返回 AI 生成内容。

```
POST /api/v1/ai/generate/stream
```

**请求体：** 与 [生成文本](#生成文本) 相同。

**响应：** `Content-Type: text/event-stream`

```
data: /me 推开

data: 半掩的房

data: 门，环顾四周

data: 
/do 房间内

data: 一片狼藉

data: [DONE]
```

每条 `data:` 为 AI 模型输出的一个文本片段，前端拼接后再解析。流结束时发送 `[DONE]`。

---

### 测试服务商连接

向指定 AI 服务商发送一个最小请求以验证连通性。

```
POST /api/v1/ai/test/{provider_id}
```

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `provider_id` | string | 服务商 ID |

**响应（成功）：**

```json
{
  "message": "连接成功: Hi",
  "success": true,
  "response": "Hi"
}
```

**响应（失败）：**

```json
{
  "message": "连接失败: Connection refused",
  "success": false,
  "error_type": "APIConnectionError",
  "status_code": null,
  "request_id": null,
  "body": null
}
```

返回 `404` 表示服务商不存在。

---

## 预设管理

### 列出所有预设

```
GET /api/v1/presets
```

**响应：**

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

```
POST /api/v1/presets
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 预设名称（1–100 字符） |
| `texts` | TextLine[] | 否 | 文本列表 |

**请求示例：**

```json
{
  "name": "搜查场景",
  "texts": [
    { "type": "me", "content": "掏出警徽亮明身份" },
    { "type": "do", "content": "金色的警徽在阳光下闪了一下" }
  ]
}
```

**响应：** `201 Created`

```json
{
  "id": "e5f6g7h8",
  "name": "搜查场景",
  "texts": [
    { "type": "me", "content": "掏出警徽亮明身份" },
    { "type": "do", "content": "金色的警徽在阳光下闪了一下" }
  ],
  "created_at": "2026-02-17T08:35:00+00:00",
  "updated_at": "2026-02-17T08:35:00+00:00"
}
```

---

### 获取单个预设

```
GET /api/v1/presets/{preset_id}
```

**响应：** 同上，单个预设对象。返回 `404` 若不存在。

---

### 更新预设

```
PUT /api/v1/presets/{preset_id}
```

**请求体：** 仅需包含要更新的字段。

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 否 | 新名称 |
| `texts` | TextLine[] | 否 | 新文本列表（整体替换） |

**请求示例：**

```json
{
  "name": "搜查场景 v2"
}
```

**响应：** 更新后的完整预设对象。

---

### 删除预设

```
DELETE /api/v1/presets/{preset_id}
```

**响应：**

```json
{
  "message": "预设 'e5f6g7h8' 已删除",
  "success": true
}
```

返回 `404` 若不存在。

---

## 设置

### 获取全部设置

```
GET /api/v1/settings
```

**响应：**

```json
{
  "server": {
    "host": "127.0.0.1",
    "port": 8730,
    "lan_access": false,
    "token_set": true
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
        "api_key_set": true,
        "model": "deepseek-chat"
      }
    ],
    "default_provider": "deepseek",
    "system_prompt": "你是一个FiveM角色扮演文本生成助手...",
    "custom_headers": {
      "User-Agent": "python-httpx/0.28.1",
      "X-Stainless-Lang": "",
      "X-Stainless-Package-Version": "",
      "X-Stainless-OS": "",
      "X-Stainless-Arch": "",
      "X-Stainless-Runtime": "",
      "X-Stainless-Runtime-Version": ""
    }
  }
}
```

> 注意：`api_key` 与 `server.token` 不会在此接口返回。会分别用 `api_key_set` 与 `token_set` 表示是否已配置。

---

### 更新发送设置

```
PUT /api/v1/settings/sender
```

**请求体：** 仅需包含要更新的字段。

| 字段 | 类型 | 范围 | 说明 |
|------|------|------|------|
| `method` | string | `"clipboard"` / `"typing"` | 发送方式 |
| `chat_open_key` | string | 单字符 | 打开聊天框按键（默认 `t`） |
| `delay_open_chat` | int | 50–5000 | 按 T 后延迟（ms） |
| `delay_after_paste` | int | 50–5000 | 粘贴后延迟（ms） |
| `delay_after_send` | int | 50–5000 | 发送后延迟（ms） |
| `delay_between_lines` | int | 200–30000 | 批量间隔（ms） |
| `focus_timeout` | int | 0–30000 | 等待 FiveM 前台窗口超时（ms） |
| `retry_count` | int | 0–5 | 单条发送失败后的重试次数 |
| `retry_interval` | int | 50–5000 | 每次重试前等待（ms） |
| `typing_char_delay` | int | 0–200 | typing 模式下每字符延迟（ms） |

**请求示例：**

```json
{
  "delay_open_chat": 500,
  "delay_between_lines": 2000
}
```

**响应：**

```json
{
  "message": "发送设置已更新",
  "success": true
}
```

---

### 更新服务器设置

```
PUT /api/v1/settings/server
```

**请求体：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `lan_access` | bool | 是否开启局域网访问 |
| `token` | string | API 访问令牌；设为空字符串可关闭鉴权 |

> 修改 `lan_access` 后需要重启服务生效。

**响应：**

```json
{
  "message": "服务器设置已更新，部分配置需重启生效",
  "success": true
}
```

---

### 更新 AI 设置

```
PUT /api/v1/settings/ai
```

**请求体：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `default_provider` | string | 默认服务商 ID |
| `system_prompt` | string | AI 系统提示词 |
| `custom_headers` | object | 自定义请求头；该字段更新时会整体替换而非深度合并 |

**请求示例：**

```json
{
  "default_provider": "openai",
  "system_prompt": "你是一个专业的FiveM角色扮演文本生成助手..."
}
```

若 `default_provider` 不存在，会返回 `400`。

**响应：**

```json
{
  "message": "AI设置已更新",
  "success": true
}
```

---

## AI 服务商管理

### 列出所有服务商

```
GET /api/v1/settings/providers
```

**响应：**

```json
[
  {
    "id": "deepseek",
    "name": "DeepSeek",
    "api_base": "https://api.deepseek.com/v1",
    "api_key_set": true,
    "model": "deepseek-chat"
  },
  {
    "id": "ollama",
    "name": "Ollama Local",
    "api_base": "http://localhost:11434/v1",
    "api_key_set": false,
    "model": "llama3"
  }
]
```

---

### 添加服务商

```
POST /api/v1/settings/providers
```

**请求体：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 否 | 自定义 ID，留空自动生成 |
| `name` | string | 是 | 显示名称 |
| `api_base` | string | 是 | API Base URL |
| `api_key` | string | 否 | API Key |
| `model` | string | 否 | 模型名称，默认 `gpt-4o` |

**请求示例：**

```json
{
  "id": "deepseek",
  "name": "DeepSeek",
  "api_base": "https://api.deepseek.com/v1",
  "api_key": "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
  "model": "deepseek-chat"
}
```

**响应：** `201 Created`

```json
{
  "id": "deepseek",
  "name": "DeepSeek",
  "api_base": "https://api.deepseek.com/v1",
  "api_key_set": true,
  "model": "deepseek-chat"
}
```

> 若当前没有默认服务商，新添加的服务商会自动设为默认。

---

### 更新服务商

```
PUT /api/v1/settings/providers/{provider_id}
```

**请求体：** 仅需包含要更新的字段。

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | 显示名称 |
| `api_base` | string | API Base URL |
| `api_key` | string | API Key |
| `model` | string | 模型名称 |

**响应：** 更新后的服务商对象。返回 `404` 若不存在。

---

### 删除服务商

```
DELETE /api/v1/settings/providers/{provider_id}
```

**响应：**

```json
{
  "message": "服务商 'deepseek' 已删除",
  "success": true
}
```

返回 `404` 若不存在。若删除的是默认服务商，会自动切换到剩余的第一个服务商。

---

## 通用数据结构

### TextLine

```json
{
  "type": "me",       // "me" 或 "do"
  "content": "推开了房门"  // 文本内容（不含 /me 或 /do 前缀）
}
```

### MessageResponse

大多数写操作的通用响应格式：

```json
{
  "message": "操作成功",
  "success": true
}
```

### 错误响应

API 使用标准 HTTP 状态码，错误响应格式为：

```json
{
  "detail": "错误描述信息"
}
```

或（部分接口）为结构化对象：

```json
{
  "detail": {
    "message": "AI服务请求失败",
    "error_type": "APIStatusError",
    "provider_id": "openai"
  }
}
```

| 状态码 | 含义 |
|--------|------|
| 400 | 请求参数错误 |
| 401 | 未授权（Token 缺失或无效） |
| 404 | 资源不存在 |
| 422 | 请求体验证失败（Pydantic 校验） |
| 502 | AI 服务商请求失败 |
