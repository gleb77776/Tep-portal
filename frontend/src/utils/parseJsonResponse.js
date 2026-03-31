/**
 * Читает тело ответа fetch и парсит JSON.
 * Обходит типичный сбой «Unexpected non-whitespace character after JSON at position 4»,
 * когда к ответу случайно дописан префикс вроде `true`/`null` перед объектом (`true{"a":1}`).
 */
function looksLikeJsonObjectOrArray(trimmed) {
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

export async function parseJsonResponse(res) {
  const text = await res.text();
  const trimmed = (text || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) {
    throw new Error(`Пустой ответ сервера (HTTP ${res.status})`);
  }

  // Gin и др.: 404 с текстом "404 page not found" — не JSON; иначе JSON.parse съедает число 404 и падает на "page"
  if (!res.ok && !looksLikeJsonObjectOrArray(trimmed)) {
    const preview = trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
    const hint404 =
      res.status === 404
        ? ' Проверьте: бэкенд запущен (go run . в backend), порт совпадает с VITE_API_BASE в frontend/.env (в dev по умолчанию http://localhost:8000). Для production без прокси задайте VITE_API_BASE при сборке.'
        : '';
    throw new Error(`HTTP ${res.status}: ${preview}.${hint404}`);
  }

  try {
    return JSON.parse(trimmed);
  } catch (firstErr) {
    const brace = trimmed.indexOf('{');
    const bracket = trimmed.indexOf('[');
    let start = -1;
    if (brace >= 0 && bracket >= 0) start = Math.min(brace, bracket);
    else start = Math.max(brace, bracket);
    // Только «короткий мусор» перед объектом (true{…}, null{…}), не HTML с { где-то в середине
    if (start > 0 && start <= 12) {
      try {
        return JSON.parse(trimmed.slice(start));
      } catch (_) {
        /* fall through */
      }
    }
    const preview = trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
    throw new Error(
      `Ответ не JSON (HTTP ${res.status}). ${firstErr.message}. Фрагмент: ${preview}`
    );
  }
}
