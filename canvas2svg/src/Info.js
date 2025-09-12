import React from 'react';
import './Help.css';
import logo from './imagini/logo.png';

function Info() {
  return (
    <>
      <div className="help-container-bg"></div>
      <header className="help-header">
        <div className="logo-group">
          <img src={logo} alt="Canvas 2 SVG Logo" className="logo-icon" />
          <span className="logo-title">
            Canvas <br />2 SVG
          </span>
        </div>
        <div className="header-actions">
          <button className="header-btn create" onClick={() => window.location.href = '/createaccount'}>Create Account</button>
          <button className="header-btn login" onClick={() => window.location.href = '/login'}>Log in</button>
          <button className="header-btn help" onClick={() => window.location.href = '/help'}>Help</button>
        </div>
      </header>
      <div className="help-content-simple">
        <h2>Informații despre aplicație & concepte</h2>
        <ol>
          <li><b>Despre aplicație:</b> Canvas 2 SVG este o aplicație web pentru desenarea și exportul rapid de grafuri, diagrame UML, rețele Petri și automate, utilă pentru studenți, profesori și dezvoltatori.</li>
          <li><b>Diagrame UML:</b> UML (Unified Modeling Language) este un limbaj standard pentru modelarea și documentarea sistemelor software. Diagramele UML includ diagrame de clase, de secvență, de activitate etc.</li>
          <li><b>Grafuri:</b> Un graf este o structură matematică formată din noduri (vârfuri) și muchii (arce) care leagă aceste noduri. Grafurile sunt folosite pentru a modela rețele, relații și procese.</li>
          <li><b>Contact creator:</b> Lorena Beatrice Cornut - email: <a href="mailto:lorenabeatrice98@gmail.com">lorenabeatrice98@gmail.com</a></li>
        </ol>
      </div>
    </>
  );
}

export default Info;
