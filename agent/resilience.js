// ========== 韧性工具：超时、重试、熔断 ==========

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withTimeout(taskPromise, timeoutMs, label = "operation") {
  if (!timeoutMs || timeoutMs <= 0) {
    return taskPromise;
  }

  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export async function retryWithBackoff(fn, options = {}) {
  const {
    maxAttempts = 2,
    baseDelayMs = 200,
    maxDelayMs = 2000,
    factor = 2,
    shouldRetry = () => true,
  } = options;

  let attempt = 0;
  let lastError = null;

  while (attempt < maxAttempts) {
    try {
      return await fn(attempt + 1);
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        break;
      }
      const delay = Math.min(baseDelayMs * (factor ** (attempt - 1)), maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError;
}

export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 15000;
    this.successThreshold = options.successThreshold ?? 1;

    this.state = "CLOSED"; // CLOSED | OPEN | HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.nextTryAt = 0;
  }

  canRequest() {
    if (this.state === "CLOSED") {
      return true;
    }
    if (this.state === "OPEN") {
      if (Date.now() >= this.nextTryAt) {
        this.state = "HALF_OPEN";
        this.successCount = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    if (this.state === "HALF_OPEN") {
      this.successCount += 1;
      if (this.successCount >= this.successThreshold) {
        this.state = "CLOSED";
        this.failureCount = 0;
        this.successCount = 0;
      }
      return;
    }
    this.failureCount = 0;
  }

  recordFailure() {
    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.state = "OPEN";
      this.nextTryAt = Date.now() + this.cooldownMs;
    }
  }
}

// 会话级串行执行，避免同一会话并发写消息导致上下文污染
export function withSessionLock(session, task) {
  const previous = session.lock ?? Promise.resolve();
  const run = previous.catch(() => null).then(task);
  session.lock = run.catch(() => null);
  return run;
}
