// App.js with fixes for comments, sorting, and links
import React, { useState, useEffect, useCallback, useMemo, Suspense, lazy } from 'react';
import {
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
  Area, AreaChart, PieChart, Pie, Cell
} from 'recharts';
import { useAuth } from './AuthContext';
import debounce from 'lodash/debounce';
import throttle from 'lodash/throttle';
import './App.css';

// Lazy-loaded components
const UserMenu = lazy(() => import('./UserMenu'));
const AuthModal = lazy(() => import('./Authmodal'));
const SaveFilterModal = lazy(() => import('./SaveFilterModal'));
const SavedFiltersPanel = lazy(() => import('./SavedFiltersPanel'));
const ShareDashboardModal = lazy(() => import('./ShareDashboardModal'));

// Import styles

// Rest of your App.js code follows...
// Start with your COLORS constant
const COLORS = {
  positive: ['#4caf50', '#81c784', '#a5d6a7'],
  neutral: ['#ff9800', '#ffb74d', '#ffcc80'],
  negative: ['#f44336', '#e57373', '#ef9a9a'],
  accent: ['#2196f3', '#64b5f6', '#90caf9'],
  chart: ['#4caf50', '#ff9800', '#f44336', '#2196f3', '#9c27b0', '#3f51b5']
};

// Improved URL validation function to fix issue with malformed URLs
function isValidUrl(url) {
  if (!url) return false;
  
  try {
    const parsed = new URL(url);
    
    // Allow only http and https protocols
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    
    // Ensure URL has a hostname of at least minimum length
    if (!parsed.hostname || parsed.hostname.length < 3) {
      return false;
    }
    
    // Check for malformed URLs with missing slashes
    if (!url.match(/^https?:\/\//)) {
      return false;
    }
    
    return true;
  } catch (e) {
    return false;
  }
}

function App() {
  // State for posts data with enhanced initial state
  const [posts, setPosts] = useState([]);
  const [filteredPosts, setFilteredPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [isLiveSearch, setIsLiveSearch] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // State for pagination with enhanced default values
  const [currentPage, setCurrentPage] = useState(1);
  const [postsPerPage, setPostsPerPage] = useState(10);
  const [totalPosts, setTotalPosts] = useState(0);

  // State for filters with enhanced validation
  const [filters, setFilters] = useState({
    minScore: '',
    maxScore: '',
    minComments: '',
    maxComments: '',
    sentiment: '',
    searchTerm: '',
    startDate: '',
    endDate: '',
    subreddit: '',
  });

  // Advanced search state
  const [advancedSearch, setAdvancedSearch] = useState(false);
  const [savedSearches, setSavedSearches] = useState([]);

  // State for date range selection with more options
  const [dateRangeOption, setDateRangeOption] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ startDate: '', endDate: '' });

  // State for sorting with enhanced options
  const [sortConfig, setSortConfig] = useState({
    key: 'created_utc',
    direction: 'desc',
  });

  // State for visualization with more visualization types
  const [visualizationType, setVisualizationType] = useState('sentimentDistribution');
  const [visualizationConfig, setVisualizationConfig] = useState({
    showLegend: true,
    showGrid: true,
    showTooltip: true,
    animate: true,
    height: 300,
  });

  // State for dark/light mode with system preference detection
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    if (savedMode !== null) return savedMode === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  // State for modals with improved handling
  const [modals, setModals] = useState({
    auth: false,
    saveFilter: false,
    savedSearches: false,
    shareModal: false,
    advancedSearch: false,
    viewPost: null, // For post detail view
  });

  // State for export options with enhanced formats
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');
  
  // State for search options with enhanced settings
  const [searchOptions, setSearchOptions] = useState({
    searchMethod: 'database', // 'database' or 'live'
    sortMethod: 'relevance',  // 'relevance', 'hot', 'new', 'top'
    timeFilter: 'all',        // 'hour', 'day', 'week', 'month', 'year', 'all'
    includeComments: false,   // Whether to include comment data
    autoRefresh: false,       // Auto-refresh live search
    refreshInterval: 60,      // seconds
  });

  // New state for comments
  const [comments, setComments] = useState([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // New state for real-time updates
  const [lastUpdate, setLastUpdate] = useState(null);
  const [autoRefreshTimer, setAutoRefreshTimer] = useState(null);

  // State for share URL
  const [shareUrl, setShareUrl] = useState('');

  // Use the auth context
  const { 
    currentUser, 
    updatePreferences, 
    saveSearch, 
    getSavedSearches, 
    deleteSearch 
  } = useAuth();

  // Base API URL with enhanced fallback
  const BASE_URL = process.env.REACT_APP_API_URL || "http://127.0.0.1:5000";

  // Enhanced error handling for fetch operations
  const handleFetchError = useCallback((error, operation) => {
    console.error(`Error during ${operation}:`, error);
    let errorMessage = `Failed to ${operation}`;
    
    if (error.response) {
      // Server responded with a non-2xx status
      errorMessage += `: ${error.response.status} ${error.response.statusText}`;
      if (error.response.data && error.response.data.message) {
        errorMessage += ` - ${error.response.data.message}`;
      }
    } else if (error.request) {
      // Request was made but no response received
      errorMessage += `: No response received from server. Please check your connection.`;
    } else {
      // Something else happened
      errorMessage += `: ${error.message}`;
    }
    
    setError({ message: errorMessage, details: error });
    return { success: false, message: errorMessage };
  }, []);

  // Enhanced fetch operation with retries and timeout
  const enhancedFetch = useCallback(async (url, options = {}, retries = 3, timeout = 10000) => {
    let lastError;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const fetchOptions = {
          ...options,
          signal: controller.signal,
        };
        
        if (currentUser) {
          const token = localStorage.getItem('authToken');
          if (token) {
            fetchOptions.headers = {
              ...fetchOptions.headers,
              'Authorization': `Bearer ${token}`
            };
          }
        }
        
        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          // Handle rate limiting specifically
          if (response.status === 429) {
            const retryAfter = response.headers.get('Retry-After');
            const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue; // Retry after waiting
          }
          
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        lastError = error;
        
        // Don't retry if it was an abort
        if (error.name === 'AbortError') {
          throw new Error('Request timed out. Please try again.');
        }
        
        // Wait before retrying
        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
        }
      }
    }
    
    throw lastError;
  }, [currentUser]);

  // Set up auto-refresh for live searches
  const setupAutoRefresh = useCallback(() => {
    // Clear existing timer if any
    if (autoRefreshTimer) {
      clearInterval(autoRefreshTimer);
    }
    
    // Set up new timer
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchPosts(true);
      }
    }, searchOptions.refreshInterval * 1000);
    
    setAutoRefreshTimer(intervalId);
    
    // Return cleanup function
    return () => clearInterval(intervalId);
  }, [searchOptions.refreshInterval, autoRefreshTimer]);

  // Enhanced helper: convert date string to Unix timestamp
  const dateToTimestamp = useCallback((dateString) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : Math.floor(date.getTime() / 1000);
  }, []);

  // Fetch posts with enhanced error handling and loading states
  // MODIFIED: Now accepts a filtersToUse parameter instead of relying on filters state directly
  const fetchPosts = useCallback(async (resetPage = true, filtersToUse = null) => {
    if (resetPage) {
      setLoading(true);
      setCurrentPage(1);
    } else {
      setLoadingMore(true);
    }
    
    setError(null);
    setIsLiveSearch(false);

    try {
      // Build URL and parameters based on search method and filters
      let url = `${BASE_URL}/posts`;
      const params = new URLSearchParams();
      
      // Use provided filters or fall back to current filters state
      const currentFilters = filtersToUse || filters;
      
      // If search term is set, determine if we should use live search
      if (currentFilters.searchTerm && searchOptions.searchMethod === 'live') {
        // For live search use the dedicated /search endpoint
        url = `${BASE_URL}/search`;
        params.append('q', currentFilters.searchTerm);
        params.append('sort', searchOptions.sortMethod);
        params.append('time_filter', searchOptions.timeFilter);
        
        if (searchOptions.includeComments) {
          params.append('include_comments', 'true');
        }
        
        setIsLiveSearch(true);
        
        if (currentFilters.subreddit) {
          params.append('subreddit', currentFilters.subreddit);
        }
      } else {
        // Regular database search with all filters
        if (currentFilters.minScore) params.append('min_score', currentFilters.minScore);
        if (currentFilters.maxScore) params.append('max_score', currentFilters.maxScore);
        if (currentFilters.minComments) params.append('min_comments', currentFilters.minComments);
        if (currentFilters.maxComments) params.append('max_comments', currentFilters.maxComments);
        if (currentFilters.sentiment) params.append('sentiment', currentFilters.sentiment);
        if (currentFilters.subreddit) params.append('subreddit', currentFilters.subreddit);
        if (currentFilters.searchTerm) params.append('search', currentFilters.searchTerm);

        const startTs = dateToTimestamp(currentFilters.startDate);
        const endTs = dateToTimestamp(currentFilters.endDate);
        if (startTs) params.append('start_date', startTs);
        if (endTs) params.append('end_date', endTs + 86400); // Include the full day
        
        // Pagination parameters
        params.append('limit', postsPerPage);
        if (!resetPage && currentPage > 1) {
          params.append('offset', (currentPage - 1) * postsPerPage);
        }
        
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
      
      // Execute the fetch request with our enhanced fetch
      const data = await enhancedFetch(finalUrl);
      
      // Update state based on whether we're loading more or resetting
      if (resetPage) {
        setPosts(data);
        setFilteredPosts(data);
        setCurrentPage(1);
      } else {
        setPosts(prev => [...prev, ...data]);
        setFilteredPosts(prev => [...prev, ...data]);
        setCurrentPage(prev => prev + 1);
      }
      
      setHasMore(data.length === postsPerPage);
      setTotalPosts(data.length); // This should be updated from API pagination info
      setLastUpdate(new Date());
      
      // If auto-refresh is enabled for live search, set up the timer
      if (isLiveSearch && searchOptions.autoRefresh) {
        setupAutoRefresh();
      }
    } catch (error) {
      handleFetchError(error, 'fetch posts');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [
    BASE_URL, 
    // filters,  // REMOVED: no longer a dependency
    searchOptions, 
    currentPage, 
    postsPerPage, 
    sortConfig, 
    enhancedFetch, 
    handleFetchError,
    setupAutoRefresh,
    dateToTimestamp,
    isLiveSearch
  ]);

  // Function to fetch comments for a specific post
  const fetchComments = useCallback(async (postId) => {
    setLoadingComments(true);
    
    try {
      // Use the new /posts/{postId}/comments endpoint instead of /comments/{postId}
      const url = `${BASE_URL}/posts/${postId}/comments`;
      console.log("Fetching comments from:", url);
      
      const data = await enhancedFetch(url);
      setComments(data);
    } catch (error) {
      console.error("Error fetching comments:", error);
      
      // Fallback for development - if we're using test/mock data, generate some comments
      if (process.env.NODE_ENV === 'development') {
        console.log("Using mock comments in development mode");
        // Create some mock comments for the selected post
        const mockComments = Array(5).fill(null).map((_, i) => ({
          id: `comment_${i}_${postId}`,
          post_id: postId,
          author: `MockUser_${i}`,
          body: `This is a mock comment ${i+1} for testing purposes. Since the real comments endpoint isn't available, we're generating this placeholder content.`,
          score: Math.floor(Math.random() * 100),
          created_utc: Date.now()/1000 - Math.floor(Math.random() * 86400),
          sentiment_compound: Math.random() * 2 - 1,
          sentiment_neg: Math.random() * 0.5,
          sentiment_neu: Math.random() * 0.5,
          sentiment_pos: Math.random() * 0.5
        }));
        setComments(mockComments);
      } else {
        handleFetchError(error, 'fetch comments');
      }
    } finally {
      setLoadingComments(false);
    }
  }, [BASE_URL, enhancedFetch, handleFetchError]);

  // Handle visibility change for auto-refresh
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isLiveSearch && searchOptions.autoRefresh) {
        fetchPosts(true, filters); // MODIFIED: Pass current filters explicitly
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isLiveSearch, searchOptions.autoRefresh, fetchPosts, filters]);

  // Cleanup auto-refresh timer when component unmounts
  useEffect(() => {
    return () => {
      if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
      }
    };
  }, [autoRefreshTimer]);

  // Initial fetch & user prefs
  useEffect(() => {
    // Load saved preferences if user is logged in
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
      
      if (currentUser.preferences.postsPerPage) {
        setPostsPerPage(currentUser.preferences.postsPerPage);
      }
    } else {
      // Apply dark mode based on saved preference or system preference
      const savedDark = localStorage.getItem('darkMode') === 'true';
      setDarkMode(savedDark);
      document.body.className = savedDark ? 'dark-mode' : '';
    }
    
    // Load saved searches
    if (currentUser) {
      getSavedSearches().then(result => {
        if (result && result.success) {
          setSavedSearches(result.searches || []);
        }
      });
    }
    
    // Initial data fetch - MODIFIED: pass current filters explicitly 
    fetchPosts(true, filters);
    
    // Apply system dark mode changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = e => {
      if (localStorage.getItem('darkMode') === null) {
        setDarkMode(e.matches);
        document.body.className = e.matches ? 'dark-mode' : '';
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [currentUser, fetchPosts, getSavedSearches, filters]);

  // Debounced and throttled filter application for performance
  const debouncedApplyFilters = useCallback(
    debounce((newFilters) => {
      setFilters(newFilters);
      fetchPosts(true, newFilters); // MODIFIED: Pass newFilters explicitly
    }, 500),
    [fetchPosts]
  );

  // Throttled search for performance
  const throttledSearch = useCallback(
    throttle((term) => {
      const newFilters = { ...filters, searchTerm: term };
      setFilters(newFilters);
      fetchPosts(true, newFilters); // MODIFIED: Pass newFilters explicitly
    }, 1000),
    [fetchPosts, filters]
  );

  // Enhanced function to handle all modal states
  const toggleModal = useCallback((modalName, value = null) => {
    setModals(prev => ({
      ...prev,
      [modalName]: value === null ? !prev[modalName] : value
    }));
  }, []);

  // Enhanced filter form submission
  const handleFilterSubmit = useCallback((e) => {
    e.preventDefault();
    fetchPosts(true, filters); // MODIFIED: Pass current filters explicitly
  }, [fetchPosts, filters]);

  // Enhanced filter input change with validation
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

  // Enhanced search input change with debouncing
  const handleSearchChange = useCallback((e) => {
    const value = e.target.value;
    setFilters(prev => ({ ...prev, searchTerm: value }));
    
    // Removed the auto-search logic to prevent searches as user types
    // Now search will only happen when the form is submitted
  }, []);
  
  // Enhanced search options change handler
  const handleSearchOptionsChange = useCallback((e) => {
    const { name, value } = e.target;
    
    // Handle checkbox inputs
    const actualValue = e.target.type === 'checkbox' ? e.target.checked : value;
    
    setSearchOptions(prev => ({ ...prev, [name]: actualValue }));
    
    // Save preference if user is logged in
    if (currentUser && name === 'searchMethod') {
      updatePreferences({ 
        ...currentUser.preferences, 
        searchMethod: actualValue 
      });
    }
  }, [currentUser, updatePreferences]);
  
  // Enhanced date range picker
  const handleDateRangeChange = useCallback((option) => {
    setDateRangeOption(option);
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    let start = '', end = todayStr;
    
    switch(option) {
      case 'today':
        start = todayStr;
        break;
      case 'yesterday': 
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        start = yesterday.toISOString().split('T')[0];
        end = start;
        break;
      case 'week':
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);
        start = weekAgo.toISOString().split('T')[0];
        break;
      case 'month':
        const monthAgo = new Date(today);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        start = monthAgo.toISOString().split('T')[0];
        break;
      case 'quarter':
        const quarterAgo = new Date(today);
        quarterAgo.setMonth(quarterAgo.getMonth() - 3);
        start = quarterAgo.toISOString().split('T')[0];
        break;
      case 'year':
        const yearAgo = new Date(today);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        start = yearAgo.toISOString().split('T')[0];
        break;
      case 'custom':
        start = customDateRange.startDate;
        end = customDateRange.endDate;
        break;
      default:
        start = '';
        end = '';
    }
    
    setFilters(prev => ({ ...prev, startDate: start, endDate: end }));
  }, [customDateRange]);

  // Enhanced custom date range handling
  const handleCustomDateChange = useCallback((e) => {
    const { name, value } = e.target;
    setCustomDateRange(prev => ({ ...prev, [name]: value }));
    
    if (dateRangeOption === 'custom') {
      setFilters(prev => ({ ...prev, [name]: value }));
    }
  }, [dateRangeOption]);

  // Enhanced dark mode toggle with system preference consideration
  const toggleDarkMode = useCallback(() => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.body.className = newMode ? 'dark-mode' : '';
    localStorage.setItem('darkMode', newMode.toString());
    
    if (currentUser) {
      updatePreferences({
        ...currentUser.preferences,
        darkMode: newMode
      });
    }
  }, [darkMode, currentUser, updatePreferences]);

  // Enhanced sort handling - FIXED to actually perform client-side sorting when needed
  const requestSort = useCallback((key) => {
    setSortConfig(prevConfig => {
      const direction = prevConfig.key === key && prevConfig.direction === 'asc' ? 'desc' : 'asc';
      return { key, direction };
    });
    
    // If using server-side sorting, refetch data
    if (!isLiveSearch) {
      fetchPosts(true, filters); // MODIFIED: Pass current filters explicitly
    } else {
      // For live search or when we don't want to hit the server again, do client-side sorting
      setFilteredPosts(prevPosts => {
        const sortedPosts = [...prevPosts].sort((a, b) => {
          // Handle different data types appropriately
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
        return sortedPosts;
      });
    }
  }, [isLiveSearch, fetchPosts, sortConfig, filters]);

  // Enhanced infinite scroll detection
  const handleScroll = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    
    const scrollPosition = window.innerHeight + document.documentElement.scrollTop;
    const scrollThreshold = document.documentElement.offsetHeight - 200;
    
    if (scrollPosition >= scrollThreshold) {
      fetchPosts(false, filters); // MODIFIED: Pass current filters explicitly
    }
  }, [loading, loadingMore, hasMore, fetchPosts, filters]);

  // Add scroll event listener for infinite scroll
  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Save search function
  const handleSaveSearch = useCallback(async (name) => {
    if (!currentUser) {
      toggleModal('auth', true);
      return;
    }
    
    const searchData = {
      name,
      filters,
      searchOptions,
      sortConfig
    };
    
    const result = await saveSearch(name, searchData);
    
    if (result && result.success) {
      // Update saved searches list
      setSavedSearches(prev => [result.search, ...prev]);
      toggleModal('saveFilter', false);
      return true;
    }
    
    return false;
  }, [currentUser, filters, searchOptions, sortConfig, saveSearch, toggleModal]);

  // Apply saved search
  const handleApplySavedSearch = useCallback((search) => {
    if (search && search.filter_config) {
      const newFilters = search.filter_config.filters || {};
      setFilters(newFilters);
      setSearchOptions(search.filter_config.searchOptions || searchOptions);
      setSortConfig(search.filter_config.sortConfig || sortConfig);
      fetchPosts(true, newFilters); // MODIFIED: Pass newFilters explicitly
    }
  }, [fetchPosts, searchOptions, sortConfig]);

  // Enhanced sentiment badge class with more granular options
  const getSentimentClass = useCallback((compound) => {
    if (compound > 0.6) return 'very-positive';
    if (compound > 0.2) return 'positive';
    if (compound > 0.05) return 'slightly-positive';
    if (compound < -0.6) return 'very-negative';
    if (compound < -0.2) return 'negative';
    if (compound < -0.05) return 'slightly-negative';
    return 'neutral';
  }, []);

  // Enhanced format date with more options
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

  // Memoized data for visualizations
  const visualizationData = useMemo(() => {
    if (!filteredPosts.length) return [];
    
    switch (visualizationType) {
      case 'sentimentDistribution': {
        const positive = filteredPosts.filter(post => post.sentiment_compound > 0.05).length;
        const neutral = filteredPosts.filter(post => post.sentiment_compound >= -0.05 && post.sentiment_compound <= 0.05).length;
        const negative = filteredPosts.filter(post => post.sentiment_compound < -0.05).length;
        
        return [
          { name: 'Positive', value: positive, fill: COLORS.positive[0] },
          { name: 'Neutral', value: neutral, fill: COLORS.neutral[0] },
          { name: 'Negative', value: negative, fill: COLORS.negative[0] }
        ];
      }
      
      case 'sentimentOverTime': {
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
        // Sort posts by score for visualization
        return [...filteredPosts]
          .sort((a, b) => b.score - a.score)
          .slice(0, 10)
          .map(post => ({
            name: post.title.substring(0, 20) + '...',
            score: post.score,
            comments: post.num_comments,
            sentiment: post.sentiment_compound,
            engagement: post.score + post.num_comments
          }));
      }
      
      case 'sentimentPie': {
        // Creating more detailed sentiment breakdown
        const veryPositive = filteredPosts.filter(post => post.sentiment_compound > 0.6).length;
        const positive = filteredPosts.filter(post => post.sentiment_compound > 0.2 && post.sentiment_compound <= 0.6).length;
        const slightlyPositive = filteredPosts.filter(post => post.sentiment_compound > 0.05 && post.sentiment_compound <= 0.2).length;
        const neutral = filteredPosts.filter(post => post.sentiment_compound >= -0.05 && post.sentiment_compound <= 0.05).length;
        const slightlyNegative = filteredPosts.filter(post => post.sentiment_compound >= -0.2 && post.sentiment_compound < -0.05).length;
        const negative = filteredPosts.filter(post => post.sentiment_compound >= -0.6 && post.sentiment_compound < -0.2).length;
        const veryNegative = filteredPosts.filter(post => post.sentiment_compound < -0.6).length;
        
        return [
          { name: 'Very Positive', value: veryPositive, fill: '#2e7d32' },
          { name: 'Positive', value: positive, fill: '#4caf50' },
          { name: 'Slightly Positive', value: slightlyPositive, fill: '#a5d6a7' },
          { name: 'Neutral', value: neutral, fill: '#ff9800' },
          { name: 'Slightly Negative', value: slightlyNegative, fill: '#ffab91' },
          { name: 'Negative', value: negative, fill: '#f44336' },
          { name: 'Very Negative', value: veryNegative, fill: '#b71c1c' }
        ];
      }
      
      default:
        return [];
    }
  }, [filteredPosts, visualizationType]);

  // Enhanced data for statistics panel
  const statsData = useMemo(() => {
    if (!filteredPosts.length) return {
      totalPosts: 0,
      avgScore: 'N/A',
      avgComments: 'N/A',
      avgSentiment: 'N/A',
      sentimentBreakdown: { positive: 0, neutral: 0, negative: 0 }
    };
    
    const total = filteredPosts.length;
    const avgScore = filteredPosts.reduce((sum, post) => sum + post.score, 0) / total;
    const avgComments = filteredPosts.reduce((sum, post) => sum + post.num_comments, 0) / total;
    const avgSentiment = filteredPosts.reduce((sum, post) => sum + post.sentiment_compound, 0) / total;
    
    const positive = filteredPosts.filter(post => post.sentiment_compound > 0.05).length;
    const neutral = filteredPosts.filter(post => post.sentiment_compound >= -0.05 && post.sentiment_compound <= 0.05).length;
    const negative = filteredPosts.filter(post => post.sentiment_compound < -0.05).length;
    
    // Get most active subreddits
    const subredditCounts = {};
    filteredPosts.forEach(post => {
      const subreddit = post.subreddit || 'unknown';
      subredditCounts[subreddit] = (subredditCounts[subreddit] || 0) + 1;
    });
    
    const topSubreddits = Object.entries(subredditCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
    
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
      },
      topSubreddits
    };
  }, [filteredPosts]);

  // Enhanced export functionality with more options
  const exportData = useCallback((format) => {
    const exportFilename = `reddit_sentiment_${new Date().toISOString().split('T')[0]}`;
    
    switch (format) {
      case 'csv': {
        // Convert to CSV format
        const headers = [
          'id', 'title', 'subreddit', 'score', 'num_comments', 
          'sentiment_compound', 'sentiment_pos', 'sentiment_neu', 'sentiment_neg',
          'created_utc', 'created_date', 'url'
        ];
        
        const csvRows = [headers.join(',')];
        
        for (const post of filteredPosts) {
          const values = headers.map(header => {
            let value = post[header];
            
            // Format date for the created_date field
            if (header === 'created_date') {
              value = formatDate(post.created_utc);
            }
            
            // Handle strings that need to be quoted
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            
            return value !== undefined ? value : '';
          });
          
          csvRows.push(values.join(','));
        }
        
        const csvContent = csvRows.join('\n');
        
        // Create and trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.setAttribute('href', url);
        link.setAttribute('download', `${exportFilename}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        break;
      }
      
      case 'json': {
        // Format data for JSON export
        const jsonData = {
          metadata: {
            exportDate: new Date().toISOString(),
            filters: filters,
            searchOptions: searchOptions,
            totalPosts: filteredPosts.length,
            statistics: statsData
          },
          posts: filteredPosts.map(post => ({
            ...post,
            created_date: formatDate(post.created_utc)
          }))
        };
        
        const jsonContent = JSON.stringify(jsonData, null, 2);
        
        // Create and trigger download
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.setAttribute('href', url);
        link.setAttribute('download', `${exportFilename}.json`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        break;
      }
      
      case 'html': {
        // Create HTML report
        const htmlContent = `
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
              color: #333;
              max-width: 1200px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #f0f0f0;
            }
            .summary {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 20px;
              margin-bottom: 30px;
            }
            .stat-card {
              background-color: #f9f9f9;
              border-radius: 8px;
              padding: 20px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .visualization {
              margin: 30px 0;
              padding: 20px;
              background-color: #f9f9f9;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .sentiment-distribution {
              display: flex;
              height: 30px;
              border-radius: 15px;
              overflow: hidden;
              margin: 20px 0;
            }
            .sentiment-legend {
              display: flex;
              justify-content: center;
              flex-wrap: wrap;
              gap: 20px;
              margin-bottom: 20px;
            }
            .legend-item {
              display: flex;
              align-items: center;
              gap: 5px;
            }
            .color-box {
              width: 15px;
              height: 15px;
              border-radius: 3px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 30px 0;
            }
            th, td {
              padding: 12px 15px;
              text-align: left;
              border-bottom: 1px solid #ddd;
            }
            th {
              background-color: #f2f2f2;
              font-weight: bold;
            }
            tr:hover {
              background-color: #f5f5f5;
            }
            .sentiment-badge {
              display: inline-block;
              padding: 3px 8px;
              border-radius: 12px;
              font-weight: bold;
              font-size: 0.85em;
            }
            .very-positive { background-color: rgba(46, 125, 50, 0.2); color: #2e7d32; }
            .positive { background-color: rgba(76, 175, 80, 0.2); color: #4caf50; }
            .slightly-positive { background-color: rgba(165, 214, 167, 0.2); color: #4caf50; }
            .neutral { background-color: rgba(255, 152, 0, 0.2); color: #ff9800; }
            .slightly-negative { background-color: rgba(255, 171, 145, 0.2); color: #f44336; }
            .negative { background-color: rgba(244, 67, 54, 0.2); color: #f44336; }
            .very-negative { background-color: rgba(183, 28, 28, 0.2); color: #b71c1c; }
            footer {
              text-align: center;
              margin-top: 50px;
              padding-top: 20px;
              border-top: 2px solid #f0f0f0;
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
          <div class="summary">
            <div class="stat-card">
              <h3>Total Posts</h3>
              <p>${statsData.totalPosts}</p>
            </div>
            <div class="stat-card">
              <h3>Average Score</h3>
              <p>${statsData.avgScore}</p>
            </div>
            <div class="stat-card">
              <h3>Average Comments</h3>
              <p>${statsData.avgComments}</p>
            </div>
            <div class="stat-card">
              <h3>Average Sentiment</h3>
              <p>${statsData.avgSentiment}</p>
            </div>
          </div>
          
          <div class="visualization">
            <h2>Sentiment Distribution</h2>
            <div class="sentiment-distribution">
              <div style="background-color: #4caf50; width: ${statsData.sentimentBreakdown.positivePercent}%;"></div>
              <div style="background-color: #ff9800; width: ${statsData.sentimentBreakdown.neutralPercent}%;"></div>
              <div style="background-color: #f44336; width: ${statsData.sentimentBreakdown.negativePercent}%;"></div>
            </div>
            <div class="sentiment-legend">
              <div class="legend-item">
                <div class="color-box" style="background-color: #4caf50;"></div>
                <span>Positive: ${statsData.sentimentBreakdown.positive} (${statsData.sentimentBreakdown.positivePercent}%)</span>
              </div>
              <div class="legend-item">
                <div class="color-box" style="background-color: #ff9800;"></div>
                <span>Neutral: ${statsData.sentimentBreakdown.neutral} (${statsData.sentimentBreakdown.neutralPercent}%)</span>
              </div>
              <div class="legend-item">
                <div class="color-box" style="background-color: #f44336;"></div>
                <span>Negative: ${statsData.sentimentBreakdown.negative} (${statsData.sentimentBreakdown.negativePercent}%)</span>
              </div>
            </div>
          </div>
          
          ${statsData.topSubreddits.length > 0 ? `
          <div class="visualization">
            <h2>Top Subreddits</h2>
            <table>
              <thead>
                <tr>
                  <th>Subreddit</th>
                  <th>Post Count</th>
                </tr>
              </thead>
              <tbody>
                ${statsData.topSubreddits.map(sr => `
                <tr>
                  <td>r/${sr.name}</td>
                  <td>${sr.count}</td>
                </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          ` : ''}
          
          <h2>Posts</h2>
          <p>Displaying ${Math.min(filteredPosts.length, 50)} of ${filteredPosts.length} posts</p>
          
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
              ${filteredPosts.slice(0, 50).map(post => `
              <tr>
                <td>${post.title}${post.subreddit ? ` <small>(r/${post.subreddit})</small>` : ''}</td>
                <td>${post.score}</td>
                <td>${post.num_comments}</td>
                <td><span class="sentiment-badge ${getSentimentClass(post.sentiment_compound)}">${post.sentiment_compound.toFixed(2)}</span></td>
                <td>${formatDate(post.created_utc)}</td>
              </tr>
              `).join('')}
            </tbody>
          </table>
          
          <footer>
            <p>Generated with Reddit Sentiment Dashboard</p>
            <p>Analysis based on data from ${filters.searchTerm ? `search term "${filters.searchTerm}"` : 'filtered posts'}</p>
          </footer>
        </body>
        </html>
        `;
        
        // Create and trigger download
        const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        link.setAttribute('href', url);
        link.setAttribute('download', `${exportFilename}.html`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        break;
      }
      
      default:
        console.error('Unsupported export format:', format);
    }
    
    setShowExportOptions(false);
  }, [filteredPosts, filters, searchOptions, statsData, formatDate, getSentimentClass]);

  // New function to handle sharing the dashboard
  const handleShareDashboard = useCallback(() => {
    // Create a shareable link with current filters and settings encoded in query params
    const searchParams = new URLSearchParams();
    
    // Add filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value) searchParams.append(`filter_${key}`, value);
    });
    
    // Add search options
    Object.entries(searchOptions).forEach(([key, value]) => {
      if (value) searchParams.append(`search_${key}`, value);
    });
    
    // Add visualization type
    searchParams.append('viz', visualizationType);
    
    // Generate the full URL
    const shareUrl = `${window.location.origin}${window.location.pathname}?${searchParams.toString()}`;
    
    // Store in state for the share modal
    setShareUrl(shareUrl);
    toggleModal('shareModal', true);
  }, [filters, searchOptions, visualizationType, toggleModal]);

  // Loading state
  if (loading && !loadingMore) {
    return (
      <div className={`app-loading ${darkMode ? 'dark-mode' : ''}`}>
        <div className="loading-spinner"></div>
        <p className="loading-text">Loading Reddit data...</p>
      </div>
    );
  }
  
  // Error state with retry button
  if (error && !filteredPosts.length) {
    return (
      <div className={`app-error ${darkMode ? 'dark-mode' : ''}`}>
        <div className="error-container">
          <h2>Error Loading Data</h2>
          <p>{error.message}</p>
          <button className="retry-button" onClick={() => fetchPosts(true, filters)}>
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
            <div className="header-actions">
              {currentUser ? (
                <Suspense fallback={<div className="loading-indicator small"></div>}>
                  <button 
                    className="header-button save-button"
                    onClick={() => toggleModal('saveFilter', true)}
                    title="Save current filters"
                  >
                    <i className="icon-save"></i>
                    <span>Save Filters</span>
                  </button>
                  <button 
                    className="header-button share-button"
                    onClick={handleShareDashboard}
                    title="Share this dashboard"
                  >
                    <i className="icon-share"></i>
                    <span className="button-text-hide-mobile">Share</span>
                  </button>
                  <UserMenu />
                </Suspense>
              ) : (
                <button 
                  className="header-button login-button"
                  onClick={() => toggleModal('auth', true)}
                >
                  <i className="icon-user"></i>
                  <span>Login / Sign Up</span>
                </button>
              )}
              <button 
                onClick={toggleDarkMode} 
                className="header-button theme-toggle"
                title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <i className={`icon-${darkMode ? 'sun' : 'moon'}`}></i>
                <span className="button-text-hide-mobile">
                  {darkMode ? 'Light Mode' : 'Dark Mode'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="dashboard-container">
        <aside className="sidebar">
          {/* User's saved filters */}
          {currentUser && (
            <Suspense fallback={<div className="panel-loading">Loading saved filters...</div>}>
              <SavedFiltersPanel 
                onApplyFilter={handleApplySavedSearch}
                onDeleteFilter={(id) => {
                  deleteSearch(id);
                  setSavedSearches(prev => prev.filter(s => s.id !== id));
                }}
                savedSearches={savedSearches}
              />
            </Suspense>
          )}
          
          {/* Filter panel */}
          <div className="filter-panel">
            <div className="panel-header">
              <h2>Filters</h2>
              <button 
                className="panel-toggle-button"
                onClick={() => setAdvancedSearch(!advancedSearch)}
                title={advancedSearch ? "Show basic filters" : "Show advanced filters"}
              >
                <i className={`icon-${advancedSearch ? 'chevron-up' : 'chevron-down'}`}></i>
              </button>
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
                  {advancedSearch && (
                    <>
                      <option value="very-positive">Very Positive</option>
                      <option value="slightly-positive">Slightly Positive</option>
                      <option value="slightly-negative">Slightly Negative</option>
                      <option value="very-negative">Very Negative</option>
                    </>
                  )}
                </select>
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
              
              <div className="filter-group">
                <label htmlFor="date-range-select">Date Range:</label>
                <select
                  id="date-range-select"
                  value={dateRangeOption}
                  onChange={(e) => handleDateRangeChange(e.target.value)}
                  className="date-range-select"
                  aria-label="Date range options"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
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
                    <label htmlFor="start-date">Start Date:</label>
                    <input
                      type="date"
                      id="start-date"
                      name="startDate"
                      value={customDateRange.startDate}
                      onChange={handleCustomDateChange}
                      aria-label="Start date"
                    />
                  </div>
                  <div className="date-input-container">
                    <label htmlFor="end-date">End Date:</label>
                    <input
                      type="date"
                      id="end-date"
                      name="endDate"
                      value={customDateRange.endDate}
                      onChange={handleCustomDateChange}
                      min={customDateRange.startDate} // Can't select a date before the start date
                      aria-label="End date"
                    />
                  </div>
                </div>
              )}

              {advancedSearch && (
                <>
                  <div className="filter-group">
                    <label htmlFor="sort-method">Sort By:</label>
                    <select
                      id="sort-method"
                      value={sortConfig.key}
                      onChange={(e) => setSortConfig({ key: e.target.value, direction: sortConfig.direction })}
                      aria-label="Sort by field"
                    >
                      <option value="created_utc">Date</option>
                      <option value="score">Score</option>
                      <option value="num_comments">Comments</option>
                      <option value="sentiment_compound">Sentiment</option>
                      <option value="title">Title</option>
                    </select>
                    <div className="sort-direction">
                      <label className="radio-label">
                        <input
                          type="radio"
                          name="sort-direction"
                          checked={sortConfig.direction === 'asc'}
                          onChange={() => setSortConfig({ ...sortConfig, direction: 'asc' })}
                          aria-label="Sort ascending"
                        />
                        <span>Ascending</span>
                      </label>
                      <label className="radio-label">
                        <input
                          type="radio"
                          name="sort-direction"
                          checked={sortConfig.direction === 'desc'}
                          onChange={() => setSortConfig({ ...sortConfig, direction: 'desc' })}
                          aria-label="Sort descending"
                        />
                        <span>Descending</span>
                      </label>
                    </div>
                  </div>
                  
                  <div className="filter-group">
                    <label>Search Options:</label>
                    <div className="checkbox-group">
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="includeComments"
                          checked={searchOptions.includeComments}
                          onChange={handleSearchOptionsChange}
                          aria-label="Include comments in search"
                        />
                        <span>Include Comments</span>
                      </label>
                      
                      {searchOptions.searchMethod === 'live' && (
                        <label className="checkbox-label">
                        <input
                          type="checkbox"
                          name="autoRefresh"
                          checked={searchOptions.autoRefresh}
                          onChange={handleSearchOptionsChange}
                          aria-label="Auto-refresh live search"
                        />
                        <span>Auto-Refresh</span>
                      </label>
                    )}
                  </div>
                  
                  {searchOptions.autoRefresh && (
                    <div className="slider-group">
                      <label htmlFor="refresh-interval">
                        Refresh Interval: {searchOptions.refreshInterval}s
                      </label>
                      <input
                        type="range"
                        id="refresh-interval"
                        name="refreshInterval"
                        min="15"
                        max="300"
                        step="15"
                        value={searchOptions.refreshInterval}
                        onChange={handleSearchOptionsChange}
                        aria-label="Refresh interval in seconds"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            <button type="submit" className="apply-filters-button">
              <i className="icon-filter"></i>
              <span>Apply Filters</span>
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
          
          {lastUpdate && (
            <div className="stat-item">
              <span className="stat-label">Last Updated:</span>
              <span className="stat-value">
                {new Date(lastUpdate).toLocaleTimeString()}
              </span>
            </div>
          )}
          
          {statsData.topSubreddits && statsData.topSubreddits.length > 0 && (
            <div className="top-subreddits">
              <h3>Top Subreddits</h3>
              <ul className="subreddit-list">
                {statsData.topSubreddits.map(sr => (
                  <li key={sr.name} className="subreddit-item">
                    <span className="subreddit-name">r/{sr.name}</span>
                    <span className="subreddit-count">{sr.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
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
                  onChange={handleSearchChange}
                  className="search-input"
                  aria-label="Search posts"
                />
                <button type="submit" className="search-button">
                  <i className="icon-search"></i>
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
                  </>
                )}
              </div>
            </form>
          </div>
          
          <div className="view-options">
            <div className="export-container">
              <button 
                className="export-button"
                onClick={() => setShowExportOptions(!showExportOptions)}
                aria-label="Export data options"
                aria-expanded={showExportOptions}
              >
                <i className="icon-download"></i>
                <span className="button-text-hide-mobile">Export</span>
                <i className="icon-chevron-down"></i>
              </button>
              
              {showExportOptions && (
                <div className="export-dropdown">
                  <button onClick={() => exportData('csv')} className="export-option">
                    <i className="icon-file-csv"></i>
                    <span>Export as CSV</span>
                  </button>
                  <button onClick={() => exportData('json')} className="export-option">
                    <i className="icon-file-json"></i>
                    <span>Export as JSON</span>
                  </button>
                  <button onClick={() => exportData('html')} className="export-option">
                    <i className="icon-file-html"></i>
                    <span>Export as Report</span>
                  </button>
                </div>
              )}
            </div>
            
            <div className="display-options">
              <label htmlFor="posts-per-page" className="select-label">Posts per page:</label>
              <select
                id="posts-per-page"
                value={postsPerPage}
                onChange={(e) => {
                  setPostsPerPage(parseInt(e.target.value));
                  // Save preference if user is logged in
                  if (currentUser) {
                    updatePreferences({
                      ...currentUser.preferences,
                      postsPerPage: parseInt(e.target.value)
                    });
                  }
                }}
                className="display-select"
                aria-label="Posts per page"
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </select>
            </div>
          </div>
        </div>

        {/* Visualizations section */}
        <div className="visualization-section">
          <div className="section-header">
            <h2>Visualizations</h2>
            <div className="visualization-controls">
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
                  className={`viz-tab ${visualizationType === 'sentimentPie' ? 'active' : ''}`}
                  onClick={() => setVisualizationType('sentimentPie')}
                  aria-pressed={visualizationType === 'sentimentPie'}
                >
                  Detailed Sentiment
                </button>
              </div>
              
              <div className="visualization-options">
                <button 
                  className="viz-option-button"
                  onClick={() => setVisualizationConfig(prev => ({ ...prev, showLegend: !prev.showLegend }))}
                  title={visualizationConfig.showLegend ? "Hide legend" : "Show legend"}
                  aria-label={visualizationConfig.showLegend ? "Hide legend" : "Show legend"}
                >
                  <i className={`icon-${visualizationConfig.showLegend ? 'eye' : 'eye-off'}`}></i>
                </button>
                <button 
                  className="viz-option-button"
                  onClick={() => setVisualizationConfig(prev => ({ ...prev, showGrid: !prev.showGrid }))}
                  title={visualizationConfig.showGrid ? "Hide grid" : "Show grid"}
                  aria-label={visualizationConfig.showGrid ? "Hide grid" : "Show grid"}
                >
                  <i className={`icon-${visualizationConfig.showGrid ? 'grid' : 'grid-off'}`}></i>
                </button>
              </div>
            </div>
          </div>
          
          <div className="chart-container" style={{ height: visualizationConfig.height }}>
            {filteredPosts.length === 0 ? (
              <div className="no-data-message">
                <p>No data available for visualization. Try adjusting your filters.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {visualizationType === 'sentimentDistribution' ? (
                  <BarChart data={visualizationData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    {visualizationConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                    <XAxis dataKey="name" />
                    <YAxis />
                    {visualizationConfig.showTooltip && <Tooltip />}
                    {visualizationConfig.showLegend && <Legend />}
                    <Bar 
                      dataKey="value" 
                      name="Posts" 
                      fill="#8884d8" 
                      isAnimationActive={visualizationConfig.animate}
                    >
                      {visualizationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                ) : visualizationType === 'sentimentOverTime' ? (
                  <AreaChart data={visualizationData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    {visualizationConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis yAxisId="right" orientation="right" domain={[-1, 1]} />
                    {visualizationConfig.showTooltip && <Tooltip />}
                    {visualizationConfig.showLegend && <Legend />}
                    <Area 
                      yAxisId="left" 
                      type="monotone" 
                      dataKey="positive" 
                      name="Positive" 
                      stackId="1"
                      stroke={COLORS.positive[0]} 
                      fill={COLORS.positive[2]} 
                      isAnimationActive={visualizationConfig.animate} 
                    />
                    <Area 
                      yAxisId="left" 
                      type="monotone" 
                      dataKey="neutral" 
                      name="Neutral" 
                      stackId="1"
                      stroke={COLORS.neutral[0]} 
                      fill={COLORS.neutral[2]} 
                      isAnimationActive={visualizationConfig.animate} 
                    />
                    <Area 
                      yAxisId="left" 
                      type="monotone" 
                      dataKey="negative" 
                      name="Negative" 
                      stackId="1"
                      stroke={COLORS.negative[0]} 
                      fill={COLORS.negative[2]} 
                      isAnimationActive={visualizationConfig.animate} 
                    />
                    <Line 
                      yAxisId="right" 
                      type="monotone" 
                      dataKey="avgSentiment" 
                      name="Avg Sentiment" 
                      stroke={COLORS.accent[0]} 
                      strokeWidth={2} 
                      dot={{ r: 4 }}
                      isAnimationActive={visualizationConfig.animate} 
                    />
                  </AreaChart>
                ) : visualizationType === 'engagementVsSentiment' ? (
                  <BarChart data={visualizationData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    {visualizationConfig.showGrid && <CartesianGrid strokeDasharray="3 3" />}
                    <XAxis dataKey="name" />
                    <YAxis yAxisId="left" orientation="left" />
                    <YAxis yAxisId="right" orientation="right" domain={[-1, 1]} />
                    {visualizationConfig.showTooltip && <Tooltip />}
                    {visualizationConfig.showLegend && <Legend />}
                    <Bar 
                      yAxisId="left" 
                      dataKey="score" 
                      name="Score" 
                      fill={COLORS.accent[0]} 
                      isAnimationActive={visualizationConfig.animate} 
                    />
                    <Bar 
                      yAxisId="left" 
                      dataKey="comments" 
                      name="Comments" 
                      fill={COLORS.neutral[0]} 
                      isAnimationActive={visualizationConfig.animate} 
                    />
                    <Line 
                      yAxisId="right" 
                      type="monotone" 
                      dataKey="sentiment" 
                      name="Sentiment" 
                      stroke="#ff0000"
                      isAnimationActive={visualizationConfig.animate} 
                      strokeWidth={2}
                    />
                  </BarChart>
                ) : (
                  <PieChart margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
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
                      isAnimationActive={visualizationConfig.animate}
                    >
                      {visualizationData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    {visualizationConfig.showTooltip && <Tooltip />}
                    {visualizationConfig.showLegend && <Legend />}
                  </PieChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
          
          {filteredPosts.length > 0 && (
            <div className="chart-caption">
              {visualizationType === 'sentimentDistribution' && (
                <p>Distribution of post sentiment across {filteredPosts.length} posts.</p>
              )}
              {visualizationType === 'sentimentOverTime' && (
                <p>Sentiment trends over time, showing positive, neutral, and negative posts along with average sentiment score.</p>
              )}
              {visualizationType === 'engagementVsSentiment' && (
                <p>Relationship between post engagement (score and comments) and sentiment.</p>
              )}
              {visualizationType === 'sentimentPie' && (
                <p>Detailed breakdown of sentiment categories across all analyzed posts.</p>
              )}
            </div>
          )}
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
            
            {filteredPosts.length > 0 && (
              <div className="results-info">
                <span>Showing {filteredPosts.length} result{filteredPosts.length !== 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          {filteredPosts.length > 0 ? (
            <>
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
                          <i className={`icon-chevron-${sortConfig.direction === 'asc' ? 'up' : 'down'}`}></i>
                        )}
                      </th>
                      <th 
                        className={`sortable ${sortConfig.key === 'score' ? `sorted-${sortConfig.direction}` : ''}`}
                        onClick={() => requestSort('score')}
                      >
                        Score
                        {sortConfig.key === 'score' && (
                          <i className={`icon-chevron-${sortConfig.direction === 'asc' ? 'up' : 'down'}`}></i>
                        )}
                      </th>
                      <th 
                        className={`sortable ${sortConfig.key === 'num_comments' ? `sorted-${sortConfig.direction}` : ''}`}
                        onClick={() => requestSort('num_comments')}
                      >
                        Comments
                        {sortConfig.key === 'num_comments' && (
                          <i className={`icon-chevron-${sortConfig.direction === 'asc' ? 'up' : 'down'}`}></i>
                        )}
                      </th>
                      <th 
                        className={`sortable ${sortConfig.key === 'sentiment_compound' ? `sorted-${sortConfig.direction}` : ''}`}
                        onClick={() => requestSort('sentiment_compound')}
                      >
                        Sentiment
                        {sortConfig.key === 'sentiment_compound' && (
                          <i className={`icon-chevron-${sortConfig.direction === 'asc' ? 'up' : 'down'}`}></i>
                        )}
                      </th>
                      <th 
                        className={`sortable ${sortConfig.key === 'created_utc' ? `sorted-${sortConfig.direction}` : ''}`}
                        onClick={() => requestSort('created_utc')}
                      >
                        Date
                        {sortConfig.key === 'created_utc' && (
                          <i className={`icon-chevron-${sortConfig.direction === 'asc' ? 'up' : 'down'}`}></i>
                        )}
                      </th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPosts.slice(0, postsPerPage).map(post => (
                      <tr key={post.id} className="post-row">
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
                            <i className="icon-message-circle"></i>
                            <span>{post.num_comments}</span>
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
                        <td className="post-actions-cell">
                          <div className="post-actions">
                            <a 
                              href={isValidUrl(post.url) ? post.url : '#'} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="action-button view-button"
                              title="View on Reddit"
                              onClick={(e) => {
                                if (!isValidUrl(post.url)) {
                                  e.preventDefault();
                                  console.warn('Invalid URL detected:', post.url);
                                  alert('This post has an invalid URL. Please try the details view instead.');
                                }
                              }}
                            >
                              <i className="icon-external-link"></i>
                              <span className="button-text-hide-mobile">View</span>
                            </a>
                            <button
                              className="action-button details-button"
                              onClick={() => {
                                // First fetch comments, then show the modal
                                fetchComments(post.id);
                                toggleModal('viewPost', post.id);
                              }}
                              title="View details"
                            >
                              <i className="icon-info"></i>
                              <span className="button-text-hide-mobile">Details</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="posts-footer">
                <div className="pagination">
                  <button
                    onClick={() => {
                      if (currentPage > 1) {
                        setCurrentPage(prev => prev - 1);
                      }
                    }}
                    disabled={currentPage === 1}
                    className="pagination-button"
                    aria-label="Previous page"
                  >
                    <i className="icon-chevron-left"></i>
                    <span>Previous</span>
                  </button>
                  
                  <div className="page-info">
                    Page {currentPage} of {Math.max(1, Math.ceil(filteredPosts.length / postsPerPage))}
                  </div>
                  
                  <button
                    onClick={() => {
                      if (currentPage < Math.ceil(filteredPosts.length / postsPerPage)) {
                        setCurrentPage(prev => prev + 1);
                      }
                    }}
                    disabled={currentPage >= Math.ceil(filteredPosts.length / postsPerPage)}
                    className="pagination-button"
                    aria-label="Next page"
                  >
                    <span>Next</span>
                    <i className="icon-chevron-right"></i>
                  </button>
                </div>
                
                {hasMore && (
                  <button 
                    className="load-more-button"
                    onClick={() => fetchPosts(false, filters)} // MODIFIED: Pass current filters explicitly
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <div className="button-spinner"></div>
                        <span>Loading more...</span>
                      </>
                    ) : (
                      <>
                        <i className="icon-plus"></i>
                        <span>Load More Posts</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </>
          ) : error ? (
            <div className="error-message">
              <i className="icon-alert-circle"></i>
              <p>{error.message}</p>
              <button onClick={() => fetchPosts(true, filters)} className="retry-button"> // MODIFIED: Pass current filters explicitly
                <i className="icon-refresh"></i>
                <span>Retry</span>
              </button>
            </div>
          ) : (
            <div className="no-posts-message">
              <i className="icon-search"></i>
              <p>No posts found matching your criteria. Try adjusting your filters or search term.</p>
            </div>
          )}
        </div>
      </main>
    </div>

    <footer className="footer">
      <div className="footer-content">
        <div className="footer-logo">
          <h3>Reddit Sentiment Dashboard</h3>
          <p>Analyzing Reddit sentiment with VADER and React</p>
        </div>
        
        <div className="footer-links">
          <h4>Resources</h4>
          <ul>
            <li><a href="https://github.com/cjhutto/vaderSentiment" target="_blank" rel="noopener noreferrer">VADER Sentiment Analysis</a></li>
            <li><a href="https://www.reddit.com/dev/api/" target="_blank" rel="noopener noreferrer">Reddit API</a></li>
            <li><a href="https://reactjs.org/" target="_blank" rel="noopener noreferrer">React</a></li>
          </ul>
        </div>
        
        <div className="footer-info">
          <p>&copy; {new Date().getFullYear()} Reddit Sentiment Dashboard</p>
          <p>Version 2.0.0</p>
        </div>
      </div>
    </footer>
    
    {/* Modals */}
    <Suspense fallback={null}>
      {/* Auth Modal */}
      <AuthModal 
        isOpen={modals.auth} 
        onClose={() => toggleModal('auth', false)} 
      />
      
      {/* Save Filter Modal */}
      <SaveFilterModal
        isOpen={modals.saveFilter}
        onClose={() => toggleModal('saveFilter', false)}
        currentFilters={filters}
      />
      
      {/* Share Dashboard Modal */}
      {modals.shareModal && (
        <div className="modal-overlay">
          <div className="modal-container">
            <button className="modal-close" onClick={() => toggleModal('shareModal', false)}>
              <i className="icon-x"></i>
            </button>
            
            <div className="modal-header">
              <h2>Share Dashboard</h2>
            </div>
            
            <div className="modal-body">
              <p>Share this dashboard with others by copying the link below:</p>
              
              <div className="share-url-container">
                <input
                  type="text"
                  value={shareUrl}
                  readOnly
                  className="share-url-input"
                  ref={node => node && node.select()}
                />
                
                <button
                  className="copy-button"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    alert('Link copied to clipboard!');
                  }}
                >
                  <i className="icon-copy"></i>
                </button>
              </div>
              
              <div className="social-share-buttons">
                <button
                  className="social-share-button twitter"
                  onClick={() => window.open(`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent('Check out this Reddit sentiment analysis dashboard!')}`, '_blank')}
                >
                  <i className="icon-twitter"></i>
                  <span>Twitter</span>
                </button>
                
                <button
                  className="social-share-button email"
                  onClick={() => window.open(`mailto:?subject=${encodeURIComponent('Reddit Sentiment Dashboard')}&body=${encodeURIComponent(`Check out this Reddit sentiment analysis dashboard: ${shareUrl}`)}`, '_blank')}
                >
                  <i className="icon-mail"></i>
                  <span>Email</span>
                </button>
              </div>
            </div>
            
            <div className="modal-footer">
              <button
                className="modal-button cancel"
                onClick={() => toggleModal('shareModal', false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Post Detail Modal */}
      {modals.viewPost && (
        <div className="modal-overlay">
          <div className="modal-container post-detail-modal">
            <button className="modal-close" onClick={() => toggleModal('viewPost', null)}>
              <i className="icon-x"></i>
            </button>
            
            {(() => {
              const post = filteredPosts.find(p => p.id === modals.viewPost);
              
              if (!post) {
                return (
                  <div className="modal-body">
                    <p>Post not found.</p>
                  </div>
                );
              }
              
              return (
                <>
                  <div className="modal-header">
                    <h2>{post.title}</h2>
                    <div className="post-meta">
                      <span className="post-subreddit">r/{post.subreddit}</span>
                      <span className="post-author">Posted by u/{post.author}</span>
                      <span className="post-date">{formatDate(post.created_utc)}</span>
                    </div>
                  </div>
                  
                  <div className="modal-body">
                    <div className="post-content">
                      {post.selftext ? (
                        <div className="post-text">{post.selftext}</div>
                      ) : (
                        <div className="post-url">
                          <a href={isValidUrl(post.url) ? post.url : '#'} target="_blank" rel="noopener noreferrer">{post.url}</a>
                        </div>
                      )}
                    </div>
                    
                    <div className="post-stats">
                      <div className="post-stat">
                        <span className="stat-label">Score:</span>
                        <span className="stat-value">{post.score}</span>
                      </div>
                      <div className="post-stat">
                        <span className="stat-label">Comments:</span>
                        <span className="stat-value">{post.num_comments}</span>
                      </div>
                      <div className="post-stat">
                        <span className="stat-label">Upvote Ratio:</span>
                        <span className="stat-value">{(post.upvote_ratio * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    
                    <div className="sentiment-analysis">
                      <h3>Sentiment Analysis</h3>
                      
                      <div className="sentiment-meter">
                        <div className="sentiment-scale">
                          <div className="scale-negative">Negative</div>
                          <div className="scale-neutral">Neutral</div>
                          <div className="scale-positive">Positive</div>
                        </div>
                        <div className="sentiment-indicator" style={{ 
                          left: `${((post.sentiment_compound + 1) / 2) * 100}%` 
                        }}></div>
                      </div>
                      
                      <div className="sentiment-details">
                        <div className="sentiment-detail">
                          <span className="detail-label">Compound:</span>
                          <span className={`detail-value ${getSentimentClass(post.sentiment_compound)}`}>
                            {post.sentiment_compound.toFixed(2)}
                          </span>
                        </div>
                        <div className="sentiment-detail">
                          <span className="detail-label">Positive:</span>
                          <span className="detail-value">{(post.sentiment_pos * 100).toFixed(1)}%</span>
                        </div>
                        <div className="sentiment-detail">
                          <span className="detail-label">Neutral:</span>
                          <span className="detail-value">{(post.sentiment_neu * 100).toFixed(1)}%</span>
                        </div>
                        <div className="sentiment-detail">
                          <span className="detail-label">Negative:</span>
                          <span className="detail-value">{(post.sentiment_neg * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                    
                    {comments.length > 0 && (
                      <div className="post-comments">
                        <h3>Top Comments</h3>
                        
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
                        
                        {loadingComments && (
                          <div className="comments-loading">
                            <div className="loading-spinner small"></div>
                            <span>Loading comments...</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {!comments.length && !loadingComments && (
                      <div className="comments-actions">
                        <button 
                          className="load-comments-button"
                          onClick={() => fetchComments(post.id)}
                          disabled={loadingComments}
                        >
                          <i className="icon-message-circle"></i>
                          <span>Load Comments</span>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <div className="modal-footer">
                    <a 
                      href={isValidUrl(post.url) ? post.url : '#'} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="modal-button primary"
                      onClick={(e) => {
                        if (!isValidUrl(post.url)) {
                          e.preventDefault();
                          alert('This post has an invalid URL.');
                        }
                      }}
                    >
                      View on Reddit
                    </a>
                    <button
                      className="modal-button secondary"
                      onClick={() => toggleModal('viewPost', null)}
                    >
                      Close
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </Suspense>
  </div>
);
}

export default App;