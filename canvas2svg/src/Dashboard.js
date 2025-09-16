


import React from 'react';
import './Dashboard.css';

function Dashboard() {
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
        <button className="sidebar-icon-btn" aria-label="Creează">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="13" y="6" width="2" height="16" rx="1" fill="#5b21b6"/>
            <rect x="6" y="13" width="16" height="2" rx="1" fill="#5b21b6"/>
          </svg>
          <span className="sidebar-btn-label">Creează</span>
        </button>
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
    </div>
  );
}

export default Dashboard;
