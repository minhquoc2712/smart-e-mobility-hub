import React, { createContext, useContext, useState } from 'react';
import { authApi } from '../api';

const AuthContext = createContext(null);

const USER_KEY = 'semh_auth_user';
const TOKEN_KEY = 'semh_auth_token';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = sessionStorage.getItem(USER_KEY);
    return saved ? JSON.parse(saved) : null;
  });

  const saveSession = ({ token, user: authUser }) => {
    // sessionStorage clears automatically when browser closes — ideal for public/shared machines!
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(authUser));
    setUser(authUser);
    return authUser;
  };

  const loginWithGoogleCredential = async (credential) => {
    const result = await authApi.loginWithGoogle(credential);
    return saveSession(result);
  };

  const loginDemo = async (email) => {
    const result = await authApi.demoLogin(email);
    return saveSession(result);
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isOperator: user?.role === 'OPERATOR',
        loginWithGoogleCredential,
        loginDemo,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
