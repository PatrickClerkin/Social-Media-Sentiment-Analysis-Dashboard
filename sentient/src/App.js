// App.js with improved Reddit Live Search Integration
import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { useAuth } from './AuthContext';
import UserMenu from './UserMenu';
import AuthModal from './Authmodal';
import SaveFilterModal from './SaveFilterModal';
import SavedFiltersPanel from './SavedFiltersPanel';
import './App.css';

function App() {
  // State for posts data
  const [posts, setPosts] = useState([]);
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLiveSearch, setIsLiveSearch] = useState(false);

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
    startDate: '',
    endDate: '',
    subreddit: '', // Added subreddit filter
  });

  // State for date range selection
  const [dateRangeOption, setDateRangeOption] = useState('all');

  // State for sorting
  const [sortConfig, setSortConfig] = useState({
    key: 'created_utc',
    direction: 'desc',
  });

  // State for visualization
  const [visualizationType, setVisualizationType] = useState('sentimentDistribution');

  // State for dark/light mode
  const [darkMode, setDarkMode] = useState(false);

  // State for auth and filter modals
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSaveFilterModal, setShowSaveFilterModal] = useState(false);

  // State for export dropdown
  const [showExportOptions, setShowExportOptions] = useState(false);
  
  // State for search options
  const [searchOptions, setSearchOptions] = useState({
    searchMethod: 'database', // 'database' or 'live'
    sortMethod: 'relevance',  // 'relevance', 'hot', 'new', 'top'
    timeFilter: 'all'         // 'hour', 'day', 'week', 'month', 'year', 'all'
  });

  // Use the auth context
  const { currentUser, updatePreferences } = useAuth();

  // Base API URL
  const BASE_URL = "http://127.0.0.1:5000";

  // Fetch posts or perform live Reddit search
  const fetchPosts = () => {
    setLoading(true);
    setError(null);
    setIsLiveSearch(false);

    // Build URL and parameters based on search method and filters
    let url = `${BASE_URL}/posts`;
    const params = new URLSearchParams();
    
    // If search term is set, determine if we should use live search
    if (filters.searchTerm && searchOptions.searchMethod === 'live') {
      setIsLiveSearch(true);
      url = `${BASE_URL}/search`;
      params.append('q', filters.searchTerm);
      params.append('sort', searchOptions.sortMethod);
      params.append('time_filter', searchOptions.timeFilter);
      
      if (filters.subreddit) {
        params.append('subreddit', filters.subreddit);
      }
    } else {
      // Regular database search with all filters
      if (filters.minScore) params.append('min_score', filters.minScore);
      if (filters.maxScore) params.append('max_score', filters.maxScore);
      if (filters.minComments) params.append('min_comments', filters.minComments);
      if (filters.maxComments) params.append('max_comments', filters.maxComments);
      if (filters.sentiment) params.append('sentiment', filters.sentiment);
      if (filters.subreddit) params.append('subreddit', filters.subreddit);
      if (filters.searchTerm) params.append('search', filters.searchTerm);

      const startTs = dateToTimestamp(filters.startDate);
      const endTs = dateToTimestamp(filters.endDate);
      if (startTs) params.append('start_date', startTs);
      if (endTs) params.append('end_date', endTs + 86400);
    }

    // Final URL with query parameters
    const finalUrl = `${url}${params.toString() ? '?' + params.toString() : ''}`;
    
    // Set up request options
    const fetchOptions = {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    };

    // Add auth token if user is logged in
    if (currentUser) {
      const token = localStorage.getItem('authToken');
      if (token) fetchOptions.headers['Authorization'] = `Bearer ${token}`;
    }

    // Execute the fetch request
    fetch(finalUrl, fetchOptions)
      .then(response => {
        if (!response.ok) throw new Error(`Failed to fetch posts (${response.status}): ${response.statusText}`);
        return response.json();
      })
      .then(data => {
        setCurrentPage(1);
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

  // Helper: convert date string to Unix timestamp
  const dateToTimestamp = (dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
  };

  // Initial fetch & user prefs
  useEffect(() => {
    fetchPosts();
    const savedDark = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDark);
    document.body.className = savedDark ? 'dark-mode' : '';

    if (currentUser && currentUser.preferences) {
      if (currentUser.preferences.darkMode !== undefined) {
        setDarkMode(currentUser.preferences.darkMode);
        document.body.className = currentUser.preferences.darkMode ? 'dark-mode' : '';
      }
      if (currentUser.preferences.defaultVisualization) {
        setVisualizationType(currentUser.preferences.defaultVisualization);
      }
      if (currentUser.preferences.searchMethod) {
        setSearchOptions(prev => ({ ...prev, searchMethod: currentUser.preferences.searchMethod }));
      }
    }
  }, []);

  // Apply client-side filters & sort
  const applyClientSideFilters = (data) => {
    let result = [...data];
    
    // Only apply client-side text search if it's not already handled by the API
    if (filters.searchTerm && !isLiveSearch && searchOptions.searchMethod !== 'live') {
      const term = filters.searchTerm.toLowerCase();
      result = result.filter(post =>
        post.title.toLowerCase().includes(term) ||
        (post.selftext && post.selftext.toLowerCase().includes(term))
      );
    }
    
    // Apply sorting
    result.sort((a, b) => {
      if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
      if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    
    setFilteredPosts(result);
  };

  useEffect(() => {
    if (posts.length > 0) {
      applyClientSideFilters(posts);
    }
  }, [filters.searchTerm, sortConfig, posts]);

  // Sort request
  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Filter form submission
  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchPosts();
  };

  // Filter input change
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  // Search input change
  const handleSearchChange = (e) => {
    setFilters(prev => ({ ...prev, searchTerm: e.target.value }));
  };
  
  // Search options change handler
  const handleSearchOptionsChange = (e) => {
    const { name, value } = e.target;
    setSearchOptions(prev => ({ ...prev, [name]: value }));
    
    // Save preference if user is logged in
    if (currentUser && name === 'searchMethod') {
      updatePreferences({ 
        ...currentUser.preferences, 
        searchMethod: value 
      });
    }
  };
  
  // Handle search submission
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchPosts();
  };

  // Date range picker
  const handleDateRangeChange = (option) => {
    setDateRangeOption(option);
    const today = new Date().toISOString().split('T')[0];
    let start = '', end = today;
    switch(option) {
      case 'today': start = today; break;
      case 'week':  start = new Date(Date.now() - 7*86400*1000).toISOString().split('T')[0]; break;
      case 'month': start = new Date(Date.now() - 30*86400*1000).toISOString().split('T')[0]; break;
      case 'quarter': start = new Date(Date.now() - 90*86400*1000).toISOString().split('T')[0]; break;
      case 'year': start = new Date(new Date().setFullYear(new Date().getFullYear()-1)).toISOString().split('T')[0]; break;
      case 'custom': start = filters.startDate; end = filters.endDate; break;
      default: start = ''; end = '';
    }
    setFilters(prev => ({ ...prev, startDate: start, endDate: end }));
  };

  // Dark mode toggle
  const toggleDarkMode = () => {
    const nm = !darkMode;
    setDarkMode(nm);
    document.body.className = nm ? 'dark-mode' : '';
    localStorage.setItem('darkMode', nm.toString());
    if (currentUser) {
      updatePreferences({ ...currentUser.preferences, darkMode: nm });
    }
  };

  // Sentiment badge class
  const getSentimentClass = (compound) => {
    if (compound > 0.05) return 'positive';
    if (compound < -0.05) return 'negative';
    return 'neutral';
  };

  // Format date
  const formatDate = (ts) => new Date(ts * 1000).toLocaleString();

  // Pagination
  const indexOfLast = currentPage * postsPerPage;
  const indexOfFirst = indexOfLast - postsPerPage;
  const currentPosts = filteredPosts.slice(indexOfFirst, indexOfLast);
  const paginate = page => setCurrentPage(page);
  
  // Data export functions - remaining code unchanged
  // Convert to CSV format
  const convertToCSV = (data) => {
    if (data.length === 0) return '';
    
    // Get headers from first object keys
    const headers = Object.keys(data[0]);
    
    // Create CSV header row
    const csvRows = [headers.join(',')];
    
    // Create data rows
    for (const row of data) {
      const values = headers.map(header => {
        const value = row[header];
        // Handle strings that need to be quoted (if they contain commas or quotes)
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  };

  // Export to CSV
  const exportToCSV = () => {
    // Prepare data for export
    const dataToExport = filteredPosts.map(post => ({
      id: post.id,
      title: post.title,
      author: post.author,
      score: post.score,
      num_comments: post.num_comments,
      upvote_ratio: post.upvote_ratio,
      created_utc: post.created_utc,
      created_date: formatDate(post.created_utc),
      sentiment_compound: post.sentiment_compound,
      sentiment_positive: post.sentiment_pos,
      sentiment_neutral: post.sentiment_neu,
      sentiment_negative: post.sentiment_neg,
      url: post.url
    }));
    
    const csv = convertToCSV(dataToExport);
    
    // Create download link
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    // Create temporary link and trigger download
    const link = document.createElement('a');
    const filename = `reddit_sentiment_data_${new Date().toISOString().split('T')[0]}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Close dropdown
    setShowExportOptions(false);
  };

  // Export to JSON
  const exportToJSON = () => {
    // Prepare data for export
    const dataToExport = filteredPosts.map(post => ({
      id: post.id,
      title: post.title,
      author: post.author,
      score: post.score,
      num_comments: post.num_comments,
      upvote_ratio: post.upvote_ratio,
      created_utc: post.created_utc,
      created_date: formatDate(post.created_utc),
      sentiment: {
        compound: post.sentiment_compound,
        positive: post.sentiment_pos,
        neutral: post.sentiment_neu,
        negative: post.sentiment_neg
      },
      url: post.url,
      selftext: post.selftext
    }));
    
    // Add metadata
    const exportData = {
      data: dataToExport,
      metadata: {
        exportDate: new Date().toISOString(),
        totalPosts: dataToExport.length,
        filters: {
          ...filters,
          sortKey: sortConfig.key,
          sortDirection: sortConfig.direction
        },
        stats: {
          avgScore: dataToExport.length > 0 
            ? (dataToExport.reduce((sum, post) => sum + post.score, 0) / dataToExport.length).toFixed(2)
            : 'N/A',
          avgSentiment: dataToExport.length > 0
            ? (dataToExport.reduce((sum, post) => sum + post.sentiment.compound, 0) / dataToExport.length).toFixed(2)
            : 'N/A'
        }
      }
    };
    
    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // Create download link
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create temporary link and trigger download
    const link = document.createElement('a');
    const filename = `reddit_sentiment_data_${new Date().toISOString().split('T')[0]}.json`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Close dropdown
    setShowExportOptions(false);
  };

  // Export to HTML report
  const exportToHTML = () => {
    // Calculate statistics
    const totalPosts = filteredPosts.length;
    const positive = filteredPosts.filter(post => post.sentiment_compound > 0.05).length;
    const neutral = filteredPosts.filter(post => post.sentiment_compound >= -0.05 && post.sentiment_compound <= 0.05).length;
    const negative = filteredPosts.filter(post => post.sentiment_compound < -0.05).length;
    
    const avgScore = totalPosts > 0 
      ? (filteredPosts.reduce((sum, post) => sum + post.score, 0) / totalPosts).toFixed(2)
      : 'N/A';
    
    const avgComments = totalPosts > 0
      ? (filteredPosts.reduce((sum, post) => sum + post.num_comments, 0) / totalPosts).toFixed(2)
      : 'N/A';
    
    const avgSentiment = totalPosts > 0
      ? (filteredPosts.reduce((sum, post) => sum + post.sentiment_compound, 0) / totalPosts).toFixed(2)
      : 'N/A';
    
    // Top 5 posts by score
    const topPosts = [...filteredPosts]
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    
    // Generate HTML
    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reddit Sentiment Analysis Report</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
          }
          .summary-stats {
            display: flex;
            justify-content: space-around;
            flex-wrap: wrap;
            margin-bottom: 30px;
          }
          .stat-card {
            background-color: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            min-width: 200px;
            margin: 10px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          }
          .sentiment-distribution {
            display: flex;
            margin-bottom: 30px;
          }
          .sentiment-bar {
            height: 20px;
            border-radius: 4px;
          }
          .positive-bar {
            background-color: #4caf50;
          }
          .neutral-bar {
            background-color: #ff9800;
          }
          .negative-bar {
            background-color: #f44336;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 10px;
            text-align: left;
            border-bottom: 1px solid #ddd;
          }
          th {
            background-color: #f2f2f2;
          }
          .sentiment-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
          }
          .positive {
            background-color: rgba(76, 175, 80, 0.2);
            color: #4caf50;
          }
          .neutral {
            background-color: rgba(255, 152, 0, 0.2);
            color: #ff9800;
          }
          .negative {
            background-color: rgba(244, 67, 54, 0.2);
            color: #f44336;
          }
          footer {
            margin-top: 30px;
            text-align: center;
            color: #777;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Reddit Sentiment Analysis Report</h1>
          <p>Generated on ${new Date().toLocaleString()}</p>
        </div>
        
        <h2>Summary</h2>
        <div class="summary-stats">
          <div class="stat-card">
            <h3>Total Posts</h3>
            <p>${totalPosts}</p>
          </div>
          <div class="stat-card">
            <h3>Average Score</h3>
            <p>${avgScore}</p>
          </div>
          <div class="stat-card">
            <h3>Average Comments</h3>
            <p>${avgComments}</p>
          </div>
          <div class="stat-card">
            <h3>Average Sentiment</h3>
            <p>${avgSentiment}</p>
          </div>
        </div>
        
        <h2>Sentiment Distribution</h2>
        <div class="sentiment-distribution">
          <div class="sentiment-bar positive-bar" style="width: ${(positive / totalPosts) * 100}%;"></div>
          <div class="sentiment-bar neutral-bar" style="width: ${(neutral / totalPosts) * 100}%;"></div>
          <div class="sentiment-bar negative-bar" style="width: ${(negative / totalPosts) * 100}%;"></div>
        </div>
        <div style="display: flex; margin-bottom: 20px;">
          <div style="margin-right: 20px;">
            <span style="color: #4caf50; font-weight: bold;">■</span> Positive: ${positive} (${((positive / totalPosts) * 100).toFixed(1)}%)
          </div>
          <div style="margin-right: 20px;">
            <span style="color: #ff9800; font-weight: bold;">■</span> Neutral: ${neutral} (${((neutral / totalPosts) * 100).toFixed(1)}%)
          </div>
          <div>
            <span style="color: #f44336; font-weight: bold;">■</span> Negative: ${negative} (${((negative / totalPosts) * 100).toFixed(1)}%)
          </div>
        </div>
        
        <h2>Top Posts by Score</h2>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>Score</th>
              <th>Comments</th>
              <th>Sentiment</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${topPosts.map(post => `
              <tr>
                <td>${post.title}</td>
                <td>${post.score}</td>
                <td>${post.num_comments}</td>
                <td>
                  <span class="sentiment-badge ${getSentimentClass(post.sentiment_compound)}">
                    ${post.sentiment_compound.toFixed(2)}
                  </span>
                </td>
                <td>${formatDate(post.created_utc)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <footer>
          <p>Created with Reddit Sentiment Dashboard</p>
        </footer>
      </body>
      </html>
    `;
    
    // Create download link
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Create temporary link and trigger download
    const link = document.createElement('a');
    const filename = `reddit_sentiment_report_${new Date().toISOString().split('T')[0]}.html`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Close dropdown
    setShowExportOptions(false);
  };

  // Prepare data for time series visualization
  const prepareTimeSeriesData = () => {
    // Group posts by day
    const postsByDay = {};
    
    filteredPosts.forEach(post => {
      // Convert timestamp to date string (YYYY-MM-DD)
      const date = new Date(post.created_utc * 1000).toISOString().split('T')[0];
      
      if (!postsByDay[date]) {
        postsByDay[date] = {
          positive: 0,
          neutral: 0,
          negative: 0,
          total: 0,
          avgSentiment: 0,
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
  };

  // Prepare chart data
  const prepareChartData = () => {
    if (visualizationType === 'sentimentDistribution') {
      const positive = filteredPosts.filter(post => post.sentiment_compound > 0.05).length;
      const neutral = filteredPosts.filter(post => post.sentiment_compound >= -0.05 && post.sentiment_compound <= 0.05).length;
      const negative = filteredPosts.filter(post => post.sentiment_compound < -0.05).length;
      
      return [
        { name: 'Positive', value: positive, fill: '#4caf50' },
        { name: 'Neutral', value: neutral, fill: '#ff9800' },
        { name: 'Negative', value: negative, fill: '#f44336' }
      ];
    } else if (visualizationType === 'engagementVsSentiment') {
      // Sort posts by score for visualization
      return [...filteredPosts]
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map(post => ({
          name: post.title.substring(0, 20) + '...',
          score: post.score,
          sentiment: post.sentiment_compound
        }));
    } else if (visualizationType === 'sentimentOverTime') {
      // Time series data
      return prepareTimeSeriesData();
    }
    
    return [];
  };

  // Loading state
  if (loading) return (
    <div className={`loading-container ${darkMode ? 'dark-mode' : ''}`}>
      <div className="spinner"></div>
      <p>Loading posts...</p>
    </div>
  );
  
  // Error state
  if (error) return (
    <div className={`error-container ${darkMode ? 'dark-mode' : ''}`}>
      <h2>Error</h2>
      <p>Error loading posts: {error.message}</p>
      <button onClick={fetchPosts} className="retry-button">Retry</button>
    </div>
  );

  // Main render
  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`}>
      <header className="header">
        <div className="header-content">
          <h1>Reddit Sentiment Dashboard</h1>
          <div className="header-actions">
            {currentUser ? (
              <>
                <button 
                  className="save-filter-button"
                  onClick={() => setShowSaveFilterModal(true)}
                >
                  Save Filters
                </button>
                <UserMenu />
              </>
            ) : (
              <button 
                className="login-button"
                onClick={() => setShowAuthModal(true)}
              >
                Login / Sign Up
              </button>
            )}
            <button onClick={toggleDarkMode} className="theme-toggle">
              {darkMode ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>
          </div>
        </div>
      </header>

      <div className="dashboard-container">
        <aside className="sidebar">
          {currentUser && (
            <SavedFiltersPanel 
              onApplyFilter={(filterConfig) => {
                setFilters(filterConfig);
                fetchPosts();
              }}
            />
          )}
          
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
              
              <div className="filter-group">
                <label>Subreddit:</label>
                <input
                  type="text"
                  name="subreddit"
                  placeholder="e.g. worldnews, politics"
                  value={filters.subreddit}
                  onChange={handleFilterChange}
                />
              </div>
              
              <div className="filter-group">
                <label>Date Range:</label>
                <select
                  value={dateRangeOption}
                  onChange={(e) => handleDateRangeChange(e.target.value)}
                  className="date-range-select"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 Days</option>
                  <option value="month">Last 30 Days</option>
                  <option value="quarter">Last 90 Days</option>
                  <option value="year">Last Year</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
              
              {dateRangeOption === 'custom' && (
                <div className="filter-group date-inputs">
                  <div className="date-input-container">
                    <label>Start Date:</label>
                    <input
                      type="date"
                      name="startDate"
                      value={filters.startDate}
                      onChange={handleFilterChange}
                    />
                  </div>
                  <div className="date-input-container">
                    <label>End Date:</label>
                    <input
                      type="date"
                      name="endDate"
                      value={filters.endDate}
                      onChange={handleFilterChange}
                      min={filters.startDate} // Can't select a date before the start date
                    />
                  </div>
                </div>
              )}

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
            <div className="stat-item">
              <span>Data Source:</span>
              <span>
                {isLiveSearch ? 'Live Reddit API' : 'Local Database'}
              </span>
            </div>
            <div className="stat-item">
              <span>Date Range:</span>
              <span>
                {dateRangeOption === 'all' 
                  ? 'All Time' 
                  : dateRangeOption === 'custom' && filters.startDate && filters.endDate
                    ? `${filters.startDate} - ${filters.endDate}`
                    : dateRangeOption === 'today' ? 'Today'
                    : dateRangeOption === 'week' ? 'Last 7 Days'
                    : dateRangeOption === 'month' ? 'Last 30 Days'
                    : dateRangeOption === 'quarter' ? 'Last 90 Days'
                    : dateRangeOption === 'year' ? 'Last Year'
                    : 'All Time'}
              </span>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <div className="toolbar">
            <div className="search-container">
              <form onSubmit={handleSearchSubmit} className="search-form">
                <input
                  type="text"
                  placeholder="Search posts..."
                  value={filters.searchTerm}
                  onChange={handleSearchChange}
                  className="search-input"
                />
                <div className="search-options">
                  <select 
                    name="searchMethod" 
                    value={searchOptions.searchMethod}
                    onChange={handleSearchOptionsChange}
                    className="search-option-select"
                  >
                    <option value="database">Database Search</option>
                    <option value="live">Live Reddit Search</option>
                  </select>
                  
                  {searchOptions.searchMethod === 'live' && (
                    <>
                      <select 
                        name="sortMethod" 
                        value={searchOptions.sortMethod}
                        onChange={handleSearchOptionsChange}
                        className="search-option-select"
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
                      >
                        <option value="all">All Time</option>
                        <option value="hour">Past Hour</option>
                        <option value="day">Past Day</option>
                        <option value="week">Past Week</option>
                        <option value="month">Past Month</option>
                        <option value="year">Past Year</option>
                      </select>
                    </>
                  )}
                  
                  <button type="submit" className="search-button">
                    {searchOptions.searchMethod === 'live' ? 'Live Search' : 'Search'}
                  </button>
                </div>
              </form>
            </div>
            <div className="view-options">
              <div className="export-container">
                <button 
                  className="export-button"
                  onClick={() => setShowExportOptions(!showExportOptions)}
                >
                  Export Data ▼
                </button>
                {showExportOptions && (
                  <div className="export-dropdown">
                    <button onClick={exportToCSV}>Export as CSV</button>
                    <button onClick={exportToJSON}>Export as JSON</button>
                    <button onClick={exportToHTML}>Export as Report</button>
                  </div>
                )}
              </div>
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
                <button
                  className={visualizationType === 'sentimentOverTime' ? 'active' : ''}
                  onClick={() => setVisualizationType('sentimentOverTime')}
                >
                  Sentiment Over Time
                </button>
              </div>
            </div>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={300}>
                {visualizationType === 'sentimentDistribution' ? (
                  <BarChart data={prepareChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" name="Posts" />
                  </BarChart>
                ) : visualizationType === 'engagementVsSentiment' ? (
                  <BarChart data={prepareChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis yAxisId="left" orientation="left" stroke="#8884d8" />
                    <YAxis yAxisId="right" orientation="right" stroke="#82ca9d" domain={[-1, 1]} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="score" name="Score" fill="#8884d8" />
                    <Line yAxisId="right" type="monotone" dataKey="sentiment" name="Sentiment" stroke="#82ca9d" />
                  </BarChart>
                ) : (
                  <LineChart data={prepareChartData()}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis yAxisId="right" orientation="right" domain={[-1, 1]} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="positive" name="Positive" stroke="#4caf50" />
                    <Line yAxisId="left" type="monotone" dataKey="neutral" name="Neutral" stroke="#ff9800" />
                    <Line yAxisId="left" type="monotone" dataKey="negative" name="Negative" stroke="#f44336" />
                    <Line yAxisId="right" type="monotone" dataKey="avgSentiment" name="Avg Sentiment" stroke="#2196f3" strokeWidth={2} />
                  </LineChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          <div className="posts-container">
            <h2>
              {isLiveSearch ? 'Live Reddit Posts' : 'Reddit Posts'}
              {filters.searchTerm && <span className="search-term-display"> for "{filters.searchTerm}"</span>}
            </h2>
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
                {currentPosts.length > 0 ? (
                  currentPosts.map(post => (
                    <tr key={post.id}>
                      <td className="post-title-cell">
                        {post.title}
                        {post.subreddit && <span className="subreddit-tag">r/{post.subreddit}</span>}
                      </td>
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
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="no-posts-message">
                      No posts found. Try adjusting your filters or search term.
                    </td>
                  </tr>
                )}
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
                Page {currentPage} of {Math.ceil(filteredPosts.length / postsPerPage) || 1}
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
      
      {/* Auth Modal */}
      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
      
      {/* Save Filter Modal */}
      <SaveFilterModal
        isOpen={showSaveFilterModal}
        onClose={() => setShowSaveFilterModal(false)}
        currentFilters={filters}
      />
    </div>
  );
}

// Make sure to include this default export
export default App;