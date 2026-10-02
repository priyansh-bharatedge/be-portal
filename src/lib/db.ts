const DB_NAME = 'be_portal_db';
const DB_VERSION = 2;
const STORE_DOCUMENTS = 'deal_documents';
const STORE_DEALS = 'deals_store';

export const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_DOCUMENTS)) {
        db.createObjectStore(STORE_DOCUMENTS);
      }
      if (!db.objectStoreNames.contains(STORE_DEALS)) {
        db.createObjectStore(STORE_DEALS, { keyPath: 'id' });
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

/**
 * Saves a list of deals into IndexedDB for persistent storage of 10,000+ records.
 * Clears existing store and replaces with new dataset.
 */
export const saveAllDealsToIndexedDB = async (deals: any[]): Promise<void> => {
  if (!Array.isArray(deals) || deals.length === 0) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_DEALS, 'readwrite');
    const store = transaction.objectStore(STORE_DEALS);
    
    // Clear and put all in single transaction
    store.clear();
    for (const deal of deals) {
      if (deal && deal.id) {
        store.put(deal);
      }
    }
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * Upserts a batch of deals into IndexedDB without clearing existing deals.
 * Ideal for streaming batches of 200 records.
 */
export const bulkUpsertDealsToIndexedDB = async (deals: any[]): Promise<void> => {
  if (!Array.isArray(deals) || deals.length === 0) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_DEALS, 'readwrite');
    const store = transaction.objectStore(STORE_DEALS);
    
    for (const deal of deals) {
      if (deal && deal.id) {
        store.put(deal);
      }
    }
    
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

/**
 * Returns total count of deals stored in IndexedDB instantly.
 */
export const getDealsCountFromIndexedDB = async (): Promise<number> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_DEALS, 'readonly');
      const store = transaction.objectStore(STORE_DEALS);
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB count error:', err);
    return 0;
  }
};

/**
 * Retrieves all saved deals from IndexedDB.
 */
export const getAllDealsFromIndexedDB = async (): Promise<any[]> => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_DEALS, 'readonly');
      const store = transaction.objectStore(STORE_DEALS);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn('IndexedDB read error:', err);
    return [];
  }
};

/**
 * Saves or updates a single deal in IndexedDB.
 */
export const saveDealToIndexedDB = async (deal: any): Promise<void> => {
  if (!deal || !deal.id) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_DEALS, 'readwrite');
    const store = transaction.objectStore(STORE_DEALS);
    const request = store.put(deal);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Deletes a deal from IndexedDB by ID.
 */
export const deleteDealFromIndexedDB = async (id: string): Promise<void> => {
  if (!id) return;
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_DEALS, 'readwrite');
    const store = transaction.objectStore(STORE_DEALS);
    const request = store.delete(id);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

/**
 * Clears all deals from IndexedDB.
 */
export const clearDealsFromIndexedDB = async (): Promise<void> => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_DEALS, 'readwrite');
    const store = transaction.objectStore(STORE_DEALS);
    const request = store.clear();
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

