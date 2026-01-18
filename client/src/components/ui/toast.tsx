import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import './toast.css';

interface ToastContextValue {
    toast: (props: ToastProps) => void;
}

interface ToastProps {
    title: string;
    description?: string;
    variant?: 'default' | 'success' | 'error';
    duration?: number;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
    const context = React.useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

interface ToastItem extends ToastProps {
    id: string;
    open: boolean;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = React.useState<ToastItem[]>([]);

    const toast = React.useCallback((props: ToastProps) => {
        const id = Math.random().toString(36).slice(2);
        setToasts(prev => [...prev, { ...props, id, open: true }]);
    }, []);

    const handleOpenChange = React.useCallback((id: string, open: boolean) => {
        if (!open) {
            setToasts(prev => prev.filter(t => t.id !== id));
        }
    }, []);

    return (
        <ToastContext.Provider value={{ toast }}>
            <ToastPrimitive.Provider swipeDirection="right">
                {children}
                {toasts.map((t) => (
                    <ToastPrimitive.Root
                        key={t.id}
                        className={`toast-root ${t.variant || 'default'}`}
                        open={t.open}
                        onOpenChange={(open) => handleOpenChange(t.id, open)}
                        duration={t.duration || 4000}
                    >
                        <ToastPrimitive.Title className="toast-title">
                            {t.title}
                        </ToastPrimitive.Title>
                        {t.description && (
                            <ToastPrimitive.Description className="toast-description">
                                {t.description}
                            </ToastPrimitive.Description>
                        )}
                        <ToastPrimitive.Close className="toast-close">
                            <X className="w-4 h-4" />
                        </ToastPrimitive.Close>
                    </ToastPrimitive.Root>
                ))}
                <ToastPrimitive.Viewport className="toast-viewport" />
            </ToastPrimitive.Provider>
        </ToastContext.Provider>
    );
}
