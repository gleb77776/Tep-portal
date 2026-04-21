import SectionFilesScreen, { type SectionFilesConfig } from './SectionFilesScreen';
import { buildOtFileDownloadUrl, fetchOtList } from '../api/client';

const OHS_CONFIG: SectionFilesConfig = {
  fetchList: fetchOtList,
  buildFileUrl: buildOtFileDownloadUrl,
  pageTitle: 'Охрана труда, гражданская оборона и чрезвычайные ситуации',
  breadcrumbRoot: 'ОТ, ГО и ЧС',
  emptyMessage:
    'Пока нет документов. Загрузка и папки — в админ-панели: «Редактирование разделов» → «Охрана труда, ГО и ЧС».',
};

export default function OhsScreen() {
  return <SectionFilesScreen config={OHS_CONFIG} />;
}
