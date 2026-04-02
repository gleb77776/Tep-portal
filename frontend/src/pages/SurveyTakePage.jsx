import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { backendUrl } from '../backendUrl';

function SurveyTakePage() {
  const { id } = useParams();
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    setDone(false);
    setAnswers({});
    try {
      const res = await fetch(backendUrl(`/api/v1/survey/${encodeURIComponent(id)}`));
      if (res.status === 404) {
        setError('Опрос не найден или ещё не опубликован.');
        setSurvey(null);
        return;
      }
      if (!res.ok) throw new Error('Не удалось загрузить опрос');
      const data = await res.json();
      setSurvey(data);
    } catch (e) {
      setError(e.message || 'Ошибка сети');
      setSurvey(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const setSingle = (qid, value) => {
    setAnswers((a) => ({ ...a, [qid]: value }));
  };

  const toggleMultiple = (qid, option, checked) => {
    setAnswers((a) => {
      const prev = Array.isArray(a[qid]) ? [...a[qid]] : [];
      if (checked) {
        if (!prev.includes(option)) prev.push(option);
      } else {
        const i = prev.indexOf(option);
        if (i >= 0) prev.splice(i, 1);
      }
      return { ...a, [qid]: prev };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!survey) return;
    for (const q of survey.questions || []) {
      if (q.type === 'text') {
        if (!String(answers[q.id] ?? '').trim()) {
          setError(`Ответьте на вопрос: «${q.text}»`);
          return;
        }
      } else if (q.type === 'single') {
        if (!answers[q.id]) {
          setError(`Выберите вариант в вопросе: «${q.text}»`);
          return;
        }
      } else if (q.type === 'multiple') {
        const arr = answers[q.id];
        if (!Array.isArray(arr) || arr.length === 0) {
          setError(`Отметьте хотя бы один вариант: «${q.text}»`);
          return;
        }
      }
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(backendUrl(`/api/v1/survey/${encodeURIComponent(id)}/submit`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(j.error || 'Не удалось отправить ответы');
      }
      setDone(true);
    } catch (err) {
      setError(err.message || 'Ошибка');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="survey-take-page">
        <p className="survey-take-muted">Загрузка…</p>
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="survey-take-page">
        <p className="survey-take-error">{error}</p>
        <Link to="/">На главную</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="survey-take-page">
        <h1 className="survey-take-title">Спасибо!</h1>
        <p className="survey-take-muted">Ваши ответы записаны.</p>
        <Link to="/">На главную</Link>
      </div>
    );
  }

  if (!survey) return null;

  return (
    <div className="survey-take-page">
      <h1 className="survey-take-title">{survey.title}</h1>
      {survey.description ? <p className="survey-take-desc">{survey.description}</p> : null}

      <form onSubmit={submit} className="survey-take-form">
        {(survey.questions || []).map((q, i) => (
          <fieldset key={q.id || i} className="survey-take-block">
            <legend className="survey-take-q-title">
              {i + 1}. {q.text}
            </legend>
            {q.type === 'text' && (
              <textarea
                className="survey-take-textarea"
                rows={4}
                value={answers[q.id] || ''}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
              />
            )}
            {q.type === 'single' &&
              (q.options || []).map((opt) => (
                <label key={opt} className="survey-take-option">
                  <input
                    type="radio"
                    name={`q_${q.id}`}
                    value={opt}
                    checked={answers[q.id] === opt}
                    onChange={() => setSingle(q.id, opt)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            {q.type === 'multiple' &&
              (q.options || []).map((opt) => (
                <label key={opt} className="survey-take-option">
                  <input
                    type="checkbox"
                    checked={Array.isArray(answers[q.id]) && answers[q.id].includes(opt)}
                    onChange={(e) => toggleMultiple(q.id, opt, e.target.checked)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
          </fieldset>
        ))}

        {error && <div className="survey-take-error">{error}</div>}

        <button type="submit" className="survey-take-submit" disabled={submitting}>
          {submitting ? 'Отправка…' : 'Отправить'}
        </button>
      </form>
    </div>
  );
}

export default SurveyTakePage;
