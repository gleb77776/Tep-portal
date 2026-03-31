import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { canEditNewsAndLinks, canonicalAdminRole } from '../utils/adminRoleAccess';

function AdminHomePage() {
  const access = useAdminAccess();

  useEffect(() => {
    document.documentElement.classList.add('admin-hide-scrollbar');
    document.body.classList.add('admin-hide-scrollbar');
    return () => {
      document.documentElement.classList.remove('admin-hide-scrollbar');
      document.body.classList.remove('admin-hide-scrollbar');
    };
  }, []);

  if (!access) {
    return (
      <div className="admin-home-page" style={{ padding: 24 }}>
        <p>Загрузка…</p>
      </div>
    );
  }

  const cr = canonicalAdminRole(access);

  return (
    <div className="admin-home-page">
      <div className="admin-home-topbar">
        <h1 className="admin-home-title">Админ-панель</h1>
      </div>
      <div className="admin-home-cards">
        {canEditNewsAndLinks(access) && (
          <>
            <Link to="/admin/news" className="admin-home-card">
              <div className="admin-home-card-icon">📰</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">Последние новости</div>
                <div className="admin-home-card-subtitle">Добавление, удаление, редактирование, порядок</div>
              </div>
            </Link>
            <Link to="/admin/links" className="admin-home-card">
              <div className="admin-home-card-icon">🔗</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">Полезные ссылки</div>
                <div className="admin-home-card-subtitle">Полезные ссылки в правом блоке</div>
              </div>
            </Link>
          </>
        )}
        {(cr === 'administrator' || cr === 'documentation' || cr === 'hr') && (
          <Link to="/admin/sections" className="admin-home-card">
            <div className="admin-home-card-icon">🧩</div>
            <div className="admin-home-card-text">
              <div className="admin-home-card-title">Редактирование разделов</div>
              <div className="admin-home-card-subtitle">Проекты, СМК: папки и файлы на сайте</div>
            </div>
          </Link>
        )}
        {cr === 'safety' && (
          <Link to="/admin/ot" className="admin-home-card">
            <div className="admin-home-card-icon">🛡️</div>
            <div className="admin-home-card-text">
              <div className="admin-home-card-title">Охрана труда, ГО и ЧС</div>
              <div className="admin-home-card-subtitle">Папки и файлы раздела (на сайте — /ohs)</div>
            </div>
          </Link>
        )}
        {access.canManageUsers && (
          <Link to="/admin/users" className="admin-home-card">
            <div className="admin-home-card-icon">👥</div>
            <div className="admin-home-card-text">
              <div className="admin-home-card-title">Пользователи и роли</div>
              <div className="admin-home-card-subtitle">Список сотрудников AD и настройка прав доступа</div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}

export default AdminHomePage;
