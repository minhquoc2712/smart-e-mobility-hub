import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi } from '../api';
import { SESSION_EXPIRED_EVENT } from '../api/httpClient';

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

  // Returns { user, isNewUser }. First Google sign-in creates the account automatically.
  const loginWithGoogleCredential = async (credential) => {
    const result = await authApi.loginWithGoogle(credential);
    const authUser = saveSession(result);
    return { user: authUser, isNewUser: Boolean(result.isNewUser) };
  };

  const registerWithPassword = async ({ fullName, email, password }) => {
    const result = await authApi.register({ fullName, email, password });
    return { user: saveSession(result), isNewUser: true };
  };

  const loginWithPassword = async (email, password) => {
    const result = await authApi.login(email, password);
    return { user: saveSession(result), isNewUser: false };
  };

  const loginDemo = async (email) => {
    const result = await authApi.demoLogin(email);
    const authUser = saveSession(result);
    return { user: authUser, isNewUser: Boolean(result.isNewUser) };
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setUser(null);
  };

  // Clear local session automatically if backend rejects an expired/invalid JWT.
  useEffect(() => {
    const handleExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: Boolean(user),
        isOperator: user?.role === 'OPERATOR',
        loginWithGoogleCredential,
        registerWithPassword,
        loginWithPassword,
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
