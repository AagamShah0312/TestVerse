# Manual Deployment Guide for Render

## Prerequisites
1. Virtual environment activated
2. All dependencies installed
3. .env file configured with Render database URL

## Step-by-Step Deployment Process

### 1. Activate Virtual Environment
```bash
cd /Users/thakarkavy/Developer/TestVerse/backend
source venv/bin/activate  # or however you activate your virtual environment
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Test Database Connection
```bash
python manage.py shell -c "
import os
import django
from django.conf import settings
from django.db import connections

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'exam_system.settings')
django.setup()

try:
    db_conn = connections['default']
    c = db_conn.cursor()
    c.execute('SELECT 1')
    print('✅ Database connection successful!')
    c.close()
except Exception as e:
    print(f'❌ Database connection failed: {e}')
"
```

### 4. Run Migrations
```bash
python manage.py makemigrations
python manage.py migrate
```

### 5. Collect Static Files
```bash
python manage.py collectstatic --noinput
```

### 6. Create Superuser
```bash
python manage.py createsuperuser
# Username: admin
# Email: admin@testverse.com
# Password: admin123 (or your preferred password)
```

### 7. Test Local Server
```bash
python manage.py runserver
# Visit http://localhost:8000/health/ to verify
```

## Render Deployment Steps

### 1. Push Code to GitHub
```bash
git init
git add .
git commit -m "Initial commit for Render deployment"
git remote add origin https://github.com/yourusername/testverse.git
git push -u origin main
```

### 2. Create Render Services

#### Web Service Configuration:
- **Name**: testverse-backend
- **Runtime**: Python 3
- **Repository**: Your GitHub repository
- **Branch**: main
- **Root Directory**: backend/
- **Build Command**: `pip install -r requirements.txt && python manage.py collectstatic --noinput`
- **Start Command**: `gunicorn exam_system.wsgi:application --bind 0.0.0.0:$PORT`

#### Environment Variables in Render Dashboard:
```
DATABASE_URL=postgresql://testverse_database_user:qG5mA1ZAv0ROiweT2kW5Q3ispSkcK8Kw@dpg-d67e79er433s73f4ertg-a.oregon-postgres.render.com:5432/testverse_database?sslmode=require
SECRET_KEY=your-very-secure-secret-key-here-change-this-in-production
DEBUG=False
ALLOWED_HOSTS=.onrender.com,your-custom-domain.com
```

### 3. Deploy
1. Click "Create Web Service" in Render
2. Select your repository
3. Configure as above
4. Click "Create Web Service"
5. Wait for deployment to complete

### 4. Post-Deployment Verification
1. Visit your deployed URL: `https://your-app-name.onrender.com/health/`
2. Access Django Admin: `https://your-app-name.onrender.com/admin/`
3. Test API endpoints: `https://your-app-name.onrender.com/api/v1/`

## Troubleshooting

### Common Issues:

1. **Database Connection Failed**:
   - Verify DATABASE_URL format in Render dashboard
   - Ensure `?sslmode=require` is included
   - Check if database is paused (unpause if needed)

2. **Module Not Found**:
   - Ensure all dependencies are in requirements.txt
   - Check Python version compatibility

3. **Static Files Not Loading**:
   - Verify Whitenoise is configured in settings.py
   - Check STATIC_ROOT and STATIC_URL settings

4. **Application Crashes**:
   - Check Render logs for error messages
   - Verify WSGI application path is correct
   - Ensure all environment variables are set

## Health Check Endpoints
- Main health check: `/health/`
- API documentation: `/api/docs/`
- Admin panel: `/admin/`

## Next Steps
1. Set up automatic deployments from GitHub
2. Configure custom domain (optional)
3. Set up monitoring and alerts
4. Test all API endpoints
5. Deploy frontend application