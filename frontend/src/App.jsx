import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './App.css';
import LeftSidebar from './components/LeftSidebar';
import RightSidebar from './components/RightSidebar';
import DocumentViewer from './components/DocumentViewer';
import SettingsPage, { getStoredTheme } from './components/SettingsPage';

import HomePage from './components/HomePage';
import AllSectionsPage from './components/AllSectionsPage';
import ProjectsPage from './components/ProjectsPage';
import ProjectPage from './components/ProjectPage';
import PlaceholderPage from './pages/PlaceholderPage';
import SMKPage from './pages/SMKPage';
import OhsPage from './pages/OhsPage';
import KeprPage from './pages/KeprPage';
import FormsPage from './pages/FormsPage';
import TrainingPage from './pages/TrainingPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminNewsPage from './pages/AdminNewsPage';
import AdminHomePage from './pages/AdminHomePage';
import AdminLinksPage from './pages/AdminLinksPage';
import AdminProjectsPage from './pages/AdminProjectsPage';
import AdminSectionsPage from './pages/AdminSectionsPage';
import AdminSMKPage from './pages/AdminSMKPage';
import AdminOTPage from './pages/AdminOTPage';
import AdminKEPRPage from './pages/AdminKEPRPage';
import AdminFormsPage from './pages/AdminFormsPage';
import AdminTrainingPage from './pages/AdminTrainingPage';
import AdminSectionLinkPage from './pages/AdminSectionLinkPage';
import LicensesPage from './pages/LicensesPage';
import DynamicSectionPage from './pages/DynamicSectionPage';
import SectionProjectPage from './components/SectionProjectPage';
import AdminSiteSectionsPage from './pages/AdminSiteSectionsPage';
import AdminDynamicDocsPage from './pages/AdminDynamicDocsPage';
import AdminSectionMenuPage from './pages/AdminSectionMenuPage';
import AdminSectionProjectsPage from './pages/AdminSectionProjectsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminProtectedLayout from './components/AdminProtectedLayout';
import { AdminAccessContext } from './context/AdminAccessContext';
import { parseJsonResponse } from './utils/parseJsonResponse';
import { adminApiUrl } from './backendUrl';
import { adminPanelAllowed } from './utils/adminRoleAccess';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Render error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, color: '#c00' }}>
          Ошибка рендера: {String(this.state.error?.message || this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  const [userData, setUserData] = useState(null);
  const [photoUrl, setPhotoUrl] = useState('');
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [canAccessAdmin, setCanAccessAdmin] = useState(false);
  const [adminAccess, setAdminAccess] = useState(null);
  const [adminAccessReady, setAdminAccessReady] = useState(false);
  const [needsAdLogin, setNeedsAdLogin] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [theme, setTheme] = useState(() => {
    const t = getStoredTheme();
    document.documentElement.setAttribute('data-theme', t);
    return t;
  });

  useEffect(() => {
    let blobUrlToRevoke = null;

    const fetchUserData = async () => {
      try {
        const storedUsername = localStorage.getItem('ad_username') || '';

        // Если пользователь уже вводил логин/пароль, backend отдадим по username,
        // чтобы не просить пароль повторно.
        const meUrl = storedUsername
          ? `/api/v1/user/me?username=${encodeURIComponent(storedUsername)}`
          : '/api/v1/user/me';

        const res = await fetch(meUrl, { credentials: 'include' });

        if (res.status === 401) {
          setNeedsAdLogin(true);
          const fallbackUser = {
            fullName: 'Пользователь',
            username: '',
            email: '',
            department: '',
            photo: null,
          };
          setUserData(fallbackUser);
          setLoginError('');
          return;
        }

        if (!res.ok) throw new Error('Ошибка загрузки пользователя');
        const data = await parseJsonResponse(res);
        // Логин для прав /access и ролей: иногда AD не отдаёт username в JSON — берём из запроса ?username= / localStorage.
        const resolvedUsername = String(
          data.username || data.userName || data.UserName || storedUsername || ''
        ).trim();
        const current = {
          fullName: data.fullName || data.username || resolvedUsername || 'Пользователь',
          username: resolvedUsername,
          email: data.email || '',
          department: data.department || data.dept || '',
          photo: data.photo || null,
        };
        setUserData(current);
        if (data.photo) {
          setPhotoUrl(data.photo);
        } else {
          const initials =
            (current.fullName || '?')
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .substring(0, 2) || '?';
          const svg = `<svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#4aa8d8"/><text x="50%" y="50%" text-anchor="middle" dy="0.3em" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white">${initials}</text></svg>`;
          const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
          blobUrlToRevoke = svgUrl;
          setPhotoUrl(svgUrl);
        }
      } catch (err) {
        setNeedsAdLogin(true);
      }
    };

    fetchUserData();
    return () => {
      if (blobUrlToRevoke) URL.revokeObjectURL(blobUrlToRevoke);
    };
  }, []);

  const handleAdLogin = async (e) => {
    e?.preventDefault?.();
    setLoginLoading(true);
    setLoginError('');
    try {
      const res = await fetch('/api/v1/user/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
        credentials: 'include',
      });

      const data = await parseJsonResponse(res);
      if (!res.ok) {
        throw new Error(data?.error || 'Ошибка входа');
      }

      const current = {
        fullName: data.fullName || data.username || 'Пользователь',
        username: data.username || loginUsername,
        email: data.email || '',
        department: data.department || data.dept || '',
        photo: data.photo || null,
      };

      localStorage.setItem('ad_username', current.username);
      setUserData(current);
      setNeedsAdLogin(false);

      if (data.photo) {
        setPhotoUrl(data.photo);
      } else {
        const initials = (current.fullName || '?')
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .substring(0, 2) || '?';
        const svg = `<svg width="80" height="80" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg"><rect width="80" height="80" rx="40" fill="#4aa8d8"/><text x="50%" y="50%" text-anchor="middle" dy="0.3em" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="white">${initials}</text></svg>`;
        const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        setPhotoUrl(svgUrl);
      }

      setLoginPassword('');
    } catch (err) {
      setLoginError(String(err?.message || err));
    } finally {
      setLoginLoading(false);
    }
  };

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Права админки только после /me; username в query явно из userData — иначе бэкенд подставляет AD_DEFAULT_USER / BatyanovskiyGV.
  useEffect(() => {
    if (needsAdLogin) {
      setCanAccessAdmin(false);
      setAdminAccess(null);
      setAdminAccessReady(true);
      localStorage.removeItem('admin_token');
      return;
    }
    if (userData === null) {
      setAdminAccessReady(false);
      return;
    }

    let username = (userData.username || '').trim();
    if (!username && typeof localStorage !== 'undefined') {
      try {
        username = (localStorage.getItem('ad_username') || '').trim();
      } catch (_) {
        /* ignore */
      }
    }
    if (!username) {
      setCanAccessAdmin(false);
      setAdminAccess(null);
      setAdminAccessReady(true);
      localStorage.removeItem('admin_token');
      return;
    }

    let cancelled = false;
    setAdminAccessReady(false);
    setCanAccessAdmin(false);
    setAdminAccess(null);
    localStorage.removeItem('admin_token');
    fetch(adminApiUrl('/access', username))
      .then(async (r) => {
        const text = await r.text();
        if (!r.ok) return null;
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return null;
        }
      })
      .then((info) => {
        if (cancelled) return;
        const obj = info && typeof info === 'object' && !info.error ? info : null;
        const can = adminPanelAllowed(obj);
        setAdminAccess(obj);
        setCanAccessAdmin(can);
        if (can) localStorage.setItem('admin_token', 'ad-session');
        else localStorage.removeItem('admin_token');
      })
      .catch(() => {
        if (cancelled) return;
        setAdminAccess(null);
        setCanAccessAdmin(false);
        localStorage.removeItem('admin_token');
      })
      .finally(() => {
        if (!cancelled) setAdminAccessReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [needsAdLogin, userData]);

  const adminAccessContextValue = useMemo(
    () => ({ canAccessAdmin, adminAccessReady, adminAccess }),
    [canAccessAdmin, adminAccessReady, adminAccess]
  );

  return (
    <AdminAccessContext.Provider value={adminAccessContextValue}>
    <div className={`app app--${theme}`}>
      {needsAdLogin && (
        <div className="ad-login-backdrop">
          <form className="ad-login-modal" onSubmit={handleAdLogin}>
            <div className="ad-login-title">Вход</div>
            <label className="ad-login-label-wrap">
              <div className="ad-login-label-text">Логин (AD)</div>
              <input
                className="ad-login-input"
                value={loginUsername}
                onChange={(ev) => setLoginUsername(ev.target.value)}
                autoComplete="username"
              />
            </label>
            <label className="ad-login-label-wrap">
              <div className="ad-login-label-text">Пароль</div>
              <input
                className="ad-login-input"
                type="password"
                value={loginPassword}
                onChange={(ev) => setLoginPassword(ev.target.value)}
                autoComplete="current-password"
              />
            </label>
            {loginError && <div className="ad-login-error">{loginError}</div>}
            <button type="submit" disabled={loginLoading} className="ad-login-submit">
              {loginLoading ? 'Проверяю...' : 'Войти'}
            </button>
          </form>
        </div>
      )}
      <div className="main-layout">
        <LeftSidebar userData={userData} photoUrl={photoUrl} canAccessAdmin={canAccessAdmin} />
        <main className={`center-content${isHome ? ' center-content--home' : ''}`}>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/sections" element={<AllSectionsPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route
                path="/projects/:projectId"
                element={
                  <div className="center-content center-content--wide">
                    <ProjectPage onOpenDocument={setSelectedDocument} />
                  </div>
                }
              />
              <Route path="/settings" element={<SettingsPage theme={theme} onThemeChange={setTheme} />} />
              <Route path="/smk" element={<SMKPage onOpenDocument={setSelectedDocument} userData={userData} />} />
              <Route path="/ohs" element={<OhsPage onOpenDocument={setSelectedDocument} />} />
              <Route path="/kepr" element={<KeprPage onOpenDocument={setSelectedDocument} />} />
              <Route path="/forms" element={<FormsPage onOpenDocument={setSelectedDocument} />} />
              <Route path="/training" element={<TrainingPage onOpenDocument={setSelectedDocument} />} />
              <Route path="/licenses" element={<LicensesPage />} />
              <Route
                path="/s/:slug/project/:projectId"
                element={
                  <div className="center-content center-content--wide">
                    <SectionProjectPage onOpenDocument={setSelectedDocument} />
                  </div>
                }
              />
              <Route path="/s/:slug" element={<DynamicSectionPage onOpenDocument={setSelectedDocument} />} />
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin" element={<AdminProtectedLayout />}>
                <Route index element={<AdminHomePage />} />
                <Route path="news" element={<AdminNewsPage />} />
                <Route path="links" element={<AdminLinksPage />} />
                <Route path="sections" element={<AdminSectionsPage />} />
                <Route path="projects" element={<AdminProjectsPage />} />
                <Route path="smk" element={<AdminSMKPage onOpenDocument={setSelectedDocument} />} />
                <Route path="ot" element={<AdminOTPage onOpenDocument={setSelectedDocument} />} />
                <Route path="kepr" element={<AdminKEPRPage onOpenDocument={setSelectedDocument} />} />
                <Route path="forms" element={<AdminFormsPage onOpenDocument={setSelectedDocument} />} />
                <Route path="training" element={<AdminTrainingPage onOpenDocument={setSelectedDocument} />} />
                <Route path="section-link/:key" element={<AdminSectionLinkPage />} />
                <Route path="site-sections" element={<AdminSiteSectionsPage />} />
                <Route path="dynamic-docs/:slug" element={<AdminDynamicDocsPage onOpenDocument={setSelectedDocument} />} />
                <Route path="section-menu/:sectionId" element={<AdminSectionMenuPage />} />
                <Route path="section-projects/:slug" element={<AdminSectionProjectsPage onOpenDocument={setSelectedDocument} />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="licenses" element={<Navigate to="/admin/section-menu/licenses" replace />} />
              </Route>
            </Routes>
          </ErrorBoundary>
        </main>
        <RightSidebar />
      </div>

      {selectedDocument && (
        <DocumentViewer
          document={selectedDocument}
          onClose={() => setSelectedDocument(null)}
          userData={userData}
        />
      )}
    </div>
    </AdminAccessContext.Provider>
  );
}

export default App;
