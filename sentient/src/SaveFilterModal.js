// SaveFilterModal.js
import React, { useState } from 'react';
import { useAuth } from './AuthContext';

const SaveFilterModal = ({ isOpen, onClose, currentFilters }) => {
  const [filterName, setFilterName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  const { saveFilter } = useAuth();
  
  if (!isOpen) return null;
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!filterName.trim()) {
      setError('Please enter a filter name');
      return;
    }
    
    setIsLoading(true);
    setError('');
    setSuccess('');
    
    const result = await saveFilter(filterName, currentFilters);
    
    setIsLoading(false);
    
    if (result.success) {
      setSuccess('Filter saved successfully!');
      setFilterName('');
      
      // Auto close after a short delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } else {
      setError(result.message || 'Failed to save filter. Please try again.');
    }
  };
  
  return (
    <div className="modal-overlay">
      <div className="filter-modal">
        <button className="modal-close" onClick={onClose}>×</button>
        
        <h2>Save Current Filters</h2>
        
        {error && <div className="modal-error">{error}</div>}
        {success && <div className="modal-success">{success}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="filterName">Filter Name</label>
            <input
              type="text"
              id="filterName"
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder="My Custom Filter"
              disabled={isLoading}
              required
            />
          </div>
          
          <div className="filter-summary">
            <h3>Current Filter Settings</h3>
            <div className="filter-details">
              {Object.entries(currentFilters).map(([key, value]) => {
                if (!value || value === '') return null;
                
                let label = key;
                switch(key) {
                  case 'minScore': label = 'Min Score'; break;
                  case 'maxScore': label = 'Max Score'; break;
                  case 'minComments': label = 'Min Comments'; break;
                  case 'maxComments': label = 'Max Comments'; break;
                  case 'sentiment': label = 'Sentiment'; break;
                  case 'startDate': label = 'Start Date'; break;
                  case 'endDate': label = 'End Date'; break;
                  case 'searchTerm': label = 'Search Term'; break;
                  default: break;
                }
                
                return (
                  <div key={key} className="filter-item">
                    <span className="filter-label">{label}:</span>
                    <span className="filter-value">{value}</span>
                  </div>
                );
              })}
              
              {Object.values(currentFilters).every(v => !v || v === '') && (
                <p className="no-filters">No active filters</p>
              )}
            </div>
          </div>
          
          <div className="modal-actions">
            <button 
              type="button" 
              className="cancel-button"
              onClick={onClose}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="save-button"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Filter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SaveFilterModal;