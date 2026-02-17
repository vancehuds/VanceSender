# Windows 下使用 `start.bat` 教程

本文档说明如何在 Windows 环境使用 `start.bat` 启动 VanceSender。

## 适用环境

- Windows 10 / 11
- 已安装 Python 3.10+
- 项目目录包含 `start.bat`、`requirements.txt`、`main.py`

## `start.bat` 会自动做什么

执行 `start.bat` 后，脚本会按顺序执行：

1. 检测可用的 Python 命令（`py -3` / `python` / `python3`）
2. 校验 Python 版本是否 >= 3.10
3. 自动创建并启用 `.venv`（如果不存在）
4. 检查 `requirements.txt` 是否变化，必要时自动安装依赖
5. 自动创建 `data\presets` 目录（如果不存在）
6. 将参数透传给 `main.py` 并启动服务

## 启动方式

### 方式一：资源管理器双击

在项目根目录直接双击 `start.bat`。

适合第一次体验或日常默认启动。

### 方式二：命令行启动（推荐）

在项目根目录打开 CMD 或 PowerShell：

```bat
start.bat
```

## 常用参数

`start.bat` 会把参数原样传给 `main.py`。

```bat
:: 仅本机访问（默认）
start.bat

:: 开启局域网访问（监听 0.0.0.0）
start.bat --lan

:: 指定端口
start.bat --port 9000

:: 组合使用
start.bat --lan --port 9000
```

启动后默认地址：

- WebUI：`http://127.0.0.1:8730`
- API 文档：`http://127.0.0.1:8730/docs`

如果使用了 `--port`，请将地址中的端口替换为你的端口。

## 首次运行建议

1. 先准备配置文件：将 `config.yaml.example` 复制为 `config.yaml`
2. 再执行 `start.bat`
3. 进入 WebUI 后检查：
   - 发送设置（聊天键、延迟）
   - AI 服务商配置（如 OpenAI / DeepSeek / Ollama）

## 常见问题排查

### 1) 提示 `Python 3.10+ not found`

- 安装 Python 并勾选 PATH
- 或确认命令可用：

```bat
py -3 --version
python --version
```

### 2) 依赖安装失败

可先升级 pip 后重试：

```bat
python -m pip install --upgrade pip
pip install -r requirements.txt
```

如果网络不稳定，可切换镜像源重试（按需使用）。

### 3) 局域网无法访问

- 确认使用了 `start.bat --lan`
- 确认 Windows 防火墙已放行对应端口
- 同一局域网设备访问：`http://<你的局域网IP>:端口`

### 4) 端口被占用

改用其他端口：

```bat
start.bat --port 9000
```

### 5) 启动后窗口显示退出码

`start.bat` 末尾会显示退出码（`VanceSender exited with code ...`）。

- `0`：正常退出
- 非 `0`：启动或运行过程中出现异常，按提示信息排查

## 安全建议

如果使用 `--lan` 开启局域网访问，建议在 `config.yaml` 中配置 `server.token`，避免局域网内未授权访问 API。
