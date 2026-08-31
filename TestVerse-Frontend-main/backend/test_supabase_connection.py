#!/usr/bin/env python
"""
Supabase PostgreSQL Connection Tester
=====================================

This script tests all aspects of your Supabase database connection:
1. Environment variable loading
2. DNS resolution
3. Direct database connection
4. Django ORM connection
5. Basic operations test
"""

import os
import sys
import socket
import psycopg2
import django
from decouple import config
from urllib.parse import urlparse

def print_section(title):
    """Print a formatted section header"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def test_env_variables():
    """Test environment variable configuration"""
    print_section("1. Environment Variables Test")
    
    required_vars = ['DATABASE_URL', 'DATABASE_PASSWORD']
    missing_vars = []
    
    for var in required_vars:
        value = config(var, default=None)
        if value:
            print(f"✅ {var}: Configured")
            if var == 'DATABASE_URL':
                # Mask password in URL for security
                parsed = urlparse(value)
                masked_url = f"{parsed.scheme}://{parsed.username}:****@{parsed.hostname}:{parsed.port}{parsed.path}"
                print(f"   URL: {masked_url}")
        else:
            print(f"❌ {var}: NOT CONFIGURED")
            missing_vars.append(var)
    
    if missing_vars:
        print(f"\n❌ Missing required environment variables: {', '.join(missing_vars)}")
        return False
    
    print("✅ All required environment variables found")
    return True

def test_dns_resolution():
    """Test DNS resolution for Supabase host"""
    print_section("2. DNS Resolution Test")
    
    try:
        database_url = config('DATABASE_URL')
        parsed = urlparse(database_url)
        hostname = parsed.hostname
        
        print(f"📡 Testing DNS resolution for: {hostname}")
        
        # Test hostname resolution
        try:
            ipv4 = socket.getaddrinfo(hostname, None, socket.AF_INET)[0][4][0]
            print(f"✅ IPv4 Address: {ipv4}")
        except Exception as e:
            print(f"❌ IPv4 Resolution failed: {e}")
            
        try:
            ipv6 = socket.getaddrinfo(hostname, None, socket.AF_INET6)[0][4][0]
            print(f"✅ IPv6 Address: {ipv6}")
        except Exception as e:
            print(f"⚠️  IPv6 Resolution failed: {e}")
            
        return True
        
    except Exception as e:
        print(f"❌ DNS test failed: {e}")
        return False

def test_direct_connection():
    """Test direct PostgreSQL connection using psycopg2"""
    print_section("3. Direct PostgreSQL Connection Test")
    
    try:
        database_url = config('DATABASE_URL')
        password = config('DATABASE_PASSWORD')
        
        # Parse URL components
        parsed = urlparse(database_url)
        
        print(f"🔌 Connecting to: {parsed.hostname}:{parsed.port}")
        print(f"📚 Database: {parsed.path[1:] if parsed.path.startswith('/') else parsed.path}")
        print(f"👤 User: {parsed.username}")
        
        # Test connection
        conn = psycopg2.connect(
            host=parsed.hostname,
            port=parsed.port or 5432,
            database=parsed.path[1:] if parsed.path.startswith('/') else parsed.path,
            user=parsed.username,
            password=password,
            sslmode='require',
            connect_timeout=10
        )
        
        cur = conn.cursor()
        
        # Test basic queries
        cur.execute("SELECT version();")
        version = cur.fetchone()
        print(f"✅ PostgreSQL Version: {version[0] if version else 'Unknown'}")
        
        cur.execute("SELECT current_database();")
        db_name = cur.fetchone()
        print(f"✅ Connected Database: {db_name[0] if db_name else 'Unknown'}")
        
        cur.execute("SELECT current_user;")
        user = cur.fetchone()
        print(f"✅ Connected User: {user[0] if user else 'Unknown'}")
        
        # Test write permissions
        try:
            cur.execute("CREATE TEMP TABLE test_table (id SERIAL PRIMARY KEY, test_data VARCHAR(50));")
            cur.execute("INSERT INTO test_table (test_data) VALUES ('connection_test');")
            cur.execute("SELECT COUNT(*) FROM test_table;")
            count = cur.fetchone()
            print(f"✅ Write Test: Success (Inserted {count[0] if count else 0} rows)")
            cur.execute("DROP TABLE test_table;")
        except Exception as e:
            print(f"⚠️  Write Test: Failed - {e}")
        
        cur.close()
        conn.close()
        
        print("✅ Direct connection successful!")
        return True
        
    except psycopg2.OperationalError as e:
        print(f"❌ Connection failed: {e}")
        if "Connection refused" in str(e):
            print("💡 Troubleshooting tips:")
            print("   - Check if your Supabase project is active")
            print("   - Verify the connection pooler is enabled")
            print("   - Check firewall/network settings")
        elif "password authentication failed" in str(e):
            print("💡 Password authentication failed - check your DATABASE_PASSWORD")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

def test_django_connection():
    """Test Django ORM connection"""
    print_section("4. Django ORM Connection Test")
    
    try:
        # Setup Django
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'exam_system.settings')
        django.setup()
        
        from django.db import connection
        from django.conf import settings
        
        print(f"🔧 Django Database Engine: {settings.DATABASES['default']['ENGINE']}")
        
        # Test connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT version();")
            version = cursor.fetchone()
            print(f"✅ Django PostgreSQL Version: {version[0] if version else 'Unknown'}")
            
            cursor.execute("SELECT current_database();")
            db_name = cursor.fetchone()
            print(f"✅ Django Connected Database: {db_name[0] if db_name else 'Unknown'}")
            
        print("✅ Django ORM connection successful!")
        return True
        
    except Exception as e:
        print(f"❌ Django connection failed: {e}")
        return False

def test_supabase_specifics():
    """Test Supabase-specific features"""
    print_section("5. Supabase Specific Tests")
    
    try:
        database_url = config('DATABASE_URL')
        parsed = urlparse(database_url)
        
        # Check if using connection pooler (pooler ports are typically different)
        if 'pooler' in parsed.hostname or parsed.port not in [5432, 6543]:
            print(f"✅ Using Connection Pooler: {parsed.hostname}:{parsed.port}")
        else:
            print(f"⚠️  Using Direct Connection: {parsed.hostname}:{parsed.port}")
            print("💡 Consider enabling connection pooling for better performance")
        
        # Check SSL requirement
        print("✅ SSL Mode: Required (sslmode=require)")
        
        return True
        
    except Exception as e:
        print(f"❌ Supabase specific test failed: {e}")
        return False

def main():
    """Run all connection tests"""
    print("🚀 Supabase PostgreSQL Connection Tester")
    print("========================================")
    
    tests = [
        test_env_variables,
        test_dns_resolution,
        test_direct_connection,
        test_django_connection,
        test_supabase_specifics
    ]
    
    results = []
    
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"❌ Test failed with exception: {e}")
            results.append(False)
    
    # Summary
    print_section("TEST SUMMARY")
    passed = sum(results)
    total = len(results)
    
    print(f"Tests Passed: {passed}/{total}")
    
    if passed == total:
        print("🎉 All tests passed! Your Supabase connection is working perfectly.")
        return True
    elif passed >= total * 0.8:
        print("⚠️  Most tests passed. Some minor issues detected.")
        return True
    else:
        print("❌ Connection issues detected. Please check the errors above.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)