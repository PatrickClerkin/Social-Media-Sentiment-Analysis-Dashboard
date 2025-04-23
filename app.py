from flask import Flask, jsonify, request, abort
from flask_cors import CORS
import sqlite3
from sqlite3 import Error
import logging
import time
from datetime import datetime
from functools import wraps
import os

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("api.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Configuration
DATABASE = 'reddit_posts.db'
CACHE_TIMEOUT = 300  # 5 minutes cache timeout

# Simple in-memory cache
cache = {
    'data': {},
    'timestamp': {}
}

# Rate limiting configuration
RATE_LIMIT = {
    'requests': 100,  # number of requests
    'per_seconds': 60,  # time window in seconds
    'clients': {}
}

def get_db_connection():
    """Establish a connection to the SQLite database."""
    try:
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row  # enables dict-like access for rows
        return conn
    except Error as e:
        logger.error(f"Database connection error: {e}")
        return None

def init_db():
    """Initialize database with indexes for better performance."""
    conn = get_db_connection()
    if conn is not None:
        try:
            cur = conn.cursor()
            # Create indexes for common query fields
            cur.execute('CREATE INDEX IF NOT EXISTS idx_score ON posts (score)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_num_comments ON posts (num_comments)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_created_utc ON posts (created_utc)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_sentiment_compound ON posts (sentiment_compound)')
            conn.commit()
            logger.info("Database indexes created successfully")
        except Error as e:
            logger.error(f"Error creating database indexes: {e}")
        finally:
            conn.close()

            
def rate_limit(f):
    """Rate limiting decorator"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client_ip = request.remote_addr
        current_time = time.time()
        
        # Initialize or reset client's request count
        if client_ip not in RATE_LIMIT['clients'] or \
           current_time - RATE_LIMIT['clients'][client_ip]['start_time'] > RATE_LIMIT['per_seconds']:
            RATE_LIMIT['clients'][client_ip] = {
                'count': 1,
                'start_time': current_time
            }
        else:
            # Increment request count
            RATE_LIMIT['clients'][client_ip]['count'] += 1
            
        # Check if limit exceeded
        if RATE_LIMIT['clients'][client_ip]['count'] > RATE_LIMIT['requests']:
            logger.warning(f"Rate limit exceeded for {client_ip}")
            return jsonify({
                'error': 'Rate limit exceeded',
                'message': 'Too many requests. Please try again later.'
            }), 429
            
        return f(*args, **kwargs)
    return decorated_function

def cache_response(timeout=CACHE_TIMEOUT):
    """Caching decorator"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Generate a cache key based on the request path and query parameters
            cache_key = request.path + '?' + request.query_string.decode('utf-8')
            
            # Check if we have a valid cached response
            if cache_key in cache['data'] and time.time() - cache['timestamp'][cache_key] < timeout:
                logger.info(f"Cache hit for {cache_key}")
                return cache['data'][cache_key]
            
            # If not in cache or expired, get fresh data
            response = f(*args, **kwargs)
            
            # Cache the response
            cache['data'][cache_key] = response
            cache['timestamp'][cache_key] = time.time()
            logger.info(f"Cached response for {cache_key}")
            
            return response
        return decorated_function
    return decorator
