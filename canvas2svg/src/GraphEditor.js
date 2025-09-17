import React, { useState } from 'react';
import './GraphEditor.css';
import { useNavigate } from 'react-router-dom';

function GraphEditor() {
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
    setNodes(nodes.filter(n => n.id !== nodeId));
    setEdges(edges.filter(e => e.from !== nodeId && e.to !== nodeId));
    setShowDeleteIcon({ nodeId: null, x: 0, y: 0 });
  }
  const [addEdgeMode, setAddEdgeMode] = useState(false);
  const [edgeNodes, setEdgeNodes] = useState([]); // [id1, id2]
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
    const radius = 22; // raza nodului
    return nodes.some(n => n.id !== excludeId && Math.hypot(n.x - x, n.y - y) < radius * 2);
  }

  function handleMouseMove(e) {
    if (draggingNodeId !== null) {
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      // Nu mută dacă se suprapune cu alt nod
      if (!isOverlapping(x, y, draggingNodeId)) {
        setNodes(nodes => nodes.map(n => n.id === draggingNodeId ? { ...n, x, y } : n));
      }
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
  const [nodes, setNodes] = useState([]); // {id, x, y, label}
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [edges, setEdges] = useState([]); // {from, to}
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
      } else if (edgeNodes.length === 1 && edgeNodes[0] !== nodeId) {
        setEdges([...edges, { from: edgeNodes[0], to: nodeId }]);
        setAddEdgeMode(false);
        setEdgeNodes([]);
      }
      // dacă dai click pe același nod, nu face nimic
      return;
    }
    const node = nodes.find(n => n.id === nodeId);
    setEditingNodeId(nodeId);
    setEditingValue(node?.label || '');
  }

  // La blur sau Enter, salvează textul și ascunde inputul
  function handleEditBlurOrEnter() {
    setNodes(nodes.map(n => n.id === editingNodeId ? { ...n, label: editingValue } : n));
    setEditingNodeId(null);
    setEditingValue('');
  }

  return (
    <div className="graph-editor-root">
      <div className="graph-editor-header">
        <h2>Editor graf neorientat</h2>
        <button className="graph-back-btn" onClick={() => navigate('/dashboard')}>Înapoi la Dashboard</button>
      </div>
      <div className="graph-toolbar">
  <button className={`graph-toolbar-btn${addNodeMode ? ' active' : ''}`} onClick={handleAddNode}>Adaugă nod</button>
  <button className={`graph-toolbar-btn${addEdgeMode ? ' active' : ''}`} onClick={handleAddEdge}>Adaugă muchie</button>
        <button className="graph-toolbar-btn">Șterge</button>
        <button className="graph-toolbar-btn">Reset</button>
        <button className="graph-toolbar-btn">Export</button>
      </div>
      <div className="graph-canvas-container">
        <svg
          className="graph-canvas"
          width={900}
          height={500}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
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
                <line
                  key={idx}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  fill="none"
                />
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
              // Control point sub nodul intermediar, la o distanță vizibilă
              cx = avoidNode.n.x;
              cy = avoidNode.n.y + 60;
            } else {
              // Control point la mijloc, cu offset vertical
              cx = (from.x + to.x)/2;
              cy = (from.y + to.y)/2 + 60;
            }
            const pathD = `M ${x1},${y1} Q ${cx},${cy} ${x2},${y2}`;
            return (
              <path
                key={idx}
                d={pathD}
                stroke="#8b5cf6"
                strokeWidth={3}
                fill="none"
              />
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
        {/* Sidebar detalii (placeholder) */}
        <div className="graph-sidebar">
          <h3>Detalii selecție</h3>
          {selected ? (
            <div>
              <div>ID: {selected.id}</div>
              {/* Alte detalii */}
            </div>
          ) : (
            <div>Selectează un nod sau o muchie</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default GraphEditor;
