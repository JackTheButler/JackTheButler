/* Jane widget loader. Runs in the host page (vanilla, no deps).
   Owns the visitor id + theme; injects the widget iframe; bridges theme. */
(function () {
  var script =
    document.currentScript ||
    document.querySelector('script[data-jane-widget]');
  if (!script) return;

  var base = new URL(script.src).origin;
  var themeAttr = (script.getAttribute('data-jane-theme') || 'auto').toLowerCase();
  var host = location.origin;

  var KEY = 'jane_visitor_id';
  var visitorId = '';
  try {
    visitorId = localStorage.getItem(KEY) || '';
    if (!visitorId) {
      visitorId =
        (crypto.randomUUID && crypto.randomUUID()) ||
        String(Date.now()) + Math.random().toString(16).slice(2);
      localStorage.setItem(KEY, visitorId);
    }
  } catch (e) {
    visitorId = String(Date.now());
  }

  var mql = window.matchMedia('(prefers-color-scheme: dark)');
  // Host-viewport mobile detection. matchMedia inside the iframe is useless
  // here — the iframe's own size is loader-controlled — so the loader is
  // the only place that can see the real device viewport.
  var mobileMql = window.matchMedia('(max-width: 520px)');
  var isMobile = mobileMql.matches;
  var override = null; // set via JaneWidget.setTheme
  var currentOpen = false;

  function resolveTheme() {
    var t = override || themeAttr;
    if (t === 'light' || t === 'dark') return t;
    return mql.matches ? 'dark' : 'light';
  }

  // Three iframe sizes: closed (small launcher), open desktop (panel
  // anchored bottom-right), open mobile (fullscreen overlay).
  function applyIframeSize() {
    var base = 'border:0;background:transparent;color-scheme:normal;z-index:2147483000;';
    if (currentOpen && isMobile) {
      iframe.style.cssText =
        'position:fixed;top:0;left:0;width:100%;height:100%;' + base;
    } else if (currentOpen) {
      iframe.style.cssText =
        'position:fixed;bottom:0;right:0;width:400px;height:620px;' + base;
    } else {
      iframe.style.cssText =
        'position:fixed;bottom:0;right:0;width:96px;height:96px;' + base;
    }
  }

  var iframe = document.createElement('iframe');
  iframe.title = 'Chat';
  iframe.setAttribute('allow', 'autoplay');
  applyIframeSize();
  var hash =
    '#visitorId=' +
    encodeURIComponent(visitorId) +
    '&host=' +
    encodeURIComponent(host) +
    '&theme=' +
    encodeURIComponent(resolveTheme()) +
    '&mobile=' +
    (isMobile ? '1' : '0');
  iframe.src = base + '/widget/app/' + hash;
  document.body.appendChild(iframe);

  function sendTheme() {
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'jane:theme', theme: resolveTheme() }, base);
    }
  }

  function sendViewport() {
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'jane:viewport', mobile: isMobile }, base);
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== base || !e.data) return;
    if (e.data.type === 'jane:resize') {
      currentOpen = !!e.data.open;
      applyIframeSize();
    } else if (e.data.type === 'jane:ready') {
      sendTheme();
      sendViewport();
    }
  });

  if (mql.addEventListener) {
    mql.addEventListener('change', sendTheme);
  }

  // Mobile state can change mid-session (device rotation, browser
  // window resize). Re-apply iframe size + notify the widget so the
  // panel layout follows.
  if (mobileMql.addEventListener) {
    mobileMql.addEventListener('change', function (e) {
      isMobile = e.matches;
      applyIframeSize();
      sendViewport();
    });
  }

  window.JaneWidget = {
    setTheme: function (t) {
      override = t === 'auto' ? null : t;
      sendTheme();
    },
  };
})();
