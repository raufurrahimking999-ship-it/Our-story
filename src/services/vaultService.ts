import { VaultCrypto, VaultEnvelope, EncryptedBlobData } from './vaultCrypto';

export interface VaultFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface StoredVaultItem {
  id: string;
  folderId?: string;
  type: 'image' | 'video' | 'file';
  name: string;
  size: number;
  mimeType: string;
  dateAdded: number;
  encryptedMedia: EncryptedBlobData;
  encryptedThumbnail?: EncryptedBlobData;
}

export interface VaultItem {
  id: string;
  folderId?: string;
  type: 'image' | 'video' | 'file';
  dataUrl: string; // In-memory temporary decrypted Blob Object URL
  name: string;
  dateAdded: number;
  size?: number;
  mimeType?: string;
}

const VAULT_ENVELOPE_KEY = 'rls_vault_secure_envelope_v4';
const VAULT_FOLDERS_KEY = 'rls_vault_folders_v4';

const DB_NAME = 'rls_vault_secure_db_v4';
const DB_VERSION = 1;
const STORE_ITEMS = 'encrypted_media_items';

function openSecureVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported on this platform'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        db.createObjectStore(STORE_ITEMS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbGetAllStoredItems(): Promise<StoredVaultItem[]> {
  try {
    const db = await openSecureVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_ITEMS, 'readonly');
      const store = tx.objectStore(STORE_ITEMS);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as StoredVaultItem[]) || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function dbGetStoredItem(id: string): Promise<StoredVaultItem | null> {
  try {
    const db = await openSecureVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_ITEMS, 'readonly');
      const store = tx.objectStore(STORE_ITEMS);
      const req = store.get(id);
      req.onsuccess = () => resolve((req.result as StoredVaultItem) || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function dbSaveStoredItem(item: StoredVaultItem): Promise<boolean> {
  try {
    const db = await openSecureVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_ITEMS, 'readwrite');
      const store = tx.objectStore(STORE_ITEMS);
      const req = store.put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

async function dbDeleteStoredItem(id: string): Promise<boolean> {
  try {
    const db = await openSecureVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_ITEMS, 'readwrite');
      const store = tx.objectStore(STORE_ITEMS);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

async function dbDeleteStoredItemsBatch(ids: string[]): Promise<boolean> {
  try {
    const db = await openSecureVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_ITEMS, 'readwrite');
      const store = tx.objectStore(STORE_ITEMS);
      ids.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

class VaultService {
  private isUnlocked = false;
  private masterKey: CryptoKey | null = null;
  private cachedItems: VaultItem[] = [];
  private activeObjectUrls = new Set<string>();
  private subscribers = new Set<(unlocked: boolean) => void>();

  constructor() {
    // Note: Do NOT lock on visibility change because native media pickers cause document to blur/hide temporarily.
    // Locking only occurs when the user explicitly locks or closes the session.
  }

  public async hasPassword(): Promise<boolean> {
    try {
      const envelope = this.loadEnvelope();
      return Boolean(envelope && envelope.encryptedMVK);
    } catch {
      return false;
    }
  }

  private loadEnvelope(): VaultEnvelope | null {
    try {
      const raw = localStorage.getItem(VAULT_ENVELOPE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  private saveEnvelope(envelope: VaultEnvelope) {
    try {
      localStorage.setItem(VAULT_ENVELOPE_KEY, JSON.stringify(envelope));
    } catch {}
  }

  public getRecoveryQuestion(): string | null {
    const env = this.loadEnvelope();
    return env?.recoveryQuestion || 'What is our special date or memorable keyword?';
  }

  public async createPassword(password: string, recoveryQ?: string, recoveryA?: string): Promise<boolean> {
    try {
      const { envelope, masterKey } = await VaultCrypto.createEnvelope(password, recoveryQ, recoveryA);
      this.saveEnvelope(envelope);
      this.masterKey = masterKey;
      this.isUnlocked = true;
      await this.loadAndDecryptVaultItems();
      this.notify();
      return true;
    } catch (e) {
      console.error('Error creating vault password:', e);
      return false;
    }
  }

  public async verifyPassword(password: string): Promise<boolean> {
    try {
      const envelope = this.loadEnvelope();
      if (!envelope) return false;

      const key = await VaultCrypto.unlockEnvelopeWithPassword(envelope, password);
      if (!key) {
        return false;
      }

      this.masterKey = key;
      this.isUnlocked = true;
      await this.loadAndDecryptVaultItems();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  public async verifyRecovery(recoveryA: string): Promise<boolean> {
    try {
      const envelope = this.loadEnvelope();
      if (!envelope || !envelope.recoveryAnswerHash) return false;
      const cleanAnswer = recoveryA.trim().toLowerCase();
      const hash = await VaultCrypto.hashString(cleanAnswer);
      return hash === envelope.recoveryAnswerHash;
    } catch {
      return false;
    }
  }

  public async resetPasswordWithRecovery(recoveryA: string, newPass: string): Promise<boolean> {
    try {
      const envelope = this.loadEnvelope();
      if (!envelope) return false;

      const key = await VaultCrypto.unlockEnvelopeWithRecovery(envelope, recoveryA);
      if (!key) return false;

      const updatedEnvelope = await VaultCrypto.rewrapEnvelope(key, envelope, newPass);
      this.saveEnvelope(updatedEnvelope);
      this.masterKey = key;
      this.isUnlocked = true;
      await this.loadAndDecryptVaultItems();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  public async changePassword(oldPass: string, newPass: string): Promise<boolean> {
    try {
      const envelope = this.loadEnvelope();
      if (!envelope) return false;

      const key = await VaultCrypto.unlockEnvelopeWithPassword(envelope, oldPass);
      if (!key) return false;

      const updatedEnvelope = await VaultCrypto.rewrapEnvelope(key, envelope, newPass);
      this.saveEnvelope(updatedEnvelope);
      this.masterKey = key;
      this.isUnlocked = true;
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  public getUnlockedStatus(): boolean {
    return this.isUnlocked && this.masterKey !== null;
  }

  public lockVault() {
    this.isUnlocked = false;
    this.masterKey = null;
    this.clearAllObjectUrls();
    this.cachedItems = [];
    this.notify();
  }

  public subscribe(cb: (unlocked: boolean) => void): () => void {
    this.subscribers.add(cb);
    cb(this.getUnlockedStatus());
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify() {
    const status = this.getUnlockedStatus();
    for (const cb of this.subscribers) {
      try {
        cb(status);
      } catch (e) {
        console.error('Vault subscriber callback error:', e);
      }
    }
  }

  private clearAllObjectUrls() {
    for (const url of this.activeObjectUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch {}
    }
    this.activeObjectUrls.clear();
  }

  // =========================================================================
  // FOLDER MANAGEMENT
  // =========================================================================
  public getFolders(): VaultFolder[] {
    if (!this.getUnlockedStatus()) return [];
    try {
      const raw = localStorage.getItem(VAULT_FOLDERS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((f) => f && f.id && f.name);
    } catch {
      return [];
    }
  }

  public createFolder(name: string): VaultFolder | null {
    if (!this.getUnlockedStatus() || !name.trim()) return null;
    try {
      const folders = this.getFolders();
      const newFolder: VaultFolder = {
        id: 'folder-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
        name: name.trim(),
        createdAt: Date.now(),
      };
      folders.push(newFolder);
      localStorage.setItem(VAULT_FOLDERS_KEY, JSON.stringify(folders));
      return newFolder;
    } catch {
      return null;
    }
  }

  public renameFolder(folderId: string, newName: string): boolean {
    if (!this.getUnlockedStatus() || !newName.trim()) return false;
    try {
      const folders = this.getFolders();
      const folder = folders.find((f) => f.id === folderId);
      if (!folder) return false;
      folder.name = newName.trim();
      localStorage.setItem(VAULT_FOLDERS_KEY, JSON.stringify(folders));
      return true;
    } catch {
      return false;
    }
  }

  public deleteFolder(folderId: string): boolean {
    if (!this.getUnlockedStatus()) return false;
    try {
      let folders = this.getFolders();
      folders = folders.filter((f) => f.id !== folderId);
      localStorage.setItem(VAULT_FOLDERS_KEY, JSON.stringify(folders));

      // Reset items in this folder to root
      this.cachedItems = this.cachedItems.map((item) => {
        if (item.folderId === folderId) {
          dbGetStoredItem(item.id).then((stored) => {
            if (stored) {
              stored.folderId = undefined;
              dbSaveStoredItem(stored);
            }
          });
          return { ...item, folderId: undefined };
        }
        return item;
      });
      return true;
    } catch {
      return false;
    }
  }

  // =========================================================================
  // VAULT ITEMS & ENCRYPTION / DECRYPTION
  // =========================================================================
  private async loadAndDecryptVaultItems(): Promise<VaultItem[]> {
    if (!this.getUnlockedStatus() || !this.masterKey) {
      this.cachedItems = [];
      return [];
    }

    this.clearAllObjectUrls();
    const storedList = await dbGetAllStoredItems();
    const decryptedItems: VaultItem[] = [];

    for (const stored of storedList) {
      try {
        // Decrypt thumbnail if available for fast memory-efficient preview, else decrypt main payload
        const targetToDecrypt = stored.encryptedThumbnail || stored.encryptedMedia;
        const decryptedBuffer = await VaultCrypto.decryptData(targetToDecrypt, this.masterKey);
        const blob = new Blob([decryptedBuffer], { type: targetToDecrypt.mimeType || 'image/jpeg' });
        const objectUrl = URL.createObjectURL(blob);
        this.activeObjectUrls.add(objectUrl);

        decryptedItems.push({
          id: stored.id,
          folderId: stored.folderId,
          type: stored.type,
          dataUrl: objectUrl,
          name: stored.name,
          dateAdded: stored.dateAdded,
          size: stored.size,
          mimeType: stored.mimeType,
        });
      } catch (err) {
        console.warn('Could not decrypt item:', stored.id, err);
      }
    }

    this.cachedItems = decryptedItems;
    return this.cachedItems;
  }

  public getVaultItems(): VaultItem[] {
    if (!this.getUnlockedStatus()) return [];
    return this.cachedItems;
  }

  /**
   * Generates a small thumbnail from image buffer
   */
  private async generateImageThumbnail(arrayBuffer: ArrayBuffer, mimeType: string): Promise<ArrayBuffer | null> {
    if (!mimeType.startsWith('image/')) return null;
    return new Promise((resolve) => {
      try {
        const blob = new Blob([arrayBuffer], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          const maxDim = 320;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob(
            async (thumbBlob) => {
              if (thumbBlob) {
                const thumbBuf = await thumbBlob.arrayBuffer();
                resolve(thumbBuf);
              } else {
                resolve(null);
              }
            },
            'image/jpeg',
            0.75
          );
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(null);
        };
        img.src = url;
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Imports and Encrypts a File into Vault
   * 1. Read binary bytes
   * 2. Encrypt with AES-256-GCM using Master Vault Key
   * 3. Save only encrypted data in IndexedDB
   * 4. Decrypt in-memory object URL for immediate display in Vault
   */
  public async addVaultFile(
    fileOrBlob: Blob | File,
    name: string,
    folderId?: string
  ): Promise<boolean> {
    if (!this.getUnlockedStatus() || !this.masterKey) return false;

    let rawBuffer: ArrayBuffer | null = null;
    try {
      rawBuffer = await fileOrBlob.arrayBuffer();
      const mimeType = fileOrBlob.type || (name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');
      const isVideo = mimeType.startsWith('video');
      const isImage = mimeType.startsWith('image');
      const itemType: 'image' | 'video' | 'file' = isVideo ? 'video' : isImage ? 'image' : 'file';

      // 1. Encrypt full resolution binary media
      const encryptedMedia = await VaultCrypto.encryptData(rawBuffer, this.masterKey, mimeType);

      // 2. Encrypt thumbnail for fast rendering
      let encryptedThumbnail: EncryptedBlobData | undefined;
      if (isImage) {
        const thumbBuffer = await this.generateImageThumbnail(rawBuffer, mimeType);
        if (thumbBuffer) {
          encryptedThumbnail = await VaultCrypto.encryptData(thumbBuffer, this.masterKey, 'image/jpeg');
        }
      }

      const itemId = 'vault-item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
      const storedItem: StoredVaultItem = {
        id: itemId,
        folderId,
        type: itemType,
        name,
        size: fileOrBlob.size,
        mimeType,
        dateAdded: Date.now(),
        encryptedMedia,
        encryptedThumbnail,
      };

      // 3. Save to private encrypted IndexedDB
      const saved = await dbSaveStoredItem(storedItem);
      if (!saved) {
        throw new Error('Failed to persist encrypted record into database.');
      }

      // 4. Create in-memory preview object URL
      const previewData = encryptedThumbnail || encryptedMedia;
      const decryptedPreview = await VaultCrypto.decryptData(previewData, this.masterKey);
      const previewBlob = new Blob([decryptedPreview], { type: previewData.mimeType });
      const objectUrl = URL.createObjectURL(previewBlob);
      this.activeObjectUrls.add(objectUrl);

      const newItem: VaultItem = {
        id: itemId,
        folderId,
        type: itemType,
        dataUrl: objectUrl,
        name,
        dateAdded: storedItem.dateAdded,
        size: storedItem.size,
        mimeType,
      };

      this.cachedItems.unshift(newItem);
      return true;
    } catch (err) {
      console.error('Error encrypting and adding vault file:', err);
      return false;
    } finally {
      // Securely discard plaintext reference
      rawBuffer = null;
    }
  }

  /**
   * Helper for dataUrl string imports (e.g. legacy/camera captures)
   */
  public async addVaultItem(options: {
    folderId?: string;
    type?: 'image' | 'video' | 'file';
    dataUrl: string;
    name: string;
    size?: number;
  }): Promise<boolean> {
    if (!this.getUnlockedStatus() || !this.masterKey) return false;
    try {
      const res = await fetch(options.dataUrl);
      const blob = await res.blob();
      return await this.addVaultFile(blob, options.name, options.folderId);
    } catch (e) {
      console.error('Error importing dataUrl into vault:', e);
      return false;
    }
  }

  /**
   * Decrypts the full original media (full resolution image or video) for full-screen viewer
   */
  public async getDecryptedFullMediaUrl(itemId: string): Promise<string | null> {
    if (!this.getUnlockedStatus() || !this.masterKey) return null;
    try {
      const stored = await dbGetStoredItem(itemId);
      if (!stored || !stored.encryptedMedia) return null;

      const decryptedBuffer = await VaultCrypto.decryptData(stored.encryptedMedia, this.masterKey);
      const blob = new Blob([decryptedBuffer], { type: stored.mimeType || stored.encryptedMedia.mimeType });
      const fullUrl = URL.createObjectURL(blob);
      this.activeObjectUrls.add(fullUrl);
      return fullUrl;
    } catch (e) {
      console.error('Error decrypting full media:', e);
      return null;
    }
  }

  public async deleteVaultItem(id: string): Promise<boolean> {
    if (!this.getUnlockedStatus()) return false;
    try {
      await dbDeleteStoredItem(id);
      this.cachedItems = this.cachedItems.filter((i) => i.id !== id);
      return true;
    } catch {
      return false;
    }
  }

  public async deleteVaultItemsBatch(ids: string[]): Promise<boolean> {
    if (!this.getUnlockedStatus() || !Array.isArray(ids)) return false;
    try {
      await dbDeleteStoredItemsBatch(ids);
      this.cachedItems = this.cachedItems.filter((i) => !ids.includes(i.id));
      return true;
    } catch {
      return false;
    }
  }

  public moveItemsToFolder(ids: string[], targetFolderId?: string): boolean {
    if (!this.getUnlockedStatus() || !Array.isArray(ids)) return false;
    try {
      this.cachedItems = this.cachedItems.map((item) => {
        if (ids.includes(item.id)) {
          const updated = { ...item, folderId: targetFolderId };
          dbGetStoredItem(item.id).then((stored) => {
            if (stored) {
              stored.folderId = targetFolderId;
              dbSaveStoredItem(stored);
            }
          });
          return updated;
        }
        return item;
      });
      return true;
    } catch {
      return false;
    }
  }

  public async copyItemsToFolder(ids: string[], targetFolderId?: string): Promise<boolean> {
    if (!this.getUnlockedStatus() || !this.masterKey || !Array.isArray(ids)) return false;
    try {
      for (const id of ids) {
        const stored = await dbGetStoredItem(id);
        if (stored) {
          const newId = 'vault-item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
          const copyStored: StoredVaultItem = {
            ...stored,
            id: newId,
            folderId: targetFolderId,
            name: stored.name.includes('(Copy)') ? stored.name : `${stored.name} (Copy)`,
            dateAdded: Date.now(),
          };
          await dbSaveStoredItem(copyStored);
        }
      }
      await this.loadAndDecryptVaultItems();
      return true;
    } catch {
      return false;
    }
  }

  public renameVaultItem(id: string, newName: string): boolean {
    if (!this.getUnlockedStatus() || !newName.trim()) return false;
    try {
      const item = this.cachedItems.find((i) => i.id === id);
      if (!item) return false;
      item.name = newName.trim();
      dbGetStoredItem(id).then((stored) => {
        if (stored) {
          stored.name = newName.trim();
          dbSaveStoredItem(stored);
        }
      });
      return true;
    } catch {
      return false;
    }
  }

  public async exportBackup(currentPass: string): Promise<string | null> {
    try {
      const isValid = await this.verifyPassword(currentPass);
      if (!isValid) return null;

      const envelope = this.loadEnvelope();
      const folders = this.getFolders();
      const storedItems = await dbGetAllStoredItems();

      const payload = {
        version: 4,
        createdAt: Date.now(),
        envelope,
        folders,
        items: storedItems,
      };

      return JSON.stringify(payload);
    } catch {
      return null;
    }
  }

  public async restoreBackup(backupJsonString: string, currentPass: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(backupJsonString);
      if (!parsed || !parsed.envelope) return false;

      const key = await VaultCrypto.unlockEnvelopeWithPassword(parsed.envelope, currentPass);
      if (!key) return false;

      this.saveEnvelope(parsed.envelope);
      if (Array.isArray(parsed.folders)) {
        localStorage.setItem(VAULT_FOLDERS_KEY, JSON.stringify(parsed.folders));
      }

      if (Array.isArray(parsed.items)) {
        for (const item of parsed.items) {
          if (item && item.id && item.encryptedMedia) {
            await dbSaveStoredItem(item);
          }
        }
      }

      this.masterKey = key;
      this.isUnlocked = true;
      await this.loadAndDecryptVaultItems();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }
}

export const vaultService = new VaultService();
