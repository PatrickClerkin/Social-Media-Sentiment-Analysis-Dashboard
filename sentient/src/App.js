import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Update API_URL as needed
  const API_URL = "http://127.0.0.1:5000/posts";

  useEffect(() => {
    fetch(API_URL)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch posts.');
        }
        return response.json();
      })
      .then(data => {
        setPosts(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching posts:", err);
        setError(err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="loading">Loading posts...</div>;
  if (error) return <div className="error">Error loading posts: {error.message}</div>;

  return (
    <div className="App">
      <header className="header">
        <h1>Reddit Sentiment Dashboard</h1>
      </header>
      <div className="posts-container">
        {posts.map(post => (
          <div key={post.id} className="post-card">
            <h3 className="post-title">{post.title}</h3>
            <div className="post-details">
              <p className="post-info">
                <strong>Score:</strong> {post.score} &nbsp;|&nbsp;
                <strong>Comments:</strong> {post.num_comments}
              </p>
              <p className="post-sentiment">
                <strong>Sentiment:</strong> {post.sentiment && post.sentiment.compound ? post.sentiment.compound.toFixed(2) : 'N/A'}
              </p>
            </div>
            <a className="post-link" href={post.url} target="_blank" rel="noopener noreferrer">
              View Post
            </a>
          </div>
        ))}
      </div>
      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} Reddit Sentiment Dashboard</p>
      </footer>
    </div>
  );
}

export default App;
