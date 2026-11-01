// Applies the theme chosen earlier in this session before the first paint, so moving between
// pages does not flash the other theme. Same key as src/ui/theme.ts (THEME_KEY). A plain script
// file, not inline, so the Content-Security-Policy can stay at script-src 'self'.
/* global document, sessionStorage */
try {
  var t = sessionStorage.getItem('fvc-theme');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch {
  // Storage blocked: the page follows the system setting.
}
