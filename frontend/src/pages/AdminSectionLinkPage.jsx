import React, { useState, useEffect, useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ADMIN_TOKEN_KEY } from './AdminLoginPage';
import { backendUrl, adminApiUrl } from '../backendUrl';
import { parseJsonResponse } from '../utils/parseJsonResponse';
import {
  SECTION_CARD_LINK_KEYS,
  SECTION_CARD_LINK_LABELS,
} from '../utils/sectionCardLinks';

function getAuthHeaders() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function AdminSectionLinkPage() {
  const { key } = useParams();
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const isAuthed = Boolean(token);

  const validKey = useMemo(() => SECTION_CARD_LINK_KEYS.includes(key), [key]);
  const sectionTitle = SECTION_CARD_LINK_LABELS[key] || key;

  const [allLinks, setAllLinks] = useState(null);
  const [newUrl, setNewUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!validKey || !isAuthed) return;
    setLoading(true);
    setError('');
    fetch(backendUrl('/api/v1/section-card-links'))
      .then((res) => parseJsonResponse(res))
      .then((data) => {
        setAllLinks(data);
        const cur = data[key];
        if (typeof cur === 'string') setNewUrl(cur);
      })
      .catch((e) => setError(e.message || 'Ошибка загрузки'))
      .finally(() => setLoading(false));
  }, [validKey, isAuthed, key]);

  const currentUrl = allLinks && typeof allLinks[key] === 'string' ? allLinks[key] : '';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const res = await fetch(adminApiUrl(`/section-card-links/${encodeURIComponent(key)}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ url: newUrl.trim() }),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error((data && data.error) || 'Ошибка сохранения');
      }
      setSuccess('Ссылка сохранена.');
      const saved = data.url || newUrl.trim();
      setAllLinks((prev) => (prev ? { ...prev, [key]: saved } : prev));
      setNewUrl(saved);
    } catch (err) {
      setError(err.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthed) {
    return <Navigate to="/admin/login" replace />;
  }
  if (!validKey) {
    return <Navigate to="/admin/sections" replace />;
  }

  return (
    <div className="admin-home-page admin-news-page">
      <Link to="/admin/sections" className="admin-sections-back">
        ← К разделам
      </Link>

      <h1 className="admin-home-title" style={{ marginTop: 8 }}>
        Изменение/добавление ссылки
      </h1>
      <p className="admin-sections-intro" style={{ marginBottom: 24 }}>
        Раздел: <strong>{sectionTitle}</strong> (карточка на главной странице)
      </p>

      {loading && <p className="admin-form-hint">Загрузка…</p>}
      {error && <p className="admin-news-error">{error}</p>}
      {success && <p className="admin-form-hint" style={{ color: 'var(--ok-color, #2e7d32)' }}>{success}</p>}

      {!loading && (
        <form onSubmit={handleSubmit} className="admin-section-link-form" style={{ maxWidth: 640 }}>
          <div style={{ marginBottom: 20 }}>
            <div className="admin-form-label" style={{ marginBottom: 8, fontWeight: 600 }}>
              Существующая ссылка
            </div>
            <input
              type="text"
              readOnly
              tabIndex={-1}
              className="admin-form-input admin-section-link-input admin-section-link-input--current"
              value={currentUrl || '—'}
              aria-readonly="true"
            />
          </div>

          <label className="admin-form-label" style={{ display: 'block', marginBottom: 8, fontWeight: 600 }}>
            Новая ссылка
          </label>
          <input
            type="text"
            className="admin-form-input admin-section-link-input"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            placeholder="https://… или file://…"
            autoComplete="off"
          />
          <p className="admin-form-hint" style={{ marginBottom: 16 }}>
            Допустимы адреса с префиксами <code>http://</code>, <code>https://</code> или <code>file://</code>.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
              {saving ? 'Сохранение…' : 'Сохранить'}
            </button>
            <Link to="/admin/sections" className="admin-btn admin-btn-secondary" style={{ textDecoration: 'none' }}>
              Отмена
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}

export default AdminSectionLinkPage;
