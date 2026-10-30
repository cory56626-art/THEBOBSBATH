// bobs-bath/model/src/tensor.ts
function nd(data, shape) {
  return { data, shape };
}
function numel(shape) {
  let n = 1;
  for (const s of shape) n *= s;
  return n;
}

// bobs-bath/model/src/capsule.ts
var SUPPORTED_CAPSULE_VERSIONS = [1];
var Capsule = class {
  manifest;
  config;
  graph;
  tensors = /* @__PURE__ */ new Map();
  constructor(manifest, weights) {
    validateManifest(manifest);
    this.manifest = manifest;
    this.config = manifest.config;
    this.graph = manifest.graph;
    const floats = new Float32Array(weights);
    for (const t of manifest.tensors) {
      if (t.dtype !== "f32") {
        throw new Error(`Capsule tensor "${t.name}" has unsupported dtype "${t.dtype}" (expected f32).`);
      }
      const end = t.offset + t.length;
      if (end > floats.length) {
        throw new Error(
          `Capsule tensor "${t.name}" runs past weights.bin (offset ${t.offset} + length ${t.length} > ${floats.length}).`
        );
      }
      if (t.length !== numel(t.shape)) {
        throw new Error(`Capsule tensor "${t.name}" length ${t.length} != product(shape ${JSON.stringify(t.shape)}).`);
      }
      const view = new Float32Array(weights, t.offset * 4, t.length);
      this.tensors.set(t.name, nd(view, t.shape));
    }
  }
  hasTensor(name) {
    return this.tensors.has(name);
  }
  /** Fetch a tensor by name; throws if absent. */
  tensor(name) {
    const t = this.tensors.get(name);
    if (!t) throw new Error(`Capsule missing tensor "${name}".`);
    return t;
  }
  /** Raw data of a tensor by name. */
  data(name) {
    return this.tensor(name).data;
  }
};
function validateManifest(m) {
  if (typeof m.capsule_version !== "number") {
    throw new Error('Capsule manifest missing numeric "capsule_version".');
  }
  if (!SUPPORTED_CAPSULE_VERSIONS.includes(m.capsule_version)) {
    throw new Error(
      `Unsupported capsule_version ${m.capsule_version}. This build understands: ${SUPPORTED_CAPSULE_VERSIONS.join(", ")}.`
    );
  }
  if (!Array.isArray(m.tensors) || !Array.isArray(m.graph)) {
    throw new Error('Capsule manifest must contain "tensors" and "graph" arrays.');
  }
  if (!m.config || typeof m.config.d_model !== "number") {
    throw new Error('Capsule manifest missing "config.d_model".');
  }
}
function loadCapsuleFromBytes(manifest, weights) {
  return new Capsule(manifest, weights);
}
async function fetchCapsule(capsuleUrl) {
  const manifestRes = await fetch(capsuleUrl);
  if (!manifestRes.ok) {
    throw new Error(`Failed to fetch capsule manifest ${capsuleUrl}: HTTP ${manifestRes.status}.`);
  }
  const manifest = await manifestRes.json();
  const weightsUrl = new URL(manifest.weights_file ?? "weights.bin", capsuleUrl).href;
  const weightsRes = await fetch(weightsUrl);
  if (!weightsRes.ok) {
    throw new Error(`Failed to fetch capsule weights ${weightsUrl}: HTTP ${weightsRes.status}.`);
  }
  const weights = await weightsRes.arrayBuffer();
  return new Capsule(manifest, weights);
}

