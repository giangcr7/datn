import { AsyncLocalStorage } from 'node:async_hooks';

type RequestContext = { requestId: string };

const storage = new AsyncLocalStorage<RequestContext>();

export function runRequestContext(requestId: string, callback: () => void) {
  storage.run({ requestId }, callback);
}

export function currentRequestId() {
  return storage.getStore()?.requestId;
}
