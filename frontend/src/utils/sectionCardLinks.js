/** Ключи совпадают с backend (handlers/section_card_links.go) и полем linkKey в cards.js */

export const SECTION_CARD_LINK_KEYS = ['it', 'wiki', 'skud', 'sprut'];

export const SECTION_CARD_LINK_LABELS = {
  it: 'Заявка в IT',
  wiki: 'TEP-WIKI',
  skud: 'СКУД',
  sprut: 'СПРУТ',
};

/**
 * Подставляет URL из API для карточек с linkKey.
 * @param {Array} staticCards — из data/cards.js
 * @param {Record<string, string>|null|undefined} linksMap — ответ GET /api/v1/section-card-links
 */
export function mergeSectionCardLinks(staticCards, linksMap) {
  if (!linksMap || typeof linksMap !== 'object') return staticCards;
  return staticCards.map((c) => {
    if (c.linkKey && typeof linksMap[c.linkKey] === 'string' && linksMap[c.linkKey].trim() !== '') {
      return { ...c, link: linksMap[c.linkKey].trim() };
    }
    return c;
  });
}
