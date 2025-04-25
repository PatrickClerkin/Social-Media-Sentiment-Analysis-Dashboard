from flask import Flask, jsonify, request, abort
from flask_cors import CORS
import sqlite3
import json
from sqlite3 import Error
import logging
import time
from datetime import datetime
from functools import wraps
import os
import jwt
import secrets
import hashlib

# Set up logging
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
CORS(app, supports_credentials=True)  # Enable CORS with credentials support

# Configuration
DATABASE = 'reddit_posts.db'
CACHE_TIMEOUT = 300  # 5 minutes cache timeout
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', secrets.token_hex(32))
JWT_EXPIRATION_DAYS = 7

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

def init_auth_db():
    """Initialize database tables for authentication."""
    conn = get_db_connection()
    if conn is not None:
        try:
            cur = conn.cursor()
            
            # Create users table
            cur.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at REAL NOT NULL,
                last_login REAL,
                preferences TEXT
            )
            ''')
            
            # Create saved_filters table
            cur.execute('''
            CREATE TABLE IF NOT EXISTS saved_filters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                filter_config TEXT NOT NULL,
                created_at REAL NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            ''')
            
            conn.commit()
            logger.info("Auth database tables created successfully")
        except Error as e:
            logger.error(f"Error creating auth database tables: {e}")
        finally:
            conn.close()

def hash_password(password):
    """Hash a password using SHA-256."""
    return hashlib.sha256(password.encode()).hexdigest()

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

def token_required(f):
    """JWT token verification decorator."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Get token from Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        
        try:
            # Decode the token
            data = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
            
            # Get the user from the database
            conn = get_db_connection()
            if conn is None:
                return jsonify({"error": "Database connection failed"}), 500
                
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE id = ?', (data['user_id'],))
            current_user = cursor.fetchone()
            conn.close()
            
            if not current_user:
                return jsonify({'message': 'User not found!'}), 401
                
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Invalid token!'}), 401
            
        # Pass the current user to the route function
        return f(dict(current_user), *args, **kwargs)
    
    return decorated

# Routes
@app.route('/', methods=['GET'])
def home():
    """Root route that provides a welcome message."""
    return jsonify({
        "message": "Welcome to the Reddit Sentiment Analysis API!",
        "version": "2.0.0",
        "endpoints": {
            "/posts": "Get all posts with filtering options",
            "/posts/<post_id>": "Get a specific post by ID",
            "/stats": "Get statistical information about the posts",
            "/health": "API health check",
            "/subreddits": "Get list of all subreddits in the database",
            "/auth/register": "Register a new user",
            "/auth/login": "Login to get an access token",
            "/auth/profile": "Get user profile (requires authentication)",
            "/auth/filters": "Save and retrieve user filters (requires authentication)"
        }
    })

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    conn = get_db_connection()
    if conn is None:
        return jsonify({"status": "error", "message": "Database connection failed"}), 500
    
    try:
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM posts")
        count = cur.fetchone()[0]
        
        uptime = int(time.time() - app.start_time)
        
        return jsonify({
            "status": "healthy",
            "database": {
                "connected": True,
                "post_count": count
            },
            "uptime_seconds": uptime,
            "cache_entries": len(cache['data'])
        })
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 500
    finally:
        conn.close()

@app.route('/posts', methods=['GET'])
@rate_limit
@cache_response()
def get_posts():
    """
    Retrieve all posts from the database with optional filters.
    Supported query parameters:
      - min_score, max_score: Filter by post score.
      - min_comments, max_comments: Filter by number of comments.
      - min_upvote_ratio, max_upvote_ratio: Filter by upvote ratio.
      - start_date, end_date: Filter by creation time (epoch timestamp or ISO format).
      - sentiment: Filter by sentiment type ('positive', 'negative', 'neutral').
      - subreddit: Filter by subreddit name.
      - limit: Limit the number of results.
      - offset: Offset for pagination.
      - sort_by: Field to sort by.
      - order: 'asc' or 'desc' for sorting order.
    """
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Failed to connect to database"}), 500

    query = "SELECT * FROM posts"
    filters = []
    params = []

    # Filter by score
    if request.args.get('min_score'):
        filters.append("score >= ?")
        params.append(int(request.args.get('min_score')))
    if request.args.get('max_score'):
        filters.append("score <= ?")
        params.append(int(request.args.get('max_score')))

    # Filter by number of comments
    if request.args.get('min_comments'):
        filters.append("num_comments >= ?")
        params.append(int(request.args.get('min_comments')))
    if request.args.get('max_comments'):
        filters.append("num_comments <= ?")
        params.append(int(request.args.get('max_comments')))

    # Filter by upvote ratio
    if request.args.get('min_upvote_ratio'):
        filters.append("upvote_ratio >= ?")
        params.append(float(request.args.get('min_upvote_ratio')))
    if request.args.get('max_upvote_ratio'):
        filters.append("upvote_ratio <= ?")
        params.append(float(request.args.get('max_upvote_ratio')))

    # Filter by date range (created_utc, given as epoch timestamps or ISO format)
    if request.args.get('start_date'):
        start_date = request.args.get('start_date')
        try:
            # Check if it's an ISO format date
            if not start_date.isdigit():
                dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
                start_timestamp = dt.timestamp()
            else:
                start_timestamp = float(start_date)
            filters.append("created_utc >= ?")
            params.append(start_timestamp)
        except ValueError:
            logger.warning(f"Invalid start_date format: {start_date}")
            return jsonify({"error": "Invalid start_date format"}), 400
            
    if request.args.get('end_date'):
        end_date = request.args.get('end_date')
        try:
            # Check if it's an ISO format date
            if not end_date.isdigit():
                dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
                end_timestamp = dt.timestamp()
            else:
                end_timestamp = float(end_date)
            filters.append("created_utc <= ?")
            params.append(end_timestamp)
        except ValueError:
            logger.warning(f"Invalid end_date format: {end_date}")
            return jsonify({"error": "Invalid end_date format"}), 400

    # Filter by sentiment (using the compound score)
    sentiment = request.args.get('sentiment')
    if sentiment:
        sentiment = sentiment.lower()
        if sentiment == 'positive':
            filters.append("sentiment_compound > ?")
            params.append(0.05)
        elif sentiment == 'negative':
            filters.append("sentiment_compound < ?")
            params.append(-0.05)
        elif sentiment == 'neutral':
            filters.append("sentiment_compound BETWEEN ? AND ?")
            params.extend([-0.05, 0.05])

    # Filter by subreddit (extracting from the url or author field if not stored directly)
    if request.args.get('subreddit'):
        subreddit = request.args.get('subreddit').lower()
        # This assumes the URL contains the subreddit name in a predictable pattern
        filters.append("(url LIKE ? OR author LIKE ?)")
        params.extend([f"%/r/{subreddit}/%", f"%{subreddit}%"])

    # Combine filters into the query
    if filters:
        query += " WHERE " + " AND ".join(filters)
    
    # Sort results
    sort_by = request.args.get('sort_by', 'created_utc')
    # Validate sort field to prevent SQL injection
    valid_sort_fields = ['id', 'title', 'score', 'num_comments', 'upvote_ratio', 
                        'url', 'author', 'created_utc', 'sentiment_compound']
    if sort_by not in valid_sort_fields:
        sort_by = 'created_utc'  # Default if invalid
    
    order = request.args.get('order', 'desc').upper()
    if order not in ['ASC', 'DESC']:
        order = 'DESC'  # Default if invalid
        
    query += f" ORDER BY {sort_by} {order}"
    
    # Pagination
    if request.args.get('limit'):
        try:
            limit = int(request.args.get('limit'))
            if limit > 0:
                query += " LIMIT ?"
                params.append(limit)
        except ValueError:
            logger.warning(f"Invalid limit parameter: {request.args.get('limit')}")
    
    if request.args.get('offset'):
        try:
            offset = int(request.args.get('offset'))
            if offset >= 0:
                query += " OFFSET ?"
                params.append(offset)
        except ValueError:
            logger.warning(f"Invalid offset parameter: {request.args.get('offset')}")

    logger.info(f"Executing query: {query} with params {params}")
    
    try:
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        posts = cur.fetchall()
    except Error as e:
        logger.error(f"Database query error: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500

    conn.close()

    # Convert rows to dictionaries
    posts_list = [dict(post) for post in posts]
    
    # Add human-readable dates
    for post in posts_list:
        post['created_date'] = datetime.fromtimestamp(post['created_utc']).isoformat()
    
    return jsonify(posts_list)

@app.route('/posts/<post_id>', methods=['GET'])
@rate_limit
@cache_response()
def get_post(post_id):
    """Retrieve a single post by its ID."""
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Failed to connect to database"}), 500

    try:
        post = conn.execute('SELECT * FROM posts WHERE id = ?', (post_id,)).fetchone()
    except Error as e:
        logger.error(f"Error retrieving post {post_id}: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500

    conn.close()

    if post is None:
        return jsonify({'error': 'Post not found'}), 404
    
    post_dict = dict(post)
    post_dict['created_date'] = datetime.fromtimestamp(post['created_utc']).isoformat()
    
    return jsonify(post_dict)

@app.route('/stats', methods=['GET'])
@rate_limit
@cache_response(timeout=600)  # Cache for 10 minutes
def get_stats():
    """
    Get statistical information about the posts in the database.
    Optionally filtered by the same parameters as the /posts endpoint.
    """
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Failed to connect to database"}), 500

    # Build filters similar to get_posts
    filters = []
    params = []
    
    # Add the same filtering logic as get_posts
    # (Reusing the same filter building code from get_posts)
    if request.args.get('min_score'):
        filters.append("score >= ?")
        params.append(int(request.args.get('min_score')))
    if request.args.get('max_score'):
        filters.append("score <= ?")
        params.append(int(request.args.get('max_score')))

    # Filter by number of comments
    if request.args.get('min_comments'):
        filters.append("num_comments >= ?")
        params.append(int(request.args.get('min_comments')))
    if request.args.get('max_comments'):
        filters.append("num_comments <= ?")
        params.append(int(request.args.get('max_comments')))

    # Filter by date range
    if request.args.get('start_date'):
        filters.append("created_utc >= ?")
        params.append(float(request.args.get('start_date')))
    if request.args.get('end_date'):
        filters.append("created_utc <= ?")
        params.append(float(request.args.get('end_date')))

    # Filter by sentiment
    sentiment = request.args.get('sentiment')
    if sentiment:
        sentiment = sentiment.lower()
        if sentiment == 'positive':
            filters.append("sentiment_compound > ?")
            params.append(0.05)
        elif sentiment == 'negative':
            filters.append("sentiment_compound < ?")
            params.append(-0.05)
        elif sentiment == 'neutral':
            filters.append("sentiment_compound BETWEEN ? AND ?")
            params.extend([-0.05, 0.05])

    # Build the WHERE clause
    where_clause = " WHERE " + " AND ".join(filters) if filters else ""
    
    try:
        cur = conn.cursor()
        
        # Get basic counts
        cur.execute(f"SELECT COUNT(*) FROM posts{where_clause}", tuple(params))
        total_posts = cur.fetchone()[0]
        
        # Get sentiment distribution
        cur.execute(f"""
            SELECT
                SUM(CASE WHEN sentiment_compound > 0.05 THEN 1 ELSE 0 END) as positive,
                SUM(CASE WHEN sentiment_compound BETWEEN -0.05 AND 0.05 THEN 1 ELSE 0 END) as neutral,
                SUM(CASE WHEN sentiment_compound < -0.05 THEN 1 ELSE 0 END) as negative
            FROM posts{where_clause}
        """, tuple(params))
        sentiment_counts = dict(cur.fetchone())
        
        # Get averages
        cur.execute(f"""
            SELECT
                AVG(score) as avg_score,
                AVG(num_comments) as avg_comments,
                AVG(upvote_ratio) as avg_upvote_ratio,
                AVG(sentiment_compound) as avg_sentiment
            FROM posts{where_clause}
        """, tuple(params))
        averages = dict(cur.fetchone())
        
        # Get top subreddits (based on URL patterns)
        cur.execute(f"""
            SELECT
                SUBSTRING(url, INSTR(url, '/r/') + 3, 
                    CASE 
                        WHEN INSTR(SUBSTRING(url, INSTR(url, '/r/') + 3), '/') > 0 
                        THEN INSTR(SUBSTRING(url, INSTR(url, '/r/') + 3), '/') - 1
                        ELSE LENGTH(SUBSTRING(url, INSTR(url, '/r/') + 3))
                    END
                ) as subreddit,
                COUNT(*) as count
            FROM posts
            WHERE url LIKE '%/r/%'{' AND ' + ' AND '.join(filters) if filters else ''}
            GROUP BY subreddit
            ORDER BY count DESC
            LIMIT 10
        """, tuple(params))
        top_subreddits = [dict(row) for row in cur.fetchall()]
        
        # Get time distribution (posts per day)
        cur.execute(f"""
            SELECT
                CAST(created_utc / 86400 AS INTEGER) * 86400 as day,
                COUNT(*) as count
            FROM posts{where_clause}
            GROUP BY CAST(created_utc / 86400 AS INTEGER)
            ORDER BY day
        """, tuple(params))
        time_distribution = [dict(row) for row in cur.fetchall()]
        
        # Convert epoch days to ISO format dates
        for day in time_distribution:
            day['date'] = datetime.fromtimestamp(day['day']).strftime('%Y-%m-%d')
        
    except Error as e:
        logger.error(f"Error retrieving stats: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500

    conn.close()
    
    return jsonify({
        "total_posts": total_posts,
        "sentiment_distribution": sentiment_counts,
        "averages": averages,
        "top_subreddits": top_subreddits,
        "time_distribution": time_distribution
    })

@app.route('/subreddits', methods=['GET'])
@rate_limit
@cache_response(timeout=3600)  # Cache for 1 hour
def get_subreddits():
    """Get a list of all subreddits in the database based on URL patterns."""
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Failed to connect to database"}), 500

    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
                SUBSTRING(url, INSTR(url, '/r/') + 3, 
                    CASE 
                        WHEN INSTR(SUBSTRING(url, INSTR(url, '/r/') + 3), '/') > 0 
                        THEN INSTR(SUBSTRING(url, INSTR(url, '/r/') + 3), '/') - 1
                        ELSE LENGTH(SUBSTRING(url, INSTR(url, '/r/') + 3))
                    END
                ) as subreddit,
                COUNT(*) as post_count,
                AVG(sentiment_compound) as avg_sentiment
            FROM posts
            WHERE url LIKE '%/r/%'
            GROUP BY subreddit
            ORDER BY post_count DESC
        """)
        subreddits = [dict(row) for row in cur.fetchall()]
    except Error as e:
        logger.error(f"Error retrieving subreddits: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500

    conn.close()
    
    return jsonify(subreddits)

# Authentication Routes
@app.route('/auth/register', methods=['POST'])
def register():
    """Register a new user."""
    data = request.get_json()
    
    # Validate required fields
    if not data or not data.get('username') or not data.get('password') or not data.get('email'):
        return jsonify({'message': 'Missing required fields!'}), 400
    
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')
    
    # Validate email format (basic validation)
    if '@' not in email or '.' not in email.split('@')[1]:
        return jsonify({'message': 'Invalid email format!'}), 400
    
    # Validate password length
    if len(password) < 6:
        return jsonify({'message': 'Password must be at least 6 characters!'}), 400
    
    # Hash the password
    password_hash = hash_password(password)
    
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        # Check if username or email already exist
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE username = ? OR email = ?', (username, email))
        if cursor.fetchone():
            conn.close()
            return jsonify({'message': 'Username or email already exists!'}), 409
        
        # Insert the new user
        cursor.execute(
            'INSERT INTO users (username, email, password_hash, created_at, preferences) VALUES (?, ?, ?, ?, ?)',
            (username, email, password_hash, datetime.now().timestamp(), '{}')
        )
        
        conn.commit()
        
        # Get the new user ID
        cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
        user_id = cursor.fetchone()[0]
        
        conn.close()
        
        # Generate token
        expiration = int((datetime.now() + datetime.timedelta(days=JWT_EXPIRATION_DAYS)).timestamp())
        token = jwt.encode({
            'user_id': user_id,
            'exp': expiration
        }, JWT_SECRET_KEY, algorithm="HS256")
        
        return jsonify({
            'message': 'User registered successfully!',
            'token': token,
            'user': {
                'id': user_id,
                'username': username,
                'email': email
            }
        }), 201
    
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        logger.error(f"Registration error: {e}")
        return jsonify({'message': f'Registration failed: {str(e)}'}), 500

@app.route('/auth/login', methods=['POST'])
def login():
    """Login and get an access token."""
    data = request.get_json()
    
    # Validate required fields
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Missing username or password!'}), 400
    
    username = data.get('username')
    password = data.get('password')
    
    # Hash the password
    password_hash = hash_password(password)
    
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Check if the user exists
    cursor.execute('SELECT * FROM users WHERE (username = ? OR email = ?) AND password_hash = ?', 
                 (username, username, password_hash))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'message': 'Invalid username or password!'}), 401
    
    # Update last login time
    cursor.execute('UPDATE users SET last_login = ? WHERE id = ?', 
                 (datetime.now().timestamp(), user['id']))
    conn.commit()
    
    # Parse preferences JSON if it exists
    preferences = {}
    if user['preferences']:
        try:
            preferences = json.loads(user['preferences'])
        except:
            logger.error(f"Failed to parse preferences for user {user['id']}")
    
    conn.close()
    
    # Generate token
    expiration = int((datetime.now() + datetime.timedelta(days=JWT_EXPIRATION_DAYS)).timestamp())
    token = jwt.encode({
        'user_id': user['id'],
        'exp': expiration
    }, JWT_SECRET_KEY, algorithm="HS256")
    
    return jsonify({
        'message': 'Login successful!',
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'preferences': preferences
        }
    }), 200

@app.route('/auth/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    """Get the current user's profile."""
    # Parse preferences JSON if it exists
    preferences = {}
    if current_user['preferences']:
        try:
            preferences = json.loads(current_user['preferences'])
        except:
            logger.error(f"Failed to parse preferences for user {current_user['id']}")
    
    return jsonify({
        'user': {
            'id': current_user['id'],
            'username': current_user['username'],
            'email': current_user['email'],
            'preferences': preferences,
            'created_at': current_user['created_at'],
            'last_login': current_user['last_login']
        }
    }), 200

@app.route('/auth/preferences', methods=['PUT'])
@token_required
def update_preferences(current_user):
    """Update user preferences."""
    data = request.get_json()
    
    if not data:
        return jsonify({'message': 'No data provided!'}), 400
    
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        # Update preferences
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET preferences = ? WHERE id = ?', 
                     (json.dumps(data), current_user['id']))
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Preferences updated successfully!',
            'preferences': data
        }), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        logger.error(f"Preferences update error: {e}")
        return jsonify({'message': f'Failed to update preferences: {str(e)}'}), 500

@app.route('/auth/filters', methods=['POST'])
@token_required
def save_filter(current_user):
    """Save a filter configuration."""
    data = request.get_json()
    
    # Validate required fields
    if not data or not data.get('name') or not data.get('filter_config'):
        return jsonify({'message': 'Missing required fields!'}), 400
    
   name = data.get('name')
    filter_config = data.get('filter_config')
    
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        # Insert the new filter
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO saved_filters (user_id, name, filter_config, created_at) VALUES (?, ?, ?, ?)',
            (current_user['id'], name, json.dumps(filter_config), datetime.now().timestamp())
        )
        
        conn.commit()
        
        # Get the new filter ID
        cursor.execute('SELECT last_insert_rowid()')
        filter_id = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            'message': 'Filter saved successfully!',
            'filter': {
                'id': filter_id,
                'name': name,
                'filter_config': filter_config
            }
        }), 201
        
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        logger.error(f"Save filter error: {e}")
        return jsonify({'message': f'Failed to save filter: {str(e)}'}), 500

@app.route('/auth/filters', methods=['GET'])
@token_required
def get_filters(current_user):
    """Get saved filters for the current user."""
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Get all filters for the user
    cursor.execute('SELECT * FROM saved_filters WHERE user_id = ? ORDER BY created_at DESC', (current_user['id'],))
    filters = cursor.fetchall()
    
    conn.close()
    
    # Convert to list of dictionaries
    result = []
    for f in filters:
        filter_dict = dict(f)
        try:
            # Parse the filter_config JSON
            filter_dict['filter_config'] = json.loads(filter_dict['filter_config'])
        except:
            logger.error(f"Failed to parse filter_config for filter {f['id']}")
            filter_dict['filter_config'] = {}
        
        result.append(filter_dict)
    
    return jsonify({
        'filters': result
    }), 200

@app.route('/auth/filters/<int:filter_id>', methods=['DELETE'])
@token_required
def delete_filter(current_user, filter_id):
    """Delete a saved filter."""
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    cursor = conn.cursor()
    
    # Check if the filter exists and belongs to the user
    cursor.execute('SELECT * FROM saved_filters WHERE id = ? AND user_id = ?', (filter_id, current_user['id']))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'message': 'Filter not found or unauthorized!'}), 404
    
    try:
        # Delete the filter
        cursor.execute('DELETE FROM saved_filters WHERE id = ?', (filter_id,))
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Filter deleted successfully!'
        }), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        logger.error(f"Delete filter error: {e}")
        return jsonify({'message': f'Failed to delete filter: {str(e)}'}), 500

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Resource not found"}), 404

@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405

@app.errorhandler(500)
def server_error(e):
    logger.error(f"Server error: {e}")
    return jsonify({"error": "Internal server error"}), 500

if __name__ == '__main__':
    # Store start time for uptime calculation
    app.start_time = time.time()
    
    # Initialize database with indexes
    init_db()
    
    # Initialize authentication database
    init_auth_db()
    
    # Run the application
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.environ.get('FLASK_PORT', 5000))
    
    logger.info(f"Starting Flask server on port {port}, debug mode: {debug_mode}")
    app.run(debug=debug_mode, host='0.0.0.0', port=port)