import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Snackbar } from 'react-native-paper';
import { useAppTheme } from '@/theme/AppThemeProvider';
import { usePreferencesStore } from '@/store/preferencesStore';

interface ToastState {
  message: string;
  tone: 'success' | 'error' | 'info';
}

interface ToastApi {
  show: (message: string, tone?: ToastState['tone']) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useAppTheme();
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = useCallback((message: string, tone: ToastState['tone'] = 'info') => {
    setToast({ message, tone });
  }, []);
  const value = useMemo(() => ({ show }), [show]);
  const background =
    toast?.tone === 'success' ? colors.success : toast?.tone === 'error' ? colors.danger : colors.elevated;

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Snackbar
        visible={Boolean(toast)}
        onDismiss={() => setToast(null)}
        duration={2800}
        style={{ backgroundColor: background, marginBottom: 72 }}
      >
        {toast?.message}
      </Snackbar>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  const notificationsEnabled = usePreferencesStore((state) => state.notificationsEnabled);
  return useMemo(
    () => ({
      show: (message, tone: ToastState['tone'] = 'info') => {
        if (!notificationsEnabled && tone !== 'error') {
          return;
        }
        api.show(message, tone);
      },
    }),
    [api, notificationsEnabled],
  );
}
