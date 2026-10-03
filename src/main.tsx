import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Immediately dismiss any native Capacitor / Cordova / WebView splash screen so the app directly renders "Our Little Story"
if (typeof window !== 'undefined') {
  try {
    const win = window as unknown as {
      Capacitor?: {
        Plugins?: {
          SplashScreen?: {
            hide: () => Promise<void> | void;
          };
        };
      };
      navigator?: {
        splashscreen?: {
          hide: () => void;
        };
      };
    };

    if (win.Capacitor?.Plugins?.SplashScreen?.hide) {
      win.Capacitor.Plugins.SplashScreen.hide();
    }
    if (win.navigator?.splashscreen?.hide) {
      win.navigator.splashscreen.hide();
    }
  } catch {
    // Non-native runtime fallback
  }
}

createRoot(document.getElementById('root')!).render(<App />);

