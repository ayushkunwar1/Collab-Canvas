'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { getSupabase } from '@/lib/supabase';
import { apiFetch } from '@/lib/api';

const TOOLS = [
  { id: 'pen', label: 'Pen', icon: '✎' },
  { id: 'eraser', label: 'Eraser', icon: '⌫' },
  { id: 'line', label: 'Line', icon: '╱' },
  { id: 'rectangle', label: 'Rectangle', icon: '▭' },
  { id: 'circle', label: 'Circle', icon: '○' },
  { id: 'text', label: 'Text', icon: 'T' },
];

const COLORS = [
  '#111827',
  '#ef4444',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

function setupCanvas(canvas, width, height) {
  if (!canvas) return;

  const ratio = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));

  const context = canvas.getContext('2d');

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.lineCap = 'round';
  context.lineJoin = 'round';
}

function clearCanvas(canvas) {
  if (!canvas) return;

  const context = canvas.getContext('2d');

  context.clearRect(
    0,
    0,
    canvas.clientWidth,
    canvas.clientHeight,
  );
}

function drawAction(context, action) {
  if (!context || !action) return;

  const {
    type,
    x,
    y,
    x2,
    y2,
    points,
    color = '#111827',
    size = 4,
    text,
  } = action;

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = size;

  if (type === 'pen') {
    if (!points || points.length < 2) {
      context.restore();
      return;
    }

    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i += 1) {
      context.lineTo(points[i].x, points[i].y);
    }

    context.stroke();
  }

  if (type === 'eraser') {
    if (!points || points.length < 2) {
      context.restore();
      return;
    }

    context.globalCompositeOperation = 'destination-out';
    context.strokeStyle = '#000';
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i += 1) {
      context.lineTo(points[i].x, points[i].y);
    }

    context.stroke();
  }

  if (type === 'line') {
    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = color;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x2, y2);
    context.stroke();
  }

  if (type === 'rectangle') {
    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = color;

    context.strokeRect(
      Math.min(x, x2),
      Math.min(y, y2),
      Math.abs(x2 - x),
      Math.abs(y2 - y),
    );
  }

  if (type === 'circle') {
    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = color;

    const radius = Math.sqrt(
      (x2 - x) ** 2 + (y2 - y) ** 2,
    );

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
  }

  if (type === 'text' && text) {
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = color;
    context.font = `${Math.max(size * 5, 18)}px sans-serif`;
    context.textBaseline = 'top';
    context.fillText(text, x, y);
  }

  context.restore();
}

function drawSegment(context, type, from, to, color, size) {
  if (!context || !from || !to) return;

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = size;

  if (type === 'eraser') {
    context.globalCompositeOperation = 'destination-out';
    context.strokeStyle = '#000';
  } else {
    context.globalCompositeOperation = 'source-over';
    context.strokeStyle = color;
  }

  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();

  context.restore();
}

