import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { parseJsonResponse } from '../utils/parseJsonResponse';
import { backendUrl } from '../backendUrl';

/** Меню ссылок для динамического multi_links (не /licenses). */
function SectionMenuDynamicPage({ sectionId, title }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    fetch(backendUrl(`/api/v1/section-menus/${encodeURIComponent(sectionId)}`))
      .then((res) => parseJsonResponse(res))
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [sectionId]);

  const openHref = (url) => {
    if (!url || typeof url !== 'string') return;
    const u = url.trim();
    if (u.startsWith('file://')) {
      window.location.href = u;
      return;
    }
    window.open(u, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="licenses-page">
      <Link to="/" className="back-to-main-button">
        ← На главную
      </Link>
      <h1 className="licenses-page__title">{title || 'Раздел'}</h1>
      <p className="licenses-page__hint">Выберите пункт меню.</p>

      {loading && <p className="licenses-page__status">Загрузка…</p>}
      {error && <p className="licenses-page__error">{error}</p>}

      {!loading && !error && items.length === 0 && (
        <p className="licenses-page__empty">Пункты меню пока не настроены.</p>
      )}

      {!loading && items.length > 0 && (
        <nav className="licenses-menu" aria-label="Меню раздела">
          <ul className="licenses-menu__list">
            {items.map((item) => (
              <li key={item.id} className="licenses-menu__item">
                <button type="button" className="licenses-menu__btn" onClick={() => openHref(item.url)}>
                  <span className="licenses-menu__label">{item.title || 'Без названия'}</span>
                  <span className="licenses-menu__arrow" aria-hidden>
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}

export default SectionMenuDynamicPage;
