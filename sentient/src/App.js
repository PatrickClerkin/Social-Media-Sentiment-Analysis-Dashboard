import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Update the API URL if needed (e.g., if deployed)
  const API_URL = "http://127.0.0.1:5000/posts";

  // Fetch posts from the Flask API on component mount
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
  }, [API_URL]);

  if (loading) return <div>Loading posts...</div>;
  if (error) return <div>Error loading posts: {error.message}</div>;

  return (
    <div className="App">
      <h1>Reddit Sentiment Analysis Dashboard</h1>
      <div className="posts-container">
        {posts.map(post => (
          <div key={post.id} className="post-card">
            <h3>{post.title}</h3>
            <p>
              Score: {post.score} | Comments: {post.num_comments}
            </p>
            <p>
              Sentiment Compound Score: {post.sentiment_compound ? post.sentiment_compound : post.sentiment ? post.sentiment.compound : 'N/A'}
            </p>
            <a href={post.url} target="_blank" rel="noopener noreferrer">
              View Post
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
