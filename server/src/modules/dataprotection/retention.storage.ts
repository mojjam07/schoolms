// The ONE place to connect file cleanup to your storage code (Supabase bucket or local folder).
// Until you fill this in, the cleanup reports "unattached files: not connected" and leaves every file alone.
//
// Replace the body with a call to whatever your upload module uses to delete an object by its storage key, for example:
//   import { removeObject } from '../../services/storage';
//   export const storageDelete: StorageDelete | null = (key) => removeObject(key);
export type StorageDelete = (storageKey: string) => Promise<void>;
export const storageDelete: StorageDelete | null = null;
