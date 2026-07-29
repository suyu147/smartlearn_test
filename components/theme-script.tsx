/**
 * Theme hydration script — prevents flash of wrong theme.
 * Runs before React hydration, reads localStorage, applies classes.
 */
const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('sl-theme') || 'system';
    var h = document.documentElement;
    function apply(theme) {
      h.classList.remove('dark', 'theme-snow', 'theme-glass');
      if (theme === 'dark') h.classList.add('dark');
      else if (theme === 'snow') h.classList.add('theme-snow');
      else if (theme === 'glass') { h.classList.add('dark'); h.classList.add('theme-glass'); }
    }
    if (t === 'system') {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      apply(mq.matches ? 'dark' : 'light');
    } else {
      apply(t);
    }
  } catch(e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
