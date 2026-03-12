import React, { useState, useRef, useEffect } from 'react';
import './UMLEditor.css';
import { useNavigate } from 'react-router-dom';

// ============ HELPER FUNCTIONS FOR PATHFINDING ============

/**
 * Get bounding box of a UML element considering actual height
 */
function getElementBounds(el) {
  let height = el.height || 120;
  
  // For CLASS/INTERFACE, calculate actual height based on content
  if (el.type === 'CLASS' || el.type === 'INTERFACE') {
    const headerHeight = el.type === 'INTERFACE' ? 50 : 36;
    const attrHeight = Math.max(30, (el.attributes?.length || 0) * 20 + 12);
    const methodHeight = Math.max(30, (el.methods?.length || 0) * 20 + 12);
    height = headerHeight + attrHeight + methodHeight;
  }
  
  return {
    x: el.x,
    y: el.y,
    width: el.width || 150,
    height: height
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

  // Check if line endpoints are inside rectangle
  const p1Inside = x1 >= left && x1 <= right && y1 >= top && y1 <= bottom;
  const p2Inside = x2 >= left && x2 <= right && y2 >= top && y2 <= bottom;
  
  if (p1Inside || p2Inside) return true;

  // Check if line segment intersects rectangle edges
  // Top edge
  if (lineSegmentsIntersect(x1, y1, x2, y2, left, top, right, top)) return true;
  // Bottom edge
  if (lineSegmentsIntersect(x1, y1, x2, y2, left, bottom, right, bottom)) return true;
  // Left edge
  if (lineSegmentsIntersect(x1, y1, x2, y2, left, top, left, bottom)) return true;
  // Right edge
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
 * Calculate intersection of ray from center to a direction with rectangle bounds
 * Returns point + which edge was hit (for proper arrow orientation)
 */
function getRectangleEdgePoint(centerX, centerY, width, height, angle) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  
  // Calculate t parameter for each edge
  const edges = [];
  
  // Right edge
  if (dx > 0) {
    const t = halfWidth / dx;
    edges.push({ t, x: centerX + halfWidth, y: centerY + dy * t, edge: 'right' });
  }
  // Left edge
  if (dx < 0) {
    const t = -halfWidth / dx;
    edges.push({ t, x: centerX - halfWidth, y: centerY + dy * t, edge: 'left' });
  }
  
  // Bottom edge
  if (dy > 0) {
    const t = halfHeight / dy;
    edges.push({ t, x: centerX + dx * t, y: centerY + halfHeight, edge: 'bottom' });
  }
  // Top edge
  if (dy < 0) {
    const t = -halfHeight / dy;
    edges.push({ t, x: centerX + dx * t, y: centerY - halfHeight, edge: 'top' });
  }
  
  // Find the closest valid edge (smallest positive t)
  const validEdges = edges.filter(e => e.t > 0);
  if (validEdges.length === 0) return { x: centerX, y: centerY, edge: 'center' };
  
  const closest = validEdges.reduce((a, b) => a.t < b.t ? a : b);
  return { x: closest.x, y: closest.y, edge: closest.edge };
}

/**
 * Get 4 connection points on element's contour (top, bottom, left, right)
 * Folosește coordonate absolute din element.x/y (canvas-relative)
 */
function getElementConnectionPoints(element, elementHeight) {
  const centerX = element.x + (element.width || 150) / 2;
  const centerY = element.y + elementHeight / 2;
  const halfWidth = (element.width || 150) / 2;
  const halfHeight = elementHeight / 2;
  
  return {
    top: { x: centerX, y: element.y, point: 'top', radius: 8 },
    bottom: { x: centerX, y: element.y + elementHeight, point: 'bottom', radius: 8 },
    left: { x: element.x, y: centerY, point: 'left', radius: 8 },
    right: { x: element.x + (element.width || 150), y: centerY, point: 'right', radius: 8 }
  };
}

/**
 * Get connection points based on actual DOM element bounds (canvas-relative)
 * Folosit pentru a obține dimensiuni exacte din DOM
 */
function getActualElementConnectionPoints(domElement, canvasRef) {
  if (!domElement || !canvasRef.current) return null;
  
  const domRect = domElement.getBoundingClientRect();
  const canvasRect = canvasRef.current.getBoundingClientRect();
  
  // Convertesc din coordonate browser la coordonate relative la canvas
  const x = domRect.left - canvasRect.left;
  const y = domRect.top - canvasRect.top;
  const width = domRect.width;
  const height = domRect.height;
  
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  
  return {
    top: { x: centerX, y: y, point: 'top' },
    bottom: { x: centerX, y: y + height, point: 'bottom' },
    left: { x: x, y: centerY, point: 'left' },
    right: { x: x + width, y: centerY, point: 'right' }
  };
}

/**
 * Calculează cel mai apropiat punct pe conturul unui element relativ la o poziție dată
 * Funcție universală pentru placement inițial și drag
 */
function findClosestBoundaryPoint(element, elementHeight, mouseX, mouseY, elementX, elementY) {
  // Pentru Sequence Diagrams, snape la centrul vertical (lifeline)
  const sequenceElements = ['ACTOR', 'OBJECT', 'ACTIVATION', 'DESTROY', 'BOUNDARY', 'CONTROL', 'ALT', 'LOOP'];
  if (sequenceElements.includes(element.type)) {
    const centerX = elementX + (element.width || 150) / 2;
    const centerY = elementY + (elementHeight || 120) / 2;
    // Snap to vertical line at element's center
    return {
      x: centerX,
      y: mouseY, // Y from mouse position
      point: 'center',
      code: `center:${Math.round(centerX)},${Math.round(mouseY)}`
    };
  }
  
  const elW = element.width || 150;
  const elH = elementHeight;
  
  // Calculez distanțe din mouse la fiecare margine (ca linii infinite)
  const distTop = Math.abs(mouseY - elementY);
  const distBottom = Math.abs(mouseY - (elementY + elH));
  const distLeft = Math.abs(mouseX - elementX);
  const distRight = Math.abs(mouseX - (elementX + elW));
  
  // Gasesc în margine e cea mai apropiată
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);
  
  let pointX, pointY, edgeType;
  
  if (minDist === distTop) {
    // Top edge - clamp X
    pointX = Math.max(elementX, Math.min(mouseX, elementX + elW));
    pointY = elementY;
    edgeType = 'top';
  } else if (minDist === distBottom) {
    // Bottom edge - clamp X
    pointX = Math.max(elementX, Math.min(mouseX, elementX + elW));
    pointY = elementY + elH;
    edgeType = 'bottom';
  } else if (minDist === distLeft) {
    // Left edge - clamp Y
    pointX = elementX;
    pointY = Math.max(elementY, Math.min(mouseY, elementY + elH));
    edgeType = 'left';
  } else {
    // Right edge - clamp Y
    pointX = elementX + elW;
    pointY = Math.max(elementY, Math.min(mouseY, elementY + elH));
    edgeType = 'right';
  }
  
  return {
    x: pointX,
    y: pointY,
    point: edgeType,
    code: `${edgeType}:${Math.round(pointX)},${Math.round(pointY)}`
  };
}

/**
 * Detectează click oriunde pe conturul elementului și returnează punctul exact pe perimetru
 * Folosește funcția helper findClosestBoundaryPoint
 */
function detectConnectionPointOnContour(e, element, elementHeight) {
  const canvasRef_local = document.querySelector('.uml-canvas');
  if (!canvasRef_local) return null;
  
  const canvasRect = canvasRef_local.getBoundingClientRect();
  const elementDOMRect = e.currentTarget.getBoundingClientRect();
  
  // Click position relativ la canvas
  const clickCanvasX = e.clientX - canvasRect.left;
  const clickCanvasY = e.clientY - canvasRect.top;
  
  // Element bounds pe canvas bazate pe DOM rendering actual
  const elCanvasX = elementDOMRect.left - canvasRect.left;
  const elCanvasY = elementDOMRect.top - canvasRect.top;
  const elCanvasWidth = elementDOMRect.width;
  const elCanvasHeight = elementDOMRect.height;
  
  console.log(`Click canvas (${clickCanvasX}, ${clickCanvasY}), element DOM bounds: x=${elCanvasX}, y=${elCanvasY}, w=${elCanvasWidth}, h=${elCanvasHeight}`);
  
  // Calculez cel mai apropiat punct pe marginea elementului DOM
  const distTop = Math.abs(clickCanvasY - elCanvasY);
  const distBottom = Math.abs(clickCanvasY - (elCanvasY + elCanvasHeight));
  const distLeft = Math.abs(clickCanvasX - elCanvasX);
  const distRight = Math.abs(clickCanvasX - (elCanvasX + elCanvasWidth));
  
  const minDist = Math.min(distTop, distBottom, distLeft, distRight);
  
  let pointX, pointY, edgeType;
  
  if (minDist === distTop) {
    pointX = Math.max(elCanvasX, Math.min(clickCanvasX, elCanvasX + elCanvasWidth));
    pointY = elCanvasY;
    edgeType = 'top';
  } else if (minDist === distBottom) {
    pointX = Math.max(elCanvasX, Math.min(clickCanvasX, elCanvasX + elCanvasWidth));
    pointY = elCanvasY + elCanvasHeight;
    edgeType = 'bottom';
  } else if (minDist === distLeft) {
    pointX = elCanvasX;
    pointY = Math.max(elCanvasY, Math.min(clickCanvasY, elCanvasY + elCanvasHeight));
    edgeType = 'left';
  } else {
    pointX = elCanvasX + elCanvasWidth;
    pointY = Math.max(elCanvasY, Math.min(clickCanvasY, elCanvasY + elCanvasHeight));
    edgeType = 'right';
  }
  
  const result = {
    x: pointX,
    y: pointY,
    point: edgeType,
    code: `${edgeType}:${Math.round(pointX)},${Math.round(pointY)}`
  };
  
  console.log("Punct detected:", result);
  return result;
}

/**
 * Build orthogonal path through multiple waypoints with 90-degree corners
 * Routes each segment with Manhattan/L-shaped routing
 */
function simplifyWaypoints(waypoints, tolerance = 5) {
  if (waypoints.length <= 2) return waypoints;
  
  // Aggressive Douglas-Peucker simplification
  // Removes ALL unnecessary intermediate points, keeps only direction changes
  
  const simplified = [waypoints[0]];
  
  for (let i = 1; i < waypoints.length; i++) {
    const curr = waypoints[i];
    const prev = simplified[simplified.length - 1];
    
    if (simplified.length < 2) {
      simplified.push(curr);
    } else {
      const prevPrev = simplified[simplified.length - 2];
      
      // Check if we're continuing in EXACT same direction (horizontal or vertical)
      const wasHorizontal = Math.abs(prevPrev.y - prev.y) < 0.1;
      const isHorizontal = Math.abs(prev.y - curr.y) < 0.1;
      const wasVertical = Math.abs(prevPrev.x - prev.x) < 0.1;
      const isVertical = Math.abs(prev.x - curr.x) < 0.1;
      
      // Only add point if direction actually changed
      if ((wasHorizontal && isHorizontal) || (wasVertical && isVertical)) {
        // Same direction - skip this waypoint, move directly to current
        // But first check if we'd be backtracking
        const backtrackingH = wasHorizontal && ((prevPrev.x < prev.x && curr.x < prev.x) || (prevPrev.x > prev.x && curr.x > prev.x));
        const backtrackingV = wasVertical && ((prevPrev.y < prev.y && curr.y < prev.y) || (prevPrev.y > prev.y && curr.y > prev.y));
        
        if (!backtrackingH && !backtrackingV) {
          // Extend the line, replace the waypoint
          simplified[simplified.length - 1] = curr;
        } else {
          // Direction reversal detected, keep the waypoint
          simplified.push(curr);
        }
      } else {
        // Direction changed - keep this point
        simplified.push(curr);
      }
    }
  }
  
  return simplified;
}

