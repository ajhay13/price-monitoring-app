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
    await db.collection('prices').add(priceData);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating prices:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to get latest prices
app.get('/getLatestPrices', async (req, res) => {
  const snapshot = await db.collection('prices').orderBy('timestamp', 'desc').limit(1).get();
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
