import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../UMLEditor.css';

// ============ ROUTING HELPER FUNCTIONS ============

/**
 * Get bounding box of a CLASS element
 */
function getElementBounds(el) {
  return {
    x: el.x,
    y: el.y,
    width: el.width || 200,
    height: el.height || 140
  };
}

/**
 * Check if a line segment intersects with a rectangle
 */
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

/**
 * Check if two line segments intersect
 */
function lineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const ccw = (ax, ay, bx, by, cx, cy) => {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  };

  return ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
         ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4);
}

/**
 * Build orthogonal path with 90-degree corners
 */
function buildOrthogonalPathThroughWaypoints(waypoints) {
  if (waypoints.length === 0) return '';
  if (waypoints.length === 1) {
    return `M ${Math.round(waypoints[0].x)},${Math.round(waypoints[0].y)}`;
  }
  
  const path = [waypoints[0]];
  
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    
    // L-shaped routing: go horizontal first, then vertical
    const midX = to.x;
    const midY = from.y;
    
    if (midX !== from.x) {
      path.push({ x: midX, y: from.y });
    }
    if (midY !== to.y) {
      path.push({ x: to.x, y: midY });
    }
    path.push(to);
  }
  
  // Remove duplicates
  const cleanPath = [];
  for (const pt of path) {
    if (cleanPath.length === 0 || 
        cleanPath[cleanPath.length - 1].x !== pt.x || 
        cleanPath[cleanPath.length - 1].y !== pt.y) {
      cleanPath.push(pt);
    }
  }
  
  let d = `M ${Math.round(cleanPath[0].x)},${Math.round(cleanPath[0].y)}`;
  for (let i = 1; i < cleanPath.length; i++) {
    d += ` L ${Math.round(cleanPath[i].x)},${Math.round(cleanPath[i].y)}`;
  }
  return d;
}

/**
 * Find path around obstacles with perpendicular approach to target edge
 */
function findPathAroundObstacles(x1, y1, x2, y2, elements, excludeIds = [], targetEdge = null) {
  const path = [{ x: x1, y: y1 }];
  
  const obstacles = elements
    .filter(el => !excludeIds.includes(el.id))
    .map(el => getElementBounds(el));

  let directPathClear = true;
  for (const obstacle of obstacles) {
    if (lineIntersectsRect(x1, y1, x2, y2, obstacle)) {
      directPathClear = false;
      break;
    }
  }

  if (directPathClear) {
    // Direct path is clear - use Manhattan routing with perpendicular approach
    if (targetEdge === 'top' || targetEdge === 'bottom') {
      path.push({ x: x2, y: y1 });
      path.push({ x: x2, y: y2 });
    } else if (targetEdge === 'left' || targetEdge === 'right') {
      path.push({ x: x1, y: y2 });
      path.push({ x: x2, y: y2 });
    } else {
      const midX = x1 + (x2 - x1) * 0.5;
      path.push({ x: midX, y: y1 });
      path.push({ x: midX, y: y2 });
      path.push({ x: x2, y: y2 });
    }
    return path;
  }

  // Obstacles in the way - route around them
  const blockingObstacles = obstacles.filter(obs => lineIntersectsRect(x1, y1, x2, y2, obs));
  
  if (blockingObstacles.length === 0) {
    const midX = x1 + (x2 - x1) * 0.5;
    path.push({ x: midX, y: y1 });
    path.push({ x: midX, y: y2 });
    path.push({ x: x2, y: y2 });
    return path;
  }

  // Find closest obstacle
  const closestObstacle = blockingObstacles.reduce((closest, obs) => {
    const distToStart = Math.hypot(
      (obs.x + obs.width / 2) - x1,
      (obs.y + obs.height / 2) - y1
    );
    const closestDist = Math.hypot(
      (closest.x + closest.width / 2) - x1,
      (closest.y + closest.height / 2) - y1
    );
    return distToStart < closestDist ? obs : closest;
  });

  const padding = 20;
  const strategies = [];

  // Try different routing strategies
  strategies.push({ 
    route: [
      { x: closestObstacle.x + closestObstacle.width + padding, y: y1 },
      { x: closestObstacle.x + closestObstacle.width + padding, y: y2 }
    ]
  });

  strategies.push({
    route: [
      { x: closestObstacle.x - padding, y: y1 },
      { x: closestObstacle.x - padding, y: y2 }
    ]
  });

  strategies.push({
    route: [
      { x: x1, y: closestObstacle.y - padding },
      { x: x2, y: closestObstacle.y - padding }
    ]
  });

  strategies.push({
    route: [
      { x: x1, y: closestObstacle.y + closestObstacle.height + padding },
      { x: x2, y: closestObstacle.y + closestObstacle.height + padding }
    ]
  });

  let bestRoute = strategies[0].route;
  
  for (const strategy of strategies) {
    let routeValid = true;
    for (let i = 0; i < strategy.route.length; i++) {
      const segStart = i === 0 ? { x: x1, y: y1 } : strategy.route[i - 1];
      const segEnd = strategy.route[i];
      
      if (lineIntersectsRect(segStart.x, segStart.y, segEnd.x, segEnd.y, closestObstacle)) {
        routeValid = false;
        break;
      }
    }
    
    if (routeValid) {
      bestRoute = strategy.route;
      break;
    }
  }

  for (const wp of bestRoute) {
    path.push(wp);
  }
  
  // Add perpendicular approach to target edge
  const lastWaypoint = bestRoute[bestRoute.length - 1];
  
  if (targetEdge === 'top' || targetEdge === 'bottom') {
    if (Math.abs(lastWaypoint.x - x2) > 1) {
      path.push({ x: x2, y: lastWaypoint.y });
    }
  } else if (targetEdge === 'left' || targetEdge === 'right') {
    if (Math.abs(lastWaypoint.y - y2) > 1) {
      path.push({ x: lastWaypoint.x, y: y2 });
    }
  }
  
  path.push({ x: x2, y: y2 });
  return path;
}

/**
 * Calculate actual connection point based on stored edge and offset
 * Uses offset to move with the element when it's dragged
 */
