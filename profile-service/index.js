const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { sequelize } = require('./models');
const onboardingRoutes = require('./routes/onboardingRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());

app.use('/api/onboarding', onboardingRoutes);
app.use('/api/settings', settingsRoutes);

sequelize.authenticate().then(() => {
    console.log('Profile Database connected via Sequelize.');
    app.listen(PORT,'0.0.0.0', () => console.log(`Profile Service running on port ${PORT}`));
}).catch(console.error);
