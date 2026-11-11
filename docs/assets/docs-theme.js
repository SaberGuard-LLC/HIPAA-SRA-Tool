(function () {
  'use strict';

  const wantsDark = () => /[?&]theme=dark\b/.test(window.location.search);

  function carryTheme(dark) {
    document.querySelectorAll('a[href]').forEach(a => {
      let url;
      try { url = new URL(a.href); } catch (err) { return; }
      if (url.origin !== window.location.origin) return;
      if (dark) url.searchParams.set('theme', 'dark');
      else url.searchParams.delete('theme');
      a.href = url.toString();
    });
  }

  function apply(dark) {
    if (window.jtd && typeof window.jtd.setTheme === 'function') window.jtd.setTheme(dark ? 'dark' : 'light');
    const btn = document.getElementById('docsThemeBtn');
    if (btn) {
      btn.textContent = dark ? 'Light mode' : 'Dark mode';
      btn.setAttribute('aria-pressed', String(dark));
    }
    carryTheme(dark);
  }

  function remember(dark) {
    const url = new URL(window.location.href);
    if (dark) url.searchParams.set('theme', 'dark');
    else url.searchParams.delete('theme');
    window.history.replaceState(window.history.state, '', url);
  }

  function start() {
    let dark = wantsDark();
    apply(dark);
    const btn = document.getElementById('docsThemeBtn');
    if (btn) btn.addEventListener('click', () => { dark = !dark; remember(dark); apply(dark); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
