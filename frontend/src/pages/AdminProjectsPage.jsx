import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ADMIN_TOKEN_KEY } from './AdminLoginPage';
import { adminApiUrl } from '../backendUrl';
import { useAdminAccess, isDocumentationUploadOnly } from '../hooks/useAdminAccess';

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
  const [uploadFile, setUploadFile] = useState(null);

  const [newTitle, setNewTitle] = useState('');
  const [pendingCreates, setPendingCreates] = useState([]);
  const [pendingUploads, setPendingUploads] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState('');

  const isDirty = pendingCreates.length > 0 || pendingUploads.length > 0;

  const fetchProjects = useCallback(async () => {
    if (!isAuthed) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch(adminApiUrl('/projects'), { headers: authHeaders });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка загрузки проектов');

      const list = Array.isArray(data) ? data : [];
      setProjects(list);

      // Выбираем первый видимый проект (или первый вообще)
      if (!selectedProjectId) {
        const first = list.find((p) => p.visible) || list[0] || null;
        setSelectedProjectId(first ? first.id : null);
      }
    } catch (e) {
      setError(e.message || 'Ошибка');
      setProjects([]);
      setSelectedProjectId(null);
      setDocs([]);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, selectedProjectId]);

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

  const addUploadToQueue = () => {
    setError('');
    if (!uploadFile) {
      setError('Выберите файл');
      return;
    }
    if (!selectedProjectId) {
      setError('Выберите проект');
      return;
    }
    setPendingUploads((prev) => [...prev, { projectId: selectedProjectId, file: uploadFile }]);
    setUploadFile(null);
  };

  const persistAll = async () => {
    if (!isDirty) return;
    setError('');
    setSaving(true);
    try {
      for (const title of pendingCreates) {
        const res = await fetch(adminApiUrl('/projects'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ title }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Ошибка создания проекта');
      }
      setPendingCreates([]);
      await fetchProjects();

      for (const { projectId, file } of pendingUploads) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(adminApiUrl(`/projects/${projectId}/files`), {
          method: 'POST',
          headers: { ...authHeaders },
          body: form,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Ошибка загрузки файла');
      }
      setPendingUploads([]);
      await fetchDocs();
      await fetchProjects();
    } catch (e) {
      setError(e.message || 'Ошибка');
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
      await fetchProjects();
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

  const selectedProject = projects.find((p) => p.id === selectedProjectId) || null;

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
            title="Сохранить создание проектов и загрузку файлов из очереди"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      <p className="admin-form-hint" style={{ marginBottom: 16 }}>
        Создание проектов и загрузка файлов попадают в очередь. Изменения на сервере — после нажатия «Сохранить» в шапке.
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

            {(pendingCreates.length > 0 || pendingUploads.length > 0) && (
              <div className="admin-projects-queue-hint">
                {pendingCreates.length > 0 && (
                  <p>
                    <strong>Очередь:</strong> создать проектов — {pendingCreates.length}
                    {pendingCreates.length <= 3 ? ` (${pendingCreates.join(', ')})` : ''}
                  </p>
                )}
                {pendingUploads.length > 0 && (
                  <p>
                    <strong>Очередь:</strong> загрузить файлов — {pendingUploads.length}
                  </p>
                )}
              </div>
            )}

            <div className="admin-projects-list">
              {projects.length === 0 ? (
                <p className="admin-news-empty">Проекты не найдены</p>
              ) : (
                projects.map((p) => (
                  <div
                    key={p.id}
                    className={`admin-news-row ${selectedProjectId === p.id ? 'admin-projects-row-active' : ''}`}
                    onClick={() => setSelectedProjectId(p.id)}
                    role="button"
                    tabIndex={0}
                  >
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

                <div className="admin-projects-upload">
                  <input
                    type="file"
                    className="admin-form-input"
                    accept=".pdf,.xlsx,.xls,.docx,.doc"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    disabled={saving}
                  />
                  <button
                    type="button"
                    className="admin-btn admin-btn-primary"
                    onClick={addUploadToQueue}
                    disabled={saving || !uploadFile}
                  >
                    ⬆ В очередь на загрузку
                  </button>
                </div>

                <div className="admin-projects-files">
                  <h3 className="news-title" style={{ marginBottom: 12 }}>Файлы в проекте</h3>
                  {docs.length === 0 ? (
                    <p className="admin-news-empty">Пока нет загруженных файлов</p>
                  ) : (
                    <div className="admin-news-list">
                      {docs.map((d) => (
                        <div key={d.id} className="admin-news-row">
                          <div className="admin-news-row-text">
                            <strong>{d.name}</strong>
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

