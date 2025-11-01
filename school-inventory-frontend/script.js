// School Dress Inventory Management System v2.0
// Enhanced with persistent storage, unique barcodes, and comprehensive metrics

// Application state
// Check authentication
function checkAuth() {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    
    if (!token) {
        window.location.href = 'login.html';
        return false;
    }
    
    return true;
}

// Run auth check on page load
if (!checkAuth()) {
    // Will redirect to login
}
// -------------------------------------------------------------



let currentView = 'dashboard';
let currentInputMethod = 'manual';
let inventory = [];
let transactions = [];
let videoStream = null;
let recognition = null;
let editingRow = null;

// =======================
// 🧠 Backend Integration
// =======================

// 1. Fetch all inventory data from backend
async function loadInventory() {
    try {
        const res = await fetch('https://school-dress-inventory-production.up.railway.app/api/inventory');
        if (!res.ok) throw new Error('Failed to fetch inventory');
        
        const data = await res.json();
        console.log('✅ Inventory loaded from backend:', data);
        
        // ✅ CRITICAL: Update global inventory variable
        window.inventory = data;
        inventory = data;  // Also update if declared with 'let' at top level
        
        // Verify data has rates
        if (data.length > 0) {
            console.log('Sample item rates:', {
                inwardRate: data[0].inwardRate,
                sellingRate: data[0].sellingRate
            });
        }
        
        // Update UI
        updateInventoryList();
        updateDashboardMetrics();
        updateStockChart();

        updateOutwardOptions();
        setupOutwardFormListeners();


        
    } catch (err) {
        console.error('❌ Error loading inventory:', err);
        showMessage('Could not load inventory from server', 'error');
    }
}




