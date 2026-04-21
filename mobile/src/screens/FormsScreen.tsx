import SectionFilesScreen, { type SectionFilesConfig } from './SectionFilesScreen';
import { buildFormsFileDownloadUrl, fetchFormsList } from '../api/client';

/** Как OhsScreen: список папок/файлов с бэкенда и открытие тех же URL, что и FormsPage.jsx на сайте. */
const FORMS_CONFIG: SectionFilesConfig = {
  fetchList: fetchFormsList,
  buildFileUrl: buildFormsFileDownloadUrl,
  pageTitle: 'Бланки',
  breadcrumbRoot: 'Бланки',
  emptyMessage:
    'Пока нет документов. Загрузка и папки — в админ-панели: «Редактирование разделов» → «Бланки».',
};

export default function FormsScreen() {
  return <SectionFilesScreen config={FORMS_CONFIG} />;
}
