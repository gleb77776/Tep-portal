import SectionFilesScreen, { type SectionFilesConfig } from './SectionFilesScreen';
import { buildDynamicSiteFileUrl, fetchDynamicDocsList } from '../api/client';

const SRO_SLUG = 'sro';

const SRO_CONFIG: SectionFilesConfig = {
  fetchList: (relPath) => fetchDynamicDocsList(SRO_SLUG, relPath),
  buildFileUrl: (relPath, fileName) => buildDynamicSiteFileUrl(SRO_SLUG, relPath, fileName),
  pageTitle: 'Саморегулируемые организации',
  breadcrumbRoot: 'СРО',
  emptyMessage:
    'Пока нет документов. Загрузка и папки — в админ-панели: «Редактирование разделов» → раздел «СРО».',
};

export default function SroScreen() {
  return <SectionFilesScreen config={SRO_CONFIG} />;
}
