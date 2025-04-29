// AuthContext.js
import React, { createContext, useState, useContext, useEffect } from 'react';

// Create the auth context
const AuthContext = createContext();

// API URL - change as needed
const API_URL = "http://127.0.0.1:5000";

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check for existing auth on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('authToken');
      const userData = localStorage.getItem('userData');
      
      if (token && userData) {
        try {
          // Validate token by making a request to profile endpoint
          const response = await fetch(`${API_URL}/auth/profile`, {
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          
          if (response.ok) {
            // Token is valid, set the user data
            setCurrentUser(JSON.parse(userData));
          } else {
            // Token is invalid, clear storage
            localStorage.removeItem('authToken');
            localStorage.removeItem('userData');
          }
        } catch (err) {
          console.error('Error checking authentication:', err);
        }
      }
      
      setLoading(false);
    };
    
    checkAuth();
  }, []);

  // Register a new user
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
        // Save token and user data
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userData', JSON.stringify(data.user));
        
        // Set current user
        setCurrentUser(data.user);
        
        return { success: true };
      } else {
        setError(data.message || 'Registration failed');
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('Registration failed. Please try again.');
      return { success: false, message: 'Registration failed. Please try again.' };
    }
  };

  // Login user
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
        // Save token and user data
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('userData', JSON.stringify(data.user));
        
        // Set current user
        setCurrentUser(data.user);
        
        return { success: true };
      } else {
        setError(data.message || 'Login failed');
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Login failed. Please try again.');
      return { success: false, message: 'Login failed. Please try again.' };
    }
  };

  // Logout user
  const logout = () => {
    // Remove token and user data from localStorage
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    
    // Clear user state
    setCurrentUser(null);
  };

  // Update user preferences
  const updatePreferences = async (preferences) => {
    const token = localStorage.getItem('authToken');
    
    if (!token || !currentUser) {
      return { success: false, message: 'Not authenticated' };
    }
    
    try {
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
        // Update local user data
        const updatedUser = {
          ...currentUser,
          preferences: preferences
        };
        
        setCurrentUser(updatedUser);
        localStorage.setItem('userData', JSON.stringify(updatedUser));
        
        return { success: true };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('Error updating preferences:', err);
      return { success: false, message: 'Failed to update preferences' };
    }
  };

  // Save a filter
  const saveFilter = async (name, filterConfig) => {
    const token = localStorage.getItem('authToken');
    
    if (!token || !currentUser) {
      return { success: false, message: 'Not authenticated' };
    }
    
    try {
      const response = await fetch(`${API_URL}/auth/filters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name,
          filter_config: filterConfig
        })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        return { success: true, filter: data.filter };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err) {
      console.error('Error saving filter:', err);
      return { success: false, message: 'Failed to save filter' };
    }
  };

  // Get saved filters
  const getSavedFilters = async () => {
    const token = localStorage.getItem('authToken');
    
    if (!token || !currentUser) {
      return { success: false, message: 'Not authenticated' };
    }
    
    try {
      const response = await fetch(`${API_URL}/auth/filters`, {
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
      console.error('Error getting filters:', err);
      return { success: false, message: 'Failed to get filters' };
    }
  };

  // Delete a filter
  const deleteFilter = async (filterId) => {
    const token = localStorage.getItem('authToken');
    
    if (!token || !currentUser) {
      return { success: false, message: 'Not authenticated' };
    }
    
    try {
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
      console.error('Error deleting filter:', err);
      return { success: false, message: 'Failed to delete filter' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        loading,
        error,
        register,
        login,
        logout,
        updatePreferences,
        saveFilter,
        getSavedFilters,
        deleteFilter
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;