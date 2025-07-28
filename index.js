/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {setGlobalOptions} = require("firebase-functions");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const fetch = require("node-fetch");
const pdfParse = require("pdf-parse");

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({maxInstances: 10});

/**
 * Gets the latest PDF URL from the DA website.
 * @return {Promise<string>} Latest PDF URL
 */
async function getLatestPdfUrl() {
  const res = await fetch("https://www.da.gov.ph/price-monitoring/");
  const html = await res.text();
  // Simple regex to find PDF links (improve as needed)
  const pdfLinks = [
    ...html.matchAll(
        /href="(https:\/\/www\.da\.gov\.ph\/wp-content\/uploads\/[^"]+\.pdf)"/g,
    ),
  ];
  if (pdfLinks.length === 0) throw new Error("No PDF found");
  // Assume first link is latest
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
 * Scheduled function to update prices from the DA website every 7 days.
 */
exports.updatePrices = functions.pubsub
    .schedule("every 7 days")
    .onRun(async (context) => {
      try {
        const pdfUrl = await getLatestPdfUrl();
        const pdfText = await parsePdf(pdfUrl);
        // TODO: Extract price data from pdfText (parse table)
        // Example: Save raw text for now
        await db.collection("prices").add({
          url: pdfUrl,
          rawText: pdfText,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log("Prices updated from", pdfUrl);
      } catch (err) {
        console.error("Error updating prices:", err);
      }
    });

/**
 * HTTP endpoint to get the latest prices.
 */
exports.getLatestPrices = functions.https.onRequest(async (req, res) => {
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
exports.updatePrices = functions.https.onRequest(async (req, res) => {
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
    console.error("Error updating prices:", err);
    res.status(500).send("Error updating prices");
  }
});

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
