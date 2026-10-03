import { createEngine } from './engine.js';
import { createAudio } from './audio.js';
import { SCENES, parseScene, serializeScene, newSeed } from './state.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#universe');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let state = { ...parseScene(location.hash), paused: reducedMotion.matches };
const audio = createAudio();
let toastTimer;
let immersed = false;
let held = false;
let pointer = { x: 0.57, y: 0.45 };
let keyboardTimer;
let lastGesture = 0;

function notify(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3200);
}
function showError(message) {
  $('#error span').textContent = message;
  $('#error').hidden = !message;
}
const engine = createEngine(canvas, {
  state,
  reducedMotion: reducedMotion.matches,
  onError: showError,
  onNotice: notify,
  onStats: ({ particles, renderer }) => {
    $('#particle-count').textContent = `${particles.toLocaleString()} PARTICLES`;
    $('#renderer-label').textContent = renderer === 'webgl' ? 'REAL-TIME / WEBGL' : 'REAL-TIME / CANVAS';
  },
});

function sync() {
  document.querySelectorAll('[data-scene]').forEach((button) => {
    const selected = Number(button.dataset.scene) === state.scene;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('[data-palette]').forEach((button) => {
    const selected = Number(button.dataset.palette) === state.palette;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  $('#world-number').textContent = `0${state.scene + 1} / 03`;
  $('#world-subtitle').textContent = SCENES[state.scene].subtitle;
  $('#mode-label').textContent = state.paused ? 'A MOMENT, HELD STILL' : 'LIVE GENERATIVE ART';
  $('#speed').value = state.speed;
  $('#intensity').value = state.intensity;
  $('#speed-value').textContent = `${state.speed.toFixed(2)}×`;
  $('#intensity-value').textContent = `${Math.round(state.intensity * 100)}%`;
  $('#pause').setAttribute('aria-label', state.paused ? 'Resume motion' : 'Pause motion');
  $('#pause').setAttribute('aria-pressed', String(state.paused));
  $('#pause').title = `${state.paused ? 'Resume' : 'Pause'} motion (Space)`;
  $('#pause-icon').setAttribute('d', state.paused ? 'M8 4 20 12 8 20Z' : 'M8 5v14M16 5v14');
  audio.setScene(state.scene);
  audio.setPaused(state.paused);
}
function update(patch) {
  state = { ...state, ...patch };
  engine.update(patch);
  sync();
}
function pulse() {
  if (state.paused) { notify('Resume motion to send a pulse.'); return; }
  engine.pulse();
  audio.pulse();
}
function setImmersed(next) {
  immersed = next;
  $('#app').classList.toggle('immersed', next);
  document.querySelectorAll('.chrome').forEach((element) => { element.inert = next; });
  $('#restore').hidden = !next;
  if (next) canvas.focus({ preventScroll: true });
  else $('#immerse').focus({ preventScroll: true });
}
async function toggleAudio() {
  const button = $('#sound');
  button.disabled = true;
  try {
    const enabled = await audio.toggle();
    button.setAttribute('aria-pressed', String(enabled));
    $('#sound span').textContent = enabled ? 'Sound on' : 'Sound off';
    if (enabled && state.paused) notify('Sound is on. Resume motion to listen.');
  } catch {
    notify('Sound could not start. Try again in a browser with Web Audio.');
  } finally { button.disabled = false; }
}
function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
}
canvas.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0) return;
  held = true;
  canvas.setPointerCapture(event.pointerId);
  canvas.focus({ preventScroll: true });
  pointer = pointerPosition(event);
  engine.pointer(pointer.x, pointer.y, true);
  if (!state.paused) audio.gesture(pointer.x, pointer.y);
});
canvas.addEventListener('pointermove', (event) => {
  if (!event.isPrimary) return;
  pointer = pointerPosition(event);
  engine.pointer(pointer.x, pointer.y, held);
  if (held && !state.paused && performance.now() - lastGesture > 125) {
    lastGesture = performance.now();
    audio.gesture(pointer.x, pointer.y);
  }
});
function releasePointer() { held = false; engine.pointer(pointer.x, pointer.y, false); }
canvas.addEventListener('pointerup', releasePointer);
canvas.addEventListener('pointercancel', releasePointer);
canvas.addEventListener('lostpointercapture', releasePointer);
canvas.addEventListener('pointerleave', () => { if (!held) engine.pointer(.5, .5, false); });
window.addEventListener('blur', releasePointer);

