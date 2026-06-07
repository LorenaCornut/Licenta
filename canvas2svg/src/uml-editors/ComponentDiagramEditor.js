import React, { useRef, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import '../UMLEditor.css';

// ============ COMPONENT TYPES ============
const COMPONENT_ELEMENTS = {
  COMPONENT: { label: 'Component', icon: '📦', color: '#E8D4F8' },
  ARTIFACT: { label: 'Artifact', icon: '📄', color: '#F8E8D4' },
  PACKAGE: { label: 'Package', icon: '📁', color: '#E8F8D4' },
  DATABASE: { label: 'Database', icon: '🛢️', color: '#FFE8E8' },
  RECTANGLE: { label: 'Rectangle', icon: '▭', color: '#FFF4E6' },
  TEXT_LABEL: { label: 'Text Label', icon: 'T', color: 'transparent' },
  LOLLIPOP_DECORATOR: { label: 'Provided Interface (●)', icon: '●', color: '#FFD700' },
  SOCKET_DECORATOR: { label: 'Required Interface ( ( )', icon: '(', color: '#FFD700' },
  ASSEMBLY_PORT: { label: 'Assembly Port (■)', icon: '■', color: '#C0C0C0' }
};

const CONNECTION_TYPES = {
  ASSOCIATION: { label: 'Association', icon: '─', color: '#333' },
  COMPOSITION: { label: 'Composition', icon: '◆', color: '#333' },
  AGGREGATION: { label: 'Aggregation', icon: '◇', color: '#333' },
  DEPENDENCY: { label: 'Dependency', icon: '⇢', color: '#999' },
  DELEGATION: { label: 'Delegation', icon: '▶', color: '#666' },
  GENERALIZATION: { label: 'Generalization', icon: '△', color: '#333' }
};

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
  }
  
  return { x, y };
}

// ============ ROUTING HELPER FUNCTIONS ============

/**
 * Get bounding box of an element
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
 * Lee/BFS grid-based orthogonal routing for UML edges
 */
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

// ============ END ROUTING HELPERS ============

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
  
  // Fallback to center (for backward compatibility with old connections)
  const w = element.width || 200;
  const h = element.height || 140;
  return { x: element.x + w / 2, y: element.y + h / 2 };
}

function getPointAtOffsetOnEdge(element, edgeType, offset) {
  offset = Math.max(0, Math.min(1, offset || 0.5)); // Clamp 0-1
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
    offset = (closest.x - element.x) / element.width;
  } else {
    offset = (closest.y - element.y) / element.height;
  }
  
  return { edge: closest.edge, offset };
}

function renderComponentElement(ctx, element) {
  ctx.fillStyle = COMPONENT_ELEMENTS[element.type]?.color || '#E8D4F8';
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  
  if (element.type === 'COMPONENT') {
    ctx.fillRect(element.x, element.y, element.width, element.height);
    ctx.strokeRect(element.x, element.y, element.width, element.height);
    
    const iconSize = 20;
    const iconX = element.x + element.width - iconSize - 5;
    const iconY = element.y + 5;
    ctx.fillStyle = '#999';
    ctx.fillRect(iconX, iconY, iconSize, iconSize);
    ctx.fillRect(iconX - 8, iconY + 4, 6, 6);
    ctx.fillRect(iconX - 8, iconY + 12, 6, 6);
    
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('<<component>>', element.x + element.width / 2, element.y + element.height / 2 - 10);
    ctx.font = 'bold 14px Arial';
    ctx.fillText(element.name, element.x + element.width / 2, element.y + element.height / 2 + 8);
    
  } else if (element.type === 'ARTIFACT') {
    ctx.fillRect(element.x, element.y, element.width, element.height);
    ctx.strokeRect(element.x, element.y, element.width, element.height);
    
    const iconSize = 15;
    const iconX = element.x + element.width - iconSize - 5;
    const iconY = element.y + 5;
    ctx.fillStyle = '#999';
    ctx.fillRect(iconX, iconY, iconSize, iconSize);
    ctx.beginPath();
    ctx.moveTo(iconX + iconSize, iconY);
    ctx.lineTo(iconX + iconSize, iconY + 8);
    ctx.lineTo(iconX + 8, iconY + iconSize);
    ctx.stroke();
    
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(element.name, element.x + element.width / 2, element.y + element.height / 2 + 5);
    
  } else if (element.type === 'PACKAGE') {
    const tabHeight = 20;
    const tabWidth = 40;
    
    ctx.fillRect(element.x, element.y, tabWidth, tabHeight);
    ctx.strokeRect(element.x, element.y, tabWidth, tabHeight);
    
    ctx.fillRect(element.x, element.y + tabHeight - 3, element.width, element.height - tabHeight + 3);
    ctx.strokeRect(element.x, element.y + tabHeight - 3, element.width, element.height - tabHeight + 3);
    
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(element.name, element.x + element.width / 2, element.y + tabHeight + 25);
  }
}

