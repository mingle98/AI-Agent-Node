function withTimeout(promiseFactory, timeoutMs, label = "operation") {
  if (!timeoutMs || timeoutMs <= 0) {
    return typeof promiseFactory === "function" ? promiseFactory() : promiseFactory;
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timer = null;
  const operation = typeof promiseFactory === "function"
    ? promiseFactory(controller?.signal)
    : promiseFactory;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller?.abort?.();
      reject(new Error(`${label} 超时: ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function normalizeHeaderValue(value) {
  return value == null ? "" : String(value);
}

function resolveEnvPlaceholders(value) {
  if (typeof value !== "string") {
    return value;
  }
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_, name) => process.env[name] || "");
}

function resolveHeaders(headers = {}) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const resolved = resolveEnvPlaceholders(normalizeHeaderValue(value));
    if (!resolved || /Bearer\s*$/i.test(resolved.trim())) {
      continue;
    }
    result[key] = resolved;
  }
  return result;
}

function safeJsonPreview(value, maxLength = 500) {
  try {
    const text = typeof value === "string" ? value : JSON.stringify(value);
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
  } catch {
    return String(value).slice(0, maxLength);
  }
}

function normalizeJsonRpcPayload(payload) {
  if (payload && typeof payload === "object" && "result" in payload) {
    return payload.result;
  }
  return payload;
}

export class StreamableHttpMcpClient {
  constructor(serverKey, serverConfig, options = {}) {
    this.serverKey = serverKey;
    this.config = serverConfig || {};
    this.baseUrl = this.config.baseUrl;
    this.headers = resolveHeaders(this.config.headers || {});
    this.sessionId = null;
    this.initTimeoutMs = options.initTimeoutMs || 15000;
    this.callTimeoutMs = options.callTimeoutMs || 60000;
    this.requestId = 0;
  }

  async request(method, params = undefined, timeoutMs = this.callTimeoutMs) {
    if (!this.baseUrl) {
      throw new Error(`MCP server ${this.serverKey} 缺少 baseUrl`);
    }

    const id = `${this.serverKey}-${++this.requestId}`;
    const body = {
      jsonrpc: "2.0",
      id,
      method,
    };
    if (params !== undefined) {
      body.params = params;
    }

    console.log(`🌐 [MCP:http] -> ${this.serverKey} ${method} id=${id} params=${safeJsonPreview(params || {}, 500)}`);
    const startedAt = Date.now();
    const response = await withTimeout((signal) => fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
        ...this.headers,
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }), timeoutMs, `MCP ${this.serverKey} ${method}`);
    const responseSessionId = response.headers.get("mcp-session-id");
    if (responseSessionId) {
      this.sessionId = responseSessionId;
    }

    const text = await response.text();
    console.log(`🌐 [MCP:http] <- ${this.serverKey} ${method} id=${id} status=${response.status} time=${Date.now() - startedAt}ms body=${safeJsonPreview(text, 500)}`);
    if (!response.ok) {
      throw new Error(`MCP ${this.serverKey} ${method} HTTP ${response.status}: ${text.slice(0, 500)}`);
    }

    const payload = parseMcpResponse(text, response.headers.get("content-type") || "");
    if (payload?.error) {
      const message = payload.error?.message || JSON.stringify(payload.error);
      throw new Error(`MCP ${this.serverKey} ${method} 返回错误: ${message}`);
    }
    return normalizeJsonRpcPayload(payload);
  }

  async notify(method, params = undefined, timeoutMs = this.callTimeoutMs) {
    if (!this.baseUrl) {
      throw new Error(`MCP server ${this.serverKey} 缺少 baseUrl`);
    }

    const body = {
      jsonrpc: "2.0",
      method,
    };
    if (params !== undefined) {
      body.params = params;
    }

    console.log(`🌐 [MCP:http] -> ${this.serverKey} ${method} notification`);
    const startedAt = Date.now();
    const response = await withTimeout((signal) => fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
        ...(this.sessionId ? { "Mcp-Session-Id": this.sessionId } : {}),
        ...this.headers,
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }), timeoutMs, `MCP ${this.serverKey} ${method}`);
    console.log(`🌐 [MCP:http] <- ${this.serverKey} ${method} notification status=${response.status} time=${Date.now() - startedAt}ms`);
    if (!response.ok) {
      throw new Error(`MCP ${this.serverKey} ${method} notification HTTP ${response.status}`);
    }
  }

  async initialize() {
    const result = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "AI-Agent-Node",
        version: "1.0.0",
      },
    }, this.initTimeoutMs).catch((error) => {
      if (/Method not found|not found|initialize/i.test(error.message)) {
        return null;
      }
      throw error;
    });

    await this.notify("notifications/initialized", undefined, this.initTimeoutMs).catch(() => null);
    return result;
  }

  async listTools() {
    const result = await this.request("tools/list", {}, this.initTimeoutMs);
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  async callTool(name, args = {}) {
    return this.request("tools/call", {
      name,
      arguments: args && typeof args === "object" ? args : {},
    }, this.callTimeoutMs);
  }
}

export class SseMcpClient extends StreamableHttpMcpClient {
  constructor(serverKey, serverConfig, options = {}) {
    super(serverKey, serverConfig, options);
    this.messageEndpoint = null;
    this.connectPromise = null;
    this.pendingRequests = new Map();
    this.sseAbortController = null;
  }

  async connect() {
    if (this.messageEndpoint) {
      return this.messageEndpoint;
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }
    if (!this.baseUrl) {
      throw new Error(`MCP server ${this.serverKey} 缺少 baseUrl`);
    }

    this.connectPromise = withTimeout(() => new Promise((resolve, reject) => {
      const failConnect = (error) => {
        this.connectPromise = null;
        this.sseAbortController?.abort?.();
        reject(error);
      };

      (async () => {
        try {
          this.sseAbortController = typeof AbortController === "function" ? new AbortController() : null;
          console.log(`🌐 [MCP:sse] connect ${this.serverKey} ${this.baseUrl}`);
          const response = await fetch(this.baseUrl, {
            method: "GET",
            headers: {
              Accept: "text/event-stream",
              ...this.headers,
            },
            ...(this.sseAbortController ? { signal: this.sseAbortController.signal } : {}),
          });

          if (!response.ok) {
            failConnect(new Error(`MCP ${this.serverKey} SSE 连接 HTTP ${response.status}`));
            return;
          }
          if (!response.body) {
            failConnect(new Error(`MCP ${this.serverKey} SSE 连接缺少响应流`));
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let resolvedEndpoint = false;

          const endpointTimer = setTimeout(() => {
            if (!resolvedEndpoint) {
              failConnect(new Error(`MCP ${this.serverKey} SSE 未返回 endpoint`));
            }
          }, this.initTimeoutMs);

          const handleEventBlock = (block) => {
            const eventLines = block.split(/\r?\n/);
            const eventName = eventLines
              .find((line) => line.startsWith("event:"))
              ?.slice(6)
              .trim() || "message";
            const data = eventLines
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("\n");

            if (!data) return;
            if (eventName === "endpoint") {
              clearTimeout(endpointTimer);
              this.messageEndpoint = new URL(data, this.baseUrl).toString();
              resolvedEndpoint = true;
              console.log(`🌐 [MCP:sse] endpoint ${this.serverKey} ${this.messageEndpoint}`);
              resolve(this.messageEndpoint);
              return;
            }
            if (data === "[DONE]") return;

            let payload;
            try {
              payload = JSON.parse(data);
            } catch (error) {
              console.warn(`⚠️ [MCP:sse] ${this.serverKey} 忽略无法解析的消息: ${error.message}`);
              return;
            }

            const pending = this.pendingRequests.get(payload?.id);
            if (!pending) return;
            this.pendingRequests.delete(payload.id);
            if (payload.error) {
              const message = payload.error?.message || JSON.stringify(payload.error);
              pending.reject(new Error(`MCP ${this.serverKey} 返回错误: ${message}`));
            } else {
              pending.resolve(normalizeJsonRpcPayload(payload));
            }
          };

          (async () => {
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const blocks = buffer.split(/\r?\n\r?\n/);
                buffer = blocks.pop() || "";
                blocks.forEach(handleEventBlock);
              }
            } catch (error) {
              if (error.name !== "AbortError") {
                console.warn(`⚠️ [MCP:sse] ${this.serverKey} 连接中断: ${error.message}`);
              }
            } finally {
              clearTimeout(endpointTimer);
              this.messageEndpoint = null;
              this.connectPromise = null;
              for (const pending of this.pendingRequests.values()) {
                pending.reject(new Error(`MCP ${this.serverKey} SSE 连接已关闭`));
              }
              this.pendingRequests.clear();
            }
          })();
        } catch (error) {
          failConnect(error);
        }
      })();
    }), this.initTimeoutMs, `MCP ${this.serverKey} SSE connect`);

    return this.connectPromise;
  }

  async request(method, params = undefined, timeoutMs = this.callTimeoutMs) {
    const endpoint = await this.connect();
    const id = `${this.serverKey}-${++this.requestId}`;
    const body = {
      jsonrpc: "2.0",
      id,
      method,
    };
    if (params !== undefined) {
      body.params = params;
    }

    console.log(`🌐 [MCP:sse] -> ${this.serverKey} ${method} id=${id} params=${safeJsonPreview(params || {}, 500)}`);
    const resultPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP ${this.serverKey} ${method} 超时: ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
        cleanup: () => clearTimeout(timer),
      });
    });

    const clearPendingRequest = () => {
      const pending = this.pendingRequests.get(id);
      if (pending) {
        pending.cleanup?.();
        this.pendingRequests.delete(id);
      }
    };

    const startedAt = Date.now();
    let response;
    try {
      response = await withTimeout((signal) => fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.headers,
        },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
      }), timeoutMs, `MCP ${this.serverKey} ${method}`);
    } catch (error) {
      clearPendingRequest();
      throw error;
    }

    const text = await response.text();
    console.log(`🌐 [MCP:sse] <- ${this.serverKey} ${method} id=${id} postStatus=${response.status} time=${Date.now() - startedAt}ms body=${safeJsonPreview(text, 500)}`);
    if (!response.ok) {
      const error = new Error(`MCP ${this.serverKey} ${method} HTTP ${response.status}: ${text.slice(0, 500)}`);
      clearPendingRequest();
      throw error;
    }

    return resultPromise;
  }

  async notify(method, params = undefined, timeoutMs = this.callTimeoutMs) {
    const endpoint = await this.connect();
    const body = {
      jsonrpc: "2.0",
      method,
    };
    if (params !== undefined) {
      body.params = params;
    }

    console.log(`🌐 [MCP:sse] -> ${this.serverKey} ${method} notification`);
    const response = await withTimeout((signal) => fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    }), timeoutMs, `MCP ${this.serverKey} ${method}`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`MCP ${this.serverKey} ${method} notification HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
  }
}

export function parseMcpResponse(text, contentType = "") {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return null;
  }

  try {
    if (contentType.includes("text/event-stream") || trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
      const events = trimmed.split(/\r?\n\r?\n/).map((eventBlock) => {
        const data = eventBlock
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean)
          .join("\n");
        return data;
      }).filter(Boolean);
      const jsonLine = [...events].reverse().find((line) => line !== "[DONE]");
      return jsonLine ? JSON.parse(jsonLine) : null;
    }

    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(`MCP 响应解析失败: ${error.message}; body=${safeJsonPreview(trimmed, 300)}`);
  }
}
