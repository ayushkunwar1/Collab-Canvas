'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { apiFetch } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { ErrorState } from './ErrorState';

const COLORS = ['#0f172a', '#2563eb', '#7c3aed', '#db2777', '#dc2626', '#16a34a', '#ca8a04'];

function uid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function pointForEvent(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return { x: 0, y: 0 };

  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

function drawAction(ctx, action, width, height) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (action.type === 'stroke' || action.type === 'eraser') {
    const points = action.points || [];
    if (!points.length) {
      ctx.restore();
      return;
    }

    if (action.type === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.strokeStyle = action.color || '#0f172a';
    }

    ctx.lineWidth = Math.max(1, action.size || 4);
    ctx.beginPath();
    ctx.moveTo(points[0].x * width, points[0].y * height);

    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x * width, points[i].y * height);
    }

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(
        points[0].x * width,
        points[0].y * height,
        Math.max(1, ctx.lineWidth / 2),
        0,
        Math.PI * 2,
      );
      if (action.type === 'stroke') ctx.fillStyle = action.color || '#0f172a';
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  if (action.type === 'rect' || action.type === 'circle') {
    const x1 = action.start.x * width;
    const y1 = action.start.y * height;
    const x2 = action.end.x * width;
    const y2 = action.end.y * height;
    const w = x2 - x1;
    const h = y2 - y1;

    ctx.strokeStyle = action.color || '#0f172a';
    ctx.lineWidth = Math.max(1, action.size || 4);

    if (action.type === 'rect') {
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(w), Math.abs(h));
    } else {
      ctx.beginPath();
      ctx.ellipse(
        x1 + w / 2,
        y1 + h / 2,
        Math.abs(w / 2),
        Math.abs(h / 2),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  }

  if (action.type === 'text') {
    ctx.fillStyle = action.color || '#0f172a';
    ctx.font = `500 ${Math.max(14, action.fontSize || 22)}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillText(action.text || '', action.x * width, action.y * height);
  }

  ctx.restore();
}

function renderCanvas(canvas, actions) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, rect.width, rect.height);

  for (const item of actions) {
    drawAction(ctx, item.action || item, rect.width, rect.height);
  }

  ctx.restore();
}

export default function CollaborativeCanvas({ workspaceId, canClear = false }) {
  const { user } = useAuth();
  const canvasRef = useRef(null);
  const drawingRef = useRef(null);
  const textRef = useRef(null);
  const [actions, setActions] = useState([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#0f172a');
  const [size, setSize] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [textEditor, setTextEditor] = useState(null);

  const load = useCallback(async () => {
    setError('');

    try {
      const result = await apiFetch(`/canvas/workspace/${workspaceId}`);
      setActions(result.actions || []);
    } catch (loadError) {
      setError(loadError.message || 'Unable to load the shared canvas.');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  useEffect(() => {
    if (!user) return undefined;

    const supabase = getSupabase();
    const channel = supabase
      .channel(`canvas-live-${workspaceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'canvas_actions',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => load(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, user, load]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const redraw = () => renderCanvas(canvas, actions);
    redraw();

    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);

    return () => observer.disconnect();
  }, [actions]);

  useEffect(() => {
    if (textEditor) {
      requestAnimationFrame(() => textRef.current?.focus());
    }
  }, [textEditor]);

  async function saveAction(action) {
    const localId = `local-${uid()}`;
    setActions((current) => [...current, { id: localId, action }]);
    setSaving(true);

    try {
      await apiFetch(`/canvas/workspace/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
    } catch (saveError) {
      setError(saveError.message || 'Unable to save canvas action.');
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function clearCanvas() {
    if (!window.confirm('Clear the shared canvas for everyone?')) return;

    setSaving(true);
    setError('');

    try {
      await apiFetch(`/canvas/workspace/${workspaceId}`, { method: 'DELETE' });
      setActions([]);
    } catch (clearError) {
      setError(clearError.message || 'Unable to clear the canvas.');
    } finally {
      setSaving(false);
    }
  }

  function handleDown(event) {
    if (event.button !== 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    if (tool === 'text') {
      const rect = canvas.getBoundingClientRect();
      const point = pointForEvent(event, canvas);

      setTextEditor({
        x: point.x,
        y: point.y,
        left: event.clientX - rect.left,
        top: event.clientY - rect.top,
        text: '',
      });

      return;
    }

    const point = pointForEvent(event, canvas);
    canvas.setPointerCapture?.(event.pointerId);

    if (tool === 'pen' || tool === 'eraser') {
      drawingRef.current = {
        kind: tool,
        points: [point],
      };
    } else {
      drawingRef.current = {
        kind: tool,
        start: point,
      };
    }
  }

  function handleMove(event) {
    const drawing = drawingRef.current;
    const canvas = canvasRef.current;

    if (!drawing || !canvas) return;

    const point = pointForEvent(event, canvas);

    if (drawing.kind === 'pen' || drawing.kind === 'eraser') {
      drawing.points.push(point);

      renderCanvas(canvas, [
        ...actions,
        {
          action: {
            type: drawing.kind === 'eraser' ? 'eraser' : 'stroke',
            points: drawing.points,
            ...(drawing.kind === 'pen' ? { color } : {}),
            size,
          },
        },
      ]);

      return;
    }

    renderCanvas(canvas, [
      ...actions,
      {
        action: {
          type: drawing.kind,
          start: drawing.start,
          end: point,
          color,
          size,
        },
      },
    ]);
  }

  async function handleUp(event) {
    const drawing = drawingRef.current;
    const canvas = canvasRef.current;

    if (!drawing || !canvas) return;

    const point = pointForEvent(event, canvas);

    if (drawing.kind === 'pen' || drawing.kind === 'eraser') {
      await saveAction({
        id: uid(),
        type: drawing.kind === 'eraser' ? 'eraser' : 'stroke',
        points: drawing.points,
        ...(drawing.kind === 'pen' ? { color } : {}),
        size,
      });
    } else {
      await saveAction({
        id: uid(),
        type: drawing.kind,
        start: drawing.start,
        end: point,
        color,
        size,
      });
    }

    drawingRef.current = null;
    renderCanvas(canvas, actions);
  }

  function finishText() {
    const text = textEditor?.text.trim();

    if (!text) {
      setTextEditor(null);
      return;
    }

    const current = textEditor;
    setTextEditor(null);

    void saveAction({
      id: uid(),
      type: 'text',
      x: current.x,
      y: current.y,
      text,
      color,
      fontSize: Math.max(18, size * 3),
    });
  }

  function cancelText() {
    setTextEditor(null);
  }

  function handleTextKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault();
      finishText();
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancelText();
    }
  }

  function exportPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `collabcanvas-${workspaceId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function exportPdf() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const image = canvas.toDataURL('image/png');
    const landscape = canvas.width >= canvas.height;
    const doc = new jsPDF({
      orientation: landscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pageWidth = landscape ? 297 : 210;
    const pageHeight = landscape ? 210 : 297;
    const margin = 8;
    const ratio = canvas.width / canvas.height;
    const maxWidth = pageWidth - margin * 2;
    const maxHeight = pageHeight - margin * 2;

    let width = maxWidth;
    let height = width / ratio;

    if (height > maxHeight) {
      height = maxHeight;
      width = height * ratio;
    }

    doc.addImage(
      image,
      'PNG',
      (pageWidth - width) / 2,
      (pageHeight - height) / 2,
      width,
      height,
      undefined,
      'FAST',
    );

    doc.save(`collabcanvas-${workspaceId}.pdf`);
  }

  if (loading) {
    return <div className="canvas-loading">Loading shared canvas…</div>;
  }

  return (
    <div className="canvas-workspace">
      <div className="canvas-toolbar">
        {['pen', 'eraser', 'rect', 'circle', 'text'].map((item) => (
          <button
            key={item}
            className={tool === item ? 'active' : ''}
            onClick={() => setTool(item)}
            title={item === 'eraser' ? 'Eraser' : item}
          >
            {item === 'pen' ? '✎' : item === 'eraser' ? '⌫' : item === 'rect' ? '▢' : item === 'circle' ? '○' : 'T'}
          </button>
        ))}

        <div className="canvas-divider" />

        {COLORS.map((item) => (
          <button
            key={item}
            className={`canvas-color ${color === item ? 'selected' : ''}`}
            style={{ background: item }}
            onClick={() => {
              setColor(item);
              if (tool === 'eraser') setTool('pen');
            }}
            aria-label={`Use color ${item}`}
          />
        ))}

        <label className="canvas-size">
          Size
          <input
            type="range"
            min="1"
            max="24"
            value={size}
            onChange={(event) => setSize(Number(event.target.value))}
          />
        </label>

        <span className="toolbar-spacer" />

        {saving ? <span className="canvas-saving">Saving…</span> : null}
        <button onClick={exportPng}>Export PNG</button>
        <button onClick={exportPdf}>Export PDF</button>
        {canClear ? <button onClick={clearCanvas}>Clear</button> : null}
      </div>

      {error ? <ErrorState message={error} onRetry={load} /> : null}

      <div className="canvas-stage">
        <canvas
          ref={canvasRef}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={() => {
            drawingRef.current = null;
            if (canvasRef.current) renderCanvas(canvasRef.current, actions);
          }}
        />

        {textEditor ? (
          <div
            className="canvas-text-editor"
            style={{
              left: textEditor.left,
              top: textEditor.top,
            }}
          >
            <input
              ref={textRef}
              value={textEditor.text}
              placeholder="Type your note…"
              onChange={(event) =>
                setTextEditor((current) => ({
                  ...current,
                  text: event.target.value,
                }))
              }
              onKeyDown={handleTextKeyDown}
            />
            <small>Enter to add · Esc to cancel</small>
          </div>
        ) : null}
      </div>
    </div>
  );
}