function renderConnection(ctx, conn, elements) {
  const fromEl = elements.find(e => e.id === conn.from);
  const toEl = elements.find(e => e.id === conn.to);
  if (!fromEl || !toEl) return;
  
  const fromPoint = getConnectionPointOnElement(fromEl, conn.fromEdge);
  const toPoint = getConnectionPointOnElement(toEl, conn.toEdge);
  
  ctx.strokeStyle = CONNECTION_TYPES[conn.type]?.color || '#666';
  ctx.lineWidth = 2;
  
  if (conn.type === 'DEPENDENCY') {
    ctx.setLineDash([5, 5]);
  } else {
    ctx.setLineDash([]);
  }
  
  ctx.beginPath();
  ctx.moveTo(fromPoint.x, fromPoint.y);
  ctx.lineTo(toPoint.x, toPoint.y);
  ctx.stroke();
  
  if (conn.type === 'DEPENDENCY' || conn.type === 'DELEGATION') {
    const arrowSize = 10;
    const angle = Math.atan2(toPoint.y - fromPoint.y, toPoint.x - fromPoint.x);
    
    ctx.fillStyle = CONNECTION_TYPES[conn.type]?.color || '#666';
    ctx.beginPath();
    ctx.moveTo(toPoint.x, toPoint.y);
    ctx.lineTo(toPoint.x - arrowSize * Math.cos(angle - Math.PI / 6), toPoint.y - arrowSize * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(toPoint.x - arrowSize * Math.cos(angle + Math.PI / 6), toPoint.y - arrowSize * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    
    if (conn.type === 'DELEGATION') {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }
  
  if (conn.label) {
    ctx.fillStyle = '#333';
    ctx.font = '12px Arial';
    const midX = (fromPoint.x + toPoint.x) / 2;
    const midY = (fromPoint.y + toPoint.y) / 2;
    ctx.fillText(conn.label, midX, midY - 10);
  }
  
  ctx.setLineDash([]);
}

const ensureConnectionOffsets = (conns) => {
  return conns.map(conn => ({
    ...conn,
    fromOffset: typeof conn.fromOffset === 'number' ? conn.fromOffset : 0.5,
    toOffset: typeof conn.toOffset === 'number' ? conn.toOffset : 0.5
  }));
};

function escapeXML(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Splits text into lines that fit within maxWidth pixels.
 * Handles explicit \n newlines AND automatic word-wrapping.
 * Returns an array of line strings.
 */
function wrapSVGText(text, maxWidth, fontSize) {
  // Approximate character width: ~0.58 * fontSize for Arial bold
  const charW = fontSize * 0.58;
  const maxChars = Math.max(5, Math.floor(maxWidth / charW));

  const paragraphs = (text || '').split('\n');
  const lines = [];

  paragraphs.forEach(paragraph => {
    if (paragraph.trim() === '') {
      lines.push('');
      return;
    }
    const words = paragraph.split(' ');
    let current = '';
    words.forEach(word => {
      const test = current ? current + ' ' + word : word;
      if (test.length <= maxChars) {
        current = test;
      } else {
        if (current) lines.push(current);
        // If a single word is longer than maxChars, push it anyway
        current = word;
      }
    });
    if (current) lines.push(current);
  });

  return lines;
}

/**
 * Returns SVG <text> elements for wrapped text, vertically centred in a box.
 */
function svgTextBlock(text, cx, cy, maxWidth, fontSize, fontWeight, fill, lineH) {
  const lines = wrapSVGText(text, maxWidth, fontSize);
  const totalH = lines.length * lineH;
  const startY = cy - totalH / 2 + lineH / 2;
  return lines.map((line, i) =>
    `<text x='${cx}' y='${startY + i * lineH}' font-family='Arial' font-size='${fontSize}' font-weight='${fontWeight}' text-anchor='middle' dominant-baseline='middle' fill='${fill}'>${escapeXML(line)}</text>`
  ).join('\n');
}

function generateFullSVG(elements, connections, title) {
  let svg = '';
  
  const width = 1200;
  const height = 800;
  
  svg += `<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n`;
  svg += `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">\n`;
  svg += `<defs>`;
  svg += `<marker id='markerComposition' markerWidth='16' markerHeight='16' refX='15' refY='8' orient='auto' markerUnits='strokeWidth'><polygon points='16,8 8,0 0,8 8,16' fill='#333' stroke='#333' stroke-width='0.5'/></marker>`;
  svg += `<marker id='markerCompositionStart' markerWidth='16' markerHeight='16' refX='1' refY='8' orient='auto' markerUnits='strokeWidth'><polygon points='0,8 8,0 16,8 8,16' fill='#333' stroke='#333' stroke-width='0.5'/></marker>`;
  svg += `<marker id='markerAggregation' markerWidth='16' markerHeight='16' refX='15' refY='8' orient='auto' markerUnits='strokeWidth'><polygon points='16,8 8,0 0,8 8,16' fill='white' stroke='#333' stroke-width='1'/></marker>`;
  svg += `<marker id='markerAggregationStart' markerWidth='16' markerHeight='16' refX='1' refY='8' orient='auto' markerUnits='strokeWidth'><polygon points='0,8 8,0 16,8 8,16' fill='white' stroke='#333' stroke-width='1'/></marker>`;
  svg += `<marker id='arrowDependency' markerWidth='16' markerHeight='16' refX='15' refY='8' orient='auto' markerUnits='strokeWidth'><path d='M0,0 L16,8 L0,16' fill='none' stroke='#333' stroke-width='2' stroke-linejoin='miter'/></marker>`;
  svg += `<marker id='arrowDelegation' markerWidth='16' markerHeight='16' refX='15' refY='8' orient='auto' markerUnits='strokeWidth'><path d='M0,0 L16,8 L0,16 Z' fill='#333' stroke='#333' stroke-width='0.5'/></marker>`;
  svg += `<marker id='markerGeneralization' markerWidth='16' markerHeight='16' refX='15' refY='8' orient='auto' markerUnits='strokeWidth'><polygon points='16,8 0,0 0,16' fill='white' stroke='#333' stroke-width='1.5'/></marker>`;
  svg += `</defs>\n`;
  svg += `<rect width='${width}' height='${height}' fill='white' stroke='#ccc' stroke-width='1'/>\n`;
  
  for (const conn of connections) {
    const fromEl = elements.find(e => e.id === conn.from);
    const toEl = elements.find(e => e.id === conn.to);
    if (!fromEl || !toEl) continue;
    
    const fromPoint = getPointAtOffsetOnEdge(fromEl, conn.fromEdge, conn.fromOffset);
    const toPoint = getPointAtOffsetOnEdge(toEl, conn.toEdge, conn.toOffset);
    
    // Build waypoints and create orthogonal path
    const waypoints = [
      fromPoint,
      ...(conn.controlPoints || conn.waypoints || []),
      toPoint
    ];
    const pathD = buildOrthogonalPathThroughWaypoints(waypoints);
    
    const strokeDash = conn.type === 'DEPENDENCY' ? '5,5' : 'none';
    const markerStart = 
      conn.type === 'COMPOSITION' ? `marker-start='url(#markerCompositionStart)'` :
      conn.type === 'AGGREGATION' ? `marker-start='url(#markerAggregationStart)'` : '';
    const markerEnd = 
      conn.type === 'ASSOCIATION' ? '' :
      conn.type === 'COMPOSITION' ? '' :
      conn.type === 'AGGREGATION' ? '' :
      conn.type === 'DEPENDENCY' ? `marker-end='url(#arrowDependency)'` :
      conn.type === 'DELEGATION' ? `marker-end='url(#arrowDelegation)'` :
      conn.type === 'GENERALIZATION' ? `marker-end='url(#markerGeneralization)'` : '';
    svg += `<path d='${pathD}' stroke='#333' stroke-width='2' stroke-dasharray='${strokeDash}' fill='none' ${markerStart} ${markerEnd} />\n`;
    
    if (conn.label) {
      const midX = (fromPoint.x + toPoint.x) / 2;
      const midY = (fromPoint.y + toPoint.y) / 2;
      svg += `<text x='${midX}' y='${midY - 5}' font-family='Arial' font-size='12' fill='#333'>${escapeXML(conn.label)}</text>\n`;
    }
  }
  
  for (const el of elements) {
    if (el.type === 'COMPONENT') {
      const clipId = `clip-comp-${el.id}`;
      svg += `<clipPath id='${clipId}'><rect x='${el.x + 4}' y='${el.y + 4}' width='${el.width - 8}' height='${el.height - 8}'/></clipPath>\n`;
      svg += `<rect x='${el.x}' y='${el.y}' width='${el.width}' height='${el.height}' fill='#E8D4F8' stroke='#333' stroke-width='2' />\n`;
      const iconX = el.x + el.width - 25;
      const iconY = el.y + 5;
      svg += `<rect x='${iconX}' y='${iconY}' width='20' height='20' fill='#ccc' stroke='#333' stroke-width='1.5' />\n`;
      svg += `<rect x='${iconX - 8}' y='${iconY + 4}' width='5' height='5' fill='#333' stroke='#333' stroke-width='0.5' />\n`;
      svg += `<rect x='${iconX - 8}' y='${iconY + 12}' width='5' height='5' fill='#333' stroke='#333' stroke-width='0.5' />\n`;
      svg += `<text x='${el.x + el.width / 2}' y='${el.y + el.height / 2 - 10}' font-family='Arial' font-size='10' font-style='italic' text-anchor='middle' fill='#666'>&lt;&lt;component&gt;&gt;</text>\n`;
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2 + 8;
      svg += `<g clip-path='url(#${clipId})'>\n`;
      svg += svgTextBlock(el.name, cx, cy, el.width - 16, 12, 'bold', '#333', 16);
      svg += `\n</g>\n`;
    } else if (el.type === 'ARTIFACT') {
      const clipId = `clip-art-${el.id}`;
      svg += `<clipPath id='${clipId}'><rect x='${el.x + 4}' y='${el.y + 4}' width='${el.width - 8}' height='${el.height - 8}'/></clipPath>\n`;
      svg += `<rect x='${el.x}' y='${el.y}' width='${el.width}' height='${el.height}' fill='#F8E8D4' stroke='#333' stroke-width='2' />\n`;
      svg += `<text x='${el.x + el.width / 2}' y='${el.y + el.height / 2 - 10}' font-family='Arial' font-size='10' font-style='italic' text-anchor='middle' fill='#666'>&lt;&lt;artifact&gt;&gt;</text>\n`;
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2 + 8;
      svg += `<g clip-path='url(#${clipId})'>\n`;
      svg += svgTextBlock(el.name, cx, cy, el.width - 16, 12, 'bold', '#333', 16);
      svg += `\n</g>\n`;
    } else if (el.type === 'PACKAGE') {
      svg += `<rect x='${el.x}' y='${el.y}' width='40' height='20' fill='#E8F8D4' stroke='#333' stroke-width='2' />\n`;
      svg += `<rect x='${el.x}' y='${el.y + 17}' width='${el.width}' height='${el.height - 17}' fill='#E8F8D4' stroke='#333' stroke-width='2' />\n`;
      svg += `<text x='${el.x + 20}' y='${el.y + 14}' font-family='Arial' font-size='10' font-weight='bold' text-anchor='middle' fill='#333'>&#128193;</text>\n`;
      svg += svgTextBlock(el.name, el.x + el.width / 2, el.y + el.height / 2 + 12, el.width - 16, 12, 'bold', '#333', 16) + '\n';
    } else if (el.type === 'DATABASE') {
      const rx = el.width / 2 - 2;
      const ry = Math.min(25, el.height * 0.15);
      const topY = ry + 2;
      const bottomCenterY = el.height - ry - 2;
      svg += `<g transform='translate(${el.x}, ${el.y})'>\n`;
      svg += `<path d='M 2,${topY} L 2,${bottomCenterY} A ${rx},${ry} 0 0 0 ${el.width - 2},${bottomCenterY} L ${el.width - 2},${topY} Z' fill='#FFE8E8' stroke='#333' stroke-width='2' />\n`;
      svg += `<ellipse cx='${el.width / 2}' cy='${topY}' rx='${rx}' ry='${ry}' fill='#FFD2D2' stroke='#333' stroke-width='2' />\n`;
      const textCY = topY + (bottomCenterY - topY) / 2;
      svg += svgTextBlock(el.name, el.width / 2, textCY, el.width - 16, 12, 'bold', '#333', 16) + '\n';
      svg += `</g>\n`;
    } else if (el.type === 'LOLLIPOP_DECORATOR') {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const r = Math.min(el.width, el.height) / 2 - 2;
      svg += `<circle cx='${cx}' cy='${cy}' r='${r}' fill='#333' stroke='#333' stroke-width='1' />\n`;
    } else if (el.type === 'SOCKET_DECORATOR') {
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      const rotation = el.rotation || 0;
      svg += `<g transform='translate(${cx}, ${cy}) rotate(${rotation}) translate(${-cx}, ${-cy})'>\n`;
      svg += `<text x='${cx}' y='${cy + 6}' text-anchor='middle' font-size='28' fill='#333' font-weight='bold' font-family='Arial'>(</text>\n`;
      svg += `</g>\n`;
    } else if (el.type === 'ASSEMBLY_PORT') {
      svg += `<rect x='${el.x + 2}' y='${el.y + 2}' width='${el.width - 4}' height='${el.height - 4}' fill='#333' stroke='#333' stroke-width='1' />\n`;
    } else if (el.type === 'RECTANGLE') {
      const clipId = `clip-rect-${el.id}`;
      svg += `<clipPath id='${clipId}'><rect x='${el.x + 4}' y='${el.y + 4}' width='${el.width - 8}' height='${el.height - 8}'/></clipPath>\n`;
      svg += `<rect x='${el.x}' y='${el.y}' width='${el.width}' height='${el.height}' fill='#FFF4E6' stroke='#333' stroke-width='2' rx='2' />\n`;
      const cx = el.x + el.width / 2;
      const cy = el.y + el.height / 2;
      svg += `<g clip-path='url(#${clipId})'>\n`;
      svg += svgTextBlock(el.name, cx, cy, el.width - 20, 13, 'bold', '#4a2c0a', 18);
      svg += `\n</g>\n`;
    } else if (el.type === 'TEXT_LABEL') {
      // Multi-line text label, left-aligned, no box
      const lines = wrapSVGText(el.name || '', el.width || 200, el.fontSize || 14);
      const lh = (el.fontSize || 14) * 1.4;
      lines.forEach((line, i) => {
        svg += `<text x='${el.x}' y='${el.y + (el.fontSize || 14) + i * lh}' font-family='Arial' font-size='${el.fontSize || 14}' fill='#333' font-weight='${el.fontWeight || 'normal'}'>${escapeXML(line)}</text>\n`;
      });
    }
  }
  
  svg += `</svg>`;
  return svg;
}

export default function ComponentDiagramEditor() {
  const { diagramId } = useParams();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [elements, setElements] = useState([]);
  const [connections, setConnections] = useState([]);
  const [title, setTitle] = useState('Component Diagram');
  const [currentDiagramId, setCurrentDiagramId] = useState(null);
  const [selectedElement, setSelectedElement] = useState(null);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [connectionMode, setConnectionMode] = useState(null);
  const [connectionStart, setConnectionStart] = useState(null);
  const [draggedType, setDraggedType] = useState(null);
  const [draggingInCanvas, setDraggingInCanvas] = useState(false);
  const [editingElement, setEditingElement] = useState(null);
  const [editName, setEditName] = useState('');
  const [draggingEndpoint, setDraggingEndpoint] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [draggingElement, setDraggingElement] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [dragOffset, setDragOffset] = useState({x: 0, y: 0});
  const [draggingWaypoint, setDraggingWaypoint] = useState(null); // {connectionId, idx}

  const loadDiagram = async (id) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/class-diagrams/${id}`);
      const result = await response.json();
      console.log('Loaded diagram:', result);
      
      if (result.diagram?.data) {
        setTitle(result.diagram.title || 'Component Diagram');
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

  useEffect(() => {
    if (diagramId && diagramId !== 'new') {
      loadDiagram(diagramId);
    } else if (diagramId === 'new') {
      setCurrentDiagramId(null);
      sessionStorage.removeItem('currentDiagramId');
      setElements([]);
      setConnections([]);
      setTitle('Component Diagram');
      setSelectedElement(null);
      setSelectedConnection(null);
    }
  }, [diagramId]);

  useEffect(() => {
    if (!canvasRef.current) return;
    // Canvas removed - using HTML rendering instead
  }, [elements, connections, selectedElement, selectedConnection]);

  // Handle dragging waypoints
  useEffect(() => {
    if (!draggingWaypoint) return;
    const handleMove = (e) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const newX = e.clientX - rect.left;
      const newY = e.clientY - rect.top;
      
      setConnections(connections => connections.map(c => {
        if (c.id !== draggingWaypoint.connectionId) return c;
        const newWps = Array.isArray(c.controlPoints) ? [...c.controlPoints] : (c.waypoints ? [...c.waypoints] : []);
        newWps[draggingWaypoint.idx] = { x: newX, y: newY };
        return { ...c, controlPoints: newWps, waypoints: undefined };
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
  }, [draggingWaypoint, connections]);

  useEffect(() => {
    if (!draggingElement && !resizing) return;

    const handleMouseMove = (e) => {
      if (!canvasRef.current) return;

      if (draggingElement) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const newX = Math.max(0, e.clientX - canvasRect.left - dragOffset.x);
        const newY = Math.max(0, e.clientY - canvasRect.top - dragOffset.y);
        setElements(elements.map(el => 
          el.id === draggingElement ? { ...el, x: newX, y: newY } : el
        ));
      }

      if (resizing) {
        const { elementId, direction, startX, startY, startWidth, startHeight, startElX, startElY } = resizing;
        const element = elements.find(el => el.id === elementId);
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        // Set minimum dimensions based on element type
        let minWidth = 20;
        let minHeight = 20;
        if (element && ['COMPONENT', 'ARTIFACT', 'PACKAGE', 'DATABASE'].includes(element.type)) {
          minWidth = 120;
          minHeight = 80;
        }

        let newWidth = startWidth;
        let newHeight = startHeight;
        let newX = startElX;
        let newY = startElY;

        if (direction.includes('e')) newWidth = Math.max(minWidth, startWidth + deltaX);
        if (direction.includes('w')) {
          newWidth = Math.max(minWidth, startWidth - deltaX);
          newX = startElX + (startWidth - newWidth);
        }
        if (direction.includes('s')) newHeight = Math.max(minHeight, startHeight + deltaY);
        if (direction.includes('n')) {
          newHeight = Math.max(minHeight, startHeight - deltaY);
          newY = startElY + (startHeight - newHeight);
        }

        setElements(elements.map(el => 
          el.id === elementId ? { ...el, width: newWidth, height: newHeight, x: newX, y: newY } : el
        ));
      }
    };

    const handleMouseUp = () => {
      setDraggingElement(null);
      setResizing(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingElement, resizing, dragOffset, elements]);

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
        const newConnection = {
          id: Date.now(),
          type: connectionMode,
          from: connectionStart.elementId,
          fromEdge: connectionStart.point.point,
          fromOffset: 0.5,
          to: el.id,
          toEdge: clickedPoint.point,
          toOffset: 0.5,
          label: '',
          waypoints: []
        };
        
        setConnections([...connections, newConnection]);
        setConnectionMode(null);
        setConnectionStart(null);
      } else {
        setConnectionStart(null);
      }
      return;
    }
    
    setSelectedElement(el.id);
    setSelectedConnection(null);
  };

  const handleConnectionClick = (connId) => {
    setSelectedConnection(connId);
    setSelectedElement(null);
  };

  // Returnează waypoints cu rutare automată de evitare a obstacolelor
  function getConnectionWaypoints(connection) {
    const fromEl = elements.find(el => el.id === connection.from);
    const toEl = elements.find(el => el.id === connection.to);
    if (!fromEl || !toEl) return [];
    
    const fromPt = getPointAtOffsetOnEdge(fromEl, connection.fromEdge || 'right', connection.fromOffset);
    const toPt = getPointAtOffsetOnEdge(toEl, connection.toEdge || 'left', connection.toOffset);
    const userWps = Array.isArray(connection.controlPoints) ? connection.controlPoints : (connection.waypoints || []);
    
    // Dacă nu există puncte intermediare utilizator, folosește rutarea completă
    if (userWps.length === 0) {
      return findPathAroundObstacles(
        fromPt.x, fromPt.y, toPt.x, toPt.y,
        elements, [connection.from, connection.to], connection.toEdge || 'left'
      );
    }
    
    // Altfel, rutează fiecare segment între puncte fixe
    const allPoints = [fromPt, ...userWps, toPt];
    let result = [allPoints[0]];
    for (let i = 0; i < allPoints.length - 1; i++) {
      const seg = findPathAroundObstacles(
        allPoints[i].x, allPoints[i].y, allPoints[i+1].x, allPoints[i+1].y,
        elements, [connection.from, connection.to],
        (i === allPoints.length - 2) ? (connection.toEdge || 'left') : null
      );
      result = result.concat(seg.slice(1));
    }
    return result;
  }

  // Adaugă punct intermediar pe muchie la dublu-click
  const handleEdgeDoubleClick = (e, connection) => {
    if (!connection) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const fromEl = elements.find(el => el.id === connection.from);
    const toEl = elements.find(el => el.id === connection.to);
    if (!fromEl || !toEl) return;
    
    const fromPt = getPointAtOffsetOnEdge(fromEl, connection.fromEdge || 'right', connection.fromOffset);
    const toPt = getPointAtOffsetOnEdge(toEl, connection.toEdge || 'left', connection.toOffset);
    const userWps = Array.isArray(connection.controlPoints) ? connection.controlPoints : (connection.waypoints || []);
    
    // Construiește segmente din waypoints: start -> pct1 -> pct2 -> ... -> end
    const segmentPoints = [fromPt, ...userWps, toPt];
    let minDist = Infinity, insertIdx = 0, bestProj = { x, y };
    
    for (let i = 0; i < segmentPoints.length - 1; i++) {
      const { dist, projX, projY } = distanceToSegment(x, y, segmentPoints[i].x, segmentPoints[i].y, segmentPoints[i+1].x, segmentPoints[i+1].y);
      if (dist < minDist) {
        minDist = dist;
        insertIdx = i;
        bestProj = { x: projX, y: projY };
      }
    }
    
    // Adaugă punctul la poziția corectă în user waypoints
    const newConnections = connections.map(c => {
      if (c.id !== connection.id) return c;
      const newWps = Array.isArray(c.controlPoints) ? [...c.controlPoints] : (c.waypoints ? [...c.waypoints] : []);
      newWps.splice(insertIdx, 0, bestProj);
      return { ...c, controlPoints: newWps, waypoints: undefined };
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
      const newWps = Array.isArray(c.controlPoints) ? [...c.controlPoints] : (c.waypoints ? [...c.waypoints] : []);
      newWps.splice(idx, 1);
      return { ...c, controlPoints: newWps, waypoints: undefined };
    }));
  };

  const handleConnectionLabelChange = (connId, newLabel) => {
    setConnections(connections.map(c => c.id === connId ? { ...c, label: newLabel } : c));
  };

  const handleDeleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    setConnections(connections.filter(c => c.from !== id && c.to !== id));
    setSelectedElement(null);
  };

  const handleRotateElement = (id) => {
    setElements(elements.map(el => 
      el.id === id ? { ...el, rotation: ((el.rotation || 0) + 90) % 360 } : el
    ));
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

  const handleElementDoubleClick = (e, el) => {
    e.stopPropagation();
    setEditingElement(el.id);
    setEditName(el.name);
  };

  const handleResizeMouseDown = (e, elementId, direction) => {
    e.stopPropagation();
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

  const handleCanvasDragLeave = () => {
    setDraggingInCanvas(false);
  };

  const handleCanvasDrop = (e) => {
    e.preventDefault();
    setDraggingInCanvas(false);

    if (!draggedType || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Determine size based on element type
    let width = 150;
    let height = 120;
    let offsetX = 75;
    let offsetY = 60;

    if (['LOLLIPOP_DECORATOR', 'SOCKET_DECORATOR', 'ASSEMBLY_PORT'].includes(draggedType)) {
      width = 32;
      height = 32;
      offsetX = 16;
      offsetY = 16;
    } else if (draggedType === 'RECTANGLE') {
      width = 200;
      height = 100;
      offsetX = 100;
      offsetY = 50;
    } else if (draggedType === 'TEXT_LABEL') {
      width = 160;
      height = 30;
      offsetX = 80;
      offsetY = 15;
    }

    const newElement = {
      id: Date.now(),
      type: draggedType,
      x: Math.max(10, x - offsetX),
      y: Math.max(10, y - offsetY),
      width,
      height,
      name: `${draggedType.split('_').join(' ')} ${elements.length + 1}`
    };

    setElements([...elements, newElement]);
    setDraggedType(null);
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
  }, [draggingEndpoint, connections, elements, canvasRef]);

  const handleSaveToDatabase = async () => {
    const activeDiagramId = currentDiagramId || sessionStorage.getItem('currentDiagramId');
    const diagramTitle = activeDiagramId 
      ? title 
      : prompt('Enter diagram name:', title || 'Component Diagram');
    
    if (!diagramTitle) return;

    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        alert('You must be logged in to save!');
        return;
      }

      const connectionsToSave = ensureConnectionOffsets(connections);

      const diagramData = {
        diagram: {
          selectedType: 'COMPONENT',
          elements: elements,
          connections: connectionsToSave
        }
      };

      let response, result, method, url;
      
      if (activeDiagramId) {
        // UPDATE existing diagram
        method = 'PUT';
        url = `/api/class-diagrams/${activeDiagramId}`;
        response = await fetch(url, {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(diagramData)
        });
        result = await response.json();
        
        if (response.ok) {
          alert(`Diagram "${diagramTitle}" updated successfully!`);
          setTitle(diagramTitle);
        }
      } else {
        // CREATE new diagram
        method = 'POST';
        url = '/api/class-diagrams';
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
          alert(`Diagram "${diagramTitle}" saved successfully! ID: ${result.diagramId}`);
          setCurrentDiagramId(result.diagramId);
          sessionStorage.setItem('currentDiagramId', result.diagramId);
          setTitle(diagramTitle);
        }
      }

      if (!response.ok) {
        alert(`Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error saving to database:', error);
      alert(`Save error: ${error.message}`);
    }
  };

  const handleExportSVG = () => {
    const svg = generateFullSVG(elements, connections, title);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title}.svg`;
    a.click();
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
          setCurrentDiagramId(null);
          sessionStorage.removeItem('currentDiagramId');
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

  return (
    <div className="uml-editor" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="uml-header" style={{ position: 'relative', zIndex: 999, flexShrink: 0 }}>
        <button className="btn-back" onClick={() => window.history.back()}>← Back</button>
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
          <button className="btn-secondary" onClick={handleImportJSON}>Import</button>
        </div>
      </div>

      <div className="uml-container" style={{ flex: 1, minHeight: 0 }}>
        <div className="uml-sidebar">
          <h3>Elements</h3>
          <div className="diagram-types">
            {Object.entries(COMPONENT_ELEMENTS).map(([key, value]) => (
              <div
                key={key}
                className="element-item"
                draggable
                onDragStart={(e) => handleDragStart(e, key)}
                style={{ backgroundColor: value.color }}
              >
                <span className="element-icon">{value.icon}</span>
                <span className="element-label">{value.label}</span>
              </div>
            ))}

            {Object.entries(CONNECTION_TYPES).map(([key, value]) => (
              <div
                key={key}
                className="element-item connection-type"
                onClick={() => setConnectionMode(connectionMode === key ? null : key)}
              >
                <span className="element-icon">{value.icon}</span>
                <span className="element-label">{value.label}</span>
                <span className="connection-hint">click</span>
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
          className="uml-canvas"
          style={{
            position: 'relative',
            flex: 1,
            background: '#fafaf9',
            backgroundImage: 
              'linear-gradient(0deg, transparent 24%, rgba(198, 124, 237, 0.04) 25%, rgba(198, 124, 237, 0.04) 26%, transparent 27%, transparent 74%, rgba(198, 124, 237, 0.04) 75%, rgba(198, 124, 237, 0.04) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(198, 124, 237, 0.04) 25%, rgba(198, 124, 237, 0.04) 26%, transparent 27%, transparent 74%, rgba(198, 124, 237, 0.04) 75%, rgba(198, 124, 237, 0.04) 76%, transparent 77%, transparent)',
            backgroundSize: '30px 30px',
            overflow: 'auto'
          }}
          onDragOver={handleCanvasDragOver}
          onDragLeave={handleCanvasDragLeave}
          onDrop={handleCanvasDrop}
          onClick={() => setSelectedElement(null)}
        >
          {/* SVG for connections */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'auto', zIndex: 1 }}>
            <defs>
              {/* ASSOCIATION: No marker */}
              {/* COMPOSITION: Filled diamond */}
              <marker id="markerComposition" markerWidth="16" markerHeight="16" refX="15" refY="8" orient="auto" markerUnits="strokeWidth">
                <polygon points="16,8 8,0 0,8 8,16" fill="#333" stroke="#333" strokeWidth="0.5"/>
              </marker>
              <marker id="markerCompositionStart" markerWidth="16" markerHeight="16" refX="1" refY="8" orient="auto" markerUnits="strokeWidth">
                <polygon points="0,8 8,0 16,8 8,16" fill="#333" stroke="#333" strokeWidth="0.5"/>
              </marker>
              {/* AGGREGATION: Empty diamond */}
              <marker id="markerAggregation" markerWidth="16" markerHeight="16" refX="15" refY="8" orient="auto" markerUnits="strokeWidth">
                <polygon points="16,8 8,0 0,8 8,16" fill="white" stroke="#333" strokeWidth="1"/>
              </marker>
              <marker id="markerAggregationStart" markerWidth="16" markerHeight="16" refX="1" refY="8" orient="auto" markerUnits="strokeWidth">
                <polygon points="0,8 8,0 16,8 8,16" fill="white" stroke="#333" strokeWidth="1"/>
              </marker>
              {/* DEPENDENCY: Open arrow */}
              <marker id="arrowDependency" markerWidth="16" markerHeight="16" refX="15" refY="8" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L16,8 L0,16" fill="none" stroke="#333" strokeWidth="2" strokeLinejoin="miter"/>
              </marker>
              {/* DELEGATION: Filled arrow */}
              <marker id="arrowDelegation" markerWidth="16" markerHeight="16" refX="15" refY="8" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L16,8 L0,16 Z" fill="#333" stroke="#333" strokeWidth="0.5"/>
              </marker>
              {/* GENERALIZATION: Triangle */}
              <marker id="markerGeneralization" markerWidth="16" markerHeight="16" refX="15" refY="8" orient="auto" markerUnits="strokeWidth">
                <polygon points="16,8 0,0 0,16" fill="white" stroke="#333" strokeWidth="1.5"/>
              </marker>
            </defs>

            {connections.map((conn) => {
              const fromEl = elements.find(e => e.id === conn.from);
              const toEl = elements.find(e => e.id === conn.to);
              if (!fromEl || !toEl) return null;

              const fromPoint = getPointAtOffsetOnEdge(fromEl, conn.fromEdge || 'right', conn.fromOffset);
              const toPoint = getPointAtOffsetOnEdge(toEl, conn.toEdge || 'left', conn.toOffset);
              const isSelected = selectedConnection === conn.id;
              
              // Build waypoints including start and end
              const waypoints = [
                fromPoint,
                ...(conn.controlPoints || conn.waypoints || []),
                toPoint
              ];
              
              const pathD = buildOrthogonalPathThroughWaypoints(waypoints);

              return (
                <g key={conn.id} onClick={(e) => { e.stopPropagation(); handleConnectionClick(conn.id); }} style={{ cursor: 'pointer' }}>
                  {/* Invisible path for better hit detection */}
                  <path
                    d={pathD}
                    stroke="transparent"
                    strokeWidth={8}
                    fill="none"
                    pointerEvents="auto"
                    onDoubleClick={(e) => handleEdgeDoubleClick(e, conn)}
                  />
                  {/* Visible path */}
                  <path
                    d={pathD}
                    stroke={isSelected ? '#f00' : '#333'}
                    strokeWidth={isSelected ? 3 : 2}
                    strokeDasharray={conn.type === 'DEPENDENCY' ? '5,5' : 'none'}
                    fill="none"
                    pointerEvents="none"
                    markerStart={
                      conn.type === 'COMPOSITION' ? 'url(#markerCompositionStart)' :
                      conn.type === 'AGGREGATION' ? 'url(#markerAggregationStart)' : 'none'
                    }
                    markerEnd={
                      conn.type === 'ASSOCIATION' ? 'none' :
                      conn.type === 'COMPOSITION' ? 'none' :
                      conn.type === 'AGGREGATION' ? 'none' :
                      conn.type === 'DEPENDENCY' ? 'url(#arrowDependency)' :
                      conn.type === 'DELEGATION' ? 'url(#arrowDelegation)' :
                      conn.type === 'GENERALIZATION' ? 'url(#markerGeneralization)' : 'none'
                    }
                  />
                  {conn.label && (
                    <text
                      x={(fromPoint.x + toPoint.x) / 2}
                      y={(fromPoint.y + toPoint.y) / 2 - 5}
                      textAnchor="middle"
                      fontSize="12"
                      fill="#333"
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {conn.label}
                    </text>
                  )}
                  {/* Waypoint circles */}
                  {Array.isArray(conn.controlPoints) && conn.controlPoints.map((wp, idx) => (
                    <circle
                      key={`wp-${idx}`}
                      cx={wp.x}
                      cy={wp.y}
                      r={7}
                      fill="#fff"
                      stroke="#9168b7"
                      strokeWidth={2}
                      onMouseDown={e => handleWaypointMouseDown(e, conn.id, idx)}
                      onClick={e => handleWaypointClick(e, conn.id, idx)}
                      onDoubleClick={(e) => handleEdgeDoubleClick(e, conn)}
                      style={{ cursor: 'pointer' }}
                      title="Drag to move, Alt+click to delete"
                    />
                  ))}
                  
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
          </svg>

          {/* Elements as HTML divs */}
          {elements.map((el) => {
            const isSelected = selectedElement === el.id;
            const isEditing = editingElement === el.id;
            const isDragging = draggingElement === el.id;

            // Render different shapes based on element type
            let renderElement = null;

            if (el.type === 'COMPONENT') {
              renderElement = (
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                  {/* Component icon (top-right) - rectangle with 2 squares on left */}
                  <svg style={{ position: 'absolute', top: '4px', right: '4px', width: '20px', height: '16px', pointerEvents: 'none' }}>
                    {/* Main rectangle */}
                    <rect x="4" y="2" width="14" height="12" fill="none" stroke="#333" strokeWidth="1.5"/>
                    {/* Top left square */}
                    <rect x="0" y="2" width="3" height="4" fill="#333" stroke="#333" strokeWidth="1"/>
                    {/* Bottom left square */}
                    <rect x="0" y="10" width="3" height="4" fill="#333" stroke="#333" strokeWidth="1"/>
                  </svg>
                  {!isEditing && <span style={{ fontSize: '10px', fontStyle: 'italic', color: '#666' }}>{'<<component>>'}</span>}
                  {!isEditing && <span style={{ fontWeight: 'bold' }}>{el.name}</span>}
                </div>
              );

            } else if (el.type === 'LOLLIPOP_DECORATOR') {
              renderElement = (
                <svg style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
                  <circle cx={el.width / 2} cy={el.height / 2} r={Math.min(el.width, el.height) / 2 - 2} fill="#333" stroke="#333" strokeWidth="1"/>
                </svg>
              );
            } else if (el.type === 'SOCKET_DECORATOR') {
              const rotation = el.rotation || 0;
              renderElement = (
                <svg style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
                  <g transform={`translate(${el.width / 2}, ${el.height / 2}) rotate(${rotation}) translate(${-el.width / 2}, ${-el.height / 2})`}>
                    <text x={el.width / 2} y={el.height / 2 + 6} textAnchor="middle" fontSize="28" fill="#333" fontWeight="bold" fontFamily="Arial">(</text>
                  </g>
                </svg>
              );
            } else if (el.type === 'ASSEMBLY_PORT') {
              renderElement = (
                <svg style={{ width: '100%', height: '100%', pointerEvents: 'none' }}>
                  <rect x="2" y="2" width={el.width - 4} height={el.height - 4} fill="#333" stroke="#333" strokeWidth="1"/>
                </svg>
              );
            } else if (el.type === 'DATABASE') {
              const rx = el.width / 2 - 2;
              const ry = Math.min(25, el.height * 0.15);
              const topY = ry + 2;
              const bottomCenterY = el.height - ry - 2;
              
              renderElement = (
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    <path
                      d={`M 2,${topY} L 2,${bottomCenterY} A ${rx},${ry} 0 0 0 ${el.width - 2},${bottomCenterY} L ${el.width - 2},${topY} Z`}
                      fill="#FFE8E8"
                      stroke="#333"
                      strokeWidth="2"
                    />
                    <ellipse
                      cx={el.width / 2}
                      cy={topY}
                      rx={rx}
                      ry={ry}
                      fill="#FFD2D2"
                      stroke="#333"
                      strokeWidth="2"
                    />
                  </svg>
                  {!isEditing && (
                    <span style={{ 
                      position: 'relative', 
                      zIndex: 2, 
                      fontWeight: 'bold', 
                      color: '#333',
                      fontSize: '13px',
                      paddingTop: `${ry}px`
                    }}>
                      {el.name}
                    </span>
                  )}
                </div>
              );
            } else if (el.type === 'RECTANGLE') {
              renderElement = (
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                    <rect x="0" y="0" width="100%" height="100%" fill="#FFF4E6" stroke="#333" strokeWidth="2" rx="2" />
                  </svg>
                  {!isEditing && (
                    <span style={{
                      position: 'relative',
                      zIndex: 2,
                      fontWeight: 'bold',
                      color: '#4a2c0a',
                      fontSize: '13px',
                      textAlign: 'center',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      padding: '8px 12px',
                      lineHeight: 1.5
                    }}>
                      {el.name}
                    </span>
                  )}
                </div>
              );
            } else if (el.type === 'TEXT_LABEL') {
              renderElement = !isEditing && (
                <span style={{
                  fontSize: `${el.fontSize || 14}px`,
                  fontWeight: el.fontWeight || 'normal',
                  color: '#333',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  width: '100%',
                  textAlign: 'left',
                  lineHeight: 1.4,
                  padding: '2px 4px'
                }}>
                  {el.name}
                </span>
              );
            } else {
              // Default rendering
              renderElement = !isEditing && <span>{el.name}</span>;
            }

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
                  border: ['LOLLIPOP_DECORATOR', 'SOCKET_DECORATOR', 'ASSEMBLY_PORT', 'DATABASE', 'RECTANGLE', 'TEXT_LABEL'].includes(el.type) 
                    ? (isSelected ? '1px dashed #ec4899' : 'none') 
                    : `${isSelected ? 3 : 2}px solid #333`,
                  borderRadius: el.type === 'PACKAGE' ? '8px' : '4px',
                  display: 'flex',
                  alignItems: el.type === 'TEXT_LABEL' ? 'flex-start' : 'center',
                  justifyContent: el.type === 'TEXT_LABEL' ? 'flex-start' : 'center',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#333',
                  textAlign: 'left',
                  overflow: 'visible',
                  padding: ['LOLLIPOP_DECORATOR', 'SOCKET_DECORATOR', 'ASSEMBLY_PORT', 'DATABASE'].includes(el.type) ? '0px' : (el.type === 'PACKAGE' ? '0px' : '4px'),
                  boxSizing: 'border-box',
                  zIndex: isSelected ? 1000 : 100
                }}
              >
                {isEditing ? (
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={handleSaveName}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                      if (e.key === 'Escape') setEditingElement(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      width: '90%',
                      border: 'none',
                      background: '#fffacd',
                      textAlign: 'center',
                      fontWeight: '600',
                      fontSize: '12px',
                      color: '#333',
                      fontFamily: 'inherit',
                      padding: '4px'
                    }}
                  />
                ) : (
                  renderElement
                )}

                {/* Resize handles */}
                {isSelected && !isDragging && (
                  <>
                    <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'n')} style={{ position: 'absolute', top: '-3px', left: '50%', transform: 'translateX(-50%)', width: '30px', height: '6px', cursor: 'ns-resize', backgroundColor: 'rgba(236, 72, 153, 0.5)', borderRadius: '2px' }} />
                    <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 's')} style={{ position: 'absolute', bottom: '-3px', left: '50%', transform: 'translateX(-50%)', width: '30px', height: '6px', cursor: 'ns-resize', backgroundColor: 'rgba(236, 72, 153, 0.5)', borderRadius: '2px' }} />
                    <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'w')} style={{ position: 'absolute', left: '-3px', top: '50%', transform: 'translateY(-50%)', width: '6px', height: '30px', cursor: 'ew-resize', backgroundColor: 'rgba(236, 72, 153, 0.5)', borderRadius: '2px' }} />
                    <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'e')} style={{ position: 'absolute', right: '-3px', top: '50%', transform: 'translateY(-50%)', width: '6px', height: '30px', cursor: 'ew-resize', backgroundColor: 'rgba(236, 72, 153, 0.5)', borderRadius: '2px' }} />
                    <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'nw')} style={{ position: 'absolute', top: '-5px', left: '-5px', width: '10px', height: '10px', cursor: 'nwse-resize', backgroundColor: 'rgba(236, 72, 153, 0.6)', borderRadius: '3px', border: '1px solid rgba(236, 72, 153, 0.8)' }} />
                    <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'ne')} style={{ position: 'absolute', top: '-5px', right: '-5px', width: '10px', height: '10px', cursor: 'nesw-resize', backgroundColor: 'rgba(236, 72, 153, 0.6)', borderRadius: '3px', border: '1px solid rgba(236, 72, 153, 0.8)' }} />
                    <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'sw')} style={{ position: 'absolute', bottom: '-5px', left: '-5px', width: '10px', height: '10px', cursor: 'nesw-resize', backgroundColor: 'rgba(236, 72, 153, 0.6)', borderRadius: '3px', border: '1px solid rgba(236, 72, 153, 0.8)' }} />
                    <div onMouseDown={(e) => handleResizeMouseDown(e, el.id, 'se')} style={{ position: 'absolute', bottom: '-5px', right: '-5px', width: '10px', height: '10px', cursor: 'nwse-resize', backgroundColor: 'rgba(236, 72, 153, 0.6)', borderRadius: '3px', border: '1px solid rgba(236, 72, 153, 0.8)' }} />
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="uml-sidebar" style={{ borderLeft: '1px solid #e9d5ff', borderRight: 'none', maxWidth: '280px', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ flexShrink: 0, paddingBottom: '12px' }}>
            <h3 style={{ margin: '16px 0 12px 0' }}>Properties</h3>
          {selectedElement ? (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#5b21b6', fontWeight: 600, marginBottom: '6px' }}>Name:</label>
                <input
                  type="text"
                  value={editingElement === selectedElement ? editName : elements.find(e => e.id === selectedElement)?.name || ''}
                  onChange={(e) => {
                    if (editingElement !== selectedElement) {
                      setEditingElement(selectedElement);
                      setEditName(e.target.value);
                    } else {
                      setEditName(e.target.value);
                    }
                  }}
                  onBlur={handleSaveName}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd6fe',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {selectedElement && elements.find(e => e.id === selectedElement)?.type === 'SOCKET_DECORATOR' && (
                  <button onClick={() => handleRotateElement(selectedElement)} className="btn-secondary" style={{ flex: 1 }}>
                    ↻ Rotate 90°
                  </button>
                )}
                <button onClick={() => handleDeleteElement(selectedElement)} className="btn-danger" style={{ flex: 1 }}>
                  🗑️ Delete Element
                </button>
              </div>
            </>
          ) : selectedConnection ? (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: '#5b21b6', fontWeight: 600, marginBottom: '6px' }}>Label:</label>
                <input
                  type="text"
                  value={connections.find(c => c.id === selectedConnection)?.label || ''}
                  onChange={(e) => handleConnectionLabelChange(selectedConnection, e.target.value)}
                  placeholder="Connection label"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #ddd6fe',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <button onClick={() => setConnections(connections.filter(c => c.id !== selectedConnection))} className="btn-danger">
                🗑️ Delete Connection
              </button>
            </>
          ) : (
            <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '14px' }}>
              Select an element to edit
            </div>
          )}
          </div>

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

      <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} />
    </div>
  );
}
