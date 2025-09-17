


import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

function Dashboard() {
  // Ia username-ul din localStorage (setat la login)
  const userName = localStorage.getItem('username') || '';
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const createBtnRef = useRef(null);
  const profileBtnRef = useRef(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  useEffect(() => {
    function handleClickOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !createBtnRef.current.contains(event.target)
      ) {
        setShowMenu(false);
      }
      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target) &&
        !profileBtnRef.current.contains(event.target)
      ) {
        setShowProfileMenu(false);
      }
    }
    if (showMenu || showProfileMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu, showProfileMenu]);

  const profileMenuRef = useRef(null);

  function handleHelp() {
    navigate('/help');
  }
  function handleInfo() {
    navigate('/info');
  }
  function handleLogout() {
    // Exemplu: șterge userul din localStorage/context
    // localStorage.removeItem('user');
    // navigate('/');
    navigate('/');
  }

  return (
    <div className="dashboard-root">
      <aside className="dashboard-sidebar">
        <button className="sidebar-btn sidebar-hamburger" aria-label="Deschide meniu">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect y="7" width="32" height="3.5" rx="1.5" fill="#5b21b6"/>
            <rect y="14" width="32" height="3.5" rx="1.5" fill="#5b21b6"/>
            <rect y="21" width="32" height="3.5" rx="1.5" fill="#5b21b6"/>
          </svg>
        </button>
  <div style={{ position: 'relative' }}>
          <button
            className="sidebar-icon-btn"
            aria-label="Creează"
            ref={createBtnRef}
            onClick={() => setShowMenu((v) => !v)}
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="13" y="6" width="2" height="16" rx="1" fill="#5b21b6"/>
              <rect x="6" y="13" width="16" height="2" rx="1" fill="#5b21b6"/>
            </svg>
            <span className="sidebar-btn-label">Creează</span>
          </button>
          {showMenu && (
            <div className="create-menu-dropdown" ref={menuRef}>
              <button className="create-menu-btn">Graf orientat</button>
              <button className="create-menu-btn" onClick={() => { setShowMenu(false); navigate('/graph'); }}>Graf neorientat</button>
              <button className="create-menu-btn">UML</button>
              <button className="create-menu-btn">Rețea Petri</button>
              <button className="create-menu-btn">Automat</button>
            </div>
          )}
        </div>
    <div className="sidebar-icon-group">
          <button className="sidebar-icon-btn" aria-label="Pornire">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 6L22 12V22H6V12L14 6Z" stroke="#5b21b6" strokeWidth="2" fill="none"/>
            </svg>
            <span className="sidebar-btn-label">Pornire</span>
          </button>
          <button className="sidebar-icon-btn" aria-label="Proiecte">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="8" width="18" height="12" rx="3" stroke="#5b21b6" strokeWidth="2" fill="none"/>
              <rect x="9" y="12" width="10" height="4" rx="1" stroke="#5b21b6" strokeWidth="1" fill="none"/>
            </svg>
            <span className="sidebar-btn-label">Proiecte</span>
          </button>
          <button className="sidebar-icon-btn" aria-label="Șabloane">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="6" width="16" height="16" rx="4" stroke="#5b21b6" strokeWidth="2" fill="none"/>
              <line x1="6" y1="14" x2="22" y2="14" stroke="#5b21b6" strokeWidth="2"/>
            </svg>
            <span className="sidebar-btn-label">Șabloane</span>
          </button>
          <button className="sidebar-icon-btn" aria-label="Aplicații">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="6" y="6" width="6" height="6" rx="2" stroke="#5b21b6" strokeWidth="2" fill="none"/>
              <rect x="16" y="6" width="6" height="6" rx="2" stroke="#5b21b6" strokeWidth="2" fill="none"/>
              <rect x="6" y="16" width="6" height="6" rx="2" stroke="#5b21b6" strokeWidth="2" fill="none"/>
              <rect x="16" y="16" width="6" height="6" rx="2" stroke="#5b21b6" strokeWidth="2" fill="none"/>
            </svg>
            <span className="sidebar-btn-label">Aplicații</span>
          </button>
        </div>
        {/* Buton profil jos */}
        <div className="sidebar-profile-btn-container">
          <button
            className="sidebar-profile-btn"
            aria-label="Profil utilizator"
            ref={profileBtnRef}
            onClick={() => setShowProfileMenu((v) => !v)}
          >
            <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="18" cy="18" r="16" stroke="#8b5cf6" strokeWidth="2" fill="#ede9fe"/>
              <circle cx="18" cy="15" r="5" stroke="#8b5cf6" strokeWidth="2" fill="#fff"/>
              <path d="M10 28c0-4 8-4 8-4s8 0 8 4" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
            </svg>
          </button>
          {showProfileMenu && (
            <div className="profile-menu-dropdown profile-menu-dropdown-right" ref={profileMenuRef}>
              <div className="profile-menu-header">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="18" cy="18" r="16" stroke="#8b5cf6" strokeWidth="2" fill="#ede9fe"/>
                  <circle cx="18" cy="15" r="5" stroke="#8b5cf6" strokeWidth="2" fill="#fff"/>
                  <path d="M10 28c0-4 8-4 8-4s8 0 8 4" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
                </svg>
                <span className="profile-menu-username">{userName}</span>
              </div>
              <button className="profile-menu-btn">Setări</button>
              <button className="profile-menu-btn" onClick={handleHelp}>Help</button>
              <button className="profile-menu-btn" onClick={handleInfo}>Info</button>
              <button className="profile-menu-btn" onClick={handleLogout}>Deconectare</button>
            </div>
          )}
        </div>
      </aside>
      <main className="dashboard-main">
        <h1 className="dashboard-title dashboard-title-gradient">Ce design vei crea astăzi?</h1>
        <div className="dashboard-top-buttons">
          <button className="dashboard-top-btn">
            <svg width="32" height="32" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="7" width="14" height="11" rx="3" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
              <rect x="7" y="10" width="8" height="2.5" rx="1" stroke="#8b5cf6" strokeWidth="1" fill="none"/>
            </svg>
            <span>Designurile tale</span>
          </button>
          <button className="dashboard-top-btn">
            <svg width="32" height="32" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="4" y="4" width="14" height="14" rx="4" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
              <line x1="4" y1="11" x2="18" y2="11" stroke="#8b5cf6" strokeWidth="2"/>
            </svg>
            <span>Șabloane</span>
          </button>
          <button className="dashboard-top-btn">
            <svg width="32" height="32" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="11" cy="11" r="9" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
              <text x="7" y="16" fontSize="8" fill="#8b5cf6">AI</text>
            </svg>
            <span>AI Assistant</span>
          </button>
        </div>
        <div className="dashboard-search-box">
          <input type="text" className="dashboard-search-input dashboard-search-input-long" placeholder="Caută designuri, proiecte sau șabloane..." />
          <button className="dashboard-search-btn" aria-label="Caută">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="8" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
              <line x1="16" y1="16" x2="21" y2="21" stroke="#8b5cf6" strokeWidth="2"/>
            </svg>
          </button>
        </div>
        {/* Butoanele Istoric și Șabloane eliminate */}
      </main>
      {/* Buton help/FAQ/AI tool dreapta jos */}
      <button className="dashboard-help-btn" aria-label="Ajutor" style={{ position: 'fixed', right: '32px', bottom: '32px', zIndex: 200 }}>
        <svg width="44" height="44" viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="22" cy="22" r="20" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="2"/>
          <text x="14" y="30" fontSize="22" fill="#8b5cf6" fontWeight="bold">?</text>
        </svg>
      </button>
    </div>
  );
}

export default Dashboard;
