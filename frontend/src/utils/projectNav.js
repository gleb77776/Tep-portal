/** Показывать ли ссылку «Диаграммы» в списке и на странице проекта. */
export function showProjectDiagramsNav(project, { scoped }) {
  if (!project) return false;
  if (scoped) return project.diagramsEnabled === true;
  return project.diagramsEnabled !== false;
}

/** Раздел «Файлы проекта» на сайте — только если в админке задана ссылка на папку (folderLink). */
export function showProjectFilesNav(project) {
  if (!project) return false;
  return Boolean(project.folderLink && String(project.folderLink).trim());
}
