import { STORAGE_KEY, type Repository } from './repository';
export function localStorageRepository(): Repository {
  // Access can itself throw (privacy/security policy); the store handles that.
  return {
    read: () => window.localStorage.getItem(STORAGE_KEY),
    write: raw => window.localStorage.setItem(STORAGE_KEY, raw),
    subscribe(listener) {
      const changed = (event: StorageEvent) => {
        if (event.key === STORAGE_KEY || event.key === null) listener();
      };
      window.addEventListener('storage', changed);
      return () => window.removeEventListener('storage', changed);
    },
  };
}
