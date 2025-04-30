import praw
from flask import Flask, jsonify, request, abort
from flask_cors import CORS
import sqlite3
from sqlite3 import Error
import logging
import time
from datetime import datetime
import os
import secrets
import hashlib

# Import for sentiment analysis
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

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
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', secrets.token_hex(32))

# Simple in-memory cache
cache = {
    'data': {},
    'timestamp': {}
}
CACHE_TIMEOUT = 300  # 5 minutes cache timeout

# Initialize VADER sentiment analyzer
analyzer = SentimentIntensityAnalyzer()

# Initialize PRAW for Reddit API
try:
    # Get credentials from environment variables or use fallback values
    reddit = praw.Reddit(
        client_id=os.environ.get('REDDIT_CLIENT_ID', 'HhQIW6ImodQPyWAFdJLv5g'),
        client_secret=os.environ.get('REDDIT_CLIENT_SECRET', 'c6kmkCPJeCIqrF65v8MAXO6zJhPmPw'),
        user_agent=os.environ.get('REDDIT_USER_AGENT', 'RedditSentimentAPI/1.0 by PatrikSearchApp')
    )
    logger.info("Reddit API client initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Reddit API client: {e}")
    # Create a placeholder that will handle errors gracefully
    reddit = None

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
    """Initialize database with tables and indexes for better performance."""
    conn = get_db_connection()
    if conn is not None:
        try:
            cur = conn.cursor()
            
            # Create posts table if it doesn't exist
            cur.execute('''
                CREATE TABLE IF NOT EXISTS posts (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    score INTEGER,
                    num_comments INTEGER,
                    upvote_ratio REAL,
                    url TEXT,
                    author TEXT,
                    created_utc REAL,
                    selftext TEXT,
                    sentiment_neg REAL,
                    sentiment_neu REAL,
                    sentiment_pos REAL,
                    sentiment_compound REAL,
                    subreddit TEXT,
                    collected_at REAL
                )
            ''')
            
            # Create comments table if it doesn't exist
            cur.execute('''
                CREATE TABLE IF NOT EXISTS comments (
                    id TEXT PRIMARY KEY,
                    post_id TEXT,
                    author TEXT,
                    body TEXT,
                    score INTEGER,
                    created_utc REAL,
                    sentiment_neg REAL,
                    sentiment_neu REAL,
                    sentiment_pos REAL,
                    sentiment_compound REAL,
                    FOREIGN KEY (post_id) REFERENCES posts (id)
                )
            ''')
            
            # Create simple users table
            cur.execute('''
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL
                )
            ''')
            
            # Create indexes for better query performance
            cur.execute('CREATE INDEX IF NOT EXISTS idx_score ON posts (score)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_num_comments ON posts (num_comments)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_created_utc ON posts (created_utc)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_sentiment_compound ON posts (sentiment_compound)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_subreddit ON posts (subreddit)')
            
            conn.commit()
            logger.info("Database tables and indexes created successfully")
        except Error as e:
            logger.error(f"Error creating database: {e}")
        finally:
            conn.close()

# Initialize database when the application starts
with app.app_context():
    init_db()
    logger.info("Database initialized")

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

# Cache helper function - not using decorator
def check_cache(cache_key, timeout=CACHE_TIMEOUT):
    """Check if response is in cache."""
    if cache_key in cache['data'] and time.time() - cache['timestamp'][cache_key] < timeout:
        logger.info(f"Cache hit for {cache_key}")
        return cache['data'][cache_key]
    return None

def set_cache(cache_key, response):
    """Set response in cache."""
    cache['data'][cache_key] = response
    cache['timestamp'][cache_key] = time.time()
    logger.info(f"Cached response for {cache_key}")
    return response

def extract_text_for_wordcloud(posts):
    """Extract text from posts for word cloud."""
    combined_text = ""
    for post in posts:
        combined_text += post['title'] + " "
        if post['selftext']:
            combined_text += post['selftext'] + " "
    return combined_text

# Routes
@app.route('/', methods=['GET'])
def home():
    """Root route that provides a welcome message."""
    return jsonify({
        "message": "Welcome to the Reddit Sentiment Analysis API!",
        "version": "1.0.0",
        "endpoints": {
            "/search": "Live search Reddit posts",
            "/posts": "Get all posts with filtering options",
            "/posts/<post_id>/comments": "Get comments for a specific post",
            "/popular-subreddits": "Get list of popular subreddits",
            "/wordcloud": "Get word frequency data for word cloud visualization"
        }
    })