// bobs-bath/model/src/erf.ts
var COF = [
  -1.3026537197817094,
  0.6419697923564902,
  0.019476473204185836,
  -0.00956151478680863,
  -946595344482036e-18,
  366839497852761e-18,
  42523324806907e-18,
  -20278578112534e-18,
  -1624290004647e-18,
  130365583558e-17,
  15626441722e-18,
  -85238095915e-18,
  6529054439e-18,
  5059343495e-18,
  -991364156e-18,
  -227365122e-18,
  96467911e-18,
  2394038e-18,
  -6886027e-18,
  894487e-18,
  313092e-18,
  -112708e-18,
  381e-18,
  7106e-18
];
function erfccheb(z) {
  let d = 0;
  let dd = 0;
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  for (let j = COF.length - 1; j > 0; j--) {
    const tmp = d;
    d = ty * d - dd + COF[j];
    dd = tmp;
  }
  return t * Math.exp(-z * z + 0.5 * (COF[0] + ty * d) - dd);
}
function erf(x) {
  return x >= 0 ? 1 - erfccheb(x) : erfccheb(-x) - 1;
}

// bobs-bath/model/src/ops.ts
var SQRT1_2 = Math.SQRT1_2;
function linear(x, rows, inDim, W, outDim, b) {
  const out = new Float32Array(rows * outDim);
  for (let r = 0; r < rows; r++) {
    const xBase = r * inDim;
    const oBase = r * outDim;
    for (let o = 0; o < outDim; o++) {
      const wBase = o * inDim;
      let acc = b ? b[o] : 0;
      for (let i = 0; i < inDim; i++) acc += x[xBase + i] * W[wBase + i];
      out[oBase + o] = acc;
    }
  }
  return out;
}
function conv2d(x, cIn, H, Wd, weight, cOut, k, bias) {
  const pad = k >> 1;
  const out = new Float32Array(cOut * H * Wd);
  for (let oc = 0; oc < cOut; oc++) {
    const wOcBase = oc * cIn * k * k;
    const bias_oc = bias ? bias[oc] : 0;
    for (let oh = 0; oh < H; oh++) {
      for (let ow = 0; ow < Wd; ow++) {
        let acc = bias_oc;
        for (let ic = 0; ic < cIn; ic++) {
          const xIcBase = ic * H * Wd;
          const wIcBase = wOcBase + ic * k * k;
          for (let kh = 0; kh < k; kh++) {
            const ih = oh + kh - pad;
            if (ih < 0 || ih >= H) continue;
            for (let kw = 0; kw < k; kw++) {
              const iw = ow + kw - pad;
              if (iw < 0 || iw >= Wd) continue;
              acc += x[xIcBase + ih * Wd + iw] * weight[wIcBase + kh * k + kw];
            }
          }
        }
        out[oc * H * Wd + oh * Wd + ow] = acc;
      }
    }
  }
  return out;
}
function reluInplace(x) {
  for (let i = 0; i < x.length; i++) if (x[i] < 0) x[i] = 0;
  return x;
}
function gelu(x) {
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) {
    const v = x[i];
    out[i] = 0.5 * v * (1 + erf(v * SQRT1_2));
  }
  return out;
}
function layerNorm(x, rows, dim, weight, bias, eps = 1e-5) {
  const out = new Float32Array(rows * dim);
  for (let r = 0; r < rows; r++) {
    const base = r * dim;
    let mean = 0;
    for (let i = 0; i < dim; i++) mean += x[base + i];
    mean /= dim;
    let varAcc = 0;
    for (let i = 0; i < dim; i++) {
      const d = x[base + i] - mean;
      varAcc += d * d;
    }
    varAcc /= dim;
    const invStd = 1 / Math.sqrt(varAcc + eps);
    for (let i = 0; i < dim; i++) {
      out[base + i] = (x[base + i] - mean) * invStd * weight[i] + bias[i];
    }
  }
  return out;
}
function softmaxRowInplace(x, rows, cols) {
  for (let r = 0; r < rows; r++) {
    const base = r * cols;
    let mx = -Infinity;
    for (let c = 0; c < cols; c++) if (x[base + c] > mx) mx = x[base + c];
    let sum = 0;
    for (let c = 0; c < cols; c++) {
      const e = Math.exp(x[base + c] - mx);
      x[base + c] = e;
      sum += e;
    }
    const inv = 1 / sum;
    for (let c = 0; c < cols; c++) x[base + c] *= inv;
  }
  return x;
}
function meanPool(x, rows, dim) {
  const acc = new Float64Array(dim);
  for (let r = 0; r < rows; r++) {
    const base = r * dim;
    for (let i = 0; i < dim; i++) acc[i] += x[base + i];
  }
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) out[i] = acc[i] / rows;
  return out;
}

