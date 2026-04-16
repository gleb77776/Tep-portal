/**
 * Поиск по отображаемому имени и по имени файла из url (для технических имён).
 */
export function documentMatchesSearch(doc, rawQuery) {
  if (!rawQuery || !String(rawQuery).trim()) return true;
  const q = String(rawQuery).trim().toLowerCase();
  const name = String(doc?.name || '').toLowerCase();
  if (name.includes(q)) return true;
  const url = String(doc?.url || '');
  const base = url.split('/').pop() || '';
  try {
    const decoded = decodeURIComponent(base).toLowerCase();
    if (decoded.includes(q)) return true;
  } catch {
    if (base.toLowerCase().includes(q)) return true;
  }
  return false;
}

/**
 * @param {object} opts
 * @param {string} [opts.typeFilter] — расширение из селекта или ''
 * @param {string} [opts.searchQuery]
 */
export function filterProjectDocuments(docs, opts = {}) {
  const { typeFilter = '', searchQuery = '' } = opts;
  let list = Array.isArray(docs) ? [...docs] : [];
  if (typeFilter) {
    list = list.filter((d) => (d?.ext || '') === typeFilter);
  }
  if (searchQuery && String(searchQuery).trim()) {
    list = list.filter((d) => documentMatchesSearch(d, searchQuery));
  }
  return list;
}
