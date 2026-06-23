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

// Calculate connection point on element edge dynamically (follows element movement)
function getConnectionPointOnElement(element, edgeType) {
  let x, y;
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;

  if (edgeType === 'top') {
    x = centerX;
    y = element.y;
  } else if (edgeType === 'bottom') {
    x = centerX;
    y = element.y + element.height;
  } else if (edgeType === 'left') {
    x = element.x;
    y = centerY;
  } else if (edgeType === 'right') {
    x = element.x + element.width;
    y = centerY;
  } else {
    // Fallback to center
    x = centerX;
    y = centerY;
  }

  return { x, y };
}

// Calculate point at offset along an edge (0 = start, 1 = end)
function getPointAtOffsetOnEdge(element, edgeType, offset) {
  offset = Math.max(0, Math.min(1, offset)); // Clamp 0-1
  let x, y;

  if (edgeType === 'top') {
    x = element.x + element.width * offset;
    y = element.y;
  } else if (edgeType === 'bottom') {
    x = element.x + element.width * offset;
    y = element.y + element.height;
  } else if (edgeType === 'left') {
    x = element.x;
    y = element.y + element.height * offset;
  } else if (edgeType === 'right') {
    x = element.x + element.width;
    y = element.y + element.height * offset;
  } else {
    x = element.x + element.width / 2;
    y = element.y + element.height / 2;
  }

  return { x, y };
}

// Find closest edge and offset for a given point
function getClosestPointOnContour(element, pointX, pointY) {
  const candidates = [
    { edge: 'top', x: Math.max(element.x, Math.min(pointX, element.x + element.width)), y: element.y },
    { edge: 'bottom', x: Math.max(element.x, Math.min(pointX, element.x + element.width)), y: element.y + element.height },
    { edge: 'left', x: element.x, y: Math.max(element.y, Math.min(pointY, element.y + element.height)) },
    { edge: 'right', x: element.x + element.width, y: Math.max(element.y, Math.min(pointY, element.y + element.height)) }
  ];

  let closest = candidates[0];
  let minDist = Math.hypot(closest.x - pointX, closest.y - pointY);

  for (let c of candidates) {
    const dist = Math.hypot(c.x - pointX, c.y - pointY);
    if (dist < minDist) {
      minDist = dist;
      closest = c;
    }
  }

  // Calculate offset along the edge (0-1)
  let offset = 0;
  if (closest.edge === 'top' || closest.edge === 'bottom') {
    offset = (closest.x - element.x) / element.width;
  } else {
    offset = (closest.y - element.y) / element.height;
  }

  return { edge: closest.edge, offset };
}

// ============ END HELPER FUNCTIONS ============

// ============ VALIDATION FUNCTIONS ============

function checkElementCollision(newEl, existingElements, excludeId = null) {
  for (let el of existingElements) {
    if (excludeId && el.id === excludeId) continue;
    // SYSTEM_BOUNDARY is ignored - it can overlap with anything
    if (el.type === 'SYSTEM_BOUNDARY' || newEl.type === 'SYSTEM_BOUNDARY') continue;

    // Check if rectangles overlap
    const noCollision =
      newEl.x + newEl.width < el.x ||
      el.x + el.width < newEl.x ||
      newEl.y + newEl.height < el.y ||
      el.y + el.height < newEl.y;

    if (!noCollision) {
      return el; // Return the element it collides with
    }
  }
  return null;
}

function isActorInBoundary(actor, boundary) {
  return (
    actor.x >= boundary.x &&
    actor.x + actor.width <= boundary.x + boundary.width &&
    actor.y >= boundary.y &&
    actor.y + actor.height <= boundary.y + boundary.height
  );
}

function canCreateConnection(connectionType, fromElement, toElement) {
  // Include/Extend cannot connect two Actors
  if ((connectionType === 'INCLUDE' || connectionType === 'EXTEND') &&
    fromElement.type === 'ACTOR' && toElement.type === 'ACTOR') {
    return false;
  }
  return true;
}

// ============ END VALIDATION FUNCTIONS ============

// Element types for Use Case Diagram
const USECASE_ELEMENTS = {
  ACTOR: { label: 'Actor', icon: '🧑', isNode: true },
  USE_CASE: { label: 'Use Case', icon: '●', isNode: true },
  SYSTEM_BOUNDARY: { label: 'System', icon: '□', isNode: true },
  ASSOCIATION: { label: 'Association', icon: '—', isConnection: true },
  INCLUDE: { label: 'Include', icon: '→', isConnection: true },
  EXTEND: { label: 'Extend', icon: '⇢', isConnection: true },
  GENERALIZATION: { label: 'Generalization', icon: '▲', isConnection: true }
};