// 2. Fetch all transaction data from backend
async function loadTransactions() {
    try {
        console.log('🔄 Loading transactions from backend...');
        
        const res = await fetch('https://school-dress-inventory-production.up.railway.app/api/transactions');
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: Failed to fetch transactions`);
        }
        
        const data = await res.json();
        console.log('✅ Transactions loaded from backend:', data);
        
        // ✅ Update global transactions variable
        window.transactions = data;
        transactions = data;
        
        // Update history display
        displayHistory();
        
        console.log('✅ Transactions loaded successfully:', transactions.length, 'transactions');
        
    } catch (err) {
        console.error('❌ Error loading transactions:', err);
        showMessage('Could not load transaction history from server', 'error');
    }
}

async function loadMetrics() {
  try {
    const response = await fetch('https://school-dress-inventory-production.up.railway.app/api/metrics');
    const data = await response.json();
    
    if (data.success) {
      document.getElementById('profitPotential').innerText = `₹${data.profitPotential.toFixed(2)}`;
      document.getElementById('profitEarned').innerText = `₹${data.profitEarned.toFixed(2)}`;
    } else {
      console.error("❌ Failed to load metrics:", data.message);
    }
  } catch (err) {
    console.error("⚠️ Error loading metrics:", err);
  }
}

// Function to handle what happens after successful login
async function handleLoginSuccess() {
  console.log("✅ Login successful — loading dashboard...");

  // Optionally show a quick loader message
  const messageBox = document.getElementById("messageBox");
  if (messageBox) {
    messageBox.innerText = "Loading your data...";
    messageBox.style.display = "block";
  }

  // Small delay to render dashboard UI first
  setTimeout(async () => {
    try {
      console.log("🔄 Fetching inventory and transactions...");
      await Promise.all([loadInventory(), loadTransactions()]);
      console.log("✅ All data loaded");
      if (messageBox) messageBox.style.display = "none";
    } catch (err) {
      console.error("❌ Error loading data after login:", err);
    }
  }, 500); // half-second delay before heavy loading
}


async function populateDropdowns() {
  try {
    const res = await fetch('https://school-dress-inventory-production.up.railway.app/api/inventory');
    const inventory = await res.json();

    const typeSelect = document.getElementById('dressType');
    const colorSelect = document.getElementById('dressColor');
    const sizeSelect = document.getElementById('dressSize');

    // 1️⃣ Fill dress type dropdown
    const types = [...new Set(inventory.map(item => item.type))];
    typeSelect.innerHTML = '<option value="">Select Type</option>' + 
      types.map(t => `<option value="${t}">${t}</option>`).join('');

    // 2️⃣ When type changes, populate color dropdown
    typeSelect.addEventListener('change', () => {
      const selectedType = typeSelect.value;
      const filteredColors = [...new Set(
        inventory.filter(item => item.type === selectedType).map(item => item.color)
      )];
      colorSelect.innerHTML = '<option value="">Select Color</option>' +
        filteredColors.map(c => `<option value="${c}">${c}</option>`).join('');
      sizeSelect.innerHTML = '<option value="">Select Size</option>'; // reset size
    });

    // 3️⃣ When color changes, populate size dropdown
    colorSelect.addEventListener('change', () => {
      const selectedType = typeSelect.value;
      const selectedColor = colorSelect.value;
      const filteredSizes = [...new Set(
        inventory.filter(item => item.type === selectedType && item.color === selectedColor).map(item => item.size)
      )];
      sizeSelect.innerHTML = '<option value="">Select Size</option>' +
        filteredSizes.map(s => `<option value="${s}">${s}</option>`).join('');
    });

  } catch (err) {
    console.error('Error populating dropdowns:', err);
  }
}

// ===========================================================

// Billing multipliers for set pricing
const billingMultipliers = {
    '26-32 Set': 4,
    '34-38 Set': 3,
    '40-42 Set': 2,
    'Free Size': 1,
    '24': 1,
    '26': 1,
    '32': 1,
    '38': 1
};

// Rate prediction factors
const baseMargins = {
    'Plain': 1.15,  // 15% margin
    'Dora': 1.18,   // 18% margin  
    'Zipper': 1.12  // 12% margin
};

const seasonalFactor = 1.02; // 2% seasonal adjustment
const highDemandItems = ['Plain Navy Blue', 'Plain White', 'Dora Navy Blue+White'];
const demandFactor = 1.05; // 5% for high demand items

// Barcode mapping configuration
const barcodeMapping = {
    Plain: {
        'Navy Blue': 'P01', 'Mehroon': 'P02', 'Coffee': 'P03', 'Bottle Green': 'P04',
        'Black': 'P05', 'Mixture Grey': 'P06', 'Sky Blue': 'P07', 'White': 'P08', 'Red': 'P09'
    },
    Dora: {
        'Navy Blue+White': 'D01', 'Navy Blue+Sky': 'D02', 'Red+White': 'D03', 'Red+Yellow': 'D04',
        'Mehroon+White': 'D05', 'Mehroon+Yellow': 'D06', 'Bottle Green+White': 'D07', 'Bottle Green+Yellow': 'D08',
        'Mixture Grey+White': 'D09', 'Black+White': 'D10', 'Sky Blue+White': 'D11', 'Coffee+White': 'D12', 'Coffee+Camel': 'D13'
    },
    Zipper: {
        'Mehroon': 'Z01', 'Navy Blue': 'Z02', 'Red': 'Z03', 'Bottle Green': 'Z04',
        'Mixture Grey': 'Z05', 'Black': 'Z06', 'Sky Blue': 'Z07', 'Coffee': 'Z08'
    }
};

const sizeCodes = {
    '24': 'S01', '26': 'S02', '26-32 Set': 'S03', '32': 'S04',
    '34-38 Set': 'S05', '38': 'S06', '40-42 Set': 'S07', 'Free Size': 'S08'
};

// Dress types configuration with working data
const dressTypes = {
    Plain: {
        colors: ['Navy Blue', 'Mehroon', 'Coffee', 'Bottle Green', 'Black', 'Mixture Grey', 'Sky Blue', 'White', 'Red'],
        sizes: ['24', '26', '26-32 Set', '32', '34-38 Set', '38', '40-42 Set']
    },
    Dora: {
        colors: ['Navy Blue+White', 'Navy Blue+Sky', 'Red+White', 'Red+Yellow', 'Mehroon+White', 'Mehroon+Yellow', 'Bottle Green+White', 'Bottle Green+Yellow', 'Mixture Grey+White', 'Black+White', 'Sky Blue+White', 'Coffee+White', 'Coffee+Camel'],
        sizes: ['24', '26', '26-32 Set', '32', '34-38 Set', '38', '40-42 Set']
    },
    Zipper: {
        colors: ['Mehroon', 'Navy Blue', 'Red', 'Bottle Green', 'Mixture Grey', 'Black', 'Sky Blue', 'Coffee'],
        sizes: ['Free Size']
    }
};

// Dress configuration
const dressConfig = {
    Plain: {
        colors: ['Navy Blue', 'Mehroon', 'Coffee', 'Bottle Green', 'Black', 'Mixture Grey', 'Sky Blue', 'White', 'Red'],
        sizes: ['24', '26', '26-32 Set', '32', '34-38 Set', '38', '40-42 Set']
    },
    Dora: {
        colors: ['Navy Blue+White', 'Navy Blue+Sky', 'Red+White', 'Red+Yellow', 'Mehroon+White', 'Mehroon+Yellow', 'Bottle Green+White', 'Bottle Green+Yellow', 'Mixture Grey+White', 'Black+White', 'Sky Blue+White', 'Coffee+White', 'Coffee+Camel'],
        sizes: ['24', '26', '26-32 Set', '32', '34-38 Set', '38', '40-42 Set']
    },
    Zipper: {
        colors: ['Mehroon', 'Navy Blue', 'Red', 'Bottle Green', 'Mixture Grey', 'Black', 'Sky Blue', 'Coffee'],
        sizes: ['Free Size']
    }
};

const setMultipliers = {
    '26-32 Set': 4,
    '34-38 Set': 3,
    '40-42 Set': 2
};

// Store last sale data for invoice generation
let lastSaleData = null;

// Enhanced persistent data storage with in-memory persistence
// function saveData() {
//     try {
//         const data = {
//             inventory: inventory,
//             transactions: transactions,
//             lastSaved: new Date().toISOString(),
//             metadata: {
//                 totalItems: inventory.reduce((sum, item) => sum + item.quantity, 0),
//                 totalValue: inventory.reduce((sum, item) => sum + (item.quantity * item.sellingRate), 0),
//                 lastBackup: new Date().toISOString()
//             }
//         };
        
//         // Use in-memory storage for sandboxed environments
//         window.inventoryAppData = data;
        
//         // Also create a backup in global scope for additional persistence
//         window.inventoryBackup = JSON.parse(JSON.stringify(data));
        
//         console.log('💾 Data saved to session memory successfully');
//     } catch (error) {
//         console.error('❌ Failed to save data:', error);
//     }
// }

// function loadData() {
//     try {
//         // Check for existing session data
//         let data = null;
        
//         // Primary: Check main session storage
//         if (window.inventoryAppData) {
//             data = window.inventoryAppData;
//         }
        
//         // Fallback: Check backup storage
//         if (!data && window.inventoryBackup) {
//             data = window.inventoryBackup;
//             console.log('📂 Using backup data');
//         }
        
//         if (data) {
//             inventory = data.inventory || [];
//             transactions = data.transactions || [];
//             console.log('✅ Data loaded successfully:', inventory.length + ' items, ' + transactions.length + ' transactions');
            
//             // Validate data integrity
//             let validItems = 0;
//             inventory.forEach(item => {
//                 if (item.type && item.color && item.size && item.quantity >= 0) {
//                     validItems++;
//                 }
//             });
            
//             console.log(`🔍 Data validation: ${validItems}/${inventory.length} items valid`);
//             return true;
//         }
//     } catch (error) {
//         console.error('❌ Failed to load data:', error);
//     }
//     return false;
// }

// Initialize sample data with proper rate handling
// function initializeData() {
//     // Try to load saved data first
//     if (!loadData()) {
//         // Initialize with sample data if no saved data
//         inventory = [
//         { 
//             id: 'INV001',
//             type: 'Plain', 
//             color: 'Navy Blue', 
//             size: '32', 
//             quantity: 45, 
//             inwardRate: 250.00, 
//             sellingRate: 287.50, 
//             barcode: 'P01S04', 
//             lastUpdated: new Date().toISOString(),
//             totalValue: 45 * 250.00
//         },
//         { 
//             id: 'INV002',
//             type: 'Plain', 
//             color: 'White', 
//             size: '26-32 Set', 
//             quantity: 18, 
//             inwardRate: 800.00, 
//             sellingRate: 920.00, 
//             barcode: 'P08S03', 
//             lastUpdated: new Date().toISOString(),
//             totalValue: 18 * 800.00
//         },
//         { 
//             id: 'INV003',
//             type: 'Dora', 
//             color: 'Navy Blue+White', 
//             size: '34-38 Set', 
//             quantity: 12, 
//             inwardRate: 900.00, 
//             sellingRate: 1062.00, 
//             barcode: 'D01S05', 
//             lastUpdated: new Date().toISOString(),
//             totalValue: 12 * 900.00
//         },
//         { 
//             id: 'INV004',
//             type: 'Zipper', 
//             color: 'Navy Blue', 
//             size: 'Free Size', 
//             quantity: 25, 
//             inwardRate: 450.00, 
//             sellingRate: 504.00, 
//             barcode: 'Z02S08', 
//             lastUpdated: new Date().toISOString(),
//             totalValue: 25 * 450.00
//         },
//         { 
//             id: 'INV005',
//             type: 'Plain', 
//             color: 'Red', 
//             size: '24', 
//             quantity: 30, 
//             inwardRate: 230.00, 
//             sellingRate: 264.50, 
//             barcode: 'P09S01', 
//             lastUpdated: new Date().toISOString(),
//             totalValue: 30 * 230.00
//         }
//         ];
        
//         transactions = [
//             {
//                 id: 'TXN001',
//                 type: 'inward',
//                 item: 'Plain Navy Blue 32',
//                 quantity: 50,
//                 rate: 250.00,
//                 total: 12500.00,
//                 date: new Date().toISOString()
//             },
//             {
//                 id: 'TXN002',
//                 type: 'outward',
//                 item: 'Plain Navy Blue 32',
//                 quantity: 5,
//                 rate: 287.50,
//                 total: 1437.50,
//                 date: new Date().toISOString()
//             }
//         ];
//     }
    
//     // Update all dashboard components
//     updateDashboardMetrics();
//     updateInventoryList();
//     updateStockChart();
//     updateStockView();
//     displayHistory();
//     updateOutwardOptions();
// }

// Navigation functions
function showView(viewName) {
    // Hide all views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    // Show selected view
    document.getElementById(viewName + 'View').classList.add('active');
    
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(viewName + 'Btn').classList.add('active');
    
    currentView = viewName;
    
    // Update view-specific content
    if (viewName === 'dashboard') {
        updateDashboard();
        // Ensure chart is properly rendered after view change
        setTimeout(() => {
            updateStockChart();
        }, 100);
    } else if (viewName === 'history') {
        displayHistory();
    }
}

// Input method functions
function setInputMethod(method, operation = 'inward') {
    currentInputMethod = method;
    
    // Update buttons
    const prefix = operation === 'outward' ? 'outward' : '';
    document.querySelectorAll(`.method-btn`).forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (operation === 'outward') {
        document.getElementById(`outward${method.charAt(0).toUpperCase() + method.slice(1)}Btn`).classList.add('active');
    } else {
        document.getElementById(`${method}Btn`).classList.add('active');
    }
    
    // Show/hide input sections
    const sections = operation === 'outward' ? 
        ['outwardManualInput'] :
        ['manualInput', 'scannerInput', 'audioInput'];
        
    sections.forEach(section => {
        document.getElementById(section).classList.remove('active');
    });
    
    if (operation === 'outward') {
        document.getElementById('outwardManualInput').classList.add('active');
    } else {
        document.getElementById(method + 'Input').classList.add('active');
    }
    
    // Stop any active scanner or audio
    stopScanner();
    stopListening();
}

// Form update functions
function updateColorOptions() {
    const typeSelect = document.getElementById('dressType');
    const colorSelect = document.getElementById('dressColor');
    const sizeSelect = document.getElementById('dressSize');
    
    const selectedType = typeSelect.value;
    
    // Clear color and size options
    colorSelect.innerHTML = '<option value="">Select Color</option>';
    sizeSelect.innerHTML = '<option value="">Select Size</option>';
    
    if (selectedType && dressTypes[selectedType]) {
        dressTypes[selectedType].colors.forEach(color => {
            const option = document.createElement('option');
            option.value = color;
            option.textContent = color;
            colorSelect.appendChild(option);
        });
    }
}

function updateSizeOptions() {
    const typeSelect = document.getElementById('dressType');
    const sizeSelect = document.getElementById('dressSize');
    
    const selectedType = typeSelect.value;
    
    // Clear size options
    sizeSelect.innerHTML = '<option value="">Select Size</option>';
    
    if (selectedType && dressTypes[selectedType]) {
        dressTypes[selectedType].sizes.forEach(size => {
            const option = document.createElement('option');
            option.value = size;
            option.textContent = size;
            sizeSelect.appendChild(option);
        });
    }
    
    // Check for existing item when size changes
    setTimeout(() => {
        const type = document.getElementById('dressType').value;
        const color = document.getElementById('dressColor').value;
        const size = document.getElementById('dressSize').value;
        
        if (type && color && size) {
            checkExistingItem();
        }
    }, 100);
}

function checkExistingItem() {
    const type = document.getElementById('dressType').value;
    const color = document.getElementById('dressColor').value;
    const size = document.getElementById('dressSize').value;
    const sellingRateInput = document.getElementById('sellingRate');
    const marginInfo = document.getElementById('marginInfo');
    
    if (type && color && size) {
        const existingItem = inventory.find(item => 
            item.type === type && item.color === color && item.size === size
        );
        
        if (existingItem && (!sellingRateInput.value || sellingRateInput.value == 0)) {
            sellingRateInput.value = existingItem.sellingRate.toFixed(2);
            sellingRateInput.placeholder = `Current rate: ₹${existingItem.sellingRate.toFixed(2)}`;
            
            marginInfo.innerHTML = `
                <strong>Existing Item Detected:</strong><br>
                Using current selling rate: ₹${existingItem.sellingRate.toFixed(2)}<br>
                <small>Current stock: ${existingItem.quantity} units | You can modify this rate if needed</small>
            `;
            marginInfo.style.display = 'block';
            marginInfo.className = 'margin-info profit-high';
        }
    }
}

// Generate barcode for inventory items
function generateBarcode(type, color, size, inwardRate) {
    if (!barcodeMapping[type] || !barcodeMapping[type][color] || !sizeCodes[size]) {
        return null;
    }
    
    const colorCode = barcodeMapping[type][color];
    const sizeCode = sizeCodes[size];
    
    return `${colorCode}${sizeCode}`;
}

// Setup outward form listeners
function setupOutwardForm() {
    document.getElementById('outwardDressType').addEventListener('change', function() {
        // updateOutwardColors();
        // updateOutwardSizes();
        checkOutwardSellingRate();
    });

    document.getElementById('outwardDressColor').addEventListener('change', function() {
        // updateOutwardSizes();
        checkOutwardSellingRate();
    });

    document.getElementById('outwardDressSize').addEventListener('change', function() {
        checkOutwardSellingRate();
    });
}

function setupOutwardFormListeners() {
    const typeSelect = document.getElementById('outwardDressType');
    const colorSelect = document.getElementById('outwardDressColor');
    const sizeSelect = document.getElementById('outwardDressSize');

    if (typeSelect) {
        typeSelect.addEventListener('change', function() {
            const selectedType = this.value;
            
            // Populate colors based on selected type
            const colors = [...new Set(
                inventory
                    .filter(item => item.type === selectedType)
                    .map(item => item.color)
            )];
            
            colorSelect.innerHTML = '<option value="">Select Color</option>';
            colors.forEach(color => {
                const opt = document.createElement('option');
                opt.value = color;
                opt.textContent = color;
                colorSelect.appendChild(opt);
            });
            
            sizeSelect.innerHTML = '<option value="">Select Size</option>';
            document.getElementById('outwardSellingRate').value = '';
        });
    }

    if (colorSelect) {
        colorSelect.addEventListener('change', function() {
            const selectedType = typeSelect.value;
            const selectedColor = this.value;
            
            // Populate sizes based on selected type and color
            const sizes = [...new Set(
                inventory
                    .filter(item => item.type === selectedType && item.color === selectedColor)
                    .map(item => item.size)
            )];
            
            sizeSelect.innerHTML = '<option value="">Select Size</option>';
            sizes.forEach(size => {
                const opt = document.createElement('option');
                opt.value = size;
                opt.textContent = size;
                sizeSelect.appendChild(opt);
            });
            
            document.getElementById('outwardSellingRate').value = '';
        });
    }

    if (sizeSelect) {
        sizeSelect.addEventListener('change', function() {
            checkOutwardSellingRate();
        });
    }
}


// function updateOutwardColors() {
//     const typeSelect = document.getElementById('outwardDressType');
//     const colorSelect = document.getElementById('outwardDressColor');
    
//     colorSelect.innerHTML = '<option value="">Select Color</option>';
    
//     if (typeSelect.value && dressTypes[typeSelect.value]) {
//         const colors = dressTypes[typeSelect.value].colors;
//         colors.forEach(color => {
//             const option = document.createElement('option');
//             option.value = color;
//             option.textContent = color;
//             colorSelect.appendChild(option);
//         });
//     }
// }

// function updateOutwardSizes() {
//     const typeSelect = document.getElementById('outwardDressType');
//     const sizeSelect = document.getElementById('outwardDressSize');
    
//     sizeSelect.innerHTML = '<option value="">Select Size</option>';
    
//     if (typeSelect.value && dressTypes[typeSelect.value]) {
//         const sizes = dressTypes[typeSelect.value].sizes;
//         sizes.forEach(size => {
//             const option = document.createElement('option');
//             option.value = size;
//             option.textContent = size;
//             sizeSelect.appendChild(option);
//         });
//     }
// }

function checkOutwardSellingRate() {
    const type = document.getElementById('outwardDressType').value;
    const color = document.getElementById('outwardDressColor').value;
    const size = document.getElementById('outwardDressSize').value;
    const sellingRateInput = document.getElementById('outwardSellingRate');
    
    if (type && color && size) {
        // Find matching item in inventory
        const matchingItem = inventory.find(item => 
            item.type === type && 
            item.color === color && 
            item.size === size && 
            item.quantity > 0
        );
        
        if (matchingItem) {
            sellingRateInput.value = matchingItem.sellingRate.toFixed(2);
            sellingRateInput.style.background = '#e8f5f3';
        } else {
            sellingRateInput.value = '';
            sellingRateInput.style.background = '#fff3cd';
        }
    } else {
        sellingRateInput.value = '';
        sellingRateInput.style.background = '';
    }
}

// Invoice modal functions
function showInvoiceModal() {
    if (!lastSaleData) {
        showMessage('❌ No recent sale data available', 'error');
        return;
    }
    document.getElementById('invoiceModal').style.display = 'flex';
}

function closeInvoiceModal() {
    document.getElementById('invoiceModal').style.display = 'none';
}

// PDF generation
function downloadInvoicePDF() {
    const customerName = document.getElementById('invoiceCustomerName').value.trim();
    const customerPhone = document.getElementById('invoiceCustomerPhone').value.trim();
    const customerEmail = document.getElementById('invoiceCustomerEmail').value.trim();
    
    if (!customerName || !customerPhone) {
        showMessage('❌ Please enter customer name and phone number', 'error');
        return;
    }
    
    if (!/^\d{10}$/.test(customerPhone)) {
        showMessage('❌ Please enter valid 10-digit phone number', 'error');
        return;
    }

    // Push latest outward transaction before generating invoice
    if (lastSaleData) {
        transactions.push({
            id: 'TXN' + Date.now(),
            type: 'outward',
            item: lastSaleData.item,
            quantity: lastSaleData.quantity,
            rate: lastSaleData.rate,
            total: lastSaleData.finalTotal,
            date: new Date().toISOString(),
            remark: document.getElementById('invoiceInternalRemark').value || "",
            customerName: customerName,
            customerPhone: customerPhone,
            customerEmail: customerEmail
        });

        // Refresh history after adding transaction
        displayHistory();
    }
    
    generateModernInvoicePDF(customerName, customerPhone, customerEmail);
    closeInvoiceModal();
}

function generateModernInvoicePDF(customerName, customerPhone, customerEmail) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(33, 128, 141);
    doc.rect(0, 0, 210, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text('SCHOOL DRESS INVENTORY', 105, 18, { align: 'center' });
    doc.setFontSize(12);
    doc.text('SALES INVOICE', 105, 28, { align: 'center' });
    
    // Invoice details
    doc.setTextColor(19, 52, 59);
    doc.setFontSize(11);
    const invoiceDate = new Date().toLocaleDateString('en-IN');
    const invoiceTime = new Date().toLocaleTimeString('en-IN');
    
    doc.text(`Invoice No: ${lastSaleData.invoiceNumber}`, 20, 50);
    doc.text(`Date: ${invoiceDate}`, 20, 58);
    doc.text(`Time: ${invoiceTime}`, 20, 66);
    
    // Customer details
    doc.text('BILL TO:', 120, 50);
    doc.setFontSize(12);
    doc.text(customerName, 120, 58);
    doc.setFontSize(10);
    doc.text(`Phone: ${customerPhone}`, 120, 66);
    if (customerEmail) {
        doc.text(`Email: ${customerEmail}`, 120, 74);
    }
    
    // Table
    const tableTop = 85;
    doc.setFillColor(240, 240, 240);
    doc.rect(20, tableTop, 170, 8, 'F');
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text('DESCRIPTION', 25, tableTop + 6);
    doc.text('QTY', 95, tableTop + 6);
    doc.text('RATE', 115, tableTop + 6);
    doc.text('AMOUNT', 155, tableTop + 6);
    
    // Item details
    let yPos = tableTop + 15;
    doc.text(lastSaleData.item, 25, yPos);
    doc.text(lastSaleData.quantity.toString(), 95, yPos);
    doc.text(`₹${lastSaleData.rate.toFixed(2)}`, 115, yPos);
    doc.text(`₹${lastSaleData.subtotal.toFixed(2)}`, 155, yPos);
    
    // Totals
    yPos += 20;
    doc.line(20, yPos, 190, yPos);
    yPos += 10;
    
    doc.text('Subtotal:', 130, yPos);
    doc.text(`₹${lastSaleData.subtotal.toFixed(2)}`, 155, yPos);
    
    if (lastSaleData.discount > 0) {
        yPos += 8;
        doc.text('Discount:', 130, yPos);
        doc.text(`-₹${lastSaleData.discount.toFixed(2)}`, 155, yPos);
    }
    
    yPos += 8;
    doc.setFontSize(12);
    doc.setTextColor(33, 128, 141);
    doc.text('TOTAL:', 130, yPos);
    doc.text(`₹${lastSaleData.finalTotal.toFixed(2)}`, 155, yPos);
    
    // Footer
    yPos += 25;
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(10);
    doc.text('Thank you for your purchase!', 105, yPos, { align: 'center' });
    
    doc.save(`Invoice_${lastSaleData.invoiceNumber}.pdf`);
    showMessage('✅ Invoice PDF downloaded successfully!', 'success');
}

// Decode barcode to item details
function decodeBarcode(barcode) {
    if (!barcode || barcode.length < 6) return null;
    
    const colorCode = barcode.substring(0, 3);
    const sizeCode = barcode.substring(3, 6);
    
    // Find type and color
    let foundType = null, foundColor = null;
    for (const [type, colors] of Object.entries(barcodeMapping)) {
        for (const [color, code] of Object.entries(colors)) {
            if (code === colorCode) {
                foundType = type;
                foundColor = color;
                break;
            }
        }
        if (foundType) break;
    }
    
    // Find size
    let foundSize = null;
    for (const [size, code] of Object.entries(sizeCodes)) {
        if (code === sizeCode) {
            foundSize = size;
            break;
        }
    }
    
    if (foundType && foundColor && foundSize) {
        return { type: foundType, color: foundColor, size: foundSize };
    }
    
    return null;
}

// Enhanced selling rate calculation with smart prediction
function calculateSellingRate() {
    const typeSelect = document.getElementById('dressType');
    const colorSelect = document.getElementById('dressColor');
    const sizeSelect = document.getElementById('dressSize');
    const inwardRateInput = document.getElementById('inwardRate');
    const sellingRateInput = document.getElementById('sellingRate');
    const marginInfo = document.getElementById('marginInfo');
    
    const type = typeSelect.value;
    const color = colorSelect.value;
    const size = sizeSelect.value;
    const inwardRate = parseFloat(inwardRateInput.value);
    
    if (type && inwardRate && inwardRate > 0) {
        // Check if item already exists
        const existingItem = inventory.find(item => 
            item.type === type && item.color === color && item.size === size
        );
        
        if (existingItem && !sellingRateInput.value) {
            // Use existing selling rate for existing items
            sellingRateInput.value = existingItem.sellingRate.toFixed(2);
            sellingRateInput.placeholder = `Current rate: ₹${existingItem.sellingRate.toFixed(2)}`;
            
            marginInfo.innerHTML = `
                <strong>Existing Item Rate:</strong><br>
                Using current selling rate: ₹${existingItem.sellingRate.toFixed(2)}<br>
                <small>You can modify this rate if needed</small>
            `;
            marginInfo.style.display = 'block';
        } else if (!existingItem) {
            // Predict rate for new items
            const predictedRate = predictSellingRate(inwardRate, type, size);
            
            if (!sellingRateInput.value || sellingRateInput.value == 0) {
                sellingRateInput.value = predictedRate;
            }
            
            const currentSellingRate = parseFloat(sellingRateInput.value) || predictedRate;
            const actualMargin = ((currentSellingRate - inwardRate) / currentSellingRate * 100).toFixed(1);
            const profit = (currentSellingRate - inwardRate).toFixed(2);
            
            marginInfo.innerHTML = `
                <strong>Smart Rate Prediction:</strong><br>
                Predicted: ₹${predictedRate} (based on market trends)<br>
                Current: ${actualMargin}% margin | Profit: ₹${profit} per unit
            `;
            marginInfo.style.display = 'block';
        }
        
        // Make selling rate field optional
        sellingRateInput.removeAttribute('required');
        
    } else {
        marginInfo.style.display = 'none';
    }
}

// Smart selling rate prediction function
function predictSellingRate(inwardRate, itemType, size, existingItem = null) {
    if (existingItem) {
        return existingItem.sellingRate;
    }
    
    const baseMargin = baseMargins[itemType] || 1.15;
    const itemKey = `${itemType} ${document.getElementById('dressColor').value || ''}`;
    const isDemandItem = highDemandItems.some(item => itemKey.includes(item.replace('Plain ', '').replace('Dora ', '')));
    
    const finalFactor = baseMargin * seasonalFactor * (isDemandItem ? demandFactor : 1.0);
    
    return Math.round(inwardRate * finalFactor);
}

function clearInwardForm() {
    document.getElementById('dressType').value = '';
    document.getElementById('dressColor').innerHTML = '<option value="">Select Color</option>';
    document.getElementById('dressSize').innerHTML = '<option value="">Select Size</option>';
    document.getElementById('quantity').value = '';
    document.getElementById('inwardRate').value = '';
    
    // Clear any validation errors
    document.querySelectorAll('.validation-error').forEach(el => {
        el.classList.remove('validation-error');
    });
    document.querySelectorAll('.validation-message').forEach(el => {
        el.remove();
    });
    
    // Hide recent additions
    document.getElementById('recentAdditions').style.display = 'none';
    
    // Clear audio result
    const audioResult = document.getElementById('audioResult');
    if (audioResult) {
        audioResult.style.display = 'none';
    }
    
    // Clear scan result
    const scanResult = document.getElementById('scanResult');
    if (scanResult) {
        scanResult.style.display = 'none';
    }
}

function showMessage(message, type) {
    console.log('Showing message:', message, type); // Debug log
    
    // Remove any existing messages first
    const existingMessages = document.querySelectorAll('.message');
    existingMessages.forEach(msg => msg.remove());
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = message;
    
    // Insert at the top of the current view
    const currentView = document.querySelector('.view.active .container');
    if (currentView) {
        currentView.insertBefore(messageDiv, currentView.firstChild);
    }
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.remove();
        }
    }, 5000);
}

// Barcode Scanner functions
function startBarcodeScanner() {
    const video = document.getElementById('video');
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const statusEl = document.getElementById('scannerStatus');
    
    statusEl.textContent = 'Initializing camera...';
    
    // Check if QuaggaJS is available
    if (typeof Quagga === 'undefined') {
        statusEl.textContent = 'Barcode scanner library not loaded';
        showMessage('Barcode scanning library failed to load. Please refresh and try again.', 'error');
        return;
    }
    
    Quagga.init({
        inputStream: {
            name: "Live",
            type: "LiveStream",
            target: video,
            constraints: {
                width: 640,
                height: 480,
                facingMode: "environment"
            }
        },
        decoder: {
            readers: ["code_128_reader", "code_39_reader", "ean_reader", "ean_8_reader"]
        },
        locate: true,
        locator: {
            halfSample: true,
            patchSize: "medium",
            debug: {
                showCanvas: false,
                showPatches: false,
                showFoundPatches: false,
                showSkeleton: false,
                showLabels: false,
                showPatchLabels: false,
                showRemainingPatchLabels: false,
                boxFromPatches: {
                    showTransformed: false,
                    showTransformedBox: false,
                    showBB: false
                }
            }
        }
    }, function(err) {
        if (err) {
            console.error('Quagga initialization failed:', err);
            statusEl.textContent = 'Camera initialization failed';
            showMessage('Camera access failed. Please check permissions and try again.', 'error');
            return;
        }
        
        statusEl.textContent = 'Scanner ready - Position barcode in frame';
        Quagga.start();
        
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-flex';
        
        // Set up barcode detection callback
        Quagga.onDetected(function(result) {
            const code = result.codeResult.code;
            statusEl.textContent = `Detected: ${code}`;
            processScannedBarcode(code);
            
            // Stop scanning after successful detection
            setTimeout(() => {
                stopBarcodeScanner();
            }, 1000);
        });
    });
}

function stopBarcodeScanner() {
    const startBtn = document.getElementById('startScanBtn');
    const stopBtn = document.getElementById('stopScanBtn');
    const statusEl = document.getElementById('scannerStatus');
    
    // Stop QuaggaJS if running
    if (typeof Quagga !== 'undefined') {
        try {
            Quagga.stop();
        } catch (e) {
            console.log('Quagga stop error (expected):', e);
        }
    }
    
    // Stop any video streams
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    const video = document.getElementById('video');
    video.srcObject = null;
    
    startBtn.style.display = 'inline-flex';
    stopBtn.style.display = 'none';
    statusEl.textContent = 'Camera not active';
    
    document.getElementById('scanResult').style.display = 'none';
}

// Enhanced barcode processing with better error handling
function processScannedBarcode(barcode) {
    if (!barcode || barcode.trim().length === 0) {
        showMessage('Invalid barcode detected. Please try again.', 'error');
        return;
    }
    
    const cleanBarcode = barcode.trim().toUpperCase();
    const decodedItem = decodeBarcode(cleanBarcode);
    
    if (!decodedItem) {
        const scanResult = document.getElementById('scanResult');
        scanResult.innerHTML = `
            <div style="color: var(--color-error);">
                <h4>Barcode Not Recognized</h4>
                <p><strong>Scanned Code:</strong> ${cleanBarcode}</p>
                <p>This barcode format is not recognized by our system.</p>
                <p><strong>Expected format:</strong> [Type Code][Color Code][Size Code]</p>
                <p><strong>Example:</strong> P01S04 (Plain Navy Blue size 32)</p>
                <button class="btn btn--outline btn--sm" onclick="createNewItemFromBarcode('${cleanBarcode}')">Create New Item</button>
            </div>
        `;
        scanResult.style.display = 'block';
        return;
    }
    
    const { type, color, size } = decodedItem;
    
    // Check if item exists in inventory
    const existingItem = inventory.find(item => 
        item.type === type && item.color === color && item.size === size
    );
    
    const scanResult = document.getElementById('scanResult');
    scanResult.innerHTML = `
        <div style="color: var(--color-success);">
            <h4>✅ Barcode Successfully Scanned</h4>
            <p><strong>Barcode:</strong> ${cleanBarcode}</p>
            <div class="item-details">
                <p><strong>Item Details:</strong></p>
                <ul>
                    <li><strong>Type:</strong> ${type}</li>
                    <li><strong>Color:</strong> ${color}</li>
                    <li><strong>Size:</strong> ${size}</li>
                </ul>
            </div>
            ${existingItem ? 
                `<div class="stock-info">
                    <p><strong>Current Stock:</strong> ${existingItem.quantity} units</p>
                    <p><strong>Last Rate:</strong> ₹${existingItem.inwardRate.toFixed(2)}</p>
                </div>` : 
                '<p><em>📦 New Item - Not in inventory yet</em></p>'
            }
            <p class="success-msg">✨ Form has been populated automatically!</p>
        </div>
    `;
    scanResult.style.display = 'block';
    
    // Populate form fields
    document.getElementById('dressType').value = type;
    updateColorOptions();
    setTimeout(() => {
        document.getElementById('dressColor').value = color;
        updateSizeOptions();
        setTimeout(() => {
            document.getElementById('dressSize').value = size;
            
            // Auto-fill rate if item exists
            if (existingItem) {
                document.getElementById('inwardRate').value = existingItem.inwardRate.toFixed(2);
                validateRateInput();
            }
            
            // Focus on quantity field
            document.getElementById('quantity').focus();
        }, 100);
    }, 100);
}

// Helper function to create new item from unrecognized barcode
function createNewItemFromBarcode(barcode) {
    const confirmed = confirm(
        `Do you want to create a new item template for barcode: ${barcode}?\n\n` +
        `This will help you manually enter the item details.`
    );
    
    if (confirmed) {
        // Clear scan result and focus on manual form
        document.getElementById('scanResult').style.display = 'none';
        setInputMethod('manual');
        
        // Focus on first form field
        document.getElementById('dressType').focus();
        
        showMessage(`Creating new item for barcode: ${barcode}. Please fill in the details manually.`, 'success');
    }
}

function processManualBarcode() {
    const barcodeInput = document.getElementById('manualBarcode');
    const barcode = barcodeInput.value.trim().toUpperCase();
    
    if (!barcode) {
        alert('Please enter a barcode.');
        return;
    }
    
    processScannedBarcode(barcode);
    barcodeInput.value = '';
}

// Audio input functions
function startListening() {
    const browserSupport = document.getElementById('browserSupport');
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        browserSupport.className = 'browser-support not-supported';
        browserSupport.textContent = '❌ Audio input not supported in this browser';
        showMessage('Sorry, speech recognition is not supported on this device or browser.', 'error');
        return;
    }
    browserSupport.className = 'browser-support supported';
    browserSupport.textContent = '✔ Audio input ready';
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    
    // Improved settings for better recognition
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN'; // Indian English for better recognition
    recognition.maxAlternatives = 3;
    
    const listenBtn = document.getElementById('listenBtn');
    const audioResult = document.getElementById('audioResult');
    const audioFeedback = document.getElementById('audioFeedback');
    
    // Enhanced visual feedback
    listenBtn.innerHTML = '<span class="mic-icon">🎤</span> Listening...';
    listenBtn.classList.add('audio-listening');
    listenBtn.disabled = true;
    audioFeedback.style.display = 'block';
    audioFeedback.className = 'audio-feedback status-listening';
    audioFeedback.innerHTML = `
        <div><strong>🎤 Listening...</strong></div>
        <div>Speak clearly: "Navy Blue 32 Plain 10 pieces inward rate 250 selling rate 300"</div>
        <div id="countdown">Time remaining: <span id="timer">10</span> seconds</div>
    `;
    
    // Add timeout countdown
    let timeLeft = 10;
    const countdownTimer = setInterval(() => {
        timeLeft--;
        const timerEl = document.getElementById('timer');
        if (timerEl) {
            timerEl.textContent = timeLeft;
        }
        if (timeLeft <= 0) {
            clearInterval(countdownTimer);
        }
    }, 1000);
    
    // Enhanced timeout handling
    const recognitionTimeout = setTimeout(() => {
        if (recognition) {
            recognition.stop();
            audioFeedback.className = 'audio-feedback status-processing';
            audioFeedback.innerHTML = '🔄 No speech detected. Click "Start Listening" to try again.';
            clearInterval(countdownTimer);
        }
    }, 10000); // 10 second timeout
  
    recognition.onresult = function(event) {
        clearTimeout(recognitionTimeout);
        clearInterval(countdownTimer);
        
        const transcript = event.results[0][0].transcript.toLowerCase();
        const confidence = event.results[0][0].confidence;
        
        audioFeedback.className = 'audio-feedback status-processing';
        audioFeedback.innerHTML = `
            <div><strong>📝 Processing...</strong></div>
            <div>Heard: "${transcript}"</div>
            <div>Confidence: ${(confidence * 100).toFixed(1)}%</div>
        `;
        
        parseAudioInput(transcript, function(parsed) {
            // Show parsed result with enhanced UI
            let html = `<div class="audio-result-header"><strong>✨ Speech Recognition Result</strong></div>`;
            html += `<div class="parsed-details">`;
            html += `<div>Type: <b>${parsed.type}</b></div>`;
            html += `<div>Color: <b>${parsed.color || 'Not detected'}</b></div>`;
            html += `<div>Size: <b>${parsed.size || 'Not detected'}</b></div>`;
            html += `<div>Quantity: <b>${parsed.quantity || 'Not detected'}</b></div>`;
            html += `<div>Inward Rate: <b>${parsed.rate ? '₹' + parsed.rate : 'Not detected'}</b></div>`;
            
            if (parsed.sellingRate) {
                html += `<div>Selling Rate: <b>₹${parsed.sellingRate}</b></div>`;
            }
            html += `</div>`;
            
            if (parsed.type && parsed.color && parsed.size && parsed.quantity && parsed.rate) {
                html += `<div class="action-buttons">`;
                html += `<button class='btn btn--primary' onclick='confirmAudioStock()'>✓ Confirm & Add to Stock</button>`;
                html += `<button class='btn btn--outline' onclick='startListening()'>🎤 Listen Again</button>`;
                html += `</div>`;
            } else {
                html += `<div class="error-msg">`;
                html += `<p style='color: var(--color-error);'>⚠️ Incomplete information detected</p>`;
                html += `<button class='btn btn--outline' onclick='startListening()'>🔄 Try Again</button>`;
                html += `<button class='btn btn--secondary' onclick='setInputMethod("manual")'>Switch to Manual</button>`;
                html += `</div>`;
            }
            audioResult.innerHTML = html;
            audioResult.style.display = 'block';
        });
    };
  
    recognition.onerror = function(event) {
        clearTimeout(recognitionTimeout);
        clearInterval(countdownTimer);
        
        let errorMsg = 'Recognition error: ' + event.error;
        if (event.error === 'no-speech') {
            errorMsg = '🔇 No speech detected. Please try speaking more clearly.';
        } else if (event.error === 'network') {
            errorMsg = '🌐 Network error. Check your internet connection.';
        } else if (event.error === 'not-allowed') {
            errorMsg = '🎤 Microphone access denied. Please allow microphone permission.';
        }
        
        audioFeedback.className = 'audio-feedback error-message';
        audioFeedback.innerHTML = `
            <div><strong>⚠️ ${errorMsg}</strong></div>
            <button class='btn btn--primary btn--sm' onclick='startListening()' style='margin-top: 10px;'>🔄 Try Again</button>
            <button class='btn btn--outline btn--sm' onclick='setInputMethod("manual")' style='margin-top: 10px;'>Use Manual Input</button>
        `;
        
        resetListenButton();
    };
    
    recognition.onend = function() {
        clearTimeout(recognitionTimeout);
        clearInterval(countdownTimer);
        resetListenButton();
    };
    
    try {
        recognition.start();
    } catch (error) {
        console.error('Speech recognition start error:', error);
        audioFeedback.textContent = 'Failed to start speech recognition. Please try again.';
        resetListenButton();
    }
}

// confirm the stock addition from audio
function confirmAudioStock() {
    // Process inward and ensure all views update
    processInward();
}

function stopListening() {
    if (recognition) {
        recognition.stop();
        recognition = null;
    }
    resetListenButton();
}

function resetListenButton() {
    const listenBtn = document.getElementById('listenBtn');
    listenBtn.innerHTML = '<span class="mic-icon">🎤</span> Start Listening';
    listenBtn.disabled = false;
}

// Enhanced audio input parser with Hindi size and quantity recognition
function parseAudioInput(transcript, callback) {
    console.log('Parsing transcript:', transcript);
    
    // Complete Hindi number mapping
    const hindiNumbers = {
        // Size numbers (common dress sizes in Hindi)
        'बत्तीस': '32',
        'चौंतीस': '34', 
        'छत्तीस': '36',
        'अड़तीस': '38',
        'चालीस': '40',
        'बयालीस': '42',
        'छब्बीस': '26',
        'अट्ठाईस': '28',
        'तीस': '30',
        'फ्री साइज़': 'Free Size',
        
        // Quantity numbers (for quantity detection)
        'एक': '1',
        'दो': '2', 
        'तीन': '3',
        'चार': '4',
        'पांच': '5',
        'छह': '6',
        'सात': '7',
        'आठ': '8',
        'नौ': '9',
        'दस': '10',
        'ग्यारह': '11',
        'बारह': '12',
        'तेरह': '13',
        'चौदह': '14',
        'पंद्रह': '15',
        'सोलह': '16',
        'सत्रह': '17',
        'अट्ठारह': '18',
        'उन्नीस': '19',
        'बीस': '20',
        'पच्चीस': '25',
        'पैंतीस': '35',
        'पैंतालीस': '45',
        'पचास': '50'
    };
    
    // Size numbers for context identification
    const sizeNumbers = ['बत्तीस', 'चौंतीस', 'छत्तीस', 'अड़तीस', 'चालीस', 'बयालीस', 'छब्बीस', 'अट्ठाईस', 'तीस'];
    
    let type = 'Plain'; // Default
    if (/dora/i.test(transcript)) type = 'Dora';
    else if (/zipper/i.test(transcript)) type = 'Zipper';
    
    // Size detection - look for Hindi size numbers first
    let size = '';
    for (const hindiSize of sizeNumbers) {
        if (transcript.includes(hindiSize)) {
            size = hindiNumbers[hindiSize];
            break;
        }
    }
    
    // Fallback to English sizes if Hindi not found
    if (!size) {
        let sizeMatches = transcript.match(/(26-32 set|34-38 set|40-42 set|free size|24|26|32|38)/i);
        size = sizeMatches ? (sizeMatches[0].toUpperCase() === 'FREE SIZE' ? 'Free Size' : sizeMatches[0].replace(/\b(set|size)\b/i, x=>x.toUpperCase()).replace(/\b(\d+-\d+)\b/i, x=>x) ) : '';
    }
    
    // Quantity detection - look for Hindi numbers that are NOT sizes
    let quantity = 0;
    const words = transcript.split(' ');
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        if (hindiNumbers[word] && !sizeNumbers.includes(word)) {
            // This is a quantity number, not a size
            quantity = parseInt(hindiNumbers[word]);
            console.log('Found Hindi quantity:', word, '=', quantity);
            break;
        }
    }
    
    // Fallback: look for English numbers for quantity
    if (!quantity) {
        const qtyMatch = transcript.match(/(\d+)\s*piece/i);
        if (qtyMatch) {
            quantity = parseInt(qtyMatch[1]);
        } else {
            // Look for any number that's not the size
            const allNumbers = transcript.match(/(\d+)/g);
            if (allNumbers) {
                for (const num of allNumbers) {
                    if (num !== size) {
                        quantity = parseInt(num);
                        break;
                    }
                }
            }
        }
    }
    
    // Color detection (basic)
    let color = 'Navy Blue'; // Default
    let colorMatches = transcript.match(
        /(navy blue|mehroon|red\+white|red\+yellow|red|white|yellow|coffee\+white|coffee\+camel|coffee|bottle green|bottle green\+white|bottle green\+yellow|mixture grey\+white|mixture grey|mixture|black\+white|black|sky blue\+white|sky blue|camel)/i
    );
    if (colorMatches) {
        color = colorMatches[0].replace(/\s+/g, ' ').replace(/^(\w)/, c => c.toUpperCase());
    }
    
    console.log('Parsed:', { type, size, quantity, color });
    
    // Check existing inventory
    const existingItem = inventory.find(item => 
        item.type === type && 
        item.color === color && 
        item.size === size
    );
    
    // Show preview form with proper editing capabilities
    showAudioPreview(type, color, size, quantity, existingItem);
}

function showAudioPreview(type, color, size, quantity, existingItem) {
    const audioResult = document.getElementById('audioResult');
    
    let inwardRate = '';
    let sellingRate = '';
    let statusMsg = '';
    let isReadonly = '';
    
    if (existingItem) {
        inwardRate = existingItem.inwardRate.toFixed(2);
        sellingRate = existingItem.sellingRate.toFixed(2);
        statusMsg = '✅ Item found in inventory - rates auto-filled (you can change them)';
        isReadonly = ''; // Allow editing even for existing items
    } else {
        statusMsg = '⚠️ New item - please enter rates manually';
        isReadonly = '';
    }
    
    audioResult.innerHTML = `
        <div class="message success">
            <h4>📋 Audio Input Parsed</h4>
            <p>${statusMsg}</p>
            
            <form id="audioPreviewForm" class="form-grid" style="margin-top: 1rem;">
                <div class="form-group">
                    <label class="form-label">Type</label>
                    <select class="form-control" id="audioType">
                        <option value="Plain" ${type === 'Plain' ? 'selected' : ''}>Plain</option>
                        <option value="Dora" ${type === 'Dora' ? 'selected' : ''}>Dora</option>
                        <option value="Zipper" ${type === 'Zipper' ? 'selected' : ''}>Zipper</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label">Color</label>
                    <input type="text" class="form-control" id="audioColor" value="${color}">
                </div>
                <div class="form-group">
                    <label class="form-label">Size</label>
                    <input type="text" class="form-control" id="audioSize" value="${size}">
                </div>
                <div class="form-group">
                    <label class="form-label">Quantity</label>
                    <input type="number" class="form-control" id="audioQuantity" value="${quantity}" min="1" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Inward Rate (₹)</label>
                    <input type="number" class="form-control" id="audioInwardRate" value="${inwardRate}" step="0.01" min="0.01" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Selling Rate (₹)</label>
                    <input type="number" class="form-control" id="audioSellingRate" value="${sellingRate}" step="0.01" min="0.01" required>
                </div>
                <div style="display: flex; gap: 1rem;">
                    <button type="button" class="btn" onclick="confirmAudioStock()">✅ Confirm & Add</button>
                    <button type="button" class="btn btn--outline" onclick="clearAudioPreview()">❌ Cancel</button>
                </div>
            </form>
        </div>
    `;
    audioResult.style.display = 'block';
}

function confirmAudioStock() {
    const type = document.getElementById('audioType').value;
    const color = document.getElementById('audioColor').value;
    const size = document.getElementById('audioSize').value;
    const quantity = parseInt(document.getElementById('audioQuantity').value);
    const inwardRate = parseFloat(document.getElementById('audioInwardRate').value);
    const sellingRate = parseFloat(document.getElementById('audioSellingRate').value);
    
    if (!type || !color || !size || !quantity || !inwardRate || !sellingRate) {
        showMessage('❌ Please fill all fields', 'error');
        return;
    }
    
    processInwardStock(type, color, size, quantity, inwardRate, sellingRate);
    clearAudioPreview();
    showMessage('✅ Stock added successfully from audio input!', 'success');
}

function clearAudioPreview() {
    document.getElementById('audioResult').style.display = 'none';
    document.getElementById('audioResult').innerHTML = '';
}

// Process inward stock - sends data to backend
async function processInwardStock(type, color, size, quantity, inwardRate, sellingRate) {
    console.log('📦 processInwardStock called with:', {type, color, size, quantity, inwardRate, sellingRate});
    
    try {
        const payload = {
            type,
            color,
            size,
            quantity: parseInt(quantity),
            inwardRate: parseFloat(inwardRate),
            sellingRate: parseFloat(sellingRate)
        };

        console.log('📤 Sending to backend:', payload);

        const res = await fetch('https://school-dress-inventory-production.up.railway.app/api/inventory/inward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to process inward stock');
        }

        const data = await res.json();
        console.log('✅ Backend response:', data);

        // ✅ CRITICAL: Reload inventory from backend to get latest data
        await loadInventory();
        await loadTransactions();
        
        // Also reload transactions if they're tracked
        if (typeof loadTransactions === 'function') {
            await loadTransactions();
        }
        
        showMessage(`✅ Successfully added ${quantity} x ${type} ${color} ${size}`, 'success');

        // Clear the inward form
        if (typeof clearInwardForm === 'function') {
            clearInwardForm();
        }

    } catch (error) {
        console.error('❌ Error in processInwardStock:', error);
        showMessage(`❌ Error adding stock: ${error.message}`, 'error');
    }
}



// Dashboard functions
function updateDashboard() {
    updateDashboardMetrics();
    updateInventoryList();
    updateStockChart();
}

function updateDashboardMetrics() {
    // Guard clause: Check if inventory exists and is valid
    if (!inventory || !Array.isArray(inventory) || inventory.length === 0) {
        console.warn('No inventory data available for metrics');
        // Set defaults when no inventory
        document.getElementById('totalItems').textContent = '0';
        document.getElementById('totalSales').textContent = '₹0';
        document.getElementById('totalStockValue').textContent = '₹0';
        document.getElementById('lowStockItems').textContent = '0';
        document.getElementById('avgInwardRate').textContent = '₹0.00';
        document.getElementById('avgSellingRate').textContent = '₹0.00';
        document.getElementById('profitPotential').textContent = '₹0';
        return;
    }

    // Guard clause: Check if transactions exists
    if (!transactions || !Array.isArray(transactions)) {
        transactions = [];
    }

    // Calculate total items with type safety
    const totalItems = inventory.reduce((sum, item) => {
        const qty = parseInt(item.quantity) || 0;
        return sum + qty;
    }, 0);
    
    // Calculate total sales from outward transactions
    const totalSales = transactions
        .filter(t => t.type === 'outward')
        .reduce((sum, t) => {
            const total = parseFloat(t.total) || 0;
            return sum + total;
        }, 0);
    
    // Calculate total stock value (inventory worth at selling prices)
    const totalStockValue = inventory.reduce((sum, item) => {
        const qty = parseInt(item.quantity) || 0;
        const rate = parseFloat(item.sellingRate) || 0;
        return sum + (qty * rate);
    }, 0);
    
    // Calculate weighted averages based on quantities
    const totalInwardValue = inventory.reduce((sum, item) => {
        const inwardRate = parseFloat(item.inwardRate) || 0;
        const qty = parseInt(item.quantity) || 0;
        return sum + (inwardRate * qty);
    }, 0);
    
    const totalSellingValue = inventory.reduce((sum, item) => {
        const sellingRate = parseFloat(item.sellingRate) || 0;
        const qty = parseInt(item.quantity) || 0;
        return sum + (sellingRate * qty);
    }, 0);
    
    const avgInwardRate = totalItems > 0 ? totalInwardValue / totalItems : 0;
    const avgSellingRate = totalItems > 0 ? totalSellingValue / totalItems : 0;
    
    // Calculate low stock items (quantity < 10)
    const lowStockItems = inventory.filter(item => {
        const qty = parseInt(item.quantity) || 0;
        return qty < 10;
    }).length;
    
    // Calculate profit potential
    const profitPotential = inventory.reduce((sum, item) => {
        const sellingRate = parseFloat(item.sellingRate) || 0;
        const inwardRate = parseFloat(item.inwardRate) || 0;
        const qty = parseInt(item.quantity) || 0;
        return sum + ((sellingRate - inwardRate) * qty);
    }, 0);

    // Calculate profit earned from outward transactions
    const profitEarned = transactions
    .filter(t => t.type === 'outward')
    .reduce((sum, t) => sum + (parseFloat(t.profit) || 0), 0);    
    
    // Update all dashboard elements with safe formatting
    document.getElementById('totalItems').textContent = totalItems.toString();
    document.getElementById('totalSales').textContent = `₹${totalSales.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
    document.getElementById('totalStockValue').textContent = `₹${totalStockValue.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
    document.getElementById('lowStockItems').textContent = lowStockItems.toString();
    document.getElementById('avgInwardRate').textContent = `₹${avgInwardRate.toFixed(2)}`;
    document.getElementById('avgSellingRate').textContent = `₹${avgSellingRate.toFixed(2)}`;
    document.getElementById('profitPotential').textContent = `₹${profitPotential.toLocaleString('en-IN', {minimumFractionDigits: 0, maximumFractionDigits: 0})}`;
    document.getElementById('profitEarned').textContent = `₹${profitEarned.toFixed(2)}`;
}


function updateInventoryList() {
    const inventoryListEl = document.getElementById('inventoryList');
    if (!inventoryListEl) return;
    
    if (inventory.length === 0) {
        inventoryListEl.innerHTML = '<div class="empty-state">No inventory items yet</div>';
        return;
    }
    
    inventoryListEl.innerHTML = inventory.map(item => `
        <div class="inventory-item">
            <div class="inventory-details">
                <div class="inventory-name">${item.type} ${item.color} ${item.size}</div>
                <div class="inventory-meta">Rate: ₹${item.inwardRate} | Selling: ₹${item.sellingRate}</div>
            </div>
            <div class="inventory-stock ${item.quantity < 10 ? 'low-stock' : ''}">${item.quantity}</div>
        </div>
    `).join('');
}

function updateStockChart() {
    const chartCanvas = document.getElementById('stockChart');
    if (!chartCanvas) return;
    
    const ctx = chartCanvas.getContext('2d');
    
    // Destroy existing chart if it exists
    if (window.stockChartInstance) {
        window.stockChartInstance.destroy();
    }
    
    // Calculate stock distribution by type
    const typeData = {};
    inventory.forEach(item => {
        typeData[item.type] = (typeData[item.type] || 0) + item.quantity;
    });
    
    if (Object.keys(typeData).length === 0) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(0, 0, chartCanvas.width, chartCanvas.height);
        ctx.fillStyle = '#666';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No Data Available', chartCanvas.width/2, chartCanvas.height/2);
        return;
    }
    
    window.stockChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(typeData),
            datasets: [{
                data: Object.values(typeData),
                backgroundColor: ['#21808D', '#E68161', '#C0152F', '#5E8291', '#A84B2F'],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        font: {
                            size: 12
                        }
                    }
                }
            }
        }
    });
}

// Barcode functions
function generateAllBarcodes() {
    const barcodeContainer = document.getElementById('barcodeContainer');
    barcodeContainer.innerHTML = '<div class="barcode-grid"></div>';
    const barcodeGrid = barcodeContainer.querySelector('.barcode-grid');
    
    inventory.forEach((item, index) => {
        const barcode = item.barcode || generateBarcode(item.type, item.color, item.size, item.inwardRate || 0);
        
        if (barcode) {
            const barcodeItem = document.createElement('div');
            barcodeItem.className = 'barcode-item';
            
            const svg = document.createElement('svg');
            svg.id = `barcode-${index}`;
            
            barcodeItem.appendChild(svg);
            barcodeItem.innerHTML += `
                <div class="barcode-label">
                    <strong>${item.type} ${item.color}</strong><br>
                    Size: ${item.size}<br>
                    Barcode: ${barcode}<br>
                    Stock: ${item.quantity}
                </div>
            `;
            barcodeGrid.appendChild(barcodeItem);
            
            // Generate barcode using JsBarcode
            try {
                JsBarcode(svg, barcode, {
                    format: "CODE128",
                    width: 2,
                    height: 50,
                    displayValue: true,
                    fontSize: 12,
                    margin: 5
                });
            } catch (error) {
                console.error('Error generating barcode:', error);
                svg.innerHTML = `<text x="50" y="25" fill="red">Error generating barcode</text>`;
            }
        }
    });
    
    document.getElementById('barcodeModal').style.display = 'flex';
}

function closeBarcodeModal() {
    document.getElementById('barcodeModal').style.display = 'none';
}

// Setup outward form submission handler
// =============================
// 🧾 Outward Form Submission
// =============================
// function setupOutwardFormSubmission() {
//     const outwardForm = document.getElementById('outwardForm');
//     if (outwardForm) {
//         outwardForm.addEventListener('submit', async function(e) {
//             e.preventDefault();
            
//             const type = document.getElementById('outwardDressType').value;
//             const color = document.getElementById('outwardDressColor').value;
//             const size = document.getElementById('outwardDressSize').value;
//             const quantity = parseInt(document.getElementById('outwardQuantity').value);
//             const sellingRate = parseFloat(document.getElementById('outwardSellingRate').value);
//             const discount = parseFloat(document.getElementById('discount').value) || 0;
//             const remark = document.getElementById('invoiceInternalRemark')?.value || "";
            
//             // Validations
//             if (!type || !color || !size || !quantity || !sellingRate) {
//                 showMessage('❌ Please fill all required fields', 'error');
//                 return;
//             }
            
//             // Check if sufficient stock exists
//             const matchingItem = inventory.find(item => 
//                 item.type === type && item.color === color && item.size === size
//             );
            
//             if (!matchingItem) {
//                 showMessage('❌ Item not found in inventory', 'error');
//                 return;
//             }
            
//             if (quantity > matchingItem.quantity) {
//                 showMessage(`❌ Insufficient stock! Available: ${matchingItem.quantity}`, 'error');
//                 return;
//             }
            
//             // Show loading state
//             showMessage('Processing sale...', 'info');
            
//             try {
//                 console.log('📤 Sending outward transaction to backend:', {
//                     type, color, size, quantity, sellingRate, discount, remark
//                 });
                
//                 const res = await fetch('http://localhost:5000/api/inventory/outward', {
//                     method: 'POST',
//                     headers: { 'Content-Type': 'application/json' },
//                     body: JSON.stringify({
//                         type, 
//                         color, 
//                         size, 
//                         quantity, 
//                         sellingRate, 
//                         discount, 
//                         remark
//                     })
//                 });

//                 if (!res.ok) {
//                     const errData = await res.json();
//                     throw new Error(errData.error || 'Failed to process sale');
//                 }

//                 const data = await res.json();
//                 console.log('✅ Outward transaction response:', data);

//                 // ✅ CRITICAL: Reload both inventory and transactions from backend
//                 await loadInventory();
//                 await loadTransactions();
                
//                 // Update all views
//                 updateDashboardMetrics();
//                 updateInventoryList();
//                 updateStockView();
//                 updateStockChart();
//                 displayHistory();
                
//                 const totalAmount = (quantity * sellingRate - discount).toFixed(2);
//                 showMessage(`✅ Sale processed! Amount: ₹${totalAmount}`, 'success');
                
//                 // Clear form
//                 document.getElementById('outwardForm').reset();
//                 document.getElementById('outwardDressColor').innerHTML = '<option value="">Select Color</option>';
//                 document.getElementById('outwardDressSize').innerHTML = '<option value="">Select Size</option>';
//                 document.getElementById('outwardSellingRate').value = '';
//                 document.getElementById('discount').value = '';
//                 if (document.getElementById('invoiceInternalRemark')) {
//                     document.getElementById('invoiceInternalRemark').value = '';
//                 }
                
//             } catch (error) {
//                 console.error('❌ Outward error:', error);
//                 showMessage(`❌ ${error.message}`, 'error');
//             }
//         });
//     }
// }




// Populate outward dropdowns and auto-fill selling rate from backend inventory
function updateOutwardOptions() {
    try {
        const typeSelect = document.getElementById('outwardDressType');
        const colorSelect = document.getElementById('outwardDressColor');
        const sizeSelect = document.getElementById('outwardDressSize');
        const rateInput = document.getElementById('outwardSellingRate');
        
        if (!typeSelect || !colorSelect || !sizeSelect || !rateInput) return;

        // Get unique types from actual inventory (loaded from backend)
        const types = [...new Set(inventory.map(item => item.type))];
        
        // Populate dress type dropdown
        typeSelect.innerHTML = '<option value="">Select Type</option>';
        types.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type;
            opt.textContent = type;
            typeSelect.appendChild(opt);
        });

        // When type is selected, populate colors
        if (typeSelect.value) {
            const selectedType = typeSelect.value;
            const colors = [...new Set(
                inventory
                    .filter(item => item.type === selectedType)
                    .map(item => item.color)
            )];
            
            colorSelect.innerHTML = '<option value="">Select Color</option>';
            colors.forEach(color => {
                const opt = document.createElement('option');
                opt.value = color;
                opt.textContent = color;
                colorSelect.appendChild(opt);
            });
            
            // If color is also selected, populate sizes
            if (colorSelect.value) {
                const selectedColor = colorSelect.value;
                const sizes = [...new Set(
                    inventory
                        .filter(item => item.type === selectedType && item.color === selectedColor)
                        .map(item => item.size)
                )];
                
                sizeSelect.innerHTML = '<option value="">Select Size</option>';
                sizes.forEach(size => {
                    const opt = document.createElement('option');
                    opt.value = size;
                    opt.textContent = size;
                    sizeSelect.appendChild(opt);
                });
            } else {
                sizeSelect.innerHTML = '<option value="">Select Size</option>';
            }
            
            checkOutwardSellingRate();
        } else {
            colorSelect.innerHTML = '<option value="">Select Color</option>';
            sizeSelect.innerHTML = '<option value="">Select Size</option>';
            rateInput.value = '';
            rateInput.placeholder = 'Auto-filled, can be changed';
        }
    } catch (e) {
        console.warn('updateOutwardOptions error:', e);
    }
}


// Update initialization to include outward form setup
function initializeOutwardForm() {
    setupOutwardFormListeners();
}

// Share invoice
function shareInvoice() {
    const customerName = document.getElementById('invoiceCustomerName').value.trim();
    const customerPhone = document.getElementById('invoiceCustomerPhone').value.trim();
    const customerEmail = document.getElementById('invoiceCustomerEmail').value.trim();
    
    if (!customerName || !customerPhone) {
        showMessage('❌ Please enter customer name and phone number', 'error');
        return;
    }
    
    // Generate PDF first
    generateModernInvoicePDF(customerName, customerPhone, customerEmail);
    
    // Create thank you message
    const thankYouMessage = `Dear ${customerName},

Thank you for your purchase! 🙏

📄 Invoice: ${lastSaleData.invoiceNumber}
👕 Item: ${lastSaleData.item}
📦 Quantity: ${lastSaleData.quantity}
💰 Total Amount: ₹${lastSaleData.finalTotal.toFixed(2)}

We appreciate your business and look forward to serving you again!

Best regards,
School Dress Inventory Team`;
    
    showSharingOptions(customerPhone, customerEmail, thankYouMessage);
    closeInvoiceModal();
}

function showSharingOptions(customerPhone, customerEmail, message) {
    const encodedMessage = encodeURIComponent(message);
    
    const sharingModalHTML = `
        <div id="sharingModal" class="modal" style="display: flex;">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Share Invoice</h3>
                    <button type="button" class="modal-close" onclick="closeSharingModal()">&times;</button>
                </div>
                <div style="text-align: center; padding: 1rem;">
                    <p><strong>Invoice ready to share!</strong></p>
                    <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; margin: 1rem 0; white-space: pre-line; font-size: 0.9em; text-align: left;">${message}</div>
                    <div style="display: flex; gap: 1rem; justify-content: center; margin-top: 1.5rem;">
                        <button type="button" class="btn" onclick="shareViaWhatsApp('${customerPhone}', '${encodedMessage}')">📱 WhatsApp</button>
                        <button type="button" class="btn" onclick="shareViaSMS('${customerPhone}', '${encodedMessage}')">💬 SMS</button>
                        ${customerEmail ? `<button type="button" class="btn" onclick="shareViaEmail('${customerEmail}', '${encodedMessage}')">📧 Email</button>` : ''}
                    </div>
                    <button type="button" class="btn btn--outline" onclick="closeSharingModal()" style="margin-top: 1rem;">✅ Done</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', sharingModalHTML);
}

function closeSharingModal() {
    const modal = document.getElementById('sharingModal');
    if (modal) modal.remove();
}

function shareViaWhatsApp(phone, message) {
    window.open(`https://wa.me/91${phone}?text=${message}`, '_blank');
}

function shareViaSMS(phone, message) {
    window.open(`sms:${phone}?body=${message}`, '_blank');
}

function shareViaEmail(email, message) {
    const subject = encodeURIComponent('Invoice - School Dress Inventory');
    window.open(`mailto:${email}?subject=${subject}&body=${message}`, '_blank');
}

// Stock View Functions
function showStockView() {
    const stockViewSection = document.getElementById('stockViewSection');
    if (stockViewSection.style.display === 'none') {
        stockViewSection.style.display = 'block';
        updateStockView();
    } else {
        stockViewSection.style.display = 'none';
    }
}

function updateStockView() {
    const tableBody = document.getElementById('stockTableBody');
    if (!tableBody) return;
    
    // Guard clause - check if inventory is loaded
    if (!inventory || !Array.isArray(inventory) || inventory.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="10" class="empty-state">No inventory items to display</td></tr>';
        return;
    }
    
    // Group items by type+color+size to handle multiple inward rates
    const groupedItems = inventory.reduce((groups, item, originalIndex) => {
        const key = `${item.type}-${item.color}-${item.size}`;
        if (!groups[key]) {
            groups[key] = [];
        }
        groups[key].push({ ...item, originalIndex });
        return groups;
    }, {});
    
    let html = '';
    
    // Process each group
    Object.values(groupedItems).forEach(group => {
        if (group.length === 1) {
            // Single rate item
            const item = group[0];
            html += generateStockRow(item, item.originalIndex, false);
        } else {
            // Multiple rates for same item
            const mainItem = group[0];
            const totalQuantity = group.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
            const avgInwardRate = group.reduce((sum, item) => sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.inwardRate) || 0)), 0) / totalQuantity;
            const totalSellingValue = group.reduce((sum, item) => sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.sellingRate) || 0)), 0);
            
            // Main row with combined data
            html += `
                <tr class="stock-group-header" data-type="${mainItem.type}" data-color="${mainItem.color}" data-size="${mainItem.size}">
                    <td><strong>${mainItem.type}</strong> ${totalQuantity < 15 ? '<span class="status status--error">Low Stock</span>' : ''}</td>
                    <td>${mainItem.color}</td>
                    <td>${mainItem.size}</td>
                    <td><strong>${totalQuantity}</strong> (${group.length} rates)</td>
                    <td>₹${avgInwardRate.toFixed(2)} <small>avg</small></td>
                    <td>₹${(totalSellingValue / totalQuantity).toFixed(2)} <small>avg</small></td>
                    <td><strong>₹${totalSellingValue.toFixed(2)}</strong></td>
                    <td><strong>${(((totalSellingValue / totalQuantity - avgInwardRate) / (totalSellingValue / totalQuantity)) * 100).toFixed(1)}%</strong> <small>avg</small></td>
                    <td><code>${mainItem.barcode || 'N/A'}</code></td>
                    <td><small>Multiple rates</small></td>
                </tr>
            `;
            
            // Sub-rows for each rate
            group.forEach(item => {
                const sellingRate = parseFloat(item.sellingRate) || 0;
                const inwardRate = parseFloat(item.inwardRate) || 0;
                const profitMargin = sellingRate > 0 ? (((sellingRate - inwardRate) / sellingRate) * 100).toFixed(1) : '0.0';
                const profitClass = parseFloat(profitMargin) >= 15 ? 'profit-high' : 'profit-low';
                const quantity = parseInt(item.quantity) || 0;
                
                html += `
                    <tr class="stock-sub-row" style="background: var(--color-bg-1); font-size: 0.9em;">
                        <td style="padding-left: 30px;"><em>Rate ${group.indexOf(item) + 1}</em></td>
                        <td></td>
                        <td></td>
                        <td>${quantity}</td>
                        <td>₹${inwardRate.toFixed(2)}</td>
                        <td>₹${sellingRate.toFixed(2)}</td>
                        <td>₹${(quantity * sellingRate).toFixed(2)}</td>
                        <td class="${profitClass}">${profitMargin}%</td>
                        <td><code style="font-size: 10px;">${item.barcode || 'N/A'}</code></td>
                        <td>
                            <div class="stock-actions">
                                <button class="btn btn--outline btn--xs" onclick="enableRowEdit('${item.id}', this)" title="Edit this rate">Edit</button>
                            </div>
                        </td>
                    </tr>
                `;
            });
        }
    });
    
    tableBody.innerHTML = html;
    
    // Update stock summary
    const totalItems = inventory.reduce((sum, item) => sum + (parseInt(item.quantity) || 0), 0);
    const totalInwardValue = inventory.reduce((sum, item) => sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.inwardRate) || 0)), 0);
    const totalSellingValue = inventory.reduce((sum, item) => sum + ((parseInt(item.quantity) || 0) * (parseFloat(item.sellingRate) || 0)), 0);
    const profitPotential = totalSellingValue - totalInwardValue;
    const lowStockCount = inventory.filter(item => (parseInt(item.quantity) || 0) < 15).length;
    
    if (inventory.length > 0 && totalItems > 0) {
        const summaryRow = `
            <tr style="background: var(--color-bg-3); font-weight: bold; border-top: 2px solid var(--color-border);">
                <td colspan="3"><strong>TOTAL SUMMARY</strong></td>
                <td><strong>${totalItems}</strong></td>
                <td><strong>₹${(totalInwardValue / totalItems).toFixed(2)}</strong><br><small>Avg Inward</small></td>
                <td><strong>₹${(totalSellingValue / totalItems).toFixed(2)}</strong><br><small>Avg Selling</small></td>
                <td><strong>₹${totalSellingValue.toFixed(2)}</strong></td>
                <td><strong>${totalSellingValue > 0 ? ((profitPotential / totalSellingValue) * 100).toFixed(1) : '0.0'}%</strong><br><small>Profit: ₹${profitPotential.toFixed(2)}</small></td>
                <td colspan="2"><small>Low Stock Items: ${lowStockCount}</small></td>
            </tr>
        `;
        tableBody.innerHTML += summaryRow;
    }
}


