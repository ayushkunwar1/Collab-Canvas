'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import { apiFetch } from '@/lib/api';
import { getSupabase } from '@/lib/supabase';
import { useAuth } from './AuthProvider';
import { ErrorState } from './ErrorState';

const COLORS = [
  '#0f172a',
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#16a34a',
  '#ca8a04',
];

function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function getPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return { x: 0, y: 0 };
  }

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function configureCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return null;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);

  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (
    canvas.width !== pixelWidth ||
    canvas.height !== pixelHeight
  ) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return {
    ctx,
    width,
    height,
    dpr,
  };
}

function normalizePoint(point, width, height) {
  return {
    x: width ? point.x / width : 0,
    y: height ? point.y / height : 0,
  };
}

function denormalizePoint(point, width, height) {
  return {
    x: point.x * width,
    y: point.y * height,
  };
}

function normalizeAction(action, width, height) {
  if (!action) return null;

  const type = action.type;

  if (type === 'stroke' || type === 'eraser') {
    const points = action.points || [];

    return {
      ...action,
      points: points.map((point) => {
        if (
          point.x >= 0 &&
          point.x <= 1 &&
          point.y >= 0 &&
          point.y <= 1
        ) {
          return point;
        }

        return normalizePoint(point, width, height);
      }),
    };
  }

  if (
    type === 'line' ||
    type === 'rect' ||
    type === 'circle'
  ) {
    if (!action.start || !action.end) {
      return action;
    }

    const normalizedStart =
      action.start.x >= 0 &&
      action.start.x <= 1 &&
      action.start.y >= 0 &&
      action.start.y <= 1
        ? action.start
        : normalizePoint(action.start, width, height);

    const normalizedEnd =
      action.end.x >= 0 &&
      action.end.x <= 1 &&
      action.end.y >= 0 &&
      action.end.y <= 1
        ? action.end
        : normalizePoint(action.end, width, height);

    return {
      ...action,
      start: normalizedStart,
      end: normalizedEnd,
    };
  }

  if (type === 'text') {
    return {
      ...action,
      x:
        action.x >= 0 && action.x <= 1
          ? action.x
          : width
            ? action.x / width
            : 0,
      y:
        action.y >= 0 && action.y <= 1
          ? action.y
          : height
            ? action.y / height
            : 0,
    };
  }

  return action;
}

