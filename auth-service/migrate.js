const { sequelize } = require('./models');

console.log('Starting Safe Database Migration for Auth Service...');

// alter: { drop: false } ensures that Sequelize ONLY adds new columns 
// and NEVER deletes existing data or columns even if they are missing from the Model file.
sequelize.sync({ alter: { drop: false } })
    .then(() => {
        console.log('✅ Auth Service Migration Complete!');
        process.exit(0);
    })
    .catch((err) => {
        console.error('❌ Migration Error:', err);
        process.exit(1);
    });
