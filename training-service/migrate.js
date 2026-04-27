const { sequelize } = require('./models');

console.log('Starting Database Synchronization for Training Service...');

sequelize.sync({ alter: { drop: false } })
    .then(() => {
        console.log('✅ Training Models successfully synchronized with the Database!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Sync Error:', err);
        process.exit(1);
    });
