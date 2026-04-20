import React from 'react';
import { useNavigate } from 'react-router-dom';
import '../UMLEditor.css';

function StateDiagramEditor() {
  const navigate = useNavigate();
  return <div className="uml-editor"><div style={{ padding: '1rem', backgroundColor: '#f5f3ff', borderBottom: '1px solid #ddd' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><h2>State Diagram Editor</h2><button onClick={() => navigate('/dashboard')}>← Înapoi</button></div></div><div className="uml-canvas" style={{ flex: 1, position: 'relative', backgroundColor: 'white', overflow: 'auto' }}><div style={{ padding: '2rem', textAlign: 'center', color: '#999' }}><p>🔄 State Diagram Editor [Template]</p></div></div></div>;
}
export default StateDiagramEditor;
