// server.js
import express from 'express';
import cors from 'cors';
import inventoryRoutes from './routes/inventory.js';
import transactionRoutes from './routes/transactions.js';

const app = express();
const PORT = process.env.PORT || 5000;

// Middlewares
app.use(cors());
app.use(express.json()); // parse JSON body

// Routes
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transactions', transactionRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
