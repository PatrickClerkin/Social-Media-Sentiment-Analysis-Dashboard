// AuthModal.js
import React, { useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

const AuthModal = ({ isOpen, onClose }) => {
  const [activeForm, setActiveForm] = useState('login'); // 'login' or 'register'
  
  if (!isOpen) return null;
  
  const handleSwitchToRegister = () => {
    setActiveForm('register');
  };
  
  const handleSwitchToLogin = () => {
    setActiveForm('login');
  };
  
  const handleSuccess = () => {
    // Close the modal on successful login/register
    setTimeout(() => {
      onClose();
    }, 1000);
  };
  
  return (
    <div className="modal-overlay">
      <div className="auth-modal">
        <button className="modal-close" onClick={onClose}>×</button>
        
        {activeForm === 'login' ? (
          <LoginForm 
            onSuccess={handleSuccess}
            onSwitchToRegister={handleSwitchToRegister}
          />
        ) : (
          <RegisterForm 
            onSuccess={handleSuccess}
            onSwitchToLogin={handleSwitchToLogin}
          />
        )}
      </div>
    </div>
  );
};

export default AuthModal;