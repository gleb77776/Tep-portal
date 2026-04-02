import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { ADMIN_TOKEN_KEY } from './AdminLoginPage';
import { backendUrl, adminApiUrl } from '../backendUrl';
import { parseJsonResponse } from '../utils/parseJsonResponse';
import { EMOJI_SUGGESTIONS } from '../data/emojiSuggestions';
function getAuthHeaders() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Системная карточка «Все разделы» / главная — не показываем в реестре (на главной всегда 7-я). */
function isAllSectionsRegistryRow(s) {
  return s?.slug === 'all-sections' || s?.template === 'all_sections';
}

const TEMPLATES = [
  { id: 'projects', label: 'Проекты — свой список проектов, PID-схемы и документы (пустой раздел)' },
  { id: 'documents', label: 'Хранение документов (папки и файлы)' },
  { id: 'documents_video', label: 'Документы и видео (как обучение)' },
  { id: 'single_link', label: 'Одна внешняя ссылка (как СКУД / TEP-WIKI)' },
  { id: 'multi_links', label: 'Несколько ссылок — меню (как лицензии)' },
];

function AdminSiteSectionsPage() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [access, setAccess] = useState(null);

  const [showAdd, setShowAdd] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const emojiFieldRef = useRef(null);

  const [form, setForm] = useState({
    title: '',
    icon: '📁',
    slug: '',
    template: 'documents',
    externalUrl: '',
    linkKey: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(backendUrl('/api/v1/site-sections'));
      if (!res.ok) throw new Error('Ошибка загрузки');
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      setSections(list);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch(adminApiUrl('/access'))
      .then((r) => r.json().catch(() => null))
      .then((v) => setAccess(v))
      .catch(() => setAccess(null));
  }, []);

  useEffect(() => {
    if (!emojiPickerOpen) return;
    const onDoc = (e) => {
      if (emojiFieldRef.current && !emojiFieldRef.current.contains(e.target)) {
        setEmojiPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [emojiPickerOpen]);

  if (!token) return <Navigate to="/admin/login" replace />;
  if (access && access.role !== 'administrator') return <Navigate to="/admin/sections" replace />;

  const persistOrder = async (ids) => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(adminApiUrl('/site-sections/reorder'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const d = await parseJsonResponse(res).catch(() => ({}));
        throw new Error(d.error || 'Ошибка порядка');
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const visibleSections = useMemo(
    () => sections.filter((s) => !isAllSectionsRegistryRow(s)),
    [sections]
  );

  const move = (from, to) => {
    if (from === to) return;
    const allEntry = sections.find(isAllSectionsRegistryRow);
    const vis = sections.filter((s) => !isAllSectionsRegistryRow(s));
    const next = [...vis];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    const newFull = allEntry ? [...next, allEntry] : next;
    setSections(newFull);
    persistOrder(newFull.map((s) => s.id));
  };

  /** Первые 6 строк реестра — карточки 1–6 на главной; «Все разделы» в списке не показывается (на сайте всегда 7-я). */
  const homeSlotsInListOrder = visibleSections;

  const homePositionLabel = (s) => {
    const idx = homeSlotsInListOrder.findIndex((x) => x.id === s.id);
    if (idx < 0) return null;
    const n = idx + 1;
    return n <= 6 ? `на главной: ${n}-я из 6 карточек` : `не в первых 6 на главной (${n}-я в списке — поднимите выше)`;
  };

  const createSection = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        icon: form.icon.trim() || '📁',
        slug: form.slug.trim().toLowerCase(),
        template: form.template,
      };
      if (form.template === 'single_link') {
        body.externalUrl = form.externalUrl.trim();
        body.linkKey = form.linkKey.trim() || undefined;
      }
      const res = await fetch(adminApiUrl('/site-sections'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      const data = await parseJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Ошибка создания');
      setShowAdd(false);
      setEmojiPickerOpen(false);
      setForm({
        title: '',
        icon: '📁',
        slug: '',
        template: 'documents',
        externalUrl: '',
        linkKey: '',
      });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteSection = async (s) => {
    if (s.system) {
      setError('Системный раздел нельзя удалить');
      return;
    }
    if (!window.confirm(`Удалить раздел «${s.title}»?`)) return;
    setSaving(true);
    try {
      const res = await fetch(adminApiUrl(`/site-sections/${encodeURIComponent(s.id)}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        const d = await parseJsonResponse(res);
        throw new Error(d.error || 'Ошибка');
      }
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-home-page">
      <h1 className="admin-home-title">Разделы сайта (реестр)</h1>
      <p className="admin-sections-intro" style={{ maxWidth: 720 }}>
        Порядок строк задаёт страницу «Все разделы» и главную. Первые {6} строк — карточки 1–6 на главной. Карточка «Все разделы»
        на главной всегда седьмая и в этом списке не отображается.
      </p>

      {error && <p className="admin-news-error">{error}</p>}

      <div style={{ marginBottom: 20 }}>
        <button
          type="button"
          className="admin-btn admin-btn-primary"
          onClick={() => {
            setShowAdd((v) => !v);
            setEmojiPickerOpen(false);
          }}
        >
          {showAdd ? 'Отмена' : '+ Добавить раздел по шаблону'}
        </button>
      </div>

      {showAdd && (
        <form
          onSubmit={createSection}
          style={{ maxWidth: 560, marginBottom: 24, padding: 16, border: '1px solid #4aa8d8', borderRadius: 8 }}
        >
          <h2 className="admin-news-modal-title" style={{ marginTop: 0 }}>
            Новый раздел
          </h2>
          <label className="admin-form-label">
            Шаблон
            <select
              className="admin-form-input"
              value={form.template}
              onChange={(e) => setForm((f) => ({ ...f, template: e.target.value }))}
            >
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-form-label">
            Заголовок (на сайте)
            <input
              className="admin-form-input"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </label>
          <label className="admin-form-label">
            Иконка (эмодзи)
            <div ref={emojiFieldRef} className="admin-icon-emoji-field">
              <div className="admin-icon-emoji-trigger-wrap">
                <button
                  type="button"
                  className="admin-icon-emoji-trigger"
                  onClick={() => setEmojiPickerOpen((v) => !v)}
                  title="Нажмите, чтобы выбрать эмодзи из списка"
                  aria-expanded={emojiPickerOpen}
                  aria-haspopup="listbox"
                >
                  <span className="admin-icon-emoji-preview">{form.icon?.trim() || '📁'}</span>
                  <span className="admin-icon-emoji-chevron">{emojiPickerOpen ? '▲' : '▼'}</span>
                </button>
                {emojiPickerOpen && (
                  <div className="admin-emoji-picker admin-emoji-picker--popover" role="listbox" aria-label="Доступные эмодзи">
                    {EMOJI_SUGGESTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className={`admin-emoji-btn ${form.icon === emoji ? 'active' : ''}`}
                        onClick={() => {
                          setForm((f) => ({ ...f, icon: emoji }));
                          setEmojiPickerOpen(false);
                        }}
                        title={emoji}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </label>
          <label className="admin-form-label">
            Slug (латиница, уникальный)
            <input
              className="admin-form-input"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="naprimer-moi-razdel"
              required
            />
          </label>
          {form.template === 'single_link' && (
            <>
              <label className="admin-form-label">
                URL (http/https/file)
                <input
                  className="admin-form-input"
                  value={form.externalUrl}
                  onChange={(e) => setForm((f) => ({ ...f, externalUrl: e.target.value }))}
                  required
                />
              </label>
              <label className="admin-form-label">
                Ключ для подмены с главной (необязательно, как it/wiki/skud)
                <input
                  className="admin-form-input"
                  value={form.linkKey}
                  onChange={(e) => setForm((f) => ({ ...f, linkKey: e.target.value }))}
                />
              </label>
            </>
          )}
          <button type="submit" className="admin-btn admin-btn-primary" disabled={saving}>
            Создать
          </button>
        </form>
      )}

      {loading ? (
        <p>Загрузка…</p>
      ) : (
        <div className="admin-news-list">
          {visibleSections.map((s, index) => {
            const homeHint = homePositionLabel(s);
            return (
            <div key={s.id} className="admin-news-row">
              <span
                className="admin-news-row-drag"
                draggable
                onDragStart={(e) => e.dataTransfer.setData('text/plain', String(index))}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData('text/plain'));
                  if (Number.isFinite(from)) move(from, index);
                }}
                title="Порядок в списке и на главной (первые 6 строк — карточки на главной)"
              >
                ⠿
              </span>
              <div className="admin-news-row-text">
                <strong>
                  {s.icon} {s.title}
                </strong>
                <span className="admin-news-row-date">
                  {s.template} · {s.cardHref || s.internalPath || '—'} {s.system ? '· системный' : ''}
                  {homeHint ? ` · ${homeHint}` : ''}
                </span>
              </div>
              {!s.system && (
                <div className="admin-news-row-btns">
                  <button type="button" className="admin-btn admin-btn-small admin-btn-danger" onClick={() => deleteSection(s)}>
                    Удалить
                  </button>
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      <p className="admin-form-hint" style={{ marginTop: 24 }}>
        Чем выше строка, тем раньше раздел в меню «Все разделы» и тем выше шанс попасть в первые {6} карточек на главной. Седьмая
        карточка на главной («Все разделы») фиксирована и не входит в этот список.
      </p>
    </div>
  );
}

export default AdminSiteSectionsPage;
