
import { useState, useEffect, useCallback } from 'react';

export function useHashLocation() {
    const [hash, setHash] = useState(() => window.location.hash);

    const onHashChange = useCallback(() => {
        setHash(window.location.hash);
    }, []);

    useEffect(() => {
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, [onHashChange]);

    const navigate = useCallback((newHash: string) => {
        window.location.hash = newHash;
    }, []);

    return [hash, navigate] as const;
}
