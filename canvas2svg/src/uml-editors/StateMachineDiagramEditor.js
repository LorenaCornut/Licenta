import React, { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../UMLEditor.css';

// ============ HELPER FUNCTIONS - COPIED FROM ClassDiagramEditor ============

function getConnectionPointForElement(element, connectionPoint) {
  // If connectionPoint has edge name and offset, recalculate based on current element position
  if (connectionPoint && typeof connectionPoint === 'object' && connectionPoint.point && connectionPoint.offset !== undefined) {
    const w = element.width || 140;
    const h = element.height || 80;
    const offset = connectionPoint.offset;
    
    switch (connectionPoint.point) {
      case 'top':
        const topX = Math.max(element.x, Math.min(element.x + offset, element.x + w));
        return { x: topX, y: element.y };
      case 'bottom':
        const bottomX = Math.max(element.x, Math.min(element.x + offset, element.x + w));
        return { x: bottomX, y: element.y + h };
      case 'left':
        const leftY = Math.max(element.y, Math.min(element.y + offset, element.y + h));
        return { x: element.x, y: leftY };
      case 'right':
        const rightY = Math.max(element.y, Math.min(element.y + offset, element.y + h));
        return { x: element.x + w, y: rightY };
      default:
        return { x: element.x + w / 2, y: element.y + h / 2 };
    }
  }
  
  // Fallback to center
  const w = element.width || 140;
  const h = element.height || 80;
  return { x: element.x + w / 2, y: element.y + h / 2 };
}

function getClosestPointOnContour(element, pointX, pointY) {
  // Special handling for CHOICE_POINT - snap to the diamond vertices + edges
  if (element.type === 'CHOICE_POINT') {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    
    // Diamond vertices (exact corners on the edges of the bounding box)
    const topVtx = { x: centerX, y: element.y };
    const rightVtx = { x: element.x + element.width, y: centerY };
    const bottomVtx = { x: centerX, y: element.y + element.height };
    const leftVtx = { x: element.x, y: centerY };
    
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
    offset = (closest.x - element.x) / element.width;
  } else {
    offset = (closest.y - element.y) / element.height;
  }
  
  return { edge: closest.edge, offset };
}

const ensureConnectionOffsets = (conns) => {
  return conns.map(conn => {
    // Handle different backend formats
    const fromId = conn.from || conn.fromId;
    const toId = conn.to || conn.toId;
    
    // Prioritize edge/offset format if it exists (new format)
    if (conn.fromEdge && conn.toEdge) {
      return {
        id: conn.id,
        from: fromId,
        to: toId,
        label: conn.label || 'event',
        fromEdge: conn.fromEdge,
        fromOffset: typeof conn.fromOffset === 'number' ? conn.fromOffset : 0.5,
        toEdge: conn.toEdge,
        toOffset: typeof conn.toOffset === 'number' ? conn.toOffset : 0.5
      };
    }
    
    // Fallback to old format: fromPoint/toPoint
    let fromEdge = 'right';
    let fromOffset = 0.5;
    let toEdge = 'left';
    let toOffset = 0.5;
    
    if (conn.fromPoint && typeof conn.fromPoint === 'object') {
      fromEdge = conn.fromPoint.point || 'right';
      fromOffset = (conn.fromPoint.offset || 0);
    }
    if (conn.toPoint && typeof conn.toPoint === 'object') {
      toEdge = conn.toPoint.point || 'left';
      toOffset = (conn.toPoint.offset || 0);
    }
    
    return {
      id: conn.id,
      from: fromId,
      to: toId,
      label: conn.label || conn.text?.label || 'event',
      fromEdge,
      fromOffset: typeof conn.fromOffset === 'number' ? conn.fromOffset : fromOffset,
      toEdge,
      toOffset: typeof conn.toOffset === 'number' ? conn.toOffset : toOffset
    };
  });
};

function detectConnectionPointOnContour(e, element) {
  const elementDiv = document.querySelector(`[data-element-id="${element.id}"]`);
  if (!elementDiv) return null;
  
  const canvasDiv = document.querySelector('.uml-canvas');
  if (!canvasDiv) return null;
  
  const canvasDOMRect = canvasDiv.getBoundingClientRect();
  const clickX = e.clientX - canvasDOMRect.left;
  const clickY = e.clientY - canvasDOMRect.top;
  
  const w = element.width || 140;
  const h = element.height || 80;
  
  // Calculate distance to each edge
  const distToTop = Math.abs(clickY - element.y);
  const distToBottom = Math.abs(clickY - (element.y + h));
  const distToLeft = Math.abs(clickX - element.x);
  const distToRight = Math.abs(clickX - (element.x + w));
  
  // Find closest edge
  const distances = {
    top: distToTop,
    bottom: distToBottom,
    left: distToLeft,
    right: distToRight
  };
  
  const edge = Object.keys(distances).reduce((min, key) => 
    distances[key] < distances[min] ? key : min
  );
  
  // Calculate offset along the edge
  let offset = 0;
  switch (edge) {
    case 'top':
    case 'bottom':
      offset = Math.max(0, Math.min(w, clickX - element.x));
      break;
    case 'left':
    case 'right':
      offset = Math.max(0, Math.min(h, clickY - element.y));
      break;
  }
  
  return {
    x: clickX,
    y: clickY,
    point: edge,
    offset: offset
  };
}

function getElementBounds(el) {
  return {
    x: el.x,
    y: el.y,
    width: el.width || 140,
    height: el.height || 80
  };
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

function lineSegmentsIntersect(x1, y1, x2, y2, x3, y3, x4, y4) {
  const ccw = (ax, ay, bx, by, cx, cy) => {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  };

  return ccw(x1, y1, x3, y3, x4, y4) !== ccw(x2, y2, x3, y3, x4, y4) &&
         ccw(x1, y1, x2, y2, x3, y3) !== ccw(x1, y1, x2, y2, x4, y4);
}

function getContourIntersection(x1, y1, x2, y2, element) {
  const cx = element.x + element.width / 2;
  const cy = element.y + element.height / 2;
  
  // Calculate direction
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: x2, y: y2 };
  
  const dirX = dx / dist;
  const dirY = dy / dist;
  
  // For circles (INITIAL, FINAL states)
  if (element.type === 'INITIAL_STATE' || element.type === 'FINAL_STATE') {
    const radius = element.width / 2;
    return {
      x: Math.round(cx + dirX * radius),
      y: Math.round(cy + dirY * radius)
    };
  }
  
  // For CHOICE_POINT (diamond)
  if (element.type === 'CHOICE_POINT') {
    const points = [
      { x: cx, y: element.y },  // top
      { x: element.x + element.width, y: cy },  // right
      { x: cx, y: element.y + element.height },  // bottom
      { x: element.x, y: cy }   // left
    ];
    
    let closestPoint = null;
    let closestDist = Infinity;
    
    for (let i = 0; i < 4; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % 4];
      
      const denom = (x2 - x1) * (p2.y - p1.y) - (y2 - y1) * (p2.x - p1.x);
      if (Math.abs(denom) < 0.0001) continue;
      
      const t = ((p1.x - x1) * (p2.y - p1.y) - (p1.y - y1) * (p2.x - p1.x)) / denom;
      if (t < 0 || t > 1) continue;
      
      const u = ((p1.x - x1) * (y2 - y1) - (p1.y - y1) * (x2 - x1)) / denom;
      if (u < 0 || u > 1) continue;
      
      const ix = x1 + t * (x2 - x1);
      const iy = y1 + t * (y2 - y1);
      const d = Math.hypot(ix - x2, iy - y2);
      
      if (d < closestDist) {
        closestDist = d;
        closestPoint = { x: Math.round(ix), y: Math.round(iy) };
      }
    }
    
    return closestPoint || { x: x2, y: y2 };
  }
  
  // For STATE (rectangle): calculate which side line intersects
  const left = element.x;
  const right = element.x + element.width;
  const top = element.y;
  const bottom = element.y + element.height;
  
  // Find intersection with rectangle edges
  let intersectPoint = null;
  
  // Check intersection with each side
  // Top edge
  if (dirY < 0) {
    const t = (top - y1) / dy;
    if (t > 0 && t <= 1) {
      const ix = x1 + t * dx;
      if (ix >= left && ix <= right) {
        intersectPoint = { x: Math.round(ix), y: Math.round(top) };
      }
    }
  }
  
  // Bottom edge
  if (!intersectPoint && dirY > 0) {
    const t = (bottom - y1) / dy;
    if (t > 0 && t <= 1) {
      const ix = x1 + t * dx;
      if (ix >= left && ix <= right) {
        intersectPoint = { x: Math.round(ix), y: Math.round(bottom) };
      }
    }
  }
  
  // Left edge
  if (!intersectPoint && dirX < 0) {
    const t = (left - x1) / dx;
    if (t > 0 && t <= 1) {
      const iy = y1 + t * dy;
      if (iy >= top && iy <= bottom) {
        intersectPoint = { x: Math.round(left), y: Math.round(iy) };
      }
    }
  }
  
  // Right edge
  if (!intersectPoint && dirX > 0) {
    const t = (right - x1) / dx;
    if (t > 0 && t <= 1) {
      const iy = y1 + t * dy;
      if (iy >= top && iy <= bottom) {
        intersectPoint = { x: Math.round(right), y: Math.round(iy) };
      }
    }
  }
  
  return intersectPoint || { x: Math.round(x2), y: Math.round(y2) };
}

