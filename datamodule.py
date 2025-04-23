import praw
import json
import time
import logging
import sqlite3
import argparse
import os
import re
import asyncio
import aiohttp
import concurrent.futures
from sqlite3 import Error
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
from datetime import datetime, timedelta

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("reddit_collector.log"),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# Database file name
DB_FILE = "reddit_posts.db"

class RedditDataCollector:
    """Class to handle Reddit data collection and storage."""
    
    def __init__(self, config_file="config.json"):
        """Initialize the collector with credentials from config file."""
        try:
            if os.path.exists(config_file):
                with open(config_file, 'r') as f:
                    config = json.load(f)
                    self.reddit = praw.Reddit(
                        client_id=config.get('client_id'),
                        client_secret=config.get('client_secret'),
                        user_agent=config.get('user_agent', 'RedditSentimentAnalyzer by u/YourUsername')
                    )
            else:
                # Use environment variables or default values if config file doesn't exist
                self.reddit = praw.Reddit(
                    client_id=os.environ.get('REDDIT_CLIENT_ID', 'HhQIW6ImodQPyWAFdJLv5g'),
                    client_secret=os.environ.get('REDDIT_CLIENT_SECRET', 'c6kmkCPJeCIqrF65v8MAXO6zJhPmPw'),
                    user_agent=os.environ.get('REDDIT_USER_AGENT', 'RedditSentimentAnalyzer by u/YourUsername')
                )
            
            logger.info("Successfully initialized Reddit API client")
            
            # Initialize VADER sentiment analyzer
            self.analyzer = SentimentIntensityAnalyzer()
            
            # Initialize database connection
            self.conn = self.create_connection(DB_FILE)
            if self.conn is not None:
                self.create_tables()
            else:
                logger.error("Failed to create database connection")
                raise Exception("Database connection failed")
                
        except Exception as e:
            logger.error(f"Initialization error: {e}")
            raise

    def create_connection(self, db_file):
        """Create a database connection to the SQLite database."""
        try:
            conn = sqlite3.connect(db_file)
            logger.info("Connected to SQLite database.")
            return conn
        except Error as e:
            logger.error(f"SQLite connection error: {e}")
            return None

    def create_tables(self):
        """Create the necessary database tables if they don't exist."""
        try:
            cur = self.conn.cursor()
            
            # Create posts table
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
            
            # Create subreddits table to track what we've collected
            cur.execute('''
                CREATE TABLE IF NOT EXISTS subreddits (
                    name TEXT PRIMARY KEY,
                    last_collected REAL,
                    status TEXT
                )
            ''')
            
            # Create comments table to store comments data
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
            
            # Create indexes for better query performance
            cur.execute('CREATE INDEX IF NOT EXISTS idx_posts_subreddit ON posts (subreddit)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_posts_created_utc ON posts (created_utc)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_posts_score ON posts (score)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_posts_sentiment ON posts (sentiment_compound)')
            cur.execute('CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments (post_id)')
            
            self.conn.commit()
            logger.info("Database tables created or already exist.")
        except Error as e:
            logger.error(f"Error creating tables: {e}")

    def insert_post(self, post):
        """Insert a post into the posts table."""
        try:
            sql = '''
                INSERT OR REPLACE INTO posts(
                    id, title, score, num_comments, upvote_ratio, url, author, 
                    created_utc, selftext, sentiment_neg, sentiment_neu, sentiment_pos, 
                    sentiment_compound, subreddit, collected_at
                )
                VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            '''
            cur = self.conn.cursor()
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
                post['sentiment']['compound'],
                post['subreddit'],
                time.time()
            ))
            self.conn.commit()
            return True
        except Error as e:
            logger.error(f"Error inserting post {post['id']}: {e}")
            return False

    def insert_comment(self, comment):
        """Insert a comment into the comments table."""
        try:
            sql = '''
                INSERT OR REPLACE INTO comments(
                    id, post_id, author, body, score, created_utc,
                    sentiment_neg, sentiment_neu, sentiment_pos, sentiment_compound
                )
                VALUES(?,?,?,?,?,?,?,?,?,?)
            '''
            cur = self.conn.cursor()
            cur.execute(sql, (
                comment['id'],
                comment['post_id'],
                comment['author'],
                comment['body'],
                comment['score'],
                comment['created_utc'],
                comment['sentiment']['neg'],
                comment['sentiment']['neu'],
                comment['sentiment']['pos'],
                comment['sentiment']['compound']
            ))
            self.conn.commit()
            return True
        except Error as e:
            logger.error(f"Error inserting comment {comment['id']}: {e}")
            return False

    def update_subreddit_status(self, subreddit_name, status="completed"):
        """Update the collection status for a subreddit."""
        try:
            sql = '''
                INSERT OR REPLACE INTO subreddits(name, last_collected, status)
                VALUES(?,?,?)
            '''
            cur = self.conn.cursor()
            cur.execute(sql, (subreddit_name, time.time(), status))
            self.conn.commit()
            return True
        except Error as e:
            logger.error(f"Error updating subreddit status for {subreddit_name}: {e}")
            return False
            
    def async_fetch_posts(self, subreddit_list, limit=100, sort_method="hot", time_filter="day", fetch_comments=False, max_comments=10):
        """
        Asynchronously fetch posts from multiple subreddits.
        
        Args:
            subreddit_list (list): List of subreddit names
            limit (int): Maximum number of posts to fetch per subreddit
            sort_method (str): Sorting method
            time_filter (str): Time filter for sorting
            fetch_comments (bool): Whether to fetch comments
            max_comments (int): Maximum comments per post
            
        Returns:
            dict: Results with subreddit names as keys and post counts as values
        """
        results = {}
        
                    # Use ThreadPoolExecutor for parallel processing
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
            # Submit tasks for each subreddit
            future_to_subreddit = {
                executor.submit(
                    self.fetch_posts, 
                    subreddit, 
                    limit, 
                    sort_method, 
                    time_filter, 
                    fetch_comments, 
                    max_comments
                ): subreddit for subreddit in subreddit_list
            }
            
            # Process results as they complete
            for future in concurrent.futures.as_completed(future_to_subreddit):
                subreddit = future_to_subreddit[future]
                try:
                    post_count = future.result()
                    results[subreddit] = post_count
                except Exception as e:
                    logger.error(f"Error in async fetch for {subreddit}: {e}")
                    results[subreddit] = 0
                    
        return results
        
    def export_to_json(self, output_file="reddit_data_export.json", days=7):
        """
        Export recent data to JSON file.
        
        Args:
            output_file (str): Output file path
            days (int): Number of days of data to export
            
        Returns:
            bool: Success status
        """
        try:
            # Calculate timestamp for filtering recent posts
            start_time = time.time() - (days * 86400)  # 86400 seconds in a day
            
            cur = self.conn.cursor()
            
            # Get posts
            cur.execute(
                "SELECT * FROM posts WHERE created_utc > ?", 
                (start_time,)
            )
            posts = [dict(row) for row in cur.fetchall()]
            
            # Get comments for these posts (if any)
            post_ids = [post["id"] for post in posts]
            comments_by_post = {}
            
            if post_ids:
                placeholders = ','.join(['?'] * len(post_ids))
                cur.execute(
                    f"SELECT * FROM comments WHERE post_id IN ({placeholders})",
                    post_ids
                )
                comments = [dict(row) for row in cur.fetchall()]
                
                # Organize comments by post_id
                for comment in comments:
                    post_id = comment["post_id"]
                    if post_id not in comments_by_post:
                        comments_by_post[post_id] = []
                    comments_by_post[post_id].append(comment)
            
            # Add comments to their respective posts
            for post in posts:
                post["comments"] = comments_by_post.get(post["id"], [])
            
            # Export to JSON
            data = {
                "posts": posts,
                "metadata": {
                    "export_time": time.time(),
                    "export_date": datetime.now().isoformat(),
                    "days_included": days,
                    "post_count": len(posts),
                    "comment_count": sum(len(post["comments"]) for post in posts)
                }
            }
            
            with open(output_file, "w") as f:
                json.dump(data, f, indent=4)
                
            logger.info(f"Successfully exported {len(posts)} posts to {output_file}")
            return True
            
        except Exception as e:
            logger.error(f"Error exporting data to JSON: {e}")
            return False
            
    def get_trending_subreddits(self, limit=10):
        """Get a list of trending subreddits to collect data from."""
        try:
            # Try to get trending subreddits from Reddit
            trending = list(self.reddit.trending_subreddits())
            if trending and len(trending) > 0:
                return trending[:limit]
            
            # Fallback to popular subreddits
            popular = [subreddit.display_name for subreddit in self.reddit.subreddits.popular(limit=limit)]
            return popular
            
        except Exception as e:
            logger.error(f"Error getting trending subreddits: {e}")
            # Return default list of popular subreddits
            return ["news", "worldnews", "politics", "science", "technology", 
                    "askreddit", "explainlikeimfive", "todayilearned", "iama", "movies"]
    
    def close(self):
        """Close the database connection."""
        if self.conn:
            self.conn.close()
            logger.info("Database connection closed.")
            
    def __enter__(self):
        """Context manager enter."""
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()

