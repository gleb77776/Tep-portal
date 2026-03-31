import React from 'react';
import SectionMenuDynamicPage from './SectionMenuDynamicPage';

/** Раздел «Лицензии, программы» — меню из админки (данные в licenses_links.json / API licenses). */
function LicensesPage() {
  return <SectionMenuDynamicPage sectionId="licenses" title="Лицензии, программы" />;
}

export default LicensesPage;
