import React, { useEffect, useState } from 'react';
import './Popup.css';

export interface PopupOptions {
    title?: string;
    message: string;
    type?: 'alert' | 'confirm';
    onConfirm?: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
}

interface PopupProps {
    isOpen: boolean;
    options: PopupOptions | null;
    onClose: () => void;
}

export const Popup: React.FC<PopupProps> = ({ isOpen, options, onClose }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setVisible(true);
        } else {
            const timer = setTimeout(() => setVisible(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    if (!visible && !isOpen) return null;

    const handleConfirm = () => {
        options?.onConfirm?.();
        onClose();
    };

    const handleCancel = () => {
        options?.onCancel?.();
        onClose();
    };

    return (
        <div className={`popup-overlay ${isOpen ? 'open' : ''}`} onClick={onClose}>
            <div className="popup-content" onClick={e => e.stopPropagation()}>
                <div className="popup-header">
                    <h3>{options?.title || '提示'}</h3>
                </div>
                <div className="popup-body">
                    <p>{options?.message}</p>
                </div>
                <div className="popup-footer">
                    {options?.type === 'confirm' && (
                        <button className="popup-btn cancel" onClick={handleCancel}>
                            {options?.cancelText || 'Cancel'}
                        </button>
                    )}
                    <button className="popup-btn confirm" onClick={handleConfirm}>
                        {options?.confirmText || 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
};
