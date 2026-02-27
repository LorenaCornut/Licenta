import React, { useState, useRef, useEffect } from 'react';
import './UMLEditor.css';
import { useNavigate } from 'react-router-dom';

// Tipuri de diagrame UML
const UML_TYPES = {
  CLASS: 'Class Diagram',
  SEQUENCE: 'Sequence Diagram',
  USE_CASE: 'Use Case Diagram',
  STATE: 'State Machine',
  ACTIVITY: 'Activity Diagram'
};

// Elemente pentru Class Diagram
const CLASS_ELEMENTS = {
  CLASS: { label: 'Class', icon: '□', color: '#e8f4f8', isNode: true },
  INTERFACE: { label: 'Interface', icon: '◇', color: '#fff4e6', isNode: true },
  INHERITANCE: { label: 'Inheritance', icon: '→', color: '#f0f0f0', isConnection: true },
  COMPOSITION: { label: 'Composition', icon: '◆', color: '#f0f0f0', isConnection: true },
  ASSOCIATION: { label: 'Association', icon: '—', color: '#f0f0f0', isConnection: true }
};

// Elemente pentru Sequence Diagram
const SEQUENCE_ELEMENTS = {
  ACTOR: { label: 'Actor', icon: '🧑', color: '#e8f4f8', isNode: true },
  OBJECT: { label: 'Object', icon: '█', color: '#e8f4f8', isNode: true },
  MESSAGE: { label: 'Message', icon: '→', color: '#f0f0f0', isConnection: true },
  LOOP: { label: 'Loop', icon: '⟲', color: '#fff4e6', isNode: true },
  ALT: { label: 'Alt', icon: '⟂', color: '#fff4e6', isNode: true }
};

