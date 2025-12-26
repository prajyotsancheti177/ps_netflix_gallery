require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3001;
const isProduction = process.env.NODE_ENV === 'production';

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files (for legacy local files only)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api', apiRoutes);

// In production, serve the React build
if (isProduction) {
    const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
    
    // Serve static files from the React build
    app.use(express.static(clientBuildPath));
    
    // Handle React routing - serve index.html for all non-API routes
    app.get('*', (req, res) => {
        res.sendFile(path.join(clientBuildPath, 'index.html'));
    });
    
    console.log('🚀 Running in PRODUCTION mode - serving static files from client/dist');
}

// Create uploads directory for showData.json only
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`Created directory: ${uploadsDir}`);
}

// Initialize show data file if it doesn't exist
const showDataPath = path.join(__dirname, 'uploads', 'showData.json');
if (!fs.existsSync(showDataPath)) {
    const defaultData = {
        showTitle: 'The Story of My Life',
        episodeCount: 1,
        episodes: [{
            title: 'Episode 1',
            thumbnail: null,
            media: []
        }]
    };
    fs.writeFileSync(showDataPath, JSON.stringify(defaultData, null, 2));
    console.log('Created default show data file');
}

// Start server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🎬 Netflix Life Story API Server                           ║
║                                                              ║
║   API running at: http://localhost:${PORT}                     ║
║                                                              ║
║   Start the React app with: cd client && npm run dev         ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});
