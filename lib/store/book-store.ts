import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiGet, apiDelete } from '@/lib/api-client';
import { createLogger } from '@/lib/logger';

const log = createLogger('BookStore');

export interface Book {
  id: string;
  title: string;
  pageCount: number;
  status: 'compiled' | 'compiling' | 'planning';
  coverGradient: string;
  createdAt: string;
}

/** Server-side BookSummary returned by GET /api/v1/book */
interface ServerBookSummary {
  id: string;
  title: string;
  status: string;
  chapterCount: number;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Map a server BookStatus to the local Book status union */
function mapServerStatus(serverStatus: string): Book['status'] {
  switch (serverStatus) {
    case 'ready':
      return 'compiled';
    case 'compiling':
      return 'compiling';
    default:
      // 'draft', 'spine_ready', 'error', 'archived' all map to 'planning'
      return 'planning';
  }
}

/** Map a server BookSummary to the local Book interface */
function mapServerBook(server: ServerBookSummary): Book {
  return {
    id: server.id,
    title: server.title,
    pageCount: server.pageCount,
    status: mapServerStatus(server.status),
    coverGradient: '',
    createdAt: server.createdAt,
  };
}

interface BookState {
  books: Book[];
  /** True after the first syncFromServer call completes (prevents duplicate fetches) */
  synced: boolean;
  addBook: (b: Book) => void;
  removeBook: (id: string) => void;
  updateBook: (id: string, updates: Partial<Book>) => void;
  // Server sync methods
  syncFromServer: () => Promise<void>;
  deleteBookOnServer: (id: string) => Promise<void>;
}

// Module-level flag to prevent concurrent sync calls
let syncInProgress = false;

export const useBookStore = create<BookState>()(
  persist(
    (set, get) => ({
      books: [],
      synced: false,

      addBook: (b) =>
        set((state) => ({
          books: [...state.books, b],
        })),

      removeBook: (id) =>
        set((state) => ({
          books: state.books.filter((b) => b.id !== id),
        })),

      updateBook: (id, updates) =>
        set((state) => ({
          books: state.books.map((b) =>
            b.id === id ? { ...b, ...updates } : b
          ),
        })),

      // ------------------------------------------------------------------
      // Server sync (non-blocking — errors caught and logged silently)
      // ------------------------------------------------------------------

      syncFromServer: async () => {
        if (syncInProgress || get().synced) return;
        syncInProgress = true;
        try {
          const serverBooks = await apiGet<ServerBookSummary[]>(
            '/api/v1/book',
          );
          const mapped = serverBooks.map(mapServerBook);
          set({ books: mapped, synced: true });
          log.info('Books synced from server:', mapped.length);
        } catch (err) {
          log.warn('Failed to sync books from server:', err);
          // Mark synced even on failure to prevent retry loops
          set({ synced: true });
        } finally {
          syncInProgress = false;
        }
      },

      deleteBookOnServer: async (id) => {
        try {
          await apiDelete(`/api/v1/book/${id}`);
          // Remove from local state on success
          set((state) => ({
            books: state.books.filter((b) => b.id !== id),
          }));
          log.info('Book deleted on server:', id);
        } catch (err) {
          log.warn('Failed to delete book on server:', err);
        }
      },
    }),
    {
      name: 'sl-book-storage',
      partialize: (state) => {
        // Exclude synced so syncFromServer runs on each page load.
        // Methods are functions and automatically stripped by JSON serialization.
        const { synced: _synced, ...rest } = state;
        void _synced; // suppress unused-var lint
        return rest;
      },
    }
  )
);
