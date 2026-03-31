/**
 * Базовый URL бэкенда (Go) для API и статики (/api, /smk/files, /ot/files, /kepr/files, /forms/files, /training/files).
 *
 * - В **разработке** (`npm run dev`), если `VITE_API_BASE` не задан — по умолчанию
 *   `http://localhost:8000` (тот же порт, что у Go по умолчанию). Запросы идут
 *   напрямую в бэкенд, прокси Vite для /api не обязателен.
 * - Задайте в frontend/.env: `VITE_API_BASE=http://localhost:XXXX` если Go на другом порту.
 * - В **production** без `VITE_API_BASE` используются относительные пути (ожидается nginx и т.п.).
 */
/**
 * Статика из `frontend/public` (видео главной и т.п.).
 * В **dev** всегда тот же origin, что и у Vite (`/…` или `BASE_URL`), чтобы файлы брались из `public/`
 * даже при `VITE_API_BASE` на Go — иначе запрос уходил на :8000 и легко давал 404 (cwd бэкенда, нет раздачи).
 * В **production** при `VITE_API_BASE` можно тянуть с API, если статика там раздаётся; иначе — `BASE_URL`.
 */
export function publicAssetUrl(filename) {
  const name = filename.replace(/^\//, '');
  if (import.meta.env.DEV) {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
    return `${base}${name}`;
  }
  const raw = import.meta.env.VITE_API_BASE;
  const apiBase = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : '';
  if (apiBase) return `${apiBase}/${name}`;
  const base = (import.meta.env.BASE_URL || '/').replace(/\/?$/, '/');
  return `${base}${name}`;
}

export function backendUrl(path) {
  const raw = import.meta.env.VITE_API_BASE;
  let base = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : '';
  // В dev режиме при отсутствии VITE_API_BASE используем относительные пути `/api/...`,
  // чтобы запрос шёл через Vite proxy и сохранялась цепочка заголовков от внешней
  // авторизации (если она есть).
  if (!base && import.meta.env.DEV) {
    base = '';
  }
  const p = path.startsWith('/') ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}

/**
 * Добавляет ?username= из localStorage (ad_username), как у GET /user/me.
 * Иначе админские API в dev без SSO видят только AD_DEFAULT_USER — список проектов и роли «плывут».
 *
 * @param {string} url
 * @param {string|undefined} explicitUsername — если передан (в т.ч. пустая строка), не читаем localStorage;
 *   пустая строка = не добавлять параметр (чтобы не подставлялся дефолтный пользователь на бэкенде).
 */
export function withAdUsernameQuery(url, explicitUsername) {
  if (typeof url !== 'string' || !url) return url;
  let u = '';
  if (explicitUsername !== undefined) {
    u = String(explicitUsername).trim();
  } else if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      u = (localStorage.getItem('ad_username') || '').trim();
    } catch (_) {
      return url;
    }
  } else {
    return url;
  }
  if (!u) return url;
  if (/[?&]username=/.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}username=${encodeURIComponent(u)}`;
}

/** URL /api/v1/admin + путь (например `/projects`, `/access`). */
export function adminApiUrl(pathAfterAdmin, explicitUsername) {
  const p = pathAfterAdmin.startsWith('/') ? pathAfterAdmin : `/${pathAfterAdmin}`;
  return withAdUsernameQuery(backendUrl(`/api/v1/admin${p}`), explicitUsername);
}
