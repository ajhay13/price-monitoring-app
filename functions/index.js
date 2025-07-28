const express = require("express");
const admin = require("firebase-admin");
// Fix fetch import for Node.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const pdfParse = require("pdf-parse");
require("dotenv").config();

const app = express();

admin.initializeApp({
  credential: admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS),
});
const db = admin.firestore();

/**
 * Gets the latest PDF URL from the DA website.
 * @return {Promise<string>} Latest PDF URL
 */
async function getLatestPdfUrl() {
  const res = await fetch("https://www.da.gov.ph/price-monitoring/");
  const html = await res.text();
  const pdfLinks = [
    ...html.matchAll(
      /href="(https:\/\/www\.da\.gov\.ph\/wp-content\/uploads\/[^"]+\.pdf)"/g,
    ),
  ];
  if (pdfLinks.length === 0) throw new Error("No PDF found");
  return pdfLinks[0][1];
}

/**
 * Parses a PDF and extracts text.
 * @param {string} url PDF URL
 * @return {Promise<string>} Extracted text
 */
async function parsePdf(url) {
  const res = await fetch(url);
  const buffer = await res.buffer();
  const data = await pdfParse(buffer);
  return data.text;
}

/**
 * HTTP endpoint to get the latest prices.
 */
app.get("/getLatestPrices", async (req, res) => {
  try {
    const snapshot = await db
      .collection("prices")
      .orderBy("timestamp", "desc")
      .limit(1)
      .get();
    if (snapshot.empty) {
      res.status(404).send("No price data found");
      return;
    }
    const data = snapshot.docs[0].data();
    res.json(data);
  } catch (err) {
    res.status(500).send("Error fetching prices");
  }
});

/**
 * HTTP endpoint to manually update prices from the DA website.
 */
app.post("/updatePrices", async (req, res) => {
  try {
    const pdfUrl = await getLatestPdfUrl();
    const pdfText = await parsePdf(pdfUrl);
    await db.collection("prices").add({
      url: pdfUrl,
      rawText: pdfText,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    res.send("Prices updated from " + pdfUrl);
  } catch (err) {
    console.error("Error updating prices:", err); // This line logs the error
    res.status(500).send("Error updating prices: " + err.message); // Show error message in response
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
