#!/usr/bin/env python
"""
Supabase Connection String Tester
=================================

Tests multiple common Supabase connection formats to find the working one.
"""

import psycopg2
from decouple import config
from urllib.parse import urlparse

# Common Supabase connection patterns
CONNECTION_PATTERNS = [
    # Pattern 1: Standard pooler format
    "postgresql://postgres:{password}@aws-0-us-west-1.pooler.supabase.com:6543/postgres",
    
    # Pattern 2: Project-specific pooler
    "postgresql://postgres:{password}@{project_id}.pooler.supabase.co:6543/postgres",
    
    # Pattern 3: Direct connection with project ID
    "postgresql://postgres:{password}@{project_id}.supabase.co:5432/postgres",
    
    # Pattern 4: AWS region specific
    "postgresql://postgres:{password}@db.{project_id}.supabase.co:5432/postgres",
]

def test_connection_string(connection_string, description):
    """Test a single connection string"""
    try:
        print(f"\n🔍 Testing: {description}")
        print(f"🔗 URL: {connection_string.replace(config('DATABASE_PASSWORD'), '****')}")
        
        parsed = urlparse(connection_string)
        
        conn = psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            database=parsed.path[1:] if parsed.path.startswith('/') else parsed.path,
            user=parsed.username,
            password=config('DATABASE_PASSWORD'),
            sslmode='require',
            connect_timeout=5
        )
        
        cur = conn.cursor()
        cur.execute("SELECT version();")
        version = cur.fetchone()
        
        print(f"✅ SUCCESS! Connected to: {version[0][:50] if version else 'Unknown'}")
        
        cur.close()
        conn.close()
        
        return True, connection_string
        
    except Exception as e:
        print(f"❌ FAILED: {e}")
        return False, None

def main():
    print("🧪 Supabase Connection String Tester")
    print("=" * 50)
    
    password = config('DATABASE_PASSWORD')
    project_id = "dnayjechvtorpnfjplhz"
    
    working_connection = None
    
    # Test each pattern
    for i, pattern in enumerate(CONNECTION_PATTERNS, 1):
        connection_string = pattern.format(password=password, project_id=project_id)
        success, conn_str = test_connection_string(connection_string, f"Pattern {i}")
        
        if success:
            working_connection = conn_str
            break
    
    # Summary
    print("\n" + "=" * 50)
    if working_connection:
        print("🎉 FOUND WORKING CONNECTION!")
        print(f"✅ Use this in your .env file:")
        print(f"DATABASE_URL={working_connection}")
    else:
        print("❌ No working connection found")
        print("\n💡 Next steps:")
        print("1. Check your Supabase dashboard for the exact connection string")
        print("2. Verify your project is active")
        print("3. Check if connection pooling is enabled")
        print("4. Try the connection string from Supabase dashboard directly")

if __name__ == "__main__":
    main()