// bobs-bath/model/src/relIndex.ts
function relIndex() {
  const idx2 = new Int32Array(64 * 64);
  for (let i = 0; i < 64; i++) {
    const ri = i >> 3;
    const fi = i & 7;
    for (let j = 0; j < 64; j++) {
      const rj = j >> 3;
      const fj = j & 7;
      const dr = ri - rj + 7;
      const df = fi - fj + 7;
      idx2[i * 64 + j] = dr * 15 + df;
    }
  }
  return idx2;
}

// bobs-bath/model/src/attention.ts
var REL_IDX = relIndex();
function geoSelfAttention(x, d, nHeads, w, trace, tracePrefix) {
  const N = 64;
  const headDim = d / nHeads;
  const scale = 1 / Math.sqrt(headDim);
  const qkv = linear(x, N, d, w.qkvW, 3 * d, w.qkvB);
  const scores = new Float32Array(nHeads * N * N);
  const qOff = 0;
  const kOff = d;
  const vOff = 2 * d;
  for (let h = 0; h < nHeads; h++) {
    const headBase = h * headDim;
    const sH = h * N * N;
    const relBiasH = w.relBias ? h * 225 : 0;
    for (let i = 0; i < N; i++) {
      const qi = i * 3 * d + qOff + headBase;
      const sRow = sH + i * N;
      const relRow = i * N;
      for (let j = 0; j < N; j++) {
        const kj = j * 3 * d + kOff + headBase;
        let dot = 0;
        for (let t = 0; t < headDim; t++) dot += qkv[qi + t] * qkv[kj + t];
        let s = dot * scale;
        if (w.relBias) s += w.relBias[relBiasH + REL_IDX[relRow + j]];
        scores[sRow + j] = s;
      }
    }
  }
  if (trace && tracePrefix) trace.record(`${tracePrefix}.scores`, scores, [nHeads, N, N]);
  const probs = Float32Array.from(scores);
  softmaxRowInplace(probs, nHeads * N, N);
  if (trace && tracePrefix) trace.record(`${tracePrefix}.probs`, probs, [nHeads, N, N]);
  const merged = new Float32Array(N * d);
  for (let h = 0; h < nHeads; h++) {
    const headBase = h * headDim;
    const pH = h * N * N;
    for (let i = 0; i < N; i++) {
      const pRow = pH + i * N;
      const outBase = i * d + headBase;
      for (let j = 0; j < N; j++) {
        const p = probs[pRow + j];
        if (p === 0) continue;
        const vj = j * 3 * d + vOff + headBase;
        for (let t = 0; t < headDim; t++) merged[outBase + t] += p * qkv[vj + t];
      }
    }
  }
  return linear(merged, N, d, w.projW, d, w.projB);
}

