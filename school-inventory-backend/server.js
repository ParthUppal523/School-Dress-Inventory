// server.js
import cors from 'cors';
import express from 'express';
import authRoutes from './routes/auth.js';
import inventoryRoutes from './routes/inventory.js';
import transactionRoutes from './routes/transactions.js';

const app = express();
const PORT = process.env.PORT || 8080;

// ✅ Step 1: Define allowed origins (Netlify frontend + local dev)
const allowedOrigins = [
  'https://hosiery-inventory-management.netlify.app',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];

// ✅ Step 2: Use CORS middleware
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// ✅ Step 3: Body parser
app.use(express.json());

// ✅ Step 4: Routes
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transactions', transactionRoutes);

// ✅ Step 5: Health check route (optional)
app.get('/', (req, res) => {
  res.send('✅ Backend running and CORS configured');
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

