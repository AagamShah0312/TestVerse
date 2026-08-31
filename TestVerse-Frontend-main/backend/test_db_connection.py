#!/usr/bin/env python
import os
import django
from django.conf import settings
from decouple import config

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'exam_system.settings')
django.setup()

# Test database connection
from django.db import connection

def test_database_connection():
    try:
        # Check if we're using PostgreSQL
        print("Database Engine:", settings.DATABASES['default']['ENGINE'])
        print("Database Host:", settings.DATABASES['default'].get('HOST', 'Not set'))
        
        # Test connection
        with connection.cursor() as cursor:
            if 'postgresql' in settings.DATABASES['default']['ENGINE']:
                cursor.execute("SELECT version();")
                version = cursor.fetchone()
                print("PostgreSQL Version:", version[0] if version else "Unknown")
                
                cursor.execute("SELECT current_database();")
                db_name = cursor.fetchone()
                print("Connected Database:", db_name[0] if db_name else "Unknown")
            else:
                # SQLite
                cursor.execute("SELECT sqlite_version();")
                version = cursor.fetchone()
                print("SQLite Version:", version[0] if version else "Unknown")
                print("Connected Database: SQLite (db.sqlite3)")
            
        print("✅ Database connection successful!")
        return True
        
    except Exception as e:
        print("❌ Database connection failed:", str(e))
        return False

if __name__ == "__main__":
    print("Testing Supabase PostgreSQL connection...")
    test_database_connection()