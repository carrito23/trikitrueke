/* Trikitrueke · interfaz. Habla con la base de datos solo a través de TrikiAPI (api.js). */
(function () {
  'use strict';

  var api = window.TrikiAPI;
  var cfg = window.TRIKI_CONFIG || {};

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function ago(iso) {
    var h = Math.floor((Date.now() - Date.parse(iso)) / 3600e3);
    if (!(h >= 0)) h = 0;
    if (h < 1) return 'hace un momento';
    if (h < 24) return 'hace ' + h + ' h';
    var d = Math.round(h / 24);
    return 'hace ' + d + (d === 1 ? ' día' : ' días');
  }
  function debounce(fn, ms) {
    var t;
    return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms); };
  }

  var ICONS = {
    car: '<path d="M3 14l2-6h14l2 6v4h-3v-2H6v2H3z"/><circle cx="7.5" cy="14" r="1"/><circle cx="16.5" cy="14" r="1"/>',
    book: '<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>',
    disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    shirt: '<path d="M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3a4 4 0 01-8 0z"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    tool: '<path d="M15 4a5 5 0 00-4.5 6.8L4 17.5V20h2.5l6.7-6.5A5 5 0 0020 9l-3 3-3-1-1-3z"/>',
    bike: '<circle cx="6" cy="16" r="3.5"/><circle cx="18" cy="16" r="3.5"/><path d="M6 16l4-8h5l3 8M10 8L8 6H6M12 16l3-8"/>',
    laptop: '<rect x="5" y="5" width="14" height="10" rx="1"/><path d="M3 19h18"/>',
    sofa: '<path d="M5 11V8a2 2 0 012-2h10a2 2 0 012 2v3"/><path d="M3 13a2 2 0 014 0v2h10v-2a2 2 0 014 0v5H3z"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>',
    swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>'
  };
  function ico(n) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (ICONS[n] || ICONS.tag) + '</svg>';
  }

  var REASONS = {
    venta: 'Es una venta o pide dinero',
    prohibido: 'Producto prohibido o ilegal',
    estafa: 'Parece una estafa o un engaño',
    ofensivo: 'Contenido ofensivo',
    datos: 'Muestra datos personales de alguien',
    otro: 'Otro motivo'
  };
  var LST = { active: ['Publicado', 'ok'], done: ['Cambiado', 'mute'], hidden: ['Oculto por moderación', 'bad'] };
  var OST = { pending: ['Pendiente', 'warn'], accepted: ['Aceptada', 'ok'], declined: ['Rechazada', 'bad'], withdrawn: ['Retirada', 'mute'] };
  var CLOSE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  /* ------------------------------------------------------------------ */
  /* Estado                                                              */
  /* ------------------------------------------------------------------ */
  var S = {
    cats: [], zones: [], counts: {},
    q: '', cat: '', zone: '', kind: 'all', sort: 'new',
    page: 0, total: 0, rows: [], loading: false, error: '', req: 0,
    offers: [], pending: 0, offerTab: 'received',
    thread: null, afterAuth: null, editing: null, modTarget: null
  };

  function catOf(id) {
    for (var i = 0; i < S.cats.length; i++) if (S.cats[i].id === id) return S.cats[i];
    return { id: id, name: id, icon: 'tag', hue: 200 };
  }
  function where(l) { return [l.town, l.zone].filter(Boolean).join(', '); }

  /* ------------------------------------------------------------------ */
  /* Avisos, diálogos                                                    */
  /* ------------------------------------------------------------------ */
  var toastTimer;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 4800);
  }
  function openD(d) { if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute('open', ''); }
  function closeD(d) { if (d.close) { if (d.open) d.close(); } else d.removeAttribute('open'); }
  document.addEventListener('click', function (e) {
    var cl = e.target.closest('[data-close]');
    if (cl) { closeD(cl.closest('dialog')); return; }
    if (e.target.tagName === 'DIALOG') closeD(e.target);
    var menu = $('#user-menu');
    if (menu && menu.open && !e.target.closest('#user-menu')) menu.open = false;
    if (menu && menu.open && e.target.closest('.menu-list a, .menu-list button')) menu.open = false;
  });

  function askConfirm(o) {
    return new Promise(function (resolve) {
      var dlg = $('#dlg-confirm'), ok = $('#cf-ok'), typed = $('#cf-typed');
      $('#cf-title').textContent = o.title;
      $('#cf-text').textContent = o.text || '';
      ok.textContent = o.ok || 'Aceptar';
      ok.className = 'btn' + (o.danger ? ' danger' : '');
      var needTyped = !!o.typed;
      $('#cf-typed-wrap').hidden = !needTyped;
      typed.value = '';
      if (needTyped) {
        $('#cf-typed-label').textContent = 'Escribe ' + o.typed + ' para confirmar';
        ok.disabled = true;
        typed.oninput = function () { ok.disabled = typed.value.trim() !== o.typed; };
      } else { ok.disabled = false; typed.oninput = null; }
      var settled = false;
      function finish(v) { if (!settled) { settled = true; resolve(v); } }
      ok.onclick = function () { finish(true); closeD(dlg); };
      dlg.addEventListener('close', function h() { dlg.removeEventListener('close', h); finish(false); });
      openD(dlg);
    });
  }

  function setBusy(btn, busy, text) {
    if (!btn) return;
    if (busy) { btn.dataset.label = btn.textContent; btn.textContent = text || 'Un momento…'; btn.disabled = true; }
    else { btn.textContent = btn.dataset.label || btn.textContent; btn.disabled = false; }
  }

  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }

  /* ------------------------------------------------------------------ */
  /* Cabecera y cuenta                                                   */
  /* ------------------------------------------------------------------ */
  function renderHeader() {
    var u = api.user;
    $('#btn-login').hidden = !!u;
    $('#user-menu').hidden = !u;
    if (u) {
      $('#menu-initial').textContent = u.alias.charAt(0);
      $('#menu-alias').textContent = u.alias;
      $('#mi-admin').hidden = !u.isAdmin;
    }
    renderBadge();
  }
  function renderBadge() {
    $$('.js-badge').forEach(function (b) { b.textContent = S.pending; b.hidden = !S.pending; });
  }
  async function refreshOffers() {
    if (!api.user) { S.offers = []; S.pending = 0; renderBadge(); return; }
    try {
      S.offers = await api.myOffers();
      S.pending = S.offers.filter(function (o) { return o.role === 'received' && o.status === 'pending'; }).length;
    } catch (e) { /* el aviso no es crítico */ }
    renderBadge();
  }

  function showBanner() {
    var b = $('#banner');
    var msg = '', cls = 'banner';
    if (api.mode === 'broken') {
      cls += ' err';
      msg = 'Falta el archivo <b>supabase-lite.js</b> en la web. Súbelo junto al resto de archivos y recarga.';
    } else if (api.mode === 'demo') {
      msg = '<b>Modo demostración.</b> Los datos viven solo en esta pestaña y desaparecen al recargar. Escribe cualquier correo y contraseña para entrar. Con la palabra «admin» en el correo entras como moderador.';
    } else if (api.urlError) {
      cls += ' err';
      msg = 'El enlace del correo no ha funcionado: ' + esc(api.urlError) + '. Pide uno nuevo desde «Entrar» → «He olvidado mi contraseña».';
    }
    b.className = cls;
    b.innerHTML = msg;
    b.hidden = !msg;
  }

  /* ---- entrar / crear cuenta ---- */
  function authTab(name) {
    $$('[data-auth-tab]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.authTab === name ? 'true' : 'false'); });
    $$('#dlg-auth [data-panel]').forEach(function (f) { f.hidden = f.dataset.panel !== name; });
    $('#auth-title').textContent = name === 'signup' ? 'Crea tu cuenta' : (name === 'forgot' ? 'Recuperar contraseña' : 'Entrar en Trikitrueke');
    $$('#dlg-auth .err').forEach(function (p) { p.textContent = ''; });
    $('.tabs[aria-label]', $('#dlg-auth')).hidden = name === 'forgot';
  }
  function openAuth(tab, intro, after) {
    S.afterAuth = after || null;
    var p = $('#auth-intro');
    p.textContent = intro || '';
    p.hidden = !intro;
    authTab(tab || 'login');
    openD($('#dlg-auth'));
    setTimeout(function () { var f = $(tab === 'signup' ? '#s-alias' : '#l-email'); if (f) f.focus(); }, 40);
  }
  function afterAuthOk(msg) {
    closeD($('#dlg-auth'));
    renderHeader();
    refreshOffers();
    toast(msg);
    var f = S.afterAuth; S.afterAuth = null;
    if (f) f();
    route();
  }
  $$('[data-auth-tab]').forEach(function (b) { b.addEventListener('click', function () { authTab(b.dataset.authTab); }); });
  $('#btn-login').addEventListener('click', function () { openAuth('login'); });
  $('#btn-forgot').addEventListener('click', function () { authTab('forgot'); $('#f-email').value = $('#l-email').value; });
  $('#btn-back-login').addEventListener('click', function () { authTab('login'); });

  $('#form-login').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#login-err'); err.textContent = '';
    var email = $('#l-email').value.trim(), pass = $('#l-pass').value;
    if (!email || !pass) { err.textContent = 'Escribe tu correo y tu contraseña.'; return; }
    var btn = $('#login-submit'); setBusy(btn, true, 'Entrando…');
    try {
      await api.signIn({ email: email, password: pass });
      $('#l-pass').value = '';
      afterAuthOk('Hola, ' + api.user.alias + '.');
    } catch (ex) { err.textContent = api.niceError(ex); }
    setBusy(btn, false);
  });

  $('#form-signup').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#signup-err'); err.textContent = '';
    var alias = $('#s-alias').value.trim(), email = $('#s-email').value.trim(), pass = $('#s-pass').value;
    if (!/^[A-Za-z0-9_.-]{3,30}$/.test(alias)) { err.textContent = 'El alias debe tener de 3 a 30 letras, números, punto, guion o guion bajo, sin espacios.'; $('#s-alias').focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Escribe un correo válido.'; $('#s-email').focus(); return; }
    if (pass.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres.'; $('#s-pass').focus(); return; }
    if (!$('#s-age').checked) { err.textContent = 'Necesitas confirmar que tienes 18 años o más y aceptar las normas de uso.'; return; }
    if (!$('#s-priv').checked) { err.textContent = 'Necesitas confirmar que has leído la política de privacidad.'; return; }
    var btn = $('#signup-submit'); setBusy(btn, true, 'Creando cuenta…');
    try {
      var r = await api.signUp({ alias: alias, email: email, password: pass });
      $('#s-pass').value = '';
      if (r.needsConfirmation) {
        authTab('login');
        $('#l-email').value = email;
        var p = $('#auth-intro');
        p.textContent = 'Te hemos enviado un correo para confirmar la cuenta. Ábrelo y pulsa el enlace. Si no lo ves, mira en spam. Si ya tenías cuenta con ese correo, entra con tu contraseña.';
        p.hidden = false;
      } else {
        afterAuthOk('Cuenta creada. Bienvenido, ' + api.user.alias + '.');
      }
    } catch (ex) { err.textContent = api.niceError(ex); }
    setBusy(btn, false);
  });

  $('#form-forgot').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#forgot-err'); err.textContent = '';
    var email = $('#f-email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Escribe un correo válido.'; return; }
    var btn = $('#forgot-submit'); setBusy(btn, true, 'Enviando…');
    try {
      await api.resetPassword(email);
      authTab('login');
      var p = $('#auth-intro');
      p.textContent = 'Si ese correo tiene cuenta, te llegará un enlace para elegir una contraseña nueva.';
      p.hidden = false;
    } catch (ex) { err.textContent = api.niceError(ex); }
    setBusy(btn, false);
  });

  async function doLogout() {
    try { await api.signOut(); } catch (e) { /* se sale igualmente */ }
    S.offers = []; S.pending = 0;
    renderHeader();
    toast('Has cerrado sesión.');
    go('#inicio');
  }
  $('#mi-logout').addEventListener('click', doLogout);

  /* ---- cambiar contraseña ---- */
  function openPassword() {
    $('#form-password').reset(); $('#pw-err').textContent = '';
    openD($('#dlg-password'));
    setTimeout(function () { $('#p-new').focus(); }, 40);
  }
  $('#form-password').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#pw-err'); err.textContent = '';
    var a = $('#p-new').value, b = $('#p-new2').value;
    if (a.length < 8) { err.textContent = 'La contraseña debe tener al menos 8 caracteres.'; return; }
    if (a !== b) { err.textContent = 'Las dos contraseñas no coinciden.'; return; }
    var btn = $('#pw-submit'); setBusy(btn, true, 'Guardando…');
    try {
      await api.updatePassword(a);
      closeD($('#dlg-password'));
      toast('Contraseña cambiada.');
    } catch (ex) { err.textContent = api.niceError(ex); }
    setBusy(btn, false);
  });

  /* ------------------------------------------------------------------ */
  /* Catálogo (categorías y zonas)                                       */
  /* ------------------------------------------------------------------ */
  async function loadMeta() {
    var m = await api.loadMeta();
    S.cats = m.categories; S.zones = m.zones; S.counts = m.counts;
    renderZoneFilter();
    renderChips();
  }
  function mergeCat(c) {
    if (!S.cats.some(function (x) { return x.id === c.id; })) {
      S.cats.push(c);
      S.cats.sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); });
    }
  }
  function mergeZone(z) {
    if (!S.zones.some(function (x) { return x === z; })) {
      S.zones.push(z);
      S.zones.sort(function (a, b) { return a.localeCompare(b, 'es'); });
    }
  }
  function renderZoneFilter() {
    var cur = S.zone;
    $('#prov').innerHTML = '<option value="">Toda España</option>' + S.zones.map(function (z) { return '<option value="' + esc(z) + '">' + esc(z) + '</option>'; }).join('');
    $('#prov').value = cur;
  }
  function renderChips() {
    var total = 0;
    S.cats.forEach(function (c) { total += S.counts[c.id] || 0; });
    var html = '<button class="chip" type="button" data-cat="" aria-pressed="' + (S.cat === '' ? 'true' : 'false') + '">Todas <small>' + total + '</small></button>';
    S.cats.forEach(function (c) {
      html += '<button class="chip" type="button" data-cat="' + esc(c.id) + '" aria-pressed="' + (S.cat === c.id ? 'true' : 'false') + '">' + ico(c.icon) + esc(c.name) + ' <small>' + (S.counts[c.id] || 0) + '</small></button>';
    });
    html += '<button class="chip add" type="button" id="open-cat">' + ico('plus') + 'Proponer categoría</button>';
    $('#cats').innerHTML = html;
  }

  /* ------------------------------------------------------------------ */
  /* Listado de anuncios                                                 */
  /* ------------------------------------------------------------------ */
  function phHTML(l, big) {
    var c = catOf(l.category_id);
    return '<div class="ph' + (big ? ' detail-ph' : '') + '" style="--h:' + (parseInt(c.hue, 10) || 200) + '">' +
      (l.photoUrl ? '<img src="' + esc(l.photoUrl) + '" alt="Foto de ' + esc(l.title) + '" loading="lazy">' : ico(c.icon)) +
      (big && l.photoUrl ? '<button class="zoom" type="button" data-zoom="' + esc(l.photoUrl) + '" data-alt="Foto de ' + esc(l.title) + '" aria-label="Ampliar la foto"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg></button>' : '') +
      '<span class="tag">' + esc(c.name) + '</span></div>';
  }
  // Visor de fotos a pantalla completa (anuncio y chat)
  function openPhoto(url, alt) {
    var img = $('#photo-img');
    img.src = url; img.alt = alt || 'Foto ampliada';
    openD($('#dlg-photo'));
  }
  document.addEventListener('click', function (e) {
    var z = e.target.closest('[data-zoom]');
    if (z) { e.preventDefault(); openPhoto(z.dataset.zoom, z.dataset.alt); }
  });
  $('#dlg-photo').addEventListener('close', function () { $('#photo-img').removeAttribute('src'); });
  function cardHTML(l) {
    var want = l.want ? esc(l.want) : 'Lo que me propongas';
    var pill = l.open ? '<span class="pill">Escucho ofertas</span>' : '';
    return '<article class="card">' + phHTML(l, false) +
      '<div class="swapbox">' +
      '<div class="side give"><span class="lbl">Doy</span><h3><button type="button" data-open="' + esc(l.id) + '">' + esc(l.title) + '</button></h3></div>' +
      '<span class="knob">' + ico('swap') + '</span>' +
      '<div class="side want"><span class="lbl">Busco</span><p>' + want + pill + '</p></div>' +
      '</div>' +
      '<div class="meta"><span>' + esc(where(l)) + '</span><span>' + ago(l.created_at) + '</span></div>' +
      '</article>';
  }

  function renderGrid() {
    var g = $('#grid'), cnt = $('#count');
    $('#more').hidden = true;
    if (S.loading && !S.rows.length) {
      cnt.textContent = 'Buscando…';
      g.innerHTML = '<div class="skel"></div><div class="skel"></div><div class="skel"></div>';
      return;
    }
    if (S.error) {
      cnt.textContent = '';
      g.innerHTML = '<div class="empty"><h3>No hemos podido cargar los trueques</h3><p>' + esc(S.error) + '</p><button class="btn" type="button" data-act="retry">Reintentar</button></div>';
      return;
    }
    cnt.innerHTML = S.total + ' ' + (S.total === 1 ? 'trueque' : 'trueques') + (S.cat ? ' <span>en ' + esc(catOf(S.cat).name) + '</span>' : '');
    if (!S.rows.length) {
      g.innerHTML = '<div class="empty"><h3>Aquí todavía no hay nada que coincida</h3><p>Prueba con otra búsqueda o quita algún filtro. Y si lo que buscas no está, publícalo tú: alguien puede tenerlo.</p><button class="btn swap" type="button" data-act="publish">Publicar un trueque</button></div>';
      return;
    }
    g.innerHTML = S.rows.map(cardHTML).join('');
    $('#more').hidden = S.rows.length >= S.total;
  }

  async function loadListings(reset) {
    if (reset) { S.page = 0; S.rows = []; S.total = 0; }
    var my = ++S.req;
    S.loading = true; S.error = '';
    renderGrid();
    try {
      var P = api.PAGE_SIZE;
      var r = await api.listListings({ q: S.q, cat: S.cat, zone: S.zone, kind: S.kind, sort: S.sort, from: S.page * P, to: S.page * P + P - 1 });
      if (my !== S.req) return;
      S.rows = S.rows.concat(r.rows); S.total = r.count; S.page++;
    } catch (e) {
      if (my !== S.req) return;
      S.error = api.niceError(e);
    }
    S.loading = false;
    renderGrid();
  }

  async function reloadAll() {
    try { await loadMeta(); } catch (e) { /* se mantiene lo que había */ }
    await loadListings(true);
  }

  /* eventos de portada */
  $('#cats').addEventListener('click', function (e) {
    if (e.target.closest('#open-cat')) {
      if (!api.user) { openAuth('signup', 'Crea una cuenta gratuita para proponer una categoría.', function () { openCatDialog(); }); return; }
      openCatDialog(); return;
    }
    var b = e.target.closest('button[data-cat]');
    if (!b) return;
    S.cat = b.dataset.cat; renderChips(); loadListings(true);
  });
  $('#grid').addEventListener('click', function (e) {
    var o = e.target.closest('[data-open]');
    if (o) { openDetail(o.dataset.open); return; }
    var a = e.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'publish') startPublish();
    if (a.dataset.act === 'retry') loadListings(true);
  });
  $('#btn-more').addEventListener('click', function () { loadListings(false); });
  $('#search-form').addEventListener('submit', function (e) {
    e.preventDefault();
    S.q = $('#q').value; S.zone = $('#prov').value; loadListings(true);
  });
  $('#q').addEventListener('input', debounce(function () { S.q = $('#q').value; loadListings(true); }, 350));
  $('#prov').addEventListener('change', function () { S.zone = this.value; loadListings(true); });
  $('#sort').addEventListener('change', function () { S.sort = this.value; loadListings(true); });
  $('.seg').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-kind]');
    if (!b) return;
    S.kind = b.dataset.kind;
    $$('.seg button').forEach(function (x) { x.setAttribute('aria-pressed', x.dataset.kind === S.kind ? 'true' : 'false'); });
    loadListings(true);
  });

  /* proponer categoría */
  function openCatDialog() { $('#cat-form').reset(); $('#c-err').textContent = ''; openD($('#dlg-cat')); setTimeout(function () { $('#c-name').focus(); }, 40); }
  $('#cat-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#c-err'); err.textContent = '';
    var name = $('#c-name').value.trim();
    if (name.length < 2 || name.length > 30) { err.textContent = 'El nombre debe tener entre 2 y 30 letras.'; return; }
    var btn = $('#c-submit'); setBusy(btn, true, 'Creando…');
    try {
      var c = await api.addCategory(name);
      mergeCat(c);
      S.cat = c.id;
      closeD($('#dlg-cat'));
      renderChips(); loadListings(true);
      toast('Categoría «' + c.name + '» lista. Aún no tiene trueques: publica el primero.');
    } catch (ex) { err.textContent = api.niceError(ex); }
    setBusy(btn, false);
  });

  /* ------------------------------------------------------------------ */
  /* Publicar y editar                                                   */
  /* ------------------------------------------------------------------ */
  function startPublish() {
    if (!api.user) { openAuth('signup', 'Crea una cuenta gratuita para publicar tu trueque.', function () { openListingForm(null); }); return; }
    openListingForm(null);
  }
  $('#btn-publish').addEventListener('click', startPublish);

  function fillFormSelects() {
    $('#f-cat').innerHTML = S.cats.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('') + '<option value="__new">Otra categoría…</option>';
    $('#f-zone').innerHTML = S.zones.map(function (z) { return '<option value="' + esc(z) + '">' + esc(z) + '</option>'; }).join('') + '<option value="__new">Otra provincia o comunidad…</option>';
  }
  function openListingForm(row) {
    S.editing = row || null;
    $('#listing-form').reset();
    fillFormSelects();
    $('#lf-title').textContent = row ? 'Editar trueque' : 'Publicar un trueque';
    $('#lf-submit').textContent = row ? 'Guardar cambios' : 'Publicar trueque';
    $('#lf-err').textContent = '';
    $('#f-newcat').hidden = true; $('#f-newzone').hidden = true;
    var pv = $('#f-preview');
    pv.hidden = true; pv.removeAttribute('src');
    $('#f-rmphoto-wrap').hidden = true;
    if (row) {
      $('#f-title').value = row.title; $('#f-desc').value = row.description;
      $('#f-cat').value = row.category_id; $('#f-zone').value = row.zone;
      $('#f-want').value = row.want; $('#f-open').checked = row.open; $('#f-town').value = row.town;
      if (row.photoUrl) { pv.src = row.photoUrl; pv.hidden = false; $('#f-rmphoto-wrap').hidden = false; }
    } else if (S.zone && S.zones.indexOf(S.zone) >= 0) {
      $('#f-zone').value = S.zone;
    }
    openD($('#dlg-listing'));
    setTimeout(function () { $('#f-title').focus(); }, 40);
  }
  $('#f-cat').addEventListener('change', function () { var n = $('#f-newcat'); n.hidden = this.value !== '__new'; if (!n.hidden) n.focus(); });
  $('#f-zone').addEventListener('change', function () { var n = $('#f-newzone'); n.hidden = this.value !== '__new'; if (!n.hidden) n.focus(); });
  $('#f-photo').addEventListener('change', function () {
    var f = this.files && this.files[0];
    var pv = $('#f-preview');
    if (!f) { pv.hidden = true; return; }
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { $('#lf-err').textContent = 'Solo se admiten fotos JPG, PNG o WebP.'; this.value = ''; return; }
    if (f.size > 15 * 1024 * 1024) { $('#lf-err').textContent = 'Esa foto pesa demasiado. Usa una de menos de 15 MB.'; this.value = ''; return; }
    $('#lf-err').textContent = '';
    pv.src = URL.createObjectURL(f); pv.hidden = false;
  });

  $('#listing-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#lf-err'); err.textContent = '';
    var editing = S.editing;
    var d = {
      title: $('#f-title').value.trim(), description: $('#f-desc').value.trim(), want: $('#f-want').value.trim(),
      open: $('#f-open').checked, town: $('#f-town').value.trim(), category_id: $('#f-cat').value, zone: $('#f-zone').value,
      file: $('#f-photo').files[0] || null, removePhoto: $('#f-rmphoto').checked, oldPath: editing ? editing.photo_path : null
    };
    if (d.title.length < 3) { err.textContent = 'Escribe qué das, con al menos 3 letras.'; $('#f-title').focus(); return; }
    if (!d.want && !d.open) { err.textContent = 'Dinos qué buscas o marca «Escucho ofertas».'; $('#f-want').focus(); return; }
    var newCat = '', newZone = '';
    if (d.category_id === '__new') {
      newCat = $('#f-newcat').value.trim();
      if (newCat.length < 2 || newCat.length > 30) { err.textContent = 'El nombre de la categoría debe tener entre 2 y 30 letras.'; $('#f-newcat').focus(); return; }
    }
    if (d.zone === '__new') {
      newZone = $('#f-newzone').value.trim();
      if (newZone.length < 2 || newZone.length > 30) { err.textContent = 'El nombre de tu provincia o comunidad debe tener entre 2 y 30 letras.'; $('#f-newzone').focus(); return; }
    }
    var btn = $('#lf-submit'); setBusy(btn, true, 'Guardando…');
    try {
      if (newCat) { var c = await api.addCategory(newCat); mergeCat(c); d.category_id = c.id; }
      if (newZone) { var z = await api.addZone(newZone); mergeZone(z); d.zone = z; }
      if (editing) await api.updateListing(editing.id, d); else await api.createListing(d);
      closeD($('#dlg-listing'));
      toast(editing ? 'Cambios guardados.' : 'Trueque publicado. Ya lo puede ver todo el mundo.');
      S.editing = null;
      renderZoneFilter();
      await reloadAll();
      go('#mis-anuncios');
    } catch (ex) { err.textContent = api.niceError(ex); }
    setBusy(btn, false);
  });

  /* ------------------------------------------------------------------ */
  /* Ficha del anuncio                                                   */
  /* ------------------------------------------------------------------ */
  async function openDetail(id) {
    var dlg = $('#dlg-detail'), body = $('#detail-body');
    body.innerHTML = '<div class="dlg-head"><h2 id="d-title">Cargando…</h2><button class="x" type="button" data-close aria-label="Cerrar">' + CLOSE_SVG + '</button></div>';
    openD(dlg);
    var l = null;
    try { l = await api.getListing(id); } catch (e) {
      body.innerHTML = '<div class="dlg-head"><h2 id="d-title">No se pudo abrir</h2><button class="x" type="button" data-close aria-label="Cerrar">' + CLOSE_SVG + '</button></div><p>' + esc(api.niceError(e)) + '</p>';
      return;
    }
    if (!l) {
      body.innerHTML = '<div class="dlg-head"><h2 id="d-title">Este anuncio ya no está</h2><button class="x" type="button" data-close aria-label="Cerrar">' + CLOSE_SVG + '</button></div><p>Puede que su autor lo haya borrado o que el trueque ya se haya cerrado.</p>';
      return;
    }
    var me = api.user;
    var mine = !!(me && me.id === l.user_id);
    var c = catOf(l.category_id);
    var note = '';
    if (l.category_id === 'casas') note = '<p class="note">En cambios de vivienda, dejad por escrito fechas, gastos de limpieza y qué pasa si alguien cancela. Conviene revisar vuestro seguro del hogar y las normas de la comunidad de vecinos.</p>';
    else if (l.category_id === 'vehiculos') note = '<p class="note">Antes de entregar un vehículo, comprobad la documentación, las cargas y el cambio de titularidad.</p>';

    var status = '';
    if (l.status === 'hidden') status = '<p class="banner err"><b>Anuncio oculto por moderación.</b> ' + esc(l.moderation_note || '') + '</p>';
    else if (l.status === 'done') status = '<p class="banner">Este trueque ya se ha cerrado.</p>';

    var actions = '';
    if (mine) {
      actions = '<div class="row-start">' +
        '<button class="btn sm" type="button" data-d="edit">Editar</button>' +
        (l.status === 'active' ? '<button class="btn sm ghost" type="button" data-d="done">Marcar como cambiado</button>' : '') +
        '<a class="btn sm ghost" href="#mis-anuncios" data-close>Mis anuncios</a></div>';
    } else if (l.status !== 'active') {
      actions = '';
    } else if (!me) {
      actions = '<div class="panel"><h3>¿Te interesa?</h3><p>Crea una cuenta gratuita o entra para proponer un trueque. Nadie verá tu correo.</p><div class="row-start"><button class="btn" type="button" data-d="login">Entrar o crear cuenta</button></div></div>';
    } else {
      actions = '<form class="f panel" id="offer-form" novalidate><h3>Proponer un trueque</h3>' +
        '<div class="fld"><label for="o-what">Qué ofreces a cambio</label><input class="in" id="o-what" maxlength="100" placeholder="Ej.: Una bici de carretera talla 54"></div>' +
        '<div class="fld"><label for="o-msg">Mensaje (opcional)</label><textarea class="in" id="o-msg" maxlength="400" placeholder="Cuéntale cómo está lo que ofreces y cuándo podrías quedar"></textarea></div>' +
        '<p class="hint">Por seguridad no compartas teléfono, dirección ni datos bancarios hasta que estés seguro.</p>' +
        '<p class="err" id="o-err" role="alert"></p>' +
        '<div class="row-end"><button class="btn" type="submit" id="o-submit">Enviar propuesta</button></div></form>';
    }
    var report = '';
    if (me && !mine && l.status === 'active') {
      report = '<details class="report"><summary>Denunciar este anuncio</summary>' +
        '<form class="f" id="report-form" novalidate>' +
        '<div class="fld"><label for="r-reason">Motivo</label><select class="in" id="r-reason">' +
        Object.keys(REASONS).map(function (k) { return '<option value="' + k + '">' + esc(REASONS[k]) + '</option>'; }).join('') + '</select></div>' +
        '<div class="fld"><label for="r-details">Detalles (opcional)</label><textarea class="in" id="r-details" maxlength="300"></textarea></div>' +
        '<p class="err" id="r-err" role="alert"></p>' +
        '<div class="row-end"><button class="btn sm danger" type="submit" id="r-submit">Enviar denuncia</button></div></form></details>';
    }

    body.innerHTML =
      '<div class="dlg-head"><h2 id="d-title">' + esc(l.title) + '</h2><button class="x" type="button" data-close aria-label="Cerrar">' + CLOSE_SVG + '</button></div>' +
      phHTML(l, true) + status +
      '<div class="pair"><div class="side give"><span class="lbl">Doy</span><p><b>' + esc(l.title) + '</b></p></div>' +
      '<div class="side want"><span class="lbl">Busco</span><p>' + (l.want ? esc(l.want) : 'Lo que me propongas') + (l.open ? '<span class="pill">Escucho ofertas</span>' : '') + '</p></div></div>' +
      (l.description ? '<p style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(l.description) + '</p>' : '') +
      '<p class="sub" style="color:var(--muted);font-size:.9rem">' + esc(c.name) + (where(l) ? ' · ' + esc(where(l)) : '') + ' · ' + ago(l.created_at) + (l.alias ? ' · por <b>' + esc(l.alias) + '</b>' : '') + '</p>' +
      note + actions + report +
      '<div class="copyrow"><button class="linkbtn" type="button" data-d="copy">Copiar enlace al anuncio</button></div>';

    body.onclick = function (e) {
      var b = e.target.closest('[data-d]');
      if (!b) return;
      var a = b.dataset.d;
      if (a === 'login') { closeD(dlg); openAuth('signup', 'Crea una cuenta gratuita para proponer este trueque.', function () { openDetail(id); }); }
      if (a === 'edit') { closeD(dlg); openListingForm(l); }
      if (a === 'done') {
        api.setListingStatus(l.id, 'done').then(function () { closeD(dlg); toast('Marcado como cambiado. Ya no aparece en la portada.'); reloadAll(); if (location.hash === '#mis-anuncios') route(); }, function (ex) { toast(api.niceError(ex)); });
      }
      if (a === 'copy') {
        var link = location.origin + location.pathname + '#a-' + l.id;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { toast('Enlace copiado.'); }, function () { toast(link); });
        else toast(link);
      }
    };

    var of = $('#offer-form', body);
    if (of) of.addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = $('#o-err', body); err.textContent = '';
      var what = $('#o-what', body).value.trim();
      if (what.length < 2) { err.textContent = 'Indica qué ofreces a cambio.'; $('#o-what', body).focus(); return; }
      var btn = $('#o-submit', body); setBusy(btn, true, 'Enviando…');
      try {
        await api.createOffer({ listing_id: l.id, offer_text: what, message: $('#o-msg', body).value.trim() });
        closeD(dlg);
        toast('Propuesta enviada. La verás en «Propuestas» y podréis hablar ahí.');
        refreshOffers();
      } catch (ex) { err.textContent = api.niceError(ex); setBusy(btn, false); }
    });
    var rf = $('#report-form', body);
    if (rf) rf.addEventListener('submit', async function (e) {
      e.preventDefault();
      var err = $('#r-err', body); err.textContent = '';
      var btn = $('#r-submit', body); setBusy(btn, true, 'Enviando…');
      try {
        await api.createReport({ listing_id: l.id, reason: $('#r-reason', body).value, details: $('#r-details', body).value.trim() });
        closeD(dlg);
        toast('Gracias. Revisaremos el anuncio.');
      } catch (ex) { err.textContent = api.niceError(ex); setBusy(btn, false); }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Mis anuncios                                                        */
  /* ------------------------------------------------------------------ */
  async function loadMine() {
    var box = $('#mine-rows');
    box.innerHTML = '<div class="skel" style="height:90px"></div>';
    var rows;
    try { rows = await api.myListings(); } catch (e) { box.innerHTML = '<div class="empty inline"><p>' + esc(api.niceError(e)) + '</p></div>'; return; }
    if (!rows.length) {
      box.innerHTML = '<div class="empty inline"><h3>Todavía no has publicado nada</h3><p>Publica tu primer trueque. Tarda un minuto.</p><button class="btn swap" type="button" data-act="publish">Publicar un trueque</button></div>';
      return;
    }
    box.innerHTML = rows.map(function (l) {
      var c = catOf(l.category_id), st = LST[l.status] || LST.active;
      var acts = '<button class="btn sm ghost" type="button" data-m="view" data-id="' + esc(l.id) + '">Ver</button>';
      if (l.status === 'active') acts += '<button class="btn sm ghost" type="button" data-m="edit" data-id="' + esc(l.id) + '">Editar</button><button class="btn sm ghost" type="button" data-m="done" data-id="' + esc(l.id) + '">Marcar como cambiado</button>';
      if (l.status === 'done') acts += '<button class="btn sm ghost" type="button" data-m="reactivate" data-id="' + esc(l.id) + '">Volver a publicar</button>';
      acts += '<button class="btn sm danger" type="button" data-m="delete" data-id="' + esc(l.id) + '">Borrar</button>';
      return '<article class="row"><div class="thumb" style="--h:' + (parseInt(c.hue, 10) || 200) + '">' + (l.photoUrl ? '<img src="' + esc(l.photoUrl) + '" alt="" loading="lazy">' : ico(c.icon)) + '</div>' +
        '<div><h3>' + esc(l.title) + '</h3><p class="sub"><span class="st ' + st[1] + '">' + st[0] + '</span>' + esc(c.name) + ' · ' + esc(where(l)) + ' · ' + ago(l.created_at) + '</p>' +
        (l.status === 'hidden' ? '<p class="why"><b>Motivo:</b> ' + esc(l.moderation_note || 'Incumple las normas de uso.') + ' Puedes escribirnos si crees que es un error.</p>' : '') + '</div>' +
        '<div class="acts">' + acts + '</div></article>';
    }).join('');
    box._rows = rows;
  }
  $('#mine-rows').addEventListener('click', async function (e) {
    var p = e.target.closest('[data-act="publish"]');
    if (p) { startPublish(); return; }
    var b = e.target.closest('[data-m]');
    if (!b) return;
    var box = $('#mine-rows');
    var l = (box._rows || []).filter(function (x) { return x.id === b.dataset.id; })[0];
    if (!l) return;
    var m = b.dataset.m;
    try {
      if (m === 'view') openDetail(l.id);
      if (m === 'edit') openListingForm(l);
      if (m === 'done') { await api.setListingStatus(l.id, 'done'); toast('Marcado como cambiado.'); await reloadAll(); loadMine(); }
      if (m === 'reactivate') { await api.setListingStatus(l.id, 'active'); toast('Vuelve a estar publicado.'); await reloadAll(); loadMine(); }
      if (m === 'delete') {
        var ok = await askConfirm({ title: '¿Borrar este anuncio?', text: 'Se borran también sus propuestas y su foto. No se puede deshacer.', ok: 'Borrar anuncio', danger: true });
        if (!ok) return;
        await api.deleteListing(l);
        toast('Anuncio borrado.');
        await reloadAll(); loadMine(); refreshOffers();
      }
    } catch (ex) { toast(api.niceError(ex)); }
  });

  /* ------------------------------------------------------------------ */
  /* Propuestas                                                          */
  /* ------------------------------------------------------------------ */
  async function loadInbox() {
    $('#inbox-rows').innerHTML = '<div class="skel" style="height:90px"></div>';
    await refreshOffers();
    renderInbox();
  }
  function renderInbox() {
    $$('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', b.dataset.tab === S.offerTab ? 'true' : 'false'); });
    var rows = S.offers.filter(function (o) { return o.role === S.offerTab; });
    var box = $('#inbox-rows');
    if (!rows.length) {
      box.innerHTML = S.offerTab === 'received'
        ? '<div class="empty inline"><h3>No has recibido propuestas</h3><p>Cuando alguien te proponga un cambio, aparecerá aquí. Un anuncio con foto y con «Escucho ofertas» recibe más.</p></div>'
        : '<div class="empty inline"><h3>No has enviado propuestas</h3><p>Abre cualquier anuncio y pulsa «Proponer un trueque».</p><a class="btn" href="#inicio">Ver trueques</a></div>';
      return;
    }
    box.innerHTML = rows.map(function (o) {
      var st = OST[o.status] || OST.pending;
      var who = o.role === 'received' ? esc(o.other_alias) + ' te ofrece: <b>' + esc(o.offer_text) + '</b>' : 'Tú ofreces: <b>' + esc(o.offer_text) + '</b> a ' + esc(o.other_alias);
      return '<article class="row plain"><div><h3>' + esc(o.listing_title) + '</h3><p class="sub"><span class="st ' + st[1] + '">' + st[0] + '</span>' + who + ' · ' + ago(o.created_at) + '</p></div>' +
        '<div class="acts"><button class="btn sm" type="button" data-offer="' + esc(o.id) + '">Abrir</button></div></article>';
    }).join('');
  }
  $('#view-inbox').addEventListener('click', function (e) {
    var t = e.target.closest('[data-tab]');
    if (t) { S.offerTab = t.dataset.tab; renderInbox(); return; }
    var o = e.target.closest('[data-offer]');
    if (o) openThread(o.dataset.offer);
  });

  async function openThread(id) {
    var o = S.offers.filter(function (x) { return x.id === id; })[0];
    if (!o) { await refreshOffers(); o = S.offers.filter(function (x) { return x.id === id; })[0]; }
    if (!o) { toast('No se encontró esa propuesta.'); return; }
    S.thread = o;
    $('#thread-body').innerHTML = '<div class="dlg-head"><h2 id="t-title">' + esc(o.listing_title) + '</h2><button class="x" type="button" data-close aria-label="Cerrar">' + CLOSE_SVG + '</button></div><div class="skel" style="height:120px"></div>';
    openD($('#dlg-thread'));
    renderThread();
  }
  var PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
  // Enlace al mapa (OpenStreetMap). Los números se validan porque vienen de otra persona.
  function mapLink(p) {
    var lat = Number(p.lat), lng = Number(p.lng);
    if (p.lat != null && p.lng != null && isFinite(lat) && isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return 'https://www.openstreetmap.org/?mlat=' + lat + '&mlon=' + lng + '#map=17/' + lat + '/' + lng;
    }
    return 'https://www.openstreetmap.org/search?query=' + encodeURIComponent(p.label || '');
  }
  function placeHTML(p) {
    var exact = p.lat != null && p.lng != null;
    return '<div class="place">' + PIN_SVG + '<div><b>' + esc(p.label || 'Punto de encuentro') + '</b>' + (exact ? '<small>Ubicación exacta compartida</small>' : '') +
      '<a href="' + esc(mapLink(p)) + '" target="_blank" rel="noopener noreferrer">Ver en el mapa</a></div></div>';
  }
  function msgHTML(m) {
    var photo = '';
    if (m.hasPhoto) {
      photo = m.photoUrl
        ? '<button class="chatimg" type="button" data-zoom="' + esc(m.photoUrl) + '" data-alt="Foto enviada por ' + esc(m.mine ? 'ti' : m.alias) + '"><img src="' + esc(m.photoUrl) + '" alt="Foto enviada" loading="lazy"></button>'
        : '<p class="muted">Foto no disponible.</p>';
    }
    return '<div class="bub' + (m.mine ? ' me' : '') + '"><small>' + (m.mine ? 'Tú' : esc(m.alias)) + ' · ' + ago(m.created_at) + '</small>' +
      (m.body ? '<div>' + esc(m.body) + '</div>' : '') + photo + (m.place ? placeHTML(m.place) : '') + '</div>';
  }
  // Borrador del mensaje que se está escribiendo (se conserva al pulsar «Actualizar»)
  var draft = { id: null, text: '', file: null, previewUrl: '', place: null };
  function resetDraft(id) {
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    draft = { id: id, text: '', file: null, previewUrl: '', place: null };
  }
  function renderDraftChips() {
    var box = $('#t-attach'); if (!box) return;
    var h = '';
    if (draft.file) h += '<span class="chip-att"><img src="' + esc(draft.previewUrl) + '" alt="" width="36" height="36"><span>Foto lista</span><button type="button" data-t="rm-photo" aria-label="Quitar la foto">×</button></span>';
    if (draft.place) h += '<span class="chip-att">' + PIN_SVG + '<span>' + esc(draft.place.label || 'Ubicación actual') + (draft.place.lat != null ? ' (exacta)' : '') + '</span><button type="button" data-t="rm-place" aria-label="Quitar el punto de encuentro">×</button></span>';
    box.innerHTML = h;
  }
  async function renderThread() {
    var o = S.thread, body = $('#thread-body');
    if (draft.id !== o.id) resetDraft(o.id);
    else if ($('#t-body')) draft.text = $('#t-body').value;
    var msgs = [];
    var loadErr = '';
    try { msgs = await api.getThread(o.id); } catch (e) { loadErr = api.niceError(e); }
    var st = OST[o.status] || OST.pending;
    var open = o.status === 'pending' || o.status === 'accepted';
    var first = '<div class="bub' + (o.role === 'sent' ? ' me' : '') + '"><small>' + (o.role === 'sent' ? 'Tú' : esc(o.other_alias)) + ' · propuesta · ' + ago(o.created_at) + '</small>Ofrece: <b>' + esc(o.offer_text) + '</b>' + (o.message ? '<br>' + esc(o.message) : '') + '</div>';
    var list = msgs.map(msgHTML).join('');
    var acts = '';
    if (o.role === 'received' && o.status === 'pending') acts = '<button class="btn sm" type="button" data-t="accept">Aceptar propuesta</button><button class="btn sm danger" type="button" data-t="decline">Rechazar</button>';
    if (o.role === 'sent' && open) acts = '<button class="btn sm danger" type="button" data-t="withdraw">Retirar mi propuesta</button>';
    var hint = o.status === 'accepted' ? '<p class="note">Propuesta aceptada. Acordad lugar y hora aquí. Quedad en un sitio público, comprobad el artículo antes de cambiar y no compartáis datos bancarios. Cuando cerréis el trueque, marca el anuncio como «cambiado» desde «Mis anuncios».</p>' : '';
    body.innerHTML =
      '<div class="dlg-head"><h2 id="t-title">' + esc(o.listing_title) + '</h2><button class="x" type="button" data-close aria-label="Cerrar">' + CLOSE_SVG + '</button></div>' +
      '<p class="sub" style="color:var(--muted)"><span class="st ' + st[1] + '">' + st[0] + '</span>Con <b>' + esc(o.other_alias) + '</b></p>' + hint +
      (loadErr ? '<p class="err">' + esc(loadErr) + '</p>' : '') +
      '<div class="thread" id="thread-list" tabindex="0" aria-label="Conversación">' + first + list + '</div>' +
      (acts ? '<div class="row-start">' + acts + '</div>' : '') +
      (open ? '<form class="f" id="msg-form" novalidate><div class="fld"><label for="t-body">Escribe un mensaje</label><textarea class="in" id="t-body" maxlength="500"></textarea></div>' +
        '<div class="attach" id="t-attach"></div>' +
        '<div class="row-start tools"><button class="btn sm ghost" type="button" data-t="photo">Añadir foto</button><button class="btn sm ghost" type="button" data-t="place">Punto de encuentro</button>' +
        '<input type="file" id="t-file" accept="image/jpeg,image/png,image/webp" hidden></div>' +
        '<div class="panel" id="t-placebox" hidden><p class="hint">Proponed un sitio público y con gente (plaza, cafetería, aparcamiento de un supermercado). No compartas la dirección de tu casa.</p>' +
        '<div class="fld"><label for="t-place">Escribe el lugar</label><input class="in" id="t-place" maxlength="100" placeholder="Ej.: Plaza de los Fueros, Estella"></div>' +
        '<div class="row-start"><button class="btn sm" type="button" data-t="place-text">Añadir este lugar</button><button class="btn sm ghost" type="button" data-t="place-gps">Usar mi ubicación actual</button></div>' +
        '<p class="hint">«Ubicación actual» envía tu posición exacta de este momento (se te pedirá permiso). Úsala solo si ya estás en el punto de encuentro.</p></div>' +
        '<p class="err" id="t-err" role="alert"></p><div class="row-end"><button class="btn ghost" type="button" data-t="refresh">Actualizar</button><button class="btn" type="submit" id="t-send">Enviar</button></div></form>'
        : '<p class="note">Esta propuesta está cerrada y ya no admite mensajes.</p>');
    var tl = $('#thread-list', body);
    if (tl) tl.scrollTop = tl.scrollHeight;
    if ($('#t-body')) { $('#t-body').value = draft.text; renderDraftChips(); }
  }
  $('#thread-body').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-t]');
    if (!b || !S.thread) return;
    var a = b.dataset.t, o = S.thread;
    var terr = $('#t-err');
    if (a === 'photo') { $('#t-file').click(); return; }
    if (a === 'place') { var pb = $('#t-placebox'); pb.hidden = !pb.hidden; if (!pb.hidden) $('#t-place').focus(); return; }
    if (a === 'rm-photo') { if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl); draft.file = null; draft.previewUrl = ''; renderDraftChips(); return; }
    if (a === 'rm-place') { draft.place = null; renderDraftChips(); return; }
    if (a === 'place-text') {
      var txt = $('#t-place').value.trim();
      if (txt.length < 3) { terr.textContent = 'Escribe el nombre del lugar (mínimo 3 letras).'; $('#t-place').focus(); return; }
      terr.textContent = ''; draft.place = { lat: null, lng: null, label: txt }; $('#t-place').value = ''; $('#t-placebox').hidden = true; renderDraftChips(); return;
    }
    if (a === 'place-gps') {
      if (!navigator.geolocation) { terr.textContent = 'Tu navegador no permite compartir la ubicación. Escribe el lugar a mano.'; return; }
      terr.textContent = ''; setBusy(b, true, 'Buscando…');
      navigator.geolocation.getCurrentPosition(function (pos) {
        setBusy(b, false);
        draft.place = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: $('#t-place').value.trim() };
        $('#t-place').value = ''; $('#t-placebox').hidden = true; renderDraftChips();
      }, function (er) {
        setBusy(b, false);
        terr.textContent = er && er.code === 1 ? 'No has dado permiso para usar tu ubicación. Puedes escribir el lugar a mano.'
          : er && er.code === 3 ? 'Tardó demasiado en encontrar tu ubicación. Inténtalo otra vez o escribe el lugar.'
          : 'No se pudo obtener tu ubicación. Escribe el lugar a mano.';
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
      return;
    }
    try {
      if (a === 'refresh') { await renderThread(); return; }
      var map = { accept: 'accepted', decline: 'declined', withdraw: 'withdrawn' };
      if (a === 'decline' || a === 'withdraw') {
        var ok = await askConfirm({ title: a === 'decline' ? '¿Rechazar esta propuesta?' : '¿Retirar tu propuesta?', text: 'La conversación se cierra y no se puede reabrir.', ok: a === 'decline' ? 'Rechazar' : 'Retirar', danger: true });
        if (!ok) return;
      }
      await api.setOfferStatus(o.id, map[a]);
      o.status = map[a];
      await refreshOffers();
      S.thread = S.offers.filter(function (x) { return x.id === o.id; })[0] || o;
      toast(a === 'accept' ? 'Propuesta aceptada. Acordad el cambio en la conversación.' : 'Hecho.');
      renderThread(); if (location.hash === '#propuestas') renderInbox();
    } catch (ex) { toast(api.niceError(ex)); }
  });
  $('#thread-body').addEventListener('change', function (e) {
    if (e.target.id !== 't-file') return;
    var f = e.target.files[0]; e.target.value = '';
    var err = $('#t-err'); err.textContent = '';
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { err.textContent = 'Solo se admiten fotos JPG, PNG o WebP.'; return; }
    if (f.size > 15 * 1024 * 1024) { err.textContent = 'Esa foto pesa demasiado. Elige otra de menos de 15 MB.'; return; }
    if (draft.previewUrl) URL.revokeObjectURL(draft.previewUrl);
    draft.file = f; draft.previewUrl = URL.createObjectURL(f); renderDraftChips();
  });
  $('#thread-body').addEventListener('submit', async function (e) {
    if (e.target.id !== 'msg-form') return;
    e.preventDefault();
    var err = $('#t-err'), ta = $('#t-body');
    err.textContent = '';
    var text = ta.value.trim();
    if (!text && !draft.file && !draft.place) { err.textContent = 'Escribe algo, añade una foto o comparte un punto de encuentro.'; return; }
    var btn = $('#t-send'); setBusy(btn, true, 'Enviando…');
    try {
      await api.addMessage(S.thread.id, { body: text, file: draft.file, place: draft.place });
      resetDraft(S.thread.id);
      await renderThread();
    }
    catch (ex) { err.textContent = api.niceError(ex); setBusy(btn, false); }
  });

  /* ------------------------------------------------------------------ */
  /* Cuenta                                                              */
  /* ------------------------------------------------------------------ */
  function renderAccount() {
    var u = api.user;
    $('#acc-alias').textContent = u.alias;
    $('#acc-email').textContent = u.email;
  }
  $('#view-account').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-acc]');
    if (!b) return;
    var a = b.dataset.acc;
    try {
      if (a === 'logout') await doLogout();
      if (a === 'password') openPassword();
      if (a === 'export') {
        var data = await api.exportMyData();
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'trikitrueke-mis-datos.json';
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(function () { URL.revokeObjectURL(link.href); }, 2000);
        toast('Descarga preparada.');
      }
      if (a === 'delete') {
        var ok = await askConfirm({ title: '¿Borrar tu cuenta?', text: 'Se borran tu perfil, tus anuncios, tus fotos, tus propuestas y tus mensajes. No se puede deshacer.', ok: 'Borrar mi cuenta', danger: true, typed: 'BORRAR' });
        if (!ok) return;
        await api.deleteAccount();
        S.offers = []; S.pending = 0;
        renderHeader();
        toast('Tu cuenta se ha borrado.');
        await reloadAll();
        go('#inicio');
      }
    } catch (ex) { toast(api.niceError(ex)); }
  });

  /* ------------------------------------------------------------------ */
  /* Moderación                                                          */
  /* ------------------------------------------------------------------ */
  async function loadAdmin() {
    var box = $('#admin-rows');
    box.innerHTML = '<div class="skel" style="height:90px"></div>';
    var rows;
    try { rows = await api.listReports(); } catch (e) { box.innerHTML = '<div class="empty inline"><p>' + esc(api.niceError(e)) + '</p></div>'; return; }
    box._rows = rows;
    if (!rows.length) { box.innerHTML = '<div class="empty inline"><h3>Sin denuncias abiertas</h3><p>Todo en orden por ahora.</p></div>'; return; }
    box.innerHTML = rows.map(function (r) {
      return '<article class="row plain"><div><h3>' + esc(r.listing.title) + '</h3>' +
        '<p class="sub"><span class="st warn">' + esc(REASONS[r.reason] || r.reason) + '</span>Denuncia de <b>' + esc(r.reporter) + '</b> · anuncio de <b>' + esc(r.listing.owner || '—') + '</b> · ' + ago(r.created_at) + '</p>' +
        (r.details ? '<p class="sub">«' + esc(r.details) + '»</p>' : '') + '</div>' +
        '<div class="acts">' +
        '<button class="btn sm ghost" type="button" data-r="view" data-id="' + esc(r.id) + '">Ver anuncio</button>' +
        '<button class="btn sm" type="button" data-r="hide" data-id="' + esc(r.id) + '">Ocultar</button>' +
        '<button class="btn sm danger" type="button" data-r="delete" data-id="' + esc(r.id) + '">Borrar</button>' +
        '<button class="btn sm ghost" type="button" data-r="dismiss" data-id="' + esc(r.id) + '">Descartar</button></div></article>';
    }).join('');
  }
  $('#admin-rows').addEventListener('click', async function (e) {
    var b = e.target.closest('[data-r]');
    if (!b) return;
    var rep = ($('#admin-rows')._rows || []).filter(function (x) { return x.id === b.dataset.id; })[0];
    if (!rep) return;
    var a = b.dataset.r;
    try {
      if (a === 'view') openDetail(rep.listing.id);
      if (a === 'hide') { S.modTarget = rep; $('#mod-form').reset(); $('#m-err').textContent = ''; openD($('#dlg-mod')); }
      if (a === 'dismiss') { await api.moderate({ action: 'dismiss', reportId: rep.id }); toast('Denuncia descartada.'); loadAdmin(); }
      if (a === 'delete') {
        var ok = await askConfirm({ title: '¿Borrar el anuncio?', text: 'Se borra el anuncio, su foto y sus propuestas. Quien lo publicó no recibirá aviso. Si prefieres que vea el motivo, usa «Ocultar».', ok: 'Borrar anuncio', danger: true });
        if (!ok) return;
        await api.moderate({ action: 'delete', listingId: rep.listing.id, photoPath: rep.listing.photo_path });
        toast('Anuncio borrado.'); loadAdmin(); reloadAll();
      }
    } catch (ex) { toast(api.niceError(ex)); }
  });
  $('#mod-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var err = $('#m-err'); err.textContent = '';
    var note = $('#m-note').value.trim();
    if (note.length < 5) { err.textContent = 'Escribe un motivo de al menos 5 letras. Lo verá el autor del anuncio.'; return; }
    var btn = $('#m-submit'); setBusy(btn, true, 'Ocultando…');
    try {
      await api.moderate({ action: 'hide', reportId: S.modTarget.id, listingId: S.modTarget.listing.id, note: note });
      closeD($('#dlg-mod'));
      toast('Anuncio oculto. Su autor verá el motivo.');
      loadAdmin(); reloadAll();
    } catch (ex) { err.textContent = api.niceError(ex); }
    setBusy(btn, false);
  });

  /* ------------------------------------------------------------------ */
  /* Navegación                                                          */
  /* ------------------------------------------------------------------ */
  function showView(name) {
    $$('[data-view]').forEach(function (s) { s.hidden = s.dataset.view !== name; });
    if (name === 'mine') loadMine();
    if (name === 'inbox') loadInbox();
    if (name === 'account') renderAccount();
    if (name === 'admin') loadAdmin();
  }
  function route() {
    var h = location.hash || '#inicio';
    var name = 'home';
    if (h === '#mis-anuncios') name = 'mine';
    else if (h === '#propuestas') name = 'inbox';
    else if (h === '#cuenta') name = 'account';
    else if (h === '#moderacion') name = 'admin';
    if (name !== 'home' && !api.user) {
      history.replaceState(null, '', '#inicio');
      showView('home');
      openAuth('login', 'Entra para ver esta página.');
      return;
    }
    if (name === 'admin' && !(api.user && api.user.isAdmin)) name = 'home';
    showView(name);
    var m = /^#a-([0-9a-zA-Z-]{8,64})$/.exec(h);
    if (m) { history.replaceState(null, '', '#inicio'); openDetail(m[1]); return; }
    if (h === '#como') { var el = $('#como'); if (el && el.scrollIntoView) el.scrollIntoView(); }
    else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  api.onChange(function (ev) {
    if (ev === 'recovery') { openPassword(); }
    S.offerTab = 'received';
    renderHeader();
    refreshOffers();
    if (!api.user && /^#(mis-anuncios|propuestas|cuenta|moderacion)$/.test(location.hash)) go('#inicio');
  });

  /* ------------------------------------------------------------------ */
  /* Arranque                                                            */
  /* ------------------------------------------------------------------ */
  async function boot() {
    showBanner();
    if (api.mode === 'broken') { $('#grid').innerHTML = ''; $('#count').textContent = ''; return; }
    try { await api.init(); } catch (e) { console.error(e); }
    showBanner();
    renderHeader();
    try {
      await loadMeta();
    } catch (e) {
      var b = $('#banner');
      b.className = 'banner err';
      b.innerHTML = 'No se pudo conectar con la base de datos. Revisa <b>js/config.js</b> y comprueba que has ejecutado <b>schema.sql</b> en Supabase.<br><small>' + esc((e && e.message) || '') + '</small>';
      b.hidden = false;
    }
    route();
    await loadListings(true);
    refreshOffers();
    if (api.recovery) openPassword();
  }
  boot();
})();
