import { NextResponse } from 'next/server';
import { mapUpstreamError, parseGuess, trimHistory } from '@/lib/chat';

export const runtime = 'nodejs';

const BASE_URL =
  process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';

const SYSTEM_GUESS = `你是一个「你画我猜」游戏的猜画者。用户会给你一张手绘草图，可能很潦草。
你的任务：判断用户画的是什么。
要求：
1. 只输出一个 JSON 对象，不要输出 markdown 代码块，不要输出任何 JSON 以外的文字。
2. 格式：{"guess":"你认为画的是什么，不超过12个字","confidence":"高|中|低","reason":"一句话说明依据，不超过30字"}
3. 不要反问，不要拒绝，必须给出一个猜测。`;

const SYSTEM_CHAT = `你正在和用户玩「你画我猜」。用户会给你看他当前的画，并围绕这幅画提问或讨论。
规则：
1. 每一轮都会附上用户当前的画作，你始终能看到它。
2. 用中文回答，简洁自然，一般不超过 80 字。
3. 如果用户告诉你正确答案，请回顾你之前的猜测，指出你把什么看成了什么、可能的原因是什么。
4. 不要编造画中不存在的细节。`;

type ChatBody = {
  mode?: 'guess' | 'chat';
  image?: string;
  history?: unknown;
  text?: string;
};

type MessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

function error(code: string, message: string, status = 500) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function readText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text: unknown }).text ?? '');
        }
        return '';
      })
      .join('');
  }
  return '';
}

export async function POST(request: Request) {
  const apiKey = process.env.ARK_API_KEY;
  const model = process.env.ARK_MODEL;

  if (!apiKey || !model) {
    return error(
      'not_configured',
      '未检测到模型凭据（ARK_API_KEY / ARK_MODEL），请先在 .env.local 中完成配置并重启本地服务。'
    );
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return error('bad_request', '请求格式有误。', 400);
  }

  const mode = body.mode === 'chat' ? 'chat' : 'guess';
  const image = typeof body.image === 'string' ? body.image : '';
  const text = typeof body.text === 'string' ? body.text.trim() : '';

  if (!image.startsWith('data:image/png;base64,')) {
    return error('bad_request', '画作数据缺失，请重新绘制后再试。', 400);
  }

  // 只保留最近 2 轮（用户 + AI 各一条算一轮），并过滤空内容
  const history = trimHistory(body.history);

  const userText =
    mode === 'chat' ? text || '请围绕这幅画继续聊。' : '请猜猜我画的是什么。';

  const userContent: MessageContent = [
    { type: 'text', text: userText },
    { type: 'image_url', image_url: { url: image } },
  ];

  const messages = [
    { role: 'system', content: mode === 'guess' ? SYSTEM_GUESS : SYSTEM_CHAT },
    ...history.map((item) => ({ role: item.role, content: item.content })),
    { role: 'user', content: userContent },
  ];

  try {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: mode === 'guess' ? 0.6 : 0.8,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    const raw = await response.text();
    let payload: unknown = null;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const detail =
        payload &&
        typeof payload === 'object' &&
        'error' in payload &&
        payload.error &&
        typeof payload.error === 'object' &&
        'message' in payload.error
          ? String((payload.error as { message: unknown }).message)
          : '';

      const mapped = mapUpstreamError(response.status, detail);
      return error(mapped.code, mapped.message, mapped.httpStatus);
    }

    const content =
      payload && typeof payload === 'object' && 'choices' in payload
        ? (payload as { choices?: Array<{ message?: { content?: unknown } }> })
            .choices?.[0]?.message?.content
        : undefined;

    const reply = readText(content).trim();
    if (!reply) {
      return error('empty', 'AI 这次没有给出判断，可以再试一次。', 502);
    }

    if (mode === 'guess') {
      const guess = parseGuess(reply);
      if (guess) return NextResponse.json({ text: '', guess });
      return NextResponse.json({ text: reply, guess: null });
    }

    return NextResponse.json({ text: reply });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') {
      return error('timeout', '请求失败：连接模型服务超时，请重试。', 504);
    }
    return error('network', '请求失败：无法连接模型服务，请检查网络后重试。', 502);
  }
}
