import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { adminApiUrl } from '../backendUrl';
import { useAdminAccess } from '../hooks/useAdminAccess';

const ROLES = [
  { value: 'employee', label: 'Сотрудник' },
  { value: 'news_links', label: 'Новости и ссылки' },
  { value: 'safety', label: 'Безопасник (ОТ, ГО и ЧС)' },
  { value: 'documentation', label: 'Документация' },
  { value: 'hr', label: 'Кадры' },
  { value: 'administrator', label: 'Администратор' },
];

function AdminUsersPage() {
  const access = useAdminAccess();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const uRes = await fetch(adminApiUrl('/users'));
      if (!uRes.ok) throw new Error('Недостаточно прав');
      const list = await uRes.json();
      setUsers(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setRole = async (username, role) => {
    setError('');
    try {
      const res = await fetch(adminApiUrl(`/users/${encodeURIComponent(username)}/role`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка сохранения');
      setUsers((prev) => prev.map((u) => (u.username === username ? { ...u, role } : u)));
    } catch (e) {
      setError(e.message || 'Ошибка');
    }
  };

  const filteredUsers = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return users.filter((u) => {
      const roleOk = roleFilter === 'all' ? true : (u.role || 'employee') === roleFilter;
      if (!roleOk) return false;
      if (!q) return true;
      const hay = `${u.fullName || ''} ${u.username || ''} ${u.email || ''} ${u.department || ''} ${u.dept || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [users, searchText, roleFilter]);

  if (!access) return <p style={{ padding: 24 }}>Загрузка…</p>;
  if (!access.canManageUsers) return <Navigate to="/admin" replace />;

  return (
    <div className="admin-news-page">
      <div className="admin-news-header">
        <h1 className="admin-news-title">Пользователи AD и роли</h1>
        <div className="admin-news-actions">
          <Link to="/admin" className="admin-btn admin-btn-secondary" style={{ textDecoration: 'none' }}>
            ← К админ-панели
          </Link>
        </div>
      </div>

      <div
        className="admin-news-filter-row"
        style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}
      >
        <input
          className="admin-form-input"
          placeholder="Поиск: ФИО, логин, email, отдел…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ flex: '1 1 320px' }}
        />
        <select
          className="admin-form-input"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          style={{ width: 220 }}
        >
          <option value="all">Все роли</option>
          {ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
        {searchText || roleFilter !== 'all' ? (
          <button
            type="button"
            className="admin-btn admin-btn-secondary"
            onClick={() => {
              setSearchText('');
              setRoleFilter('all');
            }}
          >
            Сбросить
          </button>
        ) : null}
      </div>

      {error && <p className="admin-news-error">{error}</p>}
      {loading ? (
        <p>Загрузка…</p>
      ) : (
        <div className="admin-news-list">
          {filteredUsers.map((u) => (
            <div key={u.username} className="admin-news-row">
              <div className="admin-news-row-text">
                <strong>{u.fullName || u.username}</strong>
                <span className="admin-news-row-date">{u.username} · {u.department || '—'} · {u.email || '—'}</span>
              </div>
              <select
                className="admin-form-input"
                style={{ width: 220 }}
                value={u.role || 'employee'}
                onChange={(e) => setRole(u.username, e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          ))}
          {!filteredUsers.length ? <p style={{ marginTop: 10 }}>Ничего не найдено.</p> : null}
        </div>
      )}
    </div>
  );
}

export default AdminUsersPage;

