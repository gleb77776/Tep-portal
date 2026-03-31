import React, { useState, useRef } from 'react';
import { APPROVERS } from '../data/projects';

function UploadVersionModal({ document, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [comment, setComment] = useState('');
  const [sendForApproval, setSendForApproval] = useState(false);
  const [approverId, setApproverId] = useState('auto');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadDone, setUploadDone] = useState(false);
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const handleFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    // Имитация загрузки (в проде — POST на API)
    await new Promise((r) => setTimeout(r, 800));
    setUploading(false);
    setUploadDone(true);
    onSuccess?.({ file, comment, sendForApproval, approverId });
  };

  const handleClose = () => {
    if (!uploading) onClose();
  };

  return (
    <div className="upload-modal-overlay" onClick={handleClose}>
      <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
        <div className="upload-modal-header">
          <h3>Загрузка новой версии</h3>
          <button type="button" className="viewer-btn viewer-close" onClick={handleClose}>
            ✕
          </button>
        </div>

        {uploadDone ? (
          <div className="upload-modal-success">
            <p className="upload-success-icon">✓</p>
            <p><strong>Версия успешно загружена</strong></p>
            <p className="upload-success-note">
              {sendForApproval
                ? `Создана задача для согласующего: ${APPROVERS.find((a) => a.id === approverId)?.name || 'Ответственный руководитель'}`
                : 'Документ сохранён как черновик'}
            </p>
            <button type="button" className="viewer-btn viewer-btn-approve" onClick={handleClose}>
              Закрыть
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="upload-modal-form">
            <p className="upload-doc-name">Документ: {document?.name}</p>

            <div
              className={`upload-dropzone ${isDragging ? 'upload-dropzone--active' : ''} ${file ? 'upload-dropzone--filled' : ''}`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="upload-input-hidden"
                onChange={handleFileSelect}
                accept=".pdf,.dwg,.docx,.xlsx,.png,.jpg,.jpeg"
              />
              {file ? (
                <span className="upload-file-name">📄 {file.name}</span>
              ) : (
                <>
                  <span className="upload-dropzone-text">Перетащите файл сюда или нажмите для выбора</span>
                  <span className="upload-dropzone-hint">PDF, DWG, DOCX, XLSX, изображения</span>
                </>
              )}
            </div>

            <label className="upload-field">
              <span>Комментарий к версии:</span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Опишите изменения в новой версии..."
                rows={3}
                className="upload-textarea"
              />
            </label>

            <label className="upload-checkbox">
              <input
                type="checkbox"
                checked={sendForApproval}
                onChange={(e) => setSendForApproval(e.target.checked)}
              />
              <span>Отправить на согласование</span>
            </label>
            <p className="upload-hint">
              При включении после загрузки автоматически создаётся задача для ответственного руководителя
            </p>

            {sendForApproval && (
              <label className="upload-field">
                <span>Согласующий:</span>
                <select
                  value={approverId}
                  onChange={(e) => setApproverId(e.target.value)}
                  className="upload-select"
                >
                  {APPROVERS.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="upload-modal-actions">
              <button type="button" className="viewer-btn" onClick={handleClose}>
                Отмена
              </button>
              <button
                type="submit"
                className="viewer-btn viewer-btn-approve"
                disabled={!file || uploading}
              >
                {uploading ? 'Загрузка...' : 'Загрузить'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default UploadVersionModal;
