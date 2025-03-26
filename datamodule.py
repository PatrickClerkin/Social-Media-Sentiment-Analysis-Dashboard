import praw
import json
import time
import logging
import sqlite3
from sqlite3 import Error
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Initialize Reddit instance with your credentials
reddit = praw.Reddit(
    client_id='HhQIW6ImodQPyWAFdJLv5g',          
    client_secret='c6kmkCPJeCIqrF65v8MAXO6zJhPmPw',  
    user_agent='YourAppName by /u/YourUsername'
)

# Initialize VADER sentiment analyzer
analyzer = SentimentIntensityAnalyzer()

# Database file name
DB_FILE = "reddit_posts.db"

def create_connection(db_file):
    """Create a database connection to the SQLite database."""
    try:
        conn = sqlite3.connect(db_file)
        logging.info("Connected to SQLite database.")
        return conn
    except Error as e:
        logging.error(f"SQLite connection error: {e}")
        return None

def create_table(conn):
    """Create the posts table if it doesn't exist."""
    try:
        cur = conn.cursor()
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
                sentiment_compound REAL
            )
        ''')
        conn.commit()
        logging.info("Posts table created or already exists.")
    except Error as e:
        logging.error(f"Error creating table: {e}")

def insert_post(conn, post):
    """Insert a post into the posts table."""
    try:
        sql = '''
            INSERT OR REPLACE INTO posts(id, title, score, num_comments, upvote_ratio, url, author, created_utc, selftext, sentiment_neg, sentiment_neu, sentiment_pos, sentiment_compound)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)
        '''
        cur = conn.cursor()
        cur.execute(sql, (
            post['id'],
            post['title'],
            post['score'],
            post['num_comments'],
            post['upvote_ratio'],
            post['url'],
            post['author'],
            post['created_utc'],
            post['selftext'],
            post['sentiment']['neg'],
            post['sentiment']['neu'],
            post['sentiment']['pos'],
            post['sentiment']['compound']
        ))
        conn.commit()
        logging.info(f"Inserted/updated post: {post['id']}")
    except Error as e:
        logging.error(f"Error inserting post {post['id']}: {e}")

def fetch_posts(subreddit_name, limit=5):
    """Fetch posts from a given subreddit, including engagement metrics and sentiment analysis."""
    try:
        subreddit = reddit.subreddit(subreddit_name)
        posts = []
        for submission in subreddit.hot(limit=limit):
            # Combine title and selftext for sentiment analysis
            text_to_analyze = submission.title
            if submission.selftext:
                text_to_analyze += " " + submission.selftext
            # Analyze sentiment
            sentiment = analyzer.polarity_scores(text_to_analyze)
            # Create a dictionary with post data and engagement metrics
            post_data = {
                "id": submission.id,
                "title": submission.title,
                "score": submission.score,
                "num_comments": submission.num_comments,
                "upvote_ratio": submission.upvote_ratio,
                "url": submission.url,
                "author": str(submission.author),
                "created_utc": submission.created_utc,
                "selftext": submission.selftext,
                "sentiment": sentiment
            }
            posts.append(post_data)
        logging.info(f"Fetched {len(posts)} posts from r/{subreddit_name}")
        return posts
    except Exception as e:
        logging.error(f"Error fetching posts: {e}")
        return []

def save_posts_to_json(posts, filename="posts.json"):
    """Save posts to a JSON file."""
    try:
        with open(filename, "w") as f:
            json.dump(posts, f, indent=4)
        logging.info(f"Saved {len(posts)} posts to {filename}")
    except Exception as e:
        logging.error(f"Error saving posts: {e}")

def main():
    subreddit_name = input("Enter the name of the subreddit to analyze: ")
    try:
        limit = int(input("Enter the number of posts to fetch: "))
    except ValueError:
        limit = 5
        logging.info("Invalid number entered. Defaulting to 5 posts.")

    # Create database connection and table
    conn = create_connection(DB_FILE)
    if conn is not None:
        create_table(conn)
    else:
        logging.error("Failed to create database connection. Exiting.")
        return

    # Fetch posts
    posts = fetch_posts(subreddit_name, limit)
    if posts:
        for post in posts:
            print(f"Title: {post['title']} (Score: {post['score']}) | Sentiment: {post['sentiment']}")
            insert_post(conn, post)
        # Optionally, also save to JSON if needed
        save_posts_to_json(posts)
    else:
        logging.warning("No posts fetched.")

    # Optionally, close the connection
    if conn:
        conn.close()

if __name__ == "__main__":
    main()