function UseCaseDiagramEditor() {
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

  const [title, setTitle] = useState('Use Case Diagram');
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

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveDialogTitle, setSaveDialogTitle] = useState('');
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (diagramId && diagramId !== 'new') {
      loadDiagram(diagramId);
    } else {
      setCurrentDiagramId(null);
      sessionStorage.removeItem('currentDiagramId');
      setTitle('Use Case Diagram');
      setElements([]);
      setConnections([]);
      setSelectedElement(null);
      setSelectedConnection(null);
    }
  }, [diagramId]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingElement || !canvasRef.current) return;
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const newX = Math.max(0, e.clientX - canvasRect.left - dragOffset.x);
      const newY = Math.max(0, e.clientY - canvasRect.top - dragOffset.y);

      const draggingEl = elements.find(el => el.id === draggingElement);
      if (!draggingEl) return;

      // Create tentative new element
      const tentativeEl = { ...draggingEl, x: newX, y: newY };

      // SYSTEM_BOUNDARY has no collision detection - it can overlap with anything
      if (draggingEl.type !== 'SYSTEM_BOUNDARY') {
        // Check collision with other elements
        const collision = checkElementCollision(tentativeEl, elements, draggingElement);
        if (collision) return; // Don't move if collision detected

        // Check if Actor is being placed inside System Boundary
        if (draggingEl.type === 'ACTOR') {
          const boundary = elements.find(el => el.type === 'SYSTEM_BOUNDARY');
          if (boundary && isActorInBoundary(tentativeEl, boundary)) {
            alert('⚠️ Actors cannot be placed inside System Boundary!');
            return; // Don't move actor inside boundary
          }
        }
      }

      setElements(elements.map(el =>
        el.id === draggingElement ? tentativeEl : el
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
    if (!resizing) return;

    const handleResizeMove = (e) => {
      const { elementId, direction, startX, startY, startWidth, startHeight, startElX, startElY } = resizing;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startElX;
      let newY = startElY;

      const minWidth = 80;
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

      // Create tentative resized element
      const resizingEl = elements.find(el => el.id === elementId);
      const tentativeEl = { ...resizingEl, width: newWidth, height: newHeight, x: Math.max(0, newX), y: Math.max(0, newY) };

      // SYSTEM_BOUNDARY has no collision detection - it can overlap with anything
      if (resizingEl.type !== 'SYSTEM_BOUNDARY') {
        // Check collision with other elements
        const collision = checkElementCollision(tentativeEl, elements, elementId);
        if (collision) return; // Don't resize if collision detected

        // If it's an Actor, check boundary constraint
        if (resizingEl.type === 'ACTOR') {
          const boundary = elements.find(el => el.type === 'SYSTEM_BOUNDARY');
          if (boundary && isActorInBoundary(tentativeEl, boundary)) {
            alert('⚠️ Actors cannot be placed inside System Boundary!');
            return;
          }
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

    window.addEventListener('mousemove', handleResizeMove);
    window.addEventListener('mouseup', handleResizeUp);

    return () => {
      window.removeEventListener('mousemove', handleResizeMove);
      window.removeEventListener('mouseup', handleResizeUp);
    };
  }, [resizing, elements]);

  // Ensure all connections have offset fields
  const ensureConnectionOffsets = (conns) => {
    return conns.map(conn => ({
      ...conn,
      fromOffset: typeof conn.fromOffset === 'number' ? conn.fromOffset : 0.5,
      toOffset: typeof conn.toOffset === 'number' ? conn.toOffset : 0.5
    }));
  };

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
      console.log('Loaded diagram:', result);

      if (result.diagram?.data) {
        setTitle(result.diagram.title || 'Use Case Diagram');
        setElements(result.diagram.data.elements || []);
        const loadedConnections = result.diagram.data.connections || [];
        setConnections(ensureConnectionOffsets(loadedConnections));
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

    if (connectionMode) {
      const clickedPoint = detectConnectionPointOnContour(e, el);

      if (!connectionStart) {
        setConnectionStart({ elementId: el.id, point: clickedPoint });
      } else if (connectionStart.elementId !== el.id) {
        const fromEl = elements.find(elem => elem.id === connectionStart.elementId);

        // Validate connection type
        if (!canCreateConnection(connectionMode, fromEl, el)) {
          alert('⚠️ Include/Extend can only connect to Use Cases, not between Actors!');
          setConnectionMode(null);
          setConnectionStart(null);
          return;
        }

        // Generate label with auto-formatting for Include/Extend
        let label = USECASE_ELEMENTS[connectionMode]?.label || 'Connection';
        if (connectionMode === 'INCLUDE') label = '<<include>>';
        if (connectionMode === 'EXTEND') label = '<<extend>>';

        const newConnection = {
          id: Date.now(),
          type: connectionMode,
          from: connectionStart.elementId,
          fromEdge: connectionStart.point.point,
          fromOffset: 0.5,
          to: el.id,
          toEdge: clickedPoint.point,
          toOffset: 0.5,
          label: label,
          waypoints: []
        };

        setConnections([...connections, newConnection]);
        setConnectionMode(null);
        setConnectionStart(null);
        setHoveringConnectionElement(null);
      } else {
        setConnectionStart(null);
      }
      return;
    }

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

  const handleResizeMouseDown = (e, elementId, direction) => {
    e.stopPropagation();
    e.preventDefault();
    const el = elements.find(e => e.id === elementId);
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

  const handleCanvasClick = () => {
    setSelectedElement(null);
  };

  const handleEndpointMouseDown = (e, connId, endpointType) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingEndpoint({ connId, endpointType });
    endpointDragRef.current = { startX: e.clientX, startY: e.clientY };
  };

  const handleEndpointDrag = (e) => {
    if (!draggingEndpoint || !canvasRef.current) return;

    const { connId, endpointType } = draggingEndpoint;
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;

    const elementId = endpointType === 'from' ? conn.from : conn.to;
    const element = elements.find(e => e.id === elementId);
    if (!element) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const pointX = e.clientX - canvasRect.left;
    const pointY = e.clientY - canvasRect.top;

    // Find closest point on element contour
    const closest = getClosestPointOnContour(element, pointX, pointY);

    // Update connection with new edge and offset
    setConnections(connections.map(c => {
      if (c.id === connId) {
        if (endpointType === 'from') {
          return { ...c, fromEdge: closest.edge, fromOffset: closest.offset };
        } else {
          return { ...c, toEdge: closest.edge, toOffset: closest.offset };
        }
      }
      return c;
    }));
  };

  useEffect(() => {
    if (draggingEndpoint) {
      window.addEventListener('mousemove', handleEndpointDrag);
      window.addEventListener('mouseup', () => setDraggingEndpoint(null));
      return () => {
        window.removeEventListener('mousemove', handleEndpointDrag);
        window.removeEventListener('mouseup', () => setDraggingEndpoint(null));
      };
    }
  }, [draggingEndpoint, connections, elements, canvasRef]);

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
    const width = draggedType === 'SYSTEM_BOUNDARY' ? 300 : 120;
    const height = draggedType === 'SYSTEM_BOUNDARY' ? 250 : 100;
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

  const saveDiagram = async ({ diagramTitle, diagramIdToUpdate = null }) => {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Trebuie să fii autentificat pentru a salva diagrama!');
    navigate('/login');
    return { ok: false, message: 'Neautentificat' };
  }

  const userId = localStorage.getItem('userId');
  if (!userId) {
    alert('Trebuie să fii logat pentru a salva diagrama!');
    navigate('/login');
    return { ok: false, message: 'Neautentificat' };
  }

  try {
    const apiUrl = process.env.REACT_APP_API_URL || '/api';
    const connectionsToSave = ensureConnectionOffsets(connections);
    const diagramData = {
      diagram: {
        selectedType: 'USE_CASE',
        elements: elements,
        connections: connectionsToSave
      }
    };

    let response;

    if (diagramIdToUpdate) {
      response = await fetch(`${apiUrl}/class-diagrams/${diagramIdToUpdate}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(diagramData)
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        navigate('/login');
        return { ok: false, message: 'Sesiune expirată' };
      }
    } else {
      const newDiagramData = {
        title: diagramTitle,
        userId: parseInt(userId),
        ...diagramData
      };

      response = await fetch(`${apiUrl}/class-diagrams`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newDiagramData)
      });

      if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('userId');
        localStorage.removeItem('username');
        navigate('/login');
        return { ok: false, message: 'Sesiune expirată' };
      }
    }

    const result = await response.json();

    if (!response.ok) {
      return { ok: false, message: result.error || 'Eroare la salvare!' };
    }

    const persistedId = result.diagramId || diagramIdToUpdate;
    if (persistedId) {
      setCurrentDiagramId(persistedId);
      sessionStorage.setItem('currentDiagramId', persistedId);
    }

    if (diagramTitle) {
      setTitle(diagramTitle);
    }

    return { ok: true };
  } catch (error) {
    console.error('Error saving diagram:', error);
    return { ok: false, message: `Eroare: ${error.message}` };
  }
};

  const handleSaveToDatabase = async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Trebuie să fii autentificat pentru a salva diagrama!');
    navigate('/login');
    return;
  }

  if (currentDiagramId) {
    const result = await saveDiagram({
      diagramTitle: title,
      diagramIdToUpdate: currentDiagramId
    });

    if (result.ok) {
      alert('✅ Diagrama a fost actualizată cu succes!');
    } else {
      alert(result.message || 'Eroare la actualizare!');
    }
    return;
  }

  setSaveDialogTitle(title || 'Use Case Diagram');
  setShowSaveModal(true);
  setSaveError('');
};

const confirmSave = async () => {
  if (!saveDialogTitle.trim()) {
    setSaveError('Te rog introdu un nume pentru diagramă!');
    return;
  }

  const result = await saveDiagram({ diagramTitle: saveDialogTitle.trim() });

  if (result.ok) {
    setShowSaveModal(false);
    setSaveDialogTitle('');
    setSaveError('');
    alert('✅ Diagrama a fost salvată cu succes!');
  } else {
    setSaveError(result.message || 'Eroare la salvare!');
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
            setConnections(ensureConnectionOffsets(data.connections));
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

  const escapeXML = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const generateFullSVG = () => {
    const padding = 60;
    const allX = elements.map(el => [el.x, el.x + (el.width || 120)]).flat();
    const allY = elements.map(el => [el.y, el.y + (el.height || 100)]).flat();

    const minX = Math.min(...allX, 0) - padding;
    const minY = Math.min(...allY, 0) - padding;
    const maxX = Math.max(...allX, 800) + padding;
    const maxY = Math.max(...allY, 600) + padding;
    const width = maxX - minX;
    const height = maxY - minY;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='${minX} ${minY} ${width} ${height}'>\n`;
    svg += `<defs><marker id='arrowAssociation' markerWidth='14' markerHeight='14' refX='12' refY='7' orient='auto'><path d='M 0 0 L 14 7 L 0 14 Z' fill='#333' stroke='none'/></marker><marker id='arrowInclude' markerWidth='14' markerHeight='14' refX='12' refY='7' orient='auto'><path d='M 0 0 L 14 7 L 0 14 Z' fill='#333' stroke='none'/></marker><marker id='arrowExtend' markerWidth='14' markerHeight='14' refX='13' refY='7' orient='auto'><path d='M 0 0 L 14 7 L 0 14' fill='none' stroke='#333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/></marker><marker id='arrowGeneralization' markerWidth='14' markerHeight='14' refX='12' refY='7' orient='auto'><polygon points='0,0 14,7 0,14' fill='white' stroke='#333' stroke-width='1.5'/></marker></defs>\n`;

    // LAYER 1: Draw system boundary first
    elements.forEach((el) => {
      if (el.type === 'SYSTEM_BOUNDARY') {
        svg += `<rect x='${el.x}' y='${el.y}' width='${el.width}' height='${el.height}' fill='none' stroke='#333' stroke-width='2' />\n`;
        svg += `<text x='${el.x + el.width - 15}' y='${el.y + 18}' font-family='monospace' font-size='11' font-weight='bold' fill='#333'>${escapeXML(el.name)}</text>\n`;
      }
    });

    // LAYER 2: Draw connections
    connections.forEach((conn) => {
      const fromEl = elements.find(e => e.id === conn.from);
      const toEl = elements.find(e => e.id === conn.to);
      if (!fromEl || !toEl) return;

      // Calculate connection points dynamically based on edge type and offset (follows element movement)
      // If offset is stored, use it; otherwise use center of edge
      const fromOffset = typeof conn.fromOffset !== 'undefined' ? conn.fromOffset : 0.5;
      const toOffset = typeof conn.toOffset !== 'undefined' ? conn.toOffset : 0.5;
      const fromPoint = getPointAtOffsetOnEdge(fromEl, conn.fromEdge || 'top', fromOffset);
      const toPoint = getPointAtOffsetOnEdge(toEl, conn.toEdge || 'top', toOffset);

      const startX = fromPoint.x;
      const startY = fromPoint.y;
      const endX = toPoint.x;
      const endY = toPoint.y;

      let strokeDasharray = 'none';
      let marker = 'url(#arrowAssociation)';
      let strokeWidth = '2';

      if (conn.type === 'INCLUDE' || conn.type === 'EXTEND') {
        strokeDasharray = '5,5';
        marker = conn.type === 'EXTEND' ? 'url(#arrowExtend)' : 'url(#arrowInclude)';
      } else if (conn.type === 'GENERALIZATION') {
        marker = 'url(#arrowGeneralization)';
      }

      svg += `<line x1='${startX}' y1='${startY}' x2='${endX}' y2='${endY}' stroke='#333' stroke-width='${strokeWidth}' stroke-dasharray='${strokeDasharray}' marker-end='${marker}' stroke-linecap='round' stroke-linejoin='round' />\n`;

      // Add label in middle
      if (conn.label && conn.type !== 'ASSOCIATION') {
        const midX = (startX + endX) / 2 + 10;
        const midY = (startY + endY) / 2 - 10;
        svg += `<text x='${midX}' y='${midY}' font-family='monospace' font-size='11' fill='#666'>${escapeXML(conn.label)}</text>\n`;
      }
    });

    // LAYER 3: Draw elements
    elements.forEach((el) => {
      const centerX = el.x + el.width / 2;
      const centerY = el.y + el.height / 2;

      if (el.type === 'ACTOR') {
        const iconTop = el.y + 10;
        svg += `<g>\n`;
        svg += `<circle cx='${centerX}' cy='${iconTop + 10}' r='8' fill='#f9d6d6' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX}' y1='${iconTop + 18}' x2='${centerX}' y2='${iconTop + 35}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX - 12}' y1='${iconTop + 25}' x2='${centerX + 12}' y2='${iconTop + 25}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX}' y1='${iconTop + 35}' x2='${centerX - 10}' y2='${iconTop + 50}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `<line x1='${centerX}' y1='${iconTop + 35}' x2='${centerX + 10}' y2='${iconTop + 50}' stroke='#222' stroke-width='1.5' />\n`;
        svg += `</g>\n`;
        svg += `<text x='${centerX}' y='${el.y + el.height - 5}' text-anchor='middle' font-family='monospace' font-size='13' font-weight='bold' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'USE_CASE') {
        const radiusX = el.width / 2;
        const radiusY = el.height / 2;
        svg += `<ellipse cx='${centerX}' cy='${centerY}' rx='${radiusX}' ry='${radiusY}' fill='white' stroke='#222' stroke-width='2' />\n`;
        svg += `<text x='${centerX}' y='${centerY + 5}' text-anchor='middle' font-family='monospace' font-size='13' font-weight='bold' fill='#222'>${escapeXML(el.name)}</text>\n`;
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
    a.download = `usecase-diagram-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = JSON.stringify({
      title,
      selectedType: 'USE_CASE',
      elements,
      connections
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usecase-diagram-${Date.now()}.json`;
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
          <span>🔗 Connection mode: <strong>{USECASE_ELEMENTS[connectionMode]?.label}</strong></span>
          <button onClick={() => setConnectionMode(null)}>Cancel (Esc)</button>
        </div>
      )}

      <div className="uml-container">
        <div className="uml-sidebar">
          <h3>Elements</h3>
          <div className="diagram-types">
            {Object.entries(USECASE_ELEMENTS).map(([key, value]) => (
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
              <marker id="arrowAssociation" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
                <path d="M 0 0 L 14 7 L 0 14 Z" fill="#333" stroke="none" />
              </marker>
              <marker id="arrowInclude" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
                <path d="M 0 0 L 14 7 L 0 14 Z" fill="#333" stroke="none" />
              </marker>
              <marker id="arrowExtend" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto">
                <path d="M 0 0 L 14 7 L 0 14" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </marker>
              <marker id="arrowGeneralization" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
                <polygon points="0,0 14,7 0,14" fill="white" stroke="#333" strokeWidth="1.5" />
              </marker>
            </defs>

            {/* CONNECTIONS */}
            {connections.map((conn) => {
              const fromEl = elements.find(e => e.id === conn.from);
              const toEl = elements.find(e => e.id === conn.to);
              if (!fromEl || !toEl) return null;

              // Calculate connection points dynamically based on edge type and offset (follows element movement)
              const fromOffset = typeof conn.fromOffset !== 'undefined' ? conn.fromOffset : 0.5;
              const toOffset = typeof conn.toOffset !== 'undefined' ? conn.toOffset : 0.5;
              const fromPoint = getPointAtOffsetOnEdge(fromEl, conn.fromEdge || 'top', fromOffset);
              const toPoint = getPointAtOffsetOnEdge(toEl, conn.toEdge || 'top', toOffset);

              let startX = fromPoint.x;
              let startY = fromPoint.y;
              let endX = toPoint.x;
              let endY = toPoint.y;

              let stroke = selectedConnection === conn.id ? '#ec4899' : '#333';
              let strokeWidth = selectedConnection === conn.id ? 3 : 2;
              let strokeDasharray = 'none';
              let marker = 'url(#arrowAssociation)';

              if (conn.type === 'INCLUDE' || conn.type === 'EXTEND') {
                strokeDasharray = '5,5';
                marker = conn.type === 'EXTEND' ? 'url(#arrowExtend)' : 'url(#arrowInclude)';
              } else if (conn.type === 'GENERALIZATION') {
                marker = 'url(#arrowGeneralization)';
              }

              const pathD = waypointsToPath([{ x: startX, y: startY }, { x: endX, y: endY }]);
              const midX = (startX + endX) / 2;
              const midY = (startY + endY) / 2;

              return (
                <g key={conn.id} onClick={(e) => handleConnectionLineClick(e, conn.id)} style={{ cursor: 'pointer' }}>
                  <path d={pathD} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={strokeDasharray} markerEnd={marker} strokeLinecap="round" strokeLinejoin="round" />
                  {/* Label for Include/Extend */}
                  {(conn.type === 'INCLUDE' || conn.type === 'EXTEND') && (
                    <text
                      x={midX}
                      y={midY - 10}
                      textAnchor="middle"
                      fontSize="11"
                      fill="#666"
                      fontFamily="monospace"
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {conn.label}
                    </text>
                  )}
                  {/* Draggable endpoint circles - ONLY SHOW WHEN SELECTED */}
                  {selectedConnection === conn.id && (
                    <>
                      {/* Invisible larger hit area for easier clicking - FROM */}
                      <circle
                        cx={startX}
                        cy={startY}
                        r="12"
                        fill="transparent"
                        pointerEvents="auto"
                        cursor="grab"
                        onMouseDown={(e) => handleEndpointMouseDown(e, conn.id, 'from')}
                      />
                      {/* Visible endpoint circle - FROM */}
                      <circle
                        cx={startX}
                        cy={startY}
                        r="8"
                        fill="#0ea5e9"
                        stroke="#fff"
                        strokeWidth="2"
                        opacity="0.9"
                        pointerEvents="none"
                        style={{ transition: 'r 0.2s' }}
                      />
                      {/* Invisible larger hit area for end point - TO */}
                      <circle
                        cx={endX}
                        cy={endY}
                        r="12"
                        fill="transparent"
                        pointerEvents="auto"
                        cursor="grab"
                        onMouseDown={(e) => handleEndpointMouseDown(e, conn.id, 'to')}
                      />
                      {/* Visible endpoint circle - TO */}
                      <circle
                        cx={endX}
                        cy={endY}
                        r="8"
                        fill="#0ea5e9"
                        stroke="#fff"
                        strokeWidth="2"
                        opacity="0.9"
                        pointerEvents="none"
                        style={{ transition: 'r 0.2s' }}
                      />
                    </>
                  )}
                </g>
              );
            })}
          </svg>

          {/* ELEMENTS */}
          {elements.map((el) => {
            const isSelected = selectedElement === el.id;
            const isEditing = editingElement === el.id;
            let backgroundColor = 'white';
            let borderColor = '#333';
            let borderWidth = isSelected ? 3 : 2;

            if (el.type === 'USE_CASE') {
              return (
                <div
                  key={el.id}
                  onClick={(e) => handleElementClick(e, el)}
                  onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                  onMouseDown={(e) => handleElementMouseDown(e, el)}
                  style={{
                    position: 'absolute',
                    left: `${el.x}px`,
                    top: `${el.y}px`,
                    width: `${el.width}px`,
                    height: `${el.height}px`,
                    borderRadius: '50%',
                    backgroundColor,
                    border: `${borderWidth}px solid ${borderColor}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'grab',
                    userSelect: 'none',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    overflow: 'hidden',
                    wordWrap: 'break-word',
                    padding: '8px',
                    boxSizing: 'border-box',
                    zIndex: isSelected ? 1000 : 100
                  }}
                >
                  {!isEditing && <span>{el.name}</span>}
                  {isEditing && (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleSaveName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') setEditingElement(null);
                      }}
                      style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        background: 'none',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '13px'
                      }}
                    />
                  )}
                  {/* RESIZE HANDLES */}
                  {isSelected && (
                    <>
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'n')} style={{ position: 'absolute', top: '-5px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '10px', cursor: 'ns-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 's')} style={{ position: 'absolute', bottom: '-5px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '10px', cursor: 'ns-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'w')} style={{ position: 'absolute', left: '-5px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '20px', cursor: 'ew-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'e')} style={{ position: 'absolute', right: '-5px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '20px', cursor: 'ew-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'nw')} style={{ position: 'absolute', top: '-5px', left: '-5px', width: '10px', height: '10px', cursor: 'nwse-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'ne')} style={{ position: 'absolute', top: '-5px', right: '-5px', width: '10px', height: '10px', cursor: 'nesw-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'sw')} style={{ position: 'absolute', bottom: '-5px', left: '-5px', width: '10px', height: '10px', cursor: 'nesw-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'se')} style={{ position: 'absolute', bottom: '-5px', right: '-5px', width: '10px', height: '10px', cursor: 'nwse-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                    </>
                  )}
                </div>
              );
            } else if (el.type === 'ACTOR') {
              return (
                <div
                  key={el.id}
                  onClick={(e) => handleElementClick(e, el)}
                  onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                  onMouseDown={(e) => handleElementMouseDown(e, el)}
                  style={{
                    position: 'absolute',
                    left: `${el.x}px`,
                    top: `${el.y}px`,
                    width: `${el.width}px`,
                    height: `${el.height}px`,
                    backgroundColor,
                    border: `${borderWidth}px solid ${borderColor}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'grab',
                    userSelect: 'none',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    zIndex: isSelected ? 1000 : 50
                  }}
                >
                  <svg width="50" height="60" viewBox="0 0 50 60" style={{ marginBottom: '6px' }}>
                    <circle cx="25" cy="12" r="8" fill="none" stroke="#333" strokeWidth="1.5" />
                    <line x1="25" y1="20" x2="25" y2="35" stroke="#333" strokeWidth="1.5" />
                    <line x1="12" y1="27" x2="38" y2="27" stroke="#333" strokeWidth="1.5" />
                    <line x1="25" y1="35" x2="10" y2="50" stroke="#333" strokeWidth="1.5" />
                    <line x1="25" y1="35" x2="40" y2="50" stroke="#333" strokeWidth="1.5" />
                  </svg>
                  {!isEditing && <span>{el.name}</span>}
                  {isEditing && (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleSaveName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') setEditingElement(null);
                      }}
                      style={{
                        width: '80%',
                        border: 'none',
                        background: 'none',
                        textAlign: 'center',
                        fontWeight: 'bold',
                        fontSize: '13px'
                      }}
                    />
                  )}
                  {/* RESIZE HANDLES */}
                  {isSelected && (
                    <>
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'n')} style={{ position: 'absolute', top: '-5px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '10px', cursor: 'ns-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 's')} style={{ position: 'absolute', bottom: '-5px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '10px', cursor: 'ns-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'w')} style={{ position: 'absolute', left: '-5px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '20px', cursor: 'ew-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'e')} style={{ position: 'absolute', right: '-5px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '20px', cursor: 'ew-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'nw')} style={{ position: 'absolute', top: '-5px', left: '-5px', width: '10px', height: '10px', cursor: 'nwse-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'ne')} style={{ position: 'absolute', top: '-5px', right: '-5px', width: '10px', height: '10px', cursor: 'nesw-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'sw')} style={{ position: 'absolute', bottom: '-5px', left: '-5px', width: '10px', height: '10px', cursor: 'nesw-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'se')} style={{ position: 'absolute', bottom: '-5px', right: '-5px', width: '10px', height: '10px', cursor: 'nwse-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                    </>
                  )}
                </div>
              );
            } else if (el.type === 'SYSTEM_BOUNDARY') {
              return (
                <div
                  key={el.id}
                  onClick={(e) => handleElementClick(e, el)}
                  onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                  onMouseDown={(e) => handleElementMouseDown(e, el)}
                  style={{
                    position: 'absolute',
                    left: `${el.x}px`,
                    top: `${el.y}px`,
                    width: `${el.width}px`,
                    height: `${el.height}px`,
                    backgroundColor: 'transparent',
                    border: `${borderWidth}px solid ${borderColor}`,
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'flex-end',
                    cursor: 'grab',
                    userSelect: 'none',
                    padding: '8px',
                    boxSizing: 'border-box',
                    zIndex: isSelected ? 1000 : 5
                  }}
                >
                  {!isEditing && <span style={{ fontSize: '11px', fontWeight: 'bold' }}>{el.name}</span>}
                  {isEditing && (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleSaveName}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveName();
                        if (e.key === 'Escape') setEditingElement(null);
                      }}
                      style={{
                        width: '100%',
                        border: 'none',
                        background: 'none',
                        textAlign: 'right',
                        fontWeight: 'bold',
                        fontSize: '11px'
                      }}
                    />
                  )}
                  {/* RESIZE HANDLES */}
                  {isSelected && (
                    <>
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'n')} style={{ position: 'absolute', top: '-5px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '10px', cursor: 'ns-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 's')} style={{ position: 'absolute', bottom: '-5px', left: '50%', transform: 'translateX(-50%)', width: '20px', height: '10px', cursor: 'ns-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'w')} style={{ position: 'absolute', left: '-5px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '20px', cursor: 'ew-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'e')} style={{ position: 'absolute', right: '-5px', top: '50%', transform: 'translateY(-50%)', width: '10px', height: '20px', cursor: 'ew-resize', backgroundColor: '#ec4899' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'nw')} style={{ position: 'absolute', top: '-5px', left: '-5px', width: '10px', height: '10px', cursor: 'nwse-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'ne')} style={{ position: 'absolute', top: '-5px', right: '-5px', width: '10px', height: '10px', cursor: 'nesw-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'sw')} style={{ position: 'absolute', bottom: '-5px', left: '-5px', width: '10px', height: '10px', cursor: 'nesw-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                      <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'se')} style={{ position: 'absolute', bottom: '-5px', right: '-5px', width: '10px', height: '10px', cursor: 'nwse-resize', backgroundColor: '#ec4899', borderRadius: '2px' }} />
                    </>
                  )}
                </div>
              );
            }

            return null;
          })}
        </div>

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
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Save Diagram Modal */}
{showSaveModal && (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10001
  }}>
    <div style={{
      backgroundColor: 'white',
      padding: '30px',
      borderRadius: '8px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      minWidth: '400px'
    }}>
      <h2 style={{ marginTop: 0, marginBottom: '20px' }}>Salvează Diagrama</h2>
      <label style={{ display: 'block', marginBottom: '10px', fontWeight: '500' }}>Nume diagramă:</label>
      <input
        type="text"
        value={saveDialogTitle}
        onChange={(e) => setSaveDialogTitle(e.target.value)}
        placeholder="Introdu numele diagramei..."
        style={{
          width: '100%',
          padding: '10px',
          marginBottom: '20px',
          border: '1px solid #d1d5db',
          borderRadius: '4px',
          fontSize: '14px',
          boxSizing: 'border-box'
        }}
        onKeyPress={(e) => e.key === 'Enter' && confirmSave()}
        autoFocus
      />
      {saveError && (
        <div style={{ 
          color: '#b91c1c', 
          marginBottom: '15px',
          fontSize: '0.9rem',
          padding: '8px',
          backgroundColor: '#fee2e2',
          borderRadius: '4px'
        }}>
          {saveError}
        </div>
      )}
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button
          onClick={() => {
            setShowSaveModal(false);
            setSaveError('');
          }}
          style={{
            padding: '10px 20px',
            border: '1px solid #d1d5db',
            borderRadius: '4px',
            backgroundColor: '#f3f4f6',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          Anulează
        </button>
        <button
          onClick={confirmSave}
          style={{
            padding: '10px 20px',
            border: 'none',
            borderRadius: '4px',
            backgroundColor: '#7c3aed',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          Salvează
        </button>
      </div>
    </div>
  </div>
)}

    </div>
  );
}

export default UseCaseDiagramEditor;
