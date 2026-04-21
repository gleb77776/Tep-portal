import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ADMIN_TOKEN_KEY } from './AdminLoginPage';
import { adminApiUrl } from '../backendUrl';
import { useAdminAccess, isDocumentationUploadOnly } from '../hooks/useAdminAccess';
import { filterProjectDocuments } from '../utils/projectDocumentsFilter';
import { moveItem } from '../utils/reorderArray';

function getAuthHeaders() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function AdminProjectsPage() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const isAuthed = Boolean(token);
  const authHeaders = useMemo(() => getAuthHeaders(), []);
  const access = useAdminAccess();
  const docUploadOnly = isDocumentationUploadOnly(access);

  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const [docs, setDocs] = useState([]);
  const [docSearch, setDocSearch] = useState('');

  const [newTitle, setNewTitle] = useState('');
  const [pendingCreates, setPendingCreates] = useState([]);
  const [pendingUploads, setPendingUploads] = useState([]);

  const [folderLink, setFolderLink] = useState('');
  const [diagramsFolderId, setDiagramsFolderId] = useState('');
  const [diagramsEnabled, setDiagramsEnabled] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

  const settingsDirty = useMemo(() => {
    if (!selectedProject) return false;
    const sameFolder = folderLink.trim() === String(selectedProject.folderLink || '').trim();
    const sameDiagFolder =
      diagramsFolderId.trim() === String(selectedProject.diagramsFolderId || '').trim();
    const serverDiag = selectedProject.diagramsEnabled !== false;
    const sameDiag = diagramsEnabled === serverDiag;
    return !sameFolder || !sameDiagFolder || !sameDiag;
  }, [selectedProject, folderLink, diagramsFolderId, diagramsEnabled]);

  const isDirty =
    pendingCreates.length > 0 || pendingUploads.length > 0 || settingsDirty;

  const fetchProjects = useCallback(async (opts = {}) => {
    const silent = opts.silent === true;
    if (!isAuthed) return;
    setError('');
    if (!silent) setLoading(true);
    try {
      const res = await fetch(adminApiUrl('/projects'), { headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки проектов');

      const list = Array.isArray(data) ? data : [];
      setProjects(list);

      // Выбираем первый видимый проект (или первый вообще)
      setSelectedProjectId((current) => {
        if (current) return current;
        const first = list.find((p) => p.visible) || list[0] || null;
        return first ? first.id : null;
      });
    } catch (e) {
      setError(e.message || 'Ошибка');
      setProjects([]);
      setSelectedProjectId(null);
      setDocs([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [authHeaders]);

  const fetchDocs = useCallback(async () => {
    if (!isAuthed || !selectedProjectId) return;
    setError('');
    try {
      const res = await fetch(adminApiUrl(`/projects/${selectedProjectId}/files`), { headers: authHeaders });
      const data = await res.json().catch(() => ([]));
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки файлов');
      setDocs(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Ошибка');
      setDocs([]);
    }
  }, [authHeaders, selectedProjectId]);

  useEffect(() => {
    if (isAuthed) fetchProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAuthed) fetchDocs();
  }, [fetchDocs]);

  useEffect(() => {
    setDocSearch('');
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedProject) {
      setFolderLink(selectedProject.folderLink || '');
      setDiagramsFolderId(selectedProject.diagramsFolderId || '');
      setDiagramsEnabled(selectedProject.diagramsEnabled !== false);
    } else {
      setFolderLink('');
      setDiagramsFolderId('');
      setDiagramsEnabled(true);
    }
  }, [selectedProject]);

  const filteredAdminDocs = useMemo(
    () => filterProjectDocuments(docs, { searchQuery: docSearch }),
    [docs, docSearch]
  );

  const addProjectToQueue = () => {
    setError('');
    const title = newTitle.trim();
    if (!title) {
      setError('Введите название проекта');
      return;
    }
    setPendingCreates((prev) => [...prev, title]);
    setNewTitle('');
  };

  /** Файл сразу попадает в очередь к «Сохранить» (отдельная кнопка не нужна). */
  const onFileSelected = (e) => {
    const file = e.target.files?.[0] || null;
    if (e.target) e.target.value = '';
    setError('');
    if (!file) return;
    if (!selectedProjectId) {
      setError('Сначала выберите проект слева');
      return;
    }
    setPendingUploads((prev) => [...prev, { projectId: selectedProjectId, file }]);
  };

  const persistAll = async () => {
    if (!isDirty) return;
    const needDocsRefresh = pendingUploads.length > 0;
    const settingsNeedSave = Boolean(selectedProjectId && settingsDirty);
    setError('');
    setSaving(true);
    try {
      if (pendingCreates.length > 0) {
        const createdItems = await Promise.all(
          pendingCreates.map(async (title) => {
            const res = await fetch(adminApiUrl('/projects'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders },
              body: JSON.stringify({ title }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Ошибка создания проекта');
            return data;
          })
        );
        setPendingCreates([]);
        setProjects((prev) => [...prev, ...createdItems]);
      }

      if (pendingUploads.length > 0) {
        await Promise.all(
          pendingUploads.map(async ({ projectId, file }) => {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch(adminApiUrl(`/projects/${projectId}/files`), {
              method: 'POST',
              headers: { ...authHeaders },
              body: form,
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Ошибка загрузки файла');
          })
        );
        setPendingUploads([]);
      }

      if (settingsNeedSave) {
        const res = await fetch(adminApiUrl(`/projects/${selectedProjectId}/settings`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            folderLink: folderLink.trim(),
            diagramsFolderId: diagramsFolderId.trim(),
            diagramsEnabled,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Ошибка сохранения настроек');
      }

      if (needDocsRefresh) await fetchDocs();
      await fetchProjects({ silent: true });
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const persistProjectOrder = async (nextList) => {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(adminApiUrl('/projects/reorder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ ids: nextList.map((p) => p.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Не удалось сохранить порядок');
      await fetchProjects({ silent: true });
    } catch (e) {
      setError(e.message || 'Ошибка');
      await fetchProjects({ silent: true });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleVisibility = async (projectId, visible) => {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(adminApiUrl(`/projects/${projectId}/visibility`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ visible }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка изменения видимости');
      await fetchProjects({ silent: true });
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDoc = async (docId) => {
    setError('');
    setSaving(true);
    try {
      const res = await fetch(adminApiUrl(`/projects/${selectedProjectId}/files/${docId}`), {
        method: 'DELETE',
        headers: authHeaders,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка удаления файла');
      await fetchDocs();
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthed) {
    return <Navigate to="/admin/login" replace />;
  }
  if (access && access.role !== 'administrator' && access.role !== 'documentation') {
    return <Navigate to="/admin/sections" replace />;
  }

  return (
    <div className="admin-news-page">
      <div className="admin-news-header">
        <h1 className="admin-news-title">Управление проектами</h1>
        <div className="admin-news-actions">
          <Link to="/admin/sections" className="admin-btn admin-btn-secondary" style={{ textDecoration: 'none' }}>
            ← К разделам
          </Link>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={persistAll}
            disabled={!isDirty || loading || saving}
            title="Отправить на сервер: новые проекты, файлы и настройки папки / диаграмм"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      <p className="admin-form-hint" style={{ marginBottom: 16 }}>
        Порядок в списке слева (перетаскивание за ⠿) сохраняется на сайте сразу. Новый проект — «+ В очередь», затем «Сохранить». Файлы и настройки папки / диаграмм — «Сохранить» в шапке.
        {!docUploadOnly && ' Показать/скрыть проект и удаление файла применяются сразу.'}
        {docUploadOnly && ' У роли «Документация» нет прав на скрытие проектов и удаление файлов.'}
      </p>

      {error && <p className="admin-news-error">{error}</p>}

      {loading ? (
        <p className="admin-news-loading">Загрузка...</p>
      ) : (
        <div className="admin-projects-layout">
          <div className="admin-projects-sidebar">
            <div className="admin-projects-create">
              <input
                type="text"
                className="admin-form-input"
                placeholder="Название нового проекта (например: 41 ТЭЦ)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                disabled={saving}
              />
              <button
                type="button"
                className="admin-btn admin-btn-primary"
                onClick={addProjectToQueue}
                disabled={saving}
              >
                + В очередь
              </button>
            </div>

            {(pendingCreates.length > 0 || pendingUploads.length > 0 || settingsDirty) && (
              <div className="admin-projects-queue-hint">
                {pendingCreates.length > 0 && (
                  <p>
                    <strong>К сохранению:</strong> создать проектов — {pendingCreates.length}
                    {pendingCreates.length <= 3 ? ` (${pendingCreates.join(', ')})` : ''}
                  </p>
                )}
                {pendingUploads.length > 0 && (
                  <p>
                    <strong>К сохранению:</strong> файлов — {pendingUploads.length}
                    {pendingUploads.length <= 5
                      ? ` (${pendingUploads.map((u) => u.file.name).join(', ')})`
                      : ''}
                  </p>
                )}
                {settingsDirty && (
                  <p>
                    <strong>К сохранению:</strong> настройки проекта (папка / диаграммы)
                  </p>
                )}
              </div>
            )}

            <div className="admin-projects-list">
              {projects.length === 0 ? (
                <p className="admin-news-empty">Проекты не найдены</p>
              ) : (
                projects.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`admin-news-row ${selectedProjectId === p.id ? 'admin-projects-row-active' : ''}`}
                    onClick={() => setSelectedProjectId(p.id)}
                    role="button"
                    tabIndex={0}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
                      if (Number.isNaN(from) || from === idx) return;
                      const next = moveItem(projects, from, idx);
                      setProjects(next);
                      void persistProjectOrder(next);
                    }}
                  >
                    <span
                      className="admin-news-row-drag"
                      draggable={!saving}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('text/plain', String(idx));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title="Перетащите, чтобы изменить порядок на сайте"
                      aria-label="Изменить порядок"
                    >
                      ⠿
                    </span>
                    <div className="admin-news-row-text">
                      <strong>{p.title}</strong>
                      <span className="admin-news-row-date">
                        {p.author ? `Добавил: ${p.author}` : (p.source === 'diagrams' ? 'PDMS' : '')}
                      </span>
                    </div>
                    {!docUploadOnly && (
                      <div className="admin-news-row-btns">
                        <button
                          type="button"
                          className={`admin-btn admin-btn-small ${p.visible ? 'admin-btn-secondary' : 'admin-btn-primary'}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleVisibility(p.id, !p.visible);
                          }}
                          disabled={saving}
                          title="Показать/скрыть"
                        >
                          {p.visible ? 'Скрыть' : 'Показать'}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="admin-projects-content">
            {!selectedProject ? (
              <p className="admin-news-empty">Выберите проект слева</p>
            ) : (
              <>
                <h2 className="page-title" style={{ marginBottom: 16 }}>
                  {selectedProject.title}
                </h2>
                <p className="admin-news-loading" style={{ marginTop: -8, marginBottom: 16 }}>
                  {selectedProject.author ? `Добавил: ${selectedProject.author}` : (selectedProject.source === 'diagrams' ? 'PDMS' : '')}
                </p>

                <div className="admin-projects-settings">
                  <h3 className="admin-projects-settings__title news-title">
                    Ссылка на папку и диаграммы
                  </h3>
                  <label className="admin-projects-settings__label admin-form-label">
                    Папка проекта в файловой системе / сети
                  </label>
                  <input
                    type="text"
                    className="admin-form-input admin-projects-settings__input"
                    value={folderLink}
                    onChange={(e) => setFolderLink(e.target.value)}
                    placeholder="Необязательно"
                    disabled={saving}
                    autoComplete="off"
                  />
                  <label className="admin-projects-settings__label admin-form-label">
                    Папка диаграмм PDMS на сервере (если не совпадает с id проекта)
                  </label>
                  <input
                    type="text"
                    className="admin-form-input admin-projects-settings__input"
                    value={diagramsFolderId}
                    onChange={(e) => setDiagramsFolderId(e.target.value)}
                    placeholder="Например: 141N50_Svobodnenskaya для проекта 141"
                    disabled={saving}
                    autoComplete="off"
                  />
                  <p className="admin-form-hint" style={{ marginTop: 4, marginBottom: 12 }}>
                    Совпадает с именем подпапки в data/diagrams (выгрузка из PDMS). Оставьте пустым, если id проекта
                    совпадает с именем папки.
                  </p>
                  <label className="admin-projects-settings__checkbox-label admin-form-label">
                    <input
                      type="checkbox"
                      checked={diagramsEnabled}
                      onChange={(e) => setDiagramsEnabled(e.target.checked)}
                      disabled={saving}
                    />
                    Показывать на сайте раздел «Диаграммы» (PDMS)
                  </label>
                </div>

                <div className="admin-projects-doc-search" style={{ marginBottom: 16 }}>
                  <label className="admin-form-label" style={{ display: 'block', marginBottom: 6 }}>
                    Поиск по названию
                  </label>
                  <input
                    type="search"
                    className="admin-form-input"
                    placeholder="Фрагмент названия или имени файла…"
                    value={docSearch}
                    onChange={(e) => setDocSearch(e.target.value)}
                    autoComplete="off"
                    disabled={saving}
                    style={{ maxWidth: 480 }}
                  />
                </div>

                <div className="admin-projects-upload">
                  <label className="admin-form-hint" style={{ display: 'block', marginBottom: 8 }}>
                    Выберите файл — он будет добавлен к отправке; загрузка на сервер после «Сохранить» в шапке.
                  </label>
                  <input
                    type="file"
                    className="admin-form-input"
                    accept=".pdf,.xlsx,.xls,.docx,.doc"
                    onChange={onFileSelected}
                    disabled={saving}
                  />
                </div>

                <div className="admin-projects-files">
                  <h3 className="news-title" style={{ marginBottom: 12 }}>Файлы в проекте</h3>
                  {docs.length === 0 ? (
                    <p className="admin-news-empty">Пока нет загруженных файлов</p>
                  ) : filteredAdminDocs.length === 0 ? (
                    <p className="admin-news-empty">Ничего не найдено по поиску или фильтру</p>
                  ) : (
                    <div className="admin-news-list">
                      {filteredAdminDocs.map((d) => (
                        <div key={d.id} className="admin-news-row">
                          <div className="admin-news-row-text">
                            <strong title={d.name}>{d.name}</strong>
                            <span className="admin-news-row-date">
                              {d.addedBy ? `Добавил: ${d.addedBy}` : ''}{d.addedAt ? ` • ${d.addedAt}` : ''}
                            </span>
                          </div>
                          <div className="admin-news-row-btns">
                            {d.url && (
                              <a
                                className="admin-btn admin-btn-small admin-btn-secondary"
                                href={d.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Открыть
                              </a>
                            )}
                            {!docUploadOnly && (
                              <button
                                type="button"
                                className="admin-btn admin-btn-small admin-btn-danger"
                                onClick={() => handleDeleteDoc(d.id)}
                                disabled={saving}
                              >
                                Удалить
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminProjectsPage;

