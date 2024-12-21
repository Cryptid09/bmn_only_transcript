const express = require('express');
const router = express.Router();
const videoService = require('../services/videoService');
const path = require('path');
const fs = require('fs').promises;

// Store processed files with their expiry time
const processedFiles = new Map();
const FILE_EXPIRY_TIME = 30 * 60 * 1000; // 30 minutes

// Cleanup function to remove expired files
async function cleanupExpiredFiles() {
  const now = Date.now();
  for (const [jobId, fileInfo] of processedFiles.entries()) {
    if (now > fileInfo.expiry) {
      try {
        await videoService.cleanup(fileInfo.directory);
        processedFiles.delete(jobId);
        console.log(`Cleaned up expired files for job ${jobId}`);
      } catch (error) {
        console.error(`Error cleaning up job ${jobId}:`, error);
      }
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredFiles, 5 * 60 * 1000);

router.get('/', (req, res) => {
  res.render('index', { result: null, error: null });
});

router.post('/process', async (req, res) => {
  try {
    const { videoInput, sbatId } = req.body;
    let finalSbatId = sbatId;

    if (!videoInput) {
      throw new Error('Please provide a Scaler video URL or SBAT ID');
    }

    // If no sbatId was extracted by frontend, try to extract it here
    if (!finalSbatId) {
      const match = videoInput.match(/class\/(\d+)\/session/);
      if (match && match[1]) {
        finalSbatId = match[1];
      } else if (/^\d+$/.test(videoInput)) {
        finalSbatId = videoInput;
      }
    }

    if (!finalSbatId) {
      throw new Error('Could not extract valid SBAT ID from input');
    }

    console.log('Processing video for SBAT ID:', finalSbatId);
    const result = await videoService.processVideo(finalSbatId);
    
    // Store the file paths with expiry time
    const jobId = path.basename(path.dirname(result.mergedVideo));
    processedFiles.set(jobId, {
      directory: path.dirname(result.mergedVideo),
      video: result.mergedVideo,
      audio: result.audioFile,
      expiry: Date.now() + FILE_EXPIRY_TIME
    });

    res.render('index', { 
      result: { jobId },
      error: null 
    });
  } catch (error) {
    console.error('Error:', error);
    res.render('index', { result: null, error: error.message });
  }
});

router.get('/download/:type/:jobId', async (req, res) => {
  try {
    const { type, jobId } = req.params;
    const fileInfo = processedFiles.get(jobId);

    if (!fileInfo) {
      throw new Error('Files have expired or were not found. Please process the video again.');
    }

    if (Date.now() > fileInfo.expiry) {
      processedFiles.delete(jobId);
      throw new Error('Files have expired. Please process the video again.');
    }

    const filePath = type === 'video' ? fileInfo.video : fileInfo.audio;
    const fileName = type === 'video' ? 'video.ts' : 'audio.mp3';

    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', type === 'video' ? 'video/mp2t' : 'audio/mp3');
    
    // Stream the file
    const fileStream = require('fs').createReadStream(filePath);
    fileStream.pipe(res);
    
    fileStream.on('error', (error) => {
      console.error(`Error streaming file: ${error}`);
      res.status(500).send('Error downloading file');
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(404).send(error.message);
  }
});

module.exports = router;
