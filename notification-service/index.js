const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { sequelize } = require('./models');
const notifRoutes = require('./routes/notificationRoutes');
const { initCronJobs } = require('./cronJobs');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3007;

app.use(cors());
app.use(express.json());

app.use('/api/notifications', notifRoutes);

sequelize.sync({ alter: false }).then(() => {
    console.log('Notification Service DB Mapped.');
    initCronJobs(); // Boot the background schedulers using Asia/Kolkata Timezone
    app.listen(PORT, () => console.log(`Notification Service running on port ${PORT}`));
}).catch(console.error);
