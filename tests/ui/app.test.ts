// @vitest-environment happy-dom
// The checker page: live updates after a pause, "Paused" while inputs are invalid, and never a
// stale PASS or FAIL next to invalid inputs (design/DESIGN.md §2, §6).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UPDATE_DELAY_MS, mountApp } from '../../src/ui/app';

// happy-dom has no canvas, so the uPlot charts are not drawn here (they are checked in a browser).
vi.mock('../../src/ui/charts', () => ({
  drawTimeHistory: vi.fn(),
  drawKChart: vi.fn(),
  drawLateralChart: vi.fn(),
}));

let root: HTMLElement;
const $ = <T extends HTMLElement = HTMLElement>(sel: string) =>
  document.querySelector(sel) as T | null;
const type = (sel: string, value: string) => {
  const el = $<HTMLInputElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const choose = (sel: string) => {
  const el = $<HTMLInputElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  el.checked = true;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const select = (sel: string, value: string) => {
  const el = $<HTMLSelectElement>(sel);
  if (!el) throw new Error(`missing ${sel}`);
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
};

beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
  root = document.createElement('div');
  document.body.append(root);
  mountApp(root);
  // Bridge A1 with class C, rural, alternative routes, 10 m high (DESIGN.md): a FAIL.
  $<HTMLButtonElement>('.pill[data-example="A1"]')?.click();
  choose('input[name="bridgeClass"][value="C"]');
  select('#in-k1', 'rural');
  select('#in-k2', 'alternative');
  type('#in-height', '10');
  vi.advanceTimersByTime(UPDATE_DELAY_MS);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checker page', () => {
  it('shows the result with "Updates as you type"', () => {
    expect($('.verdict-title')?.textContent).toBe('Fails the comfort check');
    expect($('.live-state')?.dataset.state).toBe('live');
    expect($('.live-state')?.textContent).toBe('Updates as you type');
    expect($('#results')?.hasAttribute('aria-busy')).toBe(false);
  });

  it('waits for a pause in typing before checking again', () => {
    type('#in-b', '0.000001');
    expect($('#results')?.getAttribute('aria-busy')).toBe('true');
    vi.advanceTimersByTime(UPDATE_DELAY_MS - 1);
    expect($<HTMLInputElement>('#in-b')?.hasAttribute('aria-invalid')).toBe(false);
    vi.advanceTimersByTime(1);
    expect($<HTMLInputElement>('#in-b')?.getAttribute('aria-invalid')).toBe('true');
  });

  it('invalid inputs: red field, summary, neutral card, "Paused", no PASS or FAIL', () => {
    type('#in-b', '0.000001');
    vi.advanceTimersByTime(UPDATE_DELAY_MS);
    expect($('.error-summary-title')?.textContent).toBe('1 value needs checking');
    expect($('.verdict-card')?.classList.contains('tone-neutral')).toBe(true);
    expect($('.verdict-title')?.textContent).toBe('Check your inputs');
    expect($('.live-state')?.dataset.state).toBe('paused');
    expect($('.live-state')?.textContent).toBe('Paused');
    expect($('#results')?.textContent).not.toMatch(/\bPASS\b|\bFAIL\b|Passes|Fails/);
  });

  it('runs again as soon as the value is fixed', () => {
    type('#in-damping', '0.005');
    vi.advanceTimersByTime(UPDATE_DELAY_MS);
    $<HTMLButtonElement>('.fix-btn')?.click();
    vi.advanceTimersByTime(UPDATE_DELAY_MS);
    expect($<HTMLInputElement>('#in-damping')?.value).toBe('0.5');
    expect($('.error-summary')).toBeNull();
    expect($('.live-state')?.dataset.state).toBe('live');
    expect($('.verdict-title')?.textContent).toBe('Fails the comfort check');
  });

  it('shows the buttons, the screening line and the limitations under the result', () => {
    expect($('#download-pdf')?.textContent).toBe('Download calc sheet (PDF)');
    expect($('#copy-link')?.textContent).toBe('Copy link to these inputs');
    expect($('.screening-line')?.textContent).toMatch(
      /^Screening tool for vibration serviceability only/,
    );
    expect($('.limitations')?.textContent).toMatch(/screening and checking aid/);
  });
});
