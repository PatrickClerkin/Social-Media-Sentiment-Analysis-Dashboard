import praw

# Initialize the Reddit instance with your credentials
reddit = praw.Reddit(
    client_id='HhQIW6ImodQPyWAFdJLv5g',          # Replace with your Client ID
    client_secret='c6kmkCPJeCIqrF65v8MAXO6zJhPmPw',  # Replace with your Client Secret
    user_agent='YourAppName by /u/YourUsername'
)

# Prompt the user for a subreddit name
subreddit_name = input("Enter the name of the subreddit to analyze: ")
subreddit = reddit.subreddit(subreddit_name)

# Fetch the top 5 hot posts and print their titles
print(f"\nTop posts from r/{subreddit_name}:\n")
for submission in subreddit.hot(limit=5):
    print(f"Title: {submission.title}")
    print(f"Score: {submission.score}")
    print(f"URL: {submission.url}\n")
