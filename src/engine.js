const TAU = Math.PI * 2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const ease = (current, target, dt, speed) => current + (target - current) * (1 - Math.exp(-dt * speed));
const palettes = [
  [[1.0, .38, .36], [.72, .54, 1.0], [.37, .83, 1.0]],
  [[1.0, .69, .32], [.96, .42, .32], [.38, .94, .82]],
  [[.56, .79, 1.0], [.78, .88, 1.0], [.94, .98, 1.0]],
];
const defaults = { scene: 0, palette: 0, speed: .7, intensity: .75, seed: 71483, paused: false };

function normalize(input, previous = defaults) {
  const next = { ...previous };
  if (Number.isFinite(input.scene)) next.scene = clamp(Math.round(input.scene), 0, 2);
  if (Number.isFinite(input.palette)) next.palette = clamp(Math.round(input.palette), 0, 2);
  if (Number.isFinite(input.speed)) next.speed = clamp(input.speed, .25, 1.5);
  if (Number.isFinite(input.intensity)) next.intensity = clamp(input.intensity, 0, 1);
  if (Number.isFinite(input.seed)) next.seed = Math.trunc(input.seed) >>> 0;
  if (typeof input.paused === 'boolean') next.paused = input.paused;
  return next;
}
function randomSource(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let z = value;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng) { return Math.sqrt(-2 * Math.log(Math.max(1e-7, rng()))) * Math.cos(TAU * rng()); }
function makeParticles(count, seed) {
  const rng = randomSource(seed);
  const forms = [new Float32Array(count * 3), new Float32Array(count * 3), new Float32Array(count * 3)];
  const meta = new Float32Array(count * 4);
  const columns = Math.ceil(Math.sqrt(count * 1.55));
  const rows = Math.ceil(count / columns);
  for (let i = 0; i < count; i++) {
    const j = i * 3, m = i * 4;
    const u = rng(), v = rng(), w = rng();
    const core = i % 9 === 0;
    const radius = core ? Math.pow(rng(), 1.6) * 1.32 : Math.pow(rng(), .68) * 2.93;
    const arm = i % 5;
    const theta = arm * TAU / 5 + radius * 1.44 + gaussian(rng) * (.08 + radius * .065);
    forms[0][j] = Math.cos(theta) * radius + gaussian(rng) * .045;
    forms[0][j + 1] = Math.sin(theta) * radius * .65 + gaussian(rng) * (.065 + radius * .027);
    forms[0][j + 2] = gaussian(rng) * (.12 + radius * .055);

    const t = TAU * ((i + rng() * .66) / count * 17 % 1);
    const tube = TAU * rng();
    const petal = 1.32 + .36 * Math.cos(7 * t + .3);
    const thickness = .16 + .065 * Math.sin(7 * t);
    const ring = petal + Math.cos(tube) * thickness + gaussian(rng) * .022;
    forms[1][j] = Math.cos(t) * ring;
    forms[1][j + 1] = Math.sin(t) * ring * .92;
    forms[1][j + 2] = .58 * Math.sin(3 * t) + Math.sin(tube) * thickness * 1.5;

    const col = i % columns, row = Math.floor(i / columns);
    const gx = (col / Math.max(1, columns - 1) - .5) * 6.4;
    const gy = row / Math.max(1, rows - 1);
    forms[2][j] = gx + (rng() - .5) * .018;
    forms[2][j + 1] = -1.42 + gy * 2.65 + .20 * Math.sin(gx * 2.6 + gy * 13) + .11 * Math.sin(gx * 5.4 - gy * 8);
    forms[2][j + 2] = (gy - .5) * 2.5;

    meta[m] = radius / 3;
    meta[m + 1] = u;
    meta[m + 2] = .68 + Math.pow(v, 6) * 2.3;
    meta[m + 3] = w * TAU;
  }
  const dust = new Float32Array(900 * 4);
  for (let i = 0; i < 900; i++) {
    const j = i * 4;
    dust[j] = rng() * 2 - 1;
    dust[j + 1] = rng() * 2 - 1;
    dust[j + 2] = .25 + rng() * .75;
    dust[j + 3] = rng();
  }
  return { forms, meta, dust, count };
}
const vertex = `
precision highp float;
attribute vec3 aNebula;
attribute vec3 aBloom;
attribute vec3 aTidal;
attribute vec4 aMeta;
uniform vec3 uWeights;
uniform float uTime;
uniform float uScale;
uniform float uScaleY;
uniform vec2 uCenter;
uniform vec2 uPointer;
uniform float uPull;
uniform vec2 uHover;
uniform float uPulseAge;
uniform vec2 uPulsePoint;
uniform float uDpr;
uniform mediump float uPass;
uniform vec3 uCore;
uniform vec3 uMid;
uniform vec3 uEdge;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec3 nebula = aNebula;
  float spin = .045 * sin(uTime * .22 + aMeta.x * 4.0 + aMeta.w);
  nebula.xy = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * nebula.xy;
  nebula.y += .045 * sin(uTime * .65 + aMeta.w);
  vec3 bloom = aBloom;
  bloom.xy *= 1.0 + .06 * sin(uTime * .9 + aMeta.w);
  bloom.z += .09 * sin(uTime * .7 + aMeta.w);
  vec3 tidal = aTidal;
  tidal.y += (.28 * sin(tidal.x * 2.4 + tidal.z * 2.1 - uTime * 1.1)
    + .12 * sin(tidal.x * 5.1 - tidal.z * 3.0 + uTime * .72));
  vec3 p = nebula * uWeights.x + bloom * uWeights.y + tidal * uWeights.z;
  float depth = 1.0 / (1.0 + p.z * .13);
  vec2 xy = vec2(p.x * .305 * uScale, p.y * .47 * uScaleY) * depth + uCenter;
  xy += uHover * (.018 + .014 * p.z);
  vec2 toPointer = uPointer - xy;
  float attraction = exp(-dot(toPointer, toPointer) * 3.8);
  xy += toPointer * uPull * attraction * (.27 + .07 * aMeta.y);
  float pulse = 0.0;
  if (uPulseAge >= 0.0 && uPulseAge < 4.0) {
    float pulseRadius = uPulseAge * .8;
    float pulseDist = length(xy - uPulsePoint);
    pulse = exp(-pow((pulseDist - pulseRadius) * 8.0, 2.0)) * exp(-uPulseAge * .9);
    xy += normalize(xy - uPulsePoint + vec2(.0001)) * pulse * .045;
  }
  gl_Position = vec4(xy, clamp(-p.z * .06, -.9, .9), 1.0);
  float radial = clamp(aMeta.x * uWeights.x + (abs(aBloom.z) * .9 + .18) * uWeights.y
    + (aTidal.y + 1.45) * .34 * uWeights.z, 0.0, 1.0);
  vColor = mix(uCore, uMid, smoothstep(.06, .57, radial));
  vColor = mix(vColor, uEdge, smoothstep(.40, 1.0, radial));
  vColor = mix(vColor, vec3(1.0), pow(aMeta.y, 18.0) * .55 + pulse * .22);
  vAlpha = (.37 + .6 * pow(aMeta.y, 2.0)) * (uPass < .5 ? .16 : .72);
  float size = (1.35 + aMeta.z * 1.25) * uDpr * depth;
  gl_PointSize = clamp(size * (uPass < .5 ? 5.5 : 1.0), 1.0, uPass < .5 ? 23.0 : 7.0);
}`;
const fragment = `
precision mediump float;
uniform float uIntensity;
uniform mediump float uPass;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - .5;
  float r2 = dot(uv, uv) * 4.0;
  float glow = uPass < .5 ? exp(-r2 * 4.8) : exp(-r2 * 5.6);
  float alpha = glow * vAlpha * (.3 + uIntensity * .9);
  gl_FragColor = vec4(vColor * (uPass < .5 ? .50 : 1.0), alpha);
}`;
const backdropVertex = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() { vUv = aPosition * .5 + .5; gl_Position = vec4(aPosition, 0.0, 1.0); }
`;
const backdropFragment = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uCenterUv;
uniform vec3 uTint;
uniform float uTime;
void main() {
  float d = length((vUv - uCenterUv) * vec2(1.0, 1.45));
  float halo = exp(-d * d * 7.0);
  float horizon = smoothstep(0.0, 1.0, vUv.y);
  vec3 base = mix(vec3(.013, .018, .042), vec3(.018, .027, .065), horizon);
  base += uTint * halo * .052;
  base += vec3(.018, .020, .043) * exp(-pow((vUv.y - .1) * 3.0, 2.0));
  gl_FragColor = vec4(base, 1.0);
}`;
const dustVertex = `
precision mediump float;
attribute vec4 aDust;
uniform vec2 uHover;
uniform float uTime;
uniform float uDpr;
varying float vAlpha;
void main() {
  vec2 p = aDust.xy + uHover * (aDust.z * .055);
  gl_Position = vec4(p, .8, 1.0);
  gl_PointSize = (aDust.w > .992 ? 2.4 : 1.05) * uDpr;
  vAlpha = (.13 + .52 * pow(aDust.w, 8.0)) * (.88 + .12 * sin(uTime * .65 + aDust.w * 33.0));
}`;
const dustFragment = `
precision mediump float;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord - .5;
  float a = exp(-dot(p,p) * 11.0) * vAlpha;
  gl_FragColor = vec4(.58, .72, 1.0, a);
}`;
function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const error = gl.getShaderInfoLog(shader) || 'Unknown shader error';
    gl.deleteShader(shader);
    throw new Error(error);
  }
  return shader;
}
function program(gl, vs, fs) {
  const a = compile(gl, gl.VERTEX_SHADER, vs), b = compile(gl, gl.FRAGMENT_SHADER, fs);
  const output = gl.createProgram();
  gl.attachShader(output, a); gl.attachShader(output, b); gl.linkProgram(output);
  gl.deleteShader(a); gl.deleteShader(b);
  if (!gl.getProgramParameter(output, gl.LINK_STATUS)) {
    const error = gl.getProgramInfoLog(output) || 'Unknown link error';
    gl.deleteProgram(output);
    throw new Error(error);
  }
  return output;
}
function bindAttribute(gl, programObject, name, data, size, resources) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  const location = gl.getAttribLocation(programObject, name);
  if (location >= 0) {
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }
  resources.push(buffer);
  return { buffer, location, size };
}
function activate(gl, attr) {
  if (attr.location < 0) return;
  gl.bindBuffer(gl.ARRAY_BUFFER, attr.buffer);
  gl.enableVertexAttribArray(attr.location);
  gl.vertexAttribPointer(attr.location, attr.size, gl.FLOAT, false, 0, 0);
}
function uniformLocations(gl, programObject, names) {
  return Object.fromEntries(names.map(name => [name, gl.getUniformLocation(programObject, name)]));
}
function createGpu(gl, particles) {
  const resources = [];
  const main = program(gl, vertex, fragment);
  const back = program(gl, backdropVertex, backdropFragment);
  const stars = program(gl, dustVertex, dustFragment);
  gl.useProgram(main);
  const attrs = {
    neb: bindAttribute(gl, main, 'aNebula', particles.forms[0], 3, resources),
    bloom: bindAttribute(gl, main, 'aBloom', particles.forms[1], 3, resources),
    tidal: bindAttribute(gl, main, 'aTidal', particles.forms[2], 3, resources),
    meta: bindAttribute(gl, main, 'aMeta', particles.meta, 4, resources),
  };
  gl.useProgram(back);
  const quad = bindAttribute(gl, back, 'aPosition', new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), 2, resources);
  gl.useProgram(stars);
  const dust = bindAttribute(gl, stars, 'aDust', particles.dust, 4, resources);
  const uniforms = {
    main: uniformLocations(gl, main, ['uWeights','uTime','uScale','uScaleY','uCenter','uPointer','uPull','uHover','uPulseAge','uPulsePoint','uDpr','uIntensity','uCore','uMid','uEdge','uPass']),
    back: uniformLocations(gl, back, ['uCenterUv','uTint','uTime']),
    stars: uniformLocations(gl, stars, ['uHover','uTime','uDpr']),
  };
  return { main, back, stars, attrs, quad, dust, resources, uniforms };
}
function deleteGpu(gl, gpu) {
  if (!gpu) return;
  for (const buffer of gpu.resources) gl.deleteBuffer(buffer);
  gl.deleteProgram(gpu.main); gl.deleteProgram(gpu.back); gl.deleteProgram(gpu.stars);
}