// bobs-bath/model/src/moves.ts
var NUM_MOVE_TYPES = 73;
var NUM_MOVES = 64 * NUM_MOVE_TYPES;
var SLIDE_DIRS = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1]
];
var NUM_SLIDE_TYPES = 56;
var KNIGHT_DIRS = [
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2]
];
var NUM_KNIGHT_TYPES = 8;
var UNDERPROM_DIRS = [-1, 0, 1];
var UNDERPROM_PIECES = [2, 3, 4];
var QUEEN = 5;
var ENCODE = /* @__PURE__ */ new Map();
var DECODE_TO = new Int32Array(NUM_MOVES).fill(-1);
var DECODE_PROM = new Int32Array(NUM_MOVES).fill(-1);
function encKey(from, to, prom) {
  return (from * 64 + to) * 8 + prom;
}
function rankOf(sq) {
  return sq >> 3;
}
function fileOf(sq) {
  return sq & 7;
}
(function buildTables() {
  for (let from = 0; from < 64; from++) {
    const fh = rankOf(from);
    const fw = fileOf(from);
    for (let d = 0; d < SLIDE_DIRS.length; d++) {
      const [dh, dw] = SLIDE_DIRS[d];
      for (let dist = 1; dist < 8; dist++) {
        const th = fh + dh * dist;
        const tw = fw + dw * dist;
        if (th < 0 || th >= 8 || tw < 0 || tw >= 8) continue;
        const to = th * 8 + tw;
        const mt = d * 7 + (dist - 1);
        ENCODE.set(encKey(from, to, 0), mt);
        ENCODE.set(encKey(from, to, QUEEN), mt);
        DECODE_TO[from * 73 + mt] = to;
        DECODE_PROM[from * 73 + mt] = -1;
      }
    }
  }
  for (let from = 0; from < 64; from++) {
    const fh = rankOf(from);
    const fw = fileOf(from);
    for (let kI = 0; kI < KNIGHT_DIRS.length; kI++) {
      const [dh, dw] = KNIGHT_DIRS[kI];
      const th = fh + dh;
      const tw = fw + dw;
      if (th < 0 || th >= 8 || tw < 0 || tw >= 8) continue;
      const to = th * 8 + tw;
      const mt = NUM_SLIDE_TYPES + kI;
      ENCODE.set(encKey(from, to, 0), mt);
      DECODE_TO[from * 73 + mt] = to;
      DECODE_PROM[from * 73 + mt] = -1;
    }
  }
  for (let from = 0; from < 64; from++) {
    const fh = rankOf(from);
    const fw = fileOf(from);
    for (const dh of [1, -1]) {
      const th = fh + dh;
      if (th !== 0 && th !== 7) continue;
      for (let dfI = 0; dfI < UNDERPROM_DIRS.length; dfI++) {
        const tw = fw + UNDERPROM_DIRS[dfI];
        if (tw < 0 || tw >= 8) continue;
        const to = th * 8 + tw;
        for (let pI = 0; pI < UNDERPROM_PIECES.length; pI++) {
          const piece = UNDERPROM_PIECES[pI];
          const mt = NUM_SLIDE_TYPES + NUM_KNIGHT_TYPES + dfI * 3 + pI;
          ENCODE.set(encKey(from, to, piece), mt);
          DECODE_TO[from * 73 + mt] = to;
          DECODE_PROM[from * 73 + mt] = piece;
        }
      }
    }
  }
})();
function encodeMove(move) {
  if (move.from == null || move.to == null) return -1;
  const prom = move.promotion ?? 0;
  const mt = ENCODE.get(encKey(move.from, move.to, prom));
  if (mt === void 0) return -1;
  return move.from * NUM_MOVE_TYPES + mt;
}
function decodeMove(flatIdx, board) {
  const from = Math.floor(flatIdx / NUM_MOVE_TYPES);
  const mt = flatIdx % NUM_MOVE_TYPES;
  const to = DECODE_TO[from * 73 + mt];
  if (to < 0) return { from, to: from, promotion: null };
  let promotion = DECODE_PROM[from * 73 + mt] < 0 ? null : DECODE_PROM[from * 73 + mt];
  if (promotion === null) {
    const pt = board.pieceTypeAt(from);
    if (pt === "p") {
      const toRank = rankOf(to);
      if (toRank === 0 || toRank === 7) promotion = QUEEN;
    }
  }
  return { from, to, promotion };
}
function legalMask(legalMoves) {
  const mask = new Uint8Array(NUM_MOVES);
  for (const mv of legalMoves) {
    const idx2 = encodeMove(mv);
    if (idx2 >= 0) mask[idx2] = 1;
  }
  return mask;
}
function legalPolicySoftmax(logits, legalIndices) {
  const out = /* @__PURE__ */ new Map();
  if (legalIndices.length === 0) return out;
  let max = -Infinity;
  for (const i of legalIndices) if (logits[i] > max) max = logits[i];
  const weights = [];
  let total = 0;
  for (const i of legalIndices) {
    const e = Math.exp(logits[i] - max);
    weights.push(e);
    total += e;
  }
  total = total || 1;
  legalIndices.forEach((i, k) => out.set(i, weights[k] / total));
  return out;
}
function pieceToMoveProbs(probsByIndex) {
  const out = new Float32Array(64);
  for (const [idx2, p] of probsByIndex) out[Math.floor(idx2 / NUM_MOVE_TYPES)] += p;
  return out;
}
function rotateSquare(sq) {
  return sq ^ 56;
}