function getConnectionPointForElement(element, connectionPoint) {
  // If connectionPoint has edge name and offset, recalculate based on current element position
  if (connectionPoint && typeof connectionPoint === 'object' && connectionPoint.point && connectionPoint.offset !== undefined) {
    const w = element.width || 200;
    const h = element.height || 140;
    const offset = connectionPoint.offset;
    
    switch (connectionPoint.point) {
      case 'top':
        // Offset is from left, clamped to width
        const topX = Math.max(element.x, Math.min(element.x + offset, element.x + w));
        return { x: topX, y: element.y };
      case 'bottom':
        const bottomX = Math.max(element.x, Math.min(element.x + offset, element.x + w));
        return { x: bottomX, y: element.y + h };
      case 'left':
        // Offset is from top, clamped to height
        const leftY = Math.max(element.y, Math.min(element.y + offset, element.y + h));
        return { x: element.x, y: leftY };
      case 'right':
        const rightY = Math.max(element.y, Math.min(element.y + offset, element.y + h));
        return { x: element.x + w, y: rightY };
      default:
        return { x: element.x + w / 2, y: element.y + h / 2 };
    }
  }
  
  // Fallback to center (for backward compatibility with old connections)
  const w = element.width || 200;
  const h = element.height || 140;
  return { x: element.x + w / 2, y: element.y + h / 2 };
}

/**
 * Detect which edge (top/bottom/left/right) user clicked nearest to on element
 * Works from ANY click position on the element - always detects closest edge
 * @param {Event} e - Click event
 * @param {Object} element - Element being clicked
 * @returns {Object} Connection point with {x, y, point}
 */
function detectConnectionPointOnContour(e, element) {
  // Get element's actual DOM position from the DIV with data-element-id
  const elementDiv = document.querySelector(`[data-element-id="${element.id}"]`);
  if (!elementDiv) return null;
  
  const elementDOMRect = elementDiv.getBoundingClientRect();
  const canvasRef_local = document.querySelector('.uml-canvas');
  if (!canvasRef_local) return null;
  
  const canvasRect = canvasRef_local.getBoundingClientRect();
  
  // Click position relative to canvas in pixels
  const clickCanvasX = e.clientX - canvasRect.left;
  const clickCanvasY = e.clientY - canvasRect.top;
  
  // Element position and size in canvas coordinate system
  const elLeft = elementDOMRect.left - canvasRect.left;
  const elTop = elementDOMRect.top - canvasRect.top;
  const elWidth = elementDOMRect.width;
  const elHeight = elementDOMRect.height;
  const elRight = elLeft + elWidth;
  const elBottom = elTop + elHeight;
  
  // Calculate signed distances to each edge
  const distToTop = Math.abs(clickCanvasY - elTop);
  const distToBottom = Math.abs(clickCanvasY - elBottom);
  const distToLeft = Math.abs(clickCanvasX - elLeft);
  const distToRight = Math.abs(clickCanvasX - elRight);
  
  // Find minimum distance to determine which edge was clicked
  const minDist = Math.min(distToTop, distToBottom, distToLeft, distToRight);
  
  let edgePoint = null;
  
  // Determine which edge and clamp point to edge boundaries
  // Also store the relative offset on that edge
  if (minDist === distToTop) {
    const x = Math.max(elLeft, Math.min(clickCanvasX, elRight));
    edgePoint = {
      x: x,
      y: elTop,
      point: 'top',
      offset: x - elLeft  // Offset from left edge of element
    };
  } else if (minDist === distToBottom) {
    const x = Math.max(elLeft, Math.min(clickCanvasX, elRight));
    edgePoint = {
      x: x,
      y: elBottom,
      point: 'bottom',
      offset: x - elLeft
    };
  } else if (minDist === distToLeft) {
    const y = Math.max(elTop, Math.min(clickCanvasY, elBottom));
    edgePoint = {
      x: elLeft,
      y: y,
      point: 'left',
      offset: y - elTop  // Offset from top edge of element
    };
  } else if (minDist === distToRight) {
    const y = Math.max(elTop, Math.min(clickCanvasY, elBottom));
    edgePoint = {
      x: elRight,
      y: y,
      point: 'right',
      offset: y - elTop
    };
  }
  
  return edgePoint;
}

// ============ END ROUTING HELPERS ============

