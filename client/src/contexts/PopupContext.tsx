import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { Popup, type PopupOptions } from '../components/Popup';

interface PopupContextType {
    showPopup: (options: PopupOptions) => void;
}

const PopupContext = createContext<PopupContextType | undefined>(undefined);

export const PopupProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [popupOptions, setPopupOptions] = useState<PopupOptions | null>(null);

    const showPopup = useCallback((options: PopupOptions) => {
        setPopupOptions(options);
        setIsOpen(true);
    }, []);

    const closePopup = useCallback(() => {
        setIsOpen(false);
        // Clean up options after transition?
        // setTimeout(() => setPopupOptions(null), 300);
    }, []);

    return (
        <PopupContext.Provider value={{ showPopup }}>
            {children}
            <Popup isOpen={isOpen} options={popupOptions} onClose={closePopup} />
        </PopupContext.Provider>
    );
};

export const usePopup = () => {
    const context = useContext(PopupContext);
    if (!context) {
        throw new Error('usePopup must be used within a PopupProvider');
    }
    return context;
};
