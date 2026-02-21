import React, { useState } from 'react';
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
  CLASS: { label: 'Class', icon: '□', color: '#e8f4f8' },
  INTERFACE: { label: 'Interface', icon: '◇', color: '#fff4e6' },
  INHERITANCE: { label: 'Inheritance', icon: '→', color: '#f0f0f0' },
  COMPOSITION: { label: 'Composition', icon: '◆', color: '#f0f0f0' },
  ASSOCIATION: { label: 'Association', icon: '—', color: '#f0f0f0' }
};

// Elemente pentru Sequence Diagram
const SEQUENCE_ELEMENTS = {
  ACTOR: { label: 'Actor', icon: '🧑', color: '#e8f4f8' },
  OBJECT: { label: 'Object', icon: '█', color: '#e8f4f8' },
  MESSAGE: { label: 'Message', icon: '→', color: '#f0f0f0' },
  LOOP: { label: 'Loop', icon: '⟲', color: '#fff4e6' },
  ALT: { label: 'Alt', icon: '⟂', color: '#fff4e6' }
};

// Elemente pentru Use Case Diagram
const USE_CASE_ELEMENTS = {
  ACTOR: { label: 'Actor', icon: '🧑', color: '#e8f4f8' },
  USE_CASE: { label: 'Use Case', icon: '●', color: '#fff4e6' },
  SYSTEM: { label: 'System', icon: '◻', color: '#f0f0f0' },
  INCLUDE: { label: 'Include', icon: '⊳', color: '#f0f0f0' },
  EXTEND: { label: 'Extend', icon: '✓', color: '#f0f0f0' }
};

function UMLEditor() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState('CLASS');
  const [elements, setElements] = useState([]);
  const [draggedElement, setDraggedElement] = useState(null);
  const [draggingInCanvas, setDraggingInCanvas] = useState(false);
  const [editingElement, setEditingElement] = useState(null);
  const [editName, setEditName] = useState('');

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
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newElement = {
      id: Date.now(),
      type: draggedElement,
      x,
      y,
      name: `${getElementsList()[draggedElement].label} ${elements.length + 1}`,
      width: 120,
      height: 80
    };

    setElements([...elements, newElement]);
    setDraggedElement(null);
  };

  const handleCanvasDragLeave = () => {
    setDraggingInCanvas(false);
  };

  const handleElementClick = (element) => {
    setEditingElement(element.id);
    setEditName(element.name);
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

  const handleDeleteElement = (id) => {
    setElements(elements.filter(el => el.id !== id));
    setEditingElement(null);
  };

  const elementsList = getElementsList();

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
          <button className="btn-secondary">Export</button>
        </div>
      </div>

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
                  setEditingElement(null);
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
                className="element-item"
                draggable
                onDragStart={(e) => handleDragStart(e, key)}
                style={{ backgroundColor: value.color }}
              >
                <span className="element-icon">{value.icon}</span>
                <span className="element-label">{value.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Canvas Area */}
        <div
          className={`uml-canvas ${draggingInCanvas ? 'drag-over' : ''}`}
          onDragOver={handleCanvasDragOver}
          onDrop={handleCanvasDrop}
          onDragLeave={handleCanvasDragLeave}
        >
          <div className="canvas-hint">Drag elements here to create diagram</div>

          {/* Rendered Elements */}
          {elements.map((el) => (
            <div
              key={el.id}
              className={`uml-element ${editingElement === el.id ? 'editing' : ''}`}
              style={{
                left: `${el.x}px`,
                top: `${el.y}px`,
                width: `${el.width}px`,
                height: `${el.height}px`,
                backgroundColor: elementsList[el.type].color
              }}
              onClick={() => handleElementClick(el)}
            >
              {editingElement === el.id ? (
                <div className="edit-form">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') handleSaveName();
                    }}
                    autoFocus
                  />
                  <button onClick={handleSaveName}>✓</button>
                  <button onClick={() => handleDeleteElement(el.id)}>✕</button>
                </div>
              ) : (
                <div className="element-content">
                  <span className="element-icon">{elementsList[el.type].icon}</span>
                  <p>{el.name}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right Panel - Properties */}
        <div className="uml-properties">
          <h3>Properties</h3>
          {editingElement ? (
            <div className="properties-panel">
              <label>Element Name:</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
              <button className="btn-primary" onClick={handleSaveName}>
                Update
              </button>
              <button
                className="btn-danger"
                onClick={() => handleDeleteElement(editingElement)}
              >
                Delete
              </button>
            </div>
          ) : (
            <p style={{ color: '#999' }}>Click an element to edit</p>
          )}

          <h3 style={{ marginTop: '20px' }}>Diagram Info</h3>
          <div className="diagram-info">
            <p><strong>Type:</strong> {UML_TYPES[selectedType]}</p>
            <p><strong>Elements:</strong> {elements.length}</p>
            <p><strong>Diagram Size:</strong> 800x600</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UMLEditor;
