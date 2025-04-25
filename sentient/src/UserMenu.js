// UserMenu.js
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';

const UserMenu = () => {
  const { currentUser, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  
  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  if (!currentUser) return null;
  
  return (
    <div className="user-menu" ref={menuRef}>
      <button 
        className="user-menu-button" 
        onClick={() => setIsOpen(!isOpen)}
      >
        {currentUser.username || 'User'} <span className="down-arrow">▼</span>
      </button>
      
      {isOpen && (
        <div className="user-menu-dropdown">
          <div className="user-info">
            <p className="username">{currentUser.username}</p>
            <p className="email">{currentUser.email}</p>
          </div>
          
          <div className="menu-divider"></div>
          
          <button 
            className="menu-item"
            onClick={() => {
              setIsOpen(false);
              // Navigate to saved filters or show saved filters
            }}
          >
            Saved Filters
          </button>
          
          <div className="menu-divider"></div>
          
          <button 
            className="menu-item logout"
            onClick={() => {
              logout();
              setIsOpen(false);
            }}
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
};

export default UserMenu;