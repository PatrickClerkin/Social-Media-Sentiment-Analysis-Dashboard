import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import './App.css';

// Colors for visualizations
const COLORS = {
  positive: '#4caf50',
  neutral: '#ff9800',
  negative: '#f44336',
  charts: ['#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0', '#3f51b5']
};

// Simple word cloud component
const WordCloud = ({ words }) => {
  if (!words || words.length === 0) {
    return <div className="no-data-message">No word data available</div>;
  }

  // Calculate font sizes based on frequency
  const maxFreq = Math.max(...words.map(word => word.value));
  const minFreq = Math.min(...words.map(word => word.value));
  const range = maxFreq - minFreq;
  
  return (
    <div className="word-cloud">
      {words.map((word, index) => {
        // Calculate size between 14 and 40 based on frequency
        const size = word.value === minFreq 
          ? 14 
          : 14 + Math.floor((word.value - minFreq) / range * 26);
        
        // Random position
        const randomX = Math.floor(Math.random() * 70) + 15; // 15-85%
        const randomY = Math.floor(Math.random() * 70) + 15; // 15-85%
        
        // Random color from the charts array
        const colorIndex = index % COLORS.charts.length;
        
        return (
          <span 
            key={word.text} 
            className="word-cloud-item"
            style={{
              fontSize: `${size}px`,
              position: 'absolute',
              left: `${randomX}%`,
              top: `${randomY}%`,
              color: COLORS.charts[colorIndex],
              transform: 'translate(-50%, -50%)',
              zIndex: size
            }}
          >
            {word.text}
          </span>
        );
      })}
    </div>
  );
};

