import { vaultStorageNative } from './vaultStorageNative';

export interface VaultFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface VaultItem {
  id: string;
  folderId?: string; // undefined or 'root' means All or Root
  type: 'image' | 'video' | 'file';
  dataUrl: string;
  name: string;
  dateAdded: number;
  size?: number;
  privatePath?: string; // Internal private storage path (/data/user/0/.../vault_media/...)
}

const VAULT_PASS_KEY = 'rls_vault_pass_hash_secure';
const VAULT_ITEMS_KEY = 'rls_vault_secure_items_store';
const VAULT_FOLDERS_KEY = 'rls_vault_secure_folders_store';
const VAULT_RECOVERY_Q_KEY = 'rls_vault_recovery_q';
const VAULT_RECOVERY_A_KEY = 'rls_vault_recovery_a_hash';
const AUTH_RESET_FLAG = 'rls_vault_auth_reset_v3';

// IndexedDB Storage Helpers
const DB_NAME = 'rls_vault_db_v1';
const DB_VERSION = 1;
const STORE_NAME = 'vault_items';

function openVaultDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbGetAllItems(): Promise<VaultItem[]> {
  try {
    const db = await openVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function idbSaveItem(item: VaultItem): Promise<boolean> {
  try {
    const db = await openVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(item);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

async function idbDeleteItem(id: string): Promise<boolean> {
  try {
    const db = await openVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

async function idbDeleteItemsBatch(ids: string[]): Promise<boolean> {
  try {
    const db = await openVaultDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      ids.forEach(id => store.delete(id));
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'rls_salt_secure_2026_v2');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

class VaultService {
  private isUnlocked: boolean = false;
  private isPickingFile: boolean = false;
  private cachedItems: VaultItem[] = [];
  private subscribers = new Set<(unlocked: boolean) => void>();

  constructor() {
    if (typeof document !== 'undefined') {
      const resetFlag = localStorage.getItem(AUTH_RESET_FLAG);
      if (!resetFlag) {
        localStorage.removeItem(VAULT_PASS_KEY);
        localStorage.removeItem(VAULT_RECOVERY_Q_KEY);
        localStorage.removeItem(VAULT_RECOVERY_A_KEY);
        localStorage.setItem(AUTH_RESET_FLAG, 'true');
      }

      document.addEventListener('visibilitychange', () => {
        // Crucial fix: Do NOT lock vault if the user is currently selecting a file in system photo picker
        if (document.hidden && !this.isPickingFile) {
          this.lockVault();
        }
      });
    }
  }

  public setFilePicking(active: boolean) {
    this.isPickingFile = active;
  }

  public async hasPassword(): Promise<boolean> {
    try {
      const stored = localStorage.getItem(VAULT_PASS_KEY);
      return Boolean(stored);
    } catch {
      return false;
    }
  }

  public getRecoveryQuestion(): string | null {
    try {
      return localStorage.getItem(VAULT_RECOVERY_Q_KEY);
    } catch {
      return null;
    }
  }

  public async createPassword(pass: string, recoveryQ: string, recoveryA: string): Promise<boolean> {
    try {
      const passHash = await hashString(pass);
      const answerHash = await hashString(recoveryA.trim().toLowerCase());
      
      localStorage.setItem(VAULT_PASS_KEY, passHash);
      localStorage.setItem(VAULT_RECOVERY_Q_KEY, recoveryQ.trim());
      localStorage.setItem(VAULT_RECOVERY_A_KEY, answerHash);

      this.isUnlocked = true;
      await this.loadItemsFromStore();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  public async verifyPassword(pass: string): Promise<boolean> {
    try {
      const stored = localStorage.getItem(VAULT_PASS_KEY);
      if (!stored) return false;
      const hash = await hashString(pass);
      const isValid = hash === stored;
      if (isValid) {
        this.isUnlocked = true;
        await this.loadItemsFromStore();
        this.notify();
      }
      return isValid;
    } catch {
      return false;
    }
  }

  public async verifyRecovery(recoveryA: string): Promise<boolean> {
    try {
      const storedAnsHash = localStorage.getItem(VAULT_RECOVERY_A_KEY);
      if (!storedAnsHash) return false;
      const inputHash = await hashString(recoveryA.trim().toLowerCase());
      return inputHash === storedAnsHash;
    } catch {
      return false;
    }
  }

  public async resetPasswordWithRecovery(recoveryA: string, newPass: string): Promise<boolean> {
    try {
      const isValidAns = await this.verifyRecovery(recoveryA);
      if (!isValidAns) return false;

      const newPassHash = await hashString(newPass);
      localStorage.setItem(VAULT_PASS_KEY, newPassHash);

      this.isUnlocked = true;
      await this.loadItemsFromStore();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  public async changePassword(oldPass: string, newPass: string): Promise<boolean> {
    try {
      const isOldValid = await this.verifyPassword(oldPass);
      if (!isOldValid) return false;

      const newPassHash = await hashString(newPass);
      localStorage.setItem(VAULT_PASS_KEY, newPassHash);

      this.isUnlocked = true;
      this.notify();
      return true;
    } catch {
      return false;
    }
  }

  public getUnlockedStatus(): boolean {
    return this.isUnlocked;
  }

  public lockVault() {
    this.isUnlocked = false;
    this.isPickingFile = false;
    this.cachedItems = [];
    this.notify();
  }

  public subscribe(cb: (unlocked: boolean) => void) {
    this.subscribers.add(cb);
    cb(this.isUnlocked);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private notify() {
    for (const cb of this.subscribers) {
      cb(this.isUnlocked);
    }
  }

  // FOLDERS MANAGEMENT
  public getFolders(): VaultFolder[] {
    if (!this.isUnlocked) return [];
    try {
      const raw = localStorage.getItem(VAULT_FOLDERS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(f => f && f.id && f.name);
    } catch {
      return [];
    }
  }

  public createFolder(name: string): VaultFolder | null {
    if (!this.isUnlocked || !name.trim()) return null;
    try {
      const folders = this.getFolders();
      const newFolder: VaultFolder = {
        id: 'folder-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
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
    if (!this.isUnlocked || !newName.trim()) return false;
    try {
      const folders = this.getFolders();
      const folder = folders.find(f => f.id === folderId);
      if (!folder) return false;
      folder.name = newName.trim();
      localStorage.setItem(VAULT_FOLDERS_KEY, JSON.stringify(folders));
      return true;
    } catch {
      return false;
    }
  }

  public deleteFolder(folderId: string): boolean {
    if (!this.isUnlocked) return false;
    try {
      let folders = this.getFolders();
      folders = folders.filter(f => f.id !== folderId);
      localStorage.setItem(VAULT_FOLDERS_KEY, JSON.stringify(folders));

      this.cachedItems = this.cachedItems.map(item => {
        if (item.folderId === folderId) {
          return { ...item, folderId: undefined };
        }
        return item;
      });
      this.saveItemsToLocalStorageFallback();
      return true;
    } catch {
      return false;
    }
  }

  // VAULT ITEMS MANAGEMENT
  private async loadItemsFromStore(): Promise<VaultItem[]> {
    if (!this.isUnlocked) {
      this.cachedItems = [];
      return [];
    }

    // First try IndexedDB
    let items = await idbGetAllItems();

    // Fallback or merge from localStorage if IndexedDB had no items
    if (!items || items.length === 0) {
      try {
        const raw = localStorage.getItem(VAULT_ITEMS_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            items = parsed.filter(item => item && item.id && item.dataUrl);
            // Migrate to IndexedDB
            items.forEach(item => idbSaveItem(item));
          }
        }
      } catch {}
    }

    // Auto-migration & validation for genuinely private storage on native Android
    if (items && items.length > 0 && vaultStorageNative.isNative()) {
      for (const item of items) {
        try {
          if (item.privatePath) {
            // Verify file actually exists in app-private internal storage
            const check = await vaultStorageNative.verifyFileExists(item.privatePath);
            if (check.exists && check.webUrl) {
              item.dataUrl = check.webUrl;
            } else if (item.dataUrl && !item.dataUrl.startsWith('http://localhost/_capacitor_file_')) {
              // Re-save if file was missing from internal storage
              const migrated = await vaultStorageNative.saveFileToPrivateVault({
                base64Data: item.dataUrl,
                fileName: item.name,
                mimeType: item.type === 'video' ? 'video/mp4' : 'image/jpeg',
              });
              if (migrated && migrated.verified) {
                item.privatePath = migrated.filePath;
                item.dataUrl = migrated.webUrl;
                item.size = migrated.size || item.size;
                await idbSaveItem(item);
              }
            }
          } else if (item.dataUrl) {
            // Legacy item stored as base64 or public URI: migrate into private internal storage
            const isPublicUri = item.dataUrl.startsWith('content://') || item.dataUrl.startsWith('file://');
            const migrated = await vaultStorageNative.saveFileToPrivateVault({
              uri: isPublicUri ? item.dataUrl : undefined,
              base64Data: isPublicUri ? undefined : item.dataUrl,
              fileName: item.name,
              mimeType: item.type === 'video' ? 'video/mp4' : 'image/jpeg',
            });
            if (migrated && migrated.verified) {
              item.privatePath = migrated.filePath;
              item.dataUrl = migrated.webUrl;
              item.size = migrated.size || item.size;
              await idbSaveItem(item);
            }
          }
        } catch (migErr) {
          console.warn('Migration error for vault item:', item.id, migErr);
        }
      }
    }

    this.cachedItems = items || [];
    return this.cachedItems;
  }

  public getVaultItems(): VaultItem[] {
    if (!this.isUnlocked) return [];
    return this.cachedItems;
  }

  public async addVaultItem(item: {
    folderId?: string;
    type: 'image' | 'video' | 'file';
    dataUrl: string;
    uri?: string;
    name: string;
    size?: number;
    privatePath?: string;
    isMove?: boolean;
  }): Promise<boolean> {
    if (!this.isUnlocked) return false;
    try {
      let finalPath = item.privatePath;
      let finalWebUrl = item.dataUrl;
      let finalSize = item.size || 0;

      // Ensure file is saved & verified inside private internal storage (/data/user/0/.../vault_media/)
      if (!finalPath || !finalWebUrl.includes('_capacitor_file_')) {
        const savedResult = await vaultStorageNative.saveFileToPrivateVault({
          uri: item.uri,
          base64Data: item.dataUrl,
          fileName: item.name,
          mimeType: item.type === 'video' ? 'video/mp4' : 'image/jpeg',
          isMove: item.isMove,
        });

        if (!savedResult || !savedResult.verified) {
          console.error('Failed to verify private vault file save');
          return false;
        }

        finalPath = savedResult.filePath;
        finalWebUrl = savedResult.webUrl;
        finalSize = savedResult.size;
      }

      const newItem: VaultItem = {
        id: 'vault-item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        folderId: item.folderId,
        type: item.type,
        dataUrl: finalWebUrl,
        name: item.name,
        dateAdded: Date.now(),
        size: finalSize,
        privatePath: finalPath,
      };

      this.cachedItems.unshift(newItem);

      // Save to IndexedDB (handles large images & videos without quota limits)
      const idbSuccess = await idbSaveItem(newItem);

      // Also attempt localStorage fallback
      this.saveItemsToLocalStorageFallback();

      return idbSuccess || true;
    } catch (e) {
      console.error('Error adding vault item:', e);
      return false;
    }
  }

  public async deleteVaultItem(id: string): Promise<boolean> {
    if (!this.isUnlocked) return false;
    try {
      const itemToDelete = this.cachedItems.find(i => i.id === id);
      if (itemToDelete?.privatePath) {
        await vaultStorageNative.deletePrivateFile(itemToDelete.privatePath);
      }
      this.cachedItems = this.cachedItems.filter(i => i.id !== id);
      await idbDeleteItem(id);
      this.saveItemsToLocalStorageFallback();
      return true;
    } catch {
      return false;
    }
  }

  public async deleteVaultItemsBatch(ids: string[]): Promise<boolean> {
    if (!this.isUnlocked || !Array.isArray(ids)) return false;
    try {
      const pathsToDelete: string[] = [];
      this.cachedItems.forEach(item => {
        if (ids.includes(item.id) && item.privatePath) {
          pathsToDelete.push(item.privatePath);
        }
      });

      if (pathsToDelete.length > 0) {
        await vaultStorageNative.deletePrivateFilesBatch(pathsToDelete);
      }

      this.cachedItems = this.cachedItems.filter(i => !ids.includes(i.id));
      await idbDeleteItemsBatch(ids);
      this.saveItemsToLocalStorageFallback();
      return true;
    } catch {
      return false;
    }
  }

  public moveItemsToFolder(ids: string[], targetFolderId?: string): boolean {
    if (!this.isUnlocked || !Array.isArray(ids)) return false;
    try {
      this.cachedItems = this.cachedItems.map(item => {
        if (ids.includes(item.id)) {
          const updated = { ...item, folderId: targetFolderId };
          idbSaveItem(updated);
          return updated;
        }
        return item;
      });
      this.saveItemsToLocalStorageFallback();
      return true;
    } catch {
      return false;
    }
  }

  public async copyItemsToFolder(ids: string[], targetFolderId?: string): Promise<boolean> {
    if (!this.isUnlocked || !Array.isArray(ids)) return false;
    try {
      const newCopies: VaultItem[] = [];
      for (const item of this.cachedItems) {
        if (ids.includes(item.id)) {
          let newPrivatePath = item.privatePath;
          let newWebUrl = item.dataUrl;

          // Duplicate the private file in internal storage so deleting one copy does not affect the other
          if (item.privatePath && vaultStorageNative.isNative()) {
            try {
              const dup = await vaultStorageNative.saveFileToPrivateVault({
                uri: item.privatePath,
                fileName: item.name,
                mimeType: item.type === 'video' ? 'video/mp4' : 'image/jpeg',
              });
              if (dup && dup.verified) {
                newPrivatePath = dup.filePath;
                newWebUrl = dup.webUrl;
              }
            } catch {}
          }

          const copyItem: VaultItem = {
            ...item,
            id: 'vault-item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            folderId: targetFolderId,
            dateAdded: Date.now(),
            name: item.name.includes('(Copy)') ? item.name : `${item.name} (Copy)`,
            privatePath: newPrivatePath,
            dataUrl: newWebUrl,
          };
          newCopies.push(copyItem);
          await idbSaveItem(copyItem);
        }
      }
      this.cachedItems = [...newCopies, ...this.cachedItems];
      this.saveItemsToLocalStorageFallback();
      return true;
    } catch {
      return false;
    }
  }

  public renameVaultItem(id: string, newName: string): boolean {
    if (!this.isUnlocked || !newName.trim()) return false;
    try {
      const item = this.cachedItems.find(i => i.id === id);
      if (!item) return false;
      item.name = newName.trim();
      idbSaveItem(item);
      this.saveItemsToLocalStorageFallback();
      return true;
    } catch {
      return false;
    }
  }

  private saveItemsToLocalStorageFallback() {
    try {
      // Save metadata / small items to localStorage if quota allows
      localStorage.setItem(VAULT_ITEMS_KEY, JSON.stringify(this.cachedItems));
    } catch {
      // Ignore quota exceeded errors as IndexedDB holds full data
    }
  }

  public async exportBackup(currentPass: string): Promise<string | null> {
    try {
      const isValid = await this.verifyPassword(currentPass);
      if (!isValid) return null;

      const items = this.getVaultItems();
      const folders = this.getFolders();
      const passHash = localStorage.getItem(VAULT_PASS_KEY);
      const recoveryQ = localStorage.getItem(VAULT_RECOVERY_Q_KEY);
      const recoveryAHash = localStorage.getItem(VAULT_RECOVERY_A_KEY);

      const backupPayload = {
        version: 3,
        createdAt: Date.now(),
        passHash,
        recoveryQ,
        recoveryAHash,
        folders,
        items,
      };

      return JSON.stringify(backupPayload);
    } catch {
      return null;
    }
  }

  public async restoreBackup(backupJsonString: string, currentPass: string): Promise<boolean> {
    try {
      const parsed = JSON.parse(backupJsonString);
      if (!parsed || !parsed.passHash || !Array.isArray(parsed.items)) {
        return false;
      }

      const passHash = await hashString(currentPass);
      if (passHash !== parsed.passHash) {
        return false;
      }

      localStorage.setItem(VAULT_PASS_KEY, parsed.passHash);
      if (parsed.folders && Array.isArray(parsed.folders)) {
        localStorage.setItem(VAULT_FOLDERS_KEY, JSON.stringify(parsed.folders));
      }
      if (parsed.recoveryQ) localStorage.setItem(VAULT_RECOVERY_Q_KEY, parsed.recoveryQ);
      if (parsed.recoveryAHash) localStorage.setItem(VAULT_RECOVERY_A_KEY, parsed.recoveryAHash);

      // Restore items into IndexedDB
      for (const item of parsed.items) {
        if (item && item.id && item.dataUrl) {
          await idbSaveItem(item);
        }
      }

      this.isUnlocked = true;
      await this.loadItemsFromStore();
      this.notify();
      return true;
    } catch {
      return false;
    }
  }
}

export const vaultService = new VaultService();
