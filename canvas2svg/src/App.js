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
      </Routes>
    </Router>
  );
}

export default App;
