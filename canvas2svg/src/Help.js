import React from 'react';
import './Help.css';
import logo from './imagini/logo.png';

function Help() {
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
          <button className="header-btn login" onClick={() => window.location.href = '/info'}>Info</button>
        </div>
      </header>
      <div className="help-content-simple">
        <h2>Ajutor & Instrucțiuni</h2>
        <ol>
          <li><b>Creare cont:</b> Apasă pe butonul "Create Account" din dreapta sus sau de pe pagina principală și completează formularul cu datele tale (username, email, parolă și confirmare parolă). Parolele trebuie să coincidă.</li>
          <li><b>Autentificare:</b> Dacă ai deja cont, apasă pe "Log in" și introdu datele de conectare. Dacă ai uitat parola, contactează administratorul aplicației.</li>
          <li><b>Desenare grafuri/diagrame:</b> După autentificare, vei avea acces la editorul de grafuri, diagrame UML, rețele Petri și automate. Folosește instrumentele din editor pentru a adăuga noduri, muchii, etichete etc.</li>
          <li><b>Export SVG:</b> Poți salva sau descărca desenul tău în format SVG pentru a-l folosi în alte aplicații sau pe web. Apasă pe butonul "Export SVG" din editor.</li>
          <li><b>Ajutor suplimentar:</b> Pentru întrebări sau probleme, folosește această pagină sau contactează administratorul aplicației.</li>
        </ol>
      </div>
    </>
  );
}

export default Help;
