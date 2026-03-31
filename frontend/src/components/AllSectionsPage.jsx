import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { cards as fallbackCards, additionalSections } from '../data/cards';
import { backendUrl } from '../backendUrl';
import { mergeSiteSectionLinks } from '../utils/mergeSiteSectionLinks';

function AllSectionsPage() {
  const [sectionLinks, setSectionLinks] = useState(null);
  const [siteSections, setSiteSections] = useState(null);

  useEffect(() => {
    fetch(backendUrl('/api/v1/section-card-links'))
      .then((res) => (res.ok ? res.json() : {}))
      .then((data) => setSectionLinks(data && typeof data === 'object' ? data : {}))
      .catch(() => setSectionLinks({}));
  }, []);

  useEffect(() => {
    fetch(backendUrl('/api/v1/site-sections'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSiteSections(Array.isArray(data) ? data : null))
      .catch(() => setSiteSections(null));
  }, []);

  const allSections = useMemo(() => {
    if (siteSections && siteSections.length > 0) {
      const merged = mergeSiteSectionLinks(siteSections, sectionLinks);
      return merged
        .filter((s) => s.template !== 'all_sections' && s.slug !== 'all-sections')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    const staticCards = [
      ...fallbackCards.map((c, i) => ({
        id: `st-${i}`,
        title: c.title,
        icon: c.icon,
        linkKey: c.linkKey,
        cardHref: c.link,
        isExternal: c.link.startsWith('http') || c.link.startsWith('file'),
      })),
      ...additionalSections.map((c, i) => ({
        id: `ad-${i}`,
        title: c.title,
        icon: c.icon,
        cardHref: c.link,
        isExternal: false,
      })),
    ];
    return mergeSiteSectionLinks(staticCards, sectionLinks).filter((s) => s.cardHref !== '/sections');
  }, [siteSections, sectionLinks]);

  return (
    <>
      <Link to="/" className="back-to-main-button">
        ← Вернуться на главную
      </Link>

      <div className="all-sections-page">
        <h2 className="page-title">Все разделы</h2>

        <div className="sections-container">
          <div className="section-group">
            <h3 className="section-title">Основное</h3>
            <div className="sections-grid">
              {allSections.map((section, index) => {
                const href = section.cardHref || section.link;
                const ext =
                  section.isExternal ||
                  (href && (href.startsWith('http') || href.startsWith('file')));
                if (ext) {
                  return (
                    <a
                      key={section.id || index}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="section-card"
                    >
                      <div className="section-icon">{section.icon}</div>
                      <span className="section-title-text">{section.title}</span>
                    </a>
                  );
                }
                return (
                  <Link key={section.id || index} to={href} className="section-card">
                    <div className="section-icon">{section.icon}</div>
                    <span className="section-title-text">{section.title}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default AllSectionsPage;
