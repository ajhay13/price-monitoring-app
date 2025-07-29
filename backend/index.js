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
        // Look for lines in all caps or with keywords
        if (/rice|vegetable|fruit|fish|meat|egg|spice|sugar|other|commodity|poultry|livestock|summary/i.test(catLine) && catLine.length < 60) {
          category = catLine.replace(/:|\*/g, '').trim();
          break;
        }
      }
      // Find next table header (MARKET ...)
      let headerIdx = lines.slice(i).findIndex(l => l.toUpperCase().startsWith('MARKET'));
      if (headerIdx === -1) break;
      headerIdx += i;
      const headerLine = lines[headerIdx];
      const headerParts = headerLine.split(/\s{2,}/).map(h => h.trim()).filter(h => h);
      if (headerParts.length < 2) { i = headerIdx + 1; continue; }
      const commodities = headerParts.slice(1);
      // Parse each market row until a non-table line or next table header is found
      const markets = [];
      let j = headerIdx + 1;
      for (; j < lines.length; j++) {
        const row = lines[j];
        if (/^Source:|^Note:|^\*/i.test(row)) break;
        if (row.toUpperCase().startsWith('MARKET')) break;
        // Split row by 2+ spaces (table columns)
        const cols = row.split(/\s{2,}/).map(c => c.trim());
        if (cols.length < 2) continue;
        // Market name and city (if any)
        let [marketCol, ...priceCols] = cols;
        let market = marketCol;
        let city = '';
        if (marketCol.includes('/')) {
          [market, city] = marketCol.split('/').map(s => s.trim());
        }
        // Map prices to commodities
        const prices = [];
        for (let k = 0; k < commodities.length && k < priceCols.length; k++) {
          let priceText = priceCols[k];
          let low = null, high = null;
          if (/not available/i.test(priceText)) {
            low = high = null;
          } else if (priceText.includes('-')) {
            [low, high] = priceText.split('-').map(s => parseFloat(s.replace(/[^\d.]/g, '')));
          } else {
            low = high = parseFloat(priceText.replace(/[^\d.]/g, ''));
          }
          prices.push({
            commodity: commodities[k],
            low,
            high
          });
        }
        markets.push({
          market,
          city,
          prices
        });
      }
      tables.push({
        category,
        commodities,
        markets
      });
      i = j + 1;
    }
    const priceData = {
      date: latest.date.toISOString().slice(0, 10),
      url: latest.url,
      tables,
      rawText: data.text // Keep for debugging, can remove later
    };
    await db.collection('dailypricereport').add(priceData);
    res.json({ success: true, message: 'Latest daily price PDF parsed and stored.', priceData });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// SAMPLE DOCUMENT STRUCTURE (for reference):
// {
//   date: "2025-07-26",
//   url: "https://www.da.gov.ph/wp-content/uploads/2025/07/Price-Monitoring-July-26-2025.pdf",
//   tables: [
//     {
//       category: "Vegetables",
//       commodities: ["Eggplant", "Tomato", ...],
