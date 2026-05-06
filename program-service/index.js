const express = require('express');
const cors    = require('cors');
const dotenv  = require('dotenv');
const { sequelize } = require('./models');
const adminRoutes = require('./routes/adminRoutes');
const userRoutes  = require('./routes/userRoutes');

dotenv.config();
const app  = express();
const PORT = process.env.PORT || 3009;

app.use(cors());
app.use(express.json({ limit: '10mb' }));   // large import payloads

// Admin endpoints — protected by adminMiddleware inside router
app.use('/api/programs/admin', adminRoutes);

// User-facing endpoints — protected by authMiddleware inside router
app.use('/api/programs/user', userRoutes);

sequelize.sync({ alter: { drop: false } })
    .then(() => {
        app.listen(PORT, () =>
            console.log(`Program Service running on port ${PORT}`)
        );
    })
    .catch(err => {
        console.error('DB sync failed:', err.message);
        process.exit(1);
    });
