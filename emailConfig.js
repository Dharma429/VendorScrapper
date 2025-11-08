require('dotenv').config();

const emailConfig = {
    service: 'gmail',
    auth: {
        user: 'dputtuusa@gmail.com',
        pass: 'vcar ddke qjmx vcuv'
    },
    // Optional SMTP settings for better reliability
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    rateDelta: 1000,
    rateLimit: 5
};

const emailDefaults = {
    from: 'dputtuusa@gmail.com',
    fromName: 'Vendors Check'
};

module.exports = { emailConfig, emailDefaults };