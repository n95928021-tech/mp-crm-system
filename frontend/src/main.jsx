import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import Login from './components/Login.jsx';
import App from './components/App.jsx';
import { authAPI } from './services/api.js';

function Root() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      authAPI.getMe()
        .then(() => {
          setIsAuthenticated(true);
          setLoading(false);
        })
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const handleLogin = (accessToken, refreshToken) => {
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setIsAuthenticated(false);
  };

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0c0e14', color: '#a855f7', fontFamily: "'DM Sans', sans-serif", fontSize: 18,
      }}>
        Загрузка...
      </div>
    );
  }

  if (!isAuthenticated) return <Login onLogin={handleLogin} />;
  return <App onLogout={handleLogout} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
