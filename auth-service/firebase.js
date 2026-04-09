const admin = require('firebase-admin');
const dotenv = require('dotenv');
dotenv.config();

if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else {
    admin.initializeApp();
}

module.exports = admin;
