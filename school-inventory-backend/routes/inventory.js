// routes/inventory.js
import express from 'express';
import db from '../db.js';

const router = express.Router();

/**
 * GET /api/inventory
 * Returns all inventory items with quantity > 0
 */
router.get('/', (req, res) => {
  db.query('SELECT * FROM inventory WHERE quantity > 0', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    const data = results.map(item => ({
        id: item.id,
        type: item.type,
        color: item.color,
        size: item.size,
        quantity: parseInt(item.quantity),           // ✅ Parse as integer
        inwardRate: parseFloat(item.inward_rate),    // ✅ Parse as float
        sellingRate: parseFloat(item.selling_rate),  // ✅ Parse as float
        barcode: item.barcode
    }));

    res.json(data);
  });
});

/**
 * POST /api/inventory/inward
 * Add stock (inward) or insert new item
 * body: { type, color, size, quantity, inwardRate, sellingRate }
 */
router.post('/inward', (req, res) => {
  const { type, color, size, quantity, inwardRate, sellingRate } = req.body;

  if (!type || !color || !size || !quantity || !inwardRate)
    return res.status(400).json({ error: 'Missing required fields' });

  // Only filter by type, color, size (not rate)
  const checkQuery = 'SELECT * FROM inventory WHERE type=? AND color=? AND size=?';
  db.query(checkQuery, [type, color, size], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });

    // Check for an *exact match* with rates
    const match = results.find(
      item =>
        Math.abs(item.inward_rate - inwardRate) < 0.01 &&
        Math.abs(item.selling_rate - sellingRate) < 0.01
    );

    if (match) {
      // Update *this exact* rate for this item
      const newQty = match.quantity + quantity;
      const updateQuery = 'UPDATE inventory SET quantity=?, last_updated=NOW() WHERE id=?';
      db.query(updateQuery, [newQty, match.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        // Record transaction
        const txnQuery = 'INSERT INTO transactions (inventory_id, type, quantity, rate, barcode) VALUES (?,?,?,?,?)';
        db.query(txnQuery, [match.id, 'inward', quantity, inwardRate, match.barcode], (err, txnRes) => {
          if (err) return res.status(500).json({ error: err.message });

          // Return updated inventory
          db.query('SELECT * FROM inventory WHERE quantity > 0', (err, updatedResults) => {
            if (err) return res.status(500).json({ error: err.message });

            const data = updatedResults.map(i => ({
              id: i.id,
              type: i.type,
              color: i.color,
              size: i.size,
              quantity: parseInt(i.quantity),
              inwardRate: parseFloat(i.inward_rate),
              sellingRate: parseFloat(i.selling_rate),
              barcode: i.barcode
            }));

            res.json({ success: true, message: 'Stock updated', inventory: data, transactionId: txnRes.insertId });
          });
        });
      });
    } else {
      // Insert NEW item for different rate (new barcode)
      const id = 'INV' + Date.now();
      const barcode = type[0] + Date.now(); // simple unique barcode
      const insertQuery = 'INSERT INTO inventory (id, type, color, size, quantity, inward_rate, selling_rate, barcode) VALUES (?,?,?,?,?,?,?,?)';
      db.query(insertQuery, [id, type, color, size, quantity, inwardRate, sellingRate, barcode], (err) => {
        if (err) return res.status(500).json({ error: err.message });

        // Record transaction
        const txnQuery = 'INSERT INTO transactions (inventory_id, type, quantity, rate, barcode) VALUES (?,?,?,?,?)';
        db.query(txnQuery, [id, 'inward', quantity, inwardRate, barcode], (err, txnRes) => {
          if (err) return res.status(500).json({ error: err.message });

          // Return updated inventory
          db.query('SELECT * FROM inventory WHERE quantity > 0', (err, updatedResults) => {
            if (err) return res.status(500).json({ error: err.message });

            const data = updatedResults.map(i => ({
              id: i.id,
              type: i.type,
              color: i.color,
              size: i.size,
              quantity: parseInt(i.quantity),
              inwardRate: parseFloat(i.inward_rate),
              sellingRate: parseFloat(i.selling_rate),
              barcode: i.barcode
            }));

            res.json({ success: true, message: 'New stock added', inventory: data, transactionId: txnRes.insertId });
          });
        });
      });
    }
  });
});


