import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CreateAccount.css';


function CreateAccount() {
  const [form, setForm] = useState({ username: '', email: '', password: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError('Parolele nu coincid!');
      return;
    }
    setError('');
    try {
  const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  const response = await fetch(`${apiUrl}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username,
          email: form.email,
          password: form.password
        })
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.message || 'Eroare la crearea contului!');
        return;
      }
  // Succes: cont creat
 /// alert('Cont creat cu succes!');
  navigate('/dashboard');
    } catch (err) {
      setError('Eroare de rețea sau server!');
    }
  };

  return (
    <div className="create-account-container">
      <h2>Create Account</h2>
      <form className="create-account-form" onSubmit={handleSubmit}>
        <label>
          Username
          <input type="text" name="username" value={form.username} onChange={handleChange} required />
        </label>
        <label>
          Email
          <input type="email" name="email" value={form.email} onChange={handleChange} required />
        </label>
        <label>
          Password
          <input type="password" name="password" value={form.password} onChange={handleChange} required />
        </label>
        <label>
          Confirmă parola
          <input type="password" name="confirmPassword" value={form.confirmPassword} onChange={handleChange} required />
        </label>
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        <button type="submit" className="btn create">Create Account</button>
        <div className="already-account-text" style={{ marginTop: '18px', textAlign: 'center', fontSize: '1rem' }}>
          Aveți deja un cont?{' '}
          <span
            style={{ color: '#3b82f6', cursor: 'pointer', textDecoration: 'underline', fontWeight: 600 }}
            onClick={() => navigate('/login')}
          >
            Conectați-vă
          </span>
        </div>
      </form>
    </div>
  );
}

export default CreateAccount;
