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
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState(null);
  const [hoveringConnectionElement, setHoveringConnectionElement] = useState(null);
  const [editingConnection, setEditingConnection] = useState(null);
  const [editConnectionLabel, setEditConnectionLabel] = useState('');

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
    
    // Add marker definition
    svg += '<defs><marker id="arrowhead" markerWidth="15" markerHeight="15" refX="12" refY="7.5" orient="auto"><polygon points="0 0, 15 7.5, 0 15" fill="#7c3aed" /></marker></defs>\n';

    // Draw connections
    connections.forEach(conn => {
      const fromEl = elements.find(e => e.id === conn.fromId);
      const toEl = elements.find(e => e.id === conn.toId);
      
      if (!fromEl || !toEl) return;

      const fromX = fromEl.x + (fromEl.width || 100) / 2;
      const fromY = fromEl.y + (fromEl.height || 100) / 2;
      const toX = toEl.x + (toEl.width || 100) / 2;
      const toY = toEl.y + (toEl.height || 100) / 2;
      
      // Calculate angle and direction
      const dx = toX - fromX;
      const dy = toY - fromY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const radiusStart = 41; // Start point on edge
      const radiusEnd = 43; // End point adjusted for arrow on edge

      // Self-loop case
      if (fromEl.id === toEl.id) {
        const elementWidth = fromEl.width || 100;
        const elementHeight = fromEl.height || 100;
        
        const startX = fromX - elementWidth / 3;
        const startY = fromY - (elementHeight / 2) - 20;
        const endX = fromX + elementWidth / 3;
        const endY = fromY - (elementHeight / 2) - 20;
        
        const arcRadius = Math.abs(endX - startX) / 1.5;
        const textCenterX = fromX;
        const textCenterY = startY + arcRadius + 15;
        
        svg += `<path d='M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 0 1 ${endX} ${endY}' stroke='#7c3aed' stroke-width='2' fill='none' marker-end='url(#arrowhead)'/>\n`;
        if (conn.label) {
          svg += `<text x='${textCenterX}' y='${textCenterY}' font-size='12' font-family='Arial, sans-serif' text-anchor='middle' fill='#7c3aed' font-weight='600'>${escapeXML(conn.label)}</text>\n`;
        }
      } else {
        // Calculate points on circumference
        const lineStartX = fromX + radiusStart * Math.cos(angle);
        const lineStartY = fromY + radiusStart * Math.sin(angle);
        const lineEndX = toX - radiusEnd * Math.cos(angle);
        const lineEndY = toY - radiusEnd * Math.sin(angle);
        
        // Check for bidirectional connection
        const reverseConn = connections.find(c => 
          c.fromId === toEl.id && c.toId === fromEl.id
        );
        const isBidirectional = !!reverseConn;
        
        let pathD;
        let labelX = (lineStartX + lineEndX) / 2;
        let labelY = (lineStartY + lineEndY) / 2 + 15;
        
        if (isBidirectional) {
          // Bezier curve - same logic as editor
          let perpX = -Math.sin(angle);
          let perpY = Math.cos(angle);
          
          // If backward connection, invert perpendicular
          if (conn.fromId > conn.toId) {
            perpX = -perpX;
            perpY = -perpY;
          }
          
          // Midpoint at 50% of line
          const midX = (lineStartX + lineEndX) / 2;
          const midY = (lineStartY + lineEndY) / 2;
          
          // Control point offset
          const controlOffset = 60;
          
          // S1→S2: offsetFactor = -1 (pull down)
          // S2→S1: offsetFactor = 1 (pull up)
          const offsetFactor = conn.fromId < conn.toId ? -1 : 1;
          
          const controlX = midX + perpX * controlOffset * offsetFactor;
          const controlY = midY + perpY * controlOffset * offsetFactor;
          
          // Quadratic Bezier curve
          pathD = `M ${lineStartX} ${lineStartY} Q ${controlX} ${controlY} ${lineEndX} ${lineEndY}`;
          
          // Label positioning
          labelX = controlX;
          if (conn.fromId < conn.toId) {
            labelY = controlY + 20;
          } else {
            labelY = controlY - 20;
          }
        } else {
          // Straight line
          pathD = `M ${lineStartX} ${lineStartY} L ${lineEndX} ${lineEndY}`;
        }
        
        svg += `<path d='${pathD}' stroke='#7c3aed' stroke-width='2' fill='none' marker-end='url(#arrowhead)'/>\n`;
        
        if (conn.label) {
          svg += `<text x='${labelX}' y='${labelY}' font-size='12' font-family='Arial, sans-serif' text-anchor='middle' fill='#7c3aed' font-weight='600'>${escapeXML(conn.label)}</text>\n`;
        }
      }
    });

    // Draw elements
    elements.forEach(el => {
      const w = el.width || 100;
      const h = el.height || 100;
      const x = el.x;
      const y = el.y;

      if (el.type === 'STATE') {
        const radius = Math.min(w, h) / 2 - 3;
        svg += `<circle cx='${x + w / 2}' cy='${y + h / 2}' r='${radius}' fill='#f3e8ff' stroke='#7c3aed' stroke-width='2'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + h / 2 + 5}' font-size='14' font-family='Arial, sans-serif' text-anchor='middle' fill='#5b21b6' font-weight='600'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'INITIAL') {
        const radius = Math.min(w, h) / 2 - 3;
        svg += `<circle cx='${x + w / 2}' cy='${y + h / 2}' r='${radius}' fill='#5b21b6' stroke='#5b21b6' stroke-width='2'/>\n`;
        if (el.name) {
          svg += `<text x='${x + w / 2}' y='${y + h / 2 + 5}' font-size='12' font-family='Arial, sans-serif' text-anchor='middle' fill='#ffffff' font-weight='600'>${escapeXML(el.name)}</text>\n`;
        }
      } else if (el.type === 'FINAL') {
        const outerRadius = Math.min(w, h) / 2 - 2;
        const innerRadius = outerRadius * 0.55;
        svg += `<circle cx='${x + w / 2}' cy='${y + h / 2}' r='${outerRadius}' fill='none' stroke='#5b21b6' stroke-width='3'/>\n`;
        svg += `<circle cx='${x + w / 2}' cy='${y + h / 2}' r='${innerRadius}' fill='#5b21b6' stroke='#5b21b6' stroke-width='1'/>\n`;
        if (el.name) {
          svg += `<text x='${x + w / 2}' y='${y + h / 2 + 5}' font-size='12' font-family='Arial, sans-serif' text-anchor='middle' fill='#ffffff' font-weight='600'>${escapeXML(el.name)}</text>\n`;
        }
      }
    });

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
      height: 100
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
        setSelectedElement(el.id);
      } else if (connectionStart.elementId !== el.id) {
        // Check if connection already exists
        const existingConnection = connections.find(
          c => c.fromId === connectionStart.elementId && c.toId === el.id
        );
        
        if (!existingConnection) {
          const newConnection = {
            id: Date.now().toString(),
            fromId: connectionStart.elementId,
            toId: el.id,
            label: 'ε',
            type: 'TRANSITION'
          };
          setConnections([...connections, newConnection]);
        }
        setConnectionStart(null);
        setConnectionMode(false);
      } else {
        // Self-loop (same element)
        const existingConnection = connections.find(
          c => c.fromId === el.id && c.toId === el.id
        );
        
        if (!existingConnection) {
          const newConnection = {
            id: Date.now().toString(),
            fromId: el.id,
            toId: el.id,
            label: 'ε',
            type: 'TRANSITION'
          };
          setConnections([...connections, newConnection]);
        }
        setConnectionStart(null);
        setConnectionMode(false);
      }
    } else {
      setSelectedElement(el.id);
    }
  };

  // Handle element double-click for editing
  const handleElementDoubleClick = (e, el) => {
    e.stopPropagation();
    setEditingElement(el.id);
    setEditName(el.name || '');
  };

  // Handle element delete
  const handleDeleteElement = (elementId) => {
    setElements(elements.filter(el => el.id !== elementId));
    setConnections(connections.filter(conn => conn.fromId !== elementId && conn.toId !== elementId));
    setSelectedElement(null);
  };

  // Handle delete connection
  const handleDeleteConnection = (connectionId) => {
    setConnections(connections.filter(conn => conn.id !== connectionId));
    setEditingConnection(null);
  };

  // Handle save connection label
  const handleSaveConnectionLabel = () => {
    if (editingConnection && editConnectionLabel.trim()) {
      setConnections(connections.map(conn =>
        conn.id === editingConnection ? { ...conn, label: editConnectionLabel } : conn
      ));
      setEditingConnection(null);
      setEditConnectionLabel('');
    }
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
      const elRect = { x: el.x, y: el.y, width: el.width || 100, height: el.height || 100 };
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
      const elHeight = currentEl.height || 100;
      
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
              className={`element-item ${!value.isConnection ? 'draggable' : ''} ${key === 'TRANSITION' && connectionMode ? 'active' : ''}`}
              draggable={!value.isConnection}
              onDragStart={(e) => handleDragStart(e, key)}
              onClick={() => {
                if (value.isConnection) {
                  setConnectionMode(!connectionMode);
                  setConnectionStart(null);
                }
              }}
            >
              <span className="element-icon">{value.icon}</span>
              <span className="element-label">{value.label}</span>
              {key === 'TRANSITION' && connectionMode && <span className="connection-mode-indicator">● Activ</span>}
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
                connections.map(conn => {
                  const fromEl = elements.find(e => e.id === conn.fromId);
                  const toEl = elements.find(e => e.id === conn.toId);
                  return (
                    <div key={conn.id} className="info-item info-connection">
                      <span className="info-text">
                        {fromEl?.name || 'Unknown'} → {toEl?.name || 'Unknown'}: <strong>{conn.label}</strong>
                      </span>
                      <button 
                        className="btn-edit-transition"
                        onClick={() => {
                          setEditingConnection(conn.id);
                          setEditConnectionLabel(conn.label);
                        }}
                      >
                        ✎
                      </button>
                      <button 
                        className="btn-delete-transition"
                        onClick={() => handleDeleteConnection(conn.id)}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })
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
          setConnectionMode(false);
          setConnectionStart(null);
        }}
        style={{ cursor: connectionMode ? 'crosshair' : 'default' }}
      >
        <svg style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', width: '100%', height: '100%' }}>
          <defs>
            <marker id="arrowhead" markerWidth="15" markerHeight="15" refX="12" refY="7.5" orient="auto">
              <polygon points="0 0, 15 7.5, 0 15" fill="#7c3aed" />
            </marker>
          </defs>
          
          {/* Draw connections */}
          {connections.map(conn => {
            const fromEl = elements.find(e => e.id === conn.fromId);
            const toEl = elements.find(e => e.id === conn.toId);
            if (!fromEl || !toEl) return null;

            const fromX = fromEl.x + (fromEl.width || 100) / 2;
            const fromY = fromEl.y + (fromEl.height || 100) / 2;
            const toX = toEl.x + (toEl.width || 100) / 2;
            const toY = toEl.y + (toEl.height || 100) / 2;

            // Self-loop case
            if (fromEl.id === toEl.id) {
              const elementWidth = fromEl.width || 100;
              const elementHeight = fromEl.height || 100;
              
              // Arcul se face deasupra stării
              const startX = fromX - elementWidth / 3;
              const startY = fromY - (elementHeight / 2) - 20;
              const endX = fromX + elementWidth / 3;
              const endY = fromY - (elementHeight / 2) - 20;
              
              const arcRadius = Math.abs(endX - startX) / 1.5;
              const textCenterX = fromX;
              const textCenterY = startY + arcRadius + 15;
              
              return (
                <g 
                  key={conn.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    setEditingConnection(conn.id);
                    setEditConnectionLabel(conn.label);
                  }}
                >
                  <path
                    d={`M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 0 1 ${endX} ${endY}`}
                    stroke="#7c3aed"
                    strokeWidth="2"
                    fill="none"
                    markerEnd="url(#arrowhead)"
                  />
                  <text 
                    x={textCenterX} 
                    y={textCenterY} 
                    fontSize="12" 
                    fontFamily="Arial, sans-serif" 
                    textAnchor="middle" 
                    fill="#7c3aed" 
                    fontWeight="600" 
                    pointerEvents="auto"
                  >
                    {conn.label}
                  </text>
                </g>
              );
            }

            // Normal connection
            const dx = toX - fromX;
            const dy = toY - fromY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            
            // Radius of circle (from SVG r="40")
            const radiusStart = 41; // Start point on edge
            const radiusEnd = 43; // End point adjusted for arrow on edge
            
            // Calculate start point on circumference
            const startX = fromX + radiusStart * Math.cos(angle);
            const startY = fromY + radiusStart * Math.sin(angle);
            
            // Calculate end point on circumference
            const endX = toX - radiusEnd * Math.cos(angle);
            const endY = toY - radiusEnd * Math.sin(angle);
            
            // Check if there's a reverse connection (bidirectional)
            const reverseConn = connections.find(c => 
              c.fromId === toEl.id && c.toId === fromEl.id
            );
            const isBidirectional = !!reverseConn;
            
            // Determine path: straight if single direction, curve if bidirectional
            let pathD;
            let labelX = (startX + endX) / 2;
            let labelY = (startY + endY) / 2 + 15;
            
            if (isBidirectional) {
              // Bezier curve - pull in opposite directions
              let perpX = -Math.sin(angle);
              let perpY = Math.cos(angle);
              
              // If this is a "backward" connection (fromId > toId), invert the perpendicular
              if (conn.fromId > conn.toId) {
                perpX = -perpX;
                perpY = -perpY;
              }
              
              // Midpoint at 50% of line
              const midX = (startX + endX) / 2;
              const midY = (startY + endY) / 2;
              
              // Control point offset
              const controlOffset = 60;
              
              // S1→S2: offsetFactor = -1 (pull in -perpendicular direction)
              // S2→S1: offsetFactor = 1 (pull in +perpendicular direction)
              const offsetFactor = conn.fromId < conn.toId ? -1 : 1;
              
              const controlX = midX + perpX * controlOffset * offsetFactor;
              const controlY = midY + perpY * controlOffset * offsetFactor;
              
              // Quadratic Bezier curve
              pathD = `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`;
              
              // Label positioning - above or below control point based on direction
              labelX = controlX;
              if (conn.fromId < conn.toId) {
                // S1→S2: label BELOW control point
                labelY = controlY + 20;
              } else {
                // S2→S1: label ABOVE control point
                labelY = controlY - 20;
              }
            } else {
              // Straight line (single direction, no reverse)
              pathD = `M ${startX} ${startY} L ${endX} ${endY}`;
            }
            
            return (
              <g 
                key={conn.id}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setEditingConnection(conn.id);
                  setEditConnectionLabel(conn.label);
                }}
              >
                <path d={pathD} stroke="#7c3aed" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
                <text x={labelX} y={labelY} fontSize="12" fontFamily="Arial, sans-serif" textAnchor="middle" fill="#7c3aed" fontWeight="600" pointerEvents="auto">
                  {conn.label}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Draw elements */}
        {elements.map(el => (
          <div
            key={el.id}
            data-element-id={el.id}
            className={`state-element ${el.type} ${selectedElement === el.id ? 'selected' : ''} ${editingElement === el.id ? 'editing' : ''} ${connectionMode && connectionStart?.elementId === el.id ? 'connection-start' : ''} ${connectionMode && hoveringConnectionElement === el.id ? 'hovering' : ''}`}
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
              <svg viewBox="0 0 100 100" className="circle-state">
                <circle cx="50" cy="50" r="40" fill="#f3e8ff" stroke="#7c3aed" strokeWidth="2" />
                {editingElement === el.id ? (
                  <foreignObject x="15" y="35" width="70" height="30">
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
                      className="svg-inline-edit"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        height: '100%',
                        textAlign: 'center',
                        fontSize: '14px',
                        fontWeight: '600',
                        color: '#5b21b6',
                        border: 'none',
                        background: 'transparent'
                      }}
                    />
                  </foreignObject>
                ) : (
                  <text x="50" y="55" fontSize="14" fontFamily="Arial, sans-serif" textAnchor="middle" fill="#5b21b6" fontWeight="600">
                    {el.name}
                  </text>
                )}
              </svg>
            ) : el.type === 'INITIAL' ? (
              <svg viewBox="0 0 100 100" className="circle-state" onDoubleClick={(e) => handleElementDoubleClick(e, el)}>
                <circle cx="50" cy="50" r="40" fill="#5b21b6" stroke="#7c3aed" strokeWidth="2" />
                {editingElement === el.id ? (
                  <foreignObject x="10" y="30" width="80" height="40">
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
                      className="svg-inline-edit"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        height: '100%',
                        textAlign: 'center',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#ffffff',
                        border: 'none',
                        background: 'transparent'
                      }}
                    />
                  </foreignObject>
                ) : (
                  <text x="50" y="55" fontSize="12" fontFamily="Arial, sans-serif" textAnchor="middle" fill="#ffffff" fontWeight="600">
                    {el.name}
                  </text>
                )}
              </svg>
            ) : el.type === 'FINAL' ? (
              <svg viewBox="0 0 100 100" className="circle-state" onDoubleClick={(e) => handleElementDoubleClick(e, el)}>
                <circle cx="50" cy="50" r="40" fill="none" stroke="#7c3aed" strokeWidth="3" />
                <circle cx="50" cy="50" r="24" fill="#5b21b6" stroke="#7c3aed" strokeWidth="1" />
                {editingElement === el.id ? (
                  <foreignObject x="10" y="30" width="80" height="40">
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
                      className="svg-inline-edit"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        height: '100%',
                        textAlign: 'center',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: '#ffffff',
                        border: 'none',
                        background: 'transparent'
                      }}
                    />
                  </foreignObject>
                ) : (
                  <text x="50" y="55" fontSize="12" fontFamily="Arial, sans-serif" textAnchor="middle" fill="#ffffff" fontWeight="600">
                    {el.name}
                  </text>
                )}
              </svg>
            ) : null}

            {selectedElement === el.id && !connectionMode && (
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

        {/* Edit Connection Label Modal */}
        {editingConnection && (
          <div className="modal-overlay" onClick={() => setEditingConnection(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>Editează eticheta tranzițiilor</h3>
              <input
                type="text"
                value={editConnectionLabel}
                onChange={(e) => setEditConnectionLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveConnectionLabel();
                  if (e.key === 'Escape') setEditingConnection(null);
                }}
                autoFocus
                className="modal-input"
                placeholder="ε"
              />
              <div className="modal-buttons">
                <button className="btn-primary" onClick={handleSaveConnectionLabel}>Salvează</button>
                <button className="btn-secondary" onClick={() => setEditingConnection(null)}>Anulează</button>
                <button className="btn-danger" onClick={() => {
                  handleDeleteConnection(editingConnection);
                }}>Șterge</button>
              </div>
            </div>
          </div>
        )}

        {/* Connection mode indicator */}
        {connectionMode && connectionStart && (
          <div className="connection-indicator">
            <p>Selectează starea de destinație...</p>
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export default StateEditor;
