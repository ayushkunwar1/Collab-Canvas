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

function pointForEvent(event, canvas) {
  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return { x: 0, y: 0 };
  }

  return {
    x: Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    ),
    y: Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height),
    ),
  };
}


function configureCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) {
    return null;
  }

  const dpr = window.devicePixelRatio || 1;

  const width = Math.floor(rect.width * dpr);
  const height = Math.floor(rect.height * dpr);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return {
    ctx,
    width: rect.width,
    height: rect.height,
  };
}

function drawAction(ctx, action, width, height) {
  if (!action) return;

  ctx.save();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';


  if (action.type === 'stroke' || action.type === 'eraser') {
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
    }

    if (points.length === 1) {
      ctx.beginPath();

      ctx.arc(
        points[0].x * width,
        points[0].y * height,
        Math.max(1, size / 2),
        0,
        Math.PI * 2,
      );

      if (action.type === 'stroke') {
        ctx.fillStyle = action.color || '#0f172a';
      }

      ctx.fill();
    } else {
      ctx.beginPath();

      ctx.moveTo(
        points[0].x * width,
        points[0].y * height,
      );

      for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(
          points[i].x * width,
          points[i].y * height,
        );
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

    const x1 = action.start.x * width;
    const y1 = action.start.y * height;
    const x2 = action.end.x * width;
    const y2 = action.end.y * height;

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



function renderBaseCanvas(canvas, actions) {
  const result = configureCanvas(canvas);

  if (!result) return;

  const { ctx, width, height } = result;

  ctx.clearRect(0, 0, width, height);

  ctx.globalCompositeOperation = 'source-over';

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  for (const item of actions) {
    drawAction(
      ctx,
      item.action || item,
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
  eraser = false,
) {
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;

  ctx.save();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1, size);

  if (eraser) {
    ctx.globalCompositeOperation = 'destination-out';
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = color;
  }

  const fromX = from.x * rect.width;
  const fromY = from.y * rect.height;
  const toX = to.x * rect.width;
  const toY = to.y * rect.height;

  if (fromX === toX && fromY === toY) {
    ctx.beginPath();
    ctx.arc(
      fromX,
      fromY,
      Math.max(1, size / 2),
      0,
      Math.PI * 2,
    );
    if (eraser) {
      ctx.globalCompositeOperation = 'destination-out';
    } else {
      ctx.fillStyle = color;
    }
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();
  }

  ctx.restore();
}



function drawPreviewShape(canvas, action) {
  const ctx = canvas.getContext('2d');

  if (!ctx) return;

  const rect = canvas.getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  const dpr = window.devicePixelRatio || 1;

  ctx.save();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.lineWidth = Math.max(
    1,
    action.size || 4,
  );

  ctx.strokeStyle =
    action.color || '#0f172a';

  const x1 =
    action.start.x * rect.width;

  const y1 =
    action.start.y * rect.height;

  const x2 =
    action.end.x * rect.width;

  const y2 =
    action.end.y * rect.height;

  const w = x2 - x1;
  const h = y2 - y1;

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
}



export default function CollaborativeCanvas({
  workspaceId,
  canClear = false,
}) {
  const { user } = useAuth();

  const baseCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);

  const drawingRef = useRef(null);
  const textRef = useRef(null);

  const actionsRef = useRef([]);

  const [actions, setActions] = useState([]);

  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#0f172a');
  const [size, setSize] = useState(4);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [textEditor, setTextEditor] = useState(null);


  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);


  const load = useCallback(async () => {
    setError('');

    try {
      const result = await apiFetch(
        `/canvas/workspace/${workspaceId}`,
      );

      const nextActions =
        result.actions || [];

      actionsRef.current = nextActions;

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
            const alreadyExists =
              current.some(
                (item) =>
                  item.id === incoming.id,
              );

            if (alreadyExists) {
              return current;
            }

            const next = [
              ...current,
              incoming,
            ];

            actionsRef.current = next;

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
                  item.id !== deletedId,
              );

            actionsRef.current = next;

            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, user, load]);



  useEffect(() => {
    const canvas =
      baseCanvasRef.current;

    if (!canvas) return undefined;

    const redraw = () => {
      renderBaseCanvas(
        canvas,
        actionsRef.current,
      );

      const preview =
        previewCanvasRef.current;

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
    };

    redraw();

    const observer =
      new ResizeObserver(redraw);

    observer.observe(canvas);

    return () =>
      observer.disconnect();
  }, [actions]);



  useEffect(() => {
    if (!textEditor) return;

    requestAnimationFrame(() => {
      textRef.current?.focus();
    });
  }, [textEditor]);



  async function saveAction(action) {
    const localId = `local-${uid()}`;

    const optimisticAction = {
      id: localId,
      action,
    };

    setActions((current) => {
      const next = [
        ...current,
        optimisticAction,
      ];

      actionsRef.current = next;

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

      const preview =
        previewCanvasRef.current;

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
    } catch (clearError) {
      setError(
        clearError.message ||
          'Unable to clear the canvas.',
      );
    } finally {
      setSaving(false);
    }
  }



  function handleDown(event) {
    if (event.button !== 0) return;

    const canvas =
      baseCanvasRef.current;

    if (!canvas) return;

 

    if (tool === 'text') {
      const rect =
        canvas.getBoundingClientRect();

      const point =
        pointForEvent(
          event,
          canvas,
        );

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

    const point =
      pointForEvent(
        event,
        canvas,
      );

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

      const preview =
        previewCanvasRef.current;

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
      pointForEvent(
        event,
        canvas,
      );

  

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

      const result =
        configureCanvas(preview);

      if (!result) return;

      result.ctx.clearRect(
        0,
        0,
        result.width,
        result.height,
      );

      drawPreviewShape(
        preview,
        {
          type: drawing.kind,
          start: drawing.start,
          end: point,
          color,
          size,
        },
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
      pointForEvent(
        event,
        canvas,
      );


    if (
      drawing.kind === 'pen' ||
      drawing.kind === 'eraser'
    ) {
      drawing.points.push(point);

      await saveAction({
        id: uid(),
        type:
          drawing.kind === 'eraser'
            ? 'eraser'
            : 'stroke',
        points: drawing.points,
        ...(drawing.kind === 'pen'
          ? { color }
          : {}),
        size,
      });
    }



    if (
      drawing.kind === 'line' ||
      drawing.kind === 'rect' ||
      drawing.kind === 'circle'
    ) {
      await saveAction({
        id: uid(),
        type: drawing.kind,
        start: drawing.start,
        end: point,
        color,
        size,
      });

      const preview =
        previewCanvasRef.current;

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
    }

    drawingRef.current = null;
  }


  function handleCancel() {
    drawingRef.current = null;

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


  function finishText() {
    const text =
      textEditor?.text.trim();

    if (!text) {
      setTextEditor(null);
      return;
    }

    const current =
      textEditor;

    setTextEditor(null);

    void saveAction({
      id: uid(),
      type: 'text',
      x: current.x,
      y: current.y,
      text,
      color,
      fontSize: Math.max(
        18,
        size * 3,
      ),
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
    const base =
      baseCanvasRef.current;

    if (!base) return;

    const exportCanvas =
      document.createElement('canvas');

    exportCanvas.width =
      base.width;

    exportCanvas.height =
      base.height;

    const ctx =
      exportCanvas.getContext('2d');

    if (!ctx) return;

    ctx.drawImage(
      base,
      0,
      0,
    );

    const link =
      document.createElement('a');

    link.download =
      `collabcanvas-${workspaceId}.png`;

    link.href =
      exportCanvas.toDataURL(
        'image/png',
      );

    link.click();
  }


  function exportPdf() {
    const canvas =
      baseCanvasRef.current;

    if (!canvas) return;

    const image =
      canvas.toDataURL(
        'image/png',
      );

    const landscape =
      canvas.width >=
      canvas.height;

    const doc =
      new jsPDF({
        orientation:
          landscape
            ? 'landscape'
            : 'portrait',
        unit: 'mm',
        format: 'a4',
      });

    const pageWidth =
      landscape ? 297 : 210;

    const pageHeight =
      landscape ? 210 : 297;

    const margin = 8;

    const ratio =
      canvas.width /
      canvas.height;

    const maxWidth =
      pageWidth -
      margin * 2;

    const maxHeight =
      pageHeight -
      margin * 2;

    let width =
      maxWidth;

    let height =
      width / ratio;

    if (height > maxHeight) {
      height = maxHeight;
      width =
        height * ratio;
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

    doc.save(
      `collabcanvas-${workspaceId}.pdf`,
    );
  }


  if (loading) {
    return (
      <div className="canvas-loading">
        Loading shared canvas…
      </div>
    );
  }


  return (
    <div className="canvas-workspace">
      <div className="canvas-toolbar">
        {[
          'pen',
          'eraser',
          'line',
          'rect',
          'circle',
          'text',
        ].map((item) => (
          <button
            key={item}
            className={
              tool === item
                ? 'active'
                : ''
            }
            onClick={() =>
              setTool(item)
            }
            title={
              item === 'eraser'
                ? 'Eraser'
                : item === 'rect'
                  ? 'Rectangle'
                  : item === 'circle'
                    ? 'Circle'
                    : item === 'line'
                      ? 'Line'
                      : item === 'text'
                        ? 'Text'
                        : 'Pen'
            }
          >
            {item === 'pen'
              ? '✎'
              : item === 'eraser'
                ? '⌫'
                : item === 'line'
                  ? '╱'
                  : item === 'rect'
                    ? '▢'
                    : item === 'circle'
                      ? '○'
                      : 'T'}
          </button>
        ))}

        <div className="canvas-divider" />

        <div className="canvas-colors" aria-label="Choose drawing color">
          {COLORS.map((item) => (
            <button
              key={item}
              type="button"
              className={`canvas-color ${
                color === item ? 'selected' : ''
              }`}
              style={{ backgroundColor: item }}
              onClick={() => {
                setColor(item);

                if (tool === 'eraser') {
                  setTool('pen');
                }
              }}
              aria-label={`Use color ${item}`}
              title={`Color ${item}`}
            />
          ))}
        </div>

        <label className="canvas-size">
          Size

          <input
            type="range"
            min="1"
            max="24"
            value={size}
            onChange={(event) =>
              setSize(
                Number(
                  event.target.value,
                ),
              )
            }
          />
        </label>

        <span className="toolbar-spacer" />

        {saving ? (
          <span className="canvas-saving">
            Saving…
          </span>
        ) : null}

        <button onClick={exportPng}>
          Export PNG
        </button>

        <button onClick={exportPdf}>
          Export PDF
        </button>

        {canClear ? (
          <button onClick={clearCanvas}>
            Clear
          </button>
        ) : null}
      </div>

      {error ? (
        <ErrorState
          message={error}
          onRetry={load}
        />
      ) : null}

      <div className="canvas-stage">
        <canvas
          ref={baseCanvasRef}
          className="canvas-base"
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          onPointerCancel={handleCancel}
        />

        <canvas
          ref={previewCanvasRef}
          className="canvas-preview"
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
                setTextEditor(
                  (current) => ({
                    ...current,
                    text:
                      event.target.value,
                  }),
                )
              }
              onKeyDown={
                handleTextKeyDown
              }
            />

            <small>
              Enter to add · Esc to cancel
            </small>
          </div>
        ) : null}
      </div>
    </div>
  );
}
