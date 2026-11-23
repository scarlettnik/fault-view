import { useRef, useState } from 'react';
import { useAppDispatch } from '../store';
import { routeExcluded, routeRestored } from '../store/workspace';
import { updateProject } from '../store/server';
import { serverMode } from '../core/workspaceApi';
import { messageFor, type Project } from '../core/model';

export function useRouteExclusion(project: Project) {
  const dispatch = useAppDispatch();
  const [error, setError] = useState('');
  const saving = useRef(false);
  async function setExcluded(routeId: string, excluded: boolean) {
    const payload = { projectId: project.id, routeId };
    if (!serverMode) {
      dispatch(excluded ? routeExcluded(payload) : routeRestored(payload));
      return;
    }
    if (saving.current) return;
    saving.current = true;
    setError('');
    const unavailable = excluded
      ? [...new Set([...project.excludedRouteIds, routeId])]
      : project.excludedRouteIds.filter((id) => id !== routeId);
    try {
      await dispatch(
        updateProject({ id: project.id, settings: { excludedRouteIds: unavailable } }),
      ).unwrap();
    } catch (value) {
      setError(messageFor(value));
    } finally {
      saving.current = false;
    }
  }
  return { setExcluded, exclusionError: error };
}
