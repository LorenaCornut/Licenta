import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../UMLEditor.css';

// ============ DEPLOYMENT ELEMENT TYPES ============
const DEPLOYMENT_ELEMENTS = {
  NODE: { label: 'Node', icon: '🖥️', color: '#A0D4FF', defaultStereotype: '' },
  EXECUTION_ENV: { label: 'Execution Env', icon: '◻️', color: '#A0D4FF', defaultStereotype: 'processor' },
  NETWORK: { label: 'Network (Device)', icon: '🌐', color: '#A0D4FF', defaultStereotype: 'network' },
  ARTIFACT: { label: 'Artifact', icon: '📄', color: '#F8E8D4', defaultStereotype: '' }
};

const CONNECTION_TYPES = {
  COMMUNICATION_PATH: { label: 'Communication Path', icon: '─', style: 'solid', hasArrow: false },
  DEPLOYMENT: { label: 'Deployment', icon: '- →', style: 'dashed', hasArrow: true, label: '<<deploy>>' },
  MANIFESTATION: { label: 'Manifestation', icon: '- →', style: 'dashed', hasArrow: true, label: '<<manifest>>' },
  NODE_RELATION: { label: 'Node Relation', icon: '- -→', style: 'dashed', hasArrow: true }
};

// ============ ROUTING HELPER FUNCTIONS ============

/**
 * Get bounding box of an element
 */
