import praw
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

# Import for sentiment analysis
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Import auth blueprint and init_auth_db
from auth import auth_bp, init_auth_db, token_required

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

# Register the auth blueprint
app.register_blueprint(auth_bp, url_prefix='/auth')

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

# Initialize PRAW for Reddit API
# Get credentials from environment variables or use your own credentials here
reddit = praw.Reddit(
    client_id=os.environ.get('REDDIT_CLIENT_ID', 'YOUR_CLIENT_ID_HERE'),  # Replace with your actual client_id
    client_secret=os.environ.get('REDDIT_CLIENT_SECRET', 'YOUR_CLIENT_SECRET_HERE'),  # Replace with your actual client_secret
    user_agent=os.environ.get('REDDIT_USER_AGENT', 'RedditSentimentAPI/1.0 by YourUsername')  # Replace with your username
)

# Initialize VADER sentiment analyzer
analyzer = SentimentIntensityAnalyzer()

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

# Initialize databases when the application starts
with app.app_context():
    init_db()
    init_auth_db()
    logger.info("Databases initialized")

def rate_limit(f):
    """Rate limiting decorator"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        client_ip = request.remote_addr
        current_time = time.time()
        if client_ip not in RATE_LIMIT['clients'] or \
           current_time - RATE_LIMIT['clients'][client_ip]['start_time'] > RATE_LIMIT['per_seconds']:
            RATE_LIMIT['clients'][client_ip] = {
                'count': 1,
                'start_time': current_time
            }
        else:
            RATE_LIMIT['clients'][client_ip]['count'] += 1
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
            cache_key = request.path + '?' + request.query_string.decode('utf-8')
            if cache_key in cache['data'] and time.time() - cache['timestamp'][cache_key] < timeout:
                logger.info(f"Cache hit for {cache_key}")
                return cache['data'][cache_key]
            response = f(*args, **kwargs)
            cache['data'][cache_key] = response
            cache['timestamp'][cache_key] = time.time()
            logger.info(f"Cached response for {cache_key}")
            return response
        return decorated_function
    return decorator

# Helper function to analyze sentiment
def analyze_sentiment(text):
    """Analyze sentiment of text using VADER."""
    try:
        if not text:
            return analyzer.polarity_scores("")
        return analyzer.polarity_scores(text)
    except Exception as e:
        logger.error(f"Error analyzing sentiment: {e}")
        # Return neutral sentiment in case of error
        return {'neg': 0, 'neu': 1, 'pos': 0, 'compound': 0}

# Routes
@app.route('/', methods=['GET'])
def home():
    """Root route that provides a welcome message."""
    return jsonify({
        "message": "Welcome to the Reddit Sentiment Analysis API!",
        "version": "2.0.0",
        "endpoints": {
            "/search": "Live search Reddit posts",
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
        uptime = int(time.time() - getattr(app, 'start_time', time.time()))
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

@app.route('/search', methods=['GET'])
@rate_limit
def search_reddit():
    """Live search on Reddit across all subreddits."""
    q = request.args.get('q')
    if not q:
        return jsonify({'error': 'Missing search term'}), 400
    
    limit = request.args.get('limit', 25, type=int)
    sort = request.args.get('sort', 'relevance')  # relevance, hot, new, top
    time_filter = request.args.get('time_filter', 'all')  # hour, day, week, month, year, all
    subreddit = request.args.get('subreddit', 'all')  # specific subreddit or 'all'
    
    try:
        results = []
        sr = reddit.subreddit(subreddit)
        
        if sort == 'hot':
            submissions = sr.hot(limit=limit)
        elif sort == 'new':
            submissions = sr.new(limit=limit)
        elif sort == 'top':
            submissions = sr.top(limit=limit, time_filter=time_filter)
        else:  # default to search
            submissions = sr.search(q, limit=limit, sort=sort, time_filter=time_filter)
        
        for submission in submissions:
            # Skip if search term not in title/selftext for hot/new/top
            if sort in ['hot', 'new', 'top'] and q.lower() not in submission.title.lower() and \
               (not submission.selftext or q.lower() not in submission.selftext.lower()):
                continue
                
            # Analyze sentiment
            text = submission.title + " " + (submission.selftext or "")
            sent = analyze_sentiment(text)
            
            # Create post data dictionary
            post_data = {
                'id': submission.id,
                'title': submission.title,
                'subreddit': submission.subreddit.display_name,
                'score': submission.score,
                'num_comments': submission.num_comments,
                'upvote_ratio': submission.upvote_ratio,
                'url': submission.url,
                'created_utc': submission.created_utc,
                'selftext': submission.selftext,
                'sentiment_compound': sent['compound'],
                'sentiment_pos': sent['pos'],
                'sentiment_neu': sent['neu'],
                'sentiment_neg': sent['neg'],
                'created_date': datetime.fromtimestamp(submission.created_utc).isoformat()
            }
            
            results.append(post_data)
            
            # If using hot/new/top without sufficient results, stop after we have enough
            if sort in ['hot', 'new', 'top'] and len(results) >= limit:
                break
                
        return jsonify(results)
        
    except Exception as e:
        logger.error(f"Error in live search: {e}")
        return jsonify({'error': f'Search failed: {str(e)}'}), 500

@app.route('/posts', methods=['GET'])
@rate_limit
@cache_response()
def get_posts():
    """
    Retrieve all posts from the database with optional filters.
    Supports numeric, date, sentiment, subreddit filters, and text search.
    """
    # Check if this is actually a search request and redirect to live search if so
    if request.args.get('search'):
        # First try to get from database
        conn = get_db_connection()
        if conn is None:
            return jsonify({"error": "Failed to connect to database"}), 500

        query = "SELECT * FROM posts"
        filters = []
        params = []

        # Add search filter
        search = request.args.get('search')
        wildcard = f"%{search}%"
        filters.append("(title LIKE ? OR selftext LIKE ?)")
        params.extend([wildcard, wildcard])

        # Combine filters
        if filters:
            query += " WHERE " + " AND ".join(filters)

        # Sorting
        query += " ORDER BY created_utc DESC LIMIT 25"

        try:
            cur = conn.cursor()
            cur.execute(query, tuple(params))
            rows = cur.fetchall()
        except Error as e:
            logger.error(f"Database query error: {e}")
            conn.close()
            return jsonify({"error": str(e)}), 500

        conn.close()
        
        # If we have results from the database, return them
        if rows and len(rows) > 0:
            posts_list = [dict(r) for r in rows]
            for post in posts_list:
                post['created_date'] = datetime.fromtimestamp(post['created_utc']).isoformat()
            return jsonify(posts_list)
        
        # Otherwise, try live search
        try:
            return search_reddit()
        except Exception as e:
            logger.error(f"Error redirecting to live search: {e}")
            # Continue with database search even if live search fails
    
    # Regular database search
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Failed to connect to database"}), 500

    query = "SELECT * FROM posts"
    filters = []
    params = []

    # Numeric filters
    if request.args.get('min_score'):
        filters.append("score >= ?")
        params.append(int(request.args['min_score']))
    if request.args.get('max_score'):
        filters.append("score <= ?")
        params.append(int(request.args['max_score']))
    if request.args.get('min_comments'):
        filters.append("num_comments >= ?")
        params.append(int(request.args['min_comments']))
    if request.args.get('max_comments'):
        filters.append("num_comments <= ?")
        params.append(int(request.args['max_comments']))
    if request.args.get('min_upvote_ratio'):
        filters.append("upvote_ratio >= ?")
        params.append(float(request.args['min_upvote_ratio']))
    if request.args.get('max_upvote_ratio'):
        filters.append("upvote_ratio <= ?")
        params.append(float(request.args['max_upvote_ratio']))

    # Date filters
    if request.args.get('start_date'):
        sd = request.args['start_date']
        try:
            ts = float(sd) if sd.isdigit() else datetime.fromisoformat(sd.replace('Z','+00:00')).timestamp()
            filters.append("created_utc >= ?")
            params.append(ts)
        except:
            return jsonify({"error": "Invalid start_date format"}), 400
    if request.args.get('end_date'):
        ed = request.args['end_date']
        try:
            ts = float(ed) if ed.isdigit() else datetime.fromisoformat(ed.replace('Z','+00:00')).timestamp()
            filters.append("created_utc <= ?")
            params.append(ts)
        except:
            return jsonify({"error": "Invalid end_date format"}), 400

    # Sentiment filter
    sentiment = request.args.get('sentiment')
    if sentiment:
        s = sentiment.lower()
        if s == 'positive':
            filters.append("sentiment_compound > ?")
            params.append(0.05)
        elif s == 'negative':
            filters.append("sentiment_compound < ?")
            params.append(-0.05)
        elif s == 'neutral':
            filters.append("sentiment_compound BETWEEN ? AND ?")
            params.extend([-0.05, 0.05])

    # Subreddit filter
    if request.args.get('subreddit'):
        sr = request.args['subreddit'].lower()
        filters.append("(url LIKE ? OR author LIKE ?)")
        params.extend([f"%/r/{sr}/%", f"%{sr}%"])

    # Text search
    search = request.args.get('search')
    if search:
        wildcard = f"%{search}%"
        filters.append("(title LIKE ? OR selftext LIKE ?)")
        params.extend([wildcard, wildcard])

    # Combine filters
    if filters:
        query += " WHERE " + " AND ".join(filters)

    # Sorting
    sort_by = request.args.get('sort_by', 'created_utc')
    valid = ['id','title','score','num_comments','upvote_ratio','url','author','created_utc','sentiment_compound']
    if sort_by not in valid:
        sort_by = 'created_utc'
    order = request.args.get('order','desc').upper()
    if order not in ['ASC','DESC']:
        order = 'DESC'
    query += f" ORDER BY {sort_by} {order}"

    # Pagination
    if request.args.get('limit'):
        try:
            query += " LIMIT ?"
            params.append(int(request.args['limit']))
        except:
            pass
    if request.args.get('offset'):
        try:
            query += " OFFSET ?"
            params.append(int(request.args['offset']))
        except:
            pass

    logger.info(f"Executing query: {query} with params {params}")

    try:
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        rows = cur.fetchall()
    except Error as e:
        logger.error(f"Database query error: {e}")
        conn.close()
        return jsonify({"error": str(e)}), 500

    conn.close()
    posts_list = [dict(r) for r in rows]
    for post in posts_list:
        post['created_date'] = datetime.fromtimestamp(post['created_utc']).isoformat()

    return jsonify(posts_list)

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
    
    # Run the application
    debug_mode = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    port = int(os.environ.get('FLASK_PORT', 5000))
    
    logger.info(f"Starting Flask server on port {port}, debug mode: {debug_mode}")
    app.run(debug=debug_mode, host='0.0.0.0', port=port)