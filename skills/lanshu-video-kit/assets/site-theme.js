/* ================================================================
 * lanshu-awesome-ai-video-kit · 全站主题切换 + 标准 nav 注入
 * 配套 CSS: /assets/site-theme.css
 *
 * 1. 读取 localStorage 主题偏好(dark/light),应用到 <html>
 * 2. 给所有 #themeToggle 按钮挂切换逻辑 + 同步 icon
 * 3. (可选) 如果页面有 <nav class="top" data-auto-nav>,自动注入 5 tab
 * ================================================================ */
(function () {
  'use strict';

  // ---------- Theme ----------
  const THEME_KEY = 'lanshu-video-kit-theme';
  function getTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'dark'; } catch (e) { return 'dark'; }
  }
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    updateThemeIcon(t);
  }
  function updateThemeIcon(theme) {
    const icon = document.getElementById('themeIcon');
    if (!icon) return;
    if (theme === 'light') {
      icon.innerHTML =
        '<circle cx="12" cy="12" r="4"/>' +
        '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>';
    } else {
      icon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
    }
  }

  // Apply theme as early as possible (avoid FOUC)
  setTheme(getTheme());

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('themeToggle');
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const cur = document.documentElement.getAttribute('data-theme') || 'dark';
        setTheme(cur === 'light' ? 'dark' : 'light');
      });
    }
    updateThemeIcon(getTheme());
  });
})();
