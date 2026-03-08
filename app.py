from flask import Flask, render_template, jsonify, request, redirect, url_for, flash, session
from flask_bcrypt import Bcrypt
import pyotp
import qrcode
import io
import base64
import json
import os

app = Flask(__name__)
app.secret_key = 'super_secret_key_change_in_production'
bcrypt = Bcrypt(app)

DB_FILE = 'users_db.json'
NOTIFICATIONS_FILE = 'notifications.json'

def load_db():
    if os.path.exists(DB_FILE):
        with open(DB_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_db():
    with open(DB_FILE, 'w') as f:
        json.dump(users_db, f, indent=4)

def load_notifications():
    if os.path.exists(NOTIFICATIONS_FILE):
        with open(NOTIFICATIONS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_notifications(notifs):
    with open(NOTIFICATIONS_FILE, 'w') as f:
        json.dump(notifs, f, indent=4)

# Mock databases
users_db = load_db()

chart_data = {
    'This Year': {
        'labels': ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        'income': [0] * 12,
        'expenses': [0] * 12
    }
}

# --- Routes ---

@app.route('/')
def index():
    if 'user_email' not in session or session['user_email'] not in users_db:
        session.clear()
        return redirect(url_for('login'))
    
    user = users_db[session['user_email']]
    if user['is_admin']:
        return redirect(url_for('admin_dashboard'))
    return render_template('index.html', user=user)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email')
        password = request.form.get('password')
        
        user = users_db.get(email)
        if user and bcrypt.check_password_hash(user['password'], password):
            
            session['user_email'] = email
            return redirect(url_for('index'))
        
        flash('Invalid email or password', 'error')
    return render_template('login.html')

@app.route('/signup', methods=['GET', 'POST'])
def signup():
    if request.method == 'POST':
        name = request.form.get('name')
        email = request.form.get('email')
        password = request.form.get('password')
        
        if email in users_db:
            flash('Email already exists', 'error')
        else:
            users_db[email] = {
                'name': name,
                'password': bcrypt.generate_password_hash(password).decode('utf-8'),
                'is_admin': False,
                '2fa_enabled': False,
                '2fa_secret': pyotp.random_base32(),
                'balance': 0.0,
                'income': 0.0,
                'expenses': 0.0,
                'savings_goal': 10000.0,
                'savings_percent': 0,
                'transactions': []
            }
            save_db()
            flash('Account created! Please login.', 'success')
            return redirect(url_for('login'))
            
    return render_template('signup.html')

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/verify-2fa', methods=['GET', 'POST'])
def verify_2fa():
    if 'temp_user_email' not in session:
        return redirect(url_for('login'))
    
    if request.method == 'POST':
        token = request.form.get('token', '').strip()
        email = session['temp_user_email']
        user = users_db[email]
        
        totp = pyotp.TOTP(user['2fa_secret'])
        if totp.verify(token, valid_window=1):
            session['user_email'] = email
            session.pop('temp_user_email')
            return redirect(url_for('index'))
        
        flash('Invalid 2FA token', 'error')
        
    return render_template('verify_2fa.html')

@app.route('/setup-2fa')
def setup_2fa():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return redirect(url_for('login'))
    
    user = users_db[session['user_email']]
    totp = pyotp.TOTP(user['2fa_secret'])
    provisioning_uri = totp.provisioning_uri(name=session['user_email'], issuer_name="Finova")
    
    # Generate QR Code
    img = qrcode.make(provisioning_uri)
    buf = io.BytesIO()
    img.save(buf)
    qr_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
    
    return render_template('setup_2fa.html', qr_code=qr_b64, secret=user['2fa_secret'])

@app.route('/enable-2fa', methods=['POST'])
def enable_2fa():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return jsonify({'success': False}), 401
    
    token = request.json.get('token', '').strip()
    user = users_db[session['user_email']]
    totp = pyotp.TOTP(user['2fa_secret'])
    
    if totp.verify(token, valid_window=1):
        user['2fa_enabled'] = True
        save_db()
        return jsonify({'success': True})
    
    return jsonify({'success': False, 'message': 'Invalid token'})

@app.route('/admin')
def admin_dashboard():
    if 'user_email' not in session or session['user_email'] not in users_db or not users_db[session['user_email']]['is_admin']:
        return redirect(url_for('index'))
    
    total_users = len(users_db)
    total_deposits = sum(user['balance'] for user in users_db.values())
    return render_template('admin.html', total_users=total_users, total_deposits=total_deposits, users=users_db)

@app.route('/transactions')
def nav_transactions():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return redirect(url_for('login'))
    return render_template('transactions.html')

@app.route('/investments')
def nav_investments():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return redirect(url_for('login'))
    return render_template('investments.html')

@app.route('/cards')
def nav_cards():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return redirect(url_for('login'))
    return render_template('cards.html')

@app.route('/settings')
def nav_settings():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return redirect(url_for('login'))
    return render_template('settings.html')

# --- API Endpoints ---

@app.route('/api/user_data')
def get_user_data():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return jsonify({}), 401
    user = users_db[session['user_email']]
    return jsonify({
        'name': user['name'],
        'balance': user['balance'],
        'income': user['income'],
        'expenses': user['expenses'],
        'savings_goal': user['savings_goal'],
        'savings_percent': user['savings_percent'],
        '2fa_enabled': user['2fa_enabled'],
        'email': session['user_email']
    })

@app.route('/api/transactions')
def get_transactions():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return jsonify([]), 401
    return jsonify(users_db[session['user_email']]['transactions'])

@app.route('/api/add_money', methods=['POST'])
def add_money():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return jsonify({'success': False}), 401
    
    data = request.json
    amount = float(data.get('amount', 0))
    method = data.get('payment_method', 'Manual').capitalize()
    
    user_email = session['user_email']
    user = users_db[user_email]
    user['balance'] += amount
    user['income'] += amount
    
    user['transactions'].insert(0, {
        'title': f'Deposit ({method})',
        'category': 'Deposit',
        'icon': 'CARD' if method == 'Card' else 'BANK',
        'date': 'Just now',
        'status': 'Completed',
        'amount': amount
    })
    save_db()

    # Add notification
    all_notifs = load_notifications()
    if user_email not in all_notifs:
        all_notifs[user_email] = []
    
    all_notifs[user_email].insert(0, {
        'id': len(all_notifs[user_email]) + 1,
        'title': 'Deposit Successful',
        'message': f'Your deposit of NGN {amount:,.2f} via {method} has been processed.',
        'time': 'Just now',
        'is_read': False
    })
    save_notifications(all_notifs)
    
    return jsonify({'success': True})

@app.route('/api/chart_data')
def get_chart_data():
    period = request.args.get('period', 'This Year')
    data = chart_data.get(period, chart_data['This Year'])
    return jsonify(data)

@app.route('/api/notifications')
def get_notifications():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return jsonify([]), 401
    
    all_notifs = load_notifications()
    user_notifs = all_notifs.get(session['user_email'], [])
    return jsonify(user_notifs)

@app.route('/api/mark_notifications_read', methods=['POST'])
def mark_notifications_read():
    if 'user_email' not in session or session['user_email'] not in users_db:
        return jsonify({'success': False}), 401
    
    all_notifs = load_notifications()
    if session['user_email'] in all_notifs:
        for notif in all_notifs[session['user_email']]:
            notif['is_read'] = True
        save_notifications(all_notifs)
    
    return jsonify({'success': True})

if __name__ == '__main__':
    app.run(debug=True, port=5000)



