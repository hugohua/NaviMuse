import React, { createContext, useContext, useState, type ReactNode } from 'react';

interface QueuePanelContextType {
    isQueueOpen: boolean;
    setQueueOpen: (open: boolean) => void;
    toggleQueue: () => void;
}

const QueuePanelContext = createContext<QueuePanelContextType | undefined>(undefined);

export const QueuePanelProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isQueueOpen, setIsQueueOpen] = useState(false);

    const setQueueOpen = (open: boolean) => setIsQueueOpen(open);
    const toggleQueue = () => setIsQueueOpen(prev => !prev);

    return (
        <QueuePanelContext.Provider value={{ isQueueOpen, setQueueOpen, toggleQueue }}>
            {children}
        </QueuePanelContext.Provider>
    );
};

export const useQueuePanel = (): QueuePanelContextType => {
    const context = useContext(QueuePanelContext);
    if (!context) {
        throw new Error('useQueuePanel must be used within a QueuePanelProvider');
    }
    return context;
};