// Generate individual stock row
function generateStockRow(item, actualIndex, isSubRow = false) {
    const quantity = parseInt(item.quantity) || 0;
    const inwardRate = parseFloat(item.inwardRate) || 0;
    const sellingRate = parseFloat(item.sellingRate) || 0;
    const totalSellingValue = (quantity * sellingRate).toFixed(2);
    const stockClass = quantity < 10 ? 'stock-low-warning' : quantity < 25 ? 'stock-medium-warning' : '';
    const profitMargin = sellingRate > 0 ? (((sellingRate - inwardRate) / sellingRate) * 100).toFixed(1) : '0.0';
    const profitClass = parseFloat(profitMargin) >= 15 ? 'profit-high' : 'profit-low';
    
    return `
        <tr class="${stockClass} ${isSubRow ? 'stock-sub-row' : ''}" data-type="${item.type}" data-color="${item.color}" data-size="${item.size}">
            <td ${isSubRow ? 'style="padding-left: 30px;"' : ''}>
                <strong>${item.type}</strong>
                ${quantity < 15 ? '<span class="status status--error">Low Stock</span>' : ''}
            </td>
            <td>${item.color}</td>
            <td>${item.size}</td>
            <td>
                <strong>${quantity}</strong>
                ${quantity < 10 ? ' ⚠️' : quantity > 50 ? ' 💪' : ''}
            </td>
            <td>₹${inwardRate.toFixed(2)}</td>
            <td>₹${sellingRate.toFixed(2)}</td>
            <td><strong>₹${totalSellingValue}</strong></td>
            <td class="${profitClass}"><strong>${profitMargin}%</strong></td>
            <td><code style="font-size: 11px;">${item.barcode || 'N/A'}</code></td>
            <td>
                <div class="stock-actions">
                    <button class="btn btn--outline btn--xs" onclick="enableRowEdit('${item.id}', this)" title="Edit item">Edit</button>
                    <button class="btn btn--outline btn--xs" onclick="viewBarcodeOnly('${item.barcode}')" title="View barcode">QR</button>
                </div>
            </td>
        </tr>
    `;
}


