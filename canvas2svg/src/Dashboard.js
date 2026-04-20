


import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';

function Dashboard() {
  // Ia username-ul din localStorage (setat la login)
  const userName = localStorage.getItem('username') || '';
  const userId = localStorage.getItem('userId');
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);
  const createBtnRef = useRef(null);
  const profileBtnRef = useRef(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  
  // State pentru meniul Pornire (diagrame salvate)
  const [showStartMenu, setShowStartMenu] = useState(false);
  const [savedDiagrams, setSavedDiagrams] = useState([]);
  const [loadingDiagrams, setLoadingDiagrams] = useState(false);
  const startMenuRef = useRef(null);
  const startBtnRef = useRef(null);
  
  // State pentru poza de profil
  const [profilePicture, setProfilePicture] = useState('');
  
  // State pentru tab activ și grid-ul de design-uri
  const [activeTab, setActiveTab] = useState(null); // 'my-designs', 'templates', 'ai-assistant'
  const [designsForGrid, setDesignsForGrid] = useState([]);
  const [loadingDesignsGrid, setLoadingDesignsGrid] = useState(false);
  const [designPreviews, setDesignPreviews] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchSuggestions, setShowSearchSuggestions] = useState(false);
  const searchBoxRef = useRef(null);

  // State pentru UML Type Selector Modal
  const [showUMLTypeModal, setShowUMLTypeModal] = useState(false);
  const umlModalRef = useRef(null);

  // Fetch profile picture la mount
  useEffect(() => {
    if (userId) {
      fetch(`http://localhost:5000/api/auth/profile/${userId}`)
        .then(res => res.json())
        .then(data => {
          if (data.profile_picture) {
            setProfilePicture(data.profile_picture);
          }
        })
        .catch(err => console.error('Error fetching profile:', err));
    }
  }, [userId]);

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
      if (
        startMenuRef.current &&
        !startMenuRef.current.contains(event.target) &&
        !startBtnRef.current.contains(event.target)
      ) {
        setShowStartMenu(false);
      }
      if (
        searchBoxRef.current &&
        !searchBoxRef.current.contains(event.target)
      ) {
        setShowSearchSuggestions(false);
      }
    }
    if (showMenu || showProfileMenu || showStartMenu || showSearchSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu, showProfileMenu, showStartMenu, showSearchSuggestions]);

  const profileMenuRef = useRef(null);

  // Funcție pentru a obține diagramele salvate
  async function fetchSavedDiagrams() {
    // Dacă meniul e deja deschis, doar îl închidem
    if (showStartMenu) {
      setShowStartMenu(false);
      return;
    }
    
    if (!userId) {
      alert('Trebuie să fii autentificat pentru a vedea diagramele salvate!');
      return;
    }
    
    setLoadingDiagrams(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/diagrams/user/${userId}`);
      const data = await response.json();
      
      if (response.ok) {
        setSavedDiagrams(data.diagrams || []);
        setShowStartMenu(true);
      } else {
        alert(data.message || 'Eroare la încărcarea diagramelor!');
      }
    } catch (err) {
      alert('Eroare de rețea sau server!');
    }
    setLoadingDiagrams(false);
  }

  // Funcție pentru a deschide o diagramă
  function openDiagram(diagram) {
    setShowStartMenu(false);
    
    // Navighează la editorul corespunzător tipului
    const type = diagram.nume_tip?.toLowerCase() || '';
    
    if (type.includes('class')) {
      navigate(`/uml-editor/class/${diagram.id_diagrama}`);
    } else if (type.includes('sequence')) {
      navigate(`/uml-editor/sequence/${diagram.id_diagrama}`);
    } else if (type.includes('use case') || type.includes('use_case')) {
      navigate(`/uml-editor/usecase/${diagram.id_diagrama}`);
    } else if (type.includes('component')) {
      navigate(`/uml-editor/component/${diagram.id_diagrama}`);
    } else if (type.includes('deployment')) {
      navigate(`/uml-editor/deployment/${diagram.id_diagrama}`);
    } else if (type.includes('activity')) {
      navigate(`/uml-editor/activity/${diagram.id_diagrama}`);
    } else if (type.includes('object')) {
      navigate(`/uml-editor/object/${diagram.id_diagrama}`);
    } else if (type.includes('state machine') || type.includes('state_machine')) {
      navigate(`/uml-editor/state-machine/${diagram.id_diagrama}`);
    } else if (type.includes('state') || type.includes('automat')) {
      navigate(`/uml-editor/state-machine/${diagram.id_diagrama}`);
    } else if (type.includes('neorientat')) {
      navigate(`/graph/${diagram.id_diagrama}`);
    } else if (type.includes('orientat')) {
      navigate(`/orientedgraph/${diagram.id_diagrama}`);
    } else if (type.includes('uml')) {
      navigate(`/uml/${diagram.id_diagrama}`);
    } else if (type.includes('petri')) {
      navigate(`/petrinet/${diagram.id_diagrama}`);
    } else {
      // Default: graf neorientat
      navigate(`/graph/${diagram.id_diagrama}`);
    }
  }

  // Formatare dată
  function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('ro-RO', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Funcție pentru a genera un preview SVG simplu din datele diagramei
  function generatePreviewSVG(elements, connections) {
    if (!elements || elements.length === 0) {
      return '<svg viewBox="0 0 300 200" xmlns="http://www.w3.org/2000/svg"><rect x="10" y="10" width="280" height="180" fill="#f3e8ff" stroke="#8b5cf6" stroke-width="2" rx="4"/><text x="150" y="105" text-anchor="middle" font-size="16" fill="#8b5cf6" font-family="Arial">Diagramă goală</text></svg>';
    }

    // Calculează boundingbox din elemente
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    elements.forEach(el => {
      const x = el.x || 0;
      const y = el.y || 0;
      const w = el.width || 60;
      const h = el.height || 60;
      minX = Math.min(minX, x - w/2);
      minY = Math.min(minY, y - h/2);
      maxX = Math.max(maxX, x + w/2);
      maxY = Math.max(maxY, y + h/2);
    });

    if (maxX === -Infinity) {
      maxX = 300;
      minX = 0;
      maxY = 200;
      minY = 0;
    }

    const padding = 20;
    const width = Math.max(300, maxX - minX + padding * 2);
    const height = Math.max(200, maxY - minY + padding * 2);
    const offsetX = -minX + padding;
    const offsetY = -minY + padding;

    let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f3e8ff"/>`;

    // Desenează conexiunile (muchiile/tranzițiile)
    if (connections && Array.isArray(connections)) {
      connections.forEach(conn => {
        const fromNode = elements.find(el => el.id === conn.fromId);
        const toNode = elements.find(el => el.id === conn.toId);
        
        if (fromNode && toNode) {
          const x1 = (fromNode.x || 0) + offsetX;
          const y1 = (fromNode.y || 0) + offsetY;
          const x2 = (toNode.x || 0) + offsetX;
          const y2 = (toNode.y || 0) + offsetY;
          svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#8b5cf6" stroke-width="1.5"/>`;
        }
      });
    }

    // Desenează nodurile/stările ca cercuri
    elements.forEach((el, idx) => {
      const x = (el.x || 0) + offsetX;
      const y = (el.y || 0) + offsetY;
      const r = 20;
      svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="#ede9fe" stroke="#8b5cf6" stroke-width="2"/>`;
      
      // Adează label trunchiat
      const label = (el.name || el.label || '').substring(0, 5);
      if (label) {
        svg += `<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="10" fill="#5b21b6" font-family="Arial">${label}</text>`;
      }
    });

    svg += '</svg>';
    return svg;
  }

  // Funcție pentru a prelua designuri și a le afișa în grid
  async function handleMyDesignsClick() {
    if (activeTab === 'my-designs') {
      setActiveTab(null);
      return;
    }

    if (!userId) {
      alert('Trebuie să fii autentificat!');
      return;
    }

    setActiveTab('my-designs');
    setLoadingDesignsGrid(true);

    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/diagrams/user/${userId}`);
      const data = await response.json();

      if (response.ok) {
        setDesignsForGrid(data.diagrams || []);
        
        // Preload previews pentru fiecare design
        const previews = {};
        for (const diagram of (data.diagrams || [])) {
          try {
            const detailResponse = await fetch(`${apiUrl}/api/diagrams/${diagram.id_diagrama}`);
            const detailData = await detailResponse.json();
            
            const elements = detailData.elements || [];
            const connections = detailData.connections || [];
            previews[diagram.id_diagrama] = generatePreviewSVG(elements, connections);
          } catch (err) {
            console.error('Error loading diagram detail:', err);
            previews[diagram.id_diagrama] = generatePreviewSVG([], []);
          }
        }
        setDesignPreviews(previews);
      } else {
        alert('Eroare la încărcarea design-urilor');
      }
    } catch (err) {
      console.error('Error:', err);
      alert('Eroare de rețea');
    }

    setLoadingDesignsGrid(false);
  }

  // Obține sugestiile pe baza query-ului
  function getSearchSuggestions() {
    if (!searchQuery.trim() || designsForGrid.length === 0) {
      return [];
    }

    const query = searchQuery.toLowerCase();
    const suggestions = designsForGrid
      .filter(diagram => diagram.titlu.toLowerCase().includes(query))
      .slice(0, 8); // Max 8 sugestii

    return suggestions;
  }

  // Handle click pe o sugestie
  function handleSuggestionClick(diagram) {
    setSearchQuery(diagram.titlu);
    setShowSearchSuggestions(false);
  }

  // Încarcă designs dacă nu sunt încărcați și utilizatorul tipărește în search
  async function loadDesignsIfNeeded() {
    if (designsForGrid.length === 0 && !loadingDesignsGrid && userId) {
      setLoadingDesignsGrid(true);
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const response = await fetch(`${apiUrl}/api/diagrams/user/${userId}`);
        const data = await response.json();

        if (response.ok) {
          setDesignsForGrid(data.diagrams || []);
          
          // Preload previews
          const previews = {};
          for (const diagram of (data.diagrams || [])) {
            try {
              const detailResponse = await fetch(`${apiUrl}/api/diagrams/${diagram.id_diagrama}`);
              const detailData = await detailResponse.json();
              
              const elements = detailData.elements || [];
              const connections = detailData.connections || [];
              previews[diagram.id_diagrama] = generatePreviewSVG(elements, connections);
            } catch (err) {
              console.error('Error loading diagram detail:', err);
              previews[diagram.id_diagrama] = generatePreviewSVG([], []);
            }
          }
          setDesignPreviews(previews);
          setActiveTab('my-designs');
        }
      } catch (err) {
        console.error('Error loading designs:', err);
      }
      setLoadingDesignsGrid(false);
    }
  }

  function handleHelp() {
    navigate('/help');
  }
  function handleInfo() {
    navigate('/info');
  }
  function handleLogout() {
    // Exemplu: șterge userul din localStorage/context
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    navigate('/');
  }

  // Handler pentru selectarea unui tip UML
  function handleUMLTypeSelect(type) {
    setShowUMLTypeModal(false);
    setShowMenu(false);
    switch(type) {
      case 'CLASS':
        navigate('/uml-editor/class/new');
        break;
      case 'SEQUENCE':
        navigate('/uml-editor/sequence/new');
        break;
      case 'USE_CASE':
        navigate('/uml-editor/usecase/new');
        break;
      case 'COMPONENT':
        navigate('/uml-editor/component/new');
        break;
      case 'DEPLOYMENT':
        navigate('/uml-editor/deployment/new');
        break;
      case 'STATE':
        navigate('/uml-editor/state-machine/new');
        break;
      case 'ACTIVITY':
        navigate('/uml-editor/activity/new');
        break;
      case 'OBJECT':
        navigate('/uml-editor/object/new');
        break;
      case 'COMPOSITE_STRUCTURE':
        navigate('/uml-editor/composite/new');
        break;
      case 'STATE_MACHINE':
        navigate('/uml-editor/state-machine/new');
        break;
      default:
        navigate('/uml');
    }
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
            className={`sidebar-icon-btn${showMenu ? ' active' : ''}`}
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
              <button className="create-menu-btn" onClick={() => { setShowMenu(false); navigate('/orientedgraph'); }}>Graf orientat</button>
              <button className="create-menu-btn" onClick={() => { setShowMenu(false); navigate('/graph'); }}>Graf neorientat</button>
              <button className="create-menu-btn" onClick={() => { setShowUMLTypeModal(true); }}>UML</button>
              <button className="create-menu-btn" onClick={() => { setShowMenu(false); navigate('/petrinet'); }}>Rețea Petri</button>
              <button className="create-menu-btn" onClick={() => { setShowMenu(false); navigate('/state'); }}>Automat</button>
            </div>
          )}
        </div>
    <div className="sidebar-icon-group">
          <div style={{ position: 'relative' }}>
            <button 
              className={`sidebar-icon-btn${showStartMenu ? ' active' : ''}`}
              aria-label="Pornire"
              ref={startBtnRef}
              onClick={fetchSavedDiagrams}
            >
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="5" y="8" width="18" height="12" rx="3" stroke="#5b21b6" strokeWidth="2" fill="none"/>
              <rect x="9" y="12" width="10" height="4" rx="1" stroke="#5b21b6" strokeWidth="1" fill="none"/>
            </svg>
              <span className="sidebar-btn-label">Proiecte</span>
            </button>
            {showStartMenu && (
              <div 
                className="create-menu-dropdown" 
                ref={startMenuRef}
                style={{ 
                  minWidth: '280px', 
                  maxHeight: '400px', 
                  overflowY: 'auto',
                  left: '100%',
                  marginLeft: '8px'
                }}
              >
                <div style={{ 
                  padding: '10px 14px', 
                  fontWeight: 700, 
                  color: '#5b21b6', 
                  borderBottom: '1px solid #e9d5ff',
                  fontSize: '1.05rem'
                }}>
                  Diagramele tale salvate
                </div>
                {savedDiagrams.length === 0 ? (
                  <div style={{ padding: '16px 14px', color: '#6b7280', textAlign: 'center' }}>
                    Nu ai diagrame salvate încă.
                  </div>
                ) : (
                  savedDiagrams.map(diagram => (
                    <button 
                      key={diagram.id_diagrama}
                      className="create-menu-btn"
                      onClick={() => openDiagram(diagram)}
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        alignItems: 'flex-start',
                        padding: '12px 14px',
                        gap: '4px'
                      }}
                    >
                      <span style={{ fontWeight: 600, color: '#3c1a6e' }}>{diagram.titlu}</span>
                      <span style={{ fontSize: '0.85rem', color: '#8b5cf6' }}>{diagram.nume_tip}</span>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                        Modificat: {formatDate(diagram.data_update)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
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
            {profilePicture ? (
              <img src={profilePicture} alt="Profil" className="sidebar-profile-img" />
            ) : (
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="18" cy="18" r="16" stroke="#8b5cf6" strokeWidth="2" fill="#ede9fe"/>
                <circle cx="18" cy="15" r="5" stroke="#8b5cf6" strokeWidth="2" fill="#fff"/>
                <path d="M10 28c0-4 8-4 8-4s8 0 8 4" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
              </svg>
            )}
          </button>
          {showProfileMenu && (
            <div className="profile-menu-dropdown profile-menu-dropdown-right" ref={profileMenuRef}>
              <div className="profile-menu-header">
                {profilePicture ? (
                  <img src={profilePicture} alt="Profil" className="profile-menu-img" />
                ) : (
                  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="18" cy="18" r="16" stroke="#8b5cf6" strokeWidth="2" fill="#ede9fe"/>
                    <circle cx="18" cy="15" r="5" stroke="#8b5cf6" strokeWidth="2" fill="#fff"/>
                    <path d="M10 28c0-4 8-4 8-4s8 0 8 4" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
                  </svg>
                )}
                <span className="profile-menu-username">{userName}</span>
              </div>
              <button className="profile-menu-btn" onClick={() => navigate('/settings')}>Setări</button>
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
          <button className="dashboard-top-btn" onClick={handleMyDesignsClick}>
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
        <div className="dashboard-search-box" ref={searchBoxRef}>
          <input 
            type="text" 
            className="dashboard-search-input dashboard-search-input-long" 
            placeholder="Caută designuri, proiecte sau șabloane..." 
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (e.target.value.trim()) {
                setShowSearchSuggestions(true);
                loadDesignsIfNeeded();
              } else {
                setShowSearchSuggestions(false);
              }
            }}
            onFocus={() => {
              if (searchQuery.trim()) {
                setShowSearchSuggestions(true);
                loadDesignsIfNeeded();
              }
            }}
          />
          <button className="dashboard-search-btn" aria-label="Caută">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="10" r="8" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
              <line x1="16" y1="16" x2="21" y2="21" stroke="#8b5cf6" strokeWidth="2"/>
            </svg>
          </button>
          
          {/* Dropdown cu sugestii */}
          {showSearchSuggestions && getSearchSuggestions().length > 0 && (
            <div className="search-suggestions-dropdown">
              {getSearchSuggestions().map((diagram) => (
                <button
                  key={diagram.id_diagrama}
                  className="search-suggestion-item"
                  onClick={() => handleSuggestionClick(diagram)}
                >
                  <svg width="16" height="16" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px' }}>
                    <circle cx="10" cy="10" r="8" stroke="#8b5cf6" strokeWidth="2" fill="none"/>
                    <line x1="16" y1="16" x2="21" y2="21" stroke="#8b5cf6" strokeWidth="2"/>
                  </svg>
                  <span className="suggestion-text">{diagram.titlu}</span>
                  <span className="suggestion-type">{diagram.nume_tip}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Afișare grid de design-uri dacă tab-ul "my-designs" este activ */}
        {activeTab === 'my-designs' && (
          <div className="designs-grid-container">
            {loadingDesignsGrid ? (
              <div className="designs-loading">Se încarcă design-urile...</div>
            ) : designsForGrid.length === 0 ? (
              <div className="designs-empty">
                <p>Nu ai design-uri salvate încă.</p>
                <button className="btn-create-first" onClick={() => navigate('/graph')}>
                  Creează designul tău prim
                </button>
              </div>
            ) : designsForGrid.filter(diagram => diagram.titlu.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && searchQuery ? (
              <div className="designs-empty">
                <p>Nu au fost găsite design-uri care să corespundă căutării: <strong>"{searchQuery}"</strong></p>
              </div>
            ) : (
              <div className="designs-grid">
                {designsForGrid
                  .filter(diagram => 
                    diagram.titlu.toLowerCase().includes(searchQuery.toLowerCase())
                  )
                  .map(diagram => (
                  <div 
                    key={diagram.id_diagrama}
                    className="design-card"
                    onClick={() => openDiagram(diagram)}
                  >
                    <div className="design-preview-wrapper">
                      {designPreviews[diagram.id_diagrama] && (
                        <div 
                          className="design-preview"
                          dangerouslySetInnerHTML={{ __html: designPreviews[diagram.id_diagrama] }}
                        />
                      )}
                    </div>
                    <div className="design-card-info">
                      <h3 className="design-title">{diagram.titlu}</h3>
                      <p className="design-type">{diagram.nume_tip}</p>
                      <p className="design-date">Modificat: {formatDate(diagram.data_update)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Butoanele Istoric și Șabloane eliminate */}
      </main>
      
      {/* Modal UML Type Selector */}
      {showUMLTypeModal && (
        <div 
          className="uml-type-modal-overlay"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowUMLTypeModal(false)}
        >
          <div 
            ref={umlModalRef}
            className="uml-type-modal"
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 10px 40px rgba(91, 33, 182, 0.15)',
              padding: '32px',
              maxWidth: '800px',
              width: '90%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ color: '#3c1a6e', fontSize: '1.5rem', marginBottom: '8px' }}>
                Ce fel de diagramă UML vrei să creezi?
              </h2>
              <p style={{ color: '#8b5cf6', fontSize: '0.95rem' }}>
                Alege tipul de diagramă din opțiunile de mai jos
              </p>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '12px',
              marginBottom: '24px'
            }}>
              {[
                { type: 'CLASS', label: '📦 Class', icon: '📦' },
                { type: 'SEQUENCE', label: '🔄 Sequence', icon: '🔄' },
                { type: 'USE_CASE', label: '⭕ Use Case', icon: '⭕' },
                { type: 'COMPONENT', label: '🧩 Component', icon: '🧩' },
                { type: 'DEPLOYMENT', label: '🖥️ Deployment', icon: '🖥️' },
                { type: 'STATE', label: '🔀 State', icon: '🔀' },
                { type: 'ACTIVITY', label: '⚡ Activity', icon: '⚡' },
                { type: 'OBJECT', label: '🎯 Object', icon: '🎯' },
                { type: 'COMPOSITE_STRUCTURE', label: '🧩 Composite', icon: '🧩' }
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleUMLTypeSelect(item.type)}
                  style={{
                    padding: '16px 12px',
                    border: '2px solid #e9d5ff',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    color: '#3c1a6e',
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#f3e8ff';
                    e.target.style.borderColor = '#8b5cf6';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'white';
                    e.target.style.borderColor = '#e9d5ff';
                  }}
                >
                  <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
                  <span>{item.label.split(' ')[1]}</span>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowUMLTypeModal(false)}
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#f3e8ff',
                color: '#5b21b6',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: 500,
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#ede9fe';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = '#f3e8ff';
              }}
            >
              Anulează
            </button>
          </div>
        </div>
      )}

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
