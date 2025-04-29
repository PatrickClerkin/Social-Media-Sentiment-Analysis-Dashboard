from flask import Blueprint, request, jsonify
import jwt
import time
from datetime import datetime, timedelta
import hashlib
import sqlite3
from functools import wraps
import json
import secrets
import os
import logging

logger = logging.getLogger(__name__)

# Create a Blueprint for authentication routes
auth_bp = Blueprint('auth', __name__)

# Configuration
JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', secrets.token_hex(32))
JWT_EXPIRATION_DAYS = 7
DATABASE = 'reddit_posts.db'

def get_db_connection():
    """Establish a connection to the SQLite database."""
    try:
        conn = sqlite3.connect(DATABASE)
        conn.row_factory = sqlite3.Row  # enables dict-like access for rows
        return conn
    except sqlite3.Error as e:
        logger.error(f"Database connection error: {e}")
        return None

def init_auth_db():
    """Initialize database tables for authentication."""
    conn = get_db_connection()
    if conn is not None:
        try:
            cur = conn.cursor()
            
            # Create users table
            cur.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                created_at REAL NOT NULL,
                last_login REAL,
                preferences TEXT
            )
            ''')
            
            # Create saved_filters table
            cur.execute('''
            CREATE TABLE IF NOT EXISTS saved_filters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                filter_config TEXT NOT NULL,
                created_at REAL NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users (id)
            )
            ''')
            
            conn.commit()
            logger.info("Auth database tables created successfully")
        except sqlite3.Error as e:
            logger.error(f"Error creating auth database tables: {e}")
        finally:
            conn.close()

def hash_password(password):
    """Hash a password using SHA-256."""
    return hashlib.sha256(password.encode()).hexdigest()

def token_required(f):
    """JWT token verification decorator."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Get token from Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(' ')[1]
        
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        
        try:
            # Decode the token
            data = jwt.decode(token, JWT_SECRET_KEY, algorithms=["HS256"])
            
            # Get the user from the database
            conn = get_db_connection()
            if conn is None:
                return jsonify({"error": "Database connection failed"}), 500
                
            cursor = conn.cursor()
            cursor.execute('SELECT * FROM users WHERE id = ?', (data['user_id'],))
            current_user = cursor.fetchone()
            conn.close()
            
            if not current_user:
                return jsonify({'message': 'User not found!'}), 401
                
        except jwt.ExpiredSignatureError:
            return jsonify({'message': 'Token has expired!'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'message': 'Invalid token!'}), 401
            
        # Pass the current user to the route function
        return f(dict(current_user), *args, **kwargs)
    
    return decorated

# Routes
@auth_bp.route('/register', methods=['POST'])
def register():
    """Register a new user."""
    data = request.get_json()
    
    # Validate required fields
    if not data or not data.get('username') or not data.get('password') or not data.get('email'):
        return jsonify({'message': 'Missing required fields!'}), 400
    
    username = data.get('username')
    password = data.get('password')
    email = data.get('email')
    
    # Validate email format (basic validation)
    if '@' not in email or '.' not in email.split('@')[1]:
        return jsonify({'message': 'Invalid email format!'}), 400
    
    # Validate password length
    if len(password) < 6:
        return jsonify({'message': 'Password must be at least 6 characters!'}), 400
    
    # Hash the password
    password_hash = hash_password(password)
    
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        # Check if username or email already exist
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE username = ? OR email = ?', (username, email))
        if cursor.fetchone():
            conn.close()
            return jsonify({'message': 'Username or email already exists!'}), 409
        
        # Insert the new user
        cursor.execute(
            'INSERT INTO users (username, email, password_hash, created_at, preferences) VALUES (?, ?, ?, ?, ?)',
            (username, email, password_hash, datetime.now().timestamp(), '{}')
        )
        
        conn.commit()
        
        # Get the new user ID
        cursor.execute('SELECT id FROM users WHERE username = ?', (username,))
        user_id = cursor.fetchone()[0]
        
        conn.close()
        
        # Generate token
        expiration = int((datetime.now() + timedelta(days=JWT_EXPIRATION_DAYS)).timestamp())
        token = jwt.encode({
            'user_id': user_id,
            'exp': expiration
        }, JWT_SECRET_KEY, algorithm="HS256")
        
        return jsonify({
            'message': 'User registered successfully!',
            'token': token,
            'user': {
                'id': user_id,
                'username': username,
                'email': email,
                'preferences': {}
            }
        }), 201
    
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        logger.error(f"Registration error: {e}")
        return jsonify({'message': f'Registration failed: {str(e)}'}), 500

@auth_bp.route('/login', methods=['POST'])
def login():
    """Login and get an access token."""
    data = request.get_json()
    
    # Validate required fields
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Missing username or password!'}), 400
    
    username = data.get('username')
    password = data.get('password')
    
    # Hash the password
    password_hash = hash_password(password)
    
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    cursor = conn.cursor()
    
    # Check if the user exists
    cursor.execute('SELECT * FROM users WHERE (username = ? OR email = ?) AND password_hash = ?', 
                 (username, username, password_hash))
    user = cursor.fetchone()
    
    if not user:
        conn.close()
        return jsonify({'message': 'Invalid username or password!'}), 401
    
    # Update last login time
    cursor.execute('UPDATE users SET last_login = ? WHERE id = ?', 
                 (datetime.now().timestamp(), user['id']))
    conn.commit()
    
    # Parse preferences JSON if it exists
    preferences = {}
    if user['preferences']:
        try:
            preferences = json.loads(user['preferences'])
        except:
            logger.error(f"Failed to parse preferences for user {user['id']}")
    
    conn.close()
    
    # Generate token
    expiration = int((datetime.now() + timedelta(days=JWT_EXPIRATION_DAYS)).timestamp())
    token = jwt.encode({
        'user_id': user['id'],
        'exp': expiration
    }, JWT_SECRET_KEY, algorithm="HS256")
    
    return jsonify({
        'message': 'Login successful!',
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email'],
            'preferences': preferences
        }
    }), 200

@auth_bp.route('/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    """Get the current user's profile."""
    # Parse preferences JSON if it exists
    preferences = {}
    if current_user['preferences']:
        try:
            preferences = json.loads(current_user['preferences'])
        except:
            logger.error(f"Failed to parse preferences for user {current_user['id']}")
    
    return jsonify({
        'user': {
            'id': current_user['id'],
            'username': current_user['username'],
            'email': current_user['email'],
            'preferences': preferences,
            'created_at': current_user['created_at'],
            'last_login': current_user['last_login']
        }
    }), 200

@auth_bp.route('/preferences', methods=['PUT'])
@token_required
def update_preferences(current_user):
    """Update user preferences."""
    data = request.get_json()
    
    if not data:
        return jsonify({'message': 'No data provided!'}), 400
    
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        # Update preferences
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET preferences = ? WHERE id = ?', 
                     (json.dumps(data), current_user['id']))
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Preferences updated successfully!',
            'preferences': data
        }), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        logger.error(f"Preferences update error: {e}")
        return jsonify({'message': f'Failed to update preferences: {str(e)}'}), 500

@auth_bp.route('/filters', methods=['GET'])
@token_required
def get_filters(current_user):
    """Get saved filters for the current user."""
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    cursor = conn.cursor()
    
    # Get all filters for the user
    cursor.execute('SELECT * FROM saved_filters WHERE user_id = ? ORDER BY created_at DESC', (current_user['id'],))
    filters = cursor.fetchall()
    
    conn.close()
    
    # Convert to list of dictionaries
    result = []
    for f in filters:
        filter_dict = dict(f)
        try:
            # Parse the filter_config JSON
            filter_dict['filter_config'] = json.loads(filter_dict['filter_config'])
        except:
            logger.error(f"Failed to parse filter_config for filter {f['id']}")
            filter_dict['filter_config'] = {}
        
        result.append(filter_dict)
    
    return jsonify({
        'filters': result
    }), 200

@auth_bp.route('/filters', methods=['POST'])
@token_required
def save_filter(current_user):
    """Save a filter configuration."""
    data = request.get_json()
    
    # Validate required fields
    if not data or not data.get('name') or not data.get('filter_config'):
        return jsonify({'message': 'Missing required fields!'}), 400
    
    name = data.get('name')
    filter_config = data.get('filter_config')
    
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    try:
        # Insert the new filter
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO saved_filters (user_id, name, filter_config, created_at) VALUES (?, ?, ?, ?)',
            (current_user['id'], name, json.dumps(filter_config), datetime.now().timestamp())
        )
        
        conn.commit()
        
        # Get the new filter ID
        cursor.execute('SELECT last_insert_rowid()')
        filter_id = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            'message': 'Filter saved successfully!',
            'filter': {
                'id': filter_id,
                'name': name,
                'filter_config': filter_config
            }
        }), 201
        
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        logger.error(f"Save filter error: {e}")
        return jsonify({'message': f'Failed to save filter: {str(e)}'}), 500

@auth_bp.route('/filters/<int:filter_id>', methods=['DELETE'])
@token_required
def delete_filter(current_user, filter_id):
    """Delete a saved filter."""
    # Connect to the database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Database connection failed"}), 500
    
    cursor = conn.cursor()
    
    # Check if the filter exists and belongs to the user
    cursor.execute('SELECT * FROM saved_filters WHERE id = ? AND user_id = ?', (filter_id, current_user['id']))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'message': 'Filter not found or unauthorized!'}), 404
    
    try:
        # Delete the filter
        cursor.execute('DELETE FROM saved_filters WHERE id = ?', (filter_id,))
        conn.commit()
        conn.close()
        
        return jsonify({
            'message': 'Filter deleted successfully!'
        }), 200
        
    except Exception as e:
        if conn:
            conn.rollback()
            conn.close()
        logger.error(f"Delete filter error: {e}")
        return jsonify({'message': f'Failed to delete filter: {str(e)}'}), 500