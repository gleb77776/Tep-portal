import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { backendUrl } from '../backendUrl';

/**
 * Список проектов для шаблона «projects» (/s/:slug).
 * Разметка и тексты совпадают с {@link ProjectsPage} (/projects), отличаются только API и ссылки на карточки.
 */
function SectionProjectsPage() {
  const { slug } = useParams();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(backendUrl(`/api/v1/site-sections/scoped/${encodeURIComponent(slug)}/projects`))
      .then(async (res) => {
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(txt || 'Ошибка загрузки проектов');
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setProjects(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Ошибка');
        if (!cancelled) setProjects([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="projects-page">
      <Link to="/" className="back-to-main-button">
        ← Вернуться на главную
      </Link>

      <div className="projects-content">
        <h2 className="page-title">Перечень текущих проектов</h2>

        {loading ? (
          <p className="admin-news-loading">Загрузка...</p>
        ) : error ? (
          <p className="admin-news-error">{error}</p>
        ) : (
          <ul className="projects-list">
            {projects.map((project) => (
              <li key={project.id} className="project-item">
                <Link to={`/s/${slug}/project/${project.id}`} className="project-link">
                  <span className="project-name">{project.title}</span>
                  {project.source === 'admin' && project.author && (
                    <span className="project-badge">Админ</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SectionProjectsPage;
