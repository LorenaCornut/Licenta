import React from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';

import Home from './Home';
import CreateAccount from './CreateAccount';
import Login from './Login';
import Help from './Help';
import Info from './Info';
import Dashboard from './Dashboard';
import GraphEditor from './GraphEditor';
import OrientedGraphEditor from './OrientedGraphEditor';
import UMLEditor from './UMLEditor';
import StateEditor from './StateEditor';
import PetriNetEditor from './PetriNetEditor';
import Settings from './Settings';

// Import noii editori UML modularizați
import ClassDiagramEditor from './uml-editors/ClassDiagramEditor';
import SequenceDiagramEditor from './uml-editors/SequenceDiagramEditor';
import UseCaseDiagramEditor from './uml-editors/UseCaseDiagramEditor';
import ComponentDiagramEditor from './uml-editors/ComponentDiagramEditor';
import DeploymentDiagramEditor from './uml-editors/DeploymentDiagramEditor';
import StateDiagramEditor from './uml-editors/StateDiagramEditor';
import ActivityDiagramEditor from './uml-editors/ActivityDiagramEditor';
import ObjectDiagramEditor from './uml-editors/ObjectDiagramEditor';
import CompositeStructureDiagramEditor from './uml-editors/CompositeStructureDiagramEditor';
import StateMachineDiagramEditor from './uml-editors/StateMachineDiagramEditor';

import './App.css';

function HomeWithNav() {
  const navigate = useNavigate();
  return <Home onCreateAccount={() => navigate('/createaccount')} onLogin={() => navigate('/login')} onHelp={() => navigate('/help')} onInfo={() => navigate('/info')} />;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomeWithNav />} />
        <Route path="/createaccount" element={<CreateAccount />} />
        <Route path="/login" element={<Login />} />
        <Route path="/help" element={<Help />} />
        <Route path="/info" element={<Info />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/graph" element={<GraphEditor />} />
        <Route path="/graph/:diagramId" element={<GraphEditor />} />
        <Route path="/orientedgraph" element={<OrientedGraphEditor />} />
        <Route path="/orientedgraph/:diagramId" element={<OrientedGraphEditor />} />
        <Route path="/uml" element={<UMLEditor />} />
        <Route path="/uml/:diagramId" element={<UMLEditor />} />
        <Route path="/state" element={<StateEditor />} />
        <Route path="/state/:diagramId" element={<StateEditor />} />
        <Route path="/petrinet" element={<PetriNetEditor />} />
        <Route path="/petrinet/:diagramId" element={<PetriNetEditor />} />
        <Route path="/settings" element={<Settings />} />
        
        {/* Noile rute pentru editori UML modularizați */}
        <Route path="/uml-editor/class" element={<ClassDiagramEditor />} />
        <Route path="/uml-editor/class/:diagramId" element={<ClassDiagramEditor />} />
        <Route path="/uml-editor/sequence" element={<SequenceDiagramEditor />} />
        <Route path="/uml-editor/sequence/:diagramId" element={<SequenceDiagramEditor />} />
        <Route path="/uml-editor/usecase" element={<UseCaseDiagramEditor />} />
        <Route path="/uml-editor/usecase/:diagramId" element={<UseCaseDiagramEditor />} />
        <Route path="/uml-editor/component" element={<ComponentDiagramEditor />} />
        <Route path="/uml-editor/component/:diagramId" element={<ComponentDiagramEditor />} />
        <Route path="/uml-editor/deployment/:diagramId" element={<DeploymentDiagramEditor />} />
        <Route path="/uml-editor/state/:diagramId" element={<StateDiagramEditor />} />
        <Route path="/uml-editor/activity/:diagramId" element={<ActivityDiagramEditor />} />
        <Route path="/uml-editor/object/:diagramId" element={<ObjectDiagramEditor />} />
        <Route path="/uml-editor/composite/:diagramId" element={<CompositeStructureDiagramEditor />} />
        <Route path="/uml-editor/state-machine" element={<StateMachineDiagramEditor />} />
        <Route path="/uml-editor/state-machine/:diagramId" element={<StateMachineDiagramEditor />} />
      </Routes>
    </Router>
  );
}

export default App;
