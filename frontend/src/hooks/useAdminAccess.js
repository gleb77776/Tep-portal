import { useAdminAccessContext } from '../context/AdminAccessContext';

/** Совпадает с дефолтами бэкенда (DOCUMENTATION_DYNAMIC_DOCS_SLUG). */
export const DOCUMENTATION_DYNAMIC_SLUG = 'sro';

/** Совпадает с дефолтами бэкенда (DOCUMENTATION_SCOPED_PROJECTS_SLUG). */
export const DOCUMENTATION_SCOPED_PROJECTS_SLUG = 'arkhiv';

/** Данные GET /api/v1/admin/access (роль, canAccessAdmin, …) — из контекста App. */
export function useAdminAccess() {
  return useAdminAccessContext().adminAccess;
}

/** Роль «Документация»: только добавление файлов/папок, без удаления (и в UI). */
export function isDocumentationUploadOnly(access) {
  return access?.role === 'documentation';
}
