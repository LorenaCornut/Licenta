import React, { useState } from 'react';
import './GraphEditor.css';
import './UMLEditor.css';
import { useNavigate } from 'react-router-dom';

// ============ HELPER FUNCTIONS ============

/**
 * Calculează distanța perpendiculară de la un punct (px, py) la segmentul de linie (x1,y1)-(x2,y2)
 */
function distancePointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  
  if (len2 === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  
  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;
  
  return Math.hypot(px - closestX, py - closestY);
}

/**
 * Determină dacă punctul (px, py) este pe stânga sau dreapta liniei (x1,y1)-(x2,y2)
 */
function sideOfLine(px, py, x1, y1, x2, y2) {
  const crossProduct = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
  return crossProduct > 0 ? 1 : -1;
}

/**
 * Convertește o listă de puncte în SVG path smooth (Catmull-Rom)
 */
function pointsToSmoothPath(points) {
  if (points.length < 2) return '';
  
  let d = `M ${points[0].x},${points[0].y}`;
  
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = i < points.length - 2 ? points[i + 2] : p2;
    
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }
  
  return d;
}

/**
 * Transformă o listă de stringuri coordonate în SVG path smooth (Catmull-Rom)
 * Format: ["x1,y1", "x2,y2", ...]
 */
function catmullRom2bezier(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1].split(',').map(Number) : points[i].split(',').map(Number);
    const p1 = points[i].split(',').map(Number);
    const p2 = points[i + 1].split(',').map(Number);
    const p3 = i < points.length - 2 ? points[i + 2].split(',').map(Number) : p2;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/**
 * Evaluează un punct pe curbă Bezier cubic la parametrul t
 */
function evaluateBezier(t, p0, p1, cp1, cp2) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * cp1 + 3 * mt * t * t * cp2 + t * t * t * p1;
}

/**
 * Construiește un path Bezier cubic SMOOTH care evită obstacolele (noduri)
 * Returnează { path: SVG string, direction: ultima direcție a curbei, arrowPoint: punct pe curbă la 28px de capăt }
 */
