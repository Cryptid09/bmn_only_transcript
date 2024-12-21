require('dotenv').config();
const { Deepgram } = require('@deepgram/sdk');
const fs = require('fs').promises;
const path = require('path');

async function testDeepgramConnection() {
    try {
        console.log('Testing Deepgram Connection');
        console.log('-------------------------');
        console.log('API Key:', process.env.DEEPGRAM_API_KEY ? '✓ Present' : '✗ Missing');
        
        const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
        
        // Test the connection by getting the API key info
        const keyResponse = await deepgram.keys.list();
        console.log('API Connection:', '✓ Successful');
        console.log('-------------------------\n');
        return true;
    } catch (error) {
        console.error('API Connection: ✗ Failed');
        console.error('Error:', error.message);
        console.log('-------------------------\n');
        return false;
    }
}

async function testTranscriptionFunction() {
    try {
        console.log('Testing Transcription Function');
        console.log('-------------------------');
        
        const deepgram = new Deepgram(process.env.DEEPGRAM_API_KEY);
        
        // Test with a small audio buffer (1 second of silence)
        const sampleRate = 16000;
        const duration = 1; // seconds
        const audioBuffer = Buffer.alloc(sampleRate * duration * 2); // 16-bit audio
        
        const source = {
            buffer: audioBuffer,
            mimetype: 'audio/wav',
        };

        console.log('Sending test audio to Deepgram...');
        const response = await deepgram.transcription.preRecorded(source, {
            smart_format: true,
            punctuate: true,
            language: 'en',
        });

        console.log('Transcription Response:', '✓ Received');
        console.log('Response Structure:', response.results ? '✓ Valid' : '✗ Invalid');
        console.log('-------------------------\n');
        return true;
    } catch (error) {
        console.error('Transcription Test: ✗ Failed');
        console.error('Error:', error.message);
        console.log('-------------------------\n');
        return false;
    }
}

async function runTests() {
    console.log('Starting Deepgram Integration Tests\n');
    
    const connectionSuccess = await testDeepgramConnection();
    if (!connectionSuccess) {
        console.log('❌ Connection test failed. Stopping further tests.');
        return;
    }
    
    const transcriptionSuccess = await testTranscriptionFunction();
    if (!transcriptionSuccess) {
        console.log('❌ Transcription test failed.');
        return;
    }
    
    console.log('✅ All tests completed successfully!');
}

runTests().catch(console.error);
