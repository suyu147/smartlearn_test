import type { StoreApi, UseBoundStore } from 'zustand';

type ExtractState<S> = S extends { getState: () => infer T } ? T : never;

export function createSelectors<S extends UseBoundStore<StoreApi<object>>>(
  store: S,
) {
  const useStore = <K>(selector: (state: ExtractState<S>) => K): K => {
    return store(selector as (state: object) => K) as K;
  };

  Object.assign(useStore, store);

  return useStore as typeof store;
}
