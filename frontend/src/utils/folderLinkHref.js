/** Превращает путь Windows/UNC или URL в значение для href (открытие папки в проводнике — по возможности браузера). */
export function folderLinkHref(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^file:/i.test(s)) return s;
  if (/^\\\\[^\\]+\\/.test(s)) {
    const rest = s.replace(/^\\\\/, '').replace(/\\/g, '/');
    return `file://${rest}`;
  }
  if (/^[a-zA-Z]:[\\/]/.test(s)) {
    const path = s.replace(/\\/g, '/');
    return `file:///${path.replace(/^([a-zA-Z]):\//, '$1:/')}`;
  }
  return s;
}
