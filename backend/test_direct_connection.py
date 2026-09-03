#!/usr/bin/env python
import psycopg2
from decouple import config

def test_direct_connection():
    try:
        conn = psycopg2.connect(
            host="db.dnayjechvtorpnfjplhz.supabase.co",
            port=5432,
            database="postgres",
            user="postgres",
            password=config('DATABASE_PASSWORD'),
            sslmode='require'
        )
        
        cur = conn.cursor()
        cur.execute("SELECT version();")
        version = cur.fetchone()
        print("PostgreSQL Version:", version[0] if version else "Unknown")
        
        cur.execute("SELECT current_database();")
        db_name = cur.fetchone()
        print("Connected Database:", db_name[0] if db_name else "Unknown")
        
        cur.close()
        conn.close()
        print("✅ Direct connection successful!")
        return True
        
    except Exception as e:
        print("❌ Direct connection failed:", str(e))
        return False

if __name__ == "__main__":
    print("Testing direct PostgreSQL connection...")
    test_direct_connection()