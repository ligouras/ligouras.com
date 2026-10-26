/* Shared reader behaviour: drawer TOC, filter, theme, text size, progress, scroll-spy. No dependencies. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var root = document.documentElement, body = document.body;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  var theme = store.get('hl-theme');
  if (theme) root.setAttribute('data-theme', theme);
  var size = parseInt(store.get('hl-size'), 10);
  if (size >= 14 && size <= 24) root.style.setProperty('--font-size', size + 'px');

  function curSize() { return parseFloat(getComputedStyle(root).fontSize) || 17; }
  function bump(d) {
    var n = Math.min(24, Math.max(14, Math.round(curSize()) + d));
    root.style.setProperty('--font-size', n + 'px'); store.set('hl-size', n);
  }
  var themeBtn = $('theme-btn');
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var dark = (root.getAttribute('data-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
    var next = dark ? 'light' : 'dark';
    root.setAttribute('data-theme', next); store.set('hl-theme', next);
  });
  if ($('font-dec')) $('font-dec').addEventListener('click', function () { bump(-1); });
  if ($('font-inc')) $('font-inc').addEventListener('click', function () { bump(1); });

  var drawer = $('drawer'), scrim = $('scrim'), menuBtn = $('menu-btn');
  var wide = matchMedia('(min-width: 1080px)');
  function setNav(open) {
    body.classList.toggle('nav-open', open);
    if (scrim) scrim.hidden = !open;
    if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open));
    if (open && $('toc-filter') && !wide.matches) $('toc-filter').focus({ preventScroll: true });
    if (!open && menuBtn && document.activeElement && drawer && drawer.contains(document.activeElement)) menuBtn.focus();
  }
  if (menuBtn) menuBtn.addEventListener('click', function () {
    if (wide.matches) body.classList.toggle('sidebar-collapsed'); else setNav(!body.classList.contains('nav-open'));
  });
  if (scrim) scrim.addEventListener('click', function () { setNav(false); });
  if ($('drawer-close')) $('drawer-close').addEventListener('click', function () { setNav(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setNav(false); });
  if (drawer) drawer.addEventListener('click', function (e) { if (e.target.closest('.toc a') && !wide.matches) setNav(false); });

  var filter = $('toc-filter');
  if (filter) filter.addEventListener('input', function () {
    var q = filter.value.trim().toLowerCase();
    document.querySelectorAll('#toc li').forEach(function (li) {
      var own = (li.firstElementChild ? li.firstElementChild.textContent : li.textContent).toLowerCase();
      var any = li.textContent.toLowerCase().indexOf(q) !== -1;
      li.hidden = !!q && !any;
      if (q && own.indexOf(q) !== -1) li.querySelectorAll('li').forEach(function (c) { c.hidden = false; });
    });
  });

  var bar = $('progress-bar');
  var links = [].slice.call(document.querySelectorAll('#toc a[href^="#"]'));
  var targets = links.map(function (a) { return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))); });
  var ticking = false;
  function onScroll() {
    ticking = false;
    var h = root.scrollHeight - innerHeight;
    if (bar) bar.style.width = (h > 0 ? Math.min(100, scrollY / h * 100) : 0) + '%';
    var line = innerHeight * 0.25, idx = -1;
    for (var i = 0; i < targets.length; i++) {
      if (targets[i] && targets[i].getBoundingClientRect().top <= line) idx = i; else if (targets[i] && idx >= 0) break;
    }
    links.forEach(function (a, i) { a.classList.toggle('active', i === idx); });
  }
  addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();
})();