function buildSmoothedPath(x1, y1, x2, y2, allNodes, excludeIds = []) {
  const nodeRadius = 28;
  const margin = 30;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);

  if (dist === 0) return { path: `M ${x1},${y1}`, direction: { x: 1, y: 0 }, arrowPoint: { x: x1, y: y1 } };

  const ux = dx / dist;
  const uy = dy / dist;

  const obstacleNodes = allNodes
    .filter(n => !excludeIds.includes(n.id))
    .map(n => {
      const d = distancePointToSegment(n.x, n.y, x1, y1, x2, y2);
      const side = sideOfLine(n.x, n.y, x1, y1, x2, y2);

      const dx_to_node = n.x - x1;
      const dy_to_node = n.y - y1;
      const t = (dx_to_node * (x2 - x1) + dy_to_node * (y2 - y1)) / (dist * dist);
      const tClamped = Math.max(0, Math.min(1, t));

      return { node: n, d, side, t: tClamped };
    });

  const controlPoints = [{ x: x1, y: y1 }];
  
  const obstaclesWithOffset = obstacleNodes
    .filter(o => o.d < nodeRadius + margin)
    .sort((a, b) => a.t - b.t);
  
  obstaclesWithOffset.forEach(obstacle => {
    const t = obstacle.t;
    const ptOnLine = {
      x: x1 + ux * (dist * t),
      y: y1 + uy * (dist * t)
    };
    
    const penetration = (nodeRadius + margin) - obstacle.d;
    const strength = penetration / (nodeRadius + margin);
    const offsetDistance = strength * (nodeRadius + 30);
    
    const toObstacleX = obstacle.node.x - ptOnLine.x;
    const toObstacleY = obstacle.node.y - ptOnLine.y;
    const toObstacleLen = Math.hypot(toObstacleX, toObstacleY);
    
    let offsetX = 0;
    let offsetY = 0;
    if (toObstacleLen > 0) {
      offsetX = -toObstacleX / toObstacleLen * offsetDistance;
      offsetY = -toObstacleY / toObstacleLen * offsetDistance;
    }
    
    controlPoints.push({
      x: ptOnLine.x + offsetX,
      y: ptOnLine.y + offsetY
    });
  });
  
  controlPoints.push({ x: x2, y: y2 });
  
  // Calculez direcția și punctul de săgeată
  let direction = { x: ux, y: uy };
  let arrowPoint = { x: x2 - ux * 28, y: y2 - uy * 28 };
  
  if (controlPoints.length >= 3) {
    const idx = controlPoints.length;
    const p0 = controlPoints[idx - 3];
    const p1 = controlPoints[idx - 2];
    const p2 = controlPoints[idx - 1];
    
    let p3x = p2.x + (p2.x - p1.x);
    let p3y = p2.y + (p2.y - p1.y);
    
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3x - p1.x) / 6;
    const cp2y = p2.y - (p3y - p1.y) / 6;
    
    const tangentX = 3 * (p2.x - cp2x);
    const tangentY = 3 * (p2.y - cp2y);
    const tangentLen = Math.hypot(tangentX, tangentY);
    
    if (tangentLen > 0) {
      direction = { x: tangentX / tangentLen, y: tangentY / tangentLen };
    }
    
    // Caut intersecția curbei Bezier cu cercul de rază 28px (marginea nodului)
    // Binary search pe parametrul t de la 1 (capăt) la 0 (început)
    let bestT = 1;
    let bestDist = Infinity;
    
    // Fac mai multe iterații pentru precizie
    for (let t = 1; t >= 0; t -= 0.001) {
      const px = evaluateBezier(t, p1.x, p2.x, cp1x, cp2x);
      const py = evaluateBezier(t, p1.y, p2.y, cp1y, cp2y);
      const d = Math.hypot(px - x2, py - y2);
      
      // Caut punctul care e la exact 28px de capăt
      if (Math.abs(d - 28) < Math.abs(bestDist - 28)) {
        bestDist = d;
        bestT = t;
      }
    }
    
    const px = evaluateBezier(bestT, p1.x, p2.x, cp1x, cp2x);
    const py = evaluateBezier(bestT, p1.y, p2.y, cp1y, cp2y);
    arrowPoint = { x: px, y: py };
  }
  
  const path = pointsToSmoothPath(controlPoints);
  return { path, direction, arrowPoint };
}

/**
 * Calculează direcția săgeții de la nod sursa la nod destinație
 * Folosim o aproximație: vedem unde ajunge curba la ~85% de distanța
 */
function getArrowDirection(x1, y1, x2, y2, allNodes, excludeIds = []) {
  // Calculez un punct de referință pe linia dreaptă la 85%
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  
  if (dist === 0) return { x: 1, y: 0 };
  
  const ux = dx / dist;
  const uy = dy / dist;
  
  // Punct la 85% pe linia dreaptă
  const refX = x1 + ux * (dist * 0.85);
  const refY = y1 + uy * (dist * 0.85);
  
  // Direcția: de la referință la endpoint
  const dirX = x2 - refX;
  const dirY = y2 - refY;
  const dirLen = Math.hypot(dirX, dirY);
  
  return dirLen > 0 ? { x: dirX / dirLen, y: dirY / dirLen } : { x: ux, y: uy };
}

/**
 * Creează punctele unui triunghi pentru săgeață
 * Vârful e pe marginea nodului (pe cercul cu raza 28), nu în centru
 */