document.querySelectorAll('[data-scene]').forEach((button) => button.addEventListener('click', () => {
  update({ scene: Number(button.dataset.scene) });
  notify(`${SCENES[state.scene].name} · ${SCENES[state.scene].description}`);
}));
document.querySelectorAll('[data-palette]').forEach((button) => button.addEventListener('click', () => update({ palette: Number(button.dataset.palette) })));
for (const key of ['speed', 'intensity']) $(`#${key}`).addEventListener('input', (event) => update({ [key]: Number(event.target.value) }));
$('#sound').addEventListener('click', toggleAudio);
$('#pause').addEventListener('click', () => update({ paused: !state.paused }));
$('#pulse').addEventListener('click', pulse);
$('#regenerate').addEventListener('click', () => { update({ seed: newSeed() }); notify('A new variation, just for you.'); });
$('#immerse').addEventListener('click', () => setImmersed(true));
$('#restore').addEventListener('click', () => setImmersed(false));
$('#reload').addEventListener('click', () => location.reload());

$('#capture').addEventListener('click', async () => {
  const button = $('#capture');
  button.disabled = true;
  try {
    const blob = await engine.snapshot();
    if (!blob || blob.size === 0) throw new Error('Empty image');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `afterlight-${SCENES[state.scene].name.toLowerCase()}-${state.seed}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    notify('Your image is ready to save.');
  } catch { notify('The image could not be saved. Try reloading the artwork.'); }
  finally { button.disabled = false; }
});

function sceneUrl() {
  const url = new URL(location.href);
  url.search = '';
  url.hash = serializeScene(state);
  return url.href;
}
$('#share').addEventListener('click', async () => {
  const url = sceneUrl();
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    notify('Scene link copied. Send a little light.');
  } catch {
    $('#share-url').value = url;
    $('#copy-status').textContent = '';
    $('#share-dialog').showModal();
    $('#share-url').focus();
    $('#share-url').select();
  }
});
$('#copy-link').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#share-url').value); $('#copy-status').textContent = 'Link copied.'; }
  catch { $('#share-url').focus(); $('#share-url').select(); $('#copy-status').textContent = 'Copy the selected link with your browser’s Copy command.'; }
});
$('#help').addEventListener('click', () => $('#guide-dialog').showModal());
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } }));
window.addEventListener('hashchange', () => update({ ...parseScene(location.hash), paused: state.paused }));
reducedMotion.addEventListener('change', (event) => { if (event.matches) update({ paused: true }); });
document.addEventListener('visibilitychange', () => { if (document.hidden) releasePointer(); });
window.addEventListener('keydown', (event) => {
  if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || document.querySelector('dialog[open]')) return;
  if (event.key === 'Escape' && immersed) { setImmersed(false); return; }
  if (event.target.closest('input, textarea, select, button, a, [contenteditable]')) return;
  const key = event.key.toLowerCase();
  if (key === ' ') { event.preventDefault(); update({ paused: !state.paused }); }
  else if (key === 'p' || (key === 'enter' && event.target === canvas)) { event.preventDefault(); pulse(); }
  else if (['1', '2', '3'].includes(key)) update({ scene: Number(key) - 1 });
  else if (key === 'r') $('#regenerate').click();
  else if (key === 'h') setImmersed(!immersed);
  else if (key === 's' && !$('#sound').disabled) toggleAudio();
  else if (key === '?') $('#guide-dialog').showModal();
  else if (event.target === canvas && key.startsWith('arrow')) {
    event.preventDefault();
    pointer.x = Math.max(.05, Math.min(.95, pointer.x + (key === 'arrowright' ? .06 : key === 'arrowleft' ? -.06 : 0)));
    pointer.y = Math.max(.05, Math.min(.95, pointer.y + (key === 'arrowdown' ? .06 : key === 'arrowup' ? -.06 : 0)));
    engine.pointer(pointer.x, pointer.y, true);
    if (!state.paused) audio.gesture(pointer.x, pointer.y);
    clearTimeout(keyboardTimer);
    keyboardTimer = setTimeout(releasePointer, 400);
  }
});
sync();
