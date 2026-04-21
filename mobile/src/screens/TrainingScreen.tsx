import SectionFilesScreen, { type SectionFilesConfig } from './SectionFilesScreen';
import { buildTrainingFileDownloadUrl, fetchTrainingList } from '../api/client';

const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'ogv', 'mov'];

const TRAINING_CONFIG: SectionFilesConfig = {
  fetchList: fetchTrainingList,
  buildFileUrl: buildTrainingFileDownloadUrl,
  pageTitle: 'Записи с программ обучения',
  breadcrumbRoot: 'Обучение',
  emptyMessage:
    'Пока нет материалов. Загрузка и папки — в админ-панели: «Редактирование разделов» → «Записи с программ обучения».',
  extraPreviewExtensions: VIDEO_EXT,
};

export default function TrainingScreen() {
  return <SectionFilesScreen config={TRAINING_CONFIG} />;
}
