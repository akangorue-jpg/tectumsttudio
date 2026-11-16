/**
 * Menú de acciones de un proyecto (renombrar, pausar, archivar, reactivar, eliminar).
 * Las acciones destructivas siempre piden confirmación.
 */
import { useCallback, useState, type FormEvent, type ReactNode } from 'react';
import { LuArchive, LuEllipsis, LuPause, LuPencil, LuPlay, LuSquarePen, LuTrash2 } from 'react-icons/lu';
import type { Project, ProjectDetail } from '../../core/types';
import { useT } from '../i18n';
import { api } from '../lib/api';
import { errorMessage, useDismiss } from '../lib/hooks';
import { useRouter } from '../lib/router';
import { Button, Field, IconButton, Input, cn } from './kit';
import { ConfirmDialog, Modal, useToast } from './overlay';

function MenuItem({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick(): void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={cn('flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm hover:bg-subtle [&>svg]:size-4', danger ? 'text-danger-ink' : '[&>svg]:text-muted')}>
      {icon}
      {label}
    </button>
  );
}

export function ProjectMenu({ project, onChanged, onDeleted }: { project: Project; onChanged(project: Project): void; onDeleted(): void }) {
  const t = useT();
  const toast = useToast();
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useDismiss(open, close);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      setDialog(null);
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: 'activo' | 'pausado' | 'archivado') => {
    close();
    void run(async () => {
      const detail = await api.patch<ProjectDetail>(`/api/projects/${project.id}`, { status });
      onChanged(detail.project);
      toast.ok(t.projects.statusChanged[status]);
    });
  };
  const rename = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const detail = await api.patch<ProjectDetail>(`/api/projects/${project.id}`, { name });
      onChanged(detail.project);
      toast.ok(t.projects.renamed);
    });
  };
  const remove = () =>
    run(async () => {
      await api.del(`/api/projects/${project.id}`);
      toast.ok(t.projects.deleted);
      onDeleted();
    });

  const inactive = project.status === 'pausado' || project.status === 'archivado';
  return (
    <div ref={ref} className="relative shrink-0">
      <IconButton label={t.projects.actions.menu} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <LuEllipsis className="size-4" />
      </IconButton>
      {open && (
        <div role="menu" className="absolute top-9 right-0 z-30 w-56 animate-[rise_0.12s_ease-out] rounded-lg border border-line bg-surface p-1 shadow-pop">
          <MenuItem
            icon={<LuSquarePen />}
            label={t.projects.actions.editSpec}
            onClick={() => {
              close();
              navigate(`/proyectos/${project.id}/especificacion`);
            }}
          />
          <MenuItem
            icon={<LuPencil />}
            label={t.projects.actions.rename}
            onClick={() => {
              close();
              setName(project.name);
              setDialog('rename');
            }}
          />
          {inactive ? <MenuItem icon={<LuPlay />} label={t.projects.actions.reactivate} onClick={() => setStatus('activo')} /> : <MenuItem icon={<LuPause />} label={t.projects.actions.pause} onClick={() => setStatus('pausado')} />}
          {project.status !== 'archivado' && <MenuItem icon={<LuArchive />} label={t.projects.actions.archive} onClick={() => setStatus('archivado')} />}
          <div className="my-1 border-t border-line" />
          <MenuItem
            icon={<LuTrash2 />}
            label={t.projects.actions.delete}
            danger
            onClick={() => {
              close();
              setDialog('delete');
            }}
          />
        </div>
      )}

      <Modal open={dialog === 'rename'} onClose={() => setDialog(null)} title={t.projects.renameTitle}>
        <form onSubmit={rename} className="flex flex-col gap-4 text-ink">
          <Field label={t.projects.nameLabel} htmlFor={`rename-${project.id}`}>
            <Input id={`rename-${project.id}`} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />
          </Field>
          <div className="flex justify-end gap-2">
            <Button onClick={() => setDialog(null)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
              {t.common.save}
            </Button>
          </div>
        </form>
      </Modal>
      <ConfirmDialog open={dialog === 'delete'} title={t.projects.deleteTitle} text={t.projects.deleteText(project.name)} confirmLabel={t.common.delete} danger busy={busy} onConfirm={() => void remove()} onClose={() => setDialog(null)} />
    </div>
  );
}
