import React, { useState } from 'react';
import './GraphEditor.css';
import { useNavigate } from 'react-router-dom';

function GraphEditor() {
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
  function handleMouseMove(e) {
    if (draggingNodeId !== null) {
      const x = e.clientX - dragOffset.x;
      const y = e.clientY - dragOffset.y;
      setNodes(nodes => nodes.map(n => n.id === draggingNodeId ? { ...n, x, y } : n));
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
    setNodes([...nodes, { id: nodes.length + 1, x, y, label: '' }]);
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
            return (
              <line
                key={idx}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#8b5cf6"
                strokeWidth={3}
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
