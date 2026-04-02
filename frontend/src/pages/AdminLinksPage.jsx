import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ADMIN_TOKEN_KEY } from './AdminLoginPage';
import { backendUrl, adminApiUrl } from '../backendUrl';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { canEditNewsAndLinks } from '../utils/adminRoleAccess';

function getAuthHeaders() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isNewId(id) {
  return typeof id === 'string' && id.startsWith('new-');
}

function AdminLinksPage() {
  const [links, setLinks] = useState([]);
  const [deletedIds, setDeletedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', url: '' });
  const access = useAdminAccess();

  const fetchLinks = useCallback(async () => {
    if (!access || !canEditNewsAndLinks(access)) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(backendUrl('/api/v1/links'));
      if (!res.ok) throw new Error('Ошибка загрузки');
      const data = await res.json();
      setLinks(Array.isArray(data) ? data : []);
      setDeletedIds(new Set());
      setIsDirty(false);
    } catch (e) {
      setError(e.message);
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [access]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  if (!access) return <p>Загрузка…</p>;
  if (!canEditNewsAndLinks(access)) {
    return <Navigate to="/admin" replace />;
  }

  const openCreate = () => {
    if (links.length >= 13) {
      setError('Максимум 13 ссылок');
      return;
    }
    setEditingId(null);
    setForm({ name: '', url: '' });
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({ name: item.name || '', url: item.url || '' });
    setFormOpen(true);
  };

  const closeForm = () => {
    setEditingId(null);
    setFormOpen(false);
  };

  const applyFormToDraft = () => {
    if (!form.name.trim()) {
      setError('Введите текст ссылки');
      return;
    }
    if (!form.url.trim()) {
      setError('Введите URL');
      return;
    }
    setError('');
    const payload = { name: form.name.trim(), url: form.url.trim() };
    if (editingId !== null) {
      setLinks((prev) => prev.map((l) => (l.id === editingId ? { ...l, ...payload } : l)));
    } else {
      setLinks((prev) => [...prev, { ...payload, id: `new-${Date.now()}` }]);
    }
    setIsDirty(true);
    closeForm();
  };

  const moveItem = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setLinks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setIsDirty(true);
  };

  const remove = (id) => {
    if (!window.confirm('Удалить эту ссылку?')) return;
    setLinks((prev) => prev.filter((l) => l.id !== id));
    if (typeof id === 'number') setDeletedIds((prev) => new Set([...prev, id]));
    if (editingId === id) closeForm();
    setIsDirty(true);
  };

  const persistAll = async () => {
    setError('');
    setSaving(true);
    try {
      for (const id of deletedIds) {
        const res = await fetch(adminApiUrl(`/links/${id}`), { method: 'DELETE', headers: getAuthHeaders() });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Ошибка удаления');
        }
      }
      setDeletedIds(new Set());

      for (const item of links) {
        if (typeof item.id === 'number' && item.id > 0) {
          const res = await fetch(adminApiUrl(`/links/${item.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify({ name: item.name, url: item.url }),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || 'Ошибка сохранения');
          }
        }
      }

      const newItems = links.filter((l) => isNewId(l.id));
      const idMap = {};
      for (const item of newItems) {
        const res = await fetch(adminApiUrl('/links'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ name: item.name, url: item.url }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Ошибка создания');
        }
        const created = await res.json();
        idMap[item.id] = created.id;
      }

      const order = links.map((l) => (isNewId(l.id) ? idMap[l.id] : l.id)).filter(Boolean);
      if (order.length > 0) {
        const res = await fetch(adminApiUrl('/links/reorder'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ ids: order }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Ошибка порядка');
        }
      }
      setIsDirty(false);
      const res = await fetch(backendUrl('/api/v1/links'));
      if (res.ok) {
        const data = await res.json();
        setLinks(Array.isArray(data) ? data : []);
      }
      setDeletedIds(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-news-page">
      <div className="admin-news-header">
        <h1 className="admin-news-title">Управление Полезными ссылками</h1>
        <div className="admin-news-actions">
          <Link to="/admin" className="admin-btn admin-btn-secondary" style={{ textDecoration: 'none' }}>
            ← Назад
          </Link>
          <button type="button" className="admin-btn admin-btn-primary" onClick={openCreate}>
            + Добавить ссылку
          </button>
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            onClick={persistAll}
            disabled={!isDirty || loading || saving}
            title="Сохранить все изменения (порядок, правки, удаления)"
          >
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>

      {error && <p className="admin-news-error">{error}</p>}

      {loading ? (
        <p className="admin-news-loading">Загрузка...</p>
      ) : (
        <div className="admin-news-list">
          {links.length === 0 ? (
            <p className="admin-news-empty">Ссылок пока нет. Добавьте первую.</p>
          ) : (
            links.map((item, index) => (
              <div key={item.id} className="admin-news-row">
                <span
                  className="admin-news-row-drag"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', String(index));
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData('text/plain'));
                    if (Number.isFinite(from)) moveItem(from, index);
                  }}
                  title="Перетащите, чтобы изменить порядок"
                  aria-label="Перетащить"
                >
                  ⠿
                </span>
                <div className="admin-news-row-text">
                  <strong>{item.name}</strong>
                  <span className="admin-news-row-date">{item.url}</span>
                </div>
                <div className="admin-news-row-btns">
                  <button type="button" className="admin-btn admin-btn-small" onClick={() => openEdit(item)}>
                    Изменить
                  </button>
                  <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => remove(item.id)}>
                    Удалить
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {formOpen && (
        <div className="admin-news-modal">
          <div className="admin-news-modal-backdrop" onClick={closeForm} />
          <div className="admin-news-modal-content">
            <h2 className="admin-news-modal-title">{editingId !== null ? 'Редактировать ссылку' : 'Новая ссылка'}</h2>
            <p className="admin-form-hint" style={{ marginBottom: 12 }}>Изменения применятся после нажатия «Сохранить» в шапке.</p>

            <label className="admin-form-label">
              Текст ссылки *
              <input
                type="text"
                className="admin-form-input"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Например: Внешний сайт ТЭП"
              />
            </label>

            <label className="admin-form-label">
              URL *
              <input
                type="text"
                className="admin-form-input"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://... или file://..."
              />
            </label>

            <div className="admin-news-modal-footer">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={closeForm}>
                Отмена
              </button>
              <button type="button" className="admin-btn admin-btn-primary" onClick={applyFormToDraft}>
                Применить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminLinksPage;
