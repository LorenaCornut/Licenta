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

/**
 * Calculează distanța perpendiculară de la un punct la un segment
 */
function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  
  if (len2 === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  
  return Math.hypot(px - closestX, py - closestY);
}

/**
 * Determină dacă punctul e pe stânga sau dreapta unei linii
 */
function sideOfLine(px, py, x1, y1, x2, y2) {
  const crossProduct = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
  return crossProduct > 0 ? 1 : -1;
}

/**
 * Convertește o listă de puncte în SVG path smooth (Catmull-Rom Bezier)
 */
function pointsToSmoothPath(points) {
  if (points.length < 2) return '';
  
  let d = `M ${points[0].x},${points[0].y}`;
  
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;
    
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  
  return d;
}

/**
 * Evaluează o curbă Bezier pătratică la parametrul t ∈ [0,1]
 */
function evaluateBezier(t, p0, p1, cp1, cp2) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * cp1 + 3 * mt * t * t * cp2 + t * t * t * p1;
}

/**
 * Creează punctele unui triunghi pentru săgeață
 * Vârful e pe marginea nodului, nu în centru
 */
function createArrowhead(arrowX, arrowY, direction, size = 15) {
  const arrowTipX = arrowX;
  const arrowTipY = arrowY;
  
  const arrowLength = 16;
  const arrowBaseX = arrowTipX - direction.x * arrowLength;
  const arrowBaseY = arrowTipY - direction.y * arrowLength;
  
  const perpX = -direction.y;
  const perpY = direction.x;
  
  const p1 = `${arrowTipX},${arrowTipY}`;
  const p2 = `${arrowBaseX - perpX * size},${arrowBaseY - perpY * size}`;
  const p3 = `${arrowBaseX + perpX * size},${arrowBaseY + perpY * size}`;
  
  return `${p1} ${p2} ${p3}`;
}

/**
 * Construiește un path Bezier care evită obstacolele și returnează info pentru săgeață
 */
function buildSmoothedPath(x1, y1, x2, y2, allNodes, excludeIds = [], targetRadius = 40) {
  const margin = 40;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);

  if (dist === 0) return { path: `M ${x1},${y1}`, direction: { x: 1, y: 0 }, arrowPoint: { x: x1, y: y1 } };

  const ux = dx / dist;
  const uy = dy / dist;

  const obstacleNodes = allNodes
    .filter(n => !excludeIds.includes(n.id))
    .map(n => {
      const nodeRadius = (n.width || 100) * 0.45;
      const centerOffset = (n.width || 100) / 2;
      const d = distancePointToSegment(n.x + centerOffset, n.y + centerOffset, x1, y1, x2, y2);
      const side = sideOfLine(n.x + centerOffset, n.y + centerOffset, x1, y1, x2, y2);
      const dx_to_node = (n.x + centerOffset) - x1;
      const dy_to_node = (n.y + centerOffset) - y1;
      const t = (dx_to_node * dx + dy_to_node * dy) / (dist * dist);
      const tClamped = Math.max(0, Math.min(1, t));
      
      return { node: n, d, side, t: tClamped, nodeRadius };
    });

  const controlPoints = [{ x: x1, y: y1 }];
  
  const obstaclesWithOffset = obstacleNodes
    .filter(o => o.d < o.nodeRadius + margin)
    .sort((a, b) => a.t - b.t);
  
  obstaclesWithOffset.forEach(obstacle => {
    const t = obstacle.t;
    const ptOnLine = {
      x: x1 + ux * (dist * t),
      y: y1 + uy * (dist * t)
    };
    
    const offset = obstacle.nodeRadius + margin - obstacle.d;
    const perpX = -uy;
    const perpY = ux;
    
    const adjustedX = ptOnLine.x + perpX * offset * obstacle.side;
    const adjustedY = ptOnLine.y + perpY * offset * obstacle.side;
    
    controlPoints.push({ x: adjustedX, y: adjustedY });
  });

  controlPoints.push({ x: x2, y: y2 });

  // Construiește path smooth cu Catmull-Rom Bezier curves
  const pathD = pointsToSmoothPath(controlPoints);
  
  // Calculez direcția și punctul de săgeată
  let direction = { x: ux, y: uy };
  let arrowPoint = { x: x2 - ux * targetRadius, y: y2 - uy * targetRadius };
  
  // Dacă avem mai mult de 2 puncte de control, calculez direcția din ultimul segment
  if (controlPoints.length >= 2) {
    const lastIdx = controlPoints.length - 1;
    const p1 = controlPoints[lastIdx - 1];
    const p2 = controlPoints[lastIdx];
    
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist > 0) {
      direction = { x: dx / dist, y: dy / dist };
      arrowPoint = { x: p2.x - direction.x * targetRadius, y: p2.y - direction.y * targetRadius };
    }
  }
  
  return { path: pathD, direction, arrowPoint };
}

