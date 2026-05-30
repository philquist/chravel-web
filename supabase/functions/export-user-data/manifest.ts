export type UserDataTableStatus = 'included' | 'empty' | 'skipped_optional' | 'failed_required';

export interface UserDataTableManifestEntry {
  table: string;
  description: string;
  status: UserDataTableStatus;
  rowCount: number;
  required: boolean;
  error?: string;
}

export const REQUIRED_USER_DATA_TABLES = new Set([
  'profiles',
  'user_preferences',
  'notification_preferences',
  'trip_members',
  'trip_files',
]);

export const createManifestEntry = ({
  table,
  description,
  rowCount,
  error,
}: {
  table: string;
  description: string;
  rowCount?: number;
  error?: string;
}): UserDataTableManifestEntry => {
  const required = REQUIRED_USER_DATA_TABLES.has(table);

  if (error) {
    return {
      table,
      description,
      status: required ? 'failed_required' : 'skipped_optional',
      rowCount: 0,
      required,
      error,
    };
  }

  return {
    table,
    description,
    status: rowCount && rowCount > 0 ? 'included' : 'empty',
    rowCount: rowCount ?? 0,
    required,
  };
};

export const hasRequiredExportFailures = (manifest: UserDataTableManifestEntry[]): boolean =>
  manifest.some(entry => entry.status === 'failed_required');
