const { sequelize } = require('./models');

console.log('Starting Safe Database Migration for Vitals Service...');

sequelize.sync({ alter: { drop: false } })
    .then(() => {
        console.log('✅ Vitals Service Migration Complete!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Migration Error:', err);
        process.exit(1);
    });
