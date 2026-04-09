const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { sequelize } = require('./models');
const vitalsRoutes = require('./routes/vitalsRoutes');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());

app.use('/api/vitals', vitalsRoutes);

sequelize.authenticate().then(() => {
    console.log('Vitals Database connected via Sequelize.');
    app.listen(PORT, () => console.log(`Vitals Service running on port ${PORT}`));
}).catch(console.error);
