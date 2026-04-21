/**
 * Временный режим: просмотр указанных проектов без AD (пока SharePoint недоступен).
 * Отключить: в .env задать VITE_GUEST_PROJECT_IDS=- или 0
 */
export function getGuestProjectIds() {
  const raw = import.meta.env.VITE_GUEST_PROJECT_IDS;
  if (raw === '0' || raw === '-' || raw === 'false') return [];
  const s =
    raw != null && String(raw).trim() !== ''
      ? String(raw)
      : '141N50_Svobodnenskaya';
  return s
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function isGuestProjectRoute(pathname) {
  const p = (pathname || '').replace(/\/+$/, '') || '/';
  const m = p.match(/^\/projects\/([^/]+)(?:\/(files|diagrams))?$/);
  if (!m) return false;
  return getGuestProjectIds().includes(m[1]);
}

export const GUEST_USER_PLACEHOLDER = {
  fullName: 'Гость',
  username: '',
  email: '',
  department: '',
  photo: null,
};
