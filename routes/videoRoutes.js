const express = require('express');
const router = express.Router();
const videoService = require('../services/videoService');

router.get('/', (req, res) => {
  res.render('index', { transcript: null, error: null });
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
    const transcript = await videoService.processVideo(finalSbatId);
    
    res.render('index', { transcript, error: null });
  } catch (error) {
    console.error('Error:', error);
    res.render('index', { transcript: null, error: error.message });
  }
});

module.exports = router;
