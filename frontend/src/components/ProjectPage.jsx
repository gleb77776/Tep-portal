import React from 'react';
import { Navigate } from 'react-router-dom';

/** Совместимость с устаревшим MainContent: переход на маршрут с файлами проекта. */
function ProjectPage({ projectId }) {
  if (!projectId) return null;
  return <Navigate to={`/projects/${encodeURIComponent(projectId)}/files`} replace />;
}

export default ProjectPage;
