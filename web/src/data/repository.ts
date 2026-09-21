export const STORAGE_KEY = 'morgan-el-pirata:home-prototype:v1';
export interface Repository {
  read(): string | null;
  write(raw: string): void;
  subscribe(listener: () => void): () => void;
}
