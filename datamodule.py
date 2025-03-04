import praw
import json
import time

# Initialize the Reddit instance with your credentials
reddit = praw.Reddit(
    client_id='HhQIW6ImodQPyWAFdJLv5g',          # Replace with your Client ID
    client_secret='c6kmkCPJeCIqrF65v8MAXO6zJhPmPw',  # Replace with your Client Secret
    user_agent='YourAppName by /u/YourUsername'
)

def fetch_posts(subreddit_name, limit=5):
    """Fetch posts from a given subreddit."""
    try:
        subreddit = reddit.subreddit(subreddit_name)
        posts = []
        for submission in subreddit.hot(limit=limit):
            post_data = {
                "id": submission.id,
                "title": submission.title,
                "score": submission.score,
                "url": submission.url,
                "author": str(submission.author),
                "created_utc": submission.created_utc,
                "selftext": submission.selftext
            }
            posts.append(post_data)
        return posts
    except Exception as e:
        print(f"Error fetching posts: {e}")
        return []

def save_posts_to_json(posts, filename="posts.json"):
    """Save posts to a JSON file."""
    try:
        with open(filename, "w") as f:
            json.dump(posts, f, indent=4)
        print(f"Saved {len(posts)} posts to {filename}")
    except Exception as e:
        print(f"Error saving posts: {e}")

def main():
    subreddit_name = input("Enter the name of the subreddit to analyze: ")
    try:
        limit = int(input("Enter the number of posts to fetch: "))
    except ValueError:
        limit = 5
        print("Invalid number entered. Defaulting to 5 posts.")
    
    # Fetch posts and display a brief summary
    posts = fetch_posts(subreddit_name, limit)
    if posts:
        for post in posts:
            print(f"Title: {post['title']} (Score: {post['score']})")
        # Save posts to a JSON file
        save_posts_to_json(posts)
    else:
        print("No posts fetched.")
    
    # Optionally: Uncomment the following block to fetch posts periodically.
    # while True:
    #     posts = fetch_posts(subreddit_name, limit)
    #     if posts:
    #         timestamp = int(time.time())
    #         save_posts_to_json(posts, filename=f"posts_{timestamp}.json")
    #     time.sleep(300)  # wait for 5 minutes before fetching again

if __name__ == "__main__":
    main()
