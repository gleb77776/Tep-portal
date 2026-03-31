// Перечень текущих проектов института
export const projects = [
  { id: '274', name: 'Забайкальская ТЭС', hasDiagrams: false },
  { id: '141', name: 'Амурская (Свободненская) ТЭС', hasDiagrams: true },
  { id: '141b', name: 'Свободненская ТЭС', hasDiagrams: true },
  { id: '144', name: 'Артёмовская ТЭЦ', hasDiagrams: true },
  { id: '254', name: 'Балтийский ГХК', hasDiagrams: false },
  { id: '271', name: 'Динская ТЭС', hasDiagrams: false },
  { id: '181', name: 'Киришская ГРЭС', hasDiagrams: true },
  { id: '136', name: 'Нижнекамская ТЭЦ', hasDiagrams: false },
  { id: '252', name: 'Новочеркасская ГРЭС', hasDiagrams: false },
  { id: '250', name: 'Норильская ТЭЦ-3', hasDiagrams: false },
  { id: '132', name: 'Сахалинская ГРЭС-2', hasDiagrams: false },
  { id: '246', name: 'Сургутская ГРЭС-1', hasDiagrams: true },
  { id: '21', name: 'ТЭЦ-25', hasDiagrams: false },
  { id: '22', name: 'ТЭЦ-26', hasDiagrams: false },
  { id: '261', name: 'Южно-Якутская ТЭС', hasDiagrams: true },
  { id: '68', name: 'Якутская ГРЭС-2', hasDiagrams: true },
];

// Папки проектной документации (иерархия)
export const projectFolders = [
  { id: 'drawings', name: 'Чертежи', parentId: null },
  { id: 'pid', name: 'PID-схемы', parentId: null },
  { id: 'specs', name: 'Спецификации', parentId: null },
  { id: 'estimates', name: 'Сметы', parentId: null },
  { id: 'explanatory', name: 'Пояснительные записки', parentId: null },
  { id: 'diagrams', name: 'Диаграммы', parentId: null },
];

// Согласующие (руководители / ГИПы) для выбора при отправке на согласование
export const APPROVERS = [
  { id: 'auto', name: 'Ответственный руководитель (по умолчанию)' },
  { id: '1', name: 'Иванов Иван Иванович — ГИП' },
  { id: '2', name: 'Петров Пётр Петрович — ГИП' },
  { id: '3', name: 'Сидоров Сергей Сергеевич — Руководитель отдела' },
  { id: '4', name: 'Козлова Анна Михайловна — ГАП' },
];

// Статусы документов
export const DOC_STATUS = {
  DRAFT: 'Черновик',
  PENDING: 'На согласовании',
  APPROVED: 'Утверждён',
  REJECTED: 'Отклонён',
};

// История версий документов (mock)
export const getDocumentVersions = (docId) => {
  const versionsByDoc = {
    '1': [
      { version: '1.2', author: 'Иванов И.И.', date: '15.01.2026', comment: 'Исправлены замечания', isActive: true, status: 'Утверждён' },
      { version: '1.1', author: 'Петров П.П.', date: '10.01.2026', comment: 'Доработка схемы', isActive: false, status: 'Утверждён' },
      { version: '1.0', author: 'Сидоров С.С.', date: '05.01.2026', comment: 'Первая версия', isActive: false, status: 'Утверждён' },
    ],
    '2': [
      { version: '2.0', author: 'Иванов И.И.', date: '20.01.2026', comment: 'Актуализация плана', isActive: true, status: 'На согласовании' },
      { version: '1.0', author: 'Петров П.П.', date: '01.12.2025', comment: 'Исходный вариант', isActive: false, status: 'Утверждён' },
    ],
    '3': [
      { version: '1.0', author: 'Сидоров С.С.', date: '10.01.2026', comment: '', isActive: true, status: 'Утверждён' },
    ],
    '4': [
      { version: '1.1', author: 'Иванов И.И.', date: '18.01.2026', comment: 'Дополнение оборудования', isActive: true, status: 'На согласовании' },
    ],
    '5': [
      { version: '1.0', author: 'Петров П.П.', date: '05.01.2026', comment: '', isActive: true, status: 'Утверждён' },
    ],
    '6': [
      { version: '3.0', author: 'Сидоров С.С.', date: '22.01.2026', comment: 'Черновая версия', isActive: true, status: 'Черновик' },
    ],
    '7': [
      { version: '1.0', author: 'Иванов И.И.', date: '12.01.2026', comment: '', isActive: true, status: 'Утверждён' },
    ],
  };
  return versionsByDoc[docId] || [];
};

// Mock-документы для проекта
export const getProjectDocuments = (projectId, folderId) => {
  const all = [
    { id: '1', name: 'Схема теплоснабжения.pdf', folderId: 'drawings', version: '1.2', date: '15.01.2026', status: DOC_STATUS.APPROVED, type: 'pdf' },
    { id: '2', name: 'План размещения оборудования.dwg', folderId: 'drawings', version: '2.0', date: '20.01.2026', status: DOC_STATUS.PENDING, type: 'dwg' },
    { id: '3', name: 'PID-схема основного оборудования.pdf', folderId: 'pid', version: '1.0', date: '10.01.2026', status: DOC_STATUS.APPROVED, type: 'pdf' },
    { id: '4', name: 'Спецификация оборудования.xlsx', folderId: 'specs', version: '1.1', date: '18.01.2026', status: DOC_STATUS.PENDING, type: 'xlsx' },
    { id: '5', name: 'Смета по разделу.xlsx', folderId: 'estimates', version: '1.0', date: '05.01.2026', status: DOC_STATUS.APPROVED, type: 'xlsx' },
    { id: '6', name: 'Пояснительная записка.docx', folderId: 'explanatory', version: '3.0', date: '22.01.2026', status: DOC_STATUS.DRAFT, type: 'docx' },
    { id: '7', name: 'Диаграмма технологического процесса.pdf', folderId: 'diagrams', version: '1.0', date: '12.01.2026', status: DOC_STATUS.APPROVED, type: 'pdf' },
  ];
  if (folderId) return all.filter((d) => d.folderId === folderId);
  return all;
};