function drawAction(ctx, action, width, height) {
  if (!ctx || !action) return;

  ctx.save();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (
    action.type === 'stroke' ||
    action.type === 'eraser'
  ) {
    const points = action.points || [];

    if (!points.length) {
      ctx.restore();
      return;
    }

    const size = Math.max(1, action.size || 4);

    ctx.lineWidth = size;

    if (action.type === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = action.color || '#0f172a';
      ctx.fillStyle = action.color || '#0f172a';
    }

    const first = denormalizePoint(
      points[0],
      width,
      height,
    );

    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(
        first.x,
        first.y,
        Math.max(1, size / 2),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);

      for (let i = 1; i < points.length; i += 1) {
        const point = denormalizePoint(
          points[i],
          width,
          height,
        );

        ctx.lineTo(point.x, point.y);
      }

      ctx.stroke();
    }

    ctx.restore();
    return;
  }

  if (
    action.type === 'line' ||
    action.type === 'rect' ||
    action.type === 'circle'
  ) {
    if (!action.start || !action.end) {
      ctx.restore();
      return;
    }

    const start = denormalizePoint(
      action.start,
      width,
      height,
    );

    const end = denormalizePoint(
      action.end,
      width,
      height,
    );

    const x1 = start.x;
    const y1 = start.y;
    const x2 = end.x;
    const y2 = end.y;

    const w = x2 - x1;
    const h = y2 - y1;

    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = action.color || '#0f172a';
    ctx.lineWidth = Math.max(1, action.size || 4);

    if (action.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    if (action.type === 'rect') {
      ctx.strokeRect(
        Math.min(x1, x2),
        Math.min(y1, y2),
        Math.abs(w),
        Math.abs(h),
      );
    }

    if (action.type === 'circle') {
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

    ctx.restore();
    return;
  }

  if (action.type === 'text') {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = action.color || '#0f172a';

    ctx.font = `500 ${
      Math.max(14, action.fontSize || 22)
    }px Inter, system-ui, sans-serif`;

    ctx.textBaseline = 'top';

    ctx.fillText(
      action.text || '',
      action.x * width,
      action.y * height,
    );
  }

  ctx.restore();
}

function clearCanvas(canvas, width, height) {
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
}

function renderBaseCanvas(canvas, actions) {
  const result = configureCanvas(canvas);

  if (!result) return;

  const {
    ctx,
    width,
    height,
  } = result;

  clearCanvas(canvas, width, height);

  for (const item of actions) {
    const action = item.action || item;

    drawAction(
      ctx,
      action,
      width,
      height,
    );
  }
}

function drawSegment(
  canvas,
  from,
  to,
  color,
  size,
  eraser,
) {
  const result = configureCanvas(canvas);

  if (!result) return;

  const {
    ctx,
  } = result;

  ctx.save();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, size);

  if (eraser) {
    ctx.globalCompositeOperation =
      'destination-out';
  } else {
    ctx.globalCompositeOperation =
      'source-over';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
  }

  if (
    from.x === to.x &&
    from.y === to.y
  ) {
    ctx.beginPath();

    ctx.arc(
      from.x,
      from.y,
      Math.max(1, size / 2),
      0,
      Math.PI * 2,
    );

    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPreviewShape(
  canvas,
  drawing,
  point,
  color,
  size,
) {
  const result = configureCanvas(canvas);

  if (!result) return;

  const {
    ctx,
    width,
    height,
  } = result;

  ctx.clearRect(0, 0, width, height);

  ctx.save();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, size);
  ctx.strokeStyle = color;

  const x1 = drawing.start.x;
  const y1 = drawing.start.y;
  const x2 = point.x;
  const y2 = point.y;

  const w = x2 - x1;
  const h = y2 - y1;

  if (drawing.kind === 'line') {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  if (drawing.kind === 'rect') {
    ctx.strokeRect(
      Math.min(x1, x2),
      Math.min(y1, y2),
      Math.abs(w),
      Math.abs(h),
    );
  }

  if (drawing.kind === 'circle') {
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

  ctx.restore();
}

export default function CollaborativeCanvas({
  workspaceId,
  canClear = false,
}) {
  const { user } = useAuth();

  const baseCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const stageRef = useRef(null);

  const drawingRef = useRef(null);
  const textRef = useRef(null);
  const actionsRef = useRef([]);

  const [actions, setActions] = useState([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#0f172a');
  const [size, setSize] = useState(4);

  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState('');
  const [saving, setSaving] =
    useState(false);
  const [textEditor, setTextEditor] =
    useState(null);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  const load = useCallback(async () => {
    setError('');

    try {
      const result = await apiFetch(
        `/canvas/workspace/${workspaceId}`,
      );

      const canvas =
        baseCanvasRef.current;

      let width = 1;
      let height = 1;

      if (canvas) {
        const rect =
          canvas.getBoundingClientRect();

        width = rect.width || 1;
        height = rect.height || 1;
      }

      const nextActions =
        (result.actions || [])
          .map((item) => {
            const action =
              item.action || item;

            return {
              ...item,
              action:
                normalizeAction(
                  action,
                  width,
                  height,
                ),
            };
          });

      actionsRef.current =
        nextActions;

      setActions(nextActions);
    } catch (loadError) {
      setError(
        loadError.message ||
          'Unable to load the shared canvas.',
      );
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (user) {
      void load();
    }
  }, [user, load]);

  useEffect(() => {
    if (!user) return undefined;

    const supabase = getSupabase();

    const channel = supabase
      .channel(
        `canvas-live-${workspaceId}`,
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'canvas_actions',
          filter:
            `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const incoming =
            payload.new;

          if (!incoming) return;

          setActions((current) => {
            if (
              current.some(
                (item) =>
                  item.id ===
                  incoming.id,
              )
            ) {
              return current;
            }

            const next = [
              ...current,
              incoming,
            ];

            actionsRef.current =
              next;

            return next;
          });
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'canvas_actions',
          filter:
            `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const deletedId =
            payload.old?.id;

          if (!deletedId) {
            void load();
            return;
          }

          setActions((current) => {
            const next =
              current.filter(
                (item) =>
                  item.id !==
                  deletedId,
              );

            actionsRef.current =
              next;

            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(
        channel,
      );
    };
  }, [
    workspaceId,
    user,
    load,
  ]);

  const redraw = useCallback(() => {
    const base =
      baseCanvasRef.current;

    const preview =
      previewCanvasRef.current;

    if (base) {
      renderBaseCanvas(
        base,
        actionsRef.current,
      );
    }

    if (preview) {
      const result =
        configureCanvas(preview);

      if (result) {
        result.ctx.clearRect(
          0,
          0,
          result.width,
          result.height,
        );
      }
    }
  }, []);

  useEffect(() => {
    const stage =
      stageRef.current;

    if (!stage) return undefined;

    redraw();

    const observer =
      new ResizeObserver(() => {
        redraw();
      });

    observer.observe(stage);

    return () => {
      observer.disconnect();
    };
  }, [redraw]);

  useEffect(() => {
    if (!textEditor) return;

    requestAnimationFrame(() => {
      textRef.current?.focus();
    });
  }, [textEditor]);

  async function saveAction(action) {
    const localId =
      `local-${uid()}`;

    const optimisticAction = {
      id: localId,
      action,
    };

    setActions((current) => {
      const next = [
        ...current,
        optimisticAction,
      ];

      actionsRef.current =
        next;

      return next;
    });

    setSaving(true);

    try {
      await apiFetch(
        `/canvas/workspace/${workspaceId}`,
        {
          method: 'POST',
          body: JSON.stringify({
            action,
          }),
        },
      );
    } catch (saveError) {
      setError(
        saveError.message ||
          'Unable to save canvas action.',
      );

      await load();
    } finally {
      setSaving(false);
    }
  }

  function clearPreview() {
    const preview =
      previewCanvasRef.current;

    if (!preview) return;

    const result =
      configureCanvas(preview);

    if (!result) return;

    result.ctx.clearRect(
      0,
      0,
      result.width,
      result.height,
    );
  }

  function handleDown(event) {
    if (event.button !== 0) return;

    const canvas =
      baseCanvasRef.current;

    if (!canvas) return;

    const point =
      getPoint(event, canvas);

    if (tool === 'text') {
      const rect =
        canvas.getBoundingClientRect();

      setTextEditor({
        x: point.x,
        y: point.y,
        left:
          event.clientX -
          rect.left,
        top:
          event.clientY -
          rect.top,
        text: '',
      });

      return;
    }

    canvas.setPointerCapture?.(
      event.pointerId,
    );

    if (
      tool === 'pen' ||
      tool === 'eraser'
    ) {
      drawingRef.current = {
        kind: tool,
        points: [point],
        lastPoint: point,
      };

      drawSegment(
        canvas,
        point,
        point,
        color,
        size,
        tool === 'eraser',
      );

      return;
    }

    if (
      tool === 'line' ||
      tool === 'rect' ||
      tool === 'circle'
    ) {
      drawingRef.current = {
        kind: tool,
        start: point,
        lastPoint: point,
      };

      clearPreview();
    }
  }

  function handleMove(event) {
    const drawing =
      drawingRef.current;

    const canvas =
      baseCanvasRef.current;

    if (!drawing || !canvas) {
      return;
    }

    const point =
      getPoint(event, canvas);

    if (
      drawing.kind === 'pen' ||
      drawing.kind === 'eraser'
    ) {
      const previous =
        drawing.lastPoint;

      drawing.points.push(point);
      drawing.lastPoint = point;

      drawSegment(
        canvas,
        previous,
        point,
        color,
        size,
        drawing.kind === 'eraser',
      );

      return;
    }

    if (
      drawing.kind === 'line' ||
      drawing.kind === 'rect' ||
      drawing.kind === 'circle'
    ) {
      drawing.lastPoint = point;

      const preview =
        previewCanvasRef.current;

      if (!preview) return;

      drawPreviewShape(
        preview,
        drawing,
        point,
        color,
        size,
      );
    }
  }

  async function handleUp(event) {
    const drawing =
      drawingRef.current;

    const canvas =
      baseCanvasRef.current;

    if (!drawing || !canvas) {
      return;
    }

    const point =
      getPoint(event, canvas);

    drawingRef.current = null;

    canvas.releasePointerCapture?.(
      event.pointerId,
    );

    const rect =
      canvas.getBoundingClientRect();

    const width =
      rect.width || 1;

    const height =
      rect.height || 1;

    if (
      drawing.kind === 'pen' ||
      drawing.kind === 'eraser'
    ) {
      drawing.points.push(point);

      const normalizedPoints =
        drawing.points.map(
          (item) =>
            normalizePoint(
              item,
              width,
              height,
            ),
        );

      await saveAction({
        id: uid(),
        type:
          drawing.kind === 'eraser'
            ? 'eraser'
            : 'stroke',
        points:
          normalizedPoints,
        ...(drawing.kind === 'pen'
          ? { color }
          : {}),
        size,
      });

      return;
    }

    if (
      drawing.kind === 'line' ||
      drawing.kind === 'rect' ||
      drawing.kind === 'circle'
    ) {
      const normalizedStart =
        normalizePoint(
          drawing.start,
          width,
          height,
        );

      const normalizedEnd =
        normalizePoint(
          point,
          width,
          height,
        );

      clearPreview();

      await saveAction({
        id: uid(),
        type: drawing.kind,
        start: normalizedStart,
        end: normalizedEnd,
        color,
        size,
      });
    }
  }

  function handleCancel() {
    drawingRef.current = null;
    clearPreview();
  }

  async function submitText() {
    if (!textEditor) return;

    const text =
      textEditor.text.trim();

    if (!text) {
      setTextEditor(null);
      return;
    }

    const canvas =
      baseCanvasRef.current;

    if (!canvas) return;

    const rect =
      canvas.getBoundingClientRect();

    const width =
      rect.width || 1;

    const height =
      rect.height || 1;

    await saveAction({
      id: uid(),
      type: 'text',
      text,
      x: textEditor.x / width,
      y: textEditor.y / height,
      color,
      fontSize: Math.max(
        14,
        size * 4,
      ),
    });

    setTextEditor(null);
  }

  async function clearCanvas() {
    if (
      !window.confirm(
        'Clear the shared canvas for everyone?',
      )
    ) {
      return;
    }

    setSaving(true);
    setError('');

    try {
      await apiFetch(
        `/canvas/workspace/${workspaceId}`,
        {
          method: 'DELETE',
        },
      );

      actionsRef.current = [];
      setActions([]);

      clearPreview();

      const base =
        baseCanvasRef.current;

      if (base) {
        renderBaseCanvas(
          base,
          [],
        );
      }
    } catch (clearError) {
      setError(
        clearError.message ||
          'Unable to clear the canvas.',
      );
    } finally {
      setSaving(false);
    }
  }

  function exportPNG() {
    const canvas =
      baseCanvasRef.current;

    if (!canvas) return;

    const link =
      document.createElement('a');

    link.download =
      'collabcanvas.png';

    link.href =
      canvas.toDataURL(
        'image/png',
      );

    link.click();
  }

  function exportPDF() {
    const canvas =
      baseCanvasRef.current;

    if (!canvas) return;

    const image =
      canvas.toDataURL(
        'image/png',
      );

    const pdf =
      new jsPDF({
        orientation:
          canvas.clientWidth >=
          canvas.clientHeight
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

    pdf.save(
      'collabcanvas.pdf',
    );
  }

  return (
    <div className="canvas-workspace">
      <div className="canvas-toolbar">
        <button
          type="button"
          className={
            tool === 'pen'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTool('pen')
          }
        >
          ✎ Pen
        </button>

        <button
          type="button"
          className={
            tool === 'eraser'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTool('eraser')
          }
        >
          ⌫ Eraser
        </button>

        <button
          type="button"
          className={
            tool === 'line'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTool('line')
          }
        >
          ╱ Line
        </button>

        <button
          type="button"
          className={
            tool === 'rect'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTool('rect')
          }
        >
          □ Rectangle
        </button>

        <button
          type="button"
          className={
            tool === 'circle'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTool('circle')
          }
        >
          ○ Circle
        </button>

        <button
          type="button"
          className={
            tool === 'text'
              ? 'active'
              : ''
          }
          onClick={() =>
            setTool('text')
          }
        >
          T Text
        </button>

        <span className="canvas-divider" />

        <div className="canvas-color">
          {COLORS.map(
            (item) => (
              <button
                key={item}
                type="button"
                aria-label={`Color ${item}`}
                className={
                  color === item
                    ? 'active'
                    : ''
                }
                style={{
                  background:
                    item,
                }}
                onClick={() =>
                  setColor(item)
                }
              />
            ),
          )}
        </div>

        <select
          className="canvas-size"
          value={size}
          onChange={(event) =>
            setSize(
              Number(
                event.target.value,
              ),
            )
          }
        >
          <option value={2}>
            2px
          </option>
          <option value={4}>
            4px
          </option>
          <option value={6}>
            6px
          </option>
          <option value={10}>
            10px
          </option>
          <option value={16}>
            16px
          </option>
        </select>

        <span className="canvas-divider" />

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

        {canClear && (
          <button
            type="button"
            onClick={clearCanvas}
          >
            Clear
          </button>
        )}

        {saving && (
          <span className="canvas-saving">
            Saving...
          </span>
        )}
      </div>

      {error && (
        <ErrorState
          message={error}
          onRetry={load}
        />
      )}

      <div
        ref={stageRef}
        className="canvas-stage"
        onPointerCancel={
          handleCancel
        }
      >
        <canvas
          ref={baseCanvasRef}
          className="canvas-base"
          onPointerDown={
            handleDown
          }
          onPointerMove={
            handleMove
          }
          onPointerUp={
            handleUp
          }
        />

        <canvas
          ref={previewCanvasRef}
          className="canvas-preview"
        />

        {loading && (
          <div className="canvas-loading">
            Loading shared canvas...
          </div>
        )}

        {textEditor && (
          <div
            className="canvas-text-editor"
            style={{
              left:
                textEditor.left,
              top:
                textEditor.top,
            }}
          >
            <input
              ref={textRef}
              value={
                textEditor.text
              }
              onChange={(event) =>
                setTextEditor(
                  (current) => ({
                    ...current,
                    text:
                      event.target.value,
                  }),
                )
              }
              onKeyDown={(event) => {
                if (
                  event.key ===
                  'Enter'
                ) {
                  event.preventDefault();
                  void submitText();
                }

                if (
                  event.key ===
                  'Escape'
                ) {
                  setTextEditor(
                    null,
                  );
                }
              }}
              placeholder="Type..."
            />

            <button
              type="button"
              onClick={() =>
                void submitText()
              }
            >
              Add
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
