#!/bin/bash

# University Exam System - Setup Script

echo "🚀 University Exam System - Setup"
echo "=================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check Python version
echo -e "${YELLOW}Checking Python version...${NC}"
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 is not installed${NC}"
    exit 1
fi
python3 --version

# Create virtual environment
echo -e "${YELLOW}Creating virtual environment...${NC}"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo -e "${GREEN}✓ Virtual environment created${NC}"
else
    echo -e "${GREEN}✓ Virtual environment already exists${NC}"
fi

# Activate virtual environment
echo -e "${YELLOW}Activating virtual environment...${NC}"
source venv/bin/activate

# Install requirements
echo -e "${YELLOW}Installing dependencies...${NC}"
pip install --upgrade pip
pip install -r requirements.txt
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Create .env file
echo -e "${YELLOW}Creating .env file...${NC}"
if [ ! -f ".env" ]; then
    cp .env.example .env
    echo -e "${GREEN}✓ .env file created (please update with your settings)${NC}"
else
    echo -e "${GREEN}✓ .env file already exists${NC}"
fi

# Run migrations
echo -e "${YELLOW}Running migrations...${NC}"
python manage.py makemigrations
python manage.py migrate
echo -e "${GREEN}✓ Database migrations completed${NC}"

# Create superuser
echo -e "${YELLOW}Creating superuser account...${NC}"
python manage.py createsuperuser

# Collect static files
echo -e "${YELLOW}Collecting static files...${NC}"
python manage.py collectstatic --noinput
echo -e "${GREEN}✓ Static files collected${NC}"

# Create logs directory
mkdir -p logs

echo -e "${GREEN}=================================="
echo -e "✓ Setup completed successfully!"
echo -e "==================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Start the development server:"
echo "   python manage.py runserver"
echo ""
echo "2. Visit admin panel:"
echo "   http://localhost:8000/admin"
echo ""
echo "3. Visit API documentation:"
echo "   http://localhost:8000/api/docs/"
echo ""
echo -e "${YELLOW}To run Celery tasks:${NC}"
echo "1. Start Celery worker in another terminal:"
echo "   celery -A exam_system worker -l info"
echo ""
echo "2. Start Celery beat scheduler:"
echo "   celery -A exam_system beat -l info"
