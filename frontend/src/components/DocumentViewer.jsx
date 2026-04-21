import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const PDF_EXT = ['pdf'];
const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov'];

function formatAddedAt(iso) {
  if (!iso || !String(iso).trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).trim();
  return d.toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
}

function sourceLabel(source) {
  if (!source) return '';
  const map = {
    diagrams: 'диаграммы PDMS',
    admin: 'файлы проекта (админ)',
  };
  return map[source] || source;
}

function DocumentViewer({ document: doc, onClose }) {
  const [favorite, setFavorite] = useState(false);
  const [layoutExpanded, setLayoutExpanded] = useState(false);
  const viewerRef = useRef(null);

  const ext = useMemo(() => {
    const raw =
      (doc?.ext && String(doc.ext)) ||
      (doc?.name ? String(doc.name).split('.').pop() : '');
    return (raw || '').toLowerCase();
  }, [doc]);

  const previewUrl = doc?.url || null;

  const isPdf = PDF_EXT.includes(ext);
  const isImage = IMAGE_EXT.includes(ext);
  const isVideo =
    Boolean(doc?.isVideo) || (Boolean(previewUrl) && VIDEO_EXT.includes(ext));
  const hasPreview = Boolean(previewUrl && (isPdf || isImage || isVideo));

  const footerParts = useMemo(() => {
    const when = formatAddedAt(doc?.addedAt);
    const parts = [];
    if (when) parts.push(`Добавлено на портал: ${when}`);
    else parts.push('Дата добавления на портал не указана');
    if (doc?.addedBy) parts.push(`Добавил: ${doc.addedBy}`);
    const src = sourceLabel(doc?.source);
    if (src) parts.push(`Источник: ${src}`);
    return parts;
  }, [doc]);

  const syncExpandedFromFullscreen = useCallback(() => {
    const el = viewerRef.current;
    if (!el) return;
    if (window.document.fullscreenElement !== el) {
      setLayoutExpanded(false);
    }
  }, []);

  useEffect(() => {
    window.document.addEventListener('fullscreenchange', syncExpandedFromFullscreen);
    return () =>
      window.document.removeEventListener('fullscreenchange', syncExpandedFromFullscreen);
  }, [syncExpandedFromFullscreen]);

  const toggleExpand = async () => {
    const el = viewerRef.current;
    if (!el) return;
    if (window.document.fullscreenElement === el) {
      try {
        await window.document.exitFullscreen();
      } catch {
        /* ignore */
      }
      setLayoutExpanded(false);
      return;
    }
    if (layoutExpanded) {
      setLayoutExpanded(false);
      return;
    }
    setLayoutExpanded(true);
    if (typeof el.requestFullscreen === 'function') {
      try {
        await el.requestFullscreen();
      } catch {
        /* остаётся разворот через CSS */
      }
    }
  };

  const expanded =
    layoutExpanded ||
    (viewerRef.current != null &&
      window.document.fullscreenElement === viewerRef.current);

  return (
    <div
      className={`document-viewer-overlay ${expanded ? 'document-viewer-overlay--expanded' : ''}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={viewerRef}
        className={`document-viewer ${expanded ? 'document-viewer--expanded' : ''}`}
      >
        <div className="viewer-header">
          <h3 className="viewer-title">{doc?.name}</h3>
          <div className="viewer-actions">
            {previewUrl && (
              <a href={previewUrl} download className="viewer-btn" title="Скачать">
                ⬇ Скачать
              </a>
            )}
            <button
              className="viewer-btn"
              type="button"
              title={expanded ? 'Свернуть окно' : 'На весь экран'}
              onClick={() => void toggleExpand()}
            >
              {expanded ? '⤓ Свернуть' : '⤢ На весь экран'}
            </button>
            <button
              className={`viewer-btn ${favorite ? 'viewer-btn-favorite' : ''}`}
              title="В избранное"
              onClick={() => setFavorite(!favorite)}
              type="button"
            >
              ★ {favorite ? 'В избранном' : 'В избранное'}
            </button>
            <button className="viewer-btn viewer-close" onClick={onClose} type="button">
              ✕ Закрыть
            </button>
          </div>
        </div>

        <div className="viewer-body">
          {hasPreview ? (
            isPdf || isVideo ? (
              <div className="viewer-preview-grow">
                {isPdf ? (
                  <iframe src={previewUrl} title={doc?.name} className="viewer-iframe" />
                ) : (
                  <video
                    className="viewer-video"
                    src={previewUrl}
                    controls
                    playsInline
                    preload="metadata"
                  >
                    Ваш браузер не поддерживает воспроизведение этого видео.
                  </video>
                )}
              </div>
            ) : (
              <img src={previewUrl} alt={doc?.name} className="viewer-img" />
            )
          ) : (
            <div className="viewer-placeholder">
              <p>Просмотр в браузере недоступен</p>
              <p className="viewer-placeholder-note">
                Скачайте файл и откройте его в соответствующем приложении.
              </p>
              {previewUrl && (
                <a href={previewUrl} download className="viewer-btn viewer-btn-download">
                  ⬇ Скачать файл
                </a>
              )}
            </div>
          )}
        </div>

        <footer className="viewer-footer">
          <div className="viewer-footer-line">{footerParts.join(' · ')}</div>
        </footer>
      </div>
    </div>
  );
}

export default DocumentViewer;