// bobs-bath/model/src/model.ts
function wname(stage, suffix) {
  return stage.weights.find((n) => n === suffix || n.endsWith("." + suffix));
}
var REGISTRY = {
  input_planes(_m, _stage, _inputs, ctx) {
    return ctx.acts.get("io.planes");
  },
  embed: convStem,
  stem_conv: convStem,
  tokenize(m, stage, inputs, ctx) {
    const embed = inputs[0];
    const C = embed.shape[0];
    const posName = wname(stage, "pos_emb");
    const pos = m.capsule.data(posName);
    const t = new Float32Array(64 * C);
    for (let s = 0; s < 64; s++) {
      for (let c = 0; c < C; c++) {
        t[s * C + c] = embed.data[c * 64 + s] + pos[s * C + c];
      }
    }
    ctx.trace?.record("tokenize", t, [64, C]);
    return { data: t, shape: [64, C] };
  },
  block(m, stage, inputs, ctx) {
    const x = inputs[0].data;
    const d = Number(stage.dims.d);
    const heads = Number(stage.dims.heads);
    const id = stage.id;
    const ln1 = layerNorm(x, 64, d, m.w(stage, "ln1.weight"), m.w(stage, "ln1.bias"));
    ctx.trace?.record(`${id}.ln1`, ln1, [64, d]);
    const relName = wname(stage, "attn.rel_bias");
    const attnW = {
      qkvW: m.w(stage, "attn.qkv.weight"),
      qkvB: m.w(stage, "attn.qkv.bias"),
      projW: m.w(stage, "attn.proj.weight"),
      projB: m.w(stage, "attn.proj.bias"),
      relBias: relName ? m.capsule.data(relName) : void 0
    };
    const attn = geoSelfAttention(ln1, d, heads, attnW, ctx.trace, `${id}.attn`);
    ctx.trace?.record(`${id}.attn`, attn, [64, d]);
    const postAttn = new Float32Array(64 * d);
    for (let i = 0; i < postAttn.length; i++) postAttn[i] = x[i] + attn[i];
    ctx.trace?.record(`${id}.postAttn`, postAttn, [64, d]);
    const ln2 = layerNorm(postAttn, 64, d, m.w(stage, "ln2.weight"), m.w(stage, "ln2.bias"));
    ctx.trace?.record(`${id}.ln2`, ln2, [64, d]);
    const ffn0W = m.w(stage, "ffn.0.weight");
    const ffn0B = m.w(stage, "ffn.0.bias");
    const hidden = ffn0B.length;
    const h1 = linear(ln2, 64, d, ffn0W, hidden, ffn0B);
    const a1 = gelu(h1);
    const ffnOut = linear(a1, 64, hidden, m.w(stage, "ffn.2.weight"), d, m.w(stage, "ffn.2.bias"));
    ctx.trace?.record(`${id}.ffn`, ffnOut, [64, d]);
    const out = new Float32Array(64 * d);
    for (let i = 0; i < out.length; i++) out[i] = postAttn[i] + ffnOut[i];
    ctx.trace?.record(`${id}.postFfn`, out, [64, d]);
    return { data: out, shape: [64, d] };
  },
  layernorm(m, stage, inputs, ctx) {
    const x = inputs[0].data;
    const d = Number(stage.dims.d);
    const y = layerNorm(x, 64, d, m.w(stage, "weight"), m.w(stage, "bias"));
    ctx.trace?.record(stage.id, y, [64, d]);
    return { data: y, shape: [64, d] };
  },
  policy_head(m, stage, inputs, ctx) {
    const t = inputs[0].data;
    const C = inputs[0].shape[1];
    const W = m.w(stage, "policy_head.weight");
    const b = m.w(stage, "policy_head.bias");
    const logits = linear(t, 64, C, W, NUM_MOVE_TYPES, b);
    const out = logits.length === NUM_MOVES ? logits : logits.subarray(0, NUM_MOVES);
    ctx.policyLogits = out;
    ctx.trace?.record("policy_logits", out, [NUM_MOVES]);
    return { data: out, shape: [NUM_MOVES] };
  },
  value_head(m, stage, inputs, ctx) {
    const t = inputs[0].data;
    const C = inputs[0].shape[1];
    const pooled = meanPool(t, 64, C);
    const h1 = linear(pooled, 1, C, m.w(stage, "value_fc1.weight"), Number(stage.dims.hidden), m.w(stage, "value_fc1.bias"));
    reluInplace(h1);
    const pre = linear(h1, 1, h1.length, m.w(stage, "value_fc2.weight"), 1, m.w(stage, "value_fc2.bias"));
    const value = Math.tanh(pre[0]);
    ctx.value = value;
    ctx.trace?.record("value", new Float32Array([value]), [1]);
    return { data: new Float32Array([value]), shape: [1] };
  }
};
function convStem(m, stage, inputs, ctx) {
  const x = inputs[0].data;
  const wName = stage.weights.find((n) => n.endsWith("weight"));
  const bName = stage.weights.find((n) => n.endsWith("bias"));
  const Wt = m.capsule.tensor(wName);
  const [cOut, cIn, k] = [Wt.shape[0], Wt.shape[1], Wt.shape[Wt.shape.length - 1]];
  const b = bName ? m.capsule.data(bName) : void 0;
  const out = conv2d(x, cIn, 8, 8, Wt.data, cOut, k, b);
  reluInplace(out);
  ctx.trace?.record("embed", out, [cOut, 8, 8]);
  return { data: out, shape: [cOut, 8, 8] };
}
var Model = class {
  capsule;
  constructor(capsule) {
    this.capsule = capsule;
  }
  /** Stage-scoped tensor lookup by suffix. */
  w(stage, suffix) {
    const name = wname(stage, suffix);
    if (!name) throw new Error(`Stage "${stage.id}" has no weight ending in "${suffix}".`);
    return this.capsule.data(name);
  }
  /**
   * Run the forward pass over `planes` (Float32Array of input_planes·64,
   * plane-major, position h*8+w). Returns raw policy logits + value, plus the
   * trace if a recorder is supplied.
   */
  forward(planes, opts = {}) {
    const ctx = { acts: /* @__PURE__ */ new Map(), trace: opts.trace };
    const planesStage = this.capsule.graph.find((s) => s.kind === "input_planes");
    const planeId = planesStage ? planesStage.id : "io.planes";
    const inPlanes = this.capsule.config.input_planes;
    ctx.trace?.record("planes", planes, [inPlanes, 8, 8]);
    ctx.acts.set(planeId, { data: planes, shape: [inPlanes, 8, 8] });
    for (const stage of this.capsule.graph) {
      const fn = REGISTRY[stage.kind];
      if (!fn) throw new Error(`No compute registered for stage kind "${stage.kind}" (stage ${stage.id}).`);
      const inputs = stage.reads.map((r) => {
        const a = ctx.acts.get(r);
        if (!a) throw new Error(`Stage "${stage.id}" reads "${r}" which has no activation.`);
        return a;
      });
      const out = fn(this, stage, inputs, ctx);
      if (out) ctx.acts.set(stage.id, out);
    }
    if (!ctx.policyLogits || ctx.value === void 0) {
      throw new Error("Forward pass did not produce both policy and value heads.");
    }
    return { policyLogits: ctx.policyLogits, value: ctx.value, trace: opts.trace };
  }
};

