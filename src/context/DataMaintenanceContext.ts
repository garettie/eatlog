import { createContext, useContext } from 'react';

import type { OwnershipProgressEvent, OwnershipResult } from '../services/dataOwnership.types';

export type MaintenanceTask = (
  reportProgress: (event: OwnershipProgressEvent) => void,
) => Promise<OwnershipResult>;

export interface DataMaintenanceContextValue {
  runDataMaintenance: (label: string, task: MaintenanceTask) => Promise<OwnershipResult>;
}

export const DataMaintenanceContext = createContext<DataMaintenanceContextValue | null>(null);

export function useDataMaintenance(): DataMaintenanceContextValue {
  const value = useContext(DataMaintenanceContext);
  if (!value) throw new Error('Data maintenance is unavailable.');
  return value;
}
