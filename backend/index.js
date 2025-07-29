// Utility to format date as 'July-26-2025'
function formatDateForUrl(date) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${month}-${day < 10 ? '0' + day : day}-${year}`;
}

// Try to fetch the latest available PDF (today, or previous days)
async function getLatestAvailablePdfUrl(fetchFn, maxDaysBack = 7) {
  let date = new Date();
  for (let i = 0; i < maxDaysBack; i++) {
    const url = `https://www.da.gov.ph/wp-content/uploads/${date.getFullYear()}/${('0'+(date.getMonth()+1)).slice(-2)}/Price-Monitoring-${formatDateForUrl(date)}.pdf`;
    const headResp = await fetchFn(url, { method: 'HEAD' });
    if (headResp.ok) {
      return { url, date: new Date(date) };
    }
    date.setDate(date.getDate() - 1);
  }
  return null;
}


const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

const pdf = require('pdf-parse');

// Initialize Firebase Admin SDK
// Place your serviceAccountKey.json in the backend folder and do NOT commit it
admin.initializeApp({
  credential: admin.credential.applicationDefault()
});

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint to update prices (dummy implementation)
app.post('/updatePrices', async (req, res) => {
  try {
    const priceData = req.body;
    await db.collection('dailypricereport').add(priceData);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating prices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to get latest prices
app.get('/getLatestPrices', async (req, res) => {
  const snapshot = await db.collection('dailypricereport').orderBy('timestamp', 'desc').limit(1).get();
  const prices = snapshot.docs.map(doc => doc.data());
  res.json(prices[0] || {});
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Endpoint to fetch and parse the provided PDF
app.get('/parse-sample-pdf', async (req, res) => {
  const pdfUrl = 'https://www.da.gov.ph/wp-content/uploads/2025/07/Daily-Price-Index-July-27-2025.pdf';
  try {
    // Use global fetch if available, otherwise dynamically import node-fetch
    let fetchFn = global.fetch;
    if (!fetchFn) {
      fetchFn = (await import('node-fetch')).default;
    }
    const response = await fetchFn(pdfUrl);
    const buffer = await response.arrayBuffer ? Buffer.from(await response.arrayBuffer()) : await response.buffer();
    const data = await pdf(buffer);
    res.send(data.text); // For now, just return the raw extracted text
  } catch (err) {
    res.status(500).send('Error parsing PDF: ' + err.message);
  }
});

// Endpoint to check, parse, and store the latest available Daily Retail Price Range PDF
app.post('/update-latest-daily-prices', async (req, res) => {
  try {
    let fetchFn = global.fetch;
    if (!fetchFn) {
      fetchFn = (await import('node-fetch')).default;
    }
    const latest = await getLatestAvailablePdfUrl(fetchFn, 7);
    if (!latest) {
      return res.status(404).json({ success: false, error: 'No recent Daily Retail Price PDF found.' });
    }
    const response = await fetchFn(latest.url);
    const buffer = await response.arrayBuffer ? Buffer.from(await response.arrayBuffer()) : await response.buffer();
    const data = await pdf(buffer);
    // Expanded structured parsing for all market-based tables
    const lines = data.text.split('\n').map(l => l.trim()).filter(l => l);
    const tables = [];
    let i = 0;
    while (i < lines.length) {
      // Try to find a category/section title above the table header
      let category = '';
      for (let lookback = i - 1; lookback >= 0 && lookback >= i - 4; lookback--) {
        const catLine = lines[lookback] || '';
        if (/rice|vegetable|fruit|fish|meat|egg|spice|sugar|other|commodity|poultry|livestock|summary/i.test(catLine) && catLine.length < 60) {
          category = catLine.replace(/:|\*/g, '').trim();
          break;
        }
      }

      // Always attempt to extract a market-based table from the raw text using known market names
      // Build a list of known market names (from the PDF, or use a static list for NCR)
      const knownMarkets = [
        'Agora Public Market/San Juan',
        'Balintawak (Cloverleaf) Market',
        'Cartimar Market',
        'Commonwealth Market/Quezon City',
        'Dagonoy Market',
        'Guadalupe Public Market/Makati',
        'Kamuning Public Market',
        'La Huerta Market/Parañaque',
        'New Las Piñas City Public Market',
        'Mandaluyong Public Market',
        'Marikina Public Market',
        'Mega Q-mart/Quezon City',
        'Pamilihang Lungsod ng Muntinlupa',
        'Muñoz Market/Quezon City',
        'Murphy Public Market',
        'Navotas Agora Market',
        'New Marulas Public Market/Valenzuela',
        'Obrero Market',
        'Paco Market',
        'Pasay City Market',
        'Pasig City Mega Market',
        'Pateros Market',
        'Pritil Market/Manila',
        'Quinta Market/Manila',
        'San Andres Market/Manila',
        'Trabajo Market'
      ];

      // Try to find a market-based table header (MARKET ...)
      let headerIdx = lines.findIndex(l => l.toUpperCase().startsWith('MARKET'));
      let commodities = [];
      if (headerIdx !== -1) {
        let headerLine = lines[headerIdx];
        let headerParts = headerLine.split(/\s{2,}/).map(h => h.trim()).filter(h => h);
        if (headerParts.length < 2) {
    const lines = data.text.split('\n').map(l => l.trim()).filter(l => l);
    const tables = [];
    const knownMarkets = [
      'Agora Public Market/San Juan',
      'Balintawak (Cloverleaf) Market',
      'Cartimar Market',
      'Commonwealth Market/Quezon City',
      'Dagonoy Market',
      'Guadalupe Public Market/Makati',
      'Kamuning Public Market',
      'La Huerta Market/Parañaque',
      'New Las Piñas City Public Market',
      'Mandaluyong Public Market',
      'Marikina Public Market',
      'Mega Q-mart/Quezon City',
      'Pamilihang Lungsod ng Muntinlupa',
      'Muñoz Market/Quezon City',
      'Murphy Public Market',
      'Navotas Agora Market',
      'New Marulas Public Market/Valenzuela',
      'Obrero Market',
      'Paco Market',
      'Pasay City Market',
      'Pasig City Mega Market',
      'Pateros Market',
      'Pritil Market/Manila',
      'Quinta Market/Manila',
      'San Andres Market/Manila',
      'Trabajo Market'
    ];

    // Parse all market-based tables
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toUpperCase().startsWith('MARKET')) {
        // Try to find a category/section title above the table header
        let category = '';
        for (let lookback = i - 1; lookback >= 0 && lookback >= i - 4; lookback--) {
          const catLine = lines[lookback] || '';
          if (/rice|vegetable|fruit|fish|meat|egg|spice|sugar|other|commodity|poultry|livestock|summary/i.test(catLine) && catLine.length < 60) {
            category = catLine.replace(/:|\*/g, '').trim();
            break;
          }
        }
        // Extract commodities from header line
        let headerLine = lines[i];
        let headerParts = headerLine.split(/\s{2,}/).map(h => h.trim()).filter(h => h);
        if (headerParts.length < 2) {
          headerParts = headerLine.split(/\s+/).map(h => h.trim()).filter(h => h);
        }
        const commodities = headerParts.slice(1);
        // Parse table rows until next header or end
        const markets = [];
        for (let j = i + 1; j < lines.length; j++) {
          const row = lines[j];
          if (/^Source:|^Note:|^\*/i.test(row)) break;
          if (row.toUpperCase().startsWith('MARKET') || row.toUpperCase().startsWith('COMMODITIES')) break;
          // Find if row starts with a known market
          let matchedMarket = knownMarkets.find(mkt => row.startsWith(mkt));
          if (!matchedMarket) continue;
          // Remove market name from row, get price columns
          let pricePart = row.replace(matchedMarket, '').trim();
          // Split price columns by 2+ spaces, fallback to 1+ space
          let priceCols = pricePart.split(/\s{2,}/).map(c => c.trim()).filter(c => c);
          if (priceCols.length < commodities.length) {
            priceCols = pricePart.split(/\s+/).map(c => c.trim()).filter(c => c);
          }
          // If there are more price columns than commodities, trim
          if (priceCols.length > commodities.length) priceCols = priceCols.slice(0, commodities.length);
          // If there are fewer, pad with nulls
          while (priceCols.length < commodities.length) priceCols.push(null);
          const prices = [];
          for (let k = 0; k < commodities.length; k++) {
            let priceText = priceCols[k];
            let low = null, high = null;
            if (!priceText) {
              low = high = null;
            } else if (priceText.includes('-')) {
              [low, high] = priceText.split('-').map(s => parseFloat(s));
            } else {
              low = high = parseFloat(priceText);
            }
            prices.push({
              commodity: commodities[k],
              low,
              high
            });
          }
          let market = matchedMarket;
          let city = '';
          if (matchedMarket.includes('/')) {
            [market, city] = matchedMarket.split('/').map(s => s.trim());
          }
          markets.push({
            market,
            city,
            prices
          });
        }
        if (commodities.length > 0 && markets.length > 0) {
          tables.push({
            type: 'market',
            category,
            commodities,
            markets
          });
        }
      }
    }

    // Parse commodity-based table (if any)
    let headerIdx2 = lines.findIndex(l => l.toUpperCase().startsWith('COMMODITIES'));
    if (headerIdx2 !== -1) {
      let headerLine = lines[headerIdx2];
      let headerParts = headerLine.split(/\s{2,}/).map(h => h.trim()).filter(h => h);
      if (headerParts.length < 2) {
        headerParts = headerLine.split(/\s+/).map(h => h.trim()).filter(h => h);
      }
      // Find the column indices for each field
      const colIdx = {
        name: headerParts.findIndex(h => /commodities?/i.test(h)),
        low: headerParts.findIndex(h => /low/i.test(h)),
        high: headerParts.findIndex(h => /high/i.test(h)),
        prevailing: headerParts.findIndex(h => /prevailing/i.test(h)),
        average: headerParts.findIndex(h => /average/i.test(h)),
      };
      const commodities2 = [];
      let j = headerIdx2 + 1;
      for (; j < lines.length; j++) {
        const row = lines[j];
        if (/^Source:|^Note:|^\*/i.test(row)) break;
        if (row.toUpperCase().startsWith('MARKET') || row.toUpperCase().startsWith('COMMODITIES')) break;
        // Split row by 2+ spaces, fallback to 1+ space
        let cols = row.split(/\s{2,}/).map(c => c.trim()).filter(c => c);
        if (cols.length < 2) {
          cols = row.split(/\s+/).map(c => c.trim()).filter(c => c);
        }
        if (cols.length < 2) continue;
        // If the first column is empty or not a commodity name, skip
        if (!cols[colIdx.name] || /low|high|prevailing|average/i.test(cols[colIdx.name])) continue;
        // Parse values
        const getNum = (idx) => {
          if (idx === -1 || !cols[idx]) return null;
          const val = parseFloat(cols[idx].replace(/[^\d.\-]/g, ''));
          return isNaN(val) ? null : val;
        };
        commodities2.push({
          name: cols[colIdx.name],
          low: getNum(colIdx.low),
          high: getNum(colIdx.high),
          prevailing: getNum(colIdx.prevailing),
          average: getNum(colIdx.average)
        });
      }
      if (commodities2.length > 0) {
        tables.push({
          type: 'commodity',
          category: '',
          commodities: commodities2
        });
      }
    }
            category,
