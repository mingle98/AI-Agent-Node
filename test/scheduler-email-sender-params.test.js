import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmailSenderTaskParams } from '../tools/scheduler.js';

test('normalizeEmailSenderTaskParams: 中文键 + 场景 report', () => {
  const [to, subject, content, scenario, att] = normalizeEmailSenderTaskParams({
    收件人: 'a@b.com',
    主题: 'T',
    内容: 'C',
    场景类型: 'report',
    附件路径: 'out/x.pdf',
  });
  assert.equal(to, 'a@b.com');
  assert.equal(subject, 'T');
  assert.equal(content, 'C');
  assert.equal(scenario, 'report');
  assert.equal(att, 'out/x.pdf');
});

test('normalizeEmailSenderTaskParams: 英文键 template/scenario', () => {
  const [, , , scenario] = normalizeEmailSenderTaskParams({
    to: 'x@y.com',
    subject: 's',
    content: 'body',
    template: 'alert',
  });
  assert.equal(scenario, 'alert');
});

test('normalizeEmailSenderTaskParams: 附件为对象数组', () => {
  const [, , , , att] = normalizeEmailSenderTaskParams({
    to: 'a@b.com',
    subject: 's',
    content: 'c',
    attachments: [{ path: 'f1.pdf' }, { path: 'f2.pdf' }],
  });
  assert.equal(att, 'f1.pdf, f2.pdf');
});

test('normalizeEmailSenderTaskParams: 空参数默认 custom', () => {
  const [, , , scenario] = normalizeEmailSenderTaskParams({});
  assert.equal(scenario, 'custom');
});

test('normalizeEmailSenderTaskParams: arg1..arg5 与技能顺序一致', () => {
  const [to, subj, body, sc, att] = normalizeEmailSenderTaskParams({
    arg1: '2293188960@qq.com',
    arg2: '前端开发学习任务书',
    arg3: '请查收附件。',
    arg4: 'report',
    arg5: 'tasks/frontend_task_book.pdf',
  });
  assert.equal(to, '2293188960@qq.com');
  assert.equal(subj, '前端开发学习任务书');
  assert.equal(body, '请查收附件。');
  assert.equal(sc, 'report');
  assert.equal(att, 'tasks/frontend_task_book.pdf');
});