function filterStockView() {
    const searchTerm = document.getElementById('stockSearch').value.toLowerCase();
    const typeFilter = document.getElementById('stockTypeFilter').value;
    const rows = document.querySelectorAll('#stockTableBody tr');
    
    rows.forEach(row => {
        const type = row.dataset.type;
        const color = row.dataset.color.toLowerCase();
        const size = row.dataset.size.toLowerCase();
        const text = `${type} ${color} ${size}`.toLowerCase();
        
        const matchesSearch = text.includes(searchTerm);
        const matchesType = !typeFilter || type === typeFilter;
        
        if (matchesSearch && matchesType) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

let currentSortColumn = -1;
let sortDirection = 'asc';

function sortStockTable(columnIndex) {
    const table = document.getElementById('stockTable');
    const tbody = table.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    // Toggle sort direction if same column
    if (currentSortColumn === columnIndex) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortDirection = 'asc';
        currentSortColumn = columnIndex;
    }
    
    // Clear previous sort indicators
    table.querySelectorAll('th').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
    });
    
    // Add current sort indicator
    const currentHeader = table.querySelectorAll('th')[columnIndex];
    currentHeader.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
    
    // Sort rows
    rows.sort((a, b) => {
        const aValue = a.cells[columnIndex].textContent.trim();
        const bValue = b.cells[columnIndex].textContent.trim();
        
        // Handle numeric columns
        if (columnIndex === 3 || columnIndex === 4 || columnIndex === 5 || columnIndex === 6) {
            const aNum = parseFloat(aValue.replace(/[₹,]/g, ''));
            const bNum = parseFloat(bValue.replace(/[₹,]/g, ''));
            return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }
        
        // Handle text columns
        const result = aValue.localeCompare(bValue);
        return sortDirection === 'asc' ? result : -result;
    });
    
    // Reorder table
    rows.forEach(row => tbody.appendChild(row));
}

