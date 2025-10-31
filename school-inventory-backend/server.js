// server.js
import express from 'express';
import cors from 'cors';
import inventoryRoutes from './routes/inventory.js';
import transactionRoutes from './routes/transactions.js';
import authRoutes from './routes/auth.js';

app.use('/api/auth', authRoutes);


const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares
app.use(cors());
app.use(express.json()); // parse JSON body

// Routes
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transactions', transactionRoutes);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