function getElementBounds(el) {
  return {
    x: el.x,
    y: el.y,
    width: el.width || 150,
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

// ============ END ROUTING HELPERS ============

function detectConnectionPointOnContour(e, element) {
  const canvas = document.querySelector('.uml-canvas');
  if (!canvas) return { x: element.x, y: element.y, point: 'top', offset: 0 };
  
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
  
  let pointX, pointY, edgeType, offset;
  
  if (minDist === distTop) {
    pointX = Math.max(elCanvasX, Math.min(clickCanvasX, elCanvasX + elWidth));
    pointY = elCanvasY;
    edgeType = 'top';
    offset = pointX - elCanvasX;
  } else if (minDist === distBottom) {
    pointX = Math.max(elCanvasX, Math.min(clickCanvasX, elCanvasX + elWidth));
    pointY = elCanvasY + elHeight;
    edgeType = 'bottom';
    offset = pointX - elCanvasX;
  } else if (minDist === distLeft) {
    pointX = elCanvasX;
    pointY = Math.max(elCanvasY, Math.min(clickCanvasY, elCanvasY + elHeight));
    edgeType = 'left';
    offset = pointY - elCanvasY;
  } else {
    pointX = elCanvasX + elWidth;
    pointY = Math.max(elCanvasY, Math.min(clickCanvasY, elCanvasY + elHeight));
    edgeType = 'right';
    offset = pointY - elCanvasY;
  }
  
  return { x: pointX, y: pointY, point: edgeType, offset };
}

function getConnectionPointForElement(element, connectionPoint) {
  // Recalculate connection point using stored edge+offset
  if (connectionPoint && typeof connectionPoint === 'object' && connectionPoint.point && connectionPoint.offset !== undefined) {
    const w = element.width || 150;
    const h = element.height || 100;
    const offset = Math.max(0, Math.min(connectionPoint.offset, connectionPoint.point === 'top' || connectionPoint.point === 'bottom' ? w : h));
    
    switch (connectionPoint.point) {
      case 'top':
        return { x: element.x + offset, y: element.y };
      case 'bottom':
        return { x: element.x + offset, y: element.y + h };
      case 'left':
        return { x: element.x, y: element.y + offset };
      case 'right':
        return { x: element.x + w, y: element.y + offset };
      default:
        return { x: element.x + w / 2, y: element.y + h / 2 };
    }
  }
  
  // Fallback to center
  const w = element.width || 150;
  const h = element.height || 100;
  return { x: element.x + w / 2, y: element.y + h / 2 };
}

function getPointAtOffsetOnEdge(element, edgeType, offset) {
  offset = Math.max(0, Math.min(1, offset || 0.5));
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

function getConnectionPoint(element, edgeType = 'center') {
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;

  switch (edgeType) {
    case 'top':
      return { x: centerX, y: element.y };
    case 'bottom':
      return { x: centerX, y: element.y + element.height };
    case 'left':
      return { x: element.x, y: centerY };
    case 'right':
      return { x: element.x + element.width, y: centerY };
    case 'top-left':
      return { x: element.x, y: element.y };
    case 'top-right':
      return { x: element.x + element.width, y: element.y };
    case 'bottom-left':
      return { x: element.x, y: element.y + element.height };
    case 'bottom-right':
      return { x: element.x + element.width, y: element.y + element.height };
    default:
      return { x: centerX, y: centerY };
  }
}

function detectCubeEdge(clickX, clickY, elementX, elementY, elementWidth, elementHeight) {
  // Detect which edge/corner of the cube is closest to the click
  const relX = clickX - elementX;
  const relY = clickY - elementY;

  // Determine if click is on top half or bottom half
  const isTopHalf = relY < elementHeight / 2;
  const isLeftHalf = relX < elementWidth / 2;
  const isRightHalf = relX >= elementWidth / 2;

  // Distance from edges
  const distTop = Math.abs(relY);
  const distBottom = Math.abs(relY - elementHeight);
  const distLeft = Math.abs(relX);
  const distRight = Math.abs(relX - elementWidth);

  const edges = [
    { dist: distTop, name: 'top' },
    { dist: distBottom, name: 'bottom' },
    { dist: distLeft, name: 'left' },
    { dist: distRight, name: 'right' }
  ];

  const closest = edges.reduce((min, curr) => curr.dist < min.dist ? curr : min);
  return closest.name;
}

// ============ MAIN COMPONENT ============

function DeploymentDiagramEditor() {
  const navigate = useNavigate();
  const { diagramId } = useParams();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  
  const [title, setTitle] = useState('Deployment Diagram');
  const [elements, setElements] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedElement, setSelectedElement] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [connectionMode, setConnectionMode] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [draggedType, setDraggedType] = useState(null);
  const [draggingElement, setDraggingElement] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizing, setResizing] = useState(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [draggingConnectionEnd, setDraggingConnectionEnd] = useState(null);
  const [draggedConnectionPoint, setDraggedConnectionPoint] = useState(null);
  const [editingElementId, setEditingElementId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveDialogTitle, setSaveDialogTitle] = useState('');
  const [saveError, setSaveError] = useState('');
  const [currentDiagramId, setCurrentDiagramId] = useState(null);

  // Load diagram if editing
  useEffect(() => {
    if (diagramId && diagramId !== 'new') {
      loadDiagram(diagramId);
    } else {
      setCurrentDiagramId(null);
    }
  }, [diagramId]);

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
      const elRect = { x: el.x, y: el.y, width: el.width || 150, height: el.height || 100 };
      if (checkCollision(movingRect, elRect)) {
        return true;
      }
    }
    return false;
  };

  // Handle element dragging
  useEffect(() => {
    if (!draggingElement || !canvasRef.current) return;

    const handleMouseMove = (e) => {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const newX = Math.max(0, e.clientX - canvasRect.left - dragOffset.x);
      const newY = Math.max(0, e.clientY - canvasRect.top - dragOffset.y);
      
      const draggedEl = elements.find(el => el.id === draggingElement);
      if (hasCollisionWithOthers(draggingElement, newX, newY, draggedEl.width || 150, draggedEl.height || 100)) {
        return;
      }
      
      setElements(elements.map(el => 
        el.id === draggingElement ? { ...el, x: newX, y: newY } : el
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

  // Handle element resizing
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

      const minWidth = 120;
      const minHeight = 80;

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

  // Handle connection end dragging - constrained to element edges only
  useEffect(() => {
    if (!draggingConnectionEnd || !canvasRef.current) return;

    const { connectionId, isFromEnd } = draggingConnectionEnd;
    const conn = connections.find(c => c.id === connectionId);
    if (!conn) {
      setDraggingConnectionEnd(null);
      setDraggedConnectionPoint(null);
      return;
    }

    // Get source element
    const sourceElId = isFromEnd ? conn.from : conn.to;
    const sourceEl = elements.find(e => e.id === sourceElId);
    if (!sourceEl) {
      setDraggingConnectionEnd(null);
      setDraggedConnectionPoint(null);
      return;
    }

    const sourceBounds = {
      x: sourceEl.x,
      y: sourceEl.y,
      w: sourceEl.width || 150,
      h: sourceEl.height || 100
    };

    const handleMouseMove = (e) => {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - canvasRect.left;
      const y = e.clientY - canvasRect.top;

      // Project cursor onto the source element's edge (constrained to contour only)
      let projX, projY, edge, offset;

      // Calculate signed distances
      const distToTop = sourceBounds.y - y;
      const distToBottom = y - (sourceBounds.y + sourceBounds.h);
      const distToLeft = sourceBounds.x - x;
      const distToRight = x - (sourceBounds.x + sourceBounds.w);

      // Distances must be positive (cursor must be outside edge)
      const validDistToTop = distToTop >= 0 ? distToTop : Infinity;
      const validDistToBottom = distToBottom >= 0 ? distToBottom : Infinity;
      const validDistToLeft = distToLeft >= 0 ? distToLeft : Infinity;
      const validDistToRight = distToRight >= 0 ? distToRight : Infinity;

      const minDist = Math.min(validDistToTop, validDistToBottom, validDistToLeft, validDistToRight);

      if (minDist === validDistToTop) {
        // Top edge - constrain x to edge bounds
        projX = Math.max(sourceBounds.x, Math.min(x, sourceBounds.x + sourceBounds.w));
        projY = sourceBounds.y;
        edge = 'top';
        offset = projX - sourceBounds.x;
      } else if (minDist === validDistToBottom) {
        // Bottom edge - constrain x to edge bounds
        projX = Math.max(sourceBounds.x, Math.min(x, sourceBounds.x + sourceBounds.w));
        projY = sourceBounds.y + sourceBounds.h;
        edge = 'bottom';
        offset = projX - sourceBounds.x;
      } else if (minDist === validDistToLeft) {
        // Left edge - constrain y to edge bounds
        projX = sourceBounds.x;
        projY = Math.max(sourceBounds.y, Math.min(y, sourceBounds.y + sourceBounds.h));
        edge = 'left';
        offset = projY - sourceBounds.y;
      } else if (minDist === validDistToRight) {
        // Right edge - constrain y to edge bounds
        projX = sourceBounds.x + sourceBounds.w;
        projY = Math.max(sourceBounds.y, Math.min(y, sourceBounds.y + sourceBounds.h));
        edge = 'right';
        offset = projY - sourceBounds.y;
      } else {
        // Cursor too far - stay at last valid position or center
        projX = sourceBounds.x + sourceBounds.w / 2;
        projY = sourceBounds.y;
        edge = 'top';
        offset = sourceBounds.w / 2;
      }

      setDraggedConnectionPoint({
        x: projX,
        y: projY,
        edge,
        offset
      });
    };

    const handleMouseUp = (e) => {
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - canvasRect.left;
      const y = e.clientY - canvasRect.top;

      // Project onto source element edge
      let connectionPoint;

      const distToTop = sourceBounds.y - y;
      const distToBottom = y - (sourceBounds.y + sourceBounds.h);
      const distToLeft = sourceBounds.x - x;
      const distToRight = x - (sourceBounds.x + sourceBounds.w);

      const validDistToTop = distToTop >= 0 ? distToTop : Infinity;
      const validDistToBottom = distToBottom >= 0 ? distToBottom : Infinity;
      const validDistToLeft = distToLeft >= 0 ? distToLeft : Infinity;
      const validDistToRight = distToRight >= 0 ? distToRight : Infinity;

      const minDist = Math.min(validDistToTop, validDistToBottom, validDistToLeft, validDistToRight);

      if (minDist === validDistToTop) {
        const projX = Math.max(sourceBounds.x, Math.min(x, sourceBounds.x + sourceBounds.w));
        connectionPoint = {
          x: projX,
          y: sourceBounds.y,
          point: 'top',
          offset: projX - sourceBounds.x
        };
      } else if (minDist === validDistToBottom) {
        const projX = Math.max(sourceBounds.x, Math.min(x, sourceBounds.x + sourceBounds.w));
        connectionPoint = {
          x: projX,
          y: sourceBounds.y + sourceBounds.h,
          point: 'bottom',
          offset: projX - sourceBounds.x
        };
      } else if (minDist === validDistToLeft) {
        const projY = Math.max(sourceBounds.y, Math.min(y, sourceBounds.y + sourceBounds.h));
        connectionPoint = {
          x: sourceBounds.x,
          y: projY,
          point: 'left',
          offset: projY - sourceBounds.y
        };
      } else {
        const projY = Math.max(sourceBounds.y, Math.min(y, sourceBounds.y + sourceBounds.h));
        connectionPoint = {
          x: sourceBounds.x + sourceBounds.w,
          y: projY,
          point: 'right',
          offset: projY - sourceBounds.y
        };
      }

      if (isFromEnd) {
        setConnections(connections.map(c =>
          c.id === connectionId
            ? { ...c, from: sourceElId, fromPoint: connectionPoint }
            : c
        ));
      } else {
        setConnections(connections.map(c =>
          c.id === connectionId
            ? { ...c, to: sourceElId, toPoint: connectionPoint }
            : c
        ));
      }

      setDraggingConnectionEnd(null);
      setDraggedConnectionPoint(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingConnectionEnd, connections, elements]);

  const loadDiagram = async (id) => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/diagrams/${id}`);
      const result = await response.json();
      
      console.log('Load response:', result);
      
      if (response.ok) {
        setTitle(result.diagram.title || 'Deployment Diagram');
        
        // Backend returns elements/connections at top level for UML diagrams
        let loadedElements = result.elements || result.data?.elements || [];
        let loadedConnections = result.connections || result.data?.connections || [];
        
        // Map backend format to frontend format
        loadedElements = loadedElements.map(el => ({
          id: el.id,
          type: el.type || 'NODE',
          label: el.name || el.label || '',
          stereotype: el.stereotype || '',
          x: el.x || 0,
          y: el.y || 0,
          width: el.width || 150,
          height: el.height || 100,
          color: el.color || '#60a5fa'
        }));
        
        // Map connections format
        loadedConnections = loadedConnections.map(conn => ({
          id: conn.id,
          from: conn.fromId || conn.from,
          fromPoint: conn.fromPoint || { x: 0, y: 0, point: 'top', offset: 0 },
          to: conn.toId || conn.to,
          toPoint: conn.toPoint || { x: 0, y: 0, point: 'bottom', offset: 0 },
          type: conn.type || 'COMMUNICATION_PATH',
          label: conn.label || '',
          controlPoints: conn.controlPoints || []
        }));
        
        console.log('Loaded elements:', loadedElements);
        console.log('Loaded connections:', loadedConnections);
        
        setElements(loadedElements);
        setConnections(loadedConnections);
        const loadedDiagramId = result.diagram?.id || id;
        setCurrentDiagramId(loadedDiagramId);
        sessionStorage.setItem('currentDiagramId', loadedDiagramId);
      } else {
        alert(`Eroare la încărcare: ${result.message || 'Unknown error'}`);
      }
    } catch (err) {
      console.error('Error loading diagram:', err);
      alert(`Eroare la încărcare: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const addElement = (type) => {
    const newElement = {
      id: `${type}-${Date.now()}`,
      type,
      label: type === 'EXECUTION_ENV' ? 'ExecutionEnv' : type.replace('_', ' '),
      stereotype: type === 'EXECUTION_ENV' ? 'OS' : '',
      x: 100 + Math.random() * 200,
      y: 100 + Math.random() * 200,
      width: 150,
      height: 100,
      color: DEPLOYMENT_ELEMENTS[type].color
    };
    setElements([...elements, newElement]);
  };

  const handleDragStart = (e, type) => {
    setDraggedType(type);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleCanvasDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    if (!draggedType || !canvasRef.current) return;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    const newElement = {
      id: `${draggedType}-${Date.now()}`,
      type: draggedType,
      label: draggedType === 'NETWORK' ? 'Network' : draggedType === 'EXECUTION_ENV' ? 'ExecutionEnv' : draggedType === 'ARTIFACT' ? 'Artifact' : 'Node',
      stereotype: DEPLOYMENT_ELEMENTS[draggedType].defaultStereotype,
      x: Math.max(0, x - 75),
      y: Math.max(0, y - 50),
      width: draggedType === 'NETWORK' ? 300 : 150,
      height: draggedType === 'NETWORK' ? 80 : 100,
      color: DEPLOYMENT_ELEMENTS[draggedType].color
    };

    setElements([...elements, newElement]);
    setSelectedElement(newElement.id);
    setDraggedType(null);
  };

  const handleElementMouseDown = (e, elementId) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const el = elements.find(e => e.id === elementId);
    if (!el) return;

    const offsetX = e.clientX - canvasRect.left - el.x;
    const offsetY = e.clientY - canvasRect.top - el.y;

    setDraggingElement(elementId);
    setDragOffset({ x: offsetX, y: offsetY });
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

  const handleElementClick = (e, elementId) => {
    e.stopPropagation();
    
    if (connectionMode) {
      // Connection mode: detect point on contour
      const element = elements.find(el => el.id === elementId);
      if (!element) return;
      
      const clickedPoint = detectConnectionPointOnContour(e, element);
      if (!clickedPoint) return;
      
      if (!connectionStart) {
        // First click - save start point
        setConnectionStart({ elementId, point: clickedPoint });
        console.log(`✓ Connection START on element at ${clickedPoint.point} edge`);
      } else if (connectionStart.elementId !== elementId) {
        // Second click on different element - CREATE CONNECTION
        const newConnection = {
          id: `conn-${Date.now()}`,
          from: connectionStart.elementId,
          fromPoint: connectionStart.point,
          to: elementId,
          toPoint: clickedPoint,
          type: connectionMode,
          label: '',
          controlPoints: []
        };
        setConnections([...connections, newConnection]);
        console.log(`✓ Connection CREATED: ${connectionMode}`);
        setConnectionMode(null);
        setConnectionStart(null);
      } else {
        // Clicked same element - update start point
        setConnectionStart({ elementId, point: clickedPoint });
      }
      return;
    }
    
    // Normal selection mode
    setSelectedElement(elementId);
    setSelectedConnection(null);
  };

  const handleCanvasClick = (e) => {
    // Deselect if clicking on canvas background (not on any element)
    if (!e.target.closest('[data-element-id]')) {
      setSelectedElement(null);
      setSelectedConnection(null);
      setConnectionMode(null);
      setConnectionStart(null);
    }
  };

  const cancelConnectionMode = () => {
    setConnectionMode(null);
    setConnectionStart(null);
  };

  const deleteElement = (elementId) => {
    setElements(elements.filter(el => el.id !== elementId));
    setConnections(connections.filter(conn => conn.from !== elementId && conn.to !== elementId));
    setSelectedElement(null);
  };

  const deleteConnection = (connId) => {
    setConnections(connections.filter(conn => conn.id !== connId));
    setSelectedConnection(null);
  };

  const startEditingElement = (elementId, currentText) => {
    setEditingElementId(elementId);
    setEditingText(currentText);
  };

  const finishEditingElement = () => {
    if (editingElementId) {
      setElements(elements.map(el =>
        el.id === editingElementId ? { ...el, label: editingText } : el
      ));
    }
    setEditingElementId(null);
    setEditingText('');
  };

  const cancelEditingElement = () => {
    setEditingElementId(null);
    setEditingText('');
  };

  const updateElement = (elementId, updates) => {
    setElements(elements.map(el => el.id === elementId ? { ...el, ...updates } : el));
  };

  const saveDiagram = async ({ diagramTitle, diagramIdToUpdate = null }) => {
    const userId = localStorage.getItem('userId');

    try {
      const payload = {
        userId: parseInt(userId),
        title: diagramTitle,
        tipDiagrama: 'UML_DEPLOYMENT_DIAGRAM',
        elements: elements,
        connections: connections,
        ...(diagramIdToUpdate && { diagramId: diagramIdToUpdate })
      };

      const response = await fetch('http://localhost:5000/api/diagrams/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const contentType = response.headers.get('content-type');
      let result;

      if (contentType && contentType.includes('application/json')) {
        result = await response.json();
      } else {
        const text = await response.text();
        console.error('Server returned non-JSON response:', text);
        return { ok: false, message: `Server error: ${response.statusText}` };
      }

      if (!response.ok) {
        return { ok: false, message: result.message || 'Eroare la salvare!' };
      }

      const persistedId = result.diagramId || diagramIdToUpdate;
      if (persistedId) {
        setCurrentDiagramId(persistedId);
        sessionStorage.setItem('currentDiagramId', persistedId);
      }

      setTitle(diagramTitle);
      return { ok: true, isUpdate: !!diagramIdToUpdate };
    } catch (error) {
      console.error('Error saving diagram:', error);
      return { ok: false, message: `Eroare: ${error.message}` };
    }
  };

  const handleSaveToDatabase = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      alert('Trebuie să fii logat!');
      return;
    }

    if (currentDiagramId) {
      const effectiveTitle = (title || 'Deployment Diagram').trim();
      const result = await saveDiagram({
        diagramTitle: effectiveTitle,
        diagramIdToUpdate: currentDiagramId
      });

      if (result.ok) {
        alert('✅ Diagrama a fost actualizată cu succes!');
      } else {
        alert(result.message || 'Eroare la actualizare!');
      }
      return;
    }

    // For new diagrams, ask for a title first.
    setSaveDialogTitle(title || 'Deployment Diagram');
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

  const exportToSVG = () => {
    try {
      // Calculate bounds
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      
      elements.forEach(el => {
        minX = Math.min(minX, el.x);
        minY = Math.min(minY, el.y);
        maxX = Math.max(maxX, el.x + (el.width || 150));
        maxY = Math.max(maxY, el.y + (el.height || 100));
      });

      const padding = 40;
      const width = Math.max(1200, maxX - minX + padding * 2);
      const height = Math.max(800, maxY - minY + padding * 2);

      // Get connections SVG from canvas
      const canvasSvg = document.querySelector('.uml-canvas svg');
      let connectionsSVG = '';
      
      if (canvasSvg) {
        const clone = canvasSvg.cloneNode(true);
        const serializer = new XMLSerializer();
        let svgString = serializer.serializeToString(clone);
        
        // Extract content
        const match = svgString.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
        if (match) {
          connectionsSVG = match[1];
        }
      }

      // Get element SVGs from DOM
      let elementsSVG = '';
      const elementDivs = document.querySelectorAll('[data-element-id]');
      
      elementDivs.forEach(div => {
        const elementSvg = div.querySelector('svg');
        if (elementSvg) {
          const serializer = new XMLSerializer();
          let svgString = serializer.serializeToString(elementSvg);
          
          // Extract SVG content and wrap in a group with position transform
          const match = svgString.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
          if (match) {
            const x = parseInt(div.style.left) || 0;
            const y = parseInt(div.style.top) || 0;
            elementsSVG += `<g transform="translate(${x},${y})">${match[1]}</g>`;
          }
        }
      });

      // Build complete SVG
      let svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="artifactGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F8E8D4;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#8ac4ff;stop-opacity:1" />
    </linearGradient>
  </defs>
  
  <!-- Background -->
  <rect width="${width}" height="${height}" fill="white"/>
  
  <!-- Connections -->
  ${connectionsSVG}
  
  <!-- Elements -->
  ${elementsSVG}
</svg>`;

      // Download
      const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '_')}.svg`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDropdownOpen(false);
    } catch (error) {
      console.error('Export error:', error);
      alert('Eroare la export SVG: ' + error.message);
    }
  };

  const exportToJSON = () => {
    try {
      const data = { title, elements, connections };
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/\s+/g, '_')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExportDropdownOpen(false);
      console.log('JSON exported successfully');
    } catch (error) {
      console.error('Export error:', error);
      alert('❌ Error exporting JSON: ' + error.message);
    }
  };

  const handleImportJSON = () => {
    console.log('Import clicked, fileInputRef:', fileInputRef.current);
    if (fileInputRef.current) {
      fileInputRef.current.click();
      console.log('File input clicked');
    } else {
      alert('❌ File input not ready');
    }
  };

  const renderCanvas = () => {
    return (
      <>
        {/* SVG for connections - BACKGROUND LAYER */}
        <svg style={{ 
          position: 'absolute', 
          top: 0, 
          left: 0, 
          width: '100%', 
          height: '100%', 
          pointerEvents: 'auto',
          zIndex: 0
        }}>
          <defs>
            {/* Arrow marker for deployment/manifestation lines */}
            <marker id="arrowDeployment" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#333" />
            </marker>
          </defs>

          {/* Render connections */}
          {connections.map(conn => {
            const fromEl = elements.find(e => e.id === conn.from);
            const toEl = elements.find(e => e.id === conn.to);
            const connType = CONNECTION_TYPES[conn.type];
            if (!fromEl || !toEl || !connType) return null;

            // Recalculate connection points using stored edge+offset
            const fromPt = getConnectionPointForElement(fromEl, conn.fromPoint);
            const toPt = getConnectionPointForElement(toEl, conn.toPoint);
            const fromX = fromPt.x;
            const fromY = fromPt.y;
            const toX = toPt.x;
            const toY = toPt.y;

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
                conn.toPoint?.point
              );
            }

            // Convert waypoints to SVG path with 90-degree corners
            const pathD = buildOrthogonalPathThroughWaypoints(waypoints);

            const isDashed = connType.style === 'dashed';
            const hasArrow = connType.hasArrow;
            const isSelected = selectedConnection === conn.id;

            return (
              <g key={conn.id}>
                {/* Invisible hit area */}
                <path d={pathD} fill="none" stroke="transparent" strokeWidth="8" 
                      pointerEvents="auto" onClick={(e) => { e.stopPropagation(); setSelectedConnection(conn.id); }}
                      style={{ cursor: 'pointer' }} />
                
                {/* Visible path */}
                <path d={pathD} fill="none" 
                      stroke={isSelected ? '#dc2626' : '#333'} 
                      strokeWidth={isSelected ? 3 : 2}
                      strokeDasharray={isDashed ? '5,5' : 'none'}
                      markerEnd={hasArrow ? 'url(#arrowDeployment)' : 'none'}
                      pointerEvents="none"/>
                
                {/* Connection label/type */}
                {conn.type === 'DEPLOYMENT' && (
                  <text x={(fromX + toX) / 2} y={(fromY + toY) / 2 - 10} 
                        fontSize="12" fill="#666" textAnchor="middle" fontStyle="italic" fontWeight="600"
                        pointerEvents="none">
                    &lt;&lt;deploy&gt;&gt;
                  </text>
                )}

                {conn.type === 'MANIFESTATION' && (
                  <text x={(fromX + toX) / 2} y={(fromY + toY) / 2 - 10} 
                        fontSize="12" fill="#666" textAnchor="middle" fontStyle="italic" fontWeight="600"
                        pointerEvents="none">
                    &lt;&lt;manifest&gt;&gt;
                  </text>
                )}
                
                {/* Custom label - only show if not empty and not epsilon */}
                {conn.label && conn.label !== 'ε' && (
                  <text x={(fromX + toX) / 2} y={(fromY + toY) / 2 + 10} 
                        fontSize="12" fill="#333" textAnchor="middle" fontWeight="600"
                        pointerEvents="none">
                    {conn.label}
                  </text>
                )}

                {/* Connection end handles - only show if selected */}
                {isSelected && (
                  <>
                    {/* From end handle */}
                    <circle 
                      cx={draggedConnectionPoint && draggingConnectionEnd?.isFromEnd ? draggedConnectionPoint.x : fromX}
                      cy={draggedConnectionPoint && draggingConnectionEnd?.isFromEnd ? draggedConnectionPoint.y : fromY}
                      r="6" 
                      fill="#7c3aed" 
                      stroke="#fff" 
                      strokeWidth="2"
                      pointerEvents="auto"
                      cursor="grab"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingConnectionEnd({ connectionId: conn.id, isFromEnd: true });
                      }}
                      style={{
                        opacity: draggingConnectionEnd?.isFromEnd ? 0.9 : 0.7,
                      }}
                    />
                    
                    {/* To end handle */}
                    <circle 
                      cx={draggedConnectionPoint && !draggingConnectionEnd?.isFromEnd ? draggedConnectionPoint.x : toX}
                      cy={draggedConnectionPoint && !draggingConnectionEnd?.isFromEnd ? draggedConnectionPoint.y : toY}
                      r="6" 
                      fill="#7c3aed" 
                      stroke="#fff" 
                      strokeWidth="2"
                      pointerEvents="auto"
                      cursor="grab"
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setDraggingConnectionEnd({ connectionId: conn.id, isFromEnd: false });
                      }}
                      style={{
                        opacity: draggingConnectionEnd && !draggingConnectionEnd.isFromEnd ? 0.9 : 0.7,
                      }}
                    />


                  </>
                )}
              </g>
            );
          })}
        </svg>

        {/* HTML Elements positioned absolutely */}
        {elements.map(el => {
          const isSelected = selectedElement === el.id;
          const isStart = connectionStart === el.id;

          return (
            <div
              key={el.id}
              data-element-id={el.id}
              onClick={(e) => handleElementClick(e, el.id)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startEditingElement(el.id, el.label);
              }}
              onMouseDown={(e) => handleElementMouseDown(e, el.id)}
              style={{
                position: 'absolute',
                left: `${el.x}px`,
                top: `${el.y}px`,
                width: `${el.width}px`,
                height: `${el.height}px`,
                cursor: draggingElement === el.id ? 'grabbing' : 'grab',
                userSelect: 'none',
                zIndex: isSelected ? 1000 : 100,
                opacity: isStart ? 0.7 : 1
              }}
            >
              <svg style={{ width: '100%', height: '100%' }} viewBox={`0 0 ${el.width} ${el.height}`}>
                {(el.type === 'NODE' || el.type === 'EXECUTION_ENV' || el.type === 'NETWORK') && (
                  <>
                    {/* Stereotype text (top) */}
                    {el.stereotype && (
                      <text x={el.width / 2} y="16" textAnchor="middle" fontSize="11" fill="#333" fontStyle="italic" fontWeight="600">
                        &lt;&lt;{el.stereotype}&gt;&gt;
                      </text>
                    )}
                    
                    {el.type === 'NETWORK' ? (
                      <>
                        {/* Network: Large horizontal bar/platform */}
                        {/* Top face */}
                        <polygon points={`0,${el.height * 0.3} 12,${el.height * 0.2} ${el.width + 12},${el.height * 0.2} ${el.width},${el.height * 0.3}`}
                                 fill="#B0E0FF" stroke="#333" strokeWidth="2"/>
                        
                        {/* Front face */}
                        <rect x="0" y={el.height * 0.3} width={el.width} height={el.height * 0.7}
                              fill="#A0D4FF" stroke="#333" strokeWidth="2"/>
                        
                        {/* Right face */}
                        <polygon points={`${el.width},${el.height * 0.3} ${el.width + 12},${el.height * 0.2} ${el.width + 12},${el.height * 0.2 + el.height * 0.7} ${el.width},${el.height * 0.3 + el.height * 0.7}`}
                                 fill="#8ACCFF" stroke="#333" strokeWidth="2"/>
                        
                        {/* Label */}
                        {el.label && el.label.split('\n').map((line, idx) => (
                          <text key={idx} x={el.width / 2} y={el.height * 0.55 + idx * 14} 
                                textAnchor="middle" fontSize="11" fontWeight="bold" fill="#000">
                            {line}
                          </text>
                        ))}
                      </>
                    ) : (
                      <>
                        {/* Regular Cube: Node or Execution Environment */}
                        {/* Top face */}
                        <polygon points={`0,12 12,0 ${el.width + 12},0 ${el.width},12`}
                                 fill="#B0E0FF" stroke="#333" strokeWidth="2"/>
                        
                        {/* Front face */}
                        <rect x="0" y="12" width={el.width} height={el.height - 12}
                              fill="#A0D4FF" stroke={isSelected ? '#dc2626' : '#333'} strokeWidth={isSelected ? 3 : 2}/>
                        
                        {/* Right face */}
                        <polygon points={`${el.width},12 ${el.width + 12},0 ${el.width + 12},${el.height} ${el.width},${el.height - 0}`}
                                 fill="#8ACCFF" stroke={isSelected ? '#dc2626' : '#333'} strokeWidth={isSelected ? 3 : 2}/>
                        
                        {/* Label - below stereotype */}
                        {el.label && el.label.split('\n').map((line, idx) => (
                          <text key={idx} x={el.width / 2} y={(el.stereotype ? el.height / 2 + 15 : el.height / 2 + 8) + idx * 14} 
                                textAnchor="middle" fontSize="11" fontWeight="bold" fill="#000">
                            {line}
                          </text>
                        ))}
                      </>
                    )}
                  </>
                )}

                {el.type === 'ARTIFACT' && (
                  <>
                    <defs>
                      <linearGradient id="artifactGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style={{stopColor: el.color, stopOpacity: 1}} />
                        <stop offset="100%" style={{stopColor: '#8ac4ff', stopOpacity: 1}} />
                      </linearGradient>
                    </defs>
                    
                    <rect x="0" y="0" width={el.width} height={el.height} 
                          fill="url(#artifactGradient)" stroke={isSelected ? '#dc2626' : '#666'} 
                          strokeWidth={isSelected ? 3 : 1.5} rx="2" ry="2"/>
                    
                    {/* Folded corner - document style */}
                    <path d={`M ${el.width - 16},0 L ${el.width},0 L ${el.width},16 Z`}
                          fill="#e8c547" stroke={isSelected ? '#dc2626' : '#999'} strokeWidth="0.5"/>
                    
                    {/* Fold line */}
                    <line x1={el.width - 16} y1={0} x2={el.width} y2={16} 
                          stroke={isSelected ? '#dc2626' : '#999'} strokeWidth="0.5" opacity="0.5"/>
                    
                    {/* Stereotype text */}
                    <text x={el.width / 2} y="22" textAnchor="middle" fontSize="9" 
                          fill="#444" fontStyle="italic" fontWeight="500" fontFamily="Arial">
                      &lt;&lt;artifact&gt;&gt;
                    </text>
                    
                    {/* Label text */}
                    {el.label && el.label.split('\n').map((line, idx) => (
                      <text key={idx} x={el.width / 2} y={el.height - 20 + idx * 14} 
                            textAnchor="middle" fontSize="10" fontWeight="bold" fill="#333" fontFamily="Arial">
                        {line}
                      </text>
                    ))}
                  </>
                )}
              </svg>

              {/* Text editing input - only show when editing */}
              {editingElementId === el.id && (
                <textarea
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.ctrlKey) {
                      finishEditingElement();
                    } else if (e.key === 'Escape') {
                      cancelEditingElement();
                    }
                  }}
                  onBlur={finishEditingElement}
                  style={{
                    position: 'absolute',
                    top: '8px',
                    left: '8px',
                    width: Math.max(el.width - 26, 130),
                    height: Math.max(el.height - 26, 80),
                    padding: '6px 8px',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    textAlign: 'left',
                    border: '2px solid #7c3aed',
                    borderRadius: '4px',
                    zIndex: 2000,
                    backgroundColor: '#fff',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    fontFamily: 'Arial, sans-serif',
                    resize: 'none',
                    wordWrap: 'break-word',
                    whiteSpace: 'pre-wrap',
                    overflow: 'auto',
                    scrollBehavior: 'smooth'
                  }}
                  placeholder="Enter text... (Ctrl+Enter to save)"
                  autoFocus
                />
              )}

              {/* Resize handles - only show when selected */}
              {isSelected && (
                <>
                  <div className="resize-handle resize-n" onMouseDown={(e) => handleResizeStart(e, el.id, 'n')} style={{ position: 'absolute', top: '-3px', left: '50%', transform: 'translateX(-50%)', width: '30px', height: '4px', cursor: 'ns-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7 }} />
                  <div className="resize-handle resize-s" onMouseDown={(e) => handleResizeStart(e, el.id, 's')} style={{ position: 'absolute', bottom: '-3px', left: '50%', transform: 'translateX(-50%)', width: '30px', height: '4px', cursor: 'ns-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7 }} />
                  <div className="resize-handle resize-e" onMouseDown={(e) => handleResizeStart(e, el.id, 'e')} style={{ position: 'absolute', right: '-3px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '30px', cursor: 'ew-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7 }} />
                  <div className="resize-handle resize-w" onMouseDown={(e) => handleResizeStart(e, el.id, 'w')} style={{ position: 'absolute', left: '-3px', top: '50%', transform: 'translateY(-50%)', width: '4px', height: '30px', cursor: 'ew-resize', backgroundColor: '#7c3aed', borderRadius: '2px', opacity: 0.7 }} />
                  <div className="resize-handle resize-ne" onMouseDown={(e) => handleResizeStart(e, el.id, 'ne')} style={{ position: 'absolute', top: '-3px', right: '-3px', width: '8px', height: '8px', cursor: 'nesw-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7 }} />
                  <div className="resize-handle resize-nw" onMouseDown={(e) => handleResizeStart(e, el.id, 'nw')} style={{ position: 'absolute', top: '-3px', left: '-3px', width: '8px', height: '8px', cursor: 'nwse-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7 }} />
                  <div className="resize-handle resize-se" onMouseDown={(e) => handleResizeStart(e, el.id, 'se')} style={{ position: 'absolute', bottom: '-3px', right: '-3px', width: '8px', height: '8px', cursor: 'nwse-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7 }} />
                  <div className="resize-handle resize-sw" onMouseDown={(e) => handleResizeStart(e, el.id, 'sw')} style={{ position: 'absolute', bottom: '-3px', left: '-3px', width: '8px', height: '8px', cursor: 'nesw-resize', backgroundColor: '#7c3aed', borderRadius: '1px', opacity: 0.7 }} />
                </>
              )}
            </div>
          );
        })}
      </>
    );
  };

  return (
    <div className="uml-editor">
      <div className="uml-header" style={{ position: 'relative', zIndex: 999, flexShrink: 0 }}>
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
                  onClick={() => { exportToSVG(); }} 
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
                  onClick={() => { exportToJSON(); }} 
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
          <button className="btn-secondary" onClick={handleImportJSON}>Import</button>
        </div>
      </div>

      <div className="uml-container" style={{ flex: 1, minHeight: 0 }}>
        {/* Left Sidebar */}
        <div className="uml-sidebar">
          <h3>Infrastructure</h3>
          <div className="diagram-types">
            {Object.entries(DEPLOYMENT_ELEMENTS).map(([key, elem]) => (
              <div
                key={key}
                className="element-item"
                draggable
                onDragStart={(e) => handleDragStart(e, key)}
                style={{ backgroundColor: elem.color, cursor: 'grab' }}
              >
                <span className="element-icon">{elem.icon}</span>
                <span className="element-label">{elem.label}</span>
              </div>
            ))}
          </div>

          <h3 style={{ marginTop: '24px' }}>Connections</h3>
          {connectionMode && (
            <div style={{ padding: '8px', backgroundColor: '#fef3c7', borderRadius: '4px', marginBottom: '12px', fontSize: '12px', color: '#92400e' }}>
              {connectionStart ? `✓ Click target element (${connectionStart.point.point} edge)` : '✓ Click first element'}
            </div>
          )}
          <div className="diagram-types">
            {Object.entries(CONNECTION_TYPES).map(([key, conn]) => (
              <div
                key={key}
                className="element-item connection-type"
                onClick={() => {
                  if (connectionMode === key) {
                    setConnectionMode(null);
                    setConnectionStart(null);
                  } else {
                    setConnectionMode(key);
                    setConnectionStart(null);
                  }
                }}
                style={{
                  backgroundColor: connectionMode === key ? '#ddd6fe' : '#ede9fe',
                  borderColor: connectionMode === key ? '#7c3aed' : '#ddd6fe'
                }}
              >
                <span className="element-icon">{conn.icon}</span>
                <span className="element-label">{conn.label}</span>
                <span className="connection-hint">click 2x</span>
              </div>
            ))}
          </div>

          <div className="diagram-info">
            <p><strong>Elements:</strong> {elements.length}</p>
            <p><strong>Connections:</strong> {connections.length}</p>
          </div>
        </div>

        {/* Canvas */}
        <div
          ref={canvasRef}
          className="uml-canvas"
          onClick={handleCanvasClick}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
        >
          {isLoading ? <div className="canvas-hint">Loading...</div> : renderCanvas()}
        </div>

        {/* Right Properties Sidebar */}
        <div className="uml-properties">
          <h3>Properties</h3>
          
          {selectedElement ? (
            <>
              {(() => {
                const el = elements.find(e => e.id === selectedElement);
                return el ? (
                  <div className="properties-panel">
                    <label>Label</label>
                    <input
                      type="text"
                      value={el.label}
                      onChange={(e) => updateElement(el.id, { label: e.target.value })}
                      placeholder="Element label"
                    />
                    
                    {(el.type === 'EXECUTION_ENV' || el.type === 'NETWORK' || el.type === 'NODE') && (
                      <>
                        <label>Stereotype</label>
                        <input
                          type="text"
                          value={el.stereotype || ''}
                          onChange={(e) => updateElement(el.id, { stereotype: e.target.value })}
                          placeholder="e.g., processor, network, OS, Docker"
                        />
                      </>
                    )}

                    <button className="btn-danger" onClick={() => deleteElement(el.id)}>
                      🗑️ Delete Element
                    </button>
                  </div>
                ) : null;
              })()}
            </>
          ) : selectedConnection ? (
            <>
              {(() => {
                const conn = connections.find(c => c.id === selectedConnection);
                return conn ? (
                  <div className="properties-panel">
                    <label>Label</label>
                    <input
                      type="text"
                      value={conn.label || ''}
                      onChange={(e) => {
                        setConnections(connections.map(c => c.id === conn.id ? { ...c, label: e.target.value } : c));
                      }}
                      placeholder="Connection label"
                    />

                    <button className="btn-danger" onClick={() => deleteConnection(conn.id)}>
                      🗑️ Delete Connection
                    </button>
                  </div>
                ) : null;
              })()}
            </>
          ) : null}

          {/* Connections list - always visible */}
          <div className="properties-panel" style={{ marginTop: selectedElement || selectedConnection ? '16px' : '0' }}>
            <h4 style={{ marginBottom: '12px', marginTop: '0' }}>Connections ({connections.length})</h4>
            
            {connections.length === 0 ? (
              <p style={{ color: '#999', fontSize: '13px' }}>No connections yet</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {connections.map(conn => {
                  const fromEl = elements.find(el => el.id === conn.from);
                  const toEl = elements.find(el => el.id === conn.to);
                  const connTypeInfo = CONNECTION_TYPES[conn.type];
                  
                  return (
                    <div key={conn.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px',
                      backgroundColor: '#f3f4f6',
                      borderRadius: '6px',
                      border: selectedConnection === conn.id ? '2px solid #7c3aed' : '1px solid #d1d5db',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onClick={() => setSelectedConnection(conn.id)}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: '#333' }}>
                          {connTypeInfo?.label || conn.type}
                        </div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                          {fromEl?.label || 'Unknown'} → {toEl?.label || 'Unknown'}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConnection(conn.id);
                        }}
                        style={{
                          padding: '4px 8px',
                          marginLeft: '8px',
                          backgroundColor: '#fee2e2',
                          border: '1px solid #fca5a5',
                          borderRadius: '4px',
                          color: '#dc2626',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          transition: 'all 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#fca5a5';
                          e.currentTarget.style.color = '#991b1b';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#fee2e2';
                          e.currentTarget.style.color = '#dc2626';
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <input 
        ref={fileInputRef} 
        type="file" 
        accept=".json" 
        style={{ display: 'none' }}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          console.log('File selected:', file);
          if (!file) return;

          try {
            const content = await file.text();
            console.log('File content read');
            const data = JSON.parse(content);
            console.log('JSON parsed:', data);
            
            if (data.elements && Array.isArray(data.elements) && data.connections && Array.isArray(data.connections)) {
              console.log('Valid structure found, importing...');
              setElements(data.elements);
              setConnections(data.connections);
              setTitle(data.title || 'Imported Diagram');
              setSelectedElement(null);
              setSelectedConnection(null);
              alert('✅ Diagram imported successfully!');
            } else {
              console.error('Invalid data structure:', data);
              alert('❌ Invalid JSON structure. Expected elements and connections arrays.');
            }
          } catch (error) {
            console.error('Import error:', error);
            alert('❌ Error importing file: ' + error.message);
          } finally {
            // Reset file input so same file can be imported again
            e.target.value = '';
          }
        }}
      />

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

export default DeploymentDiagramEditor;
