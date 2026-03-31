import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ADMIN_TOKEN_KEY } from './AdminLoginPage';
import { parseJsonResponse } from '../utils/parseJsonResponse';
import { backendUrl, adminApiUrl } from '../backendUrl';
import {
  useAdminAccess,
  isDocumentationUploadOnly,
  DOCUMENTATION_DYNAMIC_SLUG,
} from '../hooks/useAdminAccess';

const PREVIEW_EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];

function getAuthHeaders() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readFetchError(res) {
  const text = await res.text();
  try {
    const j = JSON.parse(text);
    if (j && typeof j.error === 'string' && j.error) return j.error;
  } catch (_) {}
  const trimmed = (text || '').trim();
  if (trimmed) return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
  return `HTTP ${res.status} ${res.statusText || ''}`.trim();
}

function buildFileUrl(slug, path, name) {
  const parts = path === '.' ? [name] : [path, name].filter(Boolean);
  return backendUrl(`/site-files/${encodeURIComponent(slug)}/${parts.join('/')}`);
}

function fullRelativePath(currentPath, name) {
  if (!name) return '';
  return currentPath === '.' ? name : `${currentPath}/${name}`;
}

function AdminDynamicDocsPage({ onOpenDocument }) {
  const { slug } = useParams();
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const isAuthed = Boolean(token);
  const access = useAdminAccess();
  const docUploadOnly = isDocumentationUploadOnly(access);
  const [path, setPath] = useState('.');
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(null);
  const [actionError, setActionError] = useState(null);

  const [pendingFolders, setPendingFolders] = useState([]);
  const [pendingUploads, setPendingUploads] = useState([]);
  const [pendingDeletes, setPendingDeletes] = useState([]);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadFile, setUploadFile] = useState(null);
  const [createError, setCreateError] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [saving, setSaving] = useState(false);

  const isDirty =
    pendingFolders.length > 0 || pendingUploads.length > 0 || pendingDeletes.length > 0;

  const refreshList = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      const res = await fetch(
        backendUrl(`/api/v1/site-sections/dynamic/${encodeURIComponent(slug)}/list?path=${encodeURIComponent(path)}`)
      );
      const data = await parseJsonResponse(res);
      if (data.error) {
        setListError(data.error);
        return;
      }
      setFolders(data.folders || []);
      setFiles(data.files || []);
    } catch (err) {
      setListError(err.message);
    } finally {
      setLoading(false);
    }
  }, [path, slug]);

  useEffect(() => {
    setActionError(null);
    void refreshList();
  }, [refreshList]);

  const displayFolders = useMemo(() => {
    const fromServer = (folders || []).filter((f) => {
      const rel = fullRelativePath(path, f.name);
      return !pendingDeletes.includes(rel);
    });
    const names = new Set(fromServer.map((f) => f.name));
    const extra = pendingFolders
      .filter((p) => p.path === path)
      .filter((p) => !pendingDeletes.includes(fullRelativePath(p.path, p.name)))
      .filter((p) => !names.has(p.name))
      .map((p) => ({ name: p.name, __pending: true }));
    return [...fromServer.map((f) => ({ ...f, __pending: false })), ...extra];
  }, [folders, path, pendingDeletes, pendingFolders]);

  const displayFiles = useMemo(() => {
    const fromServer = (files || []).filter((f) => {
      const rel = fullRelativePath(path, f.name);
      return !pendingDeletes.includes(rel);
    });
    const names = new Set(fromServer.map((f) => f.name));
    const extra = pendingUploads
      .filter((u) => u.path === path)
      .filter((u) => !pendingDeletes.includes(fullRelativePath(u.path, u.file.name)))
      .filter((u) => !names.has(u.file.name))
      .map((u) => ({
        name: u.file.name,
        file: u.file,
        objectUrl: u.objectUrl,
        __pending: true,
      }));
    return [...fromServer.map((f) => ({ ...f, __pending: false })), ...extra];
  }, [files, path, pendingDeletes, pendingUploads]);

  const persistAll = async () => {
    if (!isDirty) return;
    setActionError(null);
    setSaving(true);
    const deletesSnapshot = [...pendingDeletes];
    const foldersSnapshot = [...pendingFolders];
    const uploadsSnapshot = [...pendingUploads];
    try {
      const sortedDeletes = [...deletesSnapshot].sort((a, b) => b.length - a.length);
      const auth = getAuthHeaders();
      if (!auth.Authorization) {
        throw new Error('Нет токена админки. Войдите снова через «Админ-панель».');
      }
      for (const rel of sortedDeletes) {
        const res = await fetch(
          adminApiUrl(`/site-sections/dynamic/${encodeURIComponent(slug)}/item?path=${encodeURIComponent(rel)}`),
          {
          method: 'DELETE',
          headers: auth,
        }
        );
        if (!res.ok) throw new Error(`Удаление «${rel}»: ${await readFetchError(res)}`);
      }
      setPendingDeletes([]);

      const foldersSorted = [...foldersSnapshot].sort((a, b) => {
        const pa = a.path === '.' ? a.name : `${a.path}/${a.name}`;
        const pb = b.path === '.' ? b.name : `${b.path}/${b.name}`;
        return pa.split('/').length - pb.split('/').length;
      });
      for (const { path: p, name } of foldersSorted) {
        const res = await fetch(adminApiUrl(`/site-sections/dynamic/${encodeURIComponent(slug)}/folder`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ path: p, name }),
        });
        if (!res.ok) {
          throw new Error(`Папка «${name}» (${p}): ${await readFetchError(res)}`);
        }
      }
      setPendingFolders([]);

      for (const { path: p, file } of uploadsSnapshot) {
        const form = new FormData();
        form.append('path', p);
        form.append('file', file);
        const res = await fetch(adminApiUrl(`/site-sections/dynamic/${encodeURIComponent(slug)}/upload`), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: form,
        });
        if (!res.ok) {
          throw new Error(`Файл «${file.name}»: ${await readFetchError(res)}`);
        }
      }
      uploadsSnapshot.forEach((u) => {
        if (u.objectUrl) URL.revokeObjectURL(u.objectUrl);
      });
      setPendingUploads([]);

      await refreshList();
    } catch (err) {
      setActionError(err.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const applyFolderToQueue = (e) => {
    e.preventDefault();
    setCreateError('');
    if (!newFolderName.trim()) {
      setCreateError('Введите имя папки');
      return;
    }
    const name = newFolderName.trim();
    const dup =
      pendingFolders.some((p) => p.path === path && p.name === name) ||
      displayFolders.some((f) => f.name === name);
    if (dup) {
      setCreateError('Папка с таким именем уже есть или в очереди');
      return;
    }
    setPendingFolders((prev) => [...prev, { path, name }]);
    setNewFolderName('');
    setShowCreateFolder(false);
  };

  const applyUploadToQueue = (e) => {
    e.preventDefault();
    setUploadError('');
    if (!uploadFile) {
      setUploadError('Выберите файл');
      return;
    }
    const name = uploadFile.name;
    const dup =
      pendingUploads.some((u) => u.path === path && u.file.name === name) ||
      displayFiles.some((f) => f.name === name);
    if (dup) {
      setUploadError('Файл с таким именем уже есть или в очереди');
      return;
    }
    const objectUrl = URL.createObjectURL(uploadFile);
    setPendingUploads((prev) => [...prev, { path, file: uploadFile, objectUrl }]);
    setUploadFile(null);
    setShowUpload(false);
  };

  const handleDeleteClick = (rel, isFolder, isPending) => {
    if (isPending) {
      if (isFolder) {
        setPendingFolders((prev) => prev.filter((p) => fullRelativePath(p.path, p.name) !== rel));
      } else {
        setPendingUploads((prev) => {
          const u = prev.find((x) => fullRelativePath(x.path, x.file.name) === rel);
          if (u?.objectUrl) URL.revokeObjectURL(u.objectUrl);
          return prev.filter((x) => fullRelativePath(x.path, x.file.name) !== rel);
        });
      }
      return;
    }
    const label = isFolder ? 'папку' : 'файл';
    if (!window.confirm(`Удалить ${label} «${rel}»? Будет удалено после «Сохранить».`)) return;
    setPendingDeletes((prev) => (prev.includes(rel) ? prev : [...prev, rel]));
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

  const openPreview = (fileRow) => {
    const fileName = fileRow.name;
    const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
    let url;
    if (fileRow.__pending && fileRow.objectUrl) {
      url = fileRow.objectUrl;
    } else {
      url = buildFileUrl(slug, path, fileName);
    }
    if (onOpenDocument) {
      onOpenDocument({
        name: fileName,
        url,
        isSMK: true,
        ext,
      });
    }
  };

  const canPreview = (name) => {
    const ext = (name || '').split('.').pop()?.toLowerCase() || '';
    return PREVIEW_EXT.includes(ext);
  };

  if (!isAuthed) {
    return <Navigate to="/admin/login" replace />;
  }
  if (!slug) {
    return <Navigate to="/admin/sections" replace />;
  }
  if (access && access.role === 'hr') {
    return <Navigate to="/admin/sections" replace />;
  }
  if (
    access &&
    isDocumentationUploadOnly(access) &&
    String(slug).toLowerCase() !== DOCUMENTATION_DYNAMIC_SLUG
  ) {
    return <Navigate to="/admin/sections" replace />;
  }

  return (
    <div className="admin-news-page smk-page">
      <div className="admin-news-header">
        <h1 className="admin-news-title">Динамический раздел — /s/{slug}</h1>
        <div className="admin-news-actions">
          <Link to="/admin/sections" className="admin-btn admin-btn-secondary" style={{ textDecoration: 'none' }}>
            ← К разделам
          </Link>
          <Link to="/admin" className="admin-btn admin-btn-secondary" style={{ textDecoration: 'none' }}>
            Админ-панель
          </Link>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={persistAll}
            disabled={!isDirty || loading || saving}
            title="Отправить на сервер удаления, новые папки и файлы из очереди"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      <p className="admin-form-hint" style={{ marginTop: -8, marginBottom: 16 }}>
        Очередь папок и файлов, сохранение на сервер — кнопкой «Сохранить». Публичный просмотр:{' '}
        <strong>/s/{slug}</strong>.
      </p>

      <div className="smk-toolbar">
        <nav className="smk-breadcrumbs" aria-label="Навигация по папкам">
          <button type="button" className="smk-breadcrumb-item" onClick={() => setPath('.')}>
            {slug}
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
        <div className="smk-actions">
          <button
            type="button"
            className="smk-action-btn"
            disabled={saving}
            onClick={() => {
              setShowCreateFolder(true);
              setCreateError('');
              setNewFolderName('');
            }}
          >
            📁 Создать папку
          </button>
          <button
            type="button"
            className="smk-action-btn"
            disabled={saving}
            onClick={() => {
              setShowUpload(true);
              setUploadError('');
              setUploadFile(null);
            }}
          >
            ⬆ Загрузить документ
          </button>
        </div>
      </div>

      {loading && <p className="smk-page__loading">Загрузка…</p>}
      {listError && <p className="admin-news-error">{listError}</p>}
      {actionError && <p className="admin-news-error">{actionError}</p>}

      {!loading && !listError && (
        <div className="smk-content">
          <div className="smk-list">
            {displayFolders.map((f) => {
              const rel = fullRelativePath(path, f.name);
              return (
                <div key={`${rel}-folder`} className="smk-item smk-item--folder">
                  <button type="button" className="smk-item__link" onClick={() => openFolder(f.name)}>
                    <span className="smk-item__icon">📁</span>
                    {f.name}
                    {f.__pending && <span className="smk-pending-badge">очередь</span>}
                  </button>
                  {!docUploadOnly && (
                    <div className="smk-item__actions">
                      <button
                        type="button"
                        className="smk-item__btn smk-item__btn--danger"
                        disabled={saving}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(rel, true, f.__pending);
                        }}
                        title="Убрать из очереди или пометить на удаление"
                      >
                        🗑 Удалить
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
            {displayFiles.map((f) => {
              const fileName = f.name;
              const rel = fullRelativePath(path, fileName);
              const fileUrl = f.__pending && f.objectUrl ? f.objectUrl : buildFileUrl(slug, path, fileName);
              const showPreview = canPreview(fileName);
              return (
                <div key={`${rel}-file`} className="smk-item smk-item--file">
                  <span className="smk-item__icon smk-item__icon--file">📄</span>
                  <span className="smk-item__name">
                    {fileName}
                    {f.__pending && <span className="smk-pending-badge">очередь</span>}
                  </span>
                  <div className="smk-item__actions">
                    {showPreview && onOpenDocument && (
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
                      download={fileName}
                      className="smk-item__btn smk-item__btn--download"
                      title="Скачать"
                    >
                      ⬇ Скачать
                    </a>
                    {!docUploadOnly && (
                      <button
                        type="button"
                        className="smk-item__btn smk-item__btn--danger"
                        disabled={saving}
                        onClick={() => handleDeleteClick(rel, false, f.__pending)}
                        title="Убрать из очереди или пометить на удаление"
                      >
                        🗑 Удалить
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {displayFolders.length === 0 && displayFiles.length === 0 && (
              <p className="smk-page__empty">Папка пуста. Создайте папку или загрузите документ.</p>
            )}
          </div>
        </div>
      )}

      {showCreateFolder && (
        <div className="smk-modal-overlay" onClick={() => !saving && setShowCreateFolder(false)}>
          <div className="smk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="smk-modal-header">
              <h3>Создать папку</h3>
              <button type="button" className="viewer-btn viewer-close" onClick={() => !saving && setShowCreateFolder(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={applyFolderToQueue}>
              <label className="smk-modal-label">
                Имя папки
                <input
                  type="text"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  className="smk-modal-input"
                  placeholder="Новая папка"
                  autoFocus
                  disabled={saving}
                />
              </label>
              <p className="admin-form-hint" style={{ marginBottom: 8 }}>
                Папка попадёт в очередь; на сервер — после «Сохранить» в шапке.
              </p>
              {createError && <p className="smk-modal-error">{createError}</p>}
              <div className="smk-modal-actions">
                <button type="button" className="viewer-btn" onClick={() => setShowCreateFolder(false)} disabled={saving}>
                  Отмена
                </button>
                <button type="submit" className="viewer-btn viewer-btn-approve" disabled={saving}>
                  Применить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="smk-modal-overlay" onClick={() => !saving && setShowUpload(false)}>
          <div className="smk-modal" onClick={(e) => e.stopPropagation()}>
            <div className="smk-modal-header">
              <h3>Загрузить документ</h3>
              <button type="button" className="viewer-btn viewer-close" onClick={() => !saving && setShowUpload(false)}>
                ✕
              </button>
            </div>
            <form onSubmit={applyUploadToQueue}>
              <label className="smk-modal-label">
                Файл
                <input
                  type="file"
                  className="smk-modal-input"
                  disabled={saving}
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
                {uploadFile && <span className="smk-modal-filename">{uploadFile.name}</span>}
              </label>
              <p className="admin-form-hint" style={{ marginBottom: 8 }}>
                Файл попадёт в очередь; на сервер — после «Сохранить» в шапке.
              </p>
              {uploadError && <p className="smk-modal-error">{uploadError}</p>}
              <div className="smk-modal-actions">
                <button type="button" className="viewer-btn" onClick={() => setShowUpload(false)} disabled={saving}>
                  Отмена
                </button>
                <button type="submit" className="viewer-btn viewer-btn-approve" disabled={!uploadFile || saving}>
                  Применить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDynamicDocsPage;
