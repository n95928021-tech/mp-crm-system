import { useState, useEffect } from 'react';
import CRM from './CRM.jsx';

const API = 'http://localhost:4000/api/v1';

const getHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
});

export default function App({ onLogout }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Загружаем профиль пользователя
    fetch(`${API}/auth/me`, { headers: getHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
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
  }, []);

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

  // CRM компонент пока работает на демо-данных
  // В следующем обновлении подключим к реальным API
  return <CRM user={user} onLogout={onLogout} apiUrl={API} getHeaders={getHeaders} />;
}
