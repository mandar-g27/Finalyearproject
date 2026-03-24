import React, { useState, useEffect } from 'react';
import { useAdmin } from '../context/AdminContext';
import { getAccessLogs, clearAccessLogs } from '../services/api';

export default function LogsModal({ onClose }) {
  const { isAuthenticated, login, logout } = useAdmin();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAccessLogs();
      if (data && data.logs) {
        setLogs(data.logs);
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchLogs();
    }
    // Cleanup on unmount to force login every time modal opens
    return () => {
      logout();
    };
  }, [isAuthenticated, logout]);

  const handleLogin = (e) => {
    e.preventDefault();
    const success = login(email, password); // AdminContext uses 'admin'/'admin123'
    if (!success) {
      setLoginError('Invalid admin credentials');
    } else {
      setLoginError(null);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm("Are you sure you want to clear all access logs?")) return;
    try {
      await clearAccessLogs();
      setLogs([]);
    } catch (err) {
      alert("Failed to clear logs: " + err.message);
    }
  };

  return (
    <div className="logs-modal-overlay">
      <div className="logs-modal-content">
        <button className="close-btn" onClick={onClose}>&times;</button>
        
        {!isAuthenticated ? (
          <div className="login-form-container">
            <h2>Admin Login</h2>
            <p>Please enter admin credentials to view logs.</p>
            {loginError && <p className="error-text">{loginError}</p>}
            <form onSubmit={handleLogin}>
              <input 
                type="text" 
                placeholder="Admin Email/Username" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                required 
              />
              <input 
                type="password" 
                placeholder="Password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                required 
              />
              <button type="submit" className="primary-btn">Login</button>
            </form>
          </div>
        ) : (
          <div className="logs-view-container">
            <div className="logs-header">
              <h2>Access Logs</h2>
              <div>
                <button onClick={handleClearLogs} className="clear-btn">Clear Logs</button>
                <button onClick={logout} className="logout-btn">Logout</button>
              </div>
            </div>
            
            {loading ? (
              <p>Loading...</p>
            ) : error ? (
              <p className="error-text">{error}</p>
            ) : (
              <div className="table-container">
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.length > 0 ? logs.map((log) => (
                      <tr key={log.id}>
                        <td>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>{log.user_name}</td>
                        <td className={log.status.includes('Access Granted') ? 'granted' : 'denied'}>
                          {log.status}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="3" style={{ textAlign: 'center' }}>No logs found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        .logs-modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.8); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          z-index: 1000; font-family: 'DM Sans', sans-serif;
        }
        .logs-modal-content {
          background: #0f172a; border: 1px solid rgba(0,212,255,0.2);
          border-radius: 16px; padding: 32px; width: 90%; max-width: 600px;
          min-height: 300px; position: relative; color: #e2e8f0;
          box-shadow: 0 20px 50px rgba(0,0,0,0.5);
        }
        .close-btn {
          position: absolute; top: 16px; right: 16px; background: none; border: none;
          color: #94a3b8; font-size: 24px; cursor: pointer; transition: color 0.2s;
        }
        .close-btn:hover { color: #fff; }
        .login-form-container { display: flex; flex-direction: column; gap: 16px; }
        .login-form-container h2 { margin-top: 0; color: #00d4ff; }
        .login-form-container form { display: flex; flex-direction: column; gap: 12px; }
        .login-form-container input {
          background: #1e293b; border: 1px solid #334155; padding: 12px;
          border-radius: 8px; color: #fff; font-size: 15px; outline: none;
        }
        .login-form-container input:focus { border-color: #00d4ff; }
        .primary-btn {
          background: #00d4ff; color: #000; font-weight: bold; border: none;
          padding: 12px; border-radius: 8px; cursor: pointer; font-size: 15px;
          margin-top: 8px; transition: opacity 0.2s;
        }
        .primary-btn:hover { opacity: 0.9; }
        .error-text { color: #f43f5e; font-size: 14px; }
        .logs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .logs-header h2 { margin: 0; color: #00d4ff; }
        .clear-btn {
          background: rgba(244,63,94,0.1); color: #f43f5e; border: 1px solid rgba(244,63,94,0.3);
          padding: 8px 16px; border-radius: 6px; cursor: pointer; margin-right: 12px;
          font-weight: 600; transition: all 0.2s;
        }
        .clear-btn:hover { background: rgba(244,63,94,0.2); }
        .logout-btn {
          background: transparent; color: #94a3b8; border: 1px solid #334155;
          padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: all 0.2s;
        }
        .logout-btn:hover { color: #fff; border-color: #64748b; }
        .table-container { max-height: 400px; overflow-y: auto; border: 1px solid #1e293b; border-radius: 8px; }
        .logs-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 14px; }
        .logs-table th { background: #1e293b; padding: 12px; position: sticky; top: 0; font-weight: 600; color: #94a3b8; }
        .logs-table td { padding: 12px; border-bottom: 1px solid #1e293b; }
        .logs-table tr:last-child td { border-bottom: none; }
        .logs-table tr:hover td { background: rgba(255,255,255,0.02); }
        .granted { color: #4ade80; }
        .denied { color: #f43f5e; }
      `}</style>
    </div>
  );
}