function createArrowhead(arrowX, arrowY, direction, size = 15) {
  // Vârful săgeții e exact punctul pe marginea cercului dat (arrowX, arrowY)
  const arrowTipX = arrowX;
  const arrowTipY = arrowY;
  
  // Baza săgeții mai departe în spate
  const arrowBaseX = arrowTipX - direction.x * 20;
  const arrowBaseY = arrowTipY - direction.y * 20;
  
  // Perpendicular la direcție
  const perpX = -direction.y;
  const perpY = direction.x;
  
  // Triunghiul săgeții
  const p1 = `${arrowTipX},${arrowTipY}`;
  const p2 = `${arrowBaseX - perpX * size},${arrowBaseY - perpY * size}`;
  const p3 = `${arrowBaseX + perpX * size},${arrowBaseY + perpY * size}`;
  
  return `${p1} ${p2} ${p3}`;
}

function handleSave() {
  alert('Funcția de salvare nu este implementată încă.');
}

function OrientedGraphEditor() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [edgePreviewPoints, setEdgePreviewPoints] = useState([]);
  const [addNodeMode, setAddNodeMode] = useState(false);
  const [addEdgeMode, setAddEdgeMode] = useState(false);
  const [edgeNodes, setEdgeNodes] = useState([]);
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [showDeleteIcon, setShowDeleteIcon] = useState({ nodeId: null, x: 0, y: 0 });
  const [showDeleteEdge, setShowDeleteEdge] = useState({ edgeIdx: null, x: 0, y: 0 });
  const [assistantNodes, setAssistantNodes] = useState("");
  const [assistantEdges, setAssistantEdges] = useState("");
  const [assistantError, setAssistantError] = useState("");
  const navigate = useNavigate();

  // Sincronizează muchiile din graf cu textarea
  React.useEffect(() => {
    const edgePairs = edges
      .map(e => {
        const fromNode = nodes.find(n => n.id === e.from);
        const toNode = nodes.find(n => n.id === e.to);
        if (!fromNode?.label || !toNode?.label) return null;
        return `${fromNode.label} ${toNode.label}`;
      })
      .filter(Boolean);
    const edgesInTextarea = assistantEdges.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const allEdges = Array.from(new Set([...edgesInTextarea, ...edgePairs]));
    if (allEdges.join('\n') !== assistantEdges) {
      setAssistantEdges(allEdges.join('\n'));
    }
  }, [edges, nodes]);

  // Sincronizează nodurile din graf cu textarea
  React.useEffect(() => {
    const labelsInTextarea = assistantNodes.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const labelsInGraph = nodes.map(n => n.label).filter(Boolean);
    const allLabels = Array.from(new Set([...labelsInTextarea, ...labelsInGraph]));
    if (allLabels.join('\n') !== assistantNodes) {
      setAssistantNodes(allLabels.join('\n'));
    }
  }, [nodes]);

  function handleAssistantDraw() {
    setAssistantError("");
    const nodeLabels = assistantNodes.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const cx = 450, cy = 250, r = 180;
    const angleStep = nodeLabels.length > 0 ? (2 * Math.PI / nodeLabels.length) : 0;
    const newNodes = nodeLabels.map((label, idx) => ({
      id: label,
      label,
      x: cx + r * Math.cos(idx * angleStep - Math.PI/2),
      y: cy + r * Math.sin(idx * angleStep - Math.PI/2)
    }));
    const edgePairs = assistantEdges.split(/\r?\n/).map(s => s.trim().split(/\s+/)).filter(pair => pair.length === 2);
    const nodeIds = newNodes.map(n => n.id);
    const invalidEdge = edgePairs.find(([a, b]) => !nodeIds.includes(a) || !nodeIds.includes(b));
    if (invalidEdge) {
      setAssistantError(`Muchie invalidă: ${invalidEdge.join(" ")}`);
      return;
    }
    const newEdges = edgePairs.map(([a, b]) => ({ from: a, to: b }));
    setNodes(newNodes);
    setEdges(newEdges);
  }

  function handleAddNode() {
    setAddNodeMode(true);
    setAddEdgeMode(false);
  }

  function handleAddEdge() {
    setAddEdgeMode(true);
    setAddNodeMode(false);
    setEdgeNodes([]);
    setEdgePreviewPoints([]);
  }

  function handleCanvasClick(e) {
    if (!addNodeMode) return;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!isOverlapping(x, y)) {
      setNodes([...nodes, { id: Date.now(), x, y, label: '' }]);
    }
    setAddNodeMode(false);
  }

  function handleMouseMove(e) {
    if (draggingNodeId !== null) {
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      if (!isOverlapping(x, y, draggingNodeId)) {
        setNodes(nodes => {
          const newNodes = nodes.map(n => n.id === draggingNodeId ? { ...n, x, y } : n);
          return newNodes;
        });
      }
    }
    
    // Desenare interactivă muchie cu puncte intermediare - EXACT CA LA GRAPHEDITOR
    if (addEdgeMode && edgeNodes.length === 1) {
      const rect = document.querySelector('.graph-canvas').getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setEdgePreviewPoints(prev => prev.length === 0 || (Math.abs(prev[prev.length-1].x-x) > 5 || Math.abs(prev[prev.length-1].y-y) > 5) ? [...prev, { x, y }] : prev);
    }
  }

  function handleMouseUp(e) {
    setDraggingNodeId(null);
    if (showDeleteIcon.nodeId !== null) {
      const target = e.target;
      if (!target.closest('button[title="Șterge nod"]')) {
        setShowDeleteIcon({ nodeId: null, x: 0, y: 0 });
      }
    }
    if (showDeleteEdge.edgeIdx !== null) {
      const target = e.target;
      if (!target.closest('button[title="Șterge muchie"]')) {
        setShowDeleteEdge({ edgeIdx: null, x: 0, y: 0 });
      }
    }
  }

  function isOverlapping(x, y, excludeId = null) {
    const radius = 28;
    const padding = 12;
    return nodes.some(n => n.id !== excludeId && Math.hypot(n.x - x, n.y - y) < radius * 2 + padding);
  }

  function handleNodeMouseDown(node, e) {
    e.stopPropagation();
    setDraggingNodeId(node.id);
    setDragOffset({ x: e.clientX - node.x, y: e.clientY - node.y });
  }

  function handleNodeClick(nodeId) {
    if (addEdgeMode) {
      if (edgeNodes.length === 0) {
        setEdgeNodes([nodeId]);
      } else if (edgeNodes.length === 1 && edgeNodes[0] !== nodeId) {
        setEdges([...edges, { from: edgeNodes[0], to: nodeId }]);
        
        const fromNode = nodes.find(n => n.id === edgeNodes[0]);
        const toNode = nodes.find(n => n.id === nodeId);
        if (fromNode?.label && toNode?.label) {
          const edgeText = `${fromNode.label} ${toNode.label}`;
          const edgesInTextarea = assistantEdges.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          if (!edgesInTextarea.includes(edgeText)) {
            setAssistantEdges(edgesInTextarea.concat(edgeText).join('\n'));
          }
        }
        
        setAddEdgeMode(false);
        setEdgeNodes([]);
        setEdgePreviewPoints([]);
      }
      return;
    }
    const node = nodes.find(n => n.id === nodeId);
    setEditingNodeId(nodeId);
    setEditingValue(node?.label || '');
  }

  function handleEditBlurOrEnter() {
    const node = nodes.find(n => n.id === editingNodeId);
    const oldLabel = node?.label || '';
    const newLabel = editingValue.trim();
    setNodes(nodes.map(n => n.id === editingNodeId ? { ...n, label: newLabel } : n));

    if (newLabel) {
      let labelsInTextarea = assistantNodes.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      labelsInTextarea = labelsInTextarea.map(l => l === oldLabel ? newLabel : l);
      labelsInTextarea = Array.from(new Set(labelsInTextarea));
      setAssistantNodes(labelsInTextarea.join('\n'));
    }

    if (oldLabel && newLabel) {
      let edgesInTextarea = assistantEdges.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      edgesInTextarea = edgesInTextarea.map(line => {
        const parts = line.split(/\s+/);
        return parts.map(p => p === oldLabel ? newLabel : p).join(' ');
      });
      edgesInTextarea = Array.from(new Set(edgesInTextarea));
      setAssistantEdges(edgesInTextarea.join('\n'));
    }

    setEditingNodeId(null);
    setEditingValue('');
  }

  function handleNodeContextMenu(node, e) {
    e.preventDefault();
    setShowDeleteIcon({ nodeId: node.id, x: node.x + 18, y: node.y - 38 });
  }

  function handleDeleteNode(nodeId) {
    setNodes(nodes.filter(n => n.id !== nodeId));
    setEdges(edges.filter(e => e.from !== nodeId && e.to !== nodeId));
    setShowDeleteIcon({ nodeId: null, x: 0, y: 0 });

    const labels = assistantNodes.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const nod = nodes.find(n => n.id === nodeId);
    const labelToRemove = nod?.label || nodeId;
    const newLabels = labels.filter(l => l !== labelToRemove);
    setAssistantNodes(newLabels.join('\n'));

    const edgeLines = assistantEdges.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const newEdgeLines = edgeLines.filter(line => {
      const [a, b] = line.split(/\s+/);
      return a !== labelToRemove && b !== labelToRemove;
    });
    setAssistantEdges(newEdgeLines.join('\n'));
  }

  function handleEdgeContextMenu(edge, idx, e) {
    e.preventDefault();
    let x = 0, y = 0;
    const from = nodes.find(n => n.id === edge.from);
    const to = nodes.find(n => n.id === edge.to);
    if (from && to) {
      x = (from.x + to.x) / 2;
      y = (from.y + to.y) / 2;
    }
    setShowDeleteEdge({ edgeIdx: idx, x: x, y: y });
  }

  function handleDeleteEdge(idx) {
    const edgeToDelete = edges[idx];
    setEdges(edges => edges.filter((_, i) => i !== idx));
    setShowDeleteEdge({ edgeIdx: null, x: 0, y: 0 });

    if (edgeToDelete) {
      const fromLabel = nodes.find(n => n.id === edgeToDelete.from)?.label || edgeToDelete.from;
      const toLabel = nodes.find(n => n.id === edgeToDelete.to)?.label || edgeToDelete.to;
      const edgeText = `${fromLabel} ${toLabel}`;
      const edgeLines = assistantEdges.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const newEdgeLines = edgeLines.filter(line => line !== edgeText);
      setAssistantEdges(newEdgeLines.join('\n'));
    }
  }

  // Exportă graficul orientat în format SVG cu săgeți
  function handleExportSVG() {
    if (nodes.length === 0) {
      alert('Niciun nod nu a fost desenat. Adaugă cel puțin un nod înainte de export!');
      return;
    }

    const svgNamespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNamespace, 'svg');
    
    svg.setAttribute('width', '1000');
    svg.setAttribute('height', '540');
    svg.setAttribute('viewBox', '0 0 1000 540');
    svg.setAttribute('xmlns', svgNamespace);
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.setAttribute('version', '1.1');
    svg.setAttribute('style', 'background: white;');

    // Background alb
    const bgRect = document.createElementNS(svgNamespace, 'rect');
    bgRect.setAttribute('width', '1000');
    bgRect.setAttribute('height', '540');
    bgRect.setAttribute('fill', 'white');
    svg.appendChild(bgRect);

    // Desenez muchiile cu săgeți
    edges.forEach((edge, idx) => {
      const from = nodes.find(n => n.id === edge.from);
      const to = nodes.find(n => n.id === edge.to);
      
      if (!from || !to) return;

      // Calculez pathul smooth cu informații despre săgeată
      const pathResult = buildSmoothedPath(
        from.x, from.y,
        to.x, to.y,
        nodes,
        [from.id, to.id]
      );

      const pathD = pathResult.path;
      const direction = pathResult.direction;
      const arrowPoint = pathResult.arrowPoint;

      // Desenez linia muchiei
      const path = document.createElementNS(svgNamespace, 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('stroke', '#8b5cf6');
      path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('fill', 'none');
      svg.appendChild(path);

      // Creez și desenez săgeată
      const arrowPoints = createArrowhead(arrowPoint.x, arrowPoint.y, direction, 18);
      const polygon = document.createElementNS(svgNamespace, 'polygon');
      polygon.setAttribute('points', arrowPoints);
      polygon.setAttribute('fill', '#8b5cf6');
      svg.appendChild(polygon);
    });

    // Desenez nodurile
    nodes.forEach(node => {
      // Cercul nodului
      const circle = document.createElementNS(svgNamespace, 'circle');
      circle.setAttribute('cx', node.x);
      circle.setAttribute('cy', node.y);
      circle.setAttribute('r', '28');
      circle.setAttribute('fill', '#ede9fe');
      circle.setAttribute('stroke', '#8b5cf6');
      circle.setAttribute('stroke-width', '3');
      svg.appendChild(circle);

      // Eticheta nodului
      if (node.label) {
        const text = document.createElementNS(svgNamespace, 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y + 6);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '18');
        text.setAttribute('font-family', 'Arial, sans-serif');
        text.setAttribute('fill', '#5b21b6');
        text.setAttribute('font-weight', 'bold');
        text.textContent = node.label;
        svg.appendChild(text);
      }
    });

    // Convertesc SVG în string
    let svgString = new XMLSerializer().serializeToString(svg);
    
    // Adaug XML declaration și DOCTYPE
    const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>\n';
    const doctype = '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n';
    svgString = xmlDeclaration + doctype + svgString;
    
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    // Descarcă fișierul SVG
    const link = document.createElement('a');
    link.href = url;
    link.download = `graf-orientat-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    alert('Graficul orientat a fost exportat cu succes!');
  }

  return (
    <div className="graph-editor-root">
      <button className="btn-back" onClick={() => navigate('/dashboard')} style={{ position: 'absolute', top: '24px', left: '32px', zIndex: 10 }}>← Back</button>
      <div className="graph-editor-header">
        <h2 style={{
          fontFamily: 'Caveat, cursive',
          fontSize: '2.4rem',
          fontWeight: 400,
          background: 'linear-gradient(90deg, #2563eb 0%, #8b5cf6 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          color: 'transparent',
          marginBottom: 0
        }}>Editor graf orientat</h2>
      </div>
      <div className="graph-toolbar" style={{ width: '100%', justifyContent: 'flex-start', margin: 5, paddingLeft: 240, marginBottom: 32 }}>
        <button className={`graph-toolbar-btn${addNodeMode ? ' active' : ''}`} onClick={handleAddNode}>Adaugă nod</button>
        <button className={`graph-toolbar-btn${addEdgeMode ? ' active' : ''}`} onClick={handleAddEdge}>Adaugă muchie</button>
        <button className="graph-toolbar-btn">Șterge</button>
        <button className="graph-toolbar-btn">Reset</button>
        <button className="graph-toolbar-btn" onClick={handleExportSVG}>Export</button>
        <button className="graph-toolbar-btn" onClick={handleSave}>Salvează</button>
      </div>
      <div className="graph-main-content" style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', width: '100%' }}>
        <div className="graph-canvas-container" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingLeft: 16, paddingBottom: 16 }}>
          <svg
            className="graph-canvas"
            width={1000}
            height={540}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            style={{ maxWidth: '1000px', maxHeight: '540px', width: '100%', height: '100%' }}
          >
            {/* Preview muchie cu puncte intermediare */}
            {addEdgeMode && edgeNodes.length === 1 && edgePreviewPoints.length > 0 && (() => {
              const from = nodes.find(n => n.id === edgeNodes[0]);
              if (!from) return null;
              const x1 = from.x;
              const y1 = from.y;
              const allPoints = [
                { x: x1, y: y1 },
                ...edgePreviewPoints
              ];
              const pathD = catmullRom2bezier(allPoints.map(p => `${p.x},${p.y}`));
              return (
                <path
                  d={pathD}
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  fill="none"
                  strokeDasharray="6 4"
                />
              );
            })()}
            
            {/* Muchii cu săgeți */}
            {edges.map((edge, idx) => {
              const from = nodes.find(n => n.id === edge.from);
              const to = nodes.find(n => n.id === edge.to);
              if (!from || !to) return null;

              const pathResult = buildSmoothedPath(
                from.x, from.y,
                to.x, to.y,
                nodes,
                [from.id, to.id]
              );
              
              const pathD = pathResult.path;
              const direction = pathResult.direction;
              const arrowPoint = pathResult.arrowPoint;
              const arrowPoints = createArrowhead(arrowPoint.x, arrowPoint.y, direction, 18);

              return (
                <g key={idx}>
                  <path
                    d={pathD}
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    fill="none"
                    style={{ cursor: 'pointer' }}
                    onContextMenu={e => handleEdgeContextMenu(edge, idx, e)}
                  />
                  {/* Săgeată la capătul muchiei */}
                  <polygon
                    points={arrowPoints}
                    fill="#8b5cf6"
                    style={{ cursor: 'pointer' }}
                    onContextMenu={e => handleEdgeContextMenu(edge, idx, e)}
                  />
                  {showDeleteEdge.edgeIdx === idx && (
                    <foreignObject x={showDeleteEdge.x} y={showDeleteEdge.y} width={32} height={32}>
                      <button
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                        onClick={() => handleDeleteEdge(idx)}
                        title="Șterge muchie"
                      >
                        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <rect x="6" y="8" width="10" height="8" rx="2" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="1.5"/>
                          <rect x="8" y="6" width="6" height="2" rx="1" fill="#8b5cf6"/>
                          <line x1="9" y1="10" x2="9" y2="14" stroke="#8b5cf6" strokeWidth="1.5"/>
                          <line x1="11" y1="10" x2="11" y2="14" stroke="#8b5cf6" strokeWidth="1.5"/>
                          <line x1="13" y1="10" x2="13" y2="14" stroke="#8b5cf6" strokeWidth="1.5"/>
                        </svg>
                      </button>
                    </foreignObject>
                  )}
                </g>
              );
            })}

            {/* Noduri */}
            {nodes.map(node => (
              <g key={node.id} style={{ cursor: draggingNodeId === node.id ? 'grabbing' : 'pointer' }}>
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={28}
                  fill="#ede9fe"
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  onClick={() => addEdgeMode ? handleNodeClick(node.id) : undefined}
                  onDoubleClick={() => !addEdgeMode ? handleNodeClick(node.id) : undefined}
                  onMouseDown={e => handleNodeMouseDown(node, e)}
                  onContextMenu={e => handleNodeContextMenu(node, e)}
                />
                {showDeleteIcon.nodeId === node.id && (
                  <foreignObject x={showDeleteIcon.x} y={showDeleteIcon.y} width={32} height={32}>
                    <button
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                      onClick={() => handleDeleteNode(node.id)}
                      title="Șterge nod"
                    >
                      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="6" y="8" width="10" height="8" rx="2" fill="#ede9fe" stroke="#8b5cf6" strokeWidth="1.5"/>
                        <rect x="8" y="6" width="6" height="2" rx="1" fill="#8b5cf6"/>
                        <line x1="9" y1="10" x2="9" y2="14" stroke="#8b5cf6" strokeWidth="1.5"/>
                        <line x1="11" y1="10" x2="11" y2="14" stroke="#8b5cf6" strokeWidth="1.5"/>
                        <line x1="13" y1="10" x2="13" y2="14" stroke="#8b5cf6" strokeWidth="1.5"/>
                      </svg>
                    </button>
                  </foreignObject>
                )}
                {editingNodeId === node.id ? (
                  <foreignObject x={node.x - 24} y={node.y - 16} width={48} height={32}>
                    <input
                      type="text"
                      value={editingValue}
                      autoFocus
                      style={{ width: '100%', height: '28px', fontSize: '16px', textAlign: 'center', border: 'none', outline: 'none', color: '#5b21b6', background: 'transparent', boxShadow: 'none', padding: 0 }}
                      onChange={e => setEditingValue(e.target.value)}
                      onBlur={handleEditBlurOrEnter}
                      onKeyDown={e => { if (e.key === 'Enter') handleEditBlurOrEnter(); }}
                    />
                  </foreignObject>
                ) : (
                  node.label && (
                    <text
                      x={node.x}
                      y={node.y + 6}
                      textAnchor="middle"
                      fontSize={18}
                      fill="#5b21b6"
                      fontWeight="bold"
                    >
                      {node.label}
                    </text>
                  )
                )}
              </g>
            ))}
          </svg>
        </div>
        <div className="graph-assistant-panel" style={{ minWidth: 280, maxWidth: 360, background: '#fff', borderRadius: 18, boxShadow: '0 2px 12px rgba(80,80,160,0.10)', padding: '22px 22px 0 22px', marginLeft: 24, marginRight: 32, display: 'flex', flexDirection: 'column', gap: 12, height: '520px' }}>
          <div className="graph-assistant-title" style={{ fontSize: '1.2rem', fontWeight: 700, color: '#5b21b6', marginBottom: 8 }}>Vrei să te ajut?</div>
          <div className="graph-assistant-label" style={{ fontSize: '1rem', fontWeight: 600, color: '#3c1a6e', marginBottom: 2 }}>Nodurile dorite:</div>
          <textarea className="graph-assistant-input" rows={5} value={assistantNodes} onChange={e => setAssistantNodes(e.target.value)} placeholder={"A\nB\nC"} style={{ width: '100%', minHeight: 60, maxHeight: 120, resize: 'vertical', borderRadius: 8, border: '1px solid #d1c4e9', padding: '8px 10px', fontSize: '1rem', fontFamily: 'inherit', boxSizing: 'border-box', overflowY: 'auto' }} />
          <div className="graph-assistant-label" style={{ fontSize: '1rem', fontWeight: 600, color: '#3c1a6e', marginBottom: 2 }}>Muchiile dorite:</div>
          <textarea className="graph-assistant-input" rows={5} value={assistantEdges} onChange={e => setAssistantEdges(e.target.value)} placeholder={"A B\nC D"} style={{ width: '100%', minHeight: 60, maxHeight: 120, resize: 'vertical', borderRadius: 8, border: '1px solid #d1c4e9', padding: '8px 10px', fontSize: '1rem', fontFamily: 'inherit', boxSizing: 'border-box', overflowY: 'auto' }} />
          <button className="graph-assistant-btn" onClick={handleAssistantDraw} style={{ background: '#ede9fe', border: 'none', borderRadius: 10, color: '#5b21b6', fontSize: '1rem', fontWeight: 600, padding: '8px 18px', cursor: 'pointer', marginTop: 6, boxShadow: '0 2px 8px rgba(80,80,160,0.10)', transition: 'background 0.2s, box-shadow 0.2s' }}>Desenează</button>
          {assistantError && <div className="graph-assistant-error" style={{ color: '#b91c1c', fontSize: '0.98rem', marginTop: 4, fontWeight: 500 }}>{assistantError}</div>}
        </div>
      </div>
    </div>
  );
}

export default OrientedGraphEditor;
