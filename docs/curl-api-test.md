# AI-Agent-Node 接口 curl 测试手册

本文用于快速使用 `curl` 测试本项目的问答接口。

## 0. 基本信息

- 服务地址: `http://HOST:PORT`
- 健康检查: `GET /health`
- 问答接口: `POST /api/chat`

如果你不确定 `HOST` / `PORT`，以启动服务时终端输出的:

- `🚀 Express API 服务已启动: http://HOST:PORT`

为准。

## 1) 健康检查

```bash
curl http://127.0.0.1:3000/health
```

预期: 返回 `ok` 或类似健康状态。

## 2) 纯文本问答（推荐）

本项目的 `/api/chat` **默认是非流式返回**（JSON）。

- **非流式**：不传 `isStream` 或传 `false`
- **流式（SSE）**：请求体里传 `"isStream": true`

非流式（JSON，一次性返回）：

```bash
curl -X POST 'http://127.0.0.1:3000/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "你好，介绍一下你能做什么？",
    "session_id": "curl-test-1"
  }'
```

流式（SSE，持续输出）：

```bash
curl -N -X POST 'http://127.0.0.1:3000/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "你好，介绍一下你能做什么？",
    "isStream": true,
    "session_id": "curl-test-1"
  }'
```

字段说明:

- `query`: 用户输入文本
- `session_id`: 可选，用于保持会话上下文

## 2.1) 工具触发示例（daily_news / analyze_chart）

说明：本项目的工具调用由 Agent 根据你的 `query` 自动决策。以下示例用于快速验证工具是否能被触发。

### 2.1.1 触发 `daily_news`（今日热点）

```bash
curl -X POST 'http://127.0.0.1:3000/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "今日热点有什么？",
    "session_id": "curl-tool-daily-news"
  }'
```

### 2.1.2 触发 `analyze_chart`（图表分析：Mermaid/ECharts）

```bash
curl -X POST 'http://127.0.0.1:3000/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "帮我分析这个 mermaid 图：graph TD\\nA-->B\\nB-->C，并总结关键路径",
    "session_id": "curl-tool-analyze-chart"
  }'
```

## 3) 带图片问答（图片 URL）

当请求体包含 `images` 且数组非空时，服务端会将输入组装为多模态消息:

- `text`: 来自 `query`
- `images`: 来自请求体的 `images`

```bash
curl -N -X POST 'http://127.0.0.1:3000/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "这张图里有什么？",
    "images": [
      "https://gips0.baidu.com/it/u=3602773692,1512483864&fm=3028&app=3028&f=JPEG&fmt=auto?w=960&h=1280"
    ],
    "isStream": true,
    "session_id": "curl-img-1"
  }'
```

注意:

- 图片 URL 必须能被模型侧访问（不能是内网/需要鉴权/临时失效链接）。

## 4) 带图片问答（base64）

你可以传 base64（不含换行）。Agent 会按需补齐 `data:image/jpeg;base64,` 前缀。

```bash
curl -N -X POST 'http://127.0.0.1:3000/api/chat' \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "识别图片内容",
    "images": ["<BASE64_STRING>"],
    "isStream": true,
    "session_id": "curl-b64-1"
  }'
```

## 5) 常用排查

### 5.1 没有流式输出/输出被卡住

- 确认请求体里是否传了 `"isStream": true`（不传则是非流式 JSON，一次性返回）
- 确认是否加了 `-N`（禁用 `curl` 缓冲，便于观察持续输出）
- 如果你用的是代理或网关，可能会对流式响应做缓冲
- 如果你用 Postman 测试，很多情况下对 SSE 支持不如 `curl` 直观，优先用 `curl -N`

### 5.2 图片解析失败

- 先用纯文本确认服务正常
- 换一个公共可访问图片 URL 再试
- 检查模型是否为支持多模态的模型（例如 DashScope 的多模态/omni 模型）

### 5.3 session 不生效

- 确保每次请求的 `session_id` 完全一致
- 如果服务重启，会话上下文会丢失
