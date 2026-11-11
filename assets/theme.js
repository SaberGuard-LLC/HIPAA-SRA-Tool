(function () {
  'use strict';

  const root = document.documentElement;
  const fromUrl = () => (/[?&]theme=dark\b/.test(window.location.search) ? 'dark' : 'light');
  const current = () => (root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  function rememberInUrl(theme) {
    try {
      const url = new URL(window.location.href);
      if (theme === 'dark') url.searchParams.set('theme', 'dark');
      else url.searchParams.delete('theme');
      window.history.replaceState(window.history.state, '', url);
    } catch (err) {
      return;
    }
  }

  function set(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    rememberInUrl(next);
    return next;
  }

  root.setAttribute('data-theme', fromUrl());
  if (typeof CSSMarginRule !== 'undefined') root.classList.add('margin-boxes');

  window.SRATheme = { get: current, set, toggle: () => set(current() === 'dark' ? 'light' : 'dark') };
})();
