export function injectFonts() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('app-fonts')) return;
  const s = document.createElement('style');
  s.id = 'app-fonts';
  s.textContent = `
    @font-face {
      font-family: 'Inter';
      src: url('/fonts/Inter-Variable.woff2') format('woff2-variations');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'GeistMono';
      src: url('/fonts/GeistMono-Variable.woff2') format('woff2-variations');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }
  `;
  document.head.prepend(s);
}
