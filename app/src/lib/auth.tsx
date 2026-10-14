import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setToken } from './api';
import type { Role, User } from './types';

type Ctx = {
  user: User | null;
  ready: boolean;
  login: (name: string, role: Role) => Promise<User>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<Ctx>(null as unknown as Ctx);
const KEY = 'artisan.session';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw) as { token: string; user: User };
        setToken(s.token);
        setUser(s.user);
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  async function login(name: string, role: Role) {
    const s = await api.login(name, role);
    setToken(s.token);
    setUser(s.user);
    await AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
    return s.user;
  }
  async function logout() {
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem(KEY).catch(() => {});
  }
  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
