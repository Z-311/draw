'use client';

import { useRef, useState } from 'react';
import Board, { type BoardHandle } from './Board';
import ChatPanel from './ChatPanel';
import type { ApiError, Guess, Message } from '@/lib/types';

const nextId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const HINT = '新会话已开始 · 画完后点击画板右下角「让 AI 猜」';

type Attempt = {
  mode: 'guess' | 'chat';
  apiText: string;
  displayText?: string;
  pendingLabel: string;
};

export default function DrawingApp({ configured }: { configured: boolean }) {
  const boardRef = useRef<BoardHandle | null>(null);
  const lastAttemptRef = useRef<Attempt | null>(null);

  const [messages, setMessages] = useState<Message[]>(() => [
    { id: nextId(), role: 'system', text: HINT },
  ]);
  const [hasInk, setHasInk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [revealOn, setRevealOn] = useState(false);
  const [guessed, setGuessed] = useState(false);

  const push = (message: Omit<Message, 'id'>) => {
    const item: Message = { ...message, id: nextId() };
    setMessages((prev) => [...prev, item]);
    return item.id;
  };

  const buildHistory = () =>
    messages
      .filter(
        (message) =>
          (message.role === 'user' || message.role === 'assistant') &&
          !message.isError &&
          (message.text.trim().length > 0 || message.guess)
      )
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.guess
          ? `我猜这是：${message.guess.name}（把握${message.guess.confidence}）。${message.guess.reason}`
          : message.text,
      }))
      .slice(-4);

  const runRequest = async (
    mode: 'guess' | 'chat',
    apiText: string,
    options: {
      displayText?: string;
      addUser?: boolean;
      retryMessageId?: string;
      pendingLabel?: string;
    } = {}
  ) => {
    if (busy) return;

    if (!hasInk) {
      push({ role: 'system', text: '先画点什么，再让 AI 猜。' });
      return;
    }

    if (!configured) {
      push({
        role: 'system',
        text: '未检测到模型凭据（ARK_API_KEY / ARK_MODEL）。请先在 .env.local 中完成配置并重启本地服务。',
      });
      return;
    }

    const image = boardRef.current?.getImageDataUrl();
    if (!image) {
      push({ role: 'system', text: '先画点什么，再让 AI 猜。' });
      return;
    }

    const history = buildHistory();
    const {
      displayText,
      addUser = true,
      retryMessageId,
      pendingLabel,
    } = options;

    if (retryMessageId) {
      setMessages((prev) => prev.filter((item) => item.id !== retryMessageId));
    }
    if (addUser && displayText) {
      push({ role: 'user', text: displayText });
    }

    lastAttemptRef.current = {
      mode,
      apiText,
      displayText,
      pendingLabel: pendingLabel ?? (mode === 'guess' ? 'AI 正在看图…' : 'AI 正在想…'),
    };
    setBusy(true);
    setPending(
      pendingLabel ?? (mode === 'guess' ? 'AI 正在看图…' : 'AI 正在想…')
    );

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          image,
          history,
          text: mode === 'chat' ? apiText : '',
        }),
      });

      const data = (await response.json()) as {
        text?: string;
        guess?: Guess | null;
        error?: ApiError;
      };

      if (!response.ok || data.error) {
        const apiError: ApiError = data.error ?? {
          code: 'server',
          message: '服务异常，请稍后重试。',
        };
        throw apiError;
      }

      if (mode === 'guess') {
        setGuessed(true);
        if (data.guess) {
          push({ role: 'assistant', text: '', guess: data.guess });
        } else {
          push({
            role: 'assistant',
            text: data.text?.trim() || 'AI 这次没有给出判断，可以再试一次。',
          });
        }
      } else {
        push({
          role: 'assistant',
          text: data.text?.trim() || 'AI 这次没有给出回复，可以再试一次。',
        });
      }
    } catch (err) {
      const apiError =
        err && typeof err === 'object' && 'message' in err
          ? (err as ApiError)
          : { code: 'network', message: '请求失败：连接超时，请重试。' };

      push({
        role: 'assistant',
        text: apiError.message,
        isError: true,
        canRetry: true,
      });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const handleGuess = () => {
    void runRequest('guess', '', {
      addUser: false,
      pendingLabel: 'AI 正在看图…',
    });
  };

  const handleSend = (text: string) => {
    void runRequest('chat', text, {
      displayText: text,
      pendingLabel: 'AI 正在想…',
    });
  };

  const handleReveal = (answer: string) => {
    const display = `我画的是：${answer}`;
    void runRequest('chat', display, {
      displayText: display,
      pendingLabel: 'AI 正在复盘…',
    });
  };

  const handleRetry = (messageId: string) => {
    const attempt = lastAttemptRef.current;
    if (!attempt) return;
    void runRequest(attempt.mode, attempt.apiText, {
      displayText: attempt.displayText,
      addUser: false,
      retryMessageId: messageId,
      pendingLabel: attempt.pendingLabel,
    });
  };

  const handleClearSession = () => {
    setMessages([{ id: nextId(), role: 'system', text: HINT }]);
    setGuessed(false);
    setRevealOn(false);
    lastAttemptRef.current = null;
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>你画我猜 · AI 猜画</h1>
        <p>随便画点什么，让 AI 猜，然后围绕这幅画继续聊。</p>
      </header>

      {!configured && (
        <div className="config-banner">
          <span className="config-icon">▲</span>
          <span>
            未检测到模型凭据（<code>ARK_API_KEY</code> / <code>ARK_MODEL</code>）。
            请把 <code>.env.local.example</code> 复制为 <code>.env.local</code> 并填写，然后重启本地服务。
          </span>
        </div>
      )}

      <main className="workspace">
        <Board
          ref={boardRef}
          busy={busy}
          guessed={guessed}
          onGuess={handleGuess}
          onInkChange={setHasInk}
          onClearSession={handleClearSession}
        />
        <ChatPanel
          messages={messages}
          busy={busy}
          pending={pending}
          revealOn={revealOn}
          onToggleReveal={setRevealOn}
          onSend={handleSend}
          onReveal={handleReveal}
          onRetry={handleRetry}
        />
      </main>
    </div>
  );
}
