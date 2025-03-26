from flask import Flask, jsonify, request
import sqlite3

app = Flask(__name__)
DATABASE = 'reddit_posts.db'

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row  # Allows dict-like access to rows
    return conn

@app.route('/posts', methods=['GET'])
def get_posts():
    """Return all posts from the database."""
    conn = get_db_connection()
    posts = conn.execute('SELECT * FROM posts').fetchall()
    conn.close()
    posts_list = [dict(post) for post in posts]  # Convert rows to dictionaries
    return jsonify(posts_list)

@app.route('/posts/<post_id>', methods=['GET'])
def get_post(post_id):
    """Return a single post by its ID."""
    conn = get_db_connection()
    post = conn.execute('SELECT * FROM posts WHERE id = ?', (post_id,)).fetchone()
    conn.close()
    if post is None:
        return jsonify({'error': 'Post not found'}), 404
    return jsonify(dict(post))

if __name__ == '__main__':
    app.run(debug=True)
