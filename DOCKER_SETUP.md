# Licenta - UML Diagram Editor - Docker Setup

## Cerințe Preliminare

- Docker și Docker Compose instalate
- Git (opțional, pentru a clona repo)

## Pornire Rapidă

### 1. Configurare Environment (Opțional)

Copiază fișierul `.env.example` la `.env` și personalizează-l dacă vrei să schimbi porturi sau credențiale:

```bash
cp .env.example .env
```

Fișierul `.env.example` conține valorile implicite:
```
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=licenta_db
DB_PORT=5432
NODE_ENV=production
BACKEND_PORT=5000
FRONTEND_PORT=3000
```

### 2. Pornire Serviciilor

Din rădăcina proiectului (`c:\Licenta`), rulează:

```bash
docker compose up
```

Sau dacă vrei să compilezi imagini noi:

```bash
docker compose up --build
```

### 3. Acces la Aplicație

După ce containerele pornesc (3-5 minute prima oară):

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000/api
- **PostgreSQL**: localhost:5432

Poți vedea status-ul containerelor cu:

```bash
docker compose ps
```

## Servicii Disponibile

### PostgreSQL (postgres)
- **Port**: 5432 (implicit, configurabil cu `DB_PORT`)
- **Username**: postgres (implicit, configurabil cu `DB_USER`)
- **Password**: postgres (implicit, configurabil cu `DB_PASSWORD`)
- **Database**: licenta_db (implicit, configurabil cu `DB_NAME`)
- **Volume**: `postgres_data` - persistă datele între restarts

**Baza de date se inițializează automat cu `script baza de date.sql`**

### Backend API (Node.js)
- **Port**: 5000 (implicit, configurabil cu `BACKEND_PORT`)
- **Endpoint**: http://localhost:5000/api
- **Se conectează automat la PostgreSQL din container**

### Frontend (React via Nginx)
- **Port**: 3000 (implicit, configurabil cu `FRONTEND_PORT`)
- **URL**: http://localhost:3000
- **Nginx proxy-fică automat `/api/` la backend**

## Comenzi Utile

### Oprire servicii
```bash
docker compose down
```

### Oprire + ștergere volume (șterg și datele din baza de date)
```bash
docker compose down -v
```

### Rebuild imagini
```bash
docker compose up --build
```

### Vizualizare logs din toate containerele
```bash
docker compose logs -f
```

### Logs din container specific
```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f postgres
```

### Executa comenzi în container
```bash
# Acces la terminal PostgreSQL
docker compose exec postgres psql -U postgres -d licenta_db

# Acces la terminal Node backend
docker compose exec backend sh

# Acces la container Nginx
docker compose exec frontend sh
```

## Troubleshooting

### Frontend nu se conectează la backend
Asigură-te că proxy-ul Nginx este configurat corect în `canvas2svg/nginx.conf`. Ar trebui să ai:
```nginx
location /api/ {
    proxy_pass http://backend:5000;
}
```

### PostgreSQL nu pornește
Verifică logs:
```bash
docker compose logs postgres
```

Poți șterge volumul și restarta:
```bash
docker compose down -v
docker compose up
```

### Porturi deja în uz
Dacă porturile 3000, 5000, 5432 sunt ocupate, modifică `.env`:
```
FRONTEND_PORT=3001
BACKEND_PORT=5001
DB_PORT=5433
```

### Rebuild incomplet
Forțează rebuild complet:
```bash
docker compose down -v
docker compose up --build
```

## Structura Directoarelor

```
c:\Licenta\
├── docker-compose.yml          # Orchestrare servicii
├── .env.example                # Template environment
├── .dockerignore               # Fișiere excludse din Docker
│
├── backend/
│   ├── Dockerfile              # Build Node.js backend
│   ├── .dockerignore           # Exclude în build
│   ├── package.json
│   └── src/
│       ├── app.js              # Express server
│       ├── db.js               # Conexiune PostgreSQL (actualizat cu env vars)
│       └── ...
│
├── canvas2svg/
│   ├── Dockerfile              # Build React + Nginx
│   ├── .dockerignore           # Exclude în build
│   ├── nginx.conf              # Config Nginx (proxy API)
│   ├── package.json
│   ├── src/
│   ├── public/
│   └── ...
│
├── script baza de date.sql     # Init script pentru PostgreSQL
└── main                        # Git file (ignorat)
```

## Deployment pe Server

Pentru deployment pe un server Linux:

1. Instalează Docker și Docker Compose
2. Copiază proiectul
3. Setează variabile în `.env`:
   ```bash
   NODE_ENV=production
   DB_PASSWORD=<strong-password>
   ```
4. Rulează:
   ```bash
   docker compose up -d
   ```

## Notes Importante

- **Imagini Multi-stage**: Frontend folosește build stage (Node) + production stage (Nginx)
- **Health Checks**: Fiecare serviciu are health check pentru monitorizare
- **Networking**: Containerele comunică via `licenta_network` bridge
- **Volumes**: Doar PostgreSQL are volume persistent - frontend și backend sunt stateless
- **CORS**: Backend are CORS enabled pentru front-end
- **Nginx Gzip**: Frontend comprimă răspunsuri pentru performanță

---

**Created**: 2026-06-07  
**Docker Compose Version**: 3.8  
**Tested with**: Docker Engine 24.0+, Docker Compose 2.20+