function ClassDiagramEditor() {
  const { diagramId } = useParams();
  const navigate = useNavigate();
  
  // CLASS diagram elements - EXACTLY like UMLEditor
  const CLASS_ELEMENTS = {
    CLASS: { label: 'Class', icon: 'C', color: '#fffef0', isNode: true },
    INTERFACE: { label: 'Interface', icon: 'I', color: '#f0f9ff', isNode: true },
    INHERITANCE: { label: 'Inheritance', icon: '⇨', color: '#f3e8ff', isConnection: true },
    COMPOSITION: { label: 'Composition', icon: '◆', color: '#f3e8ff', isConnection: true },
    AGGREGATION: { label: 'Aggregation', icon: '◇', color: '#f3e8ff', isConnection: true },
    ASSOCIATION: { label: 'Association', icon: '→', color: '#f3e8ff', isConnection: true }
  };
  
  const [elements, setElements] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedElement, setSelectedElement] = useState(null);
  const [editingElement, setEditingElement] = useState(null);
  const [editName, setEditName] = useState('');
  const [editingMember, setEditingMember] = useState(null);
  const [editMemberValue, setEditMemberValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState('Untitled Diagram');
  const [currentDiagramId, setCurrentDiagramId] = useState(null);
  const [draggingElement, setDraggingElement] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState(null);
  const [connectionMode, setConnectionMode] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [draggedType, setDraggedType] = useState(null);
  const [draggingInCanvas, setDraggingInCanvas] = useState(false);
  const [draggingControlPoint, setDraggingControlPoint] = useState(null); // {connectionId, pointIndex, startX, startY}
  const [selectedConnection, setSelectedConnection] = useState(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  // Only UMLEditor CLASS elements - no extra ones
  const elementsList = CLASS_ELEMENTS;

  useEffect(() => {
    if (diagramId && diagramId !== 'new') {
      loadDiagram(diagramId);
    } else {
      setCurrentDiagramId(null);
      setTitle('Untitled Diagram');
      setElements([]);
      setConnections([]);
      setSelectedElement(null);
      setSelectedConnection(null);
      sessionStorage.removeItem('currentDiagramId');
    }
  }, [diagramId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Delete' && selectedElement) {
        setElements(elements.filter(el => el.id !== selectedElement));
        setConnections(connections.filter(c => c.from !== selectedElement && c.to !== selectedElement));
        setSelectedElement(null);
      }
      if (e.key === 'Escape') {
        setEditingElement(null);
        setEditingMember(null);
        setDraggingElement(null);
        setConnectionMode(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [elements, selectedElement]);

  const loadDiagram = async (id) => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/class-diagrams/${id}`);
      const result = await response.json();
      if (result.diagram?.data) {
        setTitle(result.diagram.title || 'Untitled Diagram');
        setElements(result.diagram.data.elements || []);
        setConnections(result.diagram.data.connections || []);
        setCurrentDiagramId(id);
        sessionStorage.setItem('currentDiagramId', id);
      } else {
        console.error('Invalid response format:', result);
        alert('Eroare: Format de răspuns invalid din server');
      }
    } catch (err) {
      console.error('Error loading diagram:', err);
      alert(`Eroare la încărcarea diagramei: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddAttribute = (e, elementId) => {
    e.stopPropagation();
    const el = elements.find(elem => elem.id === elementId);
    if (!el || (el.type !== 'CLASS' && el.type !== 'INTERFACE')) return;
    if (editingMember) handleSaveMember(false);
    
    const newAttrs = [...(el.attributes || []), '-newAttr: Type'];
    const newIndex = newAttrs.length - 1;
    setElements(elements.map(elem => 
      elem.id === elementId ? { ...elem, attributes: newAttrs } : elem
    ));
    setEditingMember({ elementId, type: 'attribute', index: newIndex });
    setEditMemberValue('-newAttr: Type');
    setSelectedElement(elementId);
  };

  const handleAddMethod = (e, elementId) => {
    e.stopPropagation();
    if (editingMember) handleSaveMember(false);
    
    const el = elements.find(elem => elem.id === elementId);
    if (!el) return;
    
    const newMethods = [...(el.methods || []), '+method(): void'];
    const newIndex = newMethods.length - 1;
    setElements(elements.map(elem => 
      elem.id === elementId ? { ...elem, methods: newMethods } : elem
    ));
    setEditingMember({ elementId, type: 'method', index: newIndex });
    setEditMemberValue('+method(): void');
    setSelectedElement(elementId);
  };

  const handleEditMember = (e, elementId, type, index, value) => {
    e.stopPropagation();
    if (editingMember && (editingMember.elementId !== elementId || editingMember.type !== type || editingMember.index !== index)) {
      handleSaveMember(false);
    }
    setEditingMember({ elementId, type, index });
    setEditMemberValue(value);
  };

  const handleSaveMember = (addNext = false) => {
    if (!editingMember) return;
    
    const { elementId, type, index } = editingMember;
    const currentEl = elements.find(e => e.id === elementId);
    if (!currentEl) return;
    
    let nextIndex = -1;
    const defaultAttr = '-attr: Type';
    const defaultMethod = '+method(): void';
    
    if (type === 'attribute') {
      if (currentEl.type !== 'CLASS' && currentEl.type !== 'INTERFACE') return;
      const newAttrs = [...(currentEl.attributes || [])];
      if (editMemberValue.trim()) {
        newAttrs[index] = editMemberValue;
        if (addNext) {
          newAttrs.push(defaultAttr);
          nextIndex = newAttrs.length - 1;
        }
      } else {
        newAttrs.splice(index, 1);
      }
      setElements(elements.map(el => 
        el.id === elementId ? { ...el, attributes: newAttrs } : el
      ));
      if (addNext && editMemberValue.trim()) {
        setEditingMember({ elementId, type: 'attribute', index: nextIndex });
        setEditMemberValue(defaultAttr);
      } else {
        setEditingMember(null);
        setEditMemberValue('');
      }
    } else {
      const newMethods = [...(currentEl.methods || [])];
      if (editMemberValue.trim()) {
        newMethods[index] = editMemberValue;
        if (addNext) {
          newMethods.push(defaultMethod);
          nextIndex = newMethods.length - 1;
        }
      } else {
        newMethods.splice(index, 1);
      }
      setElements(elements.map(el => 
        el.id === elementId ? { ...el, methods: newMethods } : el
      ));
      if (addNext && editMemberValue.trim()) {
        setEditingMember({ elementId, type: 'method', index: nextIndex });
        setEditMemberValue(defaultMethod);
      } else {
        setEditingMember(null);
        setEditMemberValue('');
      }
    }
  };

  const handleSaveName = () => {
    if (editingElement) {
      setElements(elements.map(el => 
        el.id === editingElement ? { ...el, name: editName } : el
      ));
      setEditingElement(null);
    }
  };

  const handleElementClick = (e, el) => {
    e.stopPropagation();
    
    if (connectionMode) {
      // Always detect connection point - works from ANY click on element
      const clickedPoint = detectConnectionPointOnContour(e, el);
      
      if (!clickedPoint) {
        console.warn('Failed to detect connection point');
        return;
      }
      
      if (!connectionStart) {
        // First click - select START point
        setConnectionStart({ elementId: el.id, point: clickedPoint });
        console.log(`✓ Connection START on ${el.name} at ${clickedPoint.point} edge`);
      } else if (connectionStart.elementId !== el.id) {
        // Second click on different element - CREATE CONNECTION
        const newConn = {
          id: `conn_${Date.now()}`,
          from: connectionStart.elementId,
          fromPoint: connectionStart.point,
          to: el.id,
          toPoint: clickedPoint,
          type: connectionMode,
          controlPoints: []
        };
        setConnections([...connections, newConn]);
        console.log(`✓ Connection CREATED: ${connectionMode} from ${connectionStart.elementId} to ${el.id}`);
        setConnectionMode(null);
        setConnectionStart(null);
      } else {
        // Clicked same element again - just change start point
        console.log(`✓ Changed START point to ${clickedPoint.point} edge on same element`);
        setConnectionStart({ elementId: el.id, point: clickedPoint });
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
    e.preventDefault();
    setDraggingElement(el.id);
    setSelectedElement(el.id);
    const canvasRect = canvasRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - canvasRect.left - el.x,
      y: e.clientY - canvasRect.top - el.y
    });
  };

  useEffect(() => {
    if (!draggingElement || !canvasRef.current) return;

    const draggedElement = elements.find(el => el.id === draggingElement);
    if (!draggedElement) return;

    const handleMouseMove = (e) => {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const newX = Math.max(0, e.clientX - canvasRect.left - dragOffset.x);
      const newY = Math.max(0, e.clientY - canvasRect.top - dragOffset.y);
      
      // Check for collision with other elements
      if (hasCollisionWithOthers(draggingElement, newX, newY, draggedElement.width || 200, draggedElement.height || 140)) {
        return; // Do not allow movement if it would cause overlap
      }
      
      setElements(elements.map(el =>
        el.id === draggingElement
          ? { ...el, x: newX, y: newY }
          : el
      ));
    };

    const handleMouseUp = () => {
      setDraggingElement(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingElement, dragOffset, elements]);

  // Collision detection helpers
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
      const elRect = { x: el.x, y: el.y, width: el.width || 200, height: el.height || 140 };
      if (checkCollision(movingRect, elRect)) {
        return true;
      }
    }
    return false;
  };

  // Resizing
  useEffect(() => {
    if (!resizing) return;

    const handleMouseMove = (e) => {
      const { elementId, direction, startX, startY, startWidth, startHeight, startElX, startElY } = resizing;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startElX;
      let newY = startElY;

      const minWidth = 160;
      const minHeight = 100;

      // Handle width changes
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

      // Handle height changes
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

      // Check for collision with other elements
      if (hasCollisionWithOthers(elementId, Math.max(0, newX), Math.max(0, newY), newWidth, newHeight)) {
        return; // Do not allow resize if it would cause overlap
      }

      setElements(elements.map(el =>
        el.id === elementId
          ? { ...el, width: newWidth, height: newHeight, x: Math.max(0, newX), y: Math.max(0, newY) }
          : el
      ));
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, elements]);

  const handleCanvasClick = () => {
    setSelectedElement(null);
    if (editingMember) handleSaveMember(false);
  };

  const handleDeleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    setConnections(connections.filter(c => c.from !== id && c.to !== id));
    setSelectedElement(null);
    setEditingElement(null);
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

  // Drag-and-drop từ toolbar
  const handleDragStart = (e, elementType) => {
    setDraggedType(elementType);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleCanvasDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDraggingInCanvas(true);
  };

  const handleCanvasDragLeave = (e) => {
    if (e.currentTarget === canvasRef.current) {
      setDraggingInCanvas(false);
    }
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    setDraggingInCanvas(false);

    if (!draggedType || !canvasRef.current) return;

    const elementType = draggedType;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const width = 200;
    const height = 140;
    const x = Math.max(0, e.clientX - canvasRect.left - width / 2);
    const y = Math.max(0, e.clientY - canvasRect.top - height / 2);

    // Generate unique ID
    const newId = `${elementType}-${Date.now()}`;

    // Create new element with defaults
    const newElement = {
      id: newId,
      type: elementType,
      name: elementType === 'CLASS' ? 'NewClass' : 'NewInterface',
      x,
      y,
      width: width,
      height: height,
      attributes: [],
      methods: []
    };

    setElements([...elements, newElement]);
    setDraggedType(null);
  };

  // Handle control point dragging
  useEffect(() => {
    const handleControlPointMove = (e) => {
      if (!draggingControlPoint) return;

      const { connectionId, pointIndex, startX, startY } = draggingControlPoint;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      setConnections(prevConnections => {
        return prevConnections.map(conn => {
          if (conn.id === connectionId && conn.controlPoints) {
            const newCPs = [...conn.controlPoints];
            newCPs[pointIndex] = {
              x: newCPs[pointIndex].x + deltaX,
              y: newCPs[pointIndex].y + deltaY
            };
            return { ...conn, controlPoints: newCPs };
          }
          return conn;
        });
      });

      setDraggingControlPoint({
        ...draggingControlPoint,
        startX: e.clientX,
        startY: e.clientY
      });
    };

    const handleControlPointUp = () => {
      setDraggingControlPoint(null);
    };

    if (draggingControlPoint) {
      window.addEventListener('mousemove', handleControlPointMove);
      window.addEventListener('mouseup', handleControlPointUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleControlPointMove);
      window.removeEventListener('mouseup', handleControlPointUp);
    };
  }, [draggingControlPoint, connections]);

  // Helper function to prepare connections with waypoints for save
  const prepareDiagramForSave = () => {
    // Convert controlPoints to waypoints for consistency
    return connections.map(conn => {
      return {
        ...conn,
        waypoints: conn.controlPoints || conn.waypoints || []
      };
    });
  };

  // Save or Update Diagram - Auto-detects based on currentDiagramId
  const handleSaveToDatabase = async () => {
    const activeDiagramId = currentDiagramId || sessionStorage.getItem('currentDiagramId');
    const diagramTitle = activeDiagramId
      ? title
      : prompt('Introdu numele diagramei:', title || 'UML Class Diagram');

    if (!diagramTitle) return;

    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        alert('Trebuie să fii logat pentru a salva diagrama!');
        return;
      }

      const diagramData = {
        diagram: {
          selectedType: 'CLASS',
          elements: elements,
          connections: prepareDiagramForSave()
        }
      };

      let response, result, method, url;

      if (activeDiagramId) {
        // UPDATE existing diagram
        method = 'PUT';
        url = `http://localhost:5000/api/class-diagrams/${activeDiagramId}`;
        response = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(diagramData)
        });
        result = await response.json();

        if (response.ok) {
          alert(`Diagrama "${diagramTitle}" a fost actualizată cu succes!`);
          setTitle(diagramTitle);
        }
      } else {
        // CREATE new diagram
        method = 'POST';
        url = 'http://localhost:5000/api/class-diagrams';
        const newDiagramData = {
          title: diagramTitle,
          userId: parseInt(userId),
          ...diagramData
        };

        response = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newDiagramData)
        });
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



  // EXACTLY LIKE UMLEditor - Export SVG
  // Escape XML characters for SVG
  const escapeXML = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const handleExportFullSVG = () => {
    const padding = 40;
    const allX = elements.map(el => [el.x, el.x + (el.width || 200)]).flat();
    const allY = elements.map(el => [el.y, el.y + (el.height || 140)]).flat();
    const minX = Math.min(...allX, 0) - padding;
    const minY = Math.min(...allY, 0) - padding;
    const maxX = Math.max(...allX, 800) + padding;
    const maxY = Math.max(...allY, 600) + padding;
    const width = maxX - minX;
    const height = maxY - minY;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='${minX} ${minY} ${width} ${height}'>\n`;
    svg += `<defs>
      <!-- INHERITANCE - Filled triangle with white inside -->
      <marker id='arrowTriangle' markerWidth='18' markerHeight='18' refX='17' refY='9' orient='auto'>
        <path d='M 0 0 L 18 9 L 0 18 Z' fill='white' stroke='#8b4513' stroke-width='2' stroke-linejoin='miter'/>
      </marker>
      <!-- COMPOSITION - Filled diamond -->
      <marker id='arrowDiamond' markerWidth='18' markerHeight='18' refX='17' refY='9' orient='auto'>
        <path d='M 0 9 L 9 0 L 18 9 L 9 18 Z' fill='#8b4513' stroke='#8b4513' stroke-width='1'/>
      </marker>
      <!-- AGGREGATION - Open diamond (hollow) -->
      <marker id='arrowDiamondOpen' markerWidth='18' markerHeight='18' refX='17' refY='9' orient='auto'>
        <path d='M 0 9 L 9 0 L 18 9 L 9 18 Z' fill='white' stroke='#8b4513' stroke-width='2' stroke-linejoin='miter'/>
      </marker>
      <!-- ASSOCIATION - Simple open arrow -->
      <marker id='arrowSimple' markerWidth='14' markerHeight='14' refX='13' refY='7' orient='auto'>
        <path d='M 0 0 L 14 7 L 0 14' fill='none' stroke='#8b4513' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>
      </marker>
    </defs>\n`;

    // Render connections with orthogonal routing - recalculate based on current positions
    connections.forEach(conn => {
      const fromEl = elements.find(el => el.id === conn.from);
      const toEl = elements.find(el => el.id === conn.to);
      if (!fromEl || !toEl) return;

      let fromX, fromY, toX, toY, targetEdge;
      
      if (conn.fromPoint && conn.toPoint) {
        // Recalculate using stored edge+offset with current element positions
        const fromPt = getConnectionPointForElement(fromEl, conn.fromPoint);
        const toPt = getConnectionPointForElement(toEl, conn.toPoint);
        fromX = fromPt.x;
        fromY = fromPt.y;
        toX = toPt.x;
        toY = toPt.y;
        targetEdge = conn.toPoint.point;
      } else {
        // Fallback to center-to-center for old connections
        fromX = fromEl.x + (fromEl.width || 200) / 2;
        fromY = fromEl.y + (fromEl.height || 140) / 2;
        toX = toEl.x + (toEl.width || 200) / 2;
        toY = toEl.y + (toEl.height || 140) / 2;
      }

      // Build waypoints - use control points if available
      let waypoints;
      if (conn.controlPoints && conn.controlPoints.length > 0) {
        // Use control points
        waypoints = [{ x: fromX, y: fromY }, ...conn.controlPoints, { x: toX, y: toY }];
      } else {
        // Find path around obstacles
        waypoints = findPathAroundObstacles(
          fromX, fromY, toX, toY,
          elements,
          [conn.from, conn.to],
          targetEdge
        );
      }

      // Convert to orthogonal path
      const pathD = buildOrthogonalPathThroughWaypoints(waypoints);

      let marker = '';
      if (conn.type === 'INHERITANCE') marker = 'url(#arrowTriangle)';
      else if (conn.type === 'COMPOSITION') marker = 'url(#arrowDiamond)';
      else if (conn.type === 'AGGREGATION') marker = 'url(#arrowDiamondOpen)';
      else if (conn.type === 'ASSOCIATION') marker = 'url(#arrowSimple)';

      svg += `<path d='${pathD}' fill='none' stroke='#8b4513' stroke-width='2' marker-end='${marker}'/>\n`;
    });

    // Render elements - EXACTLY LIKE UMLEditor
    elements.forEach(el => {
      const w = el.width || 200;
      let h = el.height || 140;
      const x = el.x;
      const y = el.y;
      
      if (el.type === 'CLASS' || el.type === 'INTERFACE') {
        // Clase UML - folosește el.height exact ca în editor
        const headerHeight = el.type === 'INTERFACE' ? 50 : 36;
        
        // Box - folosește dimensiunea reală din editor
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='6' fill='#fffef0' stroke='#8b4513' stroke-width='2'/>\n`;
        
        // Header
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${headerHeight}' fill='#fff7e6' stroke='#8b4513' stroke-width='1'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + headerHeight / 2 + 6}' font-size='14' font-family='monospace' font-weight='bold' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
        
        // Linie sub header
        svg += `<line x1='${x}' y1='${y + headerHeight}' x2='${x + w}' y2='${y + headerHeight}' stroke='#8b4513' stroke-width='1'/>\n`;
        
        // Calculează spațiul disponibil pentru atribute și metode
        const attrCount = el.attributes ? el.attributes.length : 0;
        const methodCount = el.methods ? el.methods.length : 0;
        const totalItems = attrCount + methodCount;
        
        // Spațiul disponibil după header
        const availableHeight = h - headerHeight;
        
        // Distribuie spațiul: atributele ocupă proportional din spațiu
        const attrSectionHeight = totalItems > 0 ? (availableHeight * attrCount) / totalItems : availableHeight / 2;
        const methodSectionHeight = totalItems > 0 ? (availableHeight * methodCount) / totalItems : availableHeight / 2;
        
        // Atribute - distribuite pe înălțimea secțiunii
        const attrSectionStart = y + headerHeight;
        if (el.attributes && el.attributes.length) {
          const itemHeight = attrSectionHeight / attrCount;
          el.attributes.forEach((attr, i) => {
            const textY = attrSectionStart + itemHeight * i + itemHeight / 2 + 4;
            svg += `<text x='${x + 8}' y='${textY}' font-size='12' font-family='monospace' fill='#222'>${escapeXML(attr)}</text>\n`;
          });
        }
        
        // Linie sub atribute
        const attrSeparatorY = attrSectionStart + attrSectionHeight;
        svg += `<line x1='${x}' y1='${attrSeparatorY}' x2='${x + w}' y2='${attrSeparatorY}' stroke='#8b4513' stroke-width='1'/>\n`;
        
        // Metode - distribuite pe înălțimea secțiunii
        const methodSectionStart = attrSeparatorY;
        if (el.methods && el.methods.length) {
          const itemHeight = methodSectionHeight / methodCount;
          el.methods.forEach((m, i) => {
            const textY = methodSectionStart + itemHeight * i + itemHeight / 2 + 4;
            svg += `<text x='${x + 8}' y='${textY}' font-size='12' font-family='monospace' fill='#222'>${escapeXML(m)}</text>\n`;
          });
        }
      } else {
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='4' fill='${CLASS_ELEMENTS[el.type].color}' stroke='#8b4513' stroke-width='2'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + h / 2 + 6}' font-size='12' font-family='monospace' font-weight='bold' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      }
    });

    svg += `</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'diagram'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // EXACTLY LIKE UMLEditor - Export JSON
  const handleSaveJSON = () => {
    const data = JSON.stringify({ selectedType: 'CLASS', elements, connections }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'diagram'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Extract filename without extension for title
    const fileName = file.name.replace(/\.json$/i, '');
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        
        // Load diagram data
        if (data.selectedType) {
          // Just for reference, CLASS type is already set
        }
        if (data.elements && Array.isArray(data.elements)) {
          setElements(data.elements);
        }
        if (data.connections && Array.isArray(data.connections)) {
          setConnections(data.connections);
        }
        
        // Set title from filename
        setTitle(fileName || 'Imported Diagram');
        
        // Clear any selection
        setSelectedElement(null);
        setEditingElement(null);
        setEditingMember(null);
        setConnectionMode(null);
      } catch (err) {
        console.error('Import error:', err);
        alert('Fișier invalid! Asigură-te că este o diagramă JSON exportată.');
      }
    };
    reader.onerror = () => {
      alert('Eroare la citirea fișierului!');
    };
    reader.readAsText(file);
    
    // Reset file input so same file can be imported again
    event.target.value = '';
  };

  const cancelConnectionMode = () => {
    setConnectionMode(null);
    setConnectionStart(null);
  };

  return (
    <>
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center'
          }}>
            <p>Se încarcă diagrama...</p>
          </div>
        </div>
      )}
      
      <div className="uml-editor">
        <div className="uml-header">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            ← Back
          </button>
          <h1>{title}</h1>
          <div className="header-actions">
            <button className="btn-primary" onClick={handleSaveToDatabase}>💾 Save to DB</button>
            <div className="dropdown-save">
              <button className="btn-secondary">Export ▼</button>
              <div className="dropdown-content">
                <button onClick={handleExportFullSVG}>Export SVG</button>
                <button onClick={handleSaveJSON}>Export JSON</button>
              </div>
            </div>
            <button className="btn-secondary" onClick={() => fileInputRef.current?.click()}>Import</button>
            <input
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              ref={fileInputRef}
              onChange={handleImport}
            />
          </div>
        </div>

        {connectionMode && (
          <div className="connection-mode-bar">
            <span>
              🔗 Connection mode: <strong>{CLASS_ELEMENTS[connectionMode].label}</strong>
              {connectionStart 
                ? ` - START point selected • Click on element to complete`
                : ' - Click on first element'}
            </span>
            <button onClick={cancelConnectionMode}>Cancel (Esc)</button>
          </div>
        )}

        <div className="uml-container">
          <div className="uml-sidebar">
            <h3>Elements</h3>
            <div className="diagram-types">
              {Object.entries(elementsList).map(([key, value]) => (
                <div
                  key={key}
                  className={`element-item ${value.isConnection ? 'connection-type' : ''}`}
                  draggable={!value.isConnection}
                  onDragStart={(e) => handleDragStart(e, key)}
                  onClick={() => {
                    if (value.isConnection) {
                      setConnectionMode(key);
                      setConnectionStart(null);
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
              <p style={{ marginTop: '8px', fontSize: '12px', color: '#9168b7' }}>
                💡 Dublu-click pentru a edita
              </p>
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
            {elements.length === 0 && connectionMode === null && (
              <div className="canvas-hint">Click element to add</div>
            )}

            {elements.map((el) => {
              const isClassType = el.type === 'CLASS' || el.type === 'INTERFACE';
              return (
                <div
                  key={el.id}
                  data-element-id={el.id}
                  className={`uml-element ${isClassType ? 'uml-class-element' : ''} ${selectedElement === el.id ? 'selected' : ''} ${draggingElement === el.id ? 'moving' : ''} ${connectionMode && (!connectionStart || connectionStart.elementId !== el.id) ? 'connection-available' : ''}`}
                  style={{
                    position: 'absolute',
                    left: `${el.x}px`,
                    top: `${el.y}px`,
                    width: `${el.width}px`,
                    height: `${el.height}px`,
                    overflow: 'hidden',
                    boxSizing: 'border-box',
                    padding: '0',
                    margin: '0',
                    display: 'flex',
                    alignItems: isClassType ? 'stretch' : 'center',
                    justifyContent: isClassType ? 'stretch' : 'center'
                  }}
                  onClick={(e) => handleElementClick(e, el)}
                  onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                  onMouseDown={(e) => handleElementMouseDown(e, el)}
                >
                  {isClassType ? (
                    <div 
                      className="uml-class-box"
                      style={{
                        minHeight: el.height || (() => {
                          const headerHeight = el.type === 'INTERFACE' ? 50 : 36;
                          const itemBaseHeight = 20;
                          const attrItemsHeight = Math.max(1, el.attributes?.length || 0) * itemBaseHeight;
                          const methodItemsHeight = Math.max(1, el.methods?.length || 0) * itemBaseHeight;
                          const separatorHeight = 2;
                          return headerHeight + attrItemsHeight + separatorHeight + methodItemsHeight;
                        })(),
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        margin: '0',
                        padding: '0',
                        boxSizing: 'border-box'
                      }}
                    >
                      <div className="uml-class-header">
                        {el.type === 'INTERFACE' && <div className="uml-stereotype">«interface»</div>}
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
                            className="uml-class-name-input"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="uml-class-name">{el.name}</div>
                        )}
                      </div>
                      {(el.type === 'CLASS' || el.type === 'INTERFACE') && (
                        <div 
                          className="uml-class-section uml-attributes"
                          style={{
                            flex: ((el.attributes?.length || 0) + (el.methods?.length || 0) === 0) 
                              ? 1 
                              : Math.max(1, el.attributes?.length || 0),
                            minHeight: '30px'
                          }}
                          onDoubleClick={(e) => handleAddAttribute(e, el.id)}
                        >
                          {(el.attributes || []).length === 0 ? (
                            <div className="uml-empty-hint">dublu-click pentru atribute</div>
                          ) : (
                            el.attributes.map((attr, idx) => (
                              editingMember?.elementId === el.id && 
                              editingMember?.type === 'attribute' && 
                              editingMember?.index === idx ? (
                                <input
                                  key={idx}
                                  type="text"
                                  value={editMemberValue}
                                  onChange={(e) => setEditMemberValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') { e.preventDefault(); handleSaveMember(true); }
                                    if (e.key === 'Escape') { setEditingMember(null); setEditMemberValue(''); }
                                  }}
                                  onBlur={() => handleSaveMember(false)}
                                  autoFocus
                                  className="uml-member-input"
                                  onClick={(e) => e.stopPropagation()}
                                />
                              ) : (
                                <div 
                                  key={idx} 
                                  className="uml-member"
                                  onDoubleClick={(e) => handleEditMember(e, el.id, 'attribute', idx, attr)}
                                >
                                  {attr}
                                </div>
                              )
                            ))
                          )}
                        </div>
                      )}
                      <div 
                        className="uml-class-section uml-methods"
                        style={{
                          flex: ((el.attributes?.length || 0) + (el.methods?.length || 0) === 0) 
                            ? 1 
                            : Math.max(1, el.methods?.length || 0),
                          minHeight: '30px'
                        }}
                        onDoubleClick={(e) => handleAddMethod(e, el.id)}
                      >
                        {(el.methods || []).length === 0 ? (
                          <div className="uml-empty-hint">dublu-click pentru metode</div>
                        ) : (
                          el.methods.map((method, idx) => (
                            editingMember?.elementId === el.id && 
                            editingMember?.type === 'method' && 
                            editingMember?.index === idx ? (
                              <input
                                key={idx}
                                type="text"
                                value={editMemberValue}
                                onChange={(e) => setEditMemberValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') { e.preventDefault(); handleSaveMember(true); }
                                  if (e.key === 'Escape') { setEditingMember(null); setEditMemberValue(''); }
                                }}
                                onBlur={() => handleSaveMember(false)}
                                autoFocus
                                className="uml-member-input"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div 
                                key={idx} 
                                className="uml-member"
                                onDoubleClick={(e) => handleEditMember(e, el.id, 'method', idx, method)}
                              >
                                {method}
                              </div>
                            )
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="element-content">
                      <span className="element-icon">{elementsList[el.type]?.icon}</span>
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
                        <p>{el.name}</p>
                      )}
                    </div>
                  )}
                
                  {selectedElement === el.id && !editingElement && (
                    <>
                      <button 
                        className="element-delete"
                        onClick={(e) => { e.stopPropagation(); handleDeleteElement(el.id); }}
                      >
                        ×
                      </button>
                      {/* Resize handles */}
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
              );
            })}

            {/* Connections SVG layer - Rendered LAST so it appears on top of elements */}
            <svg
              className="connections-layer"
              width="100%"
              height="100%"
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'auto' }}
            >
              <defs>
                {/* INHERITANCE - Filled triangle with white inside */}
                <marker id="arrowTriangle" markerWidth="18" markerHeight="18" refX="17" refY="9" orient="auto">
                  <path d="M 0 0 L 18 9 L 0 18 Z" fill="white" stroke="#8b4513" strokeWidth="2" strokeLinejoin="miter"/>
                </marker>
                
                {/* COMPOSITION - Filled diamond */}
                <marker id="arrowDiamond" markerWidth="18" markerHeight="18" refX="17" refY="9" orient="auto">
                  <path d="M 0 9 L 9 0 L 18 9 L 9 18 Z" fill="#8b4513" stroke="#8b4513" strokeWidth="1"/>
                </marker>
                
                {/* AGGREGATION - Open diamond (hollow) */}
                <marker id="arrowDiamondOpen" markerWidth="18" markerHeight="18" refX="17" refY="9" orient="auto">
                  <path d="M 0 9 L 9 0 L 18 9 L 9 18 Z" fill="white" stroke="#8b4513" strokeWidth="2" strokeLinejoin="miter"/>
                </marker>
                
                {/* ASSOCIATION - Simple open arrow */}
                <marker id="arrowSimple" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto">
                  <path d="M 0 0 L 14 7 L 0 14" fill="none" stroke="#8b4513" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
              </defs>
              {connections.map((conn) => {
                const fromEl = elements.find(el => el.id === conn.from);
                const toEl = elements.find(el => el.id === conn.to);
                if (!fromEl || !toEl) return null;

                // Recalculate connection points based on current element positions
                // This makes connections follow elements when they move
                let fromX, fromY, toX, toY, targetEdge;
                
                if (conn.fromPoint && conn.toPoint) {
                  // Recalculate using stored edge+offset with current element positions
                  const fromPt = getConnectionPointForElement(fromEl, conn.fromPoint);
                  const toPt = getConnectionPointForElement(toEl, conn.toPoint);
                  fromX = fromPt.x;
                  fromY = fromPt.y;
                  toX = toPt.x;
                  toY = toPt.y;
                  targetEdge = conn.toPoint.point;
                } else {
                  // Fallback to center-to-center for old connections
                  fromX = fromEl.x + (fromEl.width || 200) / 2;
                  fromY = fromEl.y + (fromEl.height || 140) / 2;
                  toX = toEl.x + (toEl.width || 200) / 2;
                  toY = toEl.y + (toEl.height || 140) / 2;
                }
                
                // Build waypoints - use control points if available
                let waypoints;
                if (conn.controlPoints && conn.controlPoints.length > 0) {
                  // Use control points
                  waypoints = [{ x: fromX, y: fromY }, ...conn.controlPoints, { x: toX, y: toY }];
                } else {
                  // Find path around obstacles with orthogonal routing
                  waypoints = findPathAroundObstacles(
                    fromX, fromY, toX, toY,
                    elements,
                    [conn.from, conn.to],
                    targetEdge
                  );
                }

                // Convert waypoints to SVG path with 90-degree corners
                const pathD = buildOrthogonalPathThroughWaypoints(waypoints);

                let marker = '';
                if (conn.type === 'INHERITANCE') marker = 'url(#arrowTriangle)';
                else if (conn.type === 'COMPOSITION') marker = 'url(#arrowDiamond)';
                else if (conn.type === 'AGGREGATION') marker = 'url(#arrowDiamondOpen)';
                else if (conn.type === 'ASSOCIATION') marker = 'url(#arrowSimple)';

                return (
                  <g key={conn.id}>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#8b4513"
                      strokeWidth="2"
                      markerEnd={marker}
                      className="connection-line"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setSelectedElement(null);
                        setSelectedConnection(conn.id);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Add control point at click location
                        const canvasRect = canvasRef.current?.getBoundingClientRect();
                        if (!canvasRect) return;
                        const x = e.clientX - canvasRect.left;
                        const y = e.clientY - canvasRect.top;
                        const newCPs = [...(conn.controlPoints || []), { x, y }];
                        setConnections(connections.map(c =>
                          c.id === conn.id ? { ...c, controlPoints: newCPs } : c
                        ));
                        setSelectedConnection(conn.id);
                      }}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Control points on connections - draggable circles */}
            {connections.map((conn) => {
              if (!conn.controlPoints || conn.controlPoints.length === 0) return null;
              
              return conn.controlPoints.map((cp, idx) => {
                const isDragging = draggingControlPoint?.connectionId === conn.id && draggingControlPoint?.pointIndex === idx;
                const size = isDragging ? 10 : 6;
                
                return (
                  <div
                    key={`cp-${conn.id}-${idx}`}
                    style={{
                      position: 'absolute',
                      left: `${cp.x - size}px`,
                      top: `${cp.y - size}px`,
                      width: `${size * 2}px`,
                      height: `${size * 2}px`,
                      borderRadius: '50%',
                      backgroundColor: '#f59e0b',
                      border: `2px solid #d97706`,
                      cursor: 'grab',
                      zIndex: 900,
                      pointerEvents: 'auto',
                      transition: 'all 0.2s ease',
                      display: isDragging || selectedConnection === conn.id ? 'block' : 'none'
                    }}
                    title={`Control point ${idx + 1} - Drag to move, Alt+Click to delete`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      
                      if (e.altKey) {
                        // Delete control point
                        const newCPs = conn.controlPoints.filter((_, i) => i !== idx);
                        setConnections(connections.map(c =>
                          c.id === conn.id
                            ? { ...c, controlPoints: newCPs }
                            : c
                        ));
                        return;
                      }
                      
                      // Start dragging
                      setDraggingControlPoint({
                        connectionId: conn.id,
                        pointIndex: idx,
                        startX: e.clientX,
                        startY: e.clientY
                      });
                      setSelectedConnection(conn.id);
                    }}
                  />
                );
              });
            })}
          </div>

        {/* Right Properties Panel */}
        <div className="uml-properties">
          <h3>Properties</h3>
          {selectedElement ? (() => {
            const el = elements.find(e => e.id === selectedElement);
            if (!el) return null;
            
            return (
              <div className="properties-panel">
                <label>Element Name:</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setElements(elements.map(elem => 
                        elem.id === selectedElement ? { ...elem, name: editName } : elem
                      ));
                    }
                  }}
                />
                <button className="btn-primary" onClick={() => {
                  setElements(elements.map(elem => 
                    elem.id === selectedElement ? { ...elem, name: editName } : elem
                  ));
                }}>
                  Update
                </button>

                {el.type === 'CLASS' && (
                  <div className="property-section">
                    <div className="property-section-header">
                      <label>Attributes:</label>
                      <button 
                        className="btn-add"
                        onClick={() => {
                          setElements(elements.map(elem => 
                            elem.id === selectedElement 
                              ? { ...elem, attributes: [...(el.attributes || []), '-newAttr: Type'] }
                              : elem
                          ));
                        }}
                      >
                        + Add
                      </button>
                    </div>
                    {(el?.attributes || []).map((attr, idx) => (
                      <div key={idx} className="property-list-item">
                        <input
                          type="text"
                          value={attr}
                          onChange={(e) => {
                            const newAttrs = [...el.attributes];
                            newAttrs[idx] = e.target.value;
                            setElements(elements.map(elem => 
                              elem.id === selectedElement 
                                ? { ...elem, attributes: newAttrs }
                                : elem
                            ));
                          }}
                        />
                        <button 
                          className="btn-danger"
                          onClick={() => {
                            const newAttrs = el.attributes.filter((_, i) => i !== idx);
                            setElements(elements.map(elem => 
                              elem.id === selectedElement 
                                ? { ...elem, attributes: newAttrs }
                                : elem
                            ));
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {el.type === 'CLASS' && (
                  <div className="property-section">
                    <div className="property-section-header">
                      <label>Methods:</label>
                      <button 
                        className="btn-add"
                        onClick={() => {
                          setElements(elements.map(elem => 
                            elem.id === selectedElement 
                              ? { ...elem, methods: [...(el.methods || []), '+newMethod(): void'] }
                              : elem
                          ));
                        }}
                      >
                        + Add
                      </button>
                    </div>
                    {(el?.methods || []).map((method, idx) => (
                      <div key={idx} className="property-list-item">
                        <input
                          type="text"
                          value={method}
                          onChange={(e) => {
                            const newMethods = [...el.methods];
                            newMethods[idx] = e.target.value;
                            setElements(elements.map(elem => 
                              elem.id === selectedElement 
                                ? { ...elem, methods: newMethods }
                                : elem
                            ));
                          }}
                        />
                        <button 
                          className="btn-danger"
                          onClick={() => {
                            const newMethods = el.methods.filter((_, i) => i !== idx);
                            setElements(elements.map(elem => 
                              elem.id === selectedElement 
                                ? { ...elem, methods: newMethods }
                                : elem
                            ));
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <button 
                  className="btn-danger" 
                  style={{ marginTop: '16px', width: '100%' }}
                  onClick={() => handleDeleteElement(selectedElement)}
                >
                  🗑️ Delete Element
                </button>
              </div>
            );
          })() : (
            <div className="diagram-info">
              <p><strong>Select an element</strong> to edit</p>
            </div>
          )}

          {/* Connections List - Always visible */}
          <h3 style={{ marginTop: '20px' }}>All Connections</h3>
          <div className="connections-list">
            {connections.length === 0 ? (
              <p style={{ color: '#999', fontSize: '13px' }}>No connections yet</p>
            ) : (
              connections.map(conn => {
                const fromEl = elements.find(e => e.id === conn.from);
                const toEl = elements.find(e => e.id === conn.to);
                return (
                  <div key={conn.id} className="connection-item">
                    <span>{fromEl?.name} → {toEl?.name}</span>
                    <small>{conn.type}</small>
                    <button
                      onClick={() => setConnections(connections.filter(c => c.id !== conn.id))}
                      title="Delete connection"
                    >
                      ×
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
        </div>
      </div>
      </>
    );
}

export default ClassDiagramEditor;
