import React, { useState, useEffect, useCallback } from 'react';
import { Navigate, Link, useParams } from 'react-router-dom';
import { ADMIN_TOKEN_KEY } from './AdminLoginPage';
import { backendUrl, adminApiUrl } from '../backendUrl';

function getAuthHeaders() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Редактирование меню ссылок (лицензии или динамический multi_links). Сохранение — одним PUT. */
function AdminSectionMenuPage() {
  const { sectionId } = useParams();
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('Меню ссылок');

  const [formOpen, setFormOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [form, setForm] = useState({ title: '', url: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(backendUrl(`/api/v1/section-menus/${encodeURIComponent(sectionId)}`));
      if (!res.ok) throw new Error('Ошибка загрузки');
      const data = await res.json();
      setItems(Array.isArray(data) ? data : []);
      const secRes = await fetch(backendUrl(`/api/v1/site-sections`));
      if (secRes.ok) {
        const list = await secRes.json();
        const found = Array.isArray(list) ? list.find((s) => s.id === sectionId) : null;
        if (found?.title) setTitle(found.title);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [sectionId]);

  useEffect(() => {
    if (!token || !sectionId) return;
    load();
  }, [token, sectionId, load]);

  if (!token) return <Navigate to="/admin/login" replace />;
  if (!sectionId) return <Navigate to="/admin/sections" replace />;

  const openCreate = () => {
    setEditingIndex(null);
    setForm({ title: '', url: '' });
    setFormOpen(true);
  };

  const openEdit = (index) => {
    const it = items[index];
    setEditingIndex(index);
    setForm({ title: it.title || '', url: it.url || '' });
    setFormOpen(true);
  };

  const applyForm = () => {
    if (!form.title.trim() || !form.url.trim()) {
      setError('Укажите название и URL');
      return;
    }
    setError('');
    const nextId =
      items.length > 0 ? Math.max(0, ...items.map((x) => Number(x.id) || 0)) + 1 : 1;
    const row = {
      id: editingIndex !== null ? items[editingIndex].id : nextId,
      title: form.title.trim(),
      url: form.url.trim(),
    };
    if (editingIndex !== null) {
      setItems((prev) => prev.map((x, i) => (i === editingIndex ? row : x)));
    } else {
      setItems((prev) => [...prev, row]);
    }
    setFormOpen(false);
  };

  const remove = (index) => {
    if (!window.confirm('Удалить пункт?')) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (from, to) => {
    if (from === to) return;
    setItems((prev) => {
      const next = [...prev];
      const [m] = next.splice(from, 1);
      next.splice(to, 0, m);
      return next;
    });
  };

  const saveAll = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(adminApiUrl(`/section-menus/${encodeURIComponent(sectionId)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(items),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Ошибка сохранения');
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-news-page">
      <div className="admin-news-header">
        <h1 className="admin-news-title">{title}</h1>
        <div className="admin-news-actions">
          <Link to="/admin/sections" className="admin-btn admin-btn-secondary" style={{ textDecoration: 'none' }}>
            ← К разделам
          </Link>
          <button type="button" className="admin-btn admin-btn-primary" onClick={openCreate}>
            + Пункт
          </button>
          <button type="button" className="admin-btn admin-btn-primary" onClick={saveAll} disabled={saving || loading}>
            {saving ? 'Сохранение…' : 'Сохранить на сервер'}
          </button>
        </div>
      </div>
      {error && <p className="admin-news-error">{error}</p>}
      {loading ? (
        <p>Загрузка…</p>
      ) : (
        <div className="admin-news-list">
          {items.length === 0 ? (
            <p className="admin-news-empty">Пунктов нет</p>
          ) : (
            items.map((item, index) => (
              <div key={`${item.id}-${index}`} className="admin-news-row">
                <span
                  className="admin-news-row-drag"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', String(index))}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData('text/plain'));
                    if (Number.isFinite(from)) move(from, index);
                  }}
                  title="Перетащить"
                >
                  ⠿
                </span>
                <div className="admin-news-row-text">
                  <strong>{item.title}</strong>
                  <span className="admin-news-row-date">{item.url}</span>
                </div>
                <div className="admin-news-row-btns">
                  <button type="button" className="admin-btn admin-btn-small" onClick={() => openEdit(index)}>
                    Изменить
                  </button>
                  <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => remove(index)}>
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
          <div className="admin-news-modal-backdrop" onClick={() => setFormOpen(false)} />
          <div className="admin-news-modal-content">
            <h2 className="admin-news-modal-title">{editingIndex !== null ? 'Правка' : 'Новый пункт'}</h2>
            <label className="admin-form-label">
              Название
              <input className="admin-form-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </label>
            <label className="admin-form-label">
              URL
              <input className="admin-form-input" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} />
            </label>
            <div className="admin-news-modal-footer">
              <button type="button" className="admin-btn admin-btn-secondary" onClick={() => setFormOpen(false)}>
                Отмена
              </button>
              <button type="button" className="admin-btn admin-btn-primary" onClick={applyForm}>
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSectionMenuPage;
