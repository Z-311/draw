'use client';

import { useEffect, useRef, useState } from 'react';
import type { Message } from '@/lib/types';

type Props = {
  messages: Message[];
  busy: boolean;
  pending: string | null;
  revealOn: boolean;
  onToggleReveal: (on: boolean) => void;
  onSend: (text: string) => void;
  onReveal: (answer: string) => void;
  onRetry: (messageId: string) => void;
};

const CHIP_CLASS: Record<string, string> = {
  高: 'chip high',
  中: 'chip mid',
  低: 'chip low',
};

export default function ChatPanel({
  messages,
  busy,
  pending,
  revealOn,
  onToggleReveal,
  onSend,
  onReveal,
  onRetry,
}: Props) {
  const [input, setInput] = useState('');
  const [answer, setAnswer] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  useEffect(() => {
    if (revealOn) inputRef.current?.focus();
  }, [revealOn]);

  const canSend = !busy && input.trim().length > 0;

  return (
    <aside className="chat-card">
      <div className="chat-head">
        <span className="chat-title">对话</span>
        <label className="switch">
          <input
            type="checkbox"
            checked={revealOn}
            onChange={(event) => onToggleReveal(event.target.checked)}
          />
          <span>揭晓答案</span>
        </label>
      </div>

      <div className="messages" ref={listRef}>
        {messages.map((message) => {
          if (message.role === 'system') {
            return (
              <div key={message.id} className="msg system">
                {message.text}
              </div>
            );
          }

          if (message.isError) {
            return (
              <div key={message.id} className="msg error">
                <div>{message.text}</div>
                {message.canRetry && (
                  <button
                    type="button"
                    className="retry-btn"
                    onClick={() => onRetry(message.id)}
                  >
                    重试
                  </button>
                )}
              </div>
            );
          }

          if (message.guess) {
            const guess = message.guess;
            return (
              <div key={message.id} className="msg assistant">
                <div className="guess-title">
                  我猜这是：{guess.name}
                  <span className={CHIP_CLASS[guess.confidence] ?? 'chip mid'}>
                    把握 {guess.confidence}
                  </span>
                </div>
                {guess.reason && (
                  <div className="guess-reason">{guess.reason}</div>
                )}
              </div>
            );
          }

          return (
            <div
              key={message.id}
              className={`msg ${
                message.role === 'user' ? 'user' : 'assistant'
              }`}
            >
              {message.text}
            </div>
          );
        })}

        {pending && (
          <div className="msg assistant typing">{pending}</div>
        )}
      </div>

      <div className="chat-foot">
        {revealOn && (
          <div className="reveal-row">
            <input
              type="text"
              maxLength={200}
              value={answer}
              placeholder="我画的是……（提交后 AI 会复盘）"
              onChange={(event) => setAnswer(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!busy && answer.trim()) {
                    onReveal(answer.trim());
                    setAnswer('');
                  }
                }
              }}
            />
            <button
              type="button"
              className="send-btn"
              disabled={busy || !answer.trim()}
              onClick={() => {
                if (!busy && answer.trim()) {
                  onReveal(answer.trim());
                  setAnswer('');
                }
              }}
            >
              揭晓
            </button>
          </div>
        )}

        <div className="input-row">
          <input
            ref={inputRef}
            type="text"
            maxLength={200}
            value={input}
            placeholder="就这幅画继续追问……"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                if (canSend) {
                  onSend(input.trim());
                  setInput('');
                }
              }
            }}
          />
          <button
            type="button"
            className="send-btn"
            disabled={!canSend}
            onClick={() => {
              if (canSend) {
                onSend(input.trim());
                setInput('');
              }
            }}
          >
            发送
          </button>
        </div>
      </div>
    </aside>
  );
}
