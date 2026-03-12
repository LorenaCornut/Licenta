import React, { useState, useRef, useEffect } from 'react';
import './StateEditor.css';
import { useNavigate, useParams } from 'react-router-dom';

// State Diagram Elements
const STATE_ELEMENTS = {
  STATE: { label: 'Stare', icon: '▭', color: '#f3e8ff', isNode: true },
  INITIAL: { label: 'Stare Inițială', icon: '⬤', color: '#000', isNode: true },
  FINAL: { label: 'Stare Finală', icon: '◎', color: '#000', isNode: true },
  TRANSITION: { label: 'Tranziție', icon: '→', color: '#f0f0f0', isConnection: true }
};

const escapeXML = (str) => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
};

const StateEditor = () => {
  const navigate = useNavigate();
  const { diagramId } = useParams();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const [selectedType, setSelectedType] = useState('STATE');
  const [elements, setElements] = useState([]);
  const [connections, setConnections] = useState([]);
  const [draggedElement, setDraggedElement] = useState(null);
  const [draggingInCanvas, setDraggingInCanvas] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);
  const [editingElement, setEditingElement] = useState(null);
  const [editName, setEditName] = useState('');
  const [movingElement, setMovingElement] = useState(null);
  const [moveOffset, setMoveOffset] = useState({ x: 0, y: 0 });
  const [connectionMode, setConnectionMode] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [hoveringConnectionElement, setHoveringConnectionElement] = useState(null);

  // Load diagram if ID provided
  useEffect(() => {
    if (diagramId && diagramId !== 'new') {
      loadDiagram(diagramId);
    }
  }, [diagramId]);

  // Load diagram from backend
  const loadDiagram = async (id) => {
    try {
      const response = await fetch(`http://localhost:5000/api/diagrams/${id}`);
      const data = await response.json();
      if (data.elements) setElements(JSON.parse(data.elements));
      if (data.connections) setConnections(JSON.parse(data.connections));
    } catch (error) {
      console.error('Error loading diagram:', error);
    }
  };

  // Save diagram
  const saveDiagram = async () => {
    const diagramData = {
      type: 'STATE_DIAGRAM',
      elements: JSON.stringify(elements),
      connections: JSON.stringify(connections),
      name: 'State Diagram'
    };

    try {
      const method = diagramId && diagramId !== 'new' ? 'PUT' : 'POST';
      const url = diagramId && diagramId !== 'new' 
        ? `http://localhost:5000/api/diagrams/${diagramId}`
        : 'http://localhost:5000/api/diagrams';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diagramData)
      });

      const result = await response.json();
      alert('Diagram saved successfully!');
      if (method === 'POST') {
        navigate(`/state/${result.id}`);
      }
    } catch (error) {
      console.error('Error saving diagram:', error);
      alert('Failed to save diagram');
    }
  };

  // Export as JSON
  const exportJSON = () => {
    const data = {
      type: 'STATE_DIAGRAM',
      elements: elements,
      connections: connections,
      name: 'State Diagram'
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'state-diagram.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle import
  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.elements && Array.isArray(data.elements)) setElements(data.elements);
        if (data.connections && Array.isArray(data.connections)) setConnections(data.connections);
        alert('Diagramă importată cu succes!');
      } catch (err) {
        alert('Fișier invalid!');
      }
    };
    reader.readAsText(file);
  };

  // Download as SVG
  const downloadSVG = () => {
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" style="background-color: white;">\n';

    // Draw connections
    connections.forEach(conn => {
      const fromEl = elements.find(e => e.id === conn.fromId);
      const toEl = elements.find(e => e.id === conn.toId);
      
      if (!fromEl || !toEl) return;

      const fromX = fromEl.x + (fromEl.width || 100) / 2;
      const fromY = fromEl.y + (fromEl.height || 80) / 2;
      const toX = toEl.x + (toEl.width || 100) / 2;
      const toY = toEl.y + (toEl.height || 80) / 2;

      svg += `<line x1='${fromX}' y1='${fromY}' x2='${toX}' y2='${toY}' stroke='#7c3aed' stroke-width='2' marker-end='url(#arrowhead)'/>\n`;
      
      if (conn.label) {
        const midX = (fromX + toX) / 2;
        const midY = (fromY + toY) / 2;
        svg += `<text x='${midX}' y='${midY - 10}' font-size='12' font-family='Arial, sans-serif' text-anchor='middle' fill='#7c3aed' font-weight='600'>${escapeXML(conn.label)}</text>\n`;
      }
    });

    // Draw elements
    elements.forEach(el => {
      const w = el.width || 100;
      const h = el.height || 80;
      const x = el.x;
      const y = el.y;

      if (el.type === 'STATE') {
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='#f3e8ff' stroke='#a78bfa' stroke-width='2' rx='12'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + h / 2 + 6}' font-size='14' font-family='Arial, sans-serif' text-anchor='middle' fill='#5b21b6' font-weight='600'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'INITIAL') {
        const radius = Math.min(w, h) / 2 - 3;
        svg += `<circle cx='${x + w / 2}' cy='${y + h / 2}' r='${radius}' fill='#5b21b6' stroke='#5b21b6' stroke-width='2'/>\n`;
      } else if (el.type === 'FINAL') {
        const outerRadius = Math.min(w, h) / 2 - 2;
        const innerRadius = outerRadius * 0.55;
        svg += `<circle cx='${x + w / 2}' cy='${y + h / 2}' r='${outerRadius}' fill='none' stroke='#5b21b6' stroke-width='3'/>\n`;
        svg += `<circle cx='${x + w / 2}' cy='${y + h / 2}' r='${innerRadius}' fill='#5b21b6' stroke='#5b21b6' stroke-width='1'/>\n`;
      }
    });

    svg += `<defs><marker id='arrowhead' markerWidth='10' markerHeight='10' refX='9' refY='3' orient='auto'><polygon points='0 0, 10 3, 0 6' fill='#7c3aed' /></marker></defs>\n`;
    svg += `</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'state-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handle drag start from sidebar
  const handleDragStart = (e, elementType) => {
    setDraggedElement(elementType);
  };

  // Handle drop on canvas
  const handleCanvasDrop = (e) => {
    e.preventDefault();
    if (!draggedElement || STATE_ELEMENTS[draggedElement]?.isConnection) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - canvasRect.left - 50;
    const y = e.clientY - canvasRect.top - 40;

    const newElement = {
      id: Date.now().toString(),
      type: draggedElement,
      name: `${STATE_ELEMENTS[draggedElement].label} ${elements.length + 1}`,
      x: Math.max(0, x),
      y: Math.max(0, y),
      width: 100,
      height: 80
    };

    setElements([...elements, newElement]);
    setDraggedElement(null);
    setDraggingInCanvas(false);
  };

  // Handle element click for connection mode
  const handleElementClick = (e, el) => {
    e.stopPropagation();
    
    if (connectionMode) {
      if (!connectionStart) {
        setConnectionStart({ elementId: el.id });
      } else if (connectionStart.elementId !== el.id) {
        const newConnection = {
          id: Date.now().toString(),
          fromId: connectionStart.elementId,
          toId: el.id,
          label: 'Transition',
          type: 'TRANSITION'
        };
        setConnections([...connections, newConnection]);
        setConnectionStart(null);
        setConnectionMode(null);
      }
    } else {
      setSelectedElement(el.id);
    }
  };

  // Handle element double-click for editing
  const handleElementDoubleClick = (e, el) => {
    e.stopPropagation();
    if (el.type === 'INITIAL' || el.type === 'FINAL') return;
    setEditingElement(el.id);
    setEditName(el.name);
  };

  // Handle element delete
  const handleDeleteElement = (elementId) => {
    setElements(elements.filter(el => el.id !== elementId));
    setConnections(connections.filter(conn => conn.fromId !== elementId && conn.toId !== elementId));
    setSelectedElement(null);
  };

  // Handle element drag
  const handleElementMouseDown = (e, el) => {
    if (connectionMode || editingElement === el.id) return;
    
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMoveOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setMovingElement(el.id);
    setSelectedElement(el.id);
  };

  // Handle save element name
  const handleSaveName = () => {
    if (editingElement && editName.trim()) {
      setElements(elements.map(el =>
        el.id === editingElement ? { ...el, name: editName } : el
      ));
      setEditingElement(null);
      setEditName('');
    }
  };

  // Collision detection
  const checkCollision = (rect1, rect2) => {
    return !(rect1.x + rect1.width <= rect2.x ||
             rect2.x + rect2.width <= rect1.x ||
             rect1.y + rect1.height <= rect2.y ||
             rect2.y + rect2.height <= rect1.y);
  };

  const hasCollisionWithOthers = (elementId, newX, newY, newWidth, newHeight) => {
    const movingRect = { x: newX, y: newY, width: newWidth, height: newHeight };
    
    for (const el of elements) {
      if (el.id === elementId) continue;
      const elRect = { x: el.x, y: el.y, width: el.width || 100, height: el.height || 80 };
      if (checkCollision(movingRect, elRect)) {
        return true;
      }
    }
    return false;
  };

  // Handle canvas mouse move for dragging
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!movingElement || !canvasRef.current) return;
      
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const newX = Math.max(0, e.clientX - canvasRect.left - moveOffset.x);
      const newY = Math.max(0, e.clientY - canvasRect.top - moveOffset.y);
      
      const currentEl = elements.find(el => el.id === movingElement);
      if (!currentEl || (currentEl.x === newX && currentEl.y === newY)) return; // Skip if no change
      
      const elWidth = currentEl.width || 100;
      const elHeight = currentEl.height || 80;
      
      // Check for collision with other elements
      if (hasCollisionWithOthers(movingElement, newX, newY, elWidth, elHeight)) {
        return; // Don't allow move if it would cause overlap
      }
      
      const deltaX = newX - currentEl.x;
      const deltaY = newY - currentEl.y;
      
      // Update elements
      const updatedElements = elements.map(el =>
        el.id === movingElement ? { ...el, x: newX, y: newY } : el
      );
      
      // Update connections attached to moving element
      const updatedConnections = connections.map(conn => {
        let updated = { ...conn };
        if ((conn.fromId === movingElement || conn.toId === movingElement) && conn.controlPoints) {
          updated.controlPoints = conn.controlPoints.map(cp => ({
            x: cp.x + deltaX,
            y: cp.y + deltaY
          }));
        }
        return updated;
      });
      
      setElements(updatedElements);
      setConnections(updatedConnections);
    };

    const handleMouseUp = () => {
      setMovingElement(null);
    };

    if (movingElement) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [movingElement, moveOffset, elements, connections]);

  return (
    <div className="state-editor-container">
      {/* Header */}
      <div className="state-editor-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          ← Înapoi
        </button>
        <h1>Automat State Diagram Editor</h1>
        <div className="header-actions">
          <button className="btn-primary" onClick={saveDiagram}>Salvează</button>
          <div className="dropdown-save">
            <button className="btn-secondary">Exportă ▼</button>
            <div className="dropdown-content">
              <button onClick={downloadSVG}>Export SVG</button>
              <button onClick={exportJSON}>Export JSON</button>
            </div>
          </div>
          <button className="btn-secondary" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Importă</button>
          <input
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleImport}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="state-editor-main">
      <div className="state-editor-sidebar">
        <div className="sidebar-header">
          <h2>Elemente</h2>
        </div>

        <div className="elements-list">
          {Object.entries(STATE_ELEMENTS).map(([key, value]) => (
            <div
              key={key}
              className={`element-item ${!value.isConnection ? 'draggable' : ''}`}
              draggable={!value.isConnection}
              onDragStart={(e) => handleDragStart(e, key)}
              onClick={() => value.isConnection && setConnectionMode(value.isConnection ? key : null)}
            >
              <span className="element-icon">{value.icon}</span>
              <span className="element-label">{value.label}</span>
            </div>
          ))}
        </div>

        {/* Diagram Info Section */}
        <div className="diagram-info">
          <div className="info-section">
            <h3>Mulțimea stărilor (Q)</h3>
            <div className="info-list">
              {elements.length === 0 ? (
                <p className="info-empty">Adaugă stări la diagramă</p>
              ) : (
                elements.map(el => (
                  <div key={el.id} className="info-item">
                    <span className="info-type">
                      {el.type === 'INITIAL' ? '→' : el.type === 'FINAL' ? '◎' : '▭'}
                    </span>
                    <span className="info-text">{el.name}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="info-section">
            <h3>Alfabetul (Σ)</h3>
            <div className="info-list">
              {connections.length === 0 ? (
                <p className="info-empty">Adaugă tranzițiiί la diagramă</p>
              ) : (
                connections.map(conn => (
                  <div key={conn.id} className="info-item">
                    <span className="info-text">{conn.label || 'ε'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        className="state-canvas"
        ref={canvasRef}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleCanvasDrop}
        onClick={() => {
          setSelectedElement(null);
          setConnectionMode(null);
          setConnectionStart(null);
        }}
      >
        <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', width: '100%', height: '100%' }}>
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
              <polygon points="0 0, 10 3, 0 6" fill="#7c3aed" />
            </marker>
          </defs>
          
          {/* Draw connections */}
          {connections.map(conn => {
            const fromEl = elements.find(e => e.id === conn.fromId);
            const toEl = elements.find(e => e.id === conn.toId);
            if (!fromEl || !toEl) return null;

            const fromX = fromEl.x + (fromEl.width || 100) / 2;
            const fromY = fromEl.y + (fromEl.height || 80) / 2;
            const toX = toEl.x + (toEl.width || 100) / 2;
            const toY = toEl.y + (toEl.height || 80) / 2;

            return (
              <g key={conn.id}>
                <line x1={fromX} y1={fromY} x2={toX} y2={toY} stroke="#7c3aed" strokeWidth="2" markerEnd="url(#arrowhead)" />
                {conn.label && (
                  <text x={(fromX + toX) / 2} y={(fromY + toY) / 2 - 10} fontSize="12" fontFamily="Arial, sans-serif" textAnchor="middle" fill="#7c3aed" fontWeight="600">
                    {conn.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Draw elements */}
        {elements.map(el => (
          <div
            key={el.id}
            data-element-id={el.id}
            className={`state-element ${el.type} ${selectedElement === el.id ? 'selected' : ''} ${editingElement === el.id ? 'editing' : ''}`}
            style={{
              left: `${el.x}px`,
              top: `${el.y}px`,
              width: `${el.width}px`,
              height: `${el.height}px`
            }}
            onClick={(e) => handleElementClick(e, el)}
            onDoubleClick={(e) => handleElementDoubleClick(e, el)}
            onMouseDown={(e) => handleElementMouseDown(e, el)}
            onMouseEnter={() => connectionMode && setHoveringConnectionElement(el.id)}
            onMouseLeave={() => setHoveringConnectionElement(null)}
          >
            {el.type === 'STATE' ? (
              <>
                {editingElement === el.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setEditingElement(null);
                    }}
                    onBlur={handleSaveName}
                    autoFocus
                    className="inline-edit"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="state-name">{el.name}</div>
                )}
              </>
            ) : el.type === 'INITIAL' ? (
              <svg viewBox="0 0 100 100" className="circle-state">
                <circle cx="50" cy="50" r="40" fill="#5b21b6" stroke="#7c3aed" strokeWidth="2" />
              </svg>
            ) : el.type === 'FINAL' ? (
              <svg viewBox="0 0 100 100" className="circle-state">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#7c3aed" strokeWidth="3" />
                <circle cx="50" cy="50" r="24" fill="#5b21b6" stroke="#7c3aed" strokeWidth="1" />
              </svg>
            ) : null}

            {selectedElement === el.id && (
              <button
                className="element-delete-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteElement(el.id);
                }}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
};

export default StateEditor;
