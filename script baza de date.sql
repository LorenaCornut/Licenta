CREATE TABLE users (
    id_user SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tipuri_diagrame (
    id_tip SERIAL PRIMARY KEY,
    nume_tip VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE componente_diagrame (
    id_componenta SERIAL PRIMARY KEY,
    id_tip INT NOT NULL REFERENCES tipuri_diagrame(id_tip) ON DELETE CASCADE,
    nume_componenta VARCHAR(100) NOT NULL,
    specificatii JSONB 
);

CREATE TABLE legaturi_diagrame (
    id_legatura SERIAL PRIMARY KEY,
    id_tip INT NOT NULL REFERENCES tipuri_diagrame(id_tip) ON DELETE CASCADE,
    nume_legatura VARCHAR(100) NOT NULL,
    specificatii JSONB
);

CREATE TABLE diagrame (
    id_diagrama SERIAL PRIMARY KEY,
    id_user INT NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
    titlu VARCHAR(100) NOT NULL,
    id_tip INT NOT NULL REFERENCES tipuri_diagrame(id_tip),
    data_create TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE componente_existente (
    id_instanta SERIAL PRIMARY KEY,
    id_diagrama INT NOT NULL REFERENCES diagrame(id_diagrama) ON DELETE CASCADE,
    id_componenta INT NOT NULL REFERENCES componente_diagrame(id_componenta),
    continut JSONB, 
    x INT NOT NULL,
    y INT NOT NULL,
	weight INT NOT NULL,
	height INT NOT NULL
);

CREATE TABLE legaturi_existente (
    id_instanta SERIAL PRIMARY KEY,
    id_diagrama INT NOT NULL REFERENCES diagrame(id_diagrama) ON DELETE CASCADE,
    id_legatura INT NOT NULL REFERENCES legaturi_diagrame(id_legatura),
    id_start INT NOT NULL REFERENCES componente_existente(id_instanta) ON DELETE CASCADE,
    id_end INT NOT NULL REFERENCES componente_existente(id_instanta) ON DELETE CASCADE,
    text JSONB, 
    puncte_intermediare JSONB 
);

CREATE TABLE colaboratori (
    id_diagrama INT NOT NULL REFERENCES diagrame(id_diagrama) ON DELETE CASCADE,
    id_user INT NOT NULL REFERENCES users(id_user) ON DELETE CASCADE,
    rol VARCHAR(20) DEFAULT 'editor', -- ex: editor, viewer
    PRIMARY KEY (id_diagrama, id_user)
);

SELECT * FROM users;