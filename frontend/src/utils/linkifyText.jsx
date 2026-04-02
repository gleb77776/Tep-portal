import React from 'react';

const TRAIL = /[.,;:!?)]+$/;

function normalizeHref(token) {
  let h = token.replace(TRAIL, '');
  if (h.startsWith('www.')) h = `https://${h}`;
  return h;
}

/**
 * Разбивает текст на фрагменты и ссылки (http(s):// и www.).
 * @param {string|null|undefined} text
 * @param {string} [linkClassName]
 */
export function linkifyPlainText(text, linkClassName) {
  if (text == null || String(text) === '') {
    return [''];
  }
  const s = String(text);
  const re = /https?:\/\/[^\s<>'"]+|www\.[^\s<>'"]+/gi;
  const out = [];
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      out.push(s.slice(last, m.index));
    }
    const token = m[0];
    const href = normalizeHref(token);
    const label = token.replace(TRAIL, '');
    if (href.length >= 4 && (href.startsWith('http://') || href.startsWith('https://'))) {
      out.push(
        <a
          key={`lt-${k++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={linkClassName}
        >
          {label || token}
        </a>
      );
    } else {
      out.push(token);
    }
    last = m.index + token.length;
  }
  if (last < s.length) {
    out.push(s.slice(last));
  }
  return out.length ? out : [s];
}