/** Render a living particle artwork into a supplied canvas. All coordinates are canvas-normalized. */
export function createEngine(canvas, options = {}) {
  const onError = typeof options.onError === 'function' ? options.onError : () => {};
  const onStats = typeof options.onStats === 'function' ? options.onStats : () => {};
  const onNotice = typeof options.onNotice === 'function' ? options.onNotice : () => {};
  const report = message => { try { onError(message); } catch (_) {} };
  const stats = value => { try { onStats(value); } catch (_) {} };
  let state = normalize(options.state || {});
  if (options.reducedMotion) state.paused = true;
  let surface = canvas, gl = null, gpu = null, ctx = null, mode = 'canvas2d';
  let fallbackCanvas = null;
  let particles = makeParticles(typeof window !== 'undefined' && window.innerWidth < 720 ? 16000 : 36000, state.seed);
  let disposed = false, lost = false, frame = 0, last = 0, clock = 0, fps = 0, frames = 0, statsAt = 0;
  let weights = [0, 0, 0]; weights[state.scene] = 1;
  let pull = 0, hover = [0, 0], pointer = [.5, .5], held = false;
  let pulseAt = -100, pulsePoint = [.57, .5];
  let dpr = 1, width = 1, height = 1, observer = null;
  const projectionScale = () => {
    const aspect = width / height;
    const x = aspect < .82 ? .86 : 1;
    return [x, x * Math.min(1, aspect / .85)];
  };
  const fallbackStep = () => Math.max(1, Math.ceil(particles.count / 1800));
  const visibleParticles = () => mode === 'webgl' ? particles.count : mode === 'canvas2d' ? Math.ceil(particles.count / fallbackStep()) : 0;
  const centerX = () => width / height < .82 ? .5 : .57;
  const visible = () => typeof document === 'undefined' || !document.hidden;
  function addFallbackSurface() {
    if (!surface || !surface.parentNode || typeof document === 'undefined') return false;
    const fresh = document.createElement('canvas');
    fresh.setAttribute('aria-hidden', 'true');
    fresh.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    fresh.width = surface.width; fresh.height = surface.height;
    surface.parentNode.insertBefore(fresh, surface);
    originalOpacity = originalCanvas.style.opacity;
    originalCanvas.style.opacity = '0';
    fallbackCanvas = fresh;
    surface = fresh;
    return true;
  }
  function fallback(message) {
    if (message) console.warn(message);
    if (gl) {
      deleteGpu(gl, gpu); gpu = null; gl = null;
      addFallbackSurface();
    }
    try { ctx = surface.getContext('2d', { alpha: false }); } catch (_) { ctx = null; }
    mode = ctx ? 'canvas2d' : 'unavailable';
    if (!ctx) report('Afterlight could not start graphics. Reload the page or enable canvas rendering in your browser.');
    else {
      report('');
      try { onNotice('Using a lighter Canvas 2D artwork on this browser.'); } catch (_) {}
    }
    resize(); stats({ particles: visibleParticles(), fps: 0, renderer: mode });
  }
  function init() {
    try {
      gl = surface.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
        || surface.getContext('experimental-webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
      if (!gl) { fallback('WebGL is unavailable. Afterlight is using Canvas 2D.'); return; }
      gpu = createGpu(gl, particles);
      mode = 'webgl';
      stats({ particles: particles.count, fps: 0, renderer: mode });
    } catch (error) { fallback(`WebGL could not start (${error.message}). Afterlight is using Canvas 2D.`); }
  }
  function resize() {
    if (disposed || !surface) return;
    const rect = originalCanvas.getBoundingClientRect();
    width = Math.max(1, rect.width || originalCanvas.clientWidth || window.innerWidth || 1);
    height = Math.max(1, rect.height || originalCanvas.clientHeight || window.innerHeight || 1);
    dpr = Math.min(1.75, Math.max(1, window.devicePixelRatio || 1));
    const pixelWidth = Math.round(width * dpr), pixelHeight = Math.round(height * dpr);
    const changed = surface.width !== pixelWidth || surface.height !== pixelHeight;
    if (changed) {
      surface.width = pixelWidth; surface.height = pixelHeight;
    }
    if (gl && !lost) gl.viewport(0, 0, pixelWidth, pixelHeight);
    if (changed) draw();
  }
  function drawGpu() {
    if (!gl || !gpu || lost) return;
    const palette = palettes[state.palette];
    const c = centerX();
    const h = [hover[0], hover[1]];
    const age = clock - pulseAt;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(gpu.back);
    activate(gl, gpu.quad);
    gl.uniform2f(gpu.uniforms.back.uCenterUv, c, .5);
    gl.uniform3fv(gpu.uniforms.back.uTint, palette[1]);
    gl.uniform1f(gpu.uniforms.back.uTime, clock);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.useProgram(gpu.stars);
    activate(gl, gpu.dust);
    gl.uniform2fv(gpu.uniforms.stars.uHover, h);
    gl.uniform1f(gpu.uniforms.stars.uTime, clock);
    gl.uniform1f(gpu.uniforms.stars.uDpr, dpr);
    gl.drawArrays(gl.POINTS, 0, 900);
    gl.useProgram(gpu.main);
    for (const attr of Object.values(gpu.attrs)) activate(gl, attr);
    const [scaleX, scaleY] = projectionScale();
    const u = gpu.uniforms.main;
    gl.uniform3fv(u.uWeights, weights);
    gl.uniform1f(u.uTime, clock);
    gl.uniform1f(u.uScale, scaleX);
    gl.uniform1f(u.uScaleY, scaleY);
    gl.uniform2f(u.uCenter, c * 2 - 1, 0);
    gl.uniform2f(u.uPointer, pointer[0] * 2 - 1, 1 - pointer[1] * 2);
    gl.uniform1f(u.uPull, pull);
    gl.uniform2fv(u.uHover, h);
    gl.uniform1f(u.uPulseAge, age);
    gl.uniform2f(u.uPulsePoint, pulsePoint[0] * 2 - 1, 1 - pulsePoint[1] * 2);
    gl.uniform1f(u.uDpr, dpr);
    gl.uniform1f(u.uIntensity, state.intensity);
    gl.uniform3fv(u.uCore, palette[0]);
    gl.uniform3fv(u.uMid, palette[1]);
    gl.uniform3fv(u.uEdge, palette[2]);
    for (let pass = 0; pass < 2; pass++) {
      gl.uniform1f(u.uPass, pass);
      gl.drawArrays(gl.POINTS, 0, particles.count);
    }
    gl.disable(gl.BLEND);
  }
  function drawFallback() {
    if (!ctx) return;
    const w = surface.width, h = surface.height;
    const palette = palettes[state.palette];
    ctx.fillStyle = '#040817'; ctx.fillRect(0, 0, w, h);
    const cx = centerX() * w, cy = h * .5;
    const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * .66);
    const rgb = palette[1].map(v => Math.round(v * 255));
    halo.addColorStop(0, `rgba(${rgb.join(',')},.11)`);
    halo.addColorStop(1, 'rgba(4,8,23,0)');
    ctx.fillStyle = halo; ctx.fillRect(0, 0, w, h);
    const dust = particles.dust;
    for (let i = 0; i < dust.length; i += 4) {
      const x = (dust[i] * .5 + .5) * w + hover[0] * dust[i + 2] * 11 * dpr;
      const y = (1 - (dust[i + 1] * .5 + .5)) * h + hover[1] * dust[i + 2] * 11 * dpr;
      ctx.fillStyle = `rgba(166,197,255,${.08 + dust[i + 3] * .32})`;
      ctx.fillRect(x, y, dust[i + 3] > .99 ? 2 * dpr : dpr, dust[i + 3] > .99 ? 2 * dpr : dpr);
    }
    ctx.globalCompositeOperation = 'lighter';
    const step = fallbackStep();
    const [scaleX, scaleY] = projectionScale();
    for (let i = 0; i < particles.count; i += step) {
      const j = i * 3, m = i * 4;
      let x = 0, y = 0, z = 0;
      for (let s = 0; s < 3; s++) {
        const f = particles.forms[s], weight = weights[s];
        if (weight < .001) continue;
        x += f[j] * weight; y += f[j + 1] * weight; z += f[j + 2] * weight;
      }
      y += weights[2] * (.25 * Math.sin(x * 2.4 + z * 2.1 - clock));
      x += weights[0] * .04 * Math.sin(clock * .35 + particles.meta[m + 3]);
      const depth = 1 / (1 + z * .13);
      let px = cx + x * .1525 * w * scaleX * depth + hover[0] * w * .018;
      let py = cy - y * .235 * h * scaleY * depth - hover[1] * h * .018;
      const deltaX = pointer[0] * w - px, deltaY = pointer[1] * h - py;
      const attraction = Math.exp(-(deltaX * deltaX / (w * w) + deltaY * deltaY / (h * h)) * 13);
      px += deltaX * pull * attraction * .3; py += deltaY * pull * attraction * .3;
      const t = clamp(particles.meta[m] * weights[0] + Math.abs(z) * .3 * weights[1] + (y + 1.4) * .3 * weights[2], 0, 1);
      const from = t < .5 ? palette[0] : palette[1], to = t < .5 ? palette[1] : palette[2], blend = t < .5 ? t * 2 : (t - .5) * 2;
      const color = from.map((v, k) => Math.round((v + (to[k] - v) * blend) * 255));
      const size = (particles.meta[m + 2] * .75 + .4) * dpr;
      ctx.fillStyle = `rgba(${color.join(',')},${(.11 + state.intensity * .25).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(px, py, size * 2.6, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(${color.join(',')},${(.3 + state.intensity * .52).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(px, py, size * .56, 0, TAU); ctx.fill();
    }
    const age = clock - pulseAt;
    if (age >= 0 && age < 3.5) {
      ctx.strokeStyle = `rgba(154,195,255,${(1 - age / 3.5) * .25})`;
      ctx.lineWidth = 1.5 * dpr;
      ctx.beginPath(); ctx.arc(pulsePoint[0] * w, pulsePoint[1] * h, age * Math.min(w, h) * .38, 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function draw() { if (mode === 'webgl') drawGpu(); else drawFallback(); }
  function tick(now) {
    frame = 0;
    if (disposed || !visible() || state.paused) return;
    const dt = last ? clamp((now - last) / 1000, 0, .05) : 0;
    last = now;
    clock += dt * state.speed;
    const target = [0, 0, 0]; target[state.scene] = 1;
    for (let i = 0; i < 3; i++) weights[i] = ease(weights[i], target[i], dt, 3.4);
    pull = ease(pull, held ? 1 : 0, dt, held ? 5 : 3.4);
    const hoverTarget = [(pointer[0] - .5) * .8, (.5 - pointer[1]) * .8];
    for (let i = 0; i < 2; i++) hover[i] = ease(hover[i], hoverTarget[i], dt, 1.8);
    draw();
    frames++;
    if (now - statsAt > 1000) {
      fps = Math.round(frames * 1000 / Math.max(1, now - statsAt));
      frames = 0; statsAt = now;
      stats({ particles: visibleParticles(), fps, renderer: mode });
    }
    frame = requestAnimationFrame(tick);
  }
  function schedule() {
    if (disposed || lost || !visible() || state.paused) return;
    if (!frame) { last = 0; frame = requestAnimationFrame(tick); }
  }
  function onVisibility() { if (visible()) schedule(); else { cancelAnimationFrame(frame); frame = 0; last = 0; } }
  function onContextLost(event) {
    if (mode !== 'webgl') return;
    event.preventDefault(); lost = true;
    cancelAnimationFrame(frame); frame = 0;
    report('Graphics context was lost. Afterlight will resume when the browser restores it; reload if it does not.');
  }
  function onContextRestored() {
    if (mode !== 'webgl') return;
    try { gpu = createGpu(gl, particles); lost = false; resize(); draw(); report(''); schedule(); }
    catch (error) { lost = false; fallback(`Graphics restoration failed (${error.message}). Afterlight is using Canvas 2D.`); schedule(); }
  }
  const originalCanvas = canvas;
  let originalOpacity = '';
  if (canvas && typeof canvas.addEventListener === 'function') {
    canvas.addEventListener('webglcontextlost', onContextLost);
    canvas.addEventListener('webglcontextrestored', onContextRestored);
  }
  init(); resize(); draw();
  observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (observer) observer.observe(originalCanvas);
  if (typeof window !== 'undefined') window.addEventListener('resize', resize);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);
  schedule();
  return {
    update(patch = {}) {
      if (disposed) return;
      const prior = state;
      state = normalize(patch, state);
      if (state.paused && state.scene !== prior.scene) {
        weights = [0, 0, 0]; weights[state.scene] = 1;
      }
      if (state.seed !== prior.seed) {
        particles = makeParticles(particles.count, state.seed);
        if (gl && !lost) {
          try { deleteGpu(gl, gpu); gpu = createGpu(gl, particles); }
          catch (error) { fallback(`Graphics regeneration failed (${error.message}). Afterlight is using Canvas 2D.`); }
        }
      }
      if (state.paused) { cancelAnimationFrame(frame); frame = 0; last = 0; draw(); }
      else schedule();
    },
    pointer(x, y, down) {
      if (disposed) return;
      pointer = [clamp(Number.isFinite(x) ? x : .5, 0, 1), clamp(Number.isFinite(y) ? y : .5, 0, 1)];
      held = Boolean(down);
    },
    pulse() { if (!disposed) { pulseAt = clock; pulsePoint = [...pointer]; if (state.paused) draw(); } },
    snapshot() {
      return new Promise((resolve, reject) => {
        if (disposed || !surface || mode === 'unavailable' || lost || typeof surface.toBlob !== 'function') {
          reject(new Error('Snapshot unavailable: artwork is closed or graphics are unavailable.')); return;
        }
        try {
          draw();
          surface.toBlob(blob => blob ? resolve(blob) : reject(new Error('Snapshot failed. Try again or reload the page.')), 'image/png');
        } catch (error) { reject(new Error(`Snapshot failed: ${error.message}`)); }
      });
    },
    destroy() {
      if (disposed) return;
      disposed = true; cancelAnimationFrame(frame); frame = 0;
      if (observer) observer.disconnect();
      if (typeof window !== 'undefined') window.removeEventListener('resize', resize);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      originalCanvas.removeEventListener('webglcontextlost', onContextLost);
      originalCanvas.removeEventListener('webglcontextrestored', onContextRestored);
      if (gl && !lost) deleteGpu(gl, gpu);
      if (fallbackCanvas) { fallbackCanvas.remove(); originalCanvas.style.opacity = originalOpacity; }
      gpu = null; gl = null; ctx = null;
    },
  };
}