const StateEditor = () => {
  const navigate = useNavigate();
  const { diagramId } = useParams();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  };
  
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
  const [resizingElement, setResizingElement] = useState(null);
  const [resizeStartSize, setResizeStartSize] = useState({ width: 0, height: 0 });
  const [resizeStartMouse, setResizeStartMouse] = useState({ x: 0, y: 0 });
  const [connectionMode, setConnectionMode] = useState(false);
  const [connectionStart, setConnectionStart] = useState(null);
  const [hoveringConnectionElement, setHoveringConnectionElement] = useState(null);
  const [editingConnection, setEditingConnection] = useState(null);
  const [editConnectionLabel, setEditConnectionLabel] = useState('');
  
  // Save/Load states
  const [currentDiagramId, setCurrentDiagramId] = useState(null);
  const [diagramTitle, setDiagramTitle] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [shouldExitAfterSave, setShouldExitAfterSave] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  
  // Track saved state for change detection
  const [savedElementsState, setSavedElementsState] = useState(null);
  const [savedConnectionsState, setSavedConnectionsState] = useState(null);
  
  // Sidebar toggle states
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(210);
  const splitterRef = useRef(null);
  const connectionClickTimers = useRef(new Map()); // Track click timers for each connection

  // Toggle sidebar on splitter click
  const toggleSidebar = () => {
    if (sidebarExpanded) {
      setSidebarWidth(0);
      setSidebarExpanded(false);
    } else {
      setSidebarWidth(210);
      setSidebarExpanded(true);
    }
  };

  // Load diagram if ID provided
  useEffect(() => {
    if (diagramId && diagramId !== 'new') {
      loadDiagram(diagramId);
    }
  }, [diagramId]);

  // Load diagram from backend
  const loadDiagram = async (id) => {
  try {
    const apiUrl = process.env.REACT_APP_API_URL || '/api';
    // <-- ADAUGAT headers
    const response = await fetch(`${apiUrl}/diagrams/${id}`, {
      headers: getAuthHeaders()
    });
    
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      navigate('/login');
      return;
    }
    
    if (!response.ok) {
      throw new Error(`Failed to load diagram: ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log('Loaded diagram:', data);
    
    setCurrentDiagramId(id);
    if (data.diagram?.title) {
      setDiagramTitle(data.diagram.title);
    }
    
    if (data.elements && Array.isArray(data.elements)) {
      console.log('Setting elements:', data.elements);
      setElements(data.elements);
      setSavedElementsState(JSON.stringify(data.elements));
    }
    
    if (data.connections && Array.isArray(data.connections)) {
      console.log('Setting connections:', data.connections);
      setConnections(data.connections);
      setSavedConnectionsState(JSON.stringify(data.connections));
    }
  } catch (error) {
    console.error('Error loading diagram:', error);
    alert('Eroare la încărcarea diagramei: ' + error.message);
  }
};

  // Check if there are unsaved changes
  const hasUnsavedChanges = () => {
    return JSON.stringify(elements) !== savedElementsState || 
           JSON.stringify(connections) !== savedConnectionsState;
  };

  // Save diagram - show modal first
  const handleSave = () => {
  const userId = localStorage.getItem('userId');
  const token = localStorage.getItem('token'); // <-- ADAUGAT verificare token
  
  if (!userId || userId === 'null' || userId === 'undefined' || !token) { // <-- SCHIMBAT
    alert('Trebuie să te autentifici din nou pentru a salva diagrama!');
    navigate('/login'); // <-- ADAUGAT redirect
    return;
  }
  
  if (elements.length === 0) {
    alert('Nu ai niciuna stare în diagramă. Adaugă cel puțin o stare înainte de a salva!');
    return;
  }
  
  setShowSaveModal(true);
  setSaveError("");
};

  // Confirm save - actually save to database
  const confirmSave = async () => {
  if (!diagramTitle.trim()) {
    setSaveError('Te rog introdu un nume pentru diagramă!');
    return;
  }

  const userId = localStorage.getItem('userId');
  if (!userId || userId === 'null' || userId === 'undefined') {
    setSaveError('Sesiune expirată. Te rog reautentifică-te!');
    return;
  }

  setIsSaving(true);
  setSaveError("");

  try {
    const apiUrl = process.env.REACT_APP_API_URL || '/api';

    const diagramData = {
      elements: elements,
      connections: connections
    };

    // <-- ADAUGAT headers
    const response = await fetch(`${apiUrl}/diagrams/save`, {
      method: 'POST',
      headers: getAuthHeaders(), // <-- SCHIMBAT
      body: JSON.stringify({
        userId: parseInt(userId),
        title: diagramTitle.trim(),
        tipDiagrama: 'AUTOMAT',
        nodes: elements.map(el => ({
          id: el.id,
          label: el.name || '',
          x: el.x || 0,
          y: el.y || 0,
          type: el.type
        })),
        edges: connections.map(conn => ({
          from: conn.fromId,
          to: conn.toId,
          label: conn.label || ''
        })),
        diagramData: diagramData,
        diagramId: currentDiagramId
      })
    });

    if (response.status === 401) {
      setSaveError('Sesiune expirată. Te rog reautentifică-te!');
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      setIsSaving(false);
      setTimeout(() => navigate('/login'), 1500);
      return;
    }

    const data = await response.json();

    if (!response.ok) {
      setSaveError(data.message || 'Eroare la salvarea diagramei!');
      setIsSaving(false);
      return;
    }

    // Success!
    setShowSaveModal(false);
    setIsSaving(false);
    if (data.diagramId && !currentDiagramId) {
      setCurrentDiagramId(data.diagramId);
    }
    setSavedElementsState(JSON.stringify(elements));
    setSavedConnectionsState(JSON.stringify(connections));
    
    setShowSuccessToast(true);
    setTimeout(() => setShowSuccessToast(false), 5000);
    
    if (shouldExitAfterSave) {
      setShouldExitAfterSave(false);
      setTimeout(() => navigate('/dashboard'), 1500);
    }

  } catch (err) {
    setSaveError('Eroare de rețea sau server!');
    setIsSaving(false);
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
  
  // <-- Verifică opțional dacă e autentificat
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Te rugăm să te autentifici înainte de a importa!');
    navigate('/login');
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.elements && Array.isArray(data.elements)) setElements(data.elements);
      if (data.connections && Array.isArray(data.connections)) setConnections(data.connections);
    } catch (err) {
      alert('Fișier invalid!');
    }
  };
  reader.readAsText(file);
};

  // Download as SVG
  const downloadSVG = () => {
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" style="background-color: white;">\n';
    
    // No marker definition needed - we draw arrowheads as polygons

    // Draw connections
    connections.forEach(conn => {
      const fromEl = elements.find(e => e.id === conn.fromId);
      const toEl = elements.find(e => e.id === conn.toId);
      
      if (!fromEl || !toEl) return;

      const fromX = fromEl.x + (fromEl.width || 100) / 2;
      const fromY = fromEl.y + (fromEl.height || 100) / 2;
      const toX = toEl.x + (toEl.width || 100) / 2;
      const toY = toEl.y + (toEl.height || 100) / 2;

      // Self-loop case
      if (fromEl.id === toEl.id) {
        const elementWidth = fromEl.width || 100;
        const elementHeight = fromEl.height || 100;
        const nodeRadius = elementWidth / 2;
        const isBottomLoop = conn.loopDirection === 'bottom';
        const directionMultiplier = isBottomLoop ? -1 : 1;
        
        const startX = fromX + nodeRadius * 0.5;
        const startY = fromY - nodeRadius * 0.5 * directionMultiplier;
        const endX = fromX - nodeRadius * 0.5;
        const endY = fromY - nodeRadius * 0.5 * directionMultiplier;
        
        const controlX1 = fromX + nodeRadius + 30;
        const controlY1 = fromY - nodeRadius * directionMultiplier - 40 * directionMultiplier;
        const controlX2 = fromX - nodeRadius - 30;
        const controlY2 = fromY - nodeRadius * directionMultiplier - 40 * directionMultiplier;
        
        const textCenterX = fromX;
        const textCenterY = fromY - nodeRadius * directionMultiplier - 50 * directionMultiplier;
        
        svg += `<path d='M ${startX} ${startY} C ${controlX1} ${controlY1} ${controlX2} ${controlY2} ${endX} ${endY}' stroke='#7c3aed' stroke-width='2' fill='none'/>\n`;
        
        // Arrowhead on loop end
        const arrowDirX = -nodeRadius * 0.5;
        const arrowDirLen = Math.hypot(arrowDirX, -nodeRadius * 0.5 * directionMultiplier);
        const arrowDirXNorm = arrowDirX / arrowDirLen;
        const arrowDirYNorm = (-nodeRadius * 0.5 * directionMultiplier) / arrowDirLen;
        
        const arrowLength = 16;
        const arrowBaseX = endX - arrowDirXNorm * arrowLength;
        const arrowBaseY = endY - arrowDirYNorm * arrowLength;
        const perpX = -arrowDirYNorm;
        const perpY = arrowDirXNorm;
        const arrowSize = 13;
        
        const p1 = `${endX},${endY}`;
        const p2 = `${arrowBaseX - perpX * arrowSize},${arrowBaseY - perpY * arrowSize}`;
        const p3 = `${arrowBaseX + perpX * arrowSize},${arrowBaseY + perpY * arrowSize}`;
        
        svg += `<polygon points='${p1} ${p2} ${p3}' fill='#7c3aed' stroke='#6d28d9' stroke-width='0.5'/>\n`;
        
        if (conn.label) {
          svg += `<text x='${textCenterX}' y='${textCenterY}' font-size='12' font-family='Arial, sans-serif' text-anchor='middle' fill='#7c3aed' font-weight='600'>${escapeXML(conn.label)}</text>\n`;
        }
      } else {
        // Normal connection - use smoothed path
        const result = buildSmoothedPath(
          fromX, fromY, toX, toY,
          elements,
          [conn.fromId, conn.toId],
          (toEl.width || 100) * 0.4
        );
        
        const pathD = result.path;
        const direction = result.direction;
        const arrowPoint = result.arrowPoint;
        
        svg += `<path d='${pathD}' stroke='#7c3aed' stroke-width='2' fill='none'/>\n`;
        
        // Arrowhead polygon on contour
        const arrowLength = 16;
        const arrowBaseX = arrowPoint.x - direction.x * arrowLength;
        const arrowBaseY = arrowPoint.y - direction.y * arrowLength;
        const perpX = -direction.y;
        const perpY = direction.x;
        const arrowSize = 13;
        
        const p1 = `${arrowPoint.x},${arrowPoint.y}`;
        const p2 = `${arrowBaseX - perpX * arrowSize},${arrowBaseY - perpY * arrowSize}`;
        const p3 = `${arrowBaseX + perpX * arrowSize},${arrowBaseY + perpY * arrowSize}`;
        
        svg += `<polygon points='${p1} ${p2} ${p3}' fill='#7c3aed' stroke='#6d28d9' stroke-width='0.5'/>\n`;
        
        // Label positioning
        const labelX = (fromX + toX) / 2;
        const labelY = (fromY + toY) / 2 - 15;
        
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
            type: 'TRANSITION',
            loopDirection: 'top'
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

  // Handle element resize drag
  const handleResizeMouseDown = (e, el) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingElement(el.id);
    setResizeStartSize({
      width: el.width || 100,
      height: el.height || 100
    });
    setResizeStartMouse({
      x: e.clientX,
      y: e.clientY
    });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!resizingElement) return;
      
      const deltaX = e.clientX - resizeStartMouse.x;
      const deltaY = e.clientY - resizeStartMouse.y;
      
      const newWidth = Math.max(50, resizeStartSize.width + deltaX);
      const newHeight = Math.max(50, resizeStartSize.height + deltaY);
      const size = Math.max(newWidth, newHeight);
      
      const currentEl = elements.find(el => el.id === resizingElement);
      if (!currentEl) return;
      
      if (hasCollisionWithOthers(resizingElement, currentEl.x, currentEl.y, size, size)) {
        return;
      }
      
      setElements(prevElements => prevElements.map(el =>
        el.id === resizingElement ? { ...el, width: size, height: size } : el
      ));
    };

    const handleMouseUp = () => {
      setResizingElement(null);
    };

    if (resizingElement) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingElement, resizeStartSize, resizeStartMouse, elements]);

  return (
    <div className="state-editor-container">
      {/* Header */}
      <div className="state-editor-header">
        <button className="btn-back" onClick={() => {
          if (hasUnsavedChanges()) {
            setShowExitModal(true);
          } else {
            navigate('/dashboard');
          }
        }}>
          ← Înapoi
        </button>
        <h1>{currentDiagramId ? `Automat: ${diagramTitle}` : 'Automat State Diagram Editor'}</h1>
        <div className="header-actions">
          <button className="btn-primary" onClick={handleSave}>Salvează</button>
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
      <div className="state-editor-sidebar" style={{ width: `${sidebarWidth}px` }}>
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

      <div className="sidebar-splitter" ref={splitterRef} onClick={toggleSidebar} title={sidebarExpanded ? 'Ascunde panou' : 'Afișează panou'} />

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
              const nodeRadius = elementWidth / 2;
              const isBottomLoop = conn.loopDirection === 'bottom';
              const directionMultiplier = isBottomLoop ? -1 : 1;
              
              // Start and end points on the node's edge
              const startX = fromX + nodeRadius * 0.5;
              const startY = fromY - nodeRadius * 0.5 * directionMultiplier;
              const endX = fromX - nodeRadius * 0.5;
              const endY = fromY - nodeRadius * 0.5 * directionMultiplier;
              
              // Control points for a nice arc (above or below the node)
              const controlX1 = fromX + nodeRadius + 30;
              const controlY1 = fromY - nodeRadius * directionMultiplier - 40 * directionMultiplier;
              const controlX2 = fromX - nodeRadius - 30;
              const controlY2 = fromY - nodeRadius * directionMultiplier - 40 * directionMultiplier;
              
              const textCenterX = fromX;
              const textCenterY = fromY - nodeRadius * directionMultiplier - 50 * directionMultiplier;
              
              return (
                <g 
                  key={conn.id}
                  style={{ cursor: 'pointer' }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    // Clear any pending click timer
                    if (connectionClickTimers.current.has(conn.id)) {
                      clearTimeout(connectionClickTimers.current.get(conn.id));
                      connectionClickTimers.current.delete(conn.id);
                    }
                    
                    // Toggle loop direction on double-click
                    const updatedConnections = connections.map(c => 
                      c.id === conn.id 
                        ? { ...c, loopDirection: c.loopDirection === 'bottom' ? 'top' : 'bottom' }
                        : c
                    );
                    setConnections(updatedConnections);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    
                    // Clear any existing timer for this connection
                    if (connectionClickTimers.current.has(conn.id)) {
                      clearTimeout(connectionClickTimers.current.get(conn.id));
                    }
                    
                    // Set a new timer for delayed single click
                    const timer = setTimeout(() => {
                      setEditingConnection(conn.id);
                      setEditConnectionLabel(conn.label);
                      connectionClickTimers.current.delete(conn.id);
                    }, 250);
                    
                    connectionClickTimers.current.set(conn.id, timer);
                  }}
                >
                  {/* Invisible thick path for easier clicking */}
                  <path
                    d={`M ${startX} ${startY} C ${controlX1} ${controlY1} ${controlX2} ${controlY2} ${endX} ${endY}`}
                    stroke="transparent"
                    strokeWidth="15"
                    fill="none"
                    pointerEvents="auto"
                    style={{ cursor: 'pointer' }}
                  />
                  {/* Visible path */}
                  <path
                    d={`M ${startX} ${startY} C ${controlX1} ${controlY1} ${controlX2} ${controlY2} ${endX} ${endY}`}
                    stroke="#7c3aed"
                    strokeWidth="2"
                    fill="none"
                    markerEnd="url(#arrowhead)"
                    pointerEvents="auto"
                    style={{ cursor: 'pointer' }}
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

            // Normal connection - use smoothed path to avoid obstacles
            const result = buildSmoothedPath(
              fromX, fromY, toX, toY, 
              elements, 
              [conn.fromId, conn.toId],  // Exclude both connected nodes
              (toEl.width || 100) * 0.4  // target radius for STATE circles
            );
            
            const pathD = result.path;
            const direction = result.direction;
            const arrowPoint = result.arrowPoint;
            
            // Calculate label position - center of path
            const labelX = (fromX + toX) / 2;
            const labelY = (fromY + toY) / 2 - 15;
            
            // Create arrowhead polygon
            const arrowPoints = createArrowhead(arrowPoint.x, arrowPoint.y, direction, 13);
            
            return (
              <g 
                key={conn.id}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setEditingConnection(conn.id);
                  setEditConnectionLabel(conn.label);
                }}
              >
                {/* Invisible thick path for easier clicking */}
                <path d={pathD} stroke="transparent" strokeWidth="15" fill="none" pointerEvents="auto" />
                {/* Visible path */}
                <path d={pathD} stroke="#7c3aed" strokeWidth="2" fill="none" pointerEvents="auto" />
                {/* Arrowhead on contour */}
                <polygon points={arrowPoints} fill="#7c3aed" stroke="#6d28d9" strokeWidth="0.5" pointerEvents="auto" style={{ cursor: 'pointer' }} />
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
              <>
                <button
                  className="element-delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteElement(el.id);
                  }}
                >
                  ✕
                </button>
                <div
                  className="element-resize-handle"
                  onMouseDown={(e) => handleResizeMouseDown(e, el)}
                />
              </>
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

      {/* Modal salvare cu nume */}
      {showSaveModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => setShowSaveModal(false)}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: '32px 40px',
            minWidth: 350,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}
          onClick={(e) => e.stopPropagation()}>
            <h3 style={{ 
              margin: '0 0 20px 0', 
              color: '#5b21b6',
              fontSize: '1.4rem'
            }}>Salvează diagrama</h3>
            
            <label style={{ 
              display: 'block', 
              marginBottom: 8, 
              fontWeight: 600,
              color: '#3c1a6e'
            }}>
              Nume diagramă:
            </label>
            <input
              type="text"
              value={diagramTitle}
              onChange={(e) => setDiagramTitle(e.target.value)}
              placeholder="Ex: Automatul meu"
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 8,
                border: '1px solid #d1c4e9',
                fontSize: '1rem',
                marginBottom: 16,
                boxSizing: 'border-box'
              }}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmSave();
                if (e.key === 'Escape') setShowSaveModal(false);
              }}
            />
            
            {saveError && (
              <div style={{ 
                color: '#b91c1c', 
                marginBottom: 16,
                fontSize: '0.95rem'
              }}>
                {saveError}
              </div>
            )}
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveError("");
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid #d1c4e9',
                  background: '#fff',
                  color: '#5b21b6',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Anulează
              </button>
              <button
                onClick={confirmSave}
                disabled={isSaving}
                style={{
                  padding: '10px 24px',
                  borderRadius: 8,
                  border: 'none',
                  background: isSaving ? '#c4b5fd' : '#7c3aed',
                  color: '#fff',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontWeight: 600
                }}
              >
                {isSaving ? 'Se salvează...' : 'Salvează'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmare ieșire */}
      {showExitModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
        onClick={() => setShowExitModal(false)}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: '40px',
            minWidth: 350,
            boxShadow: '0 8px 32px rgba(0,0,0,0.2)'
          }}
          onClick={(e) => e.stopPropagation()}>
            <svg
              width="48"
              height="48"
              viewBox="0 0 48 48"
              fill="none"
              style={{ marginBottom: 16 }}
            >
              <path d="M24 14v12" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="24" cy="32" r="2" fill="#f59e0b"/>
            </svg>
            <h3 style={{ 
              margin: '0 0 12px 0', 
              color: '#5b21b6',
              fontSize: '1.4rem'
            }}>Doriți să salvați modificările?</h3>
            <p style={{ 
              color: '#6b7280', 
              marginBottom: 24,
              fontSize: '1rem'
            }}>Ai modificări nesalvate. Ce dorești să faci?</p>
            
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                onClick={() => {
                  setShowExitModal(false);
                  navigate('/dashboard');
                }}
                style={{
                  padding: '12px 24px',
                  borderRadius: 8,
                  border: '1px solid #d1c4e9',
                  background: '#fff',
                  color: '#6b7280',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '1rem'
                }}
              >
                Nu salva
              </button>
              <button
                onClick={() => {
                  setShowExitModal(false);
                  setShouldExitAfterSave(true);
                  handleSave();
                }}
                style={{
                  padding: '12px 28px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#7c3aed',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '1rem'
                }}
              >
                Salvează
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notificare salvare cu succes */}
      {showSuccessToast && (
        <div style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#10b981',
          color: '#fff',
          padding: '20px 32px',
          borderRadius: 12,
          boxShadow: '0 4px 16px rgba(16,185,129,0.3)',
          zIndex: 1001,
          fontSize: '1.1rem',
          fontWeight: 600,
          animation: 'fadeInOut 5s ease-in-out forwards'
        }}>
          ✓ Diagrama a fost salvată cu succes!
        </div>
      )}
    </div>
  );
};

export default StateEditor;