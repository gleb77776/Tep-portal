/** Поля с бэкенда GET /admin/access; fallback для старых ответов без флагов. */

/** Нормализация роли из ответа API (регистр, дефис/подчёркивание). */
export function canonicalAdminRole(access) {
  let r = String(access?.role || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');
  if (r === 'newslinks') r = 'news_links';
  return r;
}

/** Есть ли вход в админ-панель (кнопка «Админ» и группа /admin/*). */
export function adminPanelAllowed(access) {
  if (!access || typeof access !== 'object') return false;
  if (access.canAccessAdmin === true) return true;
  if (access.canEditNewsAndLinks === true) return true;
  if (access.canEditOT === true) return true;
  const r = canonicalAdminRole(access);
  return ['administrator', 'documentation', 'hr', 'news_links', 'safety'].includes(r);
}

export function canEditNewsAndLinks(access) {
  if (!access) return false;
  if (typeof access.canEditNewsAndLinks === 'boolean') return access.canEditNewsAndLinks;
  const r = canonicalAdminRole(access);
  return r === 'administrator' || r === 'news_links';
}

export function canEditOT(access) {
  if (!access) return false;
  if (typeof access.canEditOT === 'boolean') return access.canEditOT;
  const r = canonicalAdminRole(access);
  return r === 'administrator' || r === 'safety';
}

/** Куда перенаправить ограниченную роль с запрещённого пути /admin/*. */
export function getRestrictedAdminRedirect(pathname, access) {
  const r = canonicalAdminRole(access);
  if (!r) return null;
  const path = (pathname || '').replace(/\/$/, '') || '/';

  if (r === 'news_links') {
    if (path === '/admin' || path.startsWith('/admin/news') || path.startsWith('/admin/links')) {
      return null;
    }
    return '/admin';
  }

  if (r === 'safety') {
    if (path === '/admin' || path.startsWith('/admin/ot')) {
      return null;
    }
    return '/admin';
  }

  return null;
}