# Main function to run the collector
def main():
    """Main function to run the Reddit data collector."""
    parser = argparse.ArgumentParser(description="Reddit Sentiment Data Collector")
    
    # Add command line arguments
    parser.add_argument("-s", "--subreddits", nargs="+", help="List of subreddits to collect")
    parser.add_argument("-l", "--limit", type=int, default=100, help="Number of posts to collect per subreddit")
    parser.add_argument("-m", "--method", default="hot", choices=["hot", "new", "top", "rising", "controversial"], 
                        help="Sorting method")
    parser.add_argument("-t", "--time", default="day", choices=["hour", "day", "week", "month", "year", "all"], 
                        help="Time filter for top/controversial")
    parser.add_argument("-c", "--comments", action="store_true", help="Collect comments")
    parser.add_argument("--max-comments", type=int, default=10, help="Maximum comments per post")
    parser.add_argument("-e", "--export", action="store_true", help="Export to JSON after collection")
    parser.add_argument("-d", "--days", type=int, default=7, help="Days of data to include in export")
    parser.add_argument("--trending", action="store_true", help="Collect from trending subreddits")
    parser.add_argument("--config", default="config.json", help="Path to config file")
    
    args = parser.parse_args()
    
    try:
        # Initialize collector
        with RedditDataCollector(config_file=args.config) as collector:
            subreddits = args.subreddits
            
            # If no subreddits specified and trending flag set, get trending subreddits
            if not subreddits and args.trending:
                subreddits = collector.get_trending_subreddits()
                logger.info(f"Using trending subreddits: {', '.join(subreddits)}")
                
            # If still no subreddits, prompt user
            if not subreddits:
                input_subreddits = input("Enter subreddits to analyze (comma-separated): ")
                subreddits = [s.strip() for s in input_subreddits.split(",")]
            
            # Start collection
            if len(subreddits) > 1:
                # Use async collection for multiple subreddits
                results = collector.async_fetch_posts(
                    subreddits,
                    limit=args.limit,
                    sort_method=args.method,
                    time_filter=args.time,
                    fetch_comments=args.comments,
                    max_comments=args.max_comments
                )
                
                # Print results
                total_posts = sum(results.values())
                logger.info(f"Collected {total_posts} posts from {len(results)} subreddits:")
                for subreddit, count in results.items():
                    logger.info(f"  - r/{subreddit}: {count} posts")
            else:
                # Single subreddit collection
                subreddit = subreddits[0]
                post_count = collector.fetch_posts(
                    subreddit,
                    limit=args.limit,
                    sort_method=args.method,
                    time_filter=args.time,
                    fetch_comments=args.comments,
                    max_comments=args.max_comments
                )
                logger.info(f"Collected {post_count} posts from r/{subreddit}")
                
            # Export if requested
            if args.export:
                export_file = f"reddit_data_{datetime.now().strftime('%Y%m%d')}.json"
                collector.export_to_json(output_file=export_file, days=args.days)
                logger.info(f"Data exported to {export_file}")
                
    except KeyboardInterrupt:
        logger.info("Collection interrupted by user")
    except Exception as e:
        logger.error(f"Error in main function: {e}")
        return 1
        
    return 0

