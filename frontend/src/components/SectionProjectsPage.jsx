import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { backendUrl } from '../backendUrl';
import { folderLinkHref } from '../utils/folderLinkHref';
import { showProjectDiagramsNav, showProjectFilesNav } from '../utils/projectNav';

/**
 * Список проектов для шаблона «projects» (/s/:slug).
 * Разметка и тексты совпадают с {@link ProjectsPage} (/projects), отличаются только API и ссылки на карточки.
 */
function SectionProjectsPage() {
  const { slug } = useParams();
  const [projects, setProjects] = useState([]);
  const [listSearch, setListSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const filteredProjects = useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      String(p.title || p.id || '')
        .toLowerCase()
        .includes(q)
    );
  }, [projects, listSearch]);

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

        {!loading && !error && projects.length > 0 && (
          <label className="documents-search-label" style={{ marginBottom: 14, maxWidth: 520 }}>
            <span className="documents-search-label-text">Поиск проекта по названию</span>
            <input
              type="search"
              className="documents-search-input"
              placeholder="Начните вводить название…"
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              autoComplete="off"
            />
          </label>
        )}

        {loading ? (
          <p className="admin-news-loading">Загрузка...</p>
        ) : error ? (
          <p className="admin-news-error">{error}</p>
        ) : projects.length === 0 ? (
          <p className="no-documents">Нет проектов</p>
        ) : filteredProjects.length === 0 ? (
          <p className="no-documents">Ничего не найдено по запросу</p>
        ) : (
          <ul className="projects-list">
            {filteredProjects.map((project) => {
              const folderHref = folderLinkHref(project.folderLink);
              const showDiag = showProjectDiagramsNav(project, { scoped: true });
              const showFiles = showProjectFilesNav(project);
              return (
                <li key={project.id} className="project-item project-item--stacked">
                  <div className="project-item__title-row">
                    {folderHref ? (
                      <a
                        href={folderHref}
                        className="project-link--folder"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Открыть папку проекта"
                      >
                        <span className="project-name">{project.title}</span>
                      </a>
                    ) : (
                      <span className="project-title-plain" title="Ссылку на папку можно задать в админке раздела">
                        {project.title}
                      </span>
                    )}
                  </div>
                  {(showFiles || showDiag) && (
                    <div className="project-item__subnav">
                      {showFiles && (
                        <Link
                          to={`/s/${slug}/project/${project.id}/files`}
                          className="project-sublink"
                          title="Файлы проекта на портале"
                        >
                          Файлы проекта
                        </Link>
                      )}
                      {showDiag && (
                        <Link to={`/s/${slug}/project/${project.id}/diagrams`} className="project-sublink">
                          Диаграммы
                        </Link>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SectionProjectsPage;