@app.route('/search', methods=['GET'])
def search_reddit():
    """Live search on Reddit."""
    q = request.args.get('q')
    if not q:
        return jsonify({'error': 'Missing search term'}), 400
    
    if reddit is None:
        return jsonify({'error': 'Reddit API client not initialized. Check your credentials.'}), 500
    
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
                'created_date': datetime.fromtimestamp(submission.created_utc).isoformat(),
                'author': str(submission.author)
            }
            
            results.append(post_data)
            
        return jsonify(results)
        
    except Exception as e:
        logger.error(f"Error in live search: {e}")
        return jsonify({'error': f'Search failed: {str(e)}'}), 500

@app.route('/posts', methods=['GET'])
def get_posts():
    """
    Retrieve posts from database with filtering options.
    """
    # Check cache
    cache_key = request.path + '?' + request.query_string.decode('utf-8')
    cached_response = check_cache(cache_key)
    if cached_response:
        return cached_response
    
    # Check if this is a search request that should be redirected to live search
    search_term = request.args.get('search')
    if search_term and request.args.get('live') == 'true':
        return search_reddit()
    
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
        filters.append("subreddit LIKE ?")
        params.append(f"%{sr}%")

    # Text search
    if search_term:
        wildcard = f"%{search_term}%"
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

    response = jsonify(posts_list)
    return set_cache(cache_key, response)

