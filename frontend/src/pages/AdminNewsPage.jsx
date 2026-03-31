import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { ADMIN_TOKEN_KEY } from './AdminLoginPage';
import { EMOJI_SUGGESTIONS } from '../data/emojiSuggestions';
import { backendUrl } from '../backendUrl';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { canEditNewsAndLinks } from '../utils/adminRoleAccess';

function getAuthHeaders() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isNewId(id) {
  return typeof id === 'string' && id.startsWith('new-');
}

function AdminNewsPage() {
  const [news, setNews] = useState([]);
  const [deletedIds, setDeletedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ icon: '📄', title: '', date: '', badge: '' });
  const access = useAdminAccess();

  const fetchNews = useCallback(async () => {
    if (!access || !canEditNewsAndLinks(access)) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(backendUrl('/api/v1/news'));
      if (!res.ok) throw new Error('Ошибка загрузки');
      const data = await res.json();
      setNews(Array.isArray(data) ? data : []);
      setDeletedIds(new Set());
      setIsDirty(false);
    } catch (e) {
      setError(e.message);
      setNews([]);
    } finally {
      setLoading(false);
    }
  }, [access]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  if (!access) return <p>Загрузка…</p>;
  if (!canEditNewsAndLinks(access)) {
    return <Navigate to="/admin" replace />;
  }

  const openCreate = () => {
    setEditingId(null);
    setForm({
      icon: '📄',
      title: '',
      date: new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) + ' г. • ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      badge: '',
    });
    setFormOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      icon: item.icon || '📄',
      title: item.title || '',
      date: item.date || '',
      badge: item.badge || '',
    });
    setFormOpen(true);
  };

  const closeForm = () => {
    setEditingId(null);
    setFormOpen(false);
  };

  const applyFormToDraft = () => {
    if (!form.title.trim()) {
      setError('Введите текст новости');
      return;
    }
    if (form.title.trim().length > 500) {
      setError('Максимум 500 символов');
      return;
    }
    setError('');
    const payload = {
      icon: form.icon || '📄',
      title: form.title.trim(),
      date: form.date.trim() || new Date().toLocaleDateString('ru-RU'),
      badge: form.badge?.trim() || null,
    };
    if (payload.badge === '') payload.badge = null;

    if (editingId !== null) {
      setNews((prev) => prev.map((n) => (n.id === editingId ? { ...n, ...payload } : n)));
    } else {
      setNews((prev) => [...prev, { ...payload, id: `new-${Date.now()}` }]);
    }
    setIsDirty(true);
    closeForm();
  };

  const moveItem = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    setNews((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setIsDirty(true);
  };

  const remove = (id) => {
    if (!window.confirm('Удалить эту новость?')) return;
    setNews((prev) => prev.filter((n) => n.id !== id));
    if (typeof id === 'number') setDeletedIds((prev) => new Set([...prev, id]));
    if (editingId === id) closeForm();
    setIsDirty(true);
  };

  const persistAll = async () => {
    setError('');
    setSaving(true);
    try {
      for (const id of deletedIds) {
        const res = await fetch(adminApiUrl(`/news/${id}`), { method: 'DELETE', headers: getAuthHeaders() });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Ошибка удаления');
        }
      }
      setDeletedIds(new Set());

      for (const item of news) {
        if (typeof item.id === 'number' && item.id > 0) {
          const payload = { icon: item.icon, title: item.title, date: item.date, badge: item.badge };
          const res = await fetch(adminApiUrl(`/news/${item.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
            body: JSON.stringify(payload),
          });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || 'Ошибка сохранения');
          }
        }
      }

      const newItems = news.filter((n) => isNewId(n.id));
      const idMap = {};
      for (const item of newItems) {
        const res = await fetch(adminApiUrl('/news'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({ icon: item.icon, title: item.title, date: item.date, badge: item.badge }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          throw new Error(d.error || 'Ошибка создания');
        }
        const created = await res.json();
        idMap[item.id] = created.id;
      }

      const order = news.map((n) => (isNewId(n.id) ? idMap[n.id] : n.id)).filter(Boolean);
      if (order.length > 0) {
        const res = await fetch(adminApiUrl('/news/reorder'), {
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
      const res = await fetch(backendUrl('/api/v1/news'));
      if (res.ok) {
        const data = await res.json();
        setNews(Array.isArray(data) ? data : []);
      }
      setDeletedIds(new Set());
    } catch (e) {
      const msg = e.message || '';
      setError(msg.includes('too long') ? 'Максимум 500 символов. Перезапустите бэкенд (go run .), если видите «max 200».' : msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-news-page">
      <div className="admin-news-header">
        <h1 className="admin-news-title">Управление новостями</h1>
        <div className="admin-news-actions">
          <Link to="/admin" className="admin-btn admin-btn-secondary" style={{ textDecoration: 'none' }}>
            ← Назад
          </Link>
          <button type="button" className="admin-btn admin-btn-primary" onClick={openCreate}>
            + Добавить новость
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
          {news.length === 0 ? (
            <p className="admin-news-empty">Новостей пока нет. Добавьте первую.</p>
          ) : (
            news.map((item, index) => (
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
                <span className="admin-news-row-icon">{item.icon}</span>
                <div className="admin-news-row-text">
                  <strong>{item.title}</strong>
                  <span className="admin-news-row-date">{item.date}</span>
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
            <h2 className="admin-news-modal-title">{editingId !== null ? 'Редактировать новость' : 'Новая новость'}</h2>
            <p className="admin-form-hint" style={{ marginBottom: 12 }}>Изменения применятся после нажатия «Сохранить» в шапке.</p>

            <label className="admin-form-label">Смайлик (слева у новости)</label>
            <div className="admin-emoji-picker">
              {EMOJI_SUGGESTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`admin-emoji-btn ${form.icon === emoji ? 'active' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, icon: emoji }))}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <p className="admin-form-hint">Выберите смайлик из предложенных</p>

            <label className="admin-form-label">
              Текст новости *
              <input
                type="text"
                className="admin-form-input"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Текст новости"
                maxLength={500}
              />
            </label>
            <p className="admin-form-hint">{(form.title || '').length}/500</p>

            <label className="admin-form-label">
              Дата
              <input
                type="text"
                className="admin-form-input"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                placeholder="26 января 2026 г. • 14:38"
              />
            </label>

            <label className="admin-form-label">
              Бейдж (например New)
              <input
                type="text"
                className="admin-form-input"
                value={form.badge}
                onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                placeholder="New"
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

export default AdminNewsPage;
