import { useState, useEffect } from 'react';
import CRM from './CRM.jsx';
import { authAPI, API_BASE } from '../services/api.js';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
});

export default function App({ onLogout }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    authAPI.getMe()
      .then((res) => res.data)
      .then((data) => {
        setUser(data.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Auth error:', err);
        setError('Ошибка авторизации');
        setLoading(false);
        onLogout();
      });
  }, [onLogout]);

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0c0e14', color: '#a855f7', fontFamily: "'DM Sans', sans-serif", fontSize: 18,
      }}>
        Загрузка данных...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0c0e14', color: '#ef4444', fontFamily: "'DM Sans', sans-serif", fontSize: 16,
      }}>
        {error}
      </div>
    );
  }

  return <CRM user={user} onLogout={onLogout} apiUrl={API_BASE} getHeaders={getHeaders} />;
}
