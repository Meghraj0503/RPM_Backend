const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { sequelize } = require('./models');
const articlesRoutes = require('./routes/articlesRoutes');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3004;

app.use(cors());
app.use(express.json());

app.use('/api/articles', articlesRoutes);

sequelize.authenticate().then(() => {
    console.log('Articles Database connected via Sequelize.');
    app.listen(PORT, () => console.log(`Articles Service running on port ${PORT}`));
}).catch(console.error);
