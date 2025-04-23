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