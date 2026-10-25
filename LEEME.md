# Trikitrueke — puesta en marcha

Web estática (GitHub Pages) + Supabase (base de datos, usuarios, fotos). Coste: 0 €.
Sin tocar nada, la web funciona en **modo demostración** (datos solo en el navegador).

## 1. Crear el backend (Supabase)
1. Crea cuenta en supabase.com → *New project*. **Región: una de la UE** (p. ej. Frankfurt). Anota la región: irá en la política de privacidad.
2. *SQL Editor* → pega todo `schema.sql` → *Run*. (Se puede repetir sin romper nada.)
3. *Authentication → URL Configuration*: Site URL `https://trikitrueke.es`; en Redirect URLs añade `https://trikitrueke.es/**` y `https://www.trikitrueke.es/**`.
4. *Authentication → Providers → Email*: confirmación de correo **activada**, contraseña mínima **8**.
5. *Authentication → SMTP*: el envío por defecto de Supabase está muy limitado. Configura un SMTP propio (p. ej. un buzón de Strato) y comprueba que llegan los correos de confirmación. Sin esto, los registros pueden fallar.
6. *Project Settings → API*: copia **Project URL** y la clave pública (**anon** o **publishable**; NUNCA la service_role).

## 2. Configurar la web
Edita `config.js` y pega URL y clave. Sube todo el contenido de esta carpeta al repositorio de GitHub (sustituyendo lo anterior). Al guardar, el banner de demostración desaparece.

## 3. Hacerte moderador
Regístrate en la web y, en el SQL Editor de Supabase:
```sql
insert into public.admins (user_id) select id from auth.users where email = 'TU-CORREO@ejemplo.com';
```
Verás «Moderación» en tu menú.

## 4. Textos legales (obligatorio antes de abrir)
En `aviso-legal.html`, `privacidad.html`, `cookies.html` y `normas.html` busca los campos resaltados en amarillo (nombre, DNI/NIE, domicilio, correo, teléfono, juzgados, región de Supabase, proveedor de correo) y rellénalos con datos reales. Después borra el recuadro «Borrador para completar». Son plantillas: conviene que las revise un profesional.

## 5. Lanzamiento
- Quita `<meta name="robots" content="noindex">` de los HTML cuando quieras aparecer en Google.
- Comprueba en el navegador (F12 → Application) que no se guardan cookies, solo el elemento de sesión `sb-trikitrueke-auth`.
- `www.trikitrueke.es`: en Strato, CNAME de `www` → `carrito23.github.io`, y en GitHub Pages vuelve a guardar el dominio y marca *Enforce HTTPS*.
- Fuentes propias (opcional): sube `figtree-latin-wght-normal.woff2` y `bricolage-grotesque-latin-wght-normal.woff2` junto al resto. Si no, usa fuentes del sistema.

## Qué no hay todavía
- Avisos por correo de nuevas propuestas o mensajes (solo el contador en la web).
- Mensajes no leídos.
