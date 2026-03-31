/**
 * Подставляет URL из GET /api/v1/section-card-links для разделов с linkKey (как карточки IT, WIKI).
 * @param {Array} sections — ответ GET /api/v1/site-sections
 * @param {Record<string, string>|null|undefined} linksMap
 */
export function mergeSiteSectionLinks(sections, linksMap) {
  if (!Array.isArray(sections)) return [];
  if (!linksMap || typeof linksMap !== 'object') return sections;
  return sections.map((s) => {
    const key = s.linkKey;
    if (key && typeof linksMap[key] === 'string' && linksMap[key].trim() !== '') {
      const u = linksMap[key].trim();
      const ext =
        u.startsWith('http://') || u.startsWith('https://') || u.startsWith('file://');
      return { ...s, cardHref: u, isExternal: ext };
    }
    return s;
  });
}

export const HOME_SECTIONS_LIMIT = 6;
