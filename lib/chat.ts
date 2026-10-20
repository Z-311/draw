export type HistoryItem = {
  role: 'user' | 'assistant';
  content: string;
};

export type ParsedGuess = {
  name: string;
  confidence: string;
  reason: string;
};

export type UpstreamError = {
  httpStatus: number;
  code: string;
  message: string;
};

/**
 * 只保留最近 rounds 轮对话（一轮 = 用户 + AI 两条），并过滤空内容。
 */
export function trimHistory(items: unknown, rounds = 2): HistoryItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter(
      (item): item is HistoryItem =>
        Boolean(item) &&
        typeof item === 'object' &&
        (item as HistoryItem).role !== undefined &&
        ((item as HistoryItem).role === 'user' ||
          (item as HistoryItem).role === 'assistant') &&
        typeof (item as HistoryItem).content === 'string' &&
        (item as HistoryItem).content.trim().length > 0
    )
    .slice(-rounds * 2);
}

/**
 * 解析猜画结果；允许模型带 ```json 围栏，解析失败返回 null。
 */
export function parseGuess(raw: string): ParsedGuess | null {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as {
      guess?: unknown;
      confidence?: unknown;
      reason?: unknown;
    };
    const name = String(parsed.guess ?? '').trim();
    if (!name) return null;
    const confidenceRaw = String(parsed.confidence ?? '').trim();
    return {
      name: name.slice(0, 24),
      confidence: ['高', '中', '低'].includes(confidenceRaw)
        ? confidenceRaw
        : '中',
      reason: String(parsed.reason ?? '')
        .trim()
        .slice(0, 80),
    };
  } catch {
    return null;
  }
}

/**
 * 把上游的 HTTP 状态映射为面向用户的错误。
 */
export function mapUpstreamError(
  status: number,
  detail = ''
): UpstreamError {
  const suffix = detail ? ` 原因：${detail.slice(0, 160)}` : '';

  if (status === 401 || status === 403) {
    return {
      httpStatus: 502,
      code: 'auth',
      message: `模型凭据无效或该模型未开通。${suffix}`,
    };
  }
  if (status === 429) {
    return {
      httpStatus: 429,
      code: 'quota',
      message: `模型请求过于频繁或额度已用尽。${suffix}`,
    };
  }
  if (status === 400) {
    return {
      httpStatus: 400,
      code: 'bad_request',
      message: `模型拒绝了本次请求，请检查 ARK_MODEL 是否为支持图片输入的模型。${suffix}`,
    };
  }
  return {
    httpStatus: 502,
    code: 'server',
    message: `模型服务异常（HTTP ${status}）。${suffix}`,
  };
}
