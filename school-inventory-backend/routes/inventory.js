// routes/inventory.js
import express from 'express';
import db from '../db.js';

const router = express.Router();

/**
 * GET /api/inventory
 * Returns all inventory items with quantity > 0
 */
router.get('/', async (req, res) => {
  try {
    const [results] = await db.query('SELECT * FROM inventory WHERE quantity > 0');

    const data = results.map(item => ({
      id: item.id,
      type: item.type,
      color: item.color,
      size: item.size,
      quantity: parseInt(item.quantity),
      inwardRate: parseFloat(item.inward_rate),
      sellingRate: parseFloat(item.selling_rate),
      barcode: item.barcode
    }));

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/inventory/inward
 */
router.post('/inward', async (req, res) => {
  const { type, color, size, quantity, inwardRate, sellingRate } = req.body;
  if (!type || !color || !size || !quantity || !inwardRate)
    return res.status(400).json({ error: 'Missing required fields' });

  try {
    const [results] = await db.query('SELECT * FROM inventory WHERE type=? AND color=? AND size=?', [type, color, size]);

    const match = results.find(
      item =>
        Math.abs(item.inward_rate - inwardRate) < 0.01 &&
        Math.abs(item.selling_rate - sellingRate) < 0.01
    );

    if (match) {
      const newQty = match.quantity + quantity;
      await db.query('UPDATE inventory SET quantity=?, last_updated=NOW() WHERE id=?', [newQty, match.id]);

      const [txnRes] = await db.query(
        'INSERT INTO transactions (inventory_id, type, quantity, rate, barcode) VALUES (?,?,?,?,?)',
        [match.id, 'inward', quantity, inwardRate, match.barcode]
      );

      const [updatedResults] = await db.query('SELECT * FROM inventory WHERE quantity > 0');
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
    } else {
      const id = 'INV' + Date.now();
      const barcode = type[0] + Date.now();
      await db.query(
        'INSERT INTO inventory (id, type, color, size, quantity, inward_rate, selling_rate, barcode) VALUES (?,?,?,?,?,?,?,?)',
        [id, type, color, size, quantity, inwardRate, sellingRate, barcode]
      );

      const [txnRes] = await db.query(
        'INSERT INTO transactions (inventory_id, type, quantity, rate, barcode) VALUES (?,?,?,?,?)',
        [id, 'inward', quantity, inwardRate, barcode]
      );

      const [updatedResults] = await db.query('SELECT * FROM inventory WHERE quantity > 0');
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
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * POST /api/inventory/outward
 */
router.post('/outward', async (req, res) => {
  const { type, color, size, quantity, sellingRate, discount = 0, remark = '' } = req.body;
  if (!type || !color || !size || !quantity || !sellingRate)
    return res.status(400).json({ error: 'Missing required fields' });

  try {
    const [results] = await db.query(
      'SELECT * FROM inventory WHERE type=? AND color=? AND size=? AND quantity > 0 ORDER BY inward_rate ASC, last_updated ASC',
      [type, color, size]
    );

    if (results.length === 0) return res.status(404).json({ error: 'Item not found' });

    const totalAvailable = results.reduce((sum, item) => sum + item.quantity, 0);
    if (quantity > totalAvailable)
      return res.status(400).json({ error: `Insufficient stock: ${totalAvailable}` });

    let qtyToDispatch = quantity;

    for (const item of results) {
      if (qtyToDispatch <= 0) break;
      const dispatchQty = Math.min(qtyToDispatch, item.quantity);

      const newQty = item.quantity - dispatchQty;
      await db.query('UPDATE inventory SET quantity=?, last_updated=NOW() WHERE id=?', [newQty, item.id]);

      const profit = (sellingRate - item.inward_rate) * dispatchQty;

      await db.query(
        'INSERT INTO transactions (inventory_id, type, quantity, rate, discount, remark, barcode, profit, date) VALUES (?,?,?,?,?,?,?,?,NOW())',
        [item.id, 'outward', dispatchQty, sellingRate, discount, remark, item.barcode, profit]
      );

      qtyToDispatch -= dispatchQty;
    }

    const [updatedResults] = await db.query('SELECT * FROM inventory WHERE quantity > 0');
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

    res.json({ success: true, message: 'Sale processed by FIFO', inventory: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/**
 * PUT /api/inventory/:id
 */
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { quantity, inwardRate, sellingRate } = req.body;
  if (quantity === undefined || !inwardRate || !sellingRate)
    return res.status(400).json({ error: 'Missing required fields' });

  try {
    const [result] = await db.query(
      'UPDATE inventory SET quantity = ?, inward_rate = ?, selling_rate = ? WHERE id = ?',
      [quantity, inwardRate, sellingRate, id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Item not found' });

    res.json({ success: true, message: 'Item updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
