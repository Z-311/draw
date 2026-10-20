'use client';

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { Stroke } from '@/lib/types';

export const LOGICAL_W = 800;
export const LOGICAL_H = 480;

const COLORS = [
  '#16181d',
  '#e5484d',
  '#f76b15',
  '#f5c518',
  '#30a46c',
  '#3b6ef6',
  '#8e4ec6',
  '#8b5e34',
];

const SIZES = [
  { value: 2, label: '细' },
  { value: 4, label: '中' },
  { value: 8, label: '粗' },
  { value: 16, label: '特粗' },
];

export type BoardHandle = {
  getImageDataUrl: () => string | null;
};

type Props = {
  busy: boolean;
  guessed: boolean;
  onGuess: () => void;
  onInkChange: (hasInk: boolean) => void;
  onClearSession: () => void;
};

function drawStroke(ctx: CanvasRenderingContext2D, stroke: Stroke) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  ctx.fillStyle = stroke.color;
  ctx.lineWidth = stroke.size;

  const pts = stroke.points;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, stroke.size / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

const Board = forwardRef<BoardHandle, Props>(function Board(
  { busy, guessed, onGuess, onInkChange, onClearSession },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(4);
  const [clearArmed, setClearArmed] = useState(false);

  const strokesRef = useRef<Stroke[]>([]);
  const redoRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const currentRef = useRef<Stroke | null>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const k = canvas.width / LOGICAL_W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    strokesRef.current.forEach((stroke) => drawStroke(ctx, stroke));
  };

  const fit = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    redraw();
  };

  useEffect(() => {
    strokesRef.current = strokes;
    redraw();
    onInkChange(strokes.length > 0);
  }, [strokes, onInkChange]);

  useEffect(() => {
    redoRef.current = redoStack;
  }, [redoStack]);

  useEffect(() => {
    fit();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      getImageDataUrl() {
        if (strokesRef.current.length === 0) return null;
        const offscreen = document.createElement('canvas');
        offscreen.width = LOGICAL_W;
        offscreen.height = LOGICAL_H;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return null;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
        strokesRef.current.forEach((stroke) => drawStroke(ctx, stroke));
        return offscreen.toDataURL('image/png');
      },
    }),
    []
  );

  const toLogical = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * LOGICAL_W,
      y: ((event.clientY - rect.top) / rect.height) * LOGICAL_H,
    };
  };

  const handlePointerDown = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    event.preventDefault();
    const canvas = event.currentTarget;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* 忽略不支持指针捕获的环境 */
    }

    const stroke: Stroke = {
      color: tool === 'eraser' ? '#ffffff' : color,
      size: tool === 'eraser' ? size * 4 : size,
      points: [toLogical(event)],
    };

    currentRef.current = stroke;
    drawingRef.current = true;
    setRedoStack([]);
    redoRef.current = [];

    const ctx = canvas.getContext('2d');
    if (ctx) drawStroke(ctx, stroke);
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLCanvasElement>
  ) => {
    if (!drawingRef.current) return;
    const stroke = currentRef.current;
    if (!stroke) return;

    event.preventDefault();
    const point = toLogical(event);
    const prev = stroke.points[stroke.points.length - 1];
    stroke.points.push(point);

    const ctx = event.currentTarget.getContext('2d');
    if (!ctx) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const finishStroke = () => {
    if (!drawingRef.current) return;
    const stroke = currentRef.current;
    drawingRef.current = false;
    currentRef.current = null;
    if (stroke) setStrokes((prev) => [...prev, stroke]);
  };

  const undo = () => {
    if (strokes.length === 0) return;
    const last = strokes[strokes.length - 1];
    setStrokes(strokes.slice(0, -1));
    setRedoStack((prev) => {
      const next = [...prev, last];
      redoRef.current = next;
      return next;
    });
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1];
    setRedoStack(redoStack.slice(0, -1));
    setStrokes((prev) => [...prev, last]);
  };

  const disarmClear = () => {
    setClearArmed(false);
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  const handleClear = () => {
    if (busy) return;
    if (!clearArmed) {
      setClearArmed(true);
      clearTimerRef.current = setTimeout(() => {
        setClearArmed(false);
        clearTimerRef.current = null;
      }, 3000);
      return;
    }
    disarmClear();
    setStrokes([]);
    setRedoStack([]);
    redoRef.current = [];
    onClearSession();
  };

  const hasInk = strokes.length > 0;

  return (
    <div className="board-card">
      <div className="toolbar">
        <div className="tb-group">
          {COLORS.map((value) => (
            <button
              key={value}
              type="button"
              className="swatch"
              style={{ background: value }}
              aria-label={`颜色 ${value}`}
              aria-pressed={tool === 'pen' && color === value}
              onClick={() => {
                setColor(value);
                setTool('pen');
              }}
            />
          ))}
        </div>

        <span className="divider" />

        <div className="tb-group">
          {SIZES.map((item) => (
            <button
              key={item.value}
              type="button"
              className="tool-btn"
              aria-pressed={size === item.value}
              onClick={() => setSize(item.value)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <span className="divider" />

        <div className="tb-group">
          <button
            type="button"
            className="tool-btn"
            aria-pressed={tool === 'pen'}
            onClick={() => setTool('pen')}
          >
            画笔
          </button>
          <button
            type="button"
            className="tool-btn"
            aria-pressed={tool === 'eraser'}
            onClick={() => setTool('eraser')}
          >
            橡皮
          </button>
        </div>

        <span className="divider" />

        <div className="tb-group">
          <button
            type="button"
            className="tool-btn"
            disabled={strokes.length === 0}
            onClick={undo}
          >
            撤销
          </button>
          <button
            type="button"
            className="tool-btn"
            disabled={redoStack.length === 0}
            onClick={redo}
          >
            重做
          </button>
          <button
            type="button"
            className={`tool-btn${clearArmed ? ' armed' : ''}`}
            onClick={handleClear}
          >
            {clearArmed ? '确认清空？' : '清空'}
          </button>
        </div>
      </div>

      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          className="canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
          onPointerLeave={finishStroke}
        />
        <button
          type="button"
          className={`guess-btn${hasInk ? '' : ' muted'}`}
          disabled={busy}
          onClick={onGuess}
        >
          {busy ? 'AI 正在看图…' : guessed ? '再猜一次' : '让 AI 猜'}
        </button>
      </div>
    </div>
  );
});

export default Board;
