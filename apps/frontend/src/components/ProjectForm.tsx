import { Button } from './Button';
import { useState, type SubmitEvent } from 'react';
import { UploadSimpleIcon, FileCodeIcon } from '@phosphor-icons/react';
import { projectInputSchema, type ProjectInput } from '../core/model';
import { parseLocalSpecification } from '../core/localEngine';

interface Props {
  initial?: ProjectInput;
  onSave: (input: ProjectInput) => void;
}
export function ProjectForm({ initial, onSave }: Props) {
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    description: initial?.description ?? '',
    frontendUrl: initial?.frontendUrl ?? '',
    maxPages: initial?.maxPages ?? 10,
  });
  const [file, setFile] = useState({
    name: initial?.specificationName ?? '',
    source: initial?.specification ?? '',
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState('');
  const [reading, setReading] = useState(false);
  async function readFile(value?: File) {
    setFileError('');
    if (!value) return;
    if (!/\.(json|ya?ml)$/i.test(value.name)) {
      setFileError('Загрузите JSON, YAML или YML.');
      return;
    }
    if (value.size > 900_000) {
      setFileError('Файл должен быть меньше 900 КБ.');
      return;
    }
    setReading(true);
    try {
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
        reader.readAsText(value);
      });
      setFile({ name: value.name, source });
      setFields((old) => ({ ...old, specification: '', specificationName: '' }));
    } catch {
      setFileError('Не удалось прочитать файл. Попробуйте выбрать его снова.');
    } finally {
      setReading(false);
    }
  }
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = projectInputSchema.safeParse({
      ...form,
      specification: file.source,
      specificationName: file.name,
    });
    if (!parsed.success) {
      setFields(
        Object.fromEntries(parsed.error.issues.map((issue) => [issue.path[0], issue.message])),
      );
      return;
    }
    try {
      parseLocalSpecification(parsed.data.specification);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : 'Некорректный OpenAPI.');
      return;
    }
    setFields({});
    onSave(parsed.data);
  }
  return (
    <form className="project-form" onSubmit={submit} noValidate>
      <div className="form-section">
        <div>
          <h2>Приложение</h2>
        </div>
      </div>
      <div className="field">
        <label htmlFor="project-name">Название проекта</label>
        <input
          id="project-name"
          value={form.name}
          maxLength={80}
          placeholder="Например, Storefront"
          onChange={(event) => setForm({ ...form, name: event.target.value })}
          aria-invalid={!!fields.name}
          aria-describedby={fields.name ? 'name-error' : undefined}
        />
        <span id="name-error" className="field-error">
          {fields.name}
        </span>
      </div>
      <div className="field">
        <label htmlFor="frontend-url">Адрес приложения</label>
        <input
          id="frontend-url"
          type="url"
          value={form.frontendUrl}
          placeholder="https://your-app.example"
          onChange={(event) => setForm({ ...form, frontendUrl: event.target.value })}
          aria-invalid={!!fields.frontendUrl}
          aria-describedby={fields.frontendUrl ? 'url-error' : undefined}
        />
        <span id="url-error" className="field-error">
          {fields.frontendUrl}
        </span>
      </div>
      <div className="field">
        <label htmlFor="description">
          Описание <span className="muted">· необязательно</span>
        </label>
        <textarea
          id="description"
          rows={2}
          maxLength={400}
          value={form.description}
          placeholder="Для чего этот проект"
          onChange={(event) => setForm({ ...form, description: event.target.value })}
        />
      </div>
      <div className="form-section">
        <div>
          <h2>Спецификация API</h2>
          <p className="muted">OpenAPI 3.0 или 3.1. JSON / YAML, до 900 КБ.</p>
        </div>
      </div>
      <label className={`file-drop ${file.name ? 'has-file' : ''}`} htmlFor="openapi-file">
        {file.name ? <FileCodeIcon size={30} /> : <UploadSimpleIcon size={30} />}
        <strong>{reading ? 'Читаем файл…' : file.name || 'Выберите файл OpenAPI'}</strong>
        <input
          id="openapi-file"
          aria-label="Файл OpenAPI"
          type="file"
          accept=".json,.yaml,.yml"
          disabled={reading}
          onChange={(event) => {
            void readFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </label>
      {fileError ? (
        <p role="alert" className="field-error">
          {fileError}
        </p>
      ) : null}
      <span className="field-error">{fields.specification || fields.specificationName}</span>
      <div className="field compact">
        <label htmlFor="page-limit">Лимит страниц</label>
        <input
          id="page-limit"
          type="number"
          min={1}
          max={20}
          value={form.maxPages}
          onChange={(event) => setForm({ ...form, maxPages: Number(event.target.value) })}
          aria-invalid={!!fields.maxPages}
        />
        <span className="field-error">{fields.maxPages}</span>
        <span className="muted">От 1 до 20 страниц локального сценария.</span>
      </div>
      <div className="form-actions">
        <Button type="submit" busy={reading}>
          Сохранить проект
        </Button>
      </div>
    </form>
  );
}
