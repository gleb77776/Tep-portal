import React, { useState, useEffect } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { parseJsonResponse } from '../utils/parseJsonResponse';
import { backendUrl } from '../backendUrl';
import DynamicDocumentsPage from './DynamicDocumentsPage';
import SectionMenuDynamicPage from './SectionMenuDynamicPage';
import SectionProjectsPage from '../components/SectionProjectsPage';

/**
 * Маршрут /s/:slug — динамические разделы (документы или меню ссылок), без перезапуска бэкенда.
 */
function DynamicSectionPage({ onOpenDocument }) {
  const { slug } = useParams();
  const [sec, setSec] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
    setSec(null);
    fetch(backendUrl(`/api/v1/site-sections/slug/${encodeURIComponent(slug)}`))
      .then((res) => parseJsonResponse(res))
      .then((data) => setSec(data))
      .catch((e) => setError(e.message));
  }, [slug]);

  if (error) {
    return (
      <div className="licenses-page">
        <p className="licenses-page__error">{error}</p>
      </div>
    );
  }
  if (!sec) {
    return <p className="licenses-page__status" style={{ padding: 20 }}>Загрузка…</p>;
  }

  const t = sec.template;
  if (t === 'projects') {
    return <SectionProjectsPage />;
  }
  if (t === 'documents') {
    return <DynamicDocumentsPage slug={slug} title={sec.title} video={false} onOpenDocument={onOpenDocument} />;
  }
  if (t === 'documents_video') {
    return <DynamicDocumentsPage slug={slug} title={sec.title} video onOpenDocument={onOpenDocument} />;
  }
  if (t === 'multi_links') {
    return <SectionMenuDynamicPage sectionId={sec.id} title={sec.title} />;
  }

  if (t === 'single_link' && sec.cardHref) {
    window.location.href = sec.cardHref;
    return null;
  }

  return <Navigate to="/" replace />;
}

export default DynamicSectionPage;
