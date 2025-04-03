from flask import Flask, jsonify, request
from flask_cors import CORS # type: ignore
import sqlite3
from sqlite3 import Error

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes
DATABASE = 'reddit_posts.db'

def get_db_connection():
    """Establish a connection to the SQLite database."""
    try:
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row  # enables dict-like access for rows
        return conn
    except Error as e:
        app.logger.error(f"Database connection error: {e}")
        return None

@app.route('/', methods=['GET'])
def home():
    """Root route that provides a welcome message."""
    return "Welcome to the Reddit Sentiment Analysis API!"

@app.route('/posts', methods=['GET'])
def get_posts():
    """
    Retrieve all posts from the database with optional filters.
    Supported query parameters:
      - min_score, max_score: Filter by post score.
      - min_comments, max_comments: Filter by number of comments.
      - min_upvote_ratio, max_upvote_ratio: Filter by upvote ratio.
      - start_date, end_date: Filter by creation time (epoch timestamp).
      - sentiment: Filter by sentiment type ('positive', 'negative', 'neutral').
                 * Positive: sentiment_compound > 0.05
                 * Negative: sentiment_compound < -0.05
                 * Neutral: sentiment_compound between -0.05 and 0.05
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

    # Filter by date range (created_utc, given as epoch timestamps)
    if request.args.get('start_date'):
        filters.append("created_utc >= ?")
        params.append(float(request.args.get('start_date')))
    if request.args.get('end_date'):
        filters.append("created_utc <= ?")
        params.append(float(request.args.get('end_date')))

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

    # Combine filters into the query
    if filters:
        query += " WHERE " + " AND ".join(filters)
    
    # Order results by creation time descending (most recent first)
    query += " ORDER BY created_utc DESC"

    try:
        cur = conn.cursor()
        cur.execute(query, tuple(params))
        posts = cur.fetchall()
    except Error as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

    conn.close()

    # Convert rows to dictionaries
    posts_list = [dict(post) for post in posts]
    return jsonify(posts_list)

@app.route('/posts/<post_id>', methods=['GET'])
def get_post(post_id):
    """Retrieve a single post by its ID."""
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Failed to connect to database"}), 500

    try:
        post = conn.execute('SELECT * FROM posts WHERE id = ?', (post_id,)).fetchone()
    except Error as e:
        conn.close()
        return jsonify({"error": str(e)}), 500

    conn.close()

    if post is None:
        return jsonify({'error': 'Post not found'}), 404
    return jsonify(dict(post))

if __name__ == '__main__':
    app.run(debug=True)
