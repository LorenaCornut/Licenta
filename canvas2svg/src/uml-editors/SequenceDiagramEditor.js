import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../UMLEditor.css';
import './SequenceDiagramEditor.css';

// ============ HELPER FUNCTIONS ============

function waypointsToPath(points) {
  if (points.length === 0) return '';
  let d = `M ${Math.round(points[0].x)},${Math.round(points[0].y)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${Math.round(points[i].x)},${Math.round(points[i].y)}`;
  }
  return d;
}

function lineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const ccw = (ax, ay, bx, by, cx, cy) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  return ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
         ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4);
}

function lineIntersectsRect(x1, y1, x2, y2, rect) {
  const left = rect.x - 10;
  const right = rect.x + rect.width + 10;
  const top = rect.y - 10;
  const bottom = rect.y + rect.height + 10;
  const p1Inside = x1 >= left && x1 <= right && y1 >= top && y1 <= bottom;
  const p2Inside = x2 >= left && x2 <= right && y2 >= top && y2 <= bottom;
  if (p1Inside || p2Inside) return true;
  if (lineSegmentsIntersect(x1, y1, x2, y2, left, top, right, top)) return true;
  if (lineSegmentsIntersect(x1, y1, x2, y2, left, bottom, right, bottom)) return true;
  if (lineSegmentsIntersect(x1, y1, x2, y2, left, top, left, bottom)) return true;
  if (lineSegmentsIntersect(x1, y1, x2, y2, right, top, right, bottom)) return true;
  return false;
}

function detectConnectionPointOnContour(e, element) {
  const canvas = document.querySelector('.uml-canvas');
  if (!canvas) return { x: element.x, y: element.y, point: 'top' };
  
  const canvasRect = canvas.getBoundingClientRect();
  const elementDOM = e.currentTarget;
  const elementRect = elementDOM.getBoundingClientRect();
  
  const clickCanvasX = e.clientX - canvasRect.left;
  const clickCanvasY = e.clientY - canvasRect.top;
  const elCanvasX = elementRect.left - canvasRect.left;
  const elCanvasY = elementRect.top - canvasRect.top;
  const elWidth = elementRect.width;
  const elHeight = elementRect.height;
  
  const distTop = Math.abs(clickCanvasY - elCanvasY);
  const distBottom = Math.abs(clickCanvasY - (elCanvasY + elHeight));
  const distLeft = Math.abs(clickCanvasX - elCanvasX);
  const distRight = Math.abs(clickCanvasX - (elCanvasX + elWidth));
  
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);
  
  let pointX, pointY, edgeType;
  
  if (minDist === distTop) {
    pointX = Math.max(elCanvasX, Math.min(clickCanvasX, elCanvasX + elWidth));
    pointY = elCanvasY;
    edgeType = 'top';
  } else if (minDist === distBottom) {
    pointX = Math.max(elCanvasX, Math.min(clickCanvasX, elCanvasX + elWidth));
    pointY = elCanvasY + elHeight;
    edgeType = 'bottom';
  } else if (minDist === distLeft) {
    pointX = elCanvasX;
    pointY = Math.max(elCanvasY, Math.min(clickCanvasY, elCanvasY + elHeight));
    edgeType = 'left';
  } else {
    pointX = elCanvasX + elWidth;
    pointY = Math.max(elCanvasY, Math.min(clickCanvasY, elCanvasY + elHeight));
    edgeType = 'right';
  }
  
  return { x: pointX, y: pointY, point: edgeType };
}

// ============ END HELPER FUNCTIONS ============

// Element types for Sequence Diagram
const SEQUENCE_ELEMENTS = {
  ACTOR: { label: 'Actor', icon: '🧑', isNode: true },
  OBJECT: { label: 'Object', icon: '■', isNode: true },
  ENTITY: { label: 'Entity', icon: 'E', isNode: true },
  BOUNDARY: { label: 'Boundary', icon: '◯', isNode: true },
  CONTROL: { label: 'Control', icon: '↻', isNode: true },
  ACTIVATION: { label: 'Activation', icon: '▮', isNode: true },
  DESTROY: { label: 'Destroy', icon: '✕', isNode: true },
  ALT: { label: 'Alt', icon: 'alt', isNode: true },
  LOOP: { label: 'Loop', icon: 'loop', isNode: true },
  OPT: { label: 'Opt', icon: 'opt', isNode: true },
  PAR: { label: 'Par', icon: 'par', isNode: true },
  REF: { label: 'Ref', icon: 'ref', isNode: true },
  SYNC_MESSAGE: { label: 'Sync Message', icon: '→', isConnection: true },
  ASYNC_MESSAGE: { label: 'Async Message', icon: '⇢', isConnection: true },
  RETURN_MESSAGE: { label: 'Return', icon: '⇠', isConnection: true },
  SELF_MESSAGE: { label: 'Self Message', icon: '↻', isConnection: true },
  CREATE_MESSAGE: { label: 'Create', icon: '⊕', isConnection: true },
  DELETE_MESSAGE: { label: 'Delete', icon: '✕', isConnection: true }
};