function enableRowEdit(itemId, buttonElement) {
    if (editingRow !== null) {
        showMessage('Please save or cancel the current edit before starting a new one.', 'error');
        return;
    }
    
    editingRow = itemId;
    const item = inventory.find(i => i.id === itemId);
    if (!item) {
        showMessage('Item not found', 'error');
        return;
    }
    
    const row = buttonElement.closest('tr');
    const cells = row.children;
    
    const quantity = parseInt(item.quantity) || 0;
    const inwardRate = parseFloat(item.inwardRate) || 0;
    const sellingRate = parseFloat(item.sellingRate) || 0;

    // Calculate initial profit margin percentage
    const profitMargin = inwardRate > 0 ? (((sellingRate - inwardRate) / inwardRate) * 100).toFixed(1) : '0.0';

    // Stock Quantity (cell 3)
    cells[3].innerHTML = `<input type="number" id="edit-qty-${itemId}" value="${quantity}" min="0"
        style="width: 80px; padding: 4px; border: 1px solid var(--color-border); border-radius: 4px;">`;
    
    // Inward Rate (cell 4)
    cells[4].innerHTML = `<input type="number" id="edit-inward-${itemId}" value="${inwardRate.toFixed(2)}" min="0.01" step="0.01"
        style="width: 90px; padding: 4px; border: 1px solid var(--color-border); border-radius: 4px;">`;
    
    // Selling Rate (cell 5)
    cells[5].innerHTML = `<input type="number" id="edit-selling-${itemId}" value="${sellingRate.toFixed(2)}" min="0.01" step="0.01"
        style="width: 90px; padding: 4px; border: 1px solid var(--color-border); border-radius: 4px;">`;

    // Profit Margin (cell 7)
    cells[7].innerHTML = `<input type="number" id="edit-margin-${itemId}" value="${profitMargin}" min="0" max="999" step="0.1"
        style="width: 70px; padding: 4px; border: 1px solid var(--color-border); border-radius: 4px;">
        <small>%</small> <span style="color:#888; font-size:0.8em;">(edit margin to update selling rate)</span>`;

    // Replace action buttons (cell 9)
    cells[cells.length - 1].innerHTML = `
        <div class="stock-actions">
            <button class="btn btn--primary btn--xs" onclick="saveRowChanges('${itemId}', this)" title="Save changes">Save</button>
            <button class="btn btn--outline btn--xs" onclick="cancelRowEdit()" title="Cancel edit">Cancel</button>
        </div>
    `;
    
    // Add real-time calculation update that also syncs selling rate and margin fields
    const qtyInput = document.getElementById(`edit-qty-${itemId}`);
    const inwardInput = document.getElementById(`edit-inward-${itemId}`);
    const sellingInput = document.getElementById(`edit-selling-${itemId}`);
    const marginInput = document.getElementById(`edit-margin-${itemId}`);

    function updateCalculations() {
        const qty = parseFloat(qtyInput.value) || 0;
        const inward = parseFloat(inwardInput.value) || 0;
        const selling = parseFloat(sellingInput.value) || 0;

        if (qty > 0 && selling > 0) {
            const totalValue = (qty * selling).toFixed(2);
            const margin = inward > 0 ? (((selling - inward) / inward) * 100).toFixed(1) : '0.0';

            cells[6].innerHTML = `<strong>₹${totalValue}</strong> <small>(preview)</small>`;

            // Update margin input field but don't trigger input event to prevent loop
            marginInput.value = margin;
        }
    }

    // Update selling rate when margin input changes
    marginInput.addEventListener('input', () => {
        const inward = parseFloat(inwardInput.value) || 0;
        const margin = parseFloat(marginInput.value) || 0;

        if (inward > 0) {
            const newSelling = inward * (1 + margin / 100);
            sellingInput.value = newSelling.toFixed(2);
            updateCalculations();
        }
    });

    // Update margin when selling rate changes
    sellingInput.addEventListener('input', () => {
        const inward = parseFloat(inwardInput.value) || 0;
        const selling = parseFloat(sellingInput.value) || 0;

        if (selling > 0 && inward > 0) {
            const newMargin = ((selling - inward) / inward * 100).toFixed(1);
            marginInput.value = newMargin;
            updateCalculations();
        }
    });

    // Update calculations on quantity or inward change
    qtyInput.addEventListener('input', updateCalculations);
    inwardInput.addEventListener('input', () => {
        // Make sure selling price is adjusted according to margin when inward rate changes
        marginInput.dispatchEvent(new Event('input'));
    });

    // Initialize calculations
    updateCalculations();

    qtyInput.focus();
    qtyInput.select();
}


function cancelRowEdit() {
    editingRow = null;
    updateStockView();
}

