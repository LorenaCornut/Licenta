import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../UMLEditor.css';

// ============ ROUTING HELPER FUNCTIONS ============

/**
 * Get bounding box of an OBJECT element
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

// ============ EDGE AND OFFSET HELPERS ============

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
  
  let offset = 0;
  if (closest.edge === 'top' || closest.edge === 'bottom') {
    offset = (closest.x - element.x);
  } else {
    offset = (closest.y - element.y);
  }
  
  return { edge: closest.edge, offset };
}

function getPointAtOffsetOnEdge(element, edgeType, offset) {
  offset = Math.max(0, Math.min(1, offset));
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

// ============ END EDGE AND OFFSET HELPERS ============

function ObjectDiagramEditor() {
  const { diagramId } = useParams();
  const navigate = useNavigate();

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  };
  
  // OBJECT diagram elements
  const OBJECT_ELEMENTS = {
    OBJECT: { label: 'Object', icon: '●', color: '#e8d4f8', isNode: true },
    LINK_OBJECT: { label: 'Link Object', icon: '◊', color: '#f0e8d4', isNode: true },
    NOTE: { label: 'Note', icon: '📝', color: '#fffacd', isNode: true },
    LINK: { label: 'Link', icon: '─', color: '#f3e8ff', isConnection: true }
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
  const [draggingElement, setDraggingElement] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState(null);
  const [connectionMode, setConnectionMode] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [draggedType, setDraggedType] = useState(null);
  const [draggingInCanvas, setDraggingInCanvas] = useState(false);
  const [draggingControlPoint, setDraggingControlPoint] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [draggingEndpoint, setDraggingEndpoint] = useState(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const endpointDragRef = useRef(null);
  const [currentDiagramId, setCurrentDiagramId] = useState(null);

  const elementsList = OBJECT_ELEMENTS;

  useEffect(() => {
    if (diagramId && diagramId !== 'new') {
      loadDiagram(diagramId);
    } else {
      setCurrentDiagramId(null);
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
        if (editingMember) handleSaveMember(false);
        setEditingElement(null);
        setEditingMember(null);
        setEditMemberValue('');
        setDraggingElement(null);
        setConnectionMode(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [elements, selectedElement, editingMember]);

  const loadDiagram = async (id) => {
  setIsLoading(true);
  try {
    const apiUrl = process.env.REACT_APP_API_URL || '/api';
    // <-- ADAUGAT headers
    const response = await fetch(`${apiUrl}/object-diagrams/${id}`, {
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
      setTitle(result.diagram.title || 'Untitled Diagram');
      setElements(result.diagram.data.elements || []);
      setConnections(result.diagram.data.connections || []);
      setCurrentDiagramId(result.diagram.id);
      sessionStorage.setItem('currentDiagramId', result.diagram.id);
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
    if (!el || (el.type !== 'OBJECT' && el.type !== 'LINK_OBJECT')) return;
    if (editingMember) handleSaveMember(false);
    
    // Object diagram attributes format: "name = value" - empty at start
    const newAttrs = [...(el.attributes || []), ''];
    const newIndex = newAttrs.length - 1;
    
    setElements(elements.map(elem => 
      elem.id === elementId ? { ...elem, attributes: newAttrs } : elem
    ));
    setEditingMember({ elementId, type: 'attribute', index: newIndex });
    setEditMemberValue('');
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
    
    if (type === 'attribute') {
      if (currentEl.type !== 'OBJECT' && currentEl.type !== 'LINK_OBJECT') return;
      const newAttrs = [...(currentEl.attributes || [])];
      if (editMemberValue.trim()) {
        newAttrs[index] = editMemberValue;
        if (addNext) {
          newAttrs.push('');
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
        setEditMemberValue('');
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
        console.log(`✓ Link START on ${el.name} at ${clickedPoint.point} edge`);
      } else if (connectionStart.elementId !== el.id) {
        // Second click on different element - CREATE CONNECTION
        const newConn = {
          id: `conn_${Date.now()}`,
          from: connectionStart.elementId,
          fromEdge: connectionStart.point.point,
          fromOffset: connectionStart.point.offset / (connectionStart.point.point === 'top' || connectionStart.point.point === 'bottom' 
            ? elements.find(el => el.id === connectionStart.elementId).width 
            : elements.find(el => el.id === connectionStart.elementId).height),
          to: el.id,
          toEdge: clickedPoint.point,
          toOffset: clickedPoint.offset / (clickedPoint.point === 'top' || clickedPoint.point === 'bottom' 
            ? el.width 
            : el.height),
          type: connectionMode,
          controlPoints: []
        };
        setConnections([...connections, newConn]);
        console.log(`✓ Link CREATED from ${connectionStart.elementId} to ${el.id}`);
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
    if (editingMember) handleSaveMember(false);
    setSelectedElement(el.id);
    setSelectedConnection(null);
    setEditingElement(null);
    setEditingMember(null);
    setEditMemberValue('');
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
        return;
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

      if (hasCollisionWithOthers(elementId, Math.max(0, newX), Math.max(0, newY), newWidth, newHeight)) {
        return;
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

  const handleConnectionLineClick = (e, connId) => {
    e.stopPropagation();
    if (editingMember) handleSaveMember(false);
    setSelectedElement(null);
    setEditingElement(null);
    setEditingMember(null);
    setEditMemberValue('');
    setSelectedConnection(connId);
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
    const element = elements.find(el => el.id === elementId);
    if (!element) return;
    
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const pointX = e.clientX - canvasRect.left;
    const pointY = e.clientY - canvasRect.top;
    
    const closest = getClosestPointOnContour(element, pointX, pointY);
    
    setConnections(connections.map(c => {
      if (c.id === connId) {
        if (endpointType === 'from') {
          return { ...c, fromEdge: closest.edge, fromOffset: closest.offset / (closest.edge === 'top' || closest.edge === 'bottom' ? element.width : element.height) };
        } else {
          return { ...c, toEdge: closest.edge, toOffset: closest.offset / (closest.edge === 'top' || closest.edge === 'bottom' ? element.width : element.height) };
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

  const handleCanvasClick = () => {
    if (editingMember) handleSaveMember(false);
    setSelectedElement(null);
    setSelectedConnection(null);
    setEditingElement(null);
    setEditingMember(null);
    setEditMemberValue('');
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

    const newId = `${elementType}-${Date.now()}`;

    const newElement = {
      id: newId,
      type: elementType,
      name: 'object : ClassName',
      x,
      y,
      width: width,
      height: height,
      attributes: []
    };

    setElements([...elements, newElement]);
    setDraggedType(null);
  };

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

  const prepareDiagramForSave = () => {
    return connections.map(conn => {
      return {
        ...conn,
        waypoints: conn.controlPoints || conn.waypoints || []
      };
    });
  };

  const saveDiagram = async ({ diagramTitle, diagramIdToUpdate = null }) => {
  // <-- ADAUGAT: Verifică token-ul
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
    const diagramData = {
      diagram: {
        selectedType: 'OBJECT',
        elements: elements,
        connections: prepareDiagramForSave()
      }
    };

    let response;

    if (diagramIdToUpdate) {
      // UPDATE existing diagram
      response = await fetch(`${apiUrl}/object-diagrams/${diagramIdToUpdate}`, {
        method: 'PUT',
        headers: getAuthHeaders(),  // <-- SCHIMBAT
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
      // CREATE new diagram
      const newDiagramData = {
        title: diagramTitle,
        userId: parseInt(userId),
        ...diagramData
      };

      response = await fetch(`${apiUrl}/object-diagrams`, {
        method: 'POST',
        headers: getAuthHeaders(),  // <-- SCHIMBAT
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

    return { ok: true, diagramId: persistedId };
  } catch (error) {
    console.error('Error saving diagram:', error);
    return { ok: false, message: `Eroare la salvare: ${error.message}` };
  }
};

  const handleSaveToDatabase = async () => {
  // <-- ADAUGAT: Verifică token-ul
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
      alert('Diagrama a fost salvată cu succes!');
    } else {
      alert(result.message || 'Eroare la salvare!');
    }
    return;
  }
  
  // New diagram - ask for title
  const diagramTitle = prompt('Introdu numele diagramei:', title || 'UML Object Diagram');
  if (!diagramTitle) return;

  const userId = localStorage.getItem('userId');
  if (!userId) {
    alert('Trebuie să fii logat pentru a salva diagrama!');
    navigate('/login');
    return;
  }

  const result = await saveDiagram({ diagramTitle });

  if (result.ok) {
    alert(`Diagrama "${diagramTitle}" a fost salvată cu succes!`);
  } else {
    alert(result.message || 'Eroare la salvare!');
  }
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
    svg += `<defs></defs>\n`;

    // Render connections - simple lines, NO markers
    connections.forEach(conn => {
      const fromEl = elements.find(el => el.id === conn.from);
      const toEl = elements.find(el => el.id === conn.to);
      if (!fromEl || !toEl) return;

      let fromX, fromY, toX, toY, targetEdge;
      
      if (conn.fromEdge && conn.toEdge) {
        const fromPt = getPointAtOffsetOnEdge(fromEl, conn.fromEdge, conn.fromOffset);
        const toPt = getPointAtOffsetOnEdge(toEl, conn.toEdge, conn.toOffset);
        fromX = fromPt.x;
        fromY = fromPt.y;
        toX = toPt.x;
        toY = toPt.y;
        targetEdge = conn.toEdge;
      } else if (conn.fromPoint && conn.toPoint) {
        const fromPt = getConnectionPointForElement(fromEl, conn.fromPoint);
        const toPt = getConnectionPointForElement(toEl, conn.toPoint);
        fromX = fromPt.x;
        fromY = fromPt.y;
        toX = toPt.x;
        toY = toPt.y;
        targetEdge = conn.toPoint.point;
      } else {
        fromX = fromEl.x + (fromEl.width || 200) / 2;
        fromY = fromEl.y + (fromEl.height || 140) / 2;
        toX = toEl.x + (toEl.width || 200) / 2;
        toY = toEl.y + (toEl.height || 140) / 2;
      }

      let waypoints;
      if (conn.controlPoints && conn.controlPoints.length > 0) {
        waypoints = [{ x: fromX, y: fromY }, ...conn.controlPoints, { x: toX, y: toY }];
      } else {
        waypoints = findPathAroundObstacles(
          fromX, fromY, toX, toY,
          elements,
          [conn.from, conn.to],
          targetEdge
        );
      }

      const pathD = buildOrthogonalPathThroughWaypoints(waypoints);
      // Simple link - NO marker
      svg += `<path d='${pathD}' fill='none' stroke='#8b4513' stroke-width='2'/>\n`;
    });

    // Render objects
    elements.forEach(el => {
      const w = el.width || 200;
      const h = el.height || 140;
      const x = el.x;
      const y = el.y;
      
      if (el.type === 'OBJECT') {
        const headerHeight = 50;
        
        // Box
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='6' fill='#e8d4f8' stroke='#8b4513' stroke-width='2'/>\n`;
        
        // Header with underlined object name
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${headerHeight}' fill='#f0e6fa' stroke='#8b4513' stroke-width='1'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + headerHeight / 2 + 6}' font-size='14' font-family='monospace' font-weight='bold' text-anchor='middle' text-decoration='underline' fill='#222'>${escapeXML(el.name)}</text>\n`;
        
        // Line under header
        svg += `<line x1='${x}' y1='${y + headerHeight}' x2='${x + w}' y2='${y + headerHeight}' stroke='#8b4513' stroke-width='1'/>\n`;
        
        // Attributes section - ONLY attributes, no methods
        const attrCount = el.attributes ? el.attributes.length : 0;
        const availableHeight = h - headerHeight;
        
        if (el.attributes && el.attributes.length) {
          const itemHeight = availableHeight / attrCount;
          el.attributes.forEach((attr, i) => {
            const textY = y + headerHeight + itemHeight * i + itemHeight / 2 + 4;
            svg += `<text x='${x + 8}' y='${textY}' font-size='12' font-family='monospace' fill='#222'>${escapeXML(attr)}</text>\n`;
          });
        }
      } else if (el.type === 'LINK_OBJECT') {
        // Link Object - underlined object name + attributes (same as OBJECT)
        const headerHeight = 50;
        
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='6' fill='#f0e8d4' stroke='#8b4513' stroke-width='2'/>\n`;
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${headerHeight}' fill='#fff5e6' stroke='#8b4513' stroke-width='1'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + headerHeight / 2 + 6}' font-size='14' font-family='monospace' font-weight='bold' text-anchor='middle' text-decoration='underline' fill='#222'>${escapeXML(el.name)}</text>\n`;
        
        svg += `<line x1='${x}' y1='${y + headerHeight}' x2='${x + w}' y2='${y + headerHeight}' stroke='#8b4513' stroke-width='1'/>\n`;
        
        const attrCount = el.attributes ? el.attributes.length : 0;
        const availableHeight = h - headerHeight;
        
        if (el.attributes && el.attributes.length) {
          const itemHeight = availableHeight / attrCount;
          el.attributes.forEach((attr, i) => {
            const textY = y + headerHeight + itemHeight * i + itemHeight / 2 + 4;
            svg += `<text x='${x + 8}' y='${textY}' font-size='12' font-family='monospace' fill='#222'>${escapeXML(attr)}</text>\n`;
          });
        }
      } else if (el.type === 'NOTE') {
        // Note - rectangle with dog-ear corner (right-top)
        const dogEarSize = 15;
        
        // Main rectangle
        svg += `<rect x='${x}' y='${y}' width='${w - dogEarSize}' height='${h - dogEarSize}' fill='#fffacd' stroke='#8b4513' stroke-width='2'/>\n`;
        
        // Dog-ear (folded corner)
        svg += `<polygon points='${x + w - dogEarSize},${y} ${x + w},${y} ${x + w - dogEarSize},${y + dogEarSize}' fill='#fff8dc' stroke='#8b4513' stroke-width='1'/>\n`;
        svg += `<line x1='${x + w - dogEarSize}' y1='${y + dogEarSize}' x2='${x + w}' y2='${y + dogEarSize}' stroke='#8b4513' stroke-width='1'/>\n`;
        
        // Text content
        const lines = (el.name || '').split('\n');
        lines.forEach((line, i) => {
          const textY = y + 15 + i * 15;
          svg += `<text x='${x + 8}' y='${textY}' font-size='12' font-family='monospace' fill='#222'>${escapeXML(line)}</text>\n`;
        });
      } else {
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='4' fill='${OBJECT_ELEMENTS[el.type].color}' stroke='#8b4513' stroke-width='2'/>\n`;
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

  const handleSaveJSON = () => {
    const data = JSON.stringify({ selectedType: 'OBJECT', elements, connections }, null, 2);
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
  
  // <-- Verifică token-ul
  const token = localStorage.getItem('token');
  if (!token) {
    alert('Trebuie să fii autentificat pentru a importa o diagramă!');
    navigate('/login');
    return;
  }
  
  const fileName = file.name.replace(/\.json$/i, '');
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      
      if (data.elements && Array.isArray(data.elements)) {
        setElements(data.elements);
      }
      if (data.connections && Array.isArray(data.connections)) {
        setConnections(data.connections);
      }
      
      setTitle(fileName || 'Imported Diagram');
      
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
            <button className="btn-primary" onClick={handleSaveToDatabase}>Salvare</button>
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
              🔗 Link mode
              {connectionStart 
                ? ` - START point selected • Click on element to complete`
                : ' - Click on first object'}
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
              <p><strong>Objects:</strong> {elements.length}</p>
              <p><strong>Links:</strong> {connections.length}</p>
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
              const isObjectType = el.type === 'OBJECT' || el.type === 'LINK_OBJECT';
              const isNoteType = el.type === 'NOTE';
              return (
                <div
                  key={el.id}
                  data-element-id={el.id}
                  className={`uml-element ${isObjectType ? 'uml-object-element' : ''} ${isNoteType ? 'uml-note-element' : ''} ${selectedElement === el.id ? 'selected' : ''} ${draggingElement === el.id ? 'moving' : ''} ${connectionMode && (!connectionStart || connectionStart.elementId !== el.id) ? 'connection-available' : ''}`}
                  style={{
                    position: 'absolute',
                    left: `${el.x}px`,
                    top: `${el.y}px`,
                    width: `${el.width}px`,
                    height: `${el.height}px`,
                    overflow: isObjectType ? 'visible' : 'hidden',
                    boxSizing: 'border-box',
                    padding: '0',
                    margin: '0',
                    display: 'flex',
                    alignItems: isObjectType ? 'stretch' : (isNoteType ? 'flex-start' : 'center'),
                    justifyContent: isObjectType ? 'stretch' : 'center'
                  }}
                  onClick={(e) => handleElementClick(e, el)}
                  onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                  onMouseDown={(e) => handleElementMouseDown(e, el)}
                >
                  {isObjectType ? (
                    <div 
                      className="uml-object-box"
                      style={{
                        minHeight: el.height || (() => {
                          const headerHeight = 50;
                          const itemBaseHeight = 20;
                          const attrItemsHeight = Math.max(1, el.attributes?.length || 0) * itemBaseHeight;
                          return headerHeight + attrItemsHeight;
                        })(),
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        margin: '0',
                        padding: '0',
                        boxSizing: 'border-box',
                        backgroundColor: el.type === 'LINK_OBJECT' ? '#f0e8d4' : '#e8d4f8',
                        borderColor: '#8b4513',
                        borderWidth: '2px',
                        borderRadius: '6px'
                      }}
                    >
                      <div className="uml-object-header">
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
                            className="uml-object-name-input"
                            onClick={(e) => e.stopPropagation()}
                            style={{ textDecoration: 'underline' }}
                          />
                        ) : (
                          <div className="uml-object-name" style={{ textDecoration: 'underline' }}>{el.name}</div>
                        )}
                      </div>
                      {(el.type === 'OBJECT' || el.type === 'LINK_OBJECT') && (
                        <div 
                          className="uml-object-section uml-attributes"
                          style={{
                            flex: 1,
                            minHeight: '30px',
                            maxHeight: `${Math.max(50, (el.height || 140) - 50)}px`,
                            overflowY: 'auto',
                            overflowX: 'hidden',
                            paddingRight: '4px'
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
                    </div>
                  ) : isNoteType ? (
                    <div 
                      style={{
                        position: 'relative',
                        width: '100%',
                        height: '100%',
                        backgroundColor: '#fffacd',
                        border: '2px solid #8b4513',
                        padding: '8px',
                        boxSizing: 'border-box',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        wordWrap: 'break-word',
                        overflow: 'auto'
                      }}
                    >
                      {/* Dog-ear corner in top-right */}
                      <div
                        style={{
                          position: 'absolute',
                          top: 0,
                          right: 0,
                          width: '15px',
                          height: '15px',
                          backgroundColor: '#fff8dc',
                          borderLeft: '1px solid #8b4513',
                          borderBottom: '1px solid #8b4513'
                        }}
                      />
                      
                      {editingElement === el.id ? (
                        <textarea
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') { handleSaveName(); }
                          }}
                          onBlur={handleSaveName}
                          autoFocus
                          className="inline-edit"
                          onClick={(e) => e.stopPropagation()}
                          style={{ 
                            width: '100%',
                            height: '100%',
                            border: 'none',
                            outline: 'none',
                            backgroundColor: 'transparent',
                            fontFamily: 'monospace',
                            fontSize: '12px',
                            padding: '0'
                          }}
                        />
                      ) : (
                        <p style={{ margin: '0', whiteSpace: 'pre-wrap' }}>{el.name}</p>
                      )}
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

            {/* Connections SVG layer */}
            <svg
              className="connections-layer"
              width="100%"
              height="100%"
              style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'auto' }}
            >
              <defs></defs>
              {connections.map((conn) => {
                const fromEl = elements.find(el => el.id === conn.from);
                const toEl = elements.find(el => el.id === conn.to);
                if (!fromEl || !toEl) return null;

                let fromX, fromY, toX, toY, targetEdge;
                
                if (conn.fromEdge && conn.toEdge) {
                  const fromPt = getPointAtOffsetOnEdge(fromEl, conn.fromEdge, conn.fromOffset);
                  const toPt = getPointAtOffsetOnEdge(toEl, conn.toEdge, conn.toOffset);
                  fromX = fromPt.x;
                  fromY = fromPt.y;
                  toX = toPt.x;
                  toY = toPt.y;
                  targetEdge = conn.toEdge;
                } else if (conn.fromPoint && conn.toPoint) {
                  const fromPt = getConnectionPointForElement(fromEl, conn.fromPoint);
                  const toPt = getConnectionPointForElement(toEl, conn.toPoint);
                  fromX = fromPt.x;
                  fromY = fromPt.y;
                  toX = toPt.x;
                  toY = toPt.y;
                  targetEdge = conn.toPoint.point;
                } else {
                  fromX = fromEl.x + (fromEl.width || 200) / 2;
                  fromY = fromEl.y + (fromEl.height || 140) / 2;
                  toX = toEl.x + (toEl.width || 200) / 2;
                  toY = toEl.y + (toEl.height || 140) / 2;
                }
                
                let waypoints;
                if (conn.controlPoints && conn.controlPoints.length > 0) {
                  waypoints = [{ x: fromX, y: fromY }, ...conn.controlPoints, { x: toX, y: toY }];
                } else {
                  waypoints = findPathAroundObstacles(
                    fromX, fromY, toX, toY,
                    elements,
                    [conn.from, conn.to],
                    targetEdge
                  );
                }

                const pathD = buildOrthogonalPathThroughWaypoints(waypoints);

                return (
                  <g key={conn.id}>
                    {/* Background highlight when selected */}
                    {selectedConnection === conn.id && (
                      <path
                        d={pathD}
                        fill="none"
                        stroke="#ec4899"
                        strokeWidth="5"
                        pointerEvents="none"
                        opacity="0.5"
                      />
                    )}
                    
                    <path
                      d={pathD}
                      fill="none"
                      stroke={selectedConnection === conn.id ? '#ec4899' : '#8b4513'}
                      strokeWidth={selectedConnection === conn.id ? '3' : '2'}
                      className="connection-line"
                      style={{ cursor: 'pointer', transition: 'stroke 0.2s ease' }}
                      onClick={(e) => handleConnectionLineClick(e, conn.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
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
                      title="Click to select, Right-click to add control point"
                    />
                    {/* Draggable endpoint circles - ONLY SHOW WHEN SELECTED */}
                    {selectedConnection === conn.id && (
                      <>
                        {/* FROM endpoint */}
                        <circle
                          cx={fromX}
                          cy={fromY}
                          r="12"
                          fill="transparent"
                          pointerEvents="auto"
                          cursor="grab"
                          onMouseDown={(e) => handleEndpointMouseDown(e, conn.id, 'from')}
                        />
                        <circle
                          cx={fromX}
                          cy={fromY}
                          r="8"
                          fill="#0ea5e9"
                          stroke="#fff"
                          strokeWidth="2"
                          opacity="0.9"
                          pointerEvents="none"
                          style={{ transition: 'r 0.2s' }}
                        />
                        {/* TO endpoint */}
                        <circle
                          cx={toX}
                          cy={toY}
                          r="12"
                          fill="transparent"
                          pointerEvents="auto"
                          cursor="grab"
                          onMouseDown={(e) => handleEndpointMouseDown(e, conn.id, 'to')}
                        />
                        <circle
                          cx={toX}
                          cy={toY}
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

            {/* Control points on connections */}
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
                        const newCPs = conn.controlPoints.filter((_, i) => i !== idx);
                        setConnections(connections.map(c =>
                          c.id === conn.id
                            ? { ...c, controlPoints: newCPs }
                            : c
                        ));
                        return;
                      }
                      
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
                <label>Object Name:</label>
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
                  placeholder="objectName : ClassName"
                />
                <button className="btn-primary" onClick={() => {
                  setElements(elements.map(elem => 
                    elem.id === selectedElement ? { ...elem, name: editName } : elem
                  ));
                }}>
                  Update
                </button>

                {(el.type === 'OBJECT' || el.type === 'LINK_OBJECT') && (
                  <div className="property-section">
                    <div className="property-section-header">
                      <label>Attributes:</label>
                      <button 
                        className="btn-add"
                        onClick={() => {
                          const newAttrs = [...(el.attributes || []), ''];
                          const newIndex = newAttrs.length - 1;
                          
                          setElements(elements.map(elem => 
                            elem.id === selectedElement 
                              ? { ...elem, attributes: newAttrs }
                              : elem
                          ));
                          setEditingMember({ elementId: selectedElement, type: 'attribute', index: newIndex });
                          setEditMemberValue('');
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
                          placeholder="name = value"
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

                <button 
                  className="btn-danger" 
                  style={{ marginTop: '16px', width: '100%' }}
                  onClick={() => handleDeleteElement(selectedElement)}
                >
                  🗑️ Delete Element
                </button>
              </div>
            );
          })() : selectedConnection ? (() => {
            const conn = connections.find(c => c.id === selectedConnection);
            const fromEl = elements.find(e => e.id === conn?.from);
            const toEl = elements.find(e => e.id === conn?.to);
            
            if (!conn) return null;
            
            return (
              <div className="properties-panel">
                <h4 style={{ color: '#f59e0b', marginBottom: '10px' }}>Link Selected</h4>
                <p><strong>From:</strong> {fromEl?.name}</p>
                <p><strong>To:</strong> {toEl?.name}</p>
                <p><strong>Control Points:</strong> {conn.controlPoints?.length || 0}</p>
                
                <div style={{ 
                  backgroundColor: '#fffacd', 
                  padding: '10px', 
                  borderRadius: '4px',
                  fontSize: '13px',
                  marginTop: '15px',
                  border: '1px solid #ddd'
                }}>
                  <p><strong>💡 Tips:</strong></p>
                  <ul style={{ margin: '5px 0', paddingLeft: '20px' }}>
                    <li>Right-click on line to add control point</li>
                    <li>Drag orange circles to adjust path</li>
                    <li>Alt+Click to delete control point</li>
                  </ul>
                </div>
                
                <button 
                  className="btn-danger"
                  onClick={() => {
                    setConnections(connections.filter(c => c.id !== conn.id));
                    setSelectedConnection(null);
                  }}
                  style={{ marginTop: '15px', width: '100%' }}
                >
                  Delete Link
                </button>
              </div>
            );
          })() : (
            <div className="diagram-info">
              <p><strong>Select an object or link</strong> to edit</p>
            </div>
          )}

          {/* Connections List */}
          <h3 style={{ marginTop: '20px' }}>All Links</h3>
          <div className="connections-list">
            {connections.length === 0 ? (
              <p style={{ color: '#999', fontSize: '13px' }}>No links yet</p>
            ) : (
              connections.map(conn => {
                const fromEl = elements.find(e => e.id === conn.from);
                const toEl = elements.find(e => e.id === conn.to);
                return (
                  <div 
                    key={conn.id} 
                    className="connection-item"
                    onClick={() => setSelectedConnection(selectedConnection === conn.id ? null : conn.id)}
                    style={{ 
                      cursor: 'pointer',
                      backgroundColor: selectedConnection === conn.id ? '#ede9fe' : '#f9fafb',
                      border: selectedConnection === conn.id ? '1px solid #c084fc' : '1px solid #d1d5db'
                    }}
                  >
                    <span>{fromEl?.name} → {toEl?.name}</span>
                    <small>{conn.type}</small>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConnections(connections.filter(c => c.id !== conn.id));
                        setSelectedConnection(null);
                      }}
                      title="Delete link"
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

export default ObjectDiagramEditor;
