import praw
import json
import time
import logging
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

def fetch_posts(subreddit_name, limit=5):
    """Fetch posts from a given subreddit and analyze sentiment."""
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
            post_data = {
                "id": submission.id,
                "title": submission.title,
                "score": submission.score,
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

    # Fetch posts and display a brief summary
    posts = fetch_posts(subreddit_name, limit)
    if posts:
        for post in posts:
            print(f"Title: {post['title']} (Score: {post['score']}) | Sentiment: {post['sentiment']}")
        # Save posts to a JSON file
        save_posts_to_json(posts)
    else:
        logging.warning("No posts fetched.")

    # Uncomment below to schedule periodic fetching (e.g., every 5 minutes)
    # while True:
    #     posts = fetch_posts(subreddit_name, limit)
    #     if posts:
    #         timestamp = int(time.time())
    #         save_posts_to_json(posts, filename=f"posts_{timestamp}.json")
    #     time.sleep(300)  # wait for 5 minutes

if __name__ == "__main__":
    main()
