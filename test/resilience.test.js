import assert from "node:assert/strict";
import test from "node:test";

import { withTimeout, retryWithBackoff, CircuitBreaker, sleep } from "../agent/resilience.js";

test("sleep: should delay execution", async () => {
  const start = Date.now();
  await sleep(50);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 40, "Should delay at least 40ms");
});

test("withTimeout: should resolve when task finishes before timeout", async () => {
  const result = await withTimeout(Promise.resolve("ok"), 50, "t");
  assert.equal(result, "ok");
});

test("withTimeout: should reject when task exceeds timeout", async () => {
  await assert.rejects(
    () => withTimeout(new Promise((r) => setTimeout(() => r("late"), 50)), 10, "slow"),
    /slow timeout/
  );
});

test("withTimeout: should return task directly if timeoutMs is 0", async () => {
  const result = await withTimeout(Promise.resolve("immediate"), 0, "t");
  assert.equal(result, "immediate");
});

test("withTimeout: should return task directly if timeoutMs is negative", async () => {
  const result = await withTimeout(Promise.resolve("no-timeout"), -100, "t");
  assert.equal(result, "no-timeout");
});

test("retryWithBackoff: should retry until success", async () => {
  let calls = 0;
  const result = await retryWithBackoff(
    async () => {
      calls += 1;
      if (calls < 3) {
        throw new Error("no");
      }
      return "yes";
    },
    { maxAttempts: 3, baseDelayMs: 1 }
  );
  assert.equal(result, "yes");
  assert.equal(calls, 3);
});

test("retryWithBackoff: should throw after max attempts", async () => {
  let calls = 0;
  await assert.rejects(
    async () =>
      retryWithBackoff(
        async () => {
          calls += 1;
          throw new Error("always fails");
        },
        { maxAttempts: 2, baseDelayMs: 1 }
      ),
    /always fails/
  );
  assert.equal(calls, 2);
});

test("retryWithBackoff: should respect shouldRetry predicate", async () => {
  let calls = 0;
  const error = new Error("should stop");
  await assert.rejects(
    async () =>
      retryWithBackoff(
        async () => {
          calls += 1;
          throw error;
        },
        {
          maxAttempts: 5,
          baseDelayMs: 1,
          shouldRetry: (e) => e.message !== "should stop",
        }
      ),
    /should stop/
  );
  assert.equal(calls, 1);
});

test("retryWithBackoff: should use default options", async () => {
  const result = await retryWithBackoff(async () => "success");
  assert.equal(result, "success");
});

test("CircuitBreaker: should start in CLOSED state", () => {
  const cb = new CircuitBreaker();
  assert.equal(cb.state, "CLOSED");
  assert.equal(cb.canRequest(), true);
});

test("CircuitBreaker: should open after threshold failures", () => {
  const cb = new CircuitBreaker({ failureThreshold: 2 });
  cb.recordFailure();
  assert.equal(cb.state, "CLOSED"); // still closed after 1 failure
  cb.recordFailure();
  assert.equal(cb.state, "OPEN");
  assert.equal(cb.canRequest(), false);
});

test("CircuitBreaker: should allow request after cooldown in HALF_OPEN", async () => {
  const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 50 });
  cb.recordFailure();
  assert.equal(cb.state, "OPEN");
  assert.equal(cb.canRequest(), false);

  await sleep(60);
  assert.equal(cb.canRequest(), true); // transitions to HALF_OPEN
  assert.equal(cb.state, "HALF_OPEN");
});

test("CircuitBreaker: should close after successThreshold successes in HALF_OPEN", () => {
  const cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 0, successThreshold: 2 });
  cb.recordFailure(); // OPEN
  cb.canRequest(); // transition to HALF_OPEN

  cb.recordSuccess();
  assert.equal(cb.state, "HALF_OPEN"); // still half-open after 1 success
  cb.recordSuccess();
  assert.equal(cb.state, "CLOSED");
  assert.equal(cb.failureCount, 0);
});

test("CircuitBreaker: should reset failure count on success in CLOSED state", () => {
  const cb = new CircuitBreaker({ failureThreshold: 3 });
  cb.recordFailure();
  cb.recordFailure();
  assert.equal(cb.failureCount, 2);

  cb.recordSuccess();
  assert.equal(cb.failureCount, 0);
  assert.equal(cb.state, "CLOSED");
});

test("CircuitBreaker: should use default options", () => {
  const cb = new CircuitBreaker();
  assert.equal(cb.failureThreshold, 3);
  assert.equal(cb.cooldownMs, 15000);
  assert.equal(cb.successThreshold, 1);
});

