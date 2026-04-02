/** Ссылка в админке на редактирование контента раздела (страница «Разделы» /admin/sections). */
export function getSectionAdminContentLink(s) {
  if (!s) return null;
  if (s.template === 'projects') {
    // Только системный раздел с slug="projects" ведём в общий редактор проектов.
    // Для остальных проектов-разделов используем scoped-редактор: /admin/section-projects/:slug.
    if (s.slug === 'projects') {
      return '/admin/projects';
    }
    return `/admin/section-projects/${encodeURIComponent(s.slug)}`;
  }
  if (s.template === 'documents' || s.template === 'documents_video') {
    return `/admin/dynamic-docs/${encodeURIComponent(s.slug)}`;
  }
  if (s.template === 'multi_links') {
    if (s.slug === 'licenses' || s.internalPath === '/licenses') {
      return '/admin/section-menu/licenses';
    }
    return `/admin/section-menu/${encodeURIComponent(s.id)}`;
  }
  return null;
}

const TEMPLATE_HINT = {
  projects: 'Проекты, файлы и PID',
  documents: 'Папки и файлы на сайте',
  documents_video: 'Документы и видео',
  multi_links: 'Пункты меню и ссылки',
};

export function getSectionContentSubtitle(s) {
  const hint = TEMPLATE_HINT[s.template] || 'Контент раздела';
  const path = s.internalPath || (s.slug ? `/s/${s.slug}` : '');
  return path ? `${hint} · ${path}` : hint;
}

/** Короткая подпись для карточки в админке (как у фиксированных разделов). */
export function getSectionAdminCardSubtitle(s) {
  const hint = TEMPLATE_HINT[s.template] || 'Контент раздела';
  const slug = s.slug ? String(s.slug) : '';
  return slug ? `${hint} · /s/${slug}` : hint;
}
