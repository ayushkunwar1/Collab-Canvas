'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';

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

function configureCanvas(canvas, width, height) {
  if (!canvas) return;

  const ratio = Math.min(window.devicePixelRatio || 1, 2);

  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext('2d');

  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.lineCap = 'round';
  context.lineJoin = 'round';
}

function clearCanvas(canvas, width, height) {
  if (!canvas) return;

  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
}

function drawAction(context, action) {
  if (!action) return;

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

  if (type === 'pen') {
    if (!points || points.length < 2) {
      context.restore();
      return;
    }

    context.strokeStyle = color;
    context.lineWidth = size;
    context.globalCompositeOperation = 'source-over';

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

    context.strokeStyle = '#ffffff';
    context.lineWidth = size;
    context.globalCompositeOperation = 'destination-out';

    context.beginPath();
    context.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i += 1) {
      context.lineTo(points[i].x, points[i].y);
    }

    context.stroke();
  }

  if (type === 'line') {
    context.strokeStyle = color;
    context.lineWidth = size;
    context.globalCompositeOperation = 'source-over';

    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x2, y2);
    context.stroke();
  }

  if (type === 'rectangle') {
    context.strokeStyle = color;
    context.lineWidth = size;
    context.globalCompositeOperation = 'source-over';

    context.strokeRect(
      Math.min(x, x2),
      Math.min(y, y2),
      Math.abs(x2 - x),
      Math.abs(y2 - y),
    );
  }

  if (type === 'circle') {
    const radius = Math.sqrt(
      Math.pow(x2 - x, 2) + Math.pow(y2 - y, 2),
    );

    context.strokeStyle = color;
    context.lineWidth = size;
    context.globalCompositeOperation = 'source-over';

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();
  }

  if (type === 'text' && text) {
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
    context.strokeStyle = '#ffffff';
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

function drawPreviewShape(context, action) {
  if (!context || !action) return;

  clearCanvas(
    context.canvas,
    context.canvas.clientWidth,
    context.canvas.clientHeight,
  );

  drawAction(context, action);
}

export default function CollaborativeCanvas({
  workspaceId,
  api,
  session,
}) {
  const baseCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const stageRef = useRef(null);
  const actionsRef = useRef([]);
  const drawingRef = useRef(false);
  const currentActionRef = useRef(null);
  const lastPointRef = useRef(null);
  const resizeObserverRef = useRef(null);

  const [actions, setActions] = useState([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#111827');
  const [size, setSize] = useState(4);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const getCanvasPoint = useCallback((event) => {
    const canvas = baseCanvasRef.current;

    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }, []);

  const renderBaseCanvas = useCallback(() => {
    const canvas = baseCanvasRef.current;

    if (!canvas) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    clearCanvas(canvas, width, height);

    const context = canvas.getContext('2d');

    for (const action of actionsRef.current) {
      drawAction(context, action);
    }
  }, []);

  const resizeCanvases = useCallback(() => {
    const stage = stageRef.current;
    const baseCanvas = baseCanvasRef.current;
    const previewCanvas = previewCanvasRef.current;

    if (!stage || !baseCanvas || !previewCanvas) return;

    const width = stage.clientWidth;
    const height = stage.clientHeight;

    configureCanvas(baseCanvas, width, height);
    configureCanvas(previewCanvas, width, height);

    renderBaseCanvas();
  }, [renderBaseCanvas]);

  const clearPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;

    if (!canvas) return;

    clearCanvas(
      canvas,
      canvas.clientWidth,
      canvas.clientHeight,
    );
  }, []);

  const saveAction = useCallback(async (action) => {
    if (!api || !workspaceId || !action) return;

    setSaving(true);

    try {
      await api.post(`/api/canvas/workspace/${workspaceId}`, {
        action,
      });
    } catch (err) {
      console.error(err);
      setError('Could not save drawing.');
    } finally {
      setSaving(false);
    }
  }, [api, workspaceId]);

  const loadCanvas = useCallback(async () => {
    if (!api || !workspaceId) return;

    setLoading(true);
    setError('');

    try {
      const response = await api.get(
        `/api/canvas/workspace/${workspaceId}`,
      );

      const loadedActions = response?.actions || response?.data || [];

      const normalized = Array.isArray(loadedActions)
        ? loadedActions.map((item) => item.action || item)
        : [];

      actionsRef.current = normalized;
      setActions(normalized);
    } catch (err) {
      console.error(err);
      setError('Could not load the canvas.');
    } finally {
      setLoading(false);
    }
  }, [api, workspaceId]);

  useEffect(() => {
    loadCanvas();
  }, [loadCanvas]);

  useEffect(() => {
    actionsRef.current = actions;
    renderBaseCanvas();
  }, [actions, renderBaseCanvas]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) return;

    resizeCanvases();

    const observer = new ResizeObserver(() => {
      resizeCanvases();
    });

    observer.observe(stage);
    resizeObserverRef.current = observer;

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
    };
  }, [resizeCanvases]);

  useEffect(() => {
    if (!api || !workspaceId || !api.supabase) return;

    const channel = api.supabase
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
          const incoming = payload?.new?.action;

          if (!incoming) return;

          const incomingId = payload?.new?.id;

          const alreadyExists = actionsRef.current.some(
            (action) => action.id && action.id === incomingId,
          );

          if (alreadyExists) return;

          const next = [
            ...actionsRef.current,
            {
              ...incoming,
              id: incomingId,
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

          if (!deletedId) return;

          const next = actionsRef.current.filter(
            (action) => action.id !== deletedId,
          );

          actionsRef.current = next;
          setActions(next);
        },
      )
      .subscribe();

    return () => {
      api.supabase.removeChannel(channel);
    };
  }, [api, workspaceId]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) return;

    const point = getCanvasPoint(event);

    if (!point) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);

    drawingRef.current = true;
    lastPointRef.current = point;

    if (tool === 'pen' || tool === 'eraser') {
      const action = {
        type: tool,
        color,
        size,
        points: [point],
      };

      currentActionRef.current = action;

      const context = baseCanvasRef.current?.getContext('2d');

      if (context) {
        context.beginPath();
        context.moveTo(point.x, point.y);
      }

      return;
    }

    if (
      tool === 'line' ||
      tool === 'rectangle' ||
      tool === 'circle'
    ) {
      currentActionRef.current = {
        type: tool,
        x: point.x,
        y: point.y,
        x2: point.x,
        y2: point.y,
        color,
        size,
      };

      return;
    }

    if (tool === 'text') {
      const text = window.prompt('Enter text');

      if (text?.trim()) {
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
        saveAction(action);
      }

      drawingRef.current = false;
      currentActionRef.current = null;
    }
  }, [
    color,
    getCanvasPoint,
    saveAction,
    size,
    tool,
  ]);

  const handlePointerMove = useCallback((event) => {
    if (!drawingRef.current) return;

    const point = getCanvasPoint(event);

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

      const context = baseCanvasRef.current?.getContext('2d');

      if (context) {
        drawSegment(
          context,
          tool,
          previous,
          point,
          color,
          size,
        );
      }

      lastPointRef.current = point;
      return;
    }

    if (
      tool === 'line' ||
      tool === 'rectangle' ||
      tool === 'circle'
    ) {
      const action = currentActionRef.current;

      if (!action) return;

      action.x2 = point.x;
      action.y2 = point.y;

      const previewCanvas = previewCanvasRef.current;

      if (previewCanvas) {
        const context = previewCanvas.getContext('2d');

        clearCanvas(
          previewCanvas,
          previewCanvas.clientWidth,
          previewCanvas.clientHeight,
        );

        drawAction(context, action);
      }

      lastPointRef.current = point;
    }
  }, [
    color,
    getCanvasPoint,
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
      (action.type === 'pen' || action.type === 'eraser') &&
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

    await saveAction(action);
  }, [clearPreview, saveAction]);

  const clearCanvasCompletely = useCallback(async () => {
    if (!api || !workspaceId) return;

    setError('');

    try {
      await api.delete(
        `/api/canvas/workspace/${workspaceId}`,
      );

      actionsRef.current = [];
      setActions([]);

      const baseCanvas = baseCanvasRef.current;

      if (baseCanvas) {
        clearCanvas(
          baseCanvas,
          baseCanvas.clientWidth,
          baseCanvas.clientHeight,
        );
      }

      clearPreview();
    } catch (err) {
      console.error(err);
      setError('Could not clear the canvas.');
    }
  }, [api, clearPreview, workspaceId]);

  const exportPNG = useCallback(() => {
    const canvas = baseCanvasRef.current;

    if (!canvas) return;

    const link = document.createElement('a');

    link.download = `collabcanvas-${workspaceId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [workspaceId]);

  const exportPDF = useCallback(() => {
    const canvas = baseCanvasRef.current;

    if (!canvas) return;

    const image = canvas.toDataURL('image/png');

    const pdf = new jsPDF({
      orientation:
        canvas.clientWidth >= canvas.clientHeight
          ? 'landscape'
          : 'portrait',
      unit: 'px',
      format: [
        canvas.clientWidth,
        canvas.clientHeight,
      ],
    });

    pdf.addImage(
      image,
      'PNG',
      0,
      0,
      canvas.clientWidth,
      canvas.clientHeight,
    );

    pdf.save(`collabcanvas-${workspaceId}.pdf`);
  }, [workspaceId]);

  return (
    <div className="canvas-container">
      <div className="canvas-toolbar">
        <div className="canvas-toolbar-group">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={
                tool === item.id
                  ? 'canvas-tool active'
                  : 'canvas-tool'
              }
              onClick={() => setTool(item.id)}
              title={item.label}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        <div className="canvas-toolbar-group">
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              className={
                color === item
                  ? 'canvas-color active'
                  : 'canvas-color'
              }
              style={{ backgroundColor: item }}
              onClick={() => setColor(item)}
              aria-label={`Color ${item}`}
            />
          ))}
        </div>

        <div className="canvas-size-control">
          <span>Size</span>

          <input
            type="range"
            min="1"
            max="30"
            value={size}
            onChange={(event) =>
              setSize(Number(event.target.value))
            }
          />

          <span>{size}px</span>
        </div>

        <div className="canvas-toolbar-group">
          <button
            type="button"
            className="canvas-action-button"
            onClick={clearCanvasCompletely}
          >
            Clear
          </button>

          <button
            type="button"
            className="canvas-action-button"
            onClick={exportPNG}
          >
            PNG
          </button>

          <button
            type="button"
            className="canvas-action-button"
            onClick={exportPDF}
          >
            PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="canvas-error">
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
          {actions.length} drawing
          {actions.length === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
