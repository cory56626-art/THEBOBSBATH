(() => {
  'use strict';

  const WIDTH = 1600;
  const HEIGHT = 1000;
  const STORAGE_KEY = 'bobsbath-draw-v1';
  const drawing = document.querySelector('#drawing');
  const preview = document.querySelector('#preview');
  const ctx = drawing.getContext('2d');
  const previewCtx = preview.getContext('2d');
  const replayCanvas = document.createElement('canvas');
  replayCanvas.width = WIDTH;
  replayCanvas.height = HEIGHT;
  const replayCtx = replayCanvas.getContext('2d');

  const undoButton = document.querySelector('#undo');
  const redoButton = document.querySelector('#redo');
  const clearButton = document.querySelector('#clear');
  const clearDialog = document.querySelector('#clear-dialog');
  const prompt = document.querySelector('#canvas-prompt');
  const sizeInput = document.querySelector('#size');
  const sizeLabel = document.querySelector('#size-label');
  const colorInput = document.querySelector('#custom-color');
  const colorLabel = document.querySelector('#color-label');
  const artworkName = document.querySelector('#artwork-name');
  const saveStatus = document.querySelector('#save-status');
  const status = document.querySelector('.status');
  const toast = document.querySelector('#toast');

  let commands = [];
  let undone = [];
  let active = null;
  let tool = 'pen';
  let color = '#252936';
  let sizes = { pen: 8, marker: 28, eraser: 24 };
  let saveTimer;
  let toastTimer;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function pointFromEvent(event) {
    const rect = drawing.getBoundingClientRect();
    return {
      x: Math.round(clamp((event.clientX - rect.left) * WIDTH / rect.width, 0, WIDTH) * 10) / 10,
      y: Math.round(clamp((event.clientY - rect.top) * HEIGHT / rect.height, 0, HEIGHT) * 10) / 10
    };
  }

  function hasArtwork() {
    const lastClear = commands.findLastIndex(command => command.type === 'clear');
    return commands.length > lastClear + 1;
  }

  function updateHistory() {
    undoButton.disabled = commands.length === 0;
    redoButton.disabled = undone.length === 0;
    clearButton.disabled = !hasArtwork();
    prompt.classList.toggle('hidden', Boolean(active) || hasArtwork());
  }

  function drawDot(target, x, y, size) {
    target.beginPath();
    target.arc(x, y, size / 2, 0, Math.PI * 2);
    target.fill();
  }

  function drawPath(target, stroke, displayEraser = false) {
    const points = stroke.points;
    if (!points.length) return;
    target.save();
    target.lineCap = 'round';
    target.lineJoin = 'round';
    target.lineWidth = stroke.size;
    target.strokeStyle = displayEraser ? '#ffffff' : stroke.color;
    target.fillStyle = target.strokeStyle;
    drawDot(target, points[0].x, points[0].y, stroke.size);
    if (points.length > 1) {
      target.beginPath();
      target.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) target.lineTo(points[i].x, points[i].y);
      target.stroke();
    }
    target.restore();
  }

  function redraw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    for (const command of commands) {
      if (command.type === 'clear') {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);
      } else if (command.tool === 'marker') {
        replayCtx.clearRect(0, 0, WIDTH, HEIGHT);
        drawPath(replayCtx, command);
        ctx.save();
        ctx.globalAlpha = 0.32;
        ctx.drawImage(replayCanvas, 0, 0);
        ctx.restore();
      } else {
        ctx.save();
        if (command.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
        drawPath(ctx, command);
        ctx.restore();
      }
    }
    updateHistory();
  }

  function setTool(next) {
    if (!['pen', 'marker', 'eraser'].includes(next)) return;
    tool = next;
    document.querySelectorAll('[data-tool]').forEach(button => {
      const selected = button.dataset.tool === next;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    sizeInput.value = sizes[tool];
    sizeLabel.value = `${sizes[tool]} px`;
    drawing.style.cursor = next === 'eraser' ? 'cell' : 'crosshair';
    scheduleSave();
  }

  function setColor(next) {
    if (!/^#[0-9a-f]{6}$/i.test(next)) return;
    color = next.toLowerCase();
    colorInput.value = color;
    colorLabel.textContent = color.toUpperCase();
    document.querySelectorAll('.swatch').forEach(button => {
      const selected = button.dataset.color.toLowerCase() === color;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    if (tool === 'eraser') setTool('pen');
    scheduleSave();
  }

  function setSize(next) {
    sizes[tool] = clamp(Math.round(Number(next) || 1), 1, 80);
    sizeInput.value = sizes[tool];
    sizeLabel.value = `${sizes[tool]} px`;
    scheduleSave();
  }

  function setSaveStatus(message, problem = false) {
    saveStatus.textContent = message;
    status.classList.toggle('problem', problem);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        commands, name: artworkName.value, tool, color, sizes
      }));
      setSaveStatus('Saved on this device');
    } catch {
      setSaveStatus('Local save unavailable — download your PNG', true);
    }
  }

  function scheduleSave() {
    setSaveStatus('Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }

  function restore() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved || !Array.isArray(saved.commands)) return;
      commands = saved.commands.slice(-300).flatMap(command => {
        if (command.type === 'clear') return [{ type: 'clear' }];
        if (command.type !== 'stroke' || !['pen', 'marker', 'eraser'].includes(command.tool) ||
            !Array.isArray(command.points) || !command.points.length || command.points.length > 10000) return [];
        return [{
          type: 'stroke', tool: command.tool,
          color: /^#[0-9a-f]{6}$/i.test(command.color) ? command.color : '#252936',
          size: clamp(Number(command.size) || 8, 1, 80),
          points: command.points.map(point => ({
            x: clamp(Number(point.x) || 0, 0, WIDTH),
            y: clamp(Number(point.y) || 0, 0, HEIGHT)
          }))
        }];
      });
      if (typeof saved.name === 'string') artworkName.value = saved.name.slice(0, 48);
      if (saved.sizes && typeof saved.sizes === 'object') {
        for (const name of Object.keys(sizes)) sizes[name] = clamp(Number(saved.sizes[name]) || sizes[name], 1, 80);
      }
      setColor(saved.color || color);
      setTool(saved.tool || tool);
      redraw();
    } catch {
      setSaveStatus('Local save unavailable — download your PNG', true);
    }
  }

  function addPoint(event) {
    if (!active) return;
    const point = pointFromEvent(event);
    const last = active.points.at(-1);
    if (point.x === last.x && point.y === last.y) return;
    active.points.push(point);
    previewCtx.beginPath();
    previewCtx.moveTo(last.x, last.y);
    previewCtx.lineTo(point.x, point.y);
    previewCtx.stroke();
  }

  drawing.addEventListener('pointerdown', event => {
    if (active || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    drawing.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    active = { type: 'stroke', tool, color, size: sizes[tool], points: [point], pointerId: event.pointerId };
    previewCtx.clearRect(0, 0, WIDTH, HEIGHT);
    previewCtx.lineWidth = active.size;
    previewCtx.lineCap = 'round';
    previewCtx.lineJoin = 'round';
    previewCtx.strokeStyle = tool === 'eraser' ? '#ffffff' : color;
    previewCtx.fillStyle = previewCtx.strokeStyle;
    preview.style.opacity = tool === 'marker' ? '0.32' : '1';
    drawDot(previewCtx, point.x, point.y, active.size);
    updateHistory();
  });

  drawing.addEventListener('pointermove', event => {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    const samples = event.getCoalescedEvents?.() || [event];
    for (const sample of samples) addPoint(sample);
  });

  drawing.addEventListener('pointerup', event => {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    addPoint(event);
    ctx.save();
    if (active.tool === 'eraser') ctx.globalCompositeOperation = 'destination-out';
    if (active.tool === 'marker') ctx.globalAlpha = 0.32;
    ctx.drawImage(preview, 0, 0);
    ctx.restore();
    const { pointerId, ...stroke } = active;
    commands.push(stroke);
    undone = [];
    active = null;
    previewCtx.clearRect(0, 0, WIDTH, HEIGHT);
    preview.style.opacity = '1';
    if (drawing.hasPointerCapture(pointerId)) drawing.releasePointerCapture(pointerId);
    updateHistory();
    scheduleSave();
  });

  drawing.addEventListener('pointercancel', event => {
    if (!active || event.pointerId !== active.pointerId) return;
    active = null;
    previewCtx.clearRect(0, 0, WIDTH, HEIGHT);
    preview.style.opacity = '1';
    updateHistory();
  });

  function undo() {
    if (!commands.length || active) return;
    undone.push(commands.pop());
    redraw();
    scheduleSave();
  }

  function redo() {
    if (!undone.length || active) return;
    commands.push(undone.pop());
    redraw();
    scheduleSave();
  }

  undoButton.addEventListener('click', undo);
  redoButton.addEventListener('click', redo);
  document.querySelectorAll('[data-tool]').forEach(button => button.addEventListener('click', () => setTool(button.dataset.tool)));
  document.querySelectorAll('.swatch').forEach(button => button.addEventListener('click', () => setColor(button.dataset.color)));
  colorInput.addEventListener('input', () => setColor(colorInput.value));
  sizeInput.addEventListener('input', () => setSize(sizeInput.value));
  artworkName.addEventListener('input', scheduleSave);

  clearButton.addEventListener('click', () => {
    if (hasArtwork()) clearDialog.showModal();
  });
  clearDialog.addEventListener('close', () => {
    if (clearDialog.returnValue !== 'clear') return;
    commands.push({ type: 'clear' });
    undone = [];
    redraw();
    scheduleSave();
  });

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  document.querySelector('#download').addEventListener('click', () => {
    const exported = document.createElement('canvas');
    exported.width = WIDTH;
    exported.height = HEIGHT;
    const output = exported.getContext('2d');
    output.fillStyle = '#ffffff';
    output.fillRect(0, 0, WIDTH, HEIGHT);
    output.drawImage(drawing, 0, 0);
    exported.toBlob(blob => {
      if (!blob) { showToast('Could not create the image. Please try again.'); return; }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const title = artworkName.value.trim().replace(/[^a-z0-9 _-]/gi, '').trim() || 'drawing';
      link.href = url;
      link.download = `${title}.png`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      showToast('PNG ready to save');
    }, 'image/png');
  });

  document.addEventListener('keydown', event => {
    const typing = event.target.closest('input, textarea, [contenteditable]');
    if (typing) return;
    const modifier = event.ctrlKey || event.metaKey;
    if (modifier && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
    } else if (modifier && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
    } else if (!modifier && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === 'b') setTool('pen');
      if (key === 'm') setTool('marker');
      if (key === 'e') setTool('eraser');
      if (key === '[') setSize(sizes[tool] - 2);
      if (key === ']') setSize(sizes[tool] + 2);
    }
  });

  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });
  restore();
  updateHistory();
})();
