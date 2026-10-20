import test from 'node:test';
import assert from 'node:assert/strict';
import { mapUpstreamError, parseGuess, trimHistory } from '../lib/chat.ts';

test('trimHistory 只保留最近 2 轮并过滤无效项', () => {
  const history = [
    { role: 'user', content: '第1问' },
    { role: 'assistant', content: '第1答' },
    { role: 'user', content: '第2问' },
    { role: 'assistant', content: '第2答' },
    { role: 'user', content: '第3问' },
    { role: 'assistant', content: '第3答' },
    { role: 'system', content: '不该被带上' },
    { role: 'user', content: '   ' },
  ];

  assert.deepEqual(trimHistory(history), [
    { role: 'user', content: '第2问' },
    { role: 'assistant', content: '第2答' },
    { role: 'user', content: '第3问' },
    { role: 'assistant', content: '第3答' },
  ]);
});

test('trimHistory 对非数组输入返回空数组', () => {
  assert.deepEqual(trimHistory(undefined), []);
  assert.deepEqual(trimHistory(null), []);
  assert.deepEqual(trimHistory('nope'), []);
});

test('parseGuess 解析标准 JSON', () => {
  const guess = parseGuess(
    '{"guess":"房子","confidence":"高","reason":"三角形屋顶"}'
  );
  assert.deepEqual(guess, {
    name: '房子',
    confidence: '高',
    reason: '三角形屋顶',
  });
});

test('parseGuess 兼容 markdown 代码围栏', () => {
  const guess = parseGuess(
    '```json\n{"guess":"猫","confidence":"中","reason":"尖耳朵"}\n```'
  );
  assert.equal(guess?.name, '猫');
  assert.equal(guess?.confidence, '中');
});

test('parseGuess 遇非法内容返回 null', () => {
  assert.equal(parseGuess('我猜不出来'), null);
  assert.equal(parseGuess(''), null);
  assert.equal(parseGuess('{"reason":"缺少 guess"}'), null);
});

test('parseGuess 兜底把握程度并截断超长字段', () => {
  const guess = parseGuess(
    JSON.stringify({
      guess: '一'.repeat(40),
      confidence: '极高',
      reason: '二'.repeat(100),
    })
  );
  assert.equal(guess?.name.length, 24);
  assert.equal(guess?.confidence, '中');
  assert.equal(guess?.reason.length, 80);
});

test('mapUpstreamError 映射凭据类错误', () => {
  const result = mapUpstreamError(401, 'invalid key');
  assert.equal(result.httpStatus, 502);
  assert.equal(result.code, 'auth');
  assert.match(result.message, /凭据无效/);
  assert.match(result.message, /invalid key/);
});

test('mapUpstreamError 映射限流与参数错误', () => {
  assert.equal(mapUpstreamError(429).code, 'quota');
  assert.equal(mapUpstreamError(429).httpStatus, 429);
  assert.equal(mapUpstreamError(400).code, 'bad_request');
  assert.equal(mapUpstreamError(400).httpStatus, 400);
});

test('mapUpstreamError 兜底为服务异常', () => {
  const result = mapUpstreamError(500);
  assert.equal(result.httpStatus, 502);
  assert.equal(result.code, 'server');
  assert.match(result.message, /HTTP 500/);
});
