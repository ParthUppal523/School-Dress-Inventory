// routes/transactions.js
import express from 'express';
import db from '../db.js';

const router = express.Router();

/**
 * GET /api/transactions
 * Returns all transactions (history)
 */
router.get('/', async (req, res) => {
  const query = `
    SELECT t.id, t.inventory_id, t.type AS txnType, t.quantity, t.rate, t.total_value, t.discount, t.net_total,
           t.remark, t.barcode, t.date,
           i.type AS itemType, i.color, i.size, i.inward_rate, i.selling_rate
    FROM transactions t
    LEFT JOIN inventory i ON t.inventory_id = i.id
    ORDER BY t.date DESC
  `;

  try {
    // ✅ Use promise-based query (no callback)
    const [results] = await db.query(query);

    const data = results.map(txn => ({
      id: txn.id,
      inventoryId: txn.inventory_id,
      type: txn.txnType,
      quantity: parseInt(txn.quantity),
      rate: parseFloat(txn.rate),
      total: parseFloat(txn.total_value || txn.quantity * txn.rate),
      discount: parseFloat(txn.discount || 0),
      netTotal: parseFloat(
        txn.net_total ||
        ((txn.total_value || txn.quantity * txn.rate) - (txn.discount || 0))
      ),
      remark: txn.remark || '',
      barcode: txn.barcode,
      date: txn.date ? txn.date.toISOString() : new Date().toISOString(),
      item: {
        type: txn.itemType,
        color: txn.color,
        size: txn.size,
        inwardRate: parseFloat(txn.inward_rate),
        sellingRate: parseFloat(txn.selling_rate)
      }
    }));

    res.json(data);
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export default router;
