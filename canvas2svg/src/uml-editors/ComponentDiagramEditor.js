import React, { useRef, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import '../UMLEditor.css';

// ============ COMPONENT TYPES ============
const COMPONENT_ELEMENTS = {
  COMPONENT: { label: 'Component', icon: '📦', color: '#E8D4F8' },
  ARTIFACT: { label: 'Artifact', icon: '📄', color: '#F8E8D4' },
  PACKAGE: { label: 'Package', icon: '📁', color: '#E8F8D4' },
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

// ============ ORTHOGONAL ROUTING ============
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
  
  // Build SVG path
  let pathStr = `M ${Math.round(cleanPath[0].x)},${Math.round(cleanPath[0].y)}`;
  for (let i = 1; i < cleanPath.length; i++) {
    pathStr += ` L ${Math.round(cleanPath[i].x)},${Math.round(cleanPath[i].y)}`;
  }
  
  return pathStr;
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
      svg += `<rect x='${el.x}' y='${el.y}' width='${el.width}' height='${el.height}' fill='#E8D4F8' stroke='#333' stroke-width='2' />\n`;
      // Component icon in top-right
      const iconX = el.x + el.width - 25;
      const iconY = el.y + 5;
      svg += `<rect x='${iconX}' y='${iconY}' width='20' height='20' fill='#ccc' stroke='#333' stroke-width='1.5' />\n`;
      svg += `<rect x='${iconX - 8}' y='${iconY + 4}' width='5' height='5' fill='#333' stroke='#333' stroke-width='0.5' />\n`;
      svg += `<rect x='${iconX - 8}' y='${iconY + 12}' width='5' height='5' fill='#333' stroke='#333' stroke-width='0.5' />\n`;
      svg += `<text x='${el.x + el.width / 2}' y='${el.y + el.height / 2}' font-family='Arial' font-size='10' font-style='italic' text-anchor='middle' fill='#666'>&lt;&lt;component&gt;&gt;</text>\n`;
      svg += `<text x='${el.x + el.width / 2}' y='${el.y + el.height / 2 + 15}' font-family='Arial' font-size='12' font-weight='bold' text-anchor='middle' fill='#333'>${escapeXML(el.name)}</text>\n`;
    } else if (el.type === 'ARTIFACT') {
      svg += `<rect x='${el.x}' y='${el.y}' width='${el.width}' height='${el.height}' fill='#F8E8D4' stroke='#333' stroke-width='2' />\n`;
      svg += `<text x='${el.x + el.width / 2}' y='${el.y + el.height / 2}' font-family='Arial' font-size='10' font-style='italic' text-anchor='middle' fill='#666'>&lt;&lt;artifact&gt;&gt;</text>\n`;
      svg += `<text x='${el.x + el.width / 2}' y='${el.y + el.height / 2 + 15}' font-family='Arial' font-size='12' font-weight='bold' text-anchor='middle' fill='#333'>${escapeXML(el.name)}</text>\n`;
    } else if (el.type === 'PACKAGE') {
      svg += `<rect x='${el.x}' y='${el.y}' width='40' height='20' fill='#E8F8D4' stroke='#333' stroke-width='2' />\n`;
      svg += `<rect x='${el.x}' y='${el.y + 17}' width='${el.width}' height='${el.height - 17}' fill='#E8F8D4' stroke='#333' stroke-width='2' />\n`;
      svg += `<text x='${el.x + 20}' y='${el.y + 14}' font-family='Arial' font-size='10' font-weight='bold' text-anchor='middle' fill='#333'>📁</text>\n`;
      svg += `<text x='${el.x + el.width / 2}' y='${el.y + 40}' font-family='Arial' font-size='12' font-weight='bold' text-anchor='middle' fill='#333'>${escapeXML(el.name)}</text>\n`;
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

  const loadDiagram = async (id) => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/class-diagrams/${id}`);
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
        if (element && ['COMPONENT', 'ARTIFACT', 'PACKAGE'].includes(element.type)) {
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
        url = `http://localhost:5000/api/class-diagrams/${activeDiagramId}`;
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
          <button className="btn-secondary" onClick={handleImportJSON}>📤 Import</button>
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
                  border: ['LOLLIPOP_DECORATOR', 'SOCKET_DECORATOR', 'ASSEMBLY_PORT'].includes(el.type) ? 'none' : `${isSelected ? 3 : 2}px solid #333`,
                  borderRadius: el.type === 'PACKAGE' ? '8px' : '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: isDragging ? 'grabbing' : 'grab',
                  userSelect: 'none',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#333',
                  textAlign: 'center',
                  overflow: ['LOLLIPOP_DECORATOR', 'SOCKET_DECORATOR', 'ASSEMBLY_PORT'].includes(el.type) ? 'visible' : 'visible',
                  padding: ['LOLLIPOP_DECORATOR', 'SOCKET_DECORATOR', 'ASSEMBLY_PORT'].includes(el.type) ? '0px' : (el.type === 'PACKAGE' ? '0px' : '8px'),
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
