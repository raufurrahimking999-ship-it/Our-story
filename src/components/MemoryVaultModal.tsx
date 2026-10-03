import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, KeyRound, Plus, Trash2, Video, Image as ImageIcon, X, Eye, EyeOff, AlertCircle, Download, Upload, Settings, HelpCircle } from 'lucide-react';
import { vaultService, VaultItem } from '../services/vaultService';

interface MemoryVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MemoryVaultModal: React.FC<MemoryVaultModalProps> = ({ isOpen, onClose }) => {
  const [hasPass, setHasPass] = useState<boolean>(false);
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [confirmPasswordInput, setConfirmPasswordInput] = useState<string>('');
  const [recoveryQuestion, setRecoveryQuestion] = useState<string>('What is your anniversary or special date?');
  const [recoveryAnswer, setRecoveryAnswer] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [items, setItems] = useState<VaultItem[]>([]);
  
  // Vault view modes ('gallery' | 'settings' | 'forgot' | 'backup')
  const [vaultView, setVaultView] = useState<'gallery' | 'settings' | 'forgot' | 'backup'>('gallery');

  // Forgot password flow states
  const [forgotAnswerInput, setForgotAnswerInput] = useState<string>('');
  const [newResetPassword, setNewResetPassword] = useState<string>('');
  const [isRecoveryVerified, setIsRecoveryVerified] = useState<boolean>(false);

  // Change password state
  const [oldPassInput, setOldPassInput] = useState<string>('');
  const [newPassInput, setNewPassInput] = useState<string>('');

  // Backup / Restore state
  const [backupPassInput, setBackupPassInput] = useState<string>('');
  const [restoreFileContent, setRestoreFileContent] = useState<string | null>(null);
  const [restorePassInput, setRestorePassInput] = useState<string>('');

  // Selected media viewer state
  const [selectedItem, setSelectedItem] = useState<VaultItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkPasswordStatus();
    const unsubscribe = vaultService.subscribe((unlocked) => {
      setIsUnlocked(unlocked);
      if (unlocked) {
        setItems(vaultService.getVaultItems());
        setVaultView('gallery');
      } else {
        setItems([]);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  const checkPasswordStatus = async () => {
    const exists = await vaultService.hasPassword();
    setHasPass(exists);
    setIsUnlocked(vaultService.getUnlockedStatus());
    if (vaultService.getUnlockedStatus()) {
      setItems(vaultService.getVaultItems());
    }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!passwordInput || passwordInput.length < 4) {
      setErrorMsg('Password must be at least 4 characters.');
      return;
    }
    if (passwordInput !== confirmPasswordInput) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (!recoveryAnswer.trim()) {
      setErrorMsg('Security recovery answer is required for password recovery.');
      return;
    }

    const success = await vaultService.createPassword(passwordInput, recoveryQuestion, recoveryAnswer);
    if (success) {
      setPasswordInput('');
      setConfirmPasswordInput('');
      setRecoveryAnswer('');
      setHasPass(true);
      setIsUnlocked(true);
      setItems(vaultService.getVaultItems());
    } else {
      setErrorMsg('Failed to create password.');
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!passwordInput) {
      setErrorMsg('Please enter password.');
      return;
    }
    const success = await vaultService.verifyPassword(passwordInput);
    if (success) {
      setPasswordInput('');
      setIsUnlocked(true);
      setItems(vaultService.getVaultItems());
    } else {
      setErrorMsg('Incorrect password.');
    }
  };

  const handleVerifyForgotRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!forgotAnswerInput.trim()) {
      setErrorMsg('Please enter your recovery answer.');
      return;
    }
    const isValid = await vaultService.verifyRecovery(forgotAnswerInput);
    if (isValid) {
      setIsRecoveryVerified(true);
      setErrorMsg('');
    } else {
      setErrorMsg('Incorrect recovery answer. Verification failed.');
    }
  };

