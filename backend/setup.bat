@echo off
REM University Exam System - Setup Script for Windows

echo 🚀 University Exam System - Setup
echo ==================================

REM Check Python version
echo Checking Python version...
python --version
if errorlevel 1 (
    echo Python 3 is not installed
    exit /b 1
)

REM Create virtual environment
echo Creating virtual environment...
if not exist "venv" (
    python -m venv venv
    echo ✓ Virtual environment created
) else (
    echo ✓ Virtual environment already exists
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install requirements
echo Installing dependencies...
python -m pip install --upgrade pip
pip install -r requirements.txt
echo ✓ Dependencies installed

REM Create .env file
echo Creating .env file...
if not exist ".env" (
    copy .env.example .env
    echo ✓ .env file created (please update with your settings)
) else (
    echo ✓ .env file already exists
)

REM Run migrations
echo Running migrations...
python manage.py makemigrations
python manage.py migrate
echo ✓ Database migrations completed

REM Create superuser
echo Creating superuser account...
python manage.py createsuperuser

REM Collect static files
echo Collecting static files...
python manage.py collectstatic --noinput
echo ✓ Static files collected

REM Create logs directory
if not exist "logs" (
    mkdir logs
)

echo ==================================
echo ✓ Setup completed successfully!
echo ==================================
echo.
echo Next steps:
echo 1. Start the development server:
echo    python manage.py runserver
echo.
echo 2. Visit admin panel:
echo    http://localhost:8000/admin
echo.
echo 3. Visit API documentation:
echo    http://localhost:8000/api/docs/
echo.
echo To run Celery tasks:
echo 1. Start Celery worker in another terminal:
echo    celery -A exam_system worker -l info
echo.
echo 2. Start Celery beat scheduler:
echo    celery -A exam_system beat -l info
