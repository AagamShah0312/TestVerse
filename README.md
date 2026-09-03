# TestVerse

## Run locally (Windows)

Open **Command Prompt** in `backend` (the Conda activation script is a batch file), then run:

```bat
call C:\Users\cebc\anaconda3\Scripts\activate.bat
cd /d "E:\Clg Projects Only\Projects\Testverse\backend"
set DEBUG=True
pip install -r requirements.txt
if not exist .env copy .env.example .env
python manage.py migrate
python manage.py runserver
```

In a second terminal, serve the frontend:

```bat
cd /d "E:\Clg Projects Only\Projects\Testverse\frontend"
python -m http.server 3000
```

Open `http://localhost:3000`. The API is at `http://localhost:8000`; the health check is `/health/`.

In PowerShell, run `cmd /c "call C:\Users\cebc\anaconda3\Scripts\activate.bat && set DEBUG=True && python manage.py runserver"` instead. Calling `activate` directly from PowerShell does not update that shell's PATH.

## Docker

Create `backend/.env` from `backend/.env.example`, set a real `SECRET_KEY`, then from the repository root run:

```sh
docker compose up --build
```

Open `http://localhost:3000`. Stop with `docker compose down`. This Compose setup runs the frontend, Django API, and Redis. It uses SQLite for development; use PostgreSQL through `DATABASE_URL` for persistent production data.

## Deploy

### Render (API)

Create a Blueprint from this repository; Render reads `render.yaml`. Set `DATABASE_URL` to a managed PostgreSQL connection string and set `CORS_ALLOWED_ORIGINS` to the final Vercel URL, for example `https://your-project.vercel.app`. If Celery is needed in production, also provision Redis and set the two Celery URLs.

### Vercel (frontend)

Import the same repository, set the **Root Directory** to `frontend`, and deploy as a static site. `vercel.json` rewrites `/api/*` requests to `https://testverse-backend.onrender.com`. If your Render service has another hostname, replace that hostname in `vercel.json` before deployment. Then add the Vercel deployment URL to Render's `CORS_ALLOWED_ORIGINS`.