// Elemente pentru Use Case Diagram
const USE_CASE_ELEMENTS = {
  ACTOR: { label: 'Actor', icon: '🧑', color: '#e8f4f8', isNode: true },
  USE_CASE: { label: 'Use Case', icon: '●', color: '#fff4e6', isNode: true },
  SYSTEM: { label: 'System', icon: '◻', color: '#f0f0f0', isNode: true },
  INCLUDE: { label: 'Include', icon: '⊳', color: '#f0f0f0', isConnection: true },
  EXTEND: { label: 'Extend', icon: '✓', color: '#f0f0f0', isConnection: true }
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
  
  // Pentru crearea conexiunilor
  const [connectionMode, setConnectionMode] = useState(null); // tipul de conexiune
  const [connectionStart, setConnectionStart] = useState(null); // elementul de start

  // Pentru editare inline atribute/metode
  const [editingMember, setEditingMember] = useState(null); // {elementId, type: 'attribute'|'method', index}
  const [editMemberValue, setEditMemberValue] = useState('');

  // Pentru resize elemente
  const [resizing, setResizing] = useState(null); // {elementId, direction, startX, startY, startWidth, startHeight, startElX, startElY}

  const getElementsList = () => {
    switch (selectedType) {
      case 'CLASS':
        return CLASS_ELEMENTS;
      case 'SEQUENCE':
        return SEQUENCE_ELEMENTS;
      case 'USE_CASE':
        return USE_CASE_ELEMENTS;
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
    
    const newWidth = isClassType ? 150 : 120;
    const newHeight = isClassType ? 120 : 80;
    
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
      attributes: isClassType ? [] : undefined,
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

  // Click pe element - selectare sau conexiune
  const handleElementClick = (e, element) => {
    e.stopPropagation();
    
    // Dacă suntem în modul conexiune
    if (connectionMode) {
      if (!connectionStart) {
        // Setăm elementul de start
        setConnectionStart(element.id);
      } else if (connectionStart !== element.id) {
        // Creăm conexiunea
        const newConnection = {
          id: Date.now(),
          type: connectionMode,
          from: connectionStart,
          to: element.id,
          label: getElementsList()[connectionMode].label
        };
        setConnections([...connections, newConnection]);
        setConnectionMode(null);
        setConnectionStart(null);
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
      
      setElements(elements.map(el => 
        el.id === movingElement 
          ? { ...el, x: newX, y: newY }
          : el
      ));
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
  }, [movingElement, moveOffset, elements]);

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
      
      const minWidth = 100;
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

  // Handler pentru export JSON
  const handleSaveJSON = () => {
    const data = JSON.stringify({ elements, connections }, null, 2);
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
      <marker id='arrowTriangle' markerWidth='16' markerHeight='16' refX='16' refY='8' orient='auto'>
        <path d='M0,0 L0,16 L16,8 z' fill='white' stroke='#8b4513' stroke-width='2'/>
      </marker>
      <marker id='arrowDiamond' markerWidth='16' markerHeight='16' refX='16' refY='8' orient='auto'>
        <path d='M0,8 L8,0 L16,8 L8,16 z' fill='#8b4513' stroke='#8b4513'/>
      </marker>
      <marker id='arrowSimple' markerWidth='12' markerHeight='12' refX='10' refY='6' orient='auto'>
        <path d='M0,0 L12,6 L0,12' fill='none' stroke='#8b4513' stroke-width='2'/>
      </marker>
      <marker id='arrowOpen' markerWidth='12' markerHeight='12' refX='10' refY='6' orient='auto'>
        <path d='M0,0 L12,6 L0,12' fill='none' stroke='#8b4513' stroke-width='2'/>
      </marker>
    </defs>\n`;

    // Funcție identică cu getConnectionPoints din editor
    function getConnectionPointsSVG(conn) {
      const fromEl = elements.find(el => el.id === conn.from);
      const toEl = elements.find(el => el.id === conn.to);
      if (!fromEl || !toEl) return null;
      const fromHeight = fromEl.height || 120;
      const toHeight = toEl.height || 120;
      const fromX = fromEl.x + (fromEl.width || 150) / 2;
      const fromY = fromEl.y + fromHeight / 2;
      const toX = toEl.x + (toEl.width || 150) / 2;
      const toY = toEl.y + toHeight / 2;
      const angle = Math.atan2(toY - fromY, toX - fromX);
      const startX = fromX + Math.cos(angle) * ((fromEl.width || 150) / 2);
      const startY = fromY + Math.sin(angle) * (fromHeight / 2);
      let markerOffset = 0;
      if (conn.type === 'INHERITANCE' || conn.type === 'COMPOSITION') markerOffset = 16;
      if (conn.type === 'ASSOCIATION') markerOffset = 12;
      if (conn.type === 'INCLUDE' || conn.type === 'EXTEND') markerOffset = 12;
      const endX = toX - Math.cos(angle) * ((toEl.width || 150) / 2 + markerOffset);
      const endY = toY - Math.sin(angle) * (toHeight / 2 + markerOffset);
      return { startX, startY, endX, endY };
    }

    // Conexiuni
    connections.forEach(conn => {
      const points = getConnectionPointsSVG(conn);
      if (!points) return;
      let marker = '';
      if (conn.type === 'INHERITANCE') marker = 'url(#arrowTriangle)';
      else if (conn.type === 'COMPOSITION') marker = 'url(#arrowDiamond)';
      else if (conn.type === 'ASSOCIATION') marker = 'url(#arrowSimple)';
      else if (conn.type === 'INCLUDE' || conn.type === 'EXTEND') marker = 'url(#arrowOpen)';
      else marker = 'url(#arrowSimple)';
      svg += `<line x1='${points.startX}' y1='${points.startY}' x2='${points.endX}' y2='${points.endY}' stroke='#8b4513' stroke-width='2' marker-end='${marker}' />\n`;
    });

    // Clase UML
    elements.forEach(el => {
      if (el.type !== 'CLASS' && el.type !== 'INTERFACE') return;
      const w = el.width || 150;
      const h = el.height || 120;
      const x = el.x;
      const y = el.y;
      // Box
      svg += `<rect x='${x}' y='${y}' width='${w}' height='${h}' rx='6' fill='#fffef0' stroke='#8b4513' stroke-width='2'/>\n`;
      // Header
      svg += `<rect x='${x}' y='${y}' width='${w}' height='32' fill='#fff7e6' stroke='#8b4513' stroke-width='1'/>\n`;
      svg += `<text x='${x + w / 2}' y='${y + 22}' font-size='18' font-family='monospace' font-weight='bold' text-anchor='middle' fill='#222'>${el.name}</text>\n`;
      // Linie sub header
      svg += `<line x1='${x}' y1='${y + 32}' x2='${x + w}' y2='${y + 32}' stroke='#8b4513' stroke-width='1'/>\n`;
      // Atribute
      if (el.attributes && el.attributes.length) {
        el.attributes.forEach((attr, i) => {
          svg += `<text x='${x + 8}' y='${y + 52 + i * 18}' font-size='15' font-family='monospace' fill='#222'>${attr}</text>\n`;
        });
      }
      // Linie sub atribute
      const attrSectionHeight = 32 + (el.attributes ? el.attributes.length * 18 : 0);
      svg += `<line x1='${x}' y1='${y + attrSectionHeight}' x2='${x + w}' y2='${y + attrSectionHeight}' stroke='#8b4513' stroke-width='1'/>\n`;
      // Metode
      if (el.methods && el.methods.length) {
        el.methods.forEach((m, i) => {
          svg += `<text x='${x + 8}' y='${y + attrSectionHeight + 20 + i * 18}' font-size='15' font-family='monospace' fill='#222'>${m}</text>\n`;
        });
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
    
    // Salvează editarea curentă dacă există
    if (editingMember) {
      handleSaveMember(false);
    }
    
    const el = elements.find(elem => elem.id === elementId);
    if (!el) return;
    
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

  // Calculează punctele pentru o conexiune
  const getConnectionPoints = (conn) => {
    const fromEl = elements.find(el => el.id === conn.from);
    const toEl = elements.find(el => el.id === conn.to);
    if (!fromEl || !toEl) return null;

    const fromHeight = getElementHeight(fromEl);
    const toHeight = getElementHeight(toEl);

    // Centrul elementelor
    const fromX = fromEl.x + fromEl.width / 2;
    const fromY = fromEl.y + fromHeight / 2;
    const toX = toEl.x + toEl.width / 2;
    const toY = toEl.y + toHeight / 2;

    // Calculează punctele de pe margine
    const angle = Math.atan2(toY - fromY, toX - fromX);

    const startX = fromX + Math.cos(angle) * (fromEl.width / 2);
    const startY = fromY + Math.sin(angle) * (fromHeight / 2);

    // Offset pentru marker (săgeată)
    let markerOffset = 0;
    if (conn.type === 'INHERITANCE' || conn.type === 'COMPOSITION') markerOffset = 16;
    if (conn.type === 'ASSOCIATION') markerOffset = 12;
    if (conn.type === 'INCLUDE' || conn.type === 'EXTEND') markerOffset = 12;

    const endX = toX - Math.cos(angle) * (toEl.width / 2 + markerOffset);
    const endY = toY - Math.sin(angle) * (toHeight / 2 + markerOffset);

    return { startX, startY, endX, endY, midX: (startX + endX) / 2, midY: (startY + endY) / 2 };
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
    if (!connectionMode) {
      setSelectedElement(null);
      setEditingElement(null);
    }
  };

  // Anulare mod conexiune
  const cancelConnectionMode = () => {
    setConnectionMode(null);
    setConnectionStart(null);
  };

  const elementsList = getElementsList();

  // Handler import JSON
  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
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
            {connectionStart ? ' - Click pe elementul destinație' : ' - Click pe elementul sursă'}
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
                style={{ backgroundColor: value.color }}
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
              <marker id="arrowTriangle" markerWidth="16" markerHeight="16" refX="16" refY="8" orient="auto">
                <path d="M0,0 L0,16 L16,8 z" fill="white" stroke="#8b4513" strokeWidth="2"/>
              </marker>
              {/* Arrow pentru composition (romb plin) */}
              <marker id="arrowDiamond" markerWidth="16" markerHeight="16" refX="16" refY="8" orient="auto">
                <path d="M0,8 L8,0 L16,8 L8,16 z" fill="#8b4513" stroke="#8b4513"/>
              </marker>
              {/* Arrow simplu pentru association */}
              <marker id="arrowSimple" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                <path d="M0,0 L12,6 L0,12" fill="none" stroke="#8b4513" strokeWidth="2"/>
              </marker>
              {/* Arrow deschis pentru include/extend */}
              <marker id="arrowOpen" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto">
                <path d="M0,0 L12,6 L0,12" fill="none" stroke="#8b4513" strokeWidth="2"/>
              </marker>
            </defs>

            {connections.map((conn) => {
              const points = getConnectionPoints(conn);
              if (!points) return null;
              
              const isDashed = conn.type === 'INCLUDE' || conn.type === 'EXTEND';
              
              return (
                <g key={conn.id} className="connection-group">
                  <line
                    x1={points.startX}
                    y1={points.startY}
                    x2={points.endX}
                    y2={points.endY}
                    stroke="#8b4513"
                    strokeWidth="2"
                    strokeDasharray={isDashed ? "5,5" : "none"}
                    markerEnd={getArrowMarker(conn.type)}
                    className="connection-line"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Șterge conexiunea ${conn.label}?`)) {
                        handleDeleteConnection(conn.id);
                      }
                    }}
                  />
                  {/* Label pe conexiune */}
                  <text
                    x={points.midX}
                    y={points.midY - 8}
                    textAnchor="middle"
                    className="connection-label"
                    fill="#8b4513"
                    fontSize="11"
                  >
                    {conn.type === 'INCLUDE' ? '«include»' : 
                     conn.type === 'EXTEND' ? '«extend»' : ''}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Rendered Elements */}
          {elements.map((el) => {
            const isClassType = el.type === 'CLASS' || el.type === 'INTERFACE';
            
            return (
              <div
                key={el.id}
                className={`uml-element ${isClassType ? 'uml-class-element' : ''} ${selectedElement === el.id ? 'selected' : ''} ${editingElement === el.id ? 'editing' : ''} ${connectionStart === el.id ? 'connection-source' : ''} ${movingElement === el.id ? 'moving' : ''}`}
                style={{
                  left: `${el.x}px`,
                  top: `${el.y}px`,
                  width: `${el.width}px`,
                  minHeight: `${el.height}px`,
                  backgroundColor: isClassType ? '#fffef0' : (elementsList[el.type]?.color || '#f0f0f0')
                }}
                onClick={(e) => handleElementClick(e, el)}
                onDoubleClick={(e) => handleElementDoubleClick(e, el)}
                onMouseDown={(e) => handleElementMouseDown(e, el)}
              >
                {isClassType ? (
                  // Renderare clasă UML cu 3 secțiuni
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
                  // Renderare element normal
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
                {isClassType && (
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
