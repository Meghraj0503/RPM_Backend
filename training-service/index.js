const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { sequelize } = require('./models');
const trainingRoutes = require('./routes/trainingRoutes');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3008;

app.use(cors());
app.use(express.json());

app.use('/api/training', trainingRoutes);

sequelize.authenticate().then(() => {
    console.log('Training User Service DB connected via Sequelize.');
    app.listen(PORT, () => console.log(`Training User Service running on port ${PORT}`));
}).catch(console.error);
