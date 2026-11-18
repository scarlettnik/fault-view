import { useState } from 'react';
import { useAppDispatch } from '../store';
import { prepareLocalPlan } from '../store/operations';
import type { PlanInput } from '../core/model';

export function usePreparedPlan(projectId: string) {
  const dispatch = useAppDispatch();
  const [isPreparing, setPreparing] = useState(false);
  async function prepare(input: PlanInput) {
    setPreparing(true);
    try {
      return await dispatch(prepareLocalPlan({ projectId, input })).unwrap();
    } finally {
      setPreparing(false);
    }
  }
  return { prepare, isPreparing };
}
