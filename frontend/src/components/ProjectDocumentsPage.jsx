import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { backendUrl } from '../backendUrl';
import { filterProjectDocuments } from '../utils/projectDocumentsFilter';
import { showProjectDiagramsNav, showProjectFilesNav } from '../utils/projectNav';

/**
 * @param {'admin' | 'diagrams'} scope
 * @param {'global' | 'scoped'} variant
 */
function ProjectDocumentsPage({ onOpenDocument, scope, variant }) {
  const { projectId, slug } = useParams();
  const navigate = useNavigate();
  const isScoped = variant === 'scoped';

  const [projectTitle, setProjectTitle] = useState(projectId);
  const [projectMeta, setProjectMeta] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const redirectGuard = useRef(false);

  useEffect(() => {
    redirectGuard.current = false;
  }, [projectId, slug, scope]);

  useEffect(() => {
    let cancelled = false;
    const metaUrl = isScoped
      ? `/api/v1/site-sections/scoped/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}`
      : `/api/v1/projects/${encodeURIComponent(projectId)}`;
    fetch(backendUrl(metaUrl))
      .then(async (res) => {
        if (res.status === 404) return null;
        if (!res.ok) return null;
        return res.json().catch(() => null);
      })
      .then((p) => {
        if (cancelled) return;
        if (p?.title) setProjectTitle(p.title);
        setProjectMeta(p || null);
      })
      .catch(() => {
        if (!cancelled) setProjectMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, slug, isScoped]);

  const filesPath = isScoped ? `/s/${slug}/project/${projectId}/files` : `/projects/${projectId}/files`;
  const diagramsPath = isScoped ? `/s/${slug}/project/${projectId}/diagrams` : `/projects/${projectId}/diagrams`;
  const backTo = isScoped ? `/s/${slug}` : '/projects';

  useEffect(() => {
    if (!projectMeta) return;
    if (redirectGuard.current) return;
    const filesOk = showProjectFilesNav(projectMeta);
    const diagOk = showProjectDiagramsNav(projectMeta, { scoped: isScoped });
    if (scope === 'admin' && !filesOk) {
      redirectGuard.current = true;
      if (diagOk) navigate(diagramsPath, { replace: true });
      else navigate(backTo, { replace: true });
      return;
    }
    if (scope === 'diagrams' && !diagOk) {
      redirectGuard.current = true;
      if (filesOk) navigate(filesPath, { replace: true });
      else navigate(backTo, { replace: true });
    }
  }, [projectMeta, scope, isScoped, navigate, filesPath, diagramsPath, backTo]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const path = isScoped
      ? `/api/v1/site-sections/scoped/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/documents?scope=${encodeURIComponent(scope)}`
      : `/api/v1/projects/${encodeURIComponent(projectId)}/documents?scope=${encodeURIComponent(scope)}`;
    fetch(backendUrl(path))
      .then((res) => res.json().then((d) => ({ ok: res.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data?.error || 'Ошибка загрузки документов');
        if (!cancelled) setDocuments(Array.isArray(data) ? data : []);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.message || 'Ошибка');
          setDocuments([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, slug, isScoped, scope]);

  const docTypes = useMemo(() => {
    const s = new Set();
    for (const d of documents) {
      if (d?.ext) s.add(d.ext);
    }
    return [...s];
  }, [documents]);

  const filteredDocs = useMemo(
    () =>
      filterProjectDocuments(documents, {
        typeFilter: filterType,
        searchQuery,
      }),
    [documents, filterType, searchQuery]
  );

  const formatDocDate = (iso) => {
    if (!iso || typeof iso !== 'string') return '';
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    return new Date(t).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
  };

  const iconForExt = (ext) => {
    const e = (ext || '').toLowerCase();
    if (e === 'pdf') return '📄';
    if (e === 'xls' || e === 'xlsx') return '📊';
    if (e === 'doc' || e === 'docx') return '📝';
    if (e === 'png' || e === 'jpg' || e === 'jpeg' || e === 'gif' || e === 'webp' || e === 'svg') return '🖼';
    if (e === 'dwg' || e === 'dxf') return '📐';
    return '📎';
  };

  const openDoc = (doc) => {
    const url = doc.url && doc.url.startsWith('/') ? backendUrl(doc.url) : doc.url;
    onOpenDocument({ ...doc, url });
  };

  const pageHeading = scope === 'diagrams' ? 'Диаграммы' : 'Файлы проекта';
  const showFiles = projectMeta ? showProjectFilesNav(projectMeta) : false;
  const showDiag = projectMeta ? showProjectDiagramsNav(projectMeta, { scoped: isScoped }) : false;

  return (
    <div className="project-page">
      <Link to={backTo} className="back-to-main-button">
        ← К списку проектов
      </Link>

      <div className="project-header">
        <h2 className="page-title">{pageHeading}</h2>
        <p className="project-subtitle">{projectTitle}</p>
        {(showFiles || showDiag) && (
          <nav className="project-subnav" aria-label="Разделы проекта">
            {showFiles && (
              <Link
                to={filesPath}
                className={`project-subnav-link ${scope === 'admin' ? 'project-subnav-link--active' : ''}`}
              >
                Файлы проекта
              </Link>
            )}
            {showDiag && (
              <Link
                to={diagramsPath}
                className={`project-subnav-link ${scope === 'diagrams' ? 'project-subnav-link--active' : ''}`}
              >
                Диаграммы
              </Link>
            )}
          </nav>
        )}
      </div>

      <div className="project-layout">
        <div className="project-documents">
          <div className="documents-filters documents-filters--stack">
            <label className="documents-search-label">
              <span className="documents-search-label-text">Поиск по названию</span>
              <input
                type="search"
                className="documents-search-input"
                placeholder="Название или фрагмент имени файла…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
            </label>
            <div className="documents-filters-row">
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="filter-select"
              >
                <option value="">Все типы</option>
                {docTypes.map((t) => (
                  <option key={t} value={t}>
                    {String(t).toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <p className="no-documents">Загрузка...</p>
          ) : error ? (
            <p className="no-documents" style={{ color: '#c00' }}>
              {error}
            </p>
          ) : documents.length === 0 ? (
            <p className="no-documents">
              {scope === 'diagrams'
                ? 'Нет диаграмм для этого проекта'
                : 'Нет загруженных файлов'}
            </p>
          ) : (
            <div className="documents-list">
              {filteredDocs.length === 0 ? (
                <p className="no-documents">Ничего не найдено по поиску или фильтру</p>
              ) : (
                filteredDocs.map((doc) => (
                  <div
                    key={doc.id}
                    className="document-card"
                    onClick={() => openDoc(doc)}
                  >
                    <span className="doc-icon">{iconForExt(doc.ext)}</span>
                    <div className="doc-info">
                      <span className="doc-name">{doc.name}</span>
                      <span className="doc-meta">
                        {doc.addedBy ? `Добавил: ${doc.addedBy}` : ''}
                        {doc.addedAt
                          ? doc.addedBy
                            ? ` • ${formatDocDate(doc.addedAt)}`
                            : formatDocDate(doc.addedAt)
                          : ''}
                      </span>
                    </div>
                    <div className="doc-actions">
                      <button
                        type="button"
                        className="doc-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          openDoc(doc);
                        }}
                        title="Просмотр"
                      >
                        👁
                      </button>
                      {doc.url ? (
                        <a
                          href={doc.url.startsWith('/') ? backendUrl(doc.url) : doc.url}
                          download
                          className="doc-action-btn"
                          onClick={(e) => e.stopPropagation()}
                          title="Скачать"
                        >
                          ⬇
                        </a>
                      ) : (
                        <button
                          type="button"
                          className="doc-action-btn"
                          onClick={(e) => e.stopPropagation()}
                          title="Скачать"
                        >
                          ⬇
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProjectDocumentsPage;
