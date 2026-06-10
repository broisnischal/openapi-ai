export function injectFonts() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('app-fonts')) return;

  // Google Fonts - Inter + JetBrains Mono
  const link = document.createElement('link');
  link.id = 'app-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap';
  document.head.prepend(link);

  // Also inject local variable font faces as fallback
  const s = document.createElement('style');
  s.id = 'app-fonts-local';
  s.textContent = `
    @font-face {
      font-family: 'GeistMono';
      src: url('/fonts/GeistMono-Variable.woff2') format('woff2-variations');
      font-weight: 100 900; font-style: normal; font-display: swap;
    }
  `;
  document.head.appendChild(s);
}
