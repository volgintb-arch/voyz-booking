/*!
 * Voyz Booking — widget for a host's own website.
 *
 * Floating "Book" button:
 *   <script src="https://…/widget.js" data-property="son-kul-aiyl" async></script>
 *   optional: data-label="Забронировать"
 *
 * Booking form inside the page:
 *   <div data-voyz-booking="son-kul-aiyl" data-height="760"></div>
 *   <script src="https://…/widget.js" async></script>
 */
(function () {
  var script = document.currentScript;
  if (!script || window.__voyzWidget) return;
  window.__voyzWidget = true;
  var base = script.src.replace(/widget\.js(\?.*)?$/, '');

  function appUrl(slug) {
    return base + '#/guest/p/' + encodeURIComponent(slug) + '?src=site&embed=1';
  }

  function frame(slug, height) {
    var f = document.createElement('iframe');
    f.src = appUrl(slug);
    f.title = 'Voyz Booking';
    f.loading = 'lazy';
    f.allow = 'clipboard-write';
    f.style.cssText = 'width:100%;height:' + height + ';border:0;border-radius:24px;background:#fff;display:block';
    return f;
  }

  // Inline forms
  var slots = document.querySelectorAll('[data-voyz-booking]');
  for (var i = 0; i < slots.length; i++) {
    var el = slots[i];
    if (el.getAttribute('data-voyz-ready')) continue;
    el.setAttribute('data-voyz-ready', '1');
    el.appendChild(frame(el.getAttribute('data-voyz-booking'), (el.getAttribute('data-height') || '760') + 'px'));
  }

  // Floating button
  var slug = script.getAttribute('data-property');
  if (!slug) return;
  var css =
    '.voyz-btn{position:fixed;right:20px;bottom:20px;z-index:2147483000;border:0;border-radius:999px;' +
    'background:#1e1e1e;color:#fff;font:700 17px/1 system-ui,-apple-system,sans-serif;padding:18px 26px 18px 18px;' +
    'display:flex;align-items:center;gap:12px;cursor:pointer;box-shadow:0 8px 30px rgba(0,0,0,.25)}' +
    '.voyz-btn i{width:28px;height:28px;border-radius:50%;background:#dfff00;display:block;box-shadow:0 0 16px rgba(223,255,0,.7)}' +
    '.voyz-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}' +
    '.voyz-box{position:relative;width:min(440px,100%);height:min(820px,100%);background:#fff;border-radius:28px;overflow:hidden}' +
    '.voyz-box iframe{border-radius:0!important;height:100%!important}' +
    '.voyz-x{position:absolute;top:12px;right:12px;width:40px;height:40px;border-radius:50%;border:0;background:#dfff00;' +
    'font:700 20px/1 system-ui;cursor:pointer;z-index:1}' +
    '@media(max-width:480px){.voyz-box{width:100%;height:100%;border-radius:0}}';
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'voyz-btn';
  btn.innerHTML = '<i></i>';
  btn.appendChild(document.createTextNode(script.getAttribute('data-label') || 'Забронировать'));
  btn.onclick = function () {
    var ov = document.createElement('div');
    ov.className = 'voyz-ov';
    var box = document.createElement('div');
    box.className = 'voyz-box';
    var x = document.createElement('button');
    x.className = 'voyz-x';
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.textContent = '×';
    function close() {
      ov.remove();
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    x.onclick = close;
    ov.onclick = function (e) {
      if (e.target === ov) close();
    };
    document.addEventListener('keydown', onKey);
    box.appendChild(x);
    box.appendChild(frame(slug, '100%'));
    ov.appendChild(box);
    document.body.appendChild(ov);
  };
  document.body.appendChild(btn);
})();
