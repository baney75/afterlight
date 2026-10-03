import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const ready = async (page) => {
  await page.goto(process.env.TEST_URL || '/');
  await expect(page.locator('#particle-count')).toContainText('PARTICLES');
};
const frame = (page) => page.locator('#universe').evaluate((canvas) => {
  const sample = document.createElement('canvas'); sample.width = 160; sample.height = 100;
  const ctx = sample.getContext('2d'); ctx.drawImage(canvas, 0, 0, 160, 100);
  return sample.toDataURL();
});

test('all worlds, palette and keyboard controls work without runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
  const nebula = await frame(page);
  await page.getByRole('button', { name: 'WORLD 02 Bloom' }).click();
  await expect(page.getByRole('button', { name: 'WORLD 02 Bloom' })).toHaveAttribute('aria-pressed', 'true');
  const bloom = await frame(page);
  expect(bloom).not.toBe(nebula);
  await page.getByRole('button', { name: 'WORLD 03 Tidal' }).click();
  expect(await frame(page)).not.toBe(bloom);
  const dusk = await frame(page);
  await page.getByRole('button', { name: 'Solar palette' }).click();
  expect(await frame(page)).not.toBe(dusk);
  await page.locator('#universe').focus();
  await page.keyboard.press('1');
  await expect(page.getByRole('button', { name: 'WORLD 01 Nebula' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('h');
  await expect(page.locator('#restore')).toBeVisible();
  await expect(page.locator('.console')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('.console')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pause holds a frame; explicit resume animates even with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await expect(page.getByRole('button', { name: 'Resume motion', exact: true })).toBeVisible();
  const first = await frame(page);
  await page.waitForTimeout(250);
  expect(await frame(page)).toBe(first);
  await page.getByRole('button', { name: 'Resume motion', exact: true }).click();
  await expect.poll(() => frame(page)).not.toBe(first);
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
  const paused = await frame(page);
  await page.waitForTimeout(250);
  expect(await frame(page)).toBe(paused);
  await page.setViewportSize({ width: 780, height: 650 });
  const pixels = await page.locator('#universe').evaluate((canvas) => {
    const image = document.createElement('canvas'); image.width = 40; image.height = 40;
    const ctx = image.getContext('2d'); ctx.drawImage(canvas, 0, 0, 40, 40);
    return [...ctx.getImageData(0, 0, 40, 40).data].filter((value, i) => i % 4 !== 3 && value > 40).length;
  });
  expect(pixels).toBeGreaterThan(10);
});

test('share survives a reload, and blocked clipboard has a selectable link', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('Denied')) } }));
  await ready(page);
  await page.getByRole('button', { name: 'WORLD 03 Tidal' }).click();
  await page.getByRole('button', { name: 'Glacier palette' }).click();
  await page.locator('#speed').fill('1.23');
  await page.locator('#intensity').fill('0.78');
  await page.getByRole('button', { name: 'New variation', exact: true }).click();
  await page.getByRole('button', { name: 'Share scene', exact: true }).click();
  await expect(page.locator('#share-dialog')).toBeVisible();
  await expect(page.locator('#share-url')).toBeFocused();
  const url = await page.locator('#share-url').inputValue();
  expect(await page.locator('#share-url').evaluate(input => input.selectionEnd - input.selectionStart)).toBe(url.length);
  await page.locator('#share-url').evaluate(input => input.setSelectionRange(0, 0));
  expect(await page.locator('#share-url').evaluate(input => input.selectionEnd - input.selectionStart)).toBe(0);
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.locator('#copy-status')).toContainText('Copy the selected link');
  await expect(page.locator('#share-url')).toBeFocused();
  expect(await page.locator('#share-url').evaluate(input => input.selectionEnd - input.selectionStart)).toBe(url.length);
  expect(url).toContain('scene=2');
  expect(url).toContain('palette=2');
  expect(url).toContain('speed=1.23');
  expect(url).toContain('intensity=0.78');
  await page.goto(url);
  await expect(page.locator('[data-scene="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-palette="2"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#speed')).toHaveValue('1.23');
  await expect(page.locator('#intensity')).toHaveValue('0.78');
});

test('image export produces a real PNG', async ({ page }) => {
  await ready(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^afterlight-nebula-\d+\.png$/);
  const bytes = await readFile(await download.path());
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(bytes.length).toBeGreaterThan(15000);
});

test('graphics fallback renders and exports', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /webgl/.test(type) ? null : original.call(this, type, ...args); };
  });
  await ready(page);
  await expect(page.locator('#renderer-label')).toContainText('CANVAS');
  await expect(page.locator('#universe')).toHaveAttribute('tabindex', '0');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  expect((await download).suggestedFilename()).toContain('afterlight');
});