// bobs-bath/model/src/trace.ts
var RANK = { outputs: 0, stage: 1, full: 2 };
var TraceRecorder = class {
  entries = /* @__PURE__ */ new Map();
  bytes = 0;
  capped = false;
  granularity;
  maxBytes;
  constructor(opts = {}) {
    this.granularity = opts.granularity ?? "full";
    this.maxBytes = opts.maxBytes ?? 64 * 1024 * 1024;
  }
  /**
   * Record an intermediate. `level` is the minimum granularity at which this
   * tensor is kept (default 'full'); coarser runs skip it. Data is copied.
   */
  record(name, data, shape, level = "full") {
    if (RANK[this.granularity] < RANK[level]) return;
    const nbytes = data.length * 4;
    if (this.bytes + nbytes > this.maxBytes) {
      this.capped = true;
      return;
    }
    this.entries.set(name, { data: Float32Array.from(data), shape: shape.slice() });
    this.bytes += nbytes;
  }
  has(name) {
    return this.entries.has(name);
  }
  get(name) {
    return this.entries.get(name);
  }
  finalize() {
    return {
      entries: this.entries,
      bytes: this.bytes,
      granularity: this.granularity,
      capped: this.capped
    };
  }
};

// bobs-bath/model/src/featurize.ts
var NUM_PLANES = 21;
var PLANE_OF = { p: 0, r: 1, n: 2, b: 3, q: 4, k: 5 };
function idx(plane, h, w) {
  return plane * 64 + h * 8 + w;
}
function featurizeWhiteToMove(b) {
  const x = new Float32Array(NUM_PLANES * 64);
  for (const pc of b.pieces()) {
    const h = pc.square >> 3;
    const w = pc.square & 7;
    const base = pc.color === "w" ? 0 : 6;
    x[idx(base + PLANE_OF[pc.type], h, w)] = 1;
  }
  if (b.hasKingsideCastlingRights("w")) fill(x, 12);
  if (b.hasQueensideCastlingRights("w")) fill(x, 13);
  if (b.hasKingsideCastlingRights("b")) fill(x, 14);
  if (b.hasQueensideCastlingRights("b")) fill(x, 15);
  if (b.epSquare != null) x[idx(16, b.epSquare >> 3, b.epSquare & 7)] = 1;
  fillVal(x, 17, Math.min(b.halfmoveClock / 100, 1));
  fillVal(x, 18, Math.min(b.fullmoveNumber / 100, 2));
  fillVal(x, 19, 1);
  fillVal(x, 20, repetitionValue(b));
  return x;
}
function featurizeBlackToMove(b) {
  const x = new Float32Array(NUM_PLANES * 64);
  for (const pc of b.pieces()) {
    const h = 7 - (pc.square >> 3);
    const w = pc.square & 7;
    const base = pc.color === "b" ? 0 : 6;
    x[idx(base + PLANE_OF[pc.type], h, w)] = 1;
  }
  if (b.hasKingsideCastlingRights("b")) fill(x, 12);
  if (b.hasQueensideCastlingRights("b")) fill(x, 13);
  if (b.hasKingsideCastlingRights("w")) fill(x, 14);
  if (b.hasQueensideCastlingRights("w")) fill(x, 15);
  if (b.epSquare != null) x[idx(16, 7 - (b.epSquare >> 3), b.epSquare & 7)] = 1;
  fillVal(x, 17, Math.min(b.halfmoveClock / 100, 1));
  fillVal(x, 18, Math.min(b.fullmoveNumber / 100, 2));
  fillVal(x, 19, 1);
  fillVal(x, 20, repetitionValue(b));
  return x;
}
function repetitionValue(b) {
  if (b.isRepetition(3)) return 1;
  if (b.isRepetition(2)) return 0.5;
  return 0;
}
function fill(x, plane) {
  x.fill(1, plane * 64, plane * 64 + 64);
}
function fillVal(x, plane, v) {
  if (v !== 0) x.fill(v, plane * 64, plane * 64 + 64);
}
function featurize(board, mode = "float") {
  const x = board.turn === "w" ? featurizeWhiteToMove(board) : featurizeBlackToMove(board);
  if (mode === "trained") applyInt8Truncation(x);
  return x;
}
function applyInt8Truncation(x) {
  for (let i = 0; i < x.length; i++) x[i] = Math.trunc(x[i]);
  return x;
}

