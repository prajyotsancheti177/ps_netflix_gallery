const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API routes
app.use('/api', apiRoutes);

// Create upload directories if they don't exist
const uploadDirs = [
    path.join(__dirname, 'uploads'),
    path.join(__dirname, 'uploads', 'thumbnails'),
    path.join(__dirname, 'uploads', 'media'),
    path.join(__dirname, 'uploads', 'music')
];

uploadDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

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
