import React, { useMemo, useState } from 'react';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const PDF_EXT = ['pdf'];
const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov'];

function DocumentViewer({ document, onClose }) {
  const [favorite, setFavorite] = useState(false);

  const ext = useMemo(() => {
    const raw =
      (document?.ext && String(document.ext)) ||
      (document?.name ? String(document.name).split('.').pop() : '');
    return (raw || '').toLowerCase();
  }, [document]);

  const previewUrl = document?.url || null;

  const isPdf = PDF_EXT.includes(ext);
  const isImage = IMAGE_EXT.includes(ext);
  const isVideo =
    Boolean(document?.isVideo) || (Boolean(previewUrl) && VIDEO_EXT.includes(ext));
  const hasPreview = Boolean(previewUrl && (isPdf || isImage || isVideo));

  const addedLine = useMemo(() => {
    const addedBy = document?.addedBy ? `Добавил: ${document.addedBy}` : '';
    const addedAt = document?.addedAt ? `Дата: ${document.addedAt}` : '';
    const source = document?.source ? `Источник: ${document.source}` : '';
    return [addedBy, addedAt, source].filter(Boolean).join(' • ');
  }, [document]);

  return (
    <div className="document-viewer-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="document-viewer">
        <div className="viewer-header">
          <h3 className="viewer-title">{document?.name}</h3>
          <div className="viewer-actions">
            {previewUrl && (
              <a href={previewUrl} download className="viewer-btn" title="Скачать">
                ⬇ Скачать
              </a>
            )}
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

        <div className="viewer-content">
          {hasPreview ? (
            isPdf ? (
              <iframe src={previewUrl} title={document?.name} className="viewer-iframe" />
            ) : isVideo ? (
              <video
                className="viewer-video"
                src={previewUrl}
                controls
                playsInline
                preload="metadata"
              >
                Ваш браузер не поддерживает воспроизведение этого видео.
              </video>
            ) : (
              <img src={previewUrl} alt={document?.name} className="viewer-img" />
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

          {addedLine && (
            <div style={{ marginTop: 16, color: '#666', fontSize: 13 }}>
              {addedLine}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentViewer;

