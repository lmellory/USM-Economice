import React, { useEffect, useRef, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, X } from 'lucide-react';
import {
  ATTACHMENT_ACCEPT,
  attachmentMime,
  fileSize,
  HomeworkAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_HOMEWORK_ATTACHMENTS,
} from '@usm/shared';
import { apiBase, request, tg } from '../lib/api.js';

type Pending = { id: string; file: File };
export function useHomeworkAttachments(initialId?: string) {
  const [items, setItems] = useState<HomeworkAttachment[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const pendingRef = useRef<Pending[]>([]);
  const [loading, setLoading] = useState(Boolean(initialId));
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  useEffect(() => {
    if (!initialId) return;
    let current = true;
    request<HomeworkAttachment[]>('/api/homework/' + initialId + '/attachments')
      .then((data) => {
        if (current) {
          setItems(data);
          setError('');
        }
      })
      .catch((e) => {
        if (current) setError(e.message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [initialId]);
  const updatePending = (next: Pending[]) => {
    pendingRef.current = next;
    setPending(next);
  };
  const add = (files: File[]) => {
    setError('');
    if (items.length + pendingRef.current.length + files.length > MAX_HOMEWORK_ATTACHMENTS) {
      setError('Можно прикрепить до 5 файлов к заданию.');
      return;
    }
    if (files.some((f) => !f.size || f.size > MAX_ATTACHMENT_BYTES)) {
      setError('Выбери непустые файлы размером до 25 МБ каждый.');
      return;
    }
    if (files.some((f) => !attachmentMime(f.name))) {
      setError('Поддерживаются JPG, PNG, WebP, PDF, Word, Excel, PowerPoint и TXT.');
      return;
    }
    updatePending([
      ...pendingRef.current,
      ...files.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);
  };
  const flush = async (id: string) => {
    for (const entry of [...pendingRef.current]) {
      setProgress('Загружаем: ' + entry.file.name);
      try {
        const saved = await request<HomeworkAttachment>('/api/homework/' + id + '/attachments', {
          method: 'POST',
          body: entry.file,
          headers: {
            'content-type': attachmentMime(entry.file.name) || 'application/octet-stream',
            'x-file-name': encodeURIComponent(entry.file.name),
            'x-upload-id': entry.id,
          },
          signal: AbortSignal.timeout(90000),
        });
        setItems((all) => (all.some((x) => x.id === saved.id) ? all : [...all, saved]));
        updatePending(pendingRef.current.filter((x) => x.id !== entry.id));
      } finally {
        setProgress('');
      }
    }
  };
  const remove = async (id: string) => {
    await request('/api/files/' + id, { method: 'DELETE' });
    setItems((all) => all.filter((x) => x.id !== id));
  };
  return {
    items,
    pending,
    loading,
    error,
    progress,
    add,
    flush,
    remove,
    removePending: (id: string) => updatePending(pendingRef.current.filter((x) => x.id !== id)),
  };
}

export function HomeworkAttachments({
  files,
  disabled,
}: {
  files: ReturnType<typeof useHomeworkAttachments>;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [confirm, setConfirm] = useState('');
  const [preview, setPreview] = useState('');
  const [downloadUrl, setDownloadUrl] = useState<{ url: string; name: string } | null>(null);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );
  const open = async (item: HomeworkAttachment) => {
    setError('');
    setBusy(item.id);
    setDownloadUrl(null);
    try {
      if (item.mime.startsWith('image/')) {
        const response = await fetch(apiBase + '/api/files/' + item.id, {
          headers: { 'x-telegram-init-data': tg?.initData || '' },
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok)
          throw new Error((await response.json()).error || 'Не удалось открыть фотографию.');
        setPreview(URL.createObjectURL(await response.blob()));
      } else {
        const link = await request<{ url: string; name: string }>(
          '/api/files/' + item.id + '/link'
        );
        if (
          typeof tg?.downloadFile === 'function' &&
          (!tg.isVersionAtLeast || tg.isVersionAtLeast('8.0'))
        )
          tg.downloadFile({ url: link.url, file_name: link.name });
        else setDownloadUrl(link);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };
  return (
    <section className="hw-files" aria-label="Вложения к заданию">
      <div className="hw-files-heading">
        <b>
          <Paperclip size={16} /> Вложения
        </b>
        <small>{files.items.length + files.pending.length}/5</small>
      </div>
      <p>Фото задания, методичка или конспект. До 25 МБ на файл.</p>
      {files.loading && <p role="status">Загружаем список файлов…</p>}
      {files.items.map((item) => (
        <div className="hw-file" key={item.id}>
          <button
            type="button"
            className="hw-file-open"
            disabled={Boolean(busy) || disabled}
            onClick={() => void open(item)}
          >
            {item.mime.startsWith('image/') ? <ImageIcon size={20} /> : <FileText size={20} />}
            <span>
              <b>{item.name}</b>
              <small>{busy === item.id ? 'Открываем…' : fileSize(item.size)}</small>
            </span>
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={'Удалить вложение: ' + item.name}
            disabled={Boolean(busy) || disabled}
            onClick={() => setConfirm(item.id)}
          >
            <Trash2 size={17} />
          </button>
          {confirm === item.id && (
            <div className="hw-file-confirm">
              <span>Удалить файл?</span>
              <button
                type="button"
                disabled={Boolean(busy) || disabled}
                onClick={async () => {
                  setBusy(item.id);
                  setError('');
                  try {
                    await files.remove(item.id);
                    setConfirm('');
                  } catch (e: any) {
                    setError(e.message);
                  } finally {
                    setBusy('');
                  }
                }}
              >
                Удалить
              </button>
              <button type="button" onClick={() => setConfirm('')}>
                Отмена
              </button>
            </div>
          )}
        </div>
      ))}
      {files.pending.map((entry) => (
        <div className="hw-file pending" key={entry.id}>
          <FileText size={20} />
          <span>
            <b>{entry.file.name}</b>
            <small>{fileSize(entry.file.size)} · загрузится при сохранении</small>
          </span>
          <button
            type="button"
            className="icon-btn"
            disabled={disabled}
            aria-label={'Убрать файл: ' + entry.file.name}
            onClick={() => files.removePending(entry.id)}
          >
            <X size={17} />
          </button>
        </div>
      ))}
      {files.items.length + files.pending.length < 5 && (
        <button
          type="button"
          className="hw-file-add"
          disabled={disabled || files.loading}
          onClick={() => input.current?.click()}
        >
          <Paperclip size={17} /> Прикрепить фото или файл
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        hidden
        aria-label="Выбрать вложения"
        disabled={disabled || files.loading}
        onChange={(e) => {
          files.add(Array.from(e.target.files || []));
          e.target.value = '';
        }}
      />
      {preview && (
        <div className="hw-file-preview">
          <button type="button" onClick={() => setPreview('')} aria-label="Закрыть фотографию">
            <X size={18} />
          </button>
          <img src={preview} alt="Прикреплённая фотография задания" />
        </div>
      )}
      {downloadUrl && (
        <a
          className="hw-file-download"
          href={downloadUrl.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download size={16} /> Скачать {downloadUrl.name}
        </a>
      )}
      {(files.error || error) && (
        <p className="form-error" role="alert">
          {files.error || error}
        </p>
      )}
      {files.progress && <p role="status">{files.progress}</p>}
    </section>
  );
}
