const DB_NAME = 'be_portal_db';
const DB_VERSION = 2;
const STORE_DOCUMENTS = 'deal_documents';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        db.createObjectStore(STORE_DOCUMENTS);
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveDocument = async (id: string, file: File): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_DOCUMENTS, 'readwrite');
    const store = transaction.objectStore(STORE_DOCUMENTS);
    const request = store.put(file, id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getDocument = async (id: string): Promise<File | undefined> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_DOCUMENTS, 'readonly');
    const store = transaction.objectStore(STORE_DOCUMENTS);
    const request = store.get(id);
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const deleteDocument = async (id: string): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_DOCUMENTS, 'readwrite');
    const store = transaction.objectStore(STORE_DOCUMENTS);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

export const getAllDocuments = async (): Promise<{ id: string, file: File }[]> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_DOCUMENTS, 'readonly');
    const store = transaction.objectStore(STORE_DOCUMENTS);
    const request = store.openCursor();
    const results: { id: string, file: File }[] = [];
    
    request.onsuccess = (event: any) => {
      const cursor = event.target.result;
      if (cursor) {
        results.push({ id: cursor.key as string, file: cursor.value as File });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
};
