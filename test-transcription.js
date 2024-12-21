require('dotenv').config();
const { Deepgram } = require('@deepgram/sdk');
const fs = require('fs').promises;
const path = require('path');

// Initialize Deepgram with your API key
const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);

async function testTranscription(audioFilePath) {
    try {
        console.log('Reading audio file...');
        const audioFile = {
            buffer: await fs.readFile(audioFilePath),
            mimetype: 'audio/mp3'
        };

        console.log('Sending to Deepgram...');
        console.log('Using API Key:', process.env.DEEPGRAM_API_KEY);

        const response = await deepgram.transcription.preRecorded(audioFile, {
            smart_format: true,
            punctuate: true,
            language: 'en',
        });

        console.log('\nTranscription Result:');
        console.log('-------------------');
        console.log(response.results.channels[0].alternatives[0].transcript);
        console.log('\nTranscription Metadata:');
        console.log('-------------------');
        console.log('Duration:', response.metadata.duration, 'seconds');
        console.log('Channels:', response.metadata.channels);
        console.log('Model:', response.metadata.model_info.name);

    } catch (error) {
        console.error('Error during transcription:');
        console.error(error);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
    }
}

// Check if file path is provided
const audioFilePath = process.argv[2];
if (!audioFilePath) {
    console.error('Please provide the path to an MP3 file');
    console.error('Usage: node test-transcription.js path/to/audio.mp3');
    process.exit(1);
}

// Run the test
console.log(`Testing transcription with file: ${audioFilePath}`);
testTranscription(audioFilePath);
