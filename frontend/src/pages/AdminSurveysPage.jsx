import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ADMIN_TOKEN_KEY } from './AdminLoginPage';
import { adminApiUrl } from '../backendUrl';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { canonicalAdminRole } from '../utils/adminRoleAccess';

function getAuthHeaders() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function emptyDraft() {
  return {
    id: null,
    title: '',
    description: '',
    published: true,
    allowRepeat: true,
    questions: [
      {
        localKey: `nq_${Date.now()}`,
        id: '',
        type: 'single',
        text: '',
        optionsText: 'Да\nНет',
      },
    ],
  };
}

function surveyToDraft(s) {
  return {
    id: s.id,
    title: s.title || '',
    description: s.description || '',
    published: !!s.published,
    allowRepeat: !s.oneSubmissionPerVisitor,
    questions: (Array.isArray(s.questions) ? s.questions : []).map((q, i) => ({
      localKey: q.id || `nq_${i}_${Date.now()}`,
      id: q.id || '',
      type: q.type === 'multiple' || q.type === 'text' ? q.type : 'single',
      text: q.text || '',
      optionsText: Array.isArray(q.options) ? q.options.join('\n') : '',
    })),
  };
}

function draftToPayload(draft) {
  const questions = draft.questions.map((q) => {
    const opts = String(q.optionsText || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const base = {
      id: q.id || undefined,
      type: q.type,
      text: q.text.trim(),
    };
    if (q.type === 'text') return base;
    return { ...base, options: opts };
  });
  return {
    title: draft.title.trim(),
    description: draft.description.trim(),
    published: !!draft.published,
    oneSubmissionPerVisitor: !draft.allowRepeat,
    questions,
  };
}

function AdminSurveysPage() {
  const access = useAdminAccess();
  const [surveys, setSurveys] = useState([]);
  const [responseCounts, setResponseCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [expandedResponsesId, setExpandedResponsesId] = useState(null);
  const [responsesFor, setResponsesFor] = useState([]);

  const isAdmin = access && canonicalAdminRole(access) === 'administrator';

  const load = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [sRes, rRes] = await Promise.all([
        fetch(adminApiUrl('/surveys'), { headers: getAuthHeaders() }),
        fetch(adminApiUrl('/survey-responses'), { headers: getAuthHeaders() }),
      ]);
      if (!sRes.ok) throw new Error('Не удалось загрузить опросы');
      const list = await sRes.json();
      setSurveys(Array.isArray(list) ? list : []);
      if (rRes.ok) {
        const allR = await rRes.json();
        const counts = {};
        if (Array.isArray(allR)) {
          for (const row of allR) {
            const sid = row.surveyId;
            if (!sid) continue;
            counts[sid] = (counts[sid] || 0) + 1;
          }
        }
        setResponseCounts(counts);
      } else {
        setResponseCounts({});
      }
    } catch (e) {
      setError(e.message || 'Ошибка');
      setSurveys([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const publicSurveyUrl = useCallback((surveyId) => {
    if (typeof window === 'undefined') return `/survey/${surveyId}`;
    return `${window.location.origin}/survey/${surveyId}`;
  }, []);

  const copyLink = async (surveyId) => {
    const url = publicSurveyUrl(surveyId);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(surveyId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setError('Не удалось скопировать ссылку');
    }
  };

  const openCreate = () => {
    setError('');
    setDraft(emptyDraft());
  };

  const openEdit = (s) => {
    setError('');
    const d = surveyToDraft(s);
    if (!d.questions.length) {
      d.questions = [
        {
          localKey: `nq_${Date.now()}`,
          id: '',
          type: 'single',
          text: '',
          optionsText: 'Вариант 1\nВариант 2',
        },
      ];
    }
    setDraft(d);
  };

  const closeDraft = () => {
    if (saving) return;
    setDraft(null);
  };

  const saveDraft = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError('Введите название опроса');
      return;
    }
    const badQ = draft.questions.find((q) => !q.text.trim());
    if (badQ) {
      setError('У каждого вопроса должен быть текст');
      return;
    }
    for (const q of draft.questions) {
      if (q.type !== 'text') {
        const n = String(q.optionsText || '')
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean).length;
        if (n < 2) {
          setError('Для вопроса с вариантами нужно минимум 2 непустые строки');
          return;
        }
      }
    }
    setError('');
    const payload = draftToPayload(draft);
    setSaving(true);
    try {
      if (draft.id) {
        const res = await fetch(adminApiUrl(`/surveys/${draft.id}`), {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Ошибка сохранения');
        }
      } else {
        const res = await fetch(adminApiUrl('/surveys'), {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'Ошибка создания');
        }
        const created = await res.json();
        if (created?.id) {
          await copyLink(created.id);
        }
      }
      setDraft(null);
      await load();
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const deleteSurvey = async (surveyId) => {
    if (!window.confirm('Удалить опрос? Ответы в архиве останутся.')) return;
    setError('');
    try {
      const res = await fetch(adminApiUrl(`/surveys/${surveyId}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Не удалось удалить');
      if (expandedResponsesId === surveyId) {
        setExpandedResponsesId(null);
        setResponsesFor([]);
      }
      await load();
    } catch (e) {
      setError(e.message || 'Ошибка');
    }
  };

  const loadResponsesFor = async (surveyId) => {
    if (expandedResponsesId === surveyId) {
      setExpandedResponsesId(null);
      setResponsesFor([]);
      return;
    }
    setExpandedResponsesId(surveyId);
    setResponsesFor([]);
    try {
      const res = await fetch(adminApiUrl(`/surveys/${surveyId}/responses`), { headers: getAuthHeaders() });
      if (!res.ok) throw new Error('Ошибка загрузки ответов');
      const data = await res.json();
      setResponsesFor(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || 'Ошибка');
    }
  };

  const updateQuestion = (localKey, patch) => {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        questions: d.questions.map((q) => (q.localKey === localKey ? { ...q, ...patch } : q)),
      };
    });
  };

  const addQuestion = () => {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        questions: [
          ...d.questions,
          {
            localKey: `nq_${Date.now()}`,
            id: '',
            type: 'single',
            text: '',
            optionsText: 'Вариант 1\nВариант 2',
          },
        ],
      };
    });
  };

  const removeQuestion = (localKey) => {
    setDraft((d) => {
      if (!d || d.questions.length <= 1) return d;
      return { ...d, questions: d.questions.filter((q) => q.localKey !== localKey) };
    });
  };

  const sortedSurveys = useMemo(() => {
    return [...surveys].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  }, [surveys]);

  if (!access) return <p className="smk-page__loading">Загрузка…</p>;
  if (!isAdmin) return <Navigate to="/admin" replace />;

  return (
    <div className="admin-news-page smk-page">
      <div className="admin-news-header">
        <h1 className="admin-news-title">Опросы</h1>
        <div className="admin-news-actions">
          <Link to="/admin" className="admin-btn admin-btn-secondary" style={{ textDecoration: 'none' }}>
            ← Админ-панель
          </Link>
          <button type="button" className="admin-btn admin-btn-primary" onClick={openCreate}>
            Новый опрос
          </button>
        </div>
      </div>

      <p className="admin-form-hint" style={{ marginTop: -8, marginBottom: 16 }}>
        Опросы в стиле коротких форм: варианты ответа и свободный текст. Ссылка для сотрудников — без входа на портал (если опрос
        опубликован).
      </p>

      {error && <p className="admin-news-error">{error}</p>}

      {loading ? (
        <p className="smk-page__loading">Загрузка…</p>
      ) : (
        <div className="smk-content">
          <div className="smk-list">
            {sortedSurveys.length === 0 ? (
              <p className="smk-page__empty">Пока нет опросов. Нажмите «Новый опрос».</p>
            ) : (
              sortedSurveys.map((s) => (
                <div key={s.id} className="smk-item smk-item--file" style={{ flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <span className="smk-item__icon smk-item__icon--file">📋</span>
                  <div className="smk-item__name" style={{ flex: '1 1 220px', minWidth: 0, whiteSpace: 'normal' }}>
                    <strong>{s.title}</strong>
                    <div className="admin-form-hint" style={{ marginTop: 6, marginBottom: 0 }}>
                      {s.published ? (
                        <span style={{ color: 'var(--accent, #0a7)' }}>Опубликован</span>
                      ) : (
                        <span>Черновик — по ссылке недоступен</span>
                      )}
                      {' · '}
                      Ответов: {responseCounts[s.id] ?? 0}
                      {s.oneSubmissionPerVisitor ? ' · один ответ на пользователя портала' : ' · один пользователь может проходить несколько раз'}
                    </div>
                  </div>
                  <div className="smk-item__actions" style={{ flexWrap: 'wrap' }}>
                    <button type="button" className="smk-item__btn" onClick={() => copyLink(s.id)}>
                      {copiedId === s.id ? 'Скопировано' : 'Ссылка'}
                    </button>
                    <button type="button" className="smk-item__btn" onClick={() => openEdit(s)}>
                      Изменить
                    </button>
                    <button type="button" className="smk-item__btn" onClick={() => loadResponsesFor(s.id)}>
                      {expandedResponsesId === s.id ? 'Скрыть ответы' : 'Ответы'}
                    </button>
                    <button
                      type="button"
                      className="smk-item__btn smk-item__btn--danger"
                      onClick={() => deleteSurvey(s.id)}
                    >
                      Удалить
                    </button>
                  </div>
                  {expandedResponsesId === s.id && (
                    <div style={{ width: '100%', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-color, rgba(0,0,0,0.08))' }}>
                      {responsesFor.length === 0 ? (
                        <p className="admin-form-hint">Нет ответов.</p>
                      ) : (
                        <ul className="admin-surveys-responses-list">
                          {responsesFor.map((r) => (
                            <li key={r.id}>
                              <code className="admin-surveys-responses-meta">{r.submittedAt}</code>
                              <pre className="admin-surveys-responses-json">{JSON.stringify(r.answers, null, 2)}</pre>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {draft && (
        <div className="smk-modal-overlay" onClick={closeDraft}>
          <div className="smk-modal smk-modal--wide" onClick={(e) => e.stopPropagation()}>
            <div className="smk-modal-header">
              <h3>{draft.id ? 'Редактирование опроса' : 'Новый опрос'}</h3>
              <button type="button" className="viewer-btn viewer-close" onClick={closeDraft} disabled={saving}>
                ✕
              </button>
            </div>

            <div className="admin-surveys-modal-body">
            <label className="smk-modal-label">
              Название
              <input
                type="text"
                className="smk-modal-input"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Например: Оценка мероприятия"
                disabled={saving}
              />
            </label>

            <label className="smk-modal-label">
              Описание (необязательно)
              <textarea
                className="smk-modal-input"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                disabled={saving}
              />
            </label>

            <label className="admin-surveys-check-row">
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
                disabled={saving}
              />
              <span>Опубликовать (доступен по ссылке без входа)</span>
            </label>

            <label className="admin-surveys-check-row">
              <input
                type="checkbox"
                checked={draft.allowRepeat}
                onChange={(e) => setDraft({ ...draft, allowRepeat: e.target.checked })}
                disabled={saving}
              />
              <span>Разрешить одному и тому же пользователю портала проходить опрос несколько раз</span>
            </label>
            <p className="admin-form-hint" style={{ marginTop: -4, marginBottom: 16 }}>
              Если снять галочку, каждый сотрудник сможет отправить ответ только один раз (учётная запись, как при входе на портал).
              Ссылку нужно открывать после входа в портал.
            </p>

            <div className="admin-surveys-questions-head">Вопросы</div>

            {draft.questions.map((q, idx) => (
              <div key={q.localKey} className="admin-surveys-q-card">
                <div className="admin-surveys-q-card-head">
                  <span>Вопрос {idx + 1}</span>
                  {draft.questions.length > 1 && (
                    <button
                      type="button"
                      className="viewer-btn"
                      disabled={saving}
                      onClick={() => removeQuestion(q.localKey)}
                    >
                      Удалить
                    </button>
                  )}
                </div>
                <label className="smk-modal-label">
                  Тип
                  <select
                    className="smk-modal-input"
                    value={q.type}
                    onChange={(e) => updateQuestion(q.localKey, { type: e.target.value })}
                    disabled={saving}
                  >
                    <option value="single">Один вариант</option>
                    <option value="multiple">Несколько вариантов</option>
                    <option value="text">Свободный ответ</option>
                  </select>
                </label>
                <label className="smk-modal-label">
                  Текст вопроса
                  <input
                    type="text"
                    className="smk-modal-input"
                    value={q.text}
                    onChange={(e) => updateQuestion(q.localKey, { text: e.target.value })}
                    disabled={saving}
                  />
                </label>
                {q.type !== 'text' && (
                  <label className="smk-modal-label">
                    Варианты (каждый с новой строки)
                    <textarea
                      className="smk-modal-input"
                      rows={4}
                      value={q.optionsText}
                      onChange={(e) => updateQuestion(q.localKey, { optionsText: e.target.value })}
                      disabled={saving}
                    />
                  </label>
                )}
              </div>
            ))}

            <button type="button" className="admin-btn admin-btn-secondary admin-surveys-add-q" disabled={saving} onClick={addQuestion}>
              + Вопрос
            </button>

            {draft.id && (
              <p className="admin-form-hint" style={{ marginTop: 16 }}>
                Ссылка:{' '}
                <a href={publicSurveyUrl(draft.id)} target="_blank" rel="noreferrer">
                  {publicSurveyUrl(draft.id)}
                </a>
              </p>
            )}

            <div className="smk-modal-actions" style={{ marginTop: 20 }}>
              <button type="button" className="viewer-btn" onClick={closeDraft} disabled={saving}>
                Отмена
              </button>
              <button type="button" className="viewer-btn viewer-btn-approve" onClick={saveDraft} disabled={saving}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSurveysPage;
