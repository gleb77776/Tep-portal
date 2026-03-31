import React from 'react';
import { NavLink } from 'react-router-dom';

function LeftSidebar({ userData, photoUrl, canAccessAdmin = false }) {
  return (
    <aside className="left-sidebar">
      <div className="sidebar-content">
        <div className="sidebar-logo-strip">
          <NavLink to="/" className="logo logo-link">
            <span className="logo-acronym">НПС</span>
            <span className="logo-slash">//</span>
            <div className="logo-text-block">
              <span className="logo-institute">ИНСТИТУТ</span>
              <span className="logo-name">ТЕПЛОЭЛЕКТРОПРОЕКТ</span>
            </div>
          </NavLink>
        </div>

        <div className="user-info-section">
          <div className="user-avatar">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt="Аватар"
                className="avatar-image"
                onError={(e) => {
                  e.target.style.display = 'none';
                  const initials = userData?.fullName?.split(' ').map(n => n[0]).join('').toUpperCase() || '?';
                  const fallbackDiv = document.createElement('div');
                  fallbackDiv.className = 'avatar-fallback';
                  fallbackDiv.textContent = initials.substring(0, 2);
                  e.target.parentNode.appendChild(fallbackDiv);
                }}
              />
            ) : (
              <div className="avatar-fallback">
                {userData?.fullName?.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2) || '?'}
              </div>
            )}
          </div>
          <div className="user-details">
            <div className="user-name">{userData ? userData.fullName : 'Загрузка...'}</div>
          </div>
        </div>

        <nav className="user-nav-menu">
          <ul className="nav-menu-list">
            <li className="nav-menu-item">
              <NavLink to="/" className={({ isActive }) => `nav-menu-link ${isActive ? 'active' : ''}`}>
                <span className="nav-menu-icon">🏠</span>
                <span className="nav-menu-text">Главная</span>
              </NavLink>
            </li>
            <li className="nav-menu-item">
              <NavLink to="/sections" className={({ isActive }) => `nav-menu-link ${isActive ? 'active' : ''}`}>
                <span className="nav-menu-icon">📚</span>
                <span className="nav-menu-text">Все разделы</span>
              </NavLink>
            </li>
            <li className="nav-menu-item">
              <NavLink to="/settings" className={({ isActive }) => `nav-menu-link ${isActive ? 'active' : ''}`}>
                <span className="nav-menu-icon">⚙️</span>
                <span className="nav-menu-text">Настройки</span>
              </NavLink>
            </li>
            {canAccessAdmin && (
              <li className="nav-menu-item">
                <NavLink to="/admin" className={({ isActive }) => `nav-menu-link ${isActive ? 'active' : ''}`}>
                  <span className="nav-menu-icon">🔐</span>
                  <span className="nav-menu-text">Админ</span>
                </NavLink>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </aside>
  );
}

export default LeftSidebar;