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
  var override = null; // set via JaneWidget.setTheme

  function resolveTheme() {
    var t = override || themeAttr;
    if (t === 'light' || t === 'dark') return t;
    return mql.matches ? 'dark' : 'light';
  }

  var iframe = document.createElement('iframe');
  iframe.title = 'Chat';
  iframe.setAttribute('allow', 'autoplay');
  iframe.style.cssText =
    'position:fixed;bottom:0;right:0;width:96px;height:96px;border:0;' +
    'background:transparent;color-scheme:normal;z-index:2147483000;';
  var hash =
    '#visitorId=' +
    encodeURIComponent(visitorId) +
    '&host=' +
    encodeURIComponent(host) +
    '&theme=' +
    encodeURIComponent(resolveTheme());
  iframe.src = base + '/widget/app/' + hash;
  document.body.appendChild(iframe);

  function sendTheme() {
    if (iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'jane:theme', theme: resolveTheme() }, base);
    }
  }

  window.addEventListener('message', function (e) {
    if (e.origin !== base || !e.data) return;
    if (e.data.type === 'jane:resize') {
      if (e.data.open) {
        iframe.style.width = '400px';
        iframe.style.height = '620px';
      } else {
        iframe.style.width = '96px';
        iframe.style.height = '96px';
      }
    } else if (e.data.type === 'jane:ready') {
      sendTheme();
    }
  });

  if (mql.addEventListener) {
    mql.addEventListener('change', sendTheme);
  }

  window.JaneWidget = {
    setTheme: function (t) {
      override = t === 'auto' ? null : t;
      sendTheme();
    },
  };
})();