export default function CollaborativeCanvas({
  workspaceId,
  canClear = false,
}) {
  const baseCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const stageRef = useRef(null);

  const actionsRef = useRef([]);
  const drawingRef = useRef(false);
  const currentActionRef = useRef(null);
  const lastPointRef = useRef(null);

  const [actions, setActions] = useState([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#111827');
  const [size, setSize] = useState(4);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const renderBaseCanvas = useCallback(() => {
    const canvas = baseCanvasRef.current;

    if (!canvas) return;

    const context = canvas.getContext('2d');

    context.clearRect(
      0,
      0,
      canvas.clientWidth,
      canvas.clientHeight,
    );

    for (const action of actionsRef.current) {
      drawAction(context, action);
    }
  }, []);

  const resizeCanvas = useCallback(() => {
    const stage = stageRef.current;
    const baseCanvas = baseCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;

    if (!stage || !baseCanvas || !previewCanvas) return;

    const width = stage.clientWidth;
    const height = stage.clientHeight;

    setupCanvas(baseCanvas, width, height);
    setupCanvas(previewCanvas, width, height);

    renderBaseCanvas();
  }, [renderBaseCanvas]);

  const getPoint = useCallback((event) => {
    const canvas = baseCanvasRef.current;

    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const clearPreview = useCallback(() => {
    clearCanvas(previewCanvasRef.current);
  }, []);

  const loadCanvas = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    setError('');

    try {
      const result = await apiFetch(
        `/canvas/workspace/${workspaceId}`,
      );

      const loaded = Array.isArray(result?.actions)
        ? result.actions
        : [];

      const normalized = loaded.map((item) => ({
        ...item.action,
        id: item.id,
      }));

      actionsRef.current = normalized;
      setActions(normalized);
    } catch (err) {
      setError(
        err.message || 'Unable to load canvas.',
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadCanvas();
  }, [loadCanvas]);

  useEffect(() => {
    actionsRef.current = actions;
    renderBaseCanvas();
  }, [actions, renderBaseCanvas]);

  useEffect(() => {
    resizeCanvas();

    const observer = new ResizeObserver(() => {
      resizeCanvas();
    });

    if (stageRef.current) {
      observer.observe(stageRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, [resizeCanvas]);

  useEffect(() => {
    if (!workspaceId) return;

    const supabase = getSupabase();

    const channel = supabase
      .channel(`canvas-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'canvas_actions',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const incoming = payload?.new;

          if (!incoming?.action) return;

          const exists = actionsRef.current.some(
            (action) => action.id === incoming.id,
          );

          if (exists) return;

          const next = [
            ...actionsRef.current,
            {
              ...incoming.action,
              id: incoming.id,
            },
          ];

          actionsRef.current = next;
          setActions(next);
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'canvas_actions',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const deletedId = payload?.old?.id;

          if (!deletedId) {
            void loadCanvas();
            return;
          }

          const next = actionsRef.current.filter(
            (action) => action.id !== deletedId,
          );

          actionsRef.current = next;
          setActions(next);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, loadCanvas]);

  const saveAction = useCallback(async (action) => {
    try {
      setSaving(true);

      const result = await apiFetch(
        `/canvas/workspace/${workspaceId}`,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
          }),
        },
      );

      return result?.canvasAction || null;
    } catch (err) {
      setError(
        err.message || 'Unable to save drawing.',
      );

      return null;
    } finally {
      setSaving(false);
    }
  }, [workspaceId]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) return;

    const point = getPoint(event);

    if (!point) return;

    event.currentTarget.setPointerCapture?.(
      event.pointerId,
    );

    if (tool === 'text') {
      const text = window.prompt('Enter text');

      if (!text?.trim()) return;

      const action = {
        type: 'text',
        x: point.x,
        y: point.y,
        text: text.trim(),
        color,
        size,
      };

      actionsRef.current = [
        ...actionsRef.current,
        action,
      ];

      setActions([...actionsRef.current]);

      void saveAction(action);

      return;
    }

    drawingRef.current = true;
    lastPointRef.current = point;

    if (tool === 'pen' || tool === 'eraser') {
      currentActionRef.current = {
        type: tool,
        color,
        size,
        points: [point],
      };

      return;
    }

    currentActionRef.current = {
      type: tool,
      x: point.x,
      y: point.y,
      x2: point.x,
      y2: point.y,
      color,
      size,
    };
  }, [
    color,
    getPoint,
    saveAction,
    size,
    tool,
  ]);

  const handlePointerMove = useCallback((event) => {
    if (!drawingRef.current) return;

    const point = getPoint(event);

    if (!point) return;

    const previous = lastPointRef.current;

    if (!previous) {
      lastPointRef.current = point;
      return;
    }

    if (tool === 'pen' || tool === 'eraser') {
      const action = currentActionRef.current;

      if (!action) return;

      action.points.push(point);

      const context =
        baseCanvasRef.current?.getContext('2d');

      drawSegment(
        context,
        tool,
        previous,
        point,
        color,
        size,
      );

      lastPointRef.current = point;
      return;
    }

    const action = currentActionRef.current;

    if (!action) return;

    action.x2 = point.x;
    action.y2 = point.y;

    const previewCanvas = previewCanvasRef.current;

    if (!previewCanvas) return;

    const context = previewCanvas.getContext('2d');

    clearCanvas(previewCanvas);
    drawAction(context, action);

    lastPointRef.current = point;
  }, [
    color,
    getPoint,
    size,
    tool,
  ]);

  const handlePointerUp = useCallback(async (event) => {
    if (!drawingRef.current) return;

    drawingRef.current = false;

    event.currentTarget.releasePointerCapture?.(
      event.pointerId,
    );

    const action = currentActionRef.current;

    currentActionRef.current = null;
    lastPointRef.current = null;

    clearPreview();

    if (!action) return;

    if (
      (action.type === 'pen' ||
        action.type === 'eraser') &&
      action.points.length < 2
    ) {
      return;
    }

    if (
      (action.type === 'line' ||
        action.type === 'rectangle' ||
        action.type === 'circle') &&
      action.x === action.x2 &&
      action.y === action.y2
    ) {
      return;
    }

    actionsRef.current = [
      ...actionsRef.current,
      action,
    ];

    setActions([...actionsRef.current]);

    const saved = await saveAction(action);

    if (saved?.id) {
      const index = actionsRef.current.length - 1;

      const updated = {
        ...actionsRef.current[index],
        id: saved.id,
      };

      actionsRef.current[index] = updated;

      setActions([...actionsRef.current]);
    }
  }, [
    clearPreview,
    saveAction,
  ]);

  const clearCanvasCompletely = useCallback(async () => {
    if (!canClear) return;

    try {
      setError('');

      await apiFetch(
        `/canvas/workspace/${workspaceId}`,
        {
          method: 'DELETE',
        },
      );

      actionsRef.current = [];
      setActions([]);

      clearCanvas(baseCanvasRef.current);
      clearPreview();
    } catch (err) {
      setError(
        err.message || 'Unable to clear canvas.',
      );
    }
  }, [
    canClear,
    clearPreview,
    workspaceId,
  ]);

  const exportPNG = useCallback(() => {
    const canvas = baseCanvasRef.current;

    if (!canvas) return;

    const link = document.createElement('a');

    link.download =
      `collabcanvas-${workspaceId}.png`;

    link.href = canvas.toDataURL('image/png');

    link.click();
  }, [workspaceId]);

  const exportPDF = useCallback(() => {
    const canvas = baseCanvasRef.current;

    if (!canvas) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    const image = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation:
        width >= height
          ? 'landscape'
          : 'portrait',
      unit: 'px',
      format: [width, height],
    });

    pdf.addImage(
      image,
      'PNG',
      0,
      0,
      width,
      height,
    );

    pdf.save(
      `collabcanvas-${workspaceId}.pdf`,
    );
  }, [workspaceId]);

  return (
    <div className="canvas-workspace">
      <div className="canvas-toolbar">
        {TOOLS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={
              tool === item.id
                ? 'active'
                : ''
            }
            onClick={() => setTool(item.id)}
            title={item.label}
          >
            {item.icon}
            {item.label}
          </button>
        ))}

        <span className="canvas-divider" />

        {COLORS.map((item) => (
          <button
            key={item}
            type="button"
            className={
              color === item
                ? 'canvas-color selected'
                : 'canvas-color'
            }
            style={{
              backgroundColor: item,
            }}
            onClick={() => setColor(item)}
            aria-label={`Color ${item}`}
          />
        ))}

        <span className="canvas-divider" />

        <label className="canvas-size">
          Size
          <input
            type="range"
            min="1"
            max="30"
            value={size}
            onChange={(event) =>
              setSize(
                Number(event.target.value),
              )
            }
          />
          <span>{size}px</span>
        </label>

        <span className="toolbar-spacer" />

        {saving && (
          <span className="canvas-saving">
            Saving...
          </span>
        )}

        {canClear && (
          <button
            type="button"
            onClick={clearCanvasCompletely}
          >
            Clear
          </button>
        )}

        <button
          type="button"
          onClick={exportPNG}
        >
          PNG
        </button>

        <button
          type="button"
          onClick={exportPDF}
        >
          PDF
        </button>
      </div>

      {error && (
        <div className="error-state">
          {error}
        </div>
      )}

      <div
        ref={stageRef}
        className="canvas-stage"
      >
        <canvas
          ref={baseCanvasRef}
          className="canvas-base"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />

        <canvas
          ref={previewCanvasRef}
          className="canvas-preview"
        />

        {loading && (
          <div className="canvas-loading">
            Loading canvas...
          </div>
        )}
      </div>

      <div className="canvas-status">
        <span>
          {saving ? 'Saving...' : 'Saved'}
        </span>
        <span>
          {actions.length}{' '}
          {actions.length === 1
            ? 'drawing'
            : 'drawings'}
        </span>
      </div>
    </div>
  );
}
