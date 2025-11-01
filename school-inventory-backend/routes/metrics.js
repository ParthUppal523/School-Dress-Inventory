import express from "express";
import db from "../db.js";

const router = express.Router();

// Profit metrics API
router.get("/", async (req, res) => {
  try {
    // --- Profit Potential ---
    const [inventory] = await db.query(`
      SELECT 
        SUM(quantity * selling_rate) AS totalOutward,
        SUM(quantity * inward_rate) AS totalInward
      FROM inventory
    `);

    const profitPotential = (inventory[0].totalOutward || 0) - (inventory[0].totalInward || 0);

    // --- Profit Earned ---
    const [transactions] = await db.query(`
      SELECT 
        SUM((quantity * selling_rate) - (quantity * inward_rate)) AS grossProfit,
        SUM(total_discount) AS totalDiscount
      FROM transactions
      WHERE type = 'outward'
    `);

    const grossProfit = transactions[0].grossProfit || 0;
    const discount = transactions[0].totalDiscount || 0;
    const profitEarned = grossProfit - discount;

    res.json({
      success: true,
      profitPotential,
      profitEarned
    });
  } catch (err) {
    console.error("Error calculating metrics:", err);
    res.status(500).json({ success: false, message: "Server error calculating metrics" });
  }
});

export default router;
