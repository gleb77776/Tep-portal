import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { backendUrl } from '../backendUrl';

/** Карточка проекта внутри раздела /s/:slug (отдельно от /projects/:id). */
function SectionProjectPage({ onOpenDocument }) {
  const { slug, projectId } = useParams();

  const [projectTitle, setProjectTitle] = useState(projectId);
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(backendUrl(`/api/v1/site-sections/scoped/${encodeURIComponent(slug)}/projects`))
      .then((res) => res.json().catch(() => []))
      .then((data) => {
        if (cancelled) return;
        const p = Array.isArray(data) ? data.find((x) => x.id === projectId) : null;
        if (p?.title) setProjectTitle(p.title);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, projectId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(backendUrl(`/api/v1/site-sections/scoped/${encodeURIComponent(slug)}/projects/${encodeURIComponent(projectId)}/documents`))
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
  }, [slug, projectId]);

  const docTypes = useMemo(() => {
    const s = new Set();
    for (const d of documents) {
      if (d?.ext) s.add(d.ext);
    }
    return [...s];
  }, [documents]);

  const filteredDocs = useMemo(() => {
    if (!filterType) return documents;
    return documents.filter((d) => (d?.ext || '') === filterType);
  }, [documents, filterType]);

  // Как в ProjectPage.jsx (+ расширения для scoped-загрузок)
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

  return (
    <div className="project-page">
      <Link to={`/s/${slug}`} className="back-to-main-button">
        ← К списку проектов
      </Link>

      <div className="project-header">
        <h2 className="page-title">{projectTitle}</h2>
      </div>

      <div className="project-layout">
        <div className="project-documents">
          <div className="documents-filters">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="filter-select">
              <option value="">Все типы</option>
              {docTypes.map((t) => (
                <option key={t} value={t}>
                  {String(t).toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="no-documents">Загрузка...</p>
          ) : error ? (
            <p className="no-documents" style={{ color: '#c00' }}>
              {error}
            </p>
          ) : documents.length === 0 ? (
            <p className="no-documents">Нет документов</p>
          ) : (
            <div className="documents-list">
              {filteredDocs.length === 0 ? (
                <p className="no-documents">Ничего не найдено по фильтру</p>
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
                        {doc.addedAt ? (doc.addedBy ? ` • ${doc.addedAt}` : doc.addedAt) : ''}
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
                        <button type="button" className="doc-action-btn" onClick={(e) => e.stopPropagation()} title="Скачать">
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

export default SectionProjectPage;
