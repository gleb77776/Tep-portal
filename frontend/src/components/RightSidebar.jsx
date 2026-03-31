import React, { useState, useEffect } from 'react';
import { usefulLinks } from '../data/usefulLinks';
import { backendUrl } from '../backendUrl';

const WEATHER_CODES = {
  0: '☀️',
  1: '🌤',
  2: '⛅',
  3: '☁️',
  45: '🌫',
  48: '🌫',
  51: '🌧',
  61: '🌧',
  63: '🌧',
  65: '⛈',
  71: '❄️',
  73: '❄️',
  75: '❄️',
  77: '❄️',
  80: '🌦',
  81: '🌦',
  82: '⛈',
  85: '🌨',
  86: '🌨',
  95: '⛈',
  96: '⛈',
  99: '⛈',
};

function RightSidebar() {
  const [weather, setWeather] = useState({ temp: null, icon: '☁️', loading: true });
  const [currency, setCurrency] = useState({ usd: null, eur: null, date: null, loading: true });
  const [links, setLinks] = useState(usefulLinks);

  useEffect(() => {
    fetch(backendUrl('/api/v1/links'))
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setLinks(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=55.7558&longitude=37.6173&current=temperature_2m,weather_code&timezone=Europe/Moscow';
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const code = data.current?.weather_code ?? 3;
        setWeather({
          temp: data.current?.temperature_2m != null ? `${data.current.temperature_2m > 0 ? '+' : ''}${Math.round(data.current.temperature_2m)}°` : null,
          icon: WEATHER_CODES[code] || '☁️',
          loading: false,
        });
      })
      .catch(() => setWeather((w) => ({ ...w, loading: false })));
  }, []);

  useEffect(() => {
    fetch('https://www.cbr-xml-daily.ru/daily_json.js')
      .then((r) => r.json())
      .then((data) => {
        const usd = data.Valute?.USD?.Value;
        const eur = data.Valute?.EUR?.Value;
        const d = data.Date ? new Date(data.Date) : new Date();
        setCurrency({
          usd: usd != null ? usd.toFixed(4) : null,
          eur: eur != null ? eur.toFixed(4) : null,
          date: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }),
          loading: false,
        });
      })
      .catch(() => setCurrency((c) => ({ ...c, loading: false })));
  }, []);

  return (
    <aside className="right-sidebar">
      <div className="useful-links">
        <h3 className="useful-links-header">Полезные ссылки</h3>
        <ul className="links-list">
          {links.map((link, index) => (
            <li key={index} className="link-item">
              <a href={link.url} target={link.url.startsWith('http') || link.url.startsWith('file') ? '_blank' : '_self'} rel="noopener noreferrer">
                {link.name}
              </a>
            </li>
          ))}
        </ul>
      </div>

      <div className="useful-info">
        <h3 className="useful-info-header">Полезная информация</h3>
        <div className="info-content">
          <div className="weather-section">
            <div className="weather-info">
              <span className="weather-icon">{weather.icon}</span>
              <span className="weather-value">
                {weather.loading ? '…' : weather.temp ?? '—'}
              </span>
            </div>
            <div className="weather-source">Погода в Москве • Open-Meteo</div>
          </div>
          <div className="currency-section">
            <div className="currency-header">Курсы валют ЦБ РФ</div>
            <div className="currency-table">
              <div className="currency-row">
                <span className="currency-label">ВАЛЮТА</span>
                <span className="currency-label">RUB</span>
              </div>
              <div className="currency-row">
                <span className="currency-name">🇺🇸 USD</span>
                <span className="currency-value">{currency.loading ? '…' : currency.usd ?? '—'}</span>
              </div>
              <div className="currency-row">
                <span className="currency-name">🇪🇺 EUR</span>
                <span className="currency-value">{currency.loading ? '…' : currency.eur ?? '—'}</span>
              </div>
              {currency.date && (
                <div className="currency-date">{currency.date}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default RightSidebar;
