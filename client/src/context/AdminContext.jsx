import { createContext, useContext, useState, useEffect } from 'react';

const AdminContext = createContext(null);

const ADMIN_KEY = 'securevault_admin';

// Default admin credentials (client-side only)
const ADMIN_CREDENTIALS = {
  username: 'admin',
  password: 'admin123',
};

export function AdminProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem(ADMIN_KEY) === 'true';
  });

  useEffect(() => {
    localStorage.setItem(ADMIN_KEY, isAuthenticated.toString());
  }, [isAuthenticated]);

  const login = (username, password) => {
    if (
      username === ADMIN_CREDENTIALS.username &&
      password === ADMIN_CREDENTIALS.password
    ) {
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem(ADMIN_KEY);
  };

  return (
    <AdminContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
