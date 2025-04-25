// LoginForm.js
import React, { useState } from 'react';
import { useAuth } from './AuthContext';

const LoginForm = ({ onSuccess, onSwitchToRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { login } = useAuth();
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }
    
    setIsLoading(true);
    setError('');
    
    const result = await login(username, password);
    
    setIsLoading(false);
    
    if (result.success) {
      if (onSuccess) onSuccess();
    } else {
      setError(result.message || 'Login failed. Please try again.');
    }
  };
  
  return (
    <div className="auth-form-container">
      <h2>Login</h2>
      
      {error && <div className="auth-error">{error}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="username">Username or Email</label>
          <input
            type="text"
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            type="password"
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            required
          />
        </div>
        
        <button 
          type="submit" 
          className="auth-button"
          disabled={isLoading}
        >
          {isLoading ? 'Logging in...' : 'Login'}
        </button>
      </form>
      
      <p className="auth-switch">
        Don't have an account?{' '}
        <button 
          type="button" 
          className="switch-button"
          onClick={onSwitchToRegister}
          disabled={isLoading}
        >
          Register
        </button>
      </p>
    </div>
  );
};

export default LoginForm;