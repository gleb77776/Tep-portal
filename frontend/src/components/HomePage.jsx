import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cards as fallbackCards, news as fallbackNews } from '../data/cards';
import { backendUrl, publicAssetUrl } from '../backendUrl';
import { mergeSiteSectionLinks, HOME_SECTIONS_LIMIT } from '../utils/mergeSiteSectionLinks';
import { linkifyPlainText } from '../utils/linkifyText';

const HOME_HERO_MOV = publicAssetUrl('home-hero.mov');

function HomePage() {
  const [news, setNews] = useState(fallbackNews);
  const [sectionLinks, setSectionLinks] = useState(null);
  const [siteSections, setSiteSections] = useState(null);
  const heroVideoRef = useRef(null);

  useEffect(() => {
    const v = heroVideoRef.current;
    if (!v) return;
    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    tryPlay();
    v.addEventListener('loadeddata', tryPlay);
    return () => v.removeEventListener('loadeddata', tryPlay);
  }, []);

  useEffect(() => {
    fetch(backendUrl('/api/v1/news'))
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setNews(data);
      })
      .catch(() => {});
  }, []);

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

  const displayCards = useMemo(() => {
    if (siteSections && siteSections.length > 0) {
      const merged = mergeSiteSectionLinks(siteSections, sectionLinks);
      const forHome = merged.filter((s) => s.showOnHome && s.slug !== 'all-sections');
      forHome.sort((a, b) => (a.homeOrder ?? 0) - (b.homeOrder ?? 0));
      const main = forHome.slice(0, HOME_SECTIONS_LIMIT);
      const allCard = merged.find((s) => s.template === 'all_sections' || s.slug === 'all-sections');
      return allCard ? [...main, allCard] : main;
    }
    const mergedStatic = mergeSiteSectionLinks(
      fallbackCards.map((c, i) => ({
        id: `fb-${i}`,
        slug: `fb-${i}`,
        title: c.title,
        icon: c.icon,
        template: c.linkKey ? 'single_link' : 'legacy',
        showOnHome: true,
        homeOrder: i,
        linkKey: c.linkKey,
        cardHref: c.link,
        isExternal: c.link.startsWith('http') || c.link.startsWith('file'),
      })),
      sectionLinks
    );
    const mainItems = mergedStatic.filter((c) => c.slug !== 'all-sections' && c.cardHref !== '/sections').slice(0, HOME_SECTIONS_LIMIT);
    const allSectionsCard = mergedStatic.find((c) => c.cardHref === '/sections');
    return allSectionsCard ? [...mainItems, allSectionsCard] : mainItems;
  }, [siteSections, sectionLinks]);

  const renderCard = (card, index) => {
    const href = card.cardHref || card.link || '#';
    const ext =
      card.isExternal ||
      href.startsWith('http://') ||
      href.startsWith('https://') ||
      href.startsWith('file://');
    if (ext) {
      return (
        <a key={card.id || index} href={href} target="_blank" rel="noopener noreferrer" className="icon-item">
          <div className="icon-circle">{card.icon}</div>
          <span className="icon-title">{card.title}</span>
        </a>
      );
    }
    return (
      <Link key={card.id || index} to={href} className="icon-item">
        <div className="icon-circle">{card.icon}</div>
        <span className="icon-title">{card.title}</span>
      </Link>
    );
  };

  return (
    <div className="home-page">
      <div className="home-hero" aria-hidden="true">
        <div className="home-hero__backdrop" />
        <video
          ref={heroVideoRef}
          className="home-hero__video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onError={() => {
            const el = heroVideoRef.current;
            const code = el?.error?.code;
            const msg = el?.error?.message;
            console.warn('[home-hero] Ошибка воспроизведения видео.', { code, msg, src: HOME_HERO_MOV });
          }}
        >
          {/* Один файл .mov: type mp4 помогает Chrome (H.264 в MOV), quicktime — Safari. Отдельный home-hero.mp4 не запрашиваем — иначе 404 в логах Gin при прокси. */}
          <source src={HOME_HERO_MOV} type="video/mp4" />
          <source src={HOME_HERO_MOV} type="video/quicktime" />
        </video>
      </div>

      <div className="home-content-column">
        <div className="icons-panel home-icons-panel">
          <div className="icons-container">
            {displayCards && displayCards.length > 0
              ? displayCards.map((card, index) => renderCard(card, index))
              : null}
          </div>
        </div>

        <div className="news-section home-news-section">
          <div className="news-header">
            <h3 className="news-title">Последние новости</h3>
          </div>
          <div className="news-content">
            {news.slice(0, 3).map((item) => (
              <div key={item.id} className="news-item">
                <div className="news-icon">{item.icon || '📄'}</div>
                <div className="news-text">
                  <h4 className="news-item-title">{linkifyPlainText(item.title, 'news-item-link')}</h4>
                  <p className="news-date">{linkifyPlainText(item.date, 'news-item-link')}</p>
                  <p className="news-social-line">
                    Подробнее — в наших соцсетях
                    <a href="https://vk.com/ao_tep" target="_blank" rel="noopener noreferrer" className="news-social-icon" title="ВКонтакте" aria-label="ВКонтакте">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M15.684 0H8.316C1.592 0 0 1.592 0 8.316v7.368C0 22.408 1.592 24 8.316 24h7.368C22.408 24 24 22.408 24 15.684V8.316C24 1.592 22.408 0 15.684 0zm3.692 17.123h-1.744c-.66 0-.862-.525-2.049-1.727-1.033-1-1.49-1.135-1.744-1.135-.356 0-.458.102-.458.593v1.575c0 .424-.135.678-1.253.678-1.846 0-3.896-1.118-5.335-3.202C4.624 10.857 4.03 8.57 4.03 8.096c0-.254.102-.491.593-.491h1.744c.44 0 .61.203.78.677.863 2.49 2.303 4.675 2.896 4.675.22 0 .322-.102.322-.66V9.721c-.068-1.186-.695-1.287-.695-1.71 0-.203.17-.407.44-.407h2.744c.373 0 .508.203.508.643v3.473c0 .372.17.508.271.508.22 0 .407-.136.813-.542 1.254-1.406 2.151-3.574 2.151-3.574.119-.254.322-.491.763-.491h1.744c.525 0 .644.27.525.643-.22 1.017-2.354 4.031-2.354 4.031-.186.305-.254.44 0 .78.186.254.796.779 1.203 1.253.745.847 1.32 1.558 1.473 2.049.17.49-.085.744-.576.744z"/></svg>
                    </a>
                    <a href="https://t.me/teploelektroproekt" target="_blank" rel="noopener noreferrer" className="news-social-icon" title="Telegram" aria-label="Telegram">
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                    </a>
                  </p>
                </div>
                {item.badge && (
                  <span className="news-badge">{linkifyPlainText(item.badge, 'news-item-link')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default HomePage;
