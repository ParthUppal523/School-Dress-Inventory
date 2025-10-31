// server.js
import express from 'express';
import cors from 'cors';
import inventoryRoutes from './routes/inventory.js';
import transactionRoutes from './routes/transactions.js';
import authRoutes from './routes/auth.js';


const app = express();
const PORT = process.env.PORT || 8080;

// Middlewares
// Allow both your local dev frontend and your Netlify deployment frontend:
const allowedOrigins = [
  'https://hosiery-inventory-management.netlify.app', // your live frontend
  'http://127.0.0.1:5500'                      // your local dev frontend URL
];

const corsOptions = {
  origin: function(origin, callback) {
    // Allow requests with no origin (like curl or Postman)
    if(!origin) return callback(null, true);
    if(allowedOrigins.indexOf(origin) === -1){
      var msg = 'The CORS policy for this site does not ' +
                'allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  optionsSuccessStatus: 200,
  credentials: true
};

app.use(cors(corsOptions));

app.use(express.json()); // parse JSON body

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/transactions', transactionRoutes);

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
