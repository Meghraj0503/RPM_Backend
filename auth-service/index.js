const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { sequelize } = require('./models');
const authRoutes = require('./routes/authRoutes');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);

sequelize.authenticate().then(() => {
    console.log('Auth Database connected via Sequelize.');
    app.listen(PORT, () => console.log(`Auth Service running on port ${PORT}`));
}).catch(console.error);
