/* supabase-lite · cliente mínimo para Supabase (sin dependencias).
 *
 * Implementa solo lo que usa Trikitrueke, con la misma forma que la librería
 * oficial supabase-js (window.supabase.createClient): consultas a la base de
 * datos (PostgREST), cuentas (GoTrue) y fotos (Storage).
 *
 * Si algún día prefieres la librería oficial, descarga su versión "umd" y
 * cámbiala por este archivo en index.html: api.js funciona con las dos.
 *
 * No guarda nada fuera del navegador de cada persona, y no llama a ningún
 * servidor que no sea el de tu proyecto de Supabase.
 */
(function () {
  'use strict';

  function createClient(url, anonKey) {
    url = String(url).replace(/\/+$/, '');
    var STORE = 'sb-trikitrueke-auth';
    var session = null;
    var listeners = [];
    var refreshing = null;
    var timer = null;
    var auth = { urlError: '' };

    /* ---------------- almacenamiento de la sesión ---------------- */
    function saveSession() {
      try {
        if (session) localStorage.setItem(STORE, JSON.stringify(session));
        else localStorage.removeItem(STORE);
      } catch (e) { /* navegación privada: la sesión dura lo que dure la pestaña */ }
    }
    function loadSession() {
      try {
        var raw = localStorage.getItem(STORE);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    }
    function now() { return Math.floor(Date.now() / 1000); }

    function emit(event) {
      listeners.forEach(function (f) {
        setTimeout(function () { try { f(event, session); } catch (e) { console.error(e); } }, 0);
      });
    }

    function setSession(s, event) {
      session = s;
      saveSession();
      schedule();
      if (event) emit(event);
    }

    function schedule() {
      clearTimeout(timer);
      if (!session || !session.expires_at) return;
      var ms = Math.max(5, session.expires_at - now() - 60) * 1000;
      timer = setTimeout(function () { refresh().catch(function () {}); }, Math.min(ms, 2147000000));
    }

    function toSession(body) {
      if (!body || !body.access_token) return null;
      return {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        expires_at: body.expires_at || (now() + (body.expires_in || 3600)),
        user: body.user || null
      };
    }

    function authError(body, status) {
      var msg = (body && (body.msg || body.message || body.error_description || body.error)) || 'Error de autenticación';
      var code = (body && (body.error_code || body.code)) || '';
      if (/weak_password/.test(String(code)) && !/password/i.test(msg)) msg = 'Weak password: should be at least 8 characters';
      return { message: String(msg), code: String(code), status: status };
    }

    function refresh() {
      if (!session || !session.refresh_token) return Promise.reject(new Error('sin sesión'));
      if (refreshing) return refreshing;
      var rt = session.refresh_token;
      refreshing = fetch(url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { apikey: anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt })
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (b) { return { ok: r.ok, status: r.status, body: b }; });
      }).then(function (r) {
        refreshing = null;
        var s = r.ok ? toSession(r.body) : null;
        if (s) { setSession(s, 'TOKEN_REFRESHED'); return s; }
        if (r.status === 400 || r.status === 401) { setSession(null, 'SIGNED_OUT'); }
        throw new Error('No se pudo renovar la sesión');
      }, function (e) { refreshing = null; throw e; });
      return refreshing;
    }

    function token() {
      if (!session) return Promise.resolve(anonKey);
      if (session.expires_at - now() > 30) return Promise.resolve(session.access_token);
      return refresh().then(function (s) { return s.access_token; }, function () { return anonKey; });
    }

    function authFetch(path, opts) {
      opts = opts || {};
      var headers = Object.assign({ apikey: anonKey, 'Content-Type': 'application/json' }, opts.headers || {});
      return fetch(url + path, { method: opts.method || 'POST', headers: headers, body: opts.body })
        .then(function (r) {
          return r.text().then(function (t) {
            var b = null;
            try { b = t ? JSON.parse(t) : null; } catch (e) { b = null; }
            return { ok: r.ok, status: r.status, body: b };
          });
        });
    }

    /* ---------------- enlaces de los correos (#access_token=...) ---------------- */
    function readUrlHash() {
      var h = location.hash || '';
      if (h.indexOf('access_token=') < 0 && h.indexOf('error_description=') < 0) return null;
      var p = new URLSearchParams(h.replace(/^#/, ''));
      try { history.replaceState(null, '', location.pathname + location.search + '#inicio'); } catch (e) { /* nada */ }
      if (p.get('error_description')) {
        auth.urlError = String(p.get('error_description')).replace(/\+/g, ' ');
        return null;
      }
      return {
        type: p.get('type') || '',
        session: {
          access_token: p.get('access_token'),
          refresh_token: p.get('refresh_token'),
          expires_at: p.get('expires_at') ? parseInt(p.get('expires_at'), 10) : now() + parseInt(p.get('expires_in') || '3600', 10),
          user: null
        }
      };
    }

    function fetchUser(accessToken) {
      return fetch(url + '/auth/v1/user', { headers: { apikey: anonKey, Authorization: 'Bearer ' + accessToken } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }

    var ready = Promise.resolve().then(function () {
      var fromUrl = readUrlHash();
      if (fromUrl && fromUrl.session.access_token) {
        return fetchUser(fromUrl.session.access_token).then(function (u) {
          if (u) {
            fromUrl.session.user = u;
            setSession(fromUrl.session, fromUrl.type === 'recovery' ? 'PASSWORD_RECOVERY' : 'SIGNED_IN');
          }
        });
      }
      var stored = loadSession();
      if (stored && stored.access_token) {
        session = stored;
        if (session.expires_at - now() < 30) {
          return refresh().catch(function () { session = null; });
        }
        schedule();
      }
    });

    /* ---------------- auth ---------------- */
    auth.getSession = function () {
      return ready.then(function () { return { data: { session: session }, error: null }; });
    };
    auth.onAuthStateChange = function (cb) {
      listeners.push(cb);
      return { data: { subscription: { unsubscribe: function () { listeners = listeners.filter(function (f) { return f !== cb; }); } } } };
    };
    auth.signUp = function (o) {
      var redirect = o.options && o.options.emailRedirectTo ? '?redirect_to=' + encodeURIComponent(o.options.emailRedirectTo) : '';
      return authFetch('/auth/v1/signup' + redirect, {
        body: JSON.stringify({ email: o.email, password: o.password, data: (o.options && o.options.data) || {} })
      }).then(function (r) {
        if (!r.ok) return { data: { user: null, session: null }, error: authError(r.body, r.status) };
        var s = toSession(r.body);
        if (s) {
          if (!s.user) s.user = r.body.user || null;
          setSession(s, 'SIGNED_IN');
          return { data: { user: s.user, session: s }, error: null };
        }
        return { data: { user: r.body, session: null }, error: null };
      }, function (e) { return { data: { user: null, session: null }, error: { message: e.message } }; });
    };
    auth.signInWithPassword = function (o) {
      return authFetch('/auth/v1/token?grant_type=password', { body: JSON.stringify({ email: o.email, password: o.password }) })
        .then(function (r) {
          var s = r.ok ? toSession(r.body) : null;
          if (!s) return { data: { session: null, user: null }, error: authError(r.body, r.status) };
          setSession(s, 'SIGNED_IN');
          return { data: { session: s, user: s.user }, error: null };
        }, function (e) { return { data: { session: null, user: null }, error: { message: e.message } }; });
    };
    auth.signOut = function () {
      var t = session && session.access_token;
      var done = function () { setSession(null, 'SIGNED_OUT'); return { error: null }; };
      if (!t) return Promise.resolve(done());
      return authFetch('/auth/v1/logout', { headers: { Authorization: 'Bearer ' + t } }).then(done, done);
    };
    auth.resetPasswordForEmail = function (email, opts) {
      var redirect = opts && opts.redirectTo ? '?redirect_to=' + encodeURIComponent(opts.redirectTo) : '';
      return authFetch('/auth/v1/recover' + redirect, { body: JSON.stringify({ email: email }) })
        .then(function (r) { return { data: {}, error: r.ok ? null : authError(r.body, r.status) }; },
              function (e) { return { data: {}, error: { message: e.message } }; });
    };
    auth.updateUser = function (attrs) {
      return token().then(function (t) {
        return authFetch('/auth/v1/user', { method: 'PUT', headers: { Authorization: 'Bearer ' + t }, body: JSON.stringify(attrs) });
      }).then(function (r) { return { data: { user: r.body }, error: r.ok ? null : authError(r.body, r.status) }; },
              function (e) { return { data: {}, error: { message: e.message } }; });
    };

    /* ---------------- base de datos (PostgREST) ---------------- */
    function Query(table) {
      this.table = table;
      this.method = 'GET';
      this.params = [];
      this.orders = [];
      this.prefer = [];
      this.body = undefined;
      this.mode = 'many';       // many | single | maybe
      this.limit_ = null;
      this.offset_ = null;
      this.isRpc = false;
    }
    Query.prototype.select = function (cols, opts) {
      this.params.push(['select', String(cols || '*').replace(/\s+/g, '')]);
      if (opts && opts.count) this.prefer.push('count=' + opts.count);
      if (this.method !== 'GET') this.prefer.push('return=representation');
      return this;
    };
    Query.prototype.insert = function (row) { this.method = 'POST'; this.body = JSON.stringify(row); return this; };
    Query.prototype.update = function (row) { this.method = 'PATCH'; this.body = JSON.stringify(row); return this; };
    Query.prototype.delete = function () { this.method = 'DELETE'; return this; };
    Query.prototype.eq = function (c, v) { this.params.push([c, 'eq.' + v]); return this; };
    Query.prototype.in = function (c, vals) { this.params.push([c, 'in.(' + vals.map(function (v) { return String(v).replace(/[(),"]/g, ''); }).join(',') + ')']); return this; };
    Query.prototype.not = function (c, op, v) { this.params.push([c, 'not.' + op + '.' + (v === null ? 'null' : v)]); return this; };
    Query.prototype.ilike = function (c, v) { this.params.push([c, 'ilike.' + v]); return this; };
    Query.prototype.or = function (expr) { this.params.push(['or', '(' + expr + ')']); return this; };
    Query.prototype.order = function (c, o) { this.orders.push(c + '.' + (o && o.ascending === false ? 'desc' : 'asc')); return this; };
    Query.prototype.range = function (from, to) { this.offset_ = from; this.limit_ = to - from + 1; return this; };
    Query.prototype.single = function () { this.mode = 'single'; return this; };
    Query.prototype.maybeSingle = function () { this.mode = 'maybe'; return this; };
    Query.prototype.then = function (ok, bad) { return this.run().then(ok, bad); };
    Query.prototype.run = function () {
      var self = this;
      return token().then(function (t) {
        var qs = new URLSearchParams();
        self.params.forEach(function (p) { qs.append(p[0], p[1]); });
        if (self.orders.length) qs.append('order', self.orders.join(','));
        if (self.limit_ !== null) { qs.append('limit', String(self.limit_)); qs.append('offset', String(self.offset_ || 0)); }
        var headers = { apikey: anonKey, Authorization: 'Bearer ' + t };
        if (self.body !== undefined) headers['Content-Type'] = 'application/json';
        if (self.mode === 'single') headers.Accept = 'application/vnd.pgrst.object+json';
        if (self.prefer.length) headers.Prefer = self.prefer.join(',');
        var path = self.isRpc ? '/rest/v1/rpc/' + self.table : '/rest/v1/' + self.table;
        var q = qs.toString();
        return fetch(url + path + (q ? '?' + q : ''), { method: self.method, headers: headers, body: self.body });
      }).then(function (r) {
        return r.text().then(function (txt) {
          var data = null;
          try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
          var count = null;
          var cr = r.headers.get('content-range');
          if (cr && cr.indexOf('/') >= 0) {
            var n = cr.split('/')[1];
            if (n !== '*') count = parseInt(n, 10);
          }
          if (!r.ok) {
            var err = data && typeof data === 'object' ? data : { message: txt || 'Error' };
            err.status = r.status;
            return { data: null, error: err, count: null, status: r.status };
          }
          if (self.mode === 'maybe' && Array.isArray(data)) data = data.length ? data[0] : null;
          return { data: data, error: null, count: count, status: r.status };
        });
      }, function (e) {
        return { data: null, error: { message: e.message || 'Failed to fetch' }, count: null, status: 0 };
      });
    };

    function from(table) { return new Query(table); }
    function rpc(fn, args) {
      var q = new Query(fn);
      q.isRpc = true;
      q.method = 'POST';
      q.body = JSON.stringify(args || {});
      return q;
    }

    /* ---------------- fotos (Storage) ---------------- */
    function storageFrom(bucket) {
      function call(path, opts) {
        return token().then(function (t) {
          var headers = Object.assign({ apikey: anonKey, Authorization: 'Bearer ' + t }, opts.headers || {});
          return fetch(url + '/storage/v1' + path, { method: opts.method, headers: headers, body: opts.body });
        }).then(function (r) {
          return r.text().then(function (txt) {
            var b = null;
            try { b = txt ? JSON.parse(txt) : null; } catch (e) { b = null; }
            return { ok: r.ok, status: r.status, body: b };
          });
        });
      }
      function err(r) {
        var b = r.body || {};
        return { message: String(b.message || b.error || 'Error al usar el almacenamiento'), statusCode: String(r.status) };
      }
      return {
        upload: function (path, blob, opts) {
          var ct = (opts && opts.contentType) || (blob && blob.type) || 'application/octet-stream';
          return call('/object/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/'), {
            method: 'POST', body: blob,
            headers: { 'Content-Type': ct, 'x-upsert': opts && opts.upsert ? 'true' : 'false', 'cache-control': 'max-age=3600' }
          }).then(function (r) { return r.ok ? { data: { path: path }, error: null } : { data: null, error: err(r) }; },
                  function (e) { return { data: null, error: { message: e.message } }; });
        },
        remove: function (paths) {
          return call('/object/' + bucket, { method: 'DELETE', body: JSON.stringify({ prefixes: paths }), headers: { 'Content-Type': 'application/json' } })
            .then(function (r) { return r.ok ? { data: r.body, error: null } : { data: null, error: err(r) }; },
                  function (e) { return { data: null, error: { message: e.message } }; });
        },
        list: function (prefix, opts) {
          return call('/object/list/' + bucket, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: prefix || '', limit: (opts && opts.limit) || 100, offset: 0, sortBy: { column: 'name', order: 'asc' } })
          }).then(function (r) { return r.ok ? { data: r.body || [], error: null } : { data: null, error: err(r) }; },
                  function (e) { return { data: null, error: { message: e.message } }; });
        },
        createSignedUrls: function (paths, expiresIn) {
          return call('/object/sign/' + bucket, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expiresIn: expiresIn || 3600, paths: paths })
          }).then(function (r) {
            if (!r.ok) return { data: null, error: err(r) };
            var out = (Array.isArray(r.body) ? r.body : []).map(function (x) {
              var u = x.signedURL || x.signedUrl || '';
              if (u && !/^https?:/i.test(u)) u = url + '/storage/v1' + (u.charAt(0) === '/' ? '' : '/') + u;
              return { path: x.path, signedUrl: u, error: x.error || null };
            });
            return { data: out, error: null };
          }, function (e) { return { data: null, error: { message: e.message } }; });
        },
        getPublicUrl: function (path) {
          return { data: { publicUrl: url + '/storage/v1/object/public/' + bucket + '/' + path.split('/').map(encodeURIComponent).join('/') } };
        }
      };
    }

    return { auth: auth, from: from, rpc: rpc, storage: { from: storageFrom } };
  }

  window.supabase = { createClient: createClient };
})();
