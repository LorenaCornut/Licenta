import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Settings.css';

function Settings() {
  const navigate = useNavigate();
  const userId = localStorage.getItem('userId');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // User data
  const [userData, setUserData] = useState({
    username: '',
    email: '',
    created_at: '',
    profile_picture: ''
  });
  
  // Ref pentru input file
  const fileInputRef = useRef(null);
  
  // Edit states
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (!userId) {
      navigate('/login');
      return;
    }
    fetchUserData();
  }, [userId, navigate]);

  const fetchUserData = async () => {
    try {
      const response = await fetch(`http://localhost:5000/api/auth/profile/${userId}`);
      if (!response.ok) {
        throw new Error('Nu s-au putut încărca datele');
      }
      const data = await response.json();
      setUserData({
        username: data.username,
        email: data.email,
        created_at: data.created_at,
        profile_picture: data.profile_picture || ''
      });
      setNewEmail(data.email);
      setLoading(false);
    } catch (err) {
      setError('Eroare la încărcarea profilului');
      setLoading(false);
    }
  };

  const handleUpdateEmail = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!newEmail || !newEmail.includes('@')) {
      setError('Vă rugăm introduceți un email valid');
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:5000/api/auth/profile/${userId}/email`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Eroare la actualizare');
      }
      
      setUserData(prev => ({ ...prev, email: newEmail }));
      setEditingEmail(false);
      setSuccess('Email actualizat cu succes!');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (newPassword !== confirmPassword) {
      setError('Parolele nu coincid');
      return;
    }
    
    if (newPassword.length < 6) {
      setError('Parola trebuie să aibă cel puțin 6 caractere');
      return;
    }
    
    try {
      const response = await fetch(`http://localhost:5000/api/auth/profile/${userId}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          currentPassword, 
          newPassword 
        })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Eroare la actualizare');
      }
      
      setEditingPassword(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Parola actualizată cu succes!');
    } catch (err) {
      setError(err.message);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('ro-RO', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleProfilePictureChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Verifică dimensiunea (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('Imaginea trebuie să fie mai mică de 2MB');
      return;
    }

    // Verifică tipul
    if (!file.type.startsWith('image/')) {
      setError('Vă rugăm selectați o imagine');
      return;
    }

    // Convert to base64
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result;
      try {
        const response = await fetch(`http://localhost:5000/api/auth/profile/${userId}/picture`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profilePicture: base64 })
        });

        if (!response.ok) {
          throw new Error('Eroare la salvare');
        }

        setUserData(prev => ({ ...prev, profile_picture: base64 }));
        setSuccess('Poza de profil actualizată!');
        setError('');
      } catch (err) {
        setError('Eroare la actualizarea pozei de profil');
      }
    };
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div className="settings-container">
        <div className="settings-loading">Se încarcă...</div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <button className="settings-back-btn" onClick={() => navigate('/dashboard')}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 18L9 12L15 6" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Înapoi
      </button>

      <div className="settings-card">
        <div className="settings-header">
          <div className="settings-avatar-container">
            <div className="settings-avatar" onClick={() => fileInputRef.current?.click()}>
              {userData.profile_picture ? (
                <img src={userData.profile_picture} alt="Profil" className="settings-avatar-img" />
              ) : (
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="40" cy="40" r="38" stroke="#8b5cf6" strokeWidth="3" fill="#ede9fe"/>
                  <circle cx="40" cy="32" r="12" stroke="#8b5cf6" strokeWidth="3" fill="#fff"/>
                  <path d="M20 65c0-10 20-10 20-10s20 0 20 10" stroke="#8b5cf6" strokeWidth="3" fill="none"/>
                </svg>
              )}
              <div className="settings-avatar-overlay">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke="white" strokeWidth="2" fill="none"/>
                  <circle cx="12" cy="13" r="4" stroke="white" strokeWidth="2" fill="none"/>
                </svg>
              </div>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleProfilePictureChange}
              accept="image/*"
              style={{ display: 'none' }}
            />
            <button className="settings-change-photo-btn" onClick={() => fileInputRef.current?.click()}>
              Schimbă poza
            </button>
          </div>
          <h1 className="settings-title">Profilul meu</h1>
          <p className="settings-subtitle">Gestionează informațiile contului tău</p>
        </div>

        {error && <div className="settings-error">{error}</div>}
        {success && <div className="settings-success">{success}</div>}

        <div className="settings-section">
          <h2 className="settings-section-title">Informații cont</h2>
          
          <div className="settings-field">
            <label className="settings-label">Nume utilizator</label>
            <div className="settings-value">
              <span className="settings-text">{userData.username}</span>
              <span className="settings-badge">Nu poate fi schimbat</span>
            </div>
          </div>

          <div className="settings-field">
            <label className="settings-label">Email</label>
            {editingEmail ? (
              <form onSubmit={handleUpdateEmail} className="settings-edit-form">
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="settings-input"
                  placeholder="Noul email"
                />
                <div className="settings-edit-actions">
                  <button type="submit" className="settings-btn settings-btn-primary">Salvează</button>
                  <button 
                    type="button" 
                    className="settings-btn settings-btn-secondary"
                    onClick={() => {
                      setEditingEmail(false);
                      setNewEmail(userData.email);
                    }}
                  >
                    Anulează
                  </button>
                </div>
              </form>
            ) : (
              <div className="settings-value">
                <span className="settings-text">{userData.email}</span>
                <button 
                  className="settings-edit-btn"
                  onClick={() => setEditingEmail(true)}
                >
                  Modifică
                </button>
              </div>
            )}
          </div>

          <div className="settings-field">
            <label className="settings-label">Membru din</label>
            <div className="settings-value">
              <span className="settings-text">{formatDate(userData.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <h2 className="settings-section-title">Securitate</h2>
          
          <div className="settings-field">
            <label className="settings-label">Parolă</label>
            {editingPassword ? (
              <form onSubmit={handleUpdatePassword} className="settings-edit-form">
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="settings-input"
                  placeholder="Parola actuală"
                />
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="settings-input"
                  placeholder="Parola nouă"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="settings-input"
                  placeholder="Confirmă parola nouă"
                />
                <div className="settings-edit-actions">
                  <button type="submit" className="settings-btn settings-btn-primary">Salvează</button>
                  <button 
                    type="button" 
                    className="settings-btn settings-btn-secondary"
                    onClick={() => {
                      setEditingPassword(false);
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                  >
                    Anulează
                  </button>
                </div>
              </form>
            ) : (
              <div className="settings-value">
                <span className="settings-text">••••••••</span>
                <button 
                  className="settings-edit-btn"
                  onClick={() => setEditingPassword(true)}
                >
                  Schimbă parola
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="settings-section settings-danger-section">
          <h2 className="settings-section-title">Zona periculoasă</h2>
          <p className="settings-danger-text">
            Ștergerea contului este permanentă și nu poate fi anulată.
          </p>
          <button className="settings-btn settings-btn-danger">
            Șterge contul
          </button>
        </div>
      </div>
    </div>
  );
}

export default Settings;
