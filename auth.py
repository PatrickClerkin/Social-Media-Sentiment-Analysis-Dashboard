# Modify your app.py to integrate the authentication API

# Add these imports at the top of your app.py
import json
from auth import auth_bp, init_auth_db

# Add this after creating your Flask app
app = Flask(__name__)
CORS(app, supports_credentials=True)  # Update CORS to support credentials
app.config['JWT_SECRET_KEY'] = 'your-secret-key'  # Replace with a secure key in production

# Register the auth blueprint
app.register_blueprint(auth_bp, url_prefix='/auth')

# Initialize both databases when the app starts
@app.before_first_request
def before_first_request():
    # Initialize the posts database
    init_db()
    # Initialize the authentication database
    init_auth_db()

# Update your existing routes to use authentication where needed
# For example, to make the filter saving API require authentication:

# New endpoint to save a user's filter
@app.route('/user/filters', methods=['POST'])
@token_required  # This decorator from auth.py requires authentication
def save_user_filter(current_user):
    """Save a filter configuration for a logged-in user."""
    if not request.is_json:
        return jsonify({"error": "Request must be JSON"}), 400
        
    data = request.get_json()
    
    # Validate required fields
    if not data or not data.get('name') or not data.get('filter_config'):
        return jsonify({"error": "Missing required fields"}), 400
    
    # Connect to database
    conn = get_db_connection()
    if conn is None:
        return jsonify({"error": "Failed to connect to database"}), 500
    
    try:
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO saved_filters (user_id, name, filter_config, created_at) VALUES (?, ?, ?, ?)',
            (current_user['id'], data['name'], json.dumps(data['filter_config']), time.time())
        )
        conn.commit()
        
        # Get the ID of the new filter
        filter_id = cur.lastrowid
        
        conn.close()
        
        return jsonify({
            "success": True,
            "filter": {
                "id": filter_id,
                "name": data['name']
            }
        })
    except Error as e:
        logger.error(f"Error saving filter: {e}")
        if conn:
            conn.close()
        return jsonify({"error": str(e)}), 500