function SequenceDiagramEditor() {
  const navigate = useNavigate();
  const { diagramId } = useParams();
  const canvasRef = useRef(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  };
  
  const [title, setTitle] = useState('Sequence Diagram');
  const [currentDiagramId, setCurrentDiagramId] = useState(null);
  const [elements, setElements] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedElement, setSelectedElement] = useState(null);
  const [editingElement, setEditingElement] = useState(null);
  const [editName, setEditName] = useState('');
  const [connectionMode, setConnectionMode] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [hoveringConnectionElement, setHoveringConnectionElement] = useState(null);
  const [draggingElement, setDraggingElement] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedType, setDraggedType] = useState(null);
  const [draggingInCanvas, setDraggingInCanvas] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [draggingEndpoint, setDraggingEndpoint] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const endpointDragRef = useRef(null);

  useEffect(() => {
    if (diagramId && diagramId !== 'new') {
      loadDiagram(diagramId);
    } else {
      setCurrentDiagramId(null);
      setTitle('Sequence Diagram');
      setElements([]);
      setConnections([]);
      setSelectedElement(null);
      setSelectedConnection(null);
      sessionStorage.removeItem('currentDiagramId');
    }
  }, [diagramId]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingElement || !canvasRef.current) return;
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const newX = Math.max(0, e.clientX - canvasRect.left - dragOffset.x);
      const newY = Math.max(0, e.clientY - canvasRect.top - dragOffset.y);
      
      setElements(elements.map(el => 
        el.id === draggingElement ? { ...el, x: newX, y: newY } : el
      ));
    };

    const handleMouseUp = () => setDraggingElement(null);

    if (draggingElement) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingElement, dragOffset, elements]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && connectionMode) {
        setConnectionMode(null);
        setConnectionStart(null);
        setHoveringConnectionElement(null);
      }
      if (e.key === 'Escape' && exportDropdownOpen) {
        setExportDropdownOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [connectionMode, exportDropdownOpen]);

  useEffect(() => {
    if (!draggingEndpoint || !endpointDragRef.current) return;

    const handleMouseMove = (e) => {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const currentMouseY = e.clientY - canvasRect.top;
      const ref = endpointDragRef.current;
      const conn = connections.find(c => c.id === ref.connectionId);

      if (!conn) return;

      const deltaY = currentMouseY - ref.startMouseY;
      const newFromY = ref.initialFromY + deltaY;
      const newToY = ref.initialToY + deltaY;

      setConnections(connections.map(c =>
        c.id === ref.connectionId
          ? {
              ...c,
              fromPoint: { ...c.fromPoint, y: newFromY },
              toPoint: { ...c.toPoint, y: newToY }
            }
          : c
      ));
    };

    const handleMouseUp = () => {
      setDraggingEndpoint(null);
      endpointDragRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingEndpoint, connections]);

  useEffect(() => {
    const handleResizeMove = (e) => {
      if (!resizing) return;
      
      const { elementId, direction, startX, startY, startWidth, startHeight, startElX, startElY } = resizing;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startElX;
      let newY = startElY;
      
      const currentEl = elements.find(el => el.id === elementId);
      const minWidth = (currentEl && currentEl.type === 'ACTIVATION') ? 8 : 80;
      const minHeight = 60;
      
      if (direction.includes('e')) {
        newWidth = Math.max(minWidth, startWidth + deltaX);
      }
      if (direction.includes('w')) {
        const potentialWidth = startWidth - deltaX;
        if (potentialWidth >= minWidth) {
          newWidth = potentialWidth;
          newX = startElX + deltaX;
        }
      }
      if (direction.includes('s')) {
        newHeight = Math.max(minHeight, startHeight + deltaY);
      }
      if (direction.includes('n')) {
        const potentialHeight = startHeight - deltaY;
        if (potentialHeight >= minHeight) {
          newHeight = potentialHeight;
          newY = startElY + deltaY;
        }
      }
      
      setElements(elements.map(el => 
        el.id === elementId 
          ? { ...el, width: newWidth, height: newHeight, x: Math.max(0, newX), y: Math.max(0, newY) }
          : el
      ));
    };

    const handleResizeUp = () => {
      setResizing(null);
    };

    if (resizing) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeUp);
    };
  }, [resizing, elements]);

  const loadDiagram = async (id) => {
  setIsLoading(true);
  try {
    const apiUrl = process.env.REACT_APP_API_URL || '/api';
    // <-- ADAUGAT headers
    const response = await fetch(`${apiUrl}/class-diagrams/${id}`, {
      headers: getAuthHeaders()
    });
    
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      navigate('/login');
      return;
    }
    
    const result = await response.json();
    if (result.diagram?.data) {
      setTitle(result.diagram.title || 'Sequence Diagram');
      setElements(result.diagram.data.elements || []);
      setConnections(result.diagram.data.connections || []);
      setCurrentDiagramId(id);
      sessionStorage.setItem('currentDiagramId', id);
    }
  } catch (error) {
    console.error('Error loading:', error);
  } finally {
    setIsLoading(false);
  }
};

  const handleSaveName = () => {
    if (editingElement) {
      setElements(elements.map(el => el.id === editingElement ? { ...el, name: editName } : el));
      setEditingElement(null);
    }
  };

  const handleElementClick = (e, el) => {
    e.stopPropagation();
    
    // Handle connection mode
    if (connectionMode) {
      const clickedPoint = detectConnectionPointOnContour(e, el);
      
      if (!connectionStart) {
        // Start connection
        setConnectionStart({ elementId: el.id, point: clickedPoint });
      } else if (connectionStart.elementId !== el.id) {
        // Complete connection to different element
        const newConnection = {
          id: Date.now(),
          type: connectionMode,
          from: connectionStart.elementId,
          fromPoint: connectionStart.point,
          to: el.id,
          toPoint: clickedPoint,
          label: SEQUENCE_ELEMENTS[connectionMode]?.label || 'Connection',
          waypoints: []
        };
        
        setConnections([...connections, newConnection]);
        setConnectionMode(null);
        setConnectionStart(null);
        setHoveringConnectionElement(null);
      } else {
        // Same element
        if (connectionMode === 'SELF_MESSAGE') {
          // Create self-message loop
          const newConnection = {
            id: Date.now(),
            type: connectionMode,
            from: el.id,
            fromPoint: clickedPoint,
            to: el.id,
            toPoint: clickedPoint,
            label: SEQUENCE_ELEMENTS[connectionMode]?.label || 'Self Message',
            side: 'right',
            waypoints: []
          };
          
          setConnections([...connections, newConnection]);
          setConnectionMode(null);
          setConnectionStart(null);
          setHoveringConnectionElement(null);
        } else {
          // Cancel connection for other types
          setConnectionStart(null);
        }
      }
      return;
    }
    
    // Normal element selection
    setSelectedElement(el.id);
    setEditName(el.name);
  };

  const handleElementDoubleClick = (e, el) => {
    e.stopPropagation();
    setEditingElement(el.id);
    setEditName(el.name);
  };

  const handleElementMouseDown = (e, el) => {
    if (connectionMode || editingElement === el.id || resizing) return;
    e.preventDefault();
    setDraggingElement(el.id);
    setSelectedElement(el.id);
    const canvasRect = canvasRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - canvasRect.left - el.x,
      y: e.clientY - canvasRect.top - el.y
    });
  };

  const handleCanvasClick = () => {
    setSelectedElement(null);
  };

  const handleDeleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    setConnections(connections.filter(c => c.from !== id && c.to !== id));
    setSelectedElement(null);
  };

  const handleDragStart = (e, elementType) => {
    setDraggedType(elementType);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleCanvasDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDraggingInCanvas(true);
  };

  const handleCanvasDragLeave = () => {
    setDraggingInCanvas(false);
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    setDraggingInCanvas(false);

    if (!draggedType || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const width = 120;
    const height = 100;
    const x = Math.max(0, e.clientX - canvasRect.left - width / 2);
    const y = Math.max(0, e.clientY - canvasRect.top - height / 2);

    const newId = `${draggedType}-${Date.now()}`;
    const newElement = {
      id: newId,
      type: draggedType,
      name: draggedType,
      x, y, width, height
    };

    setElements([...elements, newElement]);
    setDraggedType(null);
  };

  const handleSaveToDatabase = async () => {
  // <-- ADAUGAT: Verifică token-ul
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Trebuie să fii autentificat pentru a salva diagrama!');
    navigate('/login');
    return;
  }
  
  const activeDiagramId = currentDiagramId || sessionStorage.getItem('currentDiagramId');
  const diagramTitle = activeDiagramId
    ? title
    : prompt('Introdu numele diagramei:', title || 'Sequence Diagram');

  if (!diagramTitle) return;

  try {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      alert('Trebuie să fii logat pentru a salva diagrama!');
      navigate('/login');
      return;
    }

    const diagramData = {
      diagram: {
        selectedType: 'SEQUENCE',
        elements: elements,
        connections: connections
      }
    };

    const apiUrl = process.env.REACT_APP_API_URL || '/api';
    let response, result;

    if (activeDiagramId) {
      // UPDATE existing diagram
      response = await fetch(`${apiUrl}/class-diagrams/${activeDiagramId}`, {
        method: 'PUT',
        headers: getAuthHeaders(),  // <-- SCHIMBAT
        body: JSON.stringify(diagramData)
      });
      
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        alert('Sesiune expirată. Te rugăm să te autentifici din nou.');
        navigate('/login');
        return;
      }
      
      result = await response.json();

      if (response.ok) {
        alert(`Diagrama "${diagramTitle}" a fost actualizată cu succes!`);
        setTitle(diagramTitle);
      }
    } else {
      // CREATE new diagram
      const newDiagramData = {
        title: diagramTitle,
        userId: parseInt(userId),
        ...diagramData
      };

      response = await fetch(`${apiUrl}/class-diagrams`, {
        method: 'POST',
        headers: getAuthHeaders(),  // <-- SCHIMBAT
        body: JSON.stringify(newDiagramData)
      });
      
      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        alert('Sesiune expirată. Te rugăm să te autentifici din nou.');
        navigate('/login');
        return;
      }
      
      result = await response.json();

      if (response.ok) {
        alert(`Diagrama "${diagramTitle}" a fost salvată cu succes! ID: ${result.diagramId}`);
        setCurrentDiagramId(result.diagramId);
        sessionStorage.setItem('currentDiagramId', result.diagramId);
        setTitle(diagramTitle);
      }
    }

    if (!response.ok) {
      alert(`Eroare: ${result.error}`);
    }
  } catch (error) {
    console.error('Error saving to database:', error);
    alert(`Eroare la salvare: ${error.message}`);
  }
};

  const handleImport = () => {
  // <-- Verifică token-ul
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Trebuie să fii autentificat pentru a importa o diagramă!');
    navigate('/login');
    return;
  }
  
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,.svg';
  fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const content = await file.text();
      
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(content);
        if (data.elements && data.connections) {
          setElements(data.elements);
          setConnections(data.connections);
          setTitle(data.title || 'Imported Diagram');
          setCurrentDiagramId(null);
          sessionStorage.removeItem('currentDiagramId');
          setSelectedElement(null);
          setSelectedConnection(null);
          alert('✅ Diagram imported successfully!');
        } else {
          alert('❌ Invalid JSON format. Missing elements or connections.');
        }
      } else if (file.name.endsWith('.svg')) {
        alert('⚠️ SVG import not yet supported. Please use JSON format.');
      }
    } catch (error) {
      console.error('Error importing file:', error);
      alert(`❌ Error importing file: ${error.message}`);
    }
  };
  fileInput.click();
};

  const generateFullSVG = () => {
    const padding = 60;
    const allX = elements.map(el => [el.x, el.x + (el.width || 120)]).flat();
    const allY = elements.map(el => [el.y, el.y + (el.height || 100)]).flat();
    
    // Calculate all Y coordinates including lifelines and messages
    let allYLifelines = [...allY];
    connections.forEach(conn => {
      if (conn.fromPoint?.y) allYLifelines.push(conn.fromPoint.y);
      if (conn.toPoint?.y) allYLifelines.push(conn.toPoint.y);
    });
    
    const minX = Math.min(...allX, 0) - padding;
    const minY = Math.min(...allY, 0) - padding;
    const maxX = Math.max(...allX, 800) + padding;
    const maxY = Math.max(...allYLifelines, 1000) + padding;
    const width = maxX - minX;
    const height = maxY - minY;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='${minX} ${minY} ${width} ${height}'>\n`;
    svg += `<style>
      .actor-text { font-family: monospace; font-size: 13px; text-anchor: middle; font-weight: bold; }
      .frame-label { font-family: monospace; font-size: 11px; font-weight: bold; fill: #a78bfa; }
      .activation-bar { fill: #bae6fd; stroke: #0284c7; stroke-width: 1.5; }
    </style>
    <defs>
      <marker id='arrowSyncMessage' markerWidth='14' markerHeight='14' refX='12' refY='7' orient='auto'>
        <path d='M 0 0 L 14 7 L 0 14 Z' fill='#333' stroke='none'/>
      </marker>
      <marker id='arrowAsyncMessage' markerWidth='14' markerHeight='14' refX='13' refY='7' orient='auto'>
        <path d='M 0 0 L 14 7 L 0 14' fill='none' stroke='#333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>
      </marker>
      <marker id='arrowReturnMessage' markerWidth='14' markerHeight='14' refX='13' refY='7' orient='auto'>
        <path d='M 0 0 L 14 7 L 0 14' fill='none' stroke='#333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>
      </marker>
    </defs>\n`;

    // LAYER 1: Desenează frames (background)
    elements.forEach((el) => {
      const isFrame = ['ALT', 'LOOP', 'OPT', 'PAR', 'REF'].includes(el.type);
      if (!isFrame) return;
      
      svg += `<rect x='${el.x}' y='${el.y}' width='${el.width}' height='${el.height}' fill='none' stroke='#a78bfa' stroke-width='2' stroke-dasharray='none' />\n`;
      svg += `<text x='${el.x + 6}' y='${el.y + 14}' class='frame-label'>${el.type}</text>\n`;
    });

    // LAYER 2: Desenează lifelines
    elements.forEach((el) => {
      const isSequenceParticipant = ['ACTOR', 'OBJECT', 'BOUNDARY', 'CONTROL', 'ENTITY'].includes(el.type);
      if (!isSequenceParticipant) return;

      const lifelineX = el.x + el.width / 2;
      const lifelineStartY = el.y + el.height;
      const lifelineEndY = maxY - padding + 10;

      svg += `<line x1='${lifelineX}' y1='${lifelineStartY}' x2='${lifelineX}' y2='${lifelineEndY}' stroke='#999' stroke-width='1' stroke-dasharray='4,4' />\n`;
    });

    // LAYER 3: Desenează conexiuni (messages) - TREBUIE INAINTEA ACTIVATION BARS
    connections.forEach((conn) => {
      const fromEl = elements.find(e => e.id === conn.from);
      const toEl = elements.find(e => e.id === conn.to);
      if (!fromEl || !toEl) return;

      const startX = fromEl.x + fromEl.width / 2;
      const endX = toEl.x + toEl.width / 2;
      let startY = conn.fromPoint?.y !== undefined ? conn.fromPoint.y : fromEl.y + fromEl.height;
      
      // Pentru self-message, endY trebuie să fie mai jos pentru a vedea buclă
      let endY;
      if (conn.type === 'SELF_MESSAGE' && conn.from === conn.to) {
        // Self-message: endY = toPoint sau startY + 50 (pentru buclă)
        endY = conn.toPoint?.y || (startY + 50);
      } else {
        endY = conn.toPoint?.y !== undefined ? conn.toPoint.y : startY + 50;
      }

      let marker = "url(#arrowSyncMessage)";
      let strokeDasharray = "none";
      let strokeWidth = "2";

      if (conn.type === 'ASYNC_MESSAGE' || conn.type === 'CREATE_MESSAGE') marker = "url(#arrowAsyncMessage)";
      else if (conn.type === 'RETURN_MESSAGE') { strokeDasharray = "6,6"; marker = "url(#arrowReturnMessage)"; }

      if (conn.type === 'SELF_MESSAGE' && conn.from === conn.to) {
        // Self-message: buclă în U - desenează buclă compactă pe stânga
        const offset = 30;
        const side = conn.side || 'left';
        // Buclă de 50px înălțime
        const loopHeight = 50;
        let path;
        if (side === 'left') {
          path = `M ${startX} ${startY} L ${startX - offset} ${startY} L ${startX - offset} ${startY + loopHeight} L ${startX} ${startY + loopHeight}`;
        } else {
          path = `M ${startX} ${startY} L ${startX + offset} ${startY} L ${startX + offset} ${startY + loopHeight} L ${startX} ${startY + loopHeight}`;
        }
        svg += `<path d='${path}' fill='none' stroke='#333' stroke-width='${strokeWidth}' marker-end='${marker}' stroke-dasharray='${strokeDasharray}' stroke-linecap='round' stroke-linejoin='round' />\n`;
      } else if (conn.type !== 'DELETE_MESSAGE') {
        // Normal message
        svg += `<line x1='${startX}' y1='${startY}' x2='${endX}' y2='${endY}' stroke='#333' stroke-width='${strokeWidth}' marker-end='${marker}' stroke-dasharray='${strokeDasharray}' stroke-linecap='round' stroke-linejoin='round' />\n`;
      }
    });

    // LAYER 4: Desenează activation bars - DOAR pe self-messages
    connections.forEach((conn) => {
      const fromEl = elements.find(e => e.id === conn.from);
      if (!fromEl) return;
      
      // Activation bars DOAR pe self-messages
      if (conn.type === 'SELF_MESSAGE' && conn.from === conn.to) {
        const startY = conn.fromPoint?.y || fromEl.y + fromEl.height;
        const barX = fromEl.x + fromEl.width / 2 - 6;
        const barWidth = 12;
        const barHeight = 50;
        svg += `<rect x='${barX}' y='${startY}' width='${barWidth}' height='${barHeight}' fill='#bae6fd' stroke='#0284c7' stroke-width='2' />\n`;
      }
    });

    // LAYER 5: Desenează elemente - cu SVG-uri exact din editor
    elements.forEach((el) => {
      const isActor = el.type === 'ACTOR';
      const isObject = el.type === 'OBJECT';
      const isBoundary = el.type === 'BOUNDARY';
      const isControl = el.type === 'CONTROL';
      const isEntity = el.type === 'ENTITY';
      const isSequenceParticipant = ['ACTOR', 'OBJECT', 'BOUNDARY', 'CONTROL', 'ENTITY'].includes(el.type);
      
      if (!isSequenceParticipant) return;

      const centerX = el.x + el.width / 2;
      const iconTop = el.y + 6;
      const textTop = el.y + el.height - 10;

      if (isActor) {
        // ACTOR: exact SVG din editor
        svg += `<g>\n`;
        svg += `<circle cx='${centerX}' cy='${iconTop + 10}' r='8' fill='#f9d6d6' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX}' y1='${iconTop + 18}' x2='${centerX}' y2='${iconTop + 40}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX - 16}' y1='${iconTop + 28}' x2='${centerX + 16}' y2='${iconTop + 28}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX}' y1='${iconTop + 40}' x2='${centerX - 15}' y2='${iconTop + 60}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX}' y1='${iconTop + 40}' x2='${centerX + 15}' y2='${iconTop + 60}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `</g>\n`;
        svg += `<text x='${centerX}' y='${textTop}' class='actor-text' fill='#222'>${el.name}</text>\n`;
      } else if (isBoundary) {
        // BOUNDARY: circle + vertical line
        svg += `<g>\n`;
        svg += `<circle cx='${centerX}' cy='${iconTop + 30}' r='12' fill='none' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX - 18}' y1='${iconTop + 30}' x2='${centerX - 6}' y2='${iconTop + 30}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX - 3}' y1='${iconTop + 18}' x2='${centerX - 3}' y2='${iconTop + 42}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `</g>\n`;
        svg += `<text x='${centerX}' y='${textTop}' class='actor-text' fill='#222'>${el.name}</text>\n`;
      } else if (isControl) {
        // CONTROL: circle + arrow
        svg += `<g>\n`;
        svg += `<circle cx='${centerX}' cy='${iconTop + 30}' r='12' fill='none' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<path d='M ${centerX} ${iconTop + 8} A 8 8 0 0 1 ${centerX + 8} ${iconTop + 12}' fill='none' stroke='#222' stroke-width='1.5' stroke-linecap='round' />\n`;
        svg += `<polygon points='${centerX + 8},${iconTop + 12} ${centerX + 11},${iconTop + 8} ${centerX + 9},${iconTop + 18}' fill='#222' />\n`;
        svg += `</g>\n`;
        svg += `<text x='${centerX}' y='${textTop}' class='actor-text' fill='#222'>${el.name}</text>\n`;
      } else if (isEntity) {
        // ENTITY: circle + horizontal line
        svg += `<g>\n`;
        svg += `<circle cx='${centerX}' cy='${iconTop + 25}' r='18' fill='none' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX - 18}' y1='${iconTop + 25}' x2='${centerX + 18}' y2='${iconTop + 25}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `</g>\n`;
        svg += `<text x='${centerX}' y='${textTop}' class='actor-text' fill='#222'>${el.name}</text>\n`;
      } else if (isObject) {
        // OBJECT: dreptunghi cu border
        svg += `<rect x='${el.x}' y='${el.y}' width='${el.width}' height='${el.height}' fill='white' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<text x='${centerX}' y='${el.y + el.height / 2 + 4}' class='actor-text' fill='#222'>${el.name}</text>\n`;
      }
    });

    svg += `</svg>`;
    return svg;
  };

  const handleExportSVG = () => {
    const svgString = generateFullSVG();
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sequence-diagram-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = JSON.stringify({ 
      title, 
      selectedType: 'SEQUENCE',
      elements, 
      connections 
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sequence-diagram-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteConnection = (id) => {
    setConnections(connections.filter(c => c.id !== id));
    setSelectedConnection(null);
  };

  const handleConnectionLineClick = (e, connId) => {
    e.stopPropagation();
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;

    if (e.shiftKey) {
      if (window.confirm(`Delete connection ${conn.label}?`)) {
        handleDeleteConnection(connId);
      }
    } else {
      setSelectedConnection(connId);
    }
  };

  const handleEndpointMouseDown = (e, connId) => {
    e.stopPropagation();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const startMouseY = e.clientY - canvasRect.top;

    const conn = connections.find(c => c.id === connId);
    if (!conn) return;

    endpointDragRef.current = {
      connectionId: connId,
      initialFromY: conn.fromPoint.y,
      initialToY: conn.toPoint.y,
      startMouseY: startMouseY
    };
    setDraggingEndpoint({ connectionId: connId });
    setSelectedConnection(connId);
  };

  const handleResizeStart = (e, elementId, direction) => {
    e.stopPropagation();
    e.preventDefault();
    
    const el = elements.find(elem => elem.id === elementId);
    if (!el) return;

    setResizing({
      elementId,
      direction,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: el.width,
      startHeight: el.height,
      startElX: el.x,
      startElY: el.y
    });
  };

  const getConnectionPoints = (conn) => {
    const fromEl = elements.find(el => el.id === conn.from);
    const toEl = elements.find(el => el.id === conn.to);
    if (!fromEl || !toEl) return null;

    const sequenceMessageTypes = ['SYNC_MESSAGE', 'ASYNC_MESSAGE', 'RETURN_MESSAGE', 'CREATE_MESSAGE', 'DELETE_MESSAGE', 'SELF_MESSAGE'];
    if (sequenceMessageTypes.includes(conn.type)) {
      const startX = fromEl.x + fromEl.width / 2;
      const endX = toEl.x + toEl.width / 2;
      let startY = conn.fromPoint?.y !== undefined ? conn.fromPoint.y : fromEl.y + fromEl.height / 2;
      let endY = conn.toPoint?.y !== undefined ? conn.toPoint.y : startY;
      
      if (conn.type === 'SELF_MESSAGE') {
        // Self message on side of element
        const side = conn.side || 'right';
        startY = fromEl.y + 30; // Start near top of element
        endY = startY + 50; // 50px down
        return { startX, startY, endX: startX, endY, side, targetEdge: 'right' };
      }
      return { startX, startY, endX, endY: startY, targetEdge: 'right' };
    }
    return null;
  };

  return (
    <div className="uml-editor">
      <div className="uml-header" style={{ position: 'relative', zIndex: 999 }}>
        <button className="btn-back" onClick={() => navigate('/dashboard')}>← Back</button>
        <h1>{title}</h1>
        <div className="header-actions">
          <button className="btn-primary" onClick={handleSaveToDatabase}>Salvare</button>
          <button className="btn-secondary" onClick={() => setExportDropdownOpen(!exportDropdownOpen)} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', zIndex: 999 }}>
            Export ▼
            {exportDropdownOpen && (
              <div style={{ 
                position: 'absolute', 
                top: '100%', 
                right: 0, 
                background: 'white', 
                border: '1px solid #d1d5db', 
                borderRadius: '6px',
                boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
                zIndex: 10000,
                minWidth: '200px',
                marginTop: '6px',
                overflow: 'hidden'
              }}>
                <button 
                  onClick={() => { handleExportSVG(); setExportDropdownOpen(false); }} 
                  style={{ 
                    display: 'block', 
                    width: '100%', 
                    textAlign: 'left', 
                    padding: '12px 16px', 
                    border: 'none', 
                    background: 'none', 
                    cursor: 'pointer', 
                    fontSize: '14px',
                    borderBottom: '1px solid #e5e7eb',
                    transition: 'background 0.2s'
                  }} 
                  onMouseEnter={(e) => e.target.style.background = '#f9fafb'} 
                  onMouseLeave={(e) => e.target.style.background = 'none'}
                >
                  Export SVG
                </button>
                <button 
                  onClick={() => { handleExportJSON(); setExportDropdownOpen(false); }} 
                  style={{ 
                    display: 'block', 
                    width: '100%', 
                    textAlign: 'left', 
                    padding: '12px 16px', 
                    border: 'none', 
                    background: 'none', 
                    cursor: 'pointer', 
                    fontSize: '14px',
                    transition: 'background 0.2s'
                  }} 
                  onMouseEnter={(e) => e.target.style.background = '#f9fafb'} 
                  onMouseLeave={(e) => e.target.style.background = 'none'}
                >
                  Export JSON
                </button>
              </div>
            )}
          </button>
          <button className="btn-secondary" onClick={handleImport}>Import</button>
        </div>
      </div>

      {connectionMode && (
        <div className="connection-mode-bar">
          <span>🔗 Connection mode: <strong>{SEQUENCE_ELEMENTS[connectionMode]?.label}</strong></span>
          <button onClick={() => setConnectionMode(null)}>Cancel (Esc)</button>
        </div>
      )}

      <div className="uml-container">
        <div className="uml-sidebar">
          <h3>Elements</h3>
          <div className="diagram-types">
            {Object.entries(SEQUENCE_ELEMENTS).map(([key, value]) => (
              <div
                key={key}
                className={`element-item ${value.isConnection ? 'connection-type' : ''}`}
                draggable={!value.isConnection}
                onDragStart={(e) => handleDragStart(e, key)}
                onClick={() => {
                  if (value.isConnection) {
                    setConnectionMode(key);
                    setConnectionStart(null);
                    setHoveringConnectionElement(null);
                  }
                }}
              >
                <span className="element-icon">{value.icon}</span>
                <span className="element-label">{value.label}</span>
                {value.isConnection && <span className="connection-hint">click</span>}
              </div>
            ))}
          </div>

          <div className="diagram-info">
            <p><strong>Elements:</strong> {elements.length}</p>
            <p><strong>Connections:</strong> {connections.length}</p>
          </div>
        </div>
        <div
          ref={canvasRef}
          className={`uml-canvas ${draggingInCanvas ? 'drag-over' : ''}`}
          onClick={handleCanvasClick}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onDragLeave={handleCanvasDragLeave}
        >
          <svg className="connections-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }}>
            <defs>
              <marker id="arrowSyncMessage" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
                <path d="M 0 0 L 14 7 L 0 14 Z" fill="#333" stroke="none"/>
              </marker>
              <marker id="arrowAsyncMessage" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto">
                <path d="M 0 0 L 14 7 L 0 14" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
              <marker id="arrowReturnMessage" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto">
                <path d="M 0 0 L 14 7 L 0 14" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
            </defs>
            
            {/* LIFELINES */}
            {elements.map((el) => {
              const isSequenceParticipant = ['ACTOR', 'OBJECT', 'BOUNDARY', 'CONTROL', 'ENTITY'].includes(el.type);
              if (!isSequenceParticipant) return null;
              
              const lifelineX = el.x + el.width / 2;
              const lifelineStartY = el.y + el.height;
              const canvasHeight = canvasRef?.current?.getBoundingClientRect().height || 1000;
              const lifelineEndY = canvasHeight;
              
              return (
                <g key={`lifeline-group-${el.id}`}>
                  <line x1={lifelineX} y1={lifelineStartY} x2={lifelineX} y2={lifelineEndY} stroke="transparent" strokeWidth="12" pointerEvents="stroke" cursor="pointer" style={{ opacity: 0 }} />
                  <line x1={lifelineX} y1={lifelineStartY} x2={lifelineX} y2={lifelineEndY} stroke="#999" strokeWidth="1" strokeDasharray="4,4" pointerEvents="none" />
                </g>
              );
            })}

            {/* CONNECTIONS/MESSAGES */}
            {connections.map((conn) => {
              const points = getConnectionPoints(conn);
              if (!points) return null;

              const sequenceMessageTypes = ['SYNC_MESSAGE', 'ASYNC_MESSAGE', 'RETURN_MESSAGE', 'CREATE_MESSAGE', 'DELETE_MESSAGE', 'SELF_MESSAGE'];
              if (!sequenceMessageTypes.includes(conn.type)) return null;

              let stroke = selectedConnection === conn.id ? '#ec4899' : '#333';
              let strokeWidth = selectedConnection === conn.id ? 3 : 2;
              let strokeDasharray = 'none';
              let marker = '';
              
              if (conn.type === 'SYNC_MESSAGE' || conn.type === 'SELF_MESSAGE') marker = 'url(#arrowSyncMessage)';
              else if (conn.type === 'ASYNC_MESSAGE' || conn.type === 'CREATE_MESSAGE') marker = 'url(#arrowAsyncMessage)';
              else if (conn.type === 'RETURN_MESSAGE') { strokeDasharray = '6,6'; marker = 'url(#arrowReturnMessage)'; }

              if (conn.type === 'SELF_MESSAGE' && conn.from === conn.to) {
                const x = points.startX;
                const y = points.startY;
                const endY = points.endY;
                const side = conn.side || 'right';
                const offset = 60;
                
                // Left or right sided U-shape
                let selfPath;
                if (side === 'left') {
                  // Left side: (x, y) -> (x - offset, y) -> (x - offset, endY) -> (x, endY)
                  selfPath = `M ${x} ${y} L ${x - offset} ${y} L ${x - offset} ${endY} L ${x} ${endY}`;
                } else {
                  // Right side: (x, y) -> (x + offset, y) -> (x + offset, endY) -> (x, endY)
                  selfPath = `M ${x} ${y} L ${x + offset} ${y} L ${x + offset} ${endY} L ${x} ${endY}`;
                }
                
                return (
                  <g key={conn.id} onClick={(e) => handleConnectionLineClick(e, conn.id)} onDoubleClick={(e) => {
                    e.stopPropagation();
                    // Toggle side on double click
                    setConnections(connections.map(c =>
                      c.id === conn.id ? { ...c, side: c.side === 'left' ? 'right' : 'left' } : c
                    ));
                  }} style={{ cursor: 'pointer' }}>
                    {/* Main loop path */}
                    <path d={selfPath} fill="none" stroke={stroke} strokeWidth={strokeWidth} markerEnd={marker} />
                  </g>
                );
              }

              if (conn.type === 'DELETE_MESSAGE') {
                const endEl = elements.find(el => el.id === conn.to);
                const endX = endEl ? endEl.x + endEl.width / 2 : points.endX;
                const endY = endEl ? endEl.y + endEl.height : points.endY;
                const xSize = 12;
                const pathD = waypointsToPath([{ x: points.startX, y: points.startY }, { x: points.endX, y: points.endY }]);
                return (
                  <g key={conn.id} onClick={(e) => handleConnectionLineClick(e, conn.id)} style={{ cursor: 'pointer' }}>
                    <path d={pathD} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
                    <line x1={endX - xSize/2} y1={endY - xSize/2} x2={endX + xSize/2} y2={endY + xSize/2} stroke={stroke} strokeWidth={strokeWidth}/>
                    <line x1={endX - xSize/2} y1={endY + xSize/2} x2={endX + xSize/2} y2={endY - xSize/2} stroke={stroke} strokeWidth={strokeWidth}/>
                  </g>
                );
              }

              const pathD = waypointsToPath([{ x: points.startX, y: points.startY }, { x: points.endX, y: points.endY }]);
              return (
                <g key={conn.id} onClick={(e) => handleConnectionLineClick(e, conn.id)} style={{ cursor: 'pointer' }}>
                  <path d={pathD} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} markerEnd={marker} />
                </g>
              );
            })}

            {/* CONNECTION ENDPOINTS - DRAGGABLE */}
            {connections.map((conn) => {
              if (selectedConnection !== conn.id) return null;

              const sequenceMessageTypes = ['SYNC_MESSAGE', 'ASYNC_MESSAGE', 'RETURN_MESSAGE', 'CREATE_MESSAGE', 'DELETE_MESSAGE', 'SELF_MESSAGE'];
              if (!sequenceMessageTypes.includes(conn.type)) return null;

              const points = getConnectionPoints(conn);
              if (!points) return null;

              return (
                <g key={`endpoints-${conn.id}`}>
                  <circle
                    cx={points.startX}
                    cy={points.startY}
                    r="5"
                    fill="#ec4899"
                    stroke="#fff"
                    strokeWidth="2"
                    style={{ cursor: 'move', pointerEvents: 'auto' }}
                    onMouseDown={(e) => handleEndpointMouseDown(e, conn.id)}
                  />
                  <circle
                    cx={points.endX}
                    cy={points.endY}
                    r="5"
                    fill="#ec4899"
                    stroke="#fff"
                    strokeWidth="2"
                    style={{ cursor: 'move', pointerEvents: 'auto' }}
                    onMouseDown={(e) => handleEndpointMouseDown(e, conn.id)}
                  />
                </g>
              );
            })}

            {/* CONNECTION START POINT INDICATOR */}
            {connectionStart && (
              <circle cx={connectionStart.point.x} cy={connectionStart.point.y} r="6" fill="#ec4899" stroke="#fff" strokeWidth="2" pointerEvents="none" />
            )}
          </svg>
          {/* ELEMENTS */}
          {elements.map((el) => {
            const isActor = el.type === 'ACTOR';
            const isBoundary = el.type === 'BOUNDARY';
            const isControl = el.type === 'CONTROL';
            const isEntity = el.type === 'ENTITY';
            const isObject = el.type === 'OBJECT';
            const isDestroy = el.type === 'DESTROY';
            const isActivation = el.type === 'ACTIVATION';
            const isFrame = ['ALT', 'LOOP', 'OPT', 'PAR', 'REF'].includes(el.type);

            return (
              <React.Fragment key={el.id}>
                <div
                  data-element-id={el.id}
                  style={{
                    position: 'absolute',
                    left: `${el.x}px`,
                    top: `${el.y}px`,
                    width: `${el.width || 120}px`,
                    height: `${el.height || 100}px`,
                    backgroundColor: 'transparent',
                    border: connectionMode 
                      ? (connectionStart?.elementId === el.id 
                        ? '3px solid #ec4899' 
                        : '2px dashed #a78bfa')
                      : isFrame ? '2px solid #a78bfa' : 'none',
                    borderRadius: isFrame ? '2px' : '0px',
                    padding: 0,
                    cursor: connectionMode ? 'crosshair' : 'move',
                    boxSizing: 'border-box',
                    overflow: 'hidden',
                    outline: connectionMode ? '2px solid rgba(236, 72, 153, 0.4)' : 'none',
                    outlineOffset: connectionMode ? '2px' : '0px',
                    boxShadow: connectionMode && hoveringConnectionElement === el.id
                      ? '0 0 20px rgba(236, 72, 153, 0.6), inset 0 0 10px rgba(236, 72, 153, 0.2)'
                      : undefined,
                    transition: 'border-color 0.1s, box-shadow 0.1s'
                  }}
                  onClick={(e) => handleElementClick(e, el)}
                  onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                  onMouseDown={(e) => {
                    if (!connectionMode && editingElement !== el.id && !e.target.classList.contains('resize-handle')) {
                      handleElementMouseDown(e, el);
                    }
                  }}
                  onMouseEnter={() => connectionMode && setHoveringConnectionElement(el.id)}
                  onMouseLeave={() => connectionMode && setHoveringConnectionElement(null)}
                  className={selectedElement === el.id ? 'selected' : ''}
                >
                {isActor && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', height: '100%' }}>
                    <svg width="50" height="80" viewBox="0 0 40 65" style={{ marginTop: 6 }}>
                      <circle cx="20" cy="10" r="8" fill="#f9d6d6" stroke="#222" strokeWidth="1.5" />
                      <line x1="20" y1="18" x2="20" y2="40" stroke="#222" strokeWidth="1.5" />
                      <line x1="4" y1="28" x2="36" y2="28" stroke="#222" strokeWidth="1.5" />
                      <line x1="20" y1="40" x2="5" y2="60" stroke="#222" strokeWidth="1.5" />
                      <line x1="20" y1="40" x2="35" y2="60" stroke="#222" strokeWidth="1.5" />
                    </svg>
                    {editingElement === el.id ? (
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveName()} onBlur={handleSaveName} autoFocus style={{ marginTop: 6, textAlign: 'center', width: '90%', fontSize: 14, color: '#222', fontFamily: 'monospace', border: 'none', background: 'transparent', outline: 'none' }} />
                    ) : (
                      <div style={{ marginTop: 6, fontSize: 13, color: '#222', textAlign: 'center', fontFamily: 'monospace' }}>{el.name}</div>
                    )}
                  </div>
                )}
                {isControl && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', height: '100%' }}>
                    <svg width="60" height="80" viewBox="0 0 50 65" style={{ marginTop: 6 }}>
                      <circle cx="25" cy="30" r="12" fill="none" stroke="#222" strokeWidth="1.5" />
                      <path d="M 25 8 A 8 8 0 0 1 32 12" fill="none" stroke="#222" strokeWidth="1.5" strokeLinecap="round" />
                      <polygon points="32,12 35,8 33,18" fill="#222" />
                    </svg>
                    {editingElement === el.id ? (
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveName()} onBlur={handleSaveName} autoFocus style={{ marginTop: 6, textAlign: 'center', width: '90%', fontSize: 14, color: '#222', fontFamily: 'monospace', border: 'none', background: 'transparent', outline: 'none' }} />
                    ) : (
                      <div style={{ marginTop: 6, fontSize: 13, color: '#222', textAlign: 'center', fontFamily: 'monospace' }}>{el.name}</div>
                    )}
                  </div>
                )}
                {isBoundary && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', height: '100%' }}>
                    <svg width="60" height="80" viewBox="0 0 50 65" style={{ marginTop: 6 }}>
                      <circle cx="30" cy="30" r="12" fill="none" stroke="#222" strokeWidth="1.5" />
                      <line x1="12" y1="30" x2="18" y2="30" stroke="#222" strokeWidth="1.5" />
                      <line x1="15" y1="18" x2="15" y2="42" stroke="#222" strokeWidth="1.5" />
                    </svg>
                    {editingElement === el.id ? (
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveName()} onBlur={handleSaveName} autoFocus style={{ marginTop: 6, textAlign: 'center', width: '90%', fontSize: 14, color: '#222', fontFamily: 'monospace', border: 'none', background: 'transparent', outline: 'none' }} />
                    ) : (
                      <div style={{ marginTop: 6, fontSize: 13, color: '#222', textAlign: 'center', fontFamily: 'monospace' }}>{el.name}</div>
                    )}
                  </div>
                )}
                {isEntity && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', height: '100%' }}>
                    <svg width="90" height="95" viewBox="0 0 70 75" style={{ marginTop: 3 }}>
                      <circle cx="35" cy="25" r="18" fill="none" stroke="#222" strokeWidth="1.5" />
                      <line x1="17" y1="45" x2="53" y2="45" stroke="#222" strokeWidth="2" />
                    </svg>
                    {editingElement === el.id ? (
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveName()} onBlur={handleSaveName} autoFocus style={{ marginTop: 2, textAlign: 'center', width: '90%', fontSize: 13, color: '#222', fontFamily: 'monospace', border: 'none', background: 'transparent', outline: 'none' }} />
                    ) : (
                      <div style={{ marginTop: 2, fontSize: 13, color: '#222', textAlign: 'center', fontFamily: 'monospace' }}>{el.name}</div>
                    )}
                  </div>
                )}
                {isObject && (
                  <div style={{ width: '100%', height: '100%', padding: '6px 4px', border: '2px solid #222', borderRadius: '2px', background: '#ffffff', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>
                    {editingElement === el.id ? (
                      <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSaveName()} onBlur={handleSaveName} autoFocus style={{ textAlign: 'center', width: '90%', fontSize: 13, color: '#222', fontFamily: 'monospace', border: 'none', background: 'transparent', outline: 'none' }} />
                    ) : (
                      <div style={{ fontSize: 13, color: '#222', textAlign: 'center', fontFamily: 'monospace' }}>{el.name}</div>
                    )}
                  </div>
                )}
                {isActivation && (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2px' }}>
                    <div style={{ 
                      width: '8px', 
                      height: '90%', 
                      background: '#bae6fd', 
                      border: '1px solid #0284c7',
                      borderRadius: '2px',
                      boxShadow: selectedElement === el.id ? 'inset 0 0 5px rgba(226, 72, 153, 0.4)' : 'none'
                    }} />
                  </div>
                )}
                {isDestroy && (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 44, color: '#7c3aed', fontWeight: 700 }}>✕</div>
                  </div>
                )}
                {isFrame && (
                  <div style={{ padding: '6px', fontSize: '11px', fontFamily: 'monospace', color: '#7c3aed' }}>
                    {el.type}
                  </div>
                )}

                {/* RESIZE HANDLES - INSIDE ELEMENT */}
                {selectedElement === el.id && (
                  <>
                    <div className="resize-handle resize-n" onMouseDown={(e) => handleResizeStart(e, el.id, 'n')} />
                    <div className="resize-handle resize-s" onMouseDown={(e) => handleResizeStart(e, el.id, 's')} />
                    <div className="resize-handle resize-e" onMouseDown={(e) => handleResizeStart(e, el.id, 'e')} />
                    <div className="resize-handle resize-w" onMouseDown={(e) => handleResizeStart(e, el.id, 'w')} />
                    <div className="resize-handle resize-nw" onMouseDown={(e) => handleResizeStart(e, el.id, 'nw')} />
                    <div className="resize-handle resize-ne" onMouseDown={(e) => handleResizeStart(e, el.id, 'ne')} />
                    <div className="resize-handle resize-sw" onMouseDown={(e) => handleResizeStart(e, el.id, 'sw')} />
                    <div className="resize-handle resize-se" onMouseDown={(e) => handleResizeStart(e, el.id, 'se')} />
                  </>
                )}
                </div>
              </React.Fragment>
            );
          })}

          {elements.length === 0 && (
            <div className="canvas-hint">Drag elements onto canvas</div>
          )}
        </div>

        {/* PROPERTIES PANEL - RIGHT SIDEBAR */}
        <div className="uml-properties">
          <h3>Properties</h3>
          {selectedElement ? (() => {
            const el = elements.find(e => e.id === selectedElement);
            
            return (
              <div className="properties-panel">
                <label>Element Name:</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setElements(elements.map(el => 
                        el.id === selectedElement ? { ...el, name: editName } : el
                      ));
                    }
                  }}
                />
                <button className="btn-primary" onClick={() => {
                  setElements(elements.map(el => 
                    el.id === selectedElement ? { ...el, name: editName } : el
                  ));
                }}>
                  Update
                </button>

                <label style={{ marginTop: '12px' }}>Element Type:</label>
                <div style={{ fontSize: '12px', color: '#666', padding: '6px', background: '#f3f4f6', borderRadius: '4px' }}>
                  {el?.type || 'Unknown'}
                </div>

                <button 
                  className="btn-remove" 
                  onClick={() => selectedElement && handleDeleteElement(selectedElement)}
                  style={{ marginTop: '12px', width: '100%', backgroundColor: '#ef4444', color: 'white' }}
                >
                  🗑️ Delete Element
                </button>
              </div>
            );
          })() : (
            <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
              Select an element to edit
            </div>
          )}

          <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #d1d5db' }} />

          <h3>All Connections</h3>
          {connections.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
              No connections yet
            </div>
          ) : (
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  style={{
                    padding: '8px',
                    marginBottom: '6px',
                    background: selectedConnection === conn.id ? '#ede9fe' : '#f9fafb',
                    border: selectedConnection === conn.id ? '1px solid #c084fc' : '1px solid #d1d5db',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '8px'
                  }}
                  onClick={() => setSelectedConnection(selectedConnection === conn.id ? null : conn.id)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: '600', marginBottom: '2px' }}>{conn.type}</div>
                    <div style={{ color: '#666', fontSize: '11px' }}>
                      {elements.find(e => e.id === conn.from)?.name || 'Unknown'} → {elements.find(e => e.id === conn.to)?.name || 'Unknown'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {conn.type === 'SELF_MESSAGE' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConnections(connections.map(c =>
                            c.id === conn.id ? { ...c, side: c.side === 'left' ? 'right' : 'left' } : c
                          ));
                        }}
                        style={{
                          padding: '2px 6px',
                          background: '#dbeafe',
                          border: '1px solid #7dd3fc',
                          borderRadius: '3px',
                          color: '#0284c7',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          height: 'fit-content',
                          marginTop: '2px',
                          minWidth: '30px'
                        }}
                        title={`Direction: ${conn.side === 'left' ? 'Left' : 'Right'}`}
                      >
                        {conn.side === 'left' ? '←' : '→'}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConnection(conn.id);
                      }}
                      style={{
                        padding: '2px 6px',
                        background: '#fee2e2',
                        border: '1px solid #fca5a5',
                        borderRadius: '3px',
                        color: '#dc2626',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold',
                        height: 'fit-content',
                        marginTop: '2px'
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SequenceDiagramEditor;
