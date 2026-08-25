import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api';
import type { Profile } from './types';

interface AuthState {
    profile: Profile | null;
    loading: boolean;
    refresh: () => Promise<void>;
    logout: () => Promise<void>;
    setProfile: (p: Profile | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        try {
            const data = await api.get<{ profile: Profile }>('/api/auth/me');
            setProfile(data.profile);
        } catch {
            setProfile(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const logout = useCallback(async () => {
        try {
            await api.post('/api/auth/logout');
        } finally {
            setProfile(null);
        }
    }, []);

    const value = useMemo(
        () => ({ profile, loading, refresh, logout, setProfile }),
        [profile, loading, refresh, logout],
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
