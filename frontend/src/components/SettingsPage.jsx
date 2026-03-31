import React from 'react';
import { Link } from 'react-router-dom';

const THEME_KEY = 'tep-portal-theme';

export function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || 'light';
}

export function setStoredTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
}

function SettingsPage({ theme, onThemeChange }) {
  const isDark = theme === 'dark';

  const handleToggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    onThemeChange(newTheme);
    setStoredTheme(newTheme);
  };

  return (
    <div className="settings-page">
      <Link to="/" className="back-to-main-button">
        ← На главную
      </Link>

      <h2 className="page-title">Настройки</h2>

      <div className="settings-cards">
        <div className="settings-card">
          <div className="settings-card-header">
            <span className="settings-card-icon">🌓</span>
            <h3>Тема оформления</h3>
          </div>
          <div className="settings-card-body">
            <label className="settings-toggle">
              <span className="settings-toggle-label">Тёмная тема</span>
              <button
                type="button"
                role="switch"
                aria-checked={isDark}
                className={`settings-switch ${isDark ? 'settings-switch--on' : ''}`}
                onClick={handleToggleTheme}
              >
                <span className="settings-switch-slider" />
              </button>
            </label>
            <p className="settings-hint">Включите тёмную тему для работы при слабом освещении</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
