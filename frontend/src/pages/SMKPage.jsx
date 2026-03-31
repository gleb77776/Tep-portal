import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { parseJsonResponse } from '../utils/parseJsonResponse';
import { backendUrl } from '../backendUrl';

const PREVIEW_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

function canManageSMK(department) {
  if (!department) return false;
  const d = department.toLowerCase();
  return d.includes('ит') || d.includes('исуп') || d.includes('руковод');
}

function buildFileUrl(path, name) {
  const parts = path === '.' ? [name] : [path, name].filter(Boolean);
  return `/smk/files/${parts.join('/')}`;
}

function SMKPage({ onOpenDocument, userData }) {
  const [path, setPath] = useState('.');
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [createError, setCreateError] = useState('');
  const [uploadError, setUploadError] = useState('');

  const canManage = canManageSMK(userData?.department);

  const refreshList = () => {
    setLoading(true);
    fetch(backendUrl(`/api/v1/smk/list?path=${encodeURIComponent(path)}`))
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
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(backendUrl(`/api/v1/smk/list?path=${encodeURIComponent(path)}`))
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

  const handleCreateFolder = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!newFolderName.trim()) {
      setCreateError('Введите имя папки');
      return;
    }
    try {
      const res = await fetch(backendUrl('/api/v1/smk/folder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, name: newFolderName.trim() }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        setCreateError(data.error || 'Ошибка создания папки');
        return;
      }
      setNewFolderName('');
      setShowCreateFolder(false);
      refreshList();
    } catch (err) {
      setCreateError(err.message || 'Ошибка сети');
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploadError('');
    if (!uploadFile) {
      setUploadError('Выберите файл');
      return;
    }
    try {
      const form = new FormData();
      form.append('path', path);
      form.append('file', uploadFile);
      const res = await fetch(backendUrl('/api/v1/smk/upload'), {
        method: 'POST',
        body: form,
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        setUploadError(data.error || 'Ошибка загрузки');
        return;
      }
      setUploadFile(null);
      setShowUpload(false);
      refreshList();
    } catch (err) {
      setUploadError(err.message || 'Ошибка сети');
    }
  };

  const breadcrumbs = path === '.' ? [] : path.split('/').filter(Boolean);

  const goToFolder = (segment) => {
    const idx = breadcrumbs.indexOf(segment);
    if (idx === -1) return;
    setPath(breadcrumbs.slice(0, idx + 1).join('/'));
  };

  const openFolder = (name) => {
    setPath(path === '.' ? name : `${path}/${name}`);
  };

  const openPreview = (file) => {
    const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
    const url = buildFileUrl(path, file.name);
    onOpenDocument({
      name: file.name,
      url,
      isSMK: true,
      ext,
    });
  };

  const canPreview = (name) => {
    const ext = (name || '').split('.').pop()?.toLowerCase() || '';
    return PREVIEW_EXT.includes(ext);
  };

  return (
    <div className="smk-page">
      <Link to="/" className="back-to-main-button">
        ← На главную
      </Link>
      <h1 className="smk-page__title">СМК — Документы системы менеджмента качества</h1>

      <div className="smk-toolbar">
        <nav className="smk-breadcrumbs" aria-label="Навигация по папкам">
          <button
            type="button"
            className="smk-breadcrumb-item"
            onClick={() => setPath('.')}
          >
            СМК
          </button>
          {breadcrumbs.map((seg) => (
            <React.Fragment key={seg}>
              <span className="smk-breadcrumb-sep">/</span>
              <button
                type="button"
                className="smk-breadcrumb-item"
                onClick={() => goToFolder(seg)}
              >
                {seg}
              </button>
            </React.Fragment>
          ))}
        </nav>
        {canManage && (
          <div className="smk-actions">
            <button
              type="button"
              className="smk-action-btn"
              onClick={() => { setShowCreateFolder(true); setCreateError(''); setNewFolderName(''); }}
            >
              📁 Создать папку
            </button>
            <button
              type="button"
              className="smk-action-btn"
              onClick={() => { setShowUpload(true); setUploadError(''); setUploadFile(null); }}
            >
              ⬆ Загрузить документ
            </button>
          </div>
        )}
      </div>

      {loading && <p className="smk-page__loading">Загрузка…</p>}
      {error && <p className="smk-page__error">Ошибка: {error}</p>}

      {!loading && !error && (
        <div className="smk-content">
          <div className="smk-list">
            {folders.map((f) => (
              <div key={f.name} className="smk-item smk-item--folder">
                <button
                  type="button"
                  className="smk-item__link"
                  onClick={() => openFolder(f.name)}
                >
                  <span className="smk-item__icon">📁</span>
                  {f.name}
                </button>
              </div>
            ))}
            {files.map((f) => {
              const fileUrl = buildFileUrl(path, f.name);
              const showPreview = canPreview(f.name);
              return (
                <div key={f.name} className="smk-item smk-item--file">
                  <span className="smk-item__icon smk-item__icon--file">📄</span>
                  <span className="smk-item__name">{f.name}</span>
                  <div className="smk-item__actions">
                    {showPreview && (
                      <button
                        type="button"
                        className="smk-item__btn"
                        onClick={() => openPreview(f)}
                        title="Предпросмотр"
                      >
                        👁 Просмотр
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
                Папка пуста.
                {canManage ? ' Создайте папку или загрузите документ.' : ' Добавьте документы в data/smk.'}
              </p>
            )}
          </div>
        </div>
      )}

      {showCreateFolder && (
        <div className="smk-modal-overlay" onClick={() => setShowCreateFolder(false)}>
          <div className="smk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="smk-modal-header">
              <h3>Создать папку</h3>
              <button type="button" className="viewer-btn viewer-close" onClick={() => setShowCreateFolder(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateFolder}>
              <label className="smk-modal-label">
                Имя папки
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="smk-modal-input"
                  placeholder="Новая папка"
                  autoFocus
                />
              </label>
              {createError && <p className="smk-modal-error">{createError}</p>}
              <div className="smk-modal-actions">
                <button type="button" className="viewer-btn" onClick={() => setShowCreateFolder(false)}>Отмена</button>
                <button type="submit" className="viewer-btn viewer-btn-approve">Создать</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="smk-modal-overlay" onClick={() => setShowUpload(false)}>
          <div className="smk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="smk-modal-header">
              <h3>Загрузить документ</h3>
              <button type="button" className="viewer-btn viewer-close" onClick={() => setShowUpload(false)}>✕</button>
            </div>
            <form onSubmit={handleUpload}>
              <label className="smk-modal-label">
                Файл
                <input
                  type="file"
                  className="smk-modal-input"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
                {uploadFile && <span className="smk-modal-filename">{uploadFile.name}</span>}
              </label>
              {uploadError && <p className="smk-modal-error">{uploadError}</p>}
              <div className="smk-modal-actions">
                <button type="button" className="viewer-btn" onClick={() => setShowUpload(false)}>Отмена</button>
                <button type="submit" className="viewer-btn viewer-btn-approve" disabled={!uploadFile}>Загрузить</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SMKPage;
