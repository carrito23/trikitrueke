/* Trikitrueke · capa de datos.
 * La interfaz (app.js) solo habla con TrikiAPI. Hay dos implementaciones:
 *   - Supabase (cuando config.js tiene URL y clave)
 *   - Demostración en memoria (cuando está vacío)
 * Las dos devuelven los mismos datos con la misma forma.
 */
(function () {
  'use strict';

  var cfg = window.TRIKI_CONFIG || {};
  var DOC_VERSION = '2026-10';
  var MAX_PHOTO_PX = 1200;
  var PAGE_SIZE = 24;

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function slugify(s) {
    var slug = String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
    if (slug.length < 2) slug = 'cat-' + Date.now().toString(36);
    return slug;
  }

  function cleanSearch(q) {
    return String(q || '').replace(/[%,()*\\_"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  }

  function niceError(e) {
    var m = (e && (e.message || e.error_description || e.msg)) || String(e || '');
    var rules = [
      [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
      [/email not confirmed/i, 'Todavía no has confirmado tu correo. Revisa tu bandeja de entrada y la carpeta de spam.'],
      [/rate limit|too many requests|over_email_send_rate_limit|email rate limit/i, 'Demasiados intentos seguidos. Espera unos minutos y vuelve a probar.'],
      [/rate_limit_listings/, 'Has llegado al límite de 10 anuncios al día. Prueba mañana.'],
      [/listing_cap/, 'Has llegado al máximo de 40 anuncios. Borra o marca como cambiado alguno.'],
      [/rate_limit_offers/, 'Has llegado al límite de 20 propuestas al día.'],
      [/rate_limit_messages/, 'Has llegado al límite de mensajes de hoy.'],
      [/rate_limit_catalog/, 'Solo se pueden crear 3 categorías o zonas al día.'],
      [/offer_closed/, 'Esta propuesta ya está cerrada y no admite más mensajes.'],
      [/offers_one_pending/, 'Ya tienes una propuesta pendiente en este anuncio.'],
      [/reports_listing_id_reporter_id_key/, 'Ya habías denunciado este anuncio. Lo revisaremos.'],
      [/duplicate key/, 'Eso ya existe.'],
      [/row-level security|permission denied/i, 'No tienes permiso para hacer esto. Si acabas de iniciar sesión, recarga la página.'],
      [/failed to fetch|networkerror|load failed/i, 'No hay conexión con el servidor. Comprueba tu internet.'],
      [/password.*(at least|should be|weak)/i, 'La contraseña es demasiado corta o débil. Usa al menos 8 caracteres.'],
      [/different from the old|same password/i, 'La nueva contraseña debe ser distinta de la anterior.'],
      [/database error saving new user/i, 'No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.'],
      [/signups not allowed|signup is disabled/i, 'Ahora mismo no se admiten registros nuevos.']
    ];
    for (var i = 0; i < rules.length; i++) {
      if (rules[i][0].test(m)) return rules[i][1];
    }
    // Mensajes que ya escribimos nosotros en español
    if (/[áéíóúñ¿]/i.test(m) || /^(Ese|Esa|Solo|No |Escribe|Elige|Indica)/.test(m)) return m;
    return 'Algo ha fallado. Inténtalo de nuevo en unos minutos.';
  }

  // Reduce la foto a 1200 px y la guarda como JPG: sube rápido y quita los
  // metadatos (ubicación GPS, modelo de móvil...) que pueda llevar la foto original.
  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        return reject(new Error('Solo se admiten fotos JPG, PNG o WebP.'));
      }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var k = Math.min(1, MAX_PHOTO_PX / Math.max(w, h));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k));
        c.height = Math.max(1, Math.round(h * k));
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b) resolve(b); else reject(new Error('No se pudo preparar la foto.'));
        }, 'image/jpeg', 0.82);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la foto. Prueba con otra.'));
      };
      img.src = url;
    });
  }

  var SEED_CATS = [
    { id: 'vehiculos', name: 'Vehículos', icon: 'car', hue: 210 },
    { id: 'libros', name: 'Libros', icon: 'book', hue: 28 },
    { id: 'discos', name: 'Discos y música', icon: 'disc', hue: 330 },
    { id: 'ropa', name: 'Ropa', icon: 'shirt', hue: 350 },
    { id: 'casas', name: 'Casas y escapadas', icon: 'home', hue: 165 },
    { id: 'deporte', name: 'Deporte', icon: 'bike', hue: 120 },
    { id: 'tecnologia', name: 'Tecnología', icon: 'laptop', hue: 250 },
    { id: 'hogar', name: 'Hogar', icon: 'sofa', hue: 18 },
    { id: 'herramientas', name: 'Herramientas', icon: 'tool', hue: 45 }
  ];
  var SEED_ZONES = ['Navarra', 'La Rioja', 'Aragón', 'Soria', 'Madrid', 'Cataluña'];

  /* ------------------------------------------------------------------ */
  /* Implementación con Supabase                                         */
  /* ------------------------------------------------------------------ */

  function makeSupabaseApi() {
    var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    var api = { mode: 'supabase', user: null, recovery: false, PAGE_SIZE: PAGE_SIZE, niceError: niceError };
    var subs = [];

    function emit(ev) {
      subs.forEach(function (f) { try { f(ev, api.user); } catch (e) { console.error(e); } });
    }
    api.onChange = function (f) { subs.push(f); };

    function photoUrl(path) {
      if (!path) return '';
      return sb.storage.from('photos').getPublicUrl(path).data.publicUrl;
    }

    function norm(r) {
      return {
        id: r.id,
        title: r.title,
        description: r.description || '',
        category_id: r.category_id,
        want: r.want || '',
        open: !!r.open_to_offers,
        zone: r.zone,
        town: r.town || '',
        photo_path: r.photo_path || null,
        photoUrl: photoUrl(r.photo_path),
        status: r.status,
        moderation_note: r.moderation_note || '',
        created_at: r.created_at,
        user_id: r.user_id,
        alias: (r.profiles && r.profiles.alias) || ''
      };
    }

    var LISTING_COLS = 'id,title,description,category_id,want,open_to_offers,zone,town,photo_path,status,moderation_note,created_at,user_id,profiles(alias)';

    async function loadUser(session) {
      if (!session || !session.user) { api.user = null; return; }
      var u = session.user;
      var p = await sb.from('profiles').select('alias').eq('id', u.id).maybeSingle();
      var a = await sb.rpc('is_admin');
      api.user = {
        id: u.id,
        email: u.email,
        alias: (p.data && p.data.alias) || 'usuario',
        isAdmin: a.data === true
      };
    }

    // Nos suscribimos ya, antes de que supabase-js procese el enlace del correo,
    // para no perder el aviso de "recuperar contraseña".
    sb.auth.onAuthStateChange(function (event, session) {
      if (event === 'PASSWORD_RECOVERY') api.recovery = true;
      // No se hacen consultas dentro de este callback: se aplaza al siguiente ciclo.
      setTimeout(async function () {
        if (event === 'INITIAL_SESSION') return;
        try { await loadUser(session); } catch (e) { console.error(e); }
        emit(event === 'PASSWORD_RECOVERY' ? 'recovery' : 'auth');
      }, 0);
    });

    api.urlError = '';
    api.init = async function () {
      var s = await sb.auth.getSession();
      api.urlError = (sb.auth && sb.auth.urlError) || '';
      await loadUser(s.data && s.data.session);
    };

    /* ---- cuenta ---- */
    api.signUp = async function (o) {
      var ok = await sb.rpc('alias_available', { a: o.alias });
      if (ok.error) throw ok.error;
      if (ok.data !== true) throw new Error('Ese alias no está disponible. Elige otro: de 3 a 30 letras, números, punto, guion o guion bajo, sin espacios.');
      var r = await sb.auth.signUp({
        email: o.email,
        password: o.password,
        options: {
          emailRedirectTo: cfg.SITE_URL || location.origin,
          data: { alias: o.alias, age_confirmed: true, terms_accepted: true, doc_version: DOC_VERSION }
        }
      });
      if (r.error) throw r.error;
      if (r.data.session) await loadUser(r.data.session);
      return { needsConfirmation: !r.data.session };
    };
    api.signIn = async function (o) {
      var r = await sb.auth.signInWithPassword({ email: o.email, password: o.password });
      if (r.error) throw r.error;
      await loadUser(r.data.session);
    };
    api.signOut = async function () {
      await sb.auth.signOut();
      api.user = null;
      emit('auth');
    };
    api.resetPassword = async function (email) {
      var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: cfg.SITE_URL || location.origin });
      if (r.error) throw r.error;
    };
    api.updatePassword = async function (pw) {
      var r = await sb.auth.updateUser({ password: pw });
      if (r.error) throw r.error;
      api.recovery = false;
    };

    /* ---- catálogo ---- */
    api.loadMeta = async function () {
      var res = await Promise.all([
        sb.from('categories').select('id,name,icon,hue').order('name'),
        sb.from('zones').select('name').order('name'),
        sb.from('category_counts').select('category_id,n')
      ]);
      for (var i = 0; i < res.length; i++) if (res[i].error) throw res[i].error;
      var counts = {};
      (res[2].data || []).forEach(function (x) { counts[x.category_id] = x.n; });
      return { categories: res[0].data, zones: res[1].data.map(function (z) { return z.name; }), counts: counts };
    };
    api.addCategory = async function (name) {
      var cat = { id: slugify(name), name: name, icon: 'tag', hue: Math.floor(Math.random() * 360), created_by: api.user.id };
      var r = await sb.from('categories').insert(cat).select('id,name,icon,hue').single();
      if (r.error) {
        if (r.error.code === '23505') {
          var ex = await sb.from('categories').select('id,name,icon,hue').ilike('name', cleanSearch(name)).maybeSingle();
          if (ex.data) return ex.data;
        }
        throw r.error;
      }
      return r.data;
    };
    api.addZone = async function (name) {
      var r = await sb.from('zones').insert({ name: name, created_by: api.user.id }).select('name').single();
      if (r.error) {
        if (r.error.code === '23505') {
          var ex = await sb.from('zones').select('name').ilike('name', cleanSearch(name)).maybeSingle();
          if (ex.data) return ex.data.name;
        }
        throw r.error;
      }
      return r.data.name;
    };

    /* ---- anuncios ---- */
    api.listListings = async function (o) {
      var qb = sb.from('listings').select(LISTING_COLS, { count: 'exact' }).eq('status', 'active');
      if (o.cat) qb = qb.eq('category_id', o.cat);
      if (o.zone) qb = qb.eq('zone', o.zone);
      if (o.kind === 'open') qb = qb.eq('open_to_offers', true);
      if (o.kind === 'concrete') qb = qb.eq('open_to_offers', false);
      var s = cleanSearch(o.q);
      if (s) {
        qb = qb.or('title.ilike.*' + s + '*,description.ilike.*' + s + '*,want.ilike.*' + s + '*,town.ilike.*' + s + '*');
      }
      qb = o.sort === 'az' ? qb.order('title', { ascending: true }) : qb.order('created_at', { ascending: false });
      var r = await qb.range(o.from, o.to);
      if (r.error) throw r.error;
      return { rows: (r.data || []).map(norm), count: r.count || 0 };
    };
    api.getListing = async function (id) {
      var r = await sb.from('listings').select(LISTING_COLS).eq('id', id).maybeSingle();
      if (r.error) throw r.error;
      return r.data ? norm(r.data) : null;
    };
    api.myListings = async function () {
      var r = await sb.from('listings').select(LISTING_COLS).eq('user_id', api.user.id).order('created_at', { ascending: false });
      if (r.error) throw r.error;
      return (r.data || []).map(norm);
    };

    async function uploadPhoto(file) {
      var blob = await compressImage(file);
      var path = api.user.id + '/' + uuid() + '.jpg';
      var up = await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw up.error;
      return path;
    }
    async function removePhotos(paths) {
      paths = (paths || []).filter(Boolean);
      if (paths.length) await sb.storage.from('photos').remove(paths);
    }

    api.createListing = async function (d) {
      var path = d.file ? await uploadPhoto(d.file) : null;
      var r = await sb.from('listings').insert({
        user_id: api.user.id, title: d.title, description: d.description, category_id: d.category_id,
        want: d.want, open_to_offers: d.open, zone: d.zone, town: d.town, photo_path: path
      }).select('id').single();
      if (r.error) { await removePhotos([path]); throw r.error; }
      return r.data.id;
    };
    api.updateListing = async function (id, d) {
      var path = d.oldPath || null;
      var newPath = null;
      if (d.file) { newPath = await uploadPhoto(d.file); path = newPath; }
      else if (d.removePhoto) { path = null; }
      var r = await sb.from('listings').update({
        title: d.title, description: d.description, category_id: d.category_id, want: d.want,
        open_to_offers: d.open, zone: d.zone, town: d.town, photo_path: path
      }).eq('id', id).select('id').maybeSingle();
      if (r.error || !r.data) {
        await removePhotos([newPath]);
        throw r.error || new Error('No tienes permiso para hacer esto.');
      }
      if (d.oldPath && d.oldPath !== path) await removePhotos([d.oldPath]);
    };
    api.setListingStatus = async function (id, status) {
      var r = await sb.from('listings').update({ status: status }).eq('id', id).select('id').maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) throw new Error('No tienes permiso para hacer esto.');
    };
    api.deleteListing = async function (row) {
      var r = await sb.from('listings').delete().eq('id', row.id).select('id').maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) throw new Error('No tienes permiso para hacer esto.');
      await removePhotos([row.photo_path]);
    };

    /* ---- propuestas ---- */
    api.createOffer = async function (o) {
      var r = await sb.from('offers').insert({
        listing_id: o.listing_id, from_user: api.user.id, offer_text: o.offer_text, message: o.message || ''
      });
      if (r.error) throw r.error;
    };
    api.myOffers = async function () {
      var r = await sb.from('offers')
        .select('id,listing_id,from_user,offer_text,message,status,created_at,profiles(alias),listings(title,user_id,profiles(alias))')
        .order('created_at', { ascending: false });
      if (r.error) throw r.error;
      var me = api.user.id;
      return (r.data || []).map(function (o) {
        var sent = o.from_user === me;
        var l = o.listings || {};
        return {
          id: o.id,
          listing_id: o.listing_id,
          listing_title: l.title || '(anuncio no disponible)',
          role: sent ? 'sent' : 'received',
          other_alias: sent ? ((l.profiles && l.profiles.alias) || 'otro usuario') : ((o.profiles && o.profiles.alias) || 'otro usuario'),
          offer_text: o.offer_text,
          message: o.message,
          status: o.status,
          created_at: o.created_at
        };
      });
    };
    api.getThread = async function (offerId) {
      var r = await sb.from('offer_messages').select('id,sender_id,body,created_at,profiles(alias)')
        .eq('offer_id', offerId).order('created_at', { ascending: true });
      if (r.error) throw r.error;
      return (r.data || []).map(function (m) {
        return { id: m.id, mine: m.sender_id === api.user.id, alias: (m.profiles && m.profiles.alias) || '', body: m.body, created_at: m.created_at };
      });
    };
    api.addMessage = async function (offerId, body) {
      var r = await sb.from('offer_messages').insert({ offer_id: offerId, sender_id: api.user.id, body: body });
      if (r.error) throw r.error;
    };
    api.setOfferStatus = async function (id, status) {
      var r = await sb.from('offers').update({ status: status }).eq('id', id).select('id').maybeSingle();
      if (r.error) throw r.error;
      if (!r.data) throw new Error('No tienes permiso para hacer esto.');
    };

    /* ---- denuncias y moderación ---- */
    api.createReport = async function (o) {
      var r = await sb.from('reports').insert({
        listing_id: o.listing_id, reporter_id: api.user.id, reason: o.reason, details: o.details || ''
      });
      if (r.error) throw r.error;
    };
    api.listReports = async function () {
      var r = await sb.from('reports')
        .select('id,reason,details,status,created_at,listing_id,profiles(alias),listings(id,title,status,photo_path,moderation_note,profiles(alias))')
        .eq('status', 'open').order('created_at', { ascending: true });
      if (r.error) throw r.error;
      return (r.data || []).map(function (x) {
        var l = x.listings || {};
        return {
          id: x.id, reason: x.reason, details: x.details, created_at: x.created_at,
          reporter: (x.profiles && x.profiles.alias) || '',
          listing: { id: x.listing_id, title: l.title || '(borrado)', status: l.status || '', photo_path: l.photo_path || null,
                     owner: (l.profiles && l.profiles.alias) || '' }
        };
      });
    };
    api.moderate = async function (o) {
      // o: {reportId, listingId, photoPath, action: 'hide'|'delete'|'dismiss', note}
      if (o.action === 'dismiss') {
        var d = await sb.from('reports').update({ status: 'dismissed' }).eq('id', o.reportId);
        if (d.error) throw d.error;
        return;
      }
      if (o.action === 'hide') {
        var h = await sb.from('listings').update({ status: 'hidden', moderation_note: o.note || 'Incumple las normas de uso.' }).eq('id', o.listingId);
        if (h.error) throw h.error;
        var rr = await sb.from('reports').update({ status: 'resolved' }).eq('listing_id', o.listingId).eq('status', 'open');
        if (rr.error) throw rr.error;
        return;
      }
      if (o.action === 'delete') {
        var x = await sb.from('listings').delete().eq('id', o.listingId);
        if (x.error) throw x.error;
        await removePhotos([o.photoPath]);
      }
    };

    /* ---- derechos sobre los datos ---- */
    api.exportMyData = async function () {
      var me = api.user;
      var res = await Promise.all([
        sb.from('listings').select('*').eq('user_id', me.id),
        sb.from('offers').select('*'),
        sb.from('consents').select('*').eq('user_id', me.id),
        sb.from('reports').select('*').eq('reporter_id', me.id)
      ]);
      var offers = res[1].data || [];
      var msgs = [];
      for (var i = 0; i < offers.length; i++) {
        var t = await sb.from('offer_messages').select('*').eq('offer_id', offers[i].id).order('created_at');
        msgs = msgs.concat(t.data || []);
      }
      return {
        generado: new Date().toISOString(),
        cuenta: { id: me.id, correo: me.email, alias: me.alias },
        consentimientos: res[2].data || [],
        anuncios: res[0].data || [],
        propuestas: offers,
        mensajes: msgs,
        denuncias_enviadas: res[3].data || []
      };
    };
    api.deleteAccount = async function () {
      var folder = api.user.id;
      var l = await sb.storage.from('photos').list(folder, { limit: 1000 });
      if (!l.error && l.data && l.data.length) {
        await removePhotos(l.data.map(function (f) { return folder + '/' + f.name; }));
      }
      var r = await sb.rpc('delete_my_account');
      if (r.error) throw r.error;
      await sb.auth.signOut();
      api.user = null;
      emit('auth');
    };

    return api;
  }

  /* ------------------------------------------------------------------ */
  /* Implementación de demostración (todo en memoria)                    */
  /* ------------------------------------------------------------------ */

  function makeDemoApi() {
    var api = { mode: 'demo', user: null, recovery: false, urlError: '', PAGE_SIZE: PAGE_SIZE, niceError: niceError };
    var subs = [];
    function emit(ev) { subs.forEach(function (f) { try { f(ev, api.user); } catch (e) { console.error(e); } }); }
    api.onChange = function (f) { subs.push(f); };

    var cats = SEED_CATS.map(function (c) { return Object.assign({}, c); });
    var zones = SEED_ZONES.slice();
    var users = {};      // email -> {id,email,alias,password}
    var listings = [];
    var offers = [];
    var messages = [];
    var reports = [];
    var hoursAgo = function (h) { return new Date(Date.now() - h * 3600e3).toISOString(); };

    function mkUser(alias) { var id = uuid(); users[alias + '@demo.es'] = { id: id, email: alias + '@demo.es', alias: alias, password: 'demodemo' }; return id; }
    var ids = { ana: mkUser('ana_ribera'), pablo: mkUser('pablo.rj'), marta: mkUser('marta_zgz'), luis: mkUser('luis88') };
    function L(u, h, title, cat, want, open, zone, town, desc) {
      listings.push({ id: uuid(), user_id: ids[u], title: title, description: desc || '', category_id: cat, want: want, open: open,
        zone: zone, town: town, photo_path: null, photoUrl: '', status: 'active', moderation_note: '', created_at: hoursAgo(h) });
    }
    L('ana', 3, 'Furgoneta Citroën Berlingo de 2012', 'vehiculos', 'Moto de 125 cc o remolque grande', false, 'Navarra', 'Tudela', 'Diésel, 168.000 km, ITV pasada hasta primavera. Muy cuidada, sin golpes. Ideal para trabajo o camperizar.');
    L('ana', 5, 'Colección completa de novela negra nórdica (14 libros)', 'libros', 'Novela histórica o ensayo de montaña', false, 'Navarra', 'Corella', 'Tapa blanda, leídos una vez. Autores suecos y noruegos. Los cambio todos juntos.');
    L('pablo', 9, '12 vinilos de rock de los años 80', 'discos', 'Tocadiscos con previo integrado', false, 'La Rioja', 'Logroño', 'Buen estado, con funda original. Quedamos en Pamplona o Logroño.');
    L('luis', 12, 'Semana de agosto en apartamento en Salou', 'casas', 'Semana en las Rías Baixas, Galicia', false, 'Cataluña', 'Salou', 'Apartamento para 4 personas a 5 minutos de la playa, con piscina. Semana a convenir en agosto o septiembre.');
    L('ana', 20, 'Hormigonera de 160 litros', 'herramientas', '', true, 'Navarra', 'Cintruénigo', 'Motor eléctrico, funciona perfectamente. La he usado en una sola obra.');
    L('marta', 26, 'Bicicleta de montaña de 29 pulgadas, talla M', 'deporte', 'Bici de carretera talla 54 o 56', true, 'Aragón', 'Zaragoza', 'Cuadro de aluminio, frenos de disco hidráulicos. Revisada hace un mes.');
    L('pablo', 31, 'Chaqueta de cuero marrón, talla M', 'ropa', 'Cazadora vaquera o abrigo de lana', false, 'Navarra', 'Pamplona', 'Poco uso, forro interior en perfecto estado.');
    L('luis', 40, 'Portátil con i5 y 16 GB de RAM (2019)', 'tecnologia', 'Tablet de 10 pulgadas', true, 'Madrid', 'Alcalá de Henares', 'Disco SSD de 512 GB, batería con unas 4 horas de autonomía. Formateado y con cargador.');
    L('marta', 52, 'Mesa de comedor de roble con 6 sillas', 'hogar', 'Estanterías de obra o un sofá de dos plazas', false, 'Soria', 'Almazán', 'Extensible hasta 2 metros. Algún roce de uso. La recoges tú.');
    L('pablo', 70, 'Manuales de FP de Electricidad (8 tomos)', 'libros', '', true, 'Navarra', 'Tafalla', 'Editorial reciente, subrayados a lápiz.');
    L('marta', 96, 'Cuatro neumáticos de invierno 195/65 R15', 'vehiculos', 'Cadenas y baca para techo', false, 'Aragón', 'Jaca', 'Con un 70 % de dibujo. Sin pinchazos ni reparaciones.');
    L('ana', 130, 'Casa rural en la Ribera de Navarra, fines de semana', 'casas', 'Apartamento en la costa mediterránea', true, 'Navarra', 'Corella', 'Casa para 6 personas con chimenea y barbacoa.');

    function delay(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 120); }); }
    function fail(msg) { return Promise.reject(new Error(msg)); }
    function aliasOf(uid) { for (var k in users) if (users[k].id === uid) return users[k].alias; return 'usuario'; }
    function view(l) { return Object.assign({}, l, { alias: aliasOf(l.user_id) }); }
    function find(id) { return listings.filter(function (l) { return l.id === id; })[0]; }
    function norm_(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

    api.init = function () { return delay(); };
    api.signUp = function (o) {
      if (!/^[A-Za-z0-9_.-]{3,30}$/.test(o.alias)) return fail('Ese alias no está disponible. Elige otro: de 3 a 30 letras, números, punto, guion o guion bajo, sin espacios.');
      for (var k in users) if (users[k].alias.toLowerCase() === o.alias.toLowerCase()) return fail('Ese alias no está disponible. Elige otro: de 3 a 30 letras, números, punto, guion o guion bajo, sin espacios.');
      users[o.email] = { id: uuid(), email: o.email, alias: o.alias, password: o.password };
      api.user = { id: users[o.email].id, email: o.email, alias: o.alias, isAdmin: /admin/i.test(o.email) };
      emit('auth');
      return delay({ needsConfirmation: false });
    };
    api.signIn = function (o) {
      var u = users[o.email];
      if (!u) {  // en la demo cualquier correo vale
        u = users[o.email] = { id: uuid(), email: o.email, alias: o.email.split('@')[0].replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 20) || 'usuario', password: o.password };
      }
      if (u.password !== o.password) return fail('Invalid login credentials');
      api.user = { id: u.id, email: u.email, alias: u.alias, isAdmin: /admin/i.test(u.email) };
      emit('auth');
      return delay();
    };
    api.signOut = function () { api.user = null; emit('auth'); return delay(); };
    api.resetPassword = function () { return delay(); };
    api.updatePassword = function () { api.recovery = false; return delay(); };

    api.loadMeta = function () {
      var counts = {};
      listings.forEach(function (l) { if (l.status === 'active') counts[l.category_id] = (counts[l.category_id] || 0) + 1; });
      return delay({ categories: cats.slice().sort(function (a, b) { return a.name.localeCompare(b.name, 'es'); }), zones: zones.slice().sort(function (a, b) { return a.localeCompare(b, 'es'); }), counts: counts });
    };
    api.addCategory = function (name) {
      var ex = cats.filter(function (c) { return norm_(c.name) === norm_(name); })[0];
      if (ex) return delay(ex);
      var c = { id: slugify(name), name: name, icon: 'tag', hue: Math.floor(Math.random() * 360) };
      cats.push(c); return delay(c);
    };
    api.addZone = function (name) {
      var ex = zones.filter(function (z) { return norm_(z) === norm_(name); })[0];
      if (ex) return delay(ex);
      zones.push(name); return delay(name);
    };

    api.listListings = function (o) {
      var q = norm_(cleanSearch(o.q));
      var rows = listings.filter(function (l) {
        if (l.status !== 'active') return false;
        if (o.cat && l.category_id !== o.cat) return false;
        if (o.zone && l.zone !== o.zone) return false;
        if (o.kind === 'open' && !l.open) return false;
        if (o.kind === 'concrete' && l.open) return false;
        if (q && norm_(l.title + ' ' + l.description + ' ' + l.want + ' ' + l.town).indexOf(q) < 0) return false;
        return true;
      });
      rows.sort(function (a, b) { return o.sort === 'az' ? a.title.localeCompare(b.title, 'es') : (a.created_at < b.created_at ? 1 : -1); });
      return delay({ rows: rows.slice(o.from, o.to + 1).map(view), count: rows.length });
    };
    api.getListing = function (id) {
      var l = find(id);
      if (!l) return delay(null);
      if (l.status !== 'active' && !(api.user && (api.user.id === l.user_id || api.user.isAdmin))) return delay(null);
      return delay(view(l));
    };
    api.myListings = function () {
      return delay(listings.filter(function (l) { return l.user_id === api.user.id; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }).map(view));
    };
    function photoFrom(file) { return file ? URL.createObjectURL(file) : ''; }
    api.createListing = function (d) {
      var mine = listings.filter(function (l) { return l.user_id === api.user.id && Date.now() - Date.parse(l.created_at) < 864e5; }).length;
      if (mine >= 10) return fail('rate_limit_listings');
      var l = { id: uuid(), user_id: api.user.id, title: d.title, description: d.description, category_id: d.category_id, want: d.want, open: d.open,
        zone: d.zone, town: d.town, photo_path: d.file ? 'demo' : null, photoUrl: photoFrom(d.file), status: 'active', moderation_note: '', created_at: new Date().toISOString() };
      listings.push(l); return delay(l.id);
    };
    api.updateListing = function (id, d) {
      var l = find(id);
      if (!l || (l.user_id !== api.user.id && !api.user.isAdmin)) return fail('No tienes permiso para hacer esto.');
      Object.assign(l, { title: d.title, description: d.description, category_id: d.category_id, want: d.want, open: d.open, zone: d.zone, town: d.town });
      if (d.file) { l.photoUrl = photoFrom(d.file); l.photo_path = 'demo'; }
      else if (d.removePhoto) { l.photoUrl = ''; l.photo_path = null; }
      return delay();
    };
    api.setListingStatus = function (id, status) {
      var l = find(id);
      if (!l || (l.user_id !== api.user.id && !api.user.isAdmin)) return fail('No tienes permiso para hacer esto.');
      if (l.status === 'hidden' && !api.user.isAdmin) return delay();
      if (status === 'hidden' && !api.user.isAdmin) return delay();
      l.status = status; return delay();
    };
    api.deleteListing = function (row) {
      var l = find(row.id);
      if (!l || (l.user_id !== api.user.id && !api.user.isAdmin)) return fail('No tienes permiso para hacer esto.');
      listings = listings.filter(function (x) { return x.id !== row.id; });
      offers = offers.filter(function (o) { return o.listing_id !== row.id; });
      return delay();
    };

    api.createOffer = function (o) {
      var l = find(o.listing_id);
      if (!l || l.status !== 'active' || l.user_id === api.user.id) return fail('No tienes permiso para hacer esto.');
      if (offers.some(function (x) { return x.listing_id === o.listing_id && x.from_user === api.user.id && x.status === 'pending'; })) return fail('offers_one_pending');
      offers.push({ id: uuid(), listing_id: o.listing_id, from_user: api.user.id, offer_text: o.offer_text, message: o.message || '', status: 'pending', created_at: new Date().toISOString() });
      return delay();
    };
    api.myOffers = function () {
      var me = api.user.id;
      var out = [];
      offers.forEach(function (o) {
        var l = find(o.listing_id);
        if (!l) return;
        var sent = o.from_user === me, recv = l.user_id === me;
        if (!sent && !recv) return;
        out.push({ id: o.id, listing_id: o.listing_id, listing_title: l.title, role: sent ? 'sent' : 'received',
          other_alias: sent ? aliasOf(l.user_id) : aliasOf(o.from_user), offer_text: o.offer_text, message: o.message, status: o.status, created_at: o.created_at });
      });
      out.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
      return delay(out);
    };
    api.getThread = function (offerId) {
      return delay(messages.filter(function (m) { return m.offer_id === offerId; }).map(function (m) {
        return { id: m.id, mine: m.sender_id === api.user.id, alias: aliasOf(m.sender_id), body: m.body, created_at: m.created_at };
      }));
    };
    api.addMessage = function (offerId, body) {
      var o = offers.filter(function (x) { return x.id === offerId; })[0];
      if (!o) return fail('No tienes permiso para hacer esto.');
      if (o.status === 'declined' || o.status === 'withdrawn') return fail('offer_closed');
      messages.push({ id: uuid(), offer_id: offerId, sender_id: api.user.id, body: body, created_at: new Date().toISOString() });
      return delay();
    };
    api.setOfferStatus = function (id, status) {
      var o = offers.filter(function (x) { return x.id === id; })[0];
      if (!o) return fail('No tienes permiso para hacer esto.');
      o.status = status; return delay();
    };

    api.createReport = function (o) {
      if (reports.some(function (r) { return r.listing_id === o.listing_id && r.reporter_id === api.user.id; })) return fail('reports_listing_id_reporter_id_key');
      reports.push({ id: uuid(), listing_id: o.listing_id, reporter_id: api.user.id, reason: o.reason, details: o.details || '', status: 'open', created_at: new Date().toISOString() });
      return delay();
    };
    api.listReports = function () {
      return delay(reports.filter(function (r) { return r.status === 'open'; }).map(function (r) {
        var l = find(r.listing_id) || {};
        return { id: r.id, reason: r.reason, details: r.details, created_at: r.created_at, reporter: aliasOf(r.reporter_id),
          listing: { id: r.listing_id, title: l.title || '(borrado)', status: l.status || '', photo_path: l.photo_path || null, owner: aliasOf(l.user_id) } };
      }));
    };
    api.moderate = function (o) {
      if (o.action === 'dismiss') { reports.forEach(function (r) { if (r.id === o.reportId) r.status = 'dismissed'; }); return delay(); }
      var l = find(o.listingId);
      if (o.action === 'hide' && l) {
        l.status = 'hidden'; l.moderation_note = o.note || 'Incumple las normas de uso.';
        reports.forEach(function (r) { if (r.listing_id === o.listingId && r.status === 'open') r.status = 'resolved'; });
      }
      if (o.action === 'delete') { listings = listings.filter(function (x) { return x.id !== o.listingId; }); reports = reports.filter(function (r) { return r.listing_id !== o.listingId; }); }
      return delay();
    };

    api.exportMyData = function () {
      var me = api.user;
      return delay({ generado: new Date().toISOString(), cuenta: { id: me.id, correo: me.email, alias: me.alias },
        anuncios: listings.filter(function (l) { return l.user_id === me.id; }), propuestas: offers.filter(function (o) { return o.from_user === me.id; }) });
    };
    api.deleteAccount = function () {
      var me = api.user.id;
      listings = listings.filter(function (l) { return l.user_id !== me; });
      offers = offers.filter(function (o) { return o.from_user !== me; });
      for (var k in users) if (users[k].id === me) delete users[k];
      api.user = null; emit('auth'); return delay();
    };

    return api;
  }

  /* ------------------------------------------------------------------ */

  var api;
  var configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);
  if (configured && !(window.supabase && window.supabase.createClient)) {
    api = makeDemoApi();
    api.mode = 'broken';
  } else if (configured) {
    api = makeSupabaseApi();
  } else {
    api = makeDemoApi();
  }
  window.TrikiAPI = api;
})();
