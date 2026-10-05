import { registerPlugin, Capacitor } from '@capacitor/core';

export interface SavedVaultFileResult {
  success: boolean;
  verified: boolean;
  fileName: string;
  filePath: string;
  webUrl: string;
  size: number;
}

export interface PickedVaultMediaItem {
  name: string;
  type: 'image' | 'video' | 'file';
  size: number;
  filePath: string;
  webUrl: string;
  verified: boolean;
}

interface VaultStoragePluginInterface {
  saveFileToVault(options: {
    uri?: string;
    base64Data?: string;
    fileName?: string;
    mimeType?: string;
    isMove?: boolean;
  }): Promise<SavedVaultFileResult>;

  deleteVaultFile(options: { filePath: string }): Promise<{ success: boolean; deleted: boolean }>;

  deleteVaultFilesBatch(options: { filePaths: string[] }): Promise<{ success: boolean }>;

  checkVaultFile(options: { filePath: string }): Promise<{ exists: boolean; size: number; webUrl?: string }>;

  pickAndImportMedia(options?: { isMove?: boolean }): Promise<{ items: PickedVaultMediaItem[] }>;
}

const VaultStorage = registerPlugin<VaultStoragePluginInterface>('VaultStorage');

export class VaultStorageNativeService {
  public isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  /**
   * Copies file bytes from an Android content:// URI, file:// URI, or base64 data
   * directly into the application's private internal storage (/data/user/0/.../files/vault_media/).
   * Verifies the target file exists and is non-empty before returning.
   */
  public async saveFileToPrivateVault(options: {
    uri?: string;
    base64Data?: string;
    fileName: string;
    mimeType?: string;
    isMove?: boolean;
  }): Promise<SavedVaultFileResult> {
    if (this.isNative()) {
      try {
        const result = await VaultStorage.saveFileToVault(options);
        if (!result || !result.verified) {
          throw new Error('Private file verification failed on device storage.');
        }
        return result;
      } catch (err: any) {
        console.error('Failed to save to private native vault storage:', err);
        throw err;
      }
    }

    // Web / Browser Fallback for preview & testing environments
    const base64 = options.base64Data || options.uri || '';
    const uniqueName = 'web_vault_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
    return {
      success: true,
      verified: true,
      fileName: uniqueName,
      filePath: 'indexeddb://vault_media/' + uniqueName,
      webUrl: base64,
      size: base64.length,
    };
  }

  /**
   * Deletes a private vault file from internal app storage.
   */
  public async deletePrivateFile(filePath: string): Promise<boolean> {
    if (!filePath) return true;
    if (this.isNative()) {
      try {
        const res = await VaultStorage.deleteVaultFile({ filePath });
        return Boolean(res && res.success);
      } catch (err) {
        console.warn('Could not delete native private vault file:', filePath, err);
        return false;
      }
    }
    return true;
  }

  /**
   * Batch deletes private vault files from internal app storage.
   */
  public async deletePrivateFilesBatch(filePaths: string[]): Promise<boolean> {
    if (!filePaths || filePaths.length === 0) return true;
    if (this.isNative()) {
      try {
        const res = await VaultStorage.deleteVaultFilesBatch({ filePaths });
        return Boolean(res && res.success);
      } catch (err) {
        console.warn('Could not delete native private vault files batch:', err);
        return false;
      }
    }
    return true;
  }

  /**
   * Checks if a private vault file exists in internal storage and returns its web URL.
   */
  public async verifyFileExists(filePath: string): Promise<{ exists: boolean; size: number; webUrl?: string }> {
    if (!filePath) return { exists: false, size: 0 };
    if (this.isNative()) {
      try {
        return await VaultStorage.checkVaultFile({ filePath });
      } catch {
        return { exists: false, size: 0 };
      }
    }
    return { exists: true, size: 0 };
  }

  /**
   * Directly triggers the Android system photo/video picker and streams chosen files
   * directly into the app-private internal storage without exposing them to MediaStore.
   */
  public async pickAndImportMedia(isMove = false): Promise<PickedVaultMediaItem[]> {
    if (this.isNative()) {
      try {
        const res = await VaultStorage.pickAndImportMedia({ isMove });
        return res?.items || [];
      } catch (err) {
        console.warn('Native picker error, fallback to standard file input:', err);
        return [];
      }
    }
    return [];
  }
}

export const vaultStorageNative = new VaultStorageNativeService();
