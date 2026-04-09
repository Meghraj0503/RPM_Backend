const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { sequelize } = require('./models');
const qRoutes = require('./routes/questionnaireRoutes');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors());
app.use(express.json());

app.use('/api/questionnaires', qRoutes);

sequelize.sync({ alter: true }).then(() => {
    console.log('Questionnaire Database mapped and synced.');
    app.listen(PORT, () => console.log(`Questionnaire Service running on port ${PORT}`));
}).catch(console.error);
