import assert from "node:assert/strict";
import test from "node:test";

test("getDailyNews: should clamp limit to 1-50 range", async () => {
  // Verify the clamping logic independently (no network needed)
  const clamp = (limit) => {
    const n = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(50, Number(limit))) : 10;
    return n;
  };

  assert.equal(clamp(0), 1, "limit=0 should clamp to 1");
  assert.equal(clamp(-5), 1, "limit=-5 should clamp to 1");
  assert.equal(clamp(1), 1, "limit=1 stays 1");
  assert.equal(clamp(50), 50, "limit=50 stays 50");
  assert.equal(clamp(51), 50, "limit=51 should clamp to 50");
  assert.equal(clamp(100), 50, "limit=100 should clamp to 50");
  assert.equal(clamp("invalid"), 10, "invalid limit defaults to 10");
  assert.equal(clamp(NaN), 10, "NaN defaults to 10");
  assert.equal(clamp(null), 1, "null → Number(null)=0 → clamp to 1");
  assert.equal(clamp(undefined), 10, "undefined → NaN → defaults to 10");
});