@app.route('/posts/<string:post_id>/comments', methods=['GET'])
def get_comments(post_id):
    """Get comments for a specific post."""
    # Check cache
    cache_key = request.path + '?' + request.query_string.decode('utf-8')
    cached_response = check_cache(cache_key, 300)  # 5 minutes timeout
    if cached_response:
        return cached_response
    
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Failed to connect to database"}), 500
        
    try:
        # First check if the post exists
        cur = conn.cursor()
        cur.execute('SELECT * FROM posts WHERE id = ?', (post_id,))
        post = cur.fetchone()
        
        if not post:
            return jsonify({"error": f"Post with ID {post_id} not found"}), 404
            
        # Fetch comments
        cur.execute(
            'SELECT * FROM comments WHERE post_id = ? ORDER BY score DESC', 
            (post_id,)
        )
        comments = [dict(row) for row in cur.fetchall()]
        
        # If no comments in database but reddit API is available, try to fetch them
        if not comments and reddit is not None:
            try:
                # Try to fetch comments from Reddit API
                submission = reddit.submission(id=post_id)
                
                # Replace more comments with their actual content (limited to avoid API rate limiting)
                submission.comments.replace_more(limit=0)
                
                comments = []
                # Get top-level comments
                for comment in list(submission.comments)[:10]:  # Limit to top 10
                    if not hasattr(comment, 'body'):  # Skip non-comment objects
                        continue
                        
                    # Analyze sentiment
                    sentiment = analyze_sentiment(comment.body)
                    
                    # Create comment data
                    comment_data = {
                        'id': comment.id,
                        'post_id': post_id,
                        'author': str(comment.author),
                        'body': comment.body,
                        'score': comment.score,
                        'created_utc': comment.created_utc,
                        'sentiment_neg': sentiment['neg'],
                        'sentiment_neu': sentiment['neu'],
                        'sentiment_pos': sentiment['pos'],
                        'sentiment_compound': sentiment['compound']
                    }
                    
                    # Insert into database for future requests
                    try:
                        sql = '''
                            INSERT OR REPLACE INTO comments(
                                id, post_id, author, body, score, created_utc,
                                sentiment_neg, sentiment_neu, sentiment_pos, sentiment_compound
                            )
                            VALUES(?,?,?,?,?,?,?,?,?,?)
                        '''
                        cur.execute(sql, (
                            comment_data['id'],
                            comment_data['post_id'],
                            comment_data['author'],
                            comment_data['body'],
                            comment_data['score'],
                            comment_data['created_utc'],
                            comment_data['sentiment_neg'],
                            comment_data['sentiment_neu'],
                            comment_data['sentiment_pos'],
                            comment_data['sentiment_compound']
                        ))
                        conn.commit()
                    except Exception as e:
                        logger.error(f"Error inserting comment {comment_data['id']}: {e}")
                    
                    # Add to results
                    comments.append(comment_data)
            except Exception as e:
                logger.error(f"Error fetching comments from Reddit API: {e}")
                # Continue with empty comments list
        
        conn.close()
        response = jsonify(comments)
        return set_cache(cache_key, response)
    except Exception as e:
        conn.close()
        logger.error(f"Error retrieving comments: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/popular-subreddits', methods=['GET'])
def get_popular_subreddits():
    """Get list of popular subreddits from database."""
    # Check cache
    cache_key = request.path
    cached_response = check_cache(cache_key, 3600)  # 1 hour cache
    if cached_response:
        return cached_response
    
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Failed to connect to database"}), 500
        
    try:
        cur = conn.cursor()
        cur.execute('''
            SELECT subreddit, COUNT(*) as count 
            FROM posts 
            WHERE subreddit IS NOT NULL AND subreddit != ''
            GROUP BY subreddit 
            ORDER BY count DESC 
            LIMIT 20
        ''')
        
        subreddits = [{"name": row[0], "count": row[1]} for row in cur.fetchall()]
        conn.close()
        
        response = jsonify(subreddits)
        return set_cache(cache_key, response)
    except Exception as e:
        if conn:
            conn.close()
        logger.error(f"Error fetching popular subreddits: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/wordcloud', methods=['GET'])
def get_wordcloud_data():
    """Get word frequency data for word cloud visualization."""
    # Get the posts first using the existing get_posts function
    # We'll reuse the query parameters for consistency
    cache_key = request.path + '?' + request.query_string.decode('utf-8')
    cached_response = check_cache(cache_key, 600)  # 10 minutes cache
    if cached_response:
        return cached_response
    
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Failed to connect to database"}), 500

    # Build query similar to get_posts but we only need title and selftext
    query = "SELECT title, selftext FROM posts"
    filters = []
    params = []

    # Reuse filters from get_posts
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
        filters.append("subreddit LIKE ?")
        params.append(f"%{sr}%")

    # Text search
    search_term = request.args.get('search')
    if search_term:
        wildcard = f"%{search_term}%"
        filters.append("(title LIKE ? OR selftext LIKE ?)")
        params.extend([wildcard, wildcard])

    # Combine filters
    if filters:
        query += " WHERE " + " AND ".join(filters)

    # Limit to 200 posts for performance
    query += " LIMIT 200"

    try:
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        posts = cur.fetchall()
        
        # Process the text
        all_text = " ".join([f"{post['title']} {post['selftext']}" for post in posts])
        
        # Clean text
        import re
        from collections import Counter
        
        # Convert to lowercase and remove punctuation
        text = re.sub(r'[^\w\s]', '', all_text.lower())
        
        # Split into words
        words = text.split()
        
        # Filter out common stop words
        stop_words = {'the', 'and', 'to', 'a', 'of', 'in', 'is', 'that', 'this', 'it', 
                      'for', 'with', 'on', 'as', 'are', 'be', 'was', 'were', 'by', 'at',
                      'or', 'not', 'from', 'an', 'but', 'they', 'you', 'i', 'he', 'she',
                      'we', 'his', 'her', 'their', 'our', 'what', 'which', 'who', 'when',
                      'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more',
                      'most', 'some', 'such', 'no', 'nor', 'too', 'very', 'can', 'will',
                      'just', 'should', 'now', 'also', 'if', 'has', 'have', 'had', 'do', 
                      'does', 'did', 'doing', 'than', 'then', 'so', 'here', 'there', 'get',
                      'got', 'getting', 'goes', 'going', 'went', 'about', 'would', 'could',
                      'should', 'https', 'www', 'http', 'com', 'org', 'net', 'html', 'php', 'jsp'}
        
        filtered_words = [word for word in words if word not in stop_words and len(word) > 2]
        
        # Count frequencies
        word_counts = Counter(filtered_words)
        
        # Get top 100 words
        top_words = word_counts.most_common(100)
        
        # Format for word cloud
        word_cloud_data = [{"text": word, "value": count} for word, count in top_words]
        
        conn.close()
        
        response = jsonify(word_cloud_data)
        return set_cache(cache_key, response)
    except Exception as e:
        if conn:
            conn.close()
        logger.error(f"Error generating word cloud data: {e}")
        return jsonify({"error": str(e)}), 500

# Simple user routes for basic authentication
@app.route('/auth/register', methods=['POST'])
def register():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Missing username or password'}), 400
        
    username = data.get('username')
    password = data.get('password')
    
    # Simple password hash
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE username = ?', (username,))
        if cursor.fetchone():
            conn.close()
            return jsonify({'message': 'Username already exists'}), 409
        
        cursor.execute(
            'INSERT INTO users (username, password_hash) VALUES (?, ?)',
            (username, password_hash)
        )
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'User registered successfully',
            'username': username
        }), 201
        
    except Exception as e:
        if conn:
            conn.close()
        logger.error(f"Registration error: {e}")
        return jsonify({'message': f'Registration failed: {str(e)}'}), 500

@app.route('/auth/login', methods=['POST'])
def login():
    data = request.get_json()
    
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Missing username or password'}), 400
        
    username = data.get('username')
    password = data.get('password')
    
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
        
    cursor = conn.cursor()
    cursor.execute('SELECT * FROM users WHERE username = ? AND password_hash = ?', 
                 (username, password_hash))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'message': 'Invalid username or password'}), 401
        
    conn.close()
    
    return jsonify({
        'message': 'Login successful',
        'username': username
    }), 200

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