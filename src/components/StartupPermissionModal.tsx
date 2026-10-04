import React, { useState, useEffect } from 'react';
import { ShieldCheck, Music, Bell, ChevronRight, AlertCircle, Sparkles, Settings } from 'lucide-react';
import { permissionService, PermissionState } from '../services/permissionService';
import { localMusicService } from '../services/localMusicService';
import { notificationService } from '../services/notificationService';

interface StartupPermissionModalProps {
  onComplete: () => void;
}

export const StartupPermissionModal: React.FC<StartupPermissionModalProps> = ({ onComplete }) => {
  const [permState, setPermState] = useState<PermissionState | null>(null);
  const [isRequesting, setIsRequesting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    checkInitialPermissions();
  }, []);

  const checkInitialPermissions = async () => {
    const state = await permissionService.checkPermissions();
    setPermState(state);

    if (!state.needsSetup) {
      // Permissions are already granted or setup completed -> skip modal
      onComplete();
    }
  };

  const handleGrantPermissions = async () => {
    setIsRequesting(true);
    setErrorMessage(null);

    try {
      // Trigger sequential native runtime permission flow
      const newState = await permissionService.requestAllPermissions();
      setPermState(newState);

      // Re-scan local music library and initialize notifications
      await localMusicService.requestPermissionAndScan();
      await notificationService.init();

      if (newState.audio === 'granted' || newState.notifications === 'granted' || !newState.isNative) {
        // Automatically continue to main app
        permissionService.markSetupCompleted();
        setTimeout(() => {
          onComplete();
        }, 500);
      } else if (newState.audio === 'denied' || newState.notifications === 'denied') {
        setErrorMessage(
          'Some permissions were denied. You can enable Music & Notifications anytime in Android Settings.'
        );
      } else {
        permissionService.markSetupCompleted();
        onComplete();
      }
    } catch (err) {
      console.error('Error during permission request flow:', err);
      permissionService.markSetupCompleted();
      onComplete();
    } finally {
      setIsRequesting(false);
    }
  };

  const handleSkipOrContinue = () => {
    permissionService.markSetupCompleted();
    onComplete();
  };

  if (!permState || !permState.needsSetup) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-fade-in">
      <div className="relative w-full max-w-md bg-gradient-to-b from-slate-900/95 via-indigo-950/80 to-slate-950/95 border border-indigo-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-indigo-950/50 flex flex-col items-center text-center overflow-hidden">
        {/* Glow accent decoration */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Icon Badge */}
        <div className="relative mb-5 p-4 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-rose-500/20 border border-indigo-400/30 shadow-inner">
          <Sparkles className="w-8 h-8 text-rose-300 animate-pulse" />
        </div>

        {/* Title & Description */}
        <h2 className="text-xl sm:text-2xl font-romantic font-semibold text-rose-100 tracking-wide mb-2">
          Permissions & Experience
        </h2>
        <p className="text-xs sm:text-sm text-indigo-200/80 leading-relaxed mb-6">
          To give you the fullest experience of <span className="text-rose-300 font-medium">Our Little Story</span>, please allow the following permissions:
        </p>

        {/* Permission List */}
        <div className="w-full flex flex-col gap-3 mb-6 text-left">
          {/* Audio Permission Card */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-300 shrink-0 mt-0.5">
              <Music className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-medium text-slate-100">Local Audio & Music</h3>
                {permState.audio === 'granted' && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                    Granted
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-normal mt-0.5">
                Scan device audio files to play your favorite local romantic songs in the music player.
              </p>
            </div>
          </div>

          {/* Notifications Permission Card */}
          <div className="flex items-start gap-3.5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-md">
            <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-300 shrink-0 mt-0.5">
              <Bell className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-medium text-slate-100">Anniversary Notifications</h3>
                {permState.notifications === 'granted' && (
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                    Granted
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-normal mt-0.5">
                Receive sweet daily milestone notifications to commemorate your love story.
              </p>
            </div>
          </div>
        </div>

        {/* Error / Denied explanation */}
        {errorMessage && (
          <div className="w-full mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs text-left flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="w-full flex flex-col gap-2.5">
          <button
            onClick={handleGrantPermissions}
            disabled={isRequesting}
            className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-rose-500 via-indigo-600 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-medium text-xs sm:text-sm tracking-wider uppercase shadow-lg shadow-rose-950/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {isRequesting ? (
              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Grant Required Permissions</span>
                <ChevronRight className="w-4 h-4 ml-auto opacity-70" />
              </>
            )}
          </button>

          <button
            onClick={handleSkipOrContinue}
            className="w-full py-2.5 px-4 text-xs text-indigo-300/70 hover:text-indigo-200 transition-colors flex items-center justify-center gap-1.5"
          >
            <span>Continue to App</span>
          </button>
        </div>
      </div>
    </div>
  );
};
