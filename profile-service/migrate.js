const { sequelize } = require('./models');

console.log('Starting Safe Database Migration for Profile Service...');

sequelize.sync({ alter: { drop: false } })
    .then(() => {
        console.log('✅ Profile Service Migration Complete!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Migration Error:', err);
        process.exit(1);
    });
