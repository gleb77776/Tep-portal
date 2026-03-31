import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { parseJsonResponse } from '../utils/parseJsonResponse';
import { backendUrl } from '../backendUrl';

const PREVIEW_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov'];

function buildFileUrl(path, name) {
  const parts = path === '.' ? [name] : [path, name].filter(Boolean);
  return backendUrl(`/training/files/${parts.join('/')}`);
}

function fileExt(name) {
  return (name || '').split('.').pop()?.toLowerCase() || '';
}

function isVideoFile(name) {
  return VIDEO_EXT.includes(fileExt(name));
}

function canPreviewDoc(name) {
  return PREVIEW_EXT.includes(fileExt(name));
}

/** Публичный раздел «Записи с программ обучения»: документы и видео — просмотр на сайте и скачивание. */
function TrainingPage({ onOpenDocument }) {
  const [path, setPath] = useState('.');
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(backendUrl(`/api/v1/training/list?path=${encodeURIComponent(path)}`))
      .then((res) => parseJsonResponse(res))
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setFolders(data.folders || []);
        setFiles(data.files || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [path]);

  const breadcrumbs = path === '.' ? [] : path.split('/').filter(Boolean);

  const goToFolder = (segment) => {
    const idx = breadcrumbs.indexOf(segment);
    if (idx === -1) return;
    setPath(breadcrumbs.slice(0, idx + 1).join('/'));
  };

  const openFolder = (name) => {
    setPath(path === '.' ? name : `${path}/${name}`);
  };

  const openInViewer = (file) => {
    const ext = fileExt(file.name);
    const url = buildFileUrl(path, file.name);
    onOpenDocument({
      name: file.name,
      url,
      isSMK: true,
      ext,
      isVideo: isVideoFile(file.name),
    });
  };

  return (
    <div className="smk-page">
      <Link to="/" className="back-to-main-button">
        ← На главную
      </Link>
      <h1 className="smk-page__title">Записи с программ обучения</h1>
      <p className="smk-page__lead" style={{ marginTop: -8, marginBottom: 12, opacity: 0.9 }}>
        Материалы обучения: документы и видео. Видео можно смотреть в браузере или скачать.
      </p>

      <div className="smk-toolbar">
        <nav className="smk-breadcrumbs" aria-label="Навигация по папкам">
          <button type="button" className="smk-breadcrumb-item" onClick={() => setPath('.')}>
            Записи с программ обучения
          </button>
          {breadcrumbs.map((seg) => (
            <React.Fragment key={seg}>
              <span className="smk-breadcrumb-sep">/</span>
              <button type="button" className="smk-breadcrumb-item" onClick={() => goToFolder(seg)}>
                {seg}
              </button>
            </React.Fragment>
          ))}
        </nav>
      </div>

      {loading && <p className="smk-page__loading">Загрузка…</p>}
      {error && <p className="smk-page__error">Ошибка: {error}</p>}

      {!loading && !error && (
        <div className="smk-content">
          <div className="smk-list">
            {folders.map((f) => (
              <div key={f.name} className="smk-item smk-item--folder">
                <button type="button" className="smk-item__link" onClick={() => openFolder(f.name)}>
                  <span className="smk-item__icon">📁</span>
                  {f.name}
                </button>
              </div>
            ))}
            {files.map((f) => {
              const fileUrl = buildFileUrl(path, f.name);
              const video = isVideoFile(f.name);
              const docPreview = canPreviewDoc(f.name);
              const canOpen = video || docPreview;
              return (
                <div key={f.name} className="smk-item smk-item--file">
                  <span className="smk-item__icon smk-item__icon--file">{video ? '🎬' : '📄'}</span>
                  <span className="smk-item__name">{f.name}</span>
                  <div className="smk-item__actions">
                    {canOpen && onOpenDocument && (
                      <button
                        type="button"
                        className="smk-item__btn"
                        onClick={() => openInViewer(f)}
                        title={video ? 'Воспроизвести' : 'Предпросмотр'}
                      >
                        {video ? '▶ Смотреть' : '👁 Просмотр'}
                      </button>
                    )}
                    <a
                      href={fileUrl}
                      download={f.name}
                      className="smk-item__btn smk-item__btn--download"
                      title="Скачать"
                    >
                      ⬇ Скачать
                    </a>
                  </div>
                </div>
              );
            })}
            {folders.length === 0 && files.length === 0 && (
              <p className="smk-page__empty">
                Пока нет материалов. Загрузка и папки — в админ-панели: «Редактирование разделов» → «Записи с программ обучения».
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TrainingPage;
