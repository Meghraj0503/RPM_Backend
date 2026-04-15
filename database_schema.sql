-- psql -U postgres -d remote_patient_monitor -f /home/harshata/RPMV1/microservices/database_schema.sql
CREATE SEQUENCE IF NOT EXISTS user_seq START 100000;
CREATE SEQUENCE IF NOT EXISTS otp_seq START 100000;
CREATE SEQUENCE IF NOT EXISTS device_seq START 300000;
CREATE SEQUENCE IF NOT EXISTS vital_seq START 6000000;
CREATE SEQUENCE IF NOT EXISTS qst_seq START 1000;
CREATE SEQUENCE IF NOT EXISTS uqs_seq START 50000;
CREATE SEQUENCE IF NOT EXISTS article_seq START 8000;
CREATE SEQUENCE IF NOT EXISTS notif_seq START 900000;
CREATE SEQUENCE IF NOT EXISTS alert_seq START 10000;
 
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'USR-' || nextval('user_seq')::text,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    is_manager BOOLEAN DEFAULT FALSE,
    is_user BOOLEAN DEFAULT TRUE,
    biometric_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS user_otps (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'OTP-' || nextval('otp_seq')::text,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    otp VARCHAR(6) NOT NULL,
    is_verified BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS manager_assigned_users (
    id SERIAL PRIMARY KEY,
    manager_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(manager_id, user_id)
);

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id VARCHAR(20) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    date_of_birth DATE,
    gender VARCHAR(20),
    height NUMERIC(5,2),
    height_unit VARCHAR(10) DEFAULT 'cm',
    weight NUMERIC(5,2),
    weight_unit VARCHAR(10) DEFAULT 'kg',
    bmi NUMERIC(5,2),
    is_personal_setup BOOLEAN DEFAULT FALSE,
    is_medical_setup BOOLEAN DEFAULT FALSE,
    is_lifestyle_setup BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_medical_conditions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    condition_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_medications (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    medication_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_allergies (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    allergy_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_lifestyle (
    user_id VARCHAR(20) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    diet_type VARCHAR(50), 
    physical_activity_level VARCHAR(50), 
    average_sleep_hours NUMERIC(4,2),
    smoking_status VARCHAR(50),
    alcohol_consumption VARCHAR(50),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_devices (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255),
    mac_address VARCHAR(50) NOT NULL,
    nickname VARCHAR(255),
    assigned_by VARCHAR(255),
    assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_connected BOOLEAN DEFAULT TRUE,
    last_connected_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_vitals (
    id VARCHAR(25) PRIMARY KEY DEFAULT 'VIT-' || nextval('vital_seq')::text,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    vital_type VARCHAR(50) NOT NULL, 
    vital_value NUMERIC(10,2) NOT NULL,
    vital_unit VARCHAR(20),
    is_manual BOOLEAN DEFAULT FALSE,
    source VARCHAR(100), 
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_vitals_type ON user_vitals(user_id, vital_type, recorded_at DESC);

CREATE TABLE IF NOT EXISTS questionnaire_templates (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'QST-' || nextval('qst_seq')::text,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    scheduled_days_after_enrollment INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    questionnaire_id VARCHAR(20) REFERENCES questionnaire_templates(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50) NOT NULL, 
    options_json JSONB,
    sort_order INT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_questionnaires (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'UQS-' || nextval('uqs_seq')::text,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    questionnaire_id VARCHAR(20) REFERENCES questionnaire_templates(id),
    status VARCHAR(50) DEFAULT 'Pending', 
    scheduled_for DATE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_responses (
    id BIGSERIAL PRIMARY KEY,
    user_questionnaire_id VARCHAR(20) REFERENCES user_questionnaires(id) ON DELETE CASCADE,
    question_id INT REFERENCES questions(id) ON DELETE CASCADE,
    response_value_text TEXT,
    response_value_numeric NUMERIC(10,2)
);

CREATE TABLE IF NOT EXISTS user_questionnaire_scores (
    user_questionnaire_id VARCHAR(20) PRIMARY KEY REFERENCES user_questionnaires(id) ON DELETE CASCADE,
    overall_score NUMERIC(5,2),
    domain_scores_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS articles (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'ART-' || nextval('article_seq')::text,
    title VARCHAR(255) NOT NULL,
    author_name VARCHAR(255),
    content TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    cover_image_url VARCHAR(500),
    estimated_read_time INT,
    is_published BOOLEAN DEFAULT FALSE,
    is_draft BOOLEAN DEFAULT TRUE,
    is_deleted BOOLEAN DEFAULT FALSE,
    published_at TIMESTAMP WITH TIME ZONE,
    scheduled_publish_at TIMESTAMP WITH TIME ZONE,
    publish_status VARCHAR(20) DEFAULT 'draft',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bookmarked_articles (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    article_id VARCHAR(20) REFERENCES articles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, article_id)
);

CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'NOT-' || nextval('notif_seq')::text,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(100) NOT NULL, 
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_alerts (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'ALR-' || nextval('alert_seq')::text,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    vital_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_settings (
    user_id VARCHAR(20) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    push_notifications_enabled BOOLEAN DEFAULT TRUE,
    email_notifications_enabled BOOLEAN DEFAULT TRUE,
    app_version VARCHAR(50),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_consents (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    consent_version VARCHAR(50) NOT NULL,
    ip_address VARCHAR(45),
    status VARCHAR(50) DEFAULT 'Accepted',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS data_deletion_requests (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'Pending',
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN PORTAL TABLES (added during admin portal development)
-- ─────────────────────────────────────────────────────────────────────────────

-- Admin users (email + bcrypt password login)
CREATE TABLE IF NOT EXISTS admin_users (
    id VARCHAR(20) PRIMARY KEY DEFAULT 'ADM-' || nextval('user_seq')::text,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User subscriptions / program enrollments
CREATE TABLE IF NOT EXISTS user_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    program_name VARCHAR(255) DEFAULT 'Wellness Program 2025',
    enrolled_by VARCHAR(255) DEFAULT 'System Auto',
    start_date DATE,
    expiry_date DATE,
    status VARCHAR(50) DEFAULT 'Active',
    validity_days INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enrollment / subscription audit log
CREATE TABLE IF NOT EXISTS subscription_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    admin_id VARCHAR(20),
    program_name VARCHAR(255),
    reason TEXT,
    action VARCHAR(100),
    previous_status VARCHAR(100),
    new_status VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- General user audit log (all admin actions on a user)
CREATE TABLE IF NOT EXISTS user_audit_logs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(20) REFERENCES users(id) ON DELETE CASCADE,
    admin_id VARCHAR(20),
    action_type VARCHAR(100) NOT NULL,
    category VARCHAR(50) DEFAULT 'Other',
    changes_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_audit_logs_user ON user_audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_audit_logs_category ON user_audit_logs(category);

-- Admin dashboard widget configuration
CREATE TABLE IF NOT EXISTS dashboard_configs (
    admin_id VARCHAR(20) PRIMARY KEY,
    layout_json JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Data export history
CREATE TABLE IF NOT EXISTS export_history (
    id SERIAL PRIMARY KEY,
    admin_id VARCHAR(20),
    export_type VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    fields_exported JSONB,
    date_from DATE,
    date_to DATE,
    program VARCHAR(255),
    row_count INTEGER DEFAULT 0,
    file_size_kb INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SAFE ALTER STATEMENTS (idempotent — won't fail if columns already exist)
-- Run these in case the base tables were created from an older version of this file
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE articles ADD COLUMN IF NOT EXISTS scheduled_publish_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE articles ADD COLUMN IF NOT EXISTS publish_status VARCHAR(20) DEFAULT 'draft';

ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS nickname VARCHAR(255);
ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS assigned_by VARCHAR(255);
ALTER TABLE user_devices ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE user_audit_logs ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'Other';
