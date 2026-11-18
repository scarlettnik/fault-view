import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightIcon, SpinnerGapIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react';
import type { Job, Project } from '../core/model';
import { downloadJson } from '../core/model';

export function PageHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [title]);
  return (
    <div className="page-heading">
      <div>
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        {description ? <p className="page-description">{description}</p> : null}
      </div>
      {actions ? <div className="heading-actions">{actions}</div> : null}
    </div>
  );
}
export function Notice({
  children,
  kind = 'info',
}: {
  children: ReactNode;
  kind?: 'info' | 'error' | 'success';
}) {
  return (
    <div className={`notice ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <WarningCircleIcon size={20} aria-hidden />
      <div>{children}</div>
    </div>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {children ? <p className="muted">{children}</p> : null}
      {action}
    </div>
  );
}
const statuses = {
  queued: 'В очереди',
  running: 'Построение графа',
  completed: 'Завершён',
  failed: 'Ошибка',
  cancelled: 'Отменён',
};
export function StatusBadge({
  status,
  label,
}: {
  status: Job['status'] | 'ready';
  label?: string;
}) {
  return (
    <span className={`badge ${status}`}>
      <span className="status-dot" />
      {label ?? (status === 'ready' ? 'Готов' : statuses[status])}
    </span>
  );
}
export function Busy({ children }: { children: ReactNode }) {
  return (
    <span className="busy">
      <SpinnerGapIcon className="spin" size={18} aria-hidden />
      {children}
    </span>
  );
}
export function ProjectExport({ project }: { project: Project }) {
  return (
    <button
      className="button secondary"
      onClick={() =>
        downloadJson(`faultview-${project.id}.json`, {
          format: 'faultview-project',
          version: 1,
          exportedAt: new Date().toISOString(),
          project,
        })
      }
    >
      Экспорт JSON <ArrowRightIcon size={16} aria-hidden />
    </button>
  );
}
export function NeedDiscovery({ projectId }: { projectId: string }) {
  return (
    <EmptyState
      title="Граф ещё не построен"
      action={
        <Link className="button primary" to={`/projects/${projectId}`}>
          Открыть проект <ArrowRightIcon aria-hidden />
        </Link>
      }
    >
      Постройте граф в обзоре проекта.
    </EmptyState>
  );
}
export function ConfirmDialog({
  title,
  children,
  confirm,
  onConfirm,
  onClose,
}: {
  title: string;
  children: ReactNode;
  confirm: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="confirm-dialog" aria-labelledby="confirm-title" onCancel={onClose}>
      <button className="icon-button dialog-close" aria-label="Закрыть диалог" onClick={onClose}>
        <XIcon size={20} />
      </button>
      <h2 id="confirm-title">{title}</h2>
      <p className="muted">{children}</p>
      <div className="dialog-actions">
        <button className="button secondary" onClick={onClose}>
          Отмена
        </button>
        <button className="button danger" onClick={onConfirm}>
          {confirm}
        </button>
      </div>
    </dialog>
  );
}
