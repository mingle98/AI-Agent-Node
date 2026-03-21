import assert from "node:assert/strict";
import test from "node:test";

import { buildSystemPrompt } from "../agent/promptBuilder.js";

test("buildSystemPrompt: should include tools, skills and rules", () => {
  const toolDefs = [
    {
      name: "t1",
      description: "d1",
      params: [{ name: "p1", type: "string", example: "x" }],
      example: 't1("x")',
    },
  ];
  const skillDefs = [
    {
      name: "s1",
      description: "sd1",
      functionality: "f1",
      params: [{ name: "k1", type: "string", example: "y", options: ["a", "b"] }],
      example: 's1("y")',
    },
  ];

  const prompt = buildSystemPrompt(toolDefs, skillDefs, { roleName: "R", roleDescription: "D" });
  assert.match(prompt, /你是一个R，D/);
  assert.match(prompt, /使用规则/);
  assert.match(prompt, /智能决策示例/);
  assert.match(prompt, /链式 onComplete 回调/);
  assert.match(prompt, /exec_code \/ script_generator \/ pdf_write \/ email_send/);
});
