
import React, { useState } from 'react';
import './GraphEditor.css';
import { useNavigate } from 'react-router-dom';

  // Funcție placeholder pentru butonul Salvează
  function handleSave() {
    // TODO: Adaugă funcționalitatea de salvare aici
    alert('Funcția de salvare nu este implementată încă.');
  }

function GraphEditor() {
  // --- DECLARĂ TOATE STATE-URILE LA ÎNCEPUT ---
  const [nodes, setNodes] = useState([]); // {id, x, y, label}
  const [edges, setEdges] = useState([]); // {from, to}
  const [assistantNodes, setAssistantNodes] = useState("");
  const [assistantEdges, setAssistantEdges] = useState("");
  const [assistantError, setAssistantError] = useState("");

  // Sincronizează muchiile din graf cu textarea 'muchiile dorite', doar dacă ambele noduri au text
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

  // Sincronizează nodurile din graf cu caseta 'nodurile dorite', doar noduri cu text
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
    // Ia nodurile și muchiile doar din textarea, ignoră orice altceva
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
  const [showDeleteEdge, setShowDeleteEdge] = useState({ edgeIdx: null, x: 0, y: 0 });

  function handleEdgeContextMenu(edge, idx, e) {
    e.preventDefault();
    // Poziționează coșul la mijlocul segmentului pe care ai dat click
    let x = 0, y = 0;
    if (edge.points && edge.points.length > 0) {
      // Găsește segmentul cel mai apropiat de click
      const svg = e.target.ownerSVGElement;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      let minDist = Infinity, midPt = null;
      for (let i = 0; i < edge.points.length - 1; i++) {
        const p1 = edge.points[i], p2 = edge.points[i+1];
        // Proiecția mouse-ului pe segment
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        if (len === 0) continue;
        const t = ((mouseX - p1.x) * dx + (mouseY - p1.y) * dy) / (len * len);
        const tClamped = Math.max(0, Math.min(1, t));
        const px = p1.x + tClamped * dx;
        const py = p1.y + tClamped * dy;
        const dist = Math.hypot(mouseX - px, mouseY - py);
        if (dist < minDist) {
          minDist = dist;
          midPt = { x: px, y: py };
        }
      }
      if (midPt) {
        x = midPt.x;
        y = midPt.y;
      } else {
        // fallback: mijlocul path-ului
        const mid = edge.points[Math.floor(edge.points.length / 2)];
        x = mid.x;
        y = mid.y;
      }
    } else {
      const from = nodes.find(n => n.id === edge.from);
      const to = nodes.find(n => n.id === edge.to);
      if (from && to) {
        x = (from.x + to.x) / 2;
        y = (from.y + to.y) / 2;
      }
    }
    setShowDeleteEdge({ edgeIdx: idx, x: x, y: y });
  }

  function handleDeleteEdge(idx) {
    // Șterge muchia din graf
    const edgeToDelete = edges[idx];
    setEdges(edges => edges.filter((_, i) => i !== idx));
    setShowDeleteEdge({ edgeIdx: null, x: 0, y: 0 });

    // Șterge muchia din textarea 'muchii dorite'
    if (edgeToDelete) {
      const fromLabel = nodes.find(n => n.id === edgeToDelete.from)?.label || edgeToDelete.from;
      const toLabel = nodes.find(n => n.id === edgeToDelete.to)?.label || edgeToDelete.to;
      const edgeText = `${fromLabel} ${toLabel}`;
      const edgeLines = assistantEdges.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const newEdgeLines = edgeLines.filter(line => line !== edgeText);
      setAssistantEdges(newEdgeLines.join('\n'));
    }
  }

  function handleCanvasMouseUp(e) {
    // Ascunde coșul de muchie dacă click-ul nu e pe coș
    if (showDeleteEdge.edgeIdx !== null) {
      const target = e.target;
      if (!target.closest('button[title="Șterge muchie"]')) {
        setShowDeleteEdge({ edgeIdx: null, x: 0, y: 0 });
      }
    }
    handleMouseUp(e);
  }
  // Ajustează punctele intermediare pentru a evita zonele aglomerate (noduri și muchii)
  function adjustPointsAwayFromCongestion(points, nodes, edges) {
    // Pentru fiecare punct, dacă e prea aproape de un nod, îl mută pe cercul de ocolire
    const minDist = 50;
    let newPoints = [];
    for (let idx = 0; idx < points.length; idx++) {
      let pt = { ...points[idx] };
      let arcAdded = false;
      for (const n of nodes) {
        if (idx > 0) {
          const prev = points[idx - 1];
          const dx = pt.x - prev.x;
          const dy = pt.y - prev.y;
          const len = Math.hypot(dx, dy);
          if (len === 0) continue;
          // Proiecția nodului pe segment
          const t = ((n.x - prev.x) * dx + (n.y - prev.y) * dy) / (len * len);
          const tClamped = Math.max(0, Math.min(1, t));
          const px = prev.x + tClamped * dx;
          const py = prev.y + tClamped * dy;
          const dist = Math.hypot(px - n.x, py - n.y);
          if (dist < minDist + 28) {
            // Adaug două puncte intermediare pe o arcadă largă, pe partea opusă nodului
            const perpAngle = Math.atan2(dy, dx) + Math.PI / 2;
            const sign = ((n.x - prev.x) * dy - (n.y - prev.y) * dx) > 0 ? 1 : -1;
            const offset = (minDist + 48) * sign;
            // Primul punct la 1/3, al doilea la 2/3 pe segment
            const arcPt1 = {
              x: prev.x + dx / 3 + Math.cos(perpAngle) * offset,
              y: prev.y + dy / 3 + Math.sin(perpAngle) * offset
            };
            const arcPt2 = {
              x: prev.x + 2 * dx / 3 + Math.cos(perpAngle) * offset,
              y: prev.y + 2 * dy / 3 + Math.sin(perpAngle) * offset
            };
            newPoints.push(arcPt1);
            newPoints.push(arcPt2);
            arcAdded = true;
            break;
          }
        }
      }
      newPoints.push(pt);
      // Elimină punctele intermediare dacă nodul nu mai e aproape
      if (!arcAdded && idx > 0 && newPoints.length > 3) {
        newPoints = newPoints.filter((p, i) => i === 0 || i === newPoints.length - 1);
      }
    }
    return newPoints;
  }
  // Verifică dacă linia dreaptă dintre două puncte intersectează vreun nod
  function isLineClear(x1, y1, x2, y2, nodes, excludeIds = []) {
    for (const n of nodes) {
      if (excludeIds.includes(n.id)) continue;
      // Proiecția punctului pe linie
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const t = ((n.x - x1) * dx + (n.y - y1) * dy) / (len * len);
      // Clamp t între 0 și 1
      const tClamped = Math.max(0, Math.min(1, t));
      const px = x1 + tClamped * dx;
      const py = y1 + tClamped * dy;
      const dist = Math.hypot(px - n.x, py - n.y);
  if (dist < 60) return false; // distanță de evitare și mai mare
    }
    return true;
  }
  // Transformă o listă de puncte într-un path SVG smooth (Catmull-Rom)
  function catmullRom2bezier(points) {
    if (points.length < 2) return '';
    let d = `M ${points[0]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = i > 0 ? points[i - 1].split(',').map(Number) : points[i].split(',').map(Number);
      const p1 = points[i].split(',').map(Number);
      const p2 = points[i + 1].split(',').map(Number);
      const p3 = i < points.length - 2 ? points[i + 2].split(',').map(Number) : p2;
      // Catmull-Rom to Bezier conversion
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }
  // --- Algoritm Lee/BFS pentru edge routing ---
  // Parametri grid
  const GRID_SIZE = 1; // px per celulă
  const CANVAS_W = 900;
  const CANVAS_H = 500;

  // Creează grid cu celule blocate pentru noduri
  function createGrid(nodes) {
    const cols = Math.floor(CANVAS_W / GRID_SIZE);
    const rows = Math.floor(CANVAS_H / GRID_SIZE);
    const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
    nodes.forEach(n => {
  const r = 40; // zona blocată mărită pentru ocolire
      const left = Math.max(0, Math.floor((n.x - r) / GRID_SIZE));
      const right = Math.min(cols - 1, Math.ceil((n.x + r) / GRID_SIZE));
      const top = Math.max(0, Math.floor((n.y - r) / GRID_SIZE));
      const bottom = Math.min(rows - 1, Math.ceil((n.y + r) / GRID_SIZE));
      for (let i = top; i <= bottom; i++) {
        for (let j = left; j <= right; j++) {
          // Verifică dacă punctul e în cerc
          const cx = j * GRID_SIZE + GRID_SIZE / 2;
          const cy = i * GRID_SIZE + GRID_SIZE / 2;
          if (Math.hypot(cx - n.x, cy - n.y) <= r) {
            grid[i][j] = 1; // blocat
          }
        }
      }
    });
    return grid;
  }

  // BFS Lee: returnează drumul de la (x1, y1) la (x2, y2) pe grid
  function leePath(grid, start, end) {
    const rows = grid.length;
    const cols = grid[0].length;
    const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
    const parent = Array.from({ length: rows }, () => Array(cols).fill(null));
    const q = [];
    q.push(start);
    visited[start[0]][start[1]] = true;
    const dirs = [ [0,1], [1,0], [0,-1], [-1,0], [1,1], [1,-1], [-1,1], [-1,-1] ];
    while (q.length) {
      const [i, j] = q.shift();
      if (i === end[0] && j === end[1]) break;
      for (const [di, dj] of dirs) {
        const ni = i + di, nj = j + dj;
        if (ni >= 0 && ni < rows && nj >= 0 && nj < cols && !visited[ni][nj] && grid[ni][nj] === 0) {
          visited[ni][nj] = true;
          parent[ni][nj] = [i, j];
          q.push([ni, nj]);
        }
      }
    }
    // Reconstruiește drumul
    const path = [];
    let cur = end;
    while (cur && !(cur[0] === start[0] && cur[1] === start[1])) {
      path.push(cur);
      cur = parent[cur[0]][cur[1]];
    }
    path.push(start);
    path.reverse();
    return path;
  }

  const [showDeleteIcon, setShowDeleteIcon] = useState({ nodeId: null, x: 0, y: 0 });
  // La click dreapta pe nod, afișează coșul de gunoi lângă nod
  function handleNodeContextMenu(node, e) {
    e.preventDefault();
    setShowDeleteIcon({ nodeId: node.id, x: node.x + 18, y: node.y - 38 });
  }

  // La click pe coș, șterge nodul și muchiile asociate
  function handleDeleteNode(nodeId) {
    // Șterge nodul din graf
    setNodes(nodes.filter(n => n.id !== nodeId));
    setEdges(edges.filter(e => e.from !== nodeId && e.to !== nodeId));
    setShowDeleteIcon({ nodeId: null, x: 0, y: 0 });

    // Șterge nodul din textarea 'noduri dorite'
    const labels = assistantNodes.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const nod = nodes.find(n => n.id === nodeId);
    const labelToRemove = nod?.label || nodeId;
    const newLabels = labels.filter(l => l !== labelToRemove);
    setAssistantNodes(newLabels.join('\n'));

    // Șterge muchiile din textarea 'muchii dorite' care au ca extremitate nodul
    const edgeLines = assistantEdges.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const newEdgeLines = edgeLines.filter(line => {
      const [a, b] = line.split(/\s+/);
      return a !== labelToRemove && b !== labelToRemove;
    });
    setAssistantEdges(newEdgeLines.join('\n'));
  }
  const [addEdgeMode, setAddEdgeMode] = useState(false);
  const [edgeNodes, setEdgeNodes] = useState([]); // [id1, id2]
  const [edgePreviewPoints, setEdgePreviewPoints] = useState([]); // puncte intermediare pentru muchia în desenare
  const [draggingNodeId, setDraggingNodeId] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  // Începe drag pe nod
  function handleNodeMouseDown(node, e) {
    e.stopPropagation();
    setDraggingNodeId(node.id);
    setDragOffset({ x: e.clientX - node.x, y: e.clientY - node.y });
  }

  // Mută nodul cu mouse-ul
  // Verifică suprapunere cu alt nod
  function isOverlapping(x, y, excludeId = null) {
  const radius = 28; // raza nodului (corectă pentru desen)
  const padding = 12; // spațiu minim între contururi
  return nodes.some(n => n.id !== excludeId && Math.hypot(n.x - x, n.y - y) < radius * 2 + padding);
  }

  function handleMouseMove(e) {
    if (draggingNodeId !== null) {
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      // Nu mută dacă se suprapune cu alt nod
      if (!isOverlapping(x, y, draggingNodeId)) {
        setNodes(nodes => {
          const newNodes = nodes.map(n => n.id === draggingNodeId ? { ...n, x, y } : n);
          setEdges(edges => edges.map(edge => {
            const from = newNodes.find(n => n.id === edge.from);
            const to = newNodes.find(n => n.id === edge.to);
            if (!from || !to) return edge;
            // Dacă muchia e diagonală și există noduri între cele două, forțează ocolire pe exterior
            const isDiagonal = Math.abs(from.x - to.x) > 40 && Math.abs(from.y - to.y) > 40;
            const hasIntermediateNode = newNodes.some(n => n.id !== from.id && n.id !== to.id &&
              Math.min(from.x, to.x) < n.x && n.x < Math.max(from.x, to.x) &&
              Math.min(from.y, to.y) < n.y && n.y < Math.max(from.y, to.y));
            let finalPoints = [];
            if (isDiagonal && hasIntermediateNode) {
              // Ocolire pe exterior: adaug puncte pe marginea canvasului
              const margin = 40;
              // Determină dacă e mai liber sus/jos/stânga/dreapta
              const upFree = from.y < CANVAS_H/2 && to.y < CANVAS_H/2;
              const downFree = from.y > CANVAS_H/2 && to.y > CANVAS_H/2;
              if (upFree) {
                finalPoints = [
                  { x: from.x, y: margin },
                  { x: to.x, y: margin }
                ];
              } else if (downFree) {
                finalPoints = [
                  { x: from.x, y: CANVAS_H-margin },
                  { x: to.x, y: CANVAS_H-margin }
                ];
              } else {
                // Ocolire pe lateral
                const leftFree = from.x < CANVAS_W/2 && to.x < CANVAS_W/2;
                const rightFree = from.x > CANVAS_W/2 && to.x > CANVAS_W/2;
                if (leftFree) {
                  finalPoints = [
                    { x: margin, y: from.y },
                    { x: margin, y: to.y }
                  ];
                } else if (rightFree) {
                  finalPoints = [
                    { x: CANVAS_W-margin, y: from.y },
                    { x: CANVAS_W-margin, y: to.y }
                  ];
                } else {
                  // Default: sus
                  finalPoints = [
                    { x: from.x, y: margin },
                    { x: to.x, y: margin }
                  ];
                }
              }
            } else {
              // Rutare automată pe grid
              const grid = createGrid(newNodes);
              const rows = grid.length, cols = grid[0].length;
              let sx = Math.max(0, Math.min(rows-1, Math.floor(from.y)));
              let sy = Math.max(0, Math.min(cols-1, Math.floor(from.x)));
              let ex = Math.max(0, Math.min(rows-1, Math.floor(to.y)));
              let ey = Math.max(0, Math.min(cols-1, Math.floor(to.x)));
              const start = [sx, sy];
              const end = [ex, ey];
              const path = leePath(grid, start, end);
              finalPoints = path.map(([i, j]) => ({ x: j, y: i }));
              finalPoints = finalPoints.filter(pt => Math.hypot(pt.x - from.x, pt.y - from.y) > 10 && Math.hypot(pt.x - to.x, pt.y - to.y) > 10);
            }
            // Ajustează punctele pentru claritate vizuală
            const adjustedPoints = adjustPointsAwayFromCongestion(finalPoints, newNodes, edges);
            return { ...edge, points: adjustedPoints };
          }));
          return newNodes;
        });
      }
    }
    // Desenare interactivă muchie cu puncte intermediare
    if (addEdgeMode && edgeNodes.length === 1) {
      const rect = document.querySelector('.graph-canvas').getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setEdgePreviewPoints(prev => prev.length === 0 || (Math.abs(prev[prev.length-1].x-x) > 5 || Math.abs(prev[prev.length-1].y-y) > 5) ? [...prev, { x, y }] : prev);
    }
  }

  // Termină drag
  function handleMouseUp(e) {
    setDraggingNodeId(null);
    // Dacă există coșul de gunoi și click-ul nu e pe coș, ascunde-l
    if (showDeleteIcon.nodeId !== null) {
      // Verifică dacă click-ul a fost pe coș (sau pe nodul cu coș)
      const target = e.target;
      if (!target.closest('button[title="Șterge nod"]')) {
        setShowDeleteIcon({ nodeId: null, x: 0, y: 0 });
      }
    }
  }
  // const [nodes, setNodes] = useState([]); // {id, x, y, label} // eliminat redeclarare
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  // eliminat redeclarare edges, deja definit la început
  const [selected, setSelected] = useState(null);
  const [addNodeMode, setAddNodeMode] = useState(false);
  const navigate = useNavigate();

  // Activează modul de adăugare nod
  function handleAddNode() {
    setAddNodeMode(true);
    setAddEdgeMode(false);
  }

  // Activează modul de adăugare muchie
  function handleAddEdge() {
    setAddEdgeMode(true);
    setAddNodeMode(false);
    setEdgeNodes([]);
  }

  // La click pe canvas, dacă e activ modul, adaugă nod la poziția clickului
  function handleCanvasClick(e) {
    if (!addNodeMode) return;
    const rect = e.target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Nu adaugă dacă se suprapune cu alt nod
    if (!isOverlapping(x, y)) {
      setNodes([...nodes, { id: nodes.length + 1, x, y, label: '' }]);
    }
    setAddNodeMode(false);
  }

  // La click pe nod: dacă e modul muchie, selectează extremitățile; altfel, editează textul
  function handleNodeClick(nodeId) {
    if (addEdgeMode) {
      if (edgeNodes.length === 0) {
        setEdgeNodes([nodeId]);
        setEdgePreviewPoints([]);
      } else if (edgeNodes.length === 1 && edgeNodes[0] !== nodeId) {
        let finalPoints = edgePreviewPoints;
        // Dacă nu există puncte intermediare trase de utilizator, generez automat traseu pe grid
        if (!finalPoints || finalPoints.length === 0) {
          const from = nodes.find(n => n.id === edgeNodes[0]);
          const to = nodes.find(n => n.id === nodeId);
          if (from && to) {
            const grid = createGrid(nodes);
            const rows = Math.floor(CANVAS_H / GRID_SIZE);
            const cols = Math.floor(CANVAS_W / GRID_SIZE);
            const start = [
              Math.max(0, Math.min(rows - 1, Math.floor(from.y / GRID_SIZE))),
              Math.max(0, Math.min(cols - 1, Math.floor(from.x / GRID_SIZE)))
            ];
            const end = [
              Math.max(0, Math.min(rows - 1, Math.floor(to.y / GRID_SIZE))),
              Math.max(0, Math.min(cols - 1, Math.floor(to.x / GRID_SIZE)))
            ];
            const path = leePath(grid, start, end);
            finalPoints = path.map(([i, j]) => ({ x: j * GRID_SIZE, y: i * GRID_SIZE }));
            finalPoints = finalPoints.filter(pt => Math.hypot(pt.x - from.x, pt.y - from.y) > 10 && Math.hypot(pt.x - to.x, pt.y - to.y) > 10);
            // Dacă nu există drum liber, adaug punct intermediar manual pe partea mai liberă
            if (finalPoints.length === 0) {
              const midX = (from.x + to.x) / 2;
              const midY = (from.y + to.y) / 2;
              const mutat = nodes.find(n => n.id === nodeId);
              let offsetX = 0, offsetY = 0;
              if (mutat) {
                const dx = to.x - from.x;
                const dy = to.y - from.y;
                // Dacă segmentul e mai orizontal, offset vertical
                if (Math.abs(dx) > Math.abs(dy)) {
                  offsetY = mutat.y < midY ? -80 : 80;
                } else {
                  // Dacă segmentul e mai vertical, offset orizontal
                  offsetX = mutat.x < midX ? -80 : 80;
                }
              }
              finalPoints = [ { x: midX + offsetX, y: midY + offsetY } ];
            }
          }
        }
        // Ajustează punctele intermediare pentru claritate vizuală
        const adjustedPoints = adjustPointsAwayFromCongestion(finalPoints, nodes, edges);
        setEdges([...edges, { from: edgeNodes[0], to: nodeId, points: adjustedPoints }]);
        // Adaug muchia la 'Muchiile dorite' doar dacă ambele noduri au text
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

  // La blur sau Enter, salvează textul și ascunde inputul
  function handleEditBlurOrEnter() {
    // Actualizează label-ul nodului
    const node = nodes.find(n => n.id === editingNodeId);
    const oldLabel = node?.label || '';
    const newLabel = editingValue.trim();
    setNodes(nodes.map(n => n.id === editingNodeId ? { ...n, label: newLabel } : n));

    // Actualizează 'noduri dorite': înlocuiește vechiul label cu cel nou
    if (newLabel) {
      let labelsInTextarea = assistantNodes.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      labelsInTextarea = labelsInTextarea.map(l => l === oldLabel ? newLabel : l);
      // Elimină duplicate
      labelsInTextarea = Array.from(new Set(labelsInTextarea));
      setAssistantNodes(labelsInTextarea.join('\n'));
    }

    // Actualizează 'muchii dorite': înlocuiește vechiul label cu cel nou în toate muchiile
    if (oldLabel && newLabel) {
      let edgesInTextarea = assistantEdges.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      edgesInTextarea = edgesInTextarea.map(line => {
        const parts = line.split(/\s+/);
        return parts.map(p => p === oldLabel ? newLabel : p).join(' ');
      });
      // Elimină duplicate
      edgesInTextarea = Array.from(new Set(edgesInTextarea));
      setAssistantEdges(edgesInTextarea.join('\n'));
    }

    setEditingNodeId(null);
    setEditingValue('');
  }

  return (
  <div className="graph-editor-root">
      <button className="graph-back-btn graph-back-btn-abs" onClick={() => navigate('/dashboard')}>Înapoi la Dashboard</button>
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
        }}>Editor graf neorientat</h2>
      </div>
    <div className="graph-toolbar" style={{ width: '100%', justifyContent: 'flex-start', margin: 5, paddingLeft: 240, marginBottom: 32 }}>
        <button className={`graph-toolbar-btn${addNodeMode ? ' active' : ''}`} onClick={handleAddNode}>Adaugă nod</button>
        <button className={`graph-toolbar-btn${addEdgeMode ? ' active' : ''}`} onClick={handleAddEdge}>Adaugă muchie</button>
        <button className="graph-toolbar-btn">Șterge</button>
        <button className="graph-toolbar-btn">Reset</button>
  <button className="graph-toolbar-btn">Export</button>
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
            onMouseUp={handleCanvasMouseUp}
            style={{ maxWidth: '1000px', maxHeight: '540px', width: '100%', height: '100%' }}
          >
            {/* Preview muchie cu puncte intermediare */}
            {addEdgeMode && edgeNodes.length === 1 && edgePreviewPoints.length > 0 && (() => {
              const from = nodes.find(n => n.id === edgeNodes[0]);
              if (!from) return null;
              const r = 28;
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
            {/* Muchii */}
            {edges.map((edge, idx) => {
              const from = nodes.find(n => n.id === edge.from);
              const to = nodes.find(n => n.id === edge.to);
              if (!from || !to) return null;
              // Start/End pe marginea cercului
              const r = 28;
              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const dist = Math.hypot(dx, dy);
              if (dist === 0) return null;
              const x1 = from.x + (dx * r) / dist;
              const y1 = from.y + (dy * r) / dist;
              const x2 = to.x - (dx * r) / dist;
              const y2 = to.y - (dy * r) / dist;
              // Dacă linia dreaptă nu intersectează niciun nod, desenează direct
              if (isLineClear(x1, y1, x2, y2, nodes, [from.id, to.id])) {
                return (
                  <>
                    <line
                      key={idx}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#8b5cf6"
                      strokeWidth={3}
                      fill="none"
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
                  </>
                );
              }
              // --- Curbă Bezier smooth, control point sub nodul intermediar ---
              const avoidNode = nodes.filter(n => n.id !== from.id && n.id !== to.id)
                .map(n => ({
                  n,
                  dist: Math.abs((to.x-from.x)*(from.y-n.y)-(from.x-n.x)*(to.y-from.y))/dist
                }))
                .sort((a,b) => a.dist-b.dist)[0];
              let cx, cy;
              if (avoidNode && avoidNode.dist < 70) {
                cx = avoidNode.n.x;
                cy = avoidNode.n.y + 60;
              } else {
                cx = (from.x + to.x)/2;
                cy = (from.y + to.y)/2 + 60;
              }
              const pathD = `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;
              return (
                <>
                  <path
                    key={idx}
                    d={pathD}
                    stroke="#8b5cf6"
                    strokeWidth={3}
                    fill="none"
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
                </>
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

export default GraphEditor;