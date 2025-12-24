/**
 * Netflix Life Story - API Routes
 * Handles file uploads and show data management with multi-series support
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

// File paths
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const SHOW_DATA_PATH = path.join(UPLOADS_DIR, 'showData.json');

// Configure multer for series thumbnail uploads
const seriesThumbnailStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const destDir = path.join(UPLOADS_DIR, 'series-thumbnails');
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        cb(null, destDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${uuidv4()}${ext}`;
        cb(null, filename);
    }
});

// Configure multer for episode thumbnail uploads
const thumbnailStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const destDir = path.join(UPLOADS_DIR, 'thumbnails');
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        cb(null, destDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${uuidv4()}${ext}`;
        cb(null, filename);
    }
});

// Configure multer for media uploads
const mediaStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const destDir = path.join(UPLOADS_DIR, 'media');
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        cb(null, destDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${uuidv4()}${ext}`;
        cb(null, filename);
    }
});

// Configure multer for music uploads
const musicStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const destDir = path.join(UPLOADS_DIR, 'music');
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        cb(null, destDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = `${uuidv4()}${ext}`;
        cb(null, filename);
    }
});

const uploadSeriesThumbnail = multer({
    storage: seriesThumbnailStorage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        cb(null, allowedTypes.test(ext));
    }
});

const uploadThumbnail = multer({ 
    storage: thumbnailStorage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        cb(null, allowedTypes.test(ext));
    }
});

const uploadMedia = multer({ 
    storage: mediaStorage,
    limits: { fileSize: 500 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|mov|avi|mkv/;
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        cb(null, allowedTypes.test(ext));
    }
});

const uploadMusic = multer({ 
    storage: musicStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB for audio
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp3|wav|ogg|aac|m4a|flac/;
        const ext = path.extname(file.originalname).toLowerCase().slice(1);
        cb(null, allowedTypes.test(ext));
    }
});

// Helper: Read all data
function getData() {
    try {
        const data = fs.readFileSync(SHOW_DATA_PATH, 'utf8');
        const parsed = JSON.parse(data);
        
        // Migration: If old format (single show), convert to new format
        if (!parsed.series && parsed.showTitle) {
            const migratedData = {
                series: [{
                    id: uuidv4(),
                    title: parsed.showTitle,
                    description: 'A personal documentary',
                    thumbnail: null,
                    createdAt: new Date().toISOString(),
                    episodeCount: parsed.episodeCount || 1,
                    episodes: parsed.episodes || []
                }]
            };
            saveData(migratedData);
            return migratedData;
        }
        
        return parsed;
    } catch (e) {
        return { series: [] };
    }
}

// Helper: Save data
function saveData(data) {
    fs.writeFileSync(SHOW_DATA_PATH, JSON.stringify(data, null, 2));
}

// Helper: Find series by ID
function findSeries(seriesId) {
    const data = getData();
    return data.series.find(s => s.id === seriesId);
}

// ============================================
// SERIES ROUTES
// ============================================

// GET /api/series - Get all series
router.get('/series', (req, res) => {
    const data = getData();
    res.json(data.series);
});

// POST /api/series - Create new series
router.post('/series', (req, res) => {
    try {
        const { title, description, episodeCount } = req.body;
        const data = getData();
        
        const newSeries = {
            id: uuidv4(),
            title: title || 'Untitled Series',
            description: description || '',
            thumbnail: null,
            createdAt: new Date().toISOString(),
            episodeCount: episodeCount || 1,
            episodes: []
        };
        
        // Initialize episodes
        for (let i = 0; i < newSeries.episodeCount; i++) {
            newSeries.episodes.push({
                title: `Episode ${i + 1}`,
                thumbnail: null,
                media: []
            });
        }
        
        data.series.push(newSeries);
        saveData(data);
        
        res.json({ success: true, series: newSeries });
    } catch (error) {
        console.error('Error creating series:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/series/:seriesId - Get single series
router.get('/series/:seriesId', (req, res) => {
    const series = findSeries(req.params.seriesId);
    if (!series) {
        return res.status(404).json({ error: 'Series not found' });
    }
    res.json(series);
});

// PUT /api/series/:seriesId - Update series
router.put('/series/:seriesId', (req, res) => {
    try {
        const { title, description, episodeCount, episodes } = req.body;
        const data = getData();
        const seriesIndex = data.series.findIndex(s => s.id === req.params.seriesId);
        
        if (seriesIndex === -1) {
            return res.status(404).json({ error: 'Series not found' });
        }
        
        const series = data.series[seriesIndex];
        
        if (title !== undefined) series.title = title;
        if (description !== undefined) series.description = description;
        if (episodes !== undefined) series.episodes = episodes;
        
        if (episodeCount !== undefined && episodeCount !== series.episodeCount) {
            series.episodeCount = episodeCount;
            
            // Add new episodes if count increased
            while (series.episodes.length < episodeCount) {
                series.episodes.push({
                    title: `Episode ${series.episodes.length + 1}`,
                    thumbnail: null,
                    media: []
                });
            }
            
            // Trim if count reduced
            series.episodes = series.episodes.slice(0, episodeCount);
        }
        
        saveData(data);
        res.json({ success: true, series });
    } catch (error) {
        console.error('Error updating series:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/series/:seriesId - Delete series
router.delete('/series/:seriesId', (req, res) => {
    try {
        const data = getData();
        const seriesIndex = data.series.findIndex(s => s.id === req.params.seriesId);
        
        if (seriesIndex === -1) {
            return res.status(404).json({ error: 'Series not found' });
        }
        
        // TODO: Optionally delete associated files
        data.series.splice(seriesIndex, 1);
        saveData(data);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting series:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/series/:seriesId/upload/thumbnail - Upload series thumbnail
router.post('/series/:seriesId/upload/thumbnail', uploadSeriesThumbnail.single('thumbnail'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const data = getData();
    const series = data.series.find(s => s.id === req.params.seriesId);
    
    if (!series) {
        return res.status(404).json({ error: 'Series not found' });
    }
    
    // Delete old thumbnail if exists
    if (series.thumbnail) {
        const oldPath = path.join(UPLOADS_DIR, 'series-thumbnails', series.thumbnail);
        if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }
    }
    
    series.thumbnail = req.file.filename;
    saveData(data);
    
    res.json({
        success: true,
        filename: req.file.filename,
        url: `/uploads/series-thumbnails/${req.file.filename}`
    });
});

// ============================================
// EPISODE ROUTES (with series context)
// ============================================

// POST /api/series/:seriesId/upload/thumbnail/:episodeIndex - Upload episode thumbnail
router.post('/series/:seriesId/upload/thumbnail/:episodeIndex', uploadThumbnail.single('thumbnail'), (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const data = getData();
    const series = data.series.find(s => s.id === req.params.seriesId);
    
    if (!series) {
        return res.status(404).json({ error: 'Series not found' });
    }
    
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    // Delete old thumbnail if exists
    if (series.episodes[episodeIndex].thumbnail) {
        const oldPath = path.join(UPLOADS_DIR, 'thumbnails', series.episodes[episodeIndex].thumbnail);
        if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }
    }
    
    series.episodes[episodeIndex].thumbnail = req.file.filename;
    saveData(data);
    
    res.json({
        success: true,
        filename: req.file.filename,
        url: `/uploads/thumbnails/${req.file.filename}`
    });
});

// POST /api/series/:seriesId/upload/media/:episodeIndex - Upload episode media files
router.post('/series/:seriesId/upload/media/:episodeIndex', uploadMedia.array('media', 50), (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const data = getData();
    const series = data.series.find(s => s.id === req.params.seriesId);
    
    if (!series) {
        return res.status(404).json({ error: 'Series not found' });
    }
    
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    const newMedia = req.files.map(file => {
        const isVideo = /mp4|webm|mov|avi|mkv/.test(path.extname(file.originalname).toLowerCase());
        return {
            id: uuidv4(),
            filename: file.filename,
            originalName: file.originalname,
            type: isVideo ? 'video' : 'image',
            url: `/uploads/media/${file.filename}`
        };
    });
    
    series.episodes[episodeIndex].media.push(...newMedia);
    saveData(data);
    
    res.json({
        success: true,
        files: newMedia
    });
});

// POST /api/series/:seriesId/upload/music/:episodeIndex - Upload episode background music
router.post('/series/:seriesId/upload/music/:episodeIndex', uploadMusic.single('music'), (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const data = getData();
    const series = data.series.find(s => s.id === req.params.seriesId);
    
    if (!series) {
        return res.status(404).json({ error: 'Series not found' });
    }
    
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    // Delete old music if exists
    if (series.episodes[episodeIndex].music) {
        const oldPath = path.join(UPLOADS_DIR, 'music', series.episodes[episodeIndex].music);
        if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }
    }
    
    series.episodes[episodeIndex].music = req.file.filename;
    series.episodes[episodeIndex].musicOriginalName = req.file.originalname;
    saveData(data);
    
    res.json({
        success: true,
        filename: req.file.filename,
        originalName: req.file.originalname,
        url: `/uploads/music/${req.file.filename}`
    });
});

// DELETE /api/series/:seriesId/music/:episodeIndex - Delete episode music
router.delete('/series/:seriesId/music/:episodeIndex', (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    
    const data = getData();
    const series = data.series.find(s => s.id === req.params.seriesId);
    
    if (!series) {
        return res.status(404).json({ error: 'Series not found' });
    }
    
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    const episode = series.episodes[episodeIndex];
    
    if (episode.music) {
        const filePath = path.join(UPLOADS_DIR, 'music', episode.music);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        episode.music = null;
        episode.musicOriginalName = null;
        saveData(data);
    }
    
    res.json({ success: true });
});

// DELETE /api/series/:seriesId/media/:episodeIndex/:mediaId - Delete a media file
router.delete('/series/:seriesId/media/:episodeIndex/:mediaId', (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    const mediaId = req.params.mediaId;
    
    const data = getData();
    const series = data.series.find(s => s.id === req.params.seriesId);
    
    if (!series) {
        return res.status(404).json({ error: 'Series not found' });
    }
    
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    const episode = series.episodes[episodeIndex];
    const mediaIndex = episode.media.findIndex(m => m.id === mediaId);
    
    if (mediaIndex === -1) {
        return res.status(404).json({ error: 'Media not found' });
    }
    
    // Delete file from disk
    const mediaFile = episode.media[mediaIndex];
    const filePath = path.join(UPLOADS_DIR, 'media', mediaFile.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    
    // Remove from data
    episode.media.splice(mediaIndex, 1);
    saveData(data);
    
    res.json({ success: true });
});

// POST /api/series/:seriesId/media/:episodeIndex/reorder - Reorder media items
router.post('/series/:seriesId/media/:episodeIndex/reorder', (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    const { mediaIds } = req.body;
    
    if (!Array.isArray(mediaIds)) {
        return res.status(400).json({ error: 'mediaIds must be an array' });
    }
    
    const data = getData();
    const series = data.series.find(s => s.id === req.params.seriesId);
    
    if (!series) {
        return res.status(404).json({ error: 'Series not found' });
    }
    
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    const episode = series.episodes[episodeIndex];
    
    // Create a map of existing media by ID
    const mediaMap = new Map();
    episode.media.forEach(m => mediaMap.set(m.id, m));
    
    // Reorder based on provided IDs
    const reorderedMedia = [];
    mediaIds.forEach(id => {
        if (mediaMap.has(id)) {
            reorderedMedia.push(mediaMap.get(id));
            mediaMap.delete(id);
        }
    });
    
    // Add any remaining media that wasn't in the list (safety)
    mediaMap.forEach(m => reorderedMedia.push(m));
    
    episode.media = reorderedMedia;
    saveData(data);
    
    res.json({ success: true, media: reorderedMedia });
});

// ============================================
// LEGACY ROUTES (for backward compatibility during migration)
// ============================================

// GET /api/show - Get first series (legacy)
router.get('/show', (req, res) => {
    const data = getData();
    if (data.series.length > 0) {
        const series = data.series[0];
        res.json({
            showTitle: series.title,
            episodeCount: series.episodeCount,
            episodes: series.episodes
        });
    } else {
        res.json({
            showTitle: 'The Story of My Life',
            episodeCount: 1,
            episodes: [{ title: 'Episode 1', thumbnail: null, media: [] }]
        });
    }
});

// POST /api/show - Legacy save (creates/updates first series)
router.post('/show', (req, res) => {
    try {
        const { showTitle, episodeCount, episodes } = req.body;
        const data = getData();
        
        if (data.series.length === 0) {
            // Create new series
            const newSeries = {
                id: uuidv4(),
                title: showTitle || 'The Story of My Life',
                description: '',
                thumbnail: null,
                createdAt: new Date().toISOString(),
                episodeCount: episodeCount || 1,
                episodes: episodes || []
            };
            
            while (newSeries.episodes.length < newSeries.episodeCount) {
                newSeries.episodes.push({
                    title: `Episode ${newSeries.episodes.length + 1}`,
                    thumbnail: null,
                    media: []
                });
            }
            
            data.series.push(newSeries);
        } else {
            // Update first series
            const series = data.series[0];
            series.title = showTitle || series.title;
            series.episodeCount = episodeCount || series.episodeCount;
            series.episodes = episodes || series.episodes;
            
            while (series.episodes.length < series.episodeCount) {
                series.episodes.push({
                    title: `Episode ${series.episodes.length + 1}`,
                    thumbnail: null,
                    media: []
                });
            }
            
            series.episodes = series.episodes.slice(0, series.episodeCount);
        }
        
        saveData(data);
        const series = data.series[0];
        res.json({ success: true, data: { showTitle: series.title, episodeCount: series.episodeCount, episodes: series.episodes } });
    } catch (error) {
        console.error('Error saving show data:', error);
        res.status(500).json({ error: error.message });
    }
});

// Legacy upload routes remain for compatibility
router.post('/upload/thumbnail/:episodeIndex', uploadThumbnail.single('thumbnail'), (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const data = getData();
    if (data.series.length === 0) {
        return res.status(400).json({ error: 'No series found' });
    }
    
    const series = data.series[0];
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    if (series.episodes[episodeIndex].thumbnail) {
        const oldPath = path.join(UPLOADS_DIR, 'thumbnails', series.episodes[episodeIndex].thumbnail);
        if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }
    }
    
    series.episodes[episodeIndex].thumbnail = req.file.filename;
    saveData(data);
    
    res.json({
        success: true,
        filename: req.file.filename,
        url: `/uploads/thumbnails/${req.file.filename}`
    });
});

router.post('/upload/media/:episodeIndex', uploadMedia.array('media', 50), (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    
    if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const data = getData();
    if (data.series.length === 0) {
        return res.status(400).json({ error: 'No series found' });
    }
    
    const series = data.series[0];
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    const newMedia = req.files.map(file => {
        const isVideo = /mp4|webm|mov|avi|mkv/.test(path.extname(file.originalname).toLowerCase());
        return {
            id: uuidv4(),
            filename: file.filename,
            originalName: file.originalname,
            type: isVideo ? 'video' : 'image',
            url: `/uploads/media/${file.filename}`
        };
    });
    
    series.episodes[episodeIndex].media.push(...newMedia);
    saveData(data);
    
    res.json({ success: true, files: newMedia });
});

router.post('/upload/music/:episodeIndex', uploadMusic.single('music'), (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const data = getData();
    if (data.series.length === 0) {
        return res.status(400).json({ error: 'No series found' });
    }
    
    const series = data.series[0];
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    if (series.episodes[episodeIndex].music) {
        const oldPath = path.join(UPLOADS_DIR, 'music', series.episodes[episodeIndex].music);
        if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
        }
    }
    
    series.episodes[episodeIndex].music = req.file.filename;
    series.episodes[episodeIndex].musicOriginalName = req.file.originalname;
    saveData(data);
    
    res.json({
        success: true,
        filename: req.file.filename,
        originalName: req.file.originalname,
        url: `/uploads/music/${req.file.filename}`
    });
});

router.delete('/music/:episodeIndex', (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    
    const data = getData();
    if (data.series.length === 0) {
        return res.status(400).json({ error: 'No series found' });
    }
    
    const series = data.series[0];
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    const episode = series.episodes[episodeIndex];
    
    if (episode.music) {
        const filePath = path.join(UPLOADS_DIR, 'music', episode.music);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        episode.music = null;
        episode.musicOriginalName = null;
        saveData(data);
    }
    
    res.json({ success: true });
});

router.delete('/media/:episodeIndex/:mediaId', (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    const mediaId = req.params.mediaId;
    
    const data = getData();
    if (data.series.length === 0) {
        return res.status(400).json({ error: 'No series found' });
    }
    
    const series = data.series[0];
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    const episode = series.episodes[episodeIndex];
    const mediaIndex = episode.media.findIndex(m => m.id === mediaId);
    
    if (mediaIndex === -1) {
        return res.status(404).json({ error: 'Media not found' });
    }
    
    const mediaFile = episode.media[mediaIndex];
    const filePath = path.join(UPLOADS_DIR, 'media', mediaFile.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    
    episode.media.splice(mediaIndex, 1);
    saveData(data);
    
    res.json({ success: true });
});

router.post('/media/:episodeIndex/reorder', (req, res) => {
    const episodeIndex = parseInt(req.params.episodeIndex);
    const { mediaIds } = req.body;
    
    if (!Array.isArray(mediaIds)) {
        return res.status(400).json({ error: 'mediaIds must be an array' });
    }
    
    const data = getData();
    if (data.series.length === 0) {
        return res.status(400).json({ error: 'No series found' });
    }
    
    const series = data.series[0];
    if (episodeIndex >= series.episodes.length) {
        return res.status(400).json({ error: 'Invalid episode index' });
    }
    
    const episode = series.episodes[episodeIndex];
    
    const mediaMap = new Map();
    episode.media.forEach(m => mediaMap.set(m.id, m));
    
    const reorderedMedia = [];
    mediaIds.forEach(id => {
        if (mediaMap.has(id)) {
            reorderedMedia.push(mediaMap.get(id));
            mediaMap.delete(id);
        }
    });
    
    mediaMap.forEach(m => reorderedMedia.push(m));
    
    episode.media = reorderedMedia;
    saveData(data);
    
    res.json({ success: true, media: reorderedMedia });
});

module.exports = router;
