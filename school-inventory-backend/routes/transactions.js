// routes/transactions.js
import express from 'express';
import db from '../db.js';

const router = express.Router();

/**
 * GET /api/transactions
 * Returns all transactions (history)
 */
router.get('/', (req, res) => {
  const query = `
    SELECT t.id, t.inventory_id, t.type AS txnType, t.quantity, t.rate, t.total_value, t.discount, t.net_total,
           t.remark, t.barcode, t.date,
           i.type AS itemType, i.color, i.size, i.inward_rate, i.selling_rate
    FROM transactions t
    LEFT JOIN inventory i ON t.inventory_id = i.id
    ORDER BY t.date DESC
  `;

  db.query(query, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const data = results.map(txn => ({
        id: txn.id,
        inventoryId: txn.inventory_id,
        type: txn.txnType,
        quantity: parseInt(txn.quantity),                    // ✅ Add this
        rate: parseFloat(txn.rate),                          // ✅ Add this
        total: parseFloat(txn.total_value || txn.quantity * txn.rate),  // ✅ Add this
        discount: parseFloat(txn.discount || 0),             // ✅ Add this
        netTotal: parseFloat(txn.net_total || ((txn.total_value || txn.quantity * txn.rate) - (txn.discount || 0))),  // ✅ Add this
        remark: txn.remark || '',
        barcode: txn.barcode,
        date: txn.date ? txn.date.toISOString() : new Date().toISOString(),
        item: {
            type: txn.itemType,
            color: txn.color,
            size: txn.size,
            inwardRate: parseFloat(txn.inward_rate),       // ✅ Fixed
            sellingRate: parseFloat(txn.selling_rate)      // ✅ Fixed
        }
    }));


    res.json(data);
  });
});

export default router;
