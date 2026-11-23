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

  // Returns { user, isNewUser }. The backend creates the account on the first Google sign-in,
  // so "sign up with Google" and "log in with Google" are the same call.
  const loginWithGoogleCredential = async (credential) => {
    const result = await authApi.loginWithGoogle(credential);
    const authUser = saveSession(result);
    return { user: authUser, isNewUser: Boolean(result.isNewUser) };
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

  // httpClient fires this when the backend rejects the token (expired or invalid).
  // Clearing the user makes ProtectedRoute send the person back to /login.
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
