/** Сортировка как на бэкенде (sortProjects): видимые выше, затем по title. */
export function sortAdminProjects(list) {
  return [...list].sort((a, b) => {
    const av = a.visible !== false;
    const bv = b.visible !== false;
    if (av !== bv) return av ? -1 : 1;
    return String(a.title || '').localeCompare(String(b.title || ''), 'ru', {
      sensitivity: 'base',
    });
  });
}
