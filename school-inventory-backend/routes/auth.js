import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../db.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Login route
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    
    try {
        // Query user from database
        const [users] = await db.query('SELECT * FROM users WHERE username = ?', [username]);
        
        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const user = users[0];
        
        // Compare password (plaintext fallback for testing)
        const dbPassword = user.password_hash || user.password;  // Support both column names
        const isValidPassword =
            dbPassword.startsWith('$2b$') || dbPassword.startsWith('$2a$')
                ? await bcrypt.compare(password, dbPassword) // bcrypt hash
                : password === dbPassword; // plain text

        if (!isValidPassword) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        // Generate JWT token
        const token = jwt.sign(
            { userId: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        res.json({ success: true, token, username: user.username });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;