async function saveRowChanges(itemId, buttonElement) {
    const item = inventory.find(i => i.id === itemId);
    if (!item) {
        showMessage('Item not found', 'error');
        return;
    }
    
    const row = buttonElement.closest('tr');
    
    // Get new values from inputs
    const newQty = parseInt(document.getElementById(`edit-qty-${itemId}`).value) || 0;
    const newInward = parseFloat(document.getElementById(`edit-inward-${itemId}`).value) || 0;
    const newSelling = parseFloat(document.getElementById(`edit-selling-${itemId}`).value) || 0;
    const marginInput = document.getElementById(`edit-margin-${itemId}`);
    const newMargin = marginInput ? parseFloat(marginInput.value) || 0 : null;
    
    // Validate inputs
    if (newQty < 0) {
        showMessage('Quantity cannot be negative.', 'error');
        return;
    }
    
    if (newInward <= 0) {
        showMessage('Inward rate must be greater than 0.', 'error');
        return;
    }
    
    if (newSelling <= 0) {
        showMessage('Selling rate must be greater than 0.', 'error');
        return;
    }
    
    if (newSelling <= newInward) {
        if (!confirm(`Selling rate (₹${newSelling}) is not higher than inward rate (₹${newInward}). This will result in zero or negative profit. Continue anyway?`)) {
            return;
        }
    }
    
    try {
        // Send update to backend
        const res = await fetch(`https://school-dress-inventory-production.up.railway.app/api/inventory/${itemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quantity: newQty,
                inwardRate: newInward,
                sellingRate: newSelling,
                profitMargin: newMargin  // optional; if you track margin separately
            })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.error || 'Failed to update item');
        }
        
        const data = await res.json();
        console.log('✅ Item updated:', data);
        
        // Reload inventory from backend
        await loadInventory();
        
        editingRow = null;
        
        // Update all views
        updateDashboardMetrics();
        updateStockView();
        updateStockChart();
        
        showMessage(`✅ Successfully updated ${item.type} ${item.color} ${item.size}`, 'success');
        
    } catch (error) {
        console.error('❌ Error updating item:', error);
        showMessage(`❌ Error updating item: ${error.message}`, 'error');
    }
}




function viewBarcodeOnly(barcode) {
    if (!barcode || barcode === 'N/A') {
        alert('No barcode available for this item.');
        return;
    }
    
    const modal = document.getElementById('barcodeModal');
    const container = document.getElementById('barcodeContainer');
    
    container.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <h4>Item Barcode</h4>
            <svg id="singleBarcode" style="margin: 20px 0;"></svg>
            <p><strong>Barcode:</strong> ${barcode}</p>
        </div>
    `;
    
    try {
        JsBarcode('#singleBarcode', barcode, {
            format: "CODE128",
            width: 3,
            height: 80,
            displayValue: true,
            fontSize: 16,
            margin: 10
        });
    } catch (error) {
        console.error('Error generating barcode:', error);
    }
    
    modal.style.display = 'flex';
}

function exportStockReport() {
    const csvData = inventory.map(item => ({
        'Type': item.type,
        'Color': item.color,
        'Size': item.size,
        'Quantity': item.quantity,
        'Inward Rate': item.inwardRate.toFixed(2),
        'Selling Rate': item.sellingRate.toFixed(2),
        'Total Value': (item.quantity * item.sellingRate).toFixed(2),
        'Profit Margin(%)': item.inwardRate > 0 ? 
            ((item.sellingRate - item.inwardRate) / item.inwardRate * 100).toFixed(1) : '0.0',
        'Barcode': item.barcode
    }));
    
    // Create CSV content
    const headers = Object.keys(csvData[0]);
    const csvContent = [
        headers.join(','),
        ...csvData.map(row => 
            headers.map(header => `"${row[header]}"`).join(',')
        )
    ].join('\n');
    
    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `stock-report-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    showMessage('Stock report exported successfully!', 'success');
}

// History functions
function displayHistory() {
    filterHistory();
}

function filterHistory() {
    const filterType = document.getElementById('filterType')?.value || 'all';
    const filterDate = document.getElementById('filterDate')?.value || '';
    const historyList = document.getElementById('historyList');
    
    if (!historyList) {
        console.warn('History list element not found');
        return;
    }
    
    // Guard clause for empty transactions
    if (!transactions || transactions.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No transaction history available</div>';
        return;
    }
    
    let filteredTransactions = [...transactions];
    
    // Filter by type
    if (filterType !== 'all') {
        filteredTransactions = filteredTransactions.filter(t => t.type === filterType);
    }
    
    // Filter by date
    if (filterDate) {
        const selectedDate = new Date(filterDate).toDateString();
        filteredTransactions = filteredTransactions.filter(t => 
            new Date(t.date).toDateString() === selectedDate
        );
    }
    
    // Sort by date (newest first)
    filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Generate HTML
    historyList.innerHTML = filteredTransactions.map(transaction => {
        const itemDisplay = transaction.item 
            ? transaction.item 
            : (transaction.item?.type && transaction.item?.color && transaction.item?.size)
                ? `${transaction.item.type} ${transaction.item.color} ${transaction.item.size}`
                : 'Item details unavailable';
        
        const quantity = parseInt(transaction.quantity) || 0;
        const rate = parseFloat(transaction.rate) || 0;
        const discount = parseFloat(transaction.discount) || 0;
        const netTotal = parseFloat(transaction.netTotal) || (quantity * rate - discount);
        
        return `
            <div class="history-item ${transaction.type}" data-id="${transaction.id}" onclick="showTransactionDetails('${transaction.id}')">
                <div class="history-details">
                    <div class="history-type ${transaction.type}">
                        ${transaction.type === 'inward' ? '📥 INWARD' : '📤 OUTWARD'}
                    </div>
                    <div class="history-meta">
                        <strong>${itemDisplay}</strong>
                        <br>
                        Qty: <strong>${quantity}</strong> | Rate: ₹${rate.toFixed(2)}
                        ${discount > 0 ? `| Discount: ₹${discount.toFixed(2)}` : ''}
                        <br>
                        <small>${new Date(transaction.date).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                        })}</small>
                        ${transaction.remark ? `<div class="history-remark">💬 ${transaction.remark}</div>` : ''}
                    </div>
                </div>
                <div class="history-amount ${transaction.type}">
                    ₹${netTotal.toFixed(2)}
                </div>
            </div>
        `;
    }).join('');
    
    // Show count
    if (filteredTransactions.length === 0) {
        historyList.innerHTML = '<div class="empty-state">No transactions match the selected filters</div>';
    }
}


// Export function
function exportData() {
    try {
        // Prepare comprehensive export data
        const exportData = {
            metadata: {
                exportDate: new Date().toISOString(),
                exportedBy: 'School Dress Inventory Management System',
                version: '2.0',
                totalItems: inventory.reduce((sum, item) => sum + item.quantity, 0),
                totalValue: inventory.reduce((sum, item) => sum + (item.quantity * item.sellingRate), 0)
            },
            inventory: inventory.map(item => ({
                ...item,
                profitMargin: item.sellingRate > 0 ? (((item.sellingRate - item.inwardRate) / item.sellingRate) * 100).toFixed(1) + '%' : '0%',
                totalValue: (item.quantity * item.sellingRate).toFixed(2)
            })),
            transactions,
            summary: {
                totalInventoryItems: inventory.length,
                totalTransactions: transactions.length,
                lowStockItems: inventory.filter(item => item.quantity < 10).length,
                avgInwardRate: inventory.length > 0 ? 
                    (inventory.reduce((sum, item) => sum + (item.inwardRate * item.quantity), 0) / 
                     inventory.reduce((sum, item) => sum + item.quantity, 0)).toFixed(2) : '0',
                avgSellingRate: inventory.length > 0 ? 
                    (inventory.reduce((sum, item) => sum + (item.sellingRate * item.quantity), 0) / 
                     inventory.reduce((sum, item) => sum + item.quantity, 0)).toFixed(2) : '0'
            }
        };
        
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        
        const link = document.createElement('a');
        link.href = url;
        link.download = `school-dress-inventory-export-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        
        URL.revokeObjectURL(url);
        
        showMessage(`✅ Export completed successfully! ${inventory.length} items and ${transactions.length} transactions exported.`, 'success');
    } catch (error) {
        console.error('Export failed:', error);
        showMessage('❌ Export failed. Please try again.', 'error');
    }
}

// Helper functions
function stopScanner() {
    if (typeof stopBarcodeScanner === 'function') {
        stopBarcodeScanner();
    }
}

function validateRateInput() {
    const rateInput = document.getElementById('inwardRate');
    const quantityInput = document.getElementById('quantity');
    const preview = document.getElementById('ratePreview');
    
    const rate = parseFloat(rateInput.value);
    const quantity = parseInt(quantityInput.value) || 1;
    
    if (rate && rate > 0) {
        const total = (rate * quantity).toFixed(2);
        const suggestedSellingRate = (rate * 1.4).toFixed(2);
        
        preview.innerHTML = `
            <strong>Preview:</strong><br>
            Total Value: ₹${total}<br>
            Suggested Selling Rate: ₹${suggestedSellingRate} (40% markup)
        `;
        preview.style.display = 'block';
        
        // Remove any previous validation errors
        rateInput.classList.remove('validation-error');
    } else {
        preview.style.display = 'none';
    }
}

// Function to manually submit the inward form
function submitInwardForm() {
    console.log('Submit button clicked'); // Debug log
    
    const type = document.getElementById('dressType').value;
    const color = document.getElementById('dressColor').value;  
    const size = document.getElementById('dressSize').value;
    const quantity = parseInt(document.getElementById('quantity').value);
    const inwardRate = parseFloat(document.getElementById('inwardRate').value);
    let sellingRate = parseFloat(document.getElementById('sellingRate').value);
    
    console.log('Form values:', { type, color, size, quantity, inwardRate, sellingRate }); // Debug log
    
    // Validation
    if (!type) {
        showMessage('Please select dress type', 'error');
        return;
    }
    if (!color) {
        showMessage('Please select color', 'error');
        return;
    }
    if (!size) {
        showMessage('Please select size', 'error');
        return;
    }
    if (!quantity || quantity < 1) {
        showMessage('Please enter valid quantity', 'error');
        return;
    }
    if (!inwardRate || inwardRate <= 0) {
        showMessage('Please enter valid inward rate', 'error');
        return;
    }
    
    // Use selling rate or calculate default
    const finalSellingRate = sellingRate || inwardRate * 1.15;
    
    console.log('Processing stock with:', { type, color, size, quantity, inwardRate, finalSellingRate }); // Debug log
    
    // Process the stock addition
    processInwardStock(type, color, size, quantity, inwardRate, finalSellingRate);
}


// Initialize app with enhanced setup
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 School Dress Inventory Management System - Loading...');
    
    // Initialize data and views
    await loadInventory();
    await loadTransactions();
    await loadMetrics();
    showView('dashboard');
    
    // Initialize outward options
    updateOutwardOptions();
    
    // Set today's date in filter
    document.getElementById('filterDate').value = new Date().toISOString().split('T')[0];
    
    // Initialize browser support indicators
    const browserSupport = document.getElementById('browserSupport');
    if (browserSupport) {
        if (('webkitSpeechRecognition' in window) || ('SpeechRecognition' in window)) {
            browserSupport.className = 'browser-support supported';
            browserSupport.textContent = '✔ Audio input ready';
        } else {
            browserSupport.className = 'browser-support not-supported';
            browserSupport.textContent = '❌ Audio input not supported';
        }
    }
    
    // Validate barcode library availability
    if (typeof Quagga === 'undefined') {
        console.warn('QuaggaJS library not loaded - barcode scanning will be limited');
    } else {
        console.log('✔ QuaggaJS barcode scanner ready');
    }
    
    // CRITICAL: Attach form submission handler
    const manualForm = document.getElementById('manualInwardForm');
    if (manualForm) {
        manualForm.addEventListener('submit', function(e) {
            e.preventDefault();
            console.log('Manual form submitted'); // Debug log
            
            const type = document.getElementById('dressType').value;
            const color = document.getElementById('dressColor').value;  
            const size = document.getElementById('dressSize').value;
            const quantity = parseInt(document.getElementById('quantity').value);
            const inwardRate = parseFloat(document.getElementById('inwardRate').value);
            let sellingRate = parseFloat(document.getElementById('sellingRate').value);
            
            console.log('Form values:', { type, color, size, quantity, inwardRate, sellingRate }); // Debug log
            
            // Validation
            if (!type) {
                showMessage('Please select dress type', 'error');
                return;
            }
            if (!color) {
                showMessage('Please select color', 'error');
                return;
            }
            if (!size) {
                showMessage('Please select size', 'error');
                return;
            }
            if (!quantity || quantity < 1) {
                showMessage('Please enter valid quantity', 'error');
                return;
            }
            if (!inwardRate || inwardRate <= 0) {
                showMessage('Please enter valid inward rate', 'error');
                return;
            }
            
            // Use selling rate or calculate default
            const finalSellingRate = sellingRate || inwardRate * 1.15;
            
            console.log('Processing stock with:', { type, color, size, quantity, inwardRate, finalSellingRate }); // Debug log
            
            // Process the stock addition
            processInwardStock(type, color, size, quantity, inwardRate, finalSellingRate);
        });
    } else {
        console.error('Manual form not found!'); // Debug log
    }
    
    // Initialize outward form with new manual field selection
    initializeOutwardForm();
    
    // Add setupOutwardForm() call to initialization
    setupOutwardForm();
    
    // Setup outward form submission
    // setupOutwardFormSubmission();
    
    // Setup other form event listeners
    setupFormEventListeners();
    
    // Auto-validate form fields on input
    const rateInput = document.getElementById('inwardRate');
    const quantityInput = document.getElementById('quantity');
    
    if (rateInput) {
        rateInput.addEventListener('input', calculateSellingRate);
    }
    
    if (quantityInput) {
        quantityInput.addEventListener('input', validateRateInput);
    }
    
    // Ensure selling rate field has proper value handling
    const sellingRateInput = document.getElementById('sellingRate');
    if (sellingRateInput) {
        sellingRateInput.removeAttribute('required'); // Make it optional
    }
    
    // Add event listeners for existing item detection
    const dressColorSelect = document.getElementById('dressColor');
    const dressSizeSelect = document.getElementById('dressSize');
    
    if (dressColorSelect) {
        dressColorSelect.addEventListener('change', checkExistingItem);
    }
    
    if (dressSizeSelect) {
        dressSizeSelect.addEventListener('change', checkExistingItem);
    }
    
    console.log('✅ Application initialized successfully');
    
    // Show enhanced welcome message
    setTimeout(() => {
        const totalItems = inventory.reduce((sum, item) => sum + item.quantity, 0);
        const message = `🚀 School Dress Inventory System Ready!\n\n📊 Dashboard: All 7 metrics active\n💾 Data: ${inventory.length} items, ${transactions.length} transactions\n🏷️ Barcodes: Unique generation with rates\n📱 UI: Fully responsive design\n\n${totalItems > 0 ? `Current stock: ${totalItems} items` : 'Ready to add inventory!'}`;
        
        showMessage(message, 'success');
    }, 1000);

});

// Setup form event listeners for manual input
function setupFormEventListeners() {
    const typeSelect = document.getElementById('dressType');
    const colorSelect = document.getElementById('dressColor');
    const sizeSelect = document.getElementById('dressSize');
    const inwardRateInput = document.getElementById('inwardRate');
    
    if (typeSelect) {
        typeSelect.addEventListener('change', function() {
            updateColorOptions();
            updateSizeOptions();
        });
    }

    if (colorSelect) {
        colorSelect.addEventListener('change', function() {
            updateSizeOptions();
            checkExistingItem();
        });
    }

    if (sizeSelect) {
        sizeSelect.addEventListener('change', function() {
            checkExistingItem();
        });
    }

    if (inwardRateInput) {
        inwardRateInput.addEventListener('input', function() {
            calculateSellingRate();
        });
    }
}

// Close modals when clicking outside
window.addEventListener('click', function(event) {
    const barcodeModal = document.getElementById('barcodeModal');
    const billModal = document.getElementById('billModal');
    
    if (event.target === barcodeModal) {
        closeBarcodeModal();
    }
    if (event.target === billModal) {
        closeBillModal();
    }
});

// Enhanced auto-save functionality with comprehensive data validation
setInterval(() => {
    try {
        // Data integrity check
        let dataIssues = 0;
        inventory.forEach((item, index) => {
            if (!item.type || !item.color || !item.size) {
                console.warn(`⚠️ Incomplete item at index ${index}:`, item);
                dataIssues++;
            }
            if (item.quantity < 0) {
                console.warn(`⚠️ Negative quantity at index ${index}:`, item);
                item.quantity = 0; // Auto-fix
                dataIssues++;
            }
            if (item.inwardRate <= 0 || item.sellingRate <= 0) {
                console.warn(`⚠️ Invalid rates at index ${index}:`, item);
                dataIssues++;
            }
        });
        
        // saveData(); 
        
        const summary = {
            totalItems: inventory.reduce((sum, item) => sum + item.quantity, 0),
            totalInwardValue: inventory.reduce((sum, item) => sum + (item.quantity * item.inwardRate), 0),
            totalSellingValue: inventory.reduce((sum, item) => sum + (item.quantity * item.sellingRate), 0),
            lowStockItems: inventory.filter(item => item.quantity < 10).length,
            dataIssues
        };
        
        const profitPotential = summary.totalSellingValue - summary.totalInwardValue;
        
        console.log('💾 Auto-save completed:', new Date().toISOString(), 
                   '| Items:', summary.totalItems, 
                   '| Stock Value: ₹' + summary.totalSellingValue.toFixed(2),
                   '| Profit Potential: ₹' + profitPotential.toFixed(2),
                   dataIssues > 0 ? `| Issues: ${dataIssues}` : '| Clean');
    } catch (error) {
        console.error('❌ Auto-save failed:', error);
    }
}, 300000); // 5 minutes

// Enhanced periodic dashboard refresh with data validation
setInterval(() => {
    if (currentView === 'dashboard') {
        // Comprehensive data validation and cleanup
        let fixedIssues = 0;
        inventory.forEach((item, index) => {
            // Fix precision issues
            if (item.inwardRate && typeof item.inwardRate === 'number') {
                const newInward = parseFloat(item.inwardRate.toFixed(2));
                if (item.inwardRate !== newInward) {
                    item.inwardRate = newInward;
                    fixedIssues++;
                }
            }
            
            if (item.sellingRate && typeof item.sellingRate === 'number') {
                const newSelling = parseFloat(item.sellingRate.toFixed(2));
                if (item.sellingRate !== newSelling) {
                    item.sellingRate = newSelling;
                    fixedIssues++;
                }
            }
            
            // Recalculate derived fields
            if (item.quantity && item.sellingRate) {
                item.totalValue = parseFloat((item.quantity * item.sellingRate).toFixed(2));
            }
            
            if (item.sellingRate && item.inwardRate && item.sellingRate > 0) {
                item.profitMargin = (((item.sellingRate - item.inwardRate) / item.sellingRate) * 100).toFixed(1) + '%';
            }
            
            // Ensure barcode exists
            if (!item.barcode && item.type && item.color && item.size && item.inwardRate) {
                item.barcode = generateBarcode(item.type, item.color, item.size, item.inwardRate);
                fixedIssues++;
            }
        });
        
        if (fixedIssues > 0) {
            console.log(`🔧 Fixed ${fixedIssues} data issues during periodic refresh`);
            // saveData();
        }
        
        updateDashboardMetrics();
        updateInventoryList();
        updateStockChart();
    }
}, 30000); // 30 seconds

