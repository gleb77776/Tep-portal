import React, { useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAdminAccessContext } from '../context/AdminAccessContext';

const ADMIN_TOKEN_KEY = 'admin_token';

function AdminLoginPage() {
  const { adminAccessReady, canAccessAdmin } = useAdminAccessContext();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.classList.add('admin-hide-scrollbar');
    document.body.classList.add('admin-hide-scrollbar');
    return () => {
      document.documentElement.classList.remove('admin-hide-scrollbar');
      document.body.classList.remove('admin-hide-scrollbar');
    };
  }, []);

  useEffect(() => {
    if (!adminAccessReady) return;
    if (canAccessAdmin) {
      localStorage.setItem(ADMIN_TOKEN_KEY, 'ad-session');
      navigate('/admin', { replace: true });
    }
  }, [adminAccessReady, canAccessAdmin, navigate]);

  if (!adminAccessReady) {
    return (
      <div className="admin-login-wrap">
        <div className="admin-login-card">
          <h1 className="admin-login-title">Проверка прав доступа</h1>
          <p>Загрузка…</p>
        </div>
      </div>
    );
  }
  if (canAccessAdmin) {
    return (
      <div className="admin-login-wrap">
        <div className="admin-login-card">
          <h1 className="admin-login-title">Проверка прав доступа</h1>
          <p>Перенаправление…</p>
        </div>
      </div>
    );
  }
  return <Navigate to="/" replace />;
}

export default AdminLoginPage;
export { ADMIN_TOKEN_KEY };
