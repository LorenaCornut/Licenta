import React, { useState, useEffect, useRef } from 'react';
import './PetriNetEditor.css';
import { useNavigate, useParams } from 'react-router-dom';

// ============ HELPER FUNCTIONS ============

/**
 * Calculează distanța de la un punct la un cerc
 */
function distancePointToCircle(px, py, cx, cy, radius) {
  const dist = Math.hypot(px - cx, py - cy);
  return Math.max(0, dist - radius);
}

/**
 * Calculează distanța de la un punct la un dreptunghi
 */
function distancePointToRect(px, py, x, y, width, height) {
  const closestX = Math.max(x, Math.min(px, x + width));
  const closestY = Math.max(y, Math.min(py, y + height));
  return Math.hypot(px - closestX, py - closestY);
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
 * Creează un arrowhead pentru arcuri
 */
function createArrowhead(arrowX, arrowY, direction, size = 12) {
  const arrowTipX = arrowX;
  const arrowTipY = arrowY;
  const arrowBaseX = arrowTipX - direction.x * 15;
  const arrowBaseY = arrowTipY - direction.y * 15;
  const perpX = -direction.y;
  const perpY = direction.x;
  return `${arrowTipX},${arrowTipY} ${arrowBaseX - perpX * size},${arrowBaseY - perpY * size} ${arrowBaseX + perpX * size},${arrowBaseY + perpY * size}`;
}

// ============ MAIN COMPONENT ============

function PetriNetEditor() {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const { diagramId } = useParams();

  // State pentru elemente
  const [places, setPlaces] = useState([]); // {id, x, y, label, tokens}
  const [transitions, setTransitions] = useState([]); // {id, x, y, label}
  const [arcs, setArcs] = useState([]); // {id, from, to, label, controlPoints}

  // State pentru UI
  const [tool, setTool] = useState('cursor'); // 'cursor', 'place', 'transition', 'arc', 'addTokens'
  const [selectedElement, setSelectedElement] = useState(null); // {type, id}
  const [arcStart, setArcStart] = useState(null); // Pentru desenarea arcelor
  const [arcPreviewPoints, setArcPreviewPoints] = useState([]);
  const [edgePreviewPoints, setEdgePreviewPoints] = useState([]);
  const [draggingElement, setDraggingElement] = useState(null);
  const [draggingOffset, setDraggingOffset] = useState({ x: 0, y: 0 });
  const [draggingControlPoint, setDraggingControlPoint] = useState(null);
  const [editingLabel, setEditingLabel] = useState(null);
  const [diagramName, setDiagramName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // ============ SAVE HANDLER ============

  const handleSave = async () => {
    const userId = localStorage.getItem('userId');
    if (!userId || userId === 'null' || userId === 'undefined') {
      alert('Trebuie să te autentifici pentru a salva diagramele!');
      return;
    }

    if (places.length === 0 && transitions.length === 0) {
      alert('Adaugă cel puțin o poziție sau o tranziție înainte de a salva!');
      return;
    }

    setIsSaving(true);
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/diagrams/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: parseInt(userId),
          title: diagramName.trim() || 'Rețea Petri',
          tipDiagrama: 'Rețea Petri',
          places: places,
          transitions: transitions,
          arcs: arcs,
          diagramId: diagramId
        })
      });

      if (response.ok) {
        setIsSaving(false);
      } else {
        alert('Eroare la salvarea diagramei!');
        setIsSaving(false);
      }
    } catch (err) {
      alert('Eroare de rețea: ' + err.message);
      setIsSaving(false);
    }
  };

  // ============ CONSTANTS ============

  const PLACE_RADIUS = 25;
  const TRANSITION_WIDTH = 50;
  const TRANSITION_HEIGHT = 30;
  const TOKEN_RADIUS = 6;

  // ============ EVENT HANDLERS - CANVAS ============

  const handleCanvasMouseMove = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Handle dragging
    if (draggingElement && tool === 'cursor') {
      if (draggingElement.type === 'place') {
        setPlaces(places.map(p => 
          p.id === draggingElement.id 
            ? { ...p, x: x - draggingOffset.x, y: y - draggingOffset.y }
            : p
        ));
      } else if (draggingElement.type === 'transition') {
        setTransitions(transitions.map(t =>
          t.id === draggingElement.id
            ? { ...t, x: x - draggingOffset.x, y: y - draggingOffset.y }
            : t
        ));
      }
    }

    // Handle control point dragging
    if (draggingControlPoint) {
      setArcs(arcs.map((arc, arcIdx) => {
        if (arcIdx !== draggingControlPoint.arcIdx) return arc;
        const updatedPoints = [...(arc.controlPoints || [])];
        updatedPoints[draggingControlPoint.pointIdx] = { x, y };
        return { ...arc, controlPoints: updatedPoints };
      }));
    }

    // Arc preview
    if (arcStart) {
      const startX = arcStart.type === 'place' ? arcStart.element.x : arcStart.element.x;
      const startY = arcStart.type === 'place' ? arcStart.element.y : arcStart.element.y;
      setArcPreviewPoints([
        { x: startX, y: startY },
        { x, y }
      ]);
    }
  };

  const handleCanvasMouseDown = (e) => {
    if (tool === 'cursor') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check for place click
      for (const place of places) {
        if (Math.hypot(x - place.x, y - place.y) <= PLACE_RADIUS) {
          setSelectedElement({ type: 'place', id: place.id });
          setDraggingElement({ type: 'place', id: place.id });
          setDraggingOffset({ x: x - place.x, y: y - place.y });
          return;
        }
      }

      // Check for transition click
      for (const trans of transitions) {
        const dist = distancePointToRect(x, y, trans.x - TRANSITION_WIDTH / 2, trans.y - TRANSITION_HEIGHT / 2, TRANSITION_WIDTH, TRANSITION_HEIGHT);
        if (dist <= 5) {
          setSelectedElement({ type: 'transition', id: trans.id });
          setDraggingElement({ type: 'transition', id: trans.id });
          setDraggingOffset({ x: x - trans.x, y: y - trans.y });
          return;
        }
      }

      // Check for arc click
      for (let arcIdx = 0; arcIdx < arcs.length; arcIdx++) {
        const arc = arcs[arcIdx];
        const fromObj = arc.from.type === 'place' ? places.find(p => p.id === arc.from.id) : transitions.find(t => t.id === arc.from.id);
        const toObj = arc.to.type === 'place' ? places.find(p => p.id === arc.to.id) : transitions.find(t => t.id === arc.to.id);
        
        if (fromObj && toObj) {
          const fromX = fromObj.x;
          const fromY = fromObj.y;
          const toX = toObj.x;
          const toY = toObj.y;

          // Check for control point click
          if (arc.controlPoints && arc.controlPoints.length > 0) {
            for (let ptIdx = 0; ptIdx < arc.controlPoints.length; ptIdx++) {
              const pt = arc.controlPoints[ptIdx];
              if (Math.hypot(x - pt.x, y - pt.y) <= 8) {
                setDraggingControlPoint({ arcIdx, pointIdx: ptIdx });
                setSelectedElement({ type: 'arc', id: arc.id });
                return;
              }
            }
          }

          // Check if click is on arc line
          const allPoints = [{ x: fromX, y: fromY }, ...(arc.controlPoints || []), { x: toX, y: toY }];
          for (let i = 0; i < allPoints.length - 1; i++) {
            const p1 = allPoints[i];
            const p2 = allPoints[i + 1];
            const dist = distanceToSegment(x, y, p1.x, p1.y, p2.x, p2.y);
            if (dist <= 8) {
              setSelectedElement({ type: 'arc', id: arc.id });
              return;
            }
          }
        }
      }

      setSelectedElement(null);
    } else if (tool === 'place') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const newPlace = { id: Date.now(), x, y, label: 'P', tokens: 0 };
      setPlaces([...places, newPlace]);
    } else if (tool === 'transition') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const newTransition = { id: Date.now(), x, y, label: 'T' };
      setTransitions([...transitions, newTransition]);
    } else if (tool === 'arc') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check for place/transition click
      for (const place of places) {
        if (Math.hypot(x - place.x, y - place.y) <= PLACE_RADIUS) {
          if (!arcStart) {
            setArcStart({ type: 'place', element: place });
          } else {
            const newArc = {
              id: Date.now(),
              from: arcStart,
              to: { type: 'place', id: place.id },
              label: '1',
              controlPoints: []
            };
            setArcs([...arcs, newArc]);
            setArcStart(null);
          }
          return;
        }
      }

      for (const trans of transitions) {
        const dist = distancePointToRect(x, y, trans.x - TRANSITION_WIDTH / 2, trans.y - TRANSITION_HEIGHT / 2, TRANSITION_WIDTH, TRANSITION_HEIGHT);
        if (dist <= 5) {
          if (!arcStart) {
            setArcStart({ type: 'transition', element: trans });
          } else {
            const newArc = {
              id: Date.now(),
              from: arcStart,
              to: { type: 'transition', id: trans.id },
              label: '1',
              controlPoints: []
            };
            setArcs([...arcs, newArc]);
            setArcStart(null);
          }
          return;
        }
      }

      if (arcStart) {
        setEdgePreviewPoints([...edgePreviewPoints, { x, y }]);
      }
    } else if (tool === 'addTokens') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      for (const place of places) {
        if (Math.hypot(x - place.x, y - place.y) <= PLACE_RADIUS) {
          setPlaces(places.map(p => 
            p.id === place.id ? { ...p, tokens: p.tokens + 1 } : p
          ));
          return;
        }
      }
    }
  };

  const handleCanvasMouseUp = () => {
    setDraggingElement(null);
    setDraggingControlPoint(null);
  };

  // ============ TOOLBAR HANDLERS ============

  const handleDeleteSelected = () => {
    if (!selectedElement) return;
    
    if (selectedElement.type === 'place') {
      setPlaces(places.filter(p => p.id !== selectedElement.id));
      setArcs(arcs.filter(a => 
        !(a.from.id === selectedElement.id || a.to.id === selectedElement.id)
      ));
    } else if (selectedElement.type === 'transition') {
      setTransitions(transitions.filter(t => t.id !== selectedElement.id));
      setArcs(arcs.filter(a => 
        !(a.from.id === selectedElement.id || a.to.id === selectedElement.id)
      ));
    } else if (selectedElement.type === 'arc') {
      setArcs(arcs.filter(a => a.id !== selectedElement.id));
    }
    setSelectedElement(null);
  };

  const handleEditLabel = () => {
    if (selectedElement) {
      setEditingLabel(selectedElement);
    }
  };

  const handleLabelChange = (newLabel) => {
    if (!editingLabel) return;
    
    if (editingLabel.type === 'place') {
      setPlaces(places.map(p => p.id === editingLabel.id ? { ...p, label: newLabel } : p));
    } else if (editingLabel.type === 'transition') {
      setTransitions(transitions.map(t => t.id === editingLabel.id ? { ...t, label: newLabel } : t));
    } else if (editingLabel.type === 'arc') {
      setArcs(arcs.map(a => a.id === editingLabel.id ? { ...a, label: newLabel } : a));
    }
    setEditingLabel(null);
  };

  const handleExportJSON = () => {
    const diagram = {
      name: diagramName,
      places,
      transitions,
      arcs
    };
    const json = JSON.stringify(diagram, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${diagramName}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const diagram = JSON.parse(event.target.result);
        setDiagramName(diagram.name || '');
        setPlaces(diagram.places || []);
        setTransitions(diagram.transitions || []);
        setArcs(diagram.arcs || []);
      } catch (err) {
        alert('Eroare la importul diagramei: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleExportSVG = () => {
    if (places.length === 0 && transitions.length === 0) {
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    places.forEach(p => {
      minX = Math.min(minX, p.x - PLACE_RADIUS);
      minY = Math.min(minY, p.y - PLACE_RADIUS);
      maxX = Math.max(maxX, p.x + PLACE_RADIUS);
      maxY = Math.max(maxY, p.y + PLACE_RADIUS);
    });

    transitions.forEach(t => {
      minX = Math.min(minX, t.x - TRANSITION_WIDTH / 2);
      minY = Math.min(minY, t.y - TRANSITION_HEIGHT / 2);
      maxX = Math.max(maxX, t.x + TRANSITION_WIDTH / 2);
      maxY = Math.max(maxY, t.y + TRANSITION_HEIGHT / 2);
    });

    const padding = 40;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = maxX - minX;
    const height = maxY - minY;

    let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
      <polygon points="0 0, 10 3, 0 6" fill="#5b21b6" stroke="#5b21b6" stroke-width="0.5"/>
    </marker>
  </defs>
`;

    // Draw arcs
    arcs.forEach(arc => {
      const fromObj = arc.from.type === 'place' 
        ? places.find(p => p.id === arc.from.id)
        : transitions.find(t => t.id === arc.from.id);
      const toObj = arc.to.type === 'place'
        ? places.find(p => p.id === arc.to.id)
        : transitions.find(t => t.id === arc.to.id);

      if (fromObj && toObj) {
        const fromX = fromObj.x - minX;
        const fromY = fromObj.y - minY;
        const toX = toObj.x - minX;
        const toY = toObj.y - minY;

        let pathD;
        if (arc.controlPoints && arc.controlPoints.length > 0) {
          const allPoints = [
            { x: fromX, y: fromY },
            ...arc.controlPoints.map(p => ({ x: p.x - minX, y: p.y - minY })),
            { x: toX, y: toY }
          ];
          pathD = pointsToSmoothPath(allPoints);
        } else {
          pathD = `M ${fromX},${fromY} L ${toX},${toY}`;
        }

        svg += `  <path d="${pathD}" stroke="#7c3aed" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>\n`;
      }
    });

    // Draw places
    places.forEach(p => {
      const x = p.x - minX;
      const y = p.y - minY;
      svg += `  <circle cx="${x}" cy="${y}" r="${PLACE_RADIUS}" fill="none" stroke="#5b21b6" stroke-width="2"/>\n`;
      svg += `  <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-family="Arial" fill="#5b21b6" font-weight="bold">${p.label}</text>\n`;
      
      // Draw tokens
      if (p.tokens > 0) {
        const tokenRadius = TOKEN_RADIUS;
        for (let i = 0; i < p.tokens; i++) {
          const angle = (i / p.tokens) * 2 * Math.PI;
          const tx = x + Math.cos(angle) * 12;
          const ty = y + Math.sin(angle) * 12;
          svg += `  <circle cx="${tx}" cy="${ty}" r="${tokenRadius}" fill="#5b21b6"/>\n`;
        }
      }
    });

    // Draw transitions
    transitions.forEach(t => {
      const x = t.x - minX;
      const y = t.y - minY;
      svg += `  <rect x="${x - TRANSITION_WIDTH / 2}" y="${y - TRANSITION_HEIGHT / 2}" width="${TRANSITION_WIDTH}" height="${TRANSITION_HEIGHT}" fill="none" stroke="#5b21b6" stroke-width="2" rx="4"/>\n`;
      svg += `  <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-family="Arial" fill="#5b21b6" font-weight="bold">${t.label}</text>\n`;
    });

    svg += '</svg>';

    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${diagramName}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ============ RENDERING ============

  const renderCanvas = () => {
    return (
      <svg
        ref={canvasRef}
        style={{ 
          border: 'none', 
          cursor: tool === 'cursor' ? 'default' : 'crosshair', 
          display: 'block',
          width: '100%',
          height: '100%'
        }}
        onMouseMove={handleCanvasMouseMove}
        onMouseDown={handleCanvasMouseDown}
        onMouseUp={handleCanvasMouseUp}
        onMouseLeave={handleCanvasMouseUp}
      >
        {/* Draw arcs */}
        {arcs.map((arc) => {
          const fromObj = arc.from.type === 'place'
            ? places.find(p => p.id === arc.from.id)
            : transitions.find(t => t.id === arc.from.id);
          const toObj = arc.to.type === 'place'
            ? places.find(p => p.id === arc.to.id)
            : transitions.find(t => t.id === arc.to.id);

          if (!fromObj || !toObj) return null;

          const fromX = fromObj.x;
          const fromY = fromObj.y;
          const toX = toObj.x;
          const toY = toObj.y;

          let pathD;
          if (arc.controlPoints && arc.controlPoints.length > 0) {
            const allPoints = [{ x: fromX, y: fromY }, ...arc.controlPoints, { x: toX, y: toY }];
            pathD = pointsToSmoothPath(allPoints);
          } else {
            pathD = `M ${fromX},${fromY} L ${toX},${toY}`;
          }

          // Calculate arrow direction
          let dx, dy;
          if (arc.controlPoints && arc.controlPoints.length > 0) {
            const lastPt = arc.controlPoints[arc.controlPoints.length - 1];
            dx = toX - lastPt.x;
            dy = toY - lastPt.y;
          } else {
            dx = toX - fromX;
            dy = toY - fromY;
          }
          const len = Math.hypot(dx, dy);
          const dir = { x: dx / len, y: dy / len };

          // Position arrow before node
          const fromNodeRadius = arc.to.type === 'place' ? PLACE_RADIUS : TRANSITION_HEIGHT / 2;
          const arrowX = toX - dir.x * fromNodeRadius;
          const arrowY = toY - dir.y * fromNodeRadius;
          const arrowPoints = createArrowhead(arrowX, arrowY, dir, 8);

          return (
            <g key={arc.id}>
              <path
                d={pathD}
                stroke={selectedElement?.id === arc.id ? '#dc2626' : '#7c3aed'}
                strokeWidth="2.5"
                fill="none"
                pointerEvents="stroke"
              />
              <polygon
                points={arrowPoints}
                fill="#5b21b6"
                stroke="#5b21b6"
                strokeWidth="0.5"
              />

              {/* Draw control points */}
              {arc.controlPoints && arc.controlPoints.map((pt, idx) => (
                <circle
                  key={`cp-${idx}`}
                  cx={pt.x}
                  cy={pt.y}
                  r="5"
                  fill="#fbbf24"
                  stroke="#b45309"
                  strokeWidth="1.5"
                  style={{ cursor: 'grab' }}
                />
              ))}

              {/* Arc label */}
              {arc.controlPoints && arc.controlPoints.length > 0 ? (
                <text
                  x={arc.controlPoints[Math.floor(arc.controlPoints.length / 2)].x}
                  y={arc.controlPoints[Math.floor(arc.controlPoints.length / 2)].y - 15}
                  textAnchor="middle"
                  fontSize="12"
                  fill="#7c3aed"
                  fontWeight="bold"
                >
                  {arc.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {/* Draw arc preview */}
        {arcPreviewPoints.length > 0 && (
          <line
            x1={arcPreviewPoints[0].x}
            y1={arcPreviewPoints[0].y}
            x2={arcPreviewPoints[arcPreviewPoints.length - 1].x}
            y2={arcPreviewPoints[arcPreviewPoints.length - 1].y}
            stroke="#7c3aed"
            strokeWidth="2"
            strokeDasharray="5,5"
            opacity="0.6"
          />
        )}

        {/* Draw places */}
        {places.map((place) => (
          <g key={place.id}>
            <circle
              cx={place.x}
              cy={place.y}
              r={PLACE_RADIUS}
              fill={selectedElement?.id === place.id ? '#ede9fe' : 'white'}
              stroke={selectedElement?.id === place.id ? '#7c3aed' : '#5b21b6'}
              strokeWidth={selectedElement?.id === place.id ? 3 : 2}
              style={{ cursor: 'pointer' }}
            />
            <text
              x={place.x}
              y={place.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="14"
              fontFamily="Arial"
              fill="#5b21b6"
              fontWeight="bold"
            >
              {place.label}
            </text>

            {/* Draw tokens */}
            {place.tokens > 0 && (
              <>
                {Array.from({ length: place.tokens }).map((_, idx) => {
                  const angle = (idx / place.tokens) * 2 * Math.PI;
                  const tx = place.x + Math.cos(angle) * 12;
                  const ty = place.y + Math.sin(angle) * 12;
                  return (
                    <circle
                      key={`token-${idx}`}
                      cx={tx}
                      cy={ty}
                      r={TOKEN_RADIUS}
                      fill="#5b21b6"
                    />
                  );
                })}
              </>
            )}
          </g>
        ))}

        {/* Draw transitions */}
        {transitions.map((trans) => (
          <g key={trans.id}>
            <rect
              x={trans.x - TRANSITION_WIDTH / 2}
              y={trans.y - TRANSITION_HEIGHT / 2}
              width={TRANSITION_WIDTH}
              height={TRANSITION_HEIGHT}
              fill={selectedElement?.id === trans.id ? '#ede9fe' : 'white'}
              stroke={selectedElement?.id === trans.id ? '#7c3aed' : '#5b21b6'}
              strokeWidth={selectedElement?.id === trans.id ? 3 : 2}
              rx="4"
              style={{ cursor: 'pointer' }}
            />
            <text
              x={trans.x}
              y={trans.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize="14"
              fontFamily="Arial"
              fill="#5b21b6"
              fontWeight="bold"
            >
              {trans.label}
            </text>
          </g>
        ))}
      </svg>
    );
  };

  return (
    <div className="petri-net-editor">
      <div className="editor-header">
        <button onClick={() => navigate('/dashboard')} className="back-button">← Înapoi</button>
        <h1>Rețea Petri</h1>
        <div className="header-actions">
          <button className="btn-primary" onClick={handleSave} disabled={isSaving}>Salvează</button>
          <div className="dropdown-save">
            <button className="btn-secondary">Exportă ▼</button>
            <div className="dropdown-content">
              <button onClick={handleExportSVG}>Export SVG</button>
              <button onClick={handleExportJSON}>Export JSON</button>
            </div>
          </div>
          <button className="btn-secondary" onClick={() => fileInputRef.current && fileInputRef.current.click()}>Importă</button>
          <input
            type="file"
            accept=".json"
            onChange={handleImportJSON}
            style={{ display: 'none' }}
            ref={fileInputRef}
          />
        </div>
      </div>

      <div className="editor-main">
        {/* Sidebar */}
        <div className="editor-sidebar">
          <div className="sidebar-header">
            <h2>Instrumente</h2>
          </div>

          <div className="tools-list">
            <button
              className={`tool-item ${tool === 'cursor' ? 'active' : ''}`}
              onClick={() => { setTool('cursor'); setArcStart(null); }}
              title="Cursor (Select)"
            >
              <span className="tool-label">Cursor</span>
            </button>
            <button
              className={`tool-item ${tool === 'place' ? 'active' : ''}`}
              onClick={() => { setTool('place'); setArcStart(null); }}
              title="Poziție (Loc)"
            >
              <span className="tool-label">Poziție</span>
            </button>
            <button
              className={`tool-item ${tool === 'transition' ? 'active' : ''}`}
              onClick={() => { setTool('transition'); setArcStart(null); }}
              title="Tranziție"
            >
              <span className="tool-label">Tranziție</span>
            </button>
            <button
              className={`tool-item ${tool === 'arc' ? 'active' : ''}`}
              onClick={() => { setTool('arc'); }}
              title="Arc"
            >
              <span className="tool-label">Arc</span>
            </button>
            <button
              className={`tool-item ${tool === 'addTokens' ? 'active' : ''}`}
              onClick={() => { setTool('addTokens'); setArcStart(null); }}
              title="Adaugă tokeni"
            >
              <span className="tool-label">Token</span>
            </button>
          </div>

          <div className="sidebar-separator"></div>

          <div className="tools-list">
            <button 
              className="tool-item" 
              onClick={handleEditLabel} 
              disabled={!selectedElement}
              title="Editează etichetă"
            >
              <span className="tool-label">Editează</span>
            </button>
            <button 
              className="tool-item" 
              onClick={handleDeleteSelected} 
              disabled={!selectedElement}
              title="Șterge element"
            >
              <span className="tool-label">Șterge</span>
            </button>
          </div>

          <div className="sidebar-info">
            <div className="info-section">
              <h3>Statistici</h3>
              <div className="info-item">Poziții: <span className="info-value">{places.length}</span></div>
              <div className="info-item">Tranzitii: <span className="info-value">{transitions.length}</span></div>
              <div className="info-item">Arce: <span className="info-value">{arcs.length}</span></div>
              <div className="info-item">Tokeni: <span className="info-value">{places.reduce((sum, p) => sum + p.tokens, 0)}</span></div>
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="editor-canvas-container">
          <input
            type="text"
            value={diagramName}
            onChange={(e) => setDiagramName(e.target.value)}
            className="diagram-title-input"
            placeholder="Nume Diagramă"
          />
          {renderCanvas()}
        </div>
      </div>

      {/* Label editor modal */}
      {editingLabel && (
        <div className="modal-overlay" onClick={() => setEditingLabel(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Editează etichetă</h3>
            <input
              type="text"
              autoFocus
              defaultValue={
                editingLabel.type === 'place'
                  ? places.find(p => p.id === editingLabel.id)?.label
                  : editingLabel.type === 'transition'
                  ? transitions.find(t => t.id === editingLabel.id)?.label
                  : arcs.find(a => a.id === editingLabel.id)?.label
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLabelChange(e.target.value);
              }}
              onBlur={(e) => handleLabelChange(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ============ HELPER FUNCTION ============

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;

  if (len2 === 0) return Math.hypot(px - x1, py - y1);

  let t = ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  return Math.hypot(px - closestX, py - closestY);
}

export default PetriNetEditor;
