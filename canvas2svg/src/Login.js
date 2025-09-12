import React, { useState } from 'react';
import './Login.css';
import { useNavigate } from 'react-router-dom';

function Login() {
  const [form, setForm] = useState({ username: '', password: '' });
  const navigate = useNavigate();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Aici poți adăuga logica de autentificare
    alert('Logare cu succes!');
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
