(() => {
  "use strict";

  const canvas = document.getElementById("paintCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const frame = document.getElementById("canvasFrame");
  const stage = document.getElementById("stage");
  const cursor = document.getElementById("brushCursor");
  const emptyHint = document.getElementById("emptyHint");
  const undoButton = document.getElementById("undoBtn");
  const redoButton = document.getElementById("redoBtn");
  const clearButton = document.getElementById("clearBtn");
  const exportButton = document.getElementById("exportBtn");
  const clearDialog = document.getElementById("clearDialog");
  const nameInput = document.getElementById("documentName");
  const colorPicker = document.getElementById("colorPicker");
  const colorPreview = document.getElementById("currentColorPreview");
  const colorHex = document.getElementById("colorHex");
  const sizeSlider = document.getElementById("sizeSlider");
  const sizeValue = document.getElementById("sizeValue");
  const opacitySlider = document.getElementById("opacitySlider");
  const opacityValue = document.getElementById("opacityValue");
  const toolStatus = document.getElementById("toolStatus");
  const coordinateStatus = document.getElementById("coordinateStatus");
  const zoomStatus = document.getElementById("zoomStatus");
  const toast = document.getElementById("toast");

  const TOOL_NAMES = {
    brush: "Brush",
    marker: "Marker",
    eraser: "Eraser",
    line: "Line",
    rectangle: "Box",
    ellipse: "Circle",
    fill: "Fill",
    eyedropper: "Color picker"
  };

  const SHORTCUTS = {
    b: "brush",
    m: "marker",
    e: "eraser",
    l: "line",
    r: "rectangle",
    o: "ellipse",
    g: "fill",
    i: "eyedropper"
  };

  const state = {
    tool: "brush",
    color: "#202124",
    size: 18,
    opacity: 1,
    drawing: false,
    moved: false,
    start: null,
    last: null,
    shapeBase: null,
    undo: [],
    redo: [],
    maxHistory: 14,
    dirty: false,
    pointerId: null
  };

  function initializeCanvas() {
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    fitCanvas();
    updateRange(sizeSlider);
    updateRange(opacitySlider);
    setColor(state.color);
    updateHistoryButtons();
  }

  function fitCanvas() {
    const availableWidth = Math.max(100, stage.clientWidth - (window.innerWidth <= 700 ? 26 : 68));
    const availableHeight = Math.max(80, stage.clientHeight - (window.innerWidth <= 700 ? 26 : 68));
    const ratio = canvas.width / canvas.height;
    let width = availableWidth;
    let height = width / ratio;

    if (height > availableHeight) {
      height = availableHeight;
      width = height * ratio;
    }

    frame.style.width = `${Math.floor(width)}px`;
    frame.style.height = `${Math.floor(height)}px`;
    zoomStatus.textContent = `${Math.round((width / canvas.width) * 100)}%`;
  }

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * (canvas.width / rect.width))),
      y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * (canvas.height / rect.height)))
    };
  }

  function pressureFor(event) {
    if (event.pointerType === "pen" && event.pressure > 0) {
      return 0.32 + event.pressure * 0.68;
    }
    return 1;
  }

  function configureStroke(event) {
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = state.size * pressureFor(event);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = state.opacity;
    ctx.strokeStyle = state.tool === "eraser" ? "#ffffff" : state.color;

    if (state.tool === "marker") {
      ctx.lineWidth = state.size * 1.8;
      ctx.globalAlpha = Math.min(0.34, state.opacity * 0.34);
    }
  }

  function saveSnapshot() {
    try {
      state.undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (state.undo.length > state.maxHistory) state.undo.shift();
      state.redo.length = 0;
      updateHistoryButtons();
    } catch (error) {
      showToast("Undo history is unavailable on this device");
    }
  }

  function restoreSnapshot(snapshot) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.putImageData(snapshot, 0, 0);
    ctx.restore();
  }

  function undo() {
    if (!state.undo.length || state.drawing) return;
    state.redo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    restoreSnapshot(state.undo.pop());
    state.dirty = true;
    emptyHint.classList.add("hidden");
    updateHistoryButtons();
  }

  function redo() {
    if (!state.redo.length || state.drawing) return;
    state.undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    restoreSnapshot(state.redo.pop());
    state.dirty = true;
    emptyHint.classList.add("hidden");
    updateHistoryButtons();
  }

  function updateHistoryButtons() {
    undoButton.disabled = state.undo.length === 0;
    redoButton.disabled = state.redo.length === 0;
  }

  function markChanged() {
    state.dirty = true;
    emptyHint.classList.add("hidden");
  }

  function beginStroke(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (state.drawing) return;
    event.preventDefault();
    const point = canvasPoint(event);
    updateCoordinates(point);

    if (state.tool === "fill") {
      saveSnapshot();
      floodFill(Math.floor(point.x), Math.floor(point.y), state.color, state.opacity);
      markChanged();
      return;
    }

    if (state.tool === "eyedropper") {
      pickColor(point);
      return;
    }

    saveSnapshot();
    state.drawing = true;
    state.moved = false;
    state.start = point;
    state.last = point;
    state.pointerId = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);

    if (["line", "rectangle", "ellipse"].includes(state.tool)) {
      state.shapeBase = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return;
    }

    configureStroke(event);
    ctx.beginPath();
    ctx.arc(point.x, point.y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.globalAlpha = state.tool === "marker" ? Math.min(0.34, state.opacity * 0.34) : state.opacity;
    ctx.fill();
    ctx.globalAlpha = 1;
    markChanged();
  }

  function continueStroke(event) {
    const point = canvasPoint(event);
    updateCoordinates(point);
    updateCursor(event);
    if (!state.drawing || event.pointerId !== state.pointerId) return;

    event.preventDefault();
    state.moved = true;

    if (["line", "rectangle", "ellipse"].includes(state.tool)) {
      restoreSnapshot(state.shapeBase);
      drawShape(state.start, point);
      return;
    }

    const events = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [event];
    for (const sample of events) {
      const next = canvasPoint(sample);
      configureStroke(sample);
      ctx.beginPath();
      ctx.moveTo(state.last.x, state.last.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
      state.last = next;
    }
    ctx.globalAlpha = 1;
  }

  function endStroke(event) {
    if (!state.drawing || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    const point = canvasPoint(event);

    if (["line", "rectangle", "ellipse"].includes(state.tool)) {
      restoreSnapshot(state.shapeBase);
      drawShape(state.start, point);
      markChanged();
    }

    state.drawing = false;
    state.pointerId = null;
    state.shapeBase = null;
    ctx.globalAlpha = 1;
    canvas.releasePointerCapture?.(event.pointerId);
    updateHistoryButtons();
  }

  function cancelStroke(event) {
    if (!state.drawing || event.pointerId !== state.pointerId) return;
    if (state.shapeBase) {
      restoreSnapshot(state.shapeBase);
      if (state.undo.length) state.undo.pop();
    } else {
      markChanged();
    }
    state.drawing = false;
    state.pointerId = null;
    state.shapeBase = null;
    updateHistoryButtons();
  }

  function drawShape(start, end) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = state.size;
    ctx.strokeStyle = state.color;
    ctx.globalAlpha = state.opacity;
    ctx.beginPath();

    if (state.tool === "line") {
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
    } else if (state.tool === "rectangle") {
      ctx.rect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else {
      const centerX = (start.x + end.x) / 2;
      const centerY = (start.y + end.y) / 2;
      const radiusX = Math.abs(end.x - start.x) / 2;
      const radiusY = Math.abs(end.y - start.y) / 2;
      if (radiusX > 0 && radiusY > 0) ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    }

    ctx.stroke();
    ctx.restore();
  }

  function floodFill(startX, startY, hex, opacity) {
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const startIndex = (startY * canvas.width + startX) * 4;
    const target = [data[startIndex], data[startIndex + 1], data[startIndex + 2], data[startIndex + 3]];
    const fill = hexToRgba(hex, opacity);
    const tolerance = 24;

    if (colorDistance(target, fill) <= tolerance) return;

    const totalPixels = canvas.width * canvas.height;
    const queue = new Int32Array(totalPixels);
    const visited = new Uint8Array(totalPixels);
    const firstPixel = startY * canvas.width + startX;
    let head = 0;
    let tail = 1;
    queue[0] = firstPixel;
    visited[firstPixel] = 1;

    while (head < tail) {
      const pixel = queue[head++];
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      const index = pixel * 4;
      const current = [data[index], data[index + 1], data[index + 2], data[index + 3]];
      if (colorDistance(current, target) > tolerance) continue;

      data[index] = Math.round(fill[0] * opacity + current[0] * (1 - opacity));
      data[index + 1] = Math.round(fill[1] * opacity + current[1] * (1 - opacity));
      data[index + 2] = Math.round(fill[2] * opacity + current[2] * (1 - opacity));
      data[index + 3] = 255;

      const neighbors = [];
      if (x + 1 < canvas.width) neighbors.push(pixel + 1);
      if (x > 0) neighbors.push(pixel - 1);
      if (y + 1 < canvas.height) neighbors.push(pixel + canvas.width);
      if (y > 0) neighbors.push(pixel - canvas.width);
      for (const neighbor of neighbors) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }

    ctx.putImageData(image, 0, 0);
  }

  function colorDistance(a, b) {
    return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
  }

  function hexToRgba(hex) {
    const value = Number.parseInt(hex.slice(1), 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
  }

  function rgbToHex(red, green, blue) {
    return `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  }

  function pickColor(point) {
    const pixel = ctx.getImageData(Math.floor(point.x), Math.floor(point.y), 1, 1).data;
    setColor(rgbToHex(pixel[0], pixel[1], pixel[2]));
    selectTool("brush");
    showToast(`Picked ${state.color.toUpperCase()}`);
  }

  function selectTool(tool) {
    state.tool = tool;
    document.querySelectorAll("[data-tool]").forEach((button) => {
      const active = button.dataset.tool === tool;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    toolStatus.textContent = TOOL_NAMES[tool];
    cursor.classList.toggle("hidden", tool === "fill" || tool === "eyedropper");
  }

  function setColor(color) {
    state.color = color.toLowerCase();
    colorPicker.value = state.color;
    colorPreview.style.background = state.color;
    colorHex.textContent = state.color.toUpperCase();
    document.querySelectorAll(".swatch").forEach((swatch) => {
      swatch.classList.toggle("selected", swatch.dataset.color.toLowerCase() === state.color);
    });
  }

  function updateRange(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const progress = ((value - min) / (max - min)) * 100;
    input.style.setProperty("--range-progress", `${progress}%`);
  }

  function updateCursor(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const displaySize = Math.max(3, state.size * (rect.width / canvas.width) * (state.tool === "marker" ? 1.8 : 1));
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    cursor.style.width = `${displaySize}px`;
    cursor.style.height = `${displaySize}px`;
  }

  function updateCoordinates(point) {
    coordinateStatus.textContent = `${Math.round(point.x)}, ${Math.round(point.y)}`;
  }

  function clearCanvas() {
    saveSnapshot();
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    state.dirty = false;
    emptyHint.classList.remove("hidden");
    showToast("Canvas cleared");
  }

  function exportArtwork() {
    const cleanName = (nameInput.value.trim() || "bob-paint-artwork")
      .replace(/[^a-z0-9-_ ]/gi, "")
      .trim()
      .replace(/\s+/g, "-")
      .toLowerCase();
    const link = document.createElement("a");
    link.download = `${cleanName || "bob-paint-artwork"}.png`;
    link.href = canvas.toDataURL("image/png");
    document.body.appendChild(link);
    link.click();
    link.remove();
    showToast("PNG saved");
  }

  let toastTimer;
  function showToast(message) {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("show");
    toastTimer = setTimeout(() => toast.classList.remove("show"), 1800);
  }

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => selectTool(button.dataset.tool));
  });

  document.querySelectorAll(".swatch").forEach((button) => {
    button.addEventListener("click", () => setColor(button.dataset.color));
  });

  colorPicker.addEventListener("input", () => setColor(colorPicker.value));

  sizeSlider.addEventListener("input", () => {
    state.size = Number(sizeSlider.value);
    sizeValue.textContent = `${state.size} px`;
    updateRange(sizeSlider);
  });

  opacitySlider.addEventListener("input", () => {
    state.opacity = Number(opacitySlider.value) / 100;
    opacityValue.textContent = `${opacitySlider.value}%`;
    updateRange(opacitySlider);
  });

  canvas.addEventListener("pointerdown", beginStroke);
  canvas.addEventListener("pointermove", continueStroke);
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", cancelStroke);
  canvas.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch") cursor.style.display = "block";
    updateCursor(event);
  });
  canvas.addEventListener("pointerleave", () => {
    if (!state.drawing) cursor.style.display = "none";
    coordinateStatus.textContent = "Ready";
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  exportButton.addEventListener("click", exportArtwork);

  clearButton.addEventListener("click", () => {
    if (typeof clearDialog.showModal === "function") clearDialog.showModal();
    else if (window.confirm("Clear the canvas? You can undo this afterward.")) clearCanvas();
  });

  clearDialog.addEventListener("close", () => {
    if (clearDialog.returnValue === "confirm") clearCanvas();
  });

  window.addEventListener("resize", fitCanvas);

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement && event.target.type !== "range") return;
    const key = event.key.toLowerCase();
    const command = event.metaKey || event.ctrlKey;

    if (command && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
      return;
    }

    if (command && key === "y") {
      event.preventDefault();
      redo();
      return;
    }

    if (SHORTCUTS[key]) {
      event.preventDefault();
      selectTool(SHORTCUTS[key]);
    } else if (event.key === "[") {
      sizeSlider.value = Math.max(Number(sizeSlider.min), state.size - 3);
      sizeSlider.dispatchEvent(new Event("input"));
    } else if (event.key === "]") {
      sizeSlider.value = Math.min(Number(sizeSlider.max), state.size + 3);
      sizeSlider.dispatchEvent(new Event("input"));
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (!state.dirty) return;
    event.preventDefault();
  });

  initializeCanvas();
})();
