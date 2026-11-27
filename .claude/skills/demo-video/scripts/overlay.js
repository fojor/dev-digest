// Page init script for demo recordings (loaded via AGENT_BROWSER_INIT_SCRIPTS).
// Runs in every page before the app's own scripts. It adds:
//   - window.__demo.caption(text) / window.__demo.clear() — a caption bar at the bottom;
//     the text is kept in sessionStorage so it survives full navigations (`open`).
//   - a ripple where the pointer goes down, so viewers see each click;
//   - CSS that hides the Next.js dev-tools badge, which is not part of the product.
(() => {
  if (window.__demo) return;
  const KEY = '__demo_caption';
  const CSS = `
    nextjs-portal { display: none !important; }
    #__demo_caption {
      position: fixed; left: 50%; bottom: 100px; transform: translateX(-50%);
      max-width: min(80vw, 1100px); padding: 12px 22px; border-radius: 10px;
      background: rgba(12, 14, 20, 0.88); color: #fff; z-index: 2147483647;
      font: 500 20px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
      text-align: center; box-shadow: 0 8px 30px rgba(0,0,0,.35); pointer-events: none;
      transition: opacity .25s ease;
    }
    .__demo_ripple {
      position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
      border: 3px solid #4f8cff; background: rgba(79,140,255,.25); pointer-events: none;
      z-index: 2147483646; animation: __demo_ripple .6s ease-out forwards;
    }
    @keyframes __demo_ripple { from { transform: scale(.4); opacity: 1 } to { transform: scale(1.8); opacity: 0 } }
  `;

  function ready(fn) {
    if (document.body) fn();
    else document.addEventListener('DOMContentLoaded', fn, { once: true });
  }

  function render() {
    let text = null;
    try { text = sessionStorage.getItem(KEY); } catch {}
    let el = document.getElementById('__demo_caption');
    if (!text) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo_caption';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  window.__demo = {
    caption(text) {
      try { sessionStorage.setItem(KEY, text); } catch {}
      ready(render);
      return true;
    },
    clear() {
      try { sessionStorage.removeItem(KEY); } catch {}
      ready(render);
      return true;
    },
  };

  ready(() => {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    render();
    // React can re-render the body subtree; put the caption back if it disappears.
    new MutationObserver(() => {
      let has = false;
      try { has = !!sessionStorage.getItem(KEY); } catch {}
      if (has && !document.getElementById('__demo_caption')) render();
    }).observe(document.body, { childList: true });
  });

  window.addEventListener('pointerdown', (e) => {
    const dot = document.createElement('div');
    dot.className = '__demo_ripple';
    dot.style.left = `${e.clientX}px`;
    dot.style.top = `${e.clientY}px`;
    document.body.appendChild(dot);
    setTimeout(() => dot.remove(), 700);
  }, true);
})();
