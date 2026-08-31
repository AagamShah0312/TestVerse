# Render.com Deployment Configuration

## Services to Create

### 1. Web Service (Django Backend)
- **Name**: testverse-backend
- **Runtime**: Python 3
- **Build Command**: 
  ```
  pip install -r requirements.txt && python manage.py collectstatic --noinput
  ```
- **Start Command**: 
  ```
  gunicorn exam_system.wsgi:application --bind 0.0.0.0:$PORT
  ```

### 2. Database (Already created by you)
- **Name**: testverse-database
- **Type**: PostgreSQL
- **Region**: Oregon (us-west1)

## Environment Variables (Set in Render Dashboard)

```
DATABASE_URL=postgresql://testverse_database_user:qG5mA1ZAv0ROiweT2kW5Q3ispSkcK8Kw@dpg-d67e79er433s73f4ertg-a.oregon-postgres.render.com:5432/testverse_database
SECRET_KEY=your-very-secure-secret-key-here
DEBUG=False
ALLOWED_HOSTS=.onrender.com,your-custom-domain.com
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
```

## Pre-deployment Steps (Run locally)

1. **Make the deployment script executable**:
   ```bash
   chmod +x deploy_to_render.sh
   ```

2. **Run the deployment preparation**:
   ```bash
   ./deploy_to_render.sh
   ```

3. **Or run manually**:
   ```bash
   # Test database connection
   python manage.py shell -c "from django.db import connection; print('Connection successful!')"
   
   # Run migrations
   python manage.py migrate
   
   # Collect static files
   python manage.py collectstatic --noinput
   
   # Create superuser
   python manage.py createsuperuser
   ```

## Post-deployment Steps

1. **Access Django Admin**:
   - URL: https://your-app-name.onrender.com/admin/
   - Login with superuser credentials

2. **Test API Endpoints**:
   - Swagger Docs: https://your-app-name.onrender.com/api/schema/swagger-ui/
   - Redoc Docs: https://your-app-name.onrender.com/api/schema/redoc/

3. **Monitor Logs**:
   - Check Render dashboard for application logs
   - Monitor for any deployment issues

## Troubleshooting

### Common Issues:

1. **Database Connection Failed**:
   - Verify DATABASE_URL format
   - Check if sslmode=require is included
   - Ensure database is not paused on Render

2. **Migration Errors**:
   - Check if all migrations are present
   - Verify model relationships
   - Look at Render logs for specific errors

3. **Static Files Not Loading**:
   - Ensure Whitenoise is configured
   - Check STATIC_ROOT and STATIC_URL settings
   - Verify collectstatic was run

4. **Application Won't Start**:
   - Check gunicorn command syntax
   - Verify WSGI application path
   - Review Render build logs

## Health Check Endpoint

Render will automatically check: `/` or `/health/`

You can create a health check view in `views.py`:
```python
from django.http import JsonResponse

def health_check(request):
    return JsonResponse({'status': 'healthy'})
```

Add to urls.py:
```python
path('health/', views.health_check, name='health_check'),
```

## Scaling Considerations

- **Free Tier**: Sleeps after 15 minutes of inactivity
- **Paid Tier**: Choose appropriate instance size
- **Database**: Monitor connection limits
- **Background Tasks**: Consider separate worker for Celery

## Security Notes

- Never commit .env file to version control
- Rotate SECRET_KEY for production
- Use strong passwords for superuser
- Enable HTTPS (automatic on Render)
- Regular backup your database