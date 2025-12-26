/**
 * Netflix Life Story - API Routes
 * Handles file uploads to AWS S3 and show data management with multi-series support
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const {
    seriesThumbnailStorage,
    thumbnailStorage,
    mediaStorage,
    musicStorage,
    getS3Url,
    deleteFromS3,
    getKeyFromUrl
} = require('../config/s3');

const router = express.Router();

// File paths
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const SHOW_DATA_PATH = path.join(UPLOADS_DIR, 'showData.json');

// Configure multer with S3 storage
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
router.delete('/series/:seriesId', async (req, res) => {
    try {
        const data = getData();
        const seriesIndex = data.series.findIndex(s => s.id === req.params.seriesId);
        
        if (seriesIndex === -1) {
            return res.status(404).json({ error: 'Series not found' });
        }
        
        const series = data.series[seriesIndex];
        
        // Delete associated S3 files
        if (series.thumbnail) {
            const key = getKeyFromUrl(series.thumbnail);
            if (key) await deleteFromS3(key);
        }
        
        for (const episode of series.episodes) {
            if (episode.thumbnail) {
                const key = getKeyFromUrl(episode.thumbnail);
                if (key) await deleteFromS3(key);
            }
            if (episode.music) {
                const key = getKeyFromUrl(episode.music);
                if (key) await deleteFromS3(key);
            }
            for (const media of episode.media || []) {
                const key = getKeyFromUrl(media.url);
                if (key) await deleteFromS3(key);
            }
        }
        
        data.series.splice(seriesIndex, 1);
        saveData(data);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting series:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/series/:seriesId/upload/thumbnail - Upload series thumbnail
router.post('/series/:seriesId/upload/thumbnail', uploadSeriesThumbnail.single('thumbnail'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    const data = getData();
    const series = data.series.find(s => s.id === req.params.seriesId);
    
    if (!series) {
        return res.status(404).json({ error: 'Series not found' });
    }
    
    // Delete old thumbnail from S3 if exists
    if (series.thumbnail) {
        const oldKey = getKeyFromUrl(series.thumbnail);
        if (oldKey) await deleteFromS3(oldKey);
    }
    
    // Store full S3 URL
    const s3Url = getS3Url(req.file.key);
    series.thumbnail = s3Url;
    saveData(data);
    
    console.log(`[API] ✅ Series thumbnail uploaded successfully`);
    console.log(`[API]    S3 URL: ${s3Url}`);
    
    res.json({
        success: true,
        filename: req.file.key,
        url: s3Url
    });
});

// ============================================
// EPISODE ROUTES (with series context)
// ============================================

// POST /api/series/:seriesId/upload/thumbnail/:episodeIndex - Upload episode thumbnail
router.post('/series/:seriesId/upload/thumbnail/:episodeIndex', uploadThumbnail.single('thumbnail'), async (req, res) => {
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
    
    // Delete old thumbnail from S3 if exists
    if (series.episodes[episodeIndex].thumbnail) {
        const oldKey = getKeyFromUrl(series.episodes[episodeIndex].thumbnail);
        if (oldKey) await deleteFromS3(oldKey);
    }
    
    // Store full S3 URL
    const s3Url = getS3Url(req.file.key);
    series.episodes[episodeIndex].thumbnail = s3Url;
    saveData(data);
    
    console.log(`[API] ✅ Episode ${episodeIndex} thumbnail uploaded successfully`);
    console.log(`[API]    S3 URL: ${s3Url}`);
    
    res.json({
        success: true,
        filename: req.file.key,
        url: s3Url
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
        const s3Url = getS3Url(file.key);
        return {
            id: uuidv4(),
            filename: file.key,
            originalName: file.originalname,
            type: isVideo ? 'video' : 'image',
            url: s3Url
        };
    });
    
    series.episodes[episodeIndex].media.push(...newMedia);
    saveData(data);
    
    console.log(`[API] ✅ ${newMedia.length} media file(s) uploaded to Episode ${episodeIndex}`);
    newMedia.forEach(m => console.log(`[API]    - ${m.type}: ${m.url}`));
    
    res.json({
        success: true,
        files: newMedia
    });
});

// POST /api/series/:seriesId/upload/music/:episodeIndex - Upload episode background music
router.post('/series/:seriesId/upload/music/:episodeIndex', uploadMusic.single('music'), async (req, res) => {
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
    
    // Delete old music from S3 if exists
    if (series.episodes[episodeIndex].music) {
        const oldKey = getKeyFromUrl(series.episodes[episodeIndex].music);
        if (oldKey) await deleteFromS3(oldKey);
    }
    
    // Store full S3 URL
    const s3Url = getS3Url(req.file.key);
    series.episodes[episodeIndex].music = s3Url;
    series.episodes[episodeIndex].musicOriginalName = req.file.originalname;
    saveData(data);
    
    console.log(`[API] ✅ Music uploaded to Episode ${episodeIndex}`);
    console.log(`[API]    Original: ${req.file.originalname}`);
    console.log(`[API]    S3 URL: ${s3Url}`);
    
    res.json({
        success: true,
        filename: req.file.key,
        originalName: req.file.originalname,
        url: s3Url
    });
});

// DELETE /api/series/:seriesId/music/:episodeIndex - Delete episode music
router.delete('/series/:seriesId/music/:episodeIndex', async (req, res) => {
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
        const key = getKeyFromUrl(episode.music);
        if (key) await deleteFromS3(key);
        episode.music = null;
        episode.musicOriginalName = null;
        saveData(data);
    }
    
    res.json({ success: true });
});

// DELETE /api/series/:seriesId/media/:episodeIndex/:mediaId - Delete a media file
router.delete('/series/:seriesId/media/:episodeIndex/:mediaId', async (req, res) => {
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
    
    // Delete file from S3
    const mediaFile = episode.media[mediaIndex];
    const key = getKeyFromUrl(mediaFile.url);
    if (key) await deleteFromS3(key);
    
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

// Legacy upload routes - now use S3
router.post('/upload/thumbnail/:episodeIndex', uploadThumbnail.single('thumbnail'), async (req, res) => {
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
    
    // Delete old thumbnail from S3 if it's an S3 URL
    if (series.episodes[episodeIndex].thumbnail) {
        const oldKey = getKeyFromUrl(series.episodes[episodeIndex].thumbnail);
        if (oldKey) await deleteFromS3(oldKey);
    }
    
    const s3Url = getS3Url(req.file.key);
    series.episodes[episodeIndex].thumbnail = s3Url;
    saveData(data);
    
    res.json({
        success: true,
        filename: req.file.key,
        url: s3Url
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
        const s3Url = getS3Url(file.key);
        return {
            id: uuidv4(),
            filename: file.key,
            originalName: file.originalname,
            type: isVideo ? 'video' : 'image',
            url: s3Url
        };
    });
    
    series.episodes[episodeIndex].media.push(...newMedia);
    saveData(data);
    
    res.json({ success: true, files: newMedia });
});

router.post('/upload/music/:episodeIndex', uploadMusic.single('music'), async (req, res) => {
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
    
    // Delete old music from S3 if it's an S3 URL
    if (series.episodes[episodeIndex].music) {
        const oldKey = getKeyFromUrl(series.episodes[episodeIndex].music);
        if (oldKey) await deleteFromS3(oldKey);
    }
    
    const s3Url = getS3Url(req.file.key);
    series.episodes[episodeIndex].music = s3Url;
    series.episodes[episodeIndex].musicOriginalName = req.file.originalname;
    saveData(data);
    
    res.json({
        success: true,
        filename: req.file.key,
        originalName: req.file.originalname,
        url: s3Url
    });
});

router.delete('/music/:episodeIndex', async (req, res) => {
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
        const key = getKeyFromUrl(episode.music);
        if (key) await deleteFromS3(key);
        episode.music = null;
        episode.musicOriginalName = null;
        saveData(data);
    }
    
    res.json({ success: true });
});

router.delete('/media/:episodeIndex/:mediaId', async (req, res) => {
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
    const key = getKeyFromUrl(mediaFile.url);
    if (key) await deleteFromS3(key);
    
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