if __name__ == "__main__":
    exit(main())

    def analyze_sentiment(self, text):
        """Analyze sentiment of text using VADER."""
        try:
            if not text:
                return self.analyzer.polarity_scores("")
            return self.analyzer.polarity_scores(text)
        except Exception as e:
            logger.error(f"Error analyzing sentiment: {e}")
            # Return neutral sentiment in case of error
            return {'neg': 0, 'neu': 1, 'pos': 0, 'compound': 0}

    def fetch_posts(self, subreddit_name, limit=100, sort_method="hot", time_filter="day", fetch_comments=False, max_comments=10):
        """
        Fetch posts from a given subreddit.
        
        Args:
            subreddit_name (str): Name of the subreddit
            limit (int): Maximum number of posts to fetch
            sort_method (str): One of "hot", "new", "top", "rising", "controversial"
            time_filter (str): One of "hour", "day", "week", "month", "year", "all"
            fetch_comments (bool): Whether to fetch comments for each post
            max_comments (int): Maximum number of comments to fetch per post
            
        Returns:
            int: Number of posts successfully processed
        """
        try:
            subreddit = self.reddit.subreddit(subreddit_name)
            posts_collected = 0
            
            # Select the appropriate sorting method
            if sort_method == "hot":
                submissions = subreddit.hot(limit=limit)
            elif sort_method == "new":
                submissions = subreddit.new(limit=limit)
            elif sort_method == "top":
                submissions = subreddit.top(limit=limit, time_filter=time_filter)
            elif sort_method == "rising":
                submissions = subreddit.rising(limit=limit)
            elif sort_method == "controversial":
                submissions = subreddit.controversial(limit=limit, time_filter=time_filter)
            else:
                logger.warning(f"Invalid sort method: {sort_method}. Using 'hot' instead.")
                submissions = subreddit.hot(limit=limit)
            
            for submission in submissions:
                # Combine title and selftext for sentiment analysis
                text_to_analyze = submission.title
                if submission.selftext:
                    text_to_analyze += " " + submission.selftext
                    
                # Analyze sentiment
                sentiment = self.analyze_sentiment(text_to_analyze)
                
                # Create a dictionary with post data
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
                    "sentiment": sentiment,
                    "subreddit": subreddit_name
                }
                
                # Insert post into database
                if self.insert_post(post_data):
                    posts_collected += 1
                    
                    # Fetch comments if requested
                    if fetch_comments and submission.num_comments > 0:
                        try:
                            # Load only top-level comments to avoid API rate limiting issues
                            submission.comments.replace_more(limit=0)
                            for comment in list(submission.comments)[:max_comments]:
                                if not hasattr(comment, 'body'):  # Skip non-comment objects
                                    continue
                                    
                                # Analyze comment sentiment
                                comment_sentiment = self.analyze_sentiment(comment.body)
                                
                                # Create comment data dictionary
                                comment_data = {
                                    "id": comment.id,
                                    "post_id": submission.id,
                                    "author": str(comment.author),
                                    "body": comment.body,
                                    "score": comment.score,
                                    "created_utc": comment.created_utc,
                                    "sentiment": comment_sentiment
                                }
                                
                                # Insert comment into database
                                self.insert_comment(comment_data)
                                
                        except Exception as e:
                            logger.error(f"Error fetching comments for post {submission.id}: {e}")
            
            # Update subreddit status
            self.update_subreddit_status(subreddit_name)
            
            logger.info(f"Successfully collected {posts_collected} posts from r/{subreddit_name}")
            return posts_collected
            
        except Exception as e:
            logger.error(f"Error fetching posts from r/{subreddit_name}: {e}")
            # Update subreddit status with error
            self.update_subreddit_status(subreddit_name, status=f"error: {str(e)}")
            return 0