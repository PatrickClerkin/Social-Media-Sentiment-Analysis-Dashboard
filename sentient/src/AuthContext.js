// AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';

// Create auth context
const AuthContext = createContext(null);

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Base API URL - update to match your Flask backend
  const API_URL = "http://127.0.0.1:5000";
  
  // Check for existing auth token on mount
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      fetchUserProfile(token);
    } else {
      setLoading(false);
    }
  }, []);
  
  // Fetch user profile with token
  const fetchUserProfile = async (token) => {
    try {
      const response = await fetch(`${API_URL}/auth/profile`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      } else {
        // Token invalid, clear it
        localStorage.removeItem('authToken');
        setError('Session expired. Please log in again.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  
  // Login function
  const login = async (username, password) => {
    setError(null);
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Save token to localStorage
        localStorage.setItem('authToken', data.token);
        
        // Set current user
        setCurrentUser(data.user);
        return { success: true };
      } else {
        setError(data.message || 'Login failed');
        return { success: false, message: data.message };
      }
    } catch (err) {
      setError('Network error. Please try again.');
      return { success: false, message: 'Network error' };
    }
  };
  
  // Register function
  const register = async (username, email, password) => {
    setError(null);
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, email, password })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Save token to localStorage
        localStorage.setItem('authToken', data.token);
        
        // Set current user
        setCurrentUser(data.user);
        return { success: true };
      } else {
        setError(data.message || 'Registration failed');
        return { success: false, message: data.message };
      }
    } catch (err) {
      setError('Network error. Please try again.');
      return { success: false, message: 'Network error' };
    }
  };
  
  // Logout function
  const logout = () => {
    localStorage.removeItem('authToken');
    setCurrentUser(null);
  };
  
  // Update user preferences
  const updatePreferences = async (preferences) => {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/auth/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(preferences)
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Update user preferences in state
        setCurrentUser({
          ...currentUser,
          preferences: preferences
        });
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      return { success: false, message: 'Network error' };
    }
  };
  
  // Save filter configuration
  const saveFilter = async (name, filterConfig) => {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/auth/filters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ name, filter_config: filterConfig })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        return { success: true, filter: data.filter };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      return { success: false, message: 'Network error' };
    }
  };
  
  // Get saved filters
  const getSavedFilters = async () => {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/auth/filters`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        return { success: true, filters: data.filters };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      return { success: false, message: 'Network error' };
    }
  };
  
  // Delete a saved filter
  const deleteFilter = async (filterId) => {
    if (!currentUser) return { success: false, message: 'Not logged in' };
    
    try {
      const token = localStorage.getItem('authToken');
      const response = await fetch(`${API_URL}/auth/filters/${filterId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const data = await response.json();
      
      if (response.ok) {
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      return { success: false, message: 'Network error' };
    }
  };
  
  // Context value
  const value = {
    currentUser,
    loading,
    error,
    login,
    register,
    logout,
    updatePreferences,
    saveFilter,
    getSavedFilters,
    deleteFilter
  };
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;