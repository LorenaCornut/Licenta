import React, { useState } from 'react';
import './Login.css';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  const response = await fetch(`${apiUrl}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          password: form.password
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Eroare la autentificare!');
        return;
      }
      // Salvează username-ul primit de la backend
      if (data.username) {
        localStorage.setItem('username', data.username);
      }
      // Succes: autentificare reușită
      navigate('/dashboard');
    } catch (err) {
      setError('Eroare de rețea sau server!');
    }
  };

  return (
    <div className="login-container">
      <h2>Log In</h2>
      <form className="login-form" onSubmit={handleSubmit}>
        <label>
          Username
          <input type="text" name="username" value={form.username} onChange={handleChange} required />
        </label>
        <label>
          Password
          <input type="password" name="password" value={form.password} onChange={handleChange} required />
        </label>
  {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
  <button type="submit" className="btn login">Log In</button>
        <div className="login-bottom-text" style={{ marginTop: '18px', textAlign: 'center', fontSize: '1rem' }}>
          Nu aveți un cont?{' '}
          <span className="create-link" style={{ color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }} onClick={() => navigate('/createaccount')}>Creați cont</span>
        </div>
      </form>
    </div>
  );
}

export default Login;
