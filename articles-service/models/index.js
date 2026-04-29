const { Sequelize, DataTypes } = require('sequelize');
const dotenv = require('dotenv');
dotenv.config();

const sequelize = new Sequelize(
    process.env.DB_NAME || 'remote_patient_monitor',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'postgres', {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
});

const Article = sequelize.define('article', {
    id: {
        type: DataTypes.STRING(20),
        primaryKey: true,
        defaultValue: Sequelize.literal("'ART-' || nextval('article_seq')")
    },
    title: { type: DataTypes.STRING, allowNull: false },
    author_name: { type: DataTypes.STRING },
    content: { type: DataTypes.TEXT, allowNull: false },
    category: { type: DataTypes.STRING, allowNull: false },
    cover_image_url: { type: DataTypes.STRING(500) },
    estimated_read_time: { type: DataTypes.INTEGER },
    is_published: { type: DataTypes.BOOLEAN, defaultValue: false },
    is_draft: { type: DataTypes.BOOLEAN, defaultValue: true },
    is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    published_at: { type: DataTypes.DATE }
}, { tableName: 'articles', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

const Bookmark = sequelize.define('bookmarked_article', {
    user_id: { type: DataTypes.STRING(20), primaryKey: true },
    article_id: { type: DataTypes.STRING(20), primaryKey: true },
}, { tableName: 'bookmarked_articles', timestamps: true, createdAt: 'created_at', updatedAt: false });

// MB-18/MB-19: Multi-media education content (video, audio, infographic, pdf, article)
const EducationContent = sequelize.define('education_content', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    content_type: { type: DataTypes.STRING(20), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    author_name: DataTypes.STRING(255),
    category: DataTypes.STRING(100),
    description: DataTypes.TEXT,
    thumbnail_url: DataTypes.STRING(500),
    media_url: DataTypes.STRING(500),
    duration_seconds: DataTypes.INTEGER,
    page_count: DataTypes.INTEGER,
    view_count: { type: DataTypes.INTEGER, defaultValue: 0 },
    topic: DataTypes.STRING(100),
    health_topic: DataTypes.STRING(100),
    is_published: { type: DataTypes.BOOLEAN, defaultValue: false },
    created_by: DataTypes.STRING(255)
}, { tableName: 'education_contents', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });

module.exports = { sequelize, Article, Bookmark, EducationContent };