// bobs-bath/model/src/index.ts
function resolveRecorder(t) {
  if (!t) return void 0;
  if (t instanceof TraceRecorder) return t;
  if (t === true) return new TraceRecorder();
  return new TraceRecorder(t);
}
function softmaxAll(logits) {
  let mx = -Infinity;
  for (let i = 0; i < logits.length; i++) if (logits[i] > mx) mx = logits[i];
  const out = new Float32Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) {
    const e = Math.exp(logits[i] - mx);
    out[i] = e;
    sum += e;
  }
  const inv = 1 / sum;
  for (let i = 0; i < out.length; i++) out[i] *= inv;
  return out;
}
var EngineImpl = class {
  capsule;
  model;
  constructor(capsule) {
    this.capsule = capsule;
    this.model = new Model(capsule);
  }
  get config() {
    return this.capsule.config;
  }
  get graph() {
    return this.capsule.graph;
  }
  forward(planes, opts = {}) {
    const recorder = resolveRecorder(opts.trace);
    const { policyLogits, value } = this.model.forward(planes, { trace: recorder });
    const probs = softmaxAll(policyLogits);
    let bestLegalIndex = -1;
    const mask = opts.legalMask;
    if (mask) {
      let total = 0;
      let bestLogit = -Infinity;
      for (let i = 0; i < NUM_MOVES; i++) {
        if (mask[i]) {
          total += probs[i];
          if (policyLogits[i] > bestLogit) {
            bestLogit = policyLogits[i];
            bestLegalIndex = i;
          }
        } else {
          probs[i] = 0;
        }
      }
      if (total > 0) {
        const inv = 1 / total;
        for (let i = 0; i < NUM_MOVES; i++) probs[i] *= inv;
      }
    } else {
      let bestLogit = -Infinity;
      for (let i = 0; i < NUM_MOVES; i++) {
        if (policyLogits[i] > bestLogit) {
          bestLogit = policyLogits[i];
          bestLegalIndex = i;
        }
      }
    }
    return {
      policyLogits,
      policyProbs: probs,
      value,
      bestLegalIndex,
      trace: recorder?.finalize()
    };
  }
};
function createEngineFromBytes(manifest, weights) {
  return new EngineImpl(loadCapsuleFromBytes(manifest, weights));
}
async function createEngine(capsuleUrl) {
  return new EngineImpl(await fetchCapsule(capsuleUrl));
}
export {
  Capsule,
  Model,
  NUM_MOVES,
  NUM_MOVE_TYPES,
  NUM_PLANES,
  TraceRecorder,
  applyInt8Truncation,
  createEngine,
  createEngineFromBytes,
  decodeMove,
  encodeMove,
  featurize,
  fetchCapsule,
  legalMask,
  legalPolicySoftmax,
  loadCapsuleFromBytes,
  pieceToMoveProbs,
  relIndex,
  rotateSquare
};