  const handleResetPasswordAfterRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!newResetPassword || newResetPassword.length < 4) {
      setErrorMsg('New password must be at least 4 characters.');
      return;
    }
    const success = await vaultService.resetPasswordWithRecovery(forgotAnswerInput, newResetPassword);
    if (success) {
      setForgotAnswerInput('');
      setNewResetPassword('');
      setIsRecoveryVerified(false);
      setVaultView('gallery');
      setIsUnlocked(true);
      setItems(vaultService.getVaultItems());
    } else {
      setErrorMsg('Password reset failed.');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!oldPassInput || !newPassInput || newPassInput.length < 4) {
      setErrorMsg('Enter valid passwords (min 4 chars).');
      return;
    }
    const success = await vaultService.changePassword(oldPassInput, newPassInput);
    if (success) {
      setOldPassInput('');
      setNewPassInput('');
      setVaultView('gallery');
      setErrorMsg('Password updated.');
    } else {
      setErrorMsg('Incorrect current password.');
    }
  };

  const handleExportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!backupPassInput) {
      setErrorMsg('Enter vault password.');
      return;
    }
    const jsonString = await vaultService.exportBackup(backupPassInput);
    if (!jsonString) {
      setErrorMsg('Incorrect password.');
      return;
    }

    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PrivateVault_Backup_${new Date().toISOString().slice(0, 10)}.enc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBackupPassInput('');
    setVaultView('gallery');
  };

  const handleRestoreFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRestoreFileContent(content);
        setErrorMsg('');
      }
    };
    reader.readAsText(file);
  };

  const handleConfirmRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!restoreFileContent || !restorePassInput) {
      setErrorMsg('Select backup file and enter password.');
      return;
    }
    const success = await vaultService.restoreBackup(restoreFileContent, restorePassInput);
    if (success) {
      setRestoreFileContent(null);
      setRestorePassInput('');
      setVaultView('gallery');
      setHasPass(true);
      setIsUnlocked(true);
      setItems(vaultService.getVaultItems());
    } else {
      setErrorMsg('Restore failed: Invalid password or file.');
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const isVideo = file.type.startsWith('video');
      const isImage = file.type.startsWith('image');
      if (!isVideo && !isImage) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        if (dataUrl) {
          vaultService.addVaultItem({
            type: isVideo ? 'video' : 'image',
            dataUrl,
            name: file.name,
            size: file.size,
          });
          setItems(vaultService.getVaultItems());
        }
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this item from Vault?')) {
      vaultService.deleteVaultItem(id);
      setItems(vaultService.getVaultItems());
      if (selectedItem?.id === id) {
        setSelectedItem(null);
      }
    }
  };

  const handleLockVault = () => {
    vaultService.lockVault();
    setIsUnlocked(false);
    setPasswordInput('');
    setSelectedItem(null);
    setVaultView('gallery');
    setIsRecoveryVerified(false);
  };

  if (!isOpen) return null;

  const storedQ = vaultService.getRecoveryQuestion() || 'What is your special date or memorable keyword?';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-digit-fade"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-2xl rounded-2xl p-4 sm:p-5 shadow-2xl border border-white/10 relative max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              {isUnlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
            </div>
            <h2 className="text-xs font-semibold tracking-wider uppercase text-slate-200">
              Private Vault
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            {isUnlocked && (
              <>
                <button
                  onClick={() => setVaultView(vaultView === 'gallery' ? 'settings' : 'gallery')}
                  className={`p-1.5 rounded-lg transition-colors ${vaultView !== 'gallery' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                  title="Vault Settings"
                >
                  <Settings className="w-4 h-4" />
                </button>
                <button
                  onClick={handleLockVault}
                  className="p-1.5 rounded-lg text-rose-300 hover:text-rose-200 hover:bg-rose-500/10 transition-colors"
                  title="Lock Vault"
                >
                  <Lock className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="mt-4 flex-1 overflow-y-auto">
          {!hasPass ? (
            /* CREATE PASSWORD & RECOVERY SETUP */
            <form onSubmit={handleCreatePassword} className="max-w-sm mx-auto py-5 space-y-3">
              <div>
                <h3 className="text-sm font-medium text-slate-100">Set Vault Password & Recovery</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                  Configure a security question in case you ever forget your password.
                </p>
              </div>

              {errorMsg && (
                <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="space-y-2.5 text-left pt-1">
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="New password (min 4 chars)"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400/80 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPasswordInput}
                  onChange={(e) => setConfirmPasswordInput(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400/80"
                />

                <div className="pt-1 space-y-1.5">
                  <label className="block text-[11px] font-mono text-indigo-200/80 uppercase">
                    Security Question (Required for Recovery)
                  </label>
                  <input
                    type="text"
                    value={recoveryQuestion}
                    onChange={(e) => setRecoveryQuestion(e.target.value)}
                    placeholder="e.g. What is our special date?"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/10 text-slate-100 placeholder:text-slate-500"
                  />
                  <input
                    type="text"
                    value={recoveryAnswer}
                    onChange={(e) => setRecoveryAnswer(e.target.value)}
                    placeholder="Security answer"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/10 text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow mt-2"
              >
                Create Secure Vault
              </button>
            </form>
          ) : !isUnlocked && vaultView === 'forgot' ? (
            /* FORGOT PASSWORD RECOVERY FLOW */
            <div className="max-w-sm mx-auto py-6 space-y-3.5 text-left">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h3 className="text-sm font-medium text-slate-100 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-indigo-400" />
                  <span>Password Recovery</span>
                </h3>
                <button
                  type="button"
                  onClick={() => { setVaultView('gallery'); setIsRecoveryVerified(false); setErrorMsg(''); }}
                  className="text-xs text-indigo-300 hover:underline"
                >
                  Back to Unlock
                </button>
              </div>

              {errorMsg && (
                <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {!isRecoveryVerified ? (
                <form onSubmit={handleVerifyForgotRecovery} className="space-y-3">
                  <p className="text-xs text-slate-300 font-medium">
                    Question: <span className="text-indigo-200 font-normal">{storedQ}</span>
                  </p>
                  <input
                    type="text"
                    value={forgotAnswerInput}
                    onChange={(e) => setForgotAnswerInput(e.target.value)}
                    placeholder="Enter security answer"
                    autoFocus
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/10 text-slate-100 placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl"
                  >
                    Verify Answer
                  </button>
                </form>
              ) : (
                <form onSubmit={handleResetPasswordAfterRecovery} className="space-y-3">
                  <p className="text-xs text-emerald-300">
                    ✓ Security verified successfully. Enter your new password below. All existing memories will be preserved securely.
                  </p>
                  <input
                    type="password"
                    value={newResetPassword}
                    onChange={(e) => setNewResetPassword(e.target.value)}
                    placeholder="Enter new password (min 4 chars)"
                    autoFocus
                    className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/10 text-slate-100 placeholder:text-slate-500"
                  />
                  <button
                    type="submit"
                    className="w-full py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl"
                  >
                    Reset Password & Unlock Vault
                  </button>
                </form>
              )}
            </div>
          ) : !isUnlocked ? (
            /* UNLOCK VAULT SCREEN */
            <form onSubmit={handleUnlock} className="max-w-sm mx-auto py-8 space-y-3.5 text-center">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 mx-auto">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-medium text-slate-100">Unlock Vault</h3>

              {errorMsg && (
                <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="relative text-left">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-900/80 border border-white/10 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-indigo-400/80 pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all shadow flex-1 mr-2"
                >
                  Unlock
                </button>
                <button
                  type="button"
                  onClick={() => { setVaultView('forgot'); setErrorMsg(''); }}
                  className="text-indigo-300 hover:underline px-2 py-2"
                >
                  Forgot Password?
                </button>
              </div>
            </form>
          ) : vaultView === 'settings' ? (
            /* SETTINGS / BACKUP MENU */
            <div className="max-w-sm mx-auto py-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Vault Settings</h3>
                <button
                  onClick={() => setVaultView('gallery')}
                  className="text-xs text-indigo-300 hover:underline"
                >
                  Gallery
                </button>
              </div>

              {errorMsg && (
                <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-400/30 text-indigo-200 text-xs">
                  {errorMsg}
                </div>
              )}

              {/* Change Password */}
              <form onSubmit={handleChangePassword} className="space-y-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/10">
                <h4 className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Change Password</span>
                </h4>
                <input
                  type="password"
                  value={oldPassInput}
                  onChange={(e) => setOldPassInput(e.target.value)}
                  placeholder="Current password"
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-white/10 text-slate-100"
                />
                <input
                  type="password"
                  value={newPassInput}
                  onChange={(e) => setNewPassInput(e.target.value)}
                  placeholder="New password (min 4 chars)"
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-white/10 text-slate-100"
                />
                <button
                  type="submit"
                  className="w-full py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
                >
                  Update Password
                </button>
              </form>

              {/* Backup */}
              <form onSubmit={handleExportBackup} className="space-y-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/10">
                <h4 className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Export Backup</span>
                </h4>
                <input
                  type="password"
                  value={backupPassInput}
                  onChange={(e) => setBackupPassInput(e.target.value)}
                  placeholder="Vault password"
                  className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-white/10 text-slate-100"
                />
                <button
                  type="submit"
                  className="w-full py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg flex items-center justify-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Backup File</span>
                </button>
              </form>

              {/* Restore */}
              <div className="space-y-2.5 p-3 rounded-xl bg-white/[0.04] border border-white/10">
                <h4 className="text-xs font-medium text-slate-200 flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Restore Backup</span>
                </h4>
                <input
                  ref={restoreFileInputRef}
                  type="file"
                  accept=".enc,.json"
                  onChange={handleRestoreFileSelected}
                  className="w-full text-xs text-slate-300 file:mr-2 file:py-1 file:px-2 file:rounded-lg file:border-0 file:text-[11px] file:bg-indigo-600 file:text-white"
                />
                {restoreFileContent && (
                  <>
                    <input
                      type="password"
                      value={restorePassInput}
                      onChange={(e) => setRestorePassInput(e.target.value)}
                      placeholder="Backup password"
                      className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-900 border border-white/10 text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={handleConfirmRestore}
                      className="w-full py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg"
                    >
                      Restore Backup
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            /* MODERN GALLERY VIEW */
            <div className="space-y-3">
              {/* Toolbar */}
              <div className="flex items-center justify-between pb-1">
                <span className="text-[11px] font-mono text-slate-400">
                  {items.length} {items.length === 1 ? 'Item' : 'Items'}
                </span>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileImport}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow transition-all active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
              </div>

              {/* Gallery Grid */}
              {items.length === 0 ? (
                <div className="py-20 text-center space-y-2">
                  <ImageIcon className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs text-slate-400">No media in vault</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className="group relative aspect-square rounded-xl overflow-hidden bg-slate-900 border border-white/10 cursor-pointer shadow hover:border-indigo-400/50 transition-all"
                    >
                      {item.type === 'video' ? (
                        <div className="w-full h-full relative flex items-center justify-center bg-black">
                          <video src={item.dataUrl} className="w-full h-full object-cover opacity-85" />
                          <div className="absolute inset-0 bg-black/25 flex items-center justify-center">
                            <div className="w-7 h-7 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow">
                              <Video className="w-3.5 h-3.5" />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <img
                          src={item.dataUrl}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      )}

                      {/* Delete button overlay */}
                      <button
                        onClick={(e) => handleDeleteItem(item.id, e)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-lg bg-black/60 hover:bg-rose-600 text-slate-200 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fullscreen Media Viewer */}
        {selectedItem && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/95 backdrop-blur-lg animate-digit-fade"
            onClick={() => setSelectedItem(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedItem(null)}
                className="absolute -top-10 right-0 text-slate-300 hover:text-white p-2"
                aria-label="Close"
              >
                <X className="w-6 h-6" />
              </button>

              {selectedItem.type === 'video' ? (
                <video
                  src={selectedItem.dataUrl}
                  controls
                  autoPlay
                  className="max-w-full max-h-[75vh] rounded-2xl shadow-2xl border border-white/10"
                />
              ) : (
                <img
                  src={selectedItem.dataUrl}
                  alt={selectedItem.name}
                  className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-white/10"
                />
              )}

              <div className="mt-3 flex items-center justify-between w-full px-2 text-xs text-slate-300">
                <span className="truncate max-w-[220px] font-mono text-[11px]">{selectedItem.name}</span>
                <button
                  onClick={(e) => handleDeleteItem(selectedItem.id, e)}
                  className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 flex items-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
