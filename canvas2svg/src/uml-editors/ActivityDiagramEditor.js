import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../UMLEditor.css';

// ============ ORTHOGONAL ROUTING FUNCTIONS ============

/**
 * Get bounding box of an element, accounting for rotation
 */
function getElementBounds(el) {
  // For rotated swimlanes and fork/join bars, return the visual bounding box
  if ((el.type === 'SWIMLANE' || el.type === 'FORK_JOIN_BAR') && el.rotation) {
    const rotation = (el.rotation % 360 + 360) % 360;
    if (rotation === 90 || rotation === 270) {
      // Swapped dimensions when rotated 90 or 270 degrees
      return {
        x: el.x - (el.height - el.width) / 2,
        y: el.y - (el.width - el.height) / 2,
        width: el.height,
        height: el.width
      };
    }
  }
  return {
    x: el.x,
    y: el.y,
    width: el.width || 100,
    height: el.height || 100
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
 * Find path around obstacles with orthogonal routing
 */
function findPathAroundObstacles(x1, y1, x2, y2, elements, excludeIds = []) {
  const path = [{ x: x1, y: y1 }];
  
  const obstacles = elements
    .filter(el => !excludeIds.includes(el.id) && el.type !== 'SWIMLANE')
    .map(el => getElementBounds(el));

  let directPathClear = true;
  for (const obstacle of obstacles) {
    if (lineIntersectsRect(x1, y1, x2, y2, obstacle)) {
      directPathClear = false;
      break;
    }
  }

  if (directPathClear) {
    // Direct path is clear - use Manhattan routing
    const midX = x1 + (x2 - x1) * 0.5;
    path.push({ x: midX, y: y1 });
    path.push({ x: midX, y: y2 });
    path.push({ x: x2, y: y2 });
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

  // Find closest obstacle and route around it
  const closestObstacle = blockingObstacles[0];
  const goAround = x1 < closestObstacle.x ? 'right' : 'left';

  if (goAround === 'right') {
    path.push({ x: closestObstacle.x + closestObstacle.width + 20, y: y1 });
    path.push({ x: closestObstacle.x + closestObstacle.width + 20, y: y2 });
  } else {
    path.push({ x: closestObstacle.x - 20, y: y1 });
    path.push({ x: closestObstacle.x - 20, y: y2 });
  }

  path.push({ x: x2, y: y2 });
  return path;
}

// ============ HELPER FUNCTIONS ============

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
    x = centerX;
    y = centerY;
  }
  
  return { x, y };
}

function getPointAtOffsetOnEdge(element, edgeType, offset) {
  offset = Math.max(0, Math.min(1, offset));
  
  // DECISION_NODE - exact interpolation along diamond edges
  if (element.type === 'DECISION_NODE') {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const diagonalSize = Math.sqrt(element.width * element.width + element.height * element.height);
    const halfDiag = diagonalSize / 2;
    
    // Diamond vertices (exact coordinates)
    const topVtx = { x: centerX, y: centerY - halfDiag };
    const rightVtx = { x: centerX + halfDiag, y: centerY };
    const bottomVtx = { x: centerX, y: centerY + halfDiag };
    const leftVtx = { x: centerX - halfDiag, y: centerY };
    
    let p1, p2;
    if (edgeType === 'top') {
      p1 = topVtx;
      p2 = rightVtx;
    } else if (edgeType === 'right') {
      p1 = rightVtx;
      p2 = bottomVtx;
    } else if (edgeType === 'bottom') {
      p1 = bottomVtx;
      p2 = leftVtx;
    } else if (edgeType === 'left') {
      p1 = leftVtx;
      p2 = topVtx;
    } else {
      return { x: centerX, y: centerY };
    }
    
    // Exact linear interpolation along the edge
    const x = p1.x + (p2.x - p1.x) * offset;
    const y = p1.y + (p2.y - p1.y) * offset;
    return { x, y };
  }
  
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
  
  // Apply rotation if element is rotated (for swimlanes, fork/join bars, etc.)
  if (element.rotation && (element.type === 'SWIMLANE' || element.type === 'FORK_JOIN_BAR')) {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const angle = (element.rotation * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    const dx = x - centerX;
    const dy = y - centerY;
    x = centerX + dx * cos - dy * sin;
    y = centerY + dx * sin + dy * cos;
  }
  
  return { x, y };
}

function getClosestPointOnContour(element, pointX, pointY) {
  // Special handling for DECISION_NODE - snap to the diamond vertices + edges
  if (element.type === 'DECISION_NODE') {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const diagonalSize = Math.sqrt(element.width * element.width + element.height * element.height);
    const halfDiag = diagonalSize / 2;
    
    // Diamond vertices (exact corners of the rotated square)
    const topVtx = { x: centerX, y: centerY - halfDiag };
    const rightVtx = { x: centerX + halfDiag, y: centerY };
    const bottomVtx = { x: centerX, y: centerY + halfDiag };
    const leftVtx = { x: centerX - halfDiag, y: centerY };
    
    // Helper: closest point on line segment
    const closestOnSegment = (p1, p2) => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return { x: p1.x, y: p1.y, t: 0 };
      
      let t = ((pointX - p1.x) * dx + (pointY - p1.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      
      return {
        x: p1.x + t * dx,
        y: p1.y + t * dy,
        t: t
      };
    };
    
    // Find closest point on diamond perimeter
    const edges = [
      { p1: topVtx, p2: rightVtx, edge: 'top' },
      { p1: rightVtx, p2: bottomVtx, edge: 'right' },
      { p1: bottomVtx, p2: leftVtx, edge: 'bottom' },
      { p1: leftVtx, p2: topVtx, edge: 'left' }
    ];
    
    let closest = null;
    let minDist = Infinity;
    
    for (const seg of edges) {
      const proj = closestOnSegment(seg.p1, seg.p2);
      const dist = Math.hypot(proj.x - pointX, proj.y - pointY);
      
      if (dist < minDist) {
        minDist = dist;
        closest = { edge: seg.edge, offset: proj.t };
      }
    }
    
    return closest || { edge: 'top', offset: 0.5 };
  }
  
  let workPointX = pointX;
  let workPointY = pointY;
  
  // If element is rotated, rotate point back into unrotated space
  if (element.rotation && (element.type === 'SWIMLANE' || element.type === 'FORK_JOIN_BAR')) {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const angle = (element.rotation * Math.PI) / 180;
    const cos = Math.cos(-angle);  // negative angle to inverse-rotate
    const sin = Math.sin(-angle);
    
    const dx = pointX - centerX;
    const dy = pointY - centerY;
    workPointX = centerX + dx * cos - dy * sin;
    workPointY = centerY + dx * sin + dy * cos;
  }
  
  const candidates = [
    { edge: 'top', x: Math.max(element.x, Math.min(workPointX, element.x + element.width)), y: element.y },
    { edge: 'bottom', x: Math.max(element.x, Math.min(workPointX, element.x + element.width)), y: element.y + element.height },
    { edge: 'left', x: element.x, y: Math.max(element.y, Math.min(workPointY, element.y + element.height)) },
    { edge: 'right', x: element.x + element.width, y: Math.max(element.y, Math.min(workPointY, element.y + element.height)) }
  ];
  
  let closest = candidates[0];
  let minDist = Math.hypot(closest.x - workPointX, closest.y - workPointY);
  
  for (let c of candidates) {
    const dist = Math.hypot(c.x - workPointX, c.y - workPointY);
    if (dist < minDist) {
      minDist = dist;
      closest = c;
    }
  }
  
  let offset = 0;
  if (closest.edge === 'top' || closest.edge === 'bottom') {
    offset = (closest.x - element.x) / element.width;
  } else {
    offset = (closest.y - element.y) / element.height;
  }
  
  // Ensure offset is in [0, 1] range
  offset = Math.max(0, Math.min(1, offset));
  
  return { edge: closest.edge, offset };
}

/**
 * Detect which edge a point is closest to on an element and return offset
 */
function detectEdgeAndOffset(element, pointX, pointY) {
  const result = getClosestPointOnContour(element, pointX, pointY);
  return result;
}

function checkElementCollision(newEl, existingElements, excludeId = null) {
  for (let el of existingElements) {
    if (excludeId && el.id === excludeId) continue;
    if (el.type === 'SWIMLANE') continue;
    
    const noCollision = 
      newEl.x + newEl.width < el.x ||
      el.x + el.width < newEl.x ||
      newEl.y + newEl.height < el.y ||
      el.y + el.height < newEl.y;
    
    if (!noCollision) {
      return el;
    }
  }
  return null;
}

// ============ END HELPER FUNCTIONS ============

// Element types for Activity Diagram
const ACTIVITY_ELEMENTS = {
  INITIAL_STATE: { label: 'Start (Initial)', icon: '●', isNode: true, width: 20, height: 20 },
  ACTION: { label: 'Action', icon: '◊', isNode: true, width: 140, height: 80 },
  DECISION_NODE: { label: 'Decision', icon: '◇', isNode: true, width: 100, height: 100 },
  FORK_JOIN_BAR: { label: 'Fork/Join Bar', icon: '═', isNode: true, width: 150, height: 12 },
  FINAL_STATE: { label: 'End (Final)', icon: '⊙', isNode: true, width: 20, height: 20 },
  FLOW_FINAL_NODE: { label: 'Flow Final', icon: '◯', isNode: true, width: 20, height: 20 },
  SWIMLANE: { label: 'Swimlane', icon: '◫', isNode: true, width: 300, height: 400 },
  CONTROL_FLOW: { label: 'Control Flow', icon: '→', isConnection: true },
  OBJECT_FLOW: { label: 'Object Flow', icon: '⇢', isConnection: true }
};

function ActivityDiagramEditor() {
  const navigate = useNavigate();
  const { diagramId } = useParams();
  const canvasRef = useRef(null);
  
  const [title, setTitle] = useState('Activity Diagram');
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
  const [currentDiagramId, setCurrentDiagramId] = useState(null);
  const endpointDragRef = useRef(null);

  useEffect(() => {
    if (diagramId && diagramId !== 'new') loadDiagram(diagramId);
    else setCurrentDiagramId(null);
  }, [diagramId]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingElement || !canvasRef.current) return;
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const newX = Math.max(0, e.clientX - canvasRect.left - dragOffset.x);
      const newY = Math.max(0, e.clientY - canvasRect.top - dragOffset.y);
      
      const draggingEl = elements.find(el => el.id === draggingElement);
      if (!draggingEl) return;

      const tentativeEl = { ...draggingEl, x: newX, y: newY };

      if (draggingEl.type !== 'SWIMLANE') {
        const collision = checkElementCollision(tentativeEl, elements, draggingElement);
        if (collision) return;
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
      const resizingEl = elements.find(el => el.id === elementId);
      if (!resizingEl) return;
      
      let deltaX = e.clientX - startX;
      let deltaY = e.clientY - startY;
      
      // For rotated swimlanes, rotate deltas back into unrotated space
      if (resizingEl.type === 'SWIMLANE' && resizingEl.rotation) {
        const angle = (resizingEl.rotation * Math.PI) / 180;
        const cos = Math.cos(-angle);  // negative angle to inverse-rotate
        const sin = Math.sin(-angle);
        
        const rotatedDeltaX = deltaX * cos - deltaY * sin;
        const rotatedDeltaY = deltaX * sin + deltaY * cos;
        
        deltaX = rotatedDeltaX;
        deltaY = rotatedDeltaY;
      }
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startElX;
      let newY = startElY;
      
      const minWidth = 20;
      const minHeight = 20;
      
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
      
      const tentativeEl = { ...resizingEl, width: newWidth, height: newHeight, x: Math.max(0, newX), y: Math.max(0, newY) };
      
      if (resizingEl.type !== 'SWIMLANE') {
        const collision = checkElementCollision(tentativeEl, elements, elementId);
        if (collision) return;
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
      const response = await fetch(`http://localhost:5000/api/class-diagrams/${id}`);
      const result = await response.json();
      console.log('Loaded diagram:', result);
      
      if (result.diagram?.data) {
        setTitle(result.diagram.title || 'Activity Diagram');
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

  const isClickOnSwimlaneContour = (e, el) => {
    if (el.type !== 'SWIMLANE') return true;
    
    const elementDOM = e.currentTarget;
    const elementRect = elementDOM.getBoundingClientRect();
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    
    if (!canvasRect) return true;
    
    const clickX = e.clientX - canvasRect.left;
    const clickY = e.clientY - canvasRect.top;
    
    const elementLeft = elementRect.left - canvasRect.left;
    const elementTop = elementRect.top - canvasRect.top;
    const elementRight = elementLeft + elementRect.width;
    const elementBottom = elementTop + elementRect.height;
    
    const borderWidth = 10; // Contour thickness (pixels from edge)
    
    // Check if click is on any border
    const onTop = clickY >= elementTop && clickY < elementTop + borderWidth && clickX >= elementLeft && clickX <= elementRight;
    const onBottom = clickY > elementBottom - borderWidth && clickY <= elementBottom && clickX >= elementLeft && clickX <= elementRight;
    const onLeft = clickX >= elementLeft && clickX < elementLeft + borderWidth && clickY >= elementTop && clickY <= elementBottom;
    const onRight = clickX > elementRight - borderWidth && clickX <= elementRight && clickY >= elementTop && clickY <= elementBottom;
    
    return onTop || onBottom || onLeft || onRight;
  };

  const handleElementClick = (e, el) => {
    e.stopPropagation();
    
    // For swimlanes, only process if clicking on the border
    if (el.type === 'SWIMLANE' && !isClickOnSwimlaneContour(e, el)) {
      return;
    }
    
    if (connectionMode) {
      const clickedPoint = detectConnectionPointOnContour(e, el);
      
      if (!connectionStart) {
        setConnectionStart({ elementId: el.id, point: clickedPoint });
      } else if (connectionStart.elementId !== el.id) {
        let label = ACTIVITY_ELEMENTS[connectionMode]?.label || 'Flow';
        
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
          condition: '',
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
    
    // For swimlanes, only allow editing from border
    if (el.type === 'SWIMLANE' && !isClickOnSwimlaneContour(e, el)) {
      return;
    }
    
    setEditingElement(el.id);
    setEditName(el.name);
  };

  const handleElementMouseDown = (e, el) => {
    if (connectionMode || editingElement === el.id || resizing) return;
    
    // For swimlanes, only allow dragging from border
    if (el.type === 'SWIMLANE' && !isClickOnSwimlaneContour(e, el)) {
      return;
    }
    
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
    
    const closest = getClosestPointOnContour(element, pointX, pointY);
    
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
    if (!draggingEndpoint) return;

    const handleMouseMove = (e) => {
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
      
      const closest = getClosestPointOnContour(element, pointX, pointY);
      
      setConnections(prevConnections =>
        prevConnections.map(c => {
          if (c.id === connId) {
            if (endpointType === 'from') {
              return { ...c, fromEdge: closest.edge, fromOffset: closest.offset };
            } else {
              return { ...c, toEdge: closest.edge, toOffset: closest.offset };
            }
          }
          return c;
        })
      );
    };

    const handleMouseUp = () => {
      setDraggingEndpoint(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingEndpoint, connections, elements, canvasRef]);

  const handleDeleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    setConnections(connections.filter(c => c.from !== id && c.to !== id));
    setSelectedElement(null);
  };

  const handleRotateElement = (id) => {
    setElements(elements.map(el => 
      el.id === id 
        ? { ...el, rotation: ((el.rotation || 0) + 90) % 360 }
        : el
    ));
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
    const elementDef = ACTIVITY_ELEMENTS[draggedType];
    const width = elementDef.width || 120;
    const height = elementDef.height || 80;
    const x = Math.max(0, e.clientX - canvasRect.left - width / 2);
    const y = Math.max(0, e.clientY - canvasRect.top - height / 2);

    const newId = `${draggedType}-${Date.now()}`;
    const newElement = {
      id: newId,
      type: draggedType,
      name: draggedType === 'SWIMLANE' ? 'Swimlane Name' : draggedType,
      x, y, width, height
    };

    setElements([...elements, newElement]);
    setDraggedType(null);
  };

  const handleSaveToDatabase = async () => {
    const diagramTitle = currentDiagramId
      ? title
      : prompt('Introdu numele diagramei:', title || 'Activity Diagram');
    
    if (!diagramTitle) return;

    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        alert('Trebuie să fii logat pentru a salva diagrama!');
        return;
      }

      const connectionsToSave = ensureConnectionOffsets(connections);

      const diagramData = {
        diagram: {
          selectedType: 'ACTIVITY',
          elements: elements,
          connections: connectionsToSave
        }
      };

      console.log('Saving diagram data:', diagramData);

      let response;
      let result;

      if (currentDiagramId) {
        response = await fetch(`http://localhost:5000/api/class-diagrams/${currentDiagramId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(diagramData)
        });
        result = await response.json();

        if (response.ok) {
          setTitle(diagramTitle);
          alert(`Diagrama "${diagramTitle}" a fost actualizată cu succes!`);
        }
      } else {
        const newDiagramData = {
          title: diagramTitle,
          userId: parseInt(userId),
          ...diagramData
        };

        response = await fetch('http://localhost:5000/api/class-diagrams', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newDiagramData)
        });
        result = await response.json();

        if (response.ok) {
          const newDiagramId = result.diagramId;
          if (newDiagramId) {
            setCurrentDiagramId(newDiagramId);
            sessionStorage.setItem('currentDiagramId', newDiagramId);
          }
          setTitle(diagramTitle);
          alert(`Diagrama "${diagramTitle}" a fost salvată cu succes! ID: ${newDiagramId}`);
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
    const allY = elements.map(el => [el.y, el.y + (el.height || 80)]).flat();
    
    const minX = Math.min(...allX, 0) - padding;
    const minY = Math.min(...allY, 0) - padding;
    const maxX = Math.max(...allX, 800) + padding;
    const maxY = Math.max(...allY, 600) + padding;
    const width = maxX - minX;
    const height = maxY - minY;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='${minX} ${minY} ${width} ${height}'>\n`;
    svg += `<defs><marker id='arrowControlFlow' markerWidth='14' markerHeight='14' refX='12' refY='7' orient='auto'><path d='M 0 0 L 14 7 L 0 14 Z' fill='#333' stroke='none'/></marker><marker id='arrowObjectFlow' markerWidth='14' markerHeight='14' refX='12' refY='7' orient='auto'><path d='M 0 0 L 14 7 L 0 14 Z' fill='#666' stroke='none'/></marker></defs>\n`;

    // Draw swimlanes first (borders only)
    elements.forEach((el) => {
      if (el.type === 'SWIMLANE') {
        svg += `<rect x='${el.x}' y='${el.y}' width='${el.width}' height='${el.height}' fill='none' stroke='#333' stroke-width='2' />\n`;
        
        // Draw swimlane label vertically on the left
        const labelX = el.x - 35;
        const labelY = el.y + el.height / 2;
        svg += `<g transform='translate(${labelX}, ${labelY}) rotate(-90)'>\n`;
        svg += `<text x='0' y='0' text-anchor='middle' dominant-baseline='middle' font-family='Arial' font-size='11' font-weight='700' fill='#666'>${escapeXML(el.name)}</text>\n`;
        svg += `</g>\n`;
      }
    });

    // Draw connections
    connections.forEach((conn) => {
      const fromEl = elements.find(e => e.id === conn.from);
      const toEl = elements.find(e => e.id === conn.to);
      if (!fromEl || !toEl) return;

      const fromOffset = typeof conn.fromOffset !== 'undefined' ? conn.fromOffset : 0.5;
      const toOffset = typeof conn.toOffset !== 'undefined' ? conn.toOffset : 0.5;
      const fromPoint = getPointAtOffsetOnEdge(fromEl, conn.fromEdge || 'bottom', fromOffset);
      const toPoint = getPointAtOffsetOnEdge(toEl, conn.toEdge || 'top', toOffset);
      
      const startX = fromPoint.x;
      const startY = fromPoint.y;
      const endX = toPoint.x;
      const endY = toPoint.y;

      let strokeDasharray = 'none';
      let marker = 'url(#arrowControlFlow)';
      let strokeWidth = '2';

      if (conn.type === 'OBJECT_FLOW') {
        strokeDasharray = '5,5';
        marker = 'url(#arrowObjectFlow)';
      }

      // Build orthogonal path (with 90-degree corners like in editor)
      let waypoints;
      if (conn.controlPoints && conn.controlPoints.length > 0) {
        waypoints = [{ x: startX, y: startY }, ...conn.controlPoints, { x: endX, y: endY }];
      } else {
        waypoints = findPathAroundObstacles(startX, startY, endX, endY, elements, [conn.from, conn.to]);
      }
      const pathD = buildOrthogonalPathThroughWaypoints(waypoints);

      svg += `<path d='${pathD}' stroke='#333' stroke-width='${strokeWidth}' stroke-dasharray='${strokeDasharray}' fill='none' marker-end='${marker}' stroke-linecap='round' stroke-linejoin='round' />\n`;
      
      if (conn.condition) {
        const midX = (startX + endX) / 2 + 10;
        const midY = (startY + endY) / 2 - 10;
        svg += `<text x='${midX}' y='${midY}' font-family='Arial' font-size='11' fill='#666'>[${escapeXML(conn.condition)}]</text>\n`;
      }
    });

    // Draw elements
    elements.forEach((el) => {
      const centerX = el.x + el.width / 2;
      const centerY = el.y + el.height / 2;
      
      if (el.type === 'INITIAL_STATE') {
        svg += `<circle cx='${centerX}' cy='${centerY}' r='${el.width / 2}' fill='#222' stroke='#222' stroke-width='1' />\n`;
      } else if (el.type === 'FINAL_STATE') {
        svg += `<circle cx='${centerX}' cy='${centerY}' r='${el.width / 2}' fill='none' stroke='#222' stroke-width='2' />\n`;
        svg += `<circle cx='${centerX}' cy='${centerY}' r='${el.width / 4}' fill='#222' stroke='none' />\n`;
      } else if (el.type === 'FLOW_FINAL_NODE') {
        svg += `<circle cx='${centerX}' cy='${centerY}' r='${el.width / 2}' fill='none' stroke='#222' stroke-width='2' />\n`;
        svg += `<line x1='${centerX - el.width / 3}' y1='${centerY - el.width / 3}' x2='${centerX + el.width / 3}' y2='${centerY + el.width / 3}' stroke='#222' stroke-width='2' />\n`;
        svg += `<line x1='${centerX + el.width / 3}' y1='${centerY - el.width / 3}' x2='${centerX - el.width / 3}' y2='${centerY + el.width / 3}' stroke='#222' stroke-width='2' />\n`;
      } else if (el.type === 'ACTION') {
        const radius = el.height / 2;
        svg += `<path d='M ${el.x + radius} ${el.y} L ${el.x + el.width - radius} ${el.y} Q ${el.x + el.width} ${el.y} ${el.x + el.width} ${el.y + radius} L ${el.x + el.width} ${el.y + el.height - radius} Q ${el.x + el.width} ${el.y + el.height} ${el.x + el.width - radius} ${el.y + el.height} L ${el.x + radius} ${el.y + el.height} Q ${el.x} ${el.y + el.height} ${el.x} ${el.y + el.height - radius} L ${el.x} ${el.y + radius} Q ${el.x} ${el.y} ${el.x + radius} ${el.y}' fill='white' stroke='#222' stroke-width='2' />\n`;
        svg += `<text x='${centerX}' y='${centerY + 5}' text-anchor='middle' font-family='Arial' font-size='12' font-weight='bold' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'DECISION_NODE') {
        // Calculate diamond vertices (same as React component)
        const diagonalSize = Math.sqrt(el.width * el.width + el.height * el.height);
        const halfDiag = diagonalSize / 2;
        const topX = centerX;
        const topY = centerY - halfDiag;
        const rightX = centerX + halfDiag;
        const rightY = centerY;
        const bottomX = centerX;
        const bottomY = centerY + halfDiag;
        const leftX = centerX - halfDiag;
        const leftY = centerY;
        
        svg += `<polygon points='${topX},${topY} ${rightX},${rightY} ${bottomX},${bottomY} ${leftX},${leftY}' fill='white' stroke='#222' stroke-width='2' />\n`;
        svg += `<text x='${centerX}' y='${centerY + 5}' text-anchor='middle' font-family='Arial' font-size='12' font-weight='bold' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'FORK_JOIN_BAR') {
        // Apply rotation if present
        if (el.rotation) {
          svg += `<g transform='translate(${centerX}, ${centerY}) rotate(${el.rotation}) translate(${-centerX}, ${-centerY})'>\n`;
        }
        svg += `<rect x='${el.x}' y='${el.y}' width='${el.width}' height='${el.height}' fill='#222' stroke='#222' stroke-width='1' />\n`;
        if (el.rotation) {
          svg += `</g>\n`;
        }
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
    a.download = `activity-diagram-${Date.now()}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = JSON.stringify({ 
      title, 
      selectedType: 'ACTIVITY',
      elements, 
      connections 
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-diagram-${Date.now()}.json`;
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
      if (window.confirm(`Delete connection?`)) {
        handleDeleteConnection(connId);
      }
    } else {
      setSelectedConnection(connId);
    }
  };

  const renderElement = (el) => {
    const isSelected = selectedElement === el.id;
    const centerX = el.x + el.width / 2;
    const centerY = el.y + el.height / 2;

    const renderResizeHandles = () => (
      <>
        <div className="resize-handle resize-n" style={{ position: 'absolute', top: '-3px', left: '50%', transform: 'translateX(-50%)', width: '30px', height: '4px', cursor: 'ns-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7 }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'n'); }} />
        <div className="resize-handle resize-s" style={{ position: 'absolute', bottom: '-3px', left: '50%', transform: 'translateX(-50%)', width: '30px', height: '4px', cursor: 'ns-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7 }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 's'); }} />
        <div className="resize-handle resize-e" style={{ position: 'absolute', right: '-3px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '30px', cursor: 'ew-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7 }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'e'); }} />
        <div className="resize-handle resize-w" style={{ position: 'absolute', left: '-3px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '30px', cursor: 'ew-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7 }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'w'); }} />
        <div className="resize-handle resize-nw" style={{ position: 'absolute', top: '-3px', left: '-3px', width: '8px', height: '8px', cursor: 'nwse-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7 }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'nw'); }} />
        <div className="resize-handle resize-ne" style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', cursor: 'nesw-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7 }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'ne'); }} />
        <div className="resize-handle resize-sw" style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '8px', height: '8px', cursor: 'nesw-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7 }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'sw'); }} />
        <div className="resize-handle resize-se" style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '8px', height: '8px', cursor: 'nwse-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7 }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'se'); }} />
      </>
    );

    if (el.type === 'INITIAL_STATE') {
      return (
        <div
          key={el.id}
          style={{
            position: 'absolute',
            left: `${el.x}px`,
            top: `${el.y}px`,
            width: `${el.width}px`,
            height: `${el.height}px`,
            borderRadius: '50%',
            backgroundColor: '#222',
            border: isSelected ? '3px solid #7c3aed' : '2px solid #222',
            cursor: 'grab',
            zIndex: isSelected ? 100 : 10
          }}
          onClick={(e) => handleElementClick(e, el)}
          onDoubleClick={(e) => handleElementDoubleClick(e, el)}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
        >
          {isSelected && renderResizeHandles()}
        </div>
      );
    } else if (el.type === 'FINAL_STATE') {
      return (
        <div
          key={el.id}
          style={{
            position: 'absolute',
            left: `${el.x}px`,
            top: `${el.y}px`,
            width: `${el.width}px`,
            height: `${el.height}px`,
            borderRadius: '50%',
            backgroundColor: 'white',
            border: isSelected ? '3px solid #7c3aed' : '2px solid #222',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            zIndex: isSelected ? 100 : 10
          }}
          onClick={(e) => handleElementClick(e, el)}
          onDoubleClick={(e) => handleElementDoubleClick(e, el)}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
        >
          <div style={{
            width: '50%',
            height: '50%',
            borderRadius: '50%',
            backgroundColor: '#222'
          }} />
          {isSelected && renderResizeHandles()}
        </div>
      );
    } else if (el.type === 'FLOW_FINAL_NODE') {
      return (
        <div
          key={el.id}
          style={{
            position: 'absolute',
            left: `${el.x}px`,
            top: `${el.y}px`,
            width: `${el.width}px`,
            height: `${el.height}px`,
            borderRadius: '50%',
            backgroundColor: 'white',
            border: isSelected ? '3px solid #7c3aed' : '2px solid #222',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            cursor: 'grab',
            zIndex: isSelected ? 100 : 10
          }}
          onClick={(e) => handleElementClick(e, el)}
          onDoubleClick={(e) => handleElementDoubleClick(e, el)}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
        >
          ✕
          {isSelected && renderResizeHandles()}
        </div>
      );
    } else if (el.type === 'ACTION') {
      return (
        <div
          key={el.id}
          style={{
            position: 'absolute',
            left: `${el.x}px`,
            top: `${el.y}px`,
            width: `${el.width}px`,
            height: `${el.height}px`,
            borderRadius: `${el.height / 2}px`,
            backgroundColor: 'white',
            border: isSelected ? '3px solid #7c3aed' : '2px solid #333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px',
            textAlign: 'center',
            fontSize: '12px',
            fontWeight: '600',
            cursor: editingElement === el.id ? 'text' : 'grab',
            zIndex: isSelected ? 100 : 10,
            boxSizing: 'border-box'
          }}
          onClick={(e) => handleElementClick(e, el)}
          onDoubleClick={(e) => handleElementDoubleClick(e, el)}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
        >
          {editingElement === el.id ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
              autoFocus
              style={{
                border: 'none',
                background: 'transparent',
                textAlign: 'center',
                fontSize: '12px',
                fontWeight: '600',
                width: '100%',
                color: '#222'
              }}
            />
          ) : (
            el.name
          )}
          {isSelected && renderResizeHandles()}
        </div>
      );
    } else if (el.type === 'DECISION_NODE') {
      // Calculate visual bounding box for rotated diamond
      const diagonalSize = Math.sqrt(el.width * el.width + el.height * el.height);
      const halfDiag = diagonalSize / 2;
      const centerX = el.x + el.width / 2;
      const centerY = el.y + el.height / 2;
      
      return (
        <div key={el.id} style={{ position: 'relative' }}>
          {/* Diamond element */}
          <div
            style={{
              position: 'absolute',
              left: `${el.x}px`,
              top: `${el.y}px`,
              width: `${el.width}px`,
              height: `${el.height}px`,
              backgroundColor: 'white',
              border: isSelected ? '3px solid #7c3aed' : '2px solid #333',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'rotate(45deg)',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'grab',
              zIndex: isSelected ? 100 : 10
            }}
            onClick={(e) => handleElementClick(e, el)}
            onDoubleClick={(e) => handleElementDoubleClick(e, el)}
            onMouseDown={(e) => handleElementMouseDown(e, el)}
          >
            <div style={{ transform: 'rotate(-45deg)', textAlign: 'center' }}>
              {editingElement === el.id ? (
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  autoFocus
                  style={{
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'center',
                    fontSize: '11px',
                    fontWeight: '600',
                    width: '80px',
                    color: '#222'
                }}
              />
            ) : (
              el.name
            )}
          </div>
          {isSelected && renderResizeHandles()}
          </div>
        </div>
      );
    } else if (el.type === 'FORK_JOIN_BAR') {
      return (
        <div
          key={el.id}
          style={{
            position: 'absolute',
            left: `${el.x}px`,
            top: `${el.y}px`,
            width: `${el.width}px`,
            height: `${el.height}px`,
            backgroundColor: '#222',
            border: isSelected ? '3px solid #7c3aed' : '2px solid #222',
            borderRadius: '2px',
            cursor: 'grab',
            zIndex: isSelected ? 100 : 10,
            transform: `rotate(${el.rotation || 0}deg)`,
            transformOrigin: 'center center'
          }}
          onClick={(e) => handleElementClick(e, el)}
          onMouseDown={(e) => handleElementMouseDown(e, el)}
        >
          {isSelected && renderResizeHandles()}
        </div>
      );
    } else if (el.type === 'SWIMLANE') {
      // Swimlanes are now rendered as SVG borders only, not DOM containers
      return null;
    }

    return null;
  };

  const handleResizeMouseDown = (e, elementId, direction) => {
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
        <h1>⚡ Activity Diagram</h1>
        <div className="header-actions">
          <button className="btn-primary" onClick={handleSaveToDatabase}>💾 Save to DB</button>
          <button className="btn-secondary" onClick={() => setExportDropdownOpen(!exportDropdownOpen)} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', zIndex: 999 }}>
            📊 Export ▼
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
                  🎨 Export SVG
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
                  📥 Export JSON
                </button>
              </div>
            )}
          </button>
          <button className="btn-secondary" onClick={handleImport}>📥 Import</button>
        </div>
      </div>

      {connectionMode && (
        <div className="connection-mode-bar">
          <span>🔗 Connection mode: <strong>{ACTIVITY_ELEMENTS[connectionMode]?.label}</strong></span>
          <button onClick={() => setConnectionMode(null)}>Cancel (Esc)</button>
        </div>
      )}

      <div className="uml-container">
        <div className="uml-sidebar">
          <h3>Elements</h3>
          <div className="diagram-types">
            {Object.entries(ACTIVITY_ELEMENTS).map(([key, value]) => (
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
            <p style={{ marginTop: '8px', fontSize: '12px', color: '#9f7aea' }}>
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
          <svg className="connections-layer" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'auto', zIndex: 1 }}>
            <defs>
              <marker id="arrowControlFlow" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
                <path d="M 0 0 L 14 7 L 0 14 Z" fill="#333" stroke="none"/>
              </marker>
              <marker id="arrowObjectFlow" markerWidth="14" markerHeight="14" refX="12" refY="7" orient="auto">
                <path d="M 0 0 L 14 7 L 0 14 Z" fill="#666" stroke="none"/>
              </marker>
            </defs>

            {/* Swimlane borders - purely decorative SVG, no interaction */}
            {elements.map((el) => {
              if (el.type !== 'SWIMLANE') return null;
              
              const isSelected = selectedElement === el.id;
              const borderColor = isSelected ? '#7c3aed' : '#333';
              const borderWidth = isSelected ? 3 : 2;
              
              return (
                <rect
                  key={el.id}
                  x={el.x}
                  y={el.y}
                  width={el.width}
                  height={el.height}
                  fill="none"
                  stroke={borderColor}
                  strokeWidth={borderWidth}
                  pointerEvents="none"
                />
              );
            })}

            {connections.map((conn) => {
              const fromEl = elements.find(e => e.id === conn.from);
              const toEl = elements.find(e => e.id === conn.to);
              if (!fromEl || !toEl) return null;

              const fromOffset = typeof conn.fromOffset !== 'undefined' ? conn.fromOffset : 0.5;
              const toOffset = typeof conn.toOffset !== 'undefined' ? conn.toOffset : 0.5;
              const fromPoint = getPointAtOffsetOnEdge(fromEl, conn.fromEdge || 'bottom', fromOffset);
              const toPoint = getPointAtOffsetOnEdge(toEl, conn.toEdge || 'top', toOffset);
              
              const isSelected = selectedConnection === conn.id;
              
              const startX = fromPoint.x;
              const startY = fromPoint.y;
              const endX = toPoint.x;
              const endY = toPoint.y;

              let strokeDasharray = 'none';
              let marker = 'url(#arrowControlFlow)';
              let strokeWidth = '2';

              if (conn.type === 'OBJECT_FLOW') {
                strokeDasharray = '5,5';
                marker = 'url(#arrowObjectFlow)';
              }

              // Build waypoints using orthogonal routing
              let waypoints;
              if (conn.controlPoints && conn.controlPoints.length > 0) {
                waypoints = [{ x: startX, y: startY }, ...conn.controlPoints, { x: endX, y: endY }];
              } else {
                waypoints = findPathAroundObstacles(startX, startY, endX, endY, elements, [conn.from, conn.to]);
              }

              // Convert waypoints to SVG path with orthogonal routing
              const pathD = buildOrthogonalPathThroughWaypoints(waypoints);

              return (
                <g key={conn.id}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isSelected ? '#7c3aed' : '#333'}
                    strokeWidth={isSelected ? '3' : strokeWidth}
                    strokeDasharray={strokeDasharray}
                    markerEnd={marker}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    onClick={(e) => handleConnectionLineClick(e, conn.id)}
                    style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                  />
                  
                  {/* Draggable endpoints - only when selected */}
                  {isSelected && (
                    <>
                      <circle
                        cx={startX}
                        cy={startY}
                        r={6}
                        fill="#ec4899"
                        stroke="#fff"
                        strokeWidth="2"
                        style={{ cursor: 'grab', pointerEvents: 'auto' }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setDraggingEndpoint({ connId: conn.id, endpointType: 'from' });
                        }}
                      />
                      <circle
                        cx={endX}
                        cy={endY}
                        r={6}
                        fill="#ec4899"
                        stroke="#fff"
                        strokeWidth="2"
                        style={{ cursor: 'grab', pointerEvents: 'auto' }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setDraggingEndpoint({ connId: conn.id, endpointType: 'to' });
                        }}
                      />
                    </>
                  )}
                  
                  {conn.condition && (
                    <text
                      x={(startX + endX) / 2 + 10}
                      y={(startY + endY) / 2 - 10}
                      fontFamily="Arial"
                      fontSize="11"
                      fill="#666"
                      pointerEvents="none"
                    >
                      [{conn.condition}]
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Swimlane Labels and Borders */}
          {elements.map(el => {
            if (el.type !== 'SWIMLANE') return null;
            
            const isSelected = selectedElement === el.id;
            
            return (
              <div
                key={el.id}
                style={{
                  position: 'absolute',
                  left: `${el.x}px`,
                  top: `${el.y}px`,
                  width: `${el.width}px`,
                  height: `${el.height}px`,
                  backgroundColor: 'transparent',
                  border: isSelected ? '3px solid #7c3aed' : '2px solid #333',
                  borderRadius: '0px',
                  padding: '8px',
                  cursor: 'grab',
                  zIndex: isSelected ? 50 : 3,
                  boxSizing: 'border-box',
                  pointerEvents: 'none'
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: '700',
                    color: '#666',
                    background: 'white',
                    padding: '4px 8px',
                    borderRadius: '2px',
                    display: 'inline-block',
                    pointerEvents: 'auto',
                    cursor: 'grab',
                    position: 'absolute',
                    left: '-35px',
                    top: '50%',
                    transform: 'translateY(-50%) rotate(-90deg)',
                    transformOrigin: 'center center',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={(e) => handleElementClick(e, el)}
                  onMouseDown={(e) => handleElementMouseDown(e, el)}
                  onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                >
                  {editingElement === el.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={handleSaveName}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                      autoFocus
                      style={{
                        border: 'none',
                        background: 'transparent',
                        fontSize: '11px',
                        fontWeight: '700',
                        width: '120px',
                        color: '#666'
                      }}
                    />
                  ) : (
                    el.name
                  )}
                </div>
                {isSelected && (
                  <>
                    {/* Resize handles for swimlanes */}
                    <div className="resize-handle resize-n" style={{ position: 'absolute', top: '-3px', left: '50%', transform: 'translateX(-50%)', width: '30px', height: '4px', cursor: 'ns-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7, pointerEvents: 'auto' }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'n'); }} />
                    <div className="resize-handle resize-s" style={{ position: 'absolute', bottom: '-3px', left: '50%', transform: 'translateX(-50%)', width: '30px', height: '4px', cursor: 'ns-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7, pointerEvents: 'auto' }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 's'); }} />
                    <div className="resize-handle resize-e" style={{ position: 'absolute', right: '-3px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '30px', cursor: 'ew-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7, pointerEvents: 'auto' }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'e'); }} />
                    <div className="resize-handle resize-w" style={{ position: 'absolute', left: '-3px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '30px', cursor: 'ew-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7, pointerEvents: 'auto' }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'w'); }} />
                    <div className="resize-handle resize-nw" style={{ position: 'absolute', top: '-3px', left: '-3px', width: '8px', height: '8px', cursor: 'nwse-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7, pointerEvents: 'auto' }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'nw'); }} />
                    <div className="resize-handle resize-ne" style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', cursor: 'nesw-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7, pointerEvents: 'auto' }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'ne'); }} />
                    <div className="resize-handle resize-sw" style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '8px', height: '8px', cursor: 'nesw-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7, pointerEvents: 'auto' }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'sw'); }} />
                    <div className="resize-handle resize-se" style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '8px', height: '8px', cursor: 'nwse-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7, pointerEvents: 'auto' }} onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el.id, 'se'); }} />
                  </>
                )}
              </div>
            );
          })}

          {elements.map(el => renderElement(el))}
        </div>

        {/* Right Properties Panel - Always Visible */}
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

                <label style={{ marginTop: '12px' }}>Element Type:</label>
                <div style={{ fontSize: '12px', color: '#666', padding: '6px', background: '#f3f4f6', borderRadius: '4px' }}>
                  {el?.type ? ACTIVITY_ELEMENTS[el.type]?.label || el.type : 'Unknown'}
                </div>

                {(el?.type === 'SWIMLANE' || el?.type === 'FORK_JOIN_BAR') && (
                  <button 
                    className="btn-primary" 
                    onClick={() => handleRotateElement(selectedElement)}
                    style={{ marginTop: '12px', width: '100%', backgroundColor: '#3b82f6', color: 'white' }}
                  >
                    ↻ Rotate 90°
                  </button>
                )}

                <button 
                  className="btn-remove" 
                  onClick={() => selectedElement && handleDeleteElement(selectedElement)}
                  style={{ marginTop: '12px', width: '100%', backgroundColor: '#ef4444', color: 'white' }}
                >
                  🗑️ Delete Element
                </button>
              </div>
            );
          })() : selectedConnection ? (() => {
            const conn = connections.find(c => c.id === selectedConnection);
            if (!conn) return null;
            
            return (
              <div className="properties-panel">
                <label>Type:</label>
                <div style={{
                  padding: '8px 12px',
                  background: '#ede9fe',
                  borderRadius: '8px',
                  fontSize: '13px',
                  color: '#5b21b6',
                  fontWeight: '600'
                }}>
                  {ACTIVITY_ELEMENTS[conn.type]?.label || conn.type}
                </div>

                <label>Condition (for Decision):</label>
                <input
                  type="text"
                  value={conn.condition || ''}
                  onChange={(e) => {
                    setConnections(connections.map(c => c.id === conn.id ? { ...c, condition: e.target.value } : c));
                  }}
                  placeholder="e.g., da / nu"
                />

                <button
                  className="btn-danger"
                  onClick={() => {
                    if (window.confirm('Delete connection?')) {
                      handleDeleteConnection(selectedConnection);
                    }
                  }}
                >
                  🗑️ Delete Connection
                </button>
              </div>
            );
          })() : (
            <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
              Select an element to edit
            </div>
          )}

          <hr style={{ margin: '16px 0', border: 'none', borderTop: '1px solid #d1d5db' }} />

          <h3 style={{ margin: '0 0 12px 0', flexShrink: 0 }}>All Connections</h3>
          {connections.length === 0 ? (
            <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
              No connections yet
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px', paddingBottom: '32px' }}>
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
                      setConnections(connections.filter(c => c.id !== conn.id));
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
    </div>
  );
}

export default ActivityDiagramEditor;
