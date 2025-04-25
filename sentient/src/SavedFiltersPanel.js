// SavedFiltersPanel.js
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthContext';

const SavedFiltersPanel = ({ onApplyFilter }) => {
  const [filters, setFilters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const { getSavedFilters, deleteFilter } = useAuth();
  
  // Load saved filters on mount
  useEffect(() => {
    loadFilters();
  }, []);
  
  const loadFilters = async () => {
    setLoading(true);
    setError('');
    
    const result = await getSavedFilters();
    
    setLoading(false);
    
    if (result.success) {
      setFilters(result.filters || []);
    } else {
      setError(result.message || 'Failed to load saved filters');
    }
  };
  
  const handleDeleteFilter = async (filterId) => {
    if (window.confirm('Are you sure you want to delete this filter?')) {
      const result = await deleteFilter(filterId);
      
      if (result.success) {
        // Remove from local state
        setFilters(filters.filter(f => f.id !== filterId));
      } else {
        setError(result.message || 'Failed to delete filter');
      }
    }
  };
  
  if (loading) {
    return <div className="saved-filters-loading">Loading saved filters...</div>;
  }
  
  if (error) {
    return <div className="saved-filters-error">{error}</div>;
  }
  
 
  if (filters.length === 0) {
    return (
      <div className="saved-filters-empty">
        <p>No saved filters yet.</p>
        <p className="hint">Apply filters and click "Save Filters" to create one.</p>
      </div>
    );
  }
  
  return (
    <div className="saved-filters-panel">
      <h3>Your Saved Filters</h3>
      
      <ul className="saved-filter-list">
        {filters.map(filter => (
          <li key={filter.id} className="saved-filter-item">
            <div className="filter-name">{filter.name}</div>
            
            <div className="filter-actions">
              <button 
                className="apply-filter"
                onClick={() => onApplyFilter(filter.filter_config)}
                title="Apply this filter"
              >
                Apply
              </button>
              
              <button 
                className="delete-filter"
                onClick={() => handleDeleteFilter(filter.id)}
                title="Delete this filter"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SavedFiltersPanel;