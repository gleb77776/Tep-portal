import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { backendUrl } from '../backendUrl';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { getSectionAdminContentLink, getSectionAdminCardSubtitle } from '../utils/sectionAdminLinks';

/** Доп. разделы из реестра для роли «Документация» (см. backend site_sections / DOCUMENTATION_*_SLUG). */
function isDocumentationRegistrySection(s) {
  const slug = String(s?.slug || '').toLowerCase();
  return slug === 'arkhiv' || slug === 'sro';
}

function AdminSectionsPage() {
  const access = useAdminAccess();
  const [registrySections, setRegistrySections] = useState([]);

  const loadRegistry = useCallback(async () => {
    try {
      const res = await fetch(backendUrl('/api/v1/site-sections'));
      if (!res.ok) throw new Error('load');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setRegistrySections(list);
    } catch {
      setRegistrySections([]);
    }
  }, []);

  useEffect(() => {
    void loadRegistry();
  }, [loadRegistry]);

  const extraContentSections = useMemo(() => {
    return registrySections.filter((s) => !s.system && getSectionAdminContentLink(s));
  }, [registrySections]);

  useEffect(() => {
    document.documentElement.classList.add('admin-hide-scrollbar');
    document.body.classList.add('admin-hide-scrollbar');
    return () => {
      document.documentElement.classList.remove('admin-hide-scrollbar');
      document.body.classList.remove('admin-hide-scrollbar');
    };
  }, []);

  if (!access) {
    return (
      <div className="admin-home-page" style={{ padding: 24 }}>
        <p>Загрузка…</p>
      </div>
    );
  }
  const role = access.role;
  const isAdmin = role === 'administrator';
  const isDocs = role === 'documentation';
  const isHR = role === 'hr';

  return (
    <div className="admin-home-page">
      <Link to="/admin" className="admin-sections-back">
        ← К админ-панели
      </Link>
      <h1 className="admin-home-title">Редактирование разделов</h1>

      {isAdmin && (
        <p className="admin-sections-intro">
          Проекты, СМК, ОТ/ГО/ЧС, КЭПР, бланки, обучение, лицензии; ссылки карточек главной (заявка в IT, TEP-WIKI, СКУД, СПРУТ).
        </p>
      )}
      {isHR && (
        <p className="admin-sections-intro">
          Доступен только раздел «Бланки»: папки и файлы для /forms.
        </p>
      )}
      {isDocs && (
        <p className="admin-sections-intro">
          Проекты, СМК, КЭПР, архивные проекты, СРО. Можно добавлять папки и файлы; удаление — только у администратора.
        </p>
      )}

      <div className="admin-home-cards admin-home-cards--sections-editor">
        {isAdmin && (
          <Link to="/admin/site-sections" className="admin-home-card">
            <div className="admin-home-card-icon">🧭</div>
            <div className="admin-home-card-text">
              <div className="admin-home-card-title">Разделы сайта (реестр)</div>
              <div className="admin-home-card-subtitle">
                Добавлять разделы по шаблонам, менять порядок на сайте без перезапуска сервера
              </div>
            </div>
          </Link>
        )}

        {(isAdmin || isDocs) && (
          <>
            <Link to="/admin/projects" className="admin-home-card">
              <div className="admin-home-card-icon">📁</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">Проекты</div>
                <div className="admin-home-card-subtitle">
                  {isDocs ? 'Добавление проектов и загрузка файлов (без удаления)' : 'Добавление/удаление проектов и загрузка файлов'}
                </div>
              </div>
            </Link>
            <Link to="/admin/smk" className="admin-home-card">
              <div className="admin-home-card-icon">📋</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">СМК</div>
                <div className="admin-home-card-subtitle">Папки и файлы раздела «Система менеджмента качества»</div>
              </div>
            </Link>
            <Link to="/admin/kepr" className="admin-home-card">
              <div className="admin-home-card-icon">📘</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">КЭПР</div>
                <div className="admin-home-card-subtitle">Папки и файлы раздела «КЭПР» (публичный просмотр — /kepr)</div>
              </div>
            </Link>
          </>
        )}

        {isAdmin && (
          <>
            <Link to="/admin/ot" className="admin-home-card">
              <div className="admin-home-card-icon">🛡️</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">Охрана труда, ГО и ЧС</div>
                <div className="admin-home-card-subtitle">Папки и файлы раздела «ОТ, ГО и ЧС» (публичный просмотр — /ohs)</div>
              </div>
            </Link>
            <Link to="/admin/forms" className="admin-home-card">
              <div className="admin-home-card-icon">📑</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">Бланки</div>
                <div className="admin-home-card-subtitle">Папки и файлы раздела «Бланки» (/forms)</div>
              </div>
            </Link>
            <Link to="/admin/training" className="admin-home-card">
              <div className="admin-home-card-icon">🎓</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">Записи с программ обучения</div>
                <div className="admin-home-card-subtitle">Папки, документы и видео — «Записи с программ обучения» (/training)</div>
              </div>
            </Link>
            <Link to="/admin/licenses" className="admin-home-card">
              <div className="admin-home-card-icon">📋</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">Лицензии, программы</div>
                <div className="admin-home-card-subtitle">Названия и ссылки пунктов меню раздела (/licenses)</div>
              </div>
            </Link>
            <Link to="/admin/section-link/it" className="admin-home-card">
              <div className="admin-home-card-icon">💻</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">Заявка в IT</div>
                <div className="admin-home-card-subtitle">Ссылка карточки на главной</div>
              </div>
            </Link>
            <Link to="/admin/section-link/wiki" className="admin-home-card">
              <div className="admin-home-card-icon">📖</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">TEP-WIKI</div>
                <div className="admin-home-card-subtitle">Ссылка карточки на главной</div>
              </div>
            </Link>
            <Link to="/admin/section-link/skud" className="admin-home-card">
              <div className="admin-home-card-icon">⏰</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">СКУД</div>
                <div className="admin-home-card-subtitle">Ссылка карточки на главной</div>
              </div>
            </Link>
            <Link to="/admin/section-link/sprut" className="admin-home-card">
              <div className="admin-home-card-icon">📈</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">СПРУТ</div>
                <div className="admin-home-card-subtitle">Ссылка карточки на главной</div>
              </div>
            </Link>
          </>
        )}

        {isHR && (
          <Link to="/admin/forms" className="admin-home-card">
            <div className="admin-home-card-icon">📑</div>
            <div className="admin-home-card-text">
              <div className="admin-home-card-title">Бланки</div>
              <div className="admin-home-card-subtitle">Папки и файлы раздела «Бланки» (/forms)</div>
            </div>
          </Link>
        )}

        {isAdmin &&
          extraContentSections.map((s) => (
            <Link key={s.id} to={getSectionAdminContentLink(s)} className="admin-home-card">
              <div className="admin-home-card-icon">{s.icon || '📁'}</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">{s.title}</div>
                <div className="admin-home-card-subtitle">{getSectionAdminCardSubtitle(s)}</div>
              </div>
            </Link>
          ))}

        {isDocs &&
          extraContentSections.filter(isDocumentationRegistrySection).map((s) => (
            <Link key={s.id} to={getSectionAdminContentLink(s)} className="admin-home-card">
              <div className="admin-home-card-icon">{s.icon || '📁'}</div>
              <div className="admin-home-card-text">
                <div className="admin-home-card-title">{s.title}</div>
                <div className="admin-home-card-subtitle">{getSectionAdminCardSubtitle(s)}</div>
              </div>
            </Link>
          ))}
      </div>
    </div>
  );
}

export default AdminSectionsPage;
