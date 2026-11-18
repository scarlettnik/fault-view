import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './index';
export const selectProjects = (state: RootState) => state.workspace.projects;
export const selectBusy = (state: RootState) =>
  !!state.workspace.active || !!state.workspace.activeRun;
export const selectOperationStatus = (state: RootState) => state.operations.status;
export const selectProjectCount = createSelector([selectProjects], (projects) => projects.length);
export const selectProjectById = (state: RootState, id: string) =>
  state.workspace.projects.find((project) => project.id === id);