function buildOrthogonalPathThroughWaypoints(waypoints) {
  if (waypoints.length === 0) return '';
  if (waypoints.length === 1) {
    return `M ${Math.round(waypoints[0].x)},${Math.round(waypoints[0].y)}`;
  }
  
  // Simplify waypoints to remove unnecessary intermediate points
  const simplified = simplifyWaypoints(waypoints);
  
  const path = [simplified[0]];
  
  // Route orthogonally between each pair of consecutive waypoints
  for (let i = 0; i < simplified.length - 1; i++) {
    const from = simplified[i];
    const to = simplified[i + 1];
    
    // Use L-shaped routing: go horizontal first, then vertical
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
  
  // Remove consecutive duplicates
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
 * Convert waypoints to SVG path string (with straight lines and corners)
 */
function waypointsToPath(points) {
  if (points.length === 0) return '';
  
  // Simplify waypoints to remove unnecessary intermediate points
  const simplified = simplifyWaypoints(points);
  
  let d = `M ${Math.round(simplified[0].x)},${Math.round(simplified[0].y)}`;
  for (let i = 1; i < simplified.length; i++) {
    d += ` L ${Math.round(simplified[i].x)},${Math.round(simplified[i].y)}`;
  }
  return d;
}
function findPathAroundObstacles(x1, y1, x2, y2, elements, excludeIds = [], targetEdge = null) {
  const path = [{ x: x1, y: y1 }];
  
  // Get all obstacles (exclude start and end elements)
  const obstacles = elements
    .filter(el => !excludeIds.includes(el.id))
    .map(el => getElementBounds(el));

  // Check if direct path intersects any obstacles
  let directPathClear = true;
  for (const obstacle of obstacles) {
    if (lineIntersectsRect(x1, y1, x2, y2, obstacle)) {
      directPathClear = false;
      break;
    }
  }

  if (directPathClear) {
    // No obstacles in the way, use direct path with Manhattan routing
    // Build perpendicular approach based on target edge
    if (targetEdge === 'top' || targetEdge === 'bottom') {
      // Arrow hits horizontal edge - final segment should be vertical
      // So move horizontally first, then vertically
      path.push({ x: x2, y: y1 });
      path.push({ x: x2, y: y2 });
    } else if (targetEdge === 'left' || targetEdge === 'right') {
      // Arrow hits vertical edge - final segment should be horizontal
      // So move vertically first, then horizontally
      path.push({ x: x1, y: y2 });
      path.push({ x: x2, y: y2 });
    } else {
      // No edge info, use default approach (horizontal then vertical)
      const midX = x1 + (x2 - x1) * 0.5;
      path.push({ x: midX, y: y1 });
      path.push({ x: midX, y: y2 });
      path.push({ x: x2, y: y2 });
    }
    return path;
  }

  // Find obstacles that intersect the direct path
  const blockingObstacles = obstacles.filter(obs => lineIntersectsRect(x1, y1, x2, y2, obs));
  
  if (blockingObstacles.length === 0) {
    const midX = x1 + (x2 - x1) * 0.5;
    path.push({ x: midX, y: y1 });
    path.push({ x: midX, y: y2 });
    path.push({ x: x2, y: y2 });
    return path;
  }

  // Find the closest blocking obstacle to the start point
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
  
  // Try multiple routing strategies and pick the shortest
  const strategies = [];

  // Strategy 1: Go right/left first, then up/down
  const midX1 = closestObstacle.x + closestObstacle.width + padding;
  const route1 = [
    { x: midX1, y: y1 },
    { x: midX1, y: y2 }
  ];
  strategies.push(route1);

  // Strategy 2: Go left first, then up/down
  const midX2 = closestObstacle.x - padding;
  const route2 = [
    { x: midX2, y: y1 },
    { x: midX2, y: y2 }
  ];
  strategies.push(route2);

  // Strategy 3: Go up/down first, then right/left
  const midY1 = closestObstacle.y - padding;
  const route3 = [
    { x: x1, y: midY1 },
    { x: x2, y: midY1 }
  ];
  strategies.push(route3);

  // Strategy 4: Go down first, then right/left
  const midY2 = closestObstacle.y + closestObstacle.height + padding;
  const route4 = [
    { x: x1, y: midY2 },
    { x: x2, y: midY2 }
  ];
  strategies.push(route4);

  // Pick the strategy that doesn't intersect obstacles
  let bestRoute = route1;
  
  for (const route of strategies) {
    let routeValid = true;
    // Check if this route clears the obstacle
    for (let i = 0; i < route.length; i++) {
      const segStart = i === 0 ? { x: x1, y: y1 } : route[i - 1];
      const segEnd = route[i];
      
      if (lineIntersectsRect(segStart.x, segStart.y, segEnd.x, segEnd.y, closestObstacle)) {
        routeValid = false;
        break;
      }
    }
    
    if (routeValid) {
      // Check last segment to destination
      const lastEnd = bestRoute[bestRoute.length - 1];
      if (!lineIntersectsRect(lastEnd.x, lastEnd.y, x2, y2, closestObstacle)) {
        bestRoute = route;
        break;
      }
    }
  }

  // Add the best route
  for (const wp of bestRoute) {
    path.push(wp);
  }
  
  // Add final approach to ensure perpendicular alignment with target edge
  const lastWaypoint = bestRoute[bestRoute.length - 1];
  
  if (targetEdge === 'top' || targetEdge === 'bottom') {
    // Arrow hits horizontal edge - final segment should be vertical (same X, different Y)
    if (Math.abs(lastWaypoint.x - x2) > 1) {
      path.push({ x: x2, y: lastWaypoint.y });
    }
  } else if (targetEdge === 'left' || targetEdge === 'right') {
    // Arrow hits vertical edge - final segment should be horizontal (different X, same Y)
    if (Math.abs(lastWaypoint.y - y2) > 1) {
      path.push({ x: lastWaypoint.x, y: y2 });
    }
  }
  
  path.push({ x: x2, y: y2 });

  return path;
}

// ============ END HELPER FUNCTIONS ============

// Elemente pentru Class Diagram
const CLASS_ELEMENTS = {
  CLASS: { label: 'Class', icon: 'C', color: '#fffef0', isNode: true },
  INTERFACE: { label: 'Interface', icon: 'I', color: '#f0f9ff', isNode: true },
  INHERITANCE: { label: 'Inheritance', icon: '⇨', color: '#f3e8ff', isConnection: true },
  COMPOSITION: { label: 'Composition', icon: '◆', color: '#f3e8ff', isConnection: true },
  AGGREGATION: { label: 'Aggregation', icon: '◇', color: '#f3e8ff', isConnection: true },
  ASSOCIATION: { label: 'Association', icon: '→', color: '#f3e8ff', isConnection: true }
};

// Tipuri de diagrame UML
const UML_TYPES = {
  CLASS: 'Class Diagram',
  SEQUENCE: 'Sequence Diagram',
  USE_CASE: 'Use Case Diagram',
  COMPONENT: 'Component Diagram',
  COMPOSITE_STRUCTURE: 'Composite Structure Diagram',
  DEPLOYMENT: 'Deployment Diagram',
  OBJECT: 'Object Diagram',
  PACKAGE: 'Package Diagram',
  ACTIVITY: 'Activity Diagram',
  STATE: 'State Diagram'
};

// Elemente pentru Sequence Diagram (toate simbolurile din poză)
const SEQUENCE_ELEMENTS = {
  ACTOR: { label: 'Actor', icon: '🧑', color: '#fffde7', isNode: true },
  OBJECT: { label: 'Object', icon: '■', color: '#f9a8d4', isNode: true },
  ACTIVATION: { label: 'Activation', icon: '▮', color: '#bae6fd', isNode: true },
  // Linii de mesaj custom explicite
  LINE_ARROW: { label: 'Linie cu săgeată', icon: '→', color: '#bbf7d0', isConnection: true },
  LINE: { label: 'Linie simplă', icon: '―', color: '#bbf7d0', isConnection: true },
  DOTTED_ARROW: { label: 'Punctată cu săgeată', icon: '⇢', color: '#bbf7d0', isConnection: true },
  DOTTED: { label: 'Punctată simplă', icon: '╌', color: '#bbf7d0', isConnection: true },
  DESTROY: { label: 'Destroy', icon: '✕', color: '#4ade80', isNode: true },
  BOUNDARY: { label: 'Boundary', icon: '◯', color: '#f9a8d4', isNode: true },
  CONTROL: { label: 'Control', icon: '↻', color: '#fef08a', isNode: true },
  LOOP: { label: 'Loop', icon: '⟲', color: '#fff4e6', isNode: true },
  ALT: { label: 'Alt', icon: '⟂', color: '#fff4e6', isNode: true }
};

// Elemente pentru Use Case Diagram
const USE_CASE_ELEMENTS = {
  ACTOR: { label: 'Actor', icon: '🧑', color: '#e8f4f8', isNode: true },
  USE_CASE: { label: 'Use Case', icon: '●', color: '#fff4e6', isNode: true },
  SYSTEM: { label: 'System', icon: '◻', color: '#f0f0f0', isNode: true },
  ASSOCIATION: { label: 'Association', icon: '―', color: '#f0f0f0', isConnection: true },
  GENERALIZATION: { label: 'Generalization', icon: '⇨', color: '#f0f0f0', isConnection: true },
  INCLUDE: { label: 'Include', icon: '⊳', color: '#f0f0f0', isConnection: true },
  EXTEND: { label: 'Extend', icon: '✓', color: '#f0f0f0', isConnection: true }
};

// Elemente pentru Component Diagram
const COMPONENT_ELEMENTS = {
  COMPONENT: { label: 'Component', icon: '⬚', color: '#fff4e6', isNode: true },
  INTERFACE: { label: 'Interface', icon: '◯', color: '#e0f2fe', isNode: true },
  DEPENDENCY: { label: 'Dependency', icon: '⇢', color: '#f0f0f0', isConnection: true },
  REALIZATION: { label: 'Realization', icon: '⇨', color: '#f0f0f0', isConnection: true }
};

// Elemente pentru Deployment Diagram
const DEPLOYMENT_ELEMENTS = {
  NODE: { label: 'Node', icon: '⬜', color: '#f0e68c', isNode: true },
  ARTIFACT: { label: 'Artifact', icon: '📦', color: '#fff4e6', isNode: true },
  DEPENDENCY: { label: 'Dependency', icon: '⇢', color: '#f0f0f0', isConnection: true }
};

// Elemente pentru Object Diagram
const OBJECT_ELEMENTS = {
  OBJECT_INSTANCE: { label: 'Object Instance', icon: '◻', color: '#fffef0', isNode: true },
  LINK: { label: 'Link', icon: '―', color: '#f0f0f0', isConnection: true }
};

// Elemente pentru Package Diagram
const PACKAGE_ELEMENTS = {
  PACKAGE: { label: 'Package', icon: '📁', color: '#fff4e6', isNode: true },
  DEPENDENCY: { label: 'Dependency', icon: '⇢', color: '#f0f0f0', isConnection: true }
};

// Elemente pentru Activity Diagram
const ACTIVITY_ELEMENTS = {
  ACTION: { label: 'Action', icon: '▭', color: '#bae6fd', isNode: true },
  DECISION: { label: 'Decision', icon: '◇', color: '#fde047', isNode: true },
  FORK_JOIN: { label: 'Fork/Join', icon: '―', color: '#000', isNode: true },
  INITIAL: { label: 'Initial', icon: '●', color: '#000', isNode: true },
  FINAL: { label: 'Final', icon: '◉', color: '#000', isNode: true },
  TRANSITION: { label: 'Transition', icon: '→', color: '#f0f0f0', isConnection: true }
};

// Elemente pentru State Diagram
const STATE_ELEMENTS = {
  STATE: { label: 'State', icon: '▭', color: '#fff4e6', isNode: true },
  INITIAL: { label: 'Initial', icon: '●', color: '#000', isNode: true },
  FINAL: { label: 'Final', icon: '◉', color: '#000', isNode: true },
  TRANSITION: { label: 'Transition', icon: '→', color: '#f0f0f0', isConnection: true }
};

const UMLEditor = () => {
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [selectedType, setSelectedType] = useState('CLASS');
  const [elements, setElements] = useState([]);
  const [connections, setConnections] = useState([]);
  const [draggedElement, setDraggedElement] = useState(null);
  const [draggingInCanvas, setDraggingInCanvas] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);
  const [editingElement, setEditingElement] = useState(null);
  const [editName, setEditName] = useState('');
  
  // Pentru mutare elemente pe canvas
  const [movingElement, setMovingElement] = useState(null);
  const [moveOffset, setMoveOffset] = useState({ x: 0, y: 0 });
  
  // Pentru crearea conexiunilor - cu selectare de puncte pe contur
  const [connectionMode, setConnectionMode] = useState(null); // tipul de conexiune
  const [connectionStart, setConnectionStart] = useState(null); // { elementId, point: 'top'|'bottom'|'left'|'right' }
  const [connectionStartPoint, setConnectionStartPoint] = useState(null); // punctul selectat pe elementul start
  const [hoveringConnectionPoint, setHoveringConnectionPoint] = useState(null); // { elementId, point } - pentru hover effect
  const [hoveringConnectionElement, setHoveringConnectionElement] = useState(null); // elementId - pentru hover feedback în connection mode

  // Pentru editare inline atribute/metode
  const [editingMember, setEditingMember] = useState(null); // {elementId, type: 'attribute'|'method', index}
  const [editMemberValue, setEditMemberValue] = useState('');

  // Pentru resize elemente
  const [resizing, setResizing] = useState(null); // {elementId, direction, startX, startY, startWidth, startHeight, startElX, startElY}

  // Pentru control points pe liniile de conexiune
  const [draggingControlPoint, setDraggingControlPoint] = useState(null); // {connectionId, pointIndex, startX, startY}
  const [selectedConnection, setSelectedConnection] = useState(null); // ID-ul conexiunii selectate pentru editare

  // Pentru drag endpoint-uri (start/end points ale conexiunilor)
  const [draggingEndpoint, setDraggingEndpoint] = useState(null); // {connectionId, endpointType: 'from'|'to', startX, startY}

  const getElementsList = () => {
    switch (selectedType) {
      case 'CLASS':
        return CLASS_ELEMENTS;
      case 'SEQUENCE':
        return SEQUENCE_ELEMENTS;
      case 'USE_CASE':
        return USE_CASE_ELEMENTS;
      case 'COMPONENT':
        return COMPONENT_ELEMENTS;
      case 'DEPLOYMENT':
        return DEPLOYMENT_ELEMENTS;
      case 'OBJECT':
        return OBJECT_ELEMENTS;
      case 'PACKAGE':
        return PACKAGE_ELEMENTS;
      case 'ACTIVITY':
        return ACTIVITY_ELEMENTS;
      case 'STATE':
        return STATE_ELEMENTS;
      case 'COMPOSITE_STRUCTURE':
        return COMPONENT_ELEMENTS; // refolositm componentele
      default:
        return CLASS_ELEMENTS;
    }
  };

  const handleDragStart = (e, elementType) => {
    const elementDef = getElementsList()[elementType];
    
    // Dacă e conexiune, intră în modul de conexiune
    if (elementDef.isConnection) {
      e.preventDefault();
      setConnectionMode(elementType);
      setConnectionStart(null);
      return;
    }
    
    setDraggedElement(elementType);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleCanvasDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDraggingInCanvas(true);
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    setDraggingInCanvas(false);

    if (!draggedElement) return;

    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    let x = e.clientX - rect.left - 75;
    let y = e.clientY - rect.top - 50;

    // Structură diferită pentru clase vs alte elemente
    const isClassType = draggedElement === 'CLASS' || draggedElement === 'INTERFACE';
    let newWidth = 150;
    let newHeight = 120;
    if (draggedElement === 'INTERFACE') {
      newWidth = 120;
      newHeight = 90;
    } else if (!isClassType) {
      newWidth = 120;
      newHeight = 80;
    }
    
    // Verifică coliziunea și găsește o poziție liberă
    x = Math.max(0, x);
    y = Math.max(0, y);
    
    // Caută o poziție liberă dacă e suprapunere
    let attempts = 0;
    while (hasCollisionWithOthers(null, x, y, newWidth, newHeight) && attempts < 20) {
      x += 20;
      y += 20;
      attempts++;
    }
    
    const newElement = {
      id: Date.now(),
      type: draggedElement,
      x: x,
      y: y,
      name: isClassType ? `Class${elements.filter(e => e.type === 'CLASS' || e.type === 'INTERFACE').length + 1}` : `${getElementsList()[draggedElement].label} ${elements.length + 1}`,
      width: newWidth,
      height: newHeight,
      // Pentru clase UML
      attributes: draggedElement === 'CLASS' ? [] : undefined,
      methods: isClassType ? [] : undefined
    };

    setElements([...elements, newElement]);
    setDraggedElement(null);
    setSelectedElement(newElement.id);
    setEditName(newElement.name);
  };

  const handleCanvasDragLeave = () => {
    setDraggingInCanvas(false);
  };

  // Click pe element - selectare sau conexiune (cu selectare de puncte pe contur)
  const handleElementClick = (e, element) => {
    e.stopPropagation();
    
    // Dacă suntem în modul conexiune
    if (connectionMode) {
      // Obțin înălțimea reală a elementului
      let elementHeight = element.height || 120;
      if (element.type === 'CLASS' || element.type === 'INTERFACE') {
        const headerHeight = element.type === 'INTERFACE' ? 50 : 36;
        const attrHeight = Math.max(30, (element.attributes?.length || 0) * 20 + 12);
        const methodHeight = Math.max(30, (element.methods?.length || 0) * 20 + 12);
        elementHeight = headerHeight + attrHeight + methodHeight;
      }
      
      // Detectez care punct de pe contur a fost apăsat (oriunde pe contur, nu doar pe punctele predefinite)
      const clickedPoint = detectConnectionPointOnContour(e, element, elementHeight);
      
      console.log(`Click pe element ${element.id}, detectat:`, clickedPoint, `connectionStart:`, connectionStart);
      
      if (!clickedPoint) {
        // Clicul nu a fost pe un punct de pe contur
        console.log("Click nu e pe contur");
        return;
      }
      
      if (!connectionStart) {
        // Selectez punctul de start
        setConnectionStart({ elementId: element.id, point: clickedPoint });
        setHoveringConnectionPoint(null);
        console.log(`Punct START selectat: ${clickedPoint.point} la (${Math.round(clickedPoint.x)}, ${Math.round(clickedPoint.y)}) pe element ${element.id}`);
      } else if (connectionStart.elementId !== element.id) {
        // Selectez punctul de destinație și creez conexiunea
        console.log("Creez conexiune către", element.id);
        const newConnection = {
          id: Date.now(),
          type: connectionMode,
          from: connectionStart.elementId,
          fromPoint: connectionStart.point, // obiect cu {x, y, point, code}
          to: element.id,
          toPoint: clickedPoint, // obiect cu {x, y, point, code}
          label: getElementsList()[connectionMode].label
        };
        setConnections([...connections, newConnection]);
        setConnectionMode(null);
        setConnectionStart(null);
        setHoveringConnectionPoint(null);
        console.log(`Conexiune creată: ${connectionStart.elementId} -> ${element.id}`);
      } else {
        console.log("Aceeași element - click pe START din nou");
      }
      return;
    }
    
    setSelectedElement(element.id);
    setEditName(element.name);
  };

  // Dublu-click pentru editare
  const handleElementDoubleClick = (e, element) => {
    e.stopPropagation();
    setEditingElement(element.id);
    setEditName(element.name);
  };

  // Verifică dacă două dreptunghiuri se suprapun
  const checkCollision = (rect1, rect2) => {
    return !(rect1.x + rect1.width <= rect2.x ||
             rect2.x + rect2.width <= rect1.x ||
             rect1.y + rect1.height <= rect2.y ||
             rect2.y + rect2.height <= rect1.y);
  };

  // Verifică dacă elementul la noua poziție se suprapune cu alte elemente
  const hasCollisionWithOthers = (elementId, newX, newY, newWidth, newHeight) => {
    const movingRect = { x: newX, y: newY, width: newWidth, height: newHeight };
    
    for (const el of elements) {
      if (el.id === elementId) continue;
      const elRect = { x: el.x, y: el.y, width: el.width || 150, height: el.height || 120 };
      if (checkCollision(movingRect, elRect)) {
        return true;
      }
    }
    return false;
  };

  // Mouse down pentru mutare
  const handleElementMouseDown = (e, element) => {
    if (connectionMode || editingElement === element.id) return;
    
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    setMoveOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setMovingElement(element.id);
    setSelectedElement(element.id);
  };

  // Mouse move pentru mutare
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!movingElement || !canvasRef.current) return;
      
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const newX = Math.max(0, e.clientX - canvasRect.left - moveOffset.x);
      const newY = Math.max(0, e.clientY - canvasRect.top - moveOffset.y);
      
      const currentEl = elements.find(el => el.id === movingElement);
      if (!currentEl) return;
      
      const elWidth = currentEl.width || 150;
      const elHeight = currentEl.height || 120;
      
      // Verifică coliziunea cu alte elemente
      if (hasCollisionWithOthers(movingElement, newX, newY, elWidth, elHeight)) {
        return; // Nu permite mutarea dacă ar cauza suprapunere
      }
      
      const deltaX = newX - currentEl.x;
      const deltaY = newY - currentEl.y;
      
      // Actualizează elementul
      const updatedElements = elements.map(el => 
        el.id === movingElement 
          ? { ...el, x: newX, y: newY }
          : el
      );
      
      // Actualizează și conexiunile atașate la elementul care se mută
      const updatedConnections = connections.map(conn => {
        let updated = { ...conn };
        
        // Dacă e o conexiune cu punct de start pe elementul care se mută
        if (conn.from === movingElement && conn.fromPoint && typeof conn.fromPoint === 'object' && conn.fromPoint.x !== undefined) {
          updated.fromPoint = {
            ...conn.fromPoint,
            x: conn.fromPoint.x + deltaX,
            y: conn.fromPoint.y + deltaY
          };
        }
        
        // Dacă e o conexiune cu punct de final pe elementul care se mută
        if (conn.to === movingElement && conn.toPoint && typeof conn.toPoint === 'object' && conn.toPoint.x !== undefined) {
          updated.toPoint = {
            ...conn.toPoint,
            x: conn.toPoint.x + deltaX,
            y: conn.toPoint.y + deltaY
          };
        }
        
        // Actualizează și control points dacă sunt relative la element care se mută
        if (conn.controlPoints && (conn.from === movingElement || conn.to === movingElement)) {
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

  // Resize element - mouse move
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
      
      // Permite activatorului să fie mult mai subțire
      const currentEl = elements.find(el => el.id === elementId);
      const minWidth = (currentEl && currentEl.type === 'ACTIVATION') ? 2 : 100;
      const minHeight = 60;
      
      // Calculează noile dimensiuni în funcție de direcție
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
      
      // Verifică coliziunea cu alte elemente
      if (hasCollisionWithOthers(elementId, Math.max(0, newX), Math.max(0, newY), newWidth, newHeight)) {
        return; // Nu permite resize dacă ar cauza suprapunere
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

  // Start resize
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

  const handleSaveName = () => {
    if (editingElement) {
      setElements(
        elements.map(el =>
          el.id === editingElement ? { ...el, name: editName } : el
        )
      );
      setEditingElement(null);
    }
  };

  // Handle dragging of control points
  useEffect(() => {
    const handleControlPointMove = (e) => {
      if (!draggingControlPoint) return;
      
      const { connectionId, pointIndex, startX, startY } = draggingControlPoint;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const newX = e.clientX - canvasRect.left;
      const newY = e.clientY - canvasRect.top;
      
      // Update the control point position
      setConnections(connections.map(conn => {
        if (conn.id === connectionId && conn.controlPoints) {
          const newCPs = [...conn.controlPoints];
          newCPs[pointIndex] = { ...newCPs[pointIndex], x: newX, y: newY };
          
          // Nu resortezi punctele - doar updatează poziția celui dragat
          return { ...conn, controlPoints: newCPs };
        }
        return conn;
      }));
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

  // Handle dragging of endpoint (start/end points of connections)
  useEffect(() => {
    const handleEndpointMove = (e) => {
      if (!draggingEndpoint || !canvasRef.current) return;
      
      const { connectionId, endpointType } = draggingEndpoint;
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const mouseX = e.clientX - canvasRect.left;
      const mouseY = e.clientY - canvasRect.top;
      
      setConnections(prevConnections => {
        const conn = prevConnections.find(c => c.id === connectionId);
        if (!conn) return prevConnections;
        
        const element = elements.find(el => el.id === (endpointType === 'from' ? conn.from : conn.to));
        if (!element) return prevConnections;
        
        // Calculate element height
        let elementHeight = element.height || 120;
        if (element.type === 'CLASS' || element.type === 'INTERFACE') {
          const headerHeight = element.type === 'INTERFACE' ? 50 : 36;
          const attrHeight = Math.max(30, (element.attributes?.length || 0) * 20 + 12);
          const methodHeight = Math.max(30, (element.methods?.length || 0) * 20 + 12);
          elementHeight = headerHeight + attrHeight + methodHeight;
        }
        
        // Calculate element bounds
        const elX = element.x;
        const elY = element.y;
        const elW = element.width || 150;
        const elH = elementHeight;
        
        // Use the same helper function as initial placement for consistency
        const newPoint = findClosestBoundaryPoint(element, elementHeight, mouseX, mouseY, elX, elY);
        
        // Update connection
        return prevConnections.map(c => {
          if (c.id === connectionId) {
            if (endpointType === 'from') {
              return { ...c, fromPoint: newPoint };
            } else {
              return { ...c, toPoint: newPoint };
            }
          }
          return c;
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
  }, [draggingEndpoint, elements]);

  // Handler pentru export JSON
  const handleSaveJSON = () => {
    const data = JSON.stringify({ selectedType, elements, connections }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uml-diagram.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Handler pentru export SVG
  const handleSaveSVG = () => {
    const svg = document.querySelector('.connections-layer');
    if (!svg) return;
    const serializer = new XMLSerializer();
    let svgString = serializer.serializeToString(svg);
    // Adaugă XML header dacă lipsește
    if (!svgString.startsWith('<?xml')) {
      svgString = '<?xml version="1.0" standalone="no"?>\r\n' + svgString;
    }
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uml-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Escapează caractere speciale pentru XML/SVG
  const escapeXML = (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Export SVG complet (clase + conexiuni)
  const handleExportFullSVG = () => {
    // Dimensiuni SVG
    const padding = 40;
    const allX = elements.map(el => [el.x, el.x + (el.width || 150)]).flat();
    const allY = elements.map(el => [el.y, el.y + (el.height || 120)]).flat();
    const minX = Math.min(...allX, 0) - padding;
    const minY = Math.min(...allY, 0) - padding;
    const maxX = Math.max(...allX, 800) + padding;
    const maxY = Math.max(...allY, 600) + padding;
    const width = maxX - minX;
    const height = maxY - minY;

    // SVG header
    let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    svg += `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='${minX} ${minY} ${width} ${height}'>\n`;
    svg += `<defs>
      <marker id='arrowTriangle' markerWidth='18' markerHeight='18' refX='17' refY='9' orient='auto'>
        <path d='M 0 0 L 18 9 L 0 18 Z' fill='white' stroke='#8b4513' stroke-width='2' stroke-linejoin='miter'/>
      </marker>
      <marker id='arrowDiamond' markerWidth='18' markerHeight='18' refX='17' refY='9' orient='auto'>
        <path d='M 0 9 L 9 0 L 18 9 L 9 18 Z' fill='#8b4513' stroke='#8b4513' stroke-width='1'/>
      </marker>
      <marker id='arrowSimple' markerWidth='14' markerHeight='14' refX='13' refY='7' orient='auto'>
        <path d='M 0 0 L 14 7 L 0 14' fill='none' stroke='#8b4513' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>
      </marker>
      <marker id='arrowOpen' markerWidth='14' markerHeight='14' refX='13' refY='7' orient='auto'>
        <path d='M 0 0 L 14 7 L 0 14' fill='none' stroke='#8b4513' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/>
      </marker>
    </defs>\n`;

    // Funcție pentru calculare puncte conexiuni (suportă toate tipurile de elemente)
    function getConnectionPointsSVG(conn) {
      const fromEl = elements.find(el => el.id === conn.from);
      const toEl = elements.find(el => el.id === conn.to);
      if (!fromEl || !toEl) return null;
      
      // Calculează înălțime reală pe baza tipului
      const getElementHeightForCalc = (el) => {
        if (el.type === 'CLASS' || el.type === 'INTERFACE') {
          const headerHeight = el.type === 'INTERFACE' ? 50 : 36;
          const attrHeight = Math.max(30, (el.attributes?.length || 0) * 20 + 12);
          const methodHeight = Math.max(30, (el.methods?.length || 0) * 20 + 12);
          return headerHeight + attrHeight + methodHeight;
        }
        return el.height || 120;
      };
      
      const fromHeight = getElementHeightForCalc(fromEl);
      const toHeight = getElementHeightForCalc(toEl);
      
      let startX, startY, endX, endY, targetEdge;

      // ALWAYS snap to cardinal points to match connection mode dots
      const fromX = fromEl.x + (fromEl.width || 150) / 2;
      const fromY = fromEl.y + fromHeight / 2;
      const toX = toEl.x + (toEl.width || 150) / 2;
      const toY = toEl.y + toHeight / 2;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      
      // Calculate which cardinal point is closest for a given angle
      const getClosestCardinalPoint = (element, elementHeight, calcAngle) => {
        const centerX = element.x + (element.width || 150) / 2;
        const centerY = element.y + elementHeight / 2;
        
        // Normalize angle to 0-2π
        let normalizedAngle = calcAngle;
        if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
        
        // Map angle ranges to cardinal directions
        // 0° = right (0 to π/4 and 7π/4 to 2π)
        // 90° = bottom (π/4 to 3π/4)
        // 180° = left (3π/4 to 5π/4)
        // 270° = top (5π/4 to 7π/4)
        
        if (normalizedAngle < Math.PI / 4 || normalizedAngle >= 7 * Math.PI / 4) {
          // RIGHT point
          return {
            point: 'right',
            x: element.x + (element.width || 150),
            y: centerY,
            edge: 'right'
          };
        } else if (normalizedAngle < 3 * Math.PI / 4) {
          // BOTTOM point
          return {
            point: 'bottom',
            x: centerX,
            y: element.y + elementHeight,
            edge: 'bottom'
          };
        } else if (normalizedAngle < 5 * Math.PI / 4) {
          // LEFT point
          return {
            point: 'left',
            x: element.x,
            y: centerY,
            edge: 'left'
          };
        } else {
          // TOP point
          return {
            point: 'top',
            x: centerX,
            y: element.y,
            edge: 'top'
          };
        }
      };
      
      // Get cardinal points for FROM and TO elements
      const fromCardinal = getClosestCardinalPoint(fromEl, fromHeight, angle);
      const toCardinal = getClosestCardinalPoint(toEl, toHeight, angle + Math.PI);
      
      // Use explicit points if available, otherwise use cardinal snapping
      if (conn.fromPoint && conn.toPoint) {
        // Check if points are objects with exact coordinates (new format)
        if (typeof conn.fromPoint === 'object' && conn.fromPoint.x !== undefined) {
          // New format: exact coordinates
          startX = conn.fromPoint.x;
          startY = conn.fromPoint.y;
          endX = conn.toPoint.x;
          endY = conn.toPoint.y;
          targetEdge = conn.toPoint.point;
        } else {
          // Old format: cardinal points
          const fromPoints = getElementConnectionPoints(fromEl, fromHeight);
          const toPoints = getElementConnectionPoints(toEl, toHeight);
          const fromPoint = fromPoints[conn.fromPoint];
          const toPoint = toPoints[conn.toPoint];
          startX = fromPoint.x;
          startY = fromPoint.y;
          endX = toPoint.x;
          endY = toPoint.y;
          targetEdge = conn.toPoint;
        }
      } else {
        // Use cardinal point snapping for old connections
        startX = fromCardinal.x;
        startY = fromCardinal.y;
        endX = toCardinal.x;
        endY = toCardinal.y;
        targetEdge = toCardinal.edge;
      }

      // Adjust end point to stick out from the edge perpendicular to arrow direction
      const arrowStickOut = 3;
      if (targetEdge === 'top') {
        endY -= arrowStickOut;
      } else if (targetEdge === 'bottom') {
        endY += arrowStickOut;
      } else if (targetEdge === 'left') {
        endX -= arrowStickOut;
      } else if (targetEdge === 'right') {
        endX += arrowStickOut;
      }
      
      // Return edge info for pathfinding to ensure perpendicular approach
      return { startX, startY, endX, endY, targetEdge };
    }

    // Conexiuni
    connections.forEach(conn => {
      const points = getConnectionPointsSVG(conn);
      if (!points) return;
      
      // Build waypoints - either through control points or direct
      let waypoints;
      if (conn.controlPoints && conn.controlPoints.length > 0) {
        // Route through control points in order
        waypoints = [{ x: points.startX, y: points.startY }];
        for (const cp of conn.controlPoints) {
          waypoints.push({ x: cp.x, y: cp.y });
        }
        waypoints.push({ x: points.endX, y: points.endY });
      } else {
        // Find path around obstacles with perpendicular approach based on target edge
        waypoints = findPathAroundObstacles(
          points.startX,
          points.startY,
          points.endX,
          points.endY,
          elements,
          [conn.from, conn.to],
          points.targetEdge
        );
      }
      // Use orthogonal routing for control points, obstacle avoidance otherwise
      const pathD = conn.controlPoints && conn.controlPoints.length > 0 
        ? buildOrthogonalPathThroughWaypoints(waypoints) 
        : waypointsToPath(waypoints);
      
      let marker = '';
      let strokeDasharray = 'none';
      let stroke = '#8b4513';
      let strokeWidth = '2';
      
      // Class Diagram connections
      if (conn.type === 'INHERITANCE') {
        marker = 'url(#arrowTriangle)';
      } else if (conn.type === 'COMPOSITION') {
        marker = 'url(#arrowDiamond)';
      } else if (conn.type === 'AGGREGATION') {
        marker = 'url(#arrowDiamondOpen)';
      } else if (conn.type === 'ASSOCIATION') {
        // CLASS ASSOCIATION - marker triunghi mic
        if (selectedType === 'CLASS') {
          marker = 'url(#arrowSimple)';
        }
        // USE_CASE ASSOCIATION - linie simplă fără marker
      } else if (conn.type === 'GENERALIZATION') {
        // USE_CASE GENERALIZATION - triunghi ca inheritance
        marker = 'url(#arrowTriangle)';
      } else if (conn.type === 'INCLUDE' || conn.type === 'EXTEND') {
        marker = 'url(#arrowOpen)';
        strokeDasharray = '6,6';
      }
      // Sequence Diagram connections
      else if (conn.type === 'LINE_ARROW') {
        marker = 'url(#arrowSimple)';
        stroke = '#8b4513';
      } else if (conn.type === 'LINE') {
        stroke = '#8b4513';
      } else if (conn.type === 'DOTTED_ARROW') {
        strokeDasharray = '6,6';
        marker = 'url(#arrowOpen)';
        stroke = '#8b4513';
      } else if (conn.type === 'DOTTED') {
        strokeDasharray = '6,6';
        stroke = '#8b4513';
      }
      
      let pathAttrs = `d='${pathD}' stroke='${stroke}' stroke-width='${strokeWidth}' fill='none'`;
      if (strokeDasharray !== 'none') {
        pathAttrs += ` stroke-dasharray='${strokeDasharray}'`;
      }
      if (marker) {
        pathAttrs += ` marker-end='${marker}'`;
      }
      svg += `<path ${pathAttrs} />\n`;
      
      // Adauga label pentru INCLUDE și EXTEND
      if (conn.type === 'INCLUDE' || conn.type === 'EXTEND') {
        const midX = (points.startX + points.endX) / 2;
        const midY = (points.startY + points.endY) / 2;
        // Calculate perpendicular offset based on line angle
        const dx = points.endX - points.startX;
        const dy = points.endY - points.startY;
        const lineLength = Math.sqrt(dx * dx + dy * dy);
        const perpDistance = 15;
        const perpX = lineLength > 0 ? -dy / lineLength * perpDistance : 0;
        const perpY = lineLength > 0 ? dx / lineLength * perpDistance : 0;
        const labelText = conn.type === 'INCLUDE' ? '&lt;&lt;include&gt;&gt;' : '&lt;&lt;extend&gt;&gt;';
        svg += `<text x='${midX + perpX}' y='${midY + perpY - 6}' font-size='12' font-family='monospace' text-anchor='middle' fill='#8b4513' font-weight='500'>${labelText}</text>\n`;
      }
    });

    // Elemente UML (Class, Sequence, Use Case)
    elements.forEach(el => {
      const w = el.width || 150;
      const h = el.height || 120;
      const x = el.x;
      const y = el.y;
      
      if (el.type === 'CLASS' || el.type === 'INTERFACE') {
        // Clase UML
        // Box
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='6' fill='#fffef0' stroke='#8b4513' stroke-width='2'/>\n`;
        // Header
        svg += `<rect x='${x}' y='${y}' width='${w}' height='32' fill='#fff7e6' stroke='#8b4513' stroke-width='1'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + 22}' font-size='18' font-family='monospace' font-weight='bold' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
        // Linie sub header
        svg += `<line x1='${x}' y1='${y + 32}' x2='${x + w}' y2='${y + 32}' stroke='#8b4513' stroke-width='1'/>\n`;
        // Atribute
        if (el.attributes && el.attributes.length) {
          el.attributes.forEach((attr, i) => {
            svg += `<text x='${x + 8}' y='${y + 52 + i * 18}' font-size='15' font-family='monospace' fill='#222'>${escapeXML(attr)}</text>\n`;
          });
        }
        // Linie sub atribute
        const attrSectionHeight = 32 + (el.attributes ? el.attributes.length * 18 : 0);
        svg += `<line x1='${x}' y1='${y + attrSectionHeight}' x2='${x + w}' y2='${y + attrSectionHeight}' stroke='#8b4513' stroke-width='1'/>\n`;
        // Metode
        if (el.methods && el.methods.length) {
          el.methods.forEach((m, i) => {
            svg += `<text x='${x + 8}' y='${y + attrSectionHeight + 20 + i * 18}' font-size='15' font-family='monospace' fill='#222'>${escapeXML(m)}</text>\n`;
          });
        }
      } else if (el.type === 'ACTOR') {
        // Actor SVG - exact ca în editor
        const centerX = x + w / 2;
        const headR = 7;
        const headY = y + 10;
        // Centrul pentru scalare
        svg += `<g transform='translate(${centerX}, ${headY})'>\n`;
        svg += `<circle cx='0' cy='0' r='${headR}' fill='#f9d6d6' stroke='#222' stroke-width='1.5'/>\n`;
        svg += `<line x1='0' y1='${headR}' x2='0' y2='${28}' stroke='#222' stroke-width='1.5'/>\n`;
        svg += `<line x1='-14' y1='${15}' x2='14' y2='${15}' stroke='#222' stroke-width='1.2'/>\n`;
        svg += `<line x1='0' y1='${28}' x2='-12' y2='${47}' stroke='#222' stroke-width='1.5'/>\n`;
        svg += `<line x1='0' y1='${28}' x2='12' y2='${47}' stroke='#222' stroke-width='1.5'/>\n`;
        svg += `</g>\n`;
        svg += `<text x='${centerX}' y='${y + h + 15}' font-size='14' font-family='monospace' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'OBJECT') {
        // Object - dreptunghi alb cu border și text centrat
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='#ffffff' stroke='#222' stroke-width='1.5' rx='2'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + h / 2 + 4}' font-size='13' font-family='monospace' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'ACTIVATION') {
        // Activation - linie verticală subțire (6px larg, 80% înălțime)
        const barWidth = 6;
        const barHeight = h * 0.8;
        const barX = x + w / 2 - barWidth / 2;
        const barY = y + (h - barHeight) / 2;
        svg += `<rect x='${barX}' y='${barY}' width='${barWidth}' height='${barHeight}' fill='#e5e7eb' stroke='#999' stroke-width='0.5' rx='1.5'/>\n`;
      } else if (el.type === 'DESTROY') {
        // Destroy - ✕ mare cu culoare violetă
        const cx = x + w / 2;
        const cy = y + h / 2;
        const sz = 18;
        svg += `<text x='${cx}' y='${cy + 8}' font-size='40' font-family='Arial' text-anchor='middle' fill='#7c3aed' font-weight='bold'>✕</text>\n`;
        svg += `<text x='${cx}' y='${y + h + 15}' font-size='14' font-family='monospace' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'BOUNDARY') {
        // Boundary - cerc cu text sub
        const r = Math.min(w / 2, h / 2);
        svg += `<circle cx='${x + w / 2}' cy='${y + h / 2}' r='${r - 1}' fill='none' stroke='#222' stroke-width='1.5'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + h + 15}' font-size='14' font-family='monospace' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'CONTROL') {
        // Control - emoji ↻ centrat
        svg += `<text x='${x + w / 2}' y='${y + h / 2 + 12}' font-size='30' font-family='Arial' text-anchor='middle' fill='#222'>↻</text>\n`;
        svg += `<text x='${x + w / 2}' y='${y + h + 15}' font-size='14' font-family='monospace' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'ALT') {
        // ALT - dreptunghi cu border mov și text "alt" în colțul stânga sus
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='none' stroke='#a78bfa' stroke-width='2' rx='2'/>\n`;
        svg += `<text x='${x + 6}' y='${y + 13}' font-size='11' font-family='monospace' fill='#7c3aed' font-weight='500'>alt</text>\n`;
        // Linie separatoare după header
        svg += `<line x1='${x}' y1='${y + 18}' x2='${x + w}' y2='${y + 18}' stroke='#a78bfa' stroke-width='1'/>\n`;
        // Text în mijloc
        svg += `<text x='${x + w / 2}' y='${y + h / 2 + 5}' font-size='13' font-family='monospace' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'LOOP') {
        // LOOP - dreptunghi cu titlu "loop" și text în mijloc
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='none' stroke='#8b7d3f' stroke-width='1.5' rx='2'/>\n`;
        svg += `<rect x='${x}' y='${y}' width='${w}' height='24' fill='#fff4e6' stroke='#8b7d3f' stroke-width='1.5'/>\n`;
        svg += `<text x='${x + 6}' y='${y + 16}' font-size='11' font-family='monospace' fill='#8b7d3f' font-weight='500'>loop</text>\n`;
        svg += `<text x='${x + w / 2}' y='${y + h / 2 + 5}' font-size='13' font-family='monospace' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'USE_CASE') {
        // Use Case - elipsă
        svg += `<ellipse cx='${x + w / 2}' cy='${y + h / 2}' rx='${w / 2 - 1}' ry='${h / 2 - 1}' fill='#fff4e6' stroke='#8b4513' stroke-width='1.5'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + h / 2 + 5}' font-size='14' font-family='monospace' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'ACTOR' && selectedType === 'USE_CASE') {
        // ACTOR pentru USE_CASE - stick figure
        const centerX = x + w / 2;
        const centerY = y + h / 2;
        const headRadius = 4;
        const bodyHeight = h * 0.4;
        
        svg += `<circle cx='${centerX}' cy='${centerY - bodyHeight / 2 - 6}' r='${headRadius}' fill='none' stroke='#222' stroke-width='1'/>\n`;
        svg += `<line x1='${centerX}' y1='${centerY - bodyHeight / 2}' x2='${centerX}' y2='${centerY + bodyHeight / 2 - 10}' stroke='#222' stroke-width='1'/>\n`;
        svg += `<line x1='${centerX - 6}' y1='${centerY - bodyHeight / 2 + 4}' x2='${centerX + 6}' y2='${centerY - bodyHeight / 2 + 4}' stroke='#222' stroke-width='1'/>\n`;
        svg += `<line x1='${centerX}' y1='${centerY + bodyHeight / 2 - 10}' x2='${centerX - 4}' y2='${centerY + bodyHeight / 2}' stroke='#222' stroke-width='1'/>\n`;
        svg += `<line x1='${centerX}' y1='${centerY + bodyHeight / 2 - 10}' x2='${centerX + 4}' y2='${centerY + bodyHeight / 2}' stroke='#222' stroke-width='1'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + h + 15}' font-size='14' font-family='monospace' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      } else if (el.type === 'SYSTEM') {
        // System - dreptunghi gros
        svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='#f0f0f0' stroke='#8b4513' stroke-width='2' rx='3'/>\n`;
        svg += `<text x='${x + w / 2}' y='${y + h / 2 + 5}' font-size='14' font-family='monospace' text-anchor='middle' fill='#222'>${escapeXML(el.name)}</text>\n`;
      }
    });

    svg += `</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'uml-diagram.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Adaugă atribut nou la dublu-click pe secțiunea de atribute
  const handleAddAttribute = (e, elementId) => {
    e.stopPropagation();
    const el = elements.find(elem => elem.id === elementId);
    if (!el || el.type !== 'CLASS') return;
    // Salvează editarea curentă dacă există
    if (editingMember) {
      handleSaveMember(false);
    }
    const newAttrs = [...(el.attributes || []), '-newAttr: Type'];
    const newIndex = newAttrs.length - 1;
    setElements(elements.map(elem => 
      elem.id === elementId ? { ...elem, attributes: newAttrs } : elem
    ));
    // Activează editarea pentru noul atribut
    setEditingMember({ elementId, type: 'attribute', index: newIndex });
    setEditMemberValue('-newAttr: Type');
    setSelectedElement(elementId);
  };

  // Adaugă metodă nouă la dublu-click pe secțiunea de metode
  const handleAddMethod = (e, elementId) => {
    e.stopPropagation();
    
    // Salvează editarea curentă dacă există
    if (editingMember) {
      handleSaveMember(false);
    }
    
    const el = elements.find(elem => elem.id === elementId);
    if (!el) return;
    
    const newMethods = [...(el.methods || []), '+method(): void'];
    const newIndex = newMethods.length - 1;
    
    setElements(elements.map(elem => 
      elem.id === elementId ? { ...elem, methods: newMethods } : elem
    ));
    
    // Activează editarea pentru noua metodă
    setEditingMember({ elementId, type: 'method', index: newIndex });
    setEditMemberValue('+method(): void');
    setSelectedElement(elementId);
  };

  // Editează un membru existent (atribut sau metodă)
  const handleEditMember = (e, elementId, type, index, value) => {
    e.stopPropagation();
    
    // Salvează editarea curentă dacă există și e diferită de noua editare
    if (editingMember && (editingMember.elementId !== elementId || editingMember.type !== type || editingMember.index !== index)) {
      handleSaveMember(false);
    }
    
    setEditingMember({ elementId, type, index });
    setEditMemberValue(value);
  };

  // Salvează valoarea membrului editat (addNext = true adaugă un nou membru după)
  const handleSaveMember = (addNext = false) => {
    if (!editingMember) return;
    
    const { elementId, type, index } = editingMember;
    const currentEl = elements.find(e => e.id === elementId);
    if (!currentEl) return;
    
    let nextIndex = -1;
    const defaultAttr = '-attr: Type';
    const defaultMethod = '+method(): void';
    
    if (type === 'attribute') {
      if (currentEl.type !== 'CLASS') return; // Nu permite editarea atributelor pentru INTERFACE
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

  const handleDeleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    // Șterge și conexiunile asociate
    setConnections(connections.filter(c => c.from !== id && c.to !== id));
    setSelectedElement(null);
    setEditingElement(null);
  };

  const handleDeleteConnection = (id) => {
    setConnections(connections.filter(c => c.id !== id));
  };

  // Calculează înălțimea efectivă a unui element (pentru clase UML)
  const getElementHeight = (el) => {
    if (el.type === 'CLASS' || el.type === 'INTERFACE') {
      const headerHeight = el.type === 'INTERFACE' ? 50 : 36;
      const attrHeight = Math.max(30, (el.attributes?.length || 0) * 20 + 12);
      const methodHeight = Math.max(30, (el.methods?.length || 0) * 20 + 12);
      return headerHeight + attrHeight + methodHeight;
    }
    return el.height;
  };

  // Calculează punctele de conexiune pe baza coordonatelor REALE din DOM
  const getActualConnectionPoints = (el) => {
    if (!canvasRef.current) return null;
    
    // Cauta elementul DOM după id
    const domElement = canvasRef.current.querySelector(`[data-element-id="${el.id}"]`);
    if (!domElement) return null;
    
    const domRect = domElement.getBoundingClientRect();
    const canvasRect = canvasRef.current.getBoundingClientRect();
    
    // Convertește din coordonate browser la coordonate relative la canvas
    const x = domRect.left - canvasRect.left;
    const y = domRect.top - canvasRect.top;
    const width = domRect.width;
    const height = domRect.height;
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    return {
      top: { x: centerX, y: y, point: 'top' },
      bottom: { x: centerX, y: y + height, point: 'bottom' },
      left: { x: x, y: centerY, point: 'left' },
      right: { x: x + width, y: centerY, point: 'right' }
    };
  };

  // Calculează punctele pentru o conexiune
  const getConnectionPoints = (conn) => {
    const fromEl = elements.find(el => el.id === conn.from);
    const toEl = elements.find(el => el.id === conn.to);
    if (!fromEl || !toEl) return null;

    let startX, startY, endX, endY, targetEdge;

    // TRY to get actual DOM positions first (most accurate)
    const fromDomPoints = getActualConnectionPoints(fromEl);
    const toDomPoints = getActualConnectionPoints(toEl);

    // Dacă conexiunea are puncte selectate manual, le folosesc
    if (conn.fromPoint && conn.toPoint) {
      // Check if points are objects with exact coordinates (new format)
      // or strings like 'top', 'bottom' (old format)
      if (typeof conn.fromPoint === 'object' && conn.fromPoint.x !== undefined) {
        // New format: exact coordinates
        startX = conn.fromPoint.x;
        startY = conn.fromPoint.y;
        endX = conn.toPoint.x;
        endY = conn.toPoint.y;
        targetEdge = conn.toPoint.point;
      } else {
        // Old format: cardinal points
        // Use actual DOM positions if available, otherwise fallback
        if (fromDomPoints && toDomPoints && typeof conn.fromPoint === 'string') {
          const fromPoint = fromDomPoints[conn.fromPoint];
          const toPoint = toDomPoints[conn.toPoint];
          startX = fromPoint.x;
          startY = fromPoint.y;
          endX = toPoint.x;
          endY = toPoint.y;
        } else {
          // Fallback to calculated height
          const fromHeight = getElementHeight(fromEl);
          const toHeight = getElementHeight(toEl);
          const fromPoints = getElementConnectionPoints(fromEl, fromHeight);
          const toPoints = getElementConnectionPoints(toEl, toHeight);
          
          const fromPoint = fromPoints[conn.fromPoint];
          const toPoint = toPoints[conn.toPoint];
          
          startX = fromPoint.x;
          startY = fromPoint.y;
          endX = toPoint.x;
          endY = toPoint.y;
        }
        targetEdge = typeof conn.toPoint === 'string' ? conn.toPoint : conn.toPoint.point;
      }
    } else {
      // Use actual DOM dimensions if available for better accuracy
      if (fromDomPoints && toDomPoints) {
        const angle = Math.atan2(
          toDomPoints.bottom.y - fromDomPoints.bottom.y,
          toDomPoints.right.x - fromDomPoints.right.x
        );
        
        const getClosestCardinalFromDOM = (domPoints, calcAngle) => {
          // Normalize angle to 0-2π
          let normalizedAngle = calcAngle;
          if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
          
          // Pick cardinal direction based on angle
          if (normalizedAngle < Math.PI / 4 || normalizedAngle >= 7 * Math.PI / 4) {
            return { ...domPoints.right, edge: 'right' };
          } else if (normalizedAngle < 3 * Math.PI / 4) {
            return { ...domPoints.bottom, edge: 'bottom' };
          } else if (normalizedAngle < 5 * Math.PI / 4) {
            return { ...domPoints.left, edge: 'left' };
          } else {
            return { ...domPoints.top, edge: 'top' };
          }
        };
        
        const fromCardinal = getClosestCardinalFromDOM(fromDomPoints, angle);
        const toCardinal = getClosestCardinalFromDOM(toDomPoints, angle + Math.PI);
        
        startX = fromCardinal.x;
        startY = fromCardinal.y;
        endX = toCardinal.x;
        endY = toCardinal.y;
        targetEdge = toCardinal.edge;
      } else {
        // Fallback: use calculated heights
        const fromHeight = getElementHeight(fromEl);
        const toHeight = getElementHeight(toEl);
        const fromX = fromEl.x + fromEl.width / 2;
        const fromY = fromEl.y + fromHeight / 2;
        const toX = toEl.x + toEl.width / 2;
        const toY = toEl.y + toHeight / 2;
        const angle = Math.atan2(toY - fromY, toX - fromX);

        const getClosestCardinalPoint = (element, elementHeight, calcAngle) => {
          const centerX = element.x + element.width / 2;
          const centerY = element.y + elementHeight / 2;
          
          let normalizedAngle = calcAngle;
          if (normalizedAngle < 0) normalizedAngle += 2 * Math.PI;
          
          if (normalizedAngle < Math.PI / 4 || normalizedAngle >= 7 * Math.PI / 4) {
            return {
              point: 'right',
              x: element.x + element.width,
              y: centerY,
              edge: 'right'
            };
          } else if (normalizedAngle < 3 * Math.PI / 4) {
            return {
              point: 'bottom',
              x: centerX,
              y: element.y + elementHeight,
              edge: 'bottom'
            };
          } else if (normalizedAngle < 5 * Math.PI / 4) {
            return {
              point: 'left',
              x: element.x,
              y: centerY,
              edge: 'left'
            };
          } else {
            return {
              point: 'top',
              x: centerX,
              y: element.y,
              edge: 'top'
            };
          }
        };

        const fromCardinal = getClosestCardinalPoint(fromEl, fromHeight, angle);
        const toCardinal = getClosestCardinalPoint(toEl, toHeight, angle + Math.PI);
        
        startX = fromCardinal.x;
        startY = fromCardinal.y;
        endX = toCardinal.x;
        endY = toCardinal.y;
        targetEdge = toCardinal.edge;
      }
    }

    // Adjust end point to stick out from the edge perpendicular to arrow direction
    const arrowStickOut = 3;
    if (targetEdge === 'top') {
      endY -= arrowStickOut;
    } else if (targetEdge === 'bottom') {
      endY += arrowStickOut;
    } else if (targetEdge === 'left') {
      endX -= arrowStickOut;
    } else if (targetEdge === 'right') {
      endX += arrowStickOut;
    }

    // Return edge info for pathfinding to ensure perpendicular approach
    return { startX, startY, endX, endY, midX: (startX + endX) / 2, midY: (startY + endY) / 2, targetEdge };
  };

  // Render arrow marker based on connection type
  const getArrowMarker = (type) => {
    switch (type) {
      case 'INHERITANCE':
        return 'url(#arrowTriangle)';
      case 'COMPOSITION':
        return 'url(#arrowDiamond)';
      case 'ASSOCIATION':
      case 'MESSAGE':
        return 'url(#arrowSimple)';
      case 'INCLUDE':
      case 'EXTEND':
        return 'url(#arrowOpen)';
      default:
        return 'url(#arrowSimple)';
    }
  };

  // Click pe canvas - deselect
  const handleCanvasClick = () => {
    setSelectedElement(null);
    setEditingElement(null);
    setHoveringConnectionPoint(null);
    setHoveringConnectionElement(null);
    setSelectedConnection(null);
    setConnectionMode(null);
    setConnectionStart(null);
  };

  // Handler generic pentru click pe o linie de conexiune - adăugare/ștergere control points
  const handleConnectionLineClick = (e, connId) => {
    e.stopPropagation();
    
    // Detect if user wants to delete (Shift+click) or add control point
    if (e.shiftKey) {
      const conn = connections.find(c => c.id === connId);
      if (conn && window.confirm(`Șterge conexiunea ${conn.label}?`)) {
        handleDeleteConnection(connId);
      }
    } else {
      // Add control point at click location
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const clickX = e.clientX - canvasRect.left;
      const clickY = e.clientY - canvasRect.top;
      
      // Add new control point
      const conn = connections.find(c => c.id === connId);
      if (!conn) return;
      
      const newControlPoints = conn.controlPoints ? [...conn.controlPoints] : [];
      const pointId = Date.now();
      newControlPoints.push({ x: clickX, y: clickY, id: pointId });
      
      // Update connection
      const updatedConnections = connections.map(c => 
        c.id === connId 
          ? { ...c, controlPoints: newControlPoints }
          : c
      );
      setConnections(updatedConnections);
      
      // Immediately start dragging the newly added control point
      const pointIndex = newControlPoints.length - 1;
      setDraggingControlPoint({
        connectionId: connId,
        pointIndex: pointIndex,
        startX: clickX,
        startY: clickY
      });
      
      // Select this connection for control point editing
      setSelectedConnection(connId);
      console.log(`Control point adăugat și marcat pentru drag la conexiune ${connId} la (${clickX}, ${clickY})`);
    }
  };

  // Anulare mod conexiune
  const cancelConnectionMode = () => {
    setConnectionMode(null);
    setConnectionStart(null);
    setConnectionStartPoint(null);
    setHoveringConnectionPoint(null);
  };

  const elementsList = getElementsList();

  // Detectează tipul diagramei pe baza elementelor
  const detectDiagramType = (elements) => {
    if (!elements || elements.length === 0) return 'CLASS';
    
    const types = new Set(elements.map(el => el.type));
    
    // Check pentru Sequence Diagram
    const sequenceTypes = ['ACTOR', 'OBJECT', 'ACTIVATION', 'DESTROY', 'BOUNDARY', 'CONTROL', 'ALT', 'LOOP'];
    if ([...types].some(t => sequenceTypes.includes(t))) return 'SEQUENCE';
    
    // Check pentru Use Case Diagram
    const useCaseTypes = ['USE_CASE', 'SYSTEM'];
    if ([...types].some(t => useCaseTypes.includes(t))) return 'USE_CASE';
    
    // Check pentru Component Diagram
    const componentTypes = ['COMPONENT', 'INTERFACE'];
    if ([...types].some(t => componentTypes.includes(t))) return 'COMPONENT';
    
    // Check pentru Deployment Diagram
    if ([...types].has('NODE') || [...types].has('ARTIFACT')) return 'DEPLOYMENT';
    
    // Check pentru Object Diagram
    if ([...types].has('OBJECT_INSTANCE')) return 'OBJECT';
    
    // Check pentru Package Diagram
    const packageTypes = ['PACKAGE'];
    if ([...types].some(t => packageTypes.includes(t))) return 'PACKAGE';
    
    // Check pentru Activity/State Diagram
    const activityTypes = ['ACTION', 'DECISION', 'FORK_JOIN'];
    if ([...types].some(t => activityTypes.includes(t))) return 'ACTIVITY';
    
    const stateTypes = ['STATE'];
    if ([...types].some(t => stateTypes.includes(t))) return 'STATE';
    
    // Default: Class Diagram
    return 'CLASS';
  };

  // Handler import JSON
  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        // Dacă nu are selectedType (fișiere vechi), detectează automat pe baza elementelor
        const detectedType = data.selectedType || detectDiagramType(data.elements);
        setSelectedType(detectedType);
        if (data.elements && Array.isArray(data.elements)) setElements(data.elements);
        if (data.connections && Array.isArray(data.connections)) setConnections(data.connections);
      } catch (err) {
        alert('Fișier invalid!');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="uml-editor">
      {/* Header */}
      <div className="uml-header">
        <button className="btn-back" onClick={() => navigate('/dashboard')}>
          ← Back
        </button>
        <h1>UML Diagram Editor</h1>
        <div className="header-actions">
          <button className="btn-primary">Save</button>
          <div className="dropdown-save">
            <button className="btn-secondary">Export ▼</button>
            <div className="dropdown-content">
              <button onClick={handleExportFullSVG}>Export SVG</button>
              <button onClick={handleSaveJSON}>Export JSON</button>
            </div>
          </div>
          <button className="btn-secondary" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Import</button>
          <input
            type="file"
            accept="application/json"
            style={{ display: 'none' }}
            ref={fileInputRef}
            onChange={handleImport}
          />
        </div>
      </div>

      {/* Connection Mode Indicator */}
      {connectionMode && (
        <div className="connection-mode-bar">
          <span>
            🔗 Mod conexiune: <strong>{getElementsList()[connectionMode].label}</strong>
            {connectionStart 
              ? ` - Punct START selectat (${connectionStart.point}) • Click pe cercul destinației` 
              : ' - Click pe cercurile colorate de pe contur'}
          </span>
          <button onClick={cancelConnectionMode}>Anulează (Esc)</button>
        </div>
      )}

      <div className="uml-container">
        {/* Left Sidebar - Diagram Types */}
        <div className="uml-sidebar">
          <h3>Diagram Types</h3>
          <div className="diagram-types">
            {Object.entries(UML_TYPES).map(([key, label]) => (
              <button
                key={key}
                className={`diagram-btn ${selectedType === key ? 'active' : ''}`}
                onClick={() => {
                  setSelectedType(key);
                  setElements([]);
                  setConnections([]);
                  setEditingElement(null);
                  setConnectionMode(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <h3 style={{ marginTop: '20px' }}>Elements</h3>
          <div className="elements-list">
            {Object.entries(elementsList).map(([key, value]) => (
              <div
                key={key}
                className={`element-item ${value.isConnection ? 'connection-type' : ''} ${connectionMode === key ? 'active-connection' : ''}`}
                draggable={!value.isConnection}
                onDragStart={(e) => handleDragStart(e, key)}
                onClick={() => value.isConnection && handleDragStart({ preventDefault: () => {} }, key)}
                style={{ backgroundColor: '#ede9fe', color: '#5b21b6', border: '1px solid #ddd6fe' }}
              >
                <span className="element-icon">{value.icon}</span>
                <span className="element-label">{value.label}</span>
                {value.isConnection && <span className="connection-hint">click</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Canvas Area */}
        <div
          ref={canvasRef}
          className={`uml-canvas ${draggingInCanvas ? 'drag-over' : ''} ${connectionMode ? 'connection-mode' : ''}`}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onDragLeave={handleCanvasDragLeave}
          onClick={handleCanvasClick}
        >
          {elements.length === 0 && !connectionMode && (
            <div className="canvas-hint">Drag elements here to create diagram</div>
          )}

          {/* SVG pentru conexiuni */}
          <svg className="connections-layer">
            <defs>
              {/* Arrow pentru inheritance (triunghi gol - UML standard) */}
              <marker id="arrowTriangle" markerWidth="18" markerHeight="18" refX="17" refY="9" orient="auto">
                <path d="M 0 0 L 18 9 L 0 18 Z" fill="white" stroke="#8b4513" strokeWidth="2" strokeLinejoin="miter"/>
              </marker>
              {/* Arrow pentru composition (romb plin) */}
              <marker id="arrowDiamond" markerWidth="18" markerHeight="18" refX="17" refY="9" orient="auto">
                <path d="M 0 9 L 9 0 L 18 9 L 9 18 Z" fill="#8b4513" stroke="#8b4513" strokeWidth="1"/>
              </marker>
              {/* Arrow simplu pentru association */}
              <marker id="arrowSimple" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto">
                <path d="M 0 0 L 14 7 L 0 14" fill="none" stroke="#8b4513" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
              {/* Arrow pentru aggregation (romb gol) */}
              <marker id="arrowDiamondOpen" markerWidth="18" markerHeight="18" refX="17" refY="9" orient="auto">
                <path d="M 0 9 L 9 0 L 18 9 L 9 18 Z" fill="white" stroke="#8b4513" strokeWidth="2"/>
              </marker>
              {/* Arrow deschis pentru include/extend */}
              <marker id="arrowOpen" markerWidth="14" markerHeight="14" refX="13" refY="7" orient="auto">
                <path d="M 0 0 L 14 7 L 0 14" fill="none" stroke="#8b4513" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </marker>
            </defs>

            {connections.map((conn) => {
              const points = getConnectionPoints(conn);
              if (!points) return null;

              // Build waypoints - either through control points or direct
              let waypoints;
              if (conn.controlPoints && conn.controlPoints.length > 0) {
                // Route through control points in order
                waypoints = [{ x: points.startX, y: points.startY }];
                for (const cp of conn.controlPoints) {
                  waypoints.push({ x: cp.x, y: cp.y });
                }
                waypoints.push({ x: points.endX, y: points.endY });
              } else {
                // Find path around obstacles with perpendicular approach based on target edge
                waypoints = findPathAroundObstacles(
                  points.startX,
                  points.startY,
                  points.endX,
                  points.endY,
                  elements,
                  [conn.from, conn.to],
                  points.targetEdge
                );
              }
              // Use orthogonal routing for control points, obstacle avoidance otherwise
              const pathD = conn.controlPoints && conn.controlPoints.length > 0 
                ? buildOrthogonalPathThroughWaypoints(waypoints) 
                : waypointsToPath(waypoints);

              // Restaurare stil original pentru Class Diagram
              if (
                (selectedType === 'CLASS' || selectedType === 'INTERFACE') &&
                (conn.type === 'ASSOCIATION' || conn.type === 'INHERITANCE' || conn.type === 'COMPOSITION' || conn.type === 'AGGREGATION')
              ) {
                let marker = '';
                if (conn.type === 'INHERITANCE') marker = 'url(#arrowTriangle)';
                else if (conn.type === 'COMPOSITION') marker = 'url(#arrowDiamond)';
                else if (conn.type === 'AGGREGATION') marker = 'url(#arrowDiamondOpen)';
                else if (conn.type === 'ASSOCIATION') marker = 'url(#arrowSimple)';
                return (
                  <g key={conn.id} className="connection-group">
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#8b4513"
                      strokeWidth="2"
                      strokeDasharray="none"
                      markerEnd={marker}
                      className="connection-line"
                      onMouseDown={(e) => handleConnectionLineClick(e, conn.id)}
                    />
                  </g>
                );
              }

              // USE_CASE connections
              if (
                selectedType === 'USE_CASE' &&
                (conn.type === 'ASSOCIATION' || conn.type === 'GENERALIZATION' || conn.type === 'INCLUDE' || conn.type === 'EXTEND')
              ) {
                let marker = '';
                let strokeDasharray = 'none';
                if (conn.type === 'ASSOCIATION') {
                  marker = '';
                } else if (conn.type === 'GENERALIZATION') {
                  marker = 'url(#arrowTriangle)';
                } else if (conn.type === 'INCLUDE' || conn.type === 'EXTEND') {
                  strokeDasharray = '6,6';
                  marker = 'url(#arrowOpen)';
                }
                const midX = (points.startX + points.endX) / 2;
                const midY = (points.startY + points.endY) / 2;
                // Calculate perpendicular offset based on line angle
                const dx = points.endX - points.startX;
                const dy = points.endY - points.startY;
                const lineLength = Math.sqrt(dx * dx + dy * dy);
                const perpDistance = 15;
                const perpX = lineLength > 0 ? -dy / lineLength * perpDistance : 0;
                const perpY = lineLength > 0 ? dx / lineLength * perpDistance : 0;
                return (
                  <g key={conn.id} className="connection-group">
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#8b4513"
                      strokeWidth="2"
                      strokeDasharray={strokeDasharray}
                      markerEnd={marker}
                      className="connection-line"
                      onMouseDown={(e) => handleConnectionLineClick(e, conn.id)}
                    />
                    {(conn.type === 'INCLUDE' || conn.type === 'EXTEND') && (
                      <text
                        x={midX + perpX}
                        y={midY + perpY - 6}
                        fontSize="12"
                        fontFamily="monospace"
                        textAnchor="middle"
                        fill="#8b4513"
                        fontWeight="500"
                        pointerEvents="none"
                      >
                        {conn.type === 'INCLUDE' ? '<<include>>' : '<<extend>>'}
                      </text>
                    )}
                  </g>
                );
              }

              // Stiluri pentru Sequence Diagram și alte tipuri custom
              let stroke = '#8b4513';
              let strokeDasharray = 'none';
              let marker = '';
              if (conn.type === 'LINE_ARROW') {
                marker = getArrowMarker('MESSAGE');
              } else if (conn.type === 'LINE') {
                marker = '';
              } else if (conn.type === 'DOTTED_ARROW') {
                strokeDasharray = '6,6';
                marker = getArrowMarker('INCLUDE'); // open arrow
              } else if (conn.type === 'DOTTED') {
                strokeDasharray = '6,6';
                marker = '';
              }

              return (
                <g key={conn.id} className="connection-group">
                  <path
                    d={pathD}
                    fill="none"
                    stroke={stroke}
                    strokeWidth="2"
                    strokeDasharray={strokeDasharray}
                    markerEnd={marker}
                    className="connection-line"
                    onMouseDown={(e) => handleConnectionLineClick(e, conn.id)}
                  />
                </g>
              );
            })}

            {/* Endpoint visual markers - circles at start/end points when connection is selected */}
            {connections.map((conn) => {
              // Only show dots for selected connection
              if (selectedConnection !== conn.id) return null;
              
              // Get the connection endpoints
              if (!conn.fromPoint || typeof conn.fromPoint !== 'object' || !conn.fromPoint.x) return null;
              if (!conn.toPoint || typeof conn.toPoint !== 'object' || !conn.toPoint.x) return null;
              
              const fromX = conn.fromPoint.x;
              const fromY = conn.fromPoint.y;
              const toX = conn.toPoint.x;
              const toY = conn.toPoint.y;
              
              return (
                <g key={`endpoints-${conn.id}`}>
                  {/* Start point - red dot */}
                  <circle cx={fromX} cy={fromY} r="6" fill="#ff6b6b" stroke="#333" strokeWidth="1" />
                  {/* End point - cyan dot */}
                  <circle cx={toX} cy={toY} r="6" fill="#4ecdc4" stroke="#333" strokeWidth="1" />
                </g>
              );
            })}
          </svg>

          {/* Rendered Elements */}
          {elements.map((el) => {
            const isActor = (el.type === 'ACTOR') && (selectedType === 'SEQUENCE' || selectedType === 'USE_CASE');
            const isControl = (el.type === 'CONTROL' && selectedType === 'SEQUENCE');
            const isAlt = (el.type === 'ALT' && selectedType === 'SEQUENCE');
            const isBoundary = (el.type === 'BOUNDARY' && selectedType === 'SEQUENCE');
            const isDestroy = (el.type === 'DESTROY' && selectedType === 'SEQUENCE');
            const isClassType = el.type === 'CLASS' || el.type === 'INTERFACE';

            return (
              <div
                key={el.id}
                data-element-id={el.id}
                className={`uml-element ${isClassType ? 'uml-class-element' : ''} ${selectedElement === el.id ? 'selected' : ''} ${editingElement === el.id ? 'editing' : ''} ${connectionStart?.elementId === el.id ? 'connection-source' : ''} ${movingElement === el.id ? 'moving' : ''}`}
                style={{
                  left: `${el.x}px`,
                  top: `${el.y}px`,
                  width: `${el.width}px`,
                  minHeight: `${el.height}px`,
                  backgroundColor: isActor || isControl || isAlt || isBoundary || isDestroy ? 'transparent' : (isClassType ? '#fffef0' : '#ede9fe'),
                  color: '#5b21b6',
                  border: connectionMode 
                    ? (hoveringConnectionElement === el.id ? '12px solid #ec4899' : '10px dashed #a78bfa')
                    : (isAlt ? '2px solid #a78bfa' : (isClassType ? '2px solid #a78bfa' : 'none')),
                  boxShadow: connectionMode && hoveringConnectionElement === el.id
                    ? '0 0 20px rgba(236, 72, 153, 0.6), inset 0 0 10px rgba(236, 72, 153, 0.2)'
                    : (isActor || isControl || isAlt || isBoundary || isDestroy ? 'none' : undefined),
                  padding: isActor || isControl || isAlt || isBoundary || isDestroy ? 0 : undefined,
                  transition: 'border 0.15s ease, box-shadow 0.15s ease',
                  cursor: connectionMode ? 'crosshair' : 'move',
                  outline: connectionMode ? '3px solid rgba(236, 72, 153, 0.4)' : 'none',
                  outlineOffset: connectionMode ? '2px' : '0px',
                  boxSizing: 'border-box'
                }}
                onClick={(e) => handleElementClick(e, el)}
                onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                onMouseDown={(e) => handleElementMouseDown(e, el)}
                onMouseEnter={() => connectionMode && setHoveringConnectionElement(el.id)}
                onMouseLeave={() => setHoveringConnectionElement(null)}
              >
                {(isActor || isControl || isBoundary || isAlt) ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: 'none', boxShadow: 'none', border: 'none', padding: 0 }}>
                    {/* Icon actor, control sau boundary */}
                    {isActor ? (
                      <svg width="38" height="60" viewBox="0 0 38 60" style={{ marginTop: 6 }}>
                        <circle cx="19" cy="10" r="7" fill="#f9d6d6" stroke="#222" strokeWidth="1.5" />
                        <line x1="19" y1="17" x2="19" y2="38" stroke="#222" strokeWidth="1.5" />
                        <line x1="5" y1="25" x2="33" y2="25" stroke="#222" strokeWidth="1.2" />
                        <line x1="19" y1="38" x2="7" y2="57" stroke="#222" strokeWidth="1.5" />
                        <line x1="19" y1="38" x2="31" y2="57" stroke="#222" strokeWidth="1.5" />
                      </svg>
                    ) : isControl ? (
                      <div style={{ fontSize: 32, marginTop: 6 }}>↻</div>
                    ) : isBoundary ? (
                      <div style={{ fontSize: 32, marginTop: 6 }}>◯</div>
                    ) : null}
                    {/* Nume sub icon */}
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
                        style={{
                          marginTop: 8,
                          textAlign: 'center',
                          width: '90%',
                          fontSize: 15,
                          color: '#222',
                          fontFamily: 'sans-serif',
                          fontWeight: 400,
                          border: 'none',
                          borderRadius: 0,
                          background: 'transparent',
                          boxShadow: 'none',
                          outline: 'none'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div style={{ marginTop: 8, fontSize: 15, color: '#222', textAlign: 'center', fontFamily: 'sans-serif', fontWeight: 400 }}>{el.name}</div>
                    )}
                  </div>
                ) : el.type === 'DESTROY' && selectedType === 'SEQUENCE' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', boxShadow: 'none', border: 'none', padding: 0 }}>
                    <div style={{ fontSize: 44, color: '#7c3aed', fontWeight: 700, userSelect: 'none', lineHeight: 1 }}>✕</div>
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
                        style={{
                          marginTop: 4,
                          textAlign: 'center',
                          width: '90%',
                          fontSize: 15,
                          color: '#222',
                          fontFamily: 'sans-serif',
                          fontWeight: 400,
                          border: 'none',
                          borderRadius: 0,
                          background: 'transparent',
                          boxShadow: 'none',
                          outline: 'none'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div style={{ marginTop: 4, fontSize: 15, color: '#222', textAlign: 'center', fontFamily: 'sans-serif', fontWeight: 400 }}>{el.name}</div>
                    )}
                  </div>
                ) : el.type === 'ACTIVATION' && selectedType === 'SEQUENCE' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', boxShadow: 'none', border: 'none', padding: 0 }}>
                    <div style={{ width: '6px', height: '80%', background: '#e5e7eb', borderRadius: '3px', border: 'none' }} />
                  </div>
                ) : el.type === 'OBJECT' && selectedType === 'SEQUENCE' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'none', boxShadow: 'none', border: 'none', padding: 0 }}>
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
                        style={{
                          marginTop: 0,
                          textAlign: 'center',
                          width: '90%',
                          fontSize: 15,
                          color: '#222',
                          fontFamily: 'sans-serif',
                          fontWeight: 400,
                          border: 'none',
                          borderRadius: 0,
                          background: 'transparent',
                          boxShadow: 'none',
                          outline: 'none'
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <div style={{ fontSize: 15, color: '#222', textAlign: 'center', fontFamily: 'sans-serif', fontWeight: 400 }}>{el.name}</div>
                    )}
                  </div>
                ) : el.type === 'ALT' && selectedType === 'SEQUENCE' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', border: '2px solid #a78bfa', borderRadius: '2px', background: 'transparent', padding: 0 }}>
                    <div style={{ paddingTop: '2px', paddingLeft: '6px', borderBottom: '1px solid #a78bfa', minHeight: '16px', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#7c3aed', fontWeight: 500 }}>alt</span>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
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
                          style={{
                            textAlign: 'center',
                            width: '90%',
                            fontSize: 14,
                            color: '#222',
                            fontFamily: 'sans-serif',
                            fontWeight: 400,
                            border: 'none',
                            background: 'transparent',
                            boxShadow: 'none',
                            outline: 'none'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div style={{ fontSize: 14, color: '#222', textAlign: 'center', fontFamily: 'sans-serif', fontWeight: 400 }}>{el.name}</div>
                      )}
                    </div>
                  </div>
                ) : el.type === 'LOOP' && selectedType === 'SEQUENCE' ? (
                  <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', border: '1.5px solid #8b7d3f', borderRadius: '2px', background: 'transparent', padding: 0, position: 'relative' }}>
                    <div style={{ padding: '2px 6px', background: '#fff4e6', borderBottom: '1.5px solid #8b7d3f', minHeight: '24px', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: '11px', fontFamily: 'monospace', color: '#8b7d3f', fontWeight: 500 }}>loop</span>
                    </div>
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px' }}>
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
                          style={{
                            textAlign: 'center',
                            width: '90%',
                            fontSize: 14,
                            color: '#222',
                            fontFamily: 'sans-serif',
                            fontWeight: 400,
                            border: 'none',
                            background: 'transparent',
                            boxShadow: 'none',
                            outline: 'none'
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <div style={{ fontSize: 14, color: '#222', textAlign: 'center', fontFamily: 'sans-serif', fontWeight: 400 }}>{el.name}</div>
                      )}
                    </div>
                  </div>
                ) : isClassType ? (
                  <div className="uml-class-box">
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

          {/* Punctele de control pe conexiuni - draggable */}
          {connections.map((conn) => {
            if (!conn.controlPoints || conn.controlPoints.length === 0) return null;
            
            return conn.controlPoints.map((cp, idx) => {
              const isDragging = draggingControlPoint?.connectionId === conn.id && draggingControlPoint?.pointIndex === idx;
              
              // Ascund punctele de control dacă nu sunt în drag
              if (!isDragging) return null;
              
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
                    transition: 'all 0.2s ease'
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

          {/* Endpoint markers - invisible but draggable with large hit area */}
          {connections.map((conn) => {
            // Get the connection points
            const getEndpointCoords = () => {
              // Check if we have explicit coordinate-based points
              if (conn.fromPoint && typeof conn.fromPoint === 'object' && conn.fromPoint.x !== undefined) {
                return {
                  from: { x: conn.fromPoint.x, y: conn.fromPoint.y },
                  to: { x: conn.toPoint.x, y: conn.toPoint.y }
                };
              }
              return null;
            };
            
            const endpoints = getEndpointCoords();
            if (!endpoints) return null;
            
            const hitSize = 15; // Large hit area for easy dragging
            
            return [
              // Start point - invisible but draggable
              <div
                key={`ep-from-${conn.id}`}
                style={{
                  position: 'absolute',
                  left: `${endpoints.from.x - hitSize}px`,
                  top: `${endpoints.from.y - hitSize}px`,
                  width: `${hitSize * 2}px`,
                  height: `${hitSize * 2}px`,
                  borderRadius: '50%',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'grab',
                  zIndex: 850,
                  pointerEvents: 'auto'
                }}
                title="Drag to move start point"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDraggingEndpoint({
                    connectionId: conn.id,
                    endpointType: 'from',
                    startX: e.clientX,
                    startY: e.clientY
                  });
                  setSelectedConnection(conn.id);
                }}
              />,
              // End point - invisible but draggable
              <div
                key={`ep-to-${conn.id}`}
                style={{
                  position: 'absolute',
                  left: `${endpoints.to.x - hitSize}px`,
                  top: `${endpoints.to.y - hitSize}px`,
                  width: `${hitSize * 2}px`,
                  height: `${hitSize * 2}px`,
                  borderRadius: '50%',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'grab',
                  zIndex: 850,
                  pointerEvents: 'auto'
                }}
                title="Drag to move end point"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDraggingEndpoint({
                    connectionId: conn.id,
                    endpointType: 'to',
                    startX: e.clientX,
                    startY: e.clientY
                  });
                  setSelectedConnection(conn.id);
                }}
              />
            ];
          })}

          {/* Endpoint visual markers disabled - showing in SVG instead */}
          {connectionMode && elements.map((el) => {
            // Nu mai afișez punctele verzi - user-ul va click direct pe contur
            // Detectarea se face în handleElementClick care apelează detectConnectionPointOnContour
            return null;
          })}
        </div>

        {/* Right Panel - Properties */}
        <div className="uml-properties">
          <h3>Properties</h3>
          {selectedElement ? (() => {
            const el = elements.find(e => e.id === selectedElement);
            const isClassType = el && (el.type === 'CLASS' || el.type === 'INTERFACE');
            
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
                
                {/* Atribute pentru clase */}
                {el && el.type === 'CLASS' && (
                  <div className="property-section">
                    <div className="property-section-header">
                      <label>Attributes:</label>
                      <button 
                        className="btn-add"
                        onClick={() => {
                          setElements(elements.map(el => 
                            el.id === selectedElement 
                              ? { ...el, attributes: [...(el.attributes || []), '-newAttr: Type'] }
                              : el
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
                          className="btn-remove"
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
                
                {/* Metode pentru clase */}
                {isClassType && (
                  <div className="property-section">
                    <div className="property-section-header">
                      <label>Methods:</label>
                      <button 
                        className="btn-add"
                        onClick={() => {
                          setElements(elements.map(el => 
                            el.id === selectedElement 
                              ? { ...el, methods: [...(el.methods || []), '+method(): void'] }
                              : el
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
                          className="btn-remove"
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
                  onClick={() => handleDeleteElement(selectedElement)}
                >
                  Delete
                </button>
              </div>
            );
          })() : (
            <p style={{ color: '#999' }}>Click an element to edit</p>
          )}

          <h3 style={{ marginTop: '20px' }}>Connections</h3>
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
                    <small>{conn.label}</small>
                    <button onClick={() => handleDeleteConnection(conn.id)}>×</button>
                  </div>
                );
              })
            )}
          </div>

          <h3 style={{ marginTop: '20px' }}>Diagram Info</h3>
          <div className="diagram-info">
            <p><strong>Type:</strong> {UML_TYPES[selectedType]}</p>
            <p><strong>Elements:</strong> {elements.length}</p>
            <p><strong>Connections:</strong> {connections.length}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UMLEditor;