test('sound is opt in and follows pause, resume and mute', async ({ page }) => {
  await page.addInitScript(() => {
    window.__audioContexts = [];
    const Native = window.AudioContext;
    window.AudioContext = class extends Native { constructor(...args) { super(...args); window.__audioContexts.push(this); } };
  });
  await ready(page);
  expect(await page.evaluate(() => window.__audioContexts.length)).toBe(0);
  await page.getByRole('button', { name: 'Sound off', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound on', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => page.evaluate(() => window.__audioContexts[0]?.state)).toBe('running');
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__audioContexts[0]?.state)).toBe('suspended');
  await page.getByRole('button', { name: 'Resume motion', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__audioContexts[0]?.state)).toBe('running');
  await page.getByRole('button', { name: 'Sound on', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__audioContexts[0]?.state)).toBe('suspended');
});

test('a restored WebGL context clears the error and draws again', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await ready(page);
  await page.evaluate(() => {
    window.__lose = document.querySelector('#universe').getContext('webgl').getExtension('WEBGL_lose_context');
    if (!window.__lose) throw new Error('Context-loss test requires the WebGL extension');
    window.__lose.loseContext();
  });
  await expect(page.locator('#error')).toBeVisible();
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__lose.restoreContext());
  await expect(page.locator('#error')).toBeHidden();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save image', exact: true }).click();
  const bytes = await readFile(await (await downloadPromise).path());
  expect(bytes.length).toBeGreaterThan(15000);
});

test('shader failure preserves the keyboard surface', async ({ page }) => {
  await page.addInitScript(() => { WebGLRenderingContext.prototype.getShaderParameter = () => false; });
  await ready(page);
  await expect(page.locator('#renderer-label')).toContainText('CANVAS');
  await expect(page.locator('#error')).toBeHidden();
  await page.locator('#universe').focus();
  await page.keyboard.press('2');
  await expect(page.locator('[data-scene="1"]')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Pause motion', exact: true }).click();
  const image = page.locator('canvas[aria-hidden="true"]');
  await expect(image).toHaveCount(1);
  const bloom = await image.evaluate((canvas) => canvas.toDataURL());
  await page.getByRole('button', { name: 'WORLD 03 Tidal' }).click();
  expect(await image.evaluate((canvas) => canvas.toDataURL())).not.toBe(bloom);
  await expect(page.locator('#universe')).toHaveAttribute('tabindex', '0');
});

test('attraction changes the fallback at the same seed and animation time', async ({ page }) => {
  const source = await readFile(new URL('../src/engine.js', import.meta.url), 'utf8');
  await page.goto('about:blank');
  const difference = await page.evaluate(async (source) => {
    const { createEngine } = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...args) { return /webgl/.test(kind) ? null : nativeGetContext.call(this, kind, ...args); };
    let pending = new Map(), id = 0;
    window.requestAnimationFrame = callback => { pending.set(++id, callback); return id; };
    window.cancelAnimationFrame = token => pending.delete(token);
    const draw = held => {
      const canvas = document.createElement('canvas');
      canvas.style.cssText = 'width:240px;height:180px';
      document.body.append(canvas);
      const engine = createEngine(canvas, { state: { seed: 1234, scene: 0, speed: .65, intensity: .55 } });
      engine.pointer(.82, .28, held);
      for (let i = 0; i < 30; i++) {
        const callbacks = [...pending.values()]; pending.clear();
        callbacks.forEach(callback => callback(1000 + i * (1000 / 60)));
      }
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      engine.destroy(); canvas.remove();
      return pixels;
    };
    const idle = draw(false), held = draw(true);
    return idle.reduce((total, value, i) => total + Math.abs(value - held[i]), 0) / idle.length;
  }, source);
  expect(difference).toBeGreaterThan(1);
});

test('short touch phone exposes every control without scrolling', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  try {
    await page.goto(process.env.TEST_URL || 'http://127.0.0.1:4186');
    await expect(page.locator('#particle-count')).toContainText('PARTICLES');
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(568);
    for (const selector of ['#sound', '#help', '[data-scene="2"]', '[data-palette="2"]', '#speed', '#intensity', '#regenerate', '#pause', '#immerse', '#capture', '#share']) {
      const box = await page.locator(selector).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(320);
      expect(box.y + box.height).toBeLessThanOrEqual(568);
    }
    await page.locator('[data-scene="2"]').tap();
    await expect(page.locator('[data-scene="2"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-palette="2"]').tap();
    await expect(page.locator('[data-palette="2"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#help').tap();
    await expect(page.locator('#guide-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close field guide' }).tap();
    await expect(page.locator('#guide-dialog')).toBeHidden();
  } finally { await context.close(); }
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
  test(`controls remain reachable at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    for (const selector of ['#sound', '#help', '[data-scene="2"]', '#speed', '#intensity', '[data-palette="2"]', '#pause', '#capture', '#share']) {
      const target = page.locator(selector);
      await target.scrollIntoViewIfNeeded();
      await expect(target).toBeInViewport();
      const box = await target.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    await page.getByRole('button', { name: 'Field guide' }).click();
    await expect(page.locator('#guide-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#guide-dialog')).toBeHidden();
  });
}
