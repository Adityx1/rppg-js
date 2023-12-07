// eslint-disable-next-line no-undef
export const workerInstance = new ComlinkWorker(
  new URL("../sw/worker", import.meta.url)
);