// Enhanced keyboard shortcuts for power users
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + key combinations
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case '1':
                e.preventDefault();
                showView('dashboard');
                break;
            case '2':
                e.preventDefault();
                showView('inward');
                break;
            case '3':
                e.preventDefault();
                showView('outward');
                break;
            case '4':
                e.preventDefault();
                showView('history');
                break;
            case 's':
                e.preventDefault();
                if (currentView === 'dashboard') {
                    showStockView();
                } else {
                    // saveData();
                    showMessage('💾 Data saved manually', 'success');
                }
                break;
            case 'e':
                e.preventDefault();
                exportData();
                break;
            case 'b':
                e.preventDefault();
                if (currentView === 'dashboard') {
                    generateAllBarcodes();
                }
                break;
        }
    }
    
    // Alt + key for input methods
    if (e.altKey && currentView === 'inward') {
        switch(e.key) {
            case '1':
                e.preventDefault();
                setInputMethod('manual');
                break;
            case '2':
                e.preventDefault();
                setInputMethod('scanner');
                break;
            case '3':
                e.preventDefault();
                setInputMethod('audio');
                break;
        }
    }
    
    // ESC to close modals and clear forms
    if (e.key === 'Escape') {
        closeBarcodeModal();
        closeBillModal();
        
        if (currentView === 'inward') {
            clearInwardForm();
        }
    }
    
    // Enter to submit forms
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
        if (currentView === 'inward' && currentInputMethod === 'manual') {
            const activeElement = document.activeElement;
            if (activeElement && activeElement.classList.contains('form-control')) {
                e.preventDefault();
                processInward();
            }
        }
    }
});

// Utility function for processInward compatibility
function processInward() {
    const type = document.getElementById('dressType').value;
    const color = document.getElementById('dressColor').value;
    const size = document.getElementById('dressSize').value;
    const quantity = parseInt(document.getElementById('quantity').value);
    const inwardRate = parseFloat(document.getElementById('inwardRate').value);
    let sellingRate = parseFloat(document.getElementById('sellingRate').value);
    
    if (!sellingRate || sellingRate <= 0) {
        const existingItem = inventory.find(item => 
            item.type === type && item.color === color && item.size === size
        );
        sellingRate = predictSellingRate(inwardRate, type, size, existingItem);
        document.getElementById('sellingRate').value = sellingRate;
    }
    
    processInwardStock(type, color, size, quantity, inwardRate, sellingRate);
}

// Helper function to close bill modal - ensure it exists
function closeBillModal() {
    const billModal = document.getElementById('billModal');
    if (billModal) {
        billModal.style.display = 'none';
    }
}

// Chat-GPT ............................. 18, October, 2025

// ====== Generate PDF ======
// async function generateInvoicePDF() {
//   fillInvoiceTemplate(); // populate data

//   const template = document.getElementById('invoiceTemplate');
//   template.style.display = 'block';

//   await new Promise(r => setTimeout(r, 80)); // small delay for rendering

//   const canvas = await html2canvas(template, { scale: 2, useCORS: true });
//   const imgData = canvas.toDataURL('image/png');
//   const { jsPDF } = window.jspdf;
//   const pdf = new jsPDF('p', 'pt', 'a4');
//   const pdfWidth = pdf.internal.pageSize.getWidth();
//   const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
//   pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

//   template.style.display = 'none';
//   return pdf.output('blob');
// }

// // ====== Fill Invoice Template ======
// function fillInvoiceTemplate() {
//   const name = document.getElementById('invoiceCustomerName').value || 'Customer';
//   const phone = document.getElementById('invoiceCustomerPhone').value || 'N/A';
//   const email = document.getElementById('invoiceCustomerEmail').value || 'N/A';
//   const items = window.cartItems || []; // ensure you have this globally

//   document.getElementById('invCustomerName').textContent = name;
//   document.getElementById('invCustomerPhone').textContent = phone;
//   document.getElementById('invCustomerEmail').textContent = email;
//   document.getElementById('invNumber').textContent = `INV-${Date.now().toString().slice(-5)}`;
//   document.getElementById('invDate').textContent = new Date().toLocaleString();

//   const tbody = document.getElementById('invItems');
//   tbody.innerHTML = '';
//   let subtotal = 0;
//   items.forEach((item, i) => {
//     const total = item.qty * item.rate;
//     subtotal += total;
//     const tr = document.createElement('tr');
//     tr.innerHTML = `
//       <td>${i + 1}</td>
//       <td>${item.name}</td>
//       <td>${item.size || '-'}</td>
//       <td>${item.qty}</td>
//       <td>₹${item.rate.toFixed(2)}</td>
//       <td>₹${total.toFixed(2)}</td>`;
//     tbody.appendChild(tr);
//   });

//   const gst = subtotal * 0.18;
//   const grand = subtotal + gst;
//   document.getElementById('invSubtotal').textContent = `₹${subtotal.toFixed(2)}`;
//   document.getElementById('invGST').textContent = `₹${gst.toFixed(2)}`;
//   document.getElementById('invGrand').textContent = `₹${grand.toFixed(2)}`;
// }

// // ====== Download Invoice PDF ======
// async function downloadInvoicePDF() {
//   const pdfBlob = await generateInvoicePDF();
//   const url = URL.createObjectURL(pdfBlob);
//   const a = document.createElement('a');
//   a.href = url;
//   a.download = `Invoice-${Date.now()}.pdf`;
//   a.click();
//   URL.revokeObjectURL(url);

//   // ✅ Do NOT close modal here
//   alert('Invoice PDF downloaded successfully!');
// }

// // ====== Share Invoice ======
// async function shareInvoice() {
//   const pdfBlob = await generateInvoicePDF();
//   const filename = `Invoice-${Date.now()}.pdf`;

//   const name = document.getElementById('invoiceCustomerName').value;
//   const phone = document.getElementById('invoiceCustomerPhone').value;
//   const email = document.getElementById('invoiceCustomerEmail').value;

//   const file = new File([pdfBlob], filename, { type: 'application/pdf' });

//   // 1️⃣ Try native share (works on Android Chrome)
//   if (navigator.canShare && navigator.canShare({ files: [file] })) {
//     await navigator.share({
//       files: [file],
//       title: 'Your School Invoice',
//       text: `Dear ${name},\nThank you for your purchase! Here is your invoice.`
//     });
//     alert('Invoice shared successfully!');
//     return;
//   }

//   // 2️⃣ Fallback to WhatsApp or Email
//   const message = encodeURIComponent(
//     `Dear ${name},\nThank you for your purchase! Your invoice (${filename}) has been generated.`
//   );

//   if (phone) {
//     const waLink = `https://wa.me/${phone.replace(/\D/g, '')}?text=${message}`;
//     window.open(waLink, '_blank');
//   } else if (email) {
//     const mailto = `mailto:${email}?subject=Your Invoice&body=${message}`;
//     window.location.href = mailto;
//   } else {
//     alert('No phone or email available to share invoice.');
//   }
// }


// OUTWARD FORM FEATURE UPDATE - ADD TO CART -----------



// Update to "Add to Cart" Feature ... 19 October, 2025

let cartItems = [];

// Load cart from localStorage on page load
window.addEventListener('load', () => {
  const savedCart = localStorage.getItem('cartItems');
  if (savedCart) {
    cartItems = JSON.parse(savedCart);
    renderCart();
    if (cartItems.length > 0) {
      document.getElementById('cartSection').style.display = 'block';
      document.getElementById('generateInvoiceBtn').disabled = false;
    }
  }
});

// Save cart to localStorage
function saveCart() {
  localStorage.setItem('cartItems', JSON.stringify(cartItems));
}

// Add item to cart
document.getElementById('addItemBtn').addEventListener('click', function () {
  const type = document.getElementById('outwardDressType').value;
  const color = document.getElementById('outwardDressColor').value;
  const size = document.getElementById('outwardDressSize').value;
  const qty = parseInt(document.getElementById('outwardQuantity').value);
  const rate = parseFloat(document.getElementById('outwardSellingRate').value);
  const discount = parseFloat(document.getElementById('discount').value) || 0;
  const remark = document.getElementById('outwardRemark')?.value?.trim() || "";

  // Validate fields
  if (!type || !color || !size || !qty || !rate) {
    alert('Please fill all required fields before adding item.');
    return;
  }

  const availableText = document.getElementById('availableStock').textContent;
  const availableQty = parseInt(availableText.replace(/\D/g, '')) || 0;
  if (qty > availableQty) {
    alert(`You cannot sell more than available stock (${availableQty}).`);
    return;
  }

  const total = (qty * rate) - discount;

  // Include remark in item object
  cartItems.push({ type, color, size, qty, rate, discount, total, remark });

  renderCart();
  saveCart();

  document.getElementById('cartSection').style.display = 'block';
  document.getElementById('generateInvoiceBtn').disabled = false;

  // ✅ FIX: Clear inputs with null check
  const outwardForm = document.getElementById('outwardForm');
  if (outwardForm) {
    outwardForm.reset();
  } else {
    // Manually clear fields if form doesn't exist
    const typeSelect = document.getElementById('outwardDressType');
    const colorSelect = document.getElementById('outwardDressColor');
    const sizeSelect = document.getElementById('outwardDressSize');
    const qtyInput = document.getElementById('outwardQuantity');
    const rateInput = document.getElementById('outwardSellingRate');
    const discountInput = document.getElementById('discount');
    const remarkInput = document.getElementById('outwardRemark');
    
    if (typeSelect) typeSelect.value = '';
    if (colorSelect) colorSelect.value = '';
    if (sizeSelect) sizeSelect.value = '';
    if (qtyInput) qtyInput.value = '';
    if (rateInput) rateInput.value = '';
    if (discountInput) discountInput.value = '';
    if (remarkInput) remarkInput.value = '';
  }
  
  document.getElementById('availableStock').textContent = 'Available stock: —';
});


// Render cart
function renderCart() {
  const tbody = document.querySelector('#cartTable tbody');
  tbody.innerHTML = '';

  cartItems.forEach((item, index) => {
    const row = `
      <tr>
        <td>${item.type}</td>
        <td>${item.color}</td>
        <td>${item.size}</td>
        <td>${item.qty}</td>
        <td>₹${item.rate.toFixed(2)}</td>
        <td>₹${item.discount.toFixed(2)}</td>
        <td>₹${item.total.toFixed(2)}</td>
        <td>${item.remark || '—'}</td> <!-- ✅ show remark -->
        <td><button onclick="removeCartItem(${index})">🗑️</button></td>
      </tr>
    `;
    tbody.insertAdjacentHTML('beforeend', row);
  });

  saveCart();
}

// Remove item from cart
function removeCartItem(index) {
  cartItems.splice(index, 1);
  renderCart();
  saveCart();

  if (cartItems.length === 0) {
    document.getElementById('cartSection').style.display = 'none';
    document.getElementById('generateInvoiceBtn').disabled = true;
  }
}

// Update inventory after sale
// function updateInventoryAfterSale() {
//   cartItems.forEach(item => {
//     const matchingItems = inventory
//       .filter(invItem =>
//         invItem.type === item.type &&
//         invItem.color === item.color &&
//         invItem.size === item.size
//       )
//       .sort((a, b) => a.inwardRate - b.inwardRate);

//     let qtyToDeduct = item.qty;

//     for (let inv of matchingItems) {
//       if (qtyToDeduct <= 0) break;

//       if (inv.quantity >= qtyToDeduct) {
//         inv.quantity -= qtyToDeduct;
//         qtyToDeduct = 0;
//       } else {
//         qtyToDeduct -= inv.quantity;
//         inv.quantity = 0;
//       }

//       inv.lastUpdated = new Date().toISOString();
//       inv.totalValue = inv.quantity * inv.inwardRate;
//     }
//   });

//   localStorage.setItem('inventory', JSON.stringify(inventory));
// }

// ✅ Optional: Ask for internal invoice remark before invoice generation
function getInternalInvoiceRemark() {
  const remark = prompt("Enter internal remark for this invoice (not visible to customer):");
  if (remark) {
    localStorage.setItem('internalInvoiceRemark', remark);
  } else {
    localStorage.removeItem('internalInvoiceRemark');
  }
  return remark;
}


// === Customer Details Modal Logic ===

// Modal elements
const customerModal = document.getElementById('customerModal');
const closeBtn = document.querySelector('.closeBtn');
const confirmCustomerBtn = document.getElementById('confirmCustomerBtn');

// 🧾 Step 1: Show popup when "Generate Invoice" clicked
document.getElementById('generateInvoiceBtn').addEventListener('click', function () {
  if (cartItems.length === 0) {
    alert('No recent sales data found.');
    return;
  }
  customerModal.style.display = 'block';
});

// Step 2: Close popup when clicking on × or outside
closeBtn.addEventListener('click', () => {
  customerModal.style.display = 'none';
});
window.addEventListener('click', (e) => {
  if (e.target === customerModal) {
    customerModal.style.display = 'none';
  }
});

// Step 3: Confirm customer → generate invoice
confirmCustomerBtn.addEventListener('click', async () => {
  const customerName = document.getElementById("customerName").value.trim();
  const customerMobile = document.getElementById("customerMobile").value.trim();
  const customerEmail = document.getElementById("customerEmail").value.trim();

  if (!customerName) {
    alert("Please enter customer name.");
    return;
  }
  if (!customerMobile && !customerEmail) {
    alert("Provide either mobile number or email.");
    return;
  }

  customerModal.style.display = 'none';

  // ✅ STEP 1: Process all cart items through backend
  try {
    console.log('📤 Processing cart with', cartItems.length, 'items...');
    
    for (const item of cartItems) {
      const res = await fetch('https://school-dress-inventory-production.up.railway.app/api/inventory/outward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: item.type,
          color: item.color,
          size: item.size,
          quantity: item.qty,
          sellingRate: item.rate,
          discount: item.discount,
          remark: item.remark || ''
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to process sale');
      }

      console.log('✅ Processed:', item.type, item.color, item.size);
    }

    // ✅ STEP 2: Reload data from backend
    await loadInventory();
    await loadTransactions();

    // ✅ STEP 3: Update all views
    updateDashboardMetrics();
    updateInventoryList();
    updateStockView();
    updateStockChart();
    displayHistory();

    // ✅ STEP 4: Generate and show invoice
    const template = document.getElementById('invoiceTemplate').cloneNode(true);
    template.style.display = "block";
    template.querySelector('#custNameDisplay').textContent = customerName;
    template.querySelector('#custMobileDisplay').textContent = customerMobile || "—";
    template.querySelector('#custEmailDisplay').textContent = customerEmail || "—";
    template.querySelector('#invoiceDate').textContent = new Date().toLocaleDateString();

    const grandTotal = cartItems.reduce((sum, item) => sum + item.total, 0);

    const tableHTML = `
      <thead>
        <tr style="background:#1f2e88;color:white;text-align:center;">
          <th>Dress Type</th><th>Color</th><th>Size</th>
          <th>Quantity</th><th>Rate</th><th>Discount</th><th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${cartItems.map(item => `
          <tr style="text-align:center;">
            <td>${item.type}</td><td>${item.color}</td><td>${item.size}</td>
            <td>${item.qty}</td><td>₹${item.rate.toFixed(2)}</td>
            <td>₹${item.discount.toFixed(2)}</td><td>₹${item.total.toFixed(2)}</td>
          </tr>`).join('')}
      </tbody>
    `;
    template.querySelector('#invoiceTable').innerHTML = tableHTML;

    const invoiceHTML = `
      <html>
      <head>
        <title>Invoice</title>
        <style>
          body {
            font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
            background: #f9fbff;
            margin: 20px;
            color: #333;
          }
          .invoice-container {
            max-width: 750px;
            margin: auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
            padding: 30px;
          }
          .shop-header {
            text-align: center;
            border-bottom: 3px solid #1f2e88;
            padding-bottom: 15px;
            margin-bottom: 25px;
          }
          .shop-logo {
            font-size: 32px;
            font-weight: bold;
            color: #1f2e88;
            margin-bottom: 5px;
          }
          .shop-address {
            font-size: 14px;
            color: #666;
            line-height: 1.6;
          }
          h1 {
            color: #1f2e88;
            text-align: center;
            margin-bottom: 20px;
            font-size: 24px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
          }
          th, td {
            padding: 10px;
            border-bottom: 1px solid #ddd;
          }
          th {
            background: #1f2e88;
            color: white;
          }
          tr:last-child td { border-bottom: none; }
          .total-summary {
            background: linear-gradient(135deg, #1f2e88 0%, #2b4eff 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            margin-top: 25px;
            text-align: right;
          }
          .total-summary .label {
            font-size: 18px;
            font-weight: normal;
            margin-bottom: 5px;
          }
          .total-summary .amount {
            font-size: 32px;
            font-weight: bold;
          }
          .invoice-footer {
            text-align: center;
            margin-top: 30px;
            color: #555;
            font-size: 14px;
          }
          .btn-container {
            display: flex;
            justify-content: center;
            gap: 15px;
            margin-top: 25px;
          }
          button {
            background: #1f2e88;
            color: white;
            border: none;
            border-radius: 8px;
            padding: 10px 18px;
            cursor: pointer;
            font-size: 14px;
            transition: 0.3s;
          }
          button:hover { background: #2b4eff; }
          .btn-share {
            background: #2ecc71;
          }
          .btn-share:hover {
            background: #27ae60;
          }
        </style>
      </head>
      <body>
        <div class="invoice-container" id="invoiceContent">
          <div class="shop-header">
            <div class="shop-logo">🏪 RP Uppal Hosiery</div>
            <div class="shop-address">
              St. No. 1, Surinder Nagar, Gandhi Nagar, Ludhiana<br>
              Punjab - 141008<br>
              Phone: +91 7678668848 | Email: sachinavi_2000@yahoo.com
            </div>
          </div>
          <h1>🧾 Tax Invoice</h1>
          <p><strong>Customer Name:</strong> ${customerName}</p>
          <p><strong>Mobile:</strong> ${customerMobile || "—"}</p>
          <p><strong>Email:</strong> ${customerEmail || "—"}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          ${template.querySelector('#invoiceTable').outerHTML}
          <div class="total-summary">
            <div class="label">Grand Total</div>
            <div class="amount">₹${grandTotal.toFixed(2)}</div>
          </div>
          <div class="btn-container">
            <button id="downloadBtn">⬇️ Download PDF</button>
            <button id="shareBtn" class="btn-share">📤 Share Invoice</button>
          </div>
          <div class="invoice-footer">
            <p>Thank you for your purchase!<br>© ${new Date().getFullYear()} RP Uppal Hosiery</p>
          </div>
        </div>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
        <script>
          const { jsPDF } = window.jspdf;
          async function generatePDF() {
              const invoice = document.getElementById('invoiceContent');
              const btnContainer = document.querySelector('.btn-container');
              btnContainer.style.visibility = 'hidden';
              await new Promise(resolve => setTimeout(resolve, 100));
              const canvas = await html2canvas(invoice, { scale: 2, useCORS: true });
              const imgData = canvas.toDataURL('image/png');
              btnContainer.style.visibility = 'visible';
              const pdf = new jsPDF('p', 'pt', 'a4');
              const pdfWidth = pdf.internal.pageSize.getWidth();
              const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
              pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
              return pdf;
          }
          document.getElementById('downloadBtn').addEventListener('click', async () => {
              const pdf = await generatePDF();
              pdf.save(\`Invoice-\${Date.now()}.pdf\`);
          });
          document.getElementById('shareBtn').addEventListener('click', async () => {
              const pdf = await generatePDF();
              const blob = pdf.output('blob');
              const file = new File([blob], \`Invoice-\${Date.now()}.pdf\`, { type: 'application/pdf' });
              if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: 'Your Invoice', text: 'Thank you for your purchase!' });
              } else {
                alert('Sharing not supported on this device. Downloading instead.');
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = \`Invoice-\${Date.now()}.pdf\`;
                a.click();
                URL.revokeObjectURL(url);
              }
          });
        </script>
      </body>
      </html>
    `;

    const invoiceWindow = window.open('', '_blank', 'width=900,height=650');
    invoiceWindow.document.write(invoiceHTML);
    invoiceWindow.document.close();

    // ✅ STEP 5: Clear cart
    cartItems = [];
    renderCart();
    localStorage.removeItem('cartItems');
    document.getElementById('cartSection').style.display = 'none';
    document.getElementById('generateInvoiceBtn').disabled = true;

    alert('✅ Invoice generated and all transactions saved to database!');

  } catch (error) {
    console.error('❌ Error processing cart:', error);
    alert('Error processing sales: ' + error.message);
  }
});




