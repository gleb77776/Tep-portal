import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdminAccessContext } from '../context/AdminAccessContext';
import { getRestrictedAdminRedirect } from '../utils/adminRoleAccess';

/** Пока неизвестен пользователь или не завершена проверка /access — не показываем админку (и не даём UI по старому admin_token). */
export default function AdminProtectedLayout() {
  const { adminAccessReady, canAccessAdmin, adminAccess } = useAdminAccessContext();
  const location = useLocation();

  if (!adminAccessReady) {
    return (
      <div className="admin-home-page" style={{ padding: 24 }}>
        <p>Загрузка…</p>
      </div>
    );
  }
  if (!canAccessAdmin) {
    return <Navigate to="/" replace />;
  }

  const restricted = getRestrictedAdminRedirect(location.pathname, adminAccess);
  if (restricted) {
    return <Navigate to={restricted} replace />;
  }

  return <Outlet />;
}
