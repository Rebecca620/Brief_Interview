import { createLibraryStorage } from './library-storage.js';
/** The native host exists only in the signed/bundled Mac shell. Web behavior stays unchanged. */
export const desktop = () => window.briefHost;
export const reportStorage =
  typeof window === 'undefined' ? {} : createLibraryStorage(window.briefHost);
export async function binaryPayload(name, type, body) {
  const blob = body instanceof Blob ? body : new Blob([body], { type });
  const limit = type === 'application/json' ? 256 : 20;
  if (blob.size > limit * 1024 * 1024)
    throw Error(`Use a file below ${limit} MB for native sharing.`);
  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(Error('Could not prepare this file.'));
    reader.readAsDataURL(blob);
  });
  return { name, type: blob.type || type, data };
}
