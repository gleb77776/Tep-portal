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
    published: false,
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

  const publicSurveyUrl = useCallback((id) => {
    if (typeof window === 'undefined') return `/survey/${id}`;
    return `${window.location.origin}/survey/${id}`;
  }, []);

  const copyLink = async (id) => {
    const url = publicSurveyUrl(id);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
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

  const closeDraft = () => setDraft(null);

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
      closeDraft();
      await load();
    } catch (e) {
      setError(e.message || 'Ошибка');
    } finally {
      setSaving(false);
    }
  };

  const deleteSurvey = async (id) => {
    if (!window.confirm('Удалить опрос? Ответы в архиве останутся.')) return;
    setError('');
    try {
      const res = await fetch(adminApiUrl(`/surveys/${id}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error('Не удалось удалить');
      if (expandedResponsesId === id) {
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

  if (!access) return <p className="admin-news-loading">Загрузка…</p>;
  if (!isAdmin) return <Navigate to="/admin" replace />;

  return (
    <div className="admin-news-page">
      <div className="admin-news-header">
        <h1 className="admin-news-title">Опросы</h1>
        <div className="admin-news-actions">
          <Link to="/admin" className="admin-news-btn admin-news-btn--ghost">
            ← Назад
          </Link>
          <button type="button" className="admin-news-btn admin-news-btn--primary" onClick={openCreate}>
            Новый опрос
          </button>
        </div>
      </div>

      {error && <div className="admin-news-error">{error}</div>}

      {loading ? (
        <p className="admin-news-loading">Загрузка…</p>
      ) : (
        <div className="admin-news-list">
          {sortedSurveys.length === 0 ? (
            <p className="admin-news-empty">Пока нет опросов. Создайте первый.</p>
          ) : (
            sortedSurveys.map((s) => (
              <div key={s.id} className="admin-news-row" style={{ flexWrap: 'wrap', gap: 8 }}>
                <div className="admin-news-row-text" style={{ flex: '1 1 200px', minWidth: 0 }}>
                  <strong>{s.title}</strong>
                  <div className="admin-news-row-date">
                    {s.published ? (
                      <span style={{ color: 'var(--accent, #0a7)' }}>Опубликован</span>
                    ) : (
                      <span>Черновик (по ссылке недоступен)</span>
                    )}
                    {' · '}
                    Ответов: {responseCounts[s.id] ?? 0}
                  </div>
                </div>
                <div className="admin-news-row-btns" style={{ flexWrap: 'wrap' }}>
                  <button type="button" className="admin-news-btn admin-news-btn--small" onClick={() => copyLink(s.id)}>
                    {copiedId === s.id ? 'Скопировано' : 'Ссылка'}
                  </button>
                  <button type="button" className="admin-news-btn admin-news-btn--small" onClick={() => openEdit(s)}>
                    Изменить
                  </button>
                  <button type="button" className="admin-news-btn admin-news-btn--small" onClick={() => loadResponsesFor(s.id)}>
                    {expandedResponsesId === s.id ? 'Скрыть ответы' : 'Ответы'}
                  </button>
                  <button type="button" className="admin-news-btn admin-news-btn--small" onClick={() => deleteSurvey(s.id)}>
                    Удалить
                  </button>
                </div>
                {expandedResponsesId === s.id && (
                  <div style={{ width: '100%', marginTop: 8, fontSize: 13, opacity: 0.95 }}>
                    {responsesFor.length === 0 ? (
                      <p>Нет ответов.</p>
                    ) : (
                      <ul style={{ margin: 0, paddingLeft: 18, maxHeight: 280, overflow: 'auto' }}>
                        {responsesFor.map((r) => (
                          <li key={r.id} style={{ marginBottom: 10 }}>
                            <code style={{ fontSize: 11 }}>{r.submittedAt}</code>
                            <pre
                              style={{
                                margin: '4px 0 0',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                fontSize: 12,
                                background: 'var(--card-bg, rgba(0,0,0,0.04))',
                                padding: 8,
                                borderRadius: 6,
                              }}
                            >
                              {JSON.stringify(r.answers, null, 2)}
                            </pre>
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
      )}

      {draft && (
        <div className="admin-news-modal">
          <div className="admin-news-modal-backdrop" onClick={closeDraft} aria-hidden />
          <div className="admin-news-modal-content" style={{ maxWidth: 640, maxHeight: '90vh', overflow: 'auto' }}>
            <h2 className="admin-news-modal-title">{draft.id ? 'Редактирование опроса' : 'Новый опрос'}</h2>
            <label className="admin-form-label" style={{ display: 'block', marginBottom: 12 }}>
              <span>Название</span>
              <input
                className="admin-news-input"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Например: Оценка мероприятия"
              />
            </label>
            <label className="admin-form-label" style={{ display: 'block', marginBottom: 12 }}>
              <span>Описание (необязательно)</span>
              <textarea
                className="admin-news-input"
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={draft.published}
                onChange={(e) => setDraft({ ...draft, published: e.target.checked })}
              />
              Опубликовать (доступен по ссылке без входа)
            </label>

            <div style={{ fontWeight: 600, marginBottom: 8 }}>Вопросы</div>
            {draft.questions.map((q, idx) => (
              <div
                key={q.localKey}
                style={{
                  border: '1px solid var(--border-color, rgba(0,0,0,0.12))',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, opacity: 0.85 }}>Вопрос {idx + 1}</span>
                  {draft.questions.length > 1 && (
                    <button type="button" className="admin-news-btn admin-news-btn--small" onClick={() => removeQuestion(q.localKey)}>
                      Удалить
                    </button>
                  )}
                </div>
                <label className="admin-form-label" style={{ display: 'block', marginBottom: 8 }}>
                  <span>Тип</span>
                  <select
                    className="admin-news-input"
                    value={q.type}
                    onChange={(e) => updateQuestion(q.localKey, { type: e.target.value })}
                  >
                    <option value="single">Один вариант</option>
                    <option value="multiple">Несколько вариантов</option>
                    <option value="text">Свободный ответ</option>
                  </select>
                </label>
                <label className="admin-form-label" style={{ display: 'block', marginBottom: 8 }}>
                  <span>Текст вопроса</span>
                  <input
                    className="admin-news-input"
                    value={q.text}
                    onChange={(e) => updateQuestion(q.localKey, { text: e.target.value })}
                  />
                </label>
                {q.type !== 'text' && (
                  <label className="admin-form-label" style={{ display: 'block' }}>
                    <span>Варианты (каждый с новой строки)</span>
                    <textarea
                      className="admin-news-input"
                      rows={4}
                      value={q.optionsText}
                      onChange={(e) => updateQuestion(q.localKey, { optionsText: e.target.value })}
                    />
                  </label>
                )}
              </div>
            ))}
            <button type="button" className="admin-news-btn admin-news-btn--ghost" onClick={addQuestion}>
              + Вопрос
            </button>

            <div className="admin-news-modal-footer" style={{ marginTop: 20 }}>
              <button type="button" className="admin-news-btn admin-news-btn--ghost" onClick={closeDraft}>
                Отмена
              </button>
              <button type="button" className="admin-news-btn admin-news-btn--primary" disabled={saving} onClick={saveDraft}>
                {saving ? 'Сохранение…' : 'Сохранить'}
              </button>
            </div>
            {draft.id && (
              <p style={{ fontSize: 12, opacity: 0.8, marginTop: 12 }}>
                Ссылка для прохождения:{' '}
                <a href={publicSurveyUrl(draft.id)} target="_blank" rel="noreferrer">
                  {publicSurveyUrl(draft.id)}
                </a>
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminSurveysPage;