/**
 * Get point on edge of element at normalized offset (0-1)
 */
function getPointAtOffsetOnEdge(element, edgeType, offset) {
  offset = Math.max(0, Math.min(1, offset || 0.5));
  
  // Special handling for CHOICE_POINT - diamond shape
  if (element.type === 'CHOICE_POINT') {
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    
    // Diamond vertices (exact coordinates on the edges of the bounding box)
    const topVtx = { x: centerX, y: element.y };
    const rightVtx = { x: element.x + element.width, y: centerY };
    const bottomVtx = { x: centerX, y: element.y + element.height };
    const leftVtx = { x: element.x, y: centerY };
    
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
  
  return { x, y };
}

function buildSelfTransitionPath(element, fromEdge, fromOffset, toEdge, toOffset) {
  // Create an angular loop for self-transitions
  // fromEdge and toEdge should be the same for self-transitions
  const w = element.width || 140;
  const h = element.height || 80;
  
  // Get start and end points on the edge
  let startX, startY, endX, endY;
  
  if (fromEdge === 'top') {
    startX = element.x + w * fromOffset;
    startY = element.y;
    endX = element.x + w * toOffset;
    endY = element.y;
  } else if (fromEdge === 'bottom') {
    startX = element.x + w * fromOffset;
    startY = element.y + h;
    endX = element.x + w * toOffset;
    endY = element.y + h;
  } else if (fromEdge === 'left') {
    startX = element.x;
    startY = element.y + h * fromOffset;
    endX = element.x;
    endY = element.y + h * toOffset;
  } else if (fromEdge === 'right') {
    startX = element.x + w;
    startY = element.y + h * fromOffset;
    endX = element.x + w;
    endY = element.y + h * toOffset;
  }
  
  // Create an angular path with sharp corners
  const distance = Math.max(w, h) * 0.5;
  const isVerticalEdge = fromEdge === 'left' || fromEdge === 'right';
  
  if (isVerticalEdge) {
    // Angular path: go out, go up/down, come back
    const outX = fromEdge === 'left' ? startX - distance : startX + distance;
    const midY = (startY + endY) / 2;
    return `M ${Math.round(startX)} ${Math.round(startY)} L ${Math.round(outX)} ${Math.round(startY)} L ${Math.round(outX)} ${Math.round(endY)} L ${Math.round(endX)} ${Math.round(endY)}`;
  } else {
    // Angular path: go up/down, go left/right, come back
    const outY = fromEdge === 'top' ? startY - distance : startY + distance;
    const midX = (startX + endX) / 2;
    return `M ${Math.round(startX)} ${Math.round(startY)} L ${Math.round(startX)} ${Math.round(outY)} L ${Math.round(endX)} ${Math.round(outY)} L ${Math.round(endX)} ${Math.round(endY)}`;
  }
}

function buildOrthogonalPathThroughWaypoints(waypoints) {
  if (waypoints.length === 0) return '';
  if (waypoints.length === 1) {
    return `M ${Math.round(waypoints[0].x)},${Math.round(waypoints[0].y)}`;
  }
  
  const path = [waypoints[0]];
  
  for (let i = 0; i < waypoints.length - 1; i++) {
    const from = waypoints[i];
    const to = waypoints[i + 1];
    
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

function findPathAroundObstacles(x1, y1, x2, y2, elements, excludeIds = []) {
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
    const midX = x1 + (x2 - x1) * 0.5;
    path.push({ x: midX, y: y1 });
    path.push({ x: midX, y: y2 });
    path.push({ x: x2, y: y2 });
    return path;
  }

  const blockingObstacles = obstacles.filter(obs => lineIntersectsRect(x1, y1, x2, y2, obs));
  
  if (blockingObstacles.length === 0) {
    const midX = x1 + (x2 - x1) * 0.5;
    path.push({ x: midX, y: y1 });
    path.push({ x: midX, y: y2 });
    path.push({ x: x2, y: y2 });
    return path;
  }

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
  const strategies = [
    { route: [
      { x: closestObstacle.x + closestObstacle.width + padding, y: y1 },
      { x: closestObstacle.x + closestObstacle.width + padding, y: y2 }
    ]},
    { route: [
      { x: closestObstacle.x - padding, y: y1 },
      { x: closestObstacle.x - padding, y: y2 }
    ]},
    { route: [
      { x: x1, y: closestObstacle.y - padding },
      { x: x2, y: closestObstacle.y - padding }
    ]},
    { route: [
      { x: x1, y: closestObstacle.y + closestObstacle.height + padding },
      { x: x2, y: closestObstacle.y + closestObstacle.height + padding }
    ]}
  ];

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
  
  path.push({ x: x2, y: y2 });
  return path;
}

// ============ STATE MACHINE ELEMENTS ============

const STATE_MACHINE_ELEMENTS = {
  STATE: { label: 'State', icon: '●', color: '#D4E8F8' },
  INITIAL_STATE: { label: 'Initial State', icon: '◯', color: '#333' },
  FINAL_STATE: { label: 'Final State', icon: '◉', color: '#FFF' },
  CHOICE_POINT: { label: 'Choice', icon: '◇', color: '#FFE8D4' }
};

const CONNECTION_TYPES = {
  TRANSITION: { label: 'Transition', icon: '→', color: '#333' }
};

// ============ MAIN COMPONENT ============

function StateMachineDiagramEditor() {
  const { diagramId } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);

  const [title, setTitle] = useState('State Machine Diagram');
  const [elements, setElements] = useState([]);
  const [connections, setConnections] = useState([]);
  const [selectedElement, setSelectedElement] = useState(null);
  const [draggingElement, setDraggingElement] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggedType, setDraggedType] = useState(null);
  const [connectionMode, setConnectionMode] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [editingElementId, setEditingElementId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [editingConnectionId, setEditingConnectionId] = useState(null);
  const [editingConnectionLabel, setEditingConnectionLabel] = useState('');
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [draggingEndpoint, setDraggingEndpoint] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveDialogTitle, setSaveDialogTitle] = useState('');
  const [saveError, setSaveError] = useState('');
  const [currentDiagramId, setCurrentDiagramId] = useState(null);
  const [editingActions, setEditingActions] = useState(null);
  const [editingEntryAction, setEditingEntryAction] = useState('');
  const [editingExitAction, setEditingExitAction] = useState('');
  const [draggingInCanvas, setDraggingInCanvas] = useState(false);

  // Load diagram if editing
  useEffect(() => {
    if (diagramId && diagramId !== 'new') {
      loadDiagram(diagramId);
    } else {
      setCurrentDiagramId(null);
    }
  }, [diagramId]);

  // Load diagram from database
  const loadDiagram = async (id) => {
    try {
      const response = await fetch(`http://localhost:5000/api/diagrams/${id}`);
      const data = await response.json();

      // Backend returns: { diagram: {...}, elements: [...], connections: [...] }
      const diagram = data.diagram;
      const diagramType = (diagram?.type || data.tipDiagrama || '').toString();
      const diagramTypeLower = diagramType.toLowerCase();
      
      // Check for state machine diagram type
      const isStateMachine = diagramType === 'STATE_MACHINE_DIAGRAM' ||
                            diagramType === 'AUTOMAT' ||
                            diagramTypeLower.includes('automat') ||
                            diagramTypeLower.includes('stări') ||
                            diagramTypeLower.includes('stari');
      
      if (isStateMachine) {
        // Normalize elements: backend uses 'name' but frontend expects 'label'
        const normalizedElements = (data.elements || []).map(el => ({
          id: el.id,
          label: el.label || el.name || '',
          type: el.type || 'STATE',
          x: el.x || 100,
          y: el.y || 100,
          width: el.width || 140,
          height: el.height || 80,
          entryAction: el.entryAction || '',
          exitAction: el.exitAction || ''
        }));
        
        setTitle(diagram?.title || data.title || 'State Machine Diagram');
        setElements(normalizedElements);
        setConnections(ensureConnectionOffsets(data.connections || []));
        setCurrentDiagramId(id);
        sessionStorage.setItem('currentDiagramId', id);
      }
    } catch (error) {
      console.error('Error loading diagram:', error);
    }
  };

  // Save diagram
  const handleSaveToDatabase = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
      alert('Trebuie să fii logat!');
      return;
    }

    if (currentDiagramId) {
      const effectiveTitle = (title || 'State Machine Diagram').trim();
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

    setSaveDialogTitle(title || 'State Machine Diagram');
    setShowSaveModal(true);
    setSaveError('');
  };

  const saveDiagram = async ({ diagramTitle, diagramIdToUpdate = null }) => {
    const userId = localStorage.getItem('userId');

    try {
      const diagramData = {
        userId: parseInt(userId),
        title: diagramTitle,
        tipDiagrama: 'STATE_MACHINE_DIAGRAM',
        elements: elements,
        connections: ensureConnectionOffsets(connections),
        ...(diagramIdToUpdate && { diagramId: diagramIdToUpdate })
      };

      const response = await fetch('http://localhost:5000/api/diagrams/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diagramData)
      });

      const result = await response.json();

      if (!response.ok) {
        return { ok: false, message: result.message || 'Eroare la salvare!' };
      }

      const persistedId = result.diagramId || diagramIdToUpdate;
      if (persistedId) {
        setCurrentDiagramId(persistedId);
        sessionStorage.setItem('currentDiagramId', persistedId);
      }

      setTitle(diagramTitle);
      return { ok: true };
    } catch (error) {
      console.error('Error saving diagram:', error);
      return { ok: false, message: `Eroare: ${error.message}` };
    }
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
      alert('✅ Diagrama salvată cu succes!');
    } else {
      setSaveError(result.message || 'Eroare la salvare!');
    }
  };

  // Add element
  const handleAddElement = (type) => {
    const newElement = {
      id: `state-${Date.now()}`,
      type,
      x: 100,
      y: 100,
      width: type === 'INITIAL_STATE' || type === 'FINAL_STATE' ? 40 : 140,
      height: type === 'INITIAL_STATE' || type === 'FINAL_STATE' ? 40 : 80,
      label: type === 'STATE' ? 'New State' : '',
      entryAction: type === 'STATE' ? '' : undefined,
      exitAction: type === 'STATE' ? '' : undefined
    };
    setElements([...elements, newElement]);
  };

  // Drag and drop handlers
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
    const width = draggedType === 'INITIAL_STATE' || draggedType === 'FINAL_STATE' ? 40 : 140;
    const height = draggedType === 'INITIAL_STATE' || draggedType === 'FINAL_STATE' ? 40 : 80;
    const x = Math.max(0, e.clientX - canvasRect.left - width / 2);
    const y = Math.max(0, e.clientY - canvasRect.top - height / 2);

    const newElement = {
      id: `state-${Date.now()}`,
      type: draggedType,
      x,
      y,
      width,
      height,
      label: draggedType === 'STATE' ? 'New State' : '',
      entryAction: draggedType === 'STATE' ? '' : undefined,
      exitAction: draggedType === 'STATE' ? '' : undefined
    };

    setElements([...elements, newElement]);
    setDraggedType(null);
  };

  // Delete element
  const handleDeleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    setConnections(connections.filter(conn => conn.from !== id && conn.to !== id));
    setSelectedElement(null);
  };

  // Handle resize start
  const handleResizeMouseDown = (e, el, handle) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    
    setResizing({
      elementId: el.id,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: el.width,
      startHeight: el.height,
      startElX: el.x,
      startElY: el.y
    });
  };

  // Drag element
  const handleElementMouseDown = (e, el) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    // Don't drag while in connection mode
    if (connectionMode) return;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    setDraggingElement(el.id);
    setDragOffset({
      x: e.clientX - canvasRect.left - el.x,
      y: e.clientY - canvasRect.top - el.y
    });
  };

  // Canvas mouse move for dragging
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

    const handleMouseUp = () => {
      setDraggingElement(null);
    };

    if (draggingElement) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingElement, dragOffset, elements]);

  // Canvas mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!resizing) return;
      
      const { elementId, handle, startX, startY, startWidth, startHeight, startElX, startElY } = resizing;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;
      let newX = startElX;
      let newY = startElY;

      const minWidth = 60;
      const minHeight = 40;

      // Handle different resize handles
      if (handle.includes('right') || handle === 'right') {
        newWidth = Math.max(minWidth, startWidth + deltaX);
      }
      if (handle.includes('bottom') || handle === 'bottom') {
        newHeight = Math.max(minHeight, startHeight + deltaY);
      }
      if (handle.includes('left') || handle === 'left') {
        const potentialWidth = startWidth - deltaX;
        if (potentialWidth >= minWidth) {
          newWidth = potentialWidth;
          newX = startElX + deltaX;
        }
      }
      if (handle.includes('top') || handle === 'top') {
        const potentialHeight = startHeight - deltaY;
        if (potentialHeight >= minHeight) {
          newHeight = potentialHeight;
          newY = startElY + deltaY;
        }
      }

      setElements(elements.map(el => {
        if (el.id !== elementId) return el;
        
        let finalWidth = newWidth;
        let finalHeight = newHeight;
        let finalX = newX;
        let finalY = newY;

        // For circles (INITIAL_STATE, FINAL_STATE), keep width = height
        if (el.type === 'INITIAL_STATE' || el.type === 'FINAL_STATE') {
          const size = Math.max(30, Math.min(finalWidth, finalHeight));
          finalWidth = size;
          finalHeight = size;
        }

        return { ...el, x: Math.max(0, finalX), y: Math.max(0, finalY), width: finalWidth, height: finalHeight };
      }));
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    if (resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizing, elements]);

  // Connection mode
  const handleStartConnection = (e, fromElement) => {
    e.stopPropagation();
    
    // Get click position relative to canvas
    const canvasDiv = document.querySelector('.uml-canvas');
    if (!canvasDiv) return;
    
    const canvasDOMRect = canvasDiv.getBoundingClientRect();
    const clickX = e.clientX - canvasDOMRect.left;
    const clickY = e.clientY - canvasDOMRect.top;
    
    const w = fromElement.width || 140;
    const h = fromElement.height || 80;
    
    // Calculate distance to each edge
    const distToTop = Math.abs(clickY - fromElement.y);
    const distToBottom = Math.abs(clickY - (fromElement.y + h));
    const distToLeft = Math.abs(clickX - fromElement.x);
    const distToRight = Math.abs(clickX - (fromElement.x + w));
    
    // Find closest edge
    const distances = {
      top: distToTop,
      bottom: distToBottom,
      left: distToLeft,
      right: distToRight
    };
    
    const edge = Object.keys(distances).reduce((min, key) => 
      distances[key] < distances[min] ? key : min
    );
    
    // Calculate normalized offset (0-1)
    let offset = 0.5;
    switch (edge) {
      case 'top':
      case 'bottom':
        offset = Math.max(0, Math.min(1, (clickX - fromElement.x) / w));
        break;
      case 'left':
      case 'right':
        offset = Math.max(0, Math.min(1, (clickY - fromElement.y) / h));
        break;
    }
    
    setConnectionMode('active');
    setConnectionStart({ 
      element: fromElement, 
      edge: edge,
      offset: offset
    });
    setSelectedElement(null);
  };

  const handleFinishConnection = (e, toElement) => {
    e.stopPropagation();
    if (!connectionStart) {
      setConnectionMode(null);
      setConnectionStart(null);
      return;
    }

    // Get click position relative to canvas
    const canvasDiv = document.querySelector('.uml-canvas');
    if (!canvasDiv) {
      setConnectionMode(null);
      setConnectionStart(null);
      return;
    }
    
    const canvasDOMRect = canvasDiv.getBoundingClientRect();
    const clickX = e.clientX - canvasDOMRect.left;
    const clickY = e.clientY - canvasDOMRect.top;
    
    const w = toElement.width || 140;
    const h = toElement.height || 80;
    
    // Calculate distance to each edge
    const distToTop = Math.abs(clickY - toElement.y);
    const distToBottom = Math.abs(clickY - (toElement.y + h));
    const distToLeft = Math.abs(clickX - toElement.x);
    const distToRight = Math.abs(clickX - (toElement.x + w));
    
    // Find closest edge
    const distances = {
      top: distToTop,
      bottom: distToBottom,
      left: distToLeft,
      right: distToRight
    };
    
    const edge = Object.keys(distances).reduce((min, key) => 
      distances[key] < distances[min] ? key : min
    );
    
    // Calculate normalized offset (0-1)
    let offset = 0.5;
    switch (edge) {
      case 'top':
      case 'bottom':
        offset = Math.max(0, Math.min(1, (clickX - toElement.x) / w));
        break;
      case 'left':
      case 'right':
        offset = Math.max(0, Math.min(1, (clickY - toElement.y) / h));
        break;
    }

    const newConnection = {
      id: `trans-${Date.now()}`,
      from: connectionStart.element.id,
      to: toElement.id,
      label: 'event',
      fromEdge: connectionStart.edge,
      fromOffset: connectionStart.offset,
      toEdge: edge,
      toOffset: offset
    };

    setConnections([...connections, newConnection]);
    setConnectionMode(null);
    setConnectionStart(null);
  };

  const handleEndpointDrag = (e) => {
    if (!draggingEndpoint) return;
    
    const { connId, endpointType } = draggingEndpoint;
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    
    const elementId = endpointType === 'from' ? conn.from : conn.to;
    const element = elements.find(e => e.id === elementId);
    if (!element) return;
    
    const canvasDiv = document.querySelector('.uml-canvas');
    if (!canvasDiv) return;
    
    const canvasRect = canvasDiv.getBoundingClientRect();
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

  const handleEndpointMouseDown = (e, connId, endpointType) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggingEndpoint({ connId, endpointType });
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
  }, [draggingEndpoint, connections, elements]);

  useEffect(() => {
    const handleImportFile = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const content = await file.text();
        const data = JSON.parse(content);
        if (data.elements && data.connections) {
          setElements(data.elements);
          setConnections(ensureConnectionOffsets(data.connections));
          setTitle(data.title || 'Imported Diagram');
          setSelectedElement(null);
          setSelectedConnection(null);
          alert('✅ Diagram imported successfully!');
        }
      } catch (error) {
        alert('Error importing file');
      }
    };

    const input = fileInputRef.current;
    if (input) {
      input.addEventListener('change', handleImportFile);
      return () => input.removeEventListener('change', handleImportFile);
    }
  }, []);

  // Export to SVG
  const handleExportSVG = () => {
    const svg = generateSVG();
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportJSON = () => {
    const data = { title, elements, connections };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = () => {
    fileInputRef.current?.click();
  };

  const generateSVG = () => {
    let svg = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';
    svg += '<svg width="1200" height="800" xmlns="http://www.w3.org/2000/svg">\n';
    svg += '<defs><marker id="arrowStateTransition" markerWidth="16" markerHeight="16" refX="15" refY="8" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 16 8 L 0 16 Z" fill="#333" stroke="#333" stroke-width="0.5"/></marker></defs>\n';
    svg += '<rect width="1200" height="800" fill="white" stroke="#ccc" stroke-width="1"/>\n';

    // Draw connections
    for (const conn of connections) {
      const fromEl = elements.find(e => e.id === conn.from);
      const toEl = elements.find(e => e.id === conn.to);
      if (!fromEl || !toEl) continue;

      let pathD;
      let midX, midY;

      // Check if it's a self-transition
      if (conn.from === conn.to) {
        // Self-transition: use curved path
        pathD = buildSelfTransitionPath(fromEl, conn.fromEdge || 'top', conn.fromOffset || 0.5, conn.toEdge || 'top', conn.toOffset || 0.5);
        
        // Calculate midpoint for label (at the top of the curve)
        const w = fromEl.width || 140;
        const h = fromEl.height || 80;
        if (conn.fromEdge === 'top' || conn.fromEdge === 'bottom') {
          midX = (fromEl.x + w * conn.fromOffset + fromEl.x + w * conn.toOffset) / 2;
          midY = conn.fromEdge === 'top' ? fromEl.y - h * 0.4 : fromEl.y + h + h * 0.4;
        } else {
          midX = conn.fromEdge === 'left' ? fromEl.x - w * 0.4 : fromEl.x + w + w * 0.4;
          midY = (fromEl.y + h * conn.fromOffset + fromEl.y + h * conn.toOffset) / 2;
        }
      } else {
        // Regular transition: use orthogonal path
        const fromPoint = getPointAtOffsetOnEdge(fromEl, conn.fromEdge || 'right', conn.fromOffset || 0.5);
        const toPoint = getPointAtOffsetOnEdge(toEl, conn.toEdge || 'left', conn.toOffset || 0.5);

        const waypoints = findPathAroundObstacles(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, elements, [fromEl.id, toEl.id]);
        pathD = buildOrthogonalPathThroughWaypoints(waypoints);

        midX = (fromPoint.x + toPoint.x) / 2;
        midY = (fromPoint.y + toPoint.y) / 2;
      }

      svg += `<path d="${pathD}" stroke="#333" stroke-width="2" fill="none" marker-end="url(#arrowStateTransition)" />\n`;

      if (conn.label) {
        svg += `<text x="${midX}" y="${midY - 5}" font-family="Arial" font-size="11" fill="#333" text-anchor="middle">${conn.label}</text>\n`;
      }
    }

    // Draw elements
    for (const el of elements) {
      if (el.type === 'STATE') {
        svg += `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${el.height}" rx="20" ry="20" fill="#D4E8F8" stroke="#333" stroke-width="2" />\n`;
        svg += `<text x="${el.x + el.width / 2}" y="${el.y + el.height / 2 - 10}" font-family="Arial" font-size="12" fill="#333" text-anchor="middle" font-weight="bold">${el.label || 'State'}</text>\n`;
        // Add entry/exit actions
        if (el.entryAction) {
          svg += `<text x="${el.x + 6}" y="${el.y + el.height / 2 + 5}" font-family="Arial" font-size="9" fill="#666">+On Entry / ${el.entryAction}</text>\n`;
        }
        if (el.exitAction) {
          svg += `<text x="${el.x + 6}" y="${el.y + el.height / 2 + 18}" font-family="Arial" font-size="9" fill="#666">+On Exit / ${el.exitAction}</text>\n`;
        }
      } else if (el.type === 'INITIAL_STATE') {
        svg += `<circle cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" r="${el.width / 2}" fill="#333" stroke="#333" stroke-width="2" />\n`;
      } else if (el.type === 'FINAL_STATE') {
        svg += `<circle cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" r="${el.width / 2}" fill="white" stroke="#333" stroke-width="2" />\n`;
        svg += `<circle cx="${el.x + el.width / 2}" cy="${el.y + el.height / 2}" r="${el.width / 4}" fill="#333" stroke="#333" stroke-width="1" />\n`;
      } else if (el.type === 'CHOICE_POINT') {
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        svg += `<polygon points="${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}" fill="#FFE8D4" stroke="#333" stroke-width="2" />\n`;
      }
    }

    svg += '</svg>';
    return svg;
  };

  return (
    <>
      <div className="uml-editor">
        <div className="uml-header">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            ← Back
          </button>
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
                  minWidth: '180px',
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
            <button className="btn-secondary" onClick={handleImportJSON}>Import</button>
          </div>
        </div>

        <div className="uml-container">
          <div className="uml-sidebar">
            <h3>Elements</h3>
            <div className="diagram-types">
              {Object.entries(STATE_MACHINE_ELEMENTS).map(([key, data]) => (
                <div
                  key={key}
                  className="element-item"
                  draggable
                  onClick={() => handleAddElement(key)}
                  onDragStart={(e) => handleDragStart(e, key)}
                  title={data.label}
                >
                  <span className="element-icon">{data.icon}</span>
                  <span className="element-label">{data.label}</span>
                </div>
              ))}
            </div>

            <div className="element-item connection-type" onClick={() => setConnectionMode(connectionMode ? null : 'TRANSITION')} style={{ cursor: 'pointer', marginTop: '8px', border: connectionMode ? '2px dashed #f59e0b' : '1px solid #ddd6fe' }}>
              <span className="element-icon">➜</span>
              <span className="element-label">Transition</span>
              {connectionMode && <span className="connection-hint">click</span>}
            </div>

            <div className="diagram-info">
              <p><strong>Elements:</strong> {elements.length}</p>
              <p><strong>Transitions:</strong> {connections.length}</p>
              <p style={{ marginTop: '8px', fontSize: '12px', color: '#9168b7' }}>
                💡 Dublu-click pentru a edita
              </p>
            </div>
          </div>

          <svg
            ref={canvasRef}
            className={`uml-canvas ${draggingInCanvas ? 'drag-over' : ''}`}
            onClick={() => {
              setSelectedElement(null);
              setConnectionMode(null);
              setConnectionStart(null);
            }}
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
            onDragLeave={handleCanvasDragLeave}
          >
            {/* Marker definitions */}
            <defs>
              {/* STATE TRANSITION - Solid filled triangle arrow */}
              <marker id="arrowStateTransition" markerWidth="16" markerHeight="16" refX="15" refY="8" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 16 8 L 0 16 Z" fill="#333" stroke="#333" strokeWidth="0.5"/>
              </marker>
            </defs>

            {/* Draw connections */}
            {connections.map(conn => {
              const fromEl = elements.find(e => e.id === conn.from);
              const toEl = elements.find(e => e.id === conn.to);
              if (!fromEl || !toEl) return null;

              let pathD, fromPoint, toPoint, midX, midY;
              const isSelected = selectedConnection === conn.id;
              const w = fromEl.width || 140;
              const h = fromEl.height || 80;

              // Check if it's a self-transition
              if (conn.from === conn.to) {
                // Self-transition: use curved path
                pathD = buildSelfTransitionPath(fromEl, conn.fromEdge || 'top', conn.fromOffset || 0.5, conn.toEdge || 'top', conn.toOffset || 0.5);
                
                // Calculate points for endpoints and label
                if (conn.fromEdge === 'top' || conn.fromEdge === 'bottom') {
                  fromPoint = { x: fromEl.x + w * conn.fromOffset, y: conn.fromEdge === 'top' ? fromEl.y : fromEl.y + h };
                  toPoint = { x: fromEl.x + w * conn.toOffset, y: conn.toEdge === 'top' ? fromEl.y : fromEl.y + h };
                  midX = (fromPoint.x + toPoint.x) / 2;
                  midY = conn.fromEdge === 'top' ? fromEl.y - h * 0.4 : fromEl.y + h + h * 0.4;
                } else {
                  fromPoint = { x: conn.fromEdge === 'left' ? fromEl.x : fromEl.x + w, y: fromEl.y + h * conn.fromOffset };
                  toPoint = { x: conn.toEdge === 'left' ? fromEl.x : fromEl.x + w, y: fromEl.y + h * conn.toOffset };
                  midX = conn.fromEdge === 'left' ? fromEl.x - w * 0.4 : fromEl.x + w + w * 0.4;
                  midY = (fromPoint.y + toPoint.y) / 2;
                }
              } else {
                // Regular transition: use orthogonal path
                fromPoint = getPointAtOffsetOnEdge(fromEl, conn.fromEdge || 'right', conn.fromOffset || 0.5);
                toPoint = getPointAtOffsetOnEdge(toEl, conn.toEdge || 'left', conn.toOffset || 0.5);

                const waypoints = findPathAroundObstacles(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y, elements, [fromEl.id, toEl.id]);
                pathD = buildOrthogonalPathThroughWaypoints(waypoints);

                midX = (fromPoint.x + toPoint.x) / 2;
                midY = (fromPoint.y + toPoint.y) / 2;
              }

              return (
                <g key={conn.id}>
                  <path d={pathD} stroke="#333" strokeWidth="2" fill="none" markerEnd="url(#arrowStateTransition)" onClick={(e) => { e.stopPropagation(); setSelectedConnection(isSelected ? null : conn.id); }} style={{ cursor: 'pointer' }} />
                  {conn.label && (
                    <text
                      x={midX}
                      y={midY - 8}
                      fontSize="11"
                      fill="#333"
                      textAnchor="middle"
                      fontWeight="bold"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingConnectionId(conn.id);
                        setEditingConnectionLabel(conn.label);
                      }}
                      style={{ cursor: 'pointer' }}
                    >
                      {conn.label}
                    </text>
                  )}
                  {/* Draggable endpoints - only when selected */}
                  {isSelected && (
                    <>
                      <circle
                        cx={fromPoint.x}
                        cy={fromPoint.y}
                        r={6}
                        fill="#ec4899"
                        stroke="#fff"
                        strokeWidth="2"
                        style={{ cursor: 'grab', transition: 'r 0.15s ease' }}
                        onMouseDown={(e) => handleEndpointMouseDown(e, conn.id, 'from')}
                        onMouseEnter={(e) => e.target.setAttribute('r', '8')}
                        onMouseLeave={(e) => e.target.setAttribute('r', '6')}
                      />
                      <circle
                        cx={toPoint.x}
                        cy={toPoint.y}
                        r={6}
                        fill="#ec4899"
                        stroke="#fff"
                        strokeWidth="2"
                        style={{ cursor: 'grab', transition: 'r 0.15s ease' }}
                        onMouseDown={(e) => handleEndpointMouseDown(e, conn.id, 'to')}
                        onMouseEnter={(e) => e.target.setAttribute('r', '8')}
                        onMouseLeave={(e) => e.target.setAttribute('r', '6')}
                      />
                    </>
                  )}
                </g>
              );
            })}

            {/* Draw elements */}
            {elements.map(el => {
              const isSelected = selectedElement === el.id;

              if (el.type === 'STATE') {
                return (
                  <g
                    key={el.id}
                    style={{ cursor: connectionMode ? 'crosshair' : 'move' }}
                    onMouseDown={(e) => handleElementMouseDown(e, el)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectionMode) {
                        if (!connectionStart) {
                          handleStartConnection(e, el);
                        } else if (connectionStart.id !== el.id) {
                          handleFinishConnection(e, el);
                        }
                      } else {
                        setSelectedElement(el.id);
                      }
                    }}
                  >
                    <rect
                      x={el.x}
                      y={el.y}
                      width={el.width}
                      height={el.height}
                      rx="20"
                      ry="20"
                      fill="#D4E8F8"
                      stroke={isSelected ? '#dc2626' : '#333'}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    <text
                      x={el.x + el.width / 2}
                      y={el.y + el.height / 2 - 10}
                      fontSize="12"
                      fill="#333"
                      textAnchor="middle"
                      fontWeight="bold"
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setEditingElementId(el.id);
                        setEditingText(el.label);
                      }}
                      style={{ pointerEvents: 'none' }}
                    >
                      {el.label}
                    </text>
                    {/* Entry/Exit Actions */}
                    {el.entryAction && (
                      <text
                        x={el.x + 6}
                        y={el.y + el.height / 2 + 5}
                        fontSize="9"
                        fill="#666"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingActions(el.id);
                          setEditingEntryAction(el.entryAction || '');
                          setEditingExitAction(el.exitAction || '');
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        +On Entry / {el.entryAction}
                      </text>
                    )}
                    {el.exitAction && (
                      <text
                        x={el.x + 6}
                        y={el.y + el.height / 2 + 18}
                        fontSize="9"
                        fill="#666"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingActions(el.id);
                          setEditingEntryAction(el.entryAction || '');
                          setEditingExitAction(el.exitAction || '');
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        +On Exit / {el.exitAction}
                      </text>
                    )}
                    {!el.entryAction && !el.exitAction && (
                      <text
                        x={el.x + 6}
                        y={el.y + el.height / 2 + 10}
                        fontSize="10"
                        fill="#999"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setEditingActions(el.id);
                          setEditingEntryAction(el.entryAction || '');
                          setEditingExitAction(el.exitAction || '');
                        }}
                        style={{ cursor: 'pointer' }}
                      >
                        [click to add actions]
                      </text>
                    )}

                    {/* Resize handles - only when selected */}
                    {isSelected && (
                      <>
                        {/* Top-left */}
                        <circle cx={el.x} cy={el.y} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'top-left'); }} style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }} />
                        {/* Top */}
                        <circle cx={el.x + el.width / 2} cy={el.y} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'top'); }} style={{ cursor: 'ns-resize', pointerEvents: 'auto' }} />
                        {/* Top-right */}
                        <circle cx={el.x + el.width} cy={el.y} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'top-right'); }} style={{ cursor: 'nesw-resize', pointerEvents: 'auto' }} />
                        {/* Right */}
                        <circle cx={el.x + el.width} cy={el.y + el.height / 2} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'right'); }} style={{ cursor: 'ew-resize', pointerEvents: 'auto' }} />
                        {/* Bottom-right */}
                        <circle cx={el.x + el.width} cy={el.y + el.height} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'bottom-right'); }} style={{ cursor: 'se-resize', pointerEvents: 'auto' }} />
                        {/* Bottom */}
                        <circle cx={el.x + el.width / 2} cy={el.y + el.height} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'bottom'); }} style={{ cursor: 'ns-resize', pointerEvents: 'auto' }} />
                        {/* Bottom-left */}
                        <circle cx={el.x} cy={el.y + el.height} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'bottom-left'); }} style={{ cursor: 'sw-resize', pointerEvents: 'auto' }} />
                        {/* Left */}
                        <circle cx={el.x} cy={el.y + el.height / 2} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'left'); }} style={{ cursor: 'ew-resize', pointerEvents: 'auto' }} />
                      </>
                    )}

                  </g>
                );
              }

              if (el.type === 'INITIAL_STATE') {
                return (
                  <g
                    key={el.id}
                    style={{ cursor: connectionMode ? 'crosshair' : 'move' }}
                    onMouseDown={(e) => handleElementMouseDown(e, el)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectionMode) {
                        if (!connectionStart) {
                          handleStartConnection(e, el);
                        } else if (connectionStart.id !== el.id) {
                          handleFinishConnection(e, el);
                        }
                      } else {
                        setSelectedElement(el.id);
                      }
                    }}
                  >
                    <circle
                      cx={el.x + el.width / 2}
                      cy={el.y + el.height / 2}
                      r={el.width / 2}
                      fill="#333"
                      stroke={isSelected ? '#dc2626' : '#333'}
                      strokeWidth={isSelected ? 3 : 2}
                    />

                    {/* Resize handles for circle - only when selected */}
                    {isSelected && (
                      <>
                        {/* Top-left */}
                        <circle cx={el.x} cy={el.y} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'top-left'); }} style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }} />
                        {/* Top */}
                        <circle cx={el.x + el.width / 2} cy={el.y} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'top'); }} style={{ cursor: 'ns-resize', pointerEvents: 'auto' }} />
                        {/* Top-right */}
                        <circle cx={el.x + el.width} cy={el.y} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'top-right'); }} style={{ cursor: 'nesw-resize', pointerEvents: 'auto' }} />
                        {/* Right */}
                        <circle cx={el.x + el.width} cy={el.y + el.height / 2} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'right'); }} style={{ cursor: 'ew-resize', pointerEvents: 'auto' }} />
                        {/* Bottom-right */}
                        <circle cx={el.x + el.width} cy={el.y + el.height} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'bottom-right'); }} style={{ cursor: 'se-resize', pointerEvents: 'auto' }} />
                        {/* Bottom */}
                        <circle cx={el.x + el.width / 2} cy={el.y + el.height} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'bottom'); }} style={{ cursor: 'ns-resize', pointerEvents: 'auto' }} />
                        {/* Bottom-left */}
                        <circle cx={el.x} cy={el.y + el.height} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'bottom-left'); }} style={{ cursor: 'sw-resize', pointerEvents: 'auto' }} />
                        {/* Left */}
                        <circle cx={el.x} cy={el.y + el.height / 2} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'left'); }} style={{ cursor: 'ew-resize', pointerEvents: 'auto' }} />
                        
                        {/* Bounding box rectangle */}
                        <rect x={el.x} y={el.y} width={el.width} height={el.height} fill="none" stroke="#a78bfa" strokeWidth="1" strokeDasharray="4" pointerEvents="none" />
                      </>
                    )}

                  </g>
                );
              }

              if (el.type === 'FINAL_STATE') {
                return (
                  <g
                    key={el.id}
                    style={{ cursor: connectionMode ? 'crosshair' : 'move' }}
                    onMouseDown={(e) => handleElementMouseDown(e, el)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectionMode) {
                        if (!connectionStart) {
                          handleStartConnection(e, el);
                        } else if (connectionStart.id !== el.id) {
                          handleFinishConnection(e, el);
                        }
                      } else {
                        setSelectedElement(el.id);
                      }
                    }}
                  >
                    <circle
                      cx={el.x + el.width / 2}
                      cy={el.y + el.height / 2}
                      r={el.width / 2}
                      fill="white"
                      stroke={isSelected ? '#dc2626' : '#333'}
                      strokeWidth={isSelected ? 3 : 2}
                    />
                    <circle
                      cx={el.x + el.width / 2}
                      cy={el.y + el.height / 2}
                      r={el.width / 4}
                      fill="#333"
                    />

                    {/* Resize handles for circle - only when selected */}
                    {isSelected && (
                      <>
                        {/* Top-left */}
                        <circle cx={el.x} cy={el.y} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'top-left'); }} style={{ cursor: 'nwse-resize', pointerEvents: 'auto' }} />
                        {/* Top */}
                        <circle cx={el.x + el.width / 2} cy={el.y} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'top'); }} style={{ cursor: 'ns-resize', pointerEvents: 'auto' }} />
                        {/* Top-right */}
                        <circle cx={el.x + el.width} cy={el.y} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'top-right'); }} style={{ cursor: 'nesw-resize', pointerEvents: 'auto' }} />
                        {/* Right */}
                        <circle cx={el.x + el.width} cy={el.y + el.height / 2} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'right'); }} style={{ cursor: 'ew-resize', pointerEvents: 'auto' }} />
                        {/* Bottom-right */}
                        <circle cx={el.x + el.width} cy={el.y + el.height} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'bottom-right'); }} style={{ cursor: 'se-resize', pointerEvents: 'auto' }} />
                        {/* Bottom */}
                        <circle cx={el.x + el.width / 2} cy={el.y + el.height} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'bottom'); }} style={{ cursor: 'ns-resize', pointerEvents: 'auto' }} />
                        {/* Bottom-left */}
                        <circle cx={el.x} cy={el.y + el.height} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'bottom-left'); }} style={{ cursor: 'sw-resize', pointerEvents: 'auto' }} />
                        {/* Left */}
                        <circle cx={el.x} cy={el.y + el.height / 2} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'left'); }} style={{ cursor: 'ew-resize', pointerEvents: 'auto' }} />
                        
                        {/* Bounding box rectangle */}
                        <rect x={el.x} y={el.y} width={el.width} height={el.height} fill="none" stroke="#a78bfa" strokeWidth="1" strokeDasharray="4" pointerEvents="none" />
                      </>
                    )}

                  </g>
                );
              }

              if (el.type === 'CHOICE_POINT') {
                const cx = el.x + el.width / 2;
                const cy = el.y + el.height / 2;
                return (
                  <g
                    key={el.id}
                    style={{ cursor: connectionMode ? 'crosshair' : 'move' }}
                    onMouseDown={(e) => handleElementMouseDown(e, el)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectionMode) {
                        if (!connectionStart) {
                          handleStartConnection(e, el);
                        } else if (connectionStart.id !== el.id) {
                          handleFinishConnection(e, el);
                        }
                      } else {
                        setSelectedElement(el.id);
                      }
                    }}
                  >
                    <polygon
                      points={`${cx},${el.y} ${el.x + el.width},${cy} ${cx},${el.y + el.height} ${el.x},${cy}`}
                      fill="#FFE8D4"
                      stroke={isSelected ? '#dc2626' : '#333'}
                      strokeWidth={isSelected ? 3 : 2}
                    />

                    {/* Resize handles - only when selected */}
                    {isSelected && (
                      <>
                        {/* Top */}
                        <circle cx={cx} cy={el.y} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'top'); }} style={{ cursor: 'ns-resize', pointerEvents: 'auto' }} />
                        {/* Right */}
                        <circle cx={el.x + el.width} cy={cy} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'right'); }} style={{ cursor: 'ew-resize', pointerEvents: 'auto' }} />
                        {/* Bottom */}
                        <circle cx={cx} cy={el.y + el.height} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'bottom'); }} style={{ cursor: 'ns-resize', pointerEvents: 'auto' }} />
                        {/* Left */}
                        <circle cx={el.x} cy={cy} r="5" fill="#a78bfa" stroke="white" strokeWidth="1" onMouseDown={(e) => { e.stopPropagation(); handleResizeMouseDown(e, el, 'left'); }} style={{ cursor: 'ew-resize', pointerEvents: 'auto' }} />
                        
                        {/* Bounding box rectangle */}
                        <rect x={el.x} y={el.y} width={el.width} height={el.height} fill="none" stroke="#a78bfa" strokeWidth="1" strokeDasharray="4" pointerEvents="none" />
                      </>
                    )}

                  </g>
                );
              }

              return null;
            })}
          </svg>

          {editingElementId && (
            <textarea
              className="element-text-edit"
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.ctrlKey) {
                  setElements(elements.map(el =>
                    el.id === editingElementId ? { ...el, label: editingText } : el
                  ));
                  setEditingElementId(null);
                } else if (e.key === 'Escape') {
                  setEditingElementId(null);
                }
              }}
              onBlur={() => {
                setElements(elements.map(el =>
                  el.id === editingElementId ? { ...el, label: editingText } : el
                ));
                setEditingElementId(null);
              }}
              autoFocus
            />
          )}

          {/* Properties Panel */}
          <div className="uml-sidebar" style={{ borderLeft: '1px solid #e9d5ff', borderRight: 'none', maxWidth: '280px', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ flexShrink: 0, paddingBottom: '12px' }}>
              <h3 style={{ margin: '0 0 12px 0' }}>Properties</h3>
              {selectedElement ? (
                (() => {
                  const el = elements.find(e => e.id === selectedElement);
                  if (!el) return null;
                  
                  return (
                    <>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '13px', color: '#5b21b6', fontWeight: 600, marginBottom: '6px' }}>Type:</label>
                        <div style={{ fontSize: '13px', color: '#5b21b6', fontWeight: 600, padding: '8px 10px', background: '#f3e8ff', borderRadius: '6px' }}>
                          {STATE_MACHINE_ELEMENTS[el.type]?.label || el.type}
                        </div>
                      </div>
                      
                      {el.type === 'STATE' && (
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ display: 'block', fontSize: '13px', color: '#5b21b6', fontWeight: 600, marginBottom: '6px' }}>Label:</label>
                          <input
                            type="text"
                            value={el.label || ''}
                            onChange={(e) => setElements(elements.map(item =>
                              item.id === selectedElement ? { ...item, label: e.target.value } : item
                            ))}
                            placeholder="Enter state name..."
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: '1px solid #ddd6fe',
                              borderRadius: '6px',
                              fontSize: '13px',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      )}
                      
                      <button
                        onClick={() => handleDeleteElement(selectedElement)}
                        className="btn-danger"
                        style={{ width: '100%' }}
                      >
                        🗑️ Delete
                      </button>
                    </>
                  );
                })()
              ) : selectedConnection ? (
                (() => {
                  const conn = connections.find(c => c.id === selectedConnection);
                  if (!conn) return null;
                  
                  return (
                    <>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '13px', color: '#5b21b6', fontWeight: 600, marginBottom: '6px' }}>Transition Label:</label>
                        <input
                          type="text"
                          value={conn.label || ''}
                          onChange={(e) => setConnections(connections.map(c =>
                            c.id === selectedConnection ? { ...c, label: e.target.value } : c
                          ))}
                          placeholder="Event [Condition] / Action"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            border: '1px solid #ddd6fe',
                            borderRadius: '6px',
                            fontSize: '13px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      
                      <button
                        onClick={() => setConnections(connections.filter(c => c.id !== selectedConnection))}
                        className="btn-danger"
                        style={{ width: '100%' }}
                      >
                        🗑️ Delete Connection
                      </button>
                    </>
                  );
                })()              ) : selectedConnection ? (
                (() => {
                  const conn = connections.find(c => c.id === selectedConnection);
                  if (!conn) return null;
                  
                  return (
                    <>
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ display: 'block', fontSize: '13px', color: '#5b21b6', fontWeight: 600, marginBottom: '6px' }}>Transition Label:</label>
                        <input
                          type="text"
                          value={conn.label || ''}
                          onChange={(e) => setConnections(connections.map(c =>
                            c.id === selectedConnection ? { ...c, label: e.target.value } : c
                          ))}
                          placeholder="Event [Condition] / Action"
                          style={{
                            width: '100%',
                            padding: '8px 10px',
                            border: '1px solid #ddd6fe',
                            borderRadius: '6px',
                            fontSize: '13px',
                            boxSizing: 'border-box'
                          }}
                        />
                      </div>
                      
                      <button
                        onClick={() => setConnections(connections.filter(c => c.id !== selectedConnection))}
                        className="btn-danger"
                        style={{ width: '100%' }}
                      >
                        🗑️ Delete Connection
                      </button>
                    </>
                  );
                })()              ) : (
                <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
                  Select an element to edit
                </div>
              )}
            </div>

            <hr style={{ margin: '12px 0', border: 'none', borderTop: '1px solid #d1d5db' }} />

            <h3 style={{ margin: '0 0 12px 0', flexShrink: 0 }}>All Connections</h3>
            {connections.length === 0 ? (
              <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
                No connections yet
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '4px', paddingBottom: '32px' }}>
                {connections.map((conn) => {
                  const fromEl = elements.find(e => e.id === conn.from);
                  const toEl = elements.find(e => e.id === conn.to);
                  return (
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
                        <div style={{ fontWeight: '600', marginBottom: '2px', color: '#5b21b6' }}>Transition</div>
                        <div style={{ color: '#666', fontSize: '11px' }}>
                          {fromEl?.label || 'State'} → {toEl?.label || 'State'}
                        </div>
                        {conn.label && <div style={{ color: '#9ca3af', fontSize: '10px', marginTop: '2px' }}>"{conn.label}"</div>}
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
                          fontSize: '12px',
                          fontWeight: '600'
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

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} />

      {showSaveModal && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <h2>Salvează Diagrama</h2>
            <label>Nume diagramă:</label>
            <input
              type="text"
              className="modal-input"
              value={saveDialogTitle}
              onChange={(e) => setSaveDialogTitle(e.target.value)}
              placeholder="Introdu numele diagramei..."
              onKeyPress={(e) => e.key === 'Enter' && confirmSave()}
              autoFocus
            />
            {saveError && (
              <div className="modal-error">
                {saveError}
              </div>
            )}
            <div className="modal-buttons">
              <button
                className="btn-secondary"
                onClick={() => {
                  setShowSaveModal(false);
                  setSaveError('');
                }}
              >
                Anulează
              </button>
              <button
                className="btn-primary"
                onClick={confirmSave}
              >
                Salvează
              </button>
            </div>
          </div>
        </div>
      )}

      {editingActions && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <h2>Entry/Exit Actions</h2>
            <label>On Entry:</label>
            <input
              type="text"
              className="modal-input"
              value={editingEntryAction}
              onChange={(e) => setEditingEntryAction(e.target.value)}
              placeholder="e.g., pickup"
              autoFocus
            />
            <label style={{ marginTop: '12px' }}>On Exit:</label>
            <input
              type="text"
              className="modal-input"
              value={editingExitAction}
              onChange={(e) => setEditingExitAction(e.target.value)}
              placeholder="e.g., disconnect"
            />
            <div className="modal-buttons" style={{ marginTop: '16px' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  setEditingActions(null);
                  setEditingEntryAction('');
                  setEditingExitAction('');
                }}
              >
                Anulează
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  const updatedElements = elements.map(el => 
                    el.id === editingActions
                      ? { ...el, entryAction: editingEntryAction, exitAction: editingExitAction }
                      : el
                  );
                  setElements(updatedElements);
                  setEditingActions(null);
                  setEditingEntryAction('');
                  setEditingExitAction('');
                }}
              >
                Salvează
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default StateMachineDiagramEditor;
