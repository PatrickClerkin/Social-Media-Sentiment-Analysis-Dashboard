// ShareDashboardModal.js
import React, { useState, useRef, useEffect } from 'react';

const ShareDashboardModal = ({ isOpen, onClose, shareUrl }) => {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);
  
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.select();
    }
    
    setCopied(false);
  }, [isOpen]);
  
  if (!isOpen) return null;
  
  const handleCopyLink = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(err => {
          console.error('Failed to copy: ', err);
          // Fallback to manual copy
          if (inputRef.current) {
            inputRef.current.select();
            document.execCommand('copy');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }
        });
    } else {
      // Fallback for browsers that don't support clipboard API
      if (inputRef.current) {
        inputRef.current.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };
  
  const handleTwitterShare = () => {
    const text = 'Check out this Reddit sentiment analysis dashboard!';
    const twitterUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(text)}`;
    window.open(twitterUrl, '_blank');
  };
  
  const handleEmailShare = () => {
    const subject = 'Reddit Sentiment Dashboard';
    const body = `Check out this Reddit sentiment analysis dashboard: ${shareUrl}`;
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, '_blank');
  };
  
  const handleClose = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };
  
  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-container">
        <button className="modal-close" onClick={onClose}>
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
              ref={inputRef}
            />
            
            <button
              className="copy-button"
              onClick={handleCopyLink}
              title="Copy to clipboard"
            >
              <i className={copied ? "icon-check" : "icon-copy"}></i>
            </button>
          </div>
          
          {copied && (
            <div className="copy-success-message">
              <i className="icon-check"></i> Link copied to clipboard!
            </div>
          )}
          
          <div className="share-divider">
            <span>Or share via</span>
          </div>
          
          <div className="social-share-buttons">
            <button
              className="social-share-button twitter"
              onClick={handleTwitterShare}
            >
              <i className="icon-twitter"></i>
              <span>Twitter</span>
            </button>
            
            <button
              className="social-share-button email"
              onClick={handleEmailShare}
            >
              <i className="icon-mail"></i>
              <span>Email</span>
            </button>
          </div>
        </div>
        
        <div className="modal-footer">
          <button
            className="modal-button cancel"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareDashboardModal;