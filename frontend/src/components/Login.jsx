import { useState } from 'react';
import { authAPI } from '../services/api.js';

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { data } = await authAPI.login(email, password);

      if (!data.success) {
        setError(data.error || 'Ошибка входа');
        setLoading(false);
        return;
      }

      onLogin(data.data.accessToken, data.data.refreshToken);
    } catch (err) {
      setError('Сервер недоступен. Проверьте что backend запущен.');
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0c0e14', fontFamily: "'DM Sans', 'Segoe UI', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input:focus { border-color: rgba(168,85,247,0.5) !important; outline: none; }
      `}</style>

      <div style={{
        width: 400, padding: 40, borderRadius: 20,
        background: '#10131b', border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            fontSize: 32, fontWeight: 800, letterSpacing: '-0.5px',
            background: 'linear-gradient(135deg, #a855f7, #3b82f6, #f59e0b)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            MP · CRM
          </div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 6, letterSpacing: '0.5px' }}>
            Вход в систему
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            padding: '10px 14px', marginBottom: 16, borderRadius: 10,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
            color: '#ef4444', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@mpcrm.ru"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit', transition: 'border-color 0.2s',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 500 }}>
              Пароль
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit(e)}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                color: '#e2e8f0', fontSize: 14, fontFamily: 'inherit', transition: 'border-color 0.2s',
              }}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !email || !password}
            style={{
              width: '100%', padding: '13px 16px', borderRadius: 10,
              background: loading ? '#6b21a8' : 'linear-gradient(135deg, #a855f7, #7c3aed)',
              color: '#fff', border: 'none', fontSize: 14, fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer', fontFamily: 'inherit',
              opacity: (!email || !password) ? 0.5 : 1, transition: 'opacity 0.2s',
            }}
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </div>

        {/* Hint */}
        <div style={{
          marginTop: 24, padding: '12px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>Тестовый доступ:</div>
          <div style={{ fontSize: 12, color: '#64748b', fontFamily: "'Consolas', monospace" }}>
            admin@mpcrm.ru / password123
          </div>
        </div>
      </div>
    </div>
  );
}
