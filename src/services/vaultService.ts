export interface VaultFolder {
  id: string;
  name: string;
  createdAt: number;
}

export interface VaultItem {
  id: string;
  folderId?: string; // undefined or 'root' means All or Root
  type: 'image' | 'video';
  dataUrl: string;
  name: string;
  dateAdded: number;
  size?: number;
}

const VAULT_PASS_KEY = 'rls_vault_pass_hash_secure';
const VAULT_ITEMS_KEY = 'rls_vault_secure_items_store';
const VAULT_FOLDERS_KEY = 'rls_vault_secure_folders_store';
const VAULT_RECOVERY_Q_KEY = 'rls_vault_recovery_q';
const VAULT_RECOVERY_A_KEY = 'rls_vault_recovery_a_hash';
const AUTH_RESET_FLAG = 'rls_vault_auth_reset_v3';

async function hashString(str: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(str + 'rls_salt_secure_2026_v2');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

class VaultService {
  private isUnlocked: boolean = false;
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
        if (document.hidden) {
          this.lockVault();
        }
      });
    }
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
      const currentItemsRaw = localStorage.getItem(VAULT_ITEMS_KEY) || '[]';
      const currentFoldersRaw = localStorage.getItem(VAULT_FOLDERS_KEY) || '[]';
      const recoveryQ = localStorage.getItem(VAULT_RECOVERY_Q_KEY) || 'Security Question';
      const recoveryAHard = localStorage.getItem(VAULT_RECOVERY_A_KEY) || '';

      localStorage.setItem(VAULT_PASS_KEY, newPassHash);
      localStorage.setItem(VAULT_ITEMS_KEY, currentItemsRaw);
      localStorage.setItem(VAULT_FOLDERS_KEY, currentFoldersRaw);
      localStorage.setItem(VAULT_RECOVERY_Q_KEY, recoveryQ);
      localStorage.setItem(VAULT_RECOVERY_A_KEY, recoveryAHard);

      this.isUnlocked = true;
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
      const currentItemsRaw = localStorage.getItem(VAULT_ITEMS_KEY) || '[]';
      const currentFoldersRaw = localStorage.getItem(VAULT_FOLDERS_KEY) || '[]';

      localStorage.setItem(VAULT_PASS_KEY, newPassHash);
      localStorage.setItem(VAULT_ITEMS_KEY, currentItemsRaw);
      localStorage.setItem(VAULT_FOLDERS_KEY, currentFoldersRaw);
      
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

      const items = this.getVaultItems();
      const updatedItems = items.map(item => {
        if (item.folderId === folderId) {
          return { ...item, folderId: undefined };
        }
        return item;
      });
      localStorage.setItem(VAULT_ITEMS_KEY, JSON.stringify(updatedItems));
      return true;
    } catch {
      return false;
    }
  }

  // VAULT ITEMS MANAGEMENT
  public getVaultItems(): VaultItem[] {
    if (!this.isUnlocked) return [];
    try {
      const raw = localStorage.getItem(VAULT_ITEMS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(item => item && item.id && item.dataUrl);
    } catch {
      return [];
    }
  }

  public addVaultItem(item: Omit<VaultItem, 'id' | 'dateAdded'>): boolean {
    if (!this.isUnlocked) return false;
    try {
      const items = this.getVaultItems();
      const newItem: VaultItem = {
        ...item,
        id: 'vault-item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        dateAdded: Date.now(),
      };
      items.unshift(newItem);
      localStorage.setItem(VAULT_ITEMS_KEY, JSON.stringify(items));
      return true;
    } catch {
      return false;
    }
  }

  public deleteVaultItem(id: string): boolean {
    if (!this.isUnlocked) return false;
    try {
      let items = this.getVaultItems();
      items = items.filter(i => i.id !== id);
      localStorage.setItem(VAULT_ITEMS_KEY, JSON.stringify(items));
      return true;
    } catch {
      return false;
    }
  }

  public deleteVaultItemsBatch(ids: string[]): boolean {
    if (!this.isUnlocked || !Array.isArray(ids)) return false;
    try {
      let items = this.getVaultItems();
      items = items.filter(i => !ids.includes(i.id));
      localStorage.setItem(VAULT_ITEMS_KEY, JSON.stringify(items));
      return true;
    } catch {
      return false;
    }
  }

  public moveItemsToFolder(ids: string[], targetFolderId?: string): boolean {
    if (!this.isUnlocked || !Array.isArray(ids)) return false;
    try {
      const items = this.getVaultItems();
      const updated = items.map(item => {
        if (ids.includes(item.id)) {
          return { ...item, folderId: targetFolderId };
        }
        return item;
      });
      localStorage.setItem(VAULT_ITEMS_KEY, JSON.stringify(updated));
      return true;
    } catch {
      return false;
    }
  }

  public copyItemsToFolder(ids: string[], targetFolderId?: string): boolean {
    if (!this.isUnlocked || !Array.isArray(ids)) return false;
    try {
      const items = this.getVaultItems();
      const newCopies: VaultItem[] = [];
      items.forEach(item => {
        if (ids.includes(item.id)) {
          newCopies.push({
            ...item,
            id: 'vault-item-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            folderId: targetFolderId,
            dateAdded: Date.now(),
            name: item.name.includes('(Copy)') ? item.name : `${item.name} (Copy)`
          });
        }
      });
      const updated = [...newCopies, ...items];
      localStorage.setItem(VAULT_ITEMS_KEY, JSON.stringify(updated));
      return true;
    } catch {
      return false;
    }
  }

  public renameVaultItem(id: string, newName: string): boolean {
    if (!this.isUnlocked || !newName.trim()) return false;
    try {
      const items = this.getVaultItems();
      const item = items.find(i => i.id === id);
      if (!item) return false;
      item.name = newName.trim();
      localStorage.setItem(VAULT_ITEMS_KEY, JSON.stringify(items));
      return true;
    } catch {
      return false;
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
      localStorage.setItem(VAULT_ITEMS_KEY, JSON.stringify(parsed.items));
      if (parsed.folders && Array.isArray(parsed.folders)) {
        localStorage.setItem(VAULT_FOLDERS_KEY, JSON.stringify(parsed.folders));
      }
      if (parsed.recoveryQ) localStorage.setItem(VAULT_RECOVERY_Q_KEY, parsed.recoveryQ);
      if (parsed.recoveryAHash) localStorage.setItem(VAULT_RECOVERY_A_KEY, parsed.recoveryAHash);

      this.isUnlocked = true;
      this.notify();
      return true;
    } catch {
      return false;
    }
  }
}

export const vaultService = new VaultService();