/**
 * POST /api/inventory/outward
 * Process outward transaction (sale)
 * body: { type, color, size, quantity, sellingRate, discount, remark }
 */
router.post('/outward', (req, res) => {
  const { type, color, size, quantity, sellingRate, discount = 0, remark = '' } = req.body;

  if (!type || !color || !size || !quantity || !sellingRate)
    return res.status(400).json({ error: 'Missing required fields' });

  // Find ALL matching inventory items (batches) for type/color/size, sort by oldest first (lowest inward_rate, then oldest added)
  const query = 'SELECT * FROM inventory WHERE type=? AND color=? AND size=? AND quantity > 0 ORDER BY inward_rate ASC, last_updated ASC';
  db.query(query, [type, color, size], async (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (results.length === 0) return res.status(404).json({ error: 'Item not found' });

    // Calculate if we have enough total quantity
    const totalAvailable = results.reduce((sum, item) => sum + item.quantity, 0);
    if (quantity > totalAvailable)
      return res.status(400).json({ error: `Insufficient stock: ${totalAvailable}` });

    let qtyToDispatch = quantity;

    // Reduce inventory FIFO style and log transactions with profit per batch
    for (const item of results) {
      if (qtyToDispatch <= 0) break;
      const dispatchQty = Math.min(qtyToDispatch, item.quantity);

      // Decrement this batch's inventory
      const newQty = item.quantity - dispatchQty;
      await new Promise((resolve, reject) => {
        db.query('UPDATE inventory SET quantity=?, last_updated=NOW() WHERE id=?', [newQty, item.id], (err) => {
          if (err) reject(err); else resolve();
        });
      });

      // Calculate profit for this batch
      const profit = (sellingRate - item.inward_rate) * dispatchQty;

      // Log each batch used in the transaction history with profit
      await new Promise((resolve, reject) => {
        const txnQuery = 'INSERT INTO transactions (inventory_id, type, quantity, rate, discount, remark, barcode, profit, date) VALUES (?,?,?,?,?,?,?,?,NOW())';
        db.query(txnQuery, [item.id, 'outward', dispatchQty, sellingRate, discount, remark, item.barcode, profit], (err) => {
          if (err) reject(err); else resolve();
        });
      });

      qtyToDispatch -= dispatchQty;
    }

    // For inward transactions, no profit is stored (existing logic should handle that separately)

    // Return updated inventory
    db.query('SELECT * FROM inventory WHERE quantity > 0', (err, updatedResults) => {
      if (err) return res.status(500).json({ error: err.message });

      const data = updatedResults.map(i => ({
        id: i.id,
        type: i.type,
        color: i.color,
        size: i.size,
        quantity: parseInt(i.quantity),
        inwardRate: parseFloat(i.inward_rate),
        sellingRate: parseFloat(i.selling_rate),
        barcode: i.barcode
      }));

      res.json({
        success: true,
        message: 'Sale processed by FIFO',
        inventory: data
      });
    });
  });
});



// PUT /api/inventory/:id - Update inventory item
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { quantity, inwardRate, sellingRate } = req.body;

    if (quantity === undefined || !inwardRate || !sellingRate) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const query = 'UPDATE inventory SET quantity = ?, inward_rate = ?, selling_rate = ? WHERE id = ?';
    
    db.query(query, [quantity, inwardRate, sellingRate, id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Item not found' });
        }

        res.json({ success: true, message: 'Item updated successfully' });
    });
});

export default router;
