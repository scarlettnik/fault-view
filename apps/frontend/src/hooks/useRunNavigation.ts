import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { serverMode } from '../core/workspaceApi';
import type { PlanInput } from '../core/model';
import { useAppDispatch } from '../store';
import { executePlan } from '../store/operations';

export function useRunNavigation(projectId: string) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  async function startRun(plan: PlanInput) {
    setStarting(true);
    try {
      const task = dispatch(executePlan({ projectId, plan }));
      const id = serverMode ? (await task.unwrap()).id : task.requestId;
      void navigate(`/projects/${projectId}/runs/${id}`);
    } finally {
      setStarting(false);
    }
  }
  return { startRun, starting };
}