// Fetch and show available stock dynamically
// ✅ Fetch and show available stock from actual inventory
// document.getElementById('outwardDressSize').addEventListener('change', function() {
//   const type = document.getElementById('outwardDressType').value;
//   const color = document.getElementById('outwardDressColor').value;
//   const size = this.value;

//   if (type && color && size) {
//     // Find matching item in inventory array
//     const item = inventory.find(i => 
//       i.type === type && 
//       i.color === color && 
//       i.size === size
//     );

//     if (item) {
//       document.getElementById('availableStock').textContent = `Available stock: ${item.quantity}`;
//       document.getElementById('outwardSellingRate').value = item.sellingRate; // Auto-fill selling rate too
//     } else {
//       document.getElementById('availableStock').textContent = `Available stock: 0`;
//       document.getElementById('outwardSellingRate').value = "";
//     }
//   } else {
//     document.getElementById('availableStock').textContent = `Available stock: —`;
//   }
// });

document.getElementById('outwardDressSize').addEventListener('change', function() {
  const type = document.getElementById('outwardDressType').value;
  const color = document.getElementById('outwardDressColor').value;
  const size = this.value;

  if (type && color && size) {
    // Find all matching items (possibly with different rates)
    const matchingItems = inventory.filter(
      i => i.type === type && i.color === color && i.size === size
    );

    if (matchingItems.length > 0) {
      // Sum total available stock
      const totalQty = matchingItems.reduce((sum, i) => sum + (i.quantity || 0), 0);

      // Auto-fill selling rate from first match (you can adjust this logic)
      document.getElementById('availableStock').textContent = `Available stock: ${totalQty}`;
      document.getElementById('outwardSellingRate').value = matchingItems[0].sellingRate || "";
    } else {
      document.getElementById('availableStock').textContent = `Available stock: 0`;
      document.getElementById('outwardSellingRate').value = "";
    }
  } else {
    document.getElementById('availableStock').textContent = `Available stock: —`;
  }
});


// Newer Version for Generate Invoice Button -- 19 October, 2025

// ===== Generate Invoice PDF =====
// ===== Generate Invoice PDF (clean version) =====


// async function generatePDF() {
//   const invoice = document.getElementById('invoiceContent');
//   const btnContainer = document.querySelector('.btn-container');

//   // ✅ Completely remove buttons from layout
//   btnContainer.style.display = 'none';

//   // Wait a frame so the layout refreshes fully before capturing
//   await new Promise((resolve) => requestAnimationFrame(resolve));

//   // Capture invoice as high-quality image
//   const canvas = await html2canvas(invoice, { scale: 2, useCORS: true });
//   const imgData = canvas.toDataURL('image/png');

//   const pdf = new jsPDF('p', 'pt', 'a4');
//   const pdfWidth = pdf.internal.pageSize.getWidth();
//   const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
//   pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

//   // ✅ Restore buttons after capture
//   btnContainer.style.display = 'flex';

//   return pdf;
// }

const { jsPDF } = window.jspdf;
async function generatePDF() {
    const internalRemarkField = document.getElementById('invoiceInternalRemark');
    const internalRemark = internalRemarkField ? internalRemarkField.value.trim() : '';

    // ✅ Save or clear the remark for persistence
    if (internalRemark) {
        localStorage.setItem('lastInternalRemark', internalRemark);
    } else {
        localStorage.removeItem('lastInternalRemark');
    }

    const invoice = document.getElementById('invoiceContent');
    const btnContainer = document.querySelector('.btn-container');
    if (btnContainer) btnContainer.style.display = 'none';

    // Hide buttons via CSS
    btnContainer?.classList.add('hide-for-export');

    // Wait two frames for layout to update before screenshot
    await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
    );

    // ✅ Capture invoice as high-quality image
    const canvas = await html2canvas(invoice, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL('image/png');

    const pdf = new jsPDF('p', 'pt', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

    // ✅ Add internal remark on a separate admin-only page (not customer-facing)
    if (internalRemark) {
        pdf.addPage();
        pdf.setFontSize(14);
        pdf.setTextColor(40, 40, 40);
        pdf.text('Internal Remark (Admin Use Only):', 40, 60);
        pdf.setFontSize(12);
        const remarkLines = pdf.splitTextToSize(internalRemark, pdfWidth - 80);
        pdf.text(remarkLines, 40, 90);
    }

    // ✅ Restore visibility
    btnContainer?.classList.remove('hide-for-export');
    if (btnContainer) btnContainer.style.display = 'flex';

    // ✅ Push the transaction to history just before returning PDF
    if (window.lastSaleData) {
        transactions.push({
            id: 'TXN' + Date.now(),
            type: 'outward',
            item: lastSaleData.item,
            quantity: lastSaleData.quantity,
            rate: lastSaleData.rate,
            total: lastSaleData.finalTotal,
            date: new Date().toISOString(),
            remark: internalRemark,
            customerName: document.getElementById('invoiceCustomerName')?.value || "",
            customerPhone: document.getElementById('invoiceCustomerPhone')?.value || "",
            customerEmail: document.getElementById('invoiceCustomerEmail')?.value || ""
        });
        displayHistory(); // Or filterHistory(), whichever you use to refresh history
    }

    return pdf;
}



// ===== Download Invoice PDF =====
document.getElementById('downloadBtn').addEventListener('click', async () => {
  const pdf = await generatePDF();
  pdf.save(`Invoice-${Date.now()}.pdf`);
});

// ===== Share Invoice over WhatsApp =====
document.getElementById('shareBtn').addEventListener('click', async () => {
  const pdf = await generatePDF();
  const blob = pdf.output('blob');
  const filename = `Invoice-${Date.now()}.pdf`;

  const name = document.getElementById('invoiceCustomerName').value || 'Customer';
  const phone = document.getElementById('invoiceCustomerPhone').value;
  const email = document.getElementById('invoiceCustomerEmail').value;

  // Try WhatsApp if phone number exists
  if (phone) {
    const cleanPhone = phone.replace(/\D/g, '');
    const message = encodeURIComponent(
      `Hello ${name},%0AThank you for your purchase! 😊%0AYour invoice is attached: ${filename}%0A`
    );
    const waLink = `https://wa.me/${cleanPhone}?text=${message}`;

    // Save locally first (since auto-attachment is not possible on web)
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    // Open WhatsApp message
    window.open(waLink, '_blank');
    return;
  }

  // Fallback: if email exists
  if (email) {
    const message = encodeURIComponent(
      `Dear ${name},\nThank you for your purchase! Your invoice (${filename}) is attached.`
    );
    const mailto = `mailto:${email}?subject=Your Invoice&body=${message}`;
    window.location.href = mailto;
    return;
  }

  alert('⚠️ No phone or email available to share invoice.');
});

// ===== Fill Invoice Template =====
function fillInvoiceTemplate() {
  const name = document.getElementById('invoiceCustomerName').value || 'Customer';
  const phone = document.getElementById('invoiceCustomerPhone').value || 'N/A';
  const email = document.getElementById('invoiceCustomerEmail').value || 'N/A';
  const items = window.cartItems || [];

  // New: internal/global remark for this invoice (not shown to customer)
  const internalRemark = document.getElementById('invoiceInternalRemark')?.value || '';

  // Fill customer details
  document.getElementById('invCustomerName').textContent = name;
  document.getElementById('invCustomerPhone').textContent = phone;
  document.getElementById('invCustomerEmail').textContent = email;
  document.getElementById('invNumber').textContent = `INV-${Date.now().toString().slice(-5)}`;
  document.getElementById('invDate').textContent = new Date().toLocaleString();

  const tbody = document.getElementById('invItems');
  tbody.innerHTML = '';
  let subtotal = 0;

  // Build item rows
  items.forEach((item, i) => {
    subtotal += item.total;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="padding:6px;border:1px solid #ddd;">${i + 1}</td>
      <td style="padding:6px;border:1px solid #ddd;">${item.type} - ${item.color}</td>
      <td style="padding:6px;border:1px solid #ddd;">${item.size}</td>
      <td style="padding:6px;border:1px solid #ddd;">${item.qty}</td>
      <td style="padding:6px;border:1px solid #ddd;">₹${item.rate.toFixed(2)}</td>
      <td style="padding:6px;border:1px solid #ddd;">₹${item.discount.toFixed(2)}</td>
      <td style="padding:6px;border:1px solid #ddd;">₹${item.total.toFixed(2)}</td>
    `;

    // Optional: store internal remark (not visible)
    if (item.remark) {
      tr.dataset.remark = item.remark; // only stored internally
    }

    tbody.appendChild(tr);
  });

  // Compute totals
  const gst = subtotal * 0.18;
  const grand = subtotal + gst;
  document.getElementById('invSubtotal').textContent = `₹${subtotal.toFixed(2)}`;
  document.getElementById('invGST').textContent = `₹${gst.toFixed(2)}`;
  document.getElementById('invGrand').textContent = `₹${grand.toFixed(2)}`;

  // Save internal data for backend sync
  window.generatedInvoice = {
    customer: { name, phone, email },
    items,
    subtotal,
    gst,
    grand,
    internalRemark, // invoice-level remark
    date: new Date().toISOString(),
    invoiceNumber: document.getElementById('invNumber').textContent
  };
}

// Update History Section to view details of orders 

function showTransactionDetails(transactionId) {
    const transaction = transactions.find(t => t.id.toString() === transactionId.toString());
    
    if (!transaction) {
        showMessage('Transaction not found', 'error');
        return;
    }
    
    // Create modal content
    const itemDisplay = transaction.item 
        ? (typeof transaction.item === 'string' 
            ? transaction.item 
            : `${transaction.item.type || ''} ${transaction.item.color || ''} ${transaction.item.size || ''}`)
        : 'N/A';
    
    const quantity = parseInt(transaction.quantity) || 0;
    const rate = parseFloat(transaction.rate) || 0;
    const discount = parseFloat(transaction.discount) || 0;
    const total = parseFloat(transaction.total) || (quantity * rate);
    const netTotal = parseFloat(transaction.netTotal) || (total - discount);
    
    const modalContent = `
        <div class="transaction-detail-modal">
            <h3>${transaction.type === 'inward' ? '📥 Inward Transaction' : '📤 Outward Transaction'}</h3>
            
            <div class="detail-section">
                <h4>Transaction Details</h4>
                <div class="detail-row">
                    <span>Transaction ID:</span>
                    <strong>${transaction.id}</strong>
                </div>
                <div class="detail-row">
                    <span>Date & Time:</span>
                    <strong>${new Date(transaction.date).toLocaleString('en-IN')}</strong>
                </div>
                <div class="detail-row">
                    <span>Type:</span>
                    <strong class="${transaction.type}">${transaction.type.toUpperCase()}</strong>
                </div>
            </div>
            
            <div class="detail-section">
                <h4>Item Details</h4>
                <div class="detail-row">
                    <span>Item:</span>
                    <strong>${itemDisplay}</strong>
                </div>
                <div class="detail-row">
                    <span>Quantity:</span>
                    <strong>${quantity}</strong>
                </div>
                <div class="detail-row">
                    <span>Rate:</span>
                    <strong>₹${rate.toFixed(2)}</strong>
                </div>
                ${transaction.type === 'inward' && transaction.item?.inwardRate ? `
                <div class="detail-row">
                    <span>Inward Rate:</span>
                    <strong>₹${parseFloat(transaction.item.inwardRate).toFixed(2)}</strong>
                </div>
                <div class="detail-row">
                    <span>Selling Rate:</span>
                    <strong>₹${parseFloat(transaction.item.sellingRate).toFixed(2)}</strong>
                </div>
                ` : ''}
                ${transaction.barcode ? `
                <div class="detail-row">
                    <span>Barcode:</span>
                    <strong>${transaction.barcode}</strong>
                </div>
                ` : ''}
            </div>
            
            <div class="detail-section">
            <h4>Financial Details</h4>
            <div class="detail-row">
                <span>Subtotal:</span>
                <strong>₹${total.toFixed(2)}</strong>
            </div>
            ${discount > 0 ? `
                <div class="detail-row">
                <span>Discount:</span>
                <strong class="text-error">- ₹${discount.toFixed(2)}</strong>
                </div>
            ` : ''}
            <div class="detail-row total-row">
                <span>Net Total:</span>
                <strong>₹${netTotal.toFixed(2)}</strong>
            </div>
            // To show profit per order
            ${transaction.type === 'outward' ? (() => {
                // Compute profit dynamically if not already present
                const inwardRate = parseFloat(transaction.item?.inwardRate) || 0;
                const outwardRate = parseFloat(transaction.rate) || 0;
                const qty = parseFloat(transaction.quantity) || 0;
                const discountAmt = parseFloat(transaction.discount) || 0;
                const computedProfit = (qty * outwardRate) - (qty * inwardRate) - discountAmt;

                const profitToShow = transaction.profit !== undefined
                    ? parseFloat(transaction.profit)
                    : computedProfit;

                return `
                    <div class="detail-row">
                        <span>Profit Earned:</span>
                        <strong class="text-success">₹${profitToShow.toFixed(2)}</strong>
                    </div>
                `;
            })() : ''}
            </div>

            ${transaction.remark ? `
            <div class="detail-section">
                <h4>Remarks</h4>
                <div class="remark-box">${transaction.remark}</div>
            </div>
            ` : ''}
        </div>
    `;
    
    // Show in modal
    showCustomModal('Transaction Details', modalContent);
}

// Helper function for custom modal
function showCustomModal(title, content) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('transactionDetailModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'transactionDetailModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <span class="modal-close" onclick="closeTransactionDetailModal()">&times;</span>
                <div id="transactionDetailContent"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    document.getElementById('transactionDetailContent').innerHTML = content;
    modal.style.display = 'flex';
}

function closeTransactionDetailModal() {
    const modal = document.getElementById('transactionDetailModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

document.getElementById('historyList').addEventListener('click', (event) => {
  const historyItem = event.target.closest('.history-item');
  if (!historyItem) return;

  const id = historyItem.getAttribute('data-id');
  if (id) {
    showTransactionDetails(id);
  }
});