function App() {
  // State for posts data
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLiveSearch, setIsLiveSearch] = useState(false);

  // State for filters
  const [filters, setFilters] = useState({
    minScore: '',
    maxScore: '',
    minComments: '',
    maxComments: '',
    sentiment: '',
    searchTerm: '',
    subreddit: '',
  });

  // State for sorting
  const [sortConfig, setSortConfig] = useState({
    key: 'created_utc',
    direction: 'desc',
  });

  // State for visualization
  const [visualizationType, setVisualizationType] = useState('sentimentDistribution');
  
  // State for dark/light mode
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode !== null) return savedMode === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // State for search options
  const [searchOptions, setSearchOptions] = useState({
    searchMethod: 'database', // 'database' or 'live'
    sortMethod: 'relevance',  // 'relevance', 'hot', 'new', 'top'
    timeFilter: 'all',        // 'hour', 'day', 'week', 'month', 'year', 'all'
  });

  // State for post detail modal
  const [selectedPost, setSelectedPost] = useState(null);
  
  // State for comments in post detail modal
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);
  
  // State for auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(60); // seconds
  
  // State for popular subreddits
  const [popularSubreddits, setPopularSubreddits] = useState([]);
  const [loadingSubreddits, setLoadingSubreddits] = useState(false);
  
  // State for word cloud data
  const [wordCloudData, setWordCloudData] = useState([]);
  const [loadingWordCloud, setLoadingWordCloud] = useState(false);

  // Base API URL
  const BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

  // Fetch posts
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIsLiveSearch(false);

    try {
      // Build URL and parameters based on search method and filters
      let url = `${BASE_URL}/posts`;
      const params = new URLSearchParams();
      
      // If search term is set, determine if we should use live search
      if (filters.searchTerm && searchOptions.searchMethod === 'live') {
        url = `${BASE_URL}/search`;
        params.append('q', filters.searchTerm);
        params.append('sort', searchOptions.sortMethod);
        params.append('time_filter', searchOptions.timeFilter);
        
        if (filters.subreddit) {
          params.append('subreddit', filters.subreddit);
        }
        
        setIsLiveSearch(true);
      } else {
        // Regular database search with all filters
        if (filters.minScore) params.append('min_score', filters.minScore);
        if (filters.maxScore) params.append('max_score', filters.maxScore);
        if (filters.minComments) params.append('min_comments', filters.minComments);
        if (filters.maxComments) params.append('max_comments', filters.maxComments);
        if (filters.sentiment) params.append('sentiment', filters.sentiment);
        if (filters.subreddit) params.append('subreddit', filters.subreddit);
        if (filters.searchTerm) params.append('search', filters.searchTerm);
        
        // Sorting parameters
        params.append('sort_by', sortConfig.key);
        params.append('order', sortConfig.direction);
        
        // Add live parameter for the backend to decide whether to redirect to live search
        if (searchOptions.searchMethod === 'live') {
          params.append('live', 'true');
        }
      }

      // Final URL with query parameters
      const finalUrl = `${url}${params.toString() ? '?' + params.toString() : ''}`;
      console.log("Fetching from URL:", finalUrl);
      
      // Execute the fetch request
      const response = await fetch(finalUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setPosts(data);
      
      // If it's a word cloud view, fetch word cloud data
      if (visualizationType === 'wordCloud') {
        fetchWordCloudData();
      }
    } catch (error) {
      console.error('Error fetching posts:', error);
      setError(error.message || 'Failed to fetch posts');
    } finally {
      setLoading(false);
    }
  }, [BASE_URL, filters, searchOptions, sortConfig, visualizationType]);

  // Fetch comments for a post
  const fetchComments = useCallback(async (postId) => {
    setLoadingComments(true);
    
    try {
      const url = `${BASE_URL}/posts/${postId}/comments`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setComments(data);
    } catch (error) {
      console.error('Error fetching comments:', error);
      setComments([]);
    } finally {
      setLoadingComments(false);
    }
  }, [BASE_URL]);
  
  // Fetch popular subreddits
  const fetchPopularSubreddits = useCallback(async () => {
    setLoadingSubreddits(true);
    
    try {
      const url = `${BASE_URL}/popular-subreddits`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setPopularSubreddits(data);
    } catch (error) {
      console.error('Error fetching popular subreddits:', error);
      setPopularSubreddits([]);
    } finally {
      setLoadingSubreddits(false);
    }
  }, [BASE_URL]);
  
  // Fetch word cloud data
  const fetchWordCloudData = useCallback(async () => {
    setLoadingWordCloud(true);
    
    try {
      // Build URL and parameters based on current filters
      const url = `${BASE_URL}/wordcloud`;
      const params = new URLSearchParams();
      
      // Add the same filters as for posts
      if (filters.minScore) params.append('min_score', filters.minScore);
      if (filters.maxScore) params.append('max_score', filters.maxScore);
      if (filters.minComments) params.append('min_comments', filters.minComments);
      if (filters.maxComments) params.append('max_comments', filters.maxComments);
      if (filters.sentiment) params.append('sentiment', filters.sentiment);
      if (filters.subreddit) params.append('subreddit', filters.subreddit);
      if (filters.searchTerm) params.append('search', filters.searchTerm);
      
      const finalUrl = `${url}${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(finalUrl);
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setWordCloudData(data);
    } catch (error) {
      console.error('Error fetching word cloud data:', error);
      setWordCloudData([]);
    } finally {
      setLoadingWordCloud(false);
    }
  }, [BASE_URL, filters]);

  // Initial fetch
  useEffect(() => {
    fetchPosts();
    fetchPopularSubreddits();
    
    // Apply dark mode
    document.body.className = darkMode ? 'dark-mode' : '';
  }, [fetchPosts, fetchPopularSubreddits, darkMode]);
  
  // Set up auto-refresh
  useEffect(() => {
    let intervalId;
    
    if (autoRefresh && isLiveSearch) {
      intervalId = setInterval(() => {
        fetchPosts();
      }, autoRefreshInterval * 1000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [autoRefresh, isLiveSearch, autoRefreshInterval, fetchPosts]);

  // Filter form submission
  const handleFilterSubmit = useCallback((e) => {
    e.preventDefault();
    fetchPosts();
  }, [fetchPosts]);

  // Filter input change
  const handleFilterChange = useCallback((e) => {
    const { name, value } = e.target;
    
    // Input validation for numeric fields
    if (['minScore', 'maxScore', 'minComments', 'maxComments'].includes(name)) {
      // Allow empty value or numbers
      if (value === '' || /^-?\d*$/.test(value)) {
        setFilters(prev => ({ ...prev, [name]: value }));
      }
    } else {
      setFilters(prev => ({ ...prev, [name]: value }));
    }
  }, []);

  // Search options change handler
  const handleSearchOptionsChange = useCallback((e) => {
    const { name, value } = e.target;
    
    // Handle checkbox inputs
    const actualValue = e.target.type === 'checkbox' ? e.target.checked : value;
    
    setSearchOptions(prev => ({ ...prev, [name]: actualValue }));
  }, []);

  // Toggle dark mode
  const toggleDarkMode = useCallback(() => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.body.className = newMode ? 'dark-mode' : '';
    localStorage.setItem('darkMode', newMode.toString());
  }, [darkMode]);

  // Request sort
  const requestSort = useCallback((key) => {
    setSortConfig(prevConfig => {
      const direction = prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc';
      return { key, direction };
    });
    
    if (!isLiveSearch) {
      // Only re-fetch if not a live search result
      fetchPosts();
    } else {
      // Client-side sorting for live search results
      setPosts(prevPosts => {
        return [...prevPosts].sort((a, b) => {
          if (key === 'title' || key === 'subreddit' || key === 'author') {
            // String comparison
            const aValue = (a[key] || '').toLowerCase();
            const bValue = (b[key] || '').toLowerCase();
            return sortConfig.direction === 'asc' 
              ? aValue.localeCompare(bValue)
              : bValue.localeCompare(aValue);
          } else {
            // Numeric comparison
            const aValue = a[key] || 0;
            const bValue = b[key] || 0;
            return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
          }
        });
      });
    }
  }, [isLiveSearch, fetchPosts, sortConfig.direction]);

  // Get sentiment class
  const getSentimentClass = useCallback((compound) => {
    if (compound > 0.05) return 'positive';
    if (compound < -0.05) return 'negative';
    return 'neutral';
  }, []);

  // Format date
  const formatDate = useCallback((ts, formatType = 'default') => {
    if (!ts) return 'N/A';
    
    const date = new Date(ts * 1000);
    
    switch (formatType) {
      case 'time':
        return date.toLocaleTimeString();
      case 'date':
        return date.toLocaleDateString();
      case 'relative':
        // Calculate relative time (e.g., "3 hours ago")
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHour = Math.floor(diffMin / 60);
        const diffDay = Math.floor(diffHour / 24);
        
        if (diffDay > 0) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
        if (diffHour > 0) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
        if (diffMin > 0) return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
        return 'Just now';
      default:
        return date.toLocaleString();
    }
  }, []);

  // Open post detail modal
  const openPostDetail = useCallback((post) => {
    setSelectedPost(post);
    fetchComments(post.id);
  }, [fetchComments]);

  // Close post detail modal
  const closePostDetail = useCallback(() => {
    setSelectedPost(null);
    setComments([]);
  }, []);
  
  // Apply sentiment filter quickly
  const applySentimentFilter = useCallback((sentiment) => {
    setFilters(prev => ({ 
      ...prev, 
      sentiment: prev.sentiment === sentiment ? '' : sentiment 
    }));
    setTimeout(() => fetchPosts(), 0);
  }, [fetchPosts]);
  
  // Apply subreddit filter
  const applySubredditFilter = useCallback((subreddit) => {
    setFilters(prev => ({ ...prev, subreddit }));
    setTimeout(() => fetchPosts(), 0);
  }, [fetchPosts]);
  
  // Export to CSV
  const exportToCsv = useCallback(() => {
    // Define the columns
    const headers = [
      'title', 'subreddit', 'score', 'num_comments', 
      'sentiment_compound', 'created_date', 'author'
    ];
    
    // Create CSV header row
    let csvContent = headers.join(',') + '\n';
    
    // Add data rows
    posts.forEach(post => {
      const row = headers.map(header => {
        // Properly escape and format cell values
        let value = post[header] || '';
        // Escape quotes and commas for CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvContent += row.join(',') + '\n';
    });
    
    // Create download link
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `reddit_posts_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [posts]);

  // Prepare visualization data
  const visualizationData = useMemo(() => {
    if (!posts.length) return [];
    
    switch (visualizationType) {
      case 'sentimentDistribution': {
        const positive = posts.filter(post => post.sentiment_compound > 0.05).length;
        const neutral = posts.filter(post => post.sentiment_compound >= -0.05 && post.sentiment_compound <= 0.05).length;
        const negative = posts.filter(post => post.sentiment_compound < -0.05).length;
        
        return [
          { name: 'Positive', value: positive, fill: COLORS.positive },
          { name: 'Neutral', value: neutral, fill: COLORS.neutral },
          { name: 'Negative', value: negative, fill: COLORS.negative }
        ];
      }
      
      case 'sentimentOverTime': {
        // Group posts by day
        const postsByDay = {};
        
        posts.forEach(post => {
          // Convert timestamp to date string (YYYY-MM-DD)
          const date = new Date(post.created_utc * 1000).toISOString().split('T')[0];
          
          if (!postsByDay[date]) {
            postsByDay[date] = {
              positive: 0,
              neutral: 0,
              negative: 0,
              total: 0,
              sentimentSum: 0
            };
          }
          
          // Increment the appropriate sentiment counter
          if (post.sentiment_compound > 0.05) {
            postsByDay[date].positive += 1;
          } else if (post.sentiment_compound < -0.05) {
            postsByDay[date].negative += 1;
          } else {
            postsByDay[date].neutral += 1;
          }
          
          // Update totals
          postsByDay[date].total += 1;
          postsByDay[date].sentimentSum += post.sentiment_compound;
        });
        
        // Calculate averages and format for chart
        return Object.keys(postsByDay)
          .sort() // Sort dates chronologically
          .map(date => {
            const dayData = postsByDay[date];
            return {
              date,
              positive: dayData.positive,
              neutral: dayData.neutral,
              negative: dayData.negative,
              avgSentiment: dayData.sentimentSum / dayData.total
            };
          });
      }
      
      case 'engagementVsSentiment': {
        // Get top 10 posts by score for visualization
        return [...posts]
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map(post => ({
            name: post.title.substring(0, 20) + '...',
            score: post.score,
            comments: post.num_comments,
            sentiment: post.sentiment_compound
          }));
      }
      
      case 'sentimentTrend': {
        // Sort posts by date and show sentiment trend
        return [...posts]
          .sort((a, b) => a.created_utc - b.created_utc)
          .map(post => ({
            date: formatDate(post.created_utc, 'date'),
            sentiment: post.sentiment_compound,
            title: post.title,
            id: post.id
          }));
      }
      
      default:
        return [];
    }
  }, [posts, visualizationType, formatDate]);

  // Stats data
  const statsData = useMemo(() => {
    if (!posts.length) return {
      totalPosts: 0,
      avgScore: 'N/A',
      avgComments: 'N/A',
      avgSentiment: 'N/A',
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 }
    };
    
    const total = posts.length;
    const avgScore = posts.reduce((sum, post) => sum + post.score, 0) / total;
    const avgComments = posts.reduce((sum, post) => sum + post.num_comments, 0) / total;
    const avgSentiment = posts.reduce((sum, post) => sum + post.sentiment_compound, 0) / total;
    
    const positive = posts.filter(post => post.sentiment_compound > 0.05).length;
    const neutral = posts.filter(post => post.sentiment_compound >= -0.05 && post.sentiment_compound <= 0.05).length;
    const negative = posts.filter(post => post.sentiment_compound < -0.05).length;
    
    return {
      totalPosts: total,
      avgScore: avgScore.toFixed(2),
      avgComments: avgComments.toFixed(2),
      avgSentiment: avgSentiment.toFixed(2),
      sentimentBreakdown: {
        positive,
        neutral,
        negative,
        positivePercent: ((positive / total) * 100).toFixed(1),
        neutralPercent: ((neutral / total) * 100).toFixed(1),
        negativePercent: ((negative / total) * 100).toFixed(1)
      }
    };
  }, [posts]);

  // Loading state
  if (loading && !posts.length) {
    return (
      <div className={`app-loading ${darkMode ? 'dark-mode' : ''}`}>
        <div className="loading-spinner"></div>
        <p className="loading-text">Loading Reddit data...</p>
      </div>
    );
  }
  
  // Error state
  if (error && !posts.length) {
    return (
      <div className={`app-error ${darkMode ? 'dark-mode' : ''}`}>
        <div className="error-container">
          <h2>Error Loading Data</h2>
          <p>{error}</p>
          <button className="retry-button" onClick={fetchPosts}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Render the application UI
  return (
    <div className={`app ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <h1 className="app-title">Reddit Sentiment Dashboard</h1>
          </div>
          <div className="header-right">
            <button 
              onClick={toggleDarkMode} 
              className="header-button theme-toggle"
              title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-container">
        <aside className="sidebar">
          {/* Filter panel */}
          <div className="filter-panel">
            <div className="panel-header">
              <h2>Filters</h2>
            </div>
            
            <form onSubmit={handleFilterSubmit}>
              <div className="filter-group">
                <label htmlFor="score-range">Score Range:</label>
                <div className="range-inputs">
                  <input
                    type="text"
                    id="min-score"
                    name="minScore"
                    placeholder="Min"
                    value={filters.minScore}
                    onChange={handleFilterChange}
                    aria-label="Minimum score"
                  />
                  <span className="range-separator">to</span>
                  <input
                    type="text"
                    id="max-score"
                    name="maxScore"
                    placeholder="Max"
                    value={filters.maxScore}
                    onChange={handleFilterChange}
                    aria-label="Maximum score"
                  />
                </div>
              </div>

              <div className="filter-group">
                <label htmlFor="comments-range">Comments Range:</label>
                <div className="range-inputs">
                  <input
                    type="text"
                    id="min-comments"
                    name="minComments"
                    placeholder="Min"
                    value={filters.minComments}
                    onChange={handleFilterChange}
                    aria-label="Minimum comments"
                  />
                  <span className="range-separator">to</span>
                  <input
                    type="text"
                    id="max-comments"
                    name="maxComments"
                    placeholder="Max"
                    value={filters.maxComments}
                    onChange={handleFilterChange}
                    aria-label="Maximum comments"
                  />
                </div>
              </div>

              <div className="filter-group">
                <label htmlFor="sentiment-select">Sentiment:</label>
                <select
                  id="sentiment-select"
                  name="sentiment"
                  value={filters.sentiment}
                  onChange={handleFilterChange}
                  aria-label="Sentiment filter"
                >
                  <option value="">All</option>
                  <option value="positive">Positive</option>
                  <option value="neutral">Neutral</option>
                  <option value="negative">Negative</option>
                </select>
                
                {/* Quick sentiment filters */}
                <div className="sentiment-quick-filters">
                  <button 
                    type="button"
                    className={`quick-filter ${filters.sentiment === 'positive' ? 'active' : ''}`}
                    onClick={() => applySentimentFilter('positive')}
                  >
                    Positive Only
                  </button>
                  <button 
                    type="button"
                    className={`quick-filter ${filters.sentiment === 'negative' ? 'active' : ''}`}
                    onClick={() => applySentimentFilter('negative')}
                  >
                    Negative Only
                  </button>
                  <button 
                    type="button"
                    className={`quick-filter ${filters.sentiment === 'neutral' ? 'active' : ''}`}
                    onClick={() => applySentimentFilter('neutral')}
                  >
                    Neutral Only
                  </button>
                </div>
              </div>
              
              <div className="filter-group">
                <label htmlFor="subreddit-input">Subreddit:</label>
                <input
                  type="text"
                  id="subreddit-input"
                  name="subreddit"
                  placeholder="e.g. worldnews, politics"
                  value={filters.subreddit}
                  onChange={handleFilterChange}
                  aria-label="Subreddit filter"
                />
              </div>
              
              {/* Popular subreddits */}
              {popularSubreddits.length > 0 && (
                <div className="popular-subreddits">
                  <h3>Popular Subreddits</h3>
                  <div className="subreddit-tags">
                    {popularSubreddits.slice(0, 10).map(sr => (
                      <button
                        key={sr.name}
                        type="button"
                        className="subreddit-quick-tag"
                        onClick={() => applySubredditFilter(sr.name)}
                        title={`${sr.count} posts`}
                      >
                        r/{sr.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <button type="submit" className="apply-filters-button">
                Apply Filters
              </button>
              
              {/* Export button */}
              <button 
                type="button"
                className="export-button"
                onClick={exportToCsv}
                disabled={!posts.length}
              >
                Export to CSV
              </button>
            </form>
          </div>

          {/* Statistics panel */}
          <div className="stats-panel">
            <h2 className="panel-header">Statistics</h2>
            <div className="stat-item">
              <span className="stat-label">Total Posts:</span>
              <span className="stat-value">{statsData.totalPosts}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Average Score:</span>
              <span className="stat-value">{statsData.avgScore}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Average Comments:</span>
              <span className="stat-value">{statsData.avgComments}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Average Sentiment:</span>
              <span className="stat-value">{statsData.avgSentiment}</span>
            </div>
            
            <div className="sentiment-mini-chart">
              <div className="sentiment-bar positive" style={{ width: `${statsData.sentimentBreakdown.positivePercent}%` }}></div>
              <div className="sentiment-bar neutral" style={{ width: `${statsData.sentimentBreakdown.neutralPercent}%` }}></div>
              <div className="sentiment-bar negative" style={{ width: `${statsData.sentimentBreakdown.negativePercent}%` }}></div>
            </div>
            
            <div className="sentiment-mini-legend">
              <div className="legend-item">
                <span className="color-dot positive"></span>
                <span>{statsData.sentimentBreakdown.positivePercent}%</span>
              </div>
              <div className="legend-item">
                <span className="color-dot neutral"></span>
                <span>{statsData.sentimentBreakdown.neutralPercent}%</span>
              </div>
              <div className="legend-item">
                <span className="color-dot negative"></span>
                <span>{statsData.sentimentBreakdown.negativePercent}%</span>
              </div>
            </div>
            
            <div className="stat-item">
              <span className="stat-label">Data Source:</span>
              <span className="stat-value">
                {isLiveSearch ? 'Live Reddit API' : 'Local Database'}
              </span>
            </div>
          </div>
        </aside>

        <main className="main-content">
          {/* Search toolbar */}
          <div className="search-toolbar">
            <div className="search-container">
              <form onSubmit={handleFilterSubmit} className="search-form">
                <div className="search-input-wrapper">
                  <input
                    type="text"
                    placeholder="Search posts..."
                    value={filters.searchTerm}
                    onChange={e => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                    className="search-input"
                    aria-label="Search posts"
                  />
                  <button type="submit" className="search-button">
                    🔍
                  </button>
                </div>
                
                <div className="search-options">
                  <div className="search-toggle-group">
                    <label className="toggle-label">
                      <input
                        type="radio"
                        name="searchMethod"
                        value="database"
                        checked={searchOptions.searchMethod === 'database'}
                        onChange={handleSearchOptionsChange}
                        aria-label="Search database"
                      />
                      <span className="toggle-button">Database</span>
                    </label>
                    <label className="toggle-label">
                      <input
                        type="radio"
                        name="searchMethod"
                        value="live"
                        checked={searchOptions.searchMethod === 'live'}
                        onChange={handleSearchOptionsChange}
                        aria-label="Live Reddit search"
                      />
                      <span className="toggle-button">Live Reddit</span>
                    </label>
                  </div>
                  
                  {searchOptions.searchMethod === 'live' && (
                    <>
                      <select 
                        name="sortMethod" 
                        value={searchOptions.sortMethod}
                        onChange={handleSearchOptionsChange}
                        className="search-option-select"
                        aria-label="Sort method"
                      >
                        <option value="relevance">Relevance</option>
                        <option value="hot">Hot</option>
                        <option value="new">New</option>
                        <option value="top">Top</option>
                      </select>
                      
                      <select 
                        name="timeFilter" 
                        value={searchOptions.timeFilter}
                        onChange={handleSearchOptionsChange}
                        className="search-option-select"
                        aria-label="Time filter"
                      >
                        <option value="all">All Time</option>
                        <option value="hour">Past Hour</option>
                        <option value="day">Past Day</option>
                        <option value="week">Past Week</option>
                        <option value="month">Past Month</option>
                        <option value="year">Past Year</option>
                      </select>
                      
                      {/* Auto-refresh option */}
                      <div className="auto-refresh-option">
                        <label className="refresh-label">
                          <input
                            type="checkbox"
                            checked={autoRefresh}
                            onChange={() => setAutoRefresh(!autoRefresh)}
                          />
                          Auto-refresh
                        </label>
                        {autoRefresh && (
                          <select 
                            value={autoRefreshInterval}
                            onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
                            className="refresh-interval-select"
                          >
                            <option value="30">30 seconds</option>
                            <option value="60">1 minute</option>
                            <option value="300">5 minutes</option>
                          </select>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Visualizations section */}
          <div className="visualization-section">
            <div className="section-header">
              <h2>Visualizations</h2>
              <div className="visualization-tabs">
                <button
                  className={`viz-tab ${visualizationType === 'sentimentDistribution' ? 'active' : ''}`}
                  onClick={() => setVisualizationType('sentimentDistribution')}
                  aria-pressed={visualizationType === 'sentimentDistribution'}
                >
                  Sentiment Distribution
                </button>
                <button
                  className={`viz-tab ${visualizationType === 'sentimentOverTime' ? 'active' : ''}`}
                  onClick={() => setVisualizationType('sentimentOverTime')}
                  aria-pressed={visualizationType === 'sentimentOverTime'}
                >
                  Sentiment Over Time
                </button>
                <button
                  className={`viz-tab ${visualizationType === 'engagementVsSentiment' ? 'active' : ''}`}
                  onClick={() => setVisualizationType('engagementVsSentiment')}
                  aria-pressed={visualizationType === 'engagementVsSentiment'}
                >
                  Engagement vs Sentiment
                </button>
                <button
                  className={`viz-tab ${visualizationType === 'sentimentTrend' ? 'active' : ''}`}
                  onClick={() => setVisualizationType('sentimentTrend')}
                  aria-pressed={visualizationType === 'sentimentTrend'}
                >
                  Sentiment Trend
                </button>
                <button
                  className={`viz-tab ${visualizationType === 'wordCloud' ? 'active' : ''}`}
                  onClick={() => {
                    setVisualizationType('wordCloud');
                    fetchWordCloudData();
                  }}
                  aria-pressed={visualizationType === 'wordCloud'}
                >
                  Word Cloud
                </button>
              </div>
            </div>
            
            <div className="chart-container">
              {posts.length === 0 ? (
                <div className="no-data-message">
                  <p>No data available for visualization. Try adjusting your filters.</p>
                </div>
              ) : visualizationType === 'wordCloud' ? (
                loadingWordCloud ? (
                  <div className="loading-word-cloud">
                    <div className="loading-spinner small"></div>
                    <span>Generating word cloud...</span>
                  </div>
                ) : (
                  <div style={{ height: 300, position: 'relative' }}>
                    <WordCloud words={wordCloudData} />
                  </div>
                )
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  {visualizationType === 'sentimentDistribution' ? (
                    <PieChart>
                      <Pie
                        data={visualizationData}
                        cx="50%"
                        cy="50%"
                        labelLine={true}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        nameKey="name"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {visualizationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  ) : visualizationType === 'sentimentOverTime' ? (
                    <LineChart data={visualizationData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="positive" 
                        name="Positive" 
                        stroke={COLORS.positive} 
                        strokeWidth={2} 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="neutral" 
                        name="Neutral" 
                        stroke={COLORS.neutral} 
                        strokeWidth={2} 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="negative" 
                        name="Negative" 
                        stroke={COLORS.negative} 
                        strokeWidth={2} 
                      />
                    </LineChart>
                  ) : visualizationType === 'sentimentTrend' ? (
                    <LineChart 
                      data={visualizationData}
                      margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[-1, 1]} />
                      <Tooltip 
                        formatter={(value, name) => [value.toFixed(2), "Sentiment"]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="sentiment" 
                        name="Sentiment" 
                        stroke="#8884d8" 
                        dot={{ r: 3 }} 
                      />
                    </LineChart>
                  ) : (
                    <BarChart data={visualizationData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar 
                        dataKey="score" 
                        name="Score" 
                        fill={COLORS.charts[0]} 
                      />
                      <Bar 
                        dataKey="comments" 
                        name="Comments" 
                        fill={COLORS.charts[1]} 
                      />
                      <Line 
                        type="monotone" 
                        dataKey="sentiment" 
                        name="Sentiment" 
                        stroke={COLORS.charts[2]}
                        strokeWidth={2}
                        yAxisId={1}
                      />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Posts section */}
          <div className="posts-section">
            <div className="section-header">
              <h2>
                {isLiveSearch ? 'Live Reddit Posts' : 'Reddit Posts'}
                {filters.searchTerm && (
                  <span className="search-term-display"> for "{filters.searchTerm}"</span>
                )}
              </h2>
              
              {posts.length > 0 && (
                <div className="results-info">
                  <span>Showing {posts.length} result{posts.length !== 1 ? 's' : ''}</span>
                </div>
              )}
            </div>

            {posts.length > 0 ? (
              <div className="posts-table-container">
                <table className="posts-table">
                  <thead>
                    <tr>
                      <th 
                        className={`sortable ${sortConfig.key === 'title' ? `sorted-${sortConfig.direction}` : ''}`}
                        onClick={() => requestSort('title')}
                      >
                        Title
                        {sortConfig.key === 'title' && (
                          <span>{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>
                        )}
                      </th>
                      <th 
                        className={`sortable ${sortConfig.key === 'score' ? `sorted-${sortConfig.direction}` : ''}`}
                        onClick={() => requestSort('score')}
                      >
                        Score
                        {sortConfig.key === 'score' && (
                          <span>{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>
                        )}
                      </th>
                      <th 
                        className={`sortable ${sortConfig.key === 'num_comments' ? `sorted-${sortConfig.direction}` : ''}`}
                        onClick={() => requestSort('num_comments')}
                      >
                        Comments
                        {sortConfig.key === 'num_comments' && (
                          <span>{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>
                        )}
                      </th>
                      <th 
                        className={`sortable ${sortConfig.key === 'sentiment_compound' ? `sorted-${sortConfig.direction}` : ''}`}
                        onClick={() => requestSort('sentiment_compound')}
                      >
                        Sentiment
                        {sortConfig.key === 'sentiment_compound' && (
                          <span>{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>
                        )}
                      </th>
                      <th 
                        className={`sortable ${sortConfig.key === 'created_utc' ? `sorted-${sortConfig.direction}` : ''}`}
                        onClick={() => requestSort('created_utc')}
                      >
                        Date
                        {sortConfig.key === 'created_utc' && (
                          <span>{sortConfig.direction === 'asc' ? ' ▲' : ' ▼'}</span>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map(post => (
                      <tr key={post.id} className="post-row" onClick={() => openPostDetail(post)}>
                        <td className="post-title-cell">
                          <div className="post-title">
                            {post.title}
                            {post.subreddit && (
                              <span className="subreddit-tag">r/{post.subreddit}</span>
                            )}
                          </div>
                        </td>
                        <td className="post-score-cell">
                          <div className="score-badge">{post.score}</div>
                        </td>
                        <td className="post-comments-cell">
                          <div className="comments-badge">
                            💬 {post.num_comments}
                          </div>
                        </td>
                        <td className="post-sentiment-cell">
                          <div className={`sentiment-badge ${getSentimentClass(post.sentiment_compound)}`}>
                            {post.sentiment_compound.toFixed(2)}
                          </div>
                        </td>
                        <td className="post-date-cell">
                          <div className="post-date" title={formatDate(post.created_utc)}>
                            {formatDate(post.created_utc, 'relative')}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : error ? (
              <div className="error-message">
                <p>{error}</p>
                <button onClick={fetchPosts} className="retry-button">
                  Retry
                </button>
              </div>
            ) : (
              <div className="no-posts-message">
                <p>No posts found matching your criteria. Try adjusting your filters or search term.</p>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Post Detail Modal */}
      {selectedPost && (
        <div className="modal-overlay" onClick={closePostDetail}>
          <div className="modal-container post-detail-modal" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closePostDetail}>×</button>
            <div className="modal-header">
              <h2>{selectedPost.title}</h2>
              <div className="post-meta">
                <span className="post-subreddit">r/{selectedPost.subreddit}</span>
                <span className="post-author">Posted by u/{selectedPost.author}</span>
                <span className="post-date">{formatDate(selectedPost.created_utc)}</span>
              </div>
            </div>
            <div className="modal-body">
              <div className="post-content">
                {selectedPost.selftext ? (
                  <div className="post-text">{selectedPost.selftext}</div>
                ) : (
                  <div className="post-url">
                    <a href={selectedPost.url} target="_blank" rel="noopener noreferrer">{selectedPost.url}</a>
                  </div>
                )}
              </div>
              
              <div className="post-stats">
                <div className="post-stat">
                  <span className="stat-label">Score:</span>
                  <span className="stat-value">{selectedPost.score}</span>
                </div>
                <div className="post-stat">
                  <span className="stat-label">Comments:</span>
                  <span className="stat-value">{selectedPost.num_comments}</span>
                </div>
                <div className="post-stat">
                  <span className="stat-label">Upvote Ratio:</span>
                  <span className="stat-value">{(selectedPost.upvote_ratio * 100).toFixed(0)}%</span>
                </div>
              </div>
              
              <div className="sentiment-analysis">
                <h3>Sentiment Analysis</h3>
                <div className="sentiment-details">
                  <div className="sentiment-detail">
                    <span className="detail-label">Compound:</span>
                    <span className={`detail-value ${getSentimentClass(selectedPost.sentiment_compound)}`}>
                      {selectedPost.sentiment_compound.toFixed(2)}
                    </span>
                  </div>
                  <div className="sentiment-detail">
                    <span className="detail-label">Positive:</span>
                    <span className="detail-value">{(selectedPost.sentiment_pos * 100).toFixed(1)}%</span>
                  </div>
                  <div className="sentiment-detail">
                    <span className="detail-label">Neutral:</span>
                    <span className="detail-value">{(selectedPost.sentiment_neu * 100).toFixed(1)}%</span>
                  </div>
                  <div className="sentiment-detail">
                    <span className="detail-label">Negative:</span>
                    <span className="detail-value">{(selectedPost.sentiment_neg * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
              
              {/* Comments section */}
              <div className="post-comments">
                <h3>Comments</h3>
                
                {loadingComments ? (
                  <div className="comments-loading">
                    <div className="loading-spinner small"></div>
                    <span>Loading comments...</span>
                  </div>
                ) : comments.length > 0 ? (
                  <div className="comments-list">
                    {comments.map(comment => (
                      <div key={comment.id} className="comment">
                        <div className="comment-header">
                          <span className="comment-author">u/{comment.author}</span>
                          <span className="comment-score">{comment.score} points</span>
                          <span className="comment-date">{formatDate(comment.created_utc, 'relative')}</span>
                        </div>
                        <div className="comment-body">{comment.body}</div>
                        <div className="comment-sentiment">
                          <span className={`sentiment-badge small ${getSentimentClass(comment.sentiment_compound)}`}>
                            {comment.sentiment_compound.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="no-comments">
                    <p>No comments found for this post.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="footer">
        <div className="footer-content">
          <div className="footer-logo">
            <h3>Reddit Sentiment Dashboard</h3>
            <p>Analyzing Reddit sentiment with VADER</p>
          </div>
          
          <div className="footer-info">
            <p>&copy; {new Date().getFullYear()} Reddit Sentiment Dashboard</p>
            <p>Version 1.0</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;