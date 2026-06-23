
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../UMLEditor.css';

// Helper: calculează distanța de la un punct la un segment
function distanceToSegment(px, py, x1, y1, x2, y2) {
  const l2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (l2 === 0) return { dist: Math.hypot(px - x1, py - y1), projX: x1, projY: y1, t: 0 };
  let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * (x2 - x1);
  const projY = y1 + t * (y2 - y1);
  return { dist: Math.hypot(px - projX, py - projY), projX, projY, t };
}

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


// Lee/BFS grid-based orthogonal routing for UML edges
function findPathAroundObstacles(x1, y1, x2, y2, elements, excludeIds = [], targetEdge = null) {
  // Grid params
  const GRID_SIZE = 10;
  const CANVAS_W = 2000;
  const CANVAS_H = 1200;
  const obstacles = elements
    .filter(el => !excludeIds.includes(el.id))
    .map(el => getElementBounds(el));

  // Build grid: 0 = free, 1 = obstacle
  const cols = Math.ceil(CANVAS_W / GRID_SIZE);
  const rows = Math.ceil(CANVAS_H / GRID_SIZE);
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (const obs of obstacles) {
    const left = Math.floor((obs.x - 10) / GRID_SIZE);
    const right = Math.ceil((obs.x + obs.width + 10) / GRID_SIZE);
    const top = Math.floor((obs.y - 10) / GRID_SIZE);
    const bottom = Math.ceil((obs.y + obs.height + 10) / GRID_SIZE);
    for (let i = top; i <= bottom; i++) {
      for (let j = left; j <= right; j++) {
        if (i >= 0 && i < rows && j >= 0 && j < cols) {
          grid[i][j] = 1;
        }
      }
    }
  }

  // Convert (x, y) to grid cell
  function toCell(x, y) {
    return [Math.round(y / GRID_SIZE), Math.round(x / GRID_SIZE)];
  }
  function toCoord(row, col) {
    return { x: col * GRID_SIZE, y: row * GRID_SIZE };
  }

  const [startRow, startCol] = toCell(x1, y1);
  const [endRow, endCol] = toCell(x2, y2);

  // BFS
  const queue = [[startRow, startCol]];
  const prev = Array.from({ length: rows }, () => Array(cols).fill(null));
  grid[startRow][startCol] = 0; // ensure start is free
  let found = false;
  const DIRS = [
    [0, 1], [1, 0], [0, -1], [-1, 0]
  ]; // right, down, left, up
  while (queue.length > 0) {
    const [r, c] = queue.shift();
    if (r === endRow && c === endCol) {
      found = true;
      break;
    }
    for (const [dr, dc] of DIRS) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] === 0 && !prev[nr][nc]) {
        prev[nr][nc] = [r, c];
        queue.push([nr, nc]);
      }
    }
  }

  // Reconstruct path
  let waypoints = [{ x: x1, y: y1 }];
  if (found) {
    let pathCells = [];
    let cur = [endRow, endCol];
    while (cur && (cur[0] !== startRow || cur[1] !== startCol)) {
      pathCells.push(cur);
      cur = prev[cur[0]][cur[1]];
    }
    pathCells.reverse();
    for (const [r, c] of pathCells) {
      waypoints.push(toCoord(r, c));
    }
  } else {
    // fallback: direct
    waypoints.push({ x: x2, y: y2 });
  }

  // Add perpendicular approach to target edge if needed
  if (targetEdge === 'top' || targetEdge === 'bottom') {
    const last = waypoints[waypoints.length - 1];
    if (Math.abs(last.x - x2) > 1) {
      waypoints.push({ x: x2, y: last.y });
    }
  } else if (targetEdge === 'left' || targetEdge === 'right') {
    const last = waypoints[waypoints.length - 1];
    if (Math.abs(last.y - y2) > 1) {
      waypoints.push({ x: last.x, y: y2 });
    }
  }
  if (waypoints[waypoints.length - 1].x !== x2 || waypoints[waypoints.length - 1].y !== y2) {
    waypoints.push({ x: x2, y: y2 });
  }
  return waypoints;
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
  // ...existing code...
  const [draggingWaypoint, setDraggingWaypoint] = useState(null); // {connectionId, idx}
  // Adaugă punct intermediar pe muchie la dublu-click - doar pe segmentele user waypoints
  const handleEdgeDoubleClick = (e, connection) => {
    if (!connection) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const fromEl = elements.find(el => el.id === connection.from);
    const toEl = elements.find(el => el.id === connection.to);
    if (!fromEl || !toEl) return;

    const fromPt = getConnectionPointForElement(fromEl, connection.fromPoint);
    const toPt = getConnectionPointForElement(toEl, connection.toPoint);
    const userWps = Array.isArray(connection.controlPoints) ? connection.controlPoints : [];

    // Construiește segmente doar din user waypoints: start -> pct1 -> pct2 -> ... -> end
    const segmentPoints = [fromPt, ...userWps, toPt];
    let minDist = Infinity, insertIdx = 0, bestProj = { x, y };

    for (let i = 0; i < segmentPoints.length - 1; i++) {
      const { dist, projX, projY } = distanceToSegment(x, y, segmentPoints[i].x, segmentPoints[i].y, segmentPoints[i + 1].x, segmentPoints[i + 1].y);
      if (dist < minDist) {
        minDist = dist;
        insertIdx = i; // Inserează după segmentul i (adică la pozitia i în user waypoints)
        bestProj = { x: projX, y: projY };
      }
    }

    // Adaugă punctul la poziția corectă în user waypoints
    const newConnections = connections.map(c => {
      if (c.id !== connection.id) return c;
      const newWps = Array.isArray(c.controlPoints) ? [...c.controlPoints] : [];
      newWps.splice(insertIdx, 0, bestProj); // Inserează la poziția insertIdx
      return { ...c, controlPoints: newWps };
    });
    setConnections(newConnections);
  };

  // Drag waypoint
  const handleWaypointMouseDown = (e, connectionId, idx) => {
    e.stopPropagation();
    setDraggingWaypoint({ connectionId, idx });
  };

  // Șterge waypoint la Alt+click
  const handleWaypointClick = (e, connectionId, idx) => {
    if (!e.altKey) return;
    setConnections(connections => connections.map(c => {
      if (c.id !== connectionId) return c;
      const newWps = Array.isArray(c.controlPoints) ? [...c.controlPoints] : [];
      newWps.splice(idx, 1);
      return { ...c, controlPoints: newWps };
    }));
  };

  // Returnează waypoints: capăt start + user + capăt end
  function getConnectionWaypoints(connection) {
    // capăt start
    const fromEl = elements.find(el => el.id === connection.from);
    const toEl = elements.find(el => el.id === connection.to);
    if (!fromEl || !toEl) return [];
    const fromPt = getConnectionPointForElement(fromEl, connection.fromPoint);
    const toPt = getConnectionPointForElement(toEl, connection.toPoint);
    const userWps = Array.isArray(connection.controlPoints) ? connection.controlPoints : [];
    // Dacă nu există puncte intermediare, folosește rutarea completă
    if (userWps.length === 0) {
      return findPathAroundObstacles(
        fromPt.x, fromPt.y, toPt.x, toPt.y,
        elements, [connection.from, connection.to], connection.toPoint?.point
      );
    }
    // Altfel, rutează fiecare segment între puncte fixe
    const allPoints = [fromPt, ...userWps, toPt];
    let result = [allPoints[0]];
    for (let i = 0; i < allPoints.length - 1; i++) {
      const seg = findPathAroundObstacles(
        allPoints[i].x, allPoints[i].y, allPoints[i + 1].x, allPoints[i + 1].y,
        elements, [connection.from, connection.to],
        (i === allPoints.length - 2) ? connection.toPoint?.point : null
      );
      // evită duplicarea punctului de start
      result = result.concat(seg.slice(1));
    }
    return result;
  }
  const { diagramId } = useParams();
  const navigate = useNavigate();

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` })
    };
  };

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
  const [draggingEndpoint, setDraggingEndpoint] = useState(null); // {connectionId, isStart: boolean, startX, startY}
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
      const apiUrl = process.env.REACT_APP_API_URL || '/api';
      // <-- SCHIMBAT URL și adăugat headers
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
    if (!el || el.type !== 'CLASS') return;
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
      if (currentEl.type !== 'CLASS') return;
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

      // Calculate delta movement
      const deltaX = newX - draggedElement.x;
      const deltaY = newY - draggedElement.y;

      setElements(elements.map(el =>
        el.id === draggingElement
          ? { ...el, x: newX, y: newY }
          : el
      ));

      // Update connections: move endpoints along with the element
      // NOTE: Control points (waypoints) stay fixed - they don't move with the element
      setConnections(prevConnections =>
        prevConnections.map(conn => {
          let newConn = { ...conn };

          // If this element is the FROM endpoint, move the fromPoint
          if (conn.from === draggingElement && conn.fromPoint) {
            newConn = {
              ...newConn,
              fromPoint: {
                ...conn.fromPoint,
                x: conn.fromPoint.x + deltaX,
                y: conn.fromPoint.y + deltaY
              }
            };
          }

          // If this element is the TO endpoint, move the toPoint
          if (conn.to === draggingElement && conn.toPoint) {
            newConn = {
              ...newConn,
              toPoint: {
                ...conn.toPoint,
                x: conn.toPoint.x + deltaX,
                y: conn.toPoint.y + deltaY
              }
            };
          }

          // Control points are NOT moved - they remain at their fixed positions
          // This maintains the intermediate waypoints independently of element movement

          return newConn;
        })
      );
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

  // Handle dragging waypoints with automatic reordering
  useEffect(() => {
    if (!draggingWaypoint) return;
    const handleMove = (e) => {
      const canvas = canvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setConnections(connections => connections.map(c => {
        if (c.id !== draggingWaypoint.connectionId) return c;
        const newWps = Array.isArray(c.controlPoints) ? [...c.controlPoints] : [];
        newWps[draggingWaypoint.idx] = { x, y };

        // Sortează waypoints după poziția lor pe linia de conexiune
        const fromEl = elements.find(el => el.id === c.from);
        const toEl = elements.find(el => el.id === c.to);
        if (fromEl && toEl) {
          const fromPt = getConnectionPointForElement(fromEl, c.fromPoint);
          const toPt = getConnectionPointForElement(toEl, c.toPoint);
          const dx = toPt.x - fromPt.x;
          const dy = toPt.y - fromPt.y;
          const l2 = dx * dx + dy * dy;

          if (l2 > 0) {
            newWps.sort((a, b) => {
              const tA = ((a.x - fromPt.x) * dx + (a.y - fromPt.y) * dy) / l2;
              const tB = ((b.x - fromPt.x) * dx + (b.y - fromPt.y) * dy) / l2;
              return tA - tB;
            });
          }
        }

        return { ...c, controlPoints: newWps };
      }));
    };
    const handleUp = () => {
      setDraggingWaypoint(null);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [draggingWaypoint, elements]);

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

  // Handle endpoint dragging
  useEffect(() => {
    const handleEndpointMove = (e) => {
      if (!draggingEndpoint) return;

      const { connectionId, isStart, startX, startY } = draggingEndpoint;
      const canvasRect = canvasRef.current?.getBoundingClientRect();
      if (!canvasRect) return;

      const mouseX = e.clientX - canvasRect.left;
      const mouseY = e.clientY - canvasRect.top;

      setConnections(prevConnections => {
        return prevConnections.map(conn => {
          if (conn.id === connectionId) {
            const targetElementId = isStart ? conn.from : conn.to;
            const targetElement = elements.find(el => el.id === targetElementId);
            if (!targetElement) return conn;

            // Detect connection point on the target element
            const fakeEvent = { clientX: e.clientX, clientY: e.clientY };
            const newPoint = detectConnectionPointOnContour(fakeEvent, targetElement);
            if (!newPoint) return conn;

            if (isStart) {
              return { ...conn, fromPoint: newPoint };
            } else {
              return { ...conn, toPoint: newPoint };
            }
          }
          return conn;
        });
      });
    };

    const handleEndpointUp = () => {
      setDraggingEndpoint(null);
    };

    if (draggingEndpoint) {
      window.addEventListener('mousemove', handleEndpointMove);
      window.addEventListener('mouseup', handleEndpointUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleEndpointMove);
      window.removeEventListener('mouseup', handleEndpointUp);
    };
  }, [draggingEndpoint, connections, elements]);

  // Helper function to prepare connections with waypoints for save
  const prepareDiagramForSave = () => {
    // Salvează explicit controlPoints (puncte intermediare definite de utilizator)
    return connections.map(conn => {
      return {
        id: conn.id,
        from: conn.from,
        to: conn.to,
        type: conn.type,
        fromPoint: conn.fromPoint,
        toPoint: conn.toPoint,
        controlPoints: Array.isArray(conn.controlPoints) ? [...conn.controlPoints] : []
      };
    });
  };

  // Save or Update Diagram - Auto-detects based on currentDiagramId
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
      : prompt('Introdu numele diagramei:', title || 'UML Class Diagram');

    if (!diagramTitle) return;

    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        alert('Trebuie să fii logat pentru a salva diagrama!');
        navigate('/login');
        return;
      }

      const diagramData = {
        selectedType: 'CLASS',
        elements: elements,
        connections: prepareDiagramForSave()
      };

      const apiUrl = process.env.REACT_APP_API_URL || '/api';
      let response, result;

      if (activeDiagramId) {
        // UPDATE existing diagram
        response = await fetch(`${apiUrl}/class-diagrams/${activeDiagramId}`, {
          method: 'PUT',
          headers: getAuthHeaders(),  // <-- SCHIMBAT
          body: JSON.stringify({ diagram: diagramData })
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
          diagram: diagramData
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

    // Render connections identic cu editorul (inclusiv puncte intermediare și evitarea)
    connections.forEach(conn => {
      const waypoints = getConnectionWaypoints(conn);
      if (!waypoints || waypoints.length < 2) return;
      const pathD = buildOrthogonalPathThroughWaypoints(waypoints);
      let marker = '';
      if (conn.type === 'INHERITANCE') marker = 'url(#arrowTriangle)';
      else if (conn.type === 'COMPOSITION') marker = 'url(#arrowDiamond)';
      else if (conn.type === 'AGGREGATION') marker = 'url(#arrowDiamondOpen)';
      else if (conn.type === 'ASSOCIATION') marker = 'url(#arrowSimple)';
      svg += `<path d='${pathD}' fill='none' stroke='#8b4513' stroke-width='2' marker-end='${marker}'/>\n`;

      // Nu mai desenează cercuri de waypoint în export SVG
      /* if (conn.controlPoints && Array.isArray(conn.controlPoints)) {
        conn.controlPoints.forEach(pt => {
          svg += `<circle cx='${pt.x}' cy='${pt.y}' r='6' fill='white' stroke='#8b4513' stroke-width='2'/>\n`;
        });
      } */
    });

    // Render elements - EXACTLY LIKE UMLEditor
    elements.forEach(el => {
      const w = el.width || 200;
      const h = el.height || 140;
      const x = el.x;
      const y = el.y;

      if (el.type === 'CLASS' || el.type === 'INTERFACE') {
        const isClass = el.type === 'CLASS';
        const isInterface = el.type === 'INTERFACE';

        // Header height
        const headerHeight = isInterface ? 50 : 36;

        // For INTERFACE: always 1 section (methods only)
        // For CLASS: always 2 sections (attributes + methods)
        const numSections = isClass ? 2 : 1;
        const sectionHeight = (h - headerHeight) / numSections;

        // Box
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='6' fill='#fffef0' stroke='#8b4513' stroke-width='2'/>\n`;

        // Header
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${headerHeight}' fill='#fff7e6' stroke='#8b4513' stroke-width='1'/>\n`;

        // Stereotype label for interface
        if (isInterface) {
          const stereoY = y + 15;
          svg += `<text x='${x + w / 2}' y='${stereoY}' font-size='11' font-family='monospace' text-anchor='middle' fill='#666' font-style='italic'>&#171;interface&#187;</text>\n`;
        }

        // Class/Interface name
        const nameY = isInterface ? y + 35 : y + headerHeight / 2 + 6;
        svg += `<text x='${x + w / 2}' y='${nameY}' font-size='14' font-family='monospace' font-weight='bold' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;

        // Line under header
        svg += `<line x1='${x}' y1='${y + headerHeight}' x2='${x + w}' y2='${y + headerHeight}' stroke='#8b4513' stroke-width='1'/>\n`;

        if (isClass) {
          // ATTRIBUTES SECTION
          const attrSectionStart = y + headerHeight;
          const attrSectionEnd = attrSectionStart + sectionHeight;

          if (el.attributes && el.attributes.length > 0) {
            const itemHeight = sectionHeight / el.attributes.length;
            el.attributes.forEach((attr, i) => {
              const textY = attrSectionStart + itemHeight * i + itemHeight / 2 + 4;
              svg += `<text x='${x + 8}' y='${textY}' font-size='12' font-family='monospace' fill='#222'>${escapeXML(attr)}</text>\n`;
            });
          }

          // Line between attributes and methods (always rendered)
          svg += `<line x1='${x}' y1='${attrSectionEnd}' x2='${x + w}' y2='${attrSectionEnd}' stroke='#8b4513' stroke-width='1'/>\n`;

          // METHODS SECTION
          const methodSectionStart = attrSectionEnd;

          if (el.methods && el.methods.length > 0) {
            const itemHeight = sectionHeight / el.methods.length;
            el.methods.forEach((method, i) => {
              const textY = methodSectionStart + itemHeight * i + itemHeight / 2 + 4;
              svg += `<text x='${x + 8}' y='${textY}' font-size='12' font-family='monospace' fill='#222'>${escapeXML(method)}</text>\n`;
            });
          }
        } else {
          // INTERFACE - METHODS SECTION ONLY
          const methodSectionStart = y + headerHeight;

          if (el.methods && el.methods.length > 0) {
            const itemHeight = sectionHeight / el.methods.length;
            el.methods.forEach((method, i) => {
              const textY = methodSectionStart + itemHeight * i + itemHeight / 2 + 4;
              svg += `<text x='${x + 8}' y='${textY}' font-size='12' font-family='monospace' fill='#222'>${escapeXML(method)}</text>\n`;
            });
          }
        }
      }
    });

    svg += `</svg>`;

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
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

    const token = localStorage.getItem('token');
    if (!token) {
      alert('Trebuie să fii autentificat pentru a importa o diagramă!');
      navigate('/login');
      return;
    }

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
                          const attrItemsHeight = el.type === 'CLASS' ? Math.max(1, el.attributes?.length || 0) * itemBaseHeight : 0;
                          const methodItemsHeight = Math.max(1, el.methods?.length || 0) * itemBaseHeight;
                          const separatorHeight = el.type === 'CLASS' ? 2 : 0;
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
                      {el.type === 'CLASS' && (
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
                  <path d="M 0 0 L 18 9 L 0 18 Z" fill="white" stroke="#8b4513" strokeWidth="2" strokeLinejoin="miter" />
                </marker>

                {/* COMPOSITION - Filled diamond */}
                <marker id="arrowDiamond" markerWidth="18" markerHeight="18" refX="17" refY="9" orient="auto">
                  <path d="M 0 9 L 9 0 L 18 9 L 9 18 Z" fill="#8b4513" stroke="#8b4513" strokeWidth="1" />
                </marker>

                {/* AGGREGATION - Open diamond (hollow) */}
                <marker id="arrowDiamondOpen" markerWidth="18" markerHeight="18" refX="17" refY="9" orient="auto">
                  <path d="M 0 9 L 9 0 L 18 9 L 9 18 Z" fill="white" stroke="#8b4513" strokeWidth="2" strokeLinejoin="miter" />
                </marker>

                {/* ASSOCIATION - Simple open arrow */}
                <marker id="arrowSimple" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto">
                  <path d="M 0 0 L 14 7 L 0 14" fill="none" stroke="#8b4513" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </marker>
              </defs>
              {connections.map((conn) => {
                const waypoints = getConnectionWaypoints(conn);
                if (!waypoints.length) return null;
                const pathD = buildOrthogonalPathThroughWaypoints(waypoints);
                let marker = '';
                if (conn.type === 'INHERITANCE') marker = 'url(#arrowTriangle)';
                else if (conn.type === 'COMPOSITION') marker = 'url(#arrowDiamond)';
                else if (conn.type === 'AGGREGATION') marker = 'url(#arrowDiamondOpen)';
                else if (conn.type === 'ASSOCIATION') marker = 'url(#arrowSimple)';
                return (
                  <g key={conn.id}>
                    {/* Invisible thick stroke for easier clicking/dblclick */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeWidth="15"
                      pointerEvents="auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedElement(null);
                        setSelectedConnection(conn.id);
                      }}
                      onDoubleClick={e => handleEdgeDoubleClick(e, conn)}
                      style={{ cursor: 'pointer' }}
                    />
                    {/* Visible connection line */}
                    <path
                      d={pathD}
                      fill="none"
                      stroke={selectedConnection === conn.id ? '#9168b7' : '#8b4513'}
                      strokeWidth={selectedConnection === conn.id ? 3 : 2}
                      markerEnd={marker}
                      className="connection-line"
                      pointerEvents="none"
                    />
                    {/* DOAR waypoints puse de utilizator */}
                    {Array.isArray(conn.controlPoints) && conn.controlPoints.map((wp, idx) => (
                      <circle
                        key={idx}
                        cx={wp.x}
                        cy={wp.y}
                        r={7}
                        fill="#fff"
                        stroke="#9168b7"
                        strokeWidth={2}
                        onMouseDown={e => handleWaypointMouseDown(e, conn.id, idx)}
                        onClick={e => handleWaypointClick(e, conn.id, idx)}
                        style={{ cursor: 'pointer' }}
                      />
                    ))}
                  </g>
                );
              })}
            </svg>

            {/* Endpoint circles - visible when connection is selected */}
            {connections.map((conn) => {
              if (selectedConnection !== conn.id) return null;

              const fromEl = elements.find(el => el.id === conn.from);
              const toEl = elements.find(el => el.id === conn.to);
              if (!fromEl || !toEl || !conn.fromPoint || !conn.toPoint) return null;

              const size = 8;
              const endpoints = [
                { point: conn.fromPoint, isStart: true, label: 'from' },
                { point: conn.toPoint, isStart: false, label: 'to' }
              ];

              return endpoints.map((ep, idx) => {
                const isDragging = draggingEndpoint?.connectionId === conn.id && draggingEndpoint?.isStart === ep.isStart;
                return (
                  <div
                    key={`endpoint-${conn.id}-${ep.label}`}
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: `${size * 2}px`,
                      height: `${size * 2}px`,
                      borderRadius: '50%',
                      backgroundColor: ep.isStart ? '#ef4444' : '#06b6d4',
                      border: `2px solid ${ep.isStart ? '#991b1b' : '#0e7490'}`,
                      cursor: 'grab',
                      zIndex: isDragging ? 1000 : 950,
                      pointerEvents: 'auto',
                      transform: `translate(${ep.point.x - size}px, ${ep.point.y - size}px)`,
                      opacity: isDragging ? 1 : 0.8,
                      boxShadow: isDragging ? '0 0 8px rgba(0,0,0,0.3)' : 'none',
                      transition: 'none'  // No transition - instant updates
                    }}
                    title={`${ep.label === 'from' ? 'From' : 'To'} endpoint - Drag to move on element edge`}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDraggingEndpoint({
                        connectionId: conn.id,
                        isStart: ep.isStart,
                        startX: e.clientX,
                        startY: e.clientY
                      });
                    }}
                  />
                );
              });
            })}

            {/* Control points on connections - draggable circles - HIDDEN */}
            {/* connections.map((conn) => {
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
            })} */}
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
                  const isSelected = selectedConnection === conn.id;
                  return (
                    <div
                      key={conn.id}
                      className="connection-item"
                      style={{
                        backgroundColor: isSelected ? '#e9d5ff' : 'transparent',
                        borderLeft: isSelected ? '4px solid #9168b7' : '4px solid transparent',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedConnection(null);
                        } else {
                          setSelectedConnection(conn.id);
                          setSelectedElement(null);
                        }
                      }}
                    >
                      <span style={{ fontWeight: isSelected ? 'bold' : 'normal' }}>{fromEl?.name} → {toEl?.name}</span>
                      <small style={{ color: isSelected ? '#7c3aed' : '#666' }}>{conn.type}</small>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setConnections(connections.filter(c => c.id !== conn.id));
                          if (isSelected) setSelectedConnection(null);
                        }}
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
