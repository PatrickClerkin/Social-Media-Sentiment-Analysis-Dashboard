// App.js
import React, { useState, useEffect } from 'react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import './App.css';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

function App() {
  // State for posts data
  const [posts, setPosts] = useState([]);
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // State for pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(10);
  
  // State for filters
  const [filters, setFilters] = useState({
    minScore: '',
    maxScore: '',
    minComments: '',
    maxComments: '',
    sentiment: '',
    searchTerm: '',
  });
  
  // State for sorting
  const [sortConfig, setSortConfig] = useState({
    key: 'created_utc',
    direction: 'desc',
  });
  
  // State for visualization
  const [visualizationType, setVisualizationType] = useState('sentimentDistribution');
  
  // State for dark/light mode
  const [darkMode, setDarkMode] = useState(false);
  
  // Update API_URL as needed
  const API_URL = "http://127.0.0.1:5000/posts";

  // Fetch posts with filters
  const fetchPosts = () => {
    setLoading(true);
    
    // Build query parameters based on filters
    const queryParams = new URLSearchParams();
    if (filters.minScore) queryParams.append('min_score', filters.minScore);
    if (filters.maxScore) queryParams.append('max_score', filters.maxScore);
    if (filters.minComments) queryParams.append('min_comments', filters.minComments);
    if (filters.maxComments) queryParams.append('max_comments', filters.maxComments);
    if (filters.sentiment) queryParams.append('sentiment', filters.sentiment);
    
    // Construct URL with query parameters
    const url = `${API_URL}${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
    
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch posts.');
        }
        return response.json();
      })
      .then(data => {
        setPosts(data);
        applyClientSideFilters(data);
        setLoading(false);
      })
      .catch(err => {
        console.error("Error fetching posts:", err);
        setError(err);
        setLoading(false);
      });
  };

  // Initial fetch
  useEffect(() => {
    fetchPosts();
    // Apply dark mode from local storage if available
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
    document.body.className = savedDarkMode ? 'dark-mode' : '';
  }, []);

  // Apply client-side filters and sorting
  const applyClientSideFilters = (data) => {
    let result = [...data];
    
    // Apply search filter if exists
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      result = result.filter(post => 
        post.title.toLowerCase().includes(term) || 
        (post.selftext && post.selftext.toLowerCase().includes(term))
      );
    }
    
    // Apply sorting
    result.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (a[sortConfig.key] > b[sortConfig.key]) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
    
    setFilteredPosts(result);
  };

  // Handle filter changes
  useEffect(() => {
    if (posts.length > 0) {
      applyClientSideFilters(posts);
    }
  }, [filters.searchTerm, sortConfig, posts]);

  // Request Sort Function
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Handle filter form submission
  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchPosts();
  };

  // Handle filter input changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle search input changes (client-side filtering)
  const handleSearchChange = (e) => {
    const { value } = e.target;
    setFilters(prev => ({
      ...prev,
      searchTerm: value
    }));
  };

  // Toggle dark mode
  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.body.className = newMode ? 'dark-mode' : '';
    localStorage.setItem('darkMode', newMode.toString());
  };

  // Calculate sentiment class
  const getSentimentClass = (compound) => {
    if (compound > 0.05) return 'positive';
    if (compound < -0.05) return 'negative';
    return 'neutral';
  };

  // Format timestamp to readable date
  const formatDate = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  // Get current posts for pagination
  const indexOfLastPost = currentPage * postsPerPage;
  const indexOfFirstPost = indexOfLastPost - postsPerPage;
  const currentPosts = filteredPosts.slice(indexOfFirstPost, indexOfLastPost);

  // Change page
  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  // Prepare data for visualizations
  const prepareChartData = () => {
    if (visualizationType === 'sentimentDistribution') {
      const positive = filteredPosts.filter(post => post.sentiment_compound > 0.05).length;
      const neutral = filteredPosts.filter(post => post.sentiment_compound >= -0.05 && post.sentiment_compound <= 0.05).length;
      const negative = filteredPosts.filter(post => post.sentiment_compound < -0.05).length;
      
      return {
        labels: ['Positive', 'Neutral', 'Negative'],
        datasets: [
          {
            label: 'Number of Posts',
            data: [positive, neutral, negative],
            backgroundColor: ['rgba(75, 192, 192, 0.6)', 'rgba(255, 206, 86, 0.6)', 'rgba(255, 99, 132, 0.6)'],
            borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 206, 86, 1)', 'rgba(255, 99, 132, 1)'],
            borderWidth: 1,
          },
        ],
      };
    } else if (visualizationType === 'engagementVsSentiment') {
      // Sort posts by score for visualization
      const sortedPosts = [...filteredPosts].sort((a, b) => b.score - a.score).slice(0, 10);
      
      return {
        labels: sortedPosts.map(post => post.title.substring(0, 20) + '...'),
        datasets: [
          {
            label: 'Score',
            data: sortedPosts.map(post => post.score),
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
            yAxisID: 'y',
          },
          {
            label: 'Sentiment Compound',
            data: sortedPosts.map(post => post.sentiment_compound),
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1,
            type: 'line',
            yAxisID: 'y1',
          },
        ],
      };
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: visualizationType === 'engagementVsSentiment' ? {
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        title: {
          display: true,
          text: 'Score',
        },
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        grid: {
          drawOnChartArea: false,
        },
        title: {
          display: true,
          text: 'Sentiment',
        },
        min: -1,
        max: 1,
      },
    } : {},
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: visualizationType === 'sentimentDistribution' 
          ? 'Post Sentiment Distribution' 
          : 'Top Posts: Engagement vs Sentiment',
      },
    },
  };

  if (loading) return (
    <div className={`loading-container ${darkMode ? 'dark-mode' : ''}`}>
      <div className="spinner"></div>
      <p>Loading posts...</p>
    </div>
  );
  
  if (error) return (
    <div className={`error-container ${darkMode ? 'dark-mode' : ''}`}>
      <h2>Error</h2>
      <p>Error loading posts: {error.message}</p>
      <button onClick={fetchPosts} className="retry-button">Retry</button>
    </div>
  );

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <div className="header-content">
          <h1>Reddit Sentiment Dashboard</h1>
          <button onClick={toggleDarkMode} className="theme-toggle">
            {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
          </button>
        </div>
      </header>

      <div className="dashboard-container">
        <aside className="sidebar">
          <div className="filter-section">
            <h2>Filters</h2>
            <form onSubmit={handleFilterSubmit}>
              <div className="filter-group">
                <label>Score Range:</label>
                <div className="range-inputs">
                  <input
                    type="number"
                    name="minScore"
                    placeholder="Min"
                    value={filters.minScore}
                    onChange={handleFilterChange}
                  />
                  <span>to</span>
                  <input
                    type="number"
                    name="maxScore"
                    placeholder="Max"
                    value={filters.maxScore}
                    onChange={handleFilterChange}
                  />
                </div>
              </div>

              <div className="filter-group">
                <label>Comments Range:</label>
                <div className="range-inputs">
                  <input
                    type="number"
                    name="minComments"
                    placeholder="Min"
                    value={filters.minComments}
                    onChange={handleFilterChange}
                  />
                  <span>to</span>
                  <input
                    type="number"
                    name="maxComments"
                    placeholder="Max"
                    value={filters.maxComments}
                    onChange={handleFilterChange}
                  />
                </div>
              </div>

              <div className="filter-group">
                <label>Sentiment:</label>
                <select
                  name="sentiment"
                  value={filters.sentiment}
                  onChange={handleFilterChange}
                >
                  <option value="">All</option>
                  <option value="positive">Positive</option>
                  <option value="neutral">Neutral</option>
                  <option value="negative">Negative</option>
                </select>
              </div>

              <button type="submit" className="apply-filters">Apply Filters</button>
            </form>
          </div>

          <div className="stats-section">
            <h2>Statistics</h2>
            <div className="stat-item">
              <span>Total Posts:</span>
              <span>{filteredPosts.length}</span>
            </div>
            <div className="stat-item">
              <span>Average Score:</span>
              <span>
                {filteredPosts.length > 0
                  ? (filteredPosts.reduce((sum, post) => sum + post.score, 0) / filteredPosts.length).toFixed(2)
                  : 'N/A'}
              </span>
            </div>
            <div className="stat-item">
              <span>Average Comments:</span>
              <span>
                {filteredPosts.length > 0
                  ? (filteredPosts.reduce((sum, post) => sum + post.num_comments, 0) / filteredPosts.length).toFixed(2)
                  : 'N/A'}
              </span>
            </div>
            <div className="stat-item">
              <span>Average Sentiment:</span>
              <span>
                {filteredPosts.length > 0
                  ? (filteredPosts.reduce((sum, post) => sum + post.sentiment_compound, 0) / filteredPosts.length).toFixed(2)
                  : 'N/A'}
              </span>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <div className="toolbar">
            <div className="search-container">
              <input
                type="text"
                placeholder="Search posts..."
                value={filters.searchTerm}
                onChange={handleSearchChange}
                className="search-input"
              />
            </div>
            <div className="view-options">
              <label>Posts per page:</label>
              <select
                value={postsPerPage}
                onChange={(e) => setPostsPerPage(parseInt(e.target.value))}
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>
          </div>

          <div className="visualization-section">
            <div className="visualization-header">
              <h2>Visualizations</h2>
              <div className="visualization-toggle">
                <button
                  className={visualizationType === 'sentimentDistribution' ? 'active' : ''}
                  onClick={() => setVisualizationType('sentimentDistribution')}
                >
                  Sentiment Distribution
                </button>
                <button
                  className={visualizationType === 'engagementVsSentiment' ? 'active' : ''}
                  onClick={() => setVisualizationType('engagementVsSentiment')}
                >
                  Engagement vs Sentiment
                </button>
              </div>
            </div>
            <div className="chart-container">
              {visualizationType === 'sentimentDistribution' ? (
                <Bar data={prepareChartData()} options={chartOptions} />
              ) : (
                <Bar data={prepareChartData()} options={chartOptions} />
              )}
            </div>
          </div>

          <div className="posts-container">
            <h2>Reddit Posts</h2>
            <table className="posts-table">
              <thead>
                <tr>
                  <th onClick={() => requestSort('title')}>
                    Title
                    {sortConfig.key === 'title' && (
                      <span className="sort-indicator">
                        {sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}
                      </span>
                    )}
                  </th>
                  <th onClick={() => requestSort('score')}>
                    Score
                    {sortConfig.key === 'score' && (
                      <span className="sort-indicator">
                        {sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}
                      </span>
                    )}
                  </th>
                  <th onClick={() => requestSort('num_comments')}>
                    Comments
                    {sortConfig.key === 'num_comments' && (
                      <span className="sort-indicator">
                        {sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}
                      </span>
                    )}
                  </th>
                  <th onClick={() => requestSort('sentiment_compound')}>
                    Sentiment
                    {sortConfig.key === 'sentiment_compound' && (
                      <span className="sort-indicator">
                        {sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}
                      </span>
                    )}
                  </th>
                  <th onClick={() => requestSort('created_utc')}>
                    Date
                    {sortConfig.key === 'created_utc' && (
                      <span className="sort-indicator">
                        {sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}
                      </span>
                    )}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {currentPosts.map(post => (
                  <tr key={post.id}>
                    <td className="post-title-cell">{post.title}</td>
                    <td>{post.score}</td>
                    <td>{post.num_comments}</td>
                    <td>
                      <div className={`sentiment-badge ${getSentimentClass(post.sentiment_compound)}`}>
                        {post.sentiment_compound.toFixed(2)}
                      </div>
                    </td>
                    <td>{formatDate(post.created_utc)}</td>
                    <td>
                      <a href={post.url} target="_blank" rel="noopener noreferrer" className="view-button">
                        View Post
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pagination">
              <button
                onClick={() => paginate(currentPage - 1)}
                disabled={currentPage === 1}
                className="pagination-button"
              >
                Previous
              </button>
              <div className="page-info">
                Page {currentPage} of {Math.ceil(filteredPosts.length / postsPerPage)}
              </div>
              <button
                onClick={() => paginate(currentPage + 1)}
                disabled={currentPage >= Math.ceil(filteredPosts.length / postsPerPage)}
                className="pagination-button"
              >
                Next
              </button>
            </div>
          </div>
        </main>
      </div>

      <footer className="footer">
        <div className="footer-content">
          <p>&copy; {new Date().getFullYear()} Reddit Sentiment Dashboard</p>
          <p>Analyzing Reddit sentiment with VADER and React</p>
        </div>
      </footer>
    </div>
  );
}

export default App;