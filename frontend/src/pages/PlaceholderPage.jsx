import React from 'react';
import { Link } from 'react-router-dom';

function PlaceholderPage({ title, icon = '📄' }) {
  return (
    <div className="placeholder-page">
      <Link to="/" className="back-to-main-button">← На главную</Link>
      <div className="placeholder-content">
        <span className="placeholder-icon">{icon}</span>
        <h2>{title}</h2>
        <p>Раздел в разработке</p>
      </div>
    </div>
  );
}

export default PlaceholderPage